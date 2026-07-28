import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { isServerRenderedBuildTarget, isSpaBuildTarget } from '../src/lib/runtime-target.js';
import { loadPublicProfile } from '../src/lib/profile-loader.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function findFiles(directory, basename) {
	const entries = await readdir(directory, { withFileTypes: true });
	const matches = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) matches.push(...await findFiles(path, basename));
		else if (entry.name === basename) matches.push(path);
	}
	return matches;
}

test('desktop and mobile are SPA runtimes; web remains SSR', () => {
	assert.equal(isSpaBuildTarget('desktop', 'production'), true);
	assert.equal(isSpaBuildTarget('mobile', 'production'), true);
	assert.equal(isSpaBuildTarget('web', 'production'), false);
	assert.equal(isSpaBuildTarget(undefined, 'desktop'), true);
	assert.equal(isSpaBuildTarget(undefined, 'development'), false);
	assert.equal(isServerRenderedBuildTarget('web', 'production'), true);
});

test('public profile data loads in both SSR and SPA execution contexts', async () => {
	let request;
	const profile = await loadPublicProfile(
		async (url, options) => {
			request = { url, options };
			return {
				ok: true,
				json: async () => ({ success: true, data: { id: 42, name: 'Admin' } })
			};
		},
		'https://api.example.test/api/v1',
		'42'
	);

	assert.deepEqual(profile, { id: 42, name: 'Admin' });
	assert.equal(request.url, 'https://api.example.test/api/v1/profile/42');
	assert.equal(request.options.credentials, undefined);

	const unavailable = await loadPublicProfile(async () => { throw new Error('offline'); }, 'unused', '42');
	assert.equal(unavailable, null);
});

test('SPA-compatible routes do not depend on server-only page loads', async () => {
	const serverLoads = await findFiles(join(root, 'src', 'routes'), '+page.server.ts');
	assert.deepEqual(
		serverLoads,
		[],
		'Packaged apps cannot serve SvelteKit +page.server.ts data endpoints'
	);
});

test('desktop-critical routes remain present, including Co-Writer', async () => {
	const routes = [
		join('src', 'routes', '(app)', 'profile', '[id]', '+page.svelte'),
		join('src', 'routes', '(app)', 'settings', '+page.svelte'),
		join('src', 'routes', '(app)', 'messages', '+page.svelte'),
		join('src', 'routes', '(app)', 'admin', 'co-writer', '+page.svelte')
	];

	for (const route of routes) {
		assert.ok(await readFile(join(root, route), 'utf8'), route + ' must remain available');
	}
});

test('Tauri uses the desktop dev and build targets', async () => {
	const config = JSON.parse(
		await readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')
	);
	assert.equal(config.build.beforeDevCommand, 'npm run dev:desktop');
	assert.match(config.build.beforeBuildCommand, /^npm run build:desktop\b/);
	assert.equal(config.build.frontendDist, '../build');
});

test('runtime target is derived consistently by the root layout', async () => {
	const layout = await readFile(join(root, 'src', 'routes', '+layout.ts'), 'utf8');
	assert.match(layout, /isServerRenderedBuildTarget/);
	assert.match(layout, /VITE_BUILD_TARGET/);
	assert.match(layout, /import\.meta\.env\.MODE/);
});
