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
node web/scripts/iconsheet.mjs <url> <dir>          contact sheet of every item icon by series and grade (DUMP=1 raw icons, FLAT=1 old art, ONLY=jacket-,skis)
node web/scripts/iconflow.mjs <url> <dir>           icons in the flow: Cases tab, contents, reel, gold reveal, Locker, Equipment
node web/scripts/tilesheet.mjs <url> <dir>          item tiles: the reel at four speeds per case, contents grids, Locker per slot (FLAT=1 old art)
node web/scripts/crateshot.mjs <url> <dir>         frame sequence of the 3D opening per case / grade + a contact sheet
                                                   (SERIES=night-park RARITY=gold ITEM=board- PERF=1 QUICK=1, see the file;
                                                   MATRIX=1 every case x grade, CHAIN=1 "Open all", FLOW=2 with ?caseforce)
GPU=1 node web/scripts/casesshot.mjs <url> <dir>   capture the opening (SEEK=1 RARITY=epic NEAR=1 EQUIP=1, see the file)
GPU=1 node web/scripts/lobbytest.mjs <url>         end-to-end; sections 6b and 6c cover cases (macOS: ANGLE=metal)
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
| `web/src/lobby/cases/itemIcons.js`, `iconBaker.js`, `icons.css` | rendered 3D item icons: queue, cache (memory + IndexedDB), the baker (see "Item icons") |
| `web/src/lobby/cases/art.js`, `caseArt.js` | flat SVG item art (the placeholder until an icon is baked, and silhouettes of missing skins), the case box |
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
  compiled in the background for the post stack's render target, three hidden warm frames, then the
  reel card bitmaps of the cases you hold, in idle time). The reel is one canvas (the old 60-card DOM strip made the compositor raster
  tiles mid-spin: 0.2–0.5 s stalls). While the studio is fully dark the world is hidden. Measured headless
  on the shared MacBook Air (Metal, other sessions running, `crateshot.mjs PERF=1`): 57–60 fps average
  over a whole opening (680 frames), worst frame 83 ms, prewarm 0.3–0.8 s in the background; before the
  canvas reel and the render-target compile the same run had 1.5–3 s stalls. The click can take ~0.4 s
  before the first frame when the pull is a garment cut the rider has never worn (building its geometry;
  the show's clock starts after it, so nothing is skipped).
- **Fallback**: if the lobby stage is not up (no WebGL stage), the old 2D case box plays with the same reel.
- `prefers-reduced-motion`: no camera drift or shake, no spinning rays, no streaks.

**Debug flags** (testing only): `?casegrant=5` adds five test cases when the Cases tab opens (rotating
series; `&caseseries=night-park` for one series); `?caseforce=gold` (or common, uncommon, rare, epic,
legendary; grey, blue, purple, pink, red) makes every opening roll that grade by picking a seeded RNG
whose normal roll lands there, and adds a case if you have none. Odds code, reel and save are untouched.

## Items

209 reward skins (64 grey, 51 blue, 44 purple, 26 pink, 14 red, 10 gold) in three cases (First Chair,
Night Park, Backcountry), plus the starter kit. Per slot: jacket 75 (thirteen garments: Tuff Shell, Storm
Hood with the hood up, Retro One-Piece, Ridge Shell, Tall Anorak, Cloud Puffer, Layer Hoodie and round 2's
Sherpa Flannel, Insulated Freedom, Alpine Hardshell, Varsity Coach, Duck Canvas Work, Mocha Puffer), pants
48 (Tuff Bib, Cargo Pant, Wide Pant and round 2's Baggy Pant, Relaxed Cargo, Big Stack Pant, Coach Bib,
Carpenter Pant, Camo Cargo), helmet 18, goggles 16, face 19 (Neck Gaiter, Balaclava), gloves 15 (Tuff Mitt,
Pipe Glove), skis 9 and boards 9 (4 stock models each + 5 legendary). The other four stock ski and board
models (slalom, GS, powder, park; freeride, carver, powder, park) are blue and purple drops in the First
Chair and Night Park cases, with their own handling. Every jacket is cut on the round-2 shape on the
in-between body (docs/character.md § Catalogue jackets).

Looks that read in game (all shader-driven, `materials.js`): woodland camo, digital (arctic) camo,
two-tone diagonal, retro chest band, checkerboard, fade, tie-dye, paint splatter, tiger stripes, animated
flames, skull jaw on the gaiter, topographic contours, flannel plaid, duck canvas, wool and twill weaves,
quilted baffles; neon glow on two skins (Molten, Glowstick); helmets gloss, carbon weave, pearl, mirror
chrome, gold chrome, racing stripe, hot-rod flames, stars; goggles with coloured frames and rainbow
(oil-slick) lenses. Clothing is matte (§ Retired skins). One-pieces dress the legs too. Legendary
topsheets: brushed and engraved gold leaf with light sweeps, mirror chrome reflecting sky and horizon,
holographic foil, animated inferno flames, a twinkling galaxy, moving aurora ribbons.

### Retired skins (October 2026) and how saves migrate

The user removed every shiny clothing skin (metallic, retro-reflective, iridescent, gloss finishes) and
every zig-zag one. Helmets keep their gloss / chrome / pearl (hard shells, not clothing), skis and boards
keep their topsheets, and the two neon-glow skins stay (a glow, not a shine). The skins are gone from the
catalogue and the cases; a rider who owned one gets a **new matte skin of the same grade from the same
case** instead (`RETIRED_SKINS` in `profile/items.js`, applied by `schema.js sanitize()` on every load,
so it needs no version bump and is idempotent):

| retired skin | grade, case | why | becomes |
|---|---|---|---|
| Tuff Shell \| Flashbulb | Classified, Night Park | reflective | Alpine Hardshell \| Ember |
| Tuff Shell \| Gold Lamé | Covert, First Chair | metallic | Sherpa Flannel \| Buffalo Rust |
| Tuff Shell \| Glacier | Restricted, First Chair | gloss | Alpine Hardshell \| Glacier |
| Tuff Shell \| Beacon | Classified, Backcountry | reflective | Mocha Puffer \| Sage |
| Storm Hood \| Hologram | Covert, Night Park | iridescent | Insulated Freedom \| Saffron Yoke |
| Storm Hood \| Northern Lights | Covert, Backcountry | iridescent | Alpine Hardshell \| Spruce |
| Retro One-Piece \| Miami '92 | Covert, First Chair | zig-zag | Varsity Coach \| Letterman |
| Retro One-Piece \| Hyperwave | Covert, Night Park | zig-zag, neon | Mocha Puffer \| Mocha |
| Retro One-Piece \| Expedition '86 | Covert, Backcountry | zig-zag, metallic | Duck Canvas Work \| Brown Duck |
| Cloud Puffer \| Midnight Gloss | Mil-Spec, Night Park | gloss | Mocha Puffer \| Matte Black |
| Cloud Puffer \| Silver Lining | Classified, First Chair | metallic | Duck Canvas Work \| Black Duck |
| Tuff Mitt \| Gold Lamé | Covert, First Chair | metallic (matches the jacket) | Tuff Mitt \| Sherpa Cuff |

- The inventory key is rewritten (owning both adds the copies; the new one shows as NEW in the Locker).
- An equipped retired skin is replaced by its replacement in the loadout (so the rider keeps a skin of
  the same grade on); one that is somehow not owned falls back to the slot's starter like any invalid save.
- Case history and "best pull" entries point at the replacement, so the Cases tab never shows a missing card.
- Collections: a series someone had completed stays paid; the new skins simply make it incomplete again.
- Tested in `unittest.mjs` ("retired skins …").

The full list with odds is generated by `node web/scripts/rewards-table.mjs`:

<!-- rewards-table -->
### First Chair Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Tuff Shell \| Tuff, Tuff Shell \| Nightshift, Tuff Shell \| Forest, Storm Hood \| Tuff, Ridge Shell \| Stratus, Tall Anorak \| Sage, Cloud Puffer \| Butter, Layer Hoodie \| Olive Drab, Alpine Hardshell \| Stone, Varsity Coach \| Charcoal, Duck Canvas Work \| Chalk, Tuff Bib \| Tuff, Tuff Bib \| Nightshift, Tuff Bib \| Navy, Wide Pant \| Charcoal, Baggy Pant \| Charcoal, Relaxed Cargo \| Olive, Coach Bib \| Charcoal, Camo Cargo \| Olive Drab, Tuff Helmet \| Tuff, Tuff Helmet \| Matte Navy, Tuff Goggle \| Amber, Tuff Goggle \| Night Clear, Neck Gaiter \| Topo (topo), Neck Gaiter \| Nightshift (topo), Neck Gaiter \| Heather, Tuff Mitt \| Tuff, Tuff Mitt \| Summit Crew, Tuff Mitt \| Black Leather |
| Mil-Spec (uncommon) | 30 % | Tuff Shell \| Summit Crew, Storm Hood \| Summit Crew, Ridge Shell \| Forage, Layer Hoodie \| Rust, Sherpa Flannel \| Mustard Plaid, Tuff Bib \| Summit Crew, Big Stack Pant \| Sage, Carpenter Pant \| Brown Duck, Tuff Helmet \| Nightshift, Tuff Helmet \| Summit Crew, Tuff Goggle \| Acid Mint, Tuff Goggle \| Sapphire, Neck Gaiter \| Summit Crew (topo), Neck Gaiter \| Woodland (camo), Balaclava \| Whiteout (digital), Tuff Mitt \| Nightshift, Valcrest SL Race 165 \| Race Yellow, Valcrest Steeple 161 \| Bone |
| Restricted (rare) | 14 % | Tuff Shell \| Woodland (camo), Storm Hood \| Blaze (diagonal), Tall Anorak \| Navy Blaze, Alpine Hardshell \| Glacier, Mocha Puffer \| Cream, Tuff Bib \| Woodland (camo), Tuff Bib \| Arctic Camo (digital), Wide Pant \| Woodland (camo), Relaxed Cargo \| Rust, Tuff Helmet \| Racing Stripe (gloss, decal stripe), Tuff Goggle \| Rose Gold (iridescent lens), Tuff Goggle \| Emerald (iridescent lens), Tuff Mitt \| Woodland (camo), Driftline Float 186 \| Lagoon, Northwake Edge 163 \| Ice |
| Classified (epic) | 4.4 % | Tuff Shell \| Heritage (band, matte), Storm Hood \| Arctic Camo (digital), Insulated Freedom \| Expedition, Duck Canvas Work \| Black Duck, Tuff Bib \| Heritage (band), Coach Bib \| Brick, Camo Cargo \| Desert Camo (camo), Tuff Helmet \| Carbon (carbon), Tuff Helmet \| Hot Rod (gloss, decal flames), Tuff Goggle \| Oil Slick (iridescent lens), Neck Gaiter \| Skull Jaw (skull) |
| Covert (legendary) | 1.3 % | Storm Hood \| Molten (flames, neon), Sherpa Flannel \| Buffalo Rust, Varsity Coach \| Letterman, Tuff Helmet \| Chrome (chrome), Tuff Goggle \| Black Gold (iridescent lens), Tuff Mitt \| Sherpa Cuff |

### Night Park Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Storm Hood \| Nightshift, Tall Anorak \| Bone, Layer Hoodie \| Heather, Sherpa Flannel \| Ash Plaid, Cargo Pant \| Charcoal, Cargo Pant \| Sand, Cargo Pant \| Olive, Wide Pant \| Bone, Relaxed Cargo \| Black, Big Stack Pant \| Dark Olive, Carpenter Pant \| Chalk, Tuff Helmet \| Arcade, Tuff Goggle \| Ultraviolet, Neck Gaiter \| Blackout, Neck Gaiter \| Arcade (topo), Balaclava \| Charcoal, Tuff Mitt \| Arcade, Pipe Glove \| Black, Pipe Glove \| White |
| Mil-Spec (uncommon) | 30 % | Tuff Shell \| Arcade, Tuff Shell \| Bubblegum, Storm Hood \| Arcade, Ridge Shell \| Black Sapphire, Tall Anorak \| Lilac Haze, Cloud Puffer \| Blush, Insulated Freedom \| Bone, Mocha Puffer \| Matte Black, Tuff Bib \| Arcade, Cargo Pant \| Urban Camo (camo), Wide Pant \| Washed Denim, Baggy Pant \| Bone, Coach Bib \| Forest, Camo Cargo \| Urban Camo (camo), Tuff Helmet \| Lime Gloss (gloss), Tuff Goggle \| Hi-Vis, Neck Gaiter \| Checkerboard (checker), Pipe Glove \| Hi-Vis, Jibworks Twin 168 \| Bubblegum, Jibworks Butter 152 \| Lemonade |
| Restricted (rare) | 14 % | Tuff Shell \| Board Shop (checker), Storm Hood \| Sunset Fade (fade), Layer Hoodie \| Acid, Sherpa Flannel \| Midnight Plaid, Varsity Coach \| Navy, Duck Canvas Work \| Moss, Cargo Pant \| Tie-Dye (tiedye), Big Stack Pant \| Lilac, Carpenter Pant \| Black Duck, Tuff Helmet \| Starfield (gloss, decal stars), Tuff Helmet \| Finish Line (gloss, decal checker), Tuff Goggle \| Toxic (iridescent lens), Neck Gaiter \| Night Sky (stars), Balaclava \| Tiger (tiger), Pipe Glove \| Checker (checker), Valcrest GS Race 188 \| Team White, Driftline Fish 158 \| Seafoam |
| Classified (epic) | 4.4 % | Storm Hood \| Bengal (tiger), Retro One-Piece \| Ice Cream (band, one-piece), Tall Anorak \| Swirl (tiedye), Alpine Hardshell \| Ember, Varsity Coach \| Black & Bone, Cargo Pant \| Paintball (splatter), Tuff Helmet \| Pearl (pearl), Tuff Goggle \| Laser (iridescent lens), Balaclava \| Inferno (flames), Pipe Glove \| Glowstick (stripes, neon) |
| Covert (legendary) | 1.3 % | Insulated Freedom \| Saffron Yoke, Mocha Puffer \| Mocha, Tuff Helmet \| Gold Chrome (chrome), Neck Gaiter \| Glow Skull (skull) |

### Backcountry Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Tuff Shell \| Expedition Red, Ridge Shell \| Carob, Cloud Puffer \| Cocoa, Insulated Freedom \| Olive, Mocha Puffer \| Rust, Tuff Bib \| Charcoal, Cargo Pant \| Khaki, Wide Pant \| Olive, Baggy Pant \| Washed Black, Big Stack Pant \| Black, Carpenter Pant \| Moss, Tuff Helmet \| Beacon Orange (gloss), Tuff Goggle \| Persimmon, Neck Gaiter \| Topo Olive (topo), Tuff Mitt \| Saddle, Pipe Glove \| Wool Grey |
| Mil-Spec (uncommon) | 30 % | Storm Hood \| Glacier Blue, Tall Anorak \| Forest Lime, Layer Hoodie \| Dusty Blue, Alpine Hardshell \| Graphite, Varsity Coach \| Maroon, Duck Canvas Work \| Hamilton Tan, Tuff Bib \| Avalanche, Wide Pant \| Carob, Relaxed Cargo \| Sand, Tuff Helmet \| Summit Stars (decal stars), Tuff Goggle \| Ice Blue, Neck Gaiter \| Blaze, Tuff Mitt \| Expedition |
| Restricted (rare) | 14 % | Tuff Shell \| Topo Map (topo), Storm Hood \| Whiteout (digital), Ridge Shell \| Dynasty, Cloud Puffer \| Summit Orange, Layer Hoodie \| Woodland Hoodie (camo), Insulated Freedom \| Glacier Teal, Cargo Pant \| Desert Camo (camo), Baggy Pant \| Khaki, Coach Bib \| Cream, Camo Cargo \| Woodland Camo (camo), Tuff Goggle \| Amber Iridium (iridescent lens), Balaclava \| Bivouac (stars) |
| Classified (epic) | 4.4 % | Retro One-Piece \| Alpine '78 (band, one-piece), Sherpa Flannel \| Forest Plaid, Mocha Puffer \| Sage, Tuff Helmet \| Bronze (metallic), Balaclava \| Yeti Skull (skull) |
| Covert (legendary) | 1.3 % | Alpine Hardshell \| Spruce, Duck Canvas Work \| Brown Duck, Tuff Helmet \| Copper Chrome (chrome), Tuff Goggle \| Aurora (iridescent lens) |

### ★ Exceedingly rare (both cases, 0.3 %)

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

## Item icons

Every skin has a rendered 3D picture, the same in the Cases tab (contents, best and recent pulls), the
reel, the 2D reveal card, the "Open all" summary, the Locker grid and detail, and the Equipment card.
Owned gold items show their own skis / board (they used to share the ★); the anonymous ★ card itself is
a rendered gold star, and the reel and case contents keep it by design (CS:GO's knife rule).

### Rarity first, item second (research, October 2026)

The first rendered icons (v1) were big, detailed renders filling the card: the item won over the grade
colour, and in the spin the cards read as a stream of clothing instead of a stream of colours. What the
reference games do (from their UIs and the CS2 colour data; sizes are estimates from screenshots):

- **CS:GO / CS2.** Dark neutral plate, a rarity-coloured gradient rising from the bottom (~30–50 % of
  the card), a solid rarity bar along the bottom (~5 % of the card height), the item at one fixed angle
  per category (flat side profile for every gun) with a soft shadow, two text lines (weapon, then the
  finish), wear and the orange StatTrak tag as small text. At speed you cannot read any item: you see
  the bars and washes flash past the marker, so hue is the signal; the item becomes readable only in the
  crawl. The ★ knife / glove hides behind a generic gold card until the reveal.
- **Case-opening sites** (CS skins): even more colour: the item at ~60–70 % of the card width with a
  radial glow in the grade colour behind it, the winning card scales up and pulses.
- **Fortnite** (shop / locker, before v29.20 retired the rarity colours): the grade *is* the background
  (radial gradient, series pattern), the item is a cut-out with a dark outline so it pops off the colour.
- **Rocket League / Valorant / Apex / Overwatch.** Tile tinted by grade or a tier chip, item centred
  smaller; Apex lets the pack beam take the best item's colour; Overwatch puts the grade on the edge glow.
- **Why it works.** Area share: the grade colour must own a big part of the tile (field + bar), with the
  item less saturated or separated by an outline. Small sizes punish detail: fine shading and specular
  glints become noise, flat colour blocks and a crisp silhouette survive. One framing per category means
  the eye compares only colour while scanning. During the spin the excitement is the colour stream past
  the marker, the slowing ticks, and the rare colours brushing past (near misses; note the research on
  near misses is mixed, ours never change the outcome and the odds are shown).

### What we built (v2)

- **Tiles** (`icons.css`, the reel draws the same in `reelCanvas.js`): dark plate → fine diagonal
  pattern → a grade wash rising from the bottom → a radial grade glow behind the item → the picture at
  ~2/3 of the card width, a little above centre → a darker name strip (item in mono caps, finish in the
  display cut) → a **bold grade bar** (0.42 em, was 0.28). Grade strength rises with rarity (grey is
  light so it gets less wash); pink and red add a lit top edge; ★ gold gets a gold field and a slow
  shimmer sweep (off with `prefers-reduced-motion`).
- **Tile pictures** (iconBaker `style: 'tile'`): the same real models and shaders, but graded flatter for
  small sizes: highlights rolled off before the tone curve (chrome and gloss read as colour, not white
  glints), shading contrast pulled in and saturation up a little, no bloom, and a crisp dark outline
  (~1.1 % of the icon) around the silhouette. Helmets and goggles are shot on their own (no white
  mannequin bust competing with them); face pieces keep a slate head that fades out under the gaiter.
  Framing per category: skis / boards diagonal, garments front 3/4, gloves upright pair, headwear 3/4.
  No grade glow in the picture any more: the tile carries the colour.
- **HD pictures** (`style: 'hd'`, `hdId(id)`): the full studio shading with a soft bloom at 512 / 384 px,
  baked only when something big shows the item: the Locker detail (now a 9.5 em grade stage) and the 2D
  reveal card. The tile picture stands in until it is ready.
- **The reel**: plates are painted once with canvas 2D (the lobby's own fonts); the picture is drawn per
  frame on top. While the reel is fast the picture is a **silhouette in a light tint of the grade**,
  smeared along the travel (6 faint copies over up to 1/5 of a card above ~14 cards/s), so the start of
  the spin is pure colour blocks; between ~20 and ~7 cards/s it cross-fades to the detailed tile icon,
  which is what you read in the crawl, at the near misses and at the stop. Speed comes from the reel
  curve itself, so captures that freeze the clock show the right look.

| | v1 (detailed renders) | v2 (tiles) |
|---|---|---|
| picture in a card | ~95 % of the width, grade glow baked in | ~66 %, outline, flat grade, grade field from the tile |
| grade bar | 0.28 em | 0.42 em + wash + glow behind the item |
| reel at speed | detailed renders under speed streaks | grade-tinted silhouettes, motion-blurred |
| tile icon size | 384 / 256 px | 256 / 192 px (HD 512 / 384 on demand) |

Check them with `node web/scripts/tilesheet.mjs <url> <dir>` (reel at four speeds per case, the
contents grids, the Locker per slot; `FLAT=1` for the old flat art) and `iconsheet.mjs` (every icon).

**How they are made** (`lobby/cases/iconBaker.js`): the lobby's own WebGL renderer draws each item
into an off-screen target, so the game's real models and shaders make the picture:

- **Clothing** is a "ghost mannequin" product shot: a hidden copy of the rider rig (`skier.gltf`, same
  rest pose and limb proportions as rider.js, arms in an A-pose; hands raised in front for gloves),
  dressed by `character/` (`dressRider`, `resolveOutfit`, `applyLook`), so prints, finishes (metallic,
  chrome, holographic, reflective, neon), panels and zips are the real shader. Only the slot's pieces of
  the outfit mesh are drawn (an index subset by piece id: jacket + sleeves + collar + hood, pant legs,
  mitts + gauntlets, gaiter), double-sided so openings show the lining; a one-piece also draws the legs.
  Pants are shot from the waist down with the legs a few degrees apart (straight, like a product photo),
  so the waistband, seat and crotch read; a bib also shows its chest panel and shoulder straps (the
  straps are drawn only in the icon studio, `uStraps`: in the game they would sit under the jacket).
  ICON_VERSION 4 (clothing pass 3: hip-length jackets, full-rise pants) re-bakes every clothing icon.
  ICON_VERSION 5 (round-2 jackets on the in-between body, the R1–R6 items, retired shiny skins) re-bakes them again.
- **Helmets and goggles** are drawn alone (goggles on a neutral dark helmet so the lens is the subject);
  **face pieces** sit on a slate head that fades out below the gaiter.
- **Skis and boards** are `equipment/models.js` planks with their real topsheet (legendary gold leaf,
  chrome, holo, inferno, galaxy, aurora), laid diagonally with a quarter turn; tilted so a mirror
  topsheet catches the horizon line.
- **Studio**: the shared shader globals (`world.js globals`: sun direction / colour, sky and ground
  fill, rim colour, time, sun-mask off) are switched to a fixed studio set for the bake and restored
  right after, so icons never depend on the map. Warm key from the upper left with a soft shadow map,
  cool fill, Fresnel rim; camera fitted to the item's skinned vertices from a 3/4 angle per slot.
- **Composite**: rendered at 2x in half float, then one pass: the game's neutral tone curve, the tile or
  HD look (above) and a soft contact shadow, transparent elsewhere. Read back asynchronously, stored as
  webp.

**Size and cache** (`lobby/cases/itemIcons.js`): tile pictures 256 px on screens with devicePixelRatio
≥ 1.5, else 192 px (were 384 / 256: a tile shows the picture at ~100–190 device px); HD 512 / 384 px.
Pictures are kept as blob URLs in memory and in IndexedDB (`sendit-icons`, key
`${ICON_VERSION}|${px}|${id}`, HD ids are `hd:<skin key>`), so after the first visit every card has
its picture at once. Bakes are lazy: any card that is drawn queues its icon (visible cards first);
the Cases tab queues every icon of the cases you hold before it pre-paints the reel cards. One
bake per animation frame; a card shows the flat SVG until its icon is ready and swaps in place.
Debug: `?noicons` (flat art), `?iconrebake` (ignore the cache), `window.__senditIcons`,
`window.__senditReel` (the reel's plate and picture caches).

**Versioning**: bump `ICON_VERSION` in itemIcons.js whenever the look of the icons changes (studio,
framing, or a model / shader they use: e.g. reshaped garments); older entries are deleted on the next load.

**A new item's icon** needs nothing extra: a clothing variant (colours, print, finish) or a gear model
is pictured from its data. A new slot needs a line in `PIECES` (which outfit pieces to draw) and `VIEW`
(camera angle) in iconBaker.js; a new garment piece id comes from `character/garments.js PIECE`.
Check it with `node web/scripts/iconsheet.mjs <url> <dir>` (ONLY=<key part> for a quick look).

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
- Item icons are baked on first sight (about 0.05–0.2 s each, one per frame); until then the flat SVG
  shows. A garment cut the page has never built costs ~0.3 s once (the same geometry cache as the rider).
- The reel and the case contents still show gold as the anonymous ★ card on purpose (CS:GO's knife
  rule); the real picture appears at the reveal, in Recent pulls, the session summary and the Locker.
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
  exact times for screenshots, and `cases-timing.mjs` gives the exact 60 fps numbers.209 reward skins (64 grey, 51 blue, 44 purple, 26 pink, 14 red, 10 gold) in three cases (First Chair,
Night Park, Backcountry), plus the starter kit. Per slot: jacket 75 (thirteen garments: Tuff Shell, Storm
Hood with the hood up, Retro One-Piece, Ridge Shell, Tall Anorak, Cloud Puffer, Layer Hoodie and round 2's
Sherpa Flannel, Insulated Freedom, Alpine Hardshell, Varsity Coach, Duck Canvas Work, Mocha Puffer), pants
48 (Tuff Bib, Cargo Pant, Wide Pant and round 2's Baggy Pant, Relaxed Cargo, Big Stack Pant, Coach Bib,
Carpenter Pant, Camo Cargo), helmet 18, goggles 16, face 19 (Neck Gaiter, Balaclava), gloves 15 (Tuff Mitt,
Pipe Glove), skis 9 and boards 9 (4 stock models each + 5 legendary). The other four stock ski and board
models (slalom, GS, powder, park; freeride, carver, powder, park) are blue and purple drops in the First
Chair and Night Park cases, with their own handling. Every jacket is cut on the round-2 shape on the
in-between body (docs/character.md § Catalogue jackets).

Looks that read in game (all shader-driven, `materials.js`): woodland camo, digital (arctic) camo,
two-tone diagonal, retro chest band, checkerboard, fade, tie-dye, paint splatter, tiger stripes, animated
flames, skull jaw on the gaiter, topographic contours, flannel plaid, duck canvas, wool and twill weaves,
quilted baffles; neon glow on two skins (Molten, Glowstick); helmets gloss, carbon weave, pearl, mirror
chrome, gold chrome, racing stripe, hot-rod flames, stars; goggles with coloured frames and rainbow
(oil-slick) lenses. Clothing is matte (§ Retired skins). One-pieces dress the legs too. Legendary
topsheets: brushed and engraved gold leaf with light sweeps, mirror chrome reflecting sky and horizon,
holographic foil, animated inferno flames, a twinkling galaxy, moving aurora ribbons.

### Retired skins (October 2026) and how saves migrate

The user removed every shiny clothing skin (metallic, retro-reflective, iridescent, gloss finishes) and
every zig-zag one. Helmets keep their gloss / chrome / pearl (hard shells, not clothing), skis and boards
keep their topsheets, and the two neon-glow skins stay (a glow, not a shine). The skins are gone from the
catalogue and the cases; a rider who owned one gets a **new matte skin of the same grade from the same
case** instead (`RETIRED_SKINS` in `profile/items.js`, applied by `schema.js sanitize()` on every load,
so it needs no version bump and is idempotent):

| retired skin | grade, case | why | becomes |
|---|---|---|---|
| Tuff Shell \| Flashbulb | Classified, Night Park | reflective | Alpine Hardshell \| Ember |
| Tuff Shell \| Gold Lamé | Covert, First Chair | metallic | Sherpa Flannel \| Buffalo Rust |
| Tuff Shell \| Glacier | Restricted, First Chair | gloss | Alpine Hardshell \| Glacier |
| Tuff Shell \| Beacon | Classified, Backcountry | reflective | Mocha Puffer \| Sage |
| Storm Hood \| Hologram | Covert, Night Park | iridescent | Insulated Freedom \| Saffron Yoke |
| Storm Hood \| Northern Lights | Covert, Backcountry | iridescent | Alpine Hardshell \| Spruce |
| Retro One-Piece \| Miami '92 | Covert, First Chair | zig-zag | Varsity Coach \| Letterman |
| Retro One-Piece \| Hyperwave | Covert, Night Park | zig-zag, neon | Mocha Puffer \| Mocha |
| Retro One-Piece \| Expedition '86 | Covert, Backcountry | zig-zag, metallic | Duck Canvas Work \| Brown Duck |
| Cloud Puffer \| Midnight Gloss | Mil-Spec, Night Park | gloss | Mocha Puffer \| Matte Black |
| Cloud Puffer \| Silver Lining | Classified, First Chair | metallic | Duck Canvas Work \| Black Duck |
| Tuff Mitt \| Gold Lamé | Covert, First Chair | metallic (matches the jacket) | Tuff Mitt \| Sherpa Cuff |

- The inventory key is rewritten (owning both adds the copies; the new one shows as NEW in the Locker).
- An equipped retired skin is replaced by its replacement in the loadout (so the rider keeps a skin of
  the same grade on); one that is somehow not owned falls back to the slot's starter like any invalid save.
- Case history and "best pull" entries point at the replacement, so the Cases tab never shows a missing card.
- Collections: a series someone had completed stays paid; the new skins simply make it incomplete again.
- Tested in `unittest.mjs` ("retired skins …").

The full list with odds is generated by `node web/scripts/rewards-table.mjs`:

<!-- rewards-table -->
### First Chair Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Tuff Shell \| Tuff, Tuff Shell \| Nightshift, Tuff Shell \| Forest, Storm Hood \| Tuff, Ridge Shell \| Stratus, Tall Anorak \| Sage, Cloud Puffer \| Butter, Layer Hoodie \| Olive Drab, Alpine Hardshell \| Stone, Varsity Coach \| Charcoal, Duck Canvas Work \| Chalk, Tuff Bib \| Tuff, Tuff Bib \| Nightshift, Tuff Bib \| Navy, Wide Pant \| Charcoal, Baggy Pant \| Charcoal, Relaxed Cargo \| Olive, Coach Bib \| Charcoal, Camo Cargo \| Olive Drab, Tuff Helmet \| Tuff, Tuff Helmet \| Matte Navy, Tuff Goggle \| Amber, Tuff Goggle \| Night Clear, Neck Gaiter \| Topo (topo), Neck Gaiter \| Nightshift (topo), Neck Gaiter \| Heather, Tuff Mitt \| Tuff, Tuff Mitt \| Summit Crew, Tuff Mitt \| Black Leather |
| Mil-Spec (uncommon) | 30 % | Tuff Shell \| Summit Crew, Storm Hood \| Summit Crew, Ridge Shell \| Forage, Layer Hoodie \| Rust, Sherpa Flannel \| Mustard Plaid, Tuff Bib \| Summit Crew, Big Stack Pant \| Sage, Carpenter Pant \| Brown Duck, Tuff Helmet \| Nightshift, Tuff Helmet \| Summit Crew, Tuff Goggle \| Acid Mint, Tuff Goggle \| Sapphire, Neck Gaiter \| Summit Crew (topo), Neck Gaiter \| Woodland (camo), Balaclava \| Whiteout (digital), Tuff Mitt \| Nightshift, Valcrest SL Race 165 \| Race Yellow, Valcrest Steeple 161 \| Bone |
| Restricted (rare) | 14 % | Tuff Shell \| Woodland (camo), Storm Hood \| Blaze (diagonal), Tall Anorak \| Navy Blaze, Alpine Hardshell \| Glacier, Mocha Puffer \| Cream, Tuff Bib \| Woodland (camo), Tuff Bib \| Arctic Camo (digital), Wide Pant \| Woodland (camo), Relaxed Cargo \| Rust, Tuff Helmet \| Racing Stripe (gloss, decal stripe), Tuff Goggle \| Rose Gold (iridescent lens), Tuff Goggle \| Emerald (iridescent lens), Tuff Mitt \| Woodland (camo), Driftline Float 186 \| Lagoon, Northwake Edge 163 \| Ice |
| Classified (epic) | 4.4 % | Tuff Shell \| Heritage (band, matte), Storm Hood \| Arctic Camo (digital), Insulated Freedom \| Expedition, Duck Canvas Work \| Black Duck, Tuff Bib \| Heritage (band), Coach Bib \| Brick, Camo Cargo \| Desert Camo (camo), Tuff Helmet \| Carbon (carbon), Tuff Helmet \| Hot Rod (gloss, decal flames), Tuff Goggle \| Oil Slick (iridescent lens), Neck Gaiter \| Skull Jaw (skull) |
| Covert (legendary) | 1.3 % | Storm Hood \| Molten (flames, neon), Sherpa Flannel \| Buffalo Rust, Varsity Coach \| Letterman, Tuff Helmet \| Chrome (chrome), Tuff Goggle \| Black Gold (iridescent lens), Tuff Mitt \| Sherpa Cuff |

### Night Park Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Storm Hood \| Nightshift, Tall Anorak \| Bone, Layer Hoodie \| Heather, Sherpa Flannel \| Ash Plaid, Cargo Pant \| Charcoal, Cargo Pant \| Sand, Cargo Pant \| Olive, Wide Pant \| Bone, Relaxed Cargo \| Black, Big Stack Pant \| Dark Olive, Carpenter Pant \| Chalk, Tuff Helmet \| Arcade, Tuff Goggle \| Ultraviolet, Neck Gaiter \| Blackout, Neck Gaiter \| Arcade (topo), Balaclava \| Charcoal, Tuff Mitt \| Arcade, Pipe Glove \| Black, Pipe Glove \| White |
| Mil-Spec (uncommon) | 30 % | Tuff Shell \| Arcade, Tuff Shell \| Bubblegum, Storm Hood \| Arcade, Ridge Shell \| Black Sapphire, Tall Anorak \| Lilac Haze, Cloud Puffer \| Blush, Insulated Freedom \| Bone, Mocha Puffer \| Matte Black, Tuff Bib \| Arcade, Cargo Pant \| Urban Camo (camo), Wide Pant \| Washed Denim, Baggy Pant \| Bone, Coach Bib \| Forest, Camo Cargo \| Urban Camo (camo), Tuff Helmet \| Lime Gloss (gloss), Tuff Goggle \| Hi-Vis, Neck Gaiter \| Checkerboard (checker), Pipe Glove \| Hi-Vis, Jibworks Twin 168 \| Bubblegum, Jibworks Butter 152 \| Lemonade |
| Restricted (rare) | 14 % | Tuff Shell \| Board Shop (checker), Storm Hood \| Sunset Fade (fade), Layer Hoodie \| Acid, Sherpa Flannel \| Midnight Plaid, Varsity Coach \| Navy, Duck Canvas Work \| Moss, Cargo Pant \| Tie-Dye (tiedye), Big Stack Pant \| Lilac, Carpenter Pant \| Black Duck, Tuff Helmet \| Starfield (gloss, decal stars), Tuff Helmet \| Finish Line (gloss, decal checker), Tuff Goggle \| Toxic (iridescent lens), Neck Gaiter \| Night Sky (stars), Balaclava \| Tiger (tiger), Pipe Glove \| Checker (checker), Valcrest GS Race 188 \| Team White, Driftline Fish 158 \| Seafoam |
| Classified (epic) | 4.4 % | Storm Hood \| Bengal (tiger), Retro One-Piece \| Ice Cream (band, one-piece), Tall Anorak \| Swirl (tiedye), Alpine Hardshell \| Ember, Varsity Coach \| Black & Bone, Cargo Pant \| Paintball (splatter), Tuff Helmet \| Pearl (pearl), Tuff Goggle \| Laser (iridescent lens), Balaclava \| Inferno (flames), Pipe Glove \| Glowstick (stripes, neon) |
| Covert (legendary) | 1.3 % | Insulated Freedom \| Saffron Yoke, Mocha Puffer \| Mocha, Tuff Helmet \| Gold Chrome (chrome), Neck Gaiter \| Glow Skull (skull) |

### Backcountry Case

| Grade | Odds | Items |
|---|---|---|
| Consumer (common) | 50 % | Tuff Shell \| Expedition Red, Ridge Shell \| Carob, Cloud Puffer \| Cocoa, Insulated Freedom \| Olive, Mocha Puffer \| Rust, Tuff Bib \| Charcoal, Cargo Pant \| Khaki, Wide Pant \| Olive, Baggy Pant \| Washed Black, Big Stack Pant \| Black, Carpenter Pant \| Moss, Tuff Helmet \| Beacon Orange (gloss), Tuff Goggle \| Persimmon, Neck Gaiter \| Topo Olive (topo), Tuff Mitt \| Saddle, Pipe Glove \| Wool Grey |
| Mil-Spec (uncommon) | 30 % | Storm Hood \| Glacier Blue, Tall Anorak \| Forest Lime, Layer Hoodie \| Dusty Blue, Alpine Hardshell \| Graphite, Varsity Coach \| Maroon, Duck Canvas Work \| Hamilton Tan, Tuff Bib \| Avalanche, Wide Pant \| Carob, Relaxed Cargo \| Sand, Tuff Helmet \| Summit Stars (decal stars), Tuff Goggle \| Ice Blue, Neck Gaiter \| Blaze, Tuff Mitt \| Expedition |
| Restricted (rare) | 14 % | Tuff Shell \| Topo Map (topo), Storm Hood \| Whiteout (digital), Ridge Shell \| Dynasty, Cloud Puffer \| Summit Orange, Layer Hoodie \| Woodland Hoodie (camo), Insulated Freedom \| Glacier Teal, Cargo Pant \| Desert Camo (camo), Baggy Pant \| Khaki, Coach Bib \| Cream, Camo Cargo \| Woodland Camo (camo), Tuff Goggle \| Amber Iridium (iridescent lens), Balaclava \| Bivouac (stars) |
| Classified (epic) | 4.4 % | Retro One-Piece \| Alpine '78 (band, one-piece), Sherpa Flannel \| Forest Plaid, Mocha Puffer \| Sage, Tuff Helmet \| Bronze (metallic), Balaclava \| Yeti Skull (skull) |
| Covert (legendary) | 1.3 % | Alpine Hardshell \| Spruce, Duck Canvas Work \| Brown Duck, Tuff Helmet \| Copper Chrome (chrome), Tuff Goggle \| Aurora (iridescent lens) |

### ★ Exceedingly rare (both cases, 0.3 %)

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

## Item icons

Every skin has a rendered 3D picture, the same in the Cases tab (contents, best and recent pulls), the
reel, the 2D reveal card, the "Open all" summary, the Locker grid and detail, and the Equipment card.
Owned gold items show their own skis / board (they used to share the ★); the anonymous ★ card itself is
a rendered gold star, and the reel and case contents keep it by design (CS:GO's knife rule).

### Rarity first, item second (research, October 2026)

The first rendered icons (v1) were big, detailed renders filling the card: the item won over the grade
colour, and in the spin the cards read as a stream of clothing instead of a stream of colours. What the
reference games do (from their UIs and the CS2 colour data; sizes are estimates from screenshots):

- **CS:GO / CS2.** Dark neutral plate, a rarity-coloured gradient rising from the bottom (~30–50 % of
  the card), a solid rarity bar along the bottom (~5 % of the card height), the item at one fixed angle
  per category (flat side profile for every gun) with a soft shadow, two text lines (weapon, then the
  finish), wear and the orange StatTrak tag as small text. At speed you cannot read any item: you see
  the bars and washes flash past the marker, so hue is the signal; the item becomes readable only in the
  crawl. The ★ knife / glove hides behind a generic gold card until the reveal.
- **Case-opening sites** (CS skins): even more colour: the item at ~60–70 % of the card width with a
  radial glow in the grade colour behind it, the winning card scales up and pulses.
- **Fortnite** (shop / locker, before v29.20 retired the rarity colours): the grade *is* the background
  (radial gradient, series pattern), the item is a cut-out with a dark outline so it pops off the colour.
- **Rocket League / Valorant / Apex / Overwatch.** Tile tinted by grade or a tier chip, item centred
  smaller; Apex lets the pack beam take the best item's colour; Overwatch puts the grade on the edge glow.
- **Why it works.** Area share: the grade colour must own a big part of the tile (field + bar), with the
  item less saturated or separated by an outline. Small sizes punish detail: fine shading and specular
  glints become noise, flat colour blocks and a crisp silhouette survive. One framing per category means
  the eye compares only colour while scanning. During the spin the excitement is the colour stream past
  the marker, the slowing ticks, and the rare colours brushing past (near misses; note the research on
  near misses is mixed, ours never change the outcome and the odds are shown).

### What we built (v2)

- **Tiles** (`icons.css`, the reel draws the same in `reelCanvas.js`): dark plate → fine diagonal
  pattern → a grade wash rising from the bottom → a radial grade glow behind the item → the picture at
  ~2/3 of the card width, a little above centre → a darker name strip (item in mono caps, finish in the
  display cut) → a **bold grade bar** (0.42 em, was 0.28). Grade strength rises with rarity (grey is
  light so it gets less wash); pink and red add a lit top edge; ★ gold gets a gold field and a slow
  shimmer sweep (off with `prefers-reduced-motion`).
- **Tile pictures** (iconBaker `style: 'tile'`): the same real models and shaders, but graded flatter for
  small sizes: highlights rolled off before the tone curve (chrome and gloss read as colour, not white
  glints), shading contrast pulled in and saturation up a little, no bloom, and a crisp dark outline
  (~1.1 % of the icon) around the silhouette. Helmets and goggles are shot on their own (no white
  mannequin bust competing with them); face pieces keep a slate head that fades out under the gaiter.
  Framing per category: skis / boards diagonal, garments front 3/4, gloves upright pair, headwear 3/4.
  No grade glow in the picture any more: the tile carries the colour.
- **HD pictures** (`style: 'hd'`, `hdId(id)`): the full studio shading with a soft bloom at 512 / 384 px,
  baked only when something big shows the item: the Locker detail (now a 9.5 em grade stage) and the 2D
  reveal card. The tile picture stands in until it is ready.
- **The reel**: plates are painted once with canvas 2D (the lobby's own fonts); the picture is drawn per
  frame on top. While the reel is fast the picture is a **silhouette in a light tint of the grade**,
  smeared along the travel (6 faint copies over up to 1/5 of a card above ~14 cards/s), so the start of
  the spin is pure colour blocks; between ~20 and ~7 cards/s it cross-fades to the detailed tile icon,
  which is what you read in the crawl, at the near misses and at the stop. Speed comes from the reel
  curve itself, so captures that freeze the clock show the right look.

| | v1 (detailed renders) | v2 (tiles) |
|---|---|---|
| picture in a card | ~95 % of the width, grade glow baked in | ~66 %, outline, flat grade, grade field from the tile |
| grade bar | 0.28 em | 0.42 em + wash + glow behind the item |
| reel at speed | detailed renders under speed streaks | grade-tinted silhouettes, motion-blurred |
| tile icon size | 384 / 256 px | 256 / 192 px (HD 512 / 384 on demand) |

Check them with `node web/scripts/tilesheet.mjs <url> <dir>` (reel at four speeds per case, the
contents grids, the Locker per slot; `FLAT=1` for the old flat art) and `iconsheet.mjs` (every icon).

**How they are made** (`lobby/cases/iconBaker.js`): the lobby's own WebGL renderer draws each item
into an off-screen target, so the game's real models and shaders make the picture:

- **Clothing** is a "ghost mannequin" product shot: a hidden copy of the rider rig (`skier.gltf`, same
  rest pose and limb proportions as rider.js, arms in an A-pose; hands raised in front for gloves),
  dressed by `character/` (`dressRider`, `resolveOutfit`, `applyLook`), so prints, finishes (metallic,
  chrome, holographic, reflective, neon), panels and zips are the real shader. Only the slot's pieces of
  the outfit mesh are drawn (an index subset by piece id: jacket + sleeves + collar + hood, pant legs,
  mitts + gauntlets, gaiter), double-sided so openings show the lining; a one-piece also draws the legs.
  Pants are shot from the waist down with the legs a few degrees apart (straight, like a product photo),
  so the waistband, seat and crotch read; a bib also shows its chest panel and shoulder straps (the
  straps are drawn only in the icon studio, `uStraps`: in the game they would sit under the jacket).
  ICON_VERSION 4 (clothing pass 3: hip-length jackets, full-rise pants) re-bakes every clothing icon.
  ICON_VERSION 5 (round-2 jackets on the in-between body, the R1–R6 items, retired shiny skins) re-bakes them again.
- **Helmets and goggles** are drawn alone (goggles on a neutral dark helmet so the lens is the subject);
  **face pieces** sit on a slate head that fades out below the gaiter.
- **Skis and boards** are `equipment/models.js` planks with their real topsheet (legendary gold leaf,
  chrome, holo, inferno, galaxy, aurora), laid diagonally with a quarter turn; tilted so a mirror
  topsheet catches the horizon line.
- **Studio**: the shared shader globals (`world.js globals`: sun direction / colour, sky and ground
  fill, rim colour, time, sun-mask off) are switched to a fixed studio set for the bake and restored
  right after, so icons never depend on the map. Warm key from the upper left with a soft shadow map,
  cool fill, Fresnel rim; camera fitted to the item's skinned vertices from a 3/4 angle per slot.
- **Composite**: rendered at 2x in half float, then one pass: the game's neutral tone curve, the tile or
  HD look (above) and a soft contact shadow, transparent elsewhere. Read back asynchronously, stored as
  webp.

**Size and cache** (`lobby/cases/itemIcons.js`): tile pictures 256 px on screens with devicePixelRatio
≥ 1.5, else 192 px (were 384 / 256: a tile shows the picture at ~100–190 device px); HD 512 / 384 px.
Pictures are kept as blob URLs in memory and in IndexedDB (`sendit-icons`, key
`${ICON_VERSION}|${px}|${id}`, HD ids are `hd:<skin key>`), so after the first visit every card has
its picture at once. Bakes are lazy: any card that is drawn queues its icon (visible cards first);
the Cases tab queues every icon of the cases you hold before it pre-paints the reel cards. One
bake per animation frame; a card shows the flat SVG until its icon is ready and swaps in place.
Debug: `?noicons` (flat art), `?iconrebake` (ignore the cache), `window.__senditIcons`,
`window.__senditReel` (the reel's plate and picture caches).

**Versioning**: bump `ICON_VERSION` in itemIcons.js whenever the look of the icons changes (studio,
framing, or a model / shader they use: e.g. reshaped garments); older entries are deleted on the next load.

**A new item's icon** needs nothing extra: a clothing variant (colours, print, finish) or a gear model
is pictured from its data. A new slot needs a line in `PIECES` (which outfit pieces to draw) and `VIEW`
(camera angle) in iconBaker.js; a new garment piece id comes from `character/garments.js PIECE`.
Check it with `node web/scripts/iconsheet.mjs <url> <dir>` (ONLY=<key part> for a quick look).

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
- Item icons are baked on first sight (about 0.05–0.2 s each, one per frame); until then the flat SVG
  shows. A garment cut the page has never built costs ~0.3 s once (the same geometry cache as the rider).
- The reel and the case contents still show gold as the anonymous ★ card on purpose (CS:GO's knife
  rule); the real picture appears at the reveal, in Recent pulls, the session summary and the Locker.
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
