# Equipment: skis and snowboards

Sendit has two equipment types: **skis** (the default) and the **snowboard**. Each has its own physics model, rider stance and animation, and can be swapped at runtime. Every ski and board model is plain data, so new models and colourways are one entry each.

The research behind the numbers is in [equipment-research.md](equipment-research.md).

## Files

| File | What it does |
|---|---|
| `web/src/equipment/specs.js` | The catalogue: ski and snowboard variants as data (geometry, sidecut, flex, camber/rocker, setback, stance, graphic). |
| `web/src/equipment/registry.js` | Spec lookup, variant registration, and `deriveHandling()` (physics multipliers from the geometry). |
| `web/src/equipment/models.js` | `createEquipmentModel()`: procedural Three.js models (outline from the sidecut, camber/rocker profile, bindings, painted topsheet). |
| `web/src/equipment/index.js` | Public entry point that re-exports both of the above. |
| `web/src/physics/edge.js` | `EdgePhysics`: the shared carve/skid ground model, plus default air and landing handling. |
| `web/src/physics/ski.js` | `SkiPhysics`: snowplough, hockey stop, tuck, pole push, and ski landing rules. |
| `web/src/physics/snowboard.js` | `SnowboardPhysics`: stance and switch, toe/heel asymmetry, slide stops, butters, ollie/nollie, FS/BS spins. |
| `web/src/physics/math.js` | Small math helpers with no DOM imports, so the physics also runs in Node. |
| `web/src/player.js` | State machine, terrain following, take-off, collisions, scoring, lifts. Delegates equipment physics to `player.dyn`. |
| `web/src/rider.js` | Rider animation for both stances, runtime gear swap, and `getContactPoints()`. |
| `web/src/camera.js` | Chase camera. It follows the direction of travel (the tail when riding switch) and holds its framing during slide and hockey stops. |
| `web/src/config.js` | Tunables in `PHYSICS`, `PHYSICS.ski`, `PHYSICS.snowboard`, `ANIM` and `ANIM.board`. |
| `web/scripts/physics-sim.mjs` | Headless bench that compares the physics against the research targets. |
| `web/scripts/physics-variants.mjs` | Headless check of trick naming (regular/goofy, switch, nollie) and per-variant handling. |

## APIs other modules rely on

These names are fixed.

```js
import { createEquipmentModel, listVariants, getEquipmentSpec, registerVariant, deriveHandling,
         EQUIPMENT_TYPES, DEFAULT_VARIANT } from './equipment/index.js';

// Switch at runtime. Either call keeps the other in sync.
player.setEquipment('snowboard', 'park');   // type 'ski' | 'snowboard'; variant is an id or a spec object (optional)
rider.setEquipment('ski');
player.setStance('goofy');                  // 'regular' (left foot forward) | 'goofy'

// Model for a preview (lobby or shop) or for the rider.
const g = createEquipmentModel('snowboard', 'powder', { stance: 'regular', outline: true });
// For a colourway, pass a partial spec:
createEquipmentModel('ski', { id: 'park', graphic: { top: 0xff3355, pattern: 'stripe' } });
```

- **`createEquipmentModel(type, variant, opts)`** returns a `THREE.Group`.
  - The origin is where the rider stands (the boot centre or stance centre). The nose or tips point toward **−Z**, the base sits at y = 0, and units are metres.
  - `opts` defaults: `{ outline: true, stance: 'regular', pair: true, poles: false, neon: 1 }`.
  - `group.userData = { type, spec, parts, setNeon(v) }`.
  - `parts` for skis is `{ skis: [left, right], poles? }`, with the left ski at −X. For a snowboard it is `{ board, bindings: [front, back] }`.
  - It uses `toonMaterial`/`outlineMaterial` from `world.js`, which, like the rest of the game, needs `patchShaderChunks()`.
- **`rider.getContactPoints()`** returns world-space contact points, refreshed every frame in `rider.update()`.
  - Skis return `[left, right]`. The board returns `[nose, waist, tail]`.
  - Each point is `{ id, position, direction, normal, edgeAngle, load, speed, grounded, depth }`:
    - `direction` is the unit travel direction.
    - `edgeAngle` is in radians and signed: + means the right-turn edge relative to travel.
    - `load` is 0..1 and sums to about 1 on the ground.
    - `position` sits on the biting edge. `depth` is how far the gear sits below the powder surface; add it to `position.y` for a point on the surface.
  - The objects are reused from frame to frame, so copy anything you need to keep.
  - The outside ski carries up to 85% of the load in a hard turn. On the board, the load moves toward the nose or tail when pressing, and toward the tail in powder.
