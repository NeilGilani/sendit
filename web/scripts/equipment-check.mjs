// Equipment catalogue check (headless): every ski / board spec validates, partial overrides merge
// nested groups field by field, and derived handling stays finite and clamped even for odd data.
// Usage: node web/scripts/equipment-check.mjs   (exit code 1 on failure)
import { EQUIPMENT_TYPES, listVariants, getEquipmentSpec, validateSpec, deriveHandling, registerVariant } from '../src/equipment/registry.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };
const finite = (h) => Object.entries(h).every(([k, v]) => typeof v === 'boolean' || Number.isFinite(v));

for (const t of EQUIPMENT_TYPES) {
  for (const { id } of listVariants(t)) {
    const spec = getEquipmentSpec(t, id);
    const problems = validateSpec(t, spec);
    check(problems.length === 0, `${t}/${id} validates${problems.length ? ': ' + problems.join('; ') : ''}`);
    check(finite(deriveHandling(t, spec)), `${t}/${id} handling is finite`);
  }
}
// Partial override of a nested group keeps the other fields.
const rockered = getEquipmentSpec('snowboard', { id: 'park', profile: { type: 'rocker' } });
check(rockered.profile.type === 'rocker' && Number.isFinite(rockered.profile.noseRocker), 'partial profile override keeps noseRocker');
check(finite(deriveHandling('snowboard', rockered)), 'partial profile override → finite handling');
const paint = getEquipmentSpec('ski', { id: 'slalom', graphic: { top: 0xff0000 } });
check(paint.graphic.top === 0xff0000 && paint.graphic.base === getEquipmentSpec('ski', 'slalom').graphic.base, 'colourway keeps the other graphic fields');
// A silly model is reported and its handling clamped.
const warn = console.warn; let warned = ''; console.warn = (...a) => { warned = a.join(' '); };
const silly = registerVariant('ski', { id: 'test-silly', name: 'Silly', length: 3.5, mass: 0.1, flex: 2 });
console.warn = warn;
check(warned.includes('length') && warned.includes('mass'), `registerVariant warns about bad data (${warned.slice(0, 80)}…)`);
const h = deriveHandling('ski', silly);
check(finite(h) && h.spin <= 1.35 && h.grip <= 1.45 && h.pop <= 1.4, `odd data is clamped (spin ${h.spin.toFixed(2)}, grip ${h.grip.toFixed(2)}, pop ${h.pop.toFixed(2)})`);
console.log(fails ? `\n${fails} failed` : '\nall equipment checks passed');
process.exit(fails ? 1 : 0);
