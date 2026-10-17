// Impact check in the real game: rides a scripted grab off a kicker and logs, frame by frame after the
// touchdown, the physics time scale (hit-stop freeze → slow → 1), the rider's travel per frame, and the
// camera FoV punch / dip springs. Prints a compact table. Real GPU.
// Usage: node web/scripts/juice-impactcheck.mjs <baseUrl> [kicker]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5198/', kick = '2'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}?ride&kicker=${kick}&equip=ski`, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.game.mode === 1 && window.__juice, null, { timeout: 400000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(async (ki) => {
  const s = window.__sendit, pl = s.player, J = window.__juice, k = s.features.kickers[ki], cam = window.__cam;
  const { on } = await import('/src/state.js');
  pl.place({ x: k.o.x - k.f.x * 25, z: k.o.y - k.f.y * 25 }, Math.atan2(-k.f.x, -k.f.y));
  pl.velocity.copy(pl.forward()).multiplyScalar(14);
  let done = false;
  pl.script = (c, p) => {
    if (p.state === 1 && !done) {
      const dx = p.position.x - k.o.x, dz = p.position.z - k.o.y, a = dx * k.f.x + dz * k.f.y;
      const aNext = a + (p.velocity.x * k.f.x + p.velocity.z * k.f.y) * (1 / 60) * 1.5;
      c.jump = a > -10 && aNext < k.L;
    } else if (p.state === 2) { done = true; if (p.airTime > 0.25 && p.dyn.timeToLand() > 0.35) c.tuck = 1; }
  };
  const landed = await new Promise((res) => { const off = on('landed', (e) => { off(); res(e); }); setTimeout(() => res(null), 20000); });
  pl.script = null;
  const rows = [];
  let last = pl.position.clone(), t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const p = pl.position;
      rows.push([Math.round(performance.now() - t0), +J.warp.k.toFixed(2), +p.distanceTo(last).toFixed(3), +(cam.kicks?.fov[0] ?? 0).toFixed(2), +(cam.kicks?.dip[0] ?? 0).toFixed(3)]);
      last = p.clone();
      if (rows.length < 40) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return { landed: landed && { trick: landed.trick, air: +landed.air.toFixed(2), clean: landed.clean, perfect: landed.perfect, impact: +landed.impact.toFixed(1) }, rows };
}, Number(kick));
console.log('landing', JSON.stringify(out.landed));
console.log('ms   warp.k  moved(m)  fovKick  dip');
for (const r of out.rows) console.log(r.map((x) => String(x).padEnd(7)).join(' '));
await browser.close();
