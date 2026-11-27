#[cfg(not(selorson_desktop_user))]
mod data_mode;

#[cfg(not(selorson_desktop_user))]
use data_mode::{DataMode, DataModeStatus};
#[cfg(not(selorson_desktop_user))]
use std::path::{Path, PathBuf};
#[cfg(not(selorson_desktop_user))]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(not(selorson_desktop_user))]
use tauri::Manager;

/// Tracks whether THIS `Selorson Admin` process started portable PostgreSQL (`B3-03`),
/// so switching to Production mode never kills a shared PostgreSQL cluster already running on the host.
#[cfg(not(selorson_desktop_user))]
static PG_STARTED_BY_APP: AtomicBool = AtomicBool::new(false);

/// Set right before `app.restart()` into `DataMode::Local` so `RunEvent::Exit` keeps
/// portable PostgreSQL warm across a Local restart instead of stopping and restarting it.
#[cfg(not(selorson_desktop_user))]
static SUPPRESS_EXIT_PG_STOP: AtomicBool = AtomicBool::new(false);

#[cfg(not(selorson_desktop_user))]
const SCRUBBED_BACKEND_ENV_KEYS: &[&str] = &[
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "JWT_EXPIRY_MINUTES",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_KEY",
    "CLOUDINARY_SECRET",
    "CLOUDINARY_FOLDER",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_PUBLIC_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM_ADDRESS",
    "SMTP_FROM_NAME",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
    "SELORSON_STORAGE_PREFIX",
    "SELORSON_CACHE_NAMESPACE",
    "SELORSON_BACKGROUND_WORKERS",
];

