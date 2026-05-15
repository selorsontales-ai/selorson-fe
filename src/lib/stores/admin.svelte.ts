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

export async function adminGet<T>(endpoint: string): Promise<ApiResponse<T>> {
	return api<T>(endpoint);
}

export async function adminPost<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return api<T>(endpoint, { method: 'POST', body });
}

export async function adminPut<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return api<T>(endpoint, { method: 'PUT', body });
}

export async function adminDelete<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
	return api<T>(endpoint, { method: 'DELETE', body });
}

export async function adminUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
	return apiUpload<T>(endpoint, formData);
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
