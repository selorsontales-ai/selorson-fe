<script lang="ts">
	/**
	 * L1 — the whole world at once.
	 *
	 * Lives inside a Threlte `<Canvas>`. Owns the camera, the planet and every
	 * marker; the surrounding page owns the HUD. Selecting a marker eases the
	 * camera onto it and stops the idle spin, which is also the hand-off point
	 * into the region scene.
	 */
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import { PerspectiveCamera, Vector3 } from 'three';
	import { Group } from 'three';
	import { GLOBE_RADIUS } from '../config';
	import type { QualitySettings } from '../quality';
	import type { WorldNode } from '../types';
	import Marker from './Marker.svelte';
	import Planet from './Planet.svelte';

	interface Props {
		/** Placed nodes only — regions and locations, characters are drawn elsewhere. */
		nodes: Array<WorldNode & { lat: number; lng: number }>;
		quality: QualitySettings;
		selected?: WorldNode | null;
		hovered?: WorldNode | null;
		onselect?: (node: WorldNode | null) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let {
		nodes,
		quality,
		selected = null,
		hovered = null,
		onselect,
		onhover
	}: Props = $props();

	interactivity();

	const HOME = new Vector3(0, 4.5, 15);
	/** How close the camera settles when inspecting one place. */
	const FOCUS_DISTANCE = GLOBE_RADIUS * 2.35;

	let camera = $state<PerspectiveCamera | undefined>();
	let globeGroup = $state<Group | undefined>();
	let flyTarget = $state<Vector3 | null>(null);

	// Idle spin stops the moment the reader is looking at something specific.
	let autoRotate = $derived(!selected && !hovered);

	/**
	 * Markers are children of the spinning globe, so their world position has to
	 * be read through the group transform before the camera can aim at it.
	 */
	function worldPositionOf(node: WorldNode & { lat: number; lng: number }): Vector3 {
		const local = latLngLocal(node);
		if (!globeGroup) return local;
		globeGroup.updateMatrixWorld();
		return local.applyMatrix4(globeGroup.matrixWorld);
	}

	function latLngLocal(node: WorldNode & { lat: number; lng: number }): Vector3 {
		const phi = (90 - node.lat) * (Math.PI / 180);
		const theta = (node.lng + 180) * (Math.PI / 180);
		const r = GLOBE_RADIUS * (1 + node.alt);
		return new Vector3(
			-(r * Math.sin(phi) * Math.cos(theta)),
			r * Math.cos(phi),
			r * Math.sin(phi) * Math.sin(theta)
		);
	}

	$effect(() => {
		if (!selected || selected.lat == null || selected.lng == null) {
			return;
		}
		const target = worldPositionOf(selected as WorldNode & { lat: number; lng: number });
		flyTarget = target.normalize().multiplyScalar(FOCUS_DISTANCE);
	});

	export function flyHome() {
		flyTarget = HOME.clone();
	}

	useTask(
		(delta) => {
			if (!camera || !flyTarget) return;
			// Frame-rate independent easing — same curve at 30fps and 144fps.
			const t = 1 - Math.pow(0.0015, delta);
			camera.position.lerp(flyTarget, t);
			if (camera.position.distanceTo(flyTarget) < 0.02) {
				camera.position.copy(flyTarget);
				flyTarget = null;
			}
		},
		{ running: () => !!camera && !!flyTarget }
	);
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	fov={45}
	near={0.1}
	far={800}
	position={[HOME.x, HOME.y, HOME.z]}
>
	<OrbitControls
		enableDamping
		dampingFactor={0.06}
		rotateSpeed={0.55}
		enablePan={false}
		minDistance={GLOBE_RADIUS * 1.35}
		maxDistance={GLOBE_RADIUS * 6}
	/>
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.55} />
<T.DirectionalLight position={[15, 12, 12]} intensity={1.35} color="#fff8ee" />
<T.DirectionalLight position={[-15, -8, -12]} intensity={0.6} color="#00f0ff" />

<!-- Clicking empty space clears the selection and releases the camera. -->
<T.Mesh
	onclick={() => {
		onselect?.(null);
		flyTarget = HOME.clone();
	}}
>
	<T.SphereGeometry args={[400, 8, 8]} />
	<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} side={1} />
</T.Mesh>

<Planet {quality} {autoRotate} bind:group={globeGroup}>
	{#each nodes as node (node.id)}
		<Marker
			{node}
			radius={GLOBE_RADIUS}
			selected={selected?.id === node.id}
			hovered={hovered?.id === node.id}
			onselect={(n) => onselect?.(n)}
			onhover={(n) => onhover?.(n)}
		/>
	{/each}
</Planet>
