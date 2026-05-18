<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, adminPost, adminDelete, toast_success, toast_error, formatDateTime } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface ReportItem { id: number; reason: string; description: string | null; status: string; admin_note: string | null; created_at: string; resolved_at: string | null; reporter: { name: string; username: string } | null; reported_user: { id: number; name: string; username: string } | null; resolved_by: { name: string } | null; }
	let loading = $state(true); let processing = $state(false); let bulkDeleting = $state(false); let activeTab = $state('pending');
	let reports = $state<ReportItem[]>([]); let stats = $state({ pending: 0, resolved: 0, dismissed: 0 });
	let actionModal = $state({ open: false, type: 'resolve' as 'resolve' | 'dismiss', report: null as ReportItem | null, adminNote: '', actionBan: false, banReason: '', banDays: null as number | null });
	let tabDefs = $derived([{key:'pending',icon:'⏳',label:'Chờ',count:stats.pending},{key:'resolved',icon:'✅',label:'Đã xử lý',count:stats.resolved},{key:'dismissed',icon:'❌',label:'Bác bỏ',count:stats.dismissed},{key:'all',icon:'📋',label:'Tất cả',count:0}]);

	const reasonLabels: Record<string, string> = { harassment: 'Quấy rối', spam: 'Spam', fake_account: 'Giả mạo', inappropriate: 'Không phù hợp', other: 'Khác' };
	function rLabel(r: string) { return reasonLabels[r] || r; }
	function rBadge(r: string) { return ({ harassment: 'badge-red', spam: 'badge-yellow', fake_account: 'badge-purple', inappropriate: 'badge-red' })[r] || 'badge-gray'; }
	function sBadge(s: string) { return ({ pending: 'badge-yellow', resolved: 'badge-green', dismissed: 'badge-gray' })[s] || 'badge-gray'; }
	function sLabel(s: string) { return ({ pending: 'Chờ xử lý', resolved: 'Đã xử lý', dismissed: 'Đã bác bỏ' })[s] || s; }

	async function fetchReports(status = 'pending') { loading = true; try { const r = await adminGet<any>(`/admin/reports?status=${status}`); if (r.success) { const raw: any = r.data; reports = raw.data ?? []; } } catch { toast_error('Lỗi'); } finally { loading = false; } }
	async function fetchStats() { try { const [p, r, d] = await Promise.all([adminGet<any>('/admin/reports?status=pending'), adminGet<any>('/admin/reports?status=resolved'), adminGet<any>('/admin/reports?status=dismissed')]); stats.pending = (p.data as any)?.total ?? (p.data as any)?.data?.length ?? 0; stats.resolved = (r.data as any)?.total ?? (r.data as any)?.data?.length ?? 0; stats.dismissed = (d.data as any)?.total ?? (d.data as any)?.data?.length ?? 0; } catch {} }

	function openAction(report: ReportItem, type: 'resolve' | 'dismiss') { actionModal = { open: true, type, report, adminNote: '', actionBan: false, banReason: '', banDays: null }; }
	async function executeAction() { if (!actionModal.report) return; processing = true; try { const payload: any = { admin_note: actionModal.adminNote || null }; if (actionModal.type === 'resolve' && actionModal.actionBan) { payload.action_ban = true; payload.ban_reason = actionModal.banReason || null; payload.ban_days = actionModal.banDays || null; } await adminPost(`/admin/reports/${actionModal.report.id}/${actionModal.type}`, payload); toast_success('OK!'); actionModal.open = false; fetchReports(activeTab); fetchStats(); } catch { toast_error('Lỗi'); } finally { processing = false; } }
	async function deleteReport(r: ReportItem) { if (!confirm(`Xóa #${r.id}?`)) return; try { await adminDelete(`/admin/reports/${r.id}`); toast_success('Đã xóa.'); fetchReports(activeTab); fetchStats(); } catch { toast_error('Lỗi'); } }
	async function bulkDelete(status: string, days: number) { if (!confirm('Xóa hàng loạt?')) return; bulkDeleting = true; try { await adminPost('/admin/reports/bulk-delete', { status, older_than_days: days || null }); toast_success('Đã xóa.'); fetchReports(activeTab); fetchStats(); } catch { toast_error('Lỗi'); } finally { bulkDeleting = false; } }

	onMount(() => { fetchReports('pending'); fetchStats(); });
