# Game feel and progression

In-ride juice runs on every map, and session-to-session progression sits on top of it. The research behind it is in [game-feel-research.md](game-feel-research.md).

| Module | What it does |
|---|---|
| `web/src/juice/combo.js` | One combo chain on every map. |
| `web/src/juice/hud.js` | Trick announcer, landing grades, combo panel, live air read-out, call-outs, banners and toasts. |
| `web/src/juice/impact.js` | Hit-stop and micro slow-mo (`TimeWarp`), camera punches and rumble. |
| `web/src/juice/speedfx.js` | Speed-rush post pass: edge zoom blur, chromatic fringe and rush lines. |
| `web/src/juice/music.js` | Music energy and drops. |
| `web/src/juice/splits.js` | Challenge split deltas against the best run. |
| `web/src/juice/trail.js` | The hot-combo neon trail. |
| `web/src/juice/settings.js` | Shake, hit-stop and speed-rush rows in the settings grid. |
| `web/src/juice/index.js` | `installJuice()`, which main.js calls once. |
| `web/src/progression/core.js` | Pure logic: XP curve, levels, ranks, dailies, the weekly, the daily bonus, achievements, the trick book and personal bests. |
| `web/src/progression/index.js` | Public API and the ride tracker. Storage key: `sendit.progression`. |
| `web/src/progression/ui.js` | Level-up celebration, toasts, the in-ride XP bar and the ride recap card. |
| `web/src/progression/lobby.js` | The lobby's **Progress** tab, the TODAY strip, and the level badge on the profile chip. |
| `web/src/thrill/` | Instant restart and retry, spots and gaps, adrenaline cues, instant replay and versus links (§ 7–8). |

Shared files have small, additive edits only:

- `main.js`: install, the physics clock × `juice.timeScale(dt)`, the activity timer × `warp.k`, and the per-frame update.
- `camera.js`: `kick()`, springs on the chase camera, the `juiceFov` build-up, and shake scaled by the setting.
- `ui.js`: the old PERFECT, CLOSE SHAVE and challenge-combo pops give way to the juice HUD. It also adds the pause-screen progression line and the XP row on the results screen.
- `scripts/unittest.mjs`: one line, which runs `scripts/progression-unit.mjs` (31 tests in all).

## 1. Combo chain (every map)

There is one live chain, and the HUD shows it at the top centre, whichever system owns it:

| Where | Source | Rules |
|---|---|---|
| Flow maps (Ravenspire, Voltage Park) | physics/flow.js line chain | flow.js rules: ×0.25 per different move up to ×5, 3.2 to 3.6 s window. The flow HUD's own chain, grade and bank banner are hidden; ours replaces them. |
| Challenge mode (on every map, flow maps included, since the run is scored on it) | activities.js style combo | activities.js rules, with a 2.6 s window. A lone move is not a combo; a bank pays `banked − pts`. |
| Everywhere else (Valcrest, Blackspruce in Zen) | juice/combo.js | See below. |

Rules for the juice/combo.js chain:

- Every scored move adds its points to the chain: tricks, rails, close shaves, drops and the Blackspruce tree slalom. Distance markers (`250 m`) are not moves.
- The multiplier grows by `step` for each *different* move. The k-th repeat of a move counts `repeatCredit` / k (repeats wear out, as in THPS), so twenty close shaves add far less than twenty different moves. The move key strips Perfect, Sketchy, numbers and lengths.
- Air and rails keep the chain alive. (For the flow source only air does, as in flow.js. The Challenge combo keeps its own clock.) After `window` seconds on the snow the chain banks: `addScore("Combo ×m", pts × (m − 1))`.
- A crash loses the chain, and a "COMBO LOST −pts" banner shakes on screen.
- While the chain rides on an air or a rail at ×1.5 or more, the panel turns pink and shows **LAND IT**.

Tunables (`JUICE_COMBO`):

| Key | Default | Meaning |
|---|---|---|
| `window` | 3.4 s | Time on the snow without a new move before the chain banks. |
| `step` | 0.5 | Multiplier added per different move. |
| `max` | 6 | Multiplier cap. |
| `repeatCredit` | 0.35 | How much the first repeat of a move counts; the k-th counts this / k. |
| `minBankMult` | 1.5 | Below this, the chain ends without a bonus line. |

