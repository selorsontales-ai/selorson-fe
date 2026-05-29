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
    .title(format!("Claude Chat - {}", account_name))
    .inner_size(1100.0, 800.0)
    .data_directory(profile_dir)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
