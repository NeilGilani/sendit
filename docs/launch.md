# Launch: build, deploy, flags, limits

How to ship the web game (`web/`) as a static site, what a public build does differently from the dev
server, and the pre-launch checklist. Written for the public launch, 2026-10-20.

## Build

```bash
cd web
npm ci
npm run build                 # → web/dist, for a domain root (https://sendit.example/)
npm run build:pages           # → web/dist, for https://<owner>.github.io/sendit/  (vite build --base /sendit/)
SITE_URL=https://sendit.example/ npm run build   # absolute URLs for the share card (og:image) — set it for real deploys
```

- **Base path.** Every asset URL goes through `src/base.js` (`assetUrl('models/skier/skier.gltf')` →
  `import.meta.env.BASE_URL + …`), including the loading worker and index.html's still picker
  (`%BASE_URL%`). Any absolute base works (`/`, `/sendit/`, `/games/sendit/`). Don't use a relative base
  (`./`): the loading worker resolves asset URLs against its own script URL. New code that fetches a file
  from `assets/` must use `assetUrl()` — a bare `'/audio/x.ogg'` works in dev and breaks on Pages.
- **What's copied.** In dev, `../assets` is the public folder. The build copies it *filtered*
  (`web/vite.config.js` → `copyAssets`, `SKIP`): no Godot heightfield (`terrain/*.bin`, 38 MB), no 2K Poly Haven
  sources (`textures/*.jpg`, 22 MB), no Quaternius pines / Poly Haven rocks (`models/nature`, `models/rocks`,
  8 MB), no `*.import` / `.gdignore`. **dist: 123 MB → 45 MB** (149 files from assets + ~3.7 MB of JS/CSS).
  If a future feature loads one of the skipped folders, remove its line from `SKIP`.
- **Not shipped:** dev pages (`loading.html`, `src/equipment/clipharness.html`, `spinharness.html`,
  `garmentclip.js`, `src/audio/harness.html`) — only `index.html` is a build entry, and nothing in the game
  imports them. Check after big merges: `ls dist` should show only `index.html`, `CREDITS.md`, `assets/` and
  the asset folders.
- **Share card / icons:** `assets/site/` (favicon.svg, apple-touch-icon.png, icon-192/512.png, og-image.jpg
  1200×630, site.webmanifest). Re-render with `node web/scripts/social-card.mjs [still-name]` (plain HTML
  render of a loading still + the wordmark; no GPU needed).

## Deploy

**GitHub Pages** (repo `NeilGilani/sendit` → `https://neilgilani.github.io/sendit/`):
1. Repo Settings → Pages → Source: **GitHub Actions** (one time).
2. Actions → **Deploy to GitHub Pages** → Run workflow (`.github/workflows/pages.yml`; manual only). It runs
   `npm ci` and `vite build --base /<repo>/` with `SITE_URL` set, then publishes `web/dist`.

**Any static host** (Netlify, Cloudflare Pages, Vercel, S3 + CloudFront, nginx): build with the base the site
lives under, upload `web/dist`. No server code, no rewrites needed (one page, query-string routing:
`?map=…&trail=…&ride`).

**Caching.** File names under `dist/assets/` carry a content hash: serve them with
`Cache-Control: public, max-age=31536000, immutable`. Everything else (`index.html`, `audio/`, `models/`,
`loading/`, `maps/`, `resorts/`, `textures/`, `site/`, `CREDITS.md`) keeps its name between releases: use
`no-cache` (revalidate; ETags make it cheap) or a short max-age (≤ 1 h), or players can mix an old
`index.html` with new bundles. GitHub Pages sends `max-age=600` for everything — fine.

**Compression.** Let the host gzip / brotli text: `.js`, `.css`, `.html`, `.json` (Tahoe metadata), `.gltf`,
`.svg`, `.md`. The bundle is ~2.2 MB minified (main) → ~780 KB gzip. Images (`.webp`, `.jpg`, `.png`), audio
(`.ogg`, `.mp3`) and `.bin` are already compressed or don't gain much. GitHub Pages and Cloudflare compress
automatically; for nginx enable `gzip_types text/javascript application/javascript text/css application/json model/gltf+json image/svg+xml`.

**Local check of a build** (any base):

```bash
node web/scripts/serve-dist.mjs /tmp/dist 4173 /sendit/     # 404s for anything outside the base are logged
ENGINE=chromium node web/scripts/prodsmoke.mjs http://localhost:4173/sendit/ /tmp/shots
ENGINE=webkit   node web/scripts/prodsmoke.mjs http://localhost:4173/sendit/ /tmp/shots
```

`prodsmoke.mjs` scenarios: **main** (loading still → lobby → Ride → pause → lobby → credits → another
mountain by reload → riding; URL cheats ignored; no console errors, no HTTP ≥ 400, stays under the base),
**nostorage** (localStorage / IndexedDB throw), **corrupt** (garbage saves → fresh profile + `.backup`),
**nowebgl** (friendly screen).

## Flag policy (`web/src/flags.js`)

