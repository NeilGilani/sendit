# Sendit rewards: cases, the Locker and earned gear

You start in plain grey rental kit on the stock skis and board. Everything else comes out of **cases**,
and you earn cases only by riding: finishing runs and covering distance. A case opens like a CS:GO
weapon case, with a real crate: a 3D crate drops onto your lobby plinth, the lights go down, two latches
snap, the lid bursts open with light and snow, a reel of item cards spins past a gold marker above the
glowing crate and slows to a crawl, it stops on one item (often a hair away from something rarer), and
the item rises out of the crate (skis, boards) or appears on your rider (clothing) in its grade colour. There is no money anywhere in this: no purchases, no keys, no trading. The odds are fixed and
shown before you open. Research behind the numbers: [rewards-research.md](rewards-research.md).

```
Lobby → Cases tab      unopened cases, Open, progress to the next case, how to earn, collection %, best pull, contents and odds
Lobby → Locker tab     everything you own per slot; click to wear it (lobby rider, rides, first person);
                       "Show missing" lists the rest as silhouettes with the case and the chance per case
node web/scripts/unittest.mjs                      item data, odds simulation, pity, reel, pacing, migration, tracker, store
node web/scripts/cases-timing.mjs                  the opening at 60 fps: reel position, speed, ticks
node web/scripts/rewards-table.mjs                 the case contents as markdown (the Items section below)
node web/scripts/crateshot.mjs <url> <dir>         frame sequence of the 3D opening per case / grade + a contact sheet
                                                   (SERIES=night-park RARITY=gold ITEM=board- PERF=1 QUICK=1, see the file)
GPU=1 node web/scripts/casesshot.mjs <url> <dir>   capture the opening (SEEK=1 RARITY=epic NEAR=1 EQUIP=1, see the file)
GPU=1 node web/scripts/lobbytest.mjs <url>         end-to-end; sections 6b and 6c cover cases
GPU=1 node web/scripts/rewards-looks.mjs <url> <dir>  screenshots of the lobby rider in reward looks
```

## Files

