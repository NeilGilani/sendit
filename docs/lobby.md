# Sendit lobby

The lobby is the first screen after loading. Your rider stands on a snow plinth a little way down
the selected map's run, **inside the real game world**: same terrain, trees, sky, sun, shadows and
post stack as a ride. You can rotate them like a turntable. It opens on **Home**: the rider centre
stage, three live tiles on the left (level, daily challenges, cases) and the **Ride cluster** bottom
right (the selected trail, the **Zen / Challenge** switch and the big **Ride** button, which reads
**Race** in Challenge; the choice is saved in `sendit.mode`). Five destinations in the top bar lead to
everything else in at most two clicks: **Locker** (Gear = Skis / Snowboard with every owned piece rated, compared and a ★ pick, see [equipment.md](equipment.md) "Gear stats in the Locker"; Skins = earned outfits,
see [character.md](character.md) and [rewards.md](rewards.md)), **Cases**, **Mountains**, **Career**
(Progress, Rankings, Profile), plus **Friends** (multiplayer, coming soon) and **Settings** as icon
buttons. See "Navigation (v2)" and "Design system v2" below.

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
   │   ├─ tabs.js             registerLobbyTab / registerLobbyGroup / setLobbyBadge registry
   │   ├─ tabs/*.js           home (tiles), equipment, locker, cases, maps (real), multiplayer,
   │   │                      leaderboards, profile, settings (minimal / coming soon)
   │   ├─ motion.js           number count-up + throttled hover ticks
   │   ├─ equipmentBridge.js  the two optional calls into rider.js / player.js (see below)
   │   ├─ nav.js              spatial focus navigation (lobby, pause, settings, credits)
   │   ├─ config.js           lobby tunables: plinth, neon, camera SHOTS, turntable feel, hero angles, NAV
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
| `lobbyBadge` | `{ id, n }` | setLobbyBadge (count badges on tabs) |
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

Other keys: `sendit.settings` (unchanged), `sendit.leaderboard`, `sendit.identity`. (v1's
`sendit.lobby.tab` is no longer read: the lobby always opens on Home.)

## How to…

### Add a lobby tab
```js
// web/src/lobby/tabs/stats.js, then import it in web/src/lobby/index.js
import { registerLobbyTab, setLobbyBadge } from '../tabs.js';
registerLobbyTab({
  id: 'stats', label: 'Stats', order: 55, icon: '<svg …/>', shot: 'portrait', status: 'ready',
  group: 'career', short: 'Stats',      // optional: join a destination (sub-tab); omit → its own destination
  // nav: 'utility',                    // optional: an icon button top right instead (like Settings)
  mount(el, ctx) {
    el.innerHTML = `<h2 class="lp-title">Stats</h2>`;
    ctx.on('profile', render);          // auto-unsubscribed when the tab closes
    return () => { /* optional cleanup */ };
  },
  onAction(action, ctx) { return false; } // optional gamepad hook: 'alt' (X), 'alt2' (Y), 'back' (B)
});
setLobbyBadge('stats', 3);              // a count on the sub-tab, its destination and (for Skins) the rider plate
```
`ctx` = `{ profile, catalog, maps: { list, get, mountains, current, selectTrail }, services, stage, on, toast, ride, select, showCredits, sfx }`.
Destinations: `registerLobbyGroup({ id, label, icon, order })`; the built-in five and the placement of
the built-in tabs are `NAV` in `lobby/config.js` (a tab's own `group` / `short` / `nav` win over it).
Keep a destination to 2–4 sub-tabs and the top bar to 5–6 destinations (docs: "Navigation (v2)").
Reusable styles: `.lp-title .lp-sub .lp-h3 .lp-hint .lp-pill .lp-btn .lb-btn3 .lp-list .lp-empty` and
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

## What makes a top-tier game lobby (research, October 2026)

Before v2 we studied the lobbies people actually love, by describing them, not copying them (no
assets, logos or layouts lifted). Sources: the current menus of the games below as widely published
(screenshots, trailers, patch notes), a Pratt IxD design critique of Brawl Stars
(ixd.prattsi.org, 2025) and press coverage of Fortnite's 2023 lobby rework (Dexerto, WePC,
Esports.net).

| game | what it does well | what we took (as a principle) |
|---|---|---|
| **Fortnite** | The skin stands centre stage, big, lit, idling; the screen is the character. A short row of chunky top tabs (Play / Locker / Item Shop / Quests…) is the whole navigation. Play sits alone bottom right, with the selected mode as a card right above it. The battle pass and quests surface as small progress tiles, never as walls of text. When the 2023 rework swapped the slanted chunky tabs for small rounded icons, players complained loudly that it felt generic. | Rider centre stage on Home; five big top destinations; one Ride button bottom right with the trail card above it; progress as tiles. Keep the chunky, slanted identity: it is what people miss when it goes. |
| **Brawl Stars / Clash Royale** | Every button looks pressable: a bright face, a dark bevel underneath, a thick outline, and it squashes when tapped with a pop sound. One enormous yellow Play. Events on the side, trophy road as a single bar. Reward chests wobble when they are ready. The critique's two faults: home screen crowding over time ("featuritis") and too many taps to reach a brawler's details (it proposes tapping the brawler on Home). | The lip under every control (press sinks into it), one huge accent button, a wobbling case when one is ready, count badges that pop. Cap Home at three tiles. Tapping the rider plate on Home opens the Locker directly. |
| **Rocket League** | Garage-first: the car is the hero, the Play button is the biggest thing; menu items are big slanted slabs with sharp hover states and a click sound on every move. Item shop and rocket pass are one press away. | Slant (our --skew) as the speed signature; a sound for hover, move and press. |
| **Apex Legends / Valorant** | Premium restraint: dark flat panels, one accent colour, strict type scale, lots of air. Valorant's Play is a single word at the top centre; everything else is quiet. Apex shows the legend huge with the battle pass level as a compact chip. | Keep v1's one-accent palette and hairline panels: the chunkiness lives in the controls, not in decoration. Level as a compact tile + the ticket chip. |
| **Riders Republic / Steep** | The world is the menu background (Steep's mountain map, Riders Republic's live map); flat, strong-contrast panels with the active tab as a solid plate. Career, social and settings each sit behind one button. | The lobby stays inside the real mountain; utilities (Friends, Settings) as small icon buttons top right; Career groups progress, rankings and profile. |
| **SSX (Tricky / 2012)** | Pure energy: skewed, oversized type, everything leaning forward, loud orange. | Only on the Ride button and the active plate, so it stays special. |
| **Forza Horizon** | Big tiles that each lead somewhere, with live info on them (progress, new); a festival brand that is consistent everywhere. | Home tiles carry live data (level XP, dailies, cases) and are one button each. |

What they share, and the rules we built v2 on:

1. **One obvious primary action.** Play/Ride is the largest, brightest object on screen, always in
   the same place (bottom right), on every screen. Everything else is quieter.
2. **The character is the hero.** Home shows no panel at all; the rider stands in the middle and the
   UI frames them. Customising is one tap from the rider.
3. **Few destinations, shallow depth.** 4–6 top-level items, everything reachable in two presses.
   Related screens become sub-tabs of one destination instead of more top tabs.
4. **Affordance through depth.** Pressable things have a face and a lip, lift on hover and sink on
   press, with a sound. Flat text is for reading, chunky plates are for pressing.
5. **Progress and rewards surface as small live tiles and badges**, not lists: a bar, a number, a
   count badge that pops when it goes up, a case that wobbles when it is ready.
6. **Motion is short and purposeful**: staggered entrances (≤ 0.5 s), a plate that slides between
   tabs, numbers that count up, idle sheen on the primary button. Nothing loops that you have to read.
7. **On-brand everywhere.** Each of these games is recognisable from one button. Ours: the trail
   sign (snow plate, difficulty symbol), the lift ticket, patrol orange, the speed slant.
8. **Readable at any size**: big condensed caps for labels, thumb-reach bottom navigation on phones.

## Navigation (v2)

```
top bar:  SENDIT · [Q] HOME  LOCKER  CASES  MOUNTAINS  CAREER [E] · Friends  Settings  [lift ticket]
          Locker  = Gear (Equipment) · Skins (Locker)
          Career  = Progress · Rankings (Leaderboards) · Profile
          Friends = Multiplayer (utility button)        Settings = Settings (utility button)
