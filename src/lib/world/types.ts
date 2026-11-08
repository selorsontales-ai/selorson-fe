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
export type SceneKind = 'orbit' | 'assembly' | 'fps';

/** An asset the server has already resolved to a loadable file. */
export interface ResolvedAsset {
	url: string;
	format: string | null;
	/**
	 * Correction baked in at import: scale for models authored in centimetres,
	 * rotation for Z-up exports, offset for origins that are not at the feet.
	 * Applying it here means the author fixes it once, not at every use.
	 */
	transform: {
		scale?: number;
		rotation?: [number, number, number];
		offset?: [number, number, number];
	} | null;
	/** Asset `updated_at` — re-exporting a model beats the CDN cache. */
	v: number;
}

/** One removable piece of a landmark in an exploded view. */
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

	/**
	 * Production assets bound to this node, resolved server-side from slugs into
	 * URLs. A character's `head` stands on the map where a whole figure would be
	 * an unreadable speck; `body` walks their journey. The client never sees a
	 * slug — a binding to a retired asset simply does not arrive, and the
	 * renderer falls back a tier.
	 */
	assets?: Record<string, ResolvedAsset>;

	// ── Presentation, all optional; the engine picks the highest tier present ──
	model?: string | null;
	model_scale?: number;
	sprite_sheet?: string | null;
	sprite_dirs?: number;
	anim?: Record<string, string>;
	palette?: string[];
	color?: string;
	home?: string;
	scale?: number;
	parts?: WorldPart[];
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
