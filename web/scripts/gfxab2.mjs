// Two builds, one machine, fine-grained alternation: boots both builds side by side (one page each),
// then for every chase-camera pose alternates many short GPU-timed windows between them while the
// other page is frozen (its composer render is a no-op). The quietest window per build counts, so
// a busy shared GPU (other sessions) hits both builds alike.
// Usage: node scripts/gfxab2.mjs <baseA,baseB> <map> [quality] [fractions] [frames per window] [cycles] [W H]
import { chromium } from '@playwright/test';
const [bases = 'http://localhost:5187,http://localhost:5186', map = 'blackspruce', q = '1', fr = '0.12,0.3,0.5,0.7', N = '12', cycles = '8', W = '1600', H = '900'] = process.argv.slice(2);
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
const boot = async (base) => {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
  await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 600000 });
  await page.evaluate(() => {
    const s = window.__sendit, T = s.terrain, path = s.course.path, P = window.__post;
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
    window.__L = L; window.__flyD = 0;
    window.__gfxCam = () => {
      const c = at(window.__flyD - 7), f = at(window.__flyD + 25);
      return [c.x, T.getHeight(c.x, c.z) + 3, c.z, f.x, T.getHeight(f.x, f.z) + 1, f.z, 62];
    };
    s.player.script = (c) => { c.tuck = 0; c.brake = 1; };
    // Freezable render + GPU timing.
    const R = s.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const orig = P.composer.render.bind(P.composer);
    window.__gpu = []; window.__on = true;
    const pending = [];
    P.composer.render = (dt) => {
      if (!window.__on) return;
      const qq = ext ? gl.createQuery() : null;
      if (qq) gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
      orig(dt);
      if (qq) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq); }
      for (let k = pending.length - 1; k >= 0; k--) {
        if (!gl.getQueryParameter(pending[k], gl.QUERY_RESULT_AVAILABLE)) continue;
        window.__gpu.push(gl.getQueryParameter(pending[k], gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(pending[k]); pending.splice(k, 1);
      }
    };
  });
  return page;
};
try {
  const B = bases.split(',');
  const pages = [];
  for (const b of B) pages.push(await boot(b));
  const fracs = fr.split(',').map(Number);
  const best = B.map(() => fracs.map(() => Infinity));
  for (const [pi, f] of fracs.entries()) {
    for (const p of pages) await p.evaluate((f) => { window.__flyD = f * window.__L; window.__sendit.scatter.trees.last.set(1e9, 0, 0); }, f);
    for (const p of pages) { await p.evaluate(() => { window.__on = true; }); await p.waitForTimeout(500); }
    for (let c = 0; c < Number(cycles); c++) {
      for (const [bi, p] of pages.entries()) {
        for (const [oi, o] of pages.entries()) await o.evaluate((on) => { window.__on = on; window.__gpu.length = 0; }, oi === bi);
        await p.waitForTimeout(80);
        const med = await p.evaluate(async (N) => {
          window.__gpu.length = 0;
          await new Promise((res) => { const chk = () => (window.__gpu.length >= N ? res() : setTimeout(chk, 20)); chk(); });
          const x = window.__gpu.slice().sort((a, b) => a - b);
          return x[x.length >> 1];
        }, Number(N));
        best[bi][pi] = Math.min(best[bi][pi], med);
      }
    }
  }
  for (const [bi, b] of B.entries()) {
    const avg = best[bi].reduce((a, c) => a + c, 0) / fracs.length;
    console.log(`${map} q${q} ${b}: avg ${avg.toFixed(1)} ms  [${best[bi].map((x) => x.toFixed(1)).join(', ')}]`);
  }
} finally {
  await browser.close();
}
