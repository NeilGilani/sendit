# Sendit lobby: the skeleton

The lobby is the first screen after loading. Your rider stands on a snow plinth a little way down
the selected map's run, **inside the real game world**: same terrain, trees, sky, sun, shadows and
post stack as a ride. You can rotate them like a turntable. Around the rider sit a tab bar, one
panel, your profile chip, the selected map, the **Zen / Challenge** mode switch and the **Ride**
button (it reads **Race** in Challenge; the choice is saved in `sendit.mode`). **Equipment**
(Skis / Snowboard) and the **Locker** (earned outfit colourways, see [character.md](character.md) and
[rewards.md](rewards.md)) are real features. The other areas are stubs or registries that later work plugs into: maps, multiplayer,
leaderboards, profile and settings.

```
npm --prefix web run dev                → http://localhost:5173/        (lobby)
                                          http://localhost:5173/?ride   (skip straight into a ride)
GPU=1 node web/scripts/lobbytest.mjs http://localhost:5173/   (end-to-end check, ~30 s on a GPU)
node web/scripts/unittest.mjs                                  (data layer: profile, catalog, leaderboard, maps, lobby spot)
GPU=1 node web/scripts/lobbyshot.mjs http://localhost:5173/ out.png 2 "tab:maps"   (screenshot)
```

`GPU=1` runs headless Chromium on the real GPU (ANGLE D3D11). Without it the scripts use SwiftShader,
which is very slow with the full world behind the lobby (minutes per run, frame-counted waits).

## Architecture

```
main.js ── boot: loadMap(resolveMapSelection()) → world → LobbyStage at lobbySpot() + Lobby
   │        flow: lobby ──Ride──▶ riding ──Esc──▶ pause ──Back to lobby──▶ lobby
   │        frame(): the world always renders. In the lobby the stage drives the world camera, the
   │                 game rider is hidden and frozen at the start, and the sun's shadow box
   │                 centres on the plinth.
   │
   ├─ ui.js            screens: loading · lobby · pause (+ settings / credits overlays), HUD,
   │                   menu navigation for keyboard (arrows) and gamepad (d-pad, A, B, LB/RB, Start)
   ├─ input.js         gameplay mapping + menuActions() (gamepad with key repeat), last-used device → 'inputDevice'
   ├─ state.js         Mode (LOBBY = MENU), event bus (on → unsubscribe, once, off), settings
   │
   ├─ lobby/
   │   ├─ Lobby.js            controller: DOM, tab lifecycle, layout → stage framing, keys, toasts
   │   ├─ stage.js            LobbyStage: plinth + preview Rider in the world scene, turntable,
   │   │                      camera shots, activate()/deactivate() camera ownership
   │   ├─ tabs.js             registerLobbyTab registry
   │   ├─ tabs/*.js           equipment (real), locker (real), cases, maps, multiplayer, leaderboards,
   │   │                      profile, settings (minimal / coming soon)
   │   ├─ equipmentBridge.js  the two optional calls into rider.js / player.js (see below)
   │   ├─ nav.js              spatial focus navigation (lobby, pause, settings, credits)
   │   ├─ config.js           lobby tunables: plinth, neon, camera SHOTS, turntable feel, hero angles
   │   └─ lobby.css, icons.js
   ├─ profile/
   │   ├─ schema.js           versioned profile + MIGRATIONS + sanitize()
   │   ├─ store.js            profileStore: load/save/migrate, loadout, gearModel(), map, stats, unlocks
   │   ├─ catalog.js          item catalog: CATEGORIES, SLOTS, EQUIPMENT_TYPES, STATS, items, gearModel()
   │   └─ tracker.js          ride events → profile stats + leaderboard submit
   ├─ maps/
   │   ├─ registry.js         registerMap, resolveMapSelection, loadMap (with fallback), lobbySpot
   │   └─ builtin.js          valcrest-gully (default), lake-tahoe (real mountains, variants)
   └─ services/
       ├─ index.js            services locator + provideService(name, impl)
       ├─ network.js          NetworkService → NullNetworkService (offline)
       ├─ leaderboard.js      LeaderboardService → LocalLeaderboard (this browser)
       ├─ identity.js         IdentityService → LocalIdentityService (guest id)
       └─ storage.js          JSON key/value over localStorage (memory fallback)
```

**Data flow for a gear change:** Equipment tab → `profileStore.setEquipment('snowboard')` → saves
the profile → emits `loadout` → main.js tells the stage (`stage.setEquipment(type, { variant })`,
which plays a hop and swaps at the top) and the game rider (`applyGameEquipment`). `variant` is
`profileStore.gearModel(type)`: the equipment model of the equipped catalog item. Tabs never touch
3D objects directly, so a future gear picker only has to call `profileStore.equip(itemId, variantId)`.

**Rendering:** the stage owns a group (plinth + preview rider) that it adds to the world scene. While
the lobby is visible, `stage.update()` animates the rider and places the world camera; `frame()`
skips the ride camera controller and renders the world as usual (terrain, trees, sky, shadows,
post). The plinth uses the game's snow optics (`gfx/snow.js` band shader). On **Ride** the stage
hands the camera back (`deactivate()` clears the lens shift) and the ride intro sweeps on from the
lobby camera. Because the world has been rendering all along, its shaders and textures are warm,
so a ride starts without a black frame. If the stage fails to build, the lobby UI still works over
the menu flyover.

