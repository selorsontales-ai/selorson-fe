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

// ── Social State ──
let socialStatus = $state<Record<number, any>>({});

export function getStatus(userId: number) { return socialStatus[userId]; }

export async function fetchStatus(userId: number) {
	try {
		const r = await apiFetch(`/social/status/${userId}`);
		if (r.success) socialStatus[userId] = r.data;
	} catch {}
}

export async function toggleBlock(userId: number) {
	const r = await apiFetch(`/social/block/${userId}`, { method: 'POST' });
	if (r.success) await fetchStatus(userId);
	return r;
}

export async function reportUser(userId: number, reason: string, description?: string) {
	return apiFetch(`/social/report/${userId}`, { method: 'POST', body: JSON.stringify({ reason, description }) });
}

export async function toggleFollow(userId: number) {
	const r = await apiFetch(`/follows/${userId}/toggle`, { method: 'POST' });
	if (r.success) await fetchStatus(userId);
	return r;
}

export async function fetchFollowers(userId: number) {
	return apiFetch(`/followers/${userId}`);
}

export async function fetchFollowing(userId: number) {
	return apiFetch(`/following/${userId}`);
}

export async function getBlockedUsers() {
	return apiFetch('/social/blocked');
}

export async function getExplore(params?: { q?: string; sort?: string; limit?: number }) {
	const sp = new URLSearchParams();
	if (params?.q && params.q.trim()) sp.set('q', params.q.trim());
	if (params?.sort) sp.set('sort', params.sort);
	if (params?.limit) sp.set('limit', String(params.limit));
	const qs = sp.toString();
	return apiFetch(`/social/explore${qs ? `?${qs}` : ''}`);
}
