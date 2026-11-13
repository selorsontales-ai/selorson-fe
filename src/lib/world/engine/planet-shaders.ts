/**
 * AAA SpaceEngine × Final Fantasy × NASA Blue Marble GLSL Shaders (Chặng 1A).
 *
 * Strictly zero clay/toy geometry, zero cartoon cyan coastline outlines, and zero
 * fixed rainbow tubes. Every planetary surface, cloud deck, Rayleigh/Mie atmosphere,
 * stellar photosphere/corona, gas-giant band system, and Cassini ring system is
 * shaded in linear light with physically grounded host-star illumination, warm
 * Sunset Terminator scattering, projected shadows, and ACES Filmic + HDR Bloom support.
 */

import {
	AdditiveBlending,
	BackSide,
	Color,
	DoubleSide,
	FrontSide,
	ShaderMaterial,
	Texture,
	Vector2,
	Vector3
} from 'three';
import { PLANET_ELEVATION_AMP, SEA_LEVEL_NORM } from '../config';
import type { CosmicSectorId } from '../cosmos';

/** Shared 3D isotropic spherical noise, ridged multifractals & 16-bit RG height decoder. */
const GLSL_COMMON = /* glsl */ `
float sqr(float x) {
	return x * x;
}

float hash31(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);

	float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
	float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

	float nx00 = mix(n000, n100, f.x);
	float nx10 = mix(n010, n110, f.x);
	float nx01 = mix(n001, n101, f.x);
	float nx11 = mix(n011, n111, f.x);

	float nxy0 = mix(nx00, nx10, f.y);
	float nxy1 = mix(nx01, nx11, f.y);
	return mix(nxy0, nxy1, f.z);
}

float fbm3(vec3 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		sum += amp * noise3(p);
		p = p * 2.03 + vec3(17.1, 31.7, 11.3);
		amp *= 0.5;
	}
	return sum;
}

float ridged3(vec3 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
		sum += amp * (n * n);
		p = p * 2.11 + vec3(9.2, 19.4, 27.8);
		amp *= 0.5;
	}
	return sum;
}

vec3 decodeElevSdfTexel(vec4 raw) {
	float h16 = (raw.r * 255.0 * 256.0 + raw.g * 255.0) / 65535.0;
	return vec3(h16, raw.b, raw.a);
}

vec3 sampleElevSdfBilinear(sampler2D tex, vec2 uv, vec2 texSize) {
	vec2 wrappedUv = vec2(fract(uv.x), clamp(uv.y, 0.0008, 0.9992));
	vec2 st = wrappedUv * texSize - 0.5;
	vec2 iuv = floor(st);
	vec2 f = fract(st);

	vec2 uv00 = vec2(fract((iuv.x + 0.5) / texSize.x), clamp((iuv.y + 0.5) / texSize.y, 0.0008, 0.9992));
	vec2 uv10 = vec2(fract((iuv.x + 1.5) / texSize.x), uv00.y);
	vec2 uv01 = vec2(uv00.x, clamp((iuv.y + 1.5) / texSize.y, 0.0008, 0.9992));
	vec2 uv11 = vec2(uv10.x, uv01.y);

	vec3 c00 = decodeElevSdfTexel(texture2D(tex, uv00));
	vec3 c10 = decodeElevSdfTexel(texture2D(tex, uv10));
	vec3 c01 = decodeElevSdfTexel(texture2D(tex, uv01));
	vec3 c11 = decodeElevSdfTexel(texture2D(tex, uv11));

	return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

/** Physical microfacet rough Oren-Nayar diffuse BRDF (eliminates flat Lambert/plastic sheen on continents). */
float orenNayarDiffuse(vec3 L, vec3 V, vec3 N, float roughness) {
	float NoL = max(0.0, dot(N, L));
	float NoV = max(0.001, dot(N, V));
	float sigma2 = roughness * roughness;
	float A = 1.0 - 0.5 * (sigma2 / (sigma2 + 0.33));
	float B = 0.45 * (sigma2 / (sigma2 + 0.09));
	vec3 lProj = L - N * dot(N, L);
	vec3 vProj = V - N * dot(N, V);
	float projLen = sqrt(max(0.00001, dot(lProj, lProj) * dot(vProj, vProj)));
	float cosPhi = max(0.0, dot(lProj, vProj) / projLen);
	float minNLNV = min(NoL, NoV);
	float maxNLNV = max(NoL, NoV);
	float sinAlpha = sqrt(max(0.0, 1.0 - minNLNV * minNLNV));
	float tanBeta = sqrt(max(0.0, 1.0 - maxNLNV * maxNLNV)) / max(0.02, maxNLNV);
	return NoL * (A + B * cosPhi * sinAlpha * min(tanBeta, 2.2));
}

/** Physical Trowbridge-Reitz GGX + Schlick Fresnel + Smith G specular strictly for liquid water. */
float ggxWaterSpecular(vec3 L, vec3 V, vec3 N, float alphaRough) {
	vec3 H = normalize(L + V);
	float NoH = clamp(dot(N, H), 0.0, 1.0);
	float NoV = clamp(dot(N, V), 0.001, 1.0);
	float NoL = clamp(dot(N, L), 0.0, 1.0);
	float VoH = clamp(dot(V, H), 0.0, 1.0);
	float a2 = alphaRough * alphaRough;
	float denom = NoH * NoH * (a2 - 1.0) + 1.0;
	float D = a2 / max(0.0001, 3.14159265 * denom * denom);
	float oneMinusVoH = clamp(1.0 - VoH, 0.0, 1.0);
	float F = 0.02 + 0.98 * pow(oneMinusVoH, 5.0);
	float k = (alphaRough + 1.0) * (alphaRough + 1.0) * 0.125;
	float G1V = NoV / (NoV * (1.0 - k) + k);
	float G1L = NoL / (NoL * (1.0 - k) + k);
	return (D * F * G1V * G1L) / max(0.001, 4.0 * NoV);
}
`;

// ──────────────────────────────────────────────────────────────────────────────
// 1. AAA Unified Terrestrial Planet Surface (`Akunalia` & `Earth`)
// ──────────────────────────────────────────────────────────────────────────────

export interface AAAPlanetMaterialOptions {
	radius: number;
	isAkunalia?: boolean;
	displacementEnabled?: boolean;
	atmosphereColor?: string;
	sunsetColor?: string;
}

