// Headless kicker bench: the real Player on a synthetic slope with a features.js-shaped kicker
// (y = H·(a/L)^1.7, a park take-off), approached straight from `run` metres up. Prints air time,
// height, landing impact and the landing result for no pop / pop at the lip / tricks.
// Usage: node web/scripts/physics-kicker.mjs [ski|snowboard|both] [slopeDeg]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;
const scores = [];
on('score', (s) => scores.push(`${s.label} +${s.points}`));
const DT = 1 / 60, TAU = Math.PI * 2;
const slope = Number(process.argv[3] || 16);

function kickerTerrain(L, H, at = -60) {
  const k = Math.tan(slope * Math.PI / 180);
  const base = (x, z) => z * k;
  // Kicker from z = at (start) to at − L (lip), riders travel toward −Z.
  const feat = (x, z) => { const a = at - z; return a > 0 && a < L && Math.abs(x) < 3.5 ? H * Math.pow(a / L, 1.7) : 0; };
  const T = {
    half: 1e7, spacing: 1,
    baseHeight: base,
    getHeight: (x, z) => base(x, z) + feat(x, z),
    getSurface: (x, z, o = new THREE.Vector4()) => o.set(0.5, 0.5, 0, 0),
    getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }),
  };
  T.getNormal = (x, z, r = 0, o = new THREE.Vector3()) => { const e = Math.max(r, 1); return o.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); };
  return T;
}

function ride(type, kick, plan) {
  const T = kickerTerrain(kick.L, kick.H);
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.place(new THREE.Vector3(0, 0, 0), 0);
  scores.length = 0;
  let popped = false, maxH = 0, wasAir = false, lipV = 0;
  for (let i = 0; i < 12 / DT; i++) {
    p.script = (c, pl) => {
      p.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      const f0 = T.getHeight(pl.position.x, pl.position.z) - T.baseHeight(pl.position.x, pl.position.z);
      if (pl.state === State.GROUNDED && plan.pop && !popped) {
        // Charge on the run-in, release right at the lip (the next step would leave the ramp).
        const nz = pl.position.z + pl.velocity.z * DT * 1.5;
        const f1 = T.getHeight(pl.position.x, nz) - T.baseHeight(pl.position.x, nz);
        c.jump = !(f0 > kick.H * 0.6 && f1 < f0 * 0.98);
        if (plan.preload) c.brake = 1;
        if (!c.jump && f0 > 0) { popped = true; lipV = pl.speed; }
      }
      if (pl.state === State.AIR) Object.assign(c, plan.air?.(pl) || {});
    };
    p.step(DT);
    if (p.state === State.AIR) { wasAir = true; maxH = Math.max(maxH, p.position.y - T.getHeight(p.position.x, p.position.z)); if (!lipV) lipV = p.speed; }
    else if (wasAir) break;
  }
  const L = p.lastLanding;
  const res = p.state === State.CRASH ? `CRASH (${p.lastCrash?.reason} yaw ${p.lastCrash?.dev?.toFixed(0)}° pitch ${p.lastCrash?.flipDev?.toFixed(0)}°, spins ${p.lastCrash?.spins})` : L ? `${L.result} yaw ${L.dev.toFixed(0)}° pitch ${(L.flipDev ?? 0).toFixed(0)}°` : '-';
  return `lip ${lipV.toFixed(1)} m/s  air ${(L?.air ?? 0).toFixed(2)} s  height ${maxH.toFixed(1)} m  impact ${(p.landingVy).toFixed(1)} m/s → ${res.padEnd(30)} "${L?.trick ?? ''}" ${scores.join(', ')}`;
}
const flipTo = (dir, turns) => (p) => (Math.abs(p.flip) + Math.abs(p.flipRate) * 0.25 < turns * TAU ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {});
const spinTo = (deg) => (p) => (Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.14 < deg * Math.PI / 180 ? { steer: -1 } : {});

const which = process.argv[2] || 'both';
for (const type of ['ski', 'snowboard']) {
  if (which !== 'both' && which !== type) continue;
  console.log(`\n=== ${type} on ${slope}° ===`);
  for (const kick of [{ name: 'S', L: 6, H: 1.4 }, { name: 'M', L: 9, H: 2.4 }, { name: 'L', L: 12, H: 3.6 }]) {
    console.log(`  kicker ${kick.name}  straight          ${ride(type, kick, {})}`);
    console.log(`  kicker ${kick.name}  pop               ${ride(type, kick, { pop: true })}`);
    console.log(`  kicker ${kick.name}  pop + 360         ${ride(type, kick, { pop: true, air: spinTo(360) })}`);
    console.log(`  kicker ${kick.name}  pop + backflip    ${ride(type, kick, { pop: true, air: flipTo(1, 1) })}`);
    console.log(`  kicker ${kick.name}  preload backflip  ${ride(type, kick, { pop: true, preload: true })}`);
    const cork = type === 'ski' ? 360 : 720;   // skis spin slower (6.4 vs 7.6 rad/s): a ski cork 720 needs more air than these kickers give
    console.log(`  kicker ${kick.name}  pop + cork ${cork}    ${ride(type, kick, { pop: true, air: (p) => ({ ...flipTo(1, 1)(p), ...spinTo(cork)(p) }) })}`);
  }
}
