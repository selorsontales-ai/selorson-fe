<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';
	import StoryContent from '$lib/components/story/StoryContent.svelte';
	import MangaReader from '$lib/components/story/MangaReader.svelte';
	import { extractMangaConfig } from '$lib/story/manga-blocks';

	let chapter = $state<any>(null);
	let prevCh = $state<number | null>(null);
	let nextCh = $state<number | null>(null);
	let libraryTags = $state<any[]>([]);
	let linkedChapters = $state<any[]>([]);
	let selectedLoreItem = $state<any | null>(null);
	let readerTab = $state<'prose' | 'manga'>('prose');
	let requestedEdition = $derived<'color' | 'bw' | undefined>(
		page.url.searchParams.get('edition') === 'bw'
			? 'bw'
			: page.url.searchParams.get('edition') === 'color'
				? 'color'
				: undefined
	);
	let loading = $state(true);
	let error = $state('');
	let scrollProgress = $state(0);

	let mangaConfig = $derived(chapter ? extractMangaConfig(chapter.content_blocks) : null);
	let hasPublishedManga = $derived(
		Boolean(
			mangaConfig &&
				mangaConfig.manga_status === 'published' &&
				(mangaConfig.pages.length > 0 ||
					mangaConfig.color_pages.length > 0 ||
					mangaConfig.bw_pages.length > 0)
		)
	);

	// Reader settings (persisted in localStorage)
	const PALATINO_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif";
	let fontSize = $state(18);
	let lineHeight = $state(1.8);
	let maxWidth = $state(720);
	let fontFamily = $state(PALATINO_FONT);
	let theme = $state('default');
	let showSettings = $state(false);

	// Auto-scroll
	let autoScrolling = $state(false);
	let autoScrollSpeed = $state(2);
	let showSpeedPicker = $state(false);
	let autoScrollTimer: ReturnType<typeof setInterval> | null = null;

	const fontOptions = [
		{ value: PALATINO_FONT, label: 'Sách in (Palatino)' },
		{ value: "Cambria, 'Palatino Linotype', 'Times New Roman', serif", label: 'Sách rõ chữ (Cambria)' },
		{ value: 'Georgia, serif', label: 'Georgia (Serif)' },
		{ value: 'Inter', label: 'Inter (Sans)' },
		{ value: 'Merriweather, serif', label: 'Merriweather' },
		{ value: 'Lora, serif', label: 'Lora' },
		{ value: "'Times New Roman', Times, serif", label: 'Cổ điển (Times New Roman)' },
		{ value: '"Roboto Mono", monospace', label: 'Roboto Mono' },
		{ value: '"Cinzel Decorative", serif', label: 'Cinzel Decorative' },
		{ value: '"Uncial Antiqua", cursive', label: 'Uncial Antiqua' },
		{ value: '"Metamorphous", serif', label: 'Metamorphous' },
		{ value: '"IM Fell English", serif', label: 'IM Fell English' }
	];

	const categoryLabels: Record<string, string> = {
		character: '👤 Nhân vật',
		location: '🏛️ Địa danh',
		faction: '⚔️ Thế lực',
		item: '🗡️ Vật phẩm',
		creature: '🐉 Sinh vật',
		magic: '✨ Ma thuật',
		event: '📜 Sự kiện',
		concept: '🔮 Khái niệm'
	};

	let themes = $derived([
		{ id: 'default', name: m.reader_theme_default(), bg: 'transparent', color: 'inherit', preview: '#1e293b', previewText: '#c8d6e5' },
		{ id: 'cowriter-dark', name: 'Tối dịu (Co-Writer)', bg: '#121e20', color: '#f3f1e4', preview: '#121e20', previewText: '#f3f1e4' },
		{ id: 'sepia', name: m.reader_theme_sepia(), bg: '#f5e6c8', color: '#5b4636', preview: '#f5e6c8', previewText: '#5b4636' },
		{ id: 'mint', name: m.reader_theme_mint(), bg: '#e8f5e9', color: '#2e5a3a', preview: '#e8f5e9', previewText: '#2e5a3a' },
		{ id: 'sky', name: m.reader_theme_sky(), bg: '#e3f2fd', color: '#1a3a5c', preview: '#e3f2fd', previewText: '#1a3a5c' },
		{ id: 'lavender', name: m.reader_theme_lavender(), bg: '#f3e5f5', color: '#4a2560', preview: '#f3e5f5', previewText: '#4a2560' },
		{ id: 'night', name: m.reader_theme_night(), bg: '#0f0f1a', color: '#b8c0d0', preview: '#0f0f1a', previewText: '#b8c0d0' },
		{ id: 'classic', name: m.reader_theme_classic(), bg: '#2a1f0e', color: '#f5e6c8', preview: '#2a1f0e', previewText: '#c8a84b' },
	]);

	const speedOptions = [
		{ value: 1, label: '1x' },
		{ value: 2, label: '2x' },
		{ value: 3, label: '3x' },
		{ value: 5, label: '5x' },
	];

	onMount(() => {
		// Load saved reader settings
		const saved = localStorage.getItem('selorson_reader');
		if (saved) {
			try {
				const s = JSON.parse(saved);
				fontSize = s.fontSize || 18;
				lineHeight = s.lineHeight || 1.8;
				maxWidth = s.maxWidth || 720;
				fontFamily = s.fontFamily || PALATINO_FONT;
				theme = s.theme || 'default';
				autoScrollSpeed = s.autoScrollSpeed || 2;
			} catch {}
		}

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', handleScroll);
			stopAutoScroll();
		};
	});

	let lastLoadedNumber = $state<string | null>(null);
	$effect(() => {
		const num = page.params.number;
		if (num && num !== lastLoadedNumber) {
			lastLoadedNumber = num;
			loadChapter(num);
		}
	});

	async function loadChapter(numParam?: string) {
		loading = true;
		error = '';
		readerTab = page.url.searchParams.get('tab') === 'manga' ? 'manga' : 'prose';
		selectedLoreItem = null;
		try {
			const num = numParam ?? page.params.number;
			const res = await api<any>(`/chapters/${num}`);
			chapter = res.data.chapter;
			prevCh = res.data.prev_chapter;
			nextCh = res.data.next_chapter;
			libraryTags = Array.isArray(res.data.library_tags) ? res.data.library_tags : [];
			linkedChapters = Array.isArray(res.data.linked_chapters) ? res.data.linked_chapters : [];
			if (page.url.searchParams.get('tab') === 'manga') {
				readerTab = 'manga';
			}
			if (isAuthenticated() && chapter) {
				saveProgress(chapter.id, 0);
			}
		} catch { error = m.reader_not_found(); }
		loading = false;
	}

	async function saveProgress(chapterId: number, position: number) {
		try { await api(`/chapters/${chapterId}/progress`, { method: 'POST', body: { position } }); } catch {}
	}

	function handleScroll() {
		const h = document.documentElement;
		const total = h.scrollHeight - h.clientHeight;
		scrollProgress = total > 0 ? Math.round((h.scrollTop / total) * 100) : 0;
	}

	function saveSettings() {
		localStorage.setItem('selorson_reader', JSON.stringify({ fontSize, lineHeight, maxWidth, fontFamily, theme, autoScrollSpeed }));
	}

	$effect(() => { fontSize; lineHeight; maxWidth; fontFamily; theme; autoScrollSpeed; saveSettings(); });

	// Auto-scroll controls
	function toggleAutoScroll() {
		if (autoScrolling) {
			stopAutoScroll();
		} else {
			showSpeedPicker = true;
		}
	}

	function pickSpeed(speed: number) {
		autoScrollSpeed = speed;
		if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
		startAutoScroll();
	}

	function startAutoScroll() {
		autoScrolling = true;
		const px = autoScrollSpeed;
		autoScrollTimer = setInterval(() => {
			window.scrollBy({ top: px, behavior: 'auto' });
			if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 2) {
				stopAutoScroll();
			}
		}, 30);
	}

	function stopAutoScroll() {
		if (autoScrollTimer) clearInterval(autoScrollTimer);
		autoScrollTimer = null;
		autoScrolling = false;
		showSpeedPicker = false;
	}

	function getThemeStyle() {
		const t = themes.find(th => th.id === theme);
		if (!t || t.id === 'default') return '';
		
		let borderStyle = '1px solid rgba(0,0,0,.06)';
		if (t.id === 'night') borderStyle = '1px solid rgba(255,255,255,.06)';
		if (t.id === 'classic') borderStyle = '1px solid rgba(200,168,75,.3)';
		
		return `background:${t.bg};color:${t.color};border-radius:1rem;padding:2.5rem;border:${borderStyle};`;
	}
