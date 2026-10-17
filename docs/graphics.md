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
| Trees | `gfx/trees.js`, `scatter.js` | Procedural spruce (narrow, drooping) and fir (rounder) are built from whorls of needle-frond cards: a procedural alpha needle texture with coverage-preserving alpha test, hanging skirts and volumetric normals. Snow ridges sit along the top of each branch, with per-tree load and colour. There is wind sway plus tip flutter. LOD0/LOD1 are dynamic pools around the camera, and LOD2 is cone shells per 750 m cell. The LODs cross-fade rather than switch (see "No pop-in" below). |
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
| Tooling | `web/scripts/` | `gfxshots.mjs` gains `gcam` (camera height above ground). New `gfxperf.mjs` (GPU / CPU frame cost per quality), `gfxgpu.mjs` (GPU time per pass and draw) and `gfxcpu.mjs` (main-thread profile). |

Spray contact API: unchanged. `main.js` already calls `fx.setContactSource(() => rider.getContactPoints())`. Skis and the board both emit through it (checked with `?equip=snowboard`).

## Per-map atmosphere (`course.atmosphere`)

A map gives itself its own light by exposing `atmosphere` on its Course-compatible object. Any subset
of the fields works; maps without it, and fields left out, get the defaults (`LIGHTING` / `ATMOSPHERE` in
`scene.js`, `POST.exposure`).

```js
course.atmosphere = {
  sunElevation: 9,          // degrees above the horizon (default 32)
  sunBearing: 245,          // degrees from north, clockwise (default 163, SSE)
  skyZenith: '#4a78c0',     // sky colour straight up, as it should look on screen (sRGB hex or [r, g, b] 0..1)
  skyHorizon: '#f6d2a6',    // sky colour at the horizon; the haze / aerial perspective follows it
  fogColor: '#ffdcb4',      // tint on the haze colour (default white)
  fogDensity: 1.25,         // multiplier on haze extinction (default 1)
  exposure: 0.66,           // camera exposure (default 0.62)
  ambientScale: 0.9,        // multiplier on sky + bounce light, i.e. how bright the shade is (default 1)
  // extras
  sunIntensity: 1,          // multiplier on the sun's light (0.1 ~ moonlight)
  sunTint: '#ffd09a',       // colour of the sun light (replaces the physical colour)
  preset: 'golden',         // 'golden' | 'dusk' | 'night': start from a preset, fields above override it
};
```

How it works:
- `main.js` calls `applyMapAtmosphere()` (`world.js`) right after the map loads, before anything is
  built or compiled.
- That re-bakes the sky LUT and the light colours (`gfx/atmosphere.js` `applyAtmosphere()`). Each sky row is
  re-coloured toward the zenith / horizon targets while keeping its sun-side glow, and the ambient light and
  haze colours are derived from the re-coloured sky.
- It then updates `SUN_DIR`, `SUN_COLOR` and the shared lighting uniforms in place, re-patches the fog shader
  chunk, and sets the fog tint / density and the post exposure.
- Everything downstream follows on its own: the baked mountain shadows, the sun light and its shadows, the
  sky dome, the spray lighting and the snowfall glints.

Sky colours: `skyHorizon` is the **sun-side** horizon. The opposite horizon blends 60 % toward `skyZenith`, the blue-violet anti-solar side of a real twilight. The horizon colour fades out quickly with elevation, so the upper sky that lights the shade keeps the zenith colour. The haze follows the sun-relative horizon (warm toward the sun, cool away).

Presets are in `ATMOSPHERE_PRESETS` (`gfx/atmosphere.js`). With a low sun, point it down the run
(`sunBearing`): on a deep gully like Valcrest, a sun lower than about 15 deg that comes across the
gully leaves the floor in mountain shadow.

