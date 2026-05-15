<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	const categories = [
		{ key: '', label: 'Tất cả', icon: '📚' },
		{ key: 'location', label: 'Địa điểm', icon: '🗺️' },
		{ key: 'main_character', label: 'Nhân vật chính', icon: '⭐' },
		{ key: 'side_character', label: 'Nhân vật phụ', icon: '👤' },
		{ key: 'item', label: 'Vật phẩm', icon: '🔮' },
		{ key: 'lore', label: 'Truyền thuyết', icon: '📜' },
	];

	let items = $state<any[]>([]);
	let loading = $state(true);
	let activeCategory = $state('');

	async function fetchItems(cat = '') {
		loading = true;
		activeCategory = cat;
		try {
			const url = cat ? `/library?category=${cat}` : '/library';
			const res = await api<any>(url);
			items = res.data || [];
		} catch { items = []; }
		loading = false;
	}

	onMount(() => fetchItems());
</script>

<svelte:head><title>Thư viện — Selorson</title></svelte:head>

<section class="lib-page">
	<div class="page-header">
		<h1 class="section-title">Thư viện</h1>
		<p class="page-sub">Bách khoa toàn thư thế giới Selorson</p>
	</div>

	<div class="filters">
		{#each categories as cat}
			<button class="filter-btn" class:active={activeCategory === cat.key} onclick={() => fetchItems(cat.key)}>
				{cat.icon} {cat.label}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="grid">{#each Array(6) as _}<div class="skel"></div>{/each}</div>
	{:else if items.length === 0}
		<div class="empty"><span>📚</span><h3>Chưa có mục nào</h3></div>
	{:else}
		<div class="grid">
			{#each items as item}
				<div class="glass-card item-card">
					{#if item.image_url}
						<div class="item-img"><img src={item.image_url} alt={item.name}/></div>
					{/if}
					<div class="item-body">
						<span class="item-cat">{item.category}</span>
						<h3>{item.name}</h3>
						{#if item.description}
							<p>{item.description}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.lib-page{max-width:1100px;margin:0 auto;padding:3rem 1.5rem 6rem}
	.page-header{text-align:center;margin-bottom:2rem}
	.page-sub{color:var(--color-text-muted);margin-top:.5rem}
	.filters{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin-bottom:2.5rem}
	.filter-btn{padding:.45rem .9rem;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:transparent;color:var(--color-text-muted);font-size:.82rem;cursor:pointer;transition:all .2s;font-family:inherit}
	.filter-btn:hover{border-color:var(--color-brand-500);color:var(--color-text-primary)}
	.filter-btn.active{background:rgba(12,113,61,.15);border-color:var(--color-brand-500);color:var(--color-brand-300);font-weight:600}
	.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.25rem}
	.item-card{padding:0;overflow:hidden}
	.item-img{aspect-ratio:1;background:var(--color-surface-200);overflow:hidden}
	.item-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s var(--ease-spring)}
	.item-card:hover .item-img img{transform:scale(1.05)}
	.item-body{padding:1.25rem}
	.item-cat{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--color-accent-purple);padding:.15rem .4rem;background:rgba(139,92,246,.1);border-radius:3px}
	.item-body h3{font-size:1rem;font-weight:600;margin:.5rem 0 .25rem}
	.item-body p{font-size:.82rem;color:var(--color-text-muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
	.skel{aspect-ratio:3/4;background:linear-gradient(90deg,var(--color-surface-200) 25%,var(--color-surface-300) 50%,var(--color-surface-200) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--radius-lg)}
	.empty{text-align:center;padding:4rem 1rem;color:var(--color-text-muted)}
	.empty span{font-size:3rem;display:block;margin-bottom:1rem}
	.empty h3{font-size:1.2rem;color:var(--color-text-secondary)}
</style>
