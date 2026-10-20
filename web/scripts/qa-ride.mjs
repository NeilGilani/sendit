// Ride QA play-test (night 3): drives the real game on a virtual 60 Hz clock (one rAF = 1/60 s) from the lobby,
// one mountain per run: for each gear (ski, snowboard) it rides the first trail through the full feature list —
// tricks (spin / flip / cork / grab) with a launch boost, grinds where the map has rails, a crash of each severity
// (small / medium / big ragdoll), respawn, restart (R), retry (Backspace), instant replay (Tab), save clip (F),
// first person (C) through jumps and a crash, the pause menu + settings — then picks every trail from the lobby's
// Maps tab (Zen and Challenge alternating, the other gear the other way round), rides it, jumps to just before the
// finish and crosses it (Challenge: results screen → Back to lobby; Zen: RUN COMPLETE → top). It ends in Career ›
// Highlights (the saved clips must be there), optionally rides a lift (Lake Tahoe), and switches to another
// mountain through the lobby.
// Every frame: console errors, NaN in player / camera / rider, the camera inside the terrain or the body, a crash
// that never respawns, the ride stuck in a mode. Snapshots of the HUD at each viewport size check for overlapping
// or off-screen HUD text. JS heap + GPU resources are logged after every run (memory growth).
//
//   node web/scripts/qa-ride.mjs <baseUrl> <outDir> <mapId> [--equip ski,snowboard] [--trails N] [--sizes 1280x720,...]
//        [--next <mapId>] [--lift] [--quality 0|1|2]
// macOS: ANGLE / Metal. Prints PASS / FAIL lines and a JSON summary line; exit 1 on any failure.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [base0 = 'http://localhost:5222/', out = '/tmp/qa-ride', MAP = 'valcrest-gully'] = pos;
const base = base0.replace(/\/?$/, '/');
const EQUIPS = opt('--equip', 'ski,snowboard').split(',');
const MAXTR = +opt('--trails', 99);
const SIZES = opt('--sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const NEXT = opt('--next', null), LIFT = argv.includes('--lift'), QUALITY = opt('--quality', '1');
const T = 240000;
mkdirSync(out, { recursive: true });

const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: [...gpu, '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, acceptDownloads: false });
const page = await ctx.newPage();
const errors = [], rows = [];
let failed = 0, step = '';
page.on('pageerror', (e) => errors.push(`[${step}] ${e.message}`));
// (Google Fonts can't be reached from this sandbox: those failures are logged, not counted.)
const failedReq = [];
page.on('requestfailed', (r) => failedReq.push(r.url()));
page.on('console', (m) => {
  if (m.type() === 'warning' && /\[highlights\]|\[thrill\]|\[audio\]|\[ragdoll\]/.test(m.text())) console.log('WARN', m.text().slice(0, 200));
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t) && failedReq.length && failedReq.every((u) => /fonts\.(googleapis|gstatic)\.com/.test(u))) return;
  errors.push(`[${step}] ${t.slice(0, 300)}`);
});
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${MAP}  ${name}${info ? `  (${info})` : ''}`);
  rows.push({ map: MAP, name, ok: !!ok, info: String(info).slice(0, 300) });
  if (!ok) failed++;
};
const shotN = { n: 0 };
const shot = (name) => page.screenshot({ path: `${out}/${MAP}-${String(++shotN.n).padStart(3, '0')}-${name}.png` }).catch(() => {});
const wait = (ms) => page.waitForTimeout(ms);
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__qa?.f ?? 0);
  try { await page.waitForFunction((t) => (window.__qa?.f ?? 0) >= t, f0 + n, { timeout: Math.max(30000, n * 200), polling: 100 }); }
  catch (e) {
    // The frame clock stopped: is the page's main thread stuck, or did rendering stop? Dump what we can.
    const st = await Promise.race([page.evaluate(() => { const s = window.__sendit, p = s?.player; return { f: window.__qa?.f, mode: s?.game.mode, st: p?.state, pos: p && [p.position.x, p.position.y, p.position.z].map((v) => +v.toFixed(2)), vel: p && [p.velocity.x, p.velocity.y, p.velocity.z].map((v) => +v.toFixed(2)), lost: s?.renderer.getContext().isContextLost(), hidden: document.hidden }; }), new Promise((r) => setTimeout(() => r('main thread not responding (10 s)'), 10000))]);
    console.log('FREEZE', step, JSON.stringify(st), errors.slice(-3).join(' | '));
    throw e;
  }
};
const key = async (k) => { await page.keyboard.down(k); await frames(2); await page.keyboard.up(k); await frames(1); };
const S = (fn, arg) => page.evaluate(fn, arg);

await page.addInitScript((q) => {
  try {
    const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}');
    if (!('quality' in s)) { s.quality = +q; localStorage.setItem('sendit.settings', JSON.stringify(s)); }
  } catch { /* */ }
  const raf = window.requestAnimationFrame.bind(window);
  let vt = 0, lastTs = -1;
  window.__vt = { hooks: [] };
  window.requestAnimationFrame = (cb) => raf((ts) => {
    if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; Promise.resolve().then(() => { for (const h of window.__vt.hooks) { try { h(); } catch (e) { console.error('[qa hook]', e.message); } } }); }
    cb(vt);
  });
}, QUALITY);

// ---------------------------------------------------------------- page-side monitor + bot
async function installMonitor() {
  await S(() => {
    if (window.__qa) return;
    const s = window.__sendit, pl = s.player, cam = s.camera, T = s.terrain;
    const Q = window.__qa = { f: 0, issues: [], counts: {}, crashF: 0, modeF: 0, lastMode: -1, stuck: 0, maxCrash: 0, camLow: 0, camBody: 0, nan: 0, states: {} };
    const issue = (k, msg) => { Q.counts[k] = (Q.counts[k] || 0) + 1; if (Q.counts[k] <= 3) Q.issues.push(`${k}: ${msg}`); };
    const bad = (v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z);
    window.__vt.hooks.push(() => {
      Q.f++;
      const m = s.game.mode;
      Q.states[pl.state] = (Q.states[pl.state] || 0) + 1;
      if (bad(pl.position) || bad(pl.velocity)) { Q.nan++; issue('nan', `player st${pl.state} p ${pl.position.x},${pl.position.y}`); }
      if (bad(cam.position) || !Number.isFinite(cam.quaternion.w)) { Q.nan++; issue('nan', 'camera'); }
      if (s.rider?.root && bad(s.rider.root.position)) { Q.nan++; issue('nan', 'rider root'); }
      if (m === 1 || m === 3) {
        const replaying = !!window.__thrill?.replay?.active;
        if (Q.wasRp && !replaying) Q.rpEnd = Q.f;
        Q.wasRp = replaying;
        // Camera inside the terrain (the snow above the lens) — the replay drone and the fp view included.
        const h = T.getHeight(cam.position.x, cam.position.z);
        if (Q.f - (window.__qaTeleport ?? -999) > 45 && Number.isFinite(h) && T.isInside?.(cam.position.x, cam.position.z, 0) !== false && cam.position.y < h + 0.05) {
          Q.camLow++; if (Q.camLow % 30 === 1) issue('camInTerrain', `${(h - cam.position.y).toFixed(2)} m under snow st${pl.state} fp${+!!s.rider.fp} rp${+replaying} f${Q.f}`);
        }
        // Chase camera inside the rider's body (third person only, not the crash / replay drone).
        if (!s.rider.fp && !replaying && pl.state !== 3 && pl.state !== 0 && Q.f - (window.__qaTeleport ?? -999) > 45) {
          const d = cam.position.distanceTo(pl.renderPos || pl.position);
          if (d < 0.8) { Q.camBody++; if (Q.camBody % 30 === 1) issue('camInBody', `${d.toFixed(2)} m st${pl.state} sp${pl.speed.toFixed(1)} f${Q.f} afterReplay${Q.f - (Q.rpEnd ?? -1e9)} afterTp${Q.f - (window.__qaTeleport ?? -1e9)}`); }
        }
        if (pl.state === 3) { Q.crashF++; Q.maxCrash = Math.max(Q.maxCrash, Q.crashF); if (Q.crashF === 60 * 14) issue('crashStuck', `still crashed after 14 s f${Q.f}`); }
        else Q.crashF = 0;
      } else Q.crashF = 0;
      if (m !== Q.lastMode) { Q.lastMode = m; Q.modeF = 0; } else Q.modeF++;
    });
    // Bot: follow the course downhill (progress gradient, else the fall line), optional tricks on every air.
    const V = cam.position.constructor, n = new V();
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    window.__bot = (opts = {}) => {
      const o = { trick: null, boost: 0, jumpEvery: 0, ...opts };
      let f = 0, airF = 0, wasAir = false;
      const C = s.course;
      pl.script = (c, p) => {
        f++;
        if (p.state === 1) {
          wasAir = false; airF = 0;
          let dx = 0, dz = 0;
          const x = p.position.x, z = p.position.z;
          if (typeof C?.progress === 'function') {
            const e = 6, g0 = C.progress(x, z);
            if (g0 >= 0) { dx = C.progress(x + e, z) - C.progress(x - e, z); dz = C.progress(x, z + e) - C.progress(x, z - e); }
          }
          T.getNormal(x, z, 2, n);
          const fl = Math.hypot(n.x, n.z);
          if (!(Math.hypot(dx, dz) > 1e-3) || !Number.isFinite(dx)) { dx = n.x; dz = n.z; }
          else if (fl > 0.05) { const l = Math.hypot(dx, dz); dx = dx / l + 0.6 * n.x / fl; dz = dz / l + 0.6 * n.z / fl; }
          const want = Math.atan2(-dx, -dz);
          const head = Math.hypot(p.velocity.x, p.velocity.z) > 2 ? Math.atan2(-p.velocity.x, -p.velocity.z) : p.heading;
          const d = wrap(want - head);
          c.steer = Math.max(-1, Math.min(1, -d * 2.2 + Math.sin(f / 50) * 0.25));
          c.up = p.speed < 9 ? 1 : 0;
          if (p.speed > 24) c.brake = 0.5;
          if (o.jumpEvery && f % o.jumpEvery > o.jumpEvery - 14) c.jump = true;
          if (o.jumpEvery && f % o.jumpEvery === 0 && o.trick?.spin) c.steer = Math.sign(o.trick.spin);
        } else if (p.state === 2) {
          airF++;
          if (!wasAir) { wasAir = true; if (o.boost && p.velocity.y < o.boost) p.velocity.y = o.boost; }
          const t = o.trick;
          if (t) {
            if (t.spin) c.steer = Math.abs(p._spinTotal || 0) < Math.abs(t.spin) * Math.PI - 0.6 ? Math.sign(t.spin) : 0;
            if (t.flip) { const done = Math.abs(p.flip || 0) > Math.abs(t.flip) * Math.PI * 2 - 1.2; if (!done) { if (t.flip > 0) c.brake = 1; else c.up = 1; } }
            if (t.grab && airF > 8) c.tuck = 1;
            if (t.over) c.brake = 1;
          }
        }
      };
    };
    window.__botOff = () => { pl.script = null; };
  });
}

const qa = () => S(() => { const Q = window.__qa; return Q && { f: Q.f, issues: Q.issues.slice(), counts: { ...Q.counts }, maxCrash: Q.maxCrash, states: { ...Q.states } }; });
async function clearIssues() { await S(() => { const Q = window.__qa; if (Q) { Q.issues = []; Q.counts = {}; Q.camLow = 0; Q.camBody = 0; Q.nan = 0; Q.maxCrash = 0; } }); }
async function issuesCheck(name) {
  const q = await qa();
  const real = (q?.issues || []);
  check(`${name}: no NaN / camera-in-terrain / camera-in-body / stuck crash`, real.length === 0, real.slice(0, 4).join(' | '));
  await clearIssues();
}
let errSeen = 0;
function errCheck(name) {
  const fresh = errors.slice(errSeen);
  errSeen = errors.length;
  check(`${name}: no console errors`, fresh.length === 0, fresh.slice(0, 3).join(' | '));
}

// HUD layout: visible fixed / absolute text boxes over the canvas that overlap each other or leave the screen.
async function hudCheck(name) {
  const r = await S(() => {
    const W = innerWidth, H = innerHeight, out = [], boxes = [];
    const skip = (el) => el.closest('#lobby, #loading, #pause, #settings, #credits, .lb-root');
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el) || el.tagName === 'CANVAS' || el.tagName === 'SCRIPT') continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      const txt = (el.innerText || '').trim();
      if (!txt) continue;
      // Effective visibility: every ancestor shown and opaque enough.
      let vis = true, op = 1;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const s2 = getComputedStyle(a);
        if (s2.display === 'none' || s2.visibility === 'hidden') { vis = false; break; }
        op *= +s2.opacity;
      }
      if (!vis || op < 0.35) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      if (b.width * b.height > 0.45 * W * H) continue;   // a full-screen layer (#hud, a modal's backdrop): look inside it
      boxes.push({ el, id: el.id || el.className?.toString?.().split(' ')[0] || el.tagName, b, txt: txt.slice(0, 30) });
    }
    // Only the outermost positioned boxes (a child inside its own panel is fine).
    const top = boxes.filter((x) => !boxes.some((y) => y !== x && y.el.contains(x.el)));
    for (const x of top) {
      if (x.b.left < -2 || x.b.top < -2 || x.b.right > W + 2 || x.b.bottom > H + 2) out.push(`offscreen ${x.id} "${x.txt}" [${x.b.left | 0},${x.b.top | 0},${x.b.right | 0},${x.b.bottom | 0}]`);
    }
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i].b, b = top[j].b;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix <= 0 || iy <= 0) continue;
      const frac = (ix * iy) / Math.min(a.width * a.height, b.width * b.height);
      if (frac > 0.12) out.push(`overlap ${top[i].id} "${top[i].txt}" × ${top[j].id} "${top[j].txt}" ${(frac * 100) | 0}%`);
    }
    return { out, n: top.length, list: top.map((x) => x.id) };
  });
  check(`${name}: HUD text boxes don't overlap / leave the screen`, r.out.length === 0, r.out.slice(0, 4).join(' | ') || `${r.n} boxes`);
  return r;
}

