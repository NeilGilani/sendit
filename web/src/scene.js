// =====================================================================================
// SENDIT — SCENE FILE
// The whole look of the mountain lives here: the lighting rig, the custom 3-band snow terrain
// GLSL, the twilight sky with layered low-poly ranges, the aerial + valley-mist fog, the character
// outline and every environment spawning parameter. The look is tuned for contrast: the snow
// gets its shape from hard toon bands driven by a low side-on sun, never from ambient wash.
// =====================================================================================
import * as THREE from 'three';

// ------------------------------------------------------------------ LIGHTING
export const LIGHTING = {
  sunElevation: 21,              // degrees — low enough that every hill has a lit and a shaded side
  sunBearing: 292,               // degrees from north — raking side light across the north-facing run
  sunColor: '#ffe2b8',           // warm sunrise
  sunIntensity: 3.4,
  ambientSky: '#6f7fc8',         // hemisphere fill — only touches the few non-toon materials
  ambientGround: '#232750',
  ambientIntensity: 0.18,        // deliberately low: no ambient over-exposure
  shadowBias: -0.0005,
  shadowNormalBias: 0.5,
  shadowRadius: 1.5,
};

// ------------------------------------------------------------------ SNOW (hard 3-band toon)
export const SNOW = {
  lit: '#fcfaf2',                // band 1 — warm sunrise off-white (direct light)
  mid: '#cbdcf7',                // band 2 — crisp periwinkle / lavender (slopes, hills, lips, cast shadows)
  deep: '#313b73',               // band 3 — deep indigo / violet (crevices, drop-offs, valleys)
  litThreshold: 0.3,             // normalized direct light (N·L × shadows) above this → band 1
  deepFacing: -0.2,              // macro N·L below this (steep faces turned away from the sun) → band 3
  deepOcclusion: 0.42,           // baked sky visibility below this (gullies, couloirs) → band 3
  microNormalStrength: 0.6,      // high-frequency snow-pack normal map (micro-shadows)
  microTile: 1.6,                // metres per micro-normal tile (+ a 4× finer detail octave)
  microFadeDistance: 120,        // metres — fades out before it can alias
  driftStrength: 52,             // sculpted wind drifts (big organic band shapes)
  sparkle: 2.2,
  rock: '#4a4f78',               // slate-violet rock, two strata tones
  rockLight: '#6d7299',
  rockLitTint: '#fff1dc',        // band multipliers for rock (keeps rock readable, never black)
  rockMidTint: '#a9b4e6',
  rockDeepTint: '#5b6299',
};

// Generic objects (pines, rider, lifts) use softer band multipliers so colour survives in shade.
export const OBJECT_BANDS = {
  lit: '#fffaf0',
  mid: '#b9c6f0',
  deep: '#6e74b8',
  litThreshold: 0.22,
  deepFacing: -0.3,
};

// ------------------------------------------------------------------ ATMOSPHERE
export const ATMOSPHERE = {
  skyZenith: '#1c1850',          // deep twilight indigo
  skyMid: '#5a3f93',             // twilight purple
  skyHorizon: '#f4a76f',         // golden sunrise band
  sunGlow: '#ffcf87',
  cloudShade: '#7a6cb8',
  cloudLit: '#ffd9b0',
  aerialColor: '#8f86c9',        // distant lavender haze
  aerialDensity: 0.000034,
  aerialMax: 0.78,
  mistColor: '#2c7488',          // teal valley mist
  mistDeepColor: '#262a66',      // indigo at the valley floor
  mistTop: 2500,                 // metres — anything below fades into mist
  mistBottom: 1750,
  mistDensity: 1 / 420,          // per metre of path inside full-density mist
  mistMaxOpacity: 0.9,
  ridgeColors: ['#c3a6d6', '#9277c4', '#634f9e', '#3b3274'],   // layered horizon ranges, far → near
  ridgeGlow: '#ffc27a',          // golden rim on the facets that face the sun
};

// ------------------------------------------------------------------ CHARACTER OUTLINE
export const OUTLINE = {
  px: 2.0,                       // screen-space thickness in CSS pixels (constant at any distance)
  color: '#141a3c',              // dark navy
};

