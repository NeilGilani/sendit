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
| `web/src/physics/edge.js` | `EdgePhysics`: the shared carve/skid ground model (with the speed-limited edge angle), presses and butters, spins, flips and the flip preload, late pops, and default landing handling. |
| `web/src/physics/ski.js` | `SkiPhysics`: snowplough, hockey stop, tuck, pole push, ski butters, and ski landing rules. |
| `web/src/physics/snowboard.js` | `SnowboardPhysics`: stance and switch, toe/heel asymmetry, slide stops, butters, ollie/nollie, FS/BS spins. |
| `web/src/physics/math.js` | Small math helpers with no DOM imports, so the physics also runs in Node. |
| `web/src/player.js` | State machine, terrain following, take-off, collisions, scoring, lifts. Delegates equipment physics to `player.dyn`. |
| `web/src/rider.js` | Rider animation for both stances, runtime gear swap, and `getContactPoints()`. |
| `web/src/camera.js` | Chase camera. It follows the direction of travel (the tail when riding switch) and holds its framing during slide and hockey stops. Also a debug close-up "inspect" view (`?cam=`). |
| `web/src/config.js` | Tunables in `PHYSICS`, `PHYSICS.ski`, `PHYSICS.snowboard`, `ANIM` and `ANIM.board`. |
| `web/scripts/physics-sim.mjs` | Headless bench that compares the physics against the research targets. |
| `web/scripts/physics-variants.mjs` | Headless check of trick naming (regular/goofy, switch, nollie), wind-up, landing assist and per-variant handling. |
| `web/scripts/physics-scenarios.mjs` | Headless player-like scenarios: board stop-then-go, edge traverse vs flat-base drift, held ski turn. |
| `web/scripts/equipment-check.mjs` | Headless catalogue check: every spec validates, partial overrides merge, handling stays finite and clamped. |
| `web/scripts/physics-fuzz.mjs` | Headless fuzz on the real course: random inputs, gear and stance swaps; fails on NaN, falling through the snow, or a stuck air state. Prints crash causes. |
| `web/scripts/physics-tricks.mjs` | Headless flip and cork bench: launches, stick timing, landings and trick names for both types. |
| `web/scripts/physics-kicker.mjs` | Headless kicker bench: a features.js-shaped kicker on a slope, straight, popped, spun, flipped and preloaded. Takes `[ski\|snowboard\|both] [slopeDeg]`. |
| `web/scripts/physics-course.mjs` | Headless bot on the real hand-built gully (course.js on the game's 1.25 m grid), start to finish. Styles: `carve`, `straight`, `park` (pop + 360 off the drops), `flip` (preloaded backflips). Logs landings, stumbles, crashes and speeds. |

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
- **Outfit colours** (groundwork for clothing customisation): `rider.setOutfit({ jacket, jacket2, pants, gloves, trim, trim2, helmet, lens })`. Any subset works; values are hex numbers or CSS colours.
- **Paint options:** `GRAPHIC_PATTERNS` (exported from `equipment/index.js`) lists the topsheet patterns.
- **URL parameters:**
  - `?equip=ski|snowboard` (skis are the default).
  - `?variant=<id>`.
  - `?stance=regular|goofy`.
- **Debug key:** **E** toggles skis and snowboard while riding (not in menus: the lobby uses E to cycle tabs). The handler is one line in `main.js`.
- **Debug views for tuning** (camera.js and player.js only, nothing in the HUD):
  - `?cam=side|front|back|top|<deg>` swaps the chase camera for a close-up inspect view around the rider, relative to the travel direction (90 is the rider's right).
  - `window.__cam.inspect = { yaw, dist, height, fov }` changes that view at runtime; `__cam.inspect = null` returns to the chase camera.
  - `player.debugFreeze = true` holds the current pose (physics paused, rendering live).
  - `player.script = (ctrl, player) => { … }` drives the controls from code (the benches use it).
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
  | `butter`, `grab` | 0..1 (butters now happen on skis too) |
  | `flip`, `flipRate` | flip angle in the air (rad, + = backflip, i.e. the leading end up) and its rate; 0 on the ground |
  | `renderFlip` | `flip` interpolated for rendering |
  | `flipLoad` | 0..1 backflip preload while charging (S held) |
  | `lastLanding` | `{ result, switch, dev, flipDev, impact, air, spins, flips, trick }` |
  | `lastCrash` | `{ reason: 'impact'\|'yaw'\|'pitch', impact, dev, flipDev, air, spins, flips }` for a landing crash (a UI could say "Over-rotated!") |
  | `dyn.dbg` | per-term deceleration breakdown |

  The existing fields (`speed`, `turnInput`, `carve`, `skid`, `brake`, `tuck`, `sink`, `powder`, and the rest) keep their meaning. `heading` is the physical **nose** direction. When riding switch the nose trails, so the travel direction is `heading + π`.

## Controls

| Input | Skis | Snowboard |
|---|---|---|
| A / D, stick | Edge and steer: carve at speed, pivot (skid) when slow. A key press starts at 65% lock and reaches full lock in 0.45 s; linking straight from the other key commits at once. | Toe-side or heel-side edge. For a regular rider riding forward, right is toe side. Same key ramp. |
| S, LT | Snowplough below 6.5 m/s, hockey stop above | Heel-side slide stop, or a toe-side stop when steering toward the toes |
| W, RT | Double-pole / skate push below 8.5 m/s; tuck above (worth about +20% top speed) | One-foot skate when slow; low crouch at speed. Held while charging a pop, it gives a nose press and a **nollie**. |
| Hold Space | Crouch to charge, release to pop (W + Space: nose press, **nollie**). Steering while charging **winds up** a spin; below 11 m/s it also **butters** (best on the twin-tip park ski). | Tail press to charge, release to **ollie**. Steering while pressing gives a **butter** (pivot on the pressed end) and winds up the spin. |
| Space held over a crest | The crouch soaks up rollers and drop lips (you stay on the snow). Release on the crest to pop off it; up to 0.15 s after the snow falls away still counts (**late pop**). | Same |
| S while charging | **Backflip preload**: the rider arches back, and the pop leaves the lip already rotating and commits to a full backflip. No stop or plough while charging. | Same (a **Wildcat** off the tail) |
| A / D in the air | Spin, named Left/Right 180/360…. Let go and the spin carries on to the next 360 (or 180 on twin tips). Rolling off a crest or lip **without popping**, a turn held from the ground stays a carve: it only spins once steer is let go and pressed again. | Spin, named **FS/BS** 180/360… by stance and switch (switch FS = **Cab**, Half-Cab for a 180). Let go and the spin carries on to the next 180. |
| W / S in the air | **Frontflip / backflip** (stick forward / back). Keys already held at take-off are ignored until pressed again. Let go and the flip carries on to the next upright; within 50° of upright the rider spots the landing and settles. With a spin: **Cork** (back) or **Misty** (front), Double/Triple by flips. | **Tamedog / Wildcat** (front / back over the toe-heel axis). With a spin: **Rodeo** (single back), **Double Cork** (more), **Misty** (front). |
| Shift in the air | Grab: Safety, Mute or Japan | Grab: Indy or Melon. With W it is a Nose grab; with S, a Tail grab. |
| E (debug) | Swap to the snowboard | Swap to skis |

Frontside means the toe side, and so the chest, swings toward the direction of travel first. For a regular rider riding forward that is counter-clockwise from above, which is a left spin. Goofy mirrors it, and riding switch mirrors it again.

## Physics model

### The shared carve/skid model (`physics/edge.js`)

1. **Edge angle.** The steer input sets the target `θ_t = steer · maxEdge`. The edge follows with a first-order lean response, rate-limited by the edge-switch time: 0.30 s for skis; 0.38 s heel→toe and 0.46 s toe→heel on the board.
   - **You need speed to get on edge.** The edge angle is the body's lean plus angulation (knees, hips, ankles), and the lean needs a turn force to lean against: `tan φ = a / g`. So `maxEdge` is capped at the largest θ with `θ ≤ atan(min(v²/(R_eff·cos θ), a_max)/g) + angulation`, found by bisection. Angulation is 26° for skis and 24° for the board.
   - In practice: about 29° at 3 m/s, 35–44° at 5 m/s, and the full 64–68° from about 8 m/s. Slow turns therefore come from the rotary pivot (a skid), not a deep carve. Turn rate when slow is unchanged.
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

- Max edge 68°, 1.8 g grip, quick 0.30 s edge changes, and a strong tuck (drag 0.0055 vs 0.0135 upright, a CdA ratio of about 2.5 per the research). On 25°: 16.6 m/s cruising and 20.2 m/s tucked.
- **Butters and presses.** Same input as the board (Space or W+Space, plus steer below 11 m/s): the skis pivot on the pressed tails or tips at 2.6 rad/s × pivot. Directional skis get 0.6× that rate; twin tips (the park ski) get the full rate. The rider shows it: skis pitched up about 8°, hips over the pressed end, and the tips snap up at the pop.
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
- **Landing.** Either end may lead. The deviation is measured from the nearest end: clean at 15° or less, stumble at 45° or less, a **slide** (heavy speed loss) at 82° or less, crash beyond that. Landing tail-first flips `travelSign`.
- **Crouch.** Drag is 0.0085 crouched against 0.014 upright. On 25°: 16.2 m/s cruising and 18.5 m/s crouched.
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
- **Kicker pop.** A pop on a kicker is the same pop as on the flat (`lipPopBonus` = 1). It already rides the ramp's launch angle, adding about 0.5 s of air. The old 1.7× bonus made the pop dominate: every kicker gave 2.2–2.6 s, and kicker size hardly mattered. Now S / M / L kickers give 1.1 / 1.3 / 1.5 s straight and 1.7 / 1.9 / 2.0 s popped.
- **Flips.** W / S (stick y) in the air drive the flip rate toward ±`flipRateMax`: 5.6 rad/s for skis and 5.9 for the board, × √(spec spin). That is about 1.1 s per flip; the research gives 4.5–7 rad/s for tucked flips.
  - The flip turns about the gear's lateral axis. For the board, ridden sideways, that is the toe-heel axis, so a backflip is a **Wildcat** (over the tail) and a frontflip a **Tamedog** (over the nose).
  - The flip is composed at render time: `orient` stays the un-flipped base, and `renderOrient = slerp(base) · Rx(renderFlip)`. `renderFlip` is signed (flip × travelSign). The rider rotates about its centre of mass (`ANIM.flipPivot`, 0.85 m) using exactly the drawn angle. On touchdown the leftover pitch (within the landing tolerance) settles visually over about 0.2 s instead of snapping.
  - **No flip from a little hop:** a flip only starts with at least `flipMinAir` (0.45 s) of predicted air. The time to land is predicted by marching the ballistic path against the real terrain. The stick has a wide dead zone (0.4) for flips, so an off-axis stick while spinning doesn't start one.
  - **Commitment.** Keys held at take-off are ignored until re-pressed, so a held tuck or nollie never flips by accident. With the stick released, a flip far from upright carries on to the next upright, timed for touchdown. Within 50° of upright the rider settles onto it.
  - **Preload.** S held while charging (`flipLoad`) leaves the lip already rotating at `flipPreload` (4.2 / 4.4 rad/s) and commits through the first half turn: a hands-free backflip off any popped kicker or drop. Rotation is set on the ramp, as in Steep, Shredders and the aerials research.
  - **Names.** Skis: Backflip / Frontflip, or with a 360+ spin `Left Cork 720` / `Misty`. Board: Wildcat / Tamedog, or `BS Rodeo 540` (a single backflip with a spin), `FS Double Cork 1080`, `Misty`. Double and Triple prefixes count the flips.
  - **Points:** +150 per flip.
- **Landing (pitch and impact).** On top of the yaw rules, pitch must come round to within `flipLandClean` (22°) for a clean landing. Up to `flipLandStumble` (42°) is a stumble; beyond that is a crash. Impacts above `hardLanding` (12.5 m/s into the slope) turn a clean landing into a stumble; above `crashImpact` (18 m/s) the rider crashes.
- **Natural air.** The rider leaves the snow when following it would need more downward pull than gravity gives: `v·n′/dt > g·n′.y · liftOffGrip`, which is v²κ > g cos θ with 1.25× for passive absorption. Drops, rollers and side hits launch at speed; small lumps don't (`liftOffMin`).
  - Crouching to charge raises the factor by `liftOffAbsorb` × charge (up to about 1.8×), so riders can hold Space to stay low over a crest.
  - **Late pop.** If the snow falls away while charging, the charge, preload and wind-up are kept for `latePopTime` (0.15 s): releasing then still pops off the lip.

### Fixes in the shared player code (they help both types)

- **Terrain following** used to throw away 0.3% of the speed every frame, about 18%/s. Now only abrupt impacts beyond `smoothFollow` cost speed.
- **Kicker lips.** The terrain normal is sampled at grid spacing (about 3 m), which smeared across lips and steered riders down the drop. As a result kickers barely launched (0.37 s of air). On park features the physics now samples a one-sided normal, 0.35 m upstream; the same kicker gives 1.2 s straight or 2.2 s with a pop.
- **Popping on a rising ramp** used to "land" again the very next frame. A rider moving off the surface now stays airborne.
- **Glued to convex terrain.** The ground step projected the velocity back onto the surface every frame, so nothing but a kicker's discontinuous lip could ever launch the rider. The course's five natural drops gave no air at all. Natural air (above) fixes this: a straight rider now gets about 1 s off each drop.

## Tunables (config.js)

- `PHYSICS`: shared values:
  - `gravity`, friction by surface, `softCapDrag`.
  - `powderDepth`, `turnScrub`.
  - `lipPopBonus`, `terrainImpactLoss`, `smoothFollow`.
  - Natural air: `liftOffGrip`, `liftOffAbsorb`, `liftOffMin`, `latePopTime`; `hardLanding`.
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
  | Flips | `flipRateMax`, `flipResponse`, `flipPreload`, `flipLandClean`/`flipLandStumble` |
  | Edge vs speed | `angulation` (deg beyond the lean) |
  | Butter (skis) | `butterRate`, `butterMaxSpeed`, `butterDrag`, `butterNonTwin` |
  | Landing | `landClean`/`landStumble`/`landCrash`/`landSlide`, `switchLand` |
- `ANIM`:
  - Lean and edge caps: `maxLean`, `maxGearEdge`.
  - `angulation`, `polePlantTime`.
  - Skis: `skiPressPitch`, `skiPressShift`, `skiPopSnap`.
  - Flips: `flipPivot` (centre of mass height), `flipTuckLift`, `flipLoadArch`.
  - `gearSinkVisual`: the share of the physics powder sink that is drawn (0.15). The course reads as packed snow, so the gear rides on top instead of disappearing.
  - `ANIM.board`: crouch, shoulder and hip opening, head turn, turn lead, heel sit, toe drive, press shift and pitch, air and grab tuck, `handDragEdge`.

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
3. Check it with `node web/scripts/equipment-check.mjs` (every spec validates; handling is finite), `node web/scripts/physics-variants.mjs` (carve radius, pop, powder speed, butter) and `?equip=snowboard&variant=<id>`.

**Guard rails for big catalogues:**
- `validateSpec(type, spec)` lists missing or out-of-range fields (length, widths, sidecut, flex, mass, rocker, stance…). `registerVariant` warns with that list.
- Partial specs merge nested groups (`graphic`, `profile`, `kick`, `stance`) field by field, so `{ id: 'park', profile: { type: 'rocker' } }` keeps the rest of the profile.
- `deriveHandling` clamps every multiplier (grip 0.6–1.45, pop 0.6–1.4, pivot 0.5–1.8, stability 0.6–1.5, float 0.5–2.5, spin 0.7–1.35), so odd data can't make the physics silly or NaN.

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
  - Pushing with W when slow: a one-foot skate cycle with the rear foot unstrapped, pushing on the toe side, and the body opened toward the nose.
  - In the air: knees tucked and arms wide for balance. Indy grab: the rear hand goes to the toe edge between the feet, and the board is pulled up.
  - **Hand drag** on deep, fast carves (edge above about 41°, faster than 6–9 m/s): toe side, the front hand reaches to the snow in front of the toes; heel side, the rear hand trails behind the heels.
- **Flips (both):** the rider rotates about the hips (`flipPivot`). While flipping the knees pull up and the hands go to the shins (`flipTuck`). A backflip preload arches the chest up and back.
- **Ski presses:** the skis pitch about the pressed tails or tips, the hips move over that end, and the tips snap up on the pop.
- **Gear in the snow:** only 15% of the physics powder sink is drawn (`gearSinkVisual`). Before, a slow board sat 10–12 cm deep and was invisible except for the bindings.

## Testing and tuning results

- `node web/scripts/physics-sim.mjs [ski|snowboard|both] [variant]` prints each value next to its target from the research. Current results:

| Metric | Skis | Board | Target (research) |
|---|---|---|---|
| Top speed on 25° groomed, cruise / tuck | 16.6 / 20.2 m/s | 16.2 / 18.5 m/s | 16 / 20 and 15 / 18.5 |
| Full-lock carve at 12 m/s | R 6.9 m, 1.58 g, β 7° | R 6.6 m, 1.58 g, β 8° | 1.8 g / 1.6 g sustained |
| Half-input carve at 12 m/s | R 15.2 m, 0.71 g, β 3° | R 11.8 m, 0.90 g | 10–16 m |
| Speed kept in a 1.4 s carve on the flat (straight glide 79% / 78%) | 80% | 78% | carving costs little |
| Max edge at 3 / 5 / 7 m/s, full lock | 29° / 35° / 47° | 30° / 44° / 64° | needs lean: edge ≈ lean + angulation |
| Edge switch | 0.30 s | heel→toe 0.38 s, toe→heel 0.42 s | 0.30 / 0.38 / 0.46 |
| Hockey / slide stop from 12 m/s | 6.6 m/s², 11 m | heel 5.7, toe 4.9 m/s² | 6.5 / 5.5 / 4.5 |
| Snowplough | 2.4 m/s² | — | 1.5–2.5 |
| Pop on the flat, full charge / tap | 0.65 m, 0.70 s / 0.27 m | 0.84 m, 0.80 s / 0.33 m | 0.30 / 0.45 m real; arcade about ×2 |
| Spin rate | 6.4 rad/s | 7.6 rad/s | 5.5–7 / 6.3–8 |
| Butter (keys, from neutral, 0.8 s) | park 118°, all-mountain 58° | 120° (park board 180°) | about 3 rad/s |
| Slalom on 20°, full lock every 1.2 s | holds 13.8 m/s | holds 12.4 m/s | linked carves keep speed |
| Turn shape on 30° (finish each turn at ±20° / ±90°) | 17.2 / 12.6 m/s | 16.2 / 10.9 m/s | rounder turns control speed |
| Wind-up on a flat ollie, no air input | (no 180 on non-twins: settles straight) | BS 180, clean | Steep-style preload |
| Course powder (21°) steady speed | 14.8 m/s | 14.9 m/s | — |
| Flip rate / one flip | 5.6 rad/s, about 1.1 s | 5.9 rad/s, about 1.1 s | 4.5–7 rad/s tucked |
| Kicker S / M / L on 16°, straight / popped air | 1.1 / 1.3 / 1.5 s, popped 1.7 / 1.85 / 2.0 s | 1.1 / 1.3 / 1.5 s, popped 1.8 / 1.9 / 2.05 s | size should matter |

- **On the real course,** a bot following the gully centre line for 60 s averages about 10 m/s (max about 16). The previous physics gained speed from every turn, a linear lateral-to-forward conversion; it did 0→13.6 m/s in 5 s while weaving on about 18°, which is faster than free fall along the slope allows. Constant full-lock zig-zagging is now about 6 m/s on average, as it should be.
- **Kickers** (`physics-kicker.mjs`, 60 m run-up on 16°): every kicker lands a popped 360, a backflip, a preloaded (hands-free) backflip and, on the board, an `FS Rodeo 720`. A ski cork 720 needs kicker L and is marginal: it slides out under-rotated, because the ski spin rate is lower.
- **Tricks** (`physics-tricks.mjs`, launches on the flat): Backflip / Frontflip / Wildcat / Tamedog clean. A flip released at 90° or 180° still comes round by momentum. `Left Cork 720` and `FS Double Cork 1080` (2.7 s of air) land on the board. A backflip with only 0.9 s of air crashes. W or S held through take-off never flips.
- **Real course** (`physics-course.mjs`, start to finish, no crashes in any style):
  - `straight`: 165 s / 183 s (skis / board). Average 15.7 / 14.1 m/s, about 1 s of natural air off each of the five drops.
  - `flip`: the bot loads the pop with S over each drop lip. Five clean Backflips (skis) and Wildcats (board), 1.2–1.4 s of air each, using the late pop because the riders leave the snow just before the lip.
  - `park`: five clean 360s.
  - `carve`: aggressive ±9 m linked turns every 1.6 s average 7–8 m/s.
- **Fuzz test:** 2 minutes per type of random steering, brakes, pops, grabs and mid-ride gear swaps produced no NaNs, no stuck states and no console errors. 48 rapid swaps across every variant and stance kept the shader-program count stable.
- **Performance:** about 0.07 ms per physics step and 0.2–0.7 ms per rider update.
- `node web/scripts/physics-variants.mjs` checks the trick names:
  - Regular: left = FS, right = BS. Goofy is mirrored.
  - "Switch FS 180", "Nollie FS 180".
  - It also prints per-variant handling. For example, the slalom ski grips and pops most, the powder gear sinks least, and the park board butters most (121° vs 70° for the freeride board in 0.6 s).

## Integration notes (files this track does not own)

- **fx.js:** it stamps two ski grooves (`FX.skiSpacing`) for both types. For the board, one wide groove (about the waist width, 0.25 m) from the waist contact point would be right. Spray could be driven by `rider.getContactPoints()` (load × speed × `skid`, and `edgeAngle` for direction).
- **ui.js:** the controls hint still reads like the ski controls. Suggested hints:
  - Both: "W/S in the air: flip · S + Space: backflip off the lip · Shift in the air: grab · hold Space over a roller to stay low".
  - Board: "W+Space nollie · steer while holding Space to butter".
  - A HUD equipment badge could read `player.equipment.spec.name`.
- **Score popups:** trick labels can now be long (`Switch Nollie FS Double Cork 1080 Indy`).
- **input.js:** a dedicated grab button on the gamepad (RB is tuck today, which also grabs in the air) and a stance toggle would help. The debug toggle reads the raw `input.pressed` set for `KeyE`.
- **Lobby** (checked against the lobby branch's `lobby/equipmentBridge.js` and `lobby/stage.js`):
  - It calls `player.setEquipment(type)` and `rider.setEquipment(type)` with `'skis' | 'snowboard'`. Both are accepted (`normalizeType` maps `'skis'`/`'board'`), so the bridge reports `'native'` and the placeholder board is never needed.
  - Its preview `Player` never steps physics. The rider notices this (`player.simulated` is unset) and leans from `turnInput`, so the lobby's idle sway still shows.
  - Gear events carry `player`, so lobby swaps don't re-gear the in-game rider.
  - Variant pickers can use `listVariants()` and `createEquipmentModel()`, and stance via `player.setStance()`.
- **main.js merge:** the lobby branch calls `applyGameEquipment(profileStore.equipment)` after `rider.load()`. To keep `?equip=`/`?variant=`/`?stance=` working, apply them after that call (URL overrides the profile). Both branches add `rider` to `window.__sendit`; keep one.
- **config.js merge:** the lobby branch changed `holdStillSlope` to 0.002. This branch already carries the same value and comment.

## Known issues

- At full lock and 10 m/s most variants are grip-limited, so the carve radius differs between models mostly through `grip` and `pivot`, not the sidecut. The sidecut shows more with partial input.
- Flips are about the gear's lateral axis only. A flip combined with a spin is drawn as a yaw on top of the flip, which reads as a cork. There is no separate off-axis (rodeo or cork) axis, and landing roll is not evaluated, only yaw and pitch.
- The frontflip has no preload. W + Space is the nollie, and preloading a front flip from it would flip every nollie.
- Landing impacts off the course's kickers are 9–11 m/s normal, an equivalent fall height of 4–6 m, which is far beyond what real legs absorb (about 1.5 m). The kickers land on the natural slope, not a designed landing, so the game tolerates up to 12.5 m/s clean (see research §7.2).
- No edge catches (research §7.5): left out on purpose.
- Riding switch on skis is only rewarded for the twin-tip park ski.
- The grab name depends on the steer and W/S inputs held at the moment of the grab; there is no dedicated grab-selection UI. W / S held with Shift pick nose and tail grabs, not flips.
