// Crash severity (docs/body.md § Crash ragdoll → Severity). The crash / no-crash decision is the riding physics'
// (player.land, grind.js, collide / hitWall): this only grades a crash that has already happened, from what the
// game knows at that moment, so the ragdoll can show a small mistake as a small fall and keep the full tumble for
// genuinely big ones.
//
//   s = 1 − Π (1 − wᵢ · tᵢ)      (a soft "or": any one big factor makes a big crash, several medium ones add up)
//
//   t_angle  how far past the landing limit the rider was: 0 right at the crash limit (a near miss), 1 at 90°+ beyond
//            (pitch: flipDev past flipLandStumble; yaw: dev past landCrash / landSlide)
//   t_impact normal speed into the slope (m/s): smoothstep 3 → 14
//   t_spin   trunk spin left at the crash (rad/s, tracked from the animated frames): smoothstep 2 → 9
//   t_speed  speed (m/s): smoothstep 6 → 24
//   cause    trees / rocks / walls are never small (floor 0.4, + 0.4 with speed); a rail bail sideways off the rail
//            is at most medium; a cliff drop (reason 'impact') is graded by its impact.
// Tiers: small < RAGDOLL.tiers.small, medium < RAGDOLL.tiers.big, big above.
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEG = 180 / Math.PI;

/**
 * crash = player.lastCrash ({ reason, impact, dev, flipDev, … }; fields may be missing), kind = the 'crashed'
 * event's kind, v / w = the trunk's velocity / spin at the crash, n = the snow's normal there,
 * lim = { flipStumble, yawCrash } in degrees (the equipment's landing limits, read only), C = RAGDOLL.
 * Returns { s, tier, t: { angle, impact, spin, speed }, vn }.
 */
export function crashSeverity({ crash = {}, kind = 'landing', v, w, n, lim = {}, C }) {
  const W = C.severityWeights || { angle: 0.6, impact: 0.75, spin: 0.4, speed: 0.35 };
  const reason = crash?.reason;
  const vn = Math.max(0, -(v.x * n.x + v.y * n.y + v.z * n.z), crash?.impact || 0);
  const speed = Math.hypot(v.x, v.y, v.z);
  const spin = Math.hypot(w.x, w.y, w.z);
  let angle = 0;
  const flipLim = lim.flipStumble ?? 42, yawLim = lim.yawCrash ?? 38;
  if (reason === 'pitch') angle = ss(0, 1, ((crash.flipDev ?? flipLim + 30) - flipLim) / 90);
  else if (reason === 'yaw') angle = ss(0, 1, ((crash.dev ?? yawLim + 25) - yawLim) / 60);
  const t = { angle, impact: ss(3, 14, vn), spin: ss(2, 9, spin), speed: ss(6, 24, speed) };
  let s = 1 - (1 - W.angle * t.angle) * (1 - W.impact * t.impact) * (1 - W.spin * t.spin) * (1 - W.speed * t.speed);
  const k = kind || 'landing';
  if (/tree|rock|tower|post|wall|fence/.test(k)) s = Math.max(s, 0.4 + 0.4 * ss(9, 16, speed));
  if (k === 'rail' && reason === 'balance') s = Math.min(s, 0.5);
  s = Math.min(1, Math.max(0, s));
  const T = C.tiers || { small: 0.3, big: 0.62 };
  const tier = s < T.small ? 'small' : s < T.big ? 'medium' : 'big';
  return { s, tier, t, vn, speed, spin, angleDeg: reason === 'pitch' ? crash.flipDev : crash.dev };
}

/** Linear blend of a per-tier setting [small, medium, big] at severity s (C.tiers boundaries; flat inside a tier's core). */
export function bySeverity(arr, s, C) {
  if (!Array.isArray(arr)) return arr;
  const T = C.tiers || { small: 0.3, big: 0.62 };
  // Anchors: the small value up to the middle of the small band, the medium value mid-band, the big one at 0.85+.
  const a0 = T.small * 0.5, a1 = (T.small + T.big) / 2, a2 = Math.max(T.big + 0.05, 0.85);
  if (s <= a0) return arr[0];
  if (s <= a1) return arr[0] + (arr[1] - arr[0]) * ss(a0, a1, s);
  if (s <= a2) return arr[1] + (arr[2] - arr[1]) * ss(a1, a2, s);
  return arr[2];
}

export { DEG };
