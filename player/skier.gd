class_name Skier
extends Node3D
## Custom ski controller: slope gravity, carving with momentum, forgiving grip, tuck, skid-brake,
## charged jumps, slow air spins, soft auto-aligning landings, gentle crashes, and lift rides.
## Runs in _physics_process; physics interpolation smooths the rendered motion.

enum State { FROZEN, GROUNDED, AIR, CRASH, LIFT }

const SAFE_POINT_INTERVAL := 1.5

@export var tuning: SkiTuning = preload("res://player/ski_tuning.tres")

var state := State.FROZEN
var velocity := Vector3.ZERO
var heading := 0.0            ## yaw of the skis, 0 = facing -Z
var ground_normal := Vector3.UP
var speed := 0.0

# Smoothed inputs / derived values read by the rig, camera and audio.
var steer := 0.0
var brake := 0.0
var tuck := 0.0
var charge := 0.0
var carve := 0.0              ## -1..1 lean into the turn
var skid := 0.0               ## 0..1 how much the skis slide sideways
var air_time := 0.0
var spin_rate := 0.0
var crash_t := 0.0
var lift_t := 0.0             ## 0..1 progress of a lift ride
var surface := Vector4(1, 0, 0, 0)
var landing_squash := 0.0     ## 0..1 decaying after touchdown

var _orient := Basis()
var _align_timer := 0.0
var _charging := false
var _spin_total := 0.0
var _safe_points: Array = []
var _safe_timer := 0.0
var _turn_dir := 0
var _turn_angle := 0.0
var _turn_skid := 0.0
var _turn_time := 0.0
var _dist_accum := 0.0
var _crash_stage := 0
var _lift: Dictionary = {}
var _lift_d := 0.0
var _busy := false            ## fading / teleporting
var _hint_cool := 0.0
var _last_heading := 0.0


var rig: SkierRig


func _ready() -> void:
	EventBus.ride_reset.connect(_on_ride_reset)
	rig = SkierRig.new()
	rig.name = "Rig"
	add_child(rig)


# ------------------------------------------------------------------ public
func place(pos: Vector3, yaw: float) -> void:
	var t := Terrain.instance
	pos.y = t.get_height(pos.x, pos.z)
	position = pos
	heading = yaw
	velocity = Vector3.ZERO
	speed = 0.0
	ground_normal = t.get_normal(pos.x, pos.z, tuning.normal_radius)
	_orient = _ground_basis(ground_normal, heading)
	transform = Transform3D(_orient, pos)
	state = State.GROUNDED
	air_time = 0.0
	charge = 0.0
	_charging = false
	_align_timer = 0.0
	_safe_points.clear()
	_safe_points.append([pos, yaw])
	reset_physics_interpolation()


func start_riding() -> void:
	var s := Terrain.instance.get_spawn()
	place(s.position, s.heading)
	EventBus.player_respawned.emit()


func is_controllable() -> bool:
	return GameState.mode == GameState.Mode.RIDING and not _busy


func forward_dir() -> Vector3:
	return Vector3(-sin(heading), 0.0, -cos(heading))


# ------------------------------------------------------------------ loop
func _physics_process(dt: float) -> void:
	if state == State.FROZEN:
		return
	_read_input(dt)
	match state:
		State.GROUNDED:
			_ground_step(dt)
		State.AIR:
			_air_step(dt)
		State.CRASH:
			_crash_step(dt)
		State.LIFT:
			_lift_step(dt)
	if state == State.GROUNDED or state == State.AIR:
		_collide_obstacles()
		_keep_inside()
	landing_squash = maxf(0.0, landing_squash - dt * 2.5)
	_hint_cool = maxf(0.0, _hint_cool - dt)
	_apply_transform(dt)


