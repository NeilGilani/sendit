// Dragonback (map 5) trails: measures every trail's length and vertical (start → the finish line, along its line)
// and checks its start (on the snow, inside the tile, not on a rock face). Prints the rows for layout.js / docs.
// Usage: node web/scripts/map5-trails.mjs [--check]
const { DragonbackCourse } = await import('../src/maps/dragonback/course.js');
const { TRAILS, RIDE_LINES, START_X, FINISH_U, TILE } = await import('../src/maps/dragonback/layout.js');
const c = new DragonbackCourse();
let bad = 0;
for (const [id, name, diff, line, , , featured] of TRAILS) {
  const s = c.trailSpawn(id) ?? c.spawnPoint();
  const u0 = s.x - START_X;
  const pts = c.linePoints(RIDE_LINES[line]).filter(([u]) => u >= u0 - 1 && u <= FINISH_U);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], c.height(START_X + pts[i][0], pts[i][1]) - c.height(START_X + pts[i - 1][0], pts[i - 1][1]));
  const end = pts[pts.length - 1];
  const vert = c.height(s.x, s.z) - c.height(START_X + end[0], end[1]);
  const e = 2, a = c.height(s.x + e, s.z) - c.height(s.x - e, s.z), b = c.height(s.x, s.z + e) - c.height(s.x, s.z - e);
  const slope = Math.atan(Math.hypot(a, b) / (2 * e)) * 180 / Math.PI;
  const ok = Number.isFinite(s.x + s.z + s.heading) && Math.abs(s.x) < TILE.size / 2 - 50 && Math.abs(s.z) < TILE.size / 2 - 50 && slope < 44;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(16)} ${name.padEnd(20)} ${diff.padEnd(12)} start u${u0.toFixed(0)} v${s.z.toFixed(0)} (${slope.toFixed(0)}°)  length ${Math.round(len / 10) * 10} m  vertical ${Math.round(vert / 10) * 10} m${featured ? '  ★' : ''}`);
}
if (process.argv.includes('--check')) process.exit(bad ? 1 : 0);

// --ride: the line bot rides every trail from its own start to the finish, on skis and on a board.
if (process.argv.includes('--ride')) {
  process.argv[1] = 'x';
  const R = await import('./map5-ride.mjs');
  let fails = 0;
  for (const [id, , , line] of TRAILS) for (const ty of ['ski', 'snowboard']) {
    const s = R.course.trailSpawn(id);
    const r = R.ride(ty, line, 'send', s ? { start: [s.x - START_X, s.z, s.heading], speed: 4 } : {});
    const ok = r.finished && r.crashes <= 1;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ride ${id.padEnd(16)} ${ty.padEnd(9)} ${r.finished ? 'finished' : 'DNF'} ${r.time}s  ${(r.avg * 2.237).toFixed(0)} mph  crashes ${r.crashes}  goals ${r.goals.join(', ') || '-'}`);
  }
  process.exit(fails ? 1 : 0);
}
