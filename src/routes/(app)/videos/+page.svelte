<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';

	let videos = $state<any[]>([]);
	let loading = $state(true);
	let selectedVideo = $state<any>(null);
	let vidstackReady = $state(false);

	onMount(async () => {
		if (browser) {
			await import('vidstack/player');
			await import('vidstack/player/layouts/default');
			await import('vidstack/player/ui');
			vidstackReady = true;
		}

		try {
			const res = await api<any>('/videos');
			videos = res.data || [];
		} catch { videos = []; }
		loading = false;
	});

	function openVideo(video: any) {
		selectedVideo = video;
	}

	function closeVideo() {
		selectedVideo = null;
	}
</script>

<svelte:head>
	<title>{m.videos_seo_title()}</title>
	<meta name="description" content={m.videos_seo_desc()} />
	{#if vidstackReady}
		<link rel="stylesheet" href="https://cdn.vidstack.io/player/theme.css" />
		<link rel="stylesheet" href="https://cdn.vidstack.io/player/video.css" />
	{/if}
</svelte:head>

<section class="videos-page">
	<div class="page-header">
		<h1 class="section-title">{m.videos_list_title()}</h1>
		<p class="page-subtitle">{m.videos_list_subtitle()}</p>
	</div>

	{#if loading}
		<div class="video-grid">
			{#each Array(4) as _}
				<div class="skeleton-video"></div>
			{/each}
		</div>
	{:else if videos.length === 0}
		<div class="empty-state">
			<span class="empty-icon">🎬</span>
			<h3>{m.videos_empty_title()}</h3>
			<p>{m.videos_empty_desc()}</p>
		</div>
	{:else}
		<div class="video-grid">
			{#each videos as video}
				<div class="glass-card video-card" onclick={() => openVideo(video)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') openVideo(video); }}>
					<div class="video-thumb">
						{#if video.thumbnail_path}
							<img src={video.thumbnail_path} alt={video.video_name} />
						{:else}
							<div class="thumb-placeholder">▶</div>
						{/if}
						{#if video.is_featured}
							<span class="featured-badge">{m.videos_featured()}</span>
						{/if}
						<div class="play-overlay">
							<span class="play-circle">▶</span>
						</div>
					</div>
					<div class="video-info">
						<h3>{video.video_name}</h3>
						{#if video.description}
							<p class="video-desc">{video.description}</p>
						{/if}
						<div class="video-meta">
							<span class="video-type">{video.video_type}</span>
							{#if video.episode_number}
								<span>Ep. {video.episode_number}</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Video Player Modal -->
{#if selectedVideo && vidstackReady}
	<div class="video-modal-overlay" onmousedown={closeVideo}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="video-modal" onmousedown={(e) => e.stopPropagation()}>
			<div class="video-modal-header">
				<h2>{selectedVideo.video_name}</h2>
				<button class="modal-close" onclick={closeVideo} aria-label="Close">✕</button>
			</div>
			<div class="video-container">
				{#if selectedVideo.youtube_id}
					<iframe
						src="https://www.youtube.com/embed/{selectedVideo.youtube_id}?autoplay=1"
						title={selectedVideo.video_name}
						frameborder="0"
						allow="autoplay; fullscreen; picture-in-picture"
						allowfullscreen
						class="video-iframe"
					></iframe>
				{:else if selectedVideo.video_url}
					<media-player
						title={selectedVideo.video_name}
						src={selectedVideo.video_url}
						autoPlay
						crossOrigin="anonymous"
						class="vidstack-player"
					>
						<media-provider></media-provider>
						<media-video-layout></media-video-layout>
					</media-player>
				{:else}
					<div class="no-video-msg">
						<span>📹</span>
						<p>{m.videos_empty_desc()}</p>
					</div>
				{/if}
			</div>
			{#if selectedVideo.description}
				<p class="video-modal-desc">{selectedVideo.description}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.videos-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 3rem 1.5rem 6rem;
	}



	.video-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.25rem;
	}

	.video-card { padding: 0; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
	.video-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.3); }

	.video-thumb {
		position: relative;
		aspect-ratio: 16 / 9;
		background: var(--color-surface-200);
		overflow: hidden;
	}

	.video-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s var(--ease-spring);
	}

	.video-card:hover .video-thumb img { transform: scale(1.05); }

	.play-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0,0,0,.3);
		opacity: 0;
		transition: opacity .2s;
	}
	.video-card:hover .play-overlay { opacity: 1; }
	.play-circle {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: rgba(255,255,255,.9);
		color: #0f172a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		box-shadow: 0 4px 16px rgba(0,0,0,.3);
		transition: transform .15s;
	}
	.video-card:hover .play-circle { transform: scale(1.1); }

	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		color: var(--color-text-muted);
		background: linear-gradient(135deg, var(--color-surface-200), var(--color-surface-300));
	}

	.featured-badge {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		background: rgba(240, 192, 64, 0.2);
		border: 1px solid rgba(240, 192, 64, 0.4);
		color: var(--color-accent-gold);
		border-radius: 4px;
		backdrop-filter: blur(8px);
	}

	.video-info { padding: 1.25rem; }
	.video-info h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.35rem; }
	.video-desc {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.video-meta {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.video-type {
		padding: 0.15rem 0.4rem;
		background: rgba(12, 113, 61, 0.15);
		color: var(--color-brand-400);
		border-radius: 3px;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.03em;
	}

	.skeleton-video {
		aspect-ratio: 16 / 10;
		background: linear-gradient(90deg, var(--color-surface-200) 25%, var(--color-surface-300) 50%, var(--color-surface-200) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: var(--radius-lg);
	}

	.empty-state { text-align: center; padding: 4rem 1rem; color: var(--color-text-muted); }
	.empty-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
	.empty-state h3 { font-size: 1.2rem; color: var(--color-text-secondary); margin-bottom: 0.5rem; }

	/* Video Player Modal */
	.video-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,.85);
		backdrop-filter: blur(8px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		animation: fadeIn .2s ease;
	}
	@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

	.video-modal {
		width: 100%;
		max-width: 900px;
		background: var(--color-surface-100);
		border: 1px solid rgba(255,255,255,.08);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 32px 80px rgba(0,0,0,.6);
		animation: slideUp .25s ease;
	}
	@keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

	.video-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(255,255,255,.06);
	}
	.video-modal-header h2 { font-size: 1rem; font-weight: 600; }
	.modal-close {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: rgba(255,255,255,.06);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: .9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all .15s;
	}
	.modal-close:hover { background: rgba(255,255,255,.1); color: var(--color-text-primary); }

	.video-container {
		aspect-ratio: 16 / 9;
		background: #000;
		position: relative;
	}
	.video-iframe {
		width: 100%;
		height: 100%;
		border: none;
	}
	.video-container :global(media-player) {
		width: 100%;
		height: 100%;
	}
	.no-video-msg {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		gap: .5rem;
		font-size: 2rem;
	}
	.no-video-msg p { font-size: .9rem; }

	.video-modal-desc {
		padding: 1rem 1.25rem;
		font-size: .85rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		border-top: 1px solid rgba(255,255,255,.06);
	}
</style>
