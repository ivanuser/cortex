import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		extensions: ['.svelte.ts', '.svelte.js', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
	}
});
