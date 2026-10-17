// High-altitude atmosphere, computed once on the CPU (the sun is static):
//  - single-scattering Rayleigh + Mie sky (Nishita style) seen from ~2.7 km → baked to a small
//    half-float LUT that the sky dome samples (deep blue zenith, pale hazy horizon, warm forward glow)
//  - from the same model: sun colour after the atmosphere, cosine-weighted sky irradiance (the blue
//    shade on snow), snow-bounce ground light, and horizon haze colours for aerial perspective
// Everything is linear HDR in one consistent unit (the post stack exposes and tone maps it).
import * as THREE from 'three';
import { ATMOSPHERE, LIGHTING } from '../scene.js';

const RE = 6360e3, RA = 6420e3;

function sunDir() {
  const b = THREE.MathUtils.degToRad(LIGHTING.sunBearing);
  const e = THREE.MathUtils.degToRad(LIGHTING.sunElevation);
  return [Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)];
}

/** Ray / sphere (centred at origin) far intersection distance from p along d, or -1. */
function sphereFar(p, d, r) {
  const b = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
  const c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  return -b + Math.sqrt(h);
}
function sphereNear(p, d, r) {
  const b = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
  const c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : -1;
}

const A = ATMOSPHERE;
const bR = A.rayleigh, bM = A.mie;

/** Optical depth (rayleigh, mie) from p toward d to the top of the atmosphere (8 samples). */
function lightDepth(p, d) {
  const L = sphereFar(p, d, RA);
  const n = 8, ds = L / n;
  let oR = 0, oM = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * ds;
    const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
    const h = Math.sqrt(x * x + y * y + z * z) - RE;
    if (h < 0) return [1e9, 1e9];
    oR += Math.exp(-h / A.rayleighHeight) * ds;
    oM += Math.exp(-h / A.mieHeight) * ds;
  }
  return [oR, oM];
}

/** Single-scattered sky radiance along d (unit), seen from altitude h0. Returns [r, g, b]. */
export function skyRadiance(d, sun = sunDir(), h0 = A.viewAltitude) {
  const p = [0, RE + h0, 0];
  let L = sphereFar(p, d, RA);
  const g = sphereNear(p, d, RE);
  if (g > 0) L = g;
  const n = 24, ds = L / n;
  const mu = d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2];
  const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const gg = A.mieG;
  const pM = 3 / (8 * Math.PI) * ((1 - gg * gg) * (1 + mu * mu)) / ((2 + gg * gg) * Math.pow(1 + gg * gg - 2 * gg * mu, 1.5));
  let oR = 0, oM = 0;
  const sumR = [0, 0, 0], sumM = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * ds;
    const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
    const h = Math.sqrt(x * x + y * y + z * z) - RE;
    const hr = Math.exp(-h / A.rayleighHeight) * ds, hm = Math.exp(-h / A.mieHeight) * ds;
    oR += hr; oM += hm;
    const [lR, lM] = lightDepth([x, y, z], sun);
    for (let c = 0; c < 3; c++) {
      const tau = bR[c] * (oR + lR) + bM * 1.11 * (oM + lM);
      const att = Math.exp(-tau);
      sumR[c] += att * hr; sumM[c] += att * hm;
    }
  }
  const I = A.sunIntensity;
  return [0, 1, 2].map((c) => I * (sumR[c] * bR[c] * pR + sumM[c] * bM * pM));
}

/** Sun colour after the atmosphere (transmittance from the viewer's altitude), times intensity. */
export function sunTransmitted(sun = sunDir(), h0 = A.viewAltitude) {
  const [oR, oM] = lightDepth([0, RE + h0, 0], sun);
  return [0, 1, 2].map((c) => A.sunIntensity * Math.exp(-(bR[c] * oR + bM * 1.11 * oM)));
}

