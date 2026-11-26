<script lang="ts">
	/** Dynamic-import boundary for the journey scene — mirrors full VRAM teardown from `WorldCanvas.svelte` (`B2-02`). */
	import { Canvas } from '@threlte/core';
	import { onMount } from 'svelte';
	import { ACESFilmicToneMapping, WebGLRenderer, type Object3D, type Scene } from 'three';
	import {
		acquireSafeWebGLContext,
		preferredPowerPreference,
		type QualitySettings
	} from '../quality';
	import type { JourneyStop, WorldNode } from '../types';
	import JourneyScene from './JourneyScene.svelte';
	import { purgeWorldTextureCache } from './textures.svelte';
	import { purgePlanetGeoCache } from './geo-data.svelte';
	import { disposeObject3DDeep } from './webgl-dispose';
	import ThrelteContextRelease from './ThrelteContextRelease.svelte';

	interface Props {
		character: WorldNode;
		stops: JourneyStop[];
		quality: QualitySettings;
		position?: number;
		onstop?: (index: number) => void;
	}

	let { character, stops, quality, position = 0, onstop }: Props = $props();

	let activeRenderer: WebGLRenderer | null = null;
	let releaseThrelteContexts: (() => void) | null = null;

	function releaseActiveRenderer() {
		const r = activeRenderer;
		activeRenderer = null;
		if (!r) return;
		try {
			r.dispose();
		} catch {
			// Ignore if already disposed by Threlte
		}
	}

	onMount(() => {
		window.addEventListener('pagehide', releaseActiveRenderer);
		return () => {
			window.removeEventListener('pagehide', releaseActiveRenderer);
			queueMicrotask(releaseActiveRenderer);
		};
	});
</script>

<Canvas
	createRenderer={(canvas) => {
		releaseActiveRenderer();
		const powerPreference = preferredPowerPreference();
		const acquired = acquireSafeWebGLContext(canvas, {
			powerPreference,
			antialias: quality.antialias,
			alpha: true
		});
		const renderer = new WebGLRenderer({
			canvas,
			context: acquired.context,
			powerPreference: preferredPowerPreference(),
			antialias: acquired.antialias,
			alpha: true
		});
		const renderedScenes = new Set<Object3D>();
		const renderScene = renderer.render.bind(renderer);
		renderer.render = (scene, camera) => {
			if ((scene as Scene).isScene) renderedScenes.add(scene);
			renderScene(scene, camera);
		};
		const disposeRenderer = renderer.dispose.bind(renderer);
		let disposeScheduled = false;
		renderer.dispose = () => {
			if (disposeScheduled) return;
			disposeScheduled = true;
			purgeWorldTextureCache();
			purgePlanetGeoCache();
			setTimeout(() => {
				try {
					const seen = new Set<unknown>();
					for (const scene of renderedScenes) disposeObject3DDeep(scene, {}, seen);
					renderedScenes.clear();
					renderer.setRenderTarget(null);
					renderer.setSize(1, 1, false);
					renderer.renderLists.dispose();
				} catch {
					// Proceed to disposeRenderer even if context was lost
				}
				disposeRenderer();
				releaseThrelteContexts?.();
				releaseThrelteContexts = null;
				renderedScenes.clear();
			}, 0);
		};
		activeRenderer = renderer;
		return renderer;
	}}
	toneMapping={ACESFilmicToneMapping}
	dpr={[1, quality.pixelRatio]}
>
	<ThrelteContextRelease register={(release) => (releaseThrelteContexts = release)} />
	<JourneyScene {character} {stops} {quality} {position} {onstop} />
</Canvas>
