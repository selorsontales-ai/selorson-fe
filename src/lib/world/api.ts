/**
 * World data access. Thin wrappers over the shared `api()` client so the world
 * inherits token refresh and error shapes from the rest of the app.
 */

import { api } from '$lib/api';
import { REGION_GEOMETRY_URL } from './config';
import type { Journey, RegionDetail, WorldMap, WorldNode } from './types';

/** The whole map in one request — regions, places, characters, reveal state. */
export async function fetchWorld(): Promise<WorldMap> {
	const res = await api<WorldMap>('/world');
	return res.data;
}

export async function fetchRegion(slug: string): Promise<RegionDetail> {
	const res = await api<RegionDetail>(`/world/regions/${encodeURIComponent(slug)}`);
	return res.data;
}

export async function fetchJourney(characterId: number): Promise<Journey> {
	const res = await api<Journey>(`/world/journey/${characterId}`);
	return res.data;
}

/**
 * Minimal GeoJSON we care about: a named polygon set per region.
 * `region` matches the slug of a `kind: "region"` library item.
 */
export interface RegionFeature {
	type: 'Feature';
	properties: { region: string; name?: string };
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

/**
 * Region outlines, fetched at runtime rather than bundled.
 *
 * Missing geometry is not an error: the world still renders as markers on the
 * globe and as a marker field in a region. That keeps the map usable while the
 * outlines are still being drawn.
 */
export function fetchRegionGeometry(): Promise<RegionGeometry | null> {
	geometryCache ??= fetch(REGION_GEOMETRY_URL)
		.then((res) => (res.ok ? (res.json() as Promise<RegionGeometry>) : null))
		.catch(() => null);
	return geometryCache;
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
