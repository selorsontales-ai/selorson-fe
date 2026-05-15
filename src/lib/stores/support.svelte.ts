import { PUBLIC_API_BASE } from '$env/static/public';
import { getToken } from './auth.svelte';

/** Helper: authenticated fetch */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...(options.headers as Record<string, string> || {}),
	};

	const token = getToken();
	if (token) headers['Authorization'] = `Bearer ${token}`;

	const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, { ...options, headers, credentials: 'include' });
	const json = await res.json();
	if (!res.ok || !json.success) throw { status: res.status, ...json };
	return json;
}

let supportTickets = $state<any[]>([]);
let activeTicket = $state<any>(null);
let activeConversation = $state<any>(null);
let supportMessages = $state<any[]>([]);
let supportUnread = $state(0);
let supportLoading = $state(false);
let supportSending = $state(false);

export function getSupportTickets() { return supportTickets; }
export function getActiveTicket() { return activeTicket; }
export function getActiveConversation() { return activeConversation; }
export function getSupportMessages() { return supportMessages; }
export function getSupportUnread() { return supportUnread; }
export function isSupportLoading() { return supportLoading; }
export function isSupportSending() { return supportSending; }

export async function fetchTickets() {
	supportLoading = true;
	try { const r: any = await apiFetch('/support'); supportTickets = r.data; } catch {} finally { supportLoading = false; }
}

export async function createTicket(message: string, priority = 'normal') {
	const r: any = await apiFetch('/support', { method: 'POST', body: JSON.stringify({ message, priority }) });
	await fetchTickets();
	return r;
}

export async function fetchMessages(ticketId: number) {
	const r: any = await apiFetch(`/support/${ticketId}/messages`);
	supportMessages = r.data;
	activeTicket = supportTickets.find((t: any) => t.id === ticketId) || null;
}

export async function sendSupportMessage(ticketId: number, message: string) {
	supportSending = true;
	try {
		await apiFetch(`/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message }) });
		await fetchMessages(ticketId);
	} finally { supportSending = false; }
}

export async function rateTicket(ticketId: number, rating: number, comment?: string) {
	await apiFetch(`/support/${ticketId}/rate`, { method: 'POST', body: JSON.stringify({ rating, comment }) });
	if (activeConversation) activeConversation = { ...activeConversation, status: 'closed', rating };
}

export async function fetchUnread() {
	try { const r: any = await apiFetch('/support/unread'); supportUnread = r.data.count; } catch {}
}

/** Alias for SupportChatWidget */
export const fetchUnreadCount = fetchUnread;

export async function fetchActiveConversation() {
	try {
		const r: any = await apiFetch('/support/active');
		if (r.data) {
			activeConversation = r.data.conversation;
			supportMessages = r.data.messages || [];
		}
	} catch {}
}

export async function markSupportRead(ticketId: number) {
	await apiFetch(`/support/${ticketId}/mark-read`, { method: 'POST' });
	supportUnread = Math.max(0, supportUnread - 1);
}