// ------------------------------------------------------------------ ENVIRONMENT SPAWNING
export const SPAWN = {
  region: 1100,                  // metres around the opening run that get the dense hand-placed look
  runLength: 2600,               // metres of the opening run used as the spawn spine
  treeStep: 7.5,                 // metres between tree candidates
  treeMaxAltitude: 3450,         // stylized treeline (clusters thin out from treeThinFrom)
  treeThinFrom: 3150,
  treeMaxSlope: 34,              // degrees
  treeClusterScale: 0.0075,      // noise frequency of the pine clusters
  treeClusterThreshold: 0.5,
  treeDensity: 0.7,              // acceptance inside a cluster
  treeMax: 22000,
  treeScale: [0.55, 1.35],
  runCorridor: 24,               // metres kept clear either side of the opening run
  pisteClear: 0.3,               // groomed splat above this stays clear
  rockClusterStep: 26,
  rockClusterChance: 0.22,
  rockMinSlope: 18,
  rockMaxSlope: 50,
  rockPerCluster: [3, 7],
  rockScale: [0.6, 2.4],
  iceShardsPerCluster: [1, 4],
  iceTint: '#a8e3ff',
  fenceOffset: 16,               // metres from the run centreline (outside the spectators)
  fenceFrom: 30,                 // metres down the run
  fenceTo: 900,
  fenceSpacing: 2.6,             // metres between posts
  fenceHeight: 1.15,
  ridgeFenceStep: 34,            // grid step when searching for ridge crests
  ridgeFenceProminence: 1.6,     // metres a crest must stand above both flanks (at ±16 m)
  ridgeFenceMax: 70,             // crest fence segments
  ridgeFencePosts: 7,
  woodColor: '#7a4a2a',
};

// ------------------------------------------------------------------ helpers
export const col = (hex) => new THREE.Color(hex);
const glslColor = (hex) => { const c = col(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const glslVec = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

export function sunDirection() {
  const b = THREE.MathUtils.degToRad(LIGHTING.sunBearing);
  const e = THREE.MathUtils.degToRad(LIGHTING.sunElevation);
  return new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).normalize();
}

/** Scene lighting: one low warm sun (shadow-casting) + a very dim hemisphere fill. */
export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight(col(LIGHTING.ambientSky), col(LIGHTING.ambientGround), LIGHTING.ambientIntensity);
  hemi.name = 'AmbientFill';
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(col(LIGHTING.sunColor), LIGHTING.sunIntensity);
  sun.name = 'Sun';
  sun.castShadow = true;
  sun.shadow.bias = LIGHTING.shadowBias;
  sun.shadow.normalBias = LIGHTING.shadowNormalBias;
  sun.shadow.radius = LIGHTING.shadowRadius;
  const target = new THREE.Object3D();
  sun.target = target;
  scene.add(sun, target);
  return { sun, hemi, target };
}

/** High-frequency snow-pack normal map (tileable), generated once on the CPU. RGB = (x, z, y). */
export function makeMicroNormalTexture(size = 512, seed = 31) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const h = new Float32Array(size * size);
  const oct = (cells, amp) => {
    const g = new Float32Array(cells * cells).map(() => rnd());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      h[y * size + x] += ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * amp;
    }
  };
  // Wind-packed lumps, scallops and crust grain.
  oct(6, 1.0); oct(12, 0.7); oct(24, 0.45); oct(48, 0.25); oct(96, 0.12);
  const data = new Uint8Array(size * size * 4);
  const k = size / 24;   // slope gain
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = h[y * size + ((x - 1 + size) % size)], hr = h[y * size + ((x + 1) % size)];
    const hd = h[((y - 1 + size) % size) * size + x], hu = h[((y + 1) % size) * size + x];
    const nx = (hl - hr) * k, nz = (hd - hu) * k;
    const len = Math.hypot(nx, 1, nz);
    const i = (y * size + x) * 4;
    data[i] = (nx / len * 0.5 + 0.5) * 255;
    data[i + 1] = (nz / len * 0.5 + 0.5) * 255;
    data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ SNOW TERRAIN SHADER
