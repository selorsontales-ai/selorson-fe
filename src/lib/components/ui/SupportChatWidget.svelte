<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isAuthenticated, getUser, getToken } from '$lib/stores/auth.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import {
		fetchActiveConversation, sendSupportMessage, fetchUnreadCount,
		rateTicket, markSupportRead, getSupportMessages, getActiveConversation,
		getSupportUnread, isSupportSending, createTicket, closeTicket,
		isChatWidgetHidden, setChatWidgetHidden
	} from '$lib/stores/support.svelte';
	import * as m from '$lib/paraglide/messages';

	let isOpen = $state(false);
	let inputText = $state('');
	let ratingValue = $state(0);
	let ratingComment = $state('');
	let hasRated = $state(false);
	let isStaffOnline = $state(false);
	let messagesEl = $state<HTMLDivElement>();

	// Drag to dismiss states
	let isDragging = $state(false);
	let dragX = $state(0);
	let dragY = $state(0);
	let startX = $state(0);
	let startY = $state(0);
	let showDismissZone = $state(false);
	let isHoveringZone = $state(false);

	function scrollBottom() { setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50); }

	function closeWidget(e?: Event) {
		if (e) {
			e.stopPropagation();
			e.preventDefault();
		}
		setChatWidgetHidden(true);
		isOpen = false;
	}

	function handleTouchStart(e: TouchEvent) {
		if (isOpen) return; // Don't drag if open
		isDragging = true;
		startX = e.touches[0].clientX - dragX;
		startY = e.touches[0].clientY - dragY;
		setTimeout(() => {
			if (isDragging) showDismissZone = true;
		}, 200);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		e.preventDefault(); // Prevent scrolling while dragging
		dragX = e.touches[0].clientX - startX;
		dragY = e.touches[0].clientY - startY;

		// Check if inside dismiss zone (bottom 100px)
		const windowHeight = window.innerHeight;
		if (e.touches[0].clientY > windowHeight - 100) {
			isHoveringZone = true;
		} else {
			isHoveringZone = false;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!isDragging) return;
		isDragging = false;
		showDismissZone = false;
		if (isHoveringZone) {
			closeWidget();
		}
		// Reset position
		dragX = 0;
		dragY = 0;
		isHoveringZone = false;
	}

	async function toggle(e?: Event) {
		if (isDragging) return; // Prevent toggle if it was a drag
		if (e && (e.target as HTMLElement).closest('.fab-close')) return;
		isOpen = !isOpen;
		if (isOpen) {
			await fetchActiveConversation();
			scrollBottom();
			const conv = getActiveConversation();
			if (conv) await markSupportRead(conv.id);
		}
	}

	async function handleSend() {
		if (!inputText.trim()) return;
		const text = inputText; inputText = '';
		const conv = getActiveConversation();
		if (conv && conv.status !== 'resolved' && conv.status !== 'closed') { 
			await sendSupportMessage(conv.id, text); 
		} else {
			await createTicket(text);
			await fetchActiveConversation();
		}
		scrollBottom();
	}

	async function submitRating() {
		const conv = getActiveConversation();
		if (!conv) return;
		await rateTicket(conv.id, ratingValue, ratingComment || undefined);
		hasRated = true;
	}

	async function skipRating() {
		const conv = getActiveConversation();
		if (!conv) return;
		await closeTicket(conv.id);
		hasRated = true;
	}

	function formatTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

	let sse: EventSource | null = null;

	$effect(() => { 
		if (isAuthenticated()) {
			fetchUnreadCount(); 
			
			const token = getToken();
			if (token && !sse) {
				const sseUrl = `${PUBLIC_API_BASE}/support/stream?token=${token}`;
				sse = new EventSource(sseUrl);
				sse.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						if (data.type === 'support_update') {
							if (isOpen && getActiveConversation()?.id === data.conversation_id) {
								fetchActiveConversation();
							} else {
								fetchUnreadCount();
							}
						}
					} catch {}
				};
			}
		}
	});

	onDestroy(() => {
		if (sse) sse.close();
	});
</script>

