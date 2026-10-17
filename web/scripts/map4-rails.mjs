// Voltage Park (map 4) rail check: every rail / box / tube, ridden straight on from its approach (on its axis,
// at a park speed, no pop), both gear: does it lock on, how far does it carry, does the exit ride away?
// Usage: node web/scripts/map4-rails.mjs [speed m/s] [--check]   (exit 1 if a rail doesn't lock at that speed)
const L = await import('./map4-lib.mjs');
const { on } = await import('../src/state.js');
const { course, T } = await L.loadPark({ quiet: true });
const speedArg = Number(process.argv.find((a) => /^\d/.test(a)) || 8);
let fails = 0;
for (const type of ['ski', 'snowboard']) {
  for (const r of course.rails) {
    const res = [];
    for (const sp of [speedArg - 2, speedArg, speedArg + 2]) {
      const p = L.makePlayer(T, type, 'park');
      const p0 = r.pts[0], p1 = r.pts[1];
      const dx = p1[0] - p0[0], dz = p1[2] - p0[2], l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l;
      const back = 9;
      p.place({ x: p0[0] - fx * back, z: p0[2] - fz * back }, Math.atan2(-fx, -fz));
      const n = p.groundNormal;
      p.velocity.set(fx, 0, fz).addScaledVector(n, -(fx * n.x + fz * n.z)).normalize().multiplyScalar(sp);
      let locked = null, dist = 0, end = null, crash = false, landed = null;
      const offs = [on('grindStart', (e) => { if (!locked) locked = e.trick; }), on('grindEnd', (e) => { dist = e.dist; end = e.reason; }), on('crashed', () => { crash = true; }), on('landed', (e) => { if (locked && !landed) landed = e.result; })];
      p.script = (c, pl) => {
        Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
        const g = pl.grind.g;
        if (g) c.steer = Math.max(-1, Math.min(1, -(2.2 * g.b + 0.7 * g.bv)));
      };
      for (let t = 0; t < 6; t += 1 / 60) { p.step(1 / 60); if (end && (p.state === 1 || crash)) break; }
      for (const o of offs) o();
      p.grind.dispose();
      res.push(locked ? `${sp}:${dist.toFixed(1)}m/${end}${crash ? '/CRASH' : landed && landed !== 'clean' ? '/' + landed : ''}` : `${sp}:—`);
      if (sp === speedArg && (!locked || crash)) fails++;
    }
    console.log(`${type.padEnd(9)} ${r.name.padEnd(20)} ${r.kind.padEnd(5)} len ${r.segs ? '' : ''}${res.join('  ')}`);
  }
}
console.log(fails ? `${fails} rail ride(s) failed at ${speedArg} m/s` : `all rails lock and ride at ${speedArg} m/s`);
if (process.argv.includes('--check') && fails) process.exit(1);