/** Uniforms for the snow band (shared by the near terrain and the far backdrop). */
export function snowUniforms(microTex = null) {
  return {
    uSnowLit: { value: col(SNOW.lit) },
    uSnowMid: { value: col(SNOW.mid) },
    uSnowDeep: { value: col(SNOW.deep) },
    uRockLitTint: { value: col(SNOW.rockLitTint) },
    uRockMidTint: { value: col(SNOW.rockMidTint) },
    uRockDeepTint: { value: col(SNOW.rockDeepTint) },
    uRockCol: { value: col(SNOW.rock) },
    uRockLight: { value: col(SNOW.rockLight) },
    uSnowParams: { value: new THREE.Vector4(SNOW.litThreshold, SNOW.deepFacing, SNOW.deepOcclusion, SNOW.microNormalStrength) },
    uMicro: { value: new THREE.Vector3(SNOW.microTile, SNOW.microFadeDistance, SNOW.driftStrength) },
    microTex: { value: microTex },
  };
}

/** Declarations for the band (fragment). */
export const SNOW_BAND_PARS = /* glsl */`
uniform vec3 uSnowLit; uniform vec3 uSnowMid; uniform vec3 uSnowDeep;
uniform vec3 uRockLitTint; uniform vec3 uRockMidTint; uniform vec3 uRockDeepTint;
uniform vec3 uRockCol; uniform vec3 uRockLight;
uniform vec4 uSnowParams;   // x lit threshold, y deep facing, z deep occlusion, w micro strength
uniform vec3 uMicro;        // x tile metres, y fade distance, z drift strength
float tMicro = 0.0;         // micro-normal lighting delta (micro-shadows)
float tRock = 0.0;          // rock coverage
float tTrack = 0.0;         // carved track depth
float tFacing = 2.0;        // world N·L of the macro landform (2 = unset → use the shading normal)
`;

/** Terrain-only declarations + helpers (fragment). */
export const SNOW_PARS_GLSL = /* glsl */`
uniform sampler2D normalTex; uniform sampler2D splatTex; uniform sampler2D noiseTex; uniform sampler2D microTex;
uniform float sparkle; uniform float terrainRes; uniform float terrainSpacing;
uniform sampler2D uTrackMap; uniform vec3 uTrackRegion;
vec3 tN;
vec2 tUV(vec2 xz) { return ((xz + terrainSize * 0.5) / terrainSpacing + 0.5) / terrainRes; }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float trackAt(vec2 xz) {
  vec2 uv = (xz - uTrackRegion.xy) / uTrackRegion.z + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uTrackMap, uv).r;
}
vec3 microN(vec2 xz) {
  vec3 a = texture2D(microTex, xz / uMicro.x).xzy * 2.0 - 1.0;
  vec3 b = texture2D(microTex, xz / (uMicro.x * 0.27) + 0.37).xzy * 2.0 - 1.0;
  return vec3(a.x + b.x * 0.55, 0.0, a.z + b.z * 0.55);
}
`;

