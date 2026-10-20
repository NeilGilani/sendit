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

## Trees growing in front of you (impostor pass)

Branch `worktree-agent-a42180ad93d159b85`, measured on a MacBook Air (Apple GPU, ANGLE Metal, headless
Chromium), shared with three other sessions. The user's report: *"Trees are being rendered as you go — you
can see new leaves and snow being added in front of your eyes."*

### What caused it

The zero-pop pass made every tree LOD change continuous, so `gfxpopin.mjs` (which counts *jumps*) read 0.
But the continuous changes were themselves visible, and close:

1. **Near → mid geomorph.** Across the near band, the odd frond cards (and the snow on them) slid out of
   the trunk while the even cards narrowed. Branches visibly grew as you approached. On Blackspruce
   (`course.perf.treeNear 0.44`) that band sat at **14–18 m** on quality 1, and at 36–41 m on other maps.
2. **Mid → far retract.** Mid-LOD cards grew out of the lumpy cone shells at 84–98 m on Blackspruce
   (241–260 m elsewhere). A cone stack and a frond tree look different, so whole crowns turned from
   blobs into needles and snow ridges.
3. **Shadow shapes.** Fronds' shadows cross-faded into shadow-only cones at the same 18 m. Cones have a
   different silhouette, so shadow edges on the snow moved.

Not found: cell streaming (every tree is built at load), mid-ride shader compiles or texture uploads
(`gfxpopin`: 0), alpha-boost jumps (continuous with mip level), shadow cascade pops (single texel-snapped
map).

### The fix (`gfx/trees.js`, `PERF.trees`)

- **One far hand-over, nothing morphs.** 3D frond trees out to 36 / 58 / 80 m (q0 / q1 / q2); dense maps
  may shrink that, but never below 30 / 45 / 60 m. Beyond that, every tree is an **impostor**: one
  camera-facing card per tree that blends the 2 × 2 nearest of 36 pictures (12 directions × 3 elevations)
  of the *same* frond tree. Across the last 30 % before the hand-over, fronds and impostor cross-fade with
  complementary screen-door dither. No geometry moves, so nothing grows. The mid LOD and the cone shells are
  gone.
- **The pictures match the live tree.** They are baked at load by the frond shader itself, for both species
  and 3 snow-load levels: albedo (snow included), normal and AO (atlas 1440 × 3600, RGBA8 ×2). The card is
  lit live from the baked normals (sun, sky, shadows, fog, backlit needle glow). To make the fronds and the
  pictures agree exactly, per-tree snow load is quantised to the 3 baked levels in both, branch-snow noise
  is in tree-local space in both, and the per-tree needle tint is re-applied on the card.
- **Shadows match too.** In the shadow pass the impostor card turns to face the sun and uses a silhouette
  baked from the sun's own elevation (one extra R8 row per kind and load). That is exactly the frond tree's
  shadow, so the shadow hand-over moves no edges. The coloured card offsets its own shadow lookup toward
  the sun so it doesn't shadow itself.
- **Built for the whole map at load.** Impostor cells (750 m) are static. The frond pool holds every tree up
  to the hand-over + 3 m and refills every 3 m, so trees enter it already invisible.
- **Memory.** The bake renders into a temporary target, reads back into two mipmapped textures (~27 MB
  each on the GPU) plus a 2.3 MB silhouette texture, then frees the target and the CPU copies.

### Measurements (quality 1)

`gfxgrow.mjs`: 40 steps of 2 m down each run. At each step the frame is rendered twice in one JS task,
with the tree LOD eye where the camera is and 1 m behind it. Every differing pixel is something that
changes only because you came closer. "Blocks" counts 16 × 16 px blocks whose mean brightness moved by
more than 5 levels: structural change (branches, snow, shapes). Pixel counts also include dither speckle
between two matching pictures. Mean % of the image per metre travelled (p95 in brackets):

