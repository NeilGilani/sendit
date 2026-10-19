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

## Design system: "lift ticket & trail sign"

The lobby, the case overlay, the pause / settings / results screens, the loading-screen type and the
HUD's type all follow one system. Keep new UI on it, and don't invent new colours, radii or fonts.

### Why (the audit, October 2026)

The first lobby looked machine-made: Inter / system sans everywhere, heavy italic on every label,
gradient text on the logo, cyan → pink → violet gradients, glass panels (backdrop blur) on every
surface, pill shapes (`999px`) on tabs, chips, buttons, tags and the toast, 0.6–1.2 em radii on
everything, soft glows, emoji icons (🥇, 🌲, 📚 in achievements and medals), identical rounded cards
and low-contrast grey text over bright snow. Nothing said "ski season".

### Direction

References: trail-map signage at real resorts (enamel sign plates, the green circle / blue square /
black diamond, bold condensed caps), paper lift tickets (die-cut notches, perforations, printed serials,
one colour band), the restraint of outdoor brands such as Arc'teryx, Burton, Salomon and Black Crows
(mostly black and white plus one accent, condensed uppercase headings, lots of hairlines),
TGR / Warren Miller posters (big condensed headline over a photo), and the flat menus of Steep and
Riders Republic (solid dark panels, a strong active-tab state). SSX Tricky is the energy, used for
one thing only, the Ride button. Nothing is copied: no logos, no brand typefaces.

What this means on screen:
- **Sign plates.** The active tab, the selected trail (bottom right), the Zen / Challenge choice and
  the trail difficulty symbols sit on snow-white plates with dark text, as on a trail sign.
- **The lift ticket.** The profile chip is a paper ticket: notched edges (CSS mask), a dashed
  perforation, the name in condensed caps, a mono meta line, the level tag and an XP strip.
