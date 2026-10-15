// Frame-time probe: boots the game in headless Chromium on the real GPU (ANGLE D3D11, vsync and
// frame-rate limit off), rides down while carving left/right so spray, tracks and tree pools are
// live, and prints median / p95 frame times plus draw calls and triangles per quality level.
// Usage: node scripts/gfxperf.mjs [baseUrl] [W H]   e.g. node scripts/gfxperf.mjs http://localhost:5184 1600 900
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', W = '1600', H = '900'] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
for (const q of [0, 1, 2]) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(`${base}/?ride&quality=${q}`);
  await page.waitForFunction(() => window.__sendit, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  await page.keyboard.down('ArrowUp');
  if (false) await page.evaluate(() => {
    window.__ft = []; window.__fp = [];
    let last = performance.now();
    const R = window.__sendit.renderer;
    const tick = () => { const t = performance.now(); window.__ft.push(t - last); window.__fp.push(R.info.programs.length); last = t; if (window.__ft.length < 100000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  // No input events while measuring (headless Chromium stalls frames around synthetic input with the
  // frame-rate limit off). Spray load comes from a page-side emitter beside the rider instead.
  await page.evaluate(() => {
    const s = window.__sendit, sp = s.fx.spray, V3 = s.camera.position.constructor;
    const c = [0, 1].map((i) => ({ id: 'perf' + i, position: new V3(), direction: new V3(), edgeAngle: 0.9, load: 0.7, speed: 15 }));
    const n = new V3(0, 1, 0);
    let a = 0;
    const step = () => {
      a += 0.03;
      const p = s.player.renderPos;
      c.forEach((k, i) => { k.position.set(p.x + 3 + Math.cos(a) * 6 + i * 0.25, 0, p.z - 6 + Math.sin(a) * 6); k.position.y = s.terrain.getHeight(k.position.x, k.position.z); k.direction.set(-Math.sin(a), 0, Math.cos(a)); });
      sp.emit(c, 1 / 60, { powder: 0.8, normal: n });
      if (performance.now() - t0 < 9000) requestAnimationFrame(step);
    };
    const t0 = performance.now();
    requestAnimationFrame(step);
  });
  await page.waitForTimeout(6000);
  // Synchronous render benchmark: render the current view N times through the full post stack, forcing
  // a GPU sync (1-pixel readPixels) each time. Independent of rAF scheduling, which is erratic headless.
  const r = await page.evaluate(() => {
    const s = window.__sendit, R = s.renderer, gl = R.getContext(), px = new Uint8Array(4);
    const comp = window.__post.composer;
    R.info.autoReset = false;
    const times = [];
    for (let i = 0; i < 160; i++) {
      R.info.reset();
      const t = performance.now();
      s.fx.spray.update(1 / 60);
      comp.render(1 / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t);
    }
    const info = R.info.render;
    R.info.autoReset = true;
    const f = times.slice(10).sort((x, y) => x - y);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
    const t1 = performance.now();
    for (let i = 0; i < 50; i++) { gl.clear(gl.COLOR_BUFFER_BIT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    const sync = (performance.now() - t1) / 50;
    return { gpu, sync, n: f.length, med: f[f.length >> 1], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1], calls: info.calls, tris: info.triangles, spray: s.fx.spray.alive };
  });
  console.log(`quality ${q}: render+sync median ${r.med.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, max ${r.max.toFixed(1)} ms, draw calls ${r.calls}, triangles ${(r.tris / 1e6).toFixed(2)} M, spray particles ${r.spray}, errors ${errs.length}; empty clear+sync ${r.sync.toFixed(2)} ms; ${r.gpu}`);
  for (const e of errs.slice(0, 5)) console.log('  ', e);
  await page.close();
}
await browser.close();
