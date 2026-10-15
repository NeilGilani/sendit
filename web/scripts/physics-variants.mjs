// Variant / stance checks: trick names for regular vs goofy, nollie, and how equipment specs change
// the feel (sidecut radius, pop, float, butter). Usage: node web/scripts/physics-variants.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
const { listVariants, deriveHandling, getEquipmentSpec } = await import('../src/equipment/registry.js');
game.mode = Mode.RIDING;
const DT = 1 / 60;
const flat = (deg = 0, surface = [1, 0, 0, 0]) => {
  const k = Math.tan(deg * Math.PI / 180);
  const T = { half: 1e7, getHeight: (x, z) => z * k, getSurface: (x, z, o = new THREE.Vector4()) => o.set(...surface), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r = 0, o = new THREE.Vector3()) => { const e = Math.max(r, 1); return o.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); };
  return T;
};
const input = { strength: () => 0, justPressed: () => false };
const mk = (type, variant, stance, T = flat()) => { const p = new Player(T, null, null, input); p.setEquipment(type, variant); if (stance) p.setStance(stance); p.place(new THREE.Vector3(), 0); return p; };
const run = (p, sec, fn) => { for (let i = 0; i < sec * 60; i++) { p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(i * DT, p)); }; p.step(DT); } };

console.log('--- trick names (ollie on flat at 8 m/s, spin to target) ---');
for (const stance of ['regular', 'goofy']) for (const [up, dir, target, sw] of [[0, -1, 180, false], [0, 1, 180, false], [1, -1, 360, false], [0, 1, 360, true]]) {
  const p = mk('snowboard', 'park', stance);
  p.velocity.set(0, 0, -8);
  if (sw) { p.heading = Math.PI; p.dyn.travel = -1; }
  run(p, 0.5, (t) => ({ jump: t < 0.4, up }));
  run(p, 2.5, (t, pl) => ({ steer: pl.state === State.AIR && Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.12 < target * Math.PI / 180 ? dir : 0 }));
  const L = p.lastLanding || {};
  console.log(`  ${stance.padEnd(8)} ${sw ? 'switch ' : ''}${up ? 'W+Space' : 'Space'} spin ${dir < 0 ? 'left ' : 'right'} ${target}: ${L.result} "${L.trick}"`);
}
console.log('\n--- variants ---');
for (const type of ['ski', 'snowboard']) {
  for (const { id } of listVariants(type)) {
    const spec = getEquipmentSpec(type, id), H = deriveHandling(type, spec);
    // carve radius at 10 m/s full lock, pop height on flat, powder 10° steady speed, butter rotation
    const p = mk(type, id); p.velocity.set(0, 0, -10); let R = 0, n = 0;
    run(p, 1.2, (t, pl) => { if (t > 0.6 && Math.abs(pl.dyn.velYawRate) > 1e-3) { R += pl.speed / Math.abs(pl.dyn.velYawRate); n++; } return { steer: 1 }; });
    const q = mk(type, id); q.velocity.set(0, 0, -6); let h = 0;
    run(q, 2, (t, pl) => { h = Math.max(h, pl.position.y); return { jump: t < 0.5 }; });
    const w = mk(type, id, null, flat(10, [0, 1, 0, 0])); run(w, 40, () => ({}));
    let but = '';
    if (type === 'snowboard') { const b = mk(type, id); b.velocity.set(0, 0, -6); const h0 = b.heading; run(b, 0.6, () => ({ jump: true, steer: 1 })); but = ` butter ${(Math.abs(b.heading - h0) * 57.3).toFixed(0)}°/0.6s`; }
    console.log(`  ${type.padEnd(9)} ${id.padEnd(11)} Rsc ${String(spec.sidecutRadius).padEnd(4)} R@10 ${(R / Math.max(n, 1)).toFixed(1)}m  pop ${h.toFixed(2)}m  powder10° ${w.speed.toFixed(1)}m/s sink ${w.sink.toFixed(2)}${but}  [grip ${H.grip.toFixed(2)} pop ${H.pop.toFixed(2)} float ${H.float.toFixed(2)} pivot ${H.pivot.toFixed(2)} spin ${H.spin.toFixed(2)}]`);
  }
}

console.log('\n--- wind-up (steer while charging, release, no air input) and landing assist ---');
for (const type of ['ski', 'snowboard']) for (const steer of [0, 1]) {
  const p = mk(type, 'allmountain'); p.velocity.set(0, 0, -11);   // above butter speed
  const h0 = p.heading;
  run(p, 0.45, () => ({ jump: true, steer }));
  run(p, 2.0, () => ({}));
  const L = p.lastLanding || {};
  console.log(`  ${type.padEnd(9)} wind-up ${steer ? 'right' : 'none '}: air spin ${(Math.abs(p._spinTotal) * 57.3).toFixed(0)}°, landed ${L.result} dev ${(L.dev ?? 0).toFixed(1)}° "${L.trick}"`);
}
for (const type of ['ski', 'snowboard']) {
  // 12° off at touchdown with the stick released → the assist should settle it.
  const p = mk(type, 'allmountain'); p.velocity.set(0, 0, -10); p.position.y = 0.01;
  run(p, 0.45, (t) => ({ jump: t < 0.4 }));
  p.heading += 12 * Math.PI / 180;
  run(p, 2.0, () => ({}));
  console.log(`  ${type.padEnd(9)} 12° off at take-off, stick released: landed ${p.lastLanding?.result} dev ${(p.lastLanding?.dev ?? 0).toFixed(1)}°`);
}
