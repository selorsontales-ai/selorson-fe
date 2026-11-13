<script lang="ts">
	/**
	 * A place on the globe.
	 *
	 * Reveal state drives the whole appearance: a hidden place is a formless
	 * smudge of fog with no name and no hit target, a rumoured one is a dim pin,
	 * and an unlocked one (`revealed` or `explored`) gets a bright ring, a beam
	 * and a label. Explored places also earn an emerald halo ring.
	 *
	 * Floating places (`alt > 0`) also draw a tether down to the surface, so
	 * Skyland reads as genuinely airborne rather than painted on.
	 */
	import { T } from '@threlte/core';
	import { AdditiveBlending, BufferGeometry, Quaternion, Vector3 } from 'three';
	import { latLngToVector3, surfaceNormal } from '../projection';
	import type { WorldNode } from '../types';
	import { isExploredState, isUnlockedState } from '../world-utils';

	interface Props {
		node: WorldNode & { lat: number; lng: number };
		radius: number;
		/** Exact displaced terrain radius at `(node.lat, node.lng)` so pins never sink into mountains. */
		surfaceRadius?: number;
		selected?: boolean;
		hovered?: boolean;
		onselect?: (node: WorldNode) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let {
		node,
		radius,
		surfaceRadius,
		selected = false,
		hovered = false,
		onselect,
		onhover
	}: Props = $props();

	const REVEALED = '#38bdf8';
	const EXPLORED = '#34d399';
	const ACTIVE = '#ffb703';
	const RUMORED = '#64748b';
	const HIDDEN = '#334155';

	let effectiveRadius = $derived(surfaceRadius ?? radius);
	// Hug the displaced terrain closely so markers never float outside the planet's limb silhouette
	let position = $derived(latLngToVector3(node.lat, node.lng, effectiveRadius + 0.018, node.alt));
	let isRegion = $derived(node.kind === 'region');
	let interactive = $derived(node.state !== 'hidden');
	let unlocked = $derived(isUnlockedState(node.state));
	let explored = $derived(isExploredState(node.state));

	let color = $derived(
		node.state === 'hidden'
			? HIDDEN
			: node.state === 'rumored'
				? (node.is_singularity ? (node.palette?.[0] ?? RUMORED) : RUMORED)
				: selected || hovered
					? ACTIVE
					: explored
						? (node.palette?.[0] ?? EXPLORED)
						: (node.palette?.[0] ?? REVEALED)
	);

	// Compact precision orbital-telemetry reticles (zero oversized plastic washers or sticks)
	let ringInner = $derived(isRegion ? 0.076 : node.is_singularity ? 0.058 : 0.048);
	let ringOuter = $derived(isRegion ? 0.106 : node.is_singularity ? 0.084 : 0.070);
	let opacity = $derived(node.state === 'hidden' ? 0.18 : node.state === 'rumored' ? 0.46 : 0.88);
	let needleHeight = $derived(selected ? 0.30 : hovered ? 0.22 : isRegion ? 0.15 : 0.11);

	/** Tether from the surface up to a floating place (`alt > 0`). */
	let tether = $derived.by(() => {
		if (node.alt <= 0.001) return null;
		const ground = latLngToVector3(node.lat, node.lng, effectiveRadius + 0.01, 0);
		const air = latLngToVector3(node.lat, node.lng, effectiveRadius + 0.018, node.alt);
		return new BufferGeometry().setFromPoints([ground, air]);
	});

	const OUTWARD_AXIS = new Vector3(0, 0, -1);
	let orientation = $derived.by(() => {
		const q = new Quaternion().setFromUnitVectors(OUTWARD_AXIS, surfaceNormal(node.lat, node.lng));
		return [q.x, q.y, q.z, q.w] as [number, number, number, number];
	});
</script>

<T.Group
	position={[position.x, position.y, position.z]}
	quaternion={orientation}
	onclick={interactive
		? (event: { stopPropagation: () => void }) => {
				event.stopPropagation();
				onselect?.(node);
			}
		: undefined}
	onpointerenter={interactive ? () => onhover?.(node) : undefined}
	onpointerleave={interactive ? () => onhover?.(null) : undefined}
>
	{#if interactive}
		<!-- Generous invisible hit-target disc for effortless clicking & hovering -->
		<T.Mesh>
			<T.CircleGeometry args={[0.17, 16]} />
			<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} side={2} />
		</T.Mesh>
	{/if}

	<!-- Core glowing pinpoint -->
	<T.Mesh>
		<T.CircleGeometry args={[ringInner * 0.44, 16]} />
		<T.MeshBasicMaterial
			{color}
			transparent
			opacity={unlocked ? 0.95 : opacity}
			blending={AdditiveBlending}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>

	<!-- Precision orbital reticle ring -->
	<T.Mesh>
		<T.RingGeometry args={[ringInner, ringOuter, 32]} />
		<T.MeshBasicMaterial
			{color}
			transparent
			{opacity}
			blending={AdditiveBlending}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>

	{#if unlocked}
		<!-- Short, razor-thin tapered holographic light needle pointing outward along local -Z -->
		<T.Mesh position={[0, 0, -needleHeight * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
			<T.CylinderGeometry args={[0.011, 0.0018, needleHeight, 10]} />
			<T.MeshBasicMaterial
				{color}
				transparent
				opacity={selected || hovered ? 0.78 : explored ? 0.48 : 0.36}
				blending={AdditiveBlending}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}

	{#if node.is_singularity && node.state !== 'hidden'}
		<!-- Delicate spectral diamond hovering just above Singularity reticle -->
		<T.Mesh position={[0, 0, -(needleHeight + 0.045)]}>
			<T.OctahedronGeometry args={[selected || hovered ? 0.036 : unlocked ? 0.028 : 0.02, 0]} />
			<T.MeshBasicMaterial
				{color}
				transparent
				opacity={unlocked ? 0.92 : 0.55}
				blending={AdditiveBlending}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}

	{#if explored && !hovered && !selected}
		<T.Mesh>
			<T.RingGeometry args={[ringOuter + 0.016, ringOuter + 0.032, 32]} />
			<T.MeshBasicMaterial
				color={EXPLORED}
				transparent
				opacity={0.52}
				blending={AdditiveBlending}
				depthWrite={false}
				side={2}
			/>
		</T.Mesh>
	{/if}

	{#if hovered || selected}
		<T.Mesh>
			<T.RingGeometry args={[ringOuter + 0.022, ringOuter + 0.046, 36]} />
			<T.MeshBasicMaterial
				color={ACTIVE}
				transparent
				opacity={0.88}
				blending={AdditiveBlending}
				depthWrite={false}
				side={2}
			/>
		</T.Mesh>
	{/if}
</T.Group>

{#if tether}
	<T.Line>
		<T is={tether} attach="geometry" />
		<T.LineBasicMaterial {color} transparent opacity={0.35} />
	</T.Line>
{/if}
