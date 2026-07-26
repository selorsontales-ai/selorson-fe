mod account_rotation;
mod artifact_sidecar;
mod claude_webview;
mod commands;
pub mod runner_supervisor;

use claude_webview::ClaudeWindowManager;
use runner_supervisor::RunnerSupervisor;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

const DESKTOP_ENV_FILE: &str = "backend.env";
const DEFAULT_BACKEND_PORT: &str = "8001";
/// The embedded backend starts alongside the shell, so recovery waits for it
/// instead of failing on the first attempt.
const RECOVERY_ATTEMPTS: usize = 30;
const RECOVERY_RETRY_INTERVAL: Duration = Duration::from_secs(2);

fn desktop_env_candidates(app_data_dir: &Path, dev_manifest_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = vec![app_data_dir.join(DESKTOP_ENV_FILE)];

    if let Some(manifest_dir) = dev_manifest_dir {
        candidates.push(manifest_dir.join("../../backend-v3/.env"));
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

fn load_desktop_environment(app_data_dir: &Path) {
    let candidates = desktop_env_candidates(app_data_dir, development_manifest_dir());

    if let Some(path) = candidates.iter().find(|path| path.is_file()) {
        if let Err(error) = dotenvy::from_path(path) {
            eprintln!(
                "Failed to load desktop backend configuration from {}: {error}",
                path.display()
            );
        }
        return;
    }

    eprintln!(
        "Desktop backend configuration not found. Expected {}",
        app_data_dir.join(DESKTOP_ENV_FILE).display()
    );
}

fn desktop_backend_origin(port: &str) -> Result<String, String> {
    let port = port
        .parse::<u16>()
        .map_err(|_| "Desktop backend PORT must be an unsigned 16-bit integer".to_string())?;
    Ok(format!("http://127.0.0.1:{port}"))
}

fn spawn_embedded_backend() {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            // Desktop capabilities are resolved centrally by the embedded backend.
            std::env::set_var("SELORSON_RUNTIME_TARGET", "desktop");
            // Force Co-Writer to be enabled in Desktop app.
            std::env::set_var("ENABLE_CO_WRITER", "true");
            // Keep login session alive for 30 days (desktop-only, not for production).
            std::env::set_var("JWT_EXPIRY_MINUTES", "43200");
            selorson_backend::start_server().await;
        });
    });
}

/// Return jobs whose lease died with the previous desktop session to a
/// resumable state, so a restart continues checkpointed work instead of
/// stranding it.
fn spawn_startup_recovery(supervisor: RunnerSupervisor) {
    tauri::async_runtime::spawn(async move {
        for _ in 0..RECOVERY_ATTEMPTS {
            tokio::time::sleep(RECOVERY_RETRY_INTERVAL).await;
            match supervisor.recover().await {
                Ok(0) => return,
                Ok(recovered) => {
                    eprintln!("Recovered {recovered} runner job(s) from the previous session");
                    return;
                }
                // The embedded backend is not listening yet.
                Err(_) => continue,
            }
        }
        eprintln!("Runner job recovery skipped: the embedded backend did not answer");
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ClaudeWindowManager::default())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            load_desktop_environment(&app_data_dir);
            let backend_origin = desktop_backend_origin(
                &std::env::var("PORT").unwrap_or_else(|_| DEFAULT_BACKEND_PORT.to_string()),
            )
            .map_err(std::io::Error::other)?;
            let runner_supervisor =
                RunnerSupervisor::new(&backend_origin).map_err(std::io::Error::other)?;
            runner_supervisor.install_backend_token();
            app.manage(runner_supervisor.clone());
            spawn_embedded_backend();
            spawn_startup_recovery(runner_supervisor);

            /*
            if cfg!(debug_assertions) {
              app.handle().plugin(
                tauri_plugin_log::Builder::default()
                  .level(log::LevelFilter::Info)
                  .build(),
              )?;
            }
            */
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_claude_window,
            commands::claude_window_health,
            commands::runner_lease_next,
            commands::runner_start_sidecar,
            commands::runner_run_job,
            commands::runner_accounts,
            commands::runner_resume_job,
            commands::runner_recover_jobs,
            commands::runner_heartbeat,
            commands::runner_transition,
            commands::runner_record_event,
            commands::runner_checkpoint,
            commands::runner_complete,
            commands::runner_cancel,
            commands::runner_job_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{desktop_backend_origin, desktop_env_candidates, DESKTOP_ENV_FILE};
    use std::path::Path;

    #[test]
    fn release_uses_only_app_data_configuration() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");

        let candidates = desktop_env_candidates(app_data_dir, None);

        assert_eq!(candidates, vec![app_data_dir.join(DESKTOP_ENV_FILE)]);
    }

    #[test]
    fn development_falls_back_to_workspace_configuration() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");
        let manifest_dir = Path::new("D:/work/selorson/frontend-v3/src-tauri");

        let candidates = desktop_env_candidates(app_data_dir, Some(manifest_dir));

        assert_eq!(
            candidates,
            vec![
                app_data_dir.join(DESKTOP_ENV_FILE),
                manifest_dir.join("../../backend-v3/.env"),
            ]
        );
    }

    #[test]
    fn desktop_backend_bridge_is_loopback_only() {
        assert_eq!(
            desktop_backend_origin("8001").unwrap(),
            "http://127.0.0.1:8001"
        );
        assert!(desktop_backend_origin("not-a-port").is_err());
    }
}
