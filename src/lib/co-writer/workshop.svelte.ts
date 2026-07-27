import { toast_error, toast_success } from '$lib/stores/admin.svelte';
import type { CoWriterHooks, CoWriterHttp } from './admin-http.svelte';

// ═══════════════════════════════════════════════
//  Xưởng Viết — brainstorm, viết chương, lịch sử
// ═══════════════════════════════════════════════
// Đường sáng tác cũ, có từ trước Phase 4: dàn ý bằng một lời nhắc, chương
// bằng một Super Prompt. Nó không đi qua ba cổng duyệt và không tạo canon —
// muốn canon thì dùng màn Cổng Duyệt Chương.

export class WorkshopState {
	// Brainstorm và viết
	brainstormGoal = $state('');
	targetChapter = $state(1);
	writingBeats = $state('');
	customSummary = $state('');
	mmrLambda = $state(0.5);
	temporalLambda = $state(0.005);
	promptOnly = $state(false);
	superPrompt = $state('');
	promptStats = $state<any>(null);
	generatedText = $state('');
	isGenerating = $state(false);
	isBrainstorming = $state(false);
	isSavingAnalyze = $state(false);

	// Dấu vết truy xuất — nguồn AI đã đọc
	treePicks = $state<any[]>([]);
	ragChunks = $state<any[]>([]);
	excludedNodeIds = $state<Set<number>>(new Set());
	excludedChunkIds = $state<Set<number>>(new Set());

	// Lịch sử sáng tác
	generations = $state<any[]>([]);
	historyLoaded = $state(false);

	// Cài đặt model
	settings = $state<any>({
		gen_provider: '',
		gen_model: '',
		gen_max_tokens: '',
		worker_model: '',
		default_worker_model: ''
	});
	modelProviders = $state<any[]>([]);
	isSavingSettings = $state(false);

	constructor(
		private http: CoWriterHttp,
		private hooks: CoWriterHooks
	) {}

	/** Tác vụ đang chạy thì không cho đổi dự án giữa chừng. */
	busy(): boolean {
		return this.isGenerating || this.isBrainstorming || this.isSavingAnalyze || this.isSavingSettings;
	}

	reset() {
		this.brainstormGoal = '';
		this.writingBeats = '';
		this.customSummary = '';
		this.superPrompt = '';
		this.promptStats = null;
		this.generatedText = '';
		this.treePicks = [];
		this.ragChunks = [];
		this.excludedNodeIds = new Set();
		this.excludedChunkIds = new Set();
		this.generations = [];
		this.historyLoaded = false;
		this.settings = {
			gen_provider: '',
			gen_model: '',
			gen_max_tokens: '',
			worker_model: '',
			default_worker_model: ''
		};
	}

	async load() {
		await this.loadSettings();
	}

	async doBrainstorm() {
		if (!this.brainstormGoal.trim()) return toast_error('Nhập định hướng chương');
		if (!this.targetChapter || this.targetChapter < 1) return toast_error('Nhập số chương hợp lệ');
		if (
			this.writingBeats.trim() &&
			!confirm('Dàn ý (beats) đang có nội dung — brainstorm mới sẽ GHI ĐÈ lên. Tiếp tục?')
		)
			return;

		this.isBrainstorming = true;
		const res = await this.http.post<any>('/admin/writer/brainstorm', {
			goal: this.brainstormGoal,
			target_chapter: this.targetChapter,
			excluded_node_ids: [...this.excludedNodeIds],
			excluded_chunk_ids: [...this.excludedChunkIds]
		});
		this.isBrainstorming = false;

		if (res.success && res.data) {
			this.writingBeats = res.data.beats;
			this.treePicks = res.data.trace?.tree_picks || [];
			this.ragChunks = res.data.trace?.vector_hits || [];
			toast_success('AI đã tạo dàn ý thành công!');
		} else {
			toast_error(res.message || 'Brainstorm thất bại');
		}
	}

