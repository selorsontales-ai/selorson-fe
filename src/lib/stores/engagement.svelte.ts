import { PUBLIC_API_BASE } from '$env/static/public';
import { getToken } from './auth.svelte';

async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json', Accept: 'application/json',
		...(options.headers as Record<string, string> || {}),
	};
	const token = getToken();
	if (token) headers['Authorization'] = `Bearer ${token}`;
	const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, { ...options, headers });
	return res.json();
}

// ── Notification State ──
let notifications = $state<any[]>([]);
let notifLoading = $state(false);

export function getNotifications() { return notifications; }
export function isNotifLoading() { return notifLoading; }

export async function fetchNotifications(page = 1) {
	notifLoading = true;
	try {
		const r = await apiFetch(`/notifications?page=${page}`);
		if (r.success) notifications = r.data;
	} catch {} finally { notifLoading = false; }
}

export async function voteOnNotification(notificationId: number, optionId: number) {
	return apiFetch('/notifications/vote', { method: 'POST', body: JSON.stringify({ notification_id: notificationId, option_id: optionId }) });
}

// ── Voting State ──
let voteStats = $state<any>(null);
let userVote = $state<any>(null);

export function getVoteStats() { return voteStats; }
export function getUserVote() { return userVote; }

export async function fetchVoteStats() {
	const token = getToken();
	const endpoint = token ? '/votes/stats' : '/public/votes/stats';
	const r = await apiFetch(endpoint);
	if (r.success) {
		voteStats = r.data;
		userVote = r.data.user_vote || null;
	}
}

export async function castVote(choice: number) {
	const r = await apiFetch('/votes', { method: 'POST', body: JSON.stringify({ choice }) });
	if (r.success) await fetchVoteStats();
	return r;
}
