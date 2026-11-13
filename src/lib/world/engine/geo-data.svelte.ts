/**
 * High-Resolution 16-bit Elevation, Coastline SDF & Multi-Octave Tangent Normal/Specular
 * Loader + Exact CPU/GPU Sampler for AAA 3D Planets (`Akunalia` & `Multi-Era Earth`).
 *
 * Keeping CPU sampling (`sampleSurfaceRadius`, `sampleSdf`, `sampleSlope`) on the
 * exact same 16-bit height grid as the GPU vertex shader ensures markers and
 * journey arcs sit flush on displaced terrain without sinking or hovering.
 */

import {
	ClampToEdgeWrapping,
	DataTexture,
	LinearFilter,
	LinearSRGBColorSpace,
	NearestFilter,
	RGBAFormat,
	RepeatWrapping,
	UnsignedByteType
} from 'three';
import { PLANET_ELEVATION_AMP, PROCEDURAL_WORLD_DATA, SEA_LEVEL_NORM } from '../config';
import { DisposablePromiseCache } from './disposable-cache';

export type GeoPlanetKey = 'akunalia' | 'earth';

export interface PlanetGeoBundle {
	key: GeoPlanetKey;
	width: number;
	height: number;
	/** Nearest-filtered RGBA8 (`R=hi8`, `G=lo8`, `B=sdf`, `A=255`) for manual 16-bit bilinear GLSL sampling. */
	elevSdfTex: DataTexture;
	/** Linear-filtered RGBA8 (`R=nx`, `G=ny`, `B=specularMask`, `A=255`) for crisp sub-texel relief & water glint. */
	normalSpecTex: DataTexture;
	/** Sample normalized 16-bit elevation `[0..1]` (`0.25` = sea level) at `(lat, lng)` in degrees. */
	sampleHeightNorm(lat: number, lng: number): number;
	/** Sample exact displaced surface radius in scene units at `(lat, lng)` for markers & journey arcs. */
	sampleSurfaceRadius(
		lat: number,
		lng: number,
		baseRadius: number,
		displacementEnabled: boolean
	): number;
	/** Sample coastline signed distance `[0..1]` (`0.5` = shoreline, `> 0.5` = inland, `< 0.5` = ocean). */
	sampleSdf(lat: number, lng: number): number;
	/** Sample normalized terrain slope `[0..1]` (`0` = flat plain, `1` = sheer cliff). */
	sampleSlope(lat: number, lng: number): number;
	/** Sample water/ice specular factor `[0..1]` (`~0.95` = mirror water, `~0.34` = ice, `~0.05` = land). */
	sampleSpec(lat: number, lng: number): number;
}

// Kế hoạch VRAM v2 · C1: DataTexture cao độ/SDF + normal/specular của từng hành tinh — purge được khi rời /world
const bundleCache = new DisposablePromiseCache<GeoPlanetKey, PlanetGeoBundle>((bundle) => {
	bundle.elevSdfTex.dispose();
	bundle.normalSpecTex.dispose();
});

