import { api, acquireRefreshedToken, acquireStreamTicket } from '$lib/api';
import { isAuthenticated } from '$lib/stores/auth.svelte';
import { PUBLIC_API_BASE } from '$env/static/public';
import { countUnread, markConversationRead, normalizeConversations } from '$lib/chat-model.js';
import * as m from '$lib/paraglide/messages';

export interface ConvData { id: number; other_user: { id: number; name: string; username: string; avatar: string|null; is_online: boolean }|null; last_message: string|null; last_message_at: string|null; unread: number }
export interface MsgData { id: number; sender_id: number; receiver_id?: number; message: string; created_at: string }
interface ChatWin { convId: number; otherUser: ConvData['other_user']; messages: MsgData[]; draft: string; loading: boolean; sending: boolean; unread: number; lastActivity: number; error: string }

const MAX_WINDOWS = 2;
const MAX_BUBBLES = 4;

let conversations = $state<ConvData[]>([]);
let openWindows = $state<ChatWin[]>([]);
let bubbles = $state<ChatWin[]>([]);
let totalUnread = $state(0);
let drawerOpen = $state(false);
let loadingConvs = $state(true);
let conversationsError = $state('');
let showOverflow = $state(false);
let chatSSE: EventSource | null = null;
let activePageConversationId: number | null = null;
let pageMessageListener: ((convId: number, msg: MsgData) => void) | null = null;
let pageStatusListener: ((userId: number, isOnline: boolean) => void) | null = null;

export function getConversations() { return conversations; }
export function getOpenWindows() { return openWindows; }
export function getBubbles() { return bubbles; }
export function getVisibleBubbles() { return bubbles.slice(0, MAX_BUBBLES); }
export function getOverflowBubbles() { return bubbles.slice(MAX_BUBBLES); }
export function isDrawerOpen() { return drawerOpen; }
export function isLoadingConvs() { return loadingConvs; }
export function getConversationsError() { return conversationsError; }
export function isOverflowOpen() { return showOverflow; }
export function toggleOverflow() { showOverflow = !showOverflow; }
export function getTotalUnread() { return totalUnread; }
export function setActivePageConversation(convId: number | null) {
	activePageConversationId = convId;
}
export function setPageMessageListener(fn: ((convId: number, msg: MsgData) => void) | null) {
	pageMessageListener = fn;
}
export function setPageStatusListener(fn: ((userId: number, isOnline: boolean) => void) | null) {
	pageStatusListener = fn;
}

function updateTotalUnread() {
	totalUnread = countUnread(conversations);
}

export function toggleDrawer() { drawerOpen = !drawerOpen; }
export function closeDrawer() { drawerOpen = false; }
export function sortConversations() { conversations = normalizeConversations(conversations); }
export function markConversationAsRead(convId: number) {
	conversations = markConversationRead(conversations, convId);
	updateTotalUnread();
}

export async function deleteConversation(convId: number): Promise<boolean> {
	try {
		const r = await api<any>(`/chat/conversations/${convId}`, { method: 'DELETE' });
		if (r.success !== false) {
			conversations = conversations.filter((c) => c.id !== convId);
			openWindows = openWindows.filter((w) => w.convId !== convId);
			bubbles = bubbles.filter((b) => b.convId !== convId);
			updateTotalUnread();
			return true;
		}
	} catch {}
	return false;
}

export async function fetchConversations() {
	loadingConvs = true;
	conversationsError = '';
	try { 
		const r = await api<any>('/chat/conversations'); 
		conversations = normalizeConversations(r.data || []);
		updateTotalUnread();
	} catch (error) {
		conversationsError = (error as { message?: string })?.message || m.chat_err_open();
	}
	finally { loadingConvs = false; }
	initChatSSE();
}

let sseRetryCount = 0;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseGeneration = 0;
let sseConnecting = false;
const MAX_SSE_RETRIES = 15;

export function resetChatStore() {
	sseGeneration++;
	sseConnecting = false;
	if (sseReconnectTimer) {
		clearTimeout(sseReconnectTimer);
		sseReconnectTimer = null;
	}
	if (chatSSE) {
		chatSSE.close();
		chatSSE = null;
	}
	sseRetryCount = 0;
	conversations = [];
	openWindows = [];
	bubbles = [];
	totalUnread = 0;
	drawerOpen = false;
	showOverflow = false;
	conversationsError = '';
}