/** Albedo, macro normal, micro-shadows, tracks and sparkle (runs after map_fragment). */
export const SNOW_FRAG_GLSL = /* glsl */`
{
  vec2 uv = tUV(vW.xz);
  vec2 nn = texture2D(normalTex, uv).rg * 2.0 - 1.0;
  vec3 N = normalize(vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y));
  vec3 s = texture2D(splatTex, uv).rgb;
  float dist = length(vW - cameraPosition);
  float m2 = texture2D(noiseTex, vW.xz * 0.0093 + 0.37).r;
  float m3 = texture2D(noiseTex, vW.xz * 0.06 + 0.71).g;
  float groomed = smoothstep(0.25, 0.75, s.r);

  float farF = smoothstep(250.0, 1200.0, dist);

  // Rock first (from the landform): slate-violet strata where it is too steep to hold snow.
  float flatness = smoothstep(0.6, 0.85, N.y + (m3 - 0.5) * 0.12 * (1.0 - farF));
  float rock = clamp(smoothstep(0.3, 0.58, s.g + (m2 - 0.5) * 0.45 * s.g) * (1.0 - flatness * 0.9), 0.0, 1.0);
  float strata = mix(texture2D(noiseTex, vec2(vW.y * 0.03 + m2, vW.x * 0.002 + vW.z * 0.002)).b, 0.45, farF);   // no far aliasing
  vec3 rockCol = mix(uRockCol, uRockLight, step(0.55, strata));
  rock *= 1.0 - step(0.72, N.y + (m3 - 0.5) * 0.35 * (1.0 - farF)) * step(0.4, strata);   // snow-loaded ledges

  // Sculpted wind drifts on the snow only: broad dunes give the hard bands organic, readable contours.
  vec2 q1 = vW.xz * 0.011 + vec2(0.13, 0.7);
  float d0 = texture2D(noiseTex, q1).r;
  vec2 dg = vec2(texture2D(noiseTex, q1 + vec2(0.003, 0.0)).r - d0, texture2D(noiseTex, q1 + vec2(0.0, 0.003)).r - d0);
  vec2 q2 = vW.xz * 0.045 + vec2(0.4, 0.2);
  float r0 = texture2D(noiseTex, q2).g;
  vec2 rg = vec2(texture2D(noiseTex, q2 + vec2(0.004, 0.0)).g - r0, texture2D(noiseTex, q2 + vec2(0.0, 0.004)).g - r0);
  float sculpt = (1.0 - groomed * 0.7) * (1.0 - rock);
  float nearD = 1.0 - smoothstep(80.0, 500.0, dist);
  // Deep band follows the landform (+ a hint of the drifts) so small bumps never punch indigo holes.
  tFacing = dot(normalize(N - vec3(dg.x, 0.0, dg.y) * uMicro.z * sculpt * 0.3), uSunDir);
  N = normalize(N - vec3(dg.x, 0.0, dg.y) * uMicro.z * sculpt - vec3(rg.x, 0.0, rg.y) * 3.5 * nearD * sculpt);

  // Persistent carved tracks: a groove in the normal + occlusion inside the cut.
  float tr = trackAt(vW.xz);
  float trx = trackAt(vW.xz + vec2(0.06, 0.0)) - trackAt(vW.xz - vec2(0.06, 0.0));
  float trz = trackAt(vW.xz + vec2(0.0, 0.06)) - trackAt(vW.xz - vec2(0.0, 0.06));
  N = normalize(N + vec3(trx, 0.0, trz) * 2.2);

  // High-frequency snow-pack micro normals → micro-shadows that read at speed.
  float microFade = 1.0 - smoothstep(uMicro.y * 0.35, uMicro.y, dist);
  vec3 mN = microN(vW.xz) * uSnowParams.w * microFade * (1.0 - groomed * 0.55) * (1.0 - rock);
  vec3 Nm = normalize(N + mN);
  tMicro = dot(Nm, uSunDir) - dot(N, uSunDir);

  // Groomed corduroy: fine fall-line ribs, read as micro-shadow lines up close.
  vec2 fall = normalize(N.xz + vec2(1e-4));
  float u = dot(vW.xz, vec2(-fall.y, fall.x));
  float ribs = smoothstep(0.38, 0.5, abs(fract(u / 0.55) - 0.5)) * groomed * (1.0 - smoothstep(10.0, 45.0, dist));
  tMicro -= ribs * 0.09;

  diffuseColor.rgb = mix(vec3(1.0), rockCol, rock);
  tN = N;
  tRock = rock;
  tTrack = tr;

  // Vector-art sparkle: tiny crisp glints on lit snow that twinkle as the camera moves.
  vec3 cell = floor(vW * 9.0);
  vec3 vq = floor(normalize(vW - cameraPosition) * 14.0);
  vec3 fr = fract(vW * 9.0) - 0.5;
  float star = max(1.0 - length(fr.xz) * 9.0, 0.0)
             + max(1.0 - abs(fr.x) * 30.0, 0.0) * max(1.0 - abs(fr.z) * 4.0, 0.0) * 0.6
             + max(1.0 - abs(fr.z) * 30.0, 0.0) * max(1.0 - abs(fr.x) * 4.0, 0.0) * 0.6;
  float glint = step(0.975, hash13(cell)) * step(0.55, hash13(cell + vq * 7.13)) * clamp(star, 0.0, 1.0)
              * (1.0 - smoothstep(18.0, 70.0, dist)) * (1.0 - rock) * (1.0 - tr);
  toonSparkle = glint * sparkle * sunMaskAt(vW).r * max(dot(N, uSunDir) + 0.2, 0.0);
}
`;

