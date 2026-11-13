/**
 * World data access. Thin wrappers over the shared `api()` client so the world
 * inherits token refresh and error shapes from the rest of the app.
 */

import { api } from '$lib/api';
import { PROCEDURAL_WORLD_DATA, REGION_GEOMETRY_URL } from './config';
import type {
	Journey,
	LocationDetail,
	RegionDetail,
	WorldChunkNode,
	WorldMap,
	WorldNode
} from './types';
import { getLocalHighestReadChapter } from './world-utils';

function withProgressQuery(path: string): string {
	const localMax = getLocalHighestReadChapter();
	if (localMax > 0) {
		const sep = path.includes('?') ? '&' : '?';
		return `${path}${sep}read_up_to=${localMax}`;
	}
	return path;
}

/** The whole map in one request — regions, places, characters, reveal state. */
export async function fetchWorld(): Promise<WorldMap> {
	const res = await api<WorldMap>(withProgressQuery('/world'));
	return res.data;
}

export async function fetchRegion(slug: string): Promise<RegionDetail> {
	const res = await api<RegionDetail>(
		withProgressQuery(`/world/regions/${encodeURIComponent(slug)}`)
	);
	return res.data;
}

/** `key` is the slug from the URL, or the numeric id when one is to hand. */
export async function fetchLocation(key: string | number): Promise<LocationDetail> {
	const res = await api<LocationDetail>(
		withProgressQuery(`/world/locations/${encodeURIComponent(String(key))}`)
	);
	return res.data;
}

export async function fetchJourney(characterId: number): Promise<Journey> {
	const res = await api<Journey>(withProgressQuery(`/world/journey/${characterId}`));
	return res.data;
}

export interface WorldPacksCatalog {
	packs: WorldNode[];
	read_up_to: number | null;
}

/** Spoiler-safe catalog of locations carrying Desktop 3D Packs, VN episodes, or Intro Videos. */
export async function fetchWorldPacks(): Promise<WorldPacksCatalog> {
	const res = await api<WorldPacksCatalog>(withProgressQuery('/world/packs'));
	return res.data;
}

export interface WorldChunksCatalog {
	chunks: WorldChunkNode[];
	read_up_to: number | null;
}

/** Spoiler-safe manifest of seamless Open-World terrain chunks (`⚔️ Thế Giới Mở`) for Selorson Desktop. */
export async function fetchWorldChunks(): Promise<WorldChunksCatalog> {
	const res = await api<WorldChunksCatalog>(withProgressQuery('/world/chunks'));
	return res.data;
}

/**
 * Record that the reader walked into a place, upgrading it to `explored`.
 *
 * Best-effort: a guest, an expired session or an un-migrated database all mean
 * the badge is not awarded, which must never interrupt the visit itself.
 */
export async function markVisited(libraryItemId: number): Promise<boolean> {
	if (typeof localStorage !== 'undefined' && Number.isFinite(libraryItemId) && libraryItemId > 0) {
		try {
			const raw = localStorage.getItem('selorson:world-visited-ids');
			const list: number[] = raw ? JSON.parse(raw) : [];
			const normalized = Array.isArray(list)
				? list.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
				: [];
			if (!normalized.includes(libraryItemId)) {
				normalized.push(libraryItemId);
				localStorage.setItem('selorson:world-visited-ids', JSON.stringify(normalized));
			}
		} catch {
			// ignore storage quota errors
		}
	}
	try {
		const localMax = getLocalHighestReadChapter();
		await api('/world/visited', {
			method: 'POST',
			body: {
				library_item_id: libraryItemId,
				...(localMax > 0 ? { read_up_to: localMax } : {})
			}
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Minimal GeoJSON we care about: a named polygon set per region.
 * `region` matches the slug of a `kind: "region"` library item.
 */
export interface RegionFeature {
	type: 'Feature';
	properties: { region: string; name?: string; color?: string | null };
	geometry: {
		type: 'Polygon' | 'MultiPolygon';
		/** Polygon: ring[][]; MultiPolygon: polygon[][][] — both as [lng, lat]. */
		coordinates: number[][][] | number[][][][];
	};
}

export interface RegionGeometry {
	type: 'FeatureCollection';
	features: RegionFeature[];
}

let geometryCache: Promise<RegionGeometry | null> | null = null;

async function loadGeometry(): Promise<RegionGeometry | null> {
	try {
		const res = await fetch(REGION_GEOMETRY_URL);
		return res.ok ? ((await res.json()) as RegionGeometry) : null;
	} catch {
		return null;
	}
}

/**
 * Region outlines, fetched at runtime rather than bundled.
 *
 * Missing geometry is not an error: the world still renders as markers on the
 * globe and as a marker field in a region. That keeps the map usable while the
 * outlines are still being drawn.
 */
let earthContinentCache: Promise<RegionGeometry | null> | null = null;

async function loadEarthContinents(): Promise<RegionGeometry | null> {
	try {
		const res = await fetch(PROCEDURAL_WORLD_DATA.earth.continentsGeojson);
		return res.ok ? ((await res.json()) as RegionGeometry) : null;
	} catch {
		return null;
	}
}

export function fetchRegionGeometry(): Promise<RegionGeometry | null> {
	geometryCache ??= loadGeometry();
	return geometryCache;
}

export function fetchEarthContinentGeometry(): Promise<RegionGeometry | null> {
	earthContinentCache ??= loadEarthContinents();
	return earthContinentCache;
}

/** All rings of a feature, normalised to `[lng, lat][]` lists. */
export function featureRings(feature: RegionFeature): number[][][] {
	if (feature.geometry.type === 'Polygon') {
		return feature.geometry.coordinates as number[][][];
	}
	return (feature.geometry.coordinates as number[][][][]).flat();
}

/** Nodes that can actually be drawn — hidden ones keep their slot but no data. */
export function isPlaced(node: WorldNode): node is WorldNode & { lat: number; lng: number } {
	return typeof node.lat === 'number' && typeof node.lng === 'number';
}

/** Display name that never leaks an unread place. */
export function displayName(node: WorldNode, unknownLabel: string): string {
	return node.name ?? unknownLabel;
}
