// Interleaved A/B GPU cost of runtime tweaks at fixed chase-camera poses along a map's run.
// For each pose and each config (a JS snippet run in the page), measures the median GPU ms per frame
// (EXT_disjoint_timer_query_webgl2 around the whole composer render) over N frames; configs are
// alternated for `rounds` rounds and the quietest median counts (other GPU work only ever adds time),
// so shared-GPU noise hits every config alike.
// Usage: CONFIGS='["", "window.__sendit.scatter.trees.setQuality(1)"]' \
//   node scripts/gfxab.mjs <baseUrl> <map> [quality] [fractions] [frames] [rounds] [W H]
// ANGLE=metal (macOS default) | d3d11.
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5186', map = 'blackspruce', q = '1', fr = '0.12,0.3,0.5,0.7', N = '40', rounds = '3', W = '1600', H = '900'] = process.argv.slice(2);
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const CONFIGS = JSON.parse(process.env.CONFIGS || '[""]');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
  await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 600000 });
  console.log(`${map} q${q} boot ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(() => {
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
    window.__L = L;
    window.__gfxCam = () => {
      const c = at(window.__flyD - 7), f = at(window.__flyD + 25);
      return [c.x, T.getHeight(c.x, c.z) + 3, c.z, f.x, T.getHeight(f.x, f.z) + 1, f.z, 62];
    };
    window.__flyD = 0;
    s.player.script = (c) => { c.tuck = 1; };
  });
  const res = CONFIGS.map(() => fr.split(',').map(() => Infinity));
  const tris = CONFIGS.map(() => fr.split(',').map(() => 0));
  for (let r = 0; r < Number(rounds); r++) {
    for (const [pi, f] of fr.split(',').map(Number).entries()) {
      for (const [ci, cfg] of CONFIGS.entries()) {
        const out = await page.evaluate(async ({ f, N, cfg }) => {
          const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post;
          window.__flyD = f * window.__L;
          s.scatter.trees.last.set(1e9, 0, 0);
          // eslint-disable-next-line no-eval
          (0, eval)(cfg);
          await new Promise((res) => setTimeout(res, 400));
          const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          const gpu = [], pending = [], tri = [];
          const orig = P.composer.render.bind(P.composer);
          R.info.autoReset = false;
          P.composer.render = (dt) => {
            R.info.reset();
            const qq = ext ? gl.createQuery() : null;
            if (qq) gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
            orig(dt);
            if (qq) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq); }
            tri.push(R.info.render.triangles);
            for (let k = pending.length - 1; k >= 0; k--) {
              if (!gl.getQueryParameter(pending[k], gl.QUERY_RESULT_AVAILABLE)) continue;
              gpu.push(gl.getQueryParameter(pending[k], gl.QUERY_RESULT) / 1e6);
              gl.deleteQuery(pending[k]); pending.splice(k, 1);
            }
          };
          await new Promise((res) => { const chk = () => (gpu.length >= N ? res() : setTimeout(chk, 30)); chk(); });
          P.composer.render = orig; R.info.autoReset = true;
          const med = (x) => { x = x.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
          return { gpu: med(gpu), tris: med(tri) };
        }, { f, N: Number(N), cfg });
        res[ci][pi] = Math.min(res[ci][pi], out.gpu);
        tris[ci][pi] = out.tris;
      }
    }
  }
  for (const [ci, cfg] of CONFIGS.entries()) {
    const avg = res[ci].reduce((a, b) => a + b, 0) / res[ci].length;
    console.log(`cfg ${ci} avg ${avg.toFixed(1)} ms  [${res[ci].map((x) => x.toFixed(1)).join(', ')}]  tris ${tris[ci].map((x) => (x / 1e6).toFixed(2)).join('/')}M  :: ${cfg.slice(0, 120)}`);
  }
  for (const e of errs.slice(0, 3)) console.log('  err', e);
} finally {
  await browser.close();
}
