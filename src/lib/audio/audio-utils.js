/**
 * @typedef {'off' | 'all' | 'one'} RepeatMode
 */

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatAudioTime(seconds) {
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

/**
 * @param {any} raw
 * @param {any} [fallbackAlbum]
 */
export function normalizeTrack(raw, fallbackAlbum) {
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

/**
 * @param {number} currentIndex
 * @param {number} queueLength
 * @param {RepeatMode} repeatMode
 * @param {boolean} shuffle
 * @param {'next' | 'prev' | 'ended'} [direction]
 * @param {() => number} [randomFn]
 * @returns {number | null}
 */
export function computeNextQueueIndex(
	currentIndex,
	queueLength,
	repeatMode,
	shuffle,
	direction = 'next',
	randomFn = Math.random
) {
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

	if (currentIndex >= 0 && currentIndex < queueLength - 1) {
		return currentIndex + 1;
	}
	if (repeatMode === 'all' || (direction === 'next' && queueLength > 0 && repeatMode !== 'off')) {
		return 0;
	}
	return null;
}
