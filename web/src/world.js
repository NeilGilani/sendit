// Shared world constants, global shader patches, the toon (cel) material system and helpers.
import * as THREE from 'three';
import { ART } from './config.js';

const SUN_BEARING = THREE.MathUtils.degToRad(ART.sunBearing);
const SUN_ELEV = THREE.MathUtils.degToRad(ART.sunElevation);
export const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_BEARING) * Math.cos(SUN_ELEV),
  Math.sin(SUN_ELEV),
  -Math.cos(SUN_BEARING) * Math.cos(SUN_ELEV),
).normalize();
export const SUN_COLOR = new THREE.Color(...ART.sunColor);
export const SUN_INTENSITY = ART.sunIntensity;

const c3 = (a) => new THREE.Color(a[0], a[1], a[2]);

// Global uniforms shared by every patched material.
export const globals = {
  sunMaskTex: { value: null },       // baked mountain shadows (r) + sky visibility (g)
  terrainSize: { value: 6000 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunLum: { value: SUN_INTENSITY * (0.2126 * ART.sunColor[0] + 0.7152 * ART.sunColor[1] + 0.0722 * ART.sunColor[2]) },
  uTime: { value: 0 },
  uLit: { value: c3(ART.snowLit) },
  uMid: { value: c3(ART.snowMid) },
  uDeep: { value: c3(ART.snowDeep) },
  uToonT: { value: new THREE.Vector2(...ART.toonThresholds) },
  uToonSoft: { value: ART.toonSoftness },
  uRimColor: { value: c3(ART.rimLightColor) },
  uWind: { value: new THREE.Vector2(ART.windSpeed, ART.windIntensity) },
  uTrackMap: { value: null },
  uTrackRegion: { value: new THREE.Vector3(0, 0, 140) },  // centre x, centre z, size
};

const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/**
 * Patch three's shader chunks once:
 *  - fog: stylized aerial perspective + valley height fog tinted toward the sky and the sun
 *  - lights: directional light is attenuated by `sunMaskFactor` (baked mountain shadows)
 */
export function patchShaderChunks() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG\n varying vec3 vFogWorld;\n#endif\n`;
  C.fog_vertex = `#ifdef USE_FOG
  #ifdef USE_INSTANCING
    vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
#endif\n`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform vec3 fogColor;
  uniform float fogDensity;
#endif\n`;
  C.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fdir = vFogWorld - cameraPosition;
    float fdist = length(fdir);
    fdir /= max(fdist, 1e-3);
    float aerial = 1.0 - exp(-fdist * fogDensity);
    float h0 = 2200.0, b = 0.003, a = 0.0001;
    float hc = cameraPosition.y - h0;
    float k = b * fdir.y;
    float hf = a * exp(-b * hc) * (abs(k) > 1e-5 ? (1.0 - exp(-k * fdist)) / k : fdist);
    float fogAmt = clamp(1.0 - exp(-hf) + aerial, 0.0, 0.92);
    float sunAmt = pow(max(dot(fdir, ${v3(SUN_DIR)}), 0.0), 5.0);
    vec3 fc = mix(fogColor, vec3(1.0, 0.82, 0.66), sunAmt * 0.8);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, fogAmt);
  }
#endif\n`;
  if (!C.lights_pars_begin.includes('sunMaskFactor')) {
    C.lights_pars_begin = 'float sunMaskFactor = 1.0;\n' + C.lights_pars_begin;
    C.lights_fragment_begin = C.lights_fragment_begin.replaceAll(
      'RE_Direct( directLight, geometryPosition',
      'directLight.color *= sunMaskFactor;\n\t\tRE_Direct( directLight, geometryPosition');
  }
}

/** GLSL snippet: sample the baked sun mask for a world position. */
export const SUN_MASK_GLSL = /* glsl */`
uniform sampler2D sunMaskTex;
uniform float terrainSize;
vec2 sunMaskAt(vec3 wp) {
  vec2 uv = (wp.xz + terrainSize * 0.5) / terrainSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(1.0);
  return texture2D(sunMaskTex, uv).rg;
}
`;

/**
 * Toon (cel) material: three-band shading — warm cream light, periwinkle mid-tone, indigo deep —
 * driven by the real light (N·L × shadow maps × baked mountain shadow) and sky occlusion.
 * Options:
 *   color, map, frag (GLSL run after the albedo is known; may set diffuseColor, toonSparkle,
 *   toonEmissive, toonRim), vert/vertPars (vertex hooks), uniforms, rim (0..1), side, transparent.
 */
