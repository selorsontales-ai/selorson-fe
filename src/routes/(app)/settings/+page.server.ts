import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Devices are fetched client-side (needs browser cookie for is_current detection).
	return {
		devices: []
	};
};