	async doGenerate() {
		if (!this.writingBeats.trim()) return toast_error('Cần có dàn ý (beats)');
		if (!this.targetChapter || this.targetChapter < 1) return toast_error('Nhập số chương hợp lệ');

		this.isGenerating = true;
		const res = await this.http.post<any>('/admin/writer/generate', {
			target_chapter: this.targetChapter,
			writing_beats: this.writingBeats,
			custom_summary: this.customSummary || undefined,
			mmr_lambda: this.mmrLambda,
			temporal_lambda: this.temporalLambda,
			prompt_only: this.promptOnly,
			excluded_node_ids: [...this.excludedNodeIds],
			excluded_chunk_ids: [...this.excludedChunkIds]
		});
		this.isGenerating = false;

		if (res.success && res.data) {
			this.superPrompt = res.data.prompt || '';
			this.promptStats = res.data.stats || null;
			this.generatedText = res.data.generated_text || '';
			this.treePicks = res.data.tree_picks || [];
			this.ragChunks = res.data.rag_chunks || [];
			toast_success(this.promptOnly ? 'Prompt đã tổng hợp!' : 'AI đã viết xong!');
		} else {
			// Prompt dựng xong rồi LLM mới hỏng là chuyện thường; giữ lại phần
			// đã có để tác giả không phải chạy lại từ đầu chỉ để xem prompt.
			if (res.data) {
				this.superPrompt = res.data.prompt || '';
				this.promptStats = res.data.stats || null;
				this.treePicks = res.data.tree_picks || [];
				this.ragChunks = res.data.rag_chunks || [];
			}
			toast_error(res.message || 'Generate thất bại');
		}
	}

	toggleExcludedNode(id: number) {
		const next = new Set(this.excludedNodeIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.excludedNodeIds = next;
	}

	toggleExcludedChunk(id: number) {
		const next = new Set(this.excludedChunkIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.excludedChunkIds = next;
	}

	clearExclusions() {
		this.excludedNodeIds = new Set();
		this.excludedChunkIds = new Set();
	}

	async saveAndAnalyze() {
		if (!this.generatedText.trim()) return;
		this.isSavingAnalyze = true;
		const res = await this.http.post<any>('/admin/writer/chapter-logs/auto', {
			chapter_number: this.targetChapter,
			content: this.generatedText
		});
		this.isSavingAnalyze = false;
		if (res.success) {
			toast_success(`Đã lưu & phân tích chương ${this.targetChapter} vào Biên Niên Sử!`);
			await this.hooks.refreshChapterLogs();
			await this.hooks.refreshStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	// ─── Lịch sử sáng tác ───

	async loadGenerations() {
		const res = await this.http.get<any[]>('/admin/writer/generations');
		if (res.success && res.data) {
			this.generations = res.data;
			this.historyLoaded = true;
		}
	}

	async loadGenerationInto(id: number) {
		const res = await this.http.get<any>(`/admin/writer/generations/${id}`);
		if (res.success && res.data) {
			const generation = res.data;
			this.targetChapter = generation.target_chapter || this.targetChapter;
			if (generation.kind === 'brainstorm') {
				this.brainstormGoal = generation.beats || this.brainstormGoal;
				this.writingBeats = generation.output || '';
			} else {
				this.writingBeats = generation.beats || '';
				this.superPrompt = generation.prompt || '';
				this.generatedText = generation.output || '';
			}
			toast_success('Đã nạp lại từ lịch sử');
		} else toast_error(res.message || 'Lỗi');
	}

	async removeGeneration(id: number) {
		if (!confirm('Xóa mục lịch sử này?')) return;
		const res = await this.http.del(`/admin/writer/generations/${id}`);
		if (res.success) await this.loadGenerations();
		else toast_error(res.message || 'Lỗi');
	}

	// ─── Cài đặt model ───

	async loadSettings() {
		const [saved, providers] = await Promise.all([
			this.http.get<any>('/admin/writer/settings'),
			this.http.get<any[]>('/admin/writer/models')
		]);
		if (saved.success && saved.data) this.settings = { ...this.settings, ...saved.data };
		if (providers.success && providers.data) this.modelProviders = providers.data;
	}

	async saveSettings() {
		this.isSavingSettings = true;
		const res = await this.http.put('/admin/writer/settings', {
			gen_provider: this.settings.gen_provider ?? '',
			gen_model: this.settings.gen_model ?? '',
			gen_max_tokens: this.settings.gen_max_tokens
				? parseInt(String(this.settings.gen_max_tokens))
				: undefined,
			worker_model: this.settings.worker_model ?? ''
		});
		this.isSavingSettings = false;
		if (res.success) toast_success('Đã lưu cài đặt AI');
		else toast_error(res.message || 'Lỗi');
	}
}
