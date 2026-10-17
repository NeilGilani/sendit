// Fjordline GPU breakdown: at a few spots down the hero line, GPU ms per frame with everything, then with one
// group hidden at a time (the water, the sea ice, the village props, the trees, the terrain): where the time goes.
// Usage: node web/scripts/map7-gpudiag.mjs [baseUrl] [W H] [fractions=0.38,0.62,0.8]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5196', W = '1600', H = '900', fr = '0.38,0.62,0.8'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
await page.goto(`${base}/?ride&quality=1&map=fjordline`);
await page.waitForFunction(() => window.__sendit && window.__post && window.__sendit.player.state === 1, null, { timeout: 400000 });
await page.waitForTimeout(2000);
for (const f of fr.split(',').map(Number)) {
  const r = await page.evaluate(async (f) => {
    const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post, pl = s.player, sc = s.scene;
    const path = s.course.path, i = Math.min(path.length - 2, Math.floor(f * (path.length - 1)));
    const a = path[i], b = path[i + 1];
    pl.place({ x: a.x, z: a.y }, Math.atan2(-(b.x - a.x), -(b.y - a.y)));
    pl.script = (c) => { c.brake = 1; };
    s.camera.userData.snap = true;
    await new Promise((res) => setTimeout(res, 1500));
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const orig = P.composer.render.bind(P.composer);
    const measure1 = async (n = 40) => {
      const gpu = [], pending = [];
      P.composer.render = (dt) => {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); orig(dt); gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q);
        for (let k = pending.length - 1; k >= 0; k--) { if (!gl.getQueryParameter(pending[k], gl.QUERY_RESULT_AVAILABLE)) continue; gpu.push(gl.getQueryParameter(pending[k], gl.QUERY_RESULT) / 1e6); gl.deleteQuery(pending[k]); pending.splice(k, 1); }
      };
      await new Promise((res) => { const chk = () => (gpu.length >= n ? res() : setTimeout(chk, 30)); chk(); });
      P.composer.render = orig;
      gpu.sort((x, y) => x - y); return gpu[gpu.length >> 1];
    };
    const measure = async () => +Math.min(await measure1(), await measure1(), await measure1()).toFixed(1);
    const find = (name) => { let o = null; sc.traverse((k) => { if (!o && k.name === name) o = k; }); return o; };
    const groups = { water: find('FjordWater'), seaIce: find('SeaIce'), props: find('FjordlineProps'), trees: s.scatter?.group, terrain: s.terrain?.group };
    const out = { all: await measure() };
    for (const [k, o] of Object.entries(groups)) {
      if (!o) { out[k] = 'n/a'; continue; }
      const v = o.visible; o.visible = false;
      // Hiding the props group hides the water and ice too: measure them first.
      out['-' + k] = await measure();
      o.visible = v;
    }
    out.allAgain = await measure();
    return out;
  }, f);
  console.log(`${(f * 100).toFixed(0)}%`, JSON.stringify(r));
}
await browser.close();
