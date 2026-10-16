// Headless steer-release bench: hold a turn key (or a half stick) for `hold` s at a constant speed on
// flat snow, let go, and time how long the turn takes to settle. Speed is pinned every step so the
// numbers are the steering dynamics alone (no drag / gravity drift). Each map's physics is applied
// through the per-map hook. Also prints the turn-in (heading gained while holding) so a change to the
// release can be checked against the entry, and a linked turn (one key straight into the other).
// Usage: node web/scripts/physics-release.mjs [ski|snowboard|both]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player } = await import('../src/player.js');
const { RAVENSPIRE_PHYSICS } = await import('../src/maps/ravenspire/tuning.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

const DT = 1 / 60, DEG = Math.PI / 180;
const MAPS = [
  ['Valcrest', undefined, 12],
  ['Blackspruce', { ski: { maxVelocity: 18 }, snowboard: { maxVelocity: 17.5 } }, 15],
  ['Ravenspire', RAVENSPIRE_PHYSICS, 22],
];
const HEAD_RATE = 0.1;     // rad/s: the heading counts as settled below this (≈ 6 °/s)
const EDGE = 3 * DEG;      // the edge counts as flat below this

function flat(physics) {
  return {
    half: 1e7, spacing: 1, course: physics ? { physics } : {},
    getHeight: () => 0,
    getNormal: (x, z, r, out = new THREE.Vector3()) => out.set(0, 1, 0),
    getSurface: (x, z, out = new THREE.Vector4()) => out.set(1, 0, 0, 0),
    getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }),
  };
}
const unwrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** steerAt(t) → steer input; returns per-step samples after `release` s. */
function ride(type, physics, speed, steerAt, release, total = 4) {
  const p = new Player(flat(physics), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type); p.fadeThen = () => {}; p.flow?.dispose?.(); p.flow = null;
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, 0, -speed);
  let t = 0, prevH = p.heading;
  const out = { hold: [], after: [] };
  for (let i = 0; i < Math.round(total / DT); i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: steerAt(t), brake: 0, up: 0, jump: false, tuck: 0 }); };
    p.step(DT);
    p.velocity.setLength(speed);
    t += DT;
    const rate = unwrap(prevH - p.heading) / DT;   // + = turning right
    prevH = p.heading;
    const row = { t, rate, edge: p.edgeAngle, head: p.heading, lean: p.gearLatAccel, turn: p.turnInput };
    (t <= release + 1e-9 ? out.hold : out.after).push(row);
  }
  return out;
}

/** Time after release until |f| stays below `lim` for good (`sign`: only count values on that side). */
function settle(rows, f, lim, t0, sign = 0) {
  let last = t0;
  for (const r of rows) if ((sign ? f(r) * sign : Math.abs(f(r))) >= lim) last = r.t;
  return last - t0;
}

const which = process.argv[2] || 'both';
const types = which === 'both' ? ['ski', 'snowboard'] : [which];
const f = (x, d = 2) => Number(x).toFixed(d);
for (const type of types) {
  console.log(`\n=== ${type} ===`);
  console.log('map          input      turn-in°  peak°/s  edge@0.3s°   turn stops s  straight s  edge flat s  carry-on°');
  console.log('  (turn stops: heading rate into the turn < 6 °/s for good; straight: |rate| < 6 °/s, incl. the skis realigning to the path)');
  for (const [name, physics, v] of MAPS) {
    for (const [label, s] of [['key 1s', 1], ['stick .5', 0.5]]) {
      const hold = 1;
      const r = ride(type, physics, v, (t) => (t < hold ? s : 0), hold);
      const h0 = r.hold[0].head, hRel = r.hold.at(-1).head;
      const turnIn = unwrap(h0 - hRel) / DEG;
      const peak = Math.max(...r.hold.map((x) => Math.abs(x.rate))) / DEG;
      const e03 = r.hold[Math.round(0.3 / DT) - 1].edge / DEG;
      const tT = settle(r.after, (x) => x.rate, HEAD_RATE, hold, Math.sign(s));
      const tH = settle(r.after, (x) => x.rate, HEAD_RATE, hold);
      const tE = settle(r.after, (x) => x.edge, EDGE, hold);
      const carry = unwrap(hRel - r.after.at(-1).head) / DEG;
      console.log(`${name.padEnd(12)} ${label.padEnd(10)} ${f(turnIn, 1).padStart(8)} ${f(peak, 1).padStart(8)} ${f(e03, 1).padStart(11)}   ${f(tT).padStart(12)} ${f(tH).padStart(11)} ${f(tE).padStart(12)} ${f(carry, 1).padStart(10)}`);
    }
    // Linked turns: right 0.8 s straight into left 0.8 s, then release; the edge change must stay quick.
    const r = ride(type, physics, v, (t) => (t < 0.8 ? 1 : t < 1.6 ? -1 : 0), 1.6);
    const sw = r.hold.find((x) => x.t > 0.8 && x.edge < -EDGE);
    console.log(`${name.padEnd(12)} ${'link R→L'.padEnd(10)} edge crosses to the new side ${f((sw ? sw.t : NaN) - 0.8)} s after the switch; turn stops ${f(settle(r.after, (x) => x.rate, HEAD_RATE, 1.6, -1))} s, straight ${f(settle(r.after, (x) => x.rate, HEAD_RATE, 1.6))} s, edge ${f(settle(r.after, (x) => x.edge, EDGE, 1.6))} s`);
  }
}
