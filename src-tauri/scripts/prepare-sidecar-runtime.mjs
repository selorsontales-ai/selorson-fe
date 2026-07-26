// Stage the Node runtime and sidecar dependencies the desktop bundle ships.
//
// The installed app must drive Claude on a host that has never had Node
// installed, so the runtime is copied out of the Node running this script and
// the pinned dependencies are verified before the bundler picks them up.
//
// Verification is deliberate rather than automatic: a build that silently
// repaired a missing dependency could ship an installer nobody validated.

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(scriptDir, '..');
const sidecarDir = join(tauriDir, 'sidecar');
const runtimeDir = join(tauriDir, 'sidecar-runtime');
const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';

function fail(message, remedy) {
  console.error(`[sidecar-runtime] ${message}`);
  if (remedy) console.error(`[sidecar-runtime] fix: ${remedy}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

/** The pinned dependency versions come from the lockfile, never from a range. */
function pinnedDependencies() {
  const lock = readJson(join(sidecarDir, 'package-lock.json'));
  const pins = new Map();
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith('node_modules/')) continue;
    pins.set(path.slice('node_modules/'.length), entry.version);
  }
  if (pins.size === 0) fail('the sidecar lockfile pins no dependencies');
  return pins;
}

/** playwright-core declares the Node floor the sidecar has to satisfy. */
function requiredNodeMajor() {
  const engines = readJson(join(sidecarDir, 'node_modules', 'playwright-core', 'package.json'))
    .engines?.node;
  const match = String(engines ?? '').match(/(\d+)/);
  if (!match) fail('playwright-core does not declare a Node engine range');
  return Number.parseInt(match[1], 10);
}

function verifyDependencies() {
  for (const [name, version] of pinnedDependencies()) {
    const manifest = join(sidecarDir, 'node_modules', name, 'package.json');
    let installed;
    try {
      installed = readJson(manifest).version;
    } catch {
      installed = null;
    }
    if (installed !== version) {
      fail(
        `sidecar dependency ${name} is ${installed ?? 'missing'} but the lockfile pins ${version}`,
        'npm ci --prefix src-tauri/sidecar'
      );
    }
  }
}

function verifyNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  const minimum = requiredNodeMajor();
  if (major < minimum) {
    fail(
      `this Node is v${process.versions.node} but the sidecar needs v${minimum} or newer`,
      `run the build with Node ${minimum}+`
    );
  }
  return major;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function stageRuntime() {
  const source = process.execPath;
  const target = join(runtimeDir, nodeBinary);
  mkdirSync(runtimeDir, { recursive: true });
  copyFileSync(source, target);

  const manifest = {
    // Recorded so a shipped installer can be traced back to an exact runtime.
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    binary: nodeBinary,
    sha256: sha256(target),
    stagedAt: new Date().toISOString()
  };
  writeFileSync(join(runtimeDir, 'runtime.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { target, manifest };
}

verifyDependencies();
verifyNodeVersion();
const { target, manifest } = stageRuntime();
const megabytes = (statSync(target).size / (1024 * 1024)).toFixed(1);
console.log(
  `[sidecar-runtime] staged Node v${manifest.nodeVersion} (${manifest.arch}, ${megabytes} MB) for bundling`
);
