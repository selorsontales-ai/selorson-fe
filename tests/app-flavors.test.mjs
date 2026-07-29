import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(...parts) {
	return readFile(join(root, ...parts), "utf8");
}

test("local AI tools are gated by the desktop-admin flavor", async () => {
	const flavor = await source("src", "lib", "app-flavor.ts");
	const adminLayout = await source(
		"src",
		"routes",
		"(app)",
		"admin",
		"+layout.svelte",
	);

	assert.match(
		flavor,
		/supportsLocalAiTools = appFlavor === "desktop-admin"/,
	);
	assert.match(adminLayout, /supportsLocalAiTools/);
	assert.match(adminLayout, /\/admin\/co-writer/);
	assert.doesNotMatch(
		flavor,
		/appFlavor === "desktop-user"[\s\S]*supportsAdminPanel/,
	);
});

test("desktop releases use only the dedicated admin tag family", async () => {
	const workflow = await source(
		".github",
		"workflows",
		"release-desktop-admin.yml",
	);

	assert.match(workflow, /- "desktop-admin-v\*"/);
	assert.doesNotMatch(workflow, /- "v\*"/);
	assert.doesNotMatch(workflow, /- "desktop-v\*"/);
	assert.doesNotMatch(workflow, /- "selorson-v\*"/);
	assert.match(workflow, /DESKTOP_BACKEND_REF/);
	assert.match(workflow, /shared-user-gate:/);
	assert.match(workflow, /needs: shared-user-gate/);
	assert.match(workflow, /npm run build:desktop:user/);
	assert.match(workflow, /npm run build:mobile:user/);
	assert.doesNotMatch(workflow, /DESKTOP_ADMIN_UPDATER_ENABLED/);
	assert.match(workflow, /VITE_DESKTOP_UPDATER_ENABLED: "true"/);
	assert.match(workflow, /cache: npm/);
	assert.match(workflow, /uses: actions\/cache@v4/);
	assert.match(workflow, /frontend-v3\/src-tauri\/target/);
	assert.match(
		workflow,
		/hashFiles\('frontend-v3\/src-tauri\/Cargo\.lock'\)/,
	);
	assert.match(workflow, /restore-keys:/);
});

test("public web CI never waits for a native desktop build", async () => {
	const workflow = await source(".github", "workflows", "check.yml");

	assert.doesNotMatch(workflow, /^  desktop:/m);
	assert.doesNotMatch(workflow, /cargo check/);
	assert.match(workflow, /^  web:/m);
});

test("desktop-user has a separate shell without admin bridge resources", async () => {
	const packageJson = JSON.parse(await source("package.json"));
	const config = JSON.parse(
		await source("src-tauri", "tauri.user.conf.json"),
	);
	const rust = await source("src-tauri", "src", "lib.rs");
	const buildScript = await source("src-tauri", "build.rs");
	const desktopBuild = await source("scripts", "desktop-build.cjs");

	assert.match(packageJson.scripts["build:desktop:user"], /desktop-build\.cjs user/);
	assert.match(packageJson.scripts["tauri:build:user"], /tauri\.user\.conf\.json/);
	assert.equal(config.identifier, "com.selorson.desktop.user");
	assert.deepEqual(config.bundle.resources, []);
	assert.match(buildScript, /SELORSON_APP_FLAVOR/);
	assert.match(desktopBuild, /https:\/\/selorson-v3-api\.fly\.dev\/api\/v1/);
	assert.match(desktopBuild, /audience === "user"/);
	assert.match(rust, /cfg\(selorson_desktop_user\)/);
	assert.match(rust, /fn run_user\(\)/);
	assert.match(rust, /fn run_admin\(\)/);
});

test("Android admin and user builds have separate flavors and assets", async () => {
	const packageJson = JSON.parse(await source("package.json"));
	const gradle = await source("android", "app", "build.gradle");
	const syncScript = await source("scripts", "android-sync-flavor.cjs");

	assert.equal(
		packageJson.scripts["android:sync:admin"],
		"node scripts/android-sync-flavor.cjs admin",
	);
	assert.equal(
		packageJson.scripts["android:sync:user"],
		"node scripts/android-sync-flavor.cjs user",
	);
	assert.match(gradle, /productFlavors/);
	assert.match(gradle, /applicationId "com\.selorson\.app"/);
	assert.match(gradle, /applicationId "com\.selorson\.android\.user"/);
	assert.match(syncScript, /src["'],\s*audience,\s*["']assets/s);
});
