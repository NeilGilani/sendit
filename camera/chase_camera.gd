class_name ChaseCamera
extends Node3D
## Cinematic chase camera: floaty smooth-damped follow, zooms out and tilts with speed, swings to a
## side angle on big air, punches in on landings, trauma-based shake, FOV kicks, terrain-aware arm,
## idle orbit, mouse/stick look, menu flyover and a seamless intro drop from the flyover to the skier.
## Other systems (photo mode, replay) can take over by setting `external = true`.

@export var base_distance := 5.4
@export var height := 1.9
@export var base_pitch := -16.0
@export var base_fov := 68.0

var skier: Skier
var camera: Camera3D
var external := false

var _pos := Vector3.ZERO
var _vel := [0.0, 0.0, 0.0]
var _yaw := 0.0
var _pitch := -16.0
var _look_yaw := 0.0
var _look_pitch := 0.0
var _look_idle := 10.0
var _still_time := 0.0
var _orbit := 0.0
var _fov := 68.0
var _dist := 5.4
var _arm := 5.4
var _roll := 0.0
var _side := 0.0
var _side_sign := 1.0
var _menu_angle := 0.0
var _menu_focus := Vector3.ZERO
var _menu_radius := 1500.0
var _was_menu := true
var _intro_t := 1.0
var _intro_from := Transform3D()
var _intro_fov := 55.0
var _noise := FastNoiseLite.new()
var _real_t := 0.0


func _ready() -> void:
	top_level = true
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	process_priority = 100
	camera = Camera3D.new()
	camera.near = 0.08
	camera.far = 40000.0
	camera.fov = base_fov
	camera.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(camera)
	camera.current = true
	camera.top_level = true
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 1.0
	EventBus.player_respawned.connect(snap)
	EventBus.lift_arrived.connect(snap)
	_setup_menu_orbit()


func _setup_menu_orbit() -> void:
	var t := Terrain.instance
	if t == null:
		return
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
	_vel = [0.0, 0.0, 0.0]
	_yaw = skier.heading
	_look_yaw = 0.0
	_look_pitch = 0.0
	_side = 0.0


## Seamless swoop from wherever the camera is now (e.g. the menu flyover) down to the skier.
func start_intro_drop(duration := 2.8) -> void:
	_intro_from = camera.global_transform
	_intro_fov = camera.fov
	_intro_t = 0.0
	set_meta("intro_duration", duration)
	snap()


func is_intro_playing() -> bool:
	return _intro_t < 1.0


func _unhandled_input(event: InputEvent) -> void:
	if external:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var s: float = GameState.settings.mouse_sensitivity * 0.0025
		_look_yaw -= event.relative.x * s
		_look_pitch = clampf(_look_pitch - event.relative.y * s * 57.3, -35.0, 40.0)
		_look_idle = 0.0


func _process(dt: float) -> void:
	var rdt := minf(dt / maxf(Engine.time_scale, 0.03), 0.1)
	_real_t += rdt
	if external:
		return
	if GameState.mode == GameState.Mode.MENU or GameState.mode == GameState.Mode.CREDITS or skier == null:
		_menu_flyover(dt)
		_was_menu = true
		return
	if _was_menu:
		_was_menu = false
		if _intro_t >= 1.0:
			snap()
	_follow(dt, rdt)


func _menu_flyover(dt: float) -> void:
	_menu_angle += dt * 0.018
	var t := Terrain.instance
	var p := _menu_focus + Vector3(sin(_menu_angle), 0, cos(_menu_angle)) * _menu_radius
	var ground := t.get_height(p.x, p.z) if t else 0.0
	p.y = maxf(ground + 220.0, _menu_focus.y - 650.0)
	var look := _menu_focus + Vector3(0, -700.0, 0)
	camera.global_transform = Transform3D(Basis.looking_at(look - p, Vector3.UP), p)
	_fov = lerpf(_fov, 55.0, 1.0 - exp(-2.0 * dt))
	camera.fov = _fov


