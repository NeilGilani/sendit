// The baggy freeride outfit as procedural shells around the Quaternius body (bind pose, metres).
// Each piece samples the body's outline (body.js), smooths it into fabric, adds ease (how far the
// cloth stands off the skin), drape and folds, and copies skin weights from the nearest skin so the
// shell follows the same bones the animation drives. See docs/character.md for the numbers.
//
// Piece ids (aG.x in the shader): 0 jacket body, 1 sleeve, 2 pant leg, 3 collar, 4 stowed hood,
// 5 gaiter, 6 mitt, 7 gauntlet, 8 hood worn up.
import * as THREE from 'three';
import { bodyRings, hang, sweep, skinPiece, mergePieces, frame, pnoise, vnoise, smooth, bump } from './tube.js';
import { helmetFit, keyed, grid } from './helmet.js';

export const PIECE = { jacket: 0, sleeve: 1, pants: 2, collar: 3, hood: 4, gaiter: 5, mitt: 6, gauntlet: 7, hoodUp: 8 };
const TAU = Math.PI * 2;

/**
 * The pants' trunk (waist, hips and seat, above the crotch) as one superellipse per height, centred on
 * the body's mid-line: `cut.seat = { waist, hip }` = [half width, front depth, back depth] at the waist
 * (cut.rise) and the hips (0.93). Each pant leg takes its half of it, so the two legs meet flush at the
 * centre front and back and read as one pair of pants with a real seat. Returns { dims(t), inside(x, z, t) }.
 */
function pantsTrunk(cut) {
  const S = cut.seat, rise = cut.rise ?? 1.08, crotch = cut.crotch ?? 0.84, yHip = 0.93, cz = -0.022, n = 2.3;
  const dims = (t) => {
    if (t >= rise) return S.waist;
    if (t >= yHip) return S.waist.map((v, i) => S.hip[i] + (v - S.hip[i]) * smooth(yHip, rise, t));
    // Below the hips the front curves in to the crotch and the seat rounds under.
    const f = smooth(yHip, crotch - 0.04, t);
    return [S.hip[0] * (1 - 0.05 * f), S.hip[1] * (1 - 0.22 * f), S.hip[2] * (1 - 0.18 * f)];
  };
  const inside = (x, z, t) => {
    const [hw, dF, dB] = dims(t), dz = z - cz;
    return Math.pow(Math.abs(x) / hw, n) + Math.pow(Math.abs(dz) / (dz > 0 ? dF : dB), n) <= 1;
  };
  return { dims, inside, rise, crotch, cz };
}

/** Distance from (ox, oz) along (dx, dz) to the edge of a convex region `inside(x, z)` (bisection). */
function rayEdge(ox, oz, dx, dz, inside, rMax = 0.5) {
  let a = 0, b = rMax;
  for (let i = 0; i < 22; i++) {
    const m = (a + b) / 2;
    if (inside(ox + dx * m, oz + dz * m)) a = m; else b = m;
  }
  return a;
}

/** Radius of a ring (polar around c in x/z, θ = 0 toward +z) in the direction of world point (x, z). */
function ringRadiusToward(ring, x, z) {
  const S = ring.r.length;
  const th = Math.atan2(x - ring.c.x, z - ring.c.z);
  const f = ((((th / TAU) % 1) + 1) % 1) * S, k0 = Math.floor(f) % S, fx = f - Math.floor(f);
  return ring.r[k0] * (1 - fx) + ring.r[(k0 + 1) % S] * fx;
}

/**
 * Build the outfit geometry. `cut` (from outfits.js) sets lengths and ease:
 *   { hemFront, hemBack, hemFlare, jacketEase, sleeveEase, pantsEase, cuffY, stack, gaiter, hood, mitts }
 */
