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
 * Build the outfit geometry. `cut` (from outfits.js) sets lengths and ease:
 *   { hemFront, hemBack, jacketEase, sleeveEase, pantsEase, cuffY, stack, gaiter, hood, mitts }
 */
export function buildOutfitGeometry(body, cut) {
  const pieces = [];
  const B = (re) => body.bones(re);
  const J = body.joint;

  let collarRings = null;
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
      ease: (t, th) => 0.026 + smooth(1.56, cut.collarTop, t) * 0.012 + Math.max(0, Math.cos(th)) * 0.01,
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
  {
    const segs = 56;
    const hemF = cut.hemFront, hemB = cut.hemBack;
    const top = 1.575, bot = Math.max(hemF, hemB);
    const bones = B(/^(pelvis|spine_0[123]|neck_01|clavicle_[lr]|upperarm_[lr]|thigh_[lr])$/);
    const rings = bodyRings(body, {
      axis: 'y', t0: top, t1: bot, rings: 46, segs, half: 0.03, bones,
      axisPoint: (t) => new THREE.Vector3(0, t, 0),
      filter: (x, y, z, b) => (b.startsWith('upperarm') ? Math.abs(x) < 0.2 : b.startsWith('neck') ? y < 1.56 : true),
      centre: (t, c) => new THREE.Vector3(0, t, c.z),
      smoothA: 8, smoothT: 5, minEase: -0.028,   // the skin underneath is pulled in 4 cm: no muscles through the shell
      ease: (t, th) => {
        const back = (1 - Math.cos(th)) / 2;            // 0 front … 1 back
        const side = Math.abs(Math.sin(th));
        let e = THREE.MathUtils.lerp(cut.jacketEase.chest, cut.jacketEase.hem, smooth(1.3, 0.75, t));
        e = THREE.MathUtils.lerp(cut.jacketEase.shoulder, e, smooth(1.53, 1.42, t));
        return e + back * 0.012 + side * 0.006;
      },
      post: (rings, S) => {
        // The superhero chest is far deeper than a real one: flatten the front of the upper body a little
        // (the skin underneath is pulled in further than this).
        for (const r of rings) {
          const k = 0.05 * smooth(1.05, 1.25, r.t) * (1 - smooth(1.5, 1.58, r.t));
          for (let q = 0; q < S; q++) r.r[q] *= 1 - k * Math.max(0, Math.cos((q / S) * TAU)) ** 2;
        }
        // Fabric drops straight from the chest and shoulder blades: never nipped in at the waist.
        hang(rings, S, 1.32, 0.05);
        // Shoulder line: the shell slopes from the collar down to the armholes (no boxy epaulettes).
        for (const r of rings) {
          const k = smooth(1.36, 1.6, r.t) * 0.52;
          for (let q = 0; q < S; q++) {
            const sd = Math.pow(Math.abs(Math.sin((q / S) * TAU)), 1.6);
            r.r[q] = Math.max(r.r[q] * (1 - k * sd), r.raw[q] + 0.004);
          }
        }
        // Neckline: the top of the shell tucks under the collar (which is sewn on over it).
        for (const r of rings) {
          if (r.t < 1.525) continue;
          const cr = collarAt(collarRings, r.t, S);
          const w = smooth(1.525, 1.56, r.t);
          for (let q = 0; q < S; q++) r.r[q] = THREE.MathUtils.lerp(r.r[q], Math.min(r.r[q], cr[q] - 0.006), w);
        }
        // Hem: a little flare.
        for (const r of rings) {
          const f = smooth(0.8, bot, r.t) * 0.012;
          for (let k = 0; k < S; k++) r.r[k] += f;
        }
      },
    });
    const S = segs;
    for (const r of rings) {
      r.off = new Float32Array(S);
      const below = smooth(1.22, 0.8, r.t);
      for (let k = 0; k < S; k++) {
        const th = (k / S) * TAU, u = k / S;
        // Dropped back hem: the lowest rings sag toward the back.
        const back = (1 - Math.cos(th)) / 2;
        r.off[k] = -(hemF - hemB) * back * smooth(1.05, bot, r.t);
        // Vertical drape folds below the chest, horizontal bunching above the hips at the back/sides.
        const drape = pnoise(u * 9 + r.t * 1.5, r.t * 2.5, 9) * 0.006 + Math.sin(th * 7 + pnoise(u * 3, r.t * 3, 3) * 2.5) * 0.0035;
        const bunch = Math.sin((r.t - 1.0) * TAU / 0.055 + pnoise(u * 6, 1.7, 6) * 2) * 0.0035 * bump(r.t, 1.05, 0.12) * (0.4 + back * 0.6);
        const lump = pnoise(u * 5, r.t * 4 + 3.1, 5) * 0.004;
        r.r[k] += drape * below + bunch + lump * smooth(1.45, 1.2, r.t);
      }
    }
    // Only the top of the shoulder rides on the upper arm (like a deltoid); the armpit stays with the trunk.
    pieces.push(sweep(rings, {
      id: PIECE.jacket, side: 0, ...frame('y'), lipEnd: true, skinBones: bones,
      skinMask: (b, x, y) => !b.startsWith('upperarm') || (y > 1.45 && Math.abs(x) > 0.13),
      // …and only partly, at the outer edge: the chest panel stays flat when the arms reach forward.
      weightLimit: (b, x, y) => (b.startsWith('upperarm') ? 0.55 * smooth(0.15, 0.23, Math.abs(x)) * smooth(1.43, 1.5, y) : undefined),
    }));
  }

  // ---------------------------------------------------------------- sleeves
  for (const s of [1, -1]) {
    const segs = 28;
    const sd = s > 0 ? 'l' : 'r';
    const bones = B(new RegExp(`^(upperarm_${sd}|lowerarm_${sd}|clavicle_${sd})$`));
    const t0 = 0.19, t1 = cut.sleeveEnd;
    const rings = bodyRings(body, {
      axis: 'x', side: s, t0, t1, rings: 34, segs, half: 0.022, bones,
      axisPoint: (t) => new THREE.Vector3(s * t, J['upperarm_' + sd].y, J['upperarm_' + sd].z),
      filter: (x, y) => y > 1.3,
      smoothA: 2, smoothT: 3, minEase: 0.012,
      ease: (t) => {
        let e = THREE.MathUtils.lerp(cut.sleeveEase.upper, cut.sleeveEase.elbow, smooth(0.25, 0.46, t));
        e = THREE.MathUtils.lerp(e, cut.sleeveEase.forearm, smooth(0.48, 0.6, t));
        return e;
      },
      post: (rings, S) => {
        // Cinched cuff: the last few cm pull in to the wrist (Velcro tab), the fabric above bunches.
        for (const r of rings) {
          const w = smooth(t1 - 0.06, t1, r.t);
          for (let k = 0; k < S; k++) r.r[k] = THREE.MathUtils.lerp(r.r[k], r.raw[k] + 0.014, w * 0.85);
          // Slim sleeve head: it sits inside the jacket's shoulder and only widens past the armhole.
          const head = THREE.MathUtils.lerp(0.74, 1, smooth(0.2, 0.33, r.t));
          for (let k = 0; k < S; k++) r.r[k] *= head;
          // Near the armhole the top of the sleeve follows the sloped shoulder line of the body shell.
          if (r.t < 0.34) {
            const lim = 1.575 - (r.t - 0.08) * 0.42 - r.c.y - 0.02 * smooth(0.3, 0.2, r.t);
            for (let k = 0; k < S; k++) {
              const up = Math.cos((k / S) * TAU);
              if (up > 0.05) r.r[k] = Math.max(Math.min(r.r[k], lim / up), r.raw[k] - 0.01);
            }
          }
        }
      },
    });
    for (const r of rings) {
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * TAU, u = k / segs;
        const inner = Math.max(0, Math.sin(th));          // front of the arm = inside of the elbow bend
        const elbow = Math.sin((r.t - 0.46) * TAU / 0.05 + pnoise(u * 4, 2.3, 4) * 1.5) * 0.006 * bump(r.t, 0.46, 0.08) * (0.35 + inner * 0.9);
        const wrist = Math.sin((r.t - t1) * TAU / 0.028 + pnoise(u * 5, 4.1, 5) * 2.2) * 0.006 * bump(r.t, t1 - 0.07, 0.05);
        const twist = pnoise(u * 4 + r.t * 3, r.t * 5, 4) * 0.004;
        r.r[k] += elbow + wrist + twist;
      }
    }
    // The armhole end stays with the shoulder girdle (clavicle) and blends into the arm, so the sleeve
    // head never swings out through the chest or back when the arm reaches.
    pieces.push(sweep(rings, {
      id: PIECE.sleeve, side: s, ...frame('x', s), lipEnd: true,
      skinBones: B(new RegExp(`^(upperarm_${sd}|lowerarm_${sd}|clavicle_${sd}|spine_03|hand_${sd})$`)),
      anchor: { bone: body.bone('clavicle_' + sd), axis: 0, abs: true, y0: 0.2, y1: 0.28 },
    }));
  }

  // ---------------------------------------------------------------- pant legs
  for (const s of [1, -1]) {
    const segs = 36;
    const sd = s > 0 ? 'l' : 'r';
    const bones = B(new RegExp(`^(thigh_${sd}|calf_${sd}|foot_${sd}|ball_${sd}|pelvis)$`));
    const t0 = 1.02, t1 = cut.cuffY;
    const knee = J['calf_' + sd].y;
    const rings = bodyRings(body, {
      axis: 'y', t0, t1, rings: 52, segs, half: 0.025, bones,
      axisPoint: (t) => new THREE.Vector3(s * 0.114, t, -0.04),
      filter: (x, y, z, b) => (b === 'pelvis' ? x * s > 0.015 : true) && (y > 0.14 || z < 0.0),
      smoothA: 3, smoothT: 4, smoothC: 5, minEase: 0.015,
      ease: (t) => {
        let e = THREE.MathUtils.lerp(cut.pantsEase.thigh, cut.pantsEase.knee, smooth(0.8, knee, t));
        e = THREE.MathUtils.lerp(e, cut.pantsEase.cuff, smooth(knee, 0.25, t));
        return e;
      },
      post: (rings, S) => {
        // Straight, wide leg: below the knee the leg never narrows (bootcut over the boot).
        hang(rings, S, knee + 0.05, 0.04);
      },
    });
    for (const r of rings) {
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * TAU, u = k / segs;
        const back = (1 - Math.cos(th)) / 2;
        // Boot stack: soft stacked rolls where the long inseam piles up on the boot.
        const st = cut.stack;
        const stackY = (r.t - st.y0) / (st.y1 - st.y0);
        const roll = stackY > -0.1 && stackY < 1.1 ? Math.pow(Math.max(0, Math.sin(stackY * Math.PI * st.n + pnoise(u * 5, 7.3 + s, 5) * 0.9)), 1.5) * st.amp : 0;
        // Knee: compression folds behind the knee, softer ones in front.
        const kf = Math.sin((r.t - knee) * TAU / 0.045 + pnoise(u * 4, 3.3 + s, 4) * 2) * bump(r.t, knee + 0.02, 0.09) * (0.002 + back * 0.006);
        // Long drape folds down the thigh and shin, a slight twist.
        const drape = pnoise(u * 6 + r.t * 2.2 * s, r.t * 2, 6) * 0.006;
        r.r[k] += roll + kf + drape;
        // Pre-bent knee: the fabric hangs forward of the kneecap.
        if (Math.cos(th) > 0) r.r[k] += Math.cos(th) * 0.012 * bump(r.t, knee, 0.12);
      }
    }
    pieces.push(sweep(rings, { id: PIECE.pants, side: s, ...frame('y'), lipEnd: true, gaiterEnd: true, skinBones: B(new RegExp(`^(thigh_${sd}|calf_${sd}|foot_${sd}|pelvis)$`)) }));
  }

  // ---------------------------------------------------------------- gaiter (pulled up under the goggle)
  if (cut.gaiter) {
    const segs = 40;
    const bones = B(/^(neck_01|Head)$/);
    const rings = bodyRings(body, {
      axis: 'y', t0: 1.555, t1: cut.gaiterTop, rings: 14, segs, half: 0.016, bones,
      axisPoint: (t) => new THREE.Vector3(0, t, 0),
      filter: (x, y, z, b) => b === 'Head' || b === 'neck_01',
      centre: (t, c) => new THREE.Vector3(0, t, c.z),
      smoothA: 2, smoothT: 2, minEase: 0.008,
      ease: (t) => THREE.MathUtils.lerp(0.02, 0.011, smooth(1.6, 1.65, t)),
    });
    for (const r of rings) for (let k = 0; k < segs; k++) {
      const u = k / segs;
      r.r[k] += Math.sin((r.t - 1.58) * TAU / 0.03 + pnoise(u * 5, 9.1, 5) * 2) * 0.003 * bump(r.t, 1.59, 0.03);
    }
    pieces.push(sweep(rings, { id: PIECE.gaiter, side: 0, ...frame('y'), lipEnd: true, skinBones: bones }));
  }

  // ---------------------------------------------------------------- stowed hood (a thick roll behind the neck)
  if (cut.hood === 'down') {
    const segs = 18, n = 22;
    const rings = [];
    const e1s = [], e2s = [];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1;                      // −1 … 1 across the back
      const a = f * THREE.MathUtils.degToRad(100);
      pts.push(new THREE.Vector3(Math.sin(a) * 0.125, 1.548 - f * f * 0.035 + (1 - f * f) * 0.01, -0.03 - Math.cos(a) * 0.14 + f * f * 0.025));
    }
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1;
      const T = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const out = new THREE.Vector3(pts[i].x, 0, pts[i].z + 0.03).normalize();
      const up = new THREE.Vector3().crossVectors(T, out).normalize();
      const o2 = new THREE.Vector3().crossVectors(up, T).normalize();
      const r = new Float32Array(segs);
      const thick = 0.036 * (1 - f * f * 0.55), tall = 0.046 * (1 - f * f * 0.45);
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * TAU;
        const ex = Math.cos(th), ey = Math.sin(th);
        r[k] = 1 / Math.sqrt((ex * ex) / (thick * thick) + (ey * ey) / (tall * tall)) + pnoise(k / segs * 4, f * 3, 4) * 0.004;
      }
      rings.push({ c: pts[i], r, t: f, e1: o2, e2: up });
      e1s.push(o2); e2s.push(up);
    }
    pieces.push(sweepFrames(rings, { id: PIECE.hood, side: 0, capStart: true, capEnd: true, skinBones: B(/^(spine_03|neck_01|clavicle_[lr])$/) }));
  }

  // ---------------------------------------------------------------- hood worn up, over the helmet
  if (cut.hood === 'up') {
    const fit = helmetFit(body, cut.helmetShape || {});
    const off = 0.019;                                        // clears the shell, strap and vents
    // Face opening / lower edge over |θ|: a stiff brim above the goggle, down the cheeks behind the
    // goggle's sides, then around the nape into the collar.
    const edge = [[0, 1.79], [36, 1.782], [52, 1.735], [64, 1.66], [78, 1.6], [110, 1.575], [180, 1.565]];
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
        smoothA: 3, smoothT: 2, minEase: 0.012,
        ease: (t) => THREE.MathUtils.lerp(cut.gauntlet[1], 0.016, smooth(a0 + 0.03, a1 - 0.01, t)),
      });
      for (const r of rings) for (let k = 0; k < segs; k++) r.r[k] += Math.sin(r.t * TAU / 0.03 + k) * 0.0015;
      pieces.push(sweep(rings, { id: PIECE.gauntlet, side: s, ...frame('x', s), lipStart: true, skinBones: bones }));
    }
  }

  for (const p of pieces) skinPiece(p, body);
  return mergePieces(pieces);
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
