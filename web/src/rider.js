// The rider: stylized skier / snowboarder built on the CC0 Quaternius humanoid. Suit with neon trims
// that light up with speed and air, Fresnel rim light, a thin outline, equipment from the data-driven
// registry (equipment/), and fully procedural animation layers:
//   • lean = atan(contact force / g) in the gear frame (carves lean in, stops lean back up the hill);
//     the gear rolls further to the physics edge angle — the difference is angulation
//   • skis: athletic stance, hands forward with poles, pole plants on edge changes, snowplough wedge,
//     hockey-stop counter-rotation, racer tuck
//   • snowboard: sideways stance (regular / goofy) with bent knees, open shoulders, head turned down
//     the direction of travel (over the other shoulder when riding switch), upper body leading the
//     turn, heel-side sit / toe-side drive, nose / tail press with board flex, ollie crouch, grabs
//   • pre-jump squat, mid-air hip lean, flailing arms while stumbling, sinking into deep powder
//   • landing squash & stretch (damped sine, 2–3 bounces), high-speed chatter
// Public API: setEquipment(type, variant?), getContactPoints(), update(dt, camera), load(loader).
import * as THREE from 'three';
import { State } from './player.js';
import { ANIM, ART, PHYSICS } from './config.js';
import { chairGeo } from './lifts.js';
import { toonMaterial, outlineMaterial, mulberry32 } from './world.js';
import { on } from './state.js';
import { createEquipmentModel, disposeEquipmentModel, poleGeometry } from './equipment/models.js';
import { getEquipmentSpec, normalizeType } from './equipment/registry.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const BA = ANIM.board;

export class Rider {
  constructor(player) {
    this.player = player;
    if (player && !player.rider) player.rider = this;
    this.root = new THREE.Group();
    this.root.name = 'Rider';
    this.chatter = new THREE.Group();      // high-speed rumble
    this.visual = new THREE.Group();       // lean roll + tumble
    this.body = new THREE.Group();         // squash & stretch + stance yaw (rider only)
    this.root.add(this.chatter);
    this.chatter.add(this.visual);
    this.visual.add(this.body);
    this.p = {
      crouch: 0.4, lean: 0, edge: 0, tuck: 0, air: 0, sit: 0, crash: 0, crashRoll: 0, stumble: 0, t: 0, twist: 0, hip: 0,
      plow: 0, stop: 0, toe: 0, heel: 0, press: 0, grab: 0, lead: 0, look: 1, stanceYaw: 0, boardLift: 0, pitch: 0,
      plant: [0, 0], plantSide: 0,
    };
    this.spring = { t: 10, amp: 0 };
    this._landSeen = 0;
    this._lastEdgeSign = 0;
    this.G = new Map();
    this.neon = 0;
    this.rnd = mulberry32(3);
    this.equip = null;                     // { type, variant, spec, stance }
    this.contacts = [];
    on('jumped', () => { this.snapT = 0; this.snapSign = this.player.dyn?._popEnd === 'nose' ? -1 : 1; });
    this.snapT = 10; this.snapSign = 1;
    on('equipmentChanged', (e) => {
      if (!this.model || (e.player && e.player !== this.player)) return;   // only our own player's gear
      const cur = this.equip;
      if (!cur || cur.type !== e.type || cur.variant !== e.variant || cur.stance !== e.stance || cur.spec !== e.spec) this.buildEquipment(e.type, e.spec, e.stance);
    });
  }

  async load(loader) {
    const gltf = await loader.loadAsync('/models/skier/skier.gltf');
    this.model = new THREE.Group();
    this.model.rotation.y = Math.PI;       // rider faces down the skis (−Z)
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
    const hr = this.restLocal.get(this.bones.Head);
    hr.s.setScalar(1.12);
    hr.m.compose(hr.p, hr.q, hr.s);
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
    const eq = this.player.equipment;
    this.buildEquipment(eq.type, eq.spec, this.player.stance);
  }

  /**
   * Switch equipment at runtime ('ski' | 'snowboard', variant id or spec object). Keeps the attached
   * player's physics in sync (player.setEquipment), which in turn rebuilds the visuals here.
   */
  setEquipment(type, variant) {
    const t = normalizeType(type);
    const pl = this.player;
    if (pl && pl.setEquipment) {
      pl.setEquipment(t, variant);   // emits equipmentChanged → buildEquipment
      if (!this.equip || this.equip.variant !== pl.equipment.variant || this.equip.type !== t) this.buildEquipment(t, pl.equipment.spec, pl.stance);
    } else this.buildEquipment(t, getEquipmentSpec(t, variant), 'regular');
    return this.equip;
  }

  buildEquipment(type, spec, stance = 'regular') {
    if (!this.model) { this.equip = null; return; }
    if (this.gear) { this.visual.remove(this.gear); disposeEquipmentModel(this.gear); }
    this.gear = createEquipmentModel(type, spec, { stance });
    this.visual.add(this.gear);
    this.equip = { type, variant: spec.id, spec, stance };
    const parts = this.gear.userData.parts;
    this.skis = parts.skis || null;
    this.board = parts.board || null;
    for (const pole of this.poles) pole.visible = type === 'ski';
    this.p.stanceYaw = this.stanceYawTarget();
    this.contacts = (type === 'ski' ? ['left', 'right'] : ['nose', 'waist', 'tail']).map((id) => ({
      id, position: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(0, 1, 0),
      edgeAngle: 0, load: 0, speed: 0, grounded: false, depth: 0,
    }));
  }

