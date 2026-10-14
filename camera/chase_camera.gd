class_name ChaseCamera
extends Node3D
## Floaty chase camera: lagged follow, FOV that breathes with speed, a SpringArm3D that never clips,
## a slow orbit when standing still, mouse/stick look, and a calm flyover for the main menu.

@export var base_distance := 4.8
@export var height := 1.45
@export var base_pitch := -13.0
@export var base_fov := 68.0
@export var fast_fov := 80.0

var skier: Skier
var yaw_pivot: Node3D
var pitch_pivot: Node3D
var arm: SpringArm3D
var camera: Camera3D

var _pos := Vector3.ZERO
var _vel := Vector3.ZERO
var _yaw := 0.0
var _pitch := 0.0
var _look_yaw := 0.0     ## manual offsets from mouse/stick
var _look_pitch := 0.0
var _look_idle := 10.0
var _still_time := 0.0
var _orbit := 0.0
var _fov := 68.0
var _dist := 4.8
var _menu_angle := 0.0
var _menu_focus := Vector3.ZERO
var _menu_radius := 1500.0
var _was_menu := true


func _ready() -> void:
	top_level = true
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	yaw_pivot = Node3D.new()
	add_child(yaw_pivot)
	pitch_pivot = Node3D.new()
	yaw_pivot.add_child(pitch_pivot)
	arm = SpringArm3D.new()
	arm.collision_mask = 1
	var sph := SphereShape3D.new()
	sph.radius = 0.35
	arm.shape = sph
	arm.margin = 0.2
	arm.spring_length = base_distance
	pitch_pivot.add_child(arm)
	camera = Camera3D.new()
	camera.near = 0.08
	camera.far = 40000.0
	camera.fov = base_fov
	camera.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	arm.add_child(camera)
	camera.current = true
	_pitch = base_pitch
	_fov = base_fov
	EventBus.player_respawned.connect(snap)
	EventBus.lift_arrived.connect(snap)
	_setup_menu_orbit()


func _setup_menu_orbit() -> void:
	var t := Terrain.instance
	if t == null:
		return
	# Orbit the highest summit in view — the Matterhorn — from the ski area side.
	var best := Vector3.ZERO
	var bh := -INF
	for j in range(0, t.res, 16):
		for i in range(0, t.res, 16):
			var h := t.heights[j * t.res + i]
			if h > bh:
				bh = h
				best = Vector3(-t.half + i * t.spacing, h, -t.half + j * t.spacing)
	_menu_focus = best
	var s := t.get_spawn()
	var to_spawn: Vector3 = s.position - best
	_menu_angle = atan2(to_spawn.x, to_spawn.z)
	_menu_radius = clampf(Vector2(to_spawn.x, to_spawn.z).length() * 0.8, 1300.0, 2400.0)


func snap() -> void:
	if skier == null:
		return
	_pos = skier.global_position + Vector3.UP * height
	_vel = Vector3.ZERO
	_yaw = skier.heading
	_look_yaw = 0.0
	_look_pitch = 0.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var s: float = GameState.settings.mouse_sensitivity * 0.0025
		_look_yaw -= event.relative.x * s
		_look_pitch = clampf(_look_pitch - event.relative.y * s * 57.3, -35.0, 40.0)
		_look_idle = 0.0


func _process(dt: float) -> void:
	if GameState.mode == GameState.Mode.MENU or GameState.mode == GameState.Mode.CREDITS or skier == null:
		_menu_flyover(dt)
		_was_menu = true
		return
	if _was_menu:
		_was_menu = false
		snap()
	_follow(dt)


func _menu_flyover(dt: float) -> void:
	_menu_angle += dt * 0.018
	var t := Terrain.instance
	var p := _menu_focus + Vector3(sin(_menu_angle), 0, cos(_menu_angle)) * _menu_radius
	var ground := t.get_height(p.x, p.z) if t else 0.0
	p.y = maxf(ground + 220.0, _menu_focus.y - 650.0)
	global_position = p
	yaw_pivot.rotation = Vector3.ZERO
	pitch_pivot.rotation = Vector3.ZERO
	arm.spring_length = 0.0
	camera.position = Vector3.ZERO
	camera.fov = lerpf(camera.fov, 55.0, 1.0 - exp(-2.0 * dt))
	var look := _menu_focus + Vector3(0, -700.0, 0)
	if p.distance_to(look) > 1.0:
		yaw_pivot.look_at(look, Vector3.UP)


