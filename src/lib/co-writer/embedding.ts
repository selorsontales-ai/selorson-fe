import { adminGet, adminPost } from '$lib/stores/admin.svelte';
import type { ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Embedding profiles, index generations, providers
// ═══════════════════════════════════════════════
// One vector space per generation. Changing model or dimension means building
// a new generation and activating it once it holds vectors — never editing the
// active one, because a mixed space silently returns fewer results instead of
// failing.

/** A vector space: provider, model, dimension, and normalization together. */
export interface EmbeddingProfile {
	provider: string;
	model: string;
	dimensions: number;
	normalized: boolean;
}

export interface IndexGeneration {
	id: number;
	profile: EmbeddingProfile;
	fingerprint: string;
	/** `building` accepts writes, `active` serves search, `inactive` is history. */
	status: 'building' | 'active' | 'inactive';
	created_at: string;
	activated_at: string | null;
	vector_count: number;
}

/**
 * What the capability manifest knows about an OpenAI embedding model.
 * `GET /v1/models` reports none of this, so it comes from the backend manifest.
 */
export interface EmbeddingModelSpec {
	id: string;
	default_dimensions: number;
	/** Only third-generation models accept a reduced dimension. */
	supports_custom_dimensions: boolean;
	supported_dimensions?: number[];
}

export interface EmbeddingCatalogProvider {
	id: string;
	name: string;
	cost_type: 'paid' | 'free_tier';
	enabled_key: boolean;
	models: EmbeddingModelSpec[];
}

export interface ModelCatalog {
	embedding: EmbeddingModelSpec[];
	/** Named like embedding models but absent from the manifest. Usable once
	 *  the author states the dimension. */
	unknown_embedding: string[];
	generation: string[];
}

const base = '/admin/writer/embedding';

export function listIndexGenerations(): Promise<
	ApiResponse<{ generations: IndexGeneration[]; active: EmbeddingProfile | null }>
> {
	return adminGet(`${base}/generations`);
}

/** Start a generation on a new profile. It accepts writes before it serves search. */
export function beginIndexGeneration(
	profile: EmbeddingProfile
): Promise<ApiResponse<{ generation_id: number }>> {
	return adminPost(`${base}/generations`, profile);
}

/** Switch search to a generation. Refused while it holds no vectors. */
export function activateIndexGeneration(id: number): Promise<ApiResponse<unknown>> {
	return adminPost(`${base}/generations/${id}/activate`);
}

/** Embedding-capable providers only; generation-only providers are excluded. */
export function fetchEmbeddingCatalog(): Promise<ApiResponse<EmbeddingCatalogProvider[]>> {
	return adminGet(base + '/catalog');
}

/**
 * The account's OpenAI models, grouped against the manifest.
 *
 * The provider is "OpenAI API", not ChatGPT: the API and the ChatGPT
 * subscription are billed separately and a key for one does not work with the
 * other.
 */
export function fetchOpenAiCatalog(): Promise<ApiResponse<ModelCatalog>> {
	return adminGet(`${base}/openai/catalog`);
}

/**
 * Whether a dimension can be requested for a model, mirroring the backend rule:
 * a model may be shortened, never stretched, and only if it supports it.
 */
export function dimensionError(spec: EmbeddingModelSpec, dimensions: number): string | null {
	if (dimensions === spec.default_dimensions) return null;
	if (!spec.supports_custom_dimensions) {
		return `${spec.id} luôn trả về ${spec.default_dimensions} chiều, không nhận kích thước tuỳ chọn`;
	}
	if (dimensions <= 0 || dimensions > spec.default_dimensions) {
		return `${spec.id} chỉ rút ngắn được dưới ${spec.default_dimensions} chiều`;
	}
	if (dimensions % 8 !== 0) {
		return `Số chiều ${dimensions} phải chia hết cho 8`;
	}
	return null;
}
