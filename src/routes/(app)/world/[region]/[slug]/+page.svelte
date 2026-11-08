<script lang="ts">
	/**
	 * L3 — a single place, taken apart.
	 *
	 * Arriving here counts as exploring it: the visit is recorded once the data
	 * loads, which is what turns the place's `revealed` badge into `explored`.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { fetchLocation, markVisited } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { LocationDetail, ScenePart } from '$lib/world/types';
	import LocationHud from '$lib/world/ui/LocationHud.svelte';
	import { onMount } from 'svelte';

	let slug = $derived(page.params.slug ?? '');

	let detail = $state<LocationDetail | null>(null);
	let quality = $state<QualitySettings | null>(null);
	let CanvasComponent = $state<
		typeof import('$lib/world/engine/LocationCanvas.svelte').default | null
	>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let parts = $state<ScenePart[]>([]);
	let explode = $state(0);
	let detached = $state<string[]>([]);
	let selectedPart = $state<string | null>(null);
	let xray = $state(false);
	let loadedSlug = $state<string | null>(null);

	async function loadLocationData(targetSlug: string) {
		if (!targetSlug) return;
		loading = true;
		notFound = false;
		parts = [];
		explode = 0;
		detached = [];
		selectedPart = null;
		xray = false;

		const resolvedQuality = quality ?? resolveQuality(new URLSearchParams(location.search));
		quality = resolvedQuality;
		const canvasPromise =
			CanvasComponent !== null
				? Promise.resolve(CanvasComponent)
				: resolvedQuality.tier !== 'none'
					? import('$lib/world/engine/LocationCanvas.svelte')
							.then((module) => module.default)
							.catch(() => null)
					: Promise.resolve(null);

		try {
			const [loadedDetail, canvas] = await Promise.all([
				fetchLocation(targetSlug),
				canvasPromise
			]);
			detail = loadedDetail;
			CanvasComponent = canvas;
			loadedSlug = targetSlug;
			// Fire and forget: failing to earn a badge must not block the scene.
			void markVisited(loadedDetail.place.id);
		} catch {
			notFound = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadLocationData(slug);
	});

	$effect(() => {
		const currentSlug = slug;
		if (loadedSlug !== null && currentSlug && currentSlug !== loadedSlug) {
			void loadLocationData(currentSlug);
		}
	});

	function toggleDetach(id: string) {
		detached = detached.includes(id) ? detached.filter((d) => d !== id) : [...detached, id];
	}
</script>

<svelte:head>
	<title>{detail?.place.name ?? m.world_title()} — Selorson</title>
</svelte:head>

<section class="place-page">
	{#if loading}
		<div class="place-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if notFound || !detail}
		<div class="place-msg">
			<p>{m.world_place_not_found()}</p>
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else}
		<div class="stage">
			{#if CanvasComponent && quality && quality.tier !== 'none'}
				{#key detail.place.id}
					<CanvasComponent
						node={detail.place}
						{quality}
						{explode}
						{detached}
						{selectedPart}
						{xray}
						onparts={(list) => (parts = list)}
						onselectpart={(id) => (selectedPart = id)}
					/>
				{/key}
			{:else}
				<div class="place-2d-backdrop">
					{#if detail.place.image_url}
						<img src={detail.place.image_url} alt={detail.place.name ?? ''} class="backdrop-img" />
					{/if}
				</div>
			{/if}
			<LocationHud
				place={detail.place}
				region={detail.region}
				neighbours={detail.neighbours}
				chapters={detail.chapters}
				visitors={detail.visitors ?? []}
				linkedItems={detail.linked_items ?? []}
				{parts}
				{explode}
				{detached}
				{selectedPart}
				{xray}
				onexplode={(v) => (explode = v)}
				ontoggledetach={toggleDetach}
				onselectpart={(id) => (selectedPart = id)}
				onxray={(v) => (xray = v)}
			/>
		</div>
	{/if}
</section>

<style>
	.place-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 32rem;
		background: #060d15;
		overflow: hidden;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	.place-2d-backdrop {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, #0d1f33 0%, #060d15 100%);
	}
	.backdrop-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.28;
	}
	.place-msg {
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
