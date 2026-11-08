/**
 * Pure helper functions for Hạng mục 6 (Homepage Immersion & Reader Hub)
 * and Hạng mục 7 (Admin Publish Queue & Batch Moderation).
 */
import * as m from '../paraglide/messages.js';

export interface HomepageChapterCard {
	id: number;
	title: string;
	chapter_number: number;
	author_note?: string | null;
	excerpt?: string | null;
	status?: string;
	has_manga?: boolean;
	manga_meta?: {
		reading_mode?: string;
		color_count?: number;
		bw_count?: number;
		total_pages?: number;
	} | null;
	word_count?: number;
	reading_time_min?: number;
	created_at?: string;
	updated_at?: string;
}

export interface FeaturedLoreCard {
	id: number;
	name: string;
	category: string;
	description?: string | null;
	image_url?: string | null;
	image_ratio?: string | null;
	aliases?: string[];
	role?: string | null;
	first_chapter?: number | null;
	has_3d_location?: boolean;
	world_focus_id?: number | null;
	world_target_url?: string | null;
}

export interface ServerUserHub {
	continue_reading?: {
		chapter_id: number;
		chapter_number: number;
		title: string;
		last_position: number;
		is_completed?: boolean;
		has_manga?: boolean;
		updated_at?: string;
		chapters_read_count?: number;
		next_chapter?: {
			id: number;
			chapter_number: number;
			title: string;
			has_manga?: boolean;
		} | null;
	} | null;
	continue_watching?: {
		video_id: number;
		video_name: string;
		episode_number?: number | null;
		thumbnail_path?: string | null;
		last_position: number;
		completed?: boolean;
		updated_at?: string;
	} | null;
	world_progress?: {
		visited_count: number;
		total_locations: number;
		latest_location?: {
			id: number;
			name?: string;
			title?: string;
		} | null;
	} | null;
}

export interface LocalGuestSnapshot {
	reading?: {
		chapter_number: number;
		title?: string;
		percent: number;
		mode?: 'text' | 'manga';
		has_manga?: boolean;
	} | null;
	watching?: {
		video_id: number;
		video_name?: string;
		position_sec: number;
	} | null;
	visitedLocationIds?: number[];
}

export interface ResolvedReaderHub {
	hasPersonalProgress: boolean;
	reading: {
		badge: string;
		title: string;
		subtitle: string;
		href: string;
		percent: number;
		hasManga: boolean;
		mangaHref: string | null;
		isCompleted: boolean;
	};
	world: {
		visitedCount: number;
		totalLocations: number;
		percent: number;
		latestLocationName: string | null;
		href: string;
	};
	watching: {
		videoId: number;
		videoName: string;
		positionSec: number;
		href: string;
	} | null;
}

const LORE_CATEGORY_GETTERS: Record<
	string,
	{ label: (opts: { locale: 'vi' | 'en' }) => string; icon: string }
> = {
	character: { label: (opts) => m.cat_character({}, opts), icon: '👤' },
	location: { label: (opts) => m.cat_location({}, opts), icon: '🗺️' },
	item: { label: (opts) => m.cat_relic_weapon({}, opts), icon: '⚔️' },
	faction: { label: (opts) => m.cat_faction({}, opts), icon: '🏛️' },
	creature: { label: (opts) => m.cat_creature({}, opts), icon: '🐉' },
	magic: { label: (opts) => m.cat_magic_skill({}, opts), icon: '✨' },
	skill: { label: (opts) => m.cat_magic_skill({}, opts), icon: '✨' },
	event: { label: (opts) => m.cat_major_event({}, opts), icon: '⏳' },
	concept: { label: (opts) => m.cat_world_law({}, opts), icon: '🔮' },
	lore: { label: (opts) => m.cat_ancient_lore({}, opts), icon: '📜' }
};

export function formatCategoryMeta(
	category?: string | null,
	locale: string = 'vi'
): { label: string; icon: string } {
	const key = String(category || 'lore').trim().toLowerCase();
	const opts = { locale: (locale === 'en' ? 'en' : 'vi') as 'vi' | 'en' };
	const found = LORE_CATEGORY_GETTERS[key];
	if (found) {
		return {
			label: found.label(opts),
			icon: found.icon
		};
	}
	return { label: category || m.cat_library_default({}, opts), icon: '📜' };
}

