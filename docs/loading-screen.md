# Loading screen — "the hero shot"

While the game boots, SENDIT plays a live, slow-motion hero shot: a skier or snowboarder sends a trick
off a wind lip above a rock band, high on an arête, with a range of peaks behind. It is different on
every load (rider, gear, outfit, trick, camera move, mountains, time of day), renders at high
resolution in its own worker, and dissolves into the lobby when loading finishes.

Code: `web/src/loading/` · markup + inline CSS: `web/index.html` (`#loading`) · hooks: `ui.loading()` /
`ui.doneLoading()` in `web/src/ui.js` · preview: `web/loading.html` · captures: `web/scripts/loadingshot.mjs`
· timing: `web/scripts/loadtime.mjs`.

## Research notes

**Apple TV / macOS Aerials.** Real slow-moving aircraft footage, shot in slow motion, at 4K, with the
time of day matched to the viewer (day and night versions of each place). What makes them work:
one continuous, slow, stable camera move per clip (no cuts mid-move, no shake), wide lenses over vast
landscapes so nothing demands attention, light that changes slowly (dawn and dusk are the favourites),
and a small caption naming the place. They loop without a beginning or an end.
Sources: [Loop Insight](https://www.loopinsight.com/2016/12/16/apple-tvs-gorgeous-aerial-screen-saver-gains-21-new-videos),
[Benjamin Mayo](https://benjaminmayo.co.uk/watch-all-the-apple-tv-aerial-video-screensavers),
[iPhone in Canada](https://www.iphoneincanada.ca/news/apple-tv-screensavers-on-desktop/),
[Softpedia (Aerial for Mac)](https://mac.softpedia.com/get/Screensavers/Aerial.shtml/).

**Ski and snowboard film hero shots (MSP, TGR, Red Bull Media House style).** The language is very
consistent: a speed ramp (real speed on the in-run, deep slow motion from just before the lip through
the air, back to speed on the landing), the rider backlit so the powder glows, snow kicked toward the
lens, a long lens from across the bowl that stacks the peaks behind the rider, a low angle from the
base of the cliff with the rider against the sky, and a drone that follows off the cliff. Sequencing
used in these edits: side tracking → low angle with snow flying past → drone overhead → rear follow.
Sources: [NFB stock archive (backlit powder, spray over camera, slow-mo wake)](https://archives.nfb.ca/stockshot/42076/),
[NFB 42019](https://archives.nfb.ca/stockshot/42019/), [NFB 42075](https://archives.nfb.ca/stockshot/42075/),
[Adobe Stock skiing listings (cliff drops, FPV drone, 50 fps slo-mo)](https://stock.adobe.com/lu_en/search/video?k=skiing).

**Game loading screens and menu backdrops (Riders Republic, SSX, Steep).** Riders Republic leans on
short loads and keeps the player in the world; SSX's menus sit over cinematic flyovers of the peaks.
The search found little about their loading art directly ([Red Bull on Riders Republic vs SSX](https://www.redbull.com/us-en/levels-riders-republic-episode),
[Ubisoft next-gen notes](https://www.ubisoft.com/en-ca/game/riders-republic/news-updates/2jvrOHAxVU9PfZZCSgnc8g/riders-republic-on-the-next-generation-of-consoles)).
From playing them, the conventions are: a small logo, one slim progress element, one rotating tip
at a time, film-style letterbox or vignette, never a spinner in the middle of the art, and a
transition straight into the menu (no black dip).

**Design rules taken from that**
1. One slow, continuous move per shot; cut only between shots (short dip), never inside one.
2. Slow motion only where it pays: the air. Real speed in and out (speed ramp).
3. Backlight: the camera goes on the side away from the sun ~80 % of the time.
4. Keep the horizon in frame and the range or sky behind the rider; never frame the rider against
   plain snow.
5. Long-lens and low-angle shots for scale, side tracking and orbits for the trick itself.
6. Overlay in the letterbox bars, small and quiet: logo, caption (trick · place · time), one tip, a
   2 px progress line. Nothing over the rider.
7. It must never stutter: the game's boot blocks the main thread for seconds (see below), so the
   scene cannot live on the main thread.

## What the boot actually does to the main thread

Measured on the real GPU before this change (`scripts/loadtime.mjs`, 1280×720, warm HTTP cache):
boot to lobby ≈ 10–12 s, and **~90 % of it is long tasks** (47 long tasks, 9–10 s in total, the
longest 1.7 s; 12 s on a cold GPU shader cache). The main thread gets ~130 frames in 10 s. So a
main-thread loading scene would show a slideshow. Hence the architecture below.

## Architecture

```
index.html ── paints #loading at once (inline CSS): sky gradient, SVG ridges, CSS snowfall, overlay
   │
   ├─ <script src=/src/loading/index.js>   (runs before main.js is even fetched)
   │     LoadingScreen: transfers #loadcanvas to an OffscreenCanvas → Worker(loading/worker.js)
   │     progress(p, msg)  ← ui.loading()      (paced against measured stage times)
   │     finish()          ← ui.doneLoading()  (dissolve into the lobby, then terminate the worker)
   │
   └─ worker.js → scene.js  LoadingScene on its own requestAnimationFrame (independent of the page)
         variants.js   random variant: time of day, mountains, gear, outfit, tricks, cameras
         terrain.js    one height function → near grid (dense on the line) + far ring to 42 km,
                       watertight seam, baked sun / sky visibility; snow + rock = the game's
                       SNOW_BAND_GLSL + rockShade through world.js toonMaterial
         sky.js        gradient sky, sun / moon, cloud deck, stars, aurora; aerial perspective
         choreo.js     the hit: in-run, pop, trick rotation, grab, landing, slash; drives a puppet
                       Player that the real Rider rig (rider.js) reads
         powderfx.js   take-off curtain, landing explosion, slash spray, glints (particles.js)
         shots.js      camera moves + clearance / line-of-sight solver, pitch clamp, focus pull
         post          postprocessing: HDR → (DOF with ?loadq=high) → bloom + the game's GradeEffect
                       (gfx/post.js) + film grain → SMAA
```

Why a worker: an OffscreenCanvas worker commits frames straight to the compositor, so the scene keeps
60 fps while the main thread is stuck in terrain generation or shader compiles. The overlay's moving
parts are compositor-only CSS (tips rotate with `@keyframes`, the progress line is a `scaleX`
transition plus a shimmer), so they keep moving too.

The rider is the game's own: `rider.js` with `character/` outfits and `equipment/` models, built in
the worker from the same glTF (the HTTP cache shares it with the game). A puppet `Player` (no physics)
carries the pose: `renderPos` / `renderOrient` (centre-of-mass ballistic arc, rotation about the COM),
`state` (GROUNDED → AIR → GROUNDED), `squat` (pre-pop compression), `windup`, `grab` + `grabName`
(the rig's grab poses; `PHYSICS.trickStyle` on in the worker for tweaks), `flipRate` / `spinRate` /
`flipTuck` / `spinTuck` (tucks), `landingEvent` / `landingVy` (squash), `turnInput` (lean in the slash).

### Shot anatomy
- In-run 1.9 s real (≈1.6 s screen), compressing over the last 0.5 s, spin wind-up.
- Pop off a wind lip (the surface kicks up ~12°), 10.5–12.5 m/s, 11–16° up (+4° for flips).
- Rock band 12–16 m, then an apron that eases in at ~26° and steepens to ~38°: ~2.7 s of air,
  ~30 m out and ~27 m down. Speed ramp: 1.0 → 0.27–0.36 over the 0.7 s before the lip, back to 1.0
  0.15–1.0 s after touchdown. A shot runs ~13–15 s on screen.
- Trick rotation: `q = R(flipAxis, flip·p) · R(up, spin·p) · base`, with the flip axis world-fixed
  (lateral = back flip, travel = cork, diagonal = rodeo); after a whole flip this lands upright with
  the spin's heading. Progress `p` starts quick, runs steady and opens up to spot the landing.
- Tricks: Backflip, 720, Cork 900, Rodeo 540, Method (board), Japan air (skis), Indy 360.
- Landing: squash, powder explosion (mist, thrown clumps, ice glints), a slash with a spray wall.

### Camera moves (`shots.js`)
| Move | What it does |
|---|---|
| Side dolly | drone beside the arête at mid-arc height, tracking down the line slower than the rider |
| Slow orbit | arcs round the apex on the up-slope side while the rider hangs in the air |
| Low hero | at the foot of the rock band looking up; the rider crosses the sky, then the pan to the landing |
| Long lens | 7–9.5° FOV from far up the shoulder; the range stacked huge behind the rider |
| Drone reveal | starts at the lip, pulls back and up as the rider lands |
| Chase | behind the rider on the in-run, keeps flying out over the cliff |
| Close orbit | a drone ~5 m off the rider swinging round through the trick (the most frequent move) |

Every planned move is lifted until it clears the snow and sees the apex, the touchdown and the lip
(one constant lift, so the move stays smooth). The look-at is damped (the operator lags), there is a
centimetre-scale drone sway, and pitch is clamped (−13°, −24° for the orbit) so the horizon stays.

### Variants (`variants.js`)
- **Time of day:** Golden hour, Alpenglow, Bluebird, First light (cloud sea), Storm clearing (heavy
  snowfall), Northern lights (moonlight, stars, aurora). Each sets the sun / moon, sky, haze, light on
  the rider (the shared toon uniforms) and exposure.
- **Mountains:** spires (a lone horn across the valley), ranges (long serrated ridges), inversion
  (cloud sea in the valleys). Each comes with a place name for the caption.
- **Rider:** skis or snowboard (catalog model variants), stance, outfit colourways from
  `character/outfits.js` (usually one kit, sometimes mixed), hood up or down.
- **Per shot:** trick and camera move, never the same as the previous shot.

URL flags (all optional): `?loadseed=<n>` `?loadtod=golden|alpenglow|bluebird|dawn|storm|aurora`
`?loadmtn=spires|ranges|inversion` `?loadgear=ski|snowboard` `?loadtrick=<id>` `?loadcam=<id>`
`?loadscene=0` (static screen only) `?loadhold` (never hand off; for captures) `?loadq=low|high|idle` (idle = build but never render, for cost measurements)
`?loaddebug=cam:px,py,pz,tx,ty,tz,fov` (pinned camera) · `?loaddebug=view1|2|3` (near terrain: rock mask /
normals / baked sun+sky visibility).

Shader safety: shader error checks are off for speed, so after each async compile the worker reads every
program's link status and reports a failure as a console error (`[loading] shader failed to link`) — a
program that fails to link otherwise just draws nothing (this caught a far-terrain regression).

### Resolution and frame rate
Render size = CSS size × min(devicePixelRatio, 2), capped at ~2.1 MP (1920×1100) rendered, HDR half-float
target, SMAA (high) for crisp edges, ~60 fps cap at any refresh rate (120 Hz would double the load). The
scaler drops resolution 15 % at a time when frames run long; rather than go below 0.72 it switches to a
locked 30 fps at a higher resolution (the GPU is shared with the booting game), and it renders at 30 fps
anyway during the game's compile + prewarm stage.
Real depth of field (postprocessing DOF at half resolution) only with `?loadq=high`: on a laptop GPU it
cost seconds of boot time; by default the shallow-focus look comes from the snowflake bokeh and long
lenses. Portrait screens drop the bars, add scrims and widen the vertical FOV. The worker watches its own frame intervals and scales
the render down 15 % at a time if the median goes over 19 ms (the game is compiling and rendering on
the same GPU), creeping back up while it holds vsync.

### Hand-off
`ui.doneLoading()` → `loadingScreen.finish()`: the game's black fade curtain is dropped (no black
dip), two frames later the overlay fades, the letterbox bars retract and the scene pushes in 7 % while
dissolving over 1.3 s, revealing the lobby already rendering underneath. Then the worker is terminated
and its canvas removed (GPU context freed). If loading finished within 1.2 s, or before the scene's
first frame, it is a quick 0.45 s fade instead.

### Fallbacks
No `OffscreenCanvas`, no WebGL2 in an OffscreenCanvas, a worker error or a frame error → the painted
static screen stays (it is underneath all along), with the same overlay and progress. `?loadscene=0`
forces it.

## Numbers

All on this laptop (Intel Core Ultra 5 236V, Arc 130V iGPU, Chrome via Playwright, ANGLE D3D11), 1280×720,
dev server, **with ~10 other sessions running builds and browsers (CPU at 100 %)**, so single runs swing
by ±5 s. Every comparison is interleaved run by run (`node scripts/loadtime.mjs <url> 6 "loadscene=0;"`):
`loadscene=0` = the painted static screen only (no worker), i.e. the old loading cost.

**Boot to lobby, final version (6 interleaved pairs, 01:45, machine a little quieter):**

| | median | min | worker fps while booting |
|---|---|---|---|
| static screen only (old cost) | 5.85 s | 5.57 s | – |
| live scene (default) | 6.81 s | 6.33 s | 45–53 (35 on the cold-shader run) |

Paired deltas (warm pairs): +0.1, +1.2, +0.7, +2.4, +1.1 s; a later round on the final terrain shaders
(02:00): +0.8, +0.3, +0.8, +3.8, +0.3 s (medians 6.12 s static vs 7.58 s live) → **about +1 s (≈ +15 %)** on this saturated
laptop. An earlier round (00:45, busier machine) gave 9.34 s vs 8.58 s (+0.8 s). With the old
bar-only screen at the start of the night, boot measured 10.4–11.8 s (warm) under heavier load.

Where that second goes: a round with `?loadq=idle` (the worker builds everything but never renders)
was no faster than the live scene (8.41 s vs 7.96 s live vs 6.82 s static, medians of 4), so it is the
worker's startup work, not its frames: module evaluation, terrain build, the rider's glTF + texture decode
+ outfit geometry, and its shader compiles in the GPU process, all competing for a CPU that the other
sessions keep at 100 %. On an unloaded machine a worker core is mostly idle capacity, so the cost should be
lower there; it could not be measured tonight.

**High-DPI laptop screen (1440×960 CSS @ 2×, `VIEW=1440x960@2`), the realistic case for this machine:**

| version | static | live | paired delta | scene fps |
|---|---|---|---|---|
| before the high-DPI pass (4.0 MP render cap, far Voronoi rock) | 6.02 s | 10.04 s | ≈ +4 s | 27–31 |
| ~2.1 MP cap, cheap far rock, faster scaler, 30 fps in the compile stage | 6.53 s | 8.09 s | ≈ +1.2 s | 30–40 (scale fell to 0.6) |
| **+ locked-30 fallback instead of dropping below 0.72 scale (shipped)** | **5.60 s** | **6.29 s** | **≈ +0.6 s** | **42–51**, 0.85–1.0 scale |

**What cost what (earlier A/B rounds, 1280×720 @ 1×):**

| variant | median boot, live vs static | scene fps |
|---|---|---|
| 4× MSAA + DOF, full res | 12.7–13.0 s vs 9.9–11.2 s | 19–48, stalls up to 3.4 s |
| no MSAA, no DOF (`loadq=low`) | 10.25 s vs 9.92 s | 50–55 |
| SMAA + DOF until the last stage | 12.74 s vs 11.21 s | 20–50 |
| **SMAA, no DOF (shipped)** | **9.34 s vs 8.58 s** | **50–55** |

The scene's own startup (production build, `vite preview`): worker created 0.38 s after navigation,
module graph 0.58 s, terrain 0.5–0.9 s, shader compile ~1.3 s cold / 0.07 s warm, so the first live frame
comes ≈ 1.7–2.3 s after open with a warm GPU shader cache and 4–7 s cold (Playwright always starts cold; a
returning player has Chrome's shader disk cache). The painted static screen is up at first paint
(FCP 50–120 ms).

**Why the scene still dips during the boot:** Chrome executes every WebGL context's commands on one
GPU-process thread. The game's prewarm links its shaders synchronously (`renderer.compile` + the first
draws), which holds that thread for 1–5 s at a time on a cold cache, and the worker's frames wait behind
it (worst frame 0.3–0.8 s warm, 2–3 s cold). Moving the boot's compile to `renderer.compileAsync`
(KHR_parallel_shader_compile) would remove that; it is the graphics owner's code (gfx/prewarm.js,
main.js), so it is a recommendation in the hand-over note, not part of this change.

## Assets and credits
No new assets. Everything is procedural or reused from the game: the rider glTF and outfits,
equipment models, the CC0 Poly Haven `rock_face_03` packed texture (already credited in CREDITS.md),
the game's noise texture generator and post grade.

## Tests and tools
- `node scripts/loading-unit.mjs`: choreography + camera checks (24 variants × both gears × every trick ×
  every move: lands past the band, upright, forward or switch as expected, flips go inverted, feet never
  under the snow, speed ramp, cameras clear the snow). 8232 checks.
- `GPU=1 node scripts/lobbytest.mjs <url>`: the lobby flow plus the loading hand-off (overlay gone, worker
  canvas removed, no curtain left, progress reached 100 %, a live frame was shown).
- `node scripts/loadingshot.mjs <url | …/loading.html> <outDir> "<q1>;<q2>" "<t1,t2>" WxH`: frame captures.
- `node scripts/loadtime.mjs <url> <runs> "loadscene=0;"`: interleaved boot timing + worker pacing.
- `web/loading.html?loadseed=…&finish=12`: the screen alone (no game boot), optionally with the hand-off.

## Known issues / ideas
- The scene still dips while the game links shaders synchronously (see Numbers); fixable on the game side.
- On a cold GPU shader cache the live scene appears late (4–7 s); the static screen covers it.
- The first live frame waits for the worker's module graph and shader compiles (~1–2 s with a warm GPU
  shader cache, ~4–6 s cold on this laptop under load); the painted screen covers it.
- The worker duplicates three.js and the rig modules (a second copy in memory while loading; the
  bundle has a separate worker chunk).
- The rider has no trees or other people around; the valleys get a forest tint, not trees.
