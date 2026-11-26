<script lang="ts">
	/**
	 * Akunarch P0 — Trình xem SA BÀN CƠ KHÍ (chỉ app desktop): nạp .glb bản cơ khí (hỗ trợ KTX2, Draco & Meshopt local),
	 * phát clip `assemble` 1 lần rồi lặp `idle`. Renderer riêng của component; khi đổi `url` hoặc rời trang dọn sâu VRAM.
	 */
	import { currentLocale } from '$lib/i18n-labels';
	import { pickClockworkClips } from '../engine/clockwork-pack';
	import { disposeObject3DDeep } from '../engine/webgl-dispose';
	import { releaseOrbitControlsDocumentListeners } from '../engine/orbit-controls-release';

	interface Props {
		url: string;
		title?: string;
	}

	let { url, title = '' }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMsg = $state('');
	let playing = $state(true);
	let replay: (() => void) | null = null;
	let isEn = $derived(currentLocale() === 'en');

	$effect(() => {
		const targetUrl = url;
		const mountEl = host;
		if (!targetUrl || !mountEl) return;

		let disposed = false;
		let raf = 0;
		let cleanup: () => void = () => {};

		status = 'loading';
		errorMsg = '';
		playing = true;
		replay = null;

		(async () => {
			const THREE = await import('three');
			const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
			const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
			const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');
			const { MeshoptDecoder } = await import(
				'three/examples/jsm/libs/meshopt_decoder.module.js'
			);
			const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
			const { RoomEnvironment } = await import(
				'three/examples/jsm/environments/RoomEnvironment.js'
			);
			if (disposed || !mountEl.isConnected) return;

			const canvas = document.createElement('canvas');
			mountEl.appendChild(canvas);
			const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.setClearColor(0x090d16, 1);

			const scene = new THREE.Scene();
			const pmrem = new THREE.PMREMGenerator(renderer);
			const room = new RoomEnvironment();
			const envRT = pmrem.fromScene(room, 0.04);
			room.dispose();
			scene.environment = envRT.texture;
			const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
			key.position.set(3, 5, 4);
			const rim = new THREE.DirectionalLight(0x8fd3ff, 1.0);
			rim.position.set(-4, 3, -3);
			scene.add(key, rim, new THREE.HemisphereLight(0xdce8ff, 0x181d2a, 0.5));

			const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 400);
			const controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;

			const draco = new DRACOLoader();
			draco.setDecoderPath('/decoders/draco/');
			const ktx2 = new KTX2Loader();
			ktx2.setTranscoderPath('/decoders/basis/');
			ktx2.detectSupport(renderer);

			const loader = new GLTFLoader();
			loader.setDRACOLoader(draco);
			loader.setKTX2Loader(ktx2);
			loader.setMeshoptDecoder(MeshoptDecoder);
			let mixer: InstanceType<typeof THREE.AnimationMixer> | null = null;

			const resize = () => {
				if (disposed || !mountEl.isConnected) return;
				const w = Math.max(mountEl.clientWidth, 320);
				const h = Math.max(mountEl.clientHeight, 240);
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
				renderer.setSize(w, h, false);
			};
			const ro = new ResizeObserver(resize);
			ro.observe(mountEl);
			resize();

			cleanup = () => {
				if (raf) {
					cancelAnimationFrame(raf);
					raf = 0;
				}
				ro.disconnect();
				if (mixer) {
					mixer.stopAllAction();
					mixer.uncacheRoot(mixer.getRoot());
					mixer = null;
				}
				controls.dispose();
				releaseOrbitControlsDocumentListeners(controls);
				disposeObject3DDeep(scene);
				envRT.dispose();
				pmrem.dispose();
				draco.dispose();
				ktx2.dispose();
				renderer.setRenderTarget(null);
				renderer.setSize(1, 1, false);
				renderer.renderLists.dispose();
				renderer.dispose();
				canvas.remove();
				replay = null;
			};

			try {
				const gltf = await loader.loadAsync(targetUrl);
				if (disposed) {
					disposeObject3DDeep(gltf.scene);
					return;
				}
				scene.add(gltf.scene);
				const box = new THREE.Box3().setFromObject(gltf.scene);
				const size = box.getSize(new THREE.Vector3());
				const center = box.getCenter(new THREE.Vector3());
				const span = Math.max(size.x, size.y, size.z, 1e-3);
				controls.target.copy(center);
				camera.position
					.copy(center)
					.add(new THREE.Vector3(0.56, 0.42, 0.76).normalize().multiplyScalar(span * 1.9));
				camera.near = span / 500;
				camera.far = span * 60;
				camera.updateProjectionMatrix();

				const clips = pickClockworkClips(gltf.animations.map((a) => a.name));
				if (clips.intro || clips.loop) {
					const m = new THREE.AnimationMixer(gltf.scene);
					mixer = m;
					const find = (n: string | null) =>
						n ? THREE.AnimationClip.findByName(gltf.animations, n) : null;
					const introClip = find(clips.intro);
					const idleClip = find(clips.loop);
					const introAct = introClip ? m.clipAction(introClip) : null;
					const idleAct = idleClip ? m.clipAction(idleClip) : null;
					if (introAct) {
						introAct.setLoop(THREE.LoopOnce, 1);
						introAct.clampWhenFinished = true;
					}
					m.addEventListener('finished', (e) => {
						if (e.action === introAct && idleAct) {
							introAct.stop();
							idleAct.reset().play();
						}
					});
					replay = () => {
						m.stopAllAction();
						(introAct ?? idleAct)?.reset().play();
						playing = true;
					};
					replay();
				}
				status = 'ready';
			} catch (e) {
				if (disposed) return;
				status = 'error';
				errorMsg = String((e as Error)?.message ?? e);
				return;
			}

			if (disposed || status !== 'ready') return;

			const clock = new THREE.Clock();
			const tick = () => {
				if (disposed) return;
				raf = requestAnimationFrame(tick);
				const dt = Math.min(clock.getDelta(), 0.1);
				if (mixer && playing) mixer.update(dt);
				controls.update();
				renderer.render(scene, camera);
			};
			tick();
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	});
</script>

<div class="clockwork-viewer" data-testid="clockwork-pack-viewer">
	<div class="canvas-host" bind:this={host}></div>
	{#if status === 'loading'}
		<div class="overlay">{isEn ? 'Assembling the clockwork…' : 'Đang lắp bộ máy sa bàn…'}</div>
	{:else if status === 'error'}
		<div class="overlay error">{isEn ? 'Cannot load the clockwork model' : 'Không nạp được mô hình sa bàn'}: {errorMsg}</div>
	{/if}
	{#if status === 'ready'}
		<div class="controls">
			<span class="label">⚙ {title}</span>
			<button type="button" class="chip" onclick={() => (playing = !playing)}>
				{playing ? (isEn ? 'Pause' : 'Tạm dừng') : isEn ? 'Play' : 'Chạy tiếp'}
			</button>
			<button type="button" class="chip" onclick={() => replay?.()}>
				↻ {isEn ? 'Reassemble' : 'Lắp ráp lại'}
			</button>
		</div>
	{/if}
</div>

<style>
	.clockwork-viewer {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 420px;
		border-radius: 14px;
		overflow: hidden;
		background: #090d16;
	}
	.canvas-host,
	.canvas-host :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #d8c9a6;
		font-size: 0.95rem;
	}
	.overlay.error {
		color: #f19a8e;
		padding: 1rem;
		text-align: center;
	}
	.controls {
		position: absolute;
		left: 12px;
		bottom: 12px;
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.label {
		color: #e7d29e;
		font-size: 0.85rem;
		margin-right: 4px;
	}
	.chip {
		background: rgba(20, 26, 40, 0.85);
		color: #e7d29e;
		border: 1px solid rgba(231, 210, 158, 0.35);
		border-radius: 999px;
		padding: 4px 12px;
		font-size: 0.8rem;
		cursor: pointer;
	}
</style>
