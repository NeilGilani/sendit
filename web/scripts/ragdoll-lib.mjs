// Headless helpers for the crash ragdoll tests (ragdoll-fuzz.mjs): the real Quaternius skeleton read from the
// glTF's node tree (no mesh, no WebGL), a stand-in rider with the same fields rider.js has (bones, restLocal,
// restGlobal, armature, root / chatter / visual / body groups, skis / poles / board), random poses, and
// synthetic slopes with bumps, trees and rails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage ||= { getItem: () => null, setItem: () => {} };
globalThis.addEventListener ||= () => {};
export const THREE = await import('three');
const { proportionRig } = await import('../src/character/body.js');

const HEAD_SCALE = 1.06;   // character/index.js (not imported: it pulls in the garment builder)
const here = path.dirname(fileURLToPath(import.meta.url));
const GLTF = JSON.parse(fs.readFileSync(path.join(here, '../../assets/models/skier/skier.gltf'), 'utf8'));

const { bodyWarp, BODIES, DEFAULT_BODY } = await import('../src/character/proto.js');
/**
 * Move the joints like rider.js's morphBody() does for the game's body (BODIES[DEFAULT_BODY]): every
 * bone's rest origin goes through bodyWarp() in the model's space, orientations kept, parents first.
 */
function warpJoints(model, armature) {
  const B = BODIES[DEFAULT_BODY];
  if (!B) return;
  const f = bodyWarp(B);
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const want = new Map();
  armature.traverse((o) => {
    if (!o.isBone) return;
    const M = toModel.clone().multiply(o.matrixWorld);
    M.setPosition(f(new THREE.Vector3().setFromMatrixPosition(M)));
    want.set(o, model.matrixWorld.clone().multiply(M));
  });
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  armature.traverse((o) => {
    if (!o.isBone) return;
    const parentW = want.get(o.parent) || o.parent.matrixWorld;
    parentW.clone().invert().multiply(want.get(o)).decompose(p, q, s);
    o.position.copy(p); o.quaternion.copy(q);
  });
  model.updateMatrixWorld(true);
}

