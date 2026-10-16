# Map 2: Blackspruce Plunge

A steep, fast run through dense spruce forest. It's about weaving the trees at speed, picking a
line at each fork, and dropping the rock band. It has jumps too, but tree-dodging is the core.
Map id `blackspruce`: `?map=blackspruce`, Maps tab in the lobby. Research behind the layout:
docs/map2-research.md.

|                 | Valcrest Gully | Blackspruce Plunge |
|-----------------|----------------|--------------------|
| Length (path)   | 2.46 km        | 2.05 km to the finish (fall line 1,975 m) |
| Vertical        | 650 m          | 1,100 m (2,780 → 1,677 m) |
| Gradient        | 7–22°          | 29–36° in the trees, 14–17° in the clearings |
| Bot avg ground speed | 7–8 m/s (physics-course carve) | 16–18 m/s, peaks 25–28 m/s in the slots |
| Run time (bot)  | 370–410 s      | 125–135 s (tucking, with speed control) |

## How to ride it

- **Pick a line at each fork.** An orange trail sign stands in the wedge where a lane splits off:
  - **◆◆ SLOT**: tight (about 4 m free), nearly straight, fast. Tuck it and thread the trunks. Close shaves fire constantly.
  - **◆ FLOW**: the main line, about 7 m free. It swings left and right every ~55 m, with pivot trees or rocks in the middle that force a side. Check speed before the swings.
  - **■ LONG WAY**: the safe line, 9–11 m free. It wanders wider, has fewer pivots, and takes the chute instead of the cliff.

  Every split merges back before a clearing and its gate.