// ---------------------------------------------------------------- the bake
/** Cheap multiple-scattering stand-in: near the horizon the sky turns milky white-blue. */
function msApprox(r, el) {
  const L = 0.3 * r[0] + 0.6 * r[1] + 0.1 * r[2];
  const w = Math.pow(Math.max(0, 1 - Math.abs(el) / 0.3), 2) * A.horizonWhiten;
  const t = [L * 0.94, L * 1.0, L * 1.1];
  const up = Math.pow(Math.max(0, Math.sin(el)), 0.55);
  const g = 1 + A.zenithGain * up;                   // the upper sky is brighter than single scattering says
  const sat = 1 + A.zenithSat * up;
  const out = r.map((v, c) => (v + (t[c] - v) * w) * (1 + w * A.horizonGain) + L * A.multiScatter * [0.55, 0.8, 1.2][c]);
  const L2 = 0.3 * out[0] + 0.6 * out[1] + 0.1 * out[2];
  return out.map((v) => Math.max(0, (L2 + (v - L2) * sat) * g));
}

const LUT_W = 128, LUT_H = 96;
const elevOf = (v) => { const e = v * 2 - 1; return Math.sign(e) * e * e * Math.PI / 2; };

/**
 * Bake: sky LUT + derived lighting colours (all scaled by ATMOSPHERE.skyScale).
 * `opts` (per-map atmosphere, see applyAtmosphere()): skyZenith / skyHorizon as linear radiance
 * targets ([r, g, b] in the LUT units before skyScale), ambientScale, sunIntensity.
 */
