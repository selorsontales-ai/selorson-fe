/**
 * Pure spatial, reveal-state, deep-link, and 2D cartographic projection utilities
 * for the Selorson 3D World & 2D Atlas (`Hạng mục 4`).
 */

import type { RevealState, WorldNode } from './types';

/**
 * Whether a node is unlocked and readable by the reader (`revealed` or `explored`).
 * Fixes the bug where visiting a location (`state === 'explored'`) locked it on the HUD!
 */
export function isUnlockedState(state: RevealState | string | null | undefined): boolean {
	return state === 'revealed' || state === 'explored';
}

/**
 * Whether the reader has personally stepped into this location/region (`explored`).
 */
export function isExploredState(state: RevealState | string | null | undefined): boolean {
	return state === 'explored';
}

/**
 * Fold Vietnamese accented strings to lowercase ASCII for accent-insensitive search & matching.
 */
export function normalizeWorldSearchText(input: string | null | undefined): string {
	if (!input) return '';
	return String(input)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'd')
		.toLowerCase()
		.trim();
}

/**
 * Resolve the route URL to enter a node from the Globe or 2D Atlas:
 * - `region` -> `/world/{slug}`
 * - `character` -> `/world/journey/{id}`
 * - `location` / `landmark` / `poi` -> `/world/{region || '_'}/{slug}`
 */
export function resolveWorldNodeTargetUrl(
	node: Pick<WorldNode, 'id' | 'slug' | 'kind' | 'category' | 'region'> | null | undefined
): string {
	if (!node) return '/world';
	if (
		node.kind === 'character' ||
		node.category === 'character' ||
		node.category === 'main_character' ||
		node.category === 'side_character'
	) {
		return `/world/journey/${node.id}`;
	}
	const slug = encodeURIComponent(node.slug || String(node.id));
	if (node.kind === 'region') {
		return `/world/${slug}`;
	}
	const regionPart = encodeURIComponent(node.region || '_');
	return `/world/${regionPart}/${slug}`;
}

/**
 * Find a node in a combined list of regions/locations/characters by a `?focus=` URL parameter.
 * Matches by numeric `id`, exact `slug`, or normalized name.
 */
export function findNodeByFocusParam<
	T extends Pick<WorldNode, 'id' | 'slug' | 'name'>
>(nodes: T[], focusParam: string | null | undefined): T | null {
	if (!focusParam || !Array.isArray(nodes) || nodes.length === 0) return null;
	const clean = focusParam.trim();
	if (!clean) return null;

	const numericId = Number(clean);
	if (Number.isInteger(numericId) && numericId > 0) {
		const byId = nodes.find((n) => n.id === numericId);
		if (byId) return byId;
	}

	const lowerSlug = clean.toLowerCase();
	const bySlug = nodes.find((n) => (n.slug || '').toLowerCase() === lowerSlug);
	if (bySlug) return bySlug;

	const normQuery = normalizeWorldSearchText(clean);
	if (normQuery) {
		const byName = nodes.find((n) => normalizeWorldSearchText(n.name) === normQuery);
		if (byName) return byName;
	}

	return null;
}

/**
 * Filter world nodes by text query (name, slug, terrain, region, chapter) and kind filter.
 */
export function filterWorldNodes<
	T extends Pick<WorldNode, 'id' | 'slug' | 'name' | 'kind' | 'category' | 'terrain' | 'region' | 'chapters'>
