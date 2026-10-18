// The 3D case opening (docs/rewards.md "The opening, frame by frame"). A real crate drops onto the
// lobby plinth inside the game world (same renderer, sun, shadows and post stack), the lights go down
// into a dark studio, the camera pushes in, two latches snap open, light leaks from the seam, the lid
// bursts open with a beam, sparks and spilled snow, the HTML reel spins above the glowing crate (its
// light takes the colour of the card under the marker), and the pull rises out of the crate (skis and
// boards on a turntable) or appears on your rider (clothing) with rarity rays, a floor shockwave and
// a particle burst scaled by grade, gold getting its own black-out and star flash.
//
// Everything visual is a pure function of the show time `t` (the opener's clock), so a frozen time
// (casesshot / crateshot SEEK) renders the exact frame, and Skip simply jumps the clock.
// No lights are added to the scene (that would recompile every world shader): the inner glow, beam,
// rays and particles are emissive / additive and bloom through the game's HDR post stack.
//
//   crateShow.prewarm(stage, renderer)   build the three crates + FX, compile shaders (Cases tab mount)
//   crateShow.begin(opts)                take the stage camera, start a show (see opener.js)
//   crateShow.end()                      blend back to the lobby, restore the world
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createEquipmentModel, disposeEquipmentModel } from '../../equipment/models.js';
import { outfitSlotsFromProfile } from '../../character/profile.js';
import { gearModel } from '../../profile/catalog.js';
import { rarityOf } from '../../profile/rarity.js';
import { grainTexture, woodTextures, parkTextures, logoTexture, foamTexture } from './crateTex.js';
import { crateSfx } from '../../audio/crate.js';

const C = { W: 0.95, D: 0.58, Hb: 0.42, Hl: 0.14, r: 0.035 };
const LID_OPEN = -1.98;
const DEG = Math.PI / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut3 = (x) => 1 - (1 - clamp01(x)) ** 3;
const easeOutBack = (x, s = 1.7) => { const u = clamp01(x) - 1; return 1 + u * u * ((s + 1) * u + s); };
/** Damped spring step response 0 → 1 (overshoots), x = seconds since the kick. */
const spring = (x, k = 9, w = 22) => (x <= 0 ? 0 : 1 - Math.exp(-k * x) * Math.cos(w * x));
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A fake studio environment for the crate's plastic, wood and metal: an overhead softbox, two strip
// lights and a floor bounce in the light's colour, in view space so the highlights always read from
// the camera. Cheap, no PMREM (its shader compile froze the page for seconds on Metal / D3D).
const STUDIO = { uStudioTint: { value: new THREE.Color(0.3, 0.3, 0.35) } };
const STUDIO_GLSL = /* glsl */`
uniform vec3 uStudioTint; uniform float uStudio;
vec3 studioEnv(vec3 d, float rough) {
  float w = 0.1 + rough * 0.9;
  vec3 c = mix(vec3(0.012, 0.014, 0.026), vec3(0.05, 0.055, 0.08), smoothstep(-0.3, 0.6, d.y));
  c += vec3(1.25) * smoothstep(0.93 - w * 0.7, 1.0, d.y) * (1.0 - rough * 0.55);
  float az = atan(d.x, d.z);
  float sw = 0.07 + w * 0.45;
  float strips = exp(-pow((az - 0.95) / sw, 2.0)) + 0.6 * exp(-pow((az + 1.05) / sw, 2.0));
  c += vec3(1.25, 1.2, 1.12) * strips * smoothstep(-0.35, 0.1, d.y) * smoothstep(0.9, 0.45, d.y) * (1.0 - rough * 0.6);
  c += uStudioTint * smoothstep(0.1, -0.5, d.y) * 0.6;
  return c;
}`;
function studio(m, k) {
  m.userData.studio = { value: k };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, STUDIO, { uStudio: m.userData.studio });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + STUDIO_GLSL)
      .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  {
    vec3 vd = normalize(vViewPosition);
    float nv = saturate(dot(normal, vd));
    vec3 rr = reflect(-vd, normal);
    vec3 F = material.specularColor + (max(vec3(1.0 - material.roughness), material.specularColor) - material.specularColor) * pow(1.0 - nv, 5.0);
    outgoingLight += studioEnv(rr, material.roughness) * F * uStudio;
    #ifdef USE_CLEARCOAT
      vec3 rc = reflect(-vd, geometryClearcoatNormal);
      float nc = saturate(dot(geometryClearcoatNormal, vd));
      outgoingLight += studioEnv(rc, material.clearcoatRoughness) * (0.04 + 0.96 * pow(1.0 - nc, 5.0)) * material.clearcoat * uStudio;
    #endif
  }`);
  };
  m.customProgramCacheKey = () => 'crateStudio';
  return m;
}

// Per case: body material style, colours, the light inside.
const THEMES = {
  'first-chair': { style: 'shell', body: '#2a63b8', accent: '#ffc928', trim: '#15171d', metal: '#e8eef4', light: '#ffe7a0', tint: '#3a7bd5' },
  'night-park': { style: 'neon', body: '#ffffff', accent: '#2bf0ff', accent2: '#ff3bd4', trim: '#0c0b12', metal: '#7a4cff', light: '#c890ff', tint: '#c43cff' },
  backcountry: { style: 'wood', body: '#ffffff', accent: '#ff6a1a', trim: '#2a2c30', metal: '#565b62', light: '#ffc58a', tint: '#d2691e' },
};

// ------------------------------------------------------------------ shaders
const GLOW_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Additive FX plane: 0 soft glow, 1 god rays, 2 floor ring / shockwave, 3 star flare, 4 light pool. */
const FX_FRAG = /* glsl */`
uniform vec3 uCol; uniform float uI; uniform float uTime; uniform float uMode; uniform float uRing; uniform float uSpin;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = 0.0;
  if (uMode < 0.5) {
    v = exp(-r * r * 5.0) * 0.9 + exp(-r * 14.0) * 1.2;
  } else if (uMode < 1.5) {
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * uSpin), 6.0) + 0.6 * pow(0.5 + 0.5 * sin(a * 14.0 - uTime * uSpin * 0.7 + 1.3), 10.0);
    v = rays * smoothstep(1.0, 0.15, r) * smoothstep(0.0, 0.18, r) + exp(-r * 5.0) * 0.5;
  } else if (uMode < 2.5) {
    float w = 0.03 + 0.08 * uRing;
    v = exp(-pow((r - uRing) / w, 2.0)) * (1.0 - uRing * 0.7) + exp(-r * r * 9.0) * 0.25;
  } else if (uMode < 3.5) {
    float sx = exp(-abs(p.y) * 60.0) * exp(-abs(p.x) * 1.6);
    float sy = exp(-abs(p.x) * 60.0) * exp(-abs(p.y) * 2.6);
    v = sx + sy * 0.7 + exp(-r * 9.0) * 1.5;
  } else {
    // Light pool: a hot centre, a soft square-ish falloff (the crate's opening).
    vec2 q = abs(p);
    float box = max(q.x, q.y * 1.15);
    v = exp(-box * box * 3.0) * (0.6 + 0.4 * sin(uTime * 3.0 + p.x * 4.0) * 0.1) + exp(-r * 6.0);
  }
  gl_FragColor = vec4(uCol * v * uI, 1.0);
}`;

const BEAM_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uCol; uniform float uI; uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float h = vUv.y;
  float streak = 0.65 + 0.35 * sin(vUv.x * 62.0 + uTime * 1.5) * sin(vUv.x * 23.0 - uTime * 0.9 + h * 3.0);
  float v = pow(facing, 2.2) * pow(1.0 - h, 1.6) * streak * smoothstep(0.0, 0.04, h);
  gl_FragColor = vec4(uCol * v * uI, 1.0);
}`;

