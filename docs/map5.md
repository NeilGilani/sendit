# Map 5: Dragonback — ridge to ridge

A big-mountain face combed into ridges. You drop off a shoulder under a serrated summit ridge (the Dragon's
Back) onto a 40° face that is mostly *not* open powder. Twenty-odd arêtes, fins and spines run down it, with
gullies between them, and you ride the crests:
- gendarme steps that throw you 40–70 m down the crest;
- notches you fly;
- spurs that peel off one ridge and launch you across a gully onto the next;
- prows where a ridge ends in a 10–30 m cliff.

Miss and you're in the gully: still rideable, but slow, sluffed powder with no airs. It's the spirit of
Ravenspire's Raven's Beak ([map5-research.md](map5-research.md) §1), multiplied. Tuned for 50–60 mph on the
big lines (top speeds 80–85 mph), on skis and on a snowboard.

```
npm --prefix web run dev -- --port 5189 --strictPort
http://localhost:5189/?map=dragonback&ride        straight into a ride (the lobby's Maps tab lists it too)
http://localhost:5189/?map=dragonback&challenge   Challenge mode (gates on the Spine line, medals)
node web/scripts/map5-ride.mjs both all send --check   bot rides every signature line (styles: send, control, carve, trick)
node web/scripts/map5-hops.mjs all 20,24,28,32 --check every ridge-to-ridge hop at four entry speeds, both gears
node web/scripts/map5-unit.mjs                    ridge shape contract, spurs, goal names, drop zones, flakes, scoring, sluff
node web/scripts/map5-fuzz.mjs                    random inputs from random starts: no NaN, never below the snow, never stuck
OUT=shots node web/scripts/map5-e2e.mjs spine skis zen|challenge   end to end in the real game
node web/scripts/map5-relief.mjs relief.png       hillshaded top view of the layout (crests yellow, lines magenta)
node web/scripts/map3-perf.mjs http://localhost:5189 1600 900 1 60 dragonback   GPU / CPU / draws at six spots
node web/scripts/gfxpopin.mjs http://localhost:5189 dragonback 1 25            pop-in
```

---

## 1. The mountain

Local frame (as Ravenspire): **u** = metres down the fall line from the start (world x = −1180 + u, the face
falls east), **v** = metres across (world z, + = skier's right). The ridges run along the fall line, so
their flanks face north and south: the sun (SSE) lights the south flanks and leaves the north flanks in blue
shade. From any gully the ridges read as lit and shaded walls, and from above as stripes.

| u (m) | zone | slope | what is there |
|---|---|---|---|
| −250…−60 | **the Dragon's Back** | rock | the summit ridge: nine rock towers (horns) in a row, an iron summit cross on the highest |
| 0…82 | **the Shoulder** | 10° → 22° | the start (u 14), a bivouac shelter, prayer flags across the Shoulder, marker poles along its edge. Steep enough to traverse to any fin |
| 82…112 | rollover | 31° | the fins grow out of it over ~70 m |
| 112…670 | **the Comb** | 40° | West Fin, the Blade (knife edge), the Shard, **Dragon's Spine**, the Scales, the Twins, the Splinter, the Keel, East Fin, gullies between |
| 670…1090 | the Fork, the Staircase, the Hollow | 38° | the Spine splits at u ≈ 900 (**the Fork** left, **Dragon's Tail** right, both leaving its crest at full height); **the Staircase**: four ridges en échelon; **the Sentinel** (right); **the Hollow** (open bowl, left) with wind lips, a pillow stack and **the Wishbone** (two ridges that merge) |
| 1090…1560 | lower face | 40° | **the Organ Pipes** (a field of tight spines, Alaska style), **the Wyrm**, **the Knife** (a long knife-edge arête with a notch), **the Slot** (couloir), East Wall, West Buttress |
| 1560…1780 | the prows | 34° | ridge ends: 17–30 m cliffs onto the apron and **the Dragon's Tooth** (38 m, the East Wall's end); pillow stacks below the Organ Pipes and the Sentinel |
| 1780…2030 | the apron | 26° | wind lips, a roller |
| 2030…2290 | runout | 15° | **run complete at u = 2290**: a row of cairns and a string of prayer flags across the valley |

### The ridges (layout.js `RIDGES`)

| ridge | u | crest top | height | end | features |
|---|---|---|---|---|---|
| West Fin | 90–640 | 4 m | to 39 m | 25 m prow | 2 steps |
| **The Blade** | 90–790 | **2.4 m (knife edge)** | to 40 m | fades | 2 steps, the Blade's Notch, **Blade Leap** spur |
| The Shard | 470–730 | 3 m | 14 m | 10 m prow | the Blade Leap's target |
| **Dragon's Spine** | 86–970 | 5 m | to 51 m | splits into the Fork and the Tail | 2 steps, **the Little Gap** (u 560, the learner gap), **the Spine's Gap** (u 750, the hero gap), the **Scale Jump** spur |
| The Scales | 300–600 | 3 m | 15 m | 11 m prow | Scale Jump's target |
| Left / Right Twin | 140–700 | 3 m | 22–25 m | 11 / 18 m prows | **Twin Hop** and **Twin Hop Back** |
| The Splinter | 420–680 | 3 m | 14 m | 9 m prow | the Keel Leap's target |
| The Keel | 90–730 | 9 m (broad back) | to 41 m | 30 m prow | 2 steps, 2 side wind lips, **Keel Leap** spur |
| East Fin | 90–600 | 4 m | to 38 m | 25 m prow | a step |
| The Fork / Dragon's Tail | 880–1170 | 5 / 4 m | 31 / 29 m | 17 / 21 m prows | the Spine's two branches: they leave its crest at its full height (a true fork, no rollover) |
| The Sentinel | 640–1120 | 4 m | 41 m | 26 m prow | a step, **the Sentinel Notch**, a side wind lip |
| The Wishbone | 900–1130 | 4 m | 22 m | merge | two ridges that converge into one |
| **Stair 1–4** | 760–1370 | 5–6 m | 26–27 m | 20 m prows | each one's spur (**Stair Hop 1–3**) lands on the next |
| **The Knife** | 1230–1600 | **2.2 m (knife edge)** | 35 m | 22 m prow | 3 steps, the Knife's Notch |
| The Wyrm | 1160–1610 | 4 m | 39 m | 23 m prow | a step, **Wyrm Leap** onto the Knife |
| East Wall | 1380–1640 | 6 m | 40 m | **the Dragon's Tooth**, 38 m | a step, a side wind lip; the map's biggest cliff |
| West Buttress | 1150–1660 | 6 m | 41 m | 22 m prow | a step, a side wind lip |
| the Organ Pipes | 1160–1620 × −330…−40 | 1.6 m | 7–18 m | short drops | spine field, 30 m spacing |

### Best lines (bot numbers in §6)

1. **Ride the Dragon**: Dragon's Spine top to bottom. Steps at u 170 and 430 (40–60 m airs), **the Little Gap**
   (u 560, the learner gap: 31 m to the far crest, a small kick), **the Spine's Gap** (u 750, the hero gap: 54 m to
   the far crest, clears from ~22 m/s, 60–85 m and ~3 s in the air), then the Fork's left branch, its 17 m prow,
   the Organ Pipes and the pillow stacks. The challenge line. 54–55 mph average, 85 mph top.
