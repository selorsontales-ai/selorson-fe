<script lang="ts">
	import { api } from '$lib/api';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import { getToken, getUser, isAuthenticated } from '$lib/stores/auth.svelte';
	import { getConversations, fetchConversations, sortConversations, type ConvData } from '$lib/stores/chat.svelte';
	import * as m from '$lib/paraglide/messages';


	interface Msg { id: number; sender_id: number; message: string; is_read: boolean; created_at: string; }

	let { data = { conversations: [], ssrAccessToken: null } }: { data?: { conversations?: any[]; ssrAccessToken?: string | null } } = $props();
	let activeConv = $state<ConvData | null>(null);
	let messages = $state<Msg[]>([]);
	let newMsg = $state('');
	let loading = $state(true);
	let ws: WebSocket | null = null;
	let msgsEl = $state<HTMLElement | null>(null);

	onMount(async () => {
		if (!isAuthenticated()) { loading = false; return; }
		if (getConversations().length === 0) {
			await fetchConversations();
		}
		loading = false;
	});

	$effect(() => {
		const convId = page.url.searchParams.get('conv');
		if (convId && getConversations().length > 0) {
			const id = parseInt(convId);
			if (activeConv?.id !== id) {
				const c = getConversations().find(x => x.id === id);
				if (c) selectConv(c);
			}
		}
	});

	onDestroy(() => { ws?.close(); });

	async function selectConv(conv: ConvData) {
		const hadUnread = (conv.unread || 0) > 0;
		activeConv = conv;
		ws?.close();

		// Load history
		try {
			const res = await api<any>(`/chat/conversations/${conv.id}/messages`);
			messages = res.data || [];
		} catch { messages = []; }

		// Smart scroll: if unread, scroll to first unread; otherwise scroll to bottom
		setTimeout(() => {
			if (!msgsEl) return;
			if (hadUnread) {
				const firstUnread = msgsEl.querySelector('.msg.unread');
				if (firstUnread) { firstUnread.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
			}
			msgsEl.scrollTop = msgsEl.scrollHeight;
		}, 80);

		// Connect WS
		const token = getToken();
		if (!token) return;
		const wsProtocol = PUBLIC_API_BASE.startsWith('https') ? 'wss://' : 'ws://';
		const wsBase = PUBLIC_API_BASE.replace(/^https?:\/\//, wsProtocol);
		const wsUrl = `${wsBase}/ws/chat?token=${token}&conversation_id=${conv.id}`;
		ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data);
				if (!msg.body || !msg.timestamp || !msg.sender_id) return; // Only process valid ChatMessage payloads
				
				// If we sent this message, POST /chat/messages will handle adding it to the UI
				if (msg.sender_id === getUser()?.id) return;
				
				// Prevent duplicate messages if added by POST
				if (messages.find(m => m.id === msg.message?.id || m.id === msg.id)) return;
				messages = [...messages, {
					id: msg.message?.id || msg.id || Date.now(),
					sender_id: msg.sender_id,
					message: msg.body,
					is_read: false,
					created_at: msg.timestamp,
				}];
				setTimeout(() => { if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
			} catch {}
		};
	}

	async function sendMessage() {
		if (!newMsg.trim()) return;
		const text = newMsg;
		newMsg = '';
		try {
			const r = await api<any>('/chat/messages', {
				method: 'POST',
				body: { receiver_id: activeConv?.other_user?.id, message: text }
			});
			if (r.success) {
				// The WS might receive it too, so we just add it if not exists
				if (!messages.find(m => m.id === r.data.id)) {
					messages = [...messages, r.data];
				}
				const c = getConversations().find(x => x.id === activeConv?.id);
				if (c) {
					c.last_message = r.data.message;
					c.last_message_at = r.data.created_at;
					sortConversations();
				}
				// Scroll
				setTimeout(() => { if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
			}
		} catch {}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	}

	const me = $derived(getUser());
</script>

<svelte:head><title>{m.msg_seo_title()}</title></svelte:head>

<section class="messages-page">
	{#if !isAuthenticated()}
		<div class="empty"><h3>{m.msg_require_login()}</h3></div>
	{:else}
		<div class="chat-layout">
			<aside class="conv-list glass-card">
				<h2>{m.msg_title()}</h2>
				{#if loading}
					<p class="loading-text">{m.msg_loading()}</p>
				{:else if getConversations().length === 0}
					<p class="empty-text">{m.msg_empty_list()}</p>
				{:else}
					{#each getConversations() as conv}
						<button
							class="conv-item"
							class:active={activeConv?.id === conv.id}
							onclick={() => selectConv(conv)}
						>
							<div class="conv-avatar">
								{#if conv.other_user?.avatar}
									<img src={conv.other_user.avatar} alt="" />
								{:else}
									<span>{conv.other_user?.name?.charAt(0) || '?'}</span>
								{/if}
								{#if conv.other_user?.is_online}
									<span class="online-dot"></span>
								{/if}
							</div>
							<div class="conv-info">
								<strong>{conv.other_user?.name || m.msg_unknown_user()}</strong>
								<span class="conv-time">{conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString('vi-VN') : ''}</span>
							</div>
							{#if (conv.unread || 0) > 0}
								<span class="conv-unread">{conv.unread > 9 ? '9+' : conv.unread}</span>
							{/if}
						</button>
					{/each}
				{/if}
			</aside>

			<main class="chat-panel glass-card">
				{#if !activeConv}
					<div class="no-chat"><p>{m.msg_select_chat()}</p></div>
				{:else}
					<div class="chat-header">
						<strong>{activeConv.other_user?.name}</strong>
						<span class="status">{activeConv.other_user?.is_online ? m.msg_status_online() : m.msg_status_offline()}</span>
					</div>

					<div class="chat-messages" bind:this={msgsEl}>
						{#each messages as msg}
							<div class="msg" class:mine={msg.sender_id === getUser()?.id} class:unread={!msg.is_read && msg.sender_id !== getUser()?.id}>
								<div class="msg-bubble">{msg.message}</div>
								<span class="msg-time">{new Date(msg.created_at).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span>
							</div>
						{/each}
					</div>

					<div class="chat-input">
						<input
							type="text"
							placeholder={m.msg_input_placeholder()}
							bind:value={newMsg}
							onkeydown={handleKeydown}
						/>
						<button class="btn-brand" onclick={sendMessage}>{m.msg_btn_send()}</button>
					</div>
				{/if}
			</main>
		</div>
	{/if}
</section>

<style>
	.messages-page{max-width:1100px;margin:0 auto;padding:2rem 1.5rem 4rem}
	.empty{text-align:center;padding:4rem;color:var(--color-text-muted)}
	.chat-layout{display:grid;grid-template-columns:300px 1fr;gap:1rem;height:calc(100vh - 160px)}
	.conv-list{padding:1rem;overflow-y:auto}
	.conv-list h2{font-size:1rem;font-weight:700;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid rgba(255,255,255,.06)}
	.loading-text,.empty-text{font-size:.85rem;color:var(--color-text-muted);text-align:center;padding:1rem}
	.conv-item{display:flex;align-items:center;gap:.75rem;width:100%;padding:.65rem .5rem;border:none;background:transparent;border-radius:var(--radius-sm);cursor:pointer;transition:background .15s;text-align:left;font-family:inherit;color:inherit}
	.conv-item:hover{background:rgba(255,255,255,.04)}
	.conv-item.active{background:rgba(12,113,61,.1)}
	.conv-avatar{position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--color-surface-300);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem}
	.conv-avatar img{width:100%;height:100%;object-fit:cover}
	.online-dot{position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:var(--color-success);border:2px solid var(--color-surface-50);border-radius:50%}
	.conv-info{flex:1;min-width:0}
	.conv-info strong{display:block;font-size:.85rem}
	.conv-time{font-size:.72rem;color:var(--color-text-muted)}
	.conv-unread{background:var(--color-danger);color:white;border-radius:10px;padding:0.1rem 0.4rem;font-size:.7rem;font-weight:700;margin-left:auto}
	.chat-panel{display:flex;flex-direction:column;padding:0;overflow:hidden}
	.no-chat{flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted)}
	.chat-header{padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:.75rem}
	.chat-header strong{font-size:.95rem}
	.status{font-size:.75rem;color:var(--color-text-muted)}
	.chat-messages{flex:1;overflow-y:auto;padding:1rem 1.25rem;display:flex;flex-direction:column;gap:.5rem}
	.msg{display:flex;flex-direction:column;max-width:70%}
	.msg.mine{align-self:flex-end}
	.msg-bubble{padding:.5rem .75rem;border-radius:var(--radius-md);font-size:.88rem;line-height:1.5;background:var(--color-surface-300)}
	.msg.mine .msg-bubble{background:rgba(12,113,61,.25);color:var(--color-brand-200)}
	.msg-time{font-size:.65rem;color:var(--color-text-muted);margin-top:.15rem}
	.msg.mine .msg-time{text-align:right}
	.chat-input{display:flex;gap:.5rem;padding:.75rem 1rem;border-top:1px solid rgba(255,255,255,.06)}
	.chat-input input{flex:1;padding:.5rem .75rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-md);color:var(--color-text-primary);font-family:inherit;font-size:.88rem}
	.chat-input input:focus{outline:none;border-color:var(--color-brand-500)}

	@media (max-width:768px){
		.chat-layout{grid-template-columns:1fr;height:auto}
		.conv-list{max-height:200px}
	}
</style>