export function resolveLoreLinks(item: FeaturedLoreCard): {
	libraryHref: string;
	worldHref: string | null;
} {
	const libraryHref = `/library?id=${encodeURIComponent(String(item.id))}`;
	if (item.world_target_url && item.has_3d_location) {
		return { libraryHref, worldHref: item.world_target_url };
	}
	const focusId = item.world_focus_id ?? (item.has_3d_location ? item.id : null);
	const worldHref = focusId ? `/world?focus=${encodeURIComponent(String(focusId))}` : null;
	return { libraryHref, worldHref };
}

export function resolveReaderHub(
	serverHub: ServerUserHub | null | undefined,
	latestChapters: HomepageChapterCard[],
	totalWorldLocations = 0,
	guest?: LocalGuestSnapshot | null,
	locale: string = 'vi'
): ResolvedReaderHub {
	const opts = { locale: (locale === 'en' ? 'en' : 'vi') as 'vi' | 'en' };
	const srvRead = serverHub?.continue_reading ?? null;
	const guestRead = guest?.reading ?? null;

	// Determine earliest or latest chapter fallback
	const sortedAsc = [...latestChapters].sort(
		(a, b) => Number(a.chapter_number || 0) - Number(b.chapter_number || 0)
	);
	const firstChapter = sortedAsc[0] || null;

	let reading: ResolvedReaderHub['reading'];
	let hasReadingProgress = false;

	if (srvRead) {
		hasReadingProgress = true;
		const pct = Math.max(0, Math.min(100, Math.round(Number(srvRead.last_position || 0))));
		if (srvRead.is_completed && srvRead.next_chapter) {
			const nxt = srvRead.next_chapter;
			reading = {
				badge: m.hub_completed_next_badge({ num: srvRead.chapter_number }, opts),
				title: m.hub_chapter_title({ num: nxt.chapter_number, title: nxt.title }, opts),
				subtitle: m.hub_read_count_sub({ count: srvRead.chapters_read_count ?? 1 }, opts),
				href: `/stories/${nxt.chapter_number}`,
				percent: 100,
				hasManga: Boolean(nxt.has_manga),
				mangaHref: nxt.has_manga ? `/stories/${nxt.chapter_number}?mode=manga` : null,
				isCompleted: true
			};
		} else {
			reading = {
				badge:
					pct >= 95
						? m.hub_latest_done_badge({}, opts)
						: m.hub_continue_badge({ pct }, opts),
				title: m.hub_chapter_title({ num: srvRead.chapter_number, title: srvRead.title }, opts),
				subtitle:
					pct >= 95
						? m.hub_completed_count_sub({ count: srvRead.chapters_read_count ?? 1 }, opts)
						: m.hub_paused_sub({ pct }, opts),
				href: `/stories/${srvRead.chapter_number}`,
				percent: pct,
				hasManga: Boolean(srvRead.has_manga),
				mangaHref: srvRead.has_manga ? `/stories/${srvRead.chapter_number}?mode=manga` : null,
				isCompleted: pct >= 95
			};
		}
	} else if (guestRead && guestRead.chapter_number > 0) {
		hasReadingProgress = true;
		const pct = Math.max(0, Math.min(100, Math.round(Number(guestRead.percent || 0))));
		const matched = latestChapters.find(
			(c) => Number(c.chapter_number) === Number(guestRead.chapter_number)
		);
		const title =
			guestRead.title ||
			matched?.title ||
			m.hub_chapter_fallback({ num: guestRead.chapter_number }, opts);
		const hasManga = Boolean(guestRead.has_manga ?? matched?.has_manga);
		reading = {
			badge: m.hub_continue_device_badge({ pct }, opts),
			title: m.hub_chapter_title({ num: guestRead.chapter_number, title }, opts),
			subtitle:
				guestRead.mode === 'manga'
					? m.hub_manga_mode_sub({}, opts)
					: m.hub_paused_sub({ pct }, opts),
			href:
				guestRead.mode === 'manga'
					? `/stories/${guestRead.chapter_number}?mode=manga`
					: `/stories/${guestRead.chapter_number}`,
			percent: pct,
			hasManga,
			mangaHref: hasManga ? `/stories/${guestRead.chapter_number}?mode=manga` : null,
			isCompleted: pct >= 95
		};
	} else if (firstChapter) {
		reading = {
			badge: m.hub_begin_epic_badge({}, opts),
			title: m.hub_chapter_title(
				{ num: firstChapter.chapter_number, title: firstChapter.title },
				opts
			),
			subtitle: firstChapter.excerpt || m.hub_begin_epic_sub({}, opts),
			href: `/stories/${firstChapter.chapter_number}`,
			percent: 0,
			hasManga: Boolean(firstChapter.has_manga),
			mangaHref: firstChapter.has_manga
				? `/stories/${firstChapter.chapter_number}?mode=manga`
				: null,
			isCompleted: false
		};
	} else {
		reading = {
			badge: m.hub_begin_epic_badge({}, opts),
			title: m.hub_explore_title({}, opts),
			subtitle: m.hub_explore_sub({}, opts),
			href: '/stories',
			percent: 0,
			hasManga: false,
			mangaHref: null,
			isCompleted: false
		};
	}

	// World progress
	const srvWorld = serverHub?.world_progress ?? null;
	const visitedCount = srvWorld
		? Number(srvWorld.visited_count || 0)
		: (guest?.visitedLocationIds?.length ?? 0);
	const totalLocations = Math.max(
		Number(srvWorld?.total_locations || 0),
		Number(totalWorldLocations || 0)
	);
	const worldPercent =
		totalLocations > 0
			? Math.max(0, Math.min(100, Math.round((visitedCount / totalLocations) * 100)))
			: 0;
	const latestLoc = srvWorld?.latest_location ?? null;
	const latestLocationName = latestLoc?.name || latestLoc?.title || null;
	const worldHref = latestLoc?.id ? `/world?focus=${latestLoc.id}` : '/world';

	// Watching progress
	const srvWatch = serverHub?.continue_watching ?? null;
	const guestWatch = guest?.watching ?? null;
	let watching: ResolvedReaderHub['watching'] = null;
	if (srvWatch && srvWatch.video_id) {
		watching = {
			videoId: srvWatch.video_id,
			videoName: srvWatch.video_name,
			positionSec: Math.max(0, Math.round(Number(srvWatch.last_position || 0))),
			href: `/videos?ep=${srvWatch.video_id}`
		};
	} else if (guestWatch && guestWatch.video_id) {
		watching = {
			videoId: guestWatch.video_id,
			videoName:
				guestWatch.video_name || m.hub_episode_fallback({ id: guestWatch.video_id }, opts),
			positionSec: Math.max(0, Math.round(Number(guestWatch.position_sec || 0))),
			href: `/videos?ep=${guestWatch.video_id}`
		};
	}

	return {
		hasPersonalProgress: hasReadingProgress || visitedCount > 0 || watching !== null,
		reading,
		world: {
			visitedCount,
			totalLocations,
			percent: worldPercent,
			latestLocationName,
			href: worldHref
		},
		watching
	};
}

