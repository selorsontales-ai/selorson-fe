import { toast_error, toast_success } from '$lib/stores/admin.svelte';
import type { CoWriterHooks, CoWriterHttp } from './admin-http.svelte';

// ═══════════════════════════════════════════════
//  Biên Niên Sử — nhật ký, nguồn quét, cây tri thức
// ═══════════════════════════════════════════════
// Tab này sở hữu kho tư liệu: quét thư mục, lập chỉ mục, và cây mục lục mà
// truy xuất đi qua. Quét xong thì cây cũ hết đúng, nên nó tự đánh dấu phải
// tải lại — không tab nào khác cần biết chuyện đó.

export class ChronicleState {
	// Nhật ký chương
	chapterLogs = $state<any[]>([]);
	autoLogContent = $state('');
	autoLogChapter = $state(1);
	isAutoAnalyzing = $state(false);
	manualLogOpen = $state(false);
	manualLogChapter = $state(1);
	manualLogSummary = $state('');
	manualLogEvents = $state('');
	manualLogSeeds = $state('');

	// Lập chỉ mục
	documents = $state<any[]>([]);
	isScanning = $state(false);
	scanResult = $state<any>(null);
	scanProgress = $state<any>(null);

	// Nguồn quét
	scanSources = $state<any[]>([]);
	showAddSource = $state(false);
	newSourceLabel = $state('');
	newSourcePath = $state('');
	newSourceCategory = $state('references');
	newSourceRecursive = $state(true);

	// Duyệt thư mục
	showFolderBrowser = $state(false);
	browseCurrentPath = $state('');
	browseDirs = $state<string[]>([]);
	browseDrives = $state<string[]>([]);
	isBrowsing = $state(false);

	// Cây tri thức
	treeDocs = $state<any[]>([]);
	treeLoaded = $state(false);
	isLoadingTree = $state(false);

	constructor(
		private http: CoWriterHttp,
		private hooks: CoWriterHooks
	) {}

	busy(): boolean {
		return this.isScanning || this.isAutoAnalyzing;
	}

	reset() {
		this.chapterLogs = [];
		this.documents = [];
		this.scanSources = [];
		this.scanResult = null;
		this.treeDocs = [];
		this.treeLoaded = false;
	}

	async load() {
		await Promise.all([this.loadChapterLogs(), this.loadDocuments()]);
		if (this.http.allows('local_source_scan')) await this.loadScanSources();
	}

	async loadChapterLogs() {
		const res = await this.http.get<any[]>('/admin/writer/chapter-logs');
		if (res.success && res.data) this.chapterLogs = res.data;
	}

	async loadDocuments() {
		const res = await this.http.get<any[]>('/admin/writer/index/documents');
		if (res.success && res.data) this.documents = res.data;
	}

	// ─── Nhật ký chương ───

	async doAutoAnalyze() {
		if (!this.autoLogContent.trim()) return toast_error('Dán nội dung chương');
		if (!this.autoLogChapter || this.autoLogChapter < 1) return toast_error('Nhập số chương hợp lệ');
		this.isAutoAnalyzing = true;
		const res = await this.http.post<any>('/admin/writer/chapter-logs/auto', {
			chapter_number: this.autoLogChapter,
			content: this.autoLogContent
		});
		this.isAutoAnalyzing = false;
		if (res.success && res.data) {
			toast_success('AI đã phân tích chương thành công!');
			this.autoLogContent = '';
			await this.loadChapterLogs();
			await this.hooks.refreshStatus();
		} else toast_error(res.message || 'Phân tích thất bại');
	}

	async saveManualLog() {
		const res = await this.http.post('/admin/writer/chapter-logs/manual', {
			chapter_number: this.manualLogChapter,
			summary: this.manualLogSummary,
			key_events: this.manualLogEvents.split('\n').filter(Boolean),
			plot_seeds: this.manualLogSeeds.split('\n').filter(Boolean)
		});
		if (res.success) {
			toast_success('Đã lưu nhật ký');
			this.manualLogSummary = '';
			this.manualLogEvents = '';
			this.manualLogSeeds = '';
			await this.loadChapterLogs();
		} else toast_error(res.message || 'Lỗi');
	}

	editChapterLog(log: any) {
		this.manualLogChapter = log.chapter_number;
		this.manualLogSummary = log.summary || '';
		this.manualLogEvents = Array.isArray(log.key_events) ? log.key_events.join('\n') : '';
		this.manualLogSeeds = Array.isArray(log.plot_seeds) ? log.plot_seeds.join('\n') : '';
		this.manualLogOpen = true;
		toast_success(
			`Đã nạp chương ${log.chapter_number} vào form "Lưu Nhật Ký Thủ Công" — sửa xong bấm Lưu`
		);
	}

