<script lang="ts">
	/**
	 * Seamless Dynamic Reference-Frame Cosmos (`Chặng 1A`):
	 *
	 * - Two strictly independent cosmic sectors:
	 *   1. `akunalia_sector` (Primordial Star `Solis Prime`, `Akunalia` + Crystal Dust Ring,
	 *      and twin moons `Selene-Prime` & `Noctis`).
	 *   2. `solar_system` (`Sun` + all 8 planets `Mercury .. Neptune` + `Moon`).
	 * - Dynamic Reference Frame (`Hệ Quy Chiếu Thiên Thể Tương Đối`):
	 *   Whichever celestial body is selected sits at `(0, 0, 0)` auto-rotating smoothly
	 *   around its axial tilt (`360°` OrbitControls just like original `/world`), while
	 *   all sibling bodies & Keplerian orbit trails move relatively around it.
	 * - Selective HDR Post-Processing (`EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass`).
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls, interactivity } from '@threlte/extras';
	import {
		BufferAttribute,
		BufferGeometry,
		Group,
		HalfFloatType,
		PerspectiveCamera,
		Vector2,
		Vector3,
		WebGLRenderTarget
	} from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
	import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
	import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
	import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
	import {
		CELESTIAL_BODIES,
		SECTOR_BODIES,
		computeSectorSnapshot,
		sampleBodyOrbitLoop,
		type CelestialBodyId,
		type CosmicSectorId,
		type WorldTier,
		type WorldTimeline
	} from '../cosmos';
	import type { QualitySettings } from '../quality';
	import type { WorldNode } from '../types';
	import Marker from './Marker.svelte';
	import { releaseOrbitControlsDocumentListeners } from './orbit-controls-release';
	import Planet from './Planet.svelte';
	import PrismDispersionMoment from './PrismDispersionMoment.svelte';
	import SolarBody from './SolarBody.svelte';
	import type { PlanetGeoBundle } from './geo-data.svelte';
	import { createDeepNebulaMaterial, createSoftPointMaterial } from './planet-shaders';

	interface Props {
		/** Placed nodes on Akunalia. */
		nodes: Array<WorldNode & { lat: number; lng: number }>;
		/** Placed nodes & Singularities on Multi-Era Earth. */
		earthNodes?: Array<WorldNode & { lat: number; lng: number }>;
		quality: QualitySettings;
		tier?: WorldTier;
		activeSector?: CosmicSectorId;
		activePlanet?: CelestialBodyId;
		timeline?: WorldTimeline;
		unshieldedTimeline2?: boolean;
		daylightMode?: boolean;
		prismMomentActive?: boolean;
		eraFocusLatLng?: { lat: number; lng: number } | null;
		selected?: WorldNode | null;
		hovered?: WorldNode | null;
		onselect?: (node: WorldNode | null) => void;
		onhover?: (node: WorldNode | null) => void;
		onselectplanet?: (planet: CelestialBodyId) => void;
		onsettier?: (tier: WorldTier) => void;
	}

	let {
		nodes,
		earthNodes = [],
		quality,
		tier = 1,
		activeSector: sectorProp,
		activePlanet = 'akunalia',
		timeline = 1,
		unshieldedTimeline2 = false,
		daylightMode = false,
		prismMomentActive = false,
		eraFocusLatLng = null,
		selected = null,
		hovered = null,
		onselect,
		onhover,
		onselectplanet,
		onsettier
	}: Props = $props();

	interactivity();
	const { dom, scene, renderer, size, dpr, autoRender, renderStage, invalidate } = useThrelte();

	const effectiveSector = $derived<CosmicSectorId>(
		sectorProp ?? CELESTIAL_BODIES[activePlanet]?.sector ?? 'akunalia_sector'
	);

	// Simulation clock driving Keplerian relative orbital mechanics
	let simTime = $state(0);
	const snapshot = $derived(
		computeSectorSnapshot(effectiveSector, simTime, tier === 0 ? null : activePlanet)
	);
	const sectorBodyIds = $derived(SECTOR_BODIES[effectiveSector]);

	const ORIGIN = new Vector3(0, 0, 0);

	function sectorOverviewCam(sector: CosmicSectorId): Vector3 {
		return sector === 'solar_system'
			? new Vector3(0, 146, 276)
			: new Vector3(0, 34, 82);
	}

	function sectorOverviewTarget(sector: CosmicSectorId): Vector3 {
		return sector === 'solar_system'
			? new Vector3(0, -16, 0)
			: ORIGIN.clone();
	}

	function planetHomeCamera(id: CelestialBodyId): Vector3 {
		const spec = CELESTIAL_BODIES[id];
		const dist = spec.radius * spec.orbitDistanceFactor;
		if (spec.kind === 'star') {
			return new Vector3(0, spec.radius * 0.45, dist);
		}
		if (spec.hasNarrativeMap) {
			return new Vector3(0, spec.radius * 0.56, dist);
		}
		// Automatically frame every Solar System planet/moon at a 3/4 sunlit phase (~39° off host-star vector)
		const s = bodyStarDirVec(id);
		const angle = Math.atan2(s.x, s.z) + 0.68;
		const elevY = spec.hasRings ? spec.radius * 1.22 : spec.radius * 0.62;
		return new Vector3(Math.sin(angle) * dist, elevY, Math.cos(angle) * dist);
	}

	function bodyRelativeVec(id: CelestialBodyId): Vector3 {
		const p = snapshot.bodies[id];
		return p ? new Vector3(p.relativePos[0], p.relativePos[1], p.relativePos[2]) : new Vector3();
	}

	function bodyStarDirVec(id: CelestialBodyId): Vector3 {
		const p = snapshot.bodies[id];
		return p ? new Vector3(p.starDir[0], p.starDir[1], p.starDir[2]) : new Vector3(-0.62, 0.18, 0.76).normalize();
	}

	let camera = $state<PerspectiveCamera | undefined>();
	let controlsRef = $state<ThreeOrbitControls | undefined>();

	// three r185 OrbitControls bỏ sót listener 'keydown' trên document khi dispose sau lúc DOM đã bị tháo
	// (giữ cả canvas + context WebGL sau khi rời trang) → gỡ thẳng khi scene hủy.
	$effect(() => {
		const c = controlsRef;
		return () => releaseOrbitControlsDocumentListeners(c);
	});

	// Smooth Daylight Observation transition (`0.0` Cinematic Day-Night <-> `1.0` ~32° Camera-Locked Daylight)
	let daylightBlend = $state(0);
	let camObliqueSunDir = $state(new Vector3(-0.395, 0.353, 0.848).normalize());

	const tmpView = new Vector3();
	const tmpRight = new Vector3();
	const tmpUp = new Vector3();
	const tmpOblique = new Vector3();

	function updateCameraObliqueSun() {
		if (!camera) return;
		const target = controlsRef ? controlsRef.target : ORIGIN;
		tmpView.copy(camera.position).sub(target);
		if (tmpView.lengthSq() < 1e-6) {
			tmpView.set(0, 0, 1);
		} else {
			tmpView.normalize();
		}
		tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
		tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

		// Exact 32.0° oblique angle off camera view vector (`acos(0.848) ≈ 32°`) so mountains & clouds cast crisp 3D shadows!
		tmpOblique
			.copy(tmpView)
			.multiplyScalar(0.848)
			.addScaledVector(tmpRight, -0.395)
			.addScaledVector(tmpUp, 0.353)
			.normalize();

		if (tmpOblique.distanceToSquared(camObliqueSunDir) > 1e-5) {
			camObliqueSunDir = tmpOblique.clone();
		}
	}

	function effectiveSunDirVec(id: CelestialBodyId): Vector3 {
		const hostDir = bodyStarDirVec(id);
		if (daylightBlend <= 0.001) return hostDir;
		return hostDir.lerp(camObliqueSunDir, daylightBlend).normalize();
	}

	let akunaliaGroup = $state<Group | undefined>();
	let earthGroup = $state<Group | undefined>();

	let akunaliaGeo = $state<PlanetGeoBundle | null>(null);
	let earthGeo = $state<PlanetGeoBundle | null>(null);

	let flyTarget = $state<Vector3 | null>(null);
	let lookTargetGoal = $state<Vector3 | null>(null);

	// Idle spin pauses while inspecting a specific surface marker on that planet
	let autoRotateAkunalia = $derived(
		tier === 0 || activePlanet !== 'akunalia' || (!selected && !hovered)
	);
	let autoRotateEarth = $derived(
		tier === 0 || activePlanet !== 'earth' || (!selected && !hovered)
	);

	function latLngLocal(lat: number, lng: number, r: number, alt = 0): Vector3 {
		const phi = (90 - lat) * (Math.PI / 180);
		const theta = (lng + 180) * (Math.PI / 180);
		const rad = r * (1 + alt);
		return new Vector3(
			-(rad * Math.sin(phi) * Math.cos(theta)),
			rad * Math.cos(phi),
			rad * Math.sin(phi) * Math.sin(theta)
		);
	}

	function worldDirectionOnPlanet(
		planetId: CelestialBodyId,
		lat: number,
		lng: number,
		alt = 0
	): Vector3 {
		const spec = CELESTIAL_BODIES[planetId];
		const local = latLngLocal(lat, lng, spec.radius, alt);
		const grp = planetId === 'earth' ? earthGroup : akunaliaGroup;
		const center = bodyRelativeVec(planetId);
		if (!grp) return local.normalize();
		grp.updateMatrixWorld(true);
		const worldPt = local.clone().applyMatrix4(grp.matrixWorld);
		return worldPt.sub(center).normalize();
	}

	let hadSelection = false;
	let lastTier = $state<WorldTier | null>(null);
	let lastPlanet = $state<CelestialBodyId | null>(null);
	let lastSector = $state<CosmicSectorId | null>(null);
	let lastEraKey = $state<string>('');

	// 1. Smooth flight when switching Tier 0 <-> Tier 1, Sector, or Selected Reference Body
	$effect(() => {
		const currentTier = tier;
		const currentPlanet = activePlanet;
		const currentSector = effectiveSector;
		if (
			currentTier === lastTier &&
			currentPlanet === lastPlanet &&
			currentSector === lastSector
		) {
			return;
		}
		lastTier = currentTier;
		lastPlanet = currentPlanet;
		lastSector = currentSector;

		if (currentTier === 0) {
			hadSelection = false;
			lookTargetGoal = sectorOverviewTarget(currentSector);
			flyTarget = sectorOverviewCam(currentSector);
		} else {
			// Active reference body is always centered at (0, 0, 0)!
			lookTargetGoal = ORIGIN.clone();
			flyTarget = planetHomeCamera(currentPlanet);
		}
	});

	// 2. Smooth flight when selecting / deselecting a surface Marker in Tier 1
	$effect(() => {
		if (tier === 0) return;
		const currentPlanet = activePlanet;
		const spec = CELESTIAL_BODIES[currentPlanet];

		if (!selected || selected.lat == null || selected.lng == null) {
			if (hadSelection) {
				hadSelection = false;
				lookTargetGoal = ORIGIN.clone();
				flyTarget = planetHomeCamera(currentPlanet);
			}
			return;
		}

		hadSelection = true;
		const dir = worldDirectionOnPlanet(currentPlanet, selected.lat, selected.lng, selected.alt);
		lookTargetGoal = ORIGIN.clone();
		flyTarget = dir.multiplyScalar(spec.radius * 2.95);
	});

	// 3. Era Scrubber coordinate focus when no specific pin is locked
	$effect(() => {
		if (tier === 0 || selected) return;
		if (activePlanet !== 'akunalia' && activePlanet !== 'earth') return;
		const focus = eraFocusLatLng;
		const key = focus ? `${activePlanet}:${focus.lat}:${focus.lng}` : '';
		if (!focus || key === lastEraKey) return;
		lastEraKey = key;

		const spec = CELESTIAL_BODIES[activePlanet];
		const dir = worldDirectionOnPlanet(activePlanet, focus.lat, focus.lng, 0);
		lookTargetGoal = ORIGIN.clone();
		flyTarget = dir.multiplyScalar(spec.radius * 3.18);
	});

	// Frame the centered [0, 0, 0] celestial body squarely inside the unobstructed viewport
	// between the compact top header (~56px) and bottom CosmicTimelineHud (~176px).
	$effect(() => {
		const cam = camera;
		const w = Math.max(1, Math.round($size.width));
		const h = Math.max(1, Math.round($size.height));
		if (!cam) return;
		if (tier === 1) {
			cam.setViewOffset(w, h, 0, Math.round(h * 0.056), w, h);
		} else {
			cam.clearViewOffset();
		}
		return () => {
			cam.clearViewOffset();
		};
	});

	export function flyHome() {
		if (tier === 0) {
			lookTargetGoal = sectorOverviewTarget(effectiveSector);
			flyTarget = sectorOverviewCam(effectiveSector);
		} else {
			lookTargetGoal = ORIGIN.clone();
			flyTarget = planetHomeCamera(activePlanet);
		}
	}

	// Cancel programmatic flight on manual pointer drag, and hand off seamlessly between
	// Tier 1 (Reference Body Orbit) and Tier 0 (Sector Overview) on wheel extremes.
	let lastTierWheelAt = 0;

	$effect(() => {
		if (!dom) return;

		const onPointerDown = () => {
			if (flyTarget || lookTargetGoal) {
				flyTarget = null;
				lookTargetGoal = null;
			}
		};

		const onWheel = (e: WheelEvent) => {
			if (!camera || !controlsRef) return;
			const now = performance.now();
			if (now - lastTierWheelAt < 750) return;

			const dist = camera.position.distanceTo(controlsRef.target);
			if (tier === 1 && e.deltaY > 0) {
				const maxD = CELESTIAL_BODIES[activePlanet].radius * 8.2;
				if (dist >= maxD * 0.90 && onsettier) {
					lastTierWheelAt = now;
					onsettier(0);
				}
			} else if (tier === 0 && e.deltaY < 0 && onselectplanet) {
				let nearest: CelestialBodyId = activePlanet;
				let bestDist = Infinity;
				for (const id of sectorBodyIds) {
					const d = camera.position.distanceTo(bodyRelativeVec(id));
					if (d < bestDist) {
						bestDist = d;
						nearest = id;
					}
				}
				if (dist <= 18.0 || bestDist <= CELESTIAL_BODIES[nearest].radius * 4.0) {
					lastTierWheelAt = now;
					onselectplanet(nearest);
				}
			}
		};

		dom.addEventListener('pointerdown', onPointerDown, { passive: true });
		dom.addEventListener('wheel', onWheel, { passive: true });
		return () => {
			dom.removeEventListener('pointerdown', onPointerDown);
			dom.removeEventListener('wheel', onWheel);
		};
	});

	$effect(() => {
		if (quality.reducedMotion) {
			daylightBlend = daylightMode ? 1.0 : 0.0;
			if (daylightMode) updateCameraObliqueSun();
			invalidate();
		}
	});

	useTask(
		(delta) => {
			const target = daylightMode ? 1.0 : 0.0;
			if (Math.abs(target - daylightBlend) > 0.001) {
				daylightBlend += (target - daylightBlend) * (1 - Math.pow(0.0025, Math.min(delta, 0.05)));
				if (Math.abs(target - daylightBlend) <= 0.002) {
					daylightBlend = target;
				}
				invalidate();
			}
			if (daylightBlend > 0.001) {
				updateCameraObliqueSun();
			}
		},
		{ running: () => daylightMode || daylightBlend > 0.001 }
	);

	useTask(
		(delta) => {
			simTime += Math.min(delta, 0.05);
		},
		{ running: () => !quality.reducedMotion }
	);

	useTask(
		(delta) => {
			if (!camera) return;
			const t = 1 - Math.pow(0.0012, delta);

			if (lookTargetGoal && controlsRef) {
				controlsRef.target.lerp(lookTargetGoal, t);
				if (controlsRef.target.distanceTo(lookTargetGoal) < 0.02) {
					controlsRef.target.copy(lookTargetGoal);
					lookTargetGoal = null;
				}
			}

			if (flyTarget) {
				camera.position.lerp(flyTarget, t);
				if (camera.position.distanceTo(flyTarget) < 0.03) {
					camera.position.copy(flyTarget);
					flyTarget = null;
				}
			}

			controlsRef?.update();
			if (daylightBlend > 0.001) {
				updateCameraObliqueSun();
			}
		},
		{ running: () => !!camera && (!!flyTarget || !!lookTargetGoal) }
	);

	// ── Selective HDR Post-Processing (`EffectComposer` + `UnrealBloomPass` + `OutputPass`) ──
	let composer = $state<EffectComposer | null>(null);
	let bloomPassRef = $state<UnrealBloomPass | null>(null);

	$effect(() => {
		const cam = camera;
		if (!renderer || !scene || !cam || quality.tier === 'low') {
			composer = null;
			bloomPassRef = null;
			autoRender.set(true);
			return;
		}

		const drawSize = renderer.getDrawingBufferSize(new Vector2());
		const w = Math.max(1, drawSize.x);
		const h = Math.max(1, drawSize.y);
		const msaaSamples =
			quality.antialias && renderer.capabilities.isWebGL2
				? Math.min(4, renderer.capabilities.maxSamples ?? 4)
				: 0;
		const hdrTarget = new WebGLRenderTarget(w, h, {
			type: HalfFloatType,
			samples: msaaSamples
		});
		const ec = new EffectComposer(renderer, hdrTarget);
		const renderPass = new RenderPass(scene, cam);
		// Threshold 1.06 ensures UI/continents stay crisp while host stars, solar coronas,
		// Sunset Terminators, and night-side Lifestream/Aurora HDR lights bloom delicately!
		const bloomPass = new UnrealBloomPass(
			new Vector2(w, h),
			quality.tier === 'high' ? 0.30 : 0.20,
			0.50,
			1.06
		);
		const outputPass = new OutputPass();

		ec.addPass(renderPass);
		ec.addPass(bloomPass);
		ec.addPass(outputPass);
		ec.setPixelRatio($dpr);
		ec.setSize(Math.max(1, $size.width), Math.max(1, $size.height));

		composer = ec;
		bloomPassRef = bloomPass;
		autoRender.set(false);

		return () => {
			autoRender.set(true);
			bloomPass.dispose();
			outputPass.dispose();
			ec.dispose();
			hdrTarget.dispose();
			composer = null;
			bloomPassRef = null;
		};
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const syncWindowDpr = () => {
			const next = Math.min(Math.max(1, window.devicePixelRatio || 1), quality.pixelRatio);
			if (Math.abs(next - dpr.current) > 1e-3) {
				dpr.set(next);
			}
		};
		window.addEventListener('resize', syncWindowDpr, { passive: true });
		return () => window.removeEventListener('resize', syncWindowDpr);
	});

	$effect(() => {
		const w = Math.max(1, $size.width);
		const h = Math.max(1, $size.height);
		const pixelRatio = $dpr;
		if (composer && bloomPassRef && renderer) {
			composer.setPixelRatio(pixelRatio);
			composer.setSize(w, h);
			invalidate();
		}
	});

	useTask(
		(delta) => {
			if (composer) {
				composer.render(delta);
			}
		},
		{
			stage: renderStage,
			autoInvalidate: false,
			running: () => Boolean(composer)
		}
	);

	// ── Keplerian Relative Orbit Loop Geometries (centered on each body's parent) ──
	const orbitTrails = $derived.by(() => {
		const list: Array<{
			id: CelestialBodyId;
			parentId: CelestialBodyId;
			geo: BufferGeometry;
			color: string;
			opacity: number;
		}> = [];

		for (const id of sectorBodyIds) {
			const spec = CELESTIAL_BODIES[id];
			if (!spec.orbitParentId) continue;
			const rawPts = sampleBodyOrbitLoop(id, spec.kind === 'moon' ? 96 : 160);
			if (rawPts.length < 2) continue;
			const flat = new Float32Array(rawPts.length * 3);
			for (let i = 0; i < rawPts.length; i++) {
				flat[i * 3] = rawPts[i][0];
				flat[i * 3 + 1] = rawPts[i][1];
				flat[i * 3 + 2] = rawPts[i][2];
			}
			const geo = new BufferGeometry();
			geo.setAttribute('position', new BufferAttribute(flat, 3));
			const isSelected = id === activePlanet;
			list.push({
				id,
				parentId: spec.orbitParentId,
				geo,
				color: isSelected ? spec.accent : '#64748b',
				opacity: tier === 0 ? (isSelected ? 0.42 : 0.20) : isSelected ? 0.16 : 0.09
			});
		}
		return list;
	});

	$effect(() => {
		const current = orbitTrails;
		return () => current.forEach((t) => t.geo.dispose());
	});

	// ── Spectral O/B/A/F/G/K/M Deep-Space Starfield (r = 650 .. 1180) + Subtle Sector Nebula ──
	const cosmicStars = (() => {
		if (quality.starCount === 0) return null;
		const count = Math.max(quality.starCount, 2400);
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const spectralPalette: Array<[number, number, number]> = [
			[0.64, 0.78, 1.0], // B/A blue-white
			[0.92, 0.95, 1.0], // F white
			[1.0, 0.94, 0.82], // G solar yellow-white
			[1.0, 0.80, 0.58], // K warm orange
			[0.74, 0.88, 1.0]
		];
		for (let i = 0; i < count; i++) {
			const u = Math.random();
			const v = Math.random();
			const theta = 2 * Math.PI * u;
			const phi = Math.acos(2 * v - 1);
			const r = 650 + Math.random() * 520;
			positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.cos(phi);
			positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

			const c = spectralPalette[i % spectralPalette.length];
			// Occasional bright landmark stars (> 1.0 HDR) for subtle stellar glints
			const mag = i % 29 === 0 ? 1.35 : 0.45 + Math.random() * 0.55;
			colors[i * 3] = c[0] * mag;
			colors[i * 3 + 1] = c[1] * mag;
			colors[i * 3 + 2] = c[2] * mag;
		}
		const g = new BufferGeometry();
		g.setAttribute('position', new BufferAttribute(positions, 3));
		g.setAttribute('color', new BufferAttribute(colors, 3));
		return g;
	})();

	const cosmicStarMat = cosmicStars
		? createSoftPointMaterial({ size: 2.2, maxPixelSize: 3.8, opacity: 0.92 })
		: null;

	const nebulaMat = $derived(createDeepNebulaMaterial(effectiveSector));

	$effect(() => {
		const nM = nebulaMat;
		return () => nM.dispose();
	});

	$effect(() => () => {
		cosmicStars?.dispose();
		cosmicStarMat?.dispose();
	});

	const DEFAULT_CAM: [number, number, number] = [0, 2.8, 17.25];
	let bgDownX = 0;
	let bgDownY = 0;
	let isFlying = $derived(Boolean(flyTarget || lookTargetGoal));
	let minOrbitDist = $derived(
		isFlying ? 1.2 : tier === 0 ? 9.0 : CELESTIAL_BODIES[activePlanet].radius * 1.28
	);
	let maxOrbitDist = $derived(
		isFlying
			? 440
			: tier === 0
				? effectiveSector === 'solar_system'
					? 420
					: 165
				: CELESTIAL_BODIES[activePlanet].radius * 8.5
	);

	// Dynamic directional light aligned with active host star or ~32° camera-locked daylight vector
	const activeStarLightPos = $derived.by((): [number, number, number] => {
		const d = effectiveSunDirVec(activePlanet);
		return [d.x * 120, d.y * 120, d.z * 120];
	});

	const prismScaleFactor = $derived(
		tier === 0 ? 2.2 : Math.max(0.72, CELESTIAL_BODIES[activePlanet].radius / 5.0)
	);