export function readGuestProgressFromStorage(
	storage?: Pick<Storage, 'getItem'> | null,
	featuredVideos: Array<{ id: number; video_name: string }> = []
): LocalGuestSnapshot {
	if (!storage) return {};
	let reading: LocalGuestSnapshot['reading'] = null;
	let watching: LocalGuestSnapshot['watching'] = null;
	const visitedLocationIds: number[] = [];

	// 1. Read `selorson_reading_progress` (used by `/stories/[number]`)
	try {
		const rawProgressMap = storage.getItem('selorson_reading_progress');
		if (rawProgressMap) {
			const map = JSON.parse(rawProgressMap);
			if (map && typeof map === 'object') {
				const entries = Object.values(map).filter(
					(e: any) => e && Number(e.chapter_number) > 0
				) as Array<Record<string, any>>;
				entries.sort((a, b) => {
					const ta = a.updated_at ? Date.parse(String(a.updated_at)) : 0;
					const tb = b.updated_at ? Date.parse(String(b.updated_at)) : 0;
					if (tb !== ta) return tb - ta;
					return Number(b.chapter_number || 0) - Number(a.chapter_number || 0);
				});
				const top = entries[0];
				if (top) {
					reading = {
						chapter_number: Number(top.chapter_number),
						title:
							typeof top.chapter_title === 'string'
								? top.chapter_title
								: typeof top.title === 'string'
									? top.title
									: undefined,
						percent: Number(top.last_position ?? top.percent ?? 0),
						mode: top.mode === 'manga' ? 'manga' : 'text',
						has_manga: Boolean(top.has_manga)
					};
				}
			}
		}
	} catch {
		// ignore malformed storage
	}

	// Fallback to `selorson:last-read-chapter` if present
	if (!reading) {
		try {
			const rawLast = storage.getItem('selorson:last-read-chapter');
			if (rawLast) {
				const parsed = JSON.parse(rawLast);
				if (parsed && Number(parsed.chapter_number) > 0) {
					reading = {
						chapter_number: Number(parsed.chapter_number),
						title: typeof parsed.title === 'string' ? parsed.title : undefined,
						percent: Number(parsed.percent || parsed.last_position || 0),
						mode: parsed.mode === 'manga' ? 'manga' : 'text',
						has_manga: Boolean(parsed.has_manga)
					};
				}
			}
		} catch {
			// ignore malformed storage
		}
	}

	// 2. Read `selorson_video_progress_v1` (used by `/videos`)
	try {
		const rawVideoMap = storage.getItem('selorson_video_progress_v1');
		if (rawVideoMap) {
			const map = JSON.parse(rawVideoMap);
			if (map && typeof map === 'object') {
				const entries = Object.entries(map)
					.map(([idStr, val]: [string, any]) => ({
						video_id: Number(idStr),
						position_sec: Number(val?.last_position || 0),
						updated_at: val?.updated_at ? Date.parse(String(val.updated_at)) : 0
					}))
					.filter((e) => Number.isFinite(e.video_id) && e.video_id > 0 && e.position_sec > 0);
				entries.sort((a, b) => b.updated_at - a.updated_at);
				const topVid = entries[0];
				if (topVid) {
					const matchedVid = featuredVideos.find((v) => Number(v.id) === topVid.video_id);
					watching = {
						video_id: topVid.video_id,
						video_name: matchedVid?.video_name,
						position_sec: topVid.position_sec
					};
				}
			}
		}
	} catch {
		// ignore
	}

	// 3. Read `selorson:world-visited-ids`
	try {
		const rawWorld = storage.getItem('selorson:world-visited-ids');
		if (rawWorld) {
			const arr = JSON.parse(rawWorld);
			if (Array.isArray(arr)) {
				for (const id of arr) {
					const n = Number(id);
					if (Number.isFinite(n) && n > 0 && !visitedLocationIds.includes(n)) {
						visitedLocationIds.push(n);
					}
				}
			}
		}
	} catch {
		// ignore
	}

	return {
		reading,
		watching,
		visitedLocationIds
	};
}

