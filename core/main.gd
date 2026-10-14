extends Node3D
## Root of the game: builds the world (terrain, scatter, lifts, atmosphere), the skier with trails
## and spray, the camera, the soundscape and the UI, and runs the menu -> ride -> pause flow.
## Command-line extras (after `--`): `--autotest` scripted ride with diagnostics,
## `--shot=<file.png>` saves a frame after warm-up.

var terrain: Terrain
var scatter: Scatter
var lifts: Lifts
var skier: Skier
var atmosphere: Atmosphere
var camera_rig: ChaseCamera
var sound: SoundScape
var ui: UIRoot
var _autotest := false
var _t := 0.0
var _busy := false


func _ready() -> void:
	GameState.apply_settings()
	terrain = _add(Terrain.new(), "Terrain")
	scatter = _add(Scatter.new(), "Scatter")
	lifts = _add(Lifts.new(), "Lifts")
	atmosphere = _add(Atmosphere.new(), "Atmosphere")
	skier = _add(Skier.new(), "Skier")
	var trails: SkiTrails = SkiTrails.new()
	trails.skier = skier
	_add(trails, "SkiTrails")
	var spray: PowderSpray = PowderSpray.new()
	spray.skier = skier
	_add(spray, "PowderSpray")
	camera_rig = ChaseCamera.new()
	camera_rig.skier = skier
	_add(camera_rig, "ChaseCamera")
	sound = SoundScape.new()
	sound.skier = skier
	_add(sound, "SoundScape")
	ui = UIRoot.new()
	ui.skier = skier
	_add(ui, "UI")
	ui.ride_pressed.connect(start_ride)
	ui.menu_pressed.connect(to_menu)

	var s := terrain.get_spawn()
	skier.place(s.position, s.heading)
	skier.state = Skier.State.FROZEN
	_autotest = "--autotest" in OS.get_cmdline_user_args()
	if _autotest:
		GameState.mode = GameState.Mode.RIDING
		skier.start_riding()
	else:
		GameState.mode = GameState.Mode.MENU
		ui._on_mode(GameState.mode)


func _add(n: Node, node_name: String) -> Node:
	n.name = node_name
	add_child(n)
	return n


func start_ride() -> void:
	if _busy:
		return
	_busy = true
	EventBus.fade_request.emit(true, 0.9)
	await get_tree().create_timer(1.0).timeout
	GameState.reset_score()
	GameState.mode = GameState.Mode.RIDING
	skier.start_riding()
	camera_rig.snap()
	EventBus.ride_started.emit()
	await get_tree().create_timer(0.2).timeout
	EventBus.fade_request.emit(false, 1.6)
	_busy = false


func to_menu() -> void:
	if _busy:
		return
	_busy = true
	get_tree().paused = false
	EventBus.fade_request.emit(true, 0.9)
	await get_tree().create_timer(1.0).timeout
	GameState.save_settings()
	skier.state = Skier.State.FROZEN
	GameState.mode = GameState.Mode.MENU
	EventBus.fade_request.emit(false, 1.6)
	_busy = false


func _exit_tree() -> void:
	# Release static resource caches so the engine shuts down cleanly.
	SnowMaterials._cache.clear()
	TerrainMaterials._macro = null
	TerrainMaterials._wind = null
	SoftSprite._tex = null


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		GameState.save_settings()


func _process(delta: float) -> void:
	if _autotest:
		_run_autotest(delta)
	if "--charcam" in OS.get_cmdline_user_args():
		camera_rig.set_process(false)
		var p := skier.get_global_transform_interpolated().origin
		var f := skier.forward_dir()
		var side := Vector3(-f.z, 0, f.x)
		camera_rig.global_position = p + f * 2.6 + side * 2.2 + Vector3(0, 1.1, 0)
		camera_rig.yaw_pivot.rotation = Vector3.ZERO
		camera_rig.pitch_pivot.rotation = Vector3.ZERO
		camera_rig.arm.spring_length = 0.0
		camera_rig.yaw_pivot.look_at(p + Vector3(0, 0.9, 0))
		camera_rig.camera.fov = 50.0
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			if Engine.get_process_frames() > 40 and not has_meta("shot_done"):
				set_meta("shot_done", true)
				get_viewport().get_texture().get_image().save_png(a.substr(7))
				print("saved ", a.substr(7))


func _run_autotest(delta: float) -> void:
	_t += delta
	var phase := int(_t / 2.0) % 4
	Input.action_release("carve_left")
	Input.action_release("carve_right")
	if _t > 4.0:
		if phase == 1:
			Input.action_press("carve_left")
		elif phase == 3:
			Input.action_press("carve_right")
		if fmod(_t, 7.0) < 0.6:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
	if int(_t * 2.0) != int((_t - delta) * 2.0):
		print("t=%.1f state=%d speed=%.1f pos=%s air=%.2f skid=%.2f score=%d arm=%.2f/%.2f cam_dy=%.2f" % [_t, skier.state, skier.speed, skier.position.snapped(Vector3.ONE * 0.1), skier.air_time, skier.skid, GameState.score, camera_rig.arm.get_hit_length(), camera_rig.arm.spring_length, camera_rig.camera.global_position.y - skier.position.y])
