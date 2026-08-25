import { PUBLIC_API_BASE } from '$env/static/public';
import { tokenRefreshChannel, tokenStorageKey } from '$lib/session-storage';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiOptions {
	method?: Method;
	body?: unknown;
	headers?: Record<string, string>;
	token?: string;
	/** @internal — prevents infinite retry loops */
	_isRetry?: boolean;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data: T;
	message?: string;
	meta?: {
		current_page: number;
		per_page: number;
		total: number;
		total_pages: number;
	};
}

export interface ApiError {
	success: false;
	message: string;
	errors?: Record<string, string[]>;
}

// ── Mutex-based token refresh (prevents thundering herd) ──

let isRefreshing = false;
let waitQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

/**
 * Attempt to refresh the access token using the HttpOnly refresh cookie.
 * Only the first 401 caller triggers the refresh; others wait in a queue.
 */
async function performTokenRefresh(staleToken?: string): Promise<string> {
	const currentToken =
		typeof localStorage !== 'undefined' ? localStorage.getItem(tokenStorageKey()) : null;
	if (staleToken && currentToken && currentToken !== staleToken) {
		return currentToken;
	}

	const res = await fetch(`${PUBLIC_API_BASE}/auth/refresh`, {
		method: 'POST',
		credentials: 'include',
		headers: { Accept: 'application/json' }
	});
	const json = await res.json();
	if (!res.ok || !json.success) {
		throw new Error(json.message || 'Refresh failed');
	}

	const newToken: string = json.data.token;
	const { updateToken } = await import('./stores/auth.svelte');
	updateToken(newToken);

	try {
		const bc = new BroadcastChannel(tokenRefreshChannel());
		bc.postMessage({ token: newToken });
		bc.close();
	} catch {
		// BroadcastChannel not supported.
	}
	return newToken;
}

async function acquireRefreshedToken(
	staleToken?: string,
	logoutOnFailure = true
): Promise<string> {
	if (isRefreshing) {
		return new Promise((resolve, reject) => {
			waitQueue.push({ resolve, reject });
		});
	}

	isRefreshing = true;
	try {
		const refresh = () => performTokenRefresh(staleToken);
		const newToken =
			typeof navigator !== 'undefined' && navigator.locks
				? await navigator.locks.request('selorson-auth-refresh', refresh)
				: await refresh();

		waitQueue.forEach(({ resolve }) => resolve(newToken));
		waitQueue = [];
		return newToken;
	} catch (err) {
		waitQueue.forEach(({ reject }) => reject(err));
		waitQueue = [];
		if (logoutOnFailure) forceLogout();
		throw err;
	} finally {
		isRefreshing = false;
	}
}

export async function restoreSession(): Promise<boolean> {
	try {
		await acquireRefreshedToken(undefined, false);
		return true;
	} catch {
		return false;
	}
}

/** Clear local state and redirect to home. */
function forceLogout() {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(tokenStorageKey());
	}
	if (typeof window !== 'undefined') {
		window.location.href = '/';
	}
}

/**
 * Typed fetch wrapper for the V3 API.
 * Automatically retries once on 401 by refreshing the access token.
 */
export async function api<T = unknown>(
	endpoint: string,
	options: ApiOptions = {}
): Promise<ApiResponse<T>> {
	const { method = 'GET', body, headers = {}, token, _isRetry = false } = options;

	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...headers,
	};

	if (token) {
		reqHeaders['Authorization'] = `Bearer ${token}`;
	} else if (typeof window !== 'undefined') {
		const stored = localStorage.getItem(tokenStorageKey());
		if (stored) {
			reqHeaders['Authorization'] = `Bearer ${stored}`;
		}
	}

	const res = await fetch(url, {
		method,
		headers: reqHeaders,
		body: body ? JSON.stringify(body) : undefined,
		credentials: 'include',
	});

	// ── Auto-retry on 401 (token expired) ──
	if (res.status === 401 && !_isRetry && typeof window !== 'undefined') {
		try {
			const newToken = await acquireRefreshedToken(reqHeaders.Authorization?.slice(7));
			return api<T>(endpoint, { ...options, token: newToken, _isRetry: true });
		} catch {
			throw { status: 401, success: false, message: 'Session expired' } as ApiError & {
				status: number;
			};
		}
	}

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw {
			status: res.status,
			...json,
		} as ApiError & { status: number };
	}

	return json as ApiResponse<T>;
}

/**
 * Upload files via multipart/form-data.
 * Also supports 401 auto-retry.
 */
export async function apiUpload<T = unknown>(
	endpoint: string,
	formData: FormData,
	options: { _isRetry?: boolean } = {}
): Promise<ApiResponse<T>> {
	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		Accept: 'application/json',
	};

	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem(tokenStorageKey());
		if (stored) reqHeaders['Authorization'] = `Bearer ${stored}`;
	}

	const res = await fetch(url, {
		method: 'POST',
		headers: reqHeaders,
		body: formData,
		credentials: 'include',
	});

	// ── Auto-retry on 401 ──
	if (res.status === 401 && !options._isRetry && typeof window !== 'undefined') {
		try {
			const newToken = await acquireRefreshedToken(reqHeaders.Authorization?.slice(7));
			reqHeaders['Authorization'] = `Bearer ${newToken}`;
			return apiUpload<T>(endpoint, formData, { _isRetry: true });
		} catch {
			throw { status: 401, success: false, message: 'Session expired' } as ApiError & {
				status: number;
			};
		}
	}

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw { status: res.status, ...json } as ApiError & { status: number };
	}

	return json as ApiResponse<T>;
}