2. **Twin Hop, back again → the Staircase**: Left Twin → Twin Hop → Right Twin → Twin Hop Back → Left Twin,
   its prow, then Stair 1 → Stair Hop 1 → Stair 2 → Stair Hop 2 → Stair 3 → Stair Hop 3 → Stair 4 → its prow.
   Seven ridge-to-ridge airs, the purest version of the map.
3. **Scale Jump → the Tail → Wyrm Leap → the Knife**: off the Spine onto the Scales, the Dragon's Tail, across
   to the Wyrm, Wyrm Leap onto the Knife, the Knife's crest and notch, the Knife Prow.
4. **The Blade**: the knife edge from the top, either Blade Leap onto the Shard ("Bladerunner") or the whole
   Blade through its notch. Balance matters: the crest top is 2.4 m wide over 45–55° flanks.
5. **The Keel → Keel Leap → the Sentinel**: the broad Keel (side wind lips), Keel Leap onto the Splinter, across
   to the Sentinel (its notch, 26 m prow, pillows below), then the East Wall and **the Dragon's Tooth** (38 m).
6. **West Fin → the Wishbone → West Buttress**: West Fin's 25 m prow onto a pillow stack, the Hollow's wind
   lips, ride the Wishbone's right branch to where it merges, then West Buttress.
7. The low lines: **the gullies** (between the big ridges) and **the Slot**. They're always rideable to the
   valley, but slower in the sluff and with no airs, so they score far less (judged 63–79 vs 90–100).

### Props (props.js; placement headless in `course.placeProps`)

The identity is high-alpine, not ski resort. Four orange half-barrel **bivouac shelters** ("bivacco") are
bolted to shoulders: at the start, under West Fin, in the Hollow and beside the Sentinel. They collide. Stone
**cairns** mark every notch lip (both sides, one with a stick), every spur's turn-off (where you peel off) and
the prows; a row of them marks the finish. Strings of faded **prayer flags** (blue, white, red, green, yellow)
flutter in the vertex shader at the Shoulder and across the finish, and are visible from the lobby.
Orange-tipped **marker poles** line the Shoulder's edge, and there's an iron **summit cross** with a sunburst
on the Dragon's Back. All of it is merged per material: about a dozen draws.

