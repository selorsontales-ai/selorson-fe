/** Asset library data access. Admin-only in every direction. */

import { adminDelete, adminGet, adminPost, adminPut, adminUpload } from '$lib/stores/admin.svelte';
import type { AssetCatalogue, WorldAsset } from './types';

export interface AssetQuery {
	kind?: string;
	tag?: string;
	q?: string;
	includeInactive?: boolean;
}

export async function fetchAssets(query: AssetQuery = {}): Promise<AssetCatalogue> {
	const params = new URLSearchParams();
	if (query.kind) params.set('kind', query.kind);
	if (query.tag) params.set('tag', query.tag);
	if (query.q) params.set('q', query.q);
	if (query.includeInactive) params.set('include_inactive', 'true');

	const suffix = params.toString() ? `?${params}` : '';
	const res = await adminGet<AssetCatalogue>(`/admin/world-assets${suffix}`);
	return res.success ? res.data : { assets: [], tags: [] };
}

export type AssetDraft = Partial<Omit<WorldAsset, 'id' | 'created_at' | 'updated_at'>> & {
	name: string;
	file_url: string;
};

export function createAsset(draft: AssetDraft) {
	return adminPost<WorldAsset>('/admin/world-assets', draft);
}

export function updateAsset(id: number, draft: AssetDraft) {
	return adminPut<WorldAsset>(`/admin/world-assets/${id}`, draft);
}

/** Retires rather than deletes — see the handler for why. */
export function retireAsset(id: number) {
	return adminDelete(`/admin/world-assets/${id}`);
}

export interface UploadedFile {
	url: string;
	key: string;
	size: number;
	format: string;
}

/** Put one file in storage. Registering it as an asset is a separate step. */
export async function uploadAssetFile(file: File): Promise<UploadedFile | null> {
	const form = new FormData();
	form.append('file', file);
	const res = await adminUpload<UploadedFile>('/admin/world-assets/upload', form);
	return res.success ? res.data : null;
}

export interface ImportReport {
	created: number;
	updated: number;
	failed: Array<{ slug: string; error: string }>;
}

/**
 * Register a batch from a manifest.
 *
 * Matches how assets actually get made: a folder exported from Blender and
 * pushed to storage in one go. Existing slugs update rather than duplicate, so
 * re-importing after re-exporting a few models is safe.
 */
export function importAssets(assets: AssetDraft[]) {
	return adminPost<ImportReport>('/admin/world-assets/import', { assets });
}

export interface CreditsReport {
	credits: Array<{
		name: string;
		license: string | null;
		source_name: string | null;
		source_url: string | null;
		attribution: string | null;
	}>;
	/** Assets whose licence was never recorded — a gap to fix before shipping. */
	missing_license: Array<{ id: number; slug: string; name: string }>;
	total: number;
}

export function fetchCredits() {
	return adminGet<CreditsReport>('/admin/world-assets/credits');
}
