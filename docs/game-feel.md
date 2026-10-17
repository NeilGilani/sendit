# Game feel and progression

In-ride juice runs on every map, and session-to-session progression sits on top of it. The research behind it is in [game-feel-research.md](game-feel-research.md).

| Module | What it does |
|---|---|
| `web/src/juice/combo.js` | One combo chain on every map. |
| `web/src/juice/hud.js` | Trick announcer, landing grades, combo panel, live air read-out, call-outs, banners and toasts. |
| `web/src/juice/impact.js` | Hit-stop and micro slow-mo (`TimeWarp`), camera punches and rumble. |
| `web/src/juice/speedfx.js` | Speed-rush post pass: edge zoom blur, chromatic fringe and rush lines. |
| `web/src/juice/music.js` | Music energy and drops. |
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
| Challenge mode | activities.js style combo | activities.js rules, with a 2.6 s window. |
| Everywhere else (Valcrest, Blackspruce in Zen) | juice/combo.js | See below. |

Rules for the juice/combo.js chain:

- Every scored move adds its points to the chain: tricks, rails, close shaves, drops and the Blackspruce tree slalom. Distance markers (`250 m`) are not moves.
- The multiplier grows by `step` for each *different* move. A repeat counts `repeatCredit`; the move key strips Perfect, Sketchy, numbers and lengths.
- Air and rails keep the chain alive. After `window` seconds on the snow the chain banks: `addScore("Combo ×m", pts × (m − 1))`.
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

- **Combo panel.** Shows ×mult (cyan, then gold from ×2.5, then blazing orange from ×4), the points, the last three moves and a timer bar. The multiplier bumps on every increase.
- **Announcer, upper third.** A grade badge sits over the trick name in big slanted type, with +points and extras (drop height, SWITCH) below. It slams in at 1.9× scale with blur and settles in about 0.2 s.
- **Live air, centre.** Once the air passes 0.45 s, the rotation shows in 180° steps and bumps on each new 180. It also shows flips (`FLIP`, `2× FLIP`) and the grab being held.
- **Call-outs, below centre.** CLOSE SHAVE, then ×n for a streak within 2.6 s (gold from ×3). RAZOR CLOSE! appears under 0.8 m. RAIL LOST and line-goal steps also show here.
- **Banners.** `COMBO ×3 +1,240` (MONSTER COMBO from ×4), with a gold edge glow from ×2.5. Line goals on flow maps also show here.
- **Rolling score, top right.** It counts up toward the ride's score and bumps gold when a chunk of 100 or more lands. The snowflake counter moves under it.
- **Toasts, right side.** Achievements, finished dailies, the daily halfway mark and personal bests.
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

These are separate from the existing trauma shake, which is unchanged.

**Rumble.** Added on top of main.js's own: a stomp (0.35/0.8, 120 ms), a huge landing (0.8/1, 260 ms), a combo bank (0.25/0.6, 140 ms) and a level-up (0.6/1, 420 ms).

**Settings.** These are optional keys in the settings object, and nothing in the settings UI sets them yet:

- `settings.juiceShake` (0 to 1, default 1) scales every punch.
- `settings.juiceHitstop = false` turns the time warp off.
- `settings.juiceSpeedFx = false` turns the speed rush off.

## 4. Speed rush (juice/speedfx.js)

This is one `EffectPass`, inserted before SMAA through `composer.addPass(pass, index)`; the gfx internals are not edited. It applies a radial zoom blur and a chromatic fringe that grow toward the screen edges, with the centre (radius 0.22) left clear. Rush lines (thin bright radial streaks) appear on boost moments.

- **Rush.** Driven by speed ratio from 0.82 to 1.0, up to 0.45. The SEND IT state adds +0.12. Blur length is 0.018 and fringe 0.0028 (UV at the edge), kept subtle.
- **Pulses.** `huge` 1, `stomp` 0.75, `bank` 0.55, `flow` 0.8; they decay at 2.4/s.
- **Cost.** The pass is disabled whenever its intensity is about 0.
- **Quality.** Low = off, medium = 4 blur taps, high = 8 (`JUICE_SPEEDFX.taps`).

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
- **Pacing.** A first ride usually reaches level 3, about four rides reach level 5, and the curve slows after that.
- **Pause screen.** It adds the level, the rank, XP to the next level, and the dailies still open.
- **Ranks (`RANKS`).** Rookie from level 1, Shredder from 5, Ripper from 10, Pro from 20, Legend from 35, Mountain God from 60. Each rank has a colour, used for the badge, the celebration and the Progress tab.
- **Level-up.** A full-screen celebration (rings, the level number slamming in, the rank and XP to the next level) plays over the ride and the lobby. Level-ups queue, rumble, give a music drop and flash.
- **XP bar.** A small bar under the speedometer fills in ride and fades out after 2.5 s.
- **Ride recap.** Back in the lobby after a ride, a card slides in on the right. It counts up "+1,240 XP", animates the level bar from where the ride started, and lists the dailies, achievements and personal bests from that ride, plus distance and score. It ends with "ONE MORE RUN? PRESS ENTER", hides after 9 s or on click, and comes from `progressRideSummary`.

### Daily challenges

Three challenges are chosen per local day from `CHALLENGE_POOL`, each from a different category. The choice is seeded by the date, so it stays the same all day and changes at midnight. There is one free **Swap** per day for an unfinished challenge. Progress resets at midnight; nothing earned is ever taken away.

| Category | Examples |
|---|---|
| Spins | Land a 540, 720 or 900 |
| Flips | Land 1, 3 or 5 flips |
| Close shaves | 20, 35 or 50 close shaves, sometimes "…in Blackspruce" |
| Distance | Ride 3, 5 or 8 km |
| Air | 30, 45 or 60 s of air |
| Combos | Bank a ×2.5, ×3 or ×4 combo |
| Stomps | Stomp 3, 5 or 8 landings |
| Speed | Hit 70, 85 or 100 km/h |
| Score | Score 3,000, 6,000 or 10,000 in one ride |
| Tricks | Land 10, 20 or 30 tricks |
| Rails | Grind 40, 80 or 150 m |
| Medals | Earn a bronze, silver or gold medal |

### Achievements

There are 22 (`ACHIEVEMENTS`), including:

- First ride, first trick, 360, 540, 720 and 1080, and a flip.
- 1 and 50 stomps, 100 close shaves.
- ×3 and ×5 combos, 10k in one ride.
- 100 km/h, 10 km and 100 km ridden, 60 s of air in one ride, 100 m of rails.
- All four maps, a clean sweep of the dailies, a gold medal, and level 10.

Each one unlocks once, with a toast and XP.

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
progression.getAchievements()       // → [{ id, title, desc, xp, icon, unlocked (ms or 0) }]
progression.getPersonalBests(mapId) // → { score?, air?, spin?, kmh?, combo? }
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
