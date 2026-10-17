# Graphics performance

Branch `claude/gfx-snow-668da8`. This pass cuts GPU frame cost without changing how high quality looks.
All per-tier knobs now live in **`web/src/gfx/perf.js`** (`PERF`). Visual tunables stay in `scene.js` and in
`POST` in `gfx/post.js`.

## How it is measured

Everything below is headless Chromium on this machine's real GPU (Intel Arc 130V integrated, ANGLE / D3D11),
at a 1600×900 CSS viewport, riding down the opening run while carving.

| Script | What it reports |
|---|---|
| `node web/scripts/gfxperf.mjs <base> [W H] [qualities] [frames]` | Per quality: **GPU** ms per frame (timer queries around the whole frame render), **CPU** ms per frame (each `requestAnimationFrame` callback), **frame** = max(GPU, CPU) and fps, plus the older **sync** number. `DPR=1.5` emulates a 150 % laptop screen. |
| `node web/scripts/gfxgpu.mjs <base> <quality> [W H] [frames]` | Exclusive GPU time of every post pass, the shadow pass and every draw call, grouped by object and material. `EVAL='js'` toggles a feature for A/B tests. |
| `node web/scripts/gfxcpu.mjs <base> <quality>` | Chrome sampling profile of the main thread: busy ms per frame, per subsystem, top self time. |

**Why the numbers in earlier notes were wrong.** The first graphics pass reported about 2 ms per frame. That came
from `requestAnimationFrame` deltas, which headless Chromium decouples from the GPU, so it measured nothing
useful. The second pass then used "sync": render plus a 1-pixel `readPixels`. Sync adds CPU submission and a
full pipeline drain, so it overstates the real frame time by 5–10 ms. GPU timer queries measure what actually
limits the frame rate, because the game is GPU-bound. The main thread costs only about 4–6 ms a frame:
physics, logic, scene traversal and about 300 draw calls.

**Noise.** Another session shares this GPU, so absolute numbers drift ±2 ms between runs. The before/after
table below comes from back-to-back runs of three dev servers, alternating, two runs each, averaged.

## Before / after

GPU ms per frame, 1600×900 viewport at DPR 1 (q0 renders 1200×675):

| Build | Low (q0) | Medium (q1, default) | High (q2) |
|---|---|---|---|
| Pre-session (`6b25d66`, round-1 graphics) | 9.7 | 24.6 | 43.9 |
| Before this perf pass (`a36e661`) | 9.7 | 18.2 | 25.1 |
| **After (this branch)** | **9.0** (~110 fps) | **13.8** (~72 fps) | **22.2** (~45 fps) |
| "sync" metric, after (older, pessimistic) | 14.6 | 19.8 | 29.5 |

On a 150 % laptop screen (`DPR=1.5`), q1 went from **32.4 ms to 13.6 ms**, because medium no longer renders
above CSS resolution. High at DPR 1.5 renders 2400×1350 and costs about 36 ms there. That is the full-resolution
high tier and is unchanged on purpose.

Targets from the brief, in GPU frame time: q1 about 16 ms (met, 13.8), q2 about 33 ms (met, 22.2), q0 well under
16 ms (9.0). In the older "sync" metric q1 is 19.8 ms. That metric doesn't pipeline, so don't use it for fps.

## Where the time goes (after, GPU ms per frame)

| | q0 | q1 | q2 |
|---|---|---|---|
| Terrain snow / rock shader | 2.0 | 3.0 | 5.1 |
| Near frond trees (LOD0) | 1.4 | 2.4 | 4.1 |
| Mid trees (LOD1) | 2.1 | 2.4 | 2.2 |
| Far tree shells | 0.4 | 0.4 | 0.4 |
| Boulders | 0.5 | 0.6 | 0.7 |
| Sun shadow map (terrain, trees, rocks, rider, spray) | 1.1 | 1.8 | 3.1 |
| N8AO (half-res, Medium) | – | – | 3.3 |
| Bloom + grade | 0.8 | 1.2 | 0.9 |
| SMAA | 0.7 | 1.2 | 1.1 |
| Sky, far terrain, ranges, rider, misc | 0.8 | 1.0 | 1.2 |

Findings from the A/B toggles in `gfxgpu.mjs`:
- The game is fragment-bound. At a quarter of the pixels, q2 drops from 20 to 11 ms. Only the shadow map is a
  fixed cost.
- Shadow sampling costs almost nothing: switching receiving off changed nothing measurable. The cost is
  rendering the shadow map (2–3 ms on q2).
