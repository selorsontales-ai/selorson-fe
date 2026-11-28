/** Báo cáo lỗi / cảnh báo từ `POST /admin/sync/world-studio` (`data.errors`, `data.warnings`). */
export interface StudioSyncIssue {
	kind?: string;
	item?: string;
	asset?: string;
	message?: string;
}

export interface StudioSyncReport {
	errors: string[];
	warnings: string[];
}

function line(i: StudioSyncIssue): string {
	const head = [i.kind, i.item].filter(Boolean).join(' ');
	const asset = i.asset ? ` · ${i.asset}` : '';
	return `${head}${asset}: ${i.message ?? 'lỗi không rõ'}`.trim();
}

export function summarizeStudioSyncIssues(data: unknown): StudioSyncReport {
	const d = (data ?? {}) as { errors?: unknown; warnings?: unknown };
	const toLines = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => line(x as StudioSyncIssue)) : [];
	return { errors: toLines(d.errors), warnings: toLines(d.warnings) };
}
