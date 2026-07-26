use rand::{rngs::OsRng, RngCore};
use reqwest::{Client, Method, Url};
use selorson_backend::{
    desktop_bridge::{DESKTOP_BRIDGE_TOKEN_ENV, DESKTOP_BRIDGE_TOKEN_HEADER},
    services::{
        claude_accounts::RunnerAccount,
        co_writer::workflow::{RunnerJob, RunnerJobEvent, RunnerJobState},
    },
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    io,
    process::{ExitStatus, Stdio},
    sync::{Arc, Mutex as StdMutex, MutexGuard as StdMutexGuard},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
    sync::{Mutex, OwnedMutexGuard},
    time::sleep,
};

const TOKEN_BYTES: usize = 32;
const OWNER_BYTES: usize = 16;
const DEFAULT_LEASE_SECONDS: i64 = 60;
const MAX_PROCESS_INPUT_BYTES: usize = 8 * 1024 * 1024;
const MAX_PROCESS_STDOUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_PROCESS_STDERR_BYTES: usize = 256 * 1024;
const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(20);
/// A real Artifact run outlives the lease, so it is renewed while the sidecar
/// process is alive. Without this, recovery could reclaim a running job and the
/// owner-checked operations after the run would be rejected.
const LEASE_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);

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

#[derive(Serialize)]
struct RateLimitPayload<'a> {
    lease_owner: &'a str,
    job_id: &'a str,
    reset_at: Option<&'a str>,
}

#[derive(Deserialize)]
struct RecoveredBody {
    recovered: usize,
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

    async fn lease_job(&self, job_id: &str, lease_seconds: i64) -> Result<RunnerJob, String> {
        self.request(
            Method::POST,
            &["jobs", job_id, "lease"],
            Some(&LeasePayload {
                lease_owner: &self.lease_owner,
                lease_seconds,
            }),
        )
        .await
    }

    async fn get_job(&self, job_id: &str) -> Result<RunnerJob, String> {
        self.request::<RunnerJob, ()>(Method::GET, &["jobs", job_id], None)
            .await
    }

    async fn accounts(&self) -> Result<Vec<RunnerAccount>, String> {
        self.request::<Vec<RunnerAccount>, ()>(Method::GET, &["accounts"], None)
            .await
    }

    async fn rate_limit_account(
        &self,
        account_id: i64,
        job_id: &str,
        reset_at: Option<&str>,
    ) -> Result<RunnerAccount, String> {
        let account = account_id.to_string();
        self.request(
            Method::POST,
            &["accounts", &account, "rate-limit"],
            Some(&RateLimitPayload {
                lease_owner: &self.lease_owner,
                job_id,
                reset_at,
            }),
        )
        .await
    }

    async fn resume(&self, job_id: &str) -> Result<RunnerJob, String> {
        self.request::<RunnerJob, ()>(Method::POST, &["jobs", job_id, "resume"], None)
            .await
    }

    async fn recover(&self) -> Result<usize, String> {
        self.request::<RecoveredBody, ()>(Method::POST, &["jobs", "recover"], None)
            .await
            .map(|body| body.recovered)
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

#[derive(Clone)]
struct SharedChild {
    child: Arc<StdMutex<Child>>,
}

impl SharedChild {
    fn new(child: Child) -> Self {
        Self {
            child: Arc::new(StdMutex::new(child)),
        }
    }

    fn lock(&self) -> io::Result<StdMutexGuard<'_, Child>> {
        self.child
            .lock()
            .map_err(|_| io::Error::other("Runner child process lock is poisoned"))
    }

    fn try_wait(&self) -> io::Result<Option<ExitStatus>> {
        self.lock()?.try_wait()
    }
}

impl ManagedProcess for SharedChild {
    fn id(&self) -> Option<u32> {
        self.lock().ok().and_then(|child| child.id())
    }

    fn terminate(&mut self) -> io::Result<()> {
        self.lock()?.start_kill()
    }
}

impl ManagedProcess for Child {
    fn id(&self) -> Option<u32> {
        Child::id(self)
    }

    fn terminate(&mut self) -> io::Result<()> {
        self.start_kill()
    }
}

pub(crate) struct ManagedProcessOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
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

impl RunnerJobSnapshot {
    pub(crate) fn state(&self) -> &str {
        &self.state
    }
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

    /// Lease one exact job. Rotation and restart resume continue the job they
    /// were already driving, never whichever job heads the queue.
    pub async fn lease_job(&self, job_id: &str) -> Result<RunnerJob, String> {
        let job = self.bridge.lease_job(job_id, DEFAULT_LEASE_SECONDS).await?;
        self.register_job(&job).await?;
        Ok(job)
    }

    pub async fn job(&self, job_id: &str) -> Result<RunnerJob, String> {
        self.require_job(job_id).await?;
        self.bridge.get_job(job_id).await
    }

