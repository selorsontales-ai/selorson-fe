<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import HeroSlider from '$lib/components/ui/HeroSlider.svelte';
	import VoteWidget from '$lib/components/ui/VoteWidget.svelte';
	import { resolveVideoThumbnail } from '$lib/video/video-utils';
	import {
		playTrack,
		togglePlay,
		getCurrentTrack,
		getIsPlaying,
		type AudioTrack
	} from '$lib/stores/audio.svelte';
	import {
		formatCategoryMeta,
		readGuestProgressFromStorage,
		resolveLoreLinks,
		resolveReaderHub,
		type FeaturedLoreCard,
		type HomepageChapterCard,
		type LocalGuestSnapshot,
		type ServerUserHub
	} from '$lib/home/home-hub';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale, currentLocale, formatEntryRoleLabel } from '$lib/i18n-labels';

	let heroSlides = $state<any[] | null>(null);
	let latestChapters = $state<HomepageChapterCard[]>([]);
	let featuredVideos = $state<any[]>([]);
	let futureProjects = $state<any[]>([]);
	let featuredLore = $state<FeaturedLoreCard[]>([]);
	let featuredOst = $state<AudioTrack[]>([]);
	let milestones = $state<any[]>([]);
	let worldStats = $state<{
		published_chapters: number;
		active_lore: number;
		world_locations: number;
		music_tracks: number;
	}>({
		published_chapters: 0,
		active_lore: 0,
		world_locations: 0,
		music_tracks: 0
	});
	let serverUserHub = $state<ServerUserHub | null>(null);
	let guestSnapshot = $state<LocalGuestSnapshot>({});

	let readerHub = $derived(
		resolveReaderHub(
			serverUserHub,
			latestChapters,
			worldStats.world_locations,
			guestSnapshot,
			currentLocale()
		)
	);

	let activeAudioTrack = $derived(getCurrentTrack());
	let audioPlaying = $derived(getIsPlaying());

	onMount(async () => {
		const [homeResult, videoResult] = await Promise.allSettled([
			api<any>('/homepage'),
			api<any>('/videos/featured')
		]);

		if (videoResult.status === 'fulfilled') {
			featuredVideos = videoResult.value.data || [];
		}

		if (homeResult.status === 'fulfilled' && homeResult.value.data) {
			const d = homeResult.value.data;
			heroSlides = Array.isArray(d.hero_slides) ? d.hero_slides : [];
			latestChapters = Array.isArray(d.latest_chapters) ? d.latest_chapters : [];
			futureProjects = Array.isArray(d.future_projects) ? d.future_projects : [];
			featuredLore = Array.isArray(d.featured_lore) ? d.featured_lore : [];
			featuredOst = Array.isArray(d.featured_ost) ? d.featured_ost : [];
			milestones = Array.isArray(d.milestones) ? d.milestones : [];
			if (d.world_stats) {
				worldStats = {
					published_chapters: Number(d.world_stats.published_chapters || 0),
					active_lore: Number(d.world_stats.active_lore || 0),
					world_locations: Number(d.world_stats.world_locations || 0),
					music_tracks: Number(d.world_stats.music_tracks || 0)
				};
			}
			serverUserHub = d.user_hub || null;
		} else {
			heroSlides = [];
			try {
				const chapRes = await api<any>('/chapters?page=1&per_page=6');
				latestChapters = chapRes.data || [];
			} catch {}
		}

		if (typeof localStorage !== 'undefined') {
			guestSnapshot = readGuestProgressFromStorage(localStorage, featuredVideos);
		}
	});

	function handlePlayFeaturedOst(track?: AudioTrack) {
		if (track) {
			if (activeAudioTrack?.id === track.id) {
				togglePlay();
			} else {
				playTrack(track, featuredOst.length > 0 ? featuredOst : [track]);
			}
			return;
		}
		if (activeAudioTrack) {
			togglePlay();
		} else if (featuredOst.length > 0) {
			playTrack(featuredOst[0], featuredOst);
		}
	}

	function formatDate(d?: string) {
		if (!d) return '';
		return new Date(d).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{m.ui_selorson_grand_hall_of_akunalia()}</title>
	<meta
		name="description"
		content={m.ui_selorson_v3_read_web_novels()}
	/>
	<meta property="og:title" content={m.ui_selorson_grand_hall_of_akunalia()} />
	<meta
		property="og:description"
		content={m.ui_read_web_novels_dual_manga()}
	/>
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="vi_VN" />
</svelte:head>

<!-- Hero Slider (single shared payload) -->
<section class="hero-section">
	<HeroSlider initialSlides={heroSlides} />
</section>

<!-- Reader Hub: Hành Trình Của Bạn Tại Akunalia -->
<section class="hub-section" aria-label={m.ui_your_journey_in_akunalia_2()}>
	<div class="hub-container">
		<div class="hub-header">
			<div>
				<span class="hub-eyebrow">{m.ui_reader_hub()}</span>
				<h2 class="hub-title">{m.ui_your_journey_in_akunalia()}</h2>
			</div>
			{#if worldStats.published_chapters > 0 || worldStats.active_lore > 0}
				<div class="hub-stats-pills">
					<span class="stat-chip">📖 <strong>{worldStats.published_chapters}</strong> {m.stories_chapters()}</span>
					<span class="stat-chip">📚 <strong>{worldStats.active_lore}</strong> {m.ui_lore_entries()}</span>
					<span class="stat-chip">🌐 <strong>{worldStats.world_locations}</strong> {m.ui_3d_locations()}</span>
					{#if worldStats.music_tracks > 0}
						<span class="stat-chip">🎵 <strong>{worldStats.music_tracks}</strong> {m.ui_tracks()}</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="hub-grid">
			<!-- Card 1: Continue Reading / Start Reading -->
			<div class="hub-card hub-reading">
				<div class="hub-card-top">
					<span class="hub-badge">{readerHub.reading.badge}</span>
					{#if readerHub.reading.hasManga}
						<span class="manga-tag">{m.ui_manga_included()}</span>
					{/if}
				</div>
				<h3 class="hub-card-title">{readerHub.reading.title}</h3>
				<p class="hub-card-sub">{readerHub.reading.subtitle}</p>

				{#if readerHub.reading.percent > 0}
					<div class="hub-progress-track" aria-label={m.ui_chapter_reading_progress()}>
						<div class="hub-progress-fill" style="width: {readerHub.reading.percent}%"></div>
					</div>
				{/if}

				<div class="hub-actions">
					<a href={readerHub.reading.href} class="hub-btn-primary">
						{readerHub.reading.percent > 0 && !readerHub.reading.isCompleted
							? m.ui_continue_reading()
							: m.ui_read_now()} →
					</a>
					{#if readerHub.reading.mangaHref}
						<a href={readerHub.reading.mangaHref} class="hub-btn-secondary">
							{m.ui_manga_edition()}
						</a>
					{/if}
				</div>
			</div>

			<!-- Card 2: 3D World & Atlas Progress -->
			<div class="hub-card hub-world">
				<div class="hub-card-top">
					<span class="hub-badge world-badge">{m.ui_3d_globe_2d_atlas()}</span>
					<span class="world-pct">{readerHub.world.percent}%</span>
				</div>
				<h3 class="hub-card-title">
					{#if readerHub.world.latestLocationName}
						{m.ui_latest_footprint()} {readerHub.world.latestLocationName}
					{:else}
						{m.ui_explore_the_globe_continents_of()}
					{/if}
				</h3>
				<p class="hub-card-sub">
					{#if readerHub.world.totalLocations > 0}
						{m.rhud_visited()} <strong>{readerHub.world.visitedCount}</strong> /
						<strong>{readerHub.world.totalLocations}</strong> {m.ui_locations_on_the_interactive_map()}
					{:else}
						{m.ui_rotate_the_3d_globe_lift()}
					{/if}
				</p>

				<div class="hub-progress-track">
					<div class="hub-progress-fill world-fill" style="width: {readerHub.world.percent}%"></div>
				</div>

				<div class="hub-actions">
					<a href={readerHub.world.href} class="hub-btn-world">
						🌐 {m.ui_open_3d_map()} →
					</a>
					<a href="/library" class="hub-btn-ghost">
						📚 {m.nav_library()}
					</a>
				</div>
			</div>

			<!-- Card 3: Ambient OST & Video Resume -->
			<div class="hub-card hub-media">
				<div class="hub-card-top">
					<span class="hub-badge media-badge">{m.ui_multimedia_sanctuary()}</span>
				</div>

				{#if featuredOst.length > 0}
					{@const primaryTrack = activeAudioTrack || featuredOst[0]}
					<h3 class="hub-card-title">
						{audioPlaying
							? `${m.ui_now_playing()}: ${primaryTrack.title}`
							: `${m.ui_soundtrack()}: ${primaryTrack.title}`}
					</h3>
					<p class="hub-card-sub">
						{primaryTrack.artist || 'Selorson OST'} · {m.ui_plays_seamlessly_while_you_read()}
					</p>
					<div class="ost-mini-list">
						{#each featuredOst.slice(0, 2) as track (track.id)}
							<button
								type="button"
								class="ost-pill"
								class:playing={activeAudioTrack?.id === track.id && audioPlaying}
								onclick={() => handlePlayFeaturedOst(track)}
							>
								<span>{activeAudioTrack?.id === track.id && audioPlaying ? '⏸' : '▶'}</span>
								<span class="ost-pill-title">{track.title}</span>
							</button>
						{/each}
					</div>
				{:else}
					<h3 class="hub-card-title">{m.ui_akunalia_soundtracks_episodes()}</h3>
					<p class="hub-card-sub">
						{m.ui_enjoy_original_soundtracks_and_animated()}
					</p>
				{/if}

				<div class="hub-actions">
					{#if featuredOst.length > 0}
						<button type="button" class="hub-btn-ost" onclick={() => handlePlayFeaturedOst()}>
							{audioPlaying ? m.ui_pause_soundtrack() : m.ui_play_akunalia_ost()}
						</button>
					{:else}
						<a href="/music" class="hub-btn-ost">🎵 {m.ui_open_music_hall()}</a>
					{/if}

					{#if readerHub.watching}
						<a href={readerHub.watching.href} class="hub-btn-ghost" title={readerHub.watching.videoName}>
							🎬 {m.ui_resume_video()}
						</a>
					{:else}
						<a href="/music" class="hub-btn-ghost">🎵 Album</a>
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Quick Access (5 Pillars including 3D World Map) -->
<section class="quick-section">
	<h2 class="section-title">{m.home_explore()}</h2>
	<div class="quick-grid">
		<a href="/stories" class="quick-card">
			<span class="quick-icon">📖</span>
			<h3>{m.nav_stories()}</h3>
			<p>{m.home_quick_stories_desc()}</p>
		</a>
		<a href="/world" class="quick-card quick-card-highlight">
			<span class="quick-icon">🌐</span>
			<h3>{m.ui_3d_map()}</h3>
			<p>{m.ui_interactive_3d_globe_2d_atlas()}</p>
		</a>
		<a href="/library" class="quick-card">
			<span class="quick-icon">📚</span>
			<h3>{m.nav_library()}</h3>
			<p>{m.home_quick_library_desc()}</p>
		</a>
		<a href="/music" class="quick-card">
			<span class="quick-icon">🎵</span>
			<h3>{m.nav_music()}</h3>
			<p>{m.home_quick_music_desc()}</p>
		</a>
		<a href="/videos" class="quick-card">
			<span class="quick-icon">🎬</span>
			<h3>{m.nav_videos()}</h3>
			<p>{m.home_quick_videos_desc()}</p>
		</a>
	</div>
</section>

<!-- Latest Chapters (with Excerpt, Reading Time & Manga Badge) -->
{#if latestChapters.length > 0}
	<section class="content-section">
		<div class="section-header">
			<h2 class="section-title">{m.home_latest_chapters()}</h2>
			<a href="/stories" class="see-all">{m.home_see_all()}</a>
		</div>
		<div class="chapter-row">
			{#each latestChapters as ch (ch.id)}
				<article class="glass-card ch-card">
					<div class="ch-card-top">
						<span class="ch-num">{m.world_chapter()} {ch.chapter_number}</span>
						<div class="ch-badges">
							{#if ch.has_manga}
								<span class="ch-manga-badge" title={m.ui_this_chapter_includes_a_dual()}>
									🎨 Manga
								</span>
							{/if}
							{#if ch.reading_time_min}
								<span class="ch-time-badge">⏱ ~{ch.reading_time_min} {m.ui_min()}</span>
							{/if}
						</div>
					</div>

					<a href="/stories/{ch.chapter_number}" class="ch-title-link">
						<h3>{ch.title}</h3>
					</a>

					{#if ch.excerpt}
						<p class="ch-excerpt">{ch.excerpt}</p>
					{/if}

					<div class="ch-footer">
						<span class="ch-date">
							{formatDate(ch.created_at)}
							{#if ch.word_count}
								· {Number(ch.word_count).toLocaleString(dateLocale())} {m.ui_words()}
							{/if}
						</span>
						<div class="ch-cta-group">
							<a href="/stories/{ch.chapter_number}" class="ch-read-link">{m.ui_read()}</a>
							{#if ch.has_manga}
								<a href="/stories/{ch.chapter_number}?mode=manga" class="ch-manga-link">Manga</a>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>
{/if}

<!-- Featured Lore & World Codex Spotlight (Replaces Tech Stack) -->
{#if featuredLore.length > 0 || milestones.length > 0}
	<section class="content-section codex-section">
		<div class="section-header">
			<h2 class="section-title">{m.ui_akunalia_world_spotlight()}</h2>
			<a href="/library" class="see-all">{m.ui_open_world_codex_2()}</a>
		</div>

		{#if featuredLore.length > 0}
			<div class="lore-grid">
				{#each featuredLore as item (item.id)}
					{@const cat = formatCategoryMeta(item.category, currentLocale())}
					{@const links = resolveLoreLinks(item)}
					<article class="glass-card lore-card">
						<div class="lore-thumb">
							{#if item.image_url}
								<img src={item.image_url} alt={item.name} loading="lazy" />
							{:else}
								<div class="lore-placeholder">
									<span>{cat.icon}</span>
								</div>
							{/if}
							<span class="lore-cat-badge">{cat.icon} {cat.label}</span>
							{#if item.first_chapter}
								<span class="lore-ch-badge">Ch.{item.first_chapter}</span>
							{/if}
						</div>

						<div class="lore-body">
							<div class="lore-head">
								<h3>{item.name}</h3>
								{#if item.role}
									<span class="lore-role">{formatEntryRoleLabel(item.role)}</span>
								{/if}
							</div>

							{#if item.description}
								<p class="lore-desc">{item.description}</p>
							{/if}

							<div class="lore-actions">
								<a href={links.libraryHref} class="lore-link-primary">📚 {m.ui_full_dossier()}</a>
								{#if links.worldHref}
									<a href={links.worldHref} class="lore-link-world">🌐 {m.ui_locate_in_3d()}</a>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}

		{#if milestones.length > 0}
			<div class="milestones-strip">
				<div class="milestones-head">
					<h3>{m.ui_chronicles_development_milestones()}</h3>
					<a href="/about" class="see-all-inline">{m.ui_view_full_roadmap()}</a>
				</div>
				<div class="milestones-row">
					{#each milestones.slice(0, 4) as ms (ms.id)}
						<div class="ms-card">
							<span class="ms-date">{ms.date || ms.year || m.ui_milestone()}</span>
							<h4>{ms.title}</h4>
							{#if ms.description}
								<p>{ms.description}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
{/if}

<!-- Featured Videos -->
{#if featuredVideos.length > 0}
	<section class="content-section">
		<div class="section-header">
			<h2 class="section-title">{m.home_featured_videos()}</h2>
			<a href="/videos" class="see-all">{m.home_see_all()}</a>
		</div>
		<div class="video-row">
			{#each featuredVideos.slice(0, 3) as vid (vid.id)}
				<a href="/videos?ep={vid.id}" class="glass-card vid-card">
					<div class="vid-thumb">
						{#if resolveVideoThumbnail(vid)}
							<img src={resolveVideoThumbnail(vid)} alt={vid.video_name} loading="lazy" />
						{:else}
							<div class="vid-placeholder">▶</div>
						{/if}
					</div>
					<div class="vid-info">
						<h3>{vid.video_name}</h3>
						{#if vid.description}
							<p>{vid.description}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}

<!-- Two Column: Vote + Future Projects -->
<section class="split-section">
	<div class="split-left">
		<VoteWidget />
	</div>
	<div class="split-right">
		{#if futureProjects.length > 0}
			<div class="projects-card">
				<h2 class="section-title">{m.home_future_projects()}</h2>
				<div class="project-list">
					{#each futureProjects as proj (proj.id ?? proj.name)}
						<div class="project-item">
							<div class="project-head">
								<h4>{proj.name}</h4>
								{#if proj.status}
									<span class="proj-status">{proj.status}</span>
								{/if}
							</div>
							{#if proj.timeline}
								<span class="proj-timeline">{proj.timeline}</span>
							{/if}
							{#if proj.description}
								<p>{proj.description}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="projects-card world-invite-card">
				<h2 class="section-title">{m.ui_step_into_the_akunalia_universe()}</h2>
				<p class="world-invite-desc">
					{m.ui_every_web_novel_chapter_manga()}
				</p>
				<div class="world-invite-links">
					<a href="/world" class="hub-btn-world">🌐 {m.ui_explore_3d_map()}</a>
					<a href="/library" class="hub-btn-ghost">📚 {m.ui_open_world_codex()}</a>
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	/* Hero */
	.hero-section {
		position: relative;
	}

	/* Reader Hub */
	.hub-section {
		max-width: 1140px;
		margin: clamp(1.25rem, 3vw, 2.25rem) auto 0;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem);
		position: relative;
		z-index: 3;
	}
	.hub-container {
		background: linear-gradient(145deg, rgba(12, 113, 61, 0.12), rgba(15, 23, 42, 0.78));
		border: 1px solid rgba(74, 222, 128, 0.22);
		border-radius: 20px;
		padding: clamp(1rem, 3.2vw, 1.5rem) clamp(1rem, 3.5vw, 1.75rem);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
		backdrop-filter: blur(16px);
	}
	:global(html[data-theme='light']) .hub-container {
		background: linear-gradient(145deg, rgba(12, 113, 61, 0.08), rgba(255, 255, 255, 0.95));
		border-color: rgba(12, 113, 61, 0.25);
		box-shadow: 0 10px 30px rgba(12, 113, 61, 0.08);
	}
	.hub-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}
	.hub-eyebrow {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-brand-400);
		margin-bottom: 0.2rem;
	}
	.hub-title {
		font-size: clamp(1.15rem, 2.5vw, 1.35rem);
		font-weight: 800;
		margin: 0;
		color: var(--color-text-primary);
	}
	.hub-stats-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.stat-chip {
		font-size: 0.76rem;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}
	:global(html[data-theme='light']) .stat-chip {
		background: rgba(12, 113, 61, 0.08);
		border-color: rgba(12, 113, 61, 0.2);
	}
	.stat-chip strong {
		color: var(--color-brand-400);
	}

	.hub-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.1rem;
	}
	.hub-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: clamp(0.95rem, 2.5vw, 1.25rem);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
	}
	:global(html[data-theme='light']) .hub-card {
		background: #ffffff;
		border-color: rgba(0, 0, 0, 0.08);
	}
	.hub-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.45rem 0.5rem;
	}
	.hub-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.24rem 0.65rem;
		border-radius: 999px;
		background: rgba(16, 185, 129, 0.16);
		color: #34d399;
		white-space: nowrap;
		max-width: 100%;
	}
	.world-badge {
		background: rgba(6, 182, 212, 0.16);
		color: #22d3ee;
	}
	.media-badge {
		background: rgba(245, 158, 11, 0.16);
		color: #fbbf24;
	}
	:global(html[data-theme='light']) .hub-badge {
		color: #047857;
	}
	:global(html[data-theme='light']) .world-badge {
		color: #0e7490;
	}
	:global(html[data-theme='light']) .media-badge {
		color: #b45309;
	}
	.manga-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(168, 85, 247, 0.18);
		color: #c084fc;
		white-space: nowrap;
	}
	.world-pct {
		font-size: 0.8rem;
		font-weight: 800;
		color: #22d3ee;
	}
	.hub-card-title {
		font-size: 1.02rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
		line-height: 1.35;
	}
	.hub-card-sub {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.hub-progress-track {
		height: 6px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
		margin-top: 0.15rem;
	}
	:global(html[data-theme='light']) .hub-progress-track {
		background: rgba(0, 0, 0, 0.08);
	}
	.hub-progress-fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #0c713d, #34d399);
		transition: width 0.4s ease;
	}
	.world-fill {
		background: linear-gradient(90deg, #0891b2, #22d3ee);
	}

	.ost-mini-list {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.ost-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.74rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-text-secondary);
		cursor: pointer;
		max-width: 100%;
	}
	.ost-pill.playing {
		border-color: #fbbf24;
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.12);
	}
	.ost-pill-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 140px;
	}

	.hub-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.35rem;
		flex-wrap: wrap;
	}
	.hub-btn-primary,
	.hub-btn-world,
	.hub-btn-ost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 0.95rem;
		border-radius: 10px;
		font-size: 0.8rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		border: none;
		transition: all 0.2s ease;
	}
	.hub-btn-primary {
		background: linear-gradient(135deg, #0c713d, #059669);
		color: #fff;
	}
	.hub-btn-world {
		background: linear-gradient(135deg, #0e7490, #06b6d4);
		color: #fff;
	}
	.hub-btn-ost {
		background: linear-gradient(135deg, #d97706, #f59e0b);
		color: #fff;
	}
	.hub-btn-secondary {
		display: inline-flex;
		align-items: center;
		padding: 0.48rem 0.8rem;
		border-radius: 10px;
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
		background: rgba(168, 85, 247, 0.15);
		border: 1px solid rgba(168, 85, 247, 0.35);
		color: #c084fc;
	}
	.hub-btn-ghost {
		display: inline-flex;
		align-items: center;
		padding: 0.48rem 0.8rem;
		border-radius: 10px;
		font-size: 0.78rem;
		font-weight: 600;
		text-decoration: none;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: var(--color-text-secondary);
	}
	:global(html[data-theme='light']) .hub-btn-ghost {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.12);
	}

	/* Quick Access */
	.quick-section {
		max-width: 1140px;
		margin: 2.5rem auto 0;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem) 3rem;
		position: relative;
		z-index: 2;
	}
	.quick-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 1rem;
	}
	.quick-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: clamp(1rem, 2.5vw, 1.4rem) clamp(0.65rem, 2vw, 1rem);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 16px;
		text-decoration: none;
		transition: all 0.25s;
		min-width: 0;
	}
	.quick-card:hover {
		border-color: rgba(12, 113, 61, 0.35);
		background: rgba(12, 113, 61, 0.06);
		transform: translateY(-2px);
	}
	.quick-card-highlight {
		border-color: rgba(6, 182, 212, 0.28);
		background: linear-gradient(160deg, rgba(6, 182, 212, 0.08), rgba(12, 113, 61, 0.05));
	}
	.quick-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}
	.quick-card h3 {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.2rem;
	}
	.quick-card p {
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	/* Content Sections */
	.content-section {
		max-width: 1140px;
		margin: 0 auto 4rem;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem);
	}
	.section-header {
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.section-header .section-title {
		margin-bottom: 0;
	}
	.see-all {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-brand-400);
		text-decoration: none;
		transition: color 0.2s;
	}
	.see-all:hover {
		text-decoration: underline;
	}

	/* Latest Chapters */
	.chapter-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 1.1rem;
	}
	.ch-card {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.ch-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.ch-num {
		font-size: 0.74rem;
		font-weight: 800;
		color: var(--color-brand-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.ch-badges {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.ch-manga-badge {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: rgba(168, 85, 247, 0.16);
		color: #c084fc;
	}
	.ch-time-badge {
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}
	.ch-title-link {
		text-decoration: none;
	}
	.ch-card h3 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
		transition: color 0.2s;
	}
	.ch-title-link:hover h3 {
		color: var(--color-brand-400);
	}
	.ch-excerpt {
		font-size: 0.82rem;
		color: var(--color-text-secondary);
		line-height: 1.55;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.ch-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.ch-date {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}
	.ch-cta-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ch-read-link {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--color-brand-400);
		text-decoration: none;
	}
	.ch-manga-link {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
		background: rgba(168, 85, 247, 0.15);
		color: #c084fc;
		text-decoration: none;
	}

	/* Featured Lore Grid */
	.lore-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 1.15rem;
	}
	.lore-card {
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.lore-thumb {
		position: relative;
		height: 175px;
		background: var(--color-surface-200);
		overflow: hidden;
	}
	.lore-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.35s ease;
	}
	.lore-card:hover .lore-thumb img {
		transform: scale(1.04);
	}
	.lore-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2.5rem;
		background: linear-gradient(135deg, rgba(12, 113, 61, 0.18), rgba(6, 182, 212, 0.12));
	}
	.lore-cat-badge {
		position: absolute;
		top: 0.65rem;
		left: 0.65rem;
		padding: 0.22rem 0.6rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(15, 23, 42, 0.82);
		color: #fff;
		backdrop-filter: blur(6px);
	}
	.lore-ch-badge {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		background: rgba(12, 113, 61, 0.88);
		color: #fff;
	}
	.lore-body {
		padding: 1.1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		flex: 1;
	}
	.lore-head h3 {
		font-size: 1.02rem;
		font-weight: 700;
		margin: 0;
		color: var(--color-text-primary);
	}
	.lore-role {
		font-size: 0.74rem;
		color: var(--color-brand-400);
		font-weight: 600;
	}
	.lore-desc {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.lore-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.45rem;
	}
	.lore-link-primary,
	.lore-link-world {
		font-size: 0.76rem;
		font-weight: 700;
		padding: 0.35rem 0.7rem;
		border-radius: 8px;
		text-decoration: none;
	}
	.lore-link-primary {
		background: rgba(12, 113, 61, 0.14);
		color: var(--color-brand-400);
	}
	.lore-link-world {
		background: rgba(6, 182, 212, 0.14);
		color: #22d3ee;
	}

	/* Milestones strip */
	.milestones-strip {
		margin-top: 1.75rem;
		padding: 1.25rem 1.5rem;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.milestones-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.milestones-head h3 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
	}
	.see-all-inline {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-brand-400);
		text-decoration: none;
	}
	.milestones-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
		gap: 0.85rem;
	}
	.ms-card {
		padding: 0.85rem 1rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border-left: 3px solid var(--color-brand-400);
	}
	.ms-date {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-brand-400);
		text-transform: uppercase;
	}
	.ms-card h4 {
		font-size: 0.88rem;
		font-weight: 700;
		margin: 0.2rem 0;
	}
	.ms-card p {
		font-size: 0.76rem;
		color: var(--color-text-muted);
		margin: 0;
		line-height: 1.45;
	}

	/* Videos */
	.video-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
		gap: 1.25rem;
	}
	.vid-card {
		padding: 0;
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		display: block;
	}
	.vid-thumb {
		aspect-ratio: 16/9;
		background: var(--color-surface-200);
		overflow: hidden;
	}
	.vid-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s;
	}
	.vid-card:hover .vid-thumb img {
		transform: scale(1.05);
	}
	.vid-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		color: var(--color-text-muted);
	}
	.vid-info {
		padding: 1rem;
	}
	.vid-info h3 {
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	.vid-info p {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Split Section */
	.split-section {
		max-width: 1140px;
		margin: 0 auto;
		padding: 0 clamp(0.85rem, 3.5vw, 1.5rem) 5rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.5rem;
	}
	.projects-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 16px;
		padding: clamp(1rem, 3vw, 1.5rem);
		min-width: 0;
	}
	.project-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.project-item {
		padding: 0.85rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 10px;
	}
	.project-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.project-item h4 {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0 0 0.15rem;
	}
	.proj-status {
		font-size: 0.68rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: rgba(12, 113, 61, 0.18);
		color: var(--color-brand-400);
		font-weight: 600;
	}
	.proj-timeline {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-accent-cyan);
	}
	.project-item p {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}
	.world-invite-desc {
		font-size: 0.88rem;
		color: var(--color-text-secondary);
		line-height: 1.65;
		margin-bottom: 1.25rem;
	}
	.world-invite-links {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
	}

	@media (max-width: 960px) {
		.hub-grid {
			grid-template-columns: 1fr;
		}
		.quick-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 768px) {
		.quick-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.split-section {
			grid-template-columns: 1fr;
		}
	}
</style>
