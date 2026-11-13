/**
 * Device capability tiers.
 *
 * The same world runs on a desktop GPU, an Android phone under Capacitor and a
 * Tauri webview. Rather than branching on device strings, each tier is a budget
 * the scenes read from — draw calls, texture size, whether shadows exist at all.
 */

export type QualityTier = 'high' | 'medium' | 'low' | 'none';

export interface QualitySettings {
	tier: QualityTier;
	/** Cap on `renderer.setPixelRatio` — the single biggest fill-rate lever. */
	pixelRatio: number;
	antialias: boolean;
	shadows: boolean;
	clouds: boolean;
	atmosphere: boolean;
	/** Vertex displacement on the globe; falls back to bump-only when off. */
	displacement: boolean;
	starCount: number;
	/** Segments per sphere — 128 is smooth, 48 is a phone. */
	sphereSegments: number;
	/** Landmarks kept alive at once in a region scene. */
	maxLandmarks: number;
	/** Honour `prefers-reduced-motion`: no idle spin, no auto-tour. */
	reducedMotion: boolean;
}

const TIERS: Record<Exclude<QualityTier, 'none'>, Omit<QualitySettings, 'tier' | 'reducedMotion'>> =
	{
		high: {
			pixelRatio: 2,
			antialias: true,
			shadows: true,
			clouds: true,
			atmosphere: true,
			displacement: true,
			starCount: 3000,
			sphereSegments: 128,
			maxLandmarks: 24
		},
		medium: {
			pixelRatio: 1.5,
			antialias: true,
			shadows: false,
			clouds: true,
			atmosphere: true,
			displacement: true,
			starCount: 1200,
			sphereSegments: 72,
			maxLandmarks: 12
		},
		low: {
			pixelRatio: 1,
			antialias: false,
			shadows: false,
			clouds: false,
			atmosphere: false,
			displacement: false,
			starCount: 0,
			sphereSegments: 48,
			maxLandmarks: 6
		}
	};

let cachedHasWebGL: boolean | null = null;
let cachedPowerPreference: WebGLPowerPreference = 'default';
const WEBGL_PREF_STORAGE_KEY = 'selorson_webgl_pref';

/**
 * Does this browser have a usable WebGL context at all, and does its sandboxed
 * GPU process accept `powerPreference: 'high-performance'`?
 *
 * IMPORTANT: Never invoke `WEBGL_lose_context` on probe or teardown canvases —
 * Chromium/WebView2 counts synthetic context-loss calls toward its per-origin
 * guilt limit (`"Web page caused context loss and was blocked"`). Caching the
 * probed preference in `sessionStorage` also avoids allocating extra probe
 * contexts across hard reloads.
 */
function hasWebGL(): boolean {
	if (cachedHasWebGL !== null) return cachedHasWebGL;
	try {
		const stored = window.sessionStorage?.getItem(WEBGL_PREF_STORAGE_KEY);
		if (stored === 'high-performance' || stored === 'default') {
			cachedPowerPreference = stored;
			cachedHasWebGL = true;
			return true;
		}
	} catch {
		// Ignore storage access errors in restricted frames
	}

	try {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const hpGl = canvas.getContext('webgl2', {
			powerPreference: 'high-performance'
		}) as WebGL2RenderingContext | null;
		if (hpGl) {
			cachedPowerPreference = 'high-performance';
			cachedHasWebGL = true;
		} else {
			const fallbackCanvas = document.createElement('canvas');
			fallbackCanvas.width = 1;
			fallbackCanvas.height = 1;
			const defGl = fallbackCanvas.getContext('webgl2') as WebGL2RenderingContext | null;
			if (!defGl) {
				cachedHasWebGL = false;
				return false;
			}
			cachedPowerPreference = 'default';
			cachedHasWebGL = true;
		}
		try {
			window.sessionStorage?.setItem(WEBGL_PREF_STORAGE_KEY, cachedPowerPreference);
		} catch {
			// Ignore storage quota/security errors
		}
		return true;
	} catch {
		cachedHasWebGL = false;
		return false;
	}
}

/** Power preference guaranteed to succeed without triggering ANGLE context rejection. */
export function preferredPowerPreference(): WebGLPowerPreference {
	if (typeof window !== 'undefined' && cachedHasWebGL === null) {
		hasWebGL();
	}
	return cachedPowerPreference;
}