  stanceYawTarget() {
    if (!this.equip || this.equip.type !== 'snowboard') return 0;
    return this.equip.stance === 'goofy' ? Math.PI / 2 : -Math.PI / 2;   // chest toward the toe edge
  }

  buildGear() {
    // Poles: placed every frame from the hands (see placePoles).
    const pg = poleGeometry();
    const pm = toonMaterial({ name: 'pole', vertexColors: true, rim: 0.4 });
    this.poles = [0, 1].map(() => { const m = new THREE.Mesh(pg, pm); m.castShadow = true; this.visual.add(m); return m; });
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
    this.helmetMat = toonMaterial({ name: 'helmet', color: 0xff3d7f, rim: 0.8 });
    place(new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.helmetMat),
      new THREE.Matrix4().compose(new THREE.Vector3(0, 1.69, -0.006), new THREE.Quaternion(), new THREE.Vector3(0.95, 1.02, 1.1)));
    const lensMat = this.lensMat = toonMaterial({ name: 'lens', color: 0x2ff5d6, rim: 1.0 });
    lensMat.userData.uniforms.uEmissiveBoost.value = 0;
    place(new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.12, 6, 16), lensMat),
      new THREE.Matrix4().compose(new THREE.Vector3(0, 1.703, 0.1), new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2), new THREE.Vector3(1, 1, 0.55)));
  }

  /**
   * Outfit colours (hex numbers or CSS strings), for clothing customisation. Any subset of:
   * { jacket, jacket2 (shoulders), pants, gloves (gloves + boots), trim, trim2 (neon), helmet, lens }.
   */
  setOutfit(o = {}) {
    const U = this.suit?.userData.uniforms;
    const set = (u, v) => { if (u && v !== undefined) u.value.set(v); };
    if (U) {
      set(U.uJacket, o.jacket); set(U.uJacket2, o.jacket2); set(U.uPants, o.pants); set(U.uGloves, o.gloves);
      set(U.uNeon, o.trim); set(U.uNeon2, o.trim2);
    }
    if (o.helmet !== undefined) this.helmetMat?.color.set(o.helmet);
    if (o.lens !== undefined) this.lensMat?.color.set(o.lens);
  }

  get isBoard() { return this.equip?.type === 'snowboard'; }

  update(dt, camera) {
    const pl = this.player, p = this.p;
    if (!this.model || !this.equip) return;
    p.t += dt;
    this.snapT += dt;
    this.root.position.copy(pl.renderPos);
    this.root.position.y -= pl.sink * (this.fp ? 0.45 : 1);   // deep powder swallows the gear when slow (less in first person)
    this.root.quaternion.copy(pl.renderOrient);
    const st = pl.state;
    const ground = st === State.GROUNDED, air = st === State.AIR, sit = st === State.LIFT, crashed = st === State.CRASH;
    const ratio = pl.speedRatio;
    const k = (r) => 1 - Math.exp(-r * dt);
    const board = this.isBoard;

    // --- layer drivers
    let crouchT = 0.45 + ratio * 0.15 + pl.tuck * 0.45 + pl.squat * 0.55 + pl.brake * 0.15;
    if (air) crouchT = 0.35 + pl.grab * 0.5;
    p.crouch += (Math.min(1, crouchT) - p.crouch) * k(10);
    p.tuck += ((ground ? pl.tuck : 0) - p.tuck) * k(ANIM.tuckResponse);
    p.air += ((air ? 1 : 0) - p.air) * k(5);
    p.sit = sit ? (pl.liftT < 0.02 ? 1 : p.sit + (1 - p.sit) * k(6)) : p.sit * Math.exp(-6 * dt);
    p.crash += ((crashed ? 1 : 0) - p.crash) * k(6);
    p.stumble += ((pl.stumbleT > 0 ? 1 : 0) - p.stumble) * k(10);
    p.plow += ((ground ? pl.plow : 0) - p.plow) * k(8);
    p.stop += ((ground ? pl.stop : 0) - p.stop) * k(8);
    p.press += ((ground ? pl.press : 0) - p.press) * k(12);
    p.grab += ((air ? pl.grab : 0) - p.grab) * k(14);
    p.stanceYaw += (this.stanceYawTarget() * (1 - p.sit) - p.stanceYaw) * k(10);
    // Look direction along the bord: +1 toward the nose, −1 toward the tail (switch).
    p.look += (pl.travelSign - p.look) * k(5);

    // Lean = atan(contact force / g) across the gear; the gear rolls to its edge angle on top.
    // Players driven by physics lean on the real contact force; preview players (lobby) that only set
    // turnInput get a matching lean from it.
    const lat = ground ? (pl.simulated ? pl.gearLatAccel : (pl.turnInput || 0) * 4) : 0;
    const leanT = THREE.MathUtils.clamp(Math.atan2(lat, PHYSICS.gravity), -ANIM.maxLean, ANIM.maxLean);
    p.lean += (leanT - p.lean) * k(ANIM.rollResponse);
    const edgeNose = ground ? pl.edgeAngle * pl.travelSign : 0;
    const edgeT = THREE.MathUtils.clamp(edgeNose, -ANIM.maxGearEdge, ANIM.maxGearEdge);
    p.edge += (edgeT - p.edge) * k(14);
    // Snowboard: which edge is down (toe = +1 side of the nose frame for regular).
    const toeX = this.equip.stance === 'goofy' ? -1 : 1;
    const edgeSideToe = Math.sign(p.edge) === toeX ? 1 : 0;
    p.toe += ((board ? Math.abs(p.lean) / ANIM.maxLean * edgeSideToe : 0) - p.toe) * k(8);
    p.heel += ((board ? Math.abs(p.lean) / ANIM.maxLean * (1 - edgeSideToe) : 0) - p.heel) * k(8);
    // Upper body leads the turn (rotation-led on a board, anticipation on skis).
    // Wind-up: while loading a pop and steering, the shoulders counter-rotate against the coming spin.
    // The upper body leads edge changes: follow the raw input (ahead of the smoothed edge) by ~0.1 s.
    const leadGround = pl.squat > 0.05 && Math.abs(pl.windup || 0) > 0.05 ? (pl.windup || 0) * 1.4 : -(pl._ctrl?.steer || pl.turnInput || 0);
    p.lead += ((ground ? leadGround : air ? THREE.MathUtils.clamp(pl.spinRate * 0.12, -0.6, 0.6) : 0) - p.lead) * k(6);
    // Double-pole push on skis (W when slow): a looping reach-plant-push cycle.
    const pushing = ground && !board && pl._ctrl?.up > 0.3 && pl.speed < (pl.dyn?.C.pushMaxSpeed ?? 8);
    p.push = (p.push || 0) + ((pushing ? 1 : 0) - (p.push || 0)) * k(6);
    if (pushing || p.push > 0.02) p.pushPhase = ((p.pushPhase || 0) + dt * 1.6) % 1;
    // Idle when standing still: breathing, glancing around (also brings the lobby stand-in to life).
    this._stillT = ground && pl.speed < 0.3 ? (this._stillT || 0) + dt : 0;
    p.idle = (p.idle || 0) + ((this._stillT > 1.2 ? 1 : 0) - (p.idle || 0)) * k(2);
    // One-foot skate on the board (W when slow): rear foot out of its binding, pushing on the toe side.
    const skating = ground && board && pl._ctrl?.up > 0.3 && pl.speed < (pl.dyn?.C.pushMaxSpeed ?? 4.5) && pl.squat < 0.05;
    p.skate = (p.skate || 0) + ((skating ? 1 : 0) - (p.skate || 0)) * k(7);
    if (skating || p.skate > 0.02) p.skatePhase = ((p.skatePhase || 0) + dt * 1.3) % 1;

    p.crashRoll += ((crashed ? Math.PI * 0.5 : 0) - p.crashRoll) * k(crashed ? 4 : 8);
    // Mid-air hip lean toward the travel direction (pitch with vertical speed) + twist to look ahead.
    const vy = pl.velocity.y;
    const hipT = air ? THREE.MathUtils.clamp(-vy / 12, -1, 1) * ANIM.hipLean : 0;
    p.hip += (hipT - p.hip) * k(4);
    p.twist += ((air ? 0.12 : 0) - p.twist) * k(4);

    // Visual roll about the gear's long axis (−lean: + lean = to the nose's right).
    this.visual.quaternion.setFromAxisAngle(Z, -p.lean)
      .multiply(_q.setFromAxisAngle(X, p.crashRoll * 0.6))
      .multiply(_q2.setFromAxisAngle(Z, p.crashRoll));
    this.visual.position.set(0, -p.sit * (this.pelvisH - 0.14), 0);
    this.body.rotation.y = p.stanceYaw;

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
    const sy = (1 - squat * ANIM.squatMax * (board ? 0.6 : 1)) * (1 + sq);
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
    this.gear.userData.setNeon(this.neon * 1.6);

    this.chair.visible = sit;
    const gearRoll = THREE.MathUtils.clamp(p.edge, -ANIM.maxGearEdge, ANIM.maxGearEdge) - p.lean;
    if (board) this.placeBoard(gearRoll);
    else this.placeSkis(gearRoll, pl, dt);
    this.pose(pl);
    if (p.sit > 0.01) this.gearToFeet(p.sit);
    this.placePoles(pl);
    this.root.updateMatrixWorld(true);
    this.updateContacts(pl);
    void camera;
  }

  placeSkis(gearRoll, pl, dt) {
    const p = this.p;
    // Pole plant timing: a touch on the new inside whenever the edges change at speed.
    const es = Math.sign(pl.edgeAngle);
    if (es !== 0 && es !== this._lastEdgeSign && pl.speed > 4 && Math.abs(pl.turnInput) > 0.3 && pl.state === State.GROUNDED) {
      const side = es > 0 ? 1 : 0;      // turning right → right pole (index 1)
      p.plant[side] = 1;
    }
    if (es !== 0) this._lastEdgeSign = es;
    p.plant[0] = Math.max(0, p.plant[0] - dt / ANIM.polePlantTime);
    p.plant[1] = Math.max(0, p.plant[1] - dt / ANIM.polePlantTime);
    // Skis parallel under the boots, wedged into a snowplough, lifted with the feet in the air.
    const lift = 0.0 + p.air * 0.12 + p.grab * 0.1;
    const wide = ANIM.skiStance + p.plow * 0.1;
    const [L, R] = this.skis;
    L.position.set(-wide, lift, 0.0); L.rotation.set(0, -p.plow * 0.28, gearRoll * -1, 'YXZ');
    R.position.set(wide, lift, 0.0); R.rotation.set(0, p.plow * 0.28, gearRoll * -1, 'YXZ');
    // In the air with a grab, cross the skis a little (Japan / mute flavour).
    if (p.grab > 0.01) { L.rotation.y += p.grab * 0.25; R.rotation.y -= p.grab * 0.1; }
    // Inner edge stays on the snow: pivot the roll about the edge.
    const off = Math.abs(Math.sin(gearRoll)) * 0.045;
    // The body rolls about the centre line, which would push the inside ski into the snow: lift each
    // ski back to the surface (inside knee flexes, outside leg extends) — the classic carving stack.
    const tl = Math.tan(this.p.lean);
    L.position.y += off + L.position.x * tl; R.position.y += off + R.position.x * tl;
  }

  placeBoard(gearRoll) {
    const p = this.p, B = this.board, spec = this.equip.spec;
    const lift = p.air * BA.airTuck + p.grab * BA.grabTuck;
    // Board flex while pressing: tail press lifts the nose and vice versa; the pop snaps the free end up.
    const snap = this.snapT < 0.5 ? this.snapSign * BA.popSnap * Math.exp(-9 * this.snapT) * Math.min(1, this.snapT * 25) : 0;
    const pitch = -p.press * BA.pressPitch + snap + this.player.powder * 0.04 * (1 - this.player.speedRatio);
    p.pitch += (pitch - p.pitch) * (this.snapT < 0.5 ? 0.6 : 0.3);
    // Roll about the edge that's in the snow, pitch about the end that's pressed.
    const hw = spec.waist * 0.5;
    const roll = -gearRoll;
    B.rotation.set(p.pitch, 0, roll, 'ZXY');
    B.position.set(0, lift + Math.abs(Math.sin(roll)) * hw + Math.abs(Math.sin(p.pitch)) * spec.length * 0.38, 0);
  }

  /** On the chairlift the legs dangle: hang the skis / board from the boots instead of the snow. */
  gearToFeet(w) {
    this.root.updateMatrixWorld(true);
    const fl = this.visual.worldToLocal(this.bones.foot_l.getWorldPosition(new THREE.Vector3()));
    const fr = this.visual.worldToLocal(this.bones.foot_r.getWorldPosition(new THREE.Vector3()));
    const drop = 0.1;
    if (this.skis) {
      // Armature +X (left foot) is visual −X: left ski under the left boot.
      for (const [ski, f] of [[this.skis[0], fl], [this.skis[1], fr]]) {
        ski.position.lerp(new THREE.Vector3(f.x, f.y - drop, f.z - 0.05), w);
        ski.rotation.x = 0.35 * w;   // tips hang down
      }
    } else if (this.board) {
      const mid = fl.clone().add(fr).multiplyScalar(0.5);
      this.board.position.lerp(new THREE.Vector3(mid.x, mid.y - drop, mid.z), w);
    }
  }

  /**
   * World-space contact points for spray / tracks, refreshed every frame in update():
   *   skis: [left, right]; snowboard: [nose, waist, tail]
   * Each: { id, position, direction (unit travel dir), normal, edgeAngle (rad, signed: + = right-turn
   * edge), load (0..1, sums to ~1 on the ground, 0 in the air), speed (m/s), grounded,
   * depth (m the gear sits below the powder surface — add it to position.y for a surface point) }.
   * Objects are reused between frames — copy what you keep.
   */
  getContactPoints() { return this.contacts; }

  updateContacts(pl) {
    if (!this.contacts.length) return;
    const ground = pl.state === State.GROUNDED;
    const dir = new THREE.Vector3(-Math.sin(pl.heading), 0, -Math.cos(pl.heading)).multiplyScalar(pl.travelSign);
    if (pl.speed > 0.3) dir.copy(pl.velocity).normalize();
    const n = pl.groundNormal;
    const edge = pl.edgeAngle;
    const eSide = Math.abs(edge) > 0.05 ? Math.sign(edge) * pl.travelSign : 0;   // nose-frame side of the biting edge
    const tmp = new THREE.Vector3();
    if (this.equip.type === 'ski') {
      const lat = Math.abs(pl.latAccel);
      const outside = 0.5 + 0.35 * Math.min(1, lat / 15);
      // Right turn → left ski is the outside ski.
      const loads = pl.latAccel > 0 ? [outside, 1 - outside] : pl.latAccel < 0 ? [1 - outside, outside] : [0.5, 0.5];
      this.skis.forEach((ski, i) => {
        const c = this.contacts[i];
        const hw = this.equip.spec.waist * 0.5;
        ski.localToWorld(tmp.set(eSide * hw, 0, 0));
        c.position.copy(tmp); c.direction.copy(dir); c.normal.copy(n);
        c.edgeAngle = edge; c.load = ground ? loads[i] : 0; c.speed = pl.speed; c.grounded = ground; c.depth = pl.sink;
      });
    } else {
      const spec = this.equip.spec;
      const hw = spec.waist * 0.5, half = spec.length * 0.4, sb = spec.setback || 0;
      const press = this.p.press;
      // Load: waist carries most; pressing shifts it to the nose / tail; powder sinks the tail (setback).
      const aft = THREE.MathUtils.clamp(-press * 0.35 * pl.travelSign + pl.powder * 0.08, -0.4, 0.4);
      const loads = [0.25 - aft, 0.5, 0.25 + aft];
      [[-sb - half], [-sb], [-sb + half]].forEach(([z], i) => {
        const c = this.contacts[i];
        this.board.localToWorld(tmp.set(eSide * hw, 0, z));
        c.position.copy(tmp); c.direction.copy(dir); c.normal.copy(n);
        c.edgeAngle = edge; c.load = ground ? Math.max(0, loads[i]) : 0; c.speed = pl.speed; c.grounded = ground; c.depth = pl.sink;
      });
    }
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
    const B = this.bones;
    for (const [b, r] of this.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.G.clear();
    this.G.set(B.root, this.restLocal.get(B.root).m.clone());
    if (this.isBoard) this.poseBoard(pl); else this.poseSki(pl);
  }

  /** Shared: pelvis offset/rotation, spine bend/twist/roll, neck + head. */
  trunk(off, yaw, pitch, spineBend, spineTwist, spineRoll, headYaw, headPitch) {
    const B = this.bones, p = this.p, id = p.idle || 0;
    if (id > 0.001) {
      const t = p.t;
      spineBend += id * 0.025 * Math.sin(t * 1.7);                        // breathing
      headYaw += id * (0.35 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 0.91 + 1.3));   // looking around
      headPitch -= id * (0.12 + 0.06 * Math.sin(t * 0.53));               // eyes up off the snow (− = up)
      off = off.clone(); off.y += id * 0.008 * Math.sin(t * 1.7);
    }
    const rp = this.restGlobal.get(B.pelvis);
    const pp = pos(rp).add(off);
    const pq = new THREE.Quaternion().setFromAxisAngle(Y, yaw)
      .multiply(_q.setFromAxisAngle(X, pitch))
      .multiply(_q2.setFromRotationMatrix(rp));
    this.setGlobal(B.pelvis, _m.compose(pp, pq, scl(rp)).clone());
    for (const n of ['spine_01', 'spine_02', 'spine_03']) {
      this.inherit(B[n]);
      this.rotateGlobal(B[n], new THREE.Quaternion().setFromAxisAngle(Y, spineTwist / 3)
        .multiply(_q.setFromAxisAngle(X, spineBend / 3))
        .multiply(_q2.setFromAxisAngle(Z, spineRoll / 3)));
    }
    this.inherit(B.neck_01);
    this.rotateGlobal(B.neck_01, new THREE.Quaternion().setFromAxisAngle(Y, headYaw * 0.45).multiply(_q.setFromAxisAngle(X, headPitch * 0.5)));
    this.inherit(B.Head);
    this.rotateGlobal(B.Head, new THREE.Quaternion().setFromAxisAngle(Y, headYaw * 0.55).multiply(_q.setFromAxisAngle(X, headPitch * 0.5)));
    // First person (helmet cam): collapse the head (and helmet) so the camera never sees inside it.
    if (this.fp) B.Head.scale.setScalar(0.001);
  }

  poseSki(pl) {
    const p = this.p;
    const ns = 1 - p.sit;
    const drop = p.crouch * 0.38 + p.tuck * 0.1;
    const hipPitch = THREE.MathUtils.degToRad(10 + p.crouch * 22 + p.tuck * 22) * ns;
    // Angulation: hips move to the inside of the turn, upper body stays more upright than the legs.
    const angul = (p.edge - p.lean) * ANIM.angulation * (1 - p.air);
    // Hockey stop / skid: upper body keeps facing down the path while the skis pivot across it.
    const counter = (pl.state === State.GROUNDED ? pl.skidAngle : 0) * 0.75 + p.lead * 0.12;
    const off = new THREE.Vector3(-angul * 0.12, -drop * ns - p.crash * 0.5, -p.crouch * 0.06 * ns - p.stop * 0.05);
    const twist = p.twist * ns;
    let bend = THREE.MathUtils.degToRad(10 + p.crouch * 16 + p.tuck * 30) * (1 - p.air * 0.3);
    bend -= THREE.MathUtils.degToRad(12) * p.sit;
    const wob = p.stumble * Math.sin(p.t * 9) * 0.25;
    // Riding switch (twin tips): twist the torso and look back over the shoulder down the path.
    const back = (1 - p.look) * 0.5 * ns;
    this.trunk(off, twist * 0.45 + counter * 0.3 + back * 0.25, hipPitch * 0.55 + p.hip * 0.5, bend + p.hip * 0.6, twist * 0.55 + counter * 0.7 + back * 0.6, -angul * 1.3 + wob,
      -counter * 0.6 + back * 1.15, -(hipPitch * 0.55 + bend) * 0.95 * (1 - back * 0.6));
    for (const side of [1, -1]) {
      // Armature +X is the rider's left (visual −X): match the ski's lift so the boots stay clipped in.
      const lx = -side * (ANIM.skiStance + p.plow * 0.1);
      const ankle = new THREE.Vector3(side * (ANIM.skiStance + p.plow * 0.1), this.ankleH + p.air * 0.12 + p.grab * 0.1 + lx * Math.tan(p.lean), 0.0);
      // Feet point down the skis; tips pinch together in a snowplough.
      this.leg(side, ankle, new THREE.Vector3(side * 0.12, 0, 1), -side * p.plow * 0.28);
      this.armSki(side, pl);
    }
  }

  poseBoard(pl) {
    const p = this.p, st = this.equip.spec.stance;
    const ns = 1 - p.sit;
    const nx = this.equip.stance === 'goofy' ? -1 : 1;   // armature X of the board nose
    const lift = p.air * BA.airTuck + p.grab * BA.grabTuck;
    const drop = BA.crouch + p.crouch * 0.14 + pl.speedRatio * BA.crouchSpeed * (1 - p.air) + p.grab * 0.08;
    const off = new THREE.Vector3(
      nx * p.press * BA.pressShift - nx * 0.02,
      (-drop - p.heel * BA.heelSit * 0.6) * ns - p.crash * 0.5,
      (p.toe * BA.toeDrive - p.heel * BA.heelSit) * ns,
    );
    const hipYaw = nx * BA.hipOpen * ns;
    // The whole body already rolls onto the edge (visual lean), so toe side keeps the torso tall
    // (knees and hips drive forward) and heel side sits down without folding.
    const hipPitch = (0.12 + p.crouch * 0.25 - p.toe * 0.06 + p.heel * 0.05 + p.grab * 0.22) * ns;
    const wob = p.stumble * Math.sin(p.t * 9) * 0.25;
    // Shoulders open toward the nose, rotation leads the turn; in the air the spin leads.
    const lead = p.lead * BA.turnLead;
    const sk = p.skate || 0;
    off.x += nx * 0.08 * sk;                                  // weight over the front foot while skating
    const spineTwist = (nx * (BA.shoulderOpen - BA.hipOpen) + lead + nx * 0.45 * sk) * ns;
    const bend = (0.1 + p.crouch * 0.2 - p.toe * 0.04 + p.heel * 0.12 + p.grab * 0.26) * ns;
    // Head: look down the direction of travel (nose, or over the back shoulder when switch).
    const headYaw = (nx * p.look * BA.headTurn - nx * BA.shoulderOpen - lead - nx * 0.5 * sk) * ns;
    this.trunk(off, hipYaw + nx * 0.3 * sk, hipPitch + p.hip * 0.5, bend + p.hip * 0.4, spineTwist, wob - p.lean * 0.15, headYaw, -(hipPitch + bend) * 0.6);
    // Legs: feet in the bindings across the board, knees toward the toe edge and a little duck.
    const w = st.width / 2;
    const feet = [[nx, st.front], [-nx, st.back]];   // [armature x sign, binding angle]
    for (const [sx, ang] of feet) {
      const along = sx * w;
      const legSide = along > 0 ? 1 : -1;    // armature +X → left leg
      // Board pitch (press / pop snap): the board pivots about the end on the snow (placeBoard), so each
      // binding rises by sin(pitch)·(distance toward the nose) plus the pivot lift.
      const sp = Math.sin(p.pitch);
      const pitchLift = sp * along * nx + Math.abs(sp) * this.equip.spec.length * 0.38;
      const ankle = new THREE.Vector3(along, this.ankleH + 0.02 + lift + pitchLift, 0);
      ankle.lerp(new THREE.Vector3(legSide * 0.12, this.ankleH + 0.35, 0.42), p.sit);
      let footYaw = nx * THREE.MathUtils.degToRad(ang) * ns;
      if (sx !== nx && sk > 0.01) {
        // Skating foot: plant beside the front binding on the toe side, push back past the tail,
        // then lift and swing forward again; the foot points down the board.
        const ph = p.skatePhase || 0;
        const push = ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4;
        const lift2 = ph < 0.6 ? 0 : Math.sin((ph - 0.6) / 0.4 * Math.PI) * 0.12;
        ankle.lerp(new THREE.Vector3(nx * (0.08 - push * 0.6), this.ankleH + lift2, 0.3), sk);
        footYaw += (nx * Math.PI * 0.5 - footYaw) * sk;
      }
      const pole = new THREE.Vector3(legSide * 0.25, 0, 1);
      this.leg(legSide, ankle, pole, footYaw);
    }
    for (const side of [1, -1]) this.armBoard(side, nx, pl);
  }

  /** Two-bone leg IK toward `ankle` (armature space), knee bending toward `pole`, foot yaw `footYaw`. */
  leg(side, ankle, pole, footYaw) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const thigh = B['thigh' + s], calf = B['calf' + s], foot = B['foot' + s];
    this.inherit(thigh);
    const hip = pos(this.g(thigh));
    if (!this.isBoard) ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.12, -0.5, 0.42)), p.sit);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.25, -0.75, 0.25)), p.crash);
    const l1 = this.restLocal.get(calf).p.length(), l2 = this.restLocal.get(foot).p.length();
    const to = ankle.clone().sub(hip);
    const d = Math.min(Math.max(to.length(), 0.05), l1 + l2 - 0.002);
    const dir = to.normalize();
    pole = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const axis = new THREE.Vector3().crossVectors(dir, pole).normalize();
    const knee = hip.clone().add(dir.clone().applyAxisAngle(axis, Math.acos(cosA)).multiplyScalar(l1));
    this.aim(thigh, calf, knee.clone().sub(hip));
    this.inherit(calf);
    this.aim(calf, foot, ankle.clone().sub(pos(this.g(calf))));
    this.inherit(foot);
    const rf = this.restGlobal.get(foot);
    const fq = new THREE.Quaternion().setFromAxisAngle(Y, footYaw).multiply(_q.setFromRotationMatrix(rf));
    this.setGlobal(foot, new THREE.Matrix4().compose(pos(this.g(foot)), fq, scl(rf)));
  }

  /** Aim upper / lower arm along two directions (armature space). */
  armAim(side, u, l) {
    const B = this.bones, s = side > 0 ? '_l' : '_r';
    const upper = B['upperarm' + s], lower = B['lowerarm' + s], hand = B['hand' + s];
    this.inherit(B['clavicle' + s]);
    this.inherit(upper);
    this.aim(upper, lower, u);
    this.inherit(lower);
    this.aim(lower, hand, l);
    this.inherit(hand);
  }

  /** Common overlays: air balance, stumble flail, lift sit, crash. */
  armOverlays(side, u, l) {
    const p = this.p, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const fl = p.t * ANIM.flailSpeed;
    const upF = V(side * 0.7, 0.6 + Math.sin(fl + side * 2) * 0.6, Math.cos(fl * 1.3 + side) * 0.8);
    const loF = V(side * 0.5, 0.8 + Math.sin(fl * 1.7) * 0.5, Math.sin(fl + 1) * 0.9);
    const upSit = V(side * 0.2, -0.8, 0.45), loSit = V(side * 0.05, -0.15, 1);
    const upC = V(side, 0.4, 0.2), loC = V(side, 0.6, 0);
    u.lerp(upF, p.stumble).lerp(upSit, p.sit).lerp(upC, p.crash);
    l.lerp(loF, p.stumble).lerp(loSit, p.sit).lerp(loC, p.crash);
    return [u, l];
  }

  armSki(side, pl) {
    const p = this.p, V = (x, y, z) => new THREE.Vector3(x, y, z);
    // Skiing: hands forward and a little out, as if holding the poles; the inside hand reaches on turns.
    const reach = Math.max(0, pl.turnInput * -side) * 0.2;
    const plant = p.plant[side > 0 ? 0 : 1];
    const sway = Math.sin(p.t * 1.3 + side) * 0.03;
    const upS = V(side * 0.32, -0.8, 0.42 + reach + sway + plant * 0.25), loS = V(side * 0.12, -0.15 - plant * 0.25, 1.0);
    const upT = V(side * 0.18, -0.55, 0.7), loT = V(-side * 0.15, 0.05, 1.0);
    if (this.fp) {   // first person: hands carried higher and further forward so the gloves + poles frame the view
      upS.set(side * 0.38, -0.5, 0.78); loS.set(side * 0.08, 0.12, 1.0);
      upT.set(side * 0.3, -0.45, 0.85); loT.set(-side * 0.1, 0.2, 1.0);
    }
    const upA = V(side, 0.15 + Math.sin(p.t * 3.1 + side) * 0.12, 0.2), loA = V(side, 0.35, 0.25);
    // Grab: Safety = left hand to the left ski; Mute = right hand across to the left ski; Japan = left
    // hand behind to the front of the crossed skis.
    const name = pl.grabName || 'Safety';
    const grabHand = name === 'Mute' ? -1 : 1;
    const upG = name === 'Mute' ? V(0.2, -0.9, 0.35) : name === 'Japan' ? V(side * 0.15, -0.95, 0.15) : V(side * 0.3, -0.9, 0.3);
    const loG = name === 'Mute' ? V(0.35, -0.85, 0.3) : name === 'Japan' ? V(-side * 0.1, -0.9, 0.35) : V(side * 0.1, -0.9, 0.3);
    const g = side === grabHand ? p.grab : 0;
    // Double-pole push: reach forward and up, then plant and drive the hands back past the hips.
    const ph = p.pushPhase || 0, reachF = ph < 0.4 ? ph / 0.4 : 1 - (ph - 0.4) / 0.6;
    const upP = V(side * 0.3, -0.75 + reachF * 0.45, -0.25 + reachF * 1.0), loP = V(side * 0.1, -0.5 + reachF * 0.3, 0.2 + reachF * 0.7);
    let u = upS.lerp(upP, p.push).lerp(upT, p.tuck).lerp(upA, p.air * (1 - g)).lerp(upG, g);
    let l = loS.lerp(loP, p.push).lerp(loT, p.tuck).lerp(loA, p.air * (1 - g)).lerp(loG, g);
    [u, l] = this.armOverlays(side, u, l);
    this.armAim(side, u, l);
    // First person: turn the gloves into a pole grip (palms in, knuckles forward).
    if (this.fp) this.rotateGlobal(this.bones['hand' + (side > 0 ? '_l' : '_r')], new THREE.Quaternion().setFromAxisAngle(Z, side * 1.35).multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.5)));
  }

  armBoard(side, nx, pl) {
    const p = this.p, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const front = side === nx;                // the arm on the nose side
    const fx = front ? nx : -nx;              // its X direction (toward its end of the board)
    // Riding: front arm points loosely down the nose, rear arm relaxed by the back hip.
    let u = front ? V(fx * 0.75, -0.55, 0.3) : V(fx * 0.35, -0.85, 0.25);
    let l = front ? V(fx * 0.85, -0.25, 0.45) : V(fx * 0.25, -0.55, 0.65);
    // Toe side: hands drop toward the snow in front; heel side: arms reach forward to counter the sit.
    u.lerp(V(fx * 0.4, -0.75, 0.6), p.toe * 0.8);
    l.lerp(V(fx * 0.2, -0.85, 0.5), p.toe * 0.8);
    u.lerp(V(fx * 0.5, -0.6, 0.65), p.heel);
    l.lerp(V(fx * 0.35, -0.45, 0.85), p.heel);
    // Stops: arms out for balance.
    u.lerp(V(fx * 0.8, -0.35, 0.45), p.stop * 0.6);
    // Air: wide balance arms; grab: rear hand to the toe edge between the feet (Indy).
    const sw = Math.sin(p.t * 3.1 + side) * 0.1;
    u.lerp(V(fx * 0.9, 0.05 + sw, 0.25), p.air * 0.8);
    l.lerp(V(fx * 0.8, 0.2, 0.35), p.air * 0.8);
    // Grabs: Indy = rear hand, toe edge between the feet; Melon = front hand, heel edge; Nose / Tail.
    const name = pl.grabName || 'Indy';
    const grabFront = name === 'Melon' || name === 'Nose grab';
    if (front === grabFront && p.grab > 0.01) {
      const B = this.bones, s = side > 0 ? '_l' : '_r';
      this.inherit(B['clavicle' + s]); this.inherit(B['upperarm' + s]);
      const sh = pos(this.g(B['upperarm' + s]));
      const gy = this.ankleH + p.air * BA.airTuck + p.grab * BA.grabTuck + 0.05;
      const half = this.equip.spec.length * 0.42;
      const target = name === 'Melon' ? V(0, gy, -0.14) : name === 'Nose grab' ? V(nx * half, gy, 0) : name === 'Tail grab' ? V(-nx * half, gy, 0) : V(0, gy, 0.14);
      const d = target.sub(sh).normalize();
      u.lerp(d.clone().add(V(0, 0, 0.15)), p.grab);
      l.lerp(d, p.grab);
    }
    [u, l] = this.armOverlays(side, u, l);
    this.armAim(side, u, l);
  }

  /** Poles from the gloves down to the snow: trailing while skiing, planted on edge changes, tucked. */
  placePoles(pl) {
    const p = this.p;
    if (this.isBoard) { for (const pole of this.poles) pole.visible = false; return; }
    this.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    const down = new THREE.Vector3(0, -1, 0);
    [['hand_l', -1], ['hand_r', 1]].forEach(([name, sx], i) => {
      this.bones[name].getWorldPosition(hand);
      this.visual.worldToLocal(hand);
      const plant = p.plant[i];
      dir.set(sx * 0.16, -1, 0.42 - plant * 0.9).normalize();
      if (this.fp) dir.set(sx * 0.3, -1, -0.12 - plant * 0.5).normalize();   // first person: shafts drop away just outside the gloves
      if (p.push > 0.01) { const ph = p.pushPhase || 0; dir.lerp(new THREE.Vector3(sx * 0.1, -1, ph < 0.4 ? 0.1 : 0.55 + (ph - 0.4)), p.push).normalize(); }
      dir.lerp(new THREE.Vector3(sx * 0.08, -0.3, 1).normalize(), p.tuck).normalize();
      dir.lerp(new THREE.Vector3(sx * 0.6, -0.4, 0.3).normalize(), p.air * 0.5).normalize();
      this.poles[i].position.copy(hand);
      this.poles[i].quaternion.copy(q.setFromUnitVectors(down, dir));
      this.poles[i].visible = p.sit < 0.5;
    });
    void pl;
  }
}