func _read_input(dt: float) -> void:
	var s_in := 0.0
	var b_in := 0.0
	var t_in := 0.0
	if is_controllable() and state != State.LIFT:
		s_in = Input.get_action_strength("carve_right") - Input.get_action_strength("carve_left")
		b_in = Input.get_action_strength("brake")
		t_in = maxf(Input.get_action_strength("tuck"), Input.get_action_strength("speed_up"))
		if Input.is_action_just_pressed("reset"):
			_on_ride_reset(true)
	steer = lerpf(steer, s_in, 1.0 - exp(-tuning.steer_response * dt))
	brake = lerpf(brake, b_in, 1.0 - exp(-tuning.brake_response * dt))
	tuck = lerpf(tuck, t_in * (1.0 - b_in), 1.0 - exp(-tuning.tuck_response * dt))
	# Jump charge: hold to crouch, release to pop.
	if is_controllable() and state == State.GROUNDED:
		if Input.is_action_pressed("jump"):
			_charging = true
			charge = minf(1.0, charge + dt / tuning.charge_time)
		elif _charging:
			_charging = false
			_jump()
	else:
		_charging = false
	if not _charging and state != State.GROUNDED:
		charge = maxf(0.0, charge - dt * 3.0)


func _ground_step(dt: float) -> void:
	var tr := Terrain.instance
	var t := tuning
	var n := tr.get_normal(position.x, position.z, t.normal_radius)
	ground_normal = n
	surface = tr.get_surface_weights(position.x, position.z)
	var g := Vector3(0, -t.gravity, 0)
	var g_tan := g - n * g.dot(n)

	var v := velocity - n * velocity.dot(n)
	speed = v.length()
	var vel_yaw := atan2(-v.x, -v.z)

	# Steering: calmer arcs at speed.
	var rate := lerpf(t.turn_rate_slow, t.turn_rate_fast, clampf(speed / 22.0, 0.0, 1.0))
	heading -= steer * rate * dt
	if _align_timer > 0.0:
		_align_timer -= dt
		if speed > 1.0:
			heading = lerp_angle(heading, vel_yaw, 1.0 - exp(-t.land_align_rate * dt))
	elif speed > 2.0 and absf(steer) < 0.2 and absf(angle_difference(heading, vel_yaw)) < 1.6:
		heading = lerp_angle(heading, vel_yaw, (1.0 - exp(-t.auto_align * dt)) * (1.0 - absf(steer) * 5.0))
	if speed < 1.5 and absf(steer) < 0.1 and n.y < 0.995:
		var fall := Vector3(n.x, 0, n.z)
		heading = lerp_angle(heading, atan2(-fall.x, -fall.z), 1.0 - exp(-t.downhill_settle * dt))

	var fwd_flat := forward_dir()
	var fwd := (fwd_flat - n * fwd_flat.dot(n)).normalized()
	var right := fwd.cross(n).normalized()
	var v_f := v.dot(fwd)
	var v_l := v.dot(right)

	# Grip: lateral motion bleeds away; most of it is redirected along the skis (carving).
	var grip := lerpf(t.grip, t.powder_grip, surface.y) * (1.0 - brake * 0.75)
	var new_l := v_l * exp(-grip * dt)
	var redirected := (absf(v_l) - absf(new_l)) * t.carve_efficiency * (1.0 - brake)
	v_f += redirected * (1.0 if v_f >= 0.0 else -1.0)
	v_l = new_l
	v = fwd * v_f + right * v_l
	skid = lerpf(skid, clampf(absf(v_l) / maxf(speed, 2.0) * 2.0 + brake * 0.8, 0.0, 1.0), 1.0 - exp(-6.0 * dt))
	carve = lerpf(carve, clampf(steer * clampf(speed / 8.0, 0.0, 1.0), -1.0, 1.0), 1.0 - exp(-5.0 * dt))

	# Gravity along the slope.
	v += g_tan * dt

	# Pushing off when slow.
	if is_controllable() and Input.is_action_pressed("speed_up") and v.length() < t.push_max_speed:
		v += fwd * t.push_accel * dt

	# Friction, drag, braking.
	var mu := t.friction_groomed * surface.x + t.friction_powder * surface.y \
		+ t.friction_rock * surface.z + t.friction_forest * surface.w
	mu /= maxf(0.001, surface.x + surface.y + surface.z + surface.w)
	var sp := v.length()
	var decel := mu * t.gravity * n.y
	decel += lerpf(t.drag_upright, t.drag_tuck, tuck) * sp * sp
	decel += t.soft_cap_drag * pow(maxf(0.0, sp - t.soft_cap_speed), 2.0)
	decel += brake * t.brake_decel
	if sp > 0.0001:
		v = v * (maxf(0.0, sp - decel * dt) / sp)

	# Hold still on gentle slopes or when braking to a stop.
	var slope := 1.0 - n.y
	if v.length() < 0.35 and (slope < t.hold_still_slope or brake > 0.6):
		if not (is_controllable() and Input.is_action_pressed("speed_up")):
			v = Vector3.ZERO

	velocity = v
	speed = v.length()
	var new_pos := position + v * dt
	var gh := tr.get_height(new_pos.x, new_pos.z)
	if new_pos.y - gh > t.takeoff_gap and speed > 4.0:
		# The ground fell away: we fly.
		position = new_pos
		_enter_air()
	else:
		new_pos.y = gh
		var n2 := tr.get_normal(new_pos.x, new_pos.z, t.normal_radius)
		var into := velocity.dot(n2)
		if into < 0.0:
			var mag := velocity.length()
			velocity = (velocity - n2 * into).normalized() * mag * 0.995
		position = new_pos

	_track_turns(dt)
	_track_progress(dt)
	_check_lift()


