use rand::{rngs::OsRng, RngCore};
use reqwest::{Client, Method, Url};
use selorson_backend::{
    desktop_bridge::{DESKTOP_BRIDGE_TOKEN_ENV, DESKTOP_BRIDGE_TOKEN_HEADER},
    services::co_writer::workflow::{RunnerJob, RunnerJobEvent, RunnerJobState},
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, io, sync::Arc};
use tokio::{
    process::Child,
    sync::{Mutex, OwnedMutexGuard},
};

const TOKEN_BYTES: usize = 32;
const OWNER_BYTES: usize = 16;
const DEFAULT_LEASE_SECONDS: i64 = 60;

#[derive(Clone)]
struct RunnerBridgeClient {
    client: Client,
    base_url: Url,
    token: Arc<str>,
    lease_owner: Arc<str>,
}

#[derive(Deserialize)]
struct DataBody<T> {
    data: T,
}

#[derive(Deserialize)]
struct ErrorBody {
    code: Option<String>,
    message: Option<String>,
}

#[derive(Serialize)]
struct LeasePayload<'a> {
    lease_owner: &'a str,
    lease_seconds: i64,
}

#[derive(Serialize)]
struct OwnedPayload<'a> {
    lease_owner: &'a str,
}

#[derive(Serialize)]
struct TransitionPayload<'a> {
    lease_owner: &'a str,
    expected_state: RunnerJobState,
    next_state: RunnerJobState,
    account_id: Option<i64>,
    event_payload: &'a Value,
}

#[derive(Serialize)]
struct EventPayload<'a> {
    lease_owner: &'a str,
    event_type: &'a str,
    payload: &'a Value,
}

#[derive(Serialize)]
struct CheckpointPayload<'a> {
    lease_owner: &'a str,
    checkpoint: &'a Value,
}

#[derive(Serialize)]
struct CompletePayload<'a> {
    lease_owner: &'a str,
    output: &'a Value,
}

impl RunnerBridgeClient {
    fn new(base_url: &str) -> Result<Self, String> {
        let base_url = Url::parse(base_url)
            .map_err(|error| format!("Invalid embedded backend URL: {error}"))?;
        if base_url.scheme() != "http" || base_url.host_str() != Some("127.0.0.1") {
            return Err("Desktop runner bridge must use loopback HTTP".to_string());
        }

        Ok(Self {
            client: Client::new(),
            base_url,
            token: Arc::from(random_hex(TOKEN_BYTES)),
            lease_owner: Arc::from(format!("desktop-{}", random_hex(OWNER_BYTES))),
        })
    }

    fn install_backend_token(&self) {
        std::env::set_var(DESKTOP_BRIDGE_TOKEN_ENV, self.token.as_ref());
    }

    async fn lease_next(&self, lease_seconds: i64) -> Result<Option<RunnerJob>, String> {
        self.request(
            Method::POST,
            &["jobs", "lease"],
            Some(&LeasePayload {
                lease_owner: &self.lease_owner,
                lease_seconds,
            }),
        )
        .await
    }

    async fn heartbeat(&self, job_id: &str, lease_seconds: i64) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "heartbeat"],
            Some(&LeasePayload {
                lease_owner: &self.lease_owner,
                lease_seconds,
            }),
        )
        .await
    }

    async fn transition(
        &self,
        job_id: &str,
        expected_state: RunnerJobState,
        next_state: RunnerJobState,
        account_id: Option<i64>,
        event_payload: &Value,
    ) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "transition"],
            Some(&TransitionPayload {
                lease_owner: &self.lease_owner,
                expected_state,
                next_state,
                account_id,
                event_payload,
            }),
        )
        .await
    }

    async fn append_event(
        &self,
        job_id: &str,
        event_type: &str,
        payload: &Value,
    ) -> Result<RunnerJobEvent, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "events"],
            Some(&EventPayload {
                lease_owner: &self.lease_owner,
                event_type,
                payload,
            }),
        )
        .await
    }

    async fn checkpoint(&self, job_id: &str, checkpoint: &Value) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "checkpoint"],
            Some(&CheckpointPayload {
                lease_owner: &self.lease_owner,
                checkpoint,
            }),
        )
        .await
    }

    async fn complete(&self, job_id: &str, output: &Value) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "complete"],
            Some(&CompletePayload {
                lease_owner: &self.lease_owner,
                output,
            }),
        )
        .await
    }

    async fn cancel(&self, job_id: &str) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "cancel"],
            Some(&OwnedPayload {
                lease_owner: &self.lease_owner,
            }),
        )
        .await
    }

    async fn request<T, B>(
        &self,
        method: Method,
        path: &[&str],
        body: Option<&B>,
    ) -> Result<T, String>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let url = self.endpoint(path)?;
        let mut request = self
            .client
            .request(method, url)
            .header(DESKTOP_BRIDGE_TOKEN_HEADER, self.token.as_ref());
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request
            .send()
            .await
            .map_err(|error| format!("Desktop runner bridge request failed: {error}"))?;
        let status = response.status();
        if status.is_success() {
            return response
                .json::<DataBody<T>>()
                .await
                .map(|body| body.data)
                .map_err(|error| format!("Invalid desktop runner bridge response: {error}"));
        }

        let fallback = format!("Desktop runner bridge returned {status}");
        let error = response.json::<ErrorBody>().await.ok();
        Err(error
            .and_then(|body| {
                let message = body.message?;
                Some(match body.code {
                    Some(code) => format!("{code}: {message}"),
                    None => message,
                })
            })
            .unwrap_or(fallback))
    }

    fn endpoint(&self, path: &[&str]) -> Result<Url, String> {
        let mut url = self.base_url.clone();
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| "Embedded backend URL cannot be a base URL".to_string())?;
            segments.clear();
            segments.extend(["api", "v1", "desktop", "runner"]);
            segments.extend(path.iter().copied());
        }
        Ok(url)
    }
}

