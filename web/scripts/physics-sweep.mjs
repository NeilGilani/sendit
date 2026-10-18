// Headless rotation scenario sweep (no WebGL): "why does this spin / flip take so long?"
// Flies the real Player off flat ground across a grid of situations and measures the time from the key press
// to 90° / 180° of spin or flip, then lists the outliers (slow or dead with plenty of air left) grouped by cause.
//   dimensions: equipment × variant × map physics (default, Ravenspire, Dragonback, Voltage) × stance / switch ×
//               take-off (vertical speed = air time) × pop timing (lip, early, flat, rolled off) × what was held
//               through the take-off (nothing, a carve's pre-wind with / against the spin, the key itself, W / S) ×
//               press time × grab × physics step (1/30, 1/60, 1/144 s)
// Usage: node web/scripts/physics-sweep.mjs [--quick] [--axis spin|flip|both] [--csv out.csv] [--top N]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
const { RAVENSPIRE_PHYSICS } = await import('../src/maps/ravenspire/tuning.js');
const { DRAGONBACK_PHYSICS } = await import('../src/maps/dragonback/tuning.js');
const { VOLTAGE_PHYSICS } = await import('../src/maps/voltage/tuning.js');
game.mode = Mode.RIDING;

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const AXIS = args.includes('--axis') ? args[args.indexOf('--axis') + 1] : 'both';
const TOP = args.includes('--top') ? +args[args.indexOf('--top') + 1] : 25;
const CSV = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
const MAPS = { default: null, ravenspire: RAVENSPIRE_PHYSICS, dragonback: DRAGONBACK_PHYSICS, voltage: VOLTAGE_PHYSICS };

function flat(physics) {
  const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0);
  T.course = physics ? { physics } : {};   // Player applies the map's tuning (config.js applyMapTuning)
  return T;
}

/**
 * One air. s = { type, variant, map, stance, sw, vy, vz, set: 'lip'|'early'|'flat'|'roll', held: 'none'|'prewind+'|
 * 'prewind-'|'key'|'W'|'S', tp, grab, dt, axis: 'spin'|'back'|'front' }. Returns { t90, t180, left, air, result }.
 */