export function createAAAPlanetMaterial(opts: AAAPlanetMaterialOptions): ShaderMaterial {
	const scale = opts.radius / 5.0;
	return new ShaderMaterial({
		side: FrontSide,
		toneMapped: true,
		uniforms: {
			uAlbedoTex: { value: null as Texture | null },
			uElevSdfTex: { value: null as Texture | null },
			uNormalSpecTex: { value: null as Texture | null },
			uNightTex: { value: null as Texture | null },
			uCloudsTex: { value: null as Texture | null },
			uHasAlbedo: { value: 0.0 },
			uHasGeo: { value: 0.0 },
			uHasNight: { value: 0.0 },
			uHasClouds: { value: 0.0 },
			uTexSize: { value: new Vector2(2048, 1024) },
			uSeaLevel: { value: SEA_LEVEL_NORM },
			uElevationAmp: {
				value: opts.displacementEnabled !== false ? PLANET_ELEVATION_AMP * scale : 0.0
			},
			uSunDir: { value: new Vector3(-0.62, 0.18, 0.76).normalize() },
			uTime: { value: 0.0 },
			uCloudDrift: { value: 0.0019 },
			uAtmosphereColor: { value: new Color(opts.atmosphereColor ?? '#38bdf8') },
			uSunsetColor: { value: new Color(opts.sunsetColor ?? '#ff6d2e') },
			uIsAkunalia: { value: opts.isAkunalia ? 1.0 : 0.0 },
			uTimeline: { value: 1.0 },
			uNightIntensity: { value: opts.isAkunalia ? 3.10 : 2.35 },
			uDaylightMode: { value: 0.0 }
		},
		vertexShader: /* glsl */ `
			uniform sampler2D uElevSdfTex;
			uniform float uHasGeo;
			uniform vec2 uTexSize;
			uniform float uSeaLevel;
			uniform float uElevationAmp;

			varying vec2 vUv;
			varying vec3 vLocalUnit;
			varying vec3 vWorldPos;
			varying vec3 vWorldSphereN;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;
			varying float vHeight;
			varying float vSdf;

			${GLSL_COMMON}

			void main() {
				vUv = uv;
				vec3 unitN = normalize(position);
				vLocalUnit = unitN;

				float h = uSeaLevel;
				float sdf = 0.5;
				if (uHasGeo > 0.5) {
					vec3 s = sampleElevSdfBilinear(uElevSdfTex, uv, uTexSize);
					h = s.x;
					sdf = s.y;
				}
				vHeight = h;
				vSdf = sdf;

				// Subtle 1.1% land-only elevation relief; oceans remain a crisp hydrostatic sphere
				float landLift = h > uSeaLevel
					? ((h - uSeaLevel) / max(0.001, 1.0 - uSeaLevel)) * uElevationAmp
					: 0.0;
				vec3 displaced = position + unitN * landLift;

				// Pole-safe East (+lng) & North (+lat) orthonormal basis matching projection.ts
				vec3 rawEast = vec3(unitN.z, 0.0, -unitN.x);
				float eastLen = length(rawEast);
				vec3 localEast = eastLen > 0.0001 ? (rawEast / eastLen) : vec3(0.0, 0.0, -1.0);
				vec3 localNorth = normalize(cross(unitN, localEast));

				mat3 rotM = mat3(modelMatrix);
				vWorldSphereN = normalize(rotM * unitN);
				vWorldEast = normalize(rotM * localEast);
				vWorldNorth = normalize(rotM * localNorth);

				vec4 worldPos4 = modelMatrix * vec4(displaced, 1.0);
				vWorldPos = worldPos4.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPos4;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uAlbedoTex;
			uniform sampler2D uElevSdfTex;
			uniform sampler2D uNormalSpecTex;
			uniform sampler2D uNightTex;
			uniform sampler2D uCloudsTex;
			uniform float uHasAlbedo;
			uniform float uHasGeo;
			uniform float uHasNight;
			uniform float uHasClouds;
			uniform vec2 uTexSize;
			uniform float uSeaLevel;
			uniform vec3 uSunDir;
			uniform float uTime;
			uniform float uCloudDrift;
			uniform vec3 uAtmosphereColor;
			uniform vec3 uSunsetColor;
			uniform float uIsAkunalia;
			uniform float uTimeline;
			uniform float uNightIntensity;
			uniform float uDaylightMode;

			varying vec2 vUv;
			varying vec3 vLocalUnit;
			varying vec3 vWorldPos;
			varying vec3 vWorldSphereN;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;
			varying float vHeight;
			varying float vSdf;

			${GLSL_COMMON}

			// Multi-Octave Ridged + FBM Detail Field attenuated by screen-space fwidth derivatives
			float sampleLandDetailField(vec3 unitP, float mtn, float w1, float w2, float w3) {
				float r1 = ridged3(unitP * 68.0);
				float f1 = fbm3(unitP * 92.0 + vec3(4.1, 8.7, 2.3));
				float oct1 = mix(f1, r1, 0.35 + 0.55 * mtn) * w1;

				float r2 = 1.0 - abs(noise3(unitP * 215.0) * 2.0 - 1.0);
				float f2 = noise3(unitP * 185.0 + vec3(11.4, 3.2, 7.9));
				float oct2 = mix(f2, r2 * r2, 0.40 + 0.50 * mtn) * 0.52 * w2;

				float r3 = 1.0 - abs(noise3(unitP * 440.0) * 2.0 - 1.0);
				float oct3 = (r3 * r3) * 0.26 * w3;

				return oct1 + oct2 + oct3;
			}

			void main() {
				vec2 uvWrapped = vec2(vUv.x, clamp(vUv.y, 0.0008, 0.9992));

				// 1. Base 4096×2048 PBR Albedo (decoded from sRGB to linear by WebGL)
				vec3 albedo = uHasAlbedo > 0.5
					? texture2D(uAlbedoTex, uvWrapped).rgb
					: mix(vec3(0.015, 0.055, 0.14), vec3(0.08, 0.22, 0.10), step(0.5, vSdf));

				// 2. Tangent-space Normal + CavityAO/WaterMask (2048×1024) — full relief across plains & forests!
				vec3 sphereN = normalize(vWorldSphereN);
				vec3 eastT = normalize(vWorldEast);
				vec3 northT = normalize(vWorldNorth);

				float mountainFactor = smoothstep(uSeaLevel + 0.16, uSeaLevel + 0.44, vHeight);
				float blueChan = vSdf < 0.5 ? 0.90 : 0.46;
				vec2 nXY = vec2(0.0);
				if (uHasGeo > 0.5) {
					vec4 ns = texture2D(uNormalSpecTex, uvWrapped);
					nXY = (ns.rg * 2.0 - 1.0) * mix(0.92, 1.24, mountainFactor);
					blueChan = ns.b;
				}

				float isWater = uHasGeo > 0.5
					? smoothstep(0.66, 0.80, blueChan)
					: (vSdf < 0.5 ? 1.0 : 0.0);
				float bakedCavityAO = uHasGeo > 0.5
					? mix(clamp((blueChan - 0.02) / 0.44, 0.36, 1.0), 1.0, isWater)
					: 1.0;

				// Anti-aliased Multi-Octave Ridged + FBM Detail Normals via screen-space fwidth
				float fw = length(fwidth(vLocalUnit));
				float w1 = 1.0 - smoothstep(0.0055, 0.0160, fw);
				float w2 = 1.0 - smoothstep(0.0022, 0.0070, fw);
				float w3 = 1.0 - smoothstep(0.0009, 0.0030, fw);

				vec3 uP = normalize(vLocalUnit);
				vec3 rawE = vec3(uP.z, 0.0, -uP.x);
				vec3 locE = length(rawE) > 0.0001 ? normalize(rawE) : vec3(0.0, 0.0, -1.0);
				vec3 locN = normalize(cross(uP, locE));
				float epsD = 0.0022;
				float dBase = sampleLandDetailField(uP, mountainFactor, w1, w2, w3);
				float dEast = sampleLandDetailField(normalize(uP + locE * epsD), mountainFactor, w1, w2, w3);
				float dNorth = sampleLandDetailField(normalize(uP + locN * epsD), mountainFactor, w1, w2, w3);
				float detailAmp = (0.16 + 0.28 * mountainFactor) * (1.0 - isWater);
				vec2 microLand = vec2(dBase - dEast, dBase - dNorth) * (detailAmp / epsD) * 0.012;

				// Capillary ocean wave micro-normals strictly on liquid water
				float wWave = 1.0 - smoothstep(0.0025, 0.0095, fw);
				vec3 pWave = uP * 195.0 + vec3(uTime * 0.16, -uTime * 0.08, uTime * 0.13);
				float waveBase = noise3(pWave);
				vec2 microWater = vec2(
					noise3(pWave + vec3(0.24, 0.0, 0.0)) - waveBase,
					noise3(pWave + vec3(0.0, 0.24, 0.0)) - waveBase
				) * 0.088 * isWater * wWave;

				vec2 totalXY = nXY + microLand + microWater;
				float nz = sqrt(max(0.08, 1.0 - dot(totalXY, totalXY)));
				vec3 N = normalize(sphereN * nz + eastT * totalXY.x + northT * totalXY.y);

				// Crisp 4K micro-grain across ridges & canopy (attenuated cleanly by w1)
				float microGrain = mix(
					1.0,
					0.91 + 0.17 * dBase,
					(1.0 - isWater) * (0.20 + 0.48 * mountainFactor) * w1
				);
				albedo *= microGrain;

				// Subtle organic lagoon caustic shimmer inside Akunalia's Crescent Moon Sea (8.2°N, 46.2°E)
				vec3 crescentDir = normalize(vec3(0.685, 0.143, -0.714));
				if (uIsAkunalia > 0.5 && isWater > 0.5) {
					float dCres = acos(clamp(dot(uP, crescentDir), -1.0, 1.0));
					float caustic = fbm3(vLocalUnit * 34.0 + vec3(uTime * 0.07, -uTime * 0.04, uTime * 0.06));
					float wardMask = smoothstep(0.22, 0.05, dCres);
					albedo += vec3(0.012, 0.065, 0.072) * wardMask * smoothstep(0.38, 0.78, caustic);
				}

				vec3 V = normalize(cameraPosition - vWorldPos);
				vec3 L = normalize(uSunDir);

				float sphereNoL = dot(sphereN, L);
				float surfNoL = dot(N, L);

				// 3. Projected Cloud Shadow onto Continents & Ocean (offset along sun tangent!)
				float cloudShadow = 1.0;
				if (uHasClouds > 0.5) {
					float sunEast = dot(L, eastT);
					float sunNorth = dot(L, northT);
					vec2 shadowOffset = vec2(sunEast * 0.0038, sunNorth * 0.0038);
					vec2 shadowUv = vec2(
						uvWrapped.x - uTime * uCloudDrift - shadowOffset.x,
						clamp(uvWrapped.y - shadowOffset.y, 0.001, 0.999)
					);
					float cShadowSample = texture2D(uCloudsTex, shadowUv).r;
					float shadowSunGate = mix(smoothstep(-0.05, 0.28, sphereNoL), 1.0, uDaylightMode);
					cloudShadow = 1.0 - smoothstep(0.22, 0.85, cShadowSample) * 0.50 * shadowSunGate;
				}

				// 4. Cavity + Horizon Ambient Occlusion & Biome-Specific Oren-Nayar Rough Diffuse (0.88–0.98)
				float microCavity = mix(1.0, clamp(0.78 + 0.34 * dBase, 0.68, 1.05), (1.0 - isWater) * w1);
				float skyTiltAO = mix(clamp(0.48 + 0.52 * dot(N, sphereN), 0.54, 1.0), 1.0, isWater);
				float cavityAO = bakedCavityAO * microCavity * skyTiltAO;
				float horizonDelta = surfNoL - sphereNoL;
				float horizonAO = mix(
					clamp(1.0 + min(0.0, horizonDelta) * 1.55, 0.30, 1.0),
					1.0,
					isWater * 0.75
				);

				float luma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
				float canopyScore = smoothstep(0.005, 0.065, albedo.g - max(albedo.r, albedo.b * 0.95));
				float desertScore = smoothstep(0.015, 0.095, albedo.r - albedo.g) * (1.0 - mountainFactor);
				float snowScore = smoothstep(0.42, 0.72, luma);
				float landRoughness = clamp(
					0.92 + 0.05 * canopyScore - 0.04 * desertScore + 0.03 * mountainFactor + 0.03 * snowScore,
					0.88,
					0.98
				);

				vec3 L_fill = normalize(V * 0.68 - L * 0.44 + vec3(0.0, 0.26, 0.0));
				float landOrenNayar = orenNayarDiffuse(L, V, N, landRoughness);
				float landDayFill = orenNayarDiffuse(L_fill, V, N, landRoughness) * 0.42 * uDaylightMode;
				float waterCineDiffuse = max(0.0, surfNoL);
				float waterDayDiffuse = clamp(0.48 + 0.58 * surfNoL, 0.40, 1.06);
				float waterDiffuse = mix(waterCineDiffuse, waterDayDiffuse, uDaylightMode);
				float cineDayMask = smoothstep(-0.12, 0.18, sphereNoL);
				float dayMask = mix(cineDayMask, 1.0, uDaylightMode);
				float directDiffuse =
					mix((landOrenNayar * horizonAO + landDayFill), waterDiffuse, isWater) * dayMask * cavityAO;

				// Warm golden-amber scattering band across the Cinematic Day/Night Terminator
				float terminatorBand =
					smoothstep(-0.15, -0.01, sphereNoL)
					* (1.0 - smoothstep(0.02, 0.20, sphereNoL))
					* (1.0 - uDaylightMode);
				vec3 sunsetLight = uSunsetColor * terminatorBand * max(0.15, 0.5 + 0.5 * surfNoL) * 0.36 * cloudShadow;

				vec3 sunTint = mix(vec3(1.26, 1.21, 1.15), vec3(1.16, 1.15, 1.13), uDaylightMode);
				vec3 sunIrradiance = sunTint * directDiffuse * cloudShadow + sunsetLight;

				// Deep-space night ambient vs Daylight Observation global sky-dome fill
				vec3 cineAmbient = mix(vec3(0.008, 0.011, 0.020), uAtmosphereColor * 0.042, cineDayMask);
				vec3 skyDomeAmbient = mix(vec3(0.28, 0.32, 0.38), vec3(0.38, 0.42, 0.48), 0.5 + 0.5 * sphereN.y)
					+ uAtmosphereColor * 0.07;
				vec3 ambientIrradiance = mix(cineAmbient, skyDomeAmbient, uDaylightMode) * cavityAO;

				vec3 oceanVolumeScatter = vec3(0.010, 0.038, 0.088) * isWater * uDaylightMode * (0.45 + 0.55 * cloudShadow);
				vec3 color = albedo * (ambientIrradiance + sunIrradiance) + oceanVolumeScatter;

				// 5. Physical GGX Solar Glint + Grazing Sky Fresnel STRICTLY on True Water (isWater ONLY — ZERO land specular!)
				if (isWater > 0.01) {
					float sunVis = mix(smoothstep(-0.04, 0.18, sphereNoL), 1.0, uDaylightMode) * cloudShadow;
					float ggxCore = ggxWaterSpecular(L, V, N, 0.085);
					float ggxBroad = ggxWaterSpecular(L, V, N, 0.24) * 0.26;
					vec3 glintTint = mix(vec3(1.0, 0.96, 0.90), uSunsetColor * 1.20, terminatorBand * 0.70);
					color += glintTint * clamp(ggxCore + ggxBroad, 0.0, 2.2) * isWater * sunVis;

					float waterGrazing = clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0);
					float waterFresnel = pow(waterGrazing, 4.2);
					float skyVis = mix(smoothstep(-0.08, 0.35, sphereNoL), 1.0, uDaylightMode);
					color += uAtmosphereColor * waterFresnel * isWater * skyVis * 0.16;
				}

				// 6. Atmospheric Aerial Perspective Haze toward sunlit planetary limb
				float viewFresnel = pow(clamp(1.0 - max(0.0, dot(sphereN, V)), 0.0, 1.0), 3.6);
				vec3 limbScatter = mix(uAtmosphereColor * 0.52, uSunsetColor * 0.65, terminatorBand);
				float limbLit = mix(smoothstep(-0.16, 0.32, sphereNoL), 0.85, uDaylightMode);
				color = mix(color, color + limbScatter * limbLit * 0.36, viewFresnel);

				// 7. HDR Night-Side Emissive (fades gracefully when Daylight Observation Mode is active)
				if (uHasNight > 0.5 && uDaylightMode < 0.99) {
					vec3 nightSample = clamp(texture2D(uNightTex, uvWrapped).rgb, 0.0, 1.0);
					float nightPeak = max(nightSample.r, max(nightSample.g, nightSample.b));
					vec3 nightLift;
					if (uIsAkunalia > 0.5) {
						vec3 chroma = nightSample / max(0.0001, nightPeak);
						float cleanPeak = smoothstep(0.0045, 0.024, nightPeak) * pow(nightPeak, 0.68);
						nightLift = chroma * cleanPeak * (1.18 + 1.35 * smoothstep(0.05, 0.58, nightPeak));
					} else {
						nightLift = nightSample * (1.22 + 1.55 * smoothstep(0.012, 0.52, nightPeak));
					}
					float nightVis = smoothstep(0.12, -0.16, sphereNoL) * (1.0 - uDaylightMode);
					float cloudVeil = 1.0;
					if (uHasClouds > 0.5) {
						vec2 cUv = vec2(uvWrapped.x - uTime * uCloudDrift, uvWrapped.y);
						cloudVeil = 1.0 - texture2D(uCloudsTex, cUv).r * (uIsAkunalia > 0.5 ? 0.30 : 0.42);
					}
					float pulse = uIsAkunalia > 0.5 ? (0.94 + 0.08 * sin(uTime * 1.35 + vLocalUnit.x * 7.0)) : 1.0;
					color += nightLift * uNightIntensity * nightVis * cloudVeil * pulse;
				}

				gl_FragColor = vec4(color, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Dynamic Lit Cloud Deck (`createAAACloudMaterial`)
// ──────────────────────────────────────────────────────────────────────────────

export interface AAACloudMaterialOptions {
	sunsetColor?: string;
	opacity?: number;
}

export function createAAACloudMaterial(opts: AAACloudMaterialOptions = {}): ShaderMaterial {
	return new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: FrontSide,
		toneMapped: true,
		uniforms: {
			uCloudsTex: { value: null as Texture | null },
			uHasClouds: { value: 0.0 },
			uSunDir: { value: new Vector3(-0.62, 0.18, 0.76).normalize() },
			uSunsetColor: { value: new Color(opts.sunsetColor ?? '#ff8243') },
			uOpacity: { value: opts.opacity ?? 0.84 },
			uDaylightMode: { value: 0.0 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vWorldPos;
			varying vec3 vWorldNormal;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;

			void main() {
				vUv = uv;
				vec3 unitN = normalize(position);
				vec3 rawEast = vec3(unitN.z, 0.0, -unitN.x);
				vec3 localEast = length(rawEast) > 0.0001 ? normalize(rawEast) : vec3(0.0, 0.0, -1.0);
				vec3 localNorth = normalize(cross(unitN, localEast));

				mat3 rotM = mat3(modelMatrix);
				vWorldNormal = normalize(rotM * unitN);
				vWorldEast = normalize(rotM * localEast);
				vWorldNorth = normalize(rotM * localNorth);

				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uCloudsTex;
			uniform float uHasClouds;
			uniform vec3 uSunDir;
			uniform vec3 uSunsetColor;
			uniform float uOpacity;
			uniform float uDaylightMode;

			varying vec2 vUv;
			varying vec3 vWorldPos;
			varying vec3 vWorldNormal;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;

			void main() {
				if (uHasClouds < 0.5) discard;
				vec2 uvW = vec2(vUv.x, clamp(vUv.y, 0.001, 0.999));
				float density = texture2D(uCloudsTex, uvW).r;
				float alpha = smoothstep(0.14, 0.86, density) * uOpacity;
				if (alpha < 0.006) discard;

				// 3D Cumulus Cloud Top Self-Shading via local density gradient toward sun
				vec3 N = normalize(vWorldNormal);
				vec3 L = normalize(uSunDir);
				vec3 V = normalize(cameraPosition - vWorldPos);

				float sunE = dot(L, normalize(vWorldEast));
				float sunN = dot(L, normalize(vWorldNorth));
				vec2 gradUv = vec2(uvW.x + sunE * 0.0016, clamp(uvW.y + sunN * 0.0016, 0.001, 0.999));
				float sunwardDensity = texture2D(uCloudsTex, gradUv).r;
				float cloudBump = clamp(1.0 - (sunwardDensity - density) * 2.1, 0.50, 1.22);

				float NoL = dot(N, L);
				float cineDayLit = smoothstep(-0.12, 0.22, NoL) * (0.34 + 0.76 * max(0.0, NoL));
				float daylightCloud = 0.62 + 0.44 * max(0.0, NoL);
				float dayLit = mix(cineDayLit, daylightCloud, uDaylightMode);
				float terminator = smoothstep(-0.14, -0.01, NoL) * (1.0 - smoothstep(0.01, 0.16, NoL)) * (1.0 - uDaylightMode);

				// Silver-lining forward scatter near sunlit horizon
				float fwdCos = clamp(dot(-V, L), 0.0, 1.0);
				float cloudGrazing = clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0);
				float forwardMie = pow(fwdCos, 6.0) * (cloudGrazing * cloudGrazing) * 0.30 * (1.0 - uDaylightMode * 0.65);

				vec3 dayCol = vec3(1.05, 1.04, 1.03) * dayLit * cloudBump;
				vec3 sunsetCol = uSunsetColor * terminator * 0.48 * cloudBump;
				vec3 nightCol = mix(vec3(0.008, 0.012, 0.022), vec3(0.04, 0.05, 0.07), uDaylightMode);

				vec3 col = nightCol + dayCol + sunsetCol + uSunsetColor * forwardMie;
				gl_FragColor = vec4(col, alpha);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Rayleigh + Mie Atmospheric Limb Halo (`createAtmosphereMaterial`)
// ──────────────────────────────────────────────────────────────────────────────

export interface AtmosphereMaterialOptions {
	dayColor?: string;
	sunsetColor?: string;
	intensity?: number;
}

export function createAtmosphereMaterial(opts: AtmosphereMaterialOptions = {}): ShaderMaterial {
	return new ShaderMaterial({
		side: BackSide,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: true,
		uniforms: {
			uSunDir: { value: new Vector3(-0.62, 0.18, 0.76).normalize() },
			uDayColor: { value: new Color(opts.dayColor ?? '#38bdf8') },
			uSunsetColor: { value: new Color(opts.sunsetColor ?? '#ff6b2b') },
			uIntensity: { value: opts.intensity ?? 1.0 },
			uDaylightMode: { value: 0.0 }
		},
		vertexShader: /* glsl */ `
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;
			void main() {
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uSunDir;
			uniform vec3 uDayColor;
			uniform vec3 uSunsetColor;
			uniform float uIntensity;
			uniform float uDaylightMode;

			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				vec3 L = normalize(uSunDir);

				// BackSide shell: dot(N, V) approaches 0 at outer edge and -1 toward planet center
				float viewDot = clamp(-dot(N, V), 0.0, 1.0);
				float oneMinusView = clamp(1.0 - viewDot, 0.0, 1.0);
				float rim = pow(oneMinusView, 3.8) * smoothstep(0.0, 0.24, viewDot);

				float NoL = dot(N, L);
				float sunWrap = mix(smoothstep(-0.34, 0.55, NoL), 0.88, uDaylightMode);
				float terminator = smoothstep(-0.32, -0.04, NoL) * (1.0 - smoothstep(-0.02, 0.34, NoL)) * (1.0 - uDaylightMode);

				// Forward-scattered Mie silver-gold crescent when viewing toward host star
				float cosTheta = max(0.0, dot(-V, L));
				float mie = pow(cosTheta, 5.0) * 0.55 * (1.0 - uDaylightMode * 0.75);

				vec3 scatter = mix(uDayColor, uSunsetColor * 1.25, clamp(terminator * 0.9 + mie * 0.45, 0.0, 1.0));
				float alpha = rim * (0.04 + 0.96 * sunWrap + mie * 0.4) * uIntensity;
				vec3 col = scatter * alpha * 1.35;

				gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Host-Star Turbulent Photosphere & HDR Solar Corona (`Sun` & `Solis Prime`)
// ──────────────────────────────────────────────────────────────────────────────

export interface StarPlasmaMaterialOptions {
	coreColor?: string;
	edgeColor?: string;
	spotColor?: string;
}

export function createStarPlasmaMaterial(opts: StarPlasmaMaterialOptions = {}): ShaderMaterial {
	return new ShaderMaterial({
		side: FrontSide,
		toneMapped: true,
		uniforms: {
			uTime: { value: 0.0 },
			uCoreColor: { value: new Color(opts.coreColor ?? '#fff7dc') },
			uEdgeColor: { value: new Color(opts.edgeColor ?? '#ff6f1a') },
			uSpotColor: { value: new Color(opts.spotColor ?? '#521504') }
		},
		vertexShader: /* glsl */ `
			varying vec3 vLocalUnit;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;
			void main() {
				vLocalUnit = normalize(position);
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uCoreColor;
			uniform vec3 uEdgeColor;
			uniform vec3 uSpotColor;

			varying vec3 vLocalUnit;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;

			${GLSL_COMMON}

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				float mu = clamp(dot(N, V), 0.0, 1.0);

				// Domain-warped 3D magneto-convection granulation cells + active sunspot regions
				vec3 p = vLocalUnit * 5.6 + vec3(uTime * 0.025, -uTime * 0.018, uTime * 0.021);
				vec3 warp = vec3(
					fbm3(p + vec3(3.1, 7.2, 1.4)),
					fbm3(p + vec3(8.4, 2.5, 5.9)),
					fbm3(p + vec3(1.9, 6.3, 9.1))
				) * 0.55;

				float rawGranules = clamp(ridged3(vLocalUnit * 22.0 + warp * 2.2 + vec3(uTime * 0.07)), 0.0, 1.0);
				float granules = pow(rawGranules, 1.65);
				float fineCells = clamp(ridged3(vLocalUnit * 46.0 - warp * 1.4 + vec3(-uTime * 0.11)), 0.0, 1.0);
				float cellPattern = clamp(granules * 0.72 + fineCells * 0.28, 0.0, 1.0);
				float superGranules = fbm3(vLocalUnit * 7.5 + warp);
				float activeFaculae = smoothstep(0.56, 0.82, superGranules);

				// Realistic magnetic sunspot umbra + penumbra near solar active latitudes
				float latFactor = exp(-sqr((abs(vLocalUnit.y) - 0.22) / 0.19));
				float spotField = fbm3(vLocalUnit * 6.4 + vec3(12.4, 4.1, 8.7) + warp * 0.22);
				float penumbra = smoothstep(0.64, 0.73, spotField) * latFactor;
				float umbra = smoothstep(0.73, 0.80, spotField) * latFactor;

				// Physical Eddington stellar limb darkening + bright chromospheric spicule rim
				float limbDark = pow(mu, 0.52);
				vec3 darkLane = uEdgeColor * 0.50;
				vec3 photosphere = mix(darkLane, uCoreColor, clamp(limbDark * (0.36 + 0.76 * cellPattern), 0.0, 1.0));
				photosphere += uEdgeColor * activeFaculae * (0.35 + 0.65 * (1.0 - mu)) * 0.52;
				photosphere = mix(photosphere, uEdgeColor * 0.24, penumbra * 0.74);
				photosphere = mix(photosphere, uSpotColor, umbra * 0.92);

				// Richly graded HDR radiance: convection lanes stay fiery orange while granule peaks & spicule rim bloom
				float rimSpicules = pow(clamp(1.0 - mu, 0.0, 1.0), 3.2);
				vec3 hdrCol = photosphere * (0.68 + 0.58 * cellPattern * limbDark) + uEdgeColor * rimSpicules * 0.44;

				gl_FragColor = vec4(hdrCol, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

export function createSolarCoronaMaterial(colorHex = '#ff9a3c'): ShaderMaterial {
	return new ShaderMaterial({
		side: BackSide,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: true,
		uniforms: {
			uTime: { value: 0.0 },
			uColor: { value: new Color(colorHex) }
		},
		vertexShader: /* glsl */ `
			varying vec3 vLocalUnit;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;
			void main() {
				vLocalUnit = normalize(position);
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uColor;
			varying vec3 vLocalUnit;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;

			${GLSL_COMMON}

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				float viewDot = clamp(-dot(N, V), 0.0, 1.0);

				// Seamless radial corona falloff on 1.68*R shell (limb viewDot ≈ 0.803), decaying to 0 well before outer rim!
				float radialT = clamp(viewDot / 0.803, 0.0, 1.0);
				float coronaFalloff = pow(radialT, 3.6) * smoothstep(0.08, 0.36, radialT);
				float rayAngle = atan(vLocalUnit.y, vLocalUnit.x);
				float rayNoise = fbm3(vec3(cos(rayAngle) * 4.5, sin(rayAngle) * 4.5, uTime * 0.045));
				float streamers = 0.62 + 0.62 * rayNoise * fbm3(vLocalUnit * 6.5 + vec3(uTime * 0.04, -uTime * 0.025, 0.0));
				vec3 col = mix(uColor, vec3(1.0, 0.94, 0.80), pow(radialT, 2.4)) * coronaFalloff * streamers * 1.45;

				gl_FragColor = vec4(col, clamp(coronaFalloff * 0.94, 0.0, 1.0));
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Procedural 3D Planetary & Lunar Surface Shader (Solar System & Moons)
// ──────────────────────────────────────────────────────────────────────────────

export type ProceduralBodyStyle =
	| 'mercury'
	| 'venus'
	| 'moon'
	| 'akunalia_moon_major'
	| 'akunalia_moon_minor'
	| 'mars'
	| 'jupiter'
	| 'saturn'
	| 'uranus'
	| 'neptune';

const STYLE_ID_MAP: Record<ProceduralBodyStyle, number> = {
	mercury: 1,
	venus: 2,
	moon: 3,
	akunalia_moon_major: 4,
	akunalia_moon_minor: 5,
	mars: 6,
	jupiter: 7,
	saturn: 8,
	uranus: 9,
	neptune: 10
};

export interface ProceduralBodyMaterialOptions {
	style: ProceduralBodyStyle;
	radius: number;
}

export function createProceduralBodyMaterial(opts: ProceduralBodyMaterialOptions): ShaderMaterial {
	return new ShaderMaterial({
		side: FrontSide,
		toneMapped: true,
		uniforms: {
			uStyle: { value: STYLE_ID_MAP[opts.style] },
			uRadius: { value: opts.radius },
			uSunDir: { value: new Vector3(-0.62, 0.18, 0.76).normalize() },
			uRingNormal: { value: new Vector3(0.0, 1.0, 0.0) },
			uTime: { value: 0.0 },
			uDaylightMode: { value: 0.0 }
		},
		vertexShader: /* glsl */ `
			varying vec3 vLocalUnit;
			varying vec3 vWorldPos;
			varying vec3 vWorldNormal;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;

			void main() {
				vec3 unitN = normalize(position);
				vLocalUnit = unitN;

				vec3 rawEast = vec3(unitN.z, 0.0, -unitN.x);
				vec3 localEast = length(rawEast) > 0.0001 ? normalize(rawEast) : vec3(0.0, 0.0, -1.0);
				vec3 localNorth = normalize(cross(unitN, localEast));

				mat3 rotM = mat3(modelMatrix);
				vWorldNormal = normalize(rotM * unitN);
				vWorldEast = normalize(rotM * localEast);
				vWorldNorth = normalize(rotM * localNorth);

				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uStyle;
			uniform float uRadius;
			uniform vec3 uSunDir;
			uniform vec3 uRingNormal;
			uniform float uTime;
			uniform float uDaylightMode;

			varying vec3 vLocalUnit;
			varying vec3 vWorldPos;
			varying vec3 vWorldNormal;
			varying vec3 vWorldEast;
			varying vec3 vWorldNorth;

			${GLSL_COMMON}

			// Multi-scale impact crater profile (bowl depression + raised ejecta rim)
			float craterField(vec3 p) {
				float c1 = ridged3(p * 5.4);
				float c2 = ridged3(p * 14.5 + vec3(4.2, 9.1, 2.7));
				float c3 = fbm3(p * 34.0);
				float rim1 = smoothstep(0.62, 0.86, c1) - smoothstep(0.86, 0.98, c1) * 1.45;
				float rim2 = smoothstep(0.60, 0.85, c2) - smoothstep(0.85, 0.98, c2) * 1.35;
				return rim1 * 0.55 + rim2 * 0.32 + (c3 - 0.5) * 0.25;
			}

			void main() {
				vec3 P = normalize(vLocalUnit);
				vec3 sphereN = normalize(vWorldNormal);
				vec3 eastT = normalize(vWorldEast);
				vec3 northT = normalize(vWorldNorth);
				vec3 V = normalize(cameraPosition - vWorldPos);
				vec3 L = normalize(uSunDir);

				vec3 albedo = vec3(0.5);
				vec3 emissive = vec3(0.0);
				float bumpScale = 0.0;
				float hCenter = 0.0;
				float hEast = 0.0;
				float hNorth = 0.0;
				float eps = 0.008;
				vec3 pE = normalize(P + vec3(P.z, 0.0, -P.x) * eps);
				vec3 pN = normalize(P + vec3(0.0, 1.0, 0.0) * eps);

				int style = int(uStyle + 0.5);

				if (style == 1) {
					// MERCURY — Caloris-like impact basins, bright crater rays, iron-silicate regolith
					hCenter = craterField(P * 1.35);
					hEast = craterField(pE * 1.35);
					hNorth = craterField(pN * 1.35);
					bumpScale = 2.4;
					float maria = smoothstep(0.35, 0.72, fbm3(P * 2.6 + vec3(1.7)));
					float rays = pow(clamp(ridged3(P * 18.0), 0.0, 1.0), 3.0);
					albedo = mix(vec3(0.18, 0.165, 0.155), vec3(0.34, 0.32, 0.295), 0.5 + hCenter * 0.6);
					albedo = mix(albedo, vec3(0.13, 0.12, 0.115), maria * 0.55);
					albedo += vec3(0.14, 0.135, 0.13) * rays * 0.55;
				} else if (style == 2) {
					// VENUS — Super-rotating creamy sulfuric-acid Y-wave clouds
					float rot = uTime * 0.015;
					vec3 q = vec3(P.x * cos(rot) - P.z * sin(rot), P.y, P.x * sin(rot) + P.z * cos(rot));
					float yChevron = fbm3(vec3(q.x * 2.2, q.y * 5.8 + abs(q.y) * 2.4, q.z * 2.2));
					float streaks = fbm3(vec3(q.x * 5.0, q.y * 14.0, q.z * 5.0) + yChevron * 1.2);
					albedo = mix(vec3(0.68, 0.51, 0.28), vec3(0.93, 0.84, 0.63), smoothstep(0.28, 0.74, yChevron * 0.55 + streaks * 0.45));
				} else if (style == 3 || style == 4 || style == 5) {
					// EARTH MOON & AKUNALIA TWIN MOONS (Selene-Prime & Cryo-Mineral Minor Moon)
					float freq = style == 5 ? 1.05 : 1.15;
					hCenter = craterField(P * freq);
					hEast = craterField(pE * freq);
					hNorth = craterField(pN * freq);
					bumpScale = style == 5 ? 1.35 : 2.35;
					float maria = smoothstep(0.42, 0.74, fbm3(P * 2.1 + vec3(style == 4 ? 5.2 : 0.4)));
					float ejecta = pow(clamp(ridged3(P * (style == 5 ? 6.5 : 13.0)), 0.0, 1.0), 3.0);
					if (style == 3) {
						albedo = mix(vec3(0.38, 0.37, 0.355), vec3(0.13, 0.13, 0.14), maria * 0.82);
						albedo += vec3(0.18) * ejecta * (1.0 - maria * 0.5);
					} else if (style == 4) {
						// Greater Silver Moon: silvery-pearl frost moon with faint aquamarine ice rilles
						albedo = mix(vec3(0.46, 0.50, 0.56), vec3(0.18, 0.24, 0.31), maria * 0.72);
						albedo += vec3(0.14, 0.21, 0.25) * ejecta;
						emissive = vec3(0.015, 0.12, 0.16) * pow(ejecta, 2.2);
					} else {
						// Crystalline Minor Moon: silky slate-ice cryo-mineral surface (zero pixel speckle!)
						float frostBand = fbm3(P * 3.8 + vec3(2.1));
						albedo = mix(vec3(0.28, 0.34, 0.40), vec3(0.13, 0.17, 0.23), maria * 0.68);
						albedo = mix(albedo, vec3(0.42, 0.52, 0.58), smoothstep(0.48, 0.82, frostBand) * 0.42);
						albedo += vec3(0.08, 0.13, 0.16) * ejecta;
					}
				} else if (style == 6) {
					// MARS — Rust ferric oxide plains, dark Syrtis basalt, Valles Marineris & polar ice caps
					float canyon = smoothstep(0.16, 0.02, abs(P.y + 0.12 + fbm3(P * 6.0) * 0.08)) * smoothstep(0.2, 0.7, P.x);
					hCenter = craterField(P * 1.1) * 0.65 - canyon * 0.55;
					hEast = craterField(pE * 1.1) * 0.65;
					hNorth = craterField(pN * 1.1) * 0.65;
					bumpScale = 2.2;

					float basalt = smoothstep(0.45, 0.75, fbm3(P * 3.1 + vec3(2.8, 1.1, 4.5)));
					vec3 rustBright = vec3(0.74, 0.36, 0.18);
					vec3 rustMid = vec3(0.54, 0.24, 0.12);
					vec3 syrtisDark = vec3(0.21, 0.13, 0.10);
					albedo = mix(rustMid, rustBright, fbm3(P * 9.0));
					albedo = mix(albedo, syrtisDark, basalt * 0.76 + canyon * 0.65);

					float polarCap = smoothstep(0.84, 0.93, abs(P.y) + (fbm3(P * 18.0) - 0.5) * 0.08);
					albedo = mix(albedo, vec3(0.92, 0.90, 0.88), polarCap);
				} else if (style == 7) {
					// JUPITER — Zonal ammonia belts/zones, Kelvin-Helmholtz eddies & Great Red Spot!
					float lat = asin(clamp(P.y, -1.0, 1.0));
					float lng = atan(P.z, P.x);
					float turb = fbm3(vec3(P.x * 4.5 + uTime * 0.02, P.y * 18.0, P.z * 4.5));
					float warpedLat = lat + (turb - 0.5) * 0.14;

					float zones = sin(warpedLat * 19.0) * 0.5 + 0.5;
					float fineBands = sin(warpedLat * 46.0 + turb * 4.5) * 0.5 + 0.5;
					vec3 creamZone = vec3(0.86, 0.80, 0.69);
					vec3 ochreBelt = vec3(0.64, 0.39, 0.23);
					vec3 umberBelt = vec3(0.42, 0.25, 0.17);
					vec3 polarSlate = vec3(0.38, 0.40, 0.44);

					albedo = mix(ochreBelt, creamZone, smoothstep(0.22, 0.78, zones));
					albedo = mix(albedo, umberBelt, smoothstep(0.65, 0.95, fineBands) * (1.0 - zones) * 0.65);

					// Great Red Spot anticyclone at 22°S
					float dLat = (lat - (-0.384)) / 0.13;
					float dLng = atan(sin(lng - 0.42 - uTime * 0.012), cos(lng - 0.42 - uTime * 0.012)) / 0.26;
					float grsR = sqrt(dLat * dLat + dLng * dLng);
					if (grsR < 1.35) {
						float swirl = atan(dLat, dLng) + (1.35 - grsR) * 4.2;
						float ringTex = 0.5 + 0.5 * sin(grsR * 16.0 + sin(swirl * 2.0) * 0.8);
						vec3 grsCol = mix(vec3(0.76, 0.24, 0.14), vec3(0.90, 0.48, 0.30), ringTex * 0.55);
						float grsMask = smoothstep(1.28, 0.55, grsR);
						albedo = mix(albedo, grsCol, grsMask);
					}
					albedo = mix(albedo, polarSlate, smoothstep(0.72, 0.96, abs(P.y)));
				} else if (style == 8) {
					// SATURN — Silky golden-butterscotch bands + North Polar Hexagon + Ring Shadow!
					float lat = asin(clamp(P.y, -1.0, 1.0));
					float turb = fbm3(vec3(P.x * 3.2, P.y * 22.0, P.z * 3.2));
					float wLat = lat + (turb - 0.5) * 0.055;
					float bands = 0.5 + 0.5 * sin(wLat * 24.0);
					float subtle = 0.5 + 0.5 * cos(wLat * 54.0 + turb * 2.5);

					vec3 paleGold = vec3(0.87, 0.79, 0.61);
					vec3 warmTan = vec3(0.71, 0.59, 0.42);
					vec3 polarBlueGrey = vec3(0.42, 0.48, 0.50);
					albedo = mix(warmTan, paleGold, bands * 0.72 + subtle * 0.28);
					albedo = mix(albedo, polarBlueGrey, smoothstep(0.78, 0.97, abs(P.y)));
				} else if (style == 9) {
					// URANUS — Serene pale cyan-aquamarine methane haze + subtle polar hood
					float lat = asin(clamp(P.y, -1.0, 1.0));
					float band = 0.5 + 0.5 * sin(lat * 12.0 + fbm3(P * 4.0) * 0.4);
					albedo = mix(vec3(0.46, 0.79, 0.84), vec3(0.64, 0.89, 0.91), band * 0.35 + smoothstep(0.4, 0.95, abs(P.y)) * 0.45);
				} else {
					// NEPTUNE — Deep cobalt-sapphire methane bands, Great Dark Spot & white cirrus streaks
					float lat = asin(clamp(P.y, -1.0, 1.0));
					float lng = atan(P.z, P.x);
					float turb = fbm3(vec3(P.x * 4.0 + uTime * 0.025, P.y * 16.0, P.z * 4.0));
					float bands = 0.5 + 0.5 * sin((lat + (turb - 0.5) * 0.08) * 18.0);
					albedo = mix(vec3(0.09, 0.22, 0.62), vec3(0.18, 0.42, 0.86), bands);

					float dLat = (lat - (-0.34)) / 0.14;
					float dLng = atan(sin(lng + 0.5), cos(lng + 0.5)) / 0.28;
					float gds = smoothstep(1.1, 0.35, sqrt(dLat * dLat + dLng * dLng));
					albedo = mix(albedo, vec3(0.04, 0.09, 0.34), gds * 0.78);

					float cirrus = smoothstep(0.76, 0.92, fbm3(vec3(P.x * 7.0, P.y * 36.0, P.z * 7.0) + turb));
					albedo = mix(albedo, vec3(0.88, 0.94, 1.0), cirrus * 0.75 * (1.0 - smoothstep(0.75, 0.95, abs(P.y))));
				}

				vec3 N = sphereN;
				if (bumpScale > 0.01) {
					float dE = (hEast - hCenter) * bumpScale;
					float dN = (hNorth - hCenter) * bumpScale;
					N = normalize(sphereN - eastT * dE - northT * dN);
				}

				// Projected shadow of Saturn's Cassini rings onto Saturn's cloud tops!
				float ringShadow = 1.0;
				if (style == 8) {
					vec3 RN = normalize(uRingNormal);
					float denom = dot(L, RN);
					if (abs(denom) > 0.005) {
						vec3 surfOffset = sphereN * uRadius;
						float tHit = -dot(surfOffset, RN) / denom;
						if (tHit > 0.0) {
							vec3 hitPt = surfOffset + L * tHit;
							float rRatio = length(hitPt) / uRadius;
							if (rRatio > 1.24 && rRatio < 2.32) {
								float uR = (rRatio - 1.24) / (2.32 - 1.24);
								float cassiniGap = 1.0 - smoothstep(0.54, 0.56, uR) * (1.0 - smoothstep(0.60, 0.62, uR));
								float optical = smoothstep(0.04, 0.22, uR) * (1.0 - smoothstep(0.94, 1.0, uR)) * cassiniGap;
								ringShadow = 1.0 - optical * 0.68;
							}
						}
					}
				}

				float sphereNoL = dot(sphereN, L);
				float isRocky = (style == 1 || (style >= 3 && style <= 6)) ? 1.0 : 0.0;
				float surfRough = isRocky > 0.5 ? 0.94 : 0.78;
				vec3 L_fill = normalize(V * 0.68 - L * 0.44 + vec3(0.0, 0.26, 0.0));
				float rawDiffuse = orenNayarDiffuse(L, V, N, surfRough);
				float dayFill = orenNayarDiffuse(L_fill, V, N, surfRough);
				float cineGate = smoothstep(-0.10, 0.16, sphereNoL);
				float terminator = smoothstep(-0.18, 0.0, sphereNoL) * (1.0 - smoothstep(0.02, 0.24, sphereNoL)) * (1.0 - uDaylightMode);

				// Decode perceptual sRGB procedural palette into linear space before ACES + sRGB output
				vec3 albedoClamped = clamp(albedo, vec3(0.0), vec3(1.0));
				vec3 linearAlbedo = pow(albedoClamped, vec3(2.2));

				// Gas giants & Venus cloud-scattering wrap + Minnaert spherical limb darkening
				float gasWrap = (style == 2 || style >= 7) ? smoothstep(-0.18, 0.85, sphereNoL) * 0.18 : 0.0;
				float viewCos = clamp(dot(sphereN, V), 0.0, 1.0);
				float limbDarkening = isRocky > 0.5 ? 1.0 : mix(0.54, 1.04, pow(viewCos, 0.42));

				vec3 cineIrradiance =
					vec3(0.008, 0.010, 0.018)
					+ vec3(1.32, 1.26, 1.18) * (rawDiffuse + gasWrap) * cineGate * ringShadow;
				vec3 dayIrradiance =
					vec3(0.22, 0.24, 0.28)
					+ vec3(1.06, 1.04, 1.00) * (rawDiffuse * 0.78 + dayFill * 0.24) * ringShadow;
				vec3 lit = linearAlbedo * mix(cineIrradiance, dayIrradiance, uDaylightMode) * limbDarkening;
				if (style == 6) {
					// Mars butterscotch dust limb scatter
					float marsGrazing = clamp(1.0 - max(0.0, dot(sphereN, V)), 0.0, 1.0);
					float marsRim = pow(marsGrazing, 3.2) * mix(smoothstep(-0.15, 0.4, sphereNoL), 0.85, uDaylightMode);
					lit += vec3(0.48, 0.21, 0.08) * marsRim * 0.28 + vec3(0.58, 0.18, 0.05) * terminator * 0.16;
				}
				lit += emissive * smoothstep(0.12, -0.20, sphereNoL) * (1.0 - uDaylightMode);

				gl_FragColor = vec4(lit, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. Translucent Planetary Ring System (`Saturn` Cassini, `Uranus`, `Akunalia` Dust)
// ──────────────────────────────────────────────────────────────────────────────

export interface PlanetaryRingMaterialOptions {
	style: 'saturn' | 'uranus' | 'akunalia';
	planetRadius: number;
	innerRadius: number;
	outerRadius: number;
}

export function createPlanetaryRingMaterial(opts: PlanetaryRingMaterialOptions): ShaderMaterial {
	const styleCode = opts.style === 'saturn' ? 1.0 : opts.style === 'uranus' ? 2.0 : 3.0;
	return new ShaderMaterial({
		side: DoubleSide,
		transparent: true,
		depthWrite: false,
		toneMapped: true,
		uniforms: {
			uStyle: { value: styleCode },
			uPlanetRadius: { value: opts.planetRadius },
			uInnerRadius: { value: opts.innerRadius },
			uOuterRadius: { value: opts.outerRadius },
			uPlanetCenter: { value: new Vector3(0, 0, 0) },
			uSunDir: { value: new Vector3(-0.62, 0.18, 0.76).normalize() },
			uTime: { value: 0.0 },
			uDaylightMode: { value: 0.0 }
		},
		vertexShader: /* glsl */ `
			varying vec3 vLocalPos;
			varying vec3 vWorldPos;
			void main() {
				vLocalPos = position;
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vWorldPos = wp.xyz;
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uStyle;
			uniform float uPlanetRadius;
			uniform float uInnerRadius;
			uniform float uOuterRadius;
			uniform vec3 uPlanetCenter;
			uniform vec3 uSunDir;
			uniform float uTime;
			uniform float uDaylightMode;

			varying vec3 vLocalPos;
			varying vec3 vWorldPos;

			${GLSL_COMMON}

			void main() {
				// RingGeometry lies in local XY plane (rotated onto equatorial XZ plane in mesh)
				float r = length(vLocalPos.xy);
				float u = clamp((r - uInnerRadius) / max(0.0001, uOuterRadius - uInnerRadius), 0.0, 1.0);
				if (u <= 0.001 || u >= 0.999) discard;

				vec3 ringCol = vec3(0.8);
				float alpha = 0.0;

				if (uStyle < 1.5) {
					// SATURN — Authentic C Ring, bright B Ring, Cassini Division, A Ring, Encke Gap & F Ring!
					float fineRinglets = 0.5 + 0.5 * sin(u * 380.0 + sin(u * 95.0) * 1.4);
					float medBands = 0.5 + 0.5 * cos(u * 78.0);

					float cRing = smoothstep(0.02, 0.10, u) * (1.0 - smoothstep(0.18, 0.21, u)) * 0.26;
					float bRing = smoothstep(0.19, 0.23, u) * (1.0 - smoothstep(0.535, 0.555, u)) * (0.76 + 0.22 * fineRinglets);
					// Sharp dark Cassini Division [0.555 .. 0.608]
					float aRing = smoothstep(0.608, 0.625, u) * (1.0 - smoothstep(0.91, 0.935, u)) * (0.54 + 0.16 * fineRinglets);
					// Encke Gap around u = 0.855
					float enckeNotch = 1.0 - smoothstep(0.846, 0.852, u) * (1.0 - smoothstep(0.858, 0.864, u)) * 0.88;
					float fRing = exp(-sqr((u - 0.972) / 0.007)) * 0.52;

					alpha = clamp((cRing + bRing + aRing * enckeNotch + fRing), 0.0, 0.94);

					vec3 cTint = vec3(0.48, 0.45, 0.43);
					vec3 bTint = mix(vec3(0.82, 0.74, 0.59), vec3(0.94, 0.89, 0.78), medBands);
					vec3 aTint = mix(vec3(0.70, 0.66, 0.58), vec3(0.82, 0.78, 0.69), fineRinglets);
					ringCol = u < 0.20 ? cTint : (u < 0.58 ? bTint : aTint);
				} else if (uStyle < 2.5) {
					// URANUS — Delicate narrow charcoal-ice ringlets (6, 5, 4, alpha, beta, eta, gamma, delta, epsilon)
					float ringWave = clamp(0.5 + 0.5 * sin(u * 135.0), 0.0, 1.0);
					float ringlets = pow(ringWave, 6.0);
					float epsilon = exp(-sqr((u - 0.88) / 0.025));
					alpha = (ringlets * 0.16 + epsilon * 0.34) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.94, 1.0, u));
					ringCol = vec3(0.52, 0.68, 0.74);
				} else {
					// AKUNALIA — Gossamer Primordial Crystal Dust Ring (delicate translucent cyan-ice veil, zero grey fog!)
					float wave1 = exp(-sqr((u - 0.30) / 0.14));
					float wave2 = exp(-sqr((u - 0.68) / 0.16)) * 0.68;
					float envelope = (wave1 + wave2) * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.86, 1.0, u));
					float radialWisp = 0.82 + 0.18 * fbm3(vec3(u * 7.5, 0.0, uTime * 0.012));
					float dustSwirl = 0.80 + 0.32 * fbm3(vec3(vLocalPos.xy * 0.48, uTime * 0.020));
					float fineGlint = clamp(fbm3(vec3(vLocalPos.xy * 2.15, uTime * 0.035)), 0.0, 1.0);
					float sparkle = smoothstep(0.70, 0.93, fineGlint);
					alpha = envelope * radialWisp * dustSwirl * 0.018 + sparkle * 0.028 * envelope;
					ringCol = mix(vec3(0.32, 0.78, 0.96), vec3(0.72, 0.91, 1.0), u) + vec3(0.45, 0.95, 1.0) * sparkle * 0.75;
				}

				if (alpha < 0.004) discard;

				// Crisp cylindrical planetary shadow cast across the night side of the rings!
				vec3 rel = vWorldPos - uPlanetCenter;
				vec3 L = normalize(uSunDir);
				float alongSun = dot(rel, L);
				float shadow = 1.0;
				if (alongSun < 0.0 && uDaylightMode < 0.95) {
					float perpDist = length(rel - L * alongSun);
					shadow = mix(smoothstep(uPlanetRadius * 0.965, uPlanetRadius * 1.035, perpDist), 1.0, uDaylightMode);
				}

				// Ice-crystal forward + backward phase function
				vec3 V = normalize(cameraPosition - vWorldPos);
				float fwdDot = clamp(dot(-V, L), 0.0, 1.0);
				float backDot = clamp(dot(V, L), 0.0, 1.0);
				float forwardPhase = pow(fwdDot, 4.0) * 0.48;
				float backPhase = sqr(backDot) * mix(0.25, 0.14, uDaylightMode);
				float litFactor = (0.76 + forwardPhase + backPhase) * mix(0.035, 1.0, shadow);

				vec3 ringClamped = clamp(ringCol, vec3(0.0), vec3(1.0));
				vec3 linearRingCol = uStyle < 2.5 ? pow(ringClamped, vec3(2.2)) : ringCol;
				vec3 finalCol = linearRingCol * mix(vec3(1.16, 1.12, 1.06), vec3(1.02, 1.00, 0.96), uDaylightMode) * litFactor;
				gl_FragColor = vec4(finalCol, alpha);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. Deep-Space Starfield & Subtle Sector Nebula Backdrop
// ──────────────────────────────────────────────────────────────────────────────

export function createSoftPointMaterial(opts: {
	size?: number;
	maxPixelSize?: number;
	opacity?: number;
}): ShaderMaterial {
	return new ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		vertexColors: true,
		toneMapped: true,
		uniforms: {
			uSize: { value: opts.size ?? 2.1 },
			uMaxPixelSize: { value: opts.maxPixelSize ?? 4.2 },
			uOpacity: { value: opts.opacity ?? 0.92 }
		},
		vertexShader: /* glsl */ `
			uniform float uSize;
			uniform float uMaxPixelSize;
			varying vec3 vColor;
			void main() {
				vColor = color;
				vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
				float computed = uSize * (280.0 / max(1.0, -mvPosition.z));
				gl_PointSize = clamp(computed, 1.0, uMaxPixelSize);
				gl_Position = projectionMatrix * mvPosition;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uOpacity;
			varying vec3 vColor;
			void main() {
				vec2 c = gl_PointCoord - vec2(0.5);
				float r2 = dot(c, c);
				if (r2 > 0.25) discard;
				float core = exp(-r2 * 22.0);
				float halo = smoothstep(0.25, 0.0, r2) * 0.35;
				vec3 col = vColor * (core * 1.45 + halo);
				gl_FragColor = vec4(col, (core + halo) * uOpacity);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}

export function createDeepNebulaMaterial(sector: CosmicSectorId = 'akunalia_sector'): ShaderMaterial {
	return new ShaderMaterial({
		side: BackSide,
		depthWrite: false,
		toneMapped: true,
		uniforms: {
			uIsAkunaliaSector: { value: sector === 'akunalia_sector' ? 1.0 : 0.0 }
		},
		vertexShader: /* glsl */ `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uIsAkunaliaSector;
			varying vec3 vDir;

			${GLSL_COMMON}

			void main() {
				vec3 d = normalize(vDir);
				// Keep 95% of deep space pitch-black SpaceEngine style, with ultra-subtle galactic dust band
				vec3 bg = vec3(0.0022, 0.0032, 0.0068);

				if (uIsAkunaliaSector > 0.5) {
					// Subtle deep-space Origin Sector veil (emerald-teal & faint indigo filaments)
					float plane = exp(-sqr((d.y * 0.85 - d.x * 0.32) / 0.26));
					float wisps = fbm3(d * 3.8 + vec3(2.1, 5.4, 8.3));
					float dustLane = smoothstep(0.42, 0.68, fbm3(d * 7.5 + vec3(4.0)));
					vec3 veilA = vec3(0.008, 0.032, 0.044);
					vec3 veilB = vec3(0.018, 0.012, 0.042);
					bg += mix(veilA, veilB, wisps) * plane * smoothstep(0.32, 0.78, wisps) * (1.0 - dustLane * 0.65);
				} else {
					// Subtle inclined Milky Way galactic band + dark rift dust lane for Solar System
					float galLat = d.y * 0.62 + d.x * 0.54 - d.z * 0.57;
					float band = exp(-sqr(galLat / 0.20));
					float clouds = fbm3(d * 4.4 + vec3(9.1, 2.3, 4.7));
					float darkRift = exp(-sqr(galLat / 0.055)) * smoothstep(0.38, 0.68, fbm3(d * 9.2));
					vec3 milkyCol = vec3(0.022, 0.024, 0.034) * band * smoothstep(0.30, 0.80, clouds) * (1.0 - darkRift * 0.80);
					bg += milkyCol;
				}

				gl_FragColor = vec4(bg, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}
		`
	});
}