| file | what |
|---|---|
| `web/src/profile/rarity.js` | the six grades: name, colour, drop weight, duplicate value |
| `web/src/profile/items.js` | every reward skin (clothing, gear, gold), the three case series |
| `web/src/profile/rewards.js` | pure logic: case XP, milestones, pools, odds, rolling, the reel, near misses, pity, duplicates, collection, v1 → v2 migration |
| `web/src/profile/catalog.js` | registers the items; ownership (`ownsVariant`, `unlockState(item, profile, variantId)`), the new `face` slot |
| `web/src/profile/schema.js` | profile **v2**: `inventory`, `rewards`; migration 1 → 2 |
| `web/src/profile/store.js` | `creditRun`, `grantCase`, `openCase`, `owns`, `ownedIn`, `markSeen`, `newSkins`, `collection` |
| `web/src/profile/tracker.js` | ride events → case XP; emits `runCompleted` |
| `web/src/lobby/tabs/cases.js`, `tabs/locker.js` | the two lobby tabs |
| `web/src/lobby/cases/opener.js` | the opening: overlay, reel, hold to skip, quick open / open all, reveal text, the 2D fallback |
| `web/src/lobby/cases/crate3d.js` | the 3D show on the lobby stage: three crate models, dark studio, latches, lid burst, beam, GPU particles, reveal (gear turntable / rider), camera, prewarm |
| `web/src/lobby/cases/crateTex.js` | canvas textures for the crates: plastic grain, wood planks, carbon + graffiti, egg-crate foam, the three logos |
| `web/src/lobby/cases/reelCanvas.js` | the reel on one canvas: card bitmaps rasterised once (in idle time from the Cases tab), ~10 blits per frame |
| `web/src/audio/crate.js` | 3D opening one-shots: landing thud, latch clacks, lid tension, burst, pitch-dropping ticks, charge, grade fanfares, the gold fanfare |
| `web/src/lobby/cases/timing.js` | the timeline and CS2's reel curve (shared with the timing script) |
| `web/src/lobby/cases/art.js`, `caseArt.js` | SVG item cards (slot silhouette + the skin's colours, print and finish), the case box |
| `web/src/lobby/cases/sfx.js` | synthesised sounds: ticks, latch, landing thunk, reveal stingers per grade, near-miss tease, case earned |
| `web/src/lobby/cases/notify.js` | "Case earned!" and run-progress cards (lobby and rides), tab badges |
| `web/src/character/outfits.js` | the plain `basic` (Rental) colourway, `PATTERNS`, `FINISHES`, `DECALS`, the face slot, three reward cuts |
| `web/src/character/materials.js` | prints and finishes in the fabric shader, helmet finishes and decals, goggle frame, lens rainbow, `applyLook()` |
| `web/src/equipment/specs.js`, `models.js` | the ten legendary topsheets (gold leaf, chrome, holographic, animated inferno, galaxy, aurora) |

## Grades and odds

Each case roll first picks a grade, then one item of that grade in the case, uniformly.

| grade | colour | chance | duplicate is worth |
|---|---|---|---|
| Consumer (grey) | `#b0c3d9` | 50 % | 100 XP (10 % of a case) |
| Mil-Spec (blue) | `#4b69ff` | 30 % | 150 XP |
| Restricted (purple) | `#8847ff` | 14 % | 250 XP |
| Classified (pink) | `#d32ce6` | 4.4 % | 400 XP |
| Covert (red) | `#eb4b4b` | 1.3 % | 700 XP |
| ★ Exceedingly rare (gold) | `#e4ae39` | 0.3 % (about 1 in 333 cases) | 2000 XP (two cases) |

- The colours are CS2's own grade colours. CS:GO's cases have no grey tier and step about 1:5 between
  grades (79.92 / 15.98 / 3.2 / 0.64 / 0.26 %); ours add grey and use flatter steps so a session shows
  purple and pink often. Gold stays near CS:GO's knife rate.
- **Bad-luck protection (disclosed):** if 59 cases in a row give nothing red or gold, the 60th is a
  red (Covert) item. It never forces gold. Natural red-or-better is 1.6 %, about 1 in 62; with the
  protection the measured rates over 200 000 openings are red 2.25 %, gold 0.32 % (pity fires on about
  1 % of openings). The Cases tab shows how many cases are left before it kicks in.
- **Duplicates** never waste a pull: the item's count goes up (`×2` in the Locker) and its XP goes to the
  next case, so a full case can come straight out of duplicates.
- unittest opens 200 000 simulated cases per series and checks every grade within 5 standard
  deviations of its weight, gold between 0.2 % and 0.4 % and under a third of red, and every item in a
  grade within 25 % of the others.

## Earning cases

Case XP fills a bar; every **1000 XP** is one unopened case. Cases rotate through the three series so
you see them all. Sources (`EARN` in rewards.js):

| source | XP |
|---|---|
| distance on skis or a snowboard | 40 per km |
| a finished run (the finish line, or the bottom in Challenge) of at least 500 m | 65 |
| the first such run each day | 100 |
| Challenge medal | bronze 20, silver 40, gold 60 |
| first finished run on each map | 250 (once per map) |
| first finish of each trail | 120 (once per trail) |
| distance milestones | 1 km 50, 5 km 100, 10 km 150, 25 km 250, 50 km 400, 100 km a whole case, then a case every 100 km |
| duplicates | see the grade table |
| owning every skin of a case series (gold not needed) | two whole cases, once per series |
| a new rank in the game-feel progression (levels 5, 10, 20, 35, 60; bus event `juiceLevelUp` with `rankUp`; listed in the Cases tab only when that progression is loaded) | a whole case |

**Pacing** (unittest simulates it minute by minute over 3 hours, crediting distance with each finished
run like the tracker does): a typical rider (0.7 km per minute, a finished run every 3 minutes, a second
map after 90 minutes) gets the **first case at 12 minutes** (the first-run, first-km and first-today
bonuses front-load it) and then **one every ~16 minutes**, a little faster around the distance
milestones. A slow rider (0.45 km/min, a run every 4 minutes) gets the first case at 16 minutes and then
one every ~24; a fast one (1 km/min, a run every 2 minutes) at 8 minutes and then every ~12. A run must
cover 500 m for its finish bonuses, so dropping in next to the finish (drop zones) earns only distance.
Map speeds for reference: 7–18 m/s average (docs/map2.md).

The progress bar, the last ride's gains, the next milestone and "about N km and M runs to go" are in the
Cases tab. After every finished run a small card shows `+XP` and the bar; when a case drops, a
"Case earned!" card with a rattling case appears (in the ride too) with a chime, and the Cases tab
gets a red badge.

**Hooks.** `profile/tracker.js` listens to `runComplete` (Zen finish line, main.js) and `runFinished`
(Challenge, activities.js). For each finished run it emits

```js
emit('runCompleted', { mapId, trailId, distance, time, score, mode: 'zen' | 'challenge', medal, equipment });
```

(`distance` and `time` of that run only; `trailId` = the trail board when the map has trails, else the
course key) and calls `profileStore.creditRun({ ...run, finished: true })`. Leaving the ride credits
the distance ridden since the last finish (`finished: false`).

## What makes a case opening hook (research)

How the reference games stage the moment, and what we took (sources: watching CS:GO / CS2, Fortnite STW,
Overwatch, Apex and Rocket League openings; CS2's own `popup_capability_decodable` CSS for the reel curve;
the design write-ups listed in [rewards-research.md](rewards-research.md)).

- **CS:GO / CS2.** The case model sits in the middle; you use a key, the case unlocks and opens, and a
  horizontal reel of item cards scrolls under a fixed centre marker. The reel runs about 6 s on
  `cubic-bezier(0.075, 0.82, 0.165, 1)`: three quarters of the distance in the first second (a blur), then a
  long crawl where every card is readable. A tick sounds for every card crossing the marker, so the ticks
  slow with the reel and become the tension. Cards carry a rarity colour strip (grey, blue, purple, pink,
  red, gold), so you read the grade before the name. Rare cards (red, the gold "★ Rare Special Item") pass
  under the marker during the crawl: the near miss is what people remember. The stop lands somewhere
  inside the winning card, so it can crawl to the very edge. Then the card snaps, the screen reveals the
  item big with a rarity-coloured glow, its name, wear and StatTrak line; a knife or glove gets the gold
  "exceedingly rare" treatment. Repeat openers want speed: newer CS2 versions and many community tools
  add a skip / instant open.
- **Fortnite (Save the World llamas).** A physical object you hit: the llama shakes, cracks and bursts
  into the cards, and its colour upgrades (blue → silver → gold) before it pops. The object reacting to
  you is the hook.
- **Overwatch loot boxes.** The box lands, glows, lid blows open, four items fly out with coloured
  streaks: the colour of each streak (purple, orange) tells you the grade a beat before the item lands.
  Telegraphing builds the anticipation; legendary orange gets a bigger sound.
- **Apex packs.** The pack drops into a pedestal, a beam of light rises in the colour of the best item;
  gold beams are rare enough that people clip them.
- **Rocket League crates.** A crate with a lock spins open, then a CS-style reveal; the "drop" moment
  with a rarity colour flash and a short sting.

Why it works (and what we copy): a physical moment (the object reacts to the click: drop, latches,
pressure, burst); a long, readable deceleration with audible ticks that slow down (variable-ratio
anticipation); colour codes that let you read the outcome early; rare items brushing past the marker
(near misses) without ever changing the outcome; a payoff scaled to the grade (sound, light, shake,
particles), with a unique one for the top tier; and a skip / quick-open path so the twentieth opening is
not a chore. There is no money and no keys in Sendit: the odds are fixed and shown, cases are only earned
by riding, so this is all presentation.

## The opening, frame by frame

Timeline in `lobby/cases/timing.js` (`TIMING`; `TIMING_QUICK` for quick open), visuals in
`lobby/cases/crate3d.js`, overlay and reel in `opener.js` / `reelCanvas.js`.
`node web/scripts/cases-timing.mjs` prints the reel per 60 fps frame. CS2 waits ~2 s for the case and
then scrolls 6.0 s on `cubic-bezier(0.075, 0.82, 0.165, 1)`; we fill the wait with the crate.

The crate is a real Three.js model in the lobby's own world scene (same renderer, sun, shadows, HDR
post stack and bloom), standing on the plinth where your rider was. No lights are added to the scene
(that would recompile every world shader): the inner light, seam leak, beam, rays and particles are
emissive / additive and bloom; the crate's plastic, wood and metal get a cheap view-space studio
reflection (`studio()` in crate3d.js) instead of a PMREM environment.

