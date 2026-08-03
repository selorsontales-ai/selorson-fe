/**
 * The terrain builders.
 *
 * Each takes a seed and a palette and returns a diorama roughly two units wide
 * and one to three tall, standing on y = 0. Adding a new landscape type means
 * adding one function here and typing its name into `terrain` in admin —
 * no other file changes.
 */

import { Group } from 'three';
import type { TerrainKind } from '../terrains';
import { Kit, UNIT, palette, seededRandom, type MaterialSpec } from './kit';

export interface BuildOptions {
	/** Item id — same id, same diorama, every time. */
	seed: number;
	/** `extra_data.world.palette`, if the author set one. */
	colors?: string[];
	scale?: number;
}

type Builder = (options: BuildOptions) => Group;

const mat = (color: string, extra: Partial<MaterialSpec> = {}): MaterialSpec => ({
	color,
	roughness: 0.78,
	metalness: 0.04,
	...extra
});

// ── castle ────────────────────────────────────────────────────────────────
const castle: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [stone, roof, accent] = palette(colors, ['#cbd5e1', '#0f766e', '#ffb703']);
	const kit = new Kit();

	kit.add(UNIT.box, 'stone', mat(stone), { position: [0, 0.18, 0], scale: [2.2, 0.36, 2.2] });

	const towers = 3 + Math.floor(rnd() * 3);
	const keepHeight = 1.1 + rnd() * 0.8;
	kit.add(UNIT.box, 'stone', mat(stone), {
		position: [0, 0.36 + keepHeight / 2, 0],
		scale: [0.9, keepHeight, 0.9]
	});
	kit.add(UNIT.coneSharp, 'roof', mat(roof, { roughness: 0.5 }), {
		position: [0, 0.36 + keepHeight + 0.34, 0],
		scale: [1.35, 0.7, 1.35]
	});

	for (let i = 0; i < towers; i++) {
		const angle = (i / towers) * Math.PI * 2 + rnd() * 0.4;
		const radius = 0.78 + rnd() * 0.18;
		const height = 0.6 + rnd() * 0.55;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		kit.add(UNIT.cylinder, 'stone', mat(stone), {
			position: [x, 0.36 + height / 2, z],
			scale: [0.34, height, 0.34]
		});
		kit.add(UNIT.coneSharp, 'roof', mat(roof, { roughness: 0.5 }), {
			position: [x, 0.36 + height + 0.22, z],
			scale: [0.5, 0.45, 0.5]
		});
	}

	// Banner finial — the one bright note that reads at globe distance.
	kit.add(UNIT.sphere, 'accent', mat(accent, { metalness: 0.5, roughness: 0.3 }), {
		position: [0, 0.36 + keepHeight + 0.75, 0],
		scale: 0.16
	});

	return kit.build();
};

// ── forest ────────────────────────────────────────────────────────────────
const forest: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [leaf, trunk, ground] = palette(colors, ['#2f7d32', '#5b4636', '#3f6b3a']);
	const kit = new Kit();

	kit.add(UNIT.cylinder, 'ground', mat(ground), { position: [0, 0.06, 0], scale: [2.2, 0.12, 2.2] });

	const trees = 14 + Math.floor(rnd() * 10);
	for (let i = 0; i < trees; i++) {
		const angle = rnd() * Math.PI * 2;
		const radius = rnd() * 0.95;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		const height = 0.45 + rnd() * 0.5;
		kit.add(UNIT.cylinder, 'trunk', mat(trunk), {
			position: [x, 0.12 + height * 0.3, z],
			scale: [0.075, height * 0.6, 0.075]
		});
		// Two stacked cones give a conifer silhouette for the price of two boxes.
		kit.add(UNIT.cone, 'leaf', mat(leaf), {
			position: [x, 0.12 + height * 0.72, z],
			scale: [0.46, height * 0.72, 0.46]
		});
		kit.add(UNIT.cone, 'leaf', mat(leaf), {
			position: [x, 0.12 + height * 1.05, z],
			scale: [0.34, height * 0.55, 0.34]
		});
	}
	return kit.build();
};

