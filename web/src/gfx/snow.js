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

const lin = (hex) => new THREE.Color(hex);   // three converts sRGB hex → linear working space

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
  };
}

/** Shared declarations (fragment) for terrain + far backdrop. */
export const SNOW_COMMON_PARS = /* glsl */`
uniform vec3 uSnowAlbedo; uniform vec3 uSnowOld; uniform vec3 uSnowSSS; uniform vec4 uSnowLook; uniform vec3 uSparkle;
uniform vec2 uWindDir; uniform float uDetail; uniform vec4 uSnowShape; uniform vec3 uTrackLook;
uniform vec3 uRockA; uniform vec3 uRockB; uniform vec3 uRockC; uniform vec4 uRockLook; uniform vec3 uForestCol;
uniform sampler2D noiseTex;
float tRock = 0.0;          // rock / forest / water coverage (no snow optics there)
float tTrack = 0.0;         // carved trench depth (0..1)
float tCavity = 1.0;        // small-scale occlusion (trench bottoms, tree wells)
float tGlaze = 0.0;         // sun / wind glazed crust: tighter sheen
float tGlintMask = 1.0;     // where glints may appear
float tSnowWet = 0.0;
float tFP = 0.01;           // world metres per pixel (set before any branch)
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
// One planar projection of the rock: albedo, facet gradient (uv), ledge riser mask, snow segment mask.
vec3 rockAlbedo(vec2 uv, float far);
void rockLayer(vec2 uv, float farF, float midF, out vec3 col, out vec2 g, out float riser, out float seg) {
  col = rockAlbedo(uv, farF);
  float warp = texture2D(noiseTex, uv * vec2(0.006, 0.02) + 0.2).r;
  float f = fract(uv.y / uRockLook.x + warp * 0.9 + texture2D(noiseTex, uv * vec2(0.01, 0.03)).g * 0.35);
  float tw = 0.1 + 0.3 * texture2D(noiseTex, uv * vec2(0.012, 0.05) + 0.9).g;
  float tread = 1.0 - smoothstep(tw * 0.4, tw, f) * (1.0 - smoothstep(0.93, 1.0, f));
  tread *= 1.0 - smoothstep(0.04, 0.12, tFP / uRockLook.x);            // fine ledges vanish with distance
  // Coarse bands (big ledge systems), irregular and broken.
  float S2 = uRockLook.x * 4.3;
  float f2 = fract(uv.y / S2 + warp * 2.2 + texture2D(noiseTex, uv * vec2(0.006, 0.01) + 0.4).g * 1.2);
  float tread2 = 1.0 - smoothstep(0.06, 0.16, f2) * (1.0 - smoothstep(0.9, 1.0, f2));
  tread2 *= smoothstep(0.5, 0.62, texture2D(noiseTex, uv * vec2(0.017, 0.03) + 0.33).r);
  tread2 *= 1.0 - smoothstep(0.06, 0.2, tFP / S2);
  riser = 1.0 - max(tread, tread2);
  // Fractured blocks: Voronoi cells, each a tilted facet; dark joints between them.
  vec3 v1 = rockCells(uv * vec2(1.0, 1.6) / 4.2);
  g = (hash32(v1.z * vec2(7.1, 3.3)).xy - 0.5) * 0.9 * (1.0 - farF);
  float joint = (1.0 - smoothstep(0.02, 0.07, v1.y)) * smoothstep(0.35, 0.6, texture2D(noiseTex, uv * 0.02 + 0.8).r);
  float tone = hash12(vec2(v1.z, 1.7));
  if (midF < 1.0) {
    vec3 v2 = rockCells(uv / 1.1 + 3.7);
    g += (hash32(v2.z * vec2(2.3, 5.9)).xy - 0.5) * 0.55 * (1.0 - midF);
    joint = max(joint, (1.0 - smoothstep(0.03, 0.1, v2.y)) * 0.6 * (1.0 - midF));
    vec2 q = uv * 0.19 + 0.5;
    float l0 = texture2D(noiseTex, q).g;
    g += vec2(texture2D(noiseTex, q + vec2(0.02, 0.0)).g - l0, texture2D(noiseTex, q + vec2(0.0, 0.02)).g - l0) * 1.1 * (1.0 - midF);
  }
  col *= (1.0 + (tone - 0.5) * 0.22 * (1.0 - 0.75 * midF)) * (1.0 - joint * 0.22 * (1.0 - midF));
  seg = smoothstep(0.42, 0.62, texture2D(noiseTex, uv * vec2(0.025, 0.1) + 0.7).r + uRockLook.y);
}
// Rock albedo: grey gneiss in blocks, lighter/darker beds, vertical runoff streaks, iron staining.
vec3 rockAlbedo(vec2 uv, float far) {
  float b1 = texture2D(noiseTex, uv * 0.017).r;
  float b2 = mix(texture2D(noiseTex, uv * 0.083 + 0.3).g, 0.5, far);
  float b3 = mix(texture2D(noiseTex, uv * 0.31 + 0.6).g, 0.5, far);
  float beds = texture2D(noiseTex, vec2(uv.x * 0.004, uv.y * 0.045) + 0.1).r;      // layering along the face
  float streak = texture2D(noiseTex, vec2(uv.x * 0.11, uv.y * 0.007) + 0.4).g;    // water-stain streaks (vertical)
  vec3 c = mix(uRockA, uRockB, smoothstep(0.25, 0.8, b1 * 0.5 + beds * 0.5 + (b2 - 0.5) * 0.5));
  c = mix(c, uRockC, smoothstep(0.66, 0.85, b1 + (beds - 0.5) * 0.3) * 0.5);
  c *= mix(1.0, 0.62, smoothstep(0.55, 0.8, streak) * 0.8 * (1.0 - far * 0.7));
  c *= 0.82 + 0.3 * b3;
  return c;
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
    // Bi-planar projection (stable world axes, never stretched on steep faces).
    vec2 wxz = pow(abs(N.xz) + 1e-4, vec2(4.0));
    wxz /= wxz.x + wxz.y;
    vec3 cA = vec3(0.0), cB = vec3(0.0); vec2 gA = vec2(0.0), gB = vec2(0.0);
    float rA = 0.0, rB = 0.0, sA = 0.0, sB = 0.0;
    float sx = N.x < 0.0 ? -1.0 : 1.0, sz = N.z < 0.0 ? -1.0 : 1.0;
    if (wxz.x > 0.03) rockLayer(vec2(vW.z * sx, vW.y), farF, midF, cA, gA, rA, sA);
    if (wxz.y > 0.03) rockLayer(vec2(-vW.x * sz, vW.y) + 37.0, farF, midF, cB, gB, rB, sB);
    rockCol = cA * wxz.x + cB * wxz.y;
    float riser = rA * wxz.x + rB * wxz.y;
    float seg = sA * wxz.x + sB * wxz.y;
    float rr = mix(riser, 0.5, farF);
    vec3 pert = wxz.x * vec3(0.0, gA.y, gA.x * sx) + wxz.y * vec3(-gB.x * sz, gB.y, 0.0);
    Nr = normalize(N + fB * (0.75 - rr) * 0.7 + pert);
    // Snow on treads + anywhere the detailed rock turns up toward the sky.
    float ledge = (1.0 - riser) * seg;
    vec3 NrL = normalize(N + fB * (0.75 - rr) * 0.7);           // ledge structure only (no facet tilt)
    ledge = max(ledge, smoothstep(0.8, 0.95, NrL.y + (m3 - 0.5) * 0.15) * seg);
    ledge *= 1.0 - smoothstep(0.55, 0.8, slope) * 0.6;
    rock *= 1.0 - ledge * mix(0.9, 0.55, farF);
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
      float blot = smoothstep(0.3, 0.75, texture2D(noiseTex, xz * 0.031 + 0.17).r + exposure * 0.2);
      float dh = (cos(ph) + 0.45 * cos(2.0 * ph + 0.6)) * 0.022 * k;
      vec2 gw = wd * dh * rip * aa * blot;
      Ns = normalize(Ns - vec3(gw.x, 0.0, gw.y));
    }
    // Groomed corduroy: fine ridges down the fall line in ~5.5 m groomer lanes, worn by traffic.
    if (groomed > 0.01 && uDetail > 0.5) {
      vec2 fl = normalize(N.xz + vec2(1e-4, 0.0));       // downhill (horizontal)
      vec2 ac = vec2(-fl.y, fl.x);
      float across = dot(xz, ac);
      float k = 6.2831853 / 0.06;
      float ph = across * k;
      float aa = 1.0 - smoothstep(0.5, 1.8, tFP * k);
      float lane = fract(across / 5.5);
      float seam = smoothstep(0.03, 0.0, lane) + smoothstep(0.97, 1.0, lane);
      float worn = smoothstep(0.45, 0.75, texture2D(noiseTex, xz * 0.05 + 0.3).r + (m3 - 0.5) * 0.4);
      float amp = uSnowShape.w * groomed * (1.0 - worn * 0.85);
      vec2 gc = ac * (sin(ph) * 0.004 * k * aa + seam * 0.35) * amp;
      Ns = normalize(Ns - vec3(gc.x, 0.0, gc.y));
    }
    // Micro grain: crystals / clumps at a few cm, only up close.
    float near = 1.0 - smoothstep(6.0, 28.0, dist);
    if (near > 0.0) {
      vec2 gm = noiseGrad(xz, 0.9, 0.025, 1) * 0.012 + noiseGrad(xz, 3.1, 0.008, 0) * 0.004;
      Ns = normalize(Ns - vec3(gm.x, 0.0, gm.y) * near * (1.0 - groomed * 0.5));
    }
    Ns = normalize(mix(N, Ns, detailFade));
  }

  // ---- carved tracks: deep soft trenches with pushed-up lips (parallax on high quality)
  vec2 tp = xz;
  float trD = uTrackLook.x;
  #ifdef SNOW_TRACKS
  if (dist < uTrackRegion.z * 0.5 + 10.0) {
    #if SNOW_TRACKS > 1
    if (dist < 45.0) {
      // Steep parallax: march the view ray down into the trench height field.
      float ndv = max(dot(-Vd, N), 0.18);
      vec2 perDepth = (Vd.xz - N.xz * dot(Vd, N)) / ndv;
      float lay = 0.0;
      for (int i = 1; i <= 10; i++) {
        float d = float(i) / 10.0 * trD;
        vec2 q = xz + perDepth * d;
        if (trackAt(q) * trD < d) break;
        tp = q; lay = d;
      }
    }
    #endif
    float e = 0.045, E = 0.28;
    float t0 = trackAt(tp);
    float tx1 = trackAt(tp + vec2(e, 0.0)), tx0 = trackAt(tp - vec2(e, 0.0));
    float tz1 = trackAt(tp + vec2(0.0, e)), tz0 = trackAt(tp - vec2(0.0, e));
    float bx1 = trackAt(tp + vec2(E, 0.0)), bx0 = trackAt(tp - vec2(E, 0.0));
    float bz1 = trackAt(tp + vec2(0.0, E)), bz0 = trackAt(tp - vec2(0.0, E));
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
  snowCol *= 0.97 + 0.05 * m2 + 0.02 * (m3 - 0.5);
  float sunFace = max(dot(N, uSunDir), 0.0);
  tGlaze = clamp(groomed * 0.6 + exposure * 0.35 * sunFace + tTrack * 0.5, 0.0, 1.0);
  snowCol = mix(snowCol, snowCol * vec3(0.93, 0.94, 0.96), forest * 0.25 + tree * 0.3);   // needle litter / shade
  // Snow either covers the rock or it does not: sharpen the transition (no grey smudges), but keep
  // it soft in the distance where it is sub-pixel anyway.
  rock = clamp(rock, 0.0, 1.0);
  rock = mix(smoothstep(0.25, 0.6, rock + (m3 - 0.5) * 0.1), rock, farF);
  diffuseColor.rgb = mix(snowCol, rockCol, rock);
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
    float steep = smoothstep(0.03, 0.25, 1.0 - N.y) * (0.45 + 0.55 * smoothstep(800.0, 4000.0, dist));
    N = normalize(N - vec3(g1.x, 0.0, g1.y) * 150.0 * steep - vec3(g2.x, 0.0, g2.y) * 60.0 * steep);
  }
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
  float forest = (1.0 - smoothstep(2050.0, 2350.0, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * (1.0 - smoothstep(7000.0, 9500.0, max(abs(vW.x), abs(vW.z)))) * smoothstep(0.03, 0.14, slope) * smoothstep(0.35, 0.55, m2 + 0.15);
  vec3 rc = rockAlbedo(abs(N.x) > abs(N.z) ? vW.zy : vW.xy, 1.0);
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
  vec3 skyL = sky * tCavity * mix(1.0, 0.66 + 0.38 * pow(skyDir, 3.0), snow);
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