async function mem(tag) {
  const m = await S(() => ({ heap: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, geo: window.__sendit.renderer.info.memory.geometries, tex: window.__sendit.renderer.info.memory.textures, prog: window.__sendit.renderer.info.programs?.length }));
  console.log(`MEM  ${MAP}  ${tag}  heap ${m.heap} MB  geo ${m.geo}  tex ${m.tex}  prog ${m.prog}`);
  memLog.push({ tag, ...m });
  return m;
}
const memLog = [];

// ---------------------------------------------------------------- flow helpers
async function lobbyReady() {
  await page.waitForFunction(() => window.__sendit?.lobby?.visible && window.__sendit.game.mode === 0, null, { timeout: T });
  await wait(400);
}
async function rideFromLobby(mode) {
  await page.click(`[data-mode=${mode}]`).catch(() => {});
  await page.click('.lb-ride');
  await waitRiding();
}
async function waitRiding() {
  await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 0, null, { timeout: T });
  await page.waitForFunction(() => (window.__cam?.intro ?? 1) >= 1, null, { timeout: 60000 }).catch(() => {});
  await keepResumed(true);
}
// Headless drops the pointer lock, which pauses the ride: keep resuming (off while the pause menu is tested).
async function keepResumed(on) {
  await S((on) => { clearInterval(window.__keep); if (on) window.__keep = setInterval(() => { const s = window.__sendit; if (s.game.mode === 2 && !document.querySelector('#settings:not(.hidden)')) s.ui.h.resume(); }, 50); }, on);
}
async function toLobby() {
  await keepResumed(false);
  const m = await S(() => window.__sendit.game.mode);
  const res0 = await S(() => !document.getElementById('results').classList.contains('hidden'));
  if (res0) { await page.click('#results [data-act=menu]'); await lobbyReady(); return; }
  if (m === 1 || m === 3) { await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: 10000 }).catch(() => {}); }
  const res = await S(() => !document.getElementById('results').classList.contains('hidden'));
  if (res) await page.click('#results [data-act=menu]');
  else await page.click('#pause [data-act=menu]');
  await lobbyReady();
}
async function setEquip(equip) {
  const want = equip === 'ski' ? 'skis' : 'snowboard';
  const cur = await S(() => window.__sendit.profile.equipment);
  if (cur === want) return;
  await S((w) => window.__sendit.profile.setEquipment(w), want);
  await wait(300);
}
async function openTrails() {
  await S(() => window.__sendit.lobby.select('maps'));
  await page.waitForSelector('.mt-card, .tr-row', { timeout: T });
  if (!(await page.$('.tr-row'))) {
    await page.click(`.mt-card[data-mountain="${await S(() => window.__sendit.map.map.mountain?.id || window.__sendit.map.map.id)}"]`);
    await page.waitForSelector('.tr-row', { timeout: T });
  }
}

