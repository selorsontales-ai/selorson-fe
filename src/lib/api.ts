import { PUBLIC_API_BASE } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';
import { tokenRefreshChannel, tokenStorageKey } from '$lib/session-storage';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiOptions {
	method?: Method;
	body?: unknown;
	headers?: Record<string, string>;
	token?: string;
	lang?: string;
	/** @internal — prevents infinite retry loops */
	_isRetry?: boolean;
}

const IS_LOOPBACK_API = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(PUBLIC_API_BASE);
let embeddedBackendReady = false;

/**
 * When `Selorson Admin` opens or switches Beta ↔ Alpha, the window appears immediately
 * while the embedded Rust backend finishes waking portable PostgreSQL or Neon TLS on a
 * background thread. Retrying initial loopback `ERR_CONNECTION_REFUSED` prevents empty
 * first renders or dropped sessions without blocking window startup.
 */
async function fetchEmbeddedAware(url: string, init: RequestInit): Promise<Response> {
	if (typeof window === 'undefined' || !IS_LOOPBACK_API || embeddedBackendReady) {
		const res = await fetch(url, init);
		if (IS_LOOPBACK_API) embeddedBackendReady = true;
		return res;
	}

	const deadline = Date.now() + 30_000;
	let delayMs = 150;
	for (;;) {
		try {
			const res = await fetch(url, init);
			embeddedBackendReady = true;
			return res;
		} catch (err) {
			if (embeddedBackendReady || Date.now() >= deadline) {
				throw err;
			}
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			delayMs = Math.min(delayMs + 50, 350);
		}
	}
}

function resolveRequestLocale(explicit?: string): string {
	if (explicit && explicit.trim()) return explicit.trim();
	try {
		return getLocale() || 'vi';
	} catch {
		return 'vi';
	}
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

/**
 * A refresh that failed for a reason unrelated to the session.
 *
 * Worth its own type because the two outcomes could not be further apart:
 * a refused refresh token means sign out, while a rate limit or an unreachable
 * backend means wait. Collapsing them signs people out of valid sessions over
 * a hiccup, and the session they lose is one they cannot get back without
 * their password.
 */
class TransientRefreshFailure extends Error {}

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

	let res: Response;
	try {
		res = await fetchEmbeddedAware(`${PUBLIC_API_BASE}/auth/refresh`, {
			method: 'POST',
			credentials: 'include',
			headers: { Accept: 'application/json' }
		});
	} catch {
		throw new TransientRefreshFailure('Không kết nối được máy chủ');
	}

	// Checked before parsing: the rate limiter answers in plain text, so a 429
	// read as JSON surfaces as a syntax error and loses the one fact that
	// matters — that this failure is temporary and the session is still good.
	if (res.status === 429 || res.status >= 500) {
		throw new TransientRefreshFailure(`Máy chủ chưa trả lời được (${res.status})`);
	}

	const rawText = await res.text();
	let json: any;
	try {
		json = rawText ? JSON.parse(rawText) : {};
	} catch {
		json = {
			success: false,
			message: rawText
				? `Máy chủ từ chối yêu cầu (HTTP ${res.status}): ${rawText.slice(0, 180)}`
				: `Lỗi máy chủ (HTTP ${res.status})`
		};
	}
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

export async function acquireRefreshedToken(
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
		if (logoutOnFailure && !(err instanceof TransientRefreshFailure)) forceLogout();
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

/** Clear local state, close active SSE streams, and redirect to home. */
function forceLogout() {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(tokenStorageKey());
	}
	void import('./stores/chat.svelte')
		.then(({ resetChatStore }) => resetChatStore())
		.catch(() => {});
	void import('./stores/support.svelte')
		.then(({ resetSupportStore }) => resetSupportStore())
		.catch(() => {});
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
	const { method = 'GET', body, headers = {}, token, lang, _isRetry = false } = options;

	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...headers,
	};

	if (!endpoint.startsWith('/admin') && !reqHeaders['Accept-Language']) {
		reqHeaders['Accept-Language'] = resolveRequestLocale(lang);
	}

	if (token) {
		reqHeaders['Authorization'] = `Bearer ${token}`;
	} else if (typeof window !== 'undefined') {
		const stored = localStorage.getItem(tokenStorageKey());
		if (stored) {
			reqHeaders['Authorization'] = `Bearer ${stored}`;
		}
	}

	const res = await fetchEmbeddedAware(url, {
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

	const rawText = await res.text();
	let json: any;
	try {
		json = rawText ? JSON.parse(rawText) : {};
	} catch {
		json = {
			success: false,
			message: rawText
				? `Máy chủ từ chối yêu cầu (HTTP ${res.status}): ${rawText.slice(0, 180)}`
				: `Lỗi máy chủ (HTTP ${res.status})`
		};
	}

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
	options: { token?: string; _isRetry?: boolean } = {}
): Promise<ApiResponse<T>> {
	const url = `${PUBLIC_API_BASE}${endpoint}`;

	const reqHeaders: Record<string, string> = {
		Accept: 'application/json',
	};

	if (options.token) {
		reqHeaders['Authorization'] = `Bearer ${options.token}`;
	} else if (typeof window !== 'undefined') {
		const stored = localStorage.getItem(tokenStorageKey());
		if (stored) reqHeaders['Authorization'] = `Bearer ${stored}`;
	}

	const res = await fetchEmbeddedAware(url, {
		method: 'POST',
		headers: reqHeaders,
		body: formData,
		credentials: 'include',
	});

	// ── Auto-retry on 401 ──
	if (res.status === 401 && !options._isRetry && typeof window !== 'undefined') {
		try {
			const newToken = await acquireRefreshedToken(reqHeaders.Authorization?.slice(7));
			return apiUpload<T>(endpoint, formData, {
				...options,
				token: newToken,
				_isRetry: true
			});
		} catch {
			throw { status: 401, success: false, message: 'Session expired' } as ApiError & {
				status: number;
			};
		}
	}

	const rawText = await res.text();
	let json: any;
	try {
		json = rawText ? JSON.parse(rawText) : {};
	} catch {
		json = {
			success: false,
			message: rawText
				? `Máy chủ từ chối yêu cầu (HTTP ${res.status}): ${rawText.slice(0, 180)}`
				: `Lỗi máy chủ (HTTP ${res.status})`
		};
	}

	if (!res.ok || !json.success) {
		throw { status: res.status, ...json } as ApiError & { status: number };
	}

	return json as ApiResponse<T>;
}

/**
 * Mint a short-lived single-use stream ticket (TTL 30s) for EventSource / WebSocket
 * authentication so long-lived JWTs are never exposed in URL query strings (`REM-28`).
 */
export async function acquireStreamTicket(): Promise<string | null> {
	try {
		const res = await api<{ ticket: string; expires_in: number }>('/stream-ticket', {
			method: 'POST',
		});
		return res.data?.ticket ?? null;
	} catch {
		return null;
	}
}
