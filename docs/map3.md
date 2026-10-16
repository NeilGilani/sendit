# Map 3: Ravenspire — big-mountain freeride

An isolated big-mountain face in the spirit of Steep: you are dropped by helicopter on a shoulder under a
430 m horn and ride 1,670 m of vertical to the valley — stacked cliff bands (cliff into cliff), a spine
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
| 990 / 1160 / 1330 | **the Stacks** | 41° landings, ~30° benches | three bands 170 m apart: the **First Stack** (11–19 m), **the Throne** (13–28 m, peak at v ≈ −40), the **Last Stack** (9–19 m) — cliff into cliff; **Left Ledges** (u 1150), **East Ledges** (u 1185) |
| 1418 | **Station Cliff** | | 15–19 m band above the **Old Lift Station** (roof rideable) |
| 1400…1700 | apron | 34° | the station, the abandoned gondola line, **Lower Steps** |
| 1560…1800 | **pillow stacks** (left) | 27° base | terraced pillows: flat-ish tops, ~4 m rounded drops |
| 1700…2100 | lower bowl | 27° → 19° | wind lips and rollers, the **Corvo Refuge** (rideable roof, stone chimney), larches |
| 2100…2540 | runout | 10° → 5° | A-frame cabins, the **Valley Station**; **run complete at u = 2540** |
| 400…2180 | **the Ravine** (right, v ≈ 340–480) | 41° → 25° | couloir entrance, up to 54 m deep, rock walls and quarter-pipe banks, frozen ledges (4–6 m), bends around the station's knoll |

### Best lines (bot numbers in §6)

1. **The Stacks** — straight down the middle (v ≈ −40): Band A, then the First Stack, the Throne (its biggest
   section is ~28 m) and the Last Stack, each a 30° bench, a rounded rock-toothed lip and a 41° landing. The
   signature cliff-into-cliff line.
2. **Spine Wall → pillows → Left Ledges** — slash the spines (or ride a sluff channel), the West Ledges, then
   the terraced pillow stacks on the apron.
3. **The Ravine** — drop the couloir at u ≈ 330, ride the gorge (quarter-pipe walls, frozen ledges) past the
   station knoll to the lower bowl.
4. **Station Cliff → roof** — hit the Station Cliff at ~18–25 m/s: you land on the old lift station's long
   snowy roof and air off its downhill eave. Slower: land short, ride the drift ramp onto the roof.
5. **The Hammer** — the 36 m cliff on the far right; landable on its steep apron, but expect a stumble
   unless you roll it (no pop) and land straight.
6. **Bowl → refuge roof** — the open bowl, wind lips, then over the Corvo Refuge's ridge, down its roof and off
   the eave, through the larches to the A-frames.

### Buildings

| building | where | roof | ride it |
|---|---|---|---|
| Old Lift Station ("Mittelstation") | u 1497, v 288 | mono-pitch, 30°, 37 × 19 m | land on it off the Station Cliff, or ride the drift onto it; 7 m drop off the eave |
| Corvo Refuge | u 1880, v −175 | gable, 33° (ridge across the fall line) | the drift reaches 85 % up the uphill slab: over the ridge, down the slab, 7 m off the eave; stone chimney is solid |
| A-frames × 3 | u ≈ 2290, v 120–205 | 56° slabs | drifted on the uphill side; steep slab landings |
| Valley Station ("Talstation") | u 2400, v 300 | gable, 26° | low roof at the bottom of the gondola |
| abandoned gondola | station → valley station | | 6 rusty leaning towers (collision), sagging haul ropes, two forgotten cabins |

Walls are solid: a glancing touch slides along the wall (no snagging — a Steep complaint), a square hit
faster than 9 m/s knocks you down. Snow on every roof is the rideable surface itself (the roof snow mesh
is sampled from the same function the physics uses).

---

## 2. Code

