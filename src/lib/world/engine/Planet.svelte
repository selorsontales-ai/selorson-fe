<script lang="ts">
	/**
	 * AAA Terrestrial Living Planet (`Tầng 1` — `Akunalia` & `Earth`):
	 * - Single seamless sphere (`4096×2048` PBR Albedo + `2048×1024` 16-bit Elevation/SDF
	 *   + Tangent Normal/Specular + Night Emissive + Dynamic Lit Cloud Deck)
	 * - Subtle `1.1%` land elevation relief with zero coastal z-fighting or neon outlines
	 * - Real host-star directional lighting, Sunset Terminator Rayleigh/Mie band,
	 *   synchronized cloud shadows, and HDR night-side Lifestream / Black Marble lights
	 *
	 * Backward-compatible with `JourneyScene.svelte` when invoked with `{quality}`.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		BufferAttribute,
		BufferGeometry,
		ClampToEdgeWrapping,
		Group,
		Mesh,
		RepeatWrapping,
		SRGBColorSpace,
		Texture,
		TextureLoader,
		Vector2,
		Vector3
	} from 'three';
	import { GLOBE_RADIUS, PROCEDURAL_WORLD_DATA } from '../config';
	import type { WorldTimeline } from '../cosmos';
	import type { QualitySettings } from '../quality';
	import PlanetEcology from './PlanetEcology.svelte';
	import { loadPlanetGeo, type GeoPlanetKey, type PlanetGeoBundle } from './geo-data.svelte';
	import {
		createAAACloudMaterial,
		createAAAPlanetMaterial,
		createAtmosphereMaterial,
		createSoftPointMaterial
	} from './planet-shaders';
	import { applyAnisotropy } from './textures.svelte';

	interface Props {
		quality: QualitySettings;
		planetKey?: GeoPlanetKey;
		radius?: number;
		axialTiltDeg?: number;
		initialRotationY?: number;
		spinSpeed?: number;
		sunDir?: Vector3;
		planetWorldPos?: Vector3;
		timeline?: WorldTimeline;
		unshieldedTimeline2?: boolean;
		daylightBlend?: number;
		/** Idle spin, paused while the reader is inspecting a marker. */
		autoRotate?: boolean;
		/** Render local starfield (true for standalone scenes like JourneyScene). */
		includeStars?: boolean;
		/** Click handler when clicking this planet in space to center it as the reference frame. */
		onfocusplanet?: () => void;
		/** Bound out so parent scenes can query exact displaced `sampleSurfaceRadius(lat, lng)`. */
		geoBundle?: PlanetGeoBundle | null;
		/** Bound out rotating frame so parent scenes transform local lat/lng into world space. */
		group?: Group;
		/** Markers & journey arcs parented into the planet's rotating frame. */
		children?: import('svelte').Snippet;
	}

	let {
		quality,
		planetKey = 'akunalia',
		radius = GLOBE_RADIUS,
		axialTiltDeg = 0,
		initialRotationY = -((25 + 90) * Math.PI) / 180,
		spinSpeed = 0.024,
		sunDir = new Vector3(-0.62, 0.18, 0.76).normalize(),
		planetWorldPos = new Vector3(0, 0, 0),
		timeline = 1,
		unshieldedTimeline2 = false,
		daylightBlend = 0,
		autoRotate = true,
		includeStars = true,
		onfocusplanet,
		geoBundle = $bindable(null),
		group = $bindable(),
		children
	}: Props = $props();

	const { invalidate, renderer } = useThrelte();

	let widthSegments = $derived(
		quality.tier === 'high' ? 256 : quality.tier === 'medium' ? 160 : 72
	);
	let heightSegments = $derived(Math.max(36, Math.floor(widthSegments / 2)));
	let cloudSegments = $derived(
		quality.tier === 'high' ? 144 : quality.tier === 'medium' ? 96 : 48
	);

	// Cached async texture loader supporting reactive planetKey & RepeatWrapping on longitude
	const texLoader = new TextureLoader();
	const texCache = new Map<string, Promise<Texture | null>>();

	function loadWrappedTexture(url: string, srgb: boolean): Promise<Texture | null> {
		const cacheKey = `${url}|${srgb ? 'srgb' : 'lin'}`;
		const hit = texCache.get(cacheKey);
		if (hit) return hit;

		const p = new Promise<Texture | null>((resolve) => {
			texLoader.load(
				url,
				(tex) => {
					if (srgb) tex.colorSpace = SRGBColorSpace;
					tex.wrapS = RepeatWrapping;
					tex.wrapT = ClampToEdgeWrapping;
					tex.needsUpdate = true;
					resolve(tex);
				},
				undefined,
				() => resolve(null)
			);
		});
		texCache.set(cacheKey, p);
		return p;
	}

	let loadedGeo = $state<PlanetGeoBundle | null>(null);
	let albedoTex = $state<Texture | null>(null);
	let nightTex = $state<Texture | null>(null);
	let cloudsTex = $state<Texture | null>(null);

	function purgeUnusedCachedTextures(keepUrls: Set<string>) {
		for (const [cacheKey, pending] of texCache.entries()) {
			const url = cacheKey.split('|')[0];
			if (!keepUrls.has(url)) {
				texCache.delete(cacheKey);
				void pending.then((t) => t?.dispose());
			}
		}
	}

	let loadedPlanetKey: GeoPlanetKey | null = null;

	$effect(() => {
		let cancelled = false;
		const key = planetKey;
		const useClouds = quality.clouds;
		const spec = PROCEDURAL_WORLD_DATA[key];
		const maxAniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;

		if (loadedPlanetKey !== null && loadedPlanetKey !== key) {
			albedoTex = null;
			nightTex = null;
			cloudsTex = null;
			loadedGeo = null;
		}
		if (!useClouds) {
			cloudsTex = null;
		}
		loadedPlanetKey = key;

		const keepUrls = new Set<string>([spec.albedo, spec.night]);
		if (useClouds) keepUrls.add(spec.clouds);
		purgeUnusedCachedTextures(keepUrls);

		loadPlanetGeo(key).then((bundle) => {
			if (!cancelled) {
				loadedGeo = bundle;
				geoBundle = bundle;
				invalidate();
			}
		});

		loadWrappedTexture(spec.albedo, true).then((tex) => {
			if (!cancelled) {
				applyAnisotropy(tex, maxAniso);
				albedoTex = tex;
				invalidate();
			}
		});

		loadWrappedTexture(spec.night, true).then((tex) => {
			if (!cancelled) {
				applyAnisotropy(tex, maxAniso);
				nightTex = tex;
				invalidate();
			}
		});

		if (useClouds) {
			loadWrappedTexture(spec.clouds, false).then((tex) => {
				if (!cancelled) {
					applyAnisotropy(tex, maxAniso);
					cloudsTex = tex;
					invalidate();
				}
			});
		}

		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		albedoTex = null;
		nightTex = null;
		cloudsTex = null;
		loadedGeo = null;
		purgeUnusedCachedTextures(new Set());
	});

	const CLOUD_DRIFT = 0.0019;

	let planetMat = $derived(
		createAAAPlanetMaterial({
			radius,
			isAkunalia: planetKey === 'akunalia',
			displacementEnabled: quality.displacement,
			atmosphereColor: planetKey === 'akunalia' ? '#2dd4bf' : '#38bdf8',
			sunsetColor: planetKey === 'akunalia' ? '#ff7438' : '#ff6828'
		})
	);

	let cloudMat = $derived(
		createAAACloudMaterial({
			sunsetColor: planetKey === 'akunalia' ? '#ff884c' : '#ff7e3d',
			opacity: planetKey === 'akunalia' ? 0.78 : 0.80
		})
	);

	let atmosphereMat = $derived(
		createAtmosphereMaterial({
			dayColor: planetKey === 'akunalia' ? '#2dd4bf' : '#38bdf8',
			sunsetColor: planetKey === 'akunalia' ? '#ff7438' : '#ff6828',
			intensity: planetKey === 'akunalia' ? 1.05 : 1.0
		})
	);

	$effect(() => {
		const pM = planetMat;
		const cM = cloudMat;
		const aM = atmosphereMat;
		return () => {
			pM.dispose();
			cM.dispose();
			aM.dispose();
		};
	});

	$effect(() => {
		planetMat.uniforms.uAlbedoTex.value = albedoTex;
		planetMat.uniforms.uHasAlbedo.value = albedoTex ? 1.0 : 0.0;

		if (loadedGeo) {
			planetMat.uniforms.uElevSdfTex.value = loadedGeo.elevSdfTex;
			planetMat.uniforms.uNormalSpecTex.value = loadedGeo.normalSpecTex;
			planetMat.uniforms.uTexSize.value = new Vector2(loadedGeo.width, loadedGeo.height);
			planetMat.uniforms.uHasGeo.value = 1.0;
		} else {
			planetMat.uniforms.uHasGeo.value = 0.0;
		}

		planetMat.uniforms.uNightTex.value = nightTex;
		planetMat.uniforms.uHasNight.value = nightTex ? 1.0 : 0.0;

		planetMat.uniforms.uCloudsTex.value = cloudsTex;
		planetMat.uniforms.uHasClouds.value = cloudsTex ? 1.0 : 0.0;
		planetMat.uniforms.uCloudDrift.value = CLOUD_DRIFT;
		planetMat.uniforms.uTimeline.value = timeline;

		cloudMat.uniforms.uCloudsTex.value = cloudsTex;
		cloudMat.uniforms.uHasClouds.value = cloudsTex ? 1.0 : 0.0;

		invalidate();
	});

	$effect(() => {
		planetMat.uniforms.uSunDir.value.copy(sunDir);
		planetMat.uniforms.uDaylightMode.value = daylightBlend;
		cloudMat.uniforms.uSunDir.value.copy(sunDir);
		cloudMat.uniforms.uDaylightMode.value = daylightBlend;
		atmosphereMat.uniforms.uSunDir.value.copy(sunDir);
		atmosphereMat.uniforms.uDaylightMode.value = daylightBlend;
	});

	let cloudsMesh = $state<Mesh | undefined>();
	let initializedSpinFor = $state<string>('');

	$effect(() => {
		const key = `${planetKey}:${initialRotationY}`;
		if (group && initializedSpinFor !== key) {
			group.rotation.y = initialRotationY;
			initializedSpinFor = key;
		}
	});

	useTask(
		(delta) => {
			const nextT = (planetMat.uniforms.uTime.value as number) + delta;
			planetMat.uniforms.uTime.value = nextT;

			if (group && autoRotate) {
				group.rotation.y += delta * spinSpeed;
			}
			// Exact match with `fract(uv.x - uTime * CLOUD_DRIFT)` in createAAAPlanetMaterial!
			if (cloudsMesh) {
				cloudsMesh.rotation.y = nextT * CLOUD_DRIFT * Math.PI * 2;
			}
		},
		{ running: () => !quality.reducedMotion }
	);

	/** Static starfield when rendered standalone (`JourneyScene.svelte`). */
	const stars = $derived.by(() => {
		if (!includeStars || quality.starCount === 0) return null;
		const positions = new Float32Array(quality.starCount * 3);
		const colors = new Float32Array(quality.starCount * 3);
		for (let i = 0; i < quality.starCount; i++) {
			const u = Math.random();
			const v = Math.random();
			const theta = 2 * Math.PI * u;
			const phi = Math.acos(2 * v - 1);
			const r = 135 + Math.random() * 145;
			positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.cos(phi);
			positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
			colors[i * 3] = 0.72 + Math.random() * 0.28;
			colors[i * 3 + 1] = 0.82 + Math.random() * 0.18;
			colors[i * 3 + 2] = 1.0;
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('color', new BufferAttribute(colors, 3));
		return geometry;
	});

	const starMat = $derived.by(() =>
		includeStars && quality.starCount > 0
			? createSoftPointMaterial({ size: 2.1, maxPixelSize: 3.8, opacity: 0.88 })
			: null
	);

	$effect(() => {
		const geo = stars;
		const mat = starMat;
		return () => {
			geo?.dispose();
			mat?.dispose();
		};
	});
</script>

{#if includeStars && stars && starMat}
	<T.Points>
		<T is={stars} attach="geometry" />
		<T is={starMat} attach="material" />
	</T.Points>
{/if}

<!-- Outer Obliquity Frame (Axial Tilt) -> Inner Spin Frame (`group`) -->
<T.Group
	rotation.z={-(axialTiltDeg * Math.PI) / 180}
	onclick={onfocusplanet
		? (e: { stopPropagation: () => void }) => {
				e.stopPropagation();
				onfocusplanet();
			}
		: undefined}
>
	<T.Group bind:ref={group}>
		<!-- 1. Unified Seamless 4K Albedo + 16-Bit Displaced Relief + Normal/Spec + Night Emissive -->
		<T.Mesh>
			<T.SphereGeometry args={[radius, widthSegments, heightSegments]} />
			<T is={planetMat} attach="material" />
		</T.Mesh>

		<!-- 2. Orbital Phenomena (Akunalia Crystal Dust Ring / Earth Timeline 2 Arc) -->
		<PlanetEcology
			{planetKey}
			{radius}
			{quality}
			geo={loadedGeo}
			{sunDir}
			{planetWorldPos}
			{timeline}
			{unshieldedTimeline2}
			{daylightBlend}
		/>

		<!-- 3. Synchronized Dynamic Lit Cloud Deck -->
		{#if quality.clouds && cloudsTex}
			<T.Mesh bind:ref={cloudsMesh}>
				<T.SphereGeometry args={[radius * 1.015, cloudSegments, Math.floor(cloudSegments / 2)]} />
				<T is={cloudMat} attach="material" />
			</T.Mesh>
		{/if}

		<!-- 4. Surface Markers & Journey Arcs -->
		{@render children?.()}
	</T.Group>

	<!-- 5. Rayleigh + Mie Atmospheric Scattering Limb Halo -->
	{#if quality.atmosphere}
		<T.Mesh>
			<T.SphereGeometry args={[radius * 1.058, 72, 36]} />
			<T is={atmosphereMat} attach="material" />
		</T.Mesh>
	{/if}
</T.Group>
