<script lang="ts">
	import { api } from '$lib/api';
	import { onMount, onDestroy } from 'svelte';
	import { getToken, getUser, isAuthenticated } from '$lib/stores/auth.svelte';

	interface Conversation {
		id: number;
		other_user: { id: number; name: string; username: string; avatar: string | null; is_online: boolean } | null;
		updated_at: string;
	}
	interface Msg { id: number; sender_id: number; message: string; is_read: boolean; created_at: string; }

	let { data } = $props();
	let convs = $state<Conversation[]>(data.conversations || []);
	let activeConv = $state<Conversation | null>(null);
	let messages = $state<Msg[]>([]);
	let newMsg = $state('');
	let loading = $state(true);
	let ws: WebSocket | null = null;

	onMount(async () => {
		if (!isAuthenticated()) { loading = false; return; }
		if (convs.length === 0) {
			try {
				const res = await api<any>('/chat/conversations');
				convs = res.data || [];
			} catch {}
		}
		loading = false;
	});

	onDestroy(() => { ws?.close(); });

	async function selectConv(conv: Conversation) {
		activeConv = conv;
		ws?.close();

		// Load history
		try {
			const res = await api<any>(`/chat/messages/${conv.id}`);
			messages = res.data || [];
		} catch { messages = []; }

		// Connect WS
		const token = getToken();
		if (!token) return;
		const wsUrl = `ws://localhost:8001/api/v1/ws/chat?token=${token}&conversation_id=${conv.id}`;
		ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data);
				messages = [...messages, {
					id: Date.now(),
					sender_id: msg.sender_id,
					message: msg.body,
					is_read: false,
					created_at: msg.timestamp,
				}];
			} catch {}
		};
	}

	function sendMessage() {
		if (!newMsg.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(newMsg);
		newMsg = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	}

	const me = $derived(getUser());
</script>

<svelte:head><title>Tin nhắn — Selorson</title></svelte:head>

<section class="messages-page">
	{#if !isAuthenticated()}
		<div class="empty"><h3>Đăng nhập để xem tin nhắn</h3></div>
	{:else}
		<div class="chat-layout">
			<aside class="conv-list glass-card">
				<h2>Tin nhắn</h2>
				{#if loading}
					<p class="loading-text">Đang tải...</p>
				{:else if convs.length === 0}
					<p class="empty-text">Chưa có cuộc trò chuyện nào</p>
				{:else}
					{#each convs as conv}
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
								<strong>{conv.other_user?.name || 'Unknown'}</strong>
								<span class="conv-time">{new Date(conv.updated_at).toLocaleDateString('vi-VN')}</span>
							</div>
						</button>
					{/each}
				{/if}
			</aside>

			<main class="chat-panel glass-card">
				{#if !activeConv}
					<div class="no-chat"><p>Chọn cuộc trò chuyện để bắt đầu</p></div>
				{:else}
					<div class="chat-header">
						<strong>{activeConv.other_user?.name}</strong>
						<span class="status">{activeConv.other_user?.is_online ? '🟢 Online' : '⚫ Offline'}</span>
					</div>

					<div class="chat-messages">
						{#each messages as msg}
							<div class="msg" class:mine={msg.sender_id === me?.id}>
								<div class="msg-bubble">{msg.message}</div>
								<span class="msg-time">{new Date(msg.created_at).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span>
							</div>
						{/each}
					</div>

					<div class="chat-input">
						<input
							type="text"
							placeholder="Nhập tin nhắn..."
							bind:value={newMsg}
							onkeydown={handleKeydown}
						/>
						<button class="btn-brand" onclick={sendMessage}>Gửi</button>
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