```
web/src/maps/ravenspire/
  index.js       registerMap (id 'ravenspire', order 3), thumbnail (inline SVG), lobby spot; loads props.js lazily
  layout.js      every feature in one place: profile, face width, BANDS, SPINES, PILLOWS, RAVINE, HITS,
                 BUILDINGS, GONDOLA, BUTTRESSES (tunables)
  course.js      RavenspireCourse: the height function, tile generation (heights, normals, rock + packed
                 snow splat, far grid), Course-compatible interface, features hooks, scatter hooks
  structures.js  Structure: roof surface (mono / gable / A-frame + snow load), walls (block test), drifts
  props.js       meshes: weathered buildings, boarded windows, signs, chimneys, bull wheels, the gondola,
                 the helicopter (animated in onBeforeRender)
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
- **Spines** — a triangle wave across the fall line with sharp crests and rounded sluff channels.
- **Cliff bands** (`cliff(u, uc, h, L)`) — above the lip a bench of length `L = max(bench, 4·h)` raises the
  terrain by `h · t^1.25`, so the approach flattens steadily toward the lip (lip ≈ 30°, never a kicker); the
  face drops `h` over `max(1.4, 0.11·h)` m onto the unchanged 41° landing. Height varies across the band
  (noise, a peak, tapered ends, ramp-around gaps); a soft rounded snow lip; rock teeth on the lip mark the
  edge from above.
- **Pillows** — terraced: every `step` m the slope pauses (flat top), rolls over and drops over the last
  40 % of the step; wavy across the field, broken into rounded lobes.
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
| scatter.js | `spawn: {...}` (SPAWN overrides), `forestAt / pisteAt / treeline` | fewer, smaller boulders on the face; larches only low, clearings around buildings and under the gondola |
| activities.js | `challenge: { medalSpeeds }` | medal speeds for a fast map (24 / 20 / 16 m/s) |
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
| `trickStyle` | false | Tail grab / Truck driver on skis, "Tweaked" grabs (+50 % grab points) |
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
| `hardLanding` / `crashImpact` | 16 / 24 m/s (after absorption) | the Hammer stumbles unless rolled and straight |
| `landYawSpeed` | [18, 32, 0.75] | sideways landings at speed are less forgiving |
| `landClean` / `landStumble` | 18° / 32° ski (crash 40°), 18° / 46° board | |
| pop, spin, flip | popMax 4.2 / 4.6, spinRateMax 7.2 / 8.2, flipRateMax 6.0 / 6.2 | bigger tricks for bigger air |
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
- **Drops**: the greatest height above the snow in an air (≥ 6 m) scores `12/m` (+10/m beyond 15 m).
- **Line chain** (physics/flow.js): every scored move keeps the chain alive; the multiplier grows ×0.25 per
  *different* move (repeats count half) up to ×5; the chain banks as a **Line ×N** bonus 3.2 s after the last
  move on the snow (the air keeps it alive) and is lost on a crash.
- **Flow meter → SEND IT**: filled by landed tricks, drops, perfect landings, close shaves and speed over
  24 m/s; drains slowly when idle. Full → the **SEND IT** state for 9 s (+1.6 s per landed trick, up to
  20 s): +10 % top speed, +20 % pop, +15 % spin/flip rate, +25 % landing tolerance, ×2 trick points, and tucking gives a little SSX-style
  boost (1.8 m/s² of thrust); the
  music lifts (the upbeat track), a FoV kick and shake, an orange vignette, the suit's trims flare, a rumble.
- **Run summary** at the valley (zen runs): time, average / top speed, biggest drop, longest air, best line,
  score, and a **judged score out of 100** like the Freeride World Tour — Line, Fluidity, Control,
  Air & Style, 0–25 each.

Game feel at speed: wind roar (noise through a low-pass sweeping 300 Hz → 6 kHz with speed, silent below
16 m/s), the lens opening in the top of the speed range, a continuous speed shake, closer camera with less
lag, the big-air side swing, landing shake scaled by impact, apex slow-mo (lens tightens, wind drops in
pitch), controller rumble building with speed, wind streaks in the corners above 24 m/s.

**Drop zones** (Steep-style, `course.dropZones`): keys **1–8** (or the d-pad ◀ ▶) fade you to the top of a
line — 1 Heli Drop, 2 Spine Wall, 3 the Couloir, 4 the Stacks, 5 the Hammer, 6 Station Cliff, 7 the Ravine,
8 Lower Bowl. R / Y still goes back to the heli drop. A hint names the keys a few seconds into a ride.

The heli-drop intro: a small red helicopter hovers off the shoulder (it just dropped you); when the ride
starts it holds a moment, lifts and banks away past the spire with a synthesized rotor sound.

---

## 5. Tunables (where to change what)

| what | where |
|---|---|
| feature placement, heights, widths, buildings, gondola | `maps/ravenspire/layout.js` |
| bench length per metre of cliff (`BENCH_PER_M` = 4), lip shape, rock teeth | `course.js` (`cliff()`, `bands()`) |
| speeds, landings, powder, slow-mo, flow on/off, camera | `maps/ravenspire/tuning.js` |
| flow meter / chain / SEND IT numbers | `physics/flow.js FLOW_DEFAULTS` (or `physics.common.flow` per map) |
| roof snow load, overhang, edge rounding | `structures.js` (`SNOW`, `OVERHANG`, `EDGE`) |

---

## 6. Measurements

### Bot rides (web/scripts/map3-ride.mjs, real Player physics on the map's grid)

Styles: **send** = tucked straight down the line, popping every cliff; **trick** = spins (360+) off every real air, grabs; (also **control** = speed checks above 21 m/s, **carve** = linked turns every 1.5 s). "max" ground speeds of 45–57 m/s happen for a moment after the biggest drops (the fall turns into speed along the 41° landing) and bleed off within about a second; sustained speeds on the big lines are 22–31 m/s.

| line | gear | style | result | time | avg speed | crashes | stumbles | air total (longest) | biggest drop | judged |
|---|---|---|---|---|---|---|---|---|---|---|
| The Stacks (cliff into cliff) | ski | send | finished | 131.2 s | 25.7 m/s (57 mph) | 1 | 1 | 32.2 s (5.07 s) | 26 m | 89 |
| The Stacks (cliff into cliff) | snowboard | send | finished | 120.1 s | 24.4 m/s (55 mph) | 0 | 1 | 22.6 s (5.1 s) | 26 m | 93 |
| Spine Wall → pillows → ledges | ski | send | finished | 140 s | 21.8 m/s (49 mph) | 0 | 0 | 46.1 s (4.6 s) | 28 m | 97 |
| Spine Wall → pillows → ledges | snowboard | send | finished | 149.6 s | 20.6 m/s (46 mph) | 0 | 2 | 48.8 s (5.74 s) | 33 m | 93 |
| The Ravine | ski | send | finished | 147.6 s | 21.8 m/s (49 mph) | 0 | 6 | 25.4 s (3.54 s) | 18 m | 73 |
| The Ravine | snowboard | send | finished | 172.2 s | 20 m/s (45 mph) | 1 | 8 | 27.5 s (3.39 s) | 17 m | 61 |
| Station Cliff → roof | ski | send | finished | 146.8 s | 22.7 m/s (51 mph) | 1 | 2 | 21.3 s (4.39 s) | 29 m | 84 |
| Station Cliff → roof | snowboard | send | finished | 142.4 s | 22.1 m/s (49 mph) | 0 | 6 | 16.2 s (4.1 s) | 24 m | 71 |
| The Hammer (36 m) | ski | send | finished | 143.7 s | 22.4 m/s (50 mph) | 0 | 2 | 29.8 s (5.75 s) | 21 m | 84 |
| The Hammer (36 m) | snowboard | send | finished | 150.1 s | 21.6 m/s (48 mph) | 0 | 1 | 28.9 s (5.15 s) | 28 m | 89 |
| Bowl → refuge roof | ski | send | finished | 126.7 s | 24.3 m/s (54 mph) | 0 | 4 | 24.6 s (5.32 s) | 4 m | 56 |
| Bowl → refuge roof | snowboard | send | finished | 127.9 s | 24 m/s (54 mph) | 0 | 2 | 19.1 s (4.7 s) | 34 m | 91 |
| The Stacks (cliff into cliff) | ski | trick | finished | 146.7 s | 20.1 m/s (45 mph) | 0 | 1 | 20.9 s (4.8 s) | 23 m | 81 |
| The Stacks (cliff into cliff) | snowboard | trick | finished | 143.3 s | 20.5 m/s (46 mph) | 0 | 0 | 21.5 s (4.92 s) | 43 m | 96 |
| Spine Wall → pillows → ledges | ski | trick | finished | 169.4 s | 17.6 m/s (39 mph) | 0 | 1 | 43.4 s (5.15 s) | 23 m | 87 |
| Spine Wall → pillows → ledges | snowboard | trick | finished | 172.1 s | 17.9 m/s (40 mph) | 0 | 4 | 46.4 s (3.85 s) | 22 m | 81 |
| The Ravine | ski | trick | finished | 183 s | 17.6 m/s (39 mph) | 0 | 3 | 26 s (4.05 s) | 31 m | 88 |
| The Ravine | snowboard | trick | finished | 179.3 s | 18 m/s (40 mph) | 0 | 1 | 26 s (3.19 s) | 18 m | 88 |
| Station Cliff → roof | ski | trick | finished | 170.1 s | 18.8 m/s (42 mph) | 0 | 2 | 16.7 s (4.37 s) | 27 m | 72 |
| Station Cliff → roof | snowboard | trick | finished | 165.8 s | 19.3 m/s (43 mph) | 0 | 1 | 18.1 s (4.44 s) | 28 m | 75 |
| The Hammer (36 m) | ski | trick | finished | 182.3 s | 18 m/s (40 mph) | 0 | 1 | 23.6 s (4.84 s) | 20 m | 75 |
| The Hammer (36 m) | snowboard | trick | finished | 177.6 s | 18.4 m/s (41 mph) | 0 | 1 | 23.7 s (4.92 s) | 21 m | 76 |
| Bowl → refuge roof | ski | trick | finished | 154.5 s | 19.9 m/s (45 mph) | 0 | 0 | 14.8 s (4.44 s) | 31 m | 85 |
| Bowl → refuge roof | snowboard | trick | finished | 151.5 s | 20.3 m/s (45 mph) | 0 | 0 | 15.7 s (4.44 s) | 32 m | 86 |

All 24 runs reach the valley. Carve style: 16–17 m/s average with no crashes (linked short turns scrub speed). Every drop zone starts cleanly (8 zones × 2 gears, 8 s straight-line from each).

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
(compared against a `git archive` of the base commit). `unittest.mjs`: 13/13; `lobbytest.mjs` (GPU): all
checks passed.

### Performance

PERF_TABLE

---

## 7. Known issues and ideas

- **GPU timing on this machine is noisy**: other sessions shared the GPU while this was built, so the
  perf numbers above are the quietest of several interleaved windows (contention only adds time). Re-measure
  on an idle machine with `node web/scripts/map3-perf.mjs` against a production build (`vite build` +
  `vite preview`) — a dev server reloads the page on every source edit and spoils long runs.
- **Peak ground speed** right after the biggest drops reaches 45–57 m/s for about a second (the fall turns
  into speed along the 41° landing; powder scrubs part of it). Physically right, but the speedometer spikes.
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
  a 41° face are an odd fit; a Steep-style "line challenge" (pass named features in order) would suit better.
- The lobby UI, ui.js and main.js were not touched: the flow HUD is its own overlay (`flowhud.js`), and the
  physics hook is applied from the Player constructor, so no boot-code change was needed.

Ideas: a "line challenge" mode (hit the Stacks, the Throne and the station roof in one run), sluff and small
slab slides on the Spine Wall, ravens circling the spire, a replay camera for the biggest air of a run.
