/**
 * @typedef {{
 *   id: number;
 *   last_message_at?: string | null;
 *   unread?: number;
 *   unread_count?: number;
 * }} ConversationLike
 */

/** @param {string | number | null | undefined} value */
function activityTime(value) {
	return new Date(value || 0).getTime();
}

/**
 * @template {ConversationLike} T
 * @param {T[]} rows
 * @returns {Array<T & { unread: number }>}
 */
export function normalizeConversations(rows = []) {
	return rows
		.map((conversation) => ({
			...conversation,
			unread: Number(conversation.unread_count ?? conversation.unread ?? 0) || 0,
		}))
		.sort((a, b) => activityTime(b.last_message_at) - activityTime(a.last_message_at));
}

/** @param {Array<{ unread?: number }>} conversations */
export function countUnread(conversations = []) {
	return conversations.reduce(
		(total, conversation) => total + (Number(conversation.unread) || 0),
		0,
	);
}

/**
 * @template {{ id: number; unread?: number }} T
 * @param {T[]} conversations
 * @param {number} conversationId
 * @returns {T[]}
 */
export function markConversationRead(conversations, conversationId) {
	return conversations.map((conversation) =>
		conversation.id === conversationId
			? { ...conversation, unread: 0 }
			: conversation
	);
}
