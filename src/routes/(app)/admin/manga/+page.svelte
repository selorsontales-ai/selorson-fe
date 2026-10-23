<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		toast_success,
		toast_error
	} from '$lib/stores/admin.svelte';
	import { extractMangaConfig, type MangaConfigBlock } from '$lib/story/manga-blocks';
	import MangaReader from '$lib/components/story/MangaReader.svelte';

	interface ChapterWithManga {
		id: number;
		chapter_number: number;
		title: string;
		status: string;
		updated_at: string;
		manga: MangaConfigBlock | null;
	}

	let chapters = $state<ChapterWithManga[]>([]);
	let loading = $state(true);
	let filterMode = $state<'all' | 'with_manga' | 'published' | 'draft' | 'empty'>('all');
	let searchQuery = $state('');

	// Xem thử nhanh ngay trên danh sách
	let previewChapter = $state<ChapterWithManga | null>(null);
	let togglingId = $state<number | null>(null);

	// Đồng bộ từ Co-Writer (Chuyên biệt cho Manga)
	let showLocalSyncModal = $state(false);
	let loadingCatalog = $state(false);
	let syncingLocal = $state(false);
	let importingBundle = $state(false);
	let catalog = $state<any>(null);

	let targetChapterNo = $state(1);
	let selectedMangaEpId = $state<number | null>(null);
	let selectedMangaBwEpId = $state<number | null>(null);
	let mangaReadingMode = $state<'vertical' | 'paged'>('paged');
	let syncEntities = $state(true);
	let uploadEntityImages = $state(false);

	let filteredChapters = $derived(
		chapters.filter((ch) => {
			const hasManga =
				ch.manga !== null &&
				(ch.manga.color_pages.length > 0 ||
					ch.manga.bw_pages.length > 0 ||
					ch.manga.pages.length > 0);
			if (filterMode === 'with_manga' && !hasManga) return false;
			if (filterMode === 'published' && (!hasManga || ch.manga?.manga_status !== 'published'))
				return false;
			if (filterMode === 'draft' && (!hasManga || ch.manga?.manga_status !== 'draft')) return false;
			if (filterMode === 'empty' && hasManga) return false;

			if (searchQuery.trim()) {
				const q = searchQuery.trim().toLowerCase();
				const matchTitle = String(ch.title || '').toLowerCase().includes(q);
				const matchNo = String(ch.chapter_number).includes(q);
				return matchTitle || matchNo;
			}
			return true;
		})
	);

	let stats = $derived.by(() => {
		let total = chapters.length;
		let withManga = 0;
		let published = 0;
		let draft = 0;
		for (const ch of chapters) {
			const has =
				ch.manga !== null &&
				(ch.manga.color_pages.length > 0 ||
					ch.manga.bw_pages.length > 0 ||
					ch.manga.pages.length > 0);
			if (has) {
				withManga++;
				if (ch.manga?.manga_status === 'published') published++;
				else draft++;
			}
		}
		return { total, withManga, published, draft };
	});

	async function fetchChapters() {
		loading = true;
		try {
			const r = await adminGet<Record<string, any>[]>('/admin/chapters');
			if (r.success && Array.isArray(r.data)) {
				chapters = r.data.map((ch) => ({
					id: Number(ch.id),
					chapter_number: Number(ch.chapter_number || 1),
					title: String(ch.title || ''),
					status: String(ch.status || 'draft'),
					updated_at: String(ch.updated_at || ch.created_at || ''),
					manga: extractMangaConfig(ch.content_blocks)
				}));
			}
		} catch {
			toast_error('Không tải được danh sách chương Manga');
		}
		loading = false;
	}

	function hasMangaPages(ch: ChapterWithManga): boolean {
		return Boolean(
			ch.manga &&
				(ch.manga.color_pages.length > 0 ||
					ch.manga.bw_pages.length > 0 ||
					ch.manga.pages.length > 0)
		);
	}

	function coverUrlOf(ch: ChapterWithManga): string {
		if (!ch.manga) return '';
		return (
			ch.manga.color_pages[0]?.cloudinary_url ||
			ch.manga.pages[0]?.cloudinary_url ||
			ch.manga.bw_pages[0]?.cloudinary_url ||
			''
		);
	}

	async function toggleMangaPublish(ch: ChapterWithManga) {
		if (!ch.manga || !hasMangaPages(ch)) return;
		const nextStatus = ch.manga.manga_status === 'published' ? 'draft' : 'published';
		togglingId = ch.id;
		try {
			const updatedBlock: MangaConfigBlock = {
				...ch.manga,
				manga_status: nextStatus
			};
			const res = await adminPut(`/admin/chapters/${ch.id}/manga`, updatedBlock);
			if (res.success) {
				ch.manga = updatedBlock;
				toast_success(
					nextStatus === 'published'
						? `Đã Publish công khai Manga Chương ${ch.chapter_number}!`
						: `Đã chuyển Manga Chương ${ch.chapter_number} về trạng thái Nháp.`
				);
			}
		} finally {
			togglingId = null;
		}
	}

	async function removeMangaFromChapter(ch: ChapterWithManga) {
		if (
			!confirm(
				`Gỡ bỏ toàn bộ trang Manga của Chương ${ch.chapter_number}: "${ch.title}"? (Nội dung truyện chữ vẫn được giữ nguyên)`
			)
		)
			return;
		try {
			const res = await adminDelete(`/admin/chapters/${ch.id}/manga`);
			if (res.success) {
				toast_success(`Đã gỡ bản Manga khỏi Chương ${ch.chapter_number}`);
				await fetchChapters();
			}
		} catch {
			toast_error('Lỗi khi gỡ bản Manga');
		}
	}

	function autoPickMangaEpisodesForChapter(chNo: number) {
		const eps: any[] = catalog?.manga_episodes || [];
		const matching = eps.filter((ep) => Number(ep.chapter_no) === Number(chNo));
		const pool = matching.length > 0 ? matching : eps;

		const colorEp = pool.find((ep) => !String(ep.style || '').toLowerCase().includes('bw'));
		const bwEp = pool.find((ep) => String(ep.style || '').toLowerCase().includes('bw'));

		selectedMangaEpId = colorEp ? colorEp.id : null;
		selectedMangaBwEpId = bwEp ? bwEp.id : null;
	}

	async function openLocalMangaSyncModal(defaultChNo?: number) {
		showLocalSyncModal = true;
		loadingCatalog = true;
		try {
			const res = await adminGet<any>('/admin/sync/cowriter/local');
			if (res.success && res.data) {
				catalog = res.data;
				if (catalog.available) {
					const firstEp = catalog.manga_episodes?.[0];
					targetChapterNo = defaultChNo || firstEp?.chapter_no || 1;
					autoPickMangaEpisodesForChapter(targetChapterNo);
				}
			} else {
				toast_error(res.message || 'Không kiểm tra được dữ liệu Co-Writer trên máy');
			}
		} catch {
			toast_error('Lỗi khi đọc danh mục Manga từ Co-Writer');
		}
		loadingCatalog = false;
	}

	async function handleRunLocalMangaSync() {
		if (selectedMangaEpId === null && selectedMangaBwEpId === null) {
			toast_error('Hãy chọn ít nhất 1 Tập Manga (Bản Màu hoặc Bản Đen Trắng) để đồng bộ.');
			return;
		}
		syncingLocal = true;
		try {
			const res = await adminPost<any>('/admin/sync/cowriter/local', {
				chapter_source_kind: 'none',
				chapter_source_id: null,
				chapter_number: targetChapterNo,
				manga_episode_id: selectedMangaEpId,
				manga_bw_episode_id: selectedMangaBwEpId,
				manga_reading_mode: mangaReadingMode,
				sync_entities: syncEntities,
				upload_entity_images: uploadEntityImages
			});
			if (res.success && res.data) {
				const d = res.data;
				const modeLabel =
					d.storage_mode === 'local'
						? 'Ổ đĩa Local siêu tốc'
						: 'Cloudinary song song + Delta SHA-256';
				toast_success(
					`Đã đồng bộ ${d.manga_pages_synced ?? 0} trang Manga vào Chương #${d.chapter_number || targetChapterNo} (Nháp · ${modeLabel})!`
				);
				showLocalSyncModal = false;
				await fetchChapters();
			}
		} finally {
			syncingLocal = false;
		}
	}

	async function compressBase64Image(rawB64: string, maxDim = 1800, quality = 0.88): Promise<string> {
		if (!rawB64 || rawB64.length < 800_000) return rawB64;
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				let w = img.naturalWidth || img.width;
				let h = img.naturalHeight || img.height;
				if (w <= 0 || h <= 0) {
					resolve(rawB64);
					return;
				}
				if (Math.max(w, h) > maxDim) {
					const scale = maxDim / Math.max(w, h);
					w = Math.max(1, Math.round(w * scale));
					h = Math.max(1, Math.round(h * scale));
				}
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(rawB64);
					return;
				}
				ctx.drawImage(img, 0, 0, w, h);
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				const idx = dataUrl.indexOf(';base64,');
				resolve(idx >= 0 ? dataUrl.slice(idx + 8) : rawB64);
			};
			img.onerror = () => resolve(rawB64);
			const clean = rawB64.includes(';base64,') ? rawB64 : `data:image/png;base64,${rawB64}`;
			img.src = clean;
		});
	}

	async function handleImportMangaBundle(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importingBundle = true;
		try {
			const text = await file.text();
			const payload = JSON.parse(text);
			// Trang Quản lý Manga chỉ xử lý phần Manga + Thực thể liên quan (giữ nguyên phần chữ hiện có của chương)
			delete payload.chapter;

			if (!payload.manga) {
				toast_error('Gói .json này không chứa dữ liệu Manga.');
				importingBundle = false;
				input.value = '';
				return;
			}

			for (const arr of [
				payload.manga.pages,
				payload.manga.color_pages,
				payload.manga.bw_pages
			]) {
				if (Array.isArray(arr)) {
					for (const pg of arr) {
						if (typeof pg.image_base64 === 'string' && pg.image_base64.length > 800_000) {
							pg.image_base64 = await compressBase64Image(pg.image_base64, 1800, 0.88);
						}
					}
				}
			}

			const res = await adminPost<any>('/admin/sync/cowriter', payload);
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đã nhập ${d.manga_pages_synced ?? 0} trang Manga vào Chương #${d.chapter_number || '?'} (Chế độ Nháp)!`
				);
				await fetchChapters();
			}
		} catch {
			toast_error('File JSON không hợp lệ hoặc lỗi xử lý gói Manga');
		}
		importingBundle = false;
		input.value = '';
	}

	onMount(fetchChapters);