**FEVER** (Forza's skill songs, `JUICE_COMBO.fever`). On own-chain maps (Valcrest, Blackspruce, Zen), a 12 s hot window opens 45–90 s into a ride, then every 75–130 s, counting only while actually moving.

During FEVER:

- Each move adds ×1.0 instead of ×0.5, and the cap is ×8. What was built stays when it ends.
- A "FEVER! COMBOS ×2" call-out shows (under the rider, clear of the live combo panel), the screen edge pulses orange, and the combo panel counts down.
- A music drop plays, rush lines appear, the lens kicks, the controller rumbles, and the hot trail goes gold.

Flow maps have SEND IT instead, and Challenge runs stay fair, so neither gets FEVER. Event: `juiceFever {on, t}`.

Bus events:

- `juiceCombo {mult, pts, n, items, left, source} | null`
- `juiceComboBanked {bonus, mult, pts, source}`
- `juiceComboLost {pts, mult, source}`

## 2. Trick announcer and landing grades (juice/hud.js)

The HUD regions, from top to bottom:

- **Combo panel.** It appears from ×1.5 and shows ×mult (cyan, then gold from ×2.5, then blazing orange from ×4), the points, the last three moves and a timer bar. The multiplier bumps on every increase.
- **At risk.** While a chain of ×3 or more rides on an air or a rail, the screen edge pulses pink at 0.55 s to show the stakes. It is off with reduced motion.
- **Announcer, at 30 % of the height**, under the combo panel and above the landing the chase camera frames near the middle of the screen (it was at 37 %, on top of it). A grade badge sits over the trick name in big slanted type, with +points and extras (drop height, SWITCH) below. It slams in at 1.9× scale with blur and settles in about 0.2 s. With the combo panel up it sits under it (`max(30%, 290px)`: on a 720p screen 30 % overlapped the panel), and names over 18 characters shrink to fit the width (`--an-fit`).
- **Combo tiers.** Under the multiplier a tier word pops in as each tier is reached: NICE from ×2, SICK ×3, INSANE ×4, UNREAL ×5, GODLIKE ×6 (`TIERS`).
- **Live air, at 24 % of the height, gone for the last 0.5 s before touchdown** (`liveAirClear`) so the landing is clear to spot (it was at 33 %, over the landing); with the combo panel up, `max(24%, 232px)` keeps it under the panel. Air and announcer never show together. A stumble's announcement carries why on its sub-line ("OVER-ROTATED 31°", "40° SIDEWAYS", "HARD LANDING": player.js `landingWhy`); a landing crash shows it as a call-out. A straight air with no spin, flip or grab shows its hang time ticking ("1.4s") from 1 s, and the height above the snow once it passes 4 m. The number heats up with the rotation: white, then cyan from 360, gold from 720, orange from 1080. Once the air passes 0.45 s, the rotation shows in 180° steps and bumps on each new 180. It also shows flips (`FLIP`, `2× FLIP`) and the grab being held.
- **Floating score pops.** Minor scores under 100 points rise off the rider's screen position as "+15 CLOSE SHAVE" or "+20 GATE", with at most 4 alive, one per 0.4 s, and no repeat of the same move within 1 s. They skip tricks (the announcer has those), distance markers and combo bonuses.
- **Call-outs, below centre.** CLOSE SHAVE, then ×n for a streak within 2.6 s (gold from ×3). RAZOR CLOSE! appears under 0.8 m. RAIL LOST and line-goal steps also show here.
- **Streak call-outs.** STOMP STREAK ×n appears from 3 stomped or perfect landings in a row. n CLEAN IN A ROW appears every 5 named tricks landed without a crash.
- **Banners.** `COMBO ×3 +1,240` (MONSTER COMBO from ×4), with a gold edge glow from ×2.5. Line goals on flow maps also show here.
- **Rolling score, top right.** It counts up toward the ride's score and bumps gold when a chunk of 100 or more lands. The snowflake counter moves under it.
- **Toasts, top left.** Achievements, finished dailies, the daily halfway mark, "one to go!" for counted dailies, and personal bests. They sit on the left because the reward-cases notifications stack at the top right.
- **Short screens** (under 500 px tall, e.g. a phone in landscape): the combo panel moves to the right under the score and the announcer, live air, call-outs, banner, toasts, speed, hint and notes shrink, so nothing overlaps at 844×390.
- **Flash.** A white flash on STOMPED (0.26) and PERFECT (0.18) landings, with rumble.

Grades (`gradeOf(e)`) work on every map:

| Grade | When |
|---|---|
| SKETCHY | The landing was not clean. |
| STOMPED | The flow map graded it stomped, or it was perfect with impact ≤ `stompedImpact` × `PHYSICS.hardLanding`. |
| PERFECT | Perfect: deviation under 8° yaw and 10° pitch, with more than 0.6 s of air. |
| CLEAN | Anything else. |

Plain hops with no trick under 0.9 s of air get no announcement, so the HUD stays readable.

Tunables (`JUICE_HUD`):

| Key | Default |
|---|---|
| `minAirToAnnounce` | 0.5 s |
| `announceHold` | 1.35 s |
| `liveAirFrom` | 0.45 s |
| `nearStreakWindow` | 2.6 s |
| `stompedImpact` | 0.55 |

## 3. Impact (juice/impact.js, camera.js)

**Hit-stop.** `TimeWarp` multiplies the physics clock in main.js; the activity timer slows with it, so a freeze never costs challenge time. A warp freezes the simulation for `freeze` seconds, then eases from `slow` back to 1× over `recover` seconds. The camera, HUD, particles and audio keep running in real time.

| Preset | freeze | slow | recover | When |
|---|---|---|---|---|
| `huge` | 85 ms | 0.3× | 0.38 s | A clean landing of ≥ 720, any flip, cork or rodeo, or ≥ 2 s of air |
| `stomp` | 50 ms | 0.45× | 0.22 s | A stomped or perfect landing of a trick or > 1 s of air |
| `crash` | 70 ms | 0.5× | 0.25 s | A crash |
| `bank` | 0 | 0.6× | 0.3 s | A combo banked at ×3 or more |
| `razor` | 0 | 0.55× | 0.28 s | A close shave under 0.8 m (`razorDist`) |

`cooldown` is 0.9 s; within it, only a stronger freeze replaces the current one.

**Camera punches.** `CameraController.kick({fov, dip, roll})` adds to three springs (ω 15 rad/s, ζ 0.55, so they overshoot a little and settle in about 0.4 s). They act on the chase camera only.

| Event | Punch |
|---|---|
| Landing | FOV −0.5° per m/s of impact (up to −6°), and a dip of 0.035 m per m/s (up to 0.45 m). |
| Stomp, or a huge clean landing | The lens punches open +4.5° just after the freeze, for a speed rush out of the landing. |
| Close shave | FOV +3.2° and a roll of 2.2° away from the obstacle. |
| Combo bank | FOV +3° × mult/2. |
| Popped take-off | FOV +1.6°. |
| Challenge GO! | FOV +5°, plus a burst of rush lines. |

**Measured in the real game.** `node web/scripts/juice-impactcheck.mjs <url> 2` rides a scripted Safety grab off Valcrest kicker 2 (1.8 s air, PERFECT, impact about 11 m/s) and logs each frame after touchdown:

- The physics clock: one frozen frame (k 0, the rider moves 0 m), then 0.48×, 0.81×, and 1× after about 200 ms.
- The landing punch: the lens snaps −2.7° and the camera dips 0.19 m. Both settle within about 0.4 s with a small overshoot.

At least one frame is always frozen, so a long frame on a busy GPU can't swallow the freeze.

**Combo build-up.** While a chain is live, the lens opens by +0.75° per ×1 above ×1, up to +3°. It is eased (rate 1.5/s), scaled by the shake setting, and set through `cam.juiceFov`.

These are separate from the existing trauma shake, which is unchanged.

**Combo ticks.** Each multiplier step plays `combo_tick` a little higher (rate 0.85 + 0.07 × mult). It only ticks for moves under 60 points, because audio.js already ticks the bigger ones.

**Rumble.** Added on top of main.js's own: a stomp (0.35/0.8, 120 ms), a huge landing (0.8/1, 260 ms), a combo bank (0.25/0.6, 140 ms), a level-up (0.6/1, 420 ms), a rail lock-in (0.15/0.45, 90 ms), each rail kink (0.3/0.5, 70 ms), and achievements or finished dailies (0.3/0.6, 140 ms).

**Settings.** `juice/settings.js` adds three rows to the shared settings grid (`#settings .grid`), which the lobby's Settings tab and the pause menu both show:

- **Screen shake & punch** (`settings.juiceShake`, 0 to 1, default 1) scales every punch and the existing trauma shake.
- **Hit-stop & slow motion** (`settings.juiceHitstop`) turns the time warp off when unchecked.
- **Speed rush effect** (`settings.juiceSpeedFx`) turns the post pass off when unchecked.

With the system's *reduced motion* preference on and no shake setting saved, shake and punches default to 0.4 and the white landing flashes are off.

## 3a. Hot trail (juice/trail.js)

This is the SSX "on fire" look. A ribbon streams from the rider's feet while the combo is ×2 or more (intensity 0.6, rising to 1 at ×4) or SEND IT is on. It is coloured by tier: teal, then blue, gold, orange and pink (gold in SEND IT).

It is one alpha-blended draw call: additive blending vanished on white snow, and bright HDR colours tone-map to white. It has 48 points 0.45 m apart and is 0.55 m wide, tapering and fading. It is off on the low quality tier, in the helmet cam and when the speed rush setting is off, and it resets on a respawn. Tunables: `JUICE_TRAIL`.

## 3b. Challenge splits (juice/splits.js)

These are Trackmania-style split times. At every Challenge gate (passed or missed), the run's clock including penalties is compared with the same gate on your best run. A delta flashes beside the timer: −0.42 in cyan when ahead, +0.31 in pink when behind, labelled GATE n. A FINISH delta shows at the end.

The best run's splits are saved only when the activity reports a new best time, under `sendit.splits.<courseKey>` as `{ s: [gate times], t: finish time }`. A first run shows nothing to compare against.

Events: `juiceSplit {i, time, best, delta}` and `juiceSplitFinal {time, best, delta, isBest}`.

## 3c. Chase camera (camera.js)

The chase camera follows the path, not the body. Its anchor is the rider's interpolated position (`renderPos`,
the feet on the flight line). Flips turn the body about its centre of mass in `rider.js`, and spins turn it about
the vertical, so neither moves the camera. `lookAt` uses the world up, so the horizon stays level in the air. The
only roll is the carve tilt (on the snow only), the juice punches and the shake. The heading spins with the rider,
so in the air the yaw follows the flight direction (held when there is almost no horizontal speed). First person
(`fpview.js`), the lift ride, the crash follow and the menu flyover are unchanged.

