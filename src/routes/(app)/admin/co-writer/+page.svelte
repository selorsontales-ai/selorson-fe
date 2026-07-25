<!-- Co-Writer — AI Story Writing Assistant -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		toast_success,
		toast_error,
		showToast
	} from '$lib/stores/admin.svelte';

	// ═══════════════════ STATE ═══════════════════
	let activeTab = $state<'workshop' | 'worldbible' | 'chronicle'>('workshop');

	// Status
	let status = $state<any>(null);

	// Workshop
	let brainstormGoal = $state('');
	let targetChapter = $state(1);
	let writingBeats = $state('');
	let customSummary = $state('');
	let mmrLambda = $state(0.5);
	let temporalLambda = $state(0.005);
	let promptOnly = $state(false);
	let superPrompt = $state('');
	let promptStats = $state<any>(null);
	let generatedText = $state('');
	let isGenerating = $state(false);
	let isBrainstorming = $state(false);

	// Retrieval trace — nguồn AI đã đọc (tree picks + vector hits)
	let treePicks = $state<any[]>([]);
	let ragChunks = $state<any[]>([]);
	let excludedNodeIds = $state<Set<number>>(new Set());
	let excludedChunkIds = $state<Set<number>>(new Set());

	// Knowledge tree browser
	let treeDocs = $state<any[]>([]);
	let treeLoaded = $state(false);
	let isLoadingTree = $state(false);

	// Scan progress (background indexing)
	let scanProgress = $state<any>(null);

	// Generations history
	let generations = $state<any[]>([]);
	let historyLoaded = $state(false);
	let isSavingAnalyze = $state(false);

	// AI settings (provider/model/max_tokens/worker_model)
	let settings = $state<any>({ gen_provider: '', gen_model: '', gen_max_tokens: '', worker_model: '', default_worker_model: '' });
	let modelProviders = $state<any[]>([]);
	let isSavingSettings = $state(false);

	// World Bible extras
	let entitySearch = $state('');
	let expandedEntityIds = $state<Set<string>>(new Set());

	// Manual log form open-state (for "edit chapter log" jumps)
	let manualLogOpen = $state(false);

	// World Bible
	let entities = $state<any[]>([]);
	let entityFilter = $state('');
	let showEntityModal = $state(false);
	let editingEntity = $state<any>(null);
	let entityForm = $state({
		entity_type: 'character',
		name: '',
		aliases: '',
		role: '',
		first_chapter: 1,
		collision_priority: 1,
		description: '',
	});

	const filteredEntities = $derived(entities.filter((e) => {
		const q = entitySearch.trim().toLowerCase();
		if (!q) return true;
		return e.name?.toLowerCase().includes(q)
			|| e.id?.toLowerCase().includes(q)
			|| (Array.isArray(e.aliases) && e.aliases.some((a: string) => a.toLowerCase().includes(q)));
	}));

	// Chronicle
	let chapterLogs = $state<any[]>([]);
	let documents = $state<any[]>([]);
	let autoLogContent = $state('');
	let autoLogChapter = $state(1);
	let isAutoAnalyzing = $state(false);
	let isScanning = $state(false);
	let scanResult = $state<any>(null);
	let importFileInput: HTMLInputElement;

	// Entity Detection
	let entityDetectFileInput: HTMLInputElement;
	let isDetecting = $state(false);
	let detectedEntities = $state<any[]>([]);
	let showDetectModal = $state(false);
	let detectSelectedIds = $state<Set<number>>(new Set());

	// Folder Browser
	let showFolderBrowser = $state(false);
	let browseCurrentPath = $state('');
	let browseDirs = $state<string[]>([]);
	let browseDrives = $state<string[]>([]);
	let isBrowsing = $state(false);

	// Scan Sources
	let scanSources = $state<any[]>([]);
	let showAddSource = $state(false);
	let newSourceLabel = $state('');
	let newSourcePath = $state('');
	let newSourceCategory = $state('references');
	let newSourceRecursive = $state(true);

	// Manual chapter log
	let manualLogChapter = $state(1);
	let manualLogSummary = $state('');
	let manualLogEvents = $state('');
	let manualLogSeeds = $state('');

	const ENTITY_TYPES = [
		{ value: 'character', label: '👤 Nhân Vật', prefix: 'CHR' },
		{ value: 'location', label: '📍 Địa Danh', prefix: 'LOC' },
		{ value: 'legend', label: '📜 Truyền Thuyết', prefix: 'LGD' },
		{ value: 'item', label: '⚔️ Vật Phẩm', prefix: 'ITM' },
		{ value: 'event', label: '⚡ Sự Kiện', prefix: 'EVT' },
		{ value: 'organization', label: '🏛️ Tổ Chức', prefix: 'ORG' },
	];

	onMount(() => {
		loadStatus();
		loadEntities();
		loadChapterLogs();
		loadDocuments();
		loadScanSources();
		loadSettings();
	});

	// ═══════════════════ API CALLS ═══════════════════

	async function loadStatus() {
		const res = await adminGet<any>('/admin/writer/status');
		if (res.success) status = res.data;
	}

	async function loadEntities() {
		const typeParam = entityFilter ? `?type=${entityFilter}` : '';
		const res = await adminGet<any[]>(`/admin/writer/entities${typeParam}`);
		if (res.success && res.data) entities = res.data;
	}

	async function loadChapterLogs() {
		const res = await adminGet<any[]>('/admin/writer/chapter-logs');
		if (res.success && res.data) chapterLogs = res.data;
	}

	async function loadDocuments() {
		const res = await adminGet<any[]>('/admin/writer/index/documents');
		if (res.success && res.data) documents = res.data;
	}

	// Workshop
	async function doBrainstorm() {
		if (!brainstormGoal.trim()) return toast_error('Nhập định hướng chương');
		if (!targetChapter || targetChapter < 1) return toast_error('Nhập số chương hợp lệ');
		if (writingBeats.trim() && !confirm('Dàn ý (beats) đang có nội dung — brainstorm mới sẽ GHI ĐÈ lên. Tiếp tục?')) return;
		isBrainstorming = true;
		const res = await adminPost<any>('/admin/writer/brainstorm', {
			goal: brainstormGoal,
			target_chapter: targetChapter,
			excluded_node_ids: [...excludedNodeIds],
			excluded_chunk_ids: [...excludedChunkIds],
		});
		isBrainstorming = false;
		if (res.success && res.data) {
			writingBeats = res.data.beats;
			treePicks = res.data.trace?.tree_picks || [];
			ragChunks = res.data.trace?.vector_hits || [];
			toast_success('AI đã tạo dàn ý thành công!');
		} else {
			toast_error(res.message || 'Brainstorm thất bại');
		}
	}

	async function doGenerate() {
		if (!writingBeats.trim()) return toast_error('Cần có dàn ý (beats)');
		if (!targetChapter || targetChapter < 1) return toast_error('Nhập số chương hợp lệ');
		isGenerating = true;
		const res = await adminPost<any>('/admin/writer/generate', {
			target_chapter: targetChapter,
			writing_beats: writingBeats,
			custom_summary: customSummary || undefined,
			mmr_lambda: mmrLambda,
			temporal_lambda: temporalLambda,
			prompt_only: promptOnly,
			excluded_node_ids: [...excludedNodeIds],
			excluded_chunk_ids: [...excludedChunkIds],
		});
		isGenerating = false;
		if (res.success && res.data) {
			superPrompt = res.data.prompt || '';
			promptStats = res.data.stats || null;
			generatedText = res.data.generated_text || '';
			treePicks = res.data.tree_picks || [];
			ragChunks = res.data.rag_chunks || [];
			toast_success(promptOnly ? 'Prompt đã tổng hợp!' : 'AI đã viết xong!');
		} else {
			// Even on error, we might have partial data (prompt built but LLM failed)
			if (res.data) {
				superPrompt = res.data.prompt || '';
				promptStats = res.data.stats || null;
				treePicks = res.data.tree_picks || [];
				ragChunks = res.data.rag_chunks || [];
			}
			toast_error(res.message || 'Generate thất bại');
		}
	}

	function toggleExcludedNode(id: number) {
		const s = new Set(excludedNodeIds);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		excludedNodeIds = s;
	}

	function toggleExcludedChunk(id: number) {
		const s = new Set(excludedChunkIds);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		excludedChunkIds = s;
	}

	async function loadTree() {
		isLoadingTree = true;
		const res = await adminGet<any[]>('/admin/writer/tree');
		isLoadingTree = false;
		if (res.success && res.data) {
			treeDocs = res.data;
			treeLoaded = true;
		} else {
			toast_error(res.message || 'Không tải được cây tri thức');
		}
	}

	// World Bible
	async function saveEntity() {
		const aliasArr = entityForm.aliases.split(',').map(s => s.trim()).filter(Boolean);
		const payload = {
			...entityForm,
			aliases: aliasArr,
			first_chapter: entityForm.first_chapter,
			collision_priority: entityForm.collision_priority,
		};

		if (editingEntity) {
			const res = await adminPut(`/admin/writer/entities/${editingEntity.id}`, payload);
			if (res.success) {
				toast_success('Đã cập nhật entity');
				showEntityModal = false;
				loadEntities();
			} else toast_error(res.message || 'Lỗi');
		} else {
			const res = await adminPost<any>('/admin/writer/entities', payload);
			if (res.success) {
				toast_success(`Đã tạo ${res.data?.id}`);
				showEntityModal = false;
				loadEntities();
				loadStatus();
			} else toast_error(res.message || 'Lỗi');
		}
	}

	function openCreateEntity() {
		editingEntity = null;
		entityForm = {
			entity_type: 'character',
			name: '',
			aliases: '',
			role: '',
			first_chapter: 1,
			collision_priority: 1,
			description: '',
		};
		showEntityModal = true;
	}

	function openEditEntity(e: any) {
		editingEntity = e;
		entityForm = {
			entity_type: e.entity_type,
			name: e.name,
			aliases: Array.isArray(e.aliases) ? e.aliases.join(', ') : '',
			role: e.role || '',
			first_chapter: e.first_chapter || 1,
			collision_priority: e.collision_priority || 1,
			description: e.description || '',
		};
		showEntityModal = true;
	}

	async function removeEntity(id: string) {
		if (!confirm(`Xóa entity ${id}?`)) return;
		const res = await adminDelete(`/admin/writer/entities/${id}`);
		if (res.success) {
			toast_success('Đã xóa');
			loadEntities();
			loadStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	// Chronicle
	async function doAutoAnalyze() {
		if (!autoLogContent.trim()) return toast_error('Dán nội dung chương');
		if (!autoLogChapter || autoLogChapter < 1) return toast_error('Nhập số chương hợp lệ');
		isAutoAnalyzing = true;
		const res = await adminPost<any>('/admin/writer/chapter-logs/auto', {
			chapter_number: autoLogChapter,
			content: autoLogContent,
		});
		isAutoAnalyzing = false;
		if (res.success && res.data) {
			toast_success('AI đã phân tích chương thành công!');
			autoLogContent = '';
			loadChapterLogs();
			loadStatus();
		} else toast_error(res.message || 'Phân tích thất bại');
	}

	async function saveManualLog() {
		const res = await adminPost('/admin/writer/chapter-logs/manual', {
			chapter_number: manualLogChapter,
			summary: manualLogSummary,
			key_events: manualLogEvents.split('\n').filter(Boolean),
			plot_seeds: manualLogSeeds.split('\n').filter(Boolean),
		});
		if (res.success) {
			toast_success('Đã lưu nhật ký');
			manualLogSummary = '';
			manualLogEvents = '';
			manualLogSeeds = '';
			loadChapterLogs();
		} else toast_error(res.message || 'Lỗi');
	}

	async function doScanIndex() {
		isScanning = true;
		scanResult = null;
		const res = await adminPost<any>('/admin/writer/index/scan');
		if (!res.success) {
			isScanning = false;
			return toast_error(res.message || 'Scan thất bại');
		}
		pollScanProgress();
	}

	async function doRebuildIndex() {
		if (!confirm('Re-index TOÀN BỘ: xóa index hiện tại và embed lại từ đầu (tốn thời gian + quota API). Tiếp tục?')) return;
		isScanning = true;
		scanResult = null;
		const res = await adminPost<any>('/admin/writer/index/rebuild');
		if (!res.success) {
			isScanning = false;
			return toast_error(res.message || 'Re-index thất bại');
		}
		pollScanProgress();
	}

	async function pollScanProgress() {
		const res = await adminGet<any>('/admin/writer/index/progress');
		if (!res.success || !res.data) {
			isScanning = false;
			scanProgress = null;
			return;
		}
		scanProgress = res.data;
		if (res.data.running) {
			setTimeout(pollScanProgress, 1000);
			return;
		}
		isScanning = false;
		scanProgress = null;
		if (res.data.error) {
			toast_error(res.data.error);
		} else if (res.data.result) {
			scanResult = res.data.result;
			toast_success(`Scan hoàn tất: ${res.data.result.files_new} mới, ${res.data.result.files_updated} cập nhật`);
			loadDocuments();
			loadStatus();
			treeLoaded = false;
			treeDocs = [];
		}
	}

	// ═══════════════════ GENERATIONS HISTORY ═══════════════════

	async function loadGenerations() {
		const res = await adminGet<any[]>('/admin/writer/generations');
		if (res.success && res.data) {
			generations = res.data;
			historyLoaded = true;
		}
	}

	async function loadGenerationInto(id: number) {
		const res = await adminGet<any>(`/admin/writer/generations/${id}`);
		if (res.success && res.data) {
			const g = res.data;
			targetChapter = g.target_chapter || targetChapter;
			if (g.kind === 'brainstorm') {
				brainstormGoal = g.beats || brainstormGoal;
				writingBeats = g.output || '';
			} else {
				writingBeats = g.beats || '';
				superPrompt = g.prompt || '';
				generatedText = g.output || '';
			}
			toast_success('Đã nạp lại từ lịch sử');
		} else toast_error(res.message || 'Lỗi');
	}

	async function removeGeneration(id: number) {
		if (!confirm('Xóa mục lịch sử này?')) return;
		const res = await adminDelete(`/admin/writer/generations/${id}`);
		if (res.success) loadGenerations();
		else toast_error(res.message || 'Lỗi');
	}

	async function saveAndAnalyze() {
		if (!generatedText.trim()) return;
		isSavingAnalyze = true;
		const res = await adminPost<any>('/admin/writer/chapter-logs/auto', {
			chapter_number: targetChapter,
			content: generatedText,
		});
		isSavingAnalyze = false;
		if (res.success) {
			toast_success(`Đã lưu & phân tích chương ${targetChapter} vào Biên Niên Sử!`);
			loadChapterLogs();
			loadStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	// ═══════════════════ AI SETTINGS ═══════════════════

	async function loadSettings() {
		const [s, m] = await Promise.all([
			adminGet<any>('/admin/writer/settings'),
			adminGet<any[]>('/admin/writer/models'),
		]);
		if (s.success && s.data) settings = { ...settings, ...s.data };
		if (m.success && m.data) modelProviders = m.data;
	}

	async function saveSettings() {
		isSavingSettings = true;
		const res = await adminPut('/admin/writer/settings', {
			gen_provider: settings.gen_provider ?? '',
			gen_model: settings.gen_model ?? '',
			gen_max_tokens: settings.gen_max_tokens ? parseInt(String(settings.gen_max_tokens)) : undefined,
			worker_model: settings.worker_model ?? '',
		});
		isSavingSettings = false;
		if (res.success) toast_success('Đã lưu cài đặt AI');
		else toast_error(res.message || 'Lỗi');
	}

	// ═══════════════════ CHAPTER LOG EDIT/DELETE ═══════════════════

	function editChapterLog(log: any) {
		manualLogChapter = log.chapter_number;
		manualLogSummary = log.summary || '';
		manualLogEvents = Array.isArray(log.key_events) ? log.key_events.join('\n') : '';
		manualLogSeeds = Array.isArray(log.plot_seeds) ? log.plot_seeds.join('\n') : '';
		manualLogOpen = true;
		toast_success(`Đã nạp chương ${log.chapter_number} vào form "Lưu Nhật Ký Thủ Công" — sửa xong bấm Lưu`);
	}

	async function removeChapterLog(n: number) {
		if (!confirm(`Xóa nhật ký chương ${n}?`)) return;
		const res = await adminDelete(`/admin/writer/chapter-logs/${n}`);
		if (res.success) {
			toast_success('Đã xóa nhật ký');
			loadChapterLogs();
			loadStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	function toggleEntityExpand(id: string) {
		const s = new Set(expandedEntityIds);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		expandedEntityIds = s;
	}

	// Scan Sources
	async function loadScanSources() {
		const res = await adminGet<any[]>('/admin/writer/index/sources');
		if (res.success && res.data) scanSources = res.data;
	}

	async function addScanSource() {
		if (!newSourceLabel.trim() || !newSourcePath.trim()) return toast_error('Nhập tên và đường dẫn');
		const res = await adminPost<any>('/admin/writer/index/sources', {
			label: newSourceLabel,
			folder_path: newSourcePath,
			category: newSourceCategory,
			recursive: newSourceRecursive,
		});
		if (res.success) {
			toast_success('Đã thêm nguồn quét');
			newSourceLabel = '';
			newSourcePath = '';
			newSourceCategory = 'references';
			newSourceRecursive = true;
			showAddSource = false;
			loadScanSources();
		} else toast_error(res.message || 'Lỗi');
	}

	async function toggleSource(id: number, enabled: boolean) {
		const res = await adminPut(`/admin/writer/index/sources/${id}/toggle`, { enabled });
		if (res.success) loadScanSources();
		else toast_error(res.message || 'Lỗi');
	}

	async function removeSource(id: number, label: string) {
		if (!confirm(`Xóa nguồn quét "${label}"?`)) return;
		const res = await adminDelete(`/admin/writer/index/sources/${id}`);
		if (res.success) {
			toast_success('Đã xóa nguồn quét');
			loadScanSources();
		} else toast_error(res.message || 'Lỗi');
	}

	// ═══════════════════ FILE IMPORT ═══════════════════

	function handleChapterFileImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Auto-detect chapter number from filename
		const nameMatch = file.name.match(/(chuong|chapter|ch)[_\-\s]*(\d+)/i);
		if (nameMatch) {
			autoLogChapter = parseInt(nameMatch[2]);
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			autoLogContent = e.target?.result as string || '';
			toast_success(`Đã nạp "${file.name}" (${(autoLogContent.length / 1024).toFixed(1)} KB)`);
		};
		reader.readAsText(file);
		input.value = ''; // Reset for re-select
	}

	// ═══════════════════ ENTITY DETECTION ═══════════════════

	function handleEntityDetectFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (e) => {
			const content = e.target?.result as string || '';
			isDetecting = true;
			const res = await adminPost<any>('/admin/writer/entities/detect', { content });
			isDetecting = false;
			if (res.success && res.data) {
				detectedEntities = res.data;
				// Index theo mảng GỐC — filter trước rồi map index sẽ tick nhầm phần tử
				detectSelectedIds = new Set(
					res.data.map((e: any, i: number) => (e.is_new ? i : -1)).filter((i: number) => i >= 0)
				);
				showDetectModal = true;
				toast_success(`AI phát hiện ${res.data.length} entities`);
				if ((res as any).truncated) {
					showToast('File dài — AI chỉ phân tích ~8KB đầu tiên', 'info');
				}
			} else toast_error(res.message || 'Phát hiện thất bại');
		};
		reader.readAsText(file);
		input.value = '';
	}

	function toggleDetectedEntity(idx: number) {
		const newSet = new Set(detectSelectedIds);
		if (newSet.has(idx)) newSet.delete(idx);
		else newSet.add(idx);
		detectSelectedIds = newSet;
	}

	async function approveDetectedEntities() {
		let added = 0;
		for (const idx of detectSelectedIds) {
			const e = detectedEntities[idx];
			if (!e || !e.is_new) continue;
			const res = await adminPost<any>('/admin/writer/entities', {
				entity_type: e.entity_type,
				name: e.name,
				aliases: e.aliases || [],
				role: e.role || '',
				description: e.description || '',
				first_chapter: e.first_chapter || 1,
				collision_priority: 1,
			});
			if (res.success) added++;
		}
		showDetectModal = false;
		if (added > 0) {
			toast_success(`Đã thêm ${added} entities mới!`);
			loadEntities();
			loadStatus();
		}
	}

	// ═══════════════════ FOLDER BROWSER ═══════════════════

	async function openFolderBrowser() {
		showFolderBrowser = true;
		browseCurrentPath = '';
		// Load drives
		isBrowsing = true;
		const res = await adminGet<any>('/admin/writer/browse?path=');
		isBrowsing = false;
		if (res.success && res.data) {
			browseDirs = res.data.dirs || [];
			browseDrives = res.data.drives || [];
			browseCurrentPath = res.data.current || '';
		}
	}

	async function browseTo(path: string) {
		isBrowsing = true;
		const res = await adminGet<any>(`/admin/writer/browse?path=${encodeURIComponent(path)}`);
		isBrowsing = false;
		if (res.success && res.data) {
			browseDirs = res.data.dirs || [];
			browseCurrentPath = res.data.current || path;
		}
	}

	function selectBrowsedFolder() {
		if (browseCurrentPath) {
			newSourcePath = browseCurrentPath;
			showFolderBrowser = false;
		}
	}

	function getEntityIcon(type: string) {
		return ENTITY_TYPES.find(t => t.value === type)?.label?.split(' ')[0] || '📌';
	}
</script>

<svelte:head>
	<title>✍️ Trợ Lý Sáng Tác — Admin</title>
</svelte:head>

<div class="cw-page">
	<!-- Header -->
	<div class="cw-header">
		<div class="cw-title">
			<h1>✍️ Trợ Lý Sáng Tác</h1>
			<p class="cw-subtitle">AI Co-Writer — Hệ thống hỗ trợ viết truyện</p>
		</div>
		{#if status}
			<div class="cw-stats">
				<div class="stat-chip">📄 {status.total_documents} tài liệu</div>
				<div class="stat-chip">🧩 {status.total_chunks} chunks</div>
				<div class="stat-chip">🌍 {status.total_entities} entities</div>
				<div class="stat-chip">📜 {status.total_chapter_logs} chương</div>
				{#if status.data_dir}
					<div class="stat-chip" title="Thư mục dữ liệu backend đang dùng — nếu sai, đặt CO_WRITER_DATA_DIR trong .env backend">
						📁 {status.data_dir}
					</div>
				{/if}
				{#if status.embedding_model}
					<div class="stat-chip" title="Model embedding đã chốt cho toàn kho">
						🧬 {status.embedding_model}@{status.embedding_dim}
					</div>
				{/if}
				{#if status.foreign_embeddings > 0}
					<div class="stat-chip stat-warn" title="Có chunk được embed bằng model cũ — bấm Re-index Toàn Bộ ở tab Biên Niên Sử">
						⚠️ {status.foreign_embeddings} chunk model cũ
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="cw-tabs">
		<button class="tab-btn" class:active={activeTab === 'workshop'} onclick={() => activeTab = 'workshop'}>
			✍️ Xưởng Viết
		</button>
		<button class="tab-btn" class:active={activeTab === 'worldbible'} onclick={() => activeTab = 'worldbible'}>
			🌍 Kinh Thánh Thế Giới
		</button>
		<button class="tab-btn" class:active={activeTab === 'chronicle'} onclick={() => activeTab = 'chronicle'}>
			📜 Biên Niên Sử
		</button>
	</div>

	<!-- Tab Content -->
	<div class="cw-content">
		<!-- ═══════════ TAB 1: WORKSHOP ═══════════ -->
		{#if activeTab === 'workshop'}
			<div class="workshop-flow">
				<!-- Brainstorm + Chapter -->
				<div class="card">
					<h3 class="card-title">🧠 Brainstorm Dàn Ý</h3>
					<div class="form-grid-2">
						<div class="form-row">
							<label>Chương đang viết</label>
							<input type="number" bind:value={targetChapter} min="1" class="input-sm" />
						</div>
					</div>
					<div class="form-row">
						<label>Định hướng chương mới</label>
						<textarea bind:value={brainstormGoal} placeholder="Ví dụ: Okita gặp kẻ thù cũ tại lễ hội, cuộc đối đầu bất ngờ..." rows="3"></textarea>
					</div>
					<button class="btn btn-primary" onclick={doBrainstorm} disabled={isBrainstorming}>
						{isBrainstorming ? '⏳ Đang suy nghĩ...' : '🧠 AI Brainstorm'}
					</button>
				</div>

				<!-- Beats Editor — Full Width -->
				<div class="card">
					<h3 class="card-title">📝 Dàn Ý Chi Tiết (Beats)</h3>
					<textarea bind:value={writingBeats} placeholder="AI sẽ điền hoặc bạn tự nhập dàn ý chi tiết cho chương..." rows="12" class="beats-editor"></textarea>
				</div>

				<!-- Settings row -->
				<div class="card card-compact">
					<details>
						<summary class="card-title clickable">⚙️ Cài Đặt Nâng Cao</summary>
						<div class="settings-grid" style="padding-top: 0.75rem;">
							<div class="form-row">
								<label>Tóm tắt bổ sung</label>
								<textarea bind:value={customSummary} placeholder="Bổ sung ngữ cảnh nếu cần..." rows="2"></textarea>
							</div>
							<div class="form-grid-2">
								<div class="slider-row">
									<label>Ưu tiên liên quan (giảm để nguồn đa dạng hơn): {mmrLambda.toFixed(2)}</label>
									<input type="range" min="0" max="1" step="0.05" bind:value={mmrLambda} />
								</div>
								<div class="slider-row">
									<label>Ưu tiên chương gần (0 = tắt): {temporalLambda.toFixed(3)}</label>
									<input type="range" min="0" max="0.02" step="0.001" bind:value={temporalLambda} />
								</div>
							</div>
							<label class="checkbox-row">
								<input type="checkbox" bind:checked={promptOnly} />
								Chỉ xuất prompt (không gọi AI viết)
							</label>

							<!-- AI model settings -->
							<div class="ai-settings">
								<h4 class="sources-sub">🤖 Model AI</h4>
								<div class="form-grid-2">
									<div class="form-row">
										<label>Nhà cung cấp viết chương</label>
										<select bind:value={settings.gen_provider}>
											<option value="">Tự động (theo thứ tự)</option>
											{#each modelProviders as p}
												<option value={p.id}>{p.name} — {p.key_count} key</option>
											{/each}
										</select>
									</div>
									<div class="form-row">
										<label>Model (trống = mặc định)</label>
										<input type="text" bind:value={settings.gen_model}
											placeholder={modelProviders.find((p) => p.id === settings.gen_provider)?.default_model || 'mặc định của provider'} />
									</div>
								</div>
								<div class="form-grid-2">
									<div class="form-row">
										<label>Max tokens viết chương</label>
										<input type="number" bind:value={settings.gen_max_tokens} placeholder="16384" min="1024" step="1024" />
									</div>
									<div class="form-row">
										<label>Model phụ (tóm tắt / chọn nguồn)</label>
										<input type="text" bind:value={settings.worker_model}
											placeholder={settings.default_worker_model || 'gemini-2.5-flash'} />
									</div>
								</div>
								<button class="btn" onclick={saveSettings} disabled={isSavingSettings}>
									{isSavingSettings ? '⏳ Đang lưu...' : '💾 Lưu cài đặt AI'}
								</button>
							</div>
						</div>
					</details>
				</div>

				<button class="btn btn-accent btn-lg" onclick={doGenerate} disabled={isGenerating}>
					{isGenerating
						? (promptOnly ? '⏳ Đang tổng hợp prompt...' : '⏳ AI đang viết chương...')
						: (promptOnly ? '📋 Tổng Hợp Prompt (không gọi AI)' : '✍️ AI Viết Chương')}
				</button>

				<!-- Sources Panel — nguồn AI đã đọc (brainstorm + generate) -->
				{#if treePicks.length > 0 || ragChunks.length > 0}
					<div class="card">
						<h3 class="card-title">📚 Nguồn AI Đã Đọc</h3>
						<p class="text-muted sources-hint">
							Bỏ chọn nguồn không phù hợp rồi chạy lại — AI sẽ bỏ qua nguồn đó ở lần sau.
						</p>
						{#if treePicks.length > 0}
							<h4 class="sources-sub">🌲 Chọn theo suy luận trên mục lục</h4>
							{#each treePicks as pick}
								<label class="source-pick" class:excluded={excludedNodeIds.has(pick.node_id)}>
									<input type="checkbox"
										checked={!excludedNodeIds.has(pick.node_id)}
										onchange={() => toggleExcludedNode(pick.node_id)} />
									<div class="source-pick-info">
										<div class="source-pick-title">
											<strong>{pick.title}</strong>
											<span class="source-pick-file">{pick.source_file}</span>
											<span class="source-pick-badge">~{pick.used_tokens} tokens</span>
										</div>
										{#if pick.reason}
											<p class="source-pick-reason">💭 {pick.reason}</p>
										{/if}
									</div>
								</label>
							{/each}
						{/if}
						{#if ragChunks.length > 0}
							<h4 class="sources-sub">🎯 Chọn theo độ tương đồng (vector)</h4>
							{#each ragChunks as chunk}
								<label class="source-pick" class:excluded={excludedChunkIds.has(chunk.chunk_id)}>
									<input type="checkbox"
										checked={!excludedChunkIds.has(chunk.chunk_id)}
										onchange={() => toggleExcludedChunk(chunk.chunk_id)} />
									<div class="source-pick-info">
										<div class="source-pick-title">
											<strong>{chunk.source_file}</strong>
											{#if chunk.heading}<span class="source-pick-file">{chunk.heading}</span>{/if}
											<span class="source-pick-badge">{Math.round((chunk.raw_similarity || 0) * 100)}% khớp</span>
										</div>
									</div>
								</label>
							{/each}
						{/if}
						{#if excludedNodeIds.size > 0 || excludedChunkIds.size > 0}
							<button class="btn btn-sm" style="margin-top: 0.5rem;"
								onclick={() => { excludedNodeIds = new Set(); excludedChunkIds = new Set(); }}>
								↺ Bỏ loại trừ ({excludedNodeIds.size + excludedChunkIds.size})
							</button>
						{/if}
					</div>
				{/if}

				<!-- Output Section -->
				{#if promptStats || superPrompt || generatedText}
					<div class="workshop-output">
						{#if promptStats}
							<div class="card">
								<h3 class="card-title">📊 Token Budget</h3>
								<div class="budget-bars">
									<div class="budget-item">
										<span>Lịch sử: {promptStats.history_tokens}/{promptStats.history_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (promptStats.history_tokens / promptStats.history_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-item">
										<span>Nhân vật: {promptStats.characters_tokens}/{promptStats.characters_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (promptStats.characters_tokens / promptStats.characters_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-item">
										<span>World Lore: {promptStats.world_lore_tokens}/{promptStats.world_lore_budget}</span>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {Math.min(100, (promptStats.world_lore_tokens / promptStats.world_lore_budget) * 100)}%"></div>
										</div>
									</div>
									<div class="budget-total">
										Tổng: <strong>{promptStats.total_tokens}</strong> tokens
									</div>
								</div>
							</div>
						{/if}

						{#if generatedText}
							<div class="card">
								<h3 class="card-title">📖 Kết Quả AI</h3>
								<div class="output-text">{generatedText}</div>
								<div class="btn-row">
									<button class="btn btn-sm" onclick={() => navigator.clipboard.writeText(generatedText)}>
										📋 Copy
									</button>
									<button class="btn btn-sm btn-primary" onclick={saveAndAnalyze} disabled={isSavingAnalyze}>
										{isSavingAnalyze ? '⏳ Đang phân tích...' : `💾 Lưu & Phân Tích Chương ${targetChapter}`}
									</button>
								</div>
							</div>
						{/if}

						{#if superPrompt}
							<div class="card">
								<h3 class="card-title">📋 Super Prompt</h3>
								<details>
									<summary>Xem prompt đầy đủ ({superPrompt.length} ký tự)</summary>
									<pre class="prompt-preview">{superPrompt}</pre>
								</details>
								<button class="btn btn-sm" onclick={() => navigator.clipboard.writeText(superPrompt)}>
									📋 Copy Prompt
								</button>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Generation History -->
				<div class="card card-compact">
					<details ontoggle={(e) => {
						if ((e.currentTarget as HTMLDetailsElement).open && !historyLoaded) loadGenerations();
					}}>
						<summary class="card-title clickable">🕘 Lịch Sử Sáng Tác</summary>
						<div class="history-list">
							{#if historyLoaded && generations.length === 0}
								<p class="text-muted">Chưa có lịch sử — mỗi lần Brainstorm / AI Viết sẽ tự lưu vào đây.</p>
							{/if}
							{#each generations as gen}
								<div class="history-item">
									<div class="history-info">
										<div class="history-title">
											{gen.kind === 'brainstorm' ? '🧠' : '✍️'}
											<strong>Chương {gen.target_chapter}</strong>
											<span class="source-pick-file">{gen.model}</span>
											<span class="source-pick-badge">{gen.created_at?.split('.')[0]?.replace('T', ' ') || ''}</span>
										</div>
										{#if gen.preview}
											<p class="history-preview">{gen.preview}</p>
										{/if}
									</div>
									<div class="history-actions">
										<button class="btn btn-sm" onclick={() => loadGenerationInto(gen.id)}>↩ Nạp lại</button>
										<button class="btn-icon btn-danger-icon" onclick={() => removeGeneration(gen.id)} title="Xóa">🗑️</button>
									</div>
								</div>
							{/each}
						</div>
					</details>
				</div>
			</div>

		<!-- ═══════════ TAB 2: WORLD BIBLE ═══════════ -->
		{:else if activeTab === 'worldbible'}
			<div class="worldbible">
				<!-- Filter + Actions -->
				<div class="wb-toolbar">
					<div class="wb-filters">
						<button class="filter-chip" class:active={entityFilter === ''} onclick={() => { entityFilter = ''; loadEntities(); }}>
							Tất cả
						</button>
						{#each ENTITY_TYPES as et}
							<button class="filter-chip" class:active={entityFilter === et.value} onclick={() => { entityFilter = et.value; loadEntities(); }}>
								{et.label}
							</button>
						{/each}
					</div>
					<div class="wb-actions">
						<input type="text" class="entity-search" placeholder="🔍 Tìm tên / bí danh / ID..." bind:value={entitySearch} />
						<button class="btn" onclick={() => entityDetectFileInput.click()} disabled={isDetecting}>
							{isDetecting ? '⏳ Đang phát hiện...' : '🔍 Import & Phát Hiện Entity'}
						</button>
						<button class="btn btn-primary" onclick={openCreateEntity}>+ Tạo Entity</button>
					</div>
				</div>

				<!-- Entity Table -->
				<div class="entity-grid">
					{#each filteredEntities as entity}
						<div class="entity-card">
							<div class="entity-card-header">
								<span class="entity-icon">{getEntityIcon(entity.entity_type)}</span>
								<span class="entity-id">{entity.id}</span>
								{#if entity.role}
									<span class="entity-role">{entity.role}</span>
								{/if}
							</div>
							<h4 class="entity-name">{entity.name}</h4>
							{#if entity.aliases?.length > 0}
								<p class="entity-aliases">
									{Array.isArray(entity.aliases) ? entity.aliases.join(', ') : ''}
								</p>
							{/if}
							{#if entity.description}
								{#if expandedEntityIds.has(entity.id) || entity.description.length <= 120}
									<p class="entity-desc">{entity.description}</p>
								{:else}
									<p class="entity-desc">{entity.description.substring(0, 120)}...</p>
								{/if}
								{#if entity.description.length > 120}
									<button class="entity-desc-toggle" onclick={() => toggleEntityExpand(entity.id)}>
										{expandedEntityIds.has(entity.id) ? '▲ Thu gọn' : '▼ Xem đầy đủ'}
									</button>
								{/if}
							{/if}
							<div class="entity-actions">
								<button class="btn btn-sm" onclick={() => openEditEntity(entity)}>✏️</button>
								<button class="btn btn-sm btn-danger" onclick={() => removeEntity(entity.id)}>🗑️</button>
							</div>
						</div>
					{:else}
						<div class="empty-state full-width">
							<div class="empty-icon">🌍</div>
							<p>Chưa có entity nào. Bấm <strong>+ Tạo Entity</strong> để bắt đầu xây dựng thế giới.</p>
						</div>
					{/each}
				</div>
			</div>

		<!-- ═══════════ TAB 3: CHRONICLE ═══════════ -->
		{:else if activeTab === 'chronicle'}
			<div class="chronicle-layout">
				<!-- Auto Analysis -->
				<div class="card">
					<h3 class="card-title">🤖 AI Phân Tích Chương Tự Động</h3>
					<div class="form-row">
						<label>Số chương</label>
						<input type="number" bind:value={autoLogChapter} min="1" class="input-sm" />
					</div>
					<div class="form-row">
						<label>Dán nội dung chương</label>
						<textarea bind:value={autoLogContent} placeholder="Dán toàn bộ nội dung chương vào đây, hoặc bấm Import File bên dưới..." rows="6"></textarea>
					</div>
					<div class="btn-row">
						<button class="btn" onclick={() => importFileInput.click()}>
							📂 Import File (.md / .txt)
						</button>
						<button class="btn btn-primary" onclick={doAutoAnalyze} disabled={isAutoAnalyzing}>
							{isAutoAnalyzing ? '⏳ Đang phân tích...' : '🤖 AI Phân Tích & Lưu'}
						</button>
					</div>
				</div>

				<!-- Manual Log -->
				<div class="card card-compact">
					<details bind:open={manualLogOpen}>
						<summary class="card-title clickable">📝 Lưu Nhật Ký Thủ Công</summary>
						<div class="manual-form">
							<div class="form-row">
								<label>Chương</label>
								<input type="number" bind:value={manualLogChapter} min="1" class="input-sm" />
							</div>
							<div class="form-row">
								<label>Tóm tắt</label>
								<textarea bind:value={manualLogSummary} rows="2" placeholder="Tóm tắt ngắn..."></textarea>
							</div>
							<div class="form-row">
								<label>Sự kiện chính (mỗi dòng 1 sự kiện)</label>
								<textarea bind:value={manualLogEvents} rows="3" placeholder="Sự kiện 1&#10;Sự kiện 2"></textarea>
							</div>
							<div class="form-row">
								<label>Mầm cốt truyện (mỗi dòng 1 mầm)</label>
								<textarea bind:value={manualLogSeeds} rows="3" placeholder="Phục bút 1&#10;Phục bút 2"></textarea>
							</div>
							<button class="btn btn-primary" onclick={saveManualLog}>💾 Lưu</button>
						</div>
					</details>
				</div>

				<!-- Timeline -->
				{#if chapterLogs.length > 0}
					<div class="card">
						<h3 class="card-title">📅 Timeline Cốt Truyện</h3>
						<div class="timeline">
							{#each chapterLogs as log}
								<div class="timeline-item">
									<div class="timeline-marker">CH{log.chapter_number}</div>
									<div class="timeline-content">
										<div class="timeline-head">
											<p class="timeline-summary">{log.summary}</p>
											<div class="timeline-actions">
												<button class="btn-icon" onclick={() => editChapterLog(log)} title="Sửa">✏️</button>
												<button class="btn-icon btn-danger-icon" onclick={() => removeChapterLog(log.chapter_number)} title="Xóa">🗑️</button>
											</div>
										</div>
										{#if log.key_events?.length > 0}
											<div class="timeline-events">
												{#each log.key_events as evt}
													<span class="event-tag">⚡ {evt}</span>
												{/each}
											</div>
										{/if}
										{#if log.plot_seeds?.length > 0}
											<div class="timeline-seeds">
												{#each log.plot_seeds as seed}
													<span class="seed-tag">🌱 {seed}</span>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Folder Indexing -->
				<div class="card">
					<h3 class="card-title">📂 Nguồn Dữ Liệu & Index</h3>
					<p class="text-muted" style="margin: 0 0 1rem; font-size: 0.8rem;">
						Quản lý các thư mục sẽ được quét để học dữ liệu. Có thể dùng đường dẫn tuyệt đối (ví dụ: <code>E:/MyStory</code>)
						hoặc tương đối so với thư mục gốc (<code>{status?.data_dir || 'co-writer-data'}</code>).
						Thư mục cha sẽ quét luôn tất cả thư mục con.
					</p>

					<!-- Scan Sources List -->
					<div class="sources-list">
						{#each scanSources as src}
							<div class="source-item" class:disabled={!src.enabled}>
								<div class="source-info">
									<div class="source-header">
										<span class="source-label">{src.label}</span>
										<span class="category-badge">{src.category}</span>
										{#if src.recursive}
											<span class="badge-recursive" title="Quét đệ quy thư mục con">🔄 Đệ quy</span>
										{:else}
											<span class="badge-flat" title="Chỉ quét thư mục gốc">📁 Gốc</span>
										{/if}
									</div>
									<code class="source-path">{src.folder_path}</code>
								</div>
								<div class="source-actions">
									<label class="toggle-switch" title={src.enabled ? 'Đang bật' : 'Đang tắt'}>
										<input type="checkbox" checked={src.enabled}
											onchange={() => toggleSource(src.id, !src.enabled)} />
										<span class="toggle-slider"></span>
									</label>
									<button class="btn-icon btn-danger-icon" onclick={() => removeSource(src.id, src.label)} title="Xóa">
										🗑️
									</button>
								</div>
							</div>
						{/each}
						{#if scanSources.length === 0}
							<p class="text-muted">Chưa có nguồn quét nào. Thêm thư mục bên dưới.</p>
						{/if}
					</div>

					<!-- Add Source Form -->
					{#if showAddSource}
						<div class="add-source-form">
							<div class="form-grid-2">
								<div class="form-row">
									<label>Tên hiển thị</label>
									<input type="text" bind:value={newSourceLabel} placeholder="VD: 📕 Tập 2 - Biên Niên Sử" />
								</div>
								<div class="form-row">
									<label>Danh mục</label>
									<select bind:value={newSourceCategory}>
										<option value="manuscripts">📖 Bản thảo (manuscripts)</option>
										<option value="worldbook">🌍 Thế giới quan (worldbook)</option>
										<option value="references">📚 Tham khảo (references)</option>
									</select>
								</div>
							</div>
							<div class="form-row">
								<label>Đường dẫn thư mục</label>
								<div class="path-input-row">
									<input type="text" bind:value={newSourcePath}
										placeholder="VD: E:/MyStory/TruyenMoi hoặc manuscripts/tap2" />
									<button class="btn" type="button" onclick={openFolderBrowser}>📂 Duyệt</button>
								</div>
								<span class="form-hint">Bấm "Duyệt" để chọn thư mục, hoặc gõ đường dẫn trực tiếp.</span>
							</div>
							<div class="form-row-inline">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newSourceRecursive} />
									Quét đệ quy thư mục con
								</label>
							</div>
							<div class="form-actions">
								<button class="btn" onclick={() => showAddSource = false}>Hủy</button>
								<button class="btn btn-primary" onclick={addScanSource}>➕ Thêm Nguồn</button>
							</div>
						</div>
					{:else}
						<button class="btn btn-outline" onclick={() => showAddSource = true} style="margin-bottom: 1rem;">
							➕ Thêm Thư Mục Quét
						</button>
					{/if}

					<!-- Scan Button -->
					<div class="index-toolbar">
						<button class="btn btn-primary" onclick={doScanIndex} disabled={isScanning}>
							{isScanning ? '⏳ Đang quét...' : '🔄 Scan & Index Tất Cả'}
						</button>
						<button class="btn" onclick={doRebuildIndex} disabled={isScanning}
							title="Xóa toàn bộ index và embed lại từ đầu (khi đổi model embedding)">
							🧨 Re-index Toàn Bộ
						</button>
						{#if scanResult}
							<div class="scan-result">
								<span class="scan-badge new">+{scanResult.files_new} mới</span>
								<span class="scan-badge updated">↻{scanResult.files_updated} cập nhật</span>
								<span class="scan-badge unchanged">={scanResult.files_unchanged} giữ nguyên</span>
								<span class="scan-badge chunks">🧩 {scanResult.chunks_created} chunks</span>
								{#if scanResult.errors?.length > 0}
									<span class="scan-badge errors">⚠️ {scanResult.errors.length} lỗi</span>
								{/if}
							</div>
						{/if}
					</div>
					{#if isScanning && scanProgress}
						<div class="scan-progress">
							<div class="progress-bar">
								<div class="progress-fill" style="width: {scanProgress.files_total ? (scanProgress.files_done / scanProgress.files_total) * 100 : 0}%"></div>
							</div>
							<span class="scan-progress-text">
								{scanProgress.stage} · {scanProgress.files_done}/{scanProgress.files_total} file
								{#if scanProgress.current_file}· <code>{scanProgress.current_file}</code>{/if}
								· 🧩 {scanProgress.chunks_created} chunks · 📝 {scanProgress.summaries_created} tóm tắt
							</span>
						</div>
					{/if}
					{#if scanResult?.errors?.length > 0}
						<details class="error-details">
							<summary>⚠️ Chi tiết lỗi ({scanResult.errors.length})</summary>
							<ul>
								{#each scanResult.errors as err}
									<li><code>{err}</code></li>
								{/each}
							</ul>
						</details>
					{/if}

					{#if documents.length > 0}
						<h4 style="margin-top: 1.5rem;">📄 Tài liệu đã index ({documents.length})</h4>
						<table class="crud-table">
							<thead>
								<tr>
									<th>File</th>
									<th>Danh mục</th>
									<th>Chunks</th>
									<th>Trạng thái</th>
									<th>Indexed</th>
								</tr>
							</thead>
							<tbody>
								{#each documents as doc}
									<tr>
										<td data-label="File">{doc.filename}</td>
										<td data-label="Danh mục">
											<span class="category-badge">{doc.category}</span>
										</td>
										<td data-label="Chunks">{doc.chunk_count}</td>
										<td data-label="Trạng thái">
											<span class="status-badge" class:indexed={doc.status === 'indexed'} class:error={doc.status === 'error'}>
												{doc.status}
											</span>
										</td>
										<td data-label="Indexed">{doc.indexed_at?.split('T')[0] || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<p class="text-muted" style="margin-top: 1rem;">Chưa có tài liệu nào được index. Thêm thư mục rồi bấm <strong>Scan & Index</strong>.</p>
					{/if}
				</div>

				<!-- Knowledge Tree -->
				<div class="card">
					<details ontoggle={(e) => {
						if ((e.currentTarget as HTMLDetailsElement).open && !treeLoaded && !isLoadingTree) loadTree();
					}}>
						<summary class="card-title clickable">🌲 Cây Tri Thức — mục lục AI đọc khi suy luận</summary>
						<div class="tree-browser">
							{#if isLoadingTree}
								<p class="text-muted">⏳ Đang tải cây tri thức...</p>
							{:else if treeLoaded && treeDocs.length === 0}
								<p class="text-muted">Chưa có tài liệu nào. Scan & Index trước đã.</p>
							{:else}
								<div class="tree-toolbar">
									<button class="btn btn-sm" onclick={loadTree}>↻ Tải lại</button>
								</div>
								{#each treeDocs as doc}
									<details class="tree-doc">
										<summary>
											📄 <strong>{doc.filename}</strong>
											<span class="category-badge">{doc.category}</span>
											<span class="source-pick-badge">{doc.nodes?.length || 0} mục</span>
										</summary>
										{#if doc.description}
											<p class="tree-doc-desc">{doc.description}</p>
										{/if}
										{#each doc.nodes || [] as node}
											<div class="tree-node" style="padding-left: {Math.min(node.level, 4) * 1}rem;">
												<div class="tree-node-title">
													<strong>{node.title}</strong>
													<span class="source-pick-badge">~{node.token_count} tokens</span>
												</div>
												{#if node.summary}
													<p class="tree-node-summary">{node.summary}</p>
												{/if}
											</div>
										{/each}
									</details>
								{/each}
							{/if}
						</div>
					</details>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Entity Modal -->
{#if showEntityModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showEntityModal = false}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<h3>{editingEntity ? `Sửa ${editingEntity.id}` : 'Tạo Entity Mới'}</h3>
			<div class="modal-form">
				{#if !editingEntity}
					<div class="form-row">
						<label>Loại</label>
						<select bind:value={entityForm.entity_type}>
							{#each ENTITY_TYPES as et}
								<option value={et.value}>{et.label}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="form-row">
					<label>Tên</label>
					<input type="text" bind:value={entityForm.name} placeholder="Miyamoto Okita" />
				</div>
				<div class="form-row">
					<label>Bí danh (cách nhau bởi dấu phẩy)</label>
					<input type="text" bind:value={entityForm.aliases} placeholder="Okita, Kiếm Vương Đỏ" />
				</div>
				{#if entityForm.entity_type === 'character'}
					<div class="form-row">
						<label>Vai trò</label>
						<select bind:value={entityForm.role}>
							<option value="">—</option>
							<option value="protagonist">Nhân vật chính</option>
							<option value="supporting">Nhân vật phụ</option>
							<option value="antagonist">Phản diện</option>
						</select>
					</div>
				{/if}
				<div class="form-grid-2">
					<div class="form-row">
						<label>Chương xuất hiện</label>
						<input type="number" bind:value={entityForm.first_chapter} min="1" />
					</div>
					<div class="form-row">
						<label>Ưu tiên va chạm</label>
						<input type="number" bind:value={entityForm.collision_priority} min="1" />
					</div>
				</div>
				<div class="form-row">
					<label>Mô tả</label>
					<textarea bind:value={entityForm.description} rows="4" placeholder="Mô tả chi tiết..."></textarea>
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn" onclick={() => showEntityModal = false}>Hủy</button>
				<button class="btn btn-primary" onclick={saveEntity}>
					{editingEntity ? '💾 Cập Nhật' : '✨ Tạo Mới'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Hidden File Inputs -->
<input type="file" accept=".md,.txt" style="display:none"
	bind:this={importFileInput} onchange={handleChapterFileImport} />
<input type="file" accept=".md,.txt" style="display:none"
	bind:this={entityDetectFileInput} onchange={handleEntityDetectFile} />

<!-- Entity Detection Modal -->
{#if showDetectModal}
<div class="modal-overlay" onclick={() => showDetectModal = false}>
	<div class="modal-content" style="max-width: 680px;" onclick={(e) => e.stopPropagation()}>
		<h3>🔍 Entities AI Phát Hiện</h3>
		<p class="text-muted" style="margin: 0 0 1rem;">
			Chọn các entity mới để thêm vào World Bible. Entity trùng sẽ được đánh dấu.
		</p>
		{#if detectedEntities.length === 0}
			<p>Không phát hiện entity nào.</p>
		{:else}
			<div class="detect-list">
				{#each detectedEntities as ent, idx}
					<div class="detect-item" class:is-dup={!ent.is_new}>
						<label class="detect-checkbox">
							<input type="checkbox"
								checked={detectSelectedIds.has(idx)}
								disabled={!ent.is_new}
								onchange={() => toggleDetectedEntity(idx)} />
						</label>
						<div class="detect-info">
							<div class="detect-header">
								<span class="entity-icon">{getEntityIcon(ent.entity_type)}</span>
								<strong>{ent.name}</strong>
								{#if !ent.is_new}
									<span class="badge-flat">🔄 Đã có</span>
								{:else}
									<span class="badge-recursive">✨ Mới</span>
								{/if}
							</div>
							{#if ent.aliases?.length > 0}
								<p class="entity-aliases">{ent.aliases.join(', ')}</p>
							{/if}
							{#if ent.description}
								<p class="entity-desc">{ent.description.substring(0, 150)}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
		<div class="modal-actions">
			<button class="btn" onclick={() => showDetectModal = false}>Hủy</button>
			<button class="btn btn-primary" onclick={approveDetectedEntities}
				disabled={detectSelectedIds.size === 0}>
				✅ Thêm {detectSelectedIds.size} Entity Đã Chọn
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Folder Browser Modal -->
{#if showFolderBrowser}
<div class="modal-overlay" onclick={() => showFolderBrowser = false}>
	<div class="modal-content" style="max-width: 600px; max-height: 80vh;" onclick={(e) => e.stopPropagation()}>
		<h3>📂 Chọn Thư Mục</h3>

		<!-- Breadcrumb -->
		<div class="browse-breadcrumb">
			{#if browseCurrentPath}
				{@const parts = browseCurrentPath.replace(/\\/g, '/').split('/').filter(Boolean)}
				<button class="breadcrumb-item" onclick={() => browseTo('')}>💻 Drives</button>
				{#each parts as part, i}
					<span class="breadcrumb-sep">/</span>
					<button class="breadcrumb-item"
						onclick={() => browseTo(parts.slice(0, i + 1).join('/') + '/')}>
						{part}
					</button>
				{/each}
			{:else}
				<span class="breadcrumb-item active">💻 Chọn ổ đĩa</span>
			{/if}
		</div>

		<!-- Directory List -->
		<div class="browse-list">
			{#if isBrowsing}
				<div class="empty-state"><p>⏳ Đang tải...</p></div>
			{:else if browseCurrentPath && browseDirs.length === 0}
				<div class="empty-state"><p>Thư mục trống (không có thư mục con)</p></div>
			{:else}
				{#if !browseCurrentPath && browseDrives.length > 0}
					{#each browseDrives as drive}
						<button class="browse-item" onclick={() => browseTo(drive)}>
							💾 {drive}
						</button>
					{/each}
				{/if}
				{#each browseDirs as dir}
					<button class="browse-item" onclick={() => browseTo(dir)}>
						📁 {dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dir}
					</button>
				{/each}
			{/if}
		</div>

		<div class="modal-actions">
			<button class="btn" onclick={() => showFolderBrowser = false}>Hủy</button>
			<button class="btn btn-primary" onclick={selectBrowsedFolder}
				disabled={!browseCurrentPath}>
				✅ Chọn: {browseCurrentPath || '...'}
			</button>
		</div>
	</div>
</div>
{/if}

<style>
	/* ═══════════ BASE ═══════════ */
	.cw-page { max-width: 1400px; margin: 0 auto; }

	.cw-header {
		display: flex; justify-content: space-between; align-items: flex-start;
		margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;
	}
	.cw-title h1 { margin: 0; font-size: 1.75rem; }
	.cw-subtitle { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.875rem; }
	.cw-stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.stat-chip {
		padding: 0.375rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
		background: var(--color-surface-200); color: var(--color-text-secondary);
	}

	/* Tabs */
	.cw-tabs {
		display: flex; gap: 0.25rem; margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--color-surface-200); padding-bottom: 0;
	}
	.tab-btn {
		padding: 0.75rem 1.25rem; border: none; background: none; cursor: pointer;
		font-size: 0.875rem; font-weight: 600; color: var(--color-text-muted);
		border-bottom: 3px solid transparent; transition: all 0.2s;
		margin-bottom: -2px;
	}
	.tab-btn:hover { color: var(--color-text-primary); }
	.tab-btn.active {
		color: var(--color-brand-500); border-bottom-color: var(--color-brand-500);
	}

	/* Cards */
	.card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.5rem; margin-bottom: 1rem;
		border: 1px solid rgba(255,255,255,0.05);
	}
	.card-compact { padding: 1rem; }
	.card-title { margin: 0 0 1rem; font-size: 1rem; font-weight: 700; }

	/* Form elements */
	.form-row { margin-bottom: 0.75rem; }
	.form-row label { display: block; margin-bottom: 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); }
	.form-row input, .form-row textarea, .form-row select {
		width: 100%; padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-300); background: var(--color-surface-200);
		color: var(--color-text-primary); font-size: 0.875rem; resize: vertical;
	}
	.form-row input:focus, .form-row textarea:focus, .form-row select:focus {
		outline: none; border-color: var(--color-brand-500);
		box-shadow: 0 0 0 2px rgba(var(--color-brand-500-rgb, 34,197,94), 0.2);
	}
	.input-sm { max-width: 120px; }
	.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

	/* Buttons */
	.btn {
		padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-surface-300);
		background: var(--color-surface-200); color: var(--color-text-primary);
		font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
	}
	.btn:hover { background: var(--color-surface-300); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-primary { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.btn-primary:hover { background: var(--color-brand-600); }
	.btn-accent { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; }
	.btn-accent:hover { filter: brightness(1.1); }
	.btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
	.btn-lg { width: 100%; padding: 0.75rem; font-size: 1rem; }

	/* ═══════════ WORKSHOP ═══════════ */
	.workshop-flow { display: flex; flex-direction: column; gap: 1rem; }
	.workshop-output {
		border-top: 2px solid var(--color-surface-300); padding-top: 1.5rem; margin-top: 0.5rem;
		display: flex; flex-direction: column; gap: 1rem;
	}
	.beats-editor { font-family: 'JetBrains Mono', monospace; line-height: 1.6; width: 100%; min-height: 200px; }

	.settings-grid { display: flex; flex-direction: column; gap: 0.5rem; }
	.slider-row { margin-bottom: 0.5rem; }
	.slider-row label { font-size: 0.8125rem; font-weight: 600; color: var(--color-text-muted); }
	.slider-row input[type=range] { width: 100%; margin-top: 0.25rem; }
	.checkbox-row {
		display: flex; align-items: center; gap: 0.5rem;
		font-size: 0.8125rem; cursor: pointer;
	}

	.budget-bars { display: flex; flex-direction: column; gap: 0.75rem; }
	.budget-item span { font-size: 0.75rem; color: var(--color-text-muted); }
	.progress-bar { height: 6px; background: var(--color-surface-300); border-radius: 3px; margin-top: 0.25rem; }
	.progress-fill { height: 100%; background: var(--color-brand-500); border-radius: 3px; transition: width 0.3s; }
	.budget-total { font-size: 0.875rem; padding-top: 0.5rem; border-top: 1px solid var(--color-surface-300); }

	.output-text {
		white-space: pre-wrap; font-size: 0.875rem; line-height: 1.7;
		max-height: 500px; overflow-y: auto; padding: 1rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		margin-bottom: 0.75rem;
	}
	.prompt-preview {
		white-space: pre-wrap; font-size: 0.75rem; max-height: 300px; overflow-y: auto;
		background: var(--color-surface-200); padding: 0.75rem; border-radius: var(--radius-md);
		margin-top: 0.5rem;
	}

	/* Button Row & Actions */
	.btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
	.wb-actions { display: flex; gap: 0.5rem; }
	.path-input-row { display: flex; gap: 0.5rem; align-items: center; }
	.path-input-row input { flex: 1; }
	.path-input-row .btn { white-space: nowrap; flex-shrink: 0; }

	.empty-state {
		text-align: center; padding: 3rem 1rem; color: var(--color-text-muted);
	}
	.empty-state.full-width { grid-column: 1 / -1; }
	.empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
	.text-muted { color: var(--color-text-muted); font-size: 0.875rem; }

	/* ═══════════ WORLD BIBLE ═══════════ */
	.wb-toolbar {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;
	}
	.wb-filters { display: flex; gap: 0.375rem; flex-wrap: wrap; }
	.filter-chip {
		padding: 0.375rem 0.75rem; border-radius: 999px; border: 1px solid var(--color-surface-300);
		background: transparent; color: var(--color-text-muted); font-size: 0.75rem;
		cursor: pointer; transition: all 0.2s;
	}
	.filter-chip:hover { border-color: var(--color-brand-500); }
	.filter-chip.active {
		background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500);
	}

	.entity-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;
	}
	.entity-card {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 1.25rem; border: 1px solid rgba(255,255,255,0.05);
		transition: all 0.2s;
	}
	.entity-card:hover { border-color: var(--color-brand-500); transform: translateY(-2px); }
	.entity-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.entity-icon { font-size: 1.25rem; }
	.entity-id { font-family: monospace; font-size: 0.75rem; color: var(--color-brand-400); font-weight: 700; }
	.entity-role {
		margin-left: auto; font-size: 0.625rem; padding: 0.125rem 0.5rem;
		border-radius: 999px; background: var(--color-surface-300); text-transform: uppercase;
		letter-spacing: 0.5px; font-weight: 700;
	}
	.entity-name { margin: 0 0 0.25rem; font-size: 1rem; }
	.entity-aliases { font-size: 0.75rem; color: var(--color-text-muted); margin: 0 0 0.375rem; font-style: italic; }
	.entity-desc { font-size: 0.8125rem; color: var(--color-text-secondary); margin: 0 0 0.75rem; line-height: 1.5; }
	.entity-actions { display: flex; gap: 0.375rem; justify-content: flex-end; }

	/* ═══════════ CHRONICLE ═══════════ */
	.chronicle-layout { display: flex; flex-direction: column; gap: 1rem; }

	.manual-form { padding-top: 1rem; }
	.clickable { cursor: pointer; }
	.clickable:hover { color: var(--color-brand-500); }

	.timeline { position: relative; padding-left: 2rem; }
	.timeline::before {
		content: ''; position: absolute; left: 0.75rem; top: 0; bottom: 0;
		width: 2px; background: var(--color-surface-300);
	}
	.timeline-item { position: relative; margin-bottom: 1.5rem; }
	.timeline-marker {
		position: absolute; left: -2rem; top: 0;
		width: 3rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;
		background: var(--color-brand-500); color: #fff; border-radius: var(--radius-md);
		font-size: 0.625rem; font-weight: 800;
	}
	.timeline-content { padding-left: 1.5rem; }
	.timeline-summary { margin: 0 0 0.5rem; font-size: 0.875rem; line-height: 1.5; }
	.timeline-events, .timeline-seeds { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.25rem; }
	.event-tag, .seed-tag {
		font-size: 0.6875rem; padding: 0.125rem 0.5rem; border-radius: 999px;
	}
	.event-tag { background: rgba(239,68,68,0.15); color: #f87171; }
	.seed-tag { background: rgba(34,197,94,0.15); color: #4ade80; }

	/* Indexing */
	.index-toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.scan-result { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.scan-badge {
		padding: 0.25rem 0.625rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 700;
	}
	.scan-badge.new { background: rgba(34,197,94,0.15); color: #4ade80; }
	.scan-badge.updated { background: rgba(251,191,36,0.15); color: #fbbf24; }
	.scan-badge.unchanged { background: rgba(148,163,184,0.15); color: #94a3b8; }
	.scan-badge.chunks { background: rgba(99,102,241,0.15); color: #818cf8; }
	.scan-badge.errors { background: rgba(239,68,68,0.15); color: #f87171; }

	/* Scan Sources */
	.sources-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
	.source-item {
		display: flex; align-items: center; justify-content: space-between; gap: 1rem;
		padding: 0.75rem 1rem; border-radius: var(--radius-md);
		background: var(--color-surface-200); transition: all 0.2s;
	}
	.source-item.disabled { opacity: 0.5; }
	.source-info { flex: 1; min-width: 0; }
	.source-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
	.source-label { font-weight: 600; font-size: 0.875rem; }
	.source-path {
		font-size: 0.75rem; color: var(--color-text-muted); display: block;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		background: none; padding: 0;
	}
	.source-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
	.badge-recursive, .badge-flat {
		font-size: 0.625rem; padding: 0.125rem 0.5rem; border-radius: 999px;
		font-weight: 700;
	}
	.badge-recursive { background: rgba(99,102,241,0.15); color: #818cf8; }
	.badge-flat { background: rgba(148,163,184,0.15); color: #94a3b8; }

	/* Toggle Switch */
	.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
	.toggle-switch input { opacity: 0; width: 0; height: 0; }
	.toggle-slider {
		position: absolute; inset: 0; background: var(--color-surface-400);
		border-radius: 999px; transition: 0.3s;
	}
	.toggle-slider::before {
		content: ''; position: absolute; width: 14px; height: 14px;
		left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s;
	}
	.toggle-switch input:checked + .toggle-slider { background: var(--color-brand-500); }
	.toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }

	.btn-icon { border: none; background: none; cursor: pointer; padding: 0.25rem; font-size: 1rem; opacity: 0.6; transition: 0.2s; }
	.btn-icon:hover { opacity: 1; }
	.btn-danger-icon:hover { filter: brightness(1.3); }

	/* Add Source Form */
	.add-source-form {
		background: var(--color-surface-200); border-radius: var(--radius-md);
		padding: 1.25rem; margin-bottom: 1rem; border: 1px dashed var(--color-surface-400);
	}
	.form-hint { font-size: 0.6875rem; color: var(--color-text-muted); margin-top: 0.25rem; display: block; }
	.form-row-inline { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
	.checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; cursor: pointer; }
	.checkbox-label input[type="checkbox"] { accent-color: var(--color-brand-500); }
	.form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
	.btn-outline {
		background: transparent; border: 1px dashed var(--color-surface-400);
		color: var(--color-text-muted); padding: 0.5rem 1rem; border-radius: var(--radius-md);
		cursor: pointer; font-size: 0.8125rem; transition: 0.2s;
	}
	.btn-outline:hover { border-color: var(--color-brand-500); color: var(--color-brand-500); }

	/* Error Details */
	.error-details { margin: 0.75rem 0 1rem; font-size: 0.8125rem; }
	.error-details summary { cursor: pointer; color: #f87171; font-weight: 600; }
	.error-details ul { margin-top: 0.5rem; padding-left: 1.5rem; }
	.error-details code { font-size: 0.75rem; word-break: break-all; }

	.category-badge {
		padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem;
		background: var(--color-surface-300); font-weight: 600;
	}
	.status-badge {
		padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600;
	}
	.status-badge.indexed { background: rgba(34,197,94,0.15); color: #4ade80; }
	.status-badge.error { background: rgba(239,68,68,0.15); color: #f87171; }

	/* Table */
	.crud-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
	.crud-table th { text-align: left; padding: 0.5rem; color: var(--color-text-muted); font-size: 0.75rem; border-bottom: 1px solid var(--color-surface-300); }
	.crud-table td { padding: 0.5rem; border-bottom: 1px solid var(--color-surface-200); }

	/* Modal */
	.modal-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
		display: flex; align-items: center; justify-content: center;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: var(--color-surface-100); border-radius: var(--radius-lg);
		padding: 2rem; width: 90%; max-width: 520px; max-height: 90vh; overflow-y: auto;
		border: 1px solid rgba(255,255,255,0.1);
	}
	.modal-content h3 { margin: 0 0 1.25rem; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
	/* Entity Detection */
	.detect-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; }
	.detect-item {
		display: flex; gap: 0.75rem; padding: 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		align-items: flex-start; transition: 0.2s;
	}
	.detect-item.is-dup { opacity: 0.5; }
	.detect-checkbox { flex-shrink: 0; padding-top: 0.25rem; }
	.detect-checkbox input { accent-color: var(--color-brand-500); }
	.detect-info { flex: 1; min-width: 0; }
	.detect-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }

	/* Folder Browser */
	.browse-breadcrumb {
		display: flex; align-items: center; gap: 0.125rem; flex-wrap: wrap;
		padding: 0.5rem 0.75rem; margin-bottom: 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		font-size: 0.8125rem;
	}
	.breadcrumb-item {
		background: none; border: none; cursor: pointer; padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm); color: var(--color-brand-400); font-weight: 600;
		transition: 0.2s;
	}
	.breadcrumb-item:hover { background: var(--color-surface-300); }
	.breadcrumb-item.active { color: var(--color-text-primary); cursor: default; }
	.breadcrumb-sep { color: var(--color-text-muted); font-size: 0.75rem; }
	.browse-list {
		display: flex; flex-direction: column; gap: 0.25rem;
		max-height: 350px; overflow-y: auto; margin-bottom: 0.75rem;
	}
	.browse-item {
		display: block; width: 100%; text-align: left;
		background: none; border: 1px solid transparent;
		padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		cursor: pointer; font-size: 0.8125rem; transition: 0.2s;
		color: var(--color-text-primary);
	}
	.browse-item:hover { background: var(--color-surface-200); border-color: var(--color-brand-500); }

	/* ═══════════ PHASE E: SETTINGS / HISTORY / PROGRESS ═══════════ */
	.stat-chip.stat-warn { background: rgba(239,68,68,0.15); color: #f87171; }

	.ai-settings {
		margin-top: 0.75rem; padding-top: 0.75rem;
		border-top: 1px dashed var(--color-surface-300);
	}

	.history-list { padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.history-item {
		display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;
		padding: 0.625rem 0.75rem; background: var(--color-surface-200);
		border-radius: var(--radius-md);
	}
	.history-info { flex: 1; min-width: 0; }
	.history-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.history-preview {
		margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--color-text-muted);
		line-height: 1.4;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
		overflow: hidden;
	}
	.history-actions { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }

	.scan-progress { margin: 0.5rem 0 1rem; }
	.scan-progress .progress-bar { height: 8px; margin-bottom: 0.375rem; }
	.scan-progress-text { font-size: 0.75rem; color: var(--color-text-muted); }
	.scan-progress-text code { font-size: 0.6875rem; word-break: break-all; }

	.timeline-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
	.timeline-head .timeline-summary { flex: 1; }
	.timeline-actions { display: flex; gap: 0.25rem; flex-shrink: 0; opacity: 0.7; }

	.entity-search {
		padding: 0.5rem 0.75rem; border-radius: var(--radius-md);
		border: 1px solid var(--color-surface-300); background: var(--color-surface-200);
		color: var(--color-text-primary); font-size: 0.8125rem; min-width: 200px;
	}
	.entity-search:focus { outline: none; border-color: var(--color-brand-500); }
	.entity-desc-toggle {
		background: none; border: none; cursor: pointer; padding: 0;
		font-size: 0.6875rem; color: var(--color-brand-400); font-weight: 600;
		margin-bottom: 0.75rem;
	}
	.entity-desc-toggle:hover { text-decoration: underline; }

	/* ═══════════ SOURCES PANEL & KNOWLEDGE TREE ═══════════ */
	.sources-hint { margin: 0 0 0.75rem; font-size: 0.8rem; }
	.sources-sub {
		margin: 0.75rem 0 0.375rem; font-size: 0.8125rem; font-weight: 700;
		color: var(--color-text-muted);
	}
	.source-pick {
		display: flex; gap: 0.625rem; align-items: flex-start;
		padding: 0.5rem 0.75rem; margin-bottom: 0.375rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
		cursor: pointer; transition: opacity 0.2s;
	}
	.source-pick input { margin-top: 0.2rem; accent-color: var(--color-brand-500); flex-shrink: 0; }
	.source-pick.excluded { opacity: 0.45; }
	.source-pick.excluded .source-pick-title strong { text-decoration: line-through; }
	.source-pick-info { flex: 1; min-width: 0; }
	.source-pick-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.source-pick-file { font-size: 0.6875rem; color: var(--color-text-muted); font-family: monospace; }
	.source-pick-badge {
		font-size: 0.625rem; padding: 0.125rem 0.5rem; border-radius: 999px;
		background: rgba(99,102,241,0.15); color: #818cf8; font-weight: 700;
		white-space: nowrap;
	}
	.source-pick-reason {
		margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--color-text-secondary);
		line-height: 1.4; font-style: italic;
	}

	.tree-browser { padding-top: 0.75rem; }
	.tree-toolbar { margin-bottom: 0.75rem; }
	.tree-doc {
		margin-bottom: 0.5rem; padding: 0.5rem 0.75rem;
		background: var(--color-surface-200); border-radius: var(--radius-md);
	}
	.tree-doc summary {
		cursor: pointer; font-size: 0.8125rem;
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
	}
	.tree-doc-desc {
		margin: 0.5rem 0; font-size: 0.75rem; color: var(--color-text-secondary);
		font-style: italic; line-height: 1.4;
	}
	.tree-node { margin: 0.5rem 0; }
	.tree-node-title {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		font-size: 0.8125rem;
	}
	.tree-node-summary {
		margin: 0.125rem 0 0; font-size: 0.75rem; color: var(--color-text-muted);
		line-height: 1.45;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Light Theme */
	:global(html[data-theme='light']) .card { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .entity-card { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .entity-card:hover { border-color: var(--color-brand-500); }
	:global(html[data-theme='light']) .modal-content { background: #fff; border-color: #e5e7eb; }
	:global(html[data-theme='light']) .form-row input,
	:global(html[data-theme='light']) .form-row textarea,
	:global(html[data-theme='light']) .form-row select {
		background: #f9fafb; border-color: #d1d5db;
	}
	:global(html[data-theme='light']) .stat-chip { background: #f3f4f6; }
	:global(html[data-theme='light']) .output-text { background: #f9fafb; }
	:global(html[data-theme='light']) .browse-item:hover { background: #f3f4f6; }
	:global(html[data-theme='light']) .detect-item { background: #f3f4f6; }

	/* Responsive */
	@media (max-width: 900px) {
		.entity-grid { grid-template-columns: 1fr; }
	}
</style>
