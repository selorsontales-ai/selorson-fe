import { api } from '$lib/api';
import { isAuthenticated } from '$lib/stores/auth.svelte';

export type RepeatMode = 'off' | 'all' | 'one';

export interface AudioTrack {
	id: number;
	album_id?: number;
	title: string;
	artist: string;
	file_path: string;
	duration?: number | null;
	track_number?: number;
	album_title?: string | null;
	cover_image?: string | null;
	album?: {
		id: number;
		title: string;
		cover_image?: string | null;
		description?: string | null;
	} | null;
}

export interface AudioAlbum {
	id: number;
	title: string;
	description?: string | null;
	cover_image?: string | null;
	display_order?: number;
	tracks: AudioTrack[];
}

const AUDIO_STORAGE_KEY = 'selorson_audio_state_v1';

// ─── Pure Helpers (Exported for Runtime Tests & UI) ───

export function formatAudioTime(seconds: number): string {
	if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const hrs = Math.floor(total / 3600);
	const min = Math.floor((total % 3600) / 60);
	const sec = total % 60;
	if (hrs > 0) {
		return `${hrs}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
	}
	return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function normalizeTrack(raw: any, fallbackAlbum?: any): AudioTrack {
	const albumObj =
		raw?.album && typeof raw.album === 'object'
			? raw.album
			: fallbackAlbum && typeof fallbackAlbum === 'object'
				? {
						id: Number(fallbackAlbum.id || 0),
						title: String(fallbackAlbum.title || ''),
						cover_image: fallbackAlbum.cover_image ?? null,
						description: fallbackAlbum.description ?? null
					}
				: null;

	const albumId = Number(raw?.album_id ?? albumObj?.id ?? 0) || undefined;
	const albumTitle = raw?.album_title ?? albumObj?.title ?? null;
	const coverImage = raw?.cover_image ?? albumObj?.cover_image ?? null;

	return {
		id: Number(raw?.id || 0),
		album_id: albumId,
		title: String(raw?.title || 'Bản nhạc không tên'),
		artist: String(raw?.artist || 'Selorson OST'),
		file_path: String(raw?.file_path || ''),
		duration: raw?.duration != null ? Number(raw.duration) : null,
		track_number: raw?.track_number != null ? Number(raw.track_number) : undefined,
		album_title: albumTitle,
		cover_image: coverImage,
		album: albumObj
			? {
					id: Number(albumObj.id || albumId || 0),
					title: String(albumObj.title || albumTitle || ''),
					cover_image: albumObj.cover_image ?? coverImage ?? null,
					description: albumObj.description ?? null
				}
			: albumTitle || coverImage
				? {
						id: Number(albumId || 0),
						title: String(albumTitle || ''),
						cover_image: coverImage
					}
				: null
	};
}

export function computeNextQueueIndex(
	currentIndex: number,
	queueLength: number,
	repeatMode: RepeatMode,
	shuffle: boolean,
	direction: 'next' | 'prev' | 'ended' = 'next',
	randomFn: () => number = Math.random
): number | null {
	if (queueLength <= 0) return null;
	if (direction === 'ended' && repeatMode === 'one') {
		return currentIndex >= 0 && currentIndex < queueLength ? currentIndex : 0;
	}

	if (shuffle && queueLength > 1 && (direction === 'next' || direction === 'ended')) {
		let candidate = Math.floor(randomFn() * queueLength);
		if (candidate === currentIndex) {
			candidate = (currentIndex + 1) % queueLength;
		}
		return candidate;
	}

	if (direction === 'prev') {
		if (currentIndex > 0) return currentIndex - 1;
		return repeatMode === 'all' ? queueLength - 1 : 0;
	}

	// 'next' or 'ended'
	if (currentIndex >= 0 && currentIndex < queueLength - 1) {
		return currentIndex + 1;
	}
	if (repeatMode === 'all' || (direction === 'next' && queueLength > 0 && repeatMode !== 'off')) {
		return 0;
	}
	return null;
}

// ─── Global Reactive State ───

let albums = $state<AudioAlbum[]>([]);
let favorites = $state<Set<number>>(new Set());
let favoriteTracksList = $state<AudioTrack[]>([]);
let currentTrack = $state<AudioTrack | null>(null);
let queue = $state<AudioTrack[]>([]);
let isPlaying = $state(false);
let progress = $state(0);
let duration = $state(0);
let volume = $state(0.8);
let isMuted = $state(false);
let repeatMode = $state<RepeatMode>('all');
let shuffle = $state(false);
let isMinimized = $state(false);
let showQueueDrawer = $state(false);
let loadingCatalog = $state(false);
let catalogLoaded = $state(false);
let sleepTimerRemainingSec = $state<number | null>(null);

let audioEl: HTMLAudioElement | null = null;
let sleepIntervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function persistAudioState() {
	if (typeof localStorage === 'undefined') return;
	try {
		const payload = {
			volume,
			isMuted,
			repeatMode,
			shuffle,
			isMinimized,
			currentTrack,
			queue: queue.slice(0, 60)
		};
		localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(payload));
	} catch {}
}

function updateMediaSession() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentTrack) return;
	try {
		const cover = currentTrack.cover_image || currentTrack.album?.cover_image;
		navigator.mediaSession.metadata = new MediaMetadata({
			title: currentTrack.title,
			artist: currentTrack.artist || 'Selorson',
			album: currentTrack.album_title || currentTrack.album?.title || 'Selorson OST',
			artwork: cover ? [{ src: cover, sizes: '512x512', type: 'image/webp' }] : []
		});
		navigator.mediaSession.setActionHandler('play', () => {
			if (!isPlaying) togglePlay();
		});
		navigator.mediaSession.setActionHandler('pause', () => {
			if (isPlaying) togglePlay();
		});
		navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
		navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
		navigator.mediaSession.setActionHandler('seekto', (details) => {
			if (details.seekTime != null) seekTo(details.seekTime);
		});
	} catch {}
}

export function initAudioStore() {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;
	try {
		const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (typeof parsed.volume === 'number') {
				volume = Math.max(0, Math.min(1, parsed.volume));
			}
			if (typeof parsed.isMuted === 'boolean') {
				isMuted = parsed.isMuted;
			}
			if (parsed.repeatMode === 'off' || parsed.repeatMode === 'all' || parsed.repeatMode === 'one') {
				repeatMode = parsed.repeatMode;
			}
			if (typeof parsed.shuffle === 'boolean') {
				shuffle = parsed.shuffle;
			}
			if (typeof parsed.isMinimized === 'boolean') {
				isMinimized = parsed.isMinimized;
			}
		}
	} catch {}
}

export function bindAudioElement(el: HTMLAudioElement | null) {
	audioEl = el;
	if (audioEl) {
		audioEl.volume = isMuted ? 0 : volume;
		audioEl.muted = isMuted;
	}
}

export async function ensureMusicCatalogLoaded(force = false): Promise<AudioAlbum[]> {
	if (catalogLoaded && !force && albums.length > 0) {
		return albums;
	}
	loadingCatalog = true;
	try {
		const res = await api<any>('/music/albums');
		const rawAlbums = Array.isArray(res?.data) ? res.data : [];
		albums = rawAlbums.map((alb: any) => ({
			id: Number(alb.id),
			title: String(alb.title || ''),
			description: alb.description ?? null,
			cover_image: alb.cover_image ?? null,
			display_order: alb.display_order ?? 0,
			tracks: Array.isArray(alb.tracks)
				? alb.tracks
						.filter((t: any) => t && t.file_path)
						.map((t: any) => normalizeTrack(t, alb))
				: []
		}));
		catalogLoaded = true;
	} catch {
		if (!catalogLoaded) albums = [];
	} finally {
		loadingCatalog = false;
	}
	return albums;
}

export async function loadFavorites(): Promise<Set<number>> {
	if (!isAuthenticated()) {
		favorites = new Set();
		favoriteTracksList = [];
		return favorites;
	}
	try {
		const res = await api<any>('/music/favorites');
		const list = Array.isArray(res?.data) ? res.data : [];
		favoriteTracksList = list.map((t: any) => normalizeTrack(t));
		favorites = new Set(favoriteTracksList.map((t) => t.id));
	} catch {}
	return favorites;
}

export function getAllCatalogTracks(): AudioTrack[] {
	const all: AudioTrack[] = [];
	for (const alb of albums) {
		for (const tr of alb.tracks || []) {
			if (tr.file_path) all.push(tr);
		}
	}
	return all;
}

export function playTrack(
	rawTrack: any,
	albumOrQueue?: AudioAlbum | AudioTrack[] | null,
	autoStart = true
) {
	if (!rawTrack) return;
	const fallbackAlbum =
		albumOrQueue && !Array.isArray(albumOrQueue) ? albumOrQueue : undefined;
	const normalized = normalizeTrack(rawTrack, fallbackAlbum);
	if (!normalized.file_path) return;

	if (currentTrack?.id === normalized.id && audioEl && audioEl.src) {
		if (autoStart) {
			togglePlay();
		}
		return;
	}

	// Build queue
	if (Array.isArray(albumOrQueue) && albumOrQueue.length > 0) {
		queue = albumOrQueue.map((t) => normalizeTrack(t));
	} else if (fallbackAlbum && Array.isArray(fallbackAlbum.tracks) && fallbackAlbum.tracks.length > 0) {
		queue = fallbackAlbum.tracks.map((t) => normalizeTrack(t, fallbackAlbum));
	} else if (queue.length === 0 || !queue.some((t) => t.id === normalized.id)) {
		const catalogTracks = getAllCatalogTracks();
		queue = catalogTracks.length > 0 ? catalogTracks : [normalized];
	}

	currentTrack = normalized;
	progress = 0;
	duration = normalized.duration || 0;
	persistAudioState();
	updateMediaSession();

	if (audioEl) {
		audioEl.src = normalized.file_path;
		audioEl.volume = isMuted ? 0 : volume;
		audioEl.muted = isMuted;
		if (autoStart) {
			isPlaying = true;
			audioEl.play().catch(() => {
				isPlaying = false;
			});
		} else {
			isPlaying = false;
		}
	} else {
		isPlaying = autoStart;
	}
}

export function playAlbum(album: AudioAlbum, startShuffled = false) {
	if (!album?.tracks?.length) return;
	const list = album.tracks.map((t) => normalizeTrack(t, album));
	shuffle = startShuffled;
	const firstIdx = startShuffled ? Math.floor(Math.random() * list.length) : 0;
	playTrack(list[firstIdx], list, true);
}

export function togglePlay() {
	if (!currentTrack) return;
	if (!audioEl) {
		isPlaying = !isPlaying;
		return;
	}
	if (!audioEl.src && currentTrack.file_path) {
		audioEl.src = currentTrack.file_path;
	}
	if (audioEl.paused) {
		audioEl.play().then(() => {
			isPlaying = true;
		}).catch(() => {
			isPlaying = false;
		});
	} else {
		audioEl.pause();
		isPlaying = false;
	}
}

export function pauseForExternalMedia() {
	if (audioEl && !audioEl.paused) {
		audioEl.pause();
	}
	isPlaying = false;
}

export function playNext(fromEnded = false) {
	if (!currentTrack || queue.length === 0) return;
	if (fromEnded && repeatMode === 'one' && audioEl) {
		audioEl.currentTime = 0;
		audioEl.play().catch(() => {
			isPlaying = false;
		});
		return;
	}
	const idx = queue.findIndex((t) => t.id === currentTrack?.id);
	const nextIdx = computeNextQueueIndex(
		idx,
		queue.length,
		repeatMode,
		shuffle,
		fromEnded ? 'ended' : 'next'
	);
	if (nextIdx != null && queue[nextIdx]) {
		const nextTrack = queue[nextIdx];
		if (nextTrack.id === currentTrack.id && audioEl) {
			audioEl.currentTime = 0;
			audioEl.play().catch(() => {});
		} else {
			playTrack(nextTrack, queue, true);
		}
	} else {
		isPlaying = false;
	}
}

export function playPrev() {
	if (!currentTrack || queue.length === 0) return;
	// Nếu bài hát đã chạy quá 4 giây, bấm Prev sẽ tua về đầu bài
	if (audioEl && audioEl.currentTime > 4) {
		audioEl.currentTime = 0;
		progress = 0;
		return;
	}
	const idx = queue.findIndex((t) => t.id === currentTrack?.id);
	const prevIdx = computeNextQueueIndex(idx, queue.length, repeatMode, shuffle, 'prev');
	if (prevIdx != null && queue[prevIdx]) {
		playTrack(queue[prevIdx], queue, true);
	}
}

export function seekTo(seconds: number) {
	const clamped = Math.max(0, Number(seconds) || 0);
	progress = clamped;
	if (audioEl) {
		audioEl.currentTime = clamped;
	}
}

export function setVolume(nextVol: number) {
	const clamped = Math.max(0, Math.min(1, Number(nextVol) || 0));
	volume = clamped;
	if (clamped > 0 && isMuted) {
		isMuted = false;
	}
	if (audioEl) {
		audioEl.muted = isMuted;
		audioEl.volume = isMuted ? 0 : volume;
	}
	persistAudioState();
}

export function toggleMute() {
	isMuted = !isMuted;
	if (audioEl) {
		audioEl.muted = isMuted;
		audioEl.volume = isMuted ? 0 : volume;
	}
	persistAudioState();
}

export function cycleRepeatMode() {
	if (repeatMode === 'off') repeatMode = 'all';
	else if (repeatMode === 'all') repeatMode = 'one';
	else repeatMode = 'off';
	persistAudioState();
}

export function toggleShuffle() {
	shuffle = !shuffle;
	persistAudioState();
}

export function setMinimized(val: boolean) {
	isMinimized = val;
	if (val) showQueueDrawer = false;
	persistAudioState();
}

export function toggleMinimized() {
	setMinimized(!isMinimized);
}

export function setQueueDrawerOpen(val: boolean) {
	showQueueDrawer = val;
}

export function toggleQueueDrawer() {
	showQueueDrawer = !showQueueDrawer;
}

export function closeAudioPlayer() {
	if (audioEl) {
		try {
			audioEl.pause();
			audioEl.removeAttribute('src');
		} catch {}
	}
	isPlaying = false;
	currentTrack = null;
	showQueueDrawer = false;
	setSleepTimer(null);
	persistAudioState();
}

export function setSleepTimer(minutes: number | null) {
	if (sleepIntervalId) {
		clearInterval(sleepIntervalId);
		sleepIntervalId = null;
	}
	if (!minutes || minutes <= 0) {
		sleepTimerRemainingSec = null;
		return;
	}
	sleepTimerRemainingSec = Math.round(minutes * 60);
	sleepIntervalId = setInterval(() => {
		if (sleepTimerRemainingSec == null) return;
		if (sleepTimerRemainingSec <= 1) {
			sleepTimerRemainingSec = null;
			if (sleepIntervalId) {
				clearInterval(sleepIntervalId);
				sleepIntervalId = null;
			}
			pauseForExternalMedia();
		} else {
			sleepTimerRemainingSec -= 1;
		}
	}, 1000);
}

export async function toggleFavoriteTrack(trackInput: AudioTrack | number) {
	if (!isAuthenticated()) return;
	const trackId = typeof trackInput === 'number' ? trackInput : Number(trackInput?.id || 0);
	if (!trackId) return;
	try {
		await api(`/music/tracks/${trackId}/favorite`, { method: 'POST' });
		const nextSet = new Set(favorites);
		if (nextSet.has(trackId)) {
			nextSet.delete(trackId);
			favoriteTracksList = favoriteTracksList.filter((t) => t.id !== trackId);
		} else {
			nextSet.add(trackId);
			if (typeof trackInput === 'object' && trackInput) {
				const norm = normalizeTrack(trackInput);
				if (!favoriteTracksList.some((t) => t.id === norm.id)) {
					favoriteTracksList = [norm, ...favoriteTracksList];
				}
			}
		}
		favorites = nextSet;
	} catch {}
}

export async function quickToggleReaderMusic(): Promise<boolean> {
	if (currentTrack) {
		togglePlay();
		return true;
	}
	await ensureMusicCatalogLoaded();
	const allTracks = getAllCatalogTracks();
	if (allTracks.length === 0) {
		return false;
	}
	playTrack(allTracks[0], allTracks, true);
	return true;
}

// ─── Audio Element Event Handlers ───

export function handleAudioTimeUpdate(currentTime: number, totalDuration: number) {
	progress = Number.isFinite(currentTime) ? currentTime : 0;
	if (Number.isFinite(totalDuration) && totalDuration > 0) {
		duration = totalDuration;
	}
}

export function handleAudioLoadedMetadata(totalDuration: number) {
	if (Number.isFinite(totalDuration) && totalDuration > 0) {
		duration = totalDuration;
	}
}

export function handleAudioEnded() {
	playNext(true);
}

export function handleAudioPlayState(playing: boolean) {
	isPlaying = playing;
}

// ─── Getters ───

export function getAlbums() {
	return albums;
}
export function getFavorites() {
	return favorites;
}
export function getFavoriteTracksList() {
	return favoriteTracksList;
}
export function getCurrentTrack() {
	return currentTrack;
}
export function getQueue() {
	return queue;
}
export function getIsPlaying() {
	return isPlaying;
}
export function getAudioProgress() {
	return progress;
}
export function getAudioDuration() {
	return duration;
}
export function getAudioVolume() {
	return volume;
}
export function getIsMuted() {
	return isMuted;
}
export function getRepeatMode() {
	return repeatMode;
}
export function getShuffle() {
	return shuffle;
}
export function getIsMinimized() {
	return isMinimized;
}
export function getShowQueueDrawer() {
	return showQueueDrawer;
}
export function getLoadingCatalog() {
	return loadingCatalog;
}
export function getSleepTimerRemainingSec() {
	return sleepTimerRemainingSec;
}
