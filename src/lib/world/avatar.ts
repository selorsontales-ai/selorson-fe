/**
 * Lightweight character representation on the web map (`/world` & `/world/journey/[id]`).
 *
 * Supports directional sprite sheets, portrait billboards, or glowing coloured pins.
 */

import { assetUrl } from './config';
import type { WorldNode } from './types';

export type AvatarTier = 'dot' | 'billboard' | 'sprite';

export interface AvatarSpec {
	tier: AvatarTier;
	/** Ribbon and pin colour; also the journey path colour. */
	color: string;
	/** Resolved, cache-busted URL for the chosen tier — null for `dot`. */
	url: string | null;
	/** Sprite sheet columns, when `tier === 'sprite'`. */
	directions: number;
	scale: number;
}

/** Fallback pin colours, cycled by id so two characters are never the same. */
const PALETTE = ['#2fe36b', '#00f0ff', '#ffb703', '#ff75c3', '#a855f7', '#ff5c39', '#5cc8ff'];

export function resolveAvatar(node: WorldNode): AvatarSpec {
	const color = node.color ?? PALETTE[Math.abs(node.id) % PALETTE.length];
	const scale = node.scale ?? 1;

	if (node.sprite_sheet) {
		return {
			tier: 'sprite',
			color,
			url: assetUrl(node.sprite_sheet, node.v),
			directions: node.sprite_dirs ?? 8,
			scale
		};
	}
	if (node.image_url) {
		return {
			tier: 'billboard',
			color,
			url: assetUrl(node.image_url, node.v),
			directions: 1,
			scale
		};
	}
	return { tier: 'dot', color, url: null, directions: 1, scale };
}

/** Which sprite column faces `heading` radians, for `tier === 'sprite'`. */
export function spriteFrame(heading: number, directions: number): number {
	const step = (Math.PI * 2) / directions;
	return ((Math.round(heading / step) % directions) + directions) % directions;
}
