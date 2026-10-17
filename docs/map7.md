# Map 7: Fjordline — Norwegian ski-to-sea at golden hour

A coastal massif in the spirit of the Lyngen Alps and Sunnmørsalpane: you stand on the summit col under
**Skarvtinden**, a Slogen-style pyramid, with a deep blue fjord 1,387 m straight below. Six trails come down to it:
a narrow couloir through the summit rock, a spine face, a headland of cliff steps running out to a lighthouse, a
long shoulder of big rollers, a village jump line over red-cabin roofs and a boathouse, and an easy way down.
Every one of them ends at the water's edge: the quay of **Skarvvika** harbour, the Sandvika beach with its stockfish
racks, or the lighthouse on Kvalneset. Ride into the fjord and you splash and wash up on the beach. The light is a
low Arctic sun from the south-east (11°): long blue shadows, warm lit faces, a glitter path on the water.

What makes it different from Ravenspire: the goal is always in view (the fjord fills the bottom of every frame
from the col down), the lines are *named terrain you can see from the sea* (a couloir in a rock band, a headland
ridge, a shoulder), the bottom is a living village with rideable roofs and a harbour finish instead of a valley
runout, and the light is golden hour instead of high noon.

```
npm --prefix web run dev -- --port 5196 --strictPort
http://localhost:5196/?map=fjordline&ride                    straight into a ride (the lobby lists it under Skarvtinden)
http://localhost:5196/?map=fjordline&trail=kvalneset&ride    a trail's top (skaret, kvalneset, solvryggen, fjordlopa, brygga, sjosiden)
node web/scripts/map7-ride.mjs both all send --check         bot rides every trail on skis and snowboard (styles: send, carve, trick, control)
node web/scripts/map7-unit.mjs                               contracts, terrain, roofs / decks / walls, water, runCompleted (69 checks)
node web/scripts/map7-fuzz.mjs 40 40                         random inputs from random starts (face, roofs, decks, into the fjord)
node web/scripts/map7-e2e.mjs http://localhost:5196          in the real game: trail start, splash + fade + dry respawn, one runCompleted per finish
node web/scripts/map7-shots.mjs http://localhost:5196 <dir> all 1600 900    GPU screenshots of fixed views
node web/scripts/map3-perf.mjs http://localhost:5196 1600 900 1 60 fjordline
node web/scripts/gfxpopin.mjs http://localhost:5196 fjordline 1 25
```

Research behind the design: [docs/map7-research.md](map7-research.md).

---

## 1. The mountain

Local frame (as Ravenspire): **u** = metres down the fall line from the summit col (world x = −1380 + u; the
mountain falls toward +x, east, onto the fjord), **v** = metres across it (world z, + = skier's right looking
downhill). The fjord surface is world y = 1850 (`SEA`), so the valley haze sits on the water as a thin sea haze.

