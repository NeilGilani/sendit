// GPU-time profiler (EXT_disjoint_timer_query_webgl2). Boots the game in headless Chromium on the real
// GPU (ANGLE D3D11), lets the rider run downhill, then for N frames measures *exclusive* GPU time of:
//   - every post pass (RenderPass, N8AO, bloom + grade, wind, SMAA),
//   - the sun shadow-map update,
//   - every draw call in the main pass and the shadow pass, grouped by object / material name.
// Nested scopes interrupt their parent (the parent's query is ended and restarted afterwards), so the
// tags add up to the whole frame. Timer queries measure GPU time only, so CPU contention from other
// processes doesn't distort the numbers (another GPU user still can).
// Usage: node scripts/gfxgpu.mjs [baseUrl] [quality] [W H] [frames] [extraQuery]
//   e.g. node scripts/gfxgpu.mjs http://localhost:5184 2 1600 900 120
// EVAL='js' runs code in the page before measuring (e.g. to toggle a feature for an A/B test).
// SHORT=1 prints only the total line.
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', q = '2', W = '1600', H = '900', N = '120', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.goto(`${base}/?ride&quality=${q}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 300000 });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(6000);
if (process.env.EVAL) { await page.evaluate((c) => (0, eval)(c), process.env.EVAL); await page.waitForTimeout(800); }
const res = await page.evaluate(async (N) => {
  const s = window.__sendit, R = s.renderer, gl = R.getContext(), P = window.__post;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { error: 'no timer query' };
  const acc = new Map(), pending = [], stack = [];
  let active = null, frames = 0, recording = false;
  const start = (tag) => { const qq = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qq); active = { q: qq, tag }; };
  const stop = () => { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; };
  const begin = (tag) => { if (!recording) return; if (active) { stack.push(active.tag); stop(); } start(tag); };
  const end = () => { if (!recording || !active) return; stop(); if (stack.length) start(stack.pop()); };
  const poll = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
      const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
      acc.set(p.tag, (acc.get(p.tag) || 0) + ns);
      gl.deleteQuery(p.q);
      pending.splice(i, 1);
    }
  };
  // Post passes.
  P.composer.passes.forEach((pass, i) => {
    const orig = pass.render.bind(pass);
    const tag = 'pass:' + (pass.name || pass.constructor.name) + (pass.constructor.name === 'EffectPass' ? i : '');
    pass.render = (...a) => { begin(tag); orig(...a); end(); };
  });
  // Shadow map update.
  const sm = R.shadowMap, smOrig = sm.render.bind(sm);
  sm.render = (...a) => { begin('shadowmap:other'); smOrig(...a); end(); };
  // Per-object draws (main pass + shadow pass).
  const tagOf = (o) => {
    let n = o.name, p = o.parent;
    while (!n && p) { n = p.name; p = p.parent; }
    return (n || o.type) + ' [' + (o.material?.name || o.material?.type || '?') + ']';
  };
  s.scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const t = tagOf(o);
    const ob = o.onBeforeRender, oa = o.onAfterRender;
    o.onBeforeRender = function (...a) { ob.apply(this, a); begin('draw:' + t); };
    o.onAfterRender = function (...a) { end(); oa.apply(this, a); };
    if (o.castShadow) {
      const sb = o.onBeforeShadow, sa = o.onAfterShadow;
      o.onBeforeShadow = function (...a) { sb?.apply(this, a); begin('shadow:' + t); };
      o.onAfterShadow = function (...a) { end(); sa?.apply(this, a); };
    }
  });
  // Whole frame + frame count.
  const cr = P.composer.render.bind(P.composer);
  let wall = [];
  P.composer.render = (dt) => {
    const t0 = performance.now();
    begin('frame:unattributed'); cr(dt); end();
    wall.push(performance.now() - t0);
    if (recording) frames++;
    poll();
  };
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  recording = true;
  await new Promise((r) => { const chk = () => (frames >= N ? r() : setTimeout(chk, 50)); chk(); });
  recording = false;
  for (let i = 0; i < 30 && pending.length; i++) { await new Promise((r) => setTimeout(r, 30)); poll(); }
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  const rafMs = wall.length > 2 ? 0 : 0;
  const rows = [...acc.entries()].map(([k, v]) => [k, v / frames / 1e6]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => a + r[1], 0);
  const info = R.info.render;
  return { frames, disjoint, total, rows, pixels: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, calls: info.calls, tris: info.triangles, lostQueries: pending.length };
}, Number(N));
if (res.error) { console.log(res.error); process.exit(1); }
console.log(`quality ${q}${extra ? ' ' + extra : ''} @ ${res.pixels}: GPU ${res.total.toFixed(2)} ms/frame over ${res.frames} frames (disjoint ${res.disjoint}, lost ${res.lostQueries}), ${res.calls} calls, ${(res.tris / 1e6).toFixed(2)} M tris, errors ${errs.length}`);
// Group: passes / shadow / draws.
const group = (pre) => res.rows.filter(([k]) => k.startsWith(pre)).reduce((a, r) => a + r[1], 0);
if (process.env.SHORT) { await browser.close(); process.exit(0); }
for (const g of ['pass:', 'shadowmap:', 'shadow:', 'draw:', 'frame:']) console.log(`  ${g.padEnd(11)} ${group(g).toFixed(2)} ms`);
for (const [k, v] of res.rows) if (v >= 0.15) console.log(`    ${v.toFixed(2).padStart(6)}  ${k}`);
for (const e of errs.slice(0, 5)) console.log('  [err]', e);
await browser.close();
