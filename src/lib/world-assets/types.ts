/**
 * The production asset library.
 *
 * Separate from `library_items` on purpose. The library holds what a reader
 * looks at — a portrait composed to read well on a page. This holds what the 3D
 * world is built from. The same character needs both, and they are rarely the
 * same file: a flat portrait has no volume, sits at the wrong scale, and may be
 * in a style that clashes with the world's.
 *
 * Readers never see this catalogue; they only ever receive resolved URLs.
 */

export interface AssetTransform {
	/** Uniform scale applied on import so the asset lands at world size. */
	scale?: number;
	/** Euler rotation in degrees — corrects Z-up exports and mis-facing models. */
	rotation?: [number, number, number];
	/** Offset in world units, e.g. lifting a model whose origin is at its centre. */
	offset?: [number, number, number];
}

export interface WorldAsset {
	id: number;
	/** Stable handle bindings point at, so renaming never breaks a binding. */
	slug: string;
	name: string;
	kind: string;

	file_url: string;
	file_format: string | null;
	file_size: number | null;
	thumbnail_url: string | null;

	license: string | null;
	source_name: string | null;
	source_url: string | null;
	attribution: string | null;

	tags: string[];
	transform: AssetTransform | null;
	meta: Record<string, unknown> | null;

	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface AssetCatalogue {
	assets: WorldAsset[];
	/** Every tag in use, so the filter offers what exists rather than a guess. */
	tags: string[];
}

/** Asset kinds the studio knows how to use. Free-form on the server. */
export const ASSET_KINDS = ['model', 'sprite', 'texture', 'icon', 'hdri'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_KIND_LABELS: Record<string, string> = {
	model: 'Mô hình 3D (.glb)',
	sprite: 'Sprite sheet',
	texture: 'Texture',
	icon: 'Biểu tượng 2D',
	hdri: 'HDRI / môi trường'
};

/**
 * Licences worth distinguishing.
 *
 * `cc0` and `own` need no credit; everything else does, and the credits page is
 * generated from whatever is recorded here. Leaving it blank is treated as a
 * gap to fix, not as "probably fine".
 */
export const LICENSES = [
	{ value: 'own', label: 'Tự làm', credit: false },
	{ value: 'cc0', label: 'CC0 / Public Domain', credit: false },
	{ value: 'cc-by', label: 'CC-BY (phải ghi công)', credit: true },
	{ value: 'cc-by-sa', label: 'CC-BY-SA (ghi công + chia sẻ tương tự)', credit: true },
	{ value: 'commercial', label: 'Đã mua licence thương mại', credit: false },
	{ value: 'other', label: 'Khác — ghi rõ ở ô ghi công', credit: true }
] as const;

/**
 * Which slots each kind of world node can fill, and what each is for.
 *
 * A character gets a head *and* a body because they are used in different
 * places: the bust represents them on the map where a full figure would be
 * unreadable at that size, and the full model walks their journey. Adding a
 * slot is one entry here — the picker and the engine both read this table.
 */
export interface SlotDef {
	slot: string;
	label: string;
	hint: string;
	/**
	 * Asset kinds the picker offers.
	 *
	 * Several slots accept both a model and a flat image. A bust on a globe
	 * marker is drawn a few dozen pixels wide; a rendered image billboarded to
	 * face the camera reads nearly as well as geometry there, at a fraction of
	 * the file size and of the work to produce. The renderer decides what to do
	 * from the file's format, so the author can start with a render and swap in
	 * a model later without changing anything else.
	 */
	kinds: AssetKind[];
}

export const SLOTS: Record<string, SlotDef[]> = {
	character: [
		{
			slot: 'head',
			label: 'Đầu / bán thân',
			hint: 'Đại diện nhân vật trên bản đồ. Ảnh render cũng được — ở cỡ này gần như không khác mô hình',
			kinds: ['model', 'icon']
		},
		{
			slot: 'body',
			label: 'Toàn thân',
			hint: 'Dùng khi nhân vật đi trên hành trình — chỗ mô hình 3D thật sự đáng công',
			kinds: ['model', 'icon']
		},
		{
			slot: 'sprite',
			label: 'Sprite nhiều hướng',
			hint: 'Ảnh render sẵn theo 8 hướng — nhẹ hơn mô hình, dùng cho máy yếu',
			kinds: ['sprite']
		},
		{ slot: 'icon', label: 'Biểu tượng', hint: 'Ảnh nhỏ trên HUD và timeline', kinds: ['icon'] }
	],
	region: [
		{ slot: 'model', label: 'Mô hình vùng', hint: 'Thay cho địa hình tự dựng', kinds: ['model'] }
	],
	place: [
		{
			slot: 'model',
			label: 'Mô hình công trình',
			hint: 'Thay cho bộ dựng tự động. Đặt tên node trong Blender để tháo lắp được',
			kinds: ['model']
		},
		{ slot: 'icon', label: 'Biểu tượng', hint: 'Ảnh nhỏ trên danh sách', kinds: ['icon'] }
	],
	item: [
		{
			slot: 'model',
			label: 'Mô hình vật phẩm',
			hint: 'Hiện khi nhân vật tìm được',
			kinds: ['model']
		},
		{ slot: 'icon', label: 'Biểu tượng', hint: 'Ảnh nhỏ trong ô "Tìm được"', kinds: ['icon'] }
	],
	lore: [{ slot: 'icon', label: 'Biểu tượng', hint: 'Ảnh nhỏ cạnh truyền thuyết', kinds: ['icon'] }]
};

/** File formats the renderer treats as geometry rather than as a flat image. */
const MODEL_FORMATS = new Set(['glb', 'gltf']);

export function isModelFormat(format: string | null | undefined): boolean {
	return !!format && MODEL_FORMATS.has(format.toLowerCase());
}

export function slotsFor(kind: string): SlotDef[] {
	return SLOTS[kind] ?? [];
}

/** Human-readable file size for the catalogue cards. */
export function formatSize(bytes: number | null): string {
	if (!bytes) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether this licence obliges a credit. Blank counts as "unknown, assume yes". */
export function needsCredit(license: string | null): boolean {
	if (!license || !license.trim()) return true;
	return !['cc0', 'own', 'commercial'].includes(license.toLowerCase());
}
