const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { includesRoute, prepareFlavorRoutes } = require("./flavor-routes.cjs");

const ROOT = path.join(__dirname, "..");
const platform = process.argv[2];
const audience = process.argv[3];

if (!["web", "desktop", "android"].includes(platform)) {
  throw new Error("Dev platform must be web, desktop, or android.");
}
if (!["admin", "user"].includes(audience)) {
  throw new Error("Dev audience must be admin or user.");
}

const flavor = `${platform}-${audience}`;
const buildTarget = platform === "android" ? "mobile" : platform;
const routesDir = prepareFlavorRoutes(flavor);
const generatedRoutesDir = routesDir ? path.join(ROOT, routesDir) : null;

function syncRouteChange(_eventType, filename) {
  if (!filename) {
    prepareFlavorRoutes(flavor);
    return;
  }

  const relativePath = filename.toString();
  const source = path.join(ROOT, "src", "routes", relativePath);
  const destination = path.join(generatedRoutesDir, relativePath);
  if (!includesRoute(flavor, relativePath) || !fs.existsSync(source)) {
    fs.rmSync(destination, { recursive: true, force: true });
    return;
  }

  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function syncAppCss() {
  fs.copyFileSync(
    path.join(ROOT, "src", "app.css"),
    path.join(ROOT, ".flavor-routes", "app.css")
  );
}

const watchers = [];
if (generatedRoutesDir) {
  watchers.push(
    fs.watch(
      path.join(ROOT, "src", "routes"),
      { recursive: true },
      syncRouteChange
    ),
    fs.watch(path.join(ROOT, "src", "app.css"), syncAppCss)
  );
}

const vitePackageJson = require.resolve("vite/package.json");
const viteCli = path.join(path.dirname(vitePackageJson), "bin", "vite.js");
const viteArgs = [viteCli, "dev"];
if (platform === "desktop") viteArgs.push("--mode", "desktop");
if (platform === "android") viteArgs.push("--host", "--mode", "mobile");

const child = spawn(process.execPath, viteArgs, {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    BUILD_TARGET: buildTarget,
    VITE_BUILD_TARGET: buildTarget,
    VITE_APP_FLAVOR: flavor,
    SELORSON_ROUTES_DIR: routesDir ?? "",
  },
});

function closeWatchers() {
  for (const watcher of watchers) watcher.close();
}

child.on("error", (error) => {
  closeWatchers();
  throw error;
});
child.on("exit", (code, signal) => {
  closeWatchers();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
