<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getExplore } from '$lib/stores/social.svelte';
	import { playTrack } from '$lib/stores/audio.svelte';
	import UserQuickCard from '$lib/components/ui/UserQuickCard.svelte';
	import * as m from '$lib/paraglide/messages';
	import { formatReaderRank, formatCategoryLabel, formatEntryRoleLabel } from '$lib/i18n-labels';

	let query = $state('');
	let results = $state<any>({});
	let loading = $state(false);
	let searched = $state(false);

	// Community Discovery state
	let communityUsers = $state<any[]>([]);
	let communityLoading = $state(true);
	let communitySort = $state<'active' | 'readers' | 'explorers' | 'newest'>('active');
	let communityFilter = $state('');
	let quickCardUser = $state<any | null>(null);

	onMount(() => {
		loadCommunity();
	});

	$effect(() => {
		const q = new URLSearchParams(page.url?.search || '').get('q') || '';
		if (q && q !== query) {
			query = q;
			doSearch();
		}
	});

	async function loadCommunity() {
		communityLoading = true;
		try {
			const res = await getExplore({
				q: communityFilter.trim() || undefined,
				sort: communitySort,
				limit: 24
			});
			if (res?.success && Array.isArray(res.data)) {
				communityUsers = res.data;
			} else {
				communityUsers = [];
			}
		} catch {
			communityUsers = [];
		} finally {
			communityLoading = false;
		}
	}

	function selectSort(mode: 'active' | 'readers' | 'explorers' | 'newest') {
		if (communitySort === mode) return;
		communitySort = mode;
		loadCommunity();
	}

	async function doSearch() {
		if (!query || query.length < 2) {
			searched = false;
			results = {};
			return;
		}
		loading = true;
		searched = true;
		try {
			const res = await api<any>(`/search?q=${encodeURIComponent(query)}`);
			results = res.data || {};
		} catch {
			results = {};
		}
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

<svelte:head><title>{query ? `"${query}" — ${m.nav_search()}` : m.search_search_community()} — Selorson</title></svelte:head>

<div class="search-page">
	<h1>{m.search_search_discover()}</h1>

	<form class="search-form" onsubmit={handleSubmit}>
		<input
			type="search"
			bind:value={query}
			placeholder={m.search_placeholder()}
			class="search-input"
		/>
		<button type="submit" class="btn-brand" disabled={loading || query.length < 2}>
			{loading ? '...' : m.search_search()}
		</button>
	</form>

	{#if loading}
		<p class="status">{m.search_searching()}</p>
	{:else if searched && totalResults === 0}
		<p class="status">{m.search_no_results_for({ query })}</p>
	{:else if searched}
		<p class="result-count">{m.search_results_count_for({ count: totalResults, query })}</p>

		<!-- Chapters -->
		{#if results.chapters?.length}
			<section class="result-section">
				<h2>📖 {m.nav_stories()}</h2>
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
				<h2>🎵 {m.nav_music()}</h2>
				{#each results.music as item}
					<a
						href={item.target_url || (item.type === 'album' ? `/music?album=${item.id}` : `/music?track=${item.id}`)}
						class="result-item glass-card"
					>
						{#if item.type === 'album'}
							<span class="result-type badge-album">Album</span>
							<span class="result-title">{item.title}</span>
						{:else}
							<span class="result-type badge-track">{m.search_track()}</span>
							<div class="result-info" style="flex:1">
								<span class="result-title">{item.title}</span>
								<span class="result-sub">{item.artist}{item.album_title ? ` — ${item.album_title}` : ''}</span>
							</div>
							{#if item.file_path}
								<button
									type="button"
									class="rc-btn primary"
									style="flex:0 0 auto;padding:0.3rem 0.65rem"
									onclick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										playTrack(item, null, true);
									}}
								>
									▶ {m.search_play_now()}
								</button>
							{/if}
						{/if}
					</a>
				{/each}
			</section>
		{/if}

		<!-- Videos -->
		{#if results.videos?.length}
			<section class="result-section">
				<h2>🎬 {m.nav_videos()}</h2>
				{#each results.videos as v}
					<a href={v.target_url || `/videos?ep=${v.id}`} class="result-item glass-card">
						<span class="result-type">{v.episode_number ? `${m.uprofile_ep()} ${v.episode_number}` : v.video_type}</span>
						<span class="result-title">{v.video_name}</span>
					</a>
				{/each}
			</section>
		{/if}

		<!-- Library -->
		{#if results.library?.length}
			<section class="result-section">
				<h2>📚 {m.nav_library()}</h2>
				{#each results.library as l}
					<a href="/library?id={l.id}" class="result-item glass-card">
						<span class="result-type">{formatCategoryLabel(l.category)}</span>
						<div class="result-info" style="flex:1">
							<span class="result-title">{l.name}</span>
							{#if l.aliases?.length}
								<span class="result-sub">{m.search_aliases()}: {l.aliases.join(', ')}</span>
							{:else if l.role}
								<span class="result-sub">{formatEntryRoleLabel(l.role)}</span>
							{/if}
						</div>
						{#if l.category === 'location'}
							<span
								role="link"
								tabindex="0"
								class="rc-btn primary"
								style="flex:0 0 auto;padding:0.28rem 0.6rem;font-size:0.75rem"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									window.location.href = `/world?focus=${l.id}`;
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										e.stopPropagation();
										window.location.href = `/world?focus=${l.id}`;
									}
								}}
							>
								🌍 {m.search_3d_map()}
							</span>
						{:else if l.category === 'character' || l.category === 'main_character' || l.category === 'side_character'}
							<span
								role="link"
								tabindex="0"
								class="rc-btn"
								style="flex:0 0 auto;padding:0.28rem 0.6rem;font-size:0.75rem"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									window.location.href = `/world/journey/${l.id}`;
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										e.stopPropagation();
										window.location.href = `/world/journey/${l.id}`;
									}
								}}
							>
								🧭 {m.search_3d_journey()}
							</span>
						{/if}
					</a>
				{/each}
			</section>
		{/if}

		<!-- Users -->
		{#if results.users?.length}
			<section class="result-section">
				<h2>👥 {m.search_users()}</h2>
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

	<!-- Community Reader & Explorer Directory -->
	<section class="community-section">
		<div class="community-head">
			<div>
				<h2>{m.search_explore_reader_community()}</h2>
				<p class="community-sub">{m.search_connect_with_readers_3d_explorers()}</p>
			</div>
			<div class="community-filter-row">
				<input
					type="search"
					class="community-filter-input"
					placeholder={m.search_filter_by_name_username_hobbies()}
					bind:value={communityFilter}
					onkeydown={(e) => e.key === 'Enter' && loadCommunity()}
				/>
				<button class="filter-btn" onclick={loadCommunity}>{m.search_filter()}</button>
			</div>
		</div>

		<div class="sort-tabs">
			<button class="sort-tab" class:active={communitySort === 'active'} onclick={() => selectSort('active')}>
				{m.search_active_now()}
			</button>
			<button class="sort-tab" class:active={communitySort === 'readers'} onclick={() => selectSort('readers')}>
				{m.search_top_readers()}
			</button>
			<button class="sort-tab" class:active={communitySort === 'explorers'} onclick={() => selectSort('explorers')}>
				{m.search_3d_explorers()}
			</button>
			<button class="sort-tab" class:active={communitySort === 'newest'} onclick={() => selectSort('newest')}>
				{m.search_newest_members()}
			</button>
		</div>

		{#if communityLoading}
			<p class="status">{m.search_loading_community_members()}</p>
		{:else if communityUsers.length === 0}
			<p class="status">{m.search_no_matching_members_found()}</p>
		{:else}
			<div class="community-grid">
				{#each communityUsers as u (u.id)}
					<div class="reader-card glass-card">
						<div class="rc-top">
							<button type="button" class="rc-avatar-btn" onclick={() => (quickCardUser = u)} title={m.search_quick_profile_view()}>
								{#if u.avatar}
									<img src={u.avatar} alt={u.name} class="rc-avatar" />
								{:else}
									<div class="rc-avatar-ph">{(u.name || u.username || 'U')[0].toUpperCase()}</div>
								{/if}
								{#if u.is_online}
									<span class="rc-online" title={m.ui_online()}></span>
								{/if}
							</button>
							<div class="rc-identity">
								<a href="/profile/{u.id}" class="rc-name">{u.nickname || u.name}</a>
								<span class="rc-handle">@{u.username}</span>
								{#if u.reader_rank || u.reader_title || u.role}
									<span class="rc-rank">✨ {formatReaderRank(u.reader_rank || u.reader_title, u.role)}</span>
								{/if}
							</div>
						</div>

						{#if u.biography}
							<p class="rc-bio">{u.biography}</p>
						{:else if u.hobbies}
							<p class="rc-bio">🎯 {u.hobbies}</p>
						{:else}
							<p class="rc-bio muted">{m.search_selorson_world_reader()}</p>
						{/if}

						<div class="rc-stats">
							<span title={m.uprofile_chapters_read()}>📖 {u.stats?.chapters_read ?? 0}</span>
							<span title={m.uprofile_3d_places_visited()}>🧭 {u.stats?.world_visited ?? 0}</span>
							<span title={m.ui_comments()}>💬 {u.stats?.comments_count ?? 0}</span>
							<span title={m.search_followers()}>👥 {u.followers_count ?? 0}</span>
						</div>

						<div class="rc-actions">
							<button type="button" class="rc-btn" onclick={() => (quickCardUser = u)}>{m.search_quick_view()}</button>
							<a href="/profile/{u.id}" class="rc-btn primary">{m.search_profile()}</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<UserQuickCard
	open={Boolean(quickCardUser)}
	userId={quickCardUser?.id}
	initialUser={quickCardUser}
	onClose={() => (quickCardUser = null)}
/>

<style>
	.search-page{max-width:960px;margin:0 auto;padding:2rem 1rem 4rem}
	h1{font-size:1.5rem;font-weight:700;margin-bottom:1.25rem}
	.search-form{display:flex;gap:.5rem;margin-bottom:2rem;flex-wrap:wrap}
	.search-input{flex:1 1 200px;min-width:0;padding:.65rem 1rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-md);color:var(--color-text-primary);font-family:inherit;font-size:.95rem}
	.search-input:focus{outline:none;border-color:var(--color-brand-500)}
	.status{color:var(--color-text-muted);text-align:center;padding:2rem}
	.result-count{font-size:.85rem;color:var(--color-text-muted);margin-bottom:1.5rem}
	.result-section{margin-bottom:2rem}
	.result-section h2{font-size:1rem;font-weight:600;margin-bottom:.75rem;color:var(--color-text-secondary)}
	.result-item{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;text-decoration:none;margin-bottom:.5rem;transition:transform .15s, border-color .2s;flex-wrap:wrap}
	.result-item:hover{transform:translateX(4px);border-color:rgba(255,255,255,.12)}
	.result-type{font-size:.72rem;font-weight:600;color:var(--color-brand-400);min-width:60px;text-transform:uppercase}
	.result-title{font-size:.9rem;color:var(--color-text-primary);word-break:break-word}
	.result-info{display:flex;flex-direction:column;gap:.15rem;flex:1;min-width:0}
	.result-sub{font-size:.75rem;color:var(--color-text-muted)}
	.badge-album{color:#c084fc}
	.badge-track{color:#60a5fa}
	.result-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0}
	.result-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}

	/* Community Discovery */
	.community-section {
		margin-top: 2.5rem;
		padding-top: 2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.community-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.1rem;
	}
	.community-head h2 {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}
	.community-sub {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin: 0;
	}
	.community-filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		width: 100%;
		max-width: 360px;
	}
	.community-filter-input {
		flex: 1 1 180px;
		min-width: 0;
		padding: 0.48rem 0.85rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.82rem;
	}
	.filter-btn {
		padding: 0.48rem 0.9rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.12);
		color: #fbbf24;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}
	.sort-tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}
	.sort-tab {
		padding: 0.45rem 0.95rem;
		border-radius: 99px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		color: var(--color-text-secondary);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.sort-tab:hover {
		border-color: rgba(251, 191, 36, 0.35);
	}
	.sort-tab.active {
		background: rgba(251, 191, 36, 0.16);
		border-color: #fbbf24;
		color: #fbbf24;
	}

	.community-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 1rem;
	}
	.reader-card {
		padding: 1.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: transform 0.18s, border-color 0.18s;
	}
	.reader-card:hover {
		transform: translateY(-2px);
		border-color: rgba(251, 191, 36, 0.32);
	}
	.rc-top {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.rc-avatar-btn {
		position: relative;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}
	.rc-avatar, .rc-avatar-ph {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
	}
	.rc-avatar-ph {
		background: linear-gradient(135deg, #0c713d, #fbbf24);
		color: #fff;
		font-weight: 800;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.rc-online {
		position: absolute;
		bottom: 1px;
		right: 1px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #22c55e;
		border: 2px solid var(--color-surface-100);
	}
	.rc-identity {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.rc-name {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--color-text-primary);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rc-name:hover { color: #fbbf24; }
	.rc-handle {
		font-size: 0.74rem;
		color: var(--color-text-muted);
	}
	.rc-rank {
		margin-top: 2px;
		font-size: 0.68rem;
		font-weight: 600;
		color: #fbbf24;
	}
	.rc-bio {
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--color-text-secondary);
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		min-height: 2.3rem;
	}
	.rc-bio.muted {
		color: var(--color-text-muted);
		font-style: italic;
	}
	.rc-stats {
		display: flex;
		justify-content: space-between;
		padding: 0.45rem 0.65rem;
		border-radius: 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		font-size: 0.74rem;
		color: var(--color-text-secondary);
	}
	.rc-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: auto;
	}
	.rc-btn {
		flex: 1;
		padding: 0.42rem 0.65rem;
		border-radius: 0.55rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text-secondary);
		font-size: 0.76rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.rc-btn:hover {
		border-color: #fbbf24;
		color: #fbbf24;
	}
	.rc-btn.primary {
		background: rgba(12, 113, 61, 0.2);
		border-color: rgba(12, 113, 61, 0.45);
		color: #4ade80;
	}
	.rc-btn.primary:hover {
		background: rgba(12, 113, 61, 0.35);
	}
</style>
