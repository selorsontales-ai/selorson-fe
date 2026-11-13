/**
 * three r185 OrbitControls.disconnect() gỡ 'keydown' (capture) trên domElement.getRootNode(); Threlte dispose controls
 * SAU khi Svelte đã tháo DOM → getRootNode() là chính div → listener trên document bị bỏ sót, giữ controls → div →
 * canvas → context WebGL (đo thật: +70 MB VRAM mỗi lần vào/ra /world). Gỡ thẳng trên document.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { releaseOrbitControlsDocumentListeners } from '../src/lib/world/engine/orbit-controls-release.ts';

test('gỡ keydown/keyup capture mà OrbitControls đã gắn lên document', () => {
	const doc = new EventTarget();
	let hits = 0;
	const controls = { _interceptControlDown: () => hits++, _interceptControlUp: () => hits++ };
	doc.addEventListener('keydown', controls._interceptControlDown, { passive: true, capture: true });
	doc.addEventListener('keyup', controls._interceptControlUp, { passive: true, capture: true });
	releaseOrbitControlsDocumentListeners(controls, doc);
	doc.dispatchEvent(new Event('keydown'));
	doc.dispatchEvent(new Event('keyup'));
	assert.equal(hits, 0);
	releaseOrbitControlsDocumentListeners(undefined, doc); // không lỗi khi chưa có controls
});

test('GlobeScene và JourneyScene gọi releaseOrbitControlsDocumentListeners khi hủy', () => {
	for (const f of ['GlobeScene', 'JourneyScene']) {
		const src = fs.readFileSync(new URL(`../src/lib/world/engine/${f}.svelte`, import.meta.url), 'utf8');
		assert.match(src, /releaseOrbitControlsDocumentListeners\(/, f);
	}
});
