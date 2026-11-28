/** Akunarch P0: gói sa bàn cơ khí — .glb có clip `assemble` (phát 1 lần) rồi `idle` (lặp). */

export function pickClockworkClips(names: string[]): { intro: string | null; loop: string | null } {
	return {
		intro: names.includes('assemble') ? 'assemble' : null,
		loop: names.includes('idle') ? 'idle' : null
	};
}

export type ClockworkVariant = 'clockwork' | 'real';

/** Chọn biến thể mô hình ban đầu: chỉ trả `real` khi có bản thật riêng (hoặc không có sa bàn chính). */
export function resolveClockworkVariant(
	requested: ClockworkVariant | undefined,
	url: string | null | undefined,
	realScaleUrl: string | null | undefined
): ClockworkVariant {
	if (!url?.trim() && realScaleUrl?.trim()) return 'real';
	if (requested === 'real' && realScaleUrl?.trim()) return 'real';
	return 'clockwork';
}

/** Chỉ .glb mới mở được trong trình xem 3D (gói .zip cũ vẫn là liên kết tải). */
export function isClockworkGlb(url: string | null | undefined): boolean {
	const u = url?.trim();
	if (!u) return false;
	return /\.glb$/i.test(u.split(/[?#]/)[0]);
}
