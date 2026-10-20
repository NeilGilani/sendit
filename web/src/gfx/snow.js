// Realistic snow + rock terrain shading (plugs into world.js toonMaterial hooks).
//  frag (after map_fragment): classify snow / rock / forest, build a multi-scale normal
//    (macro landform → soft drifts → sastrugi → wind ripples → groomed corduroy → micro grain),
//    carved tracks from the FX track map (deep soft trenches in powder, parallax on high quality),
//    snow sitting on rock ledges, albedo variation by slope / altitude / sun exposure, glints.
//  band (lighting): wrapped diffuse with a cyan-blue subsurface tint, blue sky-lit shade,
//    GGX sheen + forward scattering toward the sun, view-dependent sparkle (HDR, blooms).
// Tunables: SNOW / ROCK in scene.js.
import * as THREE from 'three';
import { SNOW, ROCK } from '../scene.js';
import { assetUrl } from '../base.js';

const lin = (hex) => new THREE.Color(hex);   // three converts sRGB hex → linear working space

// Packed rock detail (CC0 Poly Haven rock_face_03 at 1K: rg = GL normal xy, b = luminance), shared by
// every terrain material. A flat grey placeholder is bound until the JPEG arrives.
let rockTex = null, rockReady = null;
/** Resolves once the rock detail JPEG is decoded (or after `timeout` ms), so loading can wait for it. */
export function rockTextureReady(timeout = 8000) {
  rockTexture();
  return Promise.race([rockReady, new Promise((r) => setTimeout(r, timeout))]);
}
function rockTexture() {
  if (rockTex) return rockTex;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,115)';
  g.fillRect(0, 0, 1, 1);
  rockTex = new THREE.Texture(c);
  rockTex.colorSpace = THREE.NoColorSpace;
  rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
  rockTex.needsUpdate = true;
  rockReady = new Promise((resolve) => new THREE.ImageLoader().load(assetUrl('textures/web/rock_face_03_packed_1k.jpg'), (img) => {
    rockTex.image = img;
    rockTex.anisotropy = 4;
    rockTex.needsUpdate = true;
    resolve();
  }, undefined, () => resolve()));
  return rockTex;
}

export function snowUniforms() {
  const wd = new THREE.Vector2(Math.cos(SNOW.windAngle), Math.sin(SNOW.windAngle));
  return {
    uSnowAlbedo: { value: lin(SNOW.albedo) },
    uSnowOld: { value: lin(SNOW.albedoPacked) },
    uSnowSSS: { value: lin(SNOW.subsurface).multiplyScalar(SNOW.subsurfaceStrength) },
    uSnowLook: { value: new THREE.Vector4(SNOW.wrap, SNOW.roughness, SNOW.specular, SNOW.forwardScatter) },
    uSparkle: { value: new THREE.Vector3(SNOW.sparkle, SNOW.sparkleDensity, SNOW.sparkleCone) },
    uWindDir: { value: wd },
    uDetail: { value: 2 },
    uSnowShape: { value: new THREE.Vector4(SNOW.drift, SNOW.ripple, SNOW.sastrugi, SNOW.corduroy) },
    uTrackLook: { value: new THREE.Vector3(SNOW.trackDepth, SNOW.trackLip, SNOW.trackDark) },
    uRockA: { value: lin(ROCK.dark) }, uRockB: { value: lin(ROCK.light) }, uRockC: { value: lin(ROCK.rust) },
    uRockLook: { value: new THREE.Vector4(ROCK.strataScale, ROCK.ledgeSnow, ROCK.exposeSlope, ROCK.exposeSoft) },
    uForestCol: { value: lin(SNOW.forest) },
    uTreeMask: { value: null },
    uFarForest: { value: new THREE.Vector3(2350, 300, 9500) },
    uRockTex: { value: rockTexture() },
    uRockScale: { value: new THREE.Vector4(ROCK.blockBig, ROCK.blockMid, ROCK.blockSmall, ROCK.photoTile) },
  };
}