export function buildOutfitGeometry(body, cut) {
  const pieces = [];
  const B = (re) => body.bones(re);
  const J = body.joint;

  let collarRings = null, jacketRings = null, jacketPiece = null, bibPiece = null;
  const legPieces = [], sleevePieces = [];
  // Target sleeve radius along the arm (|x| in the T-pose): the fit's upper / elbow / forearm / cuff.
  const SL = cut.sleeve;
  const sleeveKeys = [[0.2, SL.upper * 0.98], [0.3, SL.upper * 1.02], [0.46, SL.elbow], [0.58, SL.forearm], [cut.sleeveEnd - 0.03, SL.cuff], [1, SL.cuff]];
  const sleeveR = (t) => {
    let i = 0;
    while (i < sleeveKeys.length - 2 && sleeveKeys[i + 1][0] < t) i++;
    const [a, ra] = sleeveKeys[i], [b, rb] = sleeveKeys[i + 1];
    const base = ra + (rb - ra) * smooth(a, b, t);
    // A layered sleeve (prototype tee over a hoodie): the outer sleeve ends at `at`, the under layer's
    // narrower sleeve carries on to the cuff.
    const SLL = cut.sleeveLayer;
    if (!SLL) return base;
    const inner = THREE.MathUtils.lerp(SLL.r, SL.cuff, smooth(SLL.at + 0.03, cut.sleeveEnd - 0.03, t));
    return THREE.MathUtils.lerp(base, inner, smooth(SLL.at - 0.002, SLL.at + 0.012, t));
  };
  // ---------------------------------------------------------------- collar (zipped to the chin)
  {
    const segs = 40;
    const bones = B(/^(neck_01)$/);
    const rings = collarRings = bodyRings(body, {
      axis: 'y', t0: 1.52, t1: cut.collarTop, rings: 10, segs, half: 0.025, bones,
      axisPoint: (t) => new THREE.Vector3(0, t, -0.02),
      filter: (x) => Math.abs(x) < 0.1,
      centre: (t, c) => new THREE.Vector3(0, t, c.z),
      smoothA: 4, smoothT: 4, minEase: 0.02,
      ease: (t, th) => (cut.collarEase ?? 0.02) + smooth(1.56, cut.collarTop, t) * 0.008 + Math.max(0, Math.cos(th)) * 0.008,
      post: (rings, S) => {
        // A collar is a smooth funnel: lean toward the widest outline over its height.
        const mx = new Float32Array(S);
        for (const r of rings) for (let k = 0; k < S; k++) mx[k] = Math.max(mx[k], r.r[k]);
        for (const r of rings) for (let k = 0; k < S; k++) r.r[k] = THREE.MathUtils.lerp(r.r[k], mx[k], 0.4);
      },
    });
    pieces.push(sweep(rings, { id: PIECE.collar, side: 0, ...frame('y'), lipEnd: true, skinBones: B(/^(neck_01|spine_03|Head)$/), anchor: { bone: body.bone('spine_03'), y0: 1.57, y1: 1.61 } }));
  }

  // ---------------------------------------------------------------- jacket body
  // Two zones: the yoke (shoulders, upper back, top of the chest) follows the body closely, as every
  // modern cut does; below it the shell takes the fit's target cross-section (cut.torso), a superellipse
  // per height that hangs straight from the chest and shoulder blades. Volume sits low (waist, seat, hem),
  // not on the shoulders. The shell never comes closer than 2.6 cm inside the unshrunk skin (the body
  // material pulls covered skin in by ~4 cm), so a target smaller than the body just follows it.
  {
    const segs = 56;
    const hemF = cut.hemFront, hemB = cut.hemBack;
    const top = 1.575, bot = hemF;   // the rings end at the front hem; the back moves by hemB − hemF
    const T = cut.torso, folds = cut.folds ?? 1;
    const bones = B(/^(pelvis|spine_0[123]|neck_01|clavicle_[lr]|upperarm_[lr]|thigh_[lr])$/);
    const yChest = 1.38, yWaist = 1.12;
    const dims = (t) => {
      const mix3 = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
      if (t >= yChest) return T.chest;
      if (t >= yWaist) return mix3(T.waist, T.chest, smooth(yWaist, yChest, t));
      return mix3(T.hem, T.waist, smooth(bot, yWaist, t));
    };
    const MIN = -0.058;
    const rings = bodyRings(body, {
      axis: 'y', t0: top, t1: bot, rings: 62, segs, half: 0.03, bones,
      axisPoint: (t) => new THREE.Vector3(0, t, 0),
      filter: (x, y, z, b) => (b.startsWith('upperarm') ? Math.abs(x) < 0.2 : b.startsWith('neck') ? y < 1.56 : true),
      centre: (t, c) => new THREE.Vector3(0, t, c.z),
      smoothA: 8, smoothT: 5, minEase: MIN,
      ease: (t, th) => cut.shoulder + ((1 - Math.cos(th)) / 2) * 0.004,
      post: (rings, S) => {
        // The whole shell is the fit's cross-section, including the yoke: from the chest up the width and
        // depths round off over the shoulders to the neck along a soft, dropped shoulder line (the fabric
        // bridges from the neck to the upper arm instead of hugging the deltoids and traps).
        const neck = [0.085, 0.076, 0.072], yS = cut.shoulderY ?? 1.43;
        for (const r of rings) {
          const [hw0, dF0, dB0] = dims(r.t), n = T.n ?? 2.4;
          const u = Math.min(1, Math.max(0, (r.t - yS) / (top - yS)));
          const rnd = Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2)));
          const hw = neck[0] + (hw0 - neck[0]) * rnd;
          const dF = neck[1] + (dF0 - neck[1]) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.6)));
          const dB = neck[2] + (dB0 - neck[2]) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 3.0)));
          // The skin limit is max-filtered around the ring: where the shell rests on the body it bridges
          // over the grooves between muscles instead of showing them.
          // Below the waist the skin is the pants zone, pulled in only ~2.7 cm: less allowance there.
          const minAt = THREE.MathUtils.lerp(-0.02, MIN, smooth(0.98, 1.1, r.t));
          const lim = new Float32Array(S);
          for (let q = 0; q < S; q++) { let m = -1; for (let d = -5; d <= 5; d++) m = Math.max(m, r.raw[(q + d + S) % S]); lim[q] = m; }
          for (let q = 0; q < S; q++) {
            const th = (q / S) * TAU, s = Math.abs(Math.sin(th)), c = Math.cos(th);
            const tr = 1 / Math.pow(Math.pow(s / hw, n) + Math.pow(Math.abs(c) / (c > 0 ? dF : dB), n), 1 / n);
            // (less allowance on the shoulder tops: the clavicles lift there in a crouch)
            r.r[q] = Math.max(tr + cut.shoulder * u, lim[q] + minAt + 0.022 * smooth(1.42, 1.48, r.t) * smooth(0.4, 0.75, s));
          }
        }
        // The back hangs straight from the shoulder blades: below 1.5 a back radius may only shrink a
        // little per metre going down (no crease where the yoke meets the body of the shell).
        for (let i = 1; i < rings.length; i++) {
          const a = rings[i - 1], b = rings[i];
          if (b.t > 1.5) continue;
          const dt = Math.abs(b.t - a.t);
          for (let q = 0; q < S; q++) {
            const back = smooth(-0.1, -0.6, Math.cos((q / S) * TAU));
            if (back > 0) b.r[q] = Math.max(b.r[q], THREE.MathUtils.lerp(b.r[q], a.r[q] - 0.12 * dt, back));
          }
        }
        // Neckline: the top of the shell tucks under the collar (which is sewn on over it).
        for (const r of rings) {
          if (r.t < 1.525) continue;
          const cr = collarAt(collarRings, r.t, S);
          const w = smooth(1.525, 1.56, r.t);
          for (let q = 0; q < S; q++) r.r[q] = THREE.MathUtils.lerp(r.r[q], Math.min(r.r[q], cr[q] - 0.006), w);
        }
        // Hem: a slight flare (shells), or a rib / drawcord pulling it in with the fabric blousing above.
        const fl = cut.hemFlare ?? 0;
        for (const r of rings) {
          const f = fl >= 0 ? smooth(bot + 0.12, bot, r.t) * fl + 0.0045 * bump(r.t, bot + 0.085, 0.065)
            : fl * smooth(bot + 0.075, bot + 0.02, r.t) - fl * 0.45 * bump(r.t, bot + 0.12, 0.07);
          for (let k = 0; k < S; k++) r.r[k] = Math.max(r.r[k] + f, r.raw[k] + THREE.MathUtils.lerp(-0.02, MIN, smooth(0.98, 1.1, r.t)));
        }
        // The pants' waist and seat sit inside the jacket's lower body: it always clears them by a few cm,
        // so the full-rise pants never poke through the hem (the hem hangs over the hips, not on them).
        if (cut.seat) {
          const PT = pantsTrunk(cut), clear = cut.seatClear ?? 0.028;
          for (const r of rings) {
            if (r.t > PT.rise + 0.02) continue;
            const fade = smooth(PT.rise + 0.02, PT.rise - 0.04, r.t);
            for (let q = 0; q < S; q++) {
              const th = (q / S) * TAU, dx = Math.sin(th), dz = Math.cos(th);
              const e = rayEdge(r.c.x, r.c.z, dx, dz, (x, z) => PT.inside(x, z, Math.min(r.t, PT.rise)));
              r.r[q] = Math.max(r.r[q], (e + clear) * fade + r.r[q] * (1 - fade));
            }
          }
        }
        // Prototype round 2 (cut.straightBack, character/proto.js): the back falls in one straight line
        // from the shoulder blades to the hem. In the side view the back-most point of every ring below
        // the blades is pushed out to the taut line (convex hull) over the blades, the seat (with the
        // pants' clearance) and a plumb line from the blades, so the shell bridges the small of the back
        // instead of coming in at the waist and flaring out over the seat.
        if (cut.straightBack) {
          const y0 = cut.straightBack.from ?? 1.44;
          const backZ = (r) => { let m = 1e9; for (let q = 0; q < S; q++) { const c = Math.cos((q / S) * TAU); if (c < -0.7) m = Math.min(m, r.c.z + r.r[q] * c); } return m; };
          const pts = rings.filter((r) => r.t <= y0).map((r) => [r.t, backZ(r)]).sort((a, b) => b[0] - a[0]);
          if (pts.length > 2) {
            pts.push([pts[pts.length - 1][0] - 1e-4, pts[0][1]]);   // the plumb line from the blades
            // Lower hull (most negative z) of the points, walking down from the blades.
            const hull = [];
            for (const p of pts) {
              while (hull.length >= 2) {
                const [a, b] = [hull[hull.length - 2], hull[hull.length - 1]];
                // keep b only if it lies on or outside (more negative z than) the chord a → p
                const zc = a[1] + (p[1] - a[1]) * (b[0] - a[0]) / (p[0] - a[0]);
                if (b[1] <= zc + 1e-6) break;
                hull.pop();
              }
              hull.push(p);
            }
            const lineZ = (t) => {
              for (let i = 1; i < hull.length; i++) {
                const [a, b] = [hull[i - 1], hull[i]];
                if (t <= a[0] && t >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - t) / Math.max(1e-6, a[0] - b[0]);
              }
              return hull[hull.length - 1][1];
            };
            for (const r of rings) {
              if (r.t > y0 + 0.05) continue;
              const w = smooth(y0 + 0.05, y0 - 0.01, r.t);
              const d = (backZ(r) - lineZ(Math.min(r.t, y0))) * w;   // how far the back sits inside the line
              if (d <= 0) continue;
              for (let q = 0; q < S; q++) {
                const c = Math.cos((q / S) * TAU);
                if (c < 0) r.r[q] += d * Math.pow(-c, 1.4);
              }
            }
          }
        }
        // A gentle torso profile (cut.smoothProfile; every catalogue jacket): the chest → waist → hem line
        // is one monotonic, gently curved line with no inward kink at the waist. The body under the shell
        // (a belly bump over a narrow waist, then the pants' seat) used to show as a dip in the side view
        // ("a hole at the waist"). Per direction around the torso, between the shoulder blades and the
        // hem band (its rib / drawcord stays), the outline is lifted to its least concave majorant at the
        // front and back (the fabric hangs from the chest / belly like real cloth) and to a wide one-sided
        // blur at the sides (the waist stays slim, the bend just gets gradual). Only ever outward, so the
        // pants clearance holds. docs/character.md § Torso profile.
        if (cut.smoothProfile) {
          const SP = cut.smoothProfile, hi = SP.from ?? 1.44, lo = bot + (SP.hemBand ?? 0.09);
          const idx = [];
          rings.forEach((r, i) => { if (r.t <= hi && r.t >= lo) idx.push(i); });
          if (idx.length > 5) {
            const ts = idx.map((i) => rings[i].t);
            for (let q = 0; q < S; q++) {
              const th = (q / S) * TAU, c = Math.cos(th);
              const fb = Math.pow(Math.abs(c), SP.sidePow ?? 1.6);   // 1 at the front / back, 0 at the sides
              // outward extent along this direction from the body's fixed vertical axis
              const s = idx.map((i) => rings[i].r[q] + rings[i].c.z * c);
              // least concave majorant (upper hull over t)
              const hull = [];
              for (let k = 0; k < s.length; k++) {
                while (hull.length >= 2) {
                  const a = hull[hull.length - 2], b = hull[hull.length - 1];
                  const cross = (ts[b] - ts[a]) * (s[k] - s[a]) - (s[b] - s[a]) * (ts[k] - ts[a]);
                  if (cross <= 0) hull.pop(); else break;   // (t descending: b on or under the chord a → k)
                }
                hull.push(k);
              }
              const H = new Float32Array(s.length);
              for (let h = 1; h < hull.length; h++) {
                const a = hull[h - 1], b = hull[h];
                for (let k = a; k <= b; k++) H[k] = s[a] + (s[b] - s[a]) * (k - a) / Math.max(1, b - a) ;
              }
              // sides: a one-sided wide blur (fills narrow dips, keeps the slow chest → waist taper)
              let B2 = s.slice();
              const Wd = SP.blur ?? 6;
              for (let it = 0; it < (SP.passes ?? 8); it++) {
                const nb = B2.slice();
                for (let k = 0; k < B2.length; k++) {
                  let acc = 0, ws = 0;
                  for (let d = -Wd; d <= Wd; d++) { const j = Math.min(B2.length - 1, Math.max(0, k + d)); const w = 1 - Math.abs(d) / (Wd + 1); acc += B2[j] * w; ws += w; }
                  nb[k] = Math.max(B2[k], acc / ws);
                }
                B2 = nb;
              }
              for (let k = 0; k < s.length; k++) {
                const edge = Math.min(1, k / 3, (s.length - 1 - k) / 3);   // the blur eases in over the end rings
                const want = H[k] * fb + (s[k] + (B2[k] - s[k]) * edge) * (1 - fb);
                if (want > s[k]) rings[idx[k]].r[q] += want - s[k];
              }
            }
          }
        }
      },
    });
    const S = segs;
    const quilt = cut.quilt;
    for (const r of rings) {
      r.off = new Float32Array(S);
      const below = smooth(1.3, bot + 0.04, r.t) * smooth(bot - 0.02, bot + 0.1, r.t + 0.12);
      for (let k = 0; k < S; k++) {
        const th = (k / S) * TAU, u = k / S;
        // Back hem: the lowest rings sag toward the back (dropped tail) or lift (hemBack above hemFront).
        // Level across the back third, changing over the sides (no point at the centre back).
        const back = (1 - Math.cos(th)) / 2, side = Math.abs(Math.sin(th));
        r.off[k] = (hemB - hemF) * smooth(0.2, 0.8, back) * smooth(1.05, bot, r.t);
        // Long vertical drape folds from the chest and shoulder blades to the hem (stronger toward the
        // hem, where the cloth hangs free), soft compression folds over the waist at the sides.
        const hangF = smooth(1.3, bot, r.t);
        const drape = (pnoise(u * 9 + r.t * 1.2, r.t * 2.2, 9) * 0.0055 + Math.sin(th * 7 + pnoise(u * 3, r.t * 3, 3) * 2.5) * 0.0026) * (0.5 + hangF);
        const waist = Math.sin((r.t - 1.0) * TAU / 0.05 + pnoise(u * 6, 1.7, 6) * 2) * 0.0035 * bump(r.t, 1.1, 0.12) * (0.25 + side * 0.75);
        const lump = pnoise(u * 5, r.t * 4 + 3.1, 5) * 0.003;
        // Hem flutes: the free-hanging bottom of the shell breaks into a few soft vertical folds.
        const flute = (Math.sin(th * 9 + pnoise(u * 4, 5.3, 4) * 2.2) * 0.0045 + pnoise(u * 13, r.t * 3 + 9.7, 13) * 0.002) * smooth(bot + 0.28, bot + 0.02, r.t);
        // Tension folds from the armpit running down and forward over the front of the ribs.
        const ath = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
        const diag = Math.sin(((r.t - 1.2) + 0.09 * (ath - 1.0)) * TAU / 0.065 + pnoise(u * 5, 2.9, 5) * 1.2) * 0.0018 * bump(r.t, 1.27, 0.11) * bump(ath, 1.05, 0.45);
        r.r[k] += (drape * below + waist + flute + diag + lump * smooth(1.45, 1.2, r.t)) * folds;
        // Quilted baffles (puffers): tubes between stitch lines, pinched at each line.
        if (quilt) {
          const ph = ((((r.t - bot) / quilt.pitch) % 1) + 1) % 1;
          r.r[k] += quilt.depth * (Math.pow(Math.sin(Math.PI * ph), 0.55) - 0.35) * smooth(1.6, 1.5, r.t) * smooth(bot, bot + 0.03, r.t);
        }
        // Kangaroo pocket: a shallow patch across the belly, a little proud of the shell.
        if (cut.kangaroo && Math.cos(th) > 0) {
          const ax = Math.abs(Math.sin(th)) * r.r[k];
          r.r[k] += cut.kangaroo * smooth(0.165, 0.13, ax) * smooth(0.93, 0.96, r.t) * smooth(1.15, 1.11, r.t) * Math.cos(th);
        }
      }
    }
    // Only the top of the shoulder rides on the upper arm (like a deltoid); the armpit stays with the trunk.
    jacketRings = rings;
    pieces.push(sweep(rings, {
      id: PIECE.jacket, side: 0, ...frame('y'), lipEnd: true, skinBones: bones,
      skinMask: (b, x, y) => !b.startsWith('upperarm') || (y > 1.45 && Math.abs(x) > 0.13),
      // …and only partly, at the outer edge: the chest panel stays flat when the arms reach forward.
      weightLimit: (b, x, y) => (b.startsWith('upperarm') ? 0.55 * smooth(0.15, 0.23, Math.abs(x)) * smooth(1.43, 1.5, y) : undefined),
      // Below the crotch the front of a long hem rides on the thighs: it lifts and bunches over them in a
      // crouch instead of staying behind while the legs come up through it.
      weightFloor: (b, x, y, z) => {
        // The hem band over the hips rides on the pelvis, like the pants' waist and seat under it (with
        // the spine's share it would swing forward off the seat in a crouch and let the pants show through).
        if (b === 'pelvis') return 0.9 * smooth(1.1, 0.98, y);
        // One-piece armhole (cut.armBlend): the outer shoulder and the side under the arm ride on the upper
        // arm too, with the same share the sleeve head takes there (layerWeights below), so the yoke and the
        // sleeve bend as one piece: the shoulder line follows the arm down instead of standing out as a pad
        // over a sleeve that slides in under it, and the side panel gives way under a lowered arm.
        if (b.startsWith('upperarm') && cut.armBlend) {
          const sgn = b.endsWith('_l') ? 1 : -1;
          return cut.armBlend * smooth(0.15, 0.245, x * sgn) * smooth(1.25, 1.42, y);
        }
        if (!b.startsWith('thigh')) return 0;
        const sgn = b.endsWith('_l') ? 1 : -1;
        // The front of the hem band rides partly on its thigh (cut.hemThigh, from the belt line down to the
        // hem), so a thigh that comes forward lifts the hem with it instead of pushing the pants out through
        // it; the centre front and the back stay on the pelvis.
        const lift = Math.max(0.8 * smooth(0.9, 0.8, y), (cut.hemThigh ?? 0) * smooth(1.0, hemF + 0.01, y));
        return lift * smooth(-0.04, 0.05, z) * smooth(0.0, 0.06, x * sgn);
      },
    }));
    jacketPiece = pieces[pieces.length - 1];
    // Spread the weights further over the shell than on other pieces: a jacket panel bends as one sheet
    // when the spine flexes (no groove along the spine, no shoulder-blade dents in a crouch).
    pieces[pieces.length - 1].smoothIters = 24;
  }

  // ---------------------------------------------------------------- sleeves
  // Target radii per fit (cut.sleeve), never thinner than the collapsed arm (the body material pulls the
  // arm 60 % toward its axis); articulated elbow folds, a stack of folds above the cuff.
  for (const s of [1, -1]) {
    const segs = 28;
    const sd = s > 0 ? 'l' : 'r';
    const bones = B(new RegExp(`^(upperarm_${sd}|lowerarm_${sd}|clavicle_${sd})$`));
    const t0 = 0.19, t1 = cut.sleeveEnd;
    const folds = cut.folds ?? 1;
    const rings = bodyRings(body, {
      axis: 'x', side: s, t0, t1, rings: 44, segs, half: 0.022, bones,
      axisPoint: (t) => new THREE.Vector3(s * t, J['upperarm_' + sd].y, J['upperarm_' + sd].z),
      filter: (x, y) => y > 1.3,
      smoothA: 2, smoothT: 3, minEase: 0,
      ease: () => 0,
      post: (rings, S) => {
        for (const r of rings) {
          const tr = sleeveR(r.t);
          const shrink = THREE.MathUtils.lerp(0.75, 0.45, smooth(0.19, 0.25, r.t));
          for (let k = 0; k < S; k++) r.r[k] = Math.max(tr, r.raw[k] * shrink + 0.01);
          // Near the armhole the top of the sleeve follows the sloped shoulder line of the body shell.
          if (r.t < 0.34) {
            const lim = 1.575 - (r.t - 0.08) * 0.42 - r.c.y - 0.02 * smooth(0.3, 0.2, r.t) - 0.02 * smooth(0.36, 0.22, r.t);
            for (let k = 0; k < S; k++) {
              const up = Math.cos((k / S) * TAU);
              if (up > 0.05) r.r[k] = Math.max(Math.min(r.r[k], lim / up), r.raw[k] * shrink);
            }
          }
        }
      },
    });
    for (const r of rings) {
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * TAU, u = k / segs;
        const inner = Math.max(0, Math.sin(th));          // front of the arm = inside of the elbow bend
        const elbow = Math.sin((r.t - 0.46) * TAU / 0.05 + pnoise(u * 4, 2.3, 4) * 1.5) * 0.0075 * bump(r.t, 0.46, 0.085) * (0.25 + inner * 0.9);
        const wrist = Math.sin((r.t - t1) * TAU / 0.03 + pnoise(u * 5, 4.1, 5) * 2.2) * 0.0065 * bump(r.t, t1 - 0.06, 0.05);
        const twist = pnoise(u * 4 + r.t * 3, r.t * 5, 4) * 0.003 + Math.sin(th * 3 + r.t * 14 * s) * 0.002 * bump(r.t, 0.36, 0.1);
        r.r[k] += (elbow + wrist + twist) * folds;
        if (cut.sleeveLayer) r.r[k] += 0.0045 * bump(r.t, cut.sleeveLayer.at - 0.007, 0.008);   // the outer sleeve's hem roll
        // One-piece armhole: the sleeve head swells a little where it leaves the shell (a soft, eased seam).
        if (cut.armBlend) r.r[k] += 0.006 * smooth(0.3, 0.235, r.t);
        if (cut.quilt) {
          const ph = ((((r.t - 0.2) / (cut.quilt.pitch * 0.72)) % 1) + 1) % 1;
          r.r[k] += cut.quilt.depth * 0.85 * (Math.pow(Math.sin(Math.PI * ph), 0.55) - 0.35) * smooth(0.21, 0.25, r.t) * smooth(t1 - 0.03, t1 - 0.07, r.t);
        }
      }
    }
    // The armhole end stays with the shoulder girdle (clavicle) and blends into the arm, so the sleeve
    // head never swings out through the chest or back when the arm reaches.
    pieces.push(sweep(rings, {
      id: PIECE.sleeve, side: s, ...frame('x', s), lipEnd: true,
      skinBones: B(new RegExp(`^(upperarm_${sd}|lowerarm_${sd}|clavicle_${sd}|spine_03|hand_${sd})$`)),
      anchor: { bone: body.bone('clavicle_' + sd), axis: 0, abs: true, y0: 0.2, y1: 0.28 },
    }));
    sleevePieces.push(pieces[pieces.length - 1]);
  }
  // ---------------------------------------------------------------- pants
  // Real snow pants from the waist down: each leg is half of the trunk (waist, hips and seat, one
  // superellipse per height, pantsTrunk) above the crotch, blending into a relaxed leg tube below it
  // (target radius per fit at the thigh / knee / hem, never closer than a little ease to the leg), and the
  // two legs meet flush at the centre front and back. Under the jacket the pants stay inside its shell
  // (the jacket is cut to clear them), and the top rolls over as a waistband.
  {
    const PT = pantsTrunk(cut), L = cut.leg;
    for (const s of [1, -1]) {
      const segs = 36;
      const sd = s > 0 ? 'l' : 'r';
      const bones = B(new RegExp(`^(thigh_${sd}|calf_${sd}|foot_${sd}|ball_${sd}|pelvis)$`));
      const t0 = PT.rise, t1 = cut.cuffY;
      const knee = J['calf_' + sd].y;
      const hemLow = Math.min(cut.hemFront, cut.hemBack);
      // Lowest point of the seat that stays with the pelvis: the crotch, or under a long hem a little below it.
      const seatLo = Math.min(PT.crotch, hemLow - 0.05);
      // Leg radius along the leg: thigh (just below the crotch) → knee → hem.
      const legR = (t) => {
        if (t >= knee) return THREE.MathUtils.lerp(L.knee, L.thigh, smooth(knee, PT.crotch - 0.06, t));
        return THREE.MathUtils.lerp(L.hem, L.knee, smooth(cut.cuffY + 0.06, knee, t));
      };
      const rings = bodyRings(body, {
        axis: 'y', t0, t1, rings: 74, segs, half: 0.025, bones,
        axisPoint: (t) => new THREE.Vector3(s * 0.114, t, -0.04),
        filter: (x, y, z, b) => (b === 'pelvis' ? x * s > 0.015 : true) && (y > 0.14 || z < 0.0),
        smoothA: 3, smoothT: 4, smoothC: 6, minEase: -0.01,
        ease: () => 0,
        post: (rings, S) => {
          for (const r of rings) {
            const wT = smooth(PT.crotch - 0.05, PT.crotch + 0.07, r.t);
            const R = legR(r.t);
            // The bent knee: the leg is a little deeper than wide around the knee.
            const deep = 1 + 0.07 * bump(r.t, knee, 0.16);
            for (let k = 0; k < S; k++) {
              const th = (k / S) * TAU, dx = Math.sin(th), dz = Math.cos(th);
              const leg = R / Math.sqrt(dx * dx + (dz * dz) / (deep * deep));
              let rr = leg;
              if (wT > 0) {
                const half = rayEdge(r.c.x, r.c.z, dx, dz, (x, z) => x * s > -0.012 && PT.inside(x, z, r.t));
                rr = THREE.MathUtils.lerp(leg, half, wT);
              }
              // Ease over the (shrunk) body: the pants zone is pulled in ~2.7 cm in the body shader.
              rr = Math.max(rr, r.raw[k] + (r.t > 1.0 ? -0.012 : 0.004));
              // The legs never cross the centre line (they meet there, flush).
              if (dx * s < -1e-3) rr = Math.min(rr, (-0.012 * s - r.c.x) / dx);
              r.r[k] = rr;
            }
          }
        },
      });
      for (const r of rings) {
        const free = smooth(hemLow + 0.02, hemLow - 0.1, r.t);     // below the jacket: free-hanging fabric
        for (let k = 0; k < segs; k++) {
          const th = (k / segs) * TAU, u = k / segs;
          const back = (1 - Math.cos(th)) / 2;
          const inner = Math.max(0, -Math.sin(th) * s);
          // Boot stack: a few soft rolls where the inseam breaks over the boot (not a flare).
          const st = cut.stack;
          const stackY = (r.t - st.y0) / (st.y1 - st.y0);
          const roll = stackY > -0.1 && stackY < 1.1 ? Math.pow(Math.max(0, Math.sin(stackY * Math.PI * st.n + pnoise(u * 5, 7.3 + s, 5) * 0.9)), 1.5) * st.amp * (1 - 0.4 * smooth(0.3, 0.9, stackY)) : 0;
          // Knee: compression folds behind the knee, softer ones in front.
          const kf = Math.sin((r.t - knee) * TAU / 0.05 + pnoise(u * 4, 3.3 + s, 4) * 2) * bump(r.t, knee + 0.02, 0.1) * (0.003 + back * 0.011);
          // Long drape folds down the thigh and shin (not on the inner face where the legs meet), a slight twist.
          const drape = pnoise(u * 6 + r.t * 2.2 * s, r.t * 2, 6) * 0.008 + Math.sin(u * TAU * 5 + r.t * 9 * s + pnoise(u * 3, r.t * 4, 3) * 2) * 0.0035 * smooth(0.95, 0.75, r.t);
          // Seat and crotch: a few soft folds radiating from the crotch at the back and front.
          const crotchF = Math.sin(th * 4 * s + r.t * 30 + pnoise(u * 4, 5.5 + s, 4) * 1.6) * 0.003 * bump(r.t, PT.crotch + 0.01, 0.07) * inner;
          r.r[k] += roll + kf + (drape * (1 - 0.7 * inner * smooth(PT.crotch - 0.1, PT.crotch, r.t)) + crotchF) * free;
          // Bellows cargo pockets (prototypes): a raised pocket on the outer thigh.
          if (cut.cargo) r.r[k] += cut.cargo * smooth(0.45, 0.85, Math.sin(th) * s) * smooth(0.52, 0.56, r.t) * smooth(0.75, 0.71, r.t);
          // Pre-bent knee: the fabric hangs forward of the kneecap.
          if (Math.cos(th) > 0) r.r[k] += Math.cos(th) * 0.01 * bump(r.t, knee, 0.12);
        }
        // Under the jacket the pants stay inside its shell (a little room for the shell's folds).
        if (r.t > hemLow - 0.05 && jacketRings) {
          let jr = jacketRings[jacketRings.length - 1];
          for (const q of jacketRings) if (Math.abs(q.t - r.t) < Math.abs(jr.t - r.t)) jr = q;
          const under = smooth(hemLow - 0.05, hemLow + 0.02, r.t);
          const inJ = (x, z) => Math.hypot(x - jr.c.x, z - jr.c.z) <= ringRadiusToward(jr, x, z) - 0.014;
          for (let k = 0; k < segs; k++) {
            const th = (k / segs) * TAU, dx = Math.sin(th), dz = Math.cos(th);
            if (inJ(r.c.x + dx * r.r[k], r.c.z + dz * r.r[k])) continue;
            const e = rayEdge(r.c.x, r.c.z, dx, dz, inJ, r.r[k]);
            r.r[k] = THREE.MathUtils.lerp(r.r[k], e, under);
          }
        }
      }
      pieces.push(sweep(rings, {
        id: PIECE.pants, side: s, ...frame('y'), lipEnd: true, lipStart: true, gaiterEnd: true,
        skinBones: B(new RegExp(`^(thigh_${sd}|calf_${sd}|foot_${sd}|pelvis)$`)),
        // The waist and seat ride on the pelvis like the jacket over them; the hip blends into the thigh.
        anchor: { bone: body.bone('pelvis'), y0: 1.0, y1: 0.9 },
        // The seat stays with the pelvis down to the crotch (as the jacket's back hem over it does), so a
        // crouch rounds it under the hem instead of swinging it out through the jacket with the thigh.
        weightLimit: (b, x, y, z) => (b.startsWith('thigh') ? 1 - 0.85 * smooth(-0.03, -0.1, z) * smooth(seatLo - 0.02, seatLo + 0.08, y) : undefined),
      }));
      legPieces.push(pieces[pieces.length - 1]);
    }
    // Bib: the chest and back panel above the waist, just inside the jacket (it follows the jacket's own
    // rings 2 cm in and is skinned like it), so it only shows when the jacket is off (the item icon) or
    // rides up. The back panel is cut lower than the front.
    if (cut.bib && jacketRings) {
      const segs = jacketRings[0].r.length, top = cut.bib.front, n = 16;
      const rings = [];
      for (let i = 0; i < n; i++) {
        const t = THREE.MathUtils.lerp(top, PT.rise - 0.06, i / (n - 1));
        let jr = jacketRings[0];
        for (const q of jacketRings) if (Math.abs(q.t - t) < Math.abs(jr.t - t)) jr = q;
        const off = new Float32Array(segs);
        for (let k = 0; k < segs; k++) {
          const back = (1 - Math.cos((k / segs) * TAU)) / 2;
          off[k] = (cut.bib.back - top) * smooth(0.25, 0.75, back) * smooth(top - 0.12, top, t);
        }
        rings.push({ t, c: new THREE.Vector3(jr.c.x, t, jr.c.z), r: jr.r.map((x) => Math.max(0.05, x - 0.022)), off });
      }
      pieces.push(sweep(rings, {
        id: PIECE.pants, side: 0, ...frame('y'), lipStart: true,
        skinBones: B(/^(pelvis|spine_0[123])$/),
        weightFloor: (b, x, y) => (b === 'pelvis' ? 0.9 * smooth(1.1, 0.98, y) : 0),
      }));
      pieces[pieces.length - 1].smoothIters = 24;
      bibPiece = pieces[pieces.length - 1];
      // Shoulder straps (aG.w = 2): from the top of the bib over the shoulders to the back panel. They lie
      // under the jacket's yoke, so the fabric shader only draws them when the jacket is off (the item
      // icon, uStraps); in the game they would only risk poking through the close shoulders.
      for (const sx of [1, -1]) {
        const x0 = sx * 0.1, inset = 0.02;
        const surf = (jr, dirZ) => {
          const inJ = (x, z) => Math.hypot(x - jr.c.x, z - jr.c.z) <= ringRadiusToward(jr, x, z) - inset;
          if (!inJ(x0, jr.c.z)) return null;
          return jr.c.z + dirZ * rayEdge(x0, jr.c.z, 0, dirZ, inJ, 0.4);
        };
        const front = [], back = [];
        for (const jr of jacketRings) {
          if (jr.t >= top - 0.03) { const z = surf(jr, 1); if (z !== null) front.push(new THREE.Vector3(x0, jr.t, z)); }
          if (jr.t >= cut.bib.back - 0.03) { const z = surf(jr, -1); if (z !== null) back.push(new THREE.Vector3(x0 * 0.9, jr.t, z)); }
        }
        if (front.length < 3 || back.length < 3) continue;
        // front runs up (jacketRings go top → bottom), then over the shoulder and down the back
        const path = [...front.reverse(), ...back];
        const pts = [path[0]];
        for (const p of path) if (p.distanceTo(pts[pts.length - 1]) > 0.012) pts.push(p);
        const rings = [], seg = 12;
        for (let i = 0; i < pts.length; i++) {
          const T = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
          const e2 = new THREE.Vector3(1, 0, 0);
          const e1 = new THREE.Vector3().crossVectors(e2, T).normalize();
          const r = new Float32Array(seg);
          for (let k = 0; k < seg; k++) {
            const th = (k / seg) * TAU, a = Math.cos(th), b = Math.sin(th);
            r[k] = 1 / Math.sqrt((a * a) / (0.005 * 0.005) + (b * b) / (0.02 * 0.02));
          }
          rings.push({ c: pts[i], r, e1, e2 });
        }
        const p = sweepFrames(rings, { id: PIECE.pants, side: 2, capStart: true, capEnd: true, skinBones: B(/^(spine_0[23]|clavicle_[lr])$/) });
        pieces.push(p);
      }
    }
  }

  // ---------------------------------------------------------------- gaiter (pulled up under the goggle)
  if (cut.gaiter) {
    const segs = 40;
    const bones = B(/^(neck_01|Head)$/);
    const rings = bodyRings(body, {
      axis: 'y', t0: 1.555, t1: cut.gaiterTop, rings: 16, segs, half: 0.016, bones,
      axisPoint: (t) => new THREE.Vector3(0, t, 0),
      filter: (x, y, z, b) => b === 'Head' || b === 'neck_01',
      centre: (t, c) => new THREE.Vector3(0, t, c.z),
      smoothA: 2, smoothT: 2, minEase: 0.008,
      ease: (t) => THREE.MathUtils.lerp(0.005, 0.011, smooth(1.6, 1.645, t)),   // tucked tight into the collar below the jaw
    });
    for (const r of rings) for (let k = 0; k < segs; k++) {
      const u = k / segs;
      r.r[k] += Math.sin((r.t - 1.58) * TAU / 0.03 + pnoise(u * 5, 9.1, 5) * 2) * 0.003 * bump(r.t, 1.59, 0.03);
    }
    pieces.push(sweep(rings, { id: PIECE.gaiter, side: 0, ...frame('y'), lipEnd: true, skinBones: bones, anchor: { bone: body.bone('neck_01'), y0: 1.595, y1: 1.64 } }));
  }

  // ---------------------------------------------------------------- stowed hood (a roll behind the neck) or a hoodie's hood lying on the back
  if (cut.hood === 'down' || cut.hood === 'hoodie') {
    const soft = cut.hood === 'hoodie';
    // Stowed / collapsed hood: [thickness, height above the neckline, drop down the back] (shells).
    const [rollThick, rollUp, rollDown] = cut.hoodRoll || [0.04, 0.06, 0.055];
    const segs = 18, n = 22;
    const rings = [];
    const e1s = [], e2s = [];
    const pts = [];
    // The roll lies on the yoke against the back of the collar: its centre sits just inside the jacket
    // surface (measured from the jacket's own rings), so most of it stands proud.
    const torsoAt = (y, th) => {
      let best = jacketRings[0];
      for (const r of jacketRings) if (Math.abs(r.t - y) < Math.abs(best.t - y)) best = r;
      const S = best.r.length, x = (((th / TAU) % 1) + 1) % 1 * S, k0 = Math.floor(x) % S, fx = x - Math.floor(x);
      const rr = best.r[k0] * (1 - fx) + best.r[(k0 + 1) % S] * fx;
      return new THREE.Vector3(Math.sin(th) * rr, y, best.c.z + Math.cos(th) * rr);
    };
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1;                      // −1 … 1 across the back
      const a = f * THREE.MathUtils.degToRad(cut.hoodSpan ?? 95);
      const y = 1.553 - f * f * 0.03;
      const surf = torsoAt(y, Math.PI - a);
      const outw = new THREE.Vector3(surf.x, 0, surf.z - jacketRings[0].c.z).normalize();
      pts.push(surf.clone().addScaledVector(outw, (soft ? -0.006 : -0.012) * (1 - f * f * 0.5)));
    }
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1;
      const T = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const out = new THREE.Vector3(pts[i].x, 0, pts[i].z + 0.03).normalize();
      const up = new THREE.Vector3().crossVectors(T, out).normalize();
      {
        // The hoodie's hood lies on the back: its "down" runs along the jacket's back surface, which
        // slopes out from the neck to the shoulder blades.
        const a = f * THREE.MathUtils.degToRad(cut.hoodSpan ?? 95), y = pts[i].y;
        const lo = torsoAt(y - 0.1, Math.PI - a), hi = torsoAt(y, Math.PI - a);
        const d = lo.sub(hi).normalize();
        up.copy(d).negate();
        up.addScaledVector(T, -up.dot(T)).normalize();
      }
      const o2 = new THREE.Vector3().crossVectors(up, T).normalize();
      const r = new Float32Array(segs);
      // Roll: an elliptical section. Hoodie: a soft teardrop, the hood's body hanging down the back.
      // Shell hood: a collapsed hood with volume, piled up behind the neck below the helmet and draping a
      // little down the yoke, thinning toward the collar at the sides.
      const fall = Math.pow(Math.max(0, 1 - f * f), 1.3);
      const thick = soft ? 0.036 * (1 - f * f * 0.5) : rollThick * (0.45 + 0.55 * fall);
      const tallUp = soft ? 0.03 * (1 - f * f * 0.4) : 0.022 + (rollUp - 0.022) * fall;
      const tallDown = soft ? 0.034 + 0.13 * Math.pow(Math.max(0, 1 - f * f), 1.6) : 0.02 + (rollDown - 0.02) * fall;
      const down = up.y > 0 ? -1 : 1;
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * TAU;
        const ex = Math.cos(th), ey = Math.sin(th);
        const tall = ey * down > 0 ? tallDown : tallUp;
        r[k] = 1 / Math.sqrt((ex * ex) / (thick * thick) + (ey * ey) / (tall * tall)) + pnoise(k / segs * 4, f * 3, 4) * (soft ? 0.003 : 0.004);
      }
      rings.push({ c: pts[i], r, t: f, e1: o2, e2: up });
      e1s.push(o2); e2s.push(up);
    }
    pieces.push(sweepFrames(rings, { id: PIECE.hood, side: 0, capStart: true, capEnd: true, skinBones: soft ? B(/^(spine_0[23]|neck_01|clavicle_[lr])$/) : B(/^(spine_03|neck_01|clavicle_[lr])$/) }));
  }

  // ---------------------------------------------------------------- hood worn up, over the helmet
  if (cut.hood === 'up') {
    const fit = helmetFit(body, cut.helmetShape || {});
    const off = 0.019;                                        // clears the shell, strap and vents
    // Face opening / lower edge over |θ|: a stiff brim above the goggle, down the cheeks behind the
    // goggle's sides, then around the nape into the collar.
    const edge = [[0, 1.776], [34, 1.772], [52, 1.732], [64, 1.66], [78, 1.6], [110, 1.575], [180, 1.565]];
    const cols = 65, rowsS = 28, lipRows = 3, rows = rowsS + lipRows;
    const P = new Float32Array(rows * cols * 3), G = new Float32Array(rows * cols * 4), L = new Float32Array(rows * cols);
    // A point `extra` metres off the helmet shell (offset away from a centre inside the head, so the
    // crown is a smooth dome); below the helmet's lower edge the hood tapers into the collar.
    const C = new THREE.Vector3(0, fit.yEq - 0.04, fit.cz);
    const at = (th, y, extra) => {
      const deg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th), Math.cos(th)));
      const taper = 1 - 0.2 * smooth(keyed(fit.yBotKeys, deg) + 0.01, 1.565, y);
      const p = fit.shellPt(th, y, 0);
      p.addScaledVector(p.clone().sub(C).normalize(), extra);
      p.x *= taper; p.z = fit.cz + (p.z - fit.cz) * taper;
      return p;
    };
    for (let k = 0; k < cols; k++) {
      const th = (k / (cols - 1)) * TAU;
      const deg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th), Math.cos(th)));
      const yb = keyed(edge, deg);
      const front = 1 - smooth(40, 70, Math.abs(deg));
      for (let i = 0; i < rows; i++) {
        let p, v, lin = 0;
        if (i < rowsS) {
          const s = i / (rowsS - 1);
          const y = THREE.MathUtils.lerp(fit.yTop, yb, Math.pow(s, 1.1));
          // Soft drape: a couple of shallow folds running back from the brim, a puff over the crown.
          const fold = Math.sin(th * 6 + 0.7) * 0.003 * s * (1 - front) + 0.002 * Math.sin(s * Math.PI);
          p = at(th, y, off + fold + front * 0.006 * smooth(0.85, 1, s));
          v = s;
        } else {
          // Rolled, stiffened edge (a brim in front) turning in to the lining.
          const j = i - rowsS;
          const d = [[-0.004, off + 0.014 * (0.5 + front)], [0.006, off + 0.002], [0.03, off - 0.01]][j];
          p = at(th, yb + d[0] * (yb > 1.7 ? 1 : 1), d[1]);
          v = 1 + j * 0.01; lin = j > 0 ? 1 : 0;
        }
        const o = i * cols + k;
        P.set([p.x, p.y, p.z], o * 3);
        G.set([PIECE.hoodUp, k / (cols - 1), v, 0], o * 4);
        L[o] = lin;
      }
    }
    const g = grid(P, rows, cols, true, (i, k) => new THREE.Vector3().fromArray(P, (i * cols + k) * 3).sub(new THREE.Vector3(0, fit.yEq - 0.03, fit.cz)));
    pieces.push({
      pos: g.P, nrm: g.N, g: G, lin: L, crease: new Float32Array(rows * cols), idx: g.idx, rows, cols,
      skinBones: B(/^(Head|neck_01|spine_03)$/),
      anchor: { bone: body.bone('Head'), y0: 1.68, y1: 1.6 },     // rigid on the head above the jaw
    });
  }

  // ---------------------------------------------------------------- mitts + gauntlets
  for (const s of [1, -1]) {
    const sd = s > 0 ? 'l' : 'r';
    const hand = body.bone('hand_' + sd);
    {
      // A closed fist (the rig's fingers are straight, but the mitt is rigid on the hand bone, so it can
      // be shaped as a grip): a rounded box from the wrist over the knuckles, curled fingers at the end,
      // and a thumb lobe wrapped forward. The pole grip runs through it.
      const segs = 28, n = 2.6;
      const x0 = 0.695, x1 = cut.mittLength ?? 0.835;
      const rings = [];
      for (let i = 0; i < 14; i++) {
        const t = x0 + (x1 - x0) * (i / 13);
        const w = smooth(x0, 0.75, t);                       // wrist → palm
        const hy = THREE.MathUtils.lerp(0.042, 0.057, w) + 0.004 * bump(t, 0.81, 0.035);   // knuckle ridge
        const hz = THREE.MathUtils.lerp(0.044, 0.062, w);
        const r = new Float32Array(segs);
        for (let k = 0; k < segs; k++) {
          const th = (k / segs) * TAU, cy = Math.abs(Math.cos(th)), sz = Math.abs(Math.sin(th));
          r[k] = 1 / Math.pow(Math.pow(cy / hy, n) + Math.pow(sz / hz, n), 1 / n) + pnoise(k / segs * 4, t * 40, 4) * 0.0018;
        }
        rings.push({ t, c: new THREE.Vector3(s * t, 1.432 - 0.006 * w, -0.058), r });
      }
      pieces.push(sweep(rings, { id: PIECE.mitt, side: s, ...frame('x', s), capEnd: true, capLen: 0.75, rigid: hand }));
      // Thumb lobe: from the base of the thumb, wrapped forward and down along the grip.
      const a = new THREE.Vector3(s * 0.73, 1.418, -0.03), e = new THREE.Vector3(s * 0.785, 1.398, -0.004);
      const T = e.clone().sub(a).normalize();
      const e1 = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize();
      const e2 = new THREE.Vector3().crossVectors(T, e1).normalize();
      const thumb = [];
      for (let i = 0; i < 7; i++) {
        const f = i / 6;
        thumb.push({ c: a.clone().lerp(e, f), r: new Float32Array(16).fill(THREE.MathUtils.lerp(0.024, 0.02, f)), e1, e2 });
      }
      const tp = sweepFrames(thumb, { id: PIECE.mitt, side: s, capEnd: true });
      tp.rigid = hand;
      pieces.push(tp);
    }
    {
      const segs = 24;
      const bones = B(new RegExp(`^(lowerarm_${sd}|hand_${sd})$`));
      const a0 = cut.gauntlet[0], a1 = 0.72;
      const rings = bodyRings(body, {
        axis: 'x', side: s, t0: a0, t1: a1, rings: 10, segs, half: 0.02, bones,
        axisPoint: (t) => new THREE.Vector3(s * t, 1.44, -0.07),
        filter: (x) => Math.abs(x) < 0.72,
        smoothA: 3, smoothT: 2, minEase: 0,
        ease: () => 0,
        // Open end just over the sleeve (its target radius + the cut's clearance), cinched toward the wrist;
        // never inside the collapsed forearm.
        post: (rings, S) => {
          const open = sleeveR(a0) + cut.gauntlet[1] + 0.004;
          for (const r of rings) {
            const tr = THREE.MathUtils.lerp(open, Math.min(open, 0.054), smooth(a0 + 0.03, a1 - 0.01, r.t));
            for (let k = 0; k < S; k++) r.r[k] = Math.max(tr, r.raw[k] * 0.5 + 0.012);
          }
        },
      });
      for (const r of rings) for (let k = 0; k < segs; k++) r.r[k] += Math.sin(r.t * TAU / 0.03 + k) * 0.0015;
      pieces.push(sweep(rings, { id: PIECE.gauntlet, side: s, ...frame('x', s), lipStart: true, skinBones: bones }));
    }
  }

  for (const p of pieces) skinPiece(p, body, p.smoothIters ?? 6);
  // Layered skinning: where the pants sit under the jacket they take the jacket's own weights (blending
  // back to theirs over the band just below the hem), so the two layers move as one and the pants never
  // poke out through the shell in any pose (docs/character.md § Garment clip).
  if (cut.layerPants && jacketPiece) {
    const hemF = cut.hemFront, hemB = cut.hemBack;
    const band = cut.layerPants.band ?? 0.07;
    for (const lp of legPieces) {
      layerWeights(lp, jacketPiece, (x, y, z) => {
        const back = smooth(0.2, 0.8, (1 - (z + 0.02) / Math.max(1e-6, Math.hypot(x, z + 0.02))) / 2);
        const hemAt = hemF + (hemB - hemF) * back;
        return smooth(hemAt - band, hemAt + 0.015, y);
      });
    }
    // The bib panel lies wholly under the jacket: it follows it everywhere.
    if (bibPiece) layerWeights(bibPiece, jacketPiece, () => 1);
  }
  // One-piece armhole: the sleeve head takes the shell's weights where the two meet and inside it
  // (|x| < 0.25), blending to its own by |x| 0.33, so the seam ring moves as one piece in every pose.
  if (cut.armBlend && jacketPiece) {
    for (const sp of sleevePieces) layerWeights(sp, jacketPiece, (x) => smooth(0.33, 0.25, Math.abs(x)));
  }
  return mergePieces(pieces);
}

