import assert from 'node:assert/strict';
import test from 'node:test';

import {
	countUnread,
	markConversationRead,
	normalizeConversations,
} from '../src/lib/chat-model.js';

test('normalizes backend unread_count and sorts newest conversations first', () => {
	const conversations = normalizeConversations([
		{ id: 1, unread_count: 0, unread: 9, last_message_at: '2026-07-20T00:00:00Z' },
		{ id: 2, unread_count: 3, last_message_at: '2026-07-28T00:00:00Z' },
	]);

	assert.deepEqual(conversations.map(({ id, unread }) => ({ id, unread })), [
		{ id: 2, unread: 3 },
		{ id: 1, unread: 0 },
	]);
});

test('counts unread once from conversations', () => {
	assert.equal(countUnread([
		{ unread: 2 },
		{ unread: 1 },
		{ unread: 0 },
	]), 3);
});

test('marks one conversation read without mutating the source list', () => {
	const source = [
		{ id: 1, unread: 4 },
		{ id: 2, unread: 2 },
	];
	const updated = markConversationRead(source, 1);

	assert.equal(source[0].unread, 4);
	assert.notEqual(updated, source);
	assert.deepEqual(updated, [
		{ id: 1, unread: 0 },
		{ id: 2, unread: 2 },
	]);
});
