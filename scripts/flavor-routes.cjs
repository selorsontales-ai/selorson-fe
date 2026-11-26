const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE_ROUTES = path.join(ROOT, "src", "routes");
const GENERATED_ROOT = path.join(ROOT, ".flavor-routes");

const USER_FLAVORS = new Set(["web-user", "desktop-user", "android-user"]);
const USER_EXCLUDED_ROUTES = [
  "(app)/admin",
  "(app)/support-workspace",
];
const DESKTOP_ADMIN_ONLY_ROUTES = [
  "(app)/admin/desktop-update",
];

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isWithin(relativePath, routePrefix) {
  return (
    relativePath === routePrefix || relativePath.startsWith(`${routePrefix}/`)
  );
}

function hasPrivateTestSegment(normalizedPath) {
  return normalizedPath
    .split("/")
    .some((segment) => segment.startsWith("__"));
}

function includesRoute(flavor, relativePath) {
  const normalized = normalize(relativePath);
  if (USER_FLAVORS.has(flavor)) {
    if (USER_EXCLUDED_ROUTES.some((route) => isWithin(normalized, route))) {
      return false;
    }
    if (hasPrivateTestSegment(normalized)) {
      return false;
    }
  }
  if (
    flavor !== "desktop-admin" &&
    DESKTOP_ADMIN_ONLY_ROUTES.some((route) => isWithin(normalized, route))
  ) {
    return false;
  }
  return true;
}

function prepareFlavorRoutes(flavor) {
  if (flavor === "desktop-admin") return null;

  const destination = path.join(GENERATED_ROOT, flavor);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(GENERATED_ROOT, { recursive: true });
  // The root layout imports ../app.css. Keep the generated route root at the
  // same relative depth as src/routes by mirroring that shared stylesheet.
  fs.copyFileSync(
    path.join(ROOT, "src", "app.css"),
    path.join(GENERATED_ROOT, "app.css")
  );
  fs.cpSync(SOURCE_ROUTES, destination, {
    recursive: true,
    filter(source) {
      const relativePath = path.relative(SOURCE_ROUTES, source);
      return !relativePath || includesRoute(flavor, relativePath);
    },
  });

  return normalize(path.relative(ROOT, destination));
}

module.exports = {
  DESKTOP_ADMIN_ONLY_ROUTES,
  USER_FLAVORS,
  includesRoute,
  prepareFlavorRoutes,
};
