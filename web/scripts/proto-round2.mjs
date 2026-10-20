// Dev helper: contact sheets for jacket prototype round 2 (character/proto.js ROUND2, docs/character.md
// § Prototype round 2). One page load per body ('mid' / 'current' / 'natural'), lobby plinth, same
// camera, scale and light as round 1 (proto-sheet.mjs):
//   <outDir>/R<n>.png        standing (front, front 3/4, side, back, back 3/4), in motion (carve 3/4 + back 3/4,
//                            tuck side, air grab 3/4 + side) and a snowboard stance shot
//   <outDir>/R<n>-silhouette.png  bind-pose side profile (round-2 cut vs its round-1 source) + side / back / tuck
//                            renders with guide lines from the shoulder blades and the shoulder edges, with numbers
//   <outDir>/overview.png    all six, front 3/4 and back 3/4
//   <outDir>/bodies.png      P10 and P2 on the current / in-between / natural bodies (+ the bare bodies)
//
//   node web/scripts/proto-round2.mjs http://localhost:5214/ /tmp/claude-501/proto2 [r1,r2,…] [--frames-only|--compose-only] [--no-bodies] [--alt=r3:current,…]
// Env: DPR (default 1.5)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const [base = 'http://localhost:5214/', outDir = 'proto2', listArg = 'r1,r2,r3,r4,r5,r6'] = argv.filter((a) => !a.startsWith('--'));
const only = listArg.split(',').filter(Boolean);
// Extra renders of a look on another body (--alt=r3:current): full sheet as R3-current.png.
const ALT = (opt('alt') || '').split(',').filter(Boolean).map((s) => s.split(':'));
const BODIES_SHEET = !flags.has('--no-bodies');
const frameDir = path.join(outDir, 'frames');
fs.mkdirSync(frameDir, { recursive: true });
const DPR = Number(process.env.DPR || 1.5);
const VW = 900, VH = 1100, CW = 540, CH = 960, CX = (VW - CW) / 2, CY = 50;
const YAW = { front: 180, q34: 145, side: 90, back: 0, q34b: 35, y240: 240, y270: 270, y300: 300, y120: 120 };
const STAND = ['front', 'q34', 'side', 'back', 'q34b'];
const MOTION = [['carve', 'q34'], ['carve', 'q34b'], ['tuck', 'side'], ['grab', 'q34'], ['grab', 'side']];
const CMPV = ['front', 'q34', 'side', 'q34b'];
const BOARD = (process.env.BOARD || 'y240,side').split(',');
const BOARD_NAME = { y240: 'front 3/4', side: 'back', y270: 'front', y300: 'front 3/4 (toe side)' };
const VIEW_NAME = { front: 'front', q34: 'front 3/4', side: 'side', back: 'back', q34b: 'back 3/4' };
const BODY_NAME = { current: 'current body', mid: 'in-between body', natural: 'natural body' };
const SOURCE = { r1: 10, r2: 2, r3: 1, r4: 7, r5: 9, r6: 5 };   // round-1 prototype each look comes from
const args = process.platform === 'darwin'
  ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const tagOf = (key, body) => `${key}-${body}`;
const frame = (tag, pose, view) => path.join(frameDir, `${tag}-${pose}-${view}.png`);
const metaFile = path.join(outDir, 'meta.json');
let meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
meta.sil ??= {}; meta.profile ??= {};