    /// Accounts the backend considers openable right now.
    pub async fn accounts(&self) -> Result<Vec<RunnerAccount>, String> {
        self.bridge.accounts().await
    }

    /// Park an account until its reset time. Only reachable while this
    /// supervisor holds the lease on the job that observed the limit.
    pub async fn rate_limit_account(
        &self,
        account_id: i64,
        job_id: &str,
        reset_at: Option<&str>,
    ) -> Result<RunnerAccount, String> {
        self.require_job(job_id).await?;
        self.bridge
            .rate_limit_account(account_id, job_id, reset_at)
            .await
    }

    /// Return a checkpointed, rate-limited, or exhausted job to the queue with
    /// its checkpoint intact.
    pub async fn resume(&self, job_id: &str) -> Result<RunnerJob, String> {
        let job = self.bridge.resume(job_id).await?;
        self.register_job(&job).await?;
        self.update_state(job_id, &job.state).await?;
        Ok(job)
    }

    /// Recover jobs whose lease died with a previous desktop session.
    pub async fn recover(&self) -> Result<usize, String> {
        self.bridge.recover().await
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

    pub(crate) async fn run_process(
        &self,
        job_id: &str,
        command: &mut Command,
        input: &[u8],
    ) -> Result<ManagedProcessOutput, String> {
        self.require_job(job_id).await?;
        if input.len() > MAX_PROCESS_INPUT_BYTES {
            return Err("Runner process input exceeds 8 MiB".to_string());
        }

        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to start runner process: {error}"))?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Runner process stdin was not piped".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Runner process stdout was not piped".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Runner process stderr was not piped".to_string())?;
        let shared_child = SharedChild::new(child);
        self.attach_managed_process(job_id, Box::new(shared_child.clone()))
            .await?;

        if let Err(error) = stdin.write_all(input).await {
            let mut process = shared_child.clone();
            let _ = process.terminate();
            let _ = self.clear_process(job_id).await;
            return Err(format!("Failed to write runner process input: {error}"));
        }
        if let Err(error) = stdin.shutdown().await {
            let mut process = shared_child.clone();
            let _ = process.terminate();
            let _ = self.clear_process(job_id).await;
            return Err(format!("Failed to close runner process input: {error}"));
        }

        let stdout_task = tokio::spawn(read_limited(stdout, MAX_PROCESS_STDOUT_BYTES, "stdout"));
        let stderr_task = tokio::spawn(read_limited(stderr, MAX_PROCESS_STDERR_BYTES, "stderr"));
        let lease_task = self.spawn_lease_heartbeat(job_id);
        let status = loop {
            match shared_child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => sleep(PROCESS_POLL_INTERVAL).await,
                Err(error) => {
                    lease_task.abort();
                    let _ = self.clear_process(job_id).await;
                    return Err(format!("Failed to poll runner process: {error}"));
                }
            }
        };
        lease_task.abort();
        let stdout_result = stdout_task
            .await
            .map_err(|error| format!("Runner stdout task failed: {error}"))?;
        let stderr_result = stderr_task
            .await
            .map_err(|error| format!("Runner stderr task failed: {error}"))?;
        self.clear_process(job_id).await?;
        let stdout =
            stdout_result.map_err(|error| format!("Failed to read runner stdout: {error}"))?;
        let stderr =
            stderr_result.map_err(|error| format!("Failed to read runner stderr: {error}"))?;

        Ok(ManagedProcessOutput {
            success: status.success(),
            stdout: String::from_utf8(stdout)
                .map_err(|_| "Runner process stdout was not valid UTF-8".to_string())?,
            stderr: String::from_utf8(stderr)
                .map_err(|_| "Runner process stderr was not valid UTF-8".to_string())?,
        })
    }

    /// Renew this job's lease until the caller aborts the task. It stops on the
    /// first rejection, which is what happens once the job leaves the leased
    /// states, so a finished job is never kept artificially alive.
    fn spawn_lease_heartbeat(&self, job_id: &str) -> tokio::task::JoinHandle<()> {
        let supervisor = self.clone();
        let job_id = job_id.to_string();
        tokio::spawn(async move {
            loop {
                sleep(LEASE_HEARTBEAT_INTERVAL).await;
                if supervisor.heartbeat(&job_id).await.is_err() {
                    return;
                }
            }
        })
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

    async fn clear_process(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let execution = jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Runner job {job_id} is not registered in this supervisor"))?;
        execution.process = None;
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

async fn read_limited<R>(mut reader: R, limit: usize, stream_name: &str) -> io::Result<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut exceeded = false;
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        if bytes.len() + read <= limit {
            bytes.extend_from_slice(&buffer[..read]);
        } else {
            exceeded = true;
        }
    }
    if exceeded {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Runner {stream_name} exceeded {limit} bytes"),
        ));
    }
    Ok(bytes)
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
