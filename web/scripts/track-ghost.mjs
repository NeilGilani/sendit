// Ghost snow marks / spray regression (docs/graphics.md § Tracks). Drives the real game through the cases where
// the rider counts as "on something" but isn't on the terrain's snow, or is in the air, and checks every track
// stamp and every spray emission against what really touches the snow at that moment:
//   • a riding stamp needs the player GROUNDED with the stamp within 5 cm (+ powder sink) of the heightfield snow
//     (terrain.baseHeight: the terrain mesh, the only mesh that shows tracks), not on a raised mesh (kicker, roof,
//     deck, Voltage Park feature: getHeight above baseHeight), not under the fjord;
//   • a crash stamp needs a ragdoll sample within 5 cm of the snow within 0.5 m of it;
//   • a groove never bridges a gap: a key not stamped on the previous frame starts fresh (no capsule from the
//     take-off to the touchdown);
//   • spray contacts (spray.emit) and landing / crash / stop-fan bursts sit on the heightfield snow.
// Cases: Valcrest kicker air + backflip, micro-hops, Ravenspire cliff roll-off + roofs + a cliff crash, Voltage
// Park rail grind + a rail bail + raised features (jumps, pipe, ramps), Kitsune roofs, Fjordline roofs + quay /
// pier decks + a splash into the fjord, and (with --lifts) a chairlift ride + dismount at Diamond Peak.
//
//   node web/scripts/track-ghost.mjs [baseUrl] [--check] [--lifts] [--equip ski|snowboard] [--only case,…]
//
// macOS: ANGLE / Metal. Exit 1 with --check if any stamp / spray is a ghost or a case didn't exercise its surface.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5197/').replace(/\/?$/, '/');
const CHECK = args.includes('--check'), LIFTS = args.includes('--lifts');
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const EQUIPS = (opt('--equip', 'ski,snowboard')).split(',');
const ONLY = opt('--only', null)?.split(',');

// Page-side case scripts: `run(s, pl, api)` sets things up and returns nothing; api.done() ends the case,
// api.need(name) marks what the case must have exercised (a counter that must end up > 0).
const VAL = 'const k = s.features.kickers[2], ox = k.o.x, oz = k.o.y, fx = k.f.x, fz = k.f.y, L = k.L;';
const JUMP = (air, v = 13) => `
  ${VAL}
  pl.place({ x: ox - fx * 25, z: oz - fz * 25 }, Math.atan2(-fx, -fz));
  pl.velocity.copy(pl.forward()).multiplyScalar(${v});
  let wasAir = false, landedF = -1;
  pl.script = (c, p) => {
    api.tick();
    if (p.state === 1 && !wasAir) {
      const dx = p.position.x - ox, dz = p.position.z - oz, a = dx * fx + dz * fz;
      const aNext = a + (p.velocity.x * fx + p.velocity.z * fz) * (1 / 60) * 1.5;
      if (a < L - 1.5) { const sp = Math.hypot(p.velocity.x, p.velocity.z); if (sp > 1) { p.velocity.x *= ${v} / sp; p.velocity.z *= ${v} / sp; } }
      c.jump = a > -10 && aNext < L;
    } else if (p.state === 2) { wasAir = true; ${air} }
    else if (wasAir && landedF < 0) landedF = api.f;
    if (landedF > 0 && api.f > landedF + 60) api.done();
    if (p.state === 3 && api.f > 60 * 6) api.done();
  };`;