const ROOM_VERT = /* glsl */`
varying vec3 vP;
void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** The dark studio: dome (uFloor 0) and floor disc (uFloor 1). */
const ROOM_FRAG = /* glsl */`
uniform float uOp; uniform vec3 uTint; uniform float uTime; uniform float uFloor; uniform float uFlash; uniform float uBlack;
varying vec3 vP;
float n2(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3 + uTime * 0.07)) * sin(p.y * 1.1 - uTime * 0.05 + sin(p.x * 0.9)); }
void main() {
  vec3 col;
  if (uFloor < 0.5) {
    vec3 d = normalize(vP);
    float h = d.y;
    col = mix(vec3(0.010, 0.012, 0.024), vec3(0.003, 0.004, 0.010), smoothstep(-0.1, 0.9, h));
    float haze = 0.5 + 0.5 * n2(d.xz * 3.0 + d.y * 2.0);
    col += uTint * (0.05 + 0.05 * haze) * exp(-abs(h - 0.05) * 5.0);
    // Faint specks (a few far 'stars' of light in the studio air).
    vec2 g = floor(vec2(atan(d.z, d.x) * 90.0, h * 60.0));
    float s = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    col += step(0.997, s) * 0.18 * (0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0));
  } else {
    float r = length(vP.xy);
    col = vec3(0.012, 0.013, 0.02) + uTint * 0.22 * exp(-r * 0.55) + vec3(0.05) * exp(-r * r * 0.35);
    // Concentric polished-floor glints.
    col += uTint * 0.05 * pow(0.5 + 0.5 * sin(r * 6.0 - uTime * 0.4), 18.0) * exp(-r * 0.3);
  }
  col += uTint * uFlash * (uFloor > 0.5 ? 0.6 : 0.25);
  col *= 1.0 - uBlack;
  gl_FragColor = vec4(col, uOp);
}`;

/** Stateless GPU particles: position = launch + drag-damped velocity + gravity, all from attributes. */
const PART_VERT = /* glsl */`
attribute vec4 aP; attribute vec4 aV; attribute vec4 aC; attribute vec4 aK;
uniform float uTime; uniform float uPx;
varying vec4 vC; varying float vKind; varying float vA; varying float vSpin;
void main() {
  float age = uTime - aP.w;
  float life = aV.w;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float drag = aK.y;
  float damp = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aP.xyz + aV.xyz * damp;
  p.y -= 0.5 * aK.z * age * age;
  // Confetti / snow flutter.
  p.x += sin(age * 5.0 + aK.w * 30.0) * 0.06 * step(1.5, aK.x) * min(age, 1.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float u = age / life;
  vA = (1.0 - u * u) * smoothstep(0.0, 0.04, age);
  gl_PointSize = aC.w * uPx / max(0.1, -mv.z) * (aK.x > 2.5 ? 1.0 : (1.0 - 0.5 * u));
  vC = aC; vKind = aK.x; vSpin = age * 6.0 + aK.w * 6.28;
}`;
const PART_FRAG = /* glsl */`
varying vec4 vC; varying float vKind; varying float vA; varying float vSpin;
uniform float uAdd;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a = 0.0;
  if (vKind < 0.5) a = exp(-r * r * 3.5);                                      // soft glint / mist
  else if (vKind < 1.5) a = exp(-r * r * 12.0) * 1.6 + exp(-r * 3.0) * 0.4;    // hot spark
  else if (vKind < 2.5) {                                                       // spinning star
    float an = atan(p.y, p.x) + vSpin;
    float star = 0.45 + 0.55 * pow(abs(cos(an * 2.5)), 3.0);
    a = smoothstep(star, star - 0.2, r);
  } else if (vKind < 3.5) {                                                     // confetti flake (tumbling)
    vec2 q = vec2(p.x, p.y / max(0.15, abs(sin(vSpin))));
    a = step(max(abs(q.x), abs(q.y)), 0.7);
  } else a = smoothstep(1.0, 0.5, r);                                          // snow chunk
  if (a < 0.01) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(vC.rgb * a * vA, 1.0) : vec4(vC.rgb, a * vA);
}`;

/** Ambient snow drifting through the studio light (looping, stateless). */
const SNOW_VERT = /* glsl */`
attribute vec4 aS;
uniform float uTime; uniform float uPx; uniform float uOp;
varying float vA;
void main() {
  float y = 3.2 - mod(aS.y * 3.4 + uTime * (0.18 + aS.w * 0.2), 3.4);
  vec3 p = vec3(aS.x + sin(uTime * 0.6 + aS.w * 20.0) * 0.12, y - 0.3, aS.z + cos(uTime * 0.5 + aS.w * 13.0) * 0.1);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.012 + aS.w * 0.014) * uPx / max(0.1, -mv.z);
  vA = uOp * smoothstep(3.2, 2.6, y) * smoothstep(-0.3, 0.2, y) * (0.35 + 0.65 * aS.w);
}`;
const SNOW_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vA;
void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float a = exp(-dot(p, p) * 3.0) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol * a, 1.0); }`;

class Particles {
  constructor(n, additive) {
    this.n = n;
    this.i = 0;
    const g = new THREE.BufferGeometry();
    this.attr = {};
    for (const k of ['aP', 'aV', 'aC', 'aK']) {
      const a = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
      this.attr[k] = a;
    }
    // Everything starts dead (launch time far in the future).
    for (let i = 0; i < n; i++) this.attr.aP.array[i * 4 + 3] = 1e6;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
    this.dirty = false;
  }

  /** Launch one particle: p (vec3), v (vec3), t0, life, col (THREE.Color, HDR scale), size (m), kind, drag, gravity. */
  emit(p, v, t0, life, col, size, kind, drag = 1.5, grav = 2, seed = Math.random()) {
    const i = this.i++ % this.n;
    const A = this.attr;
    A.aP.array.set([p.x, p.y, p.z, t0], i * 4);
    A.aV.array.set([v.x, v.y, v.z, life], i * 4);
    A.aC.array.set([col.r, col.g, col.b, size], i * 4);
    A.aK.array.set([kind, drag, grav, seed], i * 4);
    this.dirty = true;
  }

  clear() { for (let i = 0; i < this.n; i++) this.attr.aP.array[i * 4 + 3] = 1e6; this.dirty = true; }

  flush() {
    if (!this.dirty) return;
    for (const a of Object.values(this.attr)) a.needsUpdate = true;
    this.dirty = false;
  }
}