- N8AO has a floor of about 1.9 ms on this iGPU even on its cheapest settings (Performance mode, one denoise
  pass, no depth-aware upsampling). At full resolution on High it was about 45 % of the frame (fixed in the
  previous commit by moving to half resolution).
- Each terrain feature costs about 1–1.5 ms on q2: glints, fine wind detail, parallax tracks, full rock. None
  dominates on its own.
- Alpha-tested frond trees are the most expensive thing per pixel. Each card fragment runs value noise for
  the branch snow and a 16-tap soft-shadow lookup.

## What changed

All tiers, identical output:
- **Tree fragments** (`gfx/trees.js`). Fragments that the alpha test would discard now exit right after the
  alpha decision. Snow noise is evaluated only on front-facing fronds and far shells, and the four-tap
  pillow-normal gradient only where there is snow. Near and mid tree pools are filled front-to-back, and
  drawn before the terrain (`PERF.treesFirst`), so early-z rejects hidden fronds and terrain pixels behind
  trees. Screenshot diffs at q2 match the previous build apart from moving parts (rider, sway, glints, HUD).

Per tier (`PERF` in `gfx/perf.js`):

| Knob | q0 | q1 | q2 | Change |
|---|---|---|---|---|
| `pixelRatio` cap × scale | 1 × 0.75 | **1** × 1 (was 1.5) | 2 × 1 | Medium never renders above CSS resolution |
| `shadow` box / map | 40 m / 1024 | 60 m / 2048 | 85 m / 3072 | – |
| `ao` | off | **off** (was Low) | Medium, half-res | – |
| `smaa` | Low | **Low** (was Medium) | High | – |
| `terrain.rockLite` | on | **on** (was off) | off | One rock projection, one fracture scale |
| `terrain.sparkle` / `tracks` | off / normal-mapped | on / normal-mapped | on / parallax | – |
| `trees.near` × 58 m | 0.6 | **0.7** (was 0.85) | 1.0 | – |
| `trees.mid` × 420 m | **0.3** (was 0.45) | 0.62 | 1.0 | – |
| `bloomScale`, `glare`, `flare`, spray | as before | as before | as before | – |

What medium loses compared with before: the soft contact AO from N8AO (baked terrain sky visibility and
per-tree AO remain), the second rock projection and fine fracture cells (rock reads slightly simpler up
close), and some sharpness on high-DPI screens. Low loses a few mid-distance frond trees, which become
far shells sooner.

## Pop-in pass (no LOD pops, no mid-ride compiles)

Branch `claude/gfx-snow-668da8`, on top of the integrated `claude/funny-volta-2nzvj6` (a5e4eba). Design and knobs
are in `docs/graphics.md` ("No pop-in").

### Root causes found

1. **Hard tree LOD swaps** at the near hand-over (q1: 41 m on Valcrest; **18 m** on Blackspruce, whose
   `course.perf` hint shrinks the pools). Fronds swapped to the mid LOD, with its different snow and dark core.
   At the mid hand-over (q1: 260 m; 91 m on Blackspruce) they swapped to cone shells. The hide/show radius
   was measured from the pool centre, which only moved every 10 m, so boundaries also jumped in 10 m steps.
2. **Shadow pop**: only near-pool trees cast shadows, so a tree's shadow appeared when it crossed the near
   radius, inside the shadow box.
3. **Pool capacity**: pools had fixed caps (900 / 9000). On a dense map, overflow trees were simply not drawn
   until you came closer.
4. **Whole-cell pops**: boulders, fences and ice appear and disappear per 750 m cell. Boulder cells swapped to
   high poly only within ~120 m of the cell edge.
5. **Terrain chunk LOD swaps** with no morph (the geometry jumps at 168–420 m by tier), plus the same for
   the 10 m mid ring. Chunk geometry was built lazily under a per-frame budget and thrown away behind you.
6. **Shader compiles mid-ride**: the speed-wind post pass (first time you go fast), the track-stamp /
   recentre passes, tree LOD shadow shaders, and shadow-depth variants for textured casters (e.g. Ravenspire's
   double-sided station roof). The last happen because three's shared depth material only re-picks its program
   when some state flips between draws. Also the rock detail JPEG could swap in from a grey placeholder
   after loading.
7. The q2 track parallax switched off at 45 m.

Not found: lazily built scatter cells (everything is built at load) and mid-ride texture uploads (none
measured).

### Pop-in measurements (`gfxpopin.mjs`, 12 s fly-through at 25 / 20 / 31 m/s, 1280×720)

Pops per second (trees < 60 m / 60–150 m / 150–400 m, tree shadows, scatter cells, terrain swaps) and shader
programs linked during the ride:

