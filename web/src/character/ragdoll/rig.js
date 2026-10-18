// The ragdoll ↔ the rider rig (rider.js). Two jobs, both outside the physics:
//   captureSeed(rider)   READ the posed rig at the crash (bone world transforms, rest rotations, gear) — never writes
//   applyPose(rider, …)  while crashed, write the bones and the loose gear from the ragdoll bodies
// Bone rotations come from the bodies' rotation since the seed (Δ = q · q_seed⁻¹), so the first ragdoll frame is
// exactly the last animated frame; the spine and neck share their body's rotation over their bones.
import * as THREE from 'three';
import { SEED_BONES } from './humanoid.js';

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const conj = (q, out) => out.set(-q.x, -q.y, -q.z, q.w);

const PARENT = {
  pelvis: 'root', spine_01: 'pelvis', spine_02: 'spine_01', spine_03: 'spine_02', neck_01: 'spine_03', Head: 'neck_01',
  clavicle_l: 'spine_03', upperarm_l: 'clavicle_l', lowerarm_l: 'upperarm_l', hand_l: 'lowerarm_l',
  clavicle_r: 'spine_03', upperarm_r: 'clavicle_r', lowerarm_r: 'upperarm_r', hand_r: 'lowerarm_r',
  thigh_l: 'pelvis', calf_l: 'thigh_l', foot_l: 'calf_l', ball_l: 'foot_l',
  thigh_r: 'pelvis', calf_r: 'thigh_r', foot_r: 'calf_r', ball_r: 'foot_r',
};
const ORDER = Object.keys(PARENT);

/** Read the posed rig (world matrices from the last rendered frame). Writes nothing. */
export function captureSeed(rider, fpPoleLength) {
  const bones = {}, rest = {}, local = {};
  for (const n of SEED_BONES) {
    const b = rider.bones[n];
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    b.matrixWorld.decompose(p, q, _s);
    bones[n] = { p, q };
    const rq = new THREE.Quaternion();
    rider.restGlobal.get(b).decompose(_v, rq, _s);
    rest[n] = rq;
    local[n] = b.quaternion.clone();
  }
  const gear = { skis: null, poles: [], board: null };
  const spec = rider.equip?.spec || {};
  const grab = (o) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); o.matrixWorld.decompose(p, q, _s); return { p, q }; };
  if (rider.board && rider.isBoard) gear.board = { ...grab(rider.board), len: spec.length || 1.55, w: spec.waist || 0.25 };
  else if (rider.skis) {
    gear.skis = rider.skis.map((m) => ({ ...grab(m), len: spec.length || 1.7 }));
    rider.poles?.forEach((m, i) => { if (m.visible) gear.poles.push({ ...grab(m), len: (rider.fp ? fpPoleLength : rider.poleLen) || 1.2, mesh: i }); });
  }
  return { type: rider.isBoard ? 'snowboard' : 'ski', bones, rest, local, gear };
}

/**
 * Pose the rig from the ragdoll. H = buildHumanoid(...) result, seed = captureSeed(...), alpha = render
 * interpolation between the last two frame steps, blend 0..1 (animated → ragdoll). The seed's depenetration
 * shift (body.shift, out of the snow / a trunk) is eased in with the blend so the body doesn't pop.
 */
