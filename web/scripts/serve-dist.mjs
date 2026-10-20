// Tiny static server for a production build, optionally under a sub-path (like GitHub Pages).
// Usage: node web/scripts/serve-dist.mjs <distDir> [port=4173] [base=/]
//   node web/scripts/serve-dist.mjs web/dist 4173 /sendit/   → http://localhost:4173/sendit/
// Anything outside `base` and any missing file is a 404 (logged to stderr as "404 <path>"), so a
// smoke test catches root-absolute URLs that ignore the base. Serves .gz / .br siblings when present
// and the client accepts them (what a CDN would do), and sends Pages-like cache headers (max-age=600 +
// ETag; hashed bundles immutable).
import http from 'http';
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
const base = ('/' + (process.argv[4] || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === base.slice(0, -1)) { res.writeHead(301, { Location: base + url.search }); res.end(); return; }
  if (!p.startsWith(base)) { console.error(`404 ${p} (outside ${base})`); res.writeHead(404); res.end('not found'); return; }
  p = p.slice(base.length);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.error(`404 ${url.pathname}`);
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(file);
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // Hashed bundles never change; everything else revalidates (docs/launch.md § Caching).
    // Others: what GitHub Pages sends (10 min), with an ETag so a revalidation is a 304, like any real host.
    'Cache-Control': /\/assets\/[^/]+-[\w-]{8}\.\w+$/.test(url.pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=600',
  };
  const st = fs.statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  headers.ETag = etag;
  if (req.headers["if-none-match"] === etag) { if (process.env.LOG) console.log(`304 ${url.pathname}`); res.writeHead(304, headers); res.end(); return; }
  const ae = String(req.headers['accept-encoding'] || '');
  let send = file;
  if (/\bbr\b/.test(ae) && fs.existsSync(file + '.br')) { send = file + '.br'; headers['Content-Encoding'] = 'br'; }
  else if (/\bgzip\b/.test(ae) && fs.existsSync(file + '.gz')) { send = file + '.gz'; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = fs.statSync(send).size;
  if (process.env.LOG) console.log(`200 ${headers["Content-Length"]} ${url.pathname}`);   // LOG=1: every full response
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(send).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${base}`));
