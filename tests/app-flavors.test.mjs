import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { includesRoute } = require("../scripts/flavor-routes.cjs");

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
    "+layout.svelte"
  );

  assert.match(flavor, /supportsLocalAiTools = appFlavor === "desktop-admin"/);
  assert.match(adminLayout, /supportsLocalAiTools/);
  assert.match(adminLayout, /\/admin\/co-writer/);
  assert.doesNotMatch(
    flavor,
    /appFlavor === "desktop-user"[\s\S]*supportsAdminPanel/
  );
});

test("user flavors exclude every admin route at build time", () => {
  for (const flavor of ["web-user", "desktop-user", "android-user"]) {
    assert.equal(includesRoute(flavor, "(app)/admin/+page.svelte"), false);
    assert.equal(includesRoute(flavor, "(app)/stories/+page.svelte"), true);
  }
});

test("non-desktop admin flavors exclude local desktop tools", () => {
  for (const flavor of ["web-admin", "android-admin"]) {
    assert.equal(includesRoute(flavor, "(app)/admin/+page.svelte"), true);
    assert.equal(
      includesRoute(flavor, "(app)/admin/co-writer/+page.svelte"),
      false
    );
    assert.equal(
      includesRoute(flavor, "(app)/admin/desktop-update/+page.svelte"),
      false
    );
  }
  assert.equal(
    includesRoute("desktop-admin", "(app)/admin/co-writer/+page.svelte"),
    true
  );
});

test("public web defaults to the user flavor and has an explicit admin build", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const flavor = await source("src", "lib", "app-flavor.ts");

  assert.equal(packageJson.scripts.build, "npm run build:web:user");
  assert.match(packageJson.scripts["dev:web:user"], /flavor-dev\.cjs web user/);
  assert.match(
    packageJson.scripts["dev:web:admin"],
    /flavor-dev\.cjs web admin/
  );
  assert.match(
    packageJson.scripts["dev:desktop:user"],
    /flavor-dev\.cjs desktop user/
  );
  assert.match(
    packageJson.scripts["dev:mobile:user"],
    /flavor-dev\.cjs android user/
  );
  assert.match(packageJson.scripts["build:web:user"], /web-build\.cjs user/);
  assert.match(packageJson.scripts["build:web:admin"], /web-build\.cjs admin/);
  assert.match(flavor, /return "web-user"/);
  assert.match(flavor, /appFlavor === "web-admin"/);
  assert.doesNotMatch(flavor, /appFlavor === "web"/);
});

