use crate::claude_webview::{ClaudeWindowHealth, ClaudeWindowInfo, ClaudeWindowManager};

#[tauri::command]
pub async fn open_claude_window(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ClaudeWindowManager>,
    account_id: i64,
    account_name: String,
) -> Result<ClaudeWindowInfo, String> {
    manager.open(app, account_id, account_name).await
}

#[tauri::command]
pub async fn claude_window_health(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ClaudeWindowManager>,
    account_id: i64,
) -> Result<ClaudeWindowHealth, String> {
    manager.health(app, account_id).await
}
