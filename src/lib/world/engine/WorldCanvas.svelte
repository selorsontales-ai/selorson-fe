<script lang="ts">
	/**
	 * The single dynamic-import boundary for the 3D world.
	 *
	 * Three.js and Threlte are only ever reached through this component, which
	 * the world pages load with `await import()`. Readers who never open the map
	 * download none of it — the reading, music and video pages stay untouched.
	 */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
	import type { QualitySettings } from '../quality';
	import type { WorldNode } from '../types';
	import GlobeScene from './GlobeScene.svelte';

	interface Props {
		nodes: Array<WorldNode & { lat: number; lng: number }>;
		quality: QualitySettings;
		selected?: WorldNode | null;
		hovered?: WorldNode | null;
		onselect?: (node: WorldNode | null) => void;
		onhover?: (node: WorldNode | null) => void;
	}

	let { nodes, quality, selected = null, hovered = null, onselect, onhover }: Props = $props();
</script>

<!--
	Animation tasks invalidate frames only while the globe or clouds move, so
	reduced-motion and low-detail idle scenes can sleep. The quality tier also
	controls pixel ratio and antialiasing before the renderer is created.
-->
<Canvas
	createRenderer={(canvas) =>
		new WebGLRenderer({
			canvas,
			powerPreference: 'high-performance',
			antialias: quality.antialias,
			alpha: true
		})}
	toneMapping={ACESFilmicToneMapping}
	dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality.pixelRatio)}
>
	<GlobeScene {nodes} {quality} {selected} {hovered} {onselect} {onhover} />
</Canvas>
