# Sendit rewards: cases, the Locker and earned gear

You start in plain grey rental kit on the stock skis and board. Everything else comes out of **cases**,
and you earn cases only by riding: finishing runs and covering distance. A case opens like a CS:GO
weapon case: the box pops open, a reel of item cards spins past a gold marker and slows to a crawl,
it stops on one item (often a hair away from something rarer), and the item is revealed in its grade
colour. There is no money anywhere in this: no purchases, no keys, no trading. The odds are fixed and
shown before you open. Research behind the numbers: [rewards-research.md](rewards-research.md).

```
Lobby → Cases tab      unopened cases, Open, progress to the next case, how to earn, collection %, best pull, contents and odds
Lobby → Locker tab     everything you own per slot; click to wear it (lobby rider, rides, first person);
                       "Show missing" lists the rest as silhouettes with the case and the chance per case
node web/scripts/unittest.mjs                      item data, odds simulation, pity, reel, pacing, migration, tracker, store
node web/scripts/cases-timing.mjs                  the opening at 60 fps: reel position, speed, ticks
node web/scripts/rewards-table.mjs                 the case contents as markdown (the Items section below)
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
| `web/src/lobby/cases/opener.js` | the opening overlay: case box, reel, hold, reveal, particles |
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
| a new rank in the game-feel progression (levels 5, 10, 20, 35, 60; bus event `juiceLevelUp` with `rankUp`) | a whole case |

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

## The opening, frame by frame

Timeline in `lobby/cases/timing.js`; `node web/scripts/cases-timing.mjs` prints it per 60 fps frame.
CS2's client waits ~2 s for the case and then scrolls 6.0 s on `cubic-bezier(0.075, 0.82, 0.165, 1)`
(its own `popup_capability_decodable.css`), and that is what we use.

| time | frame (60 fps) | what you see and hear |
|---|---|---|
| 0.00 s | 0 | Lobby dims to near black (a radial vignette; the world still moves faintly behind). "Unlocking First Chair Case". The case drops in with an overshoot (0.45 s) and two latch clunks (0 s, 0.45 s). |
| 0.35–0.90 s | 21–54 | The case rattles (±4° wobble, decaying). A filtered-noise whoosh starts rising at 0.6 s. |
| 1.00 s | 60 | The lid flips open (0.5 s, overshoot), a white-to-accent light bursts from inside and swells. |
| 1.60 s | 96 | The case lifts up and fades; the reel band scales in under a gold marker with top and bottom arrows. |
| 2.00 s | 120 | The reel starts at ~87 cards/s: a smear with speed streaks, ticks every 55–70 ms (the tick rate is capped). |
| 2.20 s | 132 | 15 of ~48.5 cards gone, 56 cards/s. |
| 2.40 s | 144 | 24 cards, 34 cards/s; cards become readable. |
| 3.00 s | 180 | 36 cards (74 %), 12 cards/s; streaks fade out; the red and gold cards placed in the last 14 cards scroll past. |
| 3.80 s | 228 | A quiet tension riser starts (a sine climbing a fifth plus a rising filtered-noise swell) and runs until the landing. |
| 4.00 s | 240 | 43.6 cards (90 %), 4.3 cards/s; ticks ~230 ms apart. |
| 5.00 s | 300 | 46.5 cards, 1.9 cards/s; ticks ~500 ms apart. |
| 5.30 s | 318 | The marker starts to breathe (a slow glow pulse) for the rest of the crawl. |
| 6.00 s | 360 | 47.8 cards, 0.8 cards/s: the crawl. A rarer neighbour creeps toward or away from the marker. |
| 7.00 s | 420 | 48.4 cards, 0.3 cards/s. On a near miss the rare card is still touching the marker; a soft high "tease" note plays as it crosses. |
| 8.00 s | 480 | Stop. Landing thunk. The other cards dim to 45 %, the winner pops to 109 % and settles at 105 % with a rarity-coloured ring. |
| 8.60 s | 516 | Reveal: the screen flashes the grade colour, conic rays spin behind a big card that pops in (0.55 s overshoot), particles burst (40 for grey up to 320 for gold, gold adds spinning stars), the grade stinger plays (2 notes for grey up to an 8-note fanfare with a bass hit and bells for gold), and the screen shakes for pink, red and gold. Red and gold cards get a moving shine. |
| 8.75 s+ | 525 | Grade and slot ("CLASSIFIED · HELMET"), "Tuff Helmet \| Carbon", NEW or the duplicate's XP, collection count, then **Equip now** · **Open next (n left)** · Close. |

- **The reel**: 60 cards, the winner at index 50, the marker starting over card ~1.5, so ~48.5 cards
  pass. Filler cards use display weights (grey 38, blue 30, purple 18, pink 8, red 4, gold 2), so the
  whole ladder shows up; the 14 cards before the winner always include a red, a gold ★ and a pink. Gold
  in the reel is always the anonymous "★ Rare Special Item" card; the actual skis or board only show
  at the reveal.
- **Stop point**: uniformly 10–90 % across the winning card, as in CS2.
- **Near miss** (55 % of non-red pulls): the card next to the winner is gold (40 %), red (40 %) or one
  grade up (20 %), and the marker stops 2–9 % from the edge facing it: either the rare card has *just*
  slid past (60 %) or it stopped *just* short (40 %).
  This deliberately goes beyond CS2, whose filler never contains the gold card; the brief asked for
  the visible gold slot and near misses. The outcome is rolled before the reel is built, so the reel
  never changes what you get.
- **Ticks**: one per card crossing the marker, at least 55 ms apart, brighter while fast. Gaps grow
  from 67 ms to 230 ms (4 s), 450 ms and 680 ms (the last crossings).
- **The lens**: a faintly brighter strip around the marker, like CS2's sharp centre over a dimmer reel.
- **Rare cards passing**: from 3.5 s on, every red or ★ card that slides under the marker flashes it in
  that colour with a soft shimmer note (the near-miss teaser included).
- **Rumble** (gamepad): a light buzz per card once the reel is readable, a thump at the landing, and a
  reveal kick that grows with the grade (up to ~0.6 s for gold).
- **Skip**: Space or the Skip button jumps straight to the reveal. Esc closes the reveal. While the
  overlay is up the lobby's own keys (Q/E, A/D, Enter) are held back.
- **Gamepad**: the opener takes the pad first (`Lobby.overlay`): A skips the spin or presses the focused
  button, the d-pad moves between Equip now / Open next / Close, B closes.
- **Equip now** wears the pull at once (switching skis and snowboard for gear) and closes; it is offered
  for a duplicate too when you are not wearing it. **Open next** chains straight into the next case.
- `prefers-reduced-motion`: no streaks, no shake, no bobbing case, no spinning rays.

## Items

132 reward skins (35 grey, 29 blue, 27 purple, 19 pink, 12 red, 10 gold) in three cases (First Chair,
Night Park, Backcountry), plus the starter kit. Per slot: jacket 32 (three garments: Tuff Shell, Storm
Hood with the hood up, Retro One-Piece), pants 18 (Tuff Bib, Cargo Pant), helmet 18, goggles 15, face 16
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
| Consumer | 50 % | Tuff Shell | Tuff, Tuff Shell | Nightshift, Tuff Shell | Forest, Storm Hood | Tuff, Tuff Bib | Tuff, Tuff Bib | Nightshift, Tuff Bib | Navy, Tuff Helmet | Tuff, Tuff Helmet | Matte Navy, Tuff Goggle | Amber, Tuff Goggle | Night Clear, Neck Gaiter | Topo (topo), Neck Gaiter | Heather, Tuff Mitt | Tuff, Tuff Mitt | Summit Crew, Tuff Mitt | Black Leather |
| Mil-Spec | 30 % | Tuff Shell | Summit Crew, Storm Hood | Summit Crew, Tuff Bib | Summit Crew, Tuff Helmet | Nightshift, Tuff Helmet | Summit Crew, Tuff Goggle | Acid Mint, Tuff Goggle | Sapphire, Neck Gaiter | Woodland (camo), Balaclava | Whiteout (digital), Tuff Mitt | Nightshift, Valcrest SL Race 165 | Race Yellow, Valcrest Steeple 161 | Bone |
| Restricted | 14 % | Tuff Shell | Woodland (camo), Tuff Shell | Glacier (digital, gloss), Storm Hood | Blaze (diagonal), Tuff Bib | Woodland (camo), Tuff Bib | Arctic Camo (digital), Tuff Helmet | Racing Stripe (gloss, decal stripe), Tuff Goggle | Rose Gold (iridescent lens), Tuff Goggle | Emerald (iridescent lens), Tuff Mitt | Woodland (camo), Driftline Float 186 | Lagoon, Northwake Edge 163 | Ice |
| Classified | 4.4 % | Tuff Shell | Heritage (band, matte), Storm Hood | Arctic Camo (digital), Tuff Bib | Heritage (band), Tuff Helmet | Carbon (carbon), Tuff Helmet | Hot Rod (gloss, decal flames), Tuff Goggle | Oil Slick (iridescent lens), Neck Gaiter | Skull Jaw (skull) |
| Covert | 1.3 % | Tuff Shell | Gold Lamé (metallic), Storm Hood | Molten (flames, neon), Retro One-Piece | Miami '92 (zigzag, one-piece), Tuff Helmet | Chrome (chrome), Tuff Goggle | Black Gold (iridescent lens), Tuff Mitt | Gold Lamé (metallic) |

### Night Park Case

| Grade | Odds | Items |
|---|---|---|
| Consumer | 50 % | Storm Hood | Nightshift, Cargo Pant | Charcoal, Cargo Pant | Sand, Cargo Pant | Olive, Tuff Helmet | Arcade, Tuff Goggle | Ultraviolet, Neck Gaiter | Blackout, Balaclava | Charcoal, Tuff Mitt | Arcade, Pipe Glove | Black, Pipe Glove | White |
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
| Covert | 1.3 % | Storm Hood | Northern Lights (fade, iridescent), Tuff Helmet | Copper Chrome (chrome) |

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
  the case system keeps every skin they were wearing (it goes into the inventory, already seen), gets
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

- The world keeps rendering under the opening overlay. On a busy GPU the reel can drop frames; its
  position is time-based, so the timing and the landing stay exact, and ticks never fire faster than
  every 55 ms.
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
- No trading, selling or 3D inspect view; the Locker previews on the lobby rider and the Cases tab shows
  your best pull.
- A case only drops from the three series; there is no choosing which case to earn. Rank-up cases need
  the game-feel progression branch (`juiceLevelUp`); without it that source is simply silent.
- Headless captures on a busy GPU run the lobby at a few fps; `casesshot.mjs SEEK=1` freezes the show at
  exact times for screenshots, and `cases-timing.mjs` gives the exact 60 fps numbers.