</script>
<svelte:head><title>Admin - Báo Cáo</title></svelte:head>
<div class="reports-page">
	<h1>⚠️ Báo Cáo Người Dùng</h1><p class="subtitle">Quản lý và xử lý báo cáo vi phạm</p>
	<div class="stats-grid">
		<div class="stat-card c-yellow"><span class="si">⏳</span><span class="sv">{stats.pending}</span><span class="sl">Chờ xử lý</span></div>
		<div class="stat-card c-green"><span class="si">✅</span><span class="sv">{stats.resolved}</span><span class="sl">Đã xử lý</span></div>
		<div class="stat-card c-red"><span class="si">❌</span><span class="sv">{stats.dismissed}</span><span class="sl">Đã bác bỏ</span></div>
	</div>
	<div class="tab-bar">{#each tabDefs as tab}<button class:active={activeTab===tab.key} onclick={() => { activeTab=tab.key; fetchReports(tab.key); }}>{tab.icon} {tab.label} {#if tab.count > 0}<span class="tc">{tab.count}</span>{/if}</button>{/each}</div>
	<div class="cleanup"><span>🧹</span><button onclick={() => bulkDelete('resolved', 30)} disabled={bulkDeleting}>Xóa resolved 30d</button><button onclick={() => bulkDelete('dismissed', 30)} disabled={bulkDeleting}>Xóa dismissed 30d</button><button class="danger" onclick={() => bulkDelete('all_closed', 0)} disabled={bulkDeleting}>Xóa tất cả đã đóng</button></div>
	{#if loading}<p class="loading">Đang tải...</p>
	{:else}
		<div class="section-card"><table class="crud-table"><thead><tr><th>Người báo</th><th>Bị báo</th><th>Lý do</th><th>Mô tả</th><th>Ngày</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
		<tbody>{#if !reports.length}<tr><td colspan="7" class="empty-row">{activeTab === 'pending' ? 'Không có 🎉' : 'Không có'}</td></tr>{/if}
		{#each reports as r (r.id)}
			<tr><td data-label="Người báo"><strong>{r.reporter?.name ?? '—'}</strong><br/><span class="meta">@{r.reporter?.username}</span></td><td data-label="Bị báo" class="reported"><strong>{r.reported_user?.name ?? '—'}</strong><br/><span class="meta">@{r.reported_user?.username}</span></td><td data-label="Lý do"><span class="badge {rBadge(r.reason)}">{rLabel(r.reason)}</span></td><td data-label="Mô tả" class="cell-trunc">{r.description ?? '—'}</td><td data-label="Ngày" class="cell-date">{formatDateTime(r.created_at)}</td><td data-label="Trạng thái"><span class="badge {sBadge(r.status)}">{sLabel(r.status)}</span></td>
			<td data-label="Thao tác" class="td-act">{#if r.status === 'pending'}<button class="ab ab-g" onclick={() => openAction(r, 'resolve')}>✅</button><button class="ab ab-r" onclick={() => openAction(r, 'dismiss')}>❌</button>{:else}<span class="meta">{r.resolved_by?.name} · {formatDateTime(r.resolved_at)}</span><button class="ab ab-r" onclick={() => deleteReport(r)}>🗑️</button>{/if}</td></tr>
		{/each}</tbody></table></div>
	{/if}
</div>
<AdminModal bind:open={actionModal.open} title={actionModal.type === 'resolve' ? '✅ Xử lý báo cáo' : '❌ Bác bỏ báo cáo'}>
	<div class="action-summary">
		<p><strong>Bị báo cáo:</strong> {actionModal.report?.reported_user?.name}</p>
		<p><strong>Lý do:</strong> {rLabel(actionModal.report?.reason ?? '')}</p>
		{#if actionModal.report?.description}<p><strong>Mô tả:</strong> {actionModal.report.description}</p>{/if}
	</div>
	<div class="field"><label>Ghi chú admin<textarea bind:value={actionModal.adminNote} rows="3"></textarea></label></div>
	{#if actionModal.type === 'resolve'}
		<div class="ban-section">
			<label class="checkbox-label"><input type="checkbox" bind:checked={actionModal.actionBan} /> 🚫 Ban người dùng này</label>
			{#if actionModal.actionBan}
				<input bind:value={actionModal.banReason} placeholder="Lý do ban" style="margin-top:.5rem" />
				<input bind:value={actionModal.banDays} type="number" min="1" placeholder="Số ngày (trống = vĩnh viễn)" style="margin-top:.5rem" />
			{/if}
		</div>
	{/if}
	<div class="form-actions"><button class="btn-cancel" onclick={() => actionModal.open = false}>Hủy</button><button class="btn-save" style={actionModal.type === 'dismiss' ? 'background:#dc2626' : ''} onclick={executeAction} disabled={processing}>{processing ? '⏳...' : actionModal.type === 'resolve' ? '✅ Xác nhận' : '❌ Xác nhận'}</button></div>
</AdminModal>
<style>
	.reports-page { max-width: 1200px; }
	h1 { font-size: 1.75rem; font-weight: 800; margin: 0; }
	.subtitle { color: var(--color-text-muted); font-size: .875rem; margin: .25rem 0 2rem; }
	.loading { text-align: center; padding: 3rem; color: var(--color-text-muted); }
	.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 2rem; }
	.stat-card { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.25rem; text-align: center; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .stat-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.stat-card::before { content:''; position: absolute; top:0; left:0; right:0; height: 3px; }
	.c-yellow::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); } .c-green::before { background: linear-gradient(90deg, #10b981, #34d399); } .c-red::before { background: linear-gradient(90deg, #ef4444, #f87171); }
	.si { font-size: 1.75rem; display: block; margin-bottom: .5rem; } .sv { font-size: 2.25rem; font-weight: 800; display: block; } .sl { font-size: .75rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
	.tab-bar { display: flex; gap: .5rem; margin-bottom: 1rem; border-bottom: 2px solid rgba(255,255,255,.06); }
	.tab-bar button { padding: .75rem 1.25rem; background: none; border: none; border-bottom: 2px solid transparent; font-weight: 600; color: var(--color-text-muted); cursor: pointer; display: flex; align-items: center; gap: .5rem; margin-bottom: -2px; }
	.tab-bar button.active { color: var(--color-brand-300); border-bottom-color: var(--color-brand-400); }
	.tc { background: rgba(239,68,68,.15); color: #f87171; padding: .0625rem .5rem; border-radius: 1rem; font-size: .6875rem; font-weight: 700; }
	.cleanup { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.25rem; padding: .875rem; background: var(--color-surface-100); border-radius: var(--radius-md); }
	.cleanup button { padding: .375rem .75rem; border: 1px solid var(--color-surface-400); border-radius: var(--radius-md); background: var(--color-surface-200); color: var(--color-text-secondary); font-size: .75rem; cursor: pointer; }
	.cleanup .danger { color: #f87171; border-color: rgba(239,68,68,.2); }
	.section-card { background: var(--color-surface-100); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .section-card { background: #fff; }
	.crud-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.crud-table th { padding: .75rem 1rem; text-align: left; background: var(--color-surface-200); color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; }
	.crud-table td { padding: .75rem 1rem; border-top: 1px solid rgba(255,255,255,.04); }
	.empty-row { text-align: center; color: var(--color-text-muted); padding: 3rem !important; }
	.reported strong { color: #f87171; }
	.meta { font-size: .6875rem; color: var(--color-text-muted); }
	.cell-trunc { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cell-date { font-size: .75rem; color: var(--color-text-muted); white-space: nowrap; }
	.badge { display: inline-block; padding: .125rem .5rem; border-radius: 1rem; font-size: .6875rem; font-weight: 600; }
	.td-act { white-space: nowrap; }
	.ab { padding: .375rem .75rem; border-radius: var(--radius-md); font-size: .75rem; font-weight: 600; cursor: pointer; border: 1px solid; margin-right: .25rem; }
	.ab-g { background: rgba(16,185,129,.15); color: #34d399; border-color: rgba(16,185,129,.2); }
	.ab-r { background: rgba(239,68,68,.15); color: #f87171; border-color: rgba(239,68,68,.2); }
	.action-summary { background: var(--color-surface-200); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; }
	.action-summary p { margin: .25rem 0; font-size: .875rem; }
	.ban-section { margin-top: 1rem; padding: 1rem; background: rgba(239,68,68,.08); border-radius: var(--radius-md); border: 1px solid rgba(239,68,68,.15); }
	@media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr; } }
</style>
