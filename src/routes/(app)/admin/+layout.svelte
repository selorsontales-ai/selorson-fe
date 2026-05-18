<!-- Admin Layout — Sidebar + Content area with auth guard -->
<script lang="ts">
	import { isAdmin, isLoading, getUser } from "$lib/stores/auth.svelte";
	import { isDark } from "$lib/stores/theme.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";

	let { children } = $props();
	let sidebarCollapsed = $state(false);
	let mobileOpen = $state(false);
	let ready = $state(false);

	onMount(() => {
		// Wait for auth to load, then check admin role
		const check = setInterval(() => {
			if (!isLoading()) {
				clearInterval(check);
				if (!isAdmin()) {
					goto("/");
				} else {
					ready = true;
				}
			}
		}, 50);
		return () => clearInterval(check);
	});

	// Close mobile drawer on route change
	$effect(() => {
		$page.url.pathname;
		mobileOpen = false;
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
			title: "Trang Chủ",
			items: [
				{
					href: "/admin/hero-slides",
					icon: "🎠",
					label: "Hero Slides",
				},
				{
					href: "/admin/projects",
					icon: "🚀",
					label: "Dự Án Tương Lai",
				},
				{ href: "/admin/votes", icon: "🗳️", label: "Bình Chọn" },
				{
					href: "/admin/notifications",
					icon: "📢",
					label: "Thông Báo",
				},
			],
		},
		{
			title: "Liên Lạc",
			items: [
				{ href: "/admin/contacts", icon: "✉️", label: "Contacts" },
				{ href: "/admin/newsletter", icon: "📰", label: "Bản Tin" },
			],
		},
		{
			title: "Giới Thiệu",
			items: [
				{ href: "/admin/milestones", icon: "📅", label: "Cột Mốc" },
			],
		},
		{
			title: "Nội Dung",
			items: [
				{ href: "/admin/chapters", icon: "📖", label: "Chapters" },
				{ href: "/admin/videos", icon: "🎬", label: "Videos" },
				{ href: "/admin/music", icon: "🎵", label: "Âm Nhạc" },
			],
		},
		{
			title: "Thư Viện",
			items: [{ href: "/admin/library", icon: "📚", label: "Library" }],
		},
		{
			title: "Hệ Thống",
			items: [
				{ href: "/admin/users", icon: "👥", label: "Users" },
				{ href: "/admin/security", icon: "🛡️", label: "Bảo Mật" },
				{ href: "/admin/reports", icon: "⚠️", label: "Báo Cáo" },
				{ href: "/admin/support", icon: "📊", label: "Giám Sát CSKH" },
			],
		},
	];
</script>

<svelte:head>
	<title>Admin — Selorson</title>
</svelte:head>