func _follow(dt: float) -> void:
	var xf := skier.get_global_transform_interpolated()
	var target := xf.origin + Vector3.UP * height
	var riding_lift := skier.state == Skier.State.LIFT
	var speed := skier.speed

	# Critically-damped follow: horizontal a bit tighter than vertical for a floaty feel.
	var smooth_h := 0.16 if not riding_lift else 0.35
	var smooth_v := 0.28
	_pos.x = _smooth_damp_axis(_pos.x, target.x, 0, smooth_h, dt)
	_pos.z = _smooth_damp_axis(_pos.z, target.z, 2, smooth_h, dt)
	_pos.y = _smooth_damp_axis(_pos.y, target.y, 1, smooth_v, dt)
	if _pos.distance_to(target) > 40.0:
		snap()
	global_position = _pos

	# Look direction: travel direction when moving, skis when slow; lagged.
	var travel := Vector3(skier.velocity.x, 0, skier.velocity.z)
	var want_yaw := skier.heading
	if speed > 2.5 and skier.state != Skier.State.CRASH:
		want_yaw = lerp_angle(skier.heading, atan2(-travel.x, -travel.z), clampf((speed - 2.5) / 4.0, 0.0, 1.0))
	var yaw_rate := 2.0 if skier.state != Skier.State.AIR else 0.8
	_yaw = lerp_angle(_yaw, want_yaw, 1.0 - exp(-yaw_rate * dt))

	# Manual look from right stick; eases back after a while.
	var stick := Vector2(Input.get_action_strength("cam_right") - Input.get_action_strength("cam_left"),
		Input.get_action_strength("cam_down") - Input.get_action_strength("cam_up"))
	if stick.length() > 0.1:
		var cs: float = GameState.settings.camera_sensitivity
		_look_yaw -= stick.x * 2.2 * cs * dt
		_look_pitch = clampf(_look_pitch - stick.y * 70.0 * cs * dt, -35.0, 40.0)
		_look_idle = 0.0
	_look_idle += dt

	# Calm slow orbit when standing still.
	if speed < 0.5 and skier.state == Skier.State.GROUNDED:
		_still_time += dt
	else:
		_still_time = 0.0
	var orbiting := _still_time > 3.0
	if orbiting:
		_orbit += dt * 0.12 * clampf(_still_time - 3.0, 0.0, 1.0)
	else:
		_orbit = lerp_angle(_orbit, 0.0, 1.0 - exp(-1.5 * dt))
	if _look_idle > 2.5 and not orbiting:
		_look_yaw = lerp_angle(_look_yaw, 0.0, 1.0 - exp(-1.2 * dt))
		_look_pitch = lerpf(_look_pitch, 0.0, 1.0 - exp(-1.2 * dt))

	var speed01 := clampf(speed / 24.0, 0.0, 1.0)
	var want_pitch := base_pitch - speed01 * 3.0 + _look_pitch
	if orbiting:
		want_pitch = -8.0 + _look_pitch
	if riding_lift:
		want_pitch = -9.0 + _look_pitch
	_pitch = lerpf(_pitch, want_pitch, 1.0 - exp(-2.5 * dt))
	var want_dist := base_distance + speed01 * 1.2 - skier.tuck * 0.6
	if orbiting:
		want_dist = 6.5
	if riding_lift:
		want_dist = 7.5
	if skier.state == Skier.State.CRASH:
		want_dist = 6.0
	_dist = lerpf(_dist, want_dist, 1.0 - exp(-1.5 * dt))
	arm.spring_length = _dist

	yaw_pivot.rotation = Vector3(0, _yaw + _look_yaw + _orbit, 0)
	pitch_pivot.rotation = Vector3(deg_to_rad(_pitch), 0, 0)
	camera.position = Vector3.ZERO

	var want_fov := lerpf(base_fov, fast_fov, smoothstep(0.25, 1.0, speed01))
	_fov = lerpf(_fov, want_fov, 1.0 - exp(-1.2 * dt))
	camera.fov = _fov

	# Never below the snow, even far from collision chunks.
	var t := Terrain.instance
	var cp := camera.global_position
	var floor_h := t.get_height(cp.x, cp.z) + 0.7
	if cp.y < floor_h:
		camera.global_position = Vector3(cp.x, floor_h, cp.z)


var _sd_vel := [0.0, 0.0, 0.0]


func _smooth_damp_axis(current: float, target: float, axis: int, smooth: float, dt: float) -> float:
	var omega := 2.0 / maxf(smooth, 0.0001)
	var x := omega * dt
	var e := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
	var change := current - target
	var temp: float = (_sd_vel[axis] + omega * change) * dt
	_sd_vel[axis] = (_sd_vel[axis] - omega * temp) * e
	return target + (change + temp) * e
