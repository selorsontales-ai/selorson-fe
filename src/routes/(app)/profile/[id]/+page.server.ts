import type { PageServerLoad } from './$types';
import { getSSRAccessToken, ssrFetch } from '$lib/server/api';

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const id = params.id;
	
	// Try to get temporary access token from refresh token
	const accessToken = await getSSRAccessToken(cookies, fetch);
	
	// Fetch profile data
	const profile = await ssrFetch<any>(`/profile/${id}`, accessToken, fetch);
	
	return {
		profile,
		// Pass access token so client can use it for initial requests if needed
		ssrAccessToken: accessToken
	};
};