func _jump() -> void:
	if state != State.GROUNDED:
		return
	var pop := lerpf(tuning.jump_min, tuning.jump_max, charge)
	velocity += ground_normal * pop
	position += ground_normal * 0.06
	EventBus.player_jumped.emit(charge)
	charge = 0.0
	_enter_air()


func _enter_air() -> void:
	state = State.AIR
	air_time = 0.0
	_spin_total = 0.0
	spin_rate = 0.0


func _air_step(dt: float) -> void:
	var t := tuning
	velocity.y -= t.gravity * dt
	velocity -= velocity * t.air_drag * velocity.length() * dt * 0.1
	var target_spin := -steer * t.spin_rate_max if is_controllable() else 0.0
	spin_rate = lerpf(spin_rate, target_spin, 1.0 - exp(-t.spin_response * dt))
	heading += spin_rate * dt
	_spin_total += spin_rate * dt
	carve = lerpf(carve, 0.0, 1.0 - exp(-3.0 * dt))
	skid = lerpf(skid, 0.0, 1.0 - exp(-4.0 * dt))
	air_time += dt
	speed = velocity.length()
	position += velocity * dt
	var tr := Terrain.instance
	var gh := tr.get_height(position.x, position.z)
	if position.y <= gh:
		position.y = gh
		_land()


func _land() -> void:
	var t := tuning
	var tr := Terrain.instance
	var n := tr.get_normal(position.x, position.z, t.normal_radius)
	ground_normal = n
	var vn := velocity.dot(n)
	var impact := maxf(0.0, -vn)
	velocity -= n * vn
	var flat := Vector3(velocity.x, 0, velocity.z)
	var vel_yaw := atan2(-flat.x, -flat.z)
	var diff := absf(angle_difference(heading, vel_yaw))
	var sp := velocity.length()
	var spins := int(round(absf(_spin_total) / TAU))
	if impact > t.crash_impact or (diff > deg_to_rad(t.crash_angle) and diff < PI - 0.35 and sp > t.crash_angle_min_speed):
		_crash()
		return
	if diff > PI - 0.35:
		# Landed backwards: quietly swing around — no punishment, just a gentle pivot.
		heading = vel_yaw + (PI if heading - vel_yaw > 0 else -PI)
	velocity *= lerpf(1.0, 0.82, clampf(diff / PI, 0.0, 1.0))
	state = State.GROUNDED
	_align_timer = 0.45
	landing_squash = clampf(impact / 8.0, 0.25, 1.0)
	EventBus.player_landed.emit(impact, air_time)
	if air_time > 0.8:
		var pts := int(air_time * 60.0) + spins * 120
		var label := "Air %.1fs" % air_time
		if spins > 0:
			label = "%d° spin" % (spins * 360) if spins > 1 else "360"
			label += " · %.1fs air" % air_time
		GameState.air_time_total += air_time
		EventBus.score_event.emit(label, pts)
	air_time = 0.0


