import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1100,
    // No manualChunks here on purpose. Forcing three.js into a named chunk
    // makes Vite emit a <link modulepreload> for it from index.html, so every
    // signed-in user downloads ~960kB of WebGL they will never execute.
    // Letting Rollup split it naturally keeps three reachable only through the
    // lazily-imported landing page.
  },
})
