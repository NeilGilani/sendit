# SENDIT — working notes (memory file)

Godot 4.4.1, Forward+, GDScript. Headless binary for checks lives outside the repo (scratchpad).
Heavy commands run with `nice -n 19`.

## Overnight additions (branch overnight-improvements)
- Lobby is the first screen (web/src/lobby, profile, maps, services). Guide: docs/lobby.md. Tests: `node web/scripts/lobbytest.mjs <url>`, `node web/scripts/unittest.mjs`.
- Skis + snowboard with separate physics (web/src/physics, web/src/equipment). `?equip=ski|snowboard`, `?variant=`, `?stance=goofy`, `?gearswap` lets E swap gear while riding (debug only). Guide: docs/equipment.md, research: docs/equipment-research.md. Benches: web/scripts/physics-*.mjs.
- Realistic HDR look: snow, rock, trees, sky, spray (web/src/gfx, post stack in gfx/post.js). Guide: docs/graphics.md, research: docs/graphics-research.md. Screens: `GPU=1 node web/scripts/gfxshots.mjs`.
- Spray is fed by `rider.getContactPoints()`; the lobby stage uses the game's GradeEffect because materials render linear HDR.

## Web build (web/, Three.js) — the primary target now
Stylized arcade snowboarding ("vibey anime" cel look). Run: `cd web && npm install && npm run dev` → http://localhost:5173 (`?ride` skip menu, `?quality=0|1|2`, `?kicker=0..2` start before a kicker, `?at=x,z,heading`).
- web/src/scene.js — THE SCENE FILE: LIGHTING (soft sun + sky fill + exposure curve), SNOW (clean clay-snow optics: scattered sun, blue shade, subsurface glow, satin sheen, trenches), ATMOSPHERE (daylight sky, haze), SNOWFALL, OUTLINE, SPAWN (pines, brown rock outcrops), JUMPS (kickers/rollers/pillows), COURSE (the hand-built gully).
- web/src/course.js — the hand-built world: one height function (winding gully, walls, natural drops, berms, valley, peaks, horn) → terrain arrays. Real Matterhorn data in assets/terrain is no longer used by the web build.
- web/src/realcourse.js — real Lake Tahoe mountains (same interface as Course): DEM + far grid, chosen run carved as a groomed lane, lumps, forest/piste masks, real lifts, Lake Tahoe water. Data: `python3 tools/build_resorts.py [id…]` → assets/resorts/ (index.json, <id>.json, _dem/_far/_mask.bin). Menu → Mountains, or ?resort=<id>&run=<n>.
- web/src/activities.js — Zen vs Challenge: snowflakes (12/run, saved), slalom gates (+2 s missed), countdown/timer, style combo multiplier, medals by average speed (CHALLENGE.medalSpeeds), ghost of best run (localStorage sendit.ghost.<key>), results. ?challenge starts one.
- web/src/life.js — other skiers on the run, chairlift passengers, lodge + chimney smoke at the bottom (clearing kept tree-free), birds.
- web/src/config.js — gameplay tunables: PHYSICS, ANIM (juice), CAMERA, FX, ART (rim, neon, wind), HUD (speed milestones 50/100/150, corner wind-streak speeds).
- world.js — shader chunk patches (stylized fog, baked mountain-shadow factor), toonMaterial() 3-band cel shading (cream/periwinkle/indigo) + Fresnel rim + emissive neon hook, outlineMaterial() inverted hull (skinned too), noise tex, math helpers.
- terrain.js — DEM chunks w/ LOD + skirts, cel snow shader (drifts, corduroy, vector sparkle, carved-track map sampling), baked sun mask/sky vis, far backdrop; getHeight() adds park features.
- sky.js — gradient sky, sun disk/halo, cel clouds, sun + texel-snapped shadow box, hemisphere fill.
- scatter.js — procedural faceted pines (wind sway vertex shader) + low-poly rocks, instanced per 750 m cell; obstacle hash, nearest() for close shaves.
- features.js — kickers S/M/L on the opening run (height field), flags + start banner (wave shaders, fictional Northwake/Valcrest canvas art), bobbing crowd billboards, valley fog pockets.
- lifts.js — OSM lifts (toon materials), chairs, ride API.
- player.js — PlayerPhysics (arcade snowboard): carving, squat-charged jump, auto-tuck, spins, landing eval (clean / stumble 20–45° / crash), near-miss + hard-brake events, lifts.
- rider.js — Quaternius rig as snowboarder: edge-dig roll, squat scale, squash & stretch spring, chatter, hip lean, flail, tuck; outlines, neon suit + board, helmet/goggles.
- camera.js — CameraController: FoV elasticity + snap, trauma shake, big-air side swing, intro drop, menu flyover.
- fx.js — FXManager: instanced particles (cruise fog / carve wedges / brake fan / landing ring / jump pop / speed lines) + TrackMap render texture (ping-pong recentring).
- audio.js — WebAudio loops + one-shots; ui.js/style.css — menu, HUD, big popups; input.js — keyboard/mouse/gamepad; state.js — modes/score/settings.
- main.js — boot, post stack (N8AO indigo AO, bloom for neon, WindEffect streaks, saturation/contrast, SMAA), fixed-step loop.
- web/scripts/shot.mjs — headless Chromium (SwiftShader) screenshot + console errors.