**Air framing.** Every air frame, `predictLanding()` marches the flight against the real terrain (gravity ×
`airGravity`, air drag; one `getHeight` per 1/30 s, ≤ 4 s) to get the touchdown time `tl` and point. From that:

| Phase | What the camera does |
|---|---|
| Take-off | Nothing snaps. Every change below goes through critically damped springs (`spring()`), so they start and stop with zero velocity. The old exponential chase jumped to full speed in one frame. |
| In the air (`airK`, from the predicted total air: 0 below `airFrameFrom` s, 1 from `airFrameFull` s, so hops change nothing) | `airRise` m higher, `airPull` m further back, `airFov`° wider, and a gentler yaw chase (`airYawRate`). |
| Big air (`airSideFrom`–`airSideFull` s of total air) | It swings `airSideDeg` (50°, was 70°) to a three-quarter angle that shows a flip and a spin together. The side is picked from the spin direction (as before). |
| Landing approach (`preK`, 0 until `landLead` 0.9 s before touchdown, 1 at `landSettle` 0.25 s) | The swing comes most of the way back behind (`airSideLand` of it is left). The arm rises to `landPitch`, steeper by the landing's own slope (as on the snow), and the aim moves `landLook` of the way from the rider toward the landing point. The rider is held within `landKeep` of the half-frame. The player sees the landing slope beside or above the rider, and their angle to it, in time to adjust. |
| Touchdown and after | The springs ease back over ~0.5 s (`airOut`, `sideReturn`). The ground yaw rate blends back in through `airK`. The juice landing punch (dip and lens) still plays on top. |

In the air the arm tilts up over terrain behind the rider (`armLift`), up to `liftMax` m, keeping `armClear` m clear.
It rises fast and settles slowly. Before, the arm collapsed toward the rider in one frame when a steep landing
rose into it, which pitched the view ~5° per frame just before touchdown. On the snow, and beyond `liftMax`, the
arm shortens as before. Maps with `airLook` (Ravenspire, Kitsune, Fjordline, Dragonback, Voltage) still look
down toward the drop in big air. That fades out as the landing approach takes over.

**Respawns, crashes, lifts.** A `respawned` event (crash respawn, drop zone, reset to top) snaps the chase camera to
the rider (gliding after a 10–35 m teleport flew it through the body as the fade cleared). In a crash the aim eases
85 % of the way to the tumbling body (`crashK`), so a body sliding fast down a steep face stays in frame. On a lift
the follow smoothing is 0.12 s, the arm 6.5 m, 63° off the cable line (`LIFT_SMOOTH`, `LIFT_SIDE`): straight behind,
the haul rope and the chair back hid the rider. Snow spray in front of the rider's body thins out (gfx/spray.js
`uFocus`, fx.js `FOCUS_THIN`), so a landing powder cloud no longer hides the rider in the touchdown frames.

