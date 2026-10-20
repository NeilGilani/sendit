// Contact sheets for the catalogue jackets (docs/character.md § Catalogue jackets), in the lobby light on
// the game's body:
//   full   <outDir>/<jacket>.png: standing front, front 3/4, side, back, back 3/4; motion (carve both edges,
//          tuck, air grab, arms up); snowboard stance front 3/4 + back
//   close  <outDir>/close-<jacket>.png: close-ups for the clip issues: front hem (stand / carve / tuck /
//          grab), side waist profile (stand, front + side), armpit / shoulder (arms down / forward / up /
//          pole plant), front + 3/4
//   overview  <outDir>/overview.png: every jacket front 3/4 + back 3/4
//
//   node web/scripts/jackets-sheet.mjs <baseUrl> <outDir> [full,close,overview] [jacket1,jacket2|all] [--frames-only|--compose-only] [--tag=before]
// Looks: character/outfits.js CATALOG_JACKET_LOOKS (jacket + its pants) in each item's first case colourway
// (profile/items.js); the frames go to <outDir>/frames/<tag>-…, so a "before" run can be composed next to "after".
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const [base = 'http://localhost:5215/', outDir = '/tmp/claude-501/ship-jackets/sheets', modesArg = 'full,close,overview', listArg = 'all'] = argv.filter((a) => !a.startsWith('--'));
const modes = new Set(modesArg.split(','));
const TAG = opt('tag') || 'now';
const QS = opt('qs') ? `&${opt('qs')}` : '';
const frameDir = path.join(outDir, 'frames');
fs.mkdirSync(frameDir, { recursive: true });
const DPR = Number(process.env.DPR || 1.25);
const VW = 900, VH = 1100, CW = 540, CH = 960, CX = (VW - CW) / 2, CY = 50;
const YAW = { front: 180, q34: 145, side: 90, back: 0, q34b: 35, y240: 240, q34l: 215 };
const STAND = ['front', 'q34', 'side', 'back', 'q34b'];
const MOTION = [['carve', 'q34'], ['carveL', 'q34l'], ['tuck', 'side'], ['grab', 'q34'], ['armsup', 'front']];
const BOARD = ['y240', 'side'];
// Close-ups: [pose, bone target, yaw, distance (m), label]
const CLOSE = [
  ['stand', 'hem', 'front', 2.3, 'stand · front hem'], ['carve', 'hem', 'front', 2.3, 'carve · front hem'],
  ['tuck', 'hem', 'q34', 2.3, 'tuck · hem'], ['grab', 'hem', 'front', 2.4, 'air grab · hem'],
  ['stand', 'waist', 'side', 3.2, 'stand · side waist'], ['stand', 'waist', 'front', 3.2, 'stand · front waist'],
  ['armsdown', 'shoulder', 'q34', 2.0, 'arms down · armpit'], ['armsfwd', 'shoulder', 'q34', 2.0, 'arms forward · shoulder'],
  ['armsup', 'shoulder', 'front', 2.2, 'arms up · armpit'], ['stand', 'shoulder', 'q34', 2.0, 'riding stance · shoulder'],
  ['armsdown', 'shoulder', 'front', 2.2, 'arms down · front'], ['tuck', 'shoulder', 'side', 2.2, 'tuck · shoulder'],
];
const args = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const frame = (look, pose, view) => path.join(frameDir, `${TAG}-${look}-${pose}-${view}.png`);