/**
 * Give the vertices of `inner` (a piece under `outer`) the skin weights of the nearest `outer` vertices,
 * blended by f(x, y, z) ∈ [0, 1] (bind-pose position), so a layer under a shell follows the shell.
 */
function layerWeights(inner, outer, f) {
  const nO = outer.pos.length / 3, nI = inner.pos.length / 3;
  // a coarse grid over the outer piece's vertices (skip its lining)
  const cell = 0.04, map = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let j = 0; j < nO; j++) {
    if (outer.lin[j] > 0.5) continue;
    const k = key(outer.pos[j * 3], outer.pos[j * 3 + 1], outer.pos[j * 3 + 2]);
    let a = map.get(k); if (!a) map.set(k, a = []); a.push(j);
  }
  const acc = new Map();
  for (let i = 0; i < nI; i++) {
    const x = inner.pos[i * 3], y = inner.pos[i * 3 + 1], z = inner.pos[i * 3 + 2];
    const w = f(x, y, z);
    if (w <= 0) continue;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    const near = [];
    for (let r = 1; r <= 3 && near.length < 4; r++) {
      near.length = 0;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const a = map.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue;
        for (const j of a) near.push([(outer.pos[j * 3] - x) ** 2 + (outer.pos[j * 3 + 1] - y) ** 2 + (outer.pos[j * 3 + 2] - z) ** 2, j]);
      }
    }
    if (!near.length) continue;
    near.sort((p, q) => p[0] - q[0]);
    acc.clear();
    let ws = 0;
    for (const [d2, j] of near.slice(0, 4)) {
      const ww = 1 / (Math.sqrt(d2) + 0.005);
      ws += ww;
      for (let q = 0; q < 4; q++) { const b = outer.si[j * 4 + q], v = outer.sw[j * 4 + q]; if (v > 0) acc.set(b, (acc.get(b) || 0) + v * ww); }
    }
    for (const b of acc.keys()) acc.set(b, (acc.get(b) / ws) * w);
    for (let q = 0; q < 4; q++) { const b = inner.si[i * 4 + q], v = inner.sw[i * 4 + q]; if (v > 0) acc.set(b, (acc.get(b) || 0) + v * (1 - w)); }
    const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const s = top.reduce((a, e) => a + e[1], 0) || 1;
    for (let q = 0; q < 4; q++) { inner.si[i * 4 + q] = top[q] ? top[q][0] : 0; inner.sw[i * 4 + q] = top[q] ? top[q][1] / s : 0; }
  }
}

