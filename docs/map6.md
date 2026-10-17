# Map 6: Kitsune Peak — Japow volcano at dusk

A Hokkaido-style powder volcano (think Niseko under Yōtei, Asahidake's steaming crater, Rusutsu's tree runs).
You drop from the saddle of a crater rim into a wide summit bowl. Below it are a ridge spine of whoops, terraced
pillow stacks, a white birch glade with firs in deep tree wells, and a lantern-lit natural half-pipe. Everything
funnels into a shrine village: a tunnel of 33 vermilion torii, a shrine and three ryokan whose curved snowy roofs
you can ride and jump, a five-storey pagoda and a steaming onsen. A gondola runs overhead. The light is dusk: the
face is in blue-violet shade, the summits and far ranges catch peach alpenglow, and the warm light comes from the
lanterns. There are six trails, all fast (75–90 km/h averages on the bots), with deep, light powder that planes
instead of ploughing.

```
npm --prefix web run dev -- --port 5195 --strictPort
http://localhost:5195/?map=kitsune-peak&ride                  Okama Bowl (the default trail)
http://localhost:5195/?map=kitsune-peak&trail=senbon&ride     any trail by id (the lobby's Maps tab does the same)
node web/scripts/map6-ride.mjs both all send --check          bot rides every trail, skis and board (styles: send, control, carve, trick)
node web/scripts/map6-unit.mjs                                87 checks: contracts, trails, terrain, roofs / walls, features, wells
node web/scripts/map6-fuzz.mjs 40 40                          random inputs from random starts (a third in the village)
OUT=<dir> node web/scripts/map6-shots.mjs http://localhost:5195 all   real-GPU screenshots at 18 viewpoints
OUT=<dir> node web/scripts/map6-e2e.mjs senbon skis          end to end in the real game: one runCompleted, summary, no errors
node web/scripts/map3-perf.mjs http://localhost:5195 1600 900 1 60 kitsune-peak
node web/scripts/gfxpopin.mjs http://localhost:5195 kitsune-peak 1 25
```

Research: [docs/map6-research.md](map6-research.md) covers Japanese powder, village and shrine architecture with
dimensions, the dusk palette, how Steep, Riders Republic and SSX give a mountain an identity, and 14 design
takeaways.

---

## 1. The mountain