**Where the lobby stands:** `lobbySpot(map, course, terrain)` (maps/registry.js). Default: 40 m
(`LOBBY_ALONG`) down `course.path`, past the start banner, with the camera looking within ±0.6 rad
of the fall line toward the most open view (where the terrain ahead drops furthest). A map can
override it with `lobby({ course, terrain, spawn }) → { x, z, heading }`. The plinth top sits just
above the highest snow under it and its skirt reaches into the slope.

**Framing:** `Lobby.layout()` measures the free screen area (right of the panel on wide screens,
above the bottom sheet on narrow ones). `LobbyStage` then sets the camera distance so the subject
fits that area and uses a lens shift (`setViewOffset`) to centre it there. Each tab picks a camera
shot (`full`, `gear`, `portrait`, `wide` in `lobby/config.js`), and the camera eases between them.
The turntable rests at a per-gear hero angle (`TURNTABLE.heroYaw`): 3/4 front for skis, toe side
(chest) for a snowboard.

### Events (state.js bus)

| event | payload | from |
|---|---|---|
| `mode` | Mode value | setMode |
| `loadout` | `{ equipment, slot, item?, variant?, reason }` | profileStore |
| `profile` | `{ profile, reason }` | profileStore |
| `rideStarted` | `{ mapId, equipment }` | main.js |
| `rideEnded` | `{ score, distance, airTotal, smoothTurns }` | main.js (leaving a ride) |
| `runComplete` | none | main.js (finish line) |
| `rideRecorded` | `{ score, …, runs, duration, mapId, rank, isNewBest }` | profile/tracker.js |
| `inputDevice` | `'keyboard' \| 'mouse' \| 'gamepad' \| 'touch'` | input.js |
| `lobbyTabs` | `{ id }` | tab registry changes |
| `lobbyGearMode` | `'native' \| 'builtin' \| 'unsupported'` | stage |
| `service` | `{ name, impl }` | provideService |

### Profile schema (v1, localStorage `sendit.profile`)

```js
{ version: 1, identityId, displayName, createdAt, updatedAt,
  loadout: { equipment: 'skis' | 'snowboard', slots: { <slot>: { item, variant } } },
  map: { id, variant },                      // last chosen map
  links: { settings: 'sendit.settings' },    // settings stay in state.js, linked by key
  stats: { rides, runsCompleted, distance, airTime, smoothTurns, bestScore, totalScore, playTime, lastRideAt },
  unlocks: { items: [] } }
```

`migrateProfile()` upgrades step by step through `MIGRATIONS[fromVersion]` and then `sanitize()`
checks every field against the catalog. Unknown items fall back to the slot default, a bad
equipment value falls back to skis, and a profile from a newer build keeps the fields this build
understands. v0 means "no profile yet": the first profile picks up the old `sendit.best` score
and the old `settings.resort/run` mountain choice.

Other keys: `sendit.settings` (unchanged), `sendit.leaderboard`, `sendit.identity`, and
`sendit.lobby.tab` (last open tab).

## How to…

### Add a lobby tab
```js
// web/src/lobby/tabs/stats.js, then import it in web/src/lobby/index.js
import { registerLobbyTab } from '../tabs.js';
registerLobbyTab({
  id: 'stats', label: 'Stats', order: 55, icon: '<svg …/>', shot: 'portrait', status: 'ready',
  mount(el, ctx) {
    el.innerHTML = `<h2 class="lp-title">Stats</h2>`;
    ctx.on('profile', render);          // auto-unsubscribed when the tab closes
    return () => { /* optional cleanup */ };
  },
  onAction(action, ctx) { return false; } // optional gamepad hook: 'alt' (X), 'alt2' (Y)
});
```
`ctx` = `{ profile, catalog, maps: { list, get, mountains, current, selectTrail }, services, stage, on, toast, ride, select, showCredits, sfx }`.
Reusable styles: `.lp-title .lp-sub .lp-h3 .lp-hint .lp-pill .lp-btn .lp-list .lp-empty` and
`comingSoon()` in `tabs/common.js`. Tabs appear live; `unregisterLobbyTab(id)` removes one.

### Add a map
```js
import { registerMap } from './registry.js';     // e.g. in web/src/maps/builtin.js
registerMap({
  id: 'north-bowl', name: 'North Bowl', description: 'Wide open powder bowl.',
  thumbnail: '/maps/north-bowl.jpg', order: 2,
  load: async ({ variant, onProgress }) => new NorthBowlCourse(),   // Course-compatible object
  // optional: variants: async () => [{ id, group, name, meta, value }], describe: (variant, course) => '…'
  // optional: lobby: ({ course, terrain, spawn }) => ({ x, z, heading }),   // where the lobby plinth stands
  mountain: { id, name, region, blurb, accent }, trails: [{ id, name, difficulty, … }],   // docs/maps.md
});
```
The Maps tab (the mountain browser) shows it under its mountain with its trails; the full mountain /
trail contract (`trails`, `course.trailSpawn`) is in docs/maps.md. Picking a trail on another map saves
`profile.map` (`{ id, variant, trail }`) and reloads, because maps are built during boot; a trail on the
loaded map switches in place. `?map=<id>&trail=<trailId>` loads one directly. A map that fails to load falls back to `valcrest-gully`. The
lobby stands on the new map automatically (see "Where the lobby stands").