- **One accent.** Ski-patrol orange marks the action (Ride, the row's Ride column), the current
  selection (a 3 px orange edge), the active tab's top rule and keyboard focus. The rest is navy,
  snow and hairlines. Gold is kept for medals / bests / case opening, rarity colours for items.
- **Flat surfaces.** Panels are solid night navy at ~92 % with a 1 px hairline. No backdrop blur
  (also cheaper on the GPU), no gradients on UI chrome, shadows only to lift a plate off the scene.
- **Real symbols, not emoji.** Trail difficulty uses the trail-sign shapes (`maps/badges.js`: square
  corners on the blue square, a rectangle for the park). Medals are coloured discs. Achievement
  badges draw colour emoji as line icons and other glyphs as text glyphs (`progression/lobby.js`).

### Type

Two families, loaded from Google Fonts in `index.html` without blocking the first paint
(`media="print" onload`); the fallback is Helvetica / Arial, so nothing breaks offline.

| role | family / setting | used for |
|---|---|---|
| display | Archivo 800–900, `font-stretch: 70–75%`, uppercase, `letter-spacing: 0.01em` | panel titles, card / trail / item names, Ride, mountain hero |
| wordmark | Archivo 900, `font-stretch: 125%` (expanded), the I in orange | `SENDIT` in the top bar, `.title` on shared screens |
| UI | Archivo 400–700 at normal width | body text, descriptions, list rows |
| caps label | Archivo 600, 0.72 em, uppercase, `letter-spacing: 0.14em` | section heads (`.lp-h3`, `.pg-h`, `.tr-group`), stat names |
| data | IBM Plex Mono 500–600 | serials, keys (`kbd`), XP / km / counts, tags, meta lines, the season |

`#lobby` sets `font-variant-numeric: tabular-nums` so XP, timers and stats line up. Sizes stay in
em off `#lobby`'s fluid size. Scale: 0.62–0.72 (micro / caps), 0.78–0.84 (small), 1 (body),
1.15–1.4 (names), 1.7 (panel title), 2–2.2 (mountain hero, Ride).

### Colour tokens (`:root` in `web/src/style.css`)

| token | value | use |
|---|---|---|
| `--c-night` | `#0a121a` | top bar, scrims |
| `--c-ink` | `#0f1a24` | panels (used at ~0.92 alpha) |
| `--c-ink-2` / `--c-ink-3` | `#16232f` / `#20303f` | raised cards and rows / hover |
| `--c-line` / `--c-line-2` | snow at 14 % / 30 % | hairlines / control borders |
| `--c-snow` | `#f2f4f1` | primary text, sign plates, the ticket |
| `--c-snow-2` | `#b3bfca` | secondary text (8.9:1 on ink) |
| `--c-snow-3` | `#8a97a4` | captions, section heads (5.6:1 on ink) |
| `--c-paper-ink` / `--c-paper-dim` | `#0f1a24` / `#4d5a66` | text on snow plates (6.6:1 for the dim one) |
| `--c-signal` / `--c-signal-2` | `#ff5a1f` / `#ff7a45` | the accent: Ride, selection edge, active rule, focus |
| `--c-ice` | `#8fd0ee` | progress fills, data |
| `--c-pine` | `#2f9d5c` | done / owned / online |
| `--c-gold` | `#f3c14b` | medals, personal bests, Open case |
| `--c-alert` | `#e5382b` | NEW and count badges |
| trail colours | green `#1f9d55`, blue `#1f66d6`, black `#0b0f14`, park `#f47b20` | difficulty only |

The old `--lb-*` names still exist on `#lobby` and point at these tokens, for code outside the lobby
files that uses them. New code should use `--c-*`. The 3D plinth rim (`lobby/config.js` `STAGE.neon`)
uses the same orange.

### Radii, lines, states

- **Radii:** `--r1` = 2 px for controls, cards, rows and tags; `--r2` = 4 px for panels and the case
  reveal card; 0 for strips (top bar, segmented controls inside, bars and gauges). The only round
  things are things that are round: the green-circle symbol, medals, the collection dial and the
  piste-map dots.
- **Hairlines** separate list rows (leaderboard, challenges, map mastery, slots) instead of a card
  per row. Section heads end in a hairline (`::after`).
- **Selected** = snow 1 px border + a 3 px orange inner edge on the left (`box-shadow: inset 3px 0 0`)
  (equipment option, trail row, ticket-sheet rows). **Active tab** = snow plate + 3 px orange top
  rule. **Focus** = 2 px orange outline (`:focus-visible`), inset on tabs and rows; Ride shows a dark
  bar along its bottom edge because the arrow shape (clip-path) would cut an outline.
- **Bars:** square, 4 px (XP, challenges) or a ten-segment gauge (equipment stats, `.eq-bar` mask).

### Components

| component | classes | notes |
|---|---|---|
| top bar | `.lb-top .lb-brand .lb-tabs .lb-tab .lb-key` | full-bleed strip; words on wide screens, icons + the active word ≤ 1240 px |
| lift ticket | `.lb-chip .lb-avatar .lb-chip-text` (+ `.pg-badge .pg-chipbar`) | notched with a CSS mask |
| panel | `.lb-panel .lp-title .lp-sub .lp-h3 .lp-hint` | `.lp-sub` carries the hairline under the header |
| tag | `.lp-pill` (`.on`, `.subtle`, `.gold`) | mono caps, 2 px, no pills any more (the class name stayed) |
| button | `.lp-btn` (`.small`, `.ghost`) | condensed caps; primary actions are plates (Ride orange, Open case gold) |
| trail sign | `.lb-map` | snow plate, difficulty symbol, mountain accent as the bottom band |
| Ride | `.lb-ride` | orange, arrow end (`clip-path`), condensed 900 caps |
| mode switch | `.lb-mode-seg .lb-mode-info` | segmented, caption plate below |
| toast | `.lb-toast`, `.cn` (case notes), `#juiceHud .tt` | navy plate, coloured inner left edge |
| item frame | `.cr-card`, `.lk-item`, `.cs-grid` | flat plate, grade colour as the bottom band; the item pictures are not styled here |

Mountain cards (`.mt-art`) and the trail-view header (`.mt-head`) are framed for full-bleed
photographic art (~16:10): the picture may come as the `--art` background or as an `<img>` child, both
`cover`ed; a top scrim carries the tags, a deeper bottom scrim the region caption, and the mountain's
accent is a 3 px band under the picture. The art itself belongs to the map-image code, not this CSS.

Cases and Locker overrides are appended at the end of `lobby/cases/cases.css` (so the item-art code
above merges cleanly); the Progress tab's CSS is the `CSS` string in `progression/lobby.js`; the
Maps tab is `lobby/tabs/maps.css`.

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
