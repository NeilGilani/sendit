// The crash ragdoll's body: 11 capsule bodies on the Quaternius rig's bones (pelvis, chest, head, upper /
// lower arms, upper / lower legs; a snowboard as a 12th body strapped to both boots), their joints with
// limits (hinged knees and elbows, cone + twist hips, shoulders, spine and neck), muscle tone toward a
// protective tuck, released skis / poles as loose bodies, and the seeding from the crash.
//
// Everything is built from a "seed": the rig's bone transforms in world space at the crash, the bones' rest
// rotations (armature space: +X = the rider's left, +Y up, +Z forward) and the gear transforms. The rest
// rotations define what "straight" and "bent" mean for every joint whatever pose the crash starts in.
import * as THREE from 'three';
import { Body, Joint, World, capsuleInertia } from './solver.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const conj = (q, out = new THREE.Quaternion()) => out.set(-q.x, -q.y, -q.z, q.w);

/** Bones the seed must carry (world p, q) and their rest rotations. */
export const SEED_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r',
  'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r',
  'foot_l', 'foot_r', 'ball_l', 'ball_r'];

/**
 * Build the ragdoll world from a seed.
 * seed = { type: 'ski' | 'snowboard', bones: { name: { p, q } }, rest: { name: Quaternion },
 *          gear: { skis: [{ p, q, len }] | null, poles: [{ p, q, len }], board: { p, q, len, w } | null }, eject: bool }
 * env  = { height(x, z), normal(x, z, out), obstacles: [], rails: [] }
 */