export function run(s) {
  const p = new Player(flat(MAPS[s.map]), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(s.type, s.variant);
  if (s.stance) p.setStance(s.stance);
  p.place(new THREE.Vector3(), s.sw ? Math.PI : 0);   // switch: the nose points back up the path
  p.dyn.travel = s.sw ? -1 : 1; p.travelSign = p.dyn.travel;
  p.velocity.set(0, s.vy, -s.vz);
  p.position.y = 0.4;
  p.lastPopQ = { lip: 1, early: 0.55, flat: 0.7, roll: 1 }[s.set];
  const want = s.axis === 'spin' ? { steer: -1 } : s.axis === 'back' ? { brake: 1 } : { up: 1 };
  // What the rider was doing at the take-off (read by takeoffInfo from _ctrl and the carve's yaw rate).
  const c0 = { steer: 0, brake: 0, up: 0 };
  // (steer −1 asks for spin momentum h > 0; the carve's pre-wind is h = −yawRate · prewind)
  if (s.held === 'prewind+') p.dyn.yawRate = -1.6;   // carving into the take-off, turning the same way as the spin asked for
  if (s.held === 'prewind-') p.dyn.yawRate = 1.6;    // … the other way (the spin asked for has to undo it)
  if (s.held === 'key') Object.assign(c0, want);
  if (s.held === 'W') c0.up = 1;
  if (s.held === 'S') c0.brake = 1;
  if (s.held === 'carve-') { p.dyn.yawRate = 1.6; c0.steer = 1; }   // carving the other way off the lip, then steering into the spin
  // 'combo': the other axis is under way (a spin for a flip, a flip for a spin), its key pressed just after the take-off
  const other = s.axis === 'spin' ? { brake: 1 } : { steer: -1 };
  Object.assign(p._ctrl, c0, { active: true });
  p.enterAir(s.set !== 'roll');
  const DT = s.dt;
  let t0 = null, t90 = null, t180 = null, base = 0;
  const angle = () => (s.axis === 'spin' ? Math.abs(p._spinTotal - base) : Math.abs(p.flip));
  void State;
  let air = 0;
  for (let i = 0; i < 8 / DT; i++) {
    p.script = (c) => {
      p.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      const t = p.airTime;
      // Held through the take-off: kept until the press (a key held = it stays down; the press then is a re-press).
      if (s.held === 'combo' && t > 0.02) Object.assign(c, other);
      if (t < s.tp) { if (s.held === 'key' || s.held === 'W' || s.held === 'S' || s.held === 'carve-') Object.assign(c, c0); }
      else {
        if (t0 === null) { t0 = t; base = p._spinTotal; }
        // 'key' held through: the rider lets go for one step at tp and presses again (a re-press), unless tp = 0.
        if (!(s.held === 'key' && s.tp > 0 && t - t0 < DT * 1.5)) Object.assign(c, want);
      }
      if (s.grab && t > 0.15) c.tuck = 1;
    };
    air = p.airTime;
    p.step(DT);
    if (p.state !== State.AIR && i > 2) break;
    if (t0 !== null) {
      const a = angle();
      if (t90 === null && a >= Math.PI / 2) t90 = p.airTime - t0;
      if (t180 === null && a >= Math.PI) t180 = p.airTime - t0;
    }
  }
  const result = p.state === State.CRASH ? 'crash' : p.lastLanding?.result ?? '?';
  return { t90, t180, left: air - (t0 ?? air), air, result };
}

// ------------------------------------------------------------------ grids
function* grid() {
  const types = ['ski', 'snowboard'];
  const axes = AXIS === 'both' ? ['spin', 'back', 'front'] : AXIS === 'flip' ? ['back', 'front'] : ['spin'];
  const vys = QUICK ? [8, 12] : [6, 8, 10, 12, 15];
  const tps = QUICK ? [0, 0.3, 0.5, 0.7, 1.0] : [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.7, 0.9, 1.1, 1.4];
  const sets = ['lip', 'early', 'flat', 'roll'];
  const helds = ['none', 'prewind+', 'prewind-', 'key', 'W', 'S', 'carve-', 'combo'];
  // Core: every situation, default map, allmountain, 60 Hz.
  for (const type of types) for (const axis of axes) for (const vy of vys) for (const set of sets) for (const held of helds) for (const tp of tps) for (const grab of [false, true]) {
    if ((held === 'W' || held === 'S') && axis === 'spin' && grab) continue;
    if (held === 'carve-' && axis !== 'spin') continue;
    yield { slice: 'core', type, variant: undefined, map: 'default', vy, vz: 11, set, held, tp, grab, dt: 1 / 60, axis };
  }
  // Slices: maps, variants, stance / switch, step size (fewer combinations each).
  const lite = { vys: [8, 12, 15], tps: [0, 0.25, 0.55, 0.9, 1.4], sets: ['lip', 'roll'], helds: ['none', 'prewind-', 'key'] };
  const slice = function* (name, over) {
    for (const type of types) for (const axis of axes) for (const vy of lite.vys) for (const set of lite.sets) for (const held of lite.helds) for (const tp of lite.tps) {
      const s = { slice: name, type, variant: undefined, map: 'default', vy, vz: 11, set, held, tp, grab: false, dt: 1 / 60, axis, ...over(type) };
      if (s.skip) continue;
      yield s;
    }
  };
  for (const map of ['ravenspire', 'dragonback', 'voltage']) yield* slice(`map:${map}`, () => ({ map, vz: 20 }));
  for (const variant of ['gs', 'park']) yield* slice(`variant:${variant}`, () => ({ variant }));
  yield* slice('switch', () => ({ sw: true }));
  yield* slice('goofy', (type) => ({ stance: 'goofy', skip: type !== 'snowboard' }));
  for (const dt of [1 / 30, 1 / 144]) yield* slice(`dt:${Math.round(1 / dt)}`, () => ({ dt }));
  yield* slice('dt:60', () => ({}));
}

// ------------------------------------------------------------------ run + report
const rows = [];
const t0 = Date.now();
for (const s of grid()) rows.push({ ...s, ...run(s) });
console.log(`${rows.length} airs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Outliers: plenty of air left after the press and still slow (or never). The design's own slow cases are the
// late throws (flip ≈ 1.07 s, spin ≈ 1.2–1.3 s to 180°); anything past these limits is worth a look.
const LIMIT = { spin: 1.35, back: 1.15, front: 1.15 };
const NEED = { spin: 1.5, back: 1.9, front: 1.9 };
// By design: a key held through the take-off and never let go stays locked (a tuck / brake / carve isn't a trick).
const locked = (r) => (r.held === 'key' && r.tp === 0 && (r.axis !== 'spin' || r.set === 'roll')) || (r.held === 'S' && r.axis === 'back') || (r.held === 'W' && r.axis === 'front');
const isOut = (r) => !locked(r) && r.left >= NEED[r.axis] && (r.t180 === null || r.t180 > LIMIT[r.axis]);
const outs = rows.filter(isOut);
const key = (r) => `${r.axis}|${r.held}|${r.set}|${r.grab ? 'grab' : ''}`;
const groups = new Map();
for (const r of outs) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
console.log(`\noutliers (≥ ${NEED.spin} s left for a spin / ${NEED.back} s for a flip, slower than ${LIMIT.spin} / ${LIMIT.back} s to 180°): ${outs.length} of ${rows.filter((r) => r.left >= NEED[r.axis]).length}`);
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('  count  axis   held      set    grab  slices / tp seen                        t180 (median, never)');
for (const [k, g] of sorted.slice(0, TOP)) {
  const [axis, held, set, grab] = k.split('|');
  const ts = g.map((r) => r.t180).filter((x) => x !== null).sort((a, b) => a - b);
  const never = g.filter((r) => r.t180 === null).length;
  const sl = [...new Set(g.map((r) => r.slice))].join(','), tp = [...new Set(g.map((r) => r.tp))].sort((a, b) => a - b).join(',');
  console.log(`  ${String(g.length).padStart(5)}  ${axis.padEnd(6)} ${held.padEnd(9)} ${set.padEnd(6)} ${grab.padEnd(5)} ${(sl + ' @' + tp).slice(0, 48).padEnd(48)} ${ts.length ? ts[ts.length >> 1].toFixed(2) : ' —  '} s, never ${never}`);
}
// Per-slice summary: median / worst t180 among airs with enough left (frame-rate dependence, maps, gear).
console.log('\nper slice (airs with enough air left): median t180 · 90th pct · outliers');
const slices = [...new Set(rows.map((r) => r.slice))];
for (const sl of slices) for (const axis of ['spin', 'back', 'front']) {
  const g = rows.filter((r) => r.slice === sl && r.axis === axis && r.left >= NEED[axis]);
  if (!g.length) continue;
  const ts = g.map((r) => r.t180 ?? 9).sort((a, b) => a - b);
  console.log(`  ${sl.padEnd(16)} ${axis.padEnd(6)} n${String(g.length).padStart(5)}  ${ts[ts.length >> 1].toFixed(2)} · ${ts[Math.floor(ts.length * 0.9)].toFixed(2)} · ${g.filter(isOut).length}`);
}
if (CSV) {
  const fs = await import('node:fs');
  const cols = ['slice', 'type', 'variant', 'map', 'sw', 'stance', 'axis', 'vy', 'set', 'held', 'tp', 'grab', 'dt', 't90', 't180', 'left', 'air', 'result'];
  fs.writeFileSync(CSV, [cols.join(','), ...rows.map((r) => cols.map((c) => (typeof r[c] === 'number' ? +r[c].toFixed(3) : r[c] ?? '')).join(','))].join('\n'));
  console.log(`\nwrote ${CSV}`);
}