async function initChatSSE() {
	if (chatSSE || sseConnecting || !isAuthenticated()) return;
	if (sseReconnectTimer) {
		clearTimeout(sseReconnectTimer);
		sseReconnectTimer = null;
	}
	const gen = sseGeneration;
	sseConnecting = true;
	let ticket: string | null = null;
	try {
		ticket = await acquireStreamTicket();
	} finally {
		sseConnecting = false;
	}
	if (!ticket || gen !== sseGeneration || chatSSE || !isAuthenticated()) {
		if (!ticket && gen === sseGeneration && isAuthenticated() && sseRetryCount < MAX_SSE_RETRIES) {
			sseRetryCount++;
			const delay = Math.min(1000 * Math.pow(2, sseRetryCount), 30000);
			sseReconnectTimer = setTimeout(() => {
				sseReconnectTimer = null;
				void initChatSSE();
			}, delay);
		}
		return;
	}
	chatSSE = new EventSource(`${PUBLIC_API_BASE}/chat/stream?ticket=${encodeURIComponent(ticket)}`);
	chatSSE.onopen = () => {
		sseRetryCount = 0; // Reset retry count on successful connection
	};
	chatSSE.onmessage = (e) => {
		try {
			const data = JSON.parse(e.data);
			if (data.type === 'private_message') {
				handleIncomingMessage(data);
				if (pageMessageListener && data.conversation_id && data.message) {
					pageMessageListener(Number(data.conversation_id), data.message);
				}
			} else if (data.type === 'status' && data.user_id) {
				const uid = Number(data.user_id);
				const online = Boolean(data.is_online);
				conversations = conversations.map((c) =>
					c.other_user && c.other_user.id === uid
						? { ...c, other_user: { ...c.other_user, is_online: online } }
						: c
				);
				openWindows = openWindows.map((w) =>
					w.otherUser && w.otherUser.id === uid
						? { ...w, otherUser: { ...w.otherUser, is_online: online } }
						: w
				);
				pageStatusListener?.(uid, online);
			}
		} catch {}
	};
	chatSSE.onerror = () => {
		chatSSE?.close();
		chatSSE = null;
		if (!isAuthenticated()) return;
		if (sseRetryCount < MAX_SSE_RETRIES) {
			sseRetryCount++;
			const delay = Math.min(1000 * Math.pow(2, sseRetryCount), 30000);
			if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
			sseReconnectTimer = setTimeout(async () => {
				sseReconnectTimer = null;
				if (!isAuthenticated()) return;
				await acquireRefreshedToken(undefined, false).catch(() => {});
				void initChatSSE();
			}, delay);
		}
	};
}

export async function openWindow(conv: ConvData) {
	drawerOpen = false;
	if (openWindows.some(x => x.convId === conv.id)) return;
	
	const eb = bubbles.find(b => b.convId === conv.id);
	if (eb) {
		promoteBubble(eb);
		await loadMessages(conv.id);
		return;
	}
	const win: ChatWin = { convId: conv.id, otherUser: conv.other_user, messages: [], draft: '', loading: true, sending: false, unread: 0, lastActivity: Date.now(), error: '' };
	if (openWindows.length >= MAX_WINDOWS) {
		const oldest = openWindows.reduce((a, b) => a.lastActivity < b.lastActivity ? a : b);
		minimizeWindow(oldest);
	}
	openWindows = [...openWindows, win];
	await loadMessages(conv.id);
}

export async function openChatWithUser(userId: number) {
	try {
		const r = await api<any>('/chat/conversations/find-or-create', { method: 'POST', body: { user_id: userId } });
		if (r.success) {
			const d = r.data;
			let c = conversations.find(x => x.id === d.conversation_id);
			if (!c) { c = { id: d.conversation_id, other_user: d.other_user, last_message: null, last_message_at: null, unread: 0 }; conversations = [c, ...conversations]; }
			openWindow(c);
		}
	} catch {}
}

async function loadMessages(convId: number, showLoading = true) {
	let winIdx = openWindows.findIndex(w => w.convId === convId);
	if (winIdx === -1) return false;
	if (showLoading) {
		openWindows[winIdx] = { ...openWindows[winIdx], loading: true, error: '' };
		openWindows = [...openWindows];
	}
	try { 
		const r = await api<any>(`/chat/conversations/${convId}/messages`); 
		winIdx = openWindows.findIndex(w => w.convId === convId);
		if (winIdx !== -1) {
			openWindows[winIdx] = {
				...openWindows[winIdx],
				messages: r.data || [],
				loading: false,
				unread: 0,
				error: '',
			};
			openWindows = [...openWindows];
		}
		markConversationAsRead(convId);
		return true;
	} catch (error) {
		winIdx = openWindows.findIndex(w => w.convId === convId);
		if (winIdx !== -1) {
			openWindows[winIdx] = {
				...openWindows[winIdx],
				loading: false,
				error: (error as { message?: string })?.message || m.chat_err_open(),
			};
			openWindows = [...openWindows];
		}
		return false;
	}
}