func _crash() -> void:
	state = State.CRASH
	crash_t = 0.0
	_crash_stage = 0
	EventBus.player_crashed.emit()


func _crash_step(dt: float) -> void:
	crash_t += dt
	velocity *= exp(-2.2 * dt)
	var tr := Terrain.instance
	var n := tr.get_normal(position.x, position.z, 2.0)
	velocity -= n * velocity.dot(n)
	position += velocity * dt
	position.y = tr.get_height(position.x, position.z)
	speed = velocity.length()
	carve = lerpf(carve, 0.0, 1.0 - exp(-3.0 * dt))
	if _crash_stage == 0 and crash_t > tuning.tumble_time:
		_crash_stage = 1
		_fade_then(_respawn_safe)


func _respawn_safe() -> void:
	var p: Array = _safe_points[maxi(0, _safe_points.size() - 3)] if _safe_points.size() > 0 else []
	if p.is_empty():
		var s := Terrain.instance.get_spawn()
		p = [s.position, s.heading]
	var keep := _safe_points.duplicate()
	place(p[0], p[1])
	_safe_points = keep.slice(0, maxi(1, keep.size() - 2))
	EventBus.player_respawned.emit()


func _on_ride_reset(_to_top: bool) -> void:
	if _busy or state == State.FROZEN:
		return
	_fade_then(start_riding)


func _fade_then(action: Callable) -> void:
	_busy = true
	EventBus.fade_request.emit(true, tuning.fade_time)
	await get_tree().create_timer(tuning.fade_time + 0.1).timeout
	action.call()
	await get_tree().create_timer(0.15).timeout
	EventBus.fade_request.emit(false, tuning.fade_time * 1.4)
	_busy = false


# ------------------------------------------------------------------ obstacles & bounds
func _collide_obstacles() -> void:
	if Scatter.instance == null:
		return
	var o = Scatter.instance.find_obstacle(position, 0.35)
	if o == null:
		return
	var c := Vector3(o.x, position.y, o.y)
	var away := position - c
	away.y = 0.0
	if away.length_squared() < 0.0001:
		away = -forward_dir()
	away = away.normalized()
	var into := -velocity.dot(away)
	if into > tuning.tree_crash_speed and state == State.GROUNDED:
		velocity += away * into * 0.6
		_crash()
		return
	if into > 0.0:
		velocity += away * into * 1.1
	var target: Vector3 = c + away * (o.z + 0.36)
	position.x = target.x
	position.z = target.z


func _keep_inside() -> void:
	var tr := Terrain.instance
	var lim := tr.half - 40.0
	if absf(position.x) > lim or absf(position.z) > lim:
		var push := Vector3(-signf(position.x) * float(absf(position.x) > lim), 0, -signf(position.z) * float(absf(position.z) > lim))
		var out := -velocity.dot(push)
		if out < 0.0:
			velocity += push * (-out)
		position.x = clampf(position.x, -lim, lim)
		position.z = clampf(position.z, -lim, lim)
		if _hint_cool <= 0.0:
			EventBus.hint.emit("The valley ends here — turn back toward the lifts")
			_hint_cool = 6.0


# ------------------------------------------------------------------ scoring
func _track_turns(dt: float) -> void:
	var dh := angle_difference(_last_heading, heading)
	_last_heading = heading
	if speed < 6.0:
		_turn_dir = 0
		_turn_angle = 0.0
		return
	var dir := 0
	if dh > 0.0008:
		dir = 1
	elif dh < -0.0008:
		dir = -1
	if dir != 0 and dir != _turn_dir:
		if _turn_dir != 0 and _turn_angle > 0.45 and _turn_time > 0.6:
			var avg_skid := _turn_skid / maxf(_turn_time, 0.01)
			var quality := clampf(1.0 - avg_skid * 2.2, 0.0, 1.0)
			if quality > 0.45:
				GameState.smooth_turns += 1
				EventBus.turn_completed.emit(quality)
				EventBus.score_event.emit("Smooth turn" if quality < 0.8 else "Silky turn", int(10 + 30 * quality))
		_turn_dir = dir
		_turn_angle = 0.0
		_turn_skid = 0.0
		_turn_time = 0.0
	_turn_angle += absf(dh)
	_turn_skid += skid * dt
	_turn_time += dt