/** Collar radii at height t, resampled to `segs` directions (the collar has its own segment count). */
function collarAt(rings, t, segs) {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].t < t) i++;
  const a = rings[i], b = rings[i + 1];
  const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
  const n = a.r.length, out = new Float32Array(segs);
  for (let q = 0; q < segs; q++) {
    const x = (q / segs) * n, k0 = Math.floor(x) % n, k1 = (k0 + 1) % n, fx = x - Math.floor(x);
    const ra = a.r[k0] * (1 - fx) + a.r[k1] * fx, rb = b.r[k0] * (1 - fx) + b.r[k1] * fx;
    out[q] = ra * (1 - f) + rb * f;
  }
  return out;
}

/** sweep() for rings that carry their own frames (curved pieces). */
function sweepFrames(rings, meta) {
  // Re-express each ring on a shared frame by resampling: simplest is to build directly.
  const segs = rings[0].r.length, cols = segs + 1;
  const R = rings.slice();
  if (meta.capStart || meta.capEnd) {
    const capR = (base, dir) => {
      const out = [];
      const T = base.e1.clone().cross(base.e2).normalize();
      const avg = base.r.reduce((a, b) => a + b, 0) / segs;
      for (let j = 1; j <= 4; j++) {
        const a = (j / 4) * Math.PI / 2;
        out.push({ ...base, c: base.c.clone().addScaledVector(T, Math.sin(a) * avg * 0.8 * dir), r: base.r.map((x) => x * Math.cos(a) + 0.0005) });
      }
      return out;
    };
    const tDir = (i, j) => Math.sign(rings[j].c.clone().sub(rings[i].c).dot(rings[i].e1.clone().cross(rings[i].e2))) || 1;
    if (meta.capStart) R.unshift(...capR(rings[0], -tDir(0, 1)).reverse());
    if (meta.capEnd) R.push(...capR(rings[rings.length - 1], tDir(rings.length - 2, rings.length - 1)));
  }
  const nr = R.length;
  const P = new Float32Array(nr * cols * 3);
  for (let i = 0; i < nr; i++) for (let k = 0; k <= segs; k++) {
    const th = (k / segs) * TAU, ring = R[i], r = ring.r[k % segs];
    const p = ring.c.clone().addScaledVector(ring.e1, Math.cos(th) * r).addScaledVector(ring.e2, Math.sin(th) * r);
    P.set([p.x, p.y, p.z], (i * cols + k) * 3);
  }
  const N = new Float32Array(P.length);
  const at = (i, k) => { i = Math.min(nr - 1, Math.max(0, i)); k = ((k % segs) + segs) % segs; return new THREE.Vector3().fromArray(P, (i * cols + k) * 3); };
  const mid = Math.floor(nr / 2);
  const tst = at(mid + 1, 0).sub(at(mid - 1, 0)).cross(at(mid, 1).sub(at(mid, -1)));
  const orient = tst.dot(at(mid, 0).sub(R[mid].c)) < 0 ? -1 : 1;
  for (let i = 0; i < nr; i++) for (let k = 0; k <= segs; k++) {
    const n = at(i + 1, k).sub(at(i - 1, k)).cross(at(i, k + 1).sub(at(i, k - 1)));
    if (n.lengthSq() < 1e-14) n.copy(at(i, k).sub(R[i].c)).multiplyScalar(orient);
    n.normalize().multiplyScalar(orient);
    N.set([n.x, n.y, n.z], (i * cols + k) * 3);
  }
  const G = new Float32Array(nr * cols * 4), L = new Float32Array(nr * cols);
  for (let i = 0; i < nr; i++) for (let k = 0; k <= segs; k++) {
    const o = i * cols + k;
    G.set([meta.id, k / segs, i / (nr - 1), meta.side ?? 0], o * 4);
  }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let k = 0; k < segs; k++) {
    const a = i * cols + k, b = (i + 1) * cols + k, c = i * cols + k + 1, d = (i + 1) * cols + k + 1;
    if (orient > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
  }
  return { pos: P, nrm: N, g: G, lin: L, idx, rows: nr, cols, skinBones: meta.skinBones };
}

void vnoise;
