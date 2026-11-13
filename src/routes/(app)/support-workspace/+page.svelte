<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import { isAuthenticated, getUser, getToken } from '$lib/stores/auth.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale } from '$lib/i18n-labels';

	// ── Support state ──
	let workspaceMode = $state<'support' | 'moderation' | 'newsletter' | 'reports'>('support');

	let activeTab = $state('pending');
	let conversations = $state<any[]>([]);
	let selectedConv = $state<any>(null);
	let selectedMessages = $state<any[]>([]);
	let stats = $state<any>(null);
	let managers = $state<any[]>([]);
	let isLoading = $state(false);
	let isSending = $state(false);
	let replyText = $state('');
	let showTransfer = $state(false);
	let messagesEl = $state<HTMLDivElement | null>(null);

	let tabs = $derived([
		{ key: 'pending', label: m.cskh_tab_pending(), icon: '⏳' },
		{ key: 'my_active', label: m.cskh_tab_my_active(), icon: '💬' },
		{ key: 'all_active', label: m.cskh_tab_all_active(), icon: '📋' },
		{ key: 'resolved', label: m.cskh_tab_resolved(), icon: '✅' },
	]);

	function getStatusLabel(s: string) {
		if (s === 'pending') return m.cskh_status_pending();
		if (s === 'active') return m.cskh_status_active();
		if (s === 'resolved') return m.cskh_status_resolved();
		if (s === 'closed') return m.cskh_status_closed();
		return s;
	}

	async function fetchConversations(type?: string) {
		isLoading = true;
		const tab = type || activeTab;
		try { const r = await api<any>(`/manager/support?type=${tab}`); conversations = r.data || []; } catch {}
		isLoading = false;
	}

	async function fetchStats() {
		try { const r = await api<any>('/manager/support/stats'); stats = r.data; } catch {}
	}

	async function fetchManagers() {
		try { const r = await api<any>('/manager/support/managers'); managers = r.data || []; } catch {}
	}

	async function selectConv(c: any) {
		selectedConv = c;
		try {
            if (c.type === 'contact') {
                const r = await api<any>(`/manager/support/contact/${c.original_id}/messages`);
                if (r.data) { selectedConv = r.data.conversation; selectedMessages = r.data.messages || []; }
            } else {
                const r = await api<any>(`/manager/support/${c.id}/messages`);
                if (r.data) { selectedConv = r.data.conversation; selectedMessages = r.data.messages || []; }
                await markRead(c.id);
            }
		} catch {}
		scrollBottom();
	}

	async function switchTab(key: string) {
		activeTab = key;
		selectedConv = null; selectedMessages = [];
		await fetchConversations(key);
	}

	async function handleClaim() {
		if (!selectedConv) return;
		try {
            if (selectedConv.type === 'contact') {
                await api(`/manager/support/contact/${selectedConv.original_id}/claim`, { method: 'POST' });
            } else {
                await api(`/manager/support/${selectedConv.id}/claim`, { method: 'POST' });
            }
            await fetchConversations(); await fetchStats(); await selectConv(selectedConv);
        } catch {}
	}

	async function handleReply() {
		if (!replyText.trim() || !selectedConv) return;
		isSending = true;
		try {
            if (selectedConv.type === 'contact') {
                const r = await api<any>(`/manager/support/contact/${selectedConv.original_id}/reply`, { method: 'POST', body: { reply_message: replyText } });
                if (r.data) selectedMessages = [...selectedMessages, r.data];
            } else {
                const r = await api<any>(`/manager/support/${selectedConv.id}/reply`, { method: 'POST', body: { message: replyText } });
                if (r.data) selectedMessages = [...selectedMessages, r.data];
            }
			replyText = '';
			scrollBottom();
		} catch {} finally { isSending = false; }
	}

	async function handleTransfer(managerId: number) {
		if (!selectedConv) return;
		try {
			await api(`/manager/support/${selectedConv.id}/transfer`, { method: 'POST', body: { new_manager_id: managerId } });
			showTransfer = false; selectedConv = null; selectedMessages = [];
			await fetchConversations(); await fetchStats();
		} catch {}
	}

	async function handleResolve() {
		if (!selectedConv) return;
		try {
			await api(`/manager/support/${selectedConv.id}/resolve`, { method: 'POST' });
			selectedConv = null; selectedMessages = [];
			await fetchConversations(); await fetchStats();
		} catch {}
	}

	async function handleDelete() {
		if (!selectedConv || !confirm(m.cskh_confirm_delete_ticket())) return;
		try {
			if (selectedConv.type === 'contact') {
				await api(`/admin/contacts/${selectedConv.original_id}`, { method: 'DELETE' });
			} else {
				await api(`/manager/support/ticket/${selectedConv.id}`, { method: 'DELETE' });
			}
			selectedConv = null; selectedMessages = [];
			await fetchConversations(); await fetchStats();
		} catch {}
	}

	async function markRead(id: number) {
		try { await api(`/manager/support/${id}/mark-read`, { method: 'POST' }); } catch {}
	}

	function formatDate(d: string) { return new Date(d).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
	function formatTime(d: string) { return new Date(d).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }); }
	function scrollBottom() { setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50); }

	$effect(() => { if (selectedMessages.length) scrollBottom(); });

	// ── Moderation state ──
	let modComments = $state<any[]>([]);
	let modLoading = $state(false);
	async function fetchModComments() { modLoading = true; try { const r = await api<any>('/admin/moderation'); modComments = r.data || []; } catch {} finally { modLoading = false; } }
	async function approveComment(id: number) { try { await api(`/admin/moderation/${id}/approve`, { method: 'POST' }); modComments = modComments.filter(c => c.id !== id); } catch {} }
	async function rejectComment(id: number) { if (!confirm(m.cskh_btn_delete() + '?')) return; try { await api(`/admin/moderation/${id}/reject`, { method: 'POST' }); modComments = modComments.filter(c => c.id !== id); } catch {} }

	// ── Newsletter Broadcast state ──
	let nlSubject = $state(''); let nlContent = $state(''); let nlSending = $state(false);
	let nlBroadcasts = $state<any[]>([]); let nlStats = $state<any>(null);
	async function fetchNlStats() { try { const r = await api<any>('/admin/newsletter/stats'); nlStats = r.data; } catch {} }
	async function fetchNlBroadcasts() { try { const r = await api<any>('/admin/newsletter/broadcasts'); nlBroadcasts = r.data || []; } catch {} }
	async function sendNlBroadcast() {
		if (!nlSubject.trim() || !nlContent.trim()) return;
		if (!confirm(`${m.cskh_nl_btn_send()}: "${nlSubject}" (${nlStats?.active ?? 0})?`)) return;
		nlSending = true;
		try { await api('/admin/newsletter/broadcast', { method: 'POST', body: { subject: nlSubject, content: nlContent } }); nlSubject = ''; nlContent = ''; fetchNlBroadcasts(); fetchNlStats(); } catch {}
		finally { nlSending = false; }
	}

	// ── Reports state ──
	let reports = $state<any[]>([]); let reportFilter = $state('pending'); let rptLoading = $state(false);
    
    let showReportModal = $state(false);
    let selectedReportId = $state<number | null>(null);
    let reportResolveNote = $state('');
    let reportResolveBan = $state(false);
    let reportResolveBanReason = $state('');
    let reportResolveBanDays = $state(7);

	async function fetchReports(status = 'pending') { rptLoading = true; try { const r = await api<any>(`/admin/reports?status=${status}`); reports = (r.data as any)?.data ?? r.data ?? []; } catch {} finally { rptLoading = false; } }
	
    function openResolveModal(id: number) {
        selectedReportId = id;
        reportResolveNote = '';
        reportResolveBan = false;
        reportResolveBanReason = '';
        reportResolveBanDays = 7;
        showReportModal = true;
    }

    async function submitResolveReport() {
        if (!selectedReportId) return;
        try {
            await api(`/admin/reports/${selectedReportId}/resolve`, {
                method: 'POST',
                body: {
                    admin_note: reportResolveNote,
                    ban: reportResolveBan,
                    ban_reason: reportResolveBan ? reportResolveBanReason : undefined,
                    ban_days: reportResolveBan ? reportResolveBanDays : undefined,
                }
            });
            showReportModal = false;
            fetchReports(reportFilter);
        } catch {}
    }

	async function dismissReport(id: number) { try { await api(`/admin/reports/${id}/dismiss`, { method: 'POST' }); fetchReports(reportFilter); } catch {} }

	let sse: EventSource | null = null;
	let sseRetryCount = 0;
	const MAX_SSE_RETRIES = 15;

	function initWorkspaceSSE() {
		if (sse) return;
		const token = getToken();
		if (!token) return;
		const sseUrl = `${PUBLIC_API_BASE}/support/stream?token=${token}`;
		sse = new EventSource(sseUrl);
		sse.onopen = () => { sseRetryCount = 0; };
		sse.onmessage = async (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'support_update' && workspaceMode === 'support') {
					await Promise.all([fetchConversations(activeTab), fetchStats()]);
					if (selectedConv && (selectedConv.id === data.conversation_id || selectedConv.original_id === data.conversation_id)) {
						await selectConv(selectedConv);
					}
				}
			} catch {}
		};
		sse.onerror = () => {
			sse?.close();
			sse = null;
			if (sseRetryCount < MAX_SSE_RETRIES) {
				sseRetryCount++;
				const delay = Math.min(1000 * Math.pow(2, sseRetryCount), 30000);
				setTimeout(() => initWorkspaceSSE(), delay);
			}
		};
	}
    
    $effect(() => {
		const hasSending = nlBroadcasts.some(b => b.status === 'sending');
		if (hasSending && workspaceMode === 'newsletter') {
			const timer = setTimeout(() => fetchNlBroadcasts(), 5000);
			return () => clearTimeout(timer);
		}
	});

	onMount(async () => {
		const user = getUser();
		if (!isAuthenticated() || (user?.role !== 'admin' && user?.role !== 'manager')) { goto('/'); return; }
		await Promise.all([fetchConversations('pending'), fetchStats(), fetchManagers()]);
		initWorkspaceSSE();
	});

	onDestroy(() => {
		if (sse) sse.close();
	});