/** Far backdrop (30 km): snow / dark pine forest / rock by slope and altitude. */
export const FAR_SNOW_FRAG_GLSL = /* glsl */`
{
  vec3 N = normalize(vWN);
  float m = texture2D(noiseTex, vW.xz * 0.0004).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.003 + 0.5).r;
  float slope = 1.0 - N.y;
  float rock = smoothstep(0.3, 0.44, slope + (m2 - 0.5) * 0.2);
  float forest = (1.0 - smoothstep(1950.0, 2250.0, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * smoothstep(0.03, 0.12, slope);
  diffuseColor.rgb = mix(mix(vec3(1.0), vec3(0.06, 0.2, 0.22), forest * 0.85), uRockCol, rock);
  tRock = max(rock, forest);
  tFacing = dot(N, uSunDir);
}
`;

/**
 * Hard three-band snow shading (replaces the generic toon band). Inputs from the toon material:
 * `direct` (normalized direct light incl. shadow maps + baked mountain shadows), `skyVis` (baked
 * terrain AO) and the view-space `normal`. Writes `band`.
 */
export const SNOW_BAND_GLSL = /* glsl */`
{
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = dot(normal, sunV);                         // raw facing, no shadows
  float v = direct + tMicro * 0.35;                      // light reaching the snow, with micro-shadows
  float aa = fwidth(v) * 0.75 + 0.002;
  float isLit = smoothstep(uSnowParams.x - aa, uSnowParams.x + aa, v);
  float f = (tFacing < 1.5 ? tFacing : ndl) + tMicro * 0.25;
  float fa = fwidth(f) * 0.75 + 0.002;
  float facingAway = smoothstep(uSnowParams.y + fa, uSnowParams.y - fa, f);
  float occ = skyVis - tTrack * 0.45;                    // baked terrain AO + the carved track cut
  float crevice = smoothstep(uSnowParams.z + 0.03, uSnowParams.z - 0.03, occ);
  float deepness = max(facingAway, crevice) * (1.0 - isLit);
  vec3 snowBand = mix(mix(uSnowMid, uSnowLit, isLit), uSnowDeep, deepness);
  vec3 rockBand = mix(mix(uRockMidTint, uRockLitTint, isLit), uRockDeepTint, deepness);
  band = mix(snowBand, rockBand, tRock);
}
`;

// ------------------------------------------------------------------ FOG (aerial + valley mist)
/** fog_pars_fragment: helpers for the analytic linear-ramp height mist. */
export function fogParsFragmentGLSL() {
  const H = ATMOSPHERE.mistTop - ATMOSPHERE.mistBottom;
  return /* glsl */`#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform vec3 fogColor;
  uniform float fogDensity;
  // Mist density profile: 0 above mistTop, ramps linearly to 1 at mistBottom. G = its integral.
  float mistP(float y) { return clamp((${ATMOSPHERE.mistTop.toFixed(1)} - y) / ${H.toFixed(1)}, 0.0, 1.0); }
  float mistG(float y) {
    float t = ${ATMOSPHERE.mistTop.toFixed(1)} - y;
    if (t <= 0.0) return 0.0;
    if (t < ${H.toFixed(1)}) return -t * t / ${(2 * H).toFixed(1)};
    return -${(H / 2).toFixed(1)} - (t - ${H.toFixed(1)});
  }
#endif
`;
}

