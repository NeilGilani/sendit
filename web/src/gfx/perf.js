// Performance tunables in one place: every GPU-cost knob, per quality level [low, medium, high].
// Visual tunables stay in scene.js (look) and gfx/post.js POST (grade). Measured with
// web/scripts/gfxperf.mjs (GPU / CPU ms per frame) and gfxgpu.mjs (GPU ms per pass / draw); the
// numbers and the reasoning behind each value are in docs/graphics-perf.md.
// Default quality is 1 (state.js), so medium is what most players see: it is tuned to ~60 fps at
// 1600×900 on an integrated laptop GPU (Intel Arc 130V). High is the full look.
export const PERF = {
  // Render resolution = CSS pixels × min(devicePixelRatio, cap) × scale. Medium never renders above
  // CSS resolution: on a 150 % laptop screen that is 2.25× fewer pixels than the old 1.5 cap.
  // High renders at CSS resolution too (was cap 2, then 1.5): on a 2× laptop screen every 0.5 of cap is
  // ~2× the pixels, and High's look comes from AO, shadows and terrain detail, not from pixel count
  // (night-3 M1 Air numbers in docs/graphics-perf.md "High on an M1 Air").
  pixelRatio: [{ cap: 1, scale: 0.75 }, { cap: 1, scale: 1 }, { cap: 1, scale: 1 }],
  // Auto quality's last step on a slow first ride at Low: render scale 0.75 → this (gfx/autoquality.js).
  lowestScale: 0.6,
  // Sun shadow map: half-size of the box around the rider (m) and map resolution.
  shadow: [{ box: 40, map: 1024 }, { box: 60, map: 2048 }, { box: 72, map: 2560 }],   // high was 85 / 3072: same texel size, 2.1 → 1.6 MB of depth writes per frame
  // Screen-space AO (N8AO): null = off. It has a ~2 ms floor on an iGPU even at its cheapest
  // settings, so medium relies on the baked terrain sky-visibility and per-tree AO instead.
  ao: [null, null, { mode: 'Performance', halfRes: true, denoise: 1 }],   // was Medium / 2 denoise passes (M1: same look at half res)
  smaa: ['LOW', 'LOW', 'HIGH'],                // SMAA preset
  // Scene-pass MSAA samples (trees switch to alpha-to-coverage when > 0). Off: on an Intel Arc iGPU even 2x
  // measured ~3x the frame cost (half-float multisampled target). Worth enabling on a discrete GPU.
  msaa: [0, 0, 0],
  bloomScale: [0.7, 1, 1],                     // × POST.bloom.intensity
  glare: [false, true, true],                  // occlusion-aware veiling glare toward the sun
  flare: [false, false, true],                 // faint lens ghosts
  // Terrain shader (gfx/snow.js): glints, track trenches (1 = normal-mapped, 2 = parallax),
  // and ROCK_LITE (one rock projection, no fine fracture cells) where rock is costly.
  terrain: [
    { lod: 0.6, sparkle: false, tracks: 1, rockLite: true },
    { lod: 1.0, sparkle: true, tracks: 1, rockLite: true },
    { lod: 1.25, sparkle: true, tracks: 2, rockLite: true },   // was lod 1.5 + full near rock: a measurable M1 cost for detail hard to see in motion
  ],
  // Terrain chunk LOD (terrain.js): share of each LOD distance over which vertices geomorph to the
  // coarser grid before the swap, how far ahead (s of travel at the current velocity) detailed chunk
  // geometry is built, and how many detailed (LOD 0-2) chunk geometries stay cached.
  terrainMorph: 0.3,
  // Tile rock on medium / high: buttress facets, crisper block tones (ROCK_MACRO in gfx/snow.js
  // rockLayer). Off = the previous plain-slab rock.
  rockMacro: true,
  terrainLookahead: 3,
  terrainCache: 48,
  // Trees (gfx/trees.js). One hand-over: 3D frond trees out to `near` metres, baked impostor cards
  // beyond, cross-fading (complementary screen-door dither) over the last `band` x near metres before
  // it. A dense map's course.perf.treeNear scales `near`, but never below `minNear`. Impostors shrink
  // into the snow over the last `farBand` metres before `far`. The hand-over sits far enough that a
  // tree is small there, and the impostor is a picture of the same tree, so nothing visibly changes.
  trees: [
    { near: 36, band: 0.3, minNear: 30, far: 1800, farBand: 300 },
    { near: 58, band: 0.3, minNear: 45, far: 3000, farBand: 400 },
    { near: 80, band: 0.3, minNear: 60, far: 4500, farBand: 500 },
  ],
  // Pool refills (m of camera travel): fronds from a spatial grid, shadow cones.
  treeRefill: { near: 3, far: 10 },
  treeDistance: [1800, 3000, 4500],            // scatter cells (m)
  rockDistance: [500, 900, 1400],              // boulders fade out by here (fences / ice at 0.7x) (m)
  scatterFadeBand: 0.22,                       // share of that distance over which they dissolve (dither)
  boulderLoDistance: 400,                      // low-poly boulders only once a whole cell is this far (m)
  // Spray (gfx/spray.js): particle budget share, mist share, dithered spray shadows.
  spray: [
    { budget: 0.35, mist: 0.6, shadows: false },
    { budget: 0.65, mist: 0.85, shadows: true },
    { budget: 1.0, mist: 1.0, shadows: true },
  ],
  // Draw near / mid tree pools before the terrain (early-z then skips terrain pixels behind trees).
  treesFirst: true,
};

/** Clamp a quality index into the table. */
export const perfQ = (q) => Math.max(0, Math.min(2, Number(q) | 0));