#[cfg(not(selorson_desktop_user))]
fn scrub_backend_env_before_reload() {
    for key in SCRUBBED_BACKEND_ENV_KEYS {
        std::env::remove_var(key);
    }
}

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

    // B3-03: Scrub inherited Production/Local env vars before loading the selected `.env` file
    // so `app.restart()` can never leak cloud credentials into Local mode or stack `::desktop-local`.
    scrub_backend_env_before_reload();

    let candidates = desktop_env_candidates(app_data_dir, status.mode, development_manifest_dir());
    match candidates.iter().find(|path| path.is_file()) {
        Some(path) => match dotenvy::from_path_override(path) {
            Ok(()) => {
                let db_url = std::env::var("DATABASE_URL").unwrap_or_default();
                if db_url.trim().is_empty() {
                    status.config_loaded = false;
                    status.config_problem = Some(format!(
                        "Tệp cấu hình thiếu DATABASE_URL:\n{}",
                        path.display()
                    ));
                } else {
                    eprintln!(
                        "[mode] {} <- {} | database host: {}",
                        status.mode.as_str(),
                        path.display(),
                        db_url
                            .split('@')
                            .nth(1)
                            .and_then(|rest| rest.split('/').next().map(str::to_string))
                            .unwrap_or_else(|| "?".to_string())
                    );
                    status.config_loaded = true;
                }
            }
            Err(error) => {
                eprintln!(
                    "Failed to load desktop backend configuration from {}: {error}",
                    path.display()
                );
                status.config_loaded = false;
                status.config_problem = Some(format!(
                    "Không đọc được tệp cấu hình {}:\n{error}",
                    path.display()
                ));
            }
        },
        None => {
            let expected = data_mode::env_path(app_data_dir, status.mode);
            eprintln!(
                "Desktop backend configuration not found. Expected {}",
                expected.display()
            );
            status.config_loaded = false;
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

    status
}

#[cfg(all(not(selorson_desktop_user), target_os = "windows"))]
fn stop_owned_portable_postgres(wait_for_exit: bool) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    if !PG_STARTED_BY_APP.swap(false, Ordering::SeqCst) {
        return;
    }
    let pg_root = std::env::var("SELORSON_PORTABLE_PG_DIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"E:\PostgreSQL\pgsql"));
    let pg_ctl = pg_root.join(r"bin\pg_ctl.exe");
    let pg_data = pg_root.join("data");
    if !pg_ctl.is_file() || !pg_data.is_dir() {
        return;
    }
    let mut cmd = std::process::Command::new(&pg_ctl);
    cmd.args(["stop", "-D"])
        .arg(&pg_data)
        .args(["-m", "fast"])
        .creation_flags(CREATE_NO_WINDOW);
    if wait_for_exit {
        let _ = cmd.status();
    } else {
        let _ = cmd.spawn();
    }
}

#[cfg(all(not(selorson_desktop_user), not(target_os = "windows")))]
fn stop_owned_portable_postgres(_wait_for_exit: bool) {}

#[cfg(all(not(selorson_desktop_user), target_os = "windows"))]
fn allow_process_foreground(pid: u32) {
    #[link(name = "user32")]
    extern "system" {
        fn AllowSetForegroundWindow(dwProcessId: u32) -> i32;
    }
    // SAFETY: Standard Win32 user32 FFI call granting foreground activation rights to the restarted process.
    unsafe {
        let _ = AllowSetForegroundWindow(pid);
    }
}

#[cfg(all(not(selorson_desktop_user), not(target_os = "windows")))]
fn allow_process_foreground(_pid: u32) {}

#[cfg(not(selorson_desktop_user))]
fn present_window_foreground(win: &tauri::WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    let _ = win.set_always_on_top(false);
}

#[cfg(not(selorson_desktop_user))]
fn ensure_main_window_presented(app: &tauri::AppHandle, force_after_switch: bool) {
    if let Some(win) = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().values().next().cloned())
    {
        present_window_foreground(&win);
    }

    if force_after_switch {
        let handle = app.clone();
        std::thread::spawn(move || {
            for delay_ms in [120_u64, 280] {
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                let h2 = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Some(win) = h2
                        .get_webview_window("main")
                        .or_else(|| h2.webview_windows().values().next().cloned())
                    {
                        present_window_foreground(&win);
                    }
                });
            }
        });
    }
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

    match mode {
        DataMode::Local => {
            let is_running = std::process::Command::new(&pg_ctl)
                .args(["status", "-D"])
                .arg(&pg_data)
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .is_ok_and(|s| s.success());
            if !is_running {
                let started = std::process::Command::new(&pg_ctl)
                    .args(["start", "-D"])
                    .arg(&pg_data)
                    .arg("-l")
                    .arg(&pg_log)
                    .arg("-w")
                    .creation_flags(CREATE_NO_WINDOW)
                    .status()
                    .is_ok_and(|s| s.success());
                if started {
                    PG_STARTED_BY_APP.store(true, Ordering::SeqCst);
                }
            }
        }
        DataMode::Production => {
            // B3-03: Only stop portable PostgreSQL if THIS app instance started it;
            // never shut down a shared PostgreSQL cluster used by the host machine.
            stop_owned_portable_postgres(true);
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
        if !secret.ends_with("::desktop-local") {
            std::env::set_var("JWT_SECRET", format!("{secret}::desktop-local"));
        }
    }
}

#[cfg(not(selorson_desktop_user))]
fn spawn_embedded_backend(
    mode: DataMode,
    config: selorson_backend::Config,
    background_workers: bool,
) {
    std::thread::spawn(move || {
        // Start/stop portable PostgreSQL on the background worker thread rather than blocking
        // the Win32 UI thread inside `tauri::Builder::setup()`, so the window opens immediately
        // even if PostgreSQL needs WAL recovery after an ungraceful PC power-off.
        sync_portable_postgres(mode);

        let rt = tokio::runtime::Runtime::new().expect("failed to build embedded tokio runtime");
        rt.block_on(async move {
            selorson_backend::start_embedded_server(config, background_workers).await;
        });
    });
}