/** fog_fragment: lavender aerial perspective, then teal/indigo mist pooled in the valleys. */
export function fogFragmentGLSL(sunDir) {
  return /* glsl */`#ifdef USE_FOG
  {
    vec3 fdir = vFogWorld - cameraPosition;
    float fdist = length(fdir);
    fdir /= max(fdist, 1e-3);
    float sunAmt = pow(max(dot(fdir, ${glslVec(sunDir)}), 0.0), 6.0);
    // Aerial perspective: distant ranges cool off into lavender, warmer toward the sun.
    float aerial = min(1.0 - exp(-fdist * fogDensity), ${ATMOSPHERE.aerialMax.toFixed(2)});
    vec3 aCol = mix(fogColor, ${glslColor(ATMOSPHERE.sunGlow)}, sunAmt * 0.55);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, aCol, aerial);
    // Valley mist: exact path integral through the height ramp between the camera and the fragment.
    float yc = cameraPosition.y, yf = vFogWorld.y;
    float avg = abs(yf - yc) > 0.5 ? (mistG(yf) - mistG(yc)) / (yf - yc) : mistP(yc);
    float mAmt = (1.0 - exp(-fdist * avg * ${ATMOSPHERE.mistDensity.toFixed(6)})) * ${ATMOSPHERE.mistMaxOpacity.toFixed(2)};
    vec3 mCol = mix(${glslColor(ATMOSPHERE.mistDeepColor)}, ${glslColor(ATMOSPHERE.mistColor)}, smoothstep(${ATMOSPHERE.mistBottom.toFixed(1)}, ${ATMOSPHERE.mistTop.toFixed(1)}, yf + 150.0));
    mCol = mix(mCol, ${glslColor(ATMOSPHERE.sunGlow)}, sunAmt * 0.18);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mCol, mAmt);
  }
#endif
`;
}

// ------------------------------------------------------------------ SKY (twilight + layered ranges)
export function skyUniforms(sunDir, cloudsTex) {
  return {
    sunDir: { value: sunDir.clone() },
    zenith: { value: col(ATMOSPHERE.skyZenith) },
    mid: { value: col(ATMOSPHERE.skyMid) },
    horizon: { value: col(ATMOSPHERE.skyHorizon) },
    glow: { value: col(ATMOSPHERE.sunGlow) },
    mistCol: { value: col(ATMOSPHERE.mistDeepColor) },
    cloudShade: { value: col(ATMOSPHERE.cloudShade) },
    cloudLit: { value: col(ATMOSPHERE.cloudLit) },
    ridge0: { value: col(ATMOSPHERE.ridgeColors[0]) },
    ridge1: { value: col(ATMOSPHERE.ridgeColors[1]) },
    ridge2: { value: col(ATMOSPHERE.ridgeColors[2]) },
    ridge3: { value: col(ATMOSPHERE.ridgeColors[3]) },
    ridgeGlow: { value: col(ATMOSPHERE.ridgeGlow) },
    clouds: { value: cloudsTex },
    time: { value: 0 },
  };
}

