// =====================================================================================
// SENDIT — SCENE FILE
// The whole look of the mountain lives here: the soft daylight lighting rig, the powder-snow
// terrain GLSL, the hazy sky with layered ranges, aerial + valley haze, falling snow, the rider
// outline, every environment spawning parameter and the jump / roller / pillow layout.
// Look target: soft stylized daylight — bright powdery snow, cool blue shade with a subsurface
// glow, warm brown rock, fluffy dark pines, white haze swallowing the distance.
// =====================================================================================
import * as THREE from 'three';

// ------------------------------------------------------------------ LIGHTING
export const LIGHTING = {
  sunElevation: 40,              // degrees — every lump has a lit and a shaded side
  sunBearing: 230,              // degrees from north — side light across the north-running gully
  sunColor: '#fff6ea',           // warm white
  sunIntensity: 3.0,             // three.js light intensity (only the shadow ratio is used by snow)
  sunStrength: 1.2,              // shader sun strength (linear, before the soft exposure curve)
  skyAmbient: '#a9bbd8',         // cool sky fill (gives the blue shade)
  groundAmbient: '#b8bcc6',      // bright snow bounce from below
  lightWrap: 0.3,                // soft wrap-around diffuse
  aoFloor: 0.55,                 // baked terrain AO: how dark fully occluded spots get
  exposure: 1.35,                // soft highlight roll-off: col = 1 - exp(-col * exposure)
  hemiIntensity: 0.6,            // three.js hemisphere fill for non-custom materials
  shadowBias: -0.0004,
  shadowNormalBias: 0.45,
  shadowRadius: 3,               // soft shadow edges
};

// ------------------------------------------------------------------ SNOW (soft powder)
export const SNOW = {
  // Clean, smooth "clay" snow: shape comes from geometry only — no grain, no noise textures.
  albedo: 0.95,
  shade: '#b6cff6',              // clean light-blue shade (sky fill on snow)
  shadeStrength: 1.0,
  subsurface: '#79b4ff',         // cyan glow where sunlight fades into shadow
  subsurfaceStrength: 0.4, 
  wrap: 0.2,                     // light scattering through the snow (soft terminator)
  specular: 0.16,                // soft satin highlight
  specularPower: 22,
  sheen: 0.14,                   // bright grazing-angle sheen
  driftStrength: 10,             // very soft, very broad wind sculpting
  trackDepth: 6.0,               // carved trenches: how hard the groove bends the light
  trackShade: 0.5,               // how much the inside of a trench falls into shade
  sparkle: 0.8,                  // rare tiny glints
  rock: '#6e4634',               // warm brown rock
  rockLight: '#8c5c40',
  forest: '#22413a',             // far forest tone
};

// ------------------------------------------------------------------ ATMOSPHERE
export const ATMOSPHERE = {
  skyZenith: '#5f94d6',
  skyMid: '#a9c4e6',
  skyHorizon: '#eef2f6',
  sunGlow: '#fff3df',
  cloudShade: '#c9d3e1',
  cloudLit: '#ffffff',
  aerialColor: '#dfe6ef',        // white-blue haze
  aerialDensity: 0.00007,
  aerialMax: 0.93,
  mistColor: '#e6ecf3',          // soft valley haze
  mistDeepColor: '#cfd9e7',
  mistTop: 1950,
  mistBottom: 1350,
  mistDensity: 1 / 650,
  mistMaxOpacity: 0.85,
  ridgeColors: ['#dfe6f0', '#cfd9e8', '#bfcde0', '#b0c0d8'],   // hazy horizon ranges, far → near
  ridgeGlow: '#fff8ee',
};

// ------------------------------------------------------------------ FALLING SNOW
export const SNOWFALL = {
  count: 3500,
  box: 60,                       // metres — cube of flakes that follows the camera
  fallSpeed: 1.1,                // m/s
  wind: [0.7, 0.25],             // m/s drift (x, z)
  size: 0.055,                   // metres
  opacity: 0.85,
};

// ------------------------------------------------------------------ CHARACTER OUTLINE
export const OUTLINE = {
  px: 1.0,                       // subtle screen-space line (CSS px)
  color: '#1c2238',
};