- **Rider outside gameplay** (lobby, shop): `import { Rider, standInPlayer } from './rider.js'`, then `new Rider(standInPlayer('snowboard', 'park', 'goofy'))` and `await rider.load(loader)`.
  - The rider stands in a relaxed stance at `rider.player.renderPos`.
  - Call `rider.setEquipment(type, variant)`, `rider.player.setStance(s)` and `rider.update(dt, camera)` as usual.
  - Its swaps never touch the in-game rider: each rider only follows its own player's `equipmentChanged` events.
- **URL parameters:**
  - `?equip=ski|snowboard` (skis are the default).
  - `?variant=<id>`.
  - `?stance=regular|goofy`.
- **Debug key:** **E** toggles skis and snowboard in-game. The handler is one line in `main.js`.
- **Event** `equipmentChanged` `{ type, variant, spec, stance, player }` on the `state.js` bus.
- **Other events:**
  - New: `takeoff` `{ popped, switch, type }`.
  - `landed` now also carries `{ switch, result: 'clean'|'stumble'|'slide', trick }`.
  - `stumble` passes the result.
- **Player fields** for FX, audio and UI, all updated every step:

  | Field | Meaning |
  |---|---|
  | `equipment` | `{ type, variant, spec, handling }` |
  | `stance` | `'regular'` or `'goofy'` |
  | `travelSign` | −1 when riding switch; `isSwitch` is the same as a boolean |
  | `edgeAngle` | signed edge angle in radians |
  | `skidAngle` | rad between the gear and its path |
  | `latAccel`, `gearLatAccel` | lateral acceleration (m/s²) |
  | `carveQuality` | 1 is a clean carve |
  | `stop` | slide or hockey stop, 0..1 |
  | `stopSide`, `stopToe` | which way the stop goes, and whether it is on the toe edge |
  | `plow` | snowplough, 0..1 |
  | `press` | −1 tail to +1 nose |
  | `butter`, `grab` | 0..1 |
  | `dyn.dbg` | per-term deceleration breakdown |

  The existing fields (`speed`, `turnInput`, `carve`, `skid`, `brake`, `tuck`, `sink`, `powder`, and the rest) keep their meaning. `heading` is the physical **nose** direction. When riding switch the nose trails, so the travel direction is `heading + π`.

## Controls

| Input | Skis | Snowboard |
|---|---|---|
| A / D, stick | Edge and steer: carve at speed, pivot (skid) when slow. A key press starts at 65% lock and reaches full lock in 0.45 s; linking straight from the other key commits at once. | Toe-side or heel-side edge. For a regular rider riding forward, right is toe side. Same key ramp. |
| S, LT | Snowplough below 6.5 m/s, hockey stop above | Heel-side slide stop, or a toe-side stop when steering toward the toes |
| W, RT | Double-pole / skate push below 8.5 m/s; tuck above | One-foot skate when slow; low crouch at speed. Held while charging a pop, it gives a nose press and a **nollie**. |
| Hold Space | Crouch to charge, release to pop. Steering while charging **winds up** a spin. | Tail press to charge, release to **ollie**. Steering while pressing gives a **butter** (pivot on the pressed end) and winds up the spin. |
| A / D in the air | Spin, named Left/Right 180/360…. Let go and the spin carries on to the next 360 (or 180 on twin tips). | Spin, named **FS/BS** 180/360… by stance and switch. Let go and the spin carries on to the next 180. |
| Shift in the air | Grab: Safety, Mute or Japan | Grab: Indy or Melon. With W it is a Nose grab; with S, a Tail grab. |
| E (debug) | Swap to the snowboard | Swap to skis |

Frontside means the toe side, and so the chest, swings toward the direction of travel first. For a regular rider riding forward that is counter-clockwise from above, which is a left spin. Goofy mirrors it, and riding switch mirrors it again.

## Physics model

