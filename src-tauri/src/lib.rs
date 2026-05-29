#[tauri::command]
pub async fn open_claude_window(
    app: tauri::AppHandle,
    account_id: i64,
    account_name: String,
) -> Result<(), String> {
    use tauri::Manager;
    let label = format!("claude-account-{}", account_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let profile_dir = app_data_dir
        .join("claude-profiles")
        .join(format!("{}", account_id));
    std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::External("https://claude.ai".parse().unwrap())
    )
    .title(format!("Claude Chat — {}", account_name))
    .inner_size(1100.0, 800.0)
    .data_directory(profile_dir)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Spawn the Rust Axum backend on a separate thread
  std::thread::spawn(|| {
    // Load local env file explicitly for the desktop app (used for training)
    let _ = dotenvy::from_path("E:\\Selorson\\backend-v3\\.env");

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
      // Force Co-Writer to be enabled in Desktop app
      std::env::set_var("ENABLE_CO_WRITER", "true");
      // Keep login session alive for 30 days (desktop-only, not for production)
      std::env::set_var("JWT_EXPIRY_MINUTES", "43200");
      selorson_backend::start_server().await;
    });
  });

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![open_claude_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
