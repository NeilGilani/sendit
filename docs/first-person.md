# First person (helmet cam)

Press **C** (or V / the pad's view button) while riding to switch between the chase camera and the helmet
cam. The choice is saved (`settings.view = 'fp' | 'tp'`).

```
http://localhost:5182/?map=valcrest-gully&ride&equip=snowboard     then press C
```

| File | What it does |
|---|---|
| `web/src/fpview.js` | `FPView` (the camera, lens, breath, crash cam) and the first-person arm / pole / shadow helpers. All tunables (`FP*` objects) live at its top. |
| `web/src/camera.js` | `CameraController.firstPerson()` → `FPView.update`; in a crash `FPView.crash`. |
| `web/src/rider.js` | Calls `fpSkiArm` / `fpBoardArm` / `fpHand` / `fpPoleDir` when `rider.fp`; shrinks the head; swaps in the detailed pole. |
| `web/src/gfx/post.js` | Goggle lens in the grade pass (`PostStack.setLens`). |
| `web/src/style.css` | `#goggles`: the goggle frame overlay (`--fp-rush`, `--fp-lens`). |
| `web/src/main.js` | Sets `rider.fp`, the `body.fp` class, feeds `cam.fpView.lens` to the post stack, earlier wind streaks. |
| `web/scripts/fpshots.mjs`, `fpscenarios.mjs`, `fpprobe.mjs` | Scripted screenshot runs (see Testing). |

## How it works

**The view.** The eye sits in front of the head bone along the view (`FP.eyeUp`, `eyeFwd`; a snowboard uses
`eyeFwdBoard` because the view runs past the front shoulder), so crouch, carve lean, chatter, landing
squash and every trick move it. On the snow it looks down the direction of travel, into the turn, rolls with
a share of the carve lean and pitches with the slope, speed and tuck. In the air it turns **with the body**:
the body's rotation since take-off (`player.renderOrient`, which carries spins in its yaw and flips / corks
about the gear's axis) is applied to the look captured at the lip, with the head leading the rotation a
little (`leadTime`, `maxLead`), and a straight air tilts toward the landing. Landings blend back to the
ground look (`landBlend`) with a damped compression dip. The eye never ends up inside a shoulder: it rises
along the body's up axis until it clears both shoulder joints (`shoulderClear`). The head (and helmet) shrink
to `headScale` so the eye is always outside them; shadow-only stand-ins keep the rider's shadow whole.

**Comfort.** `settings.fpStable` (Settings → *Steady helmet cam (flips)*) keeps the spin (the heading
turned since take-off) but only `stableShare` of flip / cork pitch and roll, continuously: the kept tilt is
2 · `stableShare` · sin(flip / 2) rad, so it peaks at 34° upside down and is level again as the body comes round
(a flip measured 45 °/s mean view rotation steadied vs 140 °/s without). Screen shake follows the *Screen shake & punch* slider like
the chase camera (`settings.juiceShake`). The goggle frame closes in and darkens a little with the rotation
rate and at top speed (`--fp-rush`).

**Lens.** `CAMERA.fpFov` (vertical, deg) + `fpFovBonus` at top speed + `fpSpinFov` while rotating fast,
in `config.js` (the only source for these). Snaps in on hard stops / crashes. Near plane `FP.near`.

**Arms.** Gloves are placed by IK toward targets relative to the eye and turned into armature space through
the helmet cam's own orientation (last frame's camera relative to last frame's armature; the relative turn
changes slowly, even mid-flip, so the lag never shows). So the gloves stay framed whatever the skis or
board are doing under you (hockey stops, counter-rotation, switch, spins).

- Skis (`FP_ARMS`, `fpSkiArm`): gloves in the lower corners, the inside hand leading the turn, a reach and
  drop on each pole plant, a double-pole push cycle, together in front of the chin in a tuck, wider for
  balance in stops / ploughs, parting when you look down so the ski tips show. In the air they stay framed
  (wider and higher, in toward the shins in a flip tuck, in / out with a spin wrap); the grabbing hand
  reaches for real.
- Snowboard (`FP_BOARD`, `fpBoardArm`): the camera looks down the nose, sideways to the chest. Each glove goes
  to its own shoulder's side of the view (shoulder order decides, so goofy / switch / head turns all work):
  with the shoulders opened a little further in first person (`twist`), the nose-side shoulder sits ahead on
  the heel side and drops (`frontDrop`), the rear one behind on the toe side (extra reach `rearProtract`).
  Toe-side carves drop the toe-side glove toward the snow, heel side reaches both forward; airs go wider,
  flip tucks pull in; grabs and deep-carve hand drags reach for real. The board nose shows looking down and
  on take-offs.

**Poles** (`FP_POLE`, `fpPoleGeometry`, `fpPoleDir`). In the helmet cam the poles swap to a detailed model
(moulded grip with knob and finger ridges, wrist strap, tapered shaft, spoked basket, steel tip) at a real
length (`length`, 1.24 m fist to tip), held in the fist. Gliding they angle out past the gloves; on each edge
change the inside pole swings forward and the basket touches down (a small snow puff at the tip, `polePlant`
event → `fx.js`, in both views); forward then back through a push; under the arms in a tuck; out and down in
the air. The tip is always kept on or above the snow.

**Goggle lens** (`FP_LENS`; drawn in `GradeEffect`, `gfx/post.js`):