#[cfg(selorson_desktop_user)]
fn run_user() {
    tauri::Builder::default()
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
    // Grant foreground activation permission immediately while this window owns focus.
    allow_process_foreground(u32::MAX);

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

    SUPPRESS_EXIT_PG_STOP.store(true, Ordering::SeqCst);
    if mode == DataMode::Production {
        // Trigger fast PostgreSQL shutdown asynchronously so we do not delay the restart
        // or lose Windows foreground activation lock.
        stop_owned_portable_postgres(false);
    }

    // Spawn the new process directly so we can pass its exact PID to `AllowSetForegroundWindow`
    // before exiting, ensuring the restarted window pops up unminimized in the foreground.
    if let Ok(exe) = std::env::current_exe() {
        let args: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
        if let Ok(child) = std::process::Command::new(exe).args(args).spawn() {
            allow_process_foreground(child.id());
            std::process::exit(0);
        }
    }

    app.restart();
}

#[cfg(not(selorson_desktop_user))]
fn run_admin() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let status = load_desktop_environment(&app_data_dir);
            if status.config_loaded {
                std::env::set_var("SELORSON_RUNTIME_TARGET", "desktop");
                std::env::set_var("JWT_EXPIRY_MINUTES", "43200");
                let mut backend_cfg = selorson_backend::Config::from_env();
                backend_cfg.runtime = selorson_backend::runtime::RuntimeCapabilities::for_target(
                    selorson_backend::runtime::RuntimeTarget::Desktop,
                );
                let bg_workers = status.mode == DataMode::Local;
                spawn_embedded_backend(status.mode, backend_cfg, bg_workers);
            } else {
                sync_portable_postgres(DataMode::Production);
                eprintln!(
                    "Embedded backend skipped because configuration is invalid: {:?}",
                    status.config_problem
                );
            }
            let force_after_switch = status.switched;
            app.manage(status);
            ensure_main_window_presented(app.handle(), force_after_switch);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_data_mode,
            desktop_set_data_mode
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri admin application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if !SUPPRESS_EXIT_PG_STOP.load(Ordering::SeqCst) {
                sync_portable_postgres(DataMode::Production);
            }
        }
    });
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
    use super::{
        desktop_env_candidates, isolate_local_mode, scrub_backend_env_before_reload,
    };
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
    fn development_falls_back_to_workspace_backend_env_for_local_mode_only() {
        let app_data_dir = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");
        let manifest_dir = Path::new("E:/Selorson/frontend-v3/src-tauri");

        let local_candidates =
            desktop_env_candidates(app_data_dir, DataMode::Local, Some(manifest_dir));
        let production_candidates =
            desktop_env_candidates(app_data_dir, DataMode::Production, Some(manifest_dir));

        assert_eq!(
            local_candidates,
            vec![
                data_mode::env_path(app_data_dir, DataMode::Local),
                manifest_dir.join("../../backend-v3/.env")
            ]
        );
        assert_eq!(
            production_candidates,
            vec![data_mode::env_path(app_data_dir, DataMode::Production)]
        );
    }

    #[test]
    fn scrub_and_isolate_prevent_cross_mode_env_leakage_and_jwt_suffix_stacking() {
        std::env::set_var("CLOUDINARY_SECRET", "prod-cloud-secret");
        std::env::set_var("R2_SECRET_ACCESS_KEY", "prod-r2-secret");
        std::env::set_var("JWT_SECRET", "alpha-secret::desktop-local");

        scrub_backend_env_before_reload();
        assert!(std::env::var("CLOUDINARY_SECRET").is_err());
        assert!(std::env::var("R2_SECRET_ACCESS_KEY").is_err());
        assert!(std::env::var("JWT_SECRET").is_err());

        std::env::set_var("JWT_SECRET", "beta-secret");
        isolate_local_mode(DataMode::Local);
        isolate_local_mode(DataMode::Local);
        assert_eq!(
            std::env::var("JWT_SECRET").as_deref(),
            Ok("beta-secret::desktop-local")
        );
    }
}
