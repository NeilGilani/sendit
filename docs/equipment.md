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
| `web/scripts/physics-combo.mjs` | Headless combo bench: air time, apex and landing point of corks / rodeos / misties / double corks against a straight air (flat and a 32° landing), the body's tilt path (deepest tilt, off-axis passes, cone fit), landings, no spin parked mid-flip. `--check` asserts them (docs/jumps-research.md §8). |
| `web/scripts/combo-shots.mjs` | Side-camera frame sequences of combo tricks in the real game (contact sheet per trick) and the posed body's centre-of-mass wobble about the flight path. |
| `web/scripts/physics-rotation.mjs` | Headless rotation-feel bench: carry-over after letting go of a flip, the counter key, and how fast flips / spins start when pressed at different moments. `--check` asserts the targets (docs/jumps-research.md §7). |
| `web/scripts/physics-kicker.mjs` | Headless kicker bench: a features.js-shaped kicker on a slope, straight, popped, spun, flipped and preloaded. Takes `[ski\|snowboard\|both] [slopeDeg]`. |
| `web/scripts/physics-course.mjs` | Headless bot on the real hand-built gully (course.js on the game's 1.25 m grid), start to finish. Styles: `carve`, `straight`, `park` (pop + 360 off the drops), `flip` (preloaded backflips). Logs landings, stumbles, crashes and speeds. |
| `web/scripts/physics-steer.mjs` | Headless steering-feel bench at pinned speeds with each map's physics: turn-in time, full-lock gear and path rates, skid, key-tap size, 30 % / 60 % stick response, edge-to-edge time, release. |
| `web/scripts/physics-release.mjs` | Headless steer-release bench: hold a turn, let go, time the settle. |
| `web/scripts/rider-seq.mjs` | GPU: pose contact sheet through a scripted slalom (frozen at each capture, so frames are on time), with world-space pose numbers (head / chest roll, counter-rotation, head vs path). Env AT, V0, Q. |

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
  | `flipTuck`, `spinTuck` | the rider's shape in the air: flip tuck 0 (layout) … 1 (tight tuck); spin pose −1 (arms out) … 1 (arms in) |
  | `lastPopQ` | 0..1 how well the last pop was timed (1 = right at the lip); scales the rotation set |
  | `dyn.spinH`, `dyn.flipH` | rotation momentum in the air (rad/s in the neutral spin / open flip pose) |
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
| S while charging | **Backflip preload**: the rider arches back, and the pop leaves the lip already rotating (55% of a full flip set). Keep S held into the air to finish the throw. No stop or plough while charging. | Same (a **Wildcat** off the tail) |
| W pressed while charging (Space first) | **Frontflip preload**: the rider folds forward; the flip commits only if W is still held as you leave the snow (let go before the lip for a plain nose press). W already held when Space goes down (a tuck, or W + Space for a **nollie**) never preloads. | Same (a **Tamedog** off the nose) |
| A / D in the air | Spin, named Left/Right 180/360…. **Spins are set at the take-off**: wind up while charging, pop at the lip, keep steering for the first 0.3 s (the throw). After that, steering with the spin pulls the arms in (faster) and against it flings them out (slower). After the throw, steering with no spin going still starts a slow **late spin** on a big air (a 180 / 360, never a set). Let go and the rider spots the landing. Rolling off a crest or lip **without popping**, a turn held from the ground stays a carve: it only spins once steer is let go and pressed again. | Spin, named **FS/BS** 180/360… by stance and switch (switch FS = **Cab**, Half-Cab for a 180). Same set / throw / tuck / spot. |
| W / S in the air | **Frontflip / backflip** (stick forward / back). A flip is thrown in the first 0.4 s of the air, up to 0.7 s on a 3 s air (a preload already set most of it). After that W / S still always do something: with no flip going, a **late throw** starts a slow one (enough for a single on a big air; on a small kicker it's too late and a one-time hint says to throw at the lip); with a flip going, the key in its direction **tucks** (faster), against it **stretches out** (slower; near upright it also evens out a slight over-rotation). Let go and the rider spots the landing: comes round early and stretches out (layout) for the touchdown. Keys already held at take-off (a W tuck, S brake) are ignored until pressed again — a one-time hint says so — except the key of a preload. Flip keys work while grabbing. With a spin: **Cork** (back) or **Misty** (front), Double/Triple by flips. | **Tamedog / Wildcat** (front / back over the toe-heel axis). With a spin: **Rodeo** (single back), **Double Cork** (more), **Misty** (front). |
| Shift in the air | Grab: Safety, Mute or Japan. The hand takes ~0.2 s to get there; the rider lets go by itself 0.22 s before touchdown. | Grab: Indy or Melon. With W it is a Nose grab; with S, a Tail grab. |
| Left stick in the air (gamepad) | The rotation reads the stick linearly past its dead zone and mapped onto a square (`input.js airStrength`): a full push straight or diagonal (a cork) throws as hard as the keys; half a push spins at about half rate. On the snow the stick keeps its carving curve. | Same |
| E (debug) | Swap to the snowboard | Swap to skis |

Frontside means the toe side, and so the chest, swings toward the direction of travel first. For a regular rider riding forward that is counter-clockwise from above, which is a left spin. Goofy mirrors it, and riding switch mirrors it again.

## Physics model

### The shared carve/skid model (`physics/edge.js`)

1. **Edge angle.** The steer input sets the target `θ_t = steer · maxEdge`. The edge follows with a first-order lean response, rate-limited by the edge-switch time: 0.30 s for skis; 0.38 s heel→toe and 0.46 s toe→heel on the board.
   - **You need speed to get on edge.** The edge angle is the body's lean plus angulation (knees, hips, ankles), and the lean needs a turn force to lean against: `tan φ = a / g`. So `maxEdge` is capped at the largest θ with `θ ≤ atan(min(v²/(R_eff·cos θ), a_max)/g) + angulation`, found by bisection. Angulation is 26° for skis and 24° for the board.
   - In practice: about 29° at 3 m/s, 35–44° at 5 m/s, and the full 64–68° from about 8 m/s. Slow turns therefore come from the rotary pivot (a skid), not a deep carve. Turn rate when slow is unchanged.
   - **Letting go.** With the keys or stick back at neutral (|steer| < 0.05), the input relaxes at `steerRelease` instead of `steerResponse`, and the edge flattens at `edgeRelease` instead of `edgeResponse` (skis 22 / 22 vs 14 / 14, board 18 / 15 vs 11 / 9). A released turn stops about 40% sooner (`node web/scripts/physics-release.mjs`: skis 0.22 → 0.13 s, board 0.32 → 0.20 s at 12 m/s; edge flat 0.33 → 0.22 s and 0.47 → 0.28 s). Turn-in, linked turns (one key straight into the other) and partial stick steering are unchanged. At high speed (Ravenspire) the skis still realign onto their path for a further ~0.1–0.2 s, a slow counter-swing under 10°/s.
   - **High-speed handling (50–70 mph).** At speed the grip limit is reached on a light edge (about 20° at 30 m/s), so before, 30%, 60% and full stick all gave the same turn and the rest of the input only became skid (14.6° on skis and 18.8° on the board at full lock, 30 m/s). Three tunables phase in over `carveInputV` (16 → 26 m/s), so Valcrest and Blackspruce's tree slalom keep the snappy response:
     - `carveInput` (1) with `carveCurve` (0.8): the held share of the max edge picks that share^0.8 of the grip-limited curvature, so the turn grows evenly with the stick.
     - `pivotGrip` (1.15): the rotary pivot asks at most 1.15× the grip-limited carve rate, so full lock is a deep carve with a little drift.
     - `washMax` (0.2): over-demand that skids is capped at 0.2× the grip curvature.
   - Measured with `node web/scripts/physics-steer.mjs` (pinned speed, flat snow, each map's physics). Skis at 30 m/s: stick 30 / 60 / 100% path rate 33.8 / 37.3 / 38.5 → 12.9 / 24.8 / 37.7 °/s, skid 14.6° → 6.7°, a 0.12 s key tap 6.1° → 3.2° (finer corrections), turn-in 0.08 → 0.18 s (builds instead of snapping). Board at 30 m/s: skid 18.8° → 5.9°, full-lock path rate 34.0 → 33.0 °/s. Edge-to-edge stays 0.1–0.13 s; at 8–18 m/s nothing changed. The Blackspruce bot (`map2-bot.mjs --verify`) finishes all four runs with no crash.
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

- **Rotation is angular momentum** (docs/jumps-research.md). Real riders set their rotation on the lip and can only change shape in the air (tuck to speed up, open up to slow down); the game does the same, so how far you can rotate comes from the set and the air time, not from holding a key. State: `dyn.spinH` / `dyn.flipH` = momentum, expressed as the rate in the neutral (spin) / open (flip) pose.
  - **The set at take-off.** Pre-wind (45–55% of the ground yaw rate), the **wind-up** (steering while charging: up to `windupSpin` 2.6 / 3.2 rad/s × spec spin) and the **flip preload** (S while charging: `flipPreload` 55% of `flipSet`), all × the pop timing.
  - **Pop timing** (`player.lastPopQ`, 0..1): 1 when the pop is released right at a lip (the snow falls away from the path within `popLipTime` 0.12 s), down to `popEarlySet` (0.55) when the lip is `popEarly` (0.5 s) ahead, `popFlatSet` (0.7) with no lip ahead, a late (coyote) pop loses up to a third, rolling off without a pop sets `rollSet` (0.6). A full set needs the pop at the lip: the most momentum reachable is × (0.6 + 0.4·timing).
  - **The throw.** For `spinThrow` (0.3 s) / `flipThrow` (0.4 s) after leaving the snow — plus `spinThrowAir` (0.1) / `flipThrowAir` (0.15) s per s of the air expected at the take-off beyond 1 s (`dyn.airPred`; a 3 s air: 0.5 / 0.7 s) — steer / W / S still add momentum at `spinThrowRate` / `flipThrowRate`, fading over the window. Without a wind-up / preload the throw tops out at `spinThrowMax` (3.4 / 3.8 rad/s) / `flipThrowMax` (2.0): a thrown-only 360 or backflip is fine, a double needs the preload.
  - **The late flip throw.** After the window, W / S with no flip going (or a slow one in the same direction) still build momentum, at `flipLateRate` (5 rad/s²) up to `flipLateMax` (1.8 rad/s, ≈ 4.1 tucked): a late single on a big air, never a set. It needs `flipLateAir` (1.7 s) of air left to start, so a late press on a small kicker can't throw you into a half flip.
  - **The late spin.** After the spin window, steering with no spin going (or a slow one the same way) still builds one at `spinLateRate` (6 / 6.5 rad/s²) up to `spinLateMax` (2.2 / 2.4 rad/s neutral, ≈ 180–200°/s tucked): a late 180 or 360 on a big air, never a set. It needs `spinLateAir` (0.8 s) of air left to start; a turn held off a lip without a pop stays locked until re-pressed. A slow spin the other way — no faster than `spinDrift` × `spinLateMax` (a carve's pre-wind, a throw reversed late in its window) — turns round under the same rules instead of opening up and drifting the wrong way all air; bigger sets, and anything in the last `spinLateAir`, only stall. Building a late spin while grabbing tucks fully (a grabbed late 180 is as quick as one without the grab). Both throws never add momentum slower than the late rate, so a press near the end of a window isn't the slowest moment to press.
  - **Shape.** Afterwards the stick in the rotation's direction tucks (flip × `flipTuckGain` 2.3, spin × `spinTuckGain` 1.45), against it opens (spin × `spinOpen` 0.6; a flip stretches into a full layout, × `flipOpen` 0.75). Poses take `poseTime` (0.22 s) to change, so a flip winds up, rotates steadily and slows into the landing. A tight flip tuck holds `flipTuckHold` (1.6 s) at full gain, then fades over `flipTuckFade` (1 s) to `flipTuckFloor` (20%): the legs hold against a load ∝ ω², so a triple needs ~3 s of air and a perfect set, and long airs don't turn into quads.
  - **Spotting** (stick / keys released): flips plan to come round early and open into the layout for the last `flipSpot` (0.35 s), with the tuck (or the stretch, down to × `flipOpen`) the rest of the rotation needs; just past upright with the next one out of reach they stretch out and ride out the small over-rotation ("out of reach" counts the tuck tiring, so a spot never chases an extra flip it can't finish). Stretching out of an over-set flip sheds momentum at `flipSpotBleed` (2 rad/s², down to what the landing needs, never below 2 × `flipMinH`): letting go after most of a flip on a big air carries on ≈ 95–125° instead of 130–150° (or a whole chased extra flip). A rate, so the short time left on a small air hardly feels it. **Counter key:** the key against the flip within `flipCounterAngle` (50°) past upright, or half that before it, sheds momentum at `flipCounter` (4 rad/s²) — it evens out a near miss by ≈ 5–20°, never stops the flip (floor 1.2 × `flipMinH`). Spins pick the pose that brings the next alignment (nose, or tail for boards and twin tips) round at touchdown; within `spinCheckAngle` (40°) of one — or when the next is out of reach — the upper body checks the spin onto it (≤ `spinCheck` 3.2 rad/s, which bleeds the momentum; it also squares up a rider launched mid-skid on maps with `airSettleAngle`). A check the spot has started is seen through even once the momentum it sheds drops below `spinMinH` (it used to let go there and drift sideways into the landing), and checks aim to arrive one `1 / spinResponse` before touchdown, since the rate lags its target. With no momentum and too little air left for the late spin, steering only twists the hips (`airTwist` 1 rad/s, nothing stored).
  - **Rates.** Full set: skis 345°/s neutral, 500°/s tucked spin (`spinSet` 6.0), board 390 / 565°/s (6.8); flips 180°/s open, ~410–425°/s (≈1.15 rev/s) tucked (`flipSet` 3.1 / 3.2). The research gives 500–650°/s average spins and 1.0–1.4 rev/s flips for experts.
  - **Ceiling** (`node web/scripts/physics-tricks.mjs`, a frame-perfect set and the key held to touchdown): 1.1 s of air → 1.0 flip, 1.4 → 1.4, 1.8 → 1.9, 2.2 → 2.3, 2.6 → 2.7, 3.0 → 3.0, 3.4 → 3.3, 3.8 → 3.5 (research: 1 flip ≈ 1.0–1.3 s, 2 ≈ 1.9–2.3 s, 3 ≈ 2.6–3.0 s, quads ≥ 2.8–3.2 s at record level). Landed with a skilled release: thrown singles, a preloaded double at 2.45 s, a double cork 1080 at 2.6 s (sketchy), a triple at 3.2 s; a full set tucked to 300° on a 1.85 s air over-rotates.
- **Landing assist (SSX-style).** In the last `landAssistTime` (0.25 s) with the stick released, a gear within `landAssistAngle` (14°) of its path settles straight.
- **Grabs.** Shift in the air, after 0.12 s of air time. The hand reaches it at `grabRate` (≈0.2 s) and lets go at `grabRelease`; the rider lets go by itself `grabLetGo` (0.22 s) before touchdown. A grab is a compact shape: it keeps a flip from stretching out (tuck ≥ 0.1, so you can still spot), sets a spin's pose to 0.6, and lowers the air drag; the flip keys still work while grabbing. Holding a grab through a whole flip lands it sketchy — let go to spot. The same for spins: the spot only works once the hand is off (let go ≈ 0.6 s before touchdown: 1.6 % crashes in the release sweep; held to the automatic let-go: 22 %), and after a crash like that a one-time hint says so. A grab held for 0.25 s or more scores and names the trick. Each grab moves its own hand to its own spot:
  - Board: Indy is the rear hand to the toe edge, Melon the front hand to the heel edge, Nose grab the front hand to the nose, Tail grab the rear hand to the tail.
  - Skis: Safety is the left hand to its ski, Mute the right hand across, and Japan crosses the skis.
- **Trick label.**
  - Board example: `Switch Nollie FS 540 Indy`.
  - Ski example: `Switch Right 360 Japan`.
  - Points: air time × 80, + 90 per 180°, + the grab, + 30 for switch, + 50 for a perfect landing (8° or less).
- **Kicker pop.** A pop on a kicker lip gets `lipPopBonus` (0.8) of the flat pop — the legs have less time to push (the research measured −2.5…+1.1 m/s on real park lips) — and every pop fades with speed to 45% from 10 to 26 m/s (`popSpeedFade`). It rides the ramp's launch angle. S / M / L kickers (physics-kicker, 16°) give 1.1 / 1.3 / 1.45 s straight and 1.55 / 1.75 / 1.85 s popped on skis (1.6 / 1.8 / 1.9 on the board).
- **Air drag** is `a = k·v²` with `airDrag` k = ρ·CdA / 2m = 0.0027 (CdA 0.4 m², ρ 1.0, 75 kg; terminal speed ≈ 60 m/s), × `airDragCompact` (0.7) when tucked or grabbing. It used to be ≈0.0006 (the old formula's ×0.1), a fifth of a real rider's. It hardly changes a park kicker (2% of the distance at 10 m/s) but cuts 10–15% off a 30 m/s cliff flight.
- **Flips.** W / S (stick y) in the air: momentum, throw, tuck and spot as above, × √(spec spin) on the set.
  - The flip turns about the gear's lateral axis **as it was when the flip started** (fixed in the world, so it no longer turns with the rider mid-spin). For the board, ridden sideways, that is the toe-heel axis, so a backflip is a **Wildcat** (over the tail) and a frontflip a **Tamedog** (over the nose).
  - **Spin + flip = one tilted axis** (`physics/offaxis.js`, docs/jumps-research.md §8). Each flip is one revolution of the body about an axis tilted α from vertical toward the flip axis; the body's up axis rides a cone round it (deepest at 2α), and the spin beyond the 360° that revolution carries is a twist about the long axis. α comes from the spin : flip rate ratio r: ≈ 72° for a backflip 360 / rodeo 360 (r ≈ 1), 64° for a rodeo 540 / double cork (1.5), 58° for a cork 720 (2), down to 50° (`OFFAXIS.alphaTable`, +6° for a frontflip / misty). Under r ≈ 0.45–0.75 the flip stays a plain flip about its axis (α = 90°) and the spin is an aerials-style twist. The shape only changes near upright (`OFFAXIS.window` 16°), where both forms coincide, so nothing pops. A cork 720 now tips the body ≈ 105–110° at the deepest (it used to go fully upside down, 180°, in every combo), a misty ≈ 120°, a rodeo 540 ≈ 130°, a double cork twice ≈ 135°.
  - Composed at render time: `orient` stays the un-flipped base (it carries the heading), `renderOrient = renderTrick · renderBase`, with `renderTrick = offAxis.quat(renderFlip)` (identity at whole flips, so take-offs and clean landings are exactly the plain heading). `renderFlip` is signed (flip × travelSign). The landing's pitch check uses the same attitude (`offAxis.tilt`: the body's tilt off upright; equal to the flip angle for a plain flip, a little less in a cork). On touchdown the leftover pitch settles visually over about 0.2 s instead of snapping.
  - **The flight never depends on the rotation**: the flip tuck no longer lowers the air drag (only a grab does), so a cork, a rodeo or a double cork flies exactly the arc, air time and landing point of a straight air off the same take-off (`physics-combo.mjs --check`: 0.00 % on flat and on a 32° landing; it was +0.75 % air and +0.9–1.7 % distance). In the air the rider pivots about the posed body's own centre of mass for the spin and the flip alike, which sits on the flight path (`player.renderCom()`), so the body doesn't orbit the path either (rider.js).
  - **Spotting a spin mid-flip.** With more than `flipBusyAngle` (120°) of a flip still to come, the stick let go doesn't check the spin onto an alignment it passes (it used to park the spin while upside down, turning a cork into a plain flip half-way); it keeps spinning, open if the next alignment is out of reach, and checks as the flip comes out.
  - **No flip from a little hop:** a flip can't be thrown with less than `flipMinAir` (0.45 s) of predicted air. The time to land is predicted by marching the ballistic path against the real terrain. The stick has a wide dead zone (0.4) for flips, so an off-axis stick while spinning doesn't start one.
  - **Commitment.** Keys held at take-off are ignored until re-pressed (a one-time hint explains it), so a held tuck or nollie never flips by accident; a re-press at any time works (the late throw). A flip with momentum always carries on; the rider can only tuck, open, or let go and spot. Too much set for the air (a full set tucked to 300° on a 1.85 s air) over-rotates; too little under-rotates.
  - **Preload.** S held while charging (`flipLoad`) leaves the lip already rotating with `flipPreload` (55%) of the set; keep S held through the throw for the rest. W pressed while charging (`frontLoad`, Space first) and still held at the lip does the same for a frontflip. Rotation is set on the ramp, as in Steep, Shredders and the aerials research.
  - **Names.** Skis: Backflip / Frontflip, or with a 360+ spin `Left Cork 720` / `Misty`. Board: Wildcat / Tamedog, or `BS Rodeo 540` (a single backflip with a spin), `FS Double Cork 1080`, `Misty`. Double and Triple prefixes count the flips.
  - **Points:** +150 per flip.
- **Landing (pitch and impact).** On top of the yaw rules, pitch must come round to within `flipLandClean` (22°) for a clean landing. Up to `flipLandStumble` (42°) is a stumble; beyond that is a crash. Impacts above `hardLanding` (12.5 m/s into the slope) turn a clean landing into a stumble; above `crashImpact` (18 m/s) the rider crashes.
- **Natural air.** The rider leaves the snow when following it would need more downward pull than gravity gives: `v·n′/dt > g·n′.y · liftOffGrip`, which is v²κ > g cos θ with 1.25× for passive absorption. Drops, rollers and side hits launch at speed; small lumps don't (`liftOffMin`).
  - Crouching to charge raises the factor by `liftOffAbsorb` × charge (up to about 1.8×), so riders can hold Space to stay low over a crest.
  - **Late pop.** If the snow falls away while charging, the charge, preload and wind-up are kept for `latePopTime` (0.15 s): releasing then still pops off the lip.

### Fixes in the shared player code (they help both types)

- **Terrain following** used to throw away 0.3% of the speed every frame, about 18%/s. Now only abrupt impacts beyond `smoothFollow` cost speed.
- **Kicker lips.** The terrain normal is sampled at grid spacing (about 3 m), which smeared across lips and steered riders down the drop. As a result kickers barely launched (0.37 s of air). On park features the physics now samples a one-sided normal, 0.35 m upstream; the same kicker gives 1.2 s straight or 2.2 s with a pop.
- **Launched sky-high at the start of a kicker** (Valcrest). Kickers were built from the centre-line ground height, so on a cross-slope the downhill half of the ramp started 0.4–1.1 m above the local snow: a vertical step at the very start of the ramp (11 of the 17 kickers), which the fine lip normal turned into a 57–69° launch at 9–13 m/s straight up. `kickerY()` (features.js) now fades the levelling in over the in-run and out across the sidewalls, so the ramp starts flush; and the ground follow turns the path upward at most `followMaxRate` (12 rad/s), so a step in any height field is a bump, not a ramp. Regression check: `node web/scripts/jumps-valcrest.mjs --check` (2870 take-offs: every kicker × speeds × offsets × angles × rolled / popped; 461 anomalous before, 0 after; the follow guard alone left 139).
- **Popping on a rising ramp** used to "land" again the very next frame. A rider moving off the surface now stays airborne.
- **Glued to convex terrain.** The ground step projected the velocity back onto the surface every frame, so nothing but a kicker's discontinuous lip could ever launch the rider. The course's five natural drops gave no air at all. Natural air (above) fixes this: a straight rider now gets about 1 s off each drop.

## Tunables (config.js)

- `PHYSICS`: shared values:
  - `gravity`, friction by surface, `softCapDrag`.
  - `powderDepth`, `turnScrub`.
  - `terrainImpactLoss`, `smoothFollow`, `followMaxRate` (12 rad/s: the most the ground can turn the path upward per second; a height-field step is a bump, never a ramp).
  - Jumps (docs/jumps-research.md): `lipPopBonus` (0.8), `popSpeedFade` ([10, 26, 0.45]), `airDrag` (0.0027 = ρ·CdA/2m), `airDragCompact` (0.7), `airGravity` (1: no float), pop timing `popLipTime` (0.12 s), `popEarly` (0.5 s), `popEarlySet` (0.55), `popFlatSet` (0.7).
  - `slowmo` (null = off; maps: `{ minAir, minDrop, scale, easeIn, hold, easeOut, cooldown }`).
  - Natural air: `liftOffGrip`, `liftOffAbsorb`, `liftOffMin`, `latePopTime`; `hardLanding`.
  - `landAssistTime`, `landAssistAngle`, `spinCheckAngle`.
  - `digitalSteerStart`, `digitalSteerRamp` (the key steering ramp).
  - Landing impact and crash speeds, stumble time and handling.
- `PHYSICS.ski` and `PHYSICS.snowboard`:

  | Group | Keys |
  |---|---|
  | Speed and steering | `maxVelocity` (also the HUD/FX speed ratio), `steerResponse`, `steerRelease` (back to neutral once let go) |
  | High-speed handling | `carveInput`, `carveCurve`, `carveInputV`, `pivotGrip`, `washMax` |
  | Edge | `maxEdge` (`maxEdgeToe`/`maxEdgeHeel`), `edgeSwitchTime` (`heelToToe`/`toeToHeel`), `edgeResponse`, `edgeRelease` (flattening with the input released), `engage` |
  | Grip and sidecut | `latG` (toe/heel), `speedRadius`/`speedRadiusV`, `carveAssist` |
  | Redirect | `gripRate`, `flatGrip`, `carveEff`, `skidEff`, `skidMu`, `carvePump` |
  | Pivot | `pivotRate`, `turnRateFast`, `pivotFade`, `betaMax`, `selfAlign` |
  | Stops | `stopAngle`, `stopTurnRate`, `stopMu`/`stopMuHeel`/`stopMuToe`, `stopEdge` |
  | Snowplough (skis) | `plowSpeed`, `plowDecel`, `plowTurn` |
  | Push and drag | `pushAccel`, `pushMaxSpeed`, `dragUpright`, `dragTuck` |
  | Powder | `powderFloat`, `sinkSlow`/`sinkFast`, `powderBog`, `powderDrag`, `powderBogDecel`, `powderSteer` |
  | Butter (board) | `butterRate`, `butterMaxSpeed`, `butterDrag` |
  | Air | `popMin`/`popMax`, `nollie`, `chargeTime`, `rollSet` (set rolling off without a pop), `poseTime` |
  | Spins | `spinSet` (full set, rad/s neutral), `spinTuckGain`, `spinOpen`, `spinResponse`, `prewind`, `windupSpin`, `spinThrow`/`spinThrowAir`/`spinThrowRate`/`spinThrowMax`, `spinLateMax`/`spinLateRate`/`spinLateAir` (the late spin), `spinDrift` (slow spins the other way turn round), `spinMinH`, `spinCheck`, `airTwist` |
  | Flips | `flipSet` (full set, rad/s open), `flipTuckGain`, `flipTuckHold`/`flipTuckFade`/`flipTuckFloor` (the tuck tires), `flipResponse`, `flipPreload` (share of the set), `flipThrow`/`flipThrowAir`/`flipThrowRate`/`flipThrowMax`, `flipLateMax`/`flipLateRate`/`flipLateAir` (the late throw), `flipOpen` (stretched layout), `flipSpotBleed` (momentum shed stretching out of an over-set flip), `flipCounter`/`flipCounterAngle` (the counter key near upright), `flipMinH`, `flipMinAir`, `flipCheck`, `flipSpot`, `flipLandClean`/`flipLandStumble` |
  | Grabs | `grabRate`, `grabRelease`, `grabLetGo` |
  | Edge vs speed | `angulation` (deg beyond the lean) |
  | Butter (skis) | `butterRate`, `butterMaxSpeed`, `butterDrag`, `butterNonTwin` |
  | Landing | `landClean`/`landStumble`/`landCrash`/`landSlide`, `switchLand` |
- `ANIM`:
  - Lean and edge caps: `maxLean`, `maxGearEdge`, `maxAngulation` (how far the drawn edge may differ from the lean, 0.7 rad).
  - `landLeanTime` / `landLeanResponse`: for 0.35 s after a landing the lean catches up at 30/s, so the body is plumb at once on a steep face.
  - `carveCrouch`: extra crouch at full lean (a lower, athletic stance in hard carves).
  - `angulation`, `angulationReverse` (the share kept when the edge is below the lean or already on the other side, 0), `crossover` (the upper body leading into the new turn at an edge change), `polePlantTime`.
  - Skis: `skiCounter` (counter-rotation per rad of lean), `skiStanceCarve` (wider stance in deep carves), `skiTipLead` (the inside ski runs up to 8 cm ahead in a carve).
  - Head: `headLevel` (share of the body's world roll the head takes back out), `headLook` (head turn into the carve per rad of lean), `skiSkidLook` (the ski head looks along the path, down the slope in a hockey stop).
  - Letting go: `rollRelease` (the lean eases back up, 15 vs `rollResponse` 10) and `leadRelease` (the upper-body turn lead, 10 vs 6), used only while the steer is released and the value is heading back to neutral.
  - Skis: `skiPressPitch`, `skiPressShift`, `skiPopSnap`.
  - Flips: `flipPivot` (centre of mass height), `flipTuckLift`, `flipLoadArch`. In the air the drawn tuck follows the physics tuck (`player.flipTuck`); a flip turning open is drawn as a layout (body long, arms out), and spins wrap the arms in (`player.spinTuck` > 0) or fling them wide (< 0) — `Rider.armSpin`.
  - `gearSinkVisual`: the share of the physics powder sink that is drawn (0.15). The course reads as packed snow, so the gear rides on top instead of disappearing.
  - `ANIM.board`: crouch, `crouchHinge` (hip fold per unit crouch), `toeTall` (hips unfold on toe-side carves), `skidLook` (head and shoulders look back down the path in a slide stop), `headTilt` (levels the head turned down the nose), shoulder and hip opening, head turn, turn lead, heel sit, toe drive, press shift and pitch, air and grab tuck, `handDragEdge`.

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

A new model also gets its Locker ratings automatically (next section); the rating scale re-fits to include it.

## Gear stats in the Locker (ratings, best-at badges, the ★ pick)

Every ski and board card in the Locker shows what it rides like, so you never have to equip pieces one by
one to feel the difference. Code: `web/src/lobby/gearAdvisor.js` (pure, Node-testable maths),
`web/src/lobby/gearUi.js` (HTML builders, reads the profile and progression), `web/src/lobby/tabs/gear.css`,
used by `tabs/equipment.js` (Locker → Gear) and the Skis / Board slots of `tabs/locker.js` (Locker → Skins).
Tests: `node web/scripts/gear-advisor-unit.mjs` (also part of `unittest.mjs`) and lobbytest step 6d.
**Nothing here changes physics**: the ratings are read from the same `deriveHandling()` multipliers the
physics uses, and the specs are never written.

### What the player sees

- **Gear tab:** the Skis / Snowboard choice, then the **★ Recommended for you** plate (the pick, its name and one
  line saying why, e.g. "You land lots of spins → Twin 168 pops and spins best") and under it **Best for
  <loaded mountain>: …** with the terrain that decides it. Then one card per owned ski (or board): picture,
  name, badges, five rating bars with their numbers. Hover or keyboard-focus a card and each bar shows the
  difference to what you ride: the bar drops to the lower value and the gap fills green (better) or striped
  red (worse), with ▲ / ▼ and the amount (on touch screens the deltas are always on). Click a card to ride it.
- **Compare:** the Compare button on a card compares it with what you ride; press it on a second card to
  compare those two. Mirrored bars per rating (Gran Turismo / FIFA style) with the winner of each row lit, a
  "Ride this" button on each side, and a fold-out with the physics numbers behind it (pop, spin rate,
  pivot / butter, edge grip, stability and float as % of the stock model, turn radius, length, switch landings).
  Clicking the ★ plate opens the pick vs what you ride.
- **Skins tab (Skis / Board slots):** every tile carries its badges as icons and five thin bars under the art;
  hovering or focusing a tile (owned, or a "missing" silhouette) previews it in the detail plate below with
  labelled bars and deltas vs what you ride, plus Compare (opens the Gear tab with that piece compared).

### The five ratings (1–10)

| rating | from the physics (`deriveHandling`, ≈ 1 for the stock model) | why |
|---|---|---|
| **Speed** | 0.7 · stability + 0.3 · grip | skid scrub is divided by stability (edge.js); grip keeps you carving instead of skidding |
| **Carve** | 0.75 · grip + 0.25 · (stock radius / sidecut radius) | edge hold at high angles + how tight the carved arc is (κ = 1/R) |
| **Control** | 0.4 · pivot + 0.3 · stability + 0.3 · grip | pivot multiplies the turn rate you can ask for; stability calms it; grip stops wash-outs |
| **Park** | (0.45 · spin + 0.35 · pivot + 0.2 · pop) × 1.15 if twin | spin rate, butters, pop height, clean switch landings |
| **Powder** | √float | powder glide μ ÷ √float, sink and bog ÷ float (edge.js) |

The scale is fixed per type over every registered model (legendary topsheets share a stock shape): the best
model of each rating is 10, the weakest about 3.6 (40 % headroom below it, like Forza's 3–10 ratings), so the
bars never jump when you pull a new piece and a ski you don't own yet can be compared fairly. Skis and boards
have their own scales (different physics). Current values:

| ski | SPD | CRV | CTL | PRK | PWD | | board | SPD | CRV | CTL | PRK | PWD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ridge 172 | 5.9 | 6.6 | 4.9 | 5.6 | 6.0 | | Atlas 156 | 6.6 | 7.5 | 3.6 | 4.8 | 4.6 |
| SL Race 165 | 7.8 | **10** | 3.6 | 4.7 | 3.6 | | Steeple 161 | 9.1 | 9.5 | 4.6 | 4.0 | 5.1 |
| GS Race 188 | **10** | 8.3 | 5.3 | 3.6 | 4.2 | | Edge 163 | **10** | **10** | 4.7 | 3.6 | 3.6 |
| Float 186 | 4.8 | 3.6 | **10** | 6.8 | **10** | | Fish 158 | 5.7 | 5.5 | 6.5 | 5.6 | **10** |
| Twin 168 | 3.6 | 4.2 | 6.5 | **10** | 6.9 | | Butter 152 | 3.6 | 3.6 | **10** | **10** | 6.5 |

The older hand-typed `item.stats` in profile/items.js are no longer shown: they disagreed with the physics
(they gave the soft park ski the most pop, while its soft flex actually pops lowest; it wins Park on spin
rate, butters and switch landings instead).

### Best-at badges

Among the pieces **you own** of one type: **Fastest**, **Best carver**, **Most controllable**, **Best for
park**, **Best in powder**, each with its line icon (chevrons, carve arc, target, spin arrow, snowflake). A
badge needs two or more different models owned and a lead of at least 0.5 rating points over every other
model (`BADGE_MARGIN`); an exact or near tie gives no badge. A legendary topsheet rides exactly like its stock
model, so the two share a badge and count as one model.

### The ★ pick

`recommend(items, { maps, life, stats })` scores each owned piece with a weight per rating:

1. **The mountains** (`mapNeeds`): each map has a terrain mix (groomers, steep faces, trees, park; from its
   docs and description, `MAP_TERRAIN`; unknown maps fall back to their tags) and a powder weight from its own
   physics (`powderDepth` in `maps/<id>/tuning.js`: Kitsune 0.75, Ravenspire / Dragonback 0.6, Fjordline 0.45,
   Voltage 0.05). Each terrain asks for different ratings (`TERRAIN_NEEDS`, e.g. trees: control 0.6, carve
   0.25, speed 0.15). All non-experimental maps are averaged, shifted toward the ones you ride most.
2. **Your playstyle** (`playstyle(progression life, profile stats)`): tricks per km (and which kind: spins,
   flips, grinds from the trick book), top speed, wipeouts per km, clean turns per km. Its confidence grows
   with km ridden (15 km ≈ full) and is capped at 0.6, so the mountains always count. Under ~1 km it is zero
   and the pick is the all-mountain one.
3. The pick maximises Σ weight · u(raw rating) with u(r) = 1 − 1/r on the raw physics numbers: a weakness
   costs more than an equal strength earns, so a balanced piece beats a specialist unless the terrain or the
   rider asks for that speciality. Ties go to what you ride.

The one-line reason names the rating where the pick gains most and who asked for it: your playstyle ("You
ride fast (top 104 km/h) → GS Race 188 holds its speed best"), your favourite mountain ("You ride Kitsune Peak
most → Float 186 suits its deep powder"), or the mountains ("Most mountains here are deep snow → Float 186
floats best" / "Best all-rounder across all 7 mountains → Ridge 172"). With one model owned there is no pick
(the plate says to get a second one from cases). Because six of the seven mountains are deep-snow freeride,
the all-mountain pick among a full rack is the rockered powder ski / the soft park board; among the classic
three skis (Ridge, SL, GS) it is the Ridge.

`recommendForMap(items, map)` uses the loaded map's needs alone ("Best for Ravenspire"). It sits under the ★
plate in the Gear tab rather than in the Ride cluster, which belongs to Lobby.js and stays uncluttered.

### Research: how other games and ski shops present gear (October 2026)

| source | what it does | what we took |
|---|---|---|
| **STEEP** (Ubisoft 2016) | Gear is cosmetic: every ski and board rides the same; you pick a sport, not a stat line. Its progression was criticised as thin and unstructured. | Our gear does ride differently (spec-driven physics), so it has to *say* so on the card. |
| **Riders Republic** | Snow gear carries Speed, Acceleration, Absorption, Trick and Control plus one gear score; reviewers note the score goes up but the game never shows how a piece changes the handling (Ludo.guide; Digital Trends review). | Five named ratings with plain meanings, and per-rating deltas instead of one opaque score. |
| **SSX (2012)** | Each Deadly Descent has the gear for its hazard (armour for trees and rocks, wingsuit for gaps, headlamp for darkness, pulse goggles for whiteout). | "Best for <mountain>" from the map's terrain and snow. |
| **Forza Horizon** | Cars rated 3.0–10.0 on Speed, Handling, Acceleration, Launch, Braking, plus one Performance Index / class; the PI is one test-track lap and doesn't promise the car suits every route (support.forza.net). | A fixed ~3.6–10 ruler; the pick is explained per terrain rather than as one number. |
| **Gran Turismo 7** | Performance Points: one overall number used to cap events; tuning can raise PP without making the car faster (GT7 manual; Traxion). | No single power number; ratings straight from the physics. Mirrored compare bars. |
| **Mario Kart 8 Deluxe** | Kart / tyre / glider parts show bars (speed, acceleration, weight, handling, traction); bars are imprecise and a hidden mini-turbo stat matters a lot (MarioWiki). | Bars at a glance, exact numbers beside them, the physics behind them one fold away; nothing hidden. |
| **Destiny 2 / Diablo IV / COD** | Hover an item: stat bars show gains in green and losses in red against what's equipped; players complain when one green number hides a loss elsewhere (Blizzard forums). | Green / red on every rating, never one net arrow. |
| **Fortnite / Rocket League** | Lockers are cosmetic grids; hovering a tile previews it without equipping. | Hover / focus previews in the Skins detail plate; tile art stays the cases' art. |
| **RPG / Pokémon-style "recommended"** | One starred suggestion with a reason ("super effective"). | One ★ per type, always with its reason. |
| **Ski shops and reviews** | Categories: carving / frontside, all-mountain, freeride / powder, park, race (SL / GS). Reviews score stability at speed, edge hold / carving, float, playfulness, forgiveness, maneuverability (Blister 0–10; OutdoorGearLab weights stability 20 %, carving 20 %, crud 20 %, powder 20 %, playfulness 15 %, bumps 5 %; SKI magazine's hard-snow integrity and carving). | Speed ≈ stability at speed, Carve ≈ edge hold, Control ≈ forgiveness + maneuverability, Park ≈ playfulness, Powder ≈ float; the badges are the shop categories. |

What the best of these share: the comparison happens **where you choose** (on the card, on hover), deltas
are **per attribute and colour-coded**, the overall suggestion is **one symbol with a reason**, and
specialists get a short, proud label ("Fastest") rather than a paragraph.

## Rider animation (rider.js)

- **Proportions** (`web/src/character/body.js`, `PROPORTIONS`, applied once to the rest pose at load). The Quaternius model has a superhero cut. Measured on its bind pose (1.81 m), the head was about 20% too wide for the body, and the arm span was 1.65 m (real arm span ≈ height), mostly from a short upper arm. Now the head is ×0.94 (helmet included), the upper arm +4.5 cm, the forearm +1.5 cm and the hands ×0.92. Bones move, not vertices, so the body, outfit and helmet follow.
- **Head stabilisation (both):** the head takes `headLevel` (45%) of the body's roll from vertical back out, so the eyes stay nearer level. On a board it does this through head pitch, because the board leans about an axis that runs through the hips. On a traverse the lean only cancels the slope, so the head stays as it is. Measured: ski carve head roll 20–25° → 18–22° at a deeper lean; board heel-side carve 42–45° → 22–25°.

- **Shared layers:**
  - **Lean** = `atan(contact force across the gear / g)`. Carving leans in; a stop leans back up the hill.
  - The gear rolls further, to the physics edge angle, with the board pivoting about its biting edge.
  - Squash and stretch, chatter, sink, neon, lift seat, crash tumble.
- **Skis:**
  - Angulation: the hips move inside and the spine counter-rolls, so the upper body stays upright. Only edge on the lean's side and beyond it angulates (`angulationReverse` 0). Before, a lean bigger than the edge (a cross-slope, a turn being let go) or an edge already rolled to the other side (every edge change) rolled the spine further into the lean or the old turn.
  - Crossover: at an edge change the upper body leads the hips into the new turn (`crossover`). Measured with `web/scripts/rider-seq.mjs` on a Valcrest slalom: at the edge change the chest rolls 12–20° instead of 37–46°, and the head 10–15° instead of 31–37°.
  - Counter-rotation: the hips and shoulders face the outside of a carve (`skiCounter` × lean, about 30° from the skis at full lean), and the head looks along the path into the turn (`headLook`). A hockey stop still keeps the upper body facing down the path.
  - Inclination: lean = atan(contact force / g), up to `maxLean` 0.9 rad (52°), so high-g carves at speed read aggressive. The stance widens up to 3.5 cm per ski at full lean.
  - Hockey-stop counter-rotation: the torso keeps facing down the path.
  - Pole plant on every edge change at speed, a double-pole cycle when pushing with W, snowplough wedge, tuck, grabs.
  - When leaning, the inside ski is lifted back to the snow (inside knee flexes, outside leg extends).
  - Carving, the inside ski runs a little ahead (`skiTipLead`), and the pole tips rest on the snow surface (the shaft swings back when the hands are low).
- **Snowboard:**
  - Sideways stance: the chest faces the toe edge, with binding angles on the feet and knees toward the toes.
  - Hips and shoulders open toward the nose; the head turns toward the travel direction (`headTurn` 1.5 rad: about 8° off it riding straight), over the back shoulder when switch.
  - The upper body leads the turn, and comes back square at `leadRelease` once the steer is let go.
  - Toe side: knees drive and the torso stays tall. Heel side: sits down with the arms forward.
  - Slide stops: the board turns about 85° across the path while the head and shoulders keep looking down it (`skidLook`). Before, the head tracked the nose and looked 75° off the direction of travel; now it is about 10° off. The ski hockey stop does the same, 70° → 3–17°.
  - Crouching (speed, W) mostly bends the knees; the hips fold `crouchHinge` (0.19 rad) per unit crouch. A straight run holding W leans the torso about 28° over the toes (it was 33°, which read as a sideways lean from the chase camera).
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
- **Kickers** (`physics-kicker.mjs`, 60 m run-up on 16°, a skilled player: key in until the open-body rotation left carries it round, then let go): every kicker lands a popped 360 and a preloaded backflip; a backflip thrown in the air lands on M and L (sketchy on the ski S kicker, 1.55 s). A board cork 720 thrown only in the air comes round as a 540 (slide / stumble): a 720 on a 1.6–1.9 s air needs a wind-up on the snow.
- **Tricks** (`physics-tricks.mjs`, launches on the flat with a given set): thrown singles (back, front, rolled off), a preloaded double (2.45 s), a double cork 1080 (2.6 s, sketchy) and a triple (3.2 s, sketchy) land; a double thrown without a preload, a triple at 2.6 s and a quad at 4 s don't come round; a full set tucked to 300° on 1.85 s over-rotates; 360 / 720 wound up land, a ski 1080 at 2.2 s and a 720 thrown only in the air don't. W or S held through take-off never flips. The last line prints the ceiling (most flips per air time).
- **Jumps on the real maps** (`jumps-bench.mjs`): see docs/jumps-research.md §4.
- **Real course** (`physics-course.mjs`, start to finish, no crashes in any style):
  - `straight`: 165 s / 183 s (skis / board). Average 15.7 / 14.1 m/s, about 1 s of natural air off each of the five drops.
  - `flip`: the bot loads the pop with S over each drop lip. Five clean Backflips (skis) and Wildcats (board), 1.2–1.4 s of air each, using the late pop because the riders leave the snow just before the lip.
  - `park`: five clean 360s.
  - `carve`: aggressive ±9 m linked turns every 1.6 s average 7–8 m/s.
- **Fuzz test:** 2 minutes per type of random steering, brakes, pops, grabs and mid-ride gear swaps produced no NaNs, no stuck states and no console errors. 48 rapid swaps across every variant and stance kept the shader-program count stable.
- **Performance:** about 0.07 ms per physics step and 0.2–0.7 ms per rider update.
- **Polish pass** (docs/jumps-research.md §9; `node web/scripts/physics-polish.mjs --check`, sweep: `physics-sweep.mjs`):

| | before | after |
|---|---|---|
| late spin pressed 0.5 s in while grabbing (vy 12), ski / board | 1.42 / 1.32 s to 180° | 1.27 / 1.18 s (= without the grab) |
| pre-wind the other way + grab, stick against it after the window | ski 1.52 s, board never | 1.37 / 1.30 s |
| throw reversed late in its window (vy 15) | spun the old way 45°/s all air | 180° the asked way in 2.1 s |
| full set let go early, board, 2.4 s air, released at 45° | crash at 266° | clean 180 |
| release sweep, 10 922 airs let go with ≥ 0.6 s left | crash 98, slide 35 | crash 30, slide 12 |
| gamepad diagonal stick (cork): flip 180° | 1.18–1.30 s | 0.92 s (keys 0.92 s) |
| gamepad 40 % stick push in the air | no spin | 180° in 1.45 s |
| keyboard spin / flip thrown at the lip | 0.90 · 0.83 / 0.92 s | unchanged |
| body reactions' force read at 144 Hz (steady carve) | 14 % frame-to-frame ripple | 0 % |
- `node web/scripts/physics-variants.mjs` checks the trick names:
  - Regular: left = FS, right = BS. Goofy is mirrored.
  - "Switch FS 180", "Nollie FS 180".
  - It also prints per-variant handling. For example, the slalom ski grips and pops most, the powder gear sinks least, and the park board butters most (121° vs 70° for the freeride board in 0.6 s).

## Integration notes (files this track does not own)

- **fx.js:** it stamps two ski grooves (`FX.skiSpacing`) for both types. For the board, one wide groove (about the waist width, 0.25 m) from the waist contact point would be right. Spray could be driven by `rider.getContactPoints()` (load × speed × `skid`, and `edgeAngle` for direction).
- **ui.js:** `UI.trickTip` shows one trick tip after each of the first three clean airs (> 0.8 s) of a page load, keyboard or pad wording by the last input device: spins start at the take-off (steer while holding Space / A, keep steering off the lip); backflip preload (S / pull back while loading) and the W / S throw; in the air push with the spin to tuck, against it to slow, let go to land. Not yet hinted:
  - "Shift in the air: grab · hold Space over a roller to stay low".
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
