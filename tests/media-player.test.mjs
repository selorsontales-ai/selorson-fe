import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
	formatAudioTime,
	normalizeTrack,
	computeNextQueueIndex
} from '../src/lib/audio/audio-utils.js';
import {
	isDirectVideoSource,
	buildSafeEmbedUrl,
	resolveVideoThumbnail,
	pickInitialVideo
} from '../src/lib/video/video-utils.ts';

test('formatAudioTime formats seconds and hours cleanly', () => {
	assert.equal(formatAudioTime(0), '0:00');
	assert.equal(formatAudioTime(-5), '0:00');
	assert.equal(formatAudioTime(65), '1:05');
	assert.equal(formatAudioTime(3661), '1:01:01');
});

test('normalizeTrack enriches track with fallback album metadata', () => {
	const track = normalizeTrack(
		{ id: 7, title: 'Khúc Ca Khởi Nguyên', artist: 'Selorson', file_path: '/api/v1/local-media/music/a.mp3' },
		{ id: 3, title: 'OST Vol.1', cover_image: '/cover.webp' }
	);
	assert.equal(track.id, 7);
	assert.equal(track.album_id, 3);
	assert.equal(track.album_title, 'OST Vol.1');
	assert.equal(track.cover_image, '/cover.webp');
	assert.equal(track.album?.title, 'OST Vol.1');
});

test('computeNextQueueIndex handles repeat all, repeat one, repeat off, and shuffle', () => {
	// Standard next & wrap on repeat=all
	assert.equal(computeNextQueueIndex(0, 3, 'all', false, 'next'), 1);
	assert.equal(computeNextQueueIndex(2, 3, 'all', false, 'ended'), 0);

	// Repeat off stops at end of queue on ended
	assert.equal(computeNextQueueIndex(2, 3, 'off', false, 'ended'), null);

	// Repeat one stays on current track when ended
	assert.equal(computeNextQueueIndex(1, 3, 'one', false, 'ended'), 1);

	// Shuffle picks a different track when queueLength > 1
	assert.equal(computeNextQueueIndex(1, 3, 'all', true, 'next', () => 0.4), 2);
});

test('isDirectVideoSource distinguishes native video files from YouTube/Vimeo embeds', () => {
	assert.equal(isDirectVideoSource('https://cdn.selorson.com/ep1.mp4'), true);
	assert.equal(isDirectVideoSource('http://127.0.0.1:8088/api/v1/local-media/videos/ep1.webm'), true);
	assert.equal(isDirectVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), false);
	assert.equal(isDirectVideoSource('https://vimeo.com/12345678'), false);
});

test('buildSafeEmbedUrl converts YouTube/Vimeo links and preserves existing query strings', () => {
	assert.equal(
		buildSafeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true),
		'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0'
	);
	assert.equal(
		buildSafeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc123', true),
		'https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc123&autoplay=1&rel=0'
	);
	assert.equal(
		buildSafeEmbedUrl('https://vimeo.com/987654321', true),
		'https://player.vimeo.com/video/987654321?autoplay=1&rel=0'
	);
});

test('resolveVideoThumbnail prefers custom thumbnail and falls back to YouTube mqdefault', () => {
	assert.equal(
		resolveVideoThumbnail({
			thumbnail_path: 'https://cdn/custom.webp',
			video_path: 'https://youtu.be/dQw4w9WgXcQ'
		}),
		'https://cdn/custom.webp'
	);
	assert.equal(
		resolveVideoThumbnail({
			thumbnail_path: '',
			video_path: 'https://youtu.be/dQw4w9WgXcQ'
		}),
		'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
	);
});

test('pickInitialVideo prioritizes requested ?ep=, then in-progress, then featured, then Ep 1', () => {
	const videos = [
		{ id: 10, video_name: 'Ep 1', video_path: 'a.mp4', video_type: 'main', episode_number: 1, is_featured: false, display_order: 1 },
		{ id: 20, video_name: 'Ep 2', video_path: 'b.mp4', video_type: 'main', episode_number: 2, is_featured: true, display_order: 2 },
		{ id: 30, video_name: 'Ep 3', video_path: 'c.mp4', video_type: 'main', episode_number: 3, is_featured: false, display_order: 3 }
	];

	// 1. Explicit ?ep=30
	assert.equal(pickInitialVideo(videos, 30, {})?.id, 30);

	// 2. In-progress episode (id=10 has last_position=45, completed=false)
	assert.equal(
		pickInitialVideo(videos, null, { 10: { completed: false, last_position: 45 } })?.id,
		10
	);

	// 3. Featured episode when none in progress
	assert.equal(pickInitialVideo(videos, null, {})?.id, 20);
});

test('GlobalAudioPlayer is mounted in root +layout.svelte and /music does not pause onDestroy', () => {
	const rootLayout = fs.readFileSync(
		path.resolve('src/routes/+layout.svelte'),
		'utf8'
	);
	assert.ok(rootLayout.includes('GlobalAudioPlayer'), 'root layout must mount GlobalAudioPlayer');

	const musicPage = fs.readFileSync(
		path.resolve('src/routes/(app)/music/+page.svelte'),
		'utf8'
	);
	assert.ok(!musicPage.includes('onDestroy'), '/music page must not destroy/pause audio on unmount');

	const videosPage = fs.readFileSync(
		path.resolve('src/routes/(app)/videos/+page.svelte'),
		'utf8'
	);
	assert.ok(videosPage.includes('commentableType="video"'), '/videos page must mount CommentsSection');
	assert.ok(videosPage.includes('pauseForExternalMedia'), '/videos page must pause background OST when playing video');
});
