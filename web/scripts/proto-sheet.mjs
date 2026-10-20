// Dev helper: contact sheets for the jacket prototype round (character/proto.js, docs/character.md
// § Prototype round). One page load per body ('natural' / 'current'); every prototype is photographed on
// the lobby plinth with the same camera, scale and light:
//   row 1 standing on skis: front, front 3/4, side, back, back 3/4
//   row 2 in motion: carve (3/4), carve (back 3/4, the chase-cam side), tuck (side), air grab (3/4, side)
// and laid out as <outDir>/P<n>.png per prototype, <outDir>/overview.png (all ten, front 3/4) and
// <outDir>/bodies.png (the two bodies bare + in P1).
//
//   node web/scripts/proto-sheet.mjs http://localhost:5213/ /tmp/claude-501/proto-jackets/sheets [1,2,3…] [--frames-only|--compose-only]
// Env: DPR (default 1.5), EQUIP=ski|snowboard
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const [base = 'http://localhost:5213/', outDir = 'proto-sheets', listArg = '1,2,3,4,5,6,7,8,9,10'] = argv.filter((a) => !a.startsWith('--'));
const only = listArg.split(',').map(Number).filter(Boolean);
const frameDir = path.join(outDir, 'frames');
fs.mkdirSync(frameDir, { recursive: true });
const DPR = Number(process.env.DPR || 1.5);
const VW = 900, VH = 1100, CW = 540, CH = 960, CX = (VW - CW) / 2, CY = 50;
const YAW = { front: 180, q34: 145, side: 90, back: 0, q34b: 35 };
const STAND = ['front', 'q34', 'side', 'back', 'q34b'];
const MOTION = [['carve', 'q34'], ['carve', 'q34b'], ['tuck', 'side'], ['grab', 'q34'], ['grab', 'side']];
const VIEW_NAME = { front: 'front', q34: 'front 3/4', side: 'side', back: 'back', q34b: 'back 3/4' };
const args = process.platform === 'darwin'
  ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const frame = (n, pose, view) => path.join(frameDir, `P${n}-${pose}-${view}.png`);
let meta = {};
const metaFile = path.join(outDir, 'meta.json');
if (fs.existsSync(metaFile)) meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

async function capture(browser, body, protos) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const sep = base.includes('?') ? '&' : '?';
  await page.goto(`${base}${sep}protobody=${body}&quality=1`);
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby?.visible && window.__senditProto, null, { timeout: 300000 });
  meta.list = await page.evaluate(() => window.__senditProto.list);
  await page.evaluate(({ equip }) => {
    const st = document.createElement('style');
    st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
    document.head.appendChild(st);
    const S = window.__sendit, stage = S.stage;
    if (S.life?.group) Object.defineProperty(S.life.group, 'visible', { get: () => false, set: () => {} });
    if (equip === 'snowboard') stage.setEquipment('snowboard', { animate: false });
    stage.setShot('full');
    window.__pose = 'stand'; window.__yaw = Math.PI;
    const baseUpdate = stage.update.bind(stage);
    stage.update = (dt) => {
      stage.idle = -1e9; stage.yawVel = 0; stage.spinInput = 0; stage.yaw = window.__yaw;
      stage.zoom = window.__pose === 'stand' ? 0.63 : window.__pose === 'carve' ? 0.86 : 0.74; stage.setFocusRect({ x: 0, y: 0, w: innerWidth, h: innerHeight });
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
  }, { equip: process.env.EQUIP || 'ski' });
  const shot = async (file) => page.screenshot({ path: file, clip: { x: CX, y: CY, width: CW, height: CH } });
  const pose = async (p, v, wait) => {
    await page.evaluate(([p2, y]) => { window.__pose = p2; window.__yaw = (y * Math.PI) / 180; }, [p, YAW[v]]);
    await page.waitForTimeout(wait);
  };
  // Bare body (garments hidden, no shrink) for the body comparison.
  await page.evaluate(() => {
    const look = window.__sendit.stage.rider.look;
    look.meshes.garments.visible = false;
    window.__shrink = look.suit.userData.uniforms.uShrink.value;
    look.suit.userData.uniforms.uShrink.value = 0;
  });
  for (const v of ['front', 'side', 'q34']) { await pose('stand', v, 900); await shot(path.join(frameDir, `body-${body}-${v}.png`)); }
  await page.evaluate(() => {
    const look = window.__sendit.stage.rider.look;
    look.meshes.garments.visible = true;
    look.suit.userData.uniforms.uShrink.value = window.__shrink;
  });
  for (const n of protos) {
    await page.evaluate((k) => window.__sendit.stage.rider.setOutfit(window.__senditProto.slots(k)), n);
    await page.waitForTimeout(400);
    const tag = protos.includes(n) && meta.list.find((p) => p.id === n)?.body === body ? n : `${n}-${body}`;
    for (const v of STAND) { await pose('stand', v, v === 'front' ? 1200 : 700); await shot(frame(tag, 'stand', v)); }
    if (tag === n) for (const [p, v] of MOTION) { await pose(p, v, 1300); await shot(frame(tag, p, v)); }
    await pose('stand', 'front', 600);
  }
  await page.close();
  return errors;
}

