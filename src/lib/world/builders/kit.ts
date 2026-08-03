/**
 * Kit-bash construction: buildings and terrain assembled from primitives.
 *
 * Forty-odd places cannot each get a hand-modelled asset, and waiting for them
 * would block the whole map. Instead each place declares a `terrain` and a
 * palette, and a builder grows a diorama from that — seeded by the item id, so
 * two castles differ but the same castle is identical on every visit.
 *
 * A hand-made `.glb` always wins when the database supplies one; these builders
 * are what fills the map until then.
 */

import {
	BoxGeometry,
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	SphereGeometry,
	TorusGeometry,
	Euler,
	Quaternion,
	Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Deterministic PRNG so a place looks the same on every visit. */
export function seededRandom(seed: number): () => number {
	let a = (seed | 0) + 0x6d2b79f5;
	return () => {
		a = Math.imul(a ^ (a >>> 15), a | 1);
		a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
		return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
	};
}

export interface MaterialSpec {
	color: string;
	roughness?: number;
	metalness?: number;
	emissive?: string;
	emissiveIntensity?: number;
}

interface Placement {
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: [number, number, number] | number;
}

/**
 * Accumulates primitives per material and merges them at the end, so a diorama
 * of thirty blocks costs three or four draw calls instead of thirty.
 */
export class Kit {
	private buckets = new Map<string, { spec: MaterialSpec; geometries: BufferGeometry[] }>();

	add(geometry: BufferGeometry, materialKey: string, spec: MaterialSpec, at: Placement = {}) {
		const geo = geometry.clone();
		const scale =
			typeof at.scale === 'number'
				? new Vector3(at.scale, at.scale, at.scale)
				: new Vector3(...(at.scale ?? [1, 1, 1]));
		const matrix = new Matrix4().compose(
			new Vector3(...(at.position ?? [0, 0, 0])),
			new Quaternion().setFromEuler(new Euler(...(at.rotation ?? [0, 0, 0]))),
			scale
		);
		geo.applyMatrix4(matrix);

		let bucket = this.buckets.get(materialKey);
		if (!bucket) {
			bucket = { spec, geometries: [] };
			this.buckets.set(materialKey, bucket);
		}
		bucket.geometries.push(geo);
		return this;
	}

	build(): Group {
		const group = new Group();
		for (const [key, bucket] of this.buckets) {
			const merged = mergeGeometries(bucket.geometries, false);
			if (!merged) continue;
			merged.computeVertexNormals();
			const material = new MeshStandardMaterial({
				color: new Color(bucket.spec.color),
				roughness: bucket.spec.roughness ?? 0.75,
				metalness: bucket.spec.metalness ?? 0.05,
				emissive: bucket.spec.emissive ? new Color(bucket.spec.emissive) : undefined,
				emissiveIntensity: bucket.spec.emissiveIntensity ?? 1
			});
			const mesh = new Mesh(merged, material);
			mesh.name = key;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			group.add(mesh);
			for (const geo of bucket.geometries) geo.dispose();
		}
		return group;
	}
}

/** Free every geometry and material under a built diorama. */
export function disposeGroup(group: Group) {
	group.traverse((child) => {
		if (child instanceof Mesh) {
			child.geometry.dispose();
			const material = child.material;
			if (Array.isArray(material)) material.forEach((mm) => mm.dispose());
			else material.dispose();
		}
	});
}

// Unit primitives, cloned by `Kit.add` — created once per module, never mutated.
export const UNIT = {
	box: new BoxGeometry(1, 1, 1),
	cone: new ConeGeometry(0.5, 1, 8),
	coneSharp: new ConeGeometry(0.5, 1, 5),
	cylinder: new CylinderGeometry(0.5, 0.5, 1, 10),
	taper: new CylinderGeometry(0.34, 0.5, 1, 8),
	sphere: new SphereGeometry(0.5, 10, 8),
	torus: new TorusGeometry(0.5, 0.12, 6, 16)
};

/** Palette with sane defaults, so an item with no palette still builds. */
export function palette(colors: string[] | undefined, fallback: string[]): string[] {
	if (!colors || colors.length === 0) return fallback;
	return [...colors, ...fallback].slice(0, Math.max(fallback.length, colors.length));
}
