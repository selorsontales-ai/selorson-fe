<script lang="ts">
	/**
	 * The single dynamic-import boundary for the 3D world (`Tầng 0` & `Tầng 1`).
	 *
	 * Three.js and Threlte are only ever reached through this component, which
	 * the world pages load with `await import()`. Readers who never open the map
	 * download none of it — the reading, music and video pages stay untouched.
	 */
	import { Canvas } from '@threlte/core';
	import { onMount } from 'svelte';
	import { ACESFilmicToneMapping, WebGLRenderer, type Object3D, type Scene } from 'three';
	import type { CelestialBodyId, CosmicSectorId, WorldTier, WorldTimeline } from '../cosmos';
	import {
		acquireSafeWebGLContext,
		preferredPowerPreference,
		type QualitySettings
	} from '../quality';
	import type { WorldNode } from '../types';
	import GlobeScene from './GlobeScene.svelte';
	import { purgeWorldTextureCache } from './textures.svelte';
	import { purgePlanetGeoCache } from './geo-data.svelte';
	import { disposeObject3DDeep } from './webgl-dispose';
	import ThrelteContextRelease from './ThrelteContextRelease.svelte';

	interface Props {
		nodes: Array<WorldNode & { lat: number; lng: number }>;
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
		activeSector,
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

	let activeRenderer: WebGLRenderer | null = null;
	// Xóa tham chiếu trong context Threlte sau khi renderer đã dispose (cắt chuỗi giữ của Svelte untracked_writes)
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
			alpha: false
		});
		const renderer = new WebGLRenderer({
			canvas,
			context: acquired.context,
			powerPreference: preferredPowerPreference(),
			antialias: acquired.antialias,
			alpha: false
		});
		renderer.setClearColor(0x01030a, 1);
		renderer.toneMappingExposure = 1.02;
		// Kế hoạch VRAM v2 · C1: Threlte tự gọi renderer.dispose() khi Canvas unmount (TRƯỚC cleanup của component
		// này), mà dispose() không xóa texture đã upload. Dọn cache texture/geo ngay trong dispose() — lúc context
		// còn sống — dù ai gọi trước (Threlte, pagehide hay releaseActiveRenderer).
		// Threlte còn dispose geometry/material của <T> SAU renderer.dispose() trong cùng đợt teardown; nếu dispose thật
		// chạy ngay thì three không còn tìm thấy buffer GL để xóa → VRAM bị giữ theo context (đo thật: +260 MB sau khi
		// rời /world). Hoãn dispose thật sang macrotask kế tiếp, thu canvas về 1×1 để trả cả bộ đệm khung.
		// GlobeScene có texture/vật liệu riêng ngoài cache (không thuộc <T> của Threlte): ghi nhận mọi Scene đã render
		// để dọn sâu trước khi dispose thật — đo thật: không dọn thì mỗi lần vào/ra /world giữ thêm ~70 MB VRAM.
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
					// renderer đã hỏng → vẫn dispose bên dưới
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
	<GlobeScene
		{nodes}
		{earthNodes}
		{quality}
		{tier}
		{activeSector}
		{activePlanet}
		{timeline}
		{unshieldedTimeline2}
		{daylightMode}
		{prismMomentActive}
		{eraFocusLatLng}
		{selected}
		{hovered}
		{onselect}
		{onhover}
		{onselectplanet}
		{onsettier}
	/>
</Canvas>