if (!flags.has('--compose-only')) {
  const browser = await chromium.launch({ args });
  // Which body each prototype wears (from the page), then one page per body. P1 is also shot on the
  // other body for the comparison sheet.
  const probe = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await probe.goto(`${base}${base.includes('?') ? '&' : '?'}quality=0`);
  await probe.waitForFunction(() => window.__senditProto, null, { timeout: 300000 });
  meta.list = await probe.evaluate(() => window.__senditProto.list);
  await probe.close();
  const errors = [];
  for (const body of ['natural', 'current']) {
    const mine = only.filter((n) => meta.list.find((p) => p.id === n)?.body === body);
    const extra = only.includes(1) ? [1].filter((n) => !mine.includes(n)) : [];
    if (!mine.length && !extra.length) continue;
    errors.push(...await capture(browser, body, [...mine, ...extra]));
  }
  await browser.close();
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
}
if (flags.has('--frames-only')) process.exit(0);

// ------------------------------------------------------------------------------------------- compose
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const img = (f) => (fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '');
const css = `body{margin:0;background:#15171b;color:#e8e6e1;font-family:-apple-system,system-ui,Segoe UI,sans-serif}
.h{display:flex;align-items:baseline;gap:22px;padding:22px 28px 6px}.n{font-size:84px;font-weight:800;letter-spacing:-2px;color:#fff}
.t{font-size:40px;font-weight:700}.f{font-size:24px;color:#b9b5ab;padding:0 28px 14px}.b{font-size:20px;color:#8fc7ff;padding:0 28px 12px}
.row{display:flex;gap:8px;padding:6px 28px}.c{position:relative}.c img{display:block;border-radius:6px}
.l{position:absolute;left:10px;top:8px;font-size:20px;font-weight:600;text-shadow:0 0 4px #000,0 0 2px #000}
.rl{font-size:18px;color:#9a968e;padding:10px 28px 0;text-transform:uppercase;letter-spacing:2px}`;
const FW = 500, FH = Math.round(FW * CH / CW);
const tile = (f, label, w = FW) => `<div class="c"><img style="width:${w}px;height:${Math.round(w * CH / CW)}px;object-fit:cover" src="${img(f)}"><span class="l">${label}</span></div>`;
const list = meta.list || [];
for (const P of list.filter((p) => only.includes(p.id))) {
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="n">P${P.id}</span><span class="t">${P.name}</span></div>
  <div class="f">${P.fit}</div><div class="b">Body: ${P.body === 'natural' ? 'natural male proportions (prototype)' : 'current game body'} · on skis · lobby light</div>
  <div class="rl">Standing</div><div class="row">${STAND.map((v) => tile(frame(P.id, 'stand', v), VIEW_NAME[v])).join('')}</div>
  <div class="rl">In motion</div><div class="row">${MOTION.map(([p, v]) => tile(frame(P.id, p, v), `${p === 'grab' ? 'air grab' : p} · ${VIEW_NAME[v]}`)).join('')}</div>
  <div style="height:22px"></div></body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + FW * 5 + 8 * 4, height: 600 });
  await page.screenshot({ path: path.join(outDir, `P${P.id}.png`), fullPage: true });
}
// Overview: all ten side by side, front 3/4 standing (plus a back 3/4 row underneath).
{
  const OW = 380;
  const cells = (view) => list.map((P) => `<div class="c">${tile(frame(P.id, 'stand', view), '', OW)}<div style="font-size:30px;font-weight:800;padding:8px 2px 0">P${P.id} <span style="font-weight:600;font-size:21px">${P.name}</span> <span style="font-size:14px;font-weight:600;color:${P.body === 'natural' ? '#8fc7ff' : '#9a968e'}">${P.body} body</span></div><div style="font-size:15px;color:#b9b5ab;width:${OW}px;padding:2px 2px 8px">${P.fit}</div></div>`).join('');
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="t">Jacket prototypes P1–P10</span><span class="f" style="padding:0">front 3/4 · standing on skis · same camera and scale · blue tag = natural body, grey = current body</span></div>
  <div class="row">${cells('q34')}</div>
  <div class="rl">Back 3/4</div><div class="row">${list.map((P) => tile(frame(P.id, 'stand', 'q34b'), `P${P.id}`, OW)).join('')}</div><div style="height:18px"></div></body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + OW * 10 + 8 * 9, height: 600 });
  await page.screenshot({ path: path.join(outDir, 'overview.png'), fullPage: true });
}
// Bodies: bare current vs natural (front, side, 3/4), then P1 on each.
{
  const BW = 420;
  const p1 = list.find((p) => p.id === 1);
  const other = p1?.body === 'natural' ? 'current' : 'natural';
  const p1f = (body, v) => (body === p1?.body ? frame(1, 'stand', v) : frame(`1-${body}`, 'stand', v));
  const html = `<html><head><style>${css}</style></head><body>
  <div class="h"><span class="t">Body proportions</span><span class="f" style="padding:0">current Quaternius body vs the natural prototype body (same height, hips, hands and feet)</span></div>
  <div class="rl">Bare (outfit hidden)</div><div class="row">${['current', 'natural'].flatMap((b) => ['front', 'side', 'q34'].map((v) => tile(path.join(frameDir, `body-${b}-${v}.png`), `${b} · ${VIEW_NAME[v]}`, BW))).join('')}</div>
  <div class="rl">Dressed in P1</div><div class="row">${['current', 'natural'].flatMap((b) => ['front', 'side', 'q34'].map((v) => tile(p1f(b, v), `${b} · ${VIEW_NAME[v]}`, BW))).join('')}</div>
  <div style="height:18px"></div></body></html>`;
  void other;
  await page.setContent(html);
  await page.setViewportSize({ width: 28 * 2 + BW * 6 + 8 * 5, height: 600 });
  await page.screenshot({ path: path.join(outDir, 'bodies.png'), fullPage: true });
}
await browser.close();
console.log(JSON.stringify({ sheets: fs.readdirSync(outDir).filter((f) => f.endsWith('.png')) }));