// ------------------------------------------------------------------ the crate model
function buildCrate(series, tx) {
  const th = THEMES[series] || THEMES['first-chair'];
  const g = new THREE.Group();
  g.name = `Crate:${series}`;
  const mats = [];
  // o.env = strength of the studio reflections (see studio()).
  const std = ({ env = 0.7, ...o }, physical = false) => {
    const m = studio(physical ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o), env);
    mats.push(m);
    return m;
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const { W, D, Hb, Hl, r } = C;
  let body, accent, metal, trim;
  if (th.style === 'shell') {
    body = std({ color: th.body, roughness: 0.4, roughnessMap: tx.grain, bumpMap: tx.grain, bumpScale: 0.6, clearcoat: 0.75, clearcoatRoughness: 0.22, env: 0.65 }, true);
    accent = std({ color: th.accent, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }, true);
  } else if (th.style === 'neon') {
    body = std({ color: th.body, map: tx.park.map, roughness: 0.48, bumpMap: tx.park.bump, bumpScale: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.3, env: 0.5 }, true);
    accent = std({ color: '#ffd400', roughness: 0.5 });
  } else {
    body = std({ color: th.body, map: tx.wood.map, bumpMap: tx.wood.bump, bumpScale: 1.4, roughness: 0.86, env: 0.35 });
    accent = std({ color: th.accent, roughness: 0.6 });
  }
  metal = std({ color: th.metal, metalness: 1, roughness: th.style === 'wood' ? 0.48 : th.style === 'neon' ? 0.3 : 0.2, env: 0.85 });
  trim = std({ color: th.trim, roughness: 0.75, env: 0.4 });

  // Body (the lower shell).
  mesh(new RoundedBoxGeometry(W, Hb, D, 4, r), body, 0, Hb / 2, 0);
  // Feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new RoundedBoxGeometry(0.1, 0.03, 0.08, 2, 0.012), trim, sx * (W / 2 - 0.09), 0.012, sz * (D / 2 - 0.08));

  const neon = [];
  if (th.style === 'shell') {
    // Moulded ribs and the yellow accent band.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new RoundedBoxGeometry(0.07, Hb - 0.05, 0.03, 2, 0.012), body, sx * 0.4, Hb / 2 - 0.005, sz * (D / 2 + 0.004));
    mesh(new RoundedBoxGeometry(W + 0.01, 0.045, D + 0.01, 2, 0.02), accent, 0, Hb * 0.26, 0);
    for (const sx of [-1, 1]) mesh(new RoundedBoxGeometry(0.03, Hb - 0.08, 0.36, 2, 0.012), body, sx * (W / 2 + 0.006), Hb / 2, 0);
  } else if (th.style === 'neon') {
    // Neon tubes on the vertical edges (they pulse; HDR so they bloom).
    const nm = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.accent).multiplyScalar(5) });
    const nm2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.accent2).multiplyScalar(5) });
    neon.push(nm, nm2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, Hb - 0.06, 8), sz > 0 ? nm : nm2);
      t.position.set(sx * (W / 2 + 0.004), Hb / 2, sz * (D / 2 + 0.004));
      g.add(t);
    }
    mesh(new RoundedBoxGeometry(W + 0.012, 0.03, D + 0.012, 2, 0.012), trim, 0, 0.05, 0);
  } else {
    // Steel corner angles and rope handles.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.075, Hb - 0.01, 0.008), metal, sx * (W / 2 - 0.03), Hb / 2, sz * (D / 2 + 0.004));
      mesh(new THREE.BoxGeometry(0.008, Hb - 0.01, 0.075), metal, sx * (W / 2 + 0.004), Hb / 2, sz * (D / 2 - 0.03));
      for (const yy of [0.06, Hb - 0.06]) mesh(new THREE.SphereGeometry(0.009, 8, 6), metal, sx * (W / 2 - 0.03), yy, sz * (D / 2 + 0.009));
    }
    const rope = std({ color: '#c8b388', roughness: 1, env: 0.2 });
    for (const sx of [-1, 1]) {
      const h = mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 20, Math.PI), rope, sx * (W / 2 + 0.03), Hb * 0.62, 0);
      h.rotation.set(0, Math.PI / 2, Math.PI);
      h.scale.set(1, 0.8, 1);
      mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), metal, sx * (W / 2 + 0.01), Hb * 0.62, -0.075);
      mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), metal, sx * (W / 2 + 0.01), Hb * 0.62, 0.075);
    }
  }

  // Front logo plate.
  const logoMat = th.style === 'neon'
    ? new THREE.MeshBasicMaterial({ map: tx.logos[series], transparent: true, color: new THREE.Color(3, 3, 3), depthWrite: false })
    : std({ map: tx.logos[series], transparent: true, roughness: th.style === 'wood' ? 0.9 : 0.3, metalness: 0, depthWrite: false, env: 0.4 });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), logoMat);
  logo.position.set(0, Hb * 0.56, D / 2 + (th.style === 'shell' ? 0.0025 : 0.002));
  logo.renderOrder = 2;
  g.add(logo);

  // Seam glow: light leaking through the gap under the lid before it opens.
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.01, D - 0.02), seamMat);
  seam.position.y = Hb - 0.004;
  g.add(seam);
  // The light pool inside (seen once the lid is up).
  const poolU = { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uTime: { value: 0 }, uMode: { value: 4 }, uRing: { value: 0 }, uSpin: { value: 0 } };
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, D - 0.05), new THREE.ShaderMaterial({ uniforms: poolU, vertexShader: GLOW_VERT, fragmentShader: FX_FRAG }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = Hb + 0.006;
  g.add(pool);
  // Foam rim around the pool.
  for (const [sx, sz, w, d] of [[0, 1, W - 0.02, 0.025], [0, -1, W - 0.02, 0.025], [1, 0, 0.025, D - 0.02], [-1, 0, 0.025, D - 0.02]]) {
    mesh(new THREE.BoxGeometry(w, 0.012, d), trim, sx * (W / 2 - 0.022), Hb + 0.006, sz * (D / 2 - 0.022));
  }

  // Lid on a hinge along the back top edge.
  const lid = new THREE.Group();
  lid.position.set(0, Hb, -D / 2 - 0.008);
  g.add(lid);
  const lidMesh = mesh(new RoundedBoxGeometry(W + 0.016, Hl, D + 0.016, 4, r), body, 0, Hl / 2, D / 2 + 0.008, lid);
  lidMesh.name = 'Lid';
  const lidInnerMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: tx.foam });
  const lidInner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, D - 0.03), lidInnerMat);
  lidInner.rotation.x = Math.PI / 2;
  lidInner.position.set(0, -0.002, D / 2 + 0.008);
  lid.add(lidInner);
  if (th.style === 'shell') {
    for (const sx of [-1, 1]) mesh(new RoundedBoxGeometry(0.07, 0.02, D - 0.06, 2, 0.008), body, sx * 0.4, Hl + 0.006, D / 2 + 0.008, lid);
    mesh(new RoundedBoxGeometry(W + 0.022, 0.03, D + 0.022, 2, 0.012), accent, 0, 0.02, D / 2 + 0.008, lid);
  } else if (th.style === 'neon') {
    const nm = neon[0], nm2 = neon[1];
    for (const [w, d, x, z, m] of [[W + 0.02, 0.012, 0, D + 0.018, nm], [W + 0.02, 0.012, 0, -0.002, nm2]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), m);
      t.position.set(x, 0.012, z);
      lid.add(t);
    }
    // Top graphic: a thick diagonal stripe.
    const s = mesh(new THREE.BoxGeometry(0.12, 0.006, D * 1.05), accent, 0.12, Hl + 0.002, D / 2 + 0.008, lid);
    s.rotation.y = 0.5;
    s.scale.set(1, 1, 0.92);
  } else {
    for (const sz of [0, 1]) mesh(new THREE.BoxGeometry(W + 0.02, 0.03, 0.03), metal, 0, Hl - 0.014, sz * (D + 0.016), lid);
    // Stencilled lid number.
    const st = std({ color: th.accent, roughness: 0.8 });
    const bar = mesh(new THREE.BoxGeometry(0.34, 0.003, 0.05), st, -0.2, Hl + 0.001, D / 2 + 0.008, lid);
    bar.rotation.y = 0.0;
  }
  // Carry handle on the lid.
  for (const sx of [-1, 1]) mesh(new RoundedBoxGeometry(0.04, 0.05, 0.05, 2, 0.01), trim, sx * 0.12, Hl + 0.02, D / 2 + 0.008, lid);
  const bar = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 12), trim, 0, Hl + 0.05, D / 2 + 0.008, lid);
  bar.rotation.z = Math.PI / 2;

  // Two latches: a plate on the body, a lever hinged low that hooks over a catch on the lid.
  const latches = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.3;
    mesh(new RoundedBoxGeometry(0.1, 0.08, 0.016, 2, 0.006), metal, x, Hb - 0.07, D / 2 + 0.006);
    const piv = new THREE.Group();
    piv.position.set(x, Hb - 0.1, D / 2 + 0.02);
    g.add(piv);
    const lever = mesh(new RoundedBoxGeometry(0.072, 0.135, 0.014, 2, 0.006), metal, 0, 0.065, 0, piv);
    lever.name = 'Latch';
    mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), metal, 0, 0.128, -0.008, piv);   // the hook
    mesh(new THREE.BoxGeometry(0.06, 0.02, 0.014), metal, x, 0.03, D + 0.022, lid);  // the catch
    latches.push(piv);
  }
  // Lock badge in the centre top edge.
  mesh(new RoundedBoxGeometry(0.08, 0.05, 0.012, 2, 0.008), metal, 0, Hb - 0.03, D / 2 + 0.007);
  return { group: g, lid, latches, seam, seamMat, pool, poolU, lidInnerMat, neon, mats, theme: th, logoMat };
}

