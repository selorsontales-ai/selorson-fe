/**
 * How a character is drawn on the map.
 *
 * Character art is placeholder-grade today and expected to be upgraded several
 * times — flat portraits first, then directional sprites, eventually rigged
 * models. Rather than rewriting the renderer at each step, the engine reads the
 * highest tier the database happens to supply and falls back cleanly when a
 * field is absent. Upgrading art is a data edit in admin, not a code change.
 */

import { assetUrl } from './config';
import type { WorldNode } from './types';

export type AvatarTier =
	/** Nothing but a name — a coloured pin. Always available. */
	| 'dot'
	/** A single portrait, billboarded to face the camera. */
	| 'billboard'
	/** A directional sprite sheet; frame chosen by heading. */
	| 'sprite'
	/** A glTF model with optional walk/idle clips. */
	| 'model';

export interface AvatarSpec {
	tier: AvatarTier;
	/** Ribbon and pin colour; also the journey path colour. */
	color: string;
	/** Resolved, cache-busted URL for the chosen tier — null for `dot`. */
	url: string | null;
	/** Sprite sheet columns, when `tier === 'sprite'`. */
	directions: number;
	scale: number;
	/** Animation clip names for `tier === 'model'`. */
	anim: Record<string, string>;
}

/** Fallback pin colours, cycled by id so two characters are never the same. */
const PALETTE = ['#2fe36b', '#00f0ff', '#ffb703', '#ff75c3', '#a855f7', '#ff5c39', '#5cc8ff'];

/**
 * Pick the richest representation the data supports.
 *
 * Order matters: a character with both a model and a portrait should render as
 * the model, but must not break if the model file 404s — callers fall back by
 * calling `degrade()`.
 */
export function resolveAvatar(node: WorldNode): AvatarSpec {
	const color = node.color ?? PALETTE[Math.abs(node.id) % PALETTE.length];
	const scale = node.model_scale ?? node.scale ?? 1;
	const anim = node.anim ?? {};

	if (node.model) {
		return {
			tier: 'model',
			color,
			url: assetUrl(node.model, node.v),
			directions: 1,
			scale,
			anim
		};
	}
	if (node.sprite_sheet) {
		return {
			tier: 'sprite',
			color,
			url: assetUrl(node.sprite_sheet, node.v),
			directions: node.sprite_dirs ?? 8,
			scale,
			anim
		};
	}
	if (node.image_url) {
		return {
			tier: 'billboard',
			color,
			url: assetUrl(node.image_url, node.v),
			directions: 1,
			scale,
			anim
		};
	}
	return { tier: 'dot', color, url: null, directions: 1, scale, anim };
}

/**
 * Step down one tier. Used when an asset fails to load at runtime, so a broken
 * model URL costs the reader a nicer avatar rather than the whole scene.
 */
export function degrade(spec: AvatarSpec, node: WorldNode): AvatarSpec {
	if (spec.tier === 'model' && node.sprite_sheet) {
		return {
			...spec,
			tier: 'sprite',
			url: assetUrl(node.sprite_sheet, node.v),
			directions: node.sprite_dirs ?? 8
		};
	}
	if ((spec.tier === 'model' || spec.tier === 'sprite') && node.image_url) {
		return { ...spec, tier: 'billboard', url: assetUrl(node.image_url, node.v), directions: 1 };
	}
	return { ...spec, tier: 'dot', url: null, directions: 1 };
}

/** Which sprite column faces `heading` radians, for `tier === 'sprite'`. */
export function spriteFrame(heading: number, directions: number): number {
	const step = (Math.PI * 2) / directions;
	return ((Math.round(heading / step) % directions) + directions) % directions;
}
