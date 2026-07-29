/**
 * Build and sync one Capacitor flavor, then preserve its generated web assets
 * in the matching Android source set. This prevents a later admin sync from
 * replacing the user bundle (and vice versa).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const audience = process.argv[2] ?? "admin";
const flavorConfig = {
	admin: {
		appId: "com.selorson.app",
		appName: "Selorson Admin",
	},
	user: {
		appId: "com.selorson.android.user",
		appName: "Selorson",
	},
};

const selected = flavorConfig[audience];
if (!selected) {
	throw new Error("Android flavor must be either 'admin' or 'user'.");
}

execSync(`npm run build:mobile:${audience}`, {
	stdio: "inherit",
	cwd: ROOT,
});
execSync("npx cap sync android", {
	stdio: "inherit",
	cwd: ROOT,
});

const mainAssets = path.join(ROOT, "android", "app", "src", "main", "assets");
const flavorAssets = path.join(
	ROOT,
	"android",
	"app",
	"src",
	audience,
	"assets",
);

fs.rmSync(flavorAssets, { recursive: true, force: true });
fs.mkdirSync(path.dirname(flavorAssets), { recursive: true });
fs.cpSync(mainAssets, flavorAssets, { recursive: true });

const nativeConfigPath = path.join(flavorAssets, "capacitor.config.json");
const nativeConfig = JSON.parse(fs.readFileSync(nativeConfigPath, "utf8"));
nativeConfig.appId = selected.appId;
nativeConfig.appName = selected.appName;
fs.writeFileSync(
	nativeConfigPath,
	`${JSON.stringify(nativeConfig, null, "\t")}\n`,
	"utf8",
);

console.log(
	`\nAndroid ${audience} assets prepared in android/app/src/${audience}/assets.\n`,
);