The summit ridge is a row of nine lobed rock horns (`SUMMIT_TOWERS`), so the skyline behind the start is
serrated like a dragon's back.

---

## 2. Code

```
web/src/maps/dragonback/
  index.js     registerMap (id 'dragonback', order 5), thumbnail (inline SVG), lobby spot (on the Keel's crest,
               looking across the Comb); loads props.js lazily
  layout.js    every feature in one place: PROFILE, FACE, RIDGES, HOPS, SPINE_FIELD, HITS, PILLOWS, DROP_ZONES,
               LINE_GOALS, RIDE_LINES (tunables)
  ridges.js    the Ridge primitive (crest spline, steps, gaps, lips, prow / kicker ends, flank fluting), cliff(), smax()
  course.js    DragonbackCourse: height function, hop spurs, tile generation (heights, normals, rock + packed splat,
               far grid), Course interface, featureAt / ridgeAt / gullyAt, scatter hooks, flakes, gates, props placement
  scoring.js   ridge-hop scoring (course.onPlayer)
  sluff.js     sluff drag in the gully floors (course.onPlayer)
  respawn.js   a respawn on a ridge puts you on its crest, rolling (course.onPlayer)
  props.js     bivouacs, cairns, prayer flags, marker poles, the summit cross (browser only)
  tuning.js    DRAGONBACK_PHYSICS / DRAGONBACK_CAMERA (Ravenspire's, plus three map knobs)
web/src/maps/builtin.js     one line: import './dragonback/index.js';
web/scripts/map5-*.mjs      ride, hops, unit, fuzz, e2e, relief
```

It reuses Ravenspire's noise kit (`maps/ravenspire/noise.js`) and its tuning (imported and cloned). Nothing in
Ravenspire changed.

### The height function

`macro(x, z)` (also drives the 10 m mid ring and the 30 km backdrop) follows Ravenspire's recipe:
- a fall-line profile (`PROFILE`);
- a bowl rising to framing rock walls;
- wild ranges around (here the big dark ones are south);
- the **Dragon's Back**: a crest 70–100 m behind the start carrying nine rock horns;
- two far peaks.

`natural(x, z)` adds the detail:

- **Low powder lumps**, sized for 25–30 m/s (≥ 150 m curvature radius).
- **Ridges**, smooth-unioned (`smax`, 4 m blend) so ridges merge into Y's without creases. Each ridge
  (ridges.js) is a crest spline v(u) (Catmull-Rom through its knots, so a ridge keeps its heading through a
  knot) carrying a height H(u), foot half-width W(u) and crest-top half-width. Across it:
  `H·(1 − x)^p`, where x = (√(d² + top²) − top)/W and p = 1.6–2.0. The flanks are concave: steepest just
  under the crest (45–55°, rock exposed) and easing into the gully. That's what makes airs off a crest land
  soft: the slope under you falls away as fast as you do. Along it:
  - **steps**: Ravenspire's cliff() (a bench 4·D long, last 24 m rolled over by 0.2 in slope, then a D m
    face), so the take-off points down the next crest segment;
  - **gaps**: a notch with a no-roll bench and a 1.4 m wind-lip kick, a short steep wall down N m, a floor
    L m long, and a far wall climbing back over 1.4·N to a crest S m lower;
  - **wind lips** on the crest's edge;
  - **prow** ends: the full ridge height as a cliff with a rolled lip;
  - **rock fluting** down the flanks: ribs and runnels a few metres apart, up to 2.2 m, never on the crest
    top.
- **Hop spurs** (course.buildHops): one ridge per hop, from layout `HOPS`. A spur leaves its parent's crest
  *tangentially*, stays as high as the parent (−8 % by its end), curves out over its first half (a ~65 m
  radius, about 1.4 g at 30 m/s) and runs straight at a point `over` m past the target crest. It ends in a
  **kicker** (+2.5 m over ~12 m, ≈ 10–12° above the crest) and then drops away. Spurs are 90 m long (60 m on
  the short stairs).
- **The Organ Pipes**: a triangle wave across the fall line (30 m spacing, 1.6 m crest top, sluff channels
  between), each spine with its own height and its own short end drop.
- **Sluff runnels** in the gullies, **wind lips and rollers** (`HITS`), and **pillow stacks** (Ravenspire's
  terraced pillows).

Splat, as Ravenspire: rock where steeper than ~46°; **wind-packed snow on convex crests** (Laplacian), which
is faster and lands harder.

### Hooks into shared files

