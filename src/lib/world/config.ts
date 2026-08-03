/**
 * Where world assets live, and how to address them.
 *
 * Art is expected to be replaced repeatedly — character models, region maps and
 * terrain textures are all placeholder-grade today. Nothing about a specific
 * asset is written into the codebase: paths come from the database, and the
 * host they resolve against comes from the environment, so moving everything to
 * R2 is a config change rather than a code change.
 */

import { env } from '$env/dynamic/public';

/**
 * Base for relative asset paths stored in `extra_data.world`.
 * Defaults to the bundled `static/world` folder for local development;
 * production points it at the R2 bucket.
 */
export const ASSET_BASE = (env.PUBLIC_WORLD_ASSET_BASE || '/world').replace(/\/+$/, '');

/**
 * Region outlines. A runtime fetch rather than a bundled import so redrawing
 * the map means replacing one file — no rebuild, no deploy.
 */
export const REGION_GEOMETRY_URL =
	env.PUBLIC_WORLD_REGION_GEOMETRY || `${ASSET_BASE}/regions.geojson`;

/**
 * Resolve an asset reference to a URL.
 *
 * Absolute URLs and root-relative paths pass through untouched, so a single
 * item can point at Cloudinary, R2 or the local static folder. `version`
 * (the item's `updated_at`) is appended so swapping art in admin invalidates
 * the CDN copy immediately.
 */
export function assetUrl(path: string | null | undefined, version?: number): string | null {
	if (!path) return null;
	const isAbsolute = /^(https?:)?\/\//.test(path) || path.startsWith('/');
	const base = isAbsolute ? path : `${ASSET_BASE}/${path.replace(/^\/+/, '')}`;
	if (version === undefined) return base;
	return base.includes('?') ? `${base}&v=${version}` : `${base}?v=${version}`;
}

/**
 * Globe textures per quality tier. These filenames are the one deliberate
 * exception to "no hardcoded assets" — they are the engine's own fallback
 * skin, used only when the database has not supplied a planet texture.
 */
export const GLOBE_TEXTURES = {
	high: {
		color: `${ASSET_BASE}/textures/akunalia-color-4k.jpg`,
		bump: `${ASSET_BASE}/textures/akunalia-bump-2k.jpg`,
		clouds: `${ASSET_BASE}/textures/akunalia-clouds-2k.jpg`
	},
	medium: {
		color: `${ASSET_BASE}/textures/akunalia-color-2k.jpg`,
		bump: `${ASSET_BASE}/textures/akunalia-bump-2k.jpg`,
		clouds: `${ASSET_BASE}/textures/akunalia-clouds-2k.jpg`
	},
	low: {
		color: `${ASSET_BASE}/textures/akunalia-color-2k.jpg`,
		bump: null,
		clouds: null
	}
} as const;

/** Planet radius in scene units. Everything else is derived from this. */
export const GLOBE_RADIUS = 5;