| Map | Structural, before | Structural, after | Pixels, before | Pixels, after |
|---|---|---|---|---|
| Blackspruce | 2.51 (6.08) | **0.16** (0.83) | 2.06 (4.59) | 0.57 (1.30) |
| Ravenspire (trees at 78 %) | 0.39 (1.78) | **0.006** (0.03) | 0.36 (1.45) | 0.41 (0.80) |
| Kitsune Peak (78 %) | 0.28 (1.25) | **0** (0) | 0.41 (1.23) | 0.22 (0.35) |
| Valcrest | 0.85 (2.06) | **0.06** (0.19) | 0.69 (1.50) | 0.30 (0.50) |
| Fjordline (70 %, few trees) | 0.02 (0.17) | **0** (0) | 0.01 (0.06) | 0.01 (0.07) |

Structural change is 13× to 60× smaller wherever there are trees. The diff masks
(`gfxgrow … outDir`) show what's left: dither speckle on trees 40–58 m away, and no shadow edges. Before,
there were solid red crowns at 15–18 m and 90 m and moving shadow edges.

GPU ms per frame, 1600 × 900, q1, old and new build alternated on the same machine (`gfxab.mjs` with two
dev servers, quietest of 2–3 rounds, 5–6 poses). This Apple GPU is about 1.8× slower than the Surface's
Arc iGPU, so compare ratios:

| Map | Before | After | |
|---|---|---|---|
| Blackspruce | 24.2 | 25.7 | +6 % (sun-facing shadow cards ~1 ms; without them it measured +1 %) |
| Valcrest | 23.3 | 19.6 | −9 % to −16 % (impostors replace the 41–260 m mid fronds) |
| Ravenspire | 19.4 | 18.7 | −4 % |

On the Surface that is roughly 13.4 → 14.2 ms median on Blackspruce (still in the 14–16 ms target) and
cheaper everywhere else. Triangles per frame went down 8–25 %.

`gfxpopin.mjs` (q1 on all five maps, plus q0 / q2 on Blackspruce): 0 tree / shadow / scatter / terrain pops, 0 shader
compiles and 0 texture uploads mid-ride, no errors.

### Load time

Navigation to the first riding frame, q1, both builds back to back on a quiet moment of the machine
(`gfxgrow` boots): Blackspruce 11.6 → 12.1 s, Ravenspire 9.4 → 10.1 s, Valcrest 5.5 → 6.2 s,
Fjordline 16.7 → 16.9 s (Kitsune 16.8 → 21.3 s, a noisy run). The impostor bake costs 0.2–0.7 s (1.1–1.6 s while the machine was busy;12 × 3 × 3 ×
2 + 72 small renders and three read-backs, logged as `[gfx] tree impostors … ms`). In the game it runs
as `bakeImpostorsAsync()` in `main.js` right after the trees are placed, before the warm-up: it yields every
~12 ms and reports progress through `ui.loading(0.62–0.72, 'Planting pines…')`, so the live loading scene
stays smooth. The loading scene (`src/loading/scene.js`) plants the same trees and bakes its own atlas
synchronously in its worker (`bakeImpostors()`, part of its ~650 ms "trees" time).

### Knobs

`PERF.trees[q]` = `{ near, band, minNear, far, farBand }`. `IMP` in `gfx/trees.js` sets the atlas layout:
directions, elevations, load levels, frame size in pixels and metres. Bigger frames are sharper at the
hand-over but cost memory. At q1 / 1600 × 900, one frame pixel is about one screen pixel at 50 m.

## Next levers, if a weaker GPU needs more

- **Shadow map**: casters inside a 1200 m-deep ortho box. Pulling the far plane in would cull up-sun terrain
  chunks, but the crisp wall shadows near the rider come from that map, so check the visuals.
- **Trees**: the frond hand-over (`PERF.trees[q].near`) is the main tree cost. Impostors are cheap, but
  their sun-facing shadow cards cost ~1 ms on a dense map. Casting only from trees up-sun of the rider
  would roughly halve that.
- **Terrain**: q1 could also drop glints (about 1 ms).
- **Pop-in budget**: a wider dither band looks smoother but rasterises both representations over more
  trees.
- **CPU** (not the bottleneck): `getProgramParameter` shows up at about 0.3 ms per frame on the main thread.
  Worth tracking down if the game ever becomes CPU-bound.

