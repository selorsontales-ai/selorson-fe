<script lang="ts">
	import { onMount } from 'svelte';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale } from '$lib/i18n-labels';
	import {
		fetchTickets, createTicket, fetchMessages, sendSupportMessage,
		rateTicket, getSupportTickets, getSupportMessages, getActiveTicket,
		isSupportLoading, markSupportRead
	} from '$lib/stores/support.svelte';

	let view = $state<'list' | 'chat'>('list');
	let newMessage = $state('');
	let newTicketMsg = $state('');
	let showNewTicket = $state(false);
	let selectedRating = $state(0);

	onMount(() => { if (isAuthenticated()) fetchTickets(); });

	async function handleCreateTicket() {
		if (!newTicketMsg.trim()) return;
		await createTicket(newTicketMsg);
		newTicketMsg = '';
		showNewTicket = false;
	}

	async function openTicket(id: number) {
		await fetchMessages(id);
		await markSupportRead(id);
		view = 'chat';
	}

	async function handleSend() {
		const ticket = getActiveTicket();
		if (!newMessage.trim() || !ticket) return;
		await sendSupportMessage(ticket.id, newMessage);
		newMessage = '';
	}

	async function handleRate(rating: number) {
		const ticket = getActiveTicket();
		if (!ticket) return;
		selectedRating = rating;
		await rateTicket(ticket.id, rating);
	}

	function statusColor(status: string) {
		if (status === 'pending') return '#f59e0b';
		if (status === 'active') return '#22c55e';
		return '#6b7280';
	}
</script>

<svelte:head><title>{m.support_title()}</title></svelte:head>

