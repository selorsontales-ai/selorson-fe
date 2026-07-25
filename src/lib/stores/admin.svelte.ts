import { api, apiUpload, type ApiResponse } from '$lib/api';

// ═══════════════════════════════════════════════
//  Admin Store — Svelte 5 Runes
// ═══════════════════════════════════════════════

// ---- Toast System ----

interface ToastItem {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
}

let toasts = $state<ToastItem[]>([]);
let toastId = 0;

export function showToast(message: string, type: ToastItem['type'] = 'info') {
	const id = ++toastId;
	toasts = [...toasts, { id, message, type }];
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 3500);
}

export function toast_success(msg: string) { showToast(msg, 'success'); }
export function toast_error(msg: string) { showToast(msg, 'error'); }
export function getToasts(): ToastItem[] { return toasts; }

// ---- Admin API Helpers ----
// api() throws khi HTTP lỗi hoặc success:false — các trang admin lại kiểm tra
// res.success thay vì try/catch, nên helpers phải nuốt exception và trả về
// ApiResponse dạng lỗi để spinner không bị kẹt và toast lỗi hiển thị đúng.

function toErrorResponse<T>(err: unknown): ApiResponse<T> {
	const e = err as { success?: boolean; message?: string; data?: T };
	return {
		success: false,
		data: (e?.data as T) ?? (undefined as T),
		message: e?.message || 'Không kết nối được máy chủ',
	};
}

export async function adminGet<T>(endpoint: string): Promise<ApiResponse<T>> {
	try {
		return await api<T>(endpoint);
	} catch (err) {
		return toErrorResponse<T>(err);
	}
}

export async function adminPost<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	try {
		return await api<T>(endpoint, { method: 'POST', body });
	} catch (err) {
		return toErrorResponse<T>(err);
	}
}

export async function adminPut<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	try {
		return await api<T>(endpoint, { method: 'PUT', body });
	} catch (err) {
		return toErrorResponse<T>(err);
	}
}

export async function adminDelete<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	try {
		return await api<T>(endpoint, { method: 'DELETE', body });
	} catch (err) {
		return toErrorResponse<T>(err);
	}
}

export async function adminUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
	try {
		return await apiUpload<T>(endpoint, formData);
	} catch (err) {
		return toErrorResponse<T>(err);
	}
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