## Launch check (night 3, 2026-10-20): MacBook Air M1 8 GB, quality 0 / 1 / 2, chase + first person

Headless Chrome, ANGLE Metal, 1440×900 CSS at 2× (the Air's own screen), dev server, GPU timer queries
around the whole frame (shadow + scene + post), 240 frames while carving. The machine was shared with four
other sessions' browsers and builds (load average 5–13), so GPU numbers are ±30 % and rAF intervals are only a
rough guide; compare within a row. Script: `perf3.mjs` in the night-3 scratchpad (same method as
`scripts/gfxperf.mjs`, plus first person, rAF long frames and heap).

| map / view | q0 (1080×675) GPU med / p95 | q1 (1440×900) | q2 (2880×1800, before the cap) | heap q0 / q1 / q2 |
|---|---|---|---|---|
| Valcrest chase | 12.8 / 21.7 ms | 21.1 / 25.1 ms | 232 / 256 ms | 184 / 197 / 220 MB |
| Valcrest first person | 12.7 / 17.4 | 20.3 / 22.5 | 228 / 263 | 199 / 206 / 209 MB |
| Blackspruce chase | 13.4 / 17.6 | 23.1 / 26.1 | 196 / 309 | 186 / 197 / 221 MB |
| Blackspruce (fp flag did not engage) | 13.5 / 17.6 | 24.5 / 28.7 | 279 / 409 | 187 / 214 / 227 MB |
| Ravenspire chase | 13.7 / 18.9 | 20.6 / 21.6 | 274 / 341 | 200 / 207 / 212 MB |
| Ravenspire first person | 12.9 / 19.5 | 17.6 / 19.5 | 242 / 317 | 203 / 193 / 234 MB |

Long frames (rAF > 33 ms) over ~250 frames: q0 0, q1 0–3, q2 almost every frame. Main-thread CPU 2.5–9.5 ms
median. No console errors. Boot to riding 10–24 s on this loaded machine.

- **High was unplayable on a 2× laptop**: `pixelRatio` cap 2 rendered 5.2 MP with N8AO, a 3072 shadow map and
  the parallax terrain: 200–280 ms a frame (4–5 fps). Even at 1× High costs ~85–99 ms here (AO ≈ 40 ms,
  terrain q2 ≈ 30 ms, 3072 → 2048 shadow ≈ 20 ms in single-knob A/B; noisy). High's cap is now **1.5**
  (2.25× fewer pixels on 2× screens; 167–237 ms measured right after, machine still busy). High remains a
  setting for discrete GPUs; the auto pick never chooses it. **Fixed later the same night: see "High on an
  M1 Air" below (High is now ~1.5–2.5× Medium, not 10×).**
- **Low** is mostly a pixel-count saving (0.75 scale, 1.6× cheaper than Medium here). For a weak laptop
  (Intel UHD class, ~4× slower than an M1) that is still ~50 ms, so auto quality has one more step:
  render scale 0.6 at Low (`PERF.lowestScale`), only for automatic settings.

### Auto quality (`gfx/autoquality.js`, tests in `scripts/autoquality-unit.mjs`)

First launch only (no `quality` stored yet, or `qualityAuto: true` from an earlier auto pick):

1. **GPU tier** from `WEBGL_debug_renderer_info`: software renderers (SwiftShader, llvmpipe, Microsoft
   Basic Render), phone / tablet GPUs (Mali, Adreno, PowerVR, "Apple GPU"), old Intel HD / UHD, old AMD
   APUs (R2–R7), GeForce MX1x0/MX2x0 / GT → **Low**; an integrated GPU on a > 3.7 MP CSS screen → Low;
   everything else (M-series, Iris Xe, Arc, discrete) → **Medium**. Never High.
2. **First-ride check**: after 4 s of riding, the median frame over 8 s; slower than 27.5 ms (~36 fps) →
   one level down, then check again; still slow at Low → render scale 0.6; a passing check settles it for good.
   Lobby, pauses, replays and lifts don't count.
3. **Never overrides a choice**: clicking a quality button clears `qualityAuto` (and the lowest scale);
   `?quality=` turns it off; automated browsers (`navigator.webdriver`, i.e. the test scripts) are left alone
   unless the URL has `?autoq`. Console: `[gfx] auto quality …`.

## High on an M1 Air (night 3, 2026-10-20)

**Root cause.** N8AO's `autoDetectTransparency` (on by default) finds any transparent material in the scene
(spray, mist, sky bits), turns on `transparencyAware`, and from then on renders **the whole scene twice more
every frame** for its transparency targets, and each of those `renderer.render()` calls re-renders the sun
shadow map too. That is why "AO ≈ 40 ms" and "3072 shadow ≈ 20 ms" looked so expensive in single-knob tests:
both were the same extra scene passes. `gfx/post.js` now sets `autoDetectTransparency = false` and
`transparencyAware = false`. Spray / mist get a faint AO tint from the snow behind them; not visible in play.

**What High is now** (`PERF[2]` in `gfx/perf.js`, `terrain.js qualityDefines`, `gfx/snow.js`):

| knob | before | now | why |
|---|---|---|---|
| N8AO transparency pass | auto (on) | off | 2 extra scene + shadow renders a frame |
| pixel ratio cap | 1.5 (was 2) | 1 (CSS resolution, like Medium) | 0.5 of cap ≈ 2× pixels on a 2× screen; High's look is AO / shadows / terrain, not pixel count |
| AO | Medium mode, 2 denoise passes, half res | Performance mode, 1 denoise pass, half res | same soft contact AO at intensity 1.15 |
| shadow map | 3072, ±85 m | 2560, ±72 m | same texel size (5.6 cm), less depth fill |
| terrain LOD distances | ×1.5 | ×1.25 | |
| near rock | full (fine fracture cells, 3 projections) | lite (as Medium) + macro facets | |
| flutes (steep snow) | 2 scales × 4 cells × 5 normal taps | both scales in one pass, cell normal from one tap of a ~32 m mip | same runnels, ~⅓ of the fetches |
| parallax tracks | 10 + 4 steps, out to 45 m | 7 + 3 steps, out to 36 m | sub-pixel beyond |
| far ring / backdrop | full rock + flutes everywhere | macro buttresses, rock blocks out to 2.7 km (Medium 1.5 km), plain tone beyond | |

Still High-only vs Medium: AO, wider shadow box, parallax track trenches, flutes, far buttresses, longer
rock-detail range, nearer frond trees (80 m vs 58 m), SMAA High, lens ghosts, full spray budget.

**Numbers** (headless Chrome, ANGLE Metal, 1440×900 CSS at 2×, GPU timer queries around the whole frame,
chase cam, carving; `perf3.mjs` in the night-3 scratchpad). The machine was shared with four other workers'
browsers, so absolute values swing ±50 %; compare within a run. In quiet stretches Medium measured 20–25 ms.

| | Medium | High before (cap 1.5) | High after |
|---|---|---|---|
| Valcrest | 21 ms | 167–237 ms | see final table below |

In-page A/B on Valcrest (one High page, knobs switched to Medium values, 5 interleaved rounds): High / Medium
≈ 1.5 after this pass (base 65.5 vs Medium-equivalent 43.5 ms under load); AO now costs ~6 % of the High
frame, flutes ~3 %, the 2560 shadow ~15 %.

Note for measuring on Apple GPUs: timer queries in ANGLE Metal time whole command buffers, so per-pass
queries (as `gfxgpu.mjs` does on D3D11) return ~the whole frame for every pass; only whole-frame numbers and
in-page A/B ratios are meaningful there.

**Safety net.** If a player picks High and the median frame over 4 s of steady riding (after 4 s warm-up) is
slower than 33 ms, a one-time notice appears (`gfx/autoquality.js heavyHighWatch` → event `qualityHeavy` →
`ui.js qualityHint`): "High is heavy on this device — Medium recommended" with **Switch to Medium** and
**Keep High**. Nothing changes on its own; the flag `qualityHeavyHinted` keeps it to once per device. Off with
`?quality=` and in automated browsers (unless `?autoq`). The settings button reads "High (strong GPUs)".
The first-launch auto pick still never chooses High.

