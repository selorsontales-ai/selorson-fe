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

export interface AtlasRectBox {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	ownerId?: number;
}

export interface AtlasLabelPlacement {
	dx: number;
	dy: number;
	anchor: 'middle' | 'start' | 'end';
	text: string;
	leader: boolean;
	box: AtlasRectBox;
}

/**
 * Deterministic greedy cartographic label placement for `WorldAtlas2D.svelte`:
 * guarantees zero overlapping SVG labels at 100% zoom (`zoom = 1`) by reserving pin discs
 * and testing 10–12 radial candidate positions around each node.
 */
export function computeAtlasLabelPlacements(params: {
	regions: Array<WorldNode & { lat: number; lng: number }>;
	locations: Array<WorldNode & { lat: number; lng: number }>;
	zoom?: number;
	mapWidth?: number;
	mapHeight?: number;
	activeIds?: Set<number>;
	unknownFallback?: string;
}): Map<number, AtlasLabelPlacement> {
	const {
		regions,
		locations,
		zoom = 1,
		mapWidth = 1000,
		mapHeight = 500,
		activeIds = new Set<number>(),
		unknownFallback = 'Unknown'
	} = params;

	const scale = 1 / Math.pow(Math.max(1, zoom), 0.55);
	const occupied: AtlasRectBox[] = [];
	const result = new Map<number, AtlasLabelPlacement>();

	for (const reg of regions) {
		const pt = latLngToSvgPoint(reg.lat, reg.lng, mapWidth, mapHeight);
		const r = 13 * scale;
		occupied.push({ x0: pt.x - r, y0: pt.y - r, x1: pt.x + r, y1: pt.y + r, ownerId: reg.id });
	}
	for (const loc of locations) {
		const pt = latLngToSvgPoint(loc.lat, loc.lng, mapWidth, mapHeight);
		const r = 7 * scale;
		occupied.push({ x0: pt.x - r, y0: pt.y - r, x1: pt.x + r, y1: pt.y + r, ownerId: loc.id });
	}

	type CandidateItem = {
		node: WorldNode & { lat: number; lng: number };
		isRegion: boolean;
		isActive: boolean;
		priority: number;
	};

	const items: CandidateItem[] = [];
	for (const reg of regions) {
		const isActive = activeIds.has(reg.id);
		items.push({
			node: reg,
			isRegion: true,
			isActive,
			priority: isActive ? 0 : 1
		});
	}
	for (const loc of locations) {
		const isActive = activeIds.has(loc.id);
		if (!isActive && !isUnlockedState(loc.state)) continue;
		items.push({
			node: loc,
			isRegion: false,
			isActive,
			priority: isActive ? 0 : loc.is_singularity ? 2 : 3
		});
	}

	items.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		if (b.node.lat !== a.node.lat) return b.node.lat - a.node.lat;
		return a.node.lng - b.node.lng;
	});

	const regionCandidates: Array<[number, number, 'middle' | 'start' | 'end']> = [
		[0, 25, 'middle'],
		[0, -18, 'middle'],
		[18, 4, 'start'],
		[-18, 4, 'end'],
		[16, 21, 'start'],
		[-16, 21, 'end'],
		[16, -15, 'start'],
		[-16, -15, 'end'],
		[0, 39, 'middle'],
		[0, -32, 'middle'],
		[28, 15, 'start'],
		[-28, 15, 'end']
	];

	const locCandidates: Array<[number, number, 'middle' | 'start' | 'end']> = [
		[0, -12, 'middle'],
		[0, 19, 'middle'],
		[11, 4, 'start'],
		[-11, 4, 'end'],
		[10, -10, 'start'],
		[-10, -10, 'end'],
		[10, 16, 'start'],
		[-10, 16, 'end'],
		[0, -25, 'middle'],
		[0, 31, 'middle']
	];

	function computeTextBox(
		px: number,
		py: number,
		dx: number,
		dy: number,
		anchor: 'middle' | 'start' | 'end',
		w: number,
		h: number
	): AtlasRectBox {
		const tx = px + dx;
		const ty = py + dy;
		const x0 = anchor === 'middle' ? tx - w * 0.5 : anchor === 'start' ? tx : tx - w;
		return {
			x0: x0 - 4 * scale,
			y0: ty - h * 0.82 - 2 * scale,
			x1: x0 + w + 4 * scale,
			y1: ty + h * 0.24 + 2 * scale
		};
	}

	function overlapArea(a: AtlasRectBox, b: AtlasRectBox): number {
		const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
		const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
		return ox * oy;
	}

	for (const item of items) {
		const { node, isRegion, isActive } = item;
		const pt = latLngToSvgPoint(node.lat, node.lng, mapWidth, mapHeight);
		const labelName = isUnlockedState(node.state) ? (node.name ?? unknownFallback) : unknownFallback;
		const text = `${isExploredState(node.state) ? '✓ ' : ''}${labelName}`;
		const charW = (isRegion ? 6.8 : isActive ? 6.5 : 5.9) * scale;
		const estW = Math.max(24 * scale, text.length * charW);
		const estH = (isRegion ? 14.5 : 13.0) * scale;
		const candidates = isRegion ? regionCandidates : locCandidates;

		let chosen: { dx: number; dy: number; anchor: 'middle' | 'start' | 'end'; box: AtlasRectBox } | null =
			null;
		let bestFallback: {
			dx: number;
			dy: number;
			anchor: 'middle' | 'start' | 'end';
			box: AtlasRectBox;
			penalty: number;
		} | null = null;

		for (const [rawDx, rawDy, anchor] of candidates) {
			const dx = rawDx * scale;
			const dy = rawDy * scale;
			const box = computeTextBox(pt.x, pt.y, dx, dy, anchor, estW, estH);
			const outOfBounds =
				box.x0 < 8 || box.y0 < 8 || box.x1 > mapWidth - 8 || box.y1 > mapHeight - 14;

			let penalty = outOfBounds ? 5000 : 0;
			for (const occ of occupied) {
				if (occ.ownerId === node.id) continue;
				penalty += overlapArea(box, occ);
			}

			if (penalty === 0) {
				chosen = { dx, dy, anchor, box };
				break;
			}
			if (!bestFallback || penalty < bestFallback.penalty) {
				bestFallback = { dx, dy, anchor, box, penalty };
			}
		}

		if (!chosen && isActive && bestFallback) {
			chosen = bestFallback;
		}

		if (chosen) {
			occupied.push(chosen.box);
			result.set(node.id, {
				dx: chosen.dx,
				dy: chosen.dy,
				anchor: chosen.anchor,
				text,
				leader: Math.hypot(chosen.dx, chosen.dy) > 27 * scale,
				box: chosen.box
			});
		}
	}

	return result;
}

