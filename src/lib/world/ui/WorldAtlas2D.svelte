<script lang="ts">
	/**
	 * Interactive 2D Cartographic Atlas (`WorldAtlas2D.svelte`)
	 *
	 * Serves both as an on-demand 2D Equirectangular Map mode (`🗺️ Atlas 2D`) for
	 * readers who prefer a flat continental overview, and as the automatic fallback
	 * when WebGL is unavailable (`quality.tier === 'none'`).
	 */
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
		import { displayName, fetchRegionGeometry, isPlaced, type RegionFeature } from '../api';
	import type { WorldMap, WorldNode } from '../types';
	import {
		geoJsonGeometryToSvgPath,
		isExploredState,
		isUnlockedState,
		latLngToSvgPoint,
		resolveWorldNodeTargetUrl
	} from '../world-utils';

	interface Props {
		world: WorldMap;
		selected: WorldNode | null;
		hovered: WorldNode | null;
		onselect: (node: WorldNode | null) => void;
		onhover: (node: WorldNode | null) => void;
		onenter: (node: WorldNode) => void;
	}

	let { world, selected, hovered, onselect, onhover, onenter }: Props = $props();

	const MAP_W = 1000;
	const MAP_H = 500;
	const LAT_LINES = [-60, -30, 0, 30, 60];
	const LNG_LINES = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

	let features = $state<RegionFeature[]>([]);
	let zoom = $state(1);

	onMount(async () => {
		const geo = await fetchRegionGeometry();
		if (geo?.features) {
			features = geo.features;
		}
	});

	let placedRegions = $derived(
		world.regions.filter(isPlaced).filter((n) => n.state !== 'hidden')
	);
	let placedLocations = $derived(
		world.locations.filter(isPlaced).filter((n) => n.state !== 'hidden')
	);

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
		if (isUnlockedState(node.state)) return node.palette?.[0] ?? '#00f0ff';
		return '#64748b';
	}

	function selectByRegionSlug(slug: string) {
		const match = world.regions.find((r) => r.slug === slug && r.state !== 'hidden');
		if (match) onselect(match);
	}
</script>

<div class="atlas-stage">
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
					<filter id="pinGlow" x="-40%" y="-40%" width="180%" height="180%">
						<feGaussianBlur stdDeviation="3" result="blur" />
						<feMerge>
							<feMergeNode in="blur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
				</defs>

				<!-- Ocean background -->
				<rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#akunaliaOcean)" rx="14" />

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

				<!-- Location pins -->
				{#each placedLocations as loc (loc.id)}
					{@const pt = latLngToSvgPoint(loc.lat, loc.lng, MAP_W, MAP_H)}
					{@const isSel = selected?.id === loc.id}
					{@const isHov = hovered?.id === loc.id}
					{@const color = pinColor(loc, isSel, isHov)}
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
							<circle r="13" fill="none" stroke="#ffb703" stroke-width="1.6" opacity="0.85" />
						{/if}
						<circle
							r={isSel ? 6.5 : 5}
							fill={color}
							stroke="#040d1a"
							stroke-width="1.5"
							filter="url(#pinGlow)"
						/>
						{#if isSel || isHov || isUnlockedState(loc.state)}
							<text y="-10" text-anchor="middle" class="pin-label" class:active={isSel || isHov}>
								{isExploredState(loc.state) ? '✓ ' : ''}{displayName(loc, m.world_unknown_place())}
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
							r={isSel ? 16 : 13}
							fill="rgba(4, 13, 26, 0.78)"
							stroke={color}
							stroke-width={isSel ? '2.4' : '1.8'}
						/>
						<polygon
							points="0,-7 7,0 0,7 -7,0"
							fill={color}
							filter="url(#pinGlow)"
						/>
						<text y="26" text-anchor="middle" class="region-label" class:active={isSel || isHov}>
							{isExploredState(reg.state) ? '✓ ' : ''}{displayName(reg, m.world_unknown_place())}
						</text>
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
				<a href={resolveWorldNodeTargetUrl(selected)} class="legend-enter-link">
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
		padding: 4.25rem clamp(1rem, 18vw, 21rem) 3.75rem clamp(1rem, 17vw, 19.5rem);
		background: radial-gradient(ellipse at center, #081526 0%, #030710 100%);
		overflow: hidden;
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
		.atlas-stage {
			padding: 3.75rem 0.75rem 4.25rem 0.75rem;
		}
		.atlas-legend {
			gap: 0.55rem 0.85rem;
			padding: 0.5rem 0.75rem;
			font-size: 0.72rem;
		}
	}
</style>
