#[cfg(not(selorson_desktop_user))]
mod account_rotation;
#[cfg(not(selorson_desktop_user))]
mod artifact_sidecar;
#[cfg(not(selorson_desktop_user))]
mod claude_webview;
#[cfg(not(selorson_desktop_user))]
mod commands;
#[cfg(not(selorson_desktop_user))]
mod data_mode;
#[cfg(not(selorson_desktop_user))]
pub mod runner_supervisor;
#[cfg(not(selorson_desktop_user))]
mod sidecar_runtime;

#[cfg(not(selorson_desktop_user))]
use claude_webview::ClaudeWindowManager;
#[cfg(not(selorson_desktop_user))]
use data_mode::{DataMode, DataModeStatus};
#[cfg(not(selorson_desktop_user))]
use runner_supervisor::RunnerSupervisor;
#[cfg(not(selorson_desktop_user))]
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
#[cfg(not(selorson_desktop_user))]
use tauri::Manager;

#[cfg(not(selorson_desktop_user))]
const DEFAULT_BACKEND_PORT: &str = "8001";
/// The embedded backend starts alongside the shell, so recovery waits for it
/// instead of failing on the first attempt.
#[cfg(not(selorson_desktop_user))]
const RECOVERY_ATTEMPTS: usize = 30;
#[cfg(not(selorson_desktop_user))]
const RECOVERY_RETRY_INTERVAL: Duration = Duration::from_secs(2);

#[cfg(not(selorson_desktop_user))]
fn desktop_env_candidates(
    app_data_dir: &Path,
    mode: DataMode,
    dev_manifest_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = vec![data_mode::env_path(app_data_dir, mode)];

    // The workspace .env is a development convenience, and it points at the
    // developer's own PostgreSQL. That is exactly the file production mode must
    // never reach for, so the fallback exists only for local mode.
    if mode == DataMode::Local {
        if let Some(manifest_dir) = dev_manifest_dir {
            candidates.push(manifest_dir.join("../../backend-v3/.env"));
        }
    }

    candidates
}

#[cfg(all(not(selorson_desktop_user), debug_assertions))]
fn development_manifest_dir() -> Option<&'static Path> {
    Some(Path::new(env!("CARGO_MANIFEST_DIR")))
}

#[cfg(all(not(selorson_desktop_user), not(debug_assertions)))]
fn development_manifest_dir() -> Option<&'static Path> {
    None
}

#[cfg(not(selorson_desktop_user))]
fn load_desktop_environment(app_data_dir: &Path) -> DataModeStatus {
    let status = data_mode::resolve(app_data_dir);

    if status.fell_back {
        eprintln!(
            "Production data was requested but {} does not exist. Running against local data.",
            data_mode::env_path(app_data_dir, DataMode::Production).display()
        );
    }

    let candidates = desktop_env_candidates(app_data_dir, status.mode, development_manifest_dir());
    match candidates.iter().find(|path| path.is_file()) {
        Some(path) => {
            // Override, not merge. A restart inherits the previous process's
            // environment, so the values the old mode loaded are already set —
            // and a plain load leaves them in place, which silently keeps the
            // app on the database it was told to leave.
            if let Err(error) = dotenvy::from_path_override(path) {
                eprintln!(
                    "Failed to load desktop backend configuration from {}: {error}",
                    path.display()
                );
            }
            // Which configuration is in force, and where it points. Without
            // this the only way to tell the modes apart at runtime is to read
            // the data and infer.
            eprintln!(
                "[mode] {} <- {} | database host: {}",
                status.mode.as_str(),
                path.display(),
                std::env::var("DATABASE_URL")
                    .ok()
                    .and_then(|url| url.split('@').nth(1).map(|rest| {
                        rest.split('/').next().unwrap_or("?").to_string()
                    }))
                    .unwrap_or_else(|| "(unset)".to_string())
            );
        }
        None => eprintln!(
            "Desktop backend configuration not found. Expected {}",
            data_mode::env_path(app_data_dir, status.mode).display()
        ),
    }

    // Sending newsletters and pruning old messages belong to the deployment,
    // which is always running. This app is open only sometimes, so against
    // production data it stays a client and nothing more. Set either way: a
    // restart inherits the previous process's environment, and an "off" left
    // over from production mode would silently disable the workers in local.
    std::env::set_var(
        "SELORSON_BACKGROUND_WORKERS",
        match status.mode {
            DataMode::Production => "off",
            DataMode::Local => "on",
        },
    );

    // Scoped by database, not by instance. Production mode reads the same
    // database as the deployment, so it has to share the same cache entries and
    // the same channels: a support reply published under a private channel
    // would be saved correctly and never reach the reader waiting for it.
    // Local mode reads a different database, so it must share neither.
    std::env::set_var(
        "SELORSON_CACHE_NAMESPACE",
        match status.mode {
            DataMode::Production => "",
            DataMode::Local => "desktop-local",
        },
    );

    isolate_local_mode(status.mode);

    status
}

