// Conifers: snow-loaded Norway / Engelmann spruce and a rounder fir, procedurally built.
//  Fronds (near): whorls of drooping needle-frond cards (alpha-tested procedural needle texture),
//    volumetric normals, snow sitting on the upper side of every branch, trunk, wind sway.
//  Impostor (everything beyond): one camera-facing card per tree showing pictures of that same frond
//    tree, baked at load time (gfx/trees.js bakeImpostors) from 12 directions x 3 elevations x 3 snow
//    loads per species: albedo (snow included) + normal + AO, so the card is lit live like the tree.
//  Shadows beyond the fronds: the impostor card again, turned to face the sun in the shadow pass, so it
//    casts the frond tree's own silhouette.
// There is exactly one hand-over, far from the rider (PERF.trees: 36 / 58 / 80 m by quality, never
// closer than 30 / 45 / 60 m on dense maps): fronds and impostor cross-fade with complementary
// screen-door dither over a band, each computed in the vertex shader from the live camera. Nothing
// grows, retracts or changes shape: snow, colour and needle density are the same in both, because
// the impostor is a picture of the frond tree with the same per-tree snow load (quantised to the
// baked load levels in both) and the same object-space snow noise. The near pool is refilled every
// few metres and always holds every tree up to the hand-over; impostors are static per 750 m cell
// and built for the whole map at load. Tunables: TREES in scene.js; distances per tier: PERF.trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32, globals, SUN_DIR } from '../world.js';
import { TREES } from '../scene.js';
import { PERF, perfQ } from './perf.js';