test("flavor dev launches Vite without spawning a Windows cmd shim", async () => {
  const devScript = await source("scripts", "flavor-dev.cjs");

  assert.match(devScript, /require\.resolve\("vite\/package\.json"\)/);
  assert.match(devScript, /spawn\(process\.execPath, viteArgs/);
  assert.doesNotMatch(devScript, /npx\.cmd/);
});

test("desktop releases use only the dedicated admin tag family", async () => {
  const workflow = await source(
    ".github",
    "workflows",
    "release-desktop-admin.yml"
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
  assert.match(workflow, /hashFiles\('frontend-v3\/src-tauri\/Cargo\.lock'\)/);
  assert.match(workflow, /restore-keys:/);
  assert.match(workflow, /npm run build:web:admin/);
  assert.match(workflow, /npm run build:web:user/);
  assert.match(workflow, /npm run build:mobile:admin/);
});

test("public web CI never waits for a native desktop build", async () => {
  const workflow = await source(".github", "workflows", "check.yml");

  assert.doesNotMatch(workflow, /^  desktop:/m);
  assert.doesNotMatch(workflow, /cargo check/);
  assert.match(workflow, /^  web:/m);
});

test("desktop-user has a separate shell without admin bridge resources", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const config = JSON.parse(await source("src-tauri", "tauri.user.conf.json"));
  const rust = await source("src-tauri", "src", "lib.rs");
  const buildScript = await source("src-tauri", "build.rs");
  const desktopBuild = await source("scripts", "desktop-build.cjs");

  assert.match(
    packageJson.scripts["build:desktop:user"],
    /desktop-build\.cjs user/
  );
  assert.match(
    packageJson.scripts["tauri:build:user"],
    /tauri\.user\.conf\.json/
  );
  assert.equal(config.identifier, "com.selorson.desktop.user");
  assert.equal(config.productName, "Selorson");
  assert.deepEqual(config.bundle.resources, []);
  assert.match(buildScript, /SELORSON_APP_FLAVOR/);
  assert.match(desktopBuild, /https:\/\/selorson-v3-api\.fly\.dev\/api\/v1/);
  assert.match(desktopBuild, /audience === "user"/);
  assert.match(rust, /cfg\(selorson_desktop_user\)/);
  assert.match(rust, /fn run_user\(\)/);
  assert.match(rust, /fn run_admin\(\)/);
});

test("desktop-admin has a visibly separate installer identity", async () => {
  const config = JSON.parse(await source("src-tauri", "tauri.conf.json"));
  assert.equal(config.productName, "Selorson Admin");
  assert.equal(config.app.windows[0].title, "Selorson Admin");
});

test("Android admin and user builds have separate flavors and assets", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const gradle = await source("android", "app", "build.gradle");
  const syncScript = await source("scripts", "android-sync-flavor.cjs");

  assert.equal(
    packageJson.scripts["android:sync:admin"],
    "node scripts/android-sync-flavor.cjs admin"
  );
  assert.equal(
    packageJson.scripts["android:sync:user"],
    "node scripts/android-sync-flavor.cjs user"
  );
  assert.match(gradle, /productFlavors/);
  assert.match(gradle, /applicationId "com\.selorson\.app"/);
  assert.match(gradle, /applicationId "com\.selorson\.android\.user"/);
  assert.match(syncScript, /src["'],\s*audience,\s*["']assets/s);
  assert.match(gradle, /ANDROID_VERSION_CODE/);
  assert.match(gradle, /ANDROID_KEYSTORE_PATH/);
});

test("CI builds every platform-audience boundary without delaying public deploy", async () => {
  const boundaries = await source(
    ".github",
    "workflows",
    "flavor-boundaries.yml"
  );
  const deploy = await source(".github", "workflows", "deploy.yml");
  const verifier = await source("scripts", "verify-flavor-bundle.cjs");

  for (const command of [
    "build:web:user",
    "build:web:admin",
    "build:desktop:user",
    "build:desktop:admin",
    "build:mobile:user",
    "build:mobile:admin",
  ]) {
    assert.match(boundaries, new RegExp(`npm run ${command}`));
  }
  assert.match(deploy, /npm run build:web:user/);
  assert.doesNotMatch(deploy, /npm run build:web:admin/);
  assert.match(deploy, /^  build:/m);
  assert.match(deploy, /^  deploy:/m);
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /actions\/upload-artifact@v4/);
  assert.match(deploy, /include-hidden-files: true/);
  assert.match(verifier, /flavor !== "desktop-admin"/);
});

test("release channels and credentials are isolated by audience", async () => {
  const webAdmin = await source(".github", "workflows", "deploy-web-admin.yml");
  const desktopUser = await source(
    ".github",
    "workflows",
    "release-desktop-user.yml"
  );
  const desktopAdmin = await source(
    ".github",
    "workflows",
    "release-desktop-admin.yml"
  );
  const android = await source(".github", "workflows", "release-android.yml");

  assert.match(webAdmin, /CLOUDFLARE_ADMIN_PROJECT_NAME/);
  assert.match(webAdmin, /npm run build:web:admin/);
  assert.match(webAdmin, /^  build:/m);
  assert.match(webAdmin, /^  deploy:/m);
  assert.match(webAdmin, /needs: build/);
  assert.match(webAdmin, /include-hidden-files: true/);
  assert.match(desktopUser, /- "desktop-user-v\*"/);
  assert.match(desktopUser, /\^\[0-9a-fA-F\]\{40\}\$/);
  assert.match(desktopUser, /^  publish:/m);
  assert.match(desktopUser, /needs: build/);
  assert.match(desktopAdmin, /^  publish:/m);
  assert.match(desktopAdmin, /needs: windows-installer/);
  assert.match(android, /- "android-admin-v\*"/);
  assert.match(android, /- "android-user-v\*"/);
  assert.match(android, /ANDROID_ADMIN_KEYSTORE_BASE64/);
  assert.match(android, /ANDROID_USER_KEYSTORE_BASE64/);
  assert.match(android, /major \* 1000000/);
  assert.doesNotMatch(android, /github\.run_number/);
  assert.match(android, /^  publish:/m);
  assert.match(android, /needs: bundle/);
});

test("two data modes exist for desktop-admin only, and default to the safe one", async () => {
  const flavor = await source("src", "lib", "app-flavor.ts");
  const mode = await source("src", "lib", "desktop-mode.svelte.ts");
  const layout = await source("src", "routes", "+layout.svelte");

  // Only the flavor that embeds its own backend can point it somewhere else.
  assert.match(flavor, /supportsDataModes = appFlavor === "desktop-admin"/);
  assert.match(mode, /if \(!supportsDataModes\) return;/);

  // The mode has to be resolved before the session is read, because each mode
  // keeps its own login under its own key.
  assert.match(layout, /initDataMode\(\)\.then\(\(\) => \{\s*initAuth\(\);/);
});

test("the launch gate is answered per session, never remembered", async () => {
  const mode = await source("src", "lib", "desktop-mode.svelte.ts");

  // Persisting the acknowledgement would turn it back into a banner, and a
  // banner that is always there stops being read.
  assert.match(mode, /let acknowledged = \$state\(false\)/);
  assert.doesNotMatch(mode, /localStorage/);
  assert.match(mode, /status\?\.mode === "production" && !acknowledged/);
});

test("a session belongs to the mode that issued it", async () => {
  const storage = await source("src", "lib", "session-storage.ts");
  const auth = await source("src", "lib", "stores", "auth.svelte.ts");
  const api = await source("src", "lib", "api.ts");

  assert.match(storage, /selorson_token\$\{dataModeScope\(\)\}/);
  // No literal key may survive: one would silently share a token between two
  // different user tables.
  assert.doesNotMatch(auth, /'selorson_token'/);
  assert.doesNotMatch(api, /'selorson_token'/);
  assert.match(auth, /tokenStorageKey\(\)/);
  assert.match(api, /tokenStorageKey\(\)/);
});

test("production mode leaves newsletter sending to the deployment", async () => {
  const tauri = await source("src-tauri", "src", "lib.rs");
  const dataMode = await source("src-tauri", "src", "data_mode.rs");

  // Set for both modes, not only production: a restart inherits the previous
  // process's environment, so an "off" left over from production would
  // silently disable the workers in local too.
  assert.match(tauri, /SELORSON_BACKGROUND_WORKERS/);
  assert.match(tauri, /DataMode::Production => "off"/);
  assert.match(tauri, /DataMode::Local => "on"/);

  // Production is refused rather than approximated when unconfigured.
  assert.match(dataMode, /fell_back/);
  assert.match(dataMode, /unwrap_or\(DataMode::Local\)/);
});

test("the mode badge sits beside the wordmark, never inside its link", async () => {
  const layout = await source("src", "routes", "+layout.svelte");

  // A button nested in an anchor is invalid HTML, and every click on the badge
  // would also navigate home. Sliced to the first closing tag rather than
  // matched with a regex: a lazy match would happily run on to a later </a> in
  // the navigation and report a leak that is not there.
  const linkStart = layout.indexOf('class="logo-link"');
  const linkEnd = layout.indexOf("</a>", linkStart);
  assert.ok(linkStart > -1 && linkEnd > linkStart, "logo link not found");
  assert.ok(
    !layout.slice(linkStart, linkEnd).includes("dataModeBadge"),
    "the badge must not be rendered inside the logo link"
  );
  assert.match(layout, /class="brand"/);
});

test("the launch gate renders outside the header", async () => {
  const layout = await source("src", "routes", "+layout.svelte");
  const shell = await source(
    "src",
    "lib",
    "components",
    "desktop",
    "DesktopDataMode.svelte"
  );

  // The header carries a backdrop-filter, which makes it a containing block for
  // fixed positioning: an overlay inside it is confined to the header strip.
  assert.match(shell, /DataModeGate/);
  assert.match(shell, /DataModeSwitchSheet/);

  const headerStart = layout.indexOf('<header class="site-header">');
  const headerEnd = layout.indexOf("</header>", headerStart);
  assert.ok(headerStart > -1 && headerEnd > headerStart, "header not found");
  assert.ok(
    !layout.slice(headerStart, headerEnd).includes("dataModeUi"),
    "the gate and switch prompt must not render inside the header"
  );
});

test("local mode shares no live resource beyond the database", async () => {
  const tauri = await source("src-tauri", "src", "lib.rs");

  // One Redis, one mail account, one media bucket and one signing key serve
  // every instance. Separating the database alone would leave local mode able
  // to reach real readers through any of them.
  assert.match(tauri, /fn isolate_local_mode/);

  // Cache and pub/sub: entries read from one database must never be served
  // from another, in either direction.
  assert.match(tauri, /SELORSON_CACHE_NAMESPACE/);
  assert.match(tauri, /"desktop-production"/);
  assert.match(tauri, /"desktop-local"/);

  // Uploads land in their own scope rather than beside the live site's files.
  assert.match(tauri, /SELORSON_STORAGE_PREFIX/);

  // No mail account, so a test newsletter reaches the log instead of real
  // subscribers.
  assert.match(tauri, /"SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"/);

  // Both modes look users up by id and the ids overlap, so a token signed in
  // one must not verify in the other. Derived, so editing a file cannot undo it.
  assert.match(tauri, /JWT_SECRET.*desktop-local|desktop-local.*JWT_SECRET/s);
});
