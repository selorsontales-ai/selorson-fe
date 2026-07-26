//! Locating the Node runtime and sidecar scripts the desktop bundle ships.
//!
//! A packaged app must drive Claude on a host that has never had Node
//! installed, so the installer carries its own runtime and the sidecar is
//! resolved from the bundle's resource directory. Falling back to a Node on
//! `PATH` stays a development convenience and is compiled out of a release.

use std::path::{Path, PathBuf};
use tauri::Manager;

const NODE_BINARY: &str = if cfg!(windows) { "node.exe" } else { "node" };
const RUNTIME_DIR: &str = "sidecar-runtime";
const SIDECAR_DIR: &str = "sidecar";
const SIDECAR_ENTRYPOINT: &str = "runner.mjs";

/// A resolved Node runtime paired with the sidecar entrypoint it runs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SidecarRuntime {
    node: PathBuf,
    entrypoint: PathBuf,
}

impl SidecarRuntime {
    pub fn for_app(app: &tauri::AppHandle) -> Result<Self, String> {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| format!("Desktop resource directory is unavailable: {error}"))?;
        Self::resolve(&resource_dir)
    }

    fn resolve(resource_dir: &Path) -> Result<Self, String> {
        let candidates = runtime_candidates(resource_dir, development_manifest_dir());
        select(&candidates, |path| path.is_file(), cfg!(debug_assertions))
    }

    pub fn node(&self) -> &Path {
        &self.node
    }

    pub fn entrypoint(&self) -> &Path {
        &self.entrypoint
    }
}

/// One place the sidecar may live: a Node runtime next to the scripts it runs.
#[derive(Clone, Debug, PartialEq, Eq)]
struct RuntimeCandidate {
    node: PathBuf,
    entrypoint: PathBuf,
}

impl RuntimeCandidate {
    fn rooted_at(root: &Path) -> Self {
        Self {
            node: root.join(RUNTIME_DIR).join(NODE_BINARY),
            entrypoint: root.join(SIDECAR_DIR).join(SIDECAR_ENTRYPOINT),
        }
    }
}

/// The bundle is always tried first so a packaged app never reaches for a Node
/// the host happens to have.
fn runtime_candidates(
    resource_dir: &Path,
    dev_manifest_dir: Option<&Path>,
) -> Vec<RuntimeCandidate> {
    let mut candidates = vec![RuntimeCandidate::rooted_at(resource_dir)];

    if let Some(manifest_dir) = dev_manifest_dir {
        candidates.push(RuntimeCandidate::rooted_at(manifest_dir));
    }

    candidates
}

#[cfg(debug_assertions)]
fn development_manifest_dir() -> Option<&'static Path> {
    Some(Path::new(env!("CARGO_MANIFEST_DIR")))
}

#[cfg(not(debug_assertions))]
fn development_manifest_dir() -> Option<&'static Path> {
    None
}

