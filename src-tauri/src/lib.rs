mod commands;

use std::path::{Path, PathBuf};
use tauri::Manager;

const DESKTOP_ENV_FILE: &str = "backend.env";

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

fn spawn_embedded_backend(app_data_dir: PathBuf) {
    std::thread::spawn(move || {
        load_desktop_environment(&app_data_dir);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            spawn_embedded_backend(app_data_dir);

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
        .invoke_handler(tauri::generate_handler![commands::open_claude_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{desktop_env_candidates, DESKTOP_ENV_FILE};
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
}
