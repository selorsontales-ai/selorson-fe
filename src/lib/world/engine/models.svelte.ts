/**
 * glTF loading for places that have real art.
 *
 * The loader is pulled in with a dynamic import so the ~200 kB of GLTFLoader
 * only reaches readers who open a place that actually has a model — most places
 * are kit-bashed and never touch this file.
 *
 * A failed or missing model is a normal condition, not an error: art is swapped
 * often and a stale path in the database should cost the reader the nicer
 * geometry, not the scene. Callers fall back to the kit-bash builder.
 */

import type { Group } from 'three';

const cache = new Map<string, Promise<Group | null>>();

async function load(url: string): Promise<Group | null> {
	try {
		const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
			import('three/examples/jsm/loaders/GLTFLoader.js'),
			import('three/examples/jsm/loaders/DRACOLoader.js')
		]);
		const loader = new GLTFLoader();
		// Draco-compressed meshes are the norm for web glTF; the decoder itself
		// is only fetched by the loader if a model actually uses it.
		const draco = new DRACOLoader();
		draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
		loader.setDRACOLoader(draco);

		const gltf = await loader.loadAsync(url);
		return gltf.scene;
	} catch {
		return null;
	}
}

function loadCached(url: string): Promise<Group | null> {
	const cached = cache.get(url);
	if (cached) return cached;
	const promise = load(url);
	cache.set(url, promise);
	return promise;
}

/**
 * Reactive holder for one model.
 *
 * Starts `null` so the caller can show its kit-bash stand-in immediately and
 * swap in the model when it lands — the place is never empty while loading.
 * `failed` distinguishes "still coming" from "not coming", so the caller knows
 * when to stop waiting.
 */
export function useModel(url: string | null) {
	const state = $state<{ scene: Group | null; failed: boolean; loading: boolean }>({
		scene: null,
		failed: false,
		loading: !!url
	});

	if (url) {
		loadCached(url).then((scene) => {
			// Each scene gets its own copy: two places may share one model file
			// but must not share one object in the graph.
			state.scene = scene ? (scene.clone(true) as Group) : null;
			state.failed = !scene;
			state.loading = false;
		});
	}

	return state;
}
