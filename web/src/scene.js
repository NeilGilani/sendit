// =====================================================================================
// SENDIT — SCENE FILE (look tunables)
// The look of the mountain is tuned here: the high-altitude sun + sky (physically based, linear
// HDR, see gfx/atmosphere.js), the snow and rock material (gfx/snow.js), aerial perspective and
// valley haze, falling snow, carving spray (gfx/spray.js), conifers (gfx/trees.js), every
// environment spawning parameter and the jump / roller / pillow layout and the hand-built course.
// Look target: real alpine daylight in the spirit of Steep — white (never clipped) snow with blue
// sky-lit shade, a cyan subsurface edge, crisp glints, grey rock bands with snow on every ledge,
// near-black snow-loaded spruce, deep blue zenith and layered blue-white haze in the distance.
// =====================================================================================
import * as THREE from 'three';

// ------------------------------------------------------------------ LIGHTING (linear HDR)
export const LIGHTING = {
  sunElevation: 40,              // degrees — long readable shadows, every lump has a lit and a shaded side
  sunBearing: 163,               // degrees from north — SSE: keeps ~85 % of the gully floor sunlit, light from behind-left
  sunWhiten: 0.45,               // pull the transmitted sun colour toward white
  sunBoost: 1.0,                 // multipliers on the colours derived from the atmosphere model
  skyBoost: 1.0,                 // single scattering underestimates the sky; artistic lift
  terrainBounce: 0.3,           // share of the shade light that comes from sunlit slopes around
  groundBoost: 0.85,             // snow bounce light from below
  lightWrap: 0.06,               // non-snow materials: almost plain Lambert
  aoFloor: 0.45,                 // baked terrain sky-visibility: how dark fully occluded spots get
  rimScale: 0.18,                // scales the old stylized Fresnel rim (rider / props) way down
  hemiIntensity: 0.6,            // three.js hemisphere fill for non-custom materials
  shadowBias: -0.0004,
  shadowNormalBias: 0.45,
  shadowRadius: 2,               // shadow edge softness (PCF soft)
  // Legacy names kept for other modules that read them.
  sunColor: '#fff6ea',
  sunIntensity: 3.0,
  skyAmbient: '#a9bbd8',
  groundAmbient: '#b8bcc6',
  exposure: 1.0,
};

// Debug: ?sun=bearing,elevation overrides the sun (degrees).
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search).get('sun');
  if (q) { const [b, e] = q.split(',').map(Number); if (Number.isFinite(b)) LIGHTING.sunBearing = b; if (Number.isFinite(e)) LIGHTING.sunElevation = e; }
}

// ------------------------------------------------------------------ SNOW material (gfx/snow.js)
export const SNOW = {
  albedo: '#f3f6fb',             // fresh powder (sRGB; ≈ 0.90 linear, faint cool tint)
  albedoPacked: '#e4e9f0',       // wind-packed / groomed / tracked snow
  subsurface: '#5fb4ff',         // light leaking through near the terminator
  subsurfaceStrength: 0.55,
  wrap: 0.22,                    // soft terminator (light diffusing through the snow)
  roughness: 0.62,               // GGX sheen roughness (tighter on glazed crust)
  specular: 0.9,
  forwardScatter: 1.6,           // grazing glow when looking toward the sun
  sparkle: 26,                   // HDR glint brightness (blooms)
  sparkleDensity: 0.9,           // share of grid cells holding a facet
  sparkleCone: 0.45,             // up-bias of the random facet normals (0 = isotropic, larger = flatter)
  windAngle: 0.65,               // radians: prevailing wind direction in xz (ripples / sastrugi)
  drift: 1.0,                    // soft drifts / pillows
  ripple: 1.0,                   // wind ripples (cm scale)
  sastrugi: 1.0,                 // wind-carved ridges on exposed snow
  corduroy: 1.0,                 // groomed pistes
  trackDepth: 0.26,              // metres: deepest powder trench
  trackLip: 0.55,                // pushed-up snow beside a trench
  trackDark: 0.45,               // cavity darkening at the bottom of deep trenches
  forest: '#1b2620',             // far forest tone
};

