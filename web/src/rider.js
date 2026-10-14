// The rider: stylized snowboarder built on the CC0 Quaternius humanoid. Cel-shaded suit with neon
// trims that light up with speed and tricks, Fresnel rim light, inverted-hull outlines, and fully
// procedural animation layers:
//   • edge-dig roll  (targetMeshRoll = turnInput · maxRollAngle · velocityRatio, lerped)
//   • pre-jump squat (Y down to −25 %, X/Z up for volume) + deeper knee bend
//   • aerodynamic tuck, mid-air hip lean toward travel, flailing arms while stumbling
//   • landing squash & stretch (damped sine, 2–3 bounces), high-speed board chatter
import * as THREE from 'three';
import { State } from './player.js';
import { ANIM, ART, PHYSICS } from './config.js';
import { chairGeo } from './lifts.js';
import { toonMaterial, outlineMaterial, mulberry32 } from './world.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Rider {
  constructor(player) {
    this.player = player;
    this.root = new THREE.Group();
    this.root.name = 'Rider';
    this.chatter = new THREE.Group();      // high-speed rumble
    this.visual = new THREE.Group();       // edge roll + tumble
    this.body = new THREE.Group();         // squash & stretch (rider only)
    this.root.add(this.chatter);
    this.chatter.add(this.visual);
    this.visual.add(this.body);
    this.p = { crouch: 0.4, roll: 0, tuck: 0, air: 0, sit: 0, crash: 0, crashRoll: 0, stumble: 0, t: 0, twist: 0, hip: 0 };
    this.spring = { t: 10, amp: 0 };
    this._landSeen = 0;
    this.G = new Map();
    this.neon = 0;
    this.rnd = mulberry32(3);
  }

  async load(loader) {
    const gltf = await loader.loadAsync('/models/skier/skier.gltf');
    this.model = new THREE.Group();
    this.model.rotation.y = Math.PI / 2;   // rider faces the toe side; board nose = −Z
    this.model.add(gltf.scene);
    this.body.add(this.model);
    const outlines = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material?.name?.includes('Superhero')) {
        o.material = suitMaterial(o.material);
        this.suit = o.material;
      } else {
        o.material = toonMaterial({ name: 'face', map: o.material.map, rim: 0.6 });
      }
      outlines.push(o);
    });
    for (const o of outlines) {
      if (!o.isSkinnedMesh) continue;
      const hull = new THREE.SkinnedMesh(o.geometry, outlineMaterial());
      hull.bind(o.skeleton, o.bindMatrix);
      hull.frustumCulled = false;
      o.parent.add(hull);
    }
    const pelvis = gltf.scene.getObjectByName('pelvis');
    this.armature = pelvis.parent.parent;
    this.bones = {};
    this.restLocal = new Map();
    gltf.scene.traverse((o) => {
      if (o.isBone) {
        this.bones[o.name] = o;
        this.restLocal.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: new THREE.Matrix4().compose(o.position, o.quaternion, o.scale) });
      }
    });
    // Slightly heroic cartoon proportions.
    this.restLocal.get(this.bones.Head).s.setScalar(1.12);
    this.restLocal.get(this.bones.Head).m.compose(this.restLocal.get(this.bones.Head).p, this.restLocal.get(this.bones.Head).q, this.restLocal.get(this.bones.Head).s);
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
    // Board along the root's Z axis (nose = −Z), neon edges.
    this.board = new THREE.Mesh(boardGeometry(), boardMaterial());
    this.board.castShadow = true;
    this.boardOutline = new THREE.Mesh(this.board.geometry, outlineMaterial());
    this.board.add(this.boardOutline);
    this.visual.add(this.board);
    this.boardMat = this.board.material;
    // Lift chair (personal seat while riding up).
    const cg = chairGeo();
    this.chair = new THREE.Mesh(cg, cg.userData.materials);
    this.chair.position.set(0, 2.35, 0.15);
    this.chair.rotation.y = Math.PI;
    this.chair.visible = false;
    this.root.add(this.chair);
    // Helmet + goggles on the head bone (with outlines).
    const head = this.bones.Head;
    const inv = this.restGlobal.get(head).clone().invert();
    const place = (mesh, m) => {
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(inv.clone().multiply(m)); mesh.castShadow = true; head.add(mesh);
      const o = new THREE.Mesh(mesh.geometry, outlineMaterial(1.5)); mesh.add(o);
    };
    place(new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), toonMaterial({ name: 'helmet', color: 0xff3d7f, rim: 0.8 })),
      new THREE.Matrix4().compose(new THREE.Vector3(0, 1.69, -0.006), new THREE.Quaternion(), new THREE.Vector3(0.95, 1.02, 1.1)));
    const lensMat = toonMaterial({ name: 'lens', color: 0x2ff5d6, rim: 1.0 });
    lensMat.userData.uniforms.uEmissiveBoost.value = 0;
    place(new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.12, 6, 16), lensMat),
      new THREE.Matrix4().compose(new THREE.Vector3(0, 1.703, 0.1), new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2), new THREE.Vector3(1, 1, 0.55)));
  }

  update(dt, camera) {
    const pl = this.player, p = this.p;
    if (!this.model) return;
    p.t += dt;
    this.root.position.copy(pl.renderPos);
    this.root.quaternion.copy(pl.renderOrient);
    const st = pl.state;
    const ground = st === State.GROUNDED, air = st === State.AIR, sit = st === State.LIFT, crashed = st === State.CRASH;
    const ratio = pl.speedRatio;
    const k = (r) => 1 - Math.exp(-r * dt);

    // --- layer drivers
    let crouchT = 0.45 + ratio * 0.15 + pl.tuck * 0.45 + pl.squat * 0.55 + pl.brake * 0.15;
    if (air) crouchT = 0.35;
    p.crouch += (Math.min(1, crouchT) - p.crouch) * k(10);
    p.tuck += ((ground ? pl.tuck : 0) - p.tuck) * k(ANIM.tuckResponse);
    p.air += ((air ? 1 : 0) - p.air) * k(5);
    p.sit = sit ? (pl.liftT < 0.02 ? 1 : p.sit + (1 - p.sit) * k(6)) : p.sit * Math.exp(-6 * dt);
    p.crash += ((crashed ? 1 : 0) - p.crash) * k(6);
    p.stumble += ((pl.stumbleT > 0 ? 1 : 0) - p.stumble) * k(10);

    // Edge-dig roll: targetMeshRoll = turnInput · maxRollAngle · (velocity / maxVelocity)
    const targetRoll = ground ? -pl.turnInput * ANIM.maxRollAngle * ratio : 0;
    p.roll += (targetRoll - p.roll) * k(ANIM.rollResponse);
    p.crashRoll += ((crashed ? Math.PI * 0.5 : 0) - p.crashRoll) * k(crashed ? 4 : 8);
    // Mid-air hip lean toward the travel direction (pitch with vertical speed) + twist to look ahead.
    const vy = pl.velocity.y;
    const hipT = air ? THREE.MathUtils.clamp(-vy / 12, -1, 1) * ANIM.hipLean : 0;
    p.hip += (hipT - p.hip) * k(4);
    p.twist += ((air ? 0.55 : 0.32 + p.tuck * 0.15) - p.twist) * k(4);

    this.visual.quaternion.setFromAxisAngle(Z, p.roll + p.crashRoll * 0.0)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, p.crashRoll * 0.6))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, p.crashRoll));
    this.visual.position.set(0, -p.sit * (this.pelvisH - 0.14), 0);

    // Landing squash & stretch: damped sine (2–3 bounces).
    if (pl.landingEvent !== this._landSeen) {
      this._landSeen = pl.landingEvent;
      this.spring.t = 0;
      this.spring.amp = Math.min(ANIM.landSquashMax, pl.landingVy * ANIM.landSquashPerMs);
    }
    this.spring.t += dt;
    const sq = -this.spring.amp * Math.exp(-ANIM.springDamping * this.spring.t) * Math.cos(ANIM.springFreq * this.spring.t);
    // Pre-jump squat: Y down to −25 %, X/Z out to keep volume.
    const squat = pl.squat;
    const sy = (1 - squat * ANIM.squatMax) * (1 + sq);
    const sxz = (1 + squat * ANIM.squatXZ) * (1 - sq * 0.5);
    this.body.scale.set(sxz, sy, sxz);

    // Board chatter above 80 % of max velocity.
    const chat = ground ? THREE.MathUtils.smoothstep(ratio, ANIM.chatterSpeedRatio, 1.0) : 0;
    const tt = p.t * ANIM.chatterFreq;
    this.chatter.position.y = chat * ANIM.chatterAmp * (Math.sin(tt * 1.7) * 0.6 + Math.sin(tt * 3.1 + 1.3) * 0.4);
    this.chatter.rotation.x = chat * ANIM.chatterRotAmp * (Math.sin(tt * 2.3 + 0.5) * 0.7 + Math.sin(tt * 5.3) * 0.3);

    // Neon trims glow with speed and air time.
    const glowT = ratio * 1.2 + (air ? 1.4 : 0) + pl.tuck * 0.5;
    this.neon += (glowT - this.neon) * k(4);
    if (this.suit) this.suit.userData.uniforms.uEmissiveBoost.value = this.neon * 1.6;
    this.boardMat.userData.uniforms.uEmissiveBoost.value = this.neon * 2.0;

    this.chair.visible = sit;
    this.board.visible = true;
    this.board.position.set(0, 0.035, 0);
    this.board.rotation.set(sit ? 0.5 : 0, 0, 0);
    if (sit) this.board.position.set(0, -0.45, -0.35);
    this.pose(pl);
    void camera;
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
    this.setGlobal(b, new THREE.Matrix4().compose(ps, new THREE.Quaternion().setFromUnitVectors(cur, want).multiply(rq), sc));
  }

  pose(pl) {
    const B = this.bones, p = this.p;
    for (const [b, r] of this.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.G.clear();
    this.G.set(B.root, this.restLocal.get(B.root).m.clone());
    // Armature space: +Z = toe side (rider faces), +X = rider's left = board nose.
    const drop = p.crouch * 0.38 + p.tuck * 0.1;
    const hipPitch = THREE.MathUtils.degToRad(10 + p.crouch * 22 + p.tuck * 22) * (1 - p.sit);
    const rp = this.restGlobal.get(B.pelvis);
    const pp = pos(rp).add(new THREE.Vector3(0, -drop * (1 - p.sit) - p.crash * 0.5, -p.crouch * 0.06 * (1 - p.sit)));
    const twist = p.twist * (1 - p.sit);
    const pq = new THREE.Quaternion().setFromAxisAngle(Y, twist * 0.45)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, hipPitch * 0.55 + p.hip * 0.5))
      .multiply(new THREE.Quaternion().setFromRotationMatrix(rp));
    this.setGlobal(B.pelvis, new THREE.Matrix4().compose(pp, pq, scl(rp)));

    const wob = p.stumble * Math.sin(p.t * 9) * 0.25;
    let bend = THREE.MathUtils.degToRad(10 + p.crouch * 16 + p.tuck * 30) * (1 - p.air * 0.3);
    bend -= THREE.MathUtils.degToRad(12) * p.sit;
    for (const n of ['spine_01', 'spine_02', 'spine_03']) {
      this.inherit(B[n]);
      this.rotateGlobal(B[n], new THREE.Quaternion().setFromAxisAngle(X, bend * 0.33 + p.hip * 0.2)
        .multiply(new THREE.Quaternion().setFromAxisAngle(Y, twist * 0.18))
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z, wob)));
    }
    this.inherit(B.neck_01);
    this.rotateGlobal(B.neck_01, new THREE.Quaternion().setFromAxisAngle(X, -(hipPitch * 0.55 + bend) * 0.5));
    this.inherit(B.Head);
    // Look down the hill (toward the nose).
    this.rotateGlobal(B.Head, new THREE.Quaternion().setFromAxisAngle(Y, 0.55 * (1 - p.sit)).multiply(new THREE.Quaternion().setFromAxisAngle(X, -(hipPitch * 0.55 + bend) * 0.35)));
    for (const side of [1, -1]) { this.leg(side); this.arm(side, pl); }
  }

  leg(side) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const thigh = B['thigh' + s], calf = B['calf' + s], foot = B['foot' + s];
    this.inherit(thigh);
    const hip = pos(this.g(thigh));
    // Feet bound to the board: left foot toward the nose (+X), right toward the tail.
    let ankle = new THREE.Vector3(side * 0.27, this.ankleH + p.air * 0.2, 0.02);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.12, -0.5, 0.42)), p.sit);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.25, -0.75, 0.25)), p.crash);
    const l1 = this.restLocal.get(calf).p.length(), l2 = this.restLocal.get(foot).p.length();
    const to = ankle.clone().sub(hip);
    const d = Math.min(Math.max(to.length(), 0.05), l1 + l2 - 0.002);
    const dir = to.normalize();
    const pole = new THREE.Vector3(side * 0.35, 0, 1);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const axis = new THREE.Vector3().crossVectors(dir, pole).normalize();
    const knee = hip.clone().add(dir.clone().applyAxisAngle(axis, Math.acos(cosA)).multiplyScalar(l1));
    this.aim(thigh, calf, knee.clone().sub(hip));
    this.inherit(calf);
    this.aim(calf, foot, ankle.clone().sub(pos(this.g(calf))));
    this.inherit(foot);
    const rf = this.restGlobal.get(foot);
    // Feet point across the board (toward the toe edge), like real bindings.
    const fq = new THREE.Quaternion().setFromAxisAngle(Y, side * 0.25).multiply(new THREE.Quaternion().setFromRotationMatrix(rf));
    this.setGlobal(foot, new THREE.Matrix4().compose(pos(this.g(foot)), fq, scl(rf)));
  }

  arm(side, pl) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const upper = B['upperarm' + s], lower = B['lowerarm' + s], hand = B['hand' + s];
    this.inherit(B['clavicle' + s]);
    this.inherit(upper);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // Riding: arms relaxed out over the board for balance (lead arm toward the nose).
    const lead = side > 0 ? 1 : 0.6;
    const sway = Math.sin(p.t * 1.3 + side) * 0.05;
    const upS = V(side * 0.75 * lead, -0.62 - pl.turnInput * side * 0.2, 0.25 + sway), loS = V(side * 0.7, -0.3, 0.45);
    const upT = V(side * 0.2, -0.65, 0.75), loT = V(-side * 0.25, 0.2, 0.9);
    const upA = V(side, 0.15 + Math.sin(p.t * 3.1 + side) * 0.12, 0.2), loA = V(side, 0.35, 0.25);
    const fl = p.t * ANIM.flailSpeed;
    const upF = V(side * 0.7, 0.6 + Math.sin(fl + side * 2) * 0.6, Math.cos(fl * 1.3 + side) * 0.8);
    const loF = V(side * 0.5, 0.8 + Math.sin(fl * 1.7) * 0.5, Math.sin(fl + 1) * 0.9);
    const upSit = V(side * 0.2, -0.8, 0.45), loSit = V(side * 0.05, -0.15, 1);
    const upC = V(side, 0.4, 0.2), loC = V(side, 0.6, 0);
    const u = upS.lerp(upT, p.tuck).lerp(upA, p.air).lerp(upF, p.stumble).lerp(upSit, p.sit).lerp(upC, p.crash);
    const l = loS.lerp(loT, p.tuck).lerp(loA, p.air).lerp(loF, p.stumble).lerp(loSit, p.sit).lerp(loC, p.crash);
    this.aim(upper, lower, u);
    this.inherit(lower);
    this.aim(lower, hand, l);
    this.inherit(hand);
  }
}

