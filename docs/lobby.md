# Sendit lobby: the skeleton

The lobby is the first screen after loading. It shows your rider on a snowy turntable you can
rotate, a tab bar, one panel, your profile chip, the selected map and the **Ride** button. Only
**Equipment** (Skis / Snowboard) is a real feature today. Every other area is a stub or registry that
later work plugs into: character customization, maps, multiplayer, leaderboards, profile and
settings.

```
npm --prefix web run dev          → http://localhost:5173/        (lobby)
                                    http://localhost:5173/?ride   (skip straight into a ride)
node web/scripts/lobbytest.mjs http://localhost:5173/             (end-to-end check, ~1 min)
node web/scripts/lobbyshot.mjs http://localhost:5173/ out.png 2 "tab:maps"   (screenshot)
```

## Architecture

```
main.js ── boot: loadMap(resolveMapSelection()) → world → Lobby + LobbyStage
   │        flow: lobby ──Ride──▶ riding ──Esc──▶ pause ──Back to lobby──▶ lobby
   │        frame(): in the lobby only the stage is simulated and rendered (world frozen)
   │
   ├─ ui.js            screens: loading · lobby · pause (+ settings / credits overlays), HUD,
   │                   menu navigation for keyboard (arrows) and gamepad (d-pad, A, B, LB/RB, Start)
   ├─ input.js         + menuActions() (gamepad with key repeat), last-used device → 'inputDevice'
   ├─ state.js         Mode (LOBBY = MENU), event bus (on → unsubscribe, once, off), settings
   │
   ├─ lobby/
   │   ├─ Lobby.js            controller: DOM, tab lifecycle, layout → stage framing, keys, toasts
   │   ├─ stage.js            LobbyStage: own scene/camera/post, turntable, preview Rider, shots
   │   ├─ tabs.js             registerLobbyTab registry
   │   ├─ tabs/*.js           equipment (real), character, maps, multiplayer, leaderboards,
   │   │                      profile, settings (minimal / coming soon)
   │   ├─ equipmentBridge.js  optional calls into the snowboard work (see below)
   │   ├─ placeholderBoard.js labelled PLACEHOLDER snowboard (until the real one exists)
   │   ├─ nav.js              spatial focus navigation (lobby, pause, settings, credits)
   │   ├─ config.js           lobby tunables: palette, camera SHOTS, turntable feel
   │   └─ lobby.css, icons.js
   ├─ profile/
   │   ├─ schema.js           versioned profile + MIGRATIONS + sanitize()
   │   ├─ store.js            profileStore: load/save/migrate, loadout, map, stats, unlocks
   │   ├─ catalog.js          item catalog: CATEGORIES, SLOTS, EQUIPMENT_TYPES, STATS, items
   │   └─ tracker.js          ride events → profile stats + leaderboard submit
   ├─ maps/
   │   ├─ registry.js         registerMap, resolveMapSelection, loadMap (with fallback)
   │   └─ builtin.js          valcrest-gully (default), lake-tahoe (real mountains, variants)
   └─ services/
       ├─ index.js            services locator + provideService(name, impl)
       ├─ network.js          NetworkService → NullNetworkService (offline)
       ├─ leaderboard.js      LeaderboardService → LocalLeaderboard (this browser)
       ├─ identity.js         IdentityService → LocalIdentityService (guest id)
       └─ storage.js          JSON key/value over localStorage (memory fallback)
```

**Data flow for a gear change:** Equipment tab → `profileStore.setEquipment('snowboard')` → saves
the profile → emits `loadout` → main.js tells the stage (`stage.setEquipment`, which plays a hop and
swaps at the top) and the game rider (`applyEquipment`). Tabs never touch 3D objects directly, so a
future Character tab only has to call `profileStore.equip(itemId, variantId)`.

**Rendering:** the stage has its own scene, camera, lights and a small post stack (bloom, vignette,
SMAA) on the shared `WebGLRenderer`. While the lobby is visible, `frame()` skips the world
entirely. Toon materials read a few world globals (`uSunDir`, baked `sunMaskTex`, `uWater`), so
`LobbyStage.render()` swaps in stage values and restores them afterwards. If the stage fails to
build, the lobby UI still works over the world's menu flyover.

