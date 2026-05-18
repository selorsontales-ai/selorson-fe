<script lang="ts">
	import { adminGet, adminPost, adminDelete, toast_success, toast_error, formatDateTime } from '$lib/stores/admin.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { onMount } from 'svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';

	const API_BASE = PUBLIC_API_BASE;

	let activeTab = $state<'subscribers' | 'compose' | 'history'>('subscribers');
	let subs = $state<any[]>([]); let broadcasts = $state<any[]>([]); let statsData = $state<any>(null);
	let selectedIds = $state<number[]>([]); let sending = $state(false);
	let bcForm = $state({ subject: '', content: '' });
	let viewBroadcast = $state<any>(null);

	async function fetchSubs() { try { const r = await adminGet<any>('/admin/newsletter'); if (r.success) subs = (r.data as any).data ?? r.data ?? []; } catch {} }
	async function fetchStats() { try { const r = await adminGet<any>('/admin/newsletter/stats'); if (r.success) statsData = r.data; } catch {} }
	async function fetchBroadcasts() { try { const r = await adminGet<any[]>('/admin/newsletter/broadcasts'); if (r.success) broadcasts = r.data ?? []; } catch {} }
	async function deleteSub(id: number) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/newsletter/${id}`); toast_success('Đã xóa.'); fetchSubs(); fetchStats(); } catch { toast_error('Lỗi'); } }
	async function bulkDelete() { if (!selectedIds.length || !confirm(`Xóa ${selectedIds.length}?`)) return; try { await adminPost('/admin/newsletter/bulk-delete', { ids: selectedIds }); toast_success('Đã xóa!'); selectedIds = []; fetchSubs(); fetchStats(); } catch { toast_error('Lỗi'); } }
	async function sendBroadcast() { if (!bcForm.subject || !bcForm.content) return; if (!confirm(`Gửi bản tin "${bcForm.subject}" đến ${statsData?.active ?? 0} subscribers?`)) return; sending = true; try { await adminPost('/admin/newsletter/broadcast', bcForm); toast_success('Đã gửi broadcast!'); bcForm = { subject: '', content: '' }; activeTab = 'history'; fetchBroadcasts(); fetchStats(); } catch { toast_error('Lỗi'); } finally { sending = false; } }
	async function deleteBroadcast(id: number) { if (!confirm('Xóa?')) return; try { await adminDelete(`/admin/newsletter/broadcast/${id}`); toast_success('Đã xóa.'); fetchBroadcasts(); } catch { toast_error('Lỗi'); } }

	function exportCsv() {
		const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
		const url = `${API_BASE}/admin/newsletter/export`;
		const a = document.createElement('a');
		a.href = url + (token ? `?token=${token}` : '');
		a.download = 'newsletter_subscribers.csv';
		a.click();
	}

	onMount(() => { fetchSubs(); fetchStats(); fetchBroadcasts(); });
</script>
<svelte:head><title>Admin - Bản Tin</title></svelte:head>
<div class="admin-page">
	<div class="page-head">
		<h1>📰 Quản Lý Bản Tin</h1>
		<button class="btn-brand" onclick={exportCsv}>📥 Xuất CSV</button>
	</div>

	{#if statsData}
		<div class="stats-grid">
			<div class="stat-card"><span class="si">📊</span><span class="sv">{statsData.active ?? 0}</span><span class="sl">Đang hoạt động</span></div>
			<div class="stat-card"><span class="si">📧</span><span class="sv">{statsData.total ?? 0}</span><span class="sl">Tổng cộng</span></div>
			<div class="stat-card unsub"><span class="si">🚫</span><span class="sv">{statsData.unsubscribed ?? 0}</span><span class="sl">Đã hủy</span></div>
			<div class="stat-card"><span class="si">📤</span><span class="sv">{statsData.broadcasts_sent ?? broadcasts.length}</span><span class="sl">Broadcasts</span></div>
		</div>
	{/if}

	<div class="tab-bar">
		<button class:active={activeTab==='subscribers'} onclick={() => activeTab='subscribers'}>📋 Subscribers</button>
		<button class:active={activeTab==='compose'} onclick={() => activeTab='compose'}>✏️ Soạn Bản Tin</button>
		<button class:active={activeTab==='history'} onclick={() => { activeTab='history'; fetchBroadcasts(); }}>📨 Lịch Sử Gửi</button>
	</div>

	<!-- TAB 1: Subscribers -->
	{#if activeTab === 'subscribers'}
		{#if selectedIds.length > 0}<div class="bulk-bar"><button class="btn-danger" onclick={bulkDelete}>🗑 Xóa {selectedIds.length}</button></div>{/if}
		<div class="table-card">
			<table class="crud-table"><thead><tr><th><input type="checkbox" onchange={(e) => { selectedIds = (e.target as HTMLInputElement).checked ? subs.map((s:any)=>s.id) : []; }} /></th><th>Email</th><th>Trạng thái</th><th>Ngày đăng ký</th><th>Ngày hủy</th><th>Thao tác</th></tr></thead>
			<tbody>
				{#if !subs.length}<tr><td colspan="6" class="empty-row">Chưa có subscriber</td></tr>{/if}
				{#each subs as sub (sub.id)}
					<tr><td data-label="Chọn"><input type="checkbox" value={sub.id} bind:group={selectedIds} /></td><td data-label="Email"><strong>{sub.email}</strong></td><td data-label="Trạng thái"><span class="badge {sub.unsubscribed_at ? 'bg-gray' : 'bg-green'}">{sub.unsubscribed_at ? 'Đã hủy' : 'Active'}</span></td><td data-label="Ngày đăng ký" class="cell-date">{formatDateTime(sub.subscribed_at ?? sub.created_at)}</td><td data-label="Ngày hủy" class="cell-date">{sub.unsubscribed_at ? formatDateTime(sub.unsubscribed_at) : '—'}</td><td data-label="Thao tác" class="td-actions"><button class="btn-sm btn-red" onclick={() => deleteSub(sub.id)}>🗑</button></td></tr>
				{/each}
			</tbody></table>
		</div>

	<!-- TAB 2: Compose -->
	{:else if activeTab === 'compose'}
		<div class="compose-section">
			<p class="compose-info">Gửi email đến <strong>{statsData?.active ?? 0}</strong> subscribers đang hoạt động.</p>
			<div class="field"><label>Tiêu đề *<input bind:value={bcForm.subject} placeholder="VD: Cập nhật tháng 5 từ Selorson" /></label></div>
			<div class="field"><label>Nội dung *<textarea bind:value={bcForm.content} rows="10" placeholder="Nội dung bản tin..."></textarea></label></div>
			<div class="compose-actions">
				<button class="btn-brand" disabled={sending || !bcForm.subject.trim() || !bcForm.content.trim()} onclick={sendBroadcast}>{sending ? '⏳ Đang gửi...' : '📤 Gửi Bản Tin'}</button>
				<span class="compose-note">⚠️ Email sẽ được gửi qua hàng đợi — không cần đợi.</span>
			</div>
		</div>

	<!-- TAB 3: History -->
	{:else}
		<div class="table-card">
			<table class="crud-table"><thead><tr><th>ID</th><th>Tiêu đề</th><th>Số người nhận</th><th>Trạng thái</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead>
			<tbody>
				{#if !broadcasts.length}<tr><td colspan="6" class="empty-row">Chưa gửi bản tin nào</td></tr>{/if}
				{#each broadcasts as bc (bc.id)}
					<tr>
						<td data-label="ID">#{bc.id}</td>
						<td data-label="Tiêu đề"><strong>{bc.subject}</strong></td>
						<td data-label="Số người nhận" class="cell-num">{bc.recipient_count}</td>
						<td data-label="Trạng thái"><span class="badge {bc.status === 'sent' ? 'bg-green' : 'bg-yellow'}">{bc.status}</span></td>
						<td data-label="Ngày gửi" class="cell-date">{bc.sent_at ? formatDateTime(bc.sent_at) : '—'}</td>
						<td data-label="Thao tác" class="td-actions">
							<button class="btn-sm btn-view" onclick={() => viewBroadcast = bc}>👁 Xem</button>
							<button class="btn-sm btn-red" onclick={() => deleteBroadcast(bc.id)}>🗑</button>
						</td>
					</tr>
				{/each}
			</tbody></table>
		</div>
	{/if}
</div>

<!-- View Broadcast Modal -->
<AdminModal bind:open={viewBroadcast} title={viewBroadcast?.subject ?? 'Xem Bản Tin'} size="md">
	{#if viewBroadcast}
		<div class="bc-meta">📤 {viewBroadcast.recipient_count} người nhận · {viewBroadcast.sent_at ? formatDateTime(viewBroadcast.sent_at) : ''}</div>
		<div class="bc-content">{viewBroadcast.content}</div>
	{/if}
	<div class="form-actions"><button class="btn-cancel" onclick={() => viewBroadcast = null}>Đóng</button></div>
</AdminModal>

<style>
	.admin-page { max-width: 1000px; }
	.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.page-head h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
	.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
	.stat-card { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.25rem; text-align: center; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .stat-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.stat-card.unsub .sv { color: #f87171 !important; }
	.si { font-size: 1.5rem; display: block; margin-bottom: .5rem; }
	.sv { font-size: 2rem; font-weight: 800; color: var(--color-brand-300); display: block; }
	.sl { font-size: .75rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
	.tab-bar { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
	.tab-bar button { padding: .75rem 1.25rem; background: var(--color-surface-200); border: none; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; color: var(--color-text-muted); transition: all .2s; }
	.tab-bar button.active { background: var(--color-brand-500); color: #fff; }
	.tab-bar button:hover:not(.active) { background: rgba(12,113,61,.08); color: var(--color-brand-400); }
	.bulk-bar { margin-bottom: 1rem; }
	.btn-danger { padding: .5rem 1rem; background: #ef4444; color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; }
	.table-card { background: var(--color-surface-100); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .table-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.crud-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.crud-table th { padding: .75rem 1rem; text-align: left; background: var(--color-surface-200); color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; }
	.crud-table td { padding: .75rem 1rem; border-top: 1px solid rgba(255,255,255,.04); }
	.empty-row { text-align: center; color: var(--color-text-muted); padding: 3rem !important; }
	.badge { padding: .125rem .5rem; border-radius: 1rem; font-size: .6875rem; font-weight: 600; }
	.bg-green { background: rgba(16,185,129,.15); color: #34d399; }
	.bg-gray { background: rgba(107,114,128,.15); color: #9ca3af; }
	.bg-yellow { background: rgba(245,158,11,.15); color: #fbbf24; }
	.cell-date { font-size: .75rem; color: var(--color-text-muted); }
	.cell-num { font-weight: 700; text-align: center; }
	.btn-sm { padding: .25rem .5rem; border: none; border-radius: .25rem; cursor: pointer; font-size: .75rem; }
	.btn-red { background: transparent; color: #f87171; }
	.btn-view { background: transparent; color: #60a5fa; font-weight: 600; }
	.compose-section { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.5rem; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .compose-section { background: #fff; border-color: rgba(0,0,0,.04); }
	.compose-info { color: var(--color-text-muted); font-size: .8125rem; margin: 0 0 1.5rem; }
	.compose-info strong { color: var(--color-brand-300); }
	.compose-section .field { margin-bottom: 1.25rem; }
	.compose-section label { display: flex; flex-direction: column; gap: .375rem; font-weight: 600; font-size: .875rem; color: var(--color-text-primary); }
	.compose-section input, .compose-section textarea { width: 100%; padding: .75rem 1rem; border: 2px solid rgba(255,255,255,.08); border-radius: .75rem; font-size: .875rem; font-family: inherit; background: var(--color-surface-200); color: var(--color-text-primary); resize: vertical; transition: border-color .2s; box-sizing: border-box; }
	:global(html[data-theme='light']) .compose-section input, :global(html[data-theme='light']) .compose-section textarea { border-color: #e5e7eb; background: #f9fafb; }
	.compose-section input:focus, .compose-section textarea:focus { outline: none; border-color: var(--color-brand-500); box-shadow: 0 0 0 3px rgba(12,113,61,.1); }
	.compose-actions { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
	.compose-note { font-size: .75rem; color: var(--color-text-muted); }
	.bc-meta { font-size: .75rem; color: var(--color-text-muted); margin-bottom: 1rem; padding-bottom: .75rem; border-bottom: 1px solid rgba(255,255,255,.06); }
	.bc-content { white-space: pre-wrap; font-size: .875rem; line-height: 1.7; }
	@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
