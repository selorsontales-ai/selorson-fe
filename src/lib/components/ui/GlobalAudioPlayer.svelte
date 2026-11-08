<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
		import {
		initAudioStore,
		bindAudioElement,
		playTrack,
		togglePlay,
		playNext,
		playPrev,
		seekTo,
		setVolume,
		toggleMute,
		cycleRepeatMode,
		toggleShuffle,
		setMinimized,
		toggleQueueDrawer,
		setQueueDrawerOpen,
		closeAudioPlayer,
		setSleepTimer,
		toggleFavoriteTrack,
		handleAudioTimeUpdate,
		handleAudioLoadedMetadata,
		handleAudioEnded,
		handleAudioPlayState,
		formatAudioTime,
		getCurrentTrack,
		getQueue,
		getIsPlaying,
		getAudioProgress,
		getAudioDuration,
		getAudioVolume,
		getIsMuted,
		getRepeatMode,
		getShuffle,
		getIsMinimized,
		getShowQueueDrawer,
		getFavorites,
		getSleepTimerRemainingSec
	} from '$lib/stores/audio.svelte';

	let audioEl = $state<HTMLAudioElement | null>(null);
	let showSleepMenu = $state(false);

	let track = $derived(getCurrentTrack());
	let queue = $derived(getQueue());
	let isPlaying = $derived(getIsPlaying());
	let progress = $derived(getAudioProgress());
	let duration = $derived(getAudioDuration());
	let volume = $derived(getAudioVolume());
	let isMuted = $derived(getIsMuted());
	let repeatMode = $derived(getRepeatMode());
	let shuffle = $derived(getShuffle());
	let isMinimized = $derived(getIsMinimized());
	let showQueueDrawer = $derived(getShowQueueDrawer());
	let favorites = $derived(getFavorites());
	let sleepRemaining = $derived(getSleepTimerRemainingSec());

	let isWorldRoute = $derived($page.url.pathname.startsWith('/world'));
	let effectiveMinimized = $derived(isMinimized || isWorldRoute);

	onMount(() => {
		initAudioStore();
	});

	$effect(() => {
		bindAudioElement(audioEl);
	});

	function getCover(t: any): string | null {
		return t?.cover_image || t?.album?.cover_image || null;
	}
</script>

<!-- Hidden persistent HTML5 Audio Engine -->
<audio
	bind:this={audioEl}
	preload="metadata"
	ontimeupdate={(e) => {
		const el = e.currentTarget as HTMLAudioElement;
		handleAudioTimeUpdate(el.currentTime, el.duration);
	}}
	onloadedmetadata={(e) => {
		const el = e.currentTarget as HTMLAudioElement;
		handleAudioLoadedMetadata(el.duration);
	}}
	onended={() => handleAudioEnded()}
	onplay={() => handleAudioPlayState(true)}
	onpause={() => handleAudioPlayState(false)}
></audio>