func _track_progress(dt: float) -> void:
	if not is_controllable():
		return
	var d := speed * dt
	GameState.distance_m += d
	_dist_accum += d
	if _dist_accum >= 250.0:
		_dist_accum -= 250.0
		EventBus.score_event.emit("%d m" % int(GameState.distance_m), 25)
	_safe_timer += dt
	if _safe_timer > SAFE_POINT_INTERVAL and speed > 1.5 and skid < 0.5:
		_safe_timer = 0.0
		_safe_points.append([position, atan2(-velocity.x, -velocity.z)])
		if _safe_points.size() > 12:
			_safe_points.pop_front()


# ------------------------------------------------------------------ lifts
func _check_lift() -> void:
	if Lifts.instance == null or not is_controllable():
		return
	var lift := Lifts.instance.find_boardable(position)
	if lift.is_empty():
		var near := Lifts.instance.nearest_base(position)
		if not near.is_empty() and position.distance_to(near.bottom) < 90.0 and _hint_cool <= 0.0:
			EventBus.hint.emit("Glide slowly into the %s to ride up" % near.name)
			_hint_cool = 12.0
		return
	if speed < tuning.lift_board_speed:
		_board(lift)


func _board(lift: Dictionary) -> void:
	_lift = lift
	_lift_d = 0.0
	lift_t = 0.0
	EventBus.lift_boarded.emit(lift.name)
	_fade_then(_seat_on_lift)


func _seat_on_lift() -> void:
	state = State.LIFT
	GameState.mode = GameState.Mode.LIFT
	velocity = Vector3.ZERO
	speed = 0.0
	var xf: Transform3D = Lifts.instance.seat_transform(_lift, 0.0)
	transform = xf
	_orient = xf.basis
	heading = xf.basis.get_euler().y
	reset_physics_interpolation()


func _lift_step(dt: float) -> void:
	if _busy:
		return
	var length := Lifts.instance.ride_length(_lift)
	var ride_speed := maxf(float(_lift.speed), length / tuning.lift_ride_seconds)
	if Input.is_action_pressed("speed_up"):
		ride_speed *= 3.0
	_lift_d += ride_speed * dt
	lift_t = _lift_d / length
	var xf: Transform3D = Lifts.instance.seat_transform(_lift, _lift_d)
	position = xf.origin
	_orient = _orient.slerp(xf.basis, 1.0 - exp(-4.0 * dt))
	speed = ride_speed
	velocity = -xf.basis.z * ride_speed
	if _lift_d >= length - 1.0:
		_busy = true
		_fade_then(_dismount)


func _dismount() -> void:
	var top: Vector3 = _lift.top
	var bottom: Vector3 = _lift.bottom
	var away := Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalized()
	var pos := top + away * 14.0
	var n := Terrain.instance.get_normal(pos.x, pos.z, 6.0)
	var fall := Vector3(n.x, 0, n.z)
	var yaw := atan2(-fall.x, -fall.z) if fall.length() > 0.02 else atan2(-away.x, -away.z)
	GameState.mode = GameState.Mode.RIDING
	place(pos, yaw)
	EventBus.lift_arrived.emit()


# ------------------------------------------------------------------ visuals
func _ground_basis(n: Vector3, yaw: float) -> Basis:
	var f := Vector3(-sin(yaw), 0.0, -cos(yaw))
	f = (f - n * f.dot(n)).normalized()
	var r := f.cross(n).normalized()
	return Basis(r, n, -f).orthonormalized()


func _apply_transform(dt: float) -> void:
	if state == State.LIFT:
		transform = Transform3D(_orient, position)
		return
	var n := ground_normal if state != State.AIR else Vector3.UP.lerp(ground_normal, 0.3).normalized()
	var target := _ground_basis(n, heading)
	_orient = _orient.slerp(target, 1.0 - exp(-tuning.orient_response * dt)).orthonormalized()
	transform = Transform3D(_orient, position)
