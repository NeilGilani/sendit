// Frame-cost benchmark per quality level (headless Chromium on the real GPU, ANGLE D3D11).
// The rider runs downhill, carving left / right, then for each quality we report:
//   GPU   — GPU time per frame from EXT_disjoint_timer_query_webgl2 around the whole frame render
//           (shadow map, scene, every post pass). This is what limits the frame rate on a GPU-bound game.
//   CPU   — main-thread time per frame: the duration of every requestAnimationFrame callback
//           (physics, game logic, scene traversal, draw submission).
//   frame — max(GPU, CPU): the steady frame time with normal pipelining → fps.
//   sync  — render + 1-pixel readPixels (no pipelining: CPU submit + GPU + a pipeline drain). This is
//           the older, pessimistic metric, kept for comparison with earlier notes.
// Headless rAF timing is NOT used for frame time (Chromium drops / batches frames without a display).
// Usage: node scripts/gfxperf.mjs [baseUrl] [W H] [qualities] [frames]   e.g. … http://localhost:5184 1600 900 0,1,2 150
// DPR=1.5 emulates a 150 % laptop screen (W H stay CSS pixels).
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', W = '1600', H = '900', qs = '0,1,2', N = '150'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const q of qs.split(',').map(Number)) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) }, deviceScaleFactor: Number(process.env.DPR || 1) });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  // Time every rAF callback (CPU per frame).
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__cpu = [];
    window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); if (window.__cpuOn) window.__cpu.push(performance.now() - a); });
  });
  await page.goto(`${base}/?ride&quality=${q}${process.env.MAP ? `&map=${process.env.MAP}` : ''}`);   // MAP=<id> loads another map
  await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 300000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(5000);
  // Carve while measuring (spray, tracks and tree-pool rebuilds are live).
  const carving = (async () => { for (let i = 0; i < 6; i++) { const k = i % 2 ? 'a' : 'd'; await page.keyboard.down(k); await page.waitForTimeout(900); await page.keyboard.up(k); } })();
  const r = await page.evaluate(async (N) => {
    const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const gpu = [], pending = [];
    const orig = P.composer.render.bind(P.composer);
    let on = true;
    P.composer.render = (dt) => {
      const qq = on && ext ? gl.createQuery() : null;
      if (qq) gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
      orig(dt);
      if (qq) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq); }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (!gl.getQueryParameter(pending[i], gl.QUERY_RESULT_AVAILABLE)) continue;
        gpu.push(gl.getQueryParameter(pending[i], gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(pending[i]); pending.splice(i, 1);
      }
    };
    window.__cpu.length = 0; window.__cpuOn = true;
    await new Promise((res) => { const chk = () => (gpu.length >= N ? res() : setTimeout(chk, 50)); chk(); });
    window.__cpuOn = false; on = false;
    const disjoint = ext ? gl.getParameter(ext.GPU_DISJOINT_EXT) : null;
    P.composer.render = orig;
    // Unpipelined render + sync (older metric).
    const px = new Uint8Array(4), sync = [];
    for (let i = 0; i < 40; i++) { const a = performance.now(); orig(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); sync.push(performance.now() - a); }
    const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    const p95 = (a) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length * 0.95)]; };
    const info = R.info.render;
    return { gpu: med(gpu), gpu95: p95(gpu), cpu: med(window.__cpu), cpu95: p95(window.__cpu), sync: med(sync.slice(5)), disjoint,
      px: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, calls: info.calls, tris: info.triangles, n: gpu.length };
  }, Number(N));
  await carving;
  const frame = Math.max(r.gpu, r.cpu);
  console.log(`quality ${q} @ ${r.px}: GPU ${r.gpu.toFixed(1)} ms (p95 ${r.gpu95.toFixed(1)}), CPU ${r.cpu.toFixed(1)} ms (p95 ${r.cpu95.toFixed(1)}) → frame ${frame.toFixed(1)} ms ≈ ${(1000 / frame).toFixed(0)} fps; sync ${r.sync.toFixed(1)} ms; ${r.calls} draws, ${(r.tris / 1e6).toFixed(2)} M tris; ${r.n} frames${r.disjoint ? ' (GPU disjoint!)' : ''}; errors ${errs.length}`);
  for (const e of errs.slice(0, 3)) console.log('   ', e);
  await page.close();
}
await browser.close();
