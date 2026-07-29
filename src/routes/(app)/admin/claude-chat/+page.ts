import { redirect } from "@sveltejs/kit";
import { supportsLocalAiTools } from "$lib/app-flavor";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
	if (!supportsLocalAiTools) redirect(307, "/admin");
	return {};
};