// ── dead_forest ───────────────────────────────────────────────────────────
const deadForest: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [bark, ground, glow] = palette(colors, ['#1b1b1f', '#14161a', '#2fe36b']);
	const kit = new Kit();

	kit.add(UNIT.cylinder, 'ground', mat(ground, { roughness: 0.95 }), {
		position: [0, 0.06, 0],
		scale: [2.2, 0.12, 2.2]
	});

	const trees = 10 + Math.floor(rnd() * 8);
	for (let i = 0; i < trees; i++) {
		const angle = rnd() * Math.PI * 2;
		const radius = rnd() * 0.95;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		const height = 0.6 + rnd() * 0.7;
		// Leaning, branching, leafless — the shape carries the mood, not the colour.
		const lean = (rnd() - 0.5) * 0.5;
		kit.add(UNIT.taper, 'bark', mat(bark, { roughness: 0.95 }), {
			position: [x, 0.12 + height / 2, z],
			rotation: [lean * 0.3, angle, lean],
			scale: [0.09, height, 0.09]
		});
		const branches = 2 + Math.floor(rnd() * 3);
		for (let b = 0; b < branches; b++) {
			const ba = rnd() * Math.PI * 2;
			kit.add(UNIT.taper, 'bark', mat(bark, { roughness: 0.95 }), {
				position: [
					x + Math.cos(ba) * 0.13,
					0.12 + height * (0.6 + rnd() * 0.35),
					z + Math.sin(ba) * 0.13
				],
				rotation: [Math.PI / 2.6, ba, 0],
				scale: [0.045, 0.3 + rnd() * 0.2, 0.045]
			});
		}
	}

	// Cursed rivulets — glowing veins across the ground.
	const veins = 3 + Math.floor(rnd() * 3);
	for (let i = 0; i < veins; i++) {
		const angle = rnd() * Math.PI * 2;
		kit.add(UNIT.box, 'glow', mat(glow, { emissive: glow, emissiveIntensity: 2.2, roughness: 1 }), {
			position: [Math.cos(angle) * 0.4, 0.125, Math.sin(angle) * 0.4],
			rotation: [0, angle, 0],
			scale: [0.06, 0.01, 0.9 + rnd() * 0.6]
		});
	}
	return kit.build();
};

// ── ruins ─────────────────────────────────────────────────────────────────
const ruins: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [stone, ground] = palette(colors, ['#9aa3ad', '#4b5563']);
	const kit = new Kit();

	kit.add(UNIT.cylinder, 'ground', mat(ground), { position: [0, 0.06, 0], scale: [2.1, 0.12, 2.1] });

	const columns = 5 + Math.floor(rnd() * 5);
	for (let i = 0; i < columns; i++) {
		const angle = (i / columns) * Math.PI * 2;
		const radius = 0.6 + rnd() * 0.25;
		// Broken columns: each snapped at a different height.
		const height = 0.3 + rnd() * 0.85;
		kit.add(UNIT.cylinder, 'stone', mat(stone), {
			position: [Math.cos(angle) * radius, 0.12 + height / 2, Math.sin(angle) * radius],
			rotation: [(rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12],
			scale: [0.16, height, 0.16]
		});
	}
	// A fallen lintel across the middle.
	kit.add(UNIT.box, 'stone', mat(stone), {
		position: [0, 0.19, 0],
		rotation: [0, rnd() * Math.PI, 0.08],
		scale: [1.1, 0.13, 0.22]
	});
	return kit.build();
};

// ── volcano ───────────────────────────────────────────────────────────────
const volcano: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [rock, lava] = palette(colors, ['#3a2b28', '#ff4d1c']);
	const kit = new Kit();
	const height = 1.5 + rnd() * 0.7;

	kit.add(UNIT.cone, 'rock', mat(rock, { roughness: 0.95 }), {
		position: [0, height / 2, 0],
		scale: [2.4, height, 2.4]
	});
	// Crater glow sits just below the truncated tip.
	kit.add(UNIT.cylinder, 'lava', mat(lava, { emissive: lava, emissiveIntensity: 2.6, roughness: 1 }), {
		position: [0, height * 0.95, 0],
		scale: [0.3, 0.08, 0.3]
	});
	const flows = 2 + Math.floor(rnd() * 3);
	for (let i = 0; i < flows; i++) {
		const angle = rnd() * Math.PI * 2;
		kit.add(
			UNIT.box,
			'lava',
			mat(lava, { emissive: lava, emissiveIntensity: 1.6, roughness: 1 }),
			{
				position: [Math.cos(angle) * 0.4, height * 0.5, Math.sin(angle) * 0.4],
				rotation: [0.55, angle, 0],
				scale: [0.09, 0.02, height * 0.95]
			}
		);
	}
	return kit.build();
};

// ── ice_peak ──────────────────────────────────────────────────────────────
const icePeak: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [ice, snow] = palette(colors, ['#9fd8ee', '#eef7fb']);
	const kit = new Kit();

	const peaks = 3 + Math.floor(rnd() * 3);
	for (let i = 0; i < peaks; i++) {
		const angle = (i / peaks) * Math.PI * 2 + rnd() * 0.5;
		const radius = i === 0 ? 0 : 0.5 + rnd() * 0.4;
		const height = (i === 0 ? 1.7 : 0.8) + rnd() * 0.6;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		kit.add(UNIT.coneSharp, 'ice', mat(ice, { roughness: 0.35, metalness: 0.1 }), {
			position: [x, height / 2, z],
			rotation: [0, rnd() * Math.PI, 0],
			scale: [1.1 - i * 0.12, height, 1.1 - i * 0.12]
		});
		kit.add(UNIT.coneSharp, 'snow', mat(snow, { roughness: 0.55 }), {
			position: [x, height * 0.86, z],
			rotation: [0, rnd() * Math.PI, 0],
			scale: [(1.1 - i * 0.12) * 0.34, height * 0.3, (1.1 - i * 0.12) * 0.34]
		});
	}
	return kit.build();
};