// ------------------------------------------------------------------ the show
class CrateShow {
  constructor() {
    this.ready = false;
    this.active = false;
    this.root = null;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._c = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  /** Can the 3D show run here (lobby stage up and rendering)? */
  available(stage = globalThis.__sendit?.stage) {
    return !!(stage?.ready && stage.active && globalThis.__sendit?.renderer);
  }

  /**
   * Build everything once and compile its shaders against the world's lights, so the first opening
   * starts without a hitch. Safe to call repeatedly; resolves when done.
   */
  prewarm(stage = globalThis.__sendit?.stage, renderer = globalThis.__sendit?.renderer) {
    if (this._warm) return this._warm;
    if (!stage?.ready || !renderer) return Promise.resolve(false);
    this._warm = (async () => {
      const t0 = performance.now();
      this.stage = stage; this.renderer = renderer;
      const mark = (n) => { (this.warmLog ||= []).push(`${n} ${Math.round(performance.now() - t0)}`); };
      const tx = { grain: grainTexture(), wood: woodTextures(), park: parkTextures(), foam: foamTexture(), logos: {} };
      tx.foam.repeat.set(3, 2);
      tx.park.bump.repeat.set(5, 3);
      for (const s of Object.keys(THEMES)) tx.logos[s] = logoTexture(s);
      this.root = new THREE.Group();
      this.root.name = 'CaseShow';
      this.root.visible = false;
      this.crates = {};
      for (const s of Object.keys(THEMES)) {
        const c = buildCrate(s, tx);
        c.group.visible = false;
        this.root.add(c.group);
        this.crates[s] = c;
      }
      this.buildFx();
      mark('build');
      stage.root.add(this.root);
      // Compile with every crate visible (renderer.compile only walks visible objects).
      this.root.visible = true;
      for (const c of Object.values(this.crates)) c.group.visible = true;
      for (const m of this.fxMeshes) m.visible = true;
      const p = this.compile(this.root);
      this.root.visible = false;
      for (const c of Object.values(this.crates)) c.group.visible = false;
      mark('compile-call');
      await p.catch(() => {});
      mark('compiled');
      await this.warmFrames();
      mark('warm frames');
      for (const t of [tx.grain, tx.foam, tx.wood.map, tx.wood.bump, tx.park.map, tx.park.bump, ...Object.values(tx.logos)]) renderer.initTexture?.(t);
      this.ready = true;
      this.warmMs = performance.now() - t0;
      return true;
    })().catch((e) => { console.warn('[cases] 3D case prewarm failed; using the 2D case', e); this._warm = null; return false; });
    return this._warm;
  }

  /**
   * Compile an object's programs in the background against the world's lights and fog, as the post
   * stack's render target sees them (renderer.compile() alone builds the canvas variant: another
   * output colour space, so the first real frame would compile again).
   */
  compile(obj) {
    const r = this.renderer, st = this.stage;
    const prev = r.getRenderTarget();
    this.warmRT ||= new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    r.setRenderTarget(this.warmRT);
    let p;
    try { p = r.compileAsync ? r.compileAsync(obj, st.camera, st.scene) : (r.compile(obj, st.camera, st.scene), Promise.resolve()); }
    finally { r.setRenderTarget(prev); }
    return p;
  }

  /**
   * Two real frames with every crate and effect drawn (under the snow, out of sight, culling off),
   * so shadow-depth programs, buffers and textures are all on the GPU before the first opening.
   */
  warmFrames() {
    const st = this.stage;
    if (!st.active) return Promise.resolve();
    return new Promise((resolve) => {
      const undo = [];
      this.root.traverse((o) => { if (o.isMesh || o.isPoints) { undo.push([o, o.frustumCulled, o.visible]); o.frustumCulled = false; o.visible = true; } });
      for (const c of Object.values(this.crates)) c.group.visible = true;
      this.root.visible = true;
      this.root.position.y = -6;
      let n = 3;
      const prev = st.cameraOverride;
      const hook = () => { if (--n <= 0) done(); return false; };
      const done = () => {
        if (n === -99) return;
        n = -99;
        for (const [o, fc, v] of undo) { o.frustumCulled = fc; o.visible = v; }
        this.root.visible = false;
        this.root.position.y = 0;
        for (const c of Object.values(this.crates)) c.group.visible = false;
        if (st.cameraOverride === hook) st.cameraOverride = prev;
        resolve();
      };
      st.cameraOverride = hook;
      setTimeout(done, 3000);   // the lobby was hidden meanwhile: skip the warm frames
    });
  }

  buildFx() {
    const fx = (mode, w, h) => {
      const u = { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uTime: { value: 0 }, uMode: { value: mode }, uRing: { value: 0 }, uSpin: { value: 1 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
        uniforms: u, vertexShader: GLOW_VERT, fragmentShader: FX_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.userData.u = u;
      m.renderOrder = 15;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.glow = fx(0, 3, 3);           // soft glow behind the subject (billboard)
    this.rays = fx(1, 7, 7);           // rarity god rays (billboard)
    this.flare = fx(3, 4, 4);          // star flare (billboard)
    this.ring = fx(2, 5, 5);           // floor shockwave (flat)
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.fxMeshes = [this.glow, this.rays, this.flare, this.ring];
    // The beam out of the open crate.
    const bu = { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uTime: { value: 0 } };
    const beamGeo = new THREE.CylinderGeometry(0.62, 0.36, 3.2, 40, 1, true);
    beamGeo.translate(0, 1.6, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({ uniforms: bu, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.userData.u = bu;
    this.beam.renderOrder = 14;
    this.beam.frustumCulled = false;
    this.root.add(this.beam);
    this.fxMeshes.push(this.beam);
    // The dark studio: dome + floor.
    const room = (floor) => new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 0 }, uTint: { value: new THREE.Color() }, uTime: { value: 0 }, uFloor: { value: floor }, uFlash: { value: 0 }, uBlack: { value: 0 } },
      vertexShader: ROOM_VERT, fragmentShader: ROOM_FRAG, transparent: true, side: floor ? THREE.FrontSide : THREE.BackSide, depthWrite: true,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(9, 40, 20), room(0));
    this.dome.renderOrder = 10;
    this.dome.frustumCulled = false;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), room(1));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.2;
    this.floor.renderOrder = 11;
    this.floor.frustumCulled = false;
    this.root.add(this.dome, this.floor);
    this.fxMeshes.push(this.dome, this.floor);
    // Particles: additive (sparks, glints, stars) and alpha (snow chunks, confetti).
    this.add = new Particles(1400, true);
    this.alpha = new Particles(900, false);
    this.root.add(this.add.points, this.alpha.points);
    this.fxMeshes.push(this.add.points, this.alpha.points);
    // Ambient snow.
    const n = 260;
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) a.set([(hash(i + 1) - 0.5) * 6, hash(i + 7.3), (hash(i + 3.1) - 0.5) * 5 - 0.5, hash(i + 9.7)], i * 4);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('aS', new THREE.BufferAttribute(a, 4));
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.snowU = { uTime: { value: 0 }, uPx: { value: 600 }, uOp: { value: 0 }, uCol: { value: new THREE.Color(1.3, 1.35, 1.5) } };
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.snowU, vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 18;
    this.root.add(this.snow);
    this.fxMeshes.push(this.snow);
  }

  /**
   * Start a show. o = { result, timing, clock: () => t, quick, onCue(name) }.
   * Returns false when the 3D show cannot run (the opener then uses the 2D case).
   */
  begin(o) {
    const stage = globalThis.__sendit?.stage;
    if (!this.ready || !this.available(stage)) return false;
    const tb = performance.now();
    // Chained straight from the last reveal ("Open another"): the studio is already dark.
    this.cont = this.active && !this.ending;
    if (this.active) this.finish();
    this.o = o;
    this.stage = stage;
    this.active = true;
    this.ending = null;
    const res = o.result;
    this.series = res.case.series in THEMES ? res.case.series : 'first-chair';
    this.crate = this.crates[this.series];
    for (const [s, c] of Object.entries(this.crates)) c.group.visible = s === this.series;
    this.crate.group.position.set(0, 0, 0);
    this.crate.group.scale.set(1, 1, 1);
    this.crate.group.rotation.set(0, 0, 0);
    this.crate.lid.rotation.x = 0;
    for (const l of this.crate.latches) l.rotation.x = 0;
    this.root.visible = true;
    this.root.position.set(0, 0, 0);
    this.add.clear(); this.alpha.clear();
    this.cues = new Set();
    this.trauma = 0;
    this.baseLight = new THREE.Color(this.crate.theme.light);
    this.lightCol = this.baseLight.clone();
    this.tint = new THREE.Color(this.crate.theme.tint);
    this.rarity = rarityOf(res.rarity);
    this.rcol = new THREE.Color(this.rarity.color);
    this.gear = !!res.item.equipment;
    this.slot = res.item.slot;
    // Camera: start from wherever the lobby camera is.
    const cam = stage.camera;
    this.fov0 = cam.fov;
    this.from = { pos: cam.position.clone(), look: cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(4)) };
    this.lastPose = null;
    stage.cameraOverride = (camera, dt) => this.cameraFrame(camera, dt);
    // Neon rim of the plinth: series colour now, rarity colour at the reveal.
    this.neon0 = stage.neonBase?.clone();
    // The rider steps off for the crate (reappears for a clothing reveal).
    this.rider = stage.rider;
    if (this.rider?.root) this.rider.root.visible = false;
    this.riderShown = false;
    // Prepare the pull's 3D model now (9 s before it is needed): gear model or the rider's outfit.
    this.item = null;
    this.dressed = false;
    try {
      if (this.gear) {
        const type = res.item.equipment === 'snowboard' ? 'snowboard' : 'ski';
        this.item = createEquipmentModel(type, gearModel(res.item) ?? undefined, { outline: true, pair: type === 'ski', neon: 1 });
        this.itemType = type;
        this.item.visible = false;
        this.itemPivot = new THREE.Group();
        this.itemPivot.add(this.item);
        this.root.add(this.itemPivot);
        // Stand the planks up, topsheet to the camera (length runs along the model's Z).
        this.item.rotation.x = Math.PI / 2;
        const box = new THREE.Box3().setFromObject(this.item);
        this.itemLen = box.max.y - box.min.y;
        this.item.position.y = -(box.min.y + box.max.y) / 2;
        this.item.visible = true;
        this.compile(this.itemPivot).catch(() => {});
        this.itemPivot.visible = false;
      } else if (this.rider?.setOutfit) {
        const slots = outfitSlotsFromProfile();
        slots[this.slot] = { garment: res.item.model?.kind === 'outfit' ? res.item.model.ref : undefined, colorway: res.variant.id, colors: res.variant.colors };
        this.rider.setOutfit(slots);
        this.dressed = true;
      }
    } catch (e) { console.warn('[cases] could not build the pull preview', e); this.item = null; }
    this.hidden = null;
    this.beginMs = Math.round(performance.now() - tb);
    return true;
  }

