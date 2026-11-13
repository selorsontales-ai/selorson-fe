<script lang="ts">
	/**
	 * `PrismDispersionMoment.svelte` — Toggleable Cinematic Spectral Dispersion Moment (`Chặng 1B`):
	 *
	 * Replays the primordial instant when white astral radiance strikes the faceted
	 * Eldarin Crystal Prism, refracting by Cauchy wavelength (`700nm .. 380nm`) into
	 * 7 star-tipped rainbow meteor pulses that arc gracefully across space and gently
	 * subside ("rồi dịu dần") without obstructing 360° orbit or body selection.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		AdditiveBlending,
		BufferAttribute,
		BufferGeometry,
		CatmullRomCurve3,
		Color,
		DoubleSide,
		ShaderMaterial,
		TubeGeometry,
		Vector3
	} from 'three';
	import type { QualitySettings } from '../quality';

	interface Props {
		active: boolean;
		scaleFactor?: number;
		quality: QualitySettings;
	}

	let { active = false, scaleFactor = 1.0, quality }: Props = $props();

	const { invalidate } = useThrelte();
	const NOOP_RAYCAST = () => {};

	const PRISM_ORIGIN = new Vector3(-5.55, 2.18, 3.65);
	const INCIDENT_START = new Vector3(-17.8, 5.95, 2.15);

	const SPECTRAL_RAYS: ReadonlyArray<{
		id: string;
		hex: string;
		delay: number;
		speed: number;
		ctrl1: [number, number, number];
		ctrl2: [number, number, number];
		end: [number, number, number];
	}> = [
		{
			id: 'red-700',
			hex: '#ff244c',
			delay: 0.0,
			speed: 0.255,
			ctrl1: [-1.4, 3.9, 5.8],
			ctrl2: [4.8, 4.9, 5.4],
			end: [14.6, 6.4, 2.2]
		},
		{
			id: 'orange-600',
			hex: '#ff7a18',
			delay: 0.06,
			speed: 0.246,
			ctrl1: [-1.1, 3.0, 6.1],
			ctrl2: [5.3, 3.4, 5.8],
			end: [15.4, 4.1, 2.9]
		},
		{
			id: 'gold-580',
			hex: '#ffd41f',
			delay: 0.12,
			speed: 0.238,
			ctrl1: [-0.9, 2.0, 6.35],
			ctrl2: [5.6, 1.8, 6.1],
			end: [15.8, 1.7, 3.5]
		},
		{
			id: 'green-530',
			hex: '#18ed76',
			delay: 0.18,
			speed: 0.230,
			ctrl1: [-0.8, 0.9, 6.5],
			ctrl2: [5.7, 0.1, 6.25],
			end: [15.8, -0.7, 4.0]
		},
		{
			id: 'blue-470',
			hex: '#22aaff',
			delay: 0.24,
			speed: 0.222,
			ctrl1: [-0.9, -0.2, 6.45],
			ctrl2: [5.4, -1.5, 6.15],
			end: [15.2, -3.0, 4.4]
		},
		{
			id: 'indigo-430',
			hex: '#6360ff',
			delay: 0.30,
			speed: 0.214,
			ctrl1: [-1.2, -1.2, 6.25],
			ctrl2: [4.9, -3.0, 5.9],
			end: [14.2, -5.2, 4.7]
		},
		{
			id: 'violet-380',
			hex: '#c842ff',
			delay: 0.36,
			speed: 0.206,
			ctrl1: [-1.6, -2.2, 5.95],
			ctrl2: [4.2, -4.4, 5.5],
			end: [12.9, -7.2, 4.9]
		}
	];

	/**
	 * Hexagonal Bipyramid Crystal Geometry (12 flat facets) with per-triangle
	 * barycentric attributes (`aBary`) for crisp diamond-silver facet edge highlights.
	 */
	function buildHexCrystalGeometry(radius = 0.64, halfHeight = 1.36): BufferGeometry {
		const ring: Vector3[] = [];
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			ring.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
		}
		const top = new Vector3(0, halfHeight, 0);
		const bottom = new Vector3(0, -halfHeight, 0);
		const verts: number[] = [];
		const barys: number[] = [];
		for (let i = 0; i < 6; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % 6];
			verts.push(top.x, top.y, top.z, a.x, a.y, a.z, b.x, b.y, b.z);
			barys.push(1, 0, 0, 0, 1, 0, 0, 0, 1);

			verts.push(bottom.x, bottom.y, bottom.z, b.x, b.y, b.z, a.x, a.y, a.z);
			barys.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
		}
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
		geo.setAttribute('aBary', new BufferAttribute(new Float32Array(barys), 3));
		geo.computeVertexNormals();
		return geo;
	}

	function createMeteorPulseMaterial(
		colorHex: string,
		delay: number,
		speed: number,
		isIncident = false
	): ShaderMaterial {
		return new ShaderMaterial({
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			toneMapped: false,
			uniforms: {
				uColor: { value: new Color(colorHex) },
				uCycleTime: { value: 0.0 },
				uEnvelope: { value: 0.0 },
				uDelay: { value: delay },
				uSpeed: { value: speed },
				uIsIncident: { value: isIncident ? 1.0 : 0.0 }
			},
			vertexShader: /* glsl */ `
				uniform float uCycleTime;
				uniform float uDelay;
				uniform float uSpeed;
				uniform float uIsIncident;

				varying vec2 vUv;
				varying vec3 vWorldNormal;
				varying vec3 vWorldPos;

				void main() {
					vUv = uv;
					vec3 pos = position;
					if (uIsIncident < 0.5) {
						// Dynamically taper tube into a plump comet head & slender optical prism stream (never a uniform pipe!)
						float localT = max(0.0, uCycleTime - 0.56 - uDelay);
						float headPos = localT * uSpeed;
						float distBehind = headPos - uv.x;
						float headBulge = exp(-pow(distBehind * 22.0, 2.0)) * 0.85;
						float activeFeedWaist = (1.0 - smoothstep(3.30, 4.90, uCycleTime)) * 0.56;
						float tailTaper = clamp(max(activeFeedWaist, 1.0 - max(0.0, distBehind) * 3.1), 0.14, 1.0);
						float radiusScale = clamp(tailTaper + headBulge, 0.12, 1.75);
						pos += normal * (radiusScale - 1.0) * 0.036;
					} else {
						// Incident astral ray converges into a focused, high-energy waist as it strikes the Eldarin Prism
						float focusFlare = smoothstep(0.65, 1.0, uv.x) * 0.35;
						float travelPulse = 0.08 * sin(uv.x * 18.0 - uCycleTime * 9.5);
						pos += normal * (focusFlare + travelPulse) * 0.055;
					}
					vWorldNormal = normalize(mat3(modelMatrix) * normal);
					vec4 wp = modelMatrix * vec4(pos, 1.0);
					vWorldPos = wp.xyz;
					gl_Position = projectionMatrix * viewMatrix * wp;
				}
			`,
			fragmentShader: /* glsl */ `
				uniform vec3 uColor;
				uniform float uCycleTime;
				uniform float uEnvelope;
				uniform float uDelay;
				uniform float uSpeed;
				uniform float uIsIncident;

				varying vec2 vUv;
				varying vec3 vWorldNormal;
				varying vec3 vWorldPos;

				void main() {
					if (uEnvelope <= 0.002) discard;

					vec3 V = normalize(cameraPosition - vWorldPos);
					float viewDot = clamp(abs(dot(normalize(vWorldNormal), V)), 0.0, 1.0);
					float radialCore = uIsIncident > 0.5
						? (pow(viewDot, 2.6) * 0.92 + pow(viewDot, 0.88) * 0.52)
						: pow(viewDot, 1.65);

					float intensity = 0.0;
					float tipSpark = 0.0;

					if (uIsIncident > 0.5) {
						// Wavefront shoots in (0..0.52s), then sustains a brilliant astral beam feeding the prism (0.52..3.45s)
						// while all 7 refracted rainbow pulses emerge, before draining smoothly into the crystal (3.45..5.40s).
						float head = uCycleTime / 0.52;
						float distBehind = head - vUv.x;
						if (distBehind < -0.025) discard;

						float frontArrival = smoothstep(-0.025, 0.035, distBehind);
						float wavefrontFlash = exp(-pow(distBehind * 16.0, 2.0)) * 0.95;

						// Sustained photon stream with subtle forward-flowing ripples into the prism facet
						float entryTaper = smoothstep(0.0, 0.14, vUv.x);
						float prismFocus = 0.86 + 0.42 * smoothstep(0.58, 1.0, vUv.x);
						float photonRipple = 0.90 + 0.14 * sin(vUv.x * 28.0 - uCycleTime * 11.5);
						float sustainedBeam = frontArrival * entryTaper * prismFocus * photonRipple * 1.12;

						// Tail sweeps from deep space into the prism as dispersion finishes
						float drainProgress = clamp((uCycleTime - 3.35) / 1.55, 0.0, 1.25);
						float tailDrain = smoothstep(drainProgress - 0.12, drainProgress + 0.08, vUv.x);
						float fadeAfter = 1.0 - smoothstep(3.55, 5.45, uCycleTime);

						intensity = (sustainedBeam + wavefrontFlash) * tailDrain * fadeAfter;
						tipSpark = 0.86;
					} else {
						float localT = max(0.0, uCycleTime - 0.56 - uDelay);
						float headPos = localT * uSpeed;
						float distBehind = headPos - vUv.x;
						if (distBehind < -0.022) discard;

						float cometHead = exp(-pow(distBehind * 28.0, 2.0)) * 1.35;
						float silkTail = smoothstep(-0.018, 0.020, distBehind)
							* exp(-max(0.0, distBehind) * 8.2)
							* (1.0 - smoothstep(0.26, 0.44, distBehind))
							* 0.98;

						// Continuous refracted spectral fan emerging directly from the Eldarin Prism exit facet
						// while the incident white beam is actively feeding the crystal, then draining outward!
						float outDrain = clamp((uCycleTime - 3.35 - uDelay * 0.45) / 1.50, 0.0, 1.25);
						float prismAnchorDrain = smoothstep(outDrain - 0.12, outDrain + 0.10, vUv.x);
						float feedFade = 1.0 - smoothstep(3.45, 5.15, uCycleTime);
						float prismExitBoost = 1.15 - 0.42 * smoothstep(0.0, 0.35, vUv.x);
						float spectralRipple = 0.90 + 0.12 * sin(vUv.x * 26.0 - uCycleTime * 10.5);
						float refractedStream = smoothstep(-0.018, 0.028, distBehind)
							* prismAnchorDrain
							* feedFade
							* prismExitBoost
							* spectralRipple
							* 0.82;

						float gentleSubsidence = 1.0 - smoothstep(3.8, 6.4, localT);
						float exitPinch = smoothstep(0.0, 0.008, vUv.x);
						float farFade = 1.0 - smoothstep(0.86, 1.0, vUv.x);
						intensity = (cometHead + max(silkTail, refractedStream)) * gentleSubsidence * exitPinch * farFade;
						float prismRootSpark = exp(-vUv.x * 16.0) * feedFade * 0.36;
						tipSpark = clamp(exp(-pow(distBehind * 34.0, 2.0)) * 0.56 + prismRootSpark, 0.0, 0.65);
					}

					float alpha = clamp(intensity * radialCore * uEnvelope, 0.0, 0.96);
					if (alpha < 0.004) discard;

					vec3 spectralCol = mix(uColor, vec3(1.0, 0.99, 0.97), tipSpark);
					vec3 hdrCol = spectralCol * min(intensity, 1.36) * radialCore * uEnvelope;

					gl_FragColor = vec4(hdrCol, alpha);
				}
			`
		});
	}

	function createPrismCrystalMaterial(): ShaderMaterial {
		return new ShaderMaterial({
			side: DoubleSide,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			toneMapped: false,
			uniforms: {
				uCycleTime: { value: 0.0 },
				uEnvelope: { value: 0.0 }
			},
			vertexShader: /* glsl */ `
				attribute vec3 aBary;
				varying vec3 vBary;
				varying vec3 vWorldNormal;
				varying vec3 vWorldPos;
				varying vec3 vLocalPos;
				void main() {
					vBary = aBary;
					vLocalPos = position;
					vWorldNormal = normalize(mat3(modelMatrix) * normal);
					vec4 wp = modelMatrix * vec4(position, 1.0);
					vWorldPos = wp.xyz;
					gl_Position = projectionMatrix * viewMatrix * wp;
				}
			`,
			fragmentShader: /* glsl */ `
				uniform float uCycleTime;
				uniform float uEnvelope;
				varying vec3 vBary;
				varying vec3 vWorldNormal;
				varying vec3 vWorldPos;
				varying vec3 vLocalPos;

				void main() {
					if (uEnvelope <= 0.002) discard;
					vec3 N = normalize(vWorldNormal);
					vec3 V = normalize(cameraPosition - vWorldPos);

					// Crisp diamond-cut facet ridge lines via barycentric screen-space derivatives
					vec3 dBary = fwidth(vBary);
					vec3 edgeSmooth = smoothstep(vec3(0.0), dBary * 2.0, vBary);
					float edgeLine = 1.0 - min(edgeSmooth.x, min(edgeSmooth.y, edgeSmooth.z));

					float fresnel = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.1);
					vec3 keyDir = normalize(vec3(-0.62, 0.52, 0.58));
					float facetGlint = pow(max(0.0, dot(reflect(-keyDir, N), V)), 12.0);

					// Cauchy rainbow caustic shimmer inside the Eldarin crystal body
					float phase = vLocalPos.y * 0.55 + vLocalPos.x * 0.42 - uCycleTime * 0.38;
					vec3 rainbowCaustic = 0.55 + 0.45 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));

					// Smooth materialization + full subsidence ("rồi dịu dần") after spectral dispersion completes!
					float crystalAppear = smoothstep(0.0, 0.36, uCycleTime);
					float dispersionActive = 1.0 - smoothstep(4.15, 6.75, uCycleTime);
					float crystalSubside = crystalAppear * mix(0.025, 1.0, dispersionActive);
					float ridgeSubside = crystalAppear * dispersionActive * dispersionActive;

					float impactFlash = exp(-pow((uCycleTime - 0.56) * 2.2, 2.0)) * 1.15;
					float sustainHeart = dispersionActive * 0.62;

					vec3 crystalBody = mix(vec3(0.54, 0.82, 1.0), rainbowCaustic, 0.58)
						* (0.22 + fresnel * 0.68 + facetGlint * 0.80)
						* crystalSubside;
					vec3 ridgeCol = mix(vec3(0.86, 0.95, 1.0), rainbowCaustic, 0.38)
						* edgeLine
						* (0.76 * ridgeSubside + impactFlash * 0.58);
					vec3 heartCol = vec3(1.0, 0.97, 0.92)
						* exp(-length(vLocalPos) * 1.55)
						* (sustainHeart + impactFlash);

					vec3 col = (crystalBody + ridgeCol + heartCol) * uEnvelope;
					float alpha = clamp(
						(0.20 * crystalSubside + fresnel * 0.48 * crystalSubside + edgeLine * 0.72 * ridgeSubside + impactFlash * 0.48)
						* uEnvelope,
						0.0,
						0.95
					);
					if (alpha < 0.003) discard;

					gl_FragColor = vec4(col, alpha);
				}
			`
		});
	}

	const crystalGeo = buildHexCrystalGeometry(0.64, 1.34);
	const crystalMat = createPrismCrystalMaterial();

	const incidentCurve = new CatmullRomCurve3([
		INCIDENT_START,
		INCIDENT_START.clone().lerp(PRISM_ORIGIN, 0.52).add(new Vector3(0, 0.18, 0.16)),
		PRISM_ORIGIN
	]);
	const incidentGeo = new TubeGeometry(incidentCurve, 64, 0.088, 10, false);
	const incidentMat = createMeteorPulseMaterial('#fff7e6', 0.0, 1.0, true);

	const spectralMeshes = SPECTRAL_RAYS.map((ray) => {
		const c1 = new Vector3(ray.ctrl1[0], ray.ctrl1[1], ray.ctrl1[2]);
		const c2 = new Vector3(ray.ctrl2[0], ray.ctrl2[1], ray.ctrl2[2]);
		const endVec = new Vector3(ray.end[0], ray.end[1], ray.end[2]);
		const curve = new CatmullRomCurve3([PRISM_ORIGIN.clone(), c1, c2, endVec]);
		const geo = new TubeGeometry(curve, 96, 0.042, 8, false);
		const mat = createMeteorPulseMaterial(ray.hex, ray.delay, ray.speed, false);
		return { id: ray.id, curve, geo, mat, hex: ray.hex, delay: ray.delay, speed: ray.speed };
	});

	// 8 Star-Flare Points: index 0 = Prism Refraction Core Flash, indices 1..7 = 7 Shooting-Star Meteor Heads!
	const meteorHeadsData = (() => {
		const count = 1 + spectralMeshes.length;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const intensityAttr = new Float32Array(count);

		positions[0] = PRISM_ORIGIN.x;
		positions[1] = PRISM_ORIGIN.y;
		positions[2] = PRISM_ORIGIN.z;
		colors[0] = 1.0;
		colors[1] = 0.97;
		colors[2] = 0.92;

		for (let i = 0; i < spectralMeshes.length; i++) {
			const c = new Color(spectralMeshes[i].hex);
			colors[(i + 1) * 3] = c.r;
			colors[(i + 1) * 3 + 1] = c.g;
			colors[(i + 1) * 3 + 2] = c.b;
		}

		const geo = new BufferGeometry();
		const posAttr = new BufferAttribute(positions, 3);
		const intAttr = new BufferAttribute(intensityAttr, 1);
		geo.setAttribute('position', posAttr);
		geo.setAttribute('color', new BufferAttribute(colors, 3));
		geo.setAttribute('aIntensity', intAttr);

		const mat = new ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			vertexColors: true,
			toneMapped: false,
			uniforms: {
				uEnvelope: { value: 0.0 }
			},
			vertexShader: /* glsl */ `
				attribute float aIntensity;
				varying vec3 vColor;
				varying float vIntensity;
				uniform float uEnvelope;
				void main() {
					vColor = color;
					vIntensity = aIntensity * uEnvelope;
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = clamp((24.0 + 18.0 * aIntensity) * (14.0 / max(2.0, -mv.z)), 0.0, 56.0);
					gl_Position = projectionMatrix * mv;
				}
			`,
			fragmentShader: /* glsl */ `
				varying vec3 vColor;
				varying float vIntensity;
				void main() {
					if (vIntensity <= 0.004) discard;
					vec2 uv = gl_PointCoord - vec2(0.5);
					float r = length(uv);
					if (r > 0.5) discard;
					// 4-point stellar diffraction cross + soft jewel halo
					float core = exp(-r * r * 42.0);
					float crossSpikes = (exp(-abs(uv.x) * 28.0) * exp(-abs(uv.y) * 5.5)
						+ exp(-abs(uv.y) * 28.0) * exp(-abs(uv.x) * 5.5)) * (1.0 - smoothstep(0.18, 0.48, r));
					float halo = exp(-r * 6.5) * 0.42;
					float shape = (core * 1.15 + crossSpikes * 0.72 + halo) * vIntensity;
					vec3 starCol = mix(vColor, vec3(1.0, 0.99, 0.97), clamp(core * 0.78, 0.0, 0.85));
					gl_FragColor = vec4(starCol * min(shape, 1.38), clamp(shape, 0.0, 1.0));
				}
			`
		});

		return { geo, mat, posAttr, intAttr };
	})();

	function updateMeteorHeads(t: number) {
		const posArr = meteorHeadsData.posAttr.array as Float32Array;
		const intArr = meteorHeadsData.intAttr.array as Float32Array;

		// Index 0: Prism Refraction Burst (active while beam refracts, subsiding cleanly to 0 by t ≈ 6.6s)
		const activeSustain =
			t > 0.44 ? 0.68 * Math.min(1, (t - 0.44) / 0.16) * (1 - Math.min(1, Math.max(0, (t - 3.9) / 2.6))) : 0.0;
		const prismBurst = Math.exp(-Math.pow((t - 0.56) * 2.2, 2)) * 1.12 + activeSustain;
		intArr[0] = prismBurst;

		// Indices 1..7: 7 Shooting-Star Meteor Heads riding along their Cauchy trajectories
		const tmpPt = new Vector3();
		for (let i = 0; i < spectralMeshes.length; i++) {
			const item = spectralMeshes[i];
			const localT = t - 0.56 - item.delay;
			if (localT <= 0) {
				intArr[i + 1] = 0;
				continue;
			}
			const u = localT * item.speed;
			if (u >= 0.995) {
				intArr[i + 1] = 0;
				continue;
			}
			item.curve.getPoint(Math.min(0.995, Math.max(0, u)), tmpPt);
			posArr[(i + 1) * 3] = tmpPt.x;
			posArr[(i + 1) * 3 + 1] = tmpPt.y;
			posArr[(i + 1) * 3 + 2] = tmpPt.z;

			const fadeIn = Math.min(1, u / 0.05);
			const fadeOut = 1 - Math.max(0, Math.min(1, (u - 0.80) / 0.19));
			const timeSubside = 1 - Math.max(0, Math.min(1, (localT - 3.8) / 2.6));
			intArr[i + 1] = fadeIn * fadeOut * timeSubside * 1.05;
		}
		meteorHeadsData.posAttr.needsUpdate = true;
		meteorHeadsData.intAttr.needsUpdate = true;
	}

	// Spectral stardust motes shed along the 7 refracted trajectories
	const dustData = (() => {
		const perRay = 32;
		const total = SPECTRAL_RAYS.length * perRay;
		const positions = new Float32Array(total * 3);
		const colors = new Float32Array(total * 3);
		const progressAttr = new Float32Array(total);
		const raySpeedAttr = new Float32Array(total);
		const rayDelayAttr = new Float32Array(total);

		let idx = 0;
		for (let r = 0; r < spectralMeshes.length; r++) {
			const item = spectralMeshes[r];
			const col = new Color(item.hex);
			for (let j = 0; j < perRay; j++) {
				const u = 0.05 + (j / perRay) * 0.90;
				const pt = item.curve.getPoint(u);
				const jitter = 0.14 + u * 0.34;
				positions[idx * 3] = pt.x + Math.sin(idx * 17.3) * jitter;
				positions[idx * 3 + 1] = pt.y + Math.cos(idx * 23.7) * jitter;
				positions[idx * 3 + 2] = pt.z + Math.sin(idx * 31.1) * jitter;
				colors[idx * 3] = col.r;
				colors[idx * 3 + 1] = col.g;
				colors[idx * 3 + 2] = col.b;
				progressAttr[idx] = u;
				raySpeedAttr[idx] = item.speed;
				rayDelayAttr[idx] = item.delay;
				idx++;
			}
		}

		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(positions, 3));
		geo.setAttribute('color', new BufferAttribute(colors, 3));
		geo.setAttribute('aProgress', new BufferAttribute(progressAttr, 1));
		geo.setAttribute('aSpeed', new BufferAttribute(raySpeedAttr, 1));
		geo.setAttribute('aDelay', new BufferAttribute(rayDelayAttr, 1));

		const mat = new ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			vertexColors: true,
			toneMapped: true,
			uniforms: {
				uCycleTime: { value: 0.0 },
				uEnvelope: { value: 0.0 }
			},
			vertexShader: /* glsl */ `
				attribute float aProgress;
				attribute float aSpeed;
				attribute float aDelay;
				varying vec3 vColor;
				varying float vSpark;
				uniform float uCycleTime;
				uniform float uEnvelope;
				void main() {
					vColor = color;
					float localT = max(0.0, uCycleTime - 0.56 - aDelay);
					float headPos = localT * aSpeed;
					float distBehind = headPos - aProgress;
					float wake = smoothstep(-0.02, 0.03, distBehind) * (1.0 - smoothstep(0.18, 0.64, distBehind));
					float subside = 1.0 - smoothstep(3.9, 6.8, localT);
					float twinkle = 0.55 + 0.45 * sin(uCycleTime * 7.2 + aProgress * 41.0);
					vSpark = wake * subside * twinkle * uEnvelope;
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = clamp((2.8 + 2.8 * twinkle) * (150.0 / max(1.0, -mv.z)), 1.0, 5.8);
					gl_Position = projectionMatrix * mv;
				}
			`,
			fragmentShader: /* glsl */ `
				varying vec3 vColor;
				varying float vSpark;
				void main() {
					if (vSpark <= 0.005) discard;
					vec2 c = gl_PointCoord - vec2(0.5);
					float r2 = dot(c, c);
					if (r2 > 0.25) discard;
					float glow = exp(-r2 * 18.0) * vSpark;
					gl_FragColor = vec4(vColor * glow * 1.85, clamp(glow, 0.0, 1.0));
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}
			`
		});

		return { geo, mat };
	})();

	let cycleTime = $state(0);
	let envelope = $state(0);
	let crystalSpinY = $state(0.42);
	let wasActive = false;

	$effect(() => {
		if (active && !wasActive) {
			// Fresh replay from t = 0 whenever the reader toggles ON!
			cycleTime = quality.reducedMotion ? 2.25 : 0.0;
			if (quality.reducedMotion) {
				envelope = 1.0;
			}
			syncUniforms(cycleTime, envelope);
			invalidate();
		} else if (!active && quality.reducedMotion) {
			envelope = 0.0;
			syncUniforms(cycleTime, 0.0);
			invalidate();
		}
		wasActive = active;
	});

	$effect(() => () => {
		crystalGeo.dispose();
		crystalMat.dispose();
		incidentGeo.dispose();
		incidentMat.dispose();
		for (const item of spectralMeshes) {
			item.geo.dispose();
			item.mat.dispose();
		}
		meteorHeadsData.geo.dispose();
		meteorHeadsData.mat.dispose();
		dustData.geo.dispose();
		dustData.mat.dispose();
	});

	function syncUniforms(t: number, env: number) {
		crystalMat.uniforms.uCycleTime.value = t;
		crystalMat.uniforms.uEnvelope.value = env;
		incidentMat.uniforms.uCycleTime.value = t;
		incidentMat.uniforms.uEnvelope.value = env;
		for (const item of spectralMeshes) {
			item.mat.uniforms.uCycleTime.value = t;
			item.mat.uniforms.uEnvelope.value = env;
		}
		meteorHeadsData.mat.uniforms.uEnvelope.value = env;
		dustData.mat.uniforms.uCycleTime.value = t;
		dustData.mat.uniforms.uEnvelope.value = env;
		updateMeteorHeads(t);
	}

	$effect(() => {
		syncUniforms(cycleTime, envelope);
	});

	useTask(
		(delta) => {
			const dt = Math.min(delta, 0.05);
			const targetEnv = active ? 1.0 : 0.0;
			envelope += (targetEnv - envelope) * (1 - Math.pow(0.008, dt));
			if (Math.abs(targetEnv - envelope) < 0.003) {
				envelope = targetEnv;
			}

			if (envelope > 0.002) {
				if (!quality.reducedMotion) {
					// Advance monotonically so the 7 meteor pulses disperse across space and genuinely subside ("rồi dịu dần")!
					cycleTime = Math.min(cycleTime + dt, 12.0);
					crystalSpinY += dt * 0.36;
				}
				syncUniforms(cycleTime, envelope);
				invalidate();
			}
		},
		{ running: () => active || envelope > 0.002 }
	);
