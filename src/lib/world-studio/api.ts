/** World Studio data access. Uses the shared admin client for auth handling. */

import { adminGet, adminPost, adminPut } from '$lib/stores/admin.svelte';
import type { DraftPayload, RevisionSummary, WorldDoc } from './types';

export async function fetchDraft(): Promise<DraftPayload> {
	const res = await adminGet<DraftPayload>('/admin/world/draft');
	if (!res.success) throw new Error('Không tải được bản nháp');
	return res.data;
}

export interface SaveResult {
	ok: boolean;
	updatedAt?: string;
	/** Set when another session saved first — the caller must reload, not retry. */
	conflict?: boolean;
	message?: string;
}

/**
 * Save the working copy.
 *
 * `expectedUpdatedAt` is the timestamp the editor last saw. If it no longer
 * matches, the save is refused rather than silently overwriting whatever the
 * other session wrote.
 */
export async function saveDraft(
	doc: WorldDoc,
	expectedUpdatedAt: string,
	label?: string
): Promise<SaveResult> {
	const res = await adminPut<{ updated_at: string }>('/admin/world/draft', {
		doc,
		label,
		expected_updated_at: expectedUpdatedAt
	});

	if (!res.success) {
		const payload = res as unknown as { code?: string; message?: string };
		return {
			ok: false,
			conflict: payload.code === 'conflict',
			message: payload.message
		};
	}
	return { ok: true, updatedAt: res.data.updated_at };
}

export async function publishWorld(expectedUpdatedAt: string, label?: string) {
	return adminPost<{
		revision_id: number;
		published_at: string;
		draft_updated_at: string;
		links_synced: number;
	}>('/admin/world/publish', { label, expected_updated_at: expectedUpdatedAt });
}

export async function fetchRevisions(): Promise<RevisionSummary[]> {
	const res = await adminGet<RevisionSummary[]>('/admin/world/revisions');
	return res.success ? res.data : [];
}

export async function restoreRevision(id: number, expectedUpdatedAt: string) {
	return adminPost<{ doc: WorldDoc; updated_at: string }>(
		`/admin/world/revisions/${id}/restore`,
		{ expected_updated_at: expectedUpdatedAt }
	);
}
