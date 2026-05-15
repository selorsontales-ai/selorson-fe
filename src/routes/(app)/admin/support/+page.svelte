<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, formatDateTime } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let loading = $state(true); let activeFilter = $state('all_active'); let showPerf = $state(false);
	let stats = $state<any>(null); let managers = $state<any[]>([]); let conversations = $state<any[]>([]); let performance = $state<any>(null);

	const filters = [{ key: 'pending', label: '⏳ Chờ nhận' }, { key: 'all_active', label: '💬 Đang xử lý' }, { key: 'resolved', label: '✅ Đã giải quyết' }];
	const statusLabels: Record<string, string> = { pending: 'Chờ nhận', active: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng' };

	async function fetchStats() { try { const r = await adminGet<any>('/manager/support/stats'); if (r.success) stats = r.data; } catch {} }
	async function fetchManagers() { try { const r = await adminGet<any>('/manager/support/managers'); if (r.success) managers = r.data ?? []; } catch {} }
	async function fetchConversations(filter = 'all_active') { loading = true; try { const r = await adminGet<any[]>(`/manager/support?status=${filter}`); if (r.success) conversations = r.data ?? []; } catch {} finally { loading = false; } }
	async function fetchPerformance(managerId: number) { try { const r = await adminGet<any>(`/manager/support/managers`); if (r.success) { performance = (r.data ?? []).find((m: any) => m.id === managerId) ?? null; } } catch {} }
	async function changeFilter(key: string) { activeFilter = key; await fetchConversations(key); }
	async function viewPerformance(managerId: number) { showPerf = true; performance = null; await fetchPerformance(managerId); }

	onMount(async () => { await Promise.all([fetchStats(), fetchManagers(), fetchConversations('all_active')]); });
</script>
<svelte:head><title>Admin - Giám Sát CSKH</title></svelte:head>
<div class="support-page">
	<h1>📊 Giám Sát CSKH</h1><p class="subtitle">Theo dõi hiệu suất nhân viên chăm sóc khách hàng</p>

	<div class="stats-grid">
		<div class="stat-card"><span class="si pending">⏳</span><div><span class="sv">{stats?.pending ?? 0}</span><span class="sl">Chờ nhận</span></div></div>
		<div class="stat-card"><span class="si active">💬</span><div><span class="sv">{stats?.active ?? 0}</span><span class="sl">Đang xử lý</span></div></div>
		<div class="stat-card"><span class="si resolved">✅</span><div><span class="sv">{stats?.today ?? 0}</span><span class="sl">Giải quyết hôm nay</span></div></div>
		<div class="stat-card"><span class="si rating">⭐</span><div><span class="sv">{stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'}</span><span class="sl">Rating TB</span></div></div>
	</div>

	<div class="section-card">
		<h2>👥 Hiệu Suất Nhân Viên</h2>
		{#if !managers.length}<p class="empty-text">Chưa có nhân viên CSKH.</p>
		{:else}
			<table class="perf-table"><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Đang xử lý</th><th>Đã giải quyết</th><th>Rating TB</th><th></th></tr></thead>
			<tbody>{#each managers as m (m.id)}
				<tr><td><div class="mgr-info"><span class="mgr-av">{(m.name ?? '?').charAt(0).toUpperCase()}</span><span class="mgr-name">{m.name}</span></div></td><td><span class="role-tag {m.role}">{m.role}</span></td><td class="num">{m.active_count ?? '—'}</td><td class="num">{m.resolved_count ?? '—'}</td><td class="num">{m.avg_rating ? Number(m.avg_rating).toFixed(1) : '—'}</td><td><button class="view-btn" onclick={() => viewPerformance(m.id)}>📈 Chi tiết</button></td></tr>
			{/each}</tbody></table>
		{/if}
	</div>

	<div class="section-card">
		<h2>📋 Tổng Quan Cuộc Hội Thoại</h2>
		<div class="filter-row">{#each filters as f}<button class:active={activeFilter===f.key} onclick={() => changeFilter(f.key)}>{f.label}</button>{/each}</div>
		{#if loading}<p class="empty-text">Đang tải...</p>
		{:else if !conversations.length}<p class="empty-text">Không có cuộc hội thoại nào.</p>
		{:else}
			<table class="conv-table"><thead><tr><th>ID</th><th>Khách</th><th>Nhân viên</th><th>Trạng thái</th><th>Ưu tiên</th><th>Cập nhật</th><th>Rating</th></tr></thead>
			<tbody>{#each conversations as c (c.id)}
				<tr><td class="id-cell">#{c.id}</td><td>{c.user?.name ?? 'User #' + c.user_id}</td><td>{c.manager?.name ?? '—'}</td><td><span class="status-tag {c.status}">{statusLabels[c.status] ?? c.status}</span></td><td><span class="priority-tag {c.priority}">{c.priority}</span></td><td class="time-cell">{formatDateTime(c.updated_at)}</td>
				<td>{#if c.rating}<span style="color:#fbbf24;font-weight:bold">⭐ {c.rating}/5</span>{#if c.rating_comment}<div style="font-size:.75rem;color:var(--color-text-muted);margin-top:4px;font-style:italic">"{c.rating_comment}"</div>{/if}{:else}—{/if}</td></tr>
			{/each}</tbody></table>
		{/if}
	</div>
</div>

<AdminModal bind:open={showPerf} title="📈 Chi tiết hiệu suất" size="sm">
	{#if performance}
		<div class="perf-grid">
			<div class="perf-item"><span class="pn">{performance.total_conversations}</span><span class="pl">Tổng hội thoại</span></div>
			<div class="perf-item"><span class="pn">{performance.resolved_conversations}</span><span class="pl">Đã giải quyết</span></div>
			<div class="perf-item"><span class="pn">{performance.avg_resolution_time ?? '—'}</span><span class="pl">Thời gian TB (phút)</span></div>
			<div class="perf-item"><span class="pn">{performance.avg_rating ? Number(performance.avg_rating).toFixed(1) : '—'}</span><span class="pl">Rating TB</span></div>
		</div>
	{:else}<p class="empty-text">Đang tải...</p>{/if}
	<div class="form-actions"><button class="btn-cancel" onclick={() => showPerf = false}>Đóng</button></div>
</AdminModal>

<style>
	.support-page { max-width: 100%; }
	h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
	.subtitle { color: var(--color-text-muted); font-size: .8125rem; margin: .25rem 0 1.5rem; }
	.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
	.stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--color-surface-100); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .stat-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.si { font-size: 1.5rem; width: 48px; height: 48px; border-radius: .75rem; display: flex; align-items: center; justify-content: center; }
	.si.pending { background: rgba(251,191,36,.15); } .si.active { background: rgba(59,130,246,.15); } .si.resolved { background: rgba(16,185,129,.15); } .si.rating { background: rgba(245,158,11,.15); }
	.sv { font-size: 1.5rem; font-weight: 800; display: block; }
	.sl { font-size: .6875rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); }
	.section-card { background: var(--color-surface-100); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.04); padding: 1.5rem; margin-bottom: 1.5rem; }
	:global(html[data-theme='light']) .section-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.section-card h2 { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; }
	.empty-text { text-align: center; color: var(--color-text-muted); font-size: .8125rem; padding: 1.5rem; }
	.perf-table, .conv-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.perf-table th, .conv-table th { text-align: left; font-size: .6875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted); padding: .75rem .5rem; border-bottom: 2px solid rgba(255,255,255,.06); }
	.perf-table td, .conv-table td { padding: .75rem .5rem; border-bottom: 1px solid rgba(255,255,255,.03); }
	.mgr-info { display: flex; align-items: center; gap: .5rem; }
	.mgr-av { width: 28px; height: 28px; border-radius: 50%; background: rgba(12,113,61,.15); color: var(--color-brand-300); font-weight: 700; font-size: .75rem; display: flex; align-items: center; justify-content: center; }
	.mgr-name { font-weight: 600; }
	.role-tag { font-size: .625rem; font-weight: 700; text-transform: uppercase; padding: .125rem .375rem; border-radius: .25rem; }
	.role-tag.admin { background: rgba(245,158,11,.15); color: #fbbf24; } .role-tag.manager { background: rgba(59,130,246,.15); color: #60a5fa; }
	.num { text-align: center; font-weight: 600; }
	.id-cell { font-weight: 600; color: var(--color-text-muted); }
	.time-cell { font-size: .75rem; color: var(--color-text-muted); }
	.status-tag { font-size: .625rem; font-weight: 700; text-transform: uppercase; padding: .1875rem .5rem; border-radius: 1rem; }
	.status-tag.pending { background: rgba(251,191,36,.15); color: #fbbf24; } .status-tag.active { background: rgba(59,130,246,.15); color: #60a5fa; } .status-tag.resolved { background: rgba(16,185,129,.15); color: #34d399; } .status-tag.closed { background: rgba(107,114,128,.15); color: #9ca3af; }
	.priority-tag { font-size: .625rem; font-weight: 700; text-transform: uppercase; padding: .125rem .375rem; border-radius: .25rem; }
	.priority-tag.low { background: rgba(16,185,129,.15); color: #34d399; } .priority-tag.normal { background: rgba(251,191,36,.15); color: #fbbf24; } .priority-tag.high { background: rgba(239,68,68,.15); color: #f87171; }
	.view-btn { padding: .25rem .5rem; background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.15); border-radius: .375rem; font-size: .6875rem; cursor: pointer; color: #34d399; font-weight: 600; }
	.filter-row { display: flex; gap: .25rem; margin-bottom: 1rem; }
	.filter-row button { padding: .375rem .75rem; background: transparent; border: 1px solid var(--color-surface-400); border-radius: var(--radius-md); cursor: pointer; font-size: .75rem; font-weight: 500; color: var(--color-text-muted); }
	.filter-row button.active { background: var(--color-brand-500); color: #fff; border-color: var(--color-brand-500); }
	.perf-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; }
	.perf-item { text-align: center; padding: 1rem; background: var(--color-surface-200); border-radius: var(--radius-md); }
	.pn { font-size: 1.5rem; font-weight: 800; color: var(--color-brand-300); display: block; }
	.pl { font-size: .6875rem; color: var(--color-text-muted); margin-top: .25rem; display: block; }
	@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