/**
 * Pre-acquire a WebGL2 context before `new WebGLRenderer(...)` attaches its
 * `webglcontextcreationerror` console logger. Never fall back to WebGL 1 (Three.js
 * r163+ throws if given a `WebGLRenderingContext`). If Chromium/WebView2 rejects
 * `high-performance` during rapid hard reloads (`BindToCurrentSequence failed`),
 * silently persist `'default'` in `sessionStorage` and fall back on the same canvas.
 */
export function acquireSafeWebGLContext(
	canvas: HTMLCanvasElement,
	opts: { powerPreference: WebGLPowerPreference; antialias: boolean; alpha: boolean }
): { context: WebGL2RenderingContext | undefined; antialias: boolean } {
	const baseAttrs: WebGLContextAttributes = {
		alpha: opts.alpha,
		depth: true,
		stencil: true,
		premultipliedAlpha: true,
		preserveDrawingBuffer: false
	};

	const tryAcquire = (attrs: WebGLContextAttributes): WebGL2RenderingContext | null => {
		try {
			return canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
		} catch {
			return null;
		}
	};

	const primary = tryAcquire({
		...baseAttrs,
		powerPreference: opts.powerPreference,
		antialias: opts.antialias
	});
	if (primary) {
		return { context: primary, antialias: opts.antialias };
	}

	if (opts.powerPreference === 'high-performance') {
		cachedPowerPreference = 'default';
		try {
			window.sessionStorage?.setItem(WEBGL_PREF_STORAGE_KEY, 'default');
		} catch {
			// Ignore storage quota/security errors
		}
	}

	const defaultPref = tryAcquire({
		...baseAttrs,
		powerPreference: 'default',
		antialias: opts.antialias
	});
	if (defaultPref) {
		return { context: defaultPref, antialias: opts.antialias };
	}

	const noAa = tryAcquire({
		...baseAttrs,
		powerPreference: 'default',
		antialias: false
	});
	return { context: noAa ?? undefined, antialias: false };
}

export function classifyHardwareTier(signals: {
	memory: number | undefined;
	cores: number;
	coarsePointer: boolean;
	saveData?: boolean;
}): Exclude<QualityTier, 'none'> {
	const { memory, cores, coarsePointer, saveData } = signals;

	// Reader has asked the OS to spare their data — respect it over raw power.
	if (saveData) return 'low';
	if ((memory !== undefined && memory <= 2) || cores <= 2) return 'low';
	if (coarsePointer) {
		return (memory ?? 4) >= 6 && cores >= 6 ? 'medium' : 'low';
	}
	// Blink exposes `navigator.deviceMemory`; Gecko/WebKit leave it `undefined`.
	// On fine-pointer desktops, treat unknown memory with >=6 CPU threads as high-tier capable.
	if ((memory === undefined || memory >= 8) && cores >= 6) return 'high';
	return 'medium';
}

function detectTier(): QualityTier {
	if (typeof window === 'undefined') return 'medium';
	if (!hasWebGL()) return 'none';

	const nav = navigator as Navigator & { deviceMemory?: number };
	return classifyHardwareTier({
		memory: nav.deviceMemory,
		cores: navigator.hardwareConcurrency ?? 4,
		coarsePointer: matchMedia('(pointer: coarse)').matches,
		saveData: (nav as unknown as { connection?: { saveData?: boolean } }).connection?.saveData
	});
}

/**
 * Resolve the settings for this session. `?q=low|medium|high|none` overrides
 * detection — useful for testing a phone budget on a desktop.
 */
export function resolveQuality(search?: URLSearchParams): QualitySettings {
	const override = search?.get('q') as QualityTier | null;
	const tier =
		override && ['high', 'medium', 'low', 'none'].includes(override) ? override : detectTier();

	const reducedMotion =
		typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (tier === 'none') {
		return { ...TIERS.low, tier: 'none', reducedMotion };
	}
	return { ...TIERS[tier], tier, reducedMotion };
}

/** Texture set matching a tier — `none` still gets the low-tier skin for the 2D fallback. */
export function textureTier(tier: QualityTier): 'high' | 'medium' | 'low' {
	if (tier === 'high') return 'high';
	if (tier === 'medium') return 'medium';
	return 'low';
}