/// Sever everything local mode still shares with the live site.
///
/// Separating the database is not enough on its own: one Redis, one mail
/// account, one media bucket and one signing key serve every instance. Local
/// mode is meant to be a place where nothing done can reach a reader, so the
/// remaining shared resources are cut here rather than left to whoever edits
/// the configuration files. Production mode is left exactly as configured,
/// because there it is the same site and sharing is correct.
#[cfg(not(selorson_desktop_user))]
fn isolate_local_mode(mode: DataMode) {
    if mode != DataMode::Local {
        std::env::remove_var("SELORSON_STORAGE_PREFIX");
        return;
    }

    // Uploads land in their own folder rather than beside the files the live
    // site serves, where nothing would tell them apart afterwards.
    std::env::set_var("SELORSON_STORAGE_PREFIX", "desktop-local");

    // No mail account, so create_mailer falls back to the console sender and a
    // test newsletter is written to the log instead of to real subscribers.
    for key in ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"] {
        std::env::remove_var(key);
    }

    // A token signed here must not verify against the live site. Both modes
    // look users up by id, and the ids overlap: user 3 locally is a different
    // person from user 3 in production. Derived rather than configured, so the
    // separation cannot be lost by editing a file, and deterministic, so a
    // local session still survives a restart.
    if let Ok(secret) = std::env::var("JWT_SECRET") {
        std::env::set_var("JWT_SECRET", format!("{secret}::desktop-local"));
    }
}

#[cfg(not(selorson_desktop_user))]
fn desktop_backend_origin(port: &str) -> Result<String, String> {
    let port = port
        .parse::<u16>()
        .map_err(|_| "Desktop backend PORT must be an unsigned 16-bit integer".to_string())?;
    Ok(format!("http://127.0.0.1:{port}"))
}

#[cfg(not(selorson_desktop_user))]
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
#[cfg(not(selorson_desktop_user))]
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

#[cfg(selorson_desktop_user)]
fn run_user() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running Tauri user application");
}

/// The mode this process resolved at startup. Read once, never changes: the
/// connection pool it selected lives as long as the process does.
#[cfg(not(selorson_desktop_user))]
#[tauri::command]
fn desktop_data_mode(status: tauri::State<'_, DataModeStatus>) -> DataModeStatus {
    status.inner().clone()
}

/// Store a new choice and restart into it. Refused when production has no
/// configuration, so the app never restarts into a mode it cannot honour.
#[cfg(not(selorson_desktop_user))]
#[tauri::command]
fn desktop_set_data_mode(app: tauri::AppHandle, mode: DataMode) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Không đọc được thư mục dữ liệu ứng dụng: {error}"))?;

    if mode == DataMode::Production {
        let path = data_mode::env_path(&app_data_dir, DataMode::Production);
        if !path.is_file() {
            return Err(format!(
                "Chưa có cấu hình dữ liệu thật. Tạo tệp {} rồi thử lại.",
                path.display()
            ));
        }
    }

    data_mode::write_requested(&app_data_dir, mode)
        .map_err(|error| format!("Không ghi được lựa chọn chế độ: {error}"))?;

    app.restart();
}

#[cfg(not(selorson_desktop_user))]
fn run_admin() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ClaudeWindowManager::default())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(load_desktop_environment(&app_data_dir));
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
            desktop_data_mode,
            desktop_set_data_mode,
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
        .expect("error while running Tauri admin application");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(selorson_desktop_user)]
    run_user();

    #[cfg(not(selorson_desktop_user))]
    run_admin();
}

#[cfg(all(test, not(selorson_desktop_user)))]
mod tests {
    use super::data_mode::{self, DataMode};
    use super::{desktop_backend_origin, desktop_env_candidates};
    use std::path::Path;

    #[test]
    fn release_uses_only_app_data_configuration() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");

        let candidates = desktop_env_candidates(app_data_dir, DataMode::Local, None);

        assert_eq!(
            candidates,
            vec![data_mode::env_path(app_data_dir, DataMode::Local)]
        );
    }

    #[test]
    fn development_falls_back_to_workspace_configuration() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");
        let manifest_dir = Path::new("D:/work/selorson/frontend-v3/src-tauri");

        let candidates =
            desktop_env_candidates(app_data_dir, DataMode::Local, Some(manifest_dir));

        assert_eq!(
            candidates,
            vec![
                data_mode::env_path(app_data_dir, DataMode::Local),
                manifest_dir.join("../../backend-v3/.env"),
            ]
        );
    }

    #[test]
    fn production_never_falls_back_to_the_developer_database() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");
        let manifest_dir = Path::new("D:/work/selorson/frontend-v3/src-tauri");

        let candidates =
            desktop_env_candidates(app_data_dir, DataMode::Production, Some(manifest_dir));

        assert_eq!(
            candidates,
            vec![data_mode::env_path(app_data_dir, DataMode::Production)],
            "production must never resolve to the workspace .env"
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
