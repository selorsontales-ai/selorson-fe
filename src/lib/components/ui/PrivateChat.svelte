<script lang="ts">
	import { onMount } from 'svelte';
	import { isAuthenticated, getUser } from '$lib/stores/auth.svelte';
	import {
		fetchConversations, getConversations, isDrawerOpen, isLoadingConvs,
		toggleDrawer, closeDrawer, openWindow, getOpenWindows, getBubbles,
		getVisibleBubbles, getOverflowBubbles, isOverflowOpen, toggleOverflow,
		sendMsg, minimizeWindow, closeWindow, promoteBubble, getTotalUnread, updateDraft
	} from '$lib/stores/chat.svelte';

	let msgRefs: Record<number, HTMLElement> = {};

	onMount(() => { if (isAuthenticated()) fetchConversations(); });

	function fmtTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }
	function scrollWin(convId: number) { setTimeout(() => { const el = msgRefs[convId]; if (el) el.scrollTop = el.scrollHeight; }, 50); }

	function handleSend(w: any) { sendMsg(w).then(() => scrollWin(w.convId)); }

	$effect(() => { getOpenWindows().forEach(w => { if (!w.loading) scrollWin(w.convId); }); });
</script>

{#if isAuthenticated()}
<div class="pchat">
	<!-- Click-outside overlay -->
	{#if isDrawerOpen()}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pchat-overlay" onmousedown={closeDrawer}></div>
	{/if}

	<!-- Tab (thin strip on right edge) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pchat-tab-wrap" class:active={isDrawerOpen()} onmousedown={toggleDrawer}>
		<span class="pchat-tab-icon">💬</span>
		{#if getTotalUnread() > 0}<span class="pchat-tab-badge">{getTotalUnread() > 9 ? '9+' : getTotalUnread()}</span>{/if}
	</div>

	<!-- Drawer Panel -->
	{#if isDrawerOpen()}
	<div class="pchat-drawer">
		<div class="pchat-drawer-head"><strong>Tin nhắn</strong><button class="pchat-x" onclick={closeDrawer}>✕</button></div>
		{#if isLoadingConvs()}<div class="pchat-loading">Đang tải...</div>
		{:else if getConversations().length === 0}<div class="pchat-empty">📭 Chưa có tin nhắn</div>
		{:else}
		<div class="pchat-conv-list">
			{#each getConversations() as c}
				<button class="pchat-conv" onclick={() => openWindow(c)}>
					<div class="pchat-conv-av">
						{#if c.other_user?.avatar}<img src={c.other_user.avatar} alt="" />{:else}<span>{(c.other_user?.name||'?')[0]}</span>{/if}
					</div>
					<div class="pchat-conv-info"><strong>{c.other_user?.name}</strong><p>{c.last_message || '...'}</p></div>
					{#if c.unread > 0}<span class="pchat-conv-badge">{c.unread}</span>{/if}
				</button>
			{/each}
		</div>
		{/if}
	</div>
	{/if}

	<!-- Chat Windows (max 2) -->
	{#each getOpenWindows() as w, i}
	<div class="pchat-win" style="right:{i * 340 + 60}px">
		<div class="pchat-win-head">
			<a href="/profile/{w.otherUser?.username}" class="pchat-win-user">
				<div class="pchat-win-av">{#if w.otherUser?.avatar}<img src={w.otherUser.avatar} alt="" />{:else}<span>{(w.otherUser?.name||'?')[0]}</span>{/if}</div>
				<strong>{w.otherUser?.name}</strong>
			</a>
			<div class="pchat-win-btns">
				<button onclick={() => minimizeWindow(w)} title="Thu nhỏ">−</button>
				<button onclick={() => closeWindow(w)} title="Đóng">✕</button>
			</div>
		</div>
		<div class="pchat-win-msgs" bind:this={msgRefs[w.convId]}>
			{#if w.loading}<div class="pchat-loading">Đang tải...</div>
			{:else if w.messages.length === 0}<div class="pchat-empty">Bắt đầu trò chuyện 👋</div>
			{:else}
				{#each w.messages as m}
					<div class="pchat-msg" class:mine={m.sender_id === getUser()?.id}>
						<p>{m.message}</p><span class="pchat-msg-t">{fmtTime(m.created_at)}</span>
					</div>
				{/each}
			{/if}
		</div>
		<div class="pchat-win-input">
			<input value={w.draft} oninput={(e) => updateDraft(w.convId, (e.target as HTMLInputElement).value)}
				placeholder="Nhập tin nhắn..." onkeydown={(e) => { if (e.key === 'Enter') handleSend(w); }} disabled={w.sending} />
			<button onclick={() => handleSend(w)} disabled={!w.draft?.trim() || w.sending}>📤</button>
		</div>
	</div>
	{/each}

	<!-- Bubbles -->
	{#each getVisibleBubbles() as b, i}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pchat-bubble" style="bottom:{i * 52 + 70}px" onmousedown={() => promoteBubble(b)}>
			{#if b.otherUser?.avatar}<img src={b.otherUser.avatar} alt="" />{:else}<span class="pchat-bubble-init">{(b.otherUser?.name||'?')[0]}</span>{/if}
			{#if b.unread > 0}<span class="pchat-bubble-badge">{b.unread}</span>{/if}
		</div>
	{/each}
	{#if getOverflowBubbles().length > 0}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pchat-bubble pchat-overflow" style="bottom:{getVisibleBubbles().length * 52 + 70}px" onmousedown={toggleOverflow}>
			<span>+{getOverflowBubbles().length}</span>
		</div>
		{#if isOverflowOpen()}
		<div class="pchat-overflow-list" style="bottom:{(getVisibleBubbles().length + 1) * 52 + 70}px">
			{#each getOverflowBubbles() as ob}
				<button class="pchat-conv" onclick={() => { promoteBubble(ob); toggleOverflow(); }}>
					<div class="pchat-conv-av">{#if ob.otherUser?.avatar}<img src={ob.otherUser.avatar} alt="" />{:else}<span>{(ob.otherUser?.name||'?')[0]}</span>{/if}</div>
					<strong>{ob.otherUser?.name}</strong>
				</button>
			{/each}
		</div>
		{/if}
	{/if}
</div>
{/if}

<style>
	.pchat{position:fixed;top:0;right:0;z-index:9990;pointer-events:none}
	.pchat-overlay{position:fixed;inset:0;z-index:9989;pointer-events:auto}
	.pchat-tab-wrap{position:fixed;top:80px;right:0;z-index:9991;width:5px;height:48px;background:linear-gradient(180deg,#0c713d,#085a30);border-radius:.375rem 0 0 .375rem;transition:all .25s;overflow:hidden;cursor:pointer;pointer-events:auto;box-shadow:-1px 0 6px rgba(0,0,0,.06)}
	.pchat-tab-wrap:hover,.pchat-tab-wrap.active{width:42px;height:42px;border-radius:.5rem 0 0 .5rem}
	.pchat-tab-icon{font-size:1.1rem;color:#fff;opacity:0;transition:opacity .15s .05s;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
	.pchat-tab-wrap:hover .pchat-tab-icon,.pchat-tab-wrap.active .pchat-tab-icon{opacity:1}
	.pchat-tab-badge{position:absolute;top:2px;right:2px;background:#ef4444;font-size:.5rem;font-weight:700;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center;padding:0 2px;color:#fff}
	.pchat-drawer{position:fixed;top:80px;right:42px;width:320px;height:420px;background:var(--color-surface-100);border-radius:0 0 0 1rem;box-shadow:-4px 4px 24px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.04);border-right:none;display:flex;flex-direction:column;overflow:hidden;z-index:9990;pointer-events:auto;animation:drawerIn .25s ease}
	@keyframes drawerIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
	.pchat-drawer-head{display:flex;justify-content:space-between;align-items:center;padding:.875rem 1rem;border-bottom:1px solid rgba(255,255,255,.06)}
	.pchat-drawer-head strong{font-size:.9375rem}
	.pchat-x{background:none;border:none;font-size:1rem;cursor:pointer;color:var(--color-text-muted);padding:.25rem}
	.pchat-loading,.pchat-empty{padding:2rem;text-align:center;color:var(--color-text-muted);font-size:.8rem}
	.pchat-conv-list{overflow-y:auto;flex:1}
	.pchat-conv{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;cursor:pointer;border:none;background:none;border-bottom:1px solid rgba(255,255,255,.02);transition:background .15s;width:100%;text-align:left;color:var(--color-text-primary)}
	.pchat-conv:hover{background:rgba(12,113,61,.04)}
	.pchat-conv-av{width:40px;height:40px;border-radius:50%;overflow:hidden;background:rgba(12,113,61,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:.875rem;color:var(--color-brand-400)}
	.pchat-conv-av img{width:100%;height:100%;object-fit:cover}
	.pchat-conv-info{flex:1;min-width:0}
	.pchat-conv-info strong{display:block;font-size:.8rem}
	.pchat-conv-info p{margin:0;font-size:.68rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.pchat-conv-badge{background:#ef4444;color:#fff;font-size:.56rem;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center}
	.pchat-win{position:fixed;bottom:0;width:320px;height:400px;background:var(--color-surface-100);border-radius:.75rem .75rem 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;overflow:hidden;z-index:9989;animation:winUp .25s ease;pointer-events:auto}
	@keyframes winUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
	.pchat-win-head{display:flex;align-items:center;justify-content:space-between;padding:.625rem .75rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;flex-shrink:0}
	.pchat-win-user{display:flex;align-items:center;gap:.5rem;text-decoration:none;color:#fff;flex:1;min-width:0}
	.pchat-win-user strong{font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.pchat-win-user:hover strong{opacity:.8}
	.pchat-win-av{width:28px;height:28px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.75rem}
	.pchat-win-av img{width:100%;height:100%;object-fit:cover}
	.pchat-win-btns{display:flex;gap:.25rem}
	.pchat-win-btns button{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:.875rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
	.pchat-win-btns button:hover{background:rgba(255,255,255,.25)}
	.pchat-win-msgs{flex:1;overflow-y:auto;padding:.75rem;display:flex;flex-direction:column;gap:.375rem;scroll-behavior:smooth}
	.pchat-msg{max-width:80%;padding:.5rem .75rem;border-radius:.875rem .875rem .875rem .25rem;background:rgba(255,255,255,.04);align-self:flex-start;animation:msgIn .2s ease}
	.pchat-msg.mine{align-self:flex-end;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border-radius:.875rem .875rem .25rem .875rem}
	@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
	.pchat-msg p{margin:0;font-size:.8rem;line-height:1.4;word-break:break-word}
	.pchat-msg-t{font-size:.5rem;color:var(--color-text-muted);display:block;margin-top:.125rem}
	.pchat-msg.mine .pchat-msg-t{color:rgba(255,255,255,.5);text-align:right}
	.pchat-win-input{display:flex;gap:.375rem;padding:.5rem .75rem;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
	.pchat-win-input input{flex:1;padding:.5rem .75rem;border:1.5px solid rgba(255,255,255,.08);border-radius:1.25rem;font-size:.75rem;font-family:inherit;background:var(--color-surface-200);color:var(--color-text-primary);outline:none}
	.pchat-win-input input:focus{border-color:var(--color-brand-500)}
	.pchat-win-input button{width:32px;height:32px;border-radius:50%;background:#0c713d;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.875rem;flex-shrink:0}
	.pchat-win-input button:disabled{opacity:.4;cursor:not-allowed}
	.pchat-bubble{position:fixed;right:56px;width:44px;height:44px;border-radius:50%;overflow:hidden;background:rgba(12,113,61,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.2);border:2px solid var(--color-surface-50);transition:all .2s;animation:bubbleIn .25s ease;pointer-events:auto;z-index:9988}
	@keyframes bubbleIn{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
	.pchat-bubble:hover{transform:scale(1.1)}
	.pchat-bubble img{width:100%;height:100%;object-fit:cover}
	.pchat-bubble-init{font-weight:700;font-size:.875rem;color:var(--color-brand-400)}
	.pchat-bubble-badge{position:absolute;top:-2px;right:-2px;background:#ef4444;color:#fff;font-size:.5rem;font-weight:700;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center}
	.pchat-overflow{background:var(--color-surface-300);color:#fff;font-size:.75rem;font-weight:700}
	.pchat-overflow-list{position:fixed;right:56px;width:220px;background:var(--color-surface-100);border-radius:.75rem;box-shadow:0 4px 20px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.04);overflow:hidden;z-index:9989;pointer-events:auto}
	@media(max-width:768px){.pchat-tab-wrap{top:56px}.pchat-win{width:calc(100vw - 1rem);right:.5rem !important;height:60vh}.pchat-drawer{width:calc(100vw - 1rem);right:42px;top:56px;height:360px}}
</style>
