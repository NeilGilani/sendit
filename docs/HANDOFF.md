# Sendit — handoff for a new Claude conversation

Read this first, then `NOTES.md` and the doc for whatever area you touch (list below).
Written 2026-10-17 at the end of a long session on the user's Windows Surface Pro.

## What this is

**Sendit** is a browser ski / snowboard game: Three.js + Vite in `web/`. The Godot project in the repo root is
legacy — don't touch it. The user (GitHub `mboldakov-pixel`) builds it with a friend who owns the repo:

- Repo: https://github.com/NeilGilani/sendit
- Working branch: **`claude/funny-volta-2nzvj6`** (GitHub's default branch; `main` on GitHub is stale)
- State at handoff: commit `eb41365`, pushed, GitHub == local. The friend also pushes to this branch.

## How the user likes to work

- **Ask before every push to GitHub.** Always `git fetch` first and check for the friend's commits; fast-forward
  or merge them, never force-push. The user has given blanket permission for everything else in the project.
- Big tasks are split into **parallel Claude sessions** (one per area, each in its own git worktree off the
  working branch, each with its own dev-server port). One "integration" conversation merges their branches,
  resolves conflicts, runs every test, screenshots, then asks to push.
- Overnight pushes: the user sets a deadline (e.g. "done by 9 am"), sessions commit small and often with a
  deadline ~1.5 h earlier, the integration conversation merges at a checkpoint mid-night and at the end, then
  writes a **morning report** (lead with what's playable, short tables, known issues, ends with "push?").
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Explain things in plain words; the user wants a playable link after each round
  (`http://localhost:5180` on the Surface).

## Run it

```bash
cd web && npm ci
npm run dev -- --port 5180 --strictPort     # Windows PowerShell: use npm.cmd (npm.ps1 is blocked by execution policy)
```

Open `http://localhost:5180`. Useful URL params: `?map=<id>`, `&trail=<trailId>`, `&ride` (skip the lobby),
`&equip=ski|snowboard`, `&quality=0|1|2`, `&atmo=<json>` (preview a map's lighting), `?challenge`.

**On the Surface:** port 5173 belongs to another project ("Flowstate") — use 5180. Start the server from a
Terminal tab (the app's browser-pane preview servers get killed when the pane closes). Don't `npm ci` while a dev
server is running (Windows locks files). The machine has 16 GB RAM: about 12 parallel sessions with headless
browser tests ran it out of memory and crashed two sessions — keep it to ~6–8.

**On a Mac:** plain `npm` works and 5173 is probably free. Install the test browser once with
`npx playwright install chromium` (inside `web/`). The test scripts' `GPU=1` mode passes `--use-angle=d3d11`
(Windows-only); on macOS run them without `GPU=1` (software WebGL, slower) or change that flag to `metal`.

## Maps (`web/src/maps/`, registry in `maps/registry.js`, docs in `docs/maps.md`)

| id | What | Docs |
|---|---|---|
| `valcrest-gully` | Original hand-built powder gully, kickers | `course.js` |
| `lake-tahoe` | Real Tahoe resorts from elevation data (experimental) | `realcourse.js` |
| `blackspruce` | Steep, dense tree-weaving run, fork lines | `docs/map2.md` |
| `ravenspire` | Steep-style big-mountain face, cliffs, ravine, rideable roofs, flow meter / SEND IT | `docs/map3.md` |
| `voltage-park` | Red Bull / Olympic terrain park, rails and grinding, pipe, big air | `docs/map4.md` |
| `dragonback` | Ridge-to-ridge freeride | `docs/map5.md` |
| `kitsune-peak` | Japanese powder at dusk, shrine village | `docs/map6.md` |
| `fjordline` | Norwegian ski-to-sea at golden hour | `docs/map7.md` |

Each map is a mountain with named trails picked in the lobby's Maps tab.

## Systems and where they live

| Area | Code | Docs |
|---|---|---|
| Physics (carve/skid, jumps, spins/flips set at take-off, grabs), skis + snowboard | `physics/`, `player.js`, `config.js` | `equipment.md`, `jumps-research.md` |
| Grinding | `physics/grind.js` | `map4.md` |
| Rider rig and poses, first person | `rider.js`, `fpview.js`, `camera.js` | `equipment.md` |
| Body dynamics (force-driven reactions), crash ragdoll | `character/dynamics.js`, `character/ragdoll.js` | `body.md` |
| Outfit / character items | `character/` | `character.md` |
| Graphics: HDR look, snow, trees, spray, LOD cross-fades, zero pop-in, per-map lighting | `gfx/` (`perf.js`, `prewarm.js`, `atmosphere.js`), `terrain.js`, `scatter.js`, `fx.js` | `graphics.md`, `graphics-perf.md` |
| Lobby (tabs registry, Maps / mountains & trails, Equipment, Character) | `lobby/` | `lobby.md`, `maps.md` |
| Reward cases (CS:GO-style), locker, unlocks, profile | `lobby/` (cases, locker tabs), `profile/` | `rewards.md` |
| Game feel (trick announcer, combos, impact, music energy), XP / levels / challenges | `juice/`, `progression/`, `ui.js` HUD | `game-feel.md` |
| Loading screen (live random trick scene) | `loading/` | `loading-screen.md` |
| Audio (layered snow, wind, air, ambience) | `audio.js`, `audio/` | `audio.md` |
| Zen / Challenge modes, medals, ghosts | `activities.js` | — |

**Contracts between areas** (keep these shapes):
- `registerMap({ ..., mountain: { id, name, region, blurb, accent }, trails: [{ id, name, difficulty, description, length, vertical }] })`
  plus `course.trailSpawn(trailId)` / `course.trailFinish(trailId)`.
- `course.atmosphere = { sunElevation, sunBearing, skyZenith, skyHorizon, fogColor, fogDensity, exposure, ambientScale, preset? }`.
- `course.physics = { common?, ski?, snowboard? }` — per-map overrides of `config.js`.
- `emit('runCompleted', { mapId, trailId, distance, time, score })` — feeds reward-case unlocks.
- New maps: own folder + one import line in `maps/builtin.js`; `adapters.js` must stay the **last** import there.

## Tests (run from the repo root; most need the dev server for browser ones)

```bash
node web/scripts/unittest.mjs
GPU=1 node web/scripts/lobbytest.mjs http://localhost:5180/
node web/scripts/physics-fuzz.mjs
node web/scripts/physics-tricks.mjs
node web/scripts/physics-rotation.mjs both --check
node web/scripts/physics-combo.mjs both --check
node web/scripts/jumps-valcrest.mjs --check
node web/scripts/equipment-check.mjs
node web/scripts/map2-bot.mjs --verify --tuck --check
node web/scripts/map3-unit.mjs
node web/scripts/map4-unit.mjs
node web/scripts/map5-unit.mjs
node web/scripts/map6-unit.mjs
node web/scripts/map7-unit.mjs
node web/scripts/trails-check.mjs --check
node web/scripts/gfxpopin.mjs http://localhost:5180 <mapId> 1 20
node web/scripts/map3-perf.mjs http://localhost:5180 1600 900 1 60 <mapId>
MAC=1 node web/scripts/combo-shots.mjs http://localhost:5180/ <outDir> ski cork720,dc1080   # side-camera frames of combo tricks
GPU=1 node web/scripts/gfxshots.mjs "http://localhost:5180/?map=<id>&ride" <outDir> '[{"name":"r","wait":5,"keys":"ArrowUp"}]' 1280 720
```

Performance target: quality 1 around 14–16 ms GPU at 1600×900. Screenshots go in a scratch folder, never the repo.

## Known issues / good next steps

1. **First person** — finished (see `docs/first-person.md`): gloves framed on skis and snowboard in every
   scenario, detailed poles with plants, goggle lens tint / fog / snow, breath, crash cam on the ragdoll.
2. ~~`trails-check` length mismatches~~ fixed: Kitsune and Fjordline courses expose `rideLine(trailId)` and the check measures
   along each trail's own line (docs/maps.md § Measuring trails). `--check` passes for all built-in maps.
3. Voltage Park: no wallrides; the superpipe is hard to ride with keys.
4. **Chase camera** — fixed: hard turns now trail ~5° (was ~20°), and airs / flips / spins frame the predicted
   landing from ~0.9 s out with a level horizon and no snaps (see `docs/game-feel.md` §3c, `web/scripts/camshots.mjs`).
5. Pink default poles/skis clash with the earth-tone outfits.
6. Blackspruce's densest section peaks slightly above the 16 ms GPU target.
7. On the user's Surface, a separate project (`Desktop/lap4lap`) leaves a Chrome profile in `%TEMP%` on every
   screenshot run (once filled the disk with ~80 GB) — its script should delete its temp profile.

## Remote Control (prompt from the MacBook, run on the Surface)

Everything is installed and set up on the Surface, so the simplest path is: on the Surface, open a new Code session
in the Claude desktop app on this folder, turn on **Remote Control** for it, then open it from the MacBook
(claude.ai/code or the Claude app) and paste:

> Read docs/HANDOFF.md in this repo and NOTES.md, then let's keep working on Sendit.

The Surface must stay awake and plugged in (sleep "Never" while plugged in) for the session to keep running.
