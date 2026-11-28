/**
 * Akunarch P0: sa bàn cơ khí — .glb có clip `assemble` (phát 1 lần) và `idle` (lặp). Chỉ app desktop mở trình xem 3D.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
	isClockworkGlb,
	pickClockworkClips,
	resolveClockworkVariant
} from '../src/lib/world/engine/clockwork-pack.ts';

test('pickClockworkClips: assemble 1 lần rồi lặp idle', () => {
	assert.deepEqual(pickClockworkClips(['idle', 'assemble']), { intro: 'assemble', loop: 'idle' });
	assert.deepEqual(pickClockworkClips(['assemble']), { intro: 'assemble', loop: null });
	assert.deepEqual(pickClockworkClips(['Spin']), { intro: null, loop: null });
});

test('isClockworkGlb: chỉ nhận .glb (kể cả có query), bỏ zip/rỗng', () => {
	assert.equal(isClockworkGlb('http://127.0.0.1:8001/media/world/x_clockwork.glb'), true);
	assert.equal(isClockworkGlb('/media/world/X.GLB?v=2'), true);
	assert.equal(isClockworkGlb('/media/world/x_pack.zip'), false);
	assert.equal(isClockworkGlb(null), false);
	assert.equal(isClockworkGlb('  '), false);
});

test('trình xem dọn sạch: dispose sâu, gỡ listener OrbitControls, thu canvas, dừng rAF', () => {
	const src = fs.readFileSync(new URL('../src/lib/world/ui/ClockworkPackViewer.svelte', import.meta.url), 'utf8');
	assert.match(src, /disposeObject3DDeep\(/);
	assert.match(src, /releaseOrbitControlsDocumentListeners\(/);
	assert.match(src, /setSize\(1, 1/);
	assert.match(src, /cancelAnimationFrame\(/);
	assert.match(src, /uncacheRoot\(/);
});

test('REM-80: trình xem hỗ trợ chuyển đổi Bản thật (realScaleUrl) <-> Sa bàn cơ khí', () => {
	const viewerSrc = fs.readFileSync(new URL('../src/lib/world/ui/ClockworkPackViewer.svelte', import.meta.url), 'utf8');
	assert.match(viewerSrc, /realScaleUrl/);
	assert.match(viewerSrc, /Sa bàn cơ khí/);
	assert.match(viewerSrc, /Bản thật/);
	const placePageSrc = fs.readFileSync(
		new URL('../src/routes/(app)/world/[region]/[slug]/+page.svelte', import.meta.url),
		'utf8'
	);
	assert.match(placePageSrc, /realScaleUrl=/);
});

test('REM-80: nút "Xem 3D Bản thật" yêu cầu variant real, tab Sa bàn cơ khí giữ clockwork', () => {
	assert.equal(resolveClockworkVariant('real', '/a_clockwork.glb', '/a_real.glb'), 'real');
	assert.equal(resolveClockworkVariant('clockwork', '/a_clockwork.glb', '/a_real.glb'), 'clockwork');
	assert.equal(resolveClockworkVariant(undefined, '/a_clockwork.glb', '/a_real.glb'), 'clockwork');
	// chỉ có 1 bản: yêu cầu real không có bản thật riêng thì rơi về clockwork; không có url chính thì dùng real
	assert.equal(resolveClockworkVariant('real', '/only.glb', null), 'clockwork');
	assert.equal(resolveClockworkVariant('clockwork', '', '/a_real.glb'), 'real');

	const hud = fs.readFileSync(new URL('../src/lib/world/ui/LocationHud.svelte', import.meta.url), 'utf8');
	assert.match(hud, /onmediatab\?\.\('clockwork', 'real'\)/);
	const page = fs.readFileSync(
		new URL('../src/routes/(app)/world/[region]/[slug]/+page.svelte', import.meta.url),
		'utf8'
	);
	assert.match(page, /requestedVariant=\{clockworkVariant\}/);
});
