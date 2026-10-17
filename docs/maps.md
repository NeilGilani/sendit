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

**The first trail is the map's default start** (the one a plain `?map=<id>` rides). Make it the trail that
starts at the course's normal spawn. Without `trails`, a map gets one trail `{ id: 'main', name: map.name, difficulty: 'blue' }`.
Without `mountain`, a map is its own mountain.

### 2. Implement `course.trailSpawn(trailId)` on the loaded course

```js
class DragonbackCourse {
  trailSpawn(trailId) {
    const z = this.dropZones.find((d) => d.id === trailId);
    return z ? { x: z.x, z: z.z, heading: z.heading } : null;   // null → the default spawn
  }
  // optional:
  trailFinish(trailId) { return trailId === 'south-gully' ? { x: 120, z: 900, radius: 40 } : null; }
}
```

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
- **Leaderboards:** each trail has its own local board: `trailBoardId(mapId, trailId)` = the map id for the
  default trail (so existing scores stay), `<mapId>/<trailId>` otherwise.

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
| `extendMap(id, extra)` | re-register a map with extra fields (adapter for maps owned elsewhere) |

## Mountains and trails today

See the end of this file (kept up to date with the adapters in each map's `index.js` / `builtin.js`).
