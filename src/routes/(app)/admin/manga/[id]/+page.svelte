<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		adminGet,
		adminPut,
		adminUpload,
		toast_success,
		toast_error
	} from '$lib/stores/admin.svelte';
	import MangaReader from '$lib/components/story/MangaReader.svelte';
	import {
		extractMangaConfig,
		type MangaConfigBlock,
		type MangaPageItem
	} from '$lib/story/manga-blocks';

	let chapterId = $derived($page.params.id);
	let loading = $state(true);
	let saving = $state(false);

	let chapterNumber = $state(1);
	let chapterTitle = $state('');
	let chapterStatus = $state('draft');

	// Manga Dual-Edition State
	let mangaStatus = $state<'draft' | 'published'>('draft');
	let mangaReadingMode = $state<'vertical' | 'paged'>('paged');
	let mangaAspectRatio = $state('2:3');
	let mangaStyle = $state('shonen_color');
	let mangaColorPages = $state<MangaPageItem[]>([]);
	let mangaBwPages = $state<MangaPageItem[]>([]);
	let activeEditionTab = $state<'color' | 'bw'>('color');

	let uploadingPages = $state(false);
	let uploadProgressText = $state('');
	let replacingIdx = $state<number | null>(null);
	let showPreview = $state(false);

	let activeEditionPages = $derived<MangaPageItem[]>(
		activeEditionTab === 'bw' ? mangaBwPages : mangaColorPages
	);

	let currentMangaConfig = $derived<MangaConfigBlock>({
		id: `manga-ch-${chapterNumber}`,
		type: 'manga_config',
		manga_status: mangaStatus,
		reading_mode: mangaReadingMode,
		aspect_ratio: mangaAspectRatio,
		style: mangaStyle,
		pages: mangaColorPages.length > 0 ? mangaColorPages : mangaBwPages,
		color_pages: mangaColorPages,
		bw_pages: mangaBwPages
	});

	async function loadChapterManga() {
		loading = true;
		try {
			const res = await adminGet<any>(`/admin/chapters/${chapterId}/edit`);
			if (res.success && res.data?.chapter) {
				const ch = res.data.chapter;
				chapterNumber = Number(ch.chapter_number || 1);
				chapterTitle = String(ch.title || '');
				chapterStatus = String(ch.status || 'draft');

				const mc = extractMangaConfig(ch.content_blocks);
				if (mc) {
					mangaStatus = mc.manga_status;
					mangaReadingMode = mc.reading_mode;
					mangaAspectRatio = mc.aspect_ratio || '2:3';
					mangaStyle = mc.style || 'shonen_color';
					mangaColorPages = [...mc.color_pages];
					mangaBwPages = [...mc.bw_pages];
					if (mangaColorPages.length === 0 && mangaBwPages.length > 0) {
						activeEditionTab = 'bw';
					}
				}
			} else {
				toast_error('Không tìm thấy chương');
				goto('/admin/manga');
			}
		} catch {
			toast_error('Lỗi khi tải dữ liệu Manga của chương');
		}
		loading = false;
	}

	/**
	 * Tải nhiều trang ảnh lên phiên bản đang chọn (tự động sắp xếp tên file tự nhiên page_1, page_2... page_10
	 * và tải song song theo lô 4 trang để đạt tốc độ tối đa).
	 */
	async function handleUploadMangaFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const files = Array.from(input.files).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
		);
		const targetEdition = activeEditionTab;
		uploadingPages = true;

		const currentList = targetEdition === 'bw' ? [...mangaBwPages] : [...mangaColorPages];
		const baseLen = currentList.length;
		const uploadedSlot: (MangaPageItem | null)[] = new Array(files.length).fill(null);

		const CONCURRENCY = 4;
		let completed = 0;
		uploadProgressText = `0/${files.length}`;

		let cursor = 0;
		async function worker() {
			while (cursor < files.length) {
				const idx = cursor++;
				const file = files[idx];
				try {
					const fd = new FormData();
					fd.append('file', file);
					fd.append('folder', 'manga');
					const res = await adminUpload<any>('/upload/image', fd);
					if (res.success && res.data?.url) {
						uploadedSlot[idx] = {
							page_number: baseLen + idx + 1,
							cloudinary_url: res.data.url,
							cloudinary_public_id: res.data.public_id || '',
							filename: file.name,
							width: res.data.width || 0,
							height: res.data.height || 0,
							caption: '',
							panels: []
						};
					} else {
						toast_error(`Không tải được trang ${file.name}`);
					}
				} catch {
					toast_error(`Lỗi tải trang ${file.name}`);
				}
				completed++;
				uploadProgressText = `${completed}/${files.length}`;
			}
		}

		await Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker())
		);

		const newPages = uploadedSlot.filter((x): x is MangaPageItem => x !== null);
		if (newPages.length > 0) {
			const merged = [...currentList, ...newPages].map((p, i) => ({
				...p,
				page_number: i + 1
			}));
			if (targetEdition === 'bw') {
				mangaBwPages = merged;
			} else {
				mangaColorPages = merged;
			}
			toast_success(
				`Đã tải lên ${newPages.length} trang vào ${targetEdition === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu'}!`
			);
		}

		uploadingPages = false;
		uploadProgressText = '';
		input.value = '';
	}

	/**
	 * Thay thế nhanh 1 trang cụ thể mà không làm xáo trộn thứ tự hay ghi chú các trang khác.
	 */
	async function handleReplaceSinglePage(idx: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const targetEdition = activeEditionTab;
		replacingIdx = idx;
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('folder', 'manga');
			const res = await adminUpload<any>('/upload/image', fd);
			if (res.success && res.data?.url) {
				const list = targetEdition === 'bw' ? [...mangaBwPages] : [...mangaColorPages];
				if (list[idx]) {
					list[idx] = {
						...list[idx],
						cloudinary_url: res.data.url,
						cloudinary_public_id: res.data.public_id || '',
						filename: file.name,
						width: res.data.width || list[idx].width,
						height: res.data.height || list[idx].height
					};
					if (targetEdition === 'bw') {
						mangaBwPages = list;
					} else {
						mangaColorPages = list;
					}
					toast_success(`Đã thay ảnh Trang #${idx + 1}`);
				}
			} else {
				toast_error(res.message || 'Không thay được ảnh trang này');
			}
		} catch {
			toast_error('Lỗi khi tải ảnh thay thế');
		}
		replacingIdx = null;
		input.value = '';
	}

	function movePage(idx: number, dir: -1 | 1) {
		const list = activeEditionTab === 'bw' ? mangaBwPages : mangaColorPages;
		const target = idx + dir;
		if (target < 0 || target >= list.length) return;
		const copy = [...list];
		const tmp = copy[idx];
		copy[idx] = copy[target];
		copy[target] = tmp;
		const reindexed = copy.map((p, i) => ({ ...p, page_number: i + 1 }));
		if (activeEditionTab === 'bw') {
			mangaBwPages = reindexed;
		} else {
			mangaColorPages = reindexed;
		}
	}

	function removePage(idx: number) {
		const label = activeEditionTab === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu';
		if (!confirm(`Xóa Trang #${idx + 1} khỏi ${label}?`)) return;
		if (activeEditionTab === 'bw') {
			mangaBwPages = mangaBwPages
				.filter((_, i) => i !== idx)
				.map((p, i) => ({ ...p, page_number: i + 1 }));
		} else {
			mangaColorPages = mangaColorPages
				.filter((_, i) => i !== idx)
				.map((p, i) => ({ ...p, page_number: i + 1 }));
		}
	}

	function clearCurrentEdition() {
		const label = activeEditionTab === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu';
		const count = activeEditionPages.length;
		if (count === 0) return;
		if (!confirm(`Xóa toàn bộ ${count} trang của ${label}?`)) return;
		if (activeEditionTab === 'bw') {
			mangaBwPages = [];
		} else {
			mangaColorPages = [];
		}
		toast_success(`Đã xóa trắng ${label}`);
	}

	async function handleSaveManga() {
		saving = true;
		try {
			const normalizedColor = mangaColorPages.map((p, idx) => ({
				...p,
				page_number: idx + 1
			}));
			const normalizedBw = mangaBwPages.map((p, idx) => ({
				...p,
				page_number: idx + 1
			}));
			const primaryPages = normalizedColor.length > 0 ? normalizedColor : normalizedBw;

			const payload: MangaConfigBlock = {
				id: `manga-ch-${chapterNumber}`,
				type: 'manga_config',
				manga_status: mangaStatus,
				reading_mode: mangaReadingMode,
				aspect_ratio: mangaAspectRatio,
				style: mangaStyle,
				pages: primaryPages,
				color_pages: normalizedColor,
				bw_pages: normalizedBw
			};

			const res = await adminPut(`/admin/chapters/${chapterId}/manga`, payload);
			if (res.success) {
				toast_success(
					`Đã lưu bản Manga Chương ${chapterNumber} (🎨 ${normalizedColor.length} Màu · 🖋️ ${normalizedBw.length} Đen Trắng)!`
				);
			} else {
				toast_error(res.message || 'Lỗi khi lưu bản Manga');
			}
		} catch {
			toast_error('Lỗi hệ thống khi lưu bản Manga');
		}
		saving = false;
	}

	onMount(loadChapterManga);
