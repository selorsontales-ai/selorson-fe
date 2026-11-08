#[cfg(not(selorson_desktop_user))]
mod data_mode;

#[cfg(not(selorson_desktop_user))]
use data_mode::{DataMode, DataModeStatus};
#[cfg(not(selorson_desktop_user))]
use std::path::{Path, PathBuf};
#[cfg(not(selorson_desktop_user))]
use tauri::Manager;

#[cfg(not(selorson_desktop_user))]
fn desktop_env_candidates(
    app_data_dir: &Path,
    mode: DataMode,
    dev_manifest_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = vec![data_mode::env_path(app_data_dir, mode)];

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
    let mut status = data_mode::resolve(app_data_dir);

    if status.fell_back {
        eprintln!(
            "Production data was requested but {} does not exist. Running against local data.",
            data_mode::env_path(app_data_dir, DataMode::Production).display()
        );
    }

    let candidates = desktop_env_candidates(app_data_dir, status.mode, development_manifest_dir());
    match candidates.iter().find(|path| path.is_file()) {
        Some(path) => {
            if let Err(error) = dotenvy::from_path_override(path) {
                eprintln!(
                    "Failed to load desktop backend configuration from {}: {error}",
                    path.display()
                );
            }
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
            status.config_loaded = true;
        }
        None => {
            let expected = data_mode::env_path(app_data_dir, status.mode);
            eprintln!(
                "Desktop backend configuration not found. Expected {}",
                expected.display()
            );
            status.config_problem = Some(format!(
                "Không tìm thấy tệp cấu hình:\n{}",
                expected.display()
            ));
        }
    }

    std::env::set_var(
        "SELORSON_BACKGROUND_WORKERS",
        match status.mode {
            DataMode::Production => "off",
            DataMode::Local => "on",
        },
    );

    std::env::set_var(
        "SELORSON_CACHE_NAMESPACE",
        match status.mode {
            DataMode::Production => "",
            DataMode::Local => "desktop-local",
        },
    );

    isolate_local_mode(status.mode);
    sync_portable_postgres(status.mode);

    status
}

#[cfg(all(not(selorson_desktop_user), target_os = "windows"))]
fn sync_portable_postgres(mode: DataMode) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let pg_root = std::env::var("SELORSON_PORTABLE_PG_DIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"E:\PostgreSQL\pgsql"));
    let pg_ctl = pg_root.join(r"bin\pg_ctl.exe");
    let pg_data = pg_root.join("data");
    let pg_log = pg_root.join("logfile.log");
    if !pg_ctl.is_file() || !pg_data.is_dir() {
        return;
    }

    let is_running = std::process::Command::new(&pg_ctl)
        .args(["status", "-D"])
        .arg(&pg_data)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .is_ok_and(|s| s.success());

    match mode {
        DataMode::Local => {
            if !is_running {
                let _ = std::process::Command::new(&pg_ctl)
                    .args(["start", "-D"])
                    .arg(&pg_data)
                    .arg("-l")
                    .arg(&pg_log)
                    .arg("-w")
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
        }
        DataMode::Production => {
            if is_running {
                let _ = std::process::Command::new(&pg_ctl)
                    .args(["stop", "-D"])
                    .arg(&pg_data)
                    .args(["-m", "fast"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
        }
    }
}

#[cfg(all(not(selorson_desktop_user), not(target_os = "windows")))]
fn sync_portable_postgres(_mode: DataMode) {}

#[cfg(not(selorson_desktop_user))]
fn isolate_local_mode(mode: DataMode) {
    if mode != DataMode::Local {
        std::env::remove_var("SELORSON_STORAGE_PREFIX");
        return;
    }

    std::env::set_var("SELORSON_STORAGE_PREFIX", "desktop-local");

    for key in ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"] {
        std::env::remove_var(key);
    }

    if let Ok(secret) = std::env::var("JWT_SECRET") {
        std::env::set_var("JWT_SECRET", format!("{secret}::desktop-local"));
    }
}

#[cfg(not(selorson_desktop_user))]
fn spawn_embedded_backend() {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            std::env::set_var("SELORSON_RUNTIME_TARGET", "desktop");
            std::env::set_var("JWT_EXPIRY_MINUTES", "43200");
            selorson_backend::start_server().await;
        });
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

#[cfg(not(selorson_desktop_user))]
#[tauri::command]
fn desktop_data_mode(status: tauri::State<'_, DataModeStatus>) -> DataModeStatus {
    status.inner().clone()
}

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

    sync_portable_postgres(mode);

    app.restart();
}

#[cfg(not(selorson_desktop_user))]
fn run_admin() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(load_desktop_environment(&app_data_dir));
            spawn_embedded_backend();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_data_mode,
            desktop_set_data_mode
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
    use super::desktop_env_candidates;
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
}
