/**
 * Names an author can type into `terrain`, and the scenes a place can open in.
 *
 * Kept free of any Three.js import so the admin form can offer the list without
 * dragging the 3D engine into the admin bundle. `builders/index.ts` types its
 * registry against `TerrainKind`, so adding a name here without a builder is a
 * compile error rather than a place that silently renders as rubble.
 */

export const TERRAIN_KINDS = [
	'castle',
	'forest',
	'dead_forest',
	'ruins',
	'volcano',
	'ice_peak',
	'floating_isle',
	'harbor'
] as const;

export type TerrainKind = (typeof TERRAIN_KINDS)[number];

/** Vietnamese labels for the admin form — admin pages are not localized. */
export const TERRAIN_LABELS: Record<TerrainKind, string> = {
	castle: 'Lâu đài / thành trì',
	forest: 'Rừng xanh',
	dead_forest: 'Rừng chết / vùng nguyền rủa',
	ruins: 'Phế tích',
	volcano: 'Núi lửa',
	ice_peak: 'Đỉnh băng',
	floating_isle: 'Đảo bay',
	harbor: 'Bến cảng'
};

export const NODE_KINDS = ['region', 'landmark', 'poi', 'legend', 'character'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const SCENE_KINDS = ['orbit', 'assembly', 'fps'] as const;
export type SceneName = (typeof SCENE_KINDS)[number];

export const SCENE_LABELS: Record<SceneName, string> = {
	orbit: 'Xoay ngắm',
	assembly: 'Tháo lắp công trình',
	fps: 'Đi bộ góc nhìn thứ nhất'
};
