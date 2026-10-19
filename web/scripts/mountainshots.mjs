// Mountain pictures for the lobby (Maps tab cards, the trail list header, the lobby's map button):
// boots each map in the real game (its own atmosphere, lighting, trees and post stack, quality 2),
// hides the lobby UI and the rider, puts a cinematic establishing camera across the valley that sees
// the whole face from the top station to the run-out, waits for terrain / trees to stream in, and saves
// an optimised WebP to ../assets/maps/<map id>.webp (served at /maps/<id>.webp). The lobby shows the
// file if it exists and falls back to the map's old painted thumbnail if not.
//
// Usage: node scripts/mountainshots.mjs <baseUrl> [outDir=../assets/maps] [maps=comma list]
//   W=1600 H=1000 DPR=1 Q=0.82 (webp quality)   SHEET=<png> also writes a contact sheet of the set
//   CAM='{"blackspruce":{"az":20}}' per-map tweaks on top of SHOT below (for trying angles)
// Camera (per map, SHOT): the face is found from the spawn (top) by walking down the start heading
// until the snow stops dropping (the valley floor, `L` metres away). The camera stands `dist` × L
// beyond the top along that line, turned `az` degrees around the face's centre, `up` × the drop above
// the valley floor, and looks at the point `look` of the way down the face; fov in degrees.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:5198/').replace(/\/?$/, '/');
const out = process.argv[3] || new URL('../../assets/maps', import.meta.url).pathname;
const ALL = ['valcrest-gully', 'lake-tahoe', 'blackspruce', 'ravenspire', 'voltage-park', 'dragonback', 'kitsune-peak', 'fjordline'];
const maps = (process.argv[4] || ALL.join(',')).split(',').filter(Boolean);
const W = Number(process.env.W || 1600), H = Number(process.env.H || 1000), DPR = Number(process.env.DPR || 1), Q = Number(process.env.Q || 0.82);
const DEF = { az: 28, dist: 1.25, up: 0.62, look: 0.5, fov: 42, side: 0 };
export const SHOT = {
  // The two gully maps sit in narrow valleys: a drone shot from the run-out looking up the valley.
  'valcrest-gully': { az: 0, up: 1.2, dist: 1.05, look: 0.35, fov: 48 },
  'lake-tahoe': { dist: 1.1, up: 0.75 },
  blackspruce: { az: 0, up: 1.1, dist: 1.05, look: 0.3, fov: 48 },
  ravenspire: {},
  'voltage-park': { up: 0.8 },
  dragonback: {},
  'kitsune-peak': {},
  fjordline: {},
};
const tweak = process.env.CAM ? JSON.parse(process.env.CAM) : {};
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: [...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-angle=d3d11']), '--enable-gpu', '--ignore-gpu-blocklist'],
});
let bad = 0;
const written = [];
try {
  for (const id of maps) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(`${base}?map=${id}&quality=2`);
    await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby?.visible, null, { timeout: 400000 });
    await page.addStyleTag({ content: '#lobby, #hud, .hud, #loading, .toast, #toasts, .ld-ui { display: none !important; } ' });
    const spec = { ...DEF, ...(SHOT[id] || {}), ...(tweak[id] || {}) };
    const info = await page.evaluate((S) => {
      const s = window.__sendit, T = s.terrain, sp = T.getSpawn();
      const p = sp.position, h = sp.heading ?? 0, Hh = (x, z) => T.getHeight(x, z);
      const dx = -Math.sin(h), dz = -Math.cos(h);
      // Walk down the start heading until the snow stops dropping: the valley floor.
      const top = Hh(p.x, p.z);
      let minH = top, L = 300;
      for (let d = 20; d < 6000; d += 20) {
        const y = Hh(p.x + dx * d, p.z + dz * d);
        if (y < minH - 2) { minH = y; L = d; }
        else if (d - L > 600) break;
      }
      const drop = Math.max(80, top - minH);
      // Face centre, camera across the valley turned around it, high enough to clear the ground.
      const cx = p.x + dx * L * 0.5, cz = p.z + dz * L * 0.5;
      const a = (S.az * Math.PI) / 180, R = L * S.dist;
      const ox = dx * Math.cos(a) - dz * Math.sin(a), oz = dx * Math.sin(a) + dz * Math.cos(a);
      const camX = cx + ox * R + (-dz) * S.side * L, camZ = cz + oz * R + dx * S.side * L;
      let camY = minH + drop * S.up;
      for (let k = 0; k <= 20; k++) {     // keep the sight line above the ground near the camera
        const t = k / 20, x = camX + (cx - camX) * t * 0.5, z = camZ + (cz - camZ) * t * 0.5;
        camY = Math.max(camY, Hh(x, z) + 60 + 40 * (1 - t));
      }
      const lx = p.x + dx * L * S.look, lz = p.z + dz * L * S.look;
      const ly = Hh(lx, lz) + drop * 0.08;
      const cam = [camX, camY, camZ, lx, ly, lz, S.fov];
      window.__gfxCam = cam;
      // The rider and the plinth stay out of the picture; the stage stops steering the camera.
      s.stage.root.visible = false;
      s.stage.cameraOverride = () => true;
      s.camera.clearViewOffset();
      s.camera.far = Math.max(s.camera.far, R * 4);
      s.camera.updateProjectionMatrix();
      return { L: Math.round(L), drop: Math.round(drop), cam: cam.map((v) => Math.round(v)) };
    }, spec);
    // Let terrain LODs, trees and the shadow box settle around the new view.
    await page.waitForTimeout(9000);
    const png = await page.screenshot({ type: 'png' });
    const b64 = await page.evaluate(async ({ data, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, 0, 0);
      // Step the quality down until the file is under ~300 KB (busy rock faces compress worse).
      let blob = await c.convertToBlob({ type: 'image/webp', quality: q });
      for (let qq = q - 0.06; blob.size > 300 * 1024 && qq >= 0.55; qq -= 0.06) blob = await c.convertToBlob({ type: 'image/webp', quality: qq });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, { data: png.toString('base64'), q: Q });
    const file = `${out}/${id}.webp`;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    written.push(file);
    console.log(`${id}: ${Math.round(fs.statSync(file).size / 1024)} KB  ${((Date.now() - t0) / 1000).toFixed(0)} s  ${JSON.stringify(info)}${errors.length ? '  ERRORS ' + errors.join(' | ') : ''}`);
    if (errors.length) bad++;
    await ctx.close();
  }
  if (process.env.SHEET && written.length) {
    // Contact sheet: the set in a grid with names.
    const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } });
    const tiles = written.map((f) => [f.split('/').pop().replace('.webp', ''), fs.readFileSync(f).toString('base64')]);
    await page.setContent(`<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:1624px">${tiles.map(([n, b]) => `<div style="position:relative;width:800px"><img src="data:image/webp;base64,${b}" style="width:800px;display:block"><span style="position:absolute;left:8px;bottom:6px;color:#fff;font:600 18px system-ui;text-shadow:0 1px 3px #000">${n}</span></div>`).join('')}</body>`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: process.env.SHEET, fullPage: true });
    console.log('wrote', process.env.SHEET);
  }
} finally {
  await browser.close();
}
process.exit(bad ? 1 : 0);
