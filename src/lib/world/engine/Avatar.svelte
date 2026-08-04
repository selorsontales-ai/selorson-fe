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
	import { isModelFormat } from '$lib/world-assets/types';
	import { avatarAsset, avatarFlat, resolveAvatar, spriteFrame } from '../avatar';
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
		/**
		 * Which asset slot suits this context: a bust on the map, a full figure
		 * on a journey. Not named `slot` — that is reserved markup in Svelte.
		 */
		variant?: 'head' | 'body';
	}

	let {
		node,
		position,
		size = 0.55,
		highlighted = false,
		heading = 0,
		variant = 'head'
	}: Props = $props();

	/**
	 * Art sources are read once: a character's route remounts when the character
	 * changes, so these cannot go stale while the component is alive.
	 */
	function sources() {
		const spec = resolveAvatar(node);
		// A bound production asset outranks anything on the library item: it was
		// made for the world, and carries the corrections it needs to sit right.
		const bound = avatarAsset(node, variant);
		const flat = avatarFlat(node);
		const transform = bound?.transform ?? null;

		// A slot may hold geometry or a flat render. At marker size the two read
		// almost the same, so the author is free to start with a render and swap
		// in a model later; the format decides which path is taken, not the slot.
		const boundIsModel = isModelFormat(bound?.format);
		const boundUrl = bound ? `${bound.url}?v=${bound.v}` : null;

		const fallbackPortrait = flat
			? `${flat.url}?v=${flat.v}`
			: node.sprite_sheet
				? assetUrl(node.sprite_sheet, node.v)
				: node.image_url
					? assetUrl(node.image_url, node.v)
					: null;

		return {
			color: spec.color,
			scale: (transform?.scale ?? 1) * spec.scale,
			rotation: transform?.rotation ?? ([0, 0, 0] as [number, number, number]),
			offset: transform?.offset ?? ([0, 0, 0] as [number, number, number]),
			directions: spec.directions,
			// Only a real sprite sheet gets frame-sliced; a single rendered bust
			// must not be cut into columns.
			isSprite: !!node.assets?.sprite || (!bound && !!node.sprite_sheet),
			model: boundIsModel ? boundUrl : node.model ? assetUrl(node.model, node.v) : null,
			portrait: !boundIsModel && boundUrl ? boundUrl : fallbackPortrait
		};
	}
	const art = sources();

	const DEG = Math.PI / 180;
	let modelRotation = $derived(
		art.rotation.map((deg) => deg * DEG) as [number, number, number]
	);

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
		<!-- Offset and rotation come from the asset's stored correction, so a
		     Z-up export or an origin at the model's centre is fixed once at
		     import rather than at every place the asset is used. -->
		<T is={scene} position={art.offset} rotation={modelRotation} />
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
