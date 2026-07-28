import { browser } from '$app/environment';
import { PUBLIC_API_BASE } from '$env/static/public';
import { loadPublicProfile } from '$lib/profile-loader.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const publicFetch = browser
		? fetch
		: (input: string, init?: RequestInit) => globalThis.fetch(input, init);

	return {
		profile: await loadPublicProfile(publicFetch, PUBLIC_API_BASE, params.id)
	};
};

export const prerender = false;