{#if isAuthenticated() && !isChatWidgetHidden()}
<div class="support-widget" style="transform: translate({dragX}px, {dragY}px);">
	<!-- FAB Button -->
	<div class="support-fab" class:active={isOpen} class:has-unread={getSupportUnread() > 0 && !isOpen} class:dragging={isDragging}
		role="button"
		tabindex="0"
		onclick={toggle}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
		{#if isOpen}
			<span class="fab-icon">✕</span>
		{:else}
			<img src="/images/ST.jpg" alt="Support" class="fab-image" />
			<button class="fab-close" onclick={closeWidget} title="Tắt hỗ trợ" aria-label="Close">✕</button>
		{/if}
		{#if getSupportUnread() > 0 && !isOpen}
			<span class="fab-badge">{getSupportUnread() > 9 ? '9+' : getSupportUnread()}</span>
		{/if}
		{#if !isOpen}<span class="fab-pulse"></span>{/if}
	</div>

	{#if showDismissZone}
	<div class="dismiss-zone" class:hovering={isHoveringZone}>
		<span class="dismiss-icon">🗑️</span>
		<span>Kéo vào đây để tắt</span>
	</div>
	{/if}

	<!-- Chat Window -->
	{#if isOpen}
	<div class="chat-window">
		<div class="chat-header">
			<div class="chat-header-info">
				<div class="chat-avatar">🎧<span class="online-dot" class:online={isStaffOnline}></span></div>
				<div><h4>{m.support_title()}</h4><span class="online-text">{isStaffOnline ? m.support_online() : m.support_offline()}</span></div>
			</div>
			<button class="chat-minimize" onclick={toggle}>−</button>
		</div>

		<!-- Resolved Banner -->
		{#if getActiveConversation()?.status === 'resolved' && !hasRated}
			<div class="resolved-banner">
				<p>{m.support_resolved()}</p>
				<p class="rating-label">{m.support_rating_label()}</p>
				<div class="star-row">
					{#each [1,2,3,4,5] as s}
						<button class="star-btn" class:filled={s <= ratingValue} onclick={() => ratingValue = s}>★</button>
					{/each}
				</div>
				<textarea bind:value={ratingComment} placeholder={m.support_rating_ph()} rows="2" class="rating-comment"></textarea>
				<div class="rating-actions">
					<button class="rating-skip" onclick={skipRating}>{m.support_rating_skip()}</button>
					<button class="rating-submit" onclick={submitRating}>{m.support_rating_submit()}</button>
				</div>
			</div>
		{/if}

		<!-- Messages -->
		<div class="chat-messages" bind:this={messagesEl}>
			{#if getSupportMessages().length === 0}
				<div class="chat-empty"><span>💬</span><p>{m.support_welcome_title()}</p><p class="hint">{m.support_welcome_desc()}</p></div>
			{/if}
			{#each getSupportMessages() as msg}
				<div class="msg-bubble" class:mine={msg.sender_type === 'user'} class:staff={msg.sender_type === 'manager'}>
					{#if msg.sender_type === 'manager'}
						<div class="msg-avatar">🎧</div>
					{/if}
					<div class="msg-content">
						{#if msg.sender_type === 'manager' && msg.sender}<span class="msg-sender">{msg.sender.name}</span>{/if}
						<p>{msg.message}</p>
						<span class="msg-time">{formatTime(msg.created_at)}</span>
					</div>
				</div>
			{/each}
		</div>

		<!-- Input -->
		{#if getActiveConversation()?.status !== 'resolved' || hasRated}
			<div class="chat-input">
				<input bind:value={inputText} placeholder={isStaffOnline ? m.support_input_online() : m.support_input_offline()}
					onkeydown={(e) => { if (e.key === 'Enter') handleSend(); }} disabled={isSupportSending()} maxlength="2000" />
				<button class="send-btn" onclick={handleSend} disabled={!inputText.trim() || isSupportSending()}>
					{isSupportSending() ? '⏳' : '📤'}
				</button>
			</div>
		{/if}
	</div>
	{/if}
</div>
{/if}

<style>
	.support-widget{position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;font-family:var(--font-sans);transition:transform 0.1s}
	.support-fab{position:relative;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0c713d,#085a30);border:none;box-shadow:0 4px 20px rgba(12,113,61,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s;user-select:none;touch-action:none}
	.support-fab.dragging{transition:none;transform:scale(1.1);opacity:0.9;z-index:10001}
	.support-fab:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(12,113,61,.5)}
	.support-fab.active{background:linear-gradient(135deg,#dc2626,#b91c1c);box-shadow:0 4px 20px rgba(220,38,38,.4)}
	.fab-icon{font-size:1.5rem;color:#fff}
	.fab-image{width:100%;height:100%;object-fit:cover;border-radius:50%}
	.fab-close{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:#ef4444;color:white;border:2px solid var(--color-surface-50);display:none;align-items:center;justify-content:center;font-size:0.75rem;font-weight:bold;cursor:pointer;z-index:10;box-shadow:0 2px 5px rgba(0,0,0,0.2)}
	@media (hover: hover) {
		.support-fab:not(.active):hover .fab-close { display: flex; }
		.support-fab.dragging .fab-close { display: none !important; }
	}
	.fab-close:hover{background:#dc2626;transform:scale(1.1)}
	.support-fab.active .fab-icon{font-size:1.25rem;font-weight:700}
	.fab-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:.625rem;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--color-surface-50);animation:badge-pop .3s ease;z-index:5}
	.fab-pulse{position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(12,113,61,.4);animation:pulse-ring 2s infinite ease-out;pointer-events:none}
	.support-fab.active .fab-pulse{display:none}

	.dismiss-zone{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:200px;height:60px;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border-radius:30px;display:flex;align-items:center;justify-content:center;gap:10px;color:white;font-weight:600;font-size:0.9rem;z-index:10000;border:2px dashed rgba(255,255,255,0.3);animation:fadeUp 0.3s ease;pointer-events:none}
	.dismiss-zone.hovering{background:rgba(239,68,68,0.9);border-color:#ef4444;transform:translateX(-50%) scale(1.1)}
	.dismiss-icon{font-size:1.2rem}
	@keyframes fadeUp{from{opacity:0;transform:translate(-50%,20px)}to{opacity:1;transform:translate(-50%,0)}}

	.chat-window{position:absolute;bottom:calc(100% + .75rem);right:0;width:380px;max-width:calc(100vw - 2rem);height:520px;max-height:calc(100vh - 6rem);background:var(--color-surface-100);border-radius:1rem;box-shadow:0 12px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden;animation:chatIn .3s ease}
	@keyframes chatIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:none}}

	.chat-header{display:flex;align-items:center;justify-content:space-between;padding:.875rem 1rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;flex-shrink:0}
	.chat-header-info{display:flex;align-items:center;gap:.75rem}
	.chat-avatar{position:relative;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0}
	.online-dot{position:absolute;bottom:1px;right:1px;width:10px;height:10px;border-radius:50%;background:#94a3b8;border:2px solid #0c713d}
	.online-dot.online{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,.6)}
	.chat-header h4{margin:0;font-size:.9rem;font-weight:700}
	.online-text{font-size:.68rem;opacity:.8}
	.chat-minimize{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:1.25rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
	.chat-minimize:hover{background:rgba(255,255,255,.25)}

	.resolved-banner{padding:1rem;background:rgba(34,197,94,.06);border-bottom:1px solid rgba(34,197,94,.1);flex-shrink:0}
	.resolved-banner>p{margin:0 0 .5rem;font-size:.8rem;font-weight:600;color:#22c55e}
	.rating-label{font-size:.75rem;color:var(--color-text-muted);margin:0 0 .25rem}
	.star-row{display:flex;gap:.25rem;margin-bottom:.5rem}
	.star-btn{font-size:1.5rem;background:none;border:none;cursor:pointer;color:rgba(255,255,255,.15);transition:all .15s;padding:0}
	.star-btn.filled{color:#fbbf24}
	.star-btn:hover{transform:scale(1.2)}
	.rating-comment{width:100%;padding:.5rem;border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:.75rem;font-family:inherit;resize:none;margin-bottom:.5rem;background:var(--color-surface-200);color:var(--color-text-primary)}
	.rating-actions{display:flex;gap:.5rem}
	.rating-skip{flex:1;padding:.35rem;background:transparent;color:var(--color-text-muted);border:1px solid rgba(255,255,255,.08);border-radius:8px;font-size:.75rem;cursor:pointer}
	.rating-submit{flex:1;padding:.35rem;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:.75rem;font-weight:600;cursor:pointer}

	.chat-messages{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.625rem;scroll-behavior:smooth}
	.chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;text-align:center}
	.chat-empty span{font-size:2.5rem}
	.chat-empty p{margin:0;font-size:.85rem;font-weight:600;color:var(--color-text-primary)}
	.chat-empty .hint{font-size:.75rem;font-weight:400;color:var(--color-text-muted)}

	.msg-bubble{display:flex;gap:.5rem;max-width:85%;animation:msgIn .25s ease}
	.msg-bubble.mine{align-self:flex-end;flex-direction:row-reverse}
	@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
	.msg-avatar{width:28px;height:28px;border-radius:50%;background:rgba(12,113,61,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.85rem}
	.msg-content{padding:.5rem .875rem;border-radius:1rem;position:relative}
	.msg-bubble.mine .msg-content{background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border-bottom-right-radius:.25rem}
	.msg-bubble.staff .msg-content{background:rgba(74,222,128,.06);border-bottom-left-radius:.25rem}
	.msg-sender{font-size:.625rem;font-weight:600;color:var(--color-brand-400);display:block;margin-bottom:.125rem}
	.msg-content p{margin:0;font-size:.8rem;line-height:1.5;word-break:break-word}
	.msg-bubble.mine .msg-content p{color:#fff}
	.msg-time{font-size:.5625rem;color:var(--color-text-muted);display:block;margin-top:.25rem}
	.msg-bubble.mine .msg-time{color:rgba(255,255,255,.6);text-align:right}

	.chat-input{display:flex;align-items:center;gap:.5rem;padding:.75rem;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
	.chat-input input{flex:1;padding:.625rem .875rem;border:2px solid rgba(255,255,255,.08);border-radius:1.5rem;font-size:.8rem;font-family:inherit;outline:none;background:var(--color-surface-200);color:var(--color-text-primary);transition:border-color .2s}
	.chat-input input:focus{border-color:var(--color-brand-500)}
	.send-btn{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0c713d,#085a30);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.1rem;transition:all .2s;flex-shrink:0}
	.send-btn:hover:not(:disabled){transform:scale(1.1)}
	.send-btn:disabled{opacity:.5;cursor:not-allowed}

	@keyframes pulse-ring{0%{transform:scale(1);opacity:1}100%{transform:scale(1.5);opacity:0}}
	@keyframes badge-pop{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}

	@media(max-width:640px){
		.support-widget{bottom:1rem;right:1rem}
		.support-fab{width:50px;height:50px}
		.chat-window{width:calc(100vw - 1.5rem);height:calc(100vh - 8rem);right:-.5rem}
	}
</style>
