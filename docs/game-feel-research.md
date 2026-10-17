# Game feel and "one more run": research notes

This is research for Sendit's juice and progression work (October 2026). The systems built from it are described in [game-feel.md](game-feel.md).

Numbers are starting points that we tune in play. Items marked *recalled* come from well-known talks and games; they are not from a page fetched for these notes.

## 1. Juice (moment-to-moment feel)

| Technique | What the sources say | Taken into Sendit |
|---|---|---|
| **Juice it or lose it** (Jonasson and Purho, GDC Europe 2012). See [gamedeveloper.com](https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-). | Juice means maximum output for minimum input. The talk layers tweens, squash, particles, sound, screen shake, tiny pauses and pitch that rises with the combo. | The announcer slams in with scale and blur. The combo multiplier bumps on each new move. Flashes and the edge glow layer on top of each other. |
| **Art of Screenshake** (Nijman, Vlambeer). See [dev.to summary](https://dev.to/selfish_dev/the-art-of-screen-shake-33bi). | Make many small layered effects per hit, sized to the event's importance. Ship a shake slider. | Each punch is scaled by the event's size. `settings.juiceShake` scales all of them. |
| **Trauma shake** (Eiserloh, GDC 2016). See [KidsCanCode recipe](https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/). | Trauma runs 0 to 1. Shake = trauma², using smooth noise (not random), with linear decay. | camera.js already had this. We add *punches*: a FOV kick, a vertical dip and a roll on springs, separate from the shake. |
| **Hit-stop**. See [bugnet](https://bugnet.io/blog/how-to-use-hit-pause-to-make-impacts-feel-powerful) and the [IEICE study](https://ken.ieice.org/ken/paper/20230315OCSt/eng/). | Freeze 50 to 100 ms on a heavy hit, then slow-mo of 0.2 to 0.4 s. Scale the freeze with the hit's strength. Keep UI, audio and particles running. | `TimeWarp` freezes physics 50 to 85 ms, then eases back from 0.3 to 0.45× over 0.22 to 0.38 s. The camera, HUD, audio and particles keep running. |
| **Game Feel** (Swink). | Real-time control, a simulated space and polish. Response under about 100 ms. | The freeze never exceeds 85 ms, and it never fires in the half second before touchdown, because slow-mo only happens at the apex. |
| **Sense of speed**. See [Hargreaves](https://www.shawnhargreaves.com/blog/speed-is-a-matter-of-perspective.html) and [EUDL](https://eudl.eu/doi/10.1007/978-3-319-55834-9_14). | FOV is the strongest lever. Heavy motion blur *lowers* perceived speed. Keep blur light and at the edges. | The speed rush is edge-only: zoom blur plus a chromatic fringe, with the centre clear. It runs only above 82 % of top speed and is off on the low quality tier. Rush lines appear only on boost moments. |

## 2. What other games do in the moment

- **Tony Hawk's Pro Skater** ([StrategyWiki](https://strategywiki.org/wiki/Tony_Hawk%27s_Pro_Skater_2_(Game_Boy_Advance)/Gameplay)):
  - Each trick adds base points and +1 to the multiplier.
  - The combo banks only on a clean landing, and a bail wipes it.
  - Repeated tricks lose value, which pushes variety.
  - **Taken:** each different move adds to the multiplier, while a repeat counts 0.35. A crash loses the chain, with a "COMBO LOST −n" banner and screen shake. A "LAND IT" warning shows while the chain rides on an air.
- **SSX** ([Giant Bomb](https://giantbomb.com/wiki/Concepts/Uber_Trick_System), [Wikipedia](https://en.wikipedia.org/wiki/SSX_Tricky)):
  - Tricks fill a boost meter, and when it is full the game enters Tricky mode with its music loop.
  - The flow multiplier reaches ×20 and is held by chaining moves.
  - **Taken:** Sendit already has a SEND IT flow state on flow maps (physics/flow.js). The music module lifts into the upbeat track at high energy, including outside flow maps.
- **Forza Horizon skill chains** ([GamesRadar](https://gamesradar.com/forza-horizon-5-car-mastery)):
  - Many different skills extend one chain: drift, near miss and speed.
  - A crash loses the chain, and a short idle period banks it.
  - **Taken:** one chain covers tricks, rails, close shaves and drops. It banks after 3.4 s on the snow, and air or a rail keeps it alive.
- **Trackmania** ([ManiaExchange](https://tm.mania.exchange/blogs/entry/569/what-do-you-think-medal-times)):
  - Medal ladders and a personal-best ghost, with near-instant restarts.
  - **Taken:** Sendit already has Challenge medals and ghosts. We add per-map personal-best callouts in ride (score, longest air, biggest spin, top speed, best combo).
- **Announcers and grades** (*recalled*: SSX, THPS, Steep, Riders Republic):
  - A big callout for the landing grade, plus pitch that rises per combo step.
  - **Taken:** STOMPED, PERFECT, CLEAN and SKETCHY badges over the trick name. A white flash and rumble mark a stomp.
- **Reactive music** ([vertical layering](https://blog.criware.com/index.php/2020/04/20/dynamic-music-with-adx2-part1-vertical-layering/), [web game audio](https://abratabia.com/web-game-audio/dynamic-game-music.php)):
  - Stems fade in with intensity, and a drop hits on big moments.
  - **Taken:** juice/music.js computes one energy value and drives the existing track choice. It plays riser and hit stingers through `oneShot`. It also emits `musicEnergy` and `musicDrop` events, and will call optional `setMusicEnergy` and `musicDrop` hooks if audio.js adds them.

## 3. Retention: the "one more run" loop

- **XP curves** ([curve calculator](https://west-games.com/exponential-xp-curve-calculator/), [Roblox devforum](https://devforum.roblox.com/t/level-up-system-math/1474055)):
  - The usual form is XP to next = base × level^1.3–1.7.
  - The first levels should come within 1 to 3 runs, then slow down.
  - **Taken:** 260 × L^1.45. Level 2 comes partway through the first ride, and level 5 after about four rides.
- **Daily challenges** ([Indie Hackers](https://www.indiehackers.com/post/designing-with-data-what-daily-quests-actually-do-to-your-game-metrics-926d83be10)):
  - Keep them short and spread across different systems.
  - Reset at local midnight for a solo game.
  - **Taken:** three dailies per day from different categories, seeded by the date so they are stable. One free swap per day, a clean-sweep bonus, and a countdown to midnight.
- **Streaks and loss aversion** ([solodevstack](https://solodevstack.com/blog/orchard-deck-retention-without-dark-patterns)):
  - Never take away earned rewards. Avoid FOMO timers, paid rerolls and fake near-misses in random rewards.
  - **Taken:** no streak punishment and nothing paid. Every XP source rewards skill.
  - Near-miss rewards in Sendit are *skill* near-misses (skimming a tree), which is fine. The gambling-style near-miss effect is contested anyway ([U Alberta](https://www.ualberta.ca/science/science-news/2019/september/gambling-behaviour-near-misses)).
- **Achievements and rank-ups** (*recalled*): visible goals spread over different playstyles, plus rank names that mark tiers.
  - **Taken:** 22 achievements, each with XP.
  - Six ranks: Rookie → Shredder → Ripper → Pro → Legend → Mountain God.
  - A level-up celebration over the ride and the lobby.

## Ranked by expected impact for Sendit

1. **One combo chain on every map, with risk.** It ties tricks, rails, close shaves and drops into one goal, and crashing has a cost.
2. **Trick announcer and landing grades.** They make every landed trick read and feel earned.
3. **Hit-stop and camera punches on landings.** These give weight to the landing, the core moment of the game.
4. **XP, levels and a level-up celebration.** This is the session-to-session hook.
5. **Daily challenges.** They give a reason to come back and to try other maps and tricks.
6. **Personal-best callouts in ride.** These are small, frequent wins.
7. **Speed rush at top speed.** It adds adrenaline on the steeps.
8. **Music energy.** It lifts the track on hot streaks.
9. **Achievements.** These are long-tail goals.
10. **Live air read-out.** Rotation ticks up per 180°, which makes spinning satisfying mid-air.

## Built beyond the first list

These were added after the first pass, still from the research above:

- **Trick book.** Each first landing of a trick pays XP, which pushes variety (THPS repeat decay, turned around as a reward).
- **Challenge split deltas against your best run** (Trackmania).
- **Combo tier words**, NICE to GODLIKE (SSX, Tony Hawk).
- **Streak call-outs.** Stomps in a row, and clean tricks in a row.
- **A weekly challenge.** It is the longer loop. It resets on Monday and never takes away what was earned.
- **A ride recap card** ("+XP", the level bar filling, "one more run?").
- **A TODAY dailies strip** next to the Ride button.
- **Floating score pops** for small scores.
- **Rising-pitch combo ticks.**
- **Reduced-motion defaults.**
