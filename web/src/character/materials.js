// Materials for the rider's outfit, built on world.js toonMaterial (linear HDR sun + sky model, baked
// mountain shadows) with extra hooks: a procedural panel / seam / zip layout per garment piece,
// bump-mapped seams and wrinkles, and a fabric BRDF (matte DWR nylon: Charlie sheen + a broad GGX lobe
// + grazing sky sheen). The colours are uniforms, so a colourway change is free.
import * as THREE from 'three';
import { toonMaterial } from '../world.js';
import { PATTERNS, FINISHES, DECALS } from './outfits.js';

const col = (c) => new THREE.Color(c);

/** Extra shader edits on top of toonMaterial: { normal: GLSL after normal_fragment_maps }. */
function extend(m, { normal = '', key = '' } = {}) {
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    base(shader, r);
    if (normal) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normal}`);
  };
  const k0 = m.customProgramCacheKey;
  m.customProgramCacheKey = () => k0() + key + normal.length;
  return m;
}

// Shared GLSL: hash noise, bump from a height field (screen-space derivatives), the fabric BRDF.
const COMMON = /* glsl */`
float chHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float chNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(chHash(i), chHash(i + vec2(1, 0)), f.x), mix(chHash(i + vec2(0, 1)), chHash(i + vec2(1, 1)), f.x), f.y) * 2.0 - 1.0;
}
// Gradient noise, periodic in x every px cells (seamless around a garment), no lattice-line artefacts.
float chPerlin(vec2 p, float px) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i1 = vec2(mod(i.x + 1.0, px), i.y), i0 = vec2(mod(i.x, px), i.y);
  float a0 = chHash(i0) * 6.2831853, a1 = chHash(i1) * 6.2831853;
  float a2 = chHash(i0 + vec2(0, 1)) * 6.2831853, a3 = chHash(i1 + vec2(0, 1)) * 6.2831853;
  float a = dot(vec2(cos(a0), sin(a0)), f), b = dot(vec2(cos(a1), sin(a1)), f - vec2(1, 0));
  float c = dot(vec2(cos(a2), sin(a2)), f - vec2(0, 1)), d = dot(vec2(cos(a3), sin(a3)), f - vec2(1, 1));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 1.6;
}
// Antialiased line mask: 1 within w of d = 0.
float chLine(float d, float w) { float fw = fwidth(d) + 1e-5; return (1.0 - smoothstep(w, w + fw * 1.5, abs(d))) * clamp(w * 2.0 / fw, 0.15, 1.0); }
float chBox(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 chBump(vec3 pos, vec3 n, float h, float fd) {
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

// Reward prints (character/outfits.js PATTERNS): q = (u around the piece 0..1, v height / length in
// metres), K = repeats around the piece, bandY = where a chest / knee band, a fade or the skull's mouth
// sits. `ink` returns the print's ink mask (neon finishes light it up).
const PRINTS = /* glsl */`
vec3 chPrint(float pat, vec2 q, float K, vec3 base, vec3 A, vec3 B, float bandY, out float ink) {
  ink = 0.0;
  if (pat < 0.5) return base;
  float uc = q.x - floor(q.x + 0.5);
  if (pat < 1.5) {                                  // 1 camo: three-colour woodland blobs
    float n1 = chPerlin(vec2(q.x * K, q.y * 6.5), K) + 0.35 * chPerlin(vec2(q.x * K * 2.0, q.y * 13.0), K * 2.0);
    float n2 = chPerlin(vec2(q.x * K + 7.0, q.y * 6.5 + 3.7), K) + 0.35 * chPerlin(vec2(q.x * K * 2.0 + 3.0, q.y * 13.0 + 1.3), K * 2.0);
    float a = smoothstep(0.16, 0.2, n1), b = smoothstep(0.2, 0.24, n2) * (1.0 - a);
    ink = a;
    return mix(mix(base, A, a), B, b);
  }
  if (pat < 2.5) {                                  // 2 digital camo: blocky pixels
    vec2 cell = floor(vec2(q.x * K * 5.0, q.y * 30.0));
    float n = chNoise(cell * 0.32) + 0.5 * (chHash(cell) - 0.5);
    float a = step(0.22, n), b = step(n, -0.3);
    ink = a;
    return mix(mix(base, A, a), B, b);
  }
  if (pat < 3.5) {                                  // 3 stripes around the piece
    float st = step(0.62, fract(q.x * K * 2.0));
    ink = st;
    return mix(base, A, st);
  }
  if (pat < 4.5) {                                  // 4 retro band: wide band + pinstripe
    float d = q.y - bandY;
    float b1 = step(0.0, d) * step(d, 0.075), b2 = step(0.09, d) * step(d, 0.115);
    ink = b1 + b2;
    return mix(mix(base, A, b1), B, b2);
  }
  if (pat < 5.5) {                                  // 5 two-tone diagonal split
    float s = uc * 1.3 + (q.y - bandY) * 0.9;
    float a = step(0.0, s);
    ink = a;
    return mix(B, A, a);
  }
  if (pat < 6.5) {                                  // 6 90s zigzag bands
    float zz = abs(fract(q.x * K * 2.5) - 0.5) * 0.09;
    float t = fract((q.y + zz) * 5.0);
    float a = step(0.5, t) * step(t, 0.72), b = step(0.78, t) * step(t, 0.9);
    ink = a + b;
    return mix(mix(base, A, a), B, b);
  }
  if (pat < 7.5) {                                  // 7 checkerboard
    float c = mod(floor(q.x * K * 3.0) + floor(q.y * 22.0), 2.0);
    ink = c;
    return mix(base, A, c);
  }
  if (pat < 8.5) {                                  // 8 fade: B at the bottom to A at the top
    float f = smoothstep(bandY - 0.35, bandY + 0.3, q.y);
    return mix(B, A, f);
  }
  if (pat < 9.5) {                                  // 9 flames licking up from the bottom (they flicker)
    float h = q.y - (bandY - 0.42);
    float n = chPerlin(vec2(q.x * K * 2.0, q.y * 7.0 - uTime * 1.3), K * 2.0) * 0.09 + chPerlin(vec2(q.x * K * 4.0, q.y * 12.0 - uTime * 2.1), K * 4.0) * 0.04;
    float f = h - 0.2 - n;
    float flame = 1.0 - smoothstep(-0.01, 0.01, f);
    float core = 1.0 - smoothstep(-0.16, -0.04, f);
    ink = flame;
    return mix(base, mix(A, B, core), flame);
  }
  if (pat < 10.5) {                                 // 10 tie-dye swirl
    vec2 d = vec2(uc * 1.4, q.y - bandY);
    float r = length(d), a = atan(d.y, d.x);
    float t = sin(r * 26.0 + a * 2.0 + chPerlin(vec2(q.x * K, q.y * 4.0), K) * 2.5);
    return mix(mix(base, A, smoothstep(0.2, 0.6, t)), B, smoothstep(-0.2, -0.65, t));
  }
  if (pat < 11.5) {                                 // 11 topographic contours
    float topo = chPerlin(vec2(q.x * K * 1.5, q.y * 22.0), K * 1.5) * 0.8 + chPerlin(vec2(q.x * K * 3.0 + 3.0, q.y * 44.0), K * 3.0) * 0.25;
    float tl = topo * 7.0;
    float contour = 1.0 - smoothstep(0.0, fwidth(tl) * 1.2 + 0.04, 0.5 - abs(fract(tl) - 0.5));
    ink = contour;
    return mix(base, A, contour * 0.6);
  }
  if (pat < 12.5) {                                 // 12 skull jaw (gaiter): teeth, jaw and cheekbones on the front
    float x = uc * 0.5;                             // ~arc metres around the face, 0 = front
    float teeth = step(abs(q.y - bandY), 0.016) * step(abs(x), 0.06) * step(0.16, fract(x * 95.0 + 0.5));
    float jaw = chLine(q.y - (bandY - 0.045 + x * x * 7.0), 0.0035) * step(abs(x), 0.085);
    float cheek = chLine(q.y - (bandY + 0.04 - x * x * 5.0), 0.003) * step(0.02, abs(x)) * step(abs(x), 0.08);
    float chin = chLine(abs(x) - 0.02 - (bandY - q.y) * 0.25, 0.0025) * step(q.y, bandY - 0.02) * step(bandY - 0.07, q.y);
    float a = clamp(teeth + jaw + cheek + chin, 0.0, 1.0);
    ink = a;
    return mix(base, A, a);
  }
  if (pat < 13.5) {                                 // 13 stars
    vec2 g = vec2(q.x * K * 3.0, q.y * 18.0);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = chHash(cell);
    float r = length(f), a = atan(f.y, f.x);
    float star = step(r, 0.2 * (0.62 + 0.38 * cos(a * 5.0 + h * 6.28))) * step(0.45, h);
    ink = star;
    return mix(base, A, star);
  }
  if (pat < 14.5) {                                 // 14 tiger stripes
    float s = sin(q.x * K * 6.2831 * 1.5 + chPerlin(vec2(q.x * K, q.y * 5.0), K) * 3.0 + q.y * 9.0);
    float st = smoothstep(0.55, 0.62, s) * (0.6 + 0.4 * step(0.0, chPerlin(vec2(q.x * K * 2.0, q.y * 3.0), K * 2.0)));
    ink = st;
    return mix(base, A, st);
  }
  {                                                 // 15 paint splatter
    vec2 g = vec2(q.x * K * 1.5, q.y * 7.0);
    vec2 cell = floor(g), f = fract(g);
    float h = chHash(cell), h2 = chHash(cell + 7.3);
    vec2 c0 = vec2(0.3 + 0.4 * h, 0.3 + 0.4 * h2);
    float d = length(f - c0) + 0.06 * chNoise(f * 18.0 + cell);
    float blob = step(d, 0.12 + 0.18 * h2) * step(0.25, h);
    float drop = step(length(f - c0 - vec2(0.22, -0.18)), 0.04) * step(0.25, h);
    float a = max(blob, drop);
    ink = a;
    return mix(base, mix(A, B, step(0.6, h)), a);
  }
}
// Finish ids (outfits.js FINISHES): 1 metallic, 2 reflective, 3 iridescent, 4 neon, 5 gloss.
void chFinish(float f, inout vec3 c) {
  if (f < 0.5) return;
  if (f < 1.5) { fabMetal = 1.0; fabRough = 0.3; fabSpec = 0.6; fabSheen = 0.05; c *= 0.75; }
  else if (f < 2.5) { fabRefl = 1.0; fabRough = 0.45; fabSpec = 0.9; fabSheen = 0.5; }
  else if (f < 3.5) { fabIri = 1.0; fabRough = 0.35; fabSpec = 0.9; fabSheen = 0.6; c *= 0.7; }
  else if (f < 4.5) { fabRough = 0.5; fabSpec = 0.6; }
  else { fabRough = 0.32; fabSpec = 1.1; }
}
`;

// Finishes on top of the fabric light (fabric only): metal, retro-reflective tape, oil-slick iridescence.
const FINISH_LIGHT = /* glsl */`
  {
    vec3 Vv2 = normalize(vViewPosition);
    float NoV2 = clamp(dot(normal, Vv2), 0.0, 1.0);
    if (fabMetal > 0.0) {
      vec3 Hm = normalize(sunV + Vv2);
      float spec = pow(clamp(dot(normal, Hm), 0.0, 1.0), 48.0);
      float fr = pow(1.0 - NoV2, 2.0);
      toonAdd += fabMetal * diffuseColor.rgb * (uSunCol * shadow * spec * 6.0 + sky * (0.6 + 1.8 * fr));
      light *= mix(1.0, 0.45, fabMetal);
    }
    if (fabRefl > 0.0) {
      // Retro-reflective: bounces light straight back, so it flares when you look along the light.
      float back = pow(clamp(dot(Vv2, sunV), 0.0, 1.0), 6.0);
      toonAdd += fabRefl * vec3(0.92, 0.95, 1.0) * (pow(NoV2, 5.0) * (sky * 1.6 + uSunCol * 0.25) + back * uSunCol * shadow * 1.4);
    }
    if (fabIri > 0.0) {
      vec3 ir = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + NoV2 * 1.7 + vObj.y * 1.2));
      toonAdd += fabIri * ir * (sky * 1.3 + uSunCol * shadow * 0.35) * (0.4 + 0.6 * (1.0 - NoV2));
    }
  }
`;

// Fabric light: runs inside toonMaterial's lighting block (normal, sunV, ndl, shadow, sky, light in scope).
const FABRIC_LIGHT = /* glsl */`
  {
    vec3 Vv = normalize(vViewPosition);
    float NoV = clamp(dot(normal, Vv), 1e-3, 1.0);
    float NoL = clamp(ndl, 0.0, 1.0);
    vec3 Hh = normalize(sunV + Vv);
    float NoH = clamp(dot(normal, Hh), 0.0, 1.0);
    float invA = 1.0 / max(fabSheenRough, 0.08);
    float sin2h = max(1.0 - NoH * NoH, 0.0078125);
    float Ds = (2.0 + invA) * pow(sin2h, invA * 0.5) / (2.0 * PI);
    float Vs = 1.0 / (4.0 * (NoL + NoV - NoL * NoV) + 1e-3);
    float a2 = fabRough * fabRough; a2 *= a2;
    float dd = NoH * NoH * (a2 - 1.0) + 1.0;
    float Dg = a2 / (PI * dd * dd);
    float Vg = 0.5 / (NoL * sqrt(NoV * NoV * (1.0 - a2) + a2) + NoV * sqrt(NoL * NoL * (1.0 - a2) + a2) + 1e-4);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(Vv, Hh), 0.0, 1.0), 5.0);
    vec3 sheenCol = mix(diffuseColor.rgb, vec3(1.0), 0.45) * fabSheen;
    toonAdd += PI * uSunCol * shadow * NoL * (Ds * Vs * sheenCol + Dg * Vg * F * fabSpec);
    float fr = pow(1.0 - NoV, 3.0);
    toonAdd += sky * sheenCol * fr * 0.7 + sky * fr * fabSpec * 0.25;
    light *= fabAO;
  }
`;

/**
 * Fabric for the merged outfit geometry (garments.js). Attributes: aG = (piece, u, v, side), aLin.
 * Uniforms (THREE.Color): uJacket, uPanel, uAccent, uGaiter, uPants, uCuff, uMitt, uGauntlet; uStyle.
 * uHide (0/1) collapses the pieces worn around the face (first person).
 */
export function fabricMaterial() {
  const U = {
    uJacket: { value: col('#5e5f45') }, uPanel: { value: col('#b9a27a') }, uAccent: { value: col('#ff5b14') },
    uGaiter: { value: col('#d9ceb5') }, uPants: { value: col('#3a3129') }, uCuff: { value: col('#231d18') },
    uMitt: { value: col('#9c6f45') }, uGauntlet: { value: col('#1c1c1b') }, uStyle: { value: 0 },
    uHemY: { value: new THREE.Vector3(0.84, 0.15, 0.69) },    // jacket hem, pants cuff, sleeve end
    uHide: { value: 0 },
    // Reward looks (applyLook): x = print, y = scale, z = finish; A / B = the print's colours.
    uJPat: { value: new THREE.Vector4(0, 1, 0, 0) }, uJPatA: { value: col('#222222') }, uJPatB: { value: col('#888888') },
    uPPat: { value: new THREE.Vector4(0, 1, 0, 0) }, uPPatA: { value: col('#222222') }, uPPatB: { value: col('#888888') },
    uGPat: { value: new THREE.Vector4(11, 1, 0, 0) }, uGPatA: { value: col('#e9e6dc') }, uGPatB: { value: col('#888888') },
    uMPat: { value: new THREE.Vector4(0, 1, 0, 0) }, uMPatA: { value: col('#222222') },
  };
  const m = toonMaterial({
    name: 'riderFabric', rim: 0.25, uniforms: U,
    vertPars: 'attribute vec4 aG; attribute float aLin; attribute float aCrease; varying vec4 vG; varying float vLin; varying float vCrease; varying vec3 vObj; uniform float uHide;',
    vertPre: 'vG = aG; vLin = aLin; vCrease = aCrease; vObj = position;\n  if (uHide > 0.5 && ((aG.x > 2.5 && aG.x < 5.5) || aG.x > 7.5)) transformed *= 0.0;\n  if (uHide > 0.5 && (abs(aG.x - 1.0) < 0.5 || abs(aG.x - 7.0) < 0.5)) transformed.yz = mix(transformed.yz, vec2(1.45, -0.075), 0.25 * smoothstep(0.4, 0.6, abs(position.x)));',
    fragPars: `${COMMON}
varying vec4 vG; varying float vLin; varying float vCrease; varying vec3 vObj;
uniform vec3 uJacket, uPanel, uAccent, uGaiter, uPants, uCuff, uMitt, uGauntlet; uniform float uStyle; uniform vec3 uHemY;
uniform vec4 uJPat, uPPat, uGPat, uMPat; uniform vec3 uJPatA, uJPatB, uPPatA, uPPatB, uGPatA, uGPatB, uMPatA;
float fabRough = 0.82, fabSheen = 0.32, fabSheenRough = 0.55, fabSpec = 0.25, fabAO = 1.0, fabH = 0.0;
float fabMetal = 0.0, fabRefl = 0.0, fabIri = 0.0;
${PRINTS}`,
    frag: /* glsl */`
      {
        float id = floor(vG.x + 0.5);
        float u = vG.y, v = vG.z, side = vG.w;
        float uc = u - floor(u + 0.5);             // −0.5 … 0.5, 0 = front (jacket, pants) / top (sleeves)
        vec3 c = uJacket;
        float seam = 0.0, zip = 0.0, tape = 0.0;
        float wr = 1.0;                            // wrinkle strength
        vec2 wf = vec2(14.0, 4.0);                 // wrinkle frequency (around u, along v): long drape folds
        float ink = 0.0;                           // the print's ink mask (neon finishes glow there)
        if (id < 0.5) {
          // ---------------- jacket body: x = arc metres from the centre front
          float x = uc * 1.42, ax = abs(x);
          float back = smoothstep(0.2, 0.35, abs(uc));
          float yokeY = mix(1.395, 1.355, back) - 0.02 * smoothstep(0.1, 0.25, abs(uc)) * (1.0 - back);
          float yoke = step(yokeY, v);
          float sideP = 1.0 - step(0.055, abs(abs(uc) - 0.25) * 1.42);
          float panel = max(yoke, sideP * step(v, yokeY));
          if (uStyle > 0.5) panel = yoke;                    // style 1: yoke + colour-blocked sleeves, no side panels
          vec3 jb = chPrint(uJPat.x, vec2(u, v), floor(8.0 * uJPat.y + 0.5), uJacket, uJPatA, uJPatB, 1.18, ink);
          if (uJPat.x > 0.5 && abs(uJPat.x - 4.0) > 0.5) panel = 0.0;   // a print covers the panels (bands keep them)
          c = mix(jb, uPanel, panel);
          seam += chLine(v - yokeY, 0.0022);
          seam += chLine(abs(abs(uc) - 0.25) * 1.42 - 0.055, 0.0022) * step(v, yokeY);
          // accent piping along the front yoke seam
          c = mix(c, uAccent, chLine(v - yokeY - 0.006, 0.0025) * (1.0 - back) * step(ax, 0.3) * step(uStyle, 0.5));
          // centre-front zip with a storm flap
          zip = chLine(x, 0.0055) * step(v, 1.66);
          seam += chLine(x - 0.02, 0.0018);
          float pull = 0.0;   // zip pulls (accent)
          // two chest pocket zips, angled out
          for (int s = 0; s < 2; s++) {
            float sx = s == 0 ? 1.0 : -1.0;
            float px = sx * x - (0.07 + (v - 1.24) * 0.16);
            zip += chLine(px, 0.0035) * step(1.24, v) * step(v, 1.42) * (1.0 - back);
            pull = max(pull, 1.0 - step(0.0, chBox(vec2(px - 0.006, v - 1.405), vec2(0.004, 0.011), 0.003)));
            // hand pockets: high and angled
            float hx = sx * x - 0.1 - (v - 0.95) * 0.58;
            zip += chLine(hx, 0.0032) * step(0.95, v) * step(v, 1.1) * (1.0 - back);
          }
          // hem band seam + drawcord channel, cord toggles at the side seams
          seam += chLine(v - (uHemY.x + 0.03), 0.002);
          vec2 tg = vec2((abs(uc) - 0.25) * 1.42, v - uHemY.x - 0.016);
          float tog = 1.0 - step(0.0, chBox(tg, vec2(0.007, 0.011), 0.004));
          c = mix(c, uAccent * 0.8, tog);
          fabH += tog * 0.003;
          // zip pull of the main zip at the chin
          pull = max(pull, 1.0 - step(0.0, chBox(vec2(x - 0.008, v - 1.57), vec2(0.005, 0.014), 0.003)));
          c = mix(c, uAccent, pull * (1.0 - back));
          fabH += pull * 0.002;
          // logo: small accent chevron on the left chest, a bar across the back yoke
          vec2 lp = vec2(x - 0.115, v - 1.355);
          float chev = step(abs(lp.x) * 0.55 + lp.y, 0.009) * step(-0.009, lp.y - abs(lp.x) * 0.55 + 0.0) * step(abs(lp.x), 0.018);
          c = mix(c, uAccent, chev * (1.0 - back));
          vec2 bp = vec2((abs(uc) - 0.5) * 1.42, v - 1.455);
          c = mix(c, uAccent, (1.0 - step(0.0, chBox(bp, vec2(0.06, 0.007), 0.002))) * back);
          wr = 1.0;
        } else if (id < 1.5) {
          // ---------------- sleeve: uc 0 = top of the arm (outside when the arms hang), v = |x|
          float a = uc * 0.62;                      // arc metres
          // Shoulder cap in the yoke colour (continues the yoke over the armhole), a raglan stripe down
          // the top of the arm to the elbow.
          float capV = mix(0.37, 0.27, smoothstep(0.12, 0.42, abs(a)));
          float cap = 1.0 - step(capV, v);
          float rw = 0.06 + (0.42 - v) * 0.1;
          float raglan = (1.0 - step(rw, abs(a))) * step(v, 0.42);
          float block = uStyle > 0.5 ? 1.0 : 0.0;
          vec3 jb = chPrint(uJPat.x, vec2(u, v), floor(4.0 * uJPat.y + 0.5), uJacket, uJPatA, uJPatB, 0.42, ink);
          if (uJPat.x > 0.5 && abs(uJPat.x - 4.0) > 0.5) { raglan = 0.0; cap = 0.0; block = 0.0; }
          if (abs(uJPat.x - 5.0) < 0.5) jb = side > 0.5 ? uJPatA : uJPatB;   // two-tone: one sleeve each
          c = mix(jb, uPanel, max(max(raglan, cap) * (1.0 - block), block));
          seam += max(chLine(abs(a) - rw, 0.002) * step(capV, v) * step(v, 0.42), chLine(v - capV, 0.002) * step(rw, abs(a))) * (1.0 - block);
          // elbow articulation darts (back of the arm)
          float ea = (uc + 0.25) * 0.62;
          seam += chLine(v - 0.43 - ea * ea * 5.0, 0.0018) * step(abs(ea), 0.08);
          seam += chLine(v - 0.475 - ea * ea * 5.0, 0.0018) * step(abs(ea), 0.08);
          // cuff: Velcro tab underneath + seam
          float cuffV = uHemY.z - 0.04;
          seam += chLine(v - cuffV, 0.002);
          vec2 tp = vec2((abs(uc) - 0.5) * 0.62, v - cuffV - 0.02);
          float tab = 1.0 - step(0.0, chBox(tp, vec2(0.014, 0.02), 0.004));
          c = mix(c, uJacket * 0.7, tab);
          seam += chLine(chBox(tp, vec2(0.014, 0.02), 0.004), 0.0015);
          // left sleeve: forearm pocket zip and a shoulder logo
          if (side > 0.5) {
            zip += chLine(a - 0.03, 0.003) * step(0.52, v) * step(v, 0.61);
            vec2 sp = vec2(a + 0.04, v - 0.25);
            c = mix(c, uAccent, 1.0 - step(0.0, chBox(sp, vec2(0.018, 0.005), 0.002)));
          }
          wr = 1.2; wf = vec2(3.0, 20.0);         // ring-shaped compression folds
        } else if (id < 2.5) {
          // ---------------- pant leg: uc 0 = front, outer side at uc = +0.25·side
          float a = uc * 0.95;
          float outer = (uc - 0.25 * side) * 0.95, inner = (uc + 0.25 * side) * 0.95;
          outer -= floor(outer / 0.95 + 0.5) * 0.95; inner -= floor(inner / 0.95 + 0.5) * 0.95;
          float cuffBand = step(v, uHemY.y + 0.075);
          float kick = (1.0 - step(0.07, abs(inner))) * step(v, uHemY.y + 0.14);
          vec3 pb = chPrint(uPPat.x, vec2(u, v), floor(6.0 * uPPat.y + 0.5), uPants, uPPatA, uPPatB, 0.6, ink);
          c = mix(pb, uCuff, max(cuffBand, kick));
          seam += chLine(v - (uHemY.y + 0.075), 0.002);
          seam += chLine(chBox(vec2(inner, v - uHemY.y - 0.07), vec2(0.07, 0.07), 0.03), 0.0018) * (1.0 - cuffBand);
          // knee darts
          float kv = 0.555;
          seam += chLine(v - kv - a * a * 3.0, 0.0018) * step(abs(a), 0.08);
          seam += chLine(v - kv + 0.07 + a * a * 3.0, 0.0018) * step(abs(a), 0.08);
          // outer side seam, thigh vent zip, cargo pocket on the left leg
          seam += chLine(outer, 0.0018) * step(uHemY.y + 0.075, v);
          zip += chLine(outer - 0.012, 0.003) * step(0.74, v) * step(v, 1.0);
          if (side > 0.5) {
            vec2 pp = vec2(outer + 0.02, v - 0.62);
            float pk = chBox(pp, vec2(0.075, 0.085), 0.01);
            seam += chLine(pk, 0.0018);
            float flap = chBox(pp - vec2(0.0, 0.065), vec2(0.078, 0.022), 0.008);
            seam += chLine(flap, 0.002);
            fabH += (1.0 - smoothstep(-0.002, 0.002, flap)) * 0.0015;
          }
          wr = 1.1; wf = vec2(7.0, 6.0);
        } else if (id < 3.5) {
          // ---------------- collar: zip continues to the chin, accent lining at the rim
          c = mix(uJacket, uPanel, step(0.5, uStyle) * 0.0);
          zip = chLine(uc * 0.62, 0.005);
          wr = 0.6; wf = vec2(10.0, 30.0);
        } else if (id < 4.5) {
          // ---------------- stowed hood roll
          c = uPanel;
          seam += chLine(uc, 0.004);
          wr = 1.4;
        } else if (id < 5.5) {
          // ---------------- fleece gaiter
          // Heathered knit with fine vertical ribs and a small accent tag on the left; the print comes
          // from the face slot (topographic contours by default, skull jaw, camo, flames…).
          float heather = chNoise(vec2(u * 90.0, v * 160.0)) * 0.4 + chNoise(vec2(u * 23.0, v * 50.0)) * 0.6;
          c = chPrint(uGPat.x, vec2(u, v), floor(4.0 * uGPat.y + 0.5), uGaiter, uGPatA, uGPatB, 1.632, ink) * (0.93 + 0.08 * heather);
          float rib = u * 6.2831853 * 110.0;
          fabH += sin(rib) * 0.00009 * (1.0 - smoothstep(0.3, 0.8, fwidth(rib)));
          c = mix(c, uAccent, 1.0 - step(0.0, chBox(vec2((uc - 0.2) * 0.5, v - 1.6), vec2(0.008, 0.005), 0.002)));
          fabRough = 0.95; fabSheen = 0.6; fabSheenRough = 0.8; fabSpec = 0.05;
          wr = 0.7;
        } else if (id < 6.5) {
          // ---------------- leather mitt: knuckle seam, thumb crease, worn highlights
          c = chPrint(uMPat.x, vec2(u, v), 4.0, uMitt, uMPatA, uMPatA, 0.78, ink) * (0.85 + 0.15 * chNoise(vec2(u * 20.0, v * 80.0)));
          seam += chLine(v - 0.8, 0.0022);
          seam += chLine(uc * 0.3 - 0.0, 0.0018) * step(0.8, v);
          fabRough = 0.5; fabSheen = 0.18; fabSpec = 0.6;
          wr = 0.35; wf = vec2(9.0, 30.0);        // supple leather: a few soft creases, no crumple
        } else if (id > 7.5) {
          // ---------------- hood worn up: yoke colour (or the jacket's print), a centre seam over the crown
          c = uJPat.x > 0.5 && abs(uJPat.x - 4.0) > 0.5 ? chPrint(uJPat.x, vec2(u, v + 1.0), 4.0, uJacket, uJPatA, uJPatB, 1.9, ink) : uPanel;
          seam += chLine(uc * 0.75, 0.002) + chLine((abs(uc) - 0.5) * 0.75, 0.002);
          seam += chLine(v - 0.93, 0.002);
          wr = 0.6; wf = vec2(12.0, 6.0);
        } else if (id > 6.5) {
          // ---------------- gauntlet: nylon with a cinch strap at the wrist
          c = uGauntlet;
          float strap = (1.0 - step(0.012, abs(v - 0.69)));
          c = mix(c, uGauntlet * 1.6 + 0.02, strap);
          seam += chLine(abs(v - 0.69) - 0.012, 0.0015);
          vec2 tp = vec2(uc * 0.4 - 0.0, v - 0.69);
          c = mix(c, uAccent, (1.0 - step(0.0, chBox(tp - vec2(0.03, 0.0), vec2(0.008, 0.012), 0.003))));
          fabRough = 0.75;
          wr = 0.8;
        }
        // Finish of the piece's garment (jacket pieces, pants, mitts): metal, reflective, iridescent, neon.
        float fin = (id < 1.5 || (id > 2.5 && id < 4.5) || id > 7.5) ? uJPat.z : (id < 2.5 ? uPPat.z : (id > 5.5 && id < 7.5 ? uMPat.z : 0.0));
        chFinish(fin, c);
        if (fin > 3.5 && fin < 4.5) {
          // Neon: the print's ink glows, and so do the gauntlet straps.
          vec3 glowCol = (id > 5.5 && id < 7.5) ? uMPatA : (id > 1.5 && id < 2.5 ? uPPatA : uJPatA);
          toonEmissive += glowCol * ink * 0.9;
          if (abs(id - 7.0) < 0.5) toonEmissive += uGauntlet * 0.5;
        }
        // Rolled edges / linings
        if (vLin > 0.5) { c = (id > 2.5 && id < 3.5) ? uAccent : c * 0.5; seam = 0.0; zip = 0.0; }
        // Zips: dark coil, smoother
        c = mix(c, vec3(0.025), clamp(zip, 0.0, 1.0));
        fabRough = mix(fabRough, 0.45, clamp(zip, 0.0, 1.0));
        // Seams: a groove and slightly darker thread line, taped look
        seam = clamp(seam, 0.0, 1.0);
        c *= 1.0 - seam * 0.28;
        fabH -= seam * 0.0006 - zip * 0.0006;
        // Wrinkles: anisotropic folds per piece plus a fine crumple, faded with distance (no shimmer)
        vec2 wp = vec2(u * wf.x, v * wf.y);
        float wfade = 1.0 - smoothstep(0.006, 0.03, fwidth(v));
        float cfade = 1.0 - smoothstep(0.002, 0.008, fwidth(v));
        fabH += (chPerlin(wp, wf.x) * 0.7 + chPerlin(vec2(u * wf.x * 3.0, v * wf.y * 2.7 + 3.1), wf.x * 3.0) * 0.3) * 0.0024 * wr * wfade;
        // Fine crumple: warped sines (no lattice, periodic around the piece).
        float cu = u * 6.2831853;
        float crum = sin(cu * 23.0 + 2.0 * sin(v * 190.0 + sin(cu * 7.0))) * sin(v * 230.0 + 2.2 * sin(cu * 17.0 + 1.3));
        if (abs(id - 6.0) > 0.5) fabH += crum * 0.00016 * wr * cfade;   // (not on leather)
        // Fold occlusion: valleys between folds get less sky and sun; ridges catch a little more.
        fabAO = (1.0 - seam * 0.25) * clamp(1.0 + vCrease * 22.0, 0.72, 1.1);
        diffuseColor.rgb = c;
      }`,
    band: FABRIC_LIGHT + FINISH_LIGHT,
  });
  extend(m, { normal: 'normal = chBump(-vViewPosition, normal, fabH, faceDirection);', key: 'fabric' });
  return m;
}

/**
 * The body under the clothes: covered zones (jacket, pants, hands) shrink inward so the shells never
 * show skin through folds, and take the garment colours; boots become glossy plastic shells.
 */
export function bodyMaterial(src) {
  const U = {
    uJacket: { value: col('#5e5f45') }, uPants: { value: col('#3a3129') }, uMitt: { value: col('#9c6f45') },
    uBoot: { value: col('#33363b') }, uBootAccent: { value: col('#4a4d52') }, uShrink: { value: 0.022 },
  };
  const m = toonMaterial({
    name: 'riderBody', map: src.map, rim: 0.3, uniforms: U,
    vertPars: 'attribute vec4 color; varying vec4 vZone; varying vec3 vObj; uniform float uShrink;',
    vertPre: `vZone = color; vObj = position;
  {
    float tot = max(color.r + color.g + color.b, 0.001);
    // Jacket zone (big superhero shoulders / arms) pulls in furthest, pants and hands less.
    // Arms are always inside the sleeves: pull them toward the arm's axis (never through it), the
    // rest of the covered skin in along its normal.
    float arm = color.a * color.r / tot * smoothstep(0.17, 0.25, abs(position.x)) * step(1.25, position.y);
    transformed.yz = mix(transformed.yz, vec2(1.45, -0.075), arm * 0.6);
    // Hands live in the mitts: pull them toward the hand's axis too.
    float hand = color.a * color.b / tot * smoothstep(0.66, 0.7, abs(position.x)) * step(1.25, position.y);
    transformed.yz = mix(transformed.yz, vec2(1.43, -0.05), hand * 0.55);
    transformed.x = mix(transformed.x, sign(transformed.x) * min(abs(transformed.x), 0.84), hand);   // fingers curl into the fist
    float cover = color.a * (color.r / tot * 1.8 * (1.0 - arm) + color.g / tot * 1.25 + step(1.2, position.y) * color.b / tot * 0.8);
    transformed -= objectNormal * uShrink * cover;
  }`,
    fragPars: `${COMMON}\nvarying vec4 vZone; varying vec3 vObj;\nuniform vec3 uJacket, uPants, uMitt, uBoot, uBootAccent;\nfloat fabRough = 0.85, fabSheen = 0.1, fabSheenRough = 0.6, fabSpec = 0.2, fabAO = 1.0;`,
    frag: /* glsl */`
      {
        float tot = max(vZone.r + vZone.g + vZone.b, 0.001);
        float boot = step(vObj.y, 0.6) * vZone.b / tot;
        vec3 cloth = (uJacket * vZone.r + uPants * vZone.g + mix(uMitt, uBoot, step(vObj.y, 0.6)) * vZone.b) / tot;
        // Ski boot: rubber sole, glossy lower shell, two metal buckles across the instep, a lighter
        // shell panel on the outside of the heel.
        vec3 bootCol = uBoot;
        float out_ = abs(vObj.x) - 0.114;                     // + = outer side of the foot
        float sole = 1.0 - smoothstep(0.02, 0.024, vObj.y);
        float buckle = 0.0;
        for (int i = 0; i < 2; i++) {
          float zc = 0.015 + float(i) * 0.055;
          buckle += (1.0 - smoothstep(0.005, 0.0075, abs(vObj.z - zc))) * step(0.045, vObj.y) * step(-0.015, out_) * step(out_, 0.07);
        }
        buckle = clamp(buckle, 0.0, 1.0);
        float heel = (1.0 - smoothstep(0.0, 0.01, chBox(vec2(vObj.z + 0.11, vObj.y - 0.075), vec2(0.045, 0.03), 0.01))) * step(0.03, out_);
        bootCol = mix(bootCol, uBootAccent, heel);
        bootCol = mix(bootCol, vec3(0.55, 0.56, 0.58), buckle);
        bootCol = mix(bootCol, vec3(0.025), sole);
        cloth = mix(cloth, bootCol, step(vObj.y, 0.6) * vZone.b / tot);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.03, 0.97, 0.94), cloth, vZone.a);
        float bw = boot * vZone.a;
        fabRough = mix(0.85, mix(mix(0.3, 0.22, buckle), 0.9, sole), bw);
        fabSpec = mix(0.15, mix(mix(0.9, 2.5, buckle), 0.1, sole), bw);
        fabSheen = mix(0.1, 0.0, bw);
      }`,
    band: FABRIC_LIGHT,
  });
  return m;
}

// Helmet finishes on top of the fabric light: a chrome mirror of sky, horizon and snow, tinted metal,
// and a soft pearl sheen that shifts hue with the angle.
const HELMET_LIGHT = /* glsl */`
  if (hChrome + hMetal + hPearl > 0.0) {
    vec3 Vv3 = normalize(vViewPosition);
    float NoV3 = clamp(dot(normal, Vv3), 0.0, 1.0);
    vec3 nWd = inverseTransformDirection(normal, viewMatrix);
    vec3 rd = reflect(normalize(vW - cameraPosition), nWd);
    float h = clamp(rd.y, -1.0, 1.0);
    vec3 env = h > 0.0 ? mix(uSkyAmb * 1.9 + uSunCol * 0.1, uSkyAmb * vec3(0.4, 0.6, 1.1), pow(h, 0.6)) : mix(uSkyAmb * 1.5, uGroundAmb * 1.3 + uSunCol * 0.45, smoothstep(0.0, -0.15, h));
    float az = atan(rd.x, rd.z);
    env = mix(env, uGroundAmb * 0.3, smoothstep(0.02, -0.01, h - 0.03 * sin(az * 6.0)) * smoothstep(-0.12, -0.04, h) * 0.8);
    float sd = max(dot(rd, uSunDir), 0.0);
    vec3 glint = uSunCol * (pow(sd, 600.0) * 60.0 + pow(sd, 24.0) * 0.8);
    float F = 0.6 + 0.4 * pow(1.0 - NoV3, 3.0);
    toonAdd += hChrome * (env * mix(vec3(1.0), diffuseColor.rgb * 1.4, 0.55) * 1.3 + glint) * F;
    toonAdd += hMetal * diffuseColor.rgb * (env * 0.9 + glint * 0.6);
    vec3 ir = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + NoV3 * 1.4));
    toonAdd += hPearl * mix(vec3(1.0), ir, 0.5) * (uSkyAmb * 0.9 + uSunCol * 0.12) * (0.4 + 0.6 * (1.0 - NoV3));
    light *= 1.0 - hChrome * 0.85 - hMetal * 0.5;
  }
`;

/**
 * Helmet shell, liner, strap, gasket. Attribute aR = region (0 shell, 1 liner, 2 strap, 3 clip,
 * 4 gasket), aUV = strap coordinates. Vents and ear pads are drawn from the bind-space position.
 */
export function helmetMaterial(hs) {
  const U = {
    uShell: { value: col('#2c2d2a') }, uLiner: { value: col('#17181a') }, uHAccent: { value: col('#ff5b14') },
    uStrap: { value: col('#1d1d1b') }, uStrapLogo: { value: col('#ff5b14') },
    uHelm: { value: new THREE.Vector4(hs.top, hs.cz, hs.halfW, hs.yEq) },   // crown y, centre z, half width, equator y
    uHide: { value: 0 },
    // Reward looks (applyLook): x = shell finish (FINISHES), y = decal (DECALS); decal colour; goggle frame.
    uHFin: { value: new THREE.Vector4(0, 0, 0, 0) }, uHDecal: { value: col('#ffffff') }, uFrame: { value: col('#252525') },
  };
  const m = toonMaterial({
    name: 'riderHelmet', rim: 0.35, uniforms: U,
    vertPars: 'attribute float aR; attribute vec2 aUV; varying float vR; varying vec2 vUV; varying vec3 vObj;',
    vertPre: 'vR = aR; vUV = aUV; vObj = position;',
    fragPars: `${COMMON}
varying float vR; varying vec2 vUV; varying vec3 vObj;
uniform vec3 uShell, uLiner, uHAccent, uStrap, uStrapLogo; uniform vec4 uHelm;
uniform vec4 uHFin; uniform vec3 uHDecal, uFrame;
float fabRough = 0.62, fabSheen = 0.08, fabSheenRough = 0.5, fabSpec = 0.32, fabAO = 1.0, fabH = 0.0;
float hMetal = 0.0, hChrome = 0.0, hPearl = 0.0;`,
    frag: /* glsl */`
      {
        float r = floor(vR + 0.5);
        vec3 c = uShell;
        vec3 p = vObj;
        float cz = uHelm.y, hw = uHelm.z;
        if (r < 0.5) {
          // Decals (reward helmets): a racing stripe over the crown, hot-rod flames from the brim, stars.
          {
            float dec = 0.0;
            float dy = p.y - uHelm.w;
            if (abs(uHFin.y - 1.0) < 0.5) dec = (1.0 - step(0.024, abs(p.x))) + chLine(abs(p.x) - 0.034, 0.0022);
            else if (abs(uHFin.y - 2.0) < 0.5) {
              float front = smoothstep(cz - 0.15, cz + 0.12, p.z);
              float tongue = 0.012 + front * (0.035 + 0.03 * (0.5 + 0.5 * sin(p.z * 140.0 + abs(p.x) * 40.0)));
              dec = 1.0 - smoothstep(-0.002, 0.002, dy + 0.03 - tongue);
              c = mix(c, mix(uHDecal, vec3(1.0, 0.85, 0.25), smoothstep(0.0, -0.03, dy + 0.03 - tongue * 0.6)), dec);
              dec = 0.0;
            } else if (abs(uHFin.y - 3.0) < 0.5) {
              vec2 g = vec2(atan(p.x, p.z - cz) * 4.0, dy * 70.0);
              vec2 cell = floor(g), f = fract(g) - 0.5;
              float h = chHash(cell), rr = length(f), aa = atan(f.y, f.x);
              dec = step(rr, 0.22 * (0.62 + 0.38 * cos(aa * 5.0 + h * 6.28))) * step(0.5, h) * step(-0.01, dy);
            } else if (abs(uHFin.y - 4.0) < 0.5) dec = mod(floor(p.x * 60.0) + floor(p.z * 60.0), 2.0) * step(0.03, dy);
            c = mix(c, uHDecal, clamp(dec, 0.0, 1.0));
          }
          // Crown slots: two rows each side, running front to back, rounded ends.
          float crown = smoothstep(uHelm.w + 0.035, uHelm.w + 0.06, p.y);
          float slot = 1e3;
          for (int i = 0; i < 2; i++) {
            float sx = i == 0 ? 0.028 : 0.062;
            float sl = i == 0 ? 0.036 : 0.03;
            slot = min(slot, chBox(vec2(abs(p.x) - sx, p.z - cz + 0.004), vec2(0.0068, sl), 0.0068));
          }
          slot = min(slot, chBox(vec2(p.x, p.z - cz - 0.032), vec2(0.0068, 0.024), 0.0068));
          float sm = (1.0 - smoothstep(-0.0005, 0.0012, slot)) * crown;
          // Rear exhausts and brow ports in the brim.
          float ex = chBox(vec2(abs(p.x) - 0.034, p.y - uHelm.w + 0.035), vec2(0.018, 0.0045), 0.0045);
          float em = (1.0 - smoothstep(-0.0005, 0.0012, ex)) * step(p.z, cz - 0.09);
          float br = chBox(vec2(abs(p.x) - 0.03, p.y - uHelm.w - 0.033), vec2(0.02, 0.0035), 0.0035);
          float bm = (1.0 - smoothstep(-0.0005, 0.0012, br)) * step(cz + 0.09, p.z);
          float vent = clamp(sm + em + bm, 0.0, 1.0);
          c = mix(c, vec3(0.012), vent);
          fabH -= vent * 0.003;
          fabH += (1.0 - smoothstep(0.0, 0.003, min(min(slot, ex), br))) * smoothstep(-0.001, 0.0005, min(min(slot, ex), br)) * 0.0012;
          // Ear pads: soft fabric ovals set into the shell.
          vec2 ep = vec2((p.z - cz - 0.012) / 0.038, (p.y - uHelm.w + 0.063) / 0.042);
          float ed = length(ep) - 1.0;
          float pad = (1.0 - smoothstep(-0.02, 0.02, ed)) * step(hw * 0.75, abs(p.x));
          c = mix(c, uLiner * 1.3, pad);
          fabH += pad * 0.002 * (1.0 - length(ep) * 0.5);
          fabH -= chLine(ed, 0.03) * step(hw * 0.75, abs(p.x)) * 0.0015;
          fabRough = mix(0.62, 0.95, pad); fabSpec = mix(0.32, 0.05, pad); fabSheen = mix(0.08, 0.4, pad);
          // Hybrid shell: a hard top shell over a slightly glossier lower band, split by a parting
          // groove that sweeps down from the temples to the nape.
          float ang = atan(p.x, p.z - cz);                       // 0 = front
          float splitY = uHelm.w - 0.004 - 0.022 * smoothstep(0.9, 2.6, abs(ang));
          float lower = 1.0 - smoothstep(-0.0015, 0.0015, p.y - splitY);
          fabH -= chLine(p.y - splitY, 0.0012) * 0.0012 * (1.0 - pad);
          c = mix(c, c * 0.82, lower * (1.0 - pad) * (1.0 - vent));
          fabRough = mix(fabRough, 0.42, lower * (1.0 - pad));
          fabSpec = mix(fabSpec, 0.55, lower * (1.0 - pad));
          // Side mark: a small accent tab on the lower band behind the temple.
          vec2 sm2 = vec2(p.z - cz + 0.02, p.y - splitY + 0.012);
          c = mix(c, uHAccent, (1.0 - step(0.0, chBox(sm2, vec2(0.012, 0.003), 0.0015))) * step(hw * 0.8, abs(p.x)) * (1.0 - pad));
          // Fine matte texture of the shell paint.
          fabH += chNoise(p.xz * 700.0 + p.y * 300.0) * 0.00004;
          // A small accent mark low on the back, a thin parting line over the crown.
          c = mix(c, uHAccent, (1.0 - step(0.0, chBox(vec2(p.x, p.y - uHelm.w + 0.005), vec2(0.014, 0.004), 0.002))) * step(p.z, cz - 0.1));
          fabH -= chLine(abs(p.x) - 0.0, 0.0012) * step(cz + 0.02, p.z) * crown * 0.0004;
          // Shell finish: 5 gloss, 1 metallic, 6 chrome, 7 carbon weave, 8 pearl.
          float shell = (1.0 - pad) * (1.0 - vent);
          float hf = uHFin.x;
          if (abs(hf - 5.0) < 0.5) { fabRough = mix(fabRough, 0.18, shell); fabSpec = mix(fabSpec, 1.6, shell); }
          else if (abs(hf - 1.0) < 0.5) { hMetal = shell; fabRough = mix(fabRough, 0.28, shell); }
          else if (abs(hf - 6.0) < 0.5) { hChrome = shell; fabRough = mix(fabRough, 0.08, shell); fabSpec = mix(fabSpec, 2.5, shell); }
          else if (abs(hf - 7.0) < 0.5) {
            vec2 w = vec2(p.x + p.z, p.x - p.z) * 260.0;
            float weave = step(0.5, fract(w.x)) == step(0.5, fract(w.y + floor(w.x) * 0.5)) ? 1.0 : 0.0;
            c = mix(c, c * (0.55 + 0.9 * weave) + 0.02, shell);
            fabRough = mix(fabRough, 0.22, shell); fabSpec = mix(fabSpec, 1.4, shell);
          } else if (abs(hf - 8.0) < 0.5) { hPearl = shell; fabRough = mix(fabRough, 0.25, shell); fabSpec = mix(fabSpec, 1.2, shell); }
        } else if (r < 1.5) {
          c = uLiner; fabRough = 0.9; fabSpec = 0.08; fabSheen = 0.25;
        } else if (r < 2.5) {
          // Silicone strap: a repeating wordmark in blocky letters, beaded edges.
          float x = vUV.x, y = vUV.y;
          float cell = fract(x / 0.13);
          float li = floor(cell * 13.0);
          float lx = fract(cell * 13.0);
          float word = step(0.12, cell) * step(cell, 0.74) * step(0.06, abs(fract(x / 0.39 + 0.25) - 0.5));   // gaps between wordmarks
          float hseed = fract(sin(li * 12.9898) * 43758.5453);
          float glyph = step(0.22, lx) * step(lx, 0.78) * step(abs(y), 0.3);
          glyph *= 1.0 - step(0.55, hseed) * step(abs(y), 0.12) * step(0.4, lx) * step(lx, 0.6);   // counters
          c = mix(uStrap, uStrapLogo, word * glyph * 0.85);
          c = mix(c, uStrap * 1.8 + 0.01, (1.0 - step(abs(y), 0.84)) * step(abs(y), 0.94));
          fabH += (1.0 - smoothstep(0.8, 0.95, abs(y))) * 0.0003;   // padded strap, rounded edges
          fabRough = 0.7; fabSpec = 0.15; fabSheen = 0.2;
        } else if (r < 3.5) {
          c = vec3(0.03); fabRough = 0.8; fabSpec = 0.1;
        } else {
          c = uFrame; fabRough = 0.55; fabSpec = 0.3;   // goggle frame / gasket
        }
        diffuseColor.rgb = c;
      }`,
    band: FABRIC_LIGHT + HELMET_LIGHT,
  });
  extend(m, { normal: 'normal = chBump(-vViewPosition, normal, fabH, faceDirection);', key: 'helmet' });
  return m;
}

/** Mirrored goggle lens: reflects a sky / snow environment in its tint, with a sun glint that blooms. */
export function lensMaterial() {
  const U = {
    uLens: { value: col('#f2a23a') }, uLensBase: { value: col('#b9471e') }, uLensIri: { value: 0 },
  };
  const m = toonMaterial({
    name: 'riderLens', rim: 0.0, uniforms: U,
    vertPars: 'varying vec3 vObj;',
    vertPre: 'vObj = position;',
    fragPars: 'uniform vec3 uLens, uLensBase; uniform float uLensIri; varying vec3 vObj;',
    frag: 'diffuseColor.rgb = uLensBase * 0.035;',
    band: /* glsl */`
      {
        vec3 Vv = normalize(vViewPosition);
        float NoV = clamp(dot(normal, Vv), 0.0, 1.0);
        vec3 nWd = inverseTransformDirection(normal, viewMatrix);
        vec3 vd = normalize(vW - cameraPosition);
        vec3 rd = reflect(vd, nWd);
        // Reflected elevation, plus the lens's own vertical position so the mirror always shows the
        // sky → horizon → snow sweep (a nearly flat lens would otherwise reflect one colour).
        float h = clamp(rd.y * 0.6 + (vObj.y - 1.707) * 7.0 + 0.08, -1.0, 1.0);
        vec3 zen = uSkyAmb * vec3(0.35, 0.55, 1.1);
        vec3 hor = uSkyAmb * 1.9 + uSunCol * 0.12;
        vec3 snow = uGroundAmb * 1.25 + uSunCol * 0.4;
        vec3 env = h > 0.0 ? mix(hor, zen, pow(clamp(h / 0.45, 0.0, 1.0), 0.7)) : mix(hor * 0.8, snow, smoothstep(0.0, -0.1, h));
        // Dark band of mountains / trees along the horizon: the mirror's graphic stripe.
        float az = atan(rd.x, rd.z);
        float sky1 = 0.035 * (sin(az * 5.0 + 1.3) * 0.6 + sin(az * 11.0 + 0.4) * 0.3 + sin(az * 23.0) * 0.15);
        float ridge = smoothstep(sky1 + 0.012, sky1 - 0.006, h) * smoothstep(-0.11, -0.05, h);   // mountains / trees
        env = mix(env, uGroundAmb * 0.35 + uSkyAmb * 0.1, ridge * 0.85);
        float sd = max(dot(rd, uSunDir), 0.0);
        float sun = pow(sd, 900.0) * 260.0 + pow(sd, 30.0) * 1.5;
        float F = 0.5 + 0.5 * pow(1.0 - NoV, 4.0);
        vec3 tint = mix(uLens, mix(uLens, uLensBase, 0.5) * 1.3, smoothstep(0.8, 0.2, NoV));   // iridescent shift at grazing angles
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + NoV * 2.2 + vObj.x * 9.0));
        tint = mix(tint, rainbow * (0.6 + 0.6 * uLens), uLensIri * smoothstep(1.0, 0.35, NoV) * 0.85);   // reward lenses: oil-slick rainbow
        toonAdd += (env * tint * 1.3 + uSunCol * sun * mix(tint, vec3(1.0), 0.6)) * F * mix(0.6, 1.0, occl);
        light *= 0.4;
      }`,
  });
  return m;
}

/**
 * Push a resolved outfit's reward looks (prints, finishes, decals, frames; outfits.js) into the
 * materials' uniforms. Missing fields fall back to plain (print 0, matte), the gaiter to its topo print.
 */
export function applyLook({ fabric, helmet, lens }, C) {
  const F = fabric.userData.uniforms, H = helmet.userData.uniforms, L = lens.userData.uniforms;
  const pat = (c, dflt = 0) => PATTERNS[c?.pat] ?? dflt;
  const fin = (c) => FINISHES[c?.finish] ?? 0;
  const set = (u, c, dflt) => { if (c) u.value.set(c); else if (dflt) u.value.set(dflt); };
  const J = C.jacket || {}, P = C.pants || {}, G = C.face || {}, M = C.gloves || {}, Hm = C.helmet || {}, Gg = C.goggles || {};
  F.uJPat.value.set(pat(J), J.patScale || 1, fin(J), 0); set(F.uJPatA, J.patA, J.accent); set(F.uJPatB, J.patB, J.panel);
  F.uPPat.value.set(pat(P), P.patScale || 1, fin(P), 0); set(F.uPPatA, P.patA, P.cuff); set(F.uPPatB, P.patB, P.cuff);
  F.uGPat.value.set(pat(G, PATTERNS.topo), G.patScale || 1, 0, 0); set(F.uGPatA, G.patA, '#a8a291'); set(F.uGPatB, G.patB, '#888888');
  F.uMPat.value.set(pat(M), 1, fin(M), 0); set(F.uMPatA, M.patA, M.cuff);
  if (G.base) F.uGaiter.value.set(G.base);
  H.uHFin.value.set(FINISHES[Hm.finish] ?? 0, DECALS[Hm.decal] ?? 0, 0, 0); set(H.uHDecal, Hm.decalCol, Hm.accent);
  set(H.uFrame, Gg.frame, '#252525');
  L.uLensIri.value = Gg.iri || 0;
}
