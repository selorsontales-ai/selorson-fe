import { api } from '$lib/api';

// ── Social State ──
let socialStatus = $state<Record<number, any>>({});

export function getStatus(userId: number) { return socialStatus[userId]; }

export async function fetchStatus(userId: number) {
	try {
		const r = await api<any>(`/social/status/${userId}`);
		if (r.success) socialStatus[userId] = r.data;
	} catch {}
}

export async function toggleBlock(userId: number) {
	try {
		const r = await api<any>(`/social/block/${userId}`, { method: 'POST' });
		if (r.success) await fetchStatus(userId);
		return r;
	} catch (err: any) {
		return { success: false, message: err?.message || 'Failed' };
	}
}

export async function reportUser(userId: number, reason: string, description?: string) {
	try {
		return await api<any>(`/social/report/${userId}`, {
			method: 'POST',
			body: { reason, description }
		});
	} catch (err: any) {
		return { success: false, message: err?.message || 'Failed' };
	}
}

export async function toggleFollow(userId: number) {
	try {
		const r = await api<any>(`/follows/${userId}/toggle`, { method: 'POST' });
		if (r.success) await fetchStatus(userId);
		return r;
	} catch (err: any) {
		return { success: false, message: err?.message || 'Failed' };
	}
}

export async function fetchFollowers(userId: number) {
	try {
		return await api<any>(`/followers/${userId}`);
	} catch (err: any) {
		return { success: false, data: { count: 0, users: [] }, message: err?.message };
	}
}

export async function fetchFollowing(userId: number) {
	try {
		return await api<any>(`/following/${userId}`);
	} catch (err: any) {
		return { success: false, data: { count: 0, users: [] }, message: err?.message };
	}
}

export async function getBlockedUsers() {
	try {
		return await api<any>('/social/blocked');
	} catch (err: any) {
		return { success: false, data: [], message: err?.message };
	}
}

export async function getExplore(params?: { q?: string; sort?: string; limit?: number }) {
	const sp = new URLSearchParams();
	if (params?.q && params.q.trim()) sp.set('q', params.q.trim());
	if (params?.sort) sp.set('sort', params.sort);
	if (params?.limit) sp.set('limit', String(params.limit));
	const qs = sp.toString();
	try {
		return await api<any>(`/social/explore${qs ? `?${qs}` : ''}`);
	} catch (err: any) {
		return { success: false, data: [], message: err?.message };
	}
}
