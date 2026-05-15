<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

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
	<title>Truyện — Selorson</title>
	<meta name="description" content="Đọc các chapter truyện Selorson" />
</svelte:head>

<section class="stories-page">
	<div class="page-header">
		<h1 class="section-title">Danh sách Chapter</h1>
		<p class="page-subtitle">Hành trình phiêu lưu đang chờ bạn khám phá</p>
	</div>

	{#if loading}
		<div class="skeleton-grid">
			{#each Array(6) as _}
				<div class="skeleton-card"></div>
			{/each}
		</div>
	{:else if chapters.length === 0}
		<div class="empty-state">
			<span class="empty-icon">📖</span>
			<h3>Chưa có chapter nào</h3>
			<p>Nội dung sẽ sớm được cập nhật</p>
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
				<button class="btn-ghost" disabled={currentPage <= 1} onclick={() => fetchChapters(currentPage - 1)}>← Trước</button>
				<span class="page-info">Trang {currentPage} / {totalPages}</span>
				<button class="btn-ghost" disabled={currentPage >= totalPages} onclick={() => fetchChapters(currentPage + 1)}>Sau →</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.stories-page {
		max-width: 1024px;
		margin: 0 auto;
		padding: 3rem 1.5rem 6rem;
	}

	.page-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.page-subtitle {
		color: var(--color-text-muted);
		margin-top: 0.5rem;
	}

	.chapter-grid {
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
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 2.5rem;
	}

	.page-info {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
</style>
