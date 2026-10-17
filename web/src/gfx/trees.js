// Conifers: snow-loaded Norway / Engelmann spruce and a rounder fir, procedurally built.
//  LOD0 (near): whorls of drooping needle-frond cards (alpha-tested procedural needle texture),
//    volumetric normals, snow sitting on the upper side of every branch, trunk, wind sway.
//  LOD1 (mid): fewer, larger fronds around a dark core.
//  LOD2 (far): lumpy cone stack with the same snow / colour logic (no alpha).
// Near / mid LODs are dynamic pools refilled around the camera every few metres; the far LOD is static
// per 750 m cell. No LOD ever pops: every instance computes, from the live camera position, where it is
// in the hand-over bands (near -> mid -> far shell -> faded out) and the two neighbouring LODs cross-fade
// with complementary screen-door dither (each pixel is drawn by exactly one of them). Pools always hold
// every tree that can be visible before the next refill, and the shadow pass uses the same dither, so
// shadows hand over too. Tunables: TREES in scene.js; distances / bands per quality: PERF in perf.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32, globals, SUN_DIR } from '../world.js';
import { TREES } from '../scene.js';
import { PERF, perfQ } from './perf.js';

const CELL = 750;
const TREES_LOD1_WIDEN = 1.25;   // LOD1 keeps every other frond card, a little wider

// ---------------------------------------------------------------- textures
/** Needle frond (RGBA): a twig along u with needles fanning out; alpha cut-out, tapered outline. */
function makeNeedleTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(77);
  g.clearRect(0, 0, size, size);
  // Two fronds per texture row band (v 0..0.5 and 0.5..1) for variety.
  for (let band = 0; band < 2; band++) {
    const y0 = band * size / 2, h = size / 2;
    const cy = y0 + h / 2;
    const width = (u) => Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.42 * h * (1 - u * 0.35);
    // Side twigs (fishbone): needles grow along each twig, so the frond is ragged with gaps, not a leaf.
    const twigs = [];
    for (let k = 0; k < 16; k++) {
      const u0 = 0.04 + k * 0.058 + rnd() * 0.03;
      const side = k % 2 ? 1 : -1;
      const reach = width(u0) * (0.75 + rnd() * 0.45);
      const ang = side * (0.75 + rnd() * 0.35);
      const tl = reach / Math.sin(Math.abs(ang));
      const x0 = u0 * size, x1 = x0 + Math.cos(Math.abs(ang)) * tl, y1 = cy + Math.sin(ang) * tl;
      twigs.push([x0, cy, x1, y1]);
      g.strokeStyle = 'rgba(60,45,30,1)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, y1); g.stroke();
    }
    // needles: mostly along the twigs, some along the main axis
    for (let n = 0; n < 3000; n++) {
      let x, y, dirA;
      if (rnd() < 0.82) {
        const t = twigs[Math.floor(rnd() * twigs.length)], f = rnd();
        x = t[0] + (t[2] - t[0]) * f; y = t[1] + (t[3] - t[1]) * f;
        dirA = Math.atan2(t[3] - t[1], t[2] - t[0]);
      } else {
        const u = rnd(); x = u * size; y = cy + (rnd() - 0.5) * 6; dirA = 0;
        if (width(u) < 3) continue;
      }
      const ang = dirA + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6);
      const len = 3 + rnd() * 5;
      const shade = 0.55 + rnd() * 0.45;
      const r = Math.round(26 * shade), gg = Math.round(58 * shade), b = Math.round(36 * shade);
      g.strokeStyle = `rgba(${r},${gg},${b},1)`;
      g.lineWidth = 1.1 + rnd() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
    g.strokeStyle = 'rgba(70,50,32,1)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, cy); g.lineTo(size * 0.97, cy); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------- geometry
/**
 * One branch: a drooping frond card along local +x (top side catches snow, aUnder = 0) plus a
 * skirt of hanging needles below it (aUnder = 1) so the crown reads dense from the side.
 * Single-sided geometry, rendered double-sided (back faces get flipped normals → dark undersides).
 */
function branchGeo(len, width, droop, curl, segs, band, skirt) {
  const pos = [], uv = [], under = [], nrm = [], ao = [];
  const idx = [];
  const yAt = (s) => -droop * Math.pow(s, 1.6) * len + curl * Math.pow(s, 3) * len;
  let base = 0;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    for (let j = 0; j < 2; j++) {
      const z = (j - 0.5) * width * (1 - s * 0.35);
      pos.push(s * len, yAt(s) + (j - 0.5) * width * 0.06, z);
      uv.push(s, band * 0.5 + j * 0.5);
      under.push(0);
      const n = new THREE.Vector3(0.9 * s, 1.0, (j - 0.5) * 0.7).normalize();
      nrm.push(n.x, n.y, n.z);
      ao.push(0.35 + 0.65 * Math.pow(s, 0.7));
    }
  }
  for (let i = 0; i < segs; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  if (skirt) {
    base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const s = 0.12 + 0.88 * i / segs;
      const hs = width * 0.55 * (1 - s * 0.45);
      const y = yAt(s);
      pos.push(s * len, y + 0.02, 0, s * len + hs * 0.15, y - hs, 0);
      uv.push(s, band * 0.5 + 0.5, s, band * 0.5 + 0.02);
      under.push(1, 1);
      const n = new THREE.Vector3(0.75, 0.45, 0).normalize();
      nrm.push(n.x, n.y, n.z, n.x, n.y * 0.4, n.z);
      ao.push(0.3 + 0.5 * s, 0.25 + 0.45 * s);
    }
    for (let i = 0; i < segs; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aUnder', new THREE.Float32BufferAttribute(under, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return g;
}

function trunkGeo(h, r0, r1, sides = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 1, true);
  g.translate(0, h / 2 - 0.4, 0);
  const n = g.attributes.position.count;
  g.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(2), 1));   // 2 = bark
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.6), 1));
  // uv: bark region of the texture is not used; keep any value
  return g;
}

