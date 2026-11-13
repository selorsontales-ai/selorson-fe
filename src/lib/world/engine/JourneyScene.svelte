<script lang="ts">
	/**
	 * L4 — one character's path across the world.
	 *
	 * The globe stops turning and the character walks it, chapter by chapter.
	 * Segments already travelled burn bright; the road ahead stays dim, and the
	 * path simply ends where the reader's progress ends — a journey cannot show
	 * you where someone goes in a chapter you have not read.
	 *
	 * A chapter that tags the character but no new place is not a gap: the
	 * character stays where they were, which is what actually happened.
	 */
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { BufferGeometry, Group, PerspectiveCamera, Vector3 } from 'three';
	import { resolveAvatar } from '../avatar';
	import { GLOBE_RADIUS } from '../config';
	import { resolveNodePlanet } from '../cosmos';
	import { arcPoints, latLngToVector3 } from '../projection';
	import type { QualitySettings } from '../quality';
	import type { JourneyStop, WorldNode } from '../types';
	import Avatar from './Avatar.svelte';
	import Marker from './Marker.svelte';
	import { releaseOrbitControlsDocumentListeners } from './orbit-controls-release';
	import Planet from './Planet.svelte';
	import type { GeoPlanetKey, PlanetGeoBundle } from './geo-data.svelte';

	type PlacedNode = WorldNode & { lat: number; lng: number };

	interface Props {
		character: WorldNode;
		/** Unlocked stops, in chapter order. */
		stops: JourneyStop[];
		quality: QualitySettings;
		/** Travel position in stop indices: 1.5 is halfway from stop 1 to stop 2. */
		position?: number;
		onstop?: (index: number) => void;
	}

	let { character, stops, quality, position = 0, onstop }: Props = $props();

	interactivity();

	let geoBundle = $state<PlanetGeoBundle | null>(null);

	function placedIn(stop: JourneyStop): PlacedNode | null {
		return (
			(stop.places.find(
				(p) => typeof p.lat === 'number' && typeof p.lng === 'number' && p.state !== 'hidden'
			) as PlacedNode | undefined) ?? null
		);
	}

	/**
	 * One waypoint per stop, so timeline index and travel position are the same
	 * number everywhere. Stops before the first known location borrow it, so the
	 * character starts somewhere real rather than at the planet's core.
	 */
	let waypoints = $derived.by(() => {
		let anchor: PlacedNode | null = null;
		for (const stop of stops) {
			anchor = placedIn(stop);
			if (anchor) break;
		}
		if (!anchor) return [] as Array<{ stop: JourneyStop; place: PlacedNode }>;

		let last: PlacedNode = anchor;
		return stops.map((stop) => {
			const place = placedIn(stop) ?? last;
			last = place;
			return { stop, place };
		});
	});

	let planetKey = $derived<GeoPlanetKey>(
		resolveNodePlanet(waypoints[0]?.place ?? character) === 'earth' ? 'earth' : 'akunalia'
	);

	function surfaceRadiusAt(lat: number, lng: number): number {
		return geoBundle
			? geoBundle.sampleSurfaceRadius(lat, lng, GLOBE_RADIUS, quality.displacement)
			: GLOBE_RADIUS;
	}

	function totalAltAt(place: PlacedNode, liftUnits = 0.06): number {
		const surfR = surfaceRadiusAt(place.lat, place.lng);
		const terrainAlt = (surfR - GLOBE_RADIUS) / GLOBE_RADIUS;
		return (place.alt ?? 0) + terrainAlt + liftUnits / GLOBE_RADIUS;
	}

	/** One arc per hop, lifted above displaced 3D mountains so paths never tunnel underground. */
	let segments = $derived.by(() =>
		waypoints.slice(0, -1).map((from, i) => {
			const to = waypoints[i + 1];
			const rawPoints = arcPoints(
				{ lat: from.place.lat, lng: from.place.lng, alt: totalAltAt(from.place, 0.06) },
				{ lat: to.place.lat, lng: to.place.lng, alt: totalAltAt(to.place, 0.06) },
				GLOBE_RADIUS
			);
			return {
				points: rawPoints,
				geometry: new BufferGeometry().setFromPoints(rawPoints),
				moves: from.place.id !== to.place.id
			};
		})
	);

	$effect(() => {
		const current = segments;
		return () => current.forEach((s) => s.geometry.dispose());
	});

	// Path colour is fixed for the scene: the route remounts when the character
	// changes, so reading it once at setup is intentional.
	function initialSpec() {
		return resolveAvatar(character);
	}
	const spec = initialSpec();

	/** Smoothed travel, so scrubbing the timeline glides rather than jumps. */
	let travelled = $state(0);

	useTask(
		(delta) => {
			const max = Math.max(waypoints.length - 1, 0);
			const target = Math.max(0, Math.min(position, max));
			if (Math.abs(travelled - target) < 0.001) {
				travelled = target;
				return;
			}
			travelled += (target - travelled) * Math.min(1, delta * 4);
		},
		{
			running: () => {
				const max = Math.max(waypoints.length - 1, 0);
				const target = Math.max(0, Math.min(position, max));
				return Math.abs(travelled - target) >= 0.001;
			}
		}
	);

	let avatarPosition = $derived.by(() => {
		if (waypoints.length === 0) return new Vector3(0, GLOBE_RADIUS + 0.2, 0);
		const clamped = Math.max(0, Math.min(travelled, waypoints.length - 1));
		const index = Math.floor(clamped);
		const frac = clamped - index;

		if (frac < 0.001 || index >= segments.length) {
			const at = waypoints[Math.min(index, waypoints.length - 1)].place;
			const surfR = surfaceRadiusAt(at.lat, at.lng);
			return latLngToVector3(at.lat, at.lng, surfR + 0.14, at.alt);
		}
		const points = segments[index].points;
		const t = frac * (points.length - 1);
		const low = Math.floor(t);
		const high = Math.min(points.length - 1, low + 1);
		return points[low].clone().lerp(points[high], t - low);
	});

	// ── camera ──
	let camera = $state<PerspectiveCamera | undefined>();
	let globeGroup = $state<Group | undefined>();
	let cameraMoving = $state(true);
	const FOLLOW_DISTANCE = GLOBE_RADIUS * 2.6;

	$effect(() => {
		avatarPosition;
		cameraMoving = waypoints.length > 0;
	});

	useTask(
		(delta) => {
			if (!camera || waypoints.length === 0) return;
			// The path rides inside the globe frame, so the follow target has to be
			// read through it even though the globe is not spinning here.
			const local = avatarPosition.clone();
			if (globeGroup) {
				globeGroup.updateMatrixWorld();
				local.applyMatrix4(globeGroup.matrixWorld);
			}
			const want = local.normalize().multiplyScalar(FOLLOW_DISTANCE);
			camera.position.lerp(want, Math.min(1, delta * 1.6));
			if (camera.position.distanceTo(want) < 0.02) {
				camera.position.copy(want);
				cameraMoving = false;
			}
		},
		{ running: () => cameraMoving && !!camera && waypoints.length > 0 }
	);

	let currentIndex = $derived(Math.round(travelled));

	/** One marker per distinct place, so a place revisited is not drawn twice. */
	let markers = $derived.by(() => {
		const seen = new Map<number, PlacedNode>();
		for (const waypoint of waypoints) seen.set(waypoint.place.id, waypoint.place);
		return [...seen.values()];
	});

	let currentPlaceId = $derived(waypoints[currentIndex]?.place.id ?? null);

	let controlsRef = $state<ThreeOrbitControls | undefined>();
	// three r185 OrbitControls bỏ sót listener 'keydown' trên document khi dispose sau lúc DOM đã bị tháo
	// (giữ cả canvas + context WebGL sau khi rời trang) → gỡ thẳng khi scene hủy.
	$effect(() => {
		const c = controlsRef;
		return () => releaseOrbitControlsDocumentListeners(c);
	});
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	fov={45}
	near={0.1}
	far={800}
	position={[0, 4.5, 15]}