bottom right, on every screen:  trail sign  /  Zen · Challenge  +  RIDE
```

- The lobby **opens on Home** and returns to Home after every ride. Each destination remembers the
  sub-tab you last had open (`Lobby.lastInGroup`).
- **Q / E (LB / RB)** move between destinations. **Esc (B)** goes back: the tab first (Maps: trails →
  mountains), then Home, then focus on Ride. The lift ticket opens Profile; the trail sign opens
  Mountains; the rider plate opens Skins.
- Grouping is data, not markup: `NAV` in `lobby/config.js` places the built-in tabs, and a tab can
  set `group`, `short` and `nav: 'utility'` itself (see "Add a lobby tab"). A tab with no group is a
  destination of its own, so a new feature (e.g. Highlights) appears without touching the lobby.
- **Highlights** (`lobby/tabs/highlights.js`, docs/game-feel.md § 8g) registers itself in Career
  (Progress · Highlights · Rankings · Profile; as a sixth destination it pushed Career off the top bar at
  1280 px) with a badge for new clips. Home tiles from other
  features: `tabs/home.js` emits `homeTiles { el, ctx, i }` after each render; a listener appends its own
  `.hm-tile` (Highlights adds "Latest highlight").
- Badges: `setLobbyBadge(tabId, n)` (lobby/tabs.js). The lobby draws the count on the sub-tab, the
  destination (sum of its tabs) and the rider plate (Skins). `cases/notify.js` feeds Cases and Skins.

## Design system v2: "trail sign, with depth"

The lobby, the case overlay, the pause / settings / results screens, the loading-screen type and the
HUD's type all follow one system. Keep new UI on it, and don't invent new colours, radii or fonts.
v2 keeps everything from v1 ("lift ticket & trail sign", below) and adds depth and motion to the
things you press.

### v1 → v2 (what changed and why)

| v1 | v2 |
|---|---|
| Nine flat tabs in a strip; a panel always open over the left third | Five destinations + two utility buttons; Home has no panel, the rider is the hero |
| Flat controls (1 px border, colour change on hover) | Chunky controls: a face on a solid lip, lift on hover, sink on press, hover tick sound |
| Ride: an orange arrow plate the size of the trail sign | Ride: the biggest object, skewed, gradient face, deep lip, idle sheen, `Race` in Challenge |
| Trail sign, mode switch and Ride in one row | One stacked cluster: trail sign on top, mode + Ride below |
| "TODAY" list floating over the scene | Home tiles: Level, Daily challenges, Cases (with Open) |
| Tab badges drawn by the cases code into tab DOM | `setLobbyBadge` registry, drawn by the lobby, pop animation |
| Phone: 9 tiny icons at the top | Phone: a bottom tab bar with labels (thumb reach), ticket + utilities on top |

### Type

Unchanged from v1 (Archivo variable + IBM Plex Mono, loaded without blocking from Google Fonts in
`index.html`). v2 pushes the display cut harder: destination labels and panel titles at
`font-stretch: 68–75%`, weight 800–900, uppercase; numbers that matter (level, case count) in the
same cut at 1.25–1.85 em.

| role | family / setting | used for |
|---|---|---|
| display | Archivo 800–900, `font-stretch: 68–75%`, uppercase, `letter-spacing: 0.01–0.06em` | destinations, panel titles, tile numbers, card / trail / item names, Ride |
| wordmark | Archivo 900, `font-stretch: 125%` (expanded), the I in orange | `SENDIT` in the top bar, `.title` on shared screens |
| UI | Archivo 400–700 at normal width | body text, descriptions, list rows |
| caps label | Archivo 600–700, 0.72–0.78 em, uppercase, `letter-spacing: 0.14em` | section heads, tile heads, stat names |
| data | IBM Plex Mono 500–700 | serials, keys (`kbd`), XP / km / counts, badges, tags, meta lines |

`#lobby` sets `font-variant-numeric: tabular-nums`. Sizes are em off `#lobby`'s fluid size
(`clamp(13px, 0.5vw + 8px, 22px)`).

