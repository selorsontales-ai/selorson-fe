<script lang="ts">
	/**
	 * L1 — the globe.
	 *
	 * The 3D engine is loaded with `await import()` so Three.js never enters the
	 * main bundle; devices without WebGL, and readers who prefer it, get the
	 * list view instead of a blank canvas.
	 */
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { fetchWorld, isPlaced } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { WorldMap, WorldNode } from '$lib/world/types';
	import WorldHud from '$lib/world/ui/WorldHud.svelte';
	import { onMount } from 'svelte';

	let world = $state<WorldMap | null>(null);
	let quality = $state<QualitySettings | null>(null);
	let CanvasComponent = $state<typeof import('$lib/world/engine/WorldCanvas.svelte').default | null>(
		null
	);
	let loading = $state(true);
	let failed = $state(false);

	let selected = $state<WorldNode | null>(null);
	let hovered = $state<WorldNode | null>(null);

	/** Regions and places that have coordinates; characters travel, so not here. */
	let placedNodes = $derived(
		world ? [...world.regions, ...world.locations].filter(isPlaced) : []
	);

	onMount(async () => {
		quality = resolveQuality(new URLSearchParams(location.search));

		try {
			world = await fetchWorld();
		} catch {
			failed = true;
			loading = false;
			return;
		}

		// Only pay for the engine once we know the device can run it. An empty
		// map still gets a globe — seeing the world exist is the point; the
		// "nothing placed yet" note rides on top of it.
		if (quality.tier !== 'none') {
			try {
				CanvasComponent = (await import('$lib/world/engine/WorldCanvas.svelte')).default;
			} catch {
				// Engine failed to load — the list view below still works.
				CanvasComponent = null;
			}
		}
		loading = false;
	});

	function enterRegion(node: WorldNode) {
		goto(`/world/${node.slug}`);
	}
</script>

<svelte:head><title>{m.world_seo_title()}</title></svelte:head>

<section class="world-page">
	{#if loading}
		<div class="world-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if failed || !world}
		<div class="world-msg">
			<p>{m.world_empty()}</p>
			<a class="fallback-link" href="/library">{m.world_open_library()}</a>
		</div>
	{:else if CanvasComponent && quality}
		<div class="stage">
			<CanvasComponent
				nodes={placedNodes}
				{quality}
				{selected}
				{hovered}
				onselect={(node) => (selected = node)}
				onhover={(node) => (hovered = node)}
			/>
			{#if placedNodes.length === 0}
				<div class="empty-note">
					<strong>{m.world_empty()}</strong>
					<span>{m.world_empty_hint()}</span>
				</div>
			{:else}
				<WorldHud
					regions={world.regions}
					locations={world.locations}
					progress={world.progress}
					{selected}
					onselect={(node) => (selected = node)}
					onenter={enterRegion}
				/>
			{/if}
		</div>
	{:else}
		<!-- No WebGL: the same data, as a list. Nothing is lost but the spectacle. -->
		<div class="world-msg">
			<p>{m.world_no_webgl()}</p>
			<a class="fallback-link" href="/library">{m.world_open_library()}</a>
		</div>
	{/if}
</section>

<style>
	.world-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 32rem;
		background: #02050e;
		overflow: hidden;
	}

	.stage {
		position: absolute;
		inset: 0;
	}

	.world-msg {
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
	.world-msg .muted {
		color: var(--color-text-muted, #94a3b8);
		font-size: 0.88rem;
	}

	.empty-note {
		position: absolute;
		left: 50%;
		bottom: 1.5rem;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		text-align: center;
		padding: 0.7rem 1.2rem;
		border-radius: var(--radius-lg, 12px);
		background: rgba(8, 14, 24, 0.78);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-text-secondary, #cbd5e1);
		font-size: 0.82rem;
	}
	.empty-note span {
		color: var(--color-text-muted, #94a3b8);
		font-size: 0.75rem;
	}

	.fallback-link {
		padding: 0.55rem 1.1rem;
		border: 1px solid var(--color-brand-500, #0c713d);
		border-radius: 999px;
		color: var(--color-brand-300, #4ade80);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.fallback-link:hover {
		background: rgba(12, 113, 61, 0.18);
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
