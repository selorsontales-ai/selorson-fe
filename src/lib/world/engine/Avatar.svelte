<script lang="ts">
	/**
	 * A character standing on the map.
	 *
	 * Renders at whatever fidelity the database happens to supply — a rigged
	 * model, a directional sprite sheet, a flat portrait, or just a coloured pin.
	 * Character art is placeholder-grade today and will be replaced more than
	 * once, so the tier is resolved from data at runtime rather than chosen here;
	 * filling in `model` or `sprite_sheet` in admin upgrades the avatar without
	 * touching this component.
	 *
	 * Both the model and the portrait are requested up front rather than only
	 * the best one. That costs one small image on characters that have a model,
	 * and buys two things worth more: the character is visible immediately
	 * instead of after a multi-megabyte download, and a model that 404s falls
	 * back to a portrait that is already in hand rather than to a bare pin.
	 */
	import { T } from '@threlte/core';
	import { Billboard } from '@threlte/extras';
	import { DoubleSide, RepeatWrapping, type Group, type Texture } from 'three';
	import { resolveAvatar, spriteFrame } from '../avatar';
	import { assetUrl } from '../config';
	import type { WorldNode } from '../types';
	import { useModel } from './models.svelte';
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
	}

	let { node, position, size = 0.55, highlighted = false, heading = 0 }: Props = $props();

	/**
	 * Art sources are read once: a character's route remounts when the character
	 * changes, so these cannot go stale while the component is alive.
	 */
	function sources() {
		const spec = resolveAvatar(node);
		return {
			color: spec.color,
			scale: spec.scale,
			directions: spec.directions,
			isSprite: !!node.sprite_sheet,
			model: node.model ? assetUrl(node.model, node.v) : null,
			portrait: node.sprite_sheet
				? assetUrl(node.sprite_sheet, node.v)
				: node.image_url
					? assetUrl(node.image_url, node.v)
					: null
		};
	}
	const art = sources();

	const model = useModel(art.model);
	const portrait = useTextures<'face'>({ face: art.portrait }, ['face']);

	let scene = $derived(model.scene as Group | null);
	let face = $derived(portrait.maps.face as Texture | null);

	// A sprite sheet is one row of facings; show the column matching the heading
	// rather than smearing the whole strip across the quad.
	$effect(() => {
		if (!face || !art.isSprite) return;
		face.wrapS = RepeatWrapping;
		face.repeat.set(1 / art.directions, 1);
		face.offset.x = spriteFrame(heading, art.directions) / art.directions;
		face.needsUpdate = true;
	});

	let glow = $derived(highlighted ? 1.4 : 0.55);
</script>

<T.Group {position} scale={art.scale}>
	{#if scene}
		<T is={scene} />
	{:else if face}
		<!-- Billboarded portrait: always faces the camera, so a flat image reads
		     as a figure standing in the world from any angle. -->
		<Billboard position={[0, size * 1.15, 0]}>
			<T.Mesh>
				<T.PlaneGeometry args={[size * 1.25, size * 1.25]} />
				<T.MeshBasicMaterial map={face} transparent side={DoubleSide} />
			</T.Mesh>
			<T.Mesh position={[0, 0, -0.01]}>
				<T.RingGeometry args={[size * 0.62, size * 0.72, 28]} />
				<T.MeshBasicMaterial color={art.color} transparent opacity={highlighted ? 0.95 : 0.6} />
			</T.Mesh>
		</Billboard>
	{:else}
		<!-- Tier 0: a pin. Always available, never fails to load. -->
		<T.Mesh position={[0, size * 0.55, 0]}>
			<T.SphereGeometry args={[size * 0.28, 12, 10]} />
			<T.MeshStandardMaterial
				color={art.color}
				emissive={art.color}
				emissiveIntensity={glow}
				roughness={0.4}
			/>
		</T.Mesh>
	{/if}

	<!-- Ground marker under every tier, so the figure is anchored to a place. -->
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
		<T.RingGeometry args={[size * 0.3, size * 0.42, 24]} />
		<T.MeshBasicMaterial
			color={art.color}
			transparent
			opacity={highlighted ? 0.9 : 0.45}
			side={DoubleSide}
		/>
	</T.Mesh>
</T.Group>
