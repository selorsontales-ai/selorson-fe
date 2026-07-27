import { adminGet, adminPost } from '$lib/stores/admin.svelte';
import type { ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Ảnh chụp Co-Writer có phiên bản (CW-500)
// ═══════════════════════════════════════════════
// Website chạy trên một ảnh chụp chỉ đọc. Tạo và kích hoạt là hai việc
// riêng: chụp hỏng thì không thêm gì, kích hoạt hỏng thì không đổi gì.
// Backend xác minh sha256, tính toàn vẹn và schema **trước** khi đổi con
// trỏ, nên một bản mục không bao giờ thay được bản đang phục vụ.

export interface SnapshotManifest {
	snapshot_schema: number;
	version: number;
	/** `PRAGMA user_version` của tệp lúc chụp. */
	database_schema: number;
	sha256: string;
	byte_size: number;
	created_at: string;
	label: string | null;
}

export interface ActiveSnapshot {
	snapshot_schema: number;
	version: number;
	activated_at: string;
	/** Đích của quay lui. `null` nghĩa là chưa từng có bản nào khác. */
	previous_version: number | null;
}

export interface SnapshotList {
	snapshots: SnapshotManifest[];
	active: ActiveSnapshot | null;
	snapshot_schema: number;
	root: string | null;
}

const base = '/admin/writer/snapshots';

export function listSnapshots(): Promise<ApiResponse<SnapshotList>> {
	return adminGet(base);
}

/** Chụp một phiên bản mới. Không kích hoạt — website vẫn giữ bản cũ. */
export function createSnapshot(label?: string): Promise<ApiResponse<{ snapshot: SnapshotManifest }>> {
	return adminPost(base, { label: label ?? null });
}

/** Trỏ website sang một phiên bản. Xác minh trượt thì bản cũ giữ nguyên. */
export function activateSnapshot(
	version: number
): Promise<ApiResponse<{ active: ActiveSnapshot }>> {
	return adminPost(`${base}/${version}/activate`);
}

export function rollbackSnapshot(): Promise<ApiResponse<{ active: ActiveSnapshot }>> {
	return adminPost(`${base}/rollback`);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const mb = bytes / (1024 * 1024);
	return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`;
}
