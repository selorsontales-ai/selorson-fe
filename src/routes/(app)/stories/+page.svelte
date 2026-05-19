<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	interface Chapter {
		id: number;
		title: string;
		chapter_number: number;
		author_note: string | null;
		status: string;
		created_at: string;
	}

	let chapters = $state<Chapter[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(1);

	async function fetchChapters(page = 1) {
		loading = true;
		try {
			const res = await api<any>(`/chapters?page=${page}&per_page=12`);
			chapters = res.data;
			currentPage = res.meta?.current_page || 1;
			totalPages = res.meta?.total_pages || 1;
		} catch { chapters = []; }
		loading = false;
	}

	onMount(() => fetchChapters());

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('vi-VN', {
			year: 'numeric', month: 'short', day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{m.stories_seo_title()}</title>
	<meta name="description" content={m.stories_seo_desc()} />
</svelte:head>

<section class="stories-page">
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<h1>{m.stories_list_title()}</h1>
			<p class="hero-tagline">{m.stories_list_subtitle()}</p>
		</div>
	</section>

	{#if loading}
		<div class="skeleton-grid">
			{#each Array(6) as _}
				<div class="skeleton-card"></div>
			{/each}
		</div>
	{:else if chapters.length === 0}
		<div class="empty-state">
			<span class="empty-icon">📖</span>
			<h3>{m.stories_empty_title()}</h3>
			<p>{m.stories_empty_desc()}</p>
		</div>
	{:else}
		<div class="chapter-grid">
			{#each chapters as chapter}
				<a href="/stories/{chapter.chapter_number}" class="glass-card chapter-card">
					<div class="chapter-number">Ch. {chapter.chapter_number}</div>
					<h3 class="chapter-title">{chapter.title}</h3>
					{#if chapter.author_note}
						<p class="chapter-note">{chapter.author_note}</p>
					{/if}
					<span class="chapter-date">{formatDate(chapter.created_at)}</span>
				</a>
			{/each}
		</div>

		{#if totalPages > 1}
			<div class="pagination">
				<button class="btn-ghost" disabled={currentPage <= 1} onclick={() => fetchChapters(currentPage - 1)}>{m.btn_prev()}</button>
				<span class="page-info">{m.pagination_info({ current: currentPage, total: totalPages })}</span>
				<button class="btn-ghost" disabled={currentPage >= totalPages} onclick={() => fetchChapters(currentPage + 1)}>{m.btn_next()}</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.stories-page {
		min-height: 70vh;
	}

	/* ===== Hero ===== */
	.page-hero {
		position: relative; text-align: center; padding: 3.5rem 2rem 2.5rem;
		background: var(--color-surface-0);
		overflow: hidden; margin-bottom: 2rem;
	}
	.hero-content { position: relative; z-index: 1; }
	.page-hero h1 {
		font-size: 2.5rem; font-weight: 800; color: var(--color-text-primary); margin: 0 0 0.375rem;
	}
	.hero-tagline { color: var(--color-text-muted); font-size: 1.05rem; margin: 0; font-weight: 400; }
	.hero-glow {
		position: absolute; inset: 0;
		background: radial-gradient(ellipse 80% 60% at 50% 30%, rgba(12,113,61,.15), transparent),
		            radial-gradient(ellipse 60% 50% at 80% 50%, rgba(6,182,212,.08), transparent);
		pointer-events: none;
	}

	.chapter-grid {
		max-width: 1024px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.chapter-card {
		text-decoration: none;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.chapter-number {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-brand-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.chapter-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.chapter-note {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.chapter-date {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: auto;
	}

	/* Skeleton */
	.skeleton-grid {
		max-width: 1024px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.skeleton-card {
		height: 140px;
		background: var(--color-surface-200);
		border-radius: var(--radius-lg);
		animation: shimmer 1.5s infinite;
		background: linear-gradient(90deg, var(--color-surface-200) 25%, var(--color-surface-300) 50%, var(--color-surface-200) 75%);
		background-size: 200% 100%;
	}

	/* Empty */
	.empty-state {
		text-align: center;
		padding: 4rem 1rem;
		color: var(--color-text-muted);
	}

	.empty-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		font-size: 1.2rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	/* Pagination */
	.pagination {
		max-width: 1024px;
		margin: 2.5rem auto 0;
		padding: 0 1.5rem;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
	}

	.page-info {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
</style>

