# Rider body: dynamics, reactions and the crash ragdoll

The rider's posture comes from `rider.js` (stance, lean, angulation, poles, grabs, flips). On top of that,
two systems make the body react to what actually happens instead of blending canned poses:

| File | What it does |
|---|---|
| `web/src/character/dynamics.js` | `BodyDynamics`: springs driven by the force the rider feels, plus event reactions |
| `web/src/character/ragdoll.js` | `Ragdoll`: Verlet particle skeleton that takes over the body in a crash |
| `web/src/rider.js` | creates both (`rider.dyn`, `rider.rag`), feeds them into the poses, writes the bones |
| `web/scripts/rider-poses.mjs` | pose sheet: scripted situations in the real game, frozen and photographed |

## Body dynamics (`dynamics.js`)

Every frame the rider measures the **specific force** it feels: acceleration (from the physics velocity,
low-passed over ~35 ms) minus gravity, in the gear frame (x right, y up, z forward along travel). In the
air it is zero (weightless). Teleports (respawn, drop zones, `place()`) reset everything.

| Spring | Driven by | Shows as |
|---|---|---|
| `absorb` (m) | load = \|f\| / g − 1 on the snow (a carve's extra g too), kicks on landing (`landKick`), the pop (`popKick`) and bumps | hips drop and go back, knees bend, torso hinges forward; the head stays level (it takes the trunk pitch back out) |
| `fore` (m) | sudden change of the longitudinal force (high-passed over ~0.9 s) | braking throws the upper body forward, a push leaves it behind |
| `arm` (x, y, z) | felt force against 1 g vertically (weightless → hands lift), its change sideways / fore-aft | hands lag the body, swing out in turns, press down on landings |

Reactions (from game events):

| Event | Reaction |
|---|---|
| `nearMiss` (a tree within ~1 m) | flinch: lean and look away, the forearm on that side comes up to guard the face |
| `bump` (glancing a tree) | a jolt through the legs and arms |
| `jumped` | the legs extend at the pop |
| `landed` | balance reach forward; above `dabImpact` (11 m/s) a hand dabs the snow on the low side |
| in the air, body pitching without a trick | arms windmill (forward if the nose is dropping) |
| stumbling | irregular arm flail (sums of incommensurate sines, never a visible loop) |
| standing still | breathing that is deeper and quicker after a hard run (`exertion`), hands resting on the pole grips, poles planted ahead; every 5–9 s a fidget (settle the goggles, look back up the hill) |

Other posture details that live in `rider.js` / `config.js` (`ANIM`): the crouch comes in with speed
(`restCrouch` standing still), ski hips sit over the boots (`skiHipsFwd`), skiers sit back a little in deep
powder (`powderBack`), the head pitches down to spot the landing in the last ~0.8 s of a jump
(`spotLanding`), chatter buzzes the skis / board and legs while the hips only get a quarter of it, and the
old whole-body squash & stretch is gone (the squat and the landing are knee and hip flexion now).
Loose clothes ripple in the wind with speed (`uFlutter` in `character/materials.js`).

All tunables are in `DYN` at the top of `dynamics.js`.

## Crash ragdoll (`ragdoll.js`)

On `player.crash(kind)` the rider hands the body to a ragdoll until the respawn:

- **18 particles** (pelvis, chest, neck, head, hips, knees, ankles, toes, shoulders, elbows, hands) seeded
  from the last two animated frames (`rag.track()` runs every frame), so the fall starts from exactly what
  the rider was doing at exactly that speed.
- **Constraints:** rigid bones, a rigid pelvis and rib cage, a spine and neck that bend and twist within a
  range, hips that fold only to the chest, elbows that fold to ~30°; knees hinge forward and elbows back
  (a joint that flips through its limb's line is mirrored back).
- **Snow:** Coulomb friction (`MU_BODY` 0.42, the body slides 10–20 m at speed), a small bounce. **Trees and
  rocks** are solid (scatter obstacles), so a tree hit folds the body around the trunk.
- **The fall:** for obstacle hits the body carries on into the trunk (the player's velocity was already
  bounced off it); other crashes catch the feet and throw the upper body on over them (back for a
  backward `pitch` crash), with a little twist. For the first 0.55 s the hands brace toward the snow.
- **Yard sale:** skis eject from the bindings and slide / cartwheel on their own (four-particle rigid bodies,
  `MU_GEAR`), poles leave the hands. A snowboard stays strapped to both feet.
- While crashed the **player follows the body** (position and velocity), so the camera, audio and spray
  stay with it. `rider.ragdollFrame()` poses the bones from the particles (pelvis and rib-cage frames,
  spine slerped between them, limbs aimed joint to joint).

## Pose sheet

```bash
node web/scripts/rider-poses.mjs http://localhost:5173/ <outDir> [ski|snowboard] [scenario,…]
```

Scenarios: `stand cruise carve carveHard edgeChange tuck plow hockey squat air landing flinch dab crash
crashLate`. Each one drives the real game with `player.script`, freezes physics (`player.debugFreeze`) at
the chosen moment and photographs the rider with the inspect camera (`cam.inspect`) from the listed angles.
HUD and snow spray are hidden. Software WebGL is slow (a full sheet takes ~30 min); `GPU=1` on Windows.
Run it against a server whose files you are not editing: a source edit reloads the page mid-run.

## Known limits

- The ragdoll doesn't collide with itself (an arm can pass through the other arm) or with the lift towers.
- No get-up animation: the crash still fades to the respawn after `PHYSICS.tumbleTime`.
- Fidgets only run when standing still for a while (also in the lobby preview).
