<script lang="ts">
	/**
	 * Astronomical Celestial Body Renderer (`SolarBody.svelte`):
	 *
	 * Renders stars (`Sun`, `Solis Prime`), rocky planets & moons (`Mercury`, `Venus`,
	 * `Moon`, `Selene-Prime`, `Noctis`, `Mars`), and gas/ice giants (`Jupiter` with Great
	 * Red Spot, `Saturn` with bidirectional Cassini ring shadows, `Uranus` at 97.8° tilt,
	 * and `Neptune`) inside the Dynamic Reference Frame.
	 */
	import { T, useTask } from '@threlte/core';
	import { Group, Vector3 } from 'three';
	import type { CelestialBodySpec } from '../cosmos';
	import type { QualitySettings } from '../quality';
	import {
		createAtmosphereMaterial,
		createPlanetaryRingMaterial,
		createProceduralBodyMaterial,
		createSolarCoronaMaterial,
		createStarPlasmaMaterial,
		type ProceduralBodyStyle
	} from './planet-shaders';

	interface Props {
		spec: CelestialBodySpec;
		quality: QualitySettings;
		sunDir: Vector3;
		worldPos: Vector3;
		daylightBlend?: number;
		autoRotate?: boolean;
		onselectbody?: () => void;
	}

	let {
		spec,
		quality,
		sunDir,
		worldPos,
		daylightBlend = 0,
		autoRotate = true,
		onselectbody
	}: Props = $props();

	let spinGroup = $state<Group | undefined>();
	let tiltGroup = $state<Group | undefined>();

	const isStar = $derived(spec.kind === 'star');
	const segments = $derived(
		quality.tier === 'high' ? 112 : quality.tier === 'medium' ? 72 : 40
	);

	const starSurfaceMat = $derived.by(() => {
		if (!isStar) return null;
		return spec.id === 'akunalia_star'
			? createStarPlasmaMaterial({
					coreColor: '#fff2cc',
					edgeColor: '#ff7e1c',
					spotColor: '#2b0900'
				})
			: createStarPlasmaMaterial({
					coreColor: '#ffe79e',
					edgeColor: '#ff4d00',
					spotColor: '#1f0500'
				});
	});

	const coronaMat = $derived.by(() => {
		if (!isStar) return null;
		return createSolarCoronaMaterial(spec.id === 'akunalia_star' ? '#ffa23a' : '#ff7315');
	});

	const bodyMat = $derived.by(() => {
		if (isStar) return null;
		return createProceduralBodyMaterial({
			style: spec.id as ProceduralBodyStyle,
			radius: spec.radius
		});
	});

	const atmosphereConfig = $derived.by(() => {
		switch (spec.id) {
			case 'venus':
				return { day: '#f5cb86', sunset: '#d97706', intensity: 0.95 };
			case 'mars':
				return { day: '#e07a48', sunset: '#c2410c', intensity: 0.55 };
			case 'jupiter':
				return { day: '#e5be8a', sunset: '#c26d38', intensity: 0.60 };
			case 'saturn':
				return { day: '#ead29c', sunset: '#ca8a04', intensity: 0.58 };
			case 'uranus':
				return { day: '#7dd3fc', sunset: '#38bdf8', intensity: 0.72 };
			case 'neptune':
				return { day: '#3b82f6', sunset: '#1d4ed8', intensity: 0.85 };
			default:
				return null;
		}
	});

	const atmoMat = $derived.by(() => {
		if (!atmosphereConfig || !quality.atmosphere) return null;
		return createAtmosphereMaterial({
			dayColor: atmosphereConfig.day,
			sunsetColor: atmosphereConfig.sunset,
			intensity: atmosphereConfig.intensity
		});
	});

	const ringConfig = $derived.by(() => {
		if (spec.id === 'saturn') {
			return {
				style: 'saturn' as const,
				inner: spec.radius * 1.24,
				outer: spec.radius * 2.32
			};
		}
		if (spec.id === 'uranus') {
			return {
				style: 'uranus' as const,
				inner: spec.radius * 1.42,
				outer: spec.radius * 1.88
			};
		}
		return null;
	});

	const ringMat = $derived.by(() => {
		if (!ringConfig) return null;
		return createPlanetaryRingMaterial({
			style: ringConfig.style,
			planetRadius: spec.radius,
			innerRadius: ringConfig.inner,
			outerRadius: ringConfig.outer
		});
	});

	// Compute world-space equatorial ring normal from axialTiltDeg (`rotation.z = -tiltRad`)
	const tiltRad = $derived(-(spec.axialTiltDeg * Math.PI) / 180);
	const ringWorldNormal = $derived(
		new Vector3(-Math.sin(tiltRad), Math.cos(tiltRad), 0).normalize()
	);

	$effect(() => {
		const sM = starSurfaceMat;
		const cM = coronaMat;
		const bM = bodyMat;
		const aM = atmoMat;
		const rM = ringMat;
		return () => {
			sM?.dispose();
			cM?.dispose();
			bM?.dispose();
			aM?.dispose();
			rM?.dispose();
		};
	});

	$effect(() => {
		if (bodyMat) {
			bodyMat.uniforms.uSunDir.value.copy(sunDir);
			bodyMat.uniforms.uRingNormal.value.copy(ringWorldNormal);
			bodyMat.uniforms.uDaylightMode.value = daylightBlend;
		}
		if (atmoMat) {
			atmoMat.uniforms.uSunDir.value.copy(sunDir);
			atmoMat.uniforms.uDaylightMode.value = daylightBlend;
		}
		if (ringMat) {
			ringMat.uniforms.uSunDir.value.copy(sunDir);
			ringMat.uniforms.uPlanetCenter.value.copy(worldPos);
			ringMat.uniforms.uDaylightMode.value = daylightBlend;
		}
	});

	useTask(
		(delta) => {
			if (starSurfaceMat) {
				starSurfaceMat.uniforms.uTime.value =
					(starSurfaceMat.uniforms.uTime.value as number) + delta;
			}
			if (coronaMat) {
				coronaMat.uniforms.uTime.value = (coronaMat.uniforms.uTime.value as number) + delta;
			}
			if (bodyMat) {
				bodyMat.uniforms.uTime.value = (bodyMat.uniforms.uTime.value as number) + delta;
			}
			if (ringMat) {
				ringMat.uniforms.uTime.value = (ringMat.uniforms.uTime.value as number) + delta;
			}
			if (spinGroup && autoRotate) {
				spinGroup.rotation.y += delta * spec.spinSpeed;
			}
		},
		{ running: () => !quality.reducedMotion }
	);
