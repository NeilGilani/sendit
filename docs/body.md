# Rider body

## Removed: force-driven body dynamics and the crash ragdoll

Commit d70a523 added `character/dynamics.js` (`BodyDynamics`: knee/hip absorption in place of squash &
stretch, upper body thrown forward on braking, lagging / floating hands, flinches past trees, balance
reaches and hand dabs after landings, windmilling arms, irregular stumble flail, exertion breathing,
fidgets) and `character/ragdoll.js` (a Verlet crash ragdoll; skis and poles ejected; player, camera and
audio following the body), plus posture tweaks (`restCrouch`, `skiHipsFwd`, `powderBack`, `spotLanding`,
relaxed air arms, poles planted at rest, chatter in the legs only, cloth flutter).

**It was reverted** (the files are gone). In play it was glitchy: the body "tweaked out" before some
take-offs and landings, and crashes did not work properly. Measured before the revert (limb positions in
the pelvis frame, every frame, Valcrest kicker 2 and the Ravenspire First Stack): the head and upper body
folded ~0.5 m in a single frame about 0.8 s before touchdown and snapped back on the touchdown frame, and
on the cliff roll-off already at the lip (one-frame velocity changes of 35–50 m/s; after the revert the
largest is ~6 m/s). The rider is back to the earlier behaviour:

- pre-jump squat and landing **squash & stretch** on `rider.body.scale` (`ANIM.squatMax`, `squatXZ`,
  `landSquash*`, damped spring `springFreq` / `springDamping`), chatter on the `chatter` group. Both ends
  are instant by design: the squat's compression releases on the pop frame and the landing squash starts
  at full depth on the touchdown frame (pelvis ~0.17 m / ~0.35 m in one frame), then springs back;
- the old idle (steady breathing, looking around), sine stumble flail, wide balance arms in the air;
- the old **crash**: the player slides to a stop (`player.crashStep`), the rider rolls onto its side
  (`p.crashRoll`), drops and throws its arms out (`p.crash`), then the screen fades to the safe respawn
  after `PHYSICS.tumbleTime`. Chase cam aims at the sliding body (`camera.js`, `crashK`); in first
  person the helmet cam pops out behind the body (`FPView.crash`).

Everything added later on top of the rider was kept (first person, the centre-of-mass air poses, head
lead / spotting, compact combos, wipeout replays). A new crash ragdoll is planned as a separate task,
built from scratch.

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
