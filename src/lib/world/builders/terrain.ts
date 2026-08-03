/**
 * Region ground: an extruded slab cut to the region's outline.
 *
 * Outlines arrive as GeoJSON at runtime (see `config.REGION_GEOMETRY_URL`), so
 * redrawing the world's borders is a file swap. When no outline exists for a
 * region the scene falls back to a disc — the places still stand in the right
 * relative positions, the coastline is just missing.
 */

import { ExtrudeGeometry, Shape, CircleGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RegionProjection } from '../projection';

export const GROUND_DEPTH = 0.55;

/**
 * Build the slab for one region.
 *
 * Rings are `[lng, lat]` pairs. Each ring becomes its own extruded shape rather
 * than one shape with holes: island chains are common in this world and holes
 * would swallow them.
 */
export function buildRegionGround(
	rings: number[][][],
	projection: RegionProjection
): BufferGeometry | null {
	const parts: BufferGeometry[] = [];

	for (const ring of rings) {
		if (ring.length < 3) continue;
		const shape = new Shape();
		ring.forEach(([lng, lat], index) => {
			const p = projection.project(lat, lng);
			// Extrude builds on XY then we lay it flat, so Z becomes the map's Y.
			if (index === 0) shape.moveTo(p.x, -p.z);
			else shape.lineTo(p.x, -p.z);
		});
		shape.closePath();

		const geometry = new ExtrudeGeometry(shape, {
			depth: GROUND_DEPTH,
			bevelEnabled: true,
			bevelThickness: 0.04,
			bevelSize: 0.03,
			bevelSegments: 1,
			curveSegments: 1
		});
		geometry.rotateX(-Math.PI / 2);
		parts.push(geometry);
	}

	if (parts.length === 0) return null;
	const merged = mergeGeometries(parts, false);
	parts.forEach((p) => p.dispose());
	if (!merged) return null;
	merged.computeVertexNormals();
	return merged;
}

/** Featureless ground for a region with no outline drawn yet. */
export function buildFallbackGround(radius: number): BufferGeometry {
	const geometry = new CircleGeometry(radius, 48);
	geometry.rotateX(-Math.PI / 2);
	return geometry;
}
