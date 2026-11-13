/**
 * Kế hoạch VRAM v2 · Đợt C · C1 — Thế giới mở (WorldOpenRealm) phải trả VRAM khi rời và không render khi mở VN.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const src = fs.readFileSync(new URL('../src/lib/world/ui/WorldOpenRealm.svelte', import.meta.url), 'utf8');
const stopFn = src.slice(src.indexOf('function stopRuntimeOnly()'), src.indexOf('function stopExploration3D()'));

test('stopRuntimeOnly dọn sâu cảnh TRƯỚC renderer.dispose(), thu canvas 1×1, nhả audio + draco', () => {
	const iScene = stopFn.indexOf('disposeObject3DDeep(scene)');
	const iRenderer = stopFn.indexOf('renderer.dispose();');
	assert.ok(iScene > 0 && iRenderer > iScene, 'phải dọn cảnh trước renderer.dispose()');
	for (const s of ['sessionToken++', 'setSize(1, 1, false)', 'renderLists.dispose()', 'runtimeDraco?.dispose()', ".removeAttribute('src')", 'domElement.remove()'])
		assert.ok(stopFn.includes(s), `thiếu ${s}`);
	assert.ok(!/\.forceContextLoss\s*\(|\.loseContext\s*\(/.test(src));
});

test('loader .glb và splat về muộn (khác phiên) bị dọn, không gắn vào cảnh', () => {
	assert.equal((src.match(/token !== sessionToken/g) ?? []).length, 2);
	assert.match(src, /disposeObject3DDeep\(gltf\.scene\)/);
	assert.match(src, /disposeObject3DDeep\(pts\)/);
});

test('mở Visual Novel → dừng hẳn rAF; đóng → chạy lại', () => {
	assert.match(src, /if \(activeVnModal\) \{\s*rafId = 0;\s*return;/);
	assert.match(src, /!modalOpen && exploring3D && runtimeTick && !rafId/);
});
