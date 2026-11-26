import { api } from '$lib/api';

let supportTickets = $state<any[]>([]);
let activeTicket = $state<any>(null);
let activeConversation = $state<any>(null);
let supportMessages = $state<any[]>([]);
let supportUnread = $state(0);
let supportLoading = $state(false);
let supportSending = $state(false);
let chatWidgetHidden = $state(false);
let staffOnline = $state(false);

const resetListeners = new Set<() => void>();

export function onSupportReset(fn: () => void): () => void {
	resetListeners.add(fn);
	return () => {
		resetListeners.delete(fn);
	};
}

export function resetSupportStore() {
	supportTickets = [];
	activeTicket = null;
	activeConversation = null;
	supportMessages = [];
	supportUnread = 0;
	supportLoading = false;
	supportSending = false;
	for (const fn of resetListeners) {
		try {
			fn();
		} catch {}
	}
}

export function getSupportTickets() { return supportTickets; }
export function getActiveTicket() { return activeTicket; }
export function getActiveConversation() { return activeConversation; }
export function getSupportMessages() { return supportMessages; }
export function getSupportUnread() { return supportUnread; }
export function isSupportLoading() { return supportLoading; }
export function isSupportSending() { return supportSending; }
export function isChatWidgetHidden() { return chatWidgetHidden; }
export function isStaffOnline() { return staffOnline; }

export function setChatWidgetHidden(hidden: boolean) {
	chatWidgetHidden = hidden;
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('chatWidgetHidden', hidden.toString());
	}
}

export function initSupportUI() {
	if (typeof localStorage !== 'undefined') {
		chatWidgetHidden = localStorage.getItem('chatWidgetHidden') === 'true';
	}
}

export async function fetchTickets() {
	supportLoading = true;
	try {
		const r = await api<any>('/support');
		supportTickets = r.data || [];
	} catch {} finally {
		supportLoading = false;
	}
}

export async function createTicket(message: string, priority = 'normal') {
	const r = await api<any>('/support', { method: 'POST', body: { message, priority } });
	await fetchTickets();
	return r;
}

export async function fetchMessages(ticketId: number) {
	const r = await api<any>(`/support/${ticketId}/messages`);
	supportMessages = r.data || [];
	activeTicket = supportTickets.find((t: any) => t.id === ticketId) || null;
}

export async function sendSupportMessage(ticketId: number, message: string) {
	supportSending = true;
	try {
		await api(`/support/${ticketId}/reply`, { method: 'POST', body: { message } });
		await fetchMessages(ticketId);
	} finally {
		supportSending = false;
	}
}

export async function rateTicket(ticketId: number, rating: number, comment?: string) {
	await api(`/support/${ticketId}/rate`, { method: 'POST', body: { rating, comment } });
	if (activeConversation) activeConversation = { ...activeConversation, status: 'closed', rating };
}

export async function closeTicket(ticketId: number) {
	await api(`/support/${ticketId}/close`, { method: 'POST' });
	if (activeConversation) activeConversation = { ...activeConversation, status: 'closed' };
}

export async function fetchUnread() {
	try {
		const r = await api<any>('/support/unread');
		supportUnread = r.data?.count ?? 0;
		if (typeof r.data?.staff_online === 'boolean') {
			staffOnline = r.data.staff_online;
		}
	} catch {}
}

/** Alias for SupportChatWidget */
export const fetchUnreadCount = fetchUnread;

export async function fetchActiveConversation() {
	try {
		const r: any = await api<any>('/support/active');
		if (typeof r.staff_online === 'boolean') {
			staffOnline = r.staff_online;
		}
		if (r.data) {
			activeConversation = r.data.conversation;
			supportMessages = r.data.messages || [];
			if (typeof r.data.staff_online === 'boolean') {
				staffOnline = r.data.staff_online;
			}
		} else {
			activeConversation = null;
			supportMessages = [];
		}
	} catch {}
}

export async function markSupportRead(ticketId: number) {
	await api(`/support/${ticketId}/mark-read`, { method: 'POST' });
	supportUnread = Math.max(0, supportUnread - 1);
}
