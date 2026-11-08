import { api, apiUpload, type ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Admin Store — Svelte 5 Runes
// ═══════════════════════════════════════════════

// ---- Toast System ----

interface ToastItem {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
	/** Thời điểm tạo, dùng để gộp các lời báo cùng một thao tác. */
	at: number;
}

let toasts = $state<ToastItem[]>([]);
let toastId = 0;
/** Thời điểm request thay đổi dữ liệu gần nhất bị hỏng. */
let lastFailureAt = 0;

/** Cửa sổ coi hai sự kiện là cùng thuộc một thao tác của người dùng. */
const COALESCE_MS = 900;
/** Sau khi có request hỏng, chặn báo thành công trong khoảng này. */
const SUPPRESS_SUCCESS_MS = 1500;

export function showToast(message: string, type: ToastItem['type'] = 'info') {
	const now = Date.now();
	const last = toasts.at(-1);

	// Một thao tác hỏng thường sinh hai lời báo lỗi: một từ helper (kèm thông
	// điệp của máy chủ) và một từ trang (kèm ngữ cảnh). Gộp lại thành một thẻ,
	// giữ lời sau vì nó cụ thể hơn.
	if (last && last.type === type && now - last.at < COALESCE_MS) {
		if (last.message === message) return;
		if (type === 'error') {
			toasts = [...toasts.slice(0, -1), { ...last, message }];
			return;
		}
		// Báo thành công khác nội dung thì vẫn xếp thêm thẻ.
	}

	const id = ++toastId;
	toasts = [...toasts, { id, message, type, at: now }];
	setTimeout(() => dismissToast(id), 3500);
}

/**
 * Báo thành công — bị bỏ qua nếu vừa có request hỏng.
 *
 * Rất nhiều trang admin gọi API rồi báo "đã lưu" mà không xem kết quả. Chốt
 * chặn này khiến chúng không thể báo xanh đè lên một thao tác vừa thất bại.
 */
export function toast_success(msg: string) {
	if (Date.now() - lastFailureAt < SUPPRESS_SUCCESS_MS) return;
	showToast(msg, 'success');
}

export function toast_error(msg: string) { showToast(msg, 'error'); }
export function getToasts(): ToastItem[] { return toasts; }
export function dismissToast(id: number) {
	toasts = toasts.filter((t) => t.id !== id);
}

// ---- Trạng thái đang gọi API ----
// Mọi thao tác admin đều đi qua các helper bên dưới, nên chỉ cần đo ở đây là
// thanh tiến trình toàn cục biết lúc nào có request đang chạy, và mọi thất bại
// đều được báo dù trang gọi có kiểm tra kết quả hay không.

let inFlight = $state(0);

export function isBusy(): boolean { return inFlight > 0; }

async function tracked<T>(
	run: () => Promise<ApiResponse<T>>,
	mutating: boolean
): Promise<ApiResponse<T>> {
	inFlight += 1;
	try {
		const res = await run();
		if (mutating && !res.success) {
			lastFailureAt = Date.now();
			showToast(res.message || 'Thao tác thất bại', 'error');
		}
		return res;
	} catch (err) {
		const res = toErrorResponse<T>(err);
		if (mutating) {
			lastFailureAt = Date.now();
			showToast(res.message || 'Thao tác thất bại', 'error');
		}
		return res;
	} finally {
		inFlight -= 1;
	}
}

// ---- Admin API Helpers ----
// api() throws khi HTTP lỗi hoặc success:false — các trang admin lại kiểm tra
// res.success thay vì try/catch, nên helpers phải nuốt exception và trả về
// ApiResponse dạng lỗi để spinner không bị kẹt và toast lỗi hiển thị đúng.

function toErrorResponse<T>(err: unknown): ApiResponse<T> {
	const e = err as { status?: number; success?: boolean; message?: string; data?: T };
	// api() ném lỗi có dạng { status, success, message } khi máy chủ trả lời.
	// Thiếu cả hai trường đó nghĩa là hỏng ở tầng dưới (mất mạng, body không
	// phải JSON) — thông điệp gốc lúc đó là tiếng Anh kỹ thuật, không nên đẩy
	// thẳng vào mặt người dùng.
	const fromServer = e?.status !== undefined || e?.success !== undefined;
	return {
		success: false,
		data: (e?.data as T) ?? (undefined as T),
		message: (fromServer && e?.message) || 'Không kết nối được máy chủ',
	};
}

export async function adminGet<T>(endpoint: string): Promise<ApiResponse<T>> {
	return tracked<T>(() => api<T>(endpoint), false);
}

export async function adminPost<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return tracked<T>(() => api<T>(endpoint, { method: 'POST', body }), true);
}

export async function adminPut<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return tracked<T>(() => api<T>(endpoint, { method: 'PUT', body }), true);
}

export async function adminDelete<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return tracked<T>(() => api<T>(endpoint, { method: 'DELETE', body }), true);
}

export async function adminUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
	return tracked<T>(() => apiUpload<T>(endpoint, formData), true);
}

// ---- Formatting Helpers ----

export function formatDate(val: string | null | undefined): string {
	if (!val) return '—';
	try {
		return new Date(val).toLocaleDateString('vi-VN');
	} catch {
		return val;
	}
}

export function formatDateTime(val: string | null | undefined): string {
	if (!val) return '—';
	try {
		return new Date(val).toLocaleString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return val;
	}
}

export function truncate(str: string, len: number): string {
	return str.length > len ? str.slice(0, len) + '…' : str;
}

export function statusClass(val: string): string {
	const v = val?.toLowerCase();
	if (['active', 'admin', 'published'].includes(v)) return 'badge-green';
	if (['banned', 'rejected', 'deleted', 'blacklisted'].includes(v)) return 'badge-red';
	if (['suspended', 'pending', 'draft'].includes(v)) return 'badge-yellow';
	return 'badge-blue';
}

// ---- CMS Translation Helpers (VI / EN) ----

export type CmsEntityType =
	| 'hero_slide'
	| 'milestone'
	| 'future_project'
	| 'music_album'
	| 'music_track'
	| 'video';

export function extractCmsLocaleFields(
	item: Record<string, unknown> | null | undefined,
	keys: string[],
	locale = 'en'
): { values: Record<string, string>; hasExisting: boolean } {
	const values: Record<string, string> = {};
	const translations = (item?.translations as Record<string, Record<string, unknown>> | undefined)?.[
		locale
	];
	let hasExisting = false;
	for (const k of keys) {
		const raw = translations?.[k];
		const str = typeof raw === 'string' ? raw : '';
		if (str.trim()) hasExisting = true;
		values[k] = str;
	}
	return { values, hasExisting };
}

export async function saveCmsLocaleFields(
	entityType: CmsEntityType,
	entityId: number | undefined | null,
	fields: Record<string, string>,
	hadExisting: boolean,
	locale = 'en'
): Promise<boolean> {
	const id = Number(entityId);
	if (!Number.isFinite(id) || id <= 0) return false;
	const hasAnyValue = Object.values(fields).some((v) => typeof v === 'string' && v.trim().length > 0);
	if (!hasAnyValue && !hadExisting) return true;
	const res = await adminPut(`/admin/cms-translations/${entityType}/${id}/${locale}`, { fields });
	return res.success;
}