func _follow(dt: float, rdt: float) -> void:
	var xf := skier.get_global_transform_interpolated()
	var target := xf.origin + Vector3.UP * height
	var lift := skier.state == Skier.State.LIFT
	var grind := skier.state == Skier.State.GRIND
	var sh := 0.35 if lift else 0.16
	_pos.x = _damp(_pos.x, target.x, 0, sh, dt)
	_pos.z = _damp(_pos.z, target.z, 2, sh, dt)
	_pos.y = _damp(_pos.y, target.y, 1, 0.28, dt)
	if _pos.distance_to(target) > 40.0:
		snap()

	var speed := skier.speed
	var want_yaw := skier.heading
	if speed > 2.5 and skier.state != Skier.State.CRASH:
		var travel := Vector3(skier.velocity.x, 0, skier.velocity.z)
		want_yaw = lerp_angle(skier.heading, atan2(-travel.x, -travel.z), clampf((speed - 2.5) / 4.0, 0.0, 1.0))
	var in_air := skier.state == Skier.State.AIR
	_yaw = lerp_angle(_yaw, want_yaw, 1.0 - exp(-(0.8 if in_air else 2.0) * dt))

	# Manual look
	var stick := Vector2(Input.get_action_strength("cam_right") - Input.get_action_strength("cam_left"),
		Input.get_action_strength("cam_down") - Input.get_action_strength("cam_up"))
	if stick.length() > 0.1:
		var cs: float = GameState.settings.camera_sensitivity
		_look_yaw -= stick.x * 2.2 * cs * rdt
		_look_pitch = clampf(_look_pitch - stick.y * 70.0 * cs * rdt, -35.0, 40.0)
		_look_idle = 0.0
	_look_idle += rdt
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
		_look_yaw = lerp_angle(_look_yaw, 0.0, 1.0 - exp(-1.2 * rdt))
		_look_pitch = lerpf(_look_pitch, 0.0, 1.0 - exp(-1.2 * rdt))

	# Cinematic side angle on big air.
	var t := Terrain.instance
	var above := skier.global_position.y - t.get_height(skier.global_position.x, skier.global_position.z)
	var big_air := in_air and (above > 3.0 or skier.air_time > 0.9)
	if big_air and _side < 0.05:
		_side_sign = 1.0 if skier.spin_rate <= 0.0 else -1.0
	_side = lerpf(_side, 1.0 if big_air else 0.0, 1.0 - exp(-(2.2 if big_air else 6.0) * rdt))

	var s01 := clampf(speed / 26.0, 0.0, 1.0)
	var yaw_t := _yaw + _look_yaw + _orbit + _side * _side_sign * deg_to_rad(72.0)
	var back := Vector3(sin(yaw_t), 0, cos(yaw_t))
	var n := skier.ground_normal
	var rise := -back.dot(Vector3(n.x, 0, n.z)) / maxf(n.y, 0.2)
	var slope_deg := rad_to_deg(atan(maxf(rise, 0.0)))
	var want_pitch := base_pitch - s01 * 5.0 - slope_deg * 0.75 * (1.0 - _side) + _look_pitch
	want_pitch = lerpf(want_pitch, -4.0 + _look_pitch, _side)
	if orbiting:
		want_pitch = -8.0 + _look_pitch
	if lift:
		want_pitch = -9.0 + _look_pitch
	_pitch = lerpf(_pitch, want_pitch, 1.0 - exp(-2.5 * dt))
	var want_dist := base_distance + s01 * 2.0 - skier.tuck * 0.5
	want_dist = lerpf(want_dist, 7.5, _side)
	if grind:
		want_dist = 4.6
	if orbiting:
		want_dist = 6.5
	if lift:
		want_dist = 7.5
	if skier.state == Skier.State.CRASH:
		want_dist = 6.5
	var j := Juice.instance
	var punch := j.punch if j else 0.0
	_dist = lerpf(_dist, want_dist, 1.0 - exp(-1.5 * dt))
	var dist := _dist * (1.0 - punch * 0.22)

	# Arm direction; shorten if the snow is in the way.
	var pr := deg_to_rad(-_pitch)
	var dir := Vector3(back.x * cos(pr), sin(pr), back.z * cos(pr))
	var len := dist
	for i in range(1, 9):
		var tt := float(i) / 8.0 * dist
		var q := _pos + dir * tt
		if q.y < t.get_height(q.x, q.z) + 0.6:
			len = maxf(0.8, tt - dist / 8.0)
			break
	_arm = len if len < _arm else lerpf(_arm, len, 1.0 - exp(-3.0 * rdt))
	var cp := _pos + dir * _arm
	cp.y = maxf(cp.y, t.get_height(cp.x, cp.z) + 0.7)
	var aim := _pos - dir * 4.0 + Vector3(0, -0.4 + _side * 0.3, 0)
	var basis := Basis.looking_at(aim - cp, Vector3.UP)

	# Tilt into fast carves.
	var want_roll := -skier.carve * s01 * deg_to_rad(7.0) * (1.0 - _side)
	_roll = lerpf(_roll, want_roll, 1.0 - exp(-3.0 * dt))
	basis = basis * Basis(Vector3.FORWARD, _roll)

	# Trauma shake (real time, so it reads even in slow motion).
	var tr := j.trauma if j else 0.0
	if tr > 0.001:
		var k := tr * tr
		var tt2 := _real_t * 18.0
		cp += basis * Vector3(_noise.get_noise_2d(tt2, 1.0), _noise.get_noise_2d(tt2, 7.0), 0.0) * 0.35 * k
		basis = basis * Basis.from_euler(Vector3(_noise.get_noise_2d(tt2, 13.0), _noise.get_noise_2d(tt2, 21.0), _noise.get_noise_2d(tt2, 31.0)) * deg_to_rad(3.0) * k)

	var want_fov := base_fov + 16.0 * smoothstep(0.2, 1.0, s01) - _side * 6.0
	_fov = lerpf(_fov, want_fov, 1.0 - exp(-1.4 * dt))
	var fov := _fov + (j.fov_kick if j else 0.0) - punch * 9.0
	var final := Transform3D(basis, cp)

	if _intro_t < 1.0:
		var dur: float = get_meta("intro_duration", 2.8)
		_intro_t = minf(1.0, _intro_t + rdt / dur)
		var e := _intro_t * _intro_t * (3.0 - 2.0 * _intro_t)
		var p := _intro_from.origin.lerp(final.origin, e)
		p.y += sin(_intro_t * PI) * 40.0 * (1.0 - _intro_t)
		var q := Quaternion(_intro_from.basis.orthonormalized()).slerp(Quaternion(final.basis.orthonormalized()), e)
		final = Transform3D(Basis(q), p)
		fov = lerpf(_intro_fov, fov, e)
	camera.global_transform = final
	camera.fov = clampf(fov, 30.0, 110.0)


func _damp(cur: float, target: float, axis: int, smooth: float, dt: float) -> float:
	var omega := 2.0 / maxf(smooth, 0.0001)
	var x := omega * dt
	var e := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
	var change := cur - target
	var temp: float = (_vel[axis] + omega * change) * dt
	_vel[axis] = (_vel[axis] - omega * temp) * e
	return target + (change + temp) * e