</script>

<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	fov={44}
	near={0.1}
	far={2400}
	position={DEFAULT_CAM}
>
	<OrbitControls
		bind:ref={controlsRef}
		enableDamping
		dampingFactor={0.06}
		rotateSpeed={0.55}
		enablePan={tier === 0}
		minDistance={minOrbitDist}
		maxDistance={maxOrbitDist}
		onchange={() => {
			if (daylightBlend > 0.001) updateCameraObliqueSun();
		}}
	/>
</T.PerspectiveCamera>

<!-- Deep-space cosmic lighting + Daylight Observation sky-dome hemisphere fill -->
<T.AmbientLight intensity={0.035 + daylightBlend * 0.22} color="#0b1326" />
<T.HemisphereLight args={['#e2eeff', '#334155', daylightBlend * 0.55]} />
<T.DirectionalLight position={activeStarLightPos} intensity={1.65} color="#fff6eb" />

<!-- Toggleable Spectral Dispersion Moment (`🌈 Khoảnh Khắc Tán Sắc Cầu Vồng`) -->
<PrismDispersionMoment active={prismMomentActive} scaleFactor={prismScaleFactor} {quality} />

<!-- Subtle Deep-Space Nebula Backdrop Sphere -->
<T.Mesh>
	<T.SphereGeometry args={[1380, 32, 24]} />
	<T is={nebulaMat} attach="material" />
