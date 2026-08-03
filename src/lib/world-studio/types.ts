/**
 * World Studio document.
 *
 * Holds *layout* only — where a thing sits, what shape a region has, what
 * connects to what. Content (name, description, artwork) belongs to
 * `library_items` and is edited in the ordinary admin form, so no field is
 * written by both places.
 *
 * Unknown keys survive a round trip untouched, which is what lets the editor
 * grow new tools without a backend change.
 */

/** One removable piece of a landmark, with the lore it carries. */
export interface DocPart {
	id: string;
	label?: string;
	dir?: [number, number, number];
	lore?: string;
	chapter?: number;
}

/** Layout for a single library item. */
export interface NodeLayout {
	kind?: 'region' | 'landmark' | 'poi' | 'legend' | 'character' | (string & {});
	slug?: string;
	/** Slug of the containing region. */
	region?: string;
	lat?: number;
	lng?: number;
	/** Height in planet radii — positive floats, negative sinks. */
	alt?: number;
	terrain?: string;
	scene?: string;
	unlock_chapter?: number;
	palette?: string[];
	color?: string;
	model?: string | null;
	parts?: DocPart[];
	/**
	 * Where the node sits on the graph canvas. Editor bookkeeping — stripped
	 * before the layout reaches readers.
	 */
	graph?: { x: number; y: number };
	[key: string]: unknown;
}

/**
 * A region's outline. `rings` are closed polygons in `[lng, lat]` order; more
 * than one ring makes an archipelago.
 */
export interface Border {
	rings: number[][][];
	color?: string;
}

/** A relationship between two library items. */
export interface DocEdge {
	source: number;
	target: number;
	role: string;
}

export interface WorldDoc {
	version: number;
	nodes: Record<string, NodeLayout>;
	borders: Record<string, Border>;
	edges: DocEdge[];
}

// ── Catalogue: content the canvas needs to draw a node ──

export interface CatalogueItem {
	id: number;
	name: string;
	category: string;
	image_url: string | null;
	description: string | null;
	is_active: boolean;
}

export interface CatalogueChapter {
	id: number;
	chapter_number: number;
	title: string;
	status: string;
}

export interface Catalogue {
	items: CatalogueItem[];
	chapters: CatalogueChapter[];
}

export interface DraftPayload {
	draft: {
		id: number;
		doc: WorldDoc;
		label: string | null;
		updated_at: string;
	};
	published: { id: number; label: string | null; published_at: string } | null;
	catalogue: Catalogue;
	doc_version: number;
}

export interface RevisionSummary {
	id: number;
	label: string | null;
	published_at: string;
	author_id: number | null;
	counts: { nodes: number; borders: number; edges: number };
}

/** Node kinds the canvas draws, derived from category + layout. */
export type StudioNodeKind = 'region' | 'place' | 'character' | 'item' | 'lore';

/** Which pane the one canvas is currently acting as. */
export type StudioMode = 'graph' | 'map';

/** Border editing state: off, laying down a new ring, or adjusting one. */
export type BorderTool = 'none' | 'draw' | 'edit';

/**
 * What a wire between two node kinds means.
 *
 * Semantics come from the pair, so the author connects ports rather than
 * picking a relationship from a menu. A pair that is not listed cannot be
 * connected — the canvas refuses the drop rather than storing something
 * meaningless.
 */
export const EDGE_RULES: Array<{
	from: StudioNodeKind;
	to: StudioNodeKind;
	role: string;
	label: string;
}> = [
	{ from: 'character', to: 'item', role: 'found_at', label: 'tìm được' },
	{ from: 'character', to: 'character', role: 'knows', label: 'quen biết' },
	{ from: 'lore', to: 'place', role: 'lore_of', label: 'truyền thuyết của' },
	{ from: 'lore', to: 'character', role: 'lore_of', label: 'truyền thuyết về' },
	{ from: 'item', to: 'place', role: 'kept_at', label: 'cất giữ tại' },
	{ from: 'place', to: 'region', role: 'belongs_to', label: 'thuộc vùng' }
];

export function edgeRule(from: StudioNodeKind, to: StudioNodeKind) {
	return EDGE_RULES.find((r) => r.from === from && r.to === to) ?? null;
}

/** Which studio node kind a catalogue item is, given its layout. */
export function kindOf(item: CatalogueItem, layout: NodeLayout | undefined): StudioNodeKind {
	if (layout?.kind === 'region') return 'region';
	if (item.category === 'main_character' || item.category === 'side_character') return 'character';
	if (item.category === 'item') return 'item';
	if (item.category === 'lore') return 'lore';
	return 'place';
}

export const KIND_LABELS: Record<StudioNodeKind, string> = {
	region: 'Vùng đất',
	place: 'Địa điểm',
	character: 'Nhân vật',
	item: 'Vật phẩm',
	lore: 'Truyền thuyết'
};

export const KIND_COLORS: Record<StudioNodeKind, string> = {
	region: '#2fe36b',
	place: '#00f0ff',
	character: '#ffb703',
	item: '#a855f7',
	lore: '#ff75c3'
};

export const KIND_ICONS: Record<StudioNodeKind, string> = {
	region: '🗺️',
	place: '📍',
	character: '⭐',
	item: '🔮',
	lore: '📜'
};
