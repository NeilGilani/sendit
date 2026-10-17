# Map 4: Voltage Park — a fast event terrain park, and grinding

A fast event terrain park in the spirit of Olympic slopestyle and the Red Bull park builds. You drop off a scaffold
start ramp onto a 30° summit pitch, ride three rail sections, drop in again (the Plunge, then the 28° Launch) and hit
a line of big tables. The line ends on **Megawatt**, a big-air-size kicker in the course, and a road gap into the
finish. Around it:

- three park lanes, each with its own identity: Spark (flow), Current (the Triple Stack), High Voltage (pro);
- the Grid (a jib garden), the Stairway (a step-down / step-up line) and a row of hips;
- two spines down the fall line between the lanes (air them sideways into the next lane);
- side hits, a transfer hip, a canal gap and two quarterpipes;
- a 22 ft superpipe and the Tower, a 33 m scaffold big air;
- a finish arena with grandstands, a big screen and a DJ booth.

It also brings the game's first **grinding** mechanic (physics/grind.js): rails, boxes, tubes and ledges, on skis
and on a snowboard.

```
npm --prefix web run dev -- --port 5188 --strictPort
http://localhost:5188/?map=voltage-park&ride                    straight into a ride (the lobby's Maps tab lists it too)
http://localhost:5188/?map=voltage-park&ride&equip=snowboard
http://localhost:5188/?map=voltage-park&challenge               the judged slopestyle run (Challenge)
node web/scripts/map4-unit.mjs                     registry, tuning, shapes, EFH landings, rails, grind, pipe, judge
node web/scripts/map4-rails.mjs 8 --check          every rail locks and rides at 6 / 8 / 10 m/s, skis and board
node web/scripts/map4-bot.mjs both all clean --check   line bot: every line, rail, jump and spine (clean | trick | human)
node web/scripts/map4-jumps.mjs                    every jump's designed window (m/s, km/h), table, landing, height
node web/scripts/map4-speed.mjs ski 2 0.5          a rider straight down a line: speed every 25 m, lip speeds, airs
node web/scripts/map4-fuzz.mjs 60 30               random riders at the rails, drop zones and anywhere
node web/scripts/map3-perf.mjs http://localhost:5188 1600 900 1 60 voltage-park   GPU / CPU / draws along the course
```

Research behind the design: [docs/map4-research.md](map4-research.md).

---

## 1. The park