<div class="support-page">
	{#if !isAuthenticated()}
		<div class="auth-required">
			<h2>{m.support_login_required()}</h2>
		</div>
	{:else if view === 'list'}
		<div class="support-header">
			<h1>{m.support_heading()}</h1>
			<button class="btn-primary" onclick={() => showNewTicket = true}>{m.support_new_ticket_btn()}</button>
		</div>

		{#if showNewTicket}
			<div class="new-ticket-card">
				<h3>{m.support_describe_issue()}</h3>
				<textarea bind:value={newTicketMsg} placeholder={m.support_input_ph()} rows="4"></textarea>
				<div class="ticket-actions">
					<button class="btn-ghost" onclick={() => showNewTicket = false}>{m.crop_cancel()}</button>
					<button class="btn-primary" onclick={handleCreateTicket} disabled={!newTicketMsg.trim()}>{m.support_rating_submit()}</button>
				</div>
			</div>
		{/if}

		{#if isSupportLoading()}
			<div class="loading">{m.support_loading()}</div>
		{:else}
			<div class="ticket-list">
				{#each getSupportTickets() as ticket}
					<button class="ticket-card" onclick={() => openTicket(ticket.id)}>
						<div class="ticket-meta">
							<span class="status-dot" style="background:{statusColor(ticket.status)}"></span>
							<span class="ticket-status">{ticket.status}</span>
							{#if ticket.unread_count > 0}
								<span class="unread-badge">{ticket.unread_count}</span>
							{/if}
						</div>
						<p class="ticket-preview">{ticket.last_message?.message || m.support_no_messages()}</p>
						<span class="ticket-date">{new Date(ticket.created_at).toLocaleDateString(dateLocale())}</span>
					</button>
				{:else}
					<div class="empty-state">
						<p>{m.support_empty_tickets()}</p>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="chat-view">
			<button class="back-btn" onclick={() => view = 'list'}>{m.support_back_btn()}</button>

			<div class="messages-container">
				{#each getSupportMessages() as msg}
					<div class="message" class:own={msg.sender_type === 'user'} class:manager={msg.sender_type === 'manager'}>
						<div class="msg-header">
							<strong>{msg.sender?.name || 'Support'}</strong>
							<span class="msg-time">{new Date(msg.created_at).toLocaleTimeString(dateLocale())}</span>
						</div>
						<p>{msg.message}</p>
					</div>
				{/each}
			</div>

			{#if getActiveTicket()?.status !== 'resolved'}
				<div class="chat-input">
					<input type="text" bind:value={newMessage} placeholder={m.support_input_online()}
						onkeydown={(e) => { if (e.key === 'Enter') handleSend(); }} />
					<button class="btn-primary" onclick={handleSend}>{m.support_rating_submit()}</button>
				</div>
			{:else}
				<div class="resolved-banner">
					<p>{m.support_resolved_banner()}</p>
					<div class="rating-section">
						<p>{m.support_rate_prompt()}</p>
						<div class="stars">
							{#each [1,2,3,4,5] as star}
								<button class="star" class:active={star <= selectedRating} onclick={() => handleRate(star)}>★</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.support-page { max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; }
	.support-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.support-header h1 { font-size: 1.75rem; font-weight: 700; }
	.auth-required { text-align: center; padding: 4rem 2rem; color: var(--color-text-muted); }

	.btn-primary { padding: 0.6rem 1.25rem; background: linear-gradient(135deg, #0c713d, #06b6d4); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; transition: transform .15s; }
	.btn-primary:hover { transform: translateY(-1px); }
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-ghost { padding: 0.6rem 1.25rem; background: none; border: 1px solid rgba(255,255,255,.1); color: var(--color-text-secondary); border-radius: 8px; cursor: pointer; }

	.new-ticket-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
	.new-ticket-card h3 { margin-bottom: 0.75rem; }
	.new-ticket-card textarea { width: 100%; background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 0.75rem; color: var(--color-text-primary); resize: vertical; font-family: inherit; }
	.ticket-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.75rem; }

	.ticket-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.ticket-card { display: block; width: 100%; text-align: left; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 1rem 1.25rem; cursor: pointer; transition: all .2s; color: var(--color-text-primary); }
	.ticket-card:hover { border-color: rgba(12,113,61,.3); background: rgba(255,255,255,.05); }
	.ticket-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.status-dot { width: 8px; height: 8px; border-radius: 50%; }
	.ticket-status { font-size: 0.8rem; text-transform: uppercase; font-weight: 600; letter-spacing: .05em; }
	.unread-badge { background: #ef4444; color: #fff; font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 999px; font-weight: 700; }
	.ticket-preview { color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 0.25rem; }
	.ticket-date { font-size: 0.75rem; color: var(--color-text-muted); }
	.empty-state { text-align: center; padding: 3rem; color: var(--color-text-muted); }
	.loading { text-align: center; padding: 2rem; color: var(--color-text-muted); }

	.chat-view { display: flex; flex-direction: column; height: calc(100vh - 180px); }
	.back-btn { display: inline-flex; align-items: center; background: none; border: none; color: var(--color-brand-300); cursor: pointer; font-size: 0.9rem; padding: 0.5rem 0; margin-bottom: 1rem; }
	.messages-container { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 0; }
	.message { max-width: 75%; padding: 0.75rem 1rem; border-radius: 12px; }
	.message.own { align-self: flex-end; background: rgba(12,113,61,.2); border: 1px solid rgba(12,113,61,.3); }
	.message.manager { align-self: flex-start; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
	.msg-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.25rem; }
	.msg-header strong { font-size: 0.8rem; }
	.msg-time { font-size: 0.7rem; color: var(--color-text-muted); }
	.message p { font-size: 0.9rem; line-height: 1.5; }

	.chat-input { display: flex; gap: 0.75rem; padding: 1rem 0; }
	.chat-input input { flex: 1; background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 0.65rem 1rem; color: var(--color-text-primary); font-size: 0.9rem; }

	.resolved-banner { text-align: center; padding: 1.5rem; background: rgba(34,197,94,.05); border: 1px solid rgba(34,197,94,.15); border-radius: 12px; margin-top: 1rem; }
	.rating-section { margin-top: 0.75rem; }
	.stars { display: flex; justify-content: center; gap: 0.25rem; }
	.star { font-size: 1.5rem; color: rgba(255,255,255,.2); background: none; border: none; cursor: pointer; transition: color .15s; }
	.star.active { color: #fbbf24; }
	.star:hover { color: #f59e0b; }
</style>