| u (m) | zone | slope | what is there |
|---|---|---|---|
| −300…0 | **Skarvtinden** | rock | the summit pyramid (+470 m over the col), its north shoulder, Kvaltinden at the headland's root, a cairn on the col |
| 0…60 | the col + rollover | 12° → 30° | the Skaret drop zone (default spawn) |
| 60…540 | upper cirque | 42° | **Skaret** (right), open face, **Ramnaryggen** buttress, **Ramnaberget** band, **Sølvryggene** spines (left), rock walls on the rims |
| 540…920 | mid face | 38° | **Ørneredet** (Eagle's Nest, 10–16 m band with a 16 m nest straight below the couloir), **Kråkesteget**, **Ytre Hammaren**, the **Kvalryggen** buttress, the headland ridge begins |
| 920…1360 | lower face | 32° | **Hammaren** (12–20 m band, peak at v −30), wind lips, **Trollveggen** and **Sjøsteget** off the lines, rock outcrops |
| 1360…1780 | the apron | 25° | **Bølgene**: five big wandering rollers across the whole slope |
| 1780…2140 | birch line | 18° | **Bjørkehoppet** kickers, sparse trees with glades along the lines |
| 2140…2390 | the village | 11° → 5° | **Kjøpmannshuset**, **Bakeriet**, **Postkontoret** (the roof-hop row), the school, the prayer house, the old smithy, Fiskarheimen |
| 2380…2470 | beach + harbour | 4° → 0° | **Naustgapet** (the boathouse), the quay (**Brygga**) with the MÅL · FINISH arch at u 2430, the pier (**Kaia**) 86 m into the fjord, five rorbuer and the sjøhus on stilts, two sjark at the pier, færinger on the Sandvika beach, four hjell racks, sea ice floes along the shore |
| 2470… | **the fjord** | | 60 m deep, ~4 km across; the far shore's range rises straight out of the water (the big one is SEA + 1830 m) |
| left, v ≈ −1080 → −640 | **Fjordryggen** (the shoulder) | 29° → 5° | its own profile from a sub-summit (1,105 m), twelve wandering rollers on the crest, swinging into the bay at Sandvika |
| right, v ≈ 470 → 690 | **Kvalneset** (the headland) | 32° → 3° | a ridge from the cirque's right rim out to a point 30 m over the fjord: **Trappa I** (9 m), **II** (12 m), **III** (13 m), **Neskanten** (15 m), the lighthouse, then a sea cliff |

### The trails (registry `trails`, `course.trailSpawn` / `trailFinish`)

| trail | difficulty | length / vertical | the line |
|---|---|---|---|
| **Skaret** | double-black | 3,000 m / 1,445 m | the hero couloir: 42–45°, 20 m wide with ≥ 30 m rock walls, a 9 m choke at u 312 and an ice **Chokestone** (4 m) at u 352, spat straight onto **Ørneredet**'s nest, then **Hammaren**, the rollers, the village and the quay |
| **Kvalneset** | double-black | 2,580 m / 975 m | the headland crest above the fjord and its stairs (Trappa I–III, Neskanten) onto the point; the lighthouse is its finish, past it the sea cliff |
| **Sølvryggene** | black | 2,830 m / 1,335 m | the silver spines (12 m spines, 27 m apart), **Kråkesteget**, a wind lip, **Bjørkehoppet** in the birches, the village to the quay |
| **Fjordløypa** | blue | 3,040 m / 1,105 m | top to sea on the shoulder: twelve big rollers (fly them or absorb them), a sweep into the bay past the drying racks |
| **Brygga** | park | 975 m / 265 m | from the rollers: Bølgene, Bjørkehoppet, a roof-hop over three houses (ride the shovelled ramp up the uphill slab, air off the ridge) and **Naustgapet**, the boathouse gap onto the quay |
| **Sjøsiden** | green | 710 m / 135 m | through the birches and the village lanes to the harbour |

They interconnect: Skaret and the open face meet at Ørneredet; Skaret, Sølvryggene and Brygga share the rollers and
the birch kickers; the cruiser and the green trail meet at Sandvika and the quay; the headland can be left down its
bay flank to the beach. Drop zones (keys 1–9, d-pad ◀ ▶): the six trail tops, then **Ørneredet**, **Hammaren**,
**Bølgene**.

**Finish.** `trailFinish(id)` returns the `{ progress }` form: every trail finishes on reaching the coast.
`course.progress(x, z)` is metres of u normalised so the bay (u 2470), Sandvika (2530) and the point (2830) all
finish at `FINISH_U` = 2430 (the quay's arch; the lighthouse on the point). So a rider who strays to another beach is
never left without a finish. The returned `at` is the trail's own finish spot (quay / Sandvika / lighthouse).
After the line the quay is a run-out (−0.9/s speed), so you stop on the timber instead of in the water.

**The water.** Ground under the sea is ≥ 1.5 m below the surface; when a rider's ground is below the sea and the
rider is at the surface (`course.onPlayer` wraps `player.step`): **SPLASH** (`fjordSplash` event, a white crown and
ring on the water, a hint), then a fade back onto the nearest dry beach up the fall line, facing the quay. Off the
end of the pier, off the headland's sea cliff, into the harbour after the finish: all handled the same way (after
the finish, the main loop's reset to the top wins).

### Buildings and decks (structures.js — a copy of Ravenspire's Structure with ramps and stilts)

| what | where | ride it |
|---|---|---|
| Kjøpmannshuset / Bakeriet / Postkontoret | u 2205 / 2262 / 2318, v ≈ −110 | gable roofs, ridge across the fall line, 26–28°: a 6 m wide **shovelled ramp** (`ramp`, not a wall-wide drift) up to 62 % of the uphill slab; air off the ridge onto the downhill slab or past the eave |
| Naustgapet (the boathouse) | u 2400, v −110, tarred | the ramp reaches 92 % of the uphill slab: air off the ridge over the beach onto the quay |
| school, prayer house, smithy, Fiskarheimen | around the lanes | no drifts: the painted walls show, roofs rideable if you get up there |
| rorbuer ×5, sjøhuset | u ≈ 2460, v 48–200 | on 2.2 m stilts half over the water (their ground is the floor, never the seabed) |
| Brygga (the quay), Kaia (the pier) | u 2448–2476 / 2466–2556 | flat timber decks at SEA + 2.0 (`Deck`): rideable, no walls; jump off the pier end = Kaihoppet → splash |
| lighthouse, flag pole, cairn, hjell racks | | collision circles (`course.obstacles`) |

Walls are solid (a glancing touch slides, square at > 9 m/s knocks you down). Roof snow is the rideable surface
itself (the props sample the same function the physics uses).

---

## 2. Code

```
web/src/maps/fjordline/
  index.js       registerMap (id 'fjordline', order 7): mountain card (Skarvtinden · Lyngen, Troms), trails (static),
                 thumbnail (inline SVG), lobby spot (on the beach by the quay, looking out over the pier and the
                 fjord); loads course.js and props.js lazily
  layout.js      every feature: profiles (face, shoulder), cirque, couloir, bands, spines, buttresses, hits, shoulder
                 rollers, headland, coast, buildings, harbour, drop zones, trails, line goals, ride lines
  course.js      FjordlineCourse: height function, tile generation, Course-compatible interface, features hooks,
                 scatter hooks, trails, the rider hooks (water, finish run-out, runCompleted)
  structures.js  Structure (roof surface / walls / drift, + shovelled ramps), Deck (quay, pier)
  props.js       the fjord water shader, sea ice, village meshes (merged per material), harbour, boats, hjell,
                 lighthouse, finish arch, flag, cairn, splash
  tuning.js      FJORDLINE_PHYSICS, FJORDLINE_CAMERA, FJORDLINE_ATMOSPHERE
  noise.js       a copy of Ravenspire's noise kit
web/src/maps/builtin.js        one line: import './fjordline/index.js';
web/scripts/map7-ride.mjs      trail bot (exports makeTerrain / ride for the fuzz)
web/scripts/map7-unit.mjs      unit checks
web/scripts/map7-fuzz.mjs      fuzz
web/scripts/map7-shots.mjs     GPU screenshots of fixed views
```

No shared file is touched. Everything goes through existing opt-in course hooks: `physics` / `camera` /
`atmosphere`, `park: false`, `life`, `spawn`, `forestAt` / `pisteAt` / `treeline`, `rockOk`, `corniceOk`,
`heightAt` / `blockAt`, `featureAt` / `roofAt`, `lineGoals`, `dropZones`, `challenge.{medalSpeeds, flakes, gates}`,
`edgeHint`, `buildProps`, `obstacles`, `water`, `onPlayer`, plus the trails contract (`mountain`, `trails`,
`trailSpawn`, `trailFinish`).

### The height function

`macro(x, z)` (everywhere, also the mid ring and the 30 km backdrop):

- **Face** = the fall-line profile (12° col, 30° rollover, 42° / 38° / 32° face, 25° apron, 18° birches, 11° / 5°
  village, a 4° beach down to the quay), shifted so it lands exactly on the beach (SEA + 1.2 m), plus the **cirque** cross-section:
  a bowl between the left rim (v ≈ −720) and the headland's root, rims that wander, rock walls ringing the upper
  cirque; outside the left rim a steep rocky flank down to the shoulder.
- **Shoulder** (Fjordryggen) = its own profile (29° → 5°, rising behind its top into the summit massif) as a crowned
  ridge, `smax`'d with the face.
- Wild ranges behind and to the sides; **Skarvtinden** and three more horns (Ravenspire's lobed `horn()`).
- Land never dips below the beach inland; then the **coast cut**: past `coastU(v)` the land drops 1.2 m (a 3:1 ice
  edge) and the fjord floor shelves to 60 m.
- The **headland** on top (`smax`): a crest elevation table (its own profile scaled so the point sits 30 m over the
  sea, plus Ravenspire-style `cliff()` steps), a rounded 16 m crest, 36° bay flank and 46° rock sea flank with
  gullies, a sea cliff past the point.
- The **far shore** rises out of the water ~6.4 km out, with the big peak across the fjord.

`natural(x, z)` adds the detail: powder lumps, drainages (1D ridged ribs across the face), big lateral relief
(eased off within 50 m of the lines, twice as strong 200 m from them), rock outcrops (kept 45 m off the lines), buttresses, spines, cliff bands,
hits (rollers, lips, kickers), shoulder rollers, and the **couloir** (a floor that keeps the face, quarter-pipe
walls 34 m high in an 85 m wide rock mass, a choke and the chokestone bench). `height()` = natural + the ramps.

`lineDistFast()` is an 8 m grid of the distance to the canonical lines (built once, ~0.2 s), so the height
function can ease relief off the lines cheaply.

Splat: rock steeper than ~46° and a dark wet band along the coast (the tide line); wind-packed snow on convex
crests, and on the beach and the quay flats.

---

## 3. Physics, camera, atmosphere (tuning.js)

Built on Ravenspire's big-mountain numbers (a copy) with the flow layer on, then adjusted for spring snow by the
sea and a faster bottom half:

| | value | why |
|---|---|---|
| ski / board `maxVelocity` | 26 / 25.5 | the soft cap starts here; sustained 25–31 m/s on the face |
| `dragTuck` ski / board, `softCapDrag` | 0.0047 / 0.0064, 0.065 | holds the big lines at 50–70 mph (peaks of 34–37 m/s for a moment off the biggest drops, like Ravenspire) |
| `airDrag` | 0.0028 | sea-level air is denser than Ravenspire's |
| `powderDepth`, `frictionPowder`, `turnScrub` | 0.45, 0.05, 0.09 | settled maritime snow: quicker than Ravenspire's deep powder |
| `landPowderAbsorb` / `Scrub`, `hardLanding`, `crashImpact` | 4.5, 0.011, 17, 24 | 15–22 m drops on the face land clean |
| pop, spin, flip | popMax 4.3 / 4.7, spinSet 6.2 / 7.0, flipSet 3.3 / 3.4 | a strong set: the village and the rollers are trick terrain |
| `slowmo`, `landSpeedCap`, `microHop`, `landRedirect` | as Ravenspire | |
| CAMERA | maxFovBonus 15, the rest as Ravenspire | |

**Atmosphere** (`course.atmosphere`, the graphics hook): `sunElevation 11`, `sunBearing 128` (the low sun
cross-lights the east-facing mountain from the right and throws its glitter path across the fjord to the right of
the fall line), `skyZenith #3e6fa8`, `skyHorizon #f4c896`, `fogColor #f3d2b0`, `fogDensity 0.85`,
`exposure 0.66`, `ambientScale 0.85`. Preview other values with `?atmo={"sunElevation":6}`.

**The water** (props.js `buildWater`): one 60 km plane at SEA with a ShaderMaterial: three scrolling ripple
layers from the terrain noise texture (fading with distance, glassy patches), the reflected *higher* sky from the
atmosphere's LUT (a fjord's horizon reflects the far shore's mountains, not the bright horizon sky), a deep
blue-green body brightened by the sky, teal shallows along the bay, the sun's glitter path (a sharp and a broad
specular lobe), and the game's aerial-perspective fog chunk. No render targets, one draw call.

---

## 4. Skill and scoring

The flow layer (physics/flow.js, as Ravenspire): landing grades, named drops (`featureAt`), roof landings, line
chains, the flow meter and SEND IT, the judged run summary at the finish (zen), golden snowflakes, drop zones.

**Line goals** (`course.lineGoals`): **Skarvtind Classic** (Skaret → Ørneredet → Hammaren, +2600), **Stairway to
the Sea** (Trappa I → II → III → Neskanten, +2600), **Silver Lining** (Sølvryggene → Kråkesteget → Bjørkehoppet,
+1600), **Rorbu Hopper** (the three village roofs in order, +1800), **Naustgapet** (+1500), **Wave Rider** (three
Bølgene, +1200), **Ski to Sea** (Skaret → Hammaren → Bølgene → Naustgapet, +3000), **Rollercoaster** (four
Fjordryggen rollers, +1400).

**Golden snowflakes** (12, `course.challenge.flakes`): in the choke, on the chokestone lip, Ørneredet's nest,
Hammaren's peak, a spine crest, Trappa II, Neskanten, over a big roller, over a shoulder roller, on the bakery's
roof, high over the boathouse (you only get it by sending Naustgapet), at the end of the pier.

**Challenge mode**: gates down the hero line (Skaret, then the band gaps, the rollers, the village; `challenge.gates`
skip the lips and the chokestone), medals at 23 / 20 / 15 m/s average.

**runCompleted** `{ mapId: 'fjordline', trailId, distance, time, score }`: emitted from `onPlayer` on `runComplete`
(zen) or `runFinished` (challenge); `trailId` is the trail whose canonical line the run followed most (voted every
0.5 s; a drop zone pre-sets it). Since the integration the ride tracker (profile/tracker.js) also emits a generic
`runCompleted` for every map; Fjordline's own event is skipped if one for this map went out within 2 s, so there is
never a duplicate.

---

## 5. Tunables

| what | where |
|---|---|
| profiles, cirque, couloir, bands, spines, buttresses, rollers, headland, coast, buildings, harbour | `layout.js` |
| trails (names, difficulty, numbers), drop zones, line goals, canonical lines | `layout.js` (`TRAILS`, `DROP_ZONES`, `LINE_GOALS`, `RIDE_LINES`) |
| snowflakes, gates, trail spawns / finishes, the splash / respawn, the quay run-out | `course.js` |
| roof snow, ramps (`ramp`, `drift`, `driftSlope`), stilts | `layout.js` BUILDINGS, `structures.js` |
| water colours, ripples, glitter; sea ice; the village look | `props.js` |
| speeds, landings, powder, camera, golden hour | `tuning.js` |

---

## 6. Measurements

### Trail bots (web/scripts/map7-ride.mjs, real Player physics on the map's own grid, style `send`)

| trail | gear | time | avg speed | max | crashes | stumbles | air (longest) | line goals |
|---|---|---|---|---|---|---|---|---|
| Skaret | ski | 110 s | 25.5 m/s (57 mph) | 36.3 | 0 | 1 | 21.5 s (2.7 s) | Skarvtind Classic, Wave Rider |
| Skaret | snowboard | 119 s | 23.5 m/s (53 mph) | 36.0 | 0 | 0 | 23.5 s (2.8 s) | Skarvtind Classic, Wave Rider |
| Kvalneset | ski | 95 s | 24.7 m/s (55 mph) | 31.2 | 0 | 0 | 9.4 s (2.5 s) | Stairway to the Sea |
| Kvalneset | snowboard | 108 s | 21.8 m/s (49 mph) | 28.7 | 0 | 0 | 9.5 s (2.6 s) | Stairway to the Sea |
| Sølvryggene | ski | 114 s | 23.5 m/s (53 mph) | 35.7 | 0 | 2 | 27.3 s (3.6 s) | Silver Lining, Wave Rider |
| Sølvryggene | snowboard | 119 s | 22.6 m/s (51 mph) | 32.5 | 0 | 1 | 26.5 s (3.4 s) | Silver Lining, Wave Rider |
| Fjordløypa | ski | 140 s | 19.6 m/s (44 mph) | 33.3 | 0 | 0 | 14.8 s (1.7 s) | Rollercoaster |
| Fjordløypa | snowboard | 148 s | 18.9 m/s (42 mph) | 31.9 | 0 | 0 | 13.3 s (1.6 s) | Rollercoaster |
| Brygga | ski | 55 s | 17.4 m/s (39 mph) | 27.3 | 0 | 0 | 13.8 s (2.8 s) | Rorbu Hopper, Naustgapet |
| Brygga | snowboard | 58 s | 16.5 m/s (37 mph) | 26.4 | 0 | 0 | 13.5 s (2.6 s) | Rorbu Hopper, Naustgapet |
| Sjøsiden | ski | 44 s | 15.0 m/s (34 mph) | 23.0 | 0 | 0 | 0 | – |
| Sjøsiden | snowboard | 47 s | 13.9 m/s (31 mph) | 21.2 | 0 | 0 | 0 | – |

All 12 reach the sea (`--check` PASS: every ride finishes with ≤ 1 crash and exactly one `runCompleted` with the
right `trailId`), **0 crashes**, 4 stumbles (spine crests and the chokestone at full tuck). Judged scores 88–96 on the
double-blacks and the black; the biggest drops are 17–22 m (Hammaren's peak, Neskanten, the nest). Max speed is the
instant after a big drop; sustained speeds on the face are 25–31 m/s (56–70 mph).

**Trick style** (spins off every real air, no tuck): 12 / 12 finish, **0 crashes**, 1 stumble; the village line at
10–12 m/s (that is what the beach slope and the lower boathouse were tuned for: a slow rider used to stall on the
boathouse ramp and stop on a dead-flat beach). **Carve style** (forced linked turns every 1.5 s, ±10 m): 9 / 12 finish, **0 crashes**; on skis the forced weave
scrubs the headland crest, the low shoulder and the roof hops down to a crawl and three runs time out at 300 s — a
bot artefact (it never lets the skis run), but the beach now falls at 4° to the line so a turning rider still
reaches the finish (at 2.5° the green trail's carve run stopped 22 m short).

### Unit, fuzz, end to end

`map7-unit.mjs`: 69/69 (registry contract, trail numbers vs the lines, spawns on snow facing downhill, finishes at
the water's edge, atmosphere shape, choke width and couloir angle, the coast wet / dry, the headland steps and
bands, roofs and decks, walls, the pier splash and dry respawn, runCompleted once with the contract fields).
`map7-fuzz.mjs 40 40`: 96k frames, no NaN, never below the snow / a roof / a deck, never stuck, 5–6 splashes all
respawned on dry land (every fifth run is launched at the water from the beach).

`map7-e2e.mjs` (real game, GPU): `?trail=brygga` starts at the Brygga top; riding into the fjord splashes, fades
and puts the rider on the beach; crossing the line gives RUN COMPLETE, the quay run-out slows the rider, and exactly
one `runCompleted` for fjordline goes out (the ride tracker's, with `trailId` = the trail board `fjordline/brygga`;
the map's own is deduplicated). No console errors.

Shared suite on the integrated branch: unittest 52/52, physics-fuzz, physics-tricks, jumps-valcrest --check,
map2-bot --verify, map3-unit 32/32, map3-fuzz, map4-unit 15/15 all pass; GPU lobbytest (GPU=1, :5196): all checks passed.

### Performance

GPU ms per frame at 1600×900, quality 1, dev server on :5196 (`map3-perf.mjs`, the rider riding at six spots down
the hero line; each spot is the quietest of three windows), Intel Arc 130V shared with ~10 other sessions. The GPU
was heavily contended all night (in the worst window Ravenspire itself read 65 ms average), so per the overnight
rule the table keeps the **minimum per spot over all runs**, with Ravenspire measured back to back:

| map | 2 % | 20 % | 38 % | 55 % | 62 % | 80 % | draws | triangles |
|---|---|---|---|---|---|---|---|---|
| fjordline | 14.2 | 12.1 | 12.4 | 14.6 | 12.5 | 14.0 | 206–445 | 1.46–1.64 M |
| ravenspire | 11.0 | 11.3 | 10.8 | 13.0 | 13.2 | 15.7 | 187–492 | 1.58–1.86 M |

So Fjordline sits at **~12–15 ms**, inside the 14–16 ms target and level with Ravenspire. Where the time goes
(`web/scripts/map7-gpudiag.mjs`: hide one group at a time, min of three windows): nothing in Fjordline's own
props stands out — the water plane, the sea ice, the village and the trees are each inside the noise (±3 ms); the
terrain is the bulk, as on every map. The water is drawn after the terrain (`renderOrder`), so early depth rejects
it wherever the land covers it. Draws peak at the col (~445, the whole fjord in view) and fall to ~205 at the harbour.

**Pop-in** (`gfxpopin.mjs http://localhost:5196 fjordline 1 25`): **0** tree, shadow, scatter and terrain-LOD pops
per second, 0 shader compiles and 0 texture uploads during the ride.

**Boot**: 27–40 s to the first riding frame on a quiet-ish machine, 100–140 s while the other sessions' bots and
perf runs held the CPU (Ravenspire booted in 127–132 s in the same windows). The height function costs ~3 µs a
sample (the headland, the outcrops and the relief), about 1.5× Ravenspire's.

---

## 7. Known issues and ideas

- **Peak speeds** right after the biggest drops touch 35–37 m/s for a moment (the fall turns into speed on the 42°
  landing; `landSpeedCap` takes the excess over 34). Sustained speeds are inside 50–70 mph.
- **Fjordløypa** is honest-physics fast only for a rider who tucks: the bot steers a lot and averages 44 mph; a
  tucked human holds 55–65 mph over the rollers.
- **The water** is a shader, not a reflection: no mirrored mountains, and the shoreline is where the terrain mesh
  crosses the plane (at 3 km and beyond the depth buffer can shimmer along the beach line).
- **Trees** are the game's conifers (gfx/trees.js); real coastal Lyngen has birch. A birch model would be a gfx job.
- **Roof snow** shows no tracks; the decks are timber with a thin rideable snow skin.
- **The tile** is 3 × 3 km: the headland's point is 60 m from the edge (the edge hint stops you past the sea cliff,
  but you splash first).
- Height generation takes ~3 µs per sample (relief, outcrops, the headland): boot is a few seconds slower than
  Ravenspire's.

Ideas: a ski-and-sail intro (the sailboat drops you off), sea smoke over the fjord on cold mornings, a
pond-skim across the harbour, alpenglow on the far range as the sun drops (a time-of-day slider through the
atmosphere hook), birch trees.