## Current phase (Godot)
FINAL — all phases done (1-8). Verified: headless autotest + UI flow script; Forward+ frames via lavapipe (xvfb, VK_ICD_FILENAMES=.../lvp_icd.json).

## Files
- project.godot — config, autoloads, input map, physics interpolation on.
- default_bus_layout.tres — buses: Master, Music, SFX.
- core/event_bus.gd — autoload EventBus: global signals.
- core/game_state.gd — autoload GameState: Mode/Quality enums, settings (user://settings.cfg), relaxed score.
- core/main.tscn / main.gd — root; builds Terrain, Scatter, Lifts, Atmosphere, Skier, SkiTrails, PowderSpray, ChaseCamera, SoundScape, UIRoot; flow MENU -> start_ride() -> RIDING (pause via UI) -> to_menu(). `-- --autotest` scripted ride w/ diagnostics; `-- --shot=file.png` saves frame 40.
- tools/build_mountain.py — downloads Copernicus GLO-30 tiles (AWS) + OSM (Overpass, mirror fallback) for a 6x6 km box centred 45.983N 7.688E (Matterhorn + Schwarzsee/Furgg ski area). Writes assets/terrain/*. Caches in tools/cache (gitignored). tools/.gdignore hides tools/ from Godot.
- tools/write_import_settings.py — writes .import files (mipmaps, VRAM, normal-map flag) for textures; run before first import.
- tools/preview/ — heightmap16.png (16-bit) and splat.png previews.
- assets/terrain/ — height_f32.bin (2048², metres, row0 = north), normal_rg8.bin, splat_rgb8.bin (R groomed, G rock, B forest; powder = remainder), far_f32.bin (512², 30 km backdrop), terrain.json (meta + spawn), pistes.json, lifts.json, scatter.json (trees/rocks [x,y,z,yaw,scale,variant]).
- terrain/terrain.gd — class Terrain (static instance). 16x16 chunks of 128 quads; shared flat grid per LOD (5 LODs) displaced in shader; skirts flagged in UV2.x; far backdrop mesh; HeightMapShape3D (uniform-scaled) on 3x3 chunks around camera; get_height / get_normal / get_surface_weights (Vector4 groomed,powder,rock,forest) / get_surface_type / get_spawn / is_inside.
- terrain/scatter.gd — class Scatter: MultiMesh per 750 m cell per variant, visibility ranges by quality; obstacle hash, find_obstacle(pos, r) -> Vector3(x, z, radius) or null.
- terrain/lifts.gd — class Lifts: towers/stations/wheels (MultiMesh), sagging cables (one mesh), animated chairs/gondolas near camera; ride API: find_boardable, nearest_base, ride_length, seat_transform, static merge() helper for primitive meshes.
- rendering/terrain.gdshader — terrain displacement + shading (phase 2 basic; full snow shader in phase 6).
- rendering/terrain_far.gdshader — backdrop terrain, sinks 80 m under the playable square.
- rendering/terrain_materials.gd — static hooks to configure terrain materials.
- rendering/snow_materials.gd, foliage_snow.gdshader, prop_snow.gdshader — snow-dusted materials for pines/rocks.
- assets/models/nature/ — Quaternius pines (Pine_1..5) and rocks (Rock_Medium_1..3), CC0.

- player/ski_tuning.gd + ski_tuning.tres — SkiTuning resource: ALL ski tunables (input smoothing, carving, friction, drag, soft speed cap, jump, spins, crash thresholds, lift ride).
- player/skier.gd — class Skier (Node3D, _physics_process). States FROZEN/GROUNDED/AIR/CRASH/LIFT. Slope gravity, grip w/ carve redirection, auto-align, downhill settle, push, skid brake, charged jump, air spins, soft landings (auto-align, backwards = pivot), gentle crash -> fade -> respawn at safe point, obstacle bump/crash, map bounds, scoring (distance per 250 m, air >0.8 s + spins, smooth turns), lift boarding (slow within 22 m of a rideable base) and ride (W = faster) + dismount. Public: state, velocity, speed, heading, steer, brake, tuck, charge, carve, skid, air_time, spin_rate, crash_t, lift_t, surface, landing_squash, ground_normal, forward_dir(), start_riding(), place().

- tools/prep_character.py — copies Quaternius Superhero_Male glTF to assets/models/skier/skier.gltf, bakes COLOR_0 zones (R jacket, G pants, B gloves/boots, A coverage), 1K textures.
- player/skier_rig.gd — class SkierRig (child "Rig" of Skier): Visual node (lean/skid/tumble), model rotated 180° (model faces +Z), bone posing in skeleton space (+Z fwd, +X = model left): pelvis drop/pitch, spine bend, head counter, analytic 2-bone leg IK (knee pole fwd), arm aim blends (stance/tuck/air/sit/crash); skis follow feet, poles from hands; helmet/strap/goggles on BoneAttachment3D(Head).
- rendering/skier_suit.gdshader — outfit from zones (teal "Northwake" jacket w/ amber band, charcoal pants), slight inflation along normals.

- camera/chase_camera.gd — class ChaseCamera (top_level, interpolation off, _process): smooth-damped follow (floaty), lagged yaw toward travel, SpringArm3D (mask 1, sphere 0.35) + terrain floor clamp, FOV 68→80 with speed, slow orbit after 3 s still, mouse/right-stick look easing back, lift/crash framing, main-menu flyover orbiting the highest summit. snap() on respawn/lift arrival.
- NOTE: new class_name scripts need `godot --headless --import` once to refresh the class cache before running.

- rendering/atmosphere.gd — class Atmosphere: WorldEnvironment (custom sky shader, AgX, soft glow, exp fog + aerial perspective + valley height fog), golden-hour sun (WNW, 14°), quality presets (shadows, SSAO M/H, SSIL/SDFGI/volumetric fog High only, TAA M/H, FSR on Low, LOD threshold, aniso), snowfall GPUParticles following camera (setting).
- rendering/sky.gdshader — single-scattering Rayleigh/Mie/ozone atmosphere from 3000 m, sun disk, high cloud layer (NoiseTexture2D), hazy below-horizon.
- rendering/terrain.gdshader — full snow shader: powder (snow_02) / groomed (snow_01) two-scale anti-tiling, triplanar rock_face_03, wind sastrugi (cellular normal noise), corduroy ridges + groomer lanes along fall line, custom light(): wrap translucency, GGX spec, sparkle glints, blue shadow fill.
- rendering/terrain_far.gdshader — backdrop with triplanar rock, snow, low-valley forest tint.
- rendering/terrain_materials.gd — loads textures, macro/wind NoiseTextures, apply_quality().
- rendering/ski_trails.gd + ski_trail.gdshader — two groove ribbons (ImmediateMesh, 700 pts each), tangent across groove.
- rendering/powder_spray.gd — GPUParticles spray (amount_ratio from skid/carve/speed/powder) + landing puff.
- rendering/soft_sprite.gd — shared radial sprite.
- assets/models/rocks/ — Poly Haven rock_07, rock_09 (1K glTF) used by Scatter (ROCK_SCALE per variant).
- assets/textures/ — Poly Haven snow_02, snow_01, rock_face_03 (2K). Import settings via tools/write_import_settings.py.
- tools/gen_audio.py — synthesizes all audio (CC0) to assets/audio/*.ogg.
- audio/sound_scape.gd — class SoundScape: loops powder/groomed/carve/wind_speed/wind ambient blended by surface/speed/turn; landing thumps; random distant birds (3D); music with slow fades and occasional rests.
- ui/ui_root.gd — class UIRoot (CanvasLayer, process always): theme in code; main menu (Ride/Settings/Credits/Quit) over flyover; HUD (speed km/h fades when idle, soft score notes, hints, lift label); pause (stats, resume, back to top, settings, main menu, quit); settings (quality, volumes, mouse/camera sensitivity, snowfall, fullscreen); credits parsed from CREDITS.md; fade overlay (EventBus.fade_request).
- export_presets.cfg — Linux/Windows with include filter *.bin, *.json, CREDITS.md.

## Coordinates
x = east, z = south (north = -Z), metres, origin = box centre. Heading yaw 0 = facing -Z.

## Input map
W/Up/LStick-up/RT = speed_up · S/Down/LStick-down/LT = brake · A/D/LStick-x = carve · Space/A = jump (hold to charge) · Shift/RB/B = tuck · R/Y = reset · Esc/Start = pause · RStick = camera.

## Testing recipes
- Import/class cache: `godot --headless --import --path .`
- Scripted ride: `godot --headless --path . --quit-after 900 -- --autotest`
- Screenshot (software Vulkan, slow): `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json xvfb-run -a godot --rendering-driver vulkan --path . --quit-after 46 -- --autotest --shot=/tmp/x.png` (add `--charcam` for a side view of the skier).

## Known issues
- Copernicus DSM has void-filled blocky patches on the Matterhorn's steepest faces; summit reads ~4330 m.
- .bin/.json data are read with FileAccess: export_presets.cfg includes `*.bin, *.json, CREDITS.md`.
- Headless (dummy audio driver) quits with "resources still in use" for the looping OGG streams — harmless.
- Pines are stylized Quaternius models re-shaded; photoreal conifers (Poly Haven) are millions of polys and unsuitable for scattering.
- Lift boarding is automatic: glide slowly (<7 m/s) within ~22 m of a rideable lift's bottom station. The skier rides a personal chair that may overlap a moving chair.
- Spawn piste is chosen automatically by tools/build_mountain.py (longest easy/intermediate run near a lift top).