/**
 * Spruce / fir crown built from whorls of frond cards. kind 0 = spruce (narrow, drooping), 1 = fir.
 * LOD1 is the same tree (same seed, same cards) with every other card left out and the rest a
 * little wider, so the two LODs look alike and their cross-fade is invisible: half the cards are
 * identical in both, only the dropped ones dissolve.
 */
function crownGeometry(kind, lod, seed) {
  const rnd = mulberry32(seed);
  const H = TREES.height;
  const parts = [trunkGeo(H * 0.92, 0.2, 0.03, 7)];
  const whorls = 19;
  const per = 6;
  const segs = 2;
  const wMul = lod === 0 ? 1 : TREES_LOD1_WIDEN;
  for (let w = 0; w < whorls; w++) {
    const t = (w + rnd() * 0.4) / whorls;
    const y = 1.0 + t * (H - 1.6);
    const prof = kind === 0 ? Math.pow(1 - t, 0.95) : Math.pow(1 - t, 0.75) * (0.85 + 0.15 * Math.sin(t * 3.1));
    const L = (kind === 0 ? 2.5 : 2.9) * prof + 0.35;
    for (let b = 0; b < per; b++) {
      const yaw = (b / per) * Math.PI * 2 + w * 0.9 + rnd() * 0.5;
      const droop = (kind === 0 ? 0.42 : 0.18) * (0.7 + 0.6 * (1 - t)) + rnd() * 0.1;
      const len = L * (0.85 + rnd() * 0.3);
      const rx = (rnd() - 0.5) * 0.35, rz = (rnd() - 0.5) * 0.14;   // (always drawn: LOD1 stays in step with LOD0)
      const odd = (w + b) % 2 === 1;
      if (lod === 1 && odd) continue;
      // Spruce: lower branches sweep down, the top ones reach up; fir branches stay level.
      const upTop = Math.max(0, (t - 0.72) / 0.28);
      const place = (g) => {
        g.rotateX(rx);
        g.rotateZ((kind === 0 ? -(0.12 + 0.3 * (1 - t)) : 0.06) * (1 - upTop) + upTop * 0.75 + rz);
        g.rotateY(yaw);
        g.translate(0, y, 0);
        return g;
      };
      const width = L * 0.78 * (lod === 0 || odd ? 1 : TREES_LOD1_WIDEN);
      const card = place(branchGeo(len, width, droop, kind === 0 ? 0.12 : 0.05, segs, (w + b) % 2, true));
      // Geomorph target (aMorph3 = delta in object space, applied x the hand-over progress):
      //  LOD0: odd cards retract into the trunk, even cards widen to their LOD1 width -> exactly LOD1.
      //  LOD1: every card retracts into the trunk (the far cone is already there).
      const pa = card.attributes.position, d = new Float32Array(pa.count * 3);
      if (lod === 0 && !odd) {
        const wide = place(branchGeo(len, L * 0.78 * TREES_LOD1_WIDEN, droop, kind === 0 ? 0.12 : 0.05, segs, (w + b) % 2, true)).attributes.position;
        for (let k = 0; k < pa.count; k++) for (let c = 0; c < 3; c++) d[k * 3 + c] = wide.array[k * 3 + c] - pa.array[k * 3 + c];
      } else {
        for (let k = 0; k < pa.count; k++) { d[k * 3] = -pa.getX(k); d[k * 3 + 1] = y - pa.getY(k); d[k * 3 + 2] = -pa.getZ(k); }
      }
      card.setAttribute('aMorph3', new THREE.Float32BufferAttribute(d, 3));
      parts.push(card);
    }
  }
  {
    // Dark inner core (needle mass deep in the crown): hides the trunk, no see-through gaps.
    const core = new THREE.ConeGeometry((kind === 0 ? 1.7 : 2.0) * 0.62, H * 0.86, 9, 1, true);   // same in both LODs
    core.translate(0, H * 0.43 + 0.9, 0);
    const n = core.attributes.position.count;
    core.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(3), 1));   // 3 = core
    core.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.3), 1));
    parts.push(core);
    // Leader: the slim spire at the very top.
    const lead = new THREE.ConeGeometry(0.32, H * 0.2, 6, 1, true);
    lead.translate(0, H * 0.9 + 0.2, 0);
    const m = lead.attributes.position.count;
    lead.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(m).fill(3), 1));
    lead.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(m).fill(0.55), 1));
    parts.push(lead);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripTo));
}

