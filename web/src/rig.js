// The skier: Quaternius humanoid (CC0) with a tailored ski suit, procedurally posed from the
// controller state — knees bend, the body leans into carves, crouches in a tuck, arms open in
// the air, sits on lifts and tumbles softly. Adds skis, poles, helmet and goggles.
import * as THREE from 'three';
import { State } from './skier.js';
import { tuning } from './skier.js';
import { chairGeo } from './lifts.js';
import { withWorld } from './world.js';

const MAX_LEAN = THREE.MathUtils.degToRad(24);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class SkierRig {
  constructor(skier) {
    this.skier = skier;
    this.root = new THREE.Group();
    this.root.name = 'Skier';
    this.visual = new THREE.Group();
    this.root.add(this.visual);
    this.p = { crouch: 0.3, lean: 0, tuck: 0, air: 0, sit: 0, crash: 0, crashRoll: 0, skidYaw: 0, arm: 0 };
    this.G = new Map();
  }

  async load(loader) {
    const gltf = await loader.loadAsync('/models/skier/skier.gltf');
    this.model = new THREE.Group();
    this.model.rotation.y = Math.PI;
    this.model.add(gltf.scene);
    this.visual.add(this.model);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (o.material?.name?.includes('Superhero')) o.material = suitMaterial(o.material);
      }
    });
    const any = gltf.scene.getObjectByName('pelvis');
    this.armature = any.parent.parent; // pelvis -> root -> Armature
    this.bones = {};
    this.restLocal = new Map();
    gltf.scene.traverse((o) => {
      if (o.isBone) {
        this.bones[o.name] = o;
        this.restLocal.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: o.matrix.clone().compose(o.position, o.quaternion, o.scale) });
      }
    });
    this.restGlobal = new Map();
    const walk = (b, parentM) => {
      const m = parentM.clone().multiply(this.restLocal.get(b).m);
      this.restGlobal.set(b, m);
      for (const c of b.children) if (c.isBone) walk(c, m);
    };
    walk(this.bones.root, new THREE.Matrix4());
    this.ankleH = pos(this.restGlobal.get(this.bones.foot_l)).y;
    this.pelvisH = pos(this.restGlobal.get(this.bones.pelvis)).y;
    this.buildGear();
  }

  buildGear() {
    const skiG = skiGeometry();
    const skiM = withWorld(new THREE.MeshStandardMaterial({ color: 0xf26b38, roughness: 0.3, metalness: 0.1 }), { skyAO: false });
    this.skiL = new THREE.Mesh(skiG, skiM); this.skiR = new THREE.Mesh(skiG, skiM);
    const poleG = poleGeometry();
    this.poleL = new THREE.Mesh(poleG.geo, poleG.mats); this.poleR = new THREE.Mesh(poleG.geo, poleG.mats);
    for (const m of [this.skiL, this.skiR, this.poleL, this.poleR]) { m.castShadow = true; this.visual.add(m); }
    const cg = chairGeo();
    this.chair = new THREE.Mesh(cg, cg.userData.materials);
    this.chair.position.set(0, 2.35, 0.15);
    this.chair.rotation.y = Math.PI;
    this.chair.visible = false;
    this.chair.castShadow = true;
    this.root.add(this.chair);
    // Helmet, strap and goggles ride on the head bone.
    const head = this.bones.Head;
    const inv = this.restGlobal.get(head).clone().invert();
    const place = (mesh, m) => { mesh.matrixAutoUpdate = false; mesh.matrix.copy(inv.clone().multiply(m)); mesh.castShadow = true; head.add(mesh); };
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      withWorld(new THREE.MeshStandardMaterial({ color: 0xebe6dc, roughness: 0.35 }), { skyAO: false }));
    place(helmet, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.692, -0.008), new THREE.Quaternion(), new THREE.Vector3(0.93, 1.02, 1.1)));
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.009, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }));
    place(strap, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.70, -0.005), new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2), new THREE.Vector3(0.92, 1.08, 1.0)));
    const lens = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.12, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xf29a33, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.6 }));
    place(lens, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.703, 0.098), new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2), new THREE.Vector3(1, 1, 0.55)));
  }

  update(dt) {
    const s = this.skier, p = this.p;
    if (!this.model) return;
    this.root.position.copy(s.renderPos);
    this.root.quaternion.copy(s.renderOrient);
    const st = s.state;
    const ground = st === State.GROUNDED, air = st === State.AIR, sit = st === State.LIFT, crashed = st === State.CRASH;
    const sp = Math.min(1, s.speed / 18);
    let crouchT = 0.46 + sp * 0.14 + s.tuck * 0.45 + s.charge * 0.5 + s.landingSquash * 0.45 + s.brake * 0.12;
    if (air) crouchT = 0.3;
    const k = (r) => 1 - Math.exp(-r * dt);
    p.crouch += (Math.min(1, crouchT) - p.crouch) * k(s.landingSquash > 0.5 ? 14 : 7);
    p.lean += ((ground ? s.carve : 0) - p.lean) * k(5);
    p.tuck += ((ground ? s.tuck : 0) - p.tuck) * k(8);
    p.air += ((air ? 1 : 0) - p.air) * k(4);
    p.sit = sit ? (s.liftT < 0.02 ? 1 : p.sit + (1 - p.sit) * k(6)) : p.sit * Math.exp(-6 * dt);
    p.crash += ((crashed ? 1 : 0) - p.crash) * k(5);
    const side = p.lean >= 0 ? 1 : -1;
    p.skidYaw += (s.brake * tuning.brakeSkidAngle * side * Math.min(1, s.speed / 3) - p.skidYaw) * k(5);
    p.arm += dt * (0.8 + s.speed * 0.05);
    p.crashRoll += ((crashed ? Math.PI * 0.45 : 0) - p.crashRoll) * k(crashed ? 3.5 : 6);

    // Lean into the carve (roll about forward), skid sideways, tumble.
    const roll = p.lean * MAX_LEAN * Math.min(1, s.speed / 6);
    this.visual.quaternion.setFromAxisAngle(Y, -p.skidYaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -roll))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -p.crashRoll));
    this.visual.position.set(0, -p.sit * (this.pelvisH - 0.14), 0);
    this.chair.visible = sit;
    this.pose();
    this.placeGear();
  }

  // ------------------------------------------------------------- skeleton posing (armature space)
  g(b) {
    if (this.G.has(b)) return this.G.get(b);
    const parent = b.parent && b.parent.isBone ? this.g(b.parent) : new THREE.Matrix4();
    const m = parent.clone().multiply(this.restLocal.get(b).m);
    this.G.set(b, m);
    return m;
  }

  inherit(b) {
    const parent = b.parent && b.parent.isBone ? this.g(b.parent) : new THREE.Matrix4();
    this.G.set(b, parent.clone().multiply(this.restLocal.get(b).m));
  }

  setGlobal(b, m) {
    const parent = b.parent && b.parent.isBone ? this.g(b.parent) : new THREE.Matrix4();
    const local = parent.clone().invert().multiply(m);
    const ps = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    local.decompose(ps, q, sc);
    b.position.copy(ps);
    b.quaternion.copy(q);
    this.G.set(b, m.clone());
  }

  rotateGlobal(b, q) {
    const m = this.g(b);
    const ps = new THREE.Vector3(), rq = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(ps, rq, sc);
    this.setGlobal(b, new THREE.Matrix4().compose(ps, q.clone().multiply(rq), sc));
  }

  aim(b, child, dir) {
    if (!this.G.has(b)) this.inherit(b);
    const m = this.g(b);
    const ps = new THREE.Vector3(), rq = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(ps, rq, sc);
    const cur = this.restLocal.get(child).p.clone().multiply(sc).applyQuaternion(rq).normalize();
    const want = dir.clone().normalize();
    if (cur.dot(want) > 0.99999) return;
    const q = new THREE.Quaternion().setFromUnitVectors(cur, want);
    this.setGlobal(b, new THREE.Matrix4().compose(ps, q.multiply(rq), sc));
  }

  pose() {
    const B = this.bones, p = this.p;
    for (const [b, r] of this.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.G.clear();
    this.G.set(B.root, this.restLocal.get(B.root).m.clone());
    const drop = p.crouch * 0.36 + p.tuck * 0.06;
    const hipPitch = THREE.MathUtils.degToRad(8 + p.crouch * 26 + p.tuck * 18) * (1 - p.sit);
    const rp = this.restGlobal.get(B.pelvis);
    const pp = pos(rp).add(new THREE.Vector3(0, -drop * (1 - p.sit) - p.crash * 0.55, -p.crouch * 0.07 * (1 - p.sit)));
    const rq = new THREE.Quaternion().setFromRotationMatrix(rp);
    const pq = new THREE.Quaternion().setFromAxisAngle(X, hipPitch * 0.55).multiply(new THREE.Quaternion().setFromAxisAngle(Z, -p.lean * 0.12)).multiply(rq);
    this.setGlobal(B.pelvis, new THREE.Matrix4().compose(pp, pq, scl(rp)));

    let bend = THREE.MathUtils.degToRad(8 + p.crouch * 14 + p.tuck * 22) * (1 - p.air * 0.4);
    bend -= THREE.MathUtils.degToRad(12) * p.sit;
    for (const n of ['spine_01', 'spine_02', 'spine_03']) {
      this.inherit(B[n]);
      this.rotateGlobal(B[n], new THREE.Quaternion().setFromAxisAngle(X, bend * 0.33).multiply(new THREE.Quaternion().setFromAxisAngle(Z, p.lean * 0.1)));
    }
    this.inherit(B.neck_01);
    this.rotateGlobal(B.neck_01, new THREE.Quaternion().setFromAxisAngle(X, -(hipPitch * 0.55 + bend) * 0.55));
    this.inherit(B.Head);
    this.rotateGlobal(B.Head, new THREE.Quaternion().setFromAxisAngle(X, -(hipPitch * 0.55 + bend) * 0.35).multiply(new THREE.Quaternion().setFromAxisAngle(Z, p.lean * 0.2)));
    for (const side of [1, -1]) { this.leg(side); this.armPose(side); }
  }

  leg(side) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const thigh = B['thigh' + s], calf = B['calf' + s], foot = B['foot' + s];
    this.inherit(thigh);
    const hip = pos(this.g(thigh));
    const ra = pos(this.restGlobal.get(foot));
    let ankle = new THREE.Vector3(ra.x * 0.9 + side * 0.02, ra.y + p.air * 0.18, ra.z + p.air * 0.05);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.03, -0.5, 0.42)), p.sit);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.25, -0.75, 0.25)), p.crash);
    const l1 = this.restLocal.get(calf).p.length(), l2 = this.restLocal.get(foot).p.length();
    const to = ankle.clone().sub(hip);
    const d = Math.min(Math.max(to.length(), 0.05), l1 + l2 - 0.002);
    const dir = to.normalize();
    const pole = new THREE.Vector3(side * 0.12, 0, 1);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const axis = new THREE.Vector3().crossVectors(dir, pole).normalize();
    const knee = hip.clone().add(dir.clone().applyAxisAngle(axis, Math.acos(cosA)).multiplyScalar(l1));
    this.aim(thigh, calf, knee.clone().sub(hip));
    this.inherit(calf);
    this.aim(calf, foot, ankle.clone().sub(pos(this.g(calf))));
    this.inherit(foot);
    const rf = this.restGlobal.get(foot);
    const fq = new THREE.Quaternion().setFromAxisAngle(X, -p.sit * 0.35).multiply(new THREE.Quaternion().setFromRotationMatrix(rf));
    this.setGlobal(foot, new THREE.Matrix4().compose(pos(this.g(foot)), fq, scl(rf)));
  }

  armPose(side) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const upper = B['upperarm' + s], lower = B['lowerarm' + s], hand = B['hand' + s];
    this.inherit(B['clavicle' + s]);
    this.inherit(upper);
    const sway = Math.sin(p.arm + side) * 0.04;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const upS = V(side * 0.42, -0.85 - p.lean * side * 0.15, 0.32 + sway), loS = V(side * 0.2, -0.35, 1);
    const upT = V(side * 0.18, -0.55, 0.85), loT = V(-side * 0.35, 0.15, 0.95);
    const upA = V(side, -0.25 + Math.sin(p.arm * 1.7) * 0.06, 0.15), loA = V(side, 0.05, 0.3);
    const upSit = V(side * 0.2, -0.8, 0.45), loSit = V(side * 0.05, -0.15, 1);
    const upC = V(side, 0.4, 0.2), loC = V(side, 0.6, 0);
    const u = upS.lerp(upT, p.tuck).lerp(upA, p.air).lerp(upSit, p.sit).lerp(upC, p.crash);
    const l = loS.lerp(loT, p.tuck).lerp(loA, p.air).lerp(loSit, p.sit).lerp(loC, p.crash);
    this.aim(upper, lower, u);
    this.inherit(lower);
    this.aim(lower, hand, l);
    this.inherit(hand);
  }

  placeGear() {
    const p = this.p;
    this.root.updateMatrixWorld(true);
    const a2v = this.visual.matrixWorld.clone().invert().multiply(this.armature.matrixWorld);
    for (const side of [1, -1]) {
      const s = side > 0 ? '_l' : '_r';
      const ski = side > 0 ? this.skiL : this.skiR;
      const foot = pos(this.g(this.bones['foot' + s])).applyMatrix4(a2v);
      const tilt = new THREE.Quaternion().setFromAxisAngle(X, p.sit * 0.5 - p.air * 0.12);
      ski.quaternion.copy(tilt);
      ski.position.copy(foot).sub(new THREE.Vector3(0, this.ankleH * 0.95, -0.05).applyQuaternion(tilt));
      const pole = side > 0 ? this.poleL : this.poleR;
      const hand = pos(this.g(this.bones['hand' + s])).applyMatrix4(a2v);
      const ms = -side;
      const target = new THREE.Vector3(ms * 0.28, -1, 0.55)
        .lerp(new THREE.Vector3(ms * 0.35, -0.55, 1), Math.max(p.air, p.tuck * 0.8))
        .lerp(new THREE.Vector3(ms * 0.05, -1, -0.1), p.sit).normalize();
      pole.position.copy(hand);
      pole.quaternion.setFromUnitVectors(Y, target.negate());
    }
  }
}