/**
 * A stand-in for the physics Player so a Rider can be shown outside gameplay (lobby, shop, menus):
 *   const rider = new Rider(standInPlayer('snowboard', 'park', 'goofy'));
 *   await rider.load(loader); scene.add(rider.root);
 *   rider.setEquipment('ski', 'slalom'); rider.player.setStance('goofy'); rider.update(dt, camera);
 * It stands still in a relaxed stance on flat snow at the origin (move rider.root, or player.renderPos).
 */
export function standInPlayer(type = 'ski', variant, stance = 'regular') {
  const pl = {
    state: State.GROUNDED, renderPos: new THREE.Vector3(), renderOrient: new THREE.Quaternion(), heading: 0,
    velocity: new THREE.Vector3(), groundNormal: new THREE.Vector3(0, 1, 0), speed: 0, speedRatio: 0,
    sink: 0, powder: 0, tuck: 0, squat: 0, brake: 0, grab: 0, grabName: null, windup: 0, liftT: 0, stumbleT: 0,
    plow: 0, stop: 0, press: 0, butter: 0, travelSign: 1, gearLatAccel: 0, latAccel: 0, edgeAngle: 0, skidAngle: 0,
    turnInput: 0, spinRate: 0, landingEvent: 0, landingVy: 0, _ctrl: { up: 0 }, dyn: null, stance,
    setEquipment(t, v) {
      const tt = normalizeType(t);
      this.equipment = { type: tt, variant: getEquipmentSpec(tt, v).id, spec: getEquipmentSpec(tt, v) };
      return this.equipment;
    },
    setStance(s) { this.stance = s === 'goofy' ? 'goofy' : 'regular'; if (this.rider) this.rider.buildEquipment(this.equipment.type, this.equipment.spec, this.stance); },
  };
  pl.setEquipment(type, variant);
  return pl;
}

