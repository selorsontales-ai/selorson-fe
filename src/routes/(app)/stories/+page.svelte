<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale } from '$lib/i18n-labels';

	interface MangaMeta {
		cover_url?: string;
		page_count?: number;
		has_color?: boolean;
		has_bw?: boolean;
	}

	interface Chapter {
		id: number;
		title: string;
		chapter_number: number;
		author_note: string | null;
		status: string;
		has_manga?: boolean;
		translation_fallback?: boolean;
		manga_meta?: MangaMeta | null;
		word_count?: number;
		reading_time_min?: number;
		created_at: string;
	}

	interface ProgressItem {
		chapter_id: number;
		chapter_number?: number;
		chapter_title?: string;
		has_manga?: boolean;
		last_position: number;
		is_completed?: boolean;
		updated_at: string;
	}

	const LOCAL_PROGRESS_KEY = 'selorson_reading_progress';

	let chapters = $state<Chapter[]>([]);
	let allChaptersCatalog = $state<Chapter[]>([]);
	let progressByChapterId = $state<Record<number, ProgressItem>>({});
	let progressByChapterNum = $state<Record<number, ProgressItem>>({});
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalCount = $state(0);

	// Filters & Sort
	let searchQuery = $state('');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let filterMode = $state<'all' | 'manga' | 'in_progress' | 'completed'>('all');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function loadLocalProgress() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return;
			const byId: Record<number, ProgressItem> = { ...progressByChapterId };
			const byNum: Record<number, ProgressItem> = { ...progressByChapterNum };
			for (const val of Object.values(parsed) as any[]) {
				if (!val || typeof val !== 'object') continue;
				const pos = Number(val.last_position ?? val.position ?? 0);
				const item: ProgressItem = {
					chapter_id: Number(val.chapter_id || 0),
					chapter_number: Number(val.chapter_number || 0) || undefined,
					chapter_title: val.chapter_title || undefined,
					has_manga: Boolean(val.has_manga),
					last_position: Math.max(0, Math.min(100, pos)),
					is_completed: pos >= 95,
					updated_at: val.updated_at || new Date().toISOString()
				};
				if (item.chapter_id > 0) byId[item.chapter_id] = item;
				if (item.chapter_number && item.chapter_number > 0) byNum[item.chapter_number] = item;
			}
			progressByChapterId = byId;
			progressByChapterNum = byNum;
		} catch {}
	}

	async function fetchUserProgress() {
		loadLocalProgress();
		if (!isAuthenticated()) return;
		try {
			const res = await api<any>('/stories/progress');
			if (res?.success && Array.isArray(res.data)) {
				const byId: Record<number, ProgressItem> = { ...progressByChapterId };
				const byNum: Record<number, ProgressItem> = { ...progressByChapterNum };

				for (const row of res.data) {
					const cid = Number(row.chapter_id || 0);
					const cnum = Number(row.chapter_number || 0);
					const serverPos = Number(row.last_position ?? 0);
					const existing: ProgressItem | undefined =
						(cid > 0 ? byId[cid] : undefined) || (cnum > 0 ? byNum[cnum] : undefined);
					const finalPos = existing ? Math.max(serverPos, existing.last_position) : serverPos;
					const merged: ProgressItem = {
						chapter_id: cid,
						chapter_number: cnum || existing?.chapter_number,
						chapter_title: row.chapter_title || existing?.chapter_title,
						has_manga: row.has_manga ?? existing?.has_manga,
						last_position: finalPos,
						is_completed: finalPos >= 95,
						updated_at: row.updated_at || existing?.updated_at || new Date().toISOString()
					};
					if (cid > 0) byId[cid] = merged;
					if (merged.chapter_number && merged.chapter_number > 0) {
						byNum[merged.chapter_number] = merged;
					}
				}
				progressByChapterId = byId;
				progressByChapterNum = byNum;
			}
		} catch {}
	}

	async function fetchCatalogForOverview() {
		try {
			const res = await api<any>('/chapters?page=1&per_page=200&sort=asc');
			if (Array.isArray(res?.data)) {
				allChaptersCatalog = res.data;
			}
		} catch {}
	}

	async function fetchChapters(page = 1) {
		loading = true;
		try {
			const params = new URLSearchParams();
			params.set('page', String(page));
			params.set('per_page', '12');
			params.set('sort', sortOrder);
			if (searchQuery.trim()) {
				params.set('search', searchQuery.trim());
			}
			if (filterMode === 'manga') {
				params.set('has_manga', 'true');
			}
			const res = await api<any>(`/chapters?${params.toString()}`);
			chapters = Array.isArray(res.data) ? res.data : [];
			currentPage = res.meta?.current_page || 1;
			totalPages = res.meta?.total_pages || 1;
			totalCount = res.meta?.total ?? chapters.length;
		} catch {
			chapters = [];
		}
		loading = false;
	}

	function getChapterProgress(ch: Chapter): ProgressItem | null {
		return progressByChapterId[ch.id] || progressByChapterNum[ch.chapter_number] || null;
	}

	let displayedChapters = $derived.by(() => {
		if (filterMode === 'in_progress') {
			const source = allChaptersCatalog.length > 0 ? allChaptersCatalog : chapters;
			const list = source.filter((ch) => {
				const p = getChapterProgress(ch);
				const qMatch =
					!searchQuery.trim() ||
					ch.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
					String(ch.chapter_number) === searchQuery.trim();
				return qMatch && p && p.last_position > 0 && p.last_position < 95;
			});
			return sortOrder === 'desc'
				? [...list].sort((a, b) => b.chapter_number - a.chapter_number)
				: list;
		}
		if (filterMode === 'completed') {
			const source = allChaptersCatalog.length > 0 ? allChaptersCatalog : chapters;
			const list = source.filter((ch) => {
				const p = getChapterProgress(ch);
				const qMatch =
					!searchQuery.trim() ||
					ch.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
					String(ch.chapter_number) === searchQuery.trim();
				return qMatch && p && p.last_position >= 95;
			});
			return sortOrder === 'desc'
				? [...list].sort((a, b) => b.chapter_number - a.chapter_number)
				: list;
		}
		return chapters;
	});

	let continueReadingState = $derived.by(() => {
		const entries = Object.values(progressByChapterId).concat(
			Object.values(progressByChapterNum).filter(
				(item) => !item.chapter_id || !progressByChapterId[item.chapter_id]
			)
		);
		if (entries.length === 0) return null;

		const sorted = [...entries].sort(
			(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
		);
		const latest = sorted[0];
		if (!latest) return null;

		const catalog = allChaptersCatalog.length > 0 ? allChaptersCatalog : chapters;
		const matchedCh = catalog.find(
			(c) => c.id === latest.chapter_id || c.chapter_number === latest.chapter_number
		);
		const chNum = matchedCh?.chapter_number ?? latest.chapter_number;
		const chTitle = matchedCh?.title ?? latest.chapter_title ?? (chNum ? `${m.world_chapter()} ${chNum}` : '');
		if (!chNum) return null;

		if (latest.last_position < 95) {
			return {
				mode: 'resume' as const,
				chapterNumber: chNum,
				title: chTitle,
				progress: Math.max(1, latest.last_position),
				hasManga: Boolean(matchedCh?.has_manga ?? latest.has_manga)
			};
		}

		// Nếu chương gần nhất đã hoàn thành (>= 95%), tìm chương tiếp theo chưa đọc xong
		const nextCh = catalog.find((c) => {
			if (c.chapter_number <= chNum) return false;
			const p = getChapterProgress(c);
			return !p || p.last_position < 95;
		});

		if (nextCh) {
			return {
				mode: 'next' as const,
				chapterNumber: nextCh.chapter_number,
				title: nextCh.title,
				completedChapterNumber: chNum,
				progress: getChapterProgress(nextCh)?.last_position ?? 0,
				hasManga: Boolean(nextCh.has_manga)
			};
		}

		return {
			mode: 'all_done' as const,
			chapterNumber: chNum,
			title: chTitle,
			progress: 100,
			hasManga: Boolean(matchedCh?.has_manga ?? latest.has_manga)
		};
	});

	let summaryStats = $derived.by(() => {
		const catalog = allChaptersCatalog.length > 0 ? allChaptersCatalog : chapters;
		const total = catalog.length || totalCount;
		const mangaCount = catalog.filter((c) => c.has_manga).length;
		let completedCount = 0;
		let readingCount = 0;
		for (const ch of catalog) {
			const p = getChapterProgress(ch);
			if (p) {
				if (p.last_position >= 95) completedCount++;
				else if (p.last_position > 0) readingCount++;
			}
		}
		return { total, mangaCount, completedCount, readingCount };
	});

	function handleSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			fetchChapters(1);
		}, 240);
	}

	function clearSearch() {
		searchQuery = '';
		fetchChapters(1);
	}

	function toggleSortOrder() {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		fetchChapters(1);
	}

	function selectFilter(mode: 'all' | 'manga' | 'in_progress' | 'completed') {
		filterMode = mode;
		fetchChapters(1);
	}

	onMount(() => {
		fetchUserProgress();
		fetchCatalogForOverview();
		fetchChapters(1);
	});

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString(dateLocale(), {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{m.stories_seo_title()}</title>
	<meta name="description" content={m.stories_seo_desc()} />
</svelte:head>

<section class="stories-page">
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<h1>{m.stories_list_title()}</h1>
			<p class="hero-tagline">{m.stories_list_subtitle()}</p>

			{#if summaryStats.total > 0}
				<div class="hero-stats-pills">
					<span class="stat-pill">📚 {summaryStats.total} {m.stories_published_chapters()}</span>
					{#if summaryStats.mangaCount > 0}
						<span class="stat-pill manga">🎨 {summaryStats.mangaCount} {m.stories_manga_editions()}</span>
					{/if}
					{#if summaryStats.completedCount > 0 || summaryStats.readingCount > 0}
						<span class="stat-pill progress">
							✓ {m.stories_read()} {summaryStats.completedCount}/{summaryStats.total} {m.stories_chapters()}
						</span>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<div class="stories-container">
		<!-- Banner Tiếp Tục Hành Trình -->
		{#if continueReadingState}
			<div class="continue-banner glass-card">
				<div class="continue-info">
					{#if continueReadingState.mode === 'resume'}
						<span class="continue-eyebrow">📍 {m.stories_continue_your_reading_journey()}</span>
						<h2 class="continue-title">
							{m.world_chapter()} {continueReadingState.chapterNumber}: {continueReadingState.title}
						</h2>
						<div class="continue-progress-row">
							<div class="continue-bar">
								<div class="continue-bar-fill" style:width="{continueReadingState.progress}%"></div>
							</div>
							<span class="continue-pct">{m.stories_at()} {continueReadingState.progress}%</span>
						</div>
					{:else if continueReadingState.mode === 'next'}
						<span class="continue-eyebrow">
							✨ {m.stories_completed_up_next({ num: continueReadingState.completedChapterNumber })}
						</span>
						<h2 class="continue-title">
							{m.world_chapter()} {continueReadingState.chapterNumber}: {continueReadingState.title}
						</h2>
						<p class="continue-sub">{m.stories_ready_to_open_the_next()}</p>
					{:else}
						<span class="continue-eyebrow">🏆 {m.stories_caught_up_with_all_chapters()}</span>
						<h2 class="continue-title">
							{m.world_chapter()} {continueReadingState.chapterNumber}: {continueReadingState.title}
						</h2>
						<p class="continue-sub">{m.stories_you_have_completed_the_latest()}</p>
					{/if}
				</div>

				<div class="continue-actions">
					<a href="/stories/{continueReadingState.chapterNumber}" class="btn-brand continue-btn">
						{#if continueReadingState.mode === 'resume'}
							▶ {m.stories_resume()} ({continueReadingState.progress}%)
						{:else if continueReadingState.mode === 'next'}
							📖 {m.stories_read_chapter()} {continueReadingState.chapterNumber} →
						{:else}
							🔄 {m.stories_re_read_chapter()} {continueReadingState.chapterNumber}
						{/if}
					</a>
					{#if continueReadingState.hasManga}
						<a
							href="/stories/{continueReadingState.chapterNumber}?tab=manga"
							class="btn-ghost continue-manga-btn"
						>
							{m.stories_view_manga()}
						</a>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Thanh Công cụ Tìm kiếm, Bộ lọc & Sắp xếp -->
		<div class="stories-toolbar glass-card">
			<div class="search-box">
				<span class="search-icon">🔍</span>
				<input
					type="text"
					placeholder={m.stories_search_by_chapter_number_or()}
					bind:value={searchQuery}
					oninput={handleSearchInput}
					aria-label={m.stories_search_chapters()}
				/>
				{#if searchQuery}
					<button type="button" class="clear-btn" onclick={clearSearch} aria-label={m.stories_clear_search()}>
						✕
					</button>
				{/if}
			</div>

			<div class="filter-controls">
				<div class="filter-chips" role="group" aria-label={m.stories_chapter_filters()}>
					<button
						type="button"
						class="filter-chip"
						class:active={filterMode === 'all'}
						onclick={() => selectFilter('all')}
					>
						{m.lib_cat_all()}
					</button>
					<button
						type="button"
						class="filter-chip manga-chip"
						class:active={filterMode === 'manga'}
						onclick={() => selectFilter('manga')}
					>
						{m.stories_with_manga()}
					</button>
					<button
						type="button"
						class="filter-chip"
						class:active={filterMode === 'in_progress'}
						onclick={() => selectFilter('in_progress')}
					>
						{m.stories_in_progress()}
					</button>
					<button
						type="button"
						class="filter-chip"
						class:active={filterMode === 'completed'}
						onclick={() => selectFilter('completed')}
					>
						{m.lib_completed()}
					</button>
				</div>

				<button
					type="button"
					class="sort-toggle-btn"
					onclick={toggleSortOrder}
					title={m.stories_reverse_chapter_sort_order()}
				>
					{sortOrder === 'asc' ? m.stories_ch_1_newest() : m.stories_newest_ch_1()}
				</button>
			</div>
		</div>

		{#if loading}
			<div class="skeleton-grid">
				{#each Array(6) as _}
					<div class="skeleton-card"></div>
				{/each}
			</div>
		{:else if displayedChapters.length === 0}
			<div class="empty-state glass-card">
				<span class="empty-icon">📖</span>
				{#if searchQuery || filterMode !== 'all'}
					<h3>{m.stories_no_matching_chapters_found()}</h3>
					<p>{m.stories_try_changing_your_search_query()}</p>
					<button
						type="button"
						class="btn-ghost"
						style="margin-top: 0.75rem"
						onclick={() => {
							searchQuery = '';
							selectFilter('all');
						}}
					>
						{m.stories_reset_filters()}
					</button>
				{:else}
					<h3>{m.stories_empty_title()}</h3>
					<p>{m.stories_empty_desc()}</p>
				{/if}
			</div>
		{:else}
			<div class="chapter-grid">
				{#each displayedChapters as chapter (chapter.id)}
					{@const prog = getChapterProgress(chapter)}
					{@const pct = prog?.last_position ?? 0}
					{@const isDone = pct >= 95}
					<div class="glass-card chapter-card" class:is-completed={isDone} class:is-reading={pct > 0 && !isDone}>
						<a href="/stories/{chapter.chapter_number}" class="chapter-card-main">
							<div class="chapter-top-row">
								<div class="chapter-number">Ch. {chapter.chapter_number}</div>
								<div class="chapter-badges">
									{#if chapter.translation_fallback}
										<span class="fallback-lang-badge" title={m.stories_vi_fallback_tooltip()}>
											🌐 {m.stories_vi_fallback_badge()}
										</span>
									{/if}
									{#if chapter.has_manga}
										<span class="manga-badge" title={m.stories_this_chapter_has_a_manga()}>
											🎨 Manga{chapter.manga_meta?.page_count ? ` · ${chapter.manga_meta.page_count} ${m.stories_p()}` : ''}
										</span>
									{/if}
									{#if isDone}
										<span class="read-badge completed" title={m.stories_completed()}>{m.lib_completed()}</span>
									{:else if pct > 0}
										<span class="read-badge reading" title={m.stories_in_progress_pct({ pct })}>
											{m.lib_reading()} {pct}%
										</span>
									{/if}
								</div>
							</div>

							<h3 class="chapter-title">{chapter.title}</h3>

							{#if chapter.author_note}
								<p class="chapter-note">{chapter.author_note}</p>
							{/if}

							<div class="chapter-meta-footer">
								<span class="chapter-date">{formatDate(chapter.created_at)}</span>
								{#if chapter.reading_time_min}
									<span class="chapter-read-time">
										⏱️ ~{chapter.reading_time_min} {m.stories_min_read()}
									</span>
								{/if}
							</div>
						</a>

						{#if chapter.has_manga}
							<div class="chapter-card-subactions">
								<a href="/stories/{chapter.chapter_number}" class="sub-link prose-link">
									📖 {m.stories_prose()}{pct > 0 && !isDone ? ` (${pct}%)` : ''}
								</a>
								<a href="/stories/{chapter.chapter_number}?tab=manga" class="sub-link manga-link">
									{m.stories_read_manga()}
								</a>
							</div>
						{/if}

						{#if pct > 0}
							<div class="card-progress-track" title={m.stories_reading_progress_pct({ pct })}>
								<div
									class="card-progress-fill"
									class:done={isDone}
									style:width="{Math.min(100, pct)}%"
								></div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if filterMode !== 'in_progress' && filterMode !== 'completed' && totalPages > 1}
				<div class="pagination">
					<button
						class="btn-ghost"
						disabled={currentPage <= 1}
						onclick={() => fetchChapters(currentPage - 1)}
					>
						{m.btn_prev()}
					</button>
					<span class="page-info">
						{m.pagination_info({ current: currentPage, total: totalPages })}
					</span>
					<button
						class="btn-ghost"
						disabled={currentPage >= totalPages}
						onclick={() => fetchChapters(currentPage + 1)}
					>
						{m.btn_next()}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.stories-page {
		min-height: 75vh;
		padding-bottom: 4rem;
	}

	.stories-container {
		max-width: 1080px;
		margin: 0 auto;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem);
		display: flex;
		flex-direction: column;
		gap: 1.35rem;
	}

	/* ===== Hero ===== */
	.page-hero {
		position: relative;
		text-align: center;
		padding: clamp(2.25rem, 5vw, 3.25rem) clamp(1rem, 4vw, 2rem) clamp(1.5rem, 3.5vw, 2.25rem);
		background: var(--color-surface-0);
		overflow: hidden;
		margin-bottom: 1.25rem;
	}
	.hero-content {
		position: relative;
		z-index: 1;
	}
	.page-hero h1 {
		font-size: clamp(1.75rem, 4.5vw, 2.5rem);
		font-weight: 800;
		color: var(--color-text-primary);
		margin: 0 0 0.375rem;
	}
	.hero-tagline {
		color: var(--color-text-muted);
		font-size: 1.05rem;
		margin: 0;
		font-weight: 400;
	}
	.hero-glow {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 60% at 50% 30%, rgba(12, 113, 61, 0.15), transparent),
			radial-gradient(ellipse 60% 50% at 80% 50%, rgba(6, 182, 212, 0.08), transparent);
		pointer-events: none;
	}
	.hero-stats-pills {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.55rem;
		margin-top: 1rem;
	}
	.stat-pill {
		font-size: 0.76rem;
		font-weight: 600;
		padding: 0.28rem 0.75rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-text-secondary);
	}
	.stat-pill.manga {
		background: rgba(168, 85, 247, 0.12);
		border-color: rgba(168, 85, 247, 0.28);
		color: #d8b4fe;
	}
	.stat-pill.progress {
		background: rgba(16, 185, 129, 0.12);
		border-color: rgba(16, 185, 129, 0.28);
		color: #6ee7b7;
	}

	/* ===== Continue Reading Banner ===== */
	.continue-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.25rem;
		padding: 1.35rem 1.6rem;
		border: 1px solid rgba(16, 185, 129, 0.32);
		background: linear-gradient(
			135deg,
			rgba(12, 113, 61, 0.16) 0%,
			rgba(6, 182, 212, 0.07) 60%,
			rgba(15, 23, 42, 0.4) 100%
		);
	}
	.continue-info {
		flex: 1;
		min-width: 0;
	}
	.continue-eyebrow {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: #34d399;
		text-transform: uppercase;
		margin-bottom: 0.3rem;
	}
	.continue-title {
		font-size: 1.22rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 0.45rem;
	}
	.continue-sub {
		font-size: 0.84rem;
		color: var(--color-text-muted);
		margin: 0;
	}
	.continue-progress-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: 360px;
	}
	.continue-bar {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		overflow: hidden;
	}
	.continue-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #10b981, #06b6d4);
		border-radius: 999px;
		transition: width 0.3s ease;
	}
	.continue-pct {
		font-size: 0.78rem;
		font-weight: 700;
		color: #6ee7b7;
		white-space: nowrap;
	}
	.continue-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-shrink: 0;
	}
	.continue-btn {
		text-decoration: none;
		white-space: nowrap;
	}
	.continue-manga-btn {
		text-decoration: none;
		white-space: nowrap;
		font-size: 0.84rem;
	}

	/* ===== Toolbar (Search, Filters, Sort) ===== */
	.stories-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.85rem;
		padding: 0.85rem 1.1rem;
	}
	.search-box {
		position: relative;
		flex: 1;
		min-width: 220px;
		display: flex;
		align-items: center;
	}
	.search-icon {
		position: absolute;
		left: 0.8rem;
		font-size: 0.85rem;
		pointer-events: none;
		opacity: 0.65;
	}
	.search-box input {
		width: 100%;
		padding: 0.52rem 2.1rem 0.52rem 2.25rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.85rem;
		outline: none;
		transition: border-color 0.2s;
	}
	.search-box input:focus {
		border-color: var(--color-brand-500);
	}
	.clear-btn {
		position: absolute;
		right: 0.55rem;
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.82rem;
		padding: 0.2rem 0.35rem;
	}
	.filter-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.filter-chips {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.filter-chip {
		padding: 0.42rem 0.8rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.18s;
	}
	.filter-chip:hover {
		border-color: var(--color-brand-400);
		color: var(--color-text-primary);
	}
	.filter-chip.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.filter-chip.manga-chip.active {
		background: linear-gradient(135deg, #9333ea, #6366f1);
		border-color: #9333ea;
	}
	.sort-toggle-btn {
		padding: 0.42rem 0.85rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.18s;
	}
	.sort-toggle-btn:hover {
		border-color: var(--color-brand-400);
		color: var(--color-text-primary);
	}

	/* ===== Chapter Grid & Cards ===== */
	.chapter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 1rem;
	}

	.chapter-card {
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: transform 0.2s ease, border-color 0.2s ease;
	}
	.chapter-card:hover {
		transform: translateY(-2px);
	}
	.chapter-card.is-reading {
		border-color: rgba(245, 158, 11, 0.32);
	}
	.chapter-card.is-completed {
		border-color: rgba(16, 185, 129, 0.28);
	}

	.chapter-card-main {
		text-decoration: none;
		padding: 1.35rem 1.4rem 1.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
		color: inherit;
	}

	.chapter-top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.chapter-number {
		font-size: 0.76rem;
		font-weight: 800;
		color: var(--color-brand-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.chapter-badges {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.manga-badge {
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		background: rgba(168, 85, 247, 0.14);
		color: #c084fc;
		border: 1px solid rgba(168, 85, 247, 0.3);
	}

	.read-badge {
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
	}
	.read-badge.completed {
		background: rgba(16, 185, 129, 0.14);
		color: #34d399;
		border: 1px solid rgba(16, 185, 129, 0.3);
	}
	.read-badge.reading {
		background: rgba(245, 158, 11, 0.14);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.32);
	}

	.chapter-title {
		font-size: 1.08rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
		line-height: 1.35;
	}

	.chapter-note {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin: 0;
	}

	.chapter-meta-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.45rem;
	}

	.chapter-date,
	.chapter-read-time {
		font-size: 0.74rem;
		color: var(--color-text-muted);
	}

	.chapter-card-subactions {
		display: flex;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(0, 0, 0, 0.14);
	}
	.sub-link {
		flex: 1;
		text-align: center;
		padding: 0.5rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-decoration: none;
		color: var(--color-text-secondary);
		transition: background 0.15s, color 0.15s;
	}
	.sub-link:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text-primary);
	}
	.sub-link.manga-link {
		color: #c084fc;
		border-left: 1px solid rgba(255, 255, 255, 0.06);
	}
	.sub-link.manga-link:hover {
		background: rgba(168, 85, 247, 0.12);
		color: #e9d5ff;
	}

	.card-progress-track {
		height: 3px;
		width: 100%;
		background: rgba(255, 255, 255, 0.06);
	}
	.card-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
		transition: width 0.25s ease;
	}
	.card-progress-fill.done {
		background: linear-gradient(90deg, #10b981, #06b6d4);
	}

	/* Skeleton */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 1rem;
	}

	.skeleton-card {
		height: 150px;
		border-radius: var(--radius-lg);
		animation: shimmer 1.5s infinite;
		background: linear-gradient(
			90deg,
			var(--color-surface-200) 25%,
			var(--color-surface-300) 50%,
			var(--color-surface-200) 75%
		);
		background-size: 200% 100%;
	}

	/* Empty */
	.empty-state {
		text-align: center;
		padding: 3.5rem 1.5rem;
		color: var(--color-text-muted);
	}

	.empty-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.75rem;
	}

	.empty-state h3 {
		font-size: 1.2rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.4rem;
	}

	/* Pagination */
	.pagination {
		margin-top: 1.5rem;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
	}

	.page-info {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.fallback-lang-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		background: rgba(148, 163, 184, 0.14);
		border: 1px solid rgba(148, 163, 184, 0.28);
		color: var(--color-text-muted);
	}

	@media (max-width: 720px) {
		.continue-banner {
			flex-direction: column;
			align-items: stretch;
			padding: 1.1rem 1.15rem;
		}
		.continue-actions {
			width: 100%;
			flex-wrap: wrap;
		}
		.continue-btn,
		.continue-manga-btn {
			flex: 1 1 140px;
			text-align: center;
		}
		.stories-toolbar {
			flex-direction: column;
			align-items: stretch;
		}
		.search-box {
			min-width: 0;
		}
		.filter-controls {
			justify-content: space-between;
		}
	}
</style>
