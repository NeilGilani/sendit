# Sendit graphics: realistic snow, spray, mountains and trees

Branch `agent/gfx-snow`. This replaces the cel/"clay" toon look of the web build with a physically based, linear-HDR alpine look in the spirit of Steep. Research notes and visual targets are in `docs/graphics-research.md`.

## What changed

| Area | Where | Summary |
|---|---|---|
| Lighting units | `web/src/gfx/atmosphere.js`, `world.js` | One linear HDR unit everywhere. The sun colour is its irradiance / π after the atmosphere. Sky light is the cosine-weighted mean of the baked sky. The terrain bounce and snow bounce come from the same model. `toonMaterial()` keeps its API, but it now outputs HDR radiance (Lambert + sky/ground hemisphere + baked AO) with no per-material tone curve. The Fresnel rim is scaled way down (`LIGHTING.rimScale`). |
| Sky + aerial perspective | `gfx/atmosphere.js`, `sky.js` | Single-scattering Rayleigh + Mie sky seen from 2.7 km is baked once on the CPU into a 128×96 half-float LUT. It has a multiple-scattering stand-in, so the horizon is milky and the zenith deep blue. The sky dome adds an HDR sun disk with limb darkening (it blooms), lit cumulus banks and cirrus. The fog chunk is now aerial perspective: per-channel extinction through two exponential layers (air + haze), with the in-scatter colour equal to the horizon sky in that direction (warm toward the sun), plus the old valley haze. |
| Post | `gfx/post.js` (moved out of `main.js`) | RenderPass → N8AO (cool, subtle) → HDR bloom (threshold above sunlit snow, so only the sun, glints and backlit spray bloom) → Grade. Grade covers exposure, Khronos PBR Neutral (or AgX), gentle contrast and saturation, cool shadows and warm highlights, vignette, occlusion-aware sun glare, faint lens ghosts and an optional goggle tint. Speed wind and SMAA follow. |
| Snow material | `gfx/snow.js` | Covers wrapped diffuse with a cyan subsurface edge, blue sky-lit shade, rough GGX sheen (tighter on glazed crust), forward scattering when looking toward the sun, and footprint-faded view-dependent glints (two jittered grids, HDR). Normals are multi-scale: macro landform, soft drifts, sastrugi on exposed snow, warped wind ripples, groomed corduroy in 5.5 m lanes worn by traffic, and micro grain. Albedo varies with slope, altitude/exposure (convexity), sun glaze and grooming. Tracks are deep, soft trenches in powder with pushed-up lips, cavity darkening and steep parallax on high quality. Tree wells dip the snow and darken it under canopies. |
| Rock / mountains | `gfx/snow.js`, `terrain.js`, `gfx/cornices.js`, `scatter.js` | Steep faces lose their snow above about 53° (noise + concavity). Couloirs hold snow and ribs stay bare. Rock is bi-planar projected (never stretched): grey gneiss with beds, runoff streaks and iron staining, Voronoi fracture blocks as tilted facets with dark joints, and ledge bands (fine and coarse, broken) holding snow. The far backdrop gets noise-gradient relief, and there is a ring of procedural ranges 12–37 km out that the aerial perspective layers into blue haze. Cornices and wind lips sit on the lee side of convex breaks. Boulders are fractured, smooth-shaded and grey, with snow caps and a per-cell LOD. |
| Trees | `gfx/trees.js`, `scatter.js` | Procedural spruce (narrow, drooping) and fir (rounder) are built from whorls of needle-frond cards: a procedural alpha needle texture with coverage-preserving alpha test, hanging skirts and volumetric normals. Snow ridges sit along the top of each branch, with per-tree load and colour. There is wind sway plus tip flutter. LOD0/LOD1 are dynamic pools around the camera, and LOD2 is cone shells per 750 m cell that hide inside the pool radius. |
| Spray | `gfx/spray.js`, `fx.js` | Equipment-agnostic `SprayEmitter` (API below): rooster-tail sheets, clumps / ice chips, glittering crystals, lingering backlit powder clouds, hard-stop fans, landing puffs and crash bursts. Particles are lit by the sun with a Henyey-Greenstein forward lobe plus sky and snow bounce, use the baked mountain shadows, and fade softly into the snow. |

## Where the tunables live

All new tunables are in `web/src/scene.js` (the scene file). `config.js` is untouched.

- `LIGHTING`: sun elevation and bearing, `sunWhiten`, sky / ground boost, `terrainBounce` (how bright and how neutral the shade is), AO floor, shadow softness.
- `ATMOSPHERE`: sky model (Rayleigh/Mie, `skyScale`, `zenithGain`, `horizonWhiten`), aerial perspective (`airExtinction`, `hazeExtinction`, heights), valley mist, cloud cover and cirrus.
- `SNOW`: albedo, subsurface, wrap, roughness, forward scatter, sparkle (brightness, density, facet cone), wind angle, drift / ripple / sastrugi / corduroy strengths, track depth, lip and darkening.
- `ROCK`: colours, ledge spacing, ledge snow, the slope where snow slides off.
- `SPRAY`: particle budget, emission rates, lifetimes, alphas, velocity inheritance, stop burst, phase function, wind drift.
- `TREES`: height, colours, snow load, fir share, LOD radii and pool sizes, tree-well radius.
- `CORNICES`, `RING` (distant ranges), `SNOWFALL`.
- Post: `POST` at the top of `web/src/gfx/post.js` (exposure, tone map, grade, bloom, AO, glare, flare, goggles).