const CELL = 750;
// Distant fronds get more opaque with the texture mip level (keeps coverage, fewer flickering holes).
export const ALPHA_BOOST = { value: 0.38 };
// Impostor atlas layout. Frames are orthographic pictures of the tree (tree-local space, yaw 0) taken
// from NA azimuths x NE elevations (0, 22.5, 45 deg), for NL snow-load levels of each of the 2 kinds.
// The frame box (W x H metres, centred CY above the base) holds the whole crown from every view.
export const IMP = { NA: 12, NE: 3, NL: 3, FW: 120, FH: 200, W: 7.6, H: 12.8, CY: 5.8, EL: 22.5 * Math.PI / 180 };
const IMP_ROWS = 2 * IMP.NL * IMP.NE;
const f1 = (x) => Number(x).toFixed(4);
const IMP_DEFS = /* glsl */`
#define IMP_NA ${f1(IMP.NA)}
#define IMP_NE ${f1(IMP.NE)}
#define IMP_NL ${f1(IMP.NL)}
#define IMP_ROWS ${f1(IMP_ROWS)}
#define IMP_W ${f1(IMP.W)}
#define IMP_H ${f1(IMP.H)}
#define IMP_CY ${f1(IMP.CY)}
#define IMP_EL ${f1(IMP.EL)}
#define IMP_FW ${f1(IMP.FW)}
#define IMP_FH ${f1(IMP.FH)}
`;
// ---------------------------------------------------------------- textures
/** Needle frond (RGBA): a twig along u with needles fanning out; alpha cut-out, tapered outline. */
function makeNeedleTexture(size = 256) {
  // OffscreenCanvas in a worker (the loading scene, src/loading/, plants these trees too).
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(size, size);
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
 * The only 3D LOD; beyond the hand-over the impostor shows baked pictures of this same geometry.
 */
function crownGeometry(kind, seed) {
  const rnd = mulberry32(seed);
  const H = TREES.height;
  const parts = [trunkGeo(H * 0.92, 0.2, 0.03, 7)];
  const whorls = 19;
  const per = 6;
  const segs = 2;
  for (let w = 0; w < whorls; w++) {
    const t = (w + rnd() * 0.4) / whorls;
    const y = 1.0 + t * (H - 1.6);
    const prof = kind === 0 ? Math.pow(1 - t, 0.95) : Math.pow(1 - t, 0.75) * (0.85 + 0.15 * Math.sin(t * 3.1));
    const L = (kind === 0 ? 2.5 : 2.9) * prof + 0.35;
    for (let b = 0; b < per; b++) {
      const yaw = (b / per) * Math.PI * 2 + w * 0.9 + rnd() * 0.5;
      const droop = (kind === 0 ? 0.42 : 0.18) * (0.7 + 0.6 * (1 - t)) + rnd() * 0.1;
      const len = L * (0.85 + rnd() * 0.3);
      const rx = (rnd() - 0.5) * 0.35, rz = (rnd() - 0.5) * 0.14;
      // Spruce: lower branches sweep down, the top ones reach up; fir branches stay level.
      const upTop = Math.max(0, (t - 0.72) / 0.28);
      const g = branchGeo(len, L * 0.78, droop, kind === 0 ? 0.12 : 0.05, segs, (w + b) % 2, true);
      g.rotateX(rx);
      g.rotateZ((kind === 0 ? -(0.12 + 0.3 * (1 - t)) : 0.06) * (1 - upTop) + upTop * 0.75 + rz);
      g.rotateY(yaw);
      g.translate(0, y, 0);
      parts.push(g);
    }
  }
  {
    // Dark inner core (needle mass deep in the crown): hides the trunk, no see-through gaps.
    const core = new THREE.ConeGeometry((kind === 0 ? 1.7 : 2.0) * 0.62, H * 0.86, 9, 1, true);
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

function stripTo(g) {
  // Make every part carry the same attribute set.
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aUnder', 'aAO'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Impostor card: a unit quad (uv) whose vertex shader turns it to face the camera. The positions
 * only give three a bounding volume that holds the card from any direction (frustum culling). */
function impostorGeometry() {
  const g = new THREE.BufferGeometry();
  const r = IMP.W / 2, y0 = IMP.CY - IMP.H / 2, y1 = IMP.CY + IMP.H / 2;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-r, y0, -r, r, y0, r, r, y1, r, -r, y1, -r], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  g.boundingSphere.radius = Math.hypot(r * 1.42, IMP.H / 2);
  return g;
}

// ---------------------------------------------------------------- material
// LOD hand-over (shared by the colour and shadow-depth shaders). uLodA = (hand-over distance, band,
// far distance, far band), uLodB = (shadow range, -, -, -), uLodEye = live camera position.
// TREE_LOD 0 = fronds, 2 = impostor. vDither = (lo, hi): a pixel is drawn when
// lo <= dither < hi, so fronds and impostor (or, in the shadow pass, fronds and the impostor's sun-facing card) each draw
// complementary halves of the screen-door pattern across the band: no hole, no double coverage
// (in the shadow pass too: frond casters vs the impostor's sun-facing silhouette card).
const LOD_PARS = /* glsl */`
uniform vec4 uLodA; uniform vec4 uLodB; uniform vec3 uLodEye;
varying vec2 vDither;
`;
const LOD_VERT = /* glsl */`
  #ifndef IMP_BAKE
  {
    float tD = distance(ip.xz, uLodEye.xz);
    float tN = clamp((tD - uLodA.x + uLodA.y) / uLodA.y, 0.0, 1.0);
    float tF = clamp((tD - uLodA.z + uLodA.w) / uLodA.w, 0.0, 1.0);
    bool tKeep = true;
    vDither = vec2(0.0, 2.0);
    #if TREE_LOD == 0
      tKeep = tN < 1.0;
      vDither = vec2(tN, 2.0);
    #elif TREE_LOD == 2
      // Impostors stay complete out to the far distance, then shrink into the snow (2-3 px there).
      tKeep = tN > 0.0 && tF < 1.0;
      vDither = vec2(0.0, tN);
      transformed *= 1.0 - tF;
    #endif
    #ifdef TREE_SHADOW
      if (tD > uLodB.x) tKeep = false;      // beyond the shadow box: no caster
    #endif
    if (!tKeep) transformed = vec3(0.0, -1e4, 0.0);   // not this LOD: no fragments
  }
  #endif
`;
// Interleaved gradient noise as a stable per-pixel threshold (screen-door).
const LOD_FRAG = /* glsl */`
  {
    float hd = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (hd < vDither.x || hd >= vDither.y) discard;
  }
`;
const SWAY = /* glsl */`
  #ifndef IMP_BAKE
  {
    // Wind: slow trunk sway + faster branch-tip flutter (fronds only).
    float bend = max(swayY - 1.5, 0.0) * 0.08;
    float sway = sin(uTime * uWind.x * 0.7 + ip.x * 0.05 + ip.z * 0.07) * uWind.y * 0.6;
    transformed.x += sway * bend * bend * 6.0;
    transformed.z += cos(uTime * uWind.x * 0.55 + ip.z * 0.05) * uWind.y * 0.4 * bend * bend * 6.0;
  }
  #endif
`;
const VERT_PARS = IMP_DEFS + /* glsl */`
attribute float aUnder; attribute float aAO;
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
varying vec3 vLP; varying vec3 vRotX; varying vec3 vRotZ;
` + LOD_PARS;
const INSTANCE = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
    vRotX = normalize(instanceMatrix[0].xyz); vRotZ = normalize(instanceMatrix[2].xyz);
  #else
    vec3 ip = vec3(0.0);
    vRotX = vec3(1.0, 0.0, 0.0); vRotZ = vec3(0.0, 0.0, 1.0);
  #endif
  vSeed = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
`;
const VERT_PRE = INSTANCE + /* glsl */`
  vUnder = aUnder; vAO = aAO; vH = position.y; vTUv = uv; vLP = position;
  float swayY = position.y;
` + SWAY + /* glsl */`
  #ifndef IMP_BAKE
  {
    float tip = length(position.xz);
    transformed.y += sin(uTime * 2.3 + ip.x + position.y * 1.7) * 0.03 * tip * step(aUnder, 1.5);
  }
  #endif
` + LOD_VERT;
const FRAG_PARS = IMP_DEFS + LOD_PARS + /* glsl */`
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
varying vec3 vLP; varying vec3 vRotX; varying vec3 vRotZ;
float th1(float n) { return fract(sin(n) * 43758.5453); }
float tvn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(mix(mix(th1(n), th1(n + 1.0), f.x), mix(th1(n + 57.0), th1(n + 58.0), f.x), f.y),
             mix(mix(th1(n + 113.0), th1(n + 114.0), f.x), mix(th1(n + 170.0), th1(n + 171.0), f.x), f.y), f.z);
}
uniform vec3 uNeedle; uniform vec3 uNeedle2; uniform vec3 uBark; uniform vec3 uTreeSnow; uniform float uSnowLoad; uniform float uAlphaBoost;
uniform float uBakeBin;
vec3 tTreeN = vec3(0.0, 1.0, 0.0); float tTreeNW = 0.0; float tNeedle = 0.0;
`;
// Per-tree variation that the impostor must reproduce exactly: snow load is quantised to IMP_NL levels
// (the impostor has a picture per level), the needle tint is a colour multiply the impostor re-applies,
// and the snow noise is in tree-local space (identical on every tree of a kind and level).
const FRAG = /* glsl */`
{
  #if TREE_LOD == 0 && !defined(IMP_BAKE)
  ${LOD_FRAG}
  #endif
  float under = vUnder;
  #ifdef USE_MAP
  {
    // Keep foliage coverage at distance: boost alpha with the mip level, then sharpen the edge.
    vec2 tdx = dFdx(vMapUv * 256.0), tdy = dFdy(vMapUv * 256.0);
    float lvl = max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy))));
    float a = diffuseColor.a * (1.0 + lvl * uAlphaBoost);
    diffuseColor.a = clamp((a - 0.42) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  }
  #endif
  #ifdef IMP_BAKE
    vec3 green = mix(uNeedle, uNeedle2, 0.5);
    float lb = uBakeBin;
  #else
    vec3 green = mix(uNeedle, uNeedle2, vSeed) * (0.85 + 0.3 * fract(vSeed * 7.31));
    float lb = floor(fract(vSeed * 3.71) * IMP_NL);
  #endif
  vec3 base = diffuseColor.rgb;           // texture colour (needles) where mapped
  bool bark = under > 1.5 && under < 2.5;
  bool shell = under > 2.5;               // inner core / leader
  vec3 col = bark ? uBark : (shell ? green * 0.7 : green * clamp(base.g / 0.03, 0.45, 1.5));
  if (under > 1.5) diffuseColor.a = 1.0;   // trunk / core are solid
  // Snow: sits on the upper side of each branch (and the top of the core), heavier per tree.
  float load = uSnowLoad * (0.4 + 0.8 * (lb + 0.5) / IMP_NL);
  float snow = 0.0;
  vec3 tp = vLP;
  if (!bark) {
    if (shell) {
      float n = tvn(tp * 2.3) * 0.65 + tvn(tp * 7.1) * 0.35;
      float sh = smoothstep(0.05, 0.75, vWN.y + (n - 0.5) * 0.6);
      snow = sh * smoothstep(0.15, 0.8, load) * 0.7;
    } else if (under < 0.5 && gl_FrontFacing) {
      // Along the branch: a ridge of snow over the twig, thinning toward the tips and the edges.
      float across = abs(fract(vTUv.y * 2.0) - 0.5) * 2.0;
      float along = smoothstep(0.0, 0.25, vTUv.x) * (1.0 - smoothstep(0.65, 1.0, vTUv.x));
      float n = tvn(tp * 2.3) * 0.65 + tvn(tp * 7.1) * 0.35;
      float sv = load * (0.55 + 0.45 * along) * (1.15 - across * 0.6) + (n - 0.5) * 0.55;
      snow = smoothstep(0.42, 0.62, sv);
      // Snow is a solid pillow on the twig, not needle-shaped: it keeps its own soft outline.
      diffuseColor.a = max(diffuseColor.a, smoothstep(0.6, 0.66, sv));
      #if defined(USE_ALPHATEST) && !defined(ALPHA_TO_COVERAGE)
      if (diffuseColor.a < alphaTest) discard;   // perf: the alpha test would discard it anyway
      #endif
      // Pillow normal: domed across the branch, lumpy (lit tops, shaded flanks).
      if (snow > 0.0) {
        vec3 e = vec3(0.09, 0.0, 0.0);
        float c0 = tvn(tp * 6.0);
        vec3 gN = vec3(tvn(tp * 6.0 + e.xyz) - c0, tvn(tp * 6.0 + e.yxz) - c0, tvn(tp * 6.0 + e.yzx) - c0) / 0.09;
        gN = gN.x * vRotX + vec3(0.0, gN.y, 0.0) + gN.z * vRotZ;   // tree-local -> world
        tTreeN = normalize(vec3(0.0, 1.0, 0.0) + normalize(vWN) * (0.35 + across * 0.8) - gN * 0.18);
        tTreeNW = snow;
      }
    }
  }
  #if defined(USE_ALPHATEST) && !defined(ALPHA_TO_COVERAGE)
  if (diffuseColor.a < alphaTest) discard;
  #endif
  tNeedle = (!bark && !shell) ? (1.0 - snow) : 0.0;
  // Inner needle mass: not a flat dark cone — break it up into lighter / darker clumps.
  if (shell) col *= 0.55 + 0.9 * tvn(tp * 1.7) * tvn(tp * 4.3 + 3.0);
  col = mix(col, uTreeSnow, snow);
  col *= mix(vAO, 1.0, snow * 0.6);
  diffuseColor.rgb = col;
  toonDeepBias = (1.0 - vAO) * 0.35 * (1.0 - snow);
}
`;
// Bake outputs (IMP_BAKE 1 = albedo, sqrt-encoded for 8-bit precision in the dark needles, 2 = the
// shading normal in tree-local space + AO). Written straight to the atlas (NoBlending).
const BAKE_OUT = /* glsl */`
  #if IMP_BAKE == 1
    outgoingLight = sqrt(max(diffuseColor.rgb, vec3(0.0)));
    diffuseColor.a = 1.0;
  #elif IMP_BAKE == 2
    outgoingLight = normalize(inverseTransformDirection(normal, viewMatrix)) * 0.5 + 0.5;
    diffuseColor.a = vAO;
  #endif
  #include <opaque_fragment>`;
