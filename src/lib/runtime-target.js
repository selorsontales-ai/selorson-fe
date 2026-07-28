const SPA_BUILD_TARGETS = new Set(['mobile', 'desktop']);

/**
 * Packaged Capacitor and Tauri apps have no SvelteKit server process.
 * @param {string | undefined} explicitTarget
 * @param {string | undefined} viteMode
 */
export function isSpaBuildTarget(explicitTarget, viteMode) {
	const target = explicitTarget || viteMode || 'web';
	return SPA_BUILD_TARGETS.has(target);
}

/**
 * @param {string | undefined} explicitTarget
 * @param {string | undefined} viteMode
 */
export function isServerRenderedBuildTarget(explicitTarget, viteMode) {
	return !isSpaBuildTarget(explicitTarget, viteMode);
}
