/** Build one Cloudflare web audience with a fail-closed route boundary. */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { prepareFlavorRoutes } = require("./flavor-routes.cjs");
const { verifyFlavorBundle } = require("./verify-flavor-bundle.cjs");

const ROOT = path.join(__dirname, "..");
const svelteKitDir = path.join(ROOT, ".svelte-kit");
const audience = process.argv[2] ?? "user";

if (!["admin", "user"].includes(audience)) {
  throw new Error("Web flavor must be either 'admin' or 'user'.");
}

const appFlavor = `web-${audience}`;
const routesDir = prepareFlavorRoutes(appFlavor);
if (fs.existsSync(svelteKitDir)) {
  fs.rmSync(svelteKitDir, { recursive: true, force: true });
}

const env = {
  ...process.env,
  BUILD_TARGET: "web",
  VITE_BUILD_TARGET: "web",
  VITE_APP_FLAVOR: appFlavor,
  SELORSON_ROUTES_DIR: routesDir ?? "",
};

console.log(`\nBuilding ${appFlavor} Cloudflare bundle...\n`);
execSync("npx vite build --mode production", {
  stdio: "inherit",
  cwd: ROOT,
  env,
});
verifyFlavorBundle(appFlavor, path.join(svelteKitDir, "output"));
console.log(`\n${appFlavor} build successful!\n`);
