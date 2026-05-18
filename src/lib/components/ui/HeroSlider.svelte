<script lang="ts">
	import { api } from '$lib/api';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	// ── Types ──

	interface HeroSlide {
		id: number;
		title: string;
		description: string | null;
		image_url: string;
		button_text: string | null;
		link_url: string | null;
		round?: string | null;
	}

	interface VoteOption {
		id: number;
		option_text: string;
		vote_count: number;
	}

	interface Notification {
		id: number;
		title: string;
		content: string | null;
		type: string;
		image_url: string | null;
		vote?: {
			options: VoteOption[];
			user_voted: number | null;
		} | null;
	}

	interface UnifiedSlide {
		_key: string;
		title: string;
		description: string | null;
		image: string | null;
		badge: string | null;
		buttonText: string | null;
		linkUrl: string | null;
		isNotification: boolean;
		notifType?: string;
		notifId?: number;
		options?: VoteOption[];
		totalVotes?: number;
		userVotedId?: number | null;
		isWelcome?: boolean;
	}

	// ── State ──

	let heroSlides = $state<HeroSlide[]>([]);
	let notifications = $state<Notification[]>([]);
	let current = $state(0);
	let intervalId: ReturnType<typeof setInterval>;
	let voting = $state(false);

	// ── Computed: merge notifications (first) + hero slides ──

	let allSlides = $derived.by(() => {
		const notifSlides: UnifiedSlide[] = notifications.map((n) => {
			const totalVotes = n.vote?.options?.reduce((sum, o) => sum + o.vote_count, 0) ?? 0;
			return {
				_key: `notif-${n.id}`,
				title: n.title,
				description: n.content,
				image: n.image_url,
				badge: n.type === 'vote' ? '🗳️ Bình Chọn' : n.type === 'announcement' ? '📢 Thông Báo' : '📋 Tin Tức',
				buttonText: null,
				linkUrl: null,
				isNotification: true,
				notifType: n.type,
				notifId: n.id,
				options: n.vote?.options?.map(o => ({
					...o,
					percentage: totalVotes > 0 ? Math.round((o.vote_count / totalVotes) * 100) : 0,
				})) as any,
				totalVotes,
				userVotedId: n.vote?.user_voted ?? null,
			};
		});

		const heroItems: UnifiedSlide[] = heroSlides.map((s) => ({
			_key: `hero-${s.id}`,
			title: s.title,
			description: s.description,
			image: s.image_url,
			badge: s.round || null,
			buttonText: s.button_text || null,
			linkUrl: s.link_url || null,
			isNotification: false,
		}));

		const welcomeSlide: UnifiedSlide = {
			_key: 'welcome-static',
			title: 'Welcome', // Rendered manually in HTML
			description: null,
			image: null,
			badge: null,
			buttonText: null,
			linkUrl: null,
			isNotification: false,
			isWelcome: true,
		};

		return [welcomeSlide, ...notifSlides, ...heroItems];
	});

	// ── Lifecycle ──

	onMount(() => {
		let isMounted = true;

		const loadHeroSlides = async () => {
			try {
				const res = await api<any>('/homepage');
				if (isMounted) heroSlides = res.data?.hero_slides || [];
			} catch {
				if (isMounted) heroSlides = [];
			}
		};

		const loadNotifications = async () => {
			if (!isAuthenticated()) return;
			try {
				const res = await api<any>('/notifications');
				if (isMounted) notifications = res.data || [];
			} catch {
				if (isMounted) notifications = [];
			}
		};

		// Run independently so they don't block each other
		loadHeroSlides().finally(() => {
			if (isMounted) startAutoplay();
		});
		
		loadNotifications().finally(() => {
			if (isMounted) startAutoplay();
		});

		return () => {
			isMounted = false;
			stopAutoplay();
		};
	});

	// ── Navigation ──

	function next() {
		if (allSlides.length === 0) return;
		current = (current + 1) % allSlides.length;
	}

	function prev() {
		if (allSlides.length === 0) return;
		current = (current - 1 + allSlides.length) % allSlides.length;
	}

	function goTo(i: number) {
		current = i;
		resetAutoplay();
	}

	function startAutoplay() {
		stopAutoplay();
		if (allSlides.length > 1) {
			intervalId = setInterval(next, 15000);
		}
	}

	function stopAutoplay() {
		if (intervalId) { clearInterval(intervalId); }
	}

	function resetAutoplay() {
		stopAutoplay();
		startAutoplay();
	}

	// ── Vote ──

	async function submitVote(notifId: number, optionId: number) {
		if (!isAuthenticated()) return;
		if (voting) return;
		voting = true;
		try {
			await api('/notifications/vote', {
				method: 'POST',
				body: { notification_id: notifId, option_id: optionId },
			});
			// Re-fetch notifications to get updated vote counts
			const res = await api<any>('/notifications');
			notifications = res.data || [];
		} catch { /* ignore */ }
		finally { voting = false; }
	}
</script>

