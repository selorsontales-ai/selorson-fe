import { adminGet, adminPost } from '$lib/stores/admin.svelte';
import type { ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Canon → bản nháp CMS (CW-510)
// ═══════════════════════════════════════════════
// Canon nằm trong SQLite của Co-Writer; website đọc PostgreSQL. Đẩy là cây
// cầu duy nhất, và nó chỉ tạo ra **bản nháp**. Xuất bản là hành động riêng.
//
// Xem trước và đẩy dùng chung một hàm ở backend, nên những gì màn hình hiện
// ra chính là những gì cú bấm sẽ làm.

export type DraftAction = 'create' | 'update' | 'unchanged';

/** Hàng CMS mà canon nói rằng chương này phải trở thành. */
export interface CanonChapterTarget {
	chapter_number: number;
	title: string;
	content: string;
	source_commit_id: string;
	content_hash: string;
	accepted_at: string;
	revision: number;
}

export interface CmsChapterState {
	id: number;
	title: string;
	status: string;
	has_content_html: boolean;
	has_content_blocks: boolean;
	/** `null` khi hàng CMS chưa có nội dung nào. */
	content_hash: string | null;
	updated_at: string;
}

/**
 * Diff theo dòng sau khi cắt phần đầu và phần cuối giống nhau.
 *
 * Không phải diff nhỏ nhất: sửa rải rác khắp chương thì cả phần giữa thành
 * một khối. `removed`/`added` bị chặn ở 200 dòng mỗi phía, còn
 * `removed_lines`/`added_lines` luôn là số thật.
 */
export interface ContentDiff {
	unchanged_prefix_lines: number;
	unchanged_suffix_lines: number;
	removed_lines: number;
	added_lines: number;
	removed: string[];
	added: string[];
	truncated: boolean;
}

export interface DraftPreview {
	action: DraftAction;
	target: CanonChapterTarget;
	existing: CmsChapterState | null;
	/** Đúng những cột một lần đẩy sẽ ghi khác đi. Rỗng nghĩa là `unchanged`. */
	changed_fields: string[];
	in_sync: boolean;
	/** Đẩy sẽ gỡ chương khỏi website; cần `confirmUnpublish`. */
	would_unpublish: boolean;
	clears_rich_content: boolean;
	diff: ContentDiff | null;
	warnings: string[];
}

export interface DraftPushResult {
	action: DraftAction;
	chapter_id: number;
	chapter_number: number;
	status: string;
	source_commit_id: string;
	content_hash: string;
}

const base = '/admin/writer/cms/chapters';

/** Một lần đẩy sẽ làm gì. Chỉ đọc, nên deploy cũng trả lời được. */
export function previewCmsDraft(chapter: number): Promise<ApiResponse<DraftPreview>> {
	return adminGet(`${base}/${chapter}`);
}

/**
 * Ghi bản canon vào hàng CMS dưới dạng bản nháp.
 *
 * `confirmUnpublish` chỉ cần khi hàng CMS đang xuất bản: desktop chỉ được
 * phép tạo bản nháp, nên đẩy lên một chương đang công khai sẽ gỡ nó khỏi
 * website — và đó là hệ quả phải được yêu cầu, không phải chịu đựng.
 */
export function pushCmsDraft(
	chapter: number,
	confirmUnpublish = false
): Promise<ApiResponse<DraftPushResult>> {
	return adminPost(`${base}/${chapter}/draft`, { confirm_unpublish: confirmUnpublish });
}
