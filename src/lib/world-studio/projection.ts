/**
 * Canvas ↔ geographic coordinates.
 *
 * The map canvas uses the *same* equirectangular projection as the globe
 * texture, at the texture's own pixel size. That is the whole point: a point
 * clicked here lands in exactly the same place in the 3D world. Using the
 * square poster artwork instead would look right and be wrong.
 */

/** Matches `static/world/textures/akunalia-color-4k.jpg` (2:1 equirectangular). */
export const MAP_WIDTH = 4096;
export const MAP_HEIGHT = 2048;

export interface Point {
	x: number;
	y: number;
}

export function lngLatToXY(lng: number, lat: number): Point {
	return {
		x: ((lng + 180) / 360) * MAP_WIDTH,
		y: ((90 - lat) / 180) * MAP_HEIGHT
	};
}

export function xyToLngLat(x: number, y: number): { lng: number; lat: number } {
	return {
		lng: (x / MAP_WIDTH) * 360 - 180,
		lat: 90 - (y / MAP_HEIGHT) * 180
	};
}

/** Clamp to the world so a stray drag cannot park something off the planet. */
export function clampLngLat(lng: number, lat: number): { lng: number; lat: number } {
	return {
		lng: Math.max(-180, Math.min(180, lng)),
		lat: Math.max(-90, Math.min(90, lat))
	};
}

/** Round for display and storage — sub-metre precision is noise here. */
export function round(value: number, places = 4): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

/** Screen-space path for a ring of `[lng, lat]` pairs. */
export function ringToPath(ring: number[][]): string {
	if (ring.length === 0) return '';
	const points = ring.map(([lng, lat]) => lngLatToXY(lng, lat));
	const [first, ...rest] = points;
	return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
}

/** Centroid of a ring, for labelling a region. */
export function ringCentroid(ring: number[][]): Point {
	if (ring.length === 0) return { x: 0, y: 0 };
	let x = 0;
	let y = 0;
	for (const [lng, lat] of ring) {
		const p = lngLatToXY(lng, lat);
		x += p.x;
		y += p.y;
	}
	return { x: x / ring.length, y: y / ring.length };
}
