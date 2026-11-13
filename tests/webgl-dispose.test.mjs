/**
 * Đợt C · C1 (Selorson) — Bộ dọn tài nguyên Three.js phải phát sự kiện `dispose` cho MỌI tài nguyên GPU
 * (geometry, material, texture kể cả trong uniforms, shadow map, render target của pass) đúng 1 lần.
 * Chạy trong Node (không cần GPU): sự kiện `dispose` chính là thứ WebGLRenderer lắng nghe để `deleteTexture/deleteBuffer`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
	disposeComposer,
	disposeMaterialDeep,
	disposeObject3DDeep,
	disposeSparkRenderer
} from '../src/lib/world/engine/webgl-dispose.ts';

function tracker() {
	const counts = new Map();
	const track = (res, label) => {
		counts.set(label, 0);
		res.addEventListener('dispose', () => counts.set(label, counts.get(label) + 1));
		return res;
	};
	return { counts, track };
}

function assertAllOnce(counts) {
	for (const [label, n] of counts) assert.equal(n, 1, `${label} phải dispose đúng 1 lần (thực tế ${n})`);
}

test('disposeMaterialDeep giải phóng mọi texture của MeshStandardMaterial (kể cả map hiếm) và chính material', () => {
	const { counts, track } = tracker();
	const shared = track(new THREE.Texture(), 'shared map+emissive');
	const mat = track(
		new THREE.MeshPhysicalMaterial({
			map: shared,
			emissiveMap: shared,
			normalMap: track(new THREE.Texture(), 'normalMap'),
			roughnessMap: track(new THREE.Texture(), 'roughnessMap'),
			metalnessMap: track(new THREE.Texture(), 'metalnessMap'),
			aoMap: track(new THREE.Texture(), 'aoMap'),
			iridescenceMap: track(new THREE.Texture(), 'iridescenceMap'),
			anisotropyMap: track(new THREE.Texture(), 'anisotropyMap')
		}),
		'material'
	);
	disposeMaterialDeep(mat);
	assertAllOnce(counts);
});

test('disposeMaterialDeep giải phóng texture trong uniforms (đơn và mảng) của ShaderMaterial', () => {
	const { counts, track } = tracker();
	const mat = track(
		new THREE.ShaderMaterial({
			uniforms: {
				uGrass: { value: track(new THREE.Texture(), 'uGrass') },
				uLayers: { value: [track(new THREE.Texture(), 'uLayers[0]'), track(new THREE.Texture(), 'uLayers[1]')] },
				uTime: { value: 0 },
				uSun: { value: new THREE.Vector3() }
			}
		}),
		'shaderMaterial'
	);
	disposeMaterialDeep(mat);
	assertAllOnce(counts);
});

test('disposeObject3DDeep dọn cả cây: geometry/material dùng chung, mảng material, InstancedMesh, shadow map, nền & environment', () => {
	const { counts, track } = tracker();
	const scene = new THREE.Scene();
	scene.background = track(new THREE.Texture(), 'scene.background');
	scene.environment = track(new THREE.Texture(), 'scene.environment');

	const sharedGeo = track(new THREE.BufferGeometry(), 'sharedGeo');
	const sharedMat = track(new THREE.MeshStandardMaterial({ map: track(new THREE.Texture(), 'sharedMat.map') }), 'sharedMat');
	const group = new THREE.Group();
	group.add(new THREE.Mesh(sharedGeo, sharedMat));
	group.add(new THREE.Mesh(sharedGeo, sharedMat)); // clone kiểu root.clone(): chung geometry/material
	group.add(
		new THREE.Mesh(track(new THREE.BufferGeometry(), 'multiGeo'), [
			track(new THREE.MeshBasicMaterial(), 'multi[0]'),
			track(new THREE.MeshBasicMaterial(), 'multi[1]')
		])
	);
	scene.add(group);

	const inst = new THREE.InstancedMesh(
		track(new THREE.BufferGeometry(), 'instGeo'),
		track(new THREE.MeshLambertMaterial(), 'instMat'),
		4
	);
	track(inst, 'instancedMesh');
	scene.add(inst);

	const line = new THREE.LineLoop(track(new THREE.BufferGeometry(), 'lineGeo'), track(new THREE.LineBasicMaterial(), 'lineMat'));
	scene.add(line);

	const sun = new THREE.DirectionalLight(0xffffff, 1);
	sun.castShadow = true;
	sun.shadow.map = new THREE.WebGLRenderTarget(4, 4);
	track(sun.shadow.map, 'shadow.map');
	scene.add(sun);

	disposeObject3DDeep(scene);
	assertAllOnce(counts);
	assert.equal(scene.children.length, 0, 'scene phải được clear()');
	assert.equal(scene.background, null);
	assert.equal(scene.environment, null);
});

test('disposeObject3DDeep bỏ qua cây con được chỉ định (vd. SparkRenderer dọn riêng) và gọi dispose() của object tùy biến (vd. SplatMesh)', () => {
	const { counts, track } = tracker();
	const scene = new THREE.Scene();
	const skipped = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
	let skippedGeoDisposed = 0;
	skipped.geometry.addEventListener('dispose', () => skippedGeoDisposed++);
	scene.add(skipped);

	const splatLike = new THREE.Object3D();
	let splatDisposed = 0;
	splatLike.dispose = () => splatDisposed++;
	scene.add(splatLike);
	scene.add(new THREE.Mesh(track(new THREE.BufferGeometry(), 'normalGeo'), track(new THREE.MeshBasicMaterial(), 'normalMat')));

	disposeObject3DDeep(scene, { skip: (o) => o === skipped });
	assertAllOnce(counts);
	assert.equal(skippedGeoDisposed, 0, 'cây con bị skip không được dispose');
	assert.equal(splatDisposed, 1, 'object tùy biến có dispose() phải được gọi đúng 1 lần');
});

test('disposeComposer gọi dispose() của MỌI pass (bắt được UnrealBloomPass) rồi của composer', () => {
	const calls = [];
	const composer = {
		passes: [{ dispose: () => calls.push('render') }, { dispose: () => calls.push('bloom') }, {}, { dispose: () => calls.push('output') }],
		dispose: () => calls.push('composer')
	};
	disposeComposer(composer);
	assert.deepEqual(calls, ['render', 'bloom', 'output', 'composer']);
});

test('disposeSparkRenderer giải phóng PackedSplats của accumulator + viewpoint + geometry/material, KHÔNG đụng texture tĩnh dùng chung', () => {
	const calls = [];
	const staticEmpty = new THREE.Data3DTexture();
	let staticDisposed = 0;
	staticEmpty.addEventListener('dispose', () => staticDisposed++);
	const sharedViewpoint = { dispose: () => calls.push('defaultView') };
	const spark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { emptySplats: { value: staticEmpty } } }));
	spark.geometry.addEventListener('dispose', () => calls.push('geometry'));
	spark.material.addEventListener('dispose', () => calls.push('material'));
	spark.active = { splats: { dispose: () => calls.push('active.splats') } };
	spark.freeAccumulators = [{ splats: { dispose: () => calls.push('free[0].splats') } }];
	spark.defaultView = sharedViewpoint;
	spark.viewpoint = sharedViewpoint; // cùng object → chỉ dispose 1 lần
	spark.autoViewpoints = [{ dispose: () => calls.push('auto[0]') }];
	const parent = new THREE.Scene();
	parent.add(spark);

	disposeSparkRenderer(spark);
	assert.deepEqual(calls.sort(), ['active.splats', 'auto[0]', 'defaultView', 'free[0].splats', 'geometry', 'material'].sort());
	assert.equal(staticDisposed, 0, 'EMPTY_SPLAT_TEXTURE tĩnh dùng chung không được dispose');
	assert.equal(spark.parent, null, 'SparkRenderer phải được gỡ khỏi scene');
});
