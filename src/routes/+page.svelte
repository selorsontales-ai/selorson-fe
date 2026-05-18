<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import HeroSlider from '$lib/components/ui/HeroSlider.svelte';
	import VoteWidget from '$lib/components/ui/VoteWidget.svelte';
	import * as m from '$lib/paraglide/messages';

	let backendStatus = $state<'checking' | 'connected' | 'error'>('checking');
	let latestChapters = $state<any[]>([]);
	let featuredVideos = $state<any[]>([]);
	let futureProjects = $state<any[]>([]);

	onMount(async () => {
		try {
			const [healthRes, chapRes] = await Promise.all([
				api<any>('/health'),
				api<any>('/chapters?page=1&per_page=4'),
			]);
			backendStatus = 'connected';
			latestChapters = chapRes.data || [];
		} catch { backendStatus = 'error'; }

		try {
			const vidRes = await api<any>('/videos/featured');
			featuredVideos = vidRes.data || [];
		} catch {}

		try {
			const homeRes = await api<any>('/homepage');
			futureProjects = homeRes.data?.future_projects || [];
		} catch {}
	});

	function formatDate(d: string) { return new Date(d).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }); }
</script>

<svelte:head>
	<title>Selorson — Nền tảng nội dung đa phương tiện</title>
	<meta name="description" content="Selorson V3 — Truyện, Video, Nhạc và cộng đồng sáng tạo" />
	<meta property="og:title" content="Selorson — Nền tảng nội dung đa phương tiện" />
	<meta property="og:description" content="Truyện, Video, Nhạc và cộng đồng sáng tạo." />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="vi_VN" />
</svelte:head>

<!-- Hero Slider -->
<section class="hero-section">
	<HeroSlider />
</section>

<!-- Quick Access -->
<section class="quick-section">
	<h2 class="section-title">{m.home_explore()}</h2>
	<div class="quick-grid">
		<a href="/stories" class="quick-card">
			<span class="quick-icon">📖</span>
			<h3>{m.nav_stories()}</h3>
			<p>{m.home_quick_stories_desc()}</p>
		</a>
		<a href="/videos" class="quick-card">
			<span class="quick-icon">🎬</span>
			<h3>{m.nav_videos()}</h3>
			<p>{m.home_quick_videos_desc()}</p>
		</a>
		<a href="/music" class="quick-card">
			<span class="quick-icon">🎵</span>
			<h3>{m.nav_music()}</h3>
			<p>{m.home_quick_music_desc()}</p>
		</a>
		<a href="/library" class="quick-card">
			<span class="quick-icon">📚</span>
			<h3>{m.nav_library()}</h3>
			<p>{m.home_quick_library_desc()}</p>
		</a>
	</div>
</section>