// Riding on raised surfaces: points where the snow under the rider is a separate mesh (roof, deck, kicker,
// Voltage feature), each ridden for ~0.7 s from a standstill-ish start.
const RAISED = (filter = 'true', n = 6, R = 400) => `
  const T = s.terrain, C = s.course, nv = new s.camera.position.constructor();
  const sp = T.getSpawn().position, pts = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Candidates: around each building / deck the map has (roofs, quay, pier), else around the spawn.
  const objs = [...(C.structures || []), ...(C.decks || [])].map((o) => o.x0 !== undefined ? { x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, R: Math.max(o.x1 - o.x0, o.z1 - o.z0) / 2 } : { x: o.x, z: o.z, R: o.R || 20 });
  for (let i = 0; i < 60000 && pts.length < ${n}; i++) {
    const o = objs.length ? objs[i % objs.length] : null;
    const x = o ? o.x + (rnd() - 0.5) * 2 * o.R : sp.x + (rnd() - 0.5) * 2 * ${R}, z = o ? o.z + (rnd() - 0.5) * 2 * o.R : sp.z + (rnd() - 0.5) * 2 * ${R};
    if (!T.isInside(x, z, 20)) continue;
    const up = T.getHeight(x, z) - T.baseHeight(x, z);
    if (up < 0.3) continue;
    T.getNormal(x, z, 0.6, nv);
    if (nv.y < 0.82 || !(${filter})) continue;
    if (pts.some((q) => Math.hypot(q.x - x, q.z - z) < 12)) continue;
    pts.push({ x, z, yaw: Math.hypot(nv.x, nv.z) > 0.05 ? Math.atan2(-nv.x, -nv.z) : rnd() * 6.28 });
  }
  api.info.points = pts.length;
  let k = -1, f0 = 0;
  const next = () => { k++; if (k >= pts.length) return api.done(); const q = pts[k]; pl.place({ x: q.x, z: q.z }, q.yaw); pl.velocity.copy(pl.forward()).multiplyScalar(4); f0 = api.f; };
  next();
  pl.script = (c, p) => {
    api.tick();
    if (p.state === 1 && T.getHeight(p.position.x, p.position.z) - T.baseHeight(p.position.x, p.position.z) > 0.05) api.count('onRaised');
    if (api.f - f0 > 42 || p.state === 3) next();
  };`;