The only shared-file change is the import line in maps/builtin.js. Everything else uses hooks that already
exist (docs/map3.md §2):
- `course.physics` / `camera`, `park: false`, `life`, `spawn`;
- `forestAt` / `pisteAt` / `treeline`, `rockOk`, `corniceOk`;
- `featureAt` / `roofAt`, `lineGoals`, `dropZones`;
- `challenge.{medalSpeeds, flakes, gates}`, `edgeHint`, `buildProps`, `obstacles`;
- `onPlayer`, which Voltage Park added. Dragonback uses it for ridge-hop scoring, sluff and crest respawns.

---

## 3. Physics (maps/dragonback/tuning.js)

Ravenspire's big-mountain physics (docs/map3.md §3: same gear, same deep powder, the same honest jumps, flow
layer and SEND IT), cloned, with three changes:

| knob | value | why |
|---|---|---|
| `slowmo` | minAir 3.0 s, minDrop 14 m (Ravenspire 2.8 / 10) | there's an air every few seconds here, so the apex slow-mo only touches the very biggest |
| `sluffDrag` (map knob) | 0.05 × speed per second, × gully-ness | sluff.js: the gully floors are deep sluffed powder, so the low line is a slower recovery line |
| `respawnRoll` (map knob) | 8 m/s | respawn.js: a respawn on a ridge sets you on its crest, rolling, not standing on a knife edge |

Terminal speeds are Ravenspire's: 30.6 m/s (68 mph) tucked on 40° skis, 28.7 on a board. Crest lines run
28–34 m/s between features, with peaks of 36–38 m/s (80–85 mph) after the big drops.

`gullyAt(x, z)` is 0..1: high where no ridge is under you and ridges (or the Organ Pipes) stand on both sides
within ~70 m.

---

## 4. Scoring, goals, challenge

Everything from Ravenspire's flow layer works here: line chain, flow meter → SEND IT, landing grades, named
drops, stomp boost, the judged FWT-style run summary and the personal best (docs/map3.md §4). Map additions:

- **Ridge hop** (scoring.js): a clean landing on a *different* ridge from the one you took off from scores
  `Ridge hop · A → B` (150 + 6/m of lateral distance, +100 on its crest, × the SEND IT multiplier). Hops landed
  within 4 s of each other chain into a **Ridge run ×N** (120 × N, capped at ×6). Each hop also tops up the
  flow meter. A crash resets the chain.