>
	<OrbitControls
		bind:ref={controlsRef}
		enableDamping
		dampingFactor={0.06}
		enablePan={false}
		minDistance={GLOBE_RADIUS * 1.4}
		maxDistance={GLOBE_RADIUS * 5}
	/>
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.04} color="#0b1326" />
<T.DirectionalLight position={[-18, 8, 22]} intensity={1.55} color="#fff6eb" />

<Planet {quality} {planetKey} autoRotate={false} bind:geoBundle bind:group={globeGroup}>
	{#each segments as segment, i (i)}
		{#if segment.moves}
			<T.Line>
				<T is={segment.geometry} attach="geometry" />
				<T.LineBasicMaterial
					color={i < currentIndex ? spec.color : '#475569'}
					transparent
					opacity={i < currentIndex ? 0.95 : 0.35}
				/>
			</T.Line>
		{/if}
	{/each}

	{#each markers as place (place.id)}
		<Marker
			node={place}
			radius={GLOBE_RADIUS}
			surfaceRadius={surfaceRadiusAt(place.lat, place.lng)}
			selected={place.id === currentPlaceId}
			hovered={false}
			onselect={() => {
				const index = waypoints.findIndex((w) => w.place.id === place.id);
				if (index >= 0) onstop?.(index);
			}}
		/>
	{/each}

	{#if waypoints.length}
		<!-- Full figure here: the reader is watching them travel, not scanning a
		     map, so the body slot is the one that suits. -->
		<Avatar
			node={character}
			position={[avatarPosition.x, avatarPosition.y, avatarPosition.z]}
			size={0.6}
			variant="body"
			highlighted
		/>
	{/if}
</Planet>

