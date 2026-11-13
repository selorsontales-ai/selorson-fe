/**
 * Kế hoạch VRAM v2 · C1 (bổ sung) — cắt chuỗi giữ canvas/context WebGL của Threlte sau khi rời /world.
 *
 * Svelte 5 (đã kiểm 5.55.5 và 5.57.3) đẩy source/derived vào `untracked_writes` khi state bị ghi lúc có effect
 * "sạch" đang hoạt động; ở tầng ngoài cùng mảng này không bao giờ được xóa. Derived của Threlte giữ component
 * context → Map context → { canvas, renderer, scene … } → context WebGL không bao giờ được GC (đo: +70 MB/lần vào-ra).
 * Gọi SAU khi renderer đã dispose: xóa mọi tham chiếu object/hàm trong giá trị context rồi làm rỗng Map.
 */
export function scrubContextValues(map: Map<unknown, unknown>): void {
	for (const value of map.values()) {
		if (!value || typeof value !== 'object') continue;
		for (const key of Object.keys(value)) {
			const v = (value as Record<string, unknown>)[key];
			if (v && (typeof v === 'object' || typeof v === 'function')) {
				try {
					(value as Record<string, unknown>)[key] = null;
				} catch {
					// thuộc tính chỉ-đọc / object đóng băng → bỏ qua
				}
			}
		}
	}
	map.clear();
}
