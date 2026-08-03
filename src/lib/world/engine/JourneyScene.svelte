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
	import { BufferGeometry, Group, PerspectiveCamera, Vector3 } from 'three';
	import { resolveAvatar } from '../avatar';
	import { GLOBE_RADIUS } from '../config';
	import { arcPoints, latLngToVector3 } from '../projection';
	import type { QualitySettings } from '../quality';
	import type { JourneyStop, WorldNode } from '../types';
	import Avatar from './Avatar.svelte';
	import Marker from './Marker.svelte';
	import Planet from './Planet.svelte';

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

	/** One arc per hop. Hops that do not move are kept for indexing but not drawn. */
	let segments = $derived.by(() =>
		waypoints.slice(0, -1).map((from, i) => {
			const to = waypoints[i + 1];
			const points = arcPoints(
				{ lat: from.place.lat, lng: from.place.lng, alt: from.place.alt },
				{ lat: to.place.lat, lng: to.place.lng, alt: to.place.alt },
				GLOBE_RADIUS + 0.06
			);
			return {
				points,
				geometry: new BufferGeometry().setFromPoints(points),
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

	useTask((delta) => {
		const max = Math.max(waypoints.length - 1, 0);
		const target = Math.max(0, Math.min(position, max));
		if (Math.abs(travelled - target) < 0.001) {
			travelled = target;
			return;
		}
		travelled += (target - travelled) * Math.min(1, delta * 4);
	});

	let avatarPosition = $derived.by(() => {
		if (waypoints.length === 0) return new Vector3(0, GLOBE_RADIUS + 0.2, 0);
		const clamped = Math.max(0, Math.min(travelled, waypoints.length - 1));
		const index = Math.floor(clamped);
		const frac = clamped - index;

		if (frac < 0.001 || index >= segments.length) {
			const at = waypoints[Math.min(index, waypoints.length - 1)].place;
			return latLngToVector3(at.lat, at.lng, GLOBE_RADIUS + 0.12, at.alt);
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
	const FOLLOW_DISTANCE = GLOBE_RADIUS * 2.6;

	useTask((delta) => {
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
	});

	let currentIndex = $derived(Math.round(travelled));

	/** One marker per distinct place, so a place revisited is not drawn twice. */
	let markers = $derived.by(() => {
		const seen = new Map<number, PlacedNode>();
		for (const waypoint of waypoints) seen.set(waypoint.place.id, waypoint.place);
		return [...seen.values()];
	});

	let currentPlaceId = $derived(waypoints[currentIndex]?.place.id ?? null);
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
		enableDamping
		dampingFactor={0.06}
		enablePan={false}
		minDistance={GLOBE_RADIUS * 1.4}
		maxDistance={GLOBE_RADIUS * 5}
	/>
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[15, 12, 12]} intensity={1.3} color="#fff8ee" />
<T.DirectionalLight position={[-15, -8, -12]} intensity={0.55} color="#00f0ff" />

<Planet {quality} autoRotate={false} bind:group={globeGroup}>
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
			selected={place.id === currentPlaceId}
			hovered={false}
			onselect={() => {
				const index = waypoints.findIndex((w) => w.place.id === place.id);
				if (index >= 0) onstop?.(index);
			}}
		/>
	{/each}

	{#if waypoints.length}
		<Avatar
			node={character}
			position={[avatarPosition.x, avatarPosition.y, avatarPosition.z]}
			size={0.6}
			highlighted
		/>
	{/if}
</Planet>
