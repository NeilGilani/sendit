# SENDIT — working notes (memory file)

Godot 4.4.1, Forward+, GDScript. Headless binary for checks lives outside the repo (scratchpad).
Heavy commands run with `nice -n 19`.

## Current phase
Phase 4 — Character (done)

## Files
- project.godot — config, autoloads, input map, physics interpolation on.
- default_bus_layout.tres — buses: Master, Music, SFX.
- core/event_bus.gd — autoload EventBus: global signals.
- core/game_state.gd — autoload GameState: Mode/Quality enums, settings (user://settings.cfg), relaxed score.
- core/main.tscn / main.gd — root; builds Terrain, Scatter, Lifts, Skier (+ temporary sun/camera). `-- --autotest` runs a scripted headless ride printing diagnostics.
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

## Coordinates
x = east, z = south (north = -Z), metres, origin = box centre. Heading yaw 0 = facing -Z.

## Input map
W/Up/LStick-up/RT = speed_up · S/Down/LStick-down/LT = brake · A/D/LStick-x = carve · Space/A = jump (hold to charge) · Shift/RB/B = tuck · R/Y = reset · Esc/Start = pause · RStick = camera.

## Known issues
- Copernicus DSM has void-filled blocky patches on the Matterhorn's steepest faces; summit reads ~4330 m.
- .bin/.json data are read with FileAccess: exports need include filter `*.bin, *.json` (see export notes, later).
