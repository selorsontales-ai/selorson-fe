<script lang="ts">
	import { adminGet, adminPost, toast_success, toast_error, formatDate, formatDateTime } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	let loading = $state(true); let activeTab = $state('banned');
	interface SecurityData { stats: { total_banned: number; login_attempts_today: number; admin_actions_today: number }; banned_users: any[]; login_attempts: any[]; audit_logs: any[]; }
	let data = $state<SecurityData | null>(null);
	let bannedUsers = $derived(data?.banned_users ?? []);
	let loginAttempts = $derived(data?.login_attempts ?? []);
	let auditLogs = $derived(data?.audit_logs ?? []);

	const tabs = $derived([
		{ key: 'banned', icon: '🚫', label: 'User bị Ban', count: bannedUsers.length },
		{ key: 'logins', icon: '🔐', label: 'Login thất bại', count: loginAttempts.length },
		{ key: 'audit', icon: '📋', label: 'Nhật ký', count: 0 },
	]);

	async function fetchData() { loading = true; try { const r = await adminGet<SecurityData>('/admin/security/dashboard'); if (r.success) data = r.data; } catch { toast_error('Lỗi tải dữ liệu.'); } finally { loading = false; } }
	async function unbanUser(user: any) { if (!confirm(`Gỡ ban "${user.name}"?`)) return; try { await adminPost(`/admin/users/${user.id}/unban`); toast_success(`Đã gỡ ban.`); fetchData(); } catch { toast_error('Lỗi'); } }
	function actionClass(a: string) { return a === 'create' ? 'badge-green' : a === 'update' ? 'badge-blue' : a === 'delete' ? 'badge-red' : 'badge-gray'; }
	function actionLabel(a: string) { return a === 'create' ? '✨ Tạo' : a === 'update' ? '✏️ Sửa' : a === 'delete' ? '🗑️ Xóa' : a; }
	onMount(fetchData);