  /** The opener closes: blend the camera back, fade the studio, restore the world (and the outfit). */
  end({ equipped = false } = {}) {
    if (!this.active || this.ending) return;
    this.ending = { t0: performance.now(), equipped };
    this.showWorld();
    if (this.rider?.root) this.rider.root.visible = true;
    if (this.dressed && !equipped) this.rider.setOutfit?.(outfitSlotsFromProfile());
    this.dressed = false;
  }

  /** Drop everything immediately (a new show starts, or the blend finished). */
  finish() {
    const st = this.stage;
    this.showWorld();
    if (st) {
      if (st.cameraOverride) st.cameraOverride = null;
      if (this.neon0 && st.neonBase) st.neonBase.copy(this.neon0);
      st.camera.fov = this.fov0 ?? st.camera.fov;
      st.camera.updateProjectionMatrix();
    }
    if (this.rider?.root) { this.rider.root.visible = true; this.rider.root.scale.set(1, 1, 1); }
    if (this.dressed) this.rider.setOutfit?.(outfitSlotsFromProfile());
    this.dressed = false;
    if (this.itemPivot) { this.itemPivot.removeFromParent(); disposeEquipmentModel(this.item); this.itemPivot = null; this.item = null; }
    if (this.root) this.root.visible = false;
    this.active = false;
    this.ending = null;
  }

  // ---------------------------------------------------------------- the world behind the studio
  hideWorld() {
    if (this.hidden) return;
    const scene = this.stage.scene;
    this.hidden = [];
    for (const o of scene.children) {
      if (o === this.stage.root || o.isLight || !o.visible) continue;
      o.visible = false;
      this.hidden.push(o);
    }
  }

  showWorld() {
    if (!this.hidden) return;
    for (const o of this.hidden) o.visible = true;
    this.hidden = null;
  }

  cue(name, fn) {
    if (this.cues.has(name)) return;
    this.cues.add(name);
    fn?.();
  }

