<script lang="ts">
	/** L2 — a single region. Same load-on-demand shape as the globe page. */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { fetchRegion, markVisited } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { RegionDetail, WorldNode } from '$lib/world/types';
	import RegionHud from '$lib/world/ui/RegionHud.svelte';
	import { findNodeByFocusParam } from '$lib/world/world-utils';
	import { onMount } from 'svelte';

	let slug = $derived(page.params.region ?? '');

	let detail = $state<RegionDetail | null>(null);
	let quality = $state<QualitySettings | null>(null);
	let CanvasComponent = $state<
		typeof import('$lib/world/engine/RegionCanvas.svelte').default | null
	>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let selected = $state<WorldNode | null>(null);
	let hovered = $state<WorldNode | null>(null);
	let loadedSlug = $state<string | null>(null);

	async function loadRegionData(targetSlug: string) {
		if (!targetSlug) return;
		loading = true;
		notFound = false;
		selected = null;
		hovered = null;

		const params = new URLSearchParams(location.search);
		const resolvedQuality = quality ?? resolveQuality(params);
		quality = resolvedQuality;
		const canvasPromise =
			CanvasComponent !== null
				? Promise.resolve(CanvasComponent)
				: resolvedQuality.tier !== 'none'
					? import('$lib/world/engine/RegionCanvas.svelte')
							.then((module) => module.default)
							.catch(() => null)
					: Promise.resolve(null);

		try {
			const [loadedDetail, canvas] = await Promise.all([
				fetchRegion(targetSlug),
				canvasPromise
			]);
			detail = loadedDetail;
			CanvasComponent = canvas;
			loadedSlug = targetSlug;
			void markVisited(loadedDetail.region.id);

			const focusParam = params.get('focus') ?? params.get('id');
			if (focusParam) {
				const matched = findNodeByFocusParam(loadedDetail.places, focusParam);
				if (matched && matched.state !== 'hidden') {
					selected = matched;
				}
			}
		} catch {
			notFound = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadRegionData(slug);
	});

	$effect(() => {
		const currentSlug = slug;
		if (loadedSlug !== null && currentSlug && currentSlug !== loadedSlug) {
			void loadRegionData(currentSlug);
		}
	});
</script>

<svelte:head>
	<title>{detail?.region.name ?? m.world_title()} — Selorson</title>
</svelte:head>

<section class="region-page">
	{#if loading}
		<div class="region-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if notFound || !detail}
		<div class="region-msg">
			<p>{m.world_region_not_found()}</p>
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else}
		<div class="stage">
			{#if CanvasComponent && quality && quality.tier !== 'none'}
				{#key detail.region.id}
					<CanvasComponent
						region={detail.region}
						places={detail.places}
						{quality}
						{selected}
						{hovered}
						onselect={(node) => (selected = node)}
						onhover={(node) => (hovered = node)}
					/>
				{/key}
			{:else}
				<div class="region-2d-backdrop">
					{#if detail.region.image_url}
						<img src={detail.region.image_url} alt={detail.region.name ?? ''} class="backdrop-img" />
					{/if}
					<div class="backdrop-card">
						<h2>🗺️ {detail.region.name}</h2>
						{#if detail.region.description}
							<p>{detail.region.description}</p>
						{/if}
					</div>
				</div>
			{/if}
			<RegionHud
				region={detail.region}
				places={detail.places}
				visitors={detail.visitors}
				{selected}
				onselect={(node) => (selected = node)}
			/>
		</div>
	{/if}
</section>

<style>
	.region-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 32rem;
		background: #04101a;
		overflow: hidden;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	.region-2d-backdrop {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: clamp(3.5rem, 6vw, 5rem) clamp(1rem, 16vw, 21rem);
		background: radial-gradient(ellipse at center, #0c2238 0%, #04101a 100%);
	}
	@media (max-width: 1024px) {
		.region-2d-backdrop {
			padding: 4rem 1rem 2rem;
		}
	}
	.backdrop-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.22;
		filter: blur(4px);
	}
	.backdrop-card {
		position: relative;
		z-index: 2;
		max-width: 34rem;
		padding: 1.5rem;
		border-radius: 14px;
		background: rgba(8, 16, 28, 0.84);
		border: 1px solid rgba(56, 189, 248, 0.2);
		color: #e2e8f0;
		text-align: center;
	}
	.backdrop-card h2 {
		margin: 0 0 0.6rem;
		font-size: 1.35rem;
	}
	.backdrop-card p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.65;
		color: #cbd5e1;
	}
	.region-msg {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary, #cbd5e1);
	}
	.fallback-link {
		padding: 0.55rem 1.1rem;
		border: 1px solid var(--color-brand-500, #0c713d);
		border-radius: 999px;
		color: var(--color-brand-300, #4ade80);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.spinner {
		width: 1.6rem;
		height: 1.6rem;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: var(--color-brand-500, #0c713d);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
