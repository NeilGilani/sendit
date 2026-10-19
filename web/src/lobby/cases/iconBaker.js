// Item icon baker: renders one reward skin (or the anonymous gold ★) with the game's own models and
// materials into a small transparent picture, for the Cases tab, the reel, the reveal and the Locker
// (itemIcons.js caches and serves the pictures; docs/rewards.md "Item icons").
//
//   const baker = await IconBaker.create(renderer);    // the lobby's WebGLRenderer (shared context)
//   const blob = await baker.bake(desc, px);           // desc from describeIcon(): an image/webp Blob
//
// Clothing is a "ghost mannequin" product shot: a hidden copy of the rider rig (skier.gltf, same rest
// pose and proportions as rider.js) dressed with character/ (dressRider + resolveOutfit + applyLook),
// so every print, finish and colour comes from the real shaders; only the item's own pieces are drawn
// (jacket + sleeves + collar + hood, the pant legs, the mitts…), double-sided so the openings show the
// lining. Helmets, goggles and face pieces sit on a matte mannequin bust. Skis and boards are
// equipment/models.js planks with their real topsheet. Lighting is a fixed studio set (warm key from the
// upper left, cool sky fill, a Fresnel rim), set through the shared shader globals only for the bake
// and restored right after, so the icons never depend on the map. The HDR frame (2x supersampled) goes
// through the game's neutral tone curve, gets a soft bloom, a contact shadow and a faint glow in the
// grade colour, and is read back asynchronously.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { globals, toonMaterial } from '../../world.js';
import { dressRider, HEAD_SCALE } from '../../character/index.js';
import { proportionRig } from '../../character/body.js';
import { PIECE } from '../../character/garments.js';
import { createEquipmentModel, disposeEquipmentModel } from '../../equipment/models.js';
import { gearModel } from '../../profile/catalog.js';

const DEG = Math.PI / 180;

// Studio light (linear HDR, the toon model's units; the lobby's default sun is ~1.9 and sky ~0.6).
const STUDIO = {
  sunDir: new THREE.Vector3(-0.55, 0.72, 0.62).normalize(),   // key: upper left, in front (camera looks −Z)
  sun: new THREE.Color(2.15, 2.07, 1.96),
  sky: new THREE.Color(0.62, 0.68, 0.8),
  ground: new THREE.Color(0.36, 0.34, 0.33),
  rim: new THREE.Color(0.85, 0.93, 1.0),
  time: 1.7,                                                     // animated prints (flames, galaxy) frozen here
  exposure: 0.68,
};

// Pieces (garments.js PIECE) drawn for each outfit slot.
const PIECES = {
  jacket: [PIECE.jacket, PIECE.sleeve, PIECE.collar, PIECE.hood, PIECE.hoodUp],
  pants: [PIECE.pants],
  gloves: [PIECE.mitt, PIECE.gauntlet],
  face: [PIECE.gaiter],
};
// Camera per slot: azimuth (0 = straight at the front, + = the rider's left side), elevation, margin.
const VIEW = {
  jacket: { az: 26, el: 8, fill: 0.9 },
  pants: { az: 24, el: 6, fill: 0.9 },
  gloves: { az: 16, el: 6, fill: 0.86 },
  face: { az: 28, el: 4, fill: 0.82 },
  helmet: { az: 34, el: 16, fill: 0.84 },
  goggles: { az: 20, el: 4, fill: 0.86 },
  gear: { az: 0, el: 16, fill: 0.94, fov: 30 },
  parts: { az: 0, el: 14, fill: 0.86 },
  star: { az: 0, el: 0, fill: 0.7 },
};
// Neutral parts around a head piece (the helmet under a goggle or a face piece).
const NEUTRAL_HELMET = { base: '#34373c', liner: '#1c1d20', accent: '#4a4e55', finish: 'matte', decal: 'none' };