<!-- Latest Chapters -->
{#if latestChapters.length > 0}
	<section class="content-section">
		<div class="section-header">
			<h2 class="section-title">{m.home_latest_chapters()}</h2>
			<a href="/stories" class="see-all">{m.home_see_all()}</a>
		</div>
		<div class="chapter-row">
			{#each latestChapters as ch}
				<a href="/stories/{ch.chapter_number}" class="glass-card ch-card">
					<span class="ch-num">Ch. {ch.chapter_number}</span>
					<h3>{ch.title}</h3>
					<span class="ch-date">{formatDate(ch.created_at)}</span>
				</a>
			{/each}
		</div>
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
			{#each featuredVideos.slice(0, 3) as vid}
				<div class="glass-card vid-card">
					<div class="vid-thumb">
						{#if vid.thumbnail_path}
							<img src={vid.thumbnail_path} alt={vid.video_name} />
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
				</div>
			{/each}
		</div>
	</section>
{/if}

<!-- Two Column: Vote + Projects -->
<section class="split-section">
	<div class="split-left">
		<VoteWidget />
	</div>
	<div class="split-right">
		{#if futureProjects.length > 0}
			<div class="projects-card">
				<h2 class="section-title">{m.home_future_projects()}</h2>
				<div class="project-list">
					{#each futureProjects as proj}
						<div class="project-item">
							<h4>{proj.name}</h4>
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
		{/if}
	</div>
</section>

<!-- Tech Stack -->
<section class="tech-section">
	<h2 class="section-title">{m.home_tech_stack_title()}</h2>
	<div class="tech-grid">
		{#each [
			{ name: 'Rust + Axum', desc: m.home_tech_rust_desc(), icon: '🦀' },
			{ name: 'SvelteKit', desc: m.home_tech_svelte_desc(), icon: '⚡' },
			{ name: 'PostgreSQL', desc: m.home_tech_pg_desc(), icon: '🐘' },
			{ name: 'Redis', desc: 'Cache + Realtime', icon: '💾' },
			{ name: 'Cloudflare', desc: 'CDN + Stream', icon: '☁️' },
			{ name: 'Capacitor', desc: 'iOS + Android', icon: '📱' },
		] as tech}
			<div class="glass-card tech-card">
				<span class="tech-icon">{tech.icon}</span>
				<h3>{tech.name}</h3>
				<p>{tech.desc}</p>
			</div>
		{/each}
	</div>
</section>

<style>
	/* Hero */
	.hero-section { position: relative; }

	/* Quick Access */
	.quick-section { max-width: 1100px; margin: 3rem auto 0; padding: 0 1.5rem 3rem; position: relative; z-index: 2; }
	.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
	.quick-card { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 1.5rem 1rem; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; text-decoration: none; transition: all .25s; }
	.quick-card:hover { border-color: rgba(12,113,61,.3); background: rgba(12,113,61,.05); transform: translateY(-2px); }
	.quick-icon { font-size: 2rem; margin-bottom: .5rem; }
	.quick-card h3 { font-size: .95rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: .2rem; }
	.quick-card p { font-size: .78rem; color: var(--color-text-muted); }

	/* Content Sections */
	.content-section { max-width: 1100px; margin: 0 auto 4rem; padding: 0 1.5rem; }
	.section-header { position: relative; display: flex; justify-content: center; align-items: center; margin-bottom: 2rem; }
	.section-header .section-title { margin-bottom: 0; }
	.see-all { position: absolute; right: 0; font-size: 0.95rem; font-weight: 600; color: var(--color-brand-400); text-decoration: none; transition: color .2s; }
	.see-all:hover { text-decoration: underline; }

	.chapter-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
	.ch-card { padding: 1.25rem; text-decoration: none; display: flex; flex-direction: column; gap: .3rem; }
	.ch-num { font-size: .72rem; font-weight: 700; color: var(--color-brand-400); text-transform: uppercase; letter-spacing: .05em; }
	.ch-card h3 { font-size: 1rem; font-weight: 600; color: var(--color-text-primary); }
	.ch-date { font-size: .72rem; color: var(--color-text-muted); margin-top: auto; }

	.video-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
	.vid-card { padding: 0; overflow: hidden; }
	.vid-thumb { aspect-ratio: 16/9; background: var(--color-surface-200); overflow: hidden; }
	.vid-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
	.vid-card:hover .vid-thumb img { transform: scale(1.05); }
	.vid-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--color-text-muted); }
	.vid-info { padding: 1rem; }
	.vid-info h3 { font-size: .95rem; font-weight: 600; margin-bottom: .25rem; }
	.vid-info p { font-size: .8rem; color: var(--color-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

	/* Split Section */
	.split-section { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem 4rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
	.projects-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; padding: 1.5rem; }
	.project-list { display: flex; flex-direction: column; gap: .75rem; }
	.project-item { padding: .75rem; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.04); border-radius: 10px; }
	.project-item h4 { font-size: .9rem; font-weight: 600; margin-bottom: .15rem; }
	.proj-timeline { font-size: .7rem; font-weight: 600; color: var(--color-accent-cyan); }
	.project-item p { font-size: .8rem; color: var(--color-text-muted); margin-top: .25rem; }

	/* Tech */
	.tech-section { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem 6rem; }
	.tech-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
	.tech-card { padding: 1.5rem; text-align: center; }
	.tech-icon { font-size: 2rem; display: block; margin-bottom: .75rem; }
	.tech-card h3 { font-size: .95rem; font-weight: 600; margin-bottom: .25rem; }
	.tech-card p { font-size: .8rem; color: var(--color-text-muted); }

	@media (max-width: 768px) {
		.quick-grid { grid-template-columns: repeat(2, 1fr); }
		.split-section { grid-template-columns: 1fr; }
	}
</style>