// ------------------------------------------------------------------ ENVIRONMENT SPAWNING
export const SPAWN = {
  region: 1100,                  // metres around the opening run that get the dense hand-placed look
  runLength: 2600,
  treeStep: 7.0,
  treeMaxAltitude: 3450,
  treeThinFrom: 3150,
  treeMaxSlope: 34,
  treeClusterScale: 0.0075,
  treeClusterThreshold: 0.4,
  treeDensity: 0.72,
  treeMax: 24000,
  treeScale: [0.55, 1.35],
  runCorridor: 15,
  pisteClear: 0.3,
  rockClusterStep: 22,
  rockClusterChance: 0.3,
  rockMinSlope: 14,
  rockMaxSlope: 55,
  rockPerCluster: [3, 8],
  rockScale: [0.6, 2.8],
  rockColors: ['#6e3f2a', '#8a5236', '#5a3324'],   // warm brown / rust boulders
  iceShardsPerCluster: [0, 0],
  iceTint: '#bfe6ff',
  fenceOffset: 16,
  fenceFrom: 0,
  fenceTo: 0,   
  fenceSpacing: 2.6,
  fenceHeight: 1.15,
  ridgeFenceStep: 34,
  ridgeFenceProminence: 1.6,
  ridgeFenceMax: 24,
  ridgeFencePosts: 7,
  woodColor: '#6b4428',
  pineGreens: ['#0f2e27', '#143a30'],
};

// ------------------------------------------------------------------ JUMPS, ROLLERS, PILLOWS
// Laid out along the opening run. Rollers and pillows are baked into the height field (so the
// physics and the rendered snow agree); kickers are separate shaped ramps with a crisp lip.
export const JUMPS = {
  startAt: 70,                   // metres down the run
  endAt: 2500,
  spacing: [30, 52],             // metres between features
  weights: { kicker: 0.38, roller: 0.32, pillows: 0.3 },
  kickers: [
    { L: 6, H: 1.3, W: 5, name: 'S' },
    { L: 8.5, H: 2.2, W: 6, name: 'M' },
    { L: 11, H: 3.2, W: 7, name: 'L' },
  ],
  kickerLateral: 7,              // metres either side of the run centreline
  rollerHeight: [1.2, 2.3],
  rollerSigma: [4.5, 7.5],       // metres along the run (gaussian)
  rollerHalfWidth: 18,
  pillowRadius: [5, 9],
  pillowHeight: [1.0, 2.6],
  pillowsPerGroup: [2, 5],
  pillowOffset: [4, 15],
  freePillows: 260,              // extra pillows scattered off-piste around the run
  freePillowRegion: 420,
};