/** Shared declarations (fragment) for terrain + far backdrop. */
export const SNOW_COMMON_PARS = /* glsl */`
uniform vec3 uSnowAlbedo; uniform vec3 uSnowOld; uniform vec3 uSnowSSS; uniform vec4 uSnowLook; uniform vec3 uSparkle;
uniform vec2 uWindDir; uniform float uDetail; uniform vec4 uSnowShape; uniform vec3 uTrackLook;
uniform vec3 uRockA; uniform vec3 uRockB; uniform vec3 uRockC; uniform vec4 uRockLook; uniform vec3 uForestCol;
uniform sampler2D noiseTex;
uniform vec3 uFarForest;    // x treeline (m), y fade width (m), z max box distance from centre (m)
uniform sampler2D uRockTex; uniform vec4 uRockScale;
float tRock = 0.0;          // rock / forest / water coverage (no snow optics there)
float tTrack = 0.0;         // carved trench depth (0..1)
float tCavity = 1.0;        // small-scale occlusion (trench bottoms, tree wells)
float tGlaze = 0.0;         // sun / wind glazed crust: tighter sheen
float tGlintMask = 1.0;     // where glints may appear
float tSnowWet = 0.0;
float tFP = 0.01;
float tRockJoint = 0.0;     // joint / crack cavity of the last rockShade() call (sky occlusion)
float tCordLane = 0.0;       // groomer-lane brightness offset           // world metres per pixel (set before any branch)
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
// Face-aligned frame: T runs across the slope (horizontal), B runs up it. Rock is textured in
// (u, v) = (along T, along B) so steep faces are never stretched.
void faceFrame(vec3 n, out vec3 T, out vec3 B) {
  vec3 t = cross(vec3(0.0, 1.0, 0.0), n);
  float l = length(t);
  T = l > 0.05 ? t / l : vec3(1.0, 0.0, 0.0);
  B = normalize(cross(n, T));
}
// Sluff flutes / spines on steep snow: parallel runnels down the fall line that wander and merge
// (sharp crests, rounded troughs). S = spacing (m). Returns the tilted normal; tFlute = trough depth.
float tFlute = 0.0;
// One projection: runnels are vertical lines in the (u, height) plane, wandering slowly.
float fluteD(float u, float y, float S, out float trough) {
  // Explicit LOD (called from loops); these frequencies never alias.
  float f = u / S + (textureLod(noiseTex, vec2(u / (S * 40.0), y / 260.0) + 0.31, 0.0).r - 0.5) * 5.0
          + (textureLod(noiseTex, vec2(u / (S * 14.0), y / 140.0) + 0.6, 0.0).r - 0.5) * 0.8;
  float k = fract(f) * 2.0 - 1.0;                 // 0 on a crest, ±1 in the troughs
  float w = 1.0 - abs(k);
  trough = 1.0 - w * w;
  return -2.0 * w * sign(k) * 2.0;                // dh/du per unit amp (sharp crests, round troughs)
}
// World-axis bi-planar (like the rock), so the pattern never depends on the per-pixel normal.
vec3 flutes(vec3 p, vec3 N, float fp, float S, float amp) {
  float slope = 1.0 - N.y;
  float on = smoothstep(0.2, 0.36, slope) * (1.0 - smoothstep(0.62, 0.8, slope));
  on *= smoothstep(0.35, 0.6, texture2D(noiseTex, p.xz * 0.0031 + 0.27).r);
  on *= 1.0 - smoothstep(0.07, 0.2, fp / S);           // ≥ 5 px per runnel or nothing (no speckle)
  if (on <= 0.0) return N;
  vec2 w = pow(abs(N.xz) + 1e-4, vec2(12.0));      // narrow hand-over: no crossing runnels
  w /= w.x + w.y;
  float tA = 0.0, tB = 0.0;
  float dA = w.x > 0.02 ? fluteD(p.z, p.y, S, tA) : 0.0;   // x-facing: runnels across z
  float dB = w.y > 0.02 ? fluteD(p.x + 53.0, p.y, S, tB) : 0.0;
  tFlute = (tA * w.x + tB * w.y) * on;
  return normalize(N - vec3(dB * w.y, 0.0, dA * w.x) * amp * on);
}
// 2D Voronoi: x = F1, y = F2 - F1 (joint distance), z = cell id.
vec3 rockCells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = i + o;
    vec2 r = o + hash32(c).xy * 0.85 + 0.075 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(c * 0.731 + 0.17) * 100.0; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
// One planar projection of the rock (uv in metres on that plane). Fractured blocks at several
// scales: each Voronoi cell is a flat facet with its own tilt (g = in-plane slope) and tone, with
// dark joints between cells; a CC0 photo (Poly Haven rock_face_03: rg normal, b luminance) adds the
// sub-metre grain. gh is the tilt of the large structure only (decides where snow can sit).
vec3 rockAlbedo(vec2 uv, float far);
void rockLayer(vec2 uv, float fp, out vec3 col, out vec2 g, out vec2 gh, out float joint, out float band) {
  // Cracks show only in places (noise), like real joint sets, never as a full paving network.
  float crackN = texture2D(noiseTex, uv * 0.013 + 0.61).g;
  float crackM = smoothstep(0.45, 0.7, crackN);
  // Domain warp: block edges wander instead of running dead straight.
  vec2 wp = (vec2(texture2D(noiseTex, uv * 0.021 + 0.13).r, texture2D(noiseTex, uv * 0.021 + 0.57).g) - 0.5);
  vec2 uvw = uv + wp * uRockScale.x * 0.9;
  // Slabs along the bedding (wider than tall).
  vec3 c1 = rockCells(uvw * vec2(0.8, 1.9) / uRockScale.x);
  vec3 r1 = hash32(vec2(c1.z, 3.1));
  g = (r1.xy - 0.5) * vec2(0.8, 1.0);
  joint = (1.0 - smoothstep(0.01, 0.035 + fp / uRockScale.x * 1.5, c1.y)) * 0.55 * crackM;
  float tone = r1.z;
  #if defined(ROCK_FAR) || defined(ROCK_MACRO)
  // Buttresses / slabs (tens of metres) that read from kilometres away (and break up big faces
  // seen from close: without them a 200 m wall is one smooth plane of grain).
  vec3 c0 = rockCells(uv * vec2(1.0, 1.5) / (uRockScale.x * 3.2) + 9.1);
  vec3 r0 = hash32(vec2(c0.z, 1.3));
  g = g * 0.6 + (r0.xy - 0.5) * 0.9;
  joint = max(joint * 0.6, (1.0 - smoothstep(0.01, 0.03 + fp / uRockScale.x * 0.5, c0.y)) * 0.5 * crackM);
  tone = mix(tone, r0.z, 0.5);
  #endif
  gh = g;
  #ifdef ROCK_MACRO
  g *= 0.95;                      // tile rock: facets turn to / away from the light so blocks read as planes
  #else
  g *= 0.7;                       // lighting: big blocks tilt less than the snow test assumes
  #endif
  // Vertical joint columns inside the slabs.
  #ifdef ROCK_LITE
  float wM = 0.0;                 // (medium: measured +3 % GPU on Ravenspire for the near columns alone)
  #else
  float wM = 1.0 - smoothstep(0.06, 0.2, fp / uRockScale.y);
  #endif
  if (wM > 0.0) {
    vec3 c2 = rockCells((uv + wp * uRockScale.y * 1.2) * vec2(1.7, 0.6) / uRockScale.y + 5.3);
    vec3 r2 = hash32(vec2(c2.z, 7.7));
    g += (r2.xy - 0.5) * vec2(0.8, 0.5) * wM;
    gh += (r2.xy - 0.5) * 0.35 * wM;
    joint = max(joint, (1.0 - smoothstep(0.015, 0.06, c2.y)) * 0.45 * wM * smoothstep(0.35, 0.6, crackN));
    tone = mix(tone, r2.z, 0.3 * wM);
  }
  #ifndef ROCK_LITE
  float wS = 1.0 - smoothstep(0.06, 0.2, fp / uRockScale.z);
  if (wS > 0.0) {
    vec3 c3 = rockCells(uv / uRockScale.z + 1.7);
    g += (hash32(vec2(c3.z, 2.9)).xy - 0.5) * 0.45 * wS;
    joint = max(joint, (1.0 - smoothstep(0.03, 0.1, c3.y)) * 0.25 * wS);
  }
  #endif
  // Photo grain: two scales, the second rotated, so the 1K tile never repeats visibly.
  vec3 p1 = texture2D(uRockTex, uv / uRockScale.w).rgb;
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv / (uRockScale.w * 3.7) + 0.37;
  vec3 p2 = texture2D(uRockTex, uv2).rgb;
  float near = 1.0 - smoothstep(0.02, 0.08, fp);
  g += ((p1.rg * 2.0 - 1.0) * 0.8 * near + (mat2(0.8, 0.6, -0.6, 0.8) * (p2.rg * 2.0 - 1.0)) * 0.6) * (1.0 - smoothstep(0.05, 0.3, fp));
  #ifdef ROCK_MACRO
  // Less photo blotching (it read as mud on big faces), more tone per block (separate planes).
  float lum = mix(1.0, p1.b * 2.2, 0.5) * mix(1.0, p2.b * 2.2, 0.22);
  float toneK = 0.42;
  #else
  float lum = mix(1.0, p1.b * 2.2, 0.55) * mix(1.0, p2.b * 2.2, 0.45);
  float toneK = 0.24;
  #endif
  col = rockAlbedo(uv, smoothstep(2.0, 8.0, fp));
  // Weathering inside each block (lighter faces, darker lichen / wet patches) so no facet is flat.
  float wx = texture2D(noiseTex, uv * 0.11 + 0.23).g * 0.6 + texture2D(noiseTex, uv * 0.37 + 0.71).r * 0.4;
  col *= (1.0 - toneK * 0.58 + toneK * tone) * (0.86 + 0.28 * wx) * lum * (1.0 - joint * 0.6);
  // Big ledge systems: broken bands along the strata, only on cells that tilt up.
  float warp = texture2D(noiseTex, uv * vec2(0.006, 0.02) + 0.2).r;
  float f2 = fract(uv.y / (uRockLook.x * 4.3) + warp * 2.2);
  band = (1.0 - smoothstep(0.08, 0.2, f2) * (1.0 - smoothstep(0.88, 1.0, f2))) * step(0.55, r1.z) * smoothstep(0.0, 0.2, gh.y)
       * smoothstep(0.08, 0.3, fp / uRockScale.x);                       // only reads from a distance
}
// Rock albedo: grey gneiss in blocks, lighter/darker beds, vertical runoff streaks, iron staining.
vec3 rockAlbedo(vec2 uv, float far) {
  float b1 = texture2D(noiseTex, uv * 0.017).r;
  float b2 = mix(texture2D(noiseTex, uv * 0.083 + 0.3).g, 0.5, far);
  float beds = texture2D(noiseTex, vec2(uv.x * 0.004, uv.y * 0.045) + 0.1).r;      // layering along the face
  float streak = texture2D(noiseTex, vec2(uv.x * 0.07, uv.y * 0.005) + 0.4).g;    // water-stain streaks (vertical)
  vec3 c = mix(uRockA, uRockB, smoothstep(0.2, 0.85, b1 * 0.55 + beds * 0.3 + (b2 - 0.5) * 0.5 + 0.08));
  c = mix(c, uRockC, smoothstep(0.75, 0.92, b1 + (beds - 0.5) * 0.3) * 0.18);
  c *= mix(1.0, 0.8, smoothstep(0.6, 0.85, streak) * 0.7 * (1.0 - far * 0.7));
  return c;
}
// Tri-planar rock (projections with < 3 % weight are skipped). Returns albedo, the lighting normal,
// the large-structure normal (for snow holding) and the ledge-band mask.
void rockShade(vec3 p, vec3 N, float fp, out vec3 col, out vec3 Nr, out vec3 Nh, out float band) {
  vec3 w = pow(abs(N) + 1e-4, vec3(5.0));
  #ifdef ROCK_LITE
  w = (w.x > w.z ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)) * (1.0 - step(0.75, abs(N.y))) + vec3(0.0, step(0.75, abs(N.y)), 0.0);
  #endif
  w /= w.x + w.y + w.z;
  float sx = N.x < 0.0 ? -1.0 : 1.0, sz = N.z < 0.0 ? -1.0 : 1.0;
  col = vec3(0.0); band = 0.0;
  vec3 pert = vec3(0.0), pertH = vec3(0.0);
  vec3 c; vec2 g, gh; float j, bd;
  tRockJoint = 0.0;
  if (w.x > 0.03) {
    rockLayer(vec2(p.z * sx, p.y), fp, c, g, gh, j, bd);
    col += c * w.x; band += bd * w.x; tRockJoint += j * w.x;
    pert += w.x * vec3(0.0, g.y, g.x * sx); pertH += w.x * vec3(0.0, gh.y, gh.x * sx);
  }
  if (w.z > 0.03) {
    rockLayer(vec2(-p.x * sz, p.y) + 37.0, fp, c, g, gh, j, bd);
    col += c * w.z; band += bd * w.z; tRockJoint += j * w.z;
    pert += w.z * vec3(-g.x * sz, g.y, 0.0); pertH += w.z * vec3(-gh.x * sz, gh.y, 0.0);
  }
  if (w.y > 0.03) {
    rockLayer(p.xz + 71.0, fp, c, g, gh, j, bd);
    col += c * w.y; tRockJoint += j * w.y;
    pert += w.y * vec3(g.x, 0.0, g.y); pertH += w.y * vec3(gh.x, 0.0, gh.y);
  }
  Nr = normalize(N + pert * 0.85);
  Nh = normalize(N + pertH * 0.8);
}
`;

