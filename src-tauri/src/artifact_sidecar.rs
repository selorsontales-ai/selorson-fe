use crate::runner_supervisor::{ManagedProcessOutput, RunnerSupervisor};
use selorson_backend::services::co_writer::workflow::{RunnerJob, RunnerJobState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;

const SIDECAR_PROTOCOL_VERSION: u32 = 1;
const SIDECAR_ENTRYPOINT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/sidecar/runner.mjs");
const NODE_EXECUTABLE: &str = "node";
const MAX_ERROR_CHARS: usize = 1_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarRequest<'a> {
    protocol_version: u32,
    job_id: &'a str,
    tool_name: &'a str,
    tool_version: &'a str,
    cdp_endpoint: String,
    input: &'a Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarMessage {
    protocol_version: u32,
    job_id: String,
    kind: String,
    event_type: Option<String>,
    payload: Option<Value>,
    output: Option<Value>,
    error: Option<String>,
}

pub async fn run(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    account_id: i64,
    cdp_port: u16,
) -> Result<RunnerJob, String> {
    let result = run_inner(supervisor, job_id, account_id, cdp_port).await;
    if let Err(error) = result.as_ref() {
        mark_failed(supervisor, job_id, error).await;
    }
    result
}

async fn run_inner(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    account_id: i64,
    cdp_port: u16,
) -> Result<RunnerJob, String> {
    let job = supervisor.job(job_id).await?;
    if job.state != RunnerJobState::Leased.as_str() {
        return Err(format!(
            "Runner job {job_id} must be leased before starting the sidecar"
        ));
    }
    let input: Value = serde_json::from_str(&job.input_json)
        .map_err(|error| format!("Runner job {job_id} input is invalid JSON: {error}"))?;
    if !input.is_object() {
        return Err(format!("Runner job {job_id} input must be a JSON object"));
    }

    supervisor
        .transition(
            job_id,
            RunnerJobState::Leased,
            RunnerJobState::OpeningAccount,
            Some(account_id),
            json!({"sidecarProtocolVersion": SIDECAR_PROTOCOL_VERSION}),
        )
        .await?;
    supervisor
        .transition(
            job_id,
            RunnerJobState::OpeningAccount,
            RunnerJobState::ConnectingCdp,
            None,
            json!({"cdpPort": cdp_port}),
        )
        .await?;
    supervisor
        .transition(
            job_id,
            RunnerJobState::ConnectingCdp,
            RunnerJobState::Running,
            None,
            json!({"sidecarProtocolVersion": SIDECAR_PROTOCOL_VERSION}),
        )
        .await?;

    let request = SidecarRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        job_id,
        tool_name: &job.tool_name,
        tool_version: &job.tool_version,
        cdp_endpoint: format!("http://127.0.0.1:{cdp_port}"),
        input: &input,
    };
    let mut request_bytes = serde_json::to_vec(&request)
        .map_err(|error| format!("Failed to serialize sidecar request: {error}"))?;
    request_bytes.push(b'\n');

    let mut command = Command::new(NODE_EXECUTABLE);
    command.arg(SIDECAR_ENTRYPOINT);
    let process = supervisor
        .run_process(job_id, &mut command, &request_bytes)
        .await?;
    apply_sidecar_output(supervisor, job_id, process).await
}

async fn apply_sidecar_output(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    process: ManagedProcessOutput,
) -> Result<RunnerJob, String> {
    let messages = parse_sidecar_messages(&process.stdout, job_id)?;
    let mut terminal_output = None;
    let mut sidecar_error = None;

    for message in messages {
        match message.kind.as_str() {
            "event" => {
                let event_type = message
                    .event_type
                    .ok_or_else(|| "Sidecar event is missing eventType".to_string())?;
                supervisor
                    .record_event(
                        job_id,
                        event_type,
                        message.payload.unwrap_or_else(|| json!({})),
                    )
                    .await?;
            }
            "checkpoint" => {
                let checkpoint = message
                    .payload
                    .ok_or_else(|| "Sidecar checkpoint is missing payload".to_string())?;
                supervisor.checkpoint(job_id, checkpoint).await?;
            }
            "result" => {
                if terminal_output.is_some() {
                    return Err("Sidecar emitted more than one terminal result".to_string());
                }
                terminal_output = Some(
                    message
                        .output
                        .ok_or_else(|| "Sidecar result is missing output".to_string())?,
                );
            }
            "error" => {
                sidecar_error = Some(
                    message
                        .error
                        .unwrap_or_else(|| "Sidecar reported an unspecified error".to_string()),
                );
            }
            kind => return Err(format!("Sidecar emitted unknown message kind: {kind}")),
        }
    }

    if let Some(error) = sidecar_error {
        return Err(format!(
            "Playwright sidecar failed: {}",
            bounded_error(&error)
        ));
    }
    if !process.success {
        let detail = process.stderr.lines().next().unwrap_or("no stderr detail");
        return Err(format!(
            "Playwright sidecar exited unsuccessfully: {}",
            bounded_error(detail)
        ));
    }
    let output =
        terminal_output.ok_or_else(|| "Sidecar exited without a terminal result".to_string())?;
    supervisor.complete(job_id, output).await
}

fn parse_sidecar_messages(
    stdout: &str,
    expected_job_id: &str,
) -> Result<Vec<SidecarMessage>, String> {
    let mut messages = Vec::new();
    for (index, line) in stdout.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let message: SidecarMessage = serde_json::from_str(line)
            .map_err(|error| format!("Invalid sidecar message on line {}: {error}", index + 1))?;
        if message.protocol_version != SIDECAR_PROTOCOL_VERSION {
            return Err(format!(
                "Sidecar message used protocol version {}",
                message.protocol_version
            ));
        }
        if message.job_id != expected_job_id {
            return Err(format!(
                "Sidecar message job id {} did not match {}",
                message.job_id, expected_job_id
            ));
        }
        messages.push(message);
    }
    Ok(messages)
}

async fn mark_failed(supervisor: &RunnerSupervisor, job_id: &str, error: &str) {
    let Ok(snapshot) = supervisor.snapshot(job_id).await else {
        return;
    };
    let Ok(state) = RunnerJobState::parse(snapshot.state()) else {
        return;
    };
    if matches!(
        state,
        RunnerJobState::Leased
            | RunnerJobState::OpeningAccount
            | RunnerJobState::ConnectingCdp
            | RunnerJobState::Running
    ) {
        let _ = supervisor
            .transition(
                job_id,
                state,
                RunnerJobState::Failed,
                None,
                json!({
                    "code": "playwright_sidecar_failed",
                    "message": bounded_error(error)
                }),
            )
            .await;
    }
}

fn bounded_error(error: &str) -> String {
    error.chars().take(MAX_ERROR_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_sidecar_messages, SIDECAR_ENTRYPOINT};
    use std::path::Path;

    #[test]
    fn repo_owned_sidecar_entrypoint_exists() {
        assert!(Path::new(SIDECAR_ENTRYPOINT).is_file());
    }

    #[test]
    fn sidecar_parser_rejects_crossed_job_ids() {
        let stdout = r#"{"protocolVersion":1,"jobId":"job-b","kind":"result","output":{}}"#;
        let error = parse_sidecar_messages(stdout, "job-a").unwrap_err();
        assert!(error.contains("did not match"));
    }

    #[test]
    fn sidecar_parser_accepts_versioned_mock_result() {
        let stdout =
            r#"{"protocolVersion":1,"jobId":"job-a","kind":"result","output":{"ok":true}}"#;
        let messages = parse_sidecar_messages(stdout, "job-a").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].kind, "result");
    }
}
