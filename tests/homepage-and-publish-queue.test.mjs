import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
	buildBatchPublishPayload,
	formatCategoryMeta,
	readGuestProgressFromStorage,
	resolveLoreLinks,
	resolveReaderHub
} from '../src/lib/home/home-hub.ts';

test('resolveReaderHub prioritizes authenticated server progress and advances to next_chapter when completed', () => {
	const chapters = [
		{ id: 1, chapter_number: 1, title: 'Làn Sóng Khởi Nguyên', has_manga: true },
		{ id: 2, chapter_number: 2, title: 'Tĩnh Thất Eryndor', has_manga: false },
		{ id: 3, chapter_number: 3, title: 'Rừng Dầu Rái Nam Bộ', has_manga: true }
	];

	// Case 1: In-progress chapter (64%)
	const hubInProgress = resolveReaderHub(
		{
			continue_reading: {
				chapter_id: 2,
				chapter_number: 2,
				title: 'Tĩnh Thất Eryndor',
				last_position: 64,
				is_completed: false,
				has_manga: false,
				chapters_read_count: 2,
				next_chapter: null
			},
			world_progress: {
				visited_count: 3,
				total_locations: 12,
				latest_location: { id: 9, name: 'Đỉnh Meru' }
			},
			continue_watching: {
				video_id: 5,
				video_name: 'Tập 1: Khởi Nguyên',
				last_position: 145
			}
		},
		chapters,
		12,
		null
	);

	assert.equal(hubInProgress.hasPersonalProgress, true);
	assert.equal(hubInProgress.reading.href, '/stories/2');
	assert.equal(hubInProgress.reading.percent, 64);
	assert.equal(hubInProgress.world.percent, 25);
	assert.equal(hubInProgress.world.latestLocationName, 'Đỉnh Meru');
	assert.equal(hubInProgress.world.href, '/world?focus=9');
	assert.equal(hubInProgress.watching?.href, '/videos?ep=5');

	// Case 2: Completed chapter with next_chapter available
	const hubCompletedNext = resolveReaderHub(
		{
			continue_reading: {
				chapter_id: 2,
				chapter_number: 2,
				title: 'Tĩnh Thất Eryndor',
				last_position: 100,
				is_completed: true,
				has_manga: false,
				chapters_read_count: 2,
				next_chapter: {
					id: 3,
					chapter_number: 3,
					title: 'Rừng Dầu Rái Nam Bộ',
					has_manga: true
				}
			}
		},
		chapters,
		10,
		null
	);

	assert.equal(hubCompletedNext.reading.href, '/stories/3');
	assert.equal(hubCompletedNext.reading.mangaHref, '/stories/3?mode=manga');
	assert.ok(hubCompletedNext.reading.title.includes('Chương 3: Rừng Dầu Rái Nam Bộ'));
});

test('readGuestProgressFromStorage and resolveReaderHub support guest localStorage progress', () => {
	const store = new Map([
		[
			'selorson_reading_progress',
			JSON.stringify({
				1: {
					chapter_id: 10,
					chapter_number: 1,
					chapter_title: 'Làn Sóng Khởi Nguyên',
					has_manga: true,
					last_position: 100,
					updated_at: '2026-11-05T04:00:00Z'
				},
				3: {
					chapter_id: 12,
					chapter_number: 3,
					chapter_title: 'Rừng Dầu Rái Nam Bộ',
					has_manga: true,
					last_position: 48,
					updated_at: '2026-11-05T05:30:00Z'
				}
			})
		],
		[
			'selorson_video_progress_v1',
			JSON.stringify({
				7: { completed: false, last_position: 92, updated_at: '2026-11-05T05:00:00Z' }
			})
		]
	]);

	const mockStorage = {
		getItem(key) {
			return store.get(key) ?? null;
		}
	};

	const guest = readGuestProgressFromStorage(mockStorage, [
		{ id: 7, video_name: 'Trailer Akunalia' }
	]);
	assert.equal(guest.reading?.chapter_number, 3);
	assert.equal(guest.reading?.percent, 48);
	assert.equal(guest.watching?.video_id, 7);
	assert.equal(guest.watching?.video_name, 'Trailer Akunalia');

	const hub = resolveReaderHub(null, [], 8, guest);
	assert.equal(hub.reading.href, '/stories/3');
	assert.equal(hub.reading.mangaHref, '/stories/3?mode=manga');
	assert.equal(hub.watching?.href, '/videos?ep=7');
});