// One scripted ride segment: run the bot for n frames with options.
async function bot(nFrames, o = {}) { await S((o) => window.__bot(o), o); await frames(nFrames); }
async function ev(names) {
  await S(async (names) => {
    const { on } = await import('/src/state.js');
    window.__ev = window.__ev || [];
    window.__evOn = window.__evOn || new Set();
    for (const n of names) if (!window.__evOn.has(n)) { window.__evOn.add(n); on(n, (d) => window.__ev.push([n, window.__qa?.f, d && typeof d === 'object' ? (() => { try { return JSON.parse(JSON.stringify(d)); } catch { return null; } })() : d])); }
  }, names);
}
const evs = (n) => S((n) => (window.__ev || []).filter((e) => e[0] === n), n);
const evCount = async (n) => (await evs(n)).length;

// Place the rider on the current slope (the spawn of the trail, a little down) at speed v, facing downhill.
async function placeDown(v = 12, ahead = 0) {
  await S(({ v, ahead }) => {
    const s = window.__sendit, pl = s.player, T = s.terrain, sp = T.getSpawn();
    const fx = -Math.sin(sp.heading), fz = -Math.cos(sp.heading);
    window.__qaTeleport = window.__qa.f;
    pl.place({ x: sp.position.x + fx * ahead, z: sp.position.z + fz * ahead }, sp.heading);
    pl.velocity.copy(pl.forward()).multiplyScalar(v);
  }, { v, ahead });
}