export function buildHumanoid(seed, env, C) {
  const world = new World(env, { ...C, wallPen: C.wallPen ?? 0.25 });
  // Snow under the crash: hardpack (0) … deep powder (1): the jacket grips more and the body digs in further.
  const pw = Math.min(1, Math.max(0, seed.powder || 0));
  const muBody = C.muSnow + (C.muPowder || 0) * pw, muSBody = C.muStaticSnow + (C.muPowder || 0) * pw;
  const ploughBody = C.plough * (1 + (C.ploughPowder || 0) * pw);
  const B = seed.bones, R = seed.rest, M = C.mass, RA = C.radius;
  const P = (n) => B[n].p;
  const parts = {};
  const bodies = [];

  /** A body driven by `bone`, capsule axis `axis` (world), centre of mass `com`, shapes in world coordinates. */
  function body(name, bone, axis, com, mass, shapes, opts = {}) {
    const Qb0 = bone ? B[bone].q : opts.qFrame;
    const ax = axis.clone().normalize();
    const Qb = new THREE.Quaternion().setFromUnitVectors(_a.copy(Y).applyQuaternion(Qb0), ax).multiply(Qb0);
    const main = shapes[0];
    const L = main.kind === 'c' ? main.a.distanceTo(main.b) : 0;
    const b = new Body({ name, mass, inertia: opts.inertia || capsuleInertia(mass, main.r, L), x: com, q: Qb, group: opts.group || 0,
      mu: opts.mu ?? muBody, muS: opts.muS ?? muSBody, plough: opts.plough ?? ploughBody, ploughSpin: opts.ploughSpin ?? C.ploughSpin, e: C.restitution });
    const inv = conj(Qb);
    const loc = (p) => p.clone().sub(com).applyQuaternion(inv);
    for (const s of shapes) {
      const sh = { kind: s.kind, a: loc(s.a), b: s.kind === 'c' ? loc(s.b) : null, r: s.r };
      b.shapes.push(sh);
      if (s.collide === false) continue;
      if (s.kind === 's') b.samples.push({ p: sh.a.clone(), r: s.r });
      else {
        const n = s.samples ?? 3;
        for (let i = 0; i < n; i++) b.samples.push({ p: sh.a.clone().lerp(sh.b, n === 1 ? 0.5 : i / (n - 1)), r: s.r });
      }
    }
    b.bone = bone;
    // Rest orientation of the body (armature space): body = bone · off⁻¹, off = Qb⁻¹ · Qbone.
    if (R && R[bone]) b.restQ = R[bone].clone().multiply(conj(Qb0)).multiply(Qb);
    b.isHand = !!opts.hand;
    world.add(b);
    bodies.push(b);
    parts[name] = b;
    return b;
  }
  const C_ = (a, b2, r, o = {}) => ({ kind: 'c', a: a.clone(), b: b2.clone(), r, ...o });
  const S_ = (a, r, o = {}) => ({ kind: 's', a: a.clone(), r, ...o });
  const lerp = (a, b2, t) => a.clone().lerp(b2, t);
  const up = (bone, d) => P(bone).clone().add(_c.copy(Y).applyQuaternion(B[bone].q).multiplyScalar(d));

  // ---- trunk
  const hipL = P('thigh_l'), hipR = P('thigh_r'), hipMid = lerp(hipL, hipR, 0.5);
  const pelvis = body('pelvis', 'pelvis', _b.subVectors(hipL, hipR), lerp(hipMid, P('spine_01'), 0.3), M.pelvis,
    [C_(hipL, hipR, RA.pelvis), S_(lerp(hipMid, P('spine_01'), 0.6), RA.pelvis * 0.95)]);
  const neck = P('neck_01');
  const chestLo = lerp(P('spine_01'), P('spine_02'), 0.6);
  const chestTop = lerp(P('spine_03'), neck, 0.55);
  const chest = body('chest', 'spine_03', _b.copy(Y).applyQuaternion(B.spine_03.q), lerp(chestLo, chestTop, 0.55), M.chest,
    [C_(chestLo, chestTop, RA.chest, { samples: 3 }), C_(P('upperarm_l'), P('upperarm_r'), RA.shoulders, { samples: 3 })]);
  const headC = up('Head', 0.1);
  const head = body('head', 'Head', _b.copy(Y).applyQuaternion(B.Head.q), lerp(headC, neck, 0.12), M.head,
    [S_(headC, RA.head), C_(neck, headC, RA.neck, { collide: false })],
    { inertia: new THREE.Vector3().setScalar(0.4 * M.head * RA.head * RA.head * 0.85) });

  // ---- limbs
  for (const [s, S] of [['_l', 'L'], ['_r', 'R']]) {
    const sh = P('upperarm' + s), el = P('lowerarm' + s), wr = P('hand' + s);
    body('upperarm' + S, 'upperarm' + s, _b.subVectors(el, sh), lerp(sh, el, 0.45), M.upperarm, [C_(sh, el, RA.upperarm)]);
    const handEnd = wr.clone().addScaledVector(_b.subVectors(wr, el).normalize(), 0.085);
    body('forearm' + S, 'lowerarm' + s, _b.subVectors(handEnd, el), lerp(el, handEnd, 0.45), M.forearm,
      [C_(el, wr, RA.forearm), S_(handEnd, RA.hand)], { hand: true });
    const hp = P('thigh' + s), kn = P('calf' + s), an = P('foot' + s), toe = P('ball' + s);
    body('thigh' + S, 'thigh' + s, _b.subVectors(kn, hp), lerp(hp, kn, 0.45), M.thigh, [C_(hp, kn, RA.thigh), S_(lerp(hp, kn, 0.8), RA.thigh, { collide: false })]);
    body('shin' + S, 'calf' + s, _b.subVectors(an, kn), lerp(kn, an, 0.62), M.shin + M.boot,
      [C_(kn, an, RA.shin), C_(an, toe, RA.boot, { samples: 2 })]);
  }

  // ---- gear: skis (released or still on), poles (always out of the hands), the snowboard (strapped on)
  const loose = [];
  const attach = [];   // rigid attachments for write-back: { kind, index, body, pSeed, qSeed }
  let group = 1;
  const g = seed.gear || {};
  if (g.skis) g.skis.forEach((sk, i) => {
    const L = sk.len || 1.7;
    const at = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(sk.q).add(sk.p);
    const tip = at(0, -L * 0.55), tail = at(0, L * 0.45);
    if (seed.eject) {
      // Flat: both edges (a single round capsule would roll down the hill like a log).
      const b = body(`ski${i}`, null, _b.subVectors(tail, tip), lerp(tip, tail, 0.5), M.ski,
        [C_(at(0.03, -L * 0.55), at(0.03, L * 0.45), 0.02, { samples: 4 }), C_(at(-0.03, -L * 0.55), at(-0.03, L * 0.45), 0.02, { samples: 4 })],
        { group: group++, mu: C.muGear, muS: C.muGear * 1.3, plough: C.ploughGear, ploughSpin: 6, qFrame: sk.q });
      loose.push({ kind: 'ski', index: i, body: b, pSeed: sk.p.clone(), qSeed: sk.q.clone() });
    } else {
      // Still clipped in: the ski is part of the boot (shin) body.
      const shin = parts[i === 0 ? 'shinL' : 'shinR'];
      const inv = conj(shin.q);
      const sh = { kind: 'c', a: tip.clone().sub(shin.x).applyQuaternion(inv), b: tail.clone().sub(shin.x).applyQuaternion(inv), r: 0.024 };
      shin.shapes.push(sh);
      // (the ski's base slides: it grips less than the jacket, so a crash with the skis on carries further)
      // Along the ski only: across it the edge bites like the body does (and holds it on a slope at rest).
      const axis = sh.b.clone().sub(sh.a).normalize();
      for (let k = 0; k < 5; k++) shin.samples.push({ p: sh.a.clone().lerp(sh.b, k / 4), r: 0.024, mu: muBody, muS: muSBody, muAlong: C.muSkiOn ?? muBody, axis, gear: 'ski' + i });
      // … with its mass and its long lever in the boot body's inertia (a light shin swinging a 1.7 m ski
      // would be whipped round by every touch of the tip).
      const d2 = sh.a.clone().lerp(sh.b, 0.5).lengthSq(), Iadd = M.ski * (L * L / 12 + d2);
      shin.I.addScalar(Iadd); shin.invI.set(1 / shin.I.x, 1 / shin.I.y, 1 / shin.I.z);
      shin.m += M.ski; shin.invM = 1 / shin.m;
      attach.push({ kind: 'ski', index: i, body: shin, pSeed: sk.p.clone(), qSeed: sk.q.clone() });
    }
  });
  if (g.poles) g.poles.forEach((pl, i) => {
    const L = pl.len || 1.2;
    const tip = new THREE.Vector3(0, -L, 0).applyQuaternion(pl.q).add(pl.p);
    const b = body(`pole${i}`, null, _b.subVectors(pl.p, tip), lerp(pl.p, tip, 0.42), M.pole, [C_(pl.p, tip, 0.016, { samples: 3 })],
      { group: group++, mu: C.muGear * 1.4, muS: C.muGear * 1.8, plough: C.ploughGear * 1.5, ploughSpin: 8, qFrame: pl.q });
    loose.push({ kind: 'pole', index: i, body: b, pSeed: pl.p.clone(), qSeed: pl.q.clone() });
  });
  let board = null;
  if (g.board) {
    const bd = g.board, L = bd.len || 1.55, w = (bd.w || 0.25) * 0.42;
    const pt = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(bd.q).add(bd.p);
    board = body('board', null, _b.subVectors(pt(0, L * 0.45), pt(0, -L * 0.45)), bd.p.clone(), M.board,
      [C_(pt(w, -L * 0.46), pt(w, L * 0.46), 0.022, { samples: 4 }), C_(pt(-w, -L * 0.46), pt(-w, L * 0.46), 0.022, { samples: 4 })], { qFrame: bd.q });
    attach.push({ kind: 'board', body: board, pSeed: bd.p.clone(), qSeed: bd.q.clone() });
  }

  // ---- joints
  const LIM = C.limits;
  const joints = {};
  const restDir = (b) => _a.copy(Y).applyQuaternion(b.restQ).clone();
  /** Rotation (armature frame) tilting direction d by `fwd` toward +Z and `down` toward −Y (degrees). */
  const tilt = (d, fwd, down) => {
    const q = new THREE.Quaternion();
    const af = _b.crossVectors(d, Z);
    if (fwd && af.lengthSq() > 1e-6) q.premultiply(_q.setFromAxisAngle(af.normalize(), fwd * DEG));
    const d2 = d.clone().applyQuaternion(q);
    const ad = _b.crossVectors(d2, _c.set(0, -1, 0));
    if (down && ad.lengthSq() > 1e-6) q.premultiply(_q.setFromAxisAngle(ad.normalize(), down * DEG));
    return q;
  };
  const anchors = (p, c, at) => ({ r0: at.clone().sub(p.x).applyQuaternion(conj(p.q)), r1: at.clone().sub(c.x).applyQuaternion(conj(c.q)) });
  function ball(name, kind, p, c, at, lim) {
    const d = restDir(c);
    const cen = tilt(d, lim.centre?.[0] || 0, lim.centre?.[1] || 0);
    const iP = conj(p.restQ);
    const j = new Joint(p, c, {
      name, kind, type: 'ball', ...anchors(p, c, at),
      aP: d.clone().applyQuaternion(cen).applyQuaternion(iP), aC: Y.clone(), cone: lim.cone * DEG,
      tC: X.clone(), tP: X.clone().applyQuaternion(c.restQ).applyQuaternion(cen).applyQuaternion(iP), twist: lim.twist * DEG,
      damp: C.jointDamping[kind] || 0,
    });
    j.qRest = iP.clone().multiply(c.restQ);
    world.joint(j);
    joints[name] = j;
    return j;
  }
  function hinge(name, kind, p, c, at, [lo, hi], flexDir) {
    const d = restDir(c);
    const axis = _b.crossVectors(d, flexDir).normalize().clone();
    const iP = conj(p.restQ);
    const hP = axis.clone().applyQuaternion(iP);
    // The child's hinge axis is the parent's as the crash finds them: an animated knee / elbow is not always an
    // exact hinge (IK twist), and aligning it in the first sub-steps would twist the limb with a pop.
    const hC = hP.clone().applyQuaternion(p.q).applyQuaternion(conj(c.q));
    const refC = _c.crossVectors(hC, Y).lengthSq() > 1e-4 ? _c.crossVectors(hC, Y).normalize().clone() : X.clone();
    const refP = refC.clone().applyQuaternion(c.restQ).applyQuaternion(iP);
    refP.addScaledVector(hP, -refP.dot(hP)).normalize();
    const j = new Joint(p, c, {
      name, kind, type: 'hinge', ...anchors(p, c, at),
      hP, hC, refC, refP,
      min: lo * DEG, max: hi * DEG, damp: C.jointDamping[kind] || 0,
    });
    j.axisArm = axis;
    j.qRest = iP.clone().multiply(c.restQ);
    world.joint(j);
    joints[name] = j;
    return j;
  }
  ball('spine', 'spine', pelvis, chest, P('spine_02'), LIM.spine);
  ball('neck', 'neck', chest, head, neck, LIM.neck);
  const fwd = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(0, 0, -1);
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? '_l' : '_r';
    ball('shoulder' + S, 'shoulder', chest, parts['upperarm' + S], P('upperarm' + s), LIM.shoulder);
    hinge('elbow' + S, 'elbow', parts['upperarm' + S], parts['forearm' + S], P('lowerarm' + s), LIM.elbow, fwd);
    ball('hip' + S, 'hip', pelvis, parts['thigh' + S], P('thigh' + s), LIM.hip);
    hinge('knee' + S, 'knee', parts['thigh' + S], parts['shin' + S], P('calf' + s), LIM.knee, back);
  }
  if (board) {
    for (const S of ['L', 'R']) {
      const shin = parts['shin' + S], at = P(S === 'L' ? 'foot_l' : 'foot_r');
      const iS = conj(shin.q);
      const j = new Joint(shin, board, {
        name: 'ankle' + S, kind: 'ankle', type: 'ball', ...anchors(shin, board, at),
        aP: Y.clone().applyQuaternion(board.q).applyQuaternion(iS), aC: Y.clone(), cone: LIM.ankle.cone * DEG,
        tC: X.clone(), tP: X.clone().applyQuaternion(board.q).applyQuaternion(iS), twist: LIM.ankle.twist * DEG,
        damp: C.jointDamping.ankle || 0,
      });
      j.qRest = iS.clone().multiply(board.q);
      world.joint(j);
      joints['ankle' + S] = j;
    }
  }

  // ---- muscle tone targets (the protective tuck), relative to rest
  const T = C.tuck;
  const flexTarget = (j, deg, flexDir) => {
    const d = restDir(j.b1);
    const axis = j.axisArm || _b.crossVectors(d, flexDir).normalize().clone();
    const Rf = new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
    return conj(j.b0.restQ).multiply(Rf).multiply(j.b1.restQ);
  };
  joints.spine.tuck = flexTarget(joints.spine, T.spine, fwd);
  joints.neck.tuck = flexTarget(joints.neck, T.neck, fwd);
  for (const S of ['L', 'R']) {
    const side = S === 'L' ? 1 : -1;
    joints['hip' + S].tuck = flexTarget(joints['hip' + S], T.hip, fwd);
    joints['knee' + S].tuck = flexTarget(joints['knee' + S], T.knee, back);
    joints['elbow' + S].tuck = flexTarget(joints['elbow' + S], T.elbow, fwd);
    const sh = joints['shoulder' + S], d = restDir(sh.b1);
    const want = new THREE.Vector3(T.shoulder[0] * side, T.shoulder[1], T.shoulder[2]).normalize();
    sh.tuck = conj(chest.restQ).multiply(new THREE.Quaternion().setFromUnitVectors(d, want)).multiply(sh.b1.restQ);
  }
  for (const j of Object.values(joints)) { j.qT = (j.tuck || j.qRest).clone(); j.k = 0; j.maxErr = C.toneMaxErr?.[j.kind] ?? 0; }

  // ---- self-collision: limbs can't pass through the trunk or each other
  const main = (n) => [parts[n], parts[n].shapes[0]];
  const pair = (a, b2, ia = 0, ib = 0) => C.selfCollide !== false && !(C.pairSkip && new RegExp(C.pairSkip).test(a + '-' + b2)) && world.pairs.push([parts[a], parts[a].shapes[ia], parts[b2], parts[b2].shapes[ib]]);
  for (const S of ['L', 'R']) {
    const O = S === 'L' ? 'R' : 'L';
    pair('forearm' + S, 'chest'); pair('forearm' + S, 'pelvis'); pair('forearm' + S, 'head');
    pair('forearm' + S, 'thighL'); pair('forearm' + S, 'thighR'); pair('upperarm' + S, 'pelvis');
    pair('shin' + S, 'thigh' + O); pair('shin' + S, 'chest'); pair('thigh' + S, 'chest', 1, 0);   // (the knee end: the hip end sits against the trunk by design)
    pair('forearm' + S, 'shin' + S); pair('forearm' + S, 'shin' + O);
  }
  pair('shinL', 'shinR'); pair('forearmL', 'forearmR'); pair('head', 'thighL'); pair('head', 'thighR');
  pair('head', 'pelvis'); pair('shinL', 'shinR', 1, 1);
  void main;

  const human = bodies.filter((b) => b.group === 0);
  return { world, parts, joints, human, loose, attach, board };
}

