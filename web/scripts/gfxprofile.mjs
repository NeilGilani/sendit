// GPU cost breakdown. Renders the current ride view through the full post stack with one part of the
// frame switched off per variant, forcing a GPU sync (1-pixel readPixels) after each frame. Variants
// are interleaved round-robin so GPU clock drift / other GPU users affect all of them equally.
// Usage: node scripts/gfxprofile.mjs [baseUrl] [quality] [W H]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', q = '2', W = '1600', H = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}/?ride&quality=${q}`);
await page.waitForFunction(() => window.__sendit, null, { timeout: 300000 });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(5000);
await page.keyboard.up('ArrowUp');
const out = await page.evaluate(() => {
  const s = window.__sendit, R = s.renderer, gl = R.getContext(), px = new Uint8Array(4), P = window.__post;
  const find = (n) => s.scene.children.find((o) => o.name === n);
  const scatter = find('Scatter'), terrain = find('Terrain');
  const tu = s.terrain.terrainUniforms;
  const V = {
    full: [() => {}, () => {}],
    noAO: [() => { P.__ao = P.ao.enabled; P.ao.enabled = false; }, () => { P.ao.enabled = P.__ao; }],
    aoFull: [() => { P.ao.configuration.halfRes = false; }, () => { P.ao.configuration.halfRes = true; }],
    noShadowUpdate: [() => { R.shadowMap.autoUpdate = false; }, () => { R.shadowMap.autoUpdate = true; }],
    noScatter: [() => { scatter.visible = false; }, () => { scatter.visible = true; }],
    noTerrain: [() => { terrain.visible = false; }, () => { terrain.visible = true; }],
    terrainNoDetail: [() => { tu.uDetail.value = 0; tu.uSparkle.value.x = 0; }, () => { tu.uDetail.value = 2; tu.uSparkle.value.x = 26; }],
    noPost: [() => {}, () => {}],
    noTreesNear: [() => { s.scatter.trees.pools[0].im.visible = s.scatter.trees.pools[1].im.visible = false; }, () => { s.scatter.trees.pools[0].im.visible = s.scatter.trees.pools[1].im.visible = true; }],
    noTreesMid: [() => { s.scatter.trees.pools[2].im.visible = s.scatter.trees.pools[3].im.visible = false; }, () => { s.scatter.trees.pools[2].im.visible = s.scatter.trees.pools[3].im.visible = true; }],
    noTreesFar: [() => { s.scatter.trees.cells.forEach((c) => { c.userData.v = c.visible; c.visible = false; }); }, () => { s.scatter.trees.cells.forEach((c) => { c.visible = c.userData.v; }); }],
  };
  const T = Object.fromEntries(Object.keys(V).map((k) => [k, []]));
  for (let it = 0; it < 14; it++) {
    for (const [k, [on, off]] of Object.entries(V)) {
      on();
      const a = performance.now();
      if (k === 'noPost') R.render(s.scene, s.camera); else P.composer.render(1 / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      T[k].push(performance.now() - a);
      off();
    }
  }
  const med = (a) => { a = a.slice(2).sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
  const r = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, med(v)]));
  r.pools = s.scatter.trees.pools.map((p) => p.lod + "/" + p.kind + ":" + p.im.count + "x" + p.im.geometry.attributes.position.count).join(" ");
  r.farCells = s.scatter.trees.cells.filter((c) => c.visible).reduce((a, c) => a + c.count, 0);
  return r;
});
console.log(JSON.stringify(out));
await browser.close();