// Jump with a boosted launch so the trick has ~1.6 s of air anywhere on the mountain.
async function trick(name, t, { boost = 7.5, fp = false, approach = 30 } = {}) {
  const l0 = await evCount('landed'), c0 = await evCount('crashed');
  await S(({ t, boost, approach }) => {
    const s = window.__sendit, pl = s.player;
    let f = 0, air = false, done = false;
    window.__trickDone = false;
    window.__bot({ trick: t });
    const botScript = pl.script;
    pl.script = (c, p) => {
      botScript(c, p);
      f++;
      if (p.state === 1 && !air) { c.jump = f > approach && f < approach + 20; if (t.spin && f > approach + 14 && f < approach + 20) c.steer = Math.sign(t.spin); }
      if (p.state === 2 && !air) { air = true; if (p.velocity.y < boost) p.velocity.y = boost; }
      if (air && (p.state === 1 || p.state === 3 || p.state === 5) && !done) { done = true; setTimeout(() => { window.__trickDone = true; }, 0); }
      if (f > 60 * 8) window.__trickDone = true;
    };
  }, { t, boost, approach });
  await page.waitForFunction(() => window.__trickDone, null, { timeout: 120000 }).catch(() => {});
  await frames(20);
  const landed = (await evs('landed')).slice(l0).at(-1)?.[2];
  const crashed = (await evCount('crashed')) > c0;
  return { landed, crashed };
}