	async removeChapterLog(chapterNumber: number) {
		if (!confirm(`Xóa nhật ký chương ${chapterNumber}?`)) return;
		const res = await this.http.del(`/admin/writer/chapter-logs/${chapterNumber}`);
		if (res.success) {
			toast_success('Đã xóa nhật ký');
			await this.loadChapterLogs();
			await this.hooks.refreshStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	handleChapterFileImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Đoán số chương từ tên file để tác giả khỏi gõ lại
		const nameMatch = file.name.match(/(chuong|chapter|ch)[_\-\s]*(\d+)/i);
		if (nameMatch) this.autoLogChapter = parseInt(nameMatch[2]);

		const reader = new FileReader();
		reader.onload = (loaded) => {
			this.autoLogContent = ((loaded.target?.result as string) || '');
			toast_success(`Đã nạp "${file.name}" (${(this.autoLogContent.length / 1024).toFixed(1)} KB)`);
		};
		reader.readAsText(file);
		input.value = '';
	}

	// ─── Lập chỉ mục ───

	async doScanIndex() {
		this.isScanning = true;
		this.scanResult = null;
		const res = await this.http.post<any>('/admin/writer/index/scan', undefined, 'local_source_scan');
		if (!res.success) {
			this.isScanning = false;
			return toast_error(res.message || 'Scan thất bại');
		}
		void this.pollScanProgress();
	}

	async doRebuildIndex(skipConfirm = false) {
		if (
			!skipConfirm &&
			!confirm(
				'Re-index TOÀN BỘ: xóa index hiện tại và embed lại từ đầu (tốn thời gian + quota API). Tiếp tục?'
			)
		)
			return;
		this.isScanning = true;
		this.scanResult = null;
		const res = await this.http.post<any>(
			'/admin/writer/index/rebuild',
			undefined,
			'embedding_rebuild'
		);
		if (!res.success) {
			this.isScanning = false;
			return toast_error(res.message || 'Re-index thất bại');
		}
		void this.pollScanProgress();
	}

	async pollScanProgress() {
		const res = await this.http.get<any>('/admin/writer/index/progress');
		if (!res.success || !res.data) {
			this.isScanning = false;
			this.scanProgress = null;
			return;
		}
		this.scanProgress = res.data;
		if (res.data.running) {
			setTimeout(() => void this.pollScanProgress(), 1000);
			return;
		}
		this.isScanning = false;
		this.scanProgress = null;
		if (res.data.error) {
			toast_error(res.data.error);
			return;
		}
		if (res.data.result) {
			this.scanResult = res.data.result;
			toast_success(
				`Scan hoàn tất: ${res.data.result.files_new} mới, ${res.data.result.files_updated} cập nhật`
			);
			await this.loadDocuments();
			await this.hooks.refreshStatus();
			await this.hooks.refreshEmbedding?.();
			// Kho vừa đổi nên mục lục cũ không còn đúng; đánh dấu để lần mở
			// sau tải lại thay vì hiện một cây đã lỗi thời.
			this.treeLoaded = false;
			this.treeDocs = [];
		}
	}

	// ─── Nguồn quét ───

	async loadScanSources() {
		if (!this.http.allows('local_source_scan')) return;
		const res = await this.http.get<any[]>('/admin/writer/index/sources');
		if (res.success && res.data) this.scanSources = res.data;
	}

	async addScanSource() {
		if (!this.newSourceLabel.trim() || !this.newSourcePath.trim())
			return toast_error('Nhập tên và đường dẫn');
		const res = await this.http.post<any>(
			'/admin/writer/index/sources',
			{
				label: this.newSourceLabel,
				folder_path: this.newSourcePath,
				category: this.newSourceCategory,
				recursive: this.newSourceRecursive
			},
			'local_source_scan'
		);
		if (res.success) {
			toast_success('Đã thêm nguồn quét');
			this.newSourceLabel = '';
			this.newSourcePath = '';
			this.newSourceCategory = 'references';
			this.newSourceRecursive = true;
			this.showAddSource = false;
			await this.loadScanSources();
		} else toast_error(res.message || 'Lỗi');
	}

	async toggleSource(id: number, enabled: boolean) {
		const res = await this.http.put(
			`/admin/writer/index/sources/${id}/toggle`,
			{ enabled },
			'local_source_scan'
		);
		if (res.success) await this.loadScanSources();
		else toast_error(res.message || 'Lỗi');
	}

	async removeSource(id: number, label: string) {
		if (!confirm(`Xóa nguồn quét "${label}"?`)) return;
		const res = await this.http.del(
			`/admin/writer/index/sources/${id}`,
			undefined,
			'local_source_scan'
		);
		if (res.success) {
			toast_success('Đã xóa nguồn quét');
			await this.loadScanSources();
		} else toast_error(res.message || 'Lỗi');
	}

	// ─── Duyệt thư mục ───

	async openFolderBrowser() {
		if (!this.http.allows('local_source_scan')) {
			toast_error(
				this.http.denied<never>('local_source_scan').message || 'Không được phép duyệt thư mục.'
			);
			return;
		}
		this.showFolderBrowser = true;
		this.browseCurrentPath = '';
		this.isBrowsing = true;
		const res = await this.http.get<any>('/admin/writer/browse?path=');
		this.isBrowsing = false;
		if (res.success && res.data) {
			this.browseDirs = res.data.dirs || [];
			this.browseDrives = res.data.drives || [];
			this.browseCurrentPath = res.data.current || '';
		}
	}

	async browseTo(path: string) {
		if (!this.http.allows('local_source_scan')) {
			toast_error(
				this.http.denied<never>('local_source_scan').message || 'Không được phép duyệt thư mục.'
			);
			return;
		}
		this.isBrowsing = true;
		const res = await this.http.get<any>(`/admin/writer/browse?path=${encodeURIComponent(path)}`);
		this.isBrowsing = false;
		if (res.success && res.data) {
			this.browseDirs = res.data.dirs || [];
			this.browseCurrentPath = res.data.current || path;
		}
	}

	selectBrowsedFolder() {
		if (this.browseCurrentPath) {
			this.newSourcePath = this.browseCurrentPath;
			this.showFolderBrowser = false;
		}
	}

	// ─── Cây tri thức ───

	async loadTree() {
		this.isLoadingTree = true;
		const res = await this.http.get<any[]>('/admin/writer/tree');
		this.isLoadingTree = false;
		if (res.success && res.data) {
			this.treeDocs = res.data;
			this.treeLoaded = true;
		} else {
			toast_error(res.message || 'Không tải được cây tri thức');
		}
	}
}