const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const scl = (m) => new THREE.Vector3().setFromMatrixScale(m);

/** Cel-shaded outfit from the baked zones (R jacket, G pants, B gloves/boots, A coverage), neon trims. */
function suitMaterial(src) {
  const m = toonMaterial({
    name: 'suit', map: src.map, rim: 1.0,
    vertPars: 'attribute vec4 color;\nvarying vec4 vZone;\nvarying vec3 vObj;',
    vert: 'vZone = color; vObj = position;',
    fragPars: `varying vec4 vZone;\nvarying vec3 vObj;\nuniform vec3 uNeon; uniform vec3 uNeon2;`,
    frag: /* glsl */`
      {
        float tot = max(vZone.r + vZone.g + vZone.b, 0.001);
        float jz = vZone.r / tot, pz = vZone.g / tot;
        // Jacket: bold colour-blocked shell (fictional "Northwake").
        vec3 jacket = mix(vec3(0.16, 0.12, 0.42), vec3(1.0, 0.35, 0.55), step(1.28, vObj.y));
        vec3 pants = vec3(0.12, 0.6, 0.66);
        vec3 dark = vec3(0.08, 0.08, 0.14);
        vec3 cloth = jacket * vZone.r + pants * vZone.g + dark * vZone.b;
        cloth /= tot;
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.05, 0.95, 0.9), cloth, vZone.a);
        // Neon trim: chest band, cuffs and a stripe down the pant legs.
        float band = smoothstep(0.014, 0.0, abs(vObj.y - 1.27)) * step(0.5, jz);
        float cuff = smoothstep(0.015, 0.0, abs(abs(vObj.x) - 0.62)) * step(0.5, jz);
        float leg = smoothstep(0.012, 0.0, abs(abs(vObj.x) - 0.15)) * step(0.5, pz) * step(vObj.y, 0.85);
        toonEmissive = uNeon * (band + cuff) * 1.4 + uNeon2 * leg * 1.4;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(band + cuff + leg, 0.0, 1.0) * 0.6);
      }`,
    uniforms: { uNeon: { value: new THREE.Color(...ART.neonColor) }, uNeon2: { value: new THREE.Color(...ART.neonColor2) } },
  });
  return m;
}

