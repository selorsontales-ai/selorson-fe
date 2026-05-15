import type { PageServerLoad } from './$types';
import { getSSRAccessToken, ssrFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ cookies, fetch }) => {
	const accessToken = await getSSRAccessToken(cookies, fetch);
	
	if (!accessToken) {
		return {
			ssrAccessToken: null,
			conversations: []
		};
	}

	// Fetch conversations list via SSR
	const conversations = await ssrFetch<any[]>('/chat/conversations', accessToken, fetch);

	return {
		ssrAccessToken: accessToken,
		conversations: conversations || []
	};
};