Local frame (the same as Ravenspire's): **u** = metres down the fall line from the crater-rim saddle
(world x = −1150 + u, the mountain falls toward +x / east), **v** = metres across it (world z, + = skier's right).
The summit saddle sits at 3,000 m and the base at about 1,850 m. That keeps the whole mountain just above the
engine's fixed valley-mist band (1,350–1,950 m), so only the base is a little hazy.

| u (m) | zone | slope | what is there |
|---|---|---|---|
| −340…0 | **the crater** | | a 165 m-radius crater, 85 m deep, lowest at the saddle and rising 175 m round the back; fumaroles steam on the inner wall; snow monsters (juhyō) on the rim |
| 0…60 | saddle + rollover | 9° → 25° | spawn at u = 25 |
| 60…540 | **Okama Bowl** | 33° | wind lips (u 230, 285, 360, 455, 470; two right on the Okama line), the **Mochi Field** pillow domes (left), the **Kazan Rim** ridge starts (right) |
| 600 | **Okama Lip** | | a 6 m lip across the centre, with a ramp-around at v 20 |
| 540…900 | mid-mountain | 28° | **Makura Pillows** (left), **Ash Steps**, the **Shirakaba** birch glade begins, the **Kitsunebi Gully** (right) |
| 900…1330 | the steeps | 31° | the **Makura Cliff** (9 m, u 990), **Makura Stacks**, the weave through the birches, the gully's ledges |
| 1355 | **Fox Ledge** | | 8 m cliff band from v −440 to −150 |
| 1330…1510 | | 23° | the **Shrine Lip** (u 1440) and the **Ō-torii** at u 1505 |
| 1510…1910 | **the shrine village** | 16° | the **Senbon Torii** tunnel (u 1545–1705), the **Torii Exit** kicker, Kitsune Shrine (u 1765), the ryokan row (Kiku, Tsuki, Yuki, u 1852–1984), the pagoda (left), the tea house, the onsen (right) |
| 1910…2230 | fir gullies | 23° | rib-and-gully terrain with fir lips (u 2010, 2150) |
| 2230…2440 | runout | 11° | the base lodge, the gondola base station, the **finish** at u 2440 under the finish torii |

### Trails (layout.js `TRAILS`; registered in index.js)

| id | name | difficulty | start (u, v) | length / vertical | the ride |
|---|---|---|---|---|---|
| `okama` | Okama Bowl | blue | 25, 0 | 2.73 km / 1,150 m | the default: the summit bowl, the Okama Lip, the long fast cruise through the village |
| `kazan` | Kazan Rim ★ | black | 45, 120 | 2.72 km / 1,140 m | the volcano-rim rollercoaster: a 22 m ridge spine with whoops every 40 m and three step-down gaps (6, 7 and 6 m) |
| `makura` | Makura Pillows ★ | double-black | 640, −430 | 2.07 km / 780 m | two terraced pillow stacks, the 9 m Makura Cliff between them, Fox Ledge below |
| `shirakaba` | Shirakaba Weave | black | 650, −100 | 2.18 km / 760 m | an S-weave (±42 m, 110 m wavelength) through the birch glade, small Birch Hit lips on its apexes, fir pockets with tree wells |
| `kitsunebi` | Kitsunebi Gully | blue | 430, 520 | 2.30 km / 920 m | from the gondola top station into a 13 m-deep natural half-pipe lined with chōchin, with three step-downs in the floor (3 m, 4 m and the 6 m Fox Fire Drop) |
| `senbon` | Senbon Torii ★ | park | 1430, 40 | 1.07 km / 325 m | the village jump line: Ō-torii, the 33-gate tunnel, the Torii Exit kicker, up the drift onto the shrine roof, then roof to roof down Kiku, Tsuki and Yuki |

★ = `featured`. The lines connect: every trail crosses the village bench, and the drop zones (keys 1–9 or the
d-pad) put you at nine tops, including mid-mountain ones (Mochi Field, Senbon Torii, Shrine Village, Fir Gullies).

### Best lines
- **Rim Rider** (`kazan`, send): pop each whoop at 33–35 m/s. That gives 0.9–1.2 s airs and chains `Whoop ×n`
  (up to ×6 on the bots). The three gaps are 1.9–2.2 s airs with 31–40 m of drop onto the ridge's own flank.
- **Pillow Talk** (`makura`): 25 airs in 2 km, 0.7–2.3 s each, onto bottomless landings (impacts 0–16 m/s, all
  clean).
- **Pilgrimage → Roof Hopper** (`senbon`): through the tunnel at ~70 km/h (+1,000 points), off the Torii Exit, up
  the shrine's drift, then three ryokan roofs, each a 2.9–3.3 s air (the curved sori eaves kick you up).
- **Summit to Shrine**: Okama Lip → Fox Ledge → onto the shrine roof (a goal that crosses three trails).

### Props (props.js; placements are headless data in the course)
- **Buildings** (structures.js): a curved Japanese gable (*sori*). It is steep at the ridge, flattens toward the
  eave, and the eave tips turn up 0.45 m over the last 1.1 m, so the downhill eave is a kicker. The ridge runs
  across the fall line and carries 1 m of snow. The roof snow mesh IS the rideable surface (`heightAt`), and an
  uphill drift ramps onto it. Walls are solid (`blockAt`); a rider passes under the deep eaves at ground level.
  The shrine has vermilion pillars and chigi. All buildings have glowing shōji and chōchin under the eaves.
- **Torii**: 33 tunnel gates every 5 m along a gentle S, the 10.5 m Ō-torii with a shimenawa and fox statues,
  and the finish torii. Posts are solid; you fly over them only at 15 m and up.
- **Pagoda** (31 m, five tiers, curved roofs with snow, a bronze sōrin) as a solid core. **Onsen**: a steaming pool
  ringed with solid rocks.
- **Lanterns**: stone tōrō (solid) on the village paths, chōchin on bamboo poles every 22 m along both gully rims
  (breakaway), and red rope-line markers along the Kazan crest. One additive glow-sprite draw covers every light.
- **Forest** (forest.js, pure data shared by the browser, the height function and the bots):
  - ~4,600 Erman's birches (instanced in 420 m chunks, bark and twig-card textures), 320 firs in pockets, each in
    a tree well.
  - 110 snow monsters.
  - The generic scatter forest (firs) covers the lower mountain from `forestAt`, with the designed zones excluded.
- **Gondola**: 7 towers (solid), sagging cables, 14 red cabins with warm windows moving along them.

## 2. Code

All map code is in `web/src/maps/kitsune/`; it is registered by one import line at the end of `maps/builtin.js`.
**No shared file is changed.**

| file | what |
|---|---|
| index.js | `registerMap` with `mountain`, `trails` (static stats, checked by map6-unit), the thumbnail (an SVG volcano at dusk) and the lobby spot |
| layout.js | every feature as data: profile, crater, Kazan, gully, bands, pillows, hits, buildings, torii, onsen, gondola, drop zones, ride lines, trails, line goals |
| course.js | the height function, `trailSpawn` / `trailFinish` / `selectTrail` / `trailNear`, features hook, `featureAt` / `roofAt`, scatter hooks (`forestAt`, `pisteAt`, `populate`, `rockOk`, `corniceOk`), flakes, `generate()` |
| structures.js | the sori building solid (roof surface, walls, drift) |
| forest.js | `planForest()`: birches, firs and wells, snow monsters, and their hitboxes |
| scoring.js | `attachKitsune` (course.onPlayer): the torii-tunnel bonus, the whoop chain, tree-well drag, trail recognition, headless `runCompleted` |
| props.js | the scene: village, torii, pagoda, lanterns, birches, juhyō, gondola, onsen, steam, glow; static meshes merged per material |
| tuning.js | `KITSUNE_PHYSICS`, `KITSUNE_CAMERA`, `KITSUNE_ATMOSPHERE` |
| noise.js | a copy of Ravenspire's noise helpers |

The height function is `macro` (profile, face and ridges, the cone and crater merged by a smooth max, the
ranges, two horizon volcanoes) + `natural` detail (lumps, drainages, Kazan, the gully with ledges, bands,
pillows, hits, the tunnel trough, tree wells, the onsen terrace) + building drifts (`height`). Past the side
ridges and past the base, the terrain climbs again toward the tile edge, so the tile's skirt is never in view.

### The overnight contracts
- **Mountain and trails**: `mountain: { id: 'kitsune-peak', name, region: 'Hokkaido, Japan', blurb, accent: '#e8553a' }`
  and six trails. `course.trailSpawn(id) → { x, z, heading }` faces down the trail's line.
  `course.trailFinish(id) → { progress: 2440 }`: every trail ends on the same line across the base. The course
  follows the lobby's in-place trail switch (`trailSelected`) and the `trail` load argument. The lobby's mountain
  browser shows the card, the filters and the piste map (checked on the merged tree).
- **Atmosphere**: `course.atmosphere` = sun 9° at bearing 215°, zenith `#2f4f9e`, horizon `#e9b394`, fog `#a7b6dc` × 1.2,
  exposure 1.0, ambient 1.25, and a peach sun at 0.7. It was tuned on the real GPU with `?atmo={...}`.
- **runCompleted** `{ mapId, trailId, distance, time, score }`. In the game, profile/tracker.js emits it for every
  map on `runComplete` / `runFinished`. The map emits it only when no tracker runs (headless bots and tools), so
  it never fires twice. The map's own event names the trail actually ridden (`trailNear` vote over the run), so a
  drop-zone run down the gully counts as `kitsunebi`.

## 3. Physics (tuning.js)

Ravenspire's base tuning was adapted for deep light powder and a gentler mountain (33° max instead of 41°):
- `powderDepth` is 0.75 (deeper than anywhere else) but `frictionPowder` is 0.05 and `turnScrub` 0.09: deep but not slow.
- `powderFloat` is 1.35 on skis and 2.1 on the board, and the board planes.
- `landPowderAbsorb` is 6: bottomless landings off pillows, cliffs and roofs.
- Speed: `maxVelocity` 25 on skis and 24.5 on the board, with `softCapDrag` 0.06. The bots average 75–90 km/h and
  top out at 120 km/h on the Kazan whoops.
- Air is honest: real gravity, no float. A small apex slow motion fires only on 2.8 s+ airs from 10 m+ up.
- `flow` is enabled (line chains, flow meter, SEND IT, line goals, the run summary).
- `treeCrashSpeed` is 9 m/s. A birch collides with its trunk only (0.2 × scale + 0.08 m, ×1.6 for a double
  stem). A fir collides with its trunk and inner crown (0.2 + 0.32 × width). A snow monster collides with its
  core (0.9 × scale).
- **Tree wells** (scoring.js): grounded within ~77 % of a fir's well radius, you lose up to 2.4 /s of speed (the
  powder grabs you), with a hint. The well is also a 0.9 m dish in the snow. No well touches a trail line (a unit
  check).

## 4. Scoring, goals, Challenge

- **Line goals** (flow.js): Rim Rider (the three Kazan gaps), Pillow Talk, Pilgrimage (Torii Exit → shrine → Kiku),
  Roof Hopper (Kiku → Tsuki → Yuki), Fox Fire (gully → Fox Fire Drop), Summit to Shrine.
- **Senbon Torii bonus**: ride all 33 gates in one go (inside the posts, no crash) for 600 + 6 × average km/h
  points (~1,000 at 70 km/h).
- **Whoop chain**: consecutive clean airs off the Kazan Rim score `Whoop ×n` (40 × n each).
- **Close shaves** on the birches and firs (the engine's near-miss scoring) fill the flow meter.
- **Challenge**: medal speeds 23 / 19 / 15 m/s (gold / silver / bronze) over the 2,440 m fall line, generic gates,
  and 12 hand-placed golden snowflakes (Okama Lip, Kazan crest and Gap 2, the pillows, Makura Cliff, the
  weave, both gully walls, inside the tunnel, the shrine and Tsuki roofs, Fox Ledge).
- **Run summary**: the flow layer's card (line, fluidity, control, style).

## 5. Tunables

| what | where |
|---|---|
| slope profile, summit height, finish | layout.js `PROFILE`, `TOP`, `FINISH_U` |
| crater size and rim | layout.js `CRATER` |
| Kazan crest path, height, whoops, gaps | layout.js `KAZAN` (`whoop.wave` / `amp`, `gaps: [u, drop]`) |
| gully path, depth, ledges | layout.js `GULLY` |
| cliffs / pillows / lips | layout.js `BANDS`, `PILLOWS`, `HITS` |
| village: buildings, pagoda, torii, onsen | layout.js `BUILDINGS`, `PAGODA`, `OTORII`, `TUNNEL`, `ONSEN` |
| roof shape | structures.js `OVERHANG`, `SNOW`, `CURVE`, `UPTURN`, `TIP` |
| birch density, fir pockets, wells, hitboxes | forest.js (`glade()`, `free()` lane widths, `FIR_WELL`, `FIR_HIT`, `BIRCH`) |
| weave shape | layout.js `WEAVE` |
| torii bonus, well drag | scoring.js `TORII_BONUS`, `WELL_DRAG` |
| physics, camera, dusk | tuning.js |
| trails and their stats | layout.js `TRAILS` + index.js `TRAIL_STATS` (map6-unit fails if they drift by more than 8 %) |

## 6. Measurements

### Bots (map6-ride.mjs: real Player physics on the map's grid, designed hitboxes; merged tree, 03:00–03:30)

| trail | skis (send) | board (send) |
|---|---|---|
| okama | 108 s, avg 91 km/h, max 108, 0 crashes | 121 s, avg 81, max 103, 0 crashes |
| kazan | 106 s, avg 87, max 122, air 19.8 s, Rim Rider, 0 crashes | 116 s, avg 80, max 120, air 17.1 s, Rim Rider, 0 crashes |
| makura | 100 s, avg 77, max 99, air 35 s, Pillow Talk, 0 crashes | 102 s, avg 72, max 108, air 32 s, Pillow Talk, 0 crashes |
| shirakaba | 104 s, avg 76, max 95, 0 crashes | 111 s, avg 71, max 88, 0 crashes |
| kitsunebi | 95 s, avg 86, max 114, three ledge drops (1.8–2.1 s), Fox Fire, 0 crashes | 103 s, avg 79, max 106, air 5.9 s, 0 crashes |
| senbon | 56 s, avg 73, max 108, air 15 s (max 3.3 s), torii 73 km/h +1,040, Roof Hopper, 0 crashes | 60 s, avg 68, max 99, torii 67 km/h, 0 crashes |

- `map6-ride both all send --check` and `both all control --check` pass: all 24 rides finish with 0 crashes, and
  each emits a correct `runCompleted` (mapId, trailId, distance and time).
- The control style (scrubbing above 17–23 m/s) runs at 51–67 km/h averages.

- Trick style (a 360 on every air over 1 s): all the trails finish clean on both gear (5.9–6.6k points on Kazan,
  4.9k in the gully, 26k on the Senbon roofs on the board, 50k on the Makura pillows on the board). The exceptions:
  - Makura on skis crashes: spinning every pillow drop at 1–2.7 s of air lands sideways on the next pillow.
  - Senbon on skis has 1 crash.

  Pick your spins there.

### End to end in the real game (map6-e2e.mjs: dev server, GPU, real scatter / props / HUD / ride tracker)
- `senbon skis`: 0 crashes, exactly one `runCompleted` (from the tracker: trailId `kitsune-peak/senbon`,
  850 m, 69 s). Pilgrimage and Roof Hopper goals. Run summary 91/100. 0 console errors.
- `kazan snowboard`: 0 crashes, one `runCompleted` (`kitsune-peak/kazan`, 2.26 km). Rim Rider. Summary 82/100
  at 80 km/h average and 115 km/h top. The Clean Sheet and Mountain Master achievements fired. 0 errors.

### Fuzz, units
- map6-fuzz 40 × 40 s (96k frames): no NaN, never below the snow or a roof, never stuck, never over 45 m/s (max
  26.5).
- map6-unit: 87/87.
- The shared suite on the merged tree passes: GPU lobbytest (all checks; one earlier run had a single flaky failure under
  GPU contention that did not reproduce), unittest 52/52, physics-fuzz, physics-tricks, jumps-valcrest
  --check, map3-unit 32/32, map3-fuzz, map4-unit 15/15 and map2-bot --verify.

### Performance (merged tree, dev server, other sessions sharing the GPU: quietest pass counts)
`map3-perf.mjs http://localhost:5195 1600 900 1 60 <map>`, back to back:

| spot (along the Okama path) | Kitsune GPU | Kitsune draws / tris | Valcrest GPU (same session) |
|---|---|---|---|
| 2 % (crater rim) | 12.0 ms | 481 / 2.79 M | 60.9 ms (a contention spike; 12–16 ms elsewhere) |
| 20 % (bowl over the glade) | 22.8 ms | 407 / 2.92 M | 15.9 ms |
| 38 % | 16.9 ms | 350 / 3.10 M | 14.3 ms |
| 55 % (village) | 13.6 ms | 278 / 2.46 M | 15.0 ms |
| 62 % | 14.4 ms | 264 / 2.05 M | 12.3 ms |
| 80 % | 12.3 ms | 181 / 1.78 M | 15.9 ms |
| **average** | **15.3 ms** | | 22.4 ms (≈ 14.7 ms without the spike) |

- The first Kitsune pass (while the bots ran) read 36 ms with 55 ms spikes at three spots. Those are contention,
  not the map, and the second pass is quiet.
- The 20 % spot (looking down over the whole birch glade) is the heaviest view.
- The props are about 30 draws: static meshes are merged per material, and the birches are 2 draws per 420 m
  chunk.
- `gfxpopin.mjs http://localhost:5195 kitsune-peak 1 25`: 0 tree pops, 0 shadow pops, 0 scatter-cell pops and 0
  terrain LOD pops. 0 shader compiles and 0 texture uploads during the ride. One CPU frame over 50 ms (60 ms).
  The birches have no LODs (always full), so they cannot pop.

## 7. Known issues and ideas
- **Lantern glow is subtle on bright snow.** The additive glow sprites read in the village but not at long
  range. A real night variant (`preset: 'night'`) would make the lanterns sing; it needs a second atmosphere and
  a toggle.
- The rider's body is dark under the dusk light (the character shading is shared, not the map's).
- Kitsunebi Gully is fast (86 km/h on the floor). A rider who stays high on a wall rides past the step-downs
  (they fade up the walls), so the drops are a reward for holding the floor line.
- The tile edge still dips outward in a few spots on the far side ridges (130 of ~1,000 edge samples, up to
  22 m). They are not visible from the trails in the screenshots.
- Birch crowns are twig cards: they flicker slightly at a distance at quality 0.
- The gondola is scenery (no ride); `course.lifts` is empty.
