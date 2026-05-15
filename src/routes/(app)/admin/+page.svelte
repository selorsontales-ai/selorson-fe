<!-- Admin Dashboard — Stats overview -->
<script lang="ts">
	import { adminGet } from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface DashboardStats {
		users: { total: number; online: number; new_today: number };
		content: { chapters: number; videos: number; albums: number };
		cms: { hero_slides: number; future_projects: number };
		support: { contacts_pending: number; contacts_total: number; messages_today: number };
		newsletter: { active: number; total: number };
	}

	let loading = $state(true);
	let stats = $state<DashboardStats | null>(null);

	onMount(async () => {
		try {
			const res = await adminGet<DashboardStats>('/admin/dashboard');
			if (res.success) stats = res.data;
		} catch { /* empty */ }
		finally { loading = false; }
	});
</script>

<svelte:head><title>Admin Dashboard — Selorson</title></svelte:head>

<div class="admin-dashboard">
	<h1 class="page-title">📊 Admin Dashboard</h1>
	<p class="page-subtitle">Tổng quan hệ thống Selorson V3</p>

	{#if loading}
		<div class="loading">Đang tải thống kê...</div>
	{:else}
		<!-- Stats Cards -->
		<div class="stats-grid">
			<div class="stat-card stat-users">
				<div class="stat-header">
					<span class="stat-icon">👥</span>
					<span class="stat-trend">📥 +{stats?.users?.new_today ?? 0} hôm nay</span>
				</div>
				<span class="stat-value">{stats?.users?.total ?? 0}</span>
				<span class="stat-label">Tổng Users</span>
				<div class="stat-footer">
					<span class="online-dot"></span> {stats?.users?.online ?? 0} đang online
				</div>
			</div>

			<div class="stat-card stat-content">
				<div class="stat-header"><span class="stat-icon">📖</span></div>
				<span class="stat-value">{stats?.content?.chapters ?? 0}</span>
				<span class="stat-label">Chapters</span>
			</div>

			<div class="stat-card stat-media">
				<div class="stat-header"><span class="stat-icon">🎬</span></div>
				<span class="stat-value">{stats?.content?.videos ?? 0}</span>
				<span class="stat-label">Videos</span>
			</div>

			<div class="stat-card stat-music">
				<div class="stat-header"><span class="stat-icon">🎵</span></div>
				<span class="stat-value">{stats?.content?.albums ?? 0}</span>
				<span class="stat-label">Albums</span>
			</div>

			<div class="stat-card stat-slides">
				<div class="stat-header"><span class="stat-icon">🎠</span></div>
				<span class="stat-value">{stats?.cms?.hero_slides ?? 0}</span>
				<span class="stat-label">Hero Slides</span>
			</div>

			<div class="stat-card stat-support">
				<div class="stat-header">
					<span class="stat-icon">✉️</span>
					{#if (stats?.support?.contacts_pending ?? 0) > 0}
						<span class="stat-badge">{stats?.support?.contacts_pending}</span>
					{/if}
				</div>
				<span class="stat-value">{stats?.support?.contacts_total ?? 0}</span>
				<span class="stat-label">Contacts</span>
				{#if (stats?.support?.contacts_pending ?? 0) > 0}
					<div class="stat-footer warning">⚠️ {stats?.support?.contacts_pending} chờ xử lý</div>
				{/if}
			</div>

			<div class="stat-card stat-newsletter">
				<div class="stat-header"><span class="stat-icon">📰</span></div>
				<span class="stat-value">{stats?.newsletter?.active ?? 0}</span>
				<span class="stat-label">Subscribers</span>
				<div class="stat-footer">📊 {stats?.newsletter?.total ?? 0} tổng cộng</div>
			</div>
		</div>

		<!-- System Info -->
		<div class="info-row">
			<div class="info-card">
				<h3>🖥️ Hệ Thống</h3>
				<ul>
					<li><strong>Backend:</strong> Rust (Axum)</li>
					<li><strong>Frontend:</strong> SvelteKit 5</li>
					<li><strong>Database:</strong> PostgreSQL</li>
					<li><strong>Auth:</strong> JWT + Token Rotation</li>
				</ul>
			</div>
			<div class="info-card">
				<h3>📋 Ghi Chú</h3>
				<p>Sử dụng sidebar bên trái để truy cập các module quản lý. Các mục được sắp xếp theo thứ tự trang trên frontend.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-dashboard { max-width: 1200px; }
	.page-title { font-size: 1.75rem; font-weight: 800; color: var(--color-text-primary); margin: 0; }
	.page-subtitle { color: var(--color-text-muted); font-size: 0.875rem; margin: 0.25rem 0 2rem; }
	.loading { text-align: center; padding: 3rem; color: var(--color-text-muted); }

	.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; }

	.stat-card {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		padding: 1.25rem 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		transition: all 0.3s ease;
		position: relative;
		overflow: hidden;
	}
	:global(html[data-theme='light']) .stat-card { background: #fff; border-color: rgba(0,0,0,0.04); }
	.stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-glow); }

	.stat-card::before {
		content: '';
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300));
	}
	.stat-support::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

	.stat-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
	.stat-icon { font-size: 1.75rem; }
	.stat-trend { font-size: 0.6875rem; color: #34d399; font-weight: 600; }
	.stat-badge {
		background: #ef4444; color: #fff; font-size: 0.625rem; font-weight: 700;
		padding: 0.125rem 0.5rem; border-radius: 1rem; min-width: 20px; text-align: center;
	}
	.stat-value { font-size: 2.25rem; font-weight: 800; color: var(--color-brand-300); display: block; line-height: 1; }
	:global(html[data-theme='light']) .stat-value { color: var(--color-brand-500); }
	.stat-label {
		font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600;
		text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-top: 0.25rem;
	}
	.stat-footer { font-size: 0.6875rem; color: #34d399; margin-top: 0.75rem; display: flex; align-items: center; gap: 0.375rem; }
	.stat-footer.warning { color: #fbbf24; }
	.online-dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; }

	.info-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
	.info-card {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	:global(html[data-theme='light']) .info-card { background: #fff; border-color: rgba(0,0,0,0.04); }
	.info-card h3 { font-size: 1rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.75rem; }
	.info-card ul { list-style: none; padding: 0; margin: 0; }
	.info-card li {
		font-size: 0.8125rem; color: var(--color-text-secondary);
		padding: 0.375rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);
	}
	:global(html[data-theme='light']) .info-card li { border-bottom-color: rgba(0,0,0,0.04); }
	.info-card li:last-child { border-bottom: none; }
	.info-card p { font-size: 0.8125rem; color: var(--color-text-secondary); line-height: 1.7; margin: 0; }

	@media (max-width: 768px) {
		.info-row { grid-template-columns: 1fr; }
	}
</style>
