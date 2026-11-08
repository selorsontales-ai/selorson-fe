<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import { adminGet, formatDateTime } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { formatRoleBadge } from '$lib/i18n-labels';

	let loading = $state(true); let activeFilter = $state('all_active'); let showPerf = $state(false);
	let stats = $state<any>(null); let managers = $state<any[]>([]); let conversations = $state<any[]>([]); let performance = $state<any>(null);

	let filters = $derived([
		{ key: 'pending', label: m.admin_support_filter_pending() },
		{ key: 'all_active', label: m.admin_support_filter_active() },
		{ key: 'resolved', label: m.admin_support_filter_resolved() }
	]);
	function getStatusLabel(s: string) {
		if (s === 'pending') return m.cskh_status_pending();
		if (s === 'active') return m.cskh_status_active();
		if (s === 'resolved') return m.cskh_status_resolved();
		if (s === 'closed') return m.cskh_status_closed();
		return s;
	}

	async function fetchStats() { try { const r = await adminGet<any>('/manager/support/stats'); if (r.success) stats = r.data; } catch {} }
	async function fetchManagers() { try { const r = await adminGet<any>('/manager/support/managers'); if (r.success) managers = r.data ?? []; } catch {} }
	async function fetchConversations(filter = 'all_active') { loading = true; try { const r = await adminGet<any[]>(`/manager/support?status=${filter}`); if (r.success) conversations = r.data ?? []; } catch {} finally { loading = false; } }
	async function fetchPerformance(managerId: number) { try { const r = await adminGet<any>(`/manager/support/managers`); if (r.success) { performance = (r.data ?? []).find((mgr: any) => mgr.id === managerId) ?? null; } } catch {} }
	async function changeFilter(key: string) { activeFilter = key; await fetchConversations(key); }
	async function viewPerformance(managerId: number) { showPerf = true; performance = null; await fetchPerformance(managerId); }

	onMount(async () => { await Promise.all([fetchStats(), fetchManagers(), fetchConversations('all_active')]); });