</script>
<svelte:head><title>Admin - Bảo Mật</title></svelte:head>
<div class="security-page">
	<h1>🛡️ Bảo Mật Hệ Thống</h1>
	<p class="subtitle">Giám sát bảo mật, quản lý ban user, nhật ký hệ thống</p>
	{#if loading}<p class="loading">Đang tải...</p>
	{:else}
		<div class="stats-grid">
			<div class="stat-card c-red"><span class="si">🚫</span><span class="sv">{data?.stats?.total_banned ?? 0}</span><span class="sl">User bị Ban</span></div>
			<div class="stat-card c-yellow"><span class="si">🔐</span><span class="sv">{data?.stats?.login_attempts_today ?? 0}</span><span class="sl">Login thất bại (24h)</span></div>
			<div class="stat-card c-green"><span class="si">📋</span><span class="sv">{data?.stats?.admin_actions_today ?? 0}</span><span class="sl">Admin actions hôm nay</span></div>
		</div>
		<div class="tab-bar">{#each tabs as tab}<button class:active={activeTab===tab.key} onclick={() => activeTab=tab.key}>{tab.icon} {tab.label} {#if tab.count}<span class="tc">{tab.count}</span>{/if}</button>{/each}</div>
		<div class="section-card">
			{#if activeTab === 'banned'}
				<table class="crud-table"><thead><tr><th>User</th><th>Email</th><th>Lý do</th><th>Thời hạn</th><th>Ban bởi</th><th>Ngày</th><th>Thao tác</th></tr></thead>
				<tbody>{#if !bannedUsers.length}<tr><td colspan="7" class="empty-row">Không có 🎉</td></tr>{/if}
				{#each bannedUsers as user (user.id)}
					<tr><td><strong>{user.name}</strong> <span class="meta">@{user.username}</span></td><td>{user.email}</td><td class="cell-trunc">{user.ban_reason}</td><td>{#if user.banned_until}<span class="badge badge-yellow">{formatDate(user.banned_until)}</span>{:else}<span class="badge badge-red">Vĩnh viễn</span>{/if}</td><td>{user.banned_by_admin?.name ?? '—'}</td><td class="cell-date">{formatDate(user.banned_at)}</td><td><button class="btn-unban" onclick={() => unbanUser(user)}>✅ Unban</button></td></tr>
				{/each}</tbody></table>
			{:else if activeTab === 'logins'}
				<table class="crud-table"><thead><tr><th>Email</th><th>IP</th><th>Số lần</th><th>Lần cuối</th></tr></thead>
				<tbody>{#if !loginAttempts.length}<tr><td colspan="4" class="empty-row">Không có 🎉</td></tr>{/if}
				{#each loginAttempts as a, idx}<tr><td><strong>{a.email}</strong></td><td><code class="ip">{a.ip_address}</code></td><td><span class="badge {a.attempts >= 5 ? 'badge-red' : a.attempts >= 3 ? 'badge-yellow' : 'badge-blue'}">{a.attempts} lần</span></td><td class="cell-date">{formatDateTime(a.last_attempt)}</td></tr>{/each}</tbody></table>
			{:else}
				<table class="crud-table"><thead><tr><th>Admin</th><th>Hành động</th><th>Đối tượng</th><th>ID</th><th>IP</th><th>Thời gian</th></tr></thead>
				<tbody>{#if !auditLogs.length}<tr><td colspan="6" class="empty-row">Chưa có</td></tr>{/if}
				{#each auditLogs as log (log.id)}<tr><td><strong>{log.admin_name}</strong></td><td><span class="badge {actionClass(log.action)}">{actionLabel(log.action)}</span></td><td>{log.resource_type}</td><td>{log.resource_id ?? '—'}</td><td><code class="ip">{log.ip_address}</code></td><td class="cell-date">{formatDateTime(log.created_at)}</td></tr>{/each}</tbody></table>
			{/if}
		</div>
	{/if}
</div>
<style>
	.security-page { max-width: 1200px; }
	h1 { font-size: 1.75rem; font-weight: 800; margin: 0; }
	.subtitle { color: var(--color-text-muted); font-size: .875rem; margin: .25rem 0 2rem; }
	.loading { text-align: center; padding: 3rem; color: var(--color-text-muted); }
	.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 2rem; }
	.stat-card { background: var(--color-surface-100); border-radius: var(--radius-lg); padding: 1.25rem 1.5rem; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.04); text-align: center; }
	:global(html[data-theme='light']) .stat-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.stat-card::before { content:''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
	.c-red::before { background: linear-gradient(90deg, #ef4444, #f87171); }
	.c-yellow::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
	.c-green::before { background: linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300)); }
	.si { font-size: 1.75rem; display: block; margin-bottom: .5rem; }
	.sv { font-size: 2.25rem; font-weight: 800; display: block; line-height: 1; }
	.sl { font-size: .75rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; display: block; margin-top: .25rem; }
	.tab-bar { display: flex; gap: .5rem; margin-bottom: 1.5rem; border-bottom: 2px solid rgba(255,255,255,.06); }
	.tab-bar button { padding: .75rem 1.25rem; background: none; border: none; border-bottom: 2px solid transparent; font-weight: 600; color: var(--color-text-muted); cursor: pointer; display: flex; align-items: center; gap: .5rem; margin-bottom: -2px; }
	.tab-bar button.active { color: var(--color-brand-300); border-bottom-color: var(--color-brand-400); }
	.tc { background: rgba(255,255,255,.08); padding: .0625rem .5rem; border-radius: 1rem; font-size: .6875rem; }
	.section-card { background: var(--color-surface-100); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
	:global(html[data-theme='light']) .section-card { background: #fff; border-color: rgba(0,0,0,.04); }
	.crud-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.crud-table th { padding: .75rem 1rem; text-align: left; background: var(--color-surface-200); color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; }
	.crud-table td { padding: .75rem 1rem; border-top: 1px solid rgba(255,255,255,.04); }
	.empty-row { text-align: center; color: var(--color-text-muted); padding: 3rem !important; }
	.meta { color: var(--color-text-muted); font-size: .75rem; }
	.cell-trunc { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cell-date { font-size: .75rem; color: var(--color-text-muted); white-space: nowrap; }
	.ip { font-family: var(--font-mono); font-size: .75rem; background: rgba(255,255,255,.06); padding: .125rem .375rem; border-radius: .25rem; }
	.badge { display: inline-block; padding: .125rem .5rem; border-radius: 1rem; font-size: .6875rem; font-weight: 600; }
	.btn-unban { padding: .375rem .75rem; background: rgba(16,185,129,.15); color: #34d399; border: 1px solid rgba(16,185,129,.2); border-radius: var(--radius-md); font-weight: 600; font-size: .75rem; cursor: pointer; }
	@media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr; } }
</style>