const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const scl = (m) => new THREE.Vector3().setFromMatrixScale(m);

/** Cel-shaded outfit from the baked zones (R jacket, G pants, B gloves/boots, A coverage), neon trims. */
function suitMaterial(src) {
  const m = toonMaterial({
    name: 'suit', map: src.map, rim: 1.0,
    vertPars: 'attribute vec4 color;\nvarying vec4 vZone;\nvarying vec3 vObj;',
    vert: 'vZone = color; vObj = position;',
    fragPars: `varying vec4 vZone;\nvarying vec3 vObj;\nuniform vec3 uNeon; uniform vec3 uNeon2;\nuniform vec3 uJacket; uniform vec3 uJacket2; uniform vec3 uPants; uniform vec3 uGloves;`,
    frag: /* glsl */`
      {
        float tot = max(vZone.r + vZone.g + vZone.b, 0.001);
        float jz = vZone.r / tot, pz = vZone.g / tot;
        // Jacket: bold colour-blocked shell (fictional "Northwake").
        vec3 jacket = mix(uJacket, uJacket2, step(1.28, vObj.y));
        vec3 pants = uPants;
        vec3 dark = uGloves;
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
    uniforms: {
      uNeon: { value: new THREE.Color(...ART.neonColor) }, uNeon2: { value: new THREE.Color(...ART.neonColor2) },
      uJacket: { value: new THREE.Color(0.16, 0.12, 0.42) }, uJacket2: { value: new THREE.Color(1.0, 0.35, 0.55) },
      uPants: { value: new THREE.Color(0.12, 0.6, 0.66) }, uGloves: { value: new THREE.Color(0.08, 0.08, 0.14) },
    },
  });
  return m;
}