const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const scl = (m) => new THREE.Vector3().setFromMatrixScale(m);

function suitMaterial(src) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, roughness: 1, metalness: 0,
  });
  m.name = 'suit';
  withWorld(m, {
    skyAO: false,
    vertPars: 'attribute vec4 color;\nvarying vec4 vZone;\nvarying vec3 vObj;',
    vert: 'vZone = color; vObj = position;',
    fragPars: 'varying vec4 vZone;\nvarying vec3 vObj;',
    frag: /* glsl */`
      {
        float tot = max(vZone.r + vZone.g + vZone.b, 0.001);
        vec3 jacket = vec3(0.13, 0.42, 0.45);
        float band = smoothstep(0.012, 0.0, abs(vObj.y - 1.33)) * step(0.5, vZone.r / tot);
        jacket = mix(jacket, vec3(0.93, 0.62, 0.32), band);
        vec3 cloth = (jacket * vZone.r + vec3(0.12, 0.13, 0.16) * vZone.g + vec3(0.06, 0.06, 0.07) * vZone.b) / tot;
        diffuseColor.rgb = mix(diffuseColor.rgb, cloth, vZone.a);
      }`,
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - vZone.a);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.68, vZone.a);');
  };
  return m;
}

function skiGeometry() {
  const w = 0.045, th = 0.014, segs = 24, len = 1.72;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, z = -len * 0.55 + len * t;
    const tip = Math.min(1, Math.max(0, (-len * 0.42 - z) / (len * 0.13)));
    const tail = Math.min(1, Math.max(0, (z - len * 0.42) / 0.05));
    pts.push([w * (1 - tip * 0.35) * (1.06 - 0.12 * Math.sin(t * Math.PI)), tip * tip * 0.09 + tail * 0.015, z]);
  }
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  for (let i = 0; i < segs; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    quad([-ax, ay + th, az], [ax, ay + th, az], [bx, by + th, bz], [-bx, by + th, bz]);
    quad([ax, ay, az], [-ax, ay, az], [-bx, by, bz], [bx, by, bz]);
    quad([ax, ay + th, az], [ax, ay, az], [bx, by, bz], [bx, by + th, bz]);
    quad([-ax, ay, az], [-ax, ay + th, az], [-bx, by + th, bz], [-bx, by, bz]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function poleGeometry() {
  const shaft = new THREE.CylinderGeometry(0.009, 0.006, 1.18, 8); shaft.translate(0, -0.59, 0);
  const grip = new THREE.CylinderGeometry(0.018, 0.016, 0.16, 8); grip.translate(0, -0.02, 0);
  const basket = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12); basket.translate(0, -1.08, 0);
  const geo = new THREE.BufferGeometry();
  const parts = [shaft, grip, basket].map((g) => g.toNonIndexed());
  const pos = [], nor = [];
  parts.forEach((g, i) => {
    geo.addGroup(pos.length / 3, g.attributes.position.count, i);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xbfc2c7, metalness: 0.8, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }),
  ];
  return { geo, mats };
}
