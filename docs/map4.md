# Map 4: Voltage Park — an event terrain park, and grinding

An event terrain park in the spirit of Olympic slopestyle and the Red Bull park builds: an Olympic-style
slopestyle course (three rail sections, then three big table-tops), three park lanes for different levels, a
jib garden, a 22 ft superpipe, a scaffold big air, skew kickers, a step-up, quarterpipes and a finish arena with
grandstands, a big screen and a DJ booth. It also brings the game's first **grinding** mechanic
(physics/grind.js): rails, boxes, tubes and ledges, on skis and on a snowboard.

```
npm --prefix web run dev -- --port 5188 --strictPort
http://localhost:5188/?map=voltage-park&ride                    straight into a ride (the lobby's Maps tab lists it too)
http://localhost:5188/?map=voltage-park&ride&equip=snowboard
http://localhost:5188/?map=voltage-park&challenge               the judged slopestyle run (Challenge)
node web/scripts/map4-unit.mjs                     registry, tuning, shapes, EFH landings, rails, grind, pipe, judge
node web/scripts/map4-rails.mjs 8 --check          every rail locks and rides at 6 / 8 / 10 m/s, skis and board
node web/scripts/map4-bot.mjs both all clean       line bot: every line, every rail (styles: clean | trick | human)
node web/scripts/map4-fuzz.mjs 60 30               random riders at the rails, drop zones and anywhere
node web/scripts/map3-perf.mjs http://localhost:5188 1600 900 1 60 voltage-park   GPU / CPU / draws along the course
```

Research behind the design: [docs/map4-research.md](map4-research.md).

---

## 1. The park

