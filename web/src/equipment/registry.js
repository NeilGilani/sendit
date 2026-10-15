// Equipment registry (re-exported by equipment/index.js, the public entry point).
//   EQUIPMENT_TYPES                   ['ski', 'snowboard']
//   getEquipmentSpec(type, variant?)  resolved spec (variant id or spec object, falls back to the default)
//   listVariants(type)                [{ id, name, blurb }] for menus / the lobby
//   registerVariant(type, spec)       add a model at runtime (DLC, user presets, colourways)
//   deriveHandling(type, spec)        physics multipliers derived from the geometry (pop, float, grip…)
//   createEquipmentModel(type, variant, opts)  → THREE.Group (see models.js)
//   normalizeType('board') → 'snowboard'
//   validateSpec(type, spec)          → [] or a list of problems (missing / out-of-range fields)
import { SKI_VARIANTS, SNOWBOARD_VARIANTS } from './specs.js';

export const EQUIPMENT_TYPES = ['ski', 'snowboard'];
export const DEFAULT_TYPE = 'ski';
export const DEFAULT_VARIANT = { ski: 'allmountain', snowboard: 'allmountain' };

const REGISTRY = { ski: { ...SKI_VARIANTS }, snowboard: { ...SNOWBOARD_VARIANTS } };

export function normalizeType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'snowboard' || t === 'board' || t === 'sb') return 'snowboard';
  if (t === 'ski' || t === 'skis') return 'ski';
  return DEFAULT_TYPE;
}

/** Nested groups a partial spec can override field by field (e.g. `{ profile: { type: 'rocker' } }`). */
const NESTED = ['graphic', 'profile', 'kick', 'stance'];
function mergeSpec(base, over) {
  const out = { ...base, ...over };
  for (const k of NESTED) if (base[k] || over[k]) out[k] = { ...(base[k] || {}), ...(over[k] || {}) };
  return out;
}

/** Resolve a spec: `variant` may be an id, a full spec object, or a partial override `{ id?, ...fields }`. */
export function getEquipmentSpec(type, variant) {
  const t = normalizeType(type);
  const table = REGISTRY[t];
  if (variant && typeof variant === 'object') {
    const base = table[variant.id] || table[DEFAULT_VARIANT[t]];
    return Object.freeze({ ...mergeSpec(base, variant), type: t });
  }
  const s = table[variant] || table[DEFAULT_VARIANT[t]];
  return Object.freeze({ ...s, type: t });
}

export function listVariants(type) {
  return Object.values(REGISTRY[normalizeType(type)]).map(({ id, name, blurb }) => ({ id, name, blurb }));
}

export function registerVariant(type, spec) {
  if (!spec?.id) throw new Error('registerVariant: spec.id required');
  const t = normalizeType(type);
  const base = REGISTRY[t][DEFAULT_VARIANT[t]];
  const merged = mergeSpec(base, spec);
  const problems = validateSpec(t, merged);
  if (problems.length && typeof console !== 'undefined') console.warn(`registerVariant(${t}, ${spec.id}):`, problems.join('; '));
  REGISTRY[t][spec.id] = merged;
  return REGISTRY[t][spec.id];
}

/**
 * Sanity-check a (merged) spec before it reaches the physics: every number finite and inside a
 * plausible real-world range. Returns a list of human-readable problems ([] = fine).
 */