function bake(opts = {}) {
  const t0 = performance.now();
  const sun = sunDir();
  const S = A.skyScale;
  const data = new Uint16Array(LUT_W * LUT_H * 4);
  const raw = new Float32Array(LUT_W * LUT_H * 3);
  const toH = THREE.DataUtils.toHalfFloat;
  let irr = [0, 0, 0], wsum = 0;
  const hor = { away: [0, 0, 0], toward: [0, 0, 0], side: [0, 0, 0] };
  const rowMean = [];
  for (let j = 0; j < LUT_H; j++) {
    const el = elevOf((j + 0.5) / LUT_H);
    const m = [0, 0, 0];
    for (let i = 0; i < LUT_W; i++) {
      const az = ((i + 0.5) / LUT_W - 0.5) * Math.PI * 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      let r = skyRadiance(d, sun);
      if (el < 0) {
        // Below the horizon: the bright valley haze seen just above the horizon (any gap between the
        // ranges must read as distant haze, not as a dark band).
        const e = 0.03;
        r = msApprox(skyRadiance([Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)], sun), e).map((v) => v * 1.12);
      } else r = msApprox(r, el);
      const o = (j * LUT_W + i) * 3;
      for (let c = 0; c < 3; c++) { raw[o + c] = r[c]; m[c] += r[c] / LUT_W; }
    }
    rowMean.push(m);
  }
  // Per-map sky colours: the sky is re-coloured toward the targets while keeping the baked luminance
  // structure (brighter toward the sun / horizon). The horizon colour is the sun-side horizon: the
  // opposite horizon gets a mix toward the zenith colour (twilight's blue-violet anti-solar side),
  // and the horizon colour hugs the horizon (glow band) so the upper sky, which lights the shade,
  // stays the zenith colour.
  const tinted = !!(opts.skyZenith || opts.skyHorizon);
  if (tinted) {
    const Z = opts.skyZenith ?? rowMean[LUT_H - 1], Hc = opts.skyHorizon ?? rowMean[Math.floor(LUT_H / 2)];
    const away = [0, 1, 2].map((c) => Hc[c] + (Z[c] - Hc[c]) * 0.6);
    const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const sunAz = Math.atan2(sun[2], sun[0]);
    for (let j = 0; j < LUT_H; j++) {
      const el = elevOf((j + 0.5) / LUT_H);
      const t = Math.pow(Math.max(0, Math.sin(el)), 0.3);
      const mL = Math.max(1e-6, lum(rowMean[j]));
      for (let i = 0; i < LUT_W; i++) {
        const az = ((i + 0.5) / LUT_W - 0.5) * Math.PI * 2;
        const w = Math.pow((1 + Math.cos(az - sunAz)) / 2, 1.5);   // 1 toward the sun, 0 away
        const o = (j * LUT_W + i) * 3;
        const rel = lum([raw[o], raw[o + 1], raw[o + 2]]) / mL;
        for (let c = 0; c < 3; c++) {
          const hz = away[c] + (Hc[c] - away[c]) * w;
          raw[o + c] = (hz + (Z[c] - hz) * t) * rel;
        }
      }
    }
  }
  const lutAt = (az, el) => {
    const u = (((az / (Math.PI * 2) + 0.5) % 1) + 1) % 1;
    const i = Math.min(LUT_W - 1, Math.max(0, Math.floor(u * LUT_W)));
    const v = Math.sign(el) * Math.sqrt(Math.abs(el) / (Math.PI / 2)) * 0.5 + 0.5;
    const j = Math.min(LUT_H - 1, Math.max(0, Math.floor(v * LUT_H)));
    const o = (j * LUT_W + i) * 3;
    return [raw[o], raw[o + 1], raw[o + 2]];
  };
  for (let j = 0; j < LUT_H; j++) {
    const el = elevOf((j + 0.5) / LUT_H);
    for (let i = 0; i < LUT_W; i++) {
      const o3 = (j * LUT_W + i) * 3, o = (j * LUT_W + i) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = toH(raw[o3 + c] * S);
      data[o + 3] = toH(1);
      if (el > 0) {
        const w = Math.sin(el) * Math.cos(el) * (elevOf((j + 1) / LUT_H) - elevOf(j / LUT_H));   // cos-weighted solid angle
        for (let c = 0; c < 3; c++) irr[c] += raw[o3 + c] * S * w;
        wsum += w;
      }
    }
  }
  irr = irr.map((v) => v / wsum);    // cosine-weighted mean radiance = E / π
  const tex = new THREE.DataTexture(data, LUT_W, LUT_H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  // Horizon haze colours (aerial perspective target) toward / across / away from the sun.
  const horizon = (azOff) => {
    const sa = Math.atan2(sun[2], sun[0]) + azOff;
    const e = 0.07;
    if (tinted) return lutAt(sa, e).map((v) => v * S);   // follows the re-coloured sky
    const d = [Math.cos(sa) * Math.cos(e), Math.sin(e), Math.sin(sa) * Math.cos(e)];
    return msApprox(skyRadiance(d, sun), e).map((v) => v * S);
  };
  hor.toward = horizon(0.35);      // a little off the sun so the disk's Mie peak does not dominate
  hor.side = horizon(Math.PI / 2);
  hor.away = horizon(Math.PI);
  let sunT = sunTransmitted(sun).map((v, c) => v * S / Math.PI * (opts.sunIntensity ?? 1) * (opts.sunTint ? opts.sunTint[c] : 1));   // irradiance / pi (Lambert units)
  const sL = 0.2126 * sunT[0] + 0.7152 * sunT[1] + 0.0722 * sunT[2];
  if (!opts.sunTint) sunT = sunT.map((v) => v + (sL - v) * LIGHTING.sunWhiten);      // high-altitude sun is close to white
  const sinE = Math.sin(THREE.MathUtils.degToRad(LIGHTING.sunElevation));
  const ground = [0, 1, 2].map((c) => A.groundAlbedo[c] * (sunT[c] * sinE + irr[c] * LIGHTING.skyBoost));
  // Shade is lit by the sky AND by the sunlit slopes around it (terrain bounce neutralises the blue).
  irr = irr.map((v, c) => (v * LIGHTING.skyBoost + ground[c] * LIGHTING.terrainBounce) * (opts.ambientScale ?? 1));
  for (let c = 0; c < 3; c++) ground[c] *= opts.ambientScale ?? 1;
  const zen = skyRadiance([0, 1, 0], sun).map((v) => v * S);
  const out = { tex, sun: sunT, sky: irr, ground, hor, zenith: zen, ms: performance.now() - t0 };
  console.log('[gfx] atmosphere', JSON.stringify(out, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : (k === 'tex' ? undefined : v))));
  return out;
}

export const ATMO = bake();

const DEFAULTS = { sunElevation: LIGHTING.sunElevation, sunBearing: LIGHTING.sunBearing, aerialColor: A.aerialColor, aerialDensity: A.aerialDensity };
/** sRGB hex / css string / [r, g, b] (0..1, sRGB) -> linear [r, g, b]. */
function linColor(c) {
  if (c == null) return null;
  const col = Array.isArray(c) ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) : new THREE.Color(c);
  return [col.r, col.g, col.b];
}

