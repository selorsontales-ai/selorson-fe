<script lang="ts">
	import { api } from '$lib/api';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	let query = $state('');
	let results = $state<any>({});
	let loading = $state(false);
	let searched = $state(false);

	$effect(() => {
		const q = new URLSearchParams(page.url?.search || '').get('q') || '';
		if (q && q !== query) {
			query = q;
			doSearch();
		}
	});

	async function doSearch() {
		if (!query || query.length < 2) return;
		loading = true;
		searched = true;
		try {
			const res = await api<any>(`/search?q=${encodeURIComponent(query)}`);
			results = res.data || {};
		} catch { results = {}; }
		loading = false;
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		doSearch();
	}

	const totalResults = $derived(
		(results.chapters?.length || 0) +
		(results.library?.length || 0) +
		(results.users?.length || 0) +
		(results.music?.length || 0) +
		(results.videos?.length || 0)
	);
</script>

<svelte:head><title>{query ? `"${query}" — Tìm kiếm` : 'Tìm kiếm'} — Selorson</title></svelte:head>

<div class="search-page">
	<h1>🔍 Tìm kiếm</h1>

	<form class="search-form" onsubmit={handleSubmit}>
		<input
			type="search"
			bind:value={query}
			placeholder={m.search_placeholder()}
			class="search-input"
		/>
		<button type="submit" class="btn-brand" disabled={loading || query.length < 2}>
			{loading ? '...' : 'Tìm'}
		</button>
	</form>

	{#if loading}
		<p class="status">Đang tìm kiếm...</p>
	{:else if searched && totalResults === 0}
		<p class="status">Không tìm thấy kết quả cho "{query}"</p>
	{:else if searched}
		<p class="result-count">{totalResults} kết quả</p>

		<!-- Chapters -->
		{#if results.chapters?.length}
			<section class="result-section">
				<h2>📖 Truyện</h2>
				{#each results.chapters as c}
					<a href="/stories/{c.chapter_number}" class="result-item glass-card">
						<span class="result-type">Ch. {c.chapter_number}</span>
						<span class="result-title">{c.title}</span>
					</a>
				{/each}
			</section>
		{/if}

		<!-- Music -->
		{#if results.music?.length}
			<section class="result-section">
				<h2>🎵 Nhạc</h2>
				{#each results.music as item}
					<a href="/music" class="result-item glass-card">
						{#if item.type === 'album'}
							<span class="result-type badge-album">Album</span>
							<span class="result-title">{item.title}</span>
						{:else}
							<span class="result-type badge-track">Bài hát</span>
							<div class="result-info">
								<span class="result-title">{item.title}</span>
								<span class="result-sub">{item.artist}{item.album_title ? ` — ${item.album_title}` : ''}</span>
							</div>
						{/if}
					</a>
				{/each}
			</section>
		{/if}

		<!-- Videos -->
		{#if results.videos?.length}
			<section class="result-section">
				<h2>🎬 Video</h2>
				{#each results.videos as v}
					<a href="/videos" class="result-item glass-card">
						<span class="result-type">{v.episode_number ? `Tập ${v.episode_number}` : v.video_type}</span>
						<span class="result-title">{v.video_name}</span>
					</a>
				{/each}
			</section>
		{/if}

		<!-- Library -->
		{#if results.library?.length}
			<section class="result-section">
				<h2>📚 Thư viện</h2>
				{#each results.library as l}
					<a href="/library" class="result-item glass-card">
						<span class="result-type">{l.category}</span>
						<span class="result-title">{l.name}</span>
					</a>
				{/each}
			</section>
		{/if}

		<!-- Users -->
		{#if results.users?.length}
			<section class="result-section">
				<h2>👥 Người dùng</h2>
				{#each results.users as u}
					<a href="/profile/{u.id}" class="result-item glass-card">
						{#if u.avatar}
							<img src={u.avatar} alt={u.name} class="result-avatar" />
						{:else}
							<span class="result-avatar-placeholder">👤</span>
						{/if}
						<div class="result-info">
							<span class="result-title">{u.name}</span>
							<span class="result-sub">@{u.username}</span>
						</div>
					</a>
				{/each}
			</section>
		{/if}
	{/if}
</div>

<style>
	.search-page{max-width:700px;margin:0 auto;padding:2rem 1rem}
	h1{font-size:1.5rem;font-weight:700;margin-bottom:1.5rem}
	.search-form{display:flex;gap:.5rem;margin-bottom:2rem}
	.search-input{flex:1;padding:.65rem 1rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-md);color:var(--color-text-primary);font-family:inherit;font-size:.95rem}
	.search-input:focus{outline:none;border-color:var(--color-brand-500)}
	.status{color:var(--color-text-muted);text-align:center;padding:2rem}
	.result-count{font-size:.85rem;color:var(--color-text-muted);margin-bottom:1.5rem}
	.result-section{margin-bottom:2rem}
	.result-section h2{font-size:1rem;font-weight:600;margin-bottom:.75rem;color:var(--color-text-secondary)}
	.result-item{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;text-decoration:none;margin-bottom:.5rem;transition:transform .15s, border-color .2s}
	.result-item:hover{transform:translateX(4px);border-color:rgba(255,255,255,.12)}
	.result-type{font-size:.72rem;font-weight:600;color:var(--color-brand-400);min-width:60px;text-transform:uppercase}
	.result-title{font-size:.9rem;color:var(--color-text-primary)}
	.result-info{display:flex;flex-direction:column;gap:.15rem}
	.result-sub{font-size:.75rem;color:var(--color-text-muted)}
	.badge-album{color:#c084fc}
	.badge-track{color:#60a5fa}
	.result-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0}
	.result-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}
</style>