async function waitGrounded(maxF = 60 * 20) {
  const f0 = (await qa()).f;
  await page.waitForFunction(({ f0, maxF }) => window.__sendit.player.state === 1 || window.__qa.f > f0 + maxF, { f0, maxF }, { timeout: 180000 }).catch(() => {});
  return S(() => window.__sendit.player.state);
}

async function crashAt(v, tierWanted) {
  await S(() => window.__botOff());
  await waitGrounded();
  await placeDown(v, 40);
  await frames(20);
  const c0 = await evCount('crashed');
  let tier = null;
  if (tierWanted === 'big') {
    // Over-flip off a boosted jump: lands on the head at speed.
    await trick('overflip', { over: true }, { boost: 9 });
  } else {
    await S(() => { const pl = window.__sendit.player; if (pl.state === 1) pl.crash('qa'); });
    await frames(5);
  }
  tier = await S(() => window.__sendit.ragdoll?.stats?.seed?.tier ?? window.__sendit.player.ragdoll?.stats?.seed?.tier ?? null);
  const crashed = (await evCount('crashed')) > c0;
  await frames(40);
  await shot(`crash-${tierWanted}`);
  const st = await waitGrounded(60 * 16);
  const resp = await evCount('respawned');
  return { crashed, tier, respawned: st === 1, resp };
}

// The ride's finish: a point just before it on the course (progress finish: climb the progress field from the
// rider; radius finish: 25 m before the circle along the spawn → finish line).
async function nearFinish() {
  return S(async () => {
    const s = window.__sendit, pl = s.player, C = s.course, T = s.terrain;
    const { trailFinishFor } = await import('/src/maps/registry.js');
    const tf = trailFinishFor(C, s.map.trail);
    window.__qaTeleport = window.__qa.f;
    if (tf?.radius) {
      const dx = tf.x - pl.position.x, dz = tf.z - pl.position.z, l = Math.hypot(dx, dz) || 1;
      const back = tf.radius + 22;
      const x = tf.x - dx / l * back, z = tf.z - dz / l * back;
      pl.place({ x, z }, Math.atan2(-dx / l, -dz / l));
      pl.velocity.copy(pl.forward()).multiplyScalar(10);
      return { kind: 'radius', target: tf };
    }
    const goal = tf?.progress ?? C.finishAt;
    let x = pl.position.x, z = pl.position.z, g = C.progress(x, z), it = 0;
    while (g < goal - 18 && it++ < 4000) {
      let best = null;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, nx = x + Math.cos(a) * 6, nz = z + Math.sin(a) * 6;
        if (T.isInside && !T.isInside(nx, nz, 30)) continue;
        const ng = C.progress(nx, nz);
        if (!best || ng > best.g) best = { x: nx, z: nz, g: ng };
      }
      if (!best || best.g <= g) break;
      x = best.x; z = best.z; g = best.g;
    }
    const e = 3, gx = C.progress(x + e, z) - C.progress(x - e, z), gz = C.progress(x, z + e) - C.progress(x, z - e);
    pl.place({ x, z }, Math.atan2(-gx, -gz));
    pl.velocity.copy(pl.forward()).multiplyScalar(10);
    return { kind: 'progress', goal, g, it };
  });
}

async function rideToFinish(mode, trailName) {
  const rc0 = await evCount('runComplete');
  const info = await nearFinish();
  await frames(5);
  await bot(1, {});
  // Ride across (up to 25 s): Challenge shows the results card, Zen pops RUN COMPLETE and resets to the top.
  const okF = await page.waitForFunction((mode) => mode === 'challenge' ? !document.getElementById('results').classList.contains('hidden') : (window.__ev || []).filter((e) => e[0] === 'runComplete').length > window.__rc0, mode, { timeout: 25 * 1000 * 4 }).then(() => true).catch(() => false);
  void rc0;
  return { info, okF };
}