Local frame (layout.js): **u** = metres down the fall line from the start gate (world x = −520 + u; the hill
falls toward +x / east), **v** = metres across (world z; + = skier's right). The sun comes from the
south-south-east, so the park is cross-lit from the right.

| u (m) | pitch | what is there |
|---|---|---|
| −40…0 | 4° | the start deck, the start hut and the **Start Ramp**: a scaffold deck 9 m up, rolled into at 36° |
| 0…50 | **30°** | the summit drop (every lane starts on it) |
| 50…265 | 13° | the rail bench: slopestyle sections 1 and 2, the Grid, the lanes' rails and small tables |
| 265…300 | **28°** | **THE PLUNGE**, the drop-in to section 3 |
| 300…385 | 14° | section 3, the lanes' last rails, the Spark rollers |
| 385…455 | **28°** | **THE LAUNCH**, the drop-in to the jump line (every lane's big jumps sit under it) |
| 455…760 | 18° | the jump line (Lightning, Thunder, Voltage), the Stack, the Stairway, the hips, the Tower's landing, the pipe |
| 760…810 | **30°** | the drop into **Megawatt** |
| 810…1110 | 18° | Megawatt, the Gap, the Canal, the step-ups, the last hips, the quarterpipes |
| 1110…1170 | 9° | the run-out into the arena |
| **1140** | | **the finish line** (the arch, grandstands, the big screen, the DJ booth) |

The slopestyle course is 1140 m long with 384 m of drop (was 795 m / 225 m). Beijing's course was 600 m / 198 m and
Livigno's 650 m / 165 m: this one is longer and steeper, a game's version. The rhythm alternates **drop, rails, drop,
jumps, drop, mega**. Each steep pitch is a drop-in that builds speed for what's below it; each bench carries the
features that want a steadier speed. The park is groomed corduroy over ±300 m across, between forested banks, with
mountains and a horn behind the start.

**Speeds** (map4-speed / map4-bot, see §6):

- off the start ramp: 15 m/s;
- 18–20 m/s (65–72 km/h) at the bottom of the summit drop;
- rails at 10–13 m/s;
- 25 m/s (90 km/h) at the bottom of the Launch, tucked;
- the big tables at **19–21 m/s (70–76 km/h)** at the lip;
- Megawatt at **21–22.5 m/s (77–81 km/h)**;
- the Tower's in-run reads 93 km/h before the kicker.

### The slopestyle course (centre, v ≈ −16…+16)

Three rail sections, each with three parallel options (pick your line), then five jumps:

| section | left | centre | right |
|---|---|---|---|
| **1 · The Circuit** (u 100) | Flat-Down rail (3.5 m flat + 7.5 m at −24°), gap-on | 12 m ride-on box | 9 m down rail, gap-on |
| **2 · Surge** (u 185) | Down-flat-down rail (3 × 3.5 m) | 10 m rainbow box (0.7 m hump) | flat-down tube (Ø 0.9 m), ride-on |
| **3 · Overload** (u 322, under the Plunge) | 13 m C-rail (38° curve) | kinked handrail beside a 9-step stair set | 2.4 m gap to an 11 m down box |

| jump | lip | kicker | lip angle | table (lip → knuckle) | designed window (lip speed) | sweet spot | deck height |
|---|---|---|---|---|---|---|---|
| **Lightning** | u 495 | 4.4 m | 29° | 29 m | 18.6–21.6 m/s | 36 m out, at 19.5 m/s (70 km/h) | 15 m |
| **Thunder** | u 610 | 4.5 m | 30° | 31 m | 19.1–22.0 m/s | 38 m out, at 20.0 m/s (72 km/h) | 16 m |
| **Voltage** | u 720 | 4.8 m | 31° | 33 m | 19.7–22.4 m/s | 40 m out, at 20.5 m/s (74 km/h) | 17 m |
| **Megawatt** | u 880 | 5 m | 32° | 36 m | 20.5–23.1 m/s | 42 m out, at 21.2 m/s (76 km/h) | 18 m |
| **The Gap** (road gap) | u 1015 | 5 m | 24° | 35 m (a 23 m channel with a road across it, then a 12 m landing mound) | 19.0–21.3 m/s | 40 m out, at 19.6 m/s (71 km/h) | 12 m |

- **The tables.** Every table has ride-up ramps at 20° beside its kicker (go around and roll the deck). Neon
  strips edge the decks and a blue dye line marks every lip and knuckle. Each big landing has a banner with the
  jump's name on its sidewall and yellow sweet-spot markers either side.
- **The Gap.** Too slow and you hit the landing mound's face.
- **Megawatt's drop zone** (key 4) puts you just over Voltage's knuckle. You drop 17 m down its landing into the
  30° pitch, and a full tuck arrives in Megawatt's window.

### The park lanes (right side)

| lane | v | identity · what is there |
|---|---|---|
| **Spark Lane** (green ●) | 70 | **flow.** Small tables on the bench (6–10 m), a box, a fat tube and a ledge, a down box, pump rollers. Under the Launch a **stacked double** (two 14 m tables back to back), a butter box, two more tables (16 / 18 m), three rollers, a **side hit**, the **Spark QP** (3.2 m) |
| **Current Lane** (blue ■) | 125 | **the Triple Stack.** A table, flat-down / box / kink / tube on the benches. Under the Launch **three 18–19 m tables back to back**, ridden upright at ~14.5 m/s (each landing runs straight into the next in-run). The **Current Transfer** (a hip at v 148 that sends you into High Voltage), a **step-down** and a 22 m table |
| **High Voltage** (pro, black ◆) | 186 | down-flat-down, rainbow rail, 13 m down rail, a kink; under the Launch two pro tables (22 / 27 m, 16–17.5 m/s), a side hit, **the Canal** (a 14 m-wide ice-blue channel, then a 9 m landing mound), a **step-up**, the **Voltage QP** (5.2 m) |
| **The Grid** (jib garden, orange ⬭) | 236–258, u 50–262 | 16 jibs in seven rows every 30–33 m, three columns: boxes, tubes, rails, a flat box, an A-frame, a 14 m rail, a kink, an S-rail, a rainbow box, a down box, a ledge, a battleship, a cannon, a finale DFD |
| **The Stairway** (step line) | 245, under the Grid | **Stair Drop 1** (a step-down: the deck falls away 6°, 20 m table), **Stair Up** (a 32° kicker over a 7 m table to a deck 1.8 m above the lip), **Stair Drop 2** (24 m), the **Stairway Hip** |

- **Spines** (shapes.js `SpineFeature`) are ridges down the fall line between two lanes:
  - **The Spine** runs between Spark and Current (u 598–690, 3.2 m tall, 40° faces).
  - The **Stairway Spine** runs between High Voltage and the Stairway (u 812–905, 3.6 m, 42°).
  - Ride up a face across the ridge, air the crest sideways, land on the far face: you are in the next lane with
    all your speed. The bot's air across is 0.8–1.5 s at 12–16 m/s, landed clean (`landRedirect`, §5).
- **Branching lines.**
  - Spark → the Spine → Current → the Current Transfer → High Voltage, in one run.
  - The Stairway → the Stairway Spine → High Voltage's step-up.
- **Signs and arches.** Every lane feature has a coloured sign on a post, as a resort would mark it. Lane entries
  and the drops have their own arches.

### The left side

- **The Conduit — the 22 ft superpipe** (u 485–725, v −95).
  - Wall: 6.7 m walls, 7.2 m transitions to 82° vert, 6.4 m flat bottom, 20.8 m coping to coping, 240 m long, 7 m decks.
  - The pipe sits on the 18° slope (the FIS spec is 18° ± 1°). The walls grow in over the first 14 m and fade out
    over the last 22 m.
  - Above 21 m/s in the pipe the snow scrubs speed (its old feel; faster and the airs go long and low).
- **The Tower — the big air** (deck at u 460, v −172).
  - A 33 m scaffold with a 9° start deck and a **124 m in-run at 38°**.
  - A 5.5 m kicker at 33°, a 34 m rising table and a 40° landing.
  - Designed for 19.8–22.1 m/s at the lip (sweet 20.4 m/s, 41 m out). A tucked rider arrives at 20.2–21.7 m/s and
    is in the air for 2.4–3.5 s, with slow motion at the apex.
  - The drop zone sits on the deck. Its sheer sides are scaffold.
- **Hip Row** (v −228…−242): **Hip Left** (u 520, 30° left), **Hip Right** (u 632, 30° right), **Hip Three**
  (u 880) and **Hip Four** (u 995). Their tables are 13–16 m, and the kicker and its landing point across the slope.

### Best lines

1. **The slopestyle** (drop zone 1 or Challenge).
   - **Start.** Roll off the start ramp and down the summit drop at 65–70 km/h.
   - **Rails.** Circuit Flat-Down → Surge DFD → down the Plunge → Overload C-Rail. That is the hardest,
     highest-scoring line; the centre (box, rainbow, handrail) is the stylish one, and the right side (down rail,
     tube, gap box) the fast one.
   - **Jumps.** Drop into the Launch, check to ~70 km/h, then Lightning → Thunder → Voltage. Drop into the Megawatt
     pitch, send Megawatt at ~78 km/h, then stomp the road gap.
   - Clean bot runs take 82–84 s and land 4–5 of the 5 jumps in the sweet spot.
2. **High Voltage.** DFD → rainbow → 13 m down rail → kink, down the Launch into two pro tables, the side hit,
   the Canal, the step-up and the 5.2 m QP.
3. **Lane hopper.** Spark Ledge → Down Box → Spark Double → **the Spine** → **Current Transfer** → the Canal →
   the step-up: three lanes in one run.
4. **The Triple Stack.** Drop zone 7. Three tables back to back, upright, no speed check, then the step-down
   and Current 3.
5. **The Stairway.** Drop zone 9: step-down, step-up, step-down, then over the **Stairway Spine** into High
   Voltage's step-up.
6. **Megawatt.** Drop zone 4: down Voltage's landing, Megawatt (2.4–2.8 s, slow motion), the road gap.
7. **The Tower.** Drop zone 5: 93 km/h on the in-run, one huge air, room for a 720–1080.
8. **The Grid.** Snake the jib garden. A grind that ends straight on the next rail banks with a **transfer** bonus.
9. **The Conduit.** Drop zone 6: carve up each wall steeply (60–75° across the pipe) and pump the transitions.

### Drop zones (practice): keys 1–9 / d-pad ◀ ▶, **T = back to the last feature you hit**

Each drop zone is at the top of a steep in-run:

| key | drop zone |
|---|---|
| 1 | Start Ramp · Slopestyle (the scaffold deck) |
| 2 | The Plunge · Section 3 (top of the 28° Plunge) |
| 3 | The Launch · Jump Line (top of the 28° Launch) |
| 4 | Megawatt · Mega Kicker (over Voltage's knuckle) |
| 5 | The Tower · Big Air (scaffold deck) |
| 6 | The Conduit · Superpipe |
| 7 | Triple Stack · Current Lane (top of the Launch) |
| 8 | High Voltage · Pro (top of the Launch) |
| 9 | The Stairway · Step Line (top of the Launch) |

**T** puts you 26 m before the last rail you locked onto, or 45 m before the last kicker you launched off (the
big air: its deck). Use it to hammer a feature until the timing is right. R / Y still goes back to the start.

---

## 2. Code

```
web/src/physics/grind.js       the grind (opt-in through course.rails): lock-on, balance, switch-ups, pops, scoring
web/src/maps/voltage/
  index.js     registerMap (id 'voltage-park', order 4), thumbnail, lobby spot; loads props.js + hud.js lazily
  layout.js    every feature in one place: PROFILE (+ PITCH, the drops), START_RAMPS, JIBS, JUMPS, GAPS, SPINES,
               LANES, LANE_JUMPS, STEPS, HIPS (hips, side hits, the transfer), QUARTERPIPES, ROLLERS, LANE_JIBS,
               GRID_JIBS, PIPE, BIG_AIR, DROP_ZONES, LINE_GOALS (tunables)
  course.js    VoltageCourse: base snow (profile, banks, mountains, a horn), feature builders (tables, step-ups
               with a window from the flights, gap jumps, spines, scaffold start ramps, QPs, rollers, jibs +
               mounds + ramps + the stair set, the pipe, the big air), the hooks
  shapes.js    ProfileBuilder (pen: lines, arcs, faces, the constant-EFH landing, back to the snow),
               ProfileFeature (1D profile × width, raked sidewalls, a side profile), PipeFeature, SpineFeature
               (a ridge down the fall line), FeatureIndex
  park.js      per-rider park logic: pipe / QP vert, pumping, wall alignment, pipe landing spotting, pop and
               landing-zone feedback, rails → line goals, the in-run speed prediction
  scoring.js   SlopeJudge: the judged slopestyle run (Challenge results, zen run card)
  hud.js       balance meter, feedback pops, in-run speed gauge, judged card, T practice key, grind audio; the
               event energy: drop-in calls, launch speed off the lips, MEGA AIR + a crowd roar, top speed / longest air
  props.js     park snow mesh (dye lines), rails / boxes / tubes on legs, the scaffolds (start ramp, the Tower), the
               road and the canal in the gaps, arches, crowd, fences, light towers, flags, finish arena, screen,
               DJ booth, neon deck edges, lane signs
  sparks.js    rail sparks / box snow (one Points cloud, normal blending)
  tuning.js    VOLTAGE_PHYSICS (per-map physics) and VOLTAGE_CAMERA
  noise.js     value / fbm / ridged noise, mulberry32
web/src/maps/builtin.js      one line: import './voltage/index.js';
web/scripts/map4-*.mjs        lib (headless park + player), unit, rails, bot, fuzz, jumps (the designed windows), speed (a probe)
```

### Shapes: every park feature is an analytic surface over the base snow

The base snow is a smooth height function on the game's 2049² grid (1 m spacing, 2 km tile). Every park feature
is an analytic surface **above** it, through the existing features hook (`terrain.features.heightAt`, which only
ever raises the ground). The physics reads the exact shape; the meshes (props.js) are drawn from the same
functions, 2.5 cm above it. So lips are crisp, the 1 m grid never smears a knuckle, and the base terrain, its
far LOD and the tree scatter are untouched by the park.

- **ProfileBuilder** is a pen walking down an axis in plan (any yaw). It has straight lines, circular arcs (the
  transitions), steep faces, `toBase(R)` (round back into the snow) and `efhLanding()`. `build()` samples the
  profile every 0.25 m.
- **ProfileFeature** is level across within a half-width hw(a), with raked snow sidewalls down to the snow
  (1.1 × height). It can carry a **side profile**: beside a table's kicker the deck is reached by a 20° ride-up
  ramp instead of a wall. Thin edges are optional (the scaffold in-run).
- **Kickers** are built from a transition radius solved for the kicker height, with the last 2 m straight
  (research: no surprise inversions).
- **The constant-EFH landing** (McNeil & Hubbard; [research §5](map4-research.md)) is built as follows:
  - Flights from the lip are simulated with the game's air drag and a design pop (1.2 m/s along the lip normal).
  - vMin is the flight that just clears the knuckle. The knuckle then rounds over (radius 0.22 × table).
  - The landing is marched in 0.05 m/s steps of take-off speed. At every step the surface turns so that the
    flight hits it with only **3.4 m/s into the slope** (EFH ≈ 0.6 m). It is kept between 22° and **38°**.
  - Where even 38° would leave more than 6.8 m/s into the slope, the designed window ends. The landing runs on
    straight and then rounds out (R 30 m) into the run-out; it stops wherever that run-out transition would meet
    the snow.
  - **The sweet spot** is at 45 % of the constant-EFH part, 20–26 m from the lip on the big tables (research:
    17–23 m).
- **Jibs** (`addJib`):
  - The rail's top line is data (course.rails).
  - A snow **mound** fills up to the rail minus its clearance wherever the rail stands higher over the slope
    (flat sections), ramping down at 35° at its ends.
  - The **on-ramp** is either flush (it rises ~13° over the snow to exactly the jib's start, so you ride on) or
    gap-on (a straight ramp to 5 cm *above* the rail's start, at the rail's first grade + 9° (+ 14° for gaps of
    2 m or more), so a rider who rolls it comes down onto the start of the rail and a pop lands further along).
  - The Overload handrail has a 9-step snow **stair set** beside it (treads and risers you can ride down).
- **PipeFeature** is a cross-section of flat bottom, circular transitions to 82°, 82° wall to 6.7 m, a level
  deck and a 32° outer bank, on an axis that follows the slope.
- **Gap jumps** (`addGap`): a kicker, its back face straight down to the snow, a channel of bare snow (the road /
  the canal are drawn in it), then a landing mound. The mound has a 40° face up to a knuckle `landH` m over the
  snow and a constant-EFH landing. The channel is open at the sides: fall in and you ride out around the mound.
- **Spines** (`SpineFeature`): a ridge down the fall line whose crest follows the base slope. The cross-section is
  a rounded crest (R 1.6 m), faces at 40–42° and rounded feet (R 4 m). The ridge grows in over 12 m and fades over
  10 m.
- **Step-ups** (`addStepUp`): kicker, a short table under the flight, a 30° face up to a deck above the lip, the
  deck falling 10°. The landing window (just over the step → the end of the deck, sweet 3 m on) is worked out from
  the same flights the EFH landings use (`flightLanding`).
- **Scaffold ramps** (`addStartRamp`, `addBigAir`): a raised deck, a convex roll-in, a straight in-run, then
  either back onto the snow (the start ramp) or the kicker (the Tower). The Tower's in-run stops early when the
  kicker's transition would dip into the snow, so a steep hill under it can't bury the transition (a buried
  transition is a kink that throws 7 m/s away).

### Contracts with the rest of the game (all inside maps/voltage)

- **Trails** (the mountain / trails contract):
  - `registerMap({ trails })` lists nine trails: slopestyle (park), Spark (green), Current (blue), High Voltage
    (black), the Grid (park), the Stairway (black), Hip Row (blue), the Conduit (black) and the Tower
    (double-black).
  - Each has `{ id, name, difficulty, description, length, vertical, featured? }`. Length and vertical are
    measured from the start to the finish line on the snow, as `scripts/trails-check.mjs` does, by
    `course.trailInfo()`. map4-unit checks they still match `TRAIL_SIZE` in index.js after a layout change.
  - `maps/adapters.js` (the trails session's block) keeps the mountain card. Its trail list mirrors these; the
    registry uses the map's own.
  - `course.trailSpawn(id) → { x, z, heading }`: a drop zone, or the top of the lane. The data is `TRAILS` in
    layout.js.
- **`runCompleted`** `{ mapId, trailId, distance, time, score, judged? }` goes out on the state.js bus when a run
  reaches the finish (zen `runComplete` or Challenge `runFinished`) — park.js.
  - `profile/tracker.js` also emits it for every map. The park only announces a finish nobody announced in the
    last 2 s (the rule the other maps use), so there is one event per run.
  - The trail is the one most of the run's features (takeoffs and grinds) were on, else the trail it started on.
  - The clock and distance start at the top, at a drop zone or at the spawn.
- **Atmosphere — the night final** (`VOLTAGE_ATMOSPHERE` in tuning.js, applied by `world.js applyMapAtmosphere`).
  - It starts from the `night` preset.
  - A white-blue key light (the floodlights, intensity 0.15) shines high from the ESE, down the run.
  - The horizon has a violet event glow (#26204c), with fog #8a8fd0, exposure 2.2 and ambient 3.6.
  - The sky is dark and the landings stay readable; the neon, the lamp heads and the banners carry the colour.
  - It was picked from six `?atmo` previews: night, a magenta dusk (too pink), a lavender blue hour (washed out),
    and three night variants (the two brightest read as daytime).

### Hooks into shared files (all opt-in; the other maps behave exactly as before)

| file | change | effect |
|---|---|---|
| player.js | `State.GRIND`, `this.grind = new Grind(…)` when `course.rails`, `grind.detect()` after ground / air steps, `case State.GRIND` | grinding (no rails → no Grind) |
| player.js | `course.onPlayer?.(player)` | a map's per-rider hooks (Voltage: park.js) |
| player.js | landing yaw on a steep wall uses `pathYaw` when `PHYSICS.wallAlign` | pipe landings judged along the wall |
| physics/edge.js | `pathYaw(v, n)`; self-align uses it when `PHYSICS.wallAlign` | the gear tracks its path up a pipe wall |
| config.js | `PHYSICS.wallAlign: false`, `PHYSICS.grind: null` | defaults (no-ops) |
| rider.js | `State.GRIND` poses: balance lean (roll in a 50-50, tip toward nose / tail in a slide), arms out (the high-side arm up), skis: shoulders and head down the rail in a slide; board: head down the rail; press / grab on the rail | pose / animation only |
| activities.js | `course.challenge.judge()` → the medal comes from the judges, `res.judged` | a judged Challenge |
| ui.js | `r.judged` → score instead of time, its own rows | results card |
| physics/flow.js | `flow.summary === false` skips the freeride (FWT) card | the park shows its own judged card |
| features.js | none (the map uses `park: false` + `heightAt` + `buildProps` like Ravenspire) | |

Every Valcrest physics bench prints **byte-identical** output before and after (physics-sim, -scenarios, -tricks,
-kicker, -variants, -release, physics-course carve / park / flip / straight, equipment-check, compared against a
`git archive` of the base commit a5e4eba).

---

## 3. Grinding (physics/grind.js)

Rails are **data**. Any map can add them:

```js
course.rails = [{ id, name, kind: 'rail' | 'box' | 'tube' | 'ledge', pts: [[x, y, z], …],   // the top line (where the gear base rides)
                  half: 0.04, difficulty?: 1, section?, lane? }];
```

A course with rails gets one `Grind` per Player. It builds an index of segments, with tangents, arc lengths,
kink angles and horizontal curvature, in a 6 m spatial hash.

### Controls

| | on a rail |
|---|---|
| **lock on** | come down onto it (or ride onto a flush box) lined up with it; your gear decides the trick |
| **A / D** (stick) | balance: lean against the fall (the meter tips; past the edge you fall off) |
| **Space tap** | hop: **switch-up** — steer during the hop to turn 90° (50-50 ↔ slide) or 180°; you lock again on the way down |
| **Space hold → release** | **pop off**. Steer while loading to wind up a spin out; S / W preload a backflip / frontflip, as on the snow. Release **right at the end** of the rail for a **perfect pop**; still loading when the rail ends pops late |
| **W / S** (not loading) | nose / tail **press** (a 50-50 style bonus; harder to balance) |
| **Shift** | grab on the rail (style; harder to balance) |
| roll off the end | the gear turns back out of a slide by itself (no fake 180) |

### Lock-on

Each grounded or air step, `detect()` looks at the segments in the rider's hash cell.

- **Where.** The feet must be within the rail's half-width + **0.34 m** of the top line (in plan).
- **When.**
  - In the air: from 0.32 m above to 0.30 m below it, coming down onto it.
  - Riding a flush ramp: within 0.16 m.
  - Arriving a hand-width low at the very start of the rail (off a gap-on ramp) also counts: the feet catch its end.
- **Speed and line.** At least **1.6 m/s** along the rail, and crossing it at under **52°**. Crossing more squarely
  **clips** it instead: a stumble and 25 % of your speed lost.
- **Air assist (gentle, not a magnet).** In the last 0.35 s before the feet reach a rail's height, a rail within
  0.9 m to the side pulls you onto its line at up to 7 m/s². Research: snap within a cone, never from afar (SSX's
  "magnetic rails" were its most criticised feature).
- **Trick from the gear's yaw against the direction of travel:**

  | Gear yaw vs travel | Trick |
  |---|---|
  | within ~45° of 0° | **50-50** |
  | within ~45° of 180° | **Switch 50-50** |
  | within ~45° of ±90° | **Boardslide / Lipslide** (snowboard) or **Slide / Lipslide** (skis) |

  - Boardslide or lipslide depends on whether the nose or the tail crossed over the rail, which comes from the
    side you came from.
  - A board's FS / BS is whether the toe edge (chest) faces down the rail.
  - Up to 42° off an alignment still locks, but the balance starts tipped.
- **Spin on.** The rotation in the air before the lock, in 90° steps (≥ 180°): **270 on**, **360 on**.
- **Slam.** Coming down faster than **9.5 m/s** into the rail is a crash.

### On the rail

- **Speed.** Gravity along the rail, friction, and drag:

  | Kind | Friction (μ) |
  |---|---|
  | rail | 0.045 |
  | box | 0.040 |
  | tube | 0.055 |
  | ledge | 0.060 |

  Slides are × 1.5; drag is a = 0.003 v². Kinks and curves keep you locked. Under **0.7 m/s** the grind
  **stalls** (you step off the side, half points); a rainbow needs speed.
- **Balance** b ∈ −1…1 is an unstable pendulum: b″ = λ²·b − c·b′ + G·steer + noise.
  - **λ² by kind** (how fast a lean grows):

    | Kind | λ² |
    |---|---|
    | rail | 3.4 |
    | tube | 2.2 |
    | ledge | 1.8 |
    | box | 1.4 |

  - **λ² multipliers:**

    | Condition | × λ² |
    |---|---|
    | slide | 0.85 |
    | full press | 1.6 |
    | grabbing | 1.25 |
    | time on the rail | 1 + 0.18 per second (long rails get harder) |

  - **Noise:** 1.5 / 1.1 / 1.0 / 0.8 (rail / tube / ledge / box), growing with speed. A kink gives a kick
    proportional to its angle × speed. A curved rail pushes you outward with v²κ/g.
  - **Steer gain** G = 8.5 (× 0.4 while loading a pop: the rest winds up the spin). **Damping** c = 2.6.
  - **Lock-on starts** tipped by the misalignment and the lateral offset.
  - At |b| = 1 you **bail**: off the side and a crash on the snow below.
- **Calibration** (scratch test, a 60 m rail at 8 m/s, a delayed digital-key "player"):
  - **No input:** off a box after ~4 s, a tube ~3 s, a rail ~2 s.
  - **Newbie** (0.3 s reaction): survives boxes, falls off most rails.
  - **Average player** (0.22 s): rides them all.

  So short features forgive, and long rails, presses and grabs need active balance.
- **The hop** (switch-up): 2.3 m/s up off the rail, the balance frozen, the gear turning 10 rad/s while you
  steer. It snaps to the nearest alignment within 32° on the way down (beyond that, a wobble).

### Leaving and scoring

- **Ways to leave:** **end** (roll off), **pop** (released: perfect within 0.16 s of the end), **stall** or
  **bail**.
- **The pending grind.** The grind is scored on exit and **banked on a clean ride-away**:
  - A clean landing or 0.35 s on the snow banks it.
  - A sketchy landing banks half.
  - A crash before the ride-away loses it ("GRIND LOST").
  - Locking onto another rail first banks it as a **transfer** (+120).
- **Points.**
  - Base: (40 + 16/m + 20/s) × multipliers:

    | Multiplier | Value |
    |---|---|
    | kind | rail 1.15, box 0.85, tube 1.0, ledge 0.95 |
    | rail difficulty | 0.7–1.5 (kinks, rainbows, C-rails) |
    | slide | × 1.2 |
    | lipslide | × 1.35 |
    | switch | × 1.25 |
    | press | up to + 45 % |
    | grab | + 25 % |
    | "Locked-in" (avg balance < 0.22, never past 0.6) | × 1.15 |

  - Bonuses: switch-up +110, spin on +45 per 90°, kink +35, perfect pop +60, spin out (rail to landing in 90°
    steps ≥ 180) +45 per 90°.
- **Label.** For example "Locked-in 270 on FS Boardslide to 50-50 · 12 m · 360 out · perfect pop".
- **Line chain.** Grinds feed the flow line chain (physics/flow.js), and a grind keeps it alive. Repeats count
  half in the multiplier.
- **Line goals.** Grinds advance the line goals by rail name and section.
- **Events:** `grindStart`, `grindTrick`, `grindKink`, `grindHop`, `grindEnd`, `grindScore`, `grindLost`,
  `grindClip` and `railSpark` (per step).

### Feel

- **Sparks** (sparks.js, driven by grind.js's `railSpark`, which carries where the gear is and which way it is
  going):
  - Saturated orange sparks thrown back and out at foot level off metal rails and tubes.
  - A faint dusting of snow off boxes and ledges.
  - Bursts on lock-on and at kinks.
  - Normal blending: additive orange on sunlit snow sums to white and was invisible.
  - Point size is clamped, so nothing fogs the rider.
- **Sound.** The grind loop (assets/audio/grind_loop.ogg) plays with pitch and volume set by speed and rail kind,
  plus a synthesized clank on lock-on.
- **HUD.** The balance meter shows the live trick name, the rail and the length; switch-up, banked and lost pops
  appear on top.
- **Rider.**
  - Balance lean and tip, arms out with the high-side arm up.
  - Skis: the shoulders and head turn down the rail in a slide. Board: the head turns down the rail.
  - Squash on the lock.

---

## 4. Skill, timing, scoring

- **Pop timing.** At every lip, PERFECT / GOOD / EARLY POP, from the game's existing pop timing (`lastPopQ`).
  This also scales the spin / flip set.
- **Landing zone.** Every jump landing is placed against that jump's own design: CASED THE DECK, KNUCKLED, SHORT,
  **SWEET SPOT** (±7 m of it; + 60 points), DEEP · CLEAN, OVERSHOT, with the distance from the lip.
- **In-run speed gauge.** Approaching a jump, a gauge shows that landing's designed lip-speed window and sweet-spot
  speed, and your predicted lip speed: gravity, snow friction and air drag at your current tuck along the in-run,
  then the kicker's climb. The tips are "TOO SLOW · TUCK", "TOO FAST · CHECK SPEED (S)" and "SWEET SPOT SPEED".
  Speed control is the skill on a table (research: Livigno's speed problems).
- **Pipe feedback.** "4.2 M OUT" on every pipe and QP air.
- **Event energy** (hud.js):
  - DROPPING IN · THE PLUNGE / THE LAUNCH and MEGAWATT · SEND IT at the top of the steep pitches.
  - The launch speed off every big lip (MEGAWATT · 79 KM/H).
  - **MEGA AIR · 3.1 S** (or HUGE / SKETCHY) with a crowd roar off the biggest airs, and a cheer on a big jump's
    sweet spot.
  - The run's top speed and longest air on the judged card.
  - The camera opens up to +16° FOV in the top of the speed range, with +8° more entering SEND IT.
  - A touch of apex slow motion (0.72×) only off airs of 2.7 s and more, 7 m and more over the snow: Megawatt, the
    Tower and a Voltage sent deep.
  - The wind roar layer is at full (the audio's speed wind keeps building up to the 27 m/s top speed).
- **Balance.** The rail meter (above).
- **Line chain and SEND IT.** The flow layer is on (physics/flow.js): every different move raises the multiplier,
  repeats count half, and the meter fills to SEND IT.
- **Line goals:**

  | Goal | Features in order | Bonus |
  |---|---|---|
  | **Rail Triple** | Sections 1 → 2 → 3 | +1500 |
  | **Jump Line** | Lightning → Thunder → Voltage → Megawatt | +2600 |
  | **Full Slopestyle** | all eight (three rail sections, five jumps) | +5000 |
  | **Triple Stack** | Stack 1 → 2 → 3 | +1800 |
  | **High Voltage** | DFD → rainbow → down rail → both pro tables → the Canal | +2800 |
  | **Stairway** | Stair Drop 1 → Stair Up → Stair Drop 2 → Stairway Spine | +2400 |
  | **Hip Row** | Hip Left → Hip Right → The Spine → Hip Three → Hip Four | +2200 |
  | **Grid Runner** | four grid rails | +1500 |

- **Golden snowflakes** (12): over each big lip, 3.5 m past the end of five rails (you fly through them after
  popping off), high in the pipe, over the big air, on the step-up deck and at the QP's coping.
  - Never on a rail itself: the generic pick-up puff (activities.js) would hang around a slow grinding rider like a
    cloud. That was the "white haze" bug.
- **The slopestyle judge** (scoring.js; research §7: one overall impression out of 100).

  | Part | Points | How it's scored |
  |---|---|---|
  | Sections | 0–60 | Eight sections (three rail sections, Lightning, Thunder, Voltage, Megawatt, The Gap), 0–10 each, scaled to 60. A rail section takes its best grind: (1.2 + points / 95), with repeats decaying 100 / 75 / 50 / 25 / 10 % like Tony Hawk. A jump: difficulty = 1.5 + 1.15 per 180 + 2.3 per flip + 1 for a grab + 0.7 switch (≤ 8.5), × execution (sketchy 0.5, stomped 1.08) × repeat decay, + amplitude (sweet +1.5, deep +1, knuckle −1, cased −2, overshot −1.5). A crash zeroes the section |
  | Variety | 0–20 | Different moves (spin size / direction, flips, grind sequences) |
  | Amplitude | 0–10 | Sweet spots and deep landings |
  | Flow | 0–10 | Average speed (full marks from 19 m/s), minus crashes and stalls |

  A crash also costs 6. **Medals: gold ≥ 80, silver ≥ 65, bronze ≥ 50** (winning Olympic runs score 82–93).
  - **Challenge mode.** A countdown, then a judged run to the finish. The results card shows the score / 100, the
    medal, the eight sections, variety · amplitude · flow and the medal lines (via `course.challenge.judge`). There
    are no gates, and best times and ghosts still record.
  - **Zen runs.** At the finish the judged card shows with a personal best (localStorage `sendit.park.voltage`).
- **Practice.** The drop zones and **T** (above).

---

## 5. Tunables (where to change what)

| what | where |
|---|---|
| feature placement and sizes, the profile, lanes, the pipe, the big air, drop zones, line goals | `maps/voltage/layout.js` |
| landing design (EFH target 3.4 m/s, cap 6.8 m/s, 22–38° (40° on the big jumps: `maxDeg`), the knuckle radius, the design pop 1.2 m/s, the sweet spot) | `course.js addJump` / `addGap` / `addBigAir`, `shapes.js efhLanding` |
| the pace: the profile's drops and benches, where each jump sits on them | `layout.js PROFILE`, `PITCH` |
| jib clearance, ramp angle rules, the stair set | `course.js addJib` |
| lock-on, balance, friction, hops, pops, scoring | `physics/grind.js GRIND_DEFAULTS` (per map: `physics.common.grind`) |
| pipe / QP vert (≥ 55°, ≤ 12 m/s up, ≈ 1.1 m drift back in), pumping (5.5 m/s², × 1.6 timed), the pipe's speed scrub above 21 m/s, wall alignment | `maps/voltage/park.js` (`PUMP`, `attachPark`) |
| speeds, landings, slow motion, flow, wallAlign, camera | `maps/voltage/tuning.js` |
| judging weights and medal lines | `maps/voltage/scoring.js` |
| look: dye lines, neon, signs, crowd, lights, arches | `maps/voltage/props.js` |

### Voltage's physics (maps/voltage/tuning.js)

| | value | why |
|---|---|---|
| ski / board `maxVelocity` | 27 / 26 | soft cap: the jump line is ridden at 19–23 m/s, the drops reach 25–29 (was 21 / 20) |
| board `dragUpright` / `dragTuck` | 0.0128 / 0.0060 | a low park crouch: boards reach the big take-offs like skis (tucked terminal on 18°: ski 22.4, board 21.5 m/s) |
| `smoothFollow`, `terrainImpactLoss` | 1.4, 0.3 | kicker / QP / pipe transitions are curves, not bumps: no speed lost following them (the default model took 7 m/s off a 22 m/s rider on a kicker) |
| `hardLanding` / `crashImpact` | 9 / 14 m/s into the slope | hard pack, no powder: EFH ≈ 4 m stumbles, ≈ 10 m crashes; designed landings are 3.4 m/s |
| `powderDepth` | 0.05 | groomed |
| `airSettleAngle` | 100 | out of a slide or a skid, the gear squares up in the air |
| `microHop` | 0.1 s | skimming a roller is not a landing |
| `landYawSpeed` | [16, 26, 0.85] | |
| `slowmo` | ≥ 2.7 s and ≥ 7 m up: 0.72× | Megawatt, the Tower, a deep Voltage; not the tables or the lanes |
| `flow` | on, `summary: false`, `speedFrom` 22, `chainWindow` 3.6 | line chains, SEND IT (speed alone fills it above 79 km/h); the park's own judged card |
| `wallAlign` | true | pipe walls (edge.js / player.js hook) |
| `landRedirect` | 30° | a spine transfer or a hip landed lined up with the flight: the gear pivots into the face's line (clean, not a yaw stumble) |
| `windRoar` | 1 | the low-pass wind roar at full above 16 m/s |
| ski / board pop | 2.1–3.9 / 2.4–4.3 m/s | |
| camera | maxFovBonus 16, fovCurve 1.7, airLook 0.2, airFollowY 0.1, flowFov 8 | the lens opens hard in the top of the speed range |

---

## 6. Measurements

### Speeds, air times and the jump line

**Natural speed** (`map4-speed.mjs ski 0 0.5`: half tuck, straight down the centre, popping every lip):

| where | speed |
|---|---|
| off the start ramp (u 11) | 15 m/s |
| the bottom of the summit drop | 21 m/s (76 km/h) |
| the rail bench | 18–20 m/s (riders check to 10–13 for the rails) |
| the bottom of the Plunge | 22 m/s |
| the bottom of the Launch | 25 m/s (90 km/h) |
| the jump line | 18–26 m/s |
| the Megawatt pitch | 27–28 m/s (100 km/h) |

The old park ran 15–19 m/s on its jump line and 9–10 m/s on its rails.

**Speed-checked for each sweet spot** (map4-bot, clean style; lines A / B / C × skis and board):

| jump | designed window | lip speed (bot) | km/h | air | where they landed |
|---|---|---|---|---|---|
| Lightning | 18.6–21.6 m/s | 19.2–19.9 | 69–72 | 2.1–2.5 s | sweet ×6 |
| Thunder | 19.1–22.0 | 19.2–20.5 | 69–74 | 2.1–2.6 s | sweet ×4, knuckle → deep / sweet ×2 |
| Voltage | 19.7–22.4 | 20.9–21.0 | 75–76 | 2.6–2.7 s | sweet ×6 |
| Megawatt | 20.5–23.1 | 20.7–22.1 | 75–80 | 2.2–2.8 s | sweet ×3, knuckle ×1, cased ×2 at 20.7 m/s (boards: their tucked terminal on 18° is lower) |
| The Gap | 19.0–21.3 | 19.6–20.1 | 71–72 | 2.4–2.7 s | sweet ×6 |
| The Tower | 19.8–22.1 | 20.2–20.9 | 73–75 | 2.4–2.8 s (tucked, no check: 3.3–3.5 s) | sweet / knuckle |
| High Voltage 1 / 2 | 15.3–17.8 / 17.0–19.4 | 16.2 / 17.7–18.0 | 58 / 64 | 2.2 / 2.4–2.5 s | sweet |
| The Canal | 16.3–18.0 | 17.0 | 61 | 2.45 s | sweet |
| Triple Stack 1 / 2 / 3 | 13.7–16.5 | 14.5–15.5 | 52–56 | 2.0–2.3 s | sweet, sweet, sweet |

- **Rails** are hit at 10–12.5 m/s (36–45 km/h). Every rail locks and rides at 8, 12 and 16 m/s (map4-rails, ±2 m/s
  around each).
- **Run time.** A clean slopestyle run takes 81–84 s for 1140 m. The bot speed-checks for every rail and sweet spot;
  free riding it averages 19 m/s.

### Every rail (map4-rails.mjs 8 / 12 / 16)

All 38 jibs (17 rails, 13 boxes, 6 tubes, 2 ledges) lock on and ride their **full length** on skis and on a
snowboard. Each is ridden straight on at 6–18 m/s (three runs per check: the speed ±2), with balance, rolling the
gap-on ramps (no pop); none fails.

### Line bot (map4-bot.mjs)

The line bot follows each line with a Stanley steering controller and speed checks. It rolls the gap-on ramps,
balances the rails, pops at the end of each rail (rolls off when the next rail is close), crosses the spines at
~25° and pops on the crest, and sets tricks at the lip. The styles:

- **clean:** straight airs, PD balance on the rails.
- **trick:** a 360 / 540 / double backflip / 720 / 360 on the jump line, a 720 off the Tower, switch-ups and spins
  out on the rails.
- **human:** the trick inputs, plus a 0.2 s reaction delay and digital keys for balance on the rails.

`node web/scripts/map4-bot.mjs both all clean --check` passes **38/38 line rides** (19 lines × skis and board).
Every ride reaches the finish with 0 crashes; every rail of its line is ridden, every jump landed on (a landing
zone), every spine crossed clean. The lines:

- **the slopestyle course:** A, B, C (three rail sections + Lightning, Thunder, Voltage, Megawatt, the Gap);
- **Spark:** all its tables, the double, the rails, the side hit, the QP;
- **the lane hopper:** Spark → the Spine → Current Transfer → the Canal → the step-up → the QP;
- **Current** and **Current Box:** the Triple Stack, the step-down, Current 3;
- **High Voltage:** four rails, two pro tables, the side hit, the Canal, the step-up, the QP;
- **the Stairway**, and the **Stairway → Stairway Spine → step-up** line;
- **five Grid lines** (every other row; together all 16 jibs);
- **Hip Row:** four hips;
- **Megawatt** (from its drop zone) + the Gap;
- **the Tower;**
- **the Conduit.**

The slopestyle course (each line = three rail sections + the five jumps):

| line | gear | clean: crashes · judged | trick: crashes · judged | human: crashes · judged |
|---|---|---|---|---|
| A (flat-down, DFD, C-rail) | ski | 0 · 42.5 | 0 · 67.9 | 1 · 59.8 |
| A | snowboard | 0 · 42.0 | 0 · 66.2 | 1 · 58.4 |
| B (box, rainbow, handrail) | ski | 0 · 46.4 | 0 · 69.7 | 0 · 70.0 |
| B | snowboard | 0 · 49.0 | 0 · **78.4** | 1 · 65.1 |
| C (down rail, tube, gap box) | ski | 0 · 45.9 | 0 · 69.9 | 0 · 69.7 |
| C | snowboard | 0 · 45.4 | 0 · 72.5 | 0 · 72.5 |

- **Judging.** Straight airs and plain 50-50s judge 42–49. Spins and flips on all five jumps with a switch-up
  lipslide judge 66–78. Gold (80+) needs bigger rotations, sweet spots everywhere and varied grinds.
- **How the bot rides.** It checks speed like a rider:
  - Skis plough, a board skids 0.15 s in every 0.6 s.
  - Standing up (feathering the edges, so the game's auto-tuck stays off) when the upright prediction is in the
    window.
  - ~13 m/s into the quarterpipes; around them to the finish.
  - It never pops at a rail's ramp.

### Fuzz (map4-fuzz.mjs 60 30)

60 runs × 30 s, 108k frames, random inputs from rails, drop zones and anywhere:

- 0 NaN, 0 frames under the snow, 0 stuck.
- 0 endless grinds, 0 off-the-rail frames.
- 13 locks, 8 banked, 3 bails.

### Tests on this branch (all pass)

- unittest 13/13
- GPU lobbytest: all passed
- physics-fuzz, physics-tricks, jumps-valcrest --check, equipment-check
- map3-unit 32/32, map3-fuzz, map3-structures
- map2-bot --verify --tuck --check: all map checks passed
- map4-unit 14/14, map4-rails 8 / 12 / 16 --check, map4-fuzz, map4-bot both all clean --check (38/38)
- gfxpopin voltage-park q1: 0 tree / shadow / scatter / terrain pops, 0 shader compiles, 0 texture uploads, 0 errors
- Valcrest benches byte-identical to a5e4eba (no shared file changed in this round)

### Performance

`node web/scripts/map3-perf.mjs http://localhost:5188 1600 900 1 60 <map>` at quality 1, 1600×900, on the
integrated GPU, back to back. Other sessions shared the GPU; contention only adds time, so the quietest window per
spot counts.

| run | map | GPU avg / worst spot | per spot (2 / 20 / 38 / 55 / 62 / 80 %) | draws | triangles |
|---|---|---|---|---|---|
| **final, quiet, back to back** | **voltage-park** | **14.3 / 17.3 ms** | 15.0 / 17.3 / 13.6 / 13.8 / 14.5 / 11.7 | 145–345 | **2.9–3.35 M** |
| **final, quiet, back to back** | valcrest-gully | 16.1 / 23.3 ms | 23.3 / 17.3 / 12.4 / 14.8 / 15.2 / 13.8 | 172–386 | 2.8–3.1 M |
| before the lighter mesh, quiet | voltage-park | 15.9 / 27.4 ms | 27.4 / 13.3 / 12.8 / 12.2 / 14.3 / 15.1 | 145–358 | 3.6–4.0 M |
| contended, back to back | voltage-park | 21.5 / 34.2 ms | 18.1 / 20.2 / 34.2 / 19.7 / 18.8 / 17.8 | 148–353 | 3.6–4.0 M |
| contended, back to back | valcrest-gully | 31.8 / 38.7 ms | 38.2 / 38.7 / 32.4 / 26.4 / 26.3 / 28.7 | 172–387 | 2.8–3.1 M |
| contended, back to back | voltage-park | 23.6 / 34.5 ms | 31.1 / 20.1 / 18.7 / 19.0 / 18.1 / 34.5 | 162–349 | 3.6–4.0 M |
| contended, back to back | valcrest-gully | 32.2 / 41.9 ms | 41.9 / 37.4 / 31.4 / 24.7 / 26.7 / 30.8 | 172–387 | 2.8–3.1 M |

After the 02:33 merge and the night final with its floodlight pools, quiet windows at q1 / 1600×900 give 13.9 ms
with the pools and 12.4 ms without (they cost ~1.5 ms of additive fill). Contended runs that night ranged
22–40 ms for both Voltage and Valcrest.

Voltage sits in the 14–16 ms budget and under Valcrest. Under the same contention it costs about two-thirds of
Valcrest. The triangles are summed over every pass (shadow cascades included). The park snow went to 0.75 m rows
on the big jumps and 1.6 m columns on the level decks: 547k → 356k vertices (the old park had 289k), and
3.6–4.0 M → 2.9–3.35 M triangles per frame.

What it costs:

- The park snow is still one merged mesh (113 features, 356k vertices).
- Rails are merged per material.
- The crowd, flags and lane signs are instanced.
- The road and the canal are one draw each; the scaffolds (start ramp, the Tower) one draw per material each.
- Sparks are one Points draw.
- CPU per frame is ~0.1 ms (Valcrest ~3–6 ms, its life sim).

---

## 7. Known issues and next steps

- **Pipe feel.** The pipe works (vert, pumping, wall alignment, fakie spotting), and bots get 2–5 m of air when
  carving 60–75° up the walls. Riding it well with keys needs practice: shallow angles just carve along the wall.
  - A dedicated pipe control scheme (auto-turn at the top, spin set from the wall) would help.
  - The pipe scrubs speed above 21 m/s (the park's top speed is 27): a deliberate exception, so the airs go up.
- **Gear yaw on steep walls.** It is a world yaw (the whole game's model). On 70–82° walls the map aligns it to the
  path (`wallAlign`), so the rider's pose on a wall is approximate.
- **Wallrides.** There are none. The research suggests 4–9 m wallrides; they need a vertical-surface mode like the
  grind.
- **Quarterpipes at the bottom of the lanes.** They span their lane: to carry on to the finish, ride around them
  (or air them and turn out sideways).
  - Come in at ~13 m/s. Off the step-ups the lanes run at 20+ m/s, and a 5 m QP at 23 m/s throws you out of its
    side (the bot checks speed for them).
- **Speed control is the skill.**
  - A full tuck down the Launch arrives at Lightning ~5 m/s over its window, and the in-run gauge says so from
    110 m out.
  - Standing up (no tuck, no auto-tuck: any steering input) sheds it on the 18° jump line.
  - The landings' windows are ~3 m/s wide (the constant-EFH design ends where even a 40° landing would take more
    than 6.8 m/s into the slope).
- **The Grid at speed.** The bench carries ~12 m/s and the rows are 30–33 m apart. Riding every row in one go needs
  speed checks between them (the bot takes every other row: five Grid lines cover all 16 jibs).
- **Huge snow.** Megawatt's and the Tower's landing hills stand 19–24 m over the slope (tables on an 18° hill). Their
  raked sidewalls reach ~20 m out: keep other features clear of them.
- **Visual-only extras.** The crowd, the arches and the DJ booth are not obstacles beyond their posts. Rail legs
  don't collide (riding under a rail passes through).
- **Non-twin skis.** Skis that aren't twin tips (anything but the park skis) can't land switch. Straight airs in
  the pipe and QPs then need a 180.
- **Night lighting.** The night final is one key light plus a bright ambient.
  - Under each light tower a warm additive glow on the snow fakes the floodlight pool (props.js `lightPools`, one
    draw).
  - It doesn't light riders or features; real light cones would need local lights (a graphics feature).
- **Merge watch-list.** player.js, physics/edge.js, config.js, rider.js (pose functions), activities.js, ui.js,
  physics/flow.js, maps/builtin.js (one line).
