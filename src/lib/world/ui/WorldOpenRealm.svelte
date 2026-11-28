<script lang="ts">
	/**
	 * Thế Giới Mở (`Seamless Living Fantasy Open World` — Hướng A) nằm bên trong `Bản đồ 3D` (`/world`).
	 *
	 * - Chế độ `Sa bàn`: Quả địa cầu 3D -> Vùng -> Địa điểm / Kỳ quan cơ khí tháo lắp.
	 * - Chế độ `Thế giới mở`: Toàn bộ các vùng đất (Tabaoki, Behadona, Nilanda, Zyberon...)
	 *   ghép liền mạch theo lưới ô (`Chunk X, Z` 256m×256m), nạp công trình `.glb` thật,
	 *   đám mây điểm 3DGS `.ply`, đi bộ góc nhìn thứ nhất / thứ ba (`WASD` + `Shift`) hoặc `FreeCam`,
	 *   tự động chuyển pha `Ambient Audio Zones` và kích hoạt `VNScenePlayer` tại các `vn_triggers`.
	 */
	import { onDestroy, onMount } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
	import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
	import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
	import { IS_ADMIN_FLAVOR } from '$lib/app-flavor';
	import { currentLocale } from '$lib/i18n-labels';
	import { isAdmin } from '$lib/stores/auth.svelte';
	import { fetchWorldChunks } from '$lib/world/api';
	import type { WorldChunkNode, WorldChunkVnTrigger } from '$lib/world/types';
	import { isUnlockedState } from '$lib/world/world-utils';
	import VNScenePlayer from './VNScenePlayer.svelte';
	import { disposeObject3DDeep } from '$lib/world/engine/webgl-dispose';

	interface Props {
		initialPlanet?: 'akunalia' | 'earth';
		onspacetoggle: (mode: 'clockwork' | 'open') => void;
	}

	let { initialPlanet = 'akunalia', onspacetoggle }: Props = $props();

	let loading = $state(true);
	let chunks = $state<WorldChunkNode[]>([]);
	let activePlanet = $state<'akunalia' | 'earth'>('akunalia');
	let selectedChunk = $state<WorldChunkNode | null>(null);

	// 3D Exploration Stage states
	let exploring3D = $state(false);
	let camMode = $state<'first' | 'third' | 'freecam'>('first');
	let playerCoords = $state<{ x: number; y: number; z: number; chunkLabel: string }>({
		x: 0,
		y: 4,
		z: 24,
		chunkLabel: '[0, 0]'
	});
	let activeAudioZoneLabel = $state<string | null>(null);
	let nearbyTrigger = $state<{
		trigger: WorldChunkVnTrigger;
		worldX: number;
		worldZ: number;
		chunkImage?: string | null;
	} | null>(null);
	let activeVnModal = $state<{
		url: string;
		title: string | null;
		backdrop: string | null;
	} | null>(null);
	let loadedMonumentCount = $state(0);
	let audioMuted = $state(false);

	let viewportEl = $state<HTMLDivElement | null>(null);

	let isEn = $derived(currentLocale() === 'en');

	$effect(() => {
		activePlanet = initialPlanet;
	});

	let planetChunks = $derived(
		chunks.filter((c) => (c.planet || 'akunalia') === activePlanet)
	);

	let unlockedChunks = $derived(
		planetChunks.filter((c) => isUnlockedState(c.state))
	);

	let unlockedCount = $derived(unlockedChunks.length);

	function formatSizeMb(bytes: number | null | undefined): string | null {
		if (!bytes || bytes <= 0) return null;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	let loadedAsAdmin = false;
	let chunksFetchSeq = 0;

	async function loadChunks() {
		const seq = ++chunksFetchSeq;
		loadedAsAdmin = IS_ADMIN_FLAVOR && isAdmin();
		loading = true;
		try {
			const res = await fetchWorldChunks();
			if (seq !== chunksFetchSeq) return;
			chunks = res.chunks ?? [];
			const first = chunks.find((c) => (c.planet || 'akunalia') === activePlanet) ?? null;
			selectedChunk = first;
		} catch {
			if (seq === chunksFetchSeq) {
				chunks = [];
			}
		} finally {
			if (seq === chunksFetchSeq) {
				loading = false;
			}
		}
	}

	onMount(() => {
		void loadChunks();
	});

	$effect(() => {
		const adminNow = IS_ADMIN_FLAVOR && isAdmin();
		if (adminNow && !loadedAsAdmin) {
			void loadChunks();
		}
	});

	function switchPlanet(next: 'akunalia' | 'earth') {
		if (exploring3D) {
			stopExploration3D();
		}
		activePlanet = next;
		selectedChunk = chunks.find((c) => (c.planet || 'akunalia') === next) ?? null;
	}

	// =========================================================================
	// 3D WebGL2 Seamless Open-World Runtime (WASD + Shift + FreeCam + Audio + VN)
	// =========================================================================
	let renderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	let rafId = 0;
	// Kế hoạch VRAM v2 · C1: mỗi lần vào/ra Thế giới mở là một phiên; loader về muộn (khác phiên) thì dọn ngay
	let sessionToken = 0;
	let runtimeDraco: DRACOLoader | null = null;
	let runtimeKtx2: KTX2Loader | null = null;
	let runtimeGltfLoader: GLTFLoader | null = null;
	let runtimeTick: FrameRequestCallback | null = null;
	let waterUniforms: Array<{ uTime: { value: number } }> = [];
	let wayfarerBeacon: THREE.Points | null = null;

	const CHUNK_ACTIVE_RADIUS = 2;
	interface MountedChunkHandle {
		key: string;
		chunk: WorldChunkNode;
		group: THREE.Group;
		waterUniform: { uTime: { value: number } };
		monumentsLoaded: number;
	}
	let mountedChunks = new Map<string, MountedChunkHandle>();
	let lastStreamedChunkCoord = '';

	const pressedKeys = new Set<string>();
	let yaw = 0;
	let pitch = -0.06;
	let isPointerDragging = false;
	let lastPointerX = 0;
	let lastPointerY = 0;
	const playerPos = new THREE.Vector3(0, 6, 36);

	interface RuntimeAudioZone {
		id: string;
		label: string;
		worldX: number;
		worldZ: number;
		radius: number;
		maxVol: number;
		audio: HTMLAudioElement;
		currentVol: number;
	}
	let runtimeAudioZones: RuntimeAudioZone[] = [];

	interface RuntimeVnTrigger {
		trigger: WorldChunkVnTrigger;
		worldX: number;
		worldY: number;
		worldZ: number;
		radius: number;
		chunkImage?: string | null;
	}
	let runtimeTriggers: RuntimeVnTrigger[] = [];

	function sampleChunkHeight(chunk: WorldChunkNode, localX: number, localZ: number): number {
		const size = chunk.world_size || 256;
		const grid = chunk.heightmap_grid;
		if (!grid || !grid.values?.length || grid.resolution < 2) {
			// Gentle natural basin fallback if chunk metadata has no inline grid
			const wx = chunk.chunk_x * size + localX;
			const wz = chunk.chunk_z * size + localZ;
			return 3.2 + Math.sin(wx * 0.022) * 2.4 + Math.cos(wz * 0.025) * 2.1;
		}
		const res = grid.resolution;
		const u = THREE.MathUtils.clamp((localX + size * 0.5) / size, 0, 1) * (res - 1);
		const v = THREE.MathUtils.clamp((localZ + size * 0.5) / size, 0, 1) * (res - 1);
		const x0 = Math.floor(u);
		const z0 = Math.floor(v);
		const x1 = Math.min(x0 + 1, res - 1);
		const z1 = Math.min(z0 + 1, res - 1);
		const tx = u - x0;
		const tz = v - z0;

		const h00 = grid.values[z0 * res + x0] ?? 0;
		const h10 = grid.values[z0 * res + x1] ?? h00;
		const h01 = grid.values[z1 * res + x0] ?? h00;
		const h11 = grid.values[z1 * res + x1] ?? h00;

		const hx0 = h00 * (1 - tx) + h10 * tx;
		const hx1 = h01 * (1 - tx) + h11 * tx;
		return hx0 * (1 - tz) + hx1 * tz;
	}

	function sampleWorldTerrainY(worldX: number, worldZ: number): number {
		for (const c of unlockedChunks) {
			const size = c.world_size || 256;
			const ox = c.chunk_x * size;
			const oz = c.chunk_z * size;
			if (
				worldX >= ox - size * 0.5 &&
				worldX <= ox + size * 0.5 &&
				worldZ >= oz - size * 0.5 &&
				worldZ <= oz + size * 0.5
			) {
				return sampleChunkHeight(c, worldX - ox, worldZ - oz);
			}
		}
		if (unlockedChunks.length > 0) {
			const c0 = unlockedChunks[0];
			const size = c0.world_size || 256;
			return sampleChunkHeight(c0, worldX - c0.chunk_x * size, worldZ - c0.chunk_z * size);
		}
		return 0;
	}

	function createTriplanarTerrainMesh(chunk: WorldChunkNode): THREE.Mesh {
		const size = chunk.world_size || 256;
		const res = chunk.heightmap_grid?.resolution && chunk.heightmap_grid.resolution >= 2
			? chunk.heightmap_grid.resolution
			: 65;

		const geom = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
		geom.rotateX(-Math.PI / 2);

		const pos = geom.attributes.position as THREE.BufferAttribute;
		const colors = new Float32Array(pos.count * 3);
		const waterLvl = chunk.water_level ?? 1.6;

		for (let i = 0; i < pos.count; i++) {
			const lx = pos.getX(i);
			const lz = pos.getZ(i);
			const h = sampleChunkHeight(chunk, lx, lz);
			pos.setY(i, h);
		}
		geom.computeVertexNormals();

		const norm = geom.attributes.normal as THREE.BufferAttribute;
		const cSand = new THREE.Color('#b69f78');
		const cGrass = new THREE.Color(chunk.biome === 'snow' ? '#dce6f2' : '#43693d');
		const cHighGrass = new THREE.Color('#627c44');
		const cRock = new THREE.Color('#666c75');
		const cSnow = new THREE.Color('#eef4fa');
		const tmp = new THREE.Color();

		for (let i = 0; i < pos.count; i++) {
			const h = pos.getY(i);
			const ny = Math.abs(norm.getY(i));
			const slope = 1 - ny;

			if (h < waterLvl + 0.65) {
				tmp.copy(cSand);
			} else if (h > 26) {
				tmp.copy(cGrass).lerp(cSnow, THREE.MathUtils.clamp((h - 26) / 10, 0, 1));
			} else {
				tmp.copy(cGrass).lerp(cHighGrass, THREE.MathUtils.clamp((h - waterLvl) / 18, 0, 1));
			}
			if (slope > 0.22) {
				tmp.lerp(cRock, THREE.MathUtils.clamp((slope - 0.22) * 2.8, 0, 0.92));
			}
			colors[i * 3] = tmp.r;
			colors[i * 3 + 1] = tmp.g;
			colors[i * 3 + 2] = tmp.b;
		}
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const mat = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.88,
			metalness: 0.04
		});
		const mesh = new THREE.Mesh(geom, mat);
		mesh.receiveShadow = true;
		mesh.position.set(chunk.chunk_x * size, 0, chunk.chunk_z * size);
		return mesh;
	}

	function createRippledWaterMesh(
		chunk: WorldChunkNode
	): { mesh: THREE.Mesh; uniform: { uTime: { value: number } } } {
		const size = chunk.world_size || 256;
		const waterLvl = chunk.water_level ?? 1.6;
		const geom = new THREE.PlaneGeometry(size, size, 48, 48);
		geom.rotateX(-Math.PI / 2);

		const uTime = { value: 0 };
		const uniform = { uTime };
		waterUniforms.push(uniform);

		const mat = new THREE.ShaderMaterial({
			transparent: true,
			uniforms: {
				uTime
			},
			vertexShader: `
				uniform float uTime;
				varying vec2 vUv;
				varying float vWave;
				void main() {
					vUv = uv;
					vec3 p = position;
					float w = sin(p.x * 0.14 + uTime * 1.4) * 0.06 + cos(p.z * 0.17 - uTime * 1.1) * 0.05;
					p.y += w;
					vWave = w;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
				}
			`,
			fragmentShader: `
				varying vec2 vUv;
				varying float vWave;
				void main() {
					vec3 deep = vec3(0.06, 0.23, 0.34);
					vec3 crest = vec3(0.24, 0.56, 0.68);
					float foam = smoothstep(0.03, 0.10, vWave + 0.04);
					vec3 col = mix(deep, crest, foam * 0.65 + 0.2);
					gl_FragColor = vec4(col, 0.76);
				}
			`
		});

		const mesh = new THREE.Mesh(geom, mat);
		mesh.position.set(chunk.chunk_x * size, waterLvl, chunk.chunk_z * size);
		return { mesh, uniform };
	}

	function createInstancedGrassTufts(chunk: WorldChunkNode): THREE.InstancedMesh | null {
		const density = chunk.foliage_density ?? 0.55;
		if (density <= 0.02) return null;
		const size = chunk.world_size || 256;
		const waterLvl = chunk.water_level ?? 1.6;
		const count = Math.min(1800, Math.floor(density * 1600));

		// Crossed grass blade tuft (natural foliage card, zero toy buildings)
		const blade = new THREE.PlaneGeometry(0.45, 0.85);
		blade.translate(0, 0.42, 0);
		const mat = new THREE.MeshStandardMaterial({
			color: '#4e7c42',
			roughness: 0.9,
			side: THREE.DoubleSide
		});
		const inst = new THREE.InstancedMesh(blade, mat, count);
		const dummy = new THREE.Object3D();
		let placed = 0;

		let seed = Math.abs(chunk.chunk_x * 73856093 ^ chunk.chunk_z * 19349663) + 17;
		const nextRand = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};

		for (let i = 0; i < count * 2 && placed < count; i++) {
			const lx = (nextRand() - 0.5) * (size - 4);
			const lz = (nextRand() - 0.5) * (size - 4);
			const h = sampleChunkHeight(chunk, lx, lz);
			if (h < waterLvl + 0.8 || h > 24) continue;

			dummy.position.set(chunk.chunk_x * size + lx, h, chunk.chunk_z * size + lz);
			dummy.rotation.set(0, nextRand() * Math.PI * 2, 0);
			const s = 0.75 + nextRand() * 0.85;
			dummy.scale.set(s, s, s);
			dummy.updateMatrix();
			inst.setMatrixAt(placed, dummy.matrix);
			placed++;
		}
		inst.count = placed;
		inst.instanceMatrix.needsUpdate = true;
		return inst;
	}

	async function loadPlySplatCloud(url: string, originX: number, originZ: number): Promise<THREE.Points | null> {
		try {
			const resp = await fetch(url);
			if (!resp.ok) return null;
			const buf = await resp.arrayBuffer();
			const bytes = new Uint8Array(buf);

			// Find "end_header\n"
			const headerLimit = Math.min(bytes.length, 4096);
			const headerAscii = new TextDecoder('ascii').decode(bytes.subarray(0, headerLimit));
			const endMarker = 'end_header\n';
			const endIdx = headerAscii.indexOf(endMarker);
			if (endIdx < 0) return null;

			const vMatch = headerAscii.match(/element\s+vertex\s+(\d+)/);
			if (!vMatch) return null;
			const vertexCount = Math.min(150000, parseInt(vMatch[1], 10));
			const propLines = headerAscii
				.slice(0, endIdx)
				.split(/\r?\n/)
				.filter((l) => l.startsWith('property float '));
			const floatsPerVertex = propLines.length;
			if (floatsPerVertex < 3) return null;

			const dataStart = endIdx + endMarker.length;
			const strideBytes = floatsPerVertex * 4;
			const view = new DataView(buf, dataStart);
			const safeCount = Math.min(
				vertexCount,
				Math.floor((buf.byteLength - dataStart) / strideBytes)
			);
			if (safeCount <= 0) return null;

			const positions = new Float32Array(safeCount * 3);
			const colors = new Float32Array(safeCount * 3);
			const shC0 = 0.28209479177387814;

			for (let i = 0; i < safeCount; i++) {
				const base = i * strideBytes;
				const x = view.getFloat32(base, true);
				const y = view.getFloat32(base + 4, true);
				const z = view.getFloat32(base + 8, true);
				positions[i * 3] = x;
				positions[i * 3 + 1] = -y + 6.0;
				positions[i * 3 + 2] = z;

				if (floatsPerVertex >= 6) {
					const dc0 = view.getFloat32(base + 12, true);
					const dc1 = view.getFloat32(base + 16, true);
					const dc2 = view.getFloat32(base + 20, true);
					colors[i * 3] = THREE.MathUtils.clamp(0.5 + shC0 * dc0, 0.05, 1);
					colors[i * 3 + 1] = THREE.MathUtils.clamp(0.5 + shC0 * dc1, 0.05, 1);
					colors[i * 3 + 2] = THREE.MathUtils.clamp(0.5 + shC0 * dc2, 0.05, 1);
				} else {
					colors[i * 3] = 0.75;
					colors[i * 3 + 1] = 0.88;
					colors[i * 3 + 2] = 0.95;
				}
			}

			const geom = new THREE.BufferGeometry();
			geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
			const mat = new THREE.PointsMaterial({
				size: 0.32,
				vertexColors: true,
				transparent: true,
				opacity: 0.86
			});
			const pts = new THREE.Points(geom, mat);
			pts.position.set(originX, 0, originZ);
			return pts;
		} catch {
			return null;
		}
	}

	async function startExploration3D(entryChunk: WorldChunkNode) {
		exploring3D = true;
		loadedMonumentCount = 0;
		await new Promise((r) => setTimeout(r, 30));
		if (!viewportEl) return;

		stopRuntimeOnly();
		const token = sessionToken;

		scene = new THREE.Scene();
		scene.background = new THREE.Color('#0c192c');
		scene.fog = new THREE.FogExp2('#12243d', 0.0022);

		const width = viewportEl.clientWidth || 1280;
		const height = viewportEl.clientHeight || 720;
		camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 1600);

		renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		renderer.setSize(width, height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.12;
		renderer.shadowMap.enabled = true;
		viewportEl.innerHTML = '';
		viewportEl.appendChild(renderer.domElement);

		const hemi = new THREE.HemisphereLight('#bae6fd', '#1e293b', 0.95);
		scene.add(hemi);

		const sun = new THREE.DirectionalLight('#fef3c7', 2.2);
		sun.position.set(120, 190, 95);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		scene.add(sun);

		// Luminous particle wisp for 3rd-person focal anchor (zero toy geometry!)
		const wispGeom = new THREE.BufferGeometry();
		wispGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
		const wispMat = new THREE.PointsMaterial({
			color: '#6ee7b7',
			size: 0.42,
			transparent: true,
			opacity: 0.9
		});
		wayfarerBeacon = new THREE.Points(wispGeom, wispMat);
		scene.add(wayfarerBeacon);

		// Spawn player at entryChunk's first spawn_point or south approach
		const entrySize = entryChunk.world_size || 256;
		const entryOx = entryChunk.chunk_x * entrySize;
		const entryOz = entryChunk.chunk_z * entrySize;
		const sp = entryChunk.spawn_points?.[0];
		const spawnX = entryOx + (sp?.x ?? 0);
		const spawnZ = entryOz + (sp?.z ?? 44);
		const spawnGround = sampleWorldTerrainY(spawnX, spawnZ);
		playerPos.set(spawnX, spawnGround + 1.75, spawnZ);
		yaw = 0;
		pitch = -0.04;

		// B2-01: Local Draco + KTX2 + Meshopt decoders (100% offline & Tauri CSP-compliant)
		const draco = new DRACOLoader();
		draco.setDecoderPath('/decoders/draco/');
		const ktx2 = new KTX2Loader();
		ktx2.setTranscoderPath('/decoders/basis/');
		ktx2.detectSupport(renderer);
		const gltfLoader = new GLTFLoader();
		gltfLoader.setDRACOLoader(draco);
		gltfLoader.setKTX2Loader(ktx2);
		gltfLoader.setMeshoptDecoder(MeshoptDecoder);
		runtimeDraco = draco;
		runtimeKtx2 = ktx2;
		runtimeGltfLoader = gltfLoader;

		runtimeAudioZones = [];
		runtimeTriggers = [];
		mountedChunks.clear();
		lastStreamedChunkCoord = '';

		// Register lightweight metadata (Ambient Audio Zones & VN Triggers) across unlocked chunks
		for (const chunk of unlockedChunks) {
			const cSize = chunk.world_size || 256;
			const ox = chunk.chunk_x * cSize;
			const oz = chunk.chunk_z * cSize;

			for (const az of chunk.audio_zones ?? []) {
				if (!az.audio_url) continue;
				const audio = new Audio(az.audio_url);
				audio.preload = 'none';
				audio.loop = true;
				audio.volume = 0;
				runtimeAudioZones.push({
					id: az.id,
					label: az.label || az.id,
					worldX: ox + (az.x ?? 0),
					worldZ: oz + (az.z ?? 0),
					radius: Math.max(8, az.radius || 48),
					maxVol: THREE.MathUtils.clamp(az.volume ?? 0.75, 0.05, 1),
					audio,
					currentVol: 0
				});
			}

			for (const tr of chunk.vn_triggers ?? []) {
				if (!tr.episode_url) continue;
				const tx = ox + (tr.x ?? 0);
				const tz = oz + (tr.z ?? 18);
				const ty = sampleChunkHeight(chunk, tr.x ?? 0, tr.z ?? 18) + (tr.y ?? 1.6);
				runtimeTriggers.push({
					trigger: tr,
					worldX: tx,
					worldY: ty,
					worldZ: tz,
					radius: Math.max(6, tr.radius ?? 16),
					chunkImage: chunk.image_url
				});
			}
		}

		syncNearbyChunksInVram(entryChunk.chunk_x, entryChunk.chunk_z, token);

		let prevTime = performance.now();
		let hudTick = 0;

		const tick = (now: number) => {
			// Mở Visual Novel → dừng HẲN vòng rAF (không chỉ bỏ qua render); $effect bên dưới mở lại khi đóng
			if (activeVnModal) {
				rafId = 0;
				return;
			}
			rafId = requestAnimationFrame(tick);
			const dt = Math.min(0.05, (now - prevTime) / 1000);
			prevTime = now;

			for (const wu of waterUniforms) {
				wu.uTime.value = now * 0.001;
			}

			if (!activeVnModal && camera && renderer && scene) {
				const sprint = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
				const speed = camMode === 'freecam' ? (sprint ? 34 : 16) : sprint ? 13.5 : 6.5;

				const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
				const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
				const move = new THREE.Vector3();

				if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) move.add(forward);
				if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) move.sub(forward);
				if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) move.add(right);
				if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) move.sub(right);

				if (move.lengthSq() > 0) {
					move.normalize().multiplyScalar(speed * dt);
					playerPos.add(move);
				}

				if (camMode === 'freecam') {
					if (pressedKeys.has('Space') || pressedKeys.has('KeyE')) playerPos.y += speed * dt;
					if (pressedKeys.has('KeyQ') || pressedKeys.has('KeyC')) playerPos.y -= speed * dt;
					const minGround = sampleWorldTerrainY(playerPos.x, playerPos.z) + 1.0;
					if (playerPos.y < minGround) playerPos.y = minGround;

					camera.position.copy(playerPos);
					const lookDir = new THREE.Vector3(
						-Math.sin(yaw) * Math.cos(pitch),
						Math.sin(pitch),
						-Math.cos(yaw) * Math.cos(pitch)
					);
					camera.lookAt(playerPos.clone().add(lookDir));
					if (wayfarerBeacon) wayfarerBeacon.visible = false;
				} else {
					const groundH = sampleWorldTerrainY(playerPos.x, playerPos.z);
					const waterFloor = (entryChunk.water_level ?? 1.6) - 0.3;
					const standY = Math.max(groundH, waterFloor);
					playerPos.y = THREE.MathUtils.lerp(playerPos.y, standY + 1.72, 0.25);

					if (camMode === 'first') {
						camera.position.copy(playerPos);
						const lookDir = new THREE.Vector3(
							-Math.sin(yaw) * Math.cos(pitch),
							Math.sin(pitch),
							-Math.cos(yaw) * Math.cos(pitch)
						);
						camera.lookAt(playerPos.clone().add(lookDir));
						if (wayfarerBeacon) wayfarerBeacon.visible = false;
					} else {
						// 3rd-Person over-shoulder follow
						const anchor = new THREE.Vector3(playerPos.x, standY + 1.35, playerPos.z);
						if (wayfarerBeacon) {
							wayfarerBeacon.visible = true;
							wayfarerBeacon.position.copy(anchor);
						}
						const camOffset = new THREE.Vector3(
							Math.sin(yaw) * 6.2,
							2.4 - Math.sin(pitch) * 2.2,
							Math.cos(yaw) * 6.2
						);
						const desiredCam = anchor.clone().add(camOffset);
						const camGround = sampleWorldTerrainY(desiredCam.x, desiredCam.z) + 0.9;
						if (desiredCam.y < camGround) desiredCam.y = camGround;
						camera.position.lerp(desiredCam, 0.22);
						camera.lookAt(anchor);
					}
				}

				hudTick += dt;
				if (hudTick >= 0.1) {
					hudTick = 0;
					const cx = Math.round(playerPos.x / entrySize);
					const cz = Math.round(playerPos.z / entrySize);
					const coordKey = `${cx}:${cz}`;
					if (coordKey !== lastStreamedChunkCoord) {
						lastStreamedChunkCoord = coordKey;
						syncNearbyChunksInVram(cx, cz, token);
					}
					playerCoords = {
						x: Math.round(playerPos.x * 10) / 10,
						y: Math.round(playerPos.y * 10) / 10,
						z: Math.round(playerPos.z * 10) / 10,
						chunkLabel: `[${cx}, ${cz}]`
					};

					// Crossfade Ambient Audio Zones
					let loudestLabel: string | null = null;
					let loudestGain = 0;
					for (const az of runtimeAudioZones) {
						const dist = Math.hypot(playerPos.x - az.worldX, playerPos.z - az.worldZ);
						const targetVol =
							!audioMuted && dist < az.radius
								? THREE.MathUtils.smoothstep(1 - dist / az.radius, 0, 1) * az.maxVol
								: 0;
						az.currentVol = THREE.MathUtils.lerp(az.currentVol, targetVol, 0.22);
						az.audio.volume = THREE.MathUtils.clamp(az.currentVol, 0, 1);
						if (az.currentVol > 0.02) {
							if (az.audio.paused) {
								void az.audio.play().catch(() => {});
							}
							if (az.currentVol > loudestGain) {
								loudestGain = az.currentVol;
								loudestLabel = az.label;
							}
						} else if (!az.audio.paused) {
							az.audio.pause();
						}
					}
					activeAudioZoneLabel = loudestLabel;

					// Proximity check for VN Triggers
					let closest: RuntimeVnTrigger | null = null;
					let bestDist = Infinity;
					for (const rt of runtimeTriggers) {
						const d = Math.hypot(playerPos.x - rt.worldX, playerPos.z - rt.worldZ);
						if (d <= rt.radius && d < bestDist) {
							bestDist = d;
							closest = rt;
						}
					}
					nearbyTrigger = closest
						? {
								trigger: closest.trigger,
								worldX: closest.worldX,
								worldZ: closest.worldZ,
								chunkImage: closest.chunkImage
							}
						: null;
				}

				renderer.render(scene, camera);
			}
		};
		runtimeTick = tick;
		rafId = requestAnimationFrame(tick);
	}

	$effect(() => {
		const modalOpen = Boolean(activeVnModal);
		if (!modalOpen && exploring3D && runtimeTick && !rafId) rafId = requestAnimationFrame(runtimeTick);
	});

	function syncNearbyChunksInVram(centerCx: number, centerCz: number, token: number) {
		if (!scene || !runtimeGltfLoader) return;
		const gltfLoader = runtimeGltfLoader;

		// 1. Evict distant chunks outside proximity radius to keep VRAM bounded (`B2-06`)
		for (const [key, handle] of mountedChunks.entries()) {
			const dist = Math.max(
				Math.abs(handle.chunk.chunk_x - centerCx),
				Math.abs(handle.chunk.chunk_z - centerCz)
			);
			if (dist > CHUNK_ACTIVE_RADIUS) {
				scene.remove(handle.group);
				disposeObject3DDeep(handle.group);
				waterUniforms = waterUniforms.filter((u) => u !== handle.waterUniform);
				loadedMonumentCount = Math.max(0, loadedMonumentCount - handle.monumentsLoaded);
				mountedChunks.delete(key);
			}
		}

		// 2. Mount unlocked chunks within proximity radius
		for (const chunk of unlockedChunks) {
			const dist = Math.max(
				Math.abs(chunk.chunk_x - centerCx),
				Math.abs(chunk.chunk_z - centerCz)
			);
			if (dist > CHUNK_ACTIVE_RADIUS) continue;
			const key = `${chunk.chunk_x}:${chunk.chunk_z}`;
			if (mountedChunks.has(key)) continue;

			const group = new THREE.Group();
			const cSize = chunk.world_size || 256;
			const ox = chunk.chunk_x * cSize;
			const oz = chunk.chunk_z * cSize;

			group.add(createTriplanarTerrainMesh(chunk));
			const { mesh: waterMesh, uniform: waterUniform } = createRippledWaterMesh(chunk);
			group.add(waterMesh);
			const grass = createInstancedGrassTufts(chunk);
			if (grass) group.add(grass);

			const handle: MountedChunkHandle = {
				key,
				chunk,
				group,
				waterUniform,
				monumentsLoaded: 0
			};
			mountedChunks.set(key, handle);
			scene.add(group);

			for (const pl of chunk.placements ?? []) {
				if (!pl.glb_url) continue;
				gltfLoader.load(
					pl.glb_url,
					(gltf) => {
						if (token !== sessionToken || mountedChunks.get(key) !== handle || !scene) {
							disposeObject3DDeep(gltf.scene);
							return;
						}
						const root = gltf.scene;
						const wx = ox + (pl.x ?? 0);
						const wz = oz + (pl.z ?? 0);
						const groundH = sampleChunkHeight(chunk, pl.x ?? 0, pl.z ?? 0);
						root.position.set(wx, groundH + (pl.y ?? 0), wz);
						root.rotation.y = THREE.MathUtils.degToRad(pl.rot_y_deg ?? 0);
						root.scale.setScalar(pl.scale ?? 1);
						root.traverse((obj) => {
							if ((obj as THREE.Mesh).isMesh) {
								obj.castShadow = true;
								obj.receiveShadow = true;
							}
						});
						handle.group.add(root);
						handle.monumentsLoaded += 1;
						loadedMonumentCount += 1;
					},
					undefined,
					() => {}
				);
			}

			if (chunk.splat_url) {
				void loadPlySplatCloud(chunk.splat_url, ox, oz).then((pts) => {
					if (!pts) return;
					if (token !== sessionToken || mountedChunks.get(key) !== handle || !scene) {
						disposeObject3DDeep(pts);
						return;
					}
					handle.group.add(pts);
				});
			}
		}
	}

	function openTriggerVn(tr: WorldChunkVnTrigger, backdrop?: string | null) {
		if (!tr.episode_url) return;
		pressedKeys.clear();
		for (const az of runtimeAudioZones) {
			if (!az.audio.paused) az.audio.pause();
			az.currentVol = 0;
			az.audio.volume = 0;
		}
		activeAudioZoneLabel = null;
		activeVnModal = {
			url: tr.episode_url,
			title: tr.title || tr.label || null,
			backdrop: backdrop ?? selectedChunk?.image_url ?? null
		};
	}

	function stopRuntimeOnly() {
		sessionToken++;
		runtimeTick = null;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		for (const az of runtimeAudioZones) {
			az.audio.pause();
			// Nhả bộ đệm giải mã âm thanh (không tải lại URL trang như src = '')
			az.audio.removeAttribute('src');
			az.audio.load();
		}
		runtimeAudioZones = [];
		runtimeTriggers = [];
		waterUniforms = [];
		mountedChunks.clear();
		lastStreamedChunkCoord = '';
		pressedKeys.clear();
		isPointerDragging = false;
		// Kế hoạch VRAM v2 · C1: dọn geometry/material/texture/shadow map (sun 2048²) TRONG KHI renderer còn sống —
		// renderer.dispose() không xóa tài nguyên đã upload. Không bao giờ forceContextLoss.
		if (scene) disposeObject3DDeep(scene);
		wayfarerBeacon = null;
		runtimeDraco?.dispose();
		runtimeDraco = null;
		runtimeKtx2?.dispose();
		runtimeKtx2 = null;
		runtimeGltfLoader = null;
		if (renderer) {
			renderer.setSize(1, 1, false);
			renderer.renderLists.dispose();
			renderer.dispose();
			renderer.domElement.remove();
			renderer = null;
		}
		scene = null;
		camera = null;
	}

	function stopExploration3D() {
		stopRuntimeOnly();
		exploring3D = false;
		nearbyTrigger = null;
		activeAudioZoneLabel = null;
	}

	function onPointerDown(e: PointerEvent) {
		isPointerDragging = true;
		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
	}

	function onPointerMove(e: PointerEvent) {
		if (!isPointerDragging) return;
		const dx = e.clientX - lastPointerX;
		const dy = e.clientY - lastPointerY;
		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
		yaw -= dx * 0.0042;
		pitch = THREE.MathUtils.clamp(pitch - dy * 0.0036, -1.25, 1.25);
	}

	function onPointerUp() {
		isPointerDragging = false;
	}

	onMount(() => {
		const isEditableTarget = (tgt: EventTarget | null) => {
			if (!(tgt instanceof HTMLElement)) return false;
			const tag = tgt.tagName;
			return (
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				tgt.isContentEditable
			);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (!exploring3D || activeVnModal || isEditableTarget(e.target)) return;
			pressedKeys.add(e.code);
			if (e.code === 'Digit1') camMode = 'first';
			if (e.code === 'Digit2') camMode = 'third';
			if (e.code === 'Digit3') camMode = 'freecam';
			if (e.code === 'KeyF' && nearbyTrigger?.trigger.episode_url) {
				e.preventDefault();
				openTriggerVn(nearbyTrigger.trigger, nearbyTrigger.chunkImage);
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			pressedKeys.delete(e.code);
		};
		const onWindowBlur = () => {
			pressedKeys.clear();
			isPointerDragging = false;
		};
		const onResize = () => {
			if (!exploring3D || !viewportEl || !renderer || !camera) return;
			const w = viewportEl.clientWidth || 1280;
			const h = viewportEl.clientHeight || 720;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onWindowBlur);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onWindowBlur);
			window.removeEventListener('resize', onResize);
		};
	});

	onDestroy(() => {
		stopRuntimeOnly();
	});