| time | frame (60 fps) | what you see and hear |
|---|---|---|
| 0.00 s | 0 | You press Open. The lobby panel fades out, the lights go down: a dark studio dome and floor fade over the world in 0.55 s (then the world is hidden, so the GPU only draws the crate). The camera leaves the lobby framing. The rider steps off the plinth. |
| 0.00–0.42 s | 0–25 | The crate falls onto the plinth (First Chair: blue ABS hard case with a yellow band; Night Park: black carbon with neon tubes and graffiti; Backcountry: a wooden expedition crate with steel corners and rope handles). |
| 0.42 s | 25 | Landing: squash and wobble, a snow puff ring, a soft whump + crunch, camera bump, pad rumble. The camera pushes in. |
| 0.66 s, 0.90 s | 40, 54 | Left latch, right latch snap open (spring overshoot), bright metal clacks, a few sparks, small camera kicks, phone / pad haptics. |
| 0.90–1.38 s | 54–83 | Pressure: the lid chatters up a few millimetres, light leaks from the seam and grows, the crate rattles, a hiss and a low saw climb. |
| 1.38 s | 83 | The lid bursts open past its stop and bounces back; a flash, a light beam grows out of the crate, 110 sparks fountain up, glints drift in the beam, 160 snow chunks spill over the rim; boom + whoosh + shimmer; FOV punch and shake; rumble. |
| 1.95 s | 117 | The reel band slides up out of the crate under the gold marker; the camera rises so the glowing crate sits under the reel. |
| 2.25 s | 135 | The reel starts at ~87 cards/s (speed streaks), 6.0 s on the CS2 curve. A tick per card crossing the marker (≥ 55 ms apart), bright while fast, dropping in pitch and gaining body in the crawl. The crate's light (beam, pool, plinth neon, reflections) takes the colour of the card under the marker and flickers on every tick. |
| 3.0–5.0 s | 180–300 | 74 % of the way after 1 s; red and ★ cards placed in the last 14 slide past: the marker and the crate light flare in their colour with a shimmer note (the near-miss teaser included). A tension riser runs under the crawl. |
| 8.25 s | 495 | Stop. The winner pops to 109 % and settles at 105 % with a ring and glow in its grade colour; the rest dim. The crate locks to the winner's colour. |
| 8.25–8.85 s | 495–531 | Hold: the crate light swells (more for higher grades); Classified and up add a rising swell with two heartbeat thumps. |
| 8.85 s | 531 | Reveal. **Skis / boards** rise out of the open crate and turn on a slow turntable; **clothing** appears on your rider: the crate collapses into a burst of snow and the rider stands there in the new piece, the camera framing that slot (helmet / goggles / face close-up, jacket / gloves upper body, pants full). Rarity glow, god rays (purple and up), a star flare (pink and up), a floor shockwave, a spark burst (30 for grey up to 380 for gold), confetti (pink and up), the room flashes the grade colour, the camera shakes by grade, and a fanfare that grows with the grade (2-note pluck for grey … brass stack with timpani for red). Classified and up stamp their grade name across the screen. |
| 8.85 s, gold | 531 | ★ Exceedingly rare: 0.32 s of total darkness (the crate light dies, a reverse swell), then a gold star flare, golden rays and stars, sparkles that keep raining, "★ Exceedingly rare ★" in gold, and its own fanfare: deep boom, a choir swell, a golden bell run, brass sus4 resolving to major, glitter. |
| 9.0 s+ | 540 | The text panel slides in on the right (bottom on tall screens): grade and slot, "Name \| Skin", brand · finish · pull number · this item's chance per case, stat bars for gear, NEW or the duplicate's XP, collection count, then **Equip now** · **Open another (n left)** · Close. |