// ── floating_isle ─────────────────────────────────────────────────────────
const floatingIsle: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [grass, rock, fall] = palette(colors, ['#7fd88a', '#6b6156', '#bfe9ff']);
	const kit = new Kit();

	// Grass cap and the tapering underside — the underside is the whole point,
	// it is what tells the eye the island is airborne.
	kit.add(UNIT.cylinder, 'grass', mat(grass), { position: [0, 0, 0], scale: [2.1, 0.22, 2.1] });
	kit.add(UNIT.cone, 'rock', mat(rock, { roughness: 0.9 }), {
		position: [0, -0.62, 0],
		rotation: [Math.PI, 0, 0],
		scale: [2.0, 1.1, 2.0]
	});
	const shards = 3 + Math.floor(rnd() * 3);
	for (let i = 0; i < shards; i++) {
		const angle = rnd() * Math.PI * 2;
		const radius = 0.5 + rnd() * 0.5;
		kit.add(UNIT.coneSharp, 'rock', mat(rock, { roughness: 0.9 }), {
			position: [Math.cos(angle) * radius, -0.35 - rnd() * 0.4, Math.sin(angle) * radius],
			rotation: [Math.PI, rnd() * Math.PI, 0],
			scale: [0.3, 0.5 + rnd() * 0.5, 0.3]
		});
	}
	// A waterfall spilling off the rim into open air.
	const fallAngle = rnd() * Math.PI * 2;
	kit.add(UNIT.box, 'fall', mat(fall, { roughness: 0.2, metalness: 0.1 }), {
		position: [Math.cos(fallAngle) * 0.95, -0.7, Math.sin(fallAngle) * 0.95],
		scale: [0.22, 1.5, 0.08]
	});

	const trees = 4 + Math.floor(rnd() * 4);
	for (let i = 0; i < trees; i++) {
		const angle = rnd() * Math.PI * 2;
		const radius = rnd() * 0.8;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		kit.add(UNIT.cone, 'grass', mat(grass), {
			position: [x, 0.38, z],
			scale: [0.34, 0.55, 0.34]
		});
	}
	return kit.build();
};

// ── harbor ────────────────────────────────────────────────────────────────
const harbor: Builder = ({ seed, colors }) => {
	const rnd = seededRandom(seed);
	const [wood, sail, water] = palette(colors, ['#8b6b4a', '#f4f1e8', '#1f6f8b']);
	const kit = new Kit();

	kit.add(UNIT.cylinder, 'water', mat(water, { roughness: 0.25, metalness: 0.2 }), {
		position: [0, 0.04, 0],
		scale: [2.3, 0.08, 2.3]
	});
	// Pier out from the centre.
	kit.add(UNIT.box, 'wood', mat(wood), { position: [0, 0.14, 0.4], scale: [0.28, 0.08, 1.5] });
	for (let i = 0; i < 5; i++) {
		kit.add(UNIT.cylinder, 'wood', mat(wood), {
			position: [0.11 * (i % 2 ? 1 : -1), 0.08, -0.25 + i * 0.32],
			scale: [0.05, 0.16, 0.05]
		});
	}

	const boats = 2 + Math.floor(rnd() * 3);
	for (let i = 0; i < boats; i++) {
		const angle = rnd() * Math.PI * 2;
		const radius = 0.75 + rnd() * 0.6;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		const heading = rnd() * Math.PI;
		kit.add(UNIT.box, 'wood', mat(wood), {
			position: [x, 0.12, z],
			rotation: [0, heading, 0],
			scale: [0.16, 0.09, 0.42]
		});
		kit.add(UNIT.cylinder, 'wood', mat(wood), {
			position: [x, 0.32, z],
			scale: [0.02, 0.42, 0.02]
		});
		kit.add(UNIT.cone, 'sail', mat(sail, { roughness: 0.6 }), {
			position: [x, 0.34, z],
			rotation: [0, heading, 0],
			scale: [0.26, 0.38, 0.06]
		});
	}
	return kit.build();
};

/**
 * Registry. Typed against `TerrainKind`, so a name offered in the admin form
 * without a builder behind it fails to compile. An unknown or missing value at
 * runtime falls back to `ruins`, which reads as "a place, unspecified" rather
 * than as an error.
 */
export const BUILDERS: Record<TerrainKind, Builder> = {
	castle,
	forest,
	dead_forest: deadForest,
	ruins,
	volcano,
	ice_peak: icePeak,
	floating_isle: floatingIsle,
	harbor
};

export const DEFAULT_TERRAIN: TerrainKind = 'ruins';

export function buildLandmark(terrain: string | null, options: BuildOptions): Group {
	const builder = BUILDERS[terrain as TerrainKind] ?? BUILDERS[DEFAULT_TERRAIN];
	const group = builder(options);
	if (options.scale && options.scale !== 1) group.scale.setScalar(options.scale);
	return group;
}
