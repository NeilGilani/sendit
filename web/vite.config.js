import { defineConfig } from 'vite';
import { resolve, relative, sep } from 'path';
import fs from 'fs';

// The shared game assets (models, audio, textures, loading stills, map art, Tahoe elevation) live in
// ../assets and are served from the site root in dev, e.g. /models/skier/skier.gltf. The production
// build doesn't copy that folder wholesale: it also holds the legacy Godot game's files (terrain/*.bin,
// 2K textures, Quaternius pines / Poly Haven rocks, *.import), ~70 MB the web game never loads.
// copyAssets() copies everything else into dist/ (see SKIP below; docs/launch.md).
// Deploying under a sub-path: `npm run build -- --base /sendit/` (code fetches through src/base.js).
const ASSETS = resolve(__dirname, '../assets');
const SKIP = [
  /\.import$/, /(^|\/)\.gdignore$/, /(^|\/)\.gitkeep$/, /(^|\/)\.DS_Store$/,
  /^terrain\//,                    // Godot Matterhorn heightfield, splat, scatter (web build: course.js / maps/)
  /^textures\/[^/]+\.(jpg|png)$/,  // 2K Poly Haven sources; the web game uses textures/web/ only
  /^models\/nature\//, /^models\/rocks\//,   // trees and rocks are built in code (scatter.js, gfx/)
];
const skipped = (rel) => SKIP.some((re) => re.test(rel));

function copyAssets() {
  let outDir = 'dist';
  return {
    name: 'sendit-assets',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      let files = 0, bytes = 0;
      fs.cpSync(ASSETS, outDir, {
        recursive: true,
        filter: (src) => {
          const rel = relative(ASSETS, src).split(sep).join('/');
          if (!rel) return true;
          if (skipped(rel) || skipped(rel + '/')) return false;
          const st = fs.statSync(src);
          if (st.isFile()) { files++; bytes += st.size; }
          return true;
        },
      });
      fs.copyFileSync(resolve(__dirname, '../CREDITS.md'), resolve(outDir, 'CREDITS.md'));
      console.log(`[sendit-assets] copied ${files} files, ${(bytes / 1048576).toFixed(1)} MB from ../assets`);
    },
  };
}

let siteBase = '/';
export default defineConfig(({ command }) => ({
  // Dev serves ../assets as the public folder; the build copies a filtered set (copyAssets).
  publicDir: command === 'serve' ? ASSETS : false,
  server: { port: 5173, open: false, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },   // module workers (src/loading/worker.js) may code-split / import()
  plugins: [copyAssets(), {
    // Open Graph / Twitter cards need absolute URLs: SITE_URL=https://example.github.io/sendit/ npm run build.
    // Without it they fall back to the base path (fine for the page, but link previews then show no image).
    name: 'sendit-site-url',
    configResolved(c) { siteBase = c.base; },
    transformIndexHtml(html) {
      const site = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : (siteBase || '/');
      return html.split('__SITE_URL__').join(site);
    },
  }, {
    name: 'credits',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/CREDITS.md', (_req, res) => {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.end(fs.readFileSync(resolve(__dirname, '../CREDITS.md')));
      });
    },
  }],
}));
