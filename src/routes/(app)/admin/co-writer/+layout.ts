import { redirect } from "@sveltejs/kit";
import { supportsLocalAiTools } from "$lib/app-flavor";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = () => {
	if (!supportsLocalAiTools) redirect(307, "/admin");
	return {};
};
