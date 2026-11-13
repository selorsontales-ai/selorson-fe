<script lang="ts">
	/**
	 * A character standing on the lightweight web map.
	 *
	 * Renders a directional sprite sheet, a flat portrait billboard, or a
	 * glowing coloured pin anchored to a ground ring — zero heavy `.glb` loading.
	 */
	import { T } from '@threlte/core';
	import { Billboard } from '@threlte/extras';
	import { untrack } from 'svelte';
	import { DoubleSide, RepeatWrapping, type Texture } from 'three';
	import { resolveAvatar, spriteFrame } from '../avatar';
	import type { WorldNode } from '../types';
	import { useTextures } from './textures.svelte';

	interface Props {
		node: WorldNode;
		/** World position, already projected. */
		position: [number, number, number];
		/** Base size in scene units; the pin and portrait scale from it. */
		size?: number;
		highlighted?: boolean;
		/** Facing, in radians, used to pick a column of a sprite sheet. */
		heading?: number;
		variant?: 'head' | 'body';
	}

	let {
		node,
		position,
		size = 0.55,
		highlighted = false,
		heading = 0
	}: Props = $props();

	const spec = untrack(() => resolveAvatar(node));
	const portrait = useTextures<'face'>({ face: spec.url }, ['face']);
	let face = $derived(portrait.maps.face as Texture | null);

	$effect(() => {
		if (!face || spec.tier !== 'sprite') return;
		face.wrapS = RepeatWrapping;
		face.repeat.set(1 / spec.directions, 1);
		face.offset.x = spriteFrame(heading, spec.directions) / spec.directions;
		face.needsUpdate = true;
	});

	let glow = $derived(highlighted ? 1.4 : 0.55);
</script>

<T.Group {position} scale={spec.scale}>
	{#if face}
		<Billboard position={[0, size * 1.15, 0]}>
			<T.Mesh>
				<T.PlaneGeometry args={[size * 1.25, size * 1.25]} />
				<T.MeshBasicMaterial map={face} transparent side={DoubleSide} />
			</T.Mesh>
			<T.Mesh position={[0, 0, -0.01]}>
				<T.RingGeometry args={[size * 0.62, size * 0.72, 28]} />
				<T.MeshBasicMaterial color={spec.color} transparent opacity={highlighted ? 0.95 : 0.6} />
			</T.Mesh>
		</Billboard>
	{:else}
		<T.Mesh position={[0, size * 0.55, 0]}>
			<T.SphereGeometry args={[size * 0.28, 12, 10]} />
			<T.MeshStandardMaterial
				color={spec.color}
				emissive={spec.color}
				emissiveIntensity={glow}
				roughness={0.4}
			/>
		</T.Mesh>
	{/if}

	<T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
		<T.RingGeometry args={[size * 0.3, size * 0.42, 24]} />
		<T.MeshBasicMaterial
			color={spec.color}
			transparent
			opacity={highlighted ? 0.9 : 0.45}
			side={DoubleSide}
		/>
	</T.Mesh>
</T.Group>