- **Skip**: the Skip button or Esc jumps to the landing at once; **hold** Space / Enter / gamepad A for
  0.4 s (a ring fills the Skip button). A tap does nothing, so mashing Enter on Open never skips.
  B skips at once on a pad.
- **Quick open** (checkbox, remembered in `sendit.cases.quick`): the same beats in a third of the time
  (crate 0.85 s, reel 2.4 s).
- **Open all** (Cases tab, two or more cases): every case back to back with quick timing; after each
  reveal it opens the next one by itself after 1.7 s unless the pull is Classified or better (then it
  waits for you); Esc / B stop the auto-advance. The last reveal lists the session's pulls, rarest first.
  "Open another" from a reveal drops the next crate straight into the dark studio.
- **Equip now** wears the pull (switching skis / snowboard for gear) and closes; the camera blends back
  to the lobby over 0.65 s while the studio fades and the world returns. Without equipping, the rider's
  outfit goes back to your loadout.
- **Keys / pad**: nothing reaches the lobby while the opener is up; in the reveal Tab and the arrows (d-pad)
  cycle the buttons and Enter / Space (A) press the focused one; Esc (B) closes.
- **No spoilers**: the pull is saved the moment you click Open, but badges, toasts and the Cases tab only
  learn about it at the reveal (`profileStore.openCase(id, rng, { defer: true })` + `announce()`).
