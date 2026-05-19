<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';

	let chapter = $state<any>(null);
	let prevCh = $state<number | null>(null);
	let nextCh = $state<number | null>(null);
	let loading = $state(true);
	let error = $state('');
	let scrollProgress = $state(0);

	// Reader settings (persisted in localStorage)
	let fontSize = $state(18);
	let lineHeight = $state(1.8);
	let maxWidth = $state(720);
	let fontFamily = $state('Inter');
	let theme = $state('default');
	let showSettings = $state(false);

	// Auto-scroll
	let autoScrolling = $state(false);
	let autoScrollSpeed = $state(2);
	let showSpeedPicker = $state(false);
	let autoScrollTimer: ReturnType<typeof setInterval> | null = null;

	const fontOptions = [
		{ value: 'Inter', label: 'Inter (Sans)' },
		{ value: 'Georgia, serif', label: 'Georgia (Serif)' },
		{ value: 'Merriweather, serif', label: 'Merriweather' },
		{ value: 'Lora, serif', label: 'Lora' },
		{ value: '"Roboto Mono", monospace', label: 'Roboto Mono' },
		{ value: '"Cinzel Decorative", serif', label: 'Cinzel Decorative' },
		{ value: '"Uncial Antiqua", cursive', label: 'Uncial Antiqua' },
		{ value: '"Metamorphous", serif', label: 'Metamorphous' },
		{ value: '"IM Fell English", serif', label: 'IM Fell English' }
	];

	let themes = $derived([
		{ id: 'default', name: m.reader_theme_default(), bg: 'transparent', color: 'inherit', preview: '#1e293b', previewText: '#c8d6e5' },
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
				fontFamily = s.fontFamily || 'Inter';
				theme = s.theme || 'default';
				autoScrollSpeed = s.autoScrollSpeed || 2;
			} catch {}
		}

		loadChapter();
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', handleScroll);
			stopAutoScroll();
		};
	});

	async function loadChapter() {
		loading = true;
		error = '';
		try {
			const num = page.params.number;
			const res = await api<any>(`/chapters/${num}`);
			chapter = res.data.chapter;
			prevCh = res.data.prev_chapter;
			nextCh = res.data.next_chapter;
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
		<article class="reader" style:max-width="{maxWidth}px">
			<header class="reader-header">
				<a href="/stories" class="back-link">{m.reader_back_list()}</a>
				<span class="ch-num">Chapter {chapter.chapter_number}</span>
				<h1>{chapter.title}</h1>
				<time>{new Date(chapter.created_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
			</header>

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

			<div class="reader-content" style:font-size="{fontSize}px" style:line-height="{lineHeight}" style:font-family="{fontFamily}" style="{getThemeStyle()}">
				{#if chapter.content_html}
					{@html chapter.content_html}
				{:else if chapter.content}
					{#each chapter.content.split('\n') as para}
						{#if para.trim()}<p>{para}</p>{/if}
					{/each}
				{:else}
					<p class="no-content">{m.reader_no_content()}</p>
				{/if}
			</div>

			{#if chapter.author_note}
				<div class="author-note glass-card">
					<h4>{m.reader_author_note()}</h4>
					<p>{chapter.author_note}</p>
				</div>
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
	.reader-header { margin-bottom: 2rem; text-align: center; }
	.back-link { font-size: .82rem; color: var(--color-text-muted); text-decoration: none; transition: color .2s; }
	.back-link:hover { color: var(--color-brand-400); }
	.ch-num {
		display: block; font-size: .75rem; font-weight: 700;
		color: var(--color-brand-400); text-transform: uppercase;
		letter-spacing: .1em; margin: 1.5rem 0 .5rem;
	}
	.reader-header h1 { font-size: clamp(1.5rem, 4vw, 2.25rem); font-weight: 800; line-height: 1.2; margin-bottom: 0.5rem; }
	.reader-header time { font-size: .8rem; color: var(--color-text-muted); }

	/* ─── Reading Toolbar ─── */
	.reading-toolbar {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1rem;
		background: var(--color-surface-100); border-radius: 0.75rem; margin-bottom: 1rem;
		border: 1px solid rgba(255,255,255,.04); flex-wrap: wrap;
		backdrop-filter: blur(12px);
		position: sticky; top: 0; z-index: 100;
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
		margin: 0 auto 2rem; padding: 0.75rem 1rem;
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
	.reader-content :global(img) { max-width: 100%; border-radius: var(--radius-md); margin: 1.5em auto; display: block; }
	.reader-content :global(figure) { margin: 2rem 0; text-align: center; }
	.reader-content :global(figure img) { max-width: 100%; height: auto; border-radius: 0.75rem; }
	.reader-content :global(figcaption) { font-size: 0.85em; color: var(--color-text-muted); margin-top: 0.5rem; font-style: italic; }
	.reader-content :global(blockquote) {
		border-left: 3px solid var(--color-brand-500);
		padding-left: 1em; margin: 1.5em 0;
		color: var(--color-text-secondary); font-style: italic;
	}
	.no-content { color: var(--color-text-muted); font-style: italic; text-align: center !important; text-indent: 0 !important; }

	.author-note { padding: 1.25rem; margin: 2.5rem 0; }
	.author-note h4 { font-size: .9rem; margin-bottom: .5rem; color: var(--color-text-primary); }
	.author-note p { font-size: .88rem; color: var(--color-text-muted); line-height: 1.6; }

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
		.reading-toolbar { gap: 0.5rem; padding: 0.5rem; }
		.reader-settings { flex-direction: column; gap: 0.5rem; }
		.chapter-nav { flex-direction: column; gap: 0.75rem; }
		.chapter-nav-top { flex-direction: column; gap: 0.5rem; align-items: stretch; text-align: center; }
	}

	/* Image layout styles */
	.reader-content :global(.layout-single-1-1 .image-container img) { max-width: 400px; aspect-ratio: 1; object-fit: cover; }
	.reader-content :global(.layout-single-16-9 .image-container img) { max-width: 100%; aspect-ratio: 16/9; object-fit: cover; }
	.reader-content :global(.layout-single-9-16 .image-container img) { max-width: 320px; aspect-ratio: 9/16; object-fit: cover; }
	.reader-content :global(.layout-combo-2 .image-container) { display: flex; gap: 0.75rem; justify-content: center; }
	.reader-content :global(.layout-combo-2 .image-container img) { width: 48%; object-fit: cover; border-radius: 0.75rem; }
	.reader-content :global(.layout-combo-2-overlap .image-container) { display: flex; justify-content: center; position: relative; }
	.reader-content :global(.layout-combo-2-overlap .image-container img:first-child) { width: 55%; z-index: 1; position: relative; }
	.reader-content :global(.layout-combo-2-overlap .image-container img:nth-child(2)) { width: 55%; margin-left: -15%; margin-top: 8%; z-index: 2; position: relative; }
	.reader-content :global(.layout-combo-3 .image-container) { display: flex; gap: 0.5rem; justify-content: center; }
	.reader-content :global(.layout-combo-3 .image-container img) { width: 32%; object-fit: cover; border-radius: 0.75rem; }

	@media (max-width: 768px) {
		.reader-content :global(.layout-combo-2 .image-container),
		.reader-content :global(.layout-combo-3 .image-container) { flex-direction: column; align-items: center; }
		.reader-content :global(.layout-combo-2 .image-container img),
		.reader-content :global(.layout-combo-3 .image-container img) { width: 100%; max-width: 400px; }
		.reader-content :global(.layout-combo-2-overlap .image-container) { flex-direction: column; align-items: center; }
		.reader-content :global(.layout-combo-2-overlap .image-container img) { width: 85%; margin-left: 0; margin-top: -10%; }
		.reader-content :global(.layout-combo-2-overlap .image-container img:first-child) { margin-top: 0; }
	}
</style>