>(
	nodes: T[],
	query: string,
	kindFilter: 'all' | 'region' | 'location' | 'character' = 'all'
): T[] {
	if (!Array.isArray(nodes)) return [];
	const normQ = normalizeWorldSearchText(query);

	return nodes.filter((node) => {
		if (kindFilter === 'region' && node.kind !== 'region') return false;
		if (kindFilter === 'character' && node.kind !== 'character') return false;
		if (
			kindFilter === 'location' &&
			(node.kind === 'region' || node.kind === 'character')
		) {
			return false;
		}

		if (!normQ) return true;

		if (normalizeWorldSearchText(node.name).includes(normQ)) return true;
		if (normalizeWorldSearchText(node.slug).includes(normQ)) return true;
		if (normalizeWorldSearchText(node.terrain).includes(normQ)) return true;
		if (normalizeWorldSearchText(node.region).includes(normQ)) return true;

		const chMatch = normQ.match(/^(?:ch(?:uong)?\.?\s*)?(\d+)$/);
		if (chMatch && Array.isArray(node.chapters)) {
			const chNum = Number(chMatch[1]);
			if (node.chapters.includes(chNum)) return true;
		}

		return false;
	});
}

/**
 * Project `(lat, lng)` in degrees (`[-90..90]`, `[-180..180]`) onto a 2D Equirectangular SVG canvas.
 */
export function latLngToSvgPoint(
	lat: number,
	lng: number,
	width = 1000,
	height = 500
): { x: number; y: number } {
	const clampedLat = Math.max(-90, Math.min(90, Number.isFinite(lat) ? lat : 0));
	const clampedLng = Math.max(-180, Math.min(180, Number.isFinite(lng) ? lng : 0));
	const x = ((clampedLng + 180) / 360) * width;
	const y = ((90 - clampedLat) / 180) * height;
	return {
		x: Math.round(x * 100) / 100,
		y: Math.round(y * 100) / 100
	};
}

/**
 * Convert a GeoJSON Polygon or MultiPolygon (`[lng, lat]` coordinates) into an SVG `<path d="...">` string.
 */
export function geoJsonGeometryToSvgPath(
	geometry:
		| {
				type: 'Polygon' | 'MultiPolygon';
				coordinates: number[][][] | number[][][][];
		  }
		| null
		| undefined,
	width = 1000,
	height = 500
): string {
	if (!geometry || !Array.isArray(geometry.coordinates)) return '';

	const ringToPath = (ring: number[][]): string => {
		if (!Array.isArray(ring) || ring.length < 2) return '';
		const commands: string[] = [];
		for (let i = 0; i < ring.length; i++) {
			const pt = ring[i];
			if (!Array.isArray(pt) || pt.length < 2) continue;
			const { x, y } = latLngToSvgPoint(pt[1], pt[0], width, height);
			commands.push(`${commands.length === 0 ? 'M' : 'L'}${x},${y}`);
		}
		if (commands.length < 2) return '';
		return `${commands.join(' ')} Z`;
	};

	if (geometry.type === 'Polygon') {
		const rings = geometry.coordinates as number[][][];
		return rings.map(ringToPath).filter(Boolean).join(' ');
	}

	if (geometry.type === 'MultiPolygon') {
		const polygons = geometry.coordinates as number[][][][];
		const parts: string[] = [];
		for (const poly of polygons) {
			if (!Array.isArray(poly)) continue;
			for (const ring of poly) {
				const d = ringToPath(ring);
				if (d) parts.push(d);
			}
		}
		return parts.join(' ');
	}

	return '';
}

/**
 * Read highest local reading progress chapter number from `localStorage` (`selorson_read_chapters_v1`),
 * matching the Spoiler Shield in `/library` so guests and offline readers unlock map nodes accurately.
 */
export function getLocalHighestReadChapter(): number {
	if (typeof window === 'undefined') return 0;
	let maxCh = 0;
	for (const storageKey of ['selorson_reading_progress', 'selorson_read_chapters_v1']) {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) continue;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					const n = typeof item === 'number' ? item : Number(item?.chapter_number || 0);
					if (Number.isFinite(n) && n > maxCh) maxCh = n;
				}
			} else if (parsed && typeof parsed === 'object') {
				for (const [k, v] of Object.entries(parsed)) {
					const n = Number((v as { chapter_number?: number })?.chapter_number ?? k);
					if (Number.isFinite(n) && n > maxCh) maxCh = n;
				}
			}
		} catch {
			// Ignore malformed storage entry
		}
	}
	return maxCh;
}