// ------------------------------------------------------------------ ROCK (gfx/snow.js + scatter boulders)
export const ROCK = {
  dark: '#4a4744',               // gneiss / granite (sRGB)
  light: '#8a8580',
  rust: '#7a5a3c',               // iron staining streaks
  strataScale: 6.0,              // metres between ledge bands on cliffs
  ledgeSnow: 0.1,                // more → more snow sitting on ledges
  exposeSlope: 0.4,              // 1 − n.y where snow starts to slide off (≈ 53°)
  exposeSoft: 0.08,
};

// ------------------------------------------------------------------ ATMOSPHERE (gfx/atmosphere.js)
export const ATMOSPHERE = {
  // Single-scattering sky model (seen from the resort's altitude).
  viewAltitude: 2700,
  rayleigh: [5.8e-6, 13.5e-6, 33.1e-6],
  rayleighHeight: 8000,
  mie: 5e-6,                     // clean alpine air (sea level haze ≈ 2e-5)
  mieHeight: 1200,
  mieG: 0.78,
  sunIntensity: 20,
  skyScale: 0.33,               // radiance scale into the game's HDR units
  groundAlbedo: [0.78, 0.8, 0.84],
  horizonWhiten: 0.85,           // milky horizon (multiple scattering stand-in)
  horizonGain: 0.7,              // brighter milky band just above the horizon
  multiScatter: 0.08,
  zenithGain: 4.0,
  zenithSat: 0.25,
  // Aerial perspective (fog chunk): per-channel extinction through two exponential layers.
  aerialColor: '#ffffff',        // runtime tint on the inscatter colour (scene.fog.color)
  aerialDensity: 1.0,            // scene.fog.density = multiplier on the extinction below
  airExtinction: [3.9e-5, 4.7e-5, 5.9e-5],
  airHeight: 8000,
  hazeExtinction: 3.0e-5,
  hazeHeight: 1100,
  hazeBase: 2400,                // altitude where the haze layer has the density above
  hazeSunGlow: 0.05,             // forward-scattering glow of the haze toward the sun
  aerialMax: 0.96,
  // Valley haze pooled below mistTop.
  mistTop: 1950,
  mistBottom: 1350,
  mistDensity: 1 / 900,
  mistMaxOpacity: 0.8,
  mistDeep: 1.12,                // haze colour multipliers (of the horizon sky)
  mistLight: 1.25,
  // Sky dome clouds.
  cloudCover: 0.42,
  cirrus: 0.55,
  mistColor: '#e6ecf3',          // legacy (features.js fog pockets)
  mistDeepColor: '#cfd9e7',
};

// ------------------------------------------------------------------ CORNICES & WIND LIPS (gfx/cornices.js)
export const CORNICES = {
  step: 6,                       // metres between crest probes
  max: 700,
  minDrop: 5.5,                  // metres the snow must fall away within 9 m downwind
  runClear: 18,                  // keep the run itself clean
  spacing: 8,
  length: [8, 16],               // metres along the crest
  overhang: [1.2, 4.5],          // metres past the crest (small = wind lip, big = cornice)
  thickness: [0.8, 2.6],
};

// ------------------------------------------------------------------ DISTANT RANGES (terrain.js buildRing)
export const RING = {
  inner: 12000,                  // metres from the centre where the ring starts (beyond the backdrop)
  depth: 23000,
  maxRadius: 37500,              // keep inside the camera far plane
  segments: 512,
  rings: 44,
  scale: 7000,                   // metres per ridged-noise unit (peak spacing)
  base: 500,                     // metres above the backdrop rim
  height: 2300,                  // metres of peak relief
};

