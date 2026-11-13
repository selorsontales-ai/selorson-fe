<script lang="ts">
	/**
	 * Interactive 2D Cartographic Atlas (`WorldAtlas2D.svelte`)
	 *
	 * Serves both as an on-demand 2D Equirectangular Map mode (`🗺️ Atlas 2D`) for
	 * Akunalia, Multi-Era Earth, and Eldarin Prism Core, and as the automatic
	 * fallback when WebGL is unavailable (`quality.tier === 'none'`).
	 */
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		fetchEarthContinentGeometry,
		fetchRegionGeometry,
		isPlaced,
		type RegionFeature
	} from '../api';
	import { CELESTIAL_BODIES, type CelestialBodyId, type WorldTimeline } from '../cosmos';
	import type { WorldMap, WorldNode } from '../types';
	import {
		computeAtlasLabelPlacements,
		geoJsonGeometryToSvgPath,
		isExploredState,
		isUnlockedState,
		latLngToSvgPoint,
		resolveWorldNodeTargetUrl
	} from '../world-utils';

	interface Props {
		world: WorldMap;
		activePlanet?: CelestialBodyId;
		akunaliaRegions?: WorldNode[];
		akunaliaLocations?: WorldNode[];
		earthNodes?: Array<WorldNode & { lat: number; lng: number }>;
		timeline?: WorldTimeline;
		unshieldedTimeline2?: boolean;
		selected: WorldNode | null;
		hovered: WorldNode | null;
		onselect: (node: WorldNode | null) => void;
		onhover: (node: WorldNode | null) => void;
		onenter: (node: WorldNode) => void;
	}

	let {
		world,
		activePlanet = 'akunalia',
		akunaliaRegions,
		akunaliaLocations,
		earthNodes = [],
		timeline = 1,
		unshieldedTimeline2 = false,
		selected,
		hovered,
		onselect,
		onhover,
		onenter
	}: Props = $props();

	const MAP_W = 1000;
	const MAP_H = 500;
	const LAT_LINES = [-60, -30, 0, 30, 60];
	const LNG_LINES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

	let cartoPlanet = $derived<'akunalia' | 'earth'>(
		CELESTIAL_BODIES[activePlanet]?.sector === 'solar_system' ? 'earth' : 'akunalia'
	);

	let features = $state<RegionFeature[]>([]);
	let earthContinents = $state<RegionFeature[]>([]);
	let zoom = $state(1);

	onMount(async () => {
		const [geo, earthGeo] = await Promise.all([
			fetchRegionGeometry(),
			fetchEarthContinentGeometry()
		]);
		if (geo?.features) {
			features = geo.features;
		}
		if (earthGeo?.features) {
			earthContinents = earthGeo.features;
		}
	});

	let activeRegionList = $derived(akunaliaRegions ?? world.regions);
	let activeLocationList = $derived(akunaliaLocations ?? world.locations);

	let placedRegions = $derived(
		cartoPlanet === 'akunalia'
			? activeRegionList.filter(isPlaced).filter((n) => n.state !== 'hidden')
			: earthNodes.filter((n) => n.kind === 'region' && n.state !== 'hidden')
	);
	let placedLocations = $derived(
		cartoPlanet === 'akunalia'
			? activeLocationList.filter(isPlaced).filter((n) => n.state !== 'hidden')
			: earthNodes.filter((n) => n.kind !== 'region' && n.state !== 'hidden')
	);

	let olympusPt = $derived(latLngToSvgPoint(40.09, 22.36, MAP_W, MAP_H));
	let meruPt = $derived(latLngToSvgPoint(28.65, 81.2, MAP_W, MAP_H));

	let regionCenterBySlug = $derived.by(() => {
		const map = new Map<string, { x: number; y: number; node: WorldNode }>();
		for (const r of placedRegions) {
			const pt = latLngToSvgPoint(r.lat, r.lng, MAP_W, MAP_H);
			map.set(r.slug, { ...pt, node: r });
		}
		return map;
	});

	let regionSpokes = $derived.by(() => {
		const lines: Array<{
			id: string;
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			active: boolean;
		}> = [];
		for (const loc of placedLocations) {
			if (!loc.region) continue;
			const parent = regionCenterBySlug.get(loc.region);
			if (!parent) continue;
			const childPt = latLngToSvgPoint(loc.lat, loc.lng, MAP_W, MAP_H);
			const active =
				selected?.id === loc.id ||
				selected?.slug === loc.region ||
				hovered?.id === loc.id;
			lines.push({
				id: `${parent.node.id}-${loc.id}`,
				x1: parent.x,
				y1: parent.y,
				x2: childPt.x,
				y2: childPt.y,
				active
			});
		}
		return lines;
	});

	function pinColor(node: WorldNode, isSel: boolean, isHov: boolean): string {
		if (isSel || isHov) return '#ffb703';
		if (isExploredState(node.state)) return '#34d399';
		if (isUnlockedState(node.state)) return node.color ?? node.palette?.[0] ?? '#00f0ff';
		return node.is_singularity ? (node.color ?? '#64748b') : '#64748b';
	}

	function selectByRegionSlug(slug: string) {
		const match = activeRegionList.find((r) => r.slug === slug && r.state !== 'hidden');
		if (match) onselect(match);
	}

	let invZoomScale = $derived(1 / Math.pow(Math.max(1, zoom), 0.55));

	let labelPlacements = $derived.by(() => {
		const activeIds = new Set<number>();
		if (selected) activeIds.add(selected.id);
		if (hovered) activeIds.add(hovered.id);
		return computeAtlasLabelPlacements({
			regions: placedRegions,
			locations: placedLocations,
			zoom,
			mapWidth: MAP_W,
			mapHeight: MAP_H,
			activeIds,
			unknownFallback: m.world_unknown_place()
		});
	});
