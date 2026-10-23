<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { adminDelete, adminGet, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { slide } from 'svelte/transition';
	import StoryContent from '$lib/components/story/StoryContent.svelte';
	import { fitScaleInTile, normalizeRotation, resolveAspect } from '$lib/story/story-blocks.js';

	// ==========================================
	// PROPS & STATE
	// ==========================================
	export interface ChapterAsset {
		id: number;
		cloudinary_url: string;
		cloudinary_public_id: string;
		filename: string;
		size: number;
		width?: number;
		height?: number;
		mime_type: string;
	}

	export interface LibraryTag {
		id?: number;
		chapter_id?: number;
		library_item_id?: number;
		role: string;
		name?: string;
		category?: string;
		is_active?: boolean;
	}

	export interface ChapterLink {
		id?: number;
		chapter_id?: number;
		linked_chapter_id?: number;
		link_type: string;
		title?: string;
		chapter_number?: number;
	}

	export interface EditorBlock {
		id: string;
		type: 'paragraph' | 'image';
		content?: string;
		layout?: string;
		images?: ChapterAsset[];
		caption?: string;
		rotation?: number;
		[key: string]: unknown;
	}

	export interface SavePayload {
		title: string;
		chapter_number: number;
		status: string;
		author_note: string;
		content: string;
		content_html: string;
		content_blocks: EditorBlock[];
		tags: LibraryTag[];
		links: ChapterLink[];
		assets?: ChapterAsset[];
		pendingUploads?: Map<string, File>;
	}

	let {
		chapterId,
		initialTitle = '',
		initialContent = '',
		initialBlocks = null,
		initialStatus = 'draft',
		initialChapterNumber = 1,
		initialAuthorNote = '',
		initialAssets = [],
		initialTags = [],
		initialLinks = [],
		onsave
	} = $props<{
		chapterId: string | number;
		initialTitle?: string;
		initialContent?: string;
		initialBlocks?: EditorBlock[] | null;
		initialStatus?: string;
		initialChapterNumber?: number;
		initialAuthorNote?: string;
		initialAssets?: ChapterAsset[];
		initialTags?: LibraryTag[];
		initialLinks?: ChapterLink[];
		onsave: (data: SavePayload) => Promise<void>;
	}>();

	let title = $state('');
	let status = $state('draft');
	let chapter_number = $state(1);
	let author_note = $state('');

	// Prose / Image Blocks
	let blocks = $state<EditorBlock[]>([]);

	// Assets
	let assets = $state<ChapterAsset[]>([]);
	let showAssetSidebar = $state(false);
	let pendingUploads = $state<Map<string, File>>(new Map());

	// Tags & Links
	let tags = $state<LibraryTag[]>([]);
	let links = $state<ChapterLink[]>([]);
	let libraryItems = $state<Record<string, unknown>[]>([]);

	// History
	let history = $state<string[]>([]);
	let historyIndex = $state(-1);
	let historyLocked = false;

	// Misc
	let collapsedMode = $state(false);
	let allChapters = $state<Record<string, unknown>[]>([]);

	/**
	 * Làm sạch một đoạn văn có chứa cú pháp Markdown từ Co-Writer:
	 * - Xóa tiêu đề `# Chương ...` bị trùng lặp và vạch phân cách `***` / `---`.
	 * - Chuyển `### I`, `### II`, `## ...` thành `<b>I</b>`, `<b>II</b>`.
	 * - Gỡ bỏ cặp dấu `**...**` do AI nhấn mạnh tràn lan trong câu.
	 * - Chuyển `*...*` thành chữ in nghiêng `<i>...</i>`.
	 */
	function cleanMarkdownParagraph(raw: string): string | null {
		const trimmed = (raw ?? '').trim();
		if (!trimmed) return '';

		if (/^(?:\*\s*\*\s*\*+|-\s*-\s*-+|_\s*_\s*_+)\s*$/.test(trimmed)) {
			return null;
		}

		const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const hashes = headingMatch[1];
			const headingClean = headingMatch[2].replace(/\*\*/g, '').replace(/\*/g, '').trim();
			if (hashes.length === 1 || !headingClean) {
				return null;
			}
			return `<b>${headingClean}</b>`;
		}

		let s = trimmed.replace(/^>\s*/gm, '');
		s = s.replace(/\*\*\*([^*]+?)\*\*\*/g, '<i>$1</i>');
		s = s.replace(/\*\*([^*]+?)\*\*/g, '$1');
		s = s.replace(/__([^_]+?)__/g, '$1');
		s = s.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
		s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
		s = s.replace(/\*\*/g, '');
		return s;
	}

	function cleanBlocksInPlace(inputBlocks: EditorBlock[]): EditorBlock[] {
		const out: EditorBlock[] = [];
		for (const b of inputBlocks) {
			if (b.type !== 'paragraph') {
				out.push(b);
				continue;
			}
			const cleaned = cleanMarkdownParagraph(b.content || '');
			if (cleaned === null) continue;
			out.push({ ...b, content: cleaned });
		}
		return out;
	}

	function cleanAllMarkdownManual() {
		blocks = cleanBlocksInPlace(blocks);
		if (blocks.length === 0) {
			blocks = [{ id: generateId(), type: 'paragraph', content: '' }];
		}
		snapshotHistory();
		toast_success('Đã dọn sạch toàn bộ ký tự Markdown (#, ###, ***, **, *)!');
	}

	onMount(() => {
		if (initialTitle) title = initialTitle.replace(/^#+\s*/, '').trim();
		if (initialStatus) status = initialStatus;
		if (initialChapterNumber) chapter_number = initialChapterNumber;
		if (initialAuthorNote) author_note = initialAuthorNote;
		if (initialAssets) assets = [...initialAssets];
		if (initialTags) tags = [...initialTags];
		if (initialLinks) links = [...initialLinks];

		if (initialBlocks && Array.isArray(initialBlocks)) {
			const proseOnly = initialBlocks.filter((b: any) => b?.type !== 'manga_config');
			blocks = cleanBlocksInPlace(JSON.parse(JSON.stringify(proseOnly)));
		} else if (initialContent) {
			blocks = cleanBlocksInPlace(
				initialContent
					.split('\n\n')
					.filter((p: string) => p.trim())
					.map((p: string) => ({
						id: generateId(),
						type: 'paragraph' as const,
						content: p
					}))
			);
		}
		if (blocks.length === 0) {
			blocks = [{ id: generateId(), type: 'paragraph', content: '' }];
		}
		snapshotHistory();
		fetchLibrary();
		fetchChapters();
	});

	async function fetchLibrary() {
		try {
			const res = await adminGet<Record<string, unknown>[]>('/admin/library');
			if (res.success && res.data) {
				libraryItems = res.data;
				tags = tags.map((t) => {
					const item = libraryItems.find((i) => i.id === t.library_item_id);
					if (item) {
						t.name = item.name as string;
						t.category = item.category as string;
						t.is_active = Boolean(item.is_active);
					}
					return t;
				});
			}
		} catch {}
	}

	async function fetchChapters() {
		try {
			const res = await adminGet<Record<string, unknown>[]>('/admin/chapters');
			if (res.success && res.data) {
				allChapters = res.data;
				links = links.map((l) => {
					const ch = allChapters.find((c) => c.id === l.linked_chapter_id);
					if (ch) {
						l.title = ch.title as string;
						l.chapter_number = ch.chapter_number as number;
					}
					return l;
				});
			}
		} catch {}
	}

	function generateId() {
		return Math.random().toString(36).substring(2, 9);
	}

	// ==========================================
	// HISTORY (UNDO / REDO)
	// ==========================================
	function snapshotHistory() {
		if (historyLocked) return;
		const snapshot = JSON.stringify(blocks);
		if (historyIndex >= 0 && history[historyIndex] === snapshot) return;

		history = history.slice(0, historyIndex + 1);
		history.push(snapshot);
		if (history.length > 50) history.shift();
		else historyIndex++;
	}

	function undo() {
		if (historyIndex > 0) {
			historyLocked = true;
			historyIndex--;
			blocks = JSON.parse(history[historyIndex]);
			setTimeout(() => {
				historyLocked = false;
			}, 50);
		}
	}

	function redo() {
		if (historyIndex < history.length - 1) {
			historyLocked = true;
			historyIndex++;
			blocks = JSON.parse(history[historyIndex]);
			setTimeout(() => {
				historyLocked = false;
			}, 50);
		}
	}

	// ==========================================
	// BLOCK MANAGEMENT
	// ==========================================
	function addParagraph(index: number) {
		blocks.splice(index + 1, 0, { id: generateId(), type: 'paragraph', content: '' });
		snapshotHistory();
	}

	function addImageBlock(index: number) {
		blocks.splice(index + 1, 0, { id: generateId(), type: 'image', layout: 'single-16-9', images: [] });
		snapshotHistory();
	}

	function removeBlock(index: number) {
		blocks.splice(index, 1);
		if (blocks.length === 0) blocks = [{ id: generateId(), type: 'paragraph', content: '' }];
		snapshotHistory();
	}

	function clearAllBlocks() {
		if (confirm('Bạn có chắc muốn xóa toàn bộ nội dung chữ?')) {
			blocks = [{ id: generateId(), type: 'paragraph', content: '' }];
			snapshotHistory();
			toast_success('Đã xóa toàn bộ nội dung.');
		}
	}

	let showImportConfirm = $state(false);
	let pendingImportParagraphs = $state<string[]>([]);

	function handleImportFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			const paragraphs = text
				.split(/\n\n+/)
				.map((p) => p.trim())
				.filter(Boolean);

			if (paragraphs.length === 0) {
				toast_error('File trống hoặc không hợp lệ.');
				return;
			}

			if (blocks.length > 0 && blocks.some((b) => b.content || (b.type === 'image' && b.images?.length))) {
				pendingImportParagraphs = paragraphs;
				showImportConfirm = true;
			} else {
				applyImport(paragraphs, 'replace');
			}
		};
		reader.readAsText(file);
		input.value = '';
	}

	function applyImport(paragraphs: string[], mode: 'replace' | 'append') {
		const newBlocks: EditorBlock[] = cleanBlocksInPlace(
			paragraphs.map((p) => ({
				id: generateId(),
				type: 'paragraph' as const,
				content: p
			}))
		);

		if (mode === 'replace') {
			blocks = newBlocks;
		} else {
			blocks = [...blocks, ...newBlocks];
		}

		snapshotHistory();
		toast_success(`Đã nạp và làm sạch ${newBlocks.length} đoạn văn.`);
		showImportConfirm = false;
		pendingImportParagraphs = [];
	}

	function moveBlock(index: number, dir: -1 | 1) {
		const newIndex = index + dir;
		if (newIndex < 0 || newIndex >= blocks.length) return;
		const temp = blocks[index];
		blocks[index] = blocks[newIndex];
		blocks[newIndex] = temp;
		snapshotHistory();
	}

	function updateBlockContent(index: number, html: string) {
		blocks[index].content = html;
		snapshotHistory();
	}

	// ==========================================
	// ASSET MANAGEMENT
	// ==========================================
	async function handleUploadAsset(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const files = Array.from(input.files);
		let addedCount = 0;

		for (const file of files) {
			const blobUrl = URL.createObjectURL(file);
			pendingUploads.set(blobUrl, file);

			const newAsset: ChapterAsset = {
				id: -(Date.now() + Math.floor(Math.random() * 10000)),
				cloudinary_url: blobUrl,
				cloudinary_public_id: `local-${file.name}`,
				filename: file.name,
				size: file.size,
				width: 0,
				height: 0,
				mime_type: file.type
			};
			assets = [...assets, newAsset];
			addedCount++;
		}

		if (addedCount > 0) {
			toast_success(`Đã thêm ${addedCount} hình vào thư viện (chưa upload)`);
		}
		input.value = '';
	}

	async function deleteAsset(asset: ChapterAsset) {
		if (!confirm('Xóa hình này?')) return;

		try {
			if (asset.id < 0) {
				pendingUploads.delete(asset.cloudinary_url);
				URL.revokeObjectURL(asset.cloudinary_url);
			} else if (chapterId !== 'new') {
				await adminDelete(`/admin/chapters/${chapterId}/assets/${asset.id}`);
			}
			assets = assets.filter((a) => a.id !== asset.id);
			toast_success('Đã xóa hình');
		} catch {
			toast_error('Lỗi khi xóa hình');
		}
	}

	function handleDragStart(e: DragEvent, asset: ChapterAsset) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('application/json', JSON.stringify(asset));
		e.dataTransfer.effectAllowed = 'copy';
	}

	// ==========================================
	// LORE TAGS & AUTO-SCAN LOGIC
	// ==========================================
	let tagSearchQuery = $state('');
	let showTagBrowser = $state(false);

	let filteredLibraryItems = $derived(
		libraryItems.filter((item) => {
			if (tags.some((t) => t.library_item_id === (item.id as number))) return false;
			if (!tagSearchQuery) return true;
			const q = tagSearchQuery.toLowerCase();
			const nameMatch = String(item.name || '').toLowerCase().includes(q);
			const extra = (item.extra_data as Record<string, any>) || {};
			const aliases = Array.isArray(extra.aliases) ? extra.aliases : [];
			const aliasMatch = aliases.some((a: unknown) => String(a).toLowerCase().includes(q));
			return nameMatch || aliasMatch;
		})
	);

	function addTag(item: Record<string, unknown>, role = 'appears') {
		tags = [
			...tags,
			{
				id: -(Date.now() + Math.floor(Math.random() * 1000)),
				library_item_id: item.id as number,
				name: item.name as string,
				category: item.category as string,
				is_active: Boolean(item.is_active),
				role
			}
		];
		tagSearchQuery = '';
		showTagBrowser = false;
	}

	function removeTag(id: number) {
		tags = tags.filter((t) => t.id !== id);
	}

	function autoScanChapterTags() {
		if (libraryItems.length === 0) {
			toast_error('Chưa có mục nào trong Thư viện để đối chiếu.');
			return;
		}

		const paragraphText = blocks
			.filter((b) => b.type === 'paragraph')
			.map((b) => String(b.content || '').replace(/<[^>]*>/g, ' '))
			.join('\n');

		const fullCorpus = `${title}\n${paragraphText}`.toLowerCase();
		if (!fullCorpus.trim()) {
			toast_error('Chương chưa có nội dung để quét.');
			return;
		}

		let added = 0;
		for (const item of libraryItems) {
			const itemId = item.id as number;
			if (tags.some((t) => t.library_item_id === itemId)) continue;

			const extra = (item.extra_data as Record<string, any>) || {};
			const aliases: string[] = Array.isArray(extra.aliases)
				? extra.aliases.map((a: unknown) => String(a).trim()).filter(Boolean)
				: [];
			const candidates = [String(item.name || '').trim(), ...aliases].filter(
				(s) => s.length >= 2
			);

			let matched = false;
			for (const cand of candidates) {
				const needle = cand.toLowerCase();
				if (fullCorpus.includes(needle)) {
					matched = true;
					break;
				}
			}

			if (matched) {
				tags = [
					...tags,
					{
						id: -(Date.now() + Math.floor(Math.random() * 10000) + added),
						library_item_id: itemId,
						name: item.name as string,
						category: item.category as string,
						is_active: Boolean(item.is_active),
						role: 'appears'
					}
				];
				added++;
			}
		}

		if (added > 0) {
			toast_success(`Đã tự động phát hiện và gắn ${added} mục Thư viện!`);
		} else {
			toast_success('Không phát hiện thêm thực thể mới nào chưa gắn.');
		}
	}

	let linkSearchQuery = $state('');

	let filteredChapters = $derived(
		allChapters
			.filter((ch) => {
				if (ch.id === Number(chapterId)) return false;
				if (links.some((l) => l.linked_chapter_id === (ch.id as number))) return false;
				if (!linkSearchQuery) return false;
				const searchLower = linkSearchQuery.toLowerCase();
				return (
					String(ch.title).toLowerCase().includes(searchLower) ||
					String(ch.chapter_number).includes(searchLower)
				);
			})
			.slice(0, 10)
	);

	function addLink(ch: Record<string, unknown>) {
		links = [
			...links,
			{
				id: -(Date.now() + Math.floor(Math.random() * 1000)),
				linked_chapter_id: ch.id as number,
				title: ch.title as string,
				chapter_number: ch.chapter_number as number,
				link_type: 'related'
			}
		];
		linkSearchQuery = '';
	}

	function removeLink(id: number) {
		links = links.filter((l) => l.id !== id);
	}

	function handleDropOnImageBlock(e: DragEvent, blockIndex: number) {
		e.preventDefault();
		if (!e.dataTransfer) return;
		const data = e.dataTransfer.getData('application/json');
		if (!data) return;

		try {
			const asset = JSON.parse(data);
			if (!blocks[blockIndex].images) blocks[blockIndex].images = [];
			blocks[blockIndex].images.push(asset);
			snapshotHistory();
		} catch {}
	}

	function removeImageFromBlock(blockIndex: number, imgIndex: number) {
		blocks[blockIndex].images?.splice(imgIndex, 1);
		snapshotHistory();
	}

	// ==========================================
	// COMPILING HTML & SAVING
	// ==========================================
	function compileHTML() {
		let html = '';
		for (const b of blocks) {
			if (b.type === 'paragraph') {
				html += `<p>${b.content || ''}</p>\n`;
			} else if (b.type === 'image') {
				html += `<figure>\n`;
				for (const img of b.images || []) {
					html += `  <img src="${img.cloudinary_url}" alt="${img.filename}" />\n`;
				}
				if (b.caption) {
					html += `  <figcaption>${b.caption}</figcaption>\n`;
				}
				html += `</figure>\n`;
			}
		}
		return html;
	}

	let showPreview = $state(false);
	let previewFont = $state<'palatino' | 'cambria' | 'georgia' | 'segoe'>('palatino');
	let previewTheme = $state<'dark' | 'classic' | 'sepia' | 'oled'>('dark');
	let previewFontSize = $state(18);

	const PREVIEW_FONTS: Record<'palatino' | 'cambria' | 'georgia' | 'segoe', { label: string; css: string }> = {
		palatino: {
			label: 'Sách in (Palatino)',
			css: "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"
		},
		cambria: {
			label: 'Sách rõ chữ (Cambria)',
			css: "Cambria, 'Palatino Linotype', 'Times New Roman', serif"
		},
		georgia: {
			label: 'Georgia (Serif)',
			css: 'Georgia, serif'
		},
		segoe: {
			label: 'Không chân (Segoe UI)',
			css: "'Segoe UI', system-ui, -apple-system, sans-serif"
		}
	};

	const PREVIEW_THEMES: Record<'dark' | 'classic' | 'sepia' | 'oled', { label: string; bg: string; color: string; border: string }> = {
		dark: { label: 'Tối dịu (Co-Writer)', bg: '#121e20', color: '#f3f1e4', border: '#24383b' },
		classic: { label: 'Vàng cổ điển', bg: '#2a1f0e', color: '#f5e6c8', border: 'rgba(200,168,75,0.35)' },
		sepia: { label: 'Giấy ấm (Sepia)', bg: '#f4ecd8', color: '#261e18', border: '#d6c7a9' },
		oled: { label: 'Đen sâu', bg: '#080c0d', color: '#e4e2d8', border: '#1e292b' }
	};

	function isSectionHeading(html: string): boolean {
		const trimmed = (html ?? '').trim();
		if (!trimmed) return false;
		const plain = trimmed.replace(/<[^>]*>/g, '').trim();
		if (/^(?:[IVXLCDM]{1,6})(?:\s*[-—:.]\s*.{1,60})?$/.test(plain)) return true;
		if (/^(?:Phần|Hồi|Cảnh|Màn|Chương)\s+[0-9IVXLCDM]+(?:\s*[-—:.]\s*.{1,60})?$/i.test(plain)) return true;
		if (/^<(?:b|strong)>[^<]{1,50}<\/(?:b|strong)>$/i.test(trimmed)) return true;
		return false;
	}

	const TILE_ASPECT: Record<string, number> = {
		'single-1-1': 1,
		'single-16-9': 16 / 9,
		'single-9-16': 9 / 16
	};

	function thumbTransform(block: EditorBlock, img: ChapterAsset) {
		const deg = normalizeRotation(block.rotation);
		if (deg === 0) return '';
		const tile = TILE_ASPECT[block.layout ?? ''] ?? resolveAspect('combo-2', img);
		return `transform: rotate(${deg}deg) scale(${fitScaleInTile(tile, deg)});`;
	}

	async function handleSave() {
		const content_html = compileHTML();
		const rawContent = blocks
			.filter((b) => b.type === 'paragraph')
			.map((b) => b.content)
			.join('\n\n');

		const payload: SavePayload = {
			title,
			chapter_number,
			status,
			author_note,
			content: rawContent,
			content_html,
			content_blocks: [...blocks],
			tags,
			links,
			assets,
			pendingUploads
		};
		await onsave(payload);
	}
