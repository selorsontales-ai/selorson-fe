<script lang="ts">
	/**
	 * The single dynamic-import boundary for the 3D world.
	 *
	 * Three.js and Threlte are only ever reached through this component, which
	 * the world pages load with `await import()`. Readers who never open the map
	 * download none of it — the reading, music and video pages stay untouched.
	 */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping } from 'three';
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
	The globe spins and the clouds drift, so there is no idle state to save
	frames on — `renderMode="always"` is honest here. The battery lever that
	does work is the pixel-ratio cap from the quality tier.
-->
<Canvas
	toneMapping={ACESFilmicToneMapping}
	dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality.pixelRatio)}
>
	<GlobeScene {nodes} {quality} {selected} {hovered} {onselect} {onhover} />
</Canvas>