function boardGeometry() {
  const L = 1.56, W = 0.29, r = 0.14;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -L / 2 + r);
  shape.quadraticCurveTo(-W / 2, -L / 2, 0, -L / 2);
  shape.quadraticCurveTo(W / 2, -L / 2, W / 2, -L / 2 + r);
  shape.lineTo(W / 2 * 0.9, 0);
  shape.lineTo(W / 2, L / 2 - r);
  shape.quadraticCurveTo(W / 2, L / 2, 0, L / 2);
  shape.quadraticCurveTo(-W / 2, L / 2, -W / 2, L / 2 - r);
  shape.lineTo(-W / 2 * 0.9, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);          // shape Y → −Z (board length along Z), thickness up
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = Math.max(0, Math.abs(z) - L / 2 + 0.24) / 0.24;
    pos.setY(i, pos.getY(i) + t * t * 0.07);   // kicked nose & tail
  }
  g.computeVertexNormals();
  return g;
}

function boardMaterial() {
  return toonMaterial({
    name: 'board', rim: 0.6,
    vertPars: 'varying vec3 vB;', vert: 'vB = position;',
    fragPars: 'varying vec3 vB; uniform vec3 uNeon; uniform vec3 uNeon2;',
    frag: /* glsl */`
      {
        float top = step(0.02, vB.y);
        vec3 base = mix(vec3(0.1, 0.08, 0.3), vec3(1.0, 0.82, 0.25), step(0.5, fract(vB.z * 2.2)) * top * 0.0);
        float stripe = smoothstep(0.02, 0.0, abs(vB.x - sin(vB.z * 5.0) * 0.06)) * top;
        float edge = smoothstep(0.125, 0.14, abs(vB.x));
        diffuseColor.rgb = mix(base, vec3(1.0), stripe * 0.5);
        toonEmissive = uNeon * edge * 1.5 + uNeon2 * stripe * 1.2;
      }`,
    uniforms: { uNeon: { value: new THREE.Color(...ART.neonColor) }, uNeon2: { value: new THREE.Color(...ART.neonColor2) } },
  });
}

void PHYSICS;
