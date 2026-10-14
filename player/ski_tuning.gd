class_name SkiTuning
extends Resource
## Every skiing tunable in one place. Edit player/ski_tuning.tres to change the feel.

@export_group("Input smoothing")
@export var steer_response := 5.0        ## how fast steering input eases in (1/s)
@export var brake_response := 4.0
@export var tuck_response := 3.0

@export_group("Carving")
@export var turn_rate_slow := 2.2        ## rad/s at walking pace
@export var turn_rate_fast := 1.15       ## rad/s at high speed (wider, calmer arcs)
@export var grip := 4.5                  ## lateral velocity decay (1/s) on groomed snow
@export var powder_grip := 3.2
@export var carve_efficiency := 0.9      ## share of lateral speed redirected forward when carving
@export var auto_align := 0.9            ## heading drift toward travel direction when idle (1/s)
@export var downhill_settle := 1.2       ## heading drift toward fall line when stopped (1/s)

@export_group("Speed")
@export var gravity := 9.81
@export var friction_groomed := 0.035
@export var friction_powder := 0.075
@export var friction_rock := 0.14
@export var friction_forest := 0.06
@export var drag_upright := 0.0036       ## quadratic air drag (per m)
@export var drag_tuck := 0.0016
@export var soft_cap_speed := 20.0       ## above this, extra drag keeps things calm (m/s)
@export var soft_cap_drag := 0.045
@export var push_accel := 2.6            ## skating / poling when W is held at low speed
@export var push_max_speed := 7.0
@export var brake_decel := 5.5
@export var brake_skid_angle := 1.15     ## rad: how sideways the skis turn when skidding
@export var hold_still_slope := 0.16     ## below this slope (1 - n.y) a stopped skier stays put

@export_group("Air")
@export var takeoff_gap := 0.35          ## metres the ground must fall away to leave it
@export var charge_time := 0.9
@export var jump_min := 2.4
@export var jump_max := 6.2
@export var air_drag := 0.008
@export var spin_rate_max := 3.1         ## rad/s — slow, graceful spins
@export var spin_response := 2.5
@export var land_align_rate := 7.0

@export_group("Crash")
@export var crash_impact := 15.0         ## m/s into the slope
@export var crash_angle := 115.0         ## degrees between skis and travel on landing
@export var crash_angle_min_speed := 9.0
@export var tree_crash_speed := 10.0
@export var tumble_time := 1.3
@export var fade_time := 0.7

@export_group("Visual smoothing")
@export var orient_response := 10.0
@export var normal_radius := 1.6

@export_group("Lift")
@export var lift_ride_seconds := 70.0
@export var lift_board_speed := 7.0