| Map | q | Before (a5e4eba) | After |
|---|---|---|---|
| Valcrest | 0 | trees 15.3 / 59.7 / 0, shadows 15.3, scatter 0.8, terrain 7.6, compiles 2 | all 0, compiles 0 |
| Valcrest | 1 | trees 15.4 / 0 / 70.8 (nearest 31 m), shadows 15.4, scatter 1.4, terrain 6.8, compiles 3 | all 0, compiles 0 |
| Valcrest | 2 | trees 12.1 / 7.8 / 0, shadows 19.8, scatter 0.9, terrain 7.3, compiles 2 | all 0, compiles 0 |
| Blackspruce | 0 | trees 43.7 / 0 / 0 (nearest **7 m**), shadows 10.0, scatter 0.6, terrain 6.7, compiles 3 | all 0, compiles 0 |
| Blackspruce | 1 | trees 11.5 / 55.4 / 0 (nearest 9 m), shadows 11.5, scatter 0.5, terrain 5.8, compiles 2 | all 0, compiles 0 |
| Blackspruce | 2 | trees 17.5 / 75.5 / 33.1 (nearest 15 m), shadows 17.5, scatter 0.3, terrain 7.0, compiles 2 | all 0, compiles 0 |
| Ravenspire | 0 | trees 0 / 0.6 / 0, scatter 1.2, terrain 10.7, compiles 4 | all 0, compiles 0 |
| Ravenspire | 1 | trees 0 / 0 / 3.7, scatter 1.3, terrain 9.7, compiles 4 | all 0, compiles 0 |
| Ravenspire | 2 | trees 0, scatter 0.3, terrain 8.1, compiles 4 | all 0, compiles 0 |

How the metric works:
- Tree "levels" are continuous: LOD plus cross-fade progress, or 3 for "should be drawn but isn't".
- A pop is a jump of ≥ 0.5 in one frame. Frames where the camera moved > 2 m (frame hitches) re-sync without
  counting. Their counts are in the script output, and they occur in both builds.
- Before / after screenshot sequences (`gfxpopshots.mjs`, Blackspruce, 1.5 m steps) show it directly. In the old
  build, trees around 18 m turn into dark, featureless mid-LOD blobs, and only the closest trees cast shadows.
  In the new build, fronds and branch snow stay at that range, and every tree in the shadow box casts.

### Load time (navigation to first riding frame, q0 / q1 / q2, same run order)

| Map | Before | After (of which warm-up) |
|---|---|---|
| Valcrest | 8.2 / 5.3 / 7.3 s | 8.8 / 6.2 / 8.2 s (4.1 / 1.3 / 3.4 s) |
| Blackspruce | 5.0 / 4.7 / 4.7 s | 5.6 / 5.3 / 5.1 s (0.8 / 0.5 / 0.6 s) |
| Ravenspire | 7.8 / 6.1 / 6.1 s | 7.7 / 6.2 / 6.4 s (1.7 / 0.6 / 0.6 s) |

That's +0.1 to +0.9 s. Most of the warm-up is shader compiles that used to happen in the first riding seconds (or
later, mid-ride). The first map in a fresh browser profile pays the cold shader cache.

### Frame cost (GPU ms per frame, 1600×900, timer queries)

Interleaved A/B on a quiet GPU (another session and the user's browser share it, so absolute numbers
drift by ±2 ms; compare within a row):

| | Before | After |
|---|---|---|
| Valcrest q0 / q1 / q2 (`gfxperf.mjs`, 2 runs each) | 9.8–10.6 / 14.0–14.3 / 21.1–24.0 | 9.7–9.8 / 14.2–14.9 / 22.2–24.8 |
| Ravenspire q1 (`map3-perf.mjs`, 6 spots) | avg 10.5, worst 12.2 | avg 10.8, worst 13.1 |
| Blackspruce q1 (`map2-perf.mjs`, 7 spots, fastest frame) | median 13.2, max 15.5 | median 13.4, max 16.9 |
| Main thread, Valcrest q1 (`gfxcpu.mjs`) | 2.89 ms | 3.05 ms (terrain look-ahead builds) |

Quality 1 stays at 14–16 ms GPU. What it took to keep the cost flat:
- Each cross-fade band **ends** where the old hard switch was, so the full-detail coverage is unchanged.
- Bands scale with the hand-over distance: inside a band both frond LODs rasterise their alpha-tested cards,
  which cost 2.2 ms with a fixed 10 m band at Blackspruce's 18 m hand-over.
- Far shells, boulders and fences fade by shrinking, not dithering: a `discard` in their shaders would cost
  early-z on thousands of opaque instances.
- The near pool refills every 3 m from a spatial grid (tight margins, fewer collapsed instances).
- Beyond the near fronds, trees cast shadows with cheap shadow-only cones.