- **Named take-offs** (`featureAt`): ridges, their notches ("The Spine's Gap"), prows ("The Keel Prow"), hop
  spurs ("Twin Hop"), the Organ Pipes, Pillow Stacks (which also chain into the game's **Pillow line ×N**),
  wind lips. Drops are named after them ("The Spine's Gap · 31 m drop").
- **Line goals** (`LINE_GOALS`, Steep "Mountain Stories" style; take off from these, in order, cleanly):
  - **Ride the Dragon** (Dragon's Spine → The Little Gap → The Spine's Gap → The Fork, +3000)
  - **Stairway** (Stair Hop 1 → 2 → 3 → Stair 4 Prow, +2800)
  - **Wyrm Rider** (Wyrm Leap → The Knife's Notch → The Knife Prow, +2400)
  - **Fin Hopper** (Twin Hop → Twin Hop Back, +2200)
  - **Knife Fight** (The Knife → its notch → its prow, +2200)
  - **Scaling the Dragon** (Scale Jump → The Scales Prow, +2000)
  - **Bladerunner** (The Blade → Blade Leap → The Shard Prow, +2000)
  - **Keel Over** (Keel Leap → The Splinter Prow, +1800)
  - **Sentinel** (the Sentinel → its notch → its prow, +1800)
  - **Organ Grinder** (four Organ Pipes take-offs, +1800)
  - **Pulling Teeth** (land the Dragon's Tooth, 38 m, cleanly, +2000)
  - **Fin and Pillows** (West Fin Prow → two Pillow Stacks → The Wishbone, +1600)
- **Golden snowflakes** (12, `placeFlakes`) sit on the hard spots:
  - **mid-air over the Little Gap, the Spine's Gap, the Blade's Notch and the Knife's Notch** (on the flight
    line, so you only get them flying the gap);
  - on the Keel Leap, Twin Hop Back and Stair Hop 2 kickers;
  - on the Blade's and the Knife's knife-edge crests;
  - on Stair 4, the East Wall's prow and the pillows.

  The game's pickup radius is 1.6 m, so they're genuinely hard.
- **Drop zones** (keys 1–9 / d-pad): 1 The Shoulder, 2 The Blade, 3 Dragon's Spine, 4 The Twins, 5 The Keel,
  6 The Fork, 7 The Staircase, 8 The Organ Pipes, 9 The Knife.
- **Challenge mode**: the hero path is the Dragon's Spine line. Twelve gates (14 m on the crest, 20 m on the Fork,
  26 m through the Organ Pipes and below, where the line hops spine to spine) sit mid-segment on its crest (never right after a gap: you can't steer a flight, so the landing scatters a
  few metres), on the Fork, through the Organ Pipes and down the apron. A missed gate costs +2 s. Medals are
  at 20.5 / 17.5 / 14.5 m/s down the fall line: gold 111.7 s, silver 130.9 s, bronze 157.9 s. A clean bot run
  with no SEND IT is silver (124–128 s in the real game); gold needs the boost or a tighter line.

---

## 5. Tunables (where to change what)

| what | where |
|---|---|
| ridges (crest, height, width, top, steps, gaps, lips, ends) | `layout.js RIDGES` |
| ridge-to-ridge hops (take-off, target, landing, spur length, aim past the crest, kick) | `layout.js HOPS` (`len`, `over`, `h`, `H`, `drop`, `top`) |
| spur shape (tangent curve-in, height tracking) | `course.js buildHops()` |
| notch take-off kick | `ridges.js GAP_KICK` (1.4 m), or per gap (6th element: the Little Gap 0.6, the Knife's Notch 0.5) |
| step lip roll-over | `ridges.js LIP_ROLL`, `LIP_ROLL_LEN` |
| flank fluting, crest wander | `ridges.js Ridge.at()` (`flute`), `wander` option |
| face profile, width, framing walls | `layout.js PROFILE`, `FACE` |
| summit towers | `course.js SUMMIT_TOWERS` |
| spine field, wind lips, pillows | `layout.js SPINE_FIELD`, `HITS`, `PILLOWS` |
| drop zones, line goals, canonical lines | `layout.js DROP_ZONES`, `LINE_GOALS`, `RIDE_LINES` |
| hop scoring | `scoring.js HOP` |
| sluff drag, respawn roll, slow-mo, everything physics | `tuning.js` |
| snowflakes, challenge gates and medals, props placement | `course.js placeFlakes()`, `placeGates()`, constructor, `placeProps()` |

Layout rules learned the hard way (the first two are unit-tested):
- **No step or gap within 70 m above a spur's root.** A step launches you 40–70 m down the crest, straight
  over the turn-off.
- **A spur must start tangent to its parent's crest.** A spur that left the crest at an angle meant
  crossing the crest's convex top diagonally, which at 30 m/s is a kicker.
- **A fork's branches leave the parent's crest at its full height.** The first Fork had the Spine fade out under
  two branches that grew out of the slope: a 25 m rollover in 50 m that launched riders onto the wrong branch.
- **Space features for their flights.** With kicks, a notch flies 60–100 m at 30 m/s; the next feature must start
  beyond that (the Little Gap's 100 m flight used to land on the Spine's Gap's take-off).

---

## 6. Measurements

### Bot rides (web/scripts/map5-ride.mjs: real Player physics on the map's grid)

The bot steers like a skilled rider: it holds the line's heading a beat ahead (0.35 s) and closes the
cross-track error (Stanley steering). A board gets a gentler gain, because it answers the edge more slowly.
Styles:
- **send**: tucked, pops every lip;
- **trick**: spins (360+) off every real air, plus grabs.

"max" is the top ground speed.

| line | gear | style | time | avg speed | max | crashes | stumbles | air total (longest) | biggest drop | hops | judged | line goals |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dragon's Spine | ski | send | 120.8 s | 24.4 m/s (55 mph) | 38.0 (85) | 0 | 0 | 38.1 s (3.52 s) | 25 m | – | 100 | Ride the Dragon, Organ Grinder |
| Dragon's Spine | board | send | 116.2 s | 23.6 m/s (53 mph) | 36.7 (82) | 0 | 1 | 28.4 s (3.77 s) | 43 m | – | 99 | Ride the Dragon, Organ Grinder |
| Scale Jump → Wyrm Leap → Knife | ski | send | 122.7 s | 23.5 m/s (53 mph) | 35.2 (79) | 0 | 1 | 35.8 s (3.83 s) | 25 m | 1 | 99 | Scaling the Dragon |
| Scale Jump → Wyrm Leap → Knife | board | send | 126.3 s | 22.2 m/s (50 mph) | 35.5 (79) | 0 | 1 | 35.5 s (3.58 s) | 22 m | 2 | 98 | Ride the Dragon |
| The Blade → Blade Leap | ski | send | 135.7 s | 20.9 m/s (47 mph) | 37.2 (83) | 0 | 0 | 36.9 s (2.67 s) | 17 m | 1 | 96 | Bladerunner, Organ Grinder |
| The Blade → Blade Leap | board | send | 129.3 s | 21.7 m/s (49 mph) | 36.3 (81) | 0 | 1 | 29.4 s (2.62 s) | 19 m | 1 | 95 | Bladerunner |
| The Blade end to end | ski | send | 140.7 s | 19.8 m/s (44 mph) | 36.2 (81) | 0 | 0 | 42.2 s (3.55 s) | 19 m | – | 95 | Organ Grinder |
| The Blade end to end | board | send | 137.2 s | 20.3 m/s (45 mph) | 36.3 (81) | 0 | 1 | 37.5 s (3.62 s) | 17 m | 1 | 90 | Organ Grinder |
| Twins → Staircase | ski | send | 135.7 s | 22.0 m/s (49 mph) | 34.3 (77) | 0 | 3 | 41.7 s (3.43 s) | 19 m | 3 | 97 | Fin Hopper |
| Twins → Staircase | board | send | 129.5 s | 22.3 m/s (50 mph) | 34.9 (78) | 0 | 1 | 27.7 s (3.97 s) | 24 m | 3 | 98 | Fin Hopper |
| Keel → Sentinel → Dragon's Tooth | ski | send | 158.7 s | 18.8 m/s (42 mph) | 35.6 (80) | 0 | 0 | 41.3 s (4.62 s) | 37 m | 2 | 94 | Pulling Teeth |
| Keel → Sentinel → Dragon's Tooth | board | send | 148.8 s | 19.5 m/s (44 mph) | 37.3 (83) | 0 | 1 | 38.7 s (4.13 s) | 38 m | 2 | 95 | Keel Over, Sentinel, Pulling Teeth |
| West Fin → Wishbone | ski | send | 144.6 s | 19.7 m/s (44 mph) | 37.4 (84) | 0 | 0 | 30.3 s (3.35 s) | 29 m | 1 | 95 | Fin and Pillows |
| West Fin → Wishbone | board | send | 139.7 s | 20.7 m/s (46 mph) | 35.7 (80) | 0 | 0 | 26.9 s (2.65 s) | 25 m | 1 | 96 | Fin and Pillows |
| the gullies (low line) | ski | send | 115.8 s | 24.5 m/s (55 mph) | 35.8 (80) | 0 | 0 | 11.8 s (4.28 s) | 22 m | 0 | 71 | – |
| the gullies (low line) | board | send | 125.6 s | 23.0 m/s (51 mph) | 29.7 (66) | 0 | 0 | 8.7 s (3.72 s) | 22 m | 0 | 75 | – |
| the Slot | ski | send | 142.1 s | 21.4 m/s (48 mph) | 33.6 (75) | 0 | 0 | 11.3 s (3.32 s) | 24 m | 0 | 69 | – |
| the Slot | board | send | 141.0 s | 21.4 m/s (48 mph) | 31.3 (70) | 0 | 0 | 10.0 s (3.33 s) | 25 m | 0 | 69 | – |
| Dragon's Spine | ski | trick | 148.5 s | 23.8 m/s (53 mph) | 37.7 (84) | 2 | 1 | 48.3 s (4.23 s) | 41 m | – | 96 | Organ Grinder |
| Dragon's Spine | board | trick | 118.6 s | 23.4 m/s (52 mph) | 36.6 (82) | 0 | 1 | 27.4 s (3.8 s) | 43 m | – | 99 | Ride the Dragon |
| Scale Jump → Wyrm Leap → Knife | ski | trick | 125.7 s | 22.9 m/s (51 mph) | 35.7 (80) | 0 | 0 | 34.8 s (3.5 s) | 23 m | 3 | 98 | – |
| The Blade end to end | ski | trick | 126.6 s | 21.6 m/s (48 mph) | 38.5 (86) | 0 | 0 | 31.3 s (3.72 s) | 24 m | – | 97 | – |
| Twins → Staircase | ski | trick | 125.9 s | 23.2 m/s (52 mph) | 35.3 (79) | 0 | 1 | 30.2 s (3.65 s) | 22 m | 4 | 99 | Fin Hopper |
| Twins → Staircase | board | trick | 132.6 s | 21.6 m/s (48 mph) | 35.6 (80) | 0 | 1 | 32.7 s (3.7 s) | 22 m | 3 | 97 | Fin Hopper |
| Keel → Sentinel → Dragon's Tooth | board | trick | 154.5 s | 18.6 m/s (42 mph) | 35.6 (80) | 0 | 1 | 38.2 s (3.78 s) | 38 m | 2 | 94 | Pulling Teeth |
| West Fin → Wishbone | board | trick | 140.8 s | 20.5 m/s (46 mph) | 35.1 (79) | 0 | 0 | 27.5 s (2.88 s) | 25 m | – | 96 | Fin and Pillows |

Every line rides start to finish on both gears (`map5-ride.mjs both all send --check`: finished, ≤ 1 crash,
≥ 40 mph). Trick style adds spins (360 / 720) off every air long enough for one; its few crashes are
under-rotated spins. The ridge lines average 42–55 mph (top 77–86 mph). The low lines score 69–75 judged
against 90–100 for the ridge lines. Much of the ridge lines' time is in the air (27–45 s of 116–170 s).

**Crest vs gully.** Through the Comb (u 200–800, where the gullies are real), staying on the Spine's crest is
faster than the gully beside it: 24.7 s vs 27.1 s on skis, 24.9 s vs 29.3 s on a board. That's the sluff drag
(0.05 × speed per second in a gully floor) and the wind-packed crests. Over the whole run the Spine and the
gully line take about the same time (skis 117–118 s vs 118–120 s; board 113–114 s vs 124–125 s). The gully line
saves its time in the open lane between the Organ Pipes and the Wyrm, while the Spine line crosses the Organ
Pipes diagonally, spine after spine.

The bot rides one fixed waypoint line, so it doesn't fly every hop on every run (a full-line run arrives at a
spur at whatever speed and offset the previous features left it). The hop lab below isolates each hop.

Challenge gates on the Spine line in the node bot: 11/12 on skis, 10/12 on a board.

### Ridge-to-ridge hops (web/scripts/map5-hops.mjs)

Each hop is launched at its spur's root at an exact entry speed, then ridden tucked with no pop: the kick does
the work.

| hop | from → to | flight | air | impact (m/s) | lands (entry speed, both gears) |
|---|---|---|---|---|---|
| Scale Jump | Spine → Scales (27 m lower) | 47–65 m | 2.2–3.0 s | 9–13 | 20–28 m/s; board also 32 |
| Twin Hop | Left Twin → Right Twin | 63–72 m | 2.8–2.9 s | 5–6 | 20–32 m/s |
| Twin Hop Back | Right Twin → Left Twin | 52–62 m | 2.3–2.6 s | 4–9 | 20–32 m/s |
| Blade Leap | Blade → Shard (26 m lower) | 61–76 m | 2.9–3.2 s | 8 | 20–32 m/s |
| Keel Leap | Keel → Splinter (22 m lower) | 58–69 m | 2.6–3.0 s | 6–9 | 20–32 m/s |
| Stair Hop 1 / 2 / 3 | each stair → the next | 33–53 m | 1.4–2.2 s | 4–13 | 20–28 m/s (Stair Hop 2 also 32) |
| Wyrm Leap | Wyrm → Knife (the Knife is tall there) | 24–36 m | 1.0–1.4 s | 2–9 | 20–32 m/s |

Every hop lands on its target ridge, within ±10 m of the crest (the far side of the crest, falling away, by
design), clean or stomped: 67 of 72 hop × gear × speed runs. The 5 misses are all at 32 m/s (72 mph), where
the 60 m stair spurs and the Scale Jump's curve are too tight to follow.

### Gaps (notches)

The rider starts 25 m above the take-off on the crest at the entry speed, no pop:

| gap | to the far crest | clears from | flight when cleared | impact |
|---|---|---|---|---|
| the Little Gap (Spine u 560, kick 0.6 m: the learner gap) | 31 m | ~20 m/s | 36–52 m, 1.9–2.2 s | 5–7 |
| **the Spine's Gap** (Spine u 750) | 54 m | ~22–26 m/s | 56–77 m, 2.7–3.1 s | 10–11 |
| the Blade's Notch | 28 m | under 14 m/s | 32–69 m, 2.0–2.9 s | 5–7 |
| the Sentinel Notch | 38 m | ~22 m/s | 43–60 m, 2.1–2.4 s | 9–11 |
| the Knife's Notch (kick 0.5 m) | 24 m | ~18 m/s | 25–37 m, 1.4–1.6 s | 5–6 |

Come up short and you land on the far wall at 15–23 m/s impact (sketchy). Way short and you drop into the
notch and ride it out sideways into the gully.

### End to end in the real game (web/scripts/map5-e2e.mjs: dev server, GPU, real scatter / props / HUD)

- **Dragon's Spine on skis, zen**: Ride the Dragon + Organ Grinder; judged 99 (Line 25, Fluidity 24.3, Control
  25, Air & Style 25); 54 mph average, 85 mph top, 36 m biggest drop, 4.0 s longest air; no crash, no console
  errors.
- **The Keel → the Dragon's Tooth on a board, zen**: Keel Over + Pulling Teeth; judged 96; 10 named features
  linked, including Keel Leap and the Dragon's Tooth (36 m drop); no console errors.
- **Twins → Staircase on a board, zen** (before the final fork / gap changes): Fin Hopper; judged 92; Twin Hop
  and Stair Hop 1 scored as ridge hops.
- **Dragon's Spine, challenge**: skis 124.1 s, 10/12 gates; board 127.7 s, 9/12 gates. No crashes, no console
  errors. With the final medals (gold 111.7 s, silver 130.9 s, bronze 157.9 s) both are **silver**. Gold needs
  SEND IT or a tighter line than the bot's.

### Fuzz, units, structures

- `map5-fuzz.mjs`: 40 runs × 40 s (96 k frames) of random inputs from random starts anywhere on the face. No
  NaN, never under the snow, never stuck.
- `map5-unit.mjs`: 61/61.

### Other maps unchanged

The only shared change is one import line. The suite (unittest, physics-fuzz, physics-tricks,
jumps-valcrest --check, equipment-check, map3-unit / fuzz / structures, map2-bot --verify --tuck --check,
map4-unit, GPU lobbytest) passes. map5-unit checks that loading another map's tuning removes Dragonback's
knobs.

### Performance

Production build (`vite build` + `vite preview`), 1600×900, quality 1, `map3-perf.mjs` (the rider at six spots
down the Spine line, the quietest of three windows per spot), Dragonback and Ravenspire measured back to back:

| map | GPU avg | worst spot | per spot (2 / 20 / 38 / 55 / 62 / 80 %) | draws | triangles |
|---|---|---|---|---|---|
| dragonback | 11.6–11.8 ms | 13.3–14.9 ms | 10.4 / 12.3 / 10.9 / 11.0 / 11.4 / 13.3 | 166–430 | 1.5–1.9 M |
| ravenspire | 11.9 ms | 14.9 ms | 10.3 / 11.0 / 11.3 / 11.9 / 12.1 / 14.9 | 188–491 | 1.6–1.9 M |

Inside the 14–16 ms target, at Ravenspire's cost:
- there's no forest on the face (~4,400 larches low down only);
- props are merged into about a dozen draws;
- ridges are terrain, not meshes.

**Pop-in** (`gfxpopin.mjs`, quality 1, 25 s at 25 m/s, five runs): 0 tree, shadow, scatter and terrain-LOD pops
per second, no texture uploads during the ride. Every Dragonback material (props, flags, terrain) is compiled by
the prewarm. The first run compiled nothing during the ride. The later runs report **one shader compile 3 s
into the ride, `liftMetal`**, which isn't Dragonback code:
- the shared `Lifts` system keeps an empty "Cables" mesh even on maps without lifts;
- an empty geometry's bounding sphere sits at the world origin, so the mesh is "drawn" whenever the frustum
  contains (0, 0, 0), which compiles its render-target variant (srgb-linear);
- on this map the origin (mid-face, 2 km under the snow) enters the view just below the start;
- prewarm only un-culls shadow casters, and this mesh isn't one.

Fix in shared code (not touched here): skip the Cables mesh when there are no lifts (lifts.js), or have prewarm
un-cull every mesh. Valcrest and Ravenspire report 0 in the same runs.

Load is ~13–20 s on the dev server, including a 6–10 s prewarm; terrain generation is ~3 s in node.

**GPU contention.** A later back-to-back run, with another session using the GPU, measured Dragonback 16.5–19.3 ms
against Ravenspire 19.2 ms average. The ratio holds; the draws and triangles are identical to the quiet run.

---

## 7. Known issues and ideas

- **The light is the shared sun.** The lighting (`scene.js LIGHTING`) is read at module load, before a map is
  chosen, so a per-map time of day would need a boot-order change in shared code. Dragonback's identity
  comes instead from:
  - the striped north/south flanks;
  - the serrated summit ridge;
  - the orange bivouacs and prayer flags.

  `?sun=bearing,elevation` (a debug override) shows what a low evening sun would do.
- **Line goals need a clean, ordered run.** The bot completes most of them, but not every run: a hop that
  lands 12 m off the target's crest isn't "on" it.
- **At 32 m/s (72 mph) the short stair spurs and the Scale Jump curve are too tight to follow.** Riders fly
  straight past the turn-off. That's by design: check your speed.
- **Knife-edge crests are hard to hold on a board at full speed.** Crossing a crest diagonally at 30 m/s is
  a kicker, and a rider who over-corrects zig-zags across it in short hops (the Raven's Beak effect). Ride it
  straight.
- **Respawns** put you on the crest of the ridge you crashed on (respawn.js), rolling at 8 m/s. Without that,
  a respawn on a knife edge slid you off sideways at standstill.
- **One shader compile 3 s into a ride** (`liftMetal`, the shared empty lift-cable mesh), described in §6
  under Pop-in. It's a one-line fix in lifts.js or prewarm.js, left for the integration session.
- **Cornices are visual only**, so they're kept off every rideable crest (`corniceOk`), as on Ravenspire.
- **The prayer flags** only flutter in the vertex shader; there's no cloth physics.
- **Sluff** is a drag, not moving snow. A real sluff slide that chases you down a channel (the research
  suggests it) would be the next step.

Ideas:
- a timed "line challenge" built on the line goals;
- a sluff that follows you down a gully;
- a replay camera for the biggest ridge hop;
- per-map light, once the boot order allows it.