export function validateSpec(type, spec) {
  const t = normalizeType(type), out = [];
  const num = (path, v, lo, hi) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`${path} missing or not a number`);
    else if (v < lo || v > hi) out.push(`${path} = ${v} outside ${lo}…${hi}`);
  };
  num('length', spec.length, t === 'ski' ? 0.9 : 1.0, t === 'ski' ? 2.15 : 1.9);
  num('tip', spec.tip, 0.06, 0.36); num('waist', spec.waist, 0.05, 0.32); num('tail', spec.tail, 0.06, 0.36);
  if (spec.waist > Math.min(spec.tip, spec.tail)) out.push('waist wider than tip / tail (no sidecut)');
  num('sidecutRadius', spec.sidecutRadius, t === 'ski' ? 8 : 5, t === 'ski' ? 45 : 16);
  num('flex', spec.flex, 0, 1); num('torsion', spec.torsion, 0, 1);
  num('mass', spec.mass, 0.8, 9);
  num('setback', spec.setback ?? 0, -0.1, 0.15);
  const pr = spec.profile || {};
  if (!['camber', 'rocker', 'hybrid', 'flat'].includes(pr.type)) out.push(`profile.type '${pr.type}' unknown`);
  num('profile.camber', pr.camber, 0, 0.02); num('profile.noseRocker', pr.noseRocker, 0, 0.4); num('profile.tailRocker', pr.tailRocker, 0, 0.4);
  num('kick.nose', spec.kick?.nose, 0, 0.2); num('kick.tail', spec.kick?.tail, 0, 0.2);
  if (t === 'snowboard') {
    num('stance.width', spec.stance?.width, 0.35, 0.7);
    num('stance.front', spec.stance?.front, -45, 45); num('stance.back', spec.stance?.back, -45, 45);
  }
  if (!spec.id || !spec.name) out.push('id and name required');
  return out;
}

/**
 * Physics multipliers from the geometry. Every value is ~1 for the reference model of its type so the
 * tunables in config.js stay meaningful; variants nudge them in physically sensible directions.
 */
export function deriveHandling(type, spec) {
  const t = normalizeType(type);
  const ref = REGISTRY[t][DEFAULT_VARIANT[t]];
  const rocker = (spec.profile.noseRocker + spec.profile.tailRocker);
  const refRocker = ref.profile.noseRocker + ref.profile.tailRocker;
  const area = (s) => s.length * (s.tip + s.waist * 2 + s.tail) / 4 * (t === 'ski' ? 2 : 1);
  const camberPop = { camber: 1.06, hybrid: 1.0, flat: 0.96, rocker: 0.92 }[spec.profile.type] ?? 1;
  const refCamberPop = { camber: 1.06, hybrid: 1.0, flat: 0.96, rocker: 0.92 }[ref.profile.type] ?? 1;
  const effEdge = (s) => s.length * (1 - (s.profile.noseRocker + s.profile.tailRocker) * 0.8);
  const swing = (s) => s.mass * s.length * s.length;
  // Clamped so an odd catalogue entry can't make the physics silly (or NaN): ~±40% around the reference.
  const c = (v, lo, hi, fallback = 1) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const h = {
    sidecutRadius: spec.sidecutRadius,
    // Edge hold at high edge angles: torsionally stiff, long effective edges bite harder.
    grip: (0.75 + 0.25 * spec.torsion / ref.torsion) * Math.sqrt(effEdge(spec) / effEdge(ref)),
    // Ollie / jump pop: stiffer flex and camber store more energy.
    pop: (0.85 + 0.15 * spec.flex / ref.flex) * camberPop / refCamberPop,
    // Butter / pivot ease: soft, rockered, short.
    pivot: (1.15 - 0.15 * spec.flex / ref.flex) * (1 + (rocker - refRocker) * 0.8) * Math.sqrt(effEdge(ref) / effEdge(spec)),
    // Stability at speed (less chatter, smaller speed penalty when skidding).
    stability: (0.8 + 0.2 * spec.flex / ref.flex) * Math.sqrt(spec.length / ref.length),
    // Powder float: planform area, rocker and setback lift the nose.
    float: (area(spec) / area(ref)) * (1 + (rocker - refRocker) * 0.9 + ((spec.setback || 0) - (ref.setback || 0)) * 4),
    // Spin response from swing weight (shorter / lighter spins quicker).
    spin: Math.pow(swing(ref) / swing(spec), 0.25),
    twin: !!spec.twin,
  };
  return {
    ...h,
    sidecutRadius: c(h.sidecutRadius, t === 'ski' ? 8 : 5, t === 'ski' ? 45 : 16, ref.sidecutRadius),
    grip: c(h.grip, 0.6, 1.45), pop: c(h.pop, 0.6, 1.4), pivot: c(h.pivot, 0.5, 1.8),
    stability: c(h.stability, 0.6, 1.5), float: c(h.float, 0.5, 2.5), spin: c(h.spin, 0.7, 1.35),
  };
}
