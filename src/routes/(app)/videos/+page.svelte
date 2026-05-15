<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	let videos = $state<any[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			const res = await api<any>('/videos');
			videos = res.data || [];
		} catch { videos = []; }
		loading = false;
	});
</script>

<svelte:head>
	<title>Video — Selorson</title>
	<meta name="description" content="Xem các video animation từ Selorson" />
</svelte:head>

<section class="videos-page">
	<div class="page-header">
		<h1 class="section-title">Video</h1>
		<p class="page-subtitle">Animation và nội dung đa phương tiện</p>
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
			<h3>Chưa có video nào</h3>
			<p>Nội dung sẽ sớm được cập nhật</p>
		</div>
	{:else}
		<div class="video-grid">
			{#each videos as video}
				<div class="glass-card video-card">
					<div class="video-thumb">
						{#if video.thumbnail_path}
							<img src={video.thumbnail_path} alt={video.video_name} />
						{:else}
							<div class="thumb-placeholder">▶</div>
						{/if}
						{#if video.is_featured}
							<span class="featured-badge">⭐ Nổi bật</span>
						{/if}
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

<style>
	.videos-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 3rem 1.5rem 6rem;
	}

	.page-header { text-align: center; margin-bottom: 3rem; }
	.page-subtitle { color: var(--color-text-muted); margin-top: 0.5rem; }

	.video-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.25rem;
	}

	.video-card { padding: 0; overflow: hidden; }

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
</style>
