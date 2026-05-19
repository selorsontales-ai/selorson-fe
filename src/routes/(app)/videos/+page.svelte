<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	interface Video {
		id: number;
		video_name: string;
		video_path: string;
		description?: string;
		episode_number?: number;
		video_type: 'main' | 'side' | 'filler';
		is_featured: boolean;
		thumbnail_path?: string;
		display_order: number;
	}

	let allVideos = $state<Video[]>([]);
	let loading = $state(true);
	let currentVideo = $state<Video | null>(null);
	let activeTab = $state<'main' | 'side' | 'filler'>('main');

	// Computed grouped videos
	let mainVideos = $derived(allVideos.filter(v => v.video_type === 'main').sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0)));
	let sideVideos = $derived(allVideos.filter(v => v.video_type === 'side').sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0)));
	let fillerVideos = $derived(allVideos.filter(v => v.video_type === 'filler').sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0)));

	function getTabVideos(tab: 'main' | 'side' | 'filler') {
		if (tab === 'main') return mainVideos;
		if (tab === 'side') return sideVideos;
		return fillerVideos;
	}

	const tabs = $derived([
		{ key: 'main' as const, icon: '📺', label: m.videos_tab_main() },
		{ key: 'side' as const, icon: '📘', label: m.videos_tab_side() },
		{ key: 'filler' as const, icon: '🎭', label: m.videos_tab_filler() },
	]);

	// Extract embed URL (handle raw YouTube URLs + already-embedded URLs)
	function getEmbedUrl(path: string): string {
		if (!path) return '';
		// Already an embed URL
		if (path.includes('/embed/')) return path;
		// YouTube watch / short / youtu.be
		const ytMatch = path.match(/(?:youtube\.com\/(?:watch\?v=|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
		if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
		// Vimeo
		const vimeoMatch = path.match(/vimeo\.com\/(\d+)/);
		if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
		return path;
	}

	// Extract thumbnail from YouTube embed URL
	function getThumbnail(video: Video): string {
		if (video.thumbnail_path) return video.thumbnail_path;
		const embedMatch = video.video_path?.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
		if (embedMatch) return `https://img.youtube.com/vi/${embedMatch[1]}/mqdefault.jpg`;
		const ytMatch = video.video_path?.match(/(?:youtube\.com\/(?:watch\?v=|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
		if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
		return '';
	}

	function typeLabel(type: string) {
		if (type === 'main') return m.videos_type_main();
		if (type === 'side') return m.videos_type_side();
		return m.videos_type_filler();
	}

	// Navigation
	let currentList = $derived(getTabVideos(currentVideo?.video_type ?? 'main'));
	let currentIndex = $derived(currentList.findIndex(v => v.id === currentVideo?.id));
	let prevEpisode = $derived(currentIndex > 0 ? currentList[currentIndex - 1] : null);
	let nextEpisode = $derived(currentIndex < currentList.length - 1 ? currentList[currentIndex + 1] : null);

	function selectVideo(video: Video) {
		currentVideo = video;
		activeTab = video.video_type;
		// Scroll to top smoothly
		if (typeof window !== 'undefined') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
		// Scroll playlist item into view
		requestAnimationFrame(() => {
			const el = document.querySelector('.playlist-item.active');
			el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	// Embed URL for current video
	let embedUrl = $derived(currentVideo ? getEmbedUrl(currentVideo.video_path) : '');

	onMount(async () => {
		try {
			const res = await api<any>('/videos');
			allVideos = res.data || [];
		} catch { allVideos = []; }
		loading = false;
	});
</script>

<svelte:head>
	<title>{m.videos_seo_title()}</title>
	<meta name="description" content={m.videos_seo_desc()} />
</svelte:head>

<div class="videos-page">
	<!-- Hero -->
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<h1>{m.videos_hero_title()}</h1>
			<p class="hero-tagline">{m.videos_hero_subtitle()}</p>
		</div>
	</section>

	<div class="theater-container">
		{#if loading}
			<div class="loading-state">
				<div class="pulse-loader"><span></span><span></span><span></span></div>
				<p>{m.videos_loading()}</p>
			</div>
		{:else if allVideos.length === 0}
			<div class="empty-state">
				<span class="empty-icon">🎬</span>
				<h3>{m.videos_empty_title()}</h3>
				<p>{m.videos_empty_desc()}</p>
			</div>
		{:else}
			<div class="theater-layout">
				<!-- Player Area -->
				<div class="player-area">
					{#if currentVideo}
						<!-- Video Player -->
						<div class="video-player-wrapper">
							{#if embedUrl}
								<iframe
									src="{embedUrl}?autoplay=1&rel=0"
									title={currentVideo.video_name}
									frameborder="0"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
									class="video-player"
								></iframe>
							{:else}
								<div class="video-error">
									<span class="error-icon">⚠️</span>
									<p>⚠ Error</p>
								</div>
							{/if}
						</div>

						<!-- Episode Controls -->
						<div class="episode-controls">
							<button class="ctrl-btn" disabled={!prevEpisode} onclick={() => prevEpisode && selectVideo(prevEpisode)}>
								{m.videos_prev()}
							</button>
							<div class="episode-info-bar">
								<span class="ep-badge {currentVideo.video_type}">
									{typeLabel(currentVideo.video_type)}
								</span>
								<h2 class="ep-title">
									{#if currentVideo.episode_number}
										<span class="ep-num">{m.videos_episode({ num: currentVideo.episode_number })}</span>
									{/if}
									{currentVideo.video_name}
								</h2>
							</div>
							<button class="ctrl-btn" disabled={!nextEpisode} onclick={() => nextEpisode && selectVideo(nextEpisode)}>
								{m.videos_next()}
							</button>
						</div>

						<!-- Description -->
						{#if currentVideo.description}
							<div class="video-desc-card">
								<p>{currentVideo.description}</p>
							</div>
						{/if}
					{:else}
						<!-- Placeholder -->
						<div class="player-placeholder">
							<span class="placeholder-icon">🎬</span>
							<p>{m.videos_placeholder()}</p>
						</div>
					{/if}
				</div>

				<!-- Sidebar Playlist -->
				<aside class="playlist-sidebar">
					<!-- Tabs -->
					<div class="tab-bar">
						{#each tabs as tab}
							<button
								class="tab-btn"
								class:active={activeTab === tab.key}
								onclick={() => activeTab = tab.key}
							>
								{tab.icon} {tab.label}
								<span class="tab-count">{getTabVideos(tab.key).length}</span>
							</button>
						{/each}
					</div>

					<!-- Playlist Items -->
					<div class="playlist-scroll">
						{#each getTabVideos(activeTab) as video (video.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="playlist-item"
								class:active={currentVideo?.id === video.id}
								onclick={() => selectVideo(video)}
								onkeydown={(e) => { if (e.key === 'Enter') selectVideo(video); }}
								role="button"
								tabindex="0"
							>
								<div class="item-thumb">
									{#if getThumbnail(video)}
										<img src={getThumbnail(video)} alt={video.video_name} loading="lazy" />
									{:else}
										<div class="thumb-fallback">▶</div>
									{/if}
									{#if currentVideo?.id === video.id}
										<span class="now-playing">▶</span>
									{/if}
								</div>
								<div class="item-info">
									{#if video.episode_number}
										<span class="item-ep">{m.videos_episode({ num: video.episode_number })}</span>
									{/if}
									<span class="item-name">{video.video_name}</span>
									{#if video.is_featured}
										<span class="item-featured">{m.videos_featured()}</span>
									{/if}
								</div>
							</div>
						{/each}

						{#if getTabVideos(activeTab).length === 0}
							<p class="empty-tab">{m.videos_empty_desc()}</p>
						{/if}
					</div>
				</aside>
			</div>
		{/if}
	</div>
</div>

<style>
	/* ===== Page ===== */
	.videos-page { min-height: 70vh; }
	.theater-container { max-width: 1400px; margin: 0 auto; padding: 0 1.5rem 4rem; }

	/* ===== Hero ===== */
	.page-hero {
		position: relative; text-align: center; padding: 3.5rem 2rem 2.5rem;
		background: linear-gradient(135deg, var(--color-brand-800) 0%, var(--color-brand-500) 50%, var(--color-brand-700) 100%);
		overflow: hidden; margin-bottom: 2rem;
	}
	.hero-content { position: relative; z-index: 1; }
	.page-hero h1 {
		font-size: 2.5rem; font-weight: 800; color: #fff; margin: 0 0 0.375rem;
		text-shadow: 0 2px 12px rgba(0,0,0,0.3);
	}
	.hero-tagline { color: rgba(255,255,255,0.8); font-size: 1.05rem; margin: 0; font-weight: 400; }
	.hero-glow {
		position: absolute; top: -50%; left: 50%; transform: translateX(-50%);
		width: 700px; height: 700px; border-radius: 50%;
		background: radial-gradient(circle, rgba(74,222,128,0.12) 0%, transparent 70%);
		pointer-events: none;
	}

	/* ===== Loading ===== */
	.loading-state { text-align: center; padding: 5rem; }
	.loading-state p { color: var(--color-text-muted); margin-top: 1.25rem; font-size: 0.95rem; }
	.pulse-loader { display: flex; gap: 0.5rem; justify-content: center; }
	.pulse-loader span {
		width: 12px; height: 12px; border-radius: 50%;
		background: var(--color-brand-500); animation: pb 1.2s infinite ease-in-out;
	}
	.pulse-loader span:nth-child(2) { animation-delay: 0.2s; }
	.pulse-loader span:nth-child(3) { animation-delay: 0.4s; }
	@keyframes pb {
		0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
		40% { transform: scale(1); opacity: 1; }
	}

	/* ===== Theater Layout ===== */
	.theater-layout {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.5rem;
		align-items: start;
	}

	/* ===== Player Area ===== */
	.player-area { display: flex; flex-direction: column; gap: 1rem; }

	.video-player-wrapper {
		position: relative; border-radius: var(--radius-xl); overflow: hidden;
		box-shadow: 0 12px 48px rgba(0,0,0,0.4);
		background: #000;
		border: 1px solid rgba(255,255,255,0.06);
	}
	.video-player {
		display: block; width: 100%; aspect-ratio: 16/9;
		background: #000; border: none;
	}
	.video-error {
		aspect-ratio: 16/9; display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		background: var(--color-surface-100); gap: 0.75rem;
	}
	.error-icon { font-size: 2.5rem; }
	.video-error p { color: var(--color-text-muted); margin: 0; font-size: 0.95rem; }

	/* Placeholder */
	.player-placeholder {
		aspect-ratio: 16/9; display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		background: var(--color-surface-100);
		border-radius: var(--radius-xl);
		border: 2px dashed rgba(12,113,61,0.2);
		transition: border-color 0.3s;
	}
	.player-placeholder:hover { border-color: rgba(12,113,61,0.4); }
	.placeholder-icon { font-size: 3.5rem; margin-bottom: 0.75rem; opacity: 0.6; }
	.player-placeholder p { color: var(--color-text-muted); font-size: 1rem; margin: 0; }

	/* ===== Episode Controls ===== */
	.episode-controls {
		display: flex; align-items: center; gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255,255,255,0.06);
		box-shadow: 0 2px 12px rgba(0,0,0,0.15);
	}
	.ctrl-btn {
		padding: 0.5rem 1.125rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700));
		color: #fff; border: none; border-radius: var(--radius-md);
		font-weight: 600; font-size: 0.8125rem;
		cursor: pointer; transition: all 0.2s var(--ease-spring); white-space: nowrap;
	}
	.ctrl-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(12,113,61,0.35);
		filter: brightness(1.1);
	}
	.ctrl-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	.episode-info-bar { flex: 1; min-width: 0; text-align: center; }
	.ep-badge {
		display: inline-block; padding: 0.2rem 0.625rem; border-radius: 1rem;
		font-size: 0.6875rem; font-weight: 700; margin-bottom: 0.25rem;
	}
	.ep-badge.main { background: rgba(12,113,61,0.12); color: var(--color-brand-400); }
	.ep-badge.side { background: rgba(99,102,241,0.12); color: #818cf8; }
	.ep-badge.filler { background: rgba(245,158,11,0.12); color: #fbbf24; }

	.ep-title {
		font-size: 1rem; font-weight: 700; color: var(--color-text-primary);
		margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.ep-num { color: var(--color-brand-400); font-weight: 800; margin-right: 0.375rem; }

	/* ===== Description ===== */
	.video-desc-card {
		padding: 1.25rem 1.5rem;
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255,255,255,0.06);
	}
	.video-desc-card p {
		color: var(--color-text-secondary); line-height: 1.7; margin: 0; font-size: 0.9rem;
	}

	/* ===== Sidebar ===== */
	.playlist-sidebar {
		background: var(--color-surface-100);
		border-radius: var(--radius-xl); overflow: hidden;
		border: 1px solid rgba(255,255,255,0.06);
		box-shadow: 0 4px 24px rgba(0,0,0,0.2);
		position: sticky; top: 5rem;
		max-height: calc(100vh - 6rem);
		display: flex; flex-direction: column;
	}

	/* Tabs */
	.tab-bar {
		display: flex;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		background: var(--color-surface-50);
	}
	.tab-btn {
		flex: 1; padding: 0.875rem 0.5rem;
		background: none; border: none;
		border-bottom: 2px solid transparent;
		font-size: 0.75rem; font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer; transition: all 0.2s;
		display: flex; align-items: center; justify-content: center; gap: 0.3rem;
	}
	.tab-btn:hover { color: var(--color-brand-400); }
	.tab-btn.active {
		color: var(--color-brand-400);
		border-bottom-color: var(--color-brand-500);
		background: rgba(12,113,61,0.04);
	}
	.tab-count {
		font-size: 0.625rem; background: rgba(255,255,255,0.06);
		padding: 0.1rem 0.4rem; border-radius: 0.75rem; font-weight: 700;
	}

	/* Playlist Items */
	.playlist-scroll {
		overflow-y: auto; flex: 1; padding: 0.5rem;
	}
	.playlist-scroll::-webkit-scrollbar { width: 4px; }
	.playlist-scroll::-webkit-scrollbar-thumb { background: var(--color-brand-500); border-radius: 4px; }

	.playlist-item {
		display: flex; gap: 0.75rem; padding: 0.625rem;
		border-radius: var(--radius-md); cursor: pointer;
		transition: all 0.2s var(--ease-spring);
		border: 2px solid transparent; margin-bottom: 0.25rem;
	}
	.playlist-item:hover {
		background: rgba(12,113,61,0.06);
		border-color: rgba(12,113,61,0.1);
	}
	.playlist-item.active {
		background: linear-gradient(135deg, rgba(12,113,61,0.1), rgba(12,113,61,0.05));
		border-color: rgba(12,113,61,0.25);
		box-shadow: 0 0 12px rgba(12,113,61,0.08);
	}

	.item-thumb {
		width: 100px; height: 56px;
		border-radius: var(--radius-sm); overflow: hidden;
		flex-shrink: 0; position: relative;
		background: var(--color-surface-200);
	}
	.item-thumb img {
		width: 100%; height: 100%; object-fit: cover;
		transition: transform 0.3s;
	}
	.playlist-item:hover .item-thumb img { transform: scale(1.05); }

	.thumb-fallback {
		width: 100%; height: 100%;
		display: flex; align-items: center; justify-content: center;
		font-size: 1.25rem; color: var(--color-text-muted);
		background: linear-gradient(135deg, var(--color-surface-200), var(--color-surface-300));
	}
	.now-playing {
		position: absolute; inset: 0;
		display: flex; align-items: center; justify-content: center;
		background: rgba(12,113,61,0.75); color: #fff; font-size: 1rem;
		animation: pulse-np 1.5s infinite;
	}
	@keyframes pulse-np { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

	.item-info {
		flex: 1; min-width: 0;
		display: flex; flex-direction: column;
		justify-content: center; gap: 0.125rem;
	}
	.item-ep {
		font-size: 0.625rem; font-weight: 700;
		color: var(--color-brand-400);
		text-transform: uppercase; letter-spacing: 0.3px;
	}
	.item-name {
		font-size: 0.8125rem; font-weight: 600;
		color: var(--color-text-primary);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.item-featured {
		font-size: 0.6rem; color: var(--color-accent-gold);
		font-weight: 600;
	}

	.empty-tab {
		text-align: center; color: var(--color-text-muted);
		font-size: 0.85rem; padding: 2.5rem 1rem;
	}

	/* ===== Empty State ===== */
	.empty-state { text-align: center; padding: 5rem 2rem; }
	.empty-icon { font-size: 3.5rem; display: block; margin-bottom: 1.25rem; }
	.empty-state h3 {
		font-size: 1.25rem; color: var(--color-text-secondary);
		margin: 0 0 0.5rem; font-weight: 700;
	}
	.empty-state p { color: var(--color-text-muted); margin: 0; }

	/* ===== Responsive ===== */
	@media (max-width: 1024px) {
		.theater-layout { grid-template-columns: 1fr; }
		.playlist-sidebar { position: static; max-height: 500px; }
	}
	@media (max-width: 640px) {
		.episode-controls { flex-direction: column; gap: 0.5rem; }
		.ctrl-btn { width: 100%; text-align: center; }
		.page-hero { padding: 2.5rem 1rem 2rem; }
		.page-hero h1 { font-size: 1.75rem; }
		.item-thumb { width: 80px; height: 45px; }
	}
</style>