export function applyPose(rider, H, seed, alpha, blend, renderPos) {
  const B = rider.bones;
  rider.root.position.copy(renderPos);
  rider.root.quaternion.identity();
  rider.chatter.position.set(0, 0, 0); rider.chatter.rotation.set(0, 0, 0);
  rider.visual.quaternion.identity(); rider.visual.position.set(0, 0, 0);
  rider.body.rotation.set(0, 0, 0); rider.body.scale.set(1, 1, 1);
  rider.chair.visible = false;
  for (const [b, r] of rider.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
  rider.root.updateMatrixWorld(true);

  // Interpolated body transforms and their rotation since the seed.
  const D = H._delta || (H._delta = new Map());
  for (const b of H.world.bodies) {
    let e = D.get(b);
    if (!e) D.set(b, e = { x: new THREE.Vector3(), q: new THREE.Quaternion(), d: new THREE.Quaternion() });
    e.x.lerpVectors(b.xr, b.x, alpha);
    e.q.slerpQuaternions(b.qr, b.q, alpha);
    e.d.copy(e.q).multiply(conj(b.qs, _q));
  }
  const P = H.parts, d = (n) => D.get(P[n]).d;
  const S = seed.bones;
  const W = H._W || (H._W = Object.fromEntries(ORDER.map((n) => [n, new THREE.Quaternion()])));
  const rel = (child, parent, out) => out.copy(conj(S[parent].q, _q)).multiply(S[child].q);   // seed child-in-parent
  W.pelvis.copy(d('pelvis')).multiply(S.pelvis.q);
  W.spine_01.slerpQuaternions(d('pelvis'), d('chest'), 1 / 3).multiply(S.spine_01.q);
  W.spine_02.slerpQuaternions(d('pelvis'), d('chest'), 2 / 3).multiply(S.spine_02.q);
  W.spine_03.copy(d('chest')).multiply(S.spine_03.q);
  W.neck_01.slerpQuaternions(d('chest'), d('head'), 0.5).multiply(S.neck_01.q);
  W.Head.copy(d('head')).multiply(S.Head.q);
  for (const [s, X] of [['_l', 'L'], ['_r', 'R']]) {
    W['clavicle' + s].copy(W.spine_03).multiply(rel('clavicle' + s, 'spine_03', _q2));
    W['upperarm' + s].copy(d('upperarm' + X)).multiply(S['upperarm' + s].q);
    W['lowerarm' + s].copy(d('forearm' + X)).multiply(S['lowerarm' + s].q);
    W['hand' + s].copy(W['lowerarm' + s]).multiply(rel('hand' + s, 'lowerarm' + s, _q2));
    W['thigh' + s].copy(d('thigh' + X)).multiply(S['thigh' + s].q);
    W['calf' + s].copy(d('shin' + X)).multiply(S['calf' + s].q);
    if (P.board) W['foot' + s].copy(d('board')).multiply(S['foot' + s].q);
    else W['foot' + s].copy(W['calf' + s]).multiply(rel('foot' + s, 'calf' + s, _q2));
    W['ball' + s].copy(W['foot' + s]).multiply(rel('ball' + s, 'foot' + s, _q2));
  }
  // World → armature space → parent-relative locals.
  rider.armature.matrixWorld.decompose(_p, _q, _s);
  const qArmInv = conj(_q, new THREE.Quaternion());
  const A = H._A || (H._A = {});
  const rootRest = rider.restGlobal.get(B.root);
  if (!H._rootQ) { H._rootQ = new THREE.Quaternion(); rootRest.decompose(_p, H._rootQ, _s); H._rootInv = rootRest.clone().invert(); }
  A.root = H._rootQ;
  for (const n of ORDER) {
    const a = A[n] || (A[n] = new THREE.Quaternion());
    a.copy(qArmInv).multiply(W[n]);
    const local = _q2.copy(conj(A[PARENT[n]], _q)).multiply(a);
    if (blend < 1 && n !== 'pelvis') local.slerp(seed.local[n], 1 - blend);   // (slerp toward the seed's own local)
    B[n].quaternion.copy(local);
  }
  // Pelvis position: its body's point, the depenetration shift eased in.
  const pe = D.get(P.pelvis);
  _v.copy(S.pelvis.p).sub(P.pelvis.xs).applyQuaternion(pe.d).add(pe.x);
  if (P.pelvis.shift) _v.addScaledVector(P.pelvis.shift, blend - 1);
  _m.copy(rider.armature.matrixWorld).invert();
  _v.applyMatrix4(_m).applyMatrix4(H._rootInv);
  B.pelvis.position.copy(_v);
  // The chest body is one rigid piece while the drawn spine bends over three bones: put spine_03 where the
  // chest body has it (a stretch of a centimetre or two inside the jacket), so the shoulders, arms and neck
  // hang exactly from the bodies' joints.
  if (blend >= 1) {
    const ce = D.get(P.chest);
    _v.copy(S.spine_03.p).sub(P.chest.xs).applyQuaternion(ce.d).add(ce.x);
    B.spine_02.updateWorldMatrix(true, false);
    B.spine_03.position.copy(_v.applyMatrix4(_m.copy(B.spine_02.matrixWorld).invert()));
  }

  // Gear: loose pieces and the ones still on (attached skis, the board).
  const mesh = (L) => (L.kind === 'ski' ? rider.skis?.[L.index] : L.kind === 'pole' ? rider.poles?.[seed.gear.poles[L.index]?.mesh ?? L.index] : rider.board);
  for (const L of [...H.loose, ...H.attach]) {
    const m = mesh(L);
    if (!m) continue;
    const e = D.get(L.body);
    _v.copy(L.pSeed).sub(L.body.xs).applyQuaternion(e.d).add(e.x);
    if (L.body.shift) _v.addScaledVector(L.body.shift, blend - 1);
    _q2.copy(e.d).multiply(L.qSeed);
    m.parent.updateWorldMatrix(true, false);
    _m2.copy(m.parent.matrixWorld).invert();
    m.position.copy(_v).applyMatrix4(_m2);
    m.parent.matrixWorld.decompose(_p, _q, _s);
    m.quaternion.copy(conj(_q, _q)).multiply(_q2);
    m.visible = true;
  }
  if (rider.poles) for (let i = 0; i < rider.poles.length; i++) if (!seed.gear.poles.some((p) => p.mesh === i)) rider.poles[i].visible = false;
  rider.root.updateMatrixWorld(true);
  for (const c of rider.contacts || []) { c.grounded = false; c.load = 0; }
}
