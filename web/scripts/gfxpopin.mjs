// Pop-in check: flies the camera down each map's run at speed (deterministic, no physics) and counts
// abrupt visual changes per second inside fixed radii around the camera:
//   trees    — a tree's representation jumps in one frame (frond LOD0 ↔ LOD1 ↔ far shell ↔ nothing).
//              A tree's representation is a continuous level: LOD + cross-fade progress. A jump of
//              ≥ 0.5 in one frame is a pop. Builds with TreeSystem.debugLevels() report fades; older
//              builds are read from the instance pools (hard swaps only).
//   shadows  — a tree within the shadow box starts / stops casting a shadow in one frame.
//   scatter  — a boulder / fence / ice cell switches visibility or geometry while an instance in it
//              is closer than its fade-out distance (whole-cell pops).
//   terrain  — a terrain chunk swaps LOD geometry without geomorphing.
//   compiles — shader programs linked during the ride (stalls), textures uploaded during the ride.
//   spikes   — main-thread frames (rAF callbacks) longer than 50 ms.
// Also reports load time (navigation → first riding frame).
// Usage: node scripts/gfxpopin.mjs [baseUrl] [maps] [qualities] [seconds] [W H]
//   maps: comma list of valcrest-gully, blackspruce, ravenspire (default all)
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', mapsArg = 'valcrest-gully,blackspruce,ravenspire', qs = '1', secs = '16', W = '1280', H = '720'] = process.argv.slice(2);
// Fly speeds (m/s) per map: Ravenspire at ~70 mph, the tree run a bit slower.
const SPEED = { 'valcrest-gully': 25, blackspruce: 20, ravenspire: 31 };
const START = { 'valcrest-gully': 0.08, blackspruce: 0.12, ravenspire: 0.45, ...JSON.parse(process.env.START || '{}') };
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const map of mapsArg.split(',')) for (const q of qs.split(',').map(Number)) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let prewarmMs = null;
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); const t = m.text(); if (t.startsWith('[gfx] prewarm')) prewarmMs = Number(t.split(' ')[2]); });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__cpu = [];
    window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); if (window.__cpuOn) window.__cpu.push(performance.now() - a); });
  });
  const t0 = Date.now();
  await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
  await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 400000 });
  // First riding frame rendered.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const load = (Date.now() - t0) / 1000;
  const res = await page.evaluate(async ({ speed, start, secs, DEBUG_KEYS }) => {
    const s = window.__sendit, R = s.renderer, T = s.terrain, sc = s.scatter, trees = sc.trees;
    const path = s.course.path;
    // Arc-length table of the run.
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    const L = cum[cum.length - 1];
    const at = (d) => {
      d = Math.max(0, Math.min(L - 1, d));
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
      const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
      return { x: path[lo].x + (path[hi].x - path[lo].x) * f, z: path[lo].y + (path[hi].y - path[lo].y) * f };
    };
    const d0 = start * L;
    let tStart = null, dist = d0;
    // Chase camera along the run: 7 m behind, 3 m up, looking 25 m ahead.
    window.__gfxCam = () => {
      const now = performance.now();
      if (tStart === null) tStart = now;
      dist = d0 + (now - tStart) / 1000 * speed;
      const c = at(dist - 7), f = at(dist + 25);
      return [c.x, T.getHeight(c.x, c.z) + 3, c.z, f.x, T.getHeight(f.x, f.z) + 1, f.z, 62];
    };
    s.player.script = (c) => { c.tuck = 1; };
    await new Promise((r) => setTimeout(r, 1500));   // settle at the start (pools / LOD around the camera)
    tStart = null;
    // --- per-frame state probes
    const cam = s.camera.position;
    const tl = trees.trees;
    const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
    const idx = new Map(tl.map((t, i) => [key(t[0], t[2]), i]));
    const level = new Float32Array(tl.length).fill(-1);
    const casting = new Uint8Array(tl.length);
    const hasDebug = typeof trees.debugLevels === 'function';
    const readLevels = () => {
      if (hasDebug) return trees.debugLevels(cam);   // { level: Float32Array, cast: Uint8Array }
      // Older builds: hard pools. 0 = fronds, 1 = mid, 2 = far shell, 3 = not drawn.
      const lv = new Float32Array(tl.length).fill(3), ca = new Uint8Array(tl.length);
      const lc = trees.lodCenter.value;
      tl.forEach((t, i) => {
        const cellVisible = true;
        if (cellVisible && (lc.w <= 0 || Math.hypot(t[0] - lc.x, t[2] - lc.z) >= lc.w)) lv[i] = 2;
      });
      for (const pool of trees.pools) {
        const a = pool.im.instanceMatrix.array;
        for (let k = 0; k < pool.im.count; k++) {
          const i = idx.get(key(a[k * 16 + 12], a[k * 16 + 14]));
          if (i === undefined) continue;
          lv[i] = pool.lod === 'lod0' ? 0 : 1;
          if (pool.im.castShadow) ca[i] = 1;
        }
      }
      // far cells hidden by distance
      for (const im of trees.cells) if (!im.visible) {
        const a = im.instanceMatrix.array;
        for (let k = 0; k < im.count; k++) { const i = idx.get(key(a[k * 16 + 12], a[k * 16 + 14])); if (i !== undefined && lv[i] === 2) lv[i] = 3; }
      }
      return { level: lv, cast: ca };
    };
    const shadowR = (s.scene.children.find((o) => o.isDirectionalLight)?.shadow.camera.right ?? 60);
    const bands = [[0, 60], [60, 150], [150, 400]];
    const pops = { trees: [0, 0, 0], shadows: 0, scatter: 0, terrain: 0, minTreePop: Infinity };
    const cellState = new Map();
    for (const im of sc.cells) cellState.set(im, [im.visible, im.geometry]);
    const chunkGeo = new Map(T.chunks.map((m) => [m, m.geometry]));
    const prog0 = R.info.programs.length, tex0 = R.info.memory.textures;
    const progNames0 = new Set(R.info.programs.map((p) => p.cacheKey));
    // Debug: remember which object each shadow-depth material was used for.
    const depthOwner = new Map();
    {
      let proto = Object.getPrototypeOf(s.scene);
      while (proto && !Object.prototype.hasOwnProperty.call(proto, 'onBeforeShadow')) proto = Object.getPrototypeOf(proto);
      if (proto) {
        const orig = proto.onBeforeShadow;
        proto.onBeforeShadow = function (r, o, c, sc, g, dm) { return orig.apply(this, arguments); };
        const origA = proto.onAfterShadow;
        proto.onAfterShadow = function (r, o, c, sc, g, dm) {
          const pr = dm && R.properties.get(dm).currentProgram;
          if (pr && !progNames0.has(pr.cacheKey) && !depthOwner.has(pr)) depthOwner.set(pr, (o.name || o.type) + '<' + (o.parent?.name || o.parent?.type || '') + '<' + (o.parent?.parent?.name || '') + ' mat ' + (o.material?.name || o.material?.type) + ' map ' + !!o.material?.map);
          return origA.apply(this, arguments);
        };
      }
    }
    let frames = 0, hitches = 0, prevCam = null;
    window.__cpu.length = 0; window.__cpuOn = true;
    await new Promise((done) => {
      const tick = () => {
        const el = tStart === null ? 0 : (performance.now() - tStart) / 1000;
        frames++;
        // A long frame moves the time-based camera metres at once: everything would "jump" by the
        // motion itself. Those frames re-sync the state without counting (reported as hitches).
        const moved = prevCam ? Math.hypot(cam.x - prevCam.x, cam.z - prevCam.z) : 0;
        const hitch = moved > 2.0;
        if (hitch) hitches++;
        prevCam = { x: cam.x, z: cam.z };
        const st = readLevels();
        for (let i = 0; i < tl.length; i++) {
          const d = Math.hypot(tl[i][0] - cam.x, tl[i][2] - cam.z);
          const lv = st.level[i];
          if (!hitch && level[i] >= 0 && Math.abs(lv - level[i]) >= 0.5 && d < 400) {
            const b = d < 60 ? 0 : d < 150 ? 1 : 2;
            pops.trees[b]++; pops.minTreePop = Math.min(pops.minTreePop, d);
            if ((pops.log ??= []).length < 12) pops.log.push(`t${i} d${d.toFixed(1)} ${level[i].toFixed(2)}->${lv.toFixed(2)} mem${trees.member?.[i]} last${trees.last ? Math.hypot(trees.last.x - cam.x, trees.last.z - cam.z).toFixed(1) : '-'}`);
          }
          if (!hitch && level[i] >= 0 && st.cast[i] !== casting[i] && d < shadowR * 1.2) pops.shadows++;
          level[i] = lv; casting[i] = st.cast[i];
        }
        for (const im of sc.cells) {
          const prev = cellState.get(im);
          if (prev[0] !== im.visible || prev[1] !== im.geometry) {
            const a = im.instanceMatrix.array;
            let near = Infinity;
            for (let k = 0; k < im.count; k++) near = Math.min(near, Math.hypot(a[k * 16 + 12] - cam.x, a[k * 16 + 14] - cam.z));
            const fadeEnd = im.userData.fadeEnd ?? 0;   // newer builds: instances already faded out beyond this
            const geoSwap = prev[1] !== im.geometry && !im.userData.geoFaded;
            if ((prev[0] !== im.visible && near < Math.max(fadeEnd, 0) - 1) || (prev[0] === im.visible && geoSwap && near < 400) || (prev[0] !== im.visible && !im.userData.fadeEnd && near < 1500)) pops.scatter++;
            cellState.set(im, [im.visible, im.geometry]);
          }
        }
        for (const m of T.chunks) {
          if (chunkGeo.get(m) !== m.geometry) { if (!T.geomorph) pops.terrain++; chunkGeo.set(m, m.geometry); }
        }
        if (el < secs) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    window.__cpuOn = false;
    const cpu = window.__cpu.slice().sort((a, b) => a - b);
    return {
      frames, hitches, pops, dist: dist - d0,
      whoCompiled: (() => {
        // Which materials own the programs linked during the ride (debug).
        const fresh = new Set(R.info.programs.filter((p) => !progNames0.has(p.cacheKey)));
        const out = [];
        const check = (m, label) => { const pr = m && R.properties.get(m).currentProgram; if (pr && fresh.has(pr)) out.push(label + ':' + (m.name || m.type)); };
        s.scene.traverse((o) => { for (const m of [].concat(o.material || [])) check(m, o.name || o.type); check(o.customDepthMaterial, 'depth/' + (o.name || o.type)); });
        for (const [pr, who] of depthOwner) out.push('shadow program by ' + who);
        for (const p of R.info.programs) if (p.cacheKey.startsWith('depth')) out.push((fresh.has(p) ? 'FRESH ' : 'old ') + p.cacheKey.replace(/\s+/g, ' ').replace(/,false/g, ',f').replace(/,true/g, ',T'));
        out.push('treeDepth programs: ' + R.info.programs.filter((p) => p.cacheKey.includes('treeDepth')).map((p) => (fresh.has(p) ? 'FRESH ' : 'old ') + p.usedTimes).join(' '));
        for (const pool of trees.pools || []) { if (!pool.im.customDepthMaterial) continue; const pr = R.properties.get(pool.im.customDepthMaterial).currentProgram; out.push(pool.im.name + ' depthProg ' + (pr ? (fresh.has(pr) ? 'fresh' : 'old') : 'none') + ' shadowCount ' + pool.im.userData.shadowCount); }
        return out.join(', ');
      })(),
      compiles: R.info.programs.length - prog0, compiled: R.info.programs.filter((p) => !progNames0.has(p.cacheKey)).map((p) => p.name || p.cacheKey.slice(0, DEBUG_KEYS ? 1200 : 60).replace(/\s+/g, ' ')).join(' | '), texUploads: R.info.memory.textures - tex0,
      spikes: window.__cpu.filter((x) => x > 50).length, cpuMax: cpu[cpu.length - 1], cpuMed: cpu[cpu.length >> 1],
      trees: tl.length, hasDebug,
    };
  }, { speed: SPEED[map] ?? 25, start: START[map] ?? 0.1, secs: Number(secs), DEBUG_KEYS: !!process.env.DEBUG });
  const per = (n) => (n / Number(secs)).toFixed(2);
  const P = res.pops;
  console.log(`${map} q${q}: load ${load.toFixed(1)} s${prewarmMs !== null ? ` (prewarm ${(prewarmMs / 1000).toFixed(2)} s)` : ''}; ${res.frames} frames over ${res.dist.toFixed(0)} m (${res.hitches} hitch frames > 2 m skipped); trees ${res.trees}${res.hasDebug ? ' (fade-aware)' : ''}`);
  console.log(`   tree pops/s  <60 m ${per(P.trees[0])}  60-150 m ${per(P.trees[1])}  150-400 m ${per(P.trees[2])}  (nearest ${Number.isFinite(P.minTreePop) ? P.minTreePop.toFixed(0) + ' m' : '-'})`);
  console.log(`   shadow pops/s ${per(P.shadows)}  scatter cell pops/s ${per(P.scatter)}  terrain LOD pops/s ${per(P.terrain)}`);
  console.log(`   shader compiles during ride ${res.compiles}${res.compiled ? ' [' + res.compiled + ']' : ''}, texture uploads ${res.texUploads}, CPU frames > 50 ms ${res.spikes} (max ${res.cpuMax.toFixed(0)} ms, median ${res.cpuMed.toFixed(1)} ms); errors ${errs.length}`);
  if (process.env.DEBUG && res.whoCompiled) console.log('    compiled by:', res.whoCompiled);
  if (process.env.DEBUG && P.log) console.log('   ', P.log.join(' | '));
  for (const e of errs.slice(0, 3)) console.log('     ', e);
  await page.close();
}
await browser.close();
