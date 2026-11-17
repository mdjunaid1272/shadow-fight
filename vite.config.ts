import { defineConfig } from 'vite';
// base './' keeps every asset path relative, so the build works from any sub-path (e.g. GitHub Pages /shadow-fight/) and in Capacitor.
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 900 }, server: { host: true } });