**Framing:** `Lobby.layout()` measures the free screen area (right of the panel on wide screens,
above the bottom sheet on narrow ones). `LobbyStage` then sets the camera distance so the subject
fits that area and uses a lens shift (`setViewOffset`) to centre it there. Each tab picks a camera
shot (`full`, `gear`, `portrait`, `wide` in `lobby/config.js`), and the camera eases between them.

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
| `lobbyGearMode` | `'native' \| 'builtin' \| 'module' \| 'placeholder'` | stage |
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
`ctx` = `{ profile, catalog, maps: { list, get, current }, services, stage, on, toast, ride, select, showCredits }`.
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
});
```
The Maps tab lists it. Picking it saves `profile.map` and reloads, because maps are built during
boot. `?map=<id>` loads one directly. A map that fails to load falls back to `valcrest-gully`.

### Add a catalog item
```js
import { registerItem } from '../profile/catalog.js';
registerItem({
  id: 'jacket-storm-orange', name: 'Storm Shell', slot: 'jacket', brand: 'Northwake',
  variants: [{ id: 'orange', name: 'Orange', colors: { base: '#ff7a2f', accent: '#1b1446' } }],
  stats: {}, unlock: { type: 'distance', value: 50000 },   // or 'default' | 'score' | 'runs' | 'locked'
});
```
Slots: helmet, goggles, jacket, gloves, pants (outfit) and skis, poles, board, bindings (gear). The
first `unlock: default` item per slot goes into fresh loadouts. `unlockState(item, profile)` gives
`{ unlocked, progress, label }`, and `profileStore.equip()` refuses locked items. Rendering an item
is the rider's job: `item.model` (`{ kind, ref }`) is a hint for it.

### Swap in a real service
```js
import { provideService } from './services/index.js';
provideService('leaderboard', new CloudLeaderboard({ url, identity: services.identity }));
provideService('network', new WebSocketNetwork(url));
```
Implement the base class in `services/<name>.js` (`NetworkService`, `LeaderboardService`,
`IdentityService`). Callers only use `services.<name>`. The Leaderboards and Multiplayer tabs
re-render on the `service` event.

## Snowboard integration (rider.js / player.js / src/equipment/ belong to the snowboard work)

All calls go through `web/src/lobby/equipmentBridge.js` and are optional:

| call | where | when |
|---|---|---|
| `rider.setEquipment?.(type)` | preview rider (stage.js) and game rider (main.js) | at boot, on every `loadout` change, at ride start |
| `player.setEquipment?.(type)` | preview player and game player | same |
| `createEquipmentModel(type, variant)` | any `web/src/equipment/*.js` that exports it (found with `import.meta.glob`) | only if `rider.setEquipment` is missing and the type is `snowboard`; the returned Object3D is added to `rider.visual` in place of the skis |

`type` is `'skis'` or `'snowboard'`. `variant` is currently `null`; later it will be the catalog
variant. Today neither API exists, so:
- **Lobby preview:** hides `rider.skis` / `rider.poles` and shows `lobby/placeholderBoard.js`
  (hazard-striped "PLACEHOLDER" top sheet, strap bindings), with a "Placeholder model" badge and a
  note in the Equipment tab.
- **In a ride:** the rider still uses skis, and a hint says "Snowboards are coming soon · riding
  skis for now".

When `rider.setEquipment` lands, the bridge reports `'native'`: the placeholder, badge, note and hint
all go away with no lobby changes. The preview rider is a real `Player` with a flat stub terrain,
so any field the snowboard rig reads from the player exists. It runs `State.GROUNDED` with
`speed = 1.4`, a gentle `turnInput` sway, and `squat` / `AIR` / `landingEvent` for the swap hop.

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
| ride | Enter (Ride is focused on entry) | Start | tap Ride |
| close overlay | Esc | B | Back button |

Hint glyphs follow the last-used device (`body.device-*`).

## Known issues / limits

- The snowboard preview is a placeholder and rides still use skis until `rider.setEquipment`
  exists (see above). The placeholder rider keeps the ski stance on the board.
- Switching maps reloads the page, because maps are built at boot.
- Character, Multiplayer and global leaderboards are "coming soon" stubs. Leaderboards are per
  browser (`LocalLeaderboard`).
- Starting a ride with the gamepad can't take pointer lock (browsers need a mouse or keyboard
  gesture). Mouse look starts after the first click; the gamepad's right stick works anyway.
- Software WebGL (headless tests) renders the lobby at about 3 fps. Timing-based checks in
  `lobbytest.mjs` count frames, not milliseconds.
- `?ride` builds the lobby stage only on the first return to the lobby, which adds a short wait
  during that fade.
