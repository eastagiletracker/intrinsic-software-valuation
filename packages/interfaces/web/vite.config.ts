import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		watch: {
			// Ignore changes in sibling workspace packages (symlinked via pnpm).
			// Without this, every file save in packages/clients/, packages/services/,
			// etc. triggers a full SSR reload, which kills long-running API requests
			// such as the ~5-minute ISV pipeline calculation.
			ignored: ['**/packages/clients/**', '**/packages/services/**', '**/packages/domain/**', '**/packages/pipelines/**'],
		},
	},
});
