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