## Overnight tree pass (the "weird tree rendering")

What was odd, and what changed (`gfx/trees.js`):
- **Dark striped spires.** The mid LOD was a different crown: 10 whorls of wide cards around a big
  dark core. Its frond-top snow read as white horizontal stripes on a navy cone. Blackspruce hands
  trees over to it at ~18 m, so most trees there looked like that. Now LOD1 is LOD0 itself (same seed,
  same cards) with every other card dropped and the rest 25 % wider, and the same core, trunk and skirts.
- **Dither stipple** in the hand-over bands. The colour pass has no dither any more:
  - LOD0 **geomorphs** into LOD1 across the near band (`aMorph3` per vertex: odd cards retract into the
    trunk, even cards widen) and swaps where the two are identical.
  - LOD1 retracts its cards into the opaque far cone across the mid band.
  - Only the shadow pass still dithers, where the PCF filter blurs it.
- **Needle shimmer / alpha-test sparkle**: 4× (and 2×) scene MSAA with alpha-to-coverage needles is
  implemented (`PERF.msaa`). On this Intel Arc iGPU, though, even 2× measured about 3× the frame cost
  (90.7 vs 30.1 ms, interleaved under heavy contention), so it is **off** on every tier. Turn it on for
  discrete GPUs. Raising the mip-level alpha boost of distant fronds (`ALPHA_BOOST`, 0.38 -> 0.8) made no
  measurable difference to frame-to-frame shimmer (frozen clock, 3 cm camera nudge), so it stays at 0.38.

Cost: LOD1 now has more cards (57 + skirts instead of 50) but a smaller core. The near band draws only
LOD0 (no doubled rasterisation). This night's GPU numbers were unreliable: three other sessions each held
30–50 % of the GPU, and timer queries got lost. Re-check with `map2-perf.mjs` / `gfxperf.mjs` on a quiet
machine.

### Overnight checks (all seven maps)

- Pop-in (`gfxpopin.mjs`, q1, 8 s fly-through each on Valcrest, Blackspruce, Ravenspire, Voltage Park,
  Dragonback, Kitsune Peak and Fjordline): 0 tree / shadow / scatter / terrain pops and 0 mid-ride shader
  compiles on every map. Dragonback used to link one `liftMetal` program (its lift cables, out of view at
  load) mid-ride. Root cause: `renderer.compile()` builds the canvas variant of each program, while the game
  draws into the post stack's render target, which has another output colour space and so other program
  keys. Only real frames warm the real programs. The warm frames now draw every mesh unculled, and meshes
  hidden at load are drawn as proxies through the post stack (`warmHidden` in `gfx/prewarm.js`).
- Tests: unittest 52/52, map3-unit 32/32, map4-unit 15/15, map2-bot `--verify`, map3-fuzz and the GPU
  lobbytest all pass. q0 / q2 boot with no console errors. Fjordline's props print harmless three warnings
  (`toNonIndexed()` on already non-indexed geometry).
- Load times were 85-117 s tonight with the CPU at 100 % and three other sessions on the GPU, for this
  build. They were 5-9 s on a quiet machine earlier (see "Load time" above). Re-measure when quiet.
- Spray: carve-spray intensity now keeps growing with speed up to ~24 m/s (was capped at 16 m/s), with
  bigger grains at speed, so a 70 mph carve on Ravenspire throws more than a few flecks.
- Atmosphere hook: the sky tint is twilight-correct. The sun-side horizon takes `skyHorizon`, the opposite
  side blends toward `skyZenith`, and the glow band hugs the horizon. Kitsune Peak's shade went from
  muddy maroon to blue-violet. Its own exposure / ambient are still dark; the suggested values were
  passed to the coordinator.

## Next levers, if a weaker GPU needs more

- **Shadow map**: casters inside a 1200 m-deep ortho box. Pulling the far plane in would cull up-sun terrain
  chunks, but the crisp wall shadows near the rider come from that map, so check the visuals.
- **Mid trees**: alpha-tested cards cover a lot of screen. A cheaper fragment path for LOD1, without the snow
  noise, would change the look slightly.
- **Terrain**: q1 could also drop glints (about 1 ms).
- **Pop-in budget**: the near hand-over could move further out on quality 2 (`PERF.trees[2].minNear`:
  more frond trees, so measure with `gfxperf.mjs` / `map2-perf.mjs`). Wider bands look smoother but cost
  more on dense maps.
- **CPU** (not the bottleneck): `getProgramParameter` shows up at about 0.3 ms per frame on the main thread.
  Worth tracking down if the game ever becomes CPU-bound.