{#if track}
	{#if effectiveMinimized}
		<!-- Compact Floating Vinyl Pill -->
		<div class="audio-pill" role="region" aria-label={m.ui_minimized_audio_player()}>
			<button
				class="pill-disc-btn"
				onclick={() => togglePlay()}
				title={isPlaying ? m.world_pause() : m.ui_play_2()}
			>
				{#if getCover(track)}
					<img
						src={getCover(track)}
						alt={track.title}
						class="pill-cover spinning"
						class:paused={!isPlaying}
					/>
				{:else}
					<div class="pill-cover-ph spinning" class:paused={!isPlaying}>🎵</div>
				{/if}
				<span class="pill-play-badge">{isPlaying ? '⏸' : '▶'}</span>
			</button>

			<a href="/music?track={track.id}" class="pill-meta" title={m.ui_open_music_page()}>
				<span class="pill-title">{track.title}</span>
				<span class="pill-artist">{track.artist}</span>
			</a>

			<div class="pill-actions">
				<button class="pill-ctrl" onclick={() => playNext(false)} title={m.ui_next_track()}>⏭</button>
				{#if !isWorldRoute}
					<button
						class="pill-ctrl expand-btn"
						onclick={() => setMinimized(false)}
						title={m.ui_expand_audio_player()}
					>
						▴
					</button>
				{/if}
				<button class="pill-ctrl close-btn" onclick={() => closeAudioPlayer()} title={m.ui_close_player_2()}>
					✕
				</button>
			</div>
		</div>
	{:else}
		<!-- Expanded Floating Glass Dock -->
		<div class="audio-dock-wrapper" role="region" aria-label={m.ui_persistent_audio_player()}>
			{#if showQueueDrawer}
				<div class="queue-drawer">
					<div class="drawer-header">
						<div class="drawer-title">
							<span>📋 {m.ui_queue()} ({queue.length})</span>
							{#if sleepRemaining != null}
								<span class="sleep-badge">🌙 {m.ui_sleep_in()} {formatAudioTime(sleepRemaining)}</span>
							{/if}
						</div>
						<button class="drawer-close" onclick={() => setQueueDrawerOpen(false)}>✕</button>
					</div>
					<div class="drawer-list">
						{#each queue as item, idx (item.id + '-' + idx)}
							<button
								class="drawer-item"
								class:active={track.id === item.id}
								onclick={() => playTrack(item, queue, true)}
							>
								<span class="drawer-idx">
									{#if track.id === item.id && isPlaying}
										🔊
									{:else}
										{idx + 1}
									{/if}
								</span>
								<div class="drawer-meta">
									<span class="drawer-track-title">{item.title}</span>
									<span class="drawer-track-artist">
										{item.artist}{item.album_title ? ` • ${item.album_title}` : ''}
									</span>
								</div>
								{#if item.duration}
									<span class="drawer-dur">{formatAudioTime(item.duration)}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if showSleepMenu}
				<div class="sleep-popover">
					<span class="sleep-label">🌙 {m.ui_sleep_timer_3()}</span>
					<button
						class="sleep-opt"
						onclick={() => {
							setSleepTimer(15);
							showSleepMenu = false;
						}}>{m.ui_15_min()}</button
					>
					<button
						class="sleep-opt"
						onclick={() => {
							setSleepTimer(30);
							showSleepMenu = false;
						}}>{m.ui_30_min()}</button
					>
					<button
						class="sleep-opt"
						onclick={() => {
							setSleepTimer(60);
							showSleepMenu = false;
						}}>{m.ui_60_min()}</button
					>
					<button
						class="sleep-opt clear"
						onclick={() => {
							setSleepTimer(null);
							showSleepMenu = false;
						}}>{m.ui_off()}</button
					>
				</div>
			{/if}

			<div class="audio-dock">
				<!-- Track Info -->
				<div class="dock-info">
					<a href="/music?track={track.id}" class="dock-cover-link" title={m.ui_open_in_music_page()}>
						{#if getCover(track)}
							<img
								src={getCover(track)}
								alt={track.title}
								class="dock-cover spinning"
								class:paused={!isPlaying}
							/>
						{:else}
							<div class="dock-cover-ph spinning" class:paused={!isPlaying}>🎵</div>
						{/if}
					</a>
					<div class="dock-meta">
						<a href="/music?track={track.id}" class="dock-title" title={track.title}>
							{track.title}
						</a>
						<div class="dock-artist" title={track.artist}>
							{track.artist}
							{#if track.album_title || track.album?.title}
								<span class="dock-album">• {track.album_title || track.album?.title}</span>
							{/if}
						</div>
					</div>
					{#if isAuthenticated()}
						<button
							class="dock-fav-btn"
							class:faved={favorites.has(track.id)}
							onclick={() => toggleFavoriteTrack(track)}
							title={favorites.has(track.id) ? m.ui_remove_favorite() : m.ui_favorite()}
						>
							{favorites.has(track.id) ? '❤️' : '🤍'}
						</button>
					{/if}
				</div>

				<!-- Center Transport & Seek -->
				<div class="dock-center">
					<div class="dock-controls">
						<button
							class="ctrl-btn"
							class:active={shuffle}
							onclick={() => toggleShuffle()}
							title={shuffle ? m.ui_shuffle_on() : m.ui_enable_shuffle()}
						>
							🔀
						</button>
						<button class="ctrl-btn" onclick={() => playPrev()} title={m.ui_previous_track()}>⏮</button>
						<button
							class="play-main-btn"
							onclick={() => togglePlay()}
							title={isPlaying ? m.world_pause() : m.ui_play()}
						>
							{isPlaying ? '⏸' : '▶'}
						</button>
						<button class="ctrl-btn" onclick={() => playNext(false)} title={m.ui_next_track()}>⏭</button>
						<button
							class="ctrl-btn"
							class:active={repeatMode !== 'off'}
							onclick={() => cycleRepeatMode()}
							title={repeatMode === 'one'
								? m.ui_repeat_one()
								: repeatMode === 'all'
									? m.ui_repeat_all()
									: m.ui_repeat_off()}
						>
							{repeatMode === 'one' ? '🔂' : '🔁'}
						</button>
					</div>

					<div class="dock-progress">
						<span class="time-label">{formatAudioTime(progress)}</span>
						<input
							type="range"
							class="seek-slider"
							min="0"
							max={duration || track.duration || 100}
							step="0.2"
							value={progress}
							oninput={(e) => seekTo(Number((e.currentTarget as HTMLInputElement).value))}
							aria-label={m.ui_seek_bar()}
						/>
						<span class="time-label">{formatAudioTime(duration || track.duration || 0)}</span>
					</div>
				</div>

				<!-- Right Utilities -->
				<div class="dock-right">
					<div class="dock-volume">
						<button class="ctrl-btn" onclick={() => toggleMute()} title={m.ui_volume()}>
							{isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
						</button>
						<input
							type="range"
							class="vol-slider"
							min="0"
							max="1"
							step="0.01"
							value={isMuted ? 0 : volume}
							oninput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))}
							aria-label={m.ui_volume()}
						/>
					</div>

					<button
						class="ctrl-btn"
						class:active={sleepRemaining != null}
						onclick={() => (showSleepMenu = !showSleepMenu)}
						title={sleepRemaining != null
							? `${m.ui_sleep_timer_2()} ${formatAudioTime(sleepRemaining)}`
							: m.ui_sleep_timer()}
					>
						🌙
					</button>

					<button
						class="ctrl-btn"
						class:active={showQueueDrawer}
						onclick={() => toggleQueueDrawer()}
						title="{m.ui_queue()} ({queue.length})"
					>
						📋
					</button>

					<button class="ctrl-btn" onclick={() => setMinimized(true)} title={m.ui_minimize_to_vinyl_pill()}>
						▾
					</button>

					<button class="ctrl-btn close-btn" onclick={() => closeAudioPlayer()} title={m.ui_close_player()}>
						✕
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* ===== Floating Glass Dock ===== */
	.audio-dock-wrapper {
		position: fixed;
		bottom: 0.85rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(860px, calc(100vw - 11rem));
		z-index: 9980;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		pointer-events: none;
	}

	.audio-dock,
	.queue-drawer,
	.sleep-popover {
		pointer-events: auto;
	}

	.audio-dock {
		background: rgba(12, 14, 22, 0.94);
		border: 1px solid rgba(74, 222, 128, 0.22);
		border-radius: 18px;
		backdrop-filter: blur(22px);
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
		padding: 0.55rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	:global(html[data-theme='light']) .audio-dock {
		background: rgba(15, 23, 42, 0.95);
		color: #fff;
	}

	.dock-info {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 180px;
		max-width: 240px;
		flex-shrink: 0;
	}

	.dock-cover-link {
		flex-shrink: 0;
		text-decoration: none;
	}

	.dock-cover,
	.dock-cover-ph {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(74, 222, 128, 0.35);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
	}

	.dock-cover-ph {
		background: linear-gradient(135deg, #0c713d, #06b6d4);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.15rem;
	}

	.spinning {
		animation: spin-disc 9s linear infinite;
	}
	.spinning.paused {
		animation-play-state: paused;
	}
	@keyframes spin-disc {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.dock-meta {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.dock-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: #fff;
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dock-title:hover {
		color: #4ade80;
	}

	.dock-artist {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.65);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dock-album {
		color: rgba(74, 222, 128, 0.8);
	}

	.dock-fav-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem;
		flex-shrink: 0;
		transition: transform 0.15s;
	}
	.dock-fav-btn:hover {
		transform: scale(1.18);
	}

	/* Center controls */
	.dock-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-width: 200px;
	}

	.dock-controls {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.ctrl-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: rgba(255, 255, 255, 0.75);
		cursor: pointer;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}
	.ctrl-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}
	.ctrl-btn.active {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.14);
	}
	.ctrl-btn.close-btn:hover {
		color: #f87171;
		background: rgba(239, 68, 68, 0.15);
	}

	.play-main-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		background: linear-gradient(135deg, #0c713d, #10b981);
		color: #fff;
		cursor: pointer;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4);
		transition: transform 0.15s;
	}
	.play-main-btn:hover {
		transform: scale(1.06);
	}

	.dock-progress {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.time-label {
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.6);
		min-width: 32px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.seek-slider {
		flex: 1;
		appearance: none;
		height: 4px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		cursor: pointer;
		outline: none;
	}
	.seek-slider::-webkit-slider-thumb {
		appearance: none;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #4ade80;
		cursor: pointer;
	}

	.dock-right {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.dock-volume {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.vol-slider {
		width: 62px;
		appearance: none;
		height: 3px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		cursor: pointer;
		outline: none;
	}
	.vol-slider::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #e2e8f0;
		cursor: pointer;
	}

	/* Queue Drawer */
	.queue-drawer {
		background: rgba(12, 14, 22, 0.96);
		border: 1px solid rgba(74, 222, 128, 0.22);
		border-radius: 16px;
		backdrop-filter: blur(22px);
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
		max-height: 260px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.82rem;
		font-weight: 700;
		color: #fff;
	}

	.drawer-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.sleep-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(74, 222, 128, 0.15);
		color: #4ade80;
	}

	.drawer-close {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.drawer-list {
		overflow-y: auto;
		padding: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.drawer-item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.45rem 0.65rem;
		border: none;
		background: transparent;
		color: rgba(255, 255, 255, 0.85);
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}
	.drawer-item:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.drawer-item.active {
		background: rgba(12, 113, 61, 0.22);
		color: #4ade80;
	}

	.drawer-idx {
		width: 22px;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	.drawer-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.drawer-track-title {
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.drawer-track-artist {
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.55);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.drawer-dur {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Sleep Popover */
	.sleep-popover {
		align-self: flex-end;
		background: rgba(12, 14, 22, 0.96);
		border: 1px solid rgba(74, 222, 128, 0.25);
		border-radius: 12px;
		padding: 0.45rem 0.65rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		max-width: 100%;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
	}
	.sleep-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.8);
	}
	.sleep-opt {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #fff;
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.sleep-opt:hover {
		background: rgba(74, 222, 128, 0.2);
		border-color: #4ade80;
	}
	.sleep-opt.clear {
		color: #fca5a5;
	}

	/* ===== Compact Floating Vinyl Pill ===== */
	.audio-pill {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		z-index: 9980;
		background: rgba(12, 14, 22, 0.94);
		border: 1px solid rgba(74, 222, 128, 0.3);
		border-radius: 999px;
		padding: 0.35rem 0.65rem 0.35rem 0.35rem;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		backdrop-filter: blur(18px);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		max-width: min(320px, calc(100vw - 6rem));
	}

	.pill-disc-btn {
		position: relative;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}

	.pill-cover,
	.pill-cover-ph {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #4ade80;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0c713d;
		color: #fff;
	}

	.pill-play-badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #0c713d;
		color: #fff;
		font-size: 0.55rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.4);
	}

	.pill-meta {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		text-decoration: none;
	}
	.pill-title {
		font-size: 0.78rem;
		font-weight: 700;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pill-artist {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.65);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pill-actions {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}
	.pill-ctrl {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		font-size: 0.72rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pill-ctrl:hover {
		background: rgba(74, 222, 128, 0.25);
	}

	@media (max-width: 900px) {
		.audio-dock-wrapper {
			left: 0.75rem;
			right: 5rem;
			transform: none;
			width: auto;
		}
		.dock-volume {
			display: none;
		}
		.dock-info {
			min-width: 120px;
			max-width: 160px;
		}
	}

	@media (max-width: 600px) {
		.audio-dock-wrapper {
			left: 0.65rem;
			right: 4.5rem;
			bottom: 0.75rem;
		}
		.audio-dock {
			flex-wrap: wrap;
			padding: 0.5rem 0.75rem;
			gap: 0.4rem;
		}
		.dock-info {
			max-width: none;
			flex: 1;
		}
		.dock-center {
			order: 3;
			flex-basis: 100%;
		}
		.audio-pill {
			bottom: 0.85rem;
			left: 0.65rem;
			max-width: calc(100vw - 5.25rem);
		}
	}
</style>
