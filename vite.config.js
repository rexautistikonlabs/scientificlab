import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 4180, host: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 4096,
    // one module graph, ~200 kB gzipped including three — a single request is
    // faster here than splitting it
    chunkSizeWarningLimit: 900,
  },
});
