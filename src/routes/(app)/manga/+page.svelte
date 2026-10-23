<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	interface MangaMeta {
		cover_url?: string | null;
		bw_cover_url?: string | null;
		page_count: number;
		color_count: number;
		bw_count: number;
		has_color: boolean;
		has_bw: boolean;
		reading_mode: string;
		aspect_ratio: string;
	}

	interface ChapterItem {
		id: number;
		title: string;
		chapter_number: number;
		author_note: string | null;
		status: string;
		has_manga?: boolean;
		manga_meta?: MangaMeta | null;
		created_at: string;
	}

	let allChapters = $state<ChapterItem[]>([]);
	let loading = $state(true);
	let editionFilter = $state<'all' | 'color' | 'bw'>('all');

	let mangaChapters = $derived(
		allChapters.filter((ch) => {
			if (!ch.has_manga || !ch.manga_meta) return false;
			if (editionFilter === 'color') return ch.manga_meta.has_color;
			if (editionFilter === 'bw') return ch.manga_meta.has_bw;
			return true;
		})
	);

	async function fetchMangaChapters() {
		loading = true;
		try {
			const res = await api<any>('/chapters?page=1&per_page=50');
			allChapters = Array.isArray(res.data) ? res.data : [];
		} catch {
			allChapters = [];
		}
		loading = false;
	}

	onMount(() => fetchMangaChapters());

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('vi-VN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Manga — Selorson</title>
	<meta
		name="description"
		content="Thư viện Truyện Tranh Manga Selorson — Trải nghiệm song song Bản Full Color và Bản Tankōbon Đen Trắng."
	/>
</svelte:head>

<section class="manga-gallery-page">
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<span class="hero-kicker">🎨 SHONEN JUMP & TANKŌBON EDITION</span>
			<h1>Thư Viện Manga Selorson</h1>
			<p class="hero-tagline">
				Chuyển đổi tức thì giữa <strong>Bản Màu Rực Rỡ</strong> và <strong>Bản Đen Trắng Nguyên Bản</strong> ngay trên từng khung tranh.
			</p>

			<div class="filter-bar">
				<button
					type="button"
					class="filter-pill"
					class:active={editionFilter === 'all'}
					onclick={() => (editionFilter = 'all')}
				>
					✨ Tất cả tập
				</button>
				<button
					type="button"
					class="filter-pill"
					class:active={editionFilter === 'color'}
					onclick={() => (editionFilter = 'color')}
				>
					🎨 Bản Có Màu
				</button>
				<button
					type="button"
					class="filter-pill"
					class:active={editionFilter === 'bw'}
					onclick={() => (editionFilter = 'bw')}
				>
					🖋️ Bản Đen Trắng
				</button>
			</div>
		</div>
	</section>

	{#if loading}
		<div class="poster-grid">
			{#each Array(4) as _}
				<div class="skeleton-poster"></div>
			{/each}
		</div>
	{:else if mangaChapters.length === 0}
		<div class="empty-state glass-card">
			<span class="empty-icon">🎨</span>
			<h3>Chưa có tập Manga nào được xuất bản</h3>
			<p>
				Các chương Manga đang ở trạng thái Nháp hoặc chưa được bật xuất bản trong Admin Panel.
			</p>
			<a href="/stories" class="btn-brand">📖 Đọc Truyện Chữ</a>
		</div>
	{:else}
		<div class="poster-grid">
			{#each mangaChapters as ch (ch.id)}
				{@const meta = ch.manga_meta!}
				{@const displayCover =
					editionFilter === 'bw' && meta.bw_cover_url
						? meta.bw_cover_url
						: meta.cover_url || meta.bw_cover_url}
				<article class="glass-card manga-poster-card">
					<a
						href="/stories/{ch.chapter_number}?tab=manga{editionFilter === 'bw' ? '&edition=bw' : ''}"
						class="poster-thumb-link"
					>
						{#if displayCover}
							<img
								src={displayCover}
								alt="Ch. {ch.chapter_number} — {ch.title}"
								class="poster-img"
								loading="lazy"
							/>
						{:else}
							<div class="poster-placeholder">🎨 Ch. {ch.chapter_number}</div>
						{/if}

						<div class="poster-top-badges">
							<span class="ch-pill">Ch. {ch.chapter_number}</span>
							<span class="page-count-pill">{meta.page_count} trang</span>
						</div>

						<div class="poster-edition-badges">
							{#if meta.has_color}
								<span class="ed-tag color">🎨 Bản Màu ({meta.color_count})</span>
							{/if}
							{#if meta.has_bw}
								<span class="ed-tag bw">🖋️ Đen Trắng ({meta.bw_count})</span>
							{/if}
						</div>
					</a>

					<div class="poster-body">
						<h3 class="poster-title">
							<a href="/stories/{ch.chapter_number}?tab=manga">{ch.title}</a>
						</h3>
						<span class="poster-date">{formatDate(ch.created_at)}</span>

						<div class="poster-actions">
							{#if meta.has_color}
								<a
									href="/stories/{ch.chapter_number}?tab=manga&edition=color"
									class="action-btn color-btn"
								>
									🎨 Đọc Bản Màu
								</a>
							{/if}
							{#if meta.has_bw}
								<a
									href="/stories/{ch.chapter_number}?tab=manga&edition=bw"
									class="action-btn bw-btn"
								>
									🖋️ Đọc Đen Trắng
								</a>
							{/if}
							<a href="/stories/{ch.chapter_number}" class="action-btn prose-btn" title="Đọc bản Truyện Chữ">
								📖 Chữ
							</a>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.manga-gallery-page {
		min-height: 75vh;
		padding-bottom: 4rem;
	}

	.page-hero {
		position: relative;
		text-align: center;
		padding: 3.5rem 1.5rem 2.5rem;
		background: var(--color-surface-0);
		overflow: hidden;
		margin-bottom: 2rem;
	}
	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 720px;
		margin: 0 auto;
	}
	.hero-kicker {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		padding: 0.28rem 0.75rem;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.14);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.3);
		margin-bottom: 0.75rem;
	}
	.page-hero h1 {
		font-size: 2.4rem;
		font-weight: 800;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem;
	}
	.hero-tagline {
		color: var(--color-text-muted);
		font-size: 1rem;
		margin: 0 0 1.35rem;
		line-height: 1.6;
	}
	.hero-glow {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 60% at 50% 25%, rgba(245, 158, 11, 0.14), transparent),
			radial-gradient(ellipse 60% 50% at 80% 50%, rgba(16, 185, 129, 0.1), transparent);
		pointer-events: none;
	}

	.filter-bar {
		display: inline-flex;
		gap: 0.45rem;
		padding: 0.3rem;
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 999px;
	}
	.filter-pill {
		padding: 0.4rem 0.95rem;
		border-radius: 999px;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
	}
	.filter-pill.active {
		background: var(--color-brand-500);
		color: #fff;
	}

	.poster-grid {
		max-width: 1120px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1.5rem;
	}

	.manga-poster-card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 0;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}
	.manga-poster-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
	}

	.poster-thumb-link {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		background: #090b10;
		overflow: hidden;
	}
	.poster-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.35s ease;
	}
	.manga-poster-card:hover .poster-img {
		transform: scale(1.03);
	}
	.poster-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.3rem;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.poster-top-badges {
		position: absolute;
		top: 0.7rem;
		left: 0.7rem;
		right: 0.7rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		pointer-events: none;
	}
	.ch-pill {
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		background: rgba(9, 11, 16, 0.82);
		backdrop-filter: blur(6px);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}
	.page-count-pill {
		padding: 0.22rem 0.55rem;
		border-radius: 999px;
		background: rgba(9, 11, 16, 0.75);
		backdrop-filter: blur(6px);
		color: #cbd5e1;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.poster-edition-badges {
		position: absolute;
		bottom: 0.65rem;
		left: 0.65rem;
		right: 0.65rem;
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		pointer-events: none;
	}
	.ed-tag {
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-sm);
		backdrop-filter: blur(6px);
	}
	.ed-tag.color {
		background: rgba(245, 158, 11, 0.9);
		color: #fff;
	}
	.ed-tag.bw {
		background: rgba(15, 23, 42, 0.9);
		color: #f8fafc;
		border: 1px solid rgba(148, 163, 184, 0.35);
	}

	.poster-body {
		padding: 1.1rem 1.15rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		flex: 1;
	}
	.poster-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1.35;
	}
	.poster-title a {
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.poster-title a:hover {
		color: var(--color-brand-400);
	}
	.poster-date {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.poster-actions {
		margin-top: auto;
		padding-top: 0.65rem;
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.action-btn {
		flex: 1;
		text-align: center;
		text-decoration: none;
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-md);
		font-size: 0.76rem;
		font-weight: 700;
		transition: all 0.15s;
		white-space: nowrap;
	}
	.action-btn.color-btn {
		background: linear-gradient(135deg, #f59e0b, #ea580c);
		color: #fff;
	}
	.action-btn.bw-btn {
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}
	.action-btn.prose-btn {
		flex: 0 0 auto;
		background: var(--color-surface-100);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}
	.action-btn:hover {
		filter: brightness(1.08);
	}

	.skeleton-poster {
		aspect-ratio: 2 / 3;
		border-radius: var(--radius-xl);
		background: var(--color-surface-100);
		animation: pulse 1.5s infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 0.8; }
	}

	.empty-state {
		max-width: 520px;
		margin: 2rem auto;
		text-align: center;
		padding: 3rem 2rem;
	}
	.empty-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.75rem;
	}
	.empty-state h3 {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 0.4rem;
	}
	.empty-state p {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0 0 1.25rem;
	}
</style>
