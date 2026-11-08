<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
		import {
		ensureMusicCatalogLoaded,
		loadFavorites,
		playTrack,
		playAlbum,
		toggleFavoriteTrack,
		formatAudioTime,
		getAlbums,
		getFavorites,
		getFavoriteTracksList,
		getCurrentTrack,
		getIsPlaying,
		getLoadingCatalog,
		getAllCatalogTracks,
		type AudioAlbum,
		type AudioTrack
	} from '$lib/stores/audio.svelte';

	let searchQuery = $state('');
	let activeView = $state<'albums' | 'favorites'>('albums');
	let highlightedTrackId = $state<number | null>(null);
	let highlightedAlbumId = $state<number | null>(null);

	let albums = $derived(getAlbums());
	let favorites = $derived(getFavorites());
	let favoriteTracksList = $derived(getFavoriteTracksList());
	let currentTrack = $derived(getCurrentTrack());
	let isPlaying = $derived(getIsPlaying());
	let loading = $derived(getLoadingCatalog());

	let normalizedQuery = $derived(searchQuery.trim().toLowerCase());

	let filteredAlbums = $derived.by(() => {
		if (!normalizedQuery) return albums;
		return albums
			.map((alb) => {
				const albumMatches =
					alb.title.toLowerCase().includes(normalizedQuery) ||
					(alb.description || '').toLowerCase().includes(normalizedQuery);
				const matchingTracks = (alb.tracks || []).filter(
					(t) =>
						albumMatches ||
						t.title.toLowerCase().includes(normalizedQuery) ||
						t.artist.toLowerCase().includes(normalizedQuery)
				);
				return {
					...alb,
					tracks: matchingTracks
				};
			})
			.filter((alb) => alb.tracks.length > 0);
	});

	let resolvedFavorites = $derived.by(() => {
		const catalogMap = new Map<number, AudioTrack>();
		for (const t of getAllCatalogTracks()) {
			catalogMap.set(t.id, t);
		}
		const merged: AudioTrack[] = [];
		for (const favId of favorites) {
			const fromList = favoriteTracksList.find((t) => t.id === favId);
			const fromCatalog = catalogMap.get(favId);
			const item = fromCatalog || fromList;
			if (item) {
				if (
					!normalizedQuery ||
					item.title.toLowerCase().includes(normalizedQuery) ||
					item.artist.toLowerCase().includes(normalizedQuery) ||
					(item.album_title || '').toLowerCase().includes(normalizedQuery)
				) {
					merged.push(item);
				}
			}
		}
		return merged;
	});

	function handleDeepLinks() {
		const trackParam = Number($page.url.searchParams.get('track') || 0);
		const albumParam = Number($page.url.searchParams.get('album') || 0);

		if (trackParam > 0) {
			highlightedTrackId = trackParam;
			for (const alb of albums) {
				const found = (alb.tracks || []).find((t) => t.id === trackParam);
				if (found) {
					if (currentTrack?.id !== found.id) {
						playTrack(found, alb, true);
					}
					break;
				}
			}
			requestAnimationFrame(() => {
				const el = document.getElementById(`track-${trackParam}`);
				el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		} else if (albumParam > 0) {
			highlightedAlbumId = albumParam;
			requestAnimationFrame(() => {
				const el = document.getElementById(`album-${albumParam}`);
				el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
	}

	onMount(async () => {
		await ensureMusicCatalogLoaded(true);
		if (isAuthenticated()) {
			await loadFavorites();
		}
		handleDeepLinks();
	});

	function playAllCatalog(shuffled = false) {
		const all = getAllCatalogTracks();
		if (all.length === 0) return;
		const idx = shuffled ? Math.floor(Math.random() * all.length) : 0;
		playTrack(all[idx], all, true);
	}

	function playFavoriteList() {
		if (resolvedFavorites.length === 0) return;
		playTrack(resolvedFavorites[0], resolvedFavorites, true);
	}
</script>

<svelte:head><title>{m.music_seo_title()}</title></svelte:head>

<section class="music-page">
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<h1>{m.music_list_title()}</h1>
			<p class="hero-tagline">{m.music_list_subtitle()}</p>
			<div class="hero-quick-actions">
				<button class="hero-btn primary" onclick={() => playAllCatalog(false)}>
					▶ {m.ui_play_all_ost()}
				</button>
				<button class="hero-btn secondary" onclick={() => playAllCatalog(true)}>
					🔀 {m.ui_shuffle_play()}
				</button>
			</div>
		</div>
	</section>

	<div class="music-content">
		<!-- Toolbar: Filter Tabs + Search -->
		<div class="music-toolbar">
			<div class="view-tabs">
				<button
					class="view-tab"
					class:active={activeView === 'albums'}
					onclick={() => (activeView = 'albums')}
				>
					💿 {m.ui_all_albums()} ({albums.length})
				</button>
				{#if isAuthenticated()}
					<button
						class="view-tab"
						class:active={activeView === 'favorites'}
						onclick={() => (activeView = 'favorites')}
					>
						❤️ {m.ui_favorites()} ({favorites.size})
					</button>
				{/if}
			</div>

			<div class="search-box">
				<span class="search-icon">🔍</span>
				<input
					type="search"
					placeholder={m.ui_search_tracks_artists_albums()}
					bind:value={searchQuery}
					class="search-input"
				/>
				{#if searchQuery}
					<button class="clear-search" onclick={() => (searchQuery = '')}>✕</button>
				{/if}
			</div>
		</div>

		{#if loading && albums.length === 0}
			<div class="loading">{m.loading_text()}</div>
		{:else if activeView === 'favorites'}
			<div class="favorites-section">
				<div class="fav-header">
					<div>
						<h2>❤️ {m.ui_favorite_tracks()}</h2>
						<p class="album-desc">{m.ui_melodies_you_saved_to_enjoy()}</p>
					</div>
					{#if resolvedFavorites.length > 0}
						<button class="album-action-btn primary" onclick={playFavoriteList}>
							▶ {m.ui_play_favorites()} ({resolvedFavorites.length})
						</button>
					{/if}
				</div>

				{#if resolvedFavorites.length === 0}
					<div class="empty">
						<span>🤍</span>
						<h3>{m.ui_no_favorite_tracks_yet()}</h3>
						<p class="empty-sub">{m.ui_click_the_heart_icon_next()}</p>
					</div>
				{:else}
					<div class="track-list">
						{#each resolvedFavorites as track, i (track.id)}
							<div
								id="track-{track.id}"
								class="track-row"
								class:playing={currentTrack?.id === track.id}
								class:highlighted={highlightedTrackId === track.id}
								onclick={() => playTrack(track, resolvedFavorites, true)}
								role="button"
								tabindex="0"
								onkeydown={(e) => {
									if (e.key === 'Enter') playTrack(track, resolvedFavorites, true);
								}}
							>
								<span class="track-num">
									{#if currentTrack?.id === track.id && isPlaying}
										<span class="eq-bars">
											<span class="eq-bar"></span>
											<span class="eq-bar"></span>
											<span class="eq-bar"></span>
										</span>
									{:else if currentTrack?.id === track.id}
										⏸
									{:else}
										{i + 1}
									{/if}
								</span>
								<div class="track-info">
									<span class="track-title">{track.title}</span>
									<span class="track-artist">
										{track.artist}{track.album_title ? ` • ${track.album_title}` : ''}
									</span>
								</div>
								{#if track.duration}
									<span class="track-dur">{formatAudioTime(track.duration)}</span>
								{/if}
								<button
									class="fav-btn faved"
									onclick={(e) => {
										e.stopPropagation();
										toggleFavoriteTrack(track);
									}}
									title={m.ui_remove_favorite()}
								>
									❤️
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if filteredAlbums.length === 0}
			<div class="empty">
				<span>🎵</span>
				<h3>{searchQuery ? m.ui_no_matching_tracks_found() : m.music_empty_title()}</h3>
			</div>
		{:else}
			{#each filteredAlbums as album (album.id)}
				<div
					id="album-{album.id}"
					class="album-section"
					class:highlighted-album={highlightedAlbumId === album.id}
				>
					<div class="album-header">
						{#if album.cover_image}
							<img src={album.cover_image} alt={album.title} class="album-cover" />
						{:else}
							<div class="album-cover-ph">🎶</div>
						{/if}
						<div class="album-meta">
							<h2>{album.title}</h2>
							{#if album.description}
								<p class="album-desc">{album.description}</p>
							{/if}
							<span class="album-count">
								{m.music_track_count({ count: album.tracks?.length || 0 })}
							</span>
						</div>
						{#if album.tracks?.length}
							<div class="album-actions">
								<button
									class="album-action-btn primary"
									onclick={() => playAlbum(album, false)}
								>
									▶ {m.ui_play_album()}
								</button>
								<button
									class="album-action-btn"
									onclick={() => playAlbum(album, true)}
									title={m.ui_shuffle_this_album()}
								>
									🔀 {m.ui_shuffle()}
								</button>
							</div>
						{/if}
					</div>

					<div class="track-list">
						{#each album.tracks || [] as track, i (track.id)}
							<div
								id="track-{track.id}"
								class="track-row"
								class:playing={currentTrack?.id === track.id}
								class:highlighted={highlightedTrackId === track.id}
								onclick={() => playTrack(track, album, true)}
								role="button"
								tabindex="0"
								onkeydown={(e) => {
									if (e.key === 'Enter') playTrack(track, album, true);
								}}
							>
								<span class="track-num">
									{#if currentTrack?.id === track.id && isPlaying}
										<span class="eq-bars">
											<span class="eq-bar"></span>
											<span class="eq-bar"></span>
											<span class="eq-bar"></span>
										</span>
									{:else if currentTrack?.id === track.id}
										⏸
									{:else}
										{i + 1}
									{/if}
								</span>
								<div class="track-info">
									<span class="track-title">{track.title}</span>
									<span class="track-artist">{track.artist}</span>
								</div>
								{#if track.duration}
									<span class="track-dur">{formatAudioTime(track.duration)}</span>
								{/if}
								{#if isAuthenticated()}
									<button
										class="fav-btn"
										class:faved={favorites.has(track.id)}
										onclick={(e) => {
											e.stopPropagation();
											toggleFavoriteTrack(track);
										}}
										title={favorites.has(track.id) ? m.ui_remove_favorite() : m.ui_favorite()}
									>
										{favorites.has(track.id) ? '❤️' : '🤍'}
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>

<style>
	.music-page {
		min-height: 75vh;
	}
	.music-content {
		max-width: 960px;
		margin: 0 auto;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem) 8rem;
	}

	/* ===== Hero ===== */
	.page-hero {
		position: relative;
		text-align: center;
		padding: clamp(2.25rem, 5vw, 3.5rem) clamp(1rem, 4vw, 2rem) clamp(1.75rem, 3.5vw, 2.5rem);
		background: var(--color-surface-0);
		overflow: hidden;
		margin-bottom: 1.5rem;
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
		margin: 0 0 1.25rem;
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

	.hero-quick-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.hero-btn {
		padding: 0.55rem 1.2rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.hero-btn.primary {
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700));
		color: #fff;
		border-color: transparent;
		box-shadow: 0 4px 16px rgba(12, 113, 61, 0.35);
	}
	.hero-btn.primary:hover {
		transform: translateY(-1px);
		filter: brightness(1.08);
	}
	.hero-btn.secondary {
		background: var(--color-surface-100);
		color: var(--color-text-primary);
	}
	.hero-btn.secondary:hover {
		border-color: var(--color-brand-400);
		color: var(--color-brand-400);
	}

	/* Toolbar */
	.music-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}
	.view-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.view-tab {
		padding: 0.5rem 1rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--color-surface-100);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.view-tab.active {
		background: rgba(12, 113, 61, 0.16);
		border-color: var(--color-brand-400);
		color: var(--color-brand-400);
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
		min-width: min(100%, 240px);
		flex: 1;
		max-width: 360px;
	}
	.search-icon {
		position: absolute;
		left: 0.85rem;
		font-size: 0.85rem;
		opacity: 0.6;
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		padding: 0.55rem 2.2rem 0.55rem 2.3rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-100);
		color: var(--color-text-primary);
		font-size: 0.85rem;
		outline: none;
	}
	.search-input:focus {
		border-color: var(--color-brand-400);
	}
	.clear-search {
		position: absolute;
		right: 0.65rem;
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.8rem;
	}

	.loading,
	.empty {
		text-align: center;
		padding: 4rem 1.5rem;
		color: var(--color-text-muted);
	}
	.empty span {
		font-size: 3rem;
		display: block;
		margin-bottom: 1rem;
	}
	.empty-sub {
		font-size: 0.85rem;
		margin-top: 0.35rem;
	}

	.album-section,
	.favorites-section {
		margin-bottom: 2.75rem;
		padding: 1.35rem;
		border-radius: 16px;
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.album-section.highlighted-album {
		border-color: var(--color-brand-400);
		box-shadow: 0 0 24px rgba(12, 113, 61, 0.18);
	}

	.album-header,
	.fav-header {
		display: flex;
		gap: 1.25rem;
		align-items: center;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}
	.fav-header {
		justify-content: space-between;
	}
	.album-cover {
		width: 84px;
		height: 84px;
		border-radius: 12px;
		object-fit: cover;
		flex-shrink: 0;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}
	.album-cover-ph {
		width: 84px;
		height: 84px;
		border-radius: 12px;
		background: linear-gradient(135deg, var(--color-surface-200), var(--color-surface-400));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		flex-shrink: 0;
	}
	.album-meta {
		flex: 1;
		min-width: 180px;
	}
	.album-header h2,
	.fav-header h2 {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0;
	}
	.album-desc {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		margin: 0.25rem 0;
	}
	.album-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.album-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.album-action-btn {
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		cursor: pointer;
		transition: all 0.15s;
	}
	.album-action-btn.primary {
		background: var(--color-brand-500);
		border-color: transparent;
		color: #fff;
	}
	.album-action-btn:hover {
		transform: translateY(-1px);
		border-color: var(--color-brand-400);
	}

	.track-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.track-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-primary);
		cursor: pointer;
		border-radius: 10px;
		transition: all 0.15s;
		width: 100%;
		text-align: left;
	}
	.track-row:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.track-row.playing {
		background: rgba(12, 113, 61, 0.14);
		border-left: 3px solid var(--color-brand-400);
	}
	.track-row.highlighted {
		border-color: rgba(74, 222, 128, 0.35);
	}
	.track-num {
		width: 28px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}
	.track-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.track-title {
		font-size: 0.9rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track-row.playing .track-title {
		color: var(--color-brand-400);
	}
	.track-artist {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track-dur {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.fav-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.95rem;
		padding: 0.2rem;
		transition: transform 0.15s;
	}
	.fav-btn:hover {
		transform: scale(1.2);
	}

	/* Equalizer animation */
	.eq-bars {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
		height: 14px;
	}
	.eq-bar {
		width: 3px;
		background: var(--color-brand-400);
		border-radius: 1px;
		animation: eq-bounce 0.6s ease-in-out infinite alternate;
	}
	.eq-bar:nth-child(1) {
		height: 6px;
		animation-delay: 0s;
	}
	.eq-bar:nth-child(2) {
		height: 10px;
		animation-delay: 0.15s;
	}
	.eq-bar:nth-child(3) {
		height: 4px;
		animation-delay: 0.3s;
	}
	@keyframes eq-bounce {
		0% {
			transform: scaleY(0.4);
		}
		100% {
			transform: scaleY(1.2);
		}
	}
</style>
