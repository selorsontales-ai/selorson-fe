// Mobile (Capacitor): SPA mode — no server available
// Web (Cloudflare): SSR mode — server-side rendering
import { isServerRenderedBuildTarget } from '$lib/runtime-target.js';

export const prerender = false;
export const ssr = isServerRenderedBuildTarget(
	import.meta.env.VITE_BUILD_TARGET,
	import.meta.env.MODE
);
