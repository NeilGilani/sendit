// Dev helper: turntable contact sheets of the lobby rider in chosen outfits and poses (docs/character.md).
// One boot, then for every look × pose it photographs front / 3/4 / side / back (or the views you pass)
// and lays them out on one sheet per look: <outDir>/sheet-<look>.png (+ the single frames with KEEP=1).
//
//   node web/scripts/outfit-turntable.mjs <url> <outDir> '<looks>' [poses] [views]
//     looks  ';'-separated, each "label=slot:garment@colorway,slot:garment@colorway…"
//            e.g. "shell=jacket:tuff-shell@tuff,pants:tuff-bib@tuff;puffer=jacket:puff-down@summit"
//            (garment or colorway may be left out: "jacket:@arcade")
//     poses  ','-separated: stand, crouch, carve, tuck, grab, reach   (default stand)
//     views  ','-separated yaw names or degrees: front, q34, side, back, q34b, side2   (default front,q34,side,back)
// Env: W/H (frame size, default 420×560), EQUIP=ski|snowboard, Q (quality, default 1), ZOOM (default 0.62)
// macOS: Metal ANGLE; elsewhere GPU=1 → D3D11, else SwiftShader.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [url = 'http://localhost:5203/', outDir = 'turntable', looksArg = 'default=', posesArg = 'stand', viewsArg = 'front,q34,side,back'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const FW = Number(process.env.W || 420), FH = Number(process.env.H || 560);
const VW = 1280, VH = 900;
const YAW = { front: 180, q34: 145, side: 90, back: 0, q34b: 35, side2: 270, q34l: 215 };
const looksSrc = looksArg.startsWith('@') ? fs.readFileSync(looksArg.slice(1), 'utf8').replace(/\s+/g, '') : looksArg;
const looks = looksSrc.split(';').filter(Boolean).map((s) => {
  const [label, spec = ''] = s.split('=');
  const slots = {};
  for (const part of spec.split(',').filter(Boolean)) {
    const [slot, rest = ''] = part.split(':');
    const [garment, colorway] = rest.split('@');
    slots[slot] = { ...(garment ? { garment } : {}), ...(colorway ? { colorway } : {}) };
  }
  return { label, slots };
});
const poses = posesArg.split(',').filter(Boolean);
const views = viewsArg.split(',').filter(Boolean).map((v) => ({ name: v, yaw: YAW[v] ?? Number(v) }));

const args = process.platform === 'darwin'
  ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sep = url.includes('?') ? '&' : '?';
await page.goto(`${url}${sep}quality=${process.env.Q ?? 1}`);
await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby?.visible, null, { timeout: 300000 });
await page.evaluate(({ equip, zoom }) => {
  const st = document.createElement('style');
  st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
  document.head.appendChild(st);
  const S = window.__sendit, stage = S.stage;
  // Other skiers (life.js) pass behind the plinth: hide them so nothing but the rider is in frame.
  if (S.life?.group) Object.defineProperty(S.life.group, 'visible', { get: () => false, set: () => {} });
  if (equip === 'snowboard') stage.setEquipment('snowboard', { animate: false });
  stage.setShot('full');
  stage.zoom = zoom;
  stage.setFocusRect({ x: 0, y: 0, w: innerWidth, h: innerHeight });
  window.__pose = 'stand';
  window.__yaw = Math.PI;
  const baseUpdate = stage.update.bind(stage);
  stage.update = (dt) => { stage.idle = -1e9; stage.yawVel = 0; stage.spinInput = 0; stage.yaw = window.__yaw; stage.setFocusRect({ x: 0, y: 0, w: innerWidth, h: innerHeight }); baseUpdate(dt); };
  // Hold a pose instead of the idle sway (the rig's own pose code does the rest).
  stage.animateRider = function (dt) {
    const pl = this.pl, P = window.__pose;
    pl.speed = P === 'carve' || P === 'tuck' ? 13 : 1.4;
    pl.turnInput = P === 'carve' ? 1 : P === 'reach' ? -1 : 0;
    pl.tuck = P === 'tuck' ? 1 : 0; pl.brake = 0;
    pl.squat = P === 'crouch' ? 0.9 : 0;
    pl.grab = P === 'grab' ? 1 : 0; pl.grabName = 'Indy';
    pl.state = P === 'grab' ? 2 : 1;
    pl.airTime = P === 'grab' ? 0.6 : 0;
    pl.renderPos.y = P === 'grab' ? 0.35 : 0;
    this.rider.update(dt, this.camera);
  };
}, { equip: process.env.EQUIP || 'ski', zoom: Number(process.env.ZOOM || 0.62) });

const frames = [];
for (const look of looks) {
  await page.evaluate((slots) => { window.__sendit.stage.rider.setOutfit(slots); }, look.slots);
  for (const pose of poses) {
    await page.evaluate((p) => { window.__pose = p; }, pose);
    for (const v of views) {
      await page.evaluate((y) => { window.__yaw = (y * Math.PI) / 180; }, v.yaw);
      await page.waitForTimeout(pose === 'stand' ? 700 : 1100);
      const buf = await page.screenshot({ clip: { x: (VW - FW) / 2, y: (VH - FH) / 2 - 20, width: FW, height: FH } });
      frames.push({ look: look.label, pose, view: v.name, b64: buf.toString('base64') });
      if (process.env.KEEP) fs.writeFileSync(path.join(outDir, `${look.label}-${pose}-${v.name}.png`), buf);
    }
  }
}

// Contact sheet per look: rows = poses, columns = views.
const sheet = await browser.newPage({ viewport: { width: 400, height: 300 } });
for (const look of looks) {
  const fr = frames.filter((f) => f.look === look.label);
  const cols = views.length, scale = 0.62;
  const html = `<html><body style="margin:0;background:#16181c;font:13px system-ui;color:#ddd">
    <div style="padding:6px 10px;font-weight:600">${look.label} — ${JSON.stringify(look.slots).replace(/"/g, '')}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols}, ${Math.round(FW * scale)}px);gap:4px;padding:4px">
    ${fr.map((f) => `<div style="position:relative"><img style="width:${Math.round(FW * scale)}px;display:block" src="data:image/png;base64,${f.b64}"><span style="position:absolute;left:4px;top:2px;text-shadow:0 0 3px #000">${f.pose} · ${f.view}</span></div>`).join('')}
    </div></body></html>`;
  await sheet.setContent(html);
  await sheet.setViewportSize({ width: Math.round(FW * scale + 4) * cols + 12, height: 400 });
  await sheet.screenshot({ path: path.join(outDir, `sheet-${look.label}.png`), fullPage: true });
}
console.log(JSON.stringify({ frames: frames.length, sheets: looks.map((l) => `sheet-${l.label}.png`), errors: errors.slice(0, 5) }));
await browser.close();
