import { dataModeScope } from "$lib/desktop-mode.svelte";

/**
 * Where the access token lives.
 *
 * On every flavor but desktop-admin this is a single fixed key. Desktop-admin
 * can point its embedded backend at either the local or the production
 * database, and those are two separate user tables — a token issued by one is
 * rejected by the other. Scoping the key keeps both sessions alive at once, so
 * switching modes does not silently sign you out of the mode you left.
 */
export function tokenStorageKey(): string {
	return `selorson_token${dataModeScope()}`;
}

/** Cross-tab refresh notifications, scoped for the same reason. */
export function tokenRefreshChannel(): string {
	return `selorson_token_refresh${dataModeScope()}`;
}