</script>
<svelte:head><title>{m.admin_support_page_title()}</title></svelte:head>
<div class="support-page">
	<h1>{m.admin_support_heading()}</h1><p class="subtitle">{m.admin_support_subtitle()}</p>

	<div class="stats-grid">
		<div class="stat-card"><span class="si pending">⏳</span><div><span class="sv">{stats?.pending ?? 0}</span><span class="sl">{m.admin_support_stat_pending()}</span></div></div>
		<div class="stat-card"><span class="si active">💬</span><div><span class="sv">{stats?.active ?? 0}</span><span class="sl">{m.admin_support_stat_active()}</span></div></div>
		<div class="stat-card"><span class="si resolved">✅</span><div><span class="sv">{stats?.today ?? 0}</span><span class="sl">{m.admin_support_stat_today()}</span></div></div>
		<div class="stat-card"><span class="si rating">⭐</span><div><span class="sv">{stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'}</span><span class="sl">{m.admin_support_stat_avg_rating()}</span></div></div>
	</div>

	<div class="section-card">
		<h2>{m.admin_support_tab_performance()}</h2>
		{#if !managers.length}<p class="empty-text">{m.admin_support_perf_empty()}</p>
		{:else}
			<table class="perf-table"><thead><tr><th>{m.admin_support_perf_staff()}</th><th>{m.admin_support_role()}</th><th>{m.admin_support_stat_active()}</th><th>{m.admin_support_perf_resolved()}</th><th>{m.admin_support_perf_avg_rating()}</th><th></th></tr></thead>
			<tbody>{#each managers as mgr (mgr.id)}
				<tr><td data-label={m.admin_support_perf_staff()}><div class="mgr-info"><span class="mgr-av">{(mgr.name ?? '?').charAt(0).toUpperCase()}</span><span class="mgr-name">{mgr.name}</span></div></td><td data-label={m.admin_support_role()}><span class="role-tag {mgr.role}">{formatRoleBadge(mgr.role)}</span></td><td data-label={m.admin_support_stat_active()} class="num">{mgr.active_count ?? '—'}</td><td data-label={m.admin_support_perf_resolved()} class="num">{mgr.resolved_count ?? '—'}</td><td data-label={m.admin_support_perf_avg_rating()} class="num">{mgr.avg_rating ? Number(mgr.avg_rating).toFixed(1) : '—'}</td><td data-label=""><button class="view-btn" onclick={() => viewPerformance(mgr.id)}>{m.admin_support_details()}</button></td></tr>
			{/each}</tbody></table>
		{/if}
	</div>

	<div class="section-card">
		<h2>{m.admin_support_overview()}</h2>
		<div class="filter-row">{#each filters as f}<button class:active={activeFilter===f.key} onclick={() => changeFilter(f.key)}>{f.label}</button>{/each}</div>
		{#if loading}<p class="empty-text">{m.cskh_loading()}</p>
		{:else if !conversations.length}<p class="empty-text">{m.admin_support_empty_convs()}</p>
		{:else}
			<table class="conv-table"><thead><tr><th>ID</th><th>{m.admin_support_customer()}</th><th>{m.admin_support_perf_staff()}</th><th>{m.admin_support_status()}</th><th>{m.admin_support_priority()}</th><th>{m.admin_support_updated()}</th><th>{m.admin_support_perf_avg_rating()}</th></tr></thead>
			<tbody>{#each conversations as c (c.id)}
				<tr><td data-label="ID" class="id-cell">#{c.id}</td><td data-label={m.admin_support_customer()}>{c.user?.name ?? 'User #' + c.user_id}</td><td data-label={m.admin_support_perf_staff()}>{c.manager?.name ?? '—'}</td><td data-label={m.admin_support_status()}><span class="status-tag {c.status}">{getStatusLabel(c.status)}</span></td><td data-label={m.admin_support_priority()}><span class="priority-tag {c.priority}">{c.priority}</span></td><td data-label={m.admin_support_updated()} class="time-cell">{formatDateTime(c.updated_at)}</td>
				<td data-label={m.admin_support_perf_avg_rating()}>{#if c.rating}<span style="color:#fbbf24;font-weight:bold">⭐ {c.rating}/5</span>{#if c.rating_comment}<div style="font-size:.75rem;color:var(--color-text-muted);margin-top:4px;font-style:italic">"{c.rating_comment}"</div>{/if}{:else}—{/if}</td></tr>
			{/each}</tbody></table>
		{/if}
	</div>
</div>

<AdminModal bind:open={showPerf} title={m.admin_support_perf_modal()} size="sm">
	{#if performance}
		<div class="perf-grid">
			<div class="perf-item"><span class="pn">{performance.total_conversations}</span><span class="pl">{m.admin_support_perf_total()}</span></div>
			<div class="perf-item"><span class="pn">{performance.resolved_conversations}</span><span class="pl">{m.admin_support_perf_resolved()}</span></div>
			<div class="perf-item"><span class="pn">{performance.avg_resolution_time ?? '—'}</span><span class="pl">{m.admin_support_perf_avg_time()}</span></div>
			<div class="perf-item"><span class="pn">{performance.avg_rating ? Number(performance.avg_rating).toFixed(1) : '—'}</span><span class="pl">{m.admin_support_perf_avg_rating()}</span></div>
		</div>
	{:else}<p class="empty-text">{m.cskh_loading()}</p>{/if}
	<div class="form-actions"><button class="btn-cancel" onclick={() => showPerf = false}>{m.cskh_btn_close()}</button></div>
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
	@media (max-width: 768px) {
		.stats-grid { grid-template-columns: repeat(2, 1fr); }
		.perf-table thead, .conv-table thead { display: none; }
		.perf-table, .perf-table tbody, .conv-table, .conv-table tbody { display: block; width: 100%; }
		.perf-table tr, .conv-table tr { display: flex; flex-direction: column; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,.1); border-radius: var(--radius-md); background: var(--color-surface-200); padding: .5rem; }
		:global(html[data-theme='light']) .perf-table tr, :global(html[data-theme='light']) .conv-table tr { border-color: rgba(0,0,0,.1); background: #f9fafb; }
		.perf-table td, .conv-table td { display: flex; justify-content: space-between; align-items: center; padding: .5rem !important; border: none !important; border-bottom: 1px solid rgba(255,255,255,.05) !important; }
		:global(html[data-theme='light']) .perf-table td, :global(html[data-theme='light']) .conv-table td { border-bottom-color: rgba(0,0,0,.05) !important; }
		.perf-table td:last-child, .conv-table td:last-child { border-bottom: none !important; }
		.perf-table td::before, .conv-table td::before { content: attr(data-label); font-weight: 600; color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; margin-right: 1rem; }
	}
</style>
