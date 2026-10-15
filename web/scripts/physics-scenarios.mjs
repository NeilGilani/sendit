// Player-like scenarios on a plain 15° slope (headless): board stop-then-go, edge traverse vs flat-base drift,
// ski held turn. Prints speed / heading / travel / stop / skid traces. Usage: node web/scripts/physics-scenarios.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} }; globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;
const plane = (deg) => { const k = Math.tan(deg * Math.PI / 180); const T = { half: 1e7, getHeight: (x, z) => z * k, getSurface: (x, z, o = new THREE.Vector4()) => o.set(0, 1, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r = 0, o = new THREE.Vector3()) => { const e = Math.max(r, 1); return o.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); }; return T; };
const mk = (type, deg, yaw = 0) => { const p = new Player(plane(deg), null, null, { strength: () => 0, justPressed: () => false }); p.setEquipment(type); p.place(new THREE.Vector3(), yaw); return p; };
const run = (p, sec, fn, log, every = 0.5) => { let t = 0, next = 0; for (let i = 0; i < sec * 60; i++) { p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(t, p)); }; p.step(1 / 60); t += 1 / 60; if (log && t >= next) { next += every; log(t, p); } } };
const L = (label) => (t, p) => console.log(`${label} t${t.toFixed(1)} v${p.speed.toFixed(1)} head${(p.heading * 57.3 % 360).toFixed(0)} trav${p.travelSign} stop${p.stop.toFixed(2)} skid${(p.skidAngle * 57.3).toFixed(0)} vy-dir${(Math.atan2(-p.velocity.x, -p.velocity.z) * 57.3).toFixed(0)}`);
console.log('--- C: board stop then go (15°, heading down the fall line) ---');
{ const p = mk('snowboard', 15); p.velocity.set(0, 0, -10); run(p, 5, (t) => ({ brake: t < 2.2 ? 1 : 0 }), L('C')); }
console.log('--- B: board heel-side traverse, analog 0.35 left, starting across the slope (15°) ---');
{ const p = mk('snowboard', 15, Math.PI / 2); p.velocity.set(-6, 0, 0); run(p, 4, () => ({ steer: -0.35 }), L('B')); }
console.log('--- B2: board flat-base traverse (no input) across the slope ---');
{ const p = mk('snowboard', 15, Math.PI / 2); p.velocity.set(-6, 0, 0); run(p, 3, () => ({}), L('B2')); }
console.log('--- A: ski hold right from 12 m/s straight down 15° ---');
{ const p = mk('ski', 15); p.velocity.set(0, 0, -12); run(p, 4, () => ({ steer: 1 }), L('A')); }
console.log('--- D: carve held over a roller (15°, 1.2 m crest, 14 m/s): no accidental spin on a short natural hop ---');
{
  const k = Math.tan(15 * Math.PI / 180);
  const H = (x, z) => { const a = -z - 40; return z * k + (a > -6 && a < 6 ? 1.2 * Math.cos(a / 6 * Math.PI / 2) ** 2 : 0); };
  const T = { half: 1e7, getHeight: H, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r = 0, o = new THREE.Vector3()) => { const e = Math.max(r, 1); return o.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); };
  for (const type of ['ski', 'snowboard']) for (const steer of [0, 0.5, 1]) {
    const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false }); p.setEquipment(type); p.place(new THREE.Vector3(0, 0, -20), 0); p.velocity.set(0, 0, -14);
    let air = 0, spin = 0;
    run(p, 6, (t, pl) => ({ steer: pl.position.z < -37 ? steer : 0 }), (t, pl) => { if (pl.state === State.AIR) { air = Math.max(air, pl.airTime); spin = Math.max(spin, Math.abs(pl.spinRate)); } }, 1 / 60);
    const L = p.lastLanding || p.lastCrash || {};
    console.log(`D ${type} steer ${steer}: air ${air.toFixed(2)} s, max spin ${spin.toFixed(2)} rad/s → ${p.state === State.CRASH ? 'CRASH' : L.result}`);
  }
}