### Add a catalog item
```js
import { registerItem } from '../profile/catalog.js';
registerItem({
  id: 'jacket-storm-orange', name: 'Storm Shell', slot: 'jacket', brand: 'Northwake',
  variants: [{ id: 'orange', name: 'Orange', colors: { base: '#ff7a2f', accent: '#1b1446' } }],
  stats: {}, unlock: { type: 'distance', value: 50000 },   // or 'default' | 'score' | 'runs' | 'locked'
});
// Gear: point it at a model from src/equipment/specs.js and the preview + game rider will ride it.
registerItem({
  id: 'board-jibworks-butter', name: 'Jibworks Butter 152', slot: 'board', brand: 'Jibworks',
  stats: { speed: 5, carve: 5, pop: 8, stability: 4 }, unlock: { type: 'score', value: 5000 },
  model: { kind: 'equipment', ref: 'park' },
});
```
Slots: helmet, goggles, jacket, gloves, pants (outfit) and skis, poles, board, bindings (gear). The
first `unlock: default` item per slot goes into fresh loadouts. `unlockState(item, profile)` gives
`{ unlocked, progress, label }`, and `profileStore.equip()` refuses locked items. For gear,
`catalog.gearModel(item)` / `profileStore.gearModel(type)` turn the primary slot's item into the
model id passed to `setEquipment`. Outfit items point at a garment (`model: { kind: 'outfit', ref }`)
and their variants are colourways; the rider dresses from them (see [character.md](character.md)).

### Swap in a real service
```js
import { provideService } from './services/index.js';
provideService('leaderboard', new CloudLeaderboard({ url, identity: services.identity }));
provideService('network', new WebSocketNetwork(url));
```
Implement the base class in `services/<name>.js` (`NetworkService`, `LeaderboardService`,
`IdentityService`). Callers only use `services.<name>`. The Leaderboards and Multiplayer tabs
re-render on the `service` event.

## Snowboard / equipment integration (rider.js, player.js, src/equipment/ are not lobby files)

The snowboard work is merged, so the lobby uses the real models and physics. All calls go through
`web/src/lobby/equipmentBridge.js` and stay optional:

| call | where | when |
|---|---|---|
| `player.setEquipment?.(type, variant)` | preview player (stage.js), game player (main.js) | at boot, on every `loadout` change, at ride start |
| `rider.setEquipment?.(type, variant)` | preview rider (stage.js), game rider (main.js) | same |

`type` is `'skis'` or `'snowboard'` (rider/player normalise `'skis'` to `'ski'`). `variant` is the
equipped catalog item's model id (`profileStore.gearModel(type)`, e.g. `'allmountain'`). In the
game, `?variant=<id>` overrides it and `?equip=ski|snowboard` writes the profile so the lobby
agrees. If `rider.setEquipment` ever goes missing, the preview keeps its skis and the Equipment tab
says the board preview is unavailable (`gearMode = 'unsupported'`).

The earlier placeholder board and `createEquipmentModel` auto-discovery were removed once the real
snowboard landed.

## Controls in the lobby

| | keyboard / mouse | gamepad | touch |
|---|---|---|---|
| rotate rider | drag, A / D | right stick | drag |
| zoom | wheel | LT / RT | pinch |
| reset view | R, double-click | Select | double-tap |
| switch tab | Q / E, click | LB / RB | tap |
| move focus | arrows, Tab | d-pad / left stick | n/a |
| activate | Enter / Space | A | tap |
| quick gear swap | n/a | Y (Equipment tab) | n/a |
| Zen / Challenge | click | X | tap |
| ride | Enter (Ride is focused on entry) | Start | tap Ride |
| close overlay | Esc | B | Back button |

Hint glyphs follow the last-used device (`body.device-*`).

## Known issues / limits

- The lobby renders the full world (it costs about as much GPU as riding). The quality setting
  applies to it as in a ride.
- Switching maps reloads the page, because maps are built at boot (switching trails on the loaded map does not).
- The lobby spot heuristic is generic. On an unusual map the view might face a wall; give that map
  a `lobby()` hook.
- Snowboard stance (regular / goofy) is not in the profile yet. The preview and rides use the
  rider's default (`?stance=goofy` still works in a ride).
- Multiplayer and global leaderboards are "coming soon" stubs. Leaderboards are per
  browser (`LocalLeaderboard`).
- Starting a ride with the gamepad can't take pointer lock (browsers need a mouse or keyboard
  gesture). Mouse look starts after the first click; the gamepad's right stick works anyway.
- `?ride` builds the lobby stage only on the first return to the lobby, which adds a short wait
  during that fade.