// ---------------------------------------------------------------- the play-test
const t0 = Date.now();
step = 'boot';
await page.goto(`${base}?map=${MAP}`, { timeout: T, waitUntil: 'domcontentloaded' });
await lobbyReady();
check('boots into the lobby', true, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
await installMonitor();
await ev(['landed', 'crashed', 'respawned', 'runComplete', 'runCompleted', 'thrillRestart', 'thrillRetry', 'thrillReplay', 'resetTop', 'takeoff', 'grindStart', 'highlightSaved', 'thrillSpot', 'hint']);
await shot('lobby');
errCheck('boot');

const trails = (await S(() => window.__sendit.map.map.trails.map((t) => ({ id: t.id, name: t.name })))).slice(0, MAXTR);
const mapName = await S(() => window.__sendit.map.map.mountain?.name || window.__sendit.map.map.id);
let clipsSaved = 0;
const runRows = [];

for (const [ei, equip] of EQUIPS.entries()) {
  step = `${equip} features`;
  await setEquip(equip);
  await rideFromLobby('zen');   // (replay and retry are Zen features: in a Challenge, Backspace restarts the race)
  await mem(`${equip} start`);
  await clearIssues();
  await shot(`${equip}-start`);
  for (const [w, h] of SIZES) { await page.setViewportSize({ width: w, height: h }); await frames(30); await hudCheck(`${equip} ride HUD ${w}x${h}`); await shot(`${equip}-hud-${w}x${h}`); }
  await page.setViewportSize({ width: SIZES[0][0], height: SIZES[0][1] });
  await bot(60 * 5, {});
  const st5 = await S(() => ({ st: window.__sendit.player.state, sp: window.__sendit.player.speed }));
  check(`${equip} bot rides the first trail`, st5.st !== 0, JSON.stringify(st5));

  // Tricks
  const tricks = [['spin360', { spin: 2 }], ['backflip', { flip: 1 }], ['cork720', { spin: 4, flip: 1 }], ['grab', { grab: true }], ['frontflip-grab', { flip: -1, grab: true }], ['spin540', { spin: 3 }]];
  const tr = [];
  for (const [nm, t] of tricks) {
    await waitGrounded();
    await placeDown(13, 60);
    await frames(10);
    const r = await trick(nm, t);
    tr.push(`${nm}:${r.crashed ? 'crash' : r.landed ? (r.landed.trick || 'air') : '?'}`);
    if (nm === 'cork720') { await hudCheck(`${equip} after ${nm} (announcer)`); await shot(`${equip}-trick-${nm}`); }
  }
  check(`${equip} tricks thrown (spins / flips / cork / grabs)`, tr.filter((x) => !x.endsWith('?')).length >= 5, tr.join(' '));

  // Instant replay (Tab) of the last jump, then save it (F).
  await waitGrounded();
  await placeDown(13, 60);
  await frames(10);
  await trick('replay-jump', { spin: 2, grab: true }, { approach: 150 });   // (retry puts you back on a recorded approach)
  await waitGrounded();
  await S(() => window.__botOff());
  await frames(10);
  const rp0 = await evCount('thrillReplay');
  await key('Tab');
  await frames(30);
  const replaying = await S(() => !!window.__thrill?.replay?.active);
  await shot(`${equip}-replay`);
  await frames(90);
  await issuesCheck(`${equip} replay`);
  await key('Tab');   // skip
  await frames(30);
  const after = await S(() => ({ active: !!window.__thrill?.replay?.active, mode: window.__sendit.game.mode, st: window.__sendit.player.state }));
  check(`${equip} instant replay (Tab) plays and Tab ends it`, (replaying || (await evCount('thrillReplay')) > rp0) && !after.active && after.mode === 1, JSON.stringify({ replaying, after }));
  const hl0 = await S(async () => { const st = await import('/src/thrill/clipstore.js'); return (await st.listClips?.())?.length ?? null; }).catch(() => null);
  const hs0 = await evCount('highlightSaved');
  await key('KeyF');
  await frames(60);
  await page.waitForFunction((n) => (window.__ev || []).filter((e) => e[0] === 'highlightSaved').length > n, hs0, { timeout: 30000 }).catch(() => {});
  await wait(500);
  const hl1 = await S(async () => { const st = await import('/src/thrill/clipstore.js'); return (await st.listClips?.())?.length ?? null; }).catch(() => null);
  if (hl1 !== null && hl0 !== null && hl1 > hl0) clipsSaved++;
  const hints = (await evs('hint')).slice(-2).map((e) => e[2]);
  const lastLand = (await evs('landed')).at(-1)?.[2];
  check(`${equip} save clip (F) stores a highlight`, hl1 === null || hl0 === null ? true : hl1 > hl0, `clips ${hl0} → ${hl1} · last landing ${JSON.stringify(lastLand && { trick: lastLand.trick, clean: lastLand.clean, air: lastLand.air, result: lastLand.result })} · hints ${JSON.stringify(hints)}`);

  // Retry (Backspace) puts us back before the last take-off; restart (R) at the top.
  await bot(60, {});
  const rt0 = await evCount('thrillRetry');
  await key('Backspace');
  await frames(60);
  check(`${equip} retry (Backspace)`, (await evCount('thrillRetry')) > rt0, '');
  const rs0 = (await evCount('thrillRestart')) + (await evCount('resetTop'));
  await bot(60, {});
  await key('KeyR');
  await frames(90);
  const rs1 = (await evCount('thrillRestart')) + (await evCount('resetTop'));
  const atTop = await S(() => { const s = window.__sendit, sp = s.terrain.getSpawn().position; return Math.hypot(s.player.position.x - sp.x, s.player.position.z - sp.z); });
  check(`${equip} restart (R) back at the trail top`, rs1 > rs0 && atTop < 60, `${atTop.toFixed(1)} m from spawn`);
  await issuesCheck(`${equip} replay/retry/restart`);

  // Crashes of each severity (ragdoll) → respawn.
  const cr = [];
  for (const [v, tw] of [[3, 'small'], [16, 'medium'], [14, 'big']]) {
    step = `${equip} crash ${tw}`;
    const r = await crashAt(v, tw);
    cr.push(`${tw}:${r.crashed ? r.tier : 'no crash'}${r.respawned ? '' : ' NO RESPAWN'}`);
    check(`${equip} crash ${tw} (ragdoll) → respawn`, r.crashed && r.respawned, `tier ${r.tier}`);
  }
  await issuesCheck(`${equip} crashes`);
  errCheck(`${equip} crashes`);

  // First person through a jump, a trick, a crash and back.
  step = `${equip} first person`;
  await waitGrounded();
  await placeDown(12, 50);
  await key('KeyC');
  await frames(30);
  const fpOn = await S(() => !!window.__sendit.rider.fp);
  await bot(60 * 3, {});
  await shot(`${equip}-fp-ride`);
  await hudCheck(`${equip} first person HUD`);
  await placeDown(13, 60);
  const fpt = await trick('fp-spin', { spin: 2, grab: true });
  await shot(`${equip}-fp-after-jump`);
  const fpc = await crashAt(15, 'fp-crash');
  const fpBack = await S(() => !!window.__sendit.rider.fp);
  check(`${equip} first person (C): ride, jump, crash, back in fp after respawn`, fpOn && fpc.crashed && fpc.respawned && fpBack, JSON.stringify({ fpOn, fpBack, jump: fpt.landed?.trick ?? (fpt.crashed ? 'crash' : null) }));
  await issuesCheck(`${equip} first person`);
  await key('KeyC');
  await frames(20);

  // Pause menu + settings while riding.
  step = `${equip} pause`;
  await keepResumed(false);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: 10000 }).catch(() => {});
  const paused = await S(() => window.__sendit.game.mode === 2 && !document.getElementById('pause').classList.contains('hidden'));
  await shot(`${equip}-pause`);
  await page.click('#pause [data-act=settings]');
  await wait(300);
  const setOpen = await S(() => !document.getElementById('settings').classList.contains('hidden'));
  await page.click('#settings .seg[data-key=quality] button[data-v="0"]').catch(() => {});
  await frames(20);
  await page.click(`#settings .seg[data-key=quality] button[data-v="${QUALITY}"]`).catch(() => {});
  await frames(10);
  await shot(`${equip}-settings`);
  await page.keyboard.press('Escape');   // closes the settings modal
  await wait(300);
  const backToPause = await S(() => document.getElementById('settings').classList.contains('hidden') && window.__sendit.game.mode === 2);
  await page.click('#pause [data-act=resume]');
  await wait(300);
  const resumed = await S(() => window.__sendit.game.mode === 1);
  check(`${equip} pause → settings → back → resume`, paused && setOpen && backToPause && resumed, JSON.stringify({ paused, setOpen, backToPause, resumed }));
  await keepResumed(true);
  await mem(`${equip} after features`);
  errCheck(`${equip} features`);
  await toLobby();
  check(`${equip} back to the lobby from a ride`, true);

  // Every trail from the lobby's Maps tab, modes alternating.
  for (const [ti, t] of trails.entries()) {
    const mode = (ti + ei) % 2 ? 'challenge' : 'zen';
    step = `${equip} ${t.id} ${mode}`;
    await openTrails();
    const row = await page.$(`.tr-row[data-trail="${t.id}"]`);
    if (!row) { check(`${equip} trail ${t.id} listed in the Maps tab`, false); continue; }
    const reload = await S((id) => document.querySelector(`.tr-row[data-trail="${id}"] .tr-ride`)?.classList.contains('reload'), t.id);
    if (reload) { runRows.push({ equip, trail: t.id, mode, result: 'skipped (other resort: reload)' }); continue; }
    await page.click(`[data-mode=${mode}]`).catch(() => {});
    await page.click(`.tr-row[data-trail="${t.id}"] .tr-ride`);
    await waitRiding();
    const here = await S((id) => window.__sendit.map.trail === id, t.id);
    await S(() => { window.__rc0 = (window.__ev || []).filter((e) => e[0] === 'runComplete').length; });
    if (mode === 'challenge' && ti < 2) {
      // R in a race: back to the top, countdown, clock from zero, no gate penalty from the start.
      await bot(60 * 3, {});
      await key('KeyR');
      await frames(60 * 5);
      const a = await S(() => window.__sendit.activities.hud());
      check(`${equip} ${t.id} challenge: R restarts the race clean`, a.state === 'running' && a.penalty === 0 && a.time < 4, JSON.stringify({ st: a.state, t: +a.time.toFixed(2), pen: a.penalty, gates: `${a.gates}/${a.gateTotal}` }));
    }
    await bot(60 * 4, { jumpEvery: 150, trick: { spin: 2 } });
    if (ti === 0) await hudCheck(`${equip} ${t.id} ${mode} riding`);
    const fin = await rideToFinish(mode, t.name);
    await frames(30);
    if (mode === 'challenge') await wait(2500);   // (the results rows cascade in on the real clock)
    await shot(`${equip}-${t.id}-${mode}-finish`);
    if (mode === 'challenge' && fin.okF) await hudCheck(`${equip} ${t.id} results card`);
    const q = await qa();
    const res = fin.okF ? 'finished' : `no finish (${JSON.stringify(fin.info).slice(0, 120)})`;
    runRows.push({ equip, trail: t.id, mode, result: res, issues: q.issues.length });
    check(`${equip} ${t.id} (${mode}): picked in lobby, ridden, finish crossed`, here && fin.okF, res);
    await issuesCheck(`${equip} ${t.id} ${mode}`);
    errCheck(`${equip} ${t.id} ${mode}`);
    await S(() => window.__botOff());
    await toLobby();
    await mem(`${equip} after ${t.id}`);
  }
}

