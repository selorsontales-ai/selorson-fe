<script lang="ts">
	/**
	 * L1 — the globe & 2D Cartographic Atlas.
	 *
	 * The 3D engine is loaded with `await import()` so Three.js never enters the
	 * main bundle; devices without WebGL, and readers who toggle `🗺️ Atlas 2D`,
	 * get the interactive 2D equirectangular map (`WorldAtlas2D`) with the full HUD.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { fetchWorld, isPlaced } from '$lib/world/api';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { WorldMap, WorldNode } from '$lib/world/types';
	import WorldAtlas2D from '$lib/world/ui/WorldAtlas2D.svelte';
	import WorldHud from '$lib/world/ui/WorldHud.svelte';
	import {
		findNodeByFocusParam,
		resolveWorldNodeTargetUrl
	} from '$lib/world/world-utils';
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
	let viewMode = $state<'3d' | '2d'>('3d');
	let lastAppliedFocus = $state<string | null>(null);

	/** Regions and places that have coordinates; characters travel, so not here. */
	let placedNodes = $derived(
		world ? [...world.regions, ...world.locations].filter(isPlaced) : []
	);

	let webglAvailable = $derived(Boolean(CanvasComponent && quality && quality.tier !== 'none'));

	onMount(async () => {
		const params = new URLSearchParams(location.search);
		if (params.get('mode') === '2d') {
			viewMode = '2d';
		}
		const resolvedQuality = resolveQuality(params);
		quality = resolvedQuality;
		const canvasPromise =
			resolvedQuality.tier !== 'none'
				? import('$lib/world/engine/WorldCanvas.svelte')
						.then((module) => module.default)
						.catch(() => null)
				: Promise.resolve(null);

		try {
			const [loadedWorld, canvas] = await Promise.all([fetchWorld(), canvasPromise]);
			world = loadedWorld;
			CanvasComponent = canvas;
			if (!canvas) {
				viewMode = '2d';
			}
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	});

	// Reactively honor `?focus=` / `?id=` / `?select=` deep-links from Stories, Library, Profile, Search
	$effect(() => {
		if (!world) return;
		const searchParams = page.url?.searchParams;
		const focusParam =
			searchParams?.get('focus') ??
			searchParams?.get('id') ??
			searchParams?.get('select') ??
			null;
		if (!focusParam || focusParam === lastAppliedFocus) return;
		lastAppliedFocus = focusParam;

		const allNodes = [...world.regions, ...world.locations];
		const match = findNodeByFocusParam(allNodes, focusParam);
		if (match && match.state !== 'hidden') {
			selected = match;
			return;
		}

		const charMatch = findNodeByFocusParam(world.characters, focusParam);
		if (charMatch && charMatch.state !== 'hidden') {
			goto(`/world/journey/${charMatch.id}`);
		}
	});

	function enterNode(node: WorldNode) {
		goto(resolveWorldNodeTargetUrl(node));
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
	{:else}
		<div class="stage">
			{#if webglAvailable && viewMode === '3d' && CanvasComponent && quality}
				<CanvasComponent
					nodes={placedNodes}
					{quality}
					{selected}
					{hovered}
					onselect={(node) => (selected = node)}
					onhover={(node) => (hovered = node)}
				/>
			{:else}
				<WorldAtlas2D
					{world}
					{selected}
					{hovered}
					onselect={(node) => (selected = node)}
					onhover={(node) => (hovered = node)}
					onenter={enterNode}
				/>
			{/if}

			{#if placedNodes.length === 0 && world.characters.length === 0}
				<div class="empty-note">
					<strong>{m.world_empty()}</strong>
					<span>{m.world_empty_hint()}</span>
				</div>
			{:else}
				<WorldHud
					regions={world.regions}
					locations={world.locations}
					characters={world.characters}
					progress={world.progress}
					{selected}
					viewMode={webglAvailable ? viewMode : '2d'}
					{webglAvailable}
					onselect={(node) => (selected = node)}
					onenter={enterNode}
					ontogglemode={(mode) => (viewMode = mode)}
				/>
			{/if}
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