/**
 * Give the ragdoll the rider's momentum. vCom / w: the body's linear / angular velocity from the last animated
 * frames (rig.js); cause: { kind, reason }; groundN: the snow's normal under the rider; rnd(): 0..1.
 */
export function seedMotion(H, { vCom, w, com, cause, groundN, rnd, C }) {
  const { parts, human, loose } = H;
  for (const b of human) {
    b.v.copy(w).cross(_a.subVectors(b.x, com)).add(vCom);
    b.w.copy(w);
  }
  const kind = cause?.kind || 'landing', reason = cause?.reason;
  // The edges / the landing catch the feet: the legs stop sliding, the upper body carries on over them.
  const catchK = kind === 'landing' ? (C.feetCatch[reason] ?? C.feetCatch.landing) : kind === 'compression' ? C.feetCatch.compression : 0;
  if (catchK > 0) {
    const n = groundN || Y;
    for (const [name, k] of [['shinL', 1], ['shinR', 1], ['board', 1], ['thighL', 0.45], ['thighR', 0.45]]) {
      const b = parts[name];
      if (!b) continue;
      const vn = b.v.dot(n);
      b.v.addScaledVector(_b.copy(b.v).addScaledVector(n, -vn), -catchK * k);
    }
  }
  // Rail bail: thrown off the side.
  if (kind === 'rail' && reason === 'balance') {
    const side = _b.set(-vCom.z, 0, vCom.x);
    if (side.lengthSq() > 1e-6) {
      side.normalize().multiplyScalar(rnd() < 0.5 ? -1 : 1);
      for (const b of human) { const h = b.x.y - com.y; b.v.addScaledVector(side, 0.8 + Math.max(0, h) * 2.5); }
    }
  }
  // A little twist of its own, so no two falls look alike.
  const tw = (rnd() - 0.5) * 1.6;
  for (const b of human) b.w.y += tw;
  // Released gear: each piece leaves with the limb it was on, kicked off a little sideways and spinning.
  for (const L of loose) {
    const b = L.body;
    const from = L.kind === 'ski' ? parts[L.index === 0 ? 'shinL' : 'shinR'] : parts[L.index === 0 ? 'forearmL' : 'forearmR'];
    if (from) {
      from.velAt(_a.subVectors(b.x, from.x), b.v);
      b.w.copy(from.w);
    }
    const sgn = L.index === 0 ? -1 : 1;
    if (L.kind === 'ski') { b.v.add(_b.set(sgn * (0.6 + rnd()), 0.8 + rnd() * 0.8, 0)); b.w.add(_b.set((rnd() - 0.5) * 4, sgn * (2 + rnd() * 4), (rnd() - 0.5) * 3)); }
    else { b.v.add(_b.set(sgn * rnd() * 0.8, 0.5 * rnd(), 0)); b.w.add(_b.set((rnd() - 0.5) * 6, (rnd() - 0.5) * 3, (rnd() - 0.5) * 6)); }
  }
}

