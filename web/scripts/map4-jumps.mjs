// Voltage Park: every jump's designed window (speeds at the lip, km/h), table, landing and expected air time.
// Usage: node web/scripts/map4-jumps.mjs
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { VoltageCourse } = await import('../src/maps/voltage/course.js');
const { START_X } = await import('../src/maps/voltage/layout.js');
const c = new VoltageCourse();
const kmh = (v) => Math.round(v * 3.6);
console.log('name                 lane    u     vMin  sweet  vMax  (km/h sweet)  knuckle  sweet@  end@   h(deck)  air@sweet');
for (const f of c.features) {
  const J = f.jump; if (!J?.land) continue;
  const L = J.land, la = J.lipA, k = J.knuckle?.a ?? la, sw = L.sweet, end = f.marks.landingEnd?.a ?? sw.a;
  const [x] = f.world(la);
  // air time at the sweet speed: straight flight to the sweet spot (no drag)
  const th = (J.lipDeg ?? J.upDeg) * Math.PI / 180, v = sw.v, vy = v * Math.sin(th) + 1.2 * Math.cos(th), dy = sw.y - J.lipY;
  const t = (vy + Math.sqrt(vy * vy - 2 * 9.81 * dy)) / 9.81;
  const deckH = (f.yAt(k - 1) ?? 0) - c.base(...f.world(k - 1));
  console.log(`${f.name.padEnd(20)} ${String(f.lane).padEnd(7)} ${String(Math.round(x - START_X)).padEnd(5)} ${L.vMin.toFixed(1).padStart(5)} ${sw.v.toFixed(1).padStart(6)} ${L.vMax.toFixed(1).padStart(5)}  (${kmh(sw.v)})${L.short ? ' SHORT' : '      '}   ${(k - la).toFixed(1).padStart(5)}  ${(sw.a - la).toFixed(1).padStart(5)}  ${(end - la).toFixed(1).padStart(5)}  ${deckH.toFixed(1).padStart(5)}   ${t.toFixed(2)} s`);
}
