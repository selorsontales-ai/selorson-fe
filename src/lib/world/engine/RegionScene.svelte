<script lang="ts">
	/**
	 * L2 — one region, close up.
	 *
	 * The ground is cut from the region's GeoJSON outline; the places inside it
	 * stand as pins that grow into dioramas when touched. A floating region
	 * (`alt > 0`) is lifted bodily off the base plane and given a tether, so the
	 * height the globe promised is the height the reader arrives at.
	 */
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import { PerspectiveCamera, Vector3, type BufferGeometry } from 'three';
	import { featureRings, fetchRegionGeometry, isPlaced } from '../api';
	import { buildFallbackGround, buildRegionGround } from '../builders/terrain';
	import { centroidOf, regionProjection } from '../projection';
	import type { QualitySettings } from '../quality';
	import type { WorldNode } from '../types';
	import Landmark from './Landmark.svelte';

	interface Props {
		region: WorldNode;
		places: WorldNode[];
		quality: QualitySettings;
		selected?: WorldNode | null;
		hovered?: WorldNode | null;
		onselect?: (node: WorldNode | null) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let {
		region,
		places,
		quality,
		selected = null,
		hovered = null,
		onselect,
		onhover
	}: Props = $props();

	interactivity();

	let placed = $derived(places.filter(isPlaced));

	/**
	 * Centre the diorama on the region's own coordinate when it has one,
	 * otherwise on the middle of its places — a region with no coordinate is a
	 * data gap, not a reason to render nothing.
	 */
	let centre = $derived(
		region.lat != null && region.lng != null
			? { lat: region.lat, lng: region.lng }
			: centroidOf(placed.map((p) => ({ lat: p.lat!, lng: p.lng! })))
	);

	let projection = $derived(regionProjection(centre));

	/** Lift for a floating region — the reason Skyland reads as airborne. */
	let groundLift = $derived(region.alt * 9 * 12);

	let ground = $state<BufferGeometry | null>(null);
	let hasOutline = $state(false);

	$effect(() => {
		let cancelled = false;
		const proj = projection;
		const slug = region.slug;

		fetchRegionGeometry().then((collection) => {
			if (cancelled) return;
			const feature = collection?.features.find((f) => f.properties.region === slug);
			const built = feature ? buildRegionGround(featureRings(feature), proj) : null;
			ground?.dispose();
			ground = built ?? buildFallbackGround(proj.radius * 1.6);
			hasOutline = !!built;
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => () => ground?.dispose());

	// ── camera ──
	const HOME = new Vector3(0, 16, 22);
	let camera = $state<PerspectiveCamera | undefined>();
	let flyTarget = $state<Vector3 | null>(null);

	$effect(() => {
		if (!selected || selected.lat == null || selected.lng == null) return;
		const p = projection.project(selected.lat, selected.lng, region.alt);
		flyTarget = new Vector3(p.x + 3.5, p.y + 5, p.z + 6.5);
	});

	useTask(
		(delta) => {
			if (!camera || !flyTarget) return;
			const t = 1 - Math.pow(0.0015, delta);
			camera.position.lerp(flyTarget, t);
			if (camera.position.distanceTo(flyTarget) < 0.05) {
				camera.position.copy(flyTarget);
				flyTarget = null;
			}
		},
		{ running: () => !!camera && !!flyTarget }
	);

	let groundColor = $derived(region.palette?.[0] ?? (hasOutline ? '#3f5f4a' : '#243244'));
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	fov={42}
	near={0.5}
	far={900}
	position={[HOME.x, HOME.y + groundLift, HOME.z]}
>
	<OrbitControls
		enableDamping
		dampingFactor={0.06}
		target={[0, groundLift, 0]}
		maxPolarAngle={Math.PI / 2.1}
		minDistance={6}
		maxDistance={90}
	/>
</T.PerspectiveCamera>

<T.HemisphereLight args={['#9fc8e8', '#1c3044', 0.95]} />
<T.DirectionalLight
	position={[24, 42, 18]}
	intensity={2.1}
	color="#ffd9a0"
	castShadow={quality.shadows}
/>
<T.DirectionalLight position={[-30, 14, -20]} intensity={0.6} color="#4fb3ff" />

<!-- Sea plane. Sits below a floating region so the drop is visible. -->
<T.Mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={quality.shadows}>
	<T.PlaneGeometry args={[600, 600]} />
	<T.MeshStandardMaterial color="#0c2434" roughness={0.35} metalness={0.25} />
</T.Mesh>

<T.Group position={[0, groundLift, 0]}>
	{#if ground}
		<T.Mesh receiveShadow={quality.shadows} castShadow={quality.shadows}>
			<T is={ground} attach="geometry" />
			<T.MeshStandardMaterial color={groundColor} roughness={0.86} metalness={0.03} />
		</T.Mesh>
	{/if}

	{#each placed as place (place.id)}
		{@const p = projection.project(place.lat!, place.lng!, 0)}
		<Landmark
			node={place}
			position={new Vector3(p.x, 0.55, p.z)}
			active={hovered?.id === place.id}
			selected={selected?.id === place.id}
			onselect={(node) => onselect?.(node)}
			onhover={(node) => onhover?.(node)}
		/>
	{/each}
</T.Group>

{#if groundLift > 0.01}
	<!-- Tether down to sea level: without it a lifted region just floats in a void. -->
	<T.Mesh position={[0, groundLift / 2, 0]}>
		<T.CylinderGeometry args={[0.35, 0.9, groundLift, 10, 1, true]} />
		<T.MeshBasicMaterial color="#bfe9ff" transparent opacity={0.16} side={2} depthWrite={false} />
	</T.Mesh>
{/if}