/** Terrain-only declarations + helpers (fragment). */
export const SNOW_PARS_GLSL = /* glsl */`
uniform sampler2D normalTex; uniform sampler2D splatTex; uniform sampler2D uTreeMask;
uniform float terrainRes; uniform float terrainSpacing;
uniform sampler2D uTrackMap; uniform vec3 uTrackRegion;
vec3 tN;
vec2 tUV(vec2 xz) { return ((xz + terrainSize * 0.5) / terrainSpacing + 0.5) / terrainRes; }
float trackAt(vec2 xz) {
  vec2 uv = (xz - uTrackRegion.xy) / uTrackRegion.z + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uTrackMap, uv).r;
}
// Explicit-LOD lookup for use inside loops (no derivatives in non-uniform control flow).
float trackAtLod(vec2 xz) {
  vec2 uv = (xz - uTrackRegion.xy) / uTrackRegion.z + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return textureLod(uTrackMap, uv, 0.0).r;
}
vec3 macroNLod(vec2 xz) {
  vec2 nn = textureLod(normalTex, tUV(xz), 0.0).rg * 2.0 - 1.0;
  return vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y);
}
vec3 macroN(vec2 xz) {
  vec2 nn = texture2D(normalTex, tUV(xz)).rg * 2.0 - 1.0;
  return vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y);
}
// Finite-difference gradient of one noise channel (world metres → texture via scale).
vec2 noiseGrad(vec2 p, float scale, float eps, int ch) {
  vec2 q = p * scale;
  float e = eps * scale;
  vec4 a = texture2D(noiseTex, q), bx = texture2D(noiseTex, q + vec2(e, 0.0)), bz = texture2D(noiseTex, q + vec2(0.0, e));
  float c0 = ch == 0 ? a.r : (ch == 1 ? a.g : a.b);
  float cx = ch == 0 ? bx.r : (ch == 1 ? bx.g : bx.b);
  float cz = ch == 0 ? bz.r : (ch == 1 ? bz.g : bz.b);
  return vec2(cx - c0, cz - c0) / eps;
}
// Fall-line flutes for the playable tile: each 64 m cell runs straight runnels down its own
// (smoothed) fall line; the four nearest cells are blended (lines never cross or curl).
vec3 flutesCells(vec3 p, vec3 N, float fp, float S, float amp) {
  float slope = 1.0 - N.y;
  float on = smoothstep(0.2, 0.36, slope) * (1.0 - smoothstep(0.62, 0.8, slope));
  on *= smoothstep(0.35, 0.6, texture2D(noiseTex, p.xz * 0.0031 + 0.27).r);
  on *= 1.0 - smoothstep(0.07, 0.2, fp / S);
  if (on <= 0.0) return N;
  const float C = 64.0;
  vec2 cg = p.xz / C - 0.5;
  vec2 cb = floor(cg), cf = fract(cg);
  cf = cf * cf * (3.0 - 2.0 * cf);
  vec3 g = vec3(0.0);
  float tr = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 cc = (cb + vec2(float(i), float(j)) + 0.5) * C;
    vec3 nC = normalize(macroNLod(cc) + macroNLod(cc + vec2(18.0, 0.0)) + macroNLod(cc - vec2(18.0, 0.0)) + macroNLod(cc + vec2(0.0, 18.0)) + macroNLod(cc - vec2(0.0, 18.0)));
    vec2 fl = normalize(nC.xz + vec2(1e-4, 0.0));
    vec2 ac = vec2(-fl.y, fl.x);                                   // across the fall line
    float w = (i == 0 ? 1.0 - cf.x : cf.x) * (j == 0 ? 1.0 - cf.y : cf.y);
    float u = dot(p.xz - cc, ac) + hash12(cc) * 40.0;
    float tt;
    float d = fluteD(u, p.y, S, tt);
    g += vec3(ac.x, 0.0, ac.y) * d * w;
    tr += tt * w;
  }
  tFlute = tr * on;
  return normalize(N - g * amp * on);
}
// Both flute scales in one pass (high quality): the per-cell fall lines (5 normal taps each) are found
// once and shared, instead of once per scale. The fine scale's pattern is offset by 7.3 m as before;
// tr1 = the coarse scale's trough, tFlute = the fine one's.
vec3 flutesCells2(vec3 p, vec3 N, float fp, float S1, float S2, float amp, out float tr1) {
  float slope = 1.0 - N.y;
  float sl = smoothstep(0.2, 0.36, slope) * (1.0 - smoothstep(0.62, 0.8, slope));
  vec3 q = p + 7.3;
  float on1 = sl * smoothstep(0.35, 0.6, texture2D(noiseTex, p.xz * 0.0031 + 0.27).r) * (1.0 - smoothstep(0.07, 0.2, fp / S1));
  float on2 = sl * smoothstep(0.35, 0.6, texture2D(noiseTex, q.xz * 0.0031 + 0.27).r) * (1.0 - smoothstep(0.07, 0.2, fp / S2));
  tr1 = 0.0; tFlute = 0.0;
  if (on1 <= 0.0 && on2 <= 0.0) return N;
  const float C = 64.0;
  vec2 cg = p.xz / C - 0.5;
  vec2 cb = floor(cg), cf = fract(cg);
  cf = cf * cf * (3.0 - 2.0 * cf);
  vec3 g1 = vec3(0.0), g2 = vec3(0.0);
  float t1 = 0.0, t2 = 0.0;
  // Smoothed cell normal from one tap of a ~32 m mip (the old 5-tap cross at ±18 m, 5x the fetches).
  float lodC = log2(32.0 / terrainSpacing);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 cc = (cb + vec2(float(i), float(j)) + 0.5) * C;
    vec2 nn = textureLod(normalTex, tUV(cc), lodC).rg * 2.0 - 1.0;
    vec2 fl = normalize(nn + vec2(1e-4, 0.0));
    vec2 ac = vec2(-fl.y, fl.x);
    vec3 ac3 = vec3(ac.x, 0.0, ac.y);
    float w = (i == 0 ? 1.0 - cf.x : cf.x) * (j == 0 ? 1.0 - cf.y : cf.y);
    float h = hash12(cc) * 40.0;
    float tt;
    if (on1 > 0.0) { float d = fluteD(dot(p.xz - cc, ac) + h, p.y, S1, tt); g1 += ac3 * d * w; t1 += tt * w; }
    if (on2 > 0.0) { float d = fluteD(dot(q.xz - cc, ac) + h, q.y, S2, tt); g2 += ac3 * d * w; t2 += tt * w; }
  }
  tr1 = t1 * on1; tFlute = t2 * on2;
  return normalize(normalize(N - g1 * amp * on1) - g2 * amp * on2);
}
`;

