<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import { pauseForExternalMedia, formatAudioTime } from '$lib/stores/audio.svelte';
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';
	import {
		isDirectVideoSource,
		buildSafeEmbedUrl,
		resolveVideoThumbnail,
		pickInitialVideo,
		type VideoItem,
		type VideoProgressEntry
	} from '$lib/video/video-utils';
	import * as m from '$lib/paraglide/messages';
	
	const LOCAL_VIDEO_PROGRESS_KEY = 'selorson_video_progress_v1';

	let allVideos = $state<VideoItem[]>([]);
	let loading = $state(true);
	let currentVideo = $state<VideoItem | null>(null);
	let activeTab = $state<'main' | 'side' | 'filler'>('main');
	let searchQuery = $state('');
	let statusFilter = $state<'all' | 'unwatched' | 'watched'>('all');
	let cinemaMode = $state(false);
	let autoNext = $state(true);

	let progressMap = $state<Record<number, VideoProgressEntry>>({});
	let nativeVideoEl = $state<HTMLVideoElement | null>(null);
	let lastSavedPosition = 0;

	// Computed grouped videos
	let mainVideos = $derived(
		allVideos
			.filter((v) => v.video_type === 'main')
			.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0))
	);
	let sideVideos = $derived(
		allVideos
			.filter((v) => v.video_type === 'side')
			.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0))
	);
	let fillerVideos = $derived(
		allVideos
			.filter((v) => v.video_type === 'filler')
			.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0))
	);

	function getTabVideos(tab: 'main' | 'side' | 'filler') {
		if (tab === 'main') return mainVideos;
		if (tab === 'side') return sideVideos;
		return fillerVideos;
	}

	let filteredPlaylist = $derived.by(() => {
		const base = getTabVideos(activeTab);
		const q = searchQuery.trim().toLowerCase();
		return base.filter((v) => {
			if (q) {
				const epStr = v.episode_number != null ? `${v.episode_number}` : '';
				const matchesText =
					v.video_name.toLowerCase().includes(q) ||
					(v.description || '').toLowerCase().includes(q) ||
					epStr.includes(q);
				if (!matchesText) return false;
			}
			const isWatched = Boolean(progressMap[v.id]?.completed);
			if (statusFilter === 'watched' && !isWatched) return false;
			if (statusFilter === 'unwatched' && isWatched) return false;
			return true;
		});
	});

	const tabs = $derived([
		{ key: 'main' as const, icon: '📺', label: m.videos_tab_main() },
		{ key: 'side' as const, icon: '📘', label: m.videos_tab_side() },
		{ key: 'filler' as const, icon: '🎭', label: m.videos_tab_filler() }
	]);

	function typeLabel(type: string) {
		if (type === 'main') return m.videos_type_main();
		if (type === 'side') return m.videos_type_side();
		return m.videos_type_filler();
	}

	// Navigation
	let currentList = $derived(getTabVideos(currentVideo?.video_type ?? 'main'));
	let currentIndex = $derived(currentList.findIndex((v) => v.id === currentVideo?.id));
	let prevEpisode = $derived(currentIndex > 0 ? currentList[currentIndex - 1] : null);
	let nextEpisode = $derived(
		currentIndex >= 0 && currentIndex < currentList.length - 1
			? currentList[currentIndex + 1]
			: null
	);

	let isCurrentDirectVideo = $derived(
		currentVideo ? isDirectVideoSource(currentVideo.video_path) : false
	);
	let embedUrl = $derived(
		currentVideo && !isCurrentDirectVideo ? buildSafeEmbedUrl(currentVideo.video_path, true) : ''
	);
	let currentProgress = $derived(
		currentVideo ? progressMap[currentVideo.id] || { completed: false, last_position: 0 } : null
	);

	function loadLocalProgress(): Record<number, VideoProgressEntry> {
		if (typeof localStorage === 'undefined') return {};
		try {
			const raw = localStorage.getItem(LOCAL_VIDEO_PROGRESS_KEY);
			if (raw) return JSON.parse(raw) || {};
		} catch {}
		return {};
	}

	function saveLocalProgress(map: Record<number, VideoProgressEntry>) {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(LOCAL_VIDEO_PROGRESS_KEY, JSON.stringify(map));
		} catch {}
	}

	async function recordVideoProgress(
		videoId: number,
		completed?: boolean,
		lastPosition?: number
	) {
		const existing = progressMap[videoId] || { completed: false, last_position: 0 };
		const nextEntry: VideoProgressEntry = {
			completed: completed !== undefined ? completed : existing.completed,
			last_position:
				lastPosition !== undefined && lastPosition > 0
					? Math.floor(lastPosition)
					: existing.last_position,
			updated_at: new Date().toISOString()
		};
		progressMap = {
			...progressMap,
			[videoId]: nextEntry
		};
		saveLocalProgress(progressMap);

		if (isAuthenticated()) {
			try {
				await api(`/videos/${videoId}/progress`, {
					method: 'POST',
					body: {
						completed,
						position: lastPosition,
						last_position: lastPosition
					}
				});
			} catch {}
		}
	}

	function toggleWatchedStatus(video: VideoItem) {
		const currentlyDone = Boolean(progressMap[video.id]?.completed);
		void recordVideoProgress(video.id, !currentlyDone, undefined);
	}

	function selectVideo(video: VideoItem, updateUrl = true) {
		currentVideo = video;
		activeTab = video.video_type;
		lastSavedPosition = 0;

		// Auto-pause background OST so audio doesn't clash with the video
		pauseForExternalMedia();

		if (updateUrl && typeof window !== 'undefined') {
			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.set('ep', String(video.id));
			try {
				replaceState(nextUrl, {});
			} catch {}
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}

		requestAnimationFrame(() => {
			const el = document.querySelector('.playlist-item.active');
			el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	function handleNativeVideoLoadedMetadata(e: Event) {
		const el = e.currentTarget as HTMLVideoElement;
		if (!currentVideo || !el) return;
		const savedPos = progressMap[currentVideo.id]?.last_position || 0;
		if (savedPos > 3 && (!el.duration || savedPos < el.duration - 5)) {
			el.currentTime = savedPos;
		}
	}

	function handleNativeVideoTimeUpdate(e: Event) {
		const el = e.currentTarget as HTMLVideoElement;
		if (!currentVideo || !el) return;
		const cur = Math.floor(el.currentTime || 0);
		const dur = Math.floor(el.duration || 0);

		const reachedEnd = dur > 0 && cur / dur >= 0.9;
		if (Math.abs(cur - lastSavedPosition) >= 5 || (reachedEnd && !progressMap[currentVideo.id]?.completed)) {
			lastSavedPosition = cur;
			void recordVideoProgress(
				currentVideo.id,
				reachedEnd ? true : undefined,
				cur
			);
		}
	}

	function handleNativeVideoEnded() {
		if (!currentVideo) return;
		void recordVideoProgress(currentVideo.id, true, undefined);
		if (autoNext && nextEpisode) {
			selectVideo(nextEpisode, true);
		}
	}

	onMount(async () => {
		const mergedProgress: Record<number, VideoProgressEntry> = loadLocalProgress();

		try {
			const res = await api<any>('/videos');
			allVideos = res.data || [];
			for (const v of allVideos) {
				if (v.completed || (v.last_position && v.last_position > 0)) {
					mergedProgress[v.id] = {
						completed: Boolean(v.completed || mergedProgress[v.id]?.completed),
						last_position: Math.max(v.last_position || 0, mergedProgress[v.id]?.last_position || 0)
					};
				}
			}
		} catch {
			allVideos = [];
		}

		if (isAuthenticated()) {
			try {
				const pRes = await api<any>('/videos/progress');
				const list = Array.isArray(pRes?.data) ? pRes.data : [];
				for (const item of list) {
					if (item?.video_id) {
						mergedProgress[item.video_id] = {
							completed: Boolean(item.completed),
							last_position: Number(item.last_position || 0),
							updated_at: item.updated_at
						};
					}
				}
			} catch {}
		}

		progressMap = mergedProgress;
		saveLocalProgress(progressMap);
		loading = false;

		if (allVideos.length > 0) {
			const epParam = Number($page.url.searchParams.get('ep') || 0);
			const initial = pickInitialVideo(allVideos, epParam, progressMap);
			if (initial) {
				currentVideo = initial;
				activeTab = initial.video_type;
				if (epParam > 0) {
					pauseForExternalMedia();
				}
			}
		}
	});

	$effect(() => {
		const epParam = Number($page.url.searchParams.get('ep') || 0);
		if (!loading && epParam > 0 && allVideos.length > 0 && currentVideo?.id !== epParam) {
			const target = allVideos.find((v) => v.id === epParam);
			if (target) {
				selectVideo(target, false);
			}
		}
	});
</script>

<svelte:head>
	<title>{currentVideo ? `${currentVideo.video_name} — ` : ''}{m.videos_seo_title()}</title>
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

	<div class="theater-container" class:cinema-container={cinemaMode}>
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
			<div class="theater-layout" class:cinema-mode={cinemaMode}>
				<!-- Player Area -->
				<div class="player-area">
					{#if currentVideo}
						<!-- Video Player -->
						<div class="video-player-wrapper">
							{#if isCurrentDirectVideo}
								<!-- Native HTML5 Video Engine for .mp4 / .webm / local-media -->
								{#key currentVideo.id}
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										bind:this={nativeVideoEl}
										src={currentVideo.video_path}
										poster={resolveVideoThumbnail(currentVideo) || undefined}
										controls
										autoplay
										playsinline
										class="video-player"
										onplay={() => pauseForExternalMedia()}
										onloadedmetadata={handleNativeVideoLoadedMetadata}
										ontimeupdate={handleNativeVideoTimeUpdate}
										onended={handleNativeVideoEnded}
									></video>
								{/key}
							{:else if embedUrl}
								{#key currentVideo.id}
									<iframe
										src={embedUrl}
										title={currentVideo.video_name}
										frameborder="0"
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
										allowfullscreen
										class="video-player"
									></iframe>
								{/key}
							{:else}
								<div class="video-error">
									<span class="error-icon">⚠️</span>
									<p>{m.videos_unable_to_load_video_source()}</p>
								</div>
							{/if}
						</div>

						<!-- Episode Controls & Action Bar -->
						<div class="episode-controls">
							<button
								class="ctrl-btn"
								disabled={!prevEpisode}
								onclick={() => prevEpisode && selectVideo(prevEpisode)}
							>
								{m.videos_prev()}
							</button>

							<div class="episode-info-bar">
								<div class="ep-badges-row">
									<span class="ep-badge {currentVideo.video_type}">
										{typeLabel(currentVideo.video_type)}
									</span>
									{#if currentProgress?.completed}
										<span class="ep-badge watched-pill">{m.uprofile_watched()}</span>
									{:else if currentProgress?.last_position && currentProgress.last_position > 0}
										<span class="ep-badge resume-pill">
											⏱ {m.videos_in_progress()} ({formatAudioTime(currentProgress.last_position)})
										</span>
									{/if}
								</div>
								<h2 class="ep-title">
									{#if currentVideo.episode_number}
										<span class="ep-num">{m.videos_episode({ num: currentVideo.episode_number })}</span>
									{/if}
									{currentVideo.video_name}
								</h2>
							</div>

							<div class="episode-utility-btns">
								<button
									class="util-btn"
									class:active={currentProgress?.completed}
									onclick={() => currentVideo && toggleWatchedStatus(currentVideo)}
									title={m.videos_mark_episode_as_watched_unwatched()}
								>
									{currentProgress?.completed ? m.uprofile_watched() : m.videos_mark_watched()}
								</button>

								{#if isCurrentDirectVideo}
									<button
										class="util-btn"
										class:active={autoNext}
										onclick={() => (autoNext = !autoNext)}
										title={m.videos_automatically_play_next_episode_when()}
									>
										⏭ {m.videos_auto_next()}: {autoNext ? m.videos_on() : m.videos_off()}
									</button>
								{/if}

								<button
									class="util-btn"
									class:active={cinemaMode}
									onclick={() => (cinemaMode = !cinemaMode)}
									title={m.videos_cinema_mode_expand_player()}
								>
									🎬 {cinemaMode ? m.videos_standard() : m.videos_cinema()}
								</button>

								<button
									class="ctrl-btn"
									disabled={!nextEpisode}
									onclick={() => nextEpisode && selectVideo(nextEpisode)}
								>
									{m.videos_next()}
								</button>
							</div>
						</div>

						<!-- Description -->
						{#if currentVideo.description}
							<div class="video-desc-card">
								<p>{currentVideo.description}</p>
							</div>
						{/if}

						<!-- Comments Section for Current Episode -->
						<div class="video-comments-box">
							{#key currentVideo.id}
								<CommentsSection commentableType="video" commentableId={currentVideo.id} />
							{/key}
						</div>
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
								onclick={() => (activeTab = tab.key)}
							>
								{tab.icon} {tab.label}
								<span class="tab-count">{getTabVideos(tab.key).length}</span>
							</button>
						{/each}
					</div>

					<!-- Search & Filter Bar -->
					<div class="playlist-filters">
						<input
							type="search"
							placeholder={m.videos_search_episodes()}
							bind:value={searchQuery}
							class="playlist-search"
						/>
						<div class="status-pills">
							<button
								class="status-pill"
								class:active={statusFilter === 'all'}
								onclick={() => (statusFilter = 'all')}
							>
								{m.lib_cat_all()}
							</button>
							<button
								class="status-pill"
								class:active={statusFilter === 'unwatched'}
								onclick={() => (statusFilter = 'unwatched')}
							>
								⏳ {m.videos_unwatched()}
							</button>
							<button
								class="status-pill"
								class:active={statusFilter === 'watched'}
								onclick={() => (statusFilter = 'watched')}
							>
								✓ {m.videos_watched()}
							</button>
						</div>
					</div>

					<!-- Playlist Items -->
					<div class="playlist-scroll">
						{#each filteredPlaylist as video (video.id)}
							{@const vidProg = progressMap[video.id]}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="playlist-item"
								class:active={currentVideo?.id === video.id}
								class:watched={vidProg?.completed}
								onclick={() => selectVideo(video)}
								onkeydown={(e) => {
									if (e.key === 'Enter') selectVideo(video);
								}}
								role="button"
								tabindex="0"
							>
								<div class="item-thumb">
									{#if resolveVideoThumbnail(video)}
										<img
											src={resolveVideoThumbnail(video)}
											alt={video.video_name}
											loading="lazy"
										/>
									{:else}
										<div class="thumb-fallback">▶</div>
									{/if}
									{#if currentVideo?.id === video.id}
										<span class="now-playing">▶</span>
									{:else if vidProg?.completed}
										<span class="watched-corner" title={m.videos_watched()}>✓</span>
									{/if}
								</div>
								<div class="item-info">
									<div class="item-top-meta">
										{#if video.episode_number}
											<span class="item-ep">{m.videos_episode({ num: video.episode_number })}</span>
										{/if}
										{#if vidProg?.completed}
											<span class="item-watched-label">{m.videos_watched()}</span>
										{:else if vidProg?.last_position && vidProg.last_position > 0}
											<span class="item-resume-label">
												⏱ {formatAudioTime(vidProg.last_position)}
											</span>
										{/if}
									</div>
									<span class="item-name">{video.video_name}</span>
									{#if video.is_featured}
										<span class="item-featured">{m.videos_featured()}</span>
									{/if}
								</div>
							</div>
						{/each}

						{#if filteredPlaylist.length === 0}
							<p class="empty-tab">
								{searchQuery || statusFilter !== 'all'
									? m.videos_no_episodes_match_the_current()
									: m.videos_empty_desc()}
							</p>
						{/if}
					</div>
				</aside>
			</div>
		{/if}
	</div>
</div>

<style>
	/* ===== Page ===== */
	.videos-page {
		min-height: 70vh;
	}
	.theater-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem) 6rem;
		transition: max-width 0.3s ease;
	}
	.theater-container.cinema-container {
		max-width: 1680px;
	}

	/* ===== Hero ===== */
	.page-hero {
		position: relative;
		text-align: center;
		padding: clamp(2.25rem, 5vw, 3.5rem) clamp(1rem, 4vw, 2rem) clamp(1.75rem, 3.5vw, 2.5rem);
		background: var(--color-surface-0);
		overflow: hidden;
		margin-bottom: 2rem;
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

	/* ===== Loading ===== */
	.loading-state {
		text-align: center;
		padding: 5rem;
	}
	.loading-state p {
		color: var(--color-text-muted);
		margin-top: 1.25rem;
		font-size: 0.95rem;
	}
	.pulse-loader {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}
	.pulse-loader span {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-brand-500);
		animation: pb 1.2s infinite ease-in-out;
	}
	.pulse-loader span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.pulse-loader span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes pb {
		0%,
		80%,
		100% {
			transform: scale(0.6);
			opacity: 0.4;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* ===== Theater Layout ===== */
	.theater-layout {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 1.5rem;
		align-items: start;
	}
	.theater-layout.cinema-mode {
		grid-template-columns: 1fr;
	}

	/* ===== Player Area ===== */
	.player-area {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.video-player-wrapper {
		position: relative;
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
		background: #000;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.video-player {
		display: block;
		width: 100%;
		aspect-ratio: 16/9;
		max-height: 78vh;
		background: #000;
		border: none;
	}
	.video-error {
		aspect-ratio: 16/9;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-100);
		gap: 0.75rem;
	}
	.error-icon {
		font-size: 2.5rem;
	}
	.video-error p {
		color: var(--color-text-muted);
		margin: 0;
		font-size: 0.95rem;
	}

	/* Placeholder */
	.player-placeholder {
		aspect-ratio: 16/9;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-100);
		border-radius: var(--radius-xl);
		border: 2px dashed rgba(12, 113, 61, 0.2);
	}
	.placeholder-icon {
		font-size: 3.5rem;
		margin-bottom: 0.75rem;
		opacity: 0.6;
	}
	.player-placeholder p {
		color: var(--color-text-muted);
		font-size: 1rem;
		margin: 0;
	}

	/* ===== Episode Controls ===== */
	.episode-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255, 255, 255, 0.06);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
		flex-wrap: wrap;
	}
	.ctrl-btn {
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700));
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}
	.ctrl-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(12, 113, 61, 0.35);
		filter: brightness(1.1);
	}
	.ctrl-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.episode-utility-btns {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.util-btn {
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}
	.util-btn:hover {
		border-color: var(--color-brand-400);
		color: var(--color-text-primary);
	}
	.util-btn.active {
		background: rgba(12, 113, 61, 0.18);
		border-color: var(--color-brand-400);
		color: var(--color-brand-400);
	}

	.episode-info-bar {
		flex: 1;
		min-width: 180px;
	}
	.ep-badges-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.25rem;
		flex-wrap: wrap;
	}
	.ep-badge {
		display: inline-block;
		padding: 0.18rem 0.6rem;
		border-radius: 1rem;
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.ep-badge.main {
		background: rgba(12, 113, 61, 0.12);
		color: var(--color-brand-400);
	}
	.ep-badge.side {
		background: rgba(99, 102, 241, 0.12);
		color: #818cf8;
	}
	.ep-badge.filler {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
	}
	.ep-badge.watched-pill {
		background: rgba(16, 185, 129, 0.16);
		color: #34d399;
	}
	.ep-badge.resume-pill {
		background: rgba(6, 182, 212, 0.15);
		color: #22d3ee;
	}

	.ep-title {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ep-num {
		color: var(--color-brand-400);
		font-weight: 800;
		margin-right: 0.375rem;
	}

	/* ===== Description & Comments ===== */
	.video-desc-card {
		padding: 1.15rem 1.4rem;
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.video-desc-card p {
		color: var(--color-text-secondary);
		line-height: 1.7;
		margin: 0;
		font-size: 0.9rem;
		white-space: pre-line;
	}

	.video-comments-box {
		margin-top: 0.5rem;
	}

	/* ===== Sidebar ===== */
	.playlist-sidebar {
		background: var(--color-surface-100);
		border-radius: var(--radius-xl);
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.06);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
		position: sticky;
		top: 5rem;
		max-height: calc(100vh - 6rem);
		display: flex;
		flex-direction: column;
	}

	.tab-bar {
		display: flex;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: var(--color-surface-50);
	}
	.tab-btn {
		flex: 1;
		padding: 0.85rem 0.4rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}
	.tab-btn:hover {
		color: var(--color-brand-400);
	}
	.tab-btn.active {
		color: var(--color-brand-400);
		border-bottom-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.04);
	}
	.tab-count {
		font-size: 0.625rem;
		background: rgba(255, 255, 255, 0.06);
		padding: 0.1rem 0.4rem;
		border-radius: 0.75rem;
		font-weight: 700;
	}

	.playlist-filters {
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.playlist-search {
		width: 100%;
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.8rem;
		outline: none;
	}
	.playlist-search:focus {
		border-color: var(--color-brand-400);
	}
	.status-pills {
		display: flex;
		gap: 0.35rem;
	}
	.status-pill {
		flex: 1;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
	}
	.status-pill.active {
		background: rgba(12, 113, 61, 0.18);
		border-color: var(--color-brand-400);
		color: var(--color-brand-400);
	}

	/* Playlist Items */
	.playlist-scroll {
		overflow-y: auto;
		flex: 1;
		padding: 0.5rem;
	}
	.playlist-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.playlist-scroll::-webkit-scrollbar-thumb {
		background: var(--color-brand-500);
		border-radius: 4px;
	}

	.playlist-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.6rem;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s;
		border: 2px solid transparent;
		margin-bottom: 0.25rem;
	}
	.playlist-item:hover {
		background: rgba(12, 113, 61, 0.06);
		border-color: rgba(12, 113, 61, 0.1);
	}
	.playlist-item.active {
		background: linear-gradient(135deg, rgba(12, 113, 61, 0.12), rgba(12, 113, 61, 0.05));
		border-color: rgba(12, 113, 61, 0.3);
	}
	.playlist-item.watched:not(.active) {
		opacity: 0.82;
	}

	.item-thumb {
		width: 100px;
		height: 56px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
		position: relative;
		background: var(--color-surface-200);
	}
	.item-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s;
	}
	.playlist-item:hover .item-thumb img {
		transform: scale(1.05);
	}

	.thumb-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		color: var(--color-text-muted);
		background: linear-gradient(135deg, var(--color-surface-200), var(--color-surface-300));
	}
	.now-playing {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(12, 113, 61, 0.75);
		color: #fff;
		font-size: 1rem;
	}
	.watched-corner {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: rgba(16, 185, 129, 0.9);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 800;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.15rem;
	}
	.item-top-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
	}
	.item-ep {
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--color-brand-400);
		text-transform: uppercase;
	}
	.item-watched-label {
		font-size: 0.6rem;
		color: #34d399;
		font-weight: 600;
	}
	.item-resume-label {
		font-size: 0.6rem;
		color: #22d3ee;
		font-weight: 600;
	}
	.item-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-featured {
		font-size: 0.6rem;
		color: var(--color-accent-gold);
		font-weight: 600;
	}

	.empty-tab {
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		padding: 2.5rem 1rem;
	}

	/* ===== Empty State ===== */
	.empty-state {
		text-align: center;
		padding: 5rem 2rem;
	}
	.empty-icon {
		font-size: 3.5rem;
		display: block;
		margin-bottom: 1.25rem;
	}
	.empty-state h3 {
		font-size: 1.25rem;
		color: var(--color-text-secondary);
		margin: 0 0 0.5rem;
		font-weight: 700;
	}
	.empty-state p {
		color: var(--color-text-muted);
		margin: 0;
	}

	/* ===== Responsive ===== */
	@media (max-width: 1024px) {
		.theater-layout {
			grid-template-columns: 1fr;
		}
		.playlist-sidebar {
			position: static;
			max-height: 520px;
		}
	}

	@media (max-width: 640px) {
		.episode-controls {
			padding: 0.75rem 0.9rem;
			gap: 0.65rem;
		}
		.episode-info-bar {
			order: -1;
			flex-basis: 100%;
			min-width: 0;
		}
		.ep-title {
			white-space: normal;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
		}
		.episode-utility-btns {
			flex: 1;
			justify-content: flex-end;
		}
	}
</style>
