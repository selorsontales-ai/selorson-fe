mod commands;

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