/** Albedo + normals + classification. Runs after map_fragment (vW / vWN available). */
export const SNOW_FRAG_GLSL = /* glsl */`
{
  vec2 xz = vW.xz;
  tFP = length(fwidth(vW));
  vec3 N = macroN(xz);
  vec4 s4 = texture2D(splatTex, tUV(xz));
  vec3 s = s4.rgb;
  float dist = length(vW - cameraPosition);
  {
    // Buttresses, ribs and gullies on steep ground (25–80 m) that the 1.25 m height grid smooths
    // away: breaks up long uniform walls and drives where snow sticks below.
    float steepF = smoothstep(0.2, 0.4, 1.0 - N.y) * 0.8;
    if (steepF > 0.0) {
      vec2 q = xz + vW.y * 0.6;
      vec2 gA = noiseGrad(q, 0.009, 3.0, 0) * 6.0;
      N = normalize(N - vec3(gA.x, 0.0, gA.y) * steepF);
    }
  }
  float farF = smoothstep(220.0, 900.0, dist);
  float midF = smoothstep(40.0, 160.0, dist);
  vec3 Vd = (vW - cameraPosition) / max(dist, 1e-3);

  // ---- large-scale fields
  float m1 = texture2D(noiseTex, xz * 0.0021 + 0.37).r;     // ~500 m patches
  float m2 = texture2D(noiseTex, xz * 0.0093 + 0.11).r;     // ~100 m
  float m3 = texture2D(noiseTex, xz * 0.047 + 0.71).g;      // ~20 m
  // Convexity (ridges / crests are wind scoured, hollows collect deep soft snow).
  vec3 Nx = macroN(xz + vec2(4.0, 0.0)), Nz = macroN(xz + vec2(0.0, 4.0));
  float convex = clamp(((Nx.x - N.x) + (Nz.z - N.z)) * 6.0, -1.0, 1.0);
  float alt = smoothstep(2500.0, 3300.0, vW.y + (m1 - 0.5) * 300.0);
  float exposure = clamp(0.25 + convex * 0.9 + alt * 0.45 + (m2 - 0.5) * 0.6, 0.0, 1.0);
  float groomed = smoothstep(0.25, 0.6, s.r);
  float forest = s.b;
  float tree = 0.0;
  #ifdef SNOW_TREEMASK
    tree = texture2D(uTreeMask, tUV(xz)).r;       // tree wells / under-canopy
  #endif

  // ---- rock: steep faces lose their snow; snow fills couloirs and sits on every ledge
  float slope = 1.0 - N.y;
  vec3 fT, fB;
  faceFrame(N, fT, fB);
  // Large-scale concavity across the face: gullies / couloirs hold snow, ribs and buttresses are bare.
  vec3 Na = macroN(xz + fT.xz * 30.0), Nb = macroN(xz - fT.xz * 30.0);
  float concav = clamp(-dot(Na - Nb, fT) * 3.0, -1.0, 1.0);
  // Slope over ~20 m: short steps (wall feet, berms) stay snow-filled, only real faces go bare.
  vec3 Nw = normalize(N + Na + Nb + macroN(xz + fB.xz * 10.0) + macroN(xz - fB.xz * 10.0));
  float slopeW = 1.0 - Nw.y;
  float exposeN = min(slope, slopeW + 0.06) + (m3 - 0.5) * 0.12 + (m2 - 0.5) * 0.1 - concav * 0.13 + exposure * 0.04;
  float rock = smoothstep(uRockLook.z - uRockLook.w, uRockLook.z + uRockLook.w, exposeN);
  rock = max(rock, smoothstep(0.35, 0.75, s.g + (m2 - 0.5) * 0.4) * smoothstep(0.1, 0.25, slope) * (1.0 - smoothstep(0.1, 0.4, concav)));
  vec3 rockCol = vec3(0.0);
  vec3 Nr = N;
  if (rock > 0.001) {
    vec3 Nh; float band;
    rockShade(vW, N, tFP, rockCol, Nr, Nh, band);
    // Snow sits wherever the large rock structure turns up toward the sky (facet tops, ledges,
    // broken strata bands); the steeper the face, the fewer facets can hold it.
    float hold = smoothstep(0.64, 0.78, Nh.y + (m3 - 0.5) * 0.14 + uRockLook.y);
    hold = max(hold, band * smoothstep(0.35, 0.6, texture2D(noiseTex, xz * 0.031 + 0.7).r + uRockLook.y));
    hold *= 1.0 - smoothstep(0.62, 0.85, slope) * 0.7;
    rock *= 1.0 - hold * mix(0.95, 0.6, farF);
  }

  // ---- snow normal: drifts → sastrugi → ripples → corduroy → grain
  vec3 Ns = N;
  float detailFade = (1.0 - farF) * smoothstep(0.5, 0.8, N.y);   // xz-projected detail would stretch on steep faces
  if (detailFade > 0.0) {
    // Soft drifts / pillows (metres).
    vec2 g1 = noiseGrad(xz, 0.011, 3.0, 0) * 7.0 + noiseGrad(xz, 0.052, 1.2, 0) * 0.55;
    Ns = normalize(Ns - vec3(g1.x, 0.0, g1.y) * uSnowShape.x * (1.0 - groomed * 0.7));
    vec2 wd = uWindDir, wp = vec2(-wd.y, wd.x);
    float sAl = dot(xz, wd), sAc = dot(xz, wp);
    // Sastrugi: sharp wind-carved ridges, elongated along the wind, on exposed snow.
    float sas = uSnowShape.z * smoothstep(0.55, 0.95, exposure) * (1.0 - groomed) * (1.0 - forest) * (1.0 - midF);
    if (sas > 0.01 && uDetail > 0.5) {
      vec2 q = vec2(sAl * 0.09, sAc * 0.42);
      float r0 = texture2D(noiseTex, q).b, ra = texture2D(noiseTex, q + vec2(0.006, 0.0)).b, rc = texture2D(noiseTex, q + vec2(0.0, 0.006)).b;
      vec2 gr = vec2((ra - r0) / (0.006 / 0.09), (rc - r0) / (0.006 / 0.42));
      float blot = smoothstep(0.35, 0.7, texture2D(noiseTex, xz * 0.021 + 0.5).g);
      vec2 gw = (wd * gr.x + wp * gr.y) * sas * blot * 0.05;
      Ns = normalize(Ns - vec3(gw.x, 0.0, gw.y));
    }
    // Wind ripples: asymmetric ripples across the wind (gentle stoss, steep lee), warped.
    float rip = uSnowShape.y * 0.4 * (0.3 + 0.7 * exposure) * (1.0 - groomed) * (1.0 - forest * 0.6);
    if (rip > 0.01 && uDetail > 0.5) {
      float warp = (texture2D(noiseTex, xz * 0.011).r - 0.5) * 7.0 + (texture2D(noiseTex, xz * 0.045 + 0.2).r - 0.5) * 0.9;
      float k = 6.2831853 / 0.32;
      float ph = (sAl + warp) * k;
      float fw = tFP * k;
      float aa = 1.0 - smoothstep(0.6, 2.2, fw);
      float blot = smoothstep(0.45, 0.8, texture2D(noiseTex, xz * 0.031 + 0.17).r + exposure * 0.25) * smoothstep(0.3, 0.6, texture2D(noiseTex, xz * 0.0077 + 0.4).g);
      float dh = (cos(ph) + 0.45 * cos(2.0 * ph + 0.6)) * 0.022 * k;
      vec2 gw = wd * dh * rip * aa * blot;
      Ns = normalize(Ns - vec3(gw.x, 0.0, gw.y));
    }
    // Groomed corduroy: fine straight ridges down the fall line in ~5.5 m groomer lanes, worn by
    // traffic. Each 48 m cell grooms in one straight direction (its own fall line, local origin);
    // the four nearest cells are blended so the lines stay straight (no moiré "fingerprints").
    if (groomed > 0.01 && uDetail > 0.5) {
      float k = 6.2831853 / 0.06;
      float aa = 1.0 - smoothstep(0.5, 1.8, tFP * k);
      float worn = smoothstep(0.45, 0.75, texture2D(noiseTex, xz * 0.05 + 0.3).r + (m3 - 0.5) * 0.4);
      float amp = uSnowShape.w * groomed * (1.0 - worn * 0.85);
      vec2 cg = xz / 48.0 - 0.5;
      vec2 cb = floor(cg), cf = fract(cg);
      cf = cf * cf * (3.0 - 2.0 * cf);
      vec2 gsum = vec2(0.0);
      float cav = 0.0, laneB = 0.0;
      vec2 sunXZ = normalize(uSunDir.xz + 1e-4);
      for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
        vec2 cc = (cb + vec2(float(i), float(j)) + 0.5) * 48.0;
        vec3 nC = macroN(cc);
        vec2 fl = normalize(nC.xz + vec2(1e-4, 0.0));
        vec2 ac = vec2(-fl.y, fl.x);
        float w = (i == 0 ? 1.0 - cf.x : cf.x) * (j == 0 ? 1.0 - cf.y : cf.y);
        float across = dot(xz - cc, ac) + hash12(cc) * 5.5;
        float lane = fract(across / 5.5);
        float seam = smoothstep(0.03, 0.0, lane) + smoothstep(0.97, 1.0, lane);
        gsum += ac * (sin(across * k) * 0.004 * k * aa + seam * 0.35) * w;
        cav += abs(dot(sunXZ, ac)) * w;
        laneB += (hash12(vec2(floor(across / 5.5), hash12(cc) * 17.0)) - 0.5) * w;
      }
      vec2 gc = gsum * amp;
      Ns = normalize(Ns - vec3(gc.x, 0.0, gc.y));
      // Unresolved ridges still read: they self-shadow when the sun crosses them, and each groomer
      // pass has its own slight brightness.
      tCavity *= 1.0 - amp * (1.0 - aa) * (0.05 + 0.1 * cav);
      tCordLane = laneB * 0.05 * amp;
    }
    // Micro grain: crystals / clumps at a few cm, only up close.
    float near = 1.0 - smoothstep(6.0, 28.0, dist);
    if (near > 0.0) {
      vec2 gm = noiseGrad(xz, 0.9, 0.025, 1) * 0.012 + noiseGrad(xz, 3.1, 0.008, 0) * 0.004;
      Ns = normalize(Ns - vec3(gm.x, 0.0, gm.y) * near * (1.0 - groomed * 0.5));
    }
    Ns = normalize(mix(N, Ns, detailFade));
  }

  // ---- sluff flutes on steep snow (walls, valley sides)
  #ifdef SNOW_FLUTES
  float fl1;
  Ns = flutesCells2(vW, Ns, tFP, 15.0, 4.0, 0.12, fl1);
  tCavity *= 1.0 - 0.1 * max(tFlute, fl1);
  #endif

  // ---- carved tracks: deep soft trenches with pushed-up lips (parallax on high quality)
  vec2 tp = xz;
  float trD = uTrackLook.x;
  #ifdef SNOW_TRACKS
  if (dist < uTrackRegion.z * 0.5 + 10.0) {
    #if SNOW_TRACKS > 1
    if (dist < 36.0) {
      // Parallax occlusion: march the view ray down into the trench height field, then refine the
      // crossing with a short binary search (no stepped "contour" layers).
      float ndv = max(dot(-Vd, N), 0.18);
      vec2 perDepth = (Vd.xz - N.xz * dot(Vd, N)) / ndv;
      float lo = 0.0, hi = -1.0;
      for (int i = 1; i <= 7; i++) {
        float d = float(i) / 7.0 * trD;
        if (trackAtLod(xz + perDepth * d) * trD < d) { hi = d; break; }
        lo = d;
      }
      if (hi > 0.0) {
        for (int k = 0; k < 3; k++) {
          float m = 0.5 * (lo + hi);
          if (trackAtLod(xz + perDepth * m) * trD < m) hi = m; else lo = m;
        }
        lo = 0.5 * (lo + hi);
      }
      tp = xz + perDepth * lo * (1.0 - smoothstep(24.0, 36.0, dist));   // fades out, never switches off (sub-pixel beyond)
    }
    #endif
    // Stencils grow with the pixel footprint: the track map has no mips, so distant grooves would
    // otherwise alias into dashes.
    float e = max(0.045, tFP * 0.75), E = max(0.28, tFP * 2.5);
    float t0 = trackAt(tp);
    float tx1 = trackAt(tp + vec2(e, 0.0)), tx0 = trackAt(tp - vec2(e, 0.0));
    float tz1 = trackAt(tp + vec2(0.0, e)), tz0 = trackAt(tp - vec2(0.0, e));
    float bx1 = trackAt(tp + vec2(E, 0.0)), bx0 = trackAt(tp - vec2(E, 0.0));
    float bz1 = trackAt(tp + vec2(0.0, E)), bz0 = trackAt(tp - vec2(0.0, E));
    t0 = mix(t0, (t0 * 2.0 + tx1 + tx0 + tz1 + tz0) / 6.0, smoothstep(0.03, 0.08, tFP));
    float blur = (bx1 + bx0 + bz1 + bz0) * 0.25;
    float lip = max(blur - t0, 0.0);
    // height = -depth * t + lip, gradients from the small and large stencils.
    vec2 gSmall = vec2(tx1 - tx0, tz1 - tz0) / (2.0 * e);
    vec2 gLarge = vec2(bx1 - bx0, bz1 - bz0) / (2.0 * E);
    vec2 gh = -gSmall * trD + gLarge * trD * uTrackLook.y * (1.0 - t0);
    Ns = normalize(Ns - vec3(gh.x, 0.0, gh.y) * 0.9);
    tTrack = t0;
    tCavity *= 1.0 - uTrackLook.z * t0 * smoothstep(0.05, 0.3, trD);
    tCavity *= 1.0 + lip * 0.25;
  }
  #endif

  // ---- tree wells and forest floor: a soft dip around trunks, darker under the canopy
  if (tree > 0.001) {
    tCavity *= 1.0 - 0.35 * tree;
    #ifdef SNOW_TREEMASK
    vec2 tg = vec2(texture2D(uTreeMask, tUV(xz + vec2(1.0, 0.0))).r - texture2D(uTreeMask, tUV(xz - vec2(1.0, 0.0))).r,
                   texture2D(uTreeMask, tUV(xz + vec2(0.0, 1.0))).r - texture2D(uTreeMask, tUV(xz - vec2(0.0, 1.0))).r);
    Ns = normalize(Ns + vec3(tg.x, 0.0, tg.y) * 0.9 * (1.0 - farF));
    #endif
  }

  // ---- albedo: fresh powder vs wind-packed / groomed / sun-glazed; subtle large-scale variation
  vec3 snowCol = mix(uSnowAlbedo, uSnowOld, clamp(groomed * 0.8 + exposure * 0.25 + tTrack * 0.4, 0.0, 1.0));
  snowCol *= 0.97 + 0.05 * m2 + 0.02 * (m3 - 0.5) + tCordLane;
  float sunFace = max(dot(N, uSunDir), 0.0);
  tGlaze = clamp(groomed * 0.6 + exposure * 0.35 * sunFace + tTrack * 0.5, 0.0, 1.0);
  snowCol = mix(snowCol, snowCol * vec3(0.93, 0.94, 0.96), forest * 0.25 + tree * 0.3);   // needle litter / shade
  // Snow either covers the rock or it does not: sharpen the transition (no grey smudges), but keep
  // it soft in the distance where it is sub-pixel anyway.
  rock = clamp(rock, 0.0, 1.0);
  rock = mix(smoothstep(0.25, 0.6, rock + (m3 - 0.5) * 0.1), rock, farF);
  diffuseColor.rgb = mix(snowCol, rockCol, rock);
  tCavity *= 1.0 - rock * tRockJoint * 0.55;          // cracks are dark in skylight too
  tN = normalize(mix(Ns, Nr, rock));
  tRock = rock;
  tGlintMask = (1.0 - rock) * (1.0 - tTrack * 0.6) * (1.0 - groomed * 0.4);
  // Lake surface (Lake Tahoe on the real mountains): deep blue, brighter at grazing angles.
  if (vW.y < uWater + 0.9 && N.y > 0.985) {
    vec3 Vw = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(Vw.y, 0.0), 3.0);
    diffuseColor.rgb = mix(vec3(0.01, 0.04, 0.08), vec3(0.25, 0.4, 0.6), fr);
    tRock = 1.0; tTrack = 0.0; tGlintMask = 0.0;
  }
}
`;

