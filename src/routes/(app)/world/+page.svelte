<script lang="ts">
	/**
	 * Chặng 1A — Dual-Sector Dynamic Reference-Frame Cosmos (`Tinh Vực Akunalia` ↔ `Hệ Mặt Trời`),
	 * Living 3D Globe (`Tầng 1`) & 2D Cartographic Atlas.
	 *
	 * The 3D engine is loaded with `await import()` so Three.js never enters the
	 * main bundle; devices without WebGL, and readers who toggle `🗺️ Atlas 2D`,
	 * get the interactive 2D equirectangular map (`WorldAtlas2D`) with the full HUD.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { IS_ADMIN_FLAVOR } from '$lib/app-flavor';
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import { isDesktop } from '$lib/platform';
	import { fetchWorld, isPlaced } from '$lib/world/api';
	import {
		CELESTIAL_BODIES,
		COSMIC_SECTORS,
		WORLD_ERAS,
		alignNodeWithCanonCoordinates,
		buildAkunaliaCanonNodes,
		buildCanonCharacters,
		buildEarthSingularityNodes,
		filterNodesForPlanetAndEra,
		isCelestialBodyId,
		isCosmicSectorId,
		isTimeline2Unshielded,
		resolveNodePlanet,
		type CelestialBodyId,
		type CosmicSectorId,
		type WorldTier,
		type WorldTimeline
	} from '$lib/world/cosmos';
	import { resolveQuality, type QualitySettings } from '$lib/world/quality';
	import type { WorldMap, WorldNode } from '$lib/world/types';
	import WorldAtlas2D from '$lib/world/ui/WorldAtlas2D.svelte';
	import WorldHud from '$lib/world/ui/WorldHud.svelte';
	import WorldOpenRealm from '$lib/world/ui/WorldOpenRealm.svelte';
	import {
		findNodeByFocusParam,
		getLocalHighestReadChapter,
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
	let spaceMode = $state<'clockwork' | 'open'>('clockwork');
	let viewMode = $state<'3d' | '2d'>('3d');
	let tier = $state<WorldTier>(1);
	let activePlanet = $state<CelestialBodyId>('akunalia');
	let activeSector = $derived<CosmicSectorId>(CELESTIAL_BODIES[activePlanet].sector);
	let eraId = $state('all');
	let timeline = $state<WorldTimeline>(1);
	let daylightMode = $state(false);
	let prismMomentActive = $state(false);
	let eraFocusLatLng = $state<{ lat: number; lng: number } | null>(null);
	let lastAppliedFocus = $state<string | null>(null);

	let locale = $derived(currentLocale());

	let effectiveReadUpTo = $derived.by(() => {
		if (IS_ADMIN_FLAVOR) return 999;
		const apiRead = world?.progress.read_up_to ?? 0;
		const localRead = getLocalHighestReadChapter();
		const maxRead = Math.max(apiRead, localRead);
		return maxRead > 0 ? maxRead : null;
	});

	let unshieldedTimeline2 = $derived(
		timeline === 2 && isTimeline2Unshielded(effectiveReadUpTo)
	);

	/** Regions and places from DB that have coordinates; characters travel, so not here. */
	let allPlacedDbNodes = $derived(
		world ? [...world.regions, ...world.locations].filter(isPlaced) : []
	);

	let allDbSlugs = $derived(
		new Set(world ? [...world.regions, ...world.locations].map((n) => n.slug) : [])
	);

	let akunaliaCanonNodes = $derived(
		buildAkunaliaCanonNodes(locale, timeline, effectiveReadUpTo, allDbSlugs)
	);

	let earthSingularityNodes = $derived(
		buildEarthSingularityNodes(locale, timeline, effectiveReadUpTo, allDbSlugs)
	);

	let akunaliaPlacedNodes = $derived(
		filterNodesForPlanetAndEra(
			[...allPlacedDbNodes, ...akunaliaCanonNodes],
			'akunalia',
			activePlanet === 'akunalia' ? eraId : 'all',
			timeline
		)
	);

	let earthPlacedNodes = $derived(
		filterNodesForPlanetAndEra(
			[...allPlacedDbNodes, ...earthSingularityNodes],
			'earth',
			activePlanet === 'earth' ? eraId : 'all',
			timeline
		)
	);

	let hudRegions = $derived(
		world
			? filterNodesForPlanetAndEra(
					activePlanet === 'akunalia'
						? [
								...world.regions,
								...akunaliaCanonNodes.filter((n) => n.kind === 'region')
							]
						: world.regions,
					activePlanet,
					eraId,
					timeline
				)
			: []
	);

	let hudLocations = $derived(
		world
			? filterNodesForPlanetAndEra(
					activePlanet === 'earth'
						? [...world.locations, ...earthSingularityNodes]
						: activePlanet === 'akunalia'
							? [
									...world.locations,
									...akunaliaCanonNodes.filter((n) => n.kind !== 'region')
								]
							: world.locations,
					activePlanet,
					eraId,
					timeline
				)
			: []
	);

	let webglAvailable = $derived(Boolean(CanvasComponent && quality && quality.tier !== 'none'));

	onMount(async () => {
		const params = new URLSearchParams(location.search);
		if (isDesktop && params.get('space') === 'open') {
			spaceMode = 'open';
		}
		if (params.get('mode') === '2d') {
			viewMode = '2d';
		}
		const sectorParam = params.get('sector')?.toLowerCase() ?? null;
		if (isCosmicSectorId(sectorParam)) {
			activePlanet = COSMIC_SECTORS[sectorParam].defaultBodyId;
		}
		const planetParam = (params.get('planet') ?? params.get('body'))?.toLowerCase() ?? null;
		if (isCelestialBodyId(planetParam)) {
			activePlanet = planetParam;
		}
		const tierParam = params.get('tier')?.toLowerCase();
		if (tierParam === '0' || tierParam === 'cosmic' || params.get('cosmic') === '1') {
			tier = 0;
		}
		const eraParam = params.get('era');
		if (eraParam) {
			eraId = eraParam;
			const matchedEra = WORLD_ERAS[activePlanet]?.find((e) => e.id === eraParam);
			if (matchedEra?.focusLatLng) {
				eraFocusLatLng = matchedEra.focusLatLng;
			}
		}
		if (params.get('timeline') === '2') {
			timeline = 2;
		}
		if (params.get('daylight') === '1' || params.get('lighting') === 'daylight') {
			daylightMode = true;
		}
		if (params.get('prism') === '1') {
			prismMomentActive = true;
		}

		const resolvedQuality = resolveQuality(params);
		quality = resolvedQuality;
		const canvasPromise =
			resolvedQuality.tier !== 'none'
				? import('$lib/world/engine/WorldCanvas.svelte')
						.then((module) => module.default)
						.catch(() => null)
				: Promise.resolve(null);

		const offlineFallback: WorldMap = {
			regions: [],
			locations: [],
			characters: [],
			progress: {
				read_up_to: null,
				placed: 14,
				revealed: 6,
				explored: 0,
				explored_percent: 0,
				percent: 43,
				is_guest: true
			}
		};

		try {
			const [loadedWorld, canvas] = await Promise.all([
				fetchWorld().catch(() => offlineFallback),
				canvasPromise
			]);
			const loc = currentLocale();
			world = {
				...loadedWorld,
				regions: loadedWorld.regions.map((n) => alignNodeWithCanonCoordinates(n, loc)),
				locations: loadedWorld.locations.map((n) => alignNodeWithCanonCoordinates(n, loc)),
				characters:
					loadedWorld.characters.length > 0
						? loadedWorld.characters
						: buildCanonCharacters(loc)
			};
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

		const allNodes = [
			...world.regions,
			...world.locations,
			...akunaliaCanonNodes,
			...earthSingularityNodes
		];
		const match = findNodeByFocusParam(allNodes, focusParam);
		if (match && match.state !== 'hidden') {
			activePlanet = resolveNodePlanet(match);
			tier = 1;
			eraId = 'all';
			eraFocusLatLng = null;
			selected = match;
			return;
		}

		const charMatch = findNodeByFocusParam(world.characters, focusParam);
		if (charMatch && charMatch.state !== 'hidden') {
			goto(`/world/journey/${charMatch.id}`);
		}
	});

	function selectNode(node: WorldNode | null) {
		eraFocusLatLng = null;
		if (node) {
			activePlanet = resolveNodePlanet(node);
			tier = 1;
		}
		selected = node;
	}

	function selectPlanet(planet: CelestialBodyId) {
		activePlanet = planet;
		tier = 1;
		eraId = 'all';
		eraFocusLatLng = null;
		if (!CELESTIAL_BODIES[planet].hasNarrativeMap && viewMode === '2d') {
			viewMode = '3d';
		}
		if (selected && resolveNodePlanet(selected) !== planet) {
			selected = null;
		}
	}

	function selectSector(sector: CosmicSectorId) {
		const nextBody = COSMIC_SECTORS[sector].defaultBodyId;
		selectPlanet(nextBody);
	}

	function setCosmicTier(nextTier: WorldTier) {
		tier = nextTier;
		if (nextTier === 0) {
			selected = null;
			eraFocusLatLng = null;
		}
	}

	function selectEra(nextEra: string, focus?: { lat: number; lng: number }) {
		eraId = nextEra;
		tier = 1;
		selected = null;
		eraFocusLatLng = focus ?? null;
	}

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
			{#if isDesktop && spaceMode === 'open'}
				<WorldOpenRealm
					initialPlanet={activePlanet === 'earth' ? 'earth' : 'akunalia'}
					onspacetoggle={(nextMode) => (spaceMode = nextMode)}
				/>
			{:else}
				{#if webglAvailable && viewMode === '3d' && CanvasComponent && quality}
					<CanvasComponent
						nodes={akunaliaPlacedNodes}
						earthNodes={earthPlacedNodes}
						{quality}
						{tier}
						{activeSector}
						{activePlanet}
						{timeline}
						{unshieldedTimeline2}
						{daylightMode}
						{prismMomentActive}
						{eraFocusLatLng}
						{selected}
						{hovered}
						onselect={selectNode}
						onhover={(node) => (hovered = node)}
						onselectplanet={selectPlanet}
						onsettier={setCosmicTier}
					/>
				{:else}
					<WorldAtlas2D
						{world}
						{activePlanet}
						akunaliaRegions={hudRegions}
						akunaliaLocations={hudLocations}
						earthNodes={earthPlacedNodes}
						{timeline}
						{unshieldedTimeline2}
						{selected}
						{hovered}
						onselect={selectNode}
						onhover={(node) => (hovered = node)}
						onenter={enterNode}
					/>
				{/if}

				<WorldHud
					regions={hudRegions}
					locations={hudLocations}
					characters={world.characters}
					progress={world.progress}
					{selected}
					{spaceMode}
					viewMode={webglAvailable ? viewMode : '2d'}
					{webglAvailable}
					{tier}
					{activePlanet}
					{eraId}
					{timeline}
					{effectiveReadUpTo}
					{daylightMode}
					{prismMomentActive}
					onselect={selectNode}
					onenter={enterNode}
					onspacetoggle={(nextMode) => (spaceMode = nextMode)}
					ontogglemode={(mode) => {
						viewMode = mode;
						if (mode === '2d' && tier === 0) tier = 1;
					}}
					onsettier={setCosmicTier}
					onselectplanet={selectPlanet}
					onselectsector={selectSector}
					onselectera={selectEra}
					onsettimeline={(nextTl) => (timeline = nextTl)}
					ontoggledaylight={(enabled) => (daylightMode = enabled)}
					ontoggleprism={(enabled) => (prismMomentActive = enabled)}
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
		background: #01030a;
		overflow: hidden;
		--color-text-primary: #f1f5f9;
		--color-text-secondary: #cbd5e1;
		--color-text-muted: #94a3b8;
		color: #f1f5f9;
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
