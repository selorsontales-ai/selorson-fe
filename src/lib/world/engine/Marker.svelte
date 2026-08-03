<script lang="ts">
	/**
	 * A place on the globe.
	 *
	 * Reveal state drives the whole appearance: a hidden place is a formless
	 * smudge of fog with no name and no hit target, a rumoured one is a dim pin,
	 * and only a revealed one gets a bright ring, a beam and a label. That is
	 * what stops the map from spoiling chapters the reader has not reached.
	 *
	 * Floating places (`alt > 0`) also draw a tether down to the surface, so
	 * Skyland reads as genuinely airborne rather than painted on.
	 */
	import { T } from '@threlte/core';
	import { BufferGeometry, Vector3 } from 'three';
	import { latLngToVector3 } from '../projection';
	import type { WorldNode } from '../types';

	interface Props {
		node: WorldNode & { lat: number; lng: number };
		radius: number;
		selected?: boolean;
		hovered?: boolean;
		onselect?: (node: WorldNode) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let { node, radius, selected = false, hovered = false, onselect, onhover }: Props = $props();

	const REVEALED = '#00f0ff';
	const ACTIVE = '#ffb703';
	const RUMORED = '#64748b';
	const HIDDEN = '#334155';

	let position = $derived(latLngToVector3(node.lat, node.lng, radius + 0.08, node.alt));
	let isRegion = $derived(node.kind === 'region');
	let interactive = $derived(node.state !== 'hidden');

	let color = $derived(
		node.state === 'hidden'
			? HIDDEN
			: node.state === 'rumored'
				? RUMORED
				: selected || hovered
					? ACTIVE
					: (node.palette?.[0] ?? REVEALED)
	);

	// Regions read as anchors, individual places as pins.
	let ringInner = $derived(isRegion ? 0.16 : 0.1);
	let ringOuter = $derived(isRegion ? 0.26 : 0.17);
	let opacity = $derived(node.state === 'hidden' ? 0.25 : node.state === 'rumored' ? 0.5 : 0.9);

	/** Tether from the surface up to a floating place. */
	let tether = $derived.by(() => {
		if (node.alt <= 0.001) return null;
		const ground = latLngToVector3(node.lat, node.lng, radius + 0.02, 0);
		const air = latLngToVector3(node.lat, node.lng, radius + 0.08, node.alt);
		return new BufferGeometry().setFromPoints([ground, air]);
	});

	// The pin stands along the surface normal rather than the world axis.
	let lookTarget = new Vector3(0, 0, 0);
</script>

<T.Group
	position={[position.x, position.y, position.z]}
	oncreate={(ref) => ref.lookAt(lookTarget)}
	onclick={interactive
		? (event: { stopPropagation: () => void }) => {
				event.stopPropagation();
				onselect?.(node);
			}
		: undefined}
	onpointerenter={interactive ? () => onhover?.(node) : undefined}
	onpointerleave={interactive ? () => onhover?.(null) : undefined}
>
	<T.Mesh>
		<T.RingGeometry args={[ringInner, ringOuter, 32]} />
		<T.MeshBasicMaterial {color} transparent {opacity} side={2} />
	</T.Mesh>

	{#if node.state === 'revealed'}
		<!-- Beam points outward from the planet, i.e. along local -Z after lookAt. -->
		<T.Mesh position={[0, 0, selected ? 0.5 : 0.32]} rotation={[Math.PI / 2, 0, 0]}>
			<T.CylinderGeometry args={[0.022, 0.022, selected ? 1 : 0.64, 12]} />
			<T.MeshBasicMaterial {color} transparent opacity={0.55} />
		</T.Mesh>
	{/if}

	{#if hovered || selected}
		<T.Mesh>
			<T.RingGeometry args={[ringOuter + 0.05, ringOuter + 0.09, 32]} />
			<T.MeshBasicMaterial color={ACTIVE} transparent opacity={0.8} side={2} />
		</T.Mesh>
	{/if}
</T.Group>

{#if tether}
	<T.Line>
		<T is={tether} attach="geometry" />
		<T.LineBasicMaterial {color} transparent opacity={0.35} />
	</T.Line>
{/if}