</script>

<div class="open-world-stage">
	{#if exploring3D}
		<div
			class="ow-webgl-shell"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			role="application"
			aria-label="3D Open World Viewport"
		>
			<div class="ow-webgl-canvas" bind:this={viewportEl}></div>

			<header class="ow-hud-top">
				<div class="ow-hud-left">
					<button type="button" class="hud-pill back-btn" onclick={stopExploration3D}>
						← {isEn ? 'Chunk Atlas' : 'Bản Đồ Lưới Ô'}
					</button>
					<span class="hud-pill coords">
						Chunk {playerCoords.chunkLabel} · ({playerCoords.x}m, {playerCoords.y}m, {playerCoords.z}m)
					</span>
					{#if loadedMonumentCount > 0}
						<span class="hud-pill accent">
							🏛️ {loadedMonumentCount} {isEn ? 'Monuments' : 'Kỳ quan .glb'}
						</span>
					{/if}
					{#if activeAudioZoneLabel}
						<span class="hud-pill audio-badge">
							🎵 {activeAudioZoneLabel}
						</span>
					{/if}
				</div>

				<div class="ow-hud-right">
					<div class="cam-mode-group">
						<button
							type="button"
							class:active={camMode === 'first'}
							onclick={() => (camMode = 'first')}
						>
							[1] {isEn ? '1st Person' : 'Góc nhìn 1'}
						</button>
						<button
							type="button"
							class:active={camMode === 'third'}
							onclick={() => (camMode = 'third')}
						>
							[2] {isEn ? '3rd Person' : 'Góc nhìn 3'}
						</button>
						<button
							type="button"
							class:active={camMode === 'freecam'}
							onclick={() => (camMode = 'freecam')}
						>
							[3] FreeCam
						</button>
					</div>

					<button
						type="button"
						class="hud-pill"
						onclick={() => (audioMuted = !audioMuted)}
					>
						{audioMuted ? '🔇 Mute' : '🔊 Ambient'}
					</button>
				</div>
			</header>

			{#if nearbyTrigger}
				<div class="ow-trigger-banner">
					<button
						type="button"
						class="trigger-cta"
						onclick={() => openTriggerVn(nearbyTrigger!.trigger, nearbyTrigger!.chunkImage)}
					>
						🎭 [F] {nearbyTrigger.trigger.title ||
							nearbyTrigger.trigger.label ||
							(isEn ? 'Enter Visual Novel Scene' : 'Mở Cảnh Visual Novel')}
					</button>
				</div>
			{/if}

			<footer class="ow-hud-bottom">
				<span>
					{isEn
						? 'WASD: Move · Shift: Sprint · Drag Mouse: Look · [1/2/3]: Camera Mode · [F]: Interact VN Trigger'
						: 'WASD: Đi bộ · Shift: Chạy nhanh · Kéo chuột: Xoay góc nhìn · [1/2/3]: Đổi Camera · [F]: Mở điểm Visual Novel'}
				</span>
			</footer>
		</div>
	{:else}
		<div class="ow-backdrop"></div>

		<div class="ow-container">
			<header class="ow-header">
				<div class="ow-title-block">
					<div class="ow-eyebrow">
						<span class="mode-badge">
							{isEn ? 'Seamless Open World' : 'Thế Giới Mở Liền Mạch'}
						</span>
					</div>
					<h1>
						{isEn
							? 'Living Fantasy Realm of Akunalia & Multi-Era Earth'
							: 'Đại Lục Sống Akunalia & Đa Kỷ Nguyên Trái Đất'}
					</h1>
					<p>
						{isEn
							? 'Explore connected 256m×256m terrain chunks, 3D Gaussian Splatting, full-scale .glb monuments, Ambient Audio Zones, and Visual Novel episodes.'
							: 'Không gian nhập vai liền mạch nối liền từng ô địa hình 256m×256m, cảnh 3DGS, kỳ quan .glb tỷ lệ thật, vùng nhạc nền tự chuyển pha và Visual Novel.'}
					</p>
				</div>

				<div class="ow-actions">
					<div class="space-switch" role="group" aria-label={isEn ? '3D World Mode' : 'Chế độ Bản đồ 3D'}>
						<button
							type="button"
							class="space-btn"
							onclick={() => onspacetoggle('clockwork')}
						>
							{isEn ? 'Clockwork' : 'Sa bàn'}
						</button>
						<button
							type="button"
							class="space-btn active"
							onclick={() => onspacetoggle('open')}
						>
							{isEn ? 'Open World' : 'Thế giới mở'}
						</button>
					</div>
				</div>
			</header>

			<div class="ow-toolbar">
				<div class="planet-tabs">
					<button
						type="button"
						class="planet-tab"
						class:active={activePlanet === 'akunalia'}
						onclick={() => switchPlanet('akunalia')}
					>
						{isEn ? 'Akunalia Continent' : 'Đại Lục Akunalia'}
					</button>
					<button
						type="button"
						class="planet-tab"
						class:active={activePlanet === 'earth'}
						onclick={() => switchPlanet('earth')}
					>
						{isEn ? 'Multi-Era Earth' : 'Trái Đất Đa Kỷ Nguyên'}
					</button>
				</div>

				<div class="chunk-stats">
					<span>
						{isEn ? 'Synced Chunks:' : 'Ô bản đồ đã nạp:'}
						<strong>{planetChunks.length}</strong>
					</span>
					{#if planetChunks.length > 0}
						<span>
							{isEn ? 'Unlocked:' : 'Đã mở khóa:'}
							<strong>{unlockedCount}/{planetChunks.length}</strong>
						</span>
					{/if}
				</div>
			</div>

			{#if loading}
				<div class="ow-empty-card">
					<div class="ow-spinner"></div>
					<p>{isEn ? 'Loading Open-World chunk manifest...' : 'Đang kiểm tra lưới ô Thế Giới Mở...'}</p>
				</div>
			{:else if planetChunks.length === 0}
				<div class="ow-empty-card">
					<h2>
						{isEn
							? 'Open-World Chunk Gateway Ready'
							: 'Không Gian Thế Giới Mở Đã Sẵn Sàng'}
					</h2>
					<p>
						{isEn
							? 'No Open-World terrain chunks have been synced for this realm yet. Build terrain chunks, foliage, rivers, full-scale monuments, and Visual Novel triggers in Akunarch Studio and push them to `/api/v1/admin/sync/world-studio`.'
							: 'Hiện chưa có ô địa hình (Chunk) nào được đẩy sang cho hành tinh này. Khi anh dựng từng vùng nối tiếp (Tabaoki, Behadona, Nilanda, Zyberon...) bên Akunarch Studio và đẩy qua cổng đồng bộ, các ô bản đồ sẽ tự ghép liền mạch tại đây.'}
					</p>
					<div class="pipeline-steps">
						<div class="step-pill">
							<span>1</span>
							{isEn ? 'Author Chunk (X, Z) in Akunarch' : 'Dựng ô địa hình (X, Z) bên Akunarch'}
						</div>
						<span class="step-arrow">→</span>
						<div class="step-pill">
							<span>2</span>
							{isEn ? 'Approve Draft in Admin Panel' : 'Duyệt bản Nháp trong Admin Panel'}
						</div>
						<span class="step-arrow">→</span>
						<div class="step-pill">
							<span>3</span>
							{isEn ? 'Walk Seamlessly Across Chunks' : 'Bước vào Thế Giới Mở liền mạch'}
						</div>
					</div>
				</div>
			{:else}
				<div class="ow-workspace">
					<div class="chunk-grid">
						{#each planetChunks as chunk (chunk.id)}
							{@const unlocked = isUnlockedState(chunk.state)}
							<button
								type="button"
								class="chunk-card"
								class:selected={selectedChunk?.id === chunk.id}
								class:locked={!unlocked}
								onclick={() => (selectedChunk = chunk)}
							>
								<div class="chunk-card-top">
									<span class="coord-tag">Chunk [{chunk.chunk_x}, {chunk.chunk_z}]</span>
									{#if chunk.biome}
										<span class="biome-tag">{chunk.biome}</span>
									{/if}
								</div>
								<h3>{unlocked ? chunk.name : isEn ? 'Uncharted Realm' : 'Vùng Chưa Mở Khóa'}</h3>
								<div class="chunk-card-meta">
									<span>{chunk.world_size}m × {chunk.world_size}m</span>
									{#if unlocked && (chunk.placements?.length ?? 0) > 0}
										<span>🏛️ {chunk.placements?.length} .glb</span>
									{:else if unlocked && formatSizeMb(chunk.chunk_pack_size)}
										<span>{formatSizeMb(chunk.chunk_pack_size)}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>

					{#if selectedChunk}
						{@const selUnlocked = isUnlockedState(selectedChunk.state)}
						<aside class="chunk-inspector">
							<div class="inspector-head">
								<span class="coord-tag">
									Chunk [{selectedChunk.chunk_x}, {selectedChunk.chunk_z}]
								</span>
								{#if selectedChunk.chunk_pack_version}
									<span class="ver-tag">v{selectedChunk.chunk_pack_version}</span>
								{/if}
							</div>
							<h2>
								{selUnlocked
									? selectedChunk.name
									: isEn
										? 'Locked Story Zone'
										: 'Vùng Đất Đang Khóa Theo Chương'}
							</h2>
							{#if selUnlocked}
								{#if selectedChunk.image_url}
									<img
										src={selectedChunk.image_url}
										alt={selectedChunk.name ?? ''}
										class="inspector-preview"
									/>
								{/if}
								{#if selectedChunk.description}
									<p class="inspector-desc">{selectedChunk.description}</p>
								{/if}
								<div class="inspector-stats">
									<div>
										<small>{isEn ? 'Monuments' : 'Công trình .glb'}</small>
										<strong>{selectedChunk.placements?.length ?? 0}</strong>
									</div>
									<div>
										<small>{isEn ? 'Audio Zones' : 'Vùng nhạc nền'}</small>
										<strong>{selectedChunk.audio_zones?.length ?? 0}</strong>
									</div>
									<div>
										<small>{isEn ? 'VN Triggers' : 'Điểm Visual Novel'}</small>
										<strong>{selectedChunk.vn_triggers?.length ?? 0}</strong>
									</div>
								</div>

								<button
									type="button"
									class="ow-btn primary full"
									onclick={() => startExploration3D(selectedChunk!)}
								>
									🧭 {isEn ? 'Walk 3D Open World (WASD)' : 'Bước Vào Thế Giới Mở 3D (WASD)'}
								</button>

								{#if selectedChunk.vn_triggers && selectedChunk.vn_triggers.length > 0}
									<div class="trigger-list">
										{#each selectedChunk.vn_triggers as tr (tr.id)}
											{#if tr.episode_url}
												<button
													type="button"
													class="ow-btn secondary full"
													onclick={() => openTriggerVn(tr, selectedChunk?.image_url)}
												>
													🎭 {tr.title || tr.label || (isEn ? 'Play VN Scene' : 'Mở Cảnh Visual Novel')}
												</button>
											{/if}
										{/each}
									</div>
								{/if}

								{#if selectedChunk.chunk_pack_url}
									<a
										href={selectedChunk.chunk_pack_url}
										target="_blank"
										rel="noopener noreferrer"
										class="pack-download-link"
									>
										📦 {isEn ? 'Download Chunk Archive (.zip)' : 'Tải gói Chunk gốc (.zip)'}
									</a>
								{/if}
							{:else}
								<p class="inspector-desc">
									{isEn
										? `Read further chapters to unlock this Open-World zone${selectedChunk.unlock_chapter ? ` (Chapter ${selectedChunk.unlock_chapter})` : ''}.`
										: `Đọc tiếp truyện để mở khóa vùng đất này${selectedChunk.unlock_chapter ? ` (Chương ${selectedChunk.unlock_chapter})` : ''}.`}
								</p>
							{/if}
						</aside>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if activeVnModal}
		<VNScenePlayer
			episodeUrl={activeVnModal.url}
			fallbackTitle={activeVnModal.title}
			fallbackBackdropUrl={activeVnModal.backdrop}
			onclose={() => (activeVnModal = null)}
		/>
	{/if}
</div>

<style>
	.open-world-stage {
		position: absolute;
		inset: 0;
		z-index: 6;
		background: #040914;
		color: #f1f5f9;
		padding: 1.5rem 1.25rem 2.5rem;
		overflow-y: auto;
	}
	.ow-webgl-shell {
		position: fixed;
		inset: 4rem 0 0 0;
		z-index: 25;
		background: #050c18;
		overflow: hidden;
		user-select: none;
		cursor: grab;
	}
	.ow-webgl-shell:active {
		cursor: grabbing;
	}
	.ow-webgl-canvas {
		position: absolute;
		inset: 0;
	}
	.ow-hud-top {
		position: absolute;
		top: 0.85rem;
		left: 1rem;
		right: 1rem;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.65rem;
		flex-wrap: wrap;
		pointer-events: none;
	}
	.ow-hud-left,
	.ow-hud-right {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		pointer-events: auto;
	}
	.hud-pill {
		padding: 0.36rem 0.78rem;
		border-radius: 999px;
		background: rgba(8, 15, 28, 0.82);
		border: 1px solid rgba(255, 255, 255, 0.16);
		backdrop-filter: blur(12px);
		color: #e2e8f0;
		font-size: 0.76rem;
		font-weight: 600;
	}
	button.hud-pill {
		cursor: pointer;
	}
	.hud-pill.back-btn {
		border-color: rgba(110, 231, 183, 0.45);
		color: #6ee7b7;
	}
	.hud-pill.accent {
		border-color: rgba(251, 191, 36, 0.45);
		color: #fde68a;
	}
	.hud-pill.audio-badge {
		border-color: rgba(56, 189, 248, 0.5);
		color: #bae6fd;
	}
	.cam-mode-group {
		display: inline-flex;
		padding: 0.15rem;
		border-radius: 999px;
		background: rgba(8, 15, 28, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.14);
	}
	.cam-mode-group button {
		border: none;
		background: transparent;
		color: #94a3b8;
		font-size: 0.73rem;
		font-weight: 600;
		padding: 0.26rem 0.68rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.cam-mode-group button.active {
		background: #059669;
		color: #fff;
	}
	.ow-trigger-banner {
		position: absolute;
		bottom: 4.2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
	}
	.trigger-cta {
		padding: 0.68rem 1.35rem;
		border-radius: 999px;
		background: linear-gradient(135deg, #059669, #0284c7);
		border: 1px solid rgba(167, 243, 208, 0.7);
		color: #fff;
		font-size: 0.88rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 12px 32px rgba(5, 150, 105, 0.45);
	}
	.ow-hud-bottom {
		position: absolute;
		bottom: 0.85rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		padding: 0.4rem 0.95rem;
		border-radius: 999px;
		background: rgba(8, 15, 28, 0.78);
		border: 1px solid rgba(255, 255, 255, 0.12);
		font-size: 0.74rem;
		color: #cbd5e1;
		white-space: nowrap;
		pointer-events: none;
	}
	.ow-backdrop {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(circle at 20% 15%, rgba(16, 185, 129, 0.14), transparent 45%),
			radial-gradient(circle at 80% 25%, rgba(56, 189, 248, 0.12), transparent 48%);
		pointer-events: none;
	}
	.ow-container {
		position: relative;
		z-index: 2;
		max-width: 74rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.35rem;
	}
	.ow-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.2rem;
		padding: 1.35rem 1.65rem;
		border-radius: 18px;
		background: rgba(10, 18, 32, 0.84);
		border: 1px solid rgba(52, 211, 153, 0.24);
		backdrop-filter: blur(14px);
	}
	.ow-title-block {
		max-width: 46rem;
	}
	.ow-eyebrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.55rem;
	}
	.mode-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.22rem 0.68rem;
		border-radius: 999px;
		background: rgba(16, 185, 129, 0.16);
		border: 1px solid rgba(52, 211, 153, 0.42);
		color: #6ee7b7;
	}
	.ow-title-block h1 {
		margin: 0 0 0.45rem;
		font-size: clamp(1.25rem, 2.2vw, 1.7rem);
		line-height: 1.25;
	}
	.ow-title-block p {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.62;
		color: #cbd5e1;
	}
	.ow-actions {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.space-switch {
		display: inline-flex;
		background: rgba(8, 14, 24, 0.88);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		padding: 0.2rem;
		gap: 0.2rem;
	}
	.space-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.36rem 0.85rem;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.18s, color 0.18s;
	}
	.space-btn:hover {
		color: #e2e8f0;
	}
	.space-btn.active {
		background: var(--color-brand-500, #0c713d);
		color: #fff;
	}
	.ow-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.58rem 1rem;
		border-radius: 10px;
		font-size: 0.83rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
	}
	.ow-btn.primary {
		background: linear-gradient(135deg, #059669, #10b981);
		color: #fff;
	}
	.ow-btn.secondary {
		background: rgba(56, 189, 248, 0.14);
		border-color: rgba(56, 189, 248, 0.42);
		color: #bae6fd;
	}
	.ow-btn.full {
		width: 100%;
		margin-top: 0.45rem;
	}
	.trigger-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.pack-download-link {
		font-size: 0.76rem;
		color: #94a3b8;
		text-align: center;
		text-decoration: none;
		margin-top: 0.25rem;
	}
	.pack-download-link:hover {
		color: #e2e8f0;
		text-decoration: underline;
	}
	.ow-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.planet-tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.planet-tab {
		padding: 0.48rem 0.95rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 600;
		background: rgba(15, 23, 42, 0.78);
		border: 1px solid rgba(148, 163, 184, 0.24);
		color: #cbd5e1;
		cursor: pointer;
	}
	.planet-tab.active {
		background: rgba(16, 185, 129, 0.18);
		border: 1px solid rgba(52, 211, 153, 0.55);
		color: #a7f3d0;
	}
	.chunk-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.82rem;
		color: #94a3b8;
	}
	.chunk-stats strong {
		color: #f8fafc;
	}
	.ow-empty-card {
		padding: 2.3rem 1.8rem;
		border-radius: 18px;
		background: rgba(10, 18, 32, 0.82);
		border: 1px solid rgba(148, 163, 184, 0.18);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
	}
	.ow-empty-card h2 {
		margin: 0;
		font-size: 1.25rem;
	}
	.ow-empty-card p {
		margin: 0;
		max-width: 44rem;
		font-size: 0.9rem;
		line-height: 1.68;
		color: #cbd5e1;
	}
	.pipeline-steps {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		margin-top: 0.5rem;
	}
	.step-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		background: rgba(30, 41, 59, 0.72);
		border: 1px solid rgba(52, 211, 153, 0.25);
		font-size: 0.78rem;
		color: #e2e8f0;
	}
	.step-pill span {
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: rgba(16, 185, 129, 0.28);
		color: #6ee7b7;
		font-size: 0.7rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.step-arrow {
		color: #64748b;
	}
	.ow-workspace {
		display: grid;
		grid-template-columns: 1fr minmax(0, 23rem);
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 960px) {
		.ow-workspace {
			grid-template-columns: 1fr;
		}
	}
	.chunk-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.85rem;
	}
	.chunk-card {
		text-align: left;
		padding: 1rem 1.1rem;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.78);
		border: 1px solid rgba(148, 163, 184, 0.2);
		color: #f1f5f9;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.chunk-card.selected {
		border-color: rgba(52, 211, 153, 0.65);
		background: rgba(16, 185, 129, 0.12);
	}
	.chunk-card.locked {
		opacity: 0.65;
	}
	.chunk-card-top {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		font-size: 0.72rem;
	}
	.coord-tag {
		font-family: monospace;
		padding: 0.15rem 0.48rem;
		border-radius: 6px;
		background: rgba(56, 189, 248, 0.15);
		color: #7dd3fc;
	}
	.biome-tag,
	.ver-tag {
		padding: 0.15rem 0.48rem;
		border-radius: 6px;
		background: rgba(148, 163, 184, 0.16);
		color: #cbd5e1;
		font-size: 0.72rem;
	}
	.chunk-card h3 {
		margin: 0;
		font-size: 0.96rem;
	}
	.chunk-card-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #94a3b8;
	}
	.chunk-inspector {
		padding: 1.25rem;
		border-radius: 16px;
		background: rgba(10, 18, 32, 0.88);
		border: 1px solid rgba(52, 211, 153, 0.28);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.inspector-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.chunk-inspector h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.inspector-preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.inspector-desc {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.62;
		color: #cbd5e1;
	}
	.inspector-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.72);
	}
	.inspector-stats small {
		display: block;
		font-size: 0.68rem;
		color: #94a3b8;
	}
	.inspector-stats strong {
		font-size: 0.84rem;
		color: #f8fafc;
	}
	.ow-spinner {
		width: 1.8rem;
		height: 1.8rem;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: #10b981;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
