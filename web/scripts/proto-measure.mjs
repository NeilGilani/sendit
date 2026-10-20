// Dev helper (jacket prototype round, docs/character.md § Prototype round): measures the rider's body in
// its bind pose — joint heights, segment lengths, cross-section widths / depths per height — for the
// default body and, with a URL flag, a prototype body.
//   node web/scripts/proto-measure.mjs http://localhost:5213/            (current body)
//   node web/scripts/proto-measure.mjs "http://localhost:5213/?protobody=natural"
//   node web/scripts/proto-measure.mjs "http://localhost:5214/?protobody=mid" --summary      (the table in the docs)
//   node web/scripts/proto-measure.mjs "http://localhost:5214/?proto=r2" --garment            (jacket / pants side
//        and front profile in the bind pose: half width, front and back z per height, the back line's straightness)
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const [url = 'http://localhost:5213/'] = argv.filter((a) => !a.startsWith('--'));
const SUMMARY = argv.includes('--summary'), GARMENT = argv.includes('--garment');
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
if (GARMENT) {
  out.garment = await page.evaluate(() => {
    const g = window.__sendit.stage.rider.look.meshes.garments.geometry;
    const P = g.attributes.position, G = g.attributes.aG;
    const rows = [];
    for (let y = 1.6; y >= 0.8; y -= 0.04) {
      const r = { y: +y.toFixed(2) };
      for (const [key, id] of [['jacket', 0], ['pants', 2]]) {
        let x1 = 0, zf = -1e9, zb = 1e9, n = 0;
        for (let i = 0; i < P.count; i++) {
          if (Math.abs(G.getX(i) - id) > 0.1 || Math.abs(P.getY(i) - y) > 0.01) continue;
          x1 = Math.max(x1, Math.abs(P.getX(i))); zf = Math.max(zf, P.getZ(i)); zb = Math.min(zb, P.getZ(i)); n++;
        }
        if (n) r[key] = [+x1.toFixed(3), +zf.toFixed(3), +zb.toFixed(3)];
      }
      rows.push(r);
    }
    // Shoulder width: the widest point of the jacket + sleeves at the shoulder (outer edge of the sleeve
    // head over the deltoid, |x| < 0.33, y 1.38–1.56).
    let sh = 0;
    for (let i = 0; i < P.count; i++) {
      const id = G.getX(i), x = Math.abs(P.getX(i)), y = P.getY(i);
      if ((id < 0.1 || Math.abs(id - 1) < 0.1) && y > 1.38 && y < 1.56 && x < 0.33 && P.getZ(i) > -0.25) {
        // the sleeve head's outer edge: its top silhouette at |x| where the sleeve starts dropping
      }
    }
    // Widest across the shoulders seen from the front at y 1.40–1.50, trunk + sleeve-head (|x| ≤ 0.30).
    for (let i = 0; i < P.count; i++) {
      const id = G.getX(i), y = P.getY(i), x = Math.abs(P.getX(i));
      if ((id < 0.1 || Math.abs(id - 1) < 0.1) && y > 1.4 && y < 1.5 && x <= 0.3) sh = Math.max(sh, x);
    }
    return { rows, shoulderHalf: +sh.toFixed(3) };
  });
}
if (SUMMARY) {
  const at = (y) => out.sec.reduce((b, s) => (Math.abs(s.y - y) < Math.abs(b.y - y) ? s : b));
  const J = out.J;
  const pick = (re) => Object.entries(J).find(([k]) => re.test(k))?.[1];
  const sh = pick(/upperarm_l$/), el = pick(/lowerarm_l$/), wr = pick(/hand_l$/), kn = pick(/calf_l$/), th = pick(/thigh_l$/);
  console.log(JSON.stringify({
    height: out.height, span: out.span, shoulderJointX: sh?.[0], upperArmThick: out.upperArmThick,
    chest140: at(1.4), chest130: at(1.3), waist115: at(1.15), hip095: at(0.95),
    upperArm: sh && el ? +Math.hypot(el[0] - sh[0], el[1] - sh[1]).toFixed(3) : null,
    forearm: el && wr ? +Math.hypot(wr[0] - el[0], wr[1] - el[1]).toFixed(3) : null,
    kneeY: kn?.[1], hipY: th?.[1], garment: out.garment,
  }, null, 1));
} else console.log(JSON.stringify(out, null, 1));
await browser.close();
