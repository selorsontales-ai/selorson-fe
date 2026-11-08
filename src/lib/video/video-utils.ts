export interface VideoItem {
	id: number;
	video_name: string;
	video_path: string;
	description?: string | null;
	episode_number?: number | null;
	video_type: 'main' | 'side' | 'filler';
	is_featured: boolean;
	thumbnail_path?: string | null;
	display_order: number;
	completed?: boolean;
	last_position?: number;
}

export interface VideoProgressEntry {
	completed: boolean;
	last_position: number;
	updated_at?: string | null;
}

export function isDirectVideoSource(path: string): boolean {
	if (!path) return false;
	const clean = path.trim().split('?')[0].toLowerCase();
	if (
		clean.endsWith('.mp4') ||
		clean.endsWith('.webm') ||
		clean.endsWith('.ogg') ||
		clean.endsWith('.mov') ||
		clean.endsWith('.m4v')
	) {
		return true;
	}
	if (path.includes('/api/v1/local-media/')) {
		return true;
	}
	return false;
}

export function buildSafeEmbedUrl(path: string, autoplay = true): string {
	if (!path) return '';
	const trimmed = path.trim();
	if (isDirectVideoSource(trimmed)) return trimmed;

	let baseUrl = trimmed;

	// Convert YouTube watch / short / youtu.be URLs to /embed/
	if (!trimmed.includes('/embed/')) {
		const ytMatch = trimmed.match(
			/(?:youtube\.com\/(?:watch\?v=|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
		);
		if (ytMatch) {
			baseUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
		} else {
			const vimeoMatch = trimmed.match(/vimeo\.com\/(\d+)/);
			if (vimeoMatch && !trimmed.includes('player.vimeo.com')) {
				baseUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
			}
		}
	}

	if (!autoplay) return baseUrl;
	const separator = baseUrl.includes('?') ? '&' : '?';
	return `${baseUrl}${separator}autoplay=1&rel=0`;
}

export function resolveVideoThumbnail(video: {
	thumbnail_path?: string | null;
	video_path?: string | null;
}): string {
	if (video?.thumbnail_path) return video.thumbnail_path;
	const path = video?.video_path || '';
	const embedMatch = path.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
	if (embedMatch) return `https://img.youtube.com/vi/${embedMatch[1]}/mqdefault.jpg`;
	const ytMatch = path.match(
		/(?:youtube\.com\/(?:watch\?v=|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
	);
	if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
	return '';
}

export function pickInitialVideo<T extends VideoItem>(
	videos: T[],
	requestedEpId?: number | null,
	progressMap?: Record<number, VideoProgressEntry>
): T | null {
	if (!Array.isArray(videos) || videos.length === 0) return null;

	if (requestedEpId && requestedEpId > 0) {
		const byId = videos.find((v) => v.id === requestedEpId);
		if (byId) return byId;
	}

	// Prefer an in-progress episode (last_position > 0 and not completed)
	if (progressMap) {
		for (const v of videos) {
			const prog = progressMap[v.id];
			if (prog && !prog.completed && prog.last_position > 0) {
				return v;
			}
		}
	}

	// Prefer featured video
	const featured = videos.find((v) => v.is_featured);
	if (featured) return featured;

	// Prefer first main episode sorted by episode_number
	const mainEps = videos
		.filter((v) => v.video_type === 'main')
		.sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0));
	if (mainEps.length > 0) return mainEps[0];

	return videos[0];
}