Local frame (layout.js): **u** = metres down the fall line from the start gate (world x = −380 + u; the hill
falls toward +x / east), **v** = metres across (world z; + = skier's right). The sun comes from the
south-south-east, so the park is cross-lit from the right.

| u (m) | pitch | what is there |
|---|---|---|
| −20…0 | 4° | the start deck, the start hut and the VOLTAGE PARK start arch |
| 0…35 | 20° | the drop-in |
| 35…290 | 12° | jib zone: the three slopestyle rail sections, the Grid, the top of the lanes |
| 290…360 | 23° | the in-run to the jump line (research: ≥ 30 m at 18–25°) |
| 360…705 | 19° | the jump zone: the three big tables, the big air, the pipe, the lower lanes |
| 705…765 | 9° | the run-out, quarterpipes |
| **795** | | **the finish line** (the arch, grandstands, the big screen, the DJ booth) |

The slopestyle course is ~795 m long with 225 m of drop. Beijing's course was 600 m with 198 m of drop and
Livigno's 650 m with 165 m. The park is groomed corduroy over ±300 m across, between forested banks, with
mountains and a horn behind the start.

### The slopestyle course (centre, v ≈ −16…+16)

Three rail sections, each with three parallel options (pick your line), then three jumps of growing size:

| section | left | centre | right |
|---|---|---|---|
| **1 · The Circuit** (u 50) | Flat-Down rail (3.5 m flat + 7.5 m at −24°), gap-on | 12 m ride-on box | 9 m down rail, gap-on |
| **2 · Surge** (u 124) | Down-flat-down rail (3 × 3.5 m) | 10 m rainbow box (0.7 m hump) | flat-down tube (Ø 0.9 m), ride-on |
| **3 · Overload** (u 200) | 13 m C-rail (38° curve) | kinked handrail beside a 9-step stair set | 2.4 m gap to an 11 m down box |

| jump | lip | kicker | lip angle | table (lip → knuckle) | designed window (lip speed) | sweet spot |
|---|---|---|---|---|---|---|
| **Lightning** | u 392 | 3.6 m | 27° | 15.5 m | 13.2–16.6 m/s | 20 m out, at 14.1 m/s |
| **Thunder** | u 502 | 4.1 m | 29° | 18.5 m | 14.4–17.6 m/s | 23 m out, at 15.3 m/s |
| **Voltage** | u 616 | 4.6 m | 30° | 22 m | 15.6–18.5 m/s | 26 m out, at 16.4 m/s |

Every table has ride-up ramps at 20° beside its kicker (go around and roll the deck). Neon strips edge the
decks and a blue dye line marks every lip and knuckle. Each big landing has a banner with the jump's name on
its sidewall and yellow sweet-spot markers either side.

### The park lanes (right side)

| lane | v | what is there |
|---|---|---|
| **Spark Lane** (small, green ●) | 70 | four small tables (5–8 m, 1.3–1.7 m kickers, 22–24°), a 7 m box, a fat tube and a ledge (ride-on), a down box, a butter box, pump rollers, the **Spark QP** (3.2 m) |
| **Current Lane** (medium, blue ■) | 125 | three medium tables (10–14 m, 2–3 m kickers), flat-down rail, box, kink, tube, rollers, a **step-down** |
| **High Voltage** (pro, black ◆) | 186 | down-flat-down, rainbow rail, 13 m down rail, a big kink, two big tables (17.5 / 21 m, 3.6 / 4.1 m kickers, 29–31°), a **step-up** (a 30° kicker over a short table to a deck 1 m above the lip; 10.5–13.5 m/s at the lip, sweet at 12), the **Voltage QP** (5.2 m) |
| **The Grid** (jib garden, orange ⬭) | 236–258 | 16 jibs in rows every 25–35 m, three columns: boxes, tubes, rails, a flat box, an A-frame, a 14 m rail, a kink, an S-rail, a rainbow box, a down box, a ledge, a battleship, a cannon, a finale DFD |

Every lane feature has a coloured sign on a post, as a resort would mark it. Lane entries have their own arches.

### The left side

- **The Conduit — the 22 ft superpipe** (u 355–575, v −95).
  - Wall: 6.7 m walls, 7.2 m transitions to 82° vert, 6.4 m flat bottom, 20.8 m coping to coping, 220 m long, 7 m decks.
  - The pipe sits on the 19° slope (the FIS spec is 18° ± 1°).
  - The walls grow in over the first 14 m, so you drop in from the top.
- **The Tower — the big air** (u 322, v −172).
  - A 31 m scaffold with a 9° start deck and a 34° in-run.
  - A 5 m kicker at 32°, a 24 m rising table and a 38° landing.
  - Designed for 16.3–18.8 m/s at the lip, with the sweet spot 29 m out.
  - A drop zone sits on the deck. Its sheer sides are scaffold (fall off and you hit the snow 20 m below).
- **Skew kickers** (the research's "hip / skew" jumps; Beijing and PyeongChang used them).
  - **Hip Left** (u 420, 32° off the fall line) and **Hip Right** (u 540, 30° the other way).
  - The kicker and its landing point across the slope, so you take off and land on a diagonal.

### Best lines

1. **The slopestyle** (drop zone 1 or Challenge).
   - **Rails:** Circuit Flat-Down → Surge DFD → Overload C-Rail. That is the hardest, highest-scoring line; the
     centre (box, rainbow, handrail) is the stylish one, and the right side (down rail, tube, gap box) the fast one.
   - **Jumps:** check your speed on the 23° in-run, then Lightning → Thunder → Voltage.
   - The bot's best line is 360 → 540 → double backflip. A gold needs bigger rotations, switch-ups on the rails
     and sweet-spot landings.
2. **High Voltage.** DFD → rainbow → 13 m down rail → kink, then two pro tables, the step-up and the 5.2 m QP.
3. **The Grid.** Snake the jib garden: left column 7 jibs, centre 6, right 3. Transfer rail to rail: a grind
   that ends straight on the next rail banks with a **transfer** bonus.
4. **The Tower.** Drop zone 5: one huge air, 3+ s, slow motion at the apex, room for a 720–1080.
5. **The Conduit.** Drop zone 6: carve up each wall steeply (60–75° across the pipe), pump the transitions,
   3–5 m out of a 6.7 m pipe.

### Drop zones (practice): keys 1–9 / d-pad ◀ ▶, **T = back to the last feature you hit**

| key | drop zone |
|---|---|
| 1 | Start Gate · Slopestyle |
| 2 | Rail Section 2 · Surge |
| 3 | Rail Section 3 · Overload |
| 4 | Jump Line (top of the in-run) |
| 5 | The Tower · Big Air (scaffold deck) |
| 6 | The Conduit · Superpipe |
| 7 | Spark Lane · Small |
| 8 | High Voltage · Pro |
| 9 | The Grid · Jib Garden |

**T** puts you 26 m before the last rail you locked onto, or 45 m before the last kicker you launched off (the
big air: its deck). Use it to hammer a feature until the timing is right. R / Y still goes back to the start
gate.

---

## 2. Code

```
web/src/physics/grind.js       the grind (opt-in through course.rails): lock-on, balance, switch-ups, pops, scoring
web/src/maps/voltage/
  index.js     registerMap (id 'voltage-park', order 4), thumbnail, lobby spot; loads props.js + hud.js lazily
  layout.js    every feature in one place: PROFILE, JIBS, JUMPS, LANES, LANE_JUMPS, STEPS, HIPS, QUARTERPIPES,
               ROLLERS, LANE_JIBS, GRID_JIBS, PIPE, BIG_AIR, DROP_ZONES, LINE_GOALS (tunables)
  course.js    VoltageCourse: base snow (profile, banks, mountains, a horn), feature builders (tables, step-up,
               QPs, rollers, jibs + mounds + ramps + the stair set, the pipe, the big air), the hooks
  shapes.js    ProfileBuilder (pen: lines, arcs, faces, the constant-EFH landing, back to the snow),
               ProfileFeature (1D profile × width, raked sidewalls, a side profile), PipeFeature, FeatureIndex
  park.js      per-rider park logic: pipe / QP vert, pumping, wall alignment, pipe landing spotting, pop and
               landing-zone feedback, rails → line goals, the in-run speed prediction
  scoring.js   SlopeJudge: the judged slopestyle run (Challenge results, zen run card)
  hud.js       balance meter, feedback pops, in-run speed gauge, judged card, T practice key, grind audio
  props.js     park snow mesh (dye lines), rails / boxes / tubes on legs, the scaffold, arches, crowd, fences,
               light towers, flags, finish arena, screen, DJ booth, neon deck edges, lane signs
  sparks.js    rail sparks / box spray (one additive Points cloud)
  tuning.js    VOLTAGE_PHYSICS (per-map physics) and VOLTAGE_CAMERA
  noise.js     value / fbm / ridged noise, mulberry32
web/src/maps/builtin.js      one line: import './voltage/index.js';
web/scripts/map4-*.mjs        lib (headless park + player), unit, rails, bot, fuzz
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
- **Balance.** The rail meter (above).
- **Line chain and SEND IT.** The flow layer is on (physics/flow.js): every different move raises the multiplier,
  repeats count half, and the meter fills to SEND IT.
- **Line goals:**

  | Goal | Features in order | Bonus |
  |---|---|---|
  | **Rail Triple** | Sections 1 → 2 → 3 | +1500 |
  | **Jump Line** | Lightning → Thunder → Voltage | +2000 |
  | **Full Slopestyle** | all six | +3500 |
  | **High Voltage** | DFD → rainbow → down rail → both pro tables | +2200 |
  | **Grid Runner** | four grid rails | +1500 |

- **Golden snowflakes** (12): over each big lip, 3.5 m past the end of five rails (you fly through them after
  popping off), high in the pipe, over the big air, on the step-up deck and at the QP's coping.
  - Never on a rail itself: the generic pick-up puff (activities.js) would hang around a slow grinding rider like a
    cloud. That was the "white haze" bug.
- **The slopestyle judge** (scoring.js; research §7: one overall impression out of 100).

  | Part | Points | How it's scored |
  |---|---|---|
  | Sections | 0–60 | Six sections, 0–10 each. A rail section takes its best grind: (1.2 + points / 95), with repeats decaying 100 / 75 / 50 / 25 / 10 % like Tony Hawk. A jump: difficulty = 1.5 + 1.15 per 180 + 2.3 per flip + 1 for a grab + 0.7 switch (≤ 8.5), × execution (sketchy 0.5, stomped 1.08) × repeat decay, + amplitude (sweet +1.5, deep +1, knuckle −1, cased −2, overshot −1.5). A crash zeroes the section |
  | Variety | 0–20 | Different moves (spin size / direction, flips, grind sequences) |
  | Amplitude | 0–10 | Sweet spots and deep landings |
  | Flow | 0–10 | Average speed, minus crashes and stalls |

  A crash also costs 6. **Medals: gold ≥ 80, silver ≥ 65, bronze ≥ 50** (winning Olympic runs score 82–93).
  - **Challenge mode.** A countdown, then a judged run to the finish. The results card shows the score / 100, the
    medal, the six sections, variety · amplitude · flow and the medal lines (via `course.challenge.judge`). There
    are no gates, and best times and ghosts still record.
  - **Zen runs.** At the finish the judged card shows with a personal best (localStorage `sendit.park.voltage`).
- **Practice.** The drop zones and **T** (above).

---

## 5. Tunables (where to change what)

| what | where |
|---|---|
| feature placement and sizes, the profile, lanes, the pipe, the big air, drop zones, line goals | `maps/voltage/layout.js` |
| landing design (EFH target 3.4 m/s, cap 6.8 m/s, 22–38°, the knuckle radius, the design pop 1.2 m/s, the sweet spot) | `course.js addJump` / `addBigAir`, `shapes.js efhLanding` |
| jib clearance, ramp angle rules, the stair set | `course.js addJib` |
| lock-on, balance, friction, hops, pops, scoring | `physics/grind.js GRIND_DEFAULTS` (per map: `physics.common.grind`) |
| pipe / QP vert (≥ 55°, ≤ 12 m/s up, ≈ 1.1 m drift back in), pumping (5.5 m/s², × 1.6 timed), wall alignment | `maps/voltage/park.js` (`PUMP`, `attachPark`) |
| speeds, landings, slow motion, flow, wallAlign, camera | `maps/voltage/tuning.js` |
| judging weights and medal lines | `maps/voltage/scoring.js` |
| look: dye lines, neon, signs, crowd, lights, arches | `maps/voltage/props.js` |

### Voltage's physics (maps/voltage/tuning.js)

| | value | why |
|---|---|---|
| ski / board `maxVelocity` | 21 / 20 | soft cap: the jump line is ridden at 15–22 m/s |
| board `dragUpright` / `dragTuck` | 0.0128 / 0.0072 | a low park crouch: boards reach the big take-offs like skis (they arrived 1–2 m/s short) |
| `smoothFollow`, `terrainImpactLoss` | 1.4, 0.3 | kicker / QP / pipe transitions are curves, not bumps: no speed lost following them (the default model took 7 m/s off a 22 m/s rider on a kicker) |
| `hardLanding` / `crashImpact` | 9 / 14 m/s into the slope | hard pack, no powder: EFH ≈ 4 m stumbles, ≈ 10 m crashes; designed landings are 3.4 m/s |
| `powderDepth` | 0.05 | groomed |
| `airSettleAngle` | 100 | out of a slide or a skid, the gear squares up in the air |
| `microHop` | 0.1 s | skimming a roller is not a landing |
| `landYawSpeed` | [16, 26, 0.85] | |
| `slowmo` | ≥ 2.6 s and ≥ 7 m up: 0.75× | the big air and the biggest tables |
| `flow` | on, `summary: false`, `speedFrom` 19, `chainWindow` 3.6 | line chains, SEND IT; the park's own judged card |
| `wallAlign` | true | pipe walls (edge.js / player.js hook) |
| ski / board pop | 2.1–3.9 / 2.4–4.3 m/s | |
| camera | maxFovBonus 10, fovCurve 1.4, airLook 0.2, airFollowY 0.1, flowFov 6 | |

---

## 6. Measurements

### Speeds and the jump line (map4-bot, clean style: speed-checked for each sweet spot)

| jump | designed window at the lip | ski / board lip speed (bot) | where they landed |
|---|---|---|---|
| Lightning | 13.2–16.6 m/s | 15.5 / 14.4 | sweet or deep |
| Thunder | 14.4–17.6 m/s | 15.4 / 16.4–18 | sweet or deep |
| Voltage | 15.6–18.5 m/s | 15.4–19.3 / 16.8–18.7 | sweet or deep |
| The Tower | 16.3–18.8 m/s | 18.5 / 17.4 | sweet / deep |

- **Rails.** Approached at 8.5–10.7 m/s (research: 3–8 m/s; the game is faster).
- **Air time.**

  | Feature | Air |
  |---|---|
  | Lightning | ~2.4 s |
  | Thunder | ~2.5–2.9 s |
  | Voltage | ~3 s |
  | The Tower | 3.2–3.6 s (slow motion) |

- **Straight-run tucking** (no speed check) overshoots the tables on skis: the speed gauge says so.

### Every rail (map4-rails.mjs 8)

All 38 jibs (17 rails, 13 boxes, 6 tubes, 2 ledges) lock on and ride their **full length** on skis and on a
snowboard. Each is ridden straight on at 6, 8 and 10 m/s, with balance, rolling the gap-on ramps (no pop); none
fails at any of the three speeds.

### Line bot (map4-bot.mjs)

The line bot follows each line with a Stanley steering controller and speed checks. It rolls the gap-on ramps,
balances the rails, pops at the end of each rail, and sets tricks at the lip. The styles:

- **clean:** straight airs, PD balance on the rails.
- **trick:** a 360 / 540 / double backflip on the jump line, a 720 off the Tower, switch-ups and spins out on the
  rails.
- **human:** the trick inputs, plus a 0.2 s reaction delay and digital keys for balance on the rails.

The slopestyle course (each line = three rail sections + the three tables):

| line | gear | clean: crashes · rails ridden · judged | trick: crashes · judged | human: crashes · judged |
|---|---|---|---|---|
| A (flat-down, DFD, C-rail) | ski | 0 · 3/3 · 38.9 | 0 · 62.9 | 0 · 56.4 |
| A | snowboard | 0 · 3/3 · 39.5 | 1 · 47.4 | 1 · 27.8 |
| B (box, rainbow, handrail) | ski | 0 · 3/3 · 34.0 | 0 · 51.5 | 0 · 51.5 |
| B | snowboard | 0 · 3/3 · 45.6 | 0 · **70.7** | 0 · 62.2 |
| C (down rail, tube, gap box) | ski | 0 · 3/3 · 45.1 | 0 · 60.9 | 0 · 60.1 |
| C | snowboard | 0 · 3/3 · 49.6 | 0 · 57.6 | 0 · 61.3 |

- **Run time.** 55–67 s start to finish.
- **Judging.** Straight airs and plain 50-50s judge 34–50. A 360 / 540 / double backflip line with a switch-up
  lipslide judges 50–71. Gold (80+) needs bigger spins, sweet spots on all three and varied grinds: the room to
  progress.
- **The lanes, the Grid, the hips, the big air and the pipe.** `node web/scripts/map4-bot.mjs both all clean
  --check` passes **28/28 line rides** (14 lines × skis and board). Every one reaches the finish with 0 crashes and
  every rail of its line ridden:
  - all three Grid columns (16 jibs);
  - Spark, Current and High Voltage with all their rails, tables, the step-down and the step-up;
  - both skew kickers;
  - the Tower (clean, sweet / deep zone);
  - the Conduit (2–5 m airs, landed fakie).
- **How the bot rides.** It checks speed like a rider:
  - Skis plough; hard pulses come only when the bot is much too fast.
  - A board skids 0.15 s in every 0.6 s, never within 24 m of a rail, so it lines up again.
  - It never pops at a rail's ramp.
  - It rides out around the quarterpipes: a QP across a lane is a dead end you would ride up and back for ever.

### Fuzz (map4-fuzz.mjs 60 30)

60 runs × 30 s, 108k frames, random inputs from rails, drop zones and anywhere:

- 0 NaN, 0 frames under the snow, 0 stuck.
- 0 endless grinds, 0 off-the-rail frames.
- 19 locks, 12 banked, 3 bails.

### Tests on this branch (all pass)

- unittest 13/13
- GPU lobbytest: all passed
- physics-fuzz, physics-tricks, jumps-valcrest --check, equipment-check
- map3-unit 32/32, map3-fuzz, map3-structures
- map2-bot --verify --tuck --check: all map checks passed
- map4-unit 14/14, map4-rails --check, map4-fuzz
- Valcrest benches byte-identical to a5e4eba

### Performance

`node web/scripts/map3-perf.mjs http://localhost:5188 1600 900 1 60 <map>` at quality 1, 1600×900, on the
integrated GPU, back to back. Other sessions shared the GPU; contention only adds time.

| map | GPU avg / worst spot | per spot (2 / 20 / 38 / 55 / 62 / 80 %) | draws | triangles |
|---|---|---|---|---|
| voltage-park | 14.7 / 25.3 ms | 9.0 / 11.2 / 23.6 / 25.3 / 9.7 / 9.6 | 158–329 | 2.6–3.0 M |
| valcrest-gully | 14.7 / 23.3 ms | 13.8 / 13.7 / 23.3 / 8.6 / 9.0 / 19.6 | 168–382 | 2.5–2.8 M |

The park's added cost is small:

- The park snow is one merged mesh (~250k vertices).
- Rails are merged per material (9 draws).
- The crowd, flags and lane signs are instanced.
- Sparks are one Points draw.
- CPU per frame is ~0.1 ms (Valcrest ~3 ms, its life sim).

---

## 7. Known issues and next steps

- **Pipe feel.** The pipe works (vert, pumping, wall alignment, fakie spotting), and bots get 2–5 m of air when
  carving 60–75° up the walls. Riding it well with keys needs practice: shallow angles just carve along the wall.
  - A dedicated pipe control scheme (auto-turn at the top, spin set from the wall) would help.
  - The pipe sits on 19°; the spec is 18°.
- **Gear yaw on steep walls.** It is a world yaw (the whole game's model). On 70–82° walls the map aligns it to the
  path (`wallAlign`), so the rider's pose on a wall is approximate.
- **Wallrides.** There are none. The research suggests 4–9 m wallrides; they need a vertical-surface mode like the
  grind.
- **Quarterpipes at the bottom of the lanes.** They span their lane: to carry on to the finish, ride around them
  (or air them and turn out sideways).
- **Visual-only extras.** The crowd, the arches and the DJ booth are not obstacles beyond their posts. Rail legs
  don't collide (riding under a rail passes through).
- **Non-twin skis.** Skis that aren't twin tips (anything but the park skis) can't land switch. Straight airs in
  the pipe and QPs then need a 180.
- **Daylight.** The world lighting is global (scene.js), so the "night final" look is suggested with neon,
  floodlight heads and emissive banners rather than a night sky.
- **Merge watch-list.** player.js, physics/edge.js, config.js, rider.js (pose functions), activities.js, ui.js,
  physics/flow.js, maps/builtin.js (one line).
