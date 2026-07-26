import { api } from '$lib/api';

export type RuntimeTarget = 'desktop' | 'development' | 'deploy';
export type RunnerMode = 'desktop' | 'mock' | 'disabled';

export interface RuntimeCapabilities {
	target: RuntimeTarget;
	runner_mode: RunnerMode;
	co_writer_read: boolean;
	co_writer_write: boolean;
	local_source_scan: boolean;
	runner_jobs: boolean;
	embedding_rebuild: boolean;
	snapshot_create: boolean;
	cms_draft_push: boolean;
	cms_publish: boolean;
}

export type RuntimeCapabilityKey = Exclude<keyof RuntimeCapabilities, 'target' | 'runner_mode'>;

export async function fetchRuntimeCapabilities(): Promise<RuntimeCapabilities> {
	const response = await api<RuntimeCapabilities>('/runtime/capabilities');
	return response.data;
}

export function allowsCapability(
	capabilities: RuntimeCapabilities | null,
	capability: RuntimeCapabilityKey
): boolean {
	return capabilities?.[capability] === true;
}
