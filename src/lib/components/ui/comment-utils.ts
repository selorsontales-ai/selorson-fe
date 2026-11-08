export interface CommentUserSummary {
	id: number;
	name?: string | null;
	nickname?: string | null;
	username?: string | null;
	avatar?: string | null;
	role?: string | null;
}

export interface CommentItem {
	id: number;
	user_id: number;
	parent_id?: number | null;
	root_id?: number | null;
	reply_to_user?: CommentUserSummary | null;
	content: string;
	likes_count?: number;
	viewer_liked?: boolean;
	replies_count?: number;
	is_edited?: boolean;
	created_at: string;
	updated_at?: string;
	user?: CommentUserSummary | null;
}

export interface CommentThread {
	root: CommentItem;
	replies: CommentItem[];
}

export interface CommentSegment {
	type: 'text' | 'spoiler';
	text: string;
}

export type CommentSortMode = 'newest' | 'top' | 'oldest';

/**
 * Parse a comment string into plain text and `[spoiler]...[/spoiler]` segments.
 * Unclosed `[spoiler]` tags are still treated as spoilers to protect readers.
 */
export function parseCommentSegments(raw: string): CommentSegment[] {
	const input = String(raw ?? '');
	if (!input) return [];

	const segments: CommentSegment[] = [];
	let rest = input;

	while (rest.length > 0) {
		const lower = rest.toLowerCase();
		const openIdx = lower.indexOf('[spoiler]');
		if (openIdx === -1) {
			if (rest.length > 0) {
				segments.push({ type: 'text', text: rest });
			}
			break;
		}

		if (openIdx > 0) {
			segments.push({ type: 'text', text: rest.slice(0, openIdx) });
		}

		const afterOpen = rest.slice(openIdx + '[spoiler]'.length);
		const closeIdx = afterOpen.toLowerCase().indexOf('[/spoiler]');
		if (closeIdx === -1) {
			const spoilerText = afterOpen.trim();
			if (spoilerText.length > 0) {
				segments.push({ type: 'spoiler', text: spoilerText });
			}
			break;
		}

		const spoilerContent = afterOpen.slice(0, closeIdx);
		if (spoilerContent.length > 0) {
			segments.push({ type: 'spoiler', text: spoilerContent });
		}
		rest = afterOpen.slice(closeIdx + '[/spoiler]'.length);
	}

	return segments;
}

/**
 * Insert or wrap `[spoiler]...[/spoiler]` around the current selection in an input/textarea.
 */
export function wrapSelectionWithSpoiler(
	currentValue: string,
	selectionStart?: number | null,
	selectionEnd?: number | null
): { text: string; selectionStart: number; selectionEnd: number } {
	const value = String(currentValue ?? '');
	const start = Math.max(0, Math.min(value.length, selectionStart ?? value.length));
	const end = Math.max(start, Math.min(value.length, selectionEnd ?? start));
	const selected = value.slice(start, end);
	const inner = selected.length > 0 ? selected : 'Tình tiết ẩn...';
	const before = value.slice(0, start);
	const after = value.slice(end);
	const openTag = '[spoiler]';
	const closeTag = '[/spoiler]';
	const nextText = `${before}${openTag}${inner}${closeTag}${after}`;
	const nextStart = before.length + openTag.length;
	const nextEnd = nextStart + inner.length;
	return {
		text: nextText,
		selectionStart: nextStart,
		selectionEnd: nextEnd
	};
}

/**
 * Group a flat list of comments into root threads + chronological replies,
 * and sort root threads by `newest`, `top`, or `oldest`.
 */
export function buildCommentThreads(
	items: CommentItem[],
	sortMode: CommentSortMode = 'newest'
): CommentThread[] {
	if (!Array.isArray(items) || items.length === 0) return [];

	const byId = new Map<number, CommentItem>();
	for (const item of items) {
		if (item && Number.isFinite(Number(item.id))) {
			byId.set(Number(item.id), item);
		}
	}

	function resolveRootId(item: CommentItem): number | null {
		if (item.root_id && byId.has(Number(item.root_id))) {
			return Number(item.root_id);
		}
		if (!item.parent_id) return null;
		let currParent = Number(item.parent_id);
		let guard = 0;
		while (guard < 16) {
			guard += 1;
			const parentObj = byId.get(currParent);
			if (!parentObj) return null;
			if (!parentObj.parent_id) return parentObj.id;
			const nextParent = Number(parentObj.parent_id);
			if (nextParent === currParent || !byId.has(nextParent)) {
				return parentObj.id;
			}
			currParent = nextParent;
		}
		return currParent;
	}

	const roots: CommentItem[] = [];
	const repliesByRoot = new Map<number, CommentItem[]>();

	for (const item of items) {
		const rootId = resolveRootId(item);
		if (rootId !== null && rootId !== item.id && byId.has(rootId)) {
			const bucket = repliesByRoot.get(rootId) ?? [];
			bucket.push({
				...item,
				reply_to_user:
					item.reply_to_user ??
					(item.parent_id ? byId.get(Number(item.parent_id))?.user ?? null : null)
			});
			repliesByRoot.set(rootId, bucket);
		} else {
			roots.push(item);
		}
	}

	for (const [, bucket] of repliesByRoot) {
		bucket.sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);
	}

	const threads: CommentThread[] = roots.map((root) => ({
		root,
		replies: repliesByRoot.get(root.id) ?? []
	}));

	threads.sort((a, b) => {
		const timeA = new Date(a.root.created_at).getTime();
		const timeB = new Date(b.root.created_at).getTime();
		if (sortMode === 'oldest') {
			return timeA - timeB;
		}
		if (sortMode === 'top') {
			const scoreA = (a.root.likes_count ?? 0) * 2 + a.replies.length;
			const scoreB = (b.root.likes_count ?? 0) * 2 + b.replies.length;
			if (scoreB !== scoreA) return scoreB - scoreA;
		}
		return timeB - timeA;
	});

	return threads;
}