/** Far backdrop (30 km): snow / dark forest / rock by slope and altitude. */
export const FAR_SNOW_FRAG_GLSL = /* glsl */`
{
  vec3 N = normalize(vWN);
  float dist = length(vW - cameraPosition);
  // Relief the 58 m backdrop grid cannot hold: ridges, gullies and spurs from noise gradients.
  {
    vec2 q1 = vW.xz * 0.0011, q2 = vW.xz * 0.0047 + 0.3;
    float a1 = texture2D(noiseTex, q1).r, a2 = texture2D(noiseTex, q2).r;
    vec2 g1 = vec2(texture2D(noiseTex, q1 + vec2(0.002, 0.0)).r - a1, texture2D(noiseTex, q1 + vec2(0.0, 0.002)).r - a1) / 0.002 * 0.0011;
    vec2 g2 = vec2(texture2D(noiseTex, q2 + vec2(0.003, 0.0)).r - a2, texture2D(noiseTex, q2 + vec2(0.0, 0.003)).r - a2) / 0.003 * 0.0047;
    float steep = smoothstep(0.03, 0.25, 1.0 - N.y) * (0.2 + 0.8 * smoothstep(2500.0, 7000.0, dist));
    N = normalize(N - vec3(g1.x, 0.0, g1.y) * 150.0 * steep - vec3(g2.x, 0.0, g2.y) * 60.0 * steep);
  }
  // Mid ring seen from close (a few hundred metres to ~3 km, e.g. the face above a spawn near the
  // tile edge): the 10 m grid smooths faces into blobs. Buttresses, ribs and gullies (35–110 m, the
  // same field the playable tile uses on its steep ground) faded out by pixel footprint (no aliasing).
  float fpW = length(fwidth(vW));
  {
    float on = smoothstep(0.18, 0.4, 1.0 - N.y) * (1.0 - smoothstep(3.0, 9.0, fpW)) * uFarNear.y;
    if (on > 0.0) {
      vec2 q = vW.xz + vW.y * 0.6;
      vec2 qa = q * 0.009, qb = q * 0.027 + 0.41;
      float a0 = texture2D(noiseTex, qa).r, b0 = texture2D(noiseTex, qb).r;
      vec2 ga = vec2(texture2D(noiseTex, qa + vec2(0.027, 0.0)).r - a0, texture2D(noiseTex, qa + vec2(0.0, 0.027)).r - a0) / 3.0;
      vec2 gb = vec2(texture2D(noiseTex, qb + vec2(0.027, 0.0)).r - b0, texture2D(noiseTex, qb + vec2(0.0, 0.027)).r - b0) / 1.0;
      float onB = 1.0 - smoothstep(1.0, 3.0, fpW);
      N = normalize(N - vec3(ga.x, 0.0, ga.y) * 6.0 * on - vec3(gb.x, 0.0, gb.y) * 2.2 * on * onB);
    }
  }
  #ifndef FAR_LITE
  N = flutes(vW, N, length(fwidth(vW)), 15.0, 0.14);
  N = flutes(vW * 0.37, N, length(fwidth(vW)) * 0.37, 15.0, 0.14);   // 40 m spines far away
  #endif
  tN = N;
  float m = texture2D(noiseTex, vW.xz * 0.0004).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.003 + 0.5).r;
  float m3 = texture2D(noiseTex, vW.xz * 0.011 + 0.2).g;
  float slope = 1.0 - N.y;
  float rock = smoothstep(uRockLook.z - 0.06, uRockLook.z + 0.06, slope + (m2 - 0.5) * 0.22 + (m3 - 0.5) * 0.12);
  // Gullies and couloirs hold snow even on steep faces (cheap: ridged noise down the slope).
  rock *= smoothstep(0.15, 0.45, texture2D(noiseTex, vW.xz * 0.0021 + vW.y * 0.0003).b + slope * 0.3);
  // The sunken backdrop rim (low, far out) reads as snow; the distant ranges ring keeps its rock.
  rock *= 1.0 - smoothstep(10500.0, 12500.0, max(abs(vW.x), abs(vW.z))) * (1.0 - smoothstep(1400.0, 1900.0, vW.y));
  float forest = (1.0 - smoothstep(uFarForest.x - uFarForest.y, uFarForest.x, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * (1.0 - smoothstep(uFarForest.z - 2500.0, uFarForest.z, max(abs(vW.x), abs(vW.z)))) * smoothstep(0.03, 0.14, slope) * smoothstep(0.35, 0.55, m2 + 0.15);
  vec3 rc = vec3(0.4);
  // How much real rock structure (fracture blocks, joints, ledges holding snow) to draw. Full on high;
  // on low / medium (FAR_LITE) only within uFarNear.x metres, fading to a plain rock tone beyond.
  float rockDetail = 1.0;
  #ifdef FAR_LITE
  rc = rockAlbedo(abs(N.x) > abs(N.z) ? vW.zy : vW.xy, 1.0);    // plain rock tone (far)
  rockDetail = 1.0 - smoothstep(uFarNear.x * 0.6, uFarNear.x, dist);
  #endif
  if (rock > 0.001 && rockDetail > 0.0) {
    vec3 Nr, Nh, rcD; float band;
    rockShade(vW, N, fpW, rcD, Nr, Nh, band);
    float hold = smoothstep(0.66, 0.8, Nh.y + (m3 - 0.5) * 0.14 + uRockLook.y);
    hold = max(hold, band * 0.7);
    hold *= 1.0 - smoothstep(0.62, 0.85, slope) * 0.7;
    rock *= 1.0 - hold * 0.85 * rockDetail;
    rc = mix(rc, rcD, rockDetail);
    tN = normalize(mix(N, Nr, rock * rockDetail));
  }
  vec3 sc = uSnowAlbedo * (0.94 + 0.06 * m2);
  diffuseColor.rgb = mix(mix(sc, uForestCol, forest * 0.9), rc, rock);
  tRock = max(rock, forest);
  tGlintMask = 0.0;
  if (vW.y < uWater + 0.9 && N.y > 0.985) {
    vec3 Vw = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(Vw.y, 0.0), 3.0);
    diffuseColor.rgb = mix(vec3(0.01, 0.04, 0.08), vec3(0.25, 0.4, 0.6), fr);
    tRock = 1.0;
  }
}
`;

