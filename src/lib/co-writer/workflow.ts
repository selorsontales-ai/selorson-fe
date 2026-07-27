import { adminGet, adminPost } from '$lib/stores/admin.svelte';
import type { ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Co-Writer chapter workflow — ba cổng duyệt
// ═══════════════════════════════════════════════
// Nghiên cứu, dàn ý và bản thảo đều là đề xuất cho tới khi tác giả bấm
// duyệt. Chỉ chương đã nhập canon mới đi vào kho truy xuất, và nó đi vào
// qua đúng một cửa: `acceptCanon`.
//
// Mọi thao tác đổi giai đoạn đều mang `expected_revision`. Backend từ chối
// khi số đó lệch, nên hai tab mở cùng một chương không thể ghi đè lên nhau
// mà không ai biết.

/** Phải khớp `gates::CONTRACT_VERSION` ở backend và `CONTRACT_VERSION` trong artifacts. */
export const ARTIFACT_CONTRACT_VERSION = 1;

export type ChapterStage =
	| 'intent'
	| 'research_ready'
	| 'research_approved'
	| 'blueprint_ready'
	| 'blueprint_approved'
	| 'draft_ready'
	| 'canon_accepted';

/** Thứ tự hiển thị. Backend mới là nơi quyết định chuyển giai đoạn có hợp lệ hay không. */
export const STAGE_ORDER: ChapterStage[] = [
	'intent',
	'research_ready',
	'research_approved',
	'blueprint_ready',
	'blueprint_approved',
	'draft_ready',
	'canon_accepted'
];

export const STAGE_LABEL: Record<ChapterStage, string> = {
	intent: 'Ý đồ chương',
	research_ready: 'Đã dựng tư liệu',
	research_approved: 'Tư liệu đã duyệt',
	blueprint_ready: 'Đã có dàn ý',
	blueprint_approved: 'Dàn ý đã duyệt',
	draft_ready: 'Đã có bản thảo',
	canon_accepted: 'Đã nhập canon'
};

export interface ChapterWorkflow {
	project_id: string;
	chapter_number: number;
	stage: ChapterStage;
	revision: number;
	intent_json: string;
	chapter_contract_json: string;
	research_pack_json: string | null;
	blueprint_json: string | null;
	draft_json: string | null;
	accepted_commit_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface CanonCommit {
	project_id: string;
	id: string;
	chapter_number: number;
	workflow_revision: number;
	revision: number;
	parent_commit_id: string | null;
	content: string;
	content_hash: string;
	accepted_at: string;
}

export interface CanonIndexResult {
	document_id: number;
	chunks: number;
	tree_nodes: number;
	replaced: boolean;
}

/** Một đoạn tư liệu kèm đủ dấu vết để tác giả soi được vì sao nó có mặt. */
export interface ContextBlock {
	chunk_id: number;
	document_id: number | null;
	source_file: string;
	heading: string;
	chapter_number: number | null;
	text: string;
	token_count: number;
	channels: string[];
	reason: string;
	fused_score: number;
	pinned: boolean;
	vetoed: boolean;
}

export interface ResearchPack {
	contract: string;
	schema_version: number;
	project_id: string;
	chapter_number: number;
	generated_at: string;
	intent: Record<string, unknown>;
	chapter_contract: Record<string, unknown>;
	recent_canon: unknown[];
	open_loops: unknown[];
	entities: unknown[];
	blocks: ContextBlock[];
	trace: {
		terms: string[];
		channel_counts: Record<string, number>;
		dropped: { chunk_id: number; reason: string }[];
	};
	warnings: string[];
}

export interface WorkflowView {
	workflow: ChapterWorkflow | null;
	canon_commits: CanonCommit[];
	contract_version: number;
}

const base = '/admin/writer/workflow';

export function getWorkflow(chapter: number): Promise<ApiResponse<WorkflowView>> {
	return adminGet(`${base}/${chapter}`);
}

/**
 * Mở ý đồ chương, hoặc viết lại nó.
 *
 * Truyền `expectedRevision` là nói "tôi biết chương này đã có ý đồ và tôi
 * muốn thay". Backend sẽ xoá tư liệu, dàn ý và bản thảo dựng từ ý đồ cũ —
 * chúng trả lời một câu hỏi không còn được hỏi nữa.
 */
export function startWorkflow(
	chapter: number,
	intent: unknown,
	chapterContract: unknown,
	expectedRevision?: number
): Promise<ApiResponse<{ workflow: ChapterWorkflow; created: boolean }>> {
	return adminPost(`${base}/${chapter}`, {
		intent,
		chapter_contract: chapterContract,
		expected_revision: expectedRevision ?? null
	});
}

export interface ResearchRequest {
	expected_revision?: number;
	query?: string;
	budget_tokens?: number;
	max_blocks?: number;
	vetoed_chunk_ids?: number[];
	pinned_chunk_ids?: number[];
}

/** Cổng 1 — dựng (hoặc dựng lại) Research Pack. Không cần API key. */
export function buildResearch(
	chapter: number,
	request: ResearchRequest = {}
): Promise<ApiResponse<{ workflow: ChapterWorkflow; research_pack: ResearchPack }>> {
	return adminPost(`${base}/${chapter}/research`, request);
}

export function approveResearch(
	chapter: number,
	expectedRevision: number
): Promise<ApiResponse<{ workflow: ChapterWorkflow }>> {
	return adminPost(`${base}/${chapter}/research/approve`, { expected_revision: expectedRevision });
}

/** Cổng 2 — nhận Blueprint từ Kiến Trúc Sư Cốt Truyện. */
export function importBlueprint(
	chapter: number,
	expectedRevision: number,
	envelope: unknown
): Promise<ApiResponse<{ workflow: ChapterWorkflow }>> {
	return adminPost(`${base}/${chapter}/blueprint`, {
		expected_revision: expectedRevision,
		envelope
	});
}

export function approveBlueprint(
	chapter: number,
	expectedRevision: number
): Promise<ApiResponse<{ workflow: ChapterWorkflow }>> {
	return adminPost(`${base}/${chapter}/blueprint/approve`, { expected_revision: expectedRevision });
}

/** Gói cho Người Viết Chương. Chỉ tồn tại sau hai lần duyệt. */
export function getWriterPack(chapter: number): Promise<ApiResponse<{ writer_pack: unknown }>> {
	return adminGet(`${base}/${chapter}/writer-pack`);
}

/** Cổng 3, nửa đầu — nhận bản thảo từ Người Viết Chương. */
export function importDraft(
	chapter: number,
	expectedRevision: number,
	envelope: unknown
): Promise<ApiResponse<{ workflow: ChapterWorkflow }>> {
	return adminPost(`${base}/${chapter}/draft`, {
		expected_revision: expectedRevision,
		envelope
	});
}

/**
 * Cổng 3, nửa sau — cửa duy nhất vào kho truy xuất.
 *
 * `content` là văn bản tác giả thật sự chấp nhận. Bỏ trống nghĩa là lấy
 * nguyên bản thảo đã lưu; truyền vào nghĩa là tác giả đã sửa tay, và bản
 * sửa mới là canon.
 */
export function acceptCanon(
	chapter: number,
	expectedRevision: number,
	content?: string
): Promise<
	ApiResponse<{
		commit: CanonCommit;
		created: boolean;
		projection_run_ids: string[];
		indexed: CanonIndexResult | null;
		index_error: string | null;
	}>
> {
	return adminPost(`${base}/${chapter}/canon`, {
		expected_revision: expectedRevision,
		content: content ?? null
	});
}

// ═══════════════════════════════════════════════
//  Phóng chiếu truyện — replay từ canon (CW-430)
// ═══════════════════════════════════════════════
// Nhận canon xếp hàng một run cho mỗi chương từ chương đó trở đi. Mỗi run
// chờ một `ChapterCommitDeltaV1` — thứ hành động `analyze` của Kiến Trúc
// Sư Cốt Truyện sinh ra.

export type ProjectionType =
	| 'summary'
	| 'scene'
	| 'event'
	| 'entity_state'
	| 'relationship'
	| 'character_knowledge'
	| 'timeline'
	| 'open_loop';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';

export interface ProjectionRun {
	project_id: string;
	id: string;
	source_commit_id: string;
	basis_commit_id: string;
	source_chapter_number: number;
	replay_from_chapter: number;
	input_hash: string;
	extractor_version: string;
	status: RunStatus;
	output_hash: string | null;
	error: string | null;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
}

export interface StoryProjection {
	project_id: string;
	id: string;
	run_id: string;
	source_commit_id: string;
	source_chapter_number: number;
	projection_type: ProjectionType;
	subject_key: string;
	payload_json: string;
	evidence_start: number;
	evidence_end: number;
	evidence_hash: string;
	extractor_version: string;
	confidence: number;
	apply_status: 'applied' | 'conflict' | 'rejected';
	active: boolean;
	invalidated_at: string | null;
	created_at: string;
}

export interface DeltaApplyReport {
	run_id: string;
	chapter_number: number;
	applied: number;
	conflicts: number;
	rejected: number;
	superseded: number;
	warnings: string[];
}

export function listProjectionRuns(
	chapter?: number
): Promise<ApiResponse<{ runs: ProjectionRun[] }>> {
	const query = chapter === undefined ? '' : `?chapter=${chapter}`;
	return adminGet(`/admin/writer/projection-runs${query}`);
}

export function listProjections(
	activeOnly = true
): Promise<ApiResponse<{ projections: StoryProjection[] }>> {
	return adminGet(`/admin/writer/projections?active_only=${activeOnly}`);
}

/**
 * Áp một commit delta.
 *
 * Delta phải khai đúng commit và đúng hash nội dung của commit đó. Delta
 * rút từ bản chương cũ bị từ chối trước khi run đổi trạng thái — mọi span
 * bằng chứng trong nó đều trỏ sai đoạn.
 */
export function applyDelta(
	runId: string,
	envelope: unknown
): Promise<ApiResponse<DeltaApplyReport>> {
	return adminPost(`/admin/writer/projection-runs/${encodeURIComponent(runId)}/delta`, {
		envelope
	});
}

export interface RebuildReport {
	active: number;
	stale_commit: number;
	superseded: number;
	rejected: number;
}

/**
 * Tính lại phóng chiếu nào đang hoạt động (CW-440).
 *
 * Áp delta đã tự làm việc này. Route riêng dành cho lúc tác giả vừa sửa
 * một chương: bản sửa làm phóng chiếu của bản cũ hết hiệu lực, còn các
 * chương sau đó không đổi nội dung thì không cần rút trích lại — chỉ cần
 * đếm lại xem ai đang giữ mỗi đối tượng.
 */
export function rebuildProjections(): Promise<ApiResponse<RebuildReport>> {
	return adminPost('/admin/writer/projections/rebuild');
}

/** Ghi lại vì sao rút trích không ra được delta, để run chạy lại được sau. */
export function failProjectionRun(
	runId: string,
	error: string
): Promise<ApiResponse<{ run: ProjectionRun }>> {
	return adminPost(`/admin/writer/projection-runs/${encodeURIComponent(runId)}/fail`, { error });
}

/** Đọc một cột JSON của workflow mà không làm sập trang khi nó hỏng. */
export function parseStored<T>(json: string | null): T | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

export function stageIndex(stage: ChapterStage | undefined): number {
	return stage ? STAGE_ORDER.indexOf(stage) : -1;
}

/** Đã qua giai đoạn này chưa — dùng để tô bước đã hoàn tất. */
export function stageReached(workflow: ChapterWorkflow | null, stage: ChapterStage): boolean {
	return !!workflow && stageIndex(workflow.stage) >= stageIndex(stage);
}