</T.Mesh>

{#if cosmicStars && cosmicStarMat}
	<T.Points>
		<T is={cosmicStars} attach="geometry" />
		<T is={cosmicStarMat} attach="material" />
	</T.Points>
{/if}

<!-- Clicking empty deep space clears an active marker selection without yanking free 360° camera orbits -->
<T.Mesh
	onpointerdown={(e: { nativeEvent?: PointerEvent }) => {
		bgDownX = e?.nativeEvent?.clientX ?? 0;
		bgDownY = e?.nativeEvent?.clientY ?? 0;
	}}
	onclick={(e: { nativeEvent?: MouseEvent }) => {
		const cx = e?.nativeEvent?.clientX ?? bgDownX;
		const cy = e?.nativeEvent?.clientY ?? bgDownY;
		if (Math.hypot(cx - bgDownX, cy - bgDownY) > 6) return;
		if (selected) {
			onselect?.(null);
		}
	}}
>
	<T.SphereGeometry args={[1250, 8, 8]} />
	<T.MeshBasicMaterial transparent opacity={0} depthWrite={false} side={1} />
</T.Mesh>

<!-- Relative Keplerian Orbit Trails (anchored dynamically to each body's parent!) -->
{#each orbitTrails as trail (trail.id)}
	{@const parentPos = snapshot.bodies[trail.parentId]?.relativePos ?? [0, 0, 0]}
	<T.Line position={parentPos} geometry={trail.geo}>
		<T.LineBasicMaterial color={trail.color} transparent opacity={trail.opacity} />
	</T.Line>
{/each}

<!-- Render all Celestial Bodies belonging strictly to the Active Sector -->
{#each sectorBodyIds as bodyId (bodyId)}
	{@const spec = CELESTIAL_BODIES[bodyId]}
	{@const relPos = snapshot.bodies[bodyId]?.relativePos ?? [0, 0, 0]}
	{@const starVec = effectiveSunDirVec(bodyId)}
	{@const relVec = bodyRelativeVec(bodyId)}

	{#if bodyId === 'akunalia'}
		<T.Group position={relPos}>
			<Planet
				planetKey="akunalia"
				radius={spec.radius}
				axialTiltDeg={spec.axialTiltDeg}
				spinSpeed={spec.spinSpeed}
				sunDir={starVec}
				planetWorldPos={relVec}
				{daylightBlend}
				{quality}
				{timeline}
				{unshieldedTimeline2}
				autoRotate={autoRotateAkunalia}
				includeStars={false}
				onfocusplanet={tier === 0 || activePlanet !== 'akunalia'
					? () => onselectplanet?.('akunalia')
					: undefined}
				bind:geoBundle={akunaliaGeo}
				bind:group={akunaliaGroup}
			>
				{#if tier === 1 && activePlanet === 'akunalia'}
					{#each nodes as node (node.id)}
						<Marker
							{node}
							radius={spec.radius}
							surfaceRadius={akunaliaGeo
								? akunaliaGeo.sampleSurfaceRadius(
										node.lat,
										node.lng,
										spec.radius,
										quality.displacement
									)
								: spec.radius}
							selected={selected?.id === node.id}
							hovered={hovered?.id === node.id}
							onselect={(n) => onselect?.(n)}
							onhover={(n) => onhover?.(n)}
						/>
					{/each}
				{/if}
			</Planet>
		</T.Group>
	{:else if bodyId === 'earth'}
		<T.Group position={relPos}>
			<Planet
				planetKey="earth"
				radius={spec.radius}
				axialTiltDeg={spec.axialTiltDeg}
				spinSpeed={spec.spinSpeed}
				sunDir={starVec}
				planetWorldPos={relVec}
				{daylightBlend}
				{quality}
				{timeline}
				{unshieldedTimeline2}
				autoRotate={autoRotateEarth}
				includeStars={false}
				onfocusplanet={tier === 0 || activePlanet !== 'earth'
					? () => onselectplanet?.('earth')
					: undefined}
				bind:geoBundle={earthGeo}
				bind:group={earthGroup}
			>
				{#if tier === 1 && activePlanet === 'earth'}
					{#each earthNodes as node (node.id)}
						<Marker
							{node}
							radius={spec.radius}
							surfaceRadius={earthGeo
								? earthGeo.sampleSurfaceRadius(
										node.lat,
										node.lng,
										spec.radius,
										quality.displacement
									)
								: spec.radius}
							selected={selected?.id === node.id}
							hovered={hovered?.id === node.id}
							onselect={(n) => onselect?.(n)}
							onhover={(n) => onhover?.(n)}
						/>
					{/each}
				{/if}
			</Planet>
		</T.Group>
	{:else}
		<T.Group position={relPos}>
			<SolarBody
				{spec}
				{quality}
				sunDir={starVec}
				worldPos={relVec}
				{daylightBlend}
				autoRotate={true}
				onselectbody={tier === 0 || activePlanet !== bodyId
					? () => onselectplanet?.(bodyId)
					: undefined}
			/>
		</T.Group>
	{/if}
{/each}