### Colour tokens (`:root` in `web/src/style.css`)

| token | value | use |
|---|---|---|
| `--c-night` | `#0a121a` | top bar, scrims |
| `--c-ink` | `#0f1a24` | panels, tiles (used at ~0.95 alpha) |
| `--c-ink-2` / `--c-ink-3` / `--c-ink-4` | `#16232f` / `#20303f` / `#2b3e51` | raised faces / hover / pressed |
| `--c-line` / `--c-line-2` | snow at 14 % / 30 % | hairlines / control borders |
| `--c-snow` | `#f2f4f1` | primary text, sign plates, the ticket, active plates |
| `--c-snow-2` / `--c-snow-3` | `#b3bfca` / `#8a97a4` | secondary (8.9:1 on ink) / captions (5.6:1) |
| `--c-paper-ink` / `--c-paper-dim` | `#0f1a24` / `#4d5a66` | text on snow plates (6.6:1 for the dim one) |
| `--c-signal` / `--c-signal-2` / `--c-signal-hi` | `#ff5a1f` / `#ff7a45` / `#ff8650` | the accent: Ride, active rule, focus halo, tile icons |
| `--c-ice` | `#8fd0ee` | progress fills, data |
| `--c-pine` | `#2f9d5c` | done / owned / online |
| `--c-gold` | `#f3c14b` | medals, bests, cases (Open), 2× XP |
| `--c-alert` | `#e5382b` | count badges, NEW |
| **lips** `--c-ink-lip` / `--c-snow-lip` / `--c-signal-lip` / `--c-gold-lip` | `#04080c` / `#9aabbb` / `#a8360c` / `#9c7311` | the side face under a chunky control of that colour |
| trail colours | green `#1f9d55`, blue `#1f66d6`, black `#0b0f14`, park `#f47b20` | difficulty only |

