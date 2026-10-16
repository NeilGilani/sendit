// Ravenspire (map 3) frame cost on the real GPU (headless Chromium, ANGLE D3D11): for each quality, the
// rider is placed at several spots down the face (riding down it with tuck), and for each spot we measure
// GPU ms per frame (EXT_disjoint_timer_query_webgl2 around the whole composer render), CPU ms per rAF,
// draw calls and triangles of the full frame (renderer.info summed over every pass). Each spot is measured
// in three windows and the quietest counts (other GPU work on the machine only ever adds time).
// Usage: node scripts/map3-perf.mjs [baseUrl] [W H] [qualities] [frames per spot] [map]
//   e.g. node web/scripts/map3-perf.mjs http://localhost:5183 1600 900 0,1,2 90
//   map defaults to ravenspire; pass valcrest-gully to compare (spots are then along its path).
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5183', W = '1600', H = '900', qs = '0,1,2', N = '90', map = 'ravenspire'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
// Spots as fractions along the course path (start → finish), riding down it.
const SPOTS = [0.02, 0.2, 0.38, 0.55, 0.62, 0.8];
for (const q of qs.split(',').map(Number)) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__cpu = [];
    window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); if (window.__cpuOn) window.__cpu.push(performance.now() - a); });
  });
  const t0 = Date.now();
  await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
  await page.waitForFunction(() => window.__sendit && window.__post && window.__sendit.player.state === 1, null, { timeout: 300000 });
  const boot = (Date.now() - t0) / 1000;
  await page.waitForTimeout(2500);
  const rows = [];
  for (const f of SPOTS) {
    const r = await page.evaluate(async ({ f, N }) => {
      const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post, pl = s.player;
      const path = s.course.path, i = Math.min(path.length - 2, Math.floor(f * (path.length - 1)));
      const a = path[i], b = path[i + 1];
      pl.place({ x: a.x, z: a.y }, Math.atan2(-(b.x - a.x), -(b.y - a.y)));
      pl.script = (c) => { c.tuck = 1; };
      s.camera.userData.snap = true;
      await new Promise((res) => setTimeout(res, 1200));   // let LOD / tree pools / camera settle
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const gpu = [], pending = [], calls = [], tris = [];
      const orig = P.composer.render.bind(P.composer);
      R.info.autoReset = false;
      P.composer.render = (dt) => {
        R.info.reset();
        const qq = ext ? gl.createQuery() : null;
        if (qq) gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
        orig(dt);
        if (qq) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq); }
        calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
        for (let k = pending.length - 1; k >= 0; k--) {
          if (!gl.getQueryParameter(pending[k], gl.QUERY_RESULT_AVAILABLE)) continue;
          gpu.push(gl.getQueryParameter(pending[k], gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(pending[k]); pending.splice(k, 1);
        }
      };
      // Three back-to-back windows; the quietest one counts (other GPU work on the machine only adds time).
      const med0 = (x) => { x = x.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
      let best = Infinity;
      window.__cpu.length = 0; window.__cpuOn = true;
      for (let w = 0; w < 3; w++) {
        gpu.length = 0;
        await new Promise((res) => { const chk = () => (gpu.length >= N ? res() : setTimeout(chk, 30)); chk(); });
        best = Math.min(best, med0(gpu));
      }
      window.__cpuOn = false;
      P.composer.render = orig; R.info.autoReset = true;
      const med = (x) => { x = x.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
      return { gpu: best, cpu: med(window.__cpu), calls: med(calls), tris: med(tris), v: pl.speed, st: pl.state, x: pl.position.x, y: pl.position.y };
    }, { f, N: Number(N) });
    rows.push({ f, ...r });
  }
  const gpus = rows.map((r) => r.gpu), avg = gpus.reduce((a, b) => a + b, 0) / gpus.length;
  console.log(`${map} quality ${q} @ ${W}x${H} (boot ${boot.toFixed(0)} s): GPU avg ${avg.toFixed(1)} ms, worst ${Math.max(...gpus).toFixed(1)} ms; errors ${errs.length}`);
  for (const r of rows) console.log(`   ${(r.f * 100).toFixed(0).padStart(3)}%  GPU ${r.gpu.toFixed(1).padStart(5)} ms  CPU ${r.cpu.toFixed(1).padStart(4)} ms  ${String(r.calls).padStart(4)} draws  ${(r.tris / 1e6).toFixed(2)} M tris  v ${r.v.toFixed(0)} m/s state ${r.st}`);
  for (const e of errs.slice(0, 3)) console.log('   ', e);
  await page.close();
}
await browser.close();