/** Far LOD: a lumpy cone stack, no alpha. aUnder = 4 marks the far shell. */
function farGeometry(kind, seed) {
  const rnd = mulberry32(seed);
  const H = TREES.height;
  const parts = [trunkGeo(2.0, 0.22, 0.15, 3)];
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (kind === 0 ? 2.4 : 2.8) * Math.pow(1 - t, 0.9) + 0.35;
    const h = (H / tiers) * 1.7;
    const y = 1.0 + t * (H - 2.2);
    const cone = new THREE.ConeGeometry(r, h, 6, 1, true);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) < 0) {
        const a = Math.atan2(p.getZ(k), p.getX(k));
        const j = 1 + 0.16 * Math.sin(a * 5 + i * 2 + rnd());
        p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); p.setY(k, p.getY(k) - 0.3 * Math.abs(Math.sin(a * 3 + i)));
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y + h / 2, 0);
    const n = p.count;
    cone.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(4), 1));
    const ao = new Float32Array(n);
    for (let k = 0; k < n; k++) ao[k] = p.getY(k) > y + h * 0.4 ? 0.95 : 0.55;
    cone.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
    parts.push(cone);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripTo));
}

function stripTo(g) {
  // Make every part carry the same attribute set.
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.aMorph3) g.setAttribute('aMorph3', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aUnder', 'aAO', 'aMorph3'].includes(k)) g.deleteAttribute(k);
  return g;
}

