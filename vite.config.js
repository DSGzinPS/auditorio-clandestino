import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:standalone` gera um único HTML que abre com dois cliques (sem servidor).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'standalone' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'standalone' ? 'dist-standalone' : 'dist' },
}));
