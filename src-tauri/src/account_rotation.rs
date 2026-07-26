//! Account rotation for the desktop runner.
//!
//! One job runs on one account at a time. A confirmed rate limit parks that
//! account in the backend and hands the job's checkpoint to the next eligible
//! account. Every other failure stops the job with its diagnostics intact, so a
//! broken selector or a lost CDP connection never burns the account pool.

use crate::artifact_sidecar::{self, RateLimitSignal, SidecarOutcome};
use crate::claude_webview::ClaudeWindowManager;
use crate::runner_supervisor::RunnerSupervisor;
use crate::sidecar_runtime::SidecarRuntime;
use selorson_backend::services::{
    claude_accounts::RunnerAccount,
    co_writer::workflow::{RunnerJob, RunnerJobState},
};
use serde_json::json;
use std::collections::HashSet;

/// Drive one job to a terminal state, rotating accounts only on confirmed rate
/// limits. The browser is held for the whole rotation so two jobs can never
/// share a Claude window.
pub async fn run_job(
    app: tauri::AppHandle,
    manager: &ClaudeWindowManager,
    supervisor: &RunnerSupervisor,
    job_id: &str,
) -> Result<RunnerJob, String> {
    let _browser_guard = supervisor.acquire_browser().await;
    // Resolved before any account is opened: a bundle without its Node runtime
    // must fail immediately instead of after burning a window.
    let runtime = SidecarRuntime::for_app(&app)?;
    let mut tried: HashSet<i64> = HashSet::new();

    loop {
        let accounts = supervisor.accounts().await?;
        let Some(account) = select_next_account(&accounts, &tried).cloned() else {
            return match tried.is_empty() {
                // Nothing was attempted, so the job keeps its current state and
                // simply waits for an account instead of being marked spent.
                true => Err(format!(
                    "Runner job {job_id} has no eligible Claude account to open"
                )),
                false => exhaust(supervisor, job_id, tried.len()).await,
            };
        };
        tried.insert(account.id);

        let job = lease_for_attempt(supervisor, job_id).await?;
        supervisor
            .record_event(
                job_id,
                "account_selected".to_string(),
                json!({
                    "accountId": account.id,
                    "attempt": tried.len(),
                    "resumedFromCheckpoint": job.checkpoint_json.is_some()
                }),
            )
            .await?;

        let window = manager
            .open(app.clone(), account.id, account.label.clone())
            .await?;
        match artifact_sidecar::run(supervisor, &runtime, job_id, account.id, window.cdp_port())
            .await?
        {
            SidecarOutcome::Completed(job) => return Ok(job),
            SidecarOutcome::RateLimited(signal) => {
                rotate(supervisor, manager, &app, job_id, &signal).await?;
            }
        }
    }
}

/// The first account the backend still considers eligible that this job has not
/// already used. Backend order is preserved so the choice is deterministic.
fn select_next_account<'a>(
    accounts: &'a [RunnerAccount],
    tried: &HashSet<i64>,
) -> Option<&'a RunnerAccount> {
    accounts.iter().find(|account| !tried.contains(&account.id))
}

/// Park the account, record the limit on the job, and release the window before
/// the next account is opened.
async fn rotate(
    supervisor: &RunnerSupervisor,
    manager: &ClaudeWindowManager,
    app: &tauri::AppHandle,
    job_id: &str,
    signal: &RateLimitSignal,
) -> Result<(), String> {
    // Parked first, while the lease that observed the limit is still active and
    // before the job releases it by entering `rate_limited`.
    supervisor
        .rate_limit_account(signal.account_id, job_id, signal.reset_at.as_deref())
        .await?;

    let current = current_state(supervisor, job_id).await?;
    if !can_report_rate_limit(current) {
        return Err(format!(
            "Runner job {job_id} reported a rate limit from {}",
            current.as_str()
        ));
    }
    supervisor
        .transition(
            job_id,
            current,
            RunnerJobState::RateLimited,
            Some(signal.account_id),
            json!({
                "accountId": signal.account_id,
                "resetAt": signal.reset_at,
                "resetTime": signal.reset_time,
                "source": signal.source
            }),
        )
        .await?;

    // A limited account keeps a blocking modal on screen, so its window is torn
    // down instead of being left for the next job to trip over.
    manager.close(app.clone(), signal.account_id).await
}