export function toonMaterial(opts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color: opts.color ?? 0xffffff, map: opts.map ?? null, side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent, alphaTest: opts.alphaTest ?? 0, vertexColors: !!opts.vertexColors,
  });
  m.name = opts.name || 'toon';
  const rim = opts.rim ?? 0.0;
  const uniforms = { uRim: { value: rim }, uEmissiveBoost: { value: 0 }, ...(opts.uniforms || {}) };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
varying vec3 vWN;
uniform float uTime;
uniform vec2 uWind;
${opts.vertPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${opts.vertPre || ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
  {
    vec4 wp4 = vec4(transformed, 1.0);
    vec3 wn = objectNormal;
    #ifdef USE_INSTANCING
      wp4 = instanceMatrix * wp4;
      wn = mat3(instanceMatrix) * wn;
    #endif
    vW = (modelMatrix * wp4).xyz;
    vWN = normalize(mat3(modelMatrix) * wn);
  }
  ${opts.vert || ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
varying vec3 vWN;
uniform vec3 uSunDir; uniform float uSunLum; uniform float uTime;
uniform vec3 uLit; uniform vec3 uMid; uniform vec3 uDeep; uniform vec2 uToonT; uniform float uToonSoft;
uniform vec3 uRimColor; uniform float uRim; uniform float uEmissiveBoost;
float skyVis = 1.0;
float toonSparkle = 0.0;
vec3 toonEmissive = vec3(0.0);
float toonDeepBias = 0.0;
${SUN_MASK_GLSL}
${opts.fragPars || ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${opts.frag || ''}`)
      .replace('#include <lights_fragment_begin>', `{
    vec2 sm = sunMaskAt(vW);
    sunMaskFactor = sm.r;
    skyVis = sm.g;
  }
  #include <lights_fragment_begin>`)
      .replace('#include <opaque_fragment>', `{
    float alb = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float direct = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722)) * PI / (alb * uSunLum);
    float occl = mix(0.55, 1.0, skyVis) - toonDeepBias;
    float b1 = smoothstep(uToonT.x - uToonSoft, uToonT.x + uToonSoft, direct);
    float b2 = smoothstep(uToonT.y - uToonSoft, uToonT.y + uToonSoft, max(direct, 0.25) * occl);
    vec3 band = mix(mix(uDeep, uMid, b2), uLit, b1);
    vec3 col = band * diffuseColor.rgb;
    // Fresnel rim light — glows hardest when the rider is backlit by the low sun.
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), ${ART.rimPower.toFixed(2)});
    vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float back = 0.35 + 0.65 * clamp(dot(-V, sunV) * 0.5 + 0.5, 0.0, 1.0);
    col += uRimColor * fres * uRim * ${ART.rimStrength.toFixed(2)} * back * sunMaskFactor;
    col += toonSparkle * vec3(1.0, 0.98, 0.9);
    col += toonEmissive * (1.0 + uEmissiveBoost);
    outgoingLight = col;
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => m.name + (opts.frag || '').length + (opts.vert || '').length + (opts.vertPre || '').length;
  return m;
}

/** Inverted-hull outline for meshes (and skinned meshes): back faces pushed out along normals. */
export function outlineMaterial(width = ART.outlineWidth, color = ART.outlineColor) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.BackSide });
  m.name = 'outline';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
#ifdef USE_SKINNING
  transformed += normalize(objectNormal) * ${width.toFixed(4)};
#else
  transformed += normalize(normal) * ${width.toFixed(4)};
#endif
#include <project_vertex>`);
  };
  m.customProgramCacheKey = () => 'outline' + width;
  return m;
}

/** Tileable value-noise fbm texture (R = coarse, G = fine, B = ridged) generated on the CPU. */
export function makeNoiseTexture(size = 512, seed = 7) {
  const rnd = mulberry32(seed);
  const octave = (cells) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % cells) * cells + (x0 % cells)];
      const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  };
  const layersA = [4, 8, 16, 32, 64].map(octave);
  const layersB = [16, 32, 64, 128].map(octave);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0, amp = 1, tot = 0;
      for (const l of layersA) { a += l(x, y) * amp; tot += amp; amp *= 0.5; }
      a /= tot;
      let b = 0; amp = 1; tot = 0;
      for (const l of layersB) { b += l(x, y) * amp; tot += amp; amp *= 0.55; }
      b /= tot;
      const r = 1 - Math.abs(layersA[2](x, y) * 2 - 1);
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, Math.max(0, (a - 0.5) * 1.8 * 255 + 128));
      data[i + 1] = Math.min(255, Math.max(0, (b - 0.5) * 1.8 * 255 + 128));
      data[i + 2] = r * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frame-rate independent exponential approach. */
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
