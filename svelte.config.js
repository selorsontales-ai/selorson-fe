import adapterStatic from '@sveltejs/adapter-static';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';

const isMobile = process.env.BUILD_TARGET === 'mobile';
const isDesktop = process.env.BUILD_TARGET === 'desktop';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: (isMobile || isDesktop)
			? adapterStatic({
					pages: 'build',
					assets: 'build',
					fallback: 'index.html', // SPA mode cho Capacitor Mobile
					precompress: false,
					strict: false
				})
			: adapterCloudflare({
					routes: {
						include: ['/*'],
						exclude: ['<all>']
					}
				})
	}
};

export default config;