const CASES = {
  'valcrest-air': { q: 'map=valcrest-gully&kicker=2', need: ['air', 'stampsAfterLanding'], setup: JUMP('') },
  'valcrest-backflip': { q: 'map=valcrest-gully&kicker=2', need: ['air'], setup: JUMP('c.airUp = -1;', 14) },
  'valcrest-overflip-crash': { q: 'map=valcrest-gully&kicker=2', need: ['air', 'crash', 'crashStamps'], setup: JUMP('c.brake = 1;') },
  'micro-hops': {
    q: 'map=valcrest-gully', need: ['air', 'stampsAfterLanding'],
    setup: `
    const sp = s.terrain.getSpawn();
    pl.place(sp.position, sp.heading);
    pl.velocity.copy(pl.forward()).multiplyScalar(8);
    pl.script = (c, p) => { api.tick(); c.jump = api.f % 36 > 30; c.steer = Math.sin(api.f / 40) * 0.4; if (api.f > 60 * 6) api.done(); };`,
  },
  'ravenspire-cliff': {
    q: 'map=ravenspire', need: ['air', 'crash', 'crashStamps'],
    setup: `
    const ox = -1260 + 960, oz = 40, fx = 1, fz = 0;
    pl.place({ x: ox - fx * 30, z: oz - fz * 30 }, Math.atan2(-fx, -fz));
    pl.velocity.copy(pl.forward()).multiplyScalar(18);
    pl.script = (c, p) => { api.tick(); if (p.state === 2) c.brake = 1; if (api.f > 60 * 9) api.done(); };`,
  },
  'ravenspire-roofs': { q: 'map=ravenspire', need: ['onRaised'], setup: RAISED('C.roofAt?.(x, z)', 5, 600) },
  'voltage-rail': {
    q: 'map=voltage-park', need: ['grind'],
    setup: `
    const rails = (s.course.rails || []).filter((r) => r.pts.length >= 2);
    let k = -1, f0 = 0;
    const next = () => {
      k++; if (k >= Math.min(4, rails.length)) return api.done();
      const rl = rails[k], a = rl.pts[0], b = rl.pts[rl.pts.length - 1];
      const ux = b[0] - a[0], uz = b[2] - a[2], ul = Math.hypot(ux, uz);
      pl.place({ x: a[0] + ux / ul * 0.5, z: a[2] + uz / ul * 0.5 }, Math.atan2(-ux / ul, -uz / ul));
      pl.state = 2; pl.position.y = a[1] + 0.6; pl.velocity.set(ux / ul * 8, -1.5, uz / ul * 8); pl.snapRender();
      f0 = api.f;
    };
    next();
    pl.script = (c, p) => { api.tick(); if (api.f - f0 > 120) next(); };`,
  },
  'voltage-rail-bail': {
    q: 'map=voltage-park', need: ['crash'],   // (the body may stay on the rail's snow mound: a raised mesh, no marks)
    setup: `
    const rl = (s.course.rails || []).find((r) => r.kind === 'rail' && r.pts.length >= 2) || s.course.rails[0];
    const a = rl.pts[0], b = rl.pts[rl.pts.length - 1];
    const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, my = (a[1] + b[1]) / 2;
    const ux = b[0] - a[0], uz = b[2] - a[2], ul = Math.hypot(ux, uz);
    pl.place({ x: mx - ux / ul * 2, z: mz - uz / ul * 2 }, Math.atan2(-ux / ul, -uz / ul));
    pl.state = 2; pl.position.y = my + 2.6; pl.velocity.set(ux / ul * 5, -11.5, uz / ul * 5); pl.snapRender();
    pl.script = (c, p) => { api.tick(); if (api.f > 60 * 4) api.done(); };`,
  },
  'voltage-features': { q: 'map=voltage-park', need: ['onRaised'], setup: RAISED('true', 8, 500) },
  'kitsune-roofs': { q: 'map=kitsune-peak', need: ['onRaised'], setup: RAISED('C.roofAt?.(x, z)', 5, 900) },
  'fjordline-roofs-decks': { q: 'map=fjordline', need: ['onRaised'], setup: RAISED('true', 8, 1400) },
  'fjordline-splash': {
    q: 'map=fjordline', need: ['splash'],
    setup: `
    // Ride off the beach into the fjord: the nearest water from the spawn, straight at it.
    const T = s.terrain, sea = s.course.sea, sp = T.getSpawn().position;
    let best = null;
    for (let r = 50; r < 3000 && !best; r += 25) for (let a = 0; a < 6.28 && !best; a += 0.05) {
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      if (T.isInside(x, z, 30) && T.getHeight(x, z) < sea - 1.5) best = { x, z };
    }
    if (!best) { api.info.noWater = true; api.done(); } else {
      // back up the slope from the water until dry land
      const dx = best.x - sp.x, dz = best.z - sp.z, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
      let d = 0; while (d < 200 && T.getHeight(best.x - ux * d, best.z - uz * d) < sea + 0.5) d += 2;
      pl.place({ x: best.x - ux * (d + 8), z: best.z - uz * (d + 8) }, Math.atan2(-ux, -uz));
      pl.velocity.copy(pl.forward()).multiplyScalar(9);
      pl.script = (c, p) => { api.tick(); if (p._fjordSplash > 0) api.count('splash'); const sp2 = Math.hypot(p.velocity.x, p.velocity.z); if (p.state === 1 && !p._fjordSplash) { p.velocity.x = ux * 9; p.velocity.z = uz * 9; p.heading = Math.atan2(-ux, -uz); } if (api.f > 60 * 8) { api.info.end = [p.state, +p.position.x.toFixed(0), +p.position.z.toFixed(0), +(T.getHeight(p.position.x, p.position.z) - sea).toFixed(1), +best.x.toFixed(0), +best.z.toFixed(0), d]; api.done(); } };
    }`,
  },
  lifts: {
    q: 'resort=diamond_peak&run=0', lifts: true, need: ['lift', 'stampsAfterLift'],
    setup: `
    const L = pl.lifts?.lifts?.find((l) => l.rideable);
    if (!L) { api.info.noLift = true; api.done(); } else {
      pl.place(L.bottom.clone(), 0);
      pl.board(L);
      let rode = false;
      pl.script = (c, p) => {
        api.tick();
        if (p.state === 4) { api.count('lift'); if (!rode) { rode = true; p._liftD = Math.max(p._liftD, p.lifts.rideLength(L) - 25); } }
        if (rode && p.state === 1) { api.info.afterLift = (api.info.afterLift || 0) + 1; if (api.info.afterLift > 90) api.done(); }
        if (api.f > 60 * 25) api.done();
      };
    }`,
  },
};

