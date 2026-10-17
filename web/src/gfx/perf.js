// Performance tunables in one place: every GPU-cost knob, per quality level [low, medium, high].
// Visual tunables stay in scene.js (look) and gfx/post.js POST (grade). Measured with
// web/scripts/gfxperf.mjs (GPU / CPU ms per frame) and gfxgpu.mjs (GPU ms per pass / draw); the
// numbers and the reasoning behind each value are in docs/graphics-perf.md.
// Default quality is 1 (state.js), so medium is what most players see: it is tuned to ~60 fps at
// 1600×900 on an integrated laptop GPU (Intel Arc 130V). High is the full look.
export const PERF = {
  // Render resolution = CSS pixels × min(devicePixelRatio, cap) × scale. Medium never renders above
  // CSS resolution: on a 150 % laptop screen that is 2.25× fewer pixels than the old 1.5 cap.
  pixelRatio: [{ cap: 1, scale: 0.75 }, { cap: 1, scale: 1 }, { cap: 2, scale: 1 }],
  // Sun shadow map: half-size of the box around the rider (m) and map resolution.
  shadow: [{ box: 40, map: 1024 }, { box: 60, map: 2048 }, { box: 85, map: 3072 }],
  // Screen-space AO (N8AO): null = off. It has a ~2 ms floor on an iGPU even at its cheapest
  // settings, so medium relies on the baked terrain sky-visibility and per-tree AO instead.
  ao: [null, null, { mode: 'Medium', halfRes: true }],
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
    { lod: 1.5, sparkle: true, tracks: 2, rockLite: false },
  ],
  // Terrain chunk LOD (terrain.js): share of each LOD distance over which vertices geomorph to the
  // coarser grid before the swap, how far ahead (s of travel at the current velocity) detailed chunk
  // geometry is built, and how many detailed (LOD 0-2) chunk geometries stay cached.
  terrainMorph: 0.3,
  terrainLookahead: 3,
  terrainCache: 48,
  // Trees (gfx/trees.js). Hand-over distances: fronds (LOD0) -> mid (LOD1) by `near` x TREES.nearRadius,
  // mid -> far shells by `mid` x TREES.midRadius, far shells shrink away by `far` (m). Neighbouring LODs
  // cross-fade (screen-door dither) over a band just before each distance: `nearBand` / `midBand` are
  // fractions of the hand-over distance (both LODs rasterise inside a band, so a close hand-over on a
  // dense map gets a shorter, cheaper band), `farBand` is in metres. Each band ends where the old hard
  // switch was. `minNear` / `minMid` (m) floor the hand-overs when a dense map shrinks them (course.perf).
  trees: [
    { near: 0.6, mid: 0.3, far: 1800, nearBand: 0.25, midBand: 0.15, farBand: 300, minNear: 0, minMid: 0 },
    { near: 0.7, mid: 0.62, far: 3000, nearBand: 0.25, midBand: 0.15, farBand: 400, minNear: 0, minMid: 0 },
    { near: 1.0, mid: 1.0, far: 4500, nearBand: 0.25, midBand: 0.15, farBand: 500, minNear: 0, minMid: 0 },
  ],
  // Pool refills (m of camera travel): near fronds from a spatial grid, mid fronds + shadow cones.
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