test('resolveLoreLinks and formatCategoryMeta map library and 3D world links accurately', () => {
	const meta = formatCategoryMeta('character');
	assert.equal(meta.label, 'Nhân vật');
	assert.equal(meta.icon, '👤');

	const with3d = resolveLoreLinks({
		id: 42,
		name: 'Đỉnh Meru',
		category: 'location',
		has_3d_location: true,
		world_focus_id: 42
	});
	assert.deepEqual(with3d, {
		libraryHref: '/library?id=42',
		worldHref: '/world?focus=42'
	});

	const without3d = resolveLoreLinks({
		id: 15,
		name: 'Hokabe Pha',
		category: 'character',
		has_3d_location: false
	});
	assert.deepEqual(without3d, {
		libraryHref: '/library?id=15',
		worldHref: null
	});
});

test('buildBatchPublishPayload deduplicates IDs and computes totalSelected', () => {
	const payload = buildBatchPublishPayload([1, 2, 2, -1, 0], [5, 5], [10, 11, 12], 'publish');
	assert.deepEqual(payload, {
		chapter_ids: [1, 2],
		manga_chapter_ids: [5],
		library_item_ids: [10, 11, 12],
		translation_ids: [],
		action: 'publish',
		totalSelected: 6
	});

	const withTranslations = buildBatchPublishPayload([1], [], [10], 'publish', [20, 20, 0, 21]);
	assert.deepEqual(withTranslations, {
		chapter_ids: [1],
		manga_chapter_ids: [],
		library_item_ids: [10],
		translation_ids: [20, 21],
		action: 'publish',
		totalSelected: 4
	});
});

test('Homepage Immersion (Item 6) and Admin Publish Moderation Station (Item 7) are wired across routes', () => {
	const homePage = fs.readFileSync(path.resolve('src/routes/+page.svelte'), 'utf8');
	const heroSlider = fs.readFileSync(
		path.resolve('src/lib/components/ui/HeroSlider.svelte'),
		'utf8'
	);
	const rootLayout = fs.readFileSync(path.resolve('src/routes/+layout.svelte'), 'utf8');
	const adminDashboard = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/+page.svelte'),
		'utf8'
	);
	const adminChapters = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/chapters/+page.svelte'),
		'utf8'
	);
	const adminManga = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/manga/+page.svelte'),
		'utf8'
	);
	const adminLibrary = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/library/+page.svelte'),
		'utf8'
	);

	assert.ok(homePage.includes('<HeroSlider initialSlides={heroSlides} />'));
	const viMessages = fs.readFileSync(path.resolve('messages/vi.json'), 'utf8');
	assert.ok(homePage.includes('m.ui_your_journey_in_akunalia()'));
	assert.ok(homePage.includes('m.ui_akunalia_world_spotlight()'));
	assert.ok(viMessages.includes('Hành Trình Của Bạn Tại Akunalia'));
	assert.ok(viMessages.includes('Tiêu Điểm Thế Giới Akunalia'));
	assert.ok(heroSlider.includes('initialSlides = null'));
	assert.ok(rootLayout.includes('href="/world"'));
	assert.ok(adminDashboard.includes('/admin/publish-queue'));
	assert.ok(adminDashboard.includes('/admin/publish-batch'));
	assert.ok(adminChapters.includes('publishAllDraftChapters'));
	assert.ok(adminManga.includes('publishAllDraftManga'));
	assert.ok(adminLibrary.includes('publishFilteredPendingLore'));
});
