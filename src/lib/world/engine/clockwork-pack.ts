/** Akunarch P0: gói sa bàn cơ khí — .glb có clip `assemble` (phát 1 lần) rồi `idle` (lặp). */

export function pickClockworkClips(names: string[]): { intro: string | null; loop: string | null } {
	return {
		intro: names.includes('assemble') ? 'assemble' : null,
		loop: names.includes('idle') ? 'idle' : null
	};
}

/** Chỉ .glb mới mở được trong trình xem 3D (gói .zip cũ vẫn là liên kết tải). */
export function isClockworkGlb(url: string | null | undefined): boolean {
	const u = url?.trim();
	if (!u) return false;
	return /\.glb$/i.test(u.split(/[?#]/)[0]);
}