Preview without touching a map: `?atmo={"preset":"dusk","sunElevation":6}` (URL-encoded JSON, merged over
the map's own values). `?sun=bearing,elevation` still overrides the sun.

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
- Performance / quality tiers: `PERF` in `web/src/gfx/perf.js` (render scale, shadows, AO, SMAA, terrain shader features, tree radii, spray budget).

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
//   depth?:    number         // metres the edge is sunk below the powder surface (spray starts at the surface)
// }>
```

- The emitter measures each contact's actual motion between frames. Sideways slip relative to `direction` (a skid or a hard stop) throws much more snow than a clean carve.
- The sheet / mist is thrown away from the biting edge: to the left for `edgeAngle > 0`.
- Snow softness comes from `ctx.powder` (0 hardpack … 1 deep powder).
- One-shots: `spray.landing(pos, impact, powder)`, `spray.stopFan(pos, dir, speed, powder, side)`, `spray.puff(pos, count, powder, speed)` and `spray.crash(pos, powder)`. `fx.js` already calls them from the `jumped`, `landed`, `hardBrake` and `crashed` events.
- **Skis today:** `contactsFromSkis(player)` in `fx.js` derives two contacts from `PlayerPhysics`. Edge angle is the lean that balances the turn (`atan(v·ω/g)`). Skid and brake swing the skis across the travel direction, with a snowplough wedge, and the outside ski carries more load.
- **Integrated:** `main.js` already calls `fx.setContactSource(() => rider.getContactPoints())`, so skis and board both feed the emitter. The text below is kept for reference.
- **Snowboard at merge time:** one line after `fx` is created in `main.js`:

  ```js
  fx.setContactSource(() => rider.getContactPoints());
  ```

  The board should report one or two contacts (for example the toe or heel edge under each binding) with the same shape. Nothing else is needed.

## Quality tiers (`?quality=0|1|2`)

| | 0 (low) | 1 (medium, default) | 2 (high) |
|---|---|---|---|
| Render scale | 0.75 × min(dpr,1) | min(dpr,1) | dpr (≤2) |
| Shadow box / map | 40 m / 1024 | 60 m / 2048 | 85 m / 3072 |
| N8AO (half resolution) | off | off | Medium |
| Snow glints | off | on | on |
| Snow wind ripples / sastrugi / corduroy | off | on | on |
| Track trenches | normal-mapped | normal-mapped | steep parallax |
| Rock detail | one projection, one fracture scale | one projection, one fracture scale | full |
| Trees: fronds → mid → far shells hand-over (ends of the cross-fade bands) | 35 / 126 m | 41 / 260 m | 58 / 420 m |
| Far tree / boulder distance | 1800 / 500 m | 3000 / 900 m | 4500 / 1400 m |
| Spray particle budget / mist | 35 % / 60 % | 65 % / 85 % | 100 % |
| Sun glare / lens ghosts | off / off | on / off | on / on |
| Spray shadows (dithered, in the sun shadow map) | off | on | on |
| SMAA preset | Low | Low | High |
| Scene MSAA (+ alpha-to-coverage needles) | off | off | off (opt-in `PERF.msaa`: too costly on an iGPU) |

All of these live in one table: `PERF` in `web/src/gfx/perf.js`. Measurements and reasoning are in
`docs/graphics-perf.md`.

Terrain LOD distances scale 0.6 / 1.0 / 1.5.

## No pop-in: LOD hand-over and load-time warm-up

Nothing should appear, vanish or change abruptly while you ride, and nothing compiles or uploads for
the first time mid-ride. Measured with `web/scripts/gfxpopin.mjs` on all three maps and tiers (numbers in
`docs/graphics-perf.md`).

| What | Where | How |
|---|---|---|
| Tree LODs | `gfx/trees.js` | LOD1 is the same tree as LOD0: same seed and cards, with every other frond card left out and the rest 25 % wider, plus the same core, trunk and skirts. (It used to be a different, sparser crown around a big dark core, which read as dark navy spires with white stripes.) The colour pass has no dither. Across the near band (25 % of the hand-over distance) LOD0 **geomorphs** into LOD1: a per-vertex `aMorph3` delta retracts the odd cards into the trunk and widens the even ones. It swaps where the two are identical. Across the mid band (15 %) LOD1 retracts its cards into the opaque far cone, which is already there. Every instance computes its band position in the vertex shader from the **live** camera position (`uLodEye`), not the pool centre of the last refill. Fully handed-over instances collapse in the vertex shader. Far shells never `discard` (that keeps early-z for thousands of them), and they shrink into the snow at the far distance. |
| Tree pools | `gfx/trees.js` | The near pool is refilled every 3 m from a 32 m spatial grid, the mid pool and the shadow cones every 10 m. Each pool holds every tree it can draw before the next refill. Capacity is every tree of the kind, so dense forests never get holes that fill in as you come closer. A dense map's `course.perf` hint still shrinks the hand-over distances. |
| Tree shadows | `gfx/trees.js` | Near fronds cast with the same morph and sway (custom depth material). Beyond them, shadow-only cones (far-shell geometry, drawn in the shadow pass only) cast for every tree in the shadow range (`box / sin(sun elevation)`). In the shadow pass only, fronds and cones cross-fade with complementary screen-door dither, which the PCF filter turns into a soft blend. Shadows no longer pop in when a tree crosses the near radius. |
| Boulders, fences, ice | `scatter.js`, `world.js` `withDistanceFade()` | Each instance shrinks into the snow over the last 22 % before its cull distance, so whole 750 m cells never pop. Vertex-only, no `discard`. Boulders switch to low poly only once every rock in the cell is beyond 400 m. |
| Terrain chunks | `terrain.js` | Geomorphing (CDLOD-style): each vertex carries `aMorph` = (height difference to the next-coarser grid, LOD). Over the last 30 % before a LOD distance the vertex slides onto the coarser surface, so the chunk looks identical when it swaps. The same applies to the 10 m mid ring. Chunk geometry is built ahead along the camera velocity (3 s look-ahead), and spare geometry stays in an LRU cache (48) instead of being rebuilt. |
| Track parallax (high) | `gfx/snow.js` | The trench parallax offset fades out over 32–45 m instead of switching off at 45 m. |
| Shader compiles | `gfx/prewarm.js`, `main.js` | Behind the loading screen: fill LOD and tree pools around the spawn and the lobby spot, upload every texture (`initTexture`), then render warm frames with everything on screen once. That covers all tree LODs with their shadow shaders, a spray particle with its shadow shader, the speed-wind pass, the track stamp + recentre passes, culled scatter cells and every shadow caster unculled. It also warms each distinct shadow-depth variant: three's shared depth material only re-picks its program when state flips between draws, so each caster variant is drawn once right after a dummy that forces the re-pick. After loading, the other quality levels' terrain / backdrop shaders compile in the background (`compileAsync`). |
| Textures | `gfx/snow.js` | Loading waits (up to 8 s) for the rock detail JPEG, so it no longer swaps in from a grey placeholder mid-ride. |

Knobs: `PERF.trees` (hand-over distances, band fractions), `PERF.treeRefill`, `PERF.terrainMorph`,
`PERF.terrainLookahead`, `PERF.terrainCache`, `PERF.scatterFadeBand`, `PERF.boulderLoDistance` in
`web/src/gfx/perf.js`.

Not covered: changing the quality level in the settings still compiles the post-processing variants
(AO / SMAA presets) once. That happens in a menu, not while riding.

## Debug and preview helpers

- URL params: `?tm=agx` (tone curve), `?exposure=0.62`, `?sun=bearing,elevation` (degrees), `?goggles=1` (amber goggle lens), plus the existing `?ride`, `?quality`, `?at`, `?kicker`.
- `?shaderdebug` turns three.js shader log checks back on. They are off by default because reading program logs stalls on the first use of every program, and ANGLE/D3D11 prints a benign compiler warning for the third-party N8AO shader.
- `window.__post` is the PostStack instance (debug).
- `window.__gfxCam = [px,py,pz, tx,ty,tz, fov?]` or a function returning that array overrides the camera (honoured in `sky.js`). This is for screenshots.
- `node web/scripts/gfxpopin.mjs <url> [maps] [qualities] [seconds]` flies the camera down each map's run at speed and counts pops per second (tree LOD jumps, tree shadows starting or stopping, scatter cells, terrain LOD swaps). It also counts mid-ride shader compiles and texture uploads, frame spikes, and reports load time. `node web/scripts/gfxpopshots.mjs <url> <map> <start> <steps> <stepMetres> <outDir>` saves a fixed-step screenshot sequence for before/after comparisons.
- `node web/scripts/gfxshots.mjs <url> <outDir> <views.json>` boots once in headless Chromium and captures many views (`cam`, `side` rider-relative camera, `keys`, `eval`, `wait`). Set `SUF=_x` to suffix the file names. `GPU=1` renders on the real GPU through ANGLE/D3D11, which is much faster than SwiftShader on this machine; `clip` captures a sub-rectangle.

## Performance (second pass)

Measured with the perf branch's `web/scripts/gfxperf.mjs` (rides and carves, real GPU through ANGLE/D3D11, vsync off, 1600×900, Intel Arc 130V integrated GPU). Median render + sync per frame:

| | original (6b25d66) | this branch |
|---|---|---|
| quality 0 | 24.7 ms | 21.9 ms |
| quality 1 | 58.0 ms | 29.6 ms |
| quality 2 | ~100 ms | ~105 ms (within run-to-run noise) |

The first version of this pass doubled quality 0, because the faceted rock and flutes ran on the backdrop and mid ring, which cover much of the screen. Those now run on high only. `web/scripts/gfxperf-ride.mjs` is a simpler throttle-only probe (CPU frame intervals plus hitch log). Its numbers are unreliable on this machine and it is kept only for hitch logging. Multi-second hitches appear in both builds and are environmental.

## Known issues / not done

- Performance: see `docs/graphics-perf.md`. Earlier versions of this file claimed about 2 ms per frame, and later about 13 / 27 / 29 ms. The first came from headless `requestAnimationFrame` deltas, which don't measure GPU cost. The second came from an unpipelined render plus `readPixels`, which overstates the frame time. Measured with GPU timer queries on an Intel Arc 130V iGPU at 1600×900, the game is GPU-bound at about **9 / 14 / 22 ms per frame** on quality 0 / 1 / 2 (about 110 / 72 / 45 fps). The main thread costs about 5 ms.
- Cornices are found procedurally on convex breaks and are visual only (no collision). The hand-built gully has few true crests, so they are sparse there.
- Rock ledge bands follow world height. Very large faces can still show some banding at mid distance.
- The rider and lifts still use `toonMaterial` (now HDR-lit). The neon emissive trims stay but read dimmer under the new exposure. The ink outline is off (`OUTLINE.px = 0`).
- The crowd billboards and flags keep their stylized textures.
- Mid ring: the backdrop beyond ±6 km is still the coarse 58 m grid (far enough that aerial perspective hides it). The ring adds about 50 draw calls.
- Flutes on diagonal faces of the backdrop switch projection along a narrow seam. The 4-cell blend on the tile can fade the flutes where neighbouring cells disagree.
- The hard-stop fan is small at chase-camera distance, so it could be bigger and denser. Powder clouds over sunlit snow are subtle (white on white), and on medium/low they have no shadow to separate them.
- Ski poles, rider and lifts are untouched (owned by other sessions).
- Real resorts (`?resort=`) use the same shaders. Corduroy appears where OSM marks groomed pistes. The distant ranges ring is fictional there as well.
