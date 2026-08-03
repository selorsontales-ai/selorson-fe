<script lang="ts">
	/**
	 * The Akunalia globe itself: terrain shell, drifting cloud layer, atmosphere
	 * rim and starfield. Every layer above the terrain is optional and switched
	 * off by the quality tier rather than by device sniffing.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		AdditiveBlending,
		BackSide,
		BufferAttribute,
		BufferGeometry,
		Group,
		Mesh,
		ShaderMaterial
	} from 'three';
	import { GLOBE_TEXTURES, GLOBE_RADIUS } from '../config';
	import type { QualitySettings } from '../quality';
	import { textureTier } from '../quality';
	import { applyAnisotropy, useTextures } from './textures.svelte';

	interface Props {
		quality: QualitySettings;
		/** Idle spin, paused while the reader is inspecting something. */
		autoRotate?: boolean;
		/**
		 * The rotating frame. Bound out so the camera can convert a marker's
		 * local coordinate into world space before flying to it.
		 */
		group?: Group;
		/** Exposed so markers can be parented into the same rotating frame. */
		children?: import('svelte').Snippet;
	}

	let { quality, autoRotate = true, group = $bindable(), children }: Props = $props();

	/**
	 * Texture set is chosen once. The quality tier is resolved before the canvas
	 * mounts and cannot change while a scene is alive — switching tier remounts
	 * the whole canvas — so this deliberately captures the value at setup.
	 */
	function initialSkin() {
		return GLOBE_TEXTURES[textureTier(quality.tier)];
	}
	const skin = initialSkin();
	const textures = useTextures<'color' | 'bump' | 'clouds'>(
		{ color: skin.color, bump: skin.bump, clouds: skin.clouds },
		['color']
	);

	const { renderer } = useThrelte();
	let maxAnisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;

	$effect(() => {
		applyAnisotropy(textures.maps.color, maxAnisotropy);
		applyAnisotropy(textures.maps.bump, maxAnisotropy);
	});

	let clouds = $state<Mesh | undefined>();

	useTask((delta) => {
		if (quality.reducedMotion) return;
		if (group && autoRotate) group.rotation.y += delta * 0.03;
		// Clouds drift slightly faster than the ground turns.
		if (clouds) clouds.rotation.y += delta * 0.012;
	});

	/** Fresnel rim — brightest where the sphere turns away from the camera. */
	const atmosphere = new ShaderMaterial({
		vertexShader: `
			varying vec3 vNormal;
			void main() {
				vNormal = normalize(normalMatrix * normal);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			varying vec3 vNormal;
			void main() {
				float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
				gl_FragColor = vec4(0.0, 0.78, 1.0, 0.7) * intensity;
			}
		`,
		blending: AdditiveBlending,
		side: BackSide,
		transparent: true,
		depthWrite: false
	});

	/** Static starfield; built once because it never changes. */
	const stars = (() => {
		if (quality.starCount === 0) return null;
		const positions = new Float32Array(quality.starCount * 3);
		const colors = new Float32Array(quality.starCount * 3);
		for (let i = 0; i < quality.starCount; i++) {
			positions[i * 3] = (Math.random() - 0.5) * 220;
			positions[i * 3 + 1] = (Math.random() - 0.5) * 220;
			positions[i * 3 + 2] = (Math.random() - 0.5) * 220;
			colors[i * 3] = 0.55 + Math.random() * 0.45;
			colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
			colors[i * 3 + 2] = 1;
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(positions, 3));
		geometry.setAttribute('color', new BufferAttribute(colors, 3));
		return geometry;
	})();
</script>

{#if stars}
	<T.Points>
		<T is={stars} attach="geometry" />
		<T.PointsMaterial size={0.45} vertexColors transparent opacity={0.7} />
	</T.Points>
{/if}

<T.Group bind:ref={group}>
	<T.Mesh>
		<T.SphereGeometry args={[GLOBE_RADIUS, quality.sphereSegments, quality.sphereSegments]} />
		<T.MeshStandardMaterial
			map={textures.maps.color}
			color={textures.maps.color ? '#ffffff' : '#1d3b4d'}
			bumpMap={textures.maps.bump}
			bumpScale={textures.maps.bump ? 0.18 : 0}
			displacementMap={quality.displacement ? textures.maps.bump : null}
			displacementScale={quality.displacement && textures.maps.bump ? 0.05 : 0}
			roughness={0.62}
			metalness={0.05}
		/>
	</T.Mesh>

	{#if quality.clouds && textures.maps.clouds}
		<T.Mesh bind:ref={clouds}>
			<T.SphereGeometry args={[GLOBE_RADIUS * 1.03, 48, 48]} />
			<T.MeshBasicMaterial
				map={textures.maps.clouds}
				transparent
				opacity={0.24}
				blending={AdditiveBlending}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}

	<!-- Markers ride inside the rotating frame so they stay on their coordinates. -->
	{@render children?.()}
</T.Group>

{#if quality.atmosphere}
	<T.Mesh>
		<T.SphereGeometry args={[GLOBE_RADIUS * 1.09, 48, 48]} />
		<T is={atmosphere} attach="material" />
	</T.Mesh>
{/if}
