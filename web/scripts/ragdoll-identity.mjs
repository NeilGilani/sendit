// Requirement 1 of the crash ragdoll, in the real game: riding, jumps, airs, landings and the rider's pose are
// the same with and without it. One page: the same scripted runs (Valcrest kicker 2: a straight air, a 360,
// a backflip) are played twice from the same snapshot of the player and rider state — once with the ragdoll
// installed (it tracks the rig every frame), once after ragdoll.uninstall() — stepped synchronously at 60 Hz in
// main.js's order — and every frame's player state, rider root and every bone / gear transform are compared.
//
//   node web/scripts/ragdoll-identity.mjs [baseUrl] [ski|snowboard]     (exit 1 if anything differs by > 1e-6)
import { chromium } from '@playwright/test';

const [base = 'http://localhost:5196/', equip = 'ski'] = process.argv.slice(2);
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpu });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => {
  try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = 'tp'; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ }
  const raf = window.requestAnimationFrame.bind(window);
  let vt = 0, lastTs = -1;
  window.__vt = { hook: null };
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
});
await page.goto(`${base.replace(/\/?$/, '/')}?map=valcrest-gully&kicker=2&equip=${equip}&quality=0`);
await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
await page.click('.lb-ride');
await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 4 && window.__cam?.intro >= 1, null, { timeout: 120000 });
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const s = window.__sendit, pl = s.player, rider = s.rider, k = s.features.kickers[2];
  // Hit-stop / slow-mo would leave a different fraction of a physics step in main.js's accumulator before each
  // run (it carries over): off for the test, so both runs see the same frame timing.
  if (window.__juice) window.__juice.timeScale = () => 1;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const nodes = [];
  rider.root.traverse((o) => nodes.push(o));
  // Snapshot of everything stateful in the rider and the physics (restored before each run).
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const RIDER_KEYS = ['spring', 'snapT', 'snapSign', '_landSeen', 'neon', '_lastEdgeSign', '_stillT', '_plantPrev', '_dtLast'];
  const snapshot = () => ({
    p: deep(rider.p), r: Object.fromEntries(RIDER_KEYS.map((k2) => [k2, deep(rider[k2] ?? null)])), com: rider._comLocal?.toArray() ?? null,
    pl: Object.fromEntries(Object.entries(pl).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')),
    dyn: Object.fromEntries(Object.entries(pl.dyn).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')),
  });
  const restore = (S) => {
    for (const key of Object.keys(rider.p)) if (!(key in S.p)) delete rider.p[key];
    Object.assign(rider.p, deep(S.p));
    for (const [key, v] of Object.entries(S.r)) rider[key] = v === null ? undefined : deep(v);
    if (S.com) (rider._comLocal ||= new s.camera.position.constructor()).fromArray(S.com); else rider._comLocal = undefined;
    Object.assign(pl, S.pl); Object.assign(pl.dyn, S.dyn);
  };
  const place = () => { pl.place({ x: k.o.x - k.f.x * 25, z: k.o.y - k.f.y * 25 }, Math.atan2(-k.f.x, -k.f.y)); pl.velocity.copy(pl.forward()).multiplyScalar(13); };
  const record = (log) => {
    const a = [pl.position.x, pl.position.y, pl.position.z, pl.velocity.x, pl.velocity.y, pl.velocity.z, pl.orient.x, pl.orient.y, pl.orient.z, pl.orient.w, pl.renderPos.x, pl.renderPos.y, pl.renderPos.z, pl.state];
    for (const n of nodes) a.push(n.position.x, n.position.y, n.position.z, n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w, n.scale.x, n.visible ? 1 : 0);
    log.push(a);
  };
  // A take-off: hold 13 m/s on the run-in, pop at the lip, `air` steers the flight; ends 1.2 s after touchdown.
  // [in the air, on the run-in just before the lip (a < L): spins / flips are loaded there]
  const runs = {
    straight: [() => {}, () => {}],
    spin360: [(c, p) => { if (p.airTime < 0.15) c.steer = 1; }, (c, a, aNext, L) => { c.steer = a > L - 3 && aNext < L ? 1 : 0; }],
    backflip: [(c, p) => { if (p.airTime < 0.15 || Math.abs(p.flip) + Math.abs(p.flipRate) * 0.25 < Math.PI * 2 - 0.6) c.brake = 1; }, (c, a, aNext, L) => { c.brake = a > -6 && aNext < L ? 1 : 0; }],
  };
  const play = async ([air, pre]) => {
    const log = [];
    let wasAir = false, land = -1, f = 0, airs = 0, crashed = false, crashF = -1, flip = 0, spin = 0;
    const ox = k.o.x, oz = k.o.y, fx = k.f.x, fz = k.f.y, L = k.L;
    pl.script = (c, p) => {
      if (p.state === 1 && !wasAir) {
        const a = (p.position.x - ox) * fx + (p.position.z - oz) * fz;
        const aNext = a + (p.velocity.x * fx + p.velocity.z * fz) * (1 / 60) * 1.5;
        if (a < L - 1.5) { const sp = Math.hypot(p.velocity.x, p.velocity.z); if (sp > 1) { p.velocity.x *= 13 / sp; p.velocity.z *= 13 / sp; } }
        c.jump = a > -10 && aNext < L;
        pre(c, a, aNext, L);
      } else if (p.state === 2) { if (!wasAir) airs++; wasAir = true; air(c, p); }
      if (p.state === 3 && !crashed) { crashed = true; crashF = f; }
      flip = Math.max(flip, Math.abs(p.flip || 0)); spin = Math.max(spin, Math.abs(p._spinTotal || 0));
    };
    // The frames are stepped here, synchronously, in main.js's order (physics, interpolation, rider, tracker):
    // the page's own loop can't interleave, so both runs see exactly the same frame times.
    for (; f < 60 * 12; f++) {
      pl.step(1 / 60); pl.interpolate(1);
      rider.update(1 / 60, s.camera);
      if (!s.ragdoll.uninstalled) s.ragdoll.track();
      record(log);
      if (wasAir && pl.state === 1 && land < 0) land = f;
      if (land >= 0 && f - land > 72) break;
    }
    pl.script = null;
    return { log: crashF >= 0 ? log.slice(0, crashF) : log, airs, crashed, land, flip: Math.round(flip * 57.3), spin: Math.round(spin * 57.3) };
  };
  const out = {};
  for (const [name, air] of Object.entries(runs)) {
    place(); for (let i = 0; i < 30; i++) await frame();     // settle on the run-in
    place();
    const S = snapshot();
    restore(S); const A = await play(air);                   // ragdoll installed (tracking every frame)
    s.ragdoll.uninstall();
    place(); for (let i = 0; i < 30; i++) await frame();
    place(); restore(S); const B = await play(air);          // no ragdoll
    s.ragdoll.install();                                      // back for the next run
    let diff = 0, at = -1;
    const n = Math.min(A.log.length, B.log.length);
    for (let i = 0; i < n; i++) for (let j = 0; j < A.log[i].length; j++) { const d = Math.abs(A.log[i][j] - B.log[i][j]); if (d > diff) { diff = d; at = i; } }
    let first = null;
    for (let i = 0; i < n && !first; i++) for (let j = 0; j < A.log[i].length; j++) if (Math.abs(A.log[i][j] - B.log[i][j]) > 1e-9) { first = { frame: i, idx: j, what: j < 14 ? 'player ' + j : nodes[Math.floor((j - 14) / 9)].name + ' ' + ((j - 14) % 9), a: A.log[i][j], b: B.log[i][j] }; break; }
    out[name] = { first, trick: `flip ${A.flip}° spin ${A.spin}°`, frames: [A.log.length, B.log.length], airs: [A.airs, B.airs], crashed: [A.crashed, B.crashed], landedAt: [A.land, B.land], values: A.log[0]?.length, maxDiff: diff, at };
  }
  return out;
});
let bad = 0;
for (const [name, r] of Object.entries(result)) {
  // (a run that ends in a crash is compared up to the crash: from there on the ragdoll is meant to differ)
  const ok = r.maxDiff <= 1e-6 && r.frames[0] === r.frames[1] && r.airs[0] >= 1;
  if (!ok) bad++;
  if (!ok) console.log('  first difference', JSON.stringify(r.first));
  console.log(`${equip} ${name.padEnd(9)} ${ok ? (r.crashed[0] ? 'identical up to its crash' : 'identical') : 'DIFFERENT'}  frames ${r.frames.join('/')}  values/frame ${r.values}  ${r.trick}  airs ${r.airs.join('/')}  landed @${r.landedAt.join('/')}  crashed ${r.crashed.join('/')}  max diff ${r.maxDiff.toExponential(2)} (frame ${r.at})`);
}
await browser.close();
process.exit(bad ? 1 : 0);
