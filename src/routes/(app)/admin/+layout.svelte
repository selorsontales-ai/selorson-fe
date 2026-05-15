<!-- Admin Layout — Sidebar + Content area with auth guard -->
<script lang="ts">
	import { isAdmin, isLoading, getUser } from '$lib/stores/auth.svelte';
	import { isDark } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let sidebarCollapsed = $state(false);
	let ready = $state(false);

	onMount(() => {
		// Wait for auth to load, then check admin role
		const check = setInterval(() => {
			if (!isLoading()) {
				clearInterval(check);
				if (!isAdmin()) {
					goto('/');
				} else {
					ready = true;
				}
			}
		}, 50);
		return () => clearInterval(check);
	});

	interface NavItem {
		href: string;
		icon: string;
		label: string;
	}

	interface NavGroup {
		title: string;
		items: NavItem[];
	}

	const navGroups: NavGroup[] = [
		{
			title: 'Trang Chủ',
			items: [
				{ href: '/admin/hero-slides', icon: '🎠', label: 'Hero Slides' },
				{ href: '/admin/projects', icon: '🚀', label: 'Dự Án Tương Lai' },
				{ href: '/admin/votes', icon: '🗳️', label: 'Bình Chọn' },
				{ href: '/admin/notifications', icon: '📢', label: 'Thông Báo' },
			],
		},
		{
			title: 'Liên Lạc',
			items: [
				{ href: '/admin/contacts', icon: '✉️', label: 'Contacts' },
				{ href: '/admin/newsletter', icon: '📰', label: 'Bản Tin' },
			],
		},
		{
			title: 'Giới Thiệu',
			items: [
				{ href: '/admin/milestones', icon: '📅', label: 'Cột Mốc' },
			],
		},
		{
			title: 'Nội Dung',
			items: [
				{ href: '/admin/chapters', icon: '📖', label: 'Chapters' },
				{ href: '/admin/videos', icon: '🎬', label: 'Videos' },
				{ href: '/admin/music', icon: '🎵', label: 'Âm Nhạc' },
			],
		},
		{
			title: 'Thư Viện',
			items: [
				{ href: '/admin/library', icon: '📚', label: 'Library' },
			],
		},
		{
			title: 'Hệ Thống',
			items: [
				{ href: '/admin/users', icon: '👥', label: 'Users' },
				{ href: '/admin/security', icon: '🛡️', label: 'Bảo Mật' },
				{ href: '/admin/reports', icon: '⚠️', label: 'Báo Cáo' },
				{ href: '/admin/support', icon: '📊', label: 'Giám Sát CSKH' },
			],
		},
	];
</script>

<svelte:head>
	<title>Admin — Selorson V3</title>
</svelte:head>

{#if !ready}
	<div class="admin-loading">
		<div class="admin-loading-spinner"></div>
		<p>Đang xác thực quyền truy cập...</p>
	</div>
{:else}
	<div class="admin-layout">
		<!-- Sidebar -->
		<aside class="admin-sidebar" class:collapsed={sidebarCollapsed}>
			<div class="sidebar-header">
				{#if !sidebarCollapsed}
					<h3>🛡️ Admin</h3>
				{/if}
				<button class="toggle-btn" onclick={() => sidebarCollapsed = !sidebarCollapsed}>
					{sidebarCollapsed ? '☰' : '✕'}
				</button>
			</div>

			<nav class="sidebar-nav">
				<a href="/admin" class="nav-item">
					<span class="nav-icon">📊</span>
					{#if !sidebarCollapsed}
						<span class="nav-text">Dashboard</span>
					{/if}
				</a>

				{#each navGroups as group}
					{#if !sidebarCollapsed}
						<div class="nav-group-label">{group.title}</div>
					{/if}
					{#each group.items as item}
						<a href={item.href} class="nav-item">
							<span class="nav-icon">{item.icon}</span>
							{#if !sidebarCollapsed}
								<span class="nav-text">{item.label}</span>
							{/if}
						</a>
					{/each}
				{/each}
			</nav>

			<div class="sidebar-footer">
				<a href="/" class="nav-item">
					<span class="nav-icon">🏠</span>
					{#if !sidebarCollapsed}
						<span class="nav-text">Về trang chủ</span>
					{/if}
				</a>
			</div>
		</aside>

		<!-- Main Content -->
		<main class="admin-main">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	/* Loading */
	.admin-loading {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: var(--color-surface-0);
	}

	.admin-loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-surface-300);
		border-top-color: var(--color-brand-500);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.admin-loading p {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Layout */
	.admin-layout {
		display: flex;
		min-height: 100vh;
		background: var(--color-surface-0);
	}

	/* Sidebar */
	.admin-sidebar {
		width: 260px;
		flex-shrink: 0;
		background: linear-gradient(180deg, #0c713d 0%, #064e2b 100%);
		display: flex;
		flex-direction: column;
		transition: width 0.3s var(--ease-spring);
		overflow-y: auto;
		position: sticky;
		top: 0;
		height: 100vh;
	}

	.admin-sidebar.collapsed {
		width: 64px;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.sidebar-header h3 {
		margin: 0;
		color: #fff;
		font-size: 1.125rem;
		font-weight: 700;
	}

	.toggle-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: var(--radius-md);
		color: #fff;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.toggle-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.sidebar-nav {
		flex: 1;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.nav-group-label {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 1.5px;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
		padding: 0.875rem 0.75rem 0.25rem;
		margin-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-md);
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.nav-item:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.nav-icon {
		font-size: 1.125rem;
		min-width: 24px;
		text-align: center;
	}

	.sidebar-footer {
		padding: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Main */
	.admin-main {
		flex: 1;
		padding: 2rem;
		overflow-y: auto;
		min-height: 100vh;
	}

	@media (max-width: 768px) {
		.admin-sidebar {
			width: 64px;
		}
		.nav-text,
		.nav-group-label {
			display: none;
		}
	}
</style>
