/** Build a desktop flavor with the correct backend boundary. */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const svelteKitDir = path.join(ROOT, ".svelte-kit");
const audience = process.argv[2] ?? "admin";

if (!["admin", "user"].includes(audience)) {
	throw new Error("Desktop flavor must be either 'admin' or 'user'.");
}

if (fs.existsSync(svelteKitDir)) {
	fs.rmSync(svelteKitDir, { recursive: true, force: true });
	console.log("  Cleared .svelte-kit cache");
}

const env = {
	...process.env,
	BUILD_TARGET: "desktop",
	VITE_BUILD_TARGET: "desktop",
	VITE_APP_FLAVOR: `desktop-${audience}`,
};

if (audience === "user") {
	env.PUBLIC_API_BASE =
		process.env.PUBLIC_API_BASE ??
		"https://selorson-v3-api.fly.dev/api/v1";
	env.PUBLIC_WS_URL =
		process.env.PUBLIC_WS_URL ?? "wss://selorson-v3-api.fly.dev/ws";
}

console.log(`\nBuilding desktop-${audience} SPA...\n`);

execSync("npx vite build --mode desktop", {
	stdio: "inherit",
	cwd: ROOT,
	env,
});

console.log(`\ndesktop-${audience} build successful!\n`);