export async function sendMsg(w: ChatWin) {
	if (!w.draft?.trim()) return;
	const winIdx = openWindows.findIndex(x => x.convId === w.convId);
	if (winIdx === -1) return;
	
	openWindows[winIdx] = { ...openWindows[winIdx], sending: true, error: '' };
	openWindows = [...openWindows];
	try {
		const r = await api<any>('/chat/messages', { method: 'POST', body: { receiver_id: w.otherUser?.id, message: w.draft } });
		if (r.success) {
			openWindows[winIdx].messages = [...openWindows[winIdx].messages, r.data];
			openWindows[winIdx].draft = '';
			openWindows[winIdx].lastActivity = Date.now();
			const c = conversations.find(x => x.id === w.convId);
			if (c) { 
				c.last_message = r.data.message; 
				c.last_message_at = r.data.created_at; 
				conversations = [...conversations].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
			}
		}
	} catch (error) {
		const currentIdx = openWindows.findIndex(x => x.convId === w.convId);
		if (currentIdx !== -1) {
			openWindows[currentIdx] = {
				...openWindows[currentIdx],
				error: (error as { message?: string })?.message || m.chat_err_send(),
			};
			openWindows = [...openWindows];
		}
	}
	finally { 
		const currentIdx = openWindows.findIndex(x => x.convId === w.convId);
		if (currentIdx !== -1) {
			openWindows[currentIdx] = { ...openWindows[currentIdx], sending: false };
			openWindows = [...openWindows];
		}
	}
}

export function minimizeWindow(w: ChatWin) {
	openWindows = openWindows.filter(x => x.convId !== w.convId);
	bubbles = [w, ...bubbles.filter(b => b.convId !== w.convId)];
}

export function promoteBubble(b: ChatWin) {
	bubbles = bubbles.filter(x => x.convId !== b.convId);
	updateTotalUnread();
	if (openWindows.length >= MAX_WINDOWS) {
		const oldest = openWindows.reduce((a, c) => a.lastActivity < c.lastActivity ? a : c);
		minimizeWindow(oldest);
	}
	b.lastActivity = Date.now();
	openWindows = [...openWindows, b];
}

export function closeWindow(w: ChatWin) {
	openWindows = openWindows.filter(x => x.convId !== w.convId);
}

export function updateDraft(convId: number, text: string) {
	const winIdx = openWindows.findIndex(x => x.convId === convId);
	if (winIdx !== -1) {
		openWindows[winIdx] = { ...openWindows[winIdx], draft: text, error: '' };
		openWindows = [...openWindows];
	}
}

export function handleIncomingMessage(data: { conversation_id: number; message: MsgData }) {
	const winIdx = openWindows.findIndex(x => x.convId === data.conversation_id);
	const isActive = winIdx !== -1 || activePageConversationId === data.conversation_id;
	if (winIdx !== -1) { 
		openWindows[winIdx].messages = [...openWindows[winIdx].messages, data.message]; 
		openWindows[winIdx].lastActivity = Date.now(); 
		openWindows = [...openWindows];
		void loadMessages(data.conversation_id, false);
	}
	const bIdx = bubbles.findIndex(x => x.convId === data.conversation_id);
	if (bIdx !== -1) { 
		bubbles[bIdx].unread++; 
		bubbles[bIdx].lastActivity = Date.now(); 
		bubbles = [...bubbles].sort((a, c) => c.lastActivity - a.lastActivity); 
	}
	const cIdx = conversations.findIndex(x => x.id === data.conversation_id);
	if (cIdx !== -1) { 
		conversations[cIdx].last_message = data.message.message; 
		conversations[cIdx].last_message_at = data.message.created_at; 
		if (!isActive) {
			conversations[cIdx].unread++; 
		}
		conversations = [...conversations].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
	}
	updateTotalUnread();
	if (activePageConversationId === data.conversation_id && winIdx === -1) {
		void api<any>(`/chat/conversations/${data.conversation_id}/messages`)
			.then(() => markConversationAsRead(data.conversation_id))
			.catch(() => {});
	}
	if (winIdx === -1 && bIdx === -1 && cIdx === -1) {
		fetchConversations();
	}
}