- *Tint*: the colour of the goggles you are wearing (`rider.look.lens` uniforms: mostly the dark base tint
  behind the mirror), desaturated (`sat`) and mixed in at `tint`, brightness kept. Rental smoke reads
  neutral-cool, Amber warm, Acid Mint green-cyan, Sapphire blue, Rose pink, and so on for every reward lens.
- *Edge*: a slight warp and colour fringe toward the frame.
- *Fog*: creeps in from the frame when you stand still after riding hard, clears once you move.
- *Snow flecks*: a powder face shot (edge change in deep snow at speed), a deep powder landing or a crash
  throws snow on the lens; flecks refract the view and melt / blow off one by one (faster at speed). Riding
  fast in the light snowfall setting collects a few.
- `settings.fpLens` (Settings → *Goggle lens effects*, 0..1) scales all of it; 0 = a clear lens. The frame
  overlay stays (lighter) for motion comfort.

**Presence details.** Breath puffs drift out below the view on each exhale (`FP_BREATH`), quicker after
effort, only when slow. A stiff spring kicked by how fast the ground normal changes adds terrain chatter on
top of the speed buzz (`FP_BOB`). Corner wind streaks start a little earlier in the helmet cam
(`HUD.fpWindEarly`, fainter). Gloves and sleeves are the outfit's own (the real rig is rendered).

**Crashes** (`FP_CRASH`). The body shows again and tumbles (the crash roll, `rider.js`); the helmet cam is knocked
out of the head and settles a few metres back up the track (`back`, `up`, over `settle` s), watching the body slide to a stop.
First person resumes on the respawn, with snow on the lens.

## Tunables (top of `fpview.js`)

| Object | Keys |
|---|---|
| `FP` | eye offsets, `near`, `headScale`, `shoulderClear`, ground look (`pitch`, `slopePitch`, `speedPitch`, `tuckPitch`, `lookIntoTurn`, `carveRoll`, rates), air (`leadTime`, `maxLead`, `landBlend`, `stableShare`), landing dip, look limits |
| `CAMERA` (config.js) | `fpFov`, `fpFovBonus`, `fpSpinFov` |
| `FP_ARMS` | ski glove targets (`ski`, `skiSpeed`, `skiTuck`, `air`, `flipTuck`, `grind`), plant reach / drop, `minEye`, protraction, glove scale, elbow pole |
| `FP_BOARD` | board glove targets (`ride`, `speed`, `crouch`, `toe`, `heel`, `air`, `spinIn`, `flipTuck`, `grind`), `rearReach`, `rearProtract`, `frontDrop`, `twist`, `minEye` |
| `FP_POLE` | `length`, shaft directions (`glide`, `plant`, `air`, `tuck`), colours |
| `FP_LENS` | `tint`, `sat`, `fringe`, snow amounts / clearing, fog rise / clear / cap |
| `FP_BREATH`, `FP_BOB`, `FP_CRASH` | as above |

## Settings

| Key | UI | Default |
|---|---|---|
| `view` | C / V while riding | `'tp'` |
| `fpStable` | Steady helmet cam (flips) | `false` |
| `fpLens` | Goggle lens effects (slider) | `1` |
| `juiceShake` | Screen shake & punch (shared) | 1 (0.4 with reduced motion) |

## Testing

```bash
# scenario screenshots (Mac: GPU=1 uses ANGLE Metal; Windows: D3D11). Shots go outside the repo.
GPU=1 node web/scripts/fpshots.mjs http://localhost:5182/ /tmp/fp ski glide,carveR,slalom,stop,tuck,push,backflip,spin360,grab,crash
GPU=1 node web/scripts/fpshots.mjs http://localhost:5182/ /tmp/fp snowboard glide,carveL,carveR,tuck,lookdown,straight,frontflip,cork720,grab,crash
# evaluate snippets in a running FP game (each snippet's result printed; SHOT=prefix screenshots after each)
GPU=1 SHOT=/tmp/fp/p node web/scripts/fpprobe.mjs http://localhost:5182/ snippets.js ski
```

Debug: `window.__cam.fpView` is the live `FPView` (`.snow`, `.fog`, `.lens`, `.breathT`);
`window.__cam.fpLook = { yaw, pitch }` overrides the look (rad / deg).

Performance: the lens adds up to four texture reads per pixel only near the frame edges and under flecks,
inside the existing grade pass; it is skipped entirely in the chase camera. A quality-1 run on the MacBook
Air (Valcrest, 1600×900) measured chase ≈ 26 ms, helmet cam without lens ≈ 25 ms, with lens + snow
≈ 27 ms GPU (this machine is noisy and shared; the differences are within the noise).

## Known limits

- On a snowboard the rear glove is near the edge of reach; in some poses (very low crouch, riding switch
  slowly) it slips just below the frame.
- Looking steeply down on a board you see your own shoulder and jacket (deliberate: it is your body), and in
  a hockey stop on skis the sleeves are large in the lower corners.
- Pole shafts gliding mostly run down out of the frame (as in real helmet-cam footage); they show on plants,
  stops, pushes and in the air.
- Breath is the same on every map and faint against bright snow; there is no per-map temperature.
- The hand-arm targets use last frame's camera (one frame of lag), invisible at normal frame rates.
- Mouse / stick look moves the gloves with the view (viewmodel-style) instead of leaving them in place.