</script>

{#if active || envelope > 0.002}
	<T.Group scale={scaleFactor}>
		<!-- Faceted Hexagonal Bipyramid Crystal Anchor (non-interactive so planet/marker clicks pass right through!) -->
		<T.Group
			position={[PRISM_ORIGIN.x, PRISM_ORIGIN.y, PRISM_ORIGIN.z]}
			rotation={[0.26, crystalSpinY, -0.28]}
		>
			<T.Mesh raycast={NOOP_RAYCAST}>
				<T is={crystalGeo} attach="geometry" />
				<T is={crystalMat} attach="material" />
			</T.Mesh>
		</T.Group>

		<!-- Primordial White Incident Ray -->
		<T.Mesh raycast={NOOP_RAYCAST}>
			<T is={incidentGeo} attach="geometry" />
			<T is={incidentMat} attach="material" />
		</T.Mesh>

		<!-- 7 Cauchy-Refracted Spectral Meteor Pulses (700nm .. 380nm) -->
		{#each spectralMeshes as item (item.id)}
			<T.Mesh raycast={NOOP_RAYCAST}>
				<T is={item.geo} attach="geometry" />
				<T is={item.mat} attach="material" />
			</T.Mesh>
		{/each}

		<!-- Prism Burst & 7 Shooting-Star Diffraction Meteor Heads -->
		<T.Points raycast={NOOP_RAYCAST}>
			<T is={meteorHeadsData.geo} attach="geometry" />
			<T is={meteorHeadsData.mat} attach="material" />
		</T.Points>

		<!-- Shimmering Spectral Stardust Wake -->
		<T.Points raycast={NOOP_RAYCAST}>
			<T is={dustData.geo} attach="geometry" />
			<T is={dustData.mat} attach="material" />
		</T.Points>
	</T.Group>
{/if}
