<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import { isAuthenticated, getUser } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';

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

	const tabs = [
		{ key: 'pending', label: 'Chờ nhận', icon: '⏳' },
		{ key: 'my_active', label: 'Của tôi', icon: '💬' },
		{ key: 'all_active', label: 'Tất cả', icon: '📋' },
		{ key: 'resolved', label: 'Đã giải quyết', icon: '✅' },
	];

	const statusLabels: Record<string, string> = { pending: 'Chờ nhận', active: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng' };

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
			const r = await api<any>(`/manager/support/${c.id}/messages`);
			if (r.data) { selectedConv = r.data.conversation; selectedMessages = r.data.messages || []; }
			await markRead(c.id);
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
		try { await api(`/manager/support/${selectedConv.id}/claim`, { method: 'POST' }); await fetchConversations(); await fetchStats(); await selectConv(selectedConv); } catch {}
	}

	async function handleReply() {
		if (!replyText.trim() || !selectedConv) return;
		isSending = true;
		try {
			const r = await api<any>(`/manager/support/${selectedConv.id}/reply`, { method: 'POST', body: { message: replyText } });
			if (r.data) selectedMessages = [...selectedMessages, r.data];
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
		if (!selectedConv || !confirm('Xóa vĩnh viễn ticket này?')) return;
		try {
			await api(`/manager/support/ticket/${selectedConv.id}`, { method: 'DELETE' });
			selectedConv = null; selectedMessages = [];
			await fetchConversations(); await fetchStats();
		} catch {}
	}

	async function markRead(id: number) {
		try { await api(`/manager/support/${id}/mark-read`, { method: 'POST' }); } catch {}
	}

	function formatDate(d: string) { return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
	function formatTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }
	function scrollBottom() { setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50); }

	$effect(() => { if (selectedMessages.length) scrollBottom(); });

	// ── Moderation state ──
	let modComments = $state<any[]>([]);
	let modLoading = $state(false);
	async function fetchModComments() { modLoading = true; try { const r = await api<any>('/admin/moderation'); modComments = r.data || []; } catch {} finally { modLoading = false; } }
	async function approveComment(id: number) { try { await api(`/admin/moderation/${id}/approve`, { method: 'POST' }); modComments = modComments.filter(c => c.id !== id); } catch {} }
	async function rejectComment(id: number) { if (!confirm('Từ chối và xóa comment này?')) return; try { await api(`/admin/moderation/${id}/reject`, { method: 'POST' }); modComments = modComments.filter(c => c.id !== id); } catch {} }

	// ── Newsletter Broadcast state ──
	let nlSubject = $state(''); let nlContent = $state(''); let nlSending = $state(false);
	let nlBroadcasts = $state<any[]>([]); let nlStats = $state<any>(null);
	async function fetchNlStats() { try { const r = await api<any>('/admin/newsletter/stats'); nlStats = r.data; } catch {} }
	async function fetchNlBroadcasts() { try { const r = await api<any>('/admin/newsletter/broadcasts'); nlBroadcasts = r.data || []; } catch {} }
	async function sendNlBroadcast() {
		if (!nlSubject.trim() || !nlContent.trim()) return;
		if (!confirm(`Gửi bản tin "${nlSubject}" đến ${nlStats?.active ?? 0} subscribers?`)) return;
		nlSending = true;
		try { await api('/admin/newsletter/broadcast', { method: 'POST', body: { subject: nlSubject, content: nlContent } }); nlSubject = ''; nlContent = ''; fetchNlBroadcasts(); fetchNlStats(); } catch {}
		finally { nlSending = false; }
	}

	// ── Reports state ──
	let reports = $state<any[]>([]); let reportFilter = $state('pending'); let rptLoading = $state(false);
	async function fetchReports(status = 'pending') { rptLoading = true; try { const r = await api<any>(`/admin/reports?status=${status}`); reports = (r.data as any)?.data ?? r.data ?? []; } catch {} finally { rptLoading = false; } }
	async function resolveReport(id: number) { try { await api(`/admin/reports/${id}/resolve`, { method: 'POST' }); fetchReports(reportFilter); } catch {} }
	async function dismissReport(id: number) { try { await api(`/admin/reports/${id}/dismiss`, { method: 'POST' }); fetchReports(reportFilter); } catch {} }

	onMount(async () => {
		const user = getUser();
		if (!isAuthenticated() || (user?.role !== 'admin' && user?.role !== 'manager')) { goto('/'); return; }
		await Promise.all([fetchConversations('pending'), fetchStats(), fetchManagers()]);
	});