/** A rider-shaped object around the real skeleton. type 'ski' | 'snowboard'. */
export function fakeRider(type = 'ski', stance = 'regular') {
  const N = GLTF.nodes;
  const objs = N.map((n) => {
    const o = /pelvis|spine|neck|Head|clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball|root|index|middle|ring|pinky|thumb/.test(n.name || '') && !n.mesh ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name || '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  N.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
  const armature = objs.find((o) => o.name === 'Armature');
  const r = {
    root: new THREE.Group(), chatter: new THREE.Group(), visual: new THREE.Group(), body: new THREE.Group(), model: new THREE.Group(),
    chair: new THREE.Object3D(), contacts: [], fp: false, poleLen: 1.2,
  };
  r.root.add(r.chatter); r.chatter.add(r.visual); r.visual.add(r.body); r.body.add(r.model);
  r.model.rotation.y = Math.PI; r.model.add(armature);
  r.armature = armature;
  warpJoints(r.model, armature);   // the game's body proportions (character/proto.js morphBody)
  r.bones = {}; r.restLocal = new Map();
  armature.traverse((o) => { if (o.isBone) { r.bones[o.name] = o; r.restLocal.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: new THREE.Matrix4().compose(o.position, o.quaternion, o.scale) }); } });
  const hr = r.restLocal.get(r.bones.Head); hr.s.setScalar(HEAD_SCALE); hr.m.compose(hr.p, hr.q, hr.s);
  proportionRig(r.bones, r.restLocal);
  r.restGlobal = new Map();
  const walk = (b, pm) => { const m = pm.clone().multiply(r.restLocal.get(b).m); r.restGlobal.set(b, m); for (const c of b.children) if (c.isBone) walk(c, m); };
  walk(r.bones.root, new THREE.Matrix4());
  r.isBoard = type === 'snowboard';
  r.equip = { type, spec: type === 'snowboard' ? { length: 1.55, waist: 0.25 } : { length: 1.7, waist: 0.08 }, stance };
  r.gear = new THREE.Group(); r.visual.add(r.gear);
  if (r.isBoard) { r.board = new THREE.Object3D(); r.gear.add(r.board); r.skis = null; r.poles = [new THREE.Object3D(), new THREE.Object3D()]; r.poles.forEach((p) => { p.visible = false; r.visual.add(p); }); }
  else { r.skis = [new THREE.Object3D(), new THREE.Object3D()]; r.skis.forEach((s) => r.gear.add(s)); r.poles = [new THREE.Object3D(), new THREE.Object3D()]; r.poles.forEach((p) => r.visual.add(p)); }
  r.reset = () => { for (const [b, v] of r.restLocal) { b.position.copy(v.p); b.quaternion.copy(v.q); b.scale.copy(v.s); } };
  return r;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Rotate a bone about an armature-frame axis (degrees), keeping its children's armature-frame rotations relative. */
function rotArm(r, name, axis, deg) {
  const b = r.bones[name];
  r.root.updateMatrixWorld(true);
  r.armature.getWorldQuaternion(_q);
  const aw = _v.copy(axis).normalize().applyQuaternion(_q);
  b.getWorldQuaternion(_q2);
  const want = new THREE.Quaternion().setFromAxisAngle(aw, deg * Math.PI / 180).multiply(_q2);
  b.parent.getWorldQuaternion(_q);
  b.quaternion.copy(_q.invert().multiply(want));
}

/**
 * A plausible riding pose: crouch, arms forward / out, a little asymmetry (rnd: () => 0..1). Places the gear
 * under the feet / in the hands like rider.js does.
 */
export function randomPose(r, rnd) {
  r.reset();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const board = r.isBoard;
  r.body.rotation.y = board ? (r.equip.stance === 'goofy' ? Math.PI / 2 : -Math.PI / 2) : 0;
  const crouch = rnd();
  rotArm(r, 'spine_01', X, 5 + crouch * 25 * rnd());
  rotArm(r, 'spine_02', X, crouch * 10);
  rotArm(r, 'neck_01', X, -10 + rnd() * 20);
  for (const s of ['_l', '_r']) {
    const side = s === '_l' ? 1 : -1;
    rotArm(r, 'thigh' + s, X, -(15 + crouch * 60 + rnd() * 15));     // hip flexion (knee forward)
    rotArm(r, 'thigh' + s, Z, side * (rnd() * 12 - 2));
    rotArm(r, 'calf' + s, X, 20 + crouch * 80 + rnd() * 15);         // knee flexion
    rotArm(r, 'foot' + s, X, -(10 + crouch * 30));
    rotArm(r, 'upperarm' + s, Z, -side * (35 + rnd() * 45));         // arms down from the T
    rotArm(r, 'upperarm' + s, Y, side * (rnd() * 50));               // … and forward
    rotArm(r, 'lowerarm' + s, Y, side * (10 + rnd() * 60));          // elbow
  }
  r.root.updateMatrixWorld(true);
  // Gear under the boots / in the gloves.
  const foot = (s) => r.visual.worldToLocal(r.bones['foot' + s].getWorldPosition(new THREE.Vector3()));
  if (board) {
    const fl = foot('_l'), fr = foot('_r');
    r.board.position.copy(fl).add(fr).multiplyScalar(0.5).add(_w.set(0, -0.1, 0));
    const dir = fr.clone().sub(fl).setY(0).normalize();
    r.board.quaternion.setFromUnitVectors(Z, dir);
  } else {
    for (const [ski, s] of [[r.skis[0], '_l'], [r.skis[1], '_r']]) {
      ski.position.copy(foot(s)).add(_w.set(0, -0.1, -0.05));
      ski.rotation.set(0, 0, 0);
    }
    [['hand_l', -1], ['hand_r', 1]].forEach(([n, sx], i) => {
      const hand = r.visual.worldToLocal(r.bones[n].getWorldPosition(new THREE.Vector3()));
      r.poles[i].position.copy(hand);
      r.poles[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(sx * 0.16, -1, 0.42).normalize());
      r.poles[i].visible = true;
    });
  }
  r.root.updateMatrixWorld(true);
}

/** Slope `deg` falling toward −Z, with bumps (amp m, wavelength m); trees [{x, z, r}], rails [{ pts, half }]. */
export function slope({ deg = 15, amp = 0, wave = 9, trees = [], rails = [] } = {}) {
  const k = Math.tan(deg * Math.PI / 180), w = 2 * Math.PI / wave;
  const T = {
    getHeight: (x, z) => z * k + amp * Math.sin(x * w) * Math.sin(z * w * 0.8),
    getNormal: (x, z, rr = 0, out = new THREE.Vector3()) => { const e = Math.max(rr, 0.5); return out.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); },
    course: { rails },
  };
  const scatter = {
    obstaclesNear(p, maxR) { return trees.filter((t) => Math.hypot(p.x - t.x, p.z - t.z) - t.r < maxR).map((t) => [t.x, t.z, t.r, t.kind || 'tree']); },
  };
  return { terrain: T, scatter };
}
