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
	Box3,
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
 *
 * Primitives are also tagged with a *part* — the roof, the towers, the moat.
 * Parts survive the merge as named child groups, which is what makes a diorama
 * take apart: the exploded view moves whole parts, not individual blocks.
 */
export class Kit {
	private buckets = new Map<
		string,
		{ part: string; material: string; spec: MaterialSpec; geometries: BufferGeometry[] }
	>();
	/** Insertion order, so a castle disassembles roof-first rather than at random. */
	private partOrder: string[] = [];

	add(
		geometry: BufferGeometry,
		materialKey: string,
		spec: MaterialSpec,
		at: Placement = {},
		part = 'body'
	) {
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

		const key = `${part}::${materialKey}`;
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = { part, material: materialKey, spec, geometries: [] };
			this.buckets.set(key, bucket);
			if (!this.partOrder.includes(part)) this.partOrder.push(part);
		}
		bucket.geometries.push(geo);
		return this;
	}

	build(): Group {
		const root = new Group();
		const parts = new Map<string, Group>();

		for (const part of this.partOrder) {
			const group = new Group();
			group.name = part;
			group.userData.part = part;
			parts.set(part, group);
			root.add(group);
		}

		for (const bucket of this.buckets.values()) {
			const merged = mergeGeometries(bucket.geometries, false);
			for (const geo of bucket.geometries) geo.dispose();
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
			mesh.name = `${bucket.part}:${bucket.material}`;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			parts.get(bucket.part)?.add(mesh);
		}

		return root;
	}
}

/** One named, separable piece of a diorama. */
export interface DioramaPart {
	id: string;
	group: Group;
	/** Offset applied at full disassembly. */
	dir: Vector3;
	/** Local centre, used to anchor the label callout. */
	center: Vector3;
}

/**
 * Read the parts back off a built diorama and work out how each should fly
 * apart.
 *
 * Directions are derived from geometry rather than authored, so every place
 * takes apart sensibly the moment it exists — a roof rises clear of the keep it
 * sits on, side towers drift outward, the foundation barely moves. An author
 * who wants a specific motion overrides it in `extra_data.world.parts`.
 */
export function describeParts(root: Group): DioramaPart[] {
	const rootBox = new Box3().setFromObject(root);
	const rootCenter = rootBox.getCenter(new Vector3());
	const baseY = rootBox.min.y;

	return root.children
		.filter((child): child is Group => child instanceof Group)
		.map((group) => {
			const box = new Box3().setFromObject(group);
			const center = box.getCenter(new Vector3());
			const dx = center.x - rootCenter.x;
			const dz = center.z - rootCenter.z;
			return {
				id: group.userData.part ?? group.name,
				group,
				center,
				// Height above the base dominates: the piece that sits on top is
				// the piece that has to come off first.
				dir: new Vector3(dx * 0.6, (center.y - baseY) * 1.9 + 0.45, dz * 0.6)
			};
		});
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
