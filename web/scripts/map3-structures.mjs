// Ravenspire buildings: are the walls solid and the roofs rideable? Headless scenarios with the real
// Player physics on the map's terrain (grid + roofs + walls, as in map3-ride.mjs).
//   1. ride square into a wall at ground level, slow → bounced off, not on the roof
//   2. ride square into a wall fast → knocked down ('wall' crash), not on the roof
//   3. graze a wall at a shallow angle → slide along it, keep most speed
//   4. drop onto the station roof from above (off the Station Cliff) → land on the roof, ride off the eave
//   5. ride down the drift onto the station roof → ride the roof, air off the eave
//   6. hit the refuge's chimney → blocked
// Usage: node web/scripts/map3-structures.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { makeTerrain } = await import('./map3-ride.mjs');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;
const T = makeTerrain();
const course = T.course;
const st = (id) => course.structures.find((s) => s.id === id);
const DT = 1 / 60;
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };

function rider(type = 'ski') {
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = () => {};
  p.flow?.dispose(); p.flow = null;
  return p;
}
/** Place on the ground at world (x, z) moving with velocity (vx, vz) along the slope. */
function launch(p, x, z, vx, vz) {
  p.place({ x, z }, Math.atan2(-vx, -vz));
  const n = T.getNormal(x, z, 1.4, new THREE.Vector3());
  const v = new THREE.Vector3(vx, 0, vz);
  v.addScaledVector(n, -v.dot(n)).normalize().multiplyScalar(Math.hypot(vx, vz));
  p.velocity.copy(v); p.speed = v.length();
  p.script = (c) => { c.tuck = 0; };
}
const onRoof = (p) => course.heightAt(p.position.x, p.position.z) !== null && p.position.y > T.baseHeight(p.position.x, p.position.z) + 0.5;

for (const type of ['ski', 'snowboard']) {
  const S = st('station');
  // 1 & 2: square into the long side wall (+b side), at ground level.
  for (const [speed, label] of [[6, 'slow'], [16, 'fast']]) {
    const p = rider(type);
    const [x, z] = S.world(0, S.rw + 9);
    launch(p, x, z, -S.bx * speed, -S.bz * speed);
    let crashed = false, maxRoof = false, minDist = Infinity;
    for (let i = 0; i < 120; i++) {
      p.step(DT);
      if (p.state === State.CRASH) crashed = true;
      if (onRoof(p)) maxRoof = true;
      const [, b] = S.local(p.position.x, p.position.z);
      minDist = Math.min(minDist, Math.abs(b) - S.rw);
    }
    check(`${type}: ${label} into the station wall`, !maxRoof && minDist > -0.1 && (speed > 9 ? crashed : !crashed), `crashed ${crashed}, on roof ${maxRoof}, closest ${minDist.toFixed(2)} m outside the roof edge, last crash ${p.lastCrash?.reason ?? '-'}`);
  }
  // 3: graze the wall at ~12°.
  {
    const p = rider(type);
    const [x, z] = S.world(-S.hl + 8, S.rw + 2.0);   // past the drift (which really does ramp onto the roof)
    const a = 12 * Math.PI / 180, sp = 14;
    const dx = S.ax * Math.cos(a) - S.bx * Math.sin(a), dz = S.az * Math.cos(a) - S.bz * Math.sin(a);
    launch(p, x, z, dx * sp, dz * sp);
    let crashed = false, roof = false;
    for (let i = 0; i < 90; i++) { p.step(DT); if (p.state === State.CRASH) crashed = true; if (onRoof(p)) roof = true; }
    check(`${type}: graze the station wall`, !crashed && !roof && p.speed > 8, `crashed ${crashed}, on roof ${roof}, speed ${p.speed.toFixed(1)} m/s`);
  }
  // 4: off the Station Cliff toward the roof at 20 m/s (pop at the lip).
  {
    const p = rider(type);
    const lipU = 1418, x0 = -1260 + lipU - 30, z0 = S.z;
    launch(p, x0, z0, 18, 0);
    let roofT = 0, landedOnRoof = false, crashed = false, offEave = false;
    let wasAir = false;
    for (let i = 0; i < 60 * 9; i++) {
      const u = p.position.x + 1260;
      p.script = (c) => { c.tuck = 1; c.jump = u < lipU - 2; };
      p.step(DT);
      if (p.state === State.CRASH) crashed = true;
      if (wasAir && p.state === State.GROUNDED && onRoof(p)) landedOnRoof = true;
      if (p.state === State.GROUNDED && onRoof(p)) roofT += DT;
      if (roofT > 0 && p.state === State.AIR && !onRoof(p)) offEave = true;
      wasAir = p.state === State.AIR;
    }
    check(`${type}: drop off the Station Cliff onto the roof`, landedOnRoof && !crashed, `landed on roof ${landedOnRoof}, on the roof ${roofT.toFixed(2)} s, off the eave ${offEave}, crashed ${crashed}, last ${JSON.stringify(p.lastLanding?.result)} impact ${p.lastLanding?.impact?.toFixed(1)}`);
  }
  // 5: ride down the drift onto the roof (slow approach).
  {
    const p = rider(type);
    const [x, z] = S.world(-S.hl - 22, 0);
    launch(p, x, z, S.ax * 9, S.az * 9);
    let roofT = 0, crashed = false, air = 0;
    for (let i = 0; i < 60 * 8; i++) { p.step(DT); if (p.state === State.CRASH) crashed = true; if (p.state === State.GROUNDED && onRoof(p)) roofT += DT; if (p.state === State.AIR && roofT > 0) air += DT; }
    check(`${type}: ride the drift onto the roof and off the eave`, roofT > 0.5 && !crashed && air > 0.2, `on the roof ${roofT.toFixed(2)} s, air after ${air.toFixed(2)} s, crashed ${crashed}`);
  }
  // 6: the refuge chimney (ride along the roof into it).
  {
    const R = st('refuge');
    const p = rider(type);
    const c = R.chim;
    const [x, z] = R.world(c.a, c.b - 8);
    p.place({ x, z }, 0);
    p.position.y = R.roofY(c.a, c.b - 8) + R.snowAt(c.a, c.b - 8) + 0.05;
    p.velocity.set(R.bx * 8, 0, R.bz * 8); p.speed = 8;
    let hit = false;
    for (let i = 0; i < 90; i++) {
      p.step(DT);
      const [a, b] = R.local(p.position.x, p.position.z);
      if (Math.abs(a - c.a) < c.half && Math.abs(b - c.b) < c.half && p.position.y < c.top) hit = true;
    }
    check(`${type}: refuge chimney is solid`, !hit, `inside the chimney ${hit}`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
