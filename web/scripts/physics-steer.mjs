// Headless steering-feel bench: at a pinned speed on flat snow (each map's physics through the per-map
// hook), measure how the gear answers the controls.
//   resp     s from key press to 63 % of the held turn rate (responsiveness)
//   gear     held full-key turn rate of the gear (°/s); path = the velocity's turn rate, its lateral g, radius
//   skid     skid angle β in the held turn (°) — wash-out at speed
//   tap      heading change from a 0.12 s key tap (°) — size of a small correction
//   stick    path turn rate with the stick held at 30 % / 60 % (°/s) — analog fine control
//   link     slalom (keys swapped every 0.7 s): s from the swap to the turn rate changing sign
//   stop     s from release to the turn stopping (< 6 °/s into the turn)
// Usage: node web/scripts/physics-steer.mjs [ski|snowboard|both]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player } = await import('../src/player.js');
const { RAVENSPIRE_PHYSICS } = await import('../src/maps/ravenspire/tuning.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

const DT = 1 / 60, DEG = Math.PI / 180;
const MAPS = [
  ['Valcrest', undefined, [8, 12, 16]],
  ['Blackspruce', { ski: { maxVelocity: 18 }, snowboard: { maxVelocity: 17.5 } }, [12, 18]],
  ['Ravenspire', RAVENSPIRE_PHYSICS, [18, 24, 30]],
];

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

function ride(type, physics, speed, steerAt, total) {
  const p = new Player(flat(physics), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type); p.fadeThen = () => {}; p.flow?.dispose?.(); p.flow = null;
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, 0, -speed);
  let t = 0, prevH = p.heading;
  const rows = [];
  for (let i = 0; i < Math.round(total / DT); i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: steerAt(t), brake: 0, up: 0, jump: false, tuck: 0 }); };
    p.step(DT);
    p.velocity.setLength(speed);
    t += DT;
    const rate = unwrap(prevH - p.heading) / DT;   // + = turning right
    prevH = p.heading;
    rows.push({ t, rate, path: p.dyn.velYawRate, head: p.heading, skid: p.skidAngle, edge: p.edgeAngle });
  }
  return rows;
}

export function measure(type, physics, v) {
  const hold = ride(type, physics, v, (t) => (t < 1.5 ? 1 : 0), 2.5);
  const held = hold.filter((r) => r.t > 1.0 && r.t <= 1.5);
  const rate = held.reduce((a, r) => a + r.rate, 0) / held.length;
  const path = held.reduce((a, r) => a + r.path, 0) / held.length;
  const resp = hold.find((r) => r.rate >= 0.63 * rate)?.t ?? NaN;
  const skid = held.reduce((a, r) => a + Math.abs(r.skid), 0) / held.length / DEG;
  let stop = 1.5; for (const r of hold) if (r.t > 1.5 && r.rate >= 0.1) stop = r.t;
  const tap = ride(type, physics, v, (t) => (t < 0.12 ? 1 : 0), 1.5);
  const tapDeg = unwrap(tap[0].head - tap.at(-1).head) / DEG + tap[0].rate * DT / DEG;
  const st = ride(type, physics, v, (t) => (t < 1.2 ? 0.3 : 0), 1.2).filter((r) => r.t > 0.8);
  const stick30 = st.reduce((a, r) => a + r.path, 0) / st.length / DEG;
  const s6 = ride(type, physics, v, (t) => (t < 1.2 ? 0.6 : 0), 1.2).filter((r) => r.t > 0.8);
  const stick60 = s6.reduce((a, r) => a + r.path, 0) / s6.length / DEG;
  const sl = ride(type, physics, v, (t) => (Math.floor(t / 0.7) % 2 ? -1 : 1), 2.8);
  const lags = [];
  for (const sw of [1.4, 2.1]) {
    const want = Math.floor(sw / 0.7) % 2 ? -1 : 1;
    const r = sl.find((x) => x.t > sw && x.rate * want > 0);
    if (r) lags.push(r.t - sw);
  }
  return { rate: rate / DEG, path: path / DEG, stick60, lat: path * v / 9.81, radius: v / Math.max(path, 1e-3), resp, skid, tap: tapDeg, stick30, link: lags.reduce((a, b) => a + b, 0) / lags.length, stop: stop - 1.5 };
}

const which = process.argv[2] || 'both';
const types = which === 'both' ? ['ski', 'snowboard'] : [which];
const f = (x, d = 1, w = 7) => Number(x).toFixed(d).padStart(w);
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('physics-steer.mjs')) {
  for (const type of types) {
    console.log(`\n=== ${type} ===`);
    console.log('map          m/s    resp s  gear°/s  path°/s  lat g  radius m  skid°   tap°  stick30/60 path°/s  link s  stop s');
    for (const [name, physics, speeds] of MAPS) {
      for (const v of speeds) {
        const m = measure(type, physics, v);
        console.log(`${name.padEnd(12)} ${String(v).padStart(3)}  ${f(m.resp, 2)}  ${f(m.rate)}  ${f(m.path)}  ${f(m.lat, 2, 5)}  ${f(m.radius, 0, 8)}  ${f(m.skid, 1, 5)}  ${f(m.tap, 1, 5)}  ${f(m.stick30, 1, 9)} ${f(m.stick60, 1, 6)}    ${f(m.link, 2, 6)}  ${f(m.stop, 2, 6)}`);
      }
    }
  }
}