// ---------------------------------------------------------------- material
// LOD hand-over (shared by the colour and shadow-depth shaders). uLodA = (near, near band, mid, mid band),
// uLodB = (far, far band, shadow range, -), uLodEye = live camera position. TREE_LOD 0 / 1 / 2 picks the
// band edges this LOD is drawn between; vDither = (lo, hi): a pixel is drawn when lo <= dither < hi.
const LOD_PARS = /* glsl */`
uniform vec4 uLodA; uniform vec4 uLodB; uniform vec3 uLodEye;
varying vec2 vDither;
`;
const LOD_ATTR = 'attribute vec3 aMorph3;\n';   // vertex shaders only
// Colour pass: no dither. LOD0 geomorphs into LOD1 across the near band (odd cards retract, even cards
// widen) and swaps at the band's end where the two are identical; LOD1 retracts its cards into the
// already-present far cone across the mid band. Shadow pass: the same morph plus a complementary
// dither between the frond caster and the shadow cone, which the PCF filter turns into a soft blend.
const LOD_VERT = /* glsl */`
  {
    float tD = distance(ip.xz, uLodEye.xz);
    float tN = clamp((tD - uLodA.x + 0.5 * uLodA.y) / uLodA.y, 0.0, 1.0);
    float tM = clamp((tD - uLodA.z + 0.5 * uLodA.w) / uLodA.w, 0.0, 1.0);
    float tF = clamp((tD - uLodB.x + uLodB.y) / uLodB.y, 0.0, 1.0);
    bool tKeep = true;
    vDither = vec2(0.0, 2.0);
    #if TREE_LOD == 0
      transformed += aMorph3 * tN;
      tKeep = tN < 1.0;
      #ifdef TREE_SHADOW
        vDither = vec2(tN, 2.0);
      #endif
    #elif TREE_LOD == 1
      transformed += aMorph3 * tM;
      tKeep = tN >= 1.0 && tM < 1.0;
    #elif TREE_LOD == 2
      // Far shells stay opaque (no discard: early-z for thousands of them). Each one is complete as
      // soon as its tree enters the mid band, inside the mid fronds that retract around it, and at
      // the far end it shrinks into the snow (2-3 px at that range).
      tKeep = tM > 0.0 && tF < 1.0;
      transformed *= 1.0 - tF;
    #elif TREE_LOD == 3
      tKeep = tN > 0.0;   // shadow-only cone: casts where the near fronds hand over
      vDither = vec2(0.0, tN);
    #endif
    #ifdef TREE_SHADOW
      if (tD > uLodB.z) tKeep = false;      // beyond the shadow box: no caster
    #endif
    if (!tKeep) transformed = vec3(0.0, -1e4, 0.0);   // not this LOD: no fragments
  }
`;
// Shadow pass only: interleaved gradient noise as a stable per-pixel threshold (screen-door).
const LOD_FRAG = /* glsl */`
  {
    float hd = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (hd < vDither.x || hd >= vDither.y) discard;
  }
`;
const VERT_PARS = /* glsl */`
attribute float aUnder; attribute float aAO;
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
` + LOD_ATTR + LOD_PARS;
const VERT_PRE = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  vUnder = aUnder; vAO = aAO; vH = position.y; vTUv = uv;
  vSeed = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
  // Wind: slow trunk sway + faster branch-tip flutter.
  float bend = max(position.y - 1.5, 0.0) * 0.08;
  float sway = sin(uTime * uWind.x * 0.7 + ip.x * 0.05 + ip.z * 0.07) * uWind.y * 0.6;
  transformed.x += sway * bend * bend * 6.0;
  transformed.z += cos(uTime * uWind.x * 0.55 + ip.z * 0.05) * uWind.y * 0.4 * bend * bend * 6.0;
  float tip = length(position.xz);
  transformed.y += sin(uTime * 2.3 + ip.x + position.y * 1.7) * 0.03 * tip * step(aUnder, 1.5);
