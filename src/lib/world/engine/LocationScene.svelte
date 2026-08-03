<script lang="ts">
	/**
	 * L3 — one place, taken apart.
	 *
	 * The exploded view is the reading interaction, not a gimmick: each piece
	 * carries a fragment of the place's story, so pulling the roof off a keep is
	 * how the reader learns who built it. Pieces come from the kit-bash builder's
	 * part tags, or from the top-level nodes of a glTF model when one exists.
	 *
	 * Explode directions are derived from geometry, so a place takes apart
	 * sensibly before anyone has authored a single `parts` entry; authored
	 * entries then add labels, lore and custom motion on top.
	 */
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';
	import { buildLandmark, PART_LABELS } from '../builders';
	import { describeParts, disposeGroup, type DioramaPart } from '../builders/kit';
	import { assetUrl } from '../config';
	import type { QualitySettings } from '../quality';
	import type { ScenePart, WorldNode, WorldPart } from '../types';
	import { useModel } from './models.svelte';

	interface Props {
		node: WorldNode;
		quality: QualitySettings;
		/** 0 = fully assembled, 1 = fully exploded. */
		explode?: number;
		/** Ids the reader has pulled off individually. */
		detached?: string[];
		selectedPart?: string | null;
		xray?: boolean;
		onparts?: (parts: ScenePart[]) => void;
		onselectpart?: (id: string | null) => void;
	}

	let {
		node,
		quality,
		explode = 0,
		detached = [],
		selectedPart = null,
		xray = false,
		onparts,
		onselectpart
	}: Props = $props();

	interactivity();

	/** Fills the view regardless of which builder produced the diorama. */
	const TARGET_SIZE = 6;

	// Read once: opening a different place remounts the route, so the model URL
	// cannot change under a live scene.
	function initialModelUrl() {
		return node.model ? assetUrl(node.model, node.v) : null;
	}
	const model = useModel(initialModelUrl());

	/** Kit-bash stand-in, built immediately so the place is never empty. */
	let fallback = $state<Group | null>(null);
	$effect(() => {
		const built = buildLandmark(node.terrain, {
			seed: node.id,
			colors: node.palette,
			scale: 1
		});
		fallback = built;
		return () => disposeGroup(built);
	});

	/** The model wins once it lands; until then (or forever, if it fails) the kit. */
	let diorama = $derived(model.scene ?? fallback);

	let parts = $state<DioramaPart[]>([]);
	/** Authored overrides, keyed by part id. */
	let authored = $derived(new Map((node.parts ?? []).map((p: WorldPart) => [p.id, p])));

	$effect(() => {
		const root = diorama;
		if (!root) {
			parts = [];
			return;
		}

		// Normalise scale so a glTF authored in metres and a two-unit kit-bash
		// diorama both arrive at the same on-screen size.
		root.scale.setScalar(1);
		root.position.set(0, 0, 0);
		const box = new Box3().setFromObject(root);
		const size = box.getSize(new Vector3());
		const largest = Math.max(size.x, size.y, size.z) || 1;
		const fit = (TARGET_SIZE / largest) * (node.model_scale ?? node.scale ?? 1);
		root.scale.setScalar(fit);

		// Re-centre on the origin so orbiting feels like circling the building.
		const centred = new Box3().setFromObject(root);
		const centre = centred.getCenter(new Vector3());
		root.position.set(-centre.x, -centred.min.y, -centre.z);

		const found = describeParts(root);
		parts = found;

		onparts?.(
			found.map((part) => {
				const override = authored.get(part.id);
				return {
					id: part.id,
					label: override?.label ?? PART_LABELS[part.id] ?? part.id,
					lore: override?.lore ?? null,
					chapter: override?.chapter ?? null
				};
			})
		);
	});

	/** Live offset per part, eased toward its target every frame. */
	let progress = new Map<string, number>();

	function targetFor(part: DioramaPart): number {
		return Math.max(explode, detached.includes(part.id) ? 1 : 0);
	}

	function directionFor(part: DioramaPart): Vector3 {
		const override = authored.get(part.id)?.dir;
		return override ? new Vector3(override[0], override[1], override[2]) : part.dir;
	}

	useTask((delta) => {
		if (parts.length === 0) return;
		const step = delta * 4;
		for (const part of parts) {
			const target = targetFor(part);
			const current = progress.get(part.id) ?? 0;
			const next =
				current < target ? Math.min(target, current + step) : Math.max(target, current - step);
			if (next === current && current === target) continue;
			progress.set(part.id, next);

			const dir = directionFor(part);
			part.group.position.set(dir.x * next, dir.y * next, dir.z * next);
		}
	});

	/**
	 * X-ray and selection both restyle the same materials, so they are applied
	 * together — two effects writing `opacity` would race and leave a piece
	 * stuck half-faded.
	 *
	 * A material's authored emissive strength (lava, cursed veins) is stashed on
	 * first touch, so highlighting a piece and then deselecting it restores the
	 * glow the builder intended instead of flattening it to 1.
	 */
	$effect(() => {
		for (const part of parts) {
			const active = selectedPart === part.id;
			const dimmed = !!selectedPart && !active;
			part.group.traverse((child: Object3D) => {
				if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
				const material = child.material;
				material.userData.baseEmissive ??= material.emissiveIntensity;

				material.wireframe = xray;
				material.transparent = xray || dimmed;
				material.opacity = xray ? 0.55 : dimmed ? 0.45 : 1;
				material.emissiveIntensity = active
					? Math.max(material.userData.baseEmissive as number, 0.6)
					: (material.userData.baseEmissive as number);
				material.needsUpdate = true;
			});
		}
	});

	/** Walk up from the hit mesh to the part group it belongs to. */
	function partIdOf(object: Object3D): string | null {
		let current: Object3D | null = object;
		while (current) {
			if (current.userData?.part) return current.userData.part as string;
			current = current.parent;
		}
		return null;
	}

	let camera = $state<PerspectiveCamera | undefined>();
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	fov={45}
	near={0.1}
	far={400}
	position={[8, 6.5, 11]}
>
	<OrbitControls
		enableDamping
		dampingFactor={0.06}
		target={[0, 2.4, 0]}
		minDistance={5}
		maxDistance={40}
		maxPolarAngle={Math.PI / 1.9}
	/>
</T.PerspectiveCamera>

<T.HemisphereLight args={['#cfe6ff', '#1b2430', 0.85]} />
<T.DirectionalLight
	position={[9, 14, 7]}
	intensity={2.0}
	color="#fff2dd"
	castShadow={quality.shadows}
/>
<T.DirectionalLight position={[-11, 5, -8]} intensity={0.65} color="#6fc4ff" />

<!-- Ground disc: gives the pieces something to be lifted away from. -->
<T.Mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={quality.shadows}>
	<T.CircleGeometry args={[11, 48]} />
	<T.MeshStandardMaterial color="#111a24" roughness={0.95} metalness={0} />
</T.Mesh>

<!-- Clicking past the building clears the callout. -->
<T.Mesh onclick={() => onselectpart?.(null)}>
	<T.SphereGeometry args={[220, 8, 8]} />
	<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} side={1} />
</T.Mesh>

{#if diorama}
	<T
		is={diorama}
		onclick={(event: { stopPropagation: () => void; object: Object3D }) => {
			event.stopPropagation();
			onselectpart?.(partIdOf(event.object));
		}}
	/>
{/if}