/// Mark a job that ran out of accounts. The checkpoint is preserved so the job
/// continues once any account's reset time passes.
async fn exhaust(
    supervisor: &RunnerSupervisor,
    job_id: &str,
    attempts: usize,
) -> Result<RunnerJob, String> {
    let current = current_state(supervisor, job_id).await?;
    supervisor
        .transition(
            job_id,
            current,
            RunnerJobState::Exhausted,
            None,
            json!({ "attempts": attempts }),
        )
        .await
}

/// Take the lease for one attempt. A job left `rate_limited`, `checkpointed`, or
/// `exhausted` returns to the queue first, which keeps its checkpoint.
async fn lease_for_attempt(
    supervisor: &RunnerSupervisor,
    job_id: &str,
) -> Result<RunnerJob, String> {
    let lease_error = match supervisor.lease_job(job_id).await {
        Ok(job) => return Ok(job),
        Err(error) => error,
    };
    supervisor.resume(job_id).await.map_err(|resume_error| {
        format!(
            "Runner job {job_id} could not be leased ({lease_error}) or resumed ({resume_error})"
        )
    })?;
    supervisor.lease_job(job_id).await
}

async fn current_state(
    supervisor: &RunnerSupervisor,
    job_id: &str,
) -> Result<RunnerJobState, String> {
    let job = supervisor.job(job_id).await?;
    RunnerJobState::parse(&job.state)
}

/// A rate limit can only arrive while the job is actually driving an account.
/// The state may already be `checkpointed` because the sidecar saves progress
/// before it reports the limit.
fn can_report_rate_limit(state: RunnerJobState) -> bool {
    matches!(
        state,
        RunnerJobState::OpeningAccount
            | RunnerJobState::ConnectingCdp
            | RunnerJobState::Running
            | RunnerJobState::Checkpointed
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(id: i64) -> RunnerAccount {
        RunnerAccount {
            id,
            label: format!("account-{id}"),
            limit_reset_date: None,
        }
    }

    #[test]
    fn rotation_walks_the_pool_once_and_never_reuses_an_account() {
        let accounts = vec![account(2), account(5), account(9)];
        let mut tried = HashSet::new();

        let mut order = Vec::new();
        while let Some(next) = select_next_account(&accounts, &tried) {
            order.push(next.id);
            tried.insert(next.id);
        }

        assert_eq!(order, vec![2, 5, 9]);
        assert_eq!(select_next_account(&accounts, &tried), None);
    }

    #[test]
    fn an_account_parked_by_the_backend_disappears_from_the_next_pool() {
        // The backend filters parked accounts out, so a shrinking pool is what
        // rotation observes and why the loop always terminates.
        let remaining = vec![account(5)];
        let tried = HashSet::from([2]);

        assert_eq!(
            select_next_account(&remaining, &tried).map(|a| a.id),
            Some(5)
        );
        assert_eq!(
            select_next_account(&[], &HashSet::from([2, 5])).map(|a| a.id),
            None
        );
    }

    #[test]
    fn only_states_that_are_driving_an_account_may_report_a_rate_limit() {
        for state in [
            RunnerJobState::OpeningAccount,
            RunnerJobState::ConnectingCdp,
            RunnerJobState::Running,
            RunnerJobState::Checkpointed,
        ] {
            assert!(can_report_rate_limit(state));
        }
        for state in [
            RunnerJobState::Queued,
            RunnerJobState::Leased,
            RunnerJobState::Succeeded,
            RunnerJobState::Failed,
            RunnerJobState::Cancelled,
            RunnerJobState::Stale,
            RunnerJobState::Exhausted,
            RunnerJobState::RateLimited,
        ] {
            assert!(!can_report_rate_limit(state));
        }
    }
}