## Spray contact-point API (for the snowboard)

`fx.spray` is a `SprayEmitter`. Each frame `FXManager.update()` hands it the contacts touching the snow:

```js
spray.emit(contacts, dt, { powder, normal });
// contacts: Array<{
//   position:  THREE.Vector3  // world position of the contact (edge under the binding / ski centre)
//   direction: THREE.Vector3  // unit vector along the edge, pointing where the nose points
//   edgeAngle: number         // radians the base is rolled off flat; > 0 = on its RIGHT edge (turning right)
//   load:      number         // share of rider weight on this contact (≈ 0..1, > 1 under g-load)
//   speed:     number         // m/s of the contact over the snow
//   id?:       any            // stable key per contact (defaults to the index)
// }>
```

- The emitter measures each contact's actual motion between frames. Sideways slip relative to `direction` (a skid or a hard stop) throws much more snow than a clean carve.
- The sheet / mist is thrown away from the biting edge: to the left for `edgeAngle > 0`.
- Snow softness comes from `ctx.powder` (0 hardpack … 1 deep powder).
- One-shots: `spray.landing(pos, impact, powder)`, `spray.stopFan(pos, dir, speed, powder, side)`, `spray.puff(pos, count, powder, speed)` and `spray.crash(pos, powder)`. `fx.js` already calls them from the `jumped`, `landed`, `hardBrake` and `crashed` events.
- **Skis today:** `contactsFromSkis(player)` in `fx.js` derives two contacts from `PlayerPhysics`. Edge angle is the lean that balances the turn (`atan(v·ω/g)`). Skid and brake swing the skis across the travel direction, with a snowplough wedge, and the outside ski carries more load.
- **Snowboard at merge time:** one line after `fx` is created in `main.js`:

  ```js
  fx.setContactSource(() => rider.getContactPoints());
  ```

  The board should report one or two contacts (for example the toe or heel edge under each binding) with the same shape. Nothing else is needed.

## Quality tiers (`?quality=0|1|2`)

| | 0 (low) | 1 (medium) | 2 (high) |
|---|---|---|---|
| Render scale | 0.75 × min(dpr,1) | min(dpr,1.5) | dpr (≤2) |
| Shadow box / map | 40 m / 1024 | 60 m / 2048 | 85 m / 4096 |
| N8AO | off | Medium | High |
| Snow glints | off | on | on |
| Snow wind ripples / sastrugi / corduroy | off | on | on |
| Track trenches | normal-mapped | normal-mapped | steep parallax |
| Trees: full / mid LOD radius | 51 / 231 m | 72 / 336 m | 85 / 420 m |
| Far tree / boulder distance | 1800 / 500 m | 3000 / 900 m | 4500 / 1400 m |
| Spray particle budget / mist | 35 % / 60 % | 65 % / 85 % | 100 % |
| Sun glare / lens ghosts | off / off | on / off | on / on |

Terrain LOD distances scale as before (0.6 / 1.0 / 1.5).

## Debug and preview helpers

- URL params: `?tm=agx` (tone curve), `?exposure=0.7`, `?goggles=1` (amber goggle lens), plus the existing `?ride`, `?quality`, `?at`, `?kicker`.
- `window.__gfxCam = [px,py,pz, tx,ty,tz, fov?]` or a function returning that array overrides the camera (honoured in `sky.js`). This is for screenshots.
- `node web/scripts/gfxshots.mjs <url> <outDir> <views.json>` boots once in headless Chromium and captures many views (`cam`, `side` rider-relative camera, `keys`, `eval`, `wait`). Set `SUF=_x` to suffix the file names.

## Known issues / not done

- Performance was checked structurally, not timed on a real GPU. The headless browser is software WebGL, and the visible browser pane was not available. High quality is about 2–3 M triangles and about 300 draw calls a frame at the start: terrain about 1.2 M before culling, boulders about 0.45 M, far tree shells about 0.23 M, near trees about 0.3 M. If a laptop struggles, lower `TREES.midRadius`, the boulder distances in `scatter.js`, or play on quality 1.
- Cornices are found procedurally on convex breaks and are visual only (no collision). The hand-built gully has few true crests, so they are sparse there.
- Rock ledge bands follow world height. Very large faces can still show some banding at mid distance.
- The rider and lifts still use `toonMaterial` (now HDR-lit). The neon emissive trims stay but read dimmer under the new exposure. The ink outline is off (`OUTLINE.px = 0`).
- The crowd billboards and flags keep their stylized textures.
- Real resorts (`?resort=`) use the same shaders. Corduroy appears where OSM marks groomed pistes. The distant ranges ring is fictional there as well.