/**
 * Per-map atmosphere (course.atmosphere, any subset; docs/graphics.md). Resets to the defaults, applies
 * the map's values and re-bakes the sky / light colours in place (ATMO keeps its identity). Must run
 * before any material compiles: world.js applyMapAtmosphere() wraps it (shared uniforms, fog chunk) and
 * main.js calls that right after the map loads.
 *   sunElevation, sunBearing  degrees (the ?sun= URL debug override still wins)
 *   skyZenith, skyHorizon     sky colours as they should look on screen (sRGB hex or [r, g, b] 0..1)
 *   fogColor                  tint on the aerial-perspective / haze colour (sRGB hex or [r, g, b])
 *   fogDensity                multiplier on the haze extinction (1 = default)
 *   exposure                  camera exposure (default POST.exposure)
 *   ambientScale              multiplier on sky + bounce light (how bright shade is)
 *   sunIntensity              (extra) multiplier on the sun (e.g. 0.1 for moonlight)
 *   sunTint                   (extra) colour of the sun light (sRGB), replaces the physical sun colour
 *   preset                    (extra) 'golden' | 'dusk' | 'night': start from ATMOSPHERE_PRESETS
 * Returns { exposure } for the post stack.
 */
export const ATMOSPHERE_PRESETS = {
  // Low warm sun, long shadows, amber haze.
  golden: { sunElevation: 13, sunBearing: 195, skyZenith: '#4a78c0', skyHorizon: '#f6d2a6', fogColor: '#ffdcb4', fogDensity: 1.2, exposure: 0.66, ambientScale: 0.85, sunTint: '#ffd09a' },
  // Sun almost down: violet-blue sky, peach horizon, dim warm light, deep blue shade.
  dusk: { sunElevation: 7, sunBearing: 205, skyZenith: '#30447e', skyHorizon: '#eaa27e', fogColor: '#efc1ad', fogDensity: 1.3, exposure: 0.9, ambientScale: 0.95, sunIntensity: 0.55, sunTint: '#ffa070' },
  night: { sunElevation: 28, sunBearing: 140, skyZenith: '#070b18', skyHorizon: '#1b2740', fogColor: '#7f93c8', fogDensity: 0.8, exposure: 2.2, ambientScale: 4.0, sunIntensity: 0.11, sunTint: '#a9c4ff' },
};

export function applyAtmosphere(atm = {}, { defaultExposure = 0.62 } = {}) {
  atm = atm || {};
  if (atm.preset && ATMOSPHERE_PRESETS[atm.preset]) atm = { ...ATMOSPHERE_PRESETS[atm.preset], ...atm };
  LIGHTING.sunElevation = atm.sunElevation ?? DEFAULTS.sunElevation;
  LIGHTING.sunBearing = atm.sunBearing ?? DEFAULTS.sunBearing;
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('sun');
    if (q) { const [b, e] = q.split(',').map(Number); if (Number.isFinite(b)) LIGHTING.sunBearing = b; if (Number.isFinite(e)) LIGHTING.sunElevation = e; }
  }
  A.aerialColor = atm.fogColor != null ? '#' + new THREE.Color().setRGB(...linColor(atm.fogColor)).getHexString() : DEFAULTS.aerialColor;
  A.aerialDensity = atm.fogDensity ?? DEFAULTS.aerialDensity;
  // Screen colours -> linear radiance in the LUT units (display ~ exposure x skyScale x radiance).
  const exposure = atm.exposure ?? defaultExposure;
  const toRad = (c) => { const l = linColor(c); return l && l.map((v) => v / Math.max(1e-4, exposure * A.skyScale)); };
  const old = ATMO.tex;
  Object.assign(ATMO, bake({ skyZenith: toRad(atm.skyZenith), skyHorizon: toRad(atm.skyHorizon), ambientScale: atm.ambientScale, sunIntensity: atm.sunIntensity, sunTint: linColor(atm.sunTint) }));
  if (old !== ATMO.tex) old.dispose();
  return { exposure };
}
export const SKY_LUT_W = LUT_W;
const c3 = (a, k = 1) => new THREE.Color(a[0] * k, a[1] * k, a[2] * k);
export const sunColor = () => c3(ATMO.sun, LIGHTING.sunBoost);
export const skyIrradiance = () => c3(ATMO.sky);
export const groundIrradiance = () => c3(ATMO.ground, LIGHTING.groundBoost);
const g3 = (a, k = 1) => `vec3(${(a[0] * k).toFixed(5)}, ${(a[1] * k).toFixed(5)}, ${(a[2] * k).toFixed(5)})`;
export const glslVec3 = g3;

