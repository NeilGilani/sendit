# Loading screen — "the hero shot"

While the game boots, SENDIT plays a live, slow-motion hero shot: a skier or snowboarder sends a trick
off a wind lip above a rock band, high on an arête, with a range of peaks behind. It is different on
every load (rider, gear, outfit, trick, camera move, mountains, time of day), renders at high
resolution in its own worker, and dissolves into the lobby when loading finishes.

Code: `web/src/loading/` · markup + inline CSS: `web/index.html` (`#loading`) · hooks: `ui.loading()` /
`ui.doneLoading()` in `web/src/ui.js` · preview: `web/loading.html` · captures: `web/scripts/loadingshot.mjs`
· timing: `web/scripts/loadtime.mjs` · stills: `web/scripts/loadingstills.mjs` → `assets/loading/`.

## Round 2 (overnight 17→18 Oct 2026): a real picture from the first frame, live on every map load

### What the user actually saw (diagnosed on the MacBook Air M1, Chrome / ANGLE Metal, 1440×900 @2×)

Measured with `scripts/loadtime.mjs`-style runs (scratch script, boot → lobby → pick Ravenspire) on the old
code (commit `f7dcf86`, served side by side on another port), with 2–3 other sessions loading the machine:

| | old |
|---|---|
| first paint | the CSS backdrop (gradient + SVG ridges + CSS dots): the "basic 2D mountain" |
| first live frame, boot | 2.5–3.3 s after open on a quiet machine, 5.5–8.5 s with other sessions busy; the 2D screen until then |
| live scene resolution | the scaler collapsed to 0.5–0.64 → **919×574 to 1183×739 px on a 2880×1800 screen** (blurry) |
| live scene fps during the boot | 9–14 fps, freezes of **5–8.5 s** |
| lobby → mountain | a full page reload (`location.search`), so the same boot again: 2D screen for 1–6 s, then a random rider on a random made-up place (captions like "Dragonback · Spine 3" while loading Ravenspire), ~1050 px wide |

Why: (1) the live scene needs ~2 s of worker start-up (modules, terrain, shader compile, the rider's glTF)
and the worker's module requests queued behind the game's hundreds of dev-server requests; (2) the scaler
counted GPU-thread stalls (the game linking shaders) as "too slow" and halved the resolution; (3) the game's
own warm-up compiled programs synchronously on Chrome's single GPU thread (which the worker shares), and
its shadow-variant warm-up drew a bare clone of the terrain material in the main pass — compiling a whole
new terrain program synchronously (a 2 s+ freeze at the end of *every* load, old code included); (4) the
1024² sun-mask bake was one 1–3 s GPU pass; (5) the worker reveal waited on a main-thread CSS class, and
the main thread receives worker messages late (multi-second long tasks).

### What changed

1. **First paint is a picture from the game's own engine.** 12 hero stills (`assets/loading/*.webp`,
   2880×1620, 170–260 KB each, 2.8 MB in all) are rendered by the loading scene itself: `scripts/loadingstills.mjs`
   freezes a seeded variant mid-trick (`?loadq=still` = full size, real depth of field, no scaler,
   `?loadfreeze=<fraction of the air>`) with the new *hero three-quarter* camera, and encodes WebP in the
   browser. A tiny inline script in `index.html`'s `<head>` picks one (never the same twice in a row; on a
   lobby → mountain load one in that mountain's light), preloads it with `fetchpriority=high` and shows it
   the moment it decodes (~50–200 ms after open), with a slow Ken Burns drift (random direction per load)
   and CSS bokeh snow above it. The old CSS gradient/ridges stay underneath only as the last fallback.
2. **Seamless still → live.** The worker redraws the same still itself (`loading/still.js`: same WebP, same
   `cover` crop, same Ken Burns curve synchronised through the epoch clock) as its first frames, so the
   canvas appearing over the page is invisible, and then dissolves from the still into the live shot in
   the worker the moment the rider's first trick shot starts — no main-thread involvement. It never shows an
   empty establishing slope over the still. The live scene starts from the still's variant (same place,
   light, rider) unless this is a map load.