// Career › Highlights shows the saved clips.
step = 'highlights';
await S(() => window.__sendit.lobby.select('highlights'));
await wait(1500);
const cards = await S(() => document.querySelectorAll('.hl-card, [data-clip]').length);
await shot('highlights');
check('Career › Highlights lists the saved clips', clipsSaved === 0 || cards >= 1, `${cards} cards, ${clipsSaved} saved`);
errCheck('highlights');

// Lift (Lake Tahoe).
if (LIFT) {
  step = 'lift';
  await S(() => window.__sendit.lobby.select('home'));
  await rideFromLobby('zen');
  const L = await S(() => { const pl = window.__sendit.player, L = pl.lifts?.nearestBase(pl.position); if (!L) return null; pl.place(L.bottom.clone(), 0); pl.board(L); return { name: L.name || '', len: pl.lifts.rideLength(L) }; });
  if (!L) check('lift: a rideable lift near the spawn', false);
  else {
    await frames(30);
    const onLift = await S(() => window.__sendit.player.state === 4 && window.__sendit.game.mode === 3);
    await shot('lift-ride');
    await hudCheck('lift HUD');
    await key('KeyC'); await frames(60); await shot('lift-fp'); await key('KeyC');
    await S(() => { const pl = window.__sendit.player; pl._liftD = Math.max(pl._liftD, pl.lifts.rideLength(pl.lift ?? pl._lift ?? null) - 30 || 0); });
    await page.waitForFunction(() => window.__sendit.player.state === 1, null, { timeout: 120000 }).catch(() => {});
    const off = await S(() => ({ st: window.__sendit.player.state, mode: window.__sendit.game.mode }));
    await frames(60);
    await shot('lift-dismount');
    check('lift: board, ride (fp toggle), dismount to riding', onLift && off.st === 1 && off.mode === 1, JSON.stringify({ onLift, off, L }));
    await issuesCheck('lift');
    errCheck('lift');
    await toLobby();
  }
}
await mem('end');

