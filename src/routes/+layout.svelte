<!-- Root Layout — Persistent across all pages -->
<script lang="ts">
	import "../app.css";
	import AuthModal from "$lib/components/auth/AuthModal.svelte";
	import EmailVerifyBanner from "$lib/components/auth/EmailVerifyBanner.svelte";
	import Newsletter from "$lib/components/ui/Newsletter.svelte";
	import PrivateChat from "$lib/components/ui/PrivateChat.svelte";
	import SupportChatWidget from "$lib/components/ui/SupportChatWidget.svelte";
	import Toast from "$lib/components/ui/Toast.svelte";
	import LanguageSwitcher from "$lib/components/ui/LanguageSwitcher.svelte";
	import {
		initAuth,
		getUser,
		isAuthenticated,
		logout,
		isLoading,
	} from "$lib/stores/auth.svelte";
	import { initTheme, toggleTheme, isDark } from "$lib/stores/theme.svelte";
	import { initSupportUI } from "$lib/stores/support.svelte";
	import { supportsAdminPanel, supportsDataModes } from "$lib/app-flavor";
	import { initDataMode } from "$lib/desktop-mode.svelte";

	// Dynamic so the mode UI stays out of the entry chunk every reader loads.
	// It cannot be removed from a user build altogether — the mechanism that
	// does that is route removal, and this is the shared root layout — but the
	// components hold no admin logic, only a mode indicator and a restart.
	const dataModeUi = supportsDataModes
		? import("$lib/components/desktop/DesktopDataMode.svelte")
		: null;
	import * as m from "$lib/paraglide/messages";
	import { onMount } from "svelte";
	import { page } from "$app/stores";

	let { children } = $props();
	let showAuth = $state(false);
	let showUserMenu = $state(false);
	let showMobileMenu = $state(false);

	onMount(() => {
		initTheme();
		// The mode has to be settled before the session is read: each mode keeps
		// its own login, so the key depends on which one is in force.
		void initDataMode().then(() => {
			initAuth();
			initSupportUI();
		});
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
	{#if dataModeUi}
		{#await dataModeUi then module}
			<module.default />
		{/await}
	{/if}
	<!-- Header -->
	<header class="site-header">
		<div class="header-inner">
			<a href="/" class="logo-link">
				<img src="/favicon.png" alt="Selorson" class="logo-image" />
				<div class="logo-text-group">
					<span class="logo-text">Selorson</span>
				</div>
			</a>

			<nav class="main-nav">
				<a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>{m.nav_home()}</a>
				<a href="/stories" class="nav-link" class:active={$page.url.pathname.startsWith('/stories')}>{m.nav_stories()}</a>
				<a href="/videos" class="nav-link" class:active={$page.url.pathname.startsWith('/videos')}>{m.nav_videos()}</a>
				<a href="/music" class="nav-link" class:active={$page.url.pathname.startsWith('/music')}>{m.nav_music()}</a>
				<a href="/library" class="nav-link" class:active={$page.url.pathname.startsWith('/library')}>{m.nav_library()}</a>
				<a href="/about" class="nav-link" class:active={$page.url.pathname.startsWith('/about')}>{m.nav_about()}</a>
			</nav>

			<div class="header-actions">
				<a
					href="/search"
					class="search-btn"
					title="Tìm kiếm"
					aria-label="Search">🔍</a
				>
				{#if isAuthenticated() && (getUser()?.role === "admin" || getUser()?.role === "manager")}
					<a
						href="/support-workspace"
						class="search-btn"
						title="CSKH Workspace"
						aria-label="Support">🎧</a
					>
				{/if}
				<button
					class="theme-toggle"
					onclick={toggleTheme}
					title={isDark() ? "Chế độ sáng" : "Chế độ tối"}
					aria-label="Toggle theme"
				>
					{isDark() ? "☀️" : "🌙"}
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
							onclick={() => (showUserMenu = !showUserMenu)}
							id="user-menu-btn"
						>
							{#if getUser()?.avatar}
								<img
									src={getUser()?.avatar}
									alt="Avatar"
									class="user-avatar"
								/>
							{:else}
								<div class="user-avatar-placeholder">
									{getUser()?.name?.charAt(0).toUpperCase()}
								</div>
							{/if}
							<span class="user-name">{getUser()?.name}</span>
						</button>

						{#if showUserMenu}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="click-away"
								onmousedown={() => (showUserMenu = false)}
							></div>
							<div class="user-dropdown">
								<div class="dropdown-header">
									<strong>{getUser()?.name}</strong>
									<span class="dropdown-role"
										>{getUser()?.role}</span
									>
								</div>
								<hr class="dropdown-divider" />
								<a
									href="/profile/{getUser()?.id}"
									class="dropdown-item"
									onclick={() => (showUserMenu = false)}
									>👤 {m.nav_profile()}</a
								>
								<a
									href="/settings"
									class="dropdown-item"
									onclick={() => (showUserMenu = false)}
									>⚙️ {m.nav_settings()}</a
								>
								{#if supportsAdminPanel && getUser()?.role === "admin"}
									<a
										href="/admin"
										class="dropdown-item admin-item"
										onclick={() => (showUserMenu = false)}
										>🛡️ Admin Panel</a
									>
								{/if}
								<hr class="dropdown-divider" />
								<button
									class="dropdown-item logout-item"
									onclick={handleLogout}
								>
									🚪 {m.nav_logout()}
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<button
						class="btn-ghost login-btn"
						id="login-btn"
						onclick={() => (showAuth = true)}
						title={m.nav_login()}
					>
						<span class="login-text">{m.nav_login()}</span>
						<span class="login-icon">👤</span>
					</button>
				{/if}
				<button
					class="mobile-toggle"
					onclick={() => (showMobileMenu = !showMobileMenu)}
					aria-label="Menu"
				>
					<span class="hamburger" class:open={showMobileMenu}></span>
				</button>
			</div>
		</div>
	</header>

	<!-- Mobile Nav Overlay -->
	{#if showMobileMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mobile-overlay"
			onmousedown={() => (showMobileMenu = false)}
		></div>
		<nav class="mobile-nav">
			<a href="/" class:active={$page.url.pathname === '/'} onclick={() => (showMobileMenu = false)}>{m.nav_home()}</a>
			<a href="/stories" class:active={$page.url.pathname.startsWith('/stories')} onclick={() => (showMobileMenu = false)}>{m.nav_stories()}</a>
			<a href="/videos" class:active={$page.url.pathname.startsWith('/videos')} onclick={() => (showMobileMenu = false)}>{m.nav_videos()}</a>
			<a href="/music" class:active={$page.url.pathname.startsWith('/music')} onclick={() => (showMobileMenu = false)}>{m.nav_music()}</a>
			<a href="/library" class:active={$page.url.pathname.startsWith('/library')} onclick={() => (showMobileMenu = false)}>{m.nav_library()}</a>
			<a href="/about" class:active={$page.url.pathname.startsWith('/about')} onclick={() => (showMobileMenu = false)}>{m.nav_about()}</a>
			{#if isAuthenticated()}
				<hr class="mobile-divider" />
				<a
					href="/profile/{getUser()?.id}"
					class:active={$page.url.pathname.startsWith('/profile')}
					onclick={() => (showMobileMenu = false)}
					>👤 {m.nav_profile()}</a
				>
				<a href="/messages" class:active={$page.url.pathname.startsWith('/messages')} onclick={() => (showMobileMenu = false)}
					>💬 {m.nav_messages()}</a
				>
				{#if supportsAdminPanel && getUser()?.role === "admin"}
					<a
						href="/admin"
						class="mobile-admin-link"
						class:active={$page.url.pathname.startsWith('/admin')}
						onclick={() => (showMobileMenu = false)}
						>🛡️ Admin Panel</a
					>
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
		<div class="footer-container">
			<div class="footer-brand">
				<div class="brand-glow"></div>
				<img src="/images/footer-logo.webp" alt="Selorson Logo" class="footer-logo" />
				<h3 class="brand-name">Selorson</h3>
				<p class="brand-tagline">{m.about_hero_tagline()}</p>
			</div>

			<div class="footer-columns">
				<div class="footer-col">
					<h5 class="column-title">{m.footer_community()}</h5>
					<div class="footer-links-list">
						<a href="/about">{m.nav_about()}</a>
						<a href="/contact">{m.footer_contact()}</a>
					</div>
				</div>
				<div class="footer-col">
					<h5 class="column-title">{m.footer_content()}</h5>
					<div class="footer-links-list">
						<a href="/stories">{m.nav_stories()}</a>
						<a href="/videos">{m.nav_videos()}</a>
						<a href="/music">{m.nav_music()}</a>
						<a href="/library">{m.nav_library()}</a>
					</div>
				</div>
				<div class="footer-col">
					<h5 class="column-title">{m.footer_legal()}</h5>
					<div class="footer-links-list">
						<a href="/faq">FAQ</a>
						<a href="/privacy">{m.footer_privacy()}</a>
						<a href="/terms">{m.footer_terms()}</a>
					</div>
				</div>
				<div class="footer-col contact-col">
					<h5 class="column-title">{m.footer_contact()}</h5>
					<div class="contact-info">
						<p><span class="contact-icon">✉</span> selorson.tcv@gmail.com</p>
						<p><span class="contact-icon">📞</span> 0974.170.xxx - Mr. Cáo</p>
					</div>
					<div class="social-links">
						<a href="https://www.facebook.com/selorson.com.vn/" target="_blank" rel="noopener noreferrer" class="social-btn facebook" aria-label="Facebook">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
						</a>
						<a href="https://www.instagram.com/selorson.tcv/" target="_blank" rel="noopener noreferrer" class="social-btn instagram" aria-label="Instagram">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
						</a>
						<a href="https://www.youtube.com/@selorsontales" target="_blank" rel="noopener noreferrer" class="social-btn youtube" aria-label="YouTube">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
						</a>
						<a href="https://x.com/selorson_tcv" target="_blank" rel="noopener noreferrer" class="social-btn twitter" aria-label="X">
							<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
						</a>
					</div>
				</div>
			</div>

			<div class="footer-newsletter">
				<Newsletter />
			</div>
		</div>

		<div class="footer-bottom">
			<p>&copy; 2026 Selorson. All rights reserved.</p>
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
		transition: background 0.3s ease;
	}

	:global(html[data-theme="light"]) .site-header {
		background: linear-gradient(135deg, #0c713d 0%, #085a30 100%);
		border-bottom-color: rgba(255, 255, 255, 0.1);
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

	:global(html[data-theme="light"]) .logo-text {
		background: linear-gradient(135deg, #4ade80, #67e8f9);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.logo-image {
		display: none;
		height: 32px;
		width: 32px;
		object-fit: contain;
	}

	.logo-text-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.nav-link:hover, .nav-link.active {
		color: var(--color-brand-400);
		background: rgba(255, 255, 255, 0.05);
		box-shadow: inset 0 -2px 0 var(--color-brand-400);
		transform: translateY(-1px);
	}

	:global(html[data-theme="light"]) .nav-link {
		color: rgba(255, 255, 255, 0.9);
	}

	:global(html[data-theme="light"]) .nav-link:hover,
	:global(html[data-theme="light"]) .nav-link.active {
		color: #ffd700;
		background: rgba(255, 255, 255, 0.12);
		box-shadow: inset 0 -2px 0 #ffd700;
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
		background: linear-gradient(
			90deg,
			var(--color-surface-200) 25%,
			var(--color-surface-300) 50%,
			var(--color-surface-200) 75%
		);
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

	:global(html[data-theme="light"]) .user-btn {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
	}

	:global(html[data-theme="light"]) .user-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: #ffd700;
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
		background: linear-gradient(
			135deg,
			var(--color-brand-500),
			var(--color-accent-cyan)
		);
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
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
		padding: 0.5rem;
		z-index: 200;
		animation: slideDown 0.15s ease;
	}
	:global(html[data-theme="light"]) .user-dropdown {
		border-color: rgba(0, 0, 0, 0.1);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
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
	:global(html[data-theme="light"]) .dropdown-divider {
		border-top-color: rgba(0, 0, 0, 0.06);
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
	:global(html[data-theme="light"]) .dropdown-item:hover {
		background: rgba(0, 0, 0, 0.04);
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
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ---- Main ---- */
	.main-content {
		flex: 1;
	}

	/* ========== ENHANCED FOOTER DESIGN ========== */
	.site-footer {
		background: linear-gradient(135deg, #111827 0%, #0f172a 100%);
		position: relative;
		overflow: hidden;
		margin-top: auto;
		color: #ffffff;
	}

	.site-footer::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, #0c713d, #4ade80, #0c713d);
	}

	.footer-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 60px 40px 0;
		display: grid;
		grid-template-columns: 260px 1fr;
		gap: 60px;
	}

	/* Logo & Brand */
	.footer-brand { text-align: center; position: relative; display: flex; flex-direction: column; align-items: center; }
	.brand-glow { position: absolute; top: 70px; left: 50%; transform: translate(-50%, -50%); width: 180px; height: 180px; background: rgba(74, 222, 128, 0.2); filter: blur(50px); border-radius: 50%; z-index: 0; pointer-events: none; }
	.footer-logo { height: 140px; width: auto; display: block; margin-bottom: 1rem; object-fit: contain; position: relative; z-index: 1; }
	.brand-name { font-size: 2rem; font-weight: 800; margin: 0 0 0.5rem; letter-spacing: -0.5px; background: linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
	.brand-tagline { color: rgba(255,255,255,0.6); font-size: 0.9375rem; margin: 0 0 1.5rem; font-style: italic; }

	/* Columns */
	.footer-columns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2rem; }
	.column-title { font-size: 0.875rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 0.75rem; border-bottom: 2px solid rgba(74,222,128,0.3); display: inline-block; }
	
	.footer-links-list { display: flex; flex-direction: column; gap: 0.625rem; }
	.footer-links-list a { color: rgba(255, 255, 255, 0.6); text-decoration: none; transition: all 0.3s ease; font-size: 0.875rem; display: inline-block; }
	.footer-links-list a:hover { color: #4ade80; transform: translateX(4px); }

	/* Contact Info */
	.contact-info p { color: rgba(255, 255, 255, 0.7); font-size: 0.875rem; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
	.contact-icon { font-size: 1rem; }
	.social-links { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2rem; }
	.social-btn { width: 40px; height: 40px; border-radius: 0.625rem; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08); color: white; text-decoration: none; }
	.social-btn svg { width: 1.25rem; height: 1.25rem; }
	.social-btn:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); }
	.social-btn.facebook:hover { background: rgba(24, 119, 242, 0.15); border-color: rgba(24, 119, 242, 0.4); color: #1877f2; }
	.social-btn.twitter:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.4); }
	.social-btn.instagram:hover { background: rgba(225, 48, 108, 0.15); border-color: rgba(225, 48, 108, 0.4); color: #e1306c; }
	.social-btn.youtube:hover { background: rgba(255, 0, 0, 0.15); border-color: rgba(255, 0, 0, 0.4); color: #ff0000; }

	.footer-newsletter { grid-column: 1 / -1; display: flex; justify-content: center; margin-top: -4rem; }

	.footer-bottom { text-align: center; padding: 25px 0; margin-top: 40px; border-top: 1px solid rgba(255, 255, 255, 0.1); grid-column: 1 / -1; }
	.footer-bottom p { color: rgba(255, 255, 255, 0.5); font-size: 0.9rem; margin: 0; }

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

	:global(html[data-theme="light"]) .search-btn,
	:global(html[data-theme="light"]) .theme-toggle {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
	}

	:global(html[data-theme="light"]) .search-btn:hover,
	:global(html[data-theme="light"]) .theme-toggle:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: #ffd700;
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
	.hamburger,
	.hamburger::before,
	.hamburger::after {
		display: block;
		width: 20px;
		height: 2px;
		background: var(--color-text-primary);
		border-radius: 2px;
		transition: all 0.25s ease;
		position: absolute;
		left: 4px;
	}
	:global(html[data-theme="light"]) .hamburger,
	:global(html[data-theme="light"]) .hamburger::before,
	:global(html[data-theme="light"]) .hamburger::after {
		background: white;
	}
	.hamburger {
		top: 13px;
	}
	.hamburger::before {
		content: "";
		top: -6px;
	}
	.hamburger::after {
		content: "";
		top: 6px;
	}
	.hamburger.open {
		background: transparent;
	}
	.hamburger.open::before {
		transform: rotate(45deg);
		top: 0;
	}
	.hamburger.open::after {
		transform: rotate(-45deg);
		top: 0;
	}

	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 190;
	}
	.mobile-nav {
		position: fixed;
		top: 64px;
		right: 0;
		width: 260px;
		max-height: calc(100vh - 64px);
		background: var(--color-surface-100);
		border-left: 1px solid rgba(255, 255, 255, 0.06);
		padding: 1rem 0;
		z-index: 200;
		overflow-y: auto;
		animation: slideRight 0.2s ease;
	}
	:global(html[data-theme="light"]) .mobile-nav {
		border-left-color: rgba(0, 0, 0, 0.1);
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
	.mobile-nav a:hover,
	.mobile-nav a.active {
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-brand-400);
		box-shadow: inset 4px 0 0 var(--color-brand-400);
	}
	:global(html[data-theme="light"]) .mobile-nav a:hover,
	:global(html[data-theme="light"]) .mobile-nav a.active {
		background: rgba(0, 0, 0, 0.04);
		color: var(--color-brand-600);
		box-shadow: inset 4px 0 0 var(--color-brand-600);
	}
	.mobile-divider {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		margin: 0.5rem 0;
	}

	@keyframes slideRight {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.login-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}
	:global(html[data-theme="light"]) .login-btn {
		color: white !important;
		border-color: rgba(255, 255, 255, 0.4) !important;
		background: rgba(255, 255, 255, 0.15) !important;
	}
	:global(html[data-theme="light"]) .login-btn:hover {
		color: #ffd700 !important;
		border-color: #ffd700 !important;
		background: rgba(255, 255, 255, 0.25) !important;
	}
	.login-icon {
		display: none;
		font-size: 1.1rem;
	}

	@media (max-width: 1024px) {
		.logo-text {
			font-size: 1.85rem;
		}
		.main-nav {
			display: none;
		}
		.mobile-toggle {
			display: block;
		}
		.user-name {
			display: none;
		}
		.login-text {
			display: none;
		}
		.login-icon {
			display: block;
		}
		.login-btn {
			width: 34px;
			height: 34px;
			padding: 0;
			border-radius: 50%;
			background: rgba(255, 255, 255, 0.04);
			border: 1px solid rgba(255, 255, 255, 0.08);
		}
		.logo-text-group {
			display: none;
		}
		.logo-image {
			display: block;
			height: 52px;
			width: 52px;
			border-radius: 8px;
		}
		.footer-container {
			grid-template-columns: 1fr;
			gap: 40px;
			padding: 40px 20px 20px;
		}
		.footer-columns {
			grid-template-columns: repeat(2, 1fr);
			text-align: center;
		}
		.footer-col {
			display: flex;
			flex-direction: column;
			align-items: center;
		}
		.footer-links-list {
			align-items: center;
		}
		.contact-info p {
			justify-content: center;
		}
		.social-links {
			display: flex;
			gap: 12px;
			justify-content: center;
			flex-wrap: nowrap;
		}
	}

	@media (max-width: 480px) {
		.footer-columns {
			grid-template-columns: 1fr;
			gap: 2.5rem;
		}
	}
</style>