</script>

<T.Group
	bind:ref={tiltGroup}
	rotation.z={tiltRad}
	onclick={onselectbody
		? (e: { stopPropagation: () => void }) => {
				e.stopPropagation();
				onselectbody();
			}
		: undefined}
>
	<T.Group bind:ref={spinGroup}>
		<T.Mesh>
			<T.SphereGeometry args={[spec.radius, segments, Math.max(24, Math.floor(segments / 2))]} />
			{#if isStar && starSurfaceMat}
				<T is={starSurfaceMat} attach="material" />
			{:else if bodyMat}
				<T is={bodyMat} attach="material" />
			{/if}
		</T.Mesh>
	</T.Group>

	{#if isStar && coronaMat}
		<!-- Volumetric HDR Solar Corona Shell -->
		<T.Mesh>
			<T.SphereGeometry args={[spec.radius * 1.68, 64, 32]} />
			<T is={coronaMat} attach="material" />
		</T.Mesh>
	{/if}

	{#if atmoMat}
		<T.Mesh>
			<T.SphereGeometry args={[spec.radius * 1.05, 56, 28]} />
			<T is={atmoMat} attach="material" />
		</T.Mesh>
	{/if}

	{#if ringConfig && ringMat}
		<!-- Equatorial Ring Plane (XY rotated 90° around X into planet's tilted XZ equator) -->
		<T.Mesh rotation.x={Math.PI / 2}>
			<T.RingGeometry
				args={[
					ringConfig.inner,
					ringConfig.outer,
					quality.tier === 'high' ? 160 : 96,
					1
				]}
			/>
			<T is={ringMat} attach="material" />
		</T.Mesh>
	{/if}
</T.Group>
