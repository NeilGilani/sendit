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

## Next levers, if a weaker GPU needs more

- **Shadow map**: casters inside a 1200 m-deep ortho box. Pulling the far plane in would cull up-sun terrain
  chunks, but the crisp wall shadows near the rider come from that map, so check the visuals.
- **Mid trees**: alpha-tested cards cover a lot of screen. A cheaper fragment path for LOD1, without the snow
  noise, would change the look slightly.
- **Terrain**: q1 could also drop glints (about 1 ms).
- **CPU** (not the bottleneck): `getProgramParameter` shows up at about 0.3 ms per frame on the main thread.
  Worth tracking down if the game ever becomes CPU-bound.
