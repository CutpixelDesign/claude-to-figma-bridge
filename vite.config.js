import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/ui/index.html'),
    },
  },
});
