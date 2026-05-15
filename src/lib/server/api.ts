import { PUBLIC_API_BASE } from '$env/static/public';

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

/**
 * Fetch data for SSR with the temporary access_token.
 */
export async function ssrFetch<T>(
	endpoint: string,
	accessToken: string | null,
	fetchFn: typeof fetch
): Promise<T | null> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};
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