async function capture(browser, looks) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?quality=1${QS}`);
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby?.visible, null, { timeout: 300000 });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
    document.head.appendChild(st);
    const S = window.__sendit, stage = S.stage;
    if (S.life?.group) Object.defineProperty(S.life.group, 'visible', { get: () => false, set: () => {} });
    stage.setShot('full');
    window.__pose = 'stand'; window.__yaw = Math.PI; window.__close = null;
    const baseUpdate = stage.update.bind(stage);
    stage.update = (dt) => {
      stage.idle = -1e9; stage.yawVel = 0; stage.spinInput = 0; stage.yaw = window.__yaw;
      const P = window.__pose;
      stage.zoom = P === 'board' ? 0.7 : P === 'stand' || P.startsWith('arms') ? 0.63 : P.startsWith('carve') ? 0.86 : 0.74;
      stage.setFocusRect({ x: 0, y: 0, w: innerWidth, h: innerHeight });
      baseUpdate(dt);
    };
    const baseCam = stage.updateCamera.bind(stage);
    const V = () => new (stage.camera.position.constructor)();
    stage.updateCamera = function (dt) {
      baseCam(dt);
      const c = window.__close;
      if (!c) return;
      // Close-up: the camera at `dist` from a bone target, at the stage yaw's angle around the rider.
      const r = this.rider, W = (n) => { const b = r.bones[n]; b.updateMatrixWorld(true); return V().setFromMatrixPosition(b.matrixWorld); };
      const tgt = c.target === 'hem' ? W('pelvis').lerp(W('thigh_r'), 0.25).add(V().set(0, -0.04, 0))
        : c.target === 'waist' ? W('spine_01').add(V().set(0, -0.06, 0))
          : (() => {
            const a = W('upperarm_r'), b = W('upperarm_l'), cp = this.camera.position;   // the shoulder nearer the camera
            return W('spine_03').lerp(a.distanceTo(cp) < b.distanceTo(cp) ? a : b, 0.7).add(V().set(0, -0.07, 0));
          })();
      const pos = this.camera.position.clone().sub(tgt); pos.y = 0; pos.normalize();
      this.camera.position.copy(tgt).addScaledVector(pos, c.dist).add(V().set(0, c.dist * 0.12, 0));
      this.camera.lookAt(tgt);
    };
    // Arm poses (on the standing ski pose): aim the upper / lower arms in the rider's frame.
    const aim = (r, bone, child, dir) => {
      const Q = () => new (stage.camera.quaternion.constructor)();
      r.root.updateMatrixWorld(true);
      const a = V().setFromMatrixPosition(bone.matrixWorld), b = V().setFromMatrixPosition(child.matrixWorld);
      const L = V().setFromMatrixPosition(r.bones.thigh_l.matrixWorld).sub(V().setFromMatrixPosition(r.bones.thigh_r.matrixWorld)); L.y = 0; L.normalize();
      const U = V().set(0, 1, 0), F = V().crossVectors(L, U);
      const want = L.multiplyScalar(dir[0]).addScaledVector(U, dir[1]).addScaledVector(F, dir[2]).normalize();
      const dq = Q().setFromUnitVectors(b.sub(a).normalize(), want);
      const qw = bone.getWorldQuaternion(Q()), qp = bone.parent.getWorldQuaternion(Q());
      bone.quaternion.copy(qp.invert().multiply(dq.multiply(qw)));
      r.root.updateMatrixWorld(true);
    };
    const ARMS = { armsdown: [[0.22, -1, 0.06], [0, -1, 0.25]], armsfwd: [[0.15, -0.3, 1], [0.05, -0.2, 1]], armsup: [[0.55, 1, 0.15], [0.35, 1, 0.1]] };
    stage.animateRider = function (dt) {
      const pl = this.pl, P = window.__pose;
      const carve = P === 'carve' || P === 'carveL';
      pl.speed = carve || P === 'tuck' ? 13 : 1.4;
      pl.turnInput = P === 'carve' ? 1 : P === 'carveL' ? -1 : 0;
      pl.tuck = P === 'tuck' ? 1 : 0; pl.brake = 0; pl.squat = 0;
      pl.grab = P === 'grab' ? 1 : 0; pl.grabName = this.rider.isBoard ? 'Indy' : 'Mute';
      pl.state = P === 'grab' ? 2 : 1;
      pl.airTime = P === 'grab' ? 0.6 : 0;
      pl.renderPos.y = P === 'grab' ? 0.3 : 0;
      this.rider.update(dt, this.camera);
      const A = ARMS[P];
      if (A) for (const [sd, d] of [['l', A[0]], ['r', A[1]]]) {
        const v = sd === 'r' ? [-d[0], d[1], d[2]] : d;
        aim(this.rider, this.rider.bones['upperarm_' + sd], this.rider.bones['lowerarm_' + sd], v);
        aim(this.rider, this.rider.bones['lowerarm_' + sd], this.rider.bones['hand_' + sd], [v[0], v[1], v[2] + 0.6]);
      }
    };
  });
  const shot = async (file) => page.screenshot({ path: file, clip: { x: CX, y: CY, width: CW, height: CH } });
  const pose = async (p, v, wait, close = null) => {
    await page.evaluate(([p2, y, c]) => { window.__pose = p2; window.__yaw = (y * Math.PI) / 180; window.__close = c; }, [p, YAW[v], close]);
    await page.waitForTimeout(wait);
  };
  const dress = async (look) => {
    await page.evaluate(async ([j, p, legacy]) => {
      const { CLOTHING_ITEMS } = await import('/src/profile/items.js');
      const { GARMENTS } = await import('/src/character/outfits.js');
      const first = (g) => { const it = CLOTHING_ITEMS.find((i) => i.garment === g); const v = it.variants.find((x) => x.rarity === 'legendary' && !x.colors.pat) || it.variants.find((x) => !x.starter) || it.variants[0]; return { garment: g, colorway: v.id, colors: v.colors }; };
      const jacket = first(j);
      // --legacy: the same cut without this pass's clip fixes (the "before" of the close-ups)
      if (legacy) jacket.def = { id: `${j}-legacy`, cut: { ...GARMENTS.jacket[j].cut, smoothProfile: null, layerPants: null, hemThigh: 0, armBlend: 0, pelvisRamp: null } };
      window.__sendit.stage.rider.setOutfit({ jacket, pants: first(p) });
    }, [...look, flags.has('--legacy')]);
    await page.waitForTimeout(500);
  };
  for (const look of looks) {
    const [j] = look;
    await dress(look);
    if (modes.has('full') || modes.has('overview')) {
      for (const v of STAND) { await pose('stand', v, v === 'front' ? 1100 : 650); await shot(frame(j, 'stand', v)); }
    }
    if (modes.has('full')) for (const [p, v] of MOTION) { await pose(p, v, 1200); await shot(frame(j, p, v)); }
    if (modes.has('close')) {
      for (const [p, tgt, v, dist] of CLOSE) { await pose(p, v, 1100, { target: tgt, dist }); await shot(frame(j, `close-${p}-${tgt}`, v)); }
      await pose('stand', 'front', 200, null);
    }
  }
  if (modes.has('full')) {
    await page.evaluate(() => window.__sendit.stage.setEquipment('snowboard', { animate: false }));
    await page.waitForTimeout(600);
    for (const look of looks) {
      await dress(look);
      for (const v of BOARD) { await pose('board', v, 1200); await shot(frame(look[0], 'board', v)); }
    }
    await page.evaluate(() => window.__sendit.stage.setEquipment('skis', { animate: false }));
  }
  await page.close();
  return errors;
}

const { CATALOG_JACKET_LOOKS } = await import('../src/character/outfits.js');
const { GARMENTS } = await import('../src/character/outfits.js');
const looks = listArg === 'all' ? CATALOG_JACKET_LOOKS : CATALOG_JACKET_LOOKS.filter(([j]) => listArg.split(',').includes(j));

if (!flags.has('--compose-only')) {
  const browser = await chromium.launch({ args });
  const errors = await capture(browser, looks);
  await browser.close();
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
}
if (flags.has('--frames-only')) process.exit(0);

// ------------------------------------------------------------------------------------------- compose
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const img = (f) => (fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '');
const css = `body{margin:0;background:#15171b;color:#e8e6e1;font-family:-apple-system,system-ui,Segoe UI,sans-serif}
.h{display:flex;align-items:baseline;gap:22px;padding:22px 28px 6px}.t{font-size:52px;font-weight:800}.f{font-size:22px;color:#b9b5ab;padding:0 28px 14px}
.row{display:flex;gap:8px;padding:6px 28px;flex-wrap:wrap}.c{position:relative}.c img{display:block;border-radius:6px}
.l{position:absolute;left:10px;top:8px;font-size:20px;font-weight:600;text-shadow:0 0 4px #000,0 0 2px #000}
.rl{font-size:18px;color:#9a968e;padding:10px 28px 0;text-transform:uppercase;letter-spacing:2px}
.big{position:absolute;left:12px;bottom:10px;font-size:30px;font-weight:800;text-shadow:0 0 6px #000,0 0 3px #000}`;
const FW = 380;
const cell = (f, label, w = FW) => `<div class="c"><img src="${img(f)}" width="${w}"><div class="l">${label}</div></div>`;
const VN = { front: 'front', q34: 'front 3/4', side: 'side', back: 'back', q34b: 'back 3/4', y240: 'front 3/4', q34l: 'front 3/4 (left)' };
const PN = { carve: 'carve (right turn)', carveL: 'carve (left turn)', tuck: 'tuck', grab: 'air grab', armsup: 'arms up' };
async function render(html, file) {
  await page.setContent(`<html><head><style>${css}</style></head><body>${html}</body></html>`);
  const h = await page.evaluate(() => document.body.scrollHeight), w = await page.evaluate(() => document.body.scrollWidth);
  await page.setViewportSize({ width: Math.max(1000, w), height: h });
  await page.screenshot({ path: file, fullPage: true });
}
const title = (j, p) => `<div class="h"><div class="t">${GARMENTS.jacket[j].name}</div><div class="f" style="padding:0">+ ${GARMENTS.pants[p].name} · ${TAG}</div></div><div class="f">${GARMENTS.jacket[j].blurb}</div>`;
for (const [j, p] of looks) {
  if (modes.has('full')) {
    let h = title(j, p);
    h += `<div class="rl">standing on skis</div><div class="row">${STAND.map((v) => cell(frame(j, 'stand', v), VN[v])).join('')}</div>`;
    h += `<div class="rl">in motion</div><div class="row">${MOTION.map(([q, v]) => cell(frame(j, q, v), `${PN[q]} · ${VN[v]}`)).join('')}</div>`;
    h += `<div class="rl">snowboard stance</div><div class="row">${BOARD.map((v) => cell(frame(j, 'board', v), `snowboard · ${VN[v]}`)).join('')}</div>`;
    await render(h, path.join(outDir, `${TAG}-${j}.png`));
  }
  if (modes.has('close')) {
    let h = title(j, p) + `<div class="row">${CLOSE.map(([q, tgt, v, , lab]) => cell(frame(j, `close-${q}-${tgt}`, v), lab, 300)).join('')}</div>`;
    await render(h, path.join(outDir, `${TAG}-close-${j}.png`));
  }
}
if (modes.has('overview')) {
  const W2 = 300;
  let h = `<div class="h"><div class="t">Catalogue jackets</div><div class="f" style="padding:0">front 3/4 and back 3/4 · in-between body · ${TAG}</div></div>`;
  h += `<div class="row">${looks.map(([j]) => `<div class="c"><img src="${img(frame(j, 'stand', 'q34'))}" width="${W2}"><div class="big">${GARMENTS.jacket[j].name}</div></div>`).join('')}</div>`;
  h += `<div class="row">${looks.map(([j]) => `<div class="c"><img src="${img(frame(j, 'stand', 'q34b'))}" width="${W2}"></div>`).join('')}</div>`;
  await render(h, path.join(outDir, `${TAG}-overview.png`));
}
await browser.close();
console.log('sheets in', outDir);
