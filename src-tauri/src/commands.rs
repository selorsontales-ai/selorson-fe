use crate::claude_webview::{ClaudeWindowHealth, ClaudeWindowInfo, ClaudeWindowManager};
use crate::runner_supervisor::{RunnerJobSnapshot, RunnerSupervisor};
use selorson_backend::services::co_writer::workflow::{RunnerJob, RunnerJobEvent, RunnerJobState};
use serde_json::Value;

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

#[tauri::command]
pub async fn runner_lease_next(
    supervisor: tauri::State<'_, RunnerSupervisor>,
) -> Result<Option<RunnerJob>, String> {
    supervisor.lease_next().await
}

#[tauri::command]
pub async fn runner_heartbeat(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
) -> Result<RunnerJob, String> {
    supervisor.heartbeat(&job_id).await
}

#[tauri::command]
pub async fn runner_transition(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
    expected_state: RunnerJobState,
    next_state: RunnerJobState,
    account_id: Option<i64>,
    event_payload: Value,
) -> Result<RunnerJob, String> {
    supervisor
        .transition(
            &job_id,
            expected_state,
            next_state,
            account_id,
            event_payload,
        )
        .await
}

#[tauri::command]
pub async fn runner_record_event(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
    event_type: String,
    payload: Value,
) -> Result<RunnerJobEvent, String> {
    supervisor.record_event(&job_id, event_type, payload).await
}

#[tauri::command]
pub async fn runner_checkpoint(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
    checkpoint: Value,
) -> Result<RunnerJob, String> {
    supervisor.checkpoint(&job_id, checkpoint).await
}

#[tauri::command]
pub async fn runner_complete(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
    output: Value,
) -> Result<RunnerJob, String> {
    supervisor.complete(&job_id, output).await
}

#[tauri::command]
pub async fn runner_cancel(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
) -> Result<RunnerJob, String> {
    supervisor.cancel(&job_id).await
}

#[tauri::command]
pub async fn runner_job_snapshot(
    supervisor: tauri::State<'_, RunnerSupervisor>,
    job_id: String,
) -> Result<RunnerJobSnapshot, String> {
    supervisor.snapshot(&job_id).await
}
