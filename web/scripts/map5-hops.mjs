// Dragonback (map 5) hop lab: every ridge-to-ridge hop ridden at several entry speeds on skis and on a board
// (real Player physics on the map's grid). The rider is launched at the spur's root at the entry speed, rides
// the spur tucked and flies the kicker (no pop: the kick does it); we report
// where it lands relative to the target ridge's crest, the air time, impact and grade.
// A hop passes at a speed when it lands clean (not sketchy, no crash) on the target ridge (ridge-hop scored).
// Usage: node web/scripts/map5-hops.mjs [hop name | all] [speeds = 20,24,28,32] [--check]
//   --check: exit 1 unless every hop lands on its target on both gears at ≥ 2 of the speeds, including 24 m/s
const { ride, course } = await import('./map5-ride.mjs');
const { State } = await import('../src/player.js');
const { START_X } = await import('../src/maps/dragonback/layout.js');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const check = process.argv.includes('--check');
const which = args[0] && args[0] !== 'all' ? args[0].split(',') : course.hops.map((h) => h.name);
const speeds = (args[1] || '20,24,28,32').split(',').map(Number);

/** One hop at one entry speed: launched at the spur's root along it, tucked, flies the kicker. */
export function hopRun(h, type, speed) {
  const sp = h.spur, to = h.toRidge;
  const u0 = sp.u0 + 2, dir = (sp.crestAt(sp.u0 + 12) - sp.crestAt(sp.u0 + 2)) / 10;
  const line = { name: h.name, pts: [[u0, `@${sp.id}`], [sp.u1, `@${sp.id}`], [h.land + 10, `@${to.id}`], [h.land + 80, `@${to.id}`]] };
  const r = ride(type, null, 'send', {
    line, start: [u0, sp.crestAt(u0), Math.atan2(-1, -dir)], speed, endU: h.land + 70, gain: 2.2, kct: 1.5,   // a rider committed to the spur
    script: (c) => { c.jump = false; },
  });
  const air = r.airs.find((a) => !a.crash && a.feature === h.name && a.air > 0.5) || null;
  const hop = r.hops.find((x) => x.to === to.name) || null;
  const crash = r.airs.find((a) => a.crash && a.u < h.land + 60);
  const landed = air ? { u: air.u, dv: air.v - to.crestAt(air.u) } : null;
  return { type, speed, air, hop, crash, landed, ok: !!hop && !crash && air?.grade !== 'sketchy' };
}

if (process.argv[1] && process.argv[1].endsWith('map5-hops.mjs')) {
  let bad = 0;
  for (const name of which) {
    const h = course.hopByName[name];
    console.log(`\n${h.name}: ${h.fromRidge.name} → ${h.toRidge.name}  spur u${h.spur.u0}–${h.spur.u1}, kicker H ${h.spur.heightAt(h.spur.u1 - 1).toFixed(0)} m, target crest H ${h.toRidge.heightAt(h.land).toFixed(0)} m at u${h.land}`);
    for (const type of ['ski', 'snowboard']) {
      const res = speeds.map((s) => hopRun(h, type, s));
      for (const x of res) {
        const a = x.air;
        console.log(`  ${type.padEnd(9)} ${String(x.speed).padStart(2)} m/s: ${x.ok ? 'OK  ' : 'miss'} ${a ? `in ${a.air.toFixed(2)} s, ${Math.hypot(a.u - a.tu, a.v - a.tv).toFixed(0)} m, drop ${a.drop.toFixed(0)} m, impact ${a.impact.toFixed(1)}, ${a.grade}` : 'no air off the kicker'}` +
          `${x.landed ? `  landed u${x.landed.u.toFixed(0)} ${x.landed.dv >= 0 ? '+' : ''}${x.landed.dv.toFixed(0)} m from the crest` : ''}${x.crash ? `  CRASH ${x.crash.why}` : ''}`);
      }
      const okN = res.filter((x) => x.ok).length;
      if (okN < 2 || !res.find((x) => x.speed === 24)?.ok) bad++;
    }
  }
  if (check) { console.log(bad ? `\nFAIL: ${bad} hop/gear combinations miss` : '\nPASS: every hop lands'); process.exit(bad ? 1 : 0); }
}
