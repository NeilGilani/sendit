// Voltage Park speed probe: a rider straight down one line of the park (holding v), tucked or standing, popping
// every lip; prints the speed every 25 m, every take-off (speed, km/h), air time, landing zone and the run time.
// Usage: node web/scripts/map4-speed.mjs [ski|snowboard] [zone index 0-8 | u,v] [tuck 0..1]
const L = await import('./map4-lib.mjs');
const { on } = await import('../src/state.js');
const { START_X, FINISH_U } = await import('../src/maps/voltage/layout.js');
const [type = 'ski', where = '0', tuckArg = '1'] = process.argv.slice(2);
const { course, T } = await L.loadPark({ quiet: true });
const p = L.makePlayer(T, type, 'park');
if (where.includes(',')) { const [u, v] = where.split(',').map(Number); p.place({ x: START_X + u, z: v }, -Math.PI / 2); }
else { const z = course.dropZones[+where]; p.place({ x: z.x, z: z.z }, z.heading); }
const v0 = p.position.z, tuck = +tuckArg;
let t = 0, lastU = -1e9, air0 = 0, tk = null;
const log = [];
on('takeoff', () => { tk = { name: course.featureAt(p.position.x, p.position.z), v: p.speed, t }; });
on('landed', (e) => { if (tk && e.air > 0.4) log.push(`  ${String(tk.name ?? 'air').padEnd(18)} lip ${tk.v.toFixed(1)} m/s (${Math.round(tk.v * 3.6)} km/h)  air ${e.air.toFixed(2)} s  ${e.clean ? 'clean' : 'NOT CLEAN'}`); tk = null; });
on('parkLanding', (e) => { log.push(`      → ${e.zone} at ${e.dist.toFixed(0)} m`); });
on('crashed', () => log.push(`  CRASH at u${Math.round(p.position.x - START_X)}`));
p.script = (c, pl) => {
  Object.assign(c, { steer: 0, brake: 0, jump: false, tuck });
  if (pl.state === 1) {
    const want = Math.atan2(-(40), -(v0 - pl.position.z) * 0.6);
    const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    c.steer = Math.max(-1, Math.min(1, -d * 3));
    const a = pl.lipAhead(0.3);
    if (a !== null && a > 0.04) c.jump = true;
  }
};
const speeds = [];
while (t < 150 && p.position.x - START_X < FINISH_U + 10) {
  p.step(1 / 60); t += 1 / 60;
  const u = p.position.x - START_X;
  if (u - lastU >= 25) { speeds.push(`${Math.round(u)}:${p.speed.toFixed(1)}`); lastU = u; }
}
console.log(`${type} from ${where} tuck ${tuck}: ${t.toFixed(1)} s to u${Math.round(p.position.x - START_X)}, avg ${((p.position.x - START_X) / t).toFixed(1)} m/s`);
console.log('  speed by u:', speeds.join(' '));
console.log(log.join('\n'));
