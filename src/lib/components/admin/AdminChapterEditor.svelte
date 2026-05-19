<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { adminPost, adminDelete, adminGet, adminUpload, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { fade, slide } from 'svelte/transition';

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
		id?: number; // Used as library_item_id in UI
		chapter_id?: number;
		library_item_id?: number;
		role: string;
		name?: string;
		category?: string;
	}

	export interface ChapterLink {
		id?: number; // Used as linked_chapter_id in UI
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
	
	// Blocks


	let blocks = $state<EditorBlock[]>([]);
	
	// Assets
	let assets = $state<ChapterAsset[]>([]);
	let showAssetSidebar = $state(false);
	let uploadingAsset = $state(false);
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

	onMount(() => {
		if (initialTitle) title = initialTitle;
		if (initialStatus) status = initialStatus;
		if (initialChapterNumber) chapter_number = initialChapterNumber;
		if (initialAuthorNote) author_note = initialAuthorNote;
		if (initialAssets) assets = [...initialAssets];
		if (initialTags) tags = [...initialTags];
		if (initialLinks) links = [...initialLinks];

		if (initialBlocks && Array.isArray(initialBlocks)) {
			blocks = JSON.parse(JSON.stringify(initialBlocks));
		} else if (initialContent) {
			// fallback parse from string
			blocks = initialContent.split('\n\n').filter((p: string) => p.trim()).map((p: string) => ({
				id: generateId(),
				type: 'paragraph',
				content: p
			}));
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
				// Enrich initial tags with name and category
				tags = tags.map(t => {
					const item = libraryItems.find(i => i.id === t.library_item_id);
					if (item) {
						t.name = item.name as string;
						t.category = item.category as string;
					}
					return t;
				});
			}
		} catch (e) {}
	}

	async function fetchChapters() {
		try {
			const res = await adminGet<Record<string, unknown>[]>('/admin/chapters');
			if (res.success && res.data) {
				allChapters = res.data;
				// Enrich initial links with title and chapter_number
				links = links.map(l => {
					const ch = allChapters.find(c => c.id === l.linked_chapter_id);
					if (ch) {
						l.title = ch.title as string;
						l.chapter_number = ch.chapter_number as number;
					}
					return l;
				});
			}
		} catch (e) {}
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
			setTimeout(() => { historyLocked = false; }, 50);
		}
	}

	function redo() {
		if (historyIndex < history.length - 1) {
			historyLocked = true;
			historyIndex++;
			blocks = JSON.parse(history[historyIndex]);
			setTimeout(() => { historyLocked = false; }, 50);
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

	function duplicateBlock(index: number) {
		const block = JSON.parse(JSON.stringify(blocks[index]));
		block.id = generateId();
		blocks.splice(index + 1, 0, block);
		snapshotHistory();
	}

	function clearAllBlocks() {
		if (confirm('Bạn có chắc muốn xóa toàn bộ nội dung?')) {
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
			const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
			
			if (paragraphs.length === 0) {
				toast_error('File trống hoặc không hợp lệ.');
				return;
			}

			if (blocks.length > 0 && blocks.some(b => b.content || (b.type === 'image' && b.images?.length))) {
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
		const newBlocks: EditorBlock[] = paragraphs.map(p => ({
			id: generateId(),
			type: 'paragraph',
			content: p
		}));

		if (mode === 'replace') {
			blocks = newBlocks;
		} else {
			blocks = [...blocks, ...newBlocks];
		}
		
		snapshotHistory();
		toast_success(`Đã nạp ${paragraphs.length} đoạn văn.`);
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
		snapshotHistory(); // Should debounce this in real life
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
				id: -(Date.now() + Math.floor(Math.random() * 10000)), // Unique temp ID
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
			toast_success(`Đã thêm ${addedCount} ảnh vào thư viện (chưa upload)`);
		}
		input.value = '';
	}

	async function deleteAsset(asset: ChapterAsset) {
		if (!confirm('Xóa ảnh này?')) return;
		
		try {
			if (asset.id < 0) {
				// Temporary local asset: just remove from state
				pendingUploads.delete(asset.cloudinary_url);
				URL.revokeObjectURL(asset.cloudinary_url); // Free memory
			} else if (chapterId !== 'new') {
				// Saved asset: delete from chapter assets
				await adminDelete(`/admin/chapters/${chapterId}/assets/${asset.id}`);
			}
			assets = assets.filter(a => a.id !== asset.id);
			toast_success('Đã xóa ảnh');
		} catch {
			toast_error('Lỗi khi xóa ảnh');
		}
	}

	// ==========================================
	// DRAG & DROP FOR ASSETS -> BLOCKS
	// ==========================================
	function handleDragStart(e: DragEvent, asset: ChapterAsset) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('application/json', JSON.stringify(asset));
		e.dataTransfer.effectAllowed = 'copy';
	}

	// ==========================================
	// LORE TAGS & CHAPTER LINKS LOGIC
	// ==========================================
	let tagSearchQuery = $state('');
	let showTagBrowser = $state(false);
	
	let filteredLibraryItems = $derived(
		libraryItems.filter(item => {
			if (tags.some(t => t.library_item_id === (item.id as number))) return false;
			if (!tagSearchQuery) return true;
			return String(item.name).toLowerCase().includes(tagSearchQuery.toLowerCase());
		})
	);

	function addTag(item: Record<string, unknown>) {
		tags = [...tags, {
			id: -(Date.now() + Math.floor(Math.random() * 1000)), // temp id
			library_item_id: item.id as number,
			name: item.name as string,
			category: item.category as string,
			role: 'appears'
		}];
		tagSearchQuery = '';
		showTagBrowser = false;
	}

	function removeTag(id: number) {
		tags = tags.filter(t => t.id !== id);
	}

	let linkSearchQuery = $state('');
	
	let filteredChapters = $derived(
		allChapters.filter(ch => {
			if (ch.id === Number(chapterId)) return false; // Exclude self
			if (links.some(l => l.linked_chapter_id === (ch.id as number))) return false;
			if (!linkSearchQuery) return false; // Only show when searching
			const searchLower = linkSearchQuery.toLowerCase();
			return String(ch.title).toLowerCase().includes(searchLower) || String(ch.chapter_number).includes(searchLower);
		}).slice(0, 10)
	);

	function addLink(ch: Record<string, unknown>) {
		links = [...links, {
			id: -(Date.now() + Math.floor(Math.random() * 1000)), // temp id
			linked_chapter_id: ch.id as number,
			title: ch.title as string,
			chapter_number: ch.chapter_number as number,
			link_type: 'related'
		}];
		linkSearchQuery = '';
	}

	function removeLink(id: number) {
		links = links.filter(l => l.id !== id);
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
				html += `<figure class="story-image ${b.layout}">\n`;
				html += `  <div class="image-container">\n`;
				for (const img of (b.images || [])) {
					const rotationStyle = b.rotation ? ` style="transform: rotate(${b.rotation}deg);"` : '';
					html += `    <img src="${img.cloudinary_url}" alt="${img.filename}"${rotationStyle} />\n`;
				}
				html += `  </div>\n`;
				if (b.caption) {
					html += `  <figcaption>${b.caption}</figcaption>\n`;
				}
				html += `</figure>\n`;
			}
		}
		return html;
	}

	let showPreview = $state(false);
	let previewHtml = $state('');

	function openPreview() {
		previewHtml = compileHTML();
		showPreview = true;
	}

	async function handleSave() {
		const content_html = compileHTML();
		const rawContent = blocks.filter(b => b.type === 'paragraph').map(b => b.content).join('\n\n');
		
		const payload = {
			title,
			chapter_number,
			status,
			author_note,
			content: rawContent,
			content_html,
			content_blocks: blocks,
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
					<button class="btn-back" onclick={() => window.history.back()} title="Quay lại">← Quay lại</button>
					<input type="text" class="title-input" bind:value={title} placeholder="Tiêu đề chương..." />
					<div class="header-actions">
						<button class="btn-preview" onclick={openPreview}>👁️ Xem thử</button>
						<button class="btn-save" onclick={handleSave}>💾 Lưu Chương</button>
					</div>
				</div>
				<div class="header-meta">
					<label>Số chương: <input type="number" bind:value={chapter_number} min="1" class="small-input"/></label>
					<label>Trạng thái: 
						<select bind:value={status} class="small-input">
							<option value="draft">Nháp</option>
							<option value="published">Xuất bản</option>
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
							📄 Nạp
							<input type="file" accept=".txt,.md,.text" style="display:none" onchange={handleImportFile} />
						</label>
						<button onclick={clearAllBlocks} title="Xóa trắng" class="danger-text">🗑️ Xóa hết</button>
						<div class="divider"></div>
						<button onclick={() => collapsedMode = !collapsedMode} title="Thu gọn/Mở rộng">
							{collapsedMode ? '📂 Mở rộng' : '📁 Thu gọn'}
						</button>
						<button onclick={() => showAssetSidebar = !showAssetSidebar} title="Quản lý ảnh" class:active-toggle={showAssetSidebar}>
							🖼️ Ảnh
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- BLOCKS -->
		<div class="blocks-container">
			{#each blocks as block, i (block.id)}
				<div class="block-wrapper" class:collapsed={collapsedMode} transition:slide={{duration: 200}}>
					<div class="block-controls">
						<span class="block-type">{block.type === 'paragraph' ? '¶' : '🖼️'}</span>
						<button class="ctrl-btn" onclick={() => moveBlock(i, -1)} disabled={i===0}>↑</button>
						<button class="ctrl-btn" onclick={() => moveBlock(i, 1)} disabled={i===blocks.length-1}>↓</button>
						<button class="ctrl-btn danger" onclick={() => removeBlock(i)}>✕</button>
					</div>

					<div class="block-content">
						{#if block.type === 'paragraph'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div 
								class="editable-p" 
								contenteditable="true"
								oninput={(e) => updateBlockContent(i, (e.target as HTMLElement).innerHTML)}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										addParagraph(i);
										setTimeout(() => {
											const nextP = document.querySelectorAll('.editable-p')[i+1] as HTMLElement;
											if (nextP) nextP.focus();
										}, 10);
									}
								}}
							>{@html block.content || ''}</div>
						{:else if block.type === 'image'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="image-block" 
								ondragover={(e) => e.preventDefault()}
								ondrop={(e) => handleDropOnImageBlock(e, i)}>
								
								<div class="layout-selector">
									<select bind:value={block.layout} onchange={snapshotHistory}>
										<option value="single-1-1">Vuông (1:1)</option>
										<option value="single-16-9">Ngang (16:9)</option>
										<option value="single-9-16">Dọc (9:16)</option>
										<option value="combo-2">Combo 2 ảnh</option>
										<option value="combo-2-overlap">Combo 2 ảnh (Chèn)</option>
										<option value="combo-3">Combo 3 ảnh</option>
									</select>
									<span class="img-hint">Kéo thả ảnh từ bên phải vào đây</span>
								</div>

								<div class="images-preview {block.layout}">
									{#if !block.images || block.images.length === 0}
										<div class="empty-dropzone">Kéo thả ảnh vào đây</div>
									{:else}
										{#each block.images as img, j}
											<div class="img-item">
												<img src={img.cloudinary_url} alt="preview" style="transform: rotate({block.rotation || 0}deg);" />
												<button class="del-img" onclick={() => removeImageFromBlock(i, j)}>×</button>
											</div>
										{/each}
									{/if}
								</div>
								<div class="image-meta-inputs">
									<input type="text" bind:value={block.caption} placeholder="Tiêu đề / Chú thích ảnh..." class="image-caption-input" />
									<label class="rotation-label">
										Góc xoay: {block.rotation || 0}°
										<input type="range" bind:value={block.rotation} min="0" max="360" step="1" class="rotation-slider" />
									</label>
								</div>
							</div>
						{/if}
					</div>

					<div class="block-adders">
						<button onclick={() => addParagraph(i)}>+ Đoạn văn</button>
						<button onclick={() => addImageBlock(i)}>+ Khối ảnh</button>
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
			<h4>🏷️ Liên kết Thư viện (Lore)</h4>
			<div class="tag-list">
				{#each tags as t (t.id)}
					<div class="tag-chip">
						<span class="tag-name">{t.name}</span>
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
				<input type="text" bind:value={tagSearchQuery} placeholder="Tìm nhân vật, địa danh, lore..." class="search-input" onfocus={() => showTagBrowser = true} />
				
				{#if showTagBrowser && filteredLibraryItems.length > 0}
					<div class="browser-dropdown">
						{#each filteredLibraryItems as item}
							<button class="browser-item" onclick={() => addTag(item)}>
								{item.name}
								<span class="item-cat">{item.category === 'main_character' ? '⭐' : item.category === 'location' ? '🗺️' : '📦'}</span>
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
				<input type="text" bind:value={linkSearchQuery} placeholder="Gõ tên hoặc số chương để tìm..." class="search-input" />
				
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
		<div class="asset-sidebar-wrapper" transition:slide={{axis: 'x'}}>
			<div class="asset-sidebar">
				<div class="sidebar-header">
					<h4>🖼️ Thư viện ảnh</h4>
					<button class="close-btn" onclick={() => showAssetSidebar = false}>✕</button>
				</div>
				
				<label class="upload-zone">
					<input type="file" multiple accept="image/*" style="display:none" onchange={handleUploadAsset} />
					☁️ Nhấn để chọn ảnh
				</label>

				<div class="asset-grid">
					{#each assets as asset (asset.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="asset-thumb" draggable="true" ondragstart={(e) => handleDragStart(e, asset)}>
							<img src={asset.cloudinary_url} alt={asset.filename} loading="lazy" />
							<button class="del-asset" onclick={() => deleteAsset(asset)}>✕</button>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<svelte:window onkeydown={(e) => {
	if (e.ctrlKey || e.metaKey) {
		if (e.key === 'z') { e.preventDefault(); undo(); }
		if (e.key === 'y') { e.preventDefault(); redo(); }
		if (e.key === 's') { e.preventDefault(); handleSave(); }
	}
}} />

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
	.blocks-container { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 4rem; }
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
	.editable-p { outline: none; line-height: 1.8; font-size: 1.05rem; }
	.editable-p[contenteditable]:empty::before { content: "Nhập nội dung đoạn văn..."; color: var(--color-text-muted); opacity: 0.5; pointer-events: none; }

	.block-adders { position: absolute; bottom: -0.75rem; left: 50%; transform: translateX(-50%); display: flex; gap: 0.5rem; opacity: 0; transition: opacity 0.2s; z-index: 10; }
	.block-wrapper:hover .block-adders, .block-adders:hover { opacity: 1; }
	.block-adders button { background: var(--color-brand-500); color: #fff; border: none; border-radius: 1rem; padding: 0.15rem 0.75rem; font-size: 0.7rem; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
	.block-adders button:hover { background: var(--color-brand-600); transform: scale(1.05); }

	/* IMAGE BLOCK */
	.image-block { border: 1px dashed var(--color-border); border-radius: var(--radius-sm); padding: 1rem; background: var(--color-surface-50); }
	.layout-selector { display: flex; justify-content: space-between; margin-bottom: 1rem; }
	.layout-selector select { padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); outline: none; }
	.img-hint { font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; }
	.images-preview { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin-top: 0.5rem; }
	.empty-dropzone { padding: 2rem; border: 2px dashed var(--color-border); border-radius: var(--radius-md); text-align: center; color: var(--color-text-muted); background: rgba(0,0,0,0.05); }
	
	/* Layout Modifiers */
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
	
	.block-adders { display: flex; gap: 0.5rem; margin-top: 0.5rem; justify-content: center; opacity: 0; transition: opacity 0.2s; }
	.block-wrapper:hover .block-adders { opacity: 1; }
	.block-adders button { padding: 0.25rem 0.5rem; font-size: 0.75rem; border-radius: 1rem; border: 1px solid var(--color-border); background: var(--color-surface-100); color: var(--color-text-secondary); cursor: pointer; }
	.block-adders button:hover { background: var(--color-surface-200); color: var(--color-brand-500); }

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

	.author-note-section { margin-top: 2rem; background: var(--color-surface-100); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
	.author-note-section h4 { margin: 0 0 0.5rem; font-size: 0.95rem; }
	.author-note-section textarea { width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface-200); color: var(--color-text-primary); resize: vertical; font-family: inherit; }

	.meta-section { margin-top: 1rem; background: var(--color-surface-100); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
	.meta-section h4 { margin: 0 0 0.5rem; font-size: 0.95rem; }
	.tag-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
	.tag-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem 0.25rem 0.75rem; background: rgba(12, 113, 61, 0.1); border: 1px solid rgba(12, 113, 61, 0.2); border-radius: 1rem; font-size: 0.8rem; color: var(--color-brand-600); }
	.tag-name { font-weight: 600; }
	.role-select { padding: 0.1rem 0.2rem; border: 1px solid rgba(12, 113, 61, 0.3); border-radius: 0.25rem; background: transparent; font-size: 0.7rem; color: var(--color-brand-600); cursor: pointer; outline: none; }
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
	.modal-card.large { width: 800px; max-width: 95vw; }
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

	@media (max-width: 768px) {
		.editor-container {
			flex-direction: column;
			padding: 0 0.5rem;
		}
		.asset-sidebar-wrapper {
			width: 100%;
			order: -1;
		}
		.asset-sidebar {
			position: static;
			height: auto;
			max-height: 40vh;
		}
		.editor-header-sticky {
			top: 56px;
		}
		.header-top {
			flex-wrap: wrap;
		}
		.title-input {
			font-size: 1.1rem;
			order: 2;
			flex-basis: 100%;
		}
		.btn-back { order: 1; }
		.header-actions { order: 3; margin-left: auto; }
		.header-meta {
			flex-direction: column;
			align-items: stretch;
		}
		.toolbar {
			justify-content: flex-start;
			padding: 0.5rem;
		}
		.block-wrapper {
			padding-left: 2.25rem;
		}
		.block-controls {
			width: 2rem;
		}
		.tag-chip {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
			padding: 0.75rem;
		}
		.role-select {
			width: 100%;
			padding: 0.5rem;
		}
		.tag-remove {
			align-self: flex-end;
		}
		.btn-save, .btn-preview, .btn-back {
			font-size: 0.75rem;
			padding: 0.35rem 0.5rem;
		}
		.image-meta-inputs {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>

{#if showImportConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showImportConfirm = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-card" onclick={e => e.stopPropagation()}>
			<h4>📄 Nạp {pendingImportParagraphs.length} đoạn văn</h4>
			<p>Bạn muốn thay thế toàn bộ nội dung hiện tại hay chèn thêm vào cuối?</p>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showImportConfirm = false}>Hủy</button>
				<button class="btn-secondary" onclick={() => applyImport(pendingImportParagraphs, 'append')}>Chèn cuối</button>
				<button class="btn-primary" onclick={() => applyImport(pendingImportParagraphs, 'replace')}>Thay thế</button>
			</div>
		</div>
	</div>
{/if}

{#if showPreview}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => showPreview = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-card large" onclick={e => e.stopPropagation()}>
			<h4>👁️ Bản xem thử</h4>
			<div class="preview-content" style="padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-50); max-height: 60vh; overflow-y: auto;">
				{@html previewHtml}
			</div>
			<div class="modal-actions">
				<button class="btn-primary" onclick={() => showPreview = false}>Đóng</button>
			</div>
		</div>
	</div>
{/if}
