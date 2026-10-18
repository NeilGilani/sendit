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
- **Muscle tone**: every joint is driven softly toward a protective tuck (`RAGDOLL.tuck`, `tone`): strong at the
  crash, relaxing to `toneEnd` over `toneTau`, and let go entirely once the body lies still (a resting limb pushed
  by its tone against snow or bark would jitter). For the first `braceTime` the arms reach toward the snow the body
  is falling onto (until a hand touches something).
- **Gear**: skis release above `ejectSpeed` (always on a tree / rock / wall hit) and slide as flat bodies with their
  brakes out (`muGear`, `ploughGear`); below it they stay on, part of the boot body (with their mass and their
  lever in its inertia). Poles always leave the hands. A snowboard stays strapped on: a 12th body jointed to both
  boots (tight ankle cones), the feet turning with it.
- **World**: snow from `terrain.getHeight` (a local plane per sample, refreshed every 8 sub-steps or 25 cm; a step
  in the height field met sideways — a kicker's side, a roof edge — is a wall, not a floor), trees and posts as
  vertical cylinders, rocks as domes (`scatter.obstaclesNear`), rails / boxes as capsules along their top line.
- **Stopping**: Coulomb friction (`muSnow` sliding, `muStaticSnow` dug in; a slam grips as if it were at most
  `impactGrip` m/s hard, so the body doesn't stop dead on its first hit), snow drag while touching (`plough`,
  `ploughSpin`), wobble-only settling once the centre of mass crawls (`settleSpeed`, `settleRate`), then sleep
  (`sleepSpeed`, `sleepSpin`, `sleepTime`). Muscle tone can move limbs but **never adds energy** beyond the crash's
  own (an energy budget set at the seed).

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
  `PHYSICS.tumbleTime`) or at `maxTumble` at the latest.
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
- **`ragdoll-identity.mjs`** (real game, Valcrest kicker 2): a straight air, a 360 and a backflip, each played
  twice from the same snapshot of the player and rider state — once with the ragdoll installed (tracking every
  frame), once after `ragdoll.uninstall()` — and every frame's player state, rider root and all bone / gear
  transforms compared (a run that ends in a crash is compared up to the crash).

Numbers at the time of writing (MacBook Air): see the commit / report of this change; the fuzz prints its own.

### Known limits

- The body is capsules: no fingers, the jacket doesn't crumple, the board is two thin edges.
- A body draped over a rail or a rock may slide off it slowly; on steep faces (> ~30°) it keeps sliding until the
  respawn (`maxTumble`).
- Fast crashes on 15–20° slopes (≥ 12 m/s) can take 3–3.7 s to come to rest; the respawn waits up to `maxTumble`.
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
