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
  // Trees (gfx/trees.js): radius scale of the full-frond pool (× TREES.nearRadius), of the mid pool
  // (× TREES.midRadius), and how far the static far shells are drawn (m).
  trees: [
    { near: 0.6, mid: 0.3, far: 1800 },
    { near: 0.7, mid: 0.62, far: 3000 },
    { near: 1.0, mid: 1.0, far: 4500 },
  ],
  treeDistance: [1800, 3000, 4500],            // scatter cells (m)
  rockDistance: [500, 900, 1400],              // boulder cells (m)
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
