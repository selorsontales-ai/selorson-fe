<script lang="ts">
	/** Dynamic-import boundary for the region scene — see `WorldCanvas.svelte`. */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGLRenderer } from 'three';
	import type { QualitySettings } from '../quality';
	import type { WorldNode } from '../types';
	import RegionScene from './RegionScene.svelte';

	interface Props {
		region: WorldNode;
		places: WorldNode[];
		quality: QualitySettings;
		selected?: WorldNode | null;
		hovered?: WorldNode | null;
		onselect?: (node: WorldNode | null) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let {
		region,
		places,
		quality,
		selected = null,
		hovered = null,
		onselect,
		onhover
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
	<RegionScene {region} {places} {quality} {selected} {hovered} {onselect} {onhover} />
</Canvas>
