import { api } from '$lib/api';
import { getToken } from './auth.svelte';

export interface NotificationFeedItem {
	key: string;
	id: number;
	category: 'interaction' | 'system';
	kind: 'comment_reply' | 'comment_like' | 'new_follower' | 'new_chapter' | 'poll' | 'announcement';
	title: string;
	content: string;
	context_label?: string | null;
	target_url?: string | null;
	image_url?: string | null;
	vote?: {
		options: { id: number; option_text: string; vote_count: number }[];
		user_voted?: number | null;
	} | null;
	actor?: {
		id: number;
		name: string;
		nickname?: string | null;
		username?: string | null;
		avatar?: string | null;
	} | null;
	is_read: boolean;
	created_at: string;
}

// ── Notification State (HeroSlider & System Notifications) ──
let notifications = $state<any[]>([]);
let notifLoading = $state(false);

export function getNotifications() {
	return notifications;
}
export function isNotifLoading() {
	return notifLoading;
}

export async function fetchNotifications(page = 1) {
	notifLoading = true;
	try {
		const r = await api<any>(`/notifications?page=${page}`);
		if (r.success) notifications = r.data;
	} catch {
	} finally {
		notifLoading = false;
	}
}

// ── Unified Personal + System Notification Feed (NotificationBell) ──
let feedItems = $state<NotificationFeedItem[]>([]);
let feedLoading = $state(false);
let unreadCount = $state(0);
let unreadInteractionCount = $state(0);
let unreadSystemCount = $state(0);

export function getNotificationFeed() {
	return feedItems;
}
export function isFeedLoading() {
	return feedLoading;
}
export function getUnreadNotificationCount() {
	return unreadCount;
}
export function getUnreadInteractionCount() {
	return unreadInteractionCount;
}
export function getUnreadSystemCount() {
	return unreadSystemCount;
}

function recomputeUnreadCounts(items: NotificationFeedItem[]) {
	let total = 0;
	let inter = 0;
	let sys = 0;
	for (const item of items) {
		if (!item.is_read) {
			total += 1;
			if (item.category === 'interaction') inter += 1;
			else sys += 1;
		}
	}
	unreadCount = total;
	unreadInteractionCount = inter;
	unreadSystemCount = sys;
}

export async function fetchNotificationFeed(limit = 35) {
	if (!getToken()) {
		feedItems = [];
		recomputeUnreadCounts([]);
		return;
	}
	feedLoading = true;
	try {
		const r = await api<NotificationFeedItem[]>(`/notifications/feed?limit=${limit}`);
		if (r.success && Array.isArray(r.data)) {
			feedItems = r.data;
			recomputeUnreadCounts(feedItems);
		}
	} catch {
	} finally {
		feedLoading = false;
	}
}

export async function markNotificationsRead(keys: string[] = [], markAll = false) {
	if (!getToken()) return;
	if (markAll) {
		feedItems = feedItems.map((item) => ({ ...item, is_read: true }));
	} else if (keys.length > 0) {
		const keySet = new Set(keys);
		feedItems = feedItems.map((item) =>
			keySet.has(item.key) ? { ...item, is_read: true } : item
		);
	}
	recomputeUnreadCounts(feedItems);

	try {
		await api('/notifications/read', {
			method: 'POST',
			body: { keys, mark_all: markAll }
		});
	} catch {}
}

export async function voteOnNotification(notificationId: number, optionId: number) {
	try {
		const r = await api<any>('/notifications/vote', {
			method: 'POST',
			body: { notification_id: notificationId, option_id: optionId }
		});
		if (r.success) {
			void fetchNotificationFeed();
		}
		return r;
	} catch (err: any) {
		return { success: false, message: err?.message || 'Vote failed' };
	}
}

// ── Voting State ──
let voteStats = $state<any>(null);
let userVote = $state<any>(null);

export function getVoteStats() {
	return voteStats;
}
export function getUserVote() {
	return userVote;
}

export async function fetchVoteStats() {
	const token = getToken();
	const endpoint = token ? '/votes/stats' : '/public/votes/stats';
	try {
		const r = await api<any>(endpoint);
		if (r.success) {
			voteStats = r.data;
			userVote = r.data.user_vote || null;
		}
	} catch {}
}

export async function castVote(choice: number) {
	try {
		const r = await api<any>('/votes', { method: 'POST', body: { choice } });
		if (r.success) await fetchVoteStats();
		return r;
	} catch (err: any) {
		return { success: false, message: err?.message || 'Vote failed' };
	}
}
