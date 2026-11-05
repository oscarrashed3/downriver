import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` makes a normal static site for GitHub Pages (base /downriver/).
// `vite build --mode single` inlines everything into one HTML file.
export default defineConfig(({ mode }) => ({
  base: mode === 'single' ? './' : '/downriver/',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
}));
