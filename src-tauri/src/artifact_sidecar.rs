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
    /// Progress carried over from an earlier attempt. Present means the
    /// Artifact continues that work instead of drafting the chapter again.
    #[serde(skip_serializing_if = "Option::is_none")]
    checkpoint: Option<&'a Value>,
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

/// What the sidecar reported. A rate limit is the only outcome that may lead to
/// another account; everything else is either a result or a failure.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum SidecarOutcome {
    Completed(RunnerJob),
    RateLimited(RateLimitSignal),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSignal {
    pub account_id: i64,
    pub reset_at: Option<String>,
    pub reset_time: Option<String>,
    pub source: String,
}

pub async fn run(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    account_id: i64,
    cdp_port: u16,
) -> Result<SidecarOutcome, String> {
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
) -> Result<SidecarOutcome, String> {
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
    let checkpoint = parse_checkpoint(job_id, job.checkpoint_json.as_deref())?;

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
        checkpoint: checkpoint.as_ref(),
    };
    let mut request_bytes = serde_json::to_vec(&request)
        .map_err(|error| format!("Failed to serialize sidecar request: {error}"))?;
    request_bytes.push(b'\n');

    let mut command = Command::new(NODE_EXECUTABLE);
    command.arg(SIDECAR_ENTRYPOINT);
    let process = supervisor
        .run_process(job_id, &mut command, &request_bytes)
        .await?;
    apply_sidecar_output(supervisor, job_id, account_id, process).await
}

/// A checkpoint that cannot be parsed must not be silently dropped: continuing
/// without it would restart the chapter and produce a second draft.
fn parse_checkpoint(job_id: &str, checkpoint_json: Option<&str>) -> Result<Option<Value>, String> {
    let Some(raw) = checkpoint_json else {
        return Ok(None);
    };
    let checkpoint: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Runner job {job_id} checkpoint is invalid JSON: {error}"))?;
    if !checkpoint.is_object() {
        return Err(format!(
            "Runner job {job_id} checkpoint must be a JSON object"
        ));
    }
    Ok(Some(checkpoint))
}

async fn apply_sidecar_output(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    account_id: i64,
    process: ManagedProcessOutput,
) -> Result<SidecarOutcome, String> {
    let messages = parse_sidecar_messages(&process.stdout, job_id)?;
    let mut terminal_output = None;
    let mut rate_limit = None;
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
            "rate_limited" => {
                if rate_limit.is_some() {
                    return Err("Sidecar emitted more than one rate limit".to_string());
                }
                rate_limit = Some(rate_limit_signal(
                    account_id,
                    message
                        .payload
                        .ok_or_else(|| "Sidecar rate limit is missing payload".to_string())?,
                )?);
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
    if let Some(signal) = rate_limit {
        if terminal_output.is_some() {
            return Err("Sidecar reported both a result and a rate limit".to_string());
        }
        return Ok(SidecarOutcome::RateLimited(signal));
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
    supervisor
        .complete(job_id, output)
        .await
        .map(SidecarOutcome::Completed)
}

/// The account is the one this supervisor leased, never a value the sidecar
/// chose: a transport worker must not be able to park a different account.
fn rate_limit_signal(account_id: i64, payload: Value) -> Result<RateLimitSignal, String> {
    let string_field = |key: &str| {
        payload
            .get(key)
            .and_then(Value::as_str)
            .map(|value| value.chars().take(MAX_ERROR_CHARS).collect::<String>())
    };
    Ok(RateLimitSignal {
        account_id,
        reset_at: string_field("resetAt"),
        reset_time: string_field("resetTime"),
        source: string_field("source").unwrap_or_else(|| "unspecified".to_string()),
    })
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
    use super::{parse_checkpoint, parse_sidecar_messages, rate_limit_signal, SIDECAR_ENTRYPOINT};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn rate_limit_signals_carry_the_leased_account_not_the_reported_one() {
        let signal = rate_limit_signal(
            7,
            json!({
                "accountId": 99,
                "resetAt": "2026-07-26T15:00:00+07:00",
                "resetTime": "3:00 PM",
                "source": "bridge"
            }),
        )
        .unwrap();

        assert_eq!(signal.account_id, 7);
        assert_eq!(
            signal.reset_at.as_deref(),
            Some("2026-07-26T15:00:00+07:00")
        );
        assert_eq!(signal.source, "bridge");
    }

    #[test]
    fn a_rate_limit_without_a_reset_time_is_still_a_rate_limit() {
        let signal = rate_limit_signal(3, json!({ "source": "page_on_open" })).unwrap();

        assert_eq!(signal.account_id, 3);
        assert_eq!(signal.reset_at, None);
        assert_eq!(signal.reset_time, None);
    }

    #[test]
    fn an_unparsable_checkpoint_stops_the_attempt_instead_of_restarting_it() {
        assert!(parse_checkpoint("job-a", None).unwrap().is_none());
        assert!(parse_checkpoint("job-a", Some(r#"{"cursor":4}"#))
            .unwrap()
            .is_some());
        assert!(parse_checkpoint("job-a", Some("not json")).is_err());
        assert!(parse_checkpoint("job-a", Some("[1,2]")).is_err());
    }

    #[test]
    fn a_rate_limit_message_is_parsed_as_its_own_terminal_kind() {
        let stdout = r#"{"protocolVersion":1,"jobId":"job-a","kind":"rate_limited","payload":{"source":"bridge"}}"#;

        let messages = parse_sidecar_messages(stdout, "job-a").unwrap();

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].kind, "rate_limited");
    }

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