</script>

<div class="editor-container" class:with-sidebar={showAssetSidebar}>
	<div class="editor-main">
		<!-- STICKY HEADER -->
		<div class="editor-header-sticky">
			<div class="editor-header">
				<div class="header-top">
					<button class="btn-back" onclick={() => goto('/admin/chapters')} title="Quay lại danh sách chương">← Chapters</button>
					<input type="text" class="title-input" bind:value={title} placeholder="Tiêu đề chương..." />
					<div class="header-actions">
						{#if chapterId !== 'new'}
							<button
								type="button"
								class="btn-preview manga-jump-btn"
								onclick={() => goto(`/admin/manga/${chapterId}`)}
								title="Chuyển sang trang quản lý Manga riêng cho chương này"
							>
								🎨 Quản lý Manga →
							</button>
						{/if}
						<button class="btn-preview" onclick={() => (showPreview = true)}>👁️ Xem thử Chữ</button>
						<button class="btn-save" onclick={handleSave}>💾 Lưu Chương</button>
					</div>
				</div>
				<div class="header-meta">
					<label>Số chương: <input type="number" bind:value={chapter_number} min="1" class="small-input" /></label>
					<label>
						Trạng thái Chương:
						<select bind:value={status} class="small-input">
							<option value="draft">⏳ Nháp (Chưa Publish)</option>
							<option value="published">✅ Đã Xuất bản</option>
						</select>
					</label>
					<div class="toolbar">
						<button onclick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">↩</button>
						<button onclick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">↪</button>
						<div class="divider"></div>
						<button onclick={() => document.execCommand('bold')} title="Bold"><b>B</b></button>
						<button onclick={() => document.execCommand('italic')} title="Italic"><i>I</i></button>
						<button onclick={() => document.execCommand('underline')} title="Underline"><u>U</u></button>
						<div class="divider"></div>
						<label class="toolbar-btn" title="Nạp file TXT" style="cursor: pointer;">
							📄 Nạp TXT
							<input type="file" accept=".txt,.md,.text" style="display:none" onchange={handleImportFile} />
						</label>
						<button onclick={cleanAllMarkdownManual} title="Gỡ toàn bộ ký tự Markdown (#, ###, ***, **, *)">
							✨ Dọn Markdown
						</button>
						<button onclick={clearAllBlocks} title="Xóa trắng" class="danger-text">🗑️ Xóa hết</button>
						<div class="divider"></div>
						<button onclick={() => (collapsedMode = !collapsedMode)} title="Thu gọn/Mở rộng">
							{collapsedMode ? '📂 Mở rộng' : '📁 Thu gọn'}
						</button>
						<button
							onclick={() => (showAssetSidebar = !showAssetSidebar)}
							title="Quản lý hình minh họa"
							class:active-toggle={showAssetSidebar}
						>
							🖼️ Hình
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- BLOCKS -->
		<div class="blocks-container">
			{#each blocks as block, i (block.id)}
				<div class="block-wrapper" class:collapsed={collapsedMode} transition:slide={{ duration: 200 }}>
					<div class="block-controls">
						<span class="block-type">{block.type === 'paragraph' ? '¶' : '🖼️'}</span>
						<button class="ctrl-btn" onclick={() => moveBlock(i, -1)} disabled={i === 0}>↑</button>
						<button class="ctrl-btn" onclick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>↓</button>
						<button class="ctrl-btn danger" onclick={() => removeBlock(i)}>✕</button>
					</div>

					<div class="block-content">
						{#if block.type === 'paragraph'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="editable-p"
								class:section-heading={isSectionHeading(block.content || '')}
								contenteditable="true"
								oninput={(e) => updateBlockContent(i, (e.target as HTMLElement).innerHTML)}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										addParagraph(i);
										setTimeout(() => {
											const nextP = document.querySelectorAll('.editable-p')[i + 1] as HTMLElement;
											if (nextP) nextP.focus();
										}, 10);
									}
								}}
							>{@html block.content || ''}</div>
						{:else if block.type === 'image'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="image-block"
								ondragover={(e) => {
									e.preventDefault();
									if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
								}}
								ondrop={(e) => handleDropOnImageBlock(e, i)}
							>
								<div class="layout-selector">
									<select bind:value={block.layout} onchange={snapshotHistory}>
										<option value="single-1-1">Vuông (1:1)</option>
										<option value="single-16-9">Ngang (16:9)</option>
										<option value="single-9-16">Dọc (9:16)</option>
										<option value="combo-2">Combo 2 hình</option>
										<option value="combo-2-overlap">Combo 2 hình (Chèn)</option>
										<option value="combo-3">Combo 3 hình</option>
									</select>
									<span class="img-hint">Kéo thả hình từ bên phải vào đây</span>
								</div>

								<div class="images-preview {block.layout}">
									{#if !block.images || block.images.length === 0}
										<div class="empty-dropzone">Kéo thả hình vào đây</div>
									{:else}
										{#each block.images as img, j}
											<div class="img-item">
												<img src={img.cloudinary_url} alt="preview" style={thumbTransform(block, img)} />
												<button class="del-img" onclick={() => removeImageFromBlock(i, j)}>×</button>
											</div>
										{/each}
									{/if}
								</div>
								<div class="image-meta-inputs">
									<input
										type="text"
										bind:value={block.caption}
										placeholder="Tiêu đề / Chú thích hình..."
										class="image-caption-input"
									/>
									<label class="rotation-label">
										Góc xoay: {block.rotation || 0}°
										<input type="range" bind:value={block.rotation} min="0" max="360" step="1" class="rotation-slider" />
									</label>
									<button
										class="rotation-reset"
										disabled={!block.rotation}
										title="Về 0°"
										onclick={() => {
											block.rotation = 0;
											snapshotHistory();
										}}>⟲</button
									>
								</div>
							</div>
						{/if}
					</div>

					<div class="block-adders">
						<button onclick={() => addParagraph(i)}>+ Đoạn văn</button>
						<button onclick={() => addImageBlock(i)}>+ Khối hình</button>
					</div>
				</div>
			{/each}

			{#if blocks.length === 0}
				<div class="empty-blocks">
					<button class="btn-ghost" onclick={() => addParagraph(-1)}>Bắt đầu viết...</button>
				</div>
			{/if}
		</div>

		<!-- AUTHOR NOTE -->
		<div class="author-note-section">
			<h4>📝 Ghi chú tác giả</h4>
			<textarea bind:value={author_note} rows="3" placeholder="Ghi chú thêm ở cuối chương..."></textarea>
		</div>

		<!-- LORE TAGS -->
		<div class="meta-section">
			<div class="meta-sec-head">
				<div>
					<h4>🏷️ Liên kết Thư viện (Lore & Nhân vật)</h4>
					<p class="meta-sec-sub">
						Các mục đang ở trạng thái <code>⏳ Đang ẩn</code> sẽ được giữ sẵn liên kết nhưng chỉ hiện cho độc giả sau khi bạn duyệt xuất bản trong trang Quản lý Thư Viện.
					</p>
				</div>
				<button type="button" class="btn-autoscan" onclick={autoScanChapterTags}>
					🔍 Quét nội dung & Gắn Tags tự động
				</button>
			</div>

			<div class="tag-list">
				{#each tags as t (t.id)}
					<div class="tag-chip" class:tag-inactive={t.is_active === false}>
						<span class="tag-name">{t.name}</span>
						{#if t.is_active === false}
							<span class="tag-draft-pill" title="Mục này đang ẩn trong Thư Viện">⏳ Đang ẩn</span>
						{/if}
						<select bind:value={t.role} class="role-select">
							<option value="appears">Xuất hiện</option>
							<option value="mentioned">Được nhắc</option>
							<option value="first_appearance">Lần đầu</option>
							<option value="key_event">Sự kiện chính</option>
						</select>
						<button class="tag-remove" onclick={() => removeTag(t.id as number)}>✕</button>
					</div>
				{/each}
			</div>
			<div class="search-picker">
				<input
					type="text"
					bind:value={tagSearchQuery}
					placeholder="Tìm nhân vật, địa danh, bí danh (alias)..."
					class="search-input"
					onfocus={() => (showTagBrowser = true)}
				/>

				{#if showTagBrowser && filteredLibraryItems.length > 0}
					<div class="browser-dropdown">
						{#each filteredLibraryItems as item}
							<button class="browser-item" onclick={() => addTag(item)}>
								<span>
									{item.name}
									{#if item.is_active === false}
										<small class="dropdown-hidden-badge">(⏳ Chờ duyệt)</small>
									{/if}
								</span>
								<span class="item-cat">
									{item.category === 'character' ? '👤' : item.category === 'location' ? '🏛️' : '📦'}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- CHAPTER LINKS -->
		<div class="meta-section">
			<h4>📖 Chương liên quan</h4>
			<div class="tag-list">
				{#each links as l (l.id)}
					<div class="tag-chip">
						<span class="tag-name">Ch.{l.chapter_number}: {l.title}</span>
						<select bind:value={l.link_type} class="role-select">
							<option value="related">Liên quan</option>
							<option value="continues">Tiếp nối</option>
							<option value="flashback">Hồi tưởng</option>
							<option value="references">Tham chiếu</option>
						</select>
						<button class="tag-remove" onclick={() => removeLink(l.id as number)}>✕</button>
					</div>
				{/each}
			</div>
			<div class="search-picker">
				<input
					type="text"
					bind:value={linkSearchQuery}
					placeholder="Gõ tên hoặc số chương để tìm..."
					class="search-input"
				/>

				{#if linkSearchQuery && filteredChapters.length > 0}
					<div class="browser-dropdown">
						{#each filteredChapters as ch}
							<button class="browser-item" onclick={() => addLink(ch)}>
								Ch.{ch.chapter_number}: {ch.title}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- ASSET SIDEBAR (STICKY) -->
	{#if showAssetSidebar}
		<div class="asset-sidebar-wrapper" transition:slide={{ axis: 'x' }}>
			<div class="asset-sidebar">
				<div class="sidebar-header">
					<h4>🖼️ Thư viện hình</h4>
					<button class="close-btn" onclick={() => (showAssetSidebar = false)}>✕</button>
				</div>

				<label class="upload-zone">
					<input type="file" multiple accept="image/*" style="display:none" onchange={handleUploadAsset} />
					☁️ Nhấn để chọn hình
				</label>

				<div class="asset-grid">
					{#each assets as asset (asset.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="asset-thumb" draggable="true" ondragstart={(e) => handleDragStart(e, asset)}>
							<img src={asset.cloudinary_url} alt={asset.filename} loading="lazy" draggable="false" />
							<button class="del-asset" onclick={() => deleteAsset(asset)}>✕</button>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === 'z') {
				e.preventDefault();
				undo();
			}
			if (e.key === 'y') {
				e.preventDefault();
				redo();
			}
			if (e.key === 's') {
				e.preventDefault();
				handleSave();
			}
		}
	}}
/>

{#if showImportConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => (showImportConfirm = false)}>
		<div class="modal-card" onclick={(e) => e.stopPropagation()}>
			<h4>📄 Nạp {pendingImportParagraphs.length} đoạn văn</h4>
			<p>Bạn muốn thay thế toàn bộ nội dung hiện tại hay chèn thêm vào cuối?</p>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => (showImportConfirm = false)}>Hủy</button>
				<button class="btn-secondary" onclick={() => applyImport(pendingImportParagraphs, 'append')}>Chèn cuối</button>
				<button class="btn-primary" onclick={() => applyImport(pendingImportParagraphs, 'replace')}>Thay thế</button>
			</div>
		</div>
	</div>
{/if}

{#if showPreview}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => (showPreview = false)}>
		<div class="modal-card large preview-modal-card" onclick={(e) => e.stopPropagation()}>
			<div class="preview-header-bar">
				<h4>👁️ Bản xem thử Truyện Chữ</h4>
				<div class="preview-reader-controls">
					<label class="p-ctrl">
						<span>Phông chữ</span>
						<select bind:value={previewFont}>
							{#each Object.entries(PREVIEW_FONTS) as [k, v] (k)}
								<option value={k}>{v.label}</option>
							{/each}
						</select>
					</label>
					<label class="p-ctrl">
						<span>Nền đọc</span>
						<select bind:value={previewTheme}>
							{#each Object.entries(PREVIEW_THEMES) as [k, v] (k)}
								<option value={k}>{v.label}</option>
							{/each}
						</select>
					</label>
					<div class="p-size-group">
						<button type="button" onclick={() => (previewFontSize = Math.max(14, previewFontSize - 1))}>A-</button>
						<span>{previewFontSize}px</span>
						<button type="button" onclick={() => (previewFontSize = Math.min(28, previewFontSize + 1))}>A+</button>
					</div>
					<button class="btn-primary" onclick={() => (showPreview = false)}>Đóng</button>
				</div>
			</div>
			<div
				class="preview-book-surface"
				style="font-family: {PREVIEW_FONTS[previewFont].css}; font-size: {previewFontSize}px; background: {PREVIEW_THEMES[previewTheme].bg}; color: {PREVIEW_THEMES[previewTheme].color}; border-color: {PREVIEW_THEMES[previewTheme].border};"
			>
				<div class="preview-book-inner">
					{#if title}
						<h1 class="preview-ch-title">Chương {chapter_number}: {title}</h1>
					{/if}
					<StoryContent blocks={blocks} emptyText="Chương này chưa có nội dung." />
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.editor-container { display: flex; gap: 1rem; max-width: 1400px; margin: 0 auto; min-height: 80vh; padding: 0 1rem; align-items: flex-start; }
	.editor-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1rem; }

	/* STICKY HEADER */
	.editor-header-sticky { position: sticky; top: 0; z-index: 40; background: var(--color-surface-50); padding: 0.5rem 0; }
	.editor-header { background: var(--color-surface-100); padding: 0.75rem 1rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 0.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
	.header-top { display: flex; gap: 0.5rem; align-items: center; }
	.btn-back { background: transparent; border: 1px solid var(--color-border); padding: 0.4rem 0.75rem; border-radius: var(--radius-md); cursor: pointer; color: var(--color-text-secondary); font-size: 0.8rem; white-space: nowrap; flex-shrink: 0; }
	.btn-back:hover { background: var(--color-surface-200); color: var(--color-text-primary); }
	.title-input { flex: 1; font-size: 1.25rem; font-weight: 700; padding: 0.4rem 0.5rem; border: none; background: transparent; color: var(--color-text-primary); border-bottom: 2px solid transparent; min-width: 0; }
	.title-input:focus { outline: none; border-bottom-color: var(--color-brand-500); }
	.header-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }
	.btn-preview { background: transparent; border: 1px solid var(--color-border); padding: 0.4rem 0.75rem; border-radius: var(--radius-md); cursor: pointer; color: var(--color-text-secondary); font-size: 0.8rem; white-space: nowrap; }
	.btn-preview:hover { background: var(--color-surface-200); }
	.manga-jump-btn { border-color: rgba(168, 85, 247, 0.4); color: #c084fc; font-weight: 600; }
	.btn-save { background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600)); color: #fff; padding: 0.4rem 1rem; border: none; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 0.8rem; white-space: nowrap; flex-shrink: 0; }
	.btn-save:hover { filter: brightness(1.1); }

	.header-meta { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
	.small-input { padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); }

	.toolbar { display: flex; gap: 0.25rem; align-items: center; margin-left: auto; background: var(--color-surface-200); padding: 0.25rem; border-radius: var(--radius-md); flex-wrap: wrap; justify-content: flex-end; }
	.toolbar button { background: transparent; border: none; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); cursor: pointer; color: var(--color-text-secondary); font-size: 0.8rem; }
	.toolbar button:hover { background: var(--color-surface-300); color: var(--color-brand-400); }
	.toolbar button:disabled { opacity: 0.3; cursor: not-allowed; }
	.toolbar button.active-toggle { background: var(--color-brand-500); color: #fff; }
	.divider { width: 1px; height: 1.2rem; background: var(--color-border); margin: 0 0.25rem; }

	/* STICKY SIDEBAR */
	.asset-sidebar-wrapper { width: 280px; flex-shrink: 0; position: sticky; top: 0; align-self: flex-start; height: 100vh; }
	.asset-sidebar { height: 100%; overflow-y: auto; background: var(--color-surface-100); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }

	/* BLOCKS */
	.blocks-container { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 1.5rem; }
	.block-wrapper { position: relative; background: var(--color-surface-100); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.5rem 0.5rem 0.5rem 2.5rem; transition: all 0.2s; }
	.block-wrapper:focus-within { border-color: var(--color-brand-500); box-shadow: 0 0 0 2px rgba(12,113,61,0.1); }
	.block-wrapper.collapsed .block-content { display: none; }

	.block-controls { position: absolute; left: 0; top: 0; bottom: 0; width: 2.5rem; background: var(--color-surface-200); border-radius: var(--radius-md) 0 0 var(--radius-md); display: flex; flex-direction: column; align-items: center; padding: 0.25rem 0; gap: 0.25rem; opacity: 0.3; transition: opacity 0.2s; }
	.block-wrapper:hover .block-controls, .block-wrapper:focus-within .block-controls { opacity: 1; }
	.block-type { font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: auto; }
	.ctrl-btn { width: 20px; height: 20px; border: none; background: transparent; cursor: pointer; color: var(--color-text-secondary); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
	.ctrl-btn:hover:not(:disabled) { background: var(--color-surface-300); }
	.ctrl-btn.danger:hover { background: rgba(239,68,68,0.2); color: #ef4444; }

	.block-content { padding: 0.5rem; min-height: 2rem; }
	.editable-p { outline: none; line-height: 1.85; font-size: 1.06rem; font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif; }
	.editable-p.section-heading { text-align: center; font-weight: 700; font-size: 1.15rem; letter-spacing: 0.1em; padding: 0.35rem 0; }
	.editable-p[contenteditable]:empty::before { content: "Nhập nội dung đoạn văn..."; color: var(--color-text-muted); opacity: 0.5; pointer-events: none; }

	.preview-modal-card { width: 920px; max-width: 96vw; padding: 1.15rem; }
	.preview-header-bar { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.85rem; }
	.preview-header-bar h4 { margin: 0; font-size: 1.1rem; }
	.preview-reader-controls { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
	.p-ctrl { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--color-text-secondary); }
	.p-ctrl select { padding: 0.28rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); font-size: 0.8rem; }
	.p-size-group { display: inline-flex; align-items: center; gap: 0.25rem; background: var(--color-surface-200); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0.15rem 0.35rem; font-size: 0.78rem; }
	.p-size-group button { border: none; background: transparent; color: var(--color-text-primary); cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 4px; font-weight: 600; }
	.p-size-group button:hover { background: var(--color-surface-300); }
	.preview-book-surface { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 2.2rem 6%; max-height: 75vh; overflow-y: auto; line-height: 1.9; }
	.preview-book-inner { max-width: 68ch; margin: 0 auto; }
	.preview-ch-title { font-size: 1.4em; text-align: center; margin: 0 0 1.3em; padding-bottom: 0.6em; border-bottom: 1px solid rgba(255,255,255,0.15); font-weight: 700; }
	.preview-book-inner :global(p) { margin: 0 0 0.95em; text-align: justify; text-indent: 1.6em; }
	.preview-book-inner :global(p.section-heading) { text-align: center !important; text-indent: 0 !important; font-weight: 700; font-size: 1.1em; letter-spacing: 0.1em; margin: 1.8em 0 1.1em !important; }

	.block-adders { display: flex; gap: 0.5rem; margin-top: 0.5rem; justify-content: center; opacity: 0; transition: opacity 0.2s; }
	.block-wrapper:hover .block-adders { opacity: 1; }
	.block-adders button { padding: 0.25rem 0.5rem; font-size: 0.75rem; border-radius: 1rem; border: 1px solid var(--color-border); background: var(--color-surface-100); color: var(--color-text-secondary); cursor: pointer; }
	.block-adders button:hover { background: var(--color-surface-200); color: var(--color-brand-500); }

	/* IMAGE BLOCK */
	.image-block { border: 1px dashed var(--color-border); border-radius: var(--radius-sm); padding: 1rem; background: var(--color-surface-50); }
	.layout-selector { display: flex; justify-content: space-between; margin-bottom: 1rem; }
	.layout-selector select { padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); outline: none; }
	.img-hint { font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; }
	.images-preview { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin-top: 0.5rem; }
	.empty-dropzone { padding: 2rem; border: 2px dashed var(--color-border); border-radius: var(--radius-md); text-align: center; color: var(--color-text-muted); background: rgba(0,0,0,0.05); }

	.images-preview.single-16-9 .img-item { aspect-ratio: 16/9; width: 100%; }
	.images-preview.single-9-16 .img-item { aspect-ratio: 9/16; width: 100%; max-width: 400px; margin: 0 auto; }
	.images-preview.single-1-1 .img-item { aspect-ratio: 1/1; width: 100%; max-width: 500px; margin: 0 auto; }
	.images-preview.combo-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.images-preview.combo-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
	.images-preview.combo-2-overlap { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
	.images-preview.combo-2-overlap .img-item:nth-child(2) { margin-left: -10%; z-index: 1; }

	.img-item { position: relative; border-radius: var(--radius-sm); overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
	.img-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; }
	.del-img { position: absolute; top: 0.25rem; right: 0.25rem; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; line-height: 1; z-index: 10; }

	.empty-blocks { padding: 3rem; text-align: center; border: 2px dashed var(--color-border); border-radius: var(--radius-md); margin-bottom: 1rem; }

	/* SIDEBAR */
	.sidebar-header { display: flex; justify-content: space-between; align-items: center; }
	.sidebar-header h4 { margin: 0; font-size: 1rem; }
	.close-btn { background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; }
	.upload-zone { padding: 1.5rem; border: 2px dashed var(--color-border); border-radius: var(--radius-md); text-align: center; color: var(--color-text-secondary); cursor: pointer; display: block; margin-bottom: 1rem; background: rgba(0,0,0,0.1); transition: background 0.2s; }
	.upload-zone:hover { background: rgba(0,0,0,0.2); border-color: var(--color-brand-400); }
	.asset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1rem; }
	.asset-thumb { position: relative; aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; cursor: grab; border: 1px solid var(--color-border); }
	.asset-thumb:active { cursor: grabbing; opacity: 0.7; }
	.asset-thumb img { width: 100%; height: 100%; object-fit: cover; }
	.del-asset { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: rgba(239,68,68,0.9); color: #fff; border: none; cursor: pointer; font-size: 0.7rem; opacity: 0; transition: opacity 0.2s; }
	.asset-thumb:hover .del-asset { opacity: 1; }

	.author-note-section { margin-top: 0.5rem; background: var(--color-surface-100); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
	.author-note-section h4 { margin: 0 0 0.5rem; font-size: 0.95rem; }
	.author-note-section textarea { width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); resize: vertical; font-family: inherit; }

	.meta-section { margin-top: 0.5rem; background: var(--color-surface-100); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
	.meta-sec-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.meta-section h4 { margin: 0 0 0.25rem; font-size: 0.95rem; }
	.meta-sec-sub { margin: 0; font-size: 0.76rem; color: var(--color-text-muted); }
	.btn-autoscan {
		padding: 0.4rem 0.85rem;
		border-radius: var(--radius-sm);
		border: 1px solid rgba(12, 113, 61, 0.4);
		background: rgba(12, 113, 61, 0.14);
		color: var(--color-brand-400);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-autoscan:hover {
		background: rgba(12, 113, 61, 0.24);
	}
	.tag-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
	.tag-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem 0.25rem 0.75rem; background: rgba(12, 113, 61, 0.1); border: 1px solid rgba(12, 113, 61, 0.2); border-radius: 1rem; font-size: 0.8rem; color: var(--color-brand-600); }
	.tag-chip.tag-inactive {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.35);
		color: #f59e0b;
	}
	.tag-draft-pill {
		font-size: 0.68rem;
		padding: 0.08rem 0.38rem;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.2);
		color: #f59e0b;
	}
	.dropdown-hidden-badge {
		color: #f59e0b;
		margin-left: 0.35rem;
	}
	.tag-name { font-weight: 600; }
	.role-select { padding: 0.1rem 0.2rem; border: 1px solid rgba(12, 113, 61, 0.3); border-radius: 0.25rem; background: transparent; font-size: 0.7rem; color: inherit; cursor: pointer; outline: none; }
	.tag-remove { border: none; background: none; cursor: pointer; font-size: 0.9rem; color: #ef4444; padding: 0 0.2rem; line-height: 1; }
	.tag-remove:hover { transform: scale(1.1); }
	.search-picker { position: relative; }
	.search-input { width: 100%; padding: 0.6rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 0.85rem; background: var(--color-surface-200); color: var(--color-text-primary); }
	.browser-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--color-surface-100); border: 1px solid var(--color-border); border-radius: var(--radius-md); max-height: 200px; overflow-y: auto; margin-top: 0.25rem; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
	.browser-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border: none; background: transparent; cursor: pointer; text-align: left; font-size: 0.85rem; color: var(--color-text-primary); }
	.browser-item:hover { background: var(--color-surface-200); }
	.item-cat { font-size: 0.8rem; }

	.danger-text { color: #ef4444 !important; }
	.danger-text:hover { color: #dc2626 !important; background: rgba(239,68,68,0.1) !important; }
	.toolbar-btn { display: inline-flex; align-items: center; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--color-text-secondary); transition: all 0.2s; }
	.toolbar-btn:hover { background: var(--color-surface-300); color: var(--color-brand-400); }

	/* MODAL */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
	.modal-card { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.5rem; width: 400px; max-width: 90vw; box-shadow: 0 10px 25px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
	.modal-card.large { width: 860px; max-width: 95vw; }
	.modal-card h4 { margin: 0 0 1rem; font-size: 1.25rem; color: var(--color-text-primary); }
	.modal-card p { margin: 0 0 1.5rem; color: var(--color-text-secondary); font-size: 0.95rem; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.5rem; }
	.btn-secondary { padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: transparent; cursor: pointer; color: var(--color-text-primary); }
	.btn-secondary:hover { background: var(--color-surface-200); }
	.btn-primary { padding: 0.5rem 1rem; border-radius: var(--radius-md); border: none; background: var(--color-brand-500); color: white; cursor: pointer; }
	.btn-primary:hover { background: var(--color-brand-600); }

	.image-meta-inputs { display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--color-border); }
	.image-caption-input { flex: 1; padding: 0.4rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 0.85rem; background: var(--color-surface-100); color: var(--color-text-primary); }
	.rotation-label { font-size: 0.85rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 0.5rem; white-space: nowrap; }
	.rotation-slider { width: 100px; cursor: pointer; accent-color: var(--color-brand-500); }
	.rotation-reset { border: 1px solid var(--color-border); background: var(--color-surface-100); color: var(--color-text-secondary); border-radius: var(--radius-sm); width: 1.75rem; height: 1.75rem; cursor: pointer; line-height: 1; flex-shrink: 0; }
	.rotation-reset:hover:not(:disabled) { background: var(--color-surface-200); color: var(--color-brand-500); }
	.rotation-reset:disabled { opacity: 0.35; cursor: default; }
</style>
