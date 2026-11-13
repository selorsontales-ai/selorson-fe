import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const workspaceDir = fileURLToPath(new URL('.', import.meta.url));
const threlteExtrasDist = existsSync(resolve(workspaceDir, 'node_modules/@threlte/extras/dist'))
	? resolve(workspaceDir, 'node_modules/@threlte/extras/dist')
	: resolve(workspaceDir, '../node_modules/@threlte/extras/dist');

const NODE_BUILT_INS_WITHOUT_PREFIX = [
	'async_hooks',
	'buffer',
	'crypto',
	'events',
	'fs',
	'http',
	'https',
	'net',
	'os',
	'path',
	'stream',
	'tls',
	'url',
	'util',
	'zlib'
];

/**
 * Resolves `@threlte/extras` to ONLY the 3 lightweight primitives used by the
 * web planet/region map (`Billboard`, `OrbitControls`, `interactivity`),
 * preventing Rollup/Rolldown from pulling `GLTF`, `DRACOLoader`, `KTX2Loader`,
 * and ~1.9 MB of unused Draco/Basis WASM decoders into the client bundle.
 */
function threlteLitePlugin(): Plugin {
	const virtualId = '\0virtual:threlte-extras-lite';
	return {
		name: 'selorson-threlte-extras-lite',
		enforce: 'pre',
		resolveId(id) {
			if (id === '@threlte/extras') return virtualId;
			return null;
		},
		load(id) {
			if (id !== virtualId) return null;
			const billboard = JSON.stringify(
				resolve(threlteExtrasDist, 'components/Billboard/Billboard.svelte')
			);
			const orbit = JSON.stringify(
				resolve(threlteExtrasDist, 'components/controls/OrbitControls/OrbitControls.svelte')
			);
			const inter = JSON.stringify(resolve(threlteExtrasDist, 'interactivity/index.js'));
			return [
				`export { default as Billboard } from ${billboard};`,
				`export { default as OrbitControls } from ${orbit};`,
				`export { interactivity } from ${inter};`
			].join('\n');
		}
	};
}

export default defineConfig({
	plugins: [
		threlteLitePlugin(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			disableAsyncLocalStorage: true
		}),
		tailwindcss(),
		sveltekit()
	],
	resolve: {
		alias: Object.fromEntries(
			NODE_BUILT_INS_WITHOUT_PREFIX.map((mod) => [mod, `node:${mod}`])
		)
	},
	server: {
		port: 5173
	}
});