**Turns (HANDOFF #4).** A plain exponential yaw chase trails a steady carve by turn rate / `yawRate`, about 14–20°
in a hard turn. The camera now leads the travel direction by `turnLead` s of the turn rate, low-passed at
`turnRateSmooth` 1/s so edge changes don't twitch it. It also chases `yawRateTurn` harder while turning. A hard
carve now trails ~5–6° and a slalom ~4°.

**Tunables** (`CAMERA` in config.js; per-map `course.camera` can override any of them):

| Key | Default | Meaning |
|---|---|---|
| `yawRate`, `yawRateTurn` | 3.2, 2 | 1/s yaw chase on the snow, plus this much at a 1 rad/s turn |
| `turnLead`, `turnRateSmooth` | 0.14 s, 6 /s | how far the yaw leads the turn, the turn rate's low-pass |
| `airYawRate` | 1.0 | 1/s yaw chase in big air |
| `airFrameFrom`, `airFrameFull` | 0.5, 1.2 s | predicted total air where the air framing starts / is full |
| `airIn`, `airOut` | 2.5, 2.2 | spring rates into / out of the air framing (ω = 2 × rate) |
| `airPull`, `airRise`, `airFov` | 0.3 m, 0.6 m, 2° | further back, higher, wider in the air |
| `airSideFrom`, `airSideFull` | 0.9, 1.6 s | total air where the side swing starts / is full |
| `airSideDeg`, `airSideDist`, `airSidePitch`, `airSideFov` | 50°, 6.2 m, −6°, 2° | the swing's angle, arm, arm pitch and lens narrowing |
| `sideIn`, `sideReturn` | 2.4, 2.5 | swing spring rates out / back |
| `airSideLand` | 0.4 | share of the swing left at touchdown |
| `landLead`, `landSettle` | 0.9, 0.25 s | landing approach window (before the predicted touchdown) |
| `landPitch`, `landLook`, `landKeep` | −16°, 0.5, 0.72 | arm pitch on the approach (minus 0.75 × landing slope), aim share toward the landing, rider kept within this share of the half-frame |
| `armClear`, `liftMax` | 0.9 m, 4 m | the arm's clearance over terrain in the air, and the most it tilts up |
| `airFollowY` | null | vertical follow smoothing in the air (null = `followSmooth` × 1.2, was × 1.8) |

The shake slider (`settings.juiceShake`), reduced motion and the punches work as before.

**Checking it.** `node web/scripts/camshots.mjs <url> <outDir> [ski|snowboard] [scenario,…|all]` rides the
scenarios in `camscenarios.mjs` in the real game. The scenarios are backflip, frontflip, 360, 720, cork 720,
rodeo 540, misty, a 360 with a backflip ("flatspin": there is no separate flat-spin input), a Voltage Park big-air
720 and double cork 1080, the Ravenspire First Stack cliff (straight and with a 360), a hard carve, a slalom and a
crash. `requestAnimationFrame` gets virtual time, so the camera sees exact 60 Hz frames however slow the headless
renderer is. The script logs the camera every frame and writes a contact sheet per scenario, with the predicted
landing ringed in red, the pelvis in cyan and the HUD hidden (`HUD=1` keeps it). Its metrics: `rollAir` (horizon
tilt), `wMax` / `accMax` (fastest view turn and its change, i.e. snaps), `riderOut` (share of frames with the
rider near the edge), `landVis06` (share of the last 0.6 s with the landing in frame), `yawErrMean` on the snow
(turn lag) and `clearMin` (terrain clearance).

Before → after (ski; snowboard is the same within a few %):

| | before | after |
|---|---|---|
| landing in frame, last 0.6 s (Valcrest L / Voltage big air / cliff) | 21–32 % / 24–26 % / 6–15 % | 100 % / 100 % / 100 % |
| landing on screen at 0.6 s before touchdown (y, −1 = bottom edge) | −1.06 … −1.46 (off screen) | −0.49 … −0.62 |
| fastest view turn, take-off / touchdown | 300 / 700–840 °/s (one-frame snaps) | ≤ 80 / ≤ 190 °/s (≤ 80 on big air) |
| horizon roll in the air | ≤ 1.7° | ≤ 1.7° (both are the carve tilt easing out) |
| carve / slalom yaw lag (mean) | 14° / 13° | 6° / 4° |
| min terrain clearance, Voltage / Ravenspire | 0.42–0.48 m | 1.8–1.9 m |

## 4. Speed rush (juice/speedfx.js)

This is one `EffectPass`, inserted before SMAA through `composer.addPass(pass, index)`; the gfx internals are not edited. It applies a radial zoom blur and a chromatic fringe that grow toward the screen edges, with the centre (radius 0.22) left clear. Rush lines (thin bright radial streaks) appear on boost moments.

- **Rush.** Driven by speed ratio from 0.82 to 1.0, up to 0.45. The SEND IT state adds +0.12. Blur length is 0.018 and fringe 0.0028 (UV at the edge), kept subtle.
- **Pulses.** `huge` 1, `stomp` 0.75, `bank` 0.55, `flow` 0.8; they decay at 2.4/s.
- **Cost.** The pass is disabled whenever its intensity is about 0. It runs for 20 frames during loading so its shader compiles behind the loading screen.
- **Quality.** Low = off, medium = 4 blur taps, high = 8 (`JUICE_SPEEDFX.taps`).
- **Measured cost.** `node web/scripts/juice-perf.mjs <url> 1` runs alternating forced-on and off windows, back to back. At medium, 1600×900, on a shared GPU (00:30 PDT, other sessions running), the median frame was 8.5 ms with the pass on and 8.7 ms off. No difference showed above the noise.

## 5. Music energy (juice/music.js)

Energy is one value from 0 to 1, built from these parts:

| Part | Contribution |
|---|---|
| Speed ratio | From 0.55 to 1, weighted 0.45. |
| In the air | +0.15. |
| Live combo | (mult − 1) × 0.12, up to 0.45. |
| SEND IT state | +0.35. |
| Bursts | Big moments add a burst that decays at 0.35/s. |

The value rises at 1.6/s and falls at 0.35/s, and a crash halves it.

It reaches audio.js only through public surface (audio.js internals are not edited):

1. If audio.js has the optional hooks, the module calls `sound.setMusicEnergy(level)` and `sound.musicDrop(kind, strength)`.
2. Otherwise it changes the existing track choice. `sound.flowOn = true` lifts the upbeat track above energy 0.62, holds it for at least 8 s, and releases it below 0.4. The real flow state always wins.
3. Drops play the existing one-shots as a riser and hit: `whoosh_slow`, then `boost` 90 ms later, with a 2.5 s cooldown.

Drops happen on a huge clean landing, a combo banked at ×3 or more, and a level-up.

Bus events: `musicEnergy {level}` at 5 Hz, and `musicDrop {kind, strength}`.

## 6. Progression (progression/)

### XP and levels

- **Curve.** XP from level L to L+1 = `round(260 × L^1.45)`, capped at level 99 (`XP_CURVE`). Level 2 takes 260 XP, level 5 takes 4,195 XP in total, and level 10 takes about 21k.
- **XP from riding (`XP_SOURCES`):**
  - 0.1 XP per style point, live during the ride.
  - 60 XP per km.
  - +40 XP for a ride of 300 m or more.
- **XP from goals:**
  - Each daily pays 150 to 450 XP, and a clean sweep of all three pays +300.
  - Achievements pay 100 to 800 XP.
- **Daily 2× bonus.** The first 500 XP earned while riding each day count double (`XP_SOURCES.dailyBonus`). The TODAY strip shows it as "2× XP on your next N XP", and the in-ride XP label reads "LV n · 2× XP". It never expires during the day and is never taken away. API: `progression.dailyBonusLeft()`.
- **Close to a level.** When the ride ends within 30 % of the next level, the recap's last line becomes "ONLY N XP TO LEVEL L · ONE MORE RUN!".
- **Pacing.** A first ride usually reaches level 3, about four rides reach level 5, and the curve slows after that.
- **Pause screen.** It adds the level, the rank, XP to the next level, and the dailies still open.
- **Challenge results card.** The medal slams in (a gold one glows), the title pops, rows cascade in and NEW! records pulse. Finishing with a medal flashes the screen and rumbles. Level-ups wait until the card closes.
- **Challenge results.** An extra row reads "XP this ride +N · level L", with ▲ when the ride levelled up.
- **First rides.** One hint 15 s into each of the first two rides explains that tricks, combos, close shaves and dailies earn XP.
- **Ranks (`RANKS`).** Rookie from level 1, Shredder from 5, Ripper from 10, Pro from 20, Legend from 35, Mountain God from 60. Each rank has a colour, used for the badge, the celebration and the Progress tab.
- **Rank emblems.** `rankEmblem(level)` draws one chevron per rank tier (up to four), with a star from Legend. They appear on the chip badge and the Progress card, where the next rank is shown too ("Ripper at level 10", `nextRank()`).
- **Ride button.** It glows gold while today's 2× XP is unused.
- **Level-up card** at 32 % of the height (was 42 %, over the landing); it waits for the trick announcement and fades back as soon as the rider takes off again.
- **Stacked level-ups.** Several levels gained at once (a big XP jump) play as one celebration of the highest level ("LEVEL UP · +4").
- **Level-up.** If a trick is announced while it plays, it fades back to let the trick read. It waits (up to 4 s) while the rider is in the air or a trick is being announced, then plays a full-screen celebration (rings, the level number slamming in, the rank and XP to the next level) plays over the ride and the lobby. Level-ups queue, rumble, give a music drop and flash.
- **XP bar.** A small bar under the speedometer fills in ride and fades out after 2.5 s.
- **Ride recap.** Back in the lobby after a ride, a card slides in on the right. It counts up "+1,240 XP", animates the level bar from where the ride started, and lists the ride's best trick, plus the dailies, achievements and personal bests from that ride, and the distance and score. It ends with "ONE MORE RUN? PRESS ENTER", hides after 9 s or on click, and comes from `progressRideSummary`.

### Daily challenges

Three challenges are chosen per local day from `CHALLENGE_POOL`, each from a different category. The choice is seeded by the date, so it stays the same all day and changes at midnight. The day's list is stored in `state.daily.list`.

There is one free **Swap** per day for an unfinished challenge. A swap replaces only that slot (`swapDaily()`), with a category none of the three currently show. Progress resets at midnight; nothing earned is ever taken away.

| Category | Examples |
|---|---|
| Spins | Land a 540, 720 or 900 |
| Flips | Land 1, 3 or 5 flips |
| Close shaves | 20, 35 or 50 close shaves, sometimes "…in Blackspruce" |
| Distance | Ride 3, 5 or 8 km |
| Air | 30, 45 or 60 s of air |
| Combos | Bank a ×2.5, ×3 or ×4 combo |
| Stomps | Stomp 3, 5 or 8 landings |
| Speed | Hit 55, 70 or 85 km/h (the higher ones need Ravenspire or Blackspruce) |
| Score | Score 3,000, 6,000 or 10,000 in one ride |
| Tricks | Land 10, 20 or 30 tricks |
| Rails | Grind 40, 80 or 150 m |
| Clean runs | Finish 1, 2 or 3 runs without crashing |
| Medals | Earn a bronze, silver or gold medal |

### Weekly challenge

There is one bigger goal per local week, running Monday to Sunday (`WEEKLY_POOL`, `weekKey()`). It accumulates across every ride that week and pays about 1,500 XP once, with a gold toast and the medal sound.

Pool:

- Score 40,000.
- Land 60 tricks.
- Ride 25 km.
- 200 close shaves.
- Bank ten ×3 combos.
- Stomp 30 landings.

The Progress tab shows it under the dailies. API: `progression.getWeekly()`. Event: `weeklyDone {challenge}`.

### Achievements

There are 29 (`ACHIEVEMENTS`), including:

- First ride, first trick, 360, 540, 720 and 1080, and a flip.
- 1 and 50 stomps, 100 close shaves.
- ×3 and ×5 combos, 10k in one ride.
- 100 km/h, 10 km and 100 km ridden, 60 s of air in one ride, 100 m of rails.
- All four maps, a clean sweep of the dailies, a gold medal, and level 10.

Each one unlocks once, with a toast and XP.

### Clean runs (mastery)

A run is a ride start, a reset to the top or a Challenge (re)start, through to the finish line (Zen `runComplete`, Challenge `runFinished`). A run with no crash counts as clean: a "CLEAN RUN · NO CRASHES" call-out shows, there is a daily type for it, and **Clean Sheet** (1) and **Untouchable** (10) are achievements. Event: `cleanRun {runs}`.

### Map mastery

Each map has three stars: ridden, a clean run on it, and a ×4 combo banked on it. They are listed in the Progress tab for every map in the registry, so maps added later appear automatically. **Mountain Master** is the achievement for three stars on any map. API: `progression.getMapStars(mapId)` returns `{ stars: [ridden, clean, combo], count }`.

### Wipeouts (Hall of Meat lite)

A crash pays a little XP once the rider is back up: 5 + 1.5 per m of tumble + 0.5 per m/s of speed, up to 60 (`XP_SOURCES.wipeout`). The tumble is measured from the crash point to the furthest point before the respawn. A "WIPEOUT · 14 M TUMBLE +XP" call-out shows, and the combo chain is still lost, so crashing costs more than it pays but stops feeling like pure loss (Skate's Hall of Meat).

- Achievements: **Hall of Meat** (10 wipeouts) and **Yard Sale** (a 15 m tumble).
- Events: `juiceWipeout {kind, tumble, speed}` (juice) and `progressWipeout {tumble, xp}` (progression).

### Trick book

The first clean landing of each trick name pays +40 XP (`XP_SOURCES.newTrick`) and puts a **NEW TRICK +40 XP** ribbon over that trick's announcement. Rail combos count too.

- Names are normalised by `trickKey()`, which strips Perfect, Sketchy and Locked-in and drops anything after a `·` (rail length, extras). So "Perfect Left 540 Mute" equals "Left 540 Mute".
- "Left 540" and "Right 540" are different tricks, which rewards variety (the THPS idea).
- The Progress tab lists the most-landed entries and the count.
- Achievements: **Bag of Tricks** (10 different) and **Trick Encyclopedia** (30).

### Personal bests

Personal bests are kept per map: score, longest air, biggest spin, top speed and best combo. The first time in a ride that an *existing* best is beaten, a toast shows "NEW PERSONAL BEST · Longest air · 2.9 s (was 2.1 s)". A beaten score also gets a "NEW BEST SCORE!" call-out. A first-ever value is stored quietly.

### Public API (`import { progression } from './progression/index.js'`)

```js
progression.getLevel()              // → number
progression.getXP()                 // → lifetime XP
progression.getProgress()           // → { level, into, need, xp, rank: { name, color, from } }
progression.getChallenges()         // → [{ id, slot, cat, title, desc, goal, value, done, xp, unit? }] (today's three)
progression.rerollChallenge(slot)   // → the new challenge, or null (one free swap per day)
progression.rerollsLeft()           // → number
progression.getWeekly()             // → this week's challenge { id, title, desc, goal, value, done, xp, unit? }
progression.getAchievements()       // → [{ id, title, desc, xp, icon, unlocked (ms or 0) }]
progression.getPersonalBests(mapId) // → { score?, air?, spin?, kmh?, combo? }
progression.getTrickBook()          // → [{ name, n }] every trick / rail combo landed clean
progression.getMapStars(mapId)      // → { stars: [ridden, clean run, ×4 combo], count }
progression.addXP(amount, reason)   // → XP added (fires level-ups)
progression.onLevelUp(fn)           // → unsubscribe; fn({ level, prev, rank, rankUp })
progression.onAchievement(fn)       // → unsubscribe; fn({ id, title, desc, xp, icon })
progression.onChallengeDone(fn)     // → unsubscribe; fn({ challenge })
progression.onXP(fn)                // → unsubscribe; fn({ gained, reason, xp, level, into, need })
```

Bus events (state.js):

- `progressXp`
- `juiceLevelUp {level, prev, rank, rankUp}`
- `achievement`
- `challengeDone`
- `dailySweep`
- `personalBest {mapId, stat, label, value, prev, text, was}`
- `newTrick {name, count, xp}`
- `weeklyDone {challenge}`
- `progressRideSummary`

**For reward cases.** Grant a case on level-ups like this:

```js
progression.onLevelUp(({ level, rankUp }) => { if (level % 5 === 0 || rankUp) grantCase('level', level); });
```

The progression state never touches the profile files (web/src/profile/). It has its own key, `sendit.progression`, holding `{version, xp, life, daily, achievements, pb}`, which `sanitizeState` repairs if it is corrupt.

### Lobby

- **Progress tab** (`order: 45`, between Multiplayer and Leaderboards, registered through `registerLobbyTab`). It shows:
  - A level ring, the rank and an XP bar.
  - Today's three dailies, with progress bars, XP and **Swap**, and the time until new ones.
  - The achievement grid, with hover for details.
  - This map's personal bests.
- **TODAY strip.** It sits above the Ride button and shows the three dailies, each with a mini progress ring and its XP; finished ones are struck through. Clicking it opens the Progress tab. It hides on very short windows.
- **Profile chip.** An `LV n` badge in the rank colour, and a thin XP bar under the name. It is a small widget appended to the chip; Lobby.js is not edited.

## 7. Why games hook — and what Sendit adds

The earlier research ([game-feel-research.md](game-feel-research.md)) covered moment-to-moment juice and the
"one more run" loop. This pass looked at STEEP and the other games the user named, asked what each one does to
keep players riding, and checked every idea against what Sendit already had.

### What the big games do

| Game | What hooks people | Already in Sendit? |
|---|---|---|
| **STEEP** | Discovering the mountain: drop zones and challenges unlock as you explore the Mountain View. "Mountain stories" give each peak a voice. You can replay any moment (the GoPro view) and share it. Friends' scores and lines sit on every challenge. | Drop zones (keys 1–9) on the big maps. **Added:** spots to discover per mountain, instant replay with a drone cam and clip saving, and links to challenge a friend. |
| **Riders Republic** | Replay editor with drone, follow and helmet cams. Constant small events, and a career that branches by discipline. | Helmet cam (first person). **Added:** the drone replay. |
| **SSX Tricky / SSX 3** | The boost / Uber meter fills from tricks (spelling TRICKY). Races and trick events reward different styles, and a hot streak is shown as the rider "on fire". | SEND IT on the flow maps, FEVER, the hot trail, Challenge vs Zen. |
| **Tony Hawk's Pro Skater** | Combo chains where repeats wear out. **Gaps**: hidden named spots and transfers, shown in the combo list and in a per-level list (which drives exploration). Five-plus goals per level. | Combos with repeat decay, line goals on the flow maps. **Added:** spots and transfer gaps with a per-mountain list. |
| **Trackmania** | One button restarts the run in under a second, so a failed attempt costs nothing. A ghost of your best, medals, and split times at checkpoints, to the millisecond. Short runs. | Ghost, medals and gate splits in Challenge. Restarting took a 1.3 s fade plus a 3.6 s countdown. **Added:** a 0.3 s restart with a 2.4 s countdown, and retry from the last take-off. |
| **Forza Horizon** | Skill chains (near misses, drifts, air) that bank when you stop, and rewards every few seconds. Skill songs. | The combo chain, close shaves, FEVER, XP. |
| **Rocket League / Fortnite** | A short session loop, cosmetics, and the near miss on a reward reveal. Replays and clips you can share. | Reward cases with near-miss reels, and the Locker. **Added:** clips. |
| **Descenders** | Risk against reward: a run's reputation grows with style and is lost by bailing. | Losing the combo on a crash, stomp and clean streaks. |
| **Skate** | Hall of Meat (crashes pay a little). A marker to drop and return to while practising a line. | Wipeout XP. **Added:** retry from the take-off (the marker, set for you). |

### The psychology, briefly

- **Variable rewards.** Points, cases and new tricks arrive at unpredictable times, which keeps people
  playing; slot machines exploit the same pull. Sendit uses it only for things earned by riding: case
  reels, FEVER windows, and new spots or gaps you stumble on.
- **Flow channel.** The challenge has to rise with skill. Sendit keeps the riding difficulty fixed, so the
  rising goals are the self-set ones: bigger spins, new spots, beating a ghost.
- **Clear short-term goals.** Players need something to do in the next 30 seconds: dailies, line goals, the
  next spot, the replay prompt, the gap to a friend's ghost.
- **Visible mastery.** Trick book, map stars, and now a spots list per mountain ("7 / 31").
- **Near misses.** A near miss reads as "almost" rather than a loss: close shaves, the case reel stopping
  beside a rare item, a friend beating you by 0.4 s.
- **Adrenaline.** Speed, sound and the frame create the rush: a wider lens and streaks at speed, wind, and a
  pulse that rises at exposure. A heartbeat near a cliff is a cheap, strong cue.
- **Instant retry.** The cost of failing decides how much risk players will take. When a retry costs a
  second, players try the big trick again; when it costs a long fade and a walk back, they play safe.
- **Social comparison.** Beating a named friend means more than beating a number.

### What we added and why (all of it skill-neutral)

The user's rule was that nothing may make riding easier, and that riding must stay controllable and
natural. None of these features changes physics, landing tolerance, speed or scoring rules. They change
how fast you get back to try again, what you have to aim for, and how the moment feels.

| Feature | Hook | Section |
|---|---|---|
| Instant restart and retry from take-off | Instant retry and Trackmania pacing, which encourage riskier attempts | 8a |
| Spots and transfer gaps | Discovery, variable reward and visible mastery (STEEP and THPS) | 8b |
| Adrenaline cues | Arousal: a heartbeat and closing edges when exposed | 8c |
| Instant replay and clips | Savouring the moment, plus sharing (STEEP GoPro view, Riders Republic drone) | 8d |
| Versus links | Social comparison and a named ghost (Trackmania, STEEP friends) | 8e |
| SO CLOSE lines (the next medal, a missed spot) | Near misses turned into "one more try" | 8f, 8b |

Considered and left out:

- **A run-wide SEND IT multiplier on every map.** It would overlap the combo, FEVER and SEND IT systems that
  already exist.
- **Personal-best splits in Zen.** Challenge already has gate splits and ghosts.
- **Mountain stories with voice-over.** No voice assets.

Sources: [Steep store page](https://steep.ubisoft.com), [TheSixthAxis on Steep](https://www.thesixthaxis.com/2016/11/09/exploring-steeps-snow-covered-mountaintops-and-extreme-vertical-drops/),
[THPS2 gaps (StrategyWiki)](https://strategywiki.org/wiki/Tony_Hawk%27s_Pro_Skater_2/Gaps), [Trackmania preview (TheSixthAxis)](https://www.thesixthaxis.com/2020/05/28/trackmania-preview-new-pc-release/),
[Uber Trick System (Giant Bomb)](https://giantbomb.com/wiki/Concepts/Uber_Trick_System), [Descenders review (GameCritics)](https://gamecritics.com/daniel-weissenberger/descenders-review/),
[Riders Republic replay editor guide](https://www.ludo.guide/guide/riders-republic/advanced-gameplay-techniques/photo-mode-replay-editor), [Variable rewards](https://concepts.dsebastien.net/concept/variable-rewards/).

## 8. Thrill features (thrill/)

| Module | What it does |
|---|---|
| `web/src/thrill/core.js` | Pure logic and every tunable (`THRILL`): spot book, landing judge, retry trail, exposure, replay ring, versus codes. |
| `web/src/thrill/retry.js` | Quick restart (R) and retry from the last take-off (Backspace). |
| `web/src/thrill/spots.js` | Spots and gaps, the background catalog scan, and the Progress tab section (`spotsHtml`). |
| `web/src/thrill/adrenaline.js` | Heartbeat and edge vignette when exposed. |
| `web/src/thrill/replay.js` | Recorder, drone replay, letterbox UI, clip saving. |
| `web/src/thrill/versus.js` | Challenge links: the friend's ghost, the live gap, the verdict, the share button. |
| `web/src/thrill/index.js` | `installThrill()`, and two settings rows. |

Edits to shared files are small and additive:

- `main.js`: install the module, call `thrill.input()` before the world updates (while a replay plays it
  skips the physics, the rig, the chase camera, effects, activities, sound and the finish check), and call
  `thrill.update(dt)` after juice.
- `progression/lobby.js`: one line for the Spots & gaps section, plus four CSS rules.
- `scripts/unittest.mjs`: one line that runs `thrill-unit.mjs`.

`player.js` is not edited. The quick restart replaces `player.resetToTop` on the instance.

### 8a. Instant restart and retry (thrill/retry.js)

- **R / Y: restart.** This is the same reset to the top as before, but it is a 0.08 s flash to black, 40 ms
  held, then 0.22 s back in. It used to take 0.45 + 0.12 + 0.7 s. A Challenge restarts with a **2, 1, GO**
  countdown (2.4 s; a fresh start keeps 3, 2, 1). Event: `thrillRestart {mode}`.
- **Backspace / d-pad ▼: retry from the last take-off** (Zen). It puts you back on the approach, **with
  the speed you had there**, so the same jump can be tried again at once. The point is 2.6 s before the
  take-off at the take-off speed, measured as distance ridden (12–45 m).
  - **What counts as the take-off.** Only an air of 0.4 s or more, or one that ends in a crash. A smaller
    air (under 60 %) within 40 m after a bigger one is treated as a bounce off the landing, so it doesn't
    move the target.
  - **During a crash.** It works while tumbling, and skips the respawn fade.
  - **Repeats.** It works again and again on the same jump.
  - **Clean runs.** A retried run no longer counts as a clean run, as with drop zones.
  - **Before any jump**, a hint explains the key.
  - **In a Challenge** it restarts the run, since a retry would break the clock.

  Event: `thrillRetry {x, z, speed}`.
- Voltage Park keeps its own **T** (back to the last feature).

Tunables: `THRILL.restart = { fadeIn 0.08, hold 40 ms, fadeOut 0.22, countdown 2.4 }` and
`THRILL.retry = { lead 2.6 s, leadMin 12 m, leadMax 45 m, minAir 0.4 s, bounceM 40 m, sampleM 1.5 m, keep 600 m }`.
The trail's clock is the distance ridden, not time, so frame rate and hit-stop don't change where you land.
Teleports (respawns, drop zones, restarts) don't count as distance.

### 8b. Spots and gaps (thrill/spots.js)

Every named feature on a mountain is a **spot** to discover.

- **Sending a spot.** A clean landing after taking off from a named feature, with at least 0.6 s of air or
  3 m of drop, sends it. The first time pays +250 style points and +60 XP, and shows a "NEW SPOT" toast with
  "7 / 31 on this mountain" and a progress bar.
- **Transfer gaps.** Taking off from one named spot and landing on another, with 0.8 s of air or more, is a
  **gap** ("NEW GAP! THE THRONE → PILLOW STACKS"). It pays +400 and +100 XP the first time and +100 every
  time after, as THPS gaps always score.
- **Rails** count as spots when ground for 3 m or more.
- **Combos.** All of these are score lines, so they also feed the combo chain.
- **Near miss.** Launching off a spot you haven't found yet and then landing sketchy or crashing shows **SO
  CLOSE · THE THRONE NOT SENT · BACKSPACE / ▼ RETRY** (the key part only in Zen). Event: `thrillSpotMissed`.

Where names come from:

- `course.featureAt(x, z)` on Ravenspire, Voltage Park, Dragonback, Kitsune and Fjordline.
- Otherwise the kickers: on Valcrest and Blackspruce they are named like "Kicker 3 (L)".

The full list, used for found / total, comes from `course.named` and the rails on Voltage. On the other
featureAt maps it comes from a background scan of `featureAt` over the terrain on an 8 m grid, in 6 ms
slices that start 2.5 s after load. The list is cached per map in `localStorage['sendit.spots']`; bump
`THRILL_SPOT_CATALOG` when map feature names change.

**? markers.** These are STEEP's points of interest. An undiscovered spot up to 160 m ahead of you (or any
direction within 45 m) gets a floating cyan **?**, 5 m above the snow. At most three show at once, they
fade in with distance and out as you arrive, and each one disappears when you send its spot.

- **Where they go.** The catalog keeps up to 16 points per spot name, at least 50 m apart: from the scan,
  `course.named`, or the kickers. So a name used for many features (Roller, Wind Lip) marks the nearest
  one.
- **Setting.** "Mark undiscovered spots (?)" (`settings.thrillSpotMarkers`).
- **Tunables.** `THRILL.markers = { range 160, near 45, max 3, lift 5, size 2.2 }`.
- **The catalog version** is 2: v1 caches rescan once to add the points.

The lobby's **Progress tab** has a **Spots & gaps** section for the current map. Found spots are lit,
unfound ones show as `???`, and the gaps found are listed.

Events: `thrillSpot {mapId, name, found, total}` and `thrillGap {mapId, name, isNew, n}`. Tunables:
`THRILL.spots`.

Achievements (progression `recordThrill`): **Scout** (10 spots), **Mind the Gap** (a first gap), **Gap Master**
(10 gaps) and **Bragging Rights** (beat a friend's versus link). The life counters are `spots`, `gaps` and
`versusWins`.

### 8c. Adrenaline cues (thrill/adrenaline.js)

An exposure level from 0 to 1 is the largest of three measures:

- **Drop ahead.** While grounded and above 6 m/s, the snow is sampled 6, 10, 15, 22 and 30 m ahead along the
  travel direction. The drop beyond the slope's own fall line is measured, so an even steep slope reads
  calm and a cliff band reads high. It runs from 6 m (level 0) to 24 m (level 1).
- **Height above the snow in the air.** From 6 m (level 0) to 24 m (level 1).
- **Speed ratio.** From 0.93 to 1.05, worth at most 0.35.
- **A close race.** In a versus race (8e), being within 15 m of the friend's ghost along the course is
  worth up to 0.5 when neck and neck (`raceGap`, `raceShare`).

The level eases up at 2.5/s and down at 0.9/s. From 0.15, a synthesized heartbeat plays on the sfx bus: a
"lub-dub" of two low sine thumps, from 76 to 148 bpm, louder as the level rises. The screen edges also
darken (vignette opacity up to 0.7) and pulse on each beat. With reduced motion there is no pulse and the edges are softer.
The vignette sits under the HUD.

The cue tells the player nothing the camera doesn't already show. Setting: **Adrenaline cues (heartbeat
near drops)** (`settings.thrillAdrenaline`). Event: `thrillExposure {level}` at 4 Hz. Tunables:
`THRILL.exposure`.

### 8d. Instant replay (thrill/replay.js)

**Recording.** The last 8 s of riding are kept, at up to 60 Hz, in a ring of 496 frames: each node under
the rider rig, plus the rider's position and whether they were in the air. Each node stores its local
position, rotation, scale and visibility, which covers bones, gear, garments and poles. That is about
3 MB, and copying it costs nothing measurable. The node list is rebuilt when the rig changes (gear swap).

**Playing.**

- **The prompt.** In Zen, a clean landing with 1.4 s or more of air, or a 720, flip or cork with more than
  0.8 s of air, shows a "▶ REPLAY · TAB" pill for 4 s. **Tab (d-pad ▲)** plays it. Pressed later, up to
  14 s after the landing, Tab still replays that trick; with no recent big trick it replays the last 6 s.
- **Wipeouts.** After a big crash (a tumble of 4 m or more, or 11 m/s or more at the crash), the respawn
  shows "▶ REPLAY WIPEOUT · TAB" (STEEP's "relive your wipeouts"). The clip runs from 2.5 s before the crash
  to the respawn, at 0.5× around the crash, the tumble included.
- **Teleports.** A replay never spans a respawn, retry or drop zone (`clipRange`).
- **The clip.** It runs from 4 s before the touchdown to 1.5 s after. It plays at 0.4× while airborne,
  eased, and at 1× on the snow.
- **The camera.** A drone orbits the rider: 6.2 m out, 2.4 m up, 120° over the clip, starting side-on to
  the travel and kept 1.2 m above the snow. It flies on whichever side of the line has fewer trees between
  it and the rider (sampled against the scatter's obstacle hash). The lens is 50°.
- **The filmer's shot.** Every other replay uses a tripod instead, like a snowboard-video filmer: 10 m
  beside the take-off (or the crash) and 4 m ahead, 1.4 m up. A long lens pans with the rider and zooms to
  keep about 3.2 m of scene in frame (14–55°). Tunables: `filmerDist`, `filmerAhead`, `filmerHeight`,
  `filmerFrame`.
- **Helmet cam.** A clip recorded in first person still shows the whole rider: the head is full size and
  the garments are shown.
- **The screen.** Letterbox bars, a blinking REPLAY tag, the rate (0.4×) and a progress line. The HUD, the
  adrenaline vignette, the level-up overlay and the case cards are hidden.
- **Frozen world.** The ride is frozen while it plays: no physics, no timers. Afterwards the rig is put
  back exactly as it was and the chase camera snaps behind.
- **Skipping.** Space, Esc, Tab, or pad A / B / Start / ▲ skips (not on the frame that started it).
- **Enter saves a clip.** It restarts the replay and records the canvas with `MediaRecorder` (VP9 or VP8
  webm, 30 fps, 6 Mbit/s), then downloads `sendit-replay-<time>.webm` when the replay ends.

Not in Challenge runs, where the clock never stops. Setting: **Replay prompt after big tricks**
(`settings.thrillReplayPrompt`); Tab works either way. Event: `thrillReplay {on, length, clip}`.
Tunables: `THRILL.replay`.

### 8e. Versus links (thrill/versus.js)

- **Sharing.** The Challenge results card gains **Copy challenge link**. The link is
  `?map=…&trail=…&challenge&vs=CODE`. The code holds the map, trail, your display name, time, style score and
  medal, plus the run's ghost: down-sampled to 0.3 s and delta-packed into zigzag varints (decimetres and
  centiradians), then base64url. A 90 s run is about 2 KB. With no clipboard permission, the link shows in
  a prompt instead.
- **Racing it.** Opening the link boots that map straight into the Challenge.
  - The friend's ghost rides in pink with their name over it.
  - Under the timer: **VS MIA · 1:01.50  ▲ 12 m** (cyan when you are ahead along the course, pink when
    behind).
  - At the finish, a banner: **YOU BEAT MIA BY 1.24 s** (gold) or **MIA WINS BY 0.80 s**.
  - The results card adds a "VS Mia" row, and the button becomes **Copy link · challenge back**.
- The target stays for every retry until the page is opened without `?vs`. A code for another map shows a
  hint and is ignored, and a broken code is ignored.

Event: `thrillVersus {win, time, target, name}`. Codec: `encodeVersus` / `decodeVersus` (`VERSUS`) in
core.js.

### 8f. SO CLOSE: the next medal (thrill/medals.js)

This is the Trackmania near miss. A Challenge results card that isn't gold gets one more row for the next
medal up:

- **Close.** Within 1.5 s, or 4 % of the target time, it pulses gold: **SO CLOSE · 0.42 s off SILVER**.
- **Otherwise** it states the goal plainly: **Next medal · SILVER · 12.3 s faster**.

Judged runs (Voltage slopestyle) skip it. Logic: `nextMedalGap(time, targets)`. Tunables: `THRILL.medal`.
Event: `thrillNextMedal {medal, gap, close}`.

### Tests

- `node web/scripts/thrill-unit.mjs`, which `unittest.mjs` also runs. It checks:
  - The spot book: discovery, repeats, the catalog, garbage storage.
  - The landing judge.
  - The retry pick.
  - Exposure against an even slope and a cliff, and the heartbeat tempo.
  - The replay ring: wrapping and lookup by time.
  - Clip ranges: around a moment, the fallback, and never across a cut.
  - The thrill achievements.
  - `nextMedalGap`.
  - Versus codes: the round trip within quantisation, size, URL safety, and junk input.
- `MAC=1 node web/scripts/thrill-smoke.mjs <url> <outDir>` (or `GPU=1` on Windows). It runs in the real game
  and saves a screenshot of each step:
  - A real straight air off Valcrest kicker 3 (11 m/s, about 1.9 s): the spot toast and the replay prompt.
  - Tab: the replay plays, the ride is frozen, and it ends.
  - Backspace: back on the approach with speed, past the bounce after the landing.
  - R: the restart takes under 400 ms.
  - A crash: the REPLAY WIPEOUT prompt, and the wipeout replays.
  - The Progress tab's spots list.
  - The Ravenspire First Stack cliff: the adrenaline level, the vignette and a spot.
  - A versus link: the ghost, the live gap, the verdict row and the share button.
  - No console errors.

## Tests and tools

- `node web/scripts/unittest.mjs` includes `progression-unit.mjs`. It covers:
  - Curve inversion and level-up events.
  - Dailies: deterministic, distinct categories, completion, sweep, swap, midnight.
  - Achievements, personal bests, persistence and garbage input, and per-map close shaves.
  - The combo chain: growth, repeat credit, bank, loss, air keeping it alive.
  - The TimeWarp curve and cooldown.
- `GPU=1 node web/scripts/juice-shots.mjs <url> <outDir> [ski|snowboard] [kicker]` rides scripted tricks off a real kicker. It captures:
  - The air read-out and the landing announcer.
  - The combo bank and the speed rush.
  - A level-up, the toasts, the lobby badge and the Progress tab.

**After a merge**, run `GPU=1 node web/scripts/juice-smoke.mjs <url>`. It makes 11 checks: the Progress tab, the TODAY strip, the chip badge, the HUD, the combo chain, the announcer, the speed rush, the level-up, the ride recap, and no console errors. It exits 1 on any failure.

The other scripts (all real GPU; screenshots go outside the repo):

| Script | What it checks |
|---|---|
| `juice-flowshots.mjs <url> <out> <mapId>` | The HUD next to a map's own HUD, with a staged chain, announcement and bank pushed through the real bus. Used on Voltage Park and Blackspruce. |
| `juice-chalshots.mjs <url> <out>` | A Challenge run against a seeded best: split deltas at the gates, and the style combo with its tier word. |
| `juice-impactcheck.mjs <url> [kicker]` | The per-frame warp, rider travel and camera punch springs after a real landing. |
| `juice-perf.mjs <url> [quality]` | A/B frame cost of the speed rush pass. |
| `juice-pauseshot.mjs <url> <out.png>` | The pause screen with the progression line. |