Text on the orange Ride face is `--c-paper-ink` (about 6:1); white on that orange would be ~3:1.

### Depth, shape, states

- **The chunky recipe** (`.lb-btn3`, and applied to `.lp-btn .eq-opt .lb-util .lb-sub .lb-map .lb-look
  .hm-tile`): face colour + `box-shadow: 0 var(--lip) 0 var(--lipc)`. Hover: `translateY(-2px)` and the
  lip grows by 2 px. Active: `translateY(lip - 1px)` and the lip shrinks to 1 px (40 ms). `--lip` is
  4 px (3 px on short screens). Snow plates use `--c-snow-lip`, orange `--c-signal-lip`, gold
  `--c-gold-lip`. Wrappers that hold chunky controls leave `padding-bottom: var(--lip)`.
- **The slant** `--skew: -10deg` is reserved for speed: the Ride button and the active-destination
  plate (`.lb-ink`). Its content is counter-skewed so text stays upright. Same family as the HUD's
  skewed speed read-out.
- **Radii:** 2 px (`--r1`) for tags and small chips, 4 px (`--r2`) for controls, tiles, panels.
  Round only where the thing is round (medals, the green-circle symbol).
- **Selected** = snow plate with dark text (+ an orange edge: inset bottom rule on the active plate,
  inset left edge on Zen/Challenge and selected cards). **Focus** = 2 px snow outline + a 5 px orange
  halo (`:focus-visible`), visible on dark panels and on snow; gamepad focus uses the same ring.
- **Badges:** patrol-red, mono, square, with a 2 px dark ring to cut them off the background; they
  pop (`lbBadgePop`) when the count goes up.

### Motion (`--e-out`, `--e-pop`, `--t1` 110 ms, `--t2` 260 ms)

| what | how |
|---|---|
| destination change | the snow plate slides to the new tab (`transform` + `width`, `--t2`, `--e-out`); icon nudges on hover |
| panel open | panel slides in 14 px, then its blocks rise one after another (40 ms steps, 0.42 s); the class is removed after 0.7 s so re-renders inside a tab don't replay it |
| Home tiles | pop in from the left with overshoot, 70 ms apart; bars fill from 0; numbers count up (`motion.js tickNumbers`) |
| ready case | wobbles every ~3 s; hovering the tile tips it |
| Ride | idle sheen every 3.6 s; hover lifts and nudges the arrow; press sinks |
| badges | pop on increase |
| toast | drops in with overshoot |

Transforms and opacity only (no layout animation, no blur). `prefers-reduced-motion` switches all of
it off.

### Sound

`ui_click` everywhere (no new assets): a soft high tick on hover over destinations, sub-tabs,
utilities, tiles, the trail sign, mode and Ride (`motion.js hoverTicks`, throttled to one per 70 ms),
a normal click on press, a lower click going back Home, a higher one for Challenge. Ride itself plays
the ride-start whoosh (main.js).

### Iconography

`lobby/icons.js`: one set, 24 × 24, 1.9 px round strokes, `currentColor`. No emoji anywhere (the
achievement badges map their emoji to line icons, `progression/lobby.js`). Icon tiles on Home sit in a
small filled plate (orange / rank colour) so they read as game icons, not as web glyphs.

### Components

