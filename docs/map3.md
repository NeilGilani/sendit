# Map 3: Ravenspire — big-mountain freeride

An isolated big-mountain face in the spirit of Steep: you are dropped by helicopter on a shoulder under a
430 m horn and ride 1,640 m of vertical to the valley — stacked cliff bands (cliff into cliff), a spine
wall, terraced pillow stacks, a deep ravine with frozen ledges, rock buttresses, wind lips, and old
buildings whose snowy roofs you can ride. No lifts, no banners, no crowds: wilderness, big peaks on every
horizon, an abandoned gondola rusting between two old stations, ravens riding the updraft round the spire.
Tuned for 22–31 m/s (50–70 mph) on the big lines, on skis and on a snowboard.

```
npm --prefix web run dev -- --port 5183 --strictPort
http://localhost:5183/?map=ravenspire&ride        straight into a ride (the lobby's Maps tab lists it too)
http://localhost:5183/?map=ravenspire&ride&equip=snowboard
node web/scripts/map3-ride.mjs both all send       bot rides every line (styles: send, control, carve, trick)
node web/scripts/map3-structures.mjs               walls solid, roofs rideable (skis + board)
node web/scripts/map3-obstacles.mjs obs.json      dump the real trees / rocks; then OBSTACLES=obs.json node web/scripts/map3-ride.mjs ...
OUT=shots node web/scripts/map3-e2e.mjs stacks skis   end to end in the real game: heli drop → valley, run summary, line goals, errors
node web/scripts/map3-fuzz.mjs                     random inputs from random starts: no NaN, never below the snow, never stuck
node web/scripts/map3-unit.mjs                     tuning hook, structures, flow layer, snowflake spots
node web/scripts/map3-perf.mjs http://localhost:5183 1600 900 0,1,2 90   GPU / CPU / draws at six spots
```

Research behind the design: [docs/map3-research.md](map3-research.md).

---

## 1. The mountain

Local frame used everywhere in the map's code: **u** = metres down the fall line from the heli drop
(world x = −1260 + u, the face falls toward +x / east), **v** = metres across it (world z, + = skier's right
when looking downhill). The sun comes from the south-south-east, so the face is cross-lit from the right:
spines, pillows and cliff lips have a lit and a shaded side.