- **Clearings are the rest beats:** Start, Kicker Meadow (M kicker with a crowd plus a small side kicker), Pillow Garden (below the rock band), the Saddle, Big Air (L kicker plus a side M), and the Finish. Small glade pockets sit inside the long tree sections.
- **The rock band** (t ≈ 812 m) is a 4.5 m cliff across the face. Drop it from the Needles slot, or ride the Notch (the main line) or the Ramp (the safe line's chute).
- **Deadfall** has fallen logs across the main line and the high line. Snow drifts up their uphill side, so each log is a small natural kicker: ollie it or roll it.
- **Score:**
  - Close shaves (+15 each, existing) plus **Threaded** (+30 under 0.9 m from a hitbox).
  - **Tree slalom ×N**: close shaves chained less than 1.6 s apart bank +40·N/5 at every 5th.
  - Everything feeds the Challenge combo multiplier.
- **Challenge:** 9 checkpoint gates (16–24 m wide, all at convergence points), 12 snowflakes (most on the slots, over the cliff and above the kickers), a ghost, and map-specific medals (see Tunables).

## Sections (t = metres down the fall line)

| t | Section | Grade | Forest spacing | Lines / features |
|---|---------|-------|----------------|------------------|
| 0–70 | Start | 13–23° | 12 m | start clearing, banner |
| 70–180 | The Drop-in | 29° | 9 m, big trees | two rollers, pillows; gate at 176 |
| 180–430 | Spruce Gate | 32° | 5.4 m | flow / slot (left) / long way (right); glade pocket at 300 |
| 430–550 | Kicker Meadow | 15° then 30° | clearing | M kicker + S side kicker, crowd; gates 428, 532 |
| 550–812 | The Needles | 34° | 4.6 m | flow / slot (left, runs at the cliff) / long way (right, to the Ramp); pocket at 680 |
| 812 | Rock band | 4.5 m cliff | — | the Notch (d ≈ 1.5), the Ramp (d ≈ 24), cliff elsewhere |
| 840–930 | Pillow Garden | 14° | clearing | 11 pillows; gates 848, 928 |
| 930–1230 | Deadfall | 30° | 5.0 m | flow + high line (right) with logs, low line (left); pocket at 1080 |
| ~1228 | the Saddle | — | clearing | every Deadfall line merges; gate 1228 |
| 1230–1475 | The Gauntlet | 36° (steepest) | 4.3 m | flow / slot (left) / long way (right); pocket at 1350 |
| 1475–1600 | Big Air | 16° then 30° | clearing | L kicker + M side kicker, crowd; gates 1476, 1590 |
| 1600–1900 | Old Growth | 28° | 7.2 m, big trees | flow + left line, pillows, two logs; pocket at 1750 |
| 1900–1975 | Finish | 15° | clearing | roller, finish banner at 1975, lodge beyond |

## Files

```
web/src/maps/blackspruce/
  index.js    registerMap({ id: 'blackspruce', … }) + the SVG thumbnail (imported from maps/builtin.js)
  layout.js   all the design data: profile, rock band, clearings, sections, lanes, pillows,
              rollers, logs, kickers, gates, flakes, stumps
  course.js   BlackspruceCourse: Course-compatible (path, length, dropsAt, finishAt, progress,
              centre, height, generate, menuFocus) + the opt-in hooks below
  forest.js   planForest (pure, shared with the bot), populateForest (into scatter.js), log /
              stump / trail-sign meshes
  scoring.js  Threaded / Tree slalom bonuses (listens to 'nearMiss', installed on load)
web/scripts/map2-bot.mjs   headless bot + checks (below)
```

Run coordinates: `t` metres down the fall line (world z = startZ − t), `d` metres across it
(+ = skier's right = world +x). Layout positions can be lane-relative (`[laneId, offset]`), so
logs, flakes and glade pockets follow a lane when it is re-shaped.

## Course hooks used by the engine (all opt-in, other maps unchanged)

| Property | Read by | What |
|----------|---------|------|
| `key: 'blackspruce'` | activities.js `courseKey` | storage key for bests / ghost / flakes |
| `features = { kickers, jumps }` | features.js | explicit kickers ({ at, lateral, signature, L, H, W, name }); `jumps: { endAt: 0, freePillows: 0 }` turns the random park stream off |
| `challenge = { gates, flakes, medalSpeeds }` | activities.js | gates `{ at, lateral, width }`, flakes `{ x, z, y }`, medals |
| `spawn = { runCorridor: 150, ridgeFenceMax: 0, runLength: 2400, treeMax: 20000 }` | scatter.js | the generic forest stays outside the designed one |
| `populate(scatter)` | scatter.js `addEnvironment` | plants the designed forest first (trees, boulders, collision circles, logs, stumps, signs) |
| `perf = { treeNear: 0.55, treeMid: 0.5 }` | scatter.js `setQuality` | × the quality tier's full-frond / mid tree-pool radii |
| `life = { skiers: 0 }` | life.js | no background skiers (they would ghost through the pivots) |
| `physics = { ski: { maxVelocity: 18 }, snowboard: { maxVelocity: 17.5 } }` | map 3's `applyMapTuning` (config.js) | see below |
| `w` (= face half-width table) | terrain.js `sculptCliffs` | fluted rock on the outer walls only |

### Physics overrides (assumption)

Declared for the per-map physics hook from the map 3 session (`course.physics = { common?, ski?,
snowboard? }`, merged over config.js PHYSICS when the map loads):
- Ski `maxVelocity` goes from 15 to 18 m/s and snowboard from 14.5 to 17.5 m/s.
- The soft-cap drag then starts later, so the steep slope turns into speed instead of being eaten.
- It also lowers the speed ratio (FOV and wind streaks) at a given speed.

Without the hook (this branch alone) the slope still carries the speed: bot ground averages of
16–18 m/s and slot peaks of 25–28 m/s. With it the bot is 5–10 s faster and slots peak at ~30 m/s.

An override of 20 / 19.5 was also tried: the bot reached 31 m/s and crashed 1–3 times per run, which
is too hot for these corridors.

No physics files or player.js were edited.

## Tunables

- **layout.js**:
  - `BLACKSPRUCE.profile`: grade per section.
  - `lumps` (1.0 m: kept low, because you need snow under your feet to steer in the trees) and `ribs` (0.3 m).
  - `SECTIONS[].spacing` (forest density), `scale`, `slim` (crown width), `pivotEvery`.
  - `LANES` control points `[t, d | 'm', hw]` plus `weave` [amplitude, wavelength]. `'m'` means on the main line, used for branch and merge points.
  - `BAND` (cliff t, drop, chutes), `CLEARINGS`, `PILLOWS`, `ROLLERS`, `LOGS`, `KICKERS`, `GATES` (t, width), `FLAKES`, `STUMPS`.
- **forest.js**: `TREE_HIT` (hitbox = 0.2 + 0.32 × crown width scale) and `ZONE` (|d| covered by the designed forest).
  - Lane-edge trees are narrowed to spires: sx ≤ (gap + 0.7) / 2.6.
  - The woods thin with distance from the nearest lane (perf).
- **Pivot rules** (forest.js):
  - Only in lanes with hw ≥ 3.7 m, offset 18–35 % of hw.
  - On the inside of a curve, otherwise alternating sides.
  - Never in a section's first 30 m, in a side lane's first 45 m or last 30 m, within 25 m of a gate, or within 55 m after a roller or 45 m after a pillow on the lane.
  - Never near logs, kickers or the band.
  - Rocks only in lanes with hw ≥ 4.5 m.
- **course.js**: `challenge.medalSpeeds` is { gold: 16, silver: 14, bronze: 12 } m/s, i.e. 2:08 / 2:26 / 2:51. `physics`, `perf`, `spawn`.
- **scoring.js**: `TREE_SCORING` (THREAD 0.9 m, CHAIN 1.6 s, STEP 5, points).

## Fairness and collisions

- Every trunk, rock and stump collides through scatter.js's circle hash, the same rule everywhere:
  - Trees: trunk plus dense core, 0.32–0.45 m, well inside the needles. Brushing branches is a close shave.
  - Rocks: their visible sunk footprint, 1.0–1.1 × scale.
  - Stumps: their radius.
- Logs have no hitbox: they are in the height field, so what you see is what you ride over.
- Fork signs are breakaway markers that don't collide, like the slalom gates' poles.
- **Lane curvature:** every lane's tightest radius is ≥ 24 m (main, safe) and ≥ 36 m (slots). Tighter merges only happen inside clearings. Rule: R ≥ v²/(2.2 g) × 1.2. Check: `node web/scripts/map2-bot.mjs --curve`.
- **Best-line check:** dynamic programming per route finds a line with at least **1.18 m** of room to every hitbox on all three routes. Check: `--fair`.

## Bot and checks (web/scripts/map2-bot.mjs)

The bot rides the real Player physics on the course's height field (1.25 m grid plus the real kickers),
through the real collision circles.

```
node web/scripts/map2-bot.mjs both all --tuck --check --splits   # ski + board × main / fast / safe
node web/scripts/map2-bot.mjs both all --tuck --check --ovr      # with the declared physics overrides
node web/scripts/map2-bot.mjs --curve                            # lane radii and drift
node web/scripts/map2-bot.mjs ski all --fair                     # best-line clearance per route
```

Flags:
- `--tuck`: tuck on straight stretches.
- `--check`: speed control for curves ahead.
- `--trace=<t>`: dump the 2 s before a crash near t.
- `--line`: follow the DP line (it has no curvature cost, so it is worse than the local planner).

Latest results (tucking, speed control, no overrides):

| | main | fast (slots) | safe |
|---|---|---|---|
| ski | 130 s, 0 crashes, 53 close shaves | 125 s, 0, 96 | 130 s, 0, 51 |
| snowboard | 131–153 s, 0–2 | 132 s, 0, 98 | 136 s, 0, 46 |

- The fast line is 1–2 s quicker per tree section and earns about twice the close shaves.
- The bot's crashes move around with small layout changes. It is a heuristic driver, so the fairness check is the real guarantee.
- Valcrest's own bot (physics-course) and physics-fuzz are unaffected.

## Performance

Quality 1, 1600×900, Intel Arc 130V, GPU timer queries.
- **Before** (first dense version): 12k designed trees, 20–28 ms in the dense sections versus Valcrest's 13.9 ms.
- **After** (min of 3 runs per spot at the same time as Valcrest's 13.5–14.2 ms):

  | Spot | GPU |
  |------|-----|
  | Old Growth | 15.1 ms |
  | Gauntlet | 16.4 ms |
  | Needles | 16.9 ms |

**Contention caveat:** the GPU was shared with other sessions' test runs. Single measurements varied by up to 3×; only minimums taken alongside Valcrest's are quoted.

What it took:
- The designed forest thins with distance from the lanes (12k → 5.2k trees; the woods you can't see behind the lane-edge trees).
- `perf = { treeNear: 0.55, treeMid: 0.5 }`: full-frond trees within ~22 m instead of ~41 m, and mid trees hand over to the opaque far shells at ~130 m. The swap was not noticeable in screenshots at riding speed.
- Fewer saplings (8 % in the dense sections).
- Not changed: gfx/ shaders, gfx/perf.js, scene.js TREES.

Cost breakdown (Gauntlet, before the last two steps):
- Full-frond trees ~35 % (alpha-tested foliage filling the screen).
- Terrain ~16 %.
- Mid trees ~9 %.

Further levers, if needed:
- `perf.treeNear` 0.45.
- `SECTIONS` spacing in the Needles and Gauntlet.
- A camera-aware foliage fade in gfx/trees.js (not done: not my file).

## Known issues

- The chase camera can still pass through the needles of a lane-edge tree on a hard carve. camera.js has no foliage avoidance and trees.js no near-camera fade. Lane-edge spires keep it rare.
- Logs read best from the side. Riding straight at one, you see a dark line on a drift crest.
- The physics overrides only apply once the map 3 hook is merged. The medal speeds sit between the bot's times with and without them.
- The bot is a heuristic. Expect a crash or two in its runs. Real players brake, which the bot only approximates.
- Perf numbers were taken on a shared, contended GPU; see Performance.