| Kind | Flags | Public build |
|---|---|---|
| Shareable / player-facing | `?map` `?trail` `?ride` `?challenge` `?vs` (versus links) `?equip` `?stance` `?quality` `?resort` `?run` | honoured |
| Cheats | `?casegrant` `?caseforce` `?caseseries` `?variant` (wear any gear model) | **ignored** |
| Dev / capture | `?proto` `?protobody` `?iconrebake` `?noicons` `?kicker` `?at` `?ragdoll=0` `?cam` `?atmo` `?sun` `?tm` `?exposure` `?goggles` `?shaderdebug` `?audiodebug` `?autoq` `?loadhold` `?loadnohold` `?loadscene` `?loadwhy` `?loadseed` `?loadclip` `?loadtrick` `?loadcam` `?loadtod` `?loadgear` `?loadmtn` `?loaddebug` `?loadq` `?loadfreeze` `?loadtrees` `?loadstill` `?nostill` | **ignored** |

- Every module reads the query through `urlParams()`, which keeps only the shareable keys unless `DEBUG`
  (`import.meta.env.MODE !== 'production'`): the dev server (`npm run dev`, which all browser tests use) or a
  build made with `vite build --mode staging`. index.html's still picker checks `'%MODE%'` the same way.
- The debug case-opening hook (`window.__senditCasesApi`, seeded reels) only exists in DEBUG.
  `window.__sendit` (game handles for the test scripts) stays: anyone with devtools can already edit their
  local save, and nothing is server-side.
- A new flag: read it with `urlParams()`; if players should be able to share it, add it to `PUBLIC_FLAGS`.
- `?quality` is clamped to 0–2.

## Fallbacks

| Situation | What the player sees |
|---|---|
| No WebGL 2 (old browser, hardware acceleration off, blocklisted GPU) | "Your browser can't run 3D" screen with what to do (index.html checks before loading anything heavy) |
| A download or boot step fails | "Something went wrong" + Reload + "Reload on low graphics" (module import failure, `boot()` rejection) |
| GPU context lost and not restored within 4 s | "Graphics stopped" + Reload |
| JavaScript off | `<noscript>` message |
| localStorage / IndexedDB blocked (private mode, blocked cookies) | Game runs; saves live in memory for the session (`services/storage.js`, every direct access is try/caught) |
| Audio blocked until a gesture | Silent until the first click / key (`unlockAudio` in main.js); no errors |

## Saves (`sendit.profile` v2, `sendit.progression`, `sendit.settings`, …)

- Profile: `profile/schema.js` `migrateProfile()` takes nothing / v0 legacy keys / v1 / v2 / newer-than-known
  and returns a valid v2; `sanitize()` drops unknown item ids and series, maps retired skins
  (`RETIRED_SKINS`, items.js) to their replacements, keeps numbers numeric, ignores prototype keys
  (`constructor`, `toString`…).
- Unreadable save (corrupt JSON, wrong shape, a migration that throws): the original text is kept under
  `<key>.backup` (`sendit.profile.backup`, `sendit.progression.backup`), then a fresh one starts. Never a crash.
- Settings: `sanitizeSettings()` (state.js) keeps known keys with the right type; quality an integer 0–2.
- Tested by `web/scripts/saves-unit.mjs` (part of `unittest.mjs`): every version this week, 4000 random /
  mutated profiles, 3000 garbage progression / settings values, corrupt-profile backup.

## Performance

- First paint: index.html's inline script picks a loading still and preloads it before any bundle — decoded
  ~40–60 ms after navigation on a warm local server (Chromium). The live loading scene starts in a worker.
- Lobby ready (local server, MacBook Air M-series, Chromium/Metal): ~8–9 s; first visit downloads ≈ see
  `prodsmoke` output ("N requests, X MB").
- **Quality auto-pick** (`gfx/autoquality.js`): players who never chose a quality start on Low on software
  renderers (SwiftShader / llvmpipe), older Intel HD / UHD iGPUs and phone / tablet GPUs; if the lobby still
  averages > 42 ms per frame for ~150 frames, it steps down (max twice). Off under automation
  (`navigator.webdriver`), with `?quality`, or once the player picked a quality.
- Heaviest downloads: the rider's PNG textures (~5 MB, models/skier), the two music tracks (~4 MB each as
  .ogg; only the .ogg is fetched where supported), the Lake Tahoe elevation (~1.8 MB per resort, only when
  that mountain loads).

## Known limits

- Desktop / laptop first: keyboard (+ mouse) or a gamepad. Phones and tablets load and render but have no
  touch controls.
- Needs WebGL 2 (Chrome / Edge / Firefox / Safari 15+). Safari works (tested in Playwright WebKit) but boots slower.
- Saves are per browser and device (localStorage); clearing site data resets progress. No accounts, no cloud
  save; versus links carry the ghost in the URL.
- Fonts come from Google Fonts at runtime (falls back to Helvetica / Arial offline).

## Checklist

- [ ] Merge, then `node web/scripts/unittest.mjs` and the rest of the test list (docs/HANDOFF.md).
- [ ] `cd web && npx vite build` — no errors; `ls dist` shows only index.html, CREDITS.md and asset folders.
- [ ] Build with the real base and serve it: `prodsmoke.mjs` ALL PASS in Chromium and WebKit.
- [ ] `SITE_URL` set for the real deploy (share card shows an image: check with a link-preview debugger).
- [ ] Open the deployed URL in a fresh private window: loading still → lobby → Ride; Settings › Credits opens.
- [ ] Try a versus link and a `?map=…&trail=…&ride` link on the deployed URL.
- [ ] `?casegrant=5` on the deployed URL grants nothing.
