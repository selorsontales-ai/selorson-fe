<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { isAuthenticated } from '$lib/stores/auth.svelte';

	let albums = $state<any[]>([]);
	let loading = $state(true);
	let currentTrack = $state<any>(null);
	let isPlaying = $state(false);
	let audio: HTMLAudioElement;
	let progress = $state(0);
	let duration = $state(0);
	let favorites = $state<Set<number>>(new Set());

	onMount(async () => {
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

	function playTrack(track: any, album: any) {
		if (currentTrack?.id === track.id) { togglePlay(); return; }
		currentTrack = { ...track, album };
		if (audio) { audio.pause(); }
		audio = new Audio(track.file_path);
		audio.addEventListener('timeupdate', () => { progress = audio.currentTime; duration = audio.duration || 0; });
		audio.addEventListener('ended', () => { isPlaying = false; });
		audio.play();
		isPlaying = true;
	}

	function togglePlay() {
		if (!audio) return;
		if (isPlaying) { audio.pause(); } else { audio.play(); }
		isPlaying = !isPlaying;
	}

	function seek(e: Event) {
		const input = e.target as HTMLInputElement;
		if (audio) audio.currentTime = Number(input.value);
	}

	async function toggleFavorite(trackId: number) {
		try {
			await api(`/music/tracks/${trackId}/favorite`, { method: 'POST' });
			if (favorites.has(trackId)) { favorites.delete(trackId); } else { favorites.add(trackId); }
			favorites = new Set(favorites);
		} catch {}
	}

	function formatTime(s: number) {
		if (!s || isNaN(s)) return '0:00';
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head><title>Nhạc — Selorson</title></svelte:head>

<section class="music-page">
	<div class="page-header">
		<h1 class="section-title">🎵 Nhạc</h1>
		<p class="page-sub">Soundtrack gốc thế giới Selorson</p>
	</div>

	{#if loading}
		<div class="loading">Đang tải...</div>
	{:else if albums.length === 0}
		<div class="empty"><span>🎵</span><h3>Chưa có album nào</h3></div>
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
						<span class="album-count">{album.tracks?.length || 0} bài hát</span>
					</div>
				</div>

				<div class="track-list">
					{#each album.tracks || [] as track, i}
						<div class="track-row" class:playing={currentTrack?.id === track.id} onclick={() => playTrack(track, album)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') playTrack(track, album); }}>
							<span class="track-num">{#if currentTrack?.id === track.id && isPlaying}🔊{:else}{i + 1}{/if}</span>
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

<!-- Mini Player -->
{#if currentTrack}
	<div class="mini-player">
		<div class="player-info">
			{#if currentTrack.album?.cover_image}
				<img src={currentTrack.album.cover_image} alt="" class="player-cover" />
			{/if}
			<div>
				<div class="player-title">{currentTrack.title}</div>
				<div class="player-artist">{currentTrack.artist}</div>
			</div>
		</div>
		<div class="player-controls">
			<button class="play-btn" onclick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
			<input type="range" class="progress-bar" min="0" max={duration} value={progress} oninput={seek} />
			<span class="player-time">{formatTime(progress)} / {formatTime(duration)}</span>
		</div>
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
	.album-cover{width:80px;height:80px;border-radius:12px;object-fit:cover;flex-shrink:0}
	.album-cover-ph{width:80px;height:80px;border-radius:12px;background:linear-gradient(135deg,var(--color-surface-200),var(--color-surface-400));display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0}
	.album-header h2{font-size:1.25rem;font-weight:700}
	.album-desc{font-size:.82rem;color:var(--color-text-muted);margin-top:.2rem}
	.album-count{font-size:.75rem;color:var(--color-text-muted)}

	.track-list{display:flex;flex-direction:column}
	.track-row{display:flex;align-items:center;gap:.75rem;padding:.65rem .75rem;border:none;background:transparent;color:var(--color-text-primary);cursor:pointer;border-radius:8px;transition:all .15s;width:100%;text-align:left}
	.track-row:hover{background:rgba(255,255,255,.04)}
	.track-row.playing{background:rgba(12,113,61,.1)}
	.track-num{width:24px;text-align:center;font-size:.8rem;color:var(--color-text-muted);flex-shrink:0}
	.track-info{flex:1;display:flex;flex-direction:column}
	.track-title{font-size:.9rem;font-weight:500}
	.track-artist{font-size:.75rem;color:var(--color-text-muted)}
	.track-dur{font-size:.75rem;color:var(--color-text-muted)}
	.fav-btn{background:none;border:none;cursor:pointer;font-size:.9rem;padding:.15rem}
	.fav-btn.faved{filter:none}

	/* Mini Player */
	.mini-player{position:fixed;bottom:0;left:0;right:0;background:rgba(14,14,22,.97);border-top:1px solid rgba(255,255,255,.06);backdrop-filter:blur(16px);display:flex;align-items:center;padding:.5rem 1.5rem;gap:1rem;z-index:100}
	.player-info{display:flex;align-items:center;gap:.65rem;min-width:200px}
	.player-cover{width:40px;height:40px;border-radius:6px;object-fit:cover}
	.player-title{font-size:.85rem;font-weight:600}
	.player-artist{font-size:.7rem;color:var(--color-text-muted)}
	.player-controls{flex:1;display:flex;align-items:center;gap:.75rem}
	.play-btn{width:36px;height:36px;border-radius:50%;border:none;background:var(--color-brand-500);color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}
	.progress-bar{flex:1;appearance:none;height:4px;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;outline:none}
	.progress-bar::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:var(--color-brand-400);cursor:pointer}
	.player-time{font-size:.7rem;color:var(--color-text-muted);min-width:80px;text-align:right}

	@media (max-width:600px){.mini-player{flex-direction:column;padding:.75rem}.player-info{min-width:auto}}
</style>