3. **Map load = the player's own rider on that mountain.** Before the lobby reloads into another mountain,
   `main.js` writes `localStorage['sendit.loadhint']` (`loading/hint.js`): the player's outfit (the real
   catalog colourways via `outfitSlotsFromProfile`), gear type + model, the mountain, trail, region and
   accent. The next load's hero shot rides that outfit and gear, in that mountain's light (`MAP_LOOKS` in
   `variants.js`: Kitsune → alpenglow/first light, Voltage Park → northern lights, Fjordline → golden…),
   the caption names the real mountain and trail, and a big map card ("DROPPING IN / KITSUNE PEAK /
   ● Okama Bowl · Hokkaido, Japan") sits bottom-left like a game's map intro. A plain refresh is a normal
   random boot again.
4. **Smooth through the whole build.** `compileAsync` everywhere with the post stack's HDR target bound
   (the canvas variant was the wrong program, so the first real frame re-linked everything — a 1.8 s
   stall in the worker's first live frame, and the same in the game); the game's frame loop holds off
   while it compiles; prewarm draws the scene's materials in 10 slices with yields; the shadow-variant
   warm-up uses invisible stand-in materials (same depth-program fields) and two pairs per frame; the sun
   mask bakes in 8 strips with yields. Result on the map load: worst worker frame 3–4 s → ~0.3–0.5 s
   (on a machine at load average 30–50; no stall at all on a calmer run).
5. **Resolution.** Budget 3.2 MP rendered (2277×1423 on the 1440×900 @2× Air), the scaler ignores stall
   frames (>90 ms), never drops below 0.7, and may climb to native when frames have headroom. It holds a
   locked 30 fps (slow motion hides it) instead of trading resolution for 60.
6. **The loading code downloads first.** `index.html` starts `main.js` only once the loading worker has its
   modules (or after 2.5 s), so the hero shot isn't queued behind the game's requests.
7. **Looks.** Denser far ring (every boundary column, 300 rows: smooth silhouettes), massif mask (a few
   dominant peak groups instead of an egg crate of equal cones), the game's own spruce and fir
   (`gfx/trees.js`, ~1400 trees in clumps on the slopes below the band, stunted higher up; `trees.js` now
   builds its needle texture on an OffscreenCanvas in a worker), dense valley forest without flecks,
   softer cloud sea. New camera move *Hero three-quarter* (drone 6–8 m off the rider's 3/4 front, below
   the apex, backlit, slow push-in) — the first shot of most loads; fewer long-lens / low shots (they
   framed a dark wall or a speck).

### Numbers (after)

MacBook Air M1 8 GB, headless Chrome (ANGLE Metal), 1440×900 @2× (a 2880×1800 screen), dev server, warm
HTTP cache. Old = commit `f7dcf86` served on another port, runs interleaved old/new, 4 pairs at 01:25 when
the machine was quiet (load average 2–4); boot → lobby, then lobby → Ravenspire (`selectTrail`, ride).

| | old | new |
|---|---|---|
| first picture | CSS 2D mountain at ~0.1 s | **engine still at 0.13–0.2 s** (decoded) |
| live rider on screen, boot | 2.5–3.3 s (2D screen until then) | 2.3–3.4 s (the still until then, dissolving in-worker) |
| boot → lobby ready | 11.1 / 11.4 / 12.9 / 12.0 s (median ≈ 11.7) | 9.5 / 12.9 / 13.9 / 11.4 s (median ≈ 12.1) |
| live render size, boot | 960×600 – 1183×739 (scale 0.52–0.64) | **2277×1423** (scale 1.0) |
| live fps during boot | 18–20 | 32–33 (locked 30 by design) |
| worst live frame, boot | 1.5–3.4 s | 0.7–1.4 s (one, in "Setting up the lobby"; then fixed, see below) |
| lobby → mountain ready | 8.1 / 8.6 / 9.0 / 9.0 s (median ≈ 8.8) | 8.2 / 9.4 / 9.5 / 10.4 s (median ≈ 9.5) |
| live on the map load | 0.9–1.1 s, random rider / made-up place | 1.4–1.9 s (still before), **the player's rider, the real mountain + card** |
| live render size, map load | 1563×977 | **2277×1423** |
| worst live frame, map load | 0.2–0.43 s | **67–83 ms (no stalls at all)** |

So boot is within noise of before (+0.4 s median), a map load ~0.7 s longer (the heavier hero scene and the
sliced warm-up), and the screen is a real, sharp picture from the first ~150 ms and smooth throughout.
The remaining boot hitch (0.7–1.4 s while the lobby stage was set up) was a wasted canvas-variant compile
in `ensureStage()`; it is now skipped during the boot (compileForPost covers the stage).

Earlier runs the same night with the machine at load average 15–90 (other sessions' browsers) showed the
same picture in proportion: old map loads froze the hero shot for 2–4 s at the end (prewarm), boot for
5–17 s; after the fixes the worst frame stayed under ~0.5 s even at load 50.

### AAA loading screens: what they do and what we took

- **Never a blank or "loading" frame.** Riders Republic / Forza Horizon / Fortnite all open on art or
  the world straight away; the bar is never the main thing. → the engine still at first paint.
- **In-engine, live, cinematic.** SSX (2012) and Steep fly a drone camera over the mountain you are
  about to drop on; Forza Horizon's boot shows the car driving in-engine; Riders Republic keeps you in
  the world. → the live hero shot, drone moves, speed ramp, backlit powder.
- **Name the place.** Call of Duty and Apex put the map name big with location / time stamps; SSX and
  Steep name the peak and the drop. → the map card ("Dropping in · KITSUNE PEAK · Okama Bowl ·
  Hokkaido, Japan") and the shot caption (trick · place · light).
- **One tip at a time, short, true to the controls.** Zelda, Fortnite, Apex rotate single hints.
  → kept (CSS-only rotation, runs through long tasks).
- **Honest, steady progress.** A determinate bar that never goes backwards and never sits still
  ([Game Developer: "Game design rules: loading screens"](https://www.gamedeveloper.com/design/game-design-rules-loading-screens)).
  → paced bar with a compositor-side creep; any system can report finer progress through `ui.loading(p, msg)`
  (e.g. a longer tree build) and the line follows.
- **Seamless hand-off.** No black dip into the game (Horizon's boot cuts straight to driving).
  → the dissolve + push-in into the lobby / ride, unchanged.
- **Don't spoil discovery** (same article) — the stills are of the loading scene's own made-up peaks,
  not the maps' secret spots.

### How to preview (port 5184 tonight; any port works)

- Boot: `http://localhost:5184/` (random still → live shot → lobby). `?loadhold` keeps the screen up.
- A given still: `?loadstill=aurora-backflip` (names in `scripts/loadingstills.mjs`); `?nostill` = old
  CSS backdrop under the live scene; `?loadscene=0` = still only (the fallback).
- Map load as the player sees it: in the lobby pick a trail on another mountain; or set the hint by hand
  and open `?map=kitsune-peak&ride`.
- The screen alone, no game: `http://localhost:5184/loading.html?loadstill=bluebird-japan&loadhold`
  (add `&loadcam=hero&loadtrick=cork900` etc.).
- Re-render the stills after a look change: `node scripts/loadingstills.mjs http://localhost:5184/loading.html ../assets/loading`
  (a full run also writes the still manifest into `index.html`'s picker, `/*STILLS*/…/*END*/`).

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
index.html ── <head> script: picks + preloads an engine still (assets/loading/*.webp), Ken Burns
   │           paints #loading at once (inline CSS): still over sky gradient / SVG ridges, CSS snow, overlay
   │
   ├─ inline module: import loading/index.js, then main.js once the worker has its modules (≤ 2.5 s)
   │     LoadingScreen: transfers #loadcanvas to an OffscreenCanvas → Worker(loading/worker.js)
   │     progress(p, msg)  ← ui.loading()      (paced against measured stage times)
   │     finish()          ← ui.doneLoading()  (dissolve into the lobby, then terminate the worker)
   │
   └─ worker.js → scene.js  LoadingScene on its own requestAnimationFrame (independent of the page)
         still.js      redraws the page's still (same crop + drift), dissolves it into the first shot
         hint.js       (page side) the lobby's "next load" facts: player outfit / gear, mountain, trail
         variants.js   random variant: time of day, mountains, gear, outfit, tricks, cameras;
                       MAP_LOOKS = each game map's light for map loads
         gfx/trees.js  the game's spruce / fir on the slopes below the band
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
screen stays (it is underneath all along): the engine still with its Ken Burns drift and CSS snow, with
the same overlay and progress. `?loadscene=0` forces it. If the still can't load either, the old CSS
gradient + ridges show. Reduced motion: still only, no drift or snow.

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
`assets/loading/*.webp` (round 2) are renders of this loading scene (no third-party content; re-render
with `scripts/loadingstills.mjs`). Everything else is procedural or reused from the game: the rider glTF and outfits,
equipment models, the CC0 Poly Haven `rock_face_03` packed texture (already credited in CREDITS.md),
the game's noise texture generator and post grade.

## Tests and tools
- `node scripts/loading-unit.mjs`: choreography + camera checks (24 variants × both gears × every trick ×
  every move: lands past the band, upright, forward or switch as expected, flips go inverted, feet never
  under the snow, speed ramp, cameras clear the snow). 9096 checks (with the hero move).
- `node scripts/loadingstills.mjs <loading.html> <outDir> [WxH@dpr]`: the painted stills (WebP); `SPECS=<json|file>`
  renders other picks (contact sheets while choosing shots).
- `node scripts/ld-terrain-bench.mjs`: the loading terrain build in Node (~0.5 s after the denser far ring, was ~0.27 s).
- `__loading.stats()` in the page: `stillMs` (still decoded), `firstShotMs` (live rider on screen, worker clock),
  `scene.stalls` (worker frames > 250 ms, page clock) and `marks` (game boot phases, e.g. prewarm) to line them up.
- `GPU=1 node scripts/lobbytest.mjs <url>`: the lobby flow plus the loading hand-off (overlay gone, worker
  canvas removed, no curtain left, progress reached 100 %, a live frame was shown).
- `node scripts/loadingshot.mjs <url | …/loading.html> <outDir> "<q1>;<q2>" "<t1,t2>" WxH`: frame captures.
- `node scripts/loadtime.mjs <url> <runs> "loadscene=0;"`: interleaved boot timing + worker pacing.
- `web/loading.html?loadseed=…&finish=12`: the screen alone (no game boot), optionally with the hand-off.

## Known issues / ideas
- Round 2 moved the game's boot compile to `compileAsync`, sliced prewarm and the sun-mask bake; the
  remaining worker hitches are a few 0.3–0.5 s frames (rider glTF / texture uploads in the game, depth
  programs that `compileAsync` can't reach) — only measured on a heavily loaded machine.
- The live rider appears ~2 s after open (worker start-up); the still covers it, so the first thing on
  screen is still the game's own rendering.
- Map loads are still full page reloads (the still covers the gap; an in-place map switch would let the
  hero shot run uninterrupted from the lobby, but means tearing down every system in `main.js`).
- The stills are fixed renders: after a big look change (terrain, snow, rider), re-render them.
- The worker duplicates three.js and the rig modules (a second copy in memory while loading; the
  bundle has a separate worker chunk).
- No other people around the rider; far valleys get a forest tint, the near slopes real trees.