</script>

<svelte:head>
	<title>{chapter ? `Ch. ${chapter.chapter_number}: ${chapter.title}` : m.reader_loading()} — Selorson</title>
	{#if chapter}
		<meta name="description" content="{chapter.title} — Selorson Stories" />
	{/if}
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:wght@400;700&display=swap" rel="stylesheet" />
	<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Uncial+Antiqua&family=Metamorphous&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Scroll Progress -->
<div class="progress-bar" style:width="{scrollProgress}%"></div>

<section class="reader-page">
	{#if loading}
		<div class="loading-state">
			<div class="spinner-lg"></div>
			<p>{m.reader_loading()}</p>
		</div>
	{:else if error}
		<div class="error-state">
			<span class="error-icon">😔</span>
			<h3>{error}</h3>
			<a href="/stories" class="btn-brand">{m.reader_back_list()}</a>
		</div>
	{:else if chapter}
		<article class="reader" style:max-width="{readerTab === 'manga' ? Math.max(maxWidth, 860) : maxWidth}px">
			<header class="reader-header">
				<a href="/stories" class="back-link">{m.reader_back_list()}</a>
				<span class="ch-num">Chapter {chapter.chapter_number}</span>
				<h1>{chapter.title}</h1>
				<time>{new Date(chapter.created_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
			</header>

			<!-- Dual-Mode Switcher: Prose vs Manga -->
			{#if hasPublishedManga && mangaConfig}
				<div class="mode-switcher">
					<button
						type="button"
						class="mode-switch-btn"
						class:active={readerTab === 'prose'}
						onclick={() => (readerTab = 'prose')}
					>
						📖 Đọc Truyện Chữ
					</button>
					<button
						type="button"
						class="mode-switch-btn manga-tab"
						class:active={readerTab === 'manga'}
						onclick={() => (readerTab = 'manga')}
					>
						{#if mangaConfig.color_pages.length > 0 && mangaConfig.bw_pages.length > 0}
							🎨 Xem Manga (🎨 {mangaConfig.color_pages.length} · 🖋️ {mangaConfig.bw_pages.length})
						{:else}
							🎨 Xem Manga ({mangaConfig.pages.length} trang)
						{/if}
					</button>
				</div>
			{/if}

			{#if readerTab === 'prose'}
				<!-- Sticky Toolbar Wrapper -->
				<div class="toolbar-sticky-wrapper">
					<!-- Reading Toolbar -->
					<div class="reading-toolbar">
						<!-- Font Size -->
						<div class="toolbar-group">
							<button class="tool-btn" onclick={() => { fontSize = Math.max(12, fontSize - 2); }} title={m.reader_font_smaller()}>A-</button>
							<span class="font-size-label">{fontSize}px</span>
							<button class="tool-btn" onclick={() => { fontSize = Math.min(32, fontSize + 2); }} title={m.reader_font_larger()}>A+</button>
						</div>

						<!-- Font Family -->
						<div class="toolbar-group">
							<select class="font-select" bind:value={fontFamily}>
								{#each fontOptions as f}
									<option value={f.value}>{f.label}</option>
								{/each}
							</select>
						</div>

						<!-- Themes -->
						<div class="toolbar-group">
							{#each themes as t}
								<button class="theme-btn" class:active={theme === t.id}
									style="background:{t.preview};color:{t.previewText}"
									title={t.name} onclick={() => theme = t.id}>Aa</button>
							{/each}
						</div>

						<!-- Auto Scroll -->
						<div class="toolbar-group auto-scroll-group">
							<button class="tool-btn" class:active={autoScrolling} onclick={toggleAutoScroll}
								title={autoScrolling ? m.reader_stop_scroll() : m.reader_auto_scroll()}>{autoScrolling ? '⏸' : '▶'}</button>
							{#if showSpeedPicker}
								<div class="speed-picker">
									{#each speedOptions as s}
										<button class="speed-btn" class:active={autoScrolling && autoScrollSpeed === s.value}
											onclick={() => pickSpeed(s.value)}>{s.label}</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Settings (Width, Line height) -->
						<button class="tool-btn" onclick={() => showSettings = !showSettings} title={m.reader_settings()} class:active={showSettings}>⚙️</button>
					</div>

					<!-- Extended Settings Panel -->
					{#if showSettings}
						<div class="reader-settings glass-card">
							<label>
								<span>{m.reader_line_height()}</span>
								<input type="range" min="1.4" max="2.4" step="0.1" bind:value={lineHeight} />
								<span class="val">{lineHeight}</span>
							</label>
							<label>
								<span>{m.reader_width()}</span>
								<input type="range" min="500" max="1000" step="20" bind:value={maxWidth} />
								<span class="val">{maxWidth}px</span>
							</label>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Chapter Navigation (Top) -->
			<nav class="chapter-nav-top">
				{#if prevCh}
					<a href="/stories/{prevCh}" class="nav-btn prev">{m.reader_prev_ch()}</a>
				{:else}
					<span class="nav-btn prev disabled">{m.reader_prev_ch()}</span>
				{/if}
				{#if nextCh}
					<a href="/stories/{nextCh}" class="nav-btn next">{m.reader_next_ch()}</a>
				{:else}
					<span class="nav-btn next disabled">{m.reader_next_ch()}</span>
				{/if}
			</nav>

			{#if readerTab === 'manga' && hasPublishedManga && mangaConfig}
				<MangaReader manga={mangaConfig} initialEdition={requestedEdition} />
			{:else}
				<div class="reader-content" style:font-size="{fontSize}px" style:line-height="{lineHeight}" style:font-family="{fontFamily}" style="{getThemeStyle()}">
					<StoryContent
						blocks={chapter.content_blocks}
						contentHtml={chapter.content_html}
						content={chapter.content}
						emptyText={m.reader_no_content()}
					/>
				</div>
			{/if}

			{#if chapter.author_note}
				<div class="author-note glass-card">
					<h4>{m.reader_author_note()}</h4>
					<p>{chapter.author_note}</p>
				</div>
			{/if}

			<!-- Library Entities Appearing in Chapter -->
			{#if libraryTags.length > 0}
				<section class="chapter-lore-section glass-card">
					<div class="lore-sec-header">
						<h4>🏷️ Hồ sơ Thế giới xuất hiện trong chương ({libraryTags.length})</h4>
						<a href="/library" class="lore-all-link">Mở Thư Viện →</a>
					</div>
					<div class="lore-tags-grid">
						{#each libraryTags as tag (tag.id)}
							<button type="button" class="lore-tag-card" onclick={() => (selectedLoreItem = tag)}>
								{#if tag.image_url}
									<img src={tag.image_url} alt={tag.name} class="lore-tag-avatar" loading="lazy" />
								{:else}
									<div class="lore-tag-avatar placeholder">
										{(categoryLabels[tag.category] || '📌').slice(0, 2)}
									</div>
								{/if}
								<div class="lore-tag-meta">
									<span class="lore-tag-cat">{categoryLabels[tag.category] || tag.category}</span>
									<strong class="lore-tag-name">{tag.name}</strong>
									{#if tag.extra_data?.role}
										<span class="lore-tag-role">{tag.extra_data.role}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Linked Chapters -->
			{#if linkedChapters.length > 0}
				<section class="chapter-links-section glass-card">
					<h4>🔗 Chương liên quan ({linkedChapters.length})</h4>
					<div class="linked-ch-list">
						{#each linkedChapters as lc (lc.id)}
							<a href="/stories/{lc.chapter_number}" class="linked-ch-chip">
								<span class="lc-num">Ch. {lc.chapter_number}</span>
								<span class="lc-title">{lc.title}</span>
								{#if lc.link_note}
									<span class="lc-note">— {lc.link_note}</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Chapter Navigation (Bottom) -->
			<nav class="chapter-nav">
				{#if prevCh}
					<a href="/stories/{prevCh}" class="btn-ghost">← Ch. {prevCh}</a>
				{:else}
					<span class="btn-ghost disabled">{m.reader_end_of_story()}</span>
				{/if}
				<a href="/stories" class="btn-ghost">{m.reader_toc()}</a>
				{#if nextCh}
					<a href="/stories/{nextCh}" class="btn-brand">Ch. {nextCh} →</a>
				{:else}
					<span class="end-note">{m.reader_latest_ch()}</span>
				{/if}
			</nav>

			<!-- Scroll % indicator -->
			<div class="scroll-indicator">{scrollProgress}%</div>

			<!-- Comments Section -->
			{#if chapter}
				<CommentsSection commentableType="chapter" commentableId={chapter.id} />
			{/if}
		</article>
	{/if}
</section>

<!-- Quick Lore Modal -->
{#if selectedLoreItem}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="lore-modal-overlay" onclick={() => (selectedLoreItem = null)}>
		<div class="lore-modal glass-card" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="lore-modal-close" onclick={() => (selectedLoreItem = null)}>✕</button>
			<div class="lore-modal-body">
				{#if selectedLoreItem.image_url}
					<img src={selectedLoreItem.image_url} alt={selectedLoreItem.name} class="lore-modal-img" />
				{/if}
				<div class="lore-modal-info">
					<span class="lore-tag-cat">{categoryLabels[selectedLoreItem.category] || selectedLoreItem.category}</span>
					<h3>{selectedLoreItem.name}</h3>
					{#if selectedLoreItem.extra_data?.role}
						<p class="lore-modal-role">{selectedLoreItem.extra_data.role}</p>
					{/if}
					{#if Array.isArray(selectedLoreItem.extra_data?.aliases) && selectedLoreItem.extra_data.aliases.length > 0}
						<p class="lore-modal-aliases">
							<strong>Tên gọi khác:</strong> {selectedLoreItem.extra_data.aliases.join(', ')}
						</p>
					{/if}
					{#if selectedLoreItem.description}
						<p class="lore-modal-desc">{selectedLoreItem.description}</p>
					{/if}
					<div class="lore-modal-actions">
						<a href="/library" class="btn-ghost">Xem trong Thư Viện</a>
						{#if selectedLoreItem.category === 'location'}
							<a href="/world" class="btn-brand">🌍 Xem trên Bản đồ 3D</a>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.progress-bar {
		position: fixed; top: 0; left: 0; height: 3px; z-index: 999;
		background: linear-gradient(90deg, var(--color-brand-500), var(--color-accent-cyan));
		transition: width 0.1s ease;
	}
	.reader-page { margin: 0 auto; padding: 2rem 1.5rem 6rem; }
	.loading-state {
		display: flex; flex-direction: column; align-items: center;
		justify-content: center; min-height: 50vh; gap: 1rem; text-align: center;
		color: var(--color-text-muted);
	}
	.spinner-lg {
		width: 32px; height: 32px;
		border: 3px solid var(--color-surface-300);
		border-top-color: var(--color-brand-400);
		border-radius: 50%; animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.error-state { text-align: center; padding: 4rem; }
	.error-icon { font-size: 3rem; display: block; margin-bottom: 0.5rem; }
	.error-state h3 { margin-bottom: 1rem; color: var(--color-text-secondary); }

	.reader { max-width: 720px; margin: 0 auto; transition: max-width 0.3s ease; }
	.reader-header { margin-bottom: 1.5rem; text-align: center; }
	.back-link { font-size: .82rem; color: var(--color-text-muted); text-decoration: none; transition: color .2s; }
	.back-link:hover { color: var(--color-brand-400); }
	.ch-num {
		display: block; font-size: .75rem; font-weight: 700;
		color: var(--color-brand-400); text-transform: uppercase;
		letter-spacing: .1em; margin: 1.5rem 0 .5rem;
	}
	.reader-header h1 { font-size: clamp(1.5rem, 4vw, 2.25rem); font-weight: 800; line-height: 1.2; margin-bottom: 0.5rem; }
	.reader-header time { font-size: .8rem; color: var(--color-text-muted); }

	/* ─── Mode Switcher (Prose vs Manga) ─── */
	.mode-switcher {
		display: flex;
		justify-content: center;
		gap: 0.65rem;
		margin-bottom: 1.25rem;
	}
	.mode-switch-btn {
		padding: 0.6rem 1.25rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-100);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.mode-switch-btn.active {
		background: var(--color-brand-500);
		color: #fff;
		border-color: var(--color-brand-500);
		box-shadow: 0 4px 14px rgba(12, 113, 61, 0.3);
	}
	.mode-switch-btn.manga-tab.active {
		background: linear-gradient(135deg, #9333ea, #6366f1);
		border-color: #9333ea;
		box-shadow: 0 4px 14px rgba(147, 51, 234, 0.35);
	}

	/* ─── Sticky Toolbar Wrapper ─── */
	.toolbar-sticky-wrapper {
		position: sticky; top: 64px; z-index: 50;
		margin-bottom: 1rem;
	}
	/* ─── Reading Toolbar ─── */
	.reading-toolbar {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1rem;
		background: var(--color-surface-100); border-radius: 0.75rem;
		border: 1px solid rgba(255,255,255,.04); flex-wrap: wrap;
		backdrop-filter: blur(12px);
		box-shadow: 0 2px 8px rgba(0,0,0,.15);
	}
	.toolbar-group { display: flex; align-items: center; gap: 0.375rem; }
	.tool-btn {
		width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
		border: 1px solid rgba(255,255,255,.08); border-radius: 0.375rem; background: var(--color-surface-200); cursor: pointer;
		font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); transition: all 0.2s;
	}
	.tool-btn:hover { border-color: var(--color-brand-500); color: var(--color-brand-400); }
	.tool-btn.active { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.font-size-label { font-size: 0.6875rem; color: var(--color-text-muted); min-width: 32px; text-align: center; }

	/* Font Select */
	.font-select {
		padding: 0.375rem 0.5rem; border: 1px solid rgba(255,255,255,.08); border-radius: 0.375rem;
		background: var(--color-surface-200); font-size: 0.75rem; color: var(--color-text-secondary); cursor: pointer;
		outline: none; transition: border-color 0.2s; font-family: inherit;
	}
	.font-select:focus { border-color: var(--color-brand-500); }

	/* Theme Buttons */
	.theme-btn {
		width: 28px; height: 28px; border-radius: 0.375rem; border: 2px solid rgba(255,255,255,.08);
		cursor: pointer; transition: all 0.2s; font-size: 0.625rem; font-weight: 700;
		display: flex; align-items: center; justify-content: center;
	}
	.theme-btn.active { border-color: var(--color-brand-500); transform: scale(1.15); box-shadow: 0 0 0 2px rgba(12,113,61,0.3); }

	/* Speed Picker */
	.auto-scroll-group { position: relative; }
	.speed-picker { display: flex; gap: 0.25rem; margin-left: 0.25rem; animation: fadeIn 0.2s ease; }
	.speed-btn {
		padding: 0.25rem 0.5rem; border: 1px solid rgba(255,255,255,.08); border-radius: 0.25rem;
		background: var(--color-surface-200); font-size: 0.6875rem; font-weight: 600; color: var(--color-text-muted);
		cursor: pointer; transition: all 0.15s;
	}
	.speed-btn.active { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	@keyframes fadeIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }

	/* Extended Settings */
	.reader-settings {
		margin: 0; padding: 0.75rem 1rem; margin-top: 0.5rem;
		display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;
	}
	.reader-settings label {
		display: flex; align-items: center; gap: 0.4rem;
		font-size: .76rem; color: var(--color-text-muted); flex: 1; min-width: 170px;
	}
	.reader-settings input[type="range"] { flex: 1; accent-color: var(--color-brand-500); }
	.val { font-size: .72rem; font-weight: 600; min-width: 38px; text-align: right; }

	/* Top nav */
	.chapter-nav-top {
		display: flex; justify-content: space-between; margin-bottom: 1.5rem;
	}
	.nav-btn {
		padding: 0.5rem 1rem; border-radius: 0.5rem; text-decoration: none;
		font-size: .8rem; font-weight: 600; transition: all 0.2s;
	}
	.nav-btn.prev { color: var(--color-text-secondary); border: 1px solid rgba(255,255,255,.06); }
	.nav-btn.prev:hover { border-color: var(--color-brand-500); color: var(--color-brand-400); }
	.nav-btn.next {
		background: linear-gradient(135deg, var(--color-brand-500), rgba(12,113,61,.8));
		color: #fff; border: none;
	}
	.nav-btn.next:hover:not(.disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(12,113,61,.25); }
	.nav-btn.disabled, .btn-ghost.disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }

	/* Reader Content */
	.reader-content {
		font-family: var(--font-serif); color: var(--color-text-primary);
		transition: all 0.3s ease;
	}
	.reader-content :global(p) { margin-bottom: 1.2em; text-align: justify; text-indent: 2em; }
	.reader-content :global(h2), .reader-content :global(h3) {
		margin: 2em 0 0.75em; font-family: var(--font-sans); font-weight: 700;
	}
	.reader-content :global(blockquote) {
		border-left: 3px solid var(--color-brand-500);
		padding-left: 1em; margin: 1.5em 0;
		color: var(--color-text-secondary); font-style: italic;
	}

	.author-note { padding: 1.25rem; margin: 2rem 0 1.25rem; }
	.author-note h4 { font-size: .9rem; margin-bottom: .5rem; color: var(--color-text-primary); }
	.author-note p { font-size: .88rem; color: var(--color-text-muted); line-height: 1.6; }

	/* ─── Chapter Lore Tags & Linked Chapters ─── */
	.chapter-lore-section,
	.chapter-links-section {
		padding: 1.25rem;
		margin: 1.5rem 0;
	}
	.lore-sec-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.9rem;
	}
	.lore-sec-header h4,
	.chapter-links-section h4 {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
	}
	.chapter-links-section h4 {
		margin-bottom: 0.75rem;
	}
	.lore-all-link {
		font-size: 0.78rem;
		color: var(--color-brand-400);
		text-decoration: none;
		font-weight: 600;
	}
	.lore-tags-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.65rem;
	}
	.lore-tag-card {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.65rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-align: left;
		cursor: pointer;
		transition: all 0.15s;
		color: inherit;
	}
	.lore-tag-card:hover {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.08);
		transform: translateY(-1px);
	}
	.lore-tag-avatar {
		width: 42px;
		height: 42px;
		border-radius: 0.5rem;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-200);
	}
	.lore-tag-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.15rem;
	}
	.lore-tag-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.lore-tag-cat {
		font-size: 0.66rem;
		color: var(--color-brand-400);
		font-weight: 700;
		text-transform: uppercase;
	}
	.lore-tag-name {
		font-size: 0.85rem;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lore-tag-role {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.linked-ch-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.linked-ch-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.8rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-decoration: none;
		font-size: 0.82rem;
		color: var(--color-text-primary);
		transition: all 0.15s;
	}
	.linked-ch-chip:hover {
		border-color: var(--color-brand-500);
		color: var(--color-brand-400);
	}
	.lc-num {
		font-weight: 700;
		color: var(--color-brand-400);
	}
	.lc-note {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* ─── Quick Lore Modal ─── */
	.lore-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
	}
	.lore-modal {
		position: relative;
		max-width: 540px;
		width: 100%;
		padding: 1.5rem;
	}
	.lore-modal-close {
		position: absolute;
		top: 0.85rem;
		right: 0.85rem;
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.lore-modal-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lore-modal-img {
		width: 100%;
		max-height: 260px;
		object-fit: cover;
		border-radius: 0.65rem;
	}
	.lore-modal-info h3 {
		margin: 0.25rem 0;
		font-size: 1.25rem;
	}
	.lore-modal-role {
		font-size: 0.82rem;
		color: var(--color-brand-400);
		margin: 0 0 0.5rem;
	}
	.lore-modal-aliases {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0 0 0.5rem;
	}
	.lore-modal-desc {
		font-size: 0.88rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		white-space: pre-line;
		margin: 0 0 1rem;
	}
	.lore-modal-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.lore-modal-actions a {
		text-decoration: none;
	}

	.chapter-nav {
		display: flex; justify-content: space-between; align-items: center;
		margin-top: 3rem; padding-top: 2rem;
		border-top: 1px solid rgba(255,255,255,.06);
	}
	.chapter-nav a { text-decoration: none; }
	.end-note { font-size: .82rem; color: var(--color-text-muted); font-style: italic; }

	.scroll-indicator {
		position: fixed; bottom: 1.5rem; right: 1.5rem;
		background: var(--color-surface-200); color: var(--color-text-muted);
		font-size: .7rem; font-weight: 700; padding: 0.3rem 0.5rem;
		border-radius: var(--radius-sm); opacity: 0.7;
	}

	@media (max-width: 600px) {
		.reading-toolbar { gap: 0.5rem; padding: 0.5rem; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; }
		.reading-toolbar::-webkit-scrollbar { display: none; }
		.theme-btn { width: 24px; height: 24px; font-size: 0.5rem; }
		.tool-btn { width: 28px; height: 28px; font-size: 0.65rem; }
		.font-select { font-size: 0.65rem; padding: 0.25rem 0.375rem; }
		.reader-settings { flex-direction: column; gap: 0.5rem; }
		.chapter-nav { flex-direction: column; gap: 0.75rem; }
		.chapter-nav-top { flex-direction: column; gap: 0.5rem; align-items: stretch; text-align: center; }
	}
</style>
