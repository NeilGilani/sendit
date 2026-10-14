// Shared world constants, global shader patches and small helpers.
import * as THREE from 'three';

// Golden hour: the sun sits low in the north-west (bearing 302°, 15° high) — a late-spring evening.
const SUN_BEARING = THREE.MathUtils.degToRad(302);
const SUN_ELEV = THREE.MathUtils.degToRad(15);
export const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_BEARING) * Math.cos(SUN_ELEV),
  Math.sin(SUN_ELEV),
  -Math.cos(SUN_BEARING) * Math.cos(SUN_ELEV),
).normalize();
export const SUN_COLOR = new THREE.Color(1.0, 0.7, 0.45);
export const SUN_INTENSITY = 7.0;

// Global uniforms shared by every patched material.
export const globals = {
  sunMaskTex: { value: null },       // baked mountain shadows (r) + sky visibility (g)
  terrainSize: { value: 6000 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: SUN_COLOR.clone().multiplyScalar(SUN_INTENSITY) },
  uTime: { value: 0 },
};

const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/**
 * Patch three's shader chunks once:
 *  - fog: physically flavoured aerial perspective + valley height fog with warm sun scattering
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
    // Aerial perspective (exponential with distance)
    float aerial = 1.0 - exp(-fdist * fogDensity);
    // Height fog pooled in the valleys below ~2400 m
    float h0 = 2300.0, b = 0.0025, a = 0.00012;
    float hc = cameraPosition.y - h0;
    float k = b * fdir.y;
    float hf = a * exp(-b * hc) * (abs(k) > 1e-5 ? (1.0 - exp(-k * fdist)) / k : fdist);
    float fogAmt = clamp(1.0 - exp(-hf) + aerial, 0.0, 1.0);
    float sunAmt = pow(max(dot(fdir, ${v3(SUN_DIR)}), 0.0), 6.0);
    vec3 cool = fogColor;
    vec3 warm = vec3(1.0, 0.7, 0.45) * 2.2;
    vec3 fc = mix(cool, warm, sunAmt * 0.7);
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

/** GLSL snippet: sample the baked sun mask for a world position (needs uniforms sunMaskTex, terrainSize). */
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
 * Add world-position varying + baked mountain shadow to any standard material.
 * `frag` (optional) is injected just before lighting to tweak diffuseColor etc.
 */
export function withWorld(material, { frag = '', fragPars = '', vert = '', vertPars = '', uniforms = {}, skyAO = true } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\nvarying vec3 vWN;\n${vertPars}`)
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
  ${vert}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\nvarying vec3 vWN;\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uTime;\nfloat skyVis = 1.0;\n${SUN_MASK_GLSL}\n${fragPars}`)
      .replace('#include <lights_fragment_begin>', `{
    vec2 sm = sunMaskAt(vW);
    sunMaskFactor = sm.r;
    skyVis = ${skyAO ? 'sm.g' : '1.0'};
  }
  #include <lights_fragment_begin>`)
      .replace('#include <aomap_fragment>', `reflectedLight.indirectDiffuse *= mix(0.45, 1.0, skyVis);
  reflectedLight.indirectSpecular *= mix(0.6, 1.0, skyVis);
  #include <aomap_fragment>`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${frag}`);
  };
  material.customProgramCacheKey = () => (material.name || '') + frag.length + vert.length + fragPars.length;
  return material;
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

export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