{#if allSlides.length > 0}
	<div class="hero-slider" role="region" aria-label="Hero Slider">
		{#each allSlides as slide, i (slide._key)}
			<div
				class="slide"
				class:active={i === current}
				class:welcome-slide={slide.isWelcome}
				style={slide.image ? `background-image: url(${slide.image})` : ''}
			>
				{#if !slide.isWelcome}
					<div class="slide-overlay"></div>
				{/if}

				{#if slide.isWelcome}
					<div class="welcome-content">
						<h1 class="welcome-title">
							{m.home_welcome_to()}<br /> Selorson
						</h1>
						<p class="welcome-desc">
							{@html m.home_subtitle()}
						</p>
						<div class="welcome-actions">
							<a href="/stories" class="welcome-btn-primary">{m.home_read_stories()}</a>
							<a href="/about" class="welcome-btn-ghost">{m.home_learn_more()}</a>
						</div>
					</div>
				{:else}
					<div class="slide-content" class:vote-layout={slide.isNotification && slide.notifType === 'vote'}>
						{#if slide.badge}
							<span class="slide-badge">{slide.badge}</span>
						{/if}
						<h2 class="slide-title">{slide.title}</h2>
						{#if slide.description}
							<p class="slide-desc">{slide.description}</p>
						{/if}

						<!-- Hero slide button -->
						{#if !slide.isNotification && slide.buttonText && slide.linkUrl}
							<a href={slide.linkUrl} class="slide-btn">{slide.buttonText} →</a>
						{/if}

						<!-- Vote panel (notification type=vote) -->
						{#if slide.isNotification && slide.notifType === 'vote' && slide.options?.length}
							<div class="vote-panel">
								{#each slide.options as opt (opt.id)}
									{@const pct = slide.totalVotes && slide.totalVotes > 0
										? Math.round((opt.vote_count / slide.totalVotes) * 100) : 0}
									<button
										class="vote-option"
										class:user-voted={slide.userVotedId === opt.id}
										onclick={() => submitVote(slide.notifId!, opt.id)}
										disabled={voting}
									>
										<div class="vote-opt-header">
											<span class="vote-opt-text">{opt.option_text}</span>
											<span class="vote-opt-pct">{pct}%</span>
										</div>
										<div class="vote-bar">
											<div class="vote-fill" style="width: {pct}%"></div>
										</div>
									</button>
								{/each}
								<p class="vote-total">{slide.totalVotes || 0} lượt bình chọn</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<!-- Dots -->
		{#if allSlides.length > 1}
			<div class="dots">
				{#each allSlides as slide, i (slide._key)}
					<button
						class="dot"
						class:active={i === current}
						class:dot-notif={slide.isNotification}
						onclick={() => goTo(i)}
						aria-label="Slide {i + 1}"
					></button>
				{/each}
			</div>
		{/if}

		<!-- Arrows -->
		{#if allSlides.length > 1}
			<button class="slider-arrow prev" onclick={prev} aria-label="Previous">‹</button>
			<button class="slider-arrow next" onclick={next} aria-label="Next">›</button>
		{/if}
	</div>
{/if}

<style>
	@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');

	/* ══════════════ Slider Container ══════════════ */
	.hero-slider {
		position: relative;
		width: 100%;
		height: 65vh;
		min-height: 400px;
		max-height: 700px;
		overflow: hidden;
	}

	/* ══════════════ Slide ══════════════ */
	.slide {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
		background-color: #0c713d;
		opacity: 0;
		transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.slide.active { opacity: 1; }

	.slide.welcome-slide {
		background: linear-gradient(135deg, rgba(12, 113, 61, 0.95) 0%, rgba(12, 113, 61, 0.85) 50%, rgba(20, 90, 50, 0.9) 100%);
	}

	.slide-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%);
	}

	/* ══════════════ Slide Content ══════════════ */
	.slide-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		padding: 3rem 4rem;
		max-width: 700px;
	}

	.slide-content.vote-layout {
		max-width: 560px;
	}

	/* ══════════════ Badge ══════════════ */
	.slide-badge {
		display: inline-block;
		width: fit-content;
		padding: 0.375rem 1rem;
		background: rgba(255,215,0,0.9);
		color: #0c713d;
		border-radius: 2rem;
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 1rem;
	}

	/* ══════════════ Title & Desc ══════════════ */
	.slide-title {
		font-size: 2.5rem;
		font-weight: 800;
		color: #fff;
		margin: 0 0 0.75rem;
		line-height: 1.2;
		text-shadow: 0 2px 8px rgba(0,0,0,0.3);
	}

	.slide-desc {
		font-size: 1.0625rem;
		color: rgba(255,255,255,0.85);
		margin: 0 0 1.5rem;
		line-height: 1.6;
		max-width: 500px;
	}

	/* ══════════════ CTA Button ══════════════ */
	.slide-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		width: fit-content;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #ffd700, #ffaa00);
		color: #0c713d;
		text-decoration: none;
		border-radius: 0.5rem;
		font-weight: 700;
		font-size: 0.9375rem;
		transition: all 0.3s ease;
		box-shadow: 0 4px 16px rgba(255,215,0,0.3);
	}
	.slide-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255,215,0,0.4); }
	:global(html[data-theme='light']) .slide-btn { background: linear-gradient(135deg, #ffd700, #ffaa00); color: #0c713d; }

	/* ══════════════ Vote Panel ══════════════ */
	.vote-panel {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		max-width: 420px;
	}

	.vote-option {
		background: rgba(255,255,255,0.12);
		backdrop-filter: blur(6px);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: 0.625rem;
		padding: 0.75rem 1rem;
		cursor: pointer;
		transition: all 0.25s ease;
		text-align: left;
		color: inherit;
		font-family: inherit;
		font-size: inherit;
	}
	.vote-option:hover {
		background: rgba(255,255,255,0.2);
		border-color: rgba(255,215,0,0.5);
		transform: translateX(4px);
	}
	.vote-option:disabled { opacity: 0.6; cursor: wait; }
	.vote-option.user-voted {
		background: rgba(255,215,0,0.2);
		border-color: rgba(255,215,0,0.6);
		box-shadow: 0 0 16px rgba(255,215,0,0.15);
	}

	.vote-opt-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.375rem;
	}
	.vote-opt-text { font-size: 0.9375rem; font-weight: 600; color: #fff; }
	.vote-opt-pct { font-size: 0.875rem; font-weight: 800; color: rgba(255,215,0,0.9); min-width: 40px; text-align: right; }

	.vote-bar { height: 5px; background: rgba(255,255,255,0.15); border-radius: 3px; overflow: hidden; }
	.vote-fill {
		height: 100%;
		background: linear-gradient(90deg, #ffd700, #ffaa00);
		border-radius: 3px;
		transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.vote-total { font-size: 0.75rem; color: rgba(255,255,255,0.5); margin: 0.25rem 0 0; }

	/* ══════════════ Dots ══════════════ */
	.dots {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.5rem;
		z-index: 2;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(255,255,255,0.4);
		border: none;
		cursor: pointer;
		transition: all 0.3s ease;
		padding: 0;
	}
	.dot.active {
		background: #ffd700;
		width: 28px;
		border-radius: 5px;
	}
	.dot-notif { background: rgba(255,215,0,0.3); }
	.dot-notif.active { background: #ffd700; }

	/* ══════════════ Arrows ══════════════ */
	.slider-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0,0,0,0.3);
		backdrop-filter: blur(4px);
		border: none;
		border-radius: 50%;
		color: #fff;
		font-size: 1.5rem;
		cursor: pointer;
		transition: all 0.3s ease;
		z-index: 2;
	}
	.slider-arrow:hover { background: rgba(0,0,0,0.5); transform: translateY(-50%) scale(1.1); }
	.prev { left: 1rem; }
	.next { right: 1rem; }

	/* ══════════════ Welcome Slide CSS ══════════════ */
	.welcome-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		height: 100%;
		padding: 3rem 4rem 6rem 4rem; /* Extra bottom padding to stay away from dots */
		text-align: center;
	}

	.welcome-title {
		font-family: 'Playfair Display', serif;
		font-size: 4rem;
		margin: 20px 0;
		text-transform: uppercase;
		letter-spacing: 3px;
		font-weight: 900;
		text-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.5);
		line-height: 1.2;
		color: #fff;
	}

	:global(html[data-theme='light']) .welcome-title {
		color: #000;
	}

	.welcome-desc {
		font-size: 1.3rem;
		color: rgba(255, 255, 255, 0.95);
		margin: 25px auto 40px;
		line-height: 1.8;
		max-width: 600px;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
	}

	:global(html[data-theme='light']) .welcome-desc {
		color: #000;
	}

	.welcome-actions {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: center;
	}

	.welcome-btn-primary {
		padding: 0.75rem 1.5rem;
		background: #fff;
		color: #0c713d;
		border-radius: 0.5rem;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9375rem;
		transition: all 0.2s ease;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
	}
	.welcome-btn-primary:hover {
		background: #f0fdf4;
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
	}

	.welcome-btn-ghost {
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border: 2px solid #fff;
		border-radius: 0.5rem;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9375rem;
		transition: all 0.2s ease;
	}
	.welcome-btn-ghost:hover {
		background: #fff;
		color: #0c713d;
		transform: translateY(-2px);
	}

	/* ══════════════ Responsive ══════════════ */
	@media (max-width: 768px) {
		.hero-slider { height: 50vh; min-height: 320px; }
		.slide-content, .welcome-content { padding: 2rem; }
		.slide-title { font-size: 1.75rem; }
		.welcome-title { font-size: 2.5rem; }
		.welcome-actions { flex-direction: row; flex-wrap: nowrap; gap: 0.5rem; justify-content: center; width: 100%; }
		.welcome-actions a { width: auto; flex: 1; padding: 0.75rem 0.5rem; font-size: 0.85rem; text-align: center; white-space: nowrap; max-width: 180px; }
		.vote-panel { max-width: 100%; }
	}

	@media (max-width: 480px) {
		.slide-content, .welcome-content { padding: 1.5rem; }
		.slide-title { font-size: 1.375rem; }
		.welcome-title { font-size: 2rem; }
		.slider-arrow { width: 36px; height: 36px; font-size: 1.25rem; }
	}
</style>