{#if !ready}
	<div class="admin-loading">
		<div class="admin-loading-spinner"></div>
		<p>Đang xác thực quyền truy cập...</p>
	</div>
{:else}
	<div class="admin-layout">
		<!-- Mobile Header -->
		<div class="admin-mobile-header">
			<button class="mobile-menu-btn" onclick={() => (mobileOpen = true)}>
				☰
			</button>
			<h3>🛡️ Admin</h3>
		</div>

		<!-- Overlay -->
		{#if mobileOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="admin-mobile-overlay" onclick={() => (mobileOpen = false)}></div>
		{/if}

		<!-- Sidebar -->
		<aside class="admin-sidebar" class:collapsed={sidebarCollapsed} class:mobile-open={mobileOpen}>
			<div class="sidebar-header">
				{#if !sidebarCollapsed || mobileOpen}
					<h3>🛡️ Admin</h3>
				{/if}
				<button
					class="toggle-btn"
					onclick={() => {
						if (window.innerWidth <= 768) {
							mobileOpen = false;
						} else {
							sidebarCollapsed = !sidebarCollapsed;
						}
					}}
				>
					{sidebarCollapsed && window.innerWidth > 768 ? "☰" : "✕"}
				</button>
			</div>

			<nav class="sidebar-nav">
				<a href="/admin" class="nav-item" class:active={$page.url.pathname === '/admin'}>
					<span class="nav-icon">📊</span>
					{#if !sidebarCollapsed || mobileOpen}
						<span class="nav-text">Dashboard</span>
					{/if}
				</a>

				{#each navGroups as group}
					{#if !sidebarCollapsed || mobileOpen}
						<div class="nav-group-label">{group.title}</div>
					{/if}
					{#each group.items as item}
						<a href={item.href} class="nav-item" class:active={$page.url.pathname.startsWith(item.href)}>
							<span class="nav-icon">{item.icon}</span>
							{#if !sidebarCollapsed || mobileOpen}
								<span class="nav-text">{item.label}</span>
							{/if}
						</a>
					{/each}
				{/each}
			</nav>

			<div class="sidebar-footer">
				<a href="/" class="nav-item">
					<span class="nav-icon">🏠</span>
					{#if !sidebarCollapsed || mobileOpen}
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
		to {
			transform: rotate(360deg);
		}
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
		background: var(--color-surface-100);
		border-right: 1px solid rgba(255, 255, 255, 0.05);
		display: flex;
		flex-direction: column;
		transition: width 0.3s var(--ease-spring), background 0.3s ease;
		overflow-y: auto;
		position: sticky;
		top: 0;
		height: 100vh;
	}
	
	:global(html[data-theme='light']) .admin-sidebar {
		background: linear-gradient(180deg, #0c713d 0%, #064e2b 100%);
		border-right: none;
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

	.nav-item.active {
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-brand-400);
		font-weight: 700;
		box-shadow: inset 4px 0 0 var(--color-brand-400);
	}
	
	:global(html[data-theme='light']) .nav-item.active {
		background: rgba(255, 255, 255, 0.2);
		color: #ffd700;
		box-shadow: inset 4px 0 0 #ffd700;
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

	/* Mobile Layout Elements */
	.admin-mobile-header {
		display: none;
		align-items: center;
		padding: 1rem;
		background: var(--color-surface-100);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	
	:global(html[data-theme='light']) .admin-mobile-header {
		background: linear-gradient(90deg, #0c713d 0%, #064e2b 100%);
		color: #fff;
	}

	.admin-mobile-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
	}

	.mobile-menu-btn {
		background: transparent;
		border: none;
		color: inherit;
		font-size: 1.5rem;
		cursor: pointer;
		margin-right: 1rem;
		padding: 0;
	}

	.admin-mobile-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 40;
		backdrop-filter: blur(2px);
	}

	@media (max-width: 768px) {
		.admin-layout {
			flex-direction: column;
		}
		.admin-mobile-header {
			display: flex;
		}
		.admin-sidebar {
			position: fixed;
			top: 0;
			left: -260px;
			height: 100vh;
			width: 260px !important;
			z-index: 50;
			transition: left 0.3s ease;
			box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
		}
		.admin-sidebar.mobile-open {
			left: 0;
		}
		.admin-main {
			padding: 1rem;
		}

		/* Global Mobile Table Card Styles */
		:global(.crud-table thead) {
			display: none;
		}
		:global(.crud-table), :global(.crud-table tbody) {
			display: block;
			width: 100%;
		}
		:global(.crud-table tr) {
			display: flex;
			flex-direction: column;
			margin-bottom: 1rem;
			border: 1px solid rgba(255, 255, 255, 0.1) !important;
			border-radius: var(--radius-md) !important;
			background: var(--color-surface-200) !important;
			padding: 0.5rem;
		}
		:global(html[data-theme='light'] .crud-table tr) {
			border-color: rgba(0, 0, 0, 0.1) !important;
			background: #f9fafb !important;
		}
		:global(.crud-table td) {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.5rem !important;
			border: none !important;
			border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
		}
		:global(html[data-theme='light'] .crud-table td) {
			border-bottom-color: rgba(0, 0, 0, 0.05) !important;
		}
		:global(.crud-table td:last-child) {
			border-bottom: none !important;
		}
		:global(.crud-table td::before) {
			content: attr(data-label);
			font-weight: 600;
			color: var(--color-text-muted);
			font-size: 0.75rem;
			text-transform: uppercase;
			margin-right: 1rem;
		}
		:global(.crud-table .td-actions) {
			justify-content: flex-end !important;
		}
	}
</style>
