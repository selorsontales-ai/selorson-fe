<script lang="ts">
	import type { MangaConfigBlock, MangaPageItem } from '$lib/story/manga-blocks';

	let {
		manga,
		maxWidth = 860,
		initialEdition
	} = $props<{
		manga: MangaConfigBlock;
		maxWidth?: number;
		initialEdition?: 'color' | 'bw';
	}>();

	let mode = $state<'vertical' | 'paged'>('vertical');
	let edition = $state<'color' | 'bw'>('color');
	let zoomMode = $state<'fit' | 'wide' | 'full'>('fit');
	let currentPage = $state(0);
	let showPanels = $state(false);
	let lastMangaId = $state<string>('');

	let colorPages = $derived<MangaPageItem[]>(manga?.color_pages ?? []);
	let bwPages = $derived<MangaPageItem[]>(manga?.bw_pages ?? []);
	let hasColor = $derived(colorPages.length > 0);
	let hasBw = $derived(bwPages.length > 0);
	let hasBothEditions = $derived(hasColor && hasBw);

	$effect(() => {
		const cfgId = manga?.id ?? '';
		if (cfgId !== lastMangaId) {
			lastMangaId = cfgId;
			if (manga?.reading_mode) {
				mode = manga.reading_mode;
			}
			if (initialEdition === 'bw' && bwPages.length > 0) {
				edition = 'bw';
			} else if (initialEdition === 'color' && colorPages.length > 0) {
				edition = 'color';
			} else if (colorPages.length > 0) {
				edition = 'color';
			} else if (bwPages.length > 0) {
				edition = 'bw';
			}
			currentPage = 0;
		}
	});

	$effect(() => {
		if (initialEdition === 'bw' && hasBw) {
			edition = 'bw';
		} else if (initialEdition === 'color' && hasColor) {
			edition = 'color';
		}
	});

	let pages = $derived<MangaPageItem[]>(
		edition === 'bw' && hasBw
			? bwPages
			: edition === 'color' && hasColor
				? colorPages
				: (manga?.pages ?? [])
	);
	let totalPages = $derived(pages.length);

	function switchEdition(target: 'color' | 'bw') {
		if (target === 'color' && !hasColor) return;
		if (target === 'bw' && !hasBw) return;
		const nextLen = target === 'bw' ? bwPages.length : colorPages.length;
		edition = target;
		if (nextLen > 0 && currentPage >= nextLen) {
			currentPage = nextLen - 1;
		}
	}

	function jumpToPage(idx: number) {
		if (idx < 0 || idx >= totalPages) return;
		currentPage = idx;
		if (mode === 'vertical' && typeof document !== 'undefined') {
			const el = document.getElementById(`manga-page-${idx + 1}`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	}

	function prevPage() {
		if (currentPage > 0) {
			currentPage -= 1;
		}
	}

	function nextPage() {
		if (currentPage < totalPages - 1) {
			currentPage += 1;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (mode !== 'paged') return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prevPage();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			nextPage();
		}
	}

	let effectiveWidth = $derived(
		zoomMode === 'full' ? 1280 : zoomMode === 'wide' ? 1020 : maxWidth
	);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if totalPages === 0}
	<div class="manga-empty">Chương này chưa có trang Manga nào.</div>
{:else}
	<div class="manga-reader" style:max-width="{effectiveWidth}px">
		<!-- Thanh Navbar Đọc Manga (Sticky) -->
		<div class="manga-toolbar">
			<!-- Cột trái: Chuyển đổi Bản Màu ↔ Bản Đen Trắng -->
			<div class="toolbar-section">
				{#if hasBothEditions}
					<div class="edition-switch" role="group" aria-label="Chọn phiên bản màu sắc">
						<button
							type="button"
							class="edition-btn color-ed"
							class:active={edition === 'color'}
							onclick={() => switchEdition('color')}
							title="Đọc bản Full Color giữ nguyên vị trí trang"
						>
							🎨 Bản Màu <span class="ed-count">{colorPages.length}</span>
						</button>
						<button
							type="button"
							class="edition-btn bw-ed"
							class:active={edition === 'bw'}
							onclick={() => switchEdition('bw')}
							title="Đọc bản Tankōbon Đen Trắng giữ nguyên vị trí trang"
						>
							🖋️ Đen Trắng <span class="ed-count">{bwPages.length}</span>
						</button>
					</div>
				{:else if hasBw}
					<span class="single-edition-badge bw">🖋️ Bản Đen Trắng ({bwPages.length} trang)</span>
				{:else}
					<span class="single-edition-badge color">🎨 Bản Có Màu ({colorPages.length || totalPages} trang)</span>
				{/if}
			</div>

			<!-- Cột giữa: Chế độ đọc + Nhảy trang nhanh -->
			<div class="toolbar-section">
				<div class="mode-switch">
					<button
						type="button"
						class="mode-btn"
						class:active={mode === 'vertical'}
						onclick={() => (mode = 'vertical')}
					>
						📜 Cuộn dọc
					</button>
					<button
						type="button"
						class="mode-btn"
						class:active={mode === 'paged'}
						onclick={() => (mode = 'paged')}
					>
						📖 Lật trang ({currentPage + 1}/{totalPages})
					</button>
				</div>

				<select
					class="page-jump-select"
					value={currentPage}
					onchange={(e) => jumpToPage(Number((e.currentTarget as HTMLSelectElement).value))}
					aria-label="Chuyển nhanh tới trang"
				>
					{#each pages as _, i}
						<option value={i}>Trang {i + 1} / {totalPages}</option>
					{/each}
				</select>
			</div>

			<!-- Cột phải: Phóng to khung + Phụ đề -->
			<div class="toolbar-section">
				<div class="zoom-switch">
					<button
						type="button"
						class="zoom-btn"
						class:active={zoomMode === 'fit'}
						onclick={() => (zoomMode = 'fit')}
						title="Khung tiêu chuẩn"
					>
						Vừa
					</button>
					<button
						type="button"
						class="zoom-btn"
						class:active={zoomMode === 'wide'}
						onclick={() => (zoomMode = 'wide')}
						title="Khung mở rộng"
					>
						Rộng
					</button>
					<button
						type="button"
						class="zoom-btn"
						class:active={zoomMode === 'full'}
						onclick={() => (zoomMode = 'full')}
						title="Toàn màn hình đọc"
					>
						Toàn khung
					</button>
				</div>

				{#if pages.some((p) => p.panels && p.panels.length > 0)}
					<button
						type="button"
						class="mode-btn"
						class:active={showPanels}
						onclick={() => (showPanels = !showPanels)}
					>
						💬 Thoại
					</button>
				{/if}
			</div>
		</div>

		{#if mode === 'vertical'}
			<!-- Chế độ Cuộn dọc (Webtoon Strip) -->
			<div class="vertical-strip">
				{#each pages as page, idx (page.page_number ?? idx)}
					<figure class="manga-page-item" id="manga-page-{idx + 1}">
						<div class="page-badge-floating">
							Trang {idx + 1}/{totalPages} · {edition === 'bw' && hasBw ? '🖋️ Đen Trắng' : '🎨 Bản Màu'}
						</div>
						<img
							src={page.cloudinary_url}
							alt={page.filename || `Trang ${idx + 1}`}
							loading={idx < 3 ? 'eager' : 'lazy'}
							decoding="async"
						/>
						{#if page.caption}
							<figcaption class="page-caption">{page.caption}</figcaption>
						{/if}
						{#if showPanels && page.panels && page.panels.length > 0}
							<div class="panel-transcript">
								{#each page.panels as pan}
									{#if pan.dialogue || pan.caption}
										<div class="panel-line">
											{#if pan.speaker}<strong>{pan.speaker}:</strong>{/if}
											<span>{pan.dialogue || pan.caption}</span>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</figure>
				{/each}
			</div>
		{:else}
			<!-- Chế độ Lật trang ngang (Paged Mode) -->
			{@const activePage = pages[currentPage]}
			{#if activePage}
				<div class="paged-viewer">
					<div class="paged-stage">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="click-zone left" onclick={prevPage} title="Trang trước (←)"></div>
						<img
							src={activePage.cloudinary_url}
							alt={activePage.filename || `Trang ${currentPage + 1}`}
							class="paged-img"
						/>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="click-zone right" onclick={nextPage} title="Trang sau (→)"></div>
					</div>

					{#if activePage.caption}
						<p class="page-caption">{activePage.caption}</p>
					{/if}

					{#if showPanels && activePage.panels && activePage.panels.length > 0}
						<div class="panel-transcript">
							{#each activePage.panels as pan}
								{#if pan.dialogue || pan.caption}
									<div class="panel-line">
										{#if pan.speaker}<strong>{pan.speaker}:</strong>{/if}
										<span>{pan.dialogue || pan.caption}</span>
									</div>
								{/if}
							{/each}
						</div>
					{/if}

					<div class="paged-controls">
						<button type="button" class="nav-page-btn" onclick={prevPage} disabled={currentPage <= 0}>
							← Trang trước
						</button>
						<div class="page-slider-wrap">
							<input
								type="range"
								min="0"
								max={totalPages - 1}
								bind:value={currentPage}
								class="page-slider"
							/>
							<span class="page-counter">
								Trang {currentPage + 1} / {totalPages} ({edition === 'bw' && hasBw ? 'Bản Đen Trắng' : 'Bản Màu'})
							</span>
						</div>
						<button
							type="button"
							class="nav-page-btn"
							onclick={nextPage}
							disabled={currentPage >= totalPages - 1}
						>
							Trang tiếp →
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.manga-reader {
		margin: 0 auto;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition: max-width 0.2s ease;
	}
	.manga-empty {
		padding: 3rem;
		text-align: center;
		color: var(--color-text-muted);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
	}
	.manga-toolbar {
		position: sticky;
		top: 4.1rem;
		z-index: 35;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		padding: 0.6rem 0.9rem;
		background: color-mix(in srgb, var(--color-surface-100) 88%, transparent);
		backdrop-filter: blur(14px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
	}
	.toolbar-section {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	/* Edition Switcher (Color vs B&W) */
	.edition-switch {
		display: inline-flex;
		padding: 0.2rem;
		background: var(--color-surface-200);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		gap: 0.2rem;
	}
	.edition-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		border-radius: calc(var(--radius-md) - 2px);
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.edition-btn:hover {
		color: var(--color-text-primary);
	}
	.edition-btn.color-ed.active {
		background: linear-gradient(135deg, #f59e0b, #ea580c);
		color: #fff;
		box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
	}
	.edition-btn.bw-ed.active {
		background: linear-gradient(135deg, #334155, #0f172a);
		color: #f8fafc;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.45);
	}
	.ed-count {
		font-size: 0.7rem;
		padding: 0.05rem 0.38rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
	}
	.single-edition-badge {
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.35rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}
	.single-edition-badge.color {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
		border-color: rgba(245, 158, 11, 0.3);
	}
	.single-edition-badge.bw {
		background: rgba(148, 163, 184, 0.14);
		color: #e2e8f0;
		border-color: rgba(148, 163, 184, 0.3);
	}

	.mode-switch,
	.zoom-switch {
		display: flex;
		gap: 0.3rem;
	}
	.mode-btn,
	.zoom-btn {
		padding: 0.38rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.mode-btn.active,
	.zoom-btn.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.page-jump-select {
		padding: 0.36rem 0.6rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	/* Vertical Strip (Webtoon) */
	.vertical-strip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		background: #090b10;
		padding: 0.5rem;
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
	}
	.manga-page-item {
		position: relative;
		margin: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.page-badge-floating {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		padding: 0.22rem 0.55rem;
		border-radius: 999px;
		background: rgba(9, 11, 16, 0.72);
		backdrop-filter: blur(6px);
		color: rgba(248, 250, 252, 0.85);
		font-size: 0.7rem;
		font-weight: 600;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.manga-page-item:hover .page-badge-floating {
		opacity: 1;
	}
	.manga-page-item img {
		width: 100%;
		height: auto;
		display: block;
		user-select: none;
	}

	/* Paged Viewer */
	.paged-viewer {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		align-items: center;
	}
	.paged-stage {
		position: relative;
		width: 100%;
		background: #090b10;
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 480px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
	}
	.paged-img {
		max-width: 100%;
		max-height: 86vh;
		width: auto;
		height: auto;
		display: block;
		user-select: none;
	}
	.click-zone {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 35%;
		z-index: 5;
		cursor: pointer;
	}
	.click-zone.left {
		left: 0;
	}
	.click-zone.right {
		right: 0;
	}

	.paged-controls {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}
	.nav-page-btn {
		padding: 0.45rem 0.9rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-weight: 600;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.nav-page-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.page-slider-wrap {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}
	.page-slider {
		width: 100%;
		max-width: 280px;
		accent-color: var(--color-brand-500);
	}
	.page-counter {
		font-size: 0.78rem;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.page-caption {
		margin: 0;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		text-align: center;
		width: 100%;
		background: var(--color-surface-100);
	}
	.panel-transcript {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-surface-100);
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.84rem;
	}
	.panel-line strong {
		color: var(--color-brand-400);
		margin-right: 0.35rem;
	}
</style>