### The shared carve/skid model (`physics/edge.js`)

1. **Edge angle.** The steer input sets the target `θ_t = steer · maxEdge`. The edge follows with a first-order lean response, rate-limited by the edge-switch time: 0.30 s for skis; 0.38 s heel→toe and 0.46 s toe→heel on the board.
2. **Sidecut carving.** Path curvature is `κ = engage(θ) / (R_eff · cos θ)`.
   - `engage` blends in from 3° to 14° of edge.
   - `R_eff = R_sidecut · (1 + k·smoothstep(v))`. Per the research, gear bent at speed carves longer arcs than its printed radius.
   - Lateral grip caps it: `κ ≤ a_max / v²`, with `a_max = latG · g · surface · spec grip`.
   - Most demand beyond grip just widens the arc (`carveAssist` = 0.85). The rest rotates the gear past its path, which is a skid.
3. **Rotary pivot.** Skidded steering only fills the gap between what the carve gives and the turn rate the rider asks for. That rate is 2.2–2.5 rad/s when slow and 1.25–1.35 rad/s at speed. The result:
   - Slow turns are skidded.
   - Mid-speed turns are pure carves.
   - At high speed, asking for more than the grip allows adds a little skid.
   - Pivot fades as the skid angle β approaches `betaMax`.
4. **Grip.** Grip redirects the velocity onto the gear's new axis, conserving energy: `vf' = sqrt(vf² + η(vl² − vl'²))`.
   - η is 0.985 in a clean carve and 0.75–0.8 in a skid.
   - A flat base keeps only 25–35% of the grip, so it sideslips.
5. **Resistance.**
   - Glide friction, μ by surface.
   - Quadratic air drag (upright or tuck).
   - Soft cap above `maxVelocity`.
   - Skid scrub: `a = μ_side · g · sin β`.
   - Powder bog and plough drag: `a = k · depth · v`.
   - Butter or plough extras.
6. **Carve pump.** Clean carving gives back `carvePump · |a_lat|` (about 0.05 g per g). Linked clean carves hold speed about like running straight; skidded turns lose it.
7. **Powder.**
   - Sink depth goes from slow to fast with planing speed, and is divided by `√float`. Float comes from planform area, rocker and setback.
   - `PHYSICS.powderDepth` (0.35) says how deep the course's powder is. The whole gully is "powder", so 1.0 would bog riders down on the 7–10° sections.
   - Floatier gear also gets less powder friction.

### Skis (`physics/ski.js`, `PHYSICS.ski`)

- Max edge 68°, 1.8 g grip, quick 0.30 s edge changes, and a strong tuck (drag 0.0062 vs 0.0115 upright).
- **Snowplough** below 6.5 m/s: the wedge gives 2.2 m/s² and keeps 75% of the steering.
- **Hockey stop** above 6.5 m/s: the skis pivot about 82° across the path toward the steer side (or the side they already point, or uphill), set a 32° edge, and scrape at about 6.5 m/s².
- **Landing.** Only the tips may lead: clean at 15° or less, stumble at 30° or less, slide out at 38° or less, crash beyond that. Backwards landings within 30° count as switch: clean on **twin tips** (the park ski), otherwise a stumble or crash.
- The tuck lowers the maximum edge, so a racer tuck cannot carve tight.

### Snowboard (`physics/snowboard.js`, `PHYSICS.snowboard`)

- **Stance and switch.** Regular is left foot forward and goofy is the reverse. `heading` is the nose. Riding tail-first is just `travel = −1`, and the toe side relative to travel flips with it. A directional board grips 5% less switch.
- **Toe/heel asymmetry.**
  - Max edge is 64° toe and 55° heel.
  - Grip is 1.6 g toe and 1.45 g heel.
  - The heel sidecut bends 5% tighter.
  - Rolling heel→toe is faster than toe→heel.
- **Shorter sidecut** (7.4–9.2 m), so carves are tighter. Pivot is rotation-led (2.5 rad/s).
- **Slide stop.** The board pivots about 86° across the path. A heel-side stop gives about 5.6 m/s²; a toe-side stop, when steering toward the toes, about 4.9 m/s².
- **Butter.** Hold Space, plus W for the nose, and steer under 13 m/s. The board pivots on the flexed end at up to 3.4 rad/s × spec pivot, with a flat base, little grip and little skid scrub.
- **Ollie and nollie.** The pop comes from the stored flex: 2.2–4.0 m/s × spec pop, and a nollie is ×0.88. Spinning out of a butter pre-winds the spin.
- **Landing.** Either end may lead. The deviation is measured from the nearest end: clean at 15° or less, stumble at 45° or less, a **slide** (heavy speed loss) at 75° or less, crash beyond that. Landing tail-first flips `travelSign`.
- **Push.** A one-foot skate gives 2.4 m/s² up to 4.5 m/s, weaker than poling. The crouch is less aerodynamic than a ski tuck, so top speed is a little lower.

### Air and tricks (shared)

- **Spins.** Stick X drives the spin rate with an exponential response: 6.4 rad/s for skis, 7.6 rad/s for the board, × the spec spin factor from swing weight. Take-off adds spin from two sources:
  - About 45–55% of the ground yaw rate carries into the air as pre-wind.
  - A **wind-up** (steering while charging the pop) adds up to 2.6 rad/s on skis and 3.2 rad/s on the board.
- **Spin momentum.** With the stick released, rotation does not stop dead:
  - Within `spinCheckAngle` (40°) of a landable alignment, the spin settles onto it. Just past one, the rider checks the spin back.
  - Farther away, momentum carries the spin on to the next alignment, timed to arrive by touchdown when reachable. Alignments are the nose, or the tail too for boards and twin tips.
  - A 180 attempt on non-twin skis therefore becomes a 360.
- **Landing assist (SSX-style).** In the last `landAssistTime` (0.25 s) with the stick released, a gear within `landAssistAngle` (14°) of its path settles straight.
- **Grabs.** Shift in the air, after 0.12 s of air time. A grab held for 0.25 s or more scores and names the trick. Each grab moves its own hand to its own spot:
  - Board: Indy is the rear hand to the toe edge, Melon the front hand to the heel edge, Nose grab the front hand to the nose, Tail grab the rear hand to the tail.
  - Skis: Safety is the left hand to its ski, Mute the right hand across, and Japan crosses the skis.
- **Trick label.**
  - Board example: `Switch Nollie FS 540 Indy`.
  - Ski example: `Switch Right 360 Japan`.
  - Points: air time × 80, + 90 per 180°, + the grab, + 30 for switch, + 50 for a perfect landing (8° or less).
- **Lip pop.** Popping on a kicker multiplies the pop by `lipPopBonus` (1.7), so park jumps feel arcade-sized while flat-ground ollies stay realistic (0.65 m skis, 0.84 m board).

### Fixes in the shared player code (they help both types)

- **Terrain following** used to throw away 0.3% of the speed every frame, about 18%/s. Now only abrupt impacts beyond `smoothFollow` cost speed.
- **Kicker lips.** The terrain normal is sampled at grid spacing (about 3 m), which smeared across lips and steered riders down the drop. As a result kickers barely launched (0.37 s of air). On park features the physics now samples a one-sided normal, 0.35 m upstream; the same kicker gives 1.2 s straight or 2.2 s with a pop.
- **Popping on a rising ramp** used to "land" again the very next frame. A rider moving off the surface now stays airborne.

## Tunables (config.js)

- `PHYSICS`: shared values:
  - `gravity`, friction by surface, `softCapDrag`.
  - `powderDepth`, `turnScrub`.
  - `lipPopBonus`, `terrainImpactLoss`, `smoothFollow`.
  - `landAssistTime`, `landAssistAngle`, `spinCheckAngle`.
  - `digitalSteerStart`, `digitalSteerRamp` (the key steering ramp).
  - Landing impact and crash speeds, stumble time and handling.
- `PHYSICS.ski` and `PHYSICS.snowboard`:

  | Group | Keys |
  |---|---|
  | Speed and steering | `maxVelocity` (also the HUD/FX speed ratio), `steerResponse` |
  | Edge | `maxEdge` (`maxEdgeToe`/`maxEdgeHeel`), `edgeSwitchTime` (`heelToToe`/`toeToHeel`), `edgeResponse`, `engage` |
  | Grip and sidecut | `latG` (toe/heel), `speedRadius`/`speedRadiusV`, `carveAssist` |
  | Redirect | `gripRate`, `flatGrip`, `carveEff`, `skidEff`, `skidMu`, `carvePump` |
  | Pivot | `pivotRate`, `turnRateFast`, `pivotFade`, `betaMax`, `selfAlign` |
  | Stops | `stopAngle`, `stopTurnRate`, `stopMu`/`stopMuHeel`/`stopMuToe`, `stopEdge` |
  | Snowplough (skis) | `plowSpeed`, `plowDecel`, `plowTurn` |
  | Push and drag | `pushAccel`, `pushMaxSpeed`, `dragUpright`, `dragTuck` |
  | Powder | `powderFloat`, `sinkSlow`/`sinkFast`, `powderBog`, `powderDrag`, `powderBogDecel`, `powderSteer` |
  | Butter (board) | `butterRate`, `butterMaxSpeed`, `butterDrag` |
  | Air | `popMin`/`popMax`, `nollie`, `chargeTime`, `spinRateMax`, `spinResponse`, `prewind`, `windupSpin` |
  | Landing | `landClean`/`landStumble`/`landCrash`/`landSlide`, `switchLand` |
- `ANIM`:
  - Lean and edge caps: `maxLean`, `maxGearEdge`.
  - `angulation`, `polePlantTime`.
  - `ANIM.board`: crouch, shoulder and hip opening, head turn, turn lead, heel sit, toe drive, press shift and pitch, air and grab tuck.

## Adding a ski or board model

1. Add an entry to `SKI_VARIANTS` or `SNOWBOARD_VARIANTS` in `web/src/equipment/specs.js`. Copy a neighbour and change the numbers:
   - `length`.
   - `tip`/`waist`/`tail` widths.
   - `sidecutRadius`.
   - `profile` `{ type, camber, noseRocker, tailRocker }`.
   - `kick` `{ nose, tail }`.
   - `flex`, `torsion`, `mass`, `setback`, `twin`.
   - Boards only: `stance` `{ width, front, back }`.
   - `graphic` `{ base, top, top2, accent, edge, pattern }`, where the patterns are `solid | stripe | fade | chevron | split`.
2. That's all. The model, the physics multipliers (`deriveHandling`: grip, pop, pivot, stability, float, spin) and the rider pick it up automatically.
3. Check it with `node web/scripts/physics-variants.mjs` (carve radius, pop, powder speed, butter) and `?equip=snowboard&variant=<id>`.

At runtime, `registerVariant(type, spec)` adds a model (for DLC or user presets). A colourway or graphic is a partial spec, `{ id: 'park', graphic: {...} }`, passed to `setEquipment` or `createEquipmentModel`. The lobby can expose `graphic` fields as paint options. Per-rider stance overrides go through `player.setStance()`, with binding angles in `spec.stance`.

## Rider animation (rider.js)

- **Shared layers:**
  - **Lean** = `atan(contact force across the gear / g)`. Carving leans in; a stop leans back up the hill.
  - The gear rolls further, to the physics edge angle, with the board pivoting about its biting edge.
  - Squash and stretch, chatter, sink, neon, lift seat, crash tumble.
- **Skis:**
  - Angulation: the hips move inside and the spine counter-rolls, so the upper body stays upright.
  - Hockey-stop counter-rotation: the torso keeps facing down the path.
  - Pole plant on every edge change at speed, a double-pole cycle when pushing with W, snowplough wedge, tuck, grabs.
  - When leaning, the inside ski is lifted back to the snow (inside knee flexes, outside leg extends).
- **Snowboard:**
  - Sideways stance: the chest faces the toe edge, with binding angles on the feet and knees toward the toes.
  - Hips and shoulders open toward the nose; the head turns toward the travel direction, over the back shoulder when switch.
  - The upper body leads the turn.
  - Toe side: knees drive and the torso stays tall. Heel side: sits down with the arms forward.
  - Pressing shifts the pelvis to the pressed end and flexes the board up at the other end. The ollie crouch loads the tail.
  - A wind-up counter-rotates the shoulders against the coming spin; in the air the shoulders lead the spin.
  - In the air: knees tucked and arms wide for balance. Indy grab: the rear hand goes to the toe edge between the feet, and the board is pulled up.

## Testing and tuning results

- `node web/scripts/physics-sim.mjs [ski|snowboard|both] [variant]` prints each value next to its target from the research. Current results:

| Metric | Skis | Board | Target (research) |
|---|---|---|---|
| Top speed on 25° groomed, cruise / tuck | 17.0 / 18.7 m/s | 16.4 / 17.5 m/s | 16 / 20 and 15 / 18.5 |
| Full-lock carve at 12 m/s | R 6.9 m, 1.67 g, β 7° | R 6.7 m, 1.59 g, β 8° | 1.8 g / 1.6 g sustained |
| Half-input carve at 12 m/s | R 15.7 m, 0.72 g, β 3° | R 12.1 m, 0.91 g | 10–16 m |
| Speed kept in a 1.4 s carve on the flat (straight glide 81%) | 82% | 80% | carving costs little |
| Edge switch | 0.30 s | heel→toe 0.38 s, toe→heel 0.42 s | 0.30 / 0.38 / 0.46 |
| Hockey / slide stop from 12 m/s | 6.6 m/s², 11 m | heel 5.6, toe 4.9 m/s² | 6.5 / 5.5 / 4.5 |
| Snowplough | 2.4 m/s² | — | 1.5–2.5 |
| Pop on the flat, full charge / tap | 0.65 m, 0.70 s / 0.27 m | 0.84 m, 0.80 s / 0.33 m | 0.30 / 0.45 m real; arcade about ×2 |
| Spin rate | 6.4 rad/s | 7.6 rad/s | 5.5–7 / 6.3–8 |
| Butter | — | 134° in 0.8 s | about 3 rad/s |
| Course powder (21°) steady speed | 15.8 m/s | 15.5 m/s | — |

- **On the real course,** a bot following the gully centre line for 60 s averages about 10 m/s (max about 16). The previous physics gained speed from every turn, a linear lateral-to-forward conversion; it did 0→13.6 m/s in 5 s while weaving on about 18°, which is faster than free fall along the slope allows. Constant full-lock zig-zagging is now about 6 m/s on average, as it should be.
- **Kicker M** (40 m run-up): 1.2 s of air without a pop, and 2.2 s with a lip pop. The bench lands "Perfect FS 360", "Perfect BS 180" (switch landing), and on skis "Right 360 Japan".
- `node web/scripts/physics-variants.mjs` checks the trick names:
  - Regular: left = FS, right = BS. Goofy is mirrored.
  - "Switch FS 180", "Nollie FS 180".
  - It also prints per-variant handling. For example, the slalom ski grips and pops most, the powder gear sinks least, and the park board butters most (142° vs 82° in 0.6 s).

## Integration notes (files this track does not own)

- **fx.js:** it stamps two ski grooves (`FX.skiSpacing`) for both types. For the board, one wide groove (about the waist width, 0.25 m) from the waist contact point would be right. Spray could be driven by `rider.getContactPoints()` (load × speed × `skid`, and `edgeAngle` for direction).
- **ui.js:** the controls hint still reads like the ski controls. The board could add "W+Space nollie · steer while holding Space to butter · Shift in air to grab". A HUD equipment badge could read `player.equipment.spec.name`.
- **input.js:** a dedicated grab button on the gamepad (RB is tuck today, which also grabs in the air) and a stance toggle would help. The debug toggle reads the raw `input.pressed` set for `KeyE`.
- **Lobby:** use `createEquipmentModel()` for previews, `listVariants()` for menus, and `player.setEquipment()`/`player.setStance()` on confirm.

## Known issues

- Equipment is visually swallowed by deep powder when slow: sink is up to 0.22 m for skis and 0.12 m for the board. This is the existing powder look, so on this all-powder course the board and skis are mostly visible only at speed.
- At full lock and 10 m/s most variants are grip-limited, so the carve radius differs between models mostly through `grip` and `pivot`, not the sidecut. The sidecut shows more with partial input.
- Spins only; there are no flips or corks. Landing evaluation checks yaw only, not pitch or roll.
- Riding switch on skis is only rewarded for the twin-tip park ski. Skis have no butters or presses.
- The grab name depends on the steer and W/S inputs held at the moment of the grab; there is no dedicated grab-selection UI.
- The lip pop bonus only knows about `features.js` kickers, not natural drops, which already give air.
