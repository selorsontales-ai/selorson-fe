import type { PageServerLoad } from './$types';
import { getSSRAccessToken, ssrFetch } from '$lib/server/api';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies, fetch }) => {
	const accessToken = await getSSRAccessToken(cookies, fetch);
	
	if (!accessToken) {
		// Cannot SSR private data without token, but we can return early.
		return {
			ssrAccessToken: null,
			devices: []
		};
	}

	// Fetch devices via SSR
	const devices = await ssrFetch<any[]>('/auth/devices', accessToken, fetch);

	return {
		ssrAccessToken: accessToken,
		devices: devices || []
	};
};
