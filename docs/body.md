# Rider body

## Crash ragdoll (`character/ragdoll/`, `RAGDOLL` in `config.js`)

Built from scratch after the d70a523 body dynamics + Verlet ragdoll were reverted (see *History* below). The
ragdoll **exists only while the real player is in `State.CRASH`**; everything else (riding, jumps, airs,
landings, grinds, lifts, the loading-screen and lobby riders, replays of non-crash moments) never touches it.

### What it is

- **Solver** (`solver.js`): a small XPBD rigid-body solver (Müller et al. 2020), no library. Fixed sub-steps of
  `RAGDOLL.substep` = 1/960 s whatever the frame rate (`world.step(dt)` keeps an accumulator; dt 1/30, 1/60 and
  1/144 give the same trajectory bit for bit). Per sub-step: integrate → joints (anchors, limits, muscle tone) →
  self-collision → snow / trees / rocks / rails → joints again (no tone) → snow again for touching pieces →
  joints → anchors; velocities from the positions; then a velocity pass (Coulomb friction with the snow
  passes' normal impulses, restitution, snow drag, joint damping, settling, an energy budget) and sleep.
- **Body** (`humanoid.js`): 11 capsule bodies on the Quaternius rig's bones — pelvis, chest (spine), head + neck,
  upper / lower arms (hand on the forearm), upper / lower legs (boot on the shin) — with masses for an ~80 kg rider
  (`RAGDOLL.mass`) and radii that include the puffy outfit (`RAGDOLL.radius`). Joints: hinged knees and elbows,
  cone + twist hips, shoulders, spine and neck (`RAGDOLL.limits`, measured from the rig's rest pose, so "straight"
  and "bent" mean the same whatever pose the crash starts in). Self-collision pairs keep forearms out of the trunk,
  head and legs, legs out of each other.
- **Muscle tone** (a braced wipeout, not a noodle): every joint is driven toward a protective tuck
  (`RAGDOLL.tuck`, `tone`) with a strength limit (`toneMaxErr`: far from the target the pull saturates, so limbs
  move into the tuck instead of whip-cracking there). The tone holds at full while the body still moves faster
  than `toneHoldSpeed` (3 m/s), only fades toward `toneEnd` (15 %) over `toneTau` once it slows, and lets go
  entirely once the body lies still (a resting limb pushed by its tone against snow or bark would jitter). For the
  first `braceTime` the arms reach toward the snow the body is falling onto (until a hand touches something).
- **Damping**: `jointDamping` (60–100 /s) takes out a limb's spin relative to its parent **and its swing**
  (`swingDamping`: the child's centre velocity against where the parent's rigid motion would carry it, an equal and
  opposite impulse at the joint — damping the spin alone did little, the swing lives in the limb's linear
  velocity). Limits are tighter (shoulder cone 75° / twist 50°, elbow 0–135°, neck 35° / 45°, spine 30° / 20°, hip
  60° / 30°); the hand rides on the forearm (no wrist to flop). A hinge the animated pose left outside its range
  (elbows, nearly always) is let back in at `limitEase` rad/s instead of being snapped in on the first sub-step —
  that snap was the first-frame arm whip (12–24 rad/s).
- What real slams look like (tomahawks, yard sales, cartwheels, edge-catch slams): the body mostly tumbles as a
  unit, limbs stay fairly close, arms brace / flail now and then; a hard hit can throw one limb, but nothing
  whips continuously. Measured as limb spin relative to the trunk (arms / head vs the chest, legs vs the pelvis:
  `RagdollController.measure`, `ragdoll.m`), see *Tests*.
- **Gear**: skis release above `ejectSpeed` (always on a tree / rock / wall hit) and slide as flat bodies with their
  brakes out (`muGear`, `ploughGear`); below it they stay on, part of the boot body (with their mass and their
  lever in its inertia). Poles always leave the hands. A snowboard stays strapped on: a 12th body jointed to both
  boots (tight ankle cones), the feet turning with it.
- **World**: snow from `terrain.getHeight` (a local plane per sample, refreshed every 8 sub-steps or 25 cm; a step
  in the height field met sideways — a kicker's side, a roof edge — is a wall, not a floor), trees and posts as
  vertical cylinders, rocks as domes (`scatter.obstaclesNear`), rails / boxes as capsules along their top line.
- **Stopping**: Coulomb friction with real snow numbers — a jacket sliding on hardpack `muSnow` 0.32, static
  `muStaticSnow` 0.65, both + `muPowder` × the snow's powder (`player.powder` at the crash); slow slides grip more
  (below `slowGrip` 1.5 m/s μ rises toward the static value: the body settles into the snow instead of creeping
  down a 19° slope for seconds); strapped-on skis slide along their bases (`muSkiOn` 0.12) and bite across with
  their edges. A slam grips as if it were at most `impactGrip` (6) m/s hard. Snow drag while touching: `plough`
  (3 /s, × (1 + `ploughPowder` · powder)) plus the hole the last hit dug (`ploughDig` × its approach speed, fading at
  `digDecay`), `ploughSpin`. Then wobble-only settling once the centre of mass crawls (`settleSpeed`, `settleRate`),
  then sleep (`sleepSpeed`, `sleepSpin`, `sleepTime`). Muscle tone can move limbs but **never adds energy** beyond
  the crash's own (an energy budget set at the seed).
- **Snow contacts** for marks and spray: the solver keeps, per body (and per strapped-on ski), the snow contacts
  since the last read; `ragdoll.snowContacts()` hands them to `fx.js` (docs/graphics.md § Tracks and spray).

### How it plugs in

- `main.js` installs it on the game's own player + rider: `installRagdoll({ player, rider, scatter, course })`
  (`?ragdoll=0` keeps the old slide-and-roll crash; `window.__sendit.ragdoll`).
- **Before a crash** the only per-frame work is `ragdoll.track()` after `rider.update`: it **reads** five joint
  positions of the posed rig (world matrices) and the game time. It never writes to the pose or the player.
- **The crash**: `player.crashStep()` asks `ragdoll.stepCrash()`. On the first crash step it builds the bodies
  from the rig as last drawn (`rig.js captureSeed`, read-only), moves them out of any snow / trunk the animated
  pose was inside (eased in over `shiftTime`), and seeds them with the rider's momentum: the trunk's linear and
  angular velocity from the last two animated frames (a flip or spin carries on), plus the crash cause — the
  edges / the landing catch the legs (`feetCatch` by reason: over-rotated, sideways, too hard, a bump), a rail
  bail throws the body off the side, a tree / rock hit just carries the body into the trunk. Then it steps the
  world and the player follows the body's centre of mass (`position`, `velocity`, `speed`: camera aim, audio,
  wipeout distance). The respawn fade starts once the body has rested `restHold` s (never before
  `PHYSICS.tumbleTime`), or after `slideFadeTime` (1.6 s) once it has slid `slideFadeDist` (9 m) or is still
  sliding faster than `steepFadeSpeed` on a face steeper than `steepFadeDeg` (30°), or at `maxTumble` (2.6 s) at the
  latest.
- **Drawing**: `rider.update()` hands the crashed body to `ragdoll.pose()` (`rig.js applyPose`): bone rotations
  are each body's rotation since the seed (spine and neck bones share theirs), so the first ragdoll frame is the
  last animated frame exactly; the pose blends in over `blendTime` anyway; bodies are interpolated between frame
  steps. Loose skis / poles and the board are placed from their bodies. On `respawned` it is dropped and the
  rider poses itself again (the fade covers the switch).
- **Camera / audio**: the chase cam already aims at `player.renderPos` in a crash; hard re-impacts emit
  `ragdollImpact` (`{ speed, k, x, y, z }`): a small camera knock and a snow thump (`audio/engine.js`). The helmet
  cam (`FPView.crash`) keeps `FP_CRASH.minDist` from the chest and out of tree crowns, and shrinks the head it
  starts inside until it has left it.
- **Replays**: the wipeout replay records the rider's node transforms every frame (`thrill/replay.js`), so it
  shows the ragdoll crash as it happened.

### Tests

```bash
node web/scripts/ragdoll-fuzz.mjs --check            # 600 random crashes + frame-rate + no-crash identity (≈ 1 min)
node web/scripts/ragdoll-identity.mjs http://localhost:5196/ ski        # real game: jump runs with / without it
node web/scripts/ragdoll-shots.mjs http://localhost:5196/ <outDir> ski overflip,sideways,cliff,steep,tree,kicker,rail,replay tp
CLOSE=90 node web/scripts/ragdoll-shots.mjs …        # close side view of the crash frames; `fp` instead of `tp` = helmet cam
node web/scripts/ragdoll-bench.mjs http://localhost:5196/ ski         # CPU per frame in the browser
```

- **`ragdoll-fuzz.mjs`** (headless: the real skeleton from the glTF node tree, the real controller / solver / rig
  mapping, synthetic slopes 0–45° with bumps, trees, rocks, rails). 600 crashes, random rider pose, skis or board,
  cause (over-rotated / sideways / too-hard landing, a bump, a tree, a rock, a rail bail or slam, a cliff drop),
  speed 2–22 m/s, spin, frame dt 1/30 · 1/60 · 1/144. Checked every frame: no NaN; joint stretch < 2 cm; no
  sample > 3 cm under the snow; energy never above the crash's; joints within 8° of their limits; the drawn rig
  within 3 cm of the bodies; CPU. Gentle crashes (≤ 20°, ≤ 15 m/s, rails aside) asleep by 3 s in ≥ 93 % of runs
  and by 4 s in ≥ 98 %. The same crash at dt 1/30, 1/60, 1/144 is identical at matching times. A scripted run
  with jumps and landings (real `Player`) is bit-identical with and without the ragdoll installed, and its
  tracker never writes to the pose. `--seed n` changes the set; `--verbose` prints every crash, `ONLY=i` one.
  Also reported (not thresholds): flappiness — peak and mean limb spin relative to the trunk and big swings per
  crash — and the slide shown before the respawn fade by slope band (median, p90, max) with the fade's start;
  `DUMP=file.json` writes every crash's numbers. The fuzz thresholds were not changed by the wipeout pass.
- **`ragdoll-shots.mjs`** also prints per scenario `flap` (peak / mean / swings, centre-of-mass travel, fade
  start: measured page-side, so older builds measure the same way) and `ghost` (track stamps checked against what
  touches the snow: a crash stamp needs a ragdoll sample within 5 cm of the snow within 0.5 m, a riding stamp a
  grounded player on heightfield snow).
- **`ragdoll-identity.mjs`** (real game, Valcrest kicker 2): a straight air, a 360 and a backflip, each played
  twice from the same snapshot of the player and rider state — once with the ragdoll installed (tracking every
  frame), once after `ragdoll.uninstall()` — and every frame's player state, rider root and all bone / gear
  transforms compared (a run that ends in a crash is compared up to the crash).

**Flappiness and slides** (fuzz seed 1, 600 crashes; "shown" = centre-of-mass travel until the fade has covered
the screen, fade start + 0.45 s), before → after the wipeout pass:

| | before | after |
|---|---|---|
| peak limb spin vs trunk, median / p90 | 37.7 / 50.3 rad/s | 25.2 / 37.3 rad/s |
| mean limb spin vs trunk (first 2.5 s), median / p90 | 5.69 / 7.58 rad/s | 2.05 / 2.82 rad/s |
| big swings per crash (> 8 rad/s after < 4), median / p90 / max | 25 / 39 / 70 | 13 / 22 / 37 |
| shown slide 0–10°, median / p90 / max | 5.5 / 19.8 / 31.9 m | 5.5 / 17.4 / 23.6 m |
| shown slide 10–20° | 7.5 / 27.8 / 48.7 m | 7.0 / 23.7 / 40.8 m |
| shown slide 20–30° | 15.5 / 37.1 / 62.9 m | 11.6 / 31.4 / 37.8 m |
| shown slide 30–45° | 25.0 / 62.9 / 73.6 m | 18.3 / 36.3 / 48.3 m |
| fade starts, 30–45°, median / p90 | 3.02 / 3.03 s | 1.62 / 1.97 s |

(The fuzz crashes happen at 2–22 m/s: most of a fast crash's distance is the speed it had, the slide afterwards
is short.) In the real game (`ragdoll-shots.mjs`, skis, chase cam): Valcrest over-flip peak 58.7 → 48.6 rad/s, mean
6.0 → 2.9, swings 12 → 9, travel 2.8 → 0.9 m; sideways 47.4 → 42.2 / 6.2 → 3.6 / 13 → 9; Ravenspire cliff mean
8.2 → 5.0, swings 25 → 17, travel 33.9 → 22.9 m, fade at 1.4 s (before: none within 2.8 s); steep face mean
3.5 → 1.7, swings 25 → 7, travel 14.7 → 8.5 m; Blackspruce tree mean 5.9 → 3.1; Voltage rail 6.4 → 3.2. Ghost
stamps under an airborne body / on raised meshes in those runs: 5–172 per scenario before, 0 after.

Earlier numbers (MacBook Air M-series, 8 GB, before the wipeout pass): fuzz seed 1 — stretch ≤ 0.41 cm, ≤ 1.8 cm under the
snow, energy never above the crash's, joints ≤ 5.5° past a limit, drawn rig ≤ 0.17 cm off the bodies, 154 / 162
gentle crashes asleep by 3 s (median 2.3 s), ~0.46 ms per 60 Hz frame in Node. In the browser
(`node web/scripts/ragdoll-bench.mjs`, synchronous, rendering excluded) 0.5–0.9 ms per frame while the body is
awake (Valcrest, Blackspruce, Voltage Park, skis and board), ~0.05 ms asleep, nothing outside crashes.
`ragdoll-identity.mjs`: 0 difference over 361–365 frames × 851–860 values per run, skis and board.

### Known limits

- The body is capsules: no fingers, the jacket doesn't crumple, the board is two thin edges.
- A body draped over a rail or a rock may slide off it slowly; on steep faces (> 30°) it keeps tumbling / sliding
  (as real bodies do there) and the fade starts at 1.6 s instead.
- Fast crashes on 15–20° slopes (≥ 12 m/s) can take 3–3.7 s to come to rest; the fade starts at 1.6 s once
  they've slid 9 m, `maxTumble` (2.6 s) at the latest.
- Friction is isotropic for the body (a jacket slides the same in every direction); only strapped-on skis are
  anisotropic. Snow is rigid: "digging in" is a drag term from the last hit, not a real hole.
- The chase camera still doesn't collide with trees (an old known issue); the helmet cam keeps out of crowns.
- Gear doesn't collide with the body (a released ski can pass through a leg for a frame or two).

## History: the reverted body dynamics (d70a523)

Commit d70a523 added `character/dynamics.js` (force-driven knee / hip absorption, upper body thrown on braking,
lagging hands, flinches, balance reaches, windmilling arms…) and a Verlet crash ragdoll. **It was reverted**: the
head and upper body folded ~0.5 m in a single frame about 0.8 s before touchdown and at cliff lips (one-frame
velocity changes of 35–50 m/s), and crashes misbehaved. The rider is back to the earlier behaviour: pre-jump squat
and landing **squash & stretch** on `rider.body.scale` (`ANIM.squatMax`, `landSquash*`, `springFreq` /
`springDamping`, instant at both ends by design), the old idle, sine stumble flail and wide air arms. The old
slide-and-roll **crash** (`player.crashStep`, `p.crashRoll`, `p.crash`) is still there for players without the
ragdoll (`?ragdoll=0`, lobby / loading riders never crash).

## In the air: tricks (`rider.js`)

- **The body turns about its own centre of mass.** `rider.measureCom()` takes the posed skeleton's centre of
  mass (segment midpoints, rough Dempster shares, boots with the feet) in root-local coordinates every air
  frame; the next frame places the root so that point sits on the flight path (`player.renderCom()`) whatever
  the spin, flip or tuck does. With the old fixed 0.85 m pivot (and spins about the feet) the drawn body orbited
  the path by 0.2–0.25 m in a cork; now it stays within ≈ 4 cm (`combo-shots.mjs`).
- **Head leads, then spots** (`airLook`, `ANIM.airHead*` / `airSpot*`): turned over the leading shoulder into a
  spin, thrown back into a backflip / chin in for a frontflip; over the last 0.8 → 0.35 s before touchdown it
  turns (with a third of it in the shoulders) to where the flight meets the snow.
- **Combos stay compact** (`p.combo`, `ANIM.combo*`): a spin and a flip together hold the knees up and the arms
  wrapped in through the off-axis part (no stretched layout, no arms flung overhead) and open up over the last
  0.55 → 0.3 s. "Arms wide" (slowing a plain spin, a flip's layout) is at shoulder height now, not above the head.

## Pose sheet

```bash
node web/scripts/rider-poses.mjs http://localhost:5173/ <outDir> [ski|snowboard] [scenario,…]
```

Scenarios: `stand cruise carve carveHard edgeChange tuck plow hockey squat air landing crash crashLate`.
Each one drives the real game with `player.script`, freezes physics (`player.debugFreeze`) at the chosen
moment and photographs the rider with the inspect camera (`cam.inspect`) from the listed angles. HUD and
snow spray are hidden. `GPU=1` on Windows; on macOS it uses ANGLE/Metal. Run it against a server whose
files you are not editing: a source edit reloads the page mid-run.
