<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isAuthenticated, getUser, getToken } from '$lib/stores/auth.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import * as m from '$lib/paraglide/messages';

	let isOpen = $state(false);
	let isMinimized = $state(true);
	let messages = $state<any[]>([]);
	let newMsg = $state('');
	let onlineCount = $state(0);
	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout>;
	let chatContainer = $state<HTMLElement | null>(null);

	onMount(() => {
		if (isAuthenticated()) connectWebSocket();
		return () => { if (ws) ws.close(); if (reconnectTimer) clearTimeout(reconnectTimer); };
	});

	function connectWebSocket() {
		const token = getToken();
		if (!token) return;

		const wsUrl = PUBLIC_API_BASE.replace('http', 'ws').replace('/api/v1', '') + '/ws/chat?token=' + token;

		try {
			ws = new WebSocket(wsUrl);

			ws.onopen = () => { onlineCount = 1; };

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'chat_message') {
						if (data.conversation_id === 0 || !data.conversation_id) {
							messages = [...messages.slice(-99), data]; // Keep last 100
							scrollToBottom();
						} else {
							// It's a Private Chat message!
							import('$lib/stores/chat.svelte').then(m => m.handleIncomingMessage({
								conversation_id: data.conversation_id,
								message: data.message
							}));
						}
					} else if (data.type === 'user_count') {
						onlineCount = data.count || 0;
					} else if (data.type === 'system') {
						messages = [...messages.slice(-99), { ...data, is_system: true }];
					}
				} catch {}
			};

			ws.onclose = () => {
				// Auto-reconnect after 3s
				reconnectTimer = setTimeout(() => {
					if (isAuthenticated()) connectWebSocket();
				}, 3000);
			};
		} catch {}
	}

	function sendMessage() {
		if (!newMsg.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify({
			type: 'chat_message',
			content: newMsg.trim(),
		}));
		newMsg = '';
	}

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
		});
	}

	function toggleChat() {
		if (isMinimized) { isMinimized = false; isOpen = true; scrollToBottom(); }
		else { isMinimized = true; isOpen = false; }
	}

	function timeStr(ts: string) {
		if (!ts) return '';
		return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
	}
</script>

