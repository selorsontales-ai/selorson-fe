<script lang="ts">
	import { api } from '$lib/api';
	import { onMount, onDestroy } from 'svelte';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';

	let albums = $state<any[]>([]);
	let loading = $state(true);
	let currentTrack = $state<any>(null);
	let isPlaying = $state(false);
	let progress = $state(0);
	let duration = $state(0);
	let volume = $state(0.8);
	let favorites = $state<Set<number>>(new Set());
	let playerEl = $state<any>(null);
	let vidstackReady = $state(false);

	onMount(async () => {
		// Dynamically import Vidstack (client-only)
		if (browser) {
			await import('vidstack/player');
			await import('vidstack/player/ui');
			vidstackReady = true;
		}

		try {
			const res = await api<any>('/music/albums');
			albums = res.data || [];
		} catch { albums = []; }
		loading = false;

		if (isAuthenticated()) {
			try {
				const fRes = await api<any>('/music/favorites');
				favorites = new Set((fRes.data || []).map((t: any) => t.id));
			} catch {}
		}
	});

	onDestroy(() => {
		if (playerEl) {
			try { playerEl.pause?.(); } catch {}
		}
	});

	function playTrack(track: any, album: any) {
		if (currentTrack?.id === track.id) {
			togglePlay();
			return;
		}
		currentTrack = { ...track, album };
		isPlaying = true;
		// Let Vidstack handle playback via reactive src binding
		// Wait for DOM update then auto-play
		requestAnimationFrame(() => {
			const mp = document.querySelector('media-player') as any;
			if (mp) {
				playerEl = mp;
				mp.src = track.file_path;
				mp.play().catch(() => {});
			}
		});
	}

	function togglePlay() {
		const mp = document.querySelector('media-player') as any;
		if (!mp) return;
		if (mp.paused) { mp.play(); isPlaying = true; }
		else { mp.pause(); isPlaying = false; }
	}

	function handleTimeUpdate(e: any) {
		const mp = e.target as any;
		if (mp) {
			progress = mp.currentTime || 0;
			duration = mp.duration || 0;
		}
	}

	function handleEnded() {
		isPlaying = false;
		// Auto-play next track
		if (currentTrack) {
			const album = albums.find(a => a.id === currentTrack.album?.id);
			if (album?.tracks) {
				const idx = album.tracks.findIndex((t: any) => t.id === currentTrack.id);
				if (idx >= 0 && idx < album.tracks.length - 1) {
					playTrack(album.tracks[idx + 1], album);
				}
			}
		}
	}

	function seekTo(e: Event) {
		const input = e.target as HTMLInputElement;
		const mp = document.querySelector('media-player') as any;
		if (mp) mp.currentTime = Number(input.value);
	}

	function setVolume(e: Event) {
		const input = e.target as HTMLInputElement;
		volume = Number(input.value);
		const mp = document.querySelector('media-player') as any;
		if (mp) mp.volume = volume;
	}

	async function toggleFavorite(trackId: number) {
		try {
			await api(`/music/tracks/${trackId}/favorite`, { method: 'POST' });
			if (favorites.has(trackId)) { favorites.delete(trackId); } else { favorites.add(trackId); }
			favorites = new Set(favorites);
		} catch {}
	}

	function playPrev() {
		if (!currentTrack) return;
		const album = albums.find(a => a.id === currentTrack.album?.id);
		if (album?.tracks) {
			const idx = album.tracks.findIndex((t: any) => t.id === currentTrack.id);
			if (idx > 0) playTrack(album.tracks[idx - 1], album);
		}
	}

	function playNext() {
		if (!currentTrack) return;
		const album = albums.find(a => a.id === currentTrack.album?.id);
		if (album?.tracks) {
			const idx = album.tracks.findIndex((t: any) => t.id === currentTrack.id);
			if (idx >= 0 && idx < album.tracks.length - 1) playTrack(album.tracks[idx + 1], album);
		}
	}

	function formatTime(s: number) {
		if (!s || isNaN(s)) return '0:00';
		const min = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${min}:${sec.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head><title>{m.music_seo_title()}</title></svelte:head>

<section class="music-page">
	<div class="page-header">
		<h1 class="section-title">{m.music_list_title()}</h1>
		<p class="page-sub">{m.music_list_subtitle()}</p>
	</div>

	{#if loading}
		<div class="loading">{m.loading_text()}</div>
	{:else if albums.length === 0}
		<div class="empty"><span>🎵</span><h3>{m.music_empty_title()}</h3></div>
	{:else}
		{#each albums as album}
			<div class="album-section">
				<div class="album-header">
					{#if album.cover_image}
						<img src={album.cover_image} alt={album.title} class="album-cover" />
					{:else}
						<div class="album-cover-ph">🎶</div>
					{/if}
					<div>
						<h2>{album.title}</h2>
						{#if album.description}
							<p class="album-desc">{album.description}</p>
						{/if}
						<span class="album-count">{m.music_track_count({ count: album.tracks?.length || 0 })}</span>
					</div>
				</div>

				<div class="track-list">
					{#each album.tracks || [] as track, i}
						<div
							class="track-row"
							class:playing={currentTrack?.id === track.id}
							onclick={() => playTrack(track, album)}
							role="button"
							tabindex="0"
							onkeydown={(e) => { if (e.key === 'Enter') playTrack(track, album); }}
						>
							<span class="track-num">
								{#if currentTrack?.id === track.id && isPlaying}
									<span class="eq-bars">
										<span class="eq-bar"></span>
										<span class="eq-bar"></span>
										<span class="eq-bar"></span>
									</span>
								{:else}
									{i + 1}
								{/if}
							</span>
							<div class="track-info">
								<span class="track-title">{track.title}</span>
								<span class="track-artist">{track.artist}</span>
							</div>
							{#if track.duration}
								<span class="track-dur">{formatTime(track.duration)}</span>
							{/if}
							{#if isAuthenticated()}
								<button class="fav-btn" class:faved={favorites.has(track.id)}
									onclick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }}>
									{favorites.has(track.id) ? '❤️' : '🤍'}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</section>

<!-- Vidstack-powered Mini Player -->
{#if currentTrack && vidstackReady}
	<div class="mini-player">
		<div class="player-info">
			{#if currentTrack.album?.cover_image}
				<img src={currentTrack.album.cover_image} alt="" class="player-cover spinning" class:paused={!isPlaying} />
			{:else}
				<div class="player-cover-ph" class:paused={!isPlaying}>🎵</div>
			{/if}
			<div class="player-meta">
				<div class="player-title">{currentTrack.title}</div>
				<div class="player-artist">{currentTrack.artist}</div>
			</div>
		</div>

		<div class="player-controls">
			<button class="ctrl-btn" onclick={playPrev} aria-label="Previous">⏮</button>
			<button class="play-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
				{isPlaying ? '⏸' : '▶'}
			</button>
			<button class="ctrl-btn" onclick={playNext} aria-label="Next">⏭</button>
		</div>

		<div class="player-progress">
			<span class="player-time">{formatTime(progress)}</span>
			<input type="range" class="progress-bar" min="0" max={duration || 0} step="0.1" value={progress} oninput={seekTo} />
			<span class="player-time">{formatTime(duration)}</span>
		</div>

		<div class="player-volume">
			<span class="vol-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
			<input type="range" class="volume-bar" min="0" max="1" step="0.01" value={volume} oninput={setVolume} />
		</div>

		<!-- Hidden Vidstack player for audio engine -->
		<media-player
			src={currentTrack.file_path}
			autoPlay
			style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;"
			ontimeupdate={handleTimeUpdate}
			onended={handleEnded}
			onplay={() => isPlaying = true}
			onpause={() => isPlaying = false}
		>
			<media-provider></media-provider>
		</media-player>
	</div>
{/if}

<style>
	.music-page{max-width:900px;margin:0 auto;padding:3rem 1.5rem 8rem}
	.page-header{text-align:center;margin-bottom:3rem}
	.page-sub{color:var(--color-text-muted);margin-top:.5rem}
	.loading,.empty{text-align:center;padding:4rem;color:var(--color-text-muted)}
	.empty span{font-size:3rem;display:block;margin-bottom:1rem}

	.album-section{margin-bottom:3rem}
	.album-header{display:flex;gap:1.25rem;align-items:center;margin-bottom:1.25rem}
	.album-cover{width:80px;height:80px;border-radius:12px;object-fit:cover;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.3)}
	.album-cover-ph{width:80px;height:80px;border-radius:12px;background:linear-gradient(135deg,var(--color-surface-200),var(--color-surface-400));display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0}
	.album-header h2{font-size:1.25rem;font-weight:700}
	.album-desc{font-size:.82rem;color:var(--color-text-muted);margin-top:.2rem}
	.album-count{font-size:.75rem;color:var(--color-text-muted)}

	.track-list{display:flex;flex-direction:column}
	.track-row{display:flex;align-items:center;gap:.75rem;padding:.65rem .75rem;border:none;background:transparent;color:var(--color-text-primary);cursor:pointer;border-radius:8px;transition:all .15s;width:100%;text-align:left}
	.track-row:hover{background:rgba(255,255,255,.04)}
	.track-row.playing{background:rgba(12,113,61,.12);border-left:3px solid var(--color-brand-400)}
	.track-num{width:28px;text-align:center;font-size:.8rem;color:var(--color-text-muted);flex-shrink:0}
	.track-info{flex:1;display:flex;flex-direction:column}
	.track-title{font-size:.9rem;font-weight:500}
	.track-row.playing .track-title{color:var(--color-brand-400)}
	.track-artist{font-size:.75rem;color:var(--color-text-muted)}
	.track-dur{font-size:.75rem;color:var(--color-text-muted)}
	.fav-btn{background:none;border:none;cursor:pointer;font-size:.9rem;padding:.15rem}

	/* Equalizer animation */
	.eq-bars{display:flex;align-items:flex-end;gap:2px;height:14px}
	.eq-bar{width:3px;background:var(--color-brand-400);border-radius:1px;animation:eq-bounce .6s ease-in-out infinite alternate}
	.eq-bar:nth-child(1){height:6px;animation-delay:0s}
	.eq-bar:nth-child(2){height:10px;animation-delay:.15s}
	.eq-bar:nth-child(3){height:4px;animation-delay:.3s}
	@keyframes eq-bounce{0%{transform:scaleY(0.4)}100%{transform:scaleY(1.2)}}

	/* Mini Player */
	.mini-player{position:fixed;bottom:0;left:0;right:0;background:rgba(10,10,18,.97);border-top:1px solid rgba(255,255,255,.08);backdrop-filter:blur(20px);display:flex;align-items:center;padding:.6rem 1.5rem;gap:1.25rem;z-index:100}
	.player-info{display:flex;align-items:center;gap:.7rem;min-width:180px;max-width:240px}
	.player-cover{width:44px;height:44px;border-radius:50%;object-fit:cover;box-shadow:0 2px 10px rgba(0,0,0,.4)}
	.player-cover-ph{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--color-surface-200),var(--color-surface-400));display:flex;align-items:center;justify-content:center;font-size:1.2rem}
	.spinning{animation:spin-cover 8s linear infinite}
	.spinning.paused,.player-cover-ph.paused{animation-play-state:paused}
	@keyframes spin-cover{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
	.player-meta{overflow:hidden}
	.player-title{font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.player-artist{font-size:.7rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

	.player-controls{display:flex;align-items:center;gap:.35rem;flex-shrink:0}
	.ctrl-btn{width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:var(--color-text-secondary);cursor:pointer;font-size:.8rem;display:flex;align-items:center;justify-content:center;transition:all .15s}
	.ctrl-btn:hover{color:var(--color-text-primary);background:rgba(255,255,255,.06)}
	.play-btn{width:38px;height:38px;border-radius:50%;border:none;background:var(--color-brand-500);color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;box-shadow:0 2px 8px rgba(12,113,61,.35)}
	.play-btn:hover{transform:scale(1.05);box-shadow:0 4px 16px rgba(12,113,61,.5)}

	.player-progress{flex:1;display:flex;align-items:center;gap:.5rem}
	.progress-bar{flex:1;appearance:none;height:4px;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;outline:none;transition:height .15s}
	.progress-bar:hover{height:6px}
	.progress-bar::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:var(--color-brand-400);cursor:pointer;box-shadow:0 0 4px rgba(12,113,61,.4)}
	.player-time{font-size:.7rem;color:var(--color-text-muted);min-width:36px;text-align:center;font-variant-numeric:tabular-nums}

	.player-volume{display:flex;align-items:center;gap:.35rem;min-width:100px;flex-shrink:0}
	.vol-icon{font-size:.75rem}
	.volume-bar{width:70px;appearance:none;height:3px;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;outline:none}
	.volume-bar::-webkit-slider-thumb{appearance:none;width:10px;height:10px;border-radius:50%;background:var(--color-text-secondary);cursor:pointer}

	@media (max-width:768px){
		.mini-player{flex-wrap:wrap;padding:.75rem 1rem;gap:.5rem}
		.player-info{min-width:auto;max-width:none;flex:1}
		.player-volume{display:none}
		.player-progress{order:10;flex-basis:100%}
	}
</style>
