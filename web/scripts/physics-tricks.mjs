// Headless trick bench: flips, corks and their landings for both equipment types (no WebGL).
// Each case launches the real Player off flat ground with a given take-off velocity, drives the stick
// like a player (hold until the rotation is nearly there, then let go) and prints the landing.
// Usage: node web/scripts/physics-tricks.mjs [ski|snowboard|both]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;
const scores = [];
on('score', (s) => scores.push(`${s.label} +${s.points ?? s.value ?? ''}`));

const DT = 1 / 60, TAU = Math.PI * 2;
const flat = () => {
  const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0);
  return T;
};
function launch(type, vy, vz = -11, held = {}) {
  const p = new Player(flat(), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, vy, vz);
  p.position.y = 0.4;
  Object.assign(p._ctrl, held);
  p.enterAir(false);
  return p;
}
function run(p, fn, seconds = 4) {
  let maxFlip = 0;
  for (let i = 0; i < seconds / DT; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(p)); };
    p.step(DT);
    maxFlip = Math.max(maxFlip, Math.abs(p.flipRate));
    if (p.state !== State.AIR && i > 2) break;
  }
  return maxFlip;
}
/** Hold the flip key until |flip| plus a short lookahead reaches `turns` rotations (a player letting go early). */
const flipTo = (dir, turns, extra = {}) => (p) => ({ ...(Math.abs(p.flip) + Math.abs(p.flipRate) * 0.25 < turns * TAU ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {}), ...(typeof extra === 'function' ? extra(p) : extra) });
const spinTo = (deg) => (p) => (Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.14 < deg * Math.PI / 180 ? { steer: -1 } : {});

function bench(type) {
  console.log(`\n=== ${type} tricks ===`);
  const cases = [
    ['backflip (vy 8)', 8, flipTo(1, 1)],
    ['frontflip (vy 8)', 8, flipTo(-1, 1)],
    ['backflip released at 180° (vy 8)', 8, flipTo(1, 0.5)],
    ['backflip released at 90° (vy 8)', 8, flipTo(1, 0.25)],
    ['backflip + spin 360 (vy 9)', 9, (p) => ({ ...flipTo(1, 1)(p), ...spinTo(360)(p) })],
    ['backflip + spin 720 (vy 11)', 11, (p) => ({ ...flipTo(1, 1)(p), ...spinTo(720)(p) })],
    ['double backflip (vy 12)', 12, flipTo(1, 2)],
    ['double back + 1080 (vy 13)', 13, (p) => ({ ...flipTo(1, 2)(p), ...spinTo(1080)(p) })],
    ['W held through take-off (vy 7)', 7, () => ({ up: 1 }), { up: 1 }],
    ['S held through take-off (vy 7)', 7, () => ({ brake: 1 }), { brake: 1 }],
    ['frontflip + mute/indy grab (vy 9)', 9, flipTo(-1, 1, (p) => (p.airTime > 0.5 && Math.abs(p.flip) > 1 ? { tuck: 1 } : {}))],
    ['backflip, too little air (vy 4)', 4, () => ({ brake: 1 })],
  ];
  for (const [label, vy, fn, held] of cases) {
    scores.length = 0;
    const p = launch(type, vy, -11, held);
    const maxRate = run(p, fn);
    const L = p.lastLanding;
    const res = p.state === State.CRASH ? 'CRASH' : L ? `${L.result}${L.switch ? ' (switch)' : ''} yaw ${L.dev.toFixed(0)}° pitch ${(L.flipDev ?? 0).toFixed(0)}°` : '?';
    console.log(`  ${label.padEnd(36)} flip-rate ${maxRate.toFixed(1)} rad/s  air ${(L?.air ?? p.airTime).toFixed(2)} s  → ${res.padEnd(36)} "${L?.trick ?? ''}" ${scores.join(', ')}`);
  }
}
const which = process.argv[2] || 'both';
if (which !== 'snowboard') bench('ski');
if (which !== 'ski') bench('snowboard');
