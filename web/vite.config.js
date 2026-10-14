import { defineConfig } from 'vite';
import { resolve } from 'path';

// The shared game assets (terrain data, textures, models, audio) live in ../assets and are
// served from the site root, e.g. /terrain/height_f32.bin. CREDITS.md is copied by a tiny plugin.
export default defineConfig({
  publicDir: resolve(__dirname, '../assets'),
  server: { port: 5173, open: false, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [{
    name: 'credits',
    configureServer(server) {
      server.middlewares.use('/CREDITS.md', async (_req, res) => {
        const fs = await import('fs');
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(fs.readFileSync(resolve(__dirname, '../CREDITS.md')));
      });
    },
    async generateBundle() {
      const fs = await import('fs');
      this.emitFile({ type: 'asset', fileName: 'CREDITS.md', source: fs.readFileSync(resolve(__dirname, '../CREDITS.md')) });
    },
  }],
});