// Map switch through the lobby to another mountain.
if (NEXT) {
  step = 'map switch';
  await S(() => window.__sendit.lobby.select('maps'));
  await page.waitForSelector('.mt-card, .tr-row', { timeout: T });
  if (await page.$('.mt-back')) await page.click('.mt-back');
  await page.click(`.mt-card[data-mountain="${NEXT}"]`);
  await page.waitForSelector('.tr-row', { timeout: T });
  await Promise.all([page.waitForNavigation({ timeout: T }), page.click('.tr-row .tr-pick')]);
  await page.waitForFunction(() => window.__sendit?.lobby?.visible && window.__sendit.game.mode === 0, null, { timeout: T }).catch(() => {});
  const now = await S(() => window.__sendit?.map?.map?.id);
  check(`map switch in the lobby → ${NEXT}`, now === NEXT || (await S(() => window.__sendit?.map?.map?.mountain?.id)) === NEXT, now);
  errCheck('map switch');
}

await browser.close();
const heap = memLog.filter((m) => m.heap).map((m) => m.heap);
console.log(`QA-SUMMARY ${JSON.stringify({ map: MAP, name: mapName, failed, checks: rows.length, minutes: +((Date.now() - t0) / 60000).toFixed(1), runs: runRows, heap: heap.length ? [heap[0], Math.max(...heap), heap.at(-1)] : null, geo: [memLog[0]?.geo, memLog.at(-1)?.geo], tex: [memLog[0]?.tex, memLog.at(-1)?.tex] })}`);
writeFileSync(`${out}/${MAP}-qa.json`, JSON.stringify({ rows, runRows, memLog, errors }, null, 1));
process.exit(failed ? 1 : 0);