// --------------------------------------------------------------------------------- in-page helpers
function pageHelpers() {
  const S = window.__sendit, stage = S.stage;
  const V = () => new (stage.camera.position.constructor)();
  // World positions of the skinned outfit vertices of the pieces in `ids`, with their bind positions.
  const skinned = (ids) => {
    const g = stage.rider.look.meshes.garments, geo = g.geometry, P = geo.attributes.position, G = geo.attributes.aG;
    g.updateMatrixWorld(true);
    g.skeleton.update();
    const out = [];
    for (let i = 0; i < P.count; i++) {
      const id = Math.round(G.getX(i));
      if (!ids.includes(id)) continue;
      const w = V(); g.getVertexPosition(i, w); w.applyMatrix4(g.matrixWorld);
      out.push({ id, bx: P.getX(i), by: P.getY(i), bz: P.getZ(i), w });
    }
    return out;
  };
  const toPx = (w) => {
    const p = w.clone().project(stage.camera);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
  };
  const bonePos = (name) => { const b = stage.rider.bones[name]; b.updateMatrixWorld(true); return V().setFromMatrixPosition(b.matrixWorld); };
  // Side-view guide lines and numbers: the straight line down the back from the shoulder blades (along
  // the torso axis, and plumb), how far the hem / seat zone sticks out past them, and how far the back dips
  // in at the waist below the line from the blades to the hem (cupping).
  window.__silSide = () => {
    const vs = skinned([0]);
    const avg = (f) => { const a = V(); let n = 0; for (const v of vs) if (f(v)) { a.add(v.w); n++; } return a.multiplyScalar(1 / Math.max(1, n)); };
    const A = bonePos('spine_03').sub(bonePos('pelvis')).normalize();
    const L = avg((v) => v.bx > 0.12 && v.by < 1.3 && v.by > 1.0).sub(avg((v) => v.bx < -0.12 && v.by < 1.3 && v.by > 1.0)).normalize();
    const back = avg((v) => v.bz < -0.1).sub(avg((v) => v.bz > 0.1));
    const N = back.clone().addScaledVector(A, -back.dot(A)).addScaledVector(L, -back.dot(L)).normalize();
    const up = V().set(0, 1, 0);
    const Nh = N.clone().addScaledVector(up, -N.dot(up)).addScaledVector(L, -N.clone().addScaledVector(up, -N.dot(up)).dot(L)).normalize();
    const blade = vs.filter((v) => v.by > 1.36 && v.by < 1.47 && v.bz < -0.05 && Math.abs(v.bx) < 0.12);
    const hem = vs.filter((v) => v.by < 1.0 && v.bz < 0);
    const arg = (set, f) => set.reduce((b, v) => (f(v) > f(b) ? v : b));
    const B = arg(blade, (v) => v.w.dot(N)).w, Bv = arg(blade, (v) => v.w.dot(Nh)).w;
    const lowY = Math.min(...vs.map((v) => v.w.y));
    const protAxis = Math.max(...hem.map((v) => v.w.clone().sub(B).dot(N)));
    const protPlumb = Math.max(...hem.map((v) => v.w.clone().sub(Bv).dot(Nh)));
    // Back profile along the torso axis (s), its outermost depth per 2 cm band, vs the chord B → hem.
    const sOf = (w) => w.clone().sub(B).dot(A);
    const bandMax = new Map();
    for (const v of vs) {
      if (v.bz > -0.02 || Math.abs(v.bx) > 0.14) continue;
      const k = Math.round(sOf(v.w) / 0.02);
      bandMax.set(k, Math.max(bandMax.get(k) ?? -1e9, v.w.clone().sub(B).dot(N)));
    }
    const H = arg(hem, (v) => v.w.dot(N)).w, sH = sOf(H), dH = H.clone().sub(B).dot(N);
    let dip = 0;
    for (const [k, d] of bandMax) {
      const s = k * 0.02;
      if (s >= -0.02 || s <= sH + 0.02) continue;
      dip = Math.max(dip, (dH * s) / sH - d);
    }
    const ax = B.clone().addScaledVector(A, (lowY - B.y) / A.y);   // the torso-axis line down to the hem height
    const pl = V().set(Bv.x, lowY, Bv.z);
    const H2 = arg(hem, (v) => v.w.dot(Nh)).w;
    return {
      lines: [
        { a: toPx(B), b: toPx(ax), c: '#ffd23f', label: 'back line (torso axis)' },
      ],
      dots: [{ p: toPx(B), c: '#ffd23f' }, { p: toPx(H), c: '#ff5a5a' }, { p: toPx(H2), c: '#ff5a5a' }],
      num: { protAxis: +(protAxis * 100).toFixed(1), protPlumb: +(protPlumb * 100).toFixed(1), dip: +(dip * 100).toFixed(1) },
    };
  };
  // Back-view guide lines: plumb lines at the outer edges of the shoulders (jacket + sleeve heads) and
  // the widest the jacket gets over the hips / at the hem.
  window.__silBack = () => {
    const vs = skinned([0, 1]);
    const jl = vs.filter((v) => v.id === 0);
    const L = (() => {
      const a = V(), b = V(); let na = 0, nb = 0;
      for (const v of jl) if (v.by < 1.3 && v.by > 1.0) { if (v.bx > 0.12) { a.add(v.w); na++; } else if (v.bx < -0.12) { b.add(v.w); nb++; } }
      return a.multiplyScalar(1 / na).sub(b.multiplyScalar(1 / nb)).normalize();
    })();
    const sh = vs.filter((v) => v.by > 1.38 && v.by < 1.52 && Math.abs(v.bx) <= 0.3);
    const hp = jl.filter((v) => v.by < 1.02);
    const ext = (set) => { let lo = set[0], hi = set[0]; for (const v of set) { if (v.w.dot(L) < lo.w.dot(L)) lo = v; if (v.w.dot(L) > hi.w.dot(L)) hi = v; } return [lo.w, hi.w]; };
    const [s0, s1] = ext(sh), [h0, h1] = ext(hp);
    const lowY = Math.min(...jl.map((v) => v.w.y));
    const down = (w) => V().set(w.x, lowY - 0.02, w.z);
    return {
      lines: [
        { a: toPx(s0), b: toPx(down(s0)), c: '#ffd23f', label: 'shoulder' },
        { a: toPx(s1), b: toPx(down(s1)), c: '#ffd23f', label: '' },
      ],
      dots: [{ p: toPx(h0), c: '#ff5a5a' }, { p: toPx(h1), c: '#ff5a5a' }],
      num: { shoulder: +((s1.dot(L) - s0.dot(L)) * 100).toFixed(1), hips: +((h1.dot(L) - h0.dot(L)) * 100).toFixed(1) },
    };
  };
  // Bind-pose side and front profile of the jacket, pants and body (metres), per 1 cm.
  window.__profile = () => {
    const look = stage.rider.look, g = look.meshes.garments.geometry, P = g.attributes.position, G = g.attributes.aG;
    const bodyGeo = look.meshes.body.geometry, BP = bodyGeo.attributes.position;
    const rows = [];
    for (let y = 1.62; y >= 0.74; y -= 0.01) {
      const r = { y: +y.toFixed(2) };
      for (const [k, id] of [['j', 0], ['p', 2]]) {
        let zb = 1e9, zf = -1e9, x = 0, n = 0;
        for (let i = 0; i < P.count; i++) {
          if (Math.round(G.getX(i)) !== id || Math.abs(P.getY(i) - y) > 0.01) continue;
          x = Math.max(x, Math.abs(P.getX(i)));
          if (Math.abs(P.getX(i)) > 0.16) continue;
          zb = Math.min(zb, P.getZ(i)); zf = Math.max(zf, P.getZ(i)); n++;
        }
        if (n) r[k] = [+zb.toFixed(4), +zf.toFixed(4), +x.toFixed(4)];
      }
      let zb = 1e9, zf = -1e9;
      for (let i = 0; i < BP.count; i++) {
        if (Math.abs(BP.getY(i) - y) > 0.012 || Math.abs(BP.getX(i)) > 0.16) continue;
        zb = Math.min(zb, BP.getZ(i)); zf = Math.max(zf, BP.getZ(i));
      }
      if (zb < 1e8) r.b = [+zb.toFixed(4), +zf.toFixed(4)];
      rows.push(r);
    }
    return rows;
  };
}