const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpu });
const results = [];
let errors = 0;
const names = Object.keys(CASES).filter((n) => (!ONLY || ONLY.includes(n)) && (LIFTS || !CASES[n].lifts));
for (const equip of EQUIPS) for (const name of names) {
  const sc = CASES[name];
  if (name === 'lifts' && equip !== EQUIPS[0]) continue;
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
  await page.addInitScript(() => {
    try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = 'tp'; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ }
    const raf = window.requestAnimationFrame.bind(window);
    let vt = 0, lastTs = -1;
    window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
  });
  const t0 = Date.now();
  let r;
  try {
    await page.goto(`${base}?${sc.q}&equip=${equip}&quality=0`);
    await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
    await page.click('.lb-ride');
    await page.waitForFunction(() => window.__sendit.game.mode >= 1 && window.__sendit.player.state !== 4 && window.__cam?.intro >= 1, null, { timeout: 180000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const s = window.__sendit, pl = s.player, T = s.terrain, fx = s.fx, V = s.camera.position.constructor;
      const R = window.__res = { stamps: 0, bad: [], spray: 0, sprayBad: [], counts: {}, info: {} };
      const api = window.__api = {
        f: 0, info: R.info, done: () => { R.done = true; },
        count: (k) => { R.counts[k] = (R.counts[k] || 0) + 1; },
        tick: () => {
          api.f++;
          if (pl.state === 2) api.count('air');
          if (pl.state === 3) api.count('crash');
          if (pl.state === 5) api.count('grind');
        },
      };
      const sea = s.course?.sea;
      const raised = (x, z) => T.getHeight(x, z) - T.baseHeight(x, z) > 0.02;
      const wet = (x, z) => sea !== undefined && T.getHeight(x, z) < sea - 0.05;
      const bad = (list, what) => { if (list.length < 8) list.push(what); else list.n = (list.n || 8) + 1; };
      // Stamps
      const lastF = {};
      let frame = 0;   // rendered frames (fx.update calls): a groove is continuous from one to the next
      const upd0 = fx.update.bind(fx);
      fx.update = (...a) => { frame++; return upd0(...a); };
      const sp = new V();
      let wasAir = false, landed = false, wasLift = false;
      const stamp0 = fx.track.stamp.bind(fx.track);
      fx.track.stamp = (key, p, heading, w, k) => {
        if (key !== 'warm') {
          R.stamps++;
          const f = frame;
          if (landed && pl.state === 1) api.count('stampsAfterLanding');
          if (wasLift && pl.state === 1) api.count('stampsAfterLift');
          if (pl.state === 3) {
            api.count('crashStamps');
            const W = s.ragdoll?.H?.world;
            let gap = Infinity;
            if (W) for (const b of W.bodies) for (const smp of b.samples) {
              b.point(smp.p, sp);
              if (Math.hypot(sp.x - p.x, sp.z - p.z) > 0.5) continue;
              gap = Math.min(gap, sp.y - smp.r - T.getHeight(sp.x, sp.z));
            }
            if (gap > 0.05) bad(R.bad, `crash ${key} ${gap === Infinity ? 'nothing near' : (gap * 100).toFixed(0) + ' cm above'} f${f}`);
          } else if (pl.state !== 1) bad(R.bad, `${key} while state ${pl.state} f${f}`);
          else {
            // The player on the snow, and the stamp (a ski / the board on the slope's plane) on it too.
            const gp = Math.abs(pl.position.y - T.getHeight(pl.position.x, pl.position.z)), gs = Math.abs(p.y - T.getHeight(p.x, p.z));
            const gap = Math.max(gp, gs);
            if (gap > 0.05 + (pl.sink || 0)) bad(R.bad, `${key} ${(gap * 100).toFixed(0)} cm off the snow (player ${(gp * 100).toFixed(0)}) f${f}`);
          }
          if (raised(p.x, p.z)) bad(R.bad, `${key} on a raised mesh f${f}`);
          if (wet(p.x, p.z)) bad(R.bad, `${key} under water f${f}`);
          const last = fx.track.lastBy?.[key];
          if (last && lastF[key] !== undefined && lastF[key] < f - 1 && Math.hypot(last.x - p.x, last.y - p.z) >= 0.12) bad(R.bad, `${key} bridges ${Math.hypot(last.x - p.x, last.y - p.z).toFixed(2)} m from f${lastF[key]} f${f}`);
          lastF[key] = f;
        }
        return stamp0(key, p, heading, w, k);
      };
      // Spray
      const sprayCheck = (p, tol, what) => {
        R.spray++;
        const gap = Math.abs(p.y - T.getHeight(p.x, p.z));
        if (gap > tol || raised(p.x, p.z) || wet(p.x, p.z)) bad(R.sprayBad, `${what} ${(gap * 100).toFixed(0)} cm${raised(p.x, p.z) ? ' raised' : ''}${wet(p.x, p.z) ? ' wet' : ''} st${pl.state} f${api.f}`);
      };
      const S = fx.spray;
      const emit0 = S.emit.bind(S);
      S.emit = (cs, dt, ctx) => { for (const c of cs) if (c.speed >= 0.8) sprayCheck(c.position, 0.12 + (c.depth || 0), 'emit ' + (c.id ?? '')); return emit0(cs, dt, ctx); };
      for (const m of ['landing', 'crash', 'stopFan']) { const f0 = S[m].bind(S); S[m] = (pos, ...a) => { sprayCheck(pos, 0.3, m); return f0(pos, ...a); }; }
      // State edges for the "resumes after landing / after the lift" counters
      const hook = () => {
        if (pl.state === 2) wasAir = true;
        if (wasAir && pl.state === 1) landed = true;
        if (pl.state === 4) wasLift = true;
        if (pl._fjordSplash > 0) api.count("splash");
      };
      const step0 = pl.step.bind(pl);
      pl.step = (dt) => { step0(dt); hook(); };
    });
    await page.evaluate(`(() => { const s = window.__sendit, pl = s.player, api = window.__api; ${sc.setup}; })()`);
    while (Date.now() - t0 < 240000) {
      if (await page.evaluate(() => window.__res.done)) break;
      await page.waitForTimeout(250);
    }
    r = await page.evaluate(() => window.__res);
  } catch (e) {
    r = { error: String(e).slice(0, 200), stamps: 0, bad: [], spray: 0, sprayBad: [], counts: {}, info: {} };
  }
  await page.close();
  const missing = (sc.need || []).filter((k) => !(r.counts[k] > 0) && !(k === 'onRaised' && r.info.points === 0));
  const skipped = r.info.noLift || r.info.noWater;
  const ok = !r.error && !r.bad.length && !r.sprayBad.length && (skipped || !missing.length) && r.done;
  results.push({ equip, name, ok, r, missing });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${equip.padEnd(9)} ${name.padEnd(24)} stamps ${String(r.stamps).padStart(4)} (ghost ${r.bad.length + (r.bad.n ? r.bad.n - 8 : 0)})  spray ${String(r.spray).padStart(4)} (ghost ${r.sprayBad.length})  ${JSON.stringify(r.counts)} ${JSON.stringify(r.info)}${missing.length ? ' missing ' + missing.join(',') : ''}${r.error ? ' ERROR ' + r.error : ''}${r.done ? '' : ' (timed out)'}`);
  for (const b of r.bad) console.log('      stamp:', b);
  for (const b of r.sprayBad) console.log('      spray:', b);
}
await browser.close();
const fails = results.filter((x) => !x.ok);
console.log(`\ntrack-ghost: ${results.length - fails.length}/${results.length} cases clean${errors ? `, ${errors} page errors` : ''}`);
if (CHECK) process.exit(fails.length || errors ? 1 : 0);
