# Sendit graphics: realistic snow, spray, mountains and trees

Branch `agent/gfx-snow`. This replaces the cel/"clay" toon look of the web build with a physically based, linear-HDR alpine look in the spirit of Steep. Research notes and visual targets are in `docs/graphics-research.md`.

## What changed

| Area | Where | Summary |
|---|---|---|
| Lighting units | `web/src/gfx/atmosphere.js`, `world.js` | One linear HDR unit everywhere. The sun colour is its irradiance / π after the atmosphere. Sky light is the cosine-weighted mean of the baked sky. The terrain bounce and snow bounce come from the same model. `toonMaterial()` keeps its API, but it now outputs HDR radiance (Lambert + sky/ground hemisphere + baked AO) with no per-material tone curve. The Fresnel rim is scaled way down (`LIGHTING.rimScale`). |
| Sky + aerial perspective | `gfx/atmosphere.js`, `sky.js` | Single-scattering Rayleigh + Mie sky seen from 2.7 km is baked once on the CPU into a 128×96 half-float LUT. It has a multiple-scattering stand-in, so the horizon is milky and the zenith deep blue. The sky dome adds an HDR sun disk with limb darkening (it blooms), lit cumulus banks and cirrus. The fog chunk is now aerial perspective: per-channel extinction through two exponential layers (air + haze), with the in-scatter colour equal to the horizon sky in that direction (warm toward the sun), plus the old valley haze. |
| Post | `gfx/post.js` (moved out of `main.js`) | RenderPass → N8AO (cool, subtle) → HDR bloom (threshold above sunlit snow, so only the sun, glints and backlit spray bloom) → Grade. Grade covers exposure, Khronos PBR Neutral (or AgX), gentle contrast and saturation, cool shadows and warm highlights, vignette, occlusion-aware sun glare, faint lens ghosts and an optional goggle tint. Speed wind and SMAA follow. |
| Snow material | `gfx/snow.js` | Covers wrapped diffuse with a cyan subsurface edge, blue sky-lit shade, rough GGX sheen (tighter on glazed crust), forward scattering when looking toward the sun, and footprint-faded view-dependent glints (two jittered grids, HDR). Normals are multi-scale: macro landform, soft drifts, sastrugi on exposed snow, warped wind ripples, groomed corduroy in 5.5 m lanes worn by traffic (each 48 m cell grooms in one straight direction, and neighbouring cells are blended so the lines never curl into moiré), and micro grain. Albedo varies with slope, altitude/exposure (convexity), sun glaze and grooming. Tracks are deep, soft trenches in powder with pushed-up lips, cavity darkening and steep parallax on high quality. Tree wells dip the snow and darken it under canopies. |
| Rock / mountains | `gfx/snow.js`, `terrain.js`, `gfx/cornices.js`, `scatter.js` | Steep faces lose their snow above about 53° (noise + concavity). Couloirs hold snow and ribs stay bare. Rock is bi-planar projected (never stretched): grey gneiss with beds, runoff streaks and iron staining, Voronoi fracture blocks as tilted facets with dark joints, and ledge bands (fine and coarse, broken) holding snow. The far backdrop gets noise-gradient relief, and there is a ring of procedural ranges 12–37 km out that the aerial perspective layers into blue haze. Cornices and wind lips sit on the lee side of convex breaks. Boulders are fractured, smooth-shaded and grey, with snow caps and a per-cell LOD. |
| Air | `scene.js` (`createSnowfall`, `SNOWFALL`) | Clear-sky diamond dust replaces the falling snow: sparse ice crystals that flash when they mirror the sun, mostly when you look toward it. |
| Park | `features.js` | Kickers use the snow optics: packed, glazed park snow with shovel lumps and a slightly icy lip. Crowd billboards and fog pockets are converted to HDR. |
| Trees | `gfx/trees.js`, `scatter.js` | Procedural spruce (narrow, drooping) and fir (rounder) are built from whorls of needle-frond cards: a procedural alpha needle texture with coverage-preserving alpha test, hanging skirts and volumetric normals. Snow ridges sit along the top of each branch, with per-tree load and colour. There is wind sway plus tip flutter. LOD0/LOD1 are dynamic pools around the camera, and LOD2 is cone shells per 750 m cell that hide inside the pool radius. |
| Spray | `gfx/spray.js`, `fx.js` | Equipment-agnostic `SprayEmitter` (API below): rooster-tail sheets, clumps / ice chips, glittering crystals, lingering backlit powder clouds, sluff (loose snow that pours downhill along the surface on steep powder), hard-stop fans, landing puffs and crash bursts. Particles are lit by the sun with a Henyey-Greenstein forward lobe plus sky and snow bounce, use the baked mountain shadows, and fade softly into the snow. |

