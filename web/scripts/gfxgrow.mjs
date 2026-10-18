// "Growing in front of you" check: how much of the image changes only because the rider came closer.
// Steps a chase camera down a map's run in fixed metre increments. At each step it renders the frame
// twice in the same JS task (same time, same sway, same pools): once normally, once with the LOD eye
// (trees' uLodEye, or terrain uMorphEye + scatter fade eye) moved `shift` metres back along the run.
// Every pixel that differs is content that morphs / fades / grows purely with distance (LOD hand-overs,
// geomorphs, card growth, snow appearing). Camera motion, parallax and lighting cancel out exactly.
// Reports, per map: share of pixels changed per metre of travel (mean / p95 / max over the steps) and
// load time; saves a frame sequence + the worst diff masks when outDir is given.
// Usage: node scripts/gfxgrow.mjs <baseUrl> [maps] [quality] [steps] [stepMetres] [outDir] [W H]
//   e.g. node web/scripts/gfxgrow.mjs http://localhost:5186 blackspruce,ravenspire 1 60 2 /tmp/out
// ANGLE backend: ANGLE=metal (macOS, default on darwin) | d3d11 (Windows) | swiftshader.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5186', mapsArg = 'blackspruce', q = '1', steps = '60', stepM = '2', outDir = '', W = '1280', H = '720'] = process.argv.slice(2);
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const START = { 'valcrest-gully': 0.08, blackspruce: 0.12, ravenspire: 0.45, 'kitsune-peak': 0.2, fjordline: 0.2, ...JSON.parse(process.env.START || '{}') };
const SHIFT = Number(process.env.SHIFT || 1);
const THRESH = Number(process.env.THRESH || 10);   // 0..255, any channel
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
const summary = [];
try {
  for (const map of mapsArg.split(',')) {
    const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    const t0 = Date.now();
    await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
    await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 600000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const load = (Date.now() - t0) / 1000;
    await page.evaluate((f0) => {
      const s = window.__sendit, T = s.terrain, path = s.course.path;
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
      const L = cum[cum.length - 1];
      const at = (d) => {
        d = Math.max(0, Math.min(L - 1, d));
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
        const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
        return { x: path[lo].x + (path[hi].x - path[lo].x) * f, z: path[lo].y + (path[hi].y - path[lo].y) * f };
      };
      window.__at = at;
      window.__flyD = f0 * L;
      window.__gfxCam = () => {
        const c = at(window.__flyD - 7), f = at(window.__flyD + 25);
        return [c.x, T.getHeight(c.x, c.z) + 3, c.z, f.x, T.getHeight(f.x, f.z) + 1, f.z, 62];
      };
      s.player.script = (c) => { c.tuck = 1; };
    }, START[map] ?? 0.15);
    await page.waitForTimeout(1500);
    const rows = [];
    for (let i = 0; i < Number(steps); i++) {
      await page.evaluate((m) => { window.__flyD += m; }, i === 0 ? 0 : Number(stepM));
      await page.waitForTimeout(140);   // a few real frames: pools refill, camera settles
      const r = await page.evaluate(({ shift, thresh, wantMask }) => {
        const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post, cam = s.camera.position;
        const tr = s.scatter.trees, eye = tr.lod.uLodEye.value;
        const back = window.__at(window.__flyD - 7 - shift);
        const c0 = window.__at(window.__flyD - 7);
        const dx = back.x - c0.x, dz = back.z - c0.z;
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const grab = () => { P.composer.render(0); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
        const diff = (a, b, mask) => {
          let n = 0;
          for (let k = 0; k < a.length; k += 4) {
            const d = Math.max(Math.abs(a[k] - b[k]), Math.abs(a[k + 1] - b[k + 1]), Math.abs(a[k + 2] - b[k + 2]));
            if (d > thresh) { n++; if (mask) mask[k >> 2] = 255; }
          }
          return n / (w * h);
        };
        const A = grab();
        // Trees only.
        const e0 = eye.clone();
        eye.set(cam.x + dx, cam.y, cam.z + dz);
        const B = grab();
        eye.copy(e0);
        // Terrain geomorph + scatter fades.
        const me = s.terrain.morph.uMorphEye.value, fe = s.scatter.fadeEye.value;
        const m0 = me.clone(), f0 = fe.clone();
        me.set(m0.x + dx, m0.y, m0.z + dz); fe.set(f0.x + dx, f0.y, f0.z + dz);
        const C = grab();
        me.copy(m0); fe.copy(f0);
        const mask = wantMask ? new Uint8Array(w * h) : null;
        const tree = diff(A, B, mask) / shift, other = diff(A, C, null) / shift;
        let png = null;
        if (wantMask) {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const g = cv.getContext('2d'), img = g.createImageData(w, h);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const src = ((h - 1 - y) * w + x), o = (y * w + x) * 4;
            const on = mask[src] > 0;
            img.data[o] = on ? 255 : A[src * 4] * 0.5; img.data[o + 1] = on ? 40 : A[src * 4 + 1] * 0.5; img.data[o + 2] = on ? 40 : A[src * 4 + 2] * 0.5; img.data[o + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          png = cv.toDataURL('image/png');
        }
        return { tree, other, png };
      }, { shift: SHIFT, thresh: THRESH, wantMask: !!outDir && i % 10 === 0 });
      rows.push({ i, tree: r.tree, other: r.other });
      if (outDir) {
        await page.screenshot({ path: `${outDir}/${map}_q${q}_${String(i).padStart(3, '0')}.png` });
        if (r.png) fs.writeFileSync(`${outDir}/${map}_q${q}_${String(i).padStart(3, '0')}_diff.png`, Buffer.from(r.png.split(',')[1], 'base64'));
      }
    }
    const st = (k) => {
      const a = rows.map((x) => x[k] * 100).sort((p, q2) => p - q2);
      const mean = a.reduce((p, c) => p + c, 0) / a.length;
      return { mean: +mean.toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3), max: +a[a.length - 1].toFixed(3) };
    };
    const res = { map, q: Number(q), load: +load.toFixed(1), treePctPerM: st('tree'), terrainScatterPctPerM: st('other'), errors: errs.slice(0, 3) };
    summary.push(res);
    console.log(JSON.stringify(res));
    await page.close();
  }
} finally {
  await browser.close();
}