| component | classes | notes |
|---|---|---|
| top bar | `.lb-top .lb-brand .lb-tabbar .lb-tabs .lb-tab .lb-ink .lb-key` | five destinations, centred; the active plate is `.lb-ink` |
| utilities | `.lb-utils .lb-util .lb-util-tip` | icon buttons (Friends, Settings) with a tooltip label |
| lift ticket | `.lb-chip .lb-avatar .lb-chip-text` (+ `.pg-badge .pg-chipbar`) | notched with a CSS mask, opens Profile |
| sub-tabs | `.lb-side .lb-subnav .lb-sub` | only when a destination has 2+ tabs |
| panel | `.lb-panel .lp-title .lp-sub .lp-h3 .lp-hint` | runs to the bottom edge off Home; `.bare` on Home |
| Home tiles | `.hm-tiles .hm-tile .hm-level .hm-daily .hm-cases .hm-bar .hm-go` | each tile is one button (Cases: tile + Open) |
| rider plate | `.lb-look` | under the rider on Home, opens Skins, carries the Skins badge |
| chunky button | `.lb-btn3` (`.gold`) | the recipe above, for new primary actions |
| tag | `.lp-pill` (`.on`, `.subtle`, `.gold`) | mono caps, 2 px |
| badge | `.lb-badge` (also `.cs-badge`) | `setLobbyBadge` |
| trail sign | `.lb-map .lb-map-thumb .lb-map-chg` | snow plate with lip, mountain accent band, "Change" |
| mode | `.lb-mode .lb-mode-seg` | stacked Zen / Challenge, caption under each |
| Ride | `.lb-ride .lb-ride-face .lb-ride-tag .lb-ride-key` | `.race` in Challenge, `.pg-bonus` shows the 2× XP sticker |
| toast | `.lb-toast`, `.cn` (case notes), `#juiceHud .tt` | navy plate, coloured inner left edge |
| item frame | `.cr-card`, `.lk-item`, `.cs-grid` | flat plate, grade colour as the bottom band; the item pictures are not styled here |
| gear stats | `.gr-bars .gr-row .gr-bar .gr-d` (`.compact`, `.show-d`), `.gr-badge` (`.pick`), `.gr-pick`, `.gr-card .gr-cmpbtn`, `.gr-cmp`, `.gr-tile` | `lobby/gearUi.js` + `tabs/gear.css`: rating bars (snow fill; the gap to what you ride is pine = better, striped alert = worse, shown on hover / focus, always on touch), best-at chips (ice icon on ink), the ★ pick (gold plate with gold lip), compare (ice edge). See docs/equipment.md "Gear stats in the Locker". |

Mountain cards (`.mt-art`) and the trail-view header (`.mt-head`) are framed for full-bleed
photographic art (~16:10): the picture may come as the `--art` background or as an `<img>` child, both
`cover`ed; a top scrim carries the tags, a deeper bottom scrim the region caption, and the mountain's
accent is a 3 px band under the picture. The art itself belongs to the map-image code, not this CSS.

Cases and Locker overrides are appended at the end of `lobby/cases/cases.css` (so the item-art code
above merges cleanly); the Progress tab's CSS is the `CSS` string in `progression/lobby.js`; the
Maps tab is `lobby/tabs/maps.css`.

### Responsive

| size | layout |
|---|---|
| desktop (≥ 1020 px) | top bar with words; Home tiles left, rider centre, Ride cluster bottom right; panels left at 25 em (Maps 36 em) |
| 760–1020 px | destinations show icons, the active one keeps its word; ticket text and hints hide |
| phone portrait (≤ 760 px or taller than 4:5) | ticket + utilities float on top; the five destinations become a bottom tab bar with labels; the panel is a bottom sheet (≤ 40 vh); Home tiles become a swipeable row; Ride cluster above the tab bar |
| short landscape (≤ 560 px high) | 12 px base, compact Ride cluster (no captions), compact tiles, no rider plate |

### v1 background ("lift ticket & trail sign", kept)

The first lobby looked machine-made (Inter, heavy italic, gradient text, cyan → pink gradients, glass
panels, pills, emoji icons). v1 replaced it with resort signage (enamel sign plates, the green circle /
blue square / black diamond, condensed caps), paper lift tickets (notches, perforation, mono serials),
the restraint of outdoor brands (black, white, one accent, hairlines) and the flat menus of Steep and
Riders Republic. All of that is still the base of v2.

## Controls in the lobby

| | keyboard / mouse | gamepad | touch |
|---|---|---|---|
| rotate rider | drag, A / D | right stick | drag |
| zoom | wheel | LT / RT | pinch |
| reset view | R, double-click | Select | double-tap |
| previous / next destination | Q / E, click | LB / RB | tap the bottom bar |
| back (tab → Home → Ride) | Esc | B | tap Home |
| move focus | arrows, Tab | d-pad / left stick | n/a |
| activate | Enter / Space | A | tap |
| quick action (gear swap, next slot, open case) | n/a | Y | n/a |
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
- Home's tiles read `progression` directly (level, dailies) and `profileStore` (cases); if
  progression ever fails to load, those tiles are simply left out.
- Multiplayer and global leaderboards are "coming soon" stubs. Leaderboards are per
  browser (`LocalLeaderboard`).
- Starting a ride with the gamepad can't take pointer lock (browsers need a mouse or keyboard
  gesture). Mouse look starts after the first click; the gamepad's right stick works anyway.
- `?ride` builds the lobby stage only on the first return to the lobby, which adds a short wait
  during that fade.
