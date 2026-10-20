// Dev helper (jacket prototype round, docs/character.md § Prototype round): measures the rider's body in
// its bind pose — joint heights, segment lengths, cross-section widths / depths per height — for the
// default body and, with a URL flag, a prototype body.
//   node web/scripts/proto-measure.mjs http://localhost:5213/            (current body)
//   node web/scripts/proto-measure.mjs "http://localhost:5213/?protobody=1"
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5213/'] = process.argv.slice(2);
const args = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=0`);
await page.waitForFunction(() => window.__sendit?.stage?.ready, null, { timeout: 300000 });
const out = await page.evaluate(() => {
  const r = window.__sendit.stage.rider, body = r.look.meshes.body;
  const g = body.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const names = body.skeleton.bones.map((b) => b.name);
  const bindInv = body.bindMatrix.clone().invert();
  const J = {};
  body.skeleton.boneInverses.forEach((bi, j) => {
    const m = bi.clone().invert().premultiply(bindInv);
    J[names[j]] = [m.elements[12], m.elements[13], m.elements[14]].map((v) => +v.toFixed(3));
  });
  const n = P.count, dom = [];
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
    dom.push(names[best]);
    ymin = Math.min(ymin, P.getY(i)); ymax = Math.max(ymax, P.getY(i));
  }
  // Trunk cross-sections (no arm bones): width (x extent), front z, back z per height.
  const sec = [];
  for (let y = 0.05; y <= 1.85; y += 0.05) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ax = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const vy = P.getY(i);
      if (Math.abs(vy - y) > 0.012) continue;
      const b = dom[i];
      if (/arm|hand|thumb|index|middle|ring|pinky/.test(b)) { ax = Math.max(ax, Math.abs(P.getX(i))); continue; }
      x0 = Math.min(x0, P.getX(i)); x1 = Math.max(x1, P.getX(i)); z0 = Math.min(z0, P.getZ(i)); z1 = Math.max(z1, P.getZ(i)); cnt++;
    }
    if (cnt) sec.push({ y: +y.toFixed(2), w: +(x1 - x0).toFixed(3), front: +z1.toFixed(3), back: +z0.toFixed(3), depth: +(z1 - z0).toFixed(3), armX: +ax.toFixed(3) });
  }
  // Arm span (T-pose): extreme |x| of all vertices.
  let span = 0; for (let i = 0; i < n; i++) span = Math.max(span, Math.abs(P.getX(i)));
  // Upper-arm girth at |x| 0.3
  let ay0 = 1e9, ay1 = -1e9;
  for (let i = 0; i < n; i++) if (Math.abs(Math.abs(P.getX(i)) - 0.3) < 0.01) { ay0 = Math.min(ay0, P.getY(i)); ay1 = Math.max(ay1, P.getY(i)); }
  return { height: +(ymax - ymin).toFixed(3), ymin: +ymin.toFixed(3), span: +(2 * span).toFixed(3), upperArmThick: +(ay1 - ay0).toFixed(3), J, sec, rest: { headScale: r.bones.Head.scale.x } };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
