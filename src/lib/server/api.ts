import { PUBLIC_API_BASE } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';

function forwardSetCookiesToClient(res: Response, cookies: any) {
	if (!cookies || typeof cookies.set !== 'function') return;
	const setCookieHeaders: string[] =
		typeof (res.headers as any).getSetCookie === 'function'
			? (res.headers as any).getSetCookie()
			: res.headers.get('set-cookie')
				? [res.headers.get('set-cookie') as string]
				: [];

	for (const rawCookie of setCookieHeaders) {
		const parts = rawCookie.split(';').map((s) => s.trim());
		const [first, ...attrs] = parts;
		if (!first) continue;
		const eqIdx = first.indexOf('=');
		if (eqIdx <= 0) continue;
		const name = first.slice(0, eqIdx).trim();
		const rawVal = first.slice(eqIdx + 1);
		let value = rawVal;
		try {
			value = decodeURIComponent(rawVal);
		} catch {
			// keep raw value if not percent-encoded
		}

		const opts: {
			path: string;
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: 'lax' | 'strict' | 'none';
			maxAge?: number;
			expires?: Date;
			domain?: string;
		} = { path: '/' };

		for (const attr of attrs) {
			const lower = attr.toLowerCase();
			if (lower === 'httponly') {
				opts.httpOnly = true;
			} else if (lower === 'secure') {
				opts.secure = true;
			} else if (lower.startsWith('path=')) {
				opts.path = attr.slice(5).trim() || '/';
			} else if (lower.startsWith('domain=')) {
				opts.domain = attr.slice(7).trim();
			} else if (lower.startsWith('max-age=')) {
				const sec = Number(attr.slice(8).trim());
				if (Number.isFinite(sec)) opts.maxAge = sec;
			} else if (lower.startsWith('expires=')) {
				const dt = new Date(attr.slice(8).trim());
				if (!Number.isNaN(dt.getTime())) opts.expires = dt;
			} else if (lower.startsWith('samesite=')) {
				const ss = attr.slice(9).trim().toLowerCase();
				if (ss === 'lax' || ss === 'strict' || ss === 'none') {
					opts.sameSite = ss;
				}
			}
		}

		try {
			cookies.set(name, value, opts);
		} catch {
			// Ignore if response headers were already committed
		}
	}
}

/**
 * Exchange refresh_token cookie for a temporary access_token during SSR,
 * forwarding rotated `Set-Cookie` headers back to the browser (`B2-04`).
 */
export async function getSSRAccessToken(
	cookies: any,
	fetchFn: typeof fetch
): Promise<string | null> {
	const refreshToken = cookies.get('refresh_token');
	if (!refreshToken) return null;

	try {
		const res = await fetchFn(`${PUBLIC_API_BASE}/auth/refresh`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Cookie: `refresh_token=${refreshToken}`
			}
		});

		forwardSetCookiesToClient(res, cookies);

		const rawText = await res.text();
		if (!rawText) return null;
		const json = JSON.parse(rawText);
		if (json.success && json.data?.token) {
			return json.data.token;
		}
	} catch (e) {
		console.error('SSR Token Refresh Error:', e);
	}

	return null;
}

function resolveSSRLocale(
	localeOrCookies?: string | { get?: (name: string) => string | undefined } | null
): string {
	if (typeof localeOrCookies === 'string' && localeOrCookies.trim()) {
		return localeOrCookies.trim();
	}
	if (
		localeOrCookies &&
		typeof localeOrCookies === 'object' &&
		typeof localeOrCookies.get === 'function'
	) {
		const fromCookie = localeOrCookies.get('PARAGLIDE_LOCALE');
		if (fromCookie && fromCookie.trim()) return fromCookie.trim();
	}
	try {
		return getLocale() || 'vi';
	} catch {
		return 'vi';
	}
}

/**
 * Fetch data for SSR with the temporary access_token and active locale header.
 */
export async function ssrFetch<T>(
	endpoint: string,
	accessToken: string | null,
	fetchFn: typeof fetch,
	localeOrCookies?: string | { get?: (name: string) => string | undefined } | null
): Promise<T | null> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};
	if (!endpoint.startsWith('/admin')) {
		headers['Accept-Language'] = resolveSSRLocale(localeOrCookies);
	}
	if (accessToken) {
		headers['Authorization'] = `Bearer ${accessToken}`;
	}

	try {
		const res = await fetchFn(`${PUBLIC_API_BASE}${endpoint}`, { headers });
		if (!res.ok) return null;
		const json = await res.json();
		return json.success ? json.data : null;
	} catch (e) {
		console.error('SSR Fetch Error:', e);
		return null;
	}
}