/**
 * Snow optics (runs inside world.js's lighting block, which provides ndl, shadow, occl, sky,
 * light, sunV, nW and toonAdd). Linear HDR, Lambert units (sun colour = irradiance / π).
 */
export const SNOW_BAND_GLSL = /* glsl */`
{
  float snow = 1.0 - tRock;
  float wrapS = uSnowLook.x * snow;
  float nl = clamp((ndl + wrapS) / (1.0 + wrapS), 0.0, 1.0);
  float lam = max(ndl, 0.0);
  // Subsurface: light leaking through the snow near the terminator, tinted cyan-blue.
  vec3 sss = uSnowSSS * max(nl - lam, 0.0) * shadow * snow * 2.0;
  // Sky light is directional too (brightest from overhead / the sun side): reveals snow relief in shade.
  float skyDir = clamp(dot(nW, normalize(vec3(uSunDir.x * 0.35, 1.0, uSunDir.z * 0.35))), 0.0, 1.0);
  // (rock too: facets turned up toward the open sky are brighter, which is what shows relief in shade)
  vec3 skyL = sky * tCavity * mix(1.0, 0.66 + 0.38 * pow(skyDir, 3.0), max(snow, 0.8));
  light = uSunCol * nl * shadow + skyL + sss * uSunCol;
  // Specular: rough GGX sheen (tighter on glazed crust) + forward scattering toward the sun.
  vec3 Vv = normalize(vViewPosition);
  vec3 Hh = normalize(sunV + Vv);
  float ndh = max(dot(normal, Hh), 0.0), ndv = max(dot(normal, Vv), 1e-3), nlS = max(ndl, 0.0);
  float rgh = mix(uSnowLook.y, uSnowLook.y * 0.55, tGlaze);
  float a2 = pow(rgh, 4.0);
  float dd = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  float k = rgh * rgh * 0.5;
  float vis = 0.25 / ((nlS * (1.0 - k) + k) * (ndv * (1.0 - k) + k));
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(Vv, Hh), 0.0), 5.0);
  vec3 spec = uSunCol * (3.14159 * D * vis * F * nlS * uSnowLook.z) * shadow;
  float fwd = pow(max(dot(-Vv, sunV), 0.0), 6.0) * pow(1.0 - ndv, 2.0) * nlS;
  spec += uSunCol * fwd * uSnowLook.w * shadow;
  toonAdd += spec * snow * tCavity;
  // Sparkle: a world-space jittered grid of ice facets; each glints when its random normal
  // mirrors the sun into the eye (2 scales, footprint-faded so they stay 1–2 px).
  #ifdef SNOW_SPARKLE
  if (uSparkle.x > 0.0 && tGlintMask > 0.01 && shadow > 0.05) {
    vec3 Vw = normalize(cameraPosition - vW);
    float fp = tFP;
    vec3 nw = inverseTransformDirection(normal, viewMatrix);
    float gl = 0.0;
    for (int sc = 0; sc < 2; sc++) {
      float cells = sc == 0 ? 55.0 : 16.0;
      float lodW = sc == 0 ? 1.0 - smoothstep(0.35, 0.7, fp * cells) : smoothstep(0.25, 0.6, fp * 55.0) * (1.0 - smoothstep(0.4, 0.9, fp * cells));
      if (lodW <= 0.0) continue;
      vec2 q = vW.xz * cells;
      vec2 cid = floor(q);
      vec3 h = hash32(cid + float(sc) * 17.0);
      if (h.z > uSparkle.y) continue;
      vec2 off = fract(q) - (0.25 + 0.5 * h.xy);
      float r = length(off);
      vec3 hb = hash32(cid * 1.37 + 5.1);
      // Ice facets point every which way (biased up): some always mirror the sun into the eye.
      vec3 rd = normalize(hb * 2.0 - 1.0 + vec3(0.0, 1e-3, 0.0));
      vec3 fn = normalize(nw * uSparkle.z + rd);
      float al = dot(reflect(-uSunDir, fn), Vw);
      float spot = 1.0 - smoothstep(0.0, max(0.15, fp * cells * 1.1), r);
      gl += smoothstep(0.989, 0.998, al) * spot * lodW;
    }
    toonSparkle = gl * uSparkle.x * tGlintMask * shadow * snow;
  }
  #endif
}
`;