export const SKY_VERT_GLSL = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAG_GLSL = /* glsl */`
varying vec3 vDir;
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; uniform vec3 mistCol;
uniform vec3 cloudShade; uniform vec3 cloudLit;
uniform vec3 ridge0; uniform vec3 ridge1; uniform vec3 ridge2; uniform vec3 ridge3; uniform vec3 ridgeGlow;
uniform sampler2D clouds; uniform float time;
const float TAU = 6.2831853;
float hh(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453); }

// One layer of low-poly peaks wrapping the horizon: a sharp peak at a random spot in every cell,
// valleys at the cell edges, a skewed facet ridge splitting each peak into a sunlit and a shaded
// face, and a snow cap. Returns colIn where the sky shows above the layer.
vec3 layer(vec3 colIn, vec3 lc, float elev, float u, float sunU, float cells, float seed, float base, float amp, float haze, float sunSide) {
  float x = u * cells;
  float i = floor(x), f = fract(x);
  float ci = mod(i, cells);
  float v0 = hh(ci + seed) * 0.35, v1 = hh(mod(i + 1.0, cells) + seed) * 0.35;
  float pk = 0.45 + 0.55 * hh(ci + seed + 71.0);
  float pf = 0.3 + 0.4 * hh(ci + seed + 13.0);
  float hN = f < pf ? mix(v0, pk, f / pf) : mix(pk, v1, (f - pf) / (1.0 - pf));
  float hgt = base + amp * hN;
  if (elev > hgt) return colIn;
  float depth = (base + amp * pk - elev) / amp;                 // 0 at the summit
  float ridgeF = pf + (hh(ci + seed + 29.0) - 0.5) * 0.6 * clamp(depth, 0.0, 1.0);
  float leftFace = step(f, ridgeF);
  float du = sin((sunU - u) * TAU);
  float lit = du < 0.0 ? leftFace : 1.0 - leftFace;
  vec3 c = mix(lc * 0.74, mix(lc, ridgeGlow, 0.28 * sunSide + 0.06), lit);
  float cap = step(depth, 0.2 + 0.1 * hh(ci + seed + 5.0)) * step(0.55, pk);
  vec3 snowC = mix(mix(lc, vec3(0.86, 0.85, 0.98), 0.55), mix(vec3(1.0, 0.93, 0.85), ridgeGlow, 0.35 * sunSide), lit);
  c = mix(c, snowC, cap * 0.85);
  float rim = smoothstep(hgt - 0.004, hgt - 0.0003, elev) * (0.2 + 0.8 * sunSide) * lit;
  c = mix(c, ridgeGlow, rim * 0.6);
  c = mix(c, horizon, haze * (1.0 - smoothstep(base - 0.03, hgt, elev)));
  return c;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float elev = asin(clamp(h, -1.0, 1.0));
  float u = atan(dir.z, dir.x) / TAU + 0.5;
  float sunU = atan(sunDir.z, sunDir.x) / TAU + 0.5;
  float cs = dot(dir, sunDir);
  float sunSide = pow(max(dot(normalize(dir.xz + 1e-5), normalize(sunDir.xz)), 0.0), 2.0);

  // Twilight gradient: deep indigo overhead → purple → golden sunrise band at the horizon.
  float t = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, t));
  col = mix(col, zenith, smoothstep(0.18, 0.75, t));
  col = mix(col, glow, pow(max(cs, 0.0), 4.0) * 0.55 * (1.0 - smoothstep(0.0, 0.5, t)));

  // Sun: crisp disk + layered halo (the disk blooms in post).
  float disk = smoothstep(0.9993, 0.9996, cs);
  float halo = pow(max(cs, 0.0), 260.0) * 1.1 + pow(max(cs, 0.0), 30.0) * 0.3;
  col += glow * (disk * 6.0 + halo);

  // Cel clouds: two tones, lit edge toward the sun.
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.18) * 0.16 + vec2(time * 0.0012, time * 0.0004);
    float n = texture2D(clouds, uv).r * 0.65 + texture2D(clouds, uv * 2.7 + 0.31).g * 0.35;
    float edge = smoothstep(0.02, 0.25, h);
    float c1 = smoothstep(0.62, 0.635, n) * edge;
    float c2 = smoothstep(0.71, 0.725, n) * edge;
    col = mix(col, mix(cloudShade, cloudShade * 1.25 + glow * 0.15, sunSide), c1 * 0.92);
    col = mix(col, mix(cloudShade * 1.6, cloudLit, 0.5 + 0.5 * sunSide), c2 * 0.95);
  }

  // Layered low-poly ranges, far → near, each darker and more saturated.
  col = layer(col, ridge0, elev, u, sunU, 46.0, 3.0, 0.02, 0.11, 0.5, sunSide);
  col = layer(col, ridge1, elev, u, sunU, 34.0, 17.0, 0.008, 0.1, 0.32, sunSide);
  col = layer(col, ridge2, elev, u, sunU, 25.0, 29.0, -0.006, 0.09, 0.18, sunSide);
  col = layer(col, ridge3, elev, u, sunU, 18.0, 41.0, -0.02, 0.08, 0.08, sunSide);
  // Below everything: the valley mist.
  col = mix(col, mistCol, smoothstep(-0.02, -0.12, h));
  gl_FragColor = vec4(col, 1.0);
}
`;
