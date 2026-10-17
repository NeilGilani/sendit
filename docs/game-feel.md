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
| `web/src/juice/settings.js` | Shake, hit-stop and speed-rush rows in the settings grid. |
| `web/src/juice/index.js` | `installJuice()`, which main.js calls once. |
| `web/src/progression/core.js` | Pure logic: XP curve, levels, dailies, achievements and personal bests. |
| `web/src/progression/index.js` | Public API and the ride tracker. Storage key: `sendit.progression`. |
| `web/src/progression/ui.js` | Level-up celebration, toasts and the in-ride XP bar. |
| `web/src/progression/lobby.js` | The lobby's **Progress** tab, and the level badge on the profile chip. |

Shared files have small, additive edits only:

- `main.js`: install, the physics clock × `juice.timeScale(dt)`, and the per-frame update.
- `camera.js`: `kick()`, plus springs on the chase camera.
- `ui.js`: the old PERFECT, CLOSE SHAVE and challenge-combo pops give way to the juice HUD.
- `scripts/unittest.mjs`: one line, which runs `scripts/progression-unit.mjs`.

## 1. Combo chain (every map)

There is one live chain, and the HUD shows it at the top centre, whichever system owns it:

| Where | Source | Rules |
|---|---|---|
| Flow maps (Ravenspire, Voltage Park) | physics/flow.js line chain | flow.js rules: ×0.25 per different move up to ×5, 3.2 to 3.6 s window. The flow HUD's own chain, grade and bank banner are hidden; ours replaces them. |
| Challenge mode (on every map, flow maps included, since the run is scored on it) | activities.js style combo | activities.js rules, with a 2.6 s window. A lone move is not a combo; a bank pays `banked − pts`. |
| Everywhere else (Valcrest, Blackspruce in Zen) | juice/combo.js | See below. |

Rules for the juice/combo.js chain:

- Every scored move adds its points to the chain: tricks, rails, close shaves, drops and the Blackspruce tree slalom. Distance markers (`250 m`) are not moves.
- The multiplier grows by `step` for each *different* move. A repeat counts `repeatCredit`; the move key strips Perfect, Sketchy, numbers and lengths.
- Air and rails keep the chain alive. (For the flow source only air does, as in flow.js. The Challenge combo keeps its own clock.) After `window` seconds on the snow the chain banks: `addScore("Combo ×m", pts × (m − 1))`.
- A crash loses the chain, and a "COMBO LOST −pts" banner shakes on screen.
- While the chain rides on an air or a rail at ×1.5 or more, the panel turns pink and shows **LAND IT**.

Tunables (`JUICE_COMBO`):

| Key | Default | Meaning |
|---|---|---|
| `window` | 3.4 s | Time on the snow without a new move before the chain banks. |
| `step` | 0.5 | Multiplier added per different move. |
| `max` | 6 | Multiplier cap. |
| `repeatCredit` | 0.35 | How much a repeated move counts. |
| `minBankMult` | 1.5 | Below this, the chain ends without a bonus line. |

Bus events:

- `juiceCombo {mult, pts, n, items, left, source} | null`
- `juiceComboBanked {bonus, mult, pts, source}`
- `juiceComboLost {pts, mult, source}`

## 2. Trick announcer and landing grades (juice/hud.js)

The HUD regions, from top to bottom:

- **Combo panel.** It appears from ×1.5 and shows ×mult (cyan, then gold from ×2.5, then blazing orange from ×4), the points, the last three moves and a timer bar. The multiplier bumps on every increase.
- **Announcer, at 37 % of the height**, under the combo panel and above the rider. A grade badge sits over the trick name in big slanted type, with +points and extras (drop height, SWITCH) below. It slams in at 1.9× scale with blur and settles in about 0.2 s.
- **Combo tiers.** Under the multiplier a tier word pops in as each tier is reached: NICE from ×2, SICK ×3, INSANE ×4, UNREAL ×5, GODLIKE ×6 (`TIERS`).
- **Live air, at 33 % of the height.** Air and announcer never show together. A straight air with no spin, flip or grab shows its hang time ticking ("1.4s") from 1 s, and the height above the snow once it passes 4 m. The number heats up with the rotation: white, then cyan from 360, gold from 720, orange from 1080. Once the air passes 0.45 s, the rotation shows in 180° steps and bumps on each new 180. It also shows flips (`FLIP`, `2× FLIP`) and the grab being held.
- **Floating score pops.** Minor scores under 100 points rise off the rider's screen position as "+15 CLOSE SHAVE" or "+20 GATE", with at most 4 alive, one per 0.4 s, and no repeat of the same move within 1 s. They skip tricks (the announcer has those), distance markers and combo bonuses.
- **Call-outs, below centre.** CLOSE SHAVE, then ×n for a streak within 2.6 s (gold from ×3). RAZOR CLOSE! appears under 0.8 m. RAIL LOST and line-goal steps also show here.
- **Streak call-outs.** STOMP STREAK ×n appears from 3 stomped or perfect landings in a row. n CLEAN IN A ROW appears every 5 named tricks landed without a crash.
- **Banners.** `COMBO ×3 +1,240` (MONSTER COMBO from ×4), with a gold edge glow from ×2.5. Line goals on flow maps also show here.
- **Rolling score, top right.** It counts up toward the ride's score and bumps gold when a chunk of 100 or more lands. The snowflake counter moves under it.
- **Toasts, top left.** Achievements, finished dailies, the daily halfway mark and personal bests. They sit on the left because the reward-cases notifications stack at the top right.
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
- **Challenge results.** An extra row reads "XP this ride +N · level L", with ▲ when the ride levelled up.
- **First rides.** One hint 15 s into each of the first two rides explains that tricks, combos, close shaves and dailies earn XP.
- **Ranks (`RANKS`).** Rookie from level 1, Shredder from 5, Ripper from 10, Pro from 20, Legend from 35, Mountain God from 60. Each rank has a colour, used for the badge, the celebration and the Progress tab.
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

There are 24 (`ACHIEVEMENTS`), including:

- First ride, first trick, 360, 540, 720 and 1080, and a flip.
- 1 and 50 stomps, 100 close shaves.
- ×3 and ×5 combos, 10k in one ride.
- 100 km/h, 10 km and 100 km ridden, 60 s of air in one ride, 100 m of rails.
- All four maps, a clean sweep of the dailies, a gold medal, and level 10.

Each one unlocks once, with a toast and XP.

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

The other scripts (all real GPU; screenshots go outside the repo):

| Script | What it checks |
|---|---|
| `juice-flowshots.mjs <url> <out> <mapId>` | The HUD next to a map's own HUD, with a staged chain, announcement and bank pushed through the real bus. Used on Voltage Park and Blackspruce. |
| `juice-chalshots.mjs <url> <out>` | A Challenge run against a seeded best: split deltas at the gates, and the style combo with its tier word. |
| `juice-impactcheck.mjs <url> [kicker]` | The per-frame warp, rider travel and camera punch springs after a real landing. |
| `juice-perf.mjs <url> [quality]` | A/B frame cost of the speed rush pass. |
| `juice-pauseshot.mjs <url> <out.png>` | The pause screen with the progression line. |
