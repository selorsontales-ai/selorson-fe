/**
 * Kế hoạch VRAM v2 · C1 (bổ sung) — Svelte 5.55–5.57 giữ mãi `untracked_writes` ở tầng ngoài cùng → derived của
 * Threlte giữ Map context → canvas + context WebGL không bao giờ được GC (đo thật: +70 MB VRAM mỗi lần vào/ra /world).
 * Sau khi renderer dispose xong, xóa tham chiếu object/hàm trong các giá trị context để cắt chuỗi giữ.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { scrubContextValues } from '../src/lib/world/engine/threlte-context-release.ts';

test('xóa tham chiếu object/hàm trong giá trị context; giữ số/chuỗi; chịu getter chỉ-đọc và object đóng băng', () => {
	const canvas = { tag: 'canvas' };
	const plain = { canvas, dom: { tag: 'div' }, renderer: { domElement: canvas }, invalidate: () => canvas, size: 3, name: 'x' };
	const withGetter = { get canvas() { return canvas; } };
	const frozen = Object.freeze({ canvas });
	const map = new Map([['a', plain], ['b', withGetter], ['c', frozen], ['d', 42], ['e', null]]);
	scrubContextValues(map);
	assert.equal(plain.canvas, null);
	assert.equal(plain.dom, null);
	assert.equal(plain.renderer, null);
	assert.equal(plain.invalidate, null);
	assert.equal(plain.size, 3);
	assert.equal(plain.name, 'x');
	assert.equal(map.size, 0, 'Map phải được làm rỗng');
});

test('WorldCanvas đặt component giải phóng bên trong <Canvas> và gọi sau disposeRenderer()', () => {
	const src = fs.readFileSync(new URL('../src/lib/world/engine/WorldCanvas.svelte', import.meta.url), 'utf8');
	assert.match(src, /<ThrelteContextRelease /);
	const iDispose = src.indexOf('disposeRenderer();');
	const iRelease = src.indexOf('releaseThrelteContexts?.()');
	assert.ok(iDispose > 0 && iRelease > iDispose, 'phải xóa context SAU khi renderer đã dispose');
});
