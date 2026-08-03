<script lang="ts">
	/** L2 — a single region. Same load-on-demand shape as the globe page. */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { fetchRegion } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { RegionDetail, WorldNode } from '$lib/world/types';
	import RegionHud from '$lib/world/ui/RegionHud.svelte';
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

	onMount(async () => {
		quality = resolveQuality(new URLSearchParams(location.search));

		try {
			detail = await fetchRegion(slug);
		} catch {
			notFound = true;
			loading = false;
			return;
		}

		if (quality.tier !== 'none') {
			try {
				CanvasComponent = (await import('$lib/world/engine/RegionCanvas.svelte')).default;
			} catch {
				CanvasComponent = null;
			}
		}
		loading = false;
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
	{:else if CanvasComponent && quality}
		<div class="stage">
			<CanvasComponent
				region={detail.region}
				places={detail.places}
				{quality}
				{selected}
				{hovered}
				onselect={(node) => (selected = node)}
				onhover={(node) => (hovered = node)}
			/>
			<RegionHud
				region={detail.region}
				places={detail.places}
				visitors={detail.visitors}
				{selected}
				onselect={(node) => (selected = node)}
			/>
		</div>
	{:else}
		<div class="region-msg">
			<p>{m.world_no_webgl()}</p>
			<a class="fallback-link" href="/library">{m.world_open_library()}</a>
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
