import { api } from '$lib/api';

interface ConvData { id: number; other_user: { id: number; name: string; username: string; avatar: string|null }|null; last_message: string|null; last_message_at: string|null; unread: number }
interface MsgData { id: number; sender_id: number; message: string; created_at: string }
interface ChatWin { convId: number; otherUser: ConvData['other_user']; messages: MsgData[]; draft: string; loading: boolean; sending: boolean; unread: number; lastActivity: number }

const MAX_WINDOWS = 2;
const MAX_BUBBLES = 4;

let conversations = $state<ConvData[]>([]);
let openWindows = $state<ChatWin[]>([]);
let bubbles = $state<ChatWin[]>([]);
let drawerOpen = $state(false);
let loadingConvs = $state(true);
let showOverflow = $state(false);

export function getConversations() { return conversations; }
export function getOpenWindows() { return openWindows; }
export function getBubbles() { return bubbles; }
export function getVisibleBubbles() { return bubbles.slice(0, MAX_BUBBLES); }
export function getOverflowBubbles() { return bubbles.slice(MAX_BUBBLES); }
export function isDrawerOpen() { return drawerOpen; }
export function isLoadingConvs() { return loadingConvs; }
export function isOverflowOpen() { return showOverflow; }
export function toggleOverflow() { showOverflow = !showOverflow; }
export function getTotalUnread() { return conversations.reduce((s, c) => s + c.unread, 0); }

export function toggleDrawer() { drawerOpen = !drawerOpen; }
export function closeDrawer() { drawerOpen = false; }

export async function fetchConversations() {
	loadingConvs = true;
	try { const r = await api<any>('/chat/conversations'); conversations = r.data || []; } catch {}
	finally { loadingConvs = false; }
}

export function openWindow(conv: ConvData) {
	drawerOpen = false;
	if (openWindows.find(w => w.convId === conv.id)) return;
	const eb = bubbles.find(b => b.convId === conv.id);
	if (eb) { promoteBubble(eb); return; }
	const win: ChatWin = { convId: conv.id, otherUser: conv.other_user, messages: [], draft: '', loading: true, sending: false, unread: 0, lastActivity: Date.now() };
	if (openWindows.length >= MAX_WINDOWS) {
		const oldest = openWindows.reduce((a, b) => a.lastActivity < b.lastActivity ? a : b);
		minimizeWindow(oldest);
	}
	openWindows = [...openWindows, win];
	conv.unread = 0;
	loadMessages(win);
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

async function loadMessages(w: ChatWin) {
	w.loading = true;
	try { const r = await api<any>(`/chat/conversations/${w.convId}/messages`); w.messages = r.data || []; } catch {}
	finally { w.loading = false; }
}

export async function sendMsg(w: ChatWin) {
	if (!w.draft?.trim()) return;
	w.sending = true;
	try {
		const r = await api<any>('/chat/messages', { method: 'POST', body: { receiver_id: w.otherUser?.id, message: w.draft } });
		if (r.success) {
			w.messages = [...w.messages, r.data];
			w.draft = '';
			w.lastActivity = Date.now();
			const c = conversations.find(x => x.id === w.convId);
			if (c) { c.last_message = r.data.message; c.last_message_at = r.data.created_at; }
		}
	} catch {}
	finally { w.sending = false; }
}

export function minimizeWindow(w: ChatWin) {
	openWindows = openWindows.filter(x => x.convId !== w.convId);
	bubbles = [w, ...bubbles.filter(b => b.convId !== w.convId)];
}

export function promoteBubble(b: ChatWin) {
	bubbles = bubbles.filter(x => x.convId !== b.convId);
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
	const w = openWindows.find(x => x.convId === convId);
	if (w) w.draft = text;
}

export function handleIncomingMessage(data: { conversation_id: number; message: MsgData }) {
	const w = openWindows.find(x => x.convId === data.conversation_id);
	if (w) { w.messages = [...w.messages, data.message]; w.lastActivity = Date.now(); }
	const b = bubbles.find(x => x.convId === data.conversation_id);
	if (b) { b.unread++; b.lastActivity = Date.now(); bubbles = [...bubbles].sort((a, c) => c.lastActivity - a.lastActivity); }
	const c = conversations.find(x => x.id === data.conversation_id);
	if (c) { c.last_message = data.message.message; c.last_message_at = data.message.created_at; if (!w) c.unread++; }
	if (!w && !b && !c) fetchConversations();
}
