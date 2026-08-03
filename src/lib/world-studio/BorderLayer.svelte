<script lang="ts">
	/**
	 * Region outlines, drawn inside the flow viewport so they pan and zoom with
	 * everything else rather than needing their own transform bookkeeping.
	 *
	 * Drawing a border is vector editing — add a vertex, drag a vertex, close the
	 * ring — which a node graph has no vocabulary for. Hence a plain SVG layer
	 * rather than more nodes.
	 */
	import { MAP_HEIGHT, MAP_WIDTH, lngLatToXY, ringCentroid, ringToPath } from './projection';
	import type { Border } from './types';

	interface Props {
		borders: Record<string, Border>;
		/** Slug → display name, for the labels. */
		names: Record<string, string>;
		/** Region currently being drawn or edited. */
		editing: string | null;
		/** Ring under construction, in `[lng, lat]`. */
		drafting: number[][];
		selectedVertex: number | null;
		onvertexdown: (index: number, event: PointerEvent) => void;
		oninsert: (ringIndex: number, afterIndex: number, lng: number, lat: number) => void;
	}

	let { borders, names, editing, drafting, selectedVertex, onvertexdown, oninsert }: Props =
		$props();

	let editingRings = $derived(editing ? (borders[editing]?.rings ?? []) : []);

	/** Midpoints of each edge — click one to insert a vertex there. */
	function midpoints(ring: number[][]) {
		return ring.map((point, index) => {
			const next = ring[(index + 1) % ring.length];
			return {
				afterIndex: index,
				lng: (point[0] + next[0]) / 2,
				lat: (point[1] + next[1]) / 2
			};
		});
	}
</script>

<svg
	class="border-layer"
	width={MAP_WIDTH}
	height={MAP_HEIGHT}
	viewBox="0 0 {MAP_WIDTH} {MAP_HEIGHT}"
	aria-hidden="true"
>
	{#each Object.entries(borders) as [slug, border] (slug)}
		{@const active = slug === editing}
		{#each border.rings as ring, ringIndex (ringIndex)}
			<!--
				Deliberately inert. Selecting a region by clicking its shape would
				swallow the click that adds a vertex while drawing, and the region
				is already selectable from the item list and the toolbar picker —
				both of which are real controls reachable by keyboard.
			-->
			<path
				class="ring"
				class:active
				d={ringToPath(ring)}
				fill={border.color ?? '#2fe36b'}
				stroke={border.color ?? '#2fe36b'}
			/>
		{/each}
		{#if border.rings[0]?.length}
			{@const c = ringCentroid(border.rings[0])}
			<text class="region-label" x={c.x} y={c.y} text-anchor="middle">{names[slug] ?? slug}</text>
		{/if}
	{/each}

	<!-- Ring being drawn right now: open polyline plus a hint back to the start. -->
	{#if drafting.length > 0}
		<polyline
			class="drafting"
			points={drafting.map(([lng, lat]) => {
				const p = lngLatToXY(lng, lat);
				return `${p.x},${p.y}`;
			}).join(' ')}
		/>
		{#each drafting as [lng, lat], index (index)}
			{@const p = lngLatToXY(lng, lat)}
			<circle
				class="vertex drafting-vertex"
				class:first={index === 0}
				cx={p.x}
				cy={p.y}
				r={index === 0 ? 14 : 10}
			/>
		{/each}
	{/if}

	<!-- Editable vertices of the region being edited. -->
	{#if editing}
		{#each editingRings as ring, ringIndex (ringIndex)}
			{#each midpoints(ring) as mid (mid.afterIndex)}
				{@const p = lngLatToXY(mid.lng, mid.lat)}
				<!--
					Not tab-reachable on purpose: a ring can have dozens of these
					and putting them all in the tab order would bury everything
					else. Focus can still be moved here programmatically, so the
					declared button role stays honest with a key handler.
				-->
				<circle
					class="midpoint"
					cx={p.x}
					cy={p.y}
					r="7"
					role="button"
					tabindex="-1"
					aria-label="Chèn đỉnh"
					onclick={() => oninsert(ringIndex, mid.afterIndex, mid.lng, mid.lat)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							oninsert(ringIndex, mid.afterIndex, mid.lng, mid.lat);
						}
					}}
				/>
			{/each}
			{#each ring as [lng, lat], index (index)}
				{@const p = lngLatToXY(lng, lat)}
				<circle
					class="vertex"
					class:selected={ringIndex === 0 && selectedVertex === index}
					cx={p.x}
					cy={p.y}
					r="11"
					role="button"
					tabindex="-1"
					aria-label="Đỉnh {index + 1}"
					onpointerdown={(event) => onvertexdown(index, event)}
				/>
			{/each}
		{/each}
	{/if}
</svg>

<style>
	.border-layer {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}

	.ring {
		fill-opacity: 0.12;
		stroke-width: 3;
		stroke-opacity: 0.75;
		pointer-events: visibleFill;
		cursor: pointer;
	}
	.ring:hover {
		fill-opacity: 0.2;
	}
	.ring.active {
		fill-opacity: 0.22;
		stroke-width: 5;
		stroke-dasharray: 14 8;
	}

	.region-label {
		fill: #e2e8f0;
		font-size: 34px;
		font-weight: 700;
		paint-order: stroke;
		stroke: rgba(4, 10, 18, 0.85);
		stroke-width: 8px;
		pointer-events: none;
		user-select: none;
	}

	.drafting {
		fill: none;
		stroke: #ffb703;
		stroke-width: 4;
		stroke-dasharray: 12 8;
	}
	.drafting-vertex {
		fill: #ffb703;
		stroke: rgba(4, 10, 18, 0.9);
		stroke-width: 3;
	}
	/* The first vertex is the target for closing the ring, so it reads bigger. */
	.drafting-vertex.first {
		fill: #2fe36b;
	}

	.vertex {
		fill: #00f0ff;
		stroke: rgba(4, 10, 18, 0.9);
		stroke-width: 3;
		pointer-events: auto;
		cursor: grab;
	}
	.vertex.selected {
		fill: #ffb703;
		r: 14;
	}
	.midpoint {
		fill: rgba(255, 255, 255, 0.35);
		stroke: rgba(4, 10, 18, 0.7);
		stroke-width: 2;
		pointer-events: auto;
		cursor: copy;
	}
	.midpoint:hover {
		fill: #00f0ff;
	}
</style>