/**
 * Move each group out of whatever it starts inside: trees / rocks sideways (away from the trunk), then the snow
 * upward. The seed reference (xs) stays, and body.shift lets the drawing ease the move in over the blend.
 * Returns the group-0 shift.
 */
export function depenetrate(H, env, maxLift = 0.8, maxPush = 1.2, maxLiftGear = 2) {
  const W = H.world;
  const n = new THREE.Vector3(), p = new THREE.Vector3(), com = new THREE.Vector3();
  const shifts = new Map();
  const move = (gid, d) => {
    for (const b of W.bodies) if (b.group === gid) { b.x.add(d); b.xr.add(d); (b.shift ||= new THREE.Vector3()).add(d); }
    (shifts.get(gid) || shifts.set(gid, new THREE.Vector3()).get(gid)).add(d);
  };
  for (const gid of W.groups.keys()) {
    for (const o of env.obstacles) {
      W.com(gid, com);
      let ux = com.x - o.x, uz = com.z - o.z;
      const ul = Math.hypot(ux, uz);
      if (ul < 1e-4) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
      let need = 0;
      for (const b of W.bodies) {
        if (b.group !== gid) continue;
        for (const s of b.samples) {
          b.point(s.p, p);
          if (p.y > o.y1 + s.r || p.y < o.y0 - 1) continue;
          if (o.cap && p.distanceTo(n.set(o.x, o.y1 - o.r, o.z)) >= o.r + s.r) continue;   // (rocks are domes)
          const R = o.r + s.r + 0.005, qx = p.x - o.x, qz = p.z - o.z;
          const qu = qx * ux + qz * uz, c = qx * qx + qz * qz - R * R;
          if (c >= 0) continue;
          need = Math.max(need, -qu + Math.sqrt(qu * qu - c));
        }
      }
      if (need > 0) move(gid, n.set(ux, 0, uz).multiplyScalar(Math.min(need, maxPush)));
    }
    let lift = 0;
    for (const b of W.bodies) {
      if (b.group !== gid) continue;
      for (const s of b.samples) {
        b.point(s.p, p);
        env.normal(p.x, p.z, n);
        lift = Math.max(lift, env.height(p.x, p.z) + s.r / Math.max(0.3, n.y) + 0.002 - p.y);
      }
    }
    if (lift > 0) move(gid, n.set(0, Math.min(lift, gid === 0 ? maxLift : maxLiftGear), 0));
  }
  return shifts.get(0) || new THREE.Vector3();
}