fn select<F>(
    candidates: &[RuntimeCandidate],
    exists: F,
    allow_path_node: bool,
) -> Result<SidecarRuntime, String>
where
    F: Fn(&Path) -> bool,
{
    if let Some(complete) = candidates
        .iter()
        .find(|candidate| exists(&candidate.node) && exists(&candidate.entrypoint))
    {
        return Ok(SidecarRuntime {
            node: complete.node.clone(),
            entrypoint: complete.entrypoint.clone(),
        });
    }

    // Development only: a workspace checkout may not have staged a runtime yet.
    if allow_path_node {
        if let Some(candidate) = candidates
            .iter()
            .find(|candidate| exists(&candidate.entrypoint))
        {
            return Ok(SidecarRuntime {
                node: PathBuf::from(NODE_BINARY),
                entrypoint: candidate.entrypoint.clone(),
            });
        }
    }

    Err(format!(
        "Bundled Node sidecar runtime is missing. Expected {} and {}",
        candidates
            .first()
            .map(|candidate| candidate.node.display().to_string())
            .unwrap_or_default(),
        candidates
            .first()
            .map(|candidate| candidate.entrypoint.display().to_string())
            .unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    fn resources() -> PathBuf {
        PathBuf::from("C:/Program Files/Selorson/resources")
    }

    fn workspace() -> PathBuf {
        PathBuf::from("E:/Selorson/frontend-v3/src-tauri")
    }

    fn bundled() -> RuntimeCandidate {
        RuntimeCandidate::rooted_at(&resources())
    }

    #[test]
    fn a_release_looks_only_inside_its_own_bundle() {
        let candidates = runtime_candidates(&resources(), None);

        assert_eq!(candidates, vec![bundled()]);
        assert_eq!(
            candidates[0].node,
            resources().join(RUNTIME_DIR).join(NODE_BINARY)
        );
        assert_eq!(
            candidates[0].entrypoint,
            resources().join(SIDECAR_DIR).join(SIDECAR_ENTRYPOINT)
        );
    }

    #[test]
    fn development_may_also_use_the_workspace_checkout() {
        let candidates = runtime_candidates(&resources(), Some(&workspace()));

        assert_eq!(
            candidates,
            vec![bundled(), RuntimeCandidate::rooted_at(&workspace())]
        );
    }

    #[test]
    fn the_bundled_runtime_wins_over_the_workspace_one() {
        let candidates = runtime_candidates(&resources(), Some(&workspace()));

        let resolved = select(&candidates, |_| true, true).unwrap();

        assert_eq!(resolved.node(), bundled().node);
        assert_eq!(resolved.entrypoint(), bundled().entrypoint);
    }

    #[test]
    fn a_release_without_a_bundled_runtime_fails_instead_of_using_the_host_node() {
        let candidates = runtime_candidates(&resources(), None);
        let entrypoint_only = |path: &Path| path == candidates[0].entrypoint;

        let error = select(&candidates, entrypoint_only, false).unwrap_err();

        assert!(error.contains("Bundled Node sidecar runtime is missing"));
        assert!(error.contains(NODE_BINARY));
    }

    #[test]
    fn every_repo_owned_sidecar_script_is_declared_as_a_bundle_resource() {
        // A script that ships in the repository but not in the bundle would
        // only fail on a host without a developer checkout.
        let config: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(manifest_dir().join("tauri.conf.json")).unwrap(),
        )
        .unwrap();
        let declared: Vec<&str> = config["bundle"]["resources"]
            .as_array()
            .expect("bundle.resources must be declared")
            .iter()
            .map(|entry| entry.as_str().expect("resource entries are strings"))
            .collect();

        for required in [
            "sidecar-runtime/node.exe",
            "sidecar-runtime/runtime.json",
            "sidecar/package.json",
            "sidecar/node_modules/**/*",
        ] {
            assert!(declared.contains(&required), "{required} is not bundled");
        }

        let scripts = std::fs::read_dir(manifest_dir().join(SIDECAR_DIR))
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".mjs") && !name.ends_with(".test.mjs"));
        for script in scripts {
            let resource = format!("{SIDECAR_DIR}/{script}");
            assert!(
                declared.contains(&resource.as_str()),
                "{resource} is not bundled"
            );
        }
    }

    #[test]
    fn the_staged_runtime_matches_the_path_the_bundle_resolves() {
        // The prepare script and the resolver must agree on the layout, or the
        // installer ships a runtime the app cannot find.
        let staged = RuntimeCandidate::rooted_at(&manifest_dir());

        assert_eq!(
            staged.node,
            manifest_dir().join(RUNTIME_DIR).join(NODE_BINARY)
        );
        assert!(
            staged.entrypoint.is_file(),
            "the repository-owned sidecar entrypoint is missing"
        );
    }

    #[test]
    fn development_falls_back_to_a_node_on_path() {
        let candidates = runtime_candidates(&resources(), Some(&workspace()));
        let workspace_entrypoint = RuntimeCandidate::rooted_at(&workspace()).entrypoint;
        let entrypoint_only = {
            let expected = workspace_entrypoint.clone();
            move |path: &Path| path == expected
        };

        let resolved = select(&candidates, entrypoint_only, true).unwrap();

        assert_eq!(resolved.node(), Path::new(NODE_BINARY));
        assert_eq!(resolved.entrypoint(), workspace_entrypoint);
    }
}