{#if isAuthenticated()}
	<div class="global-chat" class:open={isOpen} class:minimized={isMinimized}>
		<!-- Toggle Bar -->
		<button class="chat-toggle" onclick={toggleChat}>
			<span class="toggle-indicator"></span>
			<span class="toggle-label">
				{#if isMinimized}
					💬 Chat ({onlineCount})
				{:else}
					{m.gchat_close()}
				{/if}
			</span>
		</button>

		<!-- Chat Panel -->
		{#if isOpen}
			<div class="chat-panel">
				<div class="chat-header">
					<h4>{m.gchat_title()}</h4>
					<span class="online-dot"></span>
					<span class="online-count">{onlineCount} online</span>
				</div>

				<div class="chat-messages" bind:this={chatContainer}>
					{#each messages as msg}
						{#if msg.is_system}
							<div class="msg-system">{msg.content}</div>
						{:else}
							{@const isSelf = msg.user_id === getUser()?.id}
							<div class="msg" class:self={isSelf}>
								{#if !isSelf}
									<div class="msg-avatar">
										{#if msg.avatar}
											<img src={msg.avatar} alt="" />
										{:else}
											<span>{msg.username?.charAt(0) || '?'}</span>
										{/if}
									</div>
								{/if}
								<div class="msg-body">
									{#if !isSelf}
										<span class="msg-name">{msg.username || 'User'}</span>
									{/if}
									<p class="msg-text">{msg.content}</p>
									<span class="msg-time">{timeStr(msg.timestamp)}</span>
								</div>
							</div>
						{/if}
					{:else}
						<div class="msg-empty">{m.gchat_empty()}</div>
					{/each}
				</div>

				<div class="chat-input">
					<input
						type="text"
						bind:value={newMsg}
						placeholder={m.gchat_input()}
						onkeydown={(e) => { if (e.key === 'Enter') sendMessage(); }}
					/>
					<button class="send-btn" onclick={sendMessage} disabled={!newMsg.trim()}>
						➤
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.global-chat {
		position: fixed;
		bottom: 0;
		right: 1.5rem;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	/* Toggle Button */
	.chat-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(14, 14, 22, 0.95);
		border: 1px solid rgba(255,255,255,0.08);
		border-bottom: none;
		border-radius: 10px 10px 0 0;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: all 0.2s;
	}
	.chat-toggle:hover { background: rgba(12,113,61,0.15); color: var(--color-text-primary); }

	.toggle-indicator {
		width: 8px; height: 8px; border-radius: 50%;
		background: #22c55e;
		box-shadow: 0 0 6px rgba(34,197,94,0.4);
		animation: pulse 2s infinite;
	}
	@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

	/* Chat Panel */
	.chat-panel {
		width: 340px;
		max-height: 450px;
		background: rgba(14, 14, 22, 0.98);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 12px 12px 0 0;
		border-bottom: none;
		display: flex;
		flex-direction: column;
		backdrop-filter: blur(20px);
		animation: slideUp 0.25s ease;
	}
	@keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
	}
	.chat-header h4 { font-size: 0.9rem; font-weight: 600; margin: 0; }
	.online-dot {
		width: 6px; height: 6px; border-radius: 50%;
		background: #22c55e;
		margin-left: auto;
	}
	.online-count { font-size: 0.7rem; color: var(--color-text-muted); }

	/* Messages */
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 300px;
		min-height: 200px;
	}

	.msg { display: flex; gap: 0.5rem; align-items: flex-start; }
	.msg.self { flex-direction: row-reverse; }

	.msg-avatar {
		width: 28px; height: 28px; border-radius: 50%;
		overflow: hidden; flex-shrink: 0;
		background: var(--color-surface-300);
		display: flex; align-items: center; justify-content: center;
	}
	.msg-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.msg-avatar span { font-size: 0.65rem; font-weight: 700; color: var(--color-text-muted); }

	.msg-body { max-width: 75%; }
	.msg-name { font-size: 0.65rem; font-weight: 600; color: var(--color-brand-400); display: block; margin-bottom: 0.1rem; }
	.msg-text {
		font-size: 0.8rem; line-height: 1.4; padding: 0.4rem 0.65rem;
		background: rgba(255,255,255,0.05); border-radius: 10px;
		color: var(--color-text-primary); word-break: break-word;
	}
	.msg.self .msg-text { background: rgba(12,113,61,0.2); border: 1px solid rgba(12,113,61,0.25); }
	.msg-time { font-size: 0.6rem; color: var(--color-text-muted); display: block; margin-top: 0.1rem; }
	.msg.self .msg-time { text-align: right; }

	.msg-system {
		text-align: center; font-size: 0.7rem;
		color: var(--color-text-muted); font-style: italic;
		padding: 0.25rem 0;
	}

	.msg-empty {
		text-align: center; font-size: 0.78rem;
		color: var(--color-text-muted); padding: 2rem 0.5rem;
	}

	/* Input */
	.chat-input {
		display: flex; gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid rgba(255,255,255,0.06);
	}
	.chat-input input {
		flex: 1;
		background: rgba(0,0,0,0.2);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 8px;
		padding: 0.4rem 0.65rem;
		color: var(--color-text-primary);
		font-size: 0.8rem;
		outline: none;
	}
	.chat-input input:focus { border-color: var(--color-brand-500); }
	.send-btn {
		width: 32px; height: 32px;
		border-radius: 8px; border: none;
		background: var(--color-brand-500);
		color: #fff; cursor: pointer;
		font-size: 0.9rem;
		display: flex; align-items: center; justify-content: center;
		transition: transform 0.1s;
	}
	.send-btn:hover { transform: scale(1.05); }
	.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	@media (max-width: 480px) {
		.chat-panel { width: calc(100vw - 2rem); }
		.global-chat { right: 1rem; }
	}
</style>
