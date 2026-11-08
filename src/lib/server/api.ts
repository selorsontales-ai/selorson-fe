import { PUBLIC_API_BASE } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';

/**
 * Exchange refresh_token cookie for a temporary access_token during SSR.
 */
export async function getSSRAccessToken(cookies: any, fetchFn: typeof fetch): Promise<string | null> {
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

		const json = await res.json();
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
	if (localeOrCookies && typeof localeOrCookies === 'object' && typeof localeOrCookies.get === 'function') {
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
