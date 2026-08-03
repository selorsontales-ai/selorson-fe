/**
 * Map coordinates to scene space.
 *
 * Akunalia is authored as an equirectangular map, so the same lat/lng pair
 * addresses a point on the globe (L1) and a point on a flat region diorama
 * (L2). Keeping both projections here is what lets the camera hand off between
 * the two layers without the reader noticing a cut.
 */

import { Vector3 } from 'three';

/**
 * Surface point on the globe.
 *
 * `alt` is in planet radii, so a floating region sits genuinely above the
 * terrain rather than being painted onto it: Skyland at `+0.18` is a real
 * 18%-of-a-radius climb, and casts down onto the ground below.
 */
export function latLngToVector3(lat: number, lng: number, radius: number, alt = 0): Vector3 {
	const phi = (90 - lat) * (Math.PI / 180);
	const theta = (lng + 180) * (Math.PI / 180);
	const r = radius * (1 + alt);
	return new Vector3(
		-(r * Math.sin(phi) * Math.cos(theta)),
		r * Math.cos(phi),
		r * Math.sin(phi) * Math.sin(theta)
	);
}

/** Outward surface normal at a coordinate — markers stand up along it. */
export function surfaceNormal(lat: number, lng: number): Vector3 {
	return latLngToVector3(lat, lng, 1, 0).normalize();
}

/**
 * A great-circle path between two points, bowed outward so it reads as travel
 * rather than a chord through the planet. Used for character journeys.
 */
export function arcPoints(
	from: { lat: number; lng: number; alt?: number },
	to: { lat: number; lng: number; alt?: number },
	radius: number,
	segments = 64
): Vector3[] {
	const a = latLngToVector3(from.lat, from.lng, radius, from.alt ?? 0);
	const b = latLngToVector3(to.lat, to.lng, radius, to.alt ?? 0);
	// Longer hops arc higher, so a trip across the world looks like one.
	const spread = a.distanceTo(b) / (radius * 2);
	const lift = radius * (0.06 + spread * 0.35);

	const points: Vector3[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const point = new Vector3().lerpVectors(a, b, t).normalize();
		point.multiplyScalar(radius + lift * Math.sin(t * Math.PI));
		points.push(point);
	}
	return points;
}

/**
 * Flatten a region onto a local ground plane for the L2 diorama.
 *
 * Longitude is scaled by cos(latitude) so shapes near the poles are not
 * stretched — the same correction `vietnam-3d-map` applies to its provinces.
 */
export interface RegionProjection {
	/** Scene-space position for a coordinate inside this region. */
	project(lat: number, lng: number, alt?: number): Vector3;
	/** Half-extent of the region in scene units, for framing the camera. */
	radius: number;
}

export function regionProjection(
	center: { lat: number; lng: number },
	scale = 9
): RegionProjection {
	const k = Math.cos((center.lat * Math.PI) / 180);
	return {
		project(lat, lng, alt = 0) {
			return new Vector3(
				(lng - center.lng) * k * scale,
				// Region altitude uses the same unit as the globe, re-based to
				// diorama scale so a floating region stays floating here too.
				alt * scale * 12,
				-(lat - center.lat) * scale
			);
		},
		radius: scale
	};
}

/** Centroid of a set of coordinates — used to frame a region we have no centre for. */
export function centroidOf(points: Array<{ lat: number; lng: number }>): {
	lat: number;
	lng: number;
} {
	if (points.length === 0) return { lat: 0, lng: 0 };
	let lat = 0;
	let lng = 0;
	for (const p of points) {
		lat += p.lat;
		lng += p.lng;
	}
	return { lat: lat / points.length, lng: lng / points.length };
}
