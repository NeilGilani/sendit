# Maps, mountains and trails

Every playable place is a **map** (one course, built at boot). Maps belong to a **mountain** (a card in
the lobby's mountain browser) and offer **trails** (named starts the player picks straight from the lobby).
Code: `web/src/maps/registry.js` (contract + helpers), `web/src/maps/builtin.js` (Valcrest, Lake Tahoe,
imports of the map folders), `web/src/lobby/tabs/maps.js` (the browser), `web/src/main.js` (boot + ride start).

## The contract (other maps build against this exact shape)

### 1. Declare `mountain` and `trails` in `registerMap`

```js
import { registerMap } from '../registry.js';

registerMap({
  id: 'dragonback',                       // unique map id (the ?map= value)
  name: 'Dragonback',
  description: 'Knife-edge ridges…',
  thumbnail: DRAGONBACK_THUMB,            // 160×90 SVG data URL or an image path
  order: 5,
  tags: ['handmade', 'freeride'],
  load: async ({ variant, trail, onProgress }) => new DragonbackCourse(),

  mountain: {
    id: 'dragonback',                     // several maps may share one mountain id → one card
    name: 'Dragonback',
    region: 'Coast Range, BC',            // one short line under the name
    blurb: 'Exposed ridgelines and spines above a glacier.',   // one or two sentences on the card
    accent: '#ff7a3d',                    // card accent colour (CSS colour)
  },
  trails: [                               // STATIC data: the lobby shows these without loading the map
    { id: 'spine-line', name: 'Spine Line', difficulty: 'double-black',
      description: 'The full ridge, top to glacier.', length: 2400, vertical: 1300, featured: true },
    { id: 'south-gully', name: 'South Gully', difficulty: 'black', description: '…', length: 1600, vertical: 900 },
  ],
});
```

| field | type | notes |
| --- | --- | --- |
| `mountain.id` | string | default: the map id. Maps with the same id share a card. |
| `mountain.name` / `region` / `blurb` | string | shown on the card. |
| `mountain.accent` | CSS colour | card glow and trail list accent. Default `#5fa8ff`. |
| `trails[].id` | string | unique within the map; the `?trail=` value. Keep ids stable (they key leaderboards). |
| `trails[].name` | string | |
| `trails[].difficulty` | `'green' \| 'blue' \| 'black' \| 'double-black' \| 'park'` | anything else becomes `blue` with a warning. |
| `trails[].description` | string | one line. |
| `trails[].length` / `vertical` | metres (optional) | shown as "2.4 km · 1,300 m". |
| `trails[].featured` | bool (optional) | gets a star and sorts first in "Featured". |
| `trails[].group` | string (optional) | groups the list (Lake Tahoe: the resort). |
| `trails[].variant` | any (optional) | the map variant this trail needs (Lake Tahoe: `{ resort, run }`). Picking a trail with a different variant reloads. |
| `trails[].dropZone` | string (optional) | name of one of `course.dropZones` to start at when `trailSpawn` has no answer (exact name, else the first name starting with it). Maps with drop zones can skip `trailSpawn` entirely. |
| `trails[].at` | `{ x, z, heading }` (optional) | a static world start, used after `trailSpawn` and `dropZone`. |

**The first trail is the map's default start** (the one a plain `?map=<id>` rides). Make it the trail that
starts at the course's normal spawn. Without `trails`, a map gets one trail `{ id: 'main', name: map.name, difficulty: 'blue' }`.
Without `mountain`, a map is its own mountain.

### 2. Implement `course.trailSpawn(trailId)` on the loaded course

```js
class DragonbackCourse {
  trailSpawn(trailId) {
    const t = SPINE_STARTS[trailId];                           // your own table of starts
    return t ? { x: t.x, z: t.z, heading: t.heading } : null;   // null → dropZone / the default spawn
  }
  // optional:
  trailFinish(trailId) { return trailId === 'south-gully' ? { x: 120, z: 900, radius: 40 } : null; }
}
```

- Order: `course.trailSpawn(trailId)`, then the trail's `dropZone`, then its `at`, then the default spawn.
- `trailSpawn(trailId) → { x, z, heading } | null`. World metres; `heading` is the rider's yaw
  (`0` = facing −Z, the convention of `terrain.meta.spawn` and `player.place`). Return `null` (or omit the
  method) for the default start; any throw or non-finite value also falls back to the default spawn.
- `trailFinish(trailId) → { x, z, radius } | { progress } | null` (optional). Without it (or with `null`) the
  course's own finish (`course.progress(x, z) >= course.finishAt`) ends the run. `{ x, z, radius }` ends the run
  inside that circle; `{ progress }` ends it at that `course.progress` value.
- Must be pure and cheap: it is called at boot (to warm the terrain there) and at every ride start.

### 3. What the game does with it

- **URL:** `?map=<id>&trail=<trailId>`. Unknown trails fall back to the map's default trail; legacy
  `?resort=<id>&run=<n>` still works (it picks the matching Lake Tahoe trail).
- **Profile:** the lobby saves `profile.map = { id, variant, trail }`; with no `?map=` the game boots into it.
- **Ride start** (main.js): the rider is placed at `trailSpawnFor(course, trail)` (that becomes the spawn,
  so "reset to top" returns to the trail's top), the camera intro sweeps in to the trail's top, and a HUD toast
  shows the trail's name and difficulty.
- **Switching trail on the loaded map is instant** (no reload). Switching map, or a trail whose `variant`
  differs from the loaded one, saves the choice and reloads with `?map=&trail=`.
- **Leaderboards:** every ride lands on the map's board (`<mapId>`, the Leaderboards tab) and on its trail's
  board, `trailBoardId(mapId, trailId)` = `<mapId>/<trailId>` (the trail list's best score).

### Registry helpers (maps/registry.js)

| helper | |
| --- | --- |
| `DIFFICULTIES`, `DIFFICULTY_IDS` | ratings with `rank`, `short`, `label`, `color` |
| `listMountains()` | `[{ id, name, region, blurb, accent, maps, trails, spread, order, thumbnail }]` |
| `getTrail(map, id)`, `defaultTrail(map)` | |
| `resolveMapSelection(params, profile)` | `{ id, variant, trail, source }` |
| `needsReload(current, mapId, trailId)` | does riding that trail need a page reload? |
| `selectionQuery(mapId, trailId, base)` | the URL query |
| `trailSpawnFor(course, trailId, terrain.getSpawn())` | `{ x, z, heading, fallback }` |
| `trailFinishFor(course, trailId)` | `{ x, z, radius }`, `{ progress }` or `null` |
| `trailBoardId(mapId, trailId)` | leaderboard id |
| `extendMap(id, extra)` | re-register a map with extra fields |
| `adaptMap(id, { mountain, trails })` | adapter for a map owned elsewhere: fills `mountain` / `trails` only where its own registration has none |
| `findDropZone(course, name)` | |

## Mountains and trails today

Generated from the registry (adapters: Valcrest + Lake Tahoe in `maps/builtin.js`, Blackspruce and Ravenspire in
their `index.js`, Voltage Park in `maps/adapters.js`). Lengths / verticals are measured start → finish on the course
(`node web/scripts/trails-check.mjs --measure`; Lake Tahoe: the resort data). ★ = featured.

### Valcrest (Coastal Alps · hand-built)

Map `valcrest-gully`. A winding powder gully between rock walls: berms, side hits, pillows and five natural drops.

| trail id | name | difficulty | length | vertical | start |
| --- | --- | --- | --- | --- | --- |
| `gully` | Valcrest Gully ★ | ■ blue | 2450 m | 650 m | default spawn |
| `middle-drops` | The Middle Drops | ■ blue | 1760 m | 470 m | course.trailSpawn |
| `the-steep` | The Steep | ◆ black | 1330 m | 360 m | course.trailSpawn |
| `lower-gully` | Lower Gully | ■ blue | 940 m | 240 m | course.trailSpawn |
| `big-drop` | The Big Drop | ◆ black | 430 m | 110 m | course.trailSpawn |

### Blackspruce (Boreal ridge · steep trees)

Map `blackspruce`. A steep face in dense spruce: weave the lanes, thread the slots, drop the rock band.

| trail id | name | difficulty | length | vertical | start |
| --- | --- | --- | --- | --- | --- |
| `the-plunge` | The Plunge · FLOW ★ | ◆ black | 2030 m | 1100 m | default spawn |
| `slot` | SLOT ★ | ◆◆ double-black | 1850 m | 1010 m | course.trailSpawn |
| `long-way` | LONG WAY | ■ blue | 1850 m | 1010 m | course.trailSpawn |
| `kicker-meadow` | Kicker Meadow | ◆ black | 1620 m | 870 m | course.trailSpawn |
| `rock-band` | Rock Band Drop | ◆◆ double-black | 1280 m | 680 m | course.trailSpawn |
| `deadfall` | Deadfall | ◆ black | 1110 m | 590 m | course.trailSpawn |
| `the-gauntlet` | The Gauntlet | ◆◆ double-black | 780 m | 420 m | course.trailSpawn |
| `big-air` | Big Air & Old Growth | ◆ black | 530 m | 250 m | course.trailSpawn |

### Ravenspire (Lone horn · big-mountain freeride)

Map `ravenspire`. An isolated face with stacked cliff bands, spines, pillows, a deep ravine and an abandoned lift station.

| trail id | name | difficulty | length | vertical | start |
| --- | --- | --- | --- | --- | --- |
| `heli-drop` | Heli Drop ★ | ◆ black | 2510 m | 1600 m | default spawn |
| `the-stacks` | The Stacks ★ | ◆◆ double-black | 1660 m | 900 m | drop zone "The Stacks" |
| `spine-wall` | Spine Wall | ◆◆ double-black | 2390 m | 1530 m | drop zone "Spine Wall" |
| `the-couloir` | The Couloir | ◆◆ double-black | 2200 m | 1350 m | drop zone "The Couloir" |
| `the-hammer` | The Hammer | ◆◆ double-black | 1820 m | 1100 m | drop zone "The Hammer" |
| `station-cliff` | Station Cliff | ◆ black | 1230 m | 530 m | drop zone "Station Cliff" |
| `the-ravine` | The Ravine | ◆ black | 1490 m | 730 m | drop zone "The Ravine" |
| `pillow-stacks` | Pillow Stacks | ◆ black | 1060 m | 420 m | drop zone "Pillow Stacks" |
| `lower-bowl` | Lower Bowl | ■ blue | 980 m | 350 m | drop zone "Lower Bowl" |

### Voltage Park (Event terrain park · night session)

Map `voltage-park`. A fast floodlit contest park: a slopestyle course to the Megawatt mega kicker and a road gap,
stacked lanes, spines, a superpipe and a big air tower. The map declares its own trails (maps/voltage/layout.js
`TRAILS`, `course.trailSpawn`); every trail is ridden on to the finish line.

| trail id | name | difficulty | length | vertical | start |
| --- | --- | --- | --- | --- | --- |
| `slopestyle` | Slopestyle Course ★ | ▬ park | 1145 m | 385 m | the start ramp's deck (default) |
| `spark` | Spark Lane | ● green | 1110 m | 368 m | course.trailSpawn (top of the lane) |
| `current` | Current Lane | ■ blue | 1110 m | 368 m | course.trailSpawn (top of the lane) |
| `high-voltage` | High Voltage ★ | ◆ black | 1110 m | 368 m | course.trailSpawn (top of the lane) |
| `grid` | The Grid | ▬ park | 1100 m | 362 m | course.trailSpawn (top of the Grid) |
| `stairway` | The Stairway | ◆ black | 768 m | 271 m | drop zone 9 (top of the Launch) |
| `hip-row` | Hip Row | ■ blue | 680 m | 229 m | course.trailSpawn |
| `superpipe` | The Conduit | ◆ black | 651 m | 219 m | drop zone 6 (top of the pipe) |
| `big-air` | The Tower ★ | ◆◆ double-black | 679 m | 228 m | drop zone 5 (the scaffold deck) |

### Lake Tahoe (Sierra Nevada · California / Nevada)

Map `lake-tahoe`. Ten real resorts around the lake, from elevation data and OpenStreetMap, with their real lifts.

| trail id | name | difficulty | length | vertical | start |
| --- | --- | --- | --- | --- | --- |
| `olympic_valley:0` | Main Chute → Newport → Sunnyside ★ (Olympic Valley) | ◆◆ double-black | 4136 m | 785 m | variant {"resort":"olympic_valley","run":0} (default) |
| `olympic_valley:1` | Kitchen Wall → Sun Bowl → Bullet (Olympic Valley) | ◆◆ double-black | 3832 m | 775 m | variant {"resort":"olympic_valley","run":1} |
| `olympic_valley:2` | Monument Ridge → Emigrant Face → Bailey's (Olympic Valley) | ■ blue | 5609 m | 760 m | variant {"resort":"olympic_valley","run":2} |
| `alpine_meadows:0` | D5 → Wolverine → The Face (Alpine Meadows) | ■ blue | 2063 m | 473 m | variant {"resort":"alpine_meadows","run":0} |
| `alpine_meadows:1` | Alpine Bowl → Rock Garden → Upper Loop Road (Alpine Meadows) | ■ blue | 2616 m | 468 m | variant {"resort":"alpine_meadows","run":1} |
| `alpine_meadows:2` | Keyhole 2 → Keyhole 1 → East Palisades (Alpine Meadows) | ◆◆ double-black | 2062 m | 458 m | variant {"resort":"alpine_meadows","run":2} |
| `mt_pluto:0` | Sierra Grande → Challenger → Lower Burnout (Mt. Pluto) | ◆ black | 2780 m | 566 m | variant {"resort":"mt_pluto","run":0} |
| `mt_pluto:1` | Polaris → Lower Burnout (Mt. Pluto) | ◆ black | 1877 m | 564 m | variant {"resort":"mt_pluto","run":1} |
| `mt_pluto:2` | West Ridge → Upper Jibboom → Goldmine (Mt. Pluto) | ■ blue | 3800 m | 550 m | variant {"resort":"mt_pluto","run":2} |
| `monument_peak:0` | Ellie's → California Trail → High Five (Monument Peak) | ◆ black | 7214 m | 1004 m | variant {"resort":"monument_peak","run":0} |
| `monument_peak:1` | Aries → Orion's Belt → Big Dipper (Monument Peak) | ■ blue | 5148 m | 689 m | variant {"resort":"monument_peak","run":1} |
| `monument_peak:2` | Cloud 9 → Olympic Downhill → Lower Stagecoach (Monument Peak) | ■ blue | 2860 m | 594 m | variant {"resort":"monument_peak","run":2} |
| `kirkwood:0` | Headwaters → Wagon Trail → Short Spoke (Kirkwood Valley) | ◆ black | 1823 m | 489 m | variant {"resort":"kirkwood","run":0} |
| `kirkwood:1` | The Wall → Buckboard (Kirkwood Valley) | ◆◆ double-black | 1714 m | 483 m | variant {"resort":"kirkwood","run":1} |
| `kirkwood:2` | Notch chute → all the way → The Drain (Kirkwood Valley) | ◆◆ double-black | 1719 m | 432 m | variant {"resort":"kirkwood","run":2} |
| `huckleberry:0` | Sugar n' Spice (Huckleberry Ridge) | ● green | 3834 m | 477 m | variant {"resort":"huckleberry","run":0} |
| `huckleberry:1` | Eastabout → Castle → Lower Castle (Huckleberry Ridge) | ◆ black | 2206 m | 475 m | variant {"resort":"huckleberry","run":1} |
| `huckleberry:2` | Chair Line (unofficial) → Lower Dynamite → Sugar n' Spice (Huckleberry Ridge) | ◆◆ double-black | 1506 m | 470 m | variant {"resort":"huckleberry","run":2} |
| `mt_rose:0` | El Cap → Tailings (Mt. Rose) | ◆◆ double-black | 1081 m | 404 m | variant {"resort":"mt_rose","run":0} |
| `mt_rose:1` | Main Lodge Return → Kit Carson Traverse → Around The World (Mt. Rose) | ■ blue | 3582 m | 402 m | variant {"resort":"mt_rose","run":1} |
| `mt_rose:2` | Upper Northwest → Express → Northwest Passage (Mt. Rose) | ■ blue | 1418 m | 384 m | variant {"resort":"mt_rose","run":2} |
| `mt_lincoln:0` | Rhalves' Run → Shortcut → California Street (Mt. Lincoln) | ■ blue | 2633 m | 424 m | variant {"resort":"mt_lincoln","run":0} |
| `mt_lincoln:1` | Century Club → Sherpa Creek → Sidewinder (Mt. Lincoln) | ◆◆ double-black | 2375 m | 381 m | variant {"resort":"mt_lincoln","run":1} |
| `mt_lincoln:2` | Tunnel → Sunset Boulevard Upper → Sunset Boulevard Lower (Mt. Lincoln) | ◆◆ double-black | 1380 m | 345 m | variant {"resort":"mt_lincoln","run":2} |
| `homewood:0` | Quail Peak → Rainbow Ridge → Upper Homeward Bound (Homewood) | ■ blue | 3247 m | 498 m | variant {"resort":"homewood","run":0} |
| `homewood:1` | Rainbow Ridge → Bonanza → Pot O' Gold (Homewood) | ● green | 3050 m | 498 m | variant {"resort":"homewood","run":1} |
| `homewood:2` | Noonchester Traverse → Hobbit Land → Second Creek (Homewood) | ■ blue | 3031 m | 483 m | variant {"resort":"homewood","run":2} |
| `diamond_peak:0` | Crystal Ridge → Lakeview → Penguin (Diamond Peak) | ■ blue | 2820 m | 536 m | variant {"resort":"diamond_peak","run":0} |
| `diamond_peak:1` | The Great Flume → Spillway → Lodgepole (Diamond Peak) | ■ blue | 2531 m | 535 m | variant {"resort":"diamond_peak","run":1} |
| `diamond_peak:2` | G. S. → School Yard (Diamond Peak) | ◆ black | 634 m | 216 m | variant {"resort":"diamond_peak","run":2} |
