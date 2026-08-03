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
			displacement: false,
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

/** Does this browser have a usable WebGL context at all? */
function hasWebGL(): boolean {
	try {
		const canvas = document.createElement('canvas');
		return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
	} catch {
		return false;
	}
}

function detectTier(): QualityTier {
	if (typeof window === 'undefined') return 'medium';
	if (!hasWebGL()) return 'none';

	const nav = navigator as Navigator & { deviceMemory?: number };
	const memory = nav.deviceMemory ?? 4;
	const cores = navigator.hardwareConcurrency ?? 4;
	const coarsePointer = matchMedia('(pointer: coarse)').matches;
	const saveData = (nav as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;

	// Reader has asked the OS to spare their data — respect it over raw power.
	if (saveData) return 'low';
	if (memory <= 2 || cores <= 2) return 'low';
	if (coarsePointer) return memory >= 6 && cores >= 6 ? 'medium' : 'low';
	if (memory >= 8 && cores >= 8) return 'high';
	return 'medium';
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