export interface PublishQueueData {
	draft_chapters: Array<{
		id: number;
		chapter_number: number;
		title: string;
		word_count?: number;
		reading_time_min?: number;
		updated_at?: string;
	}>;
	draft_manga: Array<{
		chapter_id: number;
		chapter_number: number;
		title: string;
		chapter_status?: string;
		color_count?: number;
		bw_count?: number;
		total_pages?: number;
		reading_mode?: string;
		updated_at?: string;
	}>;
	pending_library: Array<{
		id: number;
		name: string;
		category: string;
		description?: string;
		image_url?: string | null;
		aliases?: string[];
		role?: string | null;
		first_chapter?: number | null;
		cowriter_key?: string | null;
		updated_at?: string;
	}>;
	draft_translations?: Array<{
		id: number;
		chapter_id: number;
		chapter_number: number;
		locale: string;
		title: string;
		word_count?: number;
		reading_time_min?: number;
		updated_at?: string;
	}>;
	counts?: {
		draft_chapters: number;
		draft_manga: number;
		pending_library: number;
		draft_translations?: number;
		total_pending: number;
	};
}

export function buildBatchPublishPayload(
	selectedChapterIds: number[],
	selectedMangaChapterIds: number[],
	selectedLibraryIds: number[],
	action: 'publish' | 'draft' = 'publish',
	selectedTranslationIds: number[] = []
) {
	const dedup = (arr: number[]) =>
		Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
	const chapter_ids = dedup(selectedChapterIds);
	const manga_chapter_ids = dedup(selectedMangaChapterIds);
	const library_item_ids = dedup(selectedLibraryIds);
	const translation_ids = dedup(selectedTranslationIds);
	return {
		chapter_ids,
		manga_chapter_ids,
		library_item_ids,
		translation_ids,
		action,
		totalSelected:
			chapter_ids.length +
			manga_chapter_ids.length +
			library_item_ids.length +
			translation_ids.length
	};
}
