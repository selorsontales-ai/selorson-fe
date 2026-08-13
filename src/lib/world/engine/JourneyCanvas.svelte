<script lang="ts">
	/** Dynamic-import boundary for the journey scene — see `WorldCanvas.svelte`. */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
	import type { QualitySettings } from '../quality';
	import type { JourneyStop, WorldNode } from '../types';
	import JourneyScene from './JourneyScene.svelte';

	interface Props {
		character: WorldNode;
		stops: JourneyStop[];
		quality: QualitySettings;
		position?: number;
		onstop?: (index: number) => void;
	}

	let { character, stops, quality, position = 0, onstop }: Props = $props();
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
	dpr={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality.pixelRatio)}
>
	<JourneyScene {character} {stops} {quality} {position} {onstop} />
</Canvas>
