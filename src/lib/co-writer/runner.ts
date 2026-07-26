import { adminGet, adminPost } from '$lib/stores/admin.svelte';
import type { ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Co-Writer runner jobs — automated and manual
// ═══════════════════════════════════════════════
// Automation must never be the only way to finish a chapter. Every job can be
// exported, run in the Artifact by hand, and imported back through the same
// completion path the desktop runner uses, so both routes store the same
// output and the same hash.

/** Version of the pack and result envelopes. Must match the backend. */
export const RUNNER_CONTRACT_VERSION = 1;

export type RunnerJobState =
	| 'queued'
	| 'leased'
	| 'opening_account'
	| 'connecting_cdp'
	| 'running'
	| 'checkpointed'
	| 'succeeded'
	| 'rate_limited'
	| 'failed'
	| 'cancelled'
	| 'stale'
	| 'exhausted';

export interface RunnerJob {
	project_id: string;
	job_id: string;
	tool_name: string;
	tool_version: string;
	input_hash: string;
	input_json: string;
	input_revision: number;
	state: RunnerJobState;
	checkpoint_json: string | null;
	checkpoint_hash: string | null;
	output_json: string | null;
	output_hash: string | null;
	lease_owner: string | null;
	lease_expires_at: string | null;
	account_id: number | null;
	error_code: string | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
	finished_at: string | null;
}

export interface RunnerJobEvent {
	sequence: number;
	event_type: string;
	payload_json: string;
	created_at: string;
}

/** Everything a person needs to run one job themselves. */
export interface RunnerPackV1 {
	schema_version: number;
	project_id: string;
	job_id: string;
	tool_name: string;
	tool_version: string;
	input_hash: string;
	input_revision: number;
	input: unknown;
}

/**
 * A result carried back by hand. The identifying fields are repeated so a
 * result pasted into the wrong job is refused instead of overwriting it.
 */
export interface RunnerResultV1 {
	schema_version: number;
	job_id: string;
	tool_name: string;
	tool_version: string;
	input_hash: string;
	output: unknown;
}

const base = '/admin/writer/runner/jobs';

export function createRunnerJob(job: {
	job_id: string;
	tool_name: string;
	tool_version: string;
	input: unknown;
	input_revision?: number;
}): Promise<ApiResponse<{ job: RunnerJob; created: boolean }>> {
	return adminPost(base, job);
}

export function getRunnerJob(
	jobId: string
): Promise<ApiResponse<{ job: RunnerJob; events: RunnerJobEvent[] }>> {
	return adminGet(`${base}/${encodeURIComponent(jobId)}`);
}

/** The pack as structured JSON plus a Markdown rendering to read and paste. */
export function exportRunnerPack(
	jobId: string
): Promise<ApiResponse<{ pack: RunnerPackV1; markdown: string }>> {
	return adminGet(`${base}/${encodeURIComponent(jobId)}/export`);
}

/** Apply a result produced by hand. Refused unless it names this exact job. */
export function importRunnerResult(
	jobId: string,
	result: RunnerResultV1
): Promise<ApiResponse<RunnerJob>> {
	return adminPost(`${base}/${encodeURIComponent(jobId)}/import`, result);
}

/** Complete a job without Claude. Available only where runner_mode is mock. */
export function runMockRunner(jobId: string): Promise<ApiResponse<RunnerJob>> {
	return adminPost(`${base}/${encodeURIComponent(jobId)}/mock`);
}

/**
 * Build the envelope for a result the author ran by hand. Taking the fields
 * from the pack keeps them consistent with the job the output answers.
 */
export function resultEnvelope(pack: RunnerPackV1, output: unknown): RunnerResultV1 {
	return {
		schema_version: RUNNER_CONTRACT_VERSION,
		job_id: pack.job_id,
		tool_name: pack.tool_name,
		tool_version: pack.tool_version,
		input_hash: pack.input_hash,
		output
	};
}