/**
 * Muscle tone for this moment: strong at first, relaxing to C.toneEnd (× rest: 0 once the body lies still, so no
 * muscle keeps nudging a limb against the snow or a trunk); while bracing the arms reach toward `braceDir` (world).
 */
export function updateTone(H, t, dt, braceDir, C, rest = 1, hold = 0) {
  // Protective tone holds while the body is still moving (hold: 0..1 from its speed) and only fades with time
  // once it slows down; `rest` takes it to limp when the body lies still.
  const relax = (C.toneEnd + (1 - C.toneEnd) * Math.max(Math.exp(-t / C.toneTau), hold)) * rest;
  const bracing = !!braceDir;
  for (const j of Object.values(H.joints)) {
    const arm = j.kind === 'shoulder' || j.kind === 'elbow';
    j.k = (C.tone[j.kind] || 0) * relax * (bracing && arm ? C.braceTone : 1);
  }
  for (const S of ['L', 'R']) {
    const sh = H.joints['shoulder' + S], el = H.joints['elbow' + S];
    if (bracing) {
      // Reach: the upper arm toward the snow ahead, the elbow nearly straight.
      const dP = _a.copy(braceDir).applyQuaternion(conj(sh.b0.q, _q)).normalize();
      const aRest = _b.copy(Y).applyQuaternion(sh.qRest);
      sh.qT.setFromUnitVectors(aRest, dP).multiply(sh.qRest);
      el.qT.copy(el.qRest).slerp(el.tuck, 0.2);
    } else {
      const k = 1 - Math.exp(-5 * dt);
      sh.qT.slerp(sh.tuck, k);
      el.qT.slerp(el.tuck, k);
    }
  }
  void _q2;
}