` + LOD_VERT;
const FRAG_PARS = LOD_PARS + /* glsl */`
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
float th1(float n) { return fract(sin(n) * 43758.5453); }
float tvn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(mix(mix(th1(n), th1(n + 1.0), f.x), mix(th1(n + 57.0), th1(n + 58.0), f.x), f.y),
             mix(mix(th1(n + 113.0), th1(n + 114.0), f.x), mix(th1(n + 170.0), th1(n + 171.0), f.x), f.y), f.z);
}
uniform vec3 uNeedle; uniform vec3 uNeedle2; uniform vec3 uBark; uniform vec3 uTreeSnow; uniform float uSnowLoad;
vec3 tTreeN = vec3(0.0, 1.0, 0.0); float tTreeNW = 0.0; float tNeedle = 0.0;
`;
const FRAG = /* glsl */`
{
  float under = vUnder;
  #ifdef USE_MAP
  {
    // Keep foliage coverage at distance: boost alpha with the mip level, then sharpen the edge.
    vec2 tdx = dFdx(vMapUv * 256.0), tdy = dFdy(vMapUv * 256.0);
    float lvl = max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy))));
    float a = diffuseColor.a * (1.0 + lvl * 0.38);
    diffuseColor.a = clamp((a - 0.42) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  }
  #endif
  vec3 green = mix(uNeedle, uNeedle2, vSeed) * (0.85 + 0.3 * fract(vSeed * 7.31));
  vec3 base = diffuseColor.rgb;           // texture colour (needles) where mapped
  bool bark = under > 1.5 && under < 2.5;
  bool shell = under > 2.5;
  vec3 col = bark ? uBark : (shell ? green * (under < 3.5 ? 0.7 : 1.0) : green * clamp(base.g / 0.03, 0.45, 1.5));
  if (under > 1.5) diffuseColor.a = 1.0;   // trunk / core / far shell are solid
  // Snow: sits on the upper side of each branch (and the top of far shells), heavier per tree.
  float load = uSnowLoad * (0.4 + 0.8 * fract(vSeed * 3.71));
  float snow = 0.0;
  // (perf: the snow noise is only evaluated where snow can appear; same result as before)
  if (!bark) {
    if (shell) {
      float n = tvn(vW * 2.3) * 0.65 + tvn(vW * 7.1) * 0.35;
      float sh = smoothstep(0.05, 0.75, vWN.y + (n - 0.5) * 0.6);
      snow = sh * smoothstep(0.15, 0.8, load) * (under < 3.5 ? 0.7 : 0.9);
    } else if (under < 0.5 && gl_FrontFacing) {
      // Along the branch: a ridge of snow over the twig, thinning toward the tips and the edges.
      float across = abs(fract(vTUv.y * 2.0) - 0.5) * 2.0;
      float along = smoothstep(0.0, 0.25, vTUv.x) * (1.0 - smoothstep(0.65, 1.0, vTUv.x));
      float n = tvn(vW * 2.3) * 0.65 + tvn(vW * 7.1) * 0.35;
      float sv = load * (0.55 + 0.45 * along) * (1.15 - across * 0.6) + (n - 0.5) * 0.55;
      snow = smoothstep(0.42, 0.62, sv);
      // Snow is a solid pillow on the twig, not needle-shaped: it keeps its own soft outline.
      diffuseColor.a = max(diffuseColor.a, smoothstep(0.6, 0.66, sv));
      #ifdef USE_ALPHATEST
      if (diffuseColor.a < alphaTest) discard;   // perf: the alpha test would discard it anyway
      #endif
      // Pillow normal: domed across the branch, lumpy (lit tops, shaded flanks).
      if (snow > 0.0) {
        vec3 e = vec3(0.09, 0.0, 0.0);
        float c0 = tvn(vW * 6.0);
        vec3 gN = vec3(tvn(vW * 6.0 + e.xyz) - c0, tvn(vW * 6.0 + e.yxz) - c0, tvn(vW * 6.0 + e.yzx) - c0) / 0.09;
        tTreeN = normalize(vec3(0.0, 1.0, 0.0) + normalize(vWN) * (0.35 + across * 0.8) - gN * 0.18);
        tTreeNW = snow;
      }
    }
  }
  #ifdef USE_ALPHATEST
  if (diffuseColor.a < alphaTest) discard;
  #endif
  tNeedle = (!bark && !shell) ? (1.0 - snow) : 0.0;
  // Inner needle mass: not a flat dark cone — break it up into lighter / darker clumps.
  if (under > 2.5 && under < 3.5) col *= 0.55 + 0.9 * tvn(vW * 1.7) * tvn(vW * 4.3 + 3.0);
  col = mix(col, uTreeSnow, snow);
  col *= mix(vAO, 1.0, snow * 0.6);
  diffuseColor.rgb = col;
  toonDeepBias = (1.0 - vAO) * 0.35 * (1.0 - snow);
}
`;

function treeMaterial(opts) {
  const m = toonMaterial({
    name: opts.name, map: opts.map || null, alphaTest: opts.alphaTest ?? 0, side: opts.map ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uNeedle: { value: new THREE.Color(TREES.needle) }, uNeedle2: { value: new THREE.Color(TREES.needle2) },
      uBark: { value: new THREE.Color(TREES.bark) }, uTreeSnow: { value: new THREE.Color(TREES.snow) },
      uSnowLoad: { value: TREES.snowLoad }, ...opts.lod,
    },
    vertPars: VERT_PARS, vertPre: VERT_PRE, fragPars: FRAG_PARS, frag: FRAG,
    // Backlit needles: thin needle sprays at the branch tips glow when the sun is behind the tree.
    band: /* glsl */`
      {
        float back = pow(max(dot(-normalize(vViewPosition), sunV), 0.0), 5.0);
        light += uSunCol * vec3(0.7, 0.85, 0.45) * back * tNeedle * pow(vAO, 3.0) * mix(0.35, 1.0, shadow) * ${TREES.translucency.toFixed(2)};
      }`,
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n  if (tTreeNW > 0.0) normal = normalize(mix(normal, (viewMatrix * vec4(tTreeN, 0.0)).xyz, tTreeNW));');
  };
  m.defines = { TREE_LOD: opts.lodLevel };
  m.userData.far = opts.lodLevel === 2;
  return m;
}

/** Shadow-depth material for a frond pool: same sway, alpha cut-out and LOD dither as the colour pass. */
function treeDepthMaterial(lodLevel, lod) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.name = 'treeDepth' + lodLevel;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lod, { uTime: globals.uTime, uWind: globals.uWind });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;\n' + LOD_ATTR + LOD_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  {
    float bend = max(position.y - 1.5, 0.0) * 0.08;
    float sway = sin(uTime * uWind.x * 0.7 + ip.x * 0.05 + ip.z * 0.07) * uWind.y * 0.6;
    transformed.x += sway * bend * bend * 6.0;
    transformed.z += cos(uTime * uWind.x * 0.55 + ip.z * 0.05) * uWind.y * 0.4 * bend * bend * 6.0;
  }
  ${LOD_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LOD_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + LOD_FRAG);
  };
  m.defines = { TREE_LOD: lodLevel, TREE_SHADOW: 1 };
  m.customProgramCacheKey = () => 'treeDepth' + lodLevel;
  return m;
}

// ---------------------------------------------------------------- system
const GRID = 32;   // metres: spatial hash for fast near-pool refills

export class TreeSystem {
  constructor(group) {
    this.group = group;
    this.trees = [];            // [x, y, z, yaw, sx, sy, sz, kind]
    // LOD hand-over uniforms (shared by every tree material; see LOD_VERT).
    this.lod = {
      uLodA: { value: new THREE.Vector4(58, 10, 420, 40) },
      uLodB: { value: new THREE.Vector4(4500, 400, 120, 0) },
      uLodEye: { value: new THREE.Vector3() },
    };
    this.lastNear = new THREE.Vector3(1e9, 0, 0);
    this.lastFar = new THREE.Vector3(1e9, 0, 0);
    this.setQuality(2);
    this.cells = [];
    const tex = makeNeedleTexture();
    this.tex = tex;
    this.mats = {
      lod0: treeMaterial({ name: 'spruceNear', map: tex, alphaTest: 0.5, lod: this.lod, lodLevel: 0 }),
      lod1: treeMaterial({ name: 'spruceMid', map: tex, alphaTest: 0.5, lod: this.lod, lodLevel: 1 }),
      far: treeMaterial({ name: 'spruceFar', lod: this.lod, lodLevel: 2 }),
    };
    this.depthMats = { lod0: treeDepthMaterial(0, this.lod), shell: treeDepthMaterial(3, this.lod) };
    this.geos = [0, 1].map((k) => ({
      lod0: crownGeometry(k, 0, 11 + k), lod1: crownGeometry(k, 1, 11 + k), lod2: farGeometry(k, 31 + k),
    }));
  }

  /** Backwards-compatible handle: `last` resets every pool refill. */
  get last() { return { set: (x, y, z) => { this.lastNear.set(x, y, z); this.lastFar.set(x, y, z); } }; }

  add(x, y, z, yaw, sx, sy, sz, kind) { this.trees.push([x, y, z, yaw, sx, sy, sz, kind]); }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // Static far LOD per cell per kind.
    const buckets = new Map();
    this.cellOf = new Int32Array(this.trees.length);
    this.grid = new Map();
    this.trees.forEach((t, i) => {
      const key = `${t[7]}|${Math.floor(t[0] / CELL)}|${Math.floor(t[2] / CELL)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
      const gk = `${Math.floor(t[0] / GRID)},${Math.floor(t[2] / GRID)}`;
      if (!this.grid.has(gk)) this.grid.set(gk, []);
      this.grid.get(gk).push(i);
    });
    this.matrices = this.trees.map((t) => m.compose(p.set(t[0], t[1], t[2]), q.setFromAxisAngle(up, t[3]), s.set(t[4], t[5], t[6])).clone());
    for (const [key, list] of buckets) {
      const kind = Number(key.split('|')[0]);
      const im = new THREE.InstancedMesh(this.geos[kind].lod2, this.mats.far, list.length);
      let cx = 0, cz = 0;
      list.forEach((ti, i) => {
        const t = this.trees[ti];
        im.setMatrixAt(i, this.matrices[ti]);
        cx += t[0]; cz += t[2];
        this.cellOf[ti] = this.cells.length;
      });
      im.computeBoundingSphere();
      const c = new THREE.Vector2(cx / list.length, cz / list.length);
      let r = 0;
      for (const ti of list) r = Math.max(r, Math.hypot(this.trees[ti][0] - c.x, this.trees[ti][2] - c.y));
      im.castShadow = false; im.receiveShadow = true;
      im.userData = { center: c, radius: r };
      im.name = 'TreesFar';
      this.group.add(im);
      this.cells.push(im);
    }
    // Dynamic pools. Capacity = every tree of the kind, so a dense forest never runs out (an over-full
    // pool used to leave holes that filled in as you came closer).
    const perKind = [0, 0];
    for (const t of this.trees) perKind[t[7]]++;
    this.pools = [];
    const mk = (lod, kind, geo, mat, depth, name) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, perKind[kind]));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.castShadow = !!depth;
      if (depth) im.customDepthMaterial = depth;
      im.userData.shadowCount = 0;
      im.renderOrder = PERF.treesFirst ? -1 : 0;   // perf: trees before the terrain, so its heavy shader skips pixels they cover
      im.name = name;
      this.group.add(im);
      const pool = { im, lod, kind };
      this.pools.push(pool);
      return pool;
    };
    for (const kind of [0, 1]) {
      // Near fronds: drawn, and cast their own (dithered) shadows; shadow pass draws the first
      // `shadowCount` instances (the pool is sorted near -> far).
      const p0 = mk('lod0', kind, this.geos[kind].lod0, this.mats.lod0, this.depthMats.lod0, `Trees_lod0_${kind}`);
      p0.im.onBeforeShadow = () => { p0.im.userData.n = p0.im.count; p0.im.count = p0.im.userData.shadowCount; };
      p0.im.onAfterShadow = () => { p0.im.count = p0.im.userData.n; };
      mk('lod1', kind, this.geos[kind].lod1, this.mats.lod1, null, `Trees_lod1_${kind}`);
      // Shadow-only cones for every tree beyond the near fronds inside the shadow range (cheap and
      // soft-filtered anyway): main pass draws none of them.
      const ps = mk('shell', kind, this.geos[kind].lod2, this.mats.far, this.depthMats.shell, `Trees_shadow_${kind}`);
      ps.im.onBeforeRender = () => { ps.im.userData.n = ps.im.count; ps.im.count = 0; };
      ps.im.onAfterRender = () => { ps.im.count = ps.im.userData.n; };
    }
    this.member = new Uint8Array(this.trees.length);   // bit 0: near pool, bit 1: mid pool, bit 2: shadow cone
  }

  /**
   * Hand-over distances for a quality tier (PERF.trees), optionally scaled by a dense map's hint
   * ({ treeNear, treeMid }). Each band ends where the old hard switch was, so the cost stays the same.
   */
  setQuality(q, hint = null) {
    const Q = perfQ(q), P = PERF.trees[Q];   // perf tiers: gfx/perf.js
    // The light-space shadow box (±box) reaches box / sin(elevation) along the sun's azimuth on the
    // ground; + a crown and the camera's offset behind the rider.
    this.shadowR = PERF.shadow[Q].box / Math.max(0.2, SUN_DIR.y) + 18;
    const nearEnd = Math.max(P.minNear, TREES.nearRadius * P.near * (hint?.treeNear ?? 1));
    const nb = Math.max(2, nearEnd * P.nearBand);
    const near = nearEnd - nb * 0.5;
    let midEnd = Math.max(TREES.midRadius * P.mid * (hint?.treeMid ?? 1), P.minMid);
    const mb = Math.max(4, midEnd * P.midBand);
    midEnd = Math.max(midEnd, nearEnd + mb);
    const mid = midEnd - mb * 0.5;
    this.near = near; this.mid = mid; this.far = P.far;
    this.lod.uLodA.value.set(near, nb, mid, mb);
    this.lod.uLodB.value.set(P.far, P.farBand, this.shadowR, 0);
    this.last.set(1e9, 0, 0);
  }

  update(cam) {
    this.lod.uLodEye.value.copy(cam);
    const far = this.far;
    for (const im of this.cells) {
      const c = im.userData.center;
      im.visible = Math.hypot(c.x - cam.x, c.y - cam.z) - im.userData.radius < far;
    }
    if (!this.pools) return;
    const nb = this.lod.uLodA.value.y, mb = this.lod.uLodA.value.w;
    const nearStep = PERF.treeRefill.near, farStep = PERF.treeRefill.far;
    // Near fronds: refilled every few metres from the spatial grid (tight margin = less vertex work).
    if (Math.hypot(cam.x - this.lastNear.x, cam.z - this.lastNear.z) >= nearStep) {
      this.lastNear.copy(cam);
      const out = this.near + nb * 0.5 + nearStep;
      const list = this.gather(cam, 0, out, true);
      const pools = this.pools.filter((p) => p.lod === 'lod0');
      this.fill(pools, list, cam, (d) => d < out, 0);
      for (const t of this._nearSet || []) this.member[t] &= ~1;
      for (const t of list) this.member[t] |= 1;
      this._nearSet = list;
    }
    // Mid fronds + shadow cones: refilled every `farStep` metres.
    if (Math.hypot(cam.x - this.lastFar.x, cam.z - this.lastFar.z) >= farStep) {
      this.lastFar.copy(cam);
      const midIn = this.near - nb * 0.5 - farStep, midOut = this.mid + mb * 0.5 + farStep;
      const shOut = this.shadowR + farStep;
      const list = this.gather(cam, Math.max(0, midIn), Math.max(midOut, shOut), true);
      this.member.fill(0);
      for (const t of this._nearSet || []) this.member[t] |= 1;
      this.fill(this.pools.filter((p) => p.lod === 'lod1'), list, cam, (d) => d <= midOut, 1);
      this.fill(this.pools.filter((p) => p.lod === 'shell'), list, cam, (d) => d <= shOut, 2);
    }
  }

  /** Indices of trees with min <= distance <= max, sorted near -> far. */
  gather(cam, min, max, sorted) {
    const out = this._gather || (this._gather = []);
    const ds = this._gd || (this._gd = new Float32Array(this.trees.length));
    out.length = 0;
    const g0x = Math.floor((cam.x - max) / GRID), g1x = Math.floor((cam.x + max) / GRID);
    const g0z = Math.floor((cam.z - max) / GRID), g1z = Math.floor((cam.z + max) / GRID);
    const useGrid = (g1x - g0x + 1) * (g1z - g0z + 1) < this.grid.size;
    const visit = (i) => {
      const t = this.trees[i], d = Math.hypot(t[0] - cam.x, t[2] - cam.z);
      if (d >= min && d <= max) { out.push(i); ds[i] = d; }
    };
    if (useGrid) {
      for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
        const a = this.grid.get(`${gx},${gz}`);
        if (a) for (const i of a) visit(i);
      }
    } else for (let i = 0; i < this.trees.length; i++) visit(i);
    if (sorted) out.sort((a, b) => ds[a] - ds[b]);
    this._dist = ds;
    return out.slice();
  }

  /** Fill pools (one per kind) with the listed trees that pass `keep`, in order. */
  fill(pools, list, cam, keep, bit) {
    const byKind = [pools.find((p) => p.kind === 0), pools.find((p) => p.kind === 1)];
    for (const p of pools) { p.im.count = 0; p.im.userData.shadowCount = 0; }
    const ds = this._dist, shadowOut = this.shadowR + PERF.treeRefill.far;
    for (const ti of list) {
      const d = ds[ti];
      if (!keep(d)) continue;
      const pool = byKind[this.trees[ti][7]];
      if (!pool) continue;
      pool.im.setMatrixAt(pool.im.count++, this.matrices[ti]);
      if (d < shadowOut) pool.im.userData.shadowCount = pool.im.count;
      if (bit) this.member[ti] |= 1 << bit;
    }
    for (const p of pools) {
      const a = p.im.instanceMatrix;
      a.clearUpdateRanges(); a.addUpdateRange(0, p.im.count * 16); a.needsUpdate = true;
    }
  }

  /**
   * Debug / pop-in metric (scripts/gfxpopin.mjs): each tree's continuous representation level
   * (0 = fronds .. 1 = mid .. 2 = far shell .. 3 = not drawn, fractions = cross-fade) and whether it
   * casts a shadow. A tree whose LOD should be drawn but isn't in its pool counts as "not drawn".
   */
  debugLevels(cam) {
    const n = this.trees.length, level = new Float32Array(n), cast = new Uint8Array(n);
    const [near, nb, mid, mb] = this.lod.uLodA.value.toArray(), far = this.lod.uLodB.value.x, fb = this.lod.uLodB.value.y;
    const c01 = (x) => Math.min(1, Math.max(0, x));
    for (let i = 0; i < n; i++) {
      const t = this.trees[i], d = Math.hypot(t[0] - cam.x, t[2] - cam.z);
      const tN = c01((d - near + nb / 2) / nb), tM = c01((d - mid + mb / 2) / mb), tF = c01((d - far + fb) / fb);
      let missing = false;
      if (tN < 1 && !(this.member[i] & 1)) missing = true;
      if (tN > 0 && tM < 1 && !(this.member[i] & 2)) missing = true;
      if (tM > 0 && tF < 1 && !this.cells[this.cellOf[i]].visible) missing = true;
      level[i] = missing ? 3 : tN + tM + tF;
      // Casts when inside the shadow range: near fronds, or the shadow cone once they hand over.
      const castsNear = tN < 1 && (this.member[i] & 1), castsCone = tN > 0 && (this.member[i] & 4);
      cast[i] = d < this.shadowR - 1 && (castsNear || castsCone) ? 1 : 0;
    }
    return { level, cast };
  }
}