</script>

<svelte:head><title>CSKH Workspace — Selorson</title></svelte:head>

<div class="cskh-workspace">
	<div class="cskh-container">
		<!-- Header -->
		<div class="cskh-header">
			<div>
				<h1>🎧 CSKH Workspace</h1>
				<p class="subtitle">Tiếp nhận, hỗ trợ & quản lý nội dung</p>
			</div>
			<div class="stats-row">
				<div class="stat pending"><span class="stat-num">{stats?.pending ?? 0}</span><span class="stat-label">Chờ nhận</span></div>
				<div class="stat active"><span class="stat-num">{stats?.active ?? 0}</span><span class="stat-label">Đang xử lý</span></div>
			</div>
		</div>

		<!-- Workspace Mode Selector -->
		<div class="mode-bar">
			<button class:active={workspaceMode==='support'} onclick={() => workspaceMode='support'}>🎧 Hỗ Trợ</button>
			<button class:active={workspaceMode==='moderation'} onclick={() => { workspaceMode='moderation'; fetchModComments(); }}>🛡️ Kiểm Duyệt</button>
			<button class:active={workspaceMode==='newsletter'} onclick={() => { workspaceMode='newsletter'; fetchNlStats(); fetchNlBroadcasts(); }}>📰 Bản Tin</button>
			<button class:active={workspaceMode==='reports'} onclick={() => { workspaceMode='reports'; fetchReports('pending'); }}>🚨 Báo Cáo</button>
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
		<div class="cskh-layout">
			<!-- Conversation List -->
			<div class="cskh-list">
				{#if isLoading}
					<div class="cskh-loading">Đang tải...</div>
				{:else if conversations.length === 0}
					<div class="cskh-empty"><span>📭</span><p>{activeTab === 'pending' ? 'Không có ticket chờ nhận' : 'Không có cuộc hội thoại'}</p></div>
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
					<div class="chat-empty"><span>💬</span><p>Chọn một cuộc hội thoại để bắt đầu hỗ trợ</p></div>
				{:else}
					<!-- Chat Header -->
					<div class="chat-header">
						<div class="chat-user-info">
							<strong>{selectedConv.user?.name || 'Khách hàng'}</strong>
							<span class="chat-status {selectedConv.status}">{statusLabels[selectedConv.status] || selectedConv.status}</span>
						</div>
						<div class="chat-actions">
							{#if selectedConv.status === 'pending'}
								<button class="action-btn claim" onclick={handleClaim}>✋ Nhận</button>
							{/if}
							{#if selectedConv.status === 'active' && selectedConv.manager_id === getUser()?.id}
								<button class="action-btn transfer" onclick={() => showTransfer = true}>🔄 Chuyển</button>
								<button class="action-btn resolve" onclick={handleResolve}>✅ Giải quyết</button>
							{/if}
							{#if getUser()?.role === 'admin'}
								<button class="action-btn delete" onclick={handleDelete}>🗑 Xóa</button>
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
						<div class="chat-reply">
							<input bind:value={replyText} placeholder="Nhập phản hồi..." onkeydown={(e) => { if (e.key === 'Enter') handleReply(); }} />
							<button disabled={!replyText.trim() || isSending} onclick={handleReply}>{isSending ? '⏳' : '📤'}</button>
						</div>
					{:else if selectedConv.status === 'pending'}
						<div class="chat-info-bar pending">⏳ Ticket chưa được nhận. Bấm "Nhận" để bắt đầu.</div>
					{:else if selectedConv.status === 'resolved'}
						<div class="chat-info-bar resolved">✅ Đã giải quyết{selectedConv.rating ? ` — ⭐ ${selectedConv.rating}/5` : ''}</div>
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
				<h3>🔄 Chuyển cuộc hội thoại</h3>
				<p>Chọn nhân viên CSKH sẽ tiếp nhận:</p>
				{#each managers.filter(m => m.id !== getUser()?.id) as m}
					<button class="transfer-item" onclick={() => handleTransfer(m.id)}>
						<span class="transfer-name">{m.name}</span>
						<span class="transfer-role">{m.role}</span>
					</button>
				{:else}
					<p class="transfer-empty">Không có nhân viên khác khả dụng.</p>
				{/each}
				<button class="modal-close" onclick={() => showTransfer = false}>Đóng</button>
			</div>
		</div>
	{/if}

		{#if workspaceMode === 'moderation'}
		<!-- Moderation Panel -->
		<div class="tool-panel">
			<h2>🛡️ Kiểm Duyệt Bình Luận</h2>
			<p class="tool-desc">Duyệt hoặc xóa bình luận vi phạm. Hiện có {modComments.length} comment.</p>
			{#if modLoading}
				<p class="tool-empty">Đang tải...</p>
			{:else if !modComments.length}
				<p class="tool-empty">✅ Không có bình luận cần kiểm duyệt.</p>
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
								<button class="action-btn resolve" onclick={() => approveComment(c.id)}>✅ Duyệt</button>
								<button class="action-btn delete" onclick={() => rejectComment(c.id)}>🗑 Xóa</button>
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
			<h2>📰 Gửi Bản Tin</h2>
			<p class="tool-desc">Gửi email đến <strong>{nlStats?.active ?? 0}</strong> subscribers đang hoạt động.</p>
			<div class="nl-form">
				<label>Tiêu đề<input bind:value={nlSubject} placeholder="VD: Cập nhật tháng 5" /></label>
				<label>Nội dung<textarea bind:value={nlContent} rows="6" placeholder="Nội dung bản tin..."></textarea></label>
				<button class="action-btn claim" disabled={nlSending || !nlSubject.trim() || !nlContent.trim()} onclick={sendNlBroadcast}>{nlSending ? '⏳ Đang gửi...' : '📤 Gửi Bản Tin'}</button>
			</div>
			{#if nlBroadcasts.length > 0}
				<h3 class="sub-title">📨 Lịch sử gửi gần đây</h3>
				<div class="nl-history">
					{#each nlBroadcasts.slice(0, 5) as bc (bc.id)}
						<div class="nl-item"><strong>{bc.subject}</strong><span>{bc.recipient_count} người · {bc.sent_at ? formatDate(bc.sent_at) : '—'}</span></div>
					{/each}
				</div>
			{/if}
		</div>
		{/if}

		{#if workspaceMode === 'reports'}
		<!-- Reports Panel -->
		<div class="tool-panel">
			<h2>🚨 Báo Cáo Vi Phạm</h2>
			<div class="rpt-filters">
				{#each [['pending','⏳ Chờ xử lý'],['resolved','✅ Đã xử lý'],['dismissed','❌ Đã bỏ qua']] as [key, label]}
					<button class:active={reportFilter===key} onclick={() => { reportFilter=key; fetchReports(key); }}>{label}</button>
				{/each}
			</div>
			{#if rptLoading}
				<p class="tool-empty">Đang tải...</p>
			{:else if !reports.length}
				<p class="tool-empty">Không có báo cáo nào.</p>
			{:else}
				<div class="rpt-list">
					{#each reports as rpt (rpt.id)}
						<div class="rpt-card">
							<div class="rpt-header">
								<strong>#{rpt.id}</strong>
								<span class="rpt-type">{rpt.reason ?? rpt.type ?? '—'}</span>
							</div>
							<p class="rpt-desc">{rpt.description ?? rpt.details ?? '—'}</p>
							<div class="rpt-meta">Người gửi: {rpt.reporter?.name ?? 'User #' + rpt.reporter_id} · Đối tượng: {rpt.reported?.name ?? 'User #' + rpt.reported_id}</div>
							{#if reportFilter === 'pending'}
								<div class="mod-actions">
									<button class="action-btn resolve" onclick={() => resolveReport(rpt.id)}>✅ Giải quyết</button>
									<button class="action-btn transfer" onclick={() => dismissReport(rpt.id)}>❌ Bỏ qua</button>
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
	.cskh-container{max-width:1200px;margin:0 auto;padding:1.5rem}
	.cskh-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem}
	.cskh-header h1{font-size:1.5rem;font-weight:800;margin:0}
	.subtitle{margin:.25rem 0 0;font-size:.8rem;color:var(--color-text-muted)}
	.stats-row{display:flex;gap:.75rem}
	.stat{display:flex;flex-direction:column;align-items:center;padding:.625rem 1rem;border-radius:12px;background:var(--color-surface-100);border:1px solid rgba(255,255,255,.06);min-width:80px}
	.stat-num{font-size:1.25rem;font-weight:800}
	.stat-label{font-size:.625rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-muted)}
	.stat.pending .stat-num{color:#f59e0b}
	.stat.active .stat-num{color:#3b82f6}

	.cskh-tabs{display:flex;gap:.25rem;margin-bottom:1rem;background:var(--color-surface-100);border-radius:12px;padding:.25rem;border:1px solid rgba(255,255,255,.04)}
	.cskh-tab{flex:1;padding:.625rem;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:500;color:var(--color-text-muted);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:.375rem}
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

	.chat-header{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.06)}
	.chat-user-info{display:flex;align-items:center;gap:.75rem}
	.chat-user-info strong{font-size:.9rem}
	.chat-status{font-size:.625rem;font-weight:700;text-transform:uppercase;padding:.1875rem .5rem;border-radius:1rem;letter-spacing:.5px}
	.chat-status.pending{background:rgba(245,158,11,.1);color:#f59e0b}
	.chat-status.active{background:rgba(59,130,246,.1);color:#3b82f6}
	.chat-status.resolved{background:rgba(34,197,94,.1);color:#22c55e}
	.chat-actions{display:flex;gap:.375rem}
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
	.chat-reply input{flex:1;padding:.5rem .75rem;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:var(--color-surface-200);color:var(--color-text-primary);font-size:.85rem;font-family:inherit}
	.chat-reply input:focus{outline:none;border-color:var(--color-brand-500)}
	.chat-reply button{padding:.5rem 1rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem}
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

	@media(max-width:768px){.cskh-layout{grid-template-columns:1fr}.mode-bar{flex-wrap:wrap}}

	/* Mode Bar */
	.mode-bar{display:flex;gap:.375rem;margin-bottom:1rem;background:var(--color-surface-100);border-radius:12px;padding:.3rem;border:1px solid rgba(255,255,255,.04)}
	.mode-bar button{flex:1;padding:.5rem .75rem;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:.75rem;font-weight:600;color:var(--color-text-muted);transition:all .2s}
	.mode-bar button.active{background:linear-gradient(135deg,#0c713d,#085a30);color:#fff}
	.mode-bar button:hover:not(.active){background:rgba(12,113,61,.06);color:var(--color-brand-400)}

	/* Tool Panels */
	.tool-panel{background:var(--color-surface-100);border-radius:1rem;padding:1.5rem;border:1px solid rgba(255,255,255,.04);min-height:400px}
	.tool-panel h2{font-size:1.1rem;font-weight:700;margin:0 0 .5rem}
	.tool-desc{font-size:.8rem;color:var(--color-text-muted);margin:0 0 1.25rem}
	.tool-desc strong{color:var(--color-brand-400)}
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