</script>

<div class="atlas-stage" class:has-selection={Boolean(selected)}>
	<div class="atlas-canvas-wrap">
		<div class="atlas-zoom-controls" aria-label={m.watlas_2d_map_zoom_controls()}>
			<button
				type="button"
				class="zoom-btn"
				onclick={() => (zoom = Math.min(2.4, +(zoom + 0.35).toFixed(2)))}
				title={m.watlas_zoom_in()}
			>
				＋
			</button>
			<button
				type="button"
				class="zoom-btn"
				onclick={() => (zoom = 1)}
				title={m.watlas_reset_to_100()}
			>
				{Math.round(zoom * 100)}%
			</button>
			<button
				type="button"
				class="zoom-btn"
				onclick={() => (zoom = Math.max(1, +(zoom - 0.35).toFixed(2)))}
				title={m.watlas_zoom_out()}
			>
				－
			</button>
		</div>

		<div class="svg-scroll-viewport">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				class="atlas-svg"
				viewBox="0 0 {MAP_W} {MAP_H}"
				style="transform: scale({zoom}); transform-origin: center center;"
				onclick={() => onselect(null)}
			>
				<defs>
					<radialGradient id="akunaliaOcean" cx="50%" cy="50%" r="70%">
						<stop offset="0%" stop-color="#0d2238" />
						<stop offset="60%" stop-color="#071324" />
						<stop offset="100%" stop-color="#030811" />
					</radialGradient>
					<radialGradient id="earthBlueMarbleBg" cx="50%" cy="50%" r="72%">
						<stop offset="0%" stop-color="#092638" />
						<stop offset="55%" stop-color="#061726" />
						<stop offset="100%" stop-color="#020710" />
					</radialGradient>
					<filter id="pinGlow" x="-40%" y="-40%" width="180%" height="180%">
						<feGaussianBlur stdDeviation="3" result="blur" />
						<feMerge>
							<feMergeNode in="blur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
					<clipPath id="atlasRoundClip">
						<rect x="0" y="0" width={MAP_W} height={MAP_H} rx="14" />
					</clipPath>
				</defs>

				<!-- Planet-specific background + 4K Cartographic Relief Map -->
				<rect
					x="0"
					y="0"
					width={MAP_W}
					height={MAP_H}
					fill={cartoPlanet === 'earth' ? 'url(#earthBlueMarbleBg)' : 'url(#akunaliaOcean)'}
					rx="14"
				/>
				<image
					href={cartoPlanet === 'earth'
						? '/world/data/earth-albedo-4k.jpg'
						: '/world/data/akunalia-albedo-4k.jpg'}
					x="0"
					y="0"
					width={MAP_W}
					height={MAP_H}
					preserveAspectRatio="none"
					opacity="0.62"
					clip-path="url(#atlasRoundClip)"
				/>

				<!-- Cartographic graticule grid -->
				{#each LAT_LINES as lat (lat)}
					{@const y = ((90 - lat) / 180) * MAP_H}
					<line
						x1="0"
						y1={y}
						x2={MAP_W}
						y2={y}
						stroke={lat === 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(148, 163, 184, 0.11)'}
						stroke-dasharray={lat === 0 ? undefined : '4 6'}
						stroke-width={lat === 0 ? '1.2' : '0.8'}
					/>
					<text x="10" y={y - 4} class="grid-label">
						{lat === 0 ? m.watlas_0_equator() : `${lat > 0 ? `+${lat}°N` : `${lat}°S`}`}
					</text>
				{/each}

				{#each LNG_LINES as lng (lng)}
					{@const x = ((lng + 180) / 360) * MAP_W}
					<line
						x1={x}
						y1="0"
						x2={x}
						y2={MAP_H}
						stroke={lng === 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(148, 163, 184, 0.1)'}
						stroke-dasharray={lng === 0 ? undefined : '4 6'}
						stroke-width={lng === 0 ? '1.1' : '0.8'}
					/>
					<text x={x + 4} y={MAP_H - 8} class="grid-label">
						{lng === 0 ? '0°' : `${lng > 0 ? `+${lng}°E` : `${lng}°W`}`}
					</text>
				{/each}

				{#if cartoPlanet === 'akunalia'}
					<!-- Region GeoJSON Polygons -->
					{#each features as feat, idx (feat.properties?.region ?? idx)}
						{@const pathD = geoJsonGeometryToSvgPath(feat.geometry, MAP_W, MAP_H)}
						{@const regionSlug = feat.properties?.region}
						{@const isSelRegion = selected?.slug === regionSlug}
						{#if pathD}
							<path
								d={pathD}
								fill={feat.properties?.color || '#0ea5e9'}
								fill-opacity={isSelRegion ? 0.32 : 0.16}
								stroke={isSelRegion ? '#ffb703' : feat.properties?.color || '#38bdf8'}
								stroke-width={isSelRegion ? '2' : '1.2'}
								class="region-poly"
								onclick={(e) => {
									e.stopPropagation();
									if (regionSlug) selectByRegionSlug(regionSlug);
								}}
							/>
						{/if}
					{/each}
				{:else}
					<!-- Earth Continental Outlines -->
					{#each earthContinents as feat, idx (feat.properties?.region ?? idx)}
						{@const pathD = geoJsonGeometryToSvgPath(feat.geometry, MAP_W, MAP_H)}
						{#if pathD}
							<path
								d={pathD}
								fill={timeline === 2 ? 'rgba(52, 211, 153, 0.14)' : 'rgba(56, 189, 248, 0.14)'}
								stroke={timeline === 2 ? 'rgba(52, 211, 153, 0.52)' : 'rgba(56, 189, 248, 0.52)'}
								stroke-width="1.05"
							/>
						{/if}
					{/each}
					{#if timeline === 2 && unshieldedTimeline2}
						<!-- Cross-spacetime 500-year trajectory: Olympus (~800 BCE) -> Mount Meru (~300 BCE) -->
						<path
							d="M {olympusPt.x} {olympusPt.y} Q {(olympusPt.x + meruPt.x) * 0.5} {Math.min(olympusPt.y, meruPt.y) - 56} {meruPt.x} {meruPt.y}"
							fill="none"
							stroke="#fbbf24"
							stroke-width="2.4"
							stroke-dasharray="5 4"
							filter="url(#pinGlow)"
						/>
					{/if}
				{/if}

					<!-- Spokes connecting regions to their child places -->
					{#each regionSpokes as spoke (spoke.id)}
						<line
							x1={spoke.x1}
							y1={spoke.y1}
							x2={spoke.x2}
							y2={spoke.y2}
							stroke={spoke.active ? 'rgba(255, 183, 3, 0.65)' : 'rgba(56, 189, 248, 0.22)'}
							stroke-width={spoke.active ? '1.5' : '0.9'}
							stroke-dasharray="3 4"
						/>
					{/each}

					<!-- Location & Singularity pins -->
					{#each placedLocations as loc (loc.id)}
						{@const pt = latLngToSvgPoint(loc.lat, loc.lng, MAP_W, MAP_H)}
						{@const isSel = selected?.id === loc.id}
						{@const isHov = hovered?.id === loc.id}
						{@const color = pinColor(loc, isSel, isHov)}
						{@const lbl = labelPlacements.get(loc.id)}
						<g
							class="map-pin location-pin"
							transform="translate({pt.x}, {pt.y})"
							onclick={(e) => {
								e.stopPropagation();
								onselect(loc);
							}}
							ondblclick={(e) => {
								e.stopPropagation();
								if (isUnlockedState(loc.state)) onenter(loc);
							}}
							onpointerenter={() => onhover(loc)}
							onpointerleave={() => onhover(null)}
						>
							{#if isSel || isHov}
								<circle
									r={14 * invZoomScale}
									fill="none"
									stroke="#ffb703"
									stroke-width={1.6 * invZoomScale}
									opacity="0.85"
								/>
							{/if}
							{#if loc.is_singularity}
								<polygon
									points="0,{-7.5 * invZoomScale} {6.5 * invZoomScale},0 0,{7.5 * invZoomScale} {-6.5 * invZoomScale},0"
									fill={color}
									stroke="#040d1a"
									stroke-width={1.4 * invZoomScale}
									filter="url(#pinGlow)"
								/>
							{:else}
								<circle
									r={(isSel ? 6.2 : 4.8) * invZoomScale}
									fill={color}
									stroke="#040d1a"
									stroke-width={1.4 * invZoomScale}
									filter="url(#pinGlow)"
								/>
							{/if}
							{#if lbl}
								{#if lbl.leader}
									<line
										x1="0"
										y1="0"
										x2={lbl.dx * 0.72}
										y2={lbl.dy * 0.72}
										stroke={isSel || isHov ? 'rgba(255, 183, 3, 0.75)' : 'rgba(148, 163, 184, 0.45)'}
										stroke-width={0.9 * invZoomScale}
									/>
								{/if}
								<text
									x={lbl.dx}
									y={lbl.dy}
									text-anchor={lbl.anchor}
									class="pin-label"
									class:active={isSel || isHov}
									style="font-size: {(isSel || isHov ? 11.2 : 10.2) * invZoomScale}px;"
								>
									{lbl.text}
								</text>
							{/if}
						</g>
					{/each}

					<!-- Region anchor nodes -->
					{#each placedRegions as reg (reg.id)}
						{@const pt = latLngToSvgPoint(reg.lat, reg.lng, MAP_W, MAP_H)}
						{@const isSel = selected?.id === reg.id}
						{@const isHov = hovered?.id === reg.id}
						{@const color = pinColor(reg, isSel, isHov)}
						{@const lbl = labelPlacements.get(reg.id)}
						<g
							class="map-pin region-pin"
							transform="translate({pt.x}, {pt.y})"
							onclick={(e) => {
								e.stopPropagation();
								onselect(reg);
							}}
							ondblclick={(e) => {
								e.stopPropagation();
								if (isUnlockedState(reg.state)) onenter(reg);
							}}
							onpointerenter={() => onhover(reg)}
							onpointerleave={() => onhover(null)}
						>
							<circle
								r={(isSel ? 15 : 12) * invZoomScale}
								fill="rgba(4, 13, 26, 0.78)"
								stroke={color}
								stroke-width={(isSel ? 2.3 : 1.7) * invZoomScale}
							/>
							<polygon
								points="0,{-6.5 * invZoomScale} {6.5 * invZoomScale},0 0,{6.5 * invZoomScale} {-6.5 * invZoomScale},0"
								fill={color}
								filter="url(#pinGlow)"
							/>
							{#if lbl}
								{#if lbl.leader}
									<line
										x1="0"
										y1="0"
										x2={lbl.dx * 0.75}
										y2={lbl.dy * 0.75}
										stroke={isSel || isHov ? 'rgba(255, 183, 3, 0.78)' : 'rgba(56, 189, 248, 0.45)'}
										stroke-width={1.0 * invZoomScale}
									/>
								{/if}
								<text
									x={lbl.dx}
									y={lbl.dy}
									text-anchor={lbl.anchor}
									class="region-label"
									class:active={isSel || isHov}
									style="font-size: {11.6 * invZoomScale}px;"
								>
									{lbl.text}
								</text>
							{/if}
						</g>
					{/each}
			</svg>
		</div>

		<!-- Map Legend & Quick Actions Footer -->
		<div class="atlas-legend">
			<span class="legend-item">
				<span class="dot region-dot"></span> {m.world_regions()} ({placedRegions.length})
			</span>
			<span class="legend-item">
				<span class="dot revealed-dot"></span> {m.watlas_revealed()}
			</span>
			<span class="legend-item">
				<span class="dot explored-dot"></span> {m.rhud_explored()}
			</span>
			<span class="legend-item">
				<span class="dot rumored-dot"></span> {m.watlas_rumored()}
			</span>
			{#if selected && isUnlockedState(selected.state)}
				<a
					href={selected.id < 0 && selected.chapters?.length
						? `/stories/${selected.chapters[0]}`
						: resolveWorldNodeTargetUrl(selected)}
					class="legend-enter-link"
				>
					🚀 {m.watlas_go_to()} {selected.name} →
				</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.atlas-stage {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4.25rem 1.25rem 8.5rem 20.25rem;
		background: radial-gradient(ellipse at center, #081526 0%, #030710 100%);
		overflow: hidden;
		transition: padding-right 0.2s ease;
	}
	.atlas-stage.has-selection {
		padding-right: 22.6rem;
	}

	.atlas-canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		max-width: 1200px;
		max-height: 680px;
		display: flex;
		flex-direction: column;
		border-radius: 1rem;
		border: 1px solid rgba(56, 189, 248, 0.22);
		background: rgba(4, 12, 24, 0.85);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
		overflow: hidden;
	}

	.atlas-zoom-controls {
		position: absolute;
		top: 0.85rem;
		right: 0.85rem;
		z-index: 5;
		display: flex;
		gap: 0.35rem;
		background: rgba(6, 14, 26, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.6rem;
		padding: 0.25rem;
		backdrop-filter: blur(10px);
	}

	.zoom-btn {
		background: transparent;
		border: 1px solid transparent;
		color: #e2e8f0;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.28rem 0.55rem;
		border-radius: 0.4rem;
		cursor: pointer;
	}
	.zoom-btn:hover {
		background: rgba(56, 189, 248, 0.15);
		border-color: rgba(56, 189, 248, 0.35);
	}

	.svg-scroll-viewport {
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.atlas-svg {
		width: 100%;
		height: 100%;
		max-height: 100%;
		transition: transform 0.2s ease;
		user-select: none;
	}

	.grid-label {
		fill: rgba(148, 163, 184, 0.42);
		font-size: 9px;
		font-family: monospace;
		pointer-events: none;
	}

	.region-poly {
		cursor: pointer;
		transition: fill-opacity 0.2s, stroke-width 0.2s;
	}
	.region-poly:hover {
		fill-opacity: 0.28;
	}

	.map-pin {
		cursor: pointer;
	}

	.pin-label {
		fill: #cbd5e1;
		font-size: 10.5px;
		font-weight: 500;
		paint-order: stroke;
		stroke: rgba(3, 8, 18, 0.92);
		stroke-width: 3px;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.pin-label.active {
		fill: #fde68a;
		font-size: 11.5px;
		font-weight: 700;
	}

	.region-label {
		fill: #f8fafc;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.03em;
		paint-order: stroke;
		stroke: rgba(3, 8, 18, 0.95);
		stroke-width: 3.5px;
		pointer-events: none;
	}
	.region-label.active {
		fill: #ffb703;
	}

	.atlas-legend {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: rgba(4, 10, 20, 0.92);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.78rem;
		color: #94a3b8;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
	}

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		display: inline-block;
	}
	.region-dot {
		background: #00f0ff;
		transform: rotate(45deg);
		border-radius: 2px;
	}
	.revealed-dot {
		background: #00f0ff;
	}
	.explored-dot {
		background: #34d399;
	}
	.rumored-dot {
		background: #64748b;
	}

	.legend-enter-link {
		margin-left: auto;
		color: #34d399;
		font-weight: 600;
		text-decoration: none;
	}
	.legend-enter-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 1024px) {
		.atlas-stage,
		.atlas-stage.has-selection {
			padding: 3.75rem 0.75rem 4.25rem 0.75rem;
		}
		.atlas-legend {
			gap: 0.55rem 0.85rem;
			padding: 0.5rem 0.75rem;
			font-size: 0.72rem;
		}
	}
</style>