- **The reel**: 60 cards, the winner at index 50, the marker starting over card ~1.5, so ~48.5 cards pass.
  Filler cards use display weights (grey 38, blue 30, purple 18, pink 8, red 4, gold 2); the 14 cards
  before the winner always include a red, a gold ★ and a pink. Gold in the reel is the anonymous
  "★ Rare Special Item"; the actual skis or board only show at the reveal. Stop point uniformly 10–90 %
  across the winning card, as in CS2.
- **Near miss** (55 % of non-red pulls): the card next to the winner is gold (40 %), red (40 %) or one grade
  up (20 %), and the marker stops 2–9 % from the edge facing it. The outcome is rolled before the reel is
  built, so the reel never changes what you get (and goes beyond CS2, whose filler never shows the gold card).
- **Performance**: the Cases tab prewarms everything when it opens (crate models and textures, shaders
  compiled in the background for the post stack's render target, three hidden warm frames, then every
  card bitmap in idle time). The reel is one canvas (the old 60-card DOM strip made the compositor raster
  tiles mid-spin: 0.2–0.5 s stalls). While the studio is fully dark the world is hidden. Measured headless
  on the shared MacBook Air (Metal, other sessions running): ~56 fps average over a whole opening, no
  frame over 100 ms after the first; the first frame can take ~0.4 s when the pull is a garment cut the
  rider has never worn (building its geometry; the show's clock starts after it, so nothing is skipped).
- **Fallback**: if the lobby stage is not up (no WebGL stage), the old 2D case box plays with the same reel.
- `prefers-reduced-motion`: no camera drift or shake, no spinning rays, no streaks.

**Debug flags** (testing only): `?casegrant=5` adds five test cases when the Cases tab opens (rotating
series; `&caseseries=night-park` for one series); `?caseforce=gold` (or common, uncommon, rare, epic,
legendary; grey, blue, purple, pink, red) makes every opening roll that grade by picking a seeded RNG
whose normal roll lands there, and adds a case if you have none. Odds code, reel and save are untouched.

## Items

137 reward skins (37 grey, 30 blue, 27 purple, 19 pink, 14 red, 10 gold) in three cases (First Chair,
Night Park, Backcountry), plus the starter kit. Per slot: jacket 33 (three garments: Tuff Shell, Storm
Hood with the hood up, Retro One-Piece), pants 18 (Tuff Bib, Cargo Pant), helmet 18, goggles 16, face 19
(Neck Gaiter, Balaclava), gloves 15 (Tuff Mitt, Pipe Glove), skis 9 and boards 9 (4 stock models each +
5 legendary). The other four stock ski and board models (slalom, GS, powder, park; freeride, carver,
powder, park) are blue and purple drops in the First Chair and Night Park cases, with their own handling.

Looks that read in game (all shader-driven, `materials.js`): woodland camo, digital (arctic) camo,
two-tone diagonal, 90s zigzag, retro chest band, checkerboard, fade, tie-dye, paint splatter, tiger
stripes, animated flames, skull jaw on the gaiter, topographic contours; finishes metallic (Gold Lamé),
retro-reflective (Flashbulb flares toward the light), iridescent (Hologram), neon glow (Hyperwave,
Glowstick), gloss; helmets gloss, carbon weave, pearl, mirror chrome, gold chrome, racing stripe, hot-rod
flames, stars; goggles with coloured frames and rainbow (oil-slick) lenses. One-pieces dress the legs
too. Legendary topsheets: brushed and engraved gold leaf with light sweeps, mirror chrome reflecting
sky and horizon, holographic foil, animated inferno flames, a twinkling galaxy, moving aurora ribbons.

The full list with odds is generated by `node web/scripts/rewards-table.mjs`:

<!-- rewards-table -->
### First Chair Case

| Grade | Odds | Items |
|---|---|---|
| Consumer | 50 % | Tuff Shell | Tuff, Tuff Shell | Nightshift, Tuff Shell | Forest, Storm Hood | Tuff, Tuff Bib | Tuff, Tuff Bib | Nightshift, Tuff Bib | Navy, Tuff Helmet | Tuff, Tuff Helmet | Matte Navy, Tuff Goggle | Amber, Tuff Goggle | Night Clear, Neck Gaiter | Topo (topo), Neck Gaiter | Nightshift (topo), Neck Gaiter | Heather, Tuff Mitt | Tuff, Tuff Mitt | Summit Crew, Tuff Mitt | Black Leather |
| Mil-Spec | 30 % | Tuff Shell | Summit Crew, Storm Hood | Summit Crew, Tuff Bib | Summit Crew, Tuff Helmet | Nightshift, Tuff Helmet | Summit Crew, Tuff Goggle | Acid Mint, Tuff Goggle | Sapphire, Neck Gaiter | Summit Crew (topo), Neck Gaiter | Woodland (camo), Balaclava | Whiteout (digital), Tuff Mitt | Nightshift, Valcrest SL Race 165 | Race Yellow, Valcrest Steeple 161 | Bone |
| Restricted | 14 % | Tuff Shell | Woodland (camo), Tuff Shell | Glacier (digital, gloss), Storm Hood | Blaze (diagonal), Tuff Bib | Woodland (camo), Tuff Bib | Arctic Camo (digital), Tuff Helmet | Racing Stripe (gloss, decal stripe), Tuff Goggle | Rose Gold (iridescent lens), Tuff Goggle | Emerald (iridescent lens), Tuff Mitt | Woodland (camo), Driftline Float 186 | Lagoon, Northwake Edge 163 | Ice |
| Classified | 4.4 % | Tuff Shell | Heritage (band, matte), Storm Hood | Arctic Camo (digital), Tuff Bib | Heritage (band), Tuff Helmet | Carbon (carbon), Tuff Helmet | Hot Rod (gloss, decal flames), Tuff Goggle | Oil Slick (iridescent lens), Neck Gaiter | Skull Jaw (skull) |
| Covert | 1.3 % | Tuff Shell | Gold Lamé (metallic), Storm Hood | Molten (flames, neon), Retro One-Piece | Miami '92 (zigzag, one-piece), Tuff Helmet | Chrome (chrome), Tuff Goggle | Black Gold (iridescent lens), Tuff Mitt | Gold Lamé (metallic) |

### Night Park Case

| Grade | Odds | Items |
|---|---|---|
| Consumer | 50 % | Storm Hood | Nightshift, Cargo Pant | Charcoal, Cargo Pant | Sand, Cargo Pant | Olive, Tuff Helmet | Arcade, Tuff Goggle | Ultraviolet, Neck Gaiter | Blackout, Neck Gaiter | Arcade (topo), Balaclava | Charcoal, Tuff Mitt | Arcade, Pipe Glove | Black, Pipe Glove | White |
| Mil-Spec | 30 % | Tuff Shell | Arcade, Tuff Shell | Bubblegum, Storm Hood | Arcade, Tuff Bib | Arcade, Cargo Pant | Urban Camo (camo), Tuff Helmet | Lime Gloss (gloss), Tuff Goggle | Hi-Vis, Neck Gaiter | Checkerboard (checker), Pipe Glove | Hi-Vis, Jibworks Twin 168 | Bubblegum, Jibworks Butter 152 | Lemonade |
| Restricted | 14 % | Tuff Shell | Board Shop (checker), Storm Hood | Sunset Fade (fade), Cargo Pant | Tie-Dye (tiedye), Tuff Helmet | Starfield (gloss, decal stars), Tuff Helmet | Finish Line (gloss, decal checker), Tuff Goggle | Toxic (iridescent lens), Neck Gaiter | Night Sky (stars), Balaclava | Tiger (tiger), Pipe Glove | Checker (checker), Valcrest GS Race 188 | Team White, Driftline Fish 158 | Seafoam |
| Classified | 4.4 % | Tuff Shell | Flashbulb (reflective), Storm Hood | Bengal (tiger), Retro One-Piece | Ice Cream (band, one-piece), Cargo Pant | Paintball (splatter), Tuff Helmet | Pearl (pearl), Tuff Goggle | Laser (iridescent lens), Balaclava | Inferno (flames), Pipe Glove | Glowstick (stripes, neon) |
| Covert | 1.3 % | Storm Hood | Hologram (iridescent), Retro One-Piece | Hyperwave (zigzag, neon, one-piece), Tuff Helmet | Gold Chrome (chrome), Neck Gaiter | Glow Skull (skull) |

### Backcountry Case

| Grade | Odds | Items |
|---|---|---|
| Consumer | 50 % | Tuff Shell | Expedition Red, Tuff Bib | Charcoal, Cargo Pant | Khaki, Tuff Helmet | Beacon Orange (gloss), Tuff Goggle | Persimmon, Neck Gaiter | Topo Olive (topo), Tuff Mitt | Saddle, Pipe Glove | Wool Grey |
| Mil-Spec | 30 % | Storm Hood | Glacier Blue, Tuff Bib | Avalanche, Tuff Helmet | Summit Stars (decal stars), Tuff Goggle | Ice Blue, Neck Gaiter | Blaze, Tuff Mitt | Expedition |
| Restricted | 14 % | Tuff Shell | Topo Map (topo), Storm Hood | Whiteout (digital), Cargo Pant | Desert Camo (camo), Tuff Goggle | Amber Iridium (iridescent lens), Balaclava | Bivouac (stars) |
| Classified | 4.4 % | Tuff Shell | Beacon (reflective), Retro One-Piece | Alpine '78 (band, one-piece), Tuff Helmet | Bronze (metallic), Balaclava | Yeti Skull (skull) |
| Covert | 1.3 % | Storm Hood | Northern Lights (fade, iridescent), Retro One-Piece | Expedition '86 (zigzag, metallic, one-piece), Tuff Helmet | Copper Chrome (chrome), Tuff Goggle | Aurora (iridescent lens) |

### ★ Exceedingly rare (in every case, 0.3 %)

- ★ Ridge 172 | Gold Leaf (skis, `gold-leaf`)
- ★ SL Race 165 | Mirror Chrome (skis, `chrome`)
- ★ Twin 168 | Holographic (skis, `holo`)
- ★ GS Race 188 | Inferno (skis, `inferno`)
- ★ Float 186 | Galaxy (skis, `galaxy`)
- ★ Atlas 156 | Gold Leaf (board, `gold-leaf`)
- ★ Edge 163 | Mirror Chrome (board, `chrome`)
- ★ Butter 152 | Holographic (board, `holo`)
- ★ Steeple 161 | Inferno (board, `inferno`)
- ★ Fish 158 | Aurora (board, `aurora`)

Each gold item has its base model's shape and handling.
<!-- /rewards-table -->

## Profile v2

```js
inventory: { items: { 'jacket-tuff-shell:woodland': { at, n, seen } } },   // n = copies (duplicates), seen = NEW marker cleared
rewards: {
  xp, xpTotal,            // progress to the next case (0..999), lifetime
  cases: [{ id, series, at, source }],   // unopened; source: run | distance | duplicate | welcome | veteran | milestone | test
  earned, opened, seq, distance, distanceBy: { skis, snowboard }, milestone,
  maps: [], trails: [],   // first-run bonuses already paid
  history: [{ at, key, rarity, dupe, series }],   // last 40 pulls
  best, dupeXp, sinceRed, // rarest pull, XP from duplicates, openings since the last red / gold (pity)
}
```

- **Migration 1 → 2.** A new profile (v0) starts with nothing but the starter kit. A rider from before
  the case system keeps every skin they were wearing (it goes into the inventory, already seen), keeps
  the gaiter their jacket's colourway came with (as a face skin, equipped), gets
  one **welcome** First Chair case and up to three **veteran** cases for the riding they already did
  (lifetime km and finished runs at today's rates). Their lifetime distance counts toward the next
  milestone without back pay.
- `sanitize()` checks every inventory key against the catalog and drops equipped skins you do not own
  (the slot falls back to its starter), so a hand-edited save cannot wear what it has not earned.
- The new `face` slot (Neck Gaiter / Balaclava) fills from the starter for old profiles.

## How to add items

Add a variant to an item in `web/src/profile/items.js`:

```js
{ id: 'glacier', name: 'Glacier', rarity: 'rare', series: 'first-chair',
  colors: { base: '#dff3ff', panel: '#7fb8e6', accent: '#1b4f8a', gaiter: '#7fb8e6', style: 0,
            pat: 'digital', patA: '#a9cfee', patB: '#5d8fbf', patScale: 1, finish: 'gloss' } },
```

- `colors` uses the slot's colour fields (`COLORWAYS` in outfits.js lists them) plus the look fields:
  `pat` (PATTERNS), `patA` / `patB` / `patScale`, `finish` (FINISHES), on helmets `decal` (DECALS) and
  `decalCol`, on goggles `frame` and `iri` (0..1), on jackets `onePiece: true`. Anything not given comes
  from the plain Rental colourway.
- A new garment shape: add it to `GARMENTS` in outfits.js (copy a cut and change it), then a new item in
  `CLOTHING_ITEMS` with `garment: '<id>'`.
- New skis or a board: a spec in `equipment/specs.js` (copy a model; set `graphic.pattern` to a
  topsheet pattern), then an entry in `GEAR_ITEMS` (or `GOLD_ITEMS` for the gold tier).
- A new case: add it to `SERIES` and `SERIES_ORDER` and give items `series: '<id>'`. Every case needs at
  least one item per grade (unittest checks it); gold items use `series: '*'` and drop from every case.
- Run `node web/scripts/unittest.mjs` (odds, reachability) and `node web/scripts/rewards-table.mjs`, then
  paste the table into this file.

## Known issues and limits

- (Before the 3D crate) The world kept rendering under the opening overlay. In headless runs on the shared GPU (other
  sessions benchmarking at the same time) the reel ran well below the lobby's frame rate with stalls of
  0.4–2 s that we could not pin on one element: hiding the card art, the streaks or the audio changed
  nothing reliably, while an empty overlay ran at 60 fps. The opener's own work per frame is under
  0.6 ms and the stalls are not main-thread long tasks, so they sit in compositing / the GPU; some
  openings ran at 57 fps with a 117 ms worst frame. A warm-up pass did not help and was dropped. Three real costs were removed (a mask-image
  that re-rastered the cards, a CSS variable that restyled them every frame, a forced reflow per tick).
  The reel is time-based, so timing and the landing stay exact at any frame rate; it still needs a check
  on a quiet machine, and pausing the world render while the overlay covers it (main.js) would help.
- The first opening of a garment cut the rider has never worn waits ~0.3–0.5 s after the click while
  the rider's outfit geometry is built (character/ code, not touched here).
- The crate's shadows use the world's 70 m sun shadow box, so they are soft; the studio has no real
  lights (by design, see above), so the crate is sun-lit plus emissive glow.
- Item cards are flat SVG drawings in the item's colours and print, not renders of the 3D garment.
  Prints on the card are approximations of the shader prints.
- New garment cuts (Retro One-Piece, Cargo Pant, Pipe Glove) are small variations of the existing cuts:
  slimmer ease, a shorter gauntlet. The one-piece is a jacket whose colours and print also dress the
  pants; there is no separate belted suit mesh.
- The Character tab (free colourway picker) is no longer registered; the Locker replaces it. Its file
  is still there.
- The face slot is a print on the existing gaiter tube; the Balaclava looks like a gaiter pulled up
  (the head is under the helmet anyway).
- Odds are per case, not per item: a grade with fewer items gives each item a higher chance (the
  contents panel shows "% each").
- No trading or selling; the 3D view of a pull is only in the reveal (gear on a turntable, clothing on
  the rider); the Locker previews on the lobby rider and the Cases tab shows
  your best pull.
- A case only drops from the three series; there is no choosing which case to earn. Rank-up cases need
  the game-feel progression branch (`juiceLevelUp`); without it that source is simply silent.
- Headless captures on a busy GPU run the lobby at a few fps; `casesshot.mjs SEEK=1` freezes the show at
  exact times for screenshots, and `cases-timing.mjs` gives the exact 60 fps numbers.
