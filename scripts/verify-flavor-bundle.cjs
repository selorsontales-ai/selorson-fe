const fs = require("fs");
const path = require("path");
const {
  DESKTOP_ADMIN_ONLY_ROUTES,
  USER_FLAVORS,
} = require("./flavor-routes.cjs");

const NATIVE_BRIDGE_NEEDLES = [
  "__nf_ctl",
  "artifact-runner",
  "playwright-core",
  "runner_run_job",
  "runner_start_sidecar",
];

function collectManifestSources(value, sources = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectManifestSources(item, sources);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "src" && typeof item === "string") sources.push(item);
      collectManifestSources(item, sources);
    }
  }
  return sources;
}

function readManifestSources(outputRoot) {
  const manifestPath = path.join(
    outputRoot,
    "server",
    ".vite",
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing SvelteKit server manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return collectManifestSources(manifest).map((source) =>
    source.replaceAll("\\", "/")
  );
}

function readClientJavaScript(outputRoot) {
  const clientRoot = path.join(outputRoot, "client");
  const chunks = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".js"))
        chunks.push(fs.readFileSync(target, "utf8"));
    }
  };
  visit(clientRoot);
  return chunks.join("\n");
}

function verifyFlavorBundle(flavor, outputRoot) {
  const sources = readManifestSources(outputRoot);
  const adminSources = sources.filter((source) =>
    source.includes("/(app)/admin/")
  );
  const supportWorkspaceSources = sources.filter((source) =>
    source.includes("/(app)/support-workspace/")
  );
  const privateTestSources = sources.filter((source) =>
    source.split("/").some((seg) => seg.startsWith("__"))
  );
  const desktopOnlySources = adminSources.filter((source) =>
    DESKTOP_ADMIN_ONLY_ROUTES.some((route) => source.includes(`/${route}/`))
  );

  if (USER_FLAVORS.has(flavor) && adminSources.length > 0) {
    throw new Error(
      `${flavor} contains admin routes: ${adminSources.slice(0, 5).join(", ")}`
    );
  }
  if (USER_FLAVORS.has(flavor) && supportWorkspaceSources.length > 0) {
    throw new Error(
      `${flavor} contains support-workspace routes: ${supportWorkspaceSources
        .slice(0, 5)
        .join(", ")}`
    );
  }
  if (USER_FLAVORS.has(flavor) && privateTestSources.length > 0) {
    throw new Error(
      `${flavor} contains private test routes: ${privateTestSources
        .slice(0, 5)
        .join(", ")}`
    );
  }
  if (!USER_FLAVORS.has(flavor) && adminSources.length === 0) {
    throw new Error(`${flavor} is missing its admin routes`);
  }
  if (flavor !== "desktop-admin" && desktopOnlySources.length > 0) {
    throw new Error(
      `${flavor} contains desktop-admin-only routes: ${desktopOnlySources
        .slice(0, 5)
        .join(", ")}`
    );
  }
  if (
    flavor === "desktop-admin" &&
    DESKTOP_ADMIN_ONLY_ROUTES.some(
      (route) =>
        !desktopOnlySources.some((source) => source.includes(`/${route}/`))
    )
  ) {
    throw new Error(
      "desktop-admin is missing one or more desktop-only admin routes"
    );
  }

  if (flavor !== "desktop-admin") {
    const clientJavaScript = readClientJavaScript(outputRoot);
    const leakedNeedles = NATIVE_BRIDGE_NEEDLES.filter((needle) =>
      clientJavaScript.includes(needle)
    );
    if (leakedNeedles.length > 0) {
      throw new Error(
        `${flavor} contains native bridge symbols: ${leakedNeedles.join(", ")}`
      );
    }
  }

  console.log(`  Verified ${flavor} bundle boundaries`);
}

if (require.main === module) {
  const flavor = process.argv[2];
  const outputRoot =
    process.argv[3] ?? path.join(__dirname, "..", ".svelte-kit", "output");
  if (!flavor)
    throw new Error("Usage: verify-flavor-bundle.cjs <flavor> [output-root]");
  verifyFlavorBundle(flavor, outputRoot);
}

module.exports = { collectManifestSources, verifyFlavorBundle };