trait ManagedProcess: Send {
    fn id(&self) -> Option<u32>;
    fn terminate(&mut self) -> io::Result<()>;
}

impl ManagedProcess for Child {
    fn id(&self) -> Option<u32> {
        Child::id(self)
    }

    fn terminate(&mut self) -> io::Result<()> {
        self.start_kill()
    }
}

struct RunnerExecution {
    state: String,
    events: Vec<RunnerSupervisorEvent>,
    checkpoint: Option<Value>,
    result: Option<Value>,
    process: Option<Box<dyn ManagedProcess>>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunnerSupervisorEvent {
    event_type: String,
    payload: Value,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunnerJobSnapshot {
    job_id: String,
    state: String,
    events: Vec<RunnerSupervisorEvent>,
    checkpoint: Option<Value>,
    result: Option<Value>,
    process_id: Option<u32>,
}

#[derive(Clone)]
pub struct RunnerSupervisor {
    bridge: RunnerBridgeClient,
    jobs: Arc<Mutex<HashMap<String, RunnerExecution>>>,
    browser_lock: Arc<Mutex<()>>,
}

impl RunnerSupervisor {
    pub fn new(base_url: &str) -> Result<Self, String> {
        Ok(Self {
            bridge: RunnerBridgeClient::new(base_url)?,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            browser_lock: Arc::new(Mutex::new(())),
        })
    }

    pub fn install_backend_token(&self) {
        self.bridge.install_backend_token();
    }

    pub async fn acquire_browser(&self) -> OwnedMutexGuard<()> {
        self.browser_lock.clone().lock_owned().await
    }

    pub async fn lease_next(&self) -> Result<Option<RunnerJob>, String> {
        let job = self.bridge.lease_next(DEFAULT_LEASE_SECONDS).await?;
        if let Some(job) = job.as_ref() {
            self.register_job(job).await?;
        }
        Ok(job)
    }

    pub async fn heartbeat(&self, job_id: &str) -> Result<RunnerJob, String> {
        let job = self.bridge.heartbeat(job_id, DEFAULT_LEASE_SECONDS).await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    pub async fn transition(
        &self,
        job_id: &str,
        expected_state: RunnerJobState,
        next_state: RunnerJobState,
        account_id: Option<i64>,
        event_payload: Value,
    ) -> Result<RunnerJob, String> {
        self.require_job(job_id).await?;
        let job = self
            .bridge
            .transition(
                job_id,
                expected_state,
                next_state,
                account_id,
                &event_payload,
            )
            .await?;
        self.record_local_event(job_id, job.state.clone(), event_payload)
            .await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    pub async fn record_event(
        &self,
        job_id: &str,
        event_type: String,
        payload: Value,
    ) -> Result<RunnerJobEvent, String> {
        self.require_job(job_id).await?;
        let event = self
            .bridge
            .append_event(job_id, &event_type, &payload)
            .await?;
        self.record_local_event(job_id, event_type, payload).await?;
        Ok(event)
    }

    pub async fn checkpoint(&self, job_id: &str, checkpoint: Value) -> Result<RunnerJob, String> {
        self.require_job(job_id).await?;
        let job = self.bridge.checkpoint(job_id, &checkpoint).await?;
        self.set_local_checkpoint(job_id, checkpoint).await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    pub async fn complete(&self, job_id: &str, output: Value) -> Result<RunnerJob, String> {
        self.require_job(job_id).await?;
        let job = self.bridge.complete(job_id, &output).await?;
        self.set_local_result(job_id, output).await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    pub async fn cancel(&self, job_id: &str) -> Result<RunnerJob, String> {
        self.cancel_local(job_id).await?;
        let job = self.bridge.cancel(job_id).await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    pub async fn snapshot(&self, job_id: &str) -> Result<RunnerJobSnapshot, String> {
        let jobs = self.jobs.lock().await;
        let execution = jobs
            .get(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        Ok(snapshot(job_id, execution))
    }

    pub async fn attach_process(&self, job_id: &str, process: Child) -> Result<(), String> {
        self.attach_managed_process(job_id, Box::new(process)).await
    }

    async fn register_job(&self, job: &RunnerJob) -> Result<(), String> {
        validate_job_id(&job.job_id)?;
        let mut jobs = self.jobs.lock().await;
        match jobs.get_mut(&job.job_id) {
            Some(execution) => execution.state.clone_from(&job.state),
            None => {
                jobs.insert(
                    job.job_id.clone(),
                    RunnerExecution {
                        state: job.state.clone(),
                        events: Vec::new(),
                        checkpoint: job
                            .checkpoint_json
                            .as_deref()
                            .and_then(|json| serde_json::from_str(json).ok()),
                        result: job
                            .output_json
                            .as_deref()
                            .and_then(|json| serde_json::from_str(json).ok()),
                        process: None,
                    },
                );
            }
        }
        Ok(())
    }

    async fn require_job(&self, job_id: &str) -> Result<(), String> {
        validate_job_id(job_id)?;
        if self.jobs.lock().await.contains_key(job_id) {
            Ok(())
        } else {
            Err(format!(
                "Runner job {job_id} is not registered in this supervisor"
            ))
        }
    }

    async fn update_state(&self, job_id: &str, state: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        execution.state = state.to_string();
        Ok(())
    }

    async fn record_local_event(
        &self,
        job_id: &str,
        event_type: String,
        payload: Value,
    ) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        execution.events.push(RunnerSupervisorEvent {
            event_type,
            payload,
        });
        Ok(())
    }

    async fn set_local_checkpoint(&self, job_id: &str, checkpoint: Value) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        execution.checkpoint = Some(checkpoint);
        Ok(())
    }

    async fn set_local_result(&self, job_id: &str, result: Value) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        execution.result = Some(result);
        Ok(())
    }

    async fn attach_managed_process(
        &self,
        job_id: &str,
        process: Box<dyn ManagedProcess>,
    ) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        if execution.process.is_some() {
            return Err(format!("Runner job {job_id} already owns a process"));
        }
        execution.process = Some(process);
        Ok(())
    }

    async fn cancel_local(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        if let Some(process) = execution.process.as_mut() {
            process
                .terminate()
                .map_err(|error| format!("Failed to stop runner job {job_id}: {error}"))?;
        }
        execution.state = RunnerJobState::Cancelled.as_str().to_string();
        execution.events.push(RunnerSupervisorEvent {
            event_type: "cancelled".to_string(),
            payload: Value::Object(Default::default()),
        });
        Ok(())
    }
}

fn snapshot(job_id: &str, execution: &RunnerExecution) -> RunnerJobSnapshot {
    RunnerJobSnapshot {
        job_id: job_id.to_string(),
        state: execution.state.clone(),
        events: execution.events.clone(),
        checkpoint: execution.checkpoint.clone(),
        result: execution.result.clone(),
        process_id: execution.process.as_ref().and_then(|process| process.id()),
    }
}

fn validate_job_id(job_id: &str) -> Result<(), String> {
    if job_id.trim().is_empty() {
        Err("Runner job id cannot be empty".to_string())
    } else {
        Ok(())
    }
}

fn random_hex(bytes: usize) -> String {
    let mut random = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut random);
    hex::encode(random)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicBool, Ordering};

    struct FakeProcess {
        id: u32,
        terminated: Arc<AtomicBool>,
    }

    impl ManagedProcess for FakeProcess {
        fn id(&self) -> Option<u32> {
            Some(self.id)
        }

        fn terminate(&mut self) -> io::Result<()> {
            self.terminated.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    fn test_supervisor() -> RunnerSupervisor {
        RunnerSupervisor::new("http://127.0.0.1:8001").unwrap()
    }

    async fn register(supervisor: &RunnerSupervisor, job_id: &str) {
        let job = RunnerJob {
            project_id: "project-1".to_string(),
            job_id: job_id.to_string(),
            tool_name: "story_architect".to_string(),
            tool_version: "1.0.0".to_string(),
            input_hash: "a".repeat(64),
            input_json: "{}".to_string(),
            input_revision: 1,
            state: "leased".to_string(),
            checkpoint_json: None,
            checkpoint_hash: None,
            output_json: None,
            output_hash: None,
            lease_owner: Some("desktop-test".to_string()),
            lease_expires_at: Some("2099-01-01 00:00:00".to_string()),
            account_id: None,
            error_code: None,
            error_message: None,
            created_at: "2026-01-01 00:00:00".to_string(),
            updated_at: "2026-01-01 00:00:00".to_string(),
            finished_at: None,
        };
        supervisor.register_job(&job).await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_job_ids_never_cross_events_checkpoints_or_results() {
        let supervisor = test_supervisor();
        register(&supervisor, "job-a").await;
        register(&supervisor, "job-b").await;

        supervisor
            .record_local_event("job-a", "log".to_string(), json!({"line": "alpha"}))
            .await
            .unwrap();
        supervisor
            .record_local_event("job-b", "log".to_string(), json!({"line": "beta"}))
            .await
            .unwrap();
        supervisor
            .set_local_checkpoint("job-a", json!({"cursor": 11}))
            .await
            .unwrap();
        supervisor
            .set_local_checkpoint("job-b", json!({"cursor": 22}))
            .await
            .unwrap();
        supervisor
            .set_local_result("job-a", json!({"draft": "A"}))
            .await
            .unwrap();
        supervisor
            .set_local_result("job-b", json!({"draft": "B"}))
            .await
            .unwrap();

        let first = supervisor.snapshot("job-a").await.unwrap();
        let second = supervisor.snapshot("job-b").await.unwrap();
        assert_eq!(first.events[0].payload, json!({"line": "alpha"}));
        assert_eq!(second.events[0].payload, json!({"line": "beta"}));
        assert_eq!(first.checkpoint, Some(json!({"cursor": 11})));
        assert_eq!(second.checkpoint, Some(json!({"cursor": 22})));
        assert_eq!(first.result, Some(json!({"draft": "A"})));
        assert_eq!(second.result, Some(json!({"draft": "B"})));
    }

    #[tokio::test]
    async fn cancellation_terminates_only_the_exact_jobs_process() {
        let supervisor = test_supervisor();
        register(&supervisor, "job-a").await;
        register(&supervisor, "job-b").await;
        let first_terminated = Arc::new(AtomicBool::new(false));
        let second_terminated = Arc::new(AtomicBool::new(false));

        supervisor
            .attach_managed_process(
                "job-a",
                Box::new(FakeProcess {
                    id: 101,
                    terminated: first_terminated.clone(),
                }),
            )
            .await
            .unwrap();
        supervisor
            .attach_managed_process(
                "job-b",
                Box::new(FakeProcess {
                    id: 202,
                    terminated: second_terminated.clone(),
                }),
            )
            .await
            .unwrap();

        supervisor.cancel_local("job-a").await.unwrap();

        assert!(first_terminated.load(Ordering::SeqCst));
        assert!(!second_terminated.load(Ordering::SeqCst));
        assert_eq!(
            supervisor.snapshot("job-a").await.unwrap().process_id,
            Some(101)
        );
        assert_eq!(
            supervisor.snapshot("job-b").await.unwrap().process_id,
            Some(202)
        );
    }

    #[tokio::test]
    async fn browser_lock_serializes_jobs() {
        let supervisor = test_supervisor();
        let first = supervisor.acquire_browser().await;
        let contender = supervisor.clone();
        let waiting = tokio::spawn(async move {
            let _guard = contender.acquire_browser().await;
            true
        });

        tokio::task::yield_now().await;
        assert!(!waiting.is_finished());
        drop(first);
        assert!(waiting.await.unwrap());
    }

    #[test]
    fn bridge_rejects_non_loopback_origins() {
        assert!(RunnerSupervisor::new("https://example.com:8001").is_err());
        assert!(RunnerSupervisor::new("http://localhost:8001").is_err());
    }
}
