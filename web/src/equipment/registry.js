// Equipment registry (re-exported by equipment/index.js, the public entry point).
//   EQUIPMENT_TYPES                   ['ski', 'snowboard']
//   getEquipmentSpec(type, variant?)  resolved spec (variant id or spec object, falls back to the default)
//   listVariants(type)                [{ id, name, blurb }] for menus / the lobby
//   registerVariant(type, spec)       add a model at runtime (DLC, user presets, colourways)
//   deriveHandling(type, spec)        physics multipliers derived from the geometry (pop, float, grip…)
//   createEquipmentModel(type, variant, opts)  → THREE.Group (see models.js)
//   normalizeType('board') → 'snowboard'
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

/** Resolve a spec: `variant` may be an id, a full spec object, or a partial override `{ id?, ...fields }`. */
export function getEquipmentSpec(type, variant) {
  const t = normalizeType(type);
  const table = REGISTRY[t];
  if (variant && typeof variant === 'object') {
    const base = table[variant.id] || table[DEFAULT_VARIANT[t]];
    return Object.freeze({ ...base, ...variant, graphic: { ...base.graphic, ...(variant.graphic || {}) }, type: t });
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
  REGISTRY[t][spec.id] = { ...base, ...spec, graphic: { ...base.graphic, ...(spec.graphic || {}) } };
  return REGISTRY[t][spec.id];
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
  return {
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
}
