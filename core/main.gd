extends Node3D
## Root of the game: builds the world and every system, and runs the menu -> ride -> pause flow.
## Command-line extras (after `--`): `--autotest` scripted ride with diagnostics,
## `--shot=<file.png>` saves a frame after warm-up, `--charcam` side view of the skier.

var terrain: Terrain
var scatter: Scatter
var lifts: Lifts
var skier: Skier
var atmosphere: Atmosphere
var camera_rig: ChaseCamera
var sound: SoundScape
var ui: UIRoot
var juice: Juice
var screen_fx: ScreenFX
var _autotest := false
var _t := 0.0
var _busy := false


func _ready() -> void:
	GameState.apply_settings()
	juice = _add(Juice.new(), "Juice")
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
	_add(Sfx.new(), "Sfx")
	screen_fx = ScreenFX.new()
	screen_fx.skier = skier
	_add(screen_fx, "ScreenFX")
	_add(Popups.new(), "Popups")
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


## Seamless: the camera swoops from the flyover down to the skier while the title fades.
func start_ride() -> void:
	if _busy:
		return
	_busy = true
	GameState.reset_score()
	skier.start_riding()
	GameState.mode = GameState.Mode.RIDING
	camera_rig.start_intro_drop(2.8)
	EventBus.ride_started.emit()
	EventBus.sfx.emit("whoosh_slow", 0.6, 1.2)
	await get_tree().create_timer(1.0).timeout
	_busy = false


func to_menu() -> void:
	if _busy:
		return
	_busy = true
	get_tree().paused = false
	Juice.normal_time(20.0)
	EventBus.fade_request.emit(true, 0.9)
	await get_tree().create_timer(1.0, true, false, true).timeout
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
	var args := OS.get_cmdline_user_args()
	if "--charcam" in args:
		camera_rig.external = true
		var p := skier.get_global_transform_interpolated().origin
		var f := skier.forward_dir()
		var side := Vector3(-f.z, 0, f.x)
		var cp := p + f * 2.6 + side * 2.2 + Vector3(0, 1.1, 0)
		camera_rig.camera.global_transform = Transform3D(Basis.looking_at(p + Vector3(0, 0.9, 0) - cp, Vector3.UP), cp)
		camera_rig.camera.fov = 50.0
	for a in args:
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
		print("t=%.1f state=%d speed=%.1f pos=%s air=%.2f skid=%.2f score=%d ts=%.2f" % [_t, skier.state, skier.speed,
			skier.position.snapped(Vector3.ONE * 0.1), skier.air_time, skier.skid, GameState.score, Engine.time_scale])
