import { isDesktop, isMobile } from "$lib/platform";

export type AppFlavor =
	| "web"
	| "desktop-admin"
	| "desktop-user"
	| "android-admin"
	| "android-user";

const validFlavors = new Set<AppFlavor>([
	"web",
	"desktop-admin",
	"desktop-user",
	"android-admin",
	"android-user",
]);

export function resolveAppFlavor(
	explicitFlavor: string | undefined,
	buildTarget: string | undefined,
	runsInDesktop: boolean,
	runsInMobile: boolean,
): AppFlavor {
	if (explicitFlavor && validFlavors.has(explicitFlavor as AppFlavor)) {
		return explicitFlavor as AppFlavor;
	}
	if (buildTarget === "desktop" || runsInDesktop) return "desktop-admin";
	if (buildTarget === "mobile" || runsInMobile) return "android-admin";
	return "web";
}

export const appFlavor = resolveAppFlavor(
	import.meta.env.VITE_APP_FLAVOR,
	import.meta.env.VITE_BUILD_TARGET,
	isDesktop,
	isMobile,
);

export const supportsAdminPanel =
	appFlavor === "web" ||
	appFlavor === "desktop-admin" ||
	appFlavor === "android-admin";

/** Local writing/AI tools are intentionally absent from public web/user flavors. */
export const supportsLocalAiTools = appFlavor === "desktop-admin";

export const supportsDesktopUpdater = appFlavor === "desktop-admin";