async function loadImagePixels(
	url: string
): Promise<{ width: number; height: number; data: Uint8ClampedArray } | null> {
	if (typeof document === 'undefined') {
		return null;
	}

	// Prefer `createImageBitmap` with `premultiplyAlpha: 'none'` & `colorSpaceConversion: 'none'`
	// so 16-bit packed channels & tangent normals are never altered by ICC profiles.
	if (typeof fetch === 'function' && typeof createImageBitmap === 'function') {
		try {
			const res = await fetch(url);
			if (res.ok) {
				const blob = await res.blob();
				const bmp = await createImageBitmap(blob, {
					premultiplyAlpha: 'none',
					colorSpaceConversion: 'none'
				});
				const canvas = document.createElement('canvas');
				canvas.width = bmp.width;
				canvas.height = bmp.height;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				if (ctx) {
					ctx.globalCompositeOperation = 'copy';
					ctx.drawImage(bmp, 0, 0);
					bmp.close();
					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					return {
						width: canvas.width,
						height: canvas.height,
						data: imageData.data
					};
				}
				bmp.close();
			}
		} catch {
			// Fall back to HTMLImageElement below
		}
	}

	if (typeof Image === 'undefined') {
		return null;
	}

	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth || img.width;
				canvas.height = img.naturalHeight || img.height;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.globalCompositeOperation = 'copy';
				ctx.drawImage(img, 0, 0);
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				resolve({
					width: canvas.width,
					height: canvas.height,
					data: imageData.data
				});
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

function buildBundle(
	key: GeoPlanetKey,
	elevImg: { width: number; height: number; data: Uint8ClampedArray },
	normImg: { width: number; height: number; data: Uint8ClampedArray }
): PlanetGeoBundle {
	const width = elevImg.width;
	const height = elevImg.height;
	const total = width * height;

	const heightField = new Float32Array(total);
	const sdfField = new Float32Array(total);
	const elevBytes = new Uint8Array(elevImg.data.buffer.slice(0));
	const normBytes = new Uint8Array(normImg.data.buffer.slice(0));

	for (let i = 0; i < total; i++) {
		const idx = i * 4;
		const hi = elevBytes[idx];
		const lo = elevBytes[idx + 1];
		heightField[i] = (hi * 256 + lo) / 65535.0;
		sdfField[i] = elevBytes[idx + 2] / 255.0;
	}

	const nWidth = normImg.width;
	const nHeight = normImg.height;
	const nTotal = nWidth * nHeight;
	const specField = new Float32Array(nTotal);
	for (let i = 0; i < nTotal; i++) {
		specField[i] = normBytes[i * 4 + 2] / 255.0;
	}

	// `flipY = true` matches Three.js `SphereGeometry` UVs (`uv.y = 1` at North Pole / image row 0).
	const elevSdfTex = new DataTexture(elevBytes, width, height, RGBAFormat, UnsignedByteType);
	elevSdfTex.colorSpace = LinearSRGBColorSpace;
	elevSdfTex.wrapS = RepeatWrapping;
	elevSdfTex.wrapT = ClampToEdgeWrapping;
	elevSdfTex.magFilter = NearestFilter;
	elevSdfTex.minFilter = NearestFilter;
	elevSdfTex.flipY = true;
	elevSdfTex.generateMipmaps = false;
	elevSdfTex.needsUpdate = true;

	const normalSpecTex = new DataTexture(normBytes, nWidth, nHeight, RGBAFormat, UnsignedByteType);
	normalSpecTex.colorSpace = LinearSRGBColorSpace;
	normalSpecTex.wrapS = RepeatWrapping;
	normalSpecTex.wrapT = ClampToEdgeWrapping;
	normalSpecTex.magFilter = LinearFilter;
	normalSpecTex.minFilter = LinearFilter;
	normalSpecTex.flipY = true;
	normalSpecTex.generateMipmaps = false;
	normalSpecTex.needsUpdate = true;

	const sampleGridBilinear = (
		field: Float32Array,
		gw: number,
		gh: number,
		lat: number,
		lng: number
	): number => {
		const u = ((lng + 180) / 360) % 1;
		const uNorm = u < 0 ? u + 1 : u;
		const vNorm = Math.max(0, Math.min(1, (90 - lat) / 180));

		const fx = uNorm * gw - 0.5;
		const fy = vNorm * gh - 0.5;
		const x0 = Math.floor(fx);
		const y0 = Math.floor(fy);
		const tx = fx - x0;
		const ty = fy - y0;

		const ix0 = ((x0 % gw) + gw) % gw;
		const ix1 = (((x0 + 1) % gw) + gw) % gw;
		const iy0 = Math.max(0, Math.min(gh - 1, y0));
		const iy1 = Math.max(0, Math.min(gh - 1, y0 + 1));

		const v00 = field[iy0 * gw + ix0];
		const v10 = field[iy0 * gw + ix1];
		const v01 = field[iy1 * gw + ix0];
		const v11 = field[iy1 * gw + ix1];

		const top = v00 + (v10 - v00) * tx;
		const bot = v01 + (v11 - v01) * tx;
		return top + (bot - top) * ty;
	};

	const sampleHeightNorm = (lat: number, lng: number) =>
		sampleGridBilinear(heightField, width, height, lat, lng);
	const sampleSdf = (lat: number, lng: number) =>
		sampleGridBilinear(sdfField, width, height, lat, lng);
	const sampleSpec = (lat: number, lng: number) =>
		sampleGridBilinear(specField, nWidth, nHeight, lat, lng);

	const sampleSurfaceRadius = (
		lat: number,
		lng: number,
		baseRadius: number,
		displacementEnabled: boolean
	): number => {
		if (!displacementEnabled) return baseRadius;
		const h = sampleHeightNorm(lat, lng);
		if (h <= SEA_LEVEL_NORM) return baseRadius;
		const scale = baseRadius / 5.0;
		const landRise = ((h - SEA_LEVEL_NORM) / (1.0 - SEA_LEVEL_NORM)) * PLANET_ELEVATION_AMP * scale;
		return baseRadius + landRise;
	};

	const sampleSlope = (lat: number, lng: number): number => {
		const dDeg = 0.25;
		const hE = sampleHeightNorm(lat, lng + dDeg);
		const hW = sampleHeightNorm(lat, lng - dDeg);
		const hN = sampleHeightNorm(Math.min(89.5, lat + dDeg), lng);
		const hS = sampleHeightNorm(Math.max(-89.5, lat - dDeg), lng);
		const gx = (hE - hW) * 24.0;
		const gy = (hN - hS) * 24.0;
		return Math.min(1.0, Math.hypot(gx, gy));
	};

	return {
		key,
		width,
		height,
		elevSdfTex,
		normalSpecTex,
		sampleHeightNorm,
		sampleSurfaceRadius,
		sampleSdf,
		sampleSlope,
		sampleSpec
	};
}

export function loadPlanetGeo(key: GeoPlanetKey): Promise<PlanetGeoBundle | null> {
	return bundleCache.getOrCreate(key, () => {
		const urls = PROCEDURAL_WORLD_DATA[key];
		return Promise.all([
			loadImagePixels(urls.elevationSdf),
			loadImagePixels(urls.normalSpec)
		]).then(([elevImg, normImg]) => {
			if (!elevImg || !normImg) return null;
			return buildBundle(key, elevImg, normImg);
		});
	});
}

/** Giải phóng DataTexture địa hình của mọi hành tinh. Gọi TRƯỚC `renderer.dispose()` (khi rời /world). */
export function purgePlanetGeoCache(): void {
	bundleCache.purge();
}

/** Reactive Svelte 5 hook for loading a planet's 16-bit Elevation, SDF & Normal/Specular bundle. */
export function usePlanetGeo(key: GeoPlanetKey) {
	const state = $state<{ bundle: PlanetGeoBundle | null; ready: boolean }>({
		bundle: null,
		ready: false
	});

	loadPlanetGeo(key).then((loaded) => {
		state.bundle = loaded;
		state.ready = true;
	});

	return state;
}
