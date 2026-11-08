<script lang="ts">
	/**
	 * A place standing on the region floor.
	 *
	 * The diorama is not built until the reader first touches the marker, and is
	 * kept afterwards. Building all of them up front would cost seconds on a
	 * phone for scenery most readers never look at; building and discarding on
	 * every hover would stutter. Build once, on demand, keep — the same trade
	 * `vietnam-3d-map` makes for its province landmarks.
	 *
	 * A hidden place never builds at all: there is nothing there to see yet.
	 */
	import { T, useTask } from '@threlte/core';
	import { Group, Vector3 } from 'three';
	import { buildLandmark } from '../builders';
	import { disposeGroup } from '../builders/kit';
	import type { WorldNode } from '../types';
	import { isExploredState, isUnlockedState } from '../world-utils';

	interface Props {
		node: WorldNode & { lat: number; lng: number };
		position: Vector3;
		active: boolean;
		selected?: boolean;
		onselect?: (node: WorldNode) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let { node, position, active, selected = false, onselect, onhover }: Props = $props();

	let diorama = $state<Group | null>(null);
	/** 0 = underground, 1 = fully risen. Drives the grow-out-of-the-ground move. */
	let rise = $state(0);

	let buildable = $derived(node.state !== 'hidden');
	let unlocked = $derived(isUnlockedState(node.state));
	let explored = $derived(isExploredState(node.state));
	let wanted = $derived(buildable && (active || selected));

	$effect(() => {
		if (wanted && !diorama) {
			diorama = buildLandmark(node.terrain, {
				seed: node.id,
				colors: node.palette,
				scale: node.scale ?? 1
			});
		}
	});

	$effect(() => {
		return () => {
			if (diorama) disposeGroup(diorama);
		};
	});

	useTask(
		(delta) => {
			const target = wanted ? 1 : 0;
			if (rise === target) return;
			const step = delta * 3.2;
			rise = rise < target ? Math.min(target, rise + step) : Math.max(target, rise - step);
		},
		{ running: () => rise !== (wanted ? 1 : 0) }
	);

	// Ease-out-back: the diorama overshoots slightly then settles, which reads as
	// "growing" rather than "sliding".
	let eased = $derived(
		rise >= 1 ? 1 : 1 + 2.7 * Math.pow(rise - 1, 3) + 1.7 * Math.pow(rise - 1, 2)
	);

	const PIN_COLOR = '#00f0ff';
	const EXPLORED_COLOR = '#34d399';
	const ACTIVE_COLOR = '#ffb703';

	let pinColor = $derived(
		selected ? ACTIVE_COLOR : explored ? EXPLORED_COLOR : unlocked ? PIN_COLOR : '#475569'
	);
</script>

<T.Group position={[position.x, position.y, position.z]}>
	<!-- Always-present hit target and pin; the diorama is the reward for touching it. -->
	<T.Mesh
		position={[0, 0.16, 0]}
		onclick={buildable
			? (event: { stopPropagation: () => void }) => {
					event.stopPropagation();
					onselect?.(node);
				}
			: undefined}
		onpointerenter={buildable ? () => onhover?.(node) : undefined}
		onpointerleave={buildable ? () => onhover?.(null) : undefined}
	>
		<T.CylinderGeometry args={[0.12, 0.12, 0.32, 8]} />
		<T.MeshStandardMaterial
			color={pinColor}
			emissive={unlocked ? pinColor : '#000000'}
			emissiveIntensity={unlocked ? 0.55 : 0}
			transparent
			opacity={node.state === 'hidden' ? 0.3 : 1}
		/>
	</T.Mesh>

	{#if diorama && rise > 0.001}
		<T
			is={diorama}
			position={[0, (eased - 1) * 1.4, 0]}
			scale={[eased, eased, eased]}
			visible={rise > 0.001}
		/>
	{/if}
</T.Group>
