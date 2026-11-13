/**
 * Texture loading with a graceful failure path.
 *
 * A missing texture must never take the scene down — art is swapped often and a
 * stale path in the database is an expected condition, not a bug. Failed loads
 * resolve to `null` and the materials fall back to flat colour.
 */

import { SRGBColorSpace, Texture, TextureLoader, type ColorSpace } from 'three';
import { DisposablePromiseCache } from './disposable-cache';

const loader = new TextureLoader();
// Kế hoạch VRAM v2 · C1: cache module sống qua nhiều lần vào/ra /world → phải purge được (xem WorldCanvas)
const cache = new DisposablePromiseCache<string, Texture>((texture) => texture.dispose());

function load(url: string, colorSpace?: ColorSpace): Promise<Texture | null> {
	return cache.getOrCreate(url, () => new Promise<Texture | null>((resolve) => {
		loader.load(
			url,
			(texture) => {
				if (colorSpace) texture.colorSpace = colorSpace;
				resolve(texture);
			},
			undefined,
			() => resolve(null)
		);
	}));
}

/**
 * Giải phóng VRAM mọi texture của thế giới. Gọi TRƯỚC `renderer.dispose()` (khi rời /world);
 * lần vào sau nạp lại từ HTTP cache.
 */
export function purgeWorldTextureCache(): void {
	cache.purge();
}

/**
 * Reactive holder for a set of named textures.
 *
 * Returns immediately with all entries `null`; each fills in as it arrives, so
 * the globe appears as a plain sphere and gains its map a moment later rather
 * than blocking on a 3 MB download.
 */
export function useTextures<K extends string>(
	sources: Record<K, string | null>,
	// `NoInfer` keeps this argument from narrowing K down to whatever keys
	// happen to be listed here — K must come from `sources` alone.
	colorKeys: NoInfer<K>[] = []
) {
	const state = $state({ maps: {} as Record<K, Texture | null>, ready: false });

	for (const key of Object.keys(sources) as K[]) {
		state.maps[key] = null;
	}

	const pending = (Object.entries(sources) as Array<[K, string | null]>)
		.filter(([, url]) => !!url)
		.map(([key, url]) =>
			load(url as string, colorKeys.includes(key) ? SRGBColorSpace : undefined).then(
				(texture) => {
					state.maps[key] = texture;
				}
			)
		);

	Promise.all(pending).then(() => {
		state.ready = true;
	});

	return state;
}

/** Raise anisotropy once the renderer's limit is known. */
export function applyAnisotropy(texture: Texture | null, max: number) {
	if (texture && texture.anisotropy !== max) {
		texture.anisotropy = max;
		texture.needsUpdate = true;
	}
}