async function capture(browser, body, jobs) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const sep = base.includes('?') ? '&' : '?';
  await page.goto(`${base}${sep}protobody=${body}&quality=1`);
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby?.visible && window.__senditProto, null, { timeout: 300000 });
  meta.list = await page.evaluate(() => window.__senditProto.list);
  await page.evaluate(pageHelpers);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
    document.head.appendChild(st);
    const S = window.__sendit, stage = S.stage;
    if (S.life?.group) Object.defineProperty(S.life.group, 'visible', { get: () => false, set: () => {} });
    stage.setShot('full');
    window.__pose = 'stand'; window.__yaw = Math.PI;
    const baseUpdate = stage.update.bind(stage);
    stage.update = (dt) => {
      stage.idle = -1e9; stage.yawVel = 0; stage.spinInput = 0; stage.yaw = window.__yaw;
      stage.zoom = window.__pose === 'board' ? 0.7 : window.__pose === 'stand' ? 0.63 : window.__pose === 'carve' ? 0.86 : 0.74; stage.setFocusRect({ x: 0, y: 0, w: innerWidth, h: innerHeight });
      baseUpdate(dt);
    };
    stage.animateRider = function (dt) {
      const pl = this.pl, P = window.__pose;
      pl.speed = P === 'carve' || P === 'tuck' ? 13 : 1.4;
      pl.turnInput = P === 'carve' ? 1 : 0;
      pl.tuck = P === 'tuck' ? 1 : 0; pl.brake = 0;
      pl.squat = 0;
      pl.grab = P === 'grab' ? 1 : 0; pl.grabName = 'Indy';
      pl.state = P === 'grab' ? 2 : 1;
      pl.airTime = P === 'grab' ? 0.6 : 0;
      pl.renderPos.y = P === 'grab' ? 0.3 : 0;
      this.rider.update(dt, this.camera);
    };
  });
  const shot = async (file) => page.screenshot({ path: file, clip: { x: CX, y: CY, width: CW, height: CH } });
  const pose = async (p, v, wait) => {
    await page.evaluate(([p2, y]) => { window.__pose = p2; window.__yaw = (y * Math.PI) / 180; }, [p, YAW[v]]);
    await page.waitForTimeout(wait);
  };
  const toClip = (o) => {
    const f = ([x, y]) => [+(x - CX).toFixed(1), +(y - CY).toFixed(1)];
    return { ...o, lines: o.lines.map((l) => ({ ...l, a: f(l.a), b: f(l.b) })), dots: o.dots.map((d) => ({ ...d, p: f(d.p) })) };
  };
  const dress = async (key) => { await page.evaluate((k) => window.__sendit.stage.rider.setOutfit(window.__senditProto.slots(k)), key); await page.waitForTimeout(400); };
  // Bare body.
  if (jobs.bare) {
    await page.evaluate(() => {
      const look = window.__sendit.stage.rider.look;
      look.meshes.garments.visible = false;
      window.__shrink = look.suit.userData.uniforms.uShrink.value;
      look.suit.userData.uniforms.uShrink.value = 0;
    });
    for (const v of ['front', 'side', 'q34b']) { await pose('stand', v, 900); await shot(frame(`body-${body}`, 'stand', v)); }
    await page.evaluate(() => {
      const look = window.__sendit.stage.rider.look;
      look.meshes.garments.visible = true;
      look.suit.userData.uniforms.uShrink.value = window.__shrink;
    });
  }
  for (const key of jobs.full) {
    const tag = tagOf(key, body);
    await dress(key);
    for (const v of STAND) {
      await pose('stand', v, v === 'front' ? 1200 : 700);
      await shot(frame(tag, 'stand', v));
      if (v === 'side') meta.sil[`${tag}-stand-side`] = toClip(await page.evaluate(() => window.__silSide()));
      if (v === 'back') meta.sil[`${tag}-stand-back`] = toClip(await page.evaluate(() => window.__silBack()));
    }
    for (const [p, v] of MOTION) {
      await pose(p, v, 1300);
      await shot(frame(tag, p, v));
      if (p === 'tuck') meta.sil[`${tag}-tuck-side`] = toClip(await page.evaluate(() => window.__silSide()));
    }
    meta.profile[tag] = await page.evaluate(() => window.__profile());
    const src = SOURCE[key];
    if (src) { await dress(src); meta.profile[`P${src}-${body}`] = await page.evaluate(() => window.__profile()); }
    await pose('stand', 'front', 300);
  }
  for (const key of jobs.cmp) {
    const tag = tagOf(key, body);
    await dress(key);
    for (const v of CMPV) await (async () => { await pose('stand', v, v === 'front' ? 1200 : 700); await shot(frame(tag, 'stand', v)); })();
  }
  if (jobs.full.length) {
    await page.evaluate(() => window.__sendit.stage.setEquipment('snowboard', { animate: false }));
    await page.waitForTimeout(600);
    for (const key of jobs.full) {
      await dress(key);
      for (const v of BOARD) { await pose('board', v, 1300); await shot(frame(tagOf(key, body), 'board', v)); }
    }
    await page.evaluate(() => window.__sendit.stage.setEquipment('skis', { animate: false }));
  }
  await page.close();
  return errors;
}

