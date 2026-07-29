/** Build an Android flavor as a Capacitor SPA against the selected API. */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const svelteKitDir = path.join(ROOT, ".svelte-kit");
const audience = process.argv[2] ?? "admin";

if (!["admin", "user"].includes(audience)) {
	throw new Error("Android flavor must be either 'admin' or 'user'.");
}

const appFlavor = `android-${audience}`;

if (fs.existsSync(svelteKitDir)) {
	fs.rmSync(svelteKitDir, { recursive: true, force: true });
	console.log("  Cleared .svelte-kit cache");
}

const env = {
	...process.env,
	BUILD_TARGET: "mobile",
	VITE_BUILD_TARGET: "mobile",
	VITE_APP_FLAVOR: appFlavor,
	PUBLIC_API_BASE:
		process.env.PUBLIC_API_BASE ??
		"https://selorson-v3-api.fly.dev/api/v1",
	PUBLIC_WS_URL:
		process.env.PUBLIC_WS_URL ?? "wss://selorson-v3-api.fly.dev/ws",
};

console.log(`\nBuilding ${appFlavor} SPA (production API)...\n`);

execSync("npx vite build --mode mobile", {
	stdio: "inherit",
	cwd: ROOT,
	env,
});

console.log(`\n${appFlavor} build successful!\n`);
