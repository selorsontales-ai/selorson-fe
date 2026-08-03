/**
 * The studio's working state.
 *
 * Owns the draft document and everything derived from it. Mutations go through
 * methods rather than being applied to the document directly, so every edit
 * marks the draft dirty and nothing slips past the autosave.
 */

import { fetchDraft, saveDraft } from './api';
import {
	kindOf,
	type Border,
	type Catalogue,
	type CatalogueItem,
	type DocEdge,
	type NodeLayout,
	type StudioNodeKind,
	type WorldDoc
} from './types';

const EMPTY_DOC: WorldDoc = { version: 1, nodes: {}, borders: {}, edges: [] };

/** Seconds of quiet before the draft saves itself. */
const AUTOSAVE_DELAY = 2500;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

export class Studio {
	doc = $state<WorldDoc>({ ...EMPTY_DOC });
	catalogue = $state<Catalogue>({ items: [], chapters: [] });
	publishedLabel = $state<string | null>(null);
	publishedAt = $state<string | null>(null);

	loading = $state(true);
	loadError = $state<string | null>(null);
	saveState = $state<SaveState>('idle');
	saveMessage = $state<string | null>(null);

	/** Selected library item id, shared by every pane. */
	selectedId = $state<number | null>(null);

	private updatedAt = '';
	private timer: ReturnType<typeof setTimeout> | null = null;

	// ── derived views ──

	/** Catalogue entries that are active, with their layout attached. */
	entries = $derived(
		this.catalogue.items
			.filter((item) => item.is_active)
			.map((item) => {
				const layout = this.doc.nodes[String(item.id)];
				return { item, layout, kind: kindOf(item, layout) };
			})
	);

	byId = $derived(new Map(this.entries.map((e) => [e.item.id, e])));

	selected = $derived(this.selectedId === null ? null : (this.byId.get(this.selectedId) ?? null));

	/** Regions, for the "belongs to" picker and the border list. */
	regions = $derived(this.entries.filter((e) => e.kind === 'region'));

	/** Layout entries that have coordinates and can be drawn on the map. */
	placed = $derived(
		this.entries.filter(
			(e) => typeof e.layout?.lat === 'number' && typeof e.layout?.lng === 'number'
		)
	);

	// ── loading ──

	async load() {
		this.loading = true;
		this.loadError = null;
		try {
			const payload = await fetchDraft();
			this.doc = { ...EMPTY_DOC, ...payload.draft.doc };
			this.doc.nodes ??= {};
			this.doc.borders ??= {};
			this.doc.edges ??= [];
			this.catalogue = payload.catalogue;
			this.updatedAt = payload.draft.updated_at;
			this.publishedLabel = payload.published?.label ?? null;
			this.publishedAt = payload.published?.published_at ?? null;
			this.saveState = 'idle';
		} catch (err) {
			this.loadError = err instanceof Error ? err.message : 'Không tải được bản nháp';
		}
		this.loading = false;
	}

	// ── mutation ──

	/** Every edit funnels through here, so nothing can bypass the autosave. */
	private touch() {
		this.saveState = 'dirty';
		this.saveMessage = null;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => this.save(), AUTOSAVE_DELAY);
	}

	layoutOf(id: number): NodeLayout {
		return this.doc.nodes[String(id)] ?? {};
	}

	patchNode(id: number, patch: Partial<NodeLayout>) {
		const key = String(id);
		const next = { ...(this.doc.nodes[key] ?? {}), ...patch };
		// Keys set back to undefined are removed rather than stored as null, so
		// the document stays a faithful picture of what the author set.
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) delete next[k];
		}
		this.doc.nodes = { ...this.doc.nodes, [key]: next };
		this.touch();
	}

	removeNode(id: number) {
		const next = { ...this.doc.nodes };
		delete next[String(id)];
		this.doc.nodes = next;
		this.doc.edges = this.doc.edges.filter((e) => e.source !== id && e.target !== id);
		this.touch();
	}

	setBorder(slug: string, border: Border | null) {
		const next = { ...this.doc.borders };
		if (border && border.rings.length > 0) next[slug] = border;
		else delete next[slug];
		this.doc.borders = next;
		this.touch();
	}

	addEdge(edge: DocEdge) {
		const exists = this.doc.edges.some(
			(e) => e.source === edge.source && e.target === edge.target && e.role === edge.role
		);
		if (exists) return;
		this.doc.edges = [...this.doc.edges, edge];
		this.touch();
	}

	removeEdge(edge: DocEdge) {
		this.doc.edges = this.doc.edges.filter(
			(e) => !(e.source === edge.source && e.target === edge.target && e.role === edge.role)
		);
		this.touch();
	}

	/** Neighbours of an item in either direction — drives Focus mode. */
	neighbours(id: number): Set<number> {
		const out = new Set<number>([id]);
		for (const edge of this.doc.edges) {
			if (edge.source === id) out.add(edge.target);
			if (edge.target === id) out.add(edge.source);
		}
		// A place is a neighbour of its region even without an explicit edge.
		const layout = this.doc.nodes[String(id)];
		if (layout?.region) {
			const region = this.regions.find((r) => r.layout?.slug === layout.region);
			if (region) out.add(region.item.id);
		}
		for (const entry of this.entries) {
			if (entry.layout?.region && this.doc.nodes[String(id)]?.slug === entry.layout.region) {
				out.add(entry.item.id);
			}
		}
		return out;
	}

	// ── saving ──

	async save() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.saveState === 'saving') return;

		this.saveState = 'saving';
		const result = await saveDraft($state.snapshot(this.doc) as WorldDoc, this.updatedAt);

		if (result.ok && result.updatedAt) {
			this.updatedAt = result.updatedAt;
			this.saveState = 'saved';
			this.saveMessage = null;
			return;
		}
		if (result.conflict) {
			// Reloading here would throw away whatever the author just did, so
			// the decision is left to them.
			this.saveState = 'conflict';
			this.saveMessage = result.message ?? 'Bản nháp đã bị sửa ở nơi khác.';
			return;
		}
		this.saveState = 'error';
		this.saveMessage = result.message ?? 'Lưu thất bại';
	}

	/** After a publish or restore, the server's timestamp is the new baseline. */
	adoptTimestamp(updatedAt: string) {
		this.updatedAt = updatedAt;
	}

	adoptDoc(doc: WorldDoc, updatedAt: string) {
		this.doc = { ...EMPTY_DOC, ...doc };
		this.updatedAt = updatedAt;
		this.saveState = 'idle';
	}

	dispose() {
		if (this.timer) clearTimeout(this.timer);
	}
}

/**
 * Combining diacritics, built from escapes rather than written literally —
 * the literal range renders as invisible marks in most editors.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Slug helper shared by the inspector and the border tools. */
export function slugify(name: string, fallbackId: number): string {
	const slug = name
		.toLowerCase()
		// NFD splits "ừ" into "u" plus a combining mark, which the next line drops.
		.normalize('NFD')
		.replace(COMBINING_MARKS, '')
		// đ carries no combining mark and survives NFD; it needs its own pass.
		.replace(/đ/g, 'd')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || `item-${fallbackId}`;
}

export type StudioEntry = {
	item: CatalogueItem;
	layout: NodeLayout | undefined;
	kind: StudioNodeKind;
};
