<!-- Root Layout — Persistent across all pages -->
<script lang="ts">
	import '../app.css';
	import AuthModal from '$lib/components/auth/AuthModal.svelte';
	import EmailVerifyBanner from '$lib/components/auth/EmailVerifyBanner.svelte';
	import Newsletter from '$lib/components/ui/Newsletter.svelte';
	import PrivateChat from '$lib/components/ui/PrivateChat.svelte';
	import SupportChatWidget from '$lib/components/ui/SupportChatWidget.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import { initAuth, getUser, isAuthenticated, logout, isLoading } from '$lib/stores/auth.svelte';
	import { initTheme, toggleTheme, isDark } from '$lib/stores/theme.svelte';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let { children } = $props();
	let showAuth = $state(false);
	let showUserMenu = $state(false);
	let showMobileMenu = $state(false);

	onMount(() => {
		initAuth();
		initTheme();
	});

	async function handleLogout() {
		await logout();
		showUserMenu = false;
	}
</script>

<svelte:head>
	<title>{m.seo_title()}</title>
	<meta name="description" content={m.seo_description()} />
	<meta property="og:title" content={m.seo_title()} />
	<meta property="og:description" content={m.seo_description()} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="vi_VN" />
	<meta property="og:site_name" content="Selorson" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.seo_title()} />
	<meta name="twitter:description" content={m.seo_description()} />
</svelte:head>