</script>

<svelte:head><title>{m.cskh_page_title()}</title></svelte:head>

<div class="cskh-workspace">
	<div class="cskh-container">
		<!-- Header -->
		<div class="cskh-header">
			<div>
				<h1>{m.cskh_header_title()}</h1>
				<p class="subtitle">{m.cskh_header_subtitle()}</p>
			</div>
			<div class="stats-row">
				<div class="stat pending"><span class="stat-num">{stats?.pending ?? 0}</span><span class="stat-label">{m.cskh_stat_pending()}</span></div>
				<div class="stat active"><span class="stat-num">{stats?.active ?? 0}</span><span class="stat-label">{m.cskh_stat_active()}</span></div>
			</div>
		</div>

		<!-- Workspace Mode Selector -->
		<div class="mode-bar">
			<button class:active={workspaceMode==='support'} onclick={() => workspaceMode='support'}>{m.cskh_mode_support()}</button>
			<button class:active={workspaceMode==='moderation'} onclick={() => { workspaceMode='moderation'; fetchModComments(); }}>{m.cskh_mode_moderation()}</button>
			<button class:active={workspaceMode==='newsletter'} onclick={() => { workspaceMode='newsletter'; fetchNlStats(); fetchNlBroadcasts(); }}>{m.cskh_mode_newsletter()}</button>
			<button class:active={workspaceMode==='reports'} onclick={() => { workspaceMode='reports'; fetchReports('pending'); }}>{m.cskh_mode_reports()}</button>
		</div>

		{#if workspaceMode === 'support'}
		<!-- Support Tabs -->
		<div class="cskh-tabs">
			{#each tabs as tab}
				<button class="cskh-tab" class:active={activeTab === tab.key} onclick={() => switchTab(tab.key)}>
					{tab.icon} {tab.label}
					{#if tab.key === 'pending' && (stats?.pending ?? 0) > 0}<span class="tab-badge">{stats?.pending}</span>{/if}
				</button>
			{/each}
		</div>

		<!-- Main Layout -->
		<div class="cskh-layout" class:has-selected={!!selectedConv}>
			<!-- Conversation List -->
			<div class="cskh-list">
				{#if isLoading}
					<div class="cskh-loading">{m.cskh_loading()}</div>
				{:else if conversations.length === 0}
					<div class="cskh-empty"><span>📭</span><p>{activeTab === 'pending' ? m.cskh_empty_pending() : m.cskh_empty_convs()}</p></div>
				{:else}
					{#each conversations as c}
						<button class="conv-item" class:selected={selectedConv?.id === c.id} onclick={() => selectConv(c)}>
							<div class="conv-avatar">
								{#if c.user?.avatar}<img src={c.user.avatar} alt="" />{:else}<span class="conv-initial">{(c.user?.name || '?').charAt(0).toUpperCase()}</span>{/if}
							</div>
							<div class="conv-info">
								<div class="conv-top"><span class="conv-name">{c.user?.name || 'User #' + c.user_id}</span><span class="conv-time">{formatDate(c.updated_at)}</span></div>
								<p class="conv-preview">{c.latest_message?.message || '...'}</p>
							</div>
							<div class="conv-badges">
                                {#if c.type === 'contact'}<span title={m.cskh_email_contact_badge()}>📧</span>{/if}
								<span class="priority-dot {c.priority || 'normal'}"></span>
								{#if (c.unread_count ?? 0) > 0}<span class="unread-badge">{c.unread_count}</span>{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Chat Panel -->
			<div class="cskh-chat">
				{#if !selectedConv}
					<div class="chat-empty"><span>💬</span><p>{m.cskh_select_conv_prompt()}</p></div>
				{:else}
					<!-- Chat Header -->
					<div class="chat-header">
						<div class="chat-user-info">
							<button type="button" class="mobile-back-btn" onclick={() => selectedConv = null} aria-label="Back">←</button>
							<strong>{selectedConv.user?.name || m.cskh_customer_fallback()}</strong>
							<span class="chat-status {selectedConv.status}">{getStatusLabel(selectedConv.status)}</span>
						</div>
						<div class="chat-actions">
							{#if selectedConv.status === 'pending'}
								<button class="action-btn claim" onclick={handleClaim}>{m.cskh_btn_claim()}</button>
							{/if}
							{#if selectedConv.status === 'active' && selectedConv.manager_id === getUser()?.id}
								<button class="action-btn transfer" onclick={() => showTransfer = true}>{m.cskh_btn_transfer()}</button>
								<button class="action-btn resolve" onclick={handleResolve}>{m.cskh_btn_resolve()}</button>
							{/if}
							{#if getUser()?.role === 'admin'}
								<button class="action-btn delete" onclick={handleDelete}>{m.cskh_btn_delete()}</button>
							{/if}
						</div>
					</div>

					<!-- Messages -->
					<div class="chat-messages" bind:this={messagesEl}>
						{#each selectedMessages as msg}
							<div class="msg" class:staff={msg.sender_type === 'manager'} class:mine={msg.sender_id === getUser()?.id}>
								{#if msg.sender_type === 'manager' && msg.sender}<span class="msg-sender">{msg.sender.name}</span>{/if}
								<p class="msg-text">{msg.message}</p>
								<span class="msg-time">{formatTime(msg.created_at)}</span>
							</div>
						{/each}
					</div>

					<!-- Reply Bar -->
					{#if selectedConv.status === 'active' && selectedConv.manager_id === getUser()?.id}
						<div class="chat-reply" class:is-contact={selectedConv.type === 'contact'}>
                            {#if selectedConv.type === 'contact'}
                                <textarea bind:value={replyText} rows="4" placeholder={m.cskh_placeholder_email_reply()}></textarea>
                                <button disabled={!replyText.trim() || isSending} onclick={handleReply}>{isSending ? '⏳' : m.cskh_btn_send_email()}</button>
                            {:else}
							    <input bind:value={replyText} placeholder={m.cskh_placeholder_chat_reply()} onkeydown={(e) => { if (e.key === 'Enter') handleReply(); }} />
							    <button disabled={!replyText.trim() || isSending} onclick={handleReply}>{isSending ? '⏳' : '📤'}</button>
                            {/if}
						</div>
					{:else if selectedConv.status === 'pending'}
						<div class="chat-info-bar pending">{m.cskh_info_pending_claim()}</div>
					{:else if selectedConv.status === 'resolved'}
						<div class="chat-info-bar resolved">{m.cskh_info_resolved()}{selectedConv.rating ? ` — ⭐ ${selectedConv.rating}/5` : ''}</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	<!-- Transfer Modal -->
	{#if showTransfer}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onmousedown={() => showTransfer = false}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-box glass-card" onmousedown={(e) => e.stopPropagation()}>
				<h3>{m.cskh_transfer_title()}</h3>
				<p>{m.cskh_transfer_desc()}</p>
				{#each managers.filter(mgr => mgr.id !== getUser()?.id) as mgr}
					<button class="transfer-item" onclick={() => handleTransfer(mgr.id)}>
						<span class="transfer-name">{mgr.name}</span>
						<span class="transfer-role">{mgr.role}</span>
					</button>
				{:else}
					<p class="transfer-empty">{m.cskh_transfer_empty()}</p>
				{/each}
				<button class="modal-close" onclick={() => showTransfer = false}>{m.cskh_btn_close()}</button>
			</div>
		</div>
	{/if}

	<!-- Report Resolve Modal -->
	{#if showReportModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onmousedown={() => showReportModal = false}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-box glass-card" onmousedown={(e) => e.stopPropagation()}>
				<h3>{m.cskh_report_modal_title()}</h3>
				<div class="nl-form" style="margin-top: 1rem;">
					<label>{m.cskh_report_note_label()}<textarea bind:value={reportResolveNote} rows="3" placeholder={m.cskh_report_note_placeholder()}></textarea></label>
					<label style="flex-direction: row; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" bind:checked={reportResolveBan} style="width: auto;" />
                        <span style="color: #ef4444; font-weight: 700;">{m.cskh_report_ban_user()}</span>
                    </label>
                    {#if reportResolveBan}
                        <label>{m.cskh_report_ban_reason_label()}<input bind:value={reportResolveBanReason} placeholder={m.cskh_report_ban_reason_placeholder()} /></label>
                        <label>{m.cskh_report_ban_days_label()}<input type="number" bind:value={reportResolveBanDays} min="0" /></label>
                    {/if}
				</div>
				<div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
                    <button class="action-btn resolve" style="flex: 1;" onclick={submitResolveReport}>{m.cskh_report_btn_confirm()}</button>
                    <button class="action-btn transfer" style="flex: 1;" onclick={() => showReportModal = false}>{m.cskh_btn_cancel()}</button>
                </div>
			</div>
		</div>
	{/if}

		{#if workspaceMode === 'moderation'}
		<!-- Moderation Panel -->
		<div class="tool-panel">
			<h2>{m.cskh_mod_title()}</h2>
			<p class="tool-desc">{m.cskh_mod_desc({ count: modComments.length })}</p>
			{#if modLoading}
				<p class="tool-empty">{m.cskh_loading()}</p>
			{:else if !modComments.length}
				<p class="tool-empty">{m.cskh_mod_empty()}</p>
			{:else}
				<div class="mod-list">
					{#each modComments as c (c.id)}
						<div class="mod-card">
							<div class="mod-header">
								<strong>{c.user?.name ?? 'User #' + c.user_id}</strong>
								<span class="mod-time">{formatDate(c.created_at)}</span>
							</div>
							<p class="mod-content">{c.content}</p>
							<div class="mod-meta">{c.commentable_type} #{c.commentable_id}</div>
							<div class="mod-actions">
								<button class="action-btn resolve" onclick={() => approveComment(c.id)}>{m.cskh_mod_btn_approve()}</button>
								<button class="action-btn delete" onclick={() => rejectComment(c.id)}>{m.cskh_btn_delete()}</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		{/if}

		{#if workspaceMode === 'newsletter'}
		<!-- Newsletter Broadcast Panel -->
		<div class="tool-panel">
			<h2>{m.cskh_nl_title()}</h2>
			<p class="tool-desc">{m.cskh_nl_desc({ count: nlStats?.active ?? 0 })}</p>
			<div class="nl-form">
				<label>{m.cskh_nl_subject_label()}<input bind:value={nlSubject} placeholder={m.cskh_nl_subject_placeholder()} /></label>
				<label>{m.cskh_nl_content_label()}<textarea bind:value={nlContent} rows="6" placeholder={m.cskh_nl_content_placeholder()}></textarea></label>
				<button class="action-btn claim" disabled={nlSending || !nlSubject.trim() || !nlContent.trim()} onclick={sendNlBroadcast}>{nlSending ? m.cskh_nl_btn_sending() : m.cskh_nl_btn_send()}</button>
			</div>
			{#if nlBroadcasts.length > 0}
				<h3 class="sub-title">{m.cskh_nl_recent_title()}</h3>
				<div class="nl-history">
					{#each nlBroadcasts.slice(0, 5) as bc (bc.id)}
						<div class="nl-item">
                            <strong>{bc.subject}</strong>
                            <span style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="chat-status {bc.status}">{bc.status}</span>
                                {m.cskh_nl_recipients_unit({ count: bc.recipient_count })} · {bc.sent_at ? formatDate(bc.sent_at) : '—'}
                            </span>
                        </div>
					{/each}
				</div>
			{/if}
		</div>
		{/if}

		{#if workspaceMode === 'reports'}
		<!-- Reports Panel -->
		<div class="tool-panel">
			<h2>{m.cskh_rpt_title()}</h2>
			<div class="rpt-filters">
				{#each [['pending', m.cskh_rpt_filter_pending()],['resolved', m.cskh_rpt_filter_resolved()],['dismissed', m.cskh_rpt_filter_dismissed()]] as [key, label]}
					<button class:active={reportFilter===key} onclick={() => { reportFilter=key; fetchReports(key); }}>{label}</button>
				{/each}
			</div>
			{#if rptLoading}
				<p class="tool-empty">{m.cskh_loading()}</p>
			{:else if !reports.length}
				<p class="tool-empty">{m.cskh_rpt_empty()}</p>
			{:else}
				<div class="rpt-list">
					{#each reports as rpt (rpt.id)}
						<div class="rpt-card">
							<div class="rpt-header">
								<strong>#{rpt.id}</strong>
								<span class="rpt-type">{rpt.reason ?? rpt.type ?? '—'}</span>
							</div>
							<p class="rpt-desc">{rpt.description ?? rpt.details ?? '—'}</p>
							<div class="rpt-meta">{m.cskh_rpt_meta({ reporter: rpt.reporter?.name ?? ('User #' + rpt.reporter_id), reported: rpt.reported?.name ?? ('User #' + rpt.reported_id) })}</div>
							{#if reportFilter === 'pending'}
								<div class="mod-actions">
									<button class="action-btn resolve" onclick={() => openResolveModal(rpt.id)}>{m.cskh_btn_resolve()}</button>
									<button class="action-btn transfer" onclick={() => dismissReport(rpt.id)}>{m.cskh_rpt_btn_dismiss()}</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
		{/if}
	</div>
</div>

<style>
	.cskh-workspace{min-height:100vh;background:var(--color-surface-50)}
	.cskh-container{max-width:1200px;margin:0 auto;padding:clamp(0.85rem,3vw,1.5rem)}
	.cskh-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem}
	.cskh-header h1{font-size:1.5rem;font-weight:800;margin:0}
	.subtitle{margin:.25rem 0 0;font-size:.8rem;color:var(--color-text-muted)}
	.stats-row{display:flex;flex-wrap:wrap;gap:.75rem}
	.stat{display:flex;flex-direction:column;align-items:center;padding:.625rem 1rem;border-radius:12px;background:var(--color-surface-100);border:1px solid rgba(255,255,255,.06);min-width:80px}
	.stat-num{font-size:1.25rem;font-weight:800}
	.stat-label{font-size:.625rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-muted)}
	.stat.pending .stat-num{color:#f59e0b}
	.stat.active .stat-num{color:#3b82f6}

	.cskh-tabs{display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:1rem;background:var(--color-surface-100);border-radius:12px;padding:.25rem;border:1px solid rgba(255,255,255,.04)}
	.cskh-tab{flex:1 1 110px;padding:.625rem;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:500;color:var(--color-text-muted);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:.375rem}
	.cskh-tab.active{background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;font-weight:600}
	.cskh-tab:hover:not(.active){background:rgba(12,113,61,.06);color:var(--color-brand-400)}
	.tab-badge{background:#ef4444;color:#fff;font-size:.56rem;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}

	.cskh-layout{display:grid;grid-template-columns:320px 1fr;gap:1rem;min-height:550px}
	.cskh-list{background:var(--color-surface-100);border-radius:1rem;border:1px solid rgba(255,255,255,.04);overflow-y:auto;max-height:600px}
	.cskh-loading,.cskh-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;color:var(--color-text-muted);font-size:.8rem;gap:.5rem}
	.cskh-empty span{font-size:2rem}

	.conv-item{display:flex;align-items:center;gap:.75rem;padding:.875rem 1rem;cursor:pointer;border:none;background:none;border-bottom:1px solid rgba(255,255,255,.03);transition:background .15s;width:100%;text-align:left;color:var(--color-text-primary)}
	.conv-item:hover{background:rgba(12,113,61,.04)}
	.conv-item.selected{background:rgba(12,113,61,.08);border-left:3px solid var(--color-brand-500)}
	.conv-avatar{width:40px;height:40px;border-radius:50%;overflow:hidden;background:rgba(12,113,61,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0}
	.conv-avatar img{width:100%;height:100%;object-fit:cover}
	.conv-initial{font-weight:700;font-size:.85rem;color:var(--color-brand-400)}
	.conv-info{flex:1;min-width:0}
	.conv-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.125rem}
	.conv-name{font-size:.8rem;font-weight:600}
	.conv-time{font-size:.625rem;color:var(--color-text-muted)}
	.conv-preview{margin:0;font-size:.75rem;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.conv-badges{display:flex;flex-direction:column;align-items:center;gap:.25rem}
	.priority-dot{width:8px;height:8px;border-radius:50%}
	.priority-dot.low{background:#22c55e}.priority-dot.normal{background:#f59e0b}.priority-dot.high{background:#ef4444}
	.unread-badge{background:#ef4444;color:#fff;font-size:.56rem;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center}

	.cskh-chat{background:var(--color-surface-100);border-radius:1rem;border:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;overflow:hidden}
	.chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:3rem;color:var(--color-text-muted)}
	.chat-empty span{font-size:3rem;margin-bottom:.75rem;opacity:.5}

	.chat-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06)}
	.chat-user-info{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}
	.mobile-back-btn{display:none;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:var(--color-surface-200);color:var(--color-text-primary);cursor:pointer;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
	.chat-user-info strong{font-size:.9rem}
	.chat-status{font-size:.625rem;font-weight:700;text-transform:uppercase;padding:.1875rem .5rem;border-radius:1rem;letter-spacing:.5px}
	.chat-status.pending{background:rgba(245,158,11,.1);color:#f59e0b}
	.chat-status.active{background:rgba(59,130,246,.1);color:#3b82f6}
	.chat-status.resolved,.chat-status.sent{background:rgba(34,197,94,.1);color:#22c55e}
    .chat-status.sending{background:rgba(6,182,212,.1);color:#06b6d4}
    .chat-status.partial{background:rgba(245,158,11,.1);color:#f59e0b}
	.chat-actions{display:flex;flex-wrap:wrap;gap:.375rem}
	.action-btn{padding:.4rem .75rem;border:none;border-radius:8px;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s}
	.action-btn.claim{background:rgba(59,130,246,.15);color:#60a5fa}
	.action-btn.claim:hover{background:rgba(59,130,246,.25)}
	.action-btn.transfer{background:rgba(168,85,247,.15);color:#c084fc}
	.action-btn.resolve{background:rgba(34,197,94,.15);color:#4ade80}
	.action-btn.delete{background:rgba(239,68,68,.15);color:#f87171}

	.chat-messages{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.5rem;scroll-behavior:smooth}
	.msg{max-width:80%;padding:.5rem .875rem;border-radius:12px;animation:msgIn .2s ease}
	.msg.staff{align-self:flex-end;background:rgba(12,113,61,.15);border:1px solid rgba(12,113,61,.2)}
	.msg:not(.staff){align-self:flex-start;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.04)}
	@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
	.msg-sender{font-size:.625rem;font-weight:600;color:var(--color-brand-400);display:block;margin-bottom:.1rem}
	.msg-text{margin:0;font-size:.8rem;line-height:1.5}
	.msg-time{font-size:.56rem;color:var(--color-text-muted);display:block;margin-top:.2rem}

	.chat-reply{display:flex;gap:.5rem;padding:.75rem;border-top:1px solid rgba(255,255,255,.06)}
    .chat-reply.is-contact{flex-direction:column;background:var(--color-surface-100)}
	.chat-reply input,.chat-reply textarea{flex:1;padding:.5rem .75rem;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:var(--color-surface-200);color:var(--color-text-primary);font-size:.85rem;font-family:inherit;resize:vertical}
	.chat-reply input:focus,.chat-reply textarea:focus{outline:none;border-color:var(--color-brand-500)}
	.chat-reply button{padding:.5rem 1rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem}
    .chat-reply.is-contact button{align-self:flex-end}
	.chat-reply button:disabled{opacity:.5;cursor:not-allowed}

	.chat-info-bar{padding:.75rem 1rem;font-size:.8rem;text-align:center;border-top:1px solid rgba(255,255,255,.06)}
	.chat-info-bar.pending{background:rgba(245,158,11,.05);color:#f59e0b}
	.chat-info-bar.resolved{background:rgba(34,197,94,.05);color:#22c55e}

	.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:999}
	.modal-box{padding:1.5rem;width:400px;max-width:90vw}
	.modal-box h3{margin:0 0 .5rem;font-size:1.1rem}
	.modal-box p{font-size:.85rem;color:var(--color-text-muted);margin:0 0 1rem}
	.transfer-item{display:flex;justify-content:space-between;width:100%;padding:.65rem .75rem;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:var(--color-surface-200);cursor:pointer;margin-bottom:.5rem;color:var(--color-text-primary);transition:all .15s}
	.transfer-item:hover{border-color:var(--color-brand-500);background:rgba(12,113,61,.05)}
	.transfer-name{font-weight:600;font-size:.85rem}
	.transfer-role{font-size:.75rem;color:var(--color-text-muted)}
	.transfer-empty{font-size:.85rem;color:var(--color-text-muted);text-align:center;padding:1rem}
	.modal-close{display:block;margin-top:1rem;padding:.5rem 1rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--color-text-secondary);cursor:pointer;width:100%;font-family:inherit}

	@media(max-width:768px){
		.cskh-layout{grid-template-columns:1fr;min-height:460px}
		.cskh-layout.has-selected .cskh-list{display:none}
		.cskh-layout:not(.has-selected) .cskh-chat{display:none}
		.mobile-back-btn{display:inline-flex}
		.mode-bar{flex-wrap:wrap}
		.mode-bar button{flex:1 1 130px}
	}

	/* Mode Bar */
	.mode-bar{display:flex;gap:.375rem;margin-bottom:1rem;background:var(--color-surface-100);border-radius:12px;padding:.3rem;border:1px solid rgba(255,255,255,.04)}
	.mode-bar button{flex:1;padding:.5rem .75rem;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:.75rem;font-weight:600;color:var(--color-text-muted);transition:all .2s}
	.mode-bar button.active{background:linear-gradient(135deg,#0c713d,#085a30);color:#fff}
	.mode-bar button:hover:not(.active){background:rgba(12,113,61,.06);color:var(--color-brand-400)}

	/* Tool Panels */
	.tool-panel{background:var(--color-surface-100);border-radius:1rem;padding:1.5rem;border:1px solid rgba(255,255,255,.04);min-height:400px}
	.tool-panel h2{font-size:1.1rem;font-weight:700;margin:0 0 .5rem}
	.tool-desc{font-size:.8rem;color:var(--color-text-muted);margin:0 0 1.25rem}
	.tool-empty{text-align:center;color:var(--color-text-muted);font-size:.85rem;padding:2rem}
	.sub-title{font-size:.9rem;font-weight:700;margin:1.5rem 0 .75rem}

	/* Moderation */
	.mod-list{display:flex;flex-direction:column;gap:.75rem}
	.mod-card{background:var(--color-surface-200);border-radius:.75rem;padding:1rem;border:1px solid rgba(255,255,255,.04)}
	.mod-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
	.mod-header strong{font-size:.85rem}
	.mod-time{font-size:.65rem;color:var(--color-text-muted)}
	.mod-content{margin:0 0 .5rem;font-size:.85rem;line-height:1.6;color:var(--color-text-secondary)}
	.mod-meta{font-size:.65rem;color:var(--color-text-muted);margin-bottom:.5rem}
	.mod-actions{display:flex;gap:.375rem}

	/* Newsletter Form */
	.nl-form{display:flex;flex-direction:column;gap:1rem}
	.nl-form label{display:flex;flex-direction:column;gap:.375rem;font-size:.8125rem;font-weight:600}
	.nl-form input,.nl-form textarea{padding:.625rem .75rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:.5rem;color:var(--color-text-primary);font-size:.85rem;font-family:inherit;resize:vertical}
	.nl-form input:focus,.nl-form textarea:focus{outline:none;border-color:var(--color-brand-500)}
	.nl-history{display:flex;flex-direction:column;gap:.5rem}
	.nl-item{display:flex;justify-content:space-between;align-items:center;padding:.75rem;background:var(--color-surface-200);border-radius:.5rem;font-size:.8rem}
	.nl-item strong{flex:1}
	.nl-item span{font-size:.7rem;color:var(--color-text-muted)}

	/* Reports */
	.rpt-filters{display:flex;gap:.25rem;margin-bottom:1rem}
	.rpt-filters button{padding:.4rem .75rem;border:1px solid var(--color-surface-400);border-radius:var(--radius-md);background:transparent;cursor:pointer;font-size:.75rem;font-weight:600;color:var(--color-text-muted);transition:all .15s}
	.rpt-filters button.active{background:var(--color-brand-500);color:#fff;border-color:var(--color-brand-500)}
	.rpt-list{display:flex;flex-direction:column;gap:.75rem}
	.rpt-card{background:var(--color-surface-200);border-radius:.75rem;padding:1rem;border:1px solid rgba(255,255,255,.04)}
	.rpt-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.375rem}
	.rpt-header strong{font-size:.85rem}
	.rpt-type{font-size:.625rem;font-weight:700;text-transform:uppercase;padding:.125rem .375rem;border-radius:.25rem;background:rgba(239,68,68,.15);color:#f87171}
	.rpt-desc{margin:0 0 .375rem;font-size:.8rem;line-height:1.5;color:var(--color-text-secondary)}
	.rpt-meta{font-size:.65rem;color:var(--color-text-muted);margin-bottom:.5rem}
</style>
