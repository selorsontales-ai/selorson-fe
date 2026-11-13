<script lang="ts">
	/**
	 * Orbital-Scale Planetary Phenomena (`Tầng 1`):
	 *
	 * Strictly zero low-poly trees, crystals, octagonal floating islands, or cartoon
	 * wireframe cages. Renders only physically & canonically coherent orbital features:
	 * 1. Akunalia's gossamer Primordial Crystal Dust Ring (`Vành bụi tinh thể nguyên sơ`)
	 *    with real planetary shadow casting on the night side.
	 * 2. Earth's spoiler-gated Timeline 2 `Diệt Thần Tiễn` 500-year trajectory arc
	 *    (`Olympus ~800 BCE -> Mount Meru ~300 BCE`).
	 */
	import { T, useTask } from '@threlte/core';
	import { AdditiveBlending, BufferGeometry, Vector3 } from 'three';
	import type { WorldTimeline } from '../cosmos';
	import { arcPoints } from '../projection';
	import type { QualitySettings } from '../quality';
	import type { GeoPlanetKey, PlanetGeoBundle } from './geo-data.svelte';
	import { createPlanetaryRingMaterial } from './planet-shaders';

	interface Props {
		planetKey: GeoPlanetKey;
		radius: number;
		quality: QualitySettings;
		geo: PlanetGeoBundle | null;
		sunDir?: Vector3;
		planetWorldPos?: Vector3;
		timeline?: WorldTimeline;
		unshieldedTimeline2?: boolean;
		daylightBlend?: number;
	}

	let {
		planetKey,
		radius,
		quality,
		geo,
		sunDir = new Vector3(-0.62, 0.18, 0.76).normalize(),
		planetWorldPos = new Vector3(0, 0, 0),
		timeline = 1,
		unshieldedTimeline2 = false,
		daylightBlend = 0
	}: Props = $props();

	const innerRingR = $derived(radius * 1.46);
	const outerRingR = $derived(radius * 2.16);

	const akunaliaRingMat = $derived.by(() => {
		if (planetKey !== 'akunalia' || quality.tier === 'low') return null;
		return createPlanetaryRingMaterial({
			style: 'akunalia',
			planetRadius: radius,
			innerRadius: innerRingR,
			outerRadius: outerRingR
		});
	});

	$effect(() => {
		const mat = akunaliaRingMat;
		return () => mat?.dispose();
	});

	$effect(() => {
		if (!akunaliaRingMat) return;
		akunaliaRingMat.uniforms.uSunDir.value.copy(sunDir);
		akunaliaRingMat.uniforms.uPlanetCenter.value.copy(planetWorldPos);
		akunaliaRingMat.uniforms.uDaylightMode.value = daylightBlend;
	});

	let dietThanTienArc = $derived.by(() => {
		if (planetKey !== 'earth' || timeline !== 2 || !unshieldedTimeline2) return null;
		const rOlympus = geo ? geo.sampleSurfaceRadius(40.09, 22.36, radius, quality.displacement) : radius;
		const rMeru = geo ? geo.sampleSurfaceRadius(28.65, 81.2, radius, quality.displacement) : radius;
		const altOlympus = Math.max(0.015, (rOlympus - radius) / radius + 0.012);
		const altMeru = Math.max(0.018, (rMeru - radius) / radius + 0.015);
		const pts = arcPoints(
			{ lat: 40.09, lng: 22.36, alt: altOlympus },
			{ lat: 28.65, lng: 81.2, alt: altMeru },
			radius,
			72
		);
		return new BufferGeometry().setFromPoints(pts);
	});

	$effect(() => {
		const arc = dietThanTienArc;
		return () => arc?.dispose();
	});

	useTask(
		(delta) => {
			if (akunaliaRingMat) {
				akunaliaRingMat.uniforms.uTime.value =
					(akunaliaRingMat.uniforms.uTime.value as number) + delta;
			}
		},
		{ running: () => !quality.reducedMotion && Boolean(akunaliaRingMat) }
	);
</script>

{#if planetKey === 'akunalia' && akunaliaRingMat}
	<!-- Gossamer Primordial Crystal Dust Ring inclined gently in Akunalia's equatorial plane -->
	<T.Mesh rotation.x={Math.PI / 2 - 0.11} rotation.y={0.18}>
		<T.RingGeometry args={[innerRingR, outerRingR, quality.tier === 'high' ? 160 : 96, 1]} />
		<T is={akunaliaRingMat} attach="material" />
	</T.Mesh>
{/if}

{#if planetKey === 'earth' && dietThanTienArc}
	<T.Line geometry={dietThanTienArc}>
		<T.LineBasicMaterial
			color="#fde047"
			transparent
			opacity={0.92}
			blending={AdditiveBlending}
		/>
	</T.Line>
{/if}
