import { api } from '$lib/api';
import { getToken } from '$lib/stores/auth.svelte';
import { PUBLIC_API_BASE } from '$env/static/public';

export interface ConvData { id: number; other_user: { id: number; name: string; username: string; avatar: string|null; is_online: boolean }|null; last_message: string|null; last_message_at: string|null; unread: number }
interface MsgData { id: number; sender_id: number; message: string; created_at: string }
interface ChatWin { convId: number; otherUser: ConvData['other_user']; messages: MsgData[]; draft: string; loading: boolean; sending: boolean; unread: number; lastActivity: number }

const MAX_WINDOWS = 2;
const MAX_BUBBLES = 4;

let conversations = $state<ConvData[]>([]);
let openWindows = $state<ChatWin[]>([]);
let bubbles = $state<ChatWin[]>([]);
let totalUnread = $state(0);
let drawerOpen = $state(false);
let loadingConvs = $state(true);
let showOverflow = $state(false);
let chatSSE: EventSource | null = null;

export function getConversations() { return conversations; }
export function getOpenWindows() { return openWindows; }
export function getBubbles() { return bubbles; }
export function getVisibleBubbles() { return bubbles.slice(0, MAX_BUBBLES); }
export function getOverflowBubbles() { return bubbles.slice(MAX_BUBBLES); }
export function isDrawerOpen() { return drawerOpen; }
export function isLoadingConvs() { return loadingConvs; }
export function isOverflowOpen() { return showOverflow; }
export function toggleOverflow() { showOverflow = !showOverflow; }
export function getTotalUnread() { return totalUnread; }

function updateTotalUnread() {
	totalUnread = conversations.reduce((s, c) => s + (Number(c.unread) || 0), 0) + 
		          bubbles.reduce((s, b) => s + (Number(b.unread) || 0), 0);
}

export function toggleDrawer() { drawerOpen = !drawerOpen; }
export function closeDrawer() { drawerOpen = false; }
export function sortConversations() { conversations = [...conversations].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()); }

export async function fetchConversations() {
	loadingConvs = true;
	try { 
		const r = await api<any>('/chat/conversations'); 
		conversations = (r.data || [])
			.map((c: any) => ({ ...c, unread: c.unread_count || c.unread || 0 }))
			.sort((a: any, b: any) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
		updateTotalUnread();
	} catch {}
	finally { loadingConvs = false; }
	initChatSSE();
}

function initChatSSE() {
	if (chatSSE) return;
	const token = getToken();
	if (!token) return;
	chatSSE = new EventSource(`${PUBLIC_API_BASE}/chat/stream?token=${token}`);
	chatSSE.onmessage = (e) => {
		try {
			const data = JSON.parse(e.data);
			if (data.type === 'private_message') {
				handleIncomingMessage(data);
			}
		} catch {}
	};
}

export async function openWindow(conv: ConvData) {
	drawerOpen = false;
	if (openWindows.some(x => x.convId === conv.id)) return;
	
	const cIdx = conversations.findIndex(x => x.id === conv.id);
	if (cIdx !== -1) {
		conversations[cIdx].unread = 0;
		updateTotalUnread();
	}

	const eb = bubbles.find(b => b.convId === conv.id);
	if (eb) { promoteBubble(eb); return; }
	const win: ChatWin = { convId: conv.id, otherUser: conv.other_user, messages: [], draft: '', loading: true, sending: false, unread: 0, lastActivity: Date.now() };
	if (openWindows.length >= MAX_WINDOWS) {
		const oldest = openWindows.reduce((a, b) => a.lastActivity < b.lastActivity ? a : b);
		minimizeWindow(oldest);
	}
	openWindows = [...openWindows, win];
	loadMessages(conv.id);
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

async function loadMessages(convId: number) {
	const winIdx = openWindows.findIndex(w => w.convId === convId);
	if (winIdx === -1) return;
	openWindows[winIdx].loading = true;
	try { 
		const r = await api<any>(`/chat/conversations/${convId}/messages`); 
		openWindows[winIdx].messages = r.data || []; 
	} catch {}
	finally { openWindows[winIdx].loading = false; }
}

export async function sendMsg(w: ChatWin) {
	if (!w.draft?.trim()) return;
	const winIdx = openWindows.findIndex(x => x.convId === w.convId);
	if (winIdx === -1) return;
	
	openWindows[winIdx].sending = true;
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
	} catch {}
	finally { 
		if (openWindows[winIdx]) openWindows[winIdx].sending = false; 
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
	if (winIdx !== -1) openWindows[winIdx].draft = text;
}

export function handleIncomingMessage(data: { conversation_id: number; message: MsgData }) {
	const winIdx = openWindows.findIndex(x => x.convId === data.conversation_id);
	if (winIdx !== -1) { 
		openWindows[winIdx].messages = [...openWindows[winIdx].messages, data.message]; 
		openWindows[winIdx].lastActivity = Date.now(); 
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
		if (winIdx === -1) {
			conversations[cIdx].unread++; 
		}
		conversations = [...conversations].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
	}
	updateTotalUnread();
	if (winIdx === -1 && bIdx === -1 && cIdx === -1) {
		fetchConversations();
	}
}
