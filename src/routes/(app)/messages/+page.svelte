<script lang="ts">
	import { api } from '$lib/api';
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import { getToken, getUser, isAuthenticated, isLoading } from '$lib/stores/auth.svelte';
	import {
		getConversations, getConversationsError, fetchConversations,
		markConversationAsRead, setActivePageConversation, sortConversations,
		setPageMessageListener, setPageStatusListener, deleteConversation,
		type ConvData
	} from '$lib/stores/chat.svelte';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale } from '$lib/i18n-labels';

	interface Msg { id: number; sender_id: number; message: string; is_read: boolean; created_at: string; }

	let activeConv = $state<ConvData | null>(null);
	let messages = $state<Msg[]>([]);
	let newMsg = $state('');
	let loading = $state(true);
	let historyLoading = $state(false);
	let historyError = $state('');
	let sendError = $state('');
	let ws: WebSocket | null = null;
	let msgsEl = $state<HTMLElement | null>(null);

	let conversationsFetched = false;
	$effect(() => {
		if (isLoading()) return;
		if (!isAuthenticated()) {
			loading = false;
			return;
		}
		if (!conversationsFetched) {
			conversationsFetched = true;
			void fetchConversations().finally(() => {
				loading = false;
			});
		} else {
			loading = false;
		}
	});

	let handledTargetUser = $state<string>('');

	setPageMessageListener((convId, incoming) => {
		if (activeConv?.id === convId) {
			if (!messages.some((m) => m.id === incoming.id)) {
				messages = [
					...messages,
					{
						id: incoming.id,
						sender_id: incoming.sender_id,
						message: incoming.message,
						is_read: true,
						created_at: incoming.created_at
					}
				];
				setTimeout(() => {
					if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
				}, 50);
			}
		}
	});

	setPageStatusListener((userId, isOnline) => {
		if (activeConv?.other_user && activeConv.other_user.id === userId) {
			activeConv = {
				...activeConv,
				other_user: { ...activeConv.other_user, is_online: isOnline }
			};
		}
	});

	$effect(() => {
		const convId = page.url.searchParams.get('conv');
		const targetUserId = page.url.searchParams.get('user');
		const list = getConversations();
		if (convId && list.length > 0) {
			const id = parseInt(convId);
			if (activeConv?.id !== id) {
				const c = list.find(x => x.id === id);
				if (c) selectConv(c);
			}
		} else if (!convId && !targetUserId && !activeConv && list.length > 0) {
			selectConv(list[0]);
		}

		if (targetUserId && isAuthenticated() && handledTargetUser !== targetUserId) {
			handledTargetUser = targetUserId;
			startChatWithUser(Number(targetUserId));
		}
	});

	async function startChatWithUser(uid: number) {
		if (!uid || Number.isNaN(uid)) return;
		try {
			const res = await api<any>('/chat/conversations/find-or-create', {
				method: 'POST',
				body: { user_id: uid }
			});
			if (res?.success && res.data?.conversation_id) {
				await fetchConversations();
				const found = getConversations().find(c => c.id === res.data.conversation_id);
				if (found) {
					selectConv(found);
				}
			} else if (res?.message) {
				sendError = res.message;
			}
		} catch (err) {
			sendError = (err as { message?: string })?.message || m.ui_could_not_start_conversation();
		}
	}

	onDestroy(() => {
		ws?.close();
		setActivePageConversation(null);
		setPageMessageListener(null);
		setPageStatusListener(null);
	});

	async function handleDeleteCurrentConv() {
		if (!activeConv) return;
		if (!confirm(m.msg_delete_conv_confirm())) return;
		const deletedId = activeConv.id;
		const ok = await deleteConversation(deletedId);
		if (ok) {
			ws?.close();
			activeConv = null;
			messages = [];
			setActivePageConversation(null);
			const remaining = getConversations();
			if (remaining.length > 0) {
				selectConv(remaining[0]);
			}
		}
	}

	async function selectConv(conv: ConvData) {
		const hadUnread = (conv.unread || 0) > 0;
		activeConv = conv;
		setActivePageConversation(conv.id);
		ws?.close();
		historyLoading = true;
		historyError = '';
		sendError = '';

		try {
			const res = await api<any>(`/chat/conversations/${conv.id}/messages`);
			messages = res.data || [];
			markConversationAsRead(conv.id);
			activeConv = { ...conv, unread: 0 };
		} catch (error) {
			messages = [];
			historyError = (error as { message?: string })?.message || m.ui_could_not_load_conversation_history();
		} finally {
			historyLoading = false;
		}

		setTimeout(() => {
			if (!msgsEl) return;
			if (hadUnread) {
				const firstUnread = msgsEl.querySelector('.msg.unread');
				if (firstUnread) { firstUnread.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
			}
			msgsEl.scrollTop = msgsEl.scrollHeight;
		}, 80);

		const token = getToken();
		if (!token) return;
		const wsProtocol = PUBLIC_API_BASE.startsWith('https') ? 'wss://' : 'ws://';
		const wsBase = PUBLIC_API_BASE.replace(/\/api\/v1\/?$/, '').replace(/^https?:\/\//, wsProtocol);
		const wsUrl = `${wsBase}/ws/chat?token=${token}&conversation_id=${conv.id}`;
		ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data);
				if (!msg.body || !msg.timestamp || !msg.sender_id) return;
				if (msg.sender_id === getUser()?.id) return;
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
		sendError = '';
		try {
			const r = await api<any>('/chat/messages', {
				method: 'POST',
				body: { receiver_id: activeConv?.other_user?.id, message: text }
			});
			if (r.success) {
				if (!messages.find(m => m.id === r.data.id)) {
					messages = [...messages, r.data];
				}
				const c = getConversations().find(x => x.id === activeConv?.id);
				if (c) {
					c.last_message = r.data.message;
					c.last_message_at = r.data.created_at;
					sortConversations();
				}
				setTimeout(() => { if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
			} else if (r.message) {
				newMsg = text;
				sendError = r.message;
			}
		} catch (error) {
			newMsg = text;
			sendError = (error as { message?: string })?.message || m.ui_could_not_send_message();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	}
</script>

<svelte:head><title>{m.msg_seo_title()}</title></svelte:head>

<section class="messages-page">
	{#if !isAuthenticated()}
		<div class="empty"><h3>{m.msg_require_login()}</h3></div>
	{:else}
		<div class="chat-layout" class:has-active-conv={!!activeConv}>
			<aside class="conv-list glass-card">
				<h2>{m.msg_title()}</h2>
				{#if loading}
					<p class="loading-text">{m.msg_loading()}</p>
				{:else if getConversationsError()}
					<p class="error-text">{getConversationsError()}</p>
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
								<div class="conv-info-top">
									<strong>{conv.other_user?.name || m.msg_unknown_user()}</strong>
									<span class="conv-time">{conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString(dateLocale()) : ''}</span>
								</div>
								<p class="conv-preview">{conv.last_message || m.msg_no_messages_preview()}</p>
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
						<div class="chat-peer-row">
							<button type="button" class="mobile-back-btn" onclick={() => activeConv = null} aria-label="Back">←</button>
							<a href="/profile/{activeConv.other_user?.id || activeConv.other_user?.username}" class="chat-peer-link">
								<div class="conv-avatar sm">
									{#if activeConv.other_user?.avatar}
										<img src={activeConv.other_user.avatar} alt="" />
									{:else}
										<span>{activeConv.other_user?.name?.charAt(0) || '?'}</span>
									{/if}
								</div>
								<div>
									<strong>{activeConv.other_user?.name}</strong>
									<span class="status">{activeConv.other_user?.is_online ? m.msg_status_online() : m.msg_status_offline()}</span>
								</div>
							</a>
						</div>
						<div class="chat-header-actions">
							<a href="/profile/{activeConv.other_user?.id || activeConv.other_user?.username}" class="view-prof-btn">
								{m.ui_view_profile()}
							</a>
							<button type="button" class="del-conv-btn" onclick={handleDeleteCurrentConv} title={m.msg_delete_conv()}>
								🗑
							</button>
						</div>
					</div>

					<div class="chat-messages" bind:this={msgsEl}>
						{#if historyLoading}
							<p class="loading-text">{m.msg_loading()}</p>
						{:else if historyError}
							<p class="error-text">{historyError}</p>
						{:else if messages.length === 0}
							<p class="empty-text">{m.pchat_start()}</p>
						{:else}
						{#each messages as msg (msg.id)}
							<div class="msg" class:mine={msg.sender_id === getUser()?.id} class:unread={!msg.is_read && msg.sender_id !== getUser()?.id}>
								<div class="msg-bubble">{msg.message}</div>
								<span class="msg-time">{new Date(msg.created_at).toLocaleTimeString(dateLocale(), {hour:'2-digit', minute:'2-digit'})}</span>
							</div>
						{/each}
						{/if}
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
					{#if sendError}<p class="send-error">{sendError}</p>{/if}
				{/if}
			</main>
		</div>
	{/if}
</section>

<style>
	.messages-page{max-width:1100px;margin:0 auto;padding:clamp(1rem,3vw,2rem) clamp(0.75rem,3vw,1.5rem) 4rem}
	.empty{text-align:center;padding:4rem;color:var(--color-text-muted)}
	.chat-layout{display:grid;grid-template-columns:300px 1fr;gap:1rem;height:calc(100dvh - 160px);min-height:480px}
	.conv-list{padding:1rem;overflow-y:auto}
	.conv-list h2{font-size:1rem;font-weight:700;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid rgba(255,255,255,.06)}
	.loading-text,.empty-text,.error-text{font-size:.85rem;color:var(--color-text-muted);text-align:center;padding:1rem}
	.error-text,.send-error{color:#fca5a5}
	.conv-item{display:flex;align-items:center;gap:.75rem;width:100%;padding:.65rem .5rem;border:none;background:transparent;border-radius:var(--radius-sm);cursor:pointer;transition:background .15s;text-align:left;font-family:inherit;color:inherit}
	.conv-item:hover{background:rgba(255,255,255,.04)}
	.conv-item.active{background:rgba(12,113,61,.1)}
	.conv-avatar{position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--color-surface-300);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem}
	.conv-avatar.sm{width:34px;height:34px;font-size:.78rem}
	.conv-avatar img{width:100%;height:100%;object-fit:cover}
	.online-dot{position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:var(--color-success);border:2px solid var(--color-surface-50);border-radius:50%}
	.conv-info{flex:1;min-width:0}
	.conv-info-top{display:flex;align-items:center;justify-content:space-between;gap:.4rem}
	.conv-info strong{display:block;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.conv-time{font-size:.68rem;color:var(--color-text-muted);flex-shrink:0}
	.conv-preview{margin:.15rem 0 0;font-size:.75rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.conv-unread{background:var(--color-danger);color:white;border-radius:10px;padding:0.1rem 0.4rem;font-size:.7rem;font-weight:700;margin-left:auto}
	.chat-panel{display:flex;flex-direction:column;padding:0;overflow:hidden}
	.no-chat{flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted)}
	.chat-header{padding:.85rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem}
	.chat-peer-row{display:flex;align-items:center;gap:.5rem;min-width:0}
	.mobile-back-btn{display:none;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:var(--color-surface-200);color:var(--color-text-primary);cursor:pointer;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
	.chat-header-actions{display:flex;align-items:center;gap:.5rem}
	.del-conv-btn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:#f87171;border-radius:99px;padding:.3rem .65rem;font-size:.78rem;cursor:pointer;transition:all .15s}
	.del-conv-btn:hover{background:rgba(239,68,68,.24)}
	.chat-peer-link{display:flex;align-items:center;gap:.65rem;text-decoration:none;color:inherit;min-width:0}
	.chat-peer-link:hover strong{color:#fbbf24}
	.chat-peer-link strong{display:block;font-size:.95rem}
	.status{font-size:.72rem;color:var(--color-text-muted)}
	.view-prof-btn{font-size:.78rem;font-weight:600;color:var(--color-text-secondary);text-decoration:none;padding:.35rem .75rem;border-radius:99px;border:1px solid rgba(255,255,255,.12);transition:all .15s;white-space:nowrap}
	.view-prof-btn:hover{border-color:#fbbf24;color:#fbbf24}
	.chat-messages{flex:1;overflow-y:auto;padding:1rem 1.25rem;display:flex;flex-direction:column;gap:.5rem}
	.msg{display:flex;flex-direction:column;max-width:70%}
	.msg.mine{align-self:flex-end}
	.msg-bubble{padding:.5rem .75rem;border-radius:var(--radius-md);font-size:.88rem;line-height:1.5;background:var(--color-surface-300);overflow-wrap:anywhere}
	.msg.mine .msg-bubble{background:rgba(12,113,61,.25);color:var(--color-brand-200)}
	.msg-time{font-size:.65rem;color:var(--color-text-muted);margin-top:.15rem}
	.msg.mine .msg-time{text-align:right}
	.chat-input{display:flex;gap:.5rem;padding:.75rem 1rem;border-top:1px solid rgba(255,255,255,.06)}
	.chat-input input{flex:1;min-width:0;padding:.5rem .75rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-md);color:var(--color-text-primary);font-family:inherit;font-size:.88rem}
	.chat-input input:focus{outline:none;border-color:var(--color-brand-500)}
	.send-error{font-size:.75rem;margin:0;padding:0 1rem .75rem}

	@media (max-width:768px){
		.chat-layout{grid-template-columns:1fr;height:calc(100dvh - 130px)}
		.chat-layout.has-active-conv .conv-list{display:none}
		.chat-layout:not(.has-active-conv) .chat-panel{display:none}
		.mobile-back-btn{display:inline-flex}
		.msg{max-width:85%}
	}
</style>