</script>

<svelte:head><title>Admin - Quản lý Manga</title></svelte:head>

<div class="manga-admin-page">
	<!-- HEADER & SYNC BANNER -->
	<div class="manga-sync-banner">
		<div class="sync-banner-info">
			<h2>🎨 Quản lý Manga (Song Bản: Có Màu & Đen Trắng)</h2>
			<p>
				Tách biệt hoàn toàn với trang Quản lý Chapters chữ. Hỗ trợ đồng bộ tức thì từ Co-Writer (Local Media 0ms / Cloudinary Delta SHA-256 song song) hoặc tải lên thủ công từng trang cho từng chương.
			</p>
		</div>
		<div class="sync-banner-actions">
			<button type="button" class="sync-local-btn" onclick={() => openLocalMangaSyncModal()}>
				⚡ Đồng bộ Manga từ Co-Writer (Cùng máy)
			</button>
			<label class="sync-upload-btn" title="Nhập gói .json chứa tập Manga từ máy khác">
				{importingBundle ? '⏳ Đang nạp gói Manga...' : '📥 Nhập gói Manga .json (Khác máy)'}
				<input
					type="file"
					accept=".json"
					style="display:none"
					disabled={importingBundle}
					onchange={handleImportMangaBundle}
				/>
			</label>
		</div>
	</div>

	<!-- STATS BAR -->
	<div class="manga-stats-row">
		<div class="stat-pill">
			<span class="stat-num">{stats.total}</span>
			<span class="stat-lbl">Tổng số Chương</span>
		</div>
		<div class="stat-pill">
			<span class="stat-num">{stats.withManga}</span>
			<span class="stat-lbl">Chương có Manga</span>
		</div>
		<div class="stat-pill pub">
			<span class="stat-num">{stats.published}</span>
			<span class="stat-lbl">Đã Publish công khai</span>
		</div>
		<div class="stat-pill draft">
			<span class="stat-num">{stats.draft}</span>
			<span class="stat-lbl">Đang ở chế độ Nháp</span>
		</div>
	</div>

	<!-- FILTER & SEARCH TOOLBAR -->
	<div class="manga-toolbar">
		<div class="filter-tabs">
			<button
				type="button"
				class:active={filterMode === 'all'}
				onclick={() => (filterMode = 'all')}
			>
				Tất cả ({stats.total})
			</button>
			<button
				type="button"
				class:active={filterMode === 'with_manga'}
				onclick={() => (filterMode = 'with_manga')}
			>
				Có Manga ({stats.withManga})
			</button>
			<button
				type="button"
				class:active={filterMode === 'published'}
				onclick={() => (filterMode = 'published')}
			>
				✅ Đã Publish ({stats.published})
			</button>
			<button
				type="button"
				class:active={filterMode === 'draft'}
				onclick={() => (filterMode = 'draft')}
			>
				⏳ Bản Nháp ({stats.draft})
			</button>
			<button
				type="button"
				class:active={filterMode === 'empty'}
				onclick={() => (filterMode = 'empty')}
			>
				⚪ Chưa có Manga ({stats.total - stats.withManga})
			</button>
		</div>

		<input
			type="text"
			class="manga-search-input"
			bind:value={searchQuery}
			placeholder="Tìm theo số chương hoặc tiêu đề..."
		/>
	</div>

	<!-- MANGA CARDS GRID -->
	{#if loading}
		<div class="manga-empty-state">⏳ Đang tải danh sách Manga các chương...</div>
	{:else if filteredChapters.length === 0}
		<div class="manga-empty-state">
			Không có chương nào khớp bộ lọc hiện tại.
		</div>
	{:else}
		<div class="manga-cards-grid">
			{#each filteredChapters as ch (ch.id)}
				{@const hasPages = hasMangaPages(ch)}
				{@const cover = coverUrlOf(ch)}
				{@const colorCount = ch.manga?.color_pages.length ?? 0}
				{@const bwCount = ch.manga?.bw_pages.length ?? 0}
				{@const isPub = hasPages && ch.manga?.manga_status === 'published'}
				<div class="manga-ch-card" class:has-manga={hasPages}>
					<div class="card-cover-wrap">
						{#if cover}
							<img src={cover} alt="Chương {ch.chapter_number}" loading="lazy" />
						{:else}
							<div class="no-cover-placeholder">
								<span>Chương {ch.chapter_number}</span>
								<small>Chưa có trang Manga</small>
							</div>
						{/if}

						<span class="ch-badge">Chương {ch.chapter_number}</span>

						{#if hasPages}
							<span class="status-badge" class:published={isPub} class:draft={!isPub}>
								{isPub ? '✅ Đã Publish' : '⏳ Bản Nháp'}
							</span>
						{/if}
					</div>

					<div class="card-body">
						<h3 class="card-title">{ch.title || `Chương ${ch.chapter_number}`}</h3>

						{#if hasPages}
							<div class="edition-pills">
								<span class="ed-pill color" class:dim={colorCount === 0}>
									🎨 Có Màu: <strong>{colorCount}</strong> trang
								</span>
								<span class="ed-pill bw" class:dim={bwCount === 0}>
									🖋️ Đen Trắng: <strong>{bwCount}</strong> trang
								</span>
							</div>
							<div class="mode-line">
								Kiểu đọc mặc định:
								<strong>
									{ch.manga?.reading_mode === 'paged'
										? '📖 Lật trang ngang'
										: '📜 Cuộn dọc Webtoon'}
								</strong>
								· Tỷ lệ <code>{ch.manga?.aspect_ratio || '2:3'}</code>
							</div>
						{:else}
							<p class="empty-hint">
								Chương này chưa có trang Manga. Nhấn <strong>Quản lý / Tải thủ công</strong> hoặc <strong>Đồng bộ từ Co-Writer</strong>.
							</p>
						{/if}

						<div class="card-actions">
							<button
								type="button"
								class="btn-studio"
								onclick={() => goto(`/admin/manga/${ch.id}`)}
							>
								🎨 {hasPages ? 'Chỉnh sửa / Tải thủ công' : '+ Thêm Manga thủ công'}
							</button>

							{#if hasPages}
								<button
									type="button"
									class="btn-toggle-pub"
									class:unpub={isPub}
									disabled={togglingId === ch.id}
									onclick={() => toggleMangaPublish(ch)}
								>
									{isPub ? '⏳ Chuyển Nháp' : '🚀 Publish'}
								</button>
								<button
									type="button"
									class="btn-icon"
									title="Xem thử Trình đọc Manga"
									onclick={() => (previewChapter = ch)}
								>
									👁️
								</button>
								<button
									type="button"
									class="btn-icon danger"
									title="Gỡ bản Manga khỏi chương"
									onclick={() => removeMangaFromChapter(ch)}
								>
									🗑️
								</button>
							{:else}
								<button
									type="button"
									class="btn-sync-single"
									onclick={() => openLocalMangaSyncModal(ch.chapter_number)}
								>
									⚡ Lấy từ Co-Writer
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- MODAL ĐỒNG BỘ MANGA TỪ CO-WRITER CÙNG MÁY -->
{#if showLocalSyncModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="sync-modal-overlay" onclick={() => !syncingLocal && (showLocalSyncModal = false)}>
		<div class="sync-modal-card" onclick={(e) => e.stopPropagation()}>
			<div class="sync-modal-head">
				<h3>⚡ Đồng bộ Tập Manga từ Co-Writer (Cùng máy)</h3>
				<button
					type="button"
					class="sync-close-btn"
					disabled={syncingLocal}
					onclick={() => (showLocalSyncModal = false)}>✕</button
				>
			</div>

			{#if loadingCatalog}
				<p class="sync-status-msg">⏳ Đang đọc danh sách Tập Manga từ Co-Writer...</p>
			{:else if !catalog?.available}
				<div class="sync-unavailable">
					<p>{catalog?.message || 'Không tìm thấy kho dữ liệu Co-Writer trên máy này.'}</p>
					<p>Nếu Co-Writer nằm ở máy khác, hãy dùng nút <strong>📥 Nhập gói Manga .json</strong>.</p>
				</div>
			{:else}
				<div class="sync-form">
					<div class="sync-db-badge">
						📂 Kho Co-Writer: <code>{catalog.db_path}</code> ({catalog.manga_episodes?.length || 0} tập Manga)
					</div>

					<div class="sync-grid-2">
						<label class="sync-field">
							<span>1. Số chương đích trên Selorson:</span>
							<input
								type="number"
								min="1"
								bind:value={targetChapterNo}
								onchange={() => autoPickMangaEpisodesForChapter(targetChapterNo)}
							/>
						</label>
						<label class="sync-field">
							<span>2. Kiểu đọc mặc định:</span>
							<select bind:value={mangaReadingMode}>
								<option value="paged">📖 Lật trang ngang (Paged Manga)</option>
								<option value="vertical">📜 Cuộn dọc (Webtoon)</option>
							</select>
						</label>
					</div>

					<label class="sync-field">
						<span>3a. 🎨 Chọn Tập Manga Bản Có Màu (Lưu Nháp):</span>
						<select bind:value={selectedMangaEpId}>
							<option value={null}>— Không đồng bộ Bản Có Màu —</option>
							{#each catalog.manga_episodes || [] as ep}
								<option value={ep.id}>
									Tập #{ep.id} (Ch.{ep.chapter_no}): {ep.title} [{ep.style}] — {ep.done_pages}/{ep.page_count} trang
								</option>
							{/each}
						</select>
					</label>

					<label class="sync-field">
						<span>3b. 🖋️ Chọn Tập Manga Bản Đen Trắng (Lưu Nháp):</span>
						<select bind:value={selectedMangaBwEpId}>
							<option value={null}>— Không đồng bộ Bản Đen Trắng —</option>
							{#each catalog.manga_episodes || [] as ep}
								<option value={ep.id}>
									Tập #{ep.id} (Ch.{ep.chapter_no}): {ep.title} [{ep.style}] — {ep.done_pages}/{ep.page_count} trang
								</option>
							{/each}
						</select>
					</label>

					<div class="sync-checks">
						<label class="sync-check-row">
							<input type="checkbox" bind:checked={syncEntities} />
							<span>
								Tự động gắn sẵn Tags nhân vật xuất hiện trong kịch bản Manga vào chương
							</span>
						</label>
						{#if syncEntities}
							<label class="sync-check-row">
								<input type="checkbox" bind:checked={uploadEntityImages} />
								<span>Tải kèm ảnh Character Sheet cho nhân vật mới chưa có ảnh trong Thư Viện</span>
							</label>
						{/if}
					</div>

					<div class="sync-modal-footer">
						<button
							type="button"
							class="btn-cancel"
							disabled={syncingLocal}
							onclick={() => (showLocalSyncModal = false)}
						>
							Hủy
						</button>
						<button
							type="button"
							class="btn-confirm-sync"
							disabled={syncingLocal}
							onclick={handleRunLocalMangaSync}
						>
							{syncingLocal ? '⏳ Đang đồng bộ Manga...' : '🚀 Đồng bộ Manga ngay (Nháp)'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- MODAL XEM THỬ NHANH MANGA -->
{#if previewChapter && previewChapter.manga}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="sync-modal-overlay" onclick={() => (previewChapter = null)}>
		<div class="preview-modal-box" onclick={(e) => e.stopPropagation()}>
			<div class="preview-modal-head">
				<h3>
					👁️ Xem thử Manga — Chương {previewChapter.chapter_number}: {previewChapter.title}
				</h3>
				<button type="button" class="sync-close-btn" onclick={() => (previewChapter = null)}>
					✕
				</button>
			</div>
			<div class="preview-modal-body">
				<MangaReader manga={previewChapter.manga} />
			</div>
		</div>
	</div>
{/if}

<style>
	.manga-admin-page {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}

	.manga-sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.25rem;
		flex-wrap: wrap;
		padding: 1.1rem 1.35rem;
		border-radius: 0.85rem;
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(12, 113, 61, 0.1));
		border: 1px solid rgba(168, 85, 247, 0.3);
	}
	.sync-banner-info {
		max-width: 680px;
	}
	.sync-banner-info h2 {
		margin: 0 0 0.3rem;
		font-size: 1.2rem;
		color: var(--color-text-primary);
	}
	.sync-banner-info p {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	.sync-banner-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-wrap: wrap;
	}
	.sync-local-btn {
		padding: 0.55rem 1.1rem;
		border-radius: 0.55rem;
		background: linear-gradient(135deg, #9333ea, #6366f1);
		border: none;
		color: #fff;
		font-size: 0.84rem;
		font-weight: 700;
		cursor: pointer;
	}
	.sync-local-btn:hover {
		filter: brightness(1.1);
	}
	.sync-upload-btn {
		padding: 0.55rem 1rem;
		border-radius: 0.55rem;
		background: var(--color-surface-200);
		border: 1px solid var(--color-border);
		color: var(--color-text-primary);
		font-size: 0.84rem;
		font-weight: 600;
		cursor: pointer;
	}

	/* Stats */
	.manga-stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.75rem;
	}
	.stat-pill {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 0.85rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.stat-pill.pub {
		border-color: rgba(16, 185, 129, 0.35);
	}
	.stat-pill.draft {
		border-color: rgba(245, 158, 11, 0.35);
	}
	.stat-num {
		font-size: 1.45rem;
		font-weight: 800;
		color: var(--color-text-primary);
	}
	.stat-lbl {
		font-size: 0.76rem;
		color: var(--color-text-muted);
	}

	/* Toolbar */
	.manga-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.filter-tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.filter-tabs button {
		padding: 0.42rem 0.85rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-100);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.filter-tabs button.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.manga-search-input {
		min-width: 250px;
		padding: 0.48rem 0.85rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-100);
		color: var(--color-text-primary);
		font-size: 0.84rem;
	}

	.manga-empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		background: var(--color-surface-100);
		border: 1px dashed var(--color-border);
		border-radius: 0.85rem;
		color: var(--color-text-muted);
	}

	/* Cards Grid */
	.manga-cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
		gap: 1rem;
	}
	.manga-ch-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.85rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: transform 0.15s, border-color 0.15s;
	}
	.manga-ch-card.has-manga {
		border-color: rgba(168, 85, 247, 0.35);
	}
	.manga-ch-card:hover {
		transform: translateY(-2px);
	}

	.card-cover-wrap {
		position: relative;
		aspect-ratio: 16 / 10;
		background: #0b0f17;
		overflow: hidden;
	}
	.card-cover-wrap img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
	}
	.no-cover-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}
	.ch-badge {
		position: absolute;
		top: 0.6rem;
		left: 0.6rem;
		padding: 0.22rem 0.6rem;
		border-radius: 0.35rem;
		background: rgba(0, 0, 0, 0.78);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.status-badge {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		padding: 0.22rem 0.6rem;
		border-radius: 999px;
		font-size: 0.74rem;
		font-weight: 700;
	}
	.status-badge.published {
		background: rgba(16, 185, 129, 0.92);
		color: #fff;
	}
	.status-badge.draft {
		background: rgba(245, 158, 11, 0.92);
		color: #fff;
	}

	.card-body {
		padding: 0.95rem 1.05rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		flex: 1;
	}
	.card-title {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
		line-height: 1.35;
	}
	.edition-pills {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.ed-pill {
		padding: 0.22rem 0.55rem;
		border-radius: 0.35rem;
		font-size: 0.76rem;
		background: var(--color-surface-200);
		border: 1px solid var(--color-border);
	}
	.ed-pill.color {
		border-color: rgba(168, 85, 247, 0.4);
		color: #c084fc;
	}
	.ed-pill.bw {
		border-color: rgba(148, 163, 184, 0.4);
		color: var(--color-text-secondary);
	}
	.ed-pill.dim {
		opacity: 0.45;
	}
	.mode-line {
		font-size: 0.76rem;
		color: var(--color-text-muted);
	}
	.empty-hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-muted);
		line-height: 1.45;
	}

	.card-actions {
		margin-top: auto;
		padding-top: 0.45rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.btn-studio {
		flex: 1;
		padding: 0.45rem 0.75rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(168, 85, 247, 0.45);
		background: rgba(168, 85, 247, 0.14);
		color: #c084fc;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-studio:hover {
		background: rgba(168, 85, 247, 0.25);
	}
	.btn-toggle-pub {
		padding: 0.45rem 0.7rem;
		border-radius: 0.45rem;
		border: none;
		background: var(--color-brand-500);
		color: #fff;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-toggle-pub.unpub {
		background: rgba(245, 158, 11, 0.2);
		border: 1px solid rgba(245, 158, 11, 0.45);
		color: #fbbf24;
	}
	.btn-sync-single {
		padding: 0.45rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-icon {
		padding: 0.42rem 0.55rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		cursor: pointer;
		font-size: 0.8rem;
	}
	.btn-icon.danger:hover {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.45);
	}

	/* Modal */
	.sync-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.sync-modal-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.85rem;
		width: 640px;
		max-width: 95vw;
		padding: 1.35rem 1.5rem;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
	}
	.preview-modal-box {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.85rem;
		width: 980px;
		max-width: 96vw;
		max-height: 92vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.preview-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.9rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
	}
	.preview-modal-head h3 {
		margin: 0;
		font-size: 1rem;
	}
	.preview-modal-body {
		padding: 1rem;
		overflow-y: auto;
		max-height: 82vh;
	}
	.sync-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.sync-modal-head h3 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}
	.sync-close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.sync-status-msg {
		padding: 1.5rem 0;
		text-align: center;
		color: var(--color-text-secondary);
	}
	.sync-unavailable {
		padding: 1rem;
		border-radius: 0.5rem;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		font-size: 0.85rem;
	}
	.sync-form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.sync-db-badge {
		padding: 0.55rem 0.75rem;
		border-radius: 0.5rem;
		background: rgba(168, 85, 247, 0.12);
		border: 1px solid rgba(168, 85, 247, 0.3);
		font-size: 0.78rem;
		color: var(--color-text-secondary);
	}
	.sync-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: var(--color-text-secondary);
	}
	.sync-field select,
	.sync-field input {
		padding: 0.55rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.85rem;
	}
	.sync-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.sync-checks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.65rem 0.8rem;
		border-radius: 0.5rem;
		background: var(--color-surface-200);
	}
	.sync-check-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.sync-modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 0.5rem;
	}
	.btn-cancel {
		padding: 0.5rem 1rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.btn-confirm-sync {
		padding: 0.5rem 1.15rem;
		border-radius: 0.45rem;
		border: none;
		background: linear-gradient(135deg, #9333ea, #6366f1);
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
</style>