/** What to draw for a skin key ('item:variant') or the anonymous gold card (null). */
export function describeIcon(skin, rarity) {
  if (!skin) return { kind: 'star', rarity: 'gold' };
  const { item, variant } = skin;
  if (['skis', 'board', 'poles', 'bindings'].includes(item.slot)) return { kind: 'gear', item, variant, slot: item.slot, rarity };
  return { kind: 'outfit', item, variant, slot: item.slot, rarity };
}

const COMPOSITE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = vec2(uv.x, 1.0 - uv.y); gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// HDR (premultiplied, 2x) → tone-mapped straight-alpha sRGB with bloom, contact shadow and grade glow.
// The image is flipped (vUv.y) so readPixels returns rows top-down.
const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tHdr; uniform vec2 uTexel; uniform float uExposure;
uniform vec3 uGlowCol; uniform float uGlowA; uniform vec4 uShadow; uniform float uShadowA;
varying vec2 vUv;
vec4 hdr(vec2 uv) {
  return 0.25 * (texture2D(tHdr, uv + uTexel * vec2(-0.5, -0.5)) + texture2D(tHdr, uv + uTexel * vec2(0.5, -0.5))
               + texture2D(tHdr, uv + uTexel * vec2(-0.5, 0.5)) + texture2D(tHdr, uv + uTexel * vec2(0.5, 0.5)));
}
vec3 neutral(vec3 color) {     // Khronos PBR Neutral, as gfx/post.js
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 s = hdr(vUv);
  float a = clamp(s.a, 0.0, 1.0);
  vec3 c = a > 1e-4 ? s.rgb / a : vec3(0.0);
  c = clamp(neutral(c * uExposure), 0.0, 1.0);
  // Gentle grade: a touch of contrast and saturation (gfx/post.js does the same after its tone curve).
  vec3 g = sqrt(c);
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, 1.06);
  g = clamp((g - 0.5) * 1.08 + 0.5, 0.0, 1.0);
  c = g * g;
  // Bloom: the hot parts (neon, glints, chrome sparkle) bleed a soft halo.
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float an = float(i) * 0.5236;
    for (int k = 1; k <= 3; k++) {
      vec2 o = vec2(cos(an + float(k)), sin(an + float(k))) * float(k) * 7.0 * uTexel;
      vec4 q = texture2D(tHdr, vUv + o);
      bloom += max(q.rgb * uExposure - 1.5, 0.0) / float(k);
    }
  }
  bloom *= 0.03;
  vec4 obj = vec4(c * a, a);
  // Backdrop: faint grade-coloured glow behind the subject, then the soft contact shadow.
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);            // y down, like the framing maths
  float d = length((p - vec2(0.5, 0.48)) * vec2(1.0, 1.1));
  float ga = uGlowA * pow(1.0 - smoothstep(0.0, 0.62, d), 1.6);
  vec4 bg = vec4(uGlowCol * ga, ga);
  float sd = length((p - uShadow.xy) / uShadow.zw);
  float sa = uShadowA * pow(1.0 - smoothstep(0.0, 1.0, sd), 1.8);
  bg = vec4(0.0, 0.0, 0.0, sa) + bg * (1.0 - sa);
  vec4 o = obj + bg * (1.0 - a);
  o.rgb += bloom;
  o.a = clamp(max(o.a, dot(bloom, vec3(0.3, 0.5, 0.2))), 0.0, 1.0);
  vec3 straight = o.a > 1e-4 ? clamp(o.rgb / o.a, 0.0, 1.0) : vec3(0.0);
  gl_FragColor = vec4(toSRGB(straight), o.a);
}`;

export class IconBaker {
  /** Build the studio and the mannequin (loads skier.gltf, usually from the HTTP cache). */
  static async create(renderer) {
    const b = new IconBaker(renderer);
    await b.init();
    return b;
  }

  constructor(renderer) {
    this.renderer = renderer;
    this.subsets = new WeakMap();     // full outfit geometry → Map(slot → subset geometry)
    this.fullOf = new WeakMap();      // subset → full geometry
  }

  async init() {
    const scene = this.scene = new THREE.Scene();
    // Same light set-up as the world (one hemisphere, one shadowed sun, exp fog) so the rider's
    // programs are shared with the lobby's; the fog has zero density.
    scene.fog = new THREE.FogExp2(0xffffff, 0);
    this.hemi = new THREE.HemisphereLight(STUDIO.sky, STUDIO.ground, 1);
    this.sun = new THREE.DirectionalLight(STUDIO.sun, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    this.sun.shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.05, 30);

    // The mannequin: the rider rig in its rest pose, dressed by character/.
    const gltf = await new GLTFLoader().loadAsync('/models/skier/skier.gltf');
    const rig = this.rig = gltf.scene;
    const bones = {}, restLocal = new Map();
    rig.traverse((o) => {
      if (o.isBone) { bones[o.name] = o; restLocal.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: new THREE.Matrix4() }); }
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; }
    });
    restLocal.get(bones.Head).s.setScalar(HEAD_SCALE);
    proportionRig(bones, restLocal);
    this.bones = bones; this.restLocal = restLocal;
    const look = this.look = dressRider(rig, { bones });
    // Own material instances: double-sided cloth so the openings show the lining.
    look.fabric.side = THREE.DoubleSide;
    this.others = [];
    rig.traverse((o) => { if (o.isMesh && !Object.values(look.meshes).includes(o)) this.others.push(o); });
    this.mannequin = toonMaterial({ name: 'iconMannequin', color: 0xd8d3cb, rim: 0.3 });
    look.meshes.body.material = this.mannequin;
    this.root = new THREE.Group();
    this.root.add(rig);
    scene.add(this.root);
    this.rig.visible = false;

    // Gear and the gold star hang off their own pivot.
    this.pivot = new THREE.Group();
    scene.add(this.pivot);

    // Render targets: HDR at 2x (supersampled), the composite at 1x.
    this.hdrRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.ldrRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    this.composite = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tHdr: { value: this.hdrRT.texture }, uTexel: { value: new THREE.Vector2() }, uExposure: { value: STUDIO.exposure },
        uGlowCol: { value: new THREE.Color() }, uGlowA: { value: 0 }, uShadow: { value: new THREE.Vector4(0.5, 0.1, 0.3, 0.05) }, uShadowA: { value: 0.4 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Compile the studio's programs in the background (KHR_parallel_shader_compile) before the first bake. */
  async warm() {
    const r = this.renderer;
    this.rig.visible = true;
    this.look.apply({});
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.hdrRT);
    try { if (r.compileAsync) await r.compileAsync(this.scene, this.camera); }
    finally { r.setRenderTarget(prev); this.rig.visible = false; }
  }

  // ---------------------------------------------------------------- pose
  /** Rest pose, then arms placed for the slot: an A-pose, or both hands together in front (gloves). */
  pose(slot) {
    for (const [b, r] of this.restLocal) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.root.updateMatrixWorld(true);
    const B = this.bones;
    for (const [s, x] of [['_l', 1], ['_r', -1]]) {
      if (slot === 'gloves') {
        // Hands up in front, side by side: the mitts stand upright like a product shot.
        this.aim(B['upperarm' + s], B['lowerarm' + s], new THREE.Vector3(-x * 0.22, -0.2, 0.95));
        this.aim(B['lowerarm' + s], B['hand' + s], new THREE.Vector3(-x * 0.06, 1, 0.12));
      } else {
        this.aim(B['upperarm' + s], B['lowerarm' + s], new THREE.Vector3(x * 0.5, -0.86, 0.1));
        this.aim(B['lowerarm' + s], B['hand' + s], new THREE.Vector3(x * 0.32, -0.92, 0.22));
      }
    }
  }

  /** Turn `bone` so the direction to `child` points along world `dir`. */
  aim(bone, child, dir) {
    if (!bone || !child) return;
    const a = bone.getWorldPosition(new THREE.Vector3());
    const cur = child.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
    const qd = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
    const qw = bone.getWorldQuaternion(new THREE.Quaternion());
    const qp = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(qp.invert().multiply(qd.multiply(qw)));
    bone.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- subjects
  /** Only the given pieces of an outfit geometry (shares its vertex buffers). */
  subset(full, slot) {
    let m = this.subsets.get(full);
    if (!m) this.subsets.set(full, (m = new Map()));
    if (m.has(slot)) return m.get(slot);
    const want = new Set(slot === 'onePiece' ? [...PIECES.jacket, PIECE.pants] : PIECES[slot]);
    const aG = full.attributes.aG, idx = full.index.array;
    const out = [];
    for (let i = 0; i < idx.length; i += 3) {
      if (want.has(Math.round(aG.getX(idx[i])))) out.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const g = new THREE.BufferGeometry();
    for (const [k, v] of Object.entries(full.attributes)) g.setAttribute(k, v);
    g.setIndex(out);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2);
    // Vertices used (for framing): every 7th index.
    const used = new Set();
    for (let i = 0; i < out.length; i += 7) used.add(out[i]);
    g.userData.sample = [...used];
    this.fullOf.set(g, full);
    m.set(slot, g);
    return g;
  }

  setupOutfit(desc) {
    const { item, variant, slot } = desc;
    const slots = {};
    if (slot === 'goggles' || slot === 'face') slots.helmet = { colors: NEUTRAL_HELMET };
    slots[slot] = { garment: item.model?.kind === 'outfit' ? item.model.ref : undefined, colorway: variant.id, colors: variant.colors };
    const o = this.look.apply(slots);
    const M = this.look.meshes;
    this.pose(slot);
    const head = slot === 'helmet' || slot === 'goggles' || slot === 'face';
    const cloth = !!PIECES[slot];
    M.body.visible = head;
    M.helmet.visible = M.lens.visible = head;
    for (const m of this.others) m.visible = false;
    M.garments.visible = cloth;
    if (cloth) {
      const full = this.fullOf.get(M.garments.geometry) || M.garments.geometry;
      M.garments.geometry = this.subset(full, slot === 'jacket' && o.colors.jacket.onePiece ? 'onePiece' : slot);
    }
    this.rig.visible = true;
    this.root.updateMatrixWorld(true);
    // Points to frame.
    const pts = [];
    if (cloth) {
      const g = M.garments.geometry, v = new THREE.Vector3();
      for (const i of g.userData.sample) pts.push(M.garments.getVertexPosition(i, v).applyMatrix4(M.garments.matrixWorld).clone());
    }
    if (head) {
      const box = new THREE.Box3().setFromObject(slot === 'goggles' ? M.lens : M.helmet, true);
      if (slot !== 'goggles') box.union(new THREE.Box3().setFromObject(M.lens, true));
      if (slot === 'goggles') box.expandByVector(box.getSize(new THREE.Vector3()).multiply(new THREE.Vector3(0.18, 0.5, 0.2)));
      if (slot === 'helmet') box.min.y -= 0.03;
      corners(box, pts);
    }
    return { pts, view: VIEW[slot] || VIEW.jacket };
  }

  setupGear(desc) {
    const slot = desc.slot;
    const type = slot === 'board' || slot === 'bindings' ? 'snowboard' : 'ski';
    const ref = slot === 'skis' || slot === 'board' ? gearModel(desc.item) ?? undefined : undefined;
    const model = createEquipmentModel(type, ref, { outline: true, pair: type === 'ski', neon: 1, poles: slot === 'poles' });
    const P = model.userData.parts;
    const inner = new THREE.Group();
    inner.add(model);
    if (slot === 'poles') {
      for (const k of P.skis) k.visible = false;
      inner.rotation.set(0, 20 * DEG, 0);
    } else if (slot === 'bindings') {
      P.board.visible = false;
      model.rotation.x = 0.5;
      inner.rotation.set(0, -35 * DEG, 0);
    } else {
      if (type === 'ski') {
        // Spread the pair a little and stagger them so both topsheets read.
        const [l, r] = P.skis;
        l.position.x = -0.11; r.position.x = 0.11; r.position.z = 0.18;
      }
      model.rotation.x = Math.PI / 2;                // tips up, topsheet to the camera
      // Tails tilted toward the (raised) camera, a quarter turn on the long axis, then laid diagonal.
      inner.rotation.set(-20 * DEG, (type === 'ski' ? -16 : -24) * DEG, (type === 'ski' ? -40 : -42) * DEG, 'ZYX');
    }
    this.pivot.add(inner);
    this.subject = { obj: inner, dispose: () => disposeEquipmentModel(model) };
    this.pivot.updateMatrixWorld(true);
    const pts = [];
    const box = new THREE.Box3();
    inner.traverse((o) => { if (o.isMesh && o.visible && o.parent.visible && !o.material?.name?.startsWith('outline')) box.union(new THREE.Box3().setFromObject(o, true)); });
    corners(box, pts);
    return { pts, view: VIEW[slot === 'poles' || slot === 'bindings' ? 'parts' : 'gear'] };
  }

  setupStar() {
    if (!this.starObj) {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.42 : 1;
        if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.09, bevelSegments: 4 });
      geo.center();
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffc642, metalness: 1, roughness: 0.24, envMap: this.env, envMapIntensity: 1.6 });
      this.starObj = new THREE.Mesh(geo, mat);
      this.starObj.castShadow = true;
      this.starObj.rotation.set(-0.12, 0.42, 0.06);
    }
    this.pivot.add(this.starObj);
    this.subject = { obj: this.starObj, dispose: () => {} };
    this.pivot.updateMatrixWorld(true);
    const pts = [];
    corners(new THREE.Box3().setFromObject(this.starObj, true), pts);
    return { pts, view: VIEW.star };
  }

  // ---------------------------------------------------------------- render
  /** Bake one icon: returns an image Blob (webp, png fallback) `px` square. */
  async bake(desc, px, glowColor) {
    const r = this.renderer;
    let setup;
    try {
      setup = desc.kind === 'outfit' ? this.setupOutfit(desc) : desc.kind === 'gear' ? this.setupGear(desc) : this.setupStar();
      const shadow = this.frame(setup.pts, setup.view, desc.kind);
      this.hdrRT.setSize(px * 2, px * 2);
      this.ldrRT.setSize(px, px);
      const U = this.composite.uniforms;
      U.uTexel.value.set(1 / (px * 2), 1 / (px * 2));
      U.uGlowCol.value.set(glowColor || '#b0c3d9');
      U.uGlowA.value = desc.rarity === 'gold' ? 0.34 : desc.rarity === 'legendary' ? 0.28 : 0.2;
      U.uShadow.value.copy(shadow);
      U.uShadowA.value = desc.kind === 'star' ? 0.25 : 0.42;

      // Studio globals in, render, globals back.
      const keep = {};
      const set = (k, v) => { keep[k] = globals[k].value; globals[k].value = v; };
      const lum = 0.2126 * STUDIO.sun.r + 0.7152 * STUDIO.sun.g + 0.0722 * STUDIO.sun.b;
      set('uSunDir', STUDIO.sunDir); set('uSunLum', lum); set('uSunCol', STUDIO.sun); set('uSkyAmb', STUDIO.sky);
      set('uGroundAmb', STUDIO.ground); set('uRimColor', STUDIO.rim); set('terrainSize', 1e-6); set('midSize', 0);
      set('uTime', STUDIO.time); set('uResolution', new THREE.Vector2(px * 2 / 3, px * 2 / 3));
      const prevRT = r.getRenderTarget();
      const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha(), prevAuto = r.autoClear;
      try {
        r.autoClear = true;
        r.setClearColor(0x000000, 0);
        r.setRenderTarget(this.hdrRT);
        r.render(this.scene, this.camera);
        r.setRenderTarget(this.ldrRT);
        r.render(this.quadScene, this.quadCam);
      } finally {
        for (const k of Object.keys(keep)) globals[k].value = keep[k];
        r.setRenderTarget(prevRT);
        r.setClearColor(prevClear, prevAlpha);
        r.autoClear = prevAuto;
      }
    } finally {
      this.rig.visible = false;
      if (this.subject) { this.subject.obj.removeFromParent(); this.subject.dispose(); this.subject = null; }
    }
    const buf = new Uint8Array(px * px * 4);
    if (r.readRenderTargetPixelsAsync) await r.readRenderTargetPixelsAsync(this.ldrRT, 0, 0, px, px, buf);
    else r.readRenderTargetPixels(this.ldrRT, 0, 0, px, px, buf);
    return toBlob(buf, px);
  }

  /** Aim the camera at the points from the slot's angle and fit them; returns the contact shadow (uv). */
  frame(pts, view, kind) {
    const cam = this.camera;
    const az = view.az * DEG, el = view.el * DEG;
    const back = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const c = new THREE.Vector3();
    const box = new THREE.Box3().setFromPoints(pts);
    box.getCenter(c);
    const f = back.clone().negate();
    const rgt = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(rgt, f);
    cam.fov = view.fov || 22;
    const t = Math.tan((cam.fov * DEG) / 2) * view.fill;
    let D = box.getSize(new THREE.Vector3()).length() / (2 * t);
    for (let it = 0; it < 4; it++) {
      let need = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        const d = p.clone().sub(c);
        const x = d.dot(rgt), y = d.dot(up), z = d.dot(f);
        need = Math.max(need, Math.abs(x) / t - z, Math.abs(y) / t - z);
        const zz = D + z;
        x0 = Math.min(x0, x / zz); x1 = Math.max(x1, x / zz); y0 = Math.min(y0, y / zz); y1 = Math.max(y1, y / zz);
      }
      // Recentre on the projected extents, then refit the distance.
      c.addScaledVector(rgt, ((x0 + x1) / 2) * D).addScaledVector(up, ((y0 + y1) / 2) * D);
      D = need;
    }
    cam.position.copy(c).addScaledVector(back, D);
    cam.up.set(0, 1, 0);
    cam.lookAt(c);
    cam.near = Math.max(0.02, D * 0.2); cam.far = D * 4;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // Key light and its shadow box follow the subject.
    this.sun.position.copy(c).addScaledVector(STUDIO.sunDir, 4);
    this.sun.target.position.copy(c);
    this.sun.target.updateMatrixWorld();
    const s = box.getSize(new THREE.Vector3()).length() * 0.6;
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 0.5; sc.far = 8;
    sc.updateProjectionMatrix();
    // Contact shadow under the lowest projected point (uv, y down).
    let bottom = 0, sx = 0, n = 0, xa = Infinity, xb = -Infinity;
    const v = new THREE.Vector3();
    for (const p of pts) {
      v.copy(p).project(cam);
      const ux = v.x * 0.5 + 0.5, uy = 0.5 - v.y * 0.5;
      xa = Math.min(xa, ux); xb = Math.max(xb, ux);
      bottom = Math.max(bottom, uy);
      sx += ux; n++;
    }
    const w = Math.max(0.18, (xb - xa) * (kind === 'gear' ? 0.42 : 0.5));
    return new THREE.Vector4(n ? sx / n : 0.5, Math.min(0.95, bottom + 0.012), w, w * 0.16);
  }
}

function corners(box, out) {
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
}

async function toBlob(buf, px) {
  const data = new ImageData(new Uint8ClampedArray(buf.buffer), px, px);
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(px, px);
    oc.getContext('2d').putImageData(data, 0, 0);
    try { return await oc.convertToBlob({ type: 'image/webp', quality: 0.92 }); } catch { return oc.convertToBlob({ type: 'image/png' }); }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  cv.getContext('2d').putImageData(data, 0, 0);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/webp', 0.92));
}
