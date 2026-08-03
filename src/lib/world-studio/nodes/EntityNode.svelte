<script lang="ts">
	/**
	 * One library item on the canvas.
	 *
	 * The same component serves every kind — colour, icon and which ports exist
	 * come from the kind, so adding a sixth kind is a table entry rather than a
	 * new component.
	 *
	 * Ports are only rendered in graph mode: on the map a node's position means
	 * a coordinate, and dangling connection handles there would invite wiring
	 * that the map cannot express.
	 */
	import { Handle, Position, type Node, type NodeProps } from '@xyflow/svelte';
	import { KIND_COLORS, KIND_ICONS, type StudioNodeKind } from '../types';

	interface EntityData extends Record<string, unknown> {
		label: string;
		kind: StudioNodeKind;
		imageUrl: string | null;
		/** Ports and body chrome are hidden on the map. */
		mapMode: boolean;
		/** Dimmed when Focus mode excludes it. */
		muted: boolean;
		/** No coordinates yet — cannot appear on the map. */
		unplaced: boolean;
		alt: number;
	}

	/** `NodeProps` is generic over the *node*, not over its data. */
	type EntityNodeType = Node<EntityData, 'entity'>;

	let { data, selected }: NodeProps<EntityNodeType> = $props();

	let color = $derived(KIND_COLORS[data.kind]);
	let icon = $derived(KIND_ICONS[data.kind]);
	/** Regions anchor the map, so they read heavier than the places inside them. */
	let heavy = $derived(data.kind === 'region');
</script>

<div
	class="node"
	class:map={data.mapMode}
	class:muted={data.muted}
	class:selected
	class:heavy
	class:unplaced={data.unplaced}
	style="--kind-color:{color}"
>
	{#if !data.mapMode}
		<Handle type="target" position={Position.Left} class="port" />
	{/if}

	{#if data.mapMode}
		<span class="pin" title={data.label}>{icon}</span>
		<span class="pin-label">{data.label}</span>
		{#if data.alt > 0}
			<span class="alt-badge" title="Độ cao {data.alt}">▲</span>
		{:else if data.alt < 0}
			<span class="alt-badge down" title="Độ sâu {data.alt}">▼</span>
		{/if}
	{:else}
		<div class="body">
			{#if data.imageUrl}
				<img src={data.imageUrl} alt="" />
			{:else}
				<span class="icon">{icon}</span>
			{/if}
			<span class="label">{data.label}</span>
		</div>
	{/if}

	{#if !data.mapMode}
		<Handle type="source" position={Position.Right} class="port" />
	{/if}
</div>

<style>
	.node {
		--kind-color: #64748b;
		font-family: inherit;
		transition: opacity 0.18s;
	}
	.node.muted {
		opacity: 0.22;
	}

	/* ── graph mode ── */
	.body {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 8.5rem;
		max-width: 13rem;
		padding: 0.45rem 0.6rem;
		border-radius: 8px;
		border: 1px solid color-mix(in srgb, var(--kind-color) 45%, transparent);
		border-left: 3px solid var(--kind-color);
		background: rgba(10, 16, 26, 0.92);
		color: #e2e8f0;
		font-size: 0.8rem;
	}
	.node.heavy .body {
		font-weight: 700;
		background: color-mix(in srgb, var(--kind-color) 14%, rgba(10, 16, 26, 0.92));
	}
	.node.selected .body {
		border-color: #ffb703;
		box-shadow: 0 0 0 2px rgba(255, 183, 3, 0.35);
	}
	.node.unplaced .body {
		border-style: dashed;
	}
	.body img {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 4px;
		object-fit: cover;
		flex: none;
	}
	.icon {
		font-size: 1rem;
		flex: none;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── map mode ── */
	.node.map {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		transform: translate(-50%, -50%);
		pointer-events: auto;
	}
	.pin {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: rgba(6, 12, 20, 0.9);
		border: 2px solid var(--kind-color);
		font-size: 0.8rem;
		line-height: 1;
	}
	.node.heavy .pin {
		width: 2.1rem;
		height: 2.1rem;
		font-size: 1rem;
	}
	.node.selected .pin {
		border-color: #ffb703;
		box-shadow: 0 0 0 3px rgba(255, 183, 3, 0.3);
	}
	.pin-label {
		font-size: 0.65rem;
		color: #e2e8f0;
		background: rgba(6, 12, 20, 0.75);
		padding: 0 0.25rem;
		border-radius: 3px;
		white-space: nowrap;
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.alt-badge {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		font-size: 0.55rem;
		color: #bfe9ff;
	}
	.alt-badge.down {
		color: #f0a5a5;
	}

	:global(.svelte-flow__handle.port) {
		width: 9px;
		height: 9px;
		background: var(--kind-color, #64748b);
		border: 1px solid rgba(0, 0, 0, 0.5);
	}
</style>
