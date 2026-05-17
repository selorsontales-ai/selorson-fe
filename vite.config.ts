
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const NODE_BUILT_INS_WITHOUT_PREFIX = [
	'async_hooks', 'buffer', 'crypto', 'events', 'fs', 'http', 'https',
	'net', 'os', 'path', 'stream', 'tls', 'url', 'util', 'zlib'
];

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			disableAsyncLocalStorage: true,
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
		port: 3001,
	},
});