</script>

<svelte:head>
	<title>Admin Manga — Chương {chapterNumber}: {chapterTitle}</title>
</svelte:head>

<svelte:window
	onkeydown={(e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSaveManga();
		}
	}}
/>

{#if loading}
	<div class="studio-loading">⏳ Đang tải Xưởng Manga cho Chương...</div>
{:else}
	<div class="manga-studio-wrap">
		<!-- STICKY HEADER -->
		<div class="studio-sticky-top">
			<div class="studio-header-card">
				<div class="header-row-top">
					<button type="button" class="btn-back" onclick={() => goto('/admin/manga')}>
						← Danh sách Manga
					</button>
					<button
						type="button"
						class="btn-prose-jump"
						onclick={() => goto(`/admin/chapters/${chapterId}`)}
						title="Mở trang soạn thảo Truyện Chữ của chương này"
					>
						📖 Mở Chương Chữ
					</button>

					<div class="ch-heading">
						<span class="ch-num-pill">Chương {chapterNumber}</span>
						<h1>{chapterTitle || `Chương ${chapterNumber}`}</h1>
					</div>

					<div class="header-right-actions">
						<button
							type="button"
							class="btn-preview"
							disabled={mangaColorPages.length === 0 && mangaBwPages.length === 0}
							onclick={() => (showPreview = true)}
						>
							👁️ Xem thử Trình đọc
						</button>
						<button
							type="button"
							class="btn-save"
							disabled={saving}
							onclick={handleSaveManga}
						>
							{saving ? '⏳ Đang lưu...' : '💾 Lưu Bản Manga'}
						</button>
					</div>
				</div>

				<div class="header-row-controls">
					<label class="ctrl-item">
						<span>Trạng thái xuất bản Manga:</span>
						<select bind:value={mangaStatus}>
							<option value="draft">⏳ Nháp — Đang ẩn với độc giả</option>
							<option value="published">✅ Đã Publish — Hiển thị công khai</option>
						</select>
					</label>

					<label class="ctrl-item">
						<span>Kiểu đọc mặc định:</span>
						<select bind:value={mangaReadingMode}>
							<option value="paged">📖 Lật trang ngang (Paged)</option>
							<option value="vertical">📜 Cuộn dọc (Webtoon)</option>
						</select>
					</label>

					<label class="ctrl-item">
						<span>Khung tỷ lệ trang:</span>
						<select bind:value={mangaAspectRatio}>
							<option value="2:3">2:3 (Manga chuẩn)</option>
							<option value="3:4">3:4</option>
							<option value="9:16">9:16 (Webtoon dọc)</option>
						</select>
					</label>

					<div class="prose-status-note">
						Trạng thái Chương Chữ:
						<strong>{chapterStatus === 'published' ? '✅ Đã đăng' : '⏳ Bản nháp'}</strong>
					</div>
				</div>
			</div>
		</div>

		<!-- EDITION SWITCHER & UPLOAD BAR -->
		<div class="edition-workspace-bar">
			<div class="edition-tabs">
				<button
					type="button"
					class="ed-tab"
					class:active={activeEditionTab === 'color'}
					onclick={() => (activeEditionTab = 'color')}
				>
					🎨 Bản Có Màu ({mangaColorPages.length} trang)
				</button>
				<button
					type="button"
					class="ed-tab"
					class:active={activeEditionTab === 'bw'}
					onclick={() => (activeEditionTab = 'bw')}
				>
					🖋️ Bản Đen Trắng ({mangaBwPages.length} trang)
				</button>
			</div>

			<div class="edition-upload-actions">
				{#if activeEditionPages.length > 0}
					<button type="button" class="btn-clear-ed" onclick={clearCurrentEdition}>
						🗑️ Xóa trắng {activeEditionTab === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu'}
					</button>
				{/if}

				<label class="btn-upload-pages">
					{#if uploadingPages}
						⏳ Đang tải trang ({uploadProgressText})...
					{:else}
						➕ Tải thêm trang vào {activeEditionTab === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu'}
					{/if}
					<input
						type="file"
						multiple
						accept="image/*"
						style="display:none"
						disabled={uploadingPages}
						onchange={handleUploadMangaFiles}
					/>
				</label>
			</div>
		</div>

		<!-- PAGES GRID -->
		{#if activeEditionPages.length === 0}
			<div class="empty-edition-drop">
				<h3>
					Chưa có trang nào trong {activeEditionTab === 'bw' ? '🖋️ Bản Đen Trắng' : '🎨 Bản Có Màu'}
				</h3>
				<p>
					Bạn có thể chọn nhiều file ảnh cùng lúc để tải lên thủ công (hệ thống tự động sắp xếp theo tên file <code>1, 2, ... 20</code>), hoặc quay lại <a href="/admin/manga">Danh sách Manga</a> để đồng bộ từ Co-Writer.
				</p>
				<label class="btn-upload-pages large">
					➕ Chọn nhiều ảnh để tải lên {activeEditionTab === 'bw' ? 'Bản Đen Trắng' : 'Bản Có Màu'}
					<input
						type="file"
						multiple
						accept="image/*"
						style="display:none"
						disabled={uploadingPages}
						onchange={handleUploadMangaFiles}
					/>
				</label>
			</div>
		{:else}
			<div class="pages-studio-grid">
				{#each activeEditionPages as pg, idx (idx)}
					<div class="page-studio-card">
						<div class="page-thumb-frame">
							<img src={pg.cloudinary_url} alt="Trang {idx + 1}" loading="lazy" />
							<span class="page-no-badge">Trang {idx + 1}</span>
							{#if pg.panels && pg.panels.length > 0}
								<span class="page-dlg-pill" title="Số khung thoại đồng bộ từ Co-Writer">
									{pg.panels.length} 💬
								</span>
							{/if}
						</div>

						<div class="page-card-footer">
							<input
								type="text"
								class="page-caption-in"
								bind:value={pg.caption}
								placeholder="Ghi chú trang {idx + 1} (tùy chọn)..."
							/>

							<div class="page-btn-row">
								<button
									type="button"
									onclick={() => movePage(idx, -1)}
									disabled={idx === 0}
									title="Đưa lên trước"
								>
									←
								</button>
								<button
									type="button"
									onclick={() => movePage(idx, 1)}
									disabled={idx === activeEditionPages.length - 1}
									title="Đưa ra sau"
								>
									→
								</button>

								<label class="btn-replace-single" title="Thay ảnh riêng cho trang này">
									{replacingIdx === idx ? '⏳' : '🔄 Thay ảnh'}
									<input
										type="file"
										accept="image/*"
										style="display:none"
										disabled={replacingIdx !== null}
										onchange={(e) => handleReplaceSinglePage(idx, e)}
									/>
								</label>

								<button
									type="button"
									class="btn-del-page"
									onclick={() => removePage(idx)}
									title="Xóa trang này"
								>
									✕
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

{#if showPreview}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="preview-overlay" onclick={() => (showPreview = false)}>
		<div class="preview-dialog" onclick={(e) => e.stopPropagation()}>
			<div class="preview-dialog-head">
				<h3>
					👁️ Xem thử Trình đọc Manga — Chương {chapterNumber} (🎨 {mangaColorPages.length} Màu · 🖋️ {mangaBwPages.length} Đen Trắng)
				</h3>
				<button type="button" class="btn-close-preview" onclick={() => (showPreview = false)}>
					✕ Đóng
				</button>
			</div>
			<div class="preview-dialog-body">
				<MangaReader manga={currentMangaConfig} initialEdition={activeEditionTab} />
			</div>
		</div>
	</div>
{/if}

<style>
	.studio-loading {
		padding: 3rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.manga-studio-wrap {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 1440px;
		margin: 0 auto;
	}

	.studio-sticky-top {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--color-surface-0);
		padding: 0.4rem 0;
	}

	.studio-header-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.85rem;
		padding: 0.85rem 1.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
	}

	.header-row-top {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-wrap: wrap;
	}

	.btn-back,
	.btn-prose-jump {
		padding: 0.42rem 0.8rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-back:hover,
	.btn-prose-jump:hover {
		color: var(--color-text-primary);
		border-color: var(--color-brand-500);
	}

	.ch-heading {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
		min-width: 200px;
	}
	.ch-num-pill {
		padding: 0.22rem 0.6rem;
		border-radius: 0.35rem;
		background: rgba(168, 85, 247, 0.18);
		border: 1px solid rgba(168, 85, 247, 0.4);
		color: #c084fc;
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.ch-heading h1 {
		margin: 0;
		font-size: 1.15rem;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.btn-preview {
		padding: 0.48rem 0.9rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(168, 85, 247, 0.45);
		background: rgba(168, 85, 247, 0.12);
		color: #c084fc;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-preview:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-save {
		padding: 0.48rem 1.15rem;
		border-radius: 0.5rem;
		border: none;
		background: linear-gradient(135deg, var(--color-brand-500), #059669);
		color: #fff;
		font-size: 0.84rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-save:hover {
		filter: brightness(1.1);
	}

	.header-row-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding-top: 0.45rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.ctrl-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}
	.ctrl-item select {
		padding: 0.32rem 0.6rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.8rem;
	}
	.prose-status-note {
		margin-left: auto;
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	/* Edition Bar */
	.edition-workspace-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
	}
	.edition-tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.ed-tab {
		padding: 0.5rem 1.05rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ed-tab.active {
		background: linear-gradient(135deg, #9333ea, #6366f1);
		border-color: transparent;
		color: #fff;
	}

	.edition-upload-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.btn-clear-ed {
		padding: 0.48rem 0.85rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-upload-pages {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1.05rem;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, var(--color-brand-500), #059669);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-upload-pages.large {
		padding: 0.65rem 1.35rem;
		font-size: 0.9rem;
	}

	.empty-edition-drop {
		padding: 3.5rem 1.5rem;
		text-align: center;
		background: var(--color-surface-100);
		border: 2px dashed var(--color-border);
		border-radius: 0.85rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.empty-edition-drop h3 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}
	.empty-edition-drop p {
		margin: 0;
		max-width: 560px;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	.empty-edition-drop a {
		color: var(--color-brand-400);
		font-weight: 700;
	}

	/* Pages Grid */
	.pages-studio-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 0.9rem;
		padding-bottom: 2rem;
	}
	.page-studio-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.page-thumb-frame {
		position: relative;
		aspect-ratio: 2 / 3;
		background: #07090e;
	}
	.page-thumb-frame img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.page-no-badge {
		position: absolute;
		top: 0.45rem;
		left: 0.45rem;
		padding: 0.2rem 0.55rem;
		border-radius: 0.3rem;
		background: rgba(0, 0, 0, 0.82);
		color: #fff;
		font-size: 0.74rem;
		font-weight: 700;
	}
	.page-dlg-pill {
		position: absolute;
		top: 0.45rem;
		right: 0.45rem;
		padding: 0.18rem 0.48rem;
		border-radius: 999px;
		background: rgba(168, 85, 247, 0.85);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.page-card-footer {
		padding: 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		border-top: 1px solid var(--color-border);
	}
	.page-caption-in {
		width: 100%;
		padding: 0.32rem 0.5rem;
		border-radius: 0.35rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.76rem;
	}
	.page-btn-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.page-btn-row button {
		padding: 0.28rem 0.5rem;
		border-radius: 0.3rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.76rem;
		cursor: pointer;
	}
	.page-btn-row button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.btn-replace-single {
		flex: 1;
		text-align: center;
		padding: 0.28rem 0.45rem;
		border-radius: 0.3rem;
		border: 1px solid rgba(99, 102, 241, 0.4);
		background: rgba(99, 102, 241, 0.12);
		color: #818cf8;
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-del-page {
		color: #ef4444 !important;
	}

	/* Preview Modal */
	.preview-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.76);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.preview-dialog {
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
	.preview-dialog-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1.2rem;
		border-bottom: 1px solid var(--color-border);
	}
	.preview-dialog-head h3 {
		margin: 0;
		font-size: 1rem;
	}
	.btn-close-preview {
		padding: 0.35rem 0.75rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		cursor: pointer;
	}
	.preview-dialog-body {
		padding: 1rem;
		overflow-y: auto;
		max-height: 82vh;
	}
</style>