// ------------------------------------------------------------------ DIAMOND DUST (clear-sky ice crystals)
// On a clear cold day there is no snowfall, but tiny ice crystals drift in the air and flash when
// they mirror the sun (strongest looking toward the sun). Kept sparse and subtle.
export const SNOWFALL = {
  count: 1400,
  box: 50,                       // metres — cube of crystals that follows the camera
  fallSpeed: 0.25,               // m/s
  wind: [0.9, 0.35],             // m/s drift (x, z)
  size: 0.02,                    // metres
  opacity: 0.35,                 // base visibility (they are mostly invisible until they glint)
  glint: 14,                     // HDR flash brightness
};

// ------------------------------------------------------------------ SNOW SPRAY (gfx/spray.js)
export const SPRAY = {
  maxParticles: 9000,
  sheetRate: 900,                // rooster-tail streaks / s per contact at full intensity
  sheetLife: 0.7,
  sheetAlpha: 0.42,
  chunkRate: 140,                // clumps / chips per s
  glintRate: 160,                // glittering crystals per s
  mistRate: 45,                  // powder-cloud puffs per s per contact
  mistLife: 2.6,
  mistAlpha: 0.17,
  inherit: 0.55,                 // share of the contact's velocity the snow keeps
  sluffRate: 110,                // loose snow released per s on steep powder (slides downhill)
  stopBurst: 260,                // particles in a hard-stop fan
  forwardG: 0.45,                // Henyey-Greenstein g: backlit spray glows
  forwardMix: 0.5,
  albedo: 0.92,
  wind: [0.9, 0.35],             // m/s drift of lingering powder
};

// ------------------------------------------------------------------ CONIFERS (gfx/trees.js)
export const TREES = {
  height: 11,                    // metres at scale 1
  needle: '#29402f',             // spruce needles (sRGB; ≈ 0.05 linear albedo)
  needle2: '#34452c',            // olive-ish variation (fir)
  bark: '#4a3b30',
  snow: '#eef3fa',
  snowLoad: 0.85,                // 0 bare … 1 heavily loaded branches (varies per tree)
  firShare: 0.3,                 // share of rounder firs among the spruce
  nearRadius: 85,                // metres: full frond trees
  midRadius: 420,                // metres: simplified fronds; beyond = far cone shells
  nearMax: 900,
  midMax: 9000,
  rebuildStep: 10,               // metres the camera moves before the near pools are refilled
  wellRadius: 1.5,               // tree-well radius per unit tree scale
};

// ------------------------------------------------------------------ CHARACTER OUTLINE
export const OUTLINE = {
  px: 0.0,                       // realistic look: no outline (rider.js may still build the hull)
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
  rockClusterChance: 0.14,
  rockMinSlope: 14,
  rockMaxSlope: 55,
  rockPerCluster: [2, 6],
  rockScale: [0.6, 2.8],
  rockColors: ['#5c5853', '#6f6a63', '#4b4844'],   // grey granite boulders
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

export function sunDirection() {
  const b = THREE.MathUtils.degToRad(LIGHTING.sunBearing);
  const e = THREE.MathUtils.degToRad(LIGHTING.sunElevation);
  return new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).normalize();
}

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
    uSunDir: { value: sunDirection() }, uGlint: { value: S.glint },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform vec3 uCam; uniform float uTime; uniform float uBox; uniform float uFall; uniform vec2 uWind;
      uniform float uSize; uniform float uPx; uniform vec3 uSunDir;
      varying float vA; varying float vFlash;
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
        gl_PointSize = clamp(uSize * (0.6 + aSeed * 0.8) * uPx / max(d, 0.1), 1.0, 6.0);
        // A tumbling flat crystal flashes when its facet mirrors the sun into the eye.
        vec3 V = normalize(p - cameraPosition);
        float fwd = pow(max(dot(V, uSunDir), 0.0), 3.0);
        float tumble = pow(max(sin(uTime * (1.3 + aSeed * 2.7) + aSeed * 61.0), 0.0), 24.0);
        vFlash = tumble * (0.25 + 1.6 * fwd);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; uniform float uGlint; varying float vA; varying float vFlash;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.1, length(q)) * vA * uOpacity * (0.25 + vFlash);
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(1.0, 0.99, 0.96) * (1.5 + uGlint * vFlash), a);
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
