<script lang="ts">
	/** Dynamic-import boundary for the journey scene — see `WorldCanvas.svelte`. */
	import { Canvas } from '@threlte/core';
	import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
	import {
		acquireSafeWebGLContext,
		preferredPowerPreference,
		type QualitySettings
	} from '../quality';
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
	createRenderer={(canvas) => {
		const powerPreference = preferredPowerPreference();
		const acquired = acquireSafeWebGLContext(canvas, {
			powerPreference,
			antialias: quality.antialias,
			alpha: true
		});
		return new WebGLRenderer({
			canvas,
			context: acquired.context,
			powerPreference: preferredPowerPreference(),
			antialias: acquired.antialias,
			alpha: true
		});
	}}
	toneMapping={ACESFilmicToneMapping}
	dpr={[1, quality.pixelRatio]}
>
	<JourneyScene {character} {stops} {quality} {position} {onstop} />
</Canvas>
