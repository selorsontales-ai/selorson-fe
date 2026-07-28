/**
 * Load a public profile in either a server-rendered web request or a desktop
 * browser navigation.
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetcher
 * @param {string} apiBase
 * @param {string | number} id
 */
export async function loadPublicProfile(fetcher, apiBase, id) {
	try {
		const response = await fetcher(apiBase + '/profile/' + encodeURIComponent(id), {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) return null;

		const payload = await response.json();
		return payload?.success ? payload.data ?? null : null;
	} catch (error) {
		console.error('Public profile load failed', {
			url: apiBase + '/profile/' + encodeURIComponent(id),
			error
		});
		return null;
	}
}
