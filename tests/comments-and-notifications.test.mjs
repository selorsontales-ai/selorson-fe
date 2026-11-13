import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
	parseCommentSegments,
	wrapSelectionWithSpoiler,
	buildCommentThreads
} from '../src/lib/components/ui/comment-utils.ts';

test('parseCommentSegments splits plain text and [spoiler]...[/spoiler] blocks case-insensitively', () => {
	const segments = parseCommentSegments(
		'Theo mình nghĩ [spoiler]Tenka đã dùng Đôi Mắt Của Ra[/spoiler] để định vị [SPOILER]Đỉnh Meru[/SPOILER]!'
	);
	assert.deepEqual(segments, [
		{ type: 'text', text: 'Theo mình nghĩ ' },
		{ type: 'spoiler', text: 'Tenka đã dùng Đôi Mắt Của Ra' },
		{ type: 'text', text: ' để định vị ' },
		{ type: 'spoiler', text: 'Đỉnh Meru' },
		{ type: 'text', text: '!' }
	]);

	// Unclosed [spoiler] still protects remaining text
	const unclosed = parseCommentSegments('Cảnh báo: [spoiler]Bí mật cuối chương');
	assert.deepEqual(unclosed, [
		{ type: 'text', text: 'Cảnh báo: ' },
		{ type: 'spoiler', text: 'Bí mật cuối chương' }
	]);
});

test('wrapSelectionWithSpoiler wraps selected range or inserts placeholder', () => {
	const wrapped = wrapSelectionWithSpoiler('Giả thuyết về Tenka ở chương này', 14, 19);
	assert.equal(wrapped.text, 'Giả thuyết về [spoiler]Tenka[/spoiler] ở chương này');
	assert.equal(
		wrapped.text.slice(wrapped.selectionStart, wrapped.selectionEnd),
		'Tenka'
	);

	const emptyWrap = wrapSelectionWithSpoiler('', 0, 0);
	assert.equal(emptyWrap.text, '[spoiler]Tình tiết ẩn...[/spoiler]');
});

test('buildCommentThreads groups nested replies under root threads and sorts by newest/top/oldest', () => {
	const raw = [
		{
			id: 1,
			user_id: 10,
			parent_id: null,
			content: 'Bình luận gốc 1',
			likes_count: 1,
			created_at: '2026-11-05T08:00:00Z',
			user: { id: 10, name: 'Pha' }
		},
		{
			id: 2,
			user_id: 20,
			parent_id: null,
			content: 'Bình luận gốc 2 nhiều tim',
			likes_count: 8,
			created_at: '2026-11-05T09:00:00Z',
			user: { id: 20, name: 'Linh San' }
		},
		{
			id: 3,
			user_id: 30,
			parent_id: 1,
			content: 'Phản hồi cấp 1 cho bình luận 1',
			likes_count: 0,
			created_at: '2026-11-05T08:15:00Z',
			user: { id: 30, name: 'Okita' }
		},
		{
			id: 4,
			user_id: 40,
			parent_id: 3,
			content: 'Phản hồi cấp 2 nối tiếp phản hồi 3',
			likes_count: 0,
			created_at: '2026-11-05T08:30:00Z',
			user: { id: 40, name: 'Dona' }
		}
	];

	const newest = buildCommentThreads(raw, 'newest');
	assert.equal(newest.length, 2);
	assert.equal(newest[0].root.id, 2);
	assert.equal(newest[1].root.id, 1);
	assert.equal(newest[1].replies.length, 2);
	assert.equal(newest[1].replies[0].id, 3);
	assert.equal(newest[1].replies[1].id, 4);
	assert.equal(newest[1].replies[1].reply_to_user?.name, 'Okita');

	const oldest = buildCommentThreads(raw, 'oldest');
	assert.equal(oldest[0].root.id, 1);

	const top = buildCommentThreads(raw, 'top');
	assert.equal(top[0].root.id, 2);
});

test('Admin World Review & Open Sync Gateway, Journey Auto-Play, CommentsSection, and NotificationBell are wired', () => {
	const adminWorldPage = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/world/+page.svelte'),
		'utf8'
	);
	const adminLayout = fs.readFileSync(
		path.resolve('src/routes/(app)/admin/+layout.svelte'),
		'utf8'
	);
	const placementFields = fs.readFileSync(
		path.resolve('src/lib/components/admin/WorldPlacementFields.svelte'),
		'utf8'
	);
	const journeyPage = fs.readFileSync(
		path.resolve('src/routes/(app)/world/journey/[id]/+page.svelte'),
		'utf8'
	);
	const commentsSection = fs.readFileSync(
		path.resolve('src/lib/components/ui/CommentsSection.svelte'),
		'utf8'
	);
	const notifBell = fs.readFileSync(
		path.resolve('src/lib/components/ui/NotificationBell.svelte'),
		'utf8'
	);
	const rootLayout = fs.readFileSync(
		path.resolve('src/routes/+layout.svelte'),
		'utf8'
	);

	assert.ok(!fs.existsSync(path.resolve('src/lib/world-studio')));
	assert.ok(!fs.existsSync(path.resolve('src/routes/(app)/admin/world-studio')));
	assert.ok(adminLayout.includes('href: "/admin/world"'));
	assert.ok(adminWorldPage.includes('/admin/world/overview'));
	assert.ok(adminWorldPage.includes('/admin/sync/world-studio'));
	assert.ok(placementFields.includes('intro_video_url'));
	assert.ok(placementFields.includes('desktop_pack_url'));
	assert.ok(journeyPage.includes('handlePlayToggle'));
	assert.ok(commentsSection.includes('parseCommentSegments'));
	assert.ok(commentsSection.includes('buildCommentThreads'));
	assert.ok(notifBell.includes('fetchNotificationFeed'));
	assert.ok(rootLayout.includes('<NotificationBell />'));
});