/** GLSL: elevation-warped LUT lookup (shared by the sky dome). */
export const SKY_LUT_GLSL = /* glsl */`
vec3 skyLUT(sampler2D lut, vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float e = sign(el) * sqrt(abs(el) / 1.5707963);
  vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, e * 0.5 + 0.5);
  return texture2D(lut, uv).rgb;
}
`;

// ---------------------------------------------------------------- aerial perspective (fog chunk)
export function fogParsFragmentGLSL() {
  const H = A.mistTop - A.mistBottom;
  return /* glsl */`#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform vec3 fogColor;
  uniform float fogDensity;
  float mistP(float y) { return clamp((${A.mistTop.toFixed(1)} - y) / ${H.toFixed(1)}, 0.0, 1.0); }
  float mistG(float y) {
    float t = ${A.mistTop.toFixed(1)} - y;
    if (t <= 0.0) return 0.0;
    if (t < ${H.toFixed(1)}) return -t * t / ${(2 * H).toFixed(1)};
    return -${(H / 2).toFixed(1)} - (t - ${H.toFixed(1)});
  }
  // Optical depth along a straight path through an exponential height profile.
  float expDepth(float yc, float yf, float dist, float y0, float hs) {
    float a = exp(-(yc - y0) / hs);
    float dy = yf - yc;
    if (abs(dy) < 1.0) return a * dist;
    return dist * hs * (a - exp(-(yf - y0) / hs)) / dy;
  }
#endif
`;
}

export function fogFragmentGLSL(sunDirV) {
  const h = ATMO.hor;
  return /* glsl */`#ifdef USE_FOG
  {
    vec3 fdir = vFogWorld - cameraPosition;
    float fdist = length(fdir);
    fdir /= max(fdist, 1e-3);
    float mu = dot(fdir, vec3(${sunDirV.x.toFixed(5)}, ${sunDirV.y.toFixed(5)}, ${sunDirV.z.toFixed(5)}));
    // Inscatter colour = the horizon sky in that direction (warm toward the sun, blue away).
    float az = dot(normalize(fdir.xz + 1e-5), normalize(vec2(${sunDirV.x.toFixed(5)}, ${sunDirV.z.toFixed(5)})));
    vec3 hz = az > 0.0 ? mix(${g3(h.side)}, ${g3(h.toward)}, az * az) : mix(${g3(h.side)}, ${g3(h.away)}, az * az);
    hz += ${g3(ATMO.sun, A.hazeSunGlow)} * pow(max(mu, 0.0), 10.0);
    hz *= fogColor;                       // runtime tint (scene.fog.color, white by default)
    // Rayleigh-ish (blue-heavy, tall) + haze (grey, low) extinction; per-channel transmittance.
    float yc = cameraPosition.y, yf = vFogWorld.y;
    float dR = expDepth(yc, yf, fdist, ${A.hazeBase.toFixed(1)}, ${A.airHeight.toFixed(1)});
    float dM = expDepth(yc, yf, fdist, ${A.hazeBase.toFixed(1)}, ${A.hazeHeight.toFixed(1)});
    vec3 tau = fogDensity * (dR * ${g3(A.airExtinction)} + dM * ${A.hazeExtinction.toFixed(3)});
    vec3 trans = exp(-tau);
    trans = max(trans, vec3(1.0 - ${A.aerialMax.toFixed(3)}));
    gl_FragColor.rgb = gl_FragColor.rgb * trans + hz * (1.0 - trans);
    // Valley haze pooled below mistTop (exact path integral through a linear height ramp).
    float avg = abs(yf - yc) > 0.5 ? (mistG(yf) - mistG(yc)) / (yf - yc) : mistP(yc);
    float mAmt = (1.0 - exp(-fdist * avg * ${A.mistDensity.toFixed(6)})) * ${A.mistMaxOpacity.toFixed(2)};
    vec3 mCol = mix(${g3(h.away, A.mistDeep)}, ${g3(h.side, A.mistLight)}, smoothstep(${A.mistBottom.toFixed(1)}, ${A.mistTop.toFixed(1)}, yf + 150.0));
    mCol += ${g3(ATMO.sun, A.hazeSunGlow * 0.6)} * pow(max(mu, 0.0), 6.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mCol * fogColor, mAmt);
  }
#endif
`;
}
