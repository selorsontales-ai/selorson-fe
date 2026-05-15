import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sentrySvelteKit({
        sourceMapsUploadOptions: {
            org: "your-org", // Change this if you have a specific org name
            project: "selorson-frontend",
        }
    }), tailwindcss(), sveltekit()],
	server: {
		port: 3001,
	},
});
