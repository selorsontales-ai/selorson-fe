// Removed Sentry from server hooks because Cloudflare Pages (Edge) does not support Node APIs
// that @sentry/sveltekit uses by default.

import { paraglideMiddleware } from "$lib/paraglide/server.js";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
	// paraglideMiddleware uses Node's AsyncLocalStorage to scope the locale to the current request
	return paraglideMiddleware(event.request, ({ locale }) => {
		// Pass the original event to SvelteKit
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});
};
