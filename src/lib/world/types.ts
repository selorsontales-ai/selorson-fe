/**
 * Shapes returned by `/api/v1/world`.
 *
 * Nothing here describes *content* — no region names, no coordinates, no art
 * paths. Those live in the database so the world can be re-authored from the
 * admin panel without touching this repository.
 */

/** How much of a node the reader has earned the right to see. */
export type RevealState = 'hidden' | 'rumored' | 'revealed' | 'explored';

/** Which scene a location opens into when the reader arrives. */
export type SceneKind = 'orbit' | 'showcase';

/** One architectural stratum of a landmark on the showcase stage. */
export interface WorldPart {
	id: string;
	label: string;
	/** Direction and distance the piece travels when fully disassembled. */
	dir: [number, number, number];
	lore?: string;
	chapter?: number;
}

/**
 * A single thing on the map: a region, a place inside one, or a character.
 *
 * Presentation fields (`model`, `sprite_sheet`, `palette`, …) are passed
 * through from `extra_data.world` untouched, so new art keys added in admin
 * arrive here without a backend or frontend change.
 */
export interface WorldNode {
	id: number;
	slug: string;
	/** Null while hidden — the map must not leak names of unread places. */
	name: string | null;
	category: string;
	kind: 'region' | 'landmark' | 'poi' | 'character' | 'legend' | (string & {});
	/** Slug of the containing region; null for regions themselves. */
	region: string | null;
	lat: number | null;
	lng: number | null;
	/** Height above the surface in planet radii — Skyland floats, chasms sink. */
	alt: number;
	estimated_coords?: boolean;
	terrain: string | null;
	scene: SceneKind | (string & {});
	state: RevealState;
	/** `updated_at` epoch — appended to asset URLs so swapped art beats the CDN. */
	v: number;

	description?: string | null;
	image_url?: string | null;
	image_ratio?: string | null;
	story_link?: string | null;
	/** Published chapter numbers this node appears in. */
	chapters?: number[];

	// ── Presentation, all optional ──
	model?: string | null;
	sprite_sheet?: string | null;
	sprite_dirs?: number;
	palette?: string[];
	color?: string;
	home?: string;
	scale?: number;
	parts?: WorldPart[];

	// ── Multi-planet & Temporal fields (Tầng 0 & Tầng 1) ──
	planet?: 'akunalia' | 'earth' | (string & {});
	era?: string | null;
	era_year?: number | null;
	timeline?: 1 | 2 | 'both' | null;
	wavelength_nm?: number | null;
	is_singularity?: boolean;

	// ── Ecosystem Studio Sync Gateway fields (`Open Sync Gateway`) ──
	intro_video_url?: string | null;
	preview_gallery?: string[];
	clockwork_pack_url?: string | null;
	clockwork_pack_version?: string | null;
	clockwork_pack_size?: number | null;
	desktop_pack_url?: string | null;
	desktop_pack_version?: string | null;
	desktop_pack_size?: number | null;
	vn_episode_url?: string | null;
	vn_episode_title?: string | null;
	studio_source_key?: string | null;
	studio_synced_at?: string | null;
}

export interface WorldChunkPlacement {
	id: string;
	slug?: string;
	title?: string;
	glb_url?: string | null;
	x: number;
	y: number;
	z: number;
	rot_y_deg?: number;
	scale?: number;
}

export interface WorldChunkAudioZone {
	id: string;
	label?: string;
	audio_url?: string | null;
	x: number;
	z: number;
	radius: number;
	volume?: number;
}

export interface WorldChunkVnTrigger {
	id: string;
	label?: string;
	title?: string;
	episode_slug?: string;
	episode_url?: string | null;
	x?: number;
	y?: number;
	z?: number;
	radius?: number;
}

/** One seamless Open-World terrain chunk (`⚔️ Thế Giới Mở`) streamed into Selorson Desktop. */
export interface WorldChunkNode {
	id: number;
	slug: string;
	name: string | null;
	planet: 'akunalia' | 'earth' | (string & {});
	region: string | null;
	biome: string | null;
	chunk_x: number;
	chunk_z: number;
	world_size: number;
	unlock_chapter: number | null;
	state: RevealState;
	v: number;
	description?: string | null;
	image_url?: string | null;
	preview_gallery?: string[];
	chunk_pack_url?: string | null;
	chunk_pack_version?: string | null;
	chunk_pack_size?: number | null;
	splat_url?: string | null;
	water_level?: number | null;
	foliage_density?: number | null;
	heightmap_grid?: {
		resolution: number;
		values: number[];
	} | null;
	placements?: WorldChunkPlacement[];
	audio_zones?: WorldChunkAudioZone[];
	spawn_points?: Array<{ id: string; label?: string; x: number; y: number; z: number }>;
	vn_triggers?: WorldChunkVnTrigger[];
	studio_source_key?: string | null;
	studio_synced_at?: string | null;
}

export interface WorldProgress {
	/** Highest chapter number the reader has opened; null for guests. */
	read_up_to: number | null;
	/** Nodes that have coordinates. */
	placed: number;
	revealed: number;
	explored?: number;
	explored_percent?: number;
	percent: number;
	is_guest: boolean;
}

export interface WorldMap {
	regions: WorldNode[];
	locations: WorldNode[];
	characters: WorldNode[];
	progress: WorldProgress;
}

/**
 * A removable piece as the scene and the HUD both see it: the geometry's own
 * part tag, joined with whatever the author wrote in `extra_data.world.parts`.
 */
export interface ScenePart {
	id: string;
	label: string;
	lore: string | null;
	chapter: number | null;
}

/** A chapter this place is tagged in. */
export interface PlaceChapterRef {
	chapter_number: number;
	chapter_id: number;
	/** Null when the reader has not reached it. */
	title: string | null;
	role: string;
	locked: boolean;
}

export interface LocationDetail {
	place: WorldNode;
	region: WorldNode | null;
	/** Other places in the same region, for the "where next" strip. */
	neighbours: WorldNode[];
	chapters: PlaceChapterRef[];
	visitors?: WorldNode[];
	linked_items?: Array<{
		id: number;
		name: string;
		category: string;
		image_url: string | null;
		role: string;
	}>;
}

export interface RegionDetail {
	region: WorldNode;
	places: WorldNode[];
	/** Characters whose story passes through this region. */
	visitors: WorldNode[];
}

/** One chapter-sized step of a character's journey. */
export interface JourneyStop {
	chapter_number: number;
	chapter_id: number;
	/** Null when the reader has not reached this chapter. */
	chapter_title: string | null;
	role: string;
	places: WorldNode[];
	acquired: Array<{
		id: number;
		name: string;
		category: string;
		role: string;
		image_url: string | null;
	}>;
	locked: boolean;
}

export interface Journey {
	character: WorldNode;
	stops: JourneyStop[];
	read_up_to: number | null;
}