const TRANSLUCENCY = (ao) => /* glsl */`
      {
        // Backlit needles: thin needle sprays at the branch tips glow when the sun is behind the tree.
        float back = pow(max(dot(-normalize(vViewPosition), sunV), 0.0), 5.0);
        light += uSunCol * vec3(0.7, 0.85, 0.45) * back * tNeedle * pow(${ao}, 3.0) * mix(0.35, 1.0, shadow) * ${TREES.translucency.toFixed(2)};
      }`;
const NORMAL_OVERRIDE = '#include <normal_fragment_maps>\n  if (tTreeNW > 0.0) normal = normalize(mix(normal, (viewMatrix * vec4(tTreeN, 0.0)).xyz, tTreeNW));';

function treeUniforms(lod) {
  return {
    uNeedle: { value: new THREE.Color(TREES.needle) }, uNeedle2: { value: new THREE.Color(TREES.needle2) },
    uBark: { value: new THREE.Color(TREES.bark) }, uTreeSnow: { value: new THREE.Color(TREES.snow) },
    uSnowLoad: { value: TREES.snowLoad }, uAlphaBoost: ALPHA_BOOST, uBakeBin: { value: 0 }, ...lod,
  };
}

/** Frond material (the live 3D tree); `bake` = 1 / 2 makes the atlas-baking variant. */
function treeMaterial(opts) {
  const m = toonMaterial({
    name: opts.name, map: opts.map, alphaTest: 0.5, side: THREE.DoubleSide,
    uniforms: treeUniforms(opts.lod),
    vertPars: VERT_PARS, vertPre: VERT_PRE, fragPars: FRAG_PARS, frag: FRAG,
    band: TRANSLUCENCY('vAO'),
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', NORMAL_OVERRIDE);
    if (opts.bake) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', BAKE_OUT);
  };
  m.defines = { TREE_LOD: 0 };
  if (opts.bake) {
    m.defines.IMP_BAKE = opts.bake;
    m.blending = THREE.NoBlending;
    m.fog = false;
    const key = m.customProgramCacheKey;
    m.customProgramCacheKey = () => key() + '|bake' + opts.bake;
  }
  return m;
}

// Impostor: a camera-facing card per tree (built in tree-local space, so the frame azimuth is simply
// the camera's direction around the trunk), blending the 2 x 2 nearest baked frames (azimuth x
// elevation), lit live from the baked normals like the fronds. Shadow lookups are moved toward the sun
// (by the crown radius at that height), out of the tree's own sun-facing shadow card, so the card
// receives the shadows of other trees and the terrain but does not shadow itself.
const IMP_VERT_PARS = IMP_DEFS + LOD_PARS + /* glsl */`
uniform vec3 uSunDir;
varying float vSeed; varying vec3 vRotX; varying vec3 vRotZ;
varying vec2 vImpUv; varying vec3 vImpA; varying vec3 vImpE; varying float vImpRow;
`;
const IMP_VERT_PRE = INSTANCE + /* glsl */`
  {
    #ifdef USE_INSTANCING
      mat4 iw = modelMatrix * instanceMatrix;
    #else
      mat4 iw = modelMatrix;
    #endif
    #ifdef IMP_SUN
      // Shadow pass: the card faces the sun and shows the tree as the sun sees it, so its shadow is
      // the frond tree's own silhouette (orthographic, like the shadow map).
      vec3 toC = (inverse(iw) * vec4(uSunDir, 0.0)).xyz;
    #else
      vec3 camL = (inverse(iw) * vec4(cameraPosition, 1.0)).xyz;
      vec3 toC = camL - vec3(0.0, IMP_CY, 0.0);
    #endif
    vec3 fwd = normalize(toC);
    vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(1e-5, 0.0, 0.0));
    vec3 upv = cross(fwd, rgt);
    transformed = vec3(0.0, IMP_CY, 0.0) + rgt * (uv.x - 0.5) * IMP_W + upv * (uv.y - 0.5) * IMP_H;
    vImpUv = uv;
    float fa = mod(atan(toC.x, toC.z) / 6.2831853 * IMP_NA + IMP_NA, IMP_NA);
    float a0 = floor(fa);
    vImpA = vec3(a0, mod(a0 + 1.0, IMP_NA), fa - a0);
    float fe = clamp(asin(clamp(fwd.y, -1.0, 1.0)) / IMP_EL, 0.0, IMP_NE - 1.0);
    float e0 = min(floor(fe), IMP_NE - 2.0);
    vImpE = vec3(e0, e0 + 1.0, fe - e0);
    float lb = floor(fract(vSeed * 3.71) * IMP_NL);
    vImpRow = (float(IMP_KIND) * IMP_NL + lb) * IMP_NE;
  }
  float swayY = transformed.y;
` + SWAY + LOD_VERT;
const IMP_SHADOW = /* glsl */`
  #ifdef USE_SHADOWMAP
  {
    float hs = length(iwScale());
    worldPosition.xyz += uSunDir * (3.0 * (1.0 - clamp(transformed.y / 12.0, 0.0, 1.0)) + 0.6) * hs;
  }
  #endif
  #include <shadowmap_vertex>`;
const IMP_FRAG_PARS = IMP_DEFS + LOD_PARS + /* glsl */`
uniform sampler2D uImpAlb; uniform sampler2D uImpNrm;
uniform vec3 uNeedle; uniform vec3 uNeedle2; uniform float uAlphaBoost;
varying float vSeed; varying vec3 vRotX; varying vec3 vRotZ;
varying vec2 vImpUv; varying vec3 vImpA; varying vec3 vImpE; varying float vImpRow;
vec3 tTreeN = vec3(0.0, 1.0, 0.0); float tTreeNW = 0.0; float tNeedle = 0.0; float tImpAO = 1.0;
`;
const IMP_FRAG = /* glsl */`
{
  ${LOD_FRAG}
  vec2 fsz = vec2(1.0 / IMP_NA, 1.0 / IMP_ROWS);
  vec2 u = clamp(vImpUv, vec2(0.004), vec2(0.996));
  vec2 t00 = (vec2(vImpA.x, vImpRow + vImpE.x) + u) * fsz;
  vec2 t10 = (vec2(vImpA.y, vImpRow + vImpE.x) + u) * fsz;
  vec2 t01 = (vec2(vImpA.x, vImpRow + vImpE.y) + u) * fsz;
  vec2 t11 = (vec2(vImpA.y, vImpRow + vImpE.y) + u) * fsz;
  vec2 gx = dFdx(vImpUv) * fsz, gy = dFdy(vImpUv) * fsz;
  vec4 c00 = textureGrad(uImpAlb, t00, gx, gy), c10 = textureGrad(uImpAlb, t10, gx, gy);
  vec4 c01 = textureGrad(uImpAlb, t01, gx, gy), c11 = textureGrad(uImpAlb, t11, gx, gy);
  float w00 = (1.0 - vImpA.z) * (1.0 - vImpE.z), w10 = vImpA.z * (1.0 - vImpE.z);
  float w01 = (1.0 - vImpA.z) * vImpE.z, w11 = vImpA.z * vImpE.z;
  w00 *= c00.a; w10 *= c10.a; w01 *= c01.a; w11 *= c11.a;
  float cov = w00 + w10 + w01 + w11;
  // Same coverage rule as the fronds: boost alpha with the mip level so distant crowns stay dense.
  vec2 px = dFdx(vImpUv * vec2(IMP_FW, IMP_FH)), py = dFdy(vImpUv * vec2(IMP_FW, IMP_FH));
  float lvl = max(0.0, 0.5 * log2(max(dot(px, px), dot(py, py))));
  if (cov * (1.0 + lvl * uAlphaBoost) < 0.5) discard;
  float iw = 1.0 / max(cov, 1e-4);
  vec3 alb = (c00.rgb * w00 + c10.rgb * w10 + c01.rgb * w01 + c11.rgb * w11) * iw;
  alb *= alb;
  vec4 nm = (textureGrad(uImpNrm, t00, gx, gy) * w00 + textureGrad(uImpNrm, t10, gx, gy) * w10
           + textureGrad(uImpNrm, t01, gx, gy) * w01 + textureGrad(uImpNrm, t11, gx, gy) * w11) * iw;
  vec3 nl = normalize(nm.xyz * 2.0 - 1.0);
  tImpAO = nm.a;
  // Snow vs needles from brightness (snow ~0.5-0.9, needles < 0.1 linear): per-tree needle tint.
  float snowE = smoothstep(0.12, 0.45, dot(alb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 tint = (mix(uNeedle, uNeedle2, vSeed) * (0.85 + 0.3 * fract(vSeed * 7.31))) / max(mix(uNeedle, uNeedle2, 0.5), vec3(1e-4));
  diffuseColor = vec4(mix(alb * tint, alb, snowE), 1.0);
  tNeedle = 1.0 - snowE;
  toonDeepBias = (1.0 - tImpAO) * 0.35 * (1.0 - snowE);
  tTreeN = normalize(nl.x * vRotX + vec3(0.0, nl.y, 0.0) + nl.z * vRotZ);
  tTreeNW = 1.0;
}
`;

function impostorMaterial(kind, lod, alb, nrm) {
  const m = toonMaterial({
    name: 'spruceImp' + kind, side: THREE.DoubleSide,
    uniforms: { ...treeUniforms(lod), uImpAlb: { value: alb }, uImpNrm: { value: nrm } },
    vertPars: IMP_VERT_PARS, vertPre: IMP_VERT_PRE, fragPars: IMP_FRAG_PARS, frag: IMP_FRAG,
    band: TRANSLUCENCY('tImpAO'),
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `vec3 iwScale() {
  #ifdef USE_INSTANCING
    return vec3(length(instanceMatrix[0].xyz), 0.0, 0.0);
  #else
    return vec3(1.0, 0.0, 0.0);
  #endif
}
void main() {`)
      .replace('#include <shadowmap_vertex>', IMP_SHADOW);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', NORMAL_OVERRIDE);
  };
  m.defines = { TREE_LOD: 2, IMP_KIND: kind };
  return m;
}

/** Shadow-depth material for the impostor cells: a sun-facing card with the baked sun-view silhouette. */
function impostorDepthMaterial(kind, lod, sil) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.name = 'treeImpDepth' + kind;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lod, { uTime: globals.uTime, uWind: globals.uWind, uSunDir: globals.uSunDir, uImpAlb: { value: sil } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;\n' + IMP_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + IMP_VERT_PRE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + IMP_DEFS + LOD_PARS + `
uniform sampler2D uImpAlb;
varying vec2 vImpUv; varying vec3 vImpA; varying vec3 vImpE; varying float vImpRow;`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + LOD_FRAG + `
  {
    // Silhouette from the sun's own elevation (impSun: one row per kind and load level).
    vec2 fsz = vec2(1.0 / IMP_NA, 1.0 / (2.0 * IMP_NL));
    vec2 u = clamp(vImpUv, vec2(0.004), vec2(0.996));
    vec2 gx = dFdx(vImpUv) * fsz, gy = dFdy(vImpUv) * fsz;
    float row = floor(vImpRow / IMP_NE + 0.5);
    // The sun and each tree are fixed, so the nearest direction never changes: one tap is enough.
    float cov = textureGrad(uImpAlb, (vec2(vImpA.z < 0.5 ? vImpA.x : vImpA.y, row) + u) * fsz, gx, gy).r;
    if (cov < 0.5) discard;
  }`);
  };
  m.defines = { TREE_LOD: 2, TREE_SHADOW: 1, IMP_SUN: 1, IMP_KIND: kind };
  m.customProgramCacheKey = () => 'treeImpDepth' + kind;
  return m;
}

/** Shadow-depth material for the frond pools: same sway, alpha cut-out and LOD dither. */
function treeDepthMaterial(lodLevel, lod) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.name = 'treeDepth' + lodLevel;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lod, { uTime: globals.uTime, uWind: globals.uWind });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;\n' + LOD_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  float swayY = position.y;
  ${SWAY}
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
      uLodA: { value: new THREE.Vector4(58, 17, 4500, 500) },
      uLodB: { value: new THREE.Vector4(120, 0, 0, 0) },
      uLodEye: { value: new THREE.Vector3() },
    };
    this.lastNear = new THREE.Vector3(1e9, 0, 0);
    this.lastFar = new THREE.Vector3(1e9, 0, 0);
    this.setQuality(2);
    this.cells = [];
    const tex = makeNeedleTexture();
    this.tex = tex;
    // Impostor atlases (filled by bakeImpostors() at load: RGBA8, mipmapped; the bake's render target
    // and depth buffer are freed afterwards, only these two textures stay on the GPU, ~55 MB).
    const atlas = () => {
      const t = new THREE.DataTexture(null, IMP.NA * IMP.FW, IMP_ROWS * IMP.FH, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true; t.flipY = false; t.name = 'treeImpostor';
      return t;
    };
    this.impAlb = atlas();
    this.impNrm = atlas();
    // Shadow silhouettes: one row of pictures per kind and load level from exactly the sun's elevation
    // (coverage only, R8), for the sun-facing shadow cards.
    this.impSun = new THREE.DataTexture(null, IMP.NA * IMP.FW, 2 * IMP.NL * IMP.FH, THREE.RedFormat, THREE.UnsignedByteType);
    Object.assign(this.impSun, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, flipY: false, name: 'treeImpostorSun' });
    this.baked = false;
    this.mats = {
      lod0: treeMaterial({ name: 'spruceNear', map: tex, lod: this.lod }),
      imp0: impostorMaterial(0, this.lod, this.impAlb, this.impNrm),
      imp1: impostorMaterial(1, this.lod, this.impAlb, this.impNrm),
    };
    this.depthMats = {
      lod0: treeDepthMaterial(0, this.lod),
      imp: [0, 1].map((k) => impostorDepthMaterial(k, this.lod, this.impSun)),
    };
    this.geos = [0, 1].map((k) => ({ lod0: crownGeometry(k, 11 + k) }));
    this.impGeo = impostorGeometry();
  }

  /** Backwards-compatible handle: `last` resets every pool refill. */
  get last() { return { set: (x, y, z) => { this.lastNear.set(x, y, z); this.lastFar.set(x, y, z); } }; }

  add(x, y, z, yaw, sx, sy, sz, kind) { this.trees.push([x, y, z, yaw, sx, sy, sz, kind]); }

  /**
   * Bake the impostor atlases: orthographic pictures of each frond tree (both kinds, every snow-load
   * level) from IMP.NA azimuths x IMP.NE elevations, as albedo and as normal + AO, with the frond
   * shader itself (bake variant), so the far cards match the near trees. Call once after the map's
   * atmosphere is applied, before the first frame (main.js). ~0.1-0.3 s.
   */
  bakeImpostors(renderer) {
    const t0 = performance.now();
    for (const _ of this.bakeSteps(renderer)) { /* run to the end */ }
    return performance.now() - t0;
  }

  /**
   * Same bake, yielding to the event loop every ~12 ms so a live loading animation stays smooth.
   * onProgress(0..1) is called at each yield (main.js forwards it to ui.loading). Resolves to ms.
   */
  async bakeImpostorsAsync(renderer, onProgress) {
    const t0 = performance.now();
    let last = t0;
    for (const p of this.bakeSteps(renderer)) {
      if (performance.now() - last < 12) continue;
      onProgress?.(p);
      await new Promise((res) => setTimeout(res, 0));
      last = performance.now();
    }
    onProgress?.(1);
    return performance.now() - t0;
  }

  /** The bake as a generator: one atlas row (12 pictures) per step, yields its progress 0..1.
   * Renderer state is restored around every step, so other code may render between steps. */
  *bakeSteps(renderer) {
    const scene = new THREE.Scene();
    const mats = [1, 2].map((b) => treeMaterial({ name: 'spruceBake', map: this.tex, lod: this.lod, bake: b }));
    const mesh = new THREE.Mesh(this.geos[0].lod0, mats[0]);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-IMP.W / 2, IMP.W / 2, IMP.H / 2, -IMP.H / 2, 1, 80);
    const C = new THREE.Vector3(0, IMP.CY, 0);
    let prev = null;
    const begin = () => {
      prev = { rt: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, shadow: renderer.shadowMap.autoUpdate };
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
    };
    const end = () => {
      renderer.setRenderTarget(prev.rt);
      renderer.setClearColor(prev.color, prev.alpha);
      renderer.autoClear = prev.auto;
      renderer.shadowMap.autoUpdate = prev.shadow;
    };
    const W = IMP.NA * IMP.FW, H = IMP_ROWS * IMP.FH;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, generateMipmaps: false });
    // Background: a needle-ish colour (albedo, sqrt-encoded) and an "up" normal, so mip levels that
    // mix in the empty border stay plausible; alpha 0 = no coverage.
    const bg = [[0.2, 0.26, 0.2], [0.5, 1, 0.5]];
    const sunEl = Math.asin(THREE.MathUtils.clamp(SUN_DIR.y, 0.05, 1));
    const passes = [
      { tex: this.impAlb, mat: 0, rows: IMP_ROWS, els: IMP.NE },
      { tex: this.impNrm, mat: 1, rows: IMP_ROWS, els: IMP.NE },
      { tex: this.impSun, mat: 0, rows: 2 * IMP.NL, els: 1, sun: true },
    ];
    const total = passes.reduce((n, p) => n + 2 * IMP.NL * p.els, 0);
    let done = 0;
    for (const { tex, mat, rows, els, sun } of passes) {
      begin();
      rt.scissorTest = false;
      rt.viewport.set(0, 0, W, H);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(new THREE.Color().setRGB(...bg[mat], THREE.LinearSRGBColorSpace), 0);
      renderer.clear(true, true, true);
      mesh.material = mats[mat];
      end();
      for (let kind = 0; kind < 2; kind++) {
        mesh.geometry = this.geos[kind].lod0;
        for (let lb = 0; lb < IMP.NL; lb++) {
          mats[mat].userData.uniforms.uBakeBin.value = lb;
          for (let e = 0; e < els; e++) {
            begin();
            const row = (kind * IMP.NL + lb) * els + e, el = sun ? sunEl : e * IMP.EL;
            for (let a = 0; a < IMP.NA; a++) {
              const az = (a / IMP.NA) * Math.PI * 2;
              cam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(40).add(C);
              cam.lookAt(C);
              cam.updateMatrixWorld();
              rt.viewport.set(a * IMP.FW, row * IMP.FH, IMP.FW, IMP.FH);
              rt.scissor.copy(rt.viewport);
              rt.scissorTest = true;
              renderer.setRenderTarget(rt);   // applies this frame's viewport / scissor
              renderer.render(scene, cam);
            }
            end();
            yield ++done / total;
          }
        }
      }
      begin();
      const h = rows * IMP.FH;
      let data = new Uint8Array(W * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, h, data);
      if (sun) { const r = new Uint8Array(W * h); for (let i = 0; i < r.length; i++) r[i] = data[i * 4 + 3]; data = r; }
      tex.image = { data, width: W, height: h };
      tex.needsUpdate = true;
      // Upload now, then drop the CPU copy (the texture never changes again).
      renderer.initTexture(tex);
      tex.image = { data: null, width: W, height: h };
      end();
    }
    rt.dispose();
    for (const m of mats) m.dispose();
    this.baked = true;
  }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // Static impostors for the whole map, per 750 m cell per kind (built once, never streamed).
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
      const im = new THREE.InstancedMesh(this.impGeo, kind ? this.mats.imp1 : this.mats.imp0, list.length);
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
      // Beyond the fronds, trees cast through their impostor too: a sun-facing card with the tree's
      // silhouette (the shader drops every instance outside the shadow range).
      im.castShadow = true; im.receiveShadow = true;
      im.customDepthMaterial = this.depthMats.imp[kind];
      im.userData = { center: c, radius: r };
      im.name = 'TreesImpostor';
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
      // Fronds: drawn, and cast their own (dithered) shadows; the shadow pass draws the first
      // `shadowCount` instances (the pool is sorted near -> far).
      const p0 = mk('lod0', kind, this.geos[kind].lod0, this.mats.lod0, this.depthMats.lod0, `Trees_lod0_${kind}`);
      p0.im.onBeforeShadow = () => { p0.im.userData.n = p0.im.count; p0.im.count = p0.im.userData.shadowCount; };
      p0.im.onAfterShadow = () => { p0.im.count = p0.im.userData.n; };
    }
    this.member = new Uint8Array(this.trees.length);   // bit 0: frond pool
  }

  /**
   * Hand-over distance for a quality tier (PERF.trees), optionally scaled by a dense map's hint
   * ({ treeNear }), never below the tier's `minNear`.
   */
  setQuality(q, hint = null) {
    const Q = perfQ(q), P = PERF.trees[Q];   // perf tiers: gfx/perf.js
    // MSAA tiers: frond cut-outs become alpha-to-coverage (soft, stable needle edges instead of a
    // shimmering 1-bit alpha test).
    const a2c = PERF.msaa[Q] > 0;
    for (const m of [this.mats?.lod0]) if (m && m.alphaToCoverage !== a2c) { m.alphaToCoverage = a2c; m.needsUpdate = true; }
    // The light-space shadow box (±box) reaches box / sin(elevation) along the sun's azimuth on the
    // ground; + a crown and the camera's offset behind the rider.
    this.shadowR = PERF.shadow[Q].box / Math.max(0.2, SUN_DIR.y) + 18;
    const near = Math.max(P.minNear, P.near * (hint?.treeNear ?? 1));
    const band = Math.max(2, near * P.band);
    this.near = near; this.band = band; this.far = P.far;
    this.lod.uLodA.value.set(near, band, P.far, P.farBand);
    this.lod.uLodB.value.set(this.shadowR, 0, 0, 0);
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
    const nearStep = PERF.treeRefill.near;
    // Fronds: refilled every few metres from the spatial grid; each refill holds every tree that can
    // be inside the hand-over before the next one.
    if (Math.hypot(cam.x - this.lastNear.x, cam.z - this.lastNear.z) >= nearStep) {
      this.lastNear.copy(cam);
      const out = this.near + nearStep;
      const list = this.gather(cam, 0, out, true);
      this.fill(this.pools.filter((p) => p.lod === 'lod0'), list, (d) => d < out, 0);
      for (const t of this._nearSet || []) this.member[t] &= ~1;
      for (const t of list) this.member[t] |= 1;
      this._nearSet = list;
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
  fill(pools, list, keep, bit) {
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
   * (0 = fronds .. 1 = impostor .. 2 = faded out, 3 = should be drawn but isn't; fractions =
   * cross-fade) and whether it casts a shadow.
   */
  debugLevels(cam) {
    const n = this.trees.length, level = new Float32Array(n), cast = new Uint8Array(n);
    const [near, nb, far, fb] = this.lod.uLodA.value.toArray();
    const c01 = (x) => Math.min(1, Math.max(0, x));
    for (let i = 0; i < n; i++) {
      const t = this.trees[i], d = Math.hypot(t[0] - cam.x, t[2] - cam.z);
      const tN = c01((d - near + nb) / nb), tF = c01((d - far + fb) / fb);
      let missing = false;
      if (tN < 1 && !(this.member[i] & 1)) missing = true;
      if (tN > 0 && tF < 1 && !this.cells[this.cellOf[i]].visible) missing = true;
      level[i] = missing ? 3 : tN + tF;
      // Casts when inside the shadow range: fronds, or the impostor's sun-facing card once they hand over.
      const castsNear = tN < 1 && (this.member[i] & 1), castsImp = tN > 0 && this.cells[this.cellOf[i]].visible;
      cast[i] = d < this.shadowR - 1 && (castsNear || castsImp) ? 1 : 0;
    }
    return { level, cast };
  }
}