if (!flags.has('--compose-only')) {
  const browser = await chromium.launch({ args });
  const errors = [];
  const jobs = {
    mid: { bare: BODIES_SHEET, full: only.slice(), cmp: BODIES_SHEET ? ['10', '2'] : [] },
    current: { bare: BODIES_SHEET, full: [], cmp: BODIES_SHEET ? ['10', '2'] : [] },
    natural: { bare: BODIES_SHEET, full: [], cmp: BODIES_SHEET ? ['10', '2'] : [] },
  };
  for (const [k, b] of ALT) jobs[b]?.full.push(k);
  for (const [body, j] of Object.entries(jobs)) {
    if (!j.bare && !j.full.length && !j.cmp.length) continue;
    errors.push(...await capture(browser, body, j));
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  }
  await browser.close();
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
}
if (flags.has('--frames-only')) process.exit(0);

// ------------------------------------------------------------------------------------------- compose
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const img = (f) => (fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '');
const css = `body{margin:0;background:#15171b;color:#e8e6e1;font-family:-apple-system,system-ui,Segoe UI,sans-serif}
.h{display:flex;align-items:baseline;gap:22px;padding:22px 28px 6px}.n{font-size:96px;font-weight:800;letter-spacing:-2px;color:#fff}
.t{font-size:44px;font-weight:700}.f{font-size:24px;color:#b9b5ab;padding:0 28px 14px}.b{font-size:21px;color:#8fc7ff;padding:0 28px 12px}
.row{display:flex;gap:8px;padding:6px 28px}.c{position:relative}.c img{display:block;border-radius:6px}
.l{position:absolute;left:10px;top:8px;font-size:21px;font-weight:600;text-shadow:0 0 4px #000,0 0 2px #000}
.rl{font-size:19px;color:#9a968e;padding:10px 28px 0;text-transform:uppercase;letter-spacing:2px}
.big{position:absolute;left:12px;bottom:10px;font-size:44px;font-weight:800;text-shadow:0 0 6px #000,0 0 3px #000}
.num{position:absolute;left:10px;bottom:10px;font-size:19px;font-weight:600;line-height:1.35;text-shadow:0 0 4px #000,0 0 2px #000;background:#000a;padding:6px 9px;border-radius:6px}`;
const FW = 500;
const tile = (f, label, w = FW, extra = '') => `<div class="c"><img style="width:${w}px;height:${Math.round(w * CH / CW)}px;object-fit:cover" src="${img(f)}"><span class="l">${label}</span>${extra}</div>`;
const svgOver = (sil, w) => {
  if (!sil) return '';
  const k = w / CW, h = Math.round(w * CH / CW);
  const L = sil.lines.map((l) => `<line x1="${l.a[0] * k}" y1="${l.a[1] * k}" x2="${l.b[0] * k}" y2="${l.b[1] * k}" stroke="${l.c}" stroke-width="3" stroke-dasharray="10 6"/>`).join('');
  const D = sil.dots.map((d) => `<circle cx="${d.p[0] * k}" cy="${d.p[1] * k}" r="6" fill="${d.c}" stroke="#000" stroke-width="1.5"/>`).join('');
  return `<svg style="position:absolute;left:0;top:0" width="${w}" height="${h}">${L}${D}</svg>`;
};
const list = meta.list || [];
const info = (key) => list.find((p) => String(p.id) === String(key)) || { id: key, name: key, fit: '' };
const looks = [...only.map((k) => [k, 'mid']), ...ALT];
for (const [key, body] of looks) {
  const P = info(key), tag = tagOf(key, body), up = key.toUpperCase();
  const name = body === 'mid' ? `${up}.png` : `${up}-${body}.png`;
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="n">${up}</span><span class="t">${P.name}</span></div>
  <div class="f">${P.fit}</div><div class="b">${BODY_NAME[body]} · pants: ${P.pantsFrom || ''} · lobby light</div>
  <div class="rl">Standing on skis</div><div class="row">${STAND.map((v) => tile(frame(tag, 'stand', v), VIEW_NAME[v])).join('')}</div>
  <div class="rl">In motion</div><div class="row">${MOTION.map(([p, v]) => tile(frame(tag, p, v), `${p === 'grab' ? 'air grab' : p} · ${VIEW_NAME[v]}`)).join('')}</div>
  <div class="rl">Snowboard stance</div><div class="row">${BOARD.map((v) => tile(frame(tag, 'board', v), `snowboard · ${BOARD_NAME[v] || v}`)).join('')}</div>
  <div style="height:22px"></div></body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + FW * 5 + 8 * 4, height: 600 });
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });

  // Silhouette check.
  const prof = meta.profile[tag], src = SOURCE[key], srcProf = meta.profile[`P${src}-${body}`];
  const plot = (() => {
    if (!prof) return '';
    const W = 560, H = 1040, sc = 1000, ox = 300, oy = 40, Y = (y) => oy + (1.62 - y) * sc, Z = (z) => ox + z * sc;
    const pathOf = (rows, k, i) => rows.filter((r) => r[k]).map((r, n) => `${n ? 'L' : 'M'}${Z(r[k][i]).toFixed(1)},${Y(r.y).toFixed(1)}`).join('');
    const bodyB = pathOf(prof, 'b', 0), bodyF = pathOf(prof, 'b', 1);
    const pB = pathOf(prof, 'p', 0), pF = pathOf(prof, 'p', 1);
    const jB = pathOf(prof, 'j', 0), jF = pathOf(prof, 'j', 1);
    const sB = srcProf ? pathOf(srcProf, 'j', 0) : '', sF = srcProf ? pathOf(srcProf, 'j', 1) : '';
    const blade = prof.filter((r) => r.j && r.y <= 1.44 && r.y >= 1.36).reduce((b, r) => (r.j[0] < b.j[0] ? r : b), prof.find((r) => r.j && r.y <= 1.44));
    const grid = [1.6, 1.4, 1.2, 1.0, 0.84].map((y) => `<line x1="20" x2="${W - 10}" y1="${Y(y)}" y2="${Y(y)}" stroke="#333" stroke-width="1"/><text x="24" y="${Y(y) - 4}" fill="#777" font-size="15">${y === 0.84 ? 'crotch 0.84' : y.toFixed(2) + ' m'}</text>`).join('');
    return `<svg width="${W}" height="${H}" style="background:#1d2026;border-radius:6px">${grid}
      <path d="${bodyB}" stroke="#7d828c" stroke-width="2" fill="none"/><path d="${bodyF}" stroke="#7d828c" stroke-width="2" fill="none"/>
      <path d="${pB}" stroke="#6fbf73" stroke-width="2.5" fill="none"/><path d="${pF}" stroke="#6fbf73" stroke-width="2.5" fill="none"/>
      ${sB ? `<path d="${sB}" stroke="#ff6b6b" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/><path d="${sF}" stroke="#ff6b6b" stroke-width="2.5" stroke-dasharray="7 5" fill="none"/>` : ''}
      <path d="${jB}" stroke="#ffffff" stroke-width="3.5" fill="none"/><path d="${jF}" stroke="#ffffff" stroke-width="3.5" fill="none"/>
      ${blade ? `<line x1="${Z(blade.j[0])}" x2="${Z(blade.j[0])}" y1="${Y(blade.y)}" y2="${Y(0.76)}" stroke="#5ad1ff" stroke-width="2.5" stroke-dasharray="10 6"/>` : ''}
      <text x="24" y="${H - 74}" fill="#fff" font-size="18">— ${up} jacket</text>
      ${src ? `<text x="200" y="${H - 74}" fill="#ff6b6b" font-size="18">- - P${src} jacket (round 1)</text>` : ''}
      <text x="24" y="${H - 48}" fill="#6fbf73" font-size="18">— pants</text>
      <text x="200" y="${H - 48}" fill="#9aa0aa" font-size="18">— body (bare)</text>
      <text x="24" y="${H - 22}" fill="#5ad1ff" font-size="18">- - plumb from the shoulder blades</text>
      <text x="${W - 190}" y="${H - 22}" fill="#999" font-size="18">← back · front →</text></svg>`;
  })();
  const sSide = meta.sil[`${tag}-stand-side`], sBack = meta.sil[`${tag}-stand-back`], sTuck = meta.sil[`${tag}-tuck-side`];
  const SW = 600;
  const numSide = (s) => (s ? `<div class="num">hem past the back line: <b>${s.num.protAxis} cm</b><br>waist dip under the blade→hem line: <b>${s.num.dip} cm</b></div>` : '');
  const numBack = (s) => (s ? `<div class="num">shoulders <b>${s.num.shoulder} cm</b> · hips ${s.num.hips} cm</div>` : '');
  const html2 = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="n">${up}</span><span class="t">${P.name} · silhouette check</span></div>
  <div class="f">Rule b: the back falls straight from the shoulder blades, the hem never cups the seat or kicks out. Rule a: the shoulders are the widest point.</div>
  <div class="row"><div class="c">${plot}<span class="l" style="left:auto;right:12px">bind pose · side profile</span></div>
  <div class="c">${tile(frame(tag, 'stand', 'side'), 'standing · side', SW, svgOver(sSide, SW) + numSide(sSide))}</div>
  <div class="c">${tile(frame(tag, 'stand', 'back'), 'standing · back', SW, svgOver(sBack, SW) + numBack(sBack))}</div>
  <div class="c">${tile(frame(tag, 'tuck', 'side'), 'tuck · side', SW, svgOver(sTuck, SW) + numSide(sTuck))}</div></div>
  <div class="f" style="padding-top:10px">Yellow: the straight line down the back from the shoulder blades, along the torso (side) / plumb lines at the shoulder edges (back). Blue (bind pose): plumb line from the shoulder blades. Red dots: the back-most point of the hem zone (side) / the widest point of the jacket below the belt (back).</div>
  <div style="height:16px"></div></body></html>`;
  await page.setContent(html2);
  await page.setViewportSize({ width: 28 * 2 + 560 + SW * 3 + 8 * 3, height: 600 });
  await page.screenshot({ path: path.join(outDir, name.replace('.png', '-silhouette.png')), fullPage: true });
}
// Overview: the six, front 3/4 and back 3/4.
if (only.length > 1) {
  const OW = 430;
  const cell = (key) => { const P = info(key); return `<div class="c">${tile(frame(tagOf(key, 'mid'), 'stand', 'q34'), '', OW, `<span class="big">${key.toUpperCase()}</span>`)}<div style="font-size:30px;font-weight:800;padding:8px 2px 0">${key.toUpperCase()} <span style="font-weight:600;font-size:23px">${P.name}</span></div><div style="font-size:17px;color:#b9b5ab;width:${OW}px;padding:2px 2px 8px">${P.fit}</div></div>`; };
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="t">Round 2: R1–R6</span><span class="f" style="padding:0">front 3/4 and back 3/4 · standing on skis · in-between body · same camera and scale</span></div>
  <div class="row">${only.map(cell).join('')}</div>
  <div class="rl">Back 3/4</div><div class="row">${only.map((k) => tile(frame(tagOf(k, 'mid'), 'stand', 'q34b'), '', OW, `<span class="big">${k.toUpperCase()}</span>`)).join('')}</div><div style="height:18px"></div></body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + OW * only.length + 8 * (only.length - 1), height: 600 });
  await page.screenshot({ path: path.join(outDir, 'overview.png'), fullPage: true });
}
// Bodies: P10 and P2 on the three bodies.
if (BODIES_SHEET) {
  const BW = 300, bodies = ['current', 'mid', 'natural'];
  const block = (key) => `<div class="rl" style="font-size:30px;color:#fff;letter-spacing:0;text-transform:none;font-weight:800">${key === '10' ? 'P10 Sherpa Flannel' : 'P2 Insulated Freedom'}</div>
    <div class="row">${bodies.map((b) => `<div><div style="font-size:26px;font-weight:800;padding:4px 2px">${BODY_NAME[b]}</div><div style="display:flex;gap:4px">${CMPV.map((v) => tile(frame(tagOf(key, b), 'stand', v), VIEW_NAME[v], BW)).join('')}</div></div>`).join('<div style="width:18px"></div>')}</div>`;
  const bare = `<div class="rl" style="font-size:30px;color:#fff;letter-spacing:0;text-transform:none;font-weight:800">Bare bodies</div><div class="row">${bodies.map((b) => `<div><div style="font-size:26px;font-weight:800;padding:4px 2px">${BODY_NAME[b]}</div><div style="display:flex;gap:4px">${['front', 'side', 'q34b'].map((v) => tile(frame(`body-${b}`, 'stand', v), VIEW_NAME[v], BW)).join('')}<div style="width:${BW}px"></div></div></div>`).join('<div style="width:18px"></div>')}</div>`;
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="t">Body decision: current · in-between · natural</span></div>
  <div class="f">Same outfit, same camera. In-between = the current body's shoulders (joints ±21 cm) with a slimmer, shallower chest and natural arms; hands, boots and helmet anchored.</div>
  ${block('10')}${block('2')}${bare}<div style="height:18px"></div></body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + (BW * 4 + 12) * 3 + 36 + 16, height: 600 });
  await page.screenshot({ path: path.join(outDir, 'bodies.png'), fullPage: true });
}
await browser.close();
console.log(JSON.stringify({ sheets: fs.readdirSync(outDir).filter((f) => f.endsWith('.png')) }));
