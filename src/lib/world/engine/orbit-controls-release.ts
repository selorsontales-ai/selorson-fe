/**
 * Kế hoạch VRAM v2 · C1 (bổ sung) — three r185 `OrbitControls.disconnect()` gỡ listener 'keydown' (capture) trên
 * `domElement.getRootNode()`. Threlte dispose controls SAU khi Svelte đã tháo DOM → `getRootNode()` lúc đó là chính
 * div đã tách, không phải `document` → listener trên document ở lại mãi, giữ controls → div → canvas → context WebGL
 * (đo thật: +70 MB VRAM mỗi lần vào/ra /world). Gỡ thẳng trên document.
 */
interface OrbitControlsListeners {
	_interceptControlDown?: EventListener;
	_interceptControlUp?: EventListener;
}

export function releaseOrbitControlsDocumentListeners(
	controls: unknown,
	doc: EventTarget | undefined = typeof document === 'undefined' ? undefined : document
): void {
	const c = controls as OrbitControlsListeners | undefined;
	if (!c || !doc) return;
	if (c._interceptControlDown) doc.removeEventListener('keydown', c._interceptControlDown, { capture: true });
	if (c._interceptControlUp) doc.removeEventListener('keyup', c._interceptControlUp, { capture: true });
}