  // ---------------------------------------------------------------- per frame (called by the stage)
  cameraFrame(cam, dt) {
    if (!this.active) return false;
    if (this.ending) {
      const k = clamp01((performance.now() - this.ending.t0) / 650);
      this.fadeStudio(1 - k);
      // Let the stage compute its lobby framing, then blend from the last show pose to it.
      this.stage.updateCamera(dt);
      if (this.lastPose && k < 1) {
        const e = easeOut3(k);
        const pos = this._v.copy(this.lastPose.pos).lerp(cam.position, e);
        const tgtW = this._v2.copy(cam.position).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(4));
        const look = this.lastPose.look.clone().lerp(tgtW, e);
        cam.position.copy(pos);
        cam.lookAt(look);
        cam.fov = THREE.MathUtils.lerp(this.lastPose.fov, this.fov0, e);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
      }
      if (k >= 1) this.finish();
      return true;
    }
    const t = this.o.clock();
    this.update(t, Math.min(0.05, dt));
    this.placeCamera(cam, t, dt);
    return true;
  }

  fadeStudio(op) {
    for (const m of [this.dome, this.floor]) m.material.uniforms.uOp.value = op;
    this.snowU.uOp.value = op;
    if (op < 1) this.showWorld();
  }

  update(t, dt) {
    const T = this.o.timing, o = this.o, c = this.crate, th = c.theme;
    const res = o.result;
    const q = o.quick;
    const st = this.stage;
    const rm = reduced();
    // ---------------------------------------------------------- studio fade (dark room in 0.55 s)
    const dark = this.cont ? 1 : smooth(0.0, q ? 0.3 : 0.55, t);
    this.fadeStudio(dark);
    if (dark >= 1) this.hideWorld();
    // (Some world systems set .visible every frame, e.g. distance culling in life.js: keep them hidden.)
    if (this.hidden) for (const o of this.hidden) o.visible = false;
    for (const m of [this.dome, this.floor]) { m.material.uniforms.uTime.value = t; m.material.uniforms.uTint.value.copy(this.tint); }
    this.snowU.uTime.value = t;
    // ---------------------------------------------------------- drop + land
    const land = T.land;
    const g = c.group;
    let y = 0, sq = 0;
    if (t < land) { const u = t / land; y = 2.4 * (1 - u * u); }
    else {
      const x = t - land;
      sq = Math.exp(-x * 9) * Math.sin(x * 34) * 0.07;
      this.cue('land', () => {
        o.onCue?.('land');
        crateSfx.thud();
        this.trauma = Math.max(this.trauma, 0.45);
        this.puff(land, 26, 0.9);
      });
    }
    // ---------------------------------------------------------- latches + tension
    const latch = (piv, at, name) => {
      const x = t - at;
      piv.rotation.x = x <= 0 ? 0 : 1.95 * spring(x, 10, 26);
      if (x > 0) this.cue(name, () => { crateSfx.latch(name === 'latchR' ? 1 : 0); this.trauma = Math.max(this.trauma, 0.22); o.onCue?.(name); this.sparkAt(new THREE.Vector3(piv.position.x, piv.position.y + 0.12, piv.position.z + 0.02), T[name], 10); });
    };
    latch(c.latches[0], T.latchL, 'latchL');
    latch(c.latches[1], T.latchR, 'latchR');
    const tension = smooth(T.latchR, T.lid, t) * (t < T.lid ? 1 : 0);
    let rattle = 0, lift = 0;
    if (tension > 0 && !rm) {
      rattle = Math.sin(t * 41) * 0.016 * tension * tension;
      lift = (0.5 + 0.5 * Math.sin(t * 52)) * 0.007 * tension;
      if (t > T.latchR + 0.05) this.cue('tension', () => crateSfx.tension(Math.max(0.2, T.lid - t)));
    }
    g.position.y = y;
    g.rotation.z = rattle;
    g.rotation.x = rattle * 0.5;
    g.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    // ---------------------------------------------------------- the lid
    const lx = t - T.lid;
    if (lx <= 0) c.lid.rotation.x = -lift * 6;
    else {
      // Bursts open past the stop, bounces back once and settles.
      c.lid.rotation.x = LID_OPEN * spring(lx, 6.5, 13);
      this.cue('lid', () => {
        o.onCue?.('lid');
        crateSfx.burst();
        this.trauma = Math.max(this.trauma, 0.7);
        this.burstOpen(T.lid);
      });
    }
    // ---------------------------------------------------------- the light inside
    let I = 0;
    const want = this._c.copy(this.baseLight);
    if (t < T.lid) {
      I = tension * tension * 7;
    } else {
      I = 4 + 14 * Math.exp(-lx * 3.5);
      // During the reel: the colour of the card under the marker; ticks flicker it.
      if (t >= T.spin && o.under) want.set(rarityOf(o.under).color).lerp(this.baseLight, 0.25);
      I += (o.tickPulse || 0) * 3;
      // A red or gold card sliding past the marker: the light flares in its colour.
      if (o.tease && t - o.tease.t < 0.9 && !o.landed) { const f = Math.exp(-(t - o.tease.t) * 4); want.lerp(this._c2.set(o.tease.col), f); I += 7 * f; }
      if (o.landed) {
        const lt = t - T.spin - T.spinDur;
        want.copy(this.rcol);
        // The hold: the light swells toward the reveal, more for higher grades.
        I = 7 + 6 * Math.exp(-lt * 4) + Math.max(0, this.rarity.rank - 1) * 2.5 * smooth(0, T.hold, lt);
      }
    }
    this.lightCol.lerp(want, 1 - Math.exp(-dt * 14));
    if (o.landed) this.lightCol.copy(this.rcol);
    const reveal = o.revealAt != null ? t - o.revealAt : -1;
    if (reveal >= 0) I = this.gear ? 6 : Math.max(0, 6 - reveal * 20);
    // Gold: the beat of darkness before the flash takes the crate's light too.
    const blackout = this.rarity.id === 'gold' && reveal >= 0 && reveal < 0.32;
    if (blackout) I = 0.4;
    c.seamMat.color.copy(this.lightCol).multiplyScalar(I * 1.4);
    c.poolU.uCol.value.copy(this.lightCol);
    c.poolU.uI.value = t >= T.lid ? I * 0.9 : 0;
    c.poolU.uTime.value = t;
    c.lidInnerMat.color.copy(this.lightCol).multiplyScalar(t >= T.lid ? Math.min(1.6, 0.25 + I * 0.06) : 0);
    for (const m of c.neon) m.color.set(m === c.neon[0] ? th.accent : th.accent2).multiplyScalar(3.5 + 1.5 * Math.sin(t * 5) + (t > T.lid ? 3 * Math.exp(-lx * 2) : 0));
    // Beam: grows out of the crate at the burst, breathes with the light.
    const beamOn = t >= T.lid ? easeOut3(lx / 0.35) : 0;
    this.beam.scale.set(1, Math.max(0.001, beamOn), 1);
    this.beam.position.copy(g.position).add(this._v.set(0, C.Hb, 0));
    const bu = this.beam.userData.u;
    bu.uCol.value.copy(this.lightCol);
    bu.uI.value = blackout ? 0 : beamOn * (0.25 + I * 0.05) * (reveal >= 0 ? Math.max(0.35, 1 - reveal) : 1);
    bu.uTime.value = t;
    STUDIO.uStudioTint.value.copy(this.lightCol).multiplyScalar(0.25 + Math.min(1, I * 0.05));
    // Plinth neon follows the light.
    if (st.neonBase) st.neonBase.copy(this.lightCol).multiplyScalar(0.6);
    // ---------------------------------------------------------- reveal
    this.updateReveal(t, reveal, dt);
    // ---------------------------------------------------------- particles + room flash
    this.add.mat.uniforms.uTime.value = t;
    this.alpha.mat.uniforms.uTime.value = t;
    this.add.flush(); this.alpha.flush();
    const flash = reveal >= 0 ? Math.exp(-reveal * 3) * (0.4 + this.rarity.rank * 0.25) : t >= T.lid ? Math.exp(-lx * 5) * 0.5 : 0;
    for (const m of [this.dome, this.floor]) {
      m.material.uniforms.uFlash.value = flash;
      if (reveal >= 0) m.material.uniforms.uTint.value.copy(this.tint).lerp(this.rcol, clamp01(reveal * 3));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  updateReveal(t, rv, dt) {
    const R = this.rarity, rank = R.rank;
    const gold = R.id === 'gold';
    const c = this.crate;
    const u = (m) => m.userData.u;
    if (rv < 0) {
      for (const m of [this.glow, this.rays, this.flare, this.ring]) u(m).uI.value = 0;
      if (this.itemPivot) this.itemPivot.visible = false;
      return;
    }
    // Gold: a beat of total darkness, then the star flash.
    const pre = gold ? 0.32 : 0;
    const x = rv - pre;
    for (const m of [this.dome, this.floor]) m.material.uniforms.uBlack.value = gold ? (rv < pre ? 1 : Math.exp(-x * 8)) : 0;
    this.cue('reveal', () => {
      crateSfx.reveal(R.id, rank);
      if (gold) crateSfx.goldIntro();
      this.trauma = Math.max(this.trauma, [0.15, 0.2, 0.3, 0.55, 0.75, 0.9][rank] ?? 0.3);
    });
    if (x < 0) {
      for (const m of [this.glow, this.rays, this.flare, this.ring]) u(m).uI.value = 0;
      if (this.itemPivot) this.itemPivot.visible = false;
      return;
    }
    this.cue('revealBurst', () => this.revealBurst(this.o.revealAt + pre));
    // Subject: the gear rises out of the crate on a turntable; clothing appears on the rider.
    const subjY = this.gear ? 0.62 + (this.itemLen || 1.6) / 2 + 0.08 : this.slotFocus().y;
    if (this.gear && this.itemPivot) {
      this.itemPivot.visible = true;
      const k = easeOutBack(x / 0.8, 1.2);
      this.itemPivot.position.set(0, THREE.MathUtils.lerp(-1.4, subjY, k) + Math.sin(t * 1.6) * 0.025 * k, 0.02);
      this.itemPivot.rotation.y = (1 - k) * 2.5 + Math.sin(t * 0.55) * 0.55 + x * 0.35;
      this.itemPivot.rotation.z = Math.sin(t * 0.9) * 0.04;
    } else if (!this.gear) {
      // The crate collapses into a burst of snow; the rider is standing there in the new kit.
      const k = clamp01(x / 0.12);
      c.group.scale.setScalar(Math.max(0.001, 1 - easeOut3(k)));
      if (k > 0.75 && !this.riderShown && this.rider?.root) { this.rider.root.visible = true; this.riderShown = true; }
      if (this.rider?.root) this.rider.root.scale.setScalar(0.94 + 0.06 * spring(x, 8, 18));
    }
    // FX around the subject: glow, rays (purple and up), flare (red and up), floor shockwave.
    const cam = this.stage.camera;
    const center = this._v.set(0, subjY, this.gear ? -0.05 : -0.35);
    for (const m of [this.glow, this.rays, this.flare]) {
      m.position.copy(center);
      m.quaternion.copy(cam.quaternion);
      // Billboards live under the stage root: undo its rotation so they face the camera.
      if (this.root.parent) m.quaternion.premultiply(this.root.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      u(m).uCol.value.copy(this.rcol);
      u(m).uTime.value = t;
    }
    const pop = Math.exp(-x * 2.2);
    // Effects scale with the framing (a helmet close-up must not drown in rays).
    const fk = (this.gear ? (this.itemLen || 1.6) + 0.9 : this.slotFocus().h + 0.25) / 2.5;
    u(this.glow).uI.value = (gold ? 0.3 : 0.22 + rank * 0.06) * (0.5 + 1.3 * pop);
    this.glow.scale.setScalar((0.9 + rank * 0.12) * fk);
    u(this.rays).uI.value = rank >= 2 ? (0.1 + (rank - 2) * 0.045) * smooth(0, 0.25, x) * (1 + 1.5 * pop) * (reduced() ? 0.5 : 1) : rank === 1 ? 0.04 * smooth(0, 0.3, x) : 0;
    u(this.rays).uSpin.value = reduced() ? 0 : 0.35 + rank * 0.06;
    this.rays.scale.setScalar((0.6 + 0.25 * easeOutBack(x / 0.5) + rank * 0.06) * fk);
    u(this.flare).uI.value = rank >= 4 ? (gold ? 2.4 : 1.4) * Math.exp(-x * 2.5) + (gold ? 0.12 : 0) : rank >= 3 ? 0.8 * Math.exp(-x * 4) : 0;
    this.flare.scale.setScalar((gold ? 1.6 : 1.1) * fk);
    const ringK = clamp01(x / 0.9);
    u(this.ring).uRing.value = ringK;
    u(this.ring).uCol.value.copy(this.rcol);
    u(this.ring).uI.value = (1.0 + rank * 0.5) * (1 - ringK) + 0.15 + rank * 0.04;
    u(this.ring).uTime.value = t;
    this.ring.scale.setScalar(1.5 + rank * 0.25);
    // Gold keeps raining sparkles while the reveal is up.
    if (gold && Math.floor(x * 20) !== this.lastGoldTick && x > 0.2) {
      this.lastGoldTick = Math.floor(x * 20);
      const col = new THREE.Color(2.4, 1.8, 0.6);
      for (let i = 0; i < 4; i++) this.add.emit(this._v2.set((Math.random() - 0.5) * 2.4, subjY + 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2), new THREE.Vector3(0, -0.2, 0), t, 2.2, col, 0.035, 2, 0.5, 0.25);
    }
  }

  /** Where the camera looks for a clothing reveal (on the rider), per slot. */
  slotFocus() {
    return {
      helmet: { y: 1.66, h: 0.85 }, goggles: { y: 1.64, h: 0.8 }, face: { y: 1.56, h: 0.85 },
      jacket: { y: 1.2, h: 1.5 }, gloves: { y: 1.1, h: 1.45 }, pants: { y: 0.85, h: 1.7 },
    }[this.slot] || { y: 1.2, h: 1.6 };
  }

  // ---------------------------------------------------------------- particle bursts
  puff(t0, n, spread) {
    const col = new THREE.Color(1.8, 1.85, 1.95);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 0.8 + Math.random() * 1.2 * spread;
      this.alpha.emit(this._v.set(Math.cos(a) * C.W * 0.5, 0.03, Math.sin(a) * C.D * 0.5), this._v2.set(Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp), t0, 0.5 + Math.random() * 0.5, col, 0.02 + Math.random() * 0.025, 4, 4, 1.5);
    }
  }

  sparkAt(p, t0, n) {
    const col = new THREE.Color(1.6, 1.4, 1.1);
    for (let i = 0; i < n; i++) {
      const v = this._v2.set((Math.random() - 0.5) * 2.4, 0.3 + Math.random() * 1.6, 0.6 + Math.random() * 1.4);
      this.add.emit(p, v, t0, 0.18 + Math.random() * 0.22, col, 0.006 + Math.random() * 0.004, 1, 3, 4);
    }
  }

  burstOpen(t0) {
    const L = this.lightCol.clone();
    const top = C.Hb + 0.05;
    // Sparks fountain.
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 2.4;
      const col = L.clone().multiplyScalar(2.5 + Math.random() * 3);
      this.add.emit(this._v.set((Math.random() - 0.5) * C.W * 0.7, top, (Math.random() - 0.5) * C.D * 0.6), this._v2.set(Math.cos(a) * s * 0.6, 2.5 + Math.random() * 3.5, Math.sin(a) * s * 0.4 + 0.3), t0, 0.7 + Math.random() * 0.9, col, 0.012 + Math.random() * 0.014, 1, 1.6, 4.5);
    }
    // Glints (soft) drifting up in the beam.
    for (let i = 0; i < 70; i++) {
      this.add.emit(this._v.set((Math.random() - 0.5) * 0.6, top + Math.random() * 0.2, (Math.random() - 0.5) * 0.4), this._v2.set((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 1.1, (Math.random() - 0.5) * 0.3), t0 + Math.random() * 0.6, 1.4 + Math.random() * 1.2, L.clone().multiplyScalar(1.2), 0.025 + Math.random() * 0.03, 0, 0.6, -0.05);
    }
    // Snow spilling over the rim.
    const snow = new THREE.Color(1.9, 1.95, 2.1);
    for (let i = 0; i < 160; i++) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const alongX = Math.random() < 0.6;
      const p = alongX ? this._v.set((Math.random() - 0.5) * C.W, top, side * C.D * 0.45) : this._v.set(side * C.W * 0.45, top, (Math.random() - 0.5) * C.D);
      const out = alongX ? this._v2.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.6, side * (0.3 + Math.random() * 0.9)) : this._v2.set(side * (0.3 + Math.random() * 0.9), 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4);
      this.alpha.emit(p, out, t0 + Math.random() * 0.15, 0.9 + Math.random() * 0.8, snow, 0.008 + Math.random() * 0.016, 4, 1.2, 5.5);
    }
  }

  revealBurst(t0) {
    const R = this.rarity, rank = R.rank;
    const gold = R.id === 'gold';
    const y = this.gear ? 0.62 + (this.itemLen || 1.6) / 2 : this.slotFocus().y;
    const z = this.gear ? 0 : -0.1;
    const col = this.rcol;
    const nSpark = [30, 50, 90, 150, 240, 380][rank] ?? 60;
    for (let i = 0; i < nSpark; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.8;
      const s = 1.2 + Math.random() * (2 + rank * 0.8);
      const v = this._v2.set(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s * 0.6);
      const c = (i % 3 === 0 ? new THREE.Color(1, 1, 1) : col.clone()).multiplyScalar(2.2 + Math.random() * 2);
      const kind = gold && i % 3 === 0 ? 2 : rank >= 4 && i % 5 === 0 ? 2 : 1;
      this.add.emit(this._v.set(0, y, z), v, t0, 0.8 + Math.random() * (0.6 + rank * 0.2), c, kind === 2 ? 0.05 : 0.014 + Math.random() * 0.012, kind, 1.8, 2.2);
    }
    // Confetti (pink and up) — paper in the rarity colour, white and gold.
    const nConf = rank >= 3 ? [0, 0, 0, 90, 160, 260][rank] : 0;
    const confCols = gold ? ['#ffd24a', '#fff2b0', '#e4ae39', '#ffffff'] : [R.color, '#ffffff', R.color, '#ffe36a'];
    for (let i = 0; i < nConf; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.4;
      this.alpha.emit(this._v.set((Math.random() - 0.5) * 0.4, y + 0.3, z), this._v2.set(Math.cos(a) * s, 2 + Math.random() * 2.5, Math.sin(a) * s * 0.5), t0, 2 + Math.random() * 1.6, new THREE.Color(confCols[i % confCols.length]), 0.03 + Math.random() * 0.02, 3, 1.4, 1.3);
    }
    // Snow poof where the crate was (clothing) or out of the crate (gear).
    const snow = new THREE.Color(1.9, 1.95, 2.1);
    const nSnow = this.gear ? 60 : 140;
    for (let i = 0; i < nSnow; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.8;
      this.alpha.emit(this._v.set(Math.cos(a) * 0.3, 0.25 + Math.random() * 0.3, Math.sin(a) * 0.25), this._v2.set(Math.cos(a) * s, 0.8 + Math.random() * 2, Math.sin(a) * s), t0, 0.7 + Math.random() * 0.8, snow, 0.015 + Math.random() * 0.03, 4, 2.2, 3.5);
    }
  }

  // ---------------------------------------------------------------- camera
  /** Shot → root-local camera position: look at `tgt`, framing height `h`, pitch / yaw in degrees. */
  shotPose(tgt, h, pitch, yaw, w = h, out = {}) {
    const fov = (this.stage.camera.fov * Math.PI) / 180;
    // Fit the height h and the width w (portrait phones are narrow: the width wins there).
    const { w: W, h: H } = this.stage.size;
    const th = Math.tan(fov / 2);
    const d = Math.max(h / (2 * th), w / (2 * th * (W / H)));
    const p = pitch * DEG, yw = yaw * DEG;
    out.look = new THREE.Vector3(...tgt);
    out.pos = out.look.clone().add(new THREE.Vector3(Math.sin(yw) * Math.cos(p) * d, Math.sin(p) * d, Math.cos(yw) * Math.cos(p) * d));
    return out;
  }

  placeCamera(cam, t, dt) {
    const T = this.o.timing, o = this.o;
    const st = this.stage;
    const drift = reduced() ? 0 : Math.sin(t * 0.35) * 4;
    // Key shots (root-local), blended over the timeline.
    const sDrop = this.shotPose([0, 0.32, 0], 1.65, 15, -10 + drift, 1.7);
    const sPush = this.shotPose([0, 0.36, 0], 1.42, 18, 4 + drift * 0.5, 1.3);
    const sBurst = this.shotPose([0, 0.55, 0], 1.8, 16, 2 + drift * 0.5, 1.4);
    const sReel = this.shotPose([0, 0.92, 0], 2.55, 12, drift, 1.4);
    let pose = sDrop;
    const mix = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k) });
    pose = mix(sDrop, sPush, smooth(T.land, T.lid, t));
    if (t >= T.lid) pose = mix(pose, sBurst, easeOut3((t - T.lid) / 0.35));
    if (t >= T.lid + 0.3) pose = mix(pose, sReel, smooth(T.lid + 0.3, T.spin + 0.2, t));
    let offX = 0, offY = 0;
    if (o.revealAt != null && t >= o.revealAt) {
      const k = easeOut3((t - o.revealAt) / 0.7);
      let sRev;
      // Tall screens: the text panel takes the lower ~45 %, so frame the subject into the top part.
      const tall = st.size.w / st.size.h <= 1.15 ? 1.7 : 1;
      if (this.gear) sRev = this.shotPose([0, 0.62 + (this.itemLen || 1.6) / 2, 0], ((this.itemLen || 1.6) + 0.9) * tall, 8, drift * 1.5, 0.9);
      else { const f = this.slotFocus(); sRev = this.shotPose([0, f.y, 0], (f.h + 0.25) * tall, 6, drift * 1.5, Math.max(0.75, f.h * 0.75)); }
      pose = mix(pose, sRev, k);
      // Lens shift: the subject sits left of centre on wide screens (the text panel is on the right).
      const { w: W, h: H } = st.size;
      // (Tall screens: the panel is at the bottom, so the subject moves up instead.)
      if (W / H > 1.15) offX = W * 0.15 * k; else offY = H * 0.22 * k;
    }
    // Opening blend from the lobby camera.
    const root = st.root;
    const pos = root.localToWorld(pose.pos.clone());
    const look = root.localToWorld(pose.look.clone());
    const b = easeOut3(t / (o.quick ? 0.35 : 0.8));
    if (b < 1) { pos.lerp(this.from.pos, 1 - b); look.lerp(this.from.look, 1 - b); }
    // Shake (trauma²), a touch of roll.
    const tr = reduced() ? 0 : this.trauma * this.trauma;
    if (tr > 0) {
      const n = (s) => Math.sin(t * 61 + s) * 0.6 + Math.sin(t * 37 + s * 2.1) * 0.4;
      pos.x += n(1) * 0.035 * tr; pos.y += n(2) * 0.03 * tr; look.x += n(3) * 0.02 * tr;
    }
    cam.position.copy(pos);
    cam.up.set(Math.sin(t * 47) * 0.03 * tr, 1, 0).normalize();
    cam.lookAt(look);
    // FOV punch at the burst and at a big reveal.
    let fov = this.fov0;
    if (t >= T.lid) fov -= 2.2 * Math.exp(-(t - T.lid) * 5) * Math.sin(Math.min(Math.PI, (t - T.lid) * 12));
    cam.fov = fov;
    const { w: W, h: H } = st.size;
    if (offX || offY) cam.setViewOffset(W, H, offX, offY, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.lastPose = { pos: pos.clone(), look: look.clone(), fov };
    // Particle size scale (pixels per metre at 1 m).
    const px = (this.renderer.domElement.height || H) / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.mat.uniforms.uPx.value = px;
    this.alpha.mat.uniforms.uPx.value = px;
    this.snowU.uPx.value = px;
  }
}

export const crateShow = new CrateShow();
if (typeof window !== 'undefined') window.__senditCrate = crateShow;
