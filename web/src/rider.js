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
//   • crashes: the crash ragdoll (character/ragdoll/) poses the body while the player is in State.CRASH
// Public API: setEquipment(type, variant?), getContactPoints(), update(dt, camera), load(loader).
import * as THREE from 'three';
import { State } from './player.js';
import { ANIM, ART, PHYSICS } from './config.js';
import { chairGeo } from './lifts.js';
import { toonMaterial, outlineMaterial, mulberry32 } from './world.js';
import { on, emit } from './state.js';
import { createEquipmentModel, disposeEquipmentModel, poleGeometry, plankSurfaceAt, SKI_BINDING_SEAT, BOARD_BINDING_SEAT } from './equipment/models.js';
import { getEquipmentSpec, normalizeType } from './equipment/registry.js';
import { dressRider, HEAD_SCALE, OUTFIT_SLOTS } from './character/index.js';
import { outfitSlotsFromProfile } from './character/profile.js';
import { proportionRig } from './character/body.js';
import { FP, FP_BOARD, FP_POLE, fpPoleGeometry, fpSkiArm, fpBoardArm, fpPoleDir, fpProtract, fpHand, fpShadow } from './fpview.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const BA = ANIM.board;
const DEFAULT_COM = new THREE.Vector3(0, ANIM.flipPivot, 0);
const _qI = new THREE.Quaternion();
// Gear clearance (rider.clearance): garment points this far above the deck count as touching it (cloth
// thickness the sampled vertices don't carry); deeper than CLEAR_MAX below the top sheet is not "through
// the deck" but beside / under it (ignored).
const CLEAR_MARGIN = 0.012, CLEAR_MAX = 0.3;
const CLEAR_EASE = 12, CLEAR_LAG = 0.008;   // 1/s the clearance lift eases at; m it may lag what's needed
const CLEAR_NEAR = 0.62, CLEAR_NEAR_KNEE = 0.3;   // m: hips / knees higher than this above every plank skip the garment check (a jacket hem hangs well below the hip joint in a squat)
// Garment bones whose vertices are checked against the deck: hips, butt, jacket hem, thighs, shins.
const CLEAR_BONES = /^(pelvis|spine_01|spine_02|thigh_|calf_)/;
// Grabbing wrist: this far outside the plank's edge and above its top sheet (the mitt closes round the edge).
const GRAB_OUT = 0.075, GRAB_UP = 0.09;
// [bone, child bone (segment midpoint) or null, mass share] for the posed body's centre of mass.
const COM_SEGMENTS = [['pelvis', 'spine_01', 0.14], ['spine_01', 'spine_03', 0.22], ['spine_03', 'neck_01', 0.13], ['Head', null, 0.08],
  ['thigh_l', 'calf_l', 0.1], ['thigh_r', 'calf_r', 0.1], ['calf_l', 'foot_l', 0.045], ['calf_r', 'foot_r', 0.045], ['foot_l', null, 0.035], ['foot_r', null, 0.035],
  ['upperarm_l', 'lowerarm_l', 0.028], ['upperarm_r', 'lowerarm_r', 0.028], ['lowerarm_l', 'hand_l', 0.022], ['lowerarm_r', 'hand_r', 0.022]];

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
      // The body's material comes from the outfit (character/); eyes and brows stay toon-shaded.
      if (!o.material?.name?.includes('Superhero')) o.material = toonMaterial({ name: 'face', map: o.material.map, rim: 0.6 });
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
    // Head proportions (the old toon look used a heroic 1.12; the outfit is fitted at HEAD_SCALE).
    const hr = this.restLocal.get(this.bones.Head);
    hr.s.setScalar(HEAD_SCALE);
    hr.m.compose(hr.p, hr.q, hr.s);
    proportionRig(this.bones, this.restLocal);   // limb / head proportions (character/body.js)
    this.restGlobal = new Map();
    const walk = (b, parentM) => {
      const m = parentM.clone().multiply(this.restLocal.get(b).m);
      this.restGlobal.set(b, m);
      for (const c of b.children) if (c.isBone) walk(c, m);
    };
    walk(this.bones.root, new THREE.Matrix4());
    // Outfit + helmet (character/): procedural shells skinned to these bones, colours from the profile.
    this.look = dressRider(gltf.scene, { bones: this.bones, fp: () => !!this.fp });
    this.suit = this.look.suit;
    this.setOutfit(outfitSlotsFromProfile());
    on('loadout', (e) => { if (!e.slot || OUTFIT_SLOTS.includes(e.slot)) this.setOutfit(outfitSlotsFromProfile()); });
    this.ankleH = pos(this.restGlobal.get(this.bones.foot_l)).y;
    this.pelvisH = pos(this.restGlobal.get(this.bones.pelvis)).y;
    this.measureBoot();
    // Armature ← visual chain (body, model, glTF scene, …, armature): gear frames in pose space.
    this.armChain = [];
    for (let o = this.armature; o && o !== this.visual; o = o.parent) this.armChain.unshift(o);
    this.gf = { Mav: new THREE.Matrix4(), qva: new THREE.Quaternion(), qav: new THREE.Quaternion(), M: [new THREE.Matrix4(), new THREE.Matrix4()], Minv: [new THREE.Matrix4(), new THREE.Matrix4()], tilt: [new THREE.Quaternion(), new THREE.Quaternion()], up: [new THREE.Vector3(), new THREE.Vector3()] };
    this.lift = new THREE.Vector3();   // clearance push of the pelvis (armature space), per frame
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
    this.stack = this.stackOffset(type, spec, stance);
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
    const pg = this.poleGeo = poleGeometry();
    const pm = toonMaterial({ name: 'pole', vertexColors: true, rim: 0.4 });
    this.poles = [0, 1].map(() => { const m = new THREE.Mesh(pg, pm); m.castShadow = true; this.visual.add(m); return m; });
    // Lift chair (personal seat while riding up).
    const cg = chairGeo();
    this.chair = new THREE.Mesh(cg, cg.userData.materials);
    this.chair.position.set(0, 2.35, 0.15);
    this.chair.rotation.y = Math.PI;
    this.chair.visible = false;
    this.root.add(this.chair);
    // Helmet + goggles: built with the outfit (character/helmet.js), rigid on the head bone.
  }

  /**
   * Dress the rider: slot selections { jacket, pants, helmet, goggles, gloves: { garment, colorway, colors } }
   * (any subset; see character/outfits.js) or a resolveOutfit() result. Returns the resolved outfit.
   */
  setOutfit(o = {}) {
    return this.look?.apply(o);
  }

  get isBoard() { return this.equip?.type === 'snowboard'; }

  update(dt, camera) {
    const pl = this.player, p = this.p;
    if (!this.model || !this.equip) return;
    p.t += dt;
    this._dtLast = dt;   // (airLook smoothing)
    this.snapT += dt;
    // Crashed: the crash ragdoll (character/ragdoll/, installed on the game's own rider only) poses the body.
    if (this.ragdoll?.drives(pl)) { this.ragdoll.pose(this); fpShadow(this); return; }
    this.root.position.copy(pl.renderPos);
    // Deep powder swallows the gear a little when slow (less in first person).
    this.sinkVis = (pl.sink || 0) * ANIM.gearSinkVisual * (this.fp ? 0.45 : 1);
    this.root.position.y -= this.sinkVis;
    this.root.quaternion.copy(pl.renderOrient);
    // Flips turn about the centre of mass (≈ hip height), not the feet. The trick rotation (world frame,
    // physics/offaxis.js: renderOrient = renderTrick · renderBase) moves the feet round the pivot
    // base · (0, flipPivot, 0), so the centre of mass stays on the flight path whatever the rotation.
    const fl = pl.renderFlip || 0;   // signed about the gear's +X, already in renderOrient
    if (pl.renderTrick && pl.renderBase) {
      // The pivot is the posed body's own centre of mass (last frame's, root-local: a tuck or a grab moves
      // it), so the drawn body doesn't orbit the flight path while it turns; flipPivot until measured.
      const cl = this._comLocal || DEFAULT_COM;
      const c = _v1.copy(cl).applyQuaternion(pl.renderBase);
      this.root.position.add(c).sub(c.applyQuaternion(pl.renderTrick));
      // In the air the spin turns about it too: the body's centre of mass sits on the flight path
      // (player.renderCom: flipPivot above the physics point along the gear's up), whatever the heading.
      const w = this.p.air * (pl.simulated ? 1 : 0);
      if (w > 1e-3) {
        const want = pl.renderCom(_v2).sub(_v1.copy(cl).applyQuaternion(pl.renderOrient));
        this.root.position.lerp(want, w);
      }
    } else if (fl) {   // (players without the off-axis model, e.g. the loading screen's choreography)
      const c = _v1.set(0, ANIM.flipPivot, 0);
      const full = c.clone().applyQuaternion(pl.renderOrient);
      const base = c.applyQuaternion(_q.copy(pl.renderOrient).multiply(_q2.setFromAxisAngle(X, -fl)));
      this.root.position.add(base.sub(full));
    }
    const st = pl.state;
    const ground = st === State.GROUNDED, air = st === State.AIR, sit = st === State.LIFT, crashed = st === State.CRASH;
    // On a rail (physics/grind.js): balance lean, arms out, the upper body looking down the rail in a slide.
    const grind = st === State.GRIND, gt = pl.grindTilt;
    p.grind = (p.grind || 0) + ((grind ? 1 : 0) - (p.grind || 0)) * (1 - Math.exp(-14 * dt));
    p.gPitch = (p.gPitch || 0) + ((grind && gt ? THREE.MathUtils.clamp(gt.pitch, -1.2, 1.2) : 0) - (p.gPitch || 0)) * (1 - Math.exp(-16 * dt));
    p.gRoll = (p.gRoll || 0) + ((grind && gt ? THREE.MathUtils.clamp(gt.roll, -1.2, 1.2) : 0) - (p.gRoll || 0)) * (1 - Math.exp(-16 * dt));
    p.gTravel = (p.gTravel || 0) + ((grind && gt?.slide ? THREE.MathUtils.clamp(gt.travel, -1.7, 1.7) : 0) - (p.gTravel || 0)) * (1 - Math.exp(-10 * dt));
    const ratio = pl.speedRatio;
    const k = (r) => 1 - Math.exp(-r * dt);
    const board = this.isBoard;

    // --- layer drivers
    // Deep carves sink the hips (athletic stance: more knee flex the harder the turn, ANIM.carveCrouch).
    let crouchT = 0.45 + ratio * 0.15 + pl.tuck * 0.45 + pl.squat * 0.55 + pl.brake * 0.15 + (ground ? Math.abs(p.lean) / ANIM.maxLean * ANIM.carveCrouch : 0);
    // In the air the crouch follows the physical tuck (player.flipTuck: the faster the flip, the tighter
    // the ball); a flip turning open is a layout: body stretched long (less crouch).
    const flipTuckPhys = Math.max(0, pl.flipTuck ?? Math.min(1, Math.abs(pl.flipRate || 0) / 3.5));   // < 0 = stretched layout
    // Spin and flip together (a cork, rodeo, misty): the body stays compact through the off-axis part —
    // knees up, arms wrapped in — and only opens up to spot the landing (the stretched layout and the arms
    // flung wide belong to plain flips / slowing a plain spin; physics/offaxis.js turns the body).
    const tl = air && pl.dyn?.timeToLand ? pl.dyn.timeToLand() : 0;
    const comboT = air ? THREE.MathUtils.smoothstep(Math.abs(pl.flipRate || 0), 1, 2.2) * THREE.MathUtils.smoothstep(Math.abs(pl.spinRate || 0), 1.2, 2.8)
      * THREE.MathUtils.smoothstep(tl, ANIM.comboOpen[1], ANIM.comboOpen[0]) : 0;
    p.combo = (p.combo || 0) + (comboT - (p.combo || 0)) * k(6);
    const layoutT = air && Math.abs(pl.flipRate || 0) > 1.2 ? (1 - flipTuckPhys) * (1 - pl.grab) * (1 - p.combo) : 0;
    p.layout = (p.layout || 0) + (layoutT - (p.layout || 0)) * k(6);
    if (air) crouchT = Math.max(0.35 + pl.grab * 0.5 + flipTuckPhys * 0.5 - p.layout * 0.25, 0.35 + p.combo * ANIM.comboCrouch);
    if (grind) crouchT = 0.5 + pl.squat * 0.5 + pl.grab * 0.35 + Math.abs(p.gRoll) * 0.15;
    p.crouch += (Math.min(1, crouchT) - p.crouch) * k(10);
    p.tuck += ((ground ? pl.tuck : 0) - p.tuck) * k(ANIM.tuckResponse);
    p.air += ((air ? 1 : 0) - p.air) * k(5);
    p.sit = sit ? (pl.liftT < 0.02 ? 1 : p.sit + (1 - p.sit) * k(6)) : p.sit * Math.exp(-6 * dt);
    p.crash += ((crashed ? 1 : 0) - p.crash) * k(6);
    p.stumble += ((pl.stumbleT > 0 ? 1 : 0) - p.stumble) * k(10);
    p.plow += ((ground ? pl.plow : 0) - p.plow) * k(8);
    p.stop += ((ground ? pl.stop : 0) - p.stop) * k(8);
    p.press += ((ground || grind ? pl.press : 0) - p.press) * k(12);
    p.flipLoad = (p.flipLoad || 0) + (((ground ? pl.flipLoad : 0) || 0) - (p.flipLoad || 0)) * k(10);
    p.grab += ((air || grind ? pl.grab : 0) - p.grab) * k(14);
    // Tweak: a grab held past ~0.4 s gets style — the board is pushed out / the skis cross, the body arches.
    const grabT = pl.dyn?.takeoff?.grabT || 0;
    p.tweak = (p.tweak || 0) + ((air && pl.grab > 0.6 && PHYSICS.trickStyle ? THREE.MathUtils.smoothstep(grabT, 0.35, 0.9) : 0) - (p.tweak || 0)) * k(6);   // opt-in (trickStyle)
    // Flipping: knees pulled up, hands in toward the shins — as tight as the physics tuck (it is what
    // speeds the flip up), opening into the layout to slow down and spot the landing.
    p.flipTuck = (p.flipTuck || 0) + ((air && Math.abs(pl.flipRate || 0) > 0.6 ? flipTuckPhys * (1 - pl.grab) : 0) - (p.flipTuck || 0)) * k(8);
    // Spinning: arms wrapped in to speed up (player.spinTuck > 0), flung wide to slow down (< 0).
    p.spinTuck = (p.spinTuck || 0) + ((air && Math.abs(pl.spinRate || 0) > 1 ? (pl.spinTuck || 0) * (1 - pl.grab) : 0) - (p.spinTuck || 0)) * k(8);
    p.stanceYaw += (this.stanceYawTarget() * (1 - p.sit) - p.stanceYaw) * k(10);
    // Look direction along the bord: +1 toward the nose, −1 toward the tail (switch).
    p.look += (pl.travelSign - p.look) * k(5);

    // Lean = atan(contact force / g) across the gear; the gear rolls to its edge angle on top.
    // Players driven by physics lean on the real contact force; preview players (lobby) that only set
    // turnInput get a matching lean from it.
    const lat = ground ? (pl.simulated ? pl.gearLatAccel : (pl.turnInput || 0) * 4) : 0;
    const leanT = grind ? THREE.MathUtils.clamp(p.gRoll * 0.5, -0.6, 0.6) : THREE.MathUtils.clamp(Math.atan2(lat, PHYSICS.gravity), -ANIM.maxLean, ANIM.maxLean);
    // Steer let go: the body comes back up faster than it tips into a turn.
    const released = Math.abs(pl._ctrl?.steer || 0) < 0.05;
    // Just after touching down the gear snaps onto the slope, so the lean that keeps the body plumb on a
    // steep face has to catch up quickly too (spring.t = time since the landing), or the rider lies across the slope.
    const landed = ground && this.spring.t < ANIM.landLeanTime;
    p.lean += (leanT - p.lean) * k(landed ? ANIM.landLeanResponse : released && Math.abs(leanT) < Math.abs(p.lean) ? ANIM.rollRelease : ANIM.rollResponse);
    // The body's roll from vertical (+ = toward the nose's right): the lean plus the slope's own roll
    // under the gear. On a traverse the two cancel (plumb), so the head only levels real tilt.
    p.worldRoll = p.lean - Math.asin(THREE.MathUtils.clamp(_v1.set(1, 0, 0).applyQuaternion(pl.renderOrient).y, -1, 1));
    const edgeNose = ground ? pl.edgeAngle * pl.travelSign : 0;
    // The gear can only roll so far from the body (knees / hips / ankles, ANIM.maxAngulation): on a steep
    // cross-slope the physics edge can point against the lean (carving uphill), which used to fold the
    // legs 70–80° under the body; the drawn edge stays within reach of the lean.
    const edgeT = THREE.MathUtils.clamp(THREE.MathUtils.clamp(edgeNose, p.lean - ANIM.maxAngulation, p.lean + ANIM.maxAngulation), -ANIM.maxGearEdge, ANIM.maxGearEdge);
    p.edge += (edgeT - p.edge) * k(14);
    // Snowboard: which edge is down (toe = +1 side of the nose frame for regular).
    const toeX = this.equip.stance === 'goofy' ? -1 : 1;
    const edgeSideToe = Math.sign(p.edge) === toeX ? 1 : 0;
    p.toe += ((board ? Math.abs(p.lean) / ANIM.maxLean * edgeSideToe : 0) - p.toe) * k(8);
    p.heel += ((board ? Math.abs(p.lean) / ANIM.maxLean * (1 - edgeSideToe) : 0) - p.heel) * k(8);
    // Deep, fast carves: the inside hand trails in the snow (board: front hand toe side, rear hand heel side).
    const dragT = ground && board ? THREE.MathUtils.smoothstep(Math.abs(p.edge), BA.handDragEdge[0], BA.handDragEdge[1])
      * THREE.MathUtils.smoothstep(pl.speed, 6, 9) * (1 - (pl.stop || 0)) * (1 - (pl.butter || 0)) : 0;
    p.drag = (p.drag || 0) + (dragT - (p.drag || 0)) * k(6);
    // Upper body leads the turn (rotation-led on a board, anticipation on skis).
    // Wind-up: while loading a pop and steering, the shoulders counter-rotate against the coming spin.
    // The upper body leads edge changes: follow the raw input (ahead of the smoothed edge) by ~0.1 s.
    const leadGround = pl.squat > 0.05 && Math.abs(pl.windup || 0) > 0.05 ? (pl.windup || 0) * 1.4 : -(pl._ctrl?.steer || pl.turnInput || 0);
    const leadT = ground ? leadGround : air ? THREE.MathUtils.clamp(pl.spinRate * 0.12, -0.6, 0.6) : 0;
    p.lead += (leadT - p.lead) * k(ground && released && Math.abs(leadT) < Math.abs(p.lead) ? ANIM.leadRelease : 6);
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
      .multiply(_q.setFromAxisAngle(X, p.crashRoll * 0.6 - p.gPitch * 0.4 * p.grind))
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
    const glowT = ratio * 1.2 + (air ? 1.4 : 0) + pl.tuck * 0.5 + (pl.flowBoost || 0) * 2.2;   // SEND IT: the trims flare
    this.neon += (glowT - this.neon) * k(4);
    if (this.suit) this.suit.userData.uniforms.uEmissiveBoost.value = this.neon * 1.6;
    this.gear.userData.setNeon(this.neon * 1.6);

    this.chair.visible = sit;
    const gearRoll = THREE.MathUtils.clamp(p.edge, -ANIM.maxGearEdge, ANIM.maxGearEdge) - p.lean;
    if (board) this.placeBoard(gearRoll);
    else this.placeSkis(gearRoll, pl, dt);
    this.pose(pl, dt);
    if (p.sit > 0.01) this.gearToFeet(p.sit);
    this.placePoles(pl);
    this.root.updateMatrixWorld(true);
    if (air || p.air > 0.02) this.measureCom();
    fpShadow(this);   // first person: shadow-only helmet / head (the head bone is collapsed)
    this.updateContacts(pl);
    void camera;
  }

  /**
   * Centre of mass of the posed body in root-local coordinates (segment midpoints with rough Dempster
   * shares; the boots and gear ride with the feet). Kept in this._comLocal for the next frame's pivot.
   */
  measureCom() {
    const B = this.bones;
    if (!B?.pelvis) return;
    const c = _v3.set(0, 0, 0);
    let ws = 0;
    for (const [a, b, w] of COM_SEGMENTS) {
      const ba = B[a];
      if (!ba) continue;
      const pa = ba.getWorldPosition(_v1), bb = b && B[b];
      if (bb) pa.add(bb.getWorldPosition(_v2)).multiplyScalar(0.5);
      c.addScaledVector(pa, w); ws += w;
    }
    if (!ws) return;
    this.root.worldToLocal(c.multiplyScalar(1 / ws));
    // (smoothed a touch: a hand or a foot snapping between poses mustn't jolt the whole body)
    if (!this._comLocal) this._comLocal = c.clone();
    else this._comLocal.lerp(c, 0.5);
  }

  /** m the inside ski runs ahead in a carve (signed: + = the right ski, i.e. a right turn). */
  skiTipLead() { const p = this.p; return ANIM.skiTipLead * THREE.MathUtils.clamp(p.lean / ANIM.maxLean, -1, 1) * (1 - p.air) * (1 - p.plow) * (1 - p.sit); }

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
    // Press (butters / ollie load): the skis pitch about the pressed tails or tips, the pop snaps them.
    const snap = this.snapT < 0.5 ? this.snapSign * ANIM.skiPopSnap * Math.exp(-9 * this.snapT) * Math.min(1, this.snapT * 25) : 0;
    p.pitch += ((-p.press * ANIM.skiPressPitch + snap) - p.pitch) * (this.snapT < 0.5 ? 0.6 : 0.3);
    this.skiPitchLift = Math.abs(Math.sin(p.pitch)) * this.equip.spec.length * 0.4;
    const lift = 0.0 + p.air * 0.12 + p.grab * 0.1 + p.flipTuck * ANIM.flipTuckLift + this.skiPitchLift;
    const wide = ANIM.skiStance + p.plow * 0.1 + Math.abs(p.lean) / ANIM.maxLean * ANIM.skiStanceCarve * (1 - p.air);   // wider in deep carves (matches poseSki)
    const [L, R] = this.skis;
    // Carving, the inside ski runs a little ahead (tip lead; + lean = right turn → the right ski, R).
    const lead = this.skiTipLead();
    L.position.set(-wide, lift, -Math.max(0, -lead)); L.rotation.set(p.pitch, -p.plow * 0.28, gearRoll * -1, 'YXZ');
    R.position.set(wide, lift, -Math.max(0, lead)); R.rotation.set(p.pitch, p.plow * 0.28, gearRoll * -1, 'YXZ');
    // In the air with a grab, cross the skis a little (Japan / mute flavour).
    if (p.grab > 0.01) { L.rotation.y += p.grab * 0.25; R.rotation.y -= p.grab * 0.1; }
    // Tweaked: skis crossed hard (Japan / Mute / Safety), tips pulled up (Truck driver) or tails (Tail grab).
    const tw = p.tweak || 0;
    if (tw > 0.01) {
      const gn = pl.grabName || '';
      if (gn === 'Truck driver') { L.rotation.x += tw * 0.45; R.rotation.x += tw * 0.45; }
      else if (gn === 'Tail grab') { L.rotation.x -= tw * 0.35; R.rotation.x -= tw * 0.35; L.rotation.y -= tw * 0.2; R.rotation.y += tw * 0.2; }
      else { L.rotation.y += tw * 0.45; R.rotation.y -= tw * 0.35; L.rotation.z += tw * 0.25; R.rotation.z += tw * 0.2; }
    }
    // Inner edge stays on the snow: pivot the roll about the edge.
    const off = Math.abs(Math.sin(gearRoll)) * 0.045;
    // The body rolls about the centre line, which would push the inside ski into the snow: lift each
    // ski back to the surface (inside knee flexes, outside leg extends) — the classic carving stack.
    const tl = Math.tan(this.p.lean);
    L.position.y += off + L.position.x * tl; R.position.y += off + R.position.x * tl;
  }

  placeBoard(gearRoll) {
    const p = this.p, B = this.board, spec = this.equip.spec;
    const lift = p.air * BA.airTuck + p.grab * BA.grabTuck + p.flipTuck * ANIM.flipTuckLift;
    // Board flex while pressing: tail press lifts the nose and vice versa; the pop snaps the free end up.
    const snap = this.snapT < 0.5 ? this.snapSign * BA.popSnap * Math.exp(-9 * this.snapT) * Math.min(1, this.snapT * 25) : 0;
    const pitch = -p.press * BA.pressPitch + snap + this.player.powder * 0.04 * (1 - this.player.speedRatio);
    p.pitch += (pitch - p.pitch) * (this.snapT < 0.5 ? 0.6 : 0.3);
    // Roll about the edge that's in the snow, pitch about the end that's pressed.
    const hw = spec.waist * 0.5;
    const roll = -gearRoll;
    const tw = p.tweak || 0, tsg = /Melon|Tail/.test(this.player.grabName || '') ? -1 : 1;
    B.rotation.set(p.pitch + tw * 0.22, tw * 0.5 * tsg, roll + tw * 0.38 * tsg, 'ZXY');
    B.position.set(0, lift + Math.abs(Math.sin(roll)) * hw + Math.abs(Math.sin(p.pitch)) * spec.length * 0.38, 0);
  }

  /** On the chairlift the legs dangle: hang the skis / board from the boots instead of the snow. */
  gearToFeet(w) {
    this.root.updateMatrixWorld(true);
    const fl = this.visual.worldToLocal(this.bones.foot_l.getWorldPosition(new THREE.Vector3()));
    const fr = this.visual.worldToLocal(this.bones.foot_r.getWorldPosition(new THREE.Vector3()));
    // (the boot sole is ~12 cm under the ankle bone; the plank hangs under the sole, seated on its binding)
    const sole = this.boot ? -(this.boot[1].off.y + this.boot[-1].off.y) / 2 : 0.1;
    const drop = sole + (this.skis ? SKI_BINDING_SEAT : BOARD_BINDING_SEAT);
    if (this.skis && this.boot && this.footQ) {
      // Each ski hangs from its boot exactly: the boot's sole on the binding plate, the ski turned with the
      // foot (tips down, poseSki). Armature +X (left foot) = ski 0.
      const F = this.gf;
      [[this.skis[0], 1, 'foot_l'], [this.skis[1], -1, 'foot_r']].forEach(([ski, side, fb], i) => {
        const fq = this.footQ[i];
        const solePt = pos(this.g(this.bones[fb])).add(_v2.copy(this.boot[side].off).applyQuaternion(fq)).applyMatrix4(F.Mva);
        const q = _q.copy(F.qva).multiply(fq).multiply(F.qav);
        ski.position.lerp(solePt.sub(_v2.set(0, SKI_BINDING_SEAT, 0).applyQuaternion(q)), w);
        ski.quaternion.slerp(q, w);
      });
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
        c.edgeAngle = edge; c.load = ground ? loads[i] : 0; c.speed = pl.speed; c.grounded = ground; c.depth = this.sinkVis;
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
        c.edgeAngle = edge; c.load = ground ? Math.max(0, loads[i]) : 0; c.speed = pl.speed; c.grounded = ground; c.depth = this.sinkVis;
      });
    }
  }

  // ------------------------------------------------------------- boots in the bindings, gear clearance
  /**
   * The boot (the body mesh's boot zone, materials.js) in the rest pose: per foot (+1 = left, armature
   * +X) the offset from the ankle (foot bone) to the centre of the sole, armature axes (+Z forward).
   * The bindings seat that point on the binding plate (seatAnkle).
   */
  measureBoot() {
    const body = this.look?.meshes.body;
    this.boot = { 1: { off: new THREE.Vector3(0, -this.ankleH, 0.07) }, [-1]: { off: new THREE.Vector3(0, -this.ankleH, 0.07) } };
    const g = body?.geometry, C = g?.attributes.color;
    if (!C) return;
    const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = body.skeleton;
    const mats = sk.bones.map((b, i) => (this.restGlobal.has(b) ? this.restGlobal.get(b).clone().multiply(sk.boneInverses[i]).multiply(body.bindMatrix) : null));
    const box = { 1: new THREE.Box3(), [-1]: new THREE.Box3() };
    const v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      if (P.getY(i) > 0.6) continue;
      const r = C.getX(i), gg = C.getY(i), b = C.getZ(i);
      if (!(b > r + gg && b > 0.2)) continue;   // the boot zone (zone colour b below 0.6 m)
      v.fromBufferAttribute(P, i); acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k), m = mats[SI.getComponent(i, k)]; if (w > 0 && m) acc.addScaledVector(t.copy(v).applyMatrix4(m), w); }
      box[acc.x > 0 ? 1 : -1].expandByPoint(acc);
    }
    for (const side of [1, -1]) {
      const bx = box[side];
      if (bx.isEmpty()) continue;
      const ank = pos(this.restGlobal.get(this.bones[side > 0 ? 'foot_l' : 'foot_r']));
      this.boot[side].off.set((bx.min.x + bx.max.x) / 2 - ank.x, bx.min.y - ank.y, (bx.min.z + bx.max.z) / 2 - ank.z);
      this.boot[side].size = bx.getSize(new THREE.Vector3());
    }
  }

  /**
   * Whole-body shift (armature space) that keeps the old pose while the boots stand on their bindings:
   * up by the boot + binding stack, back so the ankles sit behind the boot centres.
   */
  stackOffset(type, spec, stance) {
    const out = new THREE.Vector3();
    if (!this.boot) return out;
    if (type === 'ski') {
      for (const side of [1, -1]) { const o = this.boot[side].off; out.y += (SKI_BINDING_SEAT - o.y - this.ankleH) / 2; out.z -= o.z / 2; }
    } else {
      const nx = stance === 'goofy' ? -1 : 1, st = spec.stance;
      for (const [side, ang] of [[nx, st.front], [-nx, st.back]]) {
        const o = this.boot[side].off.clone().applyAxisAngle(Y, nx * THREE.MathUtils.degToRad(ang));
        out.y += (BOARD_BINDING_SEAT - o.y - this.ankleH - 0.02) / 2; out.z -= o.z / 2;
      }
    }
    return out;
  }

  /** Gear parts (skis / board) in pose (armature) space for this frame: matrices, inverses, tilt, up. */
  gearFrames() {
    const F = this.gf, M = _m.identity();
    F.qva.identity();
    for (const o of this.armChain) { o.updateMatrix(); M.multiply(o.matrix); F.qva.multiply(o.quaternion); }
    (F.Mva || (F.Mva = new THREE.Matrix4())).copy(M);
    F.Mav.copy(M).invert();
    F.qav.copy(F.qva).invert();
    this.gear.updateMatrix();
    const parts = this.board ? [this.board] : this.skis;
    parts.forEach((part, i) => {
      part.updateMatrix();
      F.M[i].multiplyMatrices(F.Mav, this.gear.matrix).multiply(part.matrix);
      F.Minv[i].copy(F.M[i]).invert();
      // The part's rotation away from flat, expressed about the armature's axes.
      F.tilt[i].copy(F.qav).multiply(this.gear.quaternion).multiply(part.quaternion).multiply(F.qva);
      F.up[i].set(0, 1, 0).transformDirection(F.M[i]);
    });
    F.n = parts.length;
  }

  /**
   * Ankle target (armature space) and foot rotation that stand boot `side` (+1 = left) on part `i`'s
   * binding: `seat` = the binding's centre on the plate (part-local), `footYaw` = the binding angle.
   * The foot turns with the gear (edge roll, pitch, tweaks, a plough's wedge), so the sole stays flat
   * on the plate and nothing pokes through the base.
   */
  seatAnkle(i, side, seat, footYaw, outQ) {
    outQ.copy(this.gf.tilt[i]).multiply(_q.setFromAxisAngle(Y, footYaw));
    return seat.clone().applyMatrix4(this.gf.M[i]).sub(_v2.copy(this.boot[side].off).applyQuaternion(outQ));
  }

  /**
   * Garment vertices checked against the deck (CLEAR_BONES), with their bone offsets precomputed, so a
   * frame skins only these few hundred points (armature space, from the posed bone matrices).
   */
  buildProbes() {
    const m = this.look?.meshes.garments, g = m?.geometry;
    this._probeGeo = g;
    this.probes = null;
    const P = g?.attributes.position;
    if (!P || !g.attributes.skinIndex) return;
    const sk = m.skeleton, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    const pick = [];
    for (let i = 0; i < P.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
      if (CLEAR_BONES.test(sk.bones[best].name)) pick.push(i);
    }
    // Coarse probes first (every 8th: clearance() runs the rest only when the cloth comes near the gear).
    const order = [];
    for (let k = 0; k < 8; k++) for (let j = k; j < pick.length; j += 8) order.push(pick[j]);
    const n = order.length;
    const bones = [], w = new Float32Array(n * 4), u = new Float32Array(n * 12);
    const v = new THREE.Vector3(), t = new THREE.Vector3(), bm = new THREE.Matrix4();
    for (let j = 0; j < n; j++) {
      const i = order[j];
      v.fromBufferAttribute(P, i);
      for (let k = 0; k < 4; k++) {
        const bi = SI.getComponent(i, k);
        bones[j * 4 + k] = sk.bones[bi];
        w[j * 4 + k] = SW.getComponent(i, k);
        bm.multiplyMatrices(sk.boneInverses[bi], m.bindMatrix);
        t.copy(v).applyMatrix4(bm).toArray(u, j * 12 + k * 3);
      }
    }
    // (coarse = the first 1/8, dense = the first half: ~1 cm apart on the hips and thighs)
    this.probes = { n: Math.ceil(n / 2), coarse: Math.ceil(n / 8), bones, w, u };
  }

  /**
   * How far (m) the pelvis must rise along the gear's up for the garments to clear the deck / skis, and
   * that direction (armature space) in this._clearDir. Garment points inside a plank's footprint and below
   * its top sheet (+ CLEAR_MARGIN) count; ones much deeper than their distance to the edge are beside the
   * plank, not through it.
   */
  clearance() {
    if (this.look?.meshes.garments.geometry !== this._probeGeo) this.buildProbes();
    const pr = this.probes, F = this.gf;
    if (!pr || !F.n) return 0;
    const parts = this.board ? [this.board] : this.skis;
    const p = _v1, l = _v3, row = this._row || (this._row = {}), mats = new Map();
    // Cheap early-out (every riding frame): hips and knees well clear of every plank's plane → nothing to do.
    let near = false;
    for (let i = 0; i < parts.length && !near; i++) {
      for (const b of ['pelvis', 'calf_l', 'calf_r']) if (l.setFromMatrixPosition(this.g(this.bones[b])).applyMatrix4(F.Minv[i]).y < (b === 'pelvis' ? CLEAR_NEAR : CLEAR_NEAR_KNEE)) { near = true; break; }
    }
    if (!near) return 0;
    let need = 0, at = 0, close = false;
    for (let j = 0; j < pr.n; j++) {
      if (j === pr.coarse && !close) break;   // the coarse pass found no cloth near any plank
      p.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const wt = pr.w[j * 4 + k];
        if (wt <= 0) continue;
        const b = pr.bones[j * 4 + k];
        let m = mats.get(b);
        if (!m) { m = this.g(b); mats.set(b, m); }
        p.addScaledVector(_v2.fromArray(pr.u, j * 12 + k * 3).applyMatrix4(m), wt);
      }
      for (let i = 0; i < parts.length; i++) {
        l.copy(p).applyMatrix4(F.Minv[i]);
        if (!plankSurfaceAt(parts[i], l.z, row)) continue;
        const lat = row.hw - Math.abs(l.x);
        if (lat <= 0) continue;
        const d = row.top + CLEAR_MARGIN - l.y;
        if (d > -0.06 && d < CLEAR_MAX) close = true;
        if (d <= 0 || d > CLEAR_MAX || d > lat + 0.06) continue;
        if (d > need) { need = d; at = i; }
      }
    }
    if (need > 0) (this._clearDir || (this._clearDir = new THREE.Vector3())).copy(F.up[at]);
    return need;
  }

  /**
   * Two-bone arm IK: upper / lower arm directions (armature space) that put the wrist of arm `side` on
   * `target`, the elbow bending toward `pole`.
   */
  armReach(side, target, pole) {
    const B = this.bones, s = side > 0 ? '_l' : '_r';
    this.inherit(B['clavicle' + s]); this.inherit(B['upperarm' + s]);
    const sh = pos(this.g(B['upperarm' + s]));
    const l1 = this.restLocal.get(B['lowerarm' + s]).p.length(), l2 = this.restLocal.get(B['hand' + s]).p.length();
    const to = target.clone().sub(sh);
    const miss = to.length() - (l1 + l2);
    this.reachMiss = Math.max(this.reachMiss, miss);   // (m the hand falls short: gear-clip reports it)
    this.lastReach = { miss, dir: to.clone().normalize().negate() };   // (toward the shoulder)
    const d = Math.min(Math.max(to.length(), 0.05), l1 + l2 - 0.002);
    const dir = to.normalize();
    const pl = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const axis = new THREE.Vector3().crossVectors(dir, pl).normalize();
    const u = dir.clone().applyAxisAngle(axis, Math.acos(cosA));
    const elbow = sh.clone().addScaledVector(u, l1);
    return [u, target.clone().sub(elbow).normalize()];
  }

  /**
   * Where the grabbing wrist goes (armature space): just outside and above a plank's edge (or end), so the
   * mitt closes round the edge instead of sinking into the deck. part = index, z = part-local station,
   * side = which edge (+1 = part-local +X). `away` (0..1, = 1 − grab) holds the wrist out beside and
   * above that edge, so a grab coming in (or letting go) reaches round the edge, never through the deck.
   */
  grabPoint(i, z, side, away = 0) {
    const parts = this.board ? [this.board] : this.skis, row = plankSurfaceAt(parts[i], z, {}) || { hw: 0.1, top: 0.02 };
    return new THREE.Vector3(side * (row.hw + GRAB_OUT + 0.3 * away), row.top + GRAB_UP + 0.3 * away, z).applyMatrix4(this.gf.M[i]);
  }

  /**
   * Board grabs keep their straight reach (armBoard) unless it would put the mitt into the deck: where the
   * wrist of that reach would sit inside the board's footprint lower than GRAB_UP over the top sheet, the
   * arm blends (by how deep, eased out over a few frames) into a two-bone reach whose elbow bends so the
   * hand closes over the edge (`edge` +1 = toe, −1 = heel) at the grab's own station. Mutates u, l.
   */
  handClear(side, sh, u, l, target, edge) {
    const B = this.bones, s = side > 0 ? '_l' : '_r', F = this.gf, k = side > 0 ? 0 : 1;
    const fix = this._handFix || (this._handFix = [0, 0]);
    const l1 = this.restLocal.get(B['lowerarm' + s]).p.length(), l2 = this.restLocal.get(B['hand' + s]).p.length();
    const w = sh.clone().addScaledVector(_v2.copy(u).normalize(), l1).addScaledVector(_v3.copy(l).normalize(), l2).applyMatrix4(F.Minv[0]);
    const row = plankSurfaceAt(this.board, w.z, {});
    const depth = row && Math.abs(w.x) < row.hw + GRAB_OUT + 0.1 ? row.top + GRAB_UP - w.y : -1;
    const want = THREE.MathUtils.smoothstep(depth, -0.1, 0);
    fix[k] = Math.max(want, fix[k] * Math.exp(-10 * (this._dtLast || 1 / 60)));
    if (fix[k] < 0.002) return;
    const t = this.board.userData.plank?.geometry.userData.surface;
    const z = THREE.MathUtils.clamp(target.clone().applyMatrix4(F.Minv[0]).z, t ? t[0].z + 0.1 : -0.6, t ? t[t.length - 1].z - 0.1 : 0.6);
    const toe = this.equip.stance === 'goofy' ? -1 : 1;
    const [uI, lI] = this.armReach(side, this.grabPoint(0, z, edge * toe, 0.06), new THREE.Vector3(side, 0.5, edge < 0 ? -0.6 : 0.2));
    u.normalize().lerp(uI, fix[k]);
    l.normalize().lerp(lI, fix[k]);
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

  pose(pl, dt = 1 / 60) {
    this.gearFrames();
    this.lift.set(0, 0, 0);
    const p = this.p, fixed = p.sit > 0.01 || p.crash > 0.5;
    // Gear clearance, a safeguard that only acts when something would go through the gear: pose, measure
    // the garments against the deck / skis (clearance()) and, only if they sink in, raise the pelvis along
    // the gear's up by what's missing and pose again — the boots stay in their bindings, so the knees and
    // hips open a little, the gear and the rest of the pose stay put. A leg that can't reach its binding
    // lowers the hips instead (the boot never leaves it).
    let clear = 0;
    for (let it = 0; ; it++) {
      this.reachMiss = 0;
      this.legNeed = [null, null];
      this.poseOnce(pl);
      this.poseIters = it + 1;
      if (fixed || it >= 9) break;
      let again = false;
      const d = this.clearance();
      if (d >= 0.002) { this.lift.addScaledVector(this._clearDir, d + 0.002); clear += d + 0.002; (this._clearUp ||= new THREE.Vector3()).copy(this._clearDir); again = true; }
      let worst = null;
      for (const n of this.legNeed) if (n && n.miss >= 0.003 && (!worst || n.miss > worst.miss)) worst = n;
      if (worst) { this.lift.addScaledVector(worst.dir, -(worst.miss + 0.002)); again = true; }
      if (!again) break;
    }
    // Eased in and out over a few frames (never more than CLEAR_LAG behind what's needed, so nothing shows
    // through while it comes in), so the hips never visibly jump.
    const prev = fixed ? 0 : this._clearS || 0;
    const eased = prev + (clear - prev) * (1 - Math.exp(-CLEAR_EASE * dt));
    const applied = fixed ? 0 : Math.max(eased, clear - CLEAR_LAG);
    this._clearS = applied;
    if (!fixed && this._clearUp && Math.abs(applied - clear) > 1e-4) {
      this.lift.addScaledVector(this._clearUp, applied - clear);
      this.reachMiss = 0;
      this.legNeed = [null, null];
      this.poseOnce(pl);
    }
  }

  poseOnce(pl) {
    const B = this.bones;
    for (const [b, r] of this.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.G.clear();
    this.G.set(B.root, this.restLocal.get(B.root).m.clone());
    if (this.isBoard) this.poseBoard(pl); else this.poseSki(pl);
  }

  /** Shared: pelvis offset/rotation, spine bend/twist/roll, neck + head. */
  trunk(off, yaw, pitch, spineBend, spineTwist, spineRoll, headYaw, headPitch, headRoll = 0) {
    const B = this.bones, p = this.p, id = p.idle || 0;
    if (id > 0.001) {
      const t = p.t;
      spineBend += id * 0.025 * Math.sin(t * 1.7);                        // breathing
      headYaw += id * (0.35 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 0.91 + 1.3));   // looking around
      headPitch -= id * (0.12 + 0.06 * Math.sin(t * 0.53));               // eyes up off the snow (− = up)
      off = off.clone(); off.y += id * 0.008 * Math.sin(t * 1.7);
    }
    const rp = this.restGlobal.get(B.pelvis);
    // (+ the boot / binding stack, and the clearance lift that keeps the garments out of the gear)
    const pp = pos(rp).add(off).addScaledVector(this.stack || _v1.set(0, 0, 0), 1 - p.sit).add(this.lift);
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
    this.rotateGlobal(B.neck_01, new THREE.Quaternion().setFromAxisAngle(Y, headYaw * 0.45).multiply(_q.setFromAxisAngle(X, headPitch * 0.5)).multiply(_q2.setFromAxisAngle(Z, headRoll * 0.4)));
    this.inherit(B.Head);
    this.rotateGlobal(B.Head, new THREE.Quaternion().setFromAxisAngle(Y, headYaw * 0.55).multiply(_q.setFromAxisAngle(X, headPitch * 0.5)).multiply(_q2.setFromAxisAngle(Z, headRoll * 0.6)));
    // First person (helmet cam): shrink the head (and helmet) so the eye, which sits ≥ 0.15 m out from
    // the head bone, is always outside it. A full collapse (scale ≈ 0) dragged the neck / collar
    // vertices skinned partly to the head into long dark strands across the view when looking down.
    if (this.fp) B.Head.scale.setScalar(HEAD_SCALE * FP.headScale);
  }

  poseSki(pl) {
    const p = this.p;
    const ns = 1 - p.sit;
    const drop = p.crouch * 0.38 + p.tuck * 0.1;
    const hipPitch = THREE.MathUtils.degToRad(10 + p.crouch * 22 + p.tuck * 22) * ns;
    // Angulation: hips move to the inside of the turn, upper body stays more upright than the legs.
    // Only edge on the lean's side and beyond it angulates. A lean with less edge under it (a
    // cross-slope, a turn being let go) or an edge already rolled to the other side (the edge change)
    // would otherwise roll the spine further into the lean / the old turn (ANIM.angulationReverse of it is kept).
    const ang = p.edge - p.lean;
    const angul = ang * (ang * p.lean < 0 ? ANIM.angulationReverse : 1) * ANIM.angulation * (1 - p.air);
    // Crossover: once the input has gone to the other side, the upper body leads the hips into the new
    // turn (−p.lead is the steer, + = right) while the lean still points into the old one.
    const steerDir = -p.lead;
    const cross = Math.max(0, -Math.sign(p.lean) * steerDir) * Math.min(1, Math.abs(p.lean) / 0.25) * ANIM.crossover * (1 - p.air);
    // Counter-rotation: in a carve the skis turn under a quiet upper body, so the hips and shoulders
    // face the outside of the turn (+ yaw = left; + lean = a right turn); a hockey stop / skid keeps the
    // upper body facing down the path; the lead (anticipation) turns it into the next turn.
    const counter = (pl.state === State.GROUNDED ? pl.skidAngle : 0) * 0.75 + p.lead * 0.12 + p.lean * ANIM.skiCounter * (1 - p.air);
    // Pressing shifts the hips over the pressed end (tails: back, tips: forward).
    const off = new THREE.Vector3(-angul * 0.12, -drop * ns - p.crash * 0.5, -p.crouch * 0.06 * ns - p.stop * 0.05 + p.press * ANIM.skiPressShift * ns);
    const twist = p.twist * ns;
    let bend = THREE.MathUtils.degToRad(10 + p.crouch * 16 + p.tuck * 30) * (1 - p.air * 0.3) - p.flipLoad * ANIM.flipLoadArch;
    bend -= THREE.MathUtils.degToRad(12) * p.sit;
    const wob = p.stumble * Math.sin(p.t * 9) * 0.25;
    // Riding switch (twin tips): twist the torso and look back over the shoulder down the path.
    const back = (1 - p.look) * 0.5 * ns;
    const gT = p.gTravel || 0;   // rail slide: hips stay with the skis, shoulders and head turn down the rail
    const spineRoll = -angul * 1.3 + Math.sign(steerDir) * cross + wob;
    // Head: steadied against the body's roll (eyes nearer level, ANIM.headLevel) and looking along the
    // path, a little into the turn (ANIM.headLook), not down the skis.
    const headRoll = -((p.worldRoll ?? p.lean) + spineRoll) * ANIM.headLevel * (1 - p.air) * ns;
    // The trunk turns by `counter`; the head takes that back out and looks along the path instead (the
    // skid angle: down the slope in a hockey stop, nearly the skis' line in a carve).
    const pathLook = (pl.state === State.GROUNDED ? pl.skidAngle : 0) * ANIM.skiSkidLook;
    const headYaw = pathLook - counter - p.lean * ANIM.headLook * (1 - p.air) * ns + back * 1.15 + gT * 0.35;
    const look = this.airLook(pl, headYaw);   // in the air: the head leads the rotation, then finds the landing
    this.trunk(off, twist * 0.45 + counter * 0.3 + back * 0.25 + gT * 0.25, hipPitch * 0.55 + p.hip * 0.5, bend + p.hip * 0.6, twist * 0.55 + counter * 0.7 + back * 0.6 + gT * 0.55 + look.twist, spineRoll,
      headYaw + look.yaw, -(hipPitch * 0.55 + bend) * 0.95 * (1 - back * 0.6) + look.pitch, headRoll);
    for (const side of [1, -1]) {
      // Armature +X is the rider's left (visual −X): match the ski's lift so the boots stay clipped in.
      // Boots clipped into the bindings: the sole on the plate, the foot turning with the ski (edge roll,
      // pitch, the plough's wedge, crossed / tweaked skis), so no boot pokes through the ski.
      const fq = new THREE.Quaternion();
      const ankle = this.seatAnkle(side > 0 ? 0 : 1, side, _v1.set(0, SKI_BINDING_SEAT, 0), 0, fq);
      fq.slerp(_qI, p.crash);
      fq.slerp(_q.setFromAxisAngle(X, ANIM.liftSkiHang), p.sit);   // on the chairlift the boots (and skis) hang tips down
      (this.footQ || (this.footQ = [new THREE.Quaternion(), new THREE.Quaternion()]))[side > 0 ? 0 : 1].copy(fq);
      this.leg(side, ankle, new THREE.Vector3(side * 0.12, 0, 1), 0, fq);
      this.armSki(side, pl);
    }
  }

  poseBoard(pl) {
    const p = this.p, st = this.equip.spec.stance;
    const ns = 1 - p.sit;
    const nx = this.equip.stance === 'goofy' ? -1 : 1;   // armature X of the board nose
    const drop = BA.crouch + p.crouch * 0.14 + pl.speedRatio * BA.crouchSpeed * (1 - p.air) + p.grab * 0.08;
    const off = new THREE.Vector3(
      nx * p.press * BA.pressShift - nx * 0.02,
      (-drop - p.heel * BA.heelSit * 0.6) * ns - p.crash * 0.5,
      (p.toe * BA.toeDrive - p.heel * BA.heelSit) * ns,
    );
    const hipYaw = nx * BA.hipOpen * ns;
    // The whole body already rolls onto the edge (visual lean), so toe side keeps the torso tall
    // (knees and hips drive forward) and heel side sits down without folding. Crouching (speed, W)
    // mostly bends the knees: the hips fold only a little, so a straight run doesn't hunch over the toes.
    const hipPitch = (0.12 + p.crouch * BA.crouchHinge - p.toe * BA.toeTall + p.heel * 0.05 + p.grab * 0.22) * ns;
    const wob = p.stumble * Math.sin(p.t * 9) * 0.25;
    // Shoulders open toward the nose, rotation leads the turn; in the air the spin leads.
    const lead = p.lead * BA.turnLead;
    const sk = p.skate || 0;
    off.x += nx * 0.08 * sk;                                  // weight over the front foot while skating
    let spineTwist = (nx * (BA.shoulderOpen - BA.hipOpen) + lead + nx * 0.45 * sk) * ns;
    if (this.fp) spineTwist += nx * FP_BOARD.twist * ns;   // first person: shoulders open further so both gloves frame the view
    // A preloaded backflip arches the chest up and back (the shoulders throw first).
    const bend = (0.1 + p.crouch * BA.crouchHinge * 0.8 - p.toe * BA.toeTall * 0.7 + p.heel * 0.12 + p.grab * 0.26) * ns - p.flipLoad * ANIM.flipLoadArch - (p.tweak || 0) * 0.3;
    // Head: look down the direction of travel (nose, or over the back shoulder when switch).
    // Boardslide / lipslide: the head (and a little of the shoulders) look down the rail instead of over the nose.
    const gT = p.gTravel || 0, gS = Math.min(1, Math.abs(gT) / 1.2);
    const headYaw = (nx * p.look * BA.headTurn - nx * BA.shoulderOpen - lead - nx * 0.5 * sk) * ns * (1 - gS) + gS * (gT - nx * BA.shoulderOpen) * 0.85;
    // Sliding (a slide stop, a skidded turn): the board turns across the path, the head keeps looking
    // down it (+ skid = board rotated right of the path → look back left; + yaw = left).
    const skidLook = (pl.state === State.GROUNDED ? pl.skidAngle : 0) * BA.skidLook * ns * (1 - gS);
    // Head steadied against the body's roll: a board leans about its long axis, which runs through the
    // hips, so for the body that is a toe / heel tilt and the head levels it with a pitch (+ X = toward the
    // toes; toeSide = which side of travel the toes are on).
    const toeSide = nx * (p.look >= 0 ? 1 : -1);
    // (+ BA.headTilt: the head turned down the nose sat a few degrees toward the heels riding straight.)
    const level = (-(p.worldRoll ?? p.lean) * toeSide * ANIM.headLevel * (1 - p.air) + BA.headTilt) * ns;
    const look = this.airLook(pl, headYaw);   // in the air: the head leads the rotation, then finds the landing
    this.trunk(off, hipYaw + nx * 0.3 * sk, hipPitch + p.hip * 0.5, bend + p.hip * 0.4, spineTwist + gT * 0.2 + skidLook * 0.3 + look.twist, wob - p.lean * 0.15, headYaw + skidLook * 0.7 + look.yaw - (this.fp ? nx * FP_BOARD.twist * ns : 0), -(hipPitch + bend) * 0.6 + level + look.pitch);
    // Legs: feet in the bindings across the board, knees toward the toe edge and a little duck.
    const w = st.width / 2;
    const feet = [[nx, st.front], [-nx, st.back]];   // [armature x sign, binding angle]
    for (const [sx, ang] of feet) {
      const along = sx * w;
      const legSide = along > 0 ? 1 : -1;    // armature +X → left leg
      // Boots strapped into the bindings: the sole on the baseplate, the foot turning with the board (edge
      // roll, press / pop pitch, tweaks), so nothing pokes through the deck or the base.
      let footYaw = nx * THREE.MathUtils.degToRad(ang) * ns;
      const fq = new THREE.Quaternion();
      const bz = this.gear.userData.parts.bindings[sx === nx ? 0 : 1].position.z;
      const ankle = this.seatAnkle(0, legSide, _v1.set(0, BOARD_BINDING_SEAT, bz), footYaw, fq);
      ankle.lerp(new THREE.Vector3(legSide * 0.12, this.ankleH + 0.35, 0.42), p.sit);
      if (sx !== nx && sk > 0.01) {
        // Skating foot: plant beside the front binding on the toe side, push back past the tail,
        // then lift and swing forward again; the foot points down the board.
        const ph = p.skatePhase || 0;
        const push = ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4;
        const lift2 = ph < 0.6 ? 0 : Math.sin((ph - 0.6) / 0.4 * Math.PI) * 0.12;
        ankle.lerp(new THREE.Vector3(nx * (0.08 - push * 0.6), -this.boot[legSide].off.y + lift2, 0.3), sk);
        footYaw += (nx * Math.PI * 0.5 - footYaw) * sk;
        fq.slerp(_q.setFromAxisAngle(Y, footYaw), sk);   // (off the board: flat on the snow)
      }
      fq.slerp(_q.setFromAxisAngle(Y, footYaw), Math.max(p.sit, p.crash));
      const pole = new THREE.Vector3(legSide * 0.25, 0, 1);
      this.leg(legSide, ankle, pole, footYaw, fq);
    }
    for (const side of [1, -1]) this.armBoard(side, nx, pl);
  }

  /** Two-bone leg IK toward `ankle` (armature space), knee bending toward `pole`, foot yaw `footYaw`. */
  leg(side, ankle, pole, footYaw, footQ = null) {
    const B = this.bones, p = this.p, s = side > 0 ? '_l' : '_r';
    const thigh = B['thigh' + s], calf = B['calf' + s], foot = B['foot' + s];
    this.inherit(thigh);
    const hip = pos(this.g(thigh));
    if (!this.isBoard) ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.12, -0.5, 0.42)), p.sit);
    ankle.lerp(hip.clone().add(new THREE.Vector3(side * 0.25, -0.75, 0.25)), p.crash);
    const l1 = this.restLocal.get(calf).p.length(), l2 = this.restLocal.get(foot).p.length();
    const to = ankle.clone().sub(hip);
    // (out of reach: rider.pose brings the gear / the hips so the boot stays in its binding)
    if (this.legNeed && to.length() > l1 + l2 - 0.002 && p.sit < 0.01 && p.crash < 0.01) this.legNeed[side > 0 ? 0 : 1] = { miss: to.length() - (l1 + l2 - 0.002), dir: to.clone().normalize().negate() };
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
    const fq = (footQ ? new THREE.Quaternion().copy(footQ) : new THREE.Quaternion().setFromAxisAngle(Y, footYaw)).multiply(_q.setFromRotationMatrix(rf));
    this.setGlobal(foot, new THREE.Matrix4().compose(pos(this.g(foot)), fq, scl(rf)));
  }

  /**
   * The head in the air (offsets to the pose's head yaw / pitch, rad, + yaw = left, + pitch = down, and a
   * share for the shoulders): while rotating it LEADS — turned over the leading shoulder into a spin,
   * thrown back into a backflip, chin in for a frontflip — and for the last ~0.8 s it SPOTS the landing:
   * it turns to where the flight meets the snow (as far as a neck and shoulders turn), whatever the body is
   * doing, so a cork's head comes round to the landing before the body does. `baseYaw` = the pose's own
   * head yaw (a board rider already looks down the nose). Smoothed; zero on the snow.
   */
  airLook(pl, baseYaw) {
    const p = this.p, air = pl.state === State.AIR && pl.simulated;
    let yaw = 0, pitch = 0, w = 0;
    if (air) {
      const tl = pl.dyn?.timeToLand ? pl.dyn.timeToLand() : 1;
      // Lead: into the spin, back / forward with the flip (less while grabbing — the eyes are on the grab).
      const sr = pl.spinRate || 0, fr = pl.flip ? (pl.flipRate || 0) : 0;
      const lead = THREE.MathUtils.clamp(sr * ANIM.airHeadLead, -ANIM.airHeadLeadMax, ANIM.airHeadLeadMax);
      const flipLead = -Math.sign(fr) * THREE.MathUtils.smoothstep(Math.abs(fr), 1, 4) * ANIM.airHeadFlip;
      // Spot: the landing point (the flight's touchdown), in the body's frame.
      w = THREE.MathUtils.smoothstep(ANIM.airSpot[0] - tl, 0, ANIM.airSpot[0] - ANIM.airSpot[1]);
      let sy = 0, sp = 0;
      if (w > 0 && pl.renderCom && pl.terrain) {
        const head = pl.renderCom(_v2).addScaledVector(_v3.set(0, 1, 0).applyQuaternion(pl.renderOrient), 0.75);
        const lx = pl.renderPos.x + pl.velocity.x * tl, lz = pl.renderPos.z + pl.velocity.z * tl;
        const d = _v3.set(lx, pl.terrain.getHeight(lx, lz), lz).sub(head);
        d.applyQuaternion(_q.copy(pl.renderOrient).multiply(_q2.setFromAxisAngle(Y, this.p.stanceYaw)).invert());
        const a = Math.atan2(-d.x, -d.z);
        sy = THREE.MathUtils.clamp(Math.atan2(Math.sin(a - baseYaw), Math.cos(a - baseYaw)), -ANIM.airSpotYaw, ANIM.airSpotYaw);
        sp = THREE.MathUtils.clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -0.6, ANIM.airSpotPitch);
      }
      const g = 1 - 0.6 * (pl.grab || 0);
      yaw = (lead * g) * (1 - w) + sy * w;
      pitch = flipLead * g * (1 - w) + sp * w;
    }
    const k = 1 - Math.exp(-ANIM.airHeadResponse * (this._dtLast || 0.016));
    p.alYaw = (p.alYaw || 0) + (yaw - (p.alYaw || 0)) * k;
    p.alPitch = (p.alPitch || 0) + (pitch - (p.alPitch || 0)) * k;
    p.alW = (p.alW || 0) + (w - (p.alW || 0)) * k;
    return { yaw: p.alYaw, pitch: p.alPitch, twist: p.alYaw * ANIM.airSpotShoulders, w: p.alW };
  }

  /** Aim upper / lower arm along two directions (armature space). */
  armAim(side, u, l) {
    const B = this.bones, s = side > 0 ? '_l' : '_r';
    const upper = B['upperarm' + s], lower = B['lowerarm' + s], hand = B['hand' + s];
    this.inherit(B['clavicle' + s]);
    if (this.fp) fpProtract(this, side);   // first person: shoulders forward so the gloves reach into view
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
    // Tail grab = left hand back to the ski tail; Truck driver = both hands to the tips.
    const grabHand = name === 'Mute' ? -1 : 1;
    const upG = name === 'Mute' ? V(0.2, -0.9, 0.35) : name === 'Japan' ? V(side * 0.15, -0.95, 0.15) : name === 'Tail grab' ? V(side * 0.3, -0.8, -0.35)
      : name === 'Truck driver' ? V(side * 0.22, -0.72, 0.62) : V(side * 0.3, -0.9, 0.3);
    const loG = name === 'Mute' ? V(0.35, -0.85, 0.3) : name === 'Japan' ? V(-side * 0.1, -0.9, 0.35) : name === 'Tail grab' ? V(side * 0.12, -0.75, -0.6)
      : name === 'Truck driver' ? V(side * 0.08, -0.6, 0.78) : V(side * 0.1, -0.9, 0.3);
    const g = side === grabHand || name === 'Truck driver' ? p.grab : 0;
    // Double-pole push: reach forward and up, then plant and drive the hands back past the hips.
    const ph = p.pushPhase || 0, reachF = ph < 0.4 ? ph / 0.4 : 1 - (ph - 0.4) / 0.6;
    const upP = V(side * 0.3, -0.75 + reachF * 0.45, -0.25 + reachF * 1.0), loP = V(side * 0.1, -0.5 + reachF * 0.3, 0.2 + reachF * 0.7);
    const upF = V(side * 0.3, -0.55, 0.65), loF = V(-side * 0.05, -0.45, 0.9);   // flip tuck: hands to the shins
    let u = upS.lerp(upP, p.push).lerp(upT, p.tuck).lerp(upA, p.air * (1 - g)).lerp(upF, p.flipTuck).lerp(upG, g);
    let l = loS.lerp(loP, p.push).lerp(loT, p.tuck).lerp(loA, p.air * (1 - g)).lerp(loF, p.flipTuck).lerp(loG, g);
    this.armSpin(side, u, l, 1 - g);
    this.armGrind(side, u, l, 1 - g);
    [u, l] = this.armOverlays(side, u, l);
    if (this.fp) [u, l] = fpSkiArm(this, side, pl, u, l);   // first person: gloves framed in view (fpview.js)
    this.armAim(side, u, l);
    // First person: turn the gloves into a pole grip (palms in, knuckles forward).
    if (this.fp) fpHand(this, side, true);
  }

  /**
   * In the air the arms show what the rotation is doing: wrapped in across the chest to spin faster
   * (spinTuck > 0), flung wide to slow a spin (< 0) or stretched out in a flip's layout (opening up to
   * spot the landing). `sx` = the arm's lateral sign, `w` = weight (0 while grabbing). Mutates u, l.
   */
  armSpin(sx, u, l, w) {
    const p = this.p;
    const cb = p.combo || 0;
    const inn = Math.max(Math.max(0, p.spinTuck || 0), cb * ANIM.comboArmsIn) * w, out = Math.max(Math.max(0, -(p.spinTuck || 0)), (p.layout || 0) * 0.8) * (1 - cb) * w;
    if (inn > 0.01) { u.lerp(_v2.set(sx * 0.35, -0.75, 0.4), inn); l.lerp(_v3.set(-sx * 0.3, -0.1, 0.8), inn); }
    // (out wide at about shoulder height, a little forward: slowing down, opening up to spot)
    if (out > 0.01) { u.lerp(_v2.set(sx, 0.05, 0.12), out); l.lerp(_v3.set(sx, 0.15, 0.3), out); }
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
    u.lerp(V(fx * 0.3, -0.55, 0.65), p.flipTuck);    // flip tuck: hands in toward the shins
    l.lerp(V(-fx * 0.05, -0.45, 0.9), p.flipTuck);
    this.armSpin(fx, u, l, 1 - p.grab);
    // Hand drag on deep carves: toe side the front hand reaches down to the snow in front of the toes,
    // heel side the rear hand trails behind the heels.
    const drag = p.drag || 0;
    if (drag > 0.01) {
      const toeCarve = p.toe >= p.heel;
      if (front === toeCarve) {
        const B = this.bones, s = side > 0 ? '_l' : '_r';
        this.inherit(B['clavicle' + s]); this.inherit(B['upperarm' + s]);
        const sh = pos(this.g(B['upperarm' + s]));
        const target = toeCarve ? V(nx * 0.25, this.ankleH + 0.02, 0.65) : V(-nx * 0.35, this.ankleH - 0.15, -0.72);
        const d = target.sub(sh).normalize();
        u.lerp(d.clone().add(V(0, 0.25, 0)).normalize(), drag);
        l.lerp(d, drag);
      }
    }
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
      const d = target.clone().sub(sh).normalize();
      u.lerp(d.clone().add(V(0, 0, 0.15)), p.grab);
      l.lerp(d, p.grab);
      // Safeguard: the straight reach can carry the mitt into the deck (the target sits on the edge, the
      // arm is longer than the way there). Only then the elbow bends so the hand closes over the edge.
      this.handClear(side, sh, u, l, target, name === 'Melon' ? -1 : 1);
    } else this._handFix && (this._handFix[side > 0 ? 0 : 1] = 0);
    this.armGrind(side, u, l, 1 - p.grab);
    [u, l] = this.armOverlays(side, u, l);
    if (this.fp) [u, l] = fpBoardArm(this, side, front, pl, u, l);   // first person: gloves at the frame edges (fpview.js)
    this.armAim(side, u, l);
    if (this.fp) fpHand(this, side, false);
  }

  /**
   * On a rail the arms go out wide for balance, the one on the high side reaching up and out as the rider
   * tips (p.gRoll / p.gPitch: the fall in the gear frame). `side` = the arm's armature sign (+ = left).
   */
  armGrind(side, u, l, w) {
    const p = this.p, gw = (p.grind || 0) * w;
    if (gw < 0.01) return;
    const t = p.t, wave = Math.sin(t * 4.3 + side) * 0.08;
    // + = this arm is on the high side (skis: arms across the fall; a board's arms point along it, to nose / tail).
    const nx = this.equip?.stance === 'goofy' ? -1 : 1;
    const tip = this.isBoard ? side * nx * (p.gPitch || 0) : side * (p.gRoll || 0);
    u.lerp(_v2.set(side * 0.95, -0.15 + tip * 0.55 + wave, 0.2 + (p.gPitch || 0) * 0.3 * side), gw);
    l.lerp(_v3.set(side * 0.85, 0.15 + tip * 0.45 - wave, 0.3), gw);
  }

  /** Poles from the gloves down to the snow: trailing while skiing, planted on edge changes, tucked. */
  placePoles(pl) {
    const p = this.p;
    if (this.isBoard) { for (const pole of this.poles) pole.visible = false; return; }
    this.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    const down = new THREE.Vector3(0, -1, 0);
    [['hand_l', -1], ['hand_r', 1]].forEach(([name, sx], i) => {
      const pole = this.poles[i], fp = !!this.fp;
      const geo = fp ? fpPoleGeometry() : this.poleGeo;
      if (pole.geometry !== geo) pole.geometry = geo;   // first person: the detailed pole (fpview.js)
      if (fp) this.bones[name].localToWorld(hand.set(0, 0.075, 0.012));   // first person: the grip sits in the fist, not at the wrist
      else this.bones[name].getWorldPosition(hand);
      this.visual.worldToLocal(hand);
      const plant = p.plant[i];
      let L;
      if (fp) { fpPoleDir(this, i, sx, dir, hand); L = FP_POLE.length; }   // first person (fpview.js)
      else {
        dir.set(sx * 0.16, -1, 0.42 - plant * 0.9).normalize();
        if (p.push > 0.01) { const ph = p.pushPhase || 0; dir.lerp(new THREE.Vector3(sx * 0.1, -1, ph < 0.4 ? 0.1 : 0.55 + (ph - 0.4)), p.push).normalize(); }
        dir.lerp(new THREE.Vector3(sx * 0.08, -0.3, 1).normalize(), p.tuck).normalize();
        dir.lerp(new THREE.Vector3(sx * 0.6, -0.4, 0.3).normalize(), p.air * 0.5).normalize();
        // The tip rests on the snow, not through it: with the hand low (deep crouch, long arms) the shaft
        // swings further back. Snow in this (lean-rolled) frame sits at y = x · tan(lean), as for the skis.
        L = this.poleLen ?? (this.poleLen = (this.poleGeo.computeBoundingBox(), -this.poleGeo.boundingBox.min.y));
        if (p.air < 0.5) {
          const snowY = (hand.x + dir.x * L) * Math.tan(p.lean) - 0.04;
          const maxDown = (hand.y - snowY) / L;
          if (-dir.y > maxDown && maxDown > 0.15) {
            const h = Math.hypot(dir.x, dir.z), c = Math.sqrt(1 - maxDown * maxDown);
            dir.set(dir.x / h * c, -maxDown, dir.z / h * c);
          }
        }
      }
      pole.position.copy(hand);
      pole.quaternion.copy(q.setFromUnitVectors(down, dir));
      pole.visible = p.sit < 0.5;
      // Pole plant touch-down (a quarter into the plant): a puff of snow at the basket (fx.js).
      const prev = this._plantPrev?.[i] ?? 0;
      if (prev > 0.75 && plant <= 0.75 && p.air < 0.1 && pole.visible) {
        const tip = hand.clone().addScaledVector(dir, L);
        this.visual.localToWorld(tip);
        emit('polePlant', { x: tip.x, y: tip.y, z: tip.z, side: sx });
      }
      (this._plantPrev ||= [0, 0])[i] = plant;
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