// ------------------------------------------------------------------ THE COURSE (hand-built world)
// One height function builds everything: a winding powder gully with rock walls, natural drops
// and berms, a long valley beyond the finish, surrounding peaks and a horn on the horizon.
// t = metres down the fall line (world z decreases as t grows; the run heads toward -z).
export const COURSE = {
  tileSize: 2560,                // metres — high-res playable tile
  tileRes: 2049,                 // samples per side (1.25 m spacing)
  farSize: 30000,                // metres — low-res backdrop
  farRes: 512,
  startZ: 1190,                  // world z of the start gate
  topElevation: 2650,            // metres at the start
  finishT: 2330,                 // run complete here (metres down the fall line)
  // Fall-line gradient profile: [length m, gradient deg] from the start. Flats before steeps =
  // natural kickers; the drops below sit at the top of steep pitches so landings are smooth.
  profile: [[60, 10], [200, 15], [170, 9], [220, 20], [120, 11], [240, 18], [150, 8], [250, 22],
    [150, 10], [300, 17], [150, 7], [250, 19], [200, 9], [1500, 10], [3000, 5], [20000, 1]],
  behindGradient: 30,            // degrees — the bowl rising behind the start
  drops: [[430, 3.0], [770, 3.5], [1160, 4.0], [1560, 3.5], [2010, 4.5]],   // [t, height m]
  meander: [[110, 330, 0.3], [40, 140, 1.7], [18, 61, 0.9]],   // [amplitude m, wavelength/2π m, phase]
  floorHalfWidth: [30, 12, 6],   // base ± two wobble amplitudes (metres)
  floorDepth: 3.5,               // the floor is a gentle half-pipe this deep at its edges
  wallHeight: [[30, 22], [40, 30]],   // left / right: [base, variation] metres
  wallWidth: [18, 46],           // metres from wall foot to wall top (steep → cliff, wide → bank)
  bermHeight: 2.6,               // side hits along the floor edges (where they appear)
  lumps: 3.2,                    // metres of soft rolling lumps everywhere
  fineLumps: 0.2,               // keep tiny: the snow should read smooth and clean
  ledges: 9,                     // rock-ledge relief on the walls
  valleySideSlope: 0.4,          // rise per metre beyond the walls
  mountainHeight: 1100,
  horn: { x: -2300, z: -10600, peak: 4450, slope: 1.12, twist: 0.5 },
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

/** Global lighting uniforms consumed by every soft-shaded material (see world.js). */
export function lightingUniforms() {
  return {
    uSunCol: { value: col(LIGHTING.sunColor).multiplyScalar(LIGHTING.sunStrength) },
    uSkyAmb: { value: col(LIGHTING.skyAmbient) },
    uGroundAmb: { value: col(LIGHTING.groundAmbient) },
    uLightWrap: { value: LIGHTING.lightWrap },
    uAOFloor: { value: LIGHTING.aoFloor },
    uExposure: { value: LIGHTING.exposure },
  };
}

/** Scene lighting: one shadow-casting sun + a gentle hemisphere fill. */
export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight(col(LIGHTING.skyAmbient), col(LIGHTING.groundAmbient), LIGHTING.hemiIntensity);
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

/** Tileable normal map (soft dimples + crust grain), generated once. RGB = (x, z, y). Unused by the clean snow look. */
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
  oct(8, 1.0); oct(16, 0.6); oct(32, 0.35); oct(64, 0.18); oct(128, 0.08);
  const data = new Uint8Array(size * size * 4);
  const k = size / 28;
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
export function snowUniforms() {
  return {
    uSnowAlbedo: { value: SNOW.albedo },
    uSnowShade: { value: col(SNOW.shade).multiplyScalar(SNOW.shadeStrength) },
    uSnowSSS: { value: col(SNOW.subsurface).multiplyScalar(SNOW.subsurfaceStrength) },
    uSnowLook: { value: new THREE.Vector4(SNOW.wrap, SNOW.specular, SNOW.specularPower, SNOW.sheen) },
    uRockCol: { value: col(SNOW.rock) },
    uRockLight: { value: col(SNOW.rockLight) },
    uForestCol: { value: col(SNOW.forest) },
    uSnowShape: { value: new THREE.Vector3(SNOW.driftStrength, SNOW.trackDepth, SNOW.trackShade) },
  };
}

/** Declarations for the snow light model (fragment). */
export const SNOW_BAND_PARS = /* glsl */`
uniform float uSnowAlbedo; uniform vec3 uSnowShade; uniform vec3 uSnowSSS; uniform vec4 uSnowLook;
uniform vec3 uRockCol; uniform vec3 uRockLight; uniform vec3 uForestCol;
uniform vec3 uSnowShape;    // x drift strength, y track depth, z track shade
float tRock = 0.0;          // rock / forest coverage (no snow optics there)
float tTrack = 0.0;         // carved trench depth
`;

/** Terrain-only declarations + helpers (fragment). */
export const SNOW_PARS_GLSL = /* glsl */`
uniform sampler2D normalTex; uniform sampler2D splatTex; uniform sampler2D noiseTex;
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
`;

/** Albedo + normals (smooth landform, soft drifts, carved trenches) + glints. After map_fragment. */
export const SNOW_FRAG_GLSL = /* glsl */`
{
  vec2 uv = tUV(vW.xz);
  vec2 nn = texture2D(normalTex, uv).rg * 2.0 - 1.0;
  vec3 N = normalize(vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y));
  vec3 s = texture2D(splatTex, uv).rgb;
  float dist = length(vW - cameraPosition);
  float m2 = texture2D(noiseTex, vW.xz * 0.0093 + 0.37).r;
  float m3 = texture2D(noiseTex, vW.xz * 0.06 + 0.71).g;
  float farF = smoothstep(250.0, 1200.0, dist);

  // Warm brown rock outcrops on the steepest faces; snow clings to every ledge.
  float flatness = smoothstep(0.62, 0.86, N.y + (m3 - 0.5) * 0.12 * (1.0 - farF));
  float rock = clamp(smoothstep(0.3, 0.58, s.g + (m2 - 0.5) * 0.45 * s.g) * (1.0 - flatness * 0.92), 0.0, 1.0);
  float blot = mix(texture2D(noiseTex, vec2(vW.x + vW.y, vW.z - vW.y) * 0.035).r, 0.5, farF);
  float crack = mix(texture2D(noiseTex, vec2(vW.x - vW.y, vW.z + vW.y) * 0.11).b, 0.5, farF);
  vec3 rockCol = mix(uRockCol, uRockLight, smoothstep(0.4, 0.62, blot)) * mix(0.7, 1.08, smoothstep(0.25, 0.6, crack));
  rock *= 1.0 - smoothstep(0.6, 0.68, N.y + (m3 - 0.5) * 0.35 * (1.0 - farF));
  float outcrop = texture2D(noiseTex, vec2(vW.x + vW.y * 0.5, vW.z - vW.y * 0.5) * 0.0045 + 0.3).r;
  rock *= smoothstep(0.5, 0.58, outcrop + (m2 - 0.5) * 0.15);

  // Very broad, very soft wind sculpting (no grain anywhere).
  vec2 q1 = vW.xz * 0.006 + vec2(0.13, 0.7);
  float d0 = texture2D(noiseTex, q1).r;
  vec2 dg = vec2(texture2D(noiseTex, q1 + vec2(0.004, 0.0)).r - d0, texture2D(noiseTex, q1 + vec2(0.0, 0.004)).r - d0);
  N = normalize(N - vec3(dg.x, 0.0, dg.y) * uSnowShape.x * (1.0 - rock));

  // Carved trenches: the walls of the groove catch / lose the light.
  float tr = trackAt(vW.xz);
  float trx = trackAt(vW.xz + vec2(0.08, 0.0)) - trackAt(vW.xz - vec2(0.08, 0.0));
  float trz = trackAt(vW.xz + vec2(0.0, 0.08)) - trackAt(vW.xz - vec2(0.0, 0.08));
  N = normalize(N + vec3(trx, 0.0, trz) * uSnowShape.y);

  diffuseColor.rgb = mix(vec3(uSnowAlbedo), rockCol, rock);
  tN = N;
  tRock = rock;
  tTrack = tr;

  // Rare tiny glints on sunlit snow, twinkling as the camera moves.
  vec3 cell = floor(vW * 12.0);
  vec3 vq = floor(normalize(vW - cameraPosition) * 18.0);
  vec3 fr = fract(vW * 12.0) - 0.5;
  float glint = step(0.985, hash13(cell)) * step(0.55, hash13(cell + vq * 7.13)) * max(1.0 - length(fr) * 5.0, 0.0)
              * (1.0 - smoothstep(10.0, 40.0, dist)) * (1.0 - rock) * (1.0 - tr);
  toonSparkle = glint * sparkle * sunMaskAt(vW).r * max(dot(N, uSunDir), 0.0);
  // Lake surface (Lake Tahoe on the real mountains): deep blue, brighter at grazing angles.
  if (vW.y < uWater + 0.9 && N.y > 0.985) {
    vec3 Vw = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(Vw.y, 0.0), 3.0);
    diffuseColor.rgb = mix(vec3(0.03, 0.17, 0.3), vec3(0.5, 0.66, 0.85), fr);
    tRock = 1.0;
    toonSparkle = 0.0; tTrack = 0.0;
  }
}
`;

/** Far backdrop (30 km): snow / dark forest / rock by slope and altitude. */
export const FAR_SNOW_FRAG_GLSL = /* glsl */`
{
  vec3 N = normalize(vWN);
  float m = texture2D(noiseTex, vW.xz * 0.0004).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.003 + 0.5).r;
  float slope = 1.0 - N.y;
  float rock = smoothstep(0.36, 0.5, slope + (m2 - 0.5) * 0.2);
  float forest = (1.0 - smoothstep(1950.0, 2250.0, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * smoothstep(0.03, 0.12, slope);
  diffuseColor.rgb = mix(mix(vec3(uSnowAlbedo), uForestCol, forest * 0.85), uRockCol, rock);
  tRock = max(rock, forest);
  // Lake surface (Lake Tahoe on the real mountains): deep blue, brighter at grazing angles.
  if (vW.y < uWater + 0.9 && N.y > 0.985) {
    vec3 Vw = normalize(cameraPosition - vW);
    float fr = pow(1.0 - max(Vw.y, 0.0), 3.0);
    diffuseColor.rgb = mix(vec3(0.03, 0.17, 0.3), vec3(0.5, 0.66, 0.85), fr);
    tRock = 1.0;
    
  }
}
`;

/**
 * Snow optics (runs inside world.js's soft-shading block, which provides ndl, shadow, occl, sky,
 * light, sunV and toonAdd). Clean clay-like snow: scattered sun with a soft terminator, a clean
 * light-blue shade, a cyan subsurface glow along shadow edges, satin highlight and grazing sheen.
 */
export const SNOW_BAND_GLSL = /* glsl */`
{
  float snow = 1.0 - tRock;
  float wrapS = mix(uLightWrap, uSnowLook.x, snow);
  float wm = clamp((ndl + wrapS) / (1.0 + wrapS), 0.0, 1.0);
  float trench = 1.0 - tTrack * uSnowShape.z;
  float sunVis = wm * shadow;
  vec3 shadeL = mix(sky, uSnowShade * sqrt(occl), snow) * trench;
  // Subsurface: brightest just inside the shadow edge / terminator, fading into deep shade.
  float edge = (1.0 - sunVis) * (0.35 + 0.65 * smoothstep(0.0, 0.5, wm));
  vec3 sss = uSnowSSS * edge * occl * snow;
  light = uSunCol * sunVis * trench + shadeL + sss;
  // Satin highlight + grazing sheen (added after the exposure curve).
  vec3 Vv = normalize(vViewPosition);
  vec3 Hh = normalize(sunV + Vv);
  float spec = pow(max(dot(normal, Hh), 0.0), uSnowLook.z) * uSnowLook.y * shadow;
  float sheen = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 5.0) * uSnowLook.w;
  toonAdd += (vec3(1.0, 0.97, 0.92) * spec + vec3(0.88, 0.94, 1.0) * sheen * (0.45 + 0.55 * shadow)) * snow;
}
`;

// ------------------------------------------------------------------ FOG (aerial + valley haze)
export function fogParsFragmentGLSL() {
  const H = ATMOSPHERE.mistTop - ATMOSPHERE.mistBottom;
  return /* glsl */`#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform vec3 fogColor;
  uniform float fogDensity;
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

export function fogFragmentGLSL(sunDir) {
  return /* glsl */`#ifdef USE_FOG
  {
    vec3 fdir = vFogWorld - cameraPosition;
    float fdist = length(fdir);
    fdir /= max(fdist, 1e-3);
    float sunAmt = pow(max(dot(fdir, ${glslVec(sunDir)}), 0.0), 6.0);
    // Aerial perspective: the distance dissolves into white-blue haze, warmer toward the sun.
    float aerial = min(1.0 - exp(-fdist * fogDensity), ${ATMOSPHERE.aerialMax.toFixed(2)});
    vec3 aCol = mix(fogColor, ${glslColor(ATMOSPHERE.sunGlow)}, sunAmt * 0.5);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, aCol, aerial);
    // Valley haze pooled below mistTop (exact path integral through a linear height ramp).
    float yc = cameraPosition.y, yf = vFogWorld.y;
    float avg = abs(yf - yc) > 0.5 ? (mistG(yf) - mistG(yc)) / (yf - yc) : mistP(yc);
    float mAmt = (1.0 - exp(-fdist * avg * ${ATMOSPHERE.mistDensity.toFixed(6)})) * ${ATMOSPHERE.mistMaxOpacity.toFixed(2)};
    vec3 mCol = mix(${glslColor(ATMOSPHERE.mistDeepColor)}, ${glslColor(ATMOSPHERE.mistColor)}, smoothstep(${ATMOSPHERE.mistBottom.toFixed(1)}, ${ATMOSPHERE.mistTop.toFixed(1)}, yf + 150.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mCol, mAmt);
  }
#endif
`;
}

// ------------------------------------------------------------------ SKY
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

// One layer of distant peaks wrapping the horizon, softly shaded and dissolving into the haze.
vec3 layer(vec3 colIn, vec3 lc, float elev, float u, float sunU, float cells, float seed, float base, float amp, float haze, float sunSide) {
  float x = u * cells;
  float i = floor(x), f = fract(x);
  float ci = mod(i, cells);
  float v0 = hh(ci + seed) * 0.35, v1 = hh(mod(i + 1.0, cells) + seed) * 0.35;
  float pk = 0.45 + 0.55 * hh(ci + seed + 71.0);
  float pf = 0.3 + 0.4 * hh(ci + seed + 13.0);
  float hN = f < pf ? mix(v0, pk, f / pf) : mix(pk, v1, (f - pf) / (1.0 - pf));
  float hgt = base + amp * hN;
  float edge = fwidth(elev) * 1.5;
  float cover = smoothstep(hgt + edge, hgt - edge, elev);
  if (cover <= 0.0) return colIn;
  float depth = (base + amp * pk - elev) / amp;
  float ridgeF = pf + (hh(ci + seed + 29.0) - 0.5) * 0.6 * clamp(depth, 0.0, 1.0);
  float leftFace = smoothstep(ridgeF + 0.02, ridgeF - 0.02, f);
  float du = sin((sunU - u) * TAU);
  float lit = du < 0.0 ? leftFace : 1.0 - leftFace;
  vec3 c = mix(lc * 0.9, mix(lc * 1.04, ridgeGlow, 0.25 * sunSide), lit);
  c = mix(c, horizon, haze * (1.0 - smoothstep(base - 0.03, hgt, elev)));
  return mix(colIn, c, cover);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float elev = asin(clamp(h, -1.0, 1.0));
  float u = atan(dir.z, dir.x) / TAU + 0.5;
  float sunU = atan(sunDir.z, sunDir.x) / TAU + 0.5;
  float cs = dot(dir, sunDir);
  float sunSide = pow(max(dot(normalize(dir.xz + 1e-5), normalize(sunDir.xz)), 0.0), 2.0);

  // Soft daylight gradient: blue overhead → pale haze at the horizon.
  float t = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, t));
  col = mix(col, zenith, smoothstep(0.2, 0.85, t));
  col = mix(col, glow, pow(max(cs, 0.0), 5.0) * 0.4);

  // Sun: soft disk + wide halo.
  float disk = smoothstep(0.9990, 0.9995, cs);
  float halo = pow(max(cs, 0.0), 300.0) * 0.8 + pow(max(cs, 0.0), 24.0) * 0.18;
  col += glow * (disk * 3.0 + halo);

  // Fluffy soft clouds.
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.2) * 0.14 + vec2(time * 0.001, time * 0.0004);
    float n = texture2D(clouds, uv).r * 0.6 + texture2D(clouds, uv * 2.3 + 0.31).g * 0.3 + texture2D(clouds, uv * 5.1 + 0.7).g * 0.1;
    float cover = smoothstep(0.52, 0.72, n) * smoothstep(0.02, 0.3, h);
    float thick = smoothstep(0.6, 0.85, n);
    vec3 cc = mix(cloudLit, cloudShade, thick * 0.8);
    cc = mix(cc, glow, sunSide * 0.15);
    col = mix(col, cc, cover * 0.85);
  }

  // Distant ranges, far → near, dissolving into the haze.
  col = layer(col, ridge0, elev, u, sunU, 46.0, 3.0, 0.015, 0.09, 0.75, sunSide);
  col = layer(col, ridge1, elev, u, sunU, 34.0, 17.0, 0.004, 0.08, 0.6, sunSide);
  col = layer(col, ridge2, elev, u, sunU, 25.0, 29.0, -0.008, 0.07, 0.45, sunSide);
  col = layer(col, ridge3, elev, u, sunU, 18.0, 41.0, -0.02, 0.06, 0.3, sunSide);
  col = mix(col, mistCol, smoothstep(-0.02, -0.12, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ FALLING SNOW
/** A cube of gently falling flakes that wraps around the camera. Call update(camera, time) per frame. */
export function createSnowfall() {
  const S = SNOWFALL;
  const pos = new Float32Array(S.count * 3);
  const seed = new Float32Array(S.count);
  let r = 1234567;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < S.count; i++) { pos[i * 3] = rnd(); pos[i * 3 + 1] = rnd(); pos[i * 3 + 2] = rnd(); seed[i] = rnd(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: S.box },
    uFall: { value: S.fallSpeed }, uWind: { value: new THREE.Vector2(...S.wind) },
    uSize: { value: S.size }, uPx: { value: 600 }, uOpacity: { value: S.opacity },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform vec3 uCam; uniform float uTime; uniform float uBox; uniform float uFall; uniform vec2 uWind;
      uniform float uSize; uniform float uPx;
      varying float vA;
      void main() {
        float sp = 0.7 + aSeed * 0.6;
        vec3 p = position * uBox;
        p.y -= uTime * uFall * sp;
        p.xz += uWind * uTime + vec2(sin(uTime * 0.9 + aSeed * 40.0), cos(uTime * 0.7 + aSeed * 23.0)) * 0.5;
        vec3 o = uCam - uBox * 0.5;
        p = mod(p - o, uBox) + o;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vA = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d));
        gl_PointSize = clamp(uSize * (0.6 + aSeed * 0.8) * uPx / max(d, 0.1), 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.15, length(q)) * vA * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.name = 'Snowfall';
  return {
    points,
    update(camera, time, viewportHeight) {
      uniforms.uCam.value.copy(camera.position);
      uniforms.uTime.value = time;
      uniforms.uPx.value = viewportHeight * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    },
  };
}