## Second graphics pass (branch `claude/gfx-snow-668da8`)

Compared screenshots against the round-2 research addendum in `docs/graphics-research.md` and fixed what read as fake:

| Area | Where | Change |
|---|---|---|
| Cliff relief | `terrain.js` `sculptCliffs()`, `CLIFFS` in `scene.js` | The hand-built gully walls were smooth ramps. Ribs and gullies (two octaves of ridged noise, each stretched along that cell's own fall line) are now added to the height field on cells steeper than about 45°, outside the riding floor (`CLIFFS.relief`, 10 m). Normals and the rock mask are rebuilt, so silhouettes, cast shadows and the baked sun mask all change, not only the shading. |
| Rock shading | `gfx/snow.js` `rockLayer()` | Fall-line flutes: rib crests are lighter, gullies are darker and hold snow streaks (on faces steeper than about 60° only). Strata are bounded, undulating beds of uneven thickness, not one fixed spacing. Fracture blocks are elongated along the beds. Ledge snow comes in tapered lenses and is shaded flat. Faint spindrift streaks fall below loaded ledges. Granite is lighter and warmer (`ROCK.dark/light`, mean linear albedo about 0.18). |
| Steep snow | `gfx/snow.js` | Drop faces and wind lips get their own bi-planar detail (sluff flutes and lumps) instead of xz-projected detail stretched into streaks. Corduroy seams fade before they alias. Wind ripples are weaker and come in patches. |
| Kickers | `features.js` | Raked sidewalls of about 40° with a soft roll-over (`sideFactor`, shared by physics and mesh) and a shovelled knuckle at about 70°, replacing the vertical slab walls. |
| Spray | `gfx/spray.js`, `SPRAY` | Sheet particles are procedural snow-grain clusters (a 2×2 atlas of coverage and core thickness), so the plume reads as granular rather than smoke. Every sprite is shaded as a soft ball: lit side and sky-blue shade. Spray casts dithered shadows into the sun shadow map on quality ≥ 1 (`customDepthMaterial`, `SPRAY.sheetShadow/mistShadow`). Powder clouds linger about 4 s and settle slowly. Bloom threshold went from 2.1 to 3.2, so backlit spray no longer blooms into a fog blob. |
| Tracks | `fx.js` TrackMap | Stamps are round-capped capsules in metres with a rounded cross-section, so successive stamps along a turn merge (MAX blend) into one smooth trench without tread-like ticks. The gradient stencil spans about 1.5 texels. |
| Trees | `gfx/trees.js`, `TREES` | Needle fronds use a fishbone pattern (needles along side twigs, ragged with gaps). Snow on branches is a solid pillow with its own domed, lumpy normal, not a needle-shaped cut-out. Needle tips glow when backlit (`TREES.translucency`). The inner core is thinner and clumped. |
| Lighting | `LIGHTING` | Sun elevation 32° (long shadows, as in Steep and photographers' hero sun). `skyBoost` 0.9 (shaded snow sits about 1.5–2 stops under sunlit). |
| Tooling | `web/scripts/` | `gfxshots.mjs` gains `gcam` (camera height above ground). New `gfxperf.mjs` (cost per quality) and `gfxprofile.mjs` (cost breakdown). |

Spray contact API: unchanged. `main.js` already calls `fx.setContactSource(() => rider.getContactPoints())`. Skis and the board both emit through it (checked with `?equip=snowboard`).

## Where the tunables live

All new tunables are in `web/src/scene.js` (the scene file). `config.js` is untouched.

- `LIGHTING`: sun elevation and bearing (SSE, 40°, chosen so about 85 % of the gully floor is in sun), `sunWhiten`, sky / ground boost, `terrainBounce` (how bright and how neutral the shade is), AO floor, shadow softness.
- `ATMOSPHERE`: sky model (Rayleigh/Mie, `skyScale`, `zenithGain`, `horizonWhiten`), aerial perspective (`airExtinction`, `hazeExtinction`, heights), valley mist, cloud cover and cirrus.
- `SNOW`: albedo, subsurface, wrap, roughness, forward scatter, sparkle (brightness, density, facet cone), wind angle, drift / ripple / sastrugi / corduroy strengths, track depth, lip and darkening.
- `ROCK`: colours, ledge spacing, ledge snow, the slope where snow slides off.
- `SPRAY`: particle budget, emission rates, lifetimes, alphas, shadow coverage, velocity inheritance, stop burst, phase function, wind drift.
- `TREES`: height, colours, snow load, needle translucency, fir share, LOD radii and pool sizes, tree-well radius.
- `CLIFFS`: relief depth of the fall-line flutes sculpted into steep walls.
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
| Shadow box / map | 40 m / 1024 | 60 m / 2048 | 85 m / 3072 |
| N8AO (half resolution) | off | Low | Medium |
| Snow glints | off | on | on |
| Snow wind ripples / sastrugi / corduroy | off | on | on |
| Track trenches | normal-mapped | normal-mapped | steep parallax |
| Rock detail | one projection, one fracture scale | full | full |
| Trees: full / mid LOD radius | 35 / 189 m | 49 / 260 m | 58 / 420 m |
| Far tree / boulder distance | 1800 / 500 m | 3000 / 900 m | 4500 / 1400 m |
| Spray particle budget / mist | 35 % / 60 % | 65 % / 85 % | 100 % |
| Sun glare / lens ghosts | off / off | on / off | on / on |
| Spray shadows (dithered, in the sun shadow map) | off | on | on |
| SMAA preset | Low | Medium | High |

Terrain LOD distances scale as before (0.6 / 1.0 / 1.5).

## Debug and preview helpers

- URL params: `?tm=agx` (tone curve), `?exposure=0.62`, `?sun=bearing,elevation` (degrees), `?goggles=1` (amber goggle lens), plus the existing `?ride`, `?quality`, `?at`, `?kicker`.
- `?shaderdebug` turns three.js shader log checks back on. They are off by default because reading program logs stalls on the first use of every program, and ANGLE/D3D11 prints a benign compiler warning for the third-party N8AO shader.
- `window.__post` is the PostStack instance (debug).
- `window.__gfxCam = [px,py,pz, tx,ty,tz, fov?]` or a function returning that array overrides the camera (honoured in `sky.js`). This is for screenshots.
- `node web/scripts/gfxshots.mjs <url> <outDir> <views.json>` boots once in headless Chromium and captures many views (`cam`, `side` rider-relative camera, `keys`, `eval`, `wait`). Set `SUF=_x` to suffix the file names. `GPU=1` renders on the real GPU through ANGLE/D3D11, which is much faster than SwiftShader on this machine; `clip` captures a sub-rectangle.

## Known issues / not done

- Performance (second pass, corrected): the earlier ~2 ms figures came from `requestAnimationFrame` deltas in headless Chromium, which don't measure GPU cost. `web/scripts/gfxperf.mjs` times a synchronous render through the full post stack plus a 1-pixel `readPixels`. On the Intel Arc 130V iGPU at 1600×900, with the GPU otherwise idle, the final build measures about **13 / 27 / 29 ms** on quality 0 / 1 / 2, so roughly 75 / 37 / 34 fps of headroom before vsync pipelining. Earlier runs while other sessions shared the GPU read 2–4× higher; compare numbers only within one run. `web/scripts/gfxprofile.mjs` interleaves variants to break the cost down. Full-resolution N8AO High was ~45 % of a high-quality frame and near frond trees ~25 %. AO now runs at half resolution (Low on q1, Medium on q2), the near-tree radius is 58 m, the mid-tree radius scales 0.45 / 0.62 / 1 by quality, and SMAA is Low / Medium / High. The terrain shader's fine detail is cheap (< 10 %). If a weaker GPU still struggles, the next levers are `TREES.midRadius`, the render scale on quality 1, and updating the shadow map on alternate frames.
- Cornices are found procedurally on convex breaks and are visual only (no collision). The hand-built gully has few true crests, so they are sparse there.
- Rock ledge bands follow world height. Very large faces can still show some banding at mid distance.
- The rider and lifts still use `toonMaterial` (now HDR-lit). The neon emissive trims stay but read dimmer under the new exposure. The ink outline is off (`OUTLINE.px = 0`).
- The crowd billboards and flags keep their stylized textures.
- Real resorts (`?resort=`) use the same shaders. Corduroy appears where OSM marks groomed pistes. The distant ranges ring is fictional there as well.