| u (m) | zone | slope | what is there |
|---|---|---|---|
| −300…0 | **the Ravenspire** | 58° rock | the summit horn (+430 m) and its shoulder, behind the start |
| 0…60 | heli shoulder + rollover | 11° → 26° | spawn at u = 30, right on the rollover; the helicopter hovers off it |
| 60…540 | upper face | 41° | **Spine Wall** (skier's left, 13 m spines, sluff channels), open face, **Raven's Beak** buttress, couloir into the ravine (right) |
| 548 | **Band A** | | 7–15 m cliff band with two ramp-arounds |
| 540…940 | mid face | 38° | **Beak Steps**, **West Ledges**, the **Hammer** (36 m, far right, u 905) |
| 990 / 1160 / 1390 | **the Stacks** | 41° landings, ~30° benches | three bands 170–230 m apart: the **First Stack** (11–19 m), **the Throne** (13–28 m, peak at v ≈ −40), the **Last Stack** (9–19 m) — cliff into cliff; **Left Ledges** (u 1150), **East Ledges** (u 1185) |
| 1418 | **Station Cliff** | | 15–19 m band above the **Old Lift Station** (roof rideable); the station's 24 m weather mast and windsock poke over the lip and mark the roof |
| 1370…1600 | apron | 34° | the station, **Cable Drop** (8 m, u 1585, right under the old cable below the station's eave), the abandoned gondola line, **Lower Steps** |
| 1560…1800 | **pillow stacks** (left) | 34° → 27° base | terraced pillows: rolling tops, ~4 m rounded drops every 9 m, staggered lobes (a second field low on the left, u 2030–2290) |
| 1600…2100 | lower bowl | 27° → 19° | wind lips and rollers, the **Corvo Refuge** (rideable roof, stone chimney), larches |
| 2100…2540 | runout | 10° → 5° | A-frame cabins, the **Valley Station**; **run complete at u = 2540**, marked by a timber arch with a faded RAVENSPIRE · ZIEL · FINISH banner and a row of old marker poles across the valley (visual only) |
| 400…2180 | **the Ravine** (right, v ≈ 340–480) | 41° → 25° | couloir entrance, up to 54 m deep, rock walls and quarter-pipe banks, frozen ledges (4–5 m) and **Frozen Falls** (u 1330: a 9 m ice-sheeted ledge with icicles), an old suspension footbridge slung across the gorge 50–65 m overhead (u 1220, you see it span the gorge ahead from the Ravine drop zone), bends around the station's knoll |

### Best lines (bot numbers in §6)

1. **The Stacks** — straight down the middle (v ≈ −40): Band A, then the First Stack, the Throne (its biggest
   section is ~28 m) and the Last Stack, each a 30° bench, a rounded rock-toothed lip and a 41° landing. The
   signature cliff-into-cliff line.
2. **Spine Wall → pillows → Left Ledges** — slash the spines (or ride a sluff channel), the West Ledges, then
   the terraced pillow stacks on the apron.
3. **The Ravine** — drop the couloir at u ≈ 330, ride the gorge (quarter-pipe walls, frozen ledges), send
   **Frozen Falls** (9 m) and carry on past the station knoll to the lower bowl.
4. **Station Cliff → roof → Cable Drop** — hit the Station Cliff at ~18–25 m/s: you land on the old lift
   station's long snowy roof, air off its downhill eave and straight off Cable Drop under the old haul rope
   (cliff → roof → cliff). Slower: land short, ride the drift ramp onto the roof. Full send overshoots the roof.
5. **The Hammer** — the 36 m cliff on the far right; landable on its steep apron, but expect a stumble
   unless you roll it (no pop) and land straight.
6. **Bowl → refuge roof** — the open bowl, wind lips, then over the Corvo Refuge's ridge, down its roof and off
   the eave, through the larches to the A-frames.

### Buildings

| building | where | roof | ride it |
|---|---|---|---|
| Old Lift Station ("Mittelstation") | u 1497, v 288 | mono-pitch, 30°, 37 × 19 m | land on it off the Station Cliff, or ride the drift onto it; 7 m drop off the eave. A 24 m timber mast (windsock, red beacon) beside it shows over the cliff lip |
| Corvo Refuge | u 1880, v −175 | gable, 33° (ridge across the fall line) | the drift reaches 85 % up the uphill slab: over the ridge, down the slab, 7 m off the eave; stone chimney is solid, wood smoke leans downwind from it (you see the plume from far up the bowl) |
| A-frames × 3 | u ≈ 2290, v 120–205 | 56° slabs | drifted on the uphill side; steep slab landings |
| Valley Station ("Talstation") | u 2400, v 300 | gable, 26° | low roof at the bottom of the gondola |
| old footbridge | across the ravine at u 1220 | | a 79 m suspension footbridge between the wall tops, 50–65 m above the gorge floor (you ride under it); the anchor posts collide, the deck is out of reach |
| abandoned gondola | station → valley station | | 6 rusty leaning towers (collision), sagging haul ropes, two forgotten cabins; the station's weather mast collides too |

Walls are solid: a glancing touch slides along the wall (no snagging — a Steep complaint), a square hit
faster than 9 m/s knocks you down. Snow on every roof is the rideable surface itself (the roof snow mesh
is sampled from the same function the physics uses).

---

## 2. Code

```
web/src/maps/ravenspire/
  index.js       registerMap (id 'ravenspire', order 3), thumbnail (inline SVG), lobby spot; loads props.js lazily
  layout.js      every feature in one place: profile, face width, BANDS, SPINES, PILLOWS, RAVINE, HITS,
                 BUILDINGS, GONDOLA, BUTTRESSES, DROP_ZONES, LINE_GOALS, RIDE_LINES (tunables)
  course.js      RavenspireCourse: the height function, tile generation (heights, normals, rock + packed
                 snow splat, far grid), Course-compatible interface, features hooks, scatter hooks
  structures.js  Structure: roof surface (mono / gable / A-frame + snow load), walls (block test), drifts
  props.js       meshes: weathered buildings, boarded windows, signs, chimneys, bull wheels, the gondola,
                 the helicopter and ravens (animated in onBeforeRender), Frozen Falls' ice sheet and icicles,
                 chimney smoke (one instanced draw), the station mast and windsock, the finish arch and poles, the footbridge over the ravine
  tuning.js      RAVENSPIRE_PHYSICS (per-map physics) and RAVENSPIRE_CAMERA
  noise.js       value / fbm / ridged noise, mulberry32
web/src/maps/builtin.js     one line: import './ravenspire/index.js';
```

### The height function

`macro(x, z)` (everywhere, also the 10 m mid ring and the 30 km backdrop):

- **Fall-line profile** — integrated from `PROFILE` ([length, degrees], smoothed ±15 m): 11° shoulder,
  26° rollover, 41° / 38° / 41° face, 34° apron, 27° / 19° bowl, 10° / 5° runout.
- **Face cross-section** — a bowl between two ridges that converge at the summit:
  `ridgeHeight(u) · (|v| / halfWidth(u))^2.3`; on the upper face the outer ~20 % rears up into rock walls
  (`wallHeight`, 70 m) that frame it like a funnel; the crests wander, gendarmes sit only on the crests; past
  a crest a steep rocky flank falls into the neighbouring couloir.
- **Wild ranges** — ridged noise mountains outside the face (bigger and darker to the north, lower to the
  south so the face keeps its sun), growing toward the horizon so the backdrop's sunk rim never shows; the
  valley bends north and is closed off by peaks.
- **Horns** — the Ravenspire (+430 m, 1.6 slope) and its shoulder behind the start, a spire down the valley,
  a peak to the south.

`natural(x, z)` adds the detail inside the tile:

- **Lumps** sized for 25–30 m/s: 95 × 60 m wavelength, 2.2 m — curvature radius ≳ 150 m, so they don't throw
  riders off at speed (the first version launched riders off every roll).
- **Drainages** — 1D ridged noise across the face (crests drift slowly along it): rocky aretes and gullies
  that shape lines without launching riders; calmer through the Stacks.
- **Buttresses** — sharp jagged aretes along the fall line (Raven's Beak, Spine Rib, West Spur).
- **Rock islands** — ~60 knobs of rock (3–7 m) poking out of the face on a hashed 60 m grid, kept off the
  signature lines (Stacks corridor, ravine, spine and pillow fields, cliff lips, buildings, drop zones).
- **Spines** — a triangle wave across the fall line with sharp crests and rounded sluff channels.
- **Cliff bands** (`cliff(u, uc, h, L)`) — above the lip a bench of length `L = max(bench, 4·h)` raises the
  terrain by `h · t^1.25`, so the approach flattens steadily toward the lip (lip ≈ 30°, never a kicker); the
  face drops `h` over `max(1.4, 0.11·h)` m onto the unchanged 41° landing. Height varies across the band
  (noise, a peak, tapered ends, ramp-around gaps); a soft rounded snow lip; rock teeth on the lip mark the
  edge from above.
- **Pillows** — terraced: every `step` m the slope pauses on a rolling top (`top` = 70 % of the step, still
  falling gently so you never land into the next riser), then drops; wavy across the field, broken into
  rounded lobes with deep gaps between them.
- **Hits** — rollers (symmetric) and wind lips (15 m up, 2.6 m abrupt down = natural kickers).
- **Ravine** — carved last: a half-pipe floor, quarter-pipe transitions, steep rock walls and a rounded rim;
  depth up to 54 m; frozen ledges are benches in the floor.

`height(x, z)` = natural + building **drifts** (a mono roof's drift continues the roof plane uphill until it
meets the slope; a gable's drift fills against the uphill slab up to `drift`· its height).

Splat (generate): rock where steeper than ~46° (the shader also exposes rock on steep snow), **wind-packed
snow** on convex crests (Laplacian) — packed snow is faster and lands harder (no powder absorption).

### Hooks into shared files (all opt-in through course properties; other maps behave exactly as before)

| file | course property | effect |
|---|---|---|
| config.js / player.js | `physics`, `camera` | the per-map physics hook (§3) |
| features.js | `park: false` | no kickers, rollers, banners, crowds, flags |
| features.js | `heightAt(x, z, base)`, `blockAt(...)` | rideable roofs, solid walls (`terrain.features.heightAt / blockAt`) |
| features.js | `buildProps({ terrain })`, `obstacles` | the map's meshes; gondola tower collision circles |
| life.js | `life: { skiers: 0, lodge: false }` | no other riders, no lodge (birds stay) |
| scatter.js | `spawn: {...}` (SPAWN overrides), `forestAt / pisteAt / treeline` | fewer, smaller boulders on the face; larches only low, clearings around buildings and under the gondola, 16–32 m glades along the canonical lines |
| scatter.js | `rockOk(x, z)` | rock clusters stay off the lines, drop zones and ravine floor |
| activities.js | `challenge: { medalSpeeds }` | medal speeds for a fast map (24 / 20 / 16 m/s) |
| activities.js | `challenge.flakes: [{ x, z, y above the snow }]` | the 12 golden snowflakes at hand-picked spots instead of along the course path (the same hook and code as map 2) |
| player.js | `edgeHint` | the "edge of the map" hint text |

---

## 3. The per-map physics hook

A Course-compatible object may carry

```js
course.physics = { common?: {...}, ski?: {...}, snowboard?: {...} };   // → PHYSICS / PHYSICS.ski / PHYSICS.snowboard
course.camera  = {...};                                                // → CAMERA
```

`applyMapTuning(course)` (config.js) first **restores every value to its default**, then merges the overrides
**in place** (the physics modules hold references to `PHYSICS.ski` / `PHYSICS.snowboard`). Nested plain
objects merge; arrays and scalars replace; unknown keys are allowed (map-only tunables). The Player
constructor calls it when `terrain.course !== undefined` (the real world terrain); the lobby's flat stand-in
terrain has no `course`, so a preview never resets the loaded map's tuning. A map without `physics` gets the
defaults. Maps load at boot (a map switch reloads the page), so "reset when another map loads" is automatic.

### New PHYSICS / CAMERA knobs (defaults are no-ops; Valcrest's benches print byte-identical output)

| knob | default | meaning |
|---|---|---|
| `landPowderAbsorb` | 0 | m/s of landing impact (into the slope) deep powder soaks up before it counts (× powder share; roofs half) |
| `landPowderScrub` | 0 | share of speed lost per m/s of landing impact in powder (the snow explodes, you sink) |
| `landYawSpeed` | null | `[v0, v1, scale]`: yaw landing tolerances shrink to `scale`× from v0 → v1 m/s (speed-based crash threshold) |
| `compressionStumble` / `compressionCrash` | ∞ | m/s of normal velocity absorbed within ~0.12 s on the snow (a flat bottom at speed) |
| `airGravity` | 1 | gravity multiplier in the air (hang time) |
| `obstacleHeights` | false | trees / rocks / towers have a height: flying over them clears them |
| `wallCrashSpeed` | 9 | m/s into a building wall that knocks you down |
| `microHop` | 0 | s: airs shorter than this (a bump skimmed at speed) re-ground quietly instead of being judged as landings (×2.5 when you didn't pop) |
| `landRedirect` | 0 | deg: landing lined up with your flight, this much of the surface bending your path (a ravine sidewall) is absorbed instead of counting as a sideways landing |
| `landSpeedCap` | 0 | m/s: after a landing, speed above this is cut to 35 % of the excess (the rest goes into the powder) |
| `airSettleAngle` | 0 | deg: with no spin going, a released stick squares the gear up to the path from this far out (launched mid-skid) |
| `windRoar` | 0 | 0..1: the low-pass wind roar layer above 16 m/s (audio.js) |
| `trickStyle` | false | Tail grab / Truck driver on skis, "Tweaked" grabs (+50 % grab points) and the tweak pose |
| `slowmo` | null | `{ minAir, scale, easeIn, hold, easeOut, cooldown }`: apex slow motion on huge airs |
| `flow` | null | `{ enabled, … }`: the flow layer (§4), defaults in `physics/flow.js FLOW_DEFAULTS` |
| CAMERA `fovCurve` | 1 | FoV bonus = maxFovBonus · speedRatio^fovCurve |
| CAMERA `speedShake`, `speedShakeFrom` | 0, 0.7 | continuous shake on the snow at top speed |
| CAMERA `heightAtSpeed`, `steepLift`, `steepPitch` | 0 | higher at speed; higher and looking further down on steep faces |
| CAMERA `flowFov` | 0 | FoV kick entering the flow state |
| CAMERA `airLook`, `airFollowY` | 0, null | big air: look toward the landing, keep up vertically with the drop |

### Ravenspire's values (maps/ravenspire/tuning.js)

| | value | why |
|---|---|---|
| ski / board `maxVelocity` | 26 / 25.5 | soft cap start; terminal ≈ 31–32 m/s tucked on 41°, ≈ 27 upright, ≈ 21–27 on the 27° bowl |
| `dragUpright` / `dragTuck` | 0.0095 / 0.0046 ski, 0.0098 / 0.0064 board | high-speed aero |
| `speedRadius`, `speedRadiusV` | 1.2, [8, 28] ski; 2.1, [6, 26] board | long stable arcs at 25–30 m/s |
| `latG` | 2.0 ski, 1.75 / 1.6 board | grip for big GS turns |
| `powderDepth`, `frictionPowder`, `turnScrub` | 0.6, 0.06, 0.1 | deep powder: ploughs slow, planes fast |
| `liftOffGrip` | 1.5 | legs soak up rolls at speed (fewer micro hops) |
| `smoothFollow`, `terrainImpactLoss` | 0.5, 0.25 | rolls and dips cost little speed |
| `compressionStumble` / `Crash` | 11 / 17 m/s | flat-bottoming at 30 m/s hurts |
| `airGravity` | 0.9 | a little floatier: longer hang time |
| `landPowderAbsorb`, `landPowderScrub` | 5 m/s, 0.012 | 15–25 m drops onto 41° powder land clean; big impacts cost speed |
| `hardLanding` / `crashImpact` | 17 / 24 m/s (after absorption) | a full send off the Throne (~16.5 m/s) lands clean; the Hammer stumbles unless rolled and straight |
| `landYawSpeed` | [18, 32, 0.75] | sideways landings at speed are less forgiving |
| `landClean` / `landStumble` | 18° / 32° ski (crash 40°), 18° / 46° board | |
| pop, spin, flip | popMax 4.2 / 4.6, spinRateMax 7.2 / 8.2, flipRateMax 6.0 / 6.2 | bigger tricks for bigger air |
| `microHop`, `landRedirect`, `landSpeedCap`, `airSettleAngle` | 0.12 s, 30°, 34 m/s, 100° | skimming rolls at 30 m/s is not a landing; ravine sidewall landings pivot you into the new line; no 130 mph moments after a 40 m drop; a hockey-stop launch squares up in the air |
| `slowmo` | minAir 2.4 s, 0.45×, 0.15 / 0.5 / 0.35 s, cooldown 5 s | apex slow-mo on huge airs (never in the last 0.45 s) |
| CAMERA | maxFovBonus 14, fovCurve 1.6, followSmooth 0.1, steepLift 0.4, steepPitch 3, speedShake 0.12, flowFov 7, airLook 0.25, airFollowY 0.09, landTrauma 0.045 | 66° → 80° in the top of the speed range, closer and quicker at speed |

---

## 4. Tricks, flow and scoring

Controls are the game's (docs/equipment.md): hold Space to load, release to pop; steer in the air to
spin, W / S to flip; Shift grabs. On this map (trickStyle):

- **Grabs**: skis — Safety, Mute (steer left), Japan (steer right), **Tail grab** (S), **Truck driver** (W);
  board — Indy, Melon, Nose (W), Tail (S). Held past ~0.4 s the grab **tweaks** (board pushed out and rolled,
  skis crossed hard, body arched); held over 0.9 s it scores as **Tweaked …** with +50 % grab points.
- **Landing grades** (`landingGrade` event): **STOMPED** (perfect alignment, impact < 55 % of hardLanding),
  **CLEAN**, **SKETCHY** (stumble) — shown with the drop height and air time.
- **Drops**: the greatest height above the snow in an air (≥ 6 m) scores `12/m` (+10/m beyond 15 m), named
  after what you launched off (`course.featureAt`): "The Throne · 26 m drop", "Spine Wall · 14 m drop".
  Landing on a roof scores **Roof landing · Old Lift Station** (+200).
- **Pillow line**: clean landings off pillow after pillow (each within 3 s of the last) score **Pillow line ×N**
  from the third on (40 × N, capped at ×6, times the flow multiplier); a full send down the field chains ×5–×8.
- **Stomp boost** (flow maps): a STOMPED landing pushes you out 1.5 m/s faster along the line
  (`flow.stompBoost`), with its own sound; finishing a line goal plays a fanfare.
- **Line goals** (`course.lineGoals`, Steep "Mountain Stories" style): hit named features in order in one
  clean run — **The Classic** (Band A → First Stack → Throne → Last Stack, +2500), **Station to Station**
  (Station Cliff → the station roof → Cable Drop, +2000), **Spine Tingler** (Spine Wall → West Ledges → Pillow Stacks, +1500),
  **Into the Gorge** (the Couloir → the Ravine → Frozen Falls, +1500), **Hammer Time** (land the Hammer clean, +2000), **Roof
  Hopper** (the station roof and the refuge roof, +1800), **Pillow Talk** (Left Ledges → Pillow Stacks,
  +1200). Progress ticks show in the chain area; a crash resets it.
- **Line chain** (physics/flow.js): every scored move keeps the chain alive; the multiplier grows ×0.25 per
  *different* move (repeats count half) up to ×5; the chain banks as a **Line ×N** bonus 3.2 s after the last
  move on the snow (the air keeps it alive) and is lost on a crash.
- **Flow meter → SEND IT**: filled by landed tricks, drops, perfect landings, close shaves and speed over
  24 m/s; drains slowly when idle. Full → the **SEND IT** state for 9 s (+1.6 s per landed trick, up to
  20 s): +10 % top speed, +20 % pop, +15 % spin/flip rate, +25 % landing tolerance, ×2 trick points, and tucking gives a little SSX-style
  boost (1.8 m/s² of thrust); the
  music lifts (the upbeat track), a FoV kick and shake, an orange vignette, the suit's trims flare, a rumble.
- **Run summary** at the valley (zen runs): time, average / top speed, biggest drop, longest air, best line,
  score, the named features linked and the line goals completed, and a **judged score out of 100** like the
  Freeride World Tour — Line (biggest drop, real drops, different named features linked), Fluidity,
  Control, Air & Style, 0–25 each. The card keeps a **personal best** per map (judged total, localStorage `sendit.freeride.<map>`)
  and flags a new one.

Game feel at speed: wind roar (noise through a low-pass sweeping 300 Hz → 6 kHz with speed, silent below
16 m/s), the lens opening in the top of the speed range, a continuous speed shake, closer camera with less
lag, the big-air side swing, landing shake scaled by impact, apex slow-mo (lens tightens, wind drops in
pitch), controller rumble building with speed, wind streaks in the corners above 24 m/s.

**Golden snowflakes** (`course.challenge.flakes`, from `course.placeFlakes()`): the game's 12 per-run collectibles
are placed by hand across every line, Steep-style: on the edge of the big lips, where you go over (Band A, First
Stack, the Throne, the Hammer, Station Cliff, Frozen Falls, a bowl wind lip), on the station and refuge roofs, on a spine crest, in
the gorge and on the pillow stacks. They glow, so they double as markers for where the good lips are.

**Drop zones** (Steep-style, `course.dropZones`): keys **1–9** (or the d-pad ◀ ▶) fade you to the top of a
line — 1 Heli Drop, 2 Spine Wall, 3 the Couloir, 4 the Stacks, 5 the Hammer, 6 Station Cliff, 7 the Ravine,
8 Lower Bowl, 9 Pillow Stacks. R / Y still goes back to the heli drop. A hint names the keys a few seconds into a ride.

The heli-drop intro: a small red helicopter hovers off the shoulder (it just dropped you); when the ride
starts it holds a moment, lifts and banks away past the spire with a synthesized rotor sound.

---

## 5. Tunables (where to change what)

| what | where |
|---|---|
| feature placement, heights, widths, buildings, gondola | `maps/ravenspire/layout.js` |
| drop zones, line goals, the canonical lines (glades through the larches, rocks kept off) | `layout.js` (`DROP_ZONES`, `LINE_GOALS`, `RIDE_LINES`); glade width in `course.pisteAt`, rock margins in `course.rockOk` |
| snowflake spots | `course.js` (`placeFlakes()`) |
| chimney smoke, mast, ice falls | `props.js` (`buildSmoke`, `buildMast`, `buildIceFalls`) |
| bench length per metre of cliff (`BENCH_PER_M` = 4), lip shape, rock teeth | `course.js` (`cliff()`, `bands()`) |
| speeds, landings, powder, slow-mo, flow on/off, camera | `maps/ravenspire/tuning.js` |
| flow meter / chain / SEND IT numbers | `physics/flow.js FLOW_DEFAULTS` (or `physics.common.flow` per map) |
| roof snow load, overhang, edge rounding | `structures.js` (`SNOW`, `OVERHANG`, `EDGE`) |

---

## 6. Measurements

### Bot rides (web/scripts/map3-ride.mjs, real Player physics on the map's grid)

Styles: **send** = tucked straight down the line, popping every cliff; **trick** = spins (360+) off every real air, grabs; (also **control** = speed checks above 21 m/s, **carve** = linked turns every 1.5 s). "max" is the top ground speed: 34–39 m/s for a moment after the biggest drops (the fall turns into speed along the 41° landing; `landSpeedCap` puts most of the excess over 34 m/s into the powder); sustained speeds on the big lines are 22–31 m/s.

| line | gear | style | time | avg speed | crashes | stumbles | air total (longest) | biggest drop | judged | line goals |
|---|---|---|---|---|---|---|---|---|---|---|
| The Stacks (cliff into cliff) | ski | send | 103.6 s | 28.1 m/s (63 mph) | 0 | 0 | 23.9 s (5.34 s) | 48 m | 100 | The Classic |
| The Stacks (cliff into cliff) | snowboard | send | 115 s | 25.3 m/s (57 mph) | 0 | 0 | 23.1 s (5.27 s) | 47 m | 100 | The Classic |
| Spine Wall → pillows → ledges | ski | send | 141.5 s | 21.7 m/s (49 mph) | 0 | 0 | 50.3 s (4.85 s) | 35 m | 97 | Pillow Talk |
| Spine Wall → pillows → ledges | snowboard | send | 137.1 s | 22.2 m/s (50 mph) | 0 | 0 | 43.2 s (4.6 s) | 29 m | 97 | Pillow Talk |
| The Ravine | ski | send | 143.2 s | 22.4 m/s (50 mph) | 0 | 2 | 28.5 s (3.75 s) | 19 m | 90 | - |
| The Ravine | snowboard | send | 146.5 s | 22 m/s (49 mph) | 0 | 0 | 25.9 s (3.4 s) | 17 m | 88 | - |
| Station Cliff → roof | ski | send | 119.2 s | 26.2 m/s (59 mph) | 0 | 0 | 24.2 s (4.44 s) | 30 m | 99 | - |
| Station Cliff → roof | snowboard | send | 135.8 s | 22.7 m/s (51 mph) | 0 | 1 | 21.7 s (4.57 s) | 29 m | 98 | Station to Station |
| The Hammer (36 m) | ski | send | 152.2 s | 22.3 m/s (50 mph) | 1 | 0 | 35.1 s (6.04 s) | 51 m | 97 | Hammer Time |
| The Hammer (36 m) | snowboard | send | 140 s | 22.2 m/s (50 mph) | 0 | 1 | 27.8 s (5.25 s) | 28 m | 89 | - |
| Bowl → refuge roof | ski | send | 118.2 s | 26.2 m/s (59 mph) | 0 | 0 | 27.7 s (4.54 s) | 33 m | 99 | - |
| Bowl → refuge roof | snowboard | send | 121.6 s | 24.9 m/s (56 mph) | 0 | 1 | 21.3 s (4.72 s) | 34 m | 98 | - |
| The Stacks (cliff into cliff) | ski | trick | 145.9 s | 20.3 m/s (45 mph) | 0 | 0 | 20.8 s (4.75 s) | 41 m | 96 | The Classic |
| The Stacks (cliff into cliff) | snowboard | trick | 143 s | 20.7 m/s (46 mph) | 0 | 0 | 21.3 s (4.9 s) | 43 m | 96 | The Classic |
| Spine Wall → pillows → ledges | ski | trick | 167.8 s | 17.9 m/s (40 mph) | 0 | 1 | 44.3 s (3.94 s) | 22 m | 88 | Pillow Talk |
| Spine Wall → pillows → ledges | snowboard | trick | 163.4 s | 18.5 m/s (41 mph) | 0 | 0 | 47.1 s (3.9 s) | 22 m | 90 | Pillow Talk |
| The Ravine | ski | trick | 180.4 s | 17.8 m/s (40 mph) | 0 | 1 | 22.2 s (4.72 s) | 13 m | 75 | - |
| The Ravine | snowboard | trick | 176.7 s | 18.1 m/s (40 mph) | 0 | 0 | 24.2 s (3.72 s) | 16 m | 89 | Into the Gorge |
| Station Cliff → roof | ski | trick | 166.6 s | 19 m/s (43 mph) | 0 | 0 | 21.6 s (4.5 s) | 28 m | 95 | Station to Station |
| Station Cliff → roof | snowboard | trick | 161.4 s | 19.4 m/s (43 mph) | 0 | 0 | 21.3 s (4.84 s) | 32 m | 95 | Station to Station |
| The Hammer (36 m) | ski | trick | 180.5 s | 17.9 m/s (40 mph) | 0 | 0 | 27.9 s (6.57 s) | 49 m | 93 | Hammer Time |
| The Hammer (36 m) | snowboard | trick | 171.8 s | 18.7 m/s (42 mph) | 0 | 1 | 22.4 s (4.97 s) | 19 m | 78 | - |
| Bowl → refuge roof | ski | trick | 151.5 s | 20 m/s (45 mph) | 0 | 0 | 19.2 s (4.4 s) | 31 m | 94 | - |
| Bowl → refuge roof | snowboard | trick | 149.5 s | 20.4 m/s (46 mph) | 0 | 0 | 17.1 s (4.45 s) | 32 m | 94 | - |

All 24 runs reach the valley — ridden through the real forest and rocks (`OBSTACLES=`, below). The one crash
is the Hammer sent with a full pop (a 6 s air: by design, roll it). Control style (12 more runs, speed checks
above 21 m/s): all finish, 0 crashes, 5 stumbles, 16.4–18.0 m/s average. Carve style (12 runs, linked turns
every 1.5 s): all finish, 2 stumbles, 2 crashes — a wide turn into the couloir wall and one into the station's side
wall. Every drop zone rides cleanly: 9 zones × 2 gears, the first 200 m from each with the control bot, no
crashes (a stumble off Station Cliff).

**With the real forest.** The headless bots normally ride without trees (scatter is browser-only); with
`OBSTACLES=<dump>` (web/scripts/map3-obstacles.mjs) they ride the browser's actual 8,800 larches, 1,570 rocks
and the gondola towers. The first such run found a minefield: random rock clusters in the couloir throat and on
the upper lines, and larches across every runout (bots crashed 3–7 times per run). Now the canonical lines
(`RIDE_LINES` in layout.js) run through 16–32 m wandering glades in the larches (`pisteAt`), and rock clusters stay
off the lines, the drop zones and the ravine floor (`rockOk`, an opt-in hook in scatter.js). Every number in
the table above is ridden through the real forest this way.

**End to end in the real game** (web/scripts/map3-e2e.mjs: the dev server, the GPU, the real forest, a scripted
rider at ~20 m/s from the heli drop to the valley): The Stacks on skis — The Classic, judged 93, no crash; the
Ravine on a board — Into the Gorge, judged 80, no crash; Station Cliff on skis — Station to Station, judged
84–91; no console errors in any run.

### Terminal speeds (web/scripts/map3-speeds.mjs: 60 s straight down a powder plane)

| | 20° | 27° | 34° | 41° | 45° |
|---|---|---|---|---|---|
| ski, tucked | 23.7 m/s (53 mph) | 27.5 (62) | 29.3 (66) | 30.6 (68) | 31.2 (70) |
| ski, upright | 16.8 (38) | 19.9 (44) | 22.4 (50) | 24.5 (55) | 25.5 (57) |
| snowboard, crouched | 21.2 (48) | 24.9 (56) | 27.3 (61) | 28.7 (64) | 29.4 (66) |
| snowboard, upright | 17.2 (39) | 20.2 (45) | 22.6 (51) | 24.7 (55) | 25.7 (57) |
| *defaults (Valcrest), ski tucked* | *18.7 (42)* | *20.2 (45)* | *21.3 (48)* | *22.2 (50)* | *22.6 (51)* |

So the big lines run at 50–70 mph tucked and 40–57 mph standing up; Valcrest's own physics is unchanged.

### Buildings (web/scripts/map3-structures.mjs) — all pass on skis and snowboard

slow into a wall: bounced, not on the roof · fast into a wall: knocked down · grazing a wall at 12°: slides
past keeping speed · off the Station Cliff onto the roof: clean landing (impact ≈ 2.5 m/s), off the eave ·
up the drift onto the roof and off the eave · the refuge chimney is solid.

### Valcrest unchanged

Every physics bench (physics-sim, -scenarios, -tricks, -kicker, -variants, -fuzz, physics-course
park / flip / straight, equipment-check) prints byte-identical output before and after this work
(compared against a `git archive` of the base commit). The non-physics extras are opt-in too: the wind roar layer
(`windRoar`), the grab-tweak pose (`trickStyle`), the flow HUD and sounds (`flow`) only exist on maps that set them. `unittest.mjs`: 13/13; `lobbytest.mjs` (GPU): all
checks passed.

### Performance

GPU time per frame (EXT_disjoint_timer_query around the whole composer render: shadow map, scene, every post
pass) at 1600×900 on the integrated Intel Arc 130V, production build (`vite build` + `vite preview`), the
rider placed at six spots down each map's course path and riding. `node web/scripts/map3-perf.mjs <url> 1600 900
0,1,2 90 <map>`; each spot is the quietest of three windows, and the table keeps the minimum over the runs
(other sessions were using the GPU; contention only ever adds time).

| map | quality | GPU avg / worst spot (ms) | per spot (2 / 20 / 38 / 55 / 62 / 80 % down the run) | draws | triangles | runs |
|---|---|---|---|---|---|---|
| valcrest-gully | 0 | 9.1 / 9.7 | 9.4 / 9.4 / 8.6 / 9.7 / 8.8 / 8.5 | 160–370 | 1.9–2.1 M | 1 |
| valcrest-gully | 1 | 10.5 / 12.8 | 12.8 / 11.8 / 9.8 / 9.0 / 9.9 / 9.5 | 167–384 | 2.4–2.8 M | 3 |
| valcrest-gully | 2 | 16.8 / 20.1 | 20.1 / 19.4 / 16.1 / 14.7 / 14.6 / 15.7 | 184–400 | 2.9–3.4 M | 1 |
| ravenspire | 0 | 9.0 / 9.7 | 8.3 / 8.7 / 9.4 / 9.1 / 8.8 / 9.7 | 174–445 | 1.3–1.4 M | 1 |
| ravenspire | 1 | 9.3 / 11.2 | 8.6 / 8.4 / 8.7 / 8.9 / 10.1 / 11.2 | 176–488 | 1.6–1.9 M | 4 |
| ravenspire | 2 | 16.4 / 18.0 | 16.9 / 15.6 / 15.7 / 16.0 / 16.0 / 18.0 | 194–515 | 2.0–2.5 M | 1 |

Measured on Oct 16 around midnight, both maps back to back in the same session (the absolute numbers move with
the GPU's clock state between sessions — an earlier session measured q1 at 12.9 / 12.7 ms average for
Ravenspire / Valcrest — but the two maps always track each other within about 1 ms).

Ravenspire costs the same as Valcrest at every quality: at quality 1 (the default) it averages ~9–11 ms with
its worst spot (the larch forest low on the run, 80 %) at ~11–13 ms, inside the 14–16 ms target. What it took:
the wild map draws fewer triangles than Valcrest (no park, no crowds, no fences; 1.6–1.9 M vs 2.4–2.8 M at
quality 1), and the larch forest is capped at 9,000 trees (`course.spawn.treeStep` 9.5 / `treeMax` 9000) — the
first build scattered 16,300 trees and measured ~14–15 ms with spikes. The props added since (smoke: one
instanced draw; mast, ice falls: a few draws) don't move the numbers. Draw calls peak at the summit (~490, the
whole valley in view: mid-ring chunks, far ranges) and fall to ~175 low down. CPU per frame stays 2–3 ms
(Valcrest 4–7 ms: its crowds and lifts). Terrain generation at boot takes ~4.5 s (node), boot to riding ~6–9 s.

---

## 7. Known issues and ideas

- **GPU timing on this machine is noisy**: other sessions shared the GPU while this was built, so the
  perf numbers above are the quietest of several interleaved windows (contention only adds time). Re-measure
  on an idle machine with `node web/scripts/map3-perf.mjs` against a production build (`vite build` +
  `vite preview`) — a dev server reloads the page on every source edit and spoils long runs.
- **Peak ground speed** right after the biggest drops still touches 34–39 m/s (the fall turns into speed along
  the 41° landing; `landSpeedCap` cuts the excess over 34 m/s to 35 %) and bleeds off within a second.
- **Popping in the upper ravine** at full tuck (where the gorge deepens faster than the face) gives 3–4 s airs
  that usually land as a stumble; ride it without popping, or check speed.
- **Spine crests launch you at speed** (by design: crossing a 13 m spine diagonally at 30 m/s is a kicker).
  Ride a sluff channel or slow down to slash them.
- **Slow motion** scales the physics only; snow spray and other particles keep real time.
- **Roof snow** shows no tracks (the track map is drawn on the terrain only); cornices are visual only.
- **Gondola cables** are visual (towers collide); the helicopter is decorative and its rotor sound is not
  positional.
- **Flow layer, landing grades, drops, drop zones, run summary** are opt-in per map; Valcrest keeps its
  original scoring (by design, so its feel is unchanged). They could be switched on for other maps through
  `physics.common.flow` / `course.dropZones`.
- **Challenge mode** works (gates along the hero line, medals at 24 / 20 / 16 m/s average) but slalom gates on
  a 41° face are an odd fit; the zen-mode line goals (§4) are the better freeride challenge — a timed
  "line challenge" mode built on them would be the next step.
- The lobby UI, ui.js and main.js were not touched: the flow HUD is its own overlay (`flowhud.js`), and the
  physics hook is applied from the Player constructor, so no boot-code change was needed.

Ideas: a timed challenge built on the line goals, sluff and small slab slides on the Spine Wall, a replay
camera for the biggest air of a run, binocular-style unlocks for the drop zones.
