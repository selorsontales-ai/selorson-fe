/**
 * Kế hoạch VRAM v2 · Đợt C · C1 — cache texture/geo của thế giới phải giải phóng được GPU khi rời /world:
 * mục đã nạp xong dispose NGAY (lúc renderer còn sống), mục đang nạp dispose khi về, không dispose trùng.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DisposablePromiseCache } from '../src/lib/world/engine/disposable-cache.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('cùng key → cùng promise; purge dispose mục đã xong ngay lập tức (đồng bộ)', async () => {
	const released = [];
	const cache = new DisposablePromiseCache((v) => released.push(v));
	let made = 0;
	const a1 = cache.getOrCreate('a', () => (made++, Promise.resolve('texA')));
	const a2 = cache.getOrCreate('a', () => (made++, Promise.resolve('texA2')));
	assert.equal(a1, a2);
	assert.equal(made, 1);
	await a1;
	await tick();
	cache.purge();
	assert.deepEqual(released, ['texA'], 'phải dispose đồng bộ trong purge()');
	assert.equal(cache.size, 0);
	// Sau purge: nạp lại tạo promise mới
	cache.getOrCreate('a', () => (made++, Promise.resolve('texA3')));
	assert.equal(made, 2);
});

test('mục đang nạp lúc purge được dispose khi về; null không dispose; không dispose 2 lần', async () => {
	const released = [];
	const cache = new DisposablePromiseCache((v) => released.push(v));
	let resolveSlow;
	cache.getOrCreate('slow', () => new Promise((r) => (resolveSlow = r)));
	cache.getOrCreate('missing', () => Promise.resolve(null));
	await tick();
	cache.purge();
	assert.deepEqual(released, []);
	resolveSlow('texSlow');
	await tick();
	assert.deepEqual(released, ['texSlow']);
	cache.purge();
	await tick();
	assert.deepEqual(released, ['texSlow']);
});

test('textures + geo-data dùng cache có purge; WorldCanvas purge trước khi renderer.dispose()', () => {
	const tex = fs.readFileSync(new URL('../src/lib/world/engine/textures.svelte.ts', import.meta.url), 'utf8');
	const geo = fs.readFileSync(new URL('../src/lib/world/engine/geo-data.svelte.ts', import.meta.url), 'utf8');
	const canvas = fs.readFileSync(new URL('../src/lib/world/engine/WorldCanvas.svelte', import.meta.url), 'utf8');
	assert.match(tex, /export function purgeWorldTextureCache\(/);
	assert.match(geo, /export function purgePlanetGeoCache\(/);
	assert.match(canvas, /purgeWorldTextureCache\(\)/);
	assert.match(canvas, /purgePlanetGeoCache\(\)/);
	assert.ok(!/\.forceContextLoss\s*\(|\.loseContext\s*\(/.test(canvas));
});

test('WorldCanvas: hoãn renderer.dispose() thật sang macrotask (Threlte dọn <T> xong trước) và thu canvas 1×1', () => {
	const canvas = fs.readFileSync(new URL('../src/lib/world/engine/WorldCanvas.svelte', import.meta.url), 'utf8');
	assert.match(canvas, /setTimeout\(/);
	assert.match(canvas, /setSize\(1, 1, false\)/);
	assert.match(canvas, /renderLists\.dispose\(\)/);
});

test('WorldCanvas: dọn sâu mọi Scene đã render (texture riêng của GlobeScene) TRƯỚC khi dispose renderer', () => {
	const canvas = fs.readFileSync(new URL('../src/lib/world/engine/WorldCanvas.svelte', import.meta.url), 'utf8');
	assert.match(canvas, /import \{ disposeObject3DDeep \} from '\.\/webgl-dispose'/);
	const iDeep = canvas.indexOf('disposeObject3DDeep(');
	const iReal = canvas.indexOf('disposeRenderer();');
	assert.ok(iDeep > 0 && iReal > iDeep, 'phải dọn cảnh trước disposeRenderer()');
	assert.match(canvas, /renderedScenes/);
});
