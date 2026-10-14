# SENDIT — working notes (memory file)

Godot 4.4.1, Forward+, GDScript. Headless binary used for checks lives outside the repo (scratchpad).

## Current phase
Phase 1 — Foundation (done)

## Files
- project.godot — config, autoloads, input map (speed_up, brake, carve_left/right, jump, tuck, reset, pause, cam_*), physics interpolation on.
- default_bus_layout.tres — buses: Master, Music, SFX.
- core/event_bus.gd — autoload EventBus: global signals.
- core/game_state.gd — autoload GameState: Mode enum, Quality enum, settings (user://settings.cfg), relaxed score.
- core/main.tscn / main.gd — root scene.

## Input map
W/Up/LStick-up/RT = speed_up (tuck/push) · S/Down/LStick-down/LT = brake · A/D/LStick-x = carve · Space/A = jump (hold to charge) · Shift/RB/B = tuck · R/Y = reset · Esc/Start = pause · RStick = camera.

## Known issues
- none yet
