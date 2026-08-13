<script lang="ts">
	/** Dynamic-import boundary for the location scene — see `WorldCanvas.svelte`. */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGLRenderer } from 'three';
	import type { QualitySettings } from '../quality';
	import type { ScenePart, WorldNode } from '../types';
	import LocationScene from './LocationScene.svelte';

	interface Props {
		node: WorldNode;
		quality: QualitySettings;
		explode?: number;
		detached?: string[];
		selectedPart?: string | null;
		xray?: boolean;
		onparts?: (parts: ScenePart[]) => void;
		onselectpart?: (id: string | null) => void;
	}

	let {
		node,
		quality,
		explode = 0,
		detached = [],
		selectedPart = null,
		xray = false,
		onparts,
		onselectpart
	}: Props = $props();
</script>

<Canvas
	createRenderer={(canvas) =>
		new WebGLRenderer({
			canvas,
			powerPreference: 'high-performance',
			antialias: quality.antialias,
			alpha: true
		})}
	toneMapping={ACESFilmicToneMapping}
	shadows={quality.shadows ? PCFSoftShadowMap : false}
	dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality.pixelRatio)}
>
	<LocationScene
		{node}
		{quality}
		{explode}
		{detached}
		{selectedPart}
		{xray}
		{onparts}
		{onselectpart}
	/>
</Canvas>