<div class="app-shell">
	<!-- Header -->
	<header class="site-header">
		<div class="header-inner">
			<a href="/" class="logo-link">
				<span class="logo-text">Selorson</span>
				<span class="logo-badge">V3</span>
			</a>

			<nav class="main-nav">
				<a href="/" class="nav-link">{m.nav_home()}</a>
				<a href="/stories" class="nav-link">{m.nav_stories()}</a>
				<a href="/videos" class="nav-link">{m.nav_videos()}</a>
				<a href="/music" class="nav-link">{m.nav_music()}</a>
				<a href="/library" class="nav-link">{m.nav_library()}</a>
				<a href="/about" class="nav-link">{m.nav_about()}</a>
			</nav>

			<div class="header-actions">
				<a href="/search" class="search-btn" title="Tìm kiếm" aria-label="Search">🔍</a>
				{#if isAuthenticated() && (getUser()?.role === 'admin' || getUser()?.role === 'manager')}
					<a href="/support-workspace" class="search-btn" title="CSKH Workspace" aria-label="Support">🎧</a>
				{/if}
				<button class="theme-toggle" onclick={toggleTheme} title={isDark() ? 'Chế độ sáng' : 'Chế độ tối'} aria-label="Toggle theme">
					{isDark() ? '☀️' : '🌙'}
				</button>
				{#if !isAuthenticated()}
					<LanguageSwitcher />
				{/if}
				{#if isLoading()}
					<div class="auth-skeleton"></div>
				{:else if isAuthenticated()}
					<div class="user-area">
						<button
							class="user-btn"
							onclick={() => showUserMenu = !showUserMenu}
							id="user-menu-btn"
						>
							{#if getUser()?.avatar}
								<img src={getUser()?.avatar} alt="Avatar" class="user-avatar" />
							{:else}
								<div class="user-avatar-placeholder">
									{getUser()?.name?.charAt(0).toUpperCase()}
								</div>
							{/if}
							<span class="user-name">{getUser()?.name}</span>
						</button>

						{#if showUserMenu}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="click-away" onmousedown={() => showUserMenu = false}></div>
							<div class="user-dropdown">
								<div class="dropdown-header">
									<strong>{getUser()?.name}</strong>
									<span class="dropdown-role">{getUser()?.role}</span>
								</div>
								<hr class="dropdown-divider" />
								<a href="/profile/{getUser()?.id}" class="dropdown-item" onclick={() => showUserMenu = false}>👤 {m.nav_profile()}</a>
								<a href="/settings" class="dropdown-item" onclick={() => showUserMenu = false}>⚙️ {m.nav_settings()}</a>
								{#if getUser()?.role === 'admin'}
									<a href="/admin" class="dropdown-item admin-item" onclick={() => showUserMenu = false}>🛡️ Admin Panel</a>
								{/if}
								<hr class="dropdown-divider" />
								<button class="dropdown-item logout-item" onclick={handleLogout}>
									🚪 {m.nav_logout()}
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<button class="btn-ghost" id="login-btn" onclick={() => showAuth = true}>
						{m.nav_login()}
					</button>
				{/if}
				<button class="mobile-toggle" onclick={() => showMobileMenu = !showMobileMenu} aria-label="Menu">
					<span class="hamburger" class:open={showMobileMenu}></span>
				</button>
			</div>
		</div>
	</header>

	<!-- Mobile Nav Overlay -->
	{#if showMobileMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="mobile-overlay" onmousedown={() => showMobileMenu = false}></div>
		<nav class="mobile-nav">
			<a href="/" onclick={() => showMobileMenu = false}>{m.nav_home()}</a>
			<a href="/stories" onclick={() => showMobileMenu = false}>{m.nav_stories()}</a>
			<a href="/videos" onclick={() => showMobileMenu = false}>{m.nav_videos()}</a>
			<a href="/music" onclick={() => showMobileMenu = false}>{m.nav_music()}</a>
			<a href="/library" onclick={() => showMobileMenu = false}>{m.nav_library()}</a>
			<a href="/about" onclick={() => showMobileMenu = false}>{m.nav_about()}</a>
			{#if isAuthenticated()}
				<hr class="mobile-divider" />
				<a href="/profile/{getUser()?.id}" onclick={() => showMobileMenu = false}>👤 {m.nav_profile()}</a>
				<a href="/messages" onclick={() => showMobileMenu = false}>💬 {m.nav_messages()}</a>
				{#if getUser()?.role === 'admin'}
					<a href="/admin" class="mobile-admin-link" onclick={() => showMobileMenu = false}>🛡️ Admin Panel</a>
				{/if}
			{/if}
		</nav>
	{/if}

	<!-- Email Verify Banner -->
	<EmailVerifyBanner />

	<!-- Main Content -->
	<main class="main-content">
		{@render children()}
	</main>

	<!-- Global Components -->
	<PrivateChat />
	<SupportChatWidget />
	<Toast />

	<!-- Footer -->
	<footer class="site-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<span class="logo-text" style="font-size: 1.25rem;">Selorson</span>
				<p class="footer-tagline">{m.footer_tagline()}</p>
			</div>

			<div class="footer-links">
				<div class="footer-col">
					<h4>{m.footer_content()}</h4>
					<a href="/stories">{m.nav_stories()}</a>
					<a href="/videos">{m.nav_videos()}</a>
					<a href="/music">{m.nav_music()}</a>
				</div>
				<div class="footer-col">
					<h4>{m.footer_community()}</h4>
					<a href="/about">{m.nav_about()}</a>
					<a href="/contact">{m.footer_contact()}</a>
					<a href="/faq">FAQ</a>
				</div>
				<div class="footer-col">
					<h4>{m.footer_legal()}</h4>
					<a href="/privacy">{m.footer_privacy()}</a>
					<a href="/terms">{m.footer_terms()}</a>
				</div>
			</div>

			<!-- Newsletter in footer -->
			<div class="footer-newsletter">
				<Newsletter />
			</div>

			<div class="footer-bottom">
				<p>&copy; 2026 Selorson. All rights reserved.</p>
			</div>
		</div>
	</footer>
</div>

<!-- Auth Modal -->
<AuthModal bind:open={showAuth} />


<style>
	.app-shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* ---- Header ---- */
	.site-header {
		position: sticky;
		top: 0;
		z-index: 100;
		background: rgba(10, 10, 15, 0.85);
		backdrop-filter: blur(20px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.header-inner {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 1.5rem;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.logo-text {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #0c713d, #06b6d4);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		letter-spacing: -0.02em;
	}

	.logo-badge {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0.15rem 0.4rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan));
		color: white;
		border-radius: 4px;
		letter-spacing: 0.05em;
	}

	.main-nav {
		display: flex;
		gap: 0.25rem;
	}

	.nav-link {
		padding: 0.5rem 0.875rem;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: var(--radius-md);
		transition: all 0.2s ease;
	}

	.nav-link:hover {
		color: var(--color-text-primary);
		background: rgba(255, 255, 255, 0.05);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* ---- Auth Skeleton ---- */
	.auth-skeleton {
		width: 100px;
		height: 36px;
		background: linear-gradient(90deg, var(--color-surface-200) 25%, var(--color-surface-300) 50%, var(--color-surface-200) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: var(--radius-md);
	}

	/* ---- User Area ---- */
	.user-area {
		position: relative;
	}

	.user-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem 0.35rem 0.35rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		cursor: pointer;
		transition: all 0.2s;
		color: var(--color-text-primary);
	}

	.user-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(12, 113, 61, 0.3);
	}

	.user-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-avatar-placeholder {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: white;
	}

	.user-name {
		font-size: 0.85rem;
		font-weight: 500;
	}

	/* ---- Dropdown ---- */
	.user-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 220px;
		background: rgba(26, 26, 37, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
		padding: 0.5rem;
		z-index: 200;
		animation: slideDown 0.15s ease;
	}

	.dropdown-header {
		padding: 0.5rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.dropdown-header strong {
		font-size: 0.9rem;
	}

	.dropdown-role {
		font-size: 0.7rem;
		color: var(--color-brand-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.dropdown-divider {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		margin: 0.25rem 0;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		background: none;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		text-decoration: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.dropdown-item:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text-primary);
	}

	.logout-item:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
	}

	.admin-item {
		color: var(--color-brand-300) !important;
		font-weight: 600;
	}
	.admin-item:hover {
		background: rgba(12, 113, 61, 0.15) !important;
		color: var(--color-brand-200) !important;
	}

	.mobile-admin-link {
		color: var(--color-brand-300) !important;
		font-weight: 600 !important;
	}

	.click-away {
		position: fixed;
		inset: 0;
		z-index: 150;
	}

	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* ---- Main ---- */
	.main-content {
		flex: 1;
	}

	/* ---- Footer ---- */
	.site-footer {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: var(--color-surface-50);
		padding: 3rem 0 1.5rem;
		margin-top: auto;
	}

	.footer-inner {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.footer-tagline {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-top: 0.25rem;
	}

	.footer-links {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
		margin: 2rem 0;
	}

	.footer-col h4 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
		margin-bottom: 0.75rem;
	}

	.footer-col a {
		display: block;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.85rem;
		padding: 0.25rem 0;
		transition: color 0.2s ease;
	}

	.footer-col a:hover {
		color: var(--color-brand-300);
	}

	.footer-bottom {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		padding-top: 1.5rem;
		text-align: center;
	}

	.footer-bottom p {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.footer-newsletter {
		margin: 1.5rem 0;
		max-width: 480px;
		margin-inline: auto;
	}

	/* ---- Search + Theme Toggle ---- */
	.search-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		text-decoration: none;
		font-size: 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: all 0.25s ease;
		flex-shrink: 0;
	}
	.search-btn:hover {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.1);
	}
	/* ---- Theme Toggle ---- */
	.theme-toggle {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 50%;
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.25s ease;
		flex-shrink: 0;
	}
	.theme-toggle:hover {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.1);
		transform: rotate(15deg);
	}

	/* ---- Responsive ---- */
	/* Mobile Toggle */
	.mobile-toggle {
		display: none;
		background: none;
		border: none;
		cursor: pointer;
		width: 28px;
		height: 28px;
		position: relative;
	}
	.hamburger, .hamburger::before, .hamburger::after {
		display: block;
		width: 20px;
		height: 2px;
		background: var(--color-text-primary);
		border-radius: 2px;
		transition: all 0.25s ease;
		position: absolute;
		left: 4px;
	}
	.hamburger { top: 13px; }
	.hamburger::before { content: ''; top: -6px; }
	.hamburger::after { content: ''; top: 6px; }
	.hamburger.open { background: transparent; }
	.hamburger.open::before { transform: rotate(45deg); top: 0; }
	.hamburger.open::after { transform: rotate(-45deg); top: 0; }

	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,.5);
		z-index: 190;
	}
	.mobile-nav {
		position: fixed;
		top: 64px;
		right: 0;
		width: 260px;
		max-height: calc(100vh - 64px);
		background: rgba(18, 18, 26, 0.98);
		border-left: 1px solid rgba(255,255,255,.06);
		padding: 1rem 0;
		z-index: 200;
		overflow-y: auto;
		animation: slideRight 0.2s ease;
	}
	.mobile-nav a {
		display: block;
		padding: 0.65rem 1.25rem;
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.15s;
	}
	.mobile-nav a:hover {
		background: rgba(255,255,255,.04);
		color: var(--color-text-primary);
	}
	.mobile-divider {
		border: none;
		border-top: 1px solid rgba(255,255,255,.06);
		margin: 0.5rem 0;
	}

	@keyframes slideRight {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	@media (max-width: 768px) {
		.main-nav {
			display: none;
		}
		.mobile-toggle {
			display: block;
		}
		.footer-links {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
		.user-name {
			display: none;
		}
	}
</style>
