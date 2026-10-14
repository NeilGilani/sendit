extends Node3D
## Root of the game: builds the world (terrain, scatter, lifts), the skier, and later camera, audio and UI.
## Pass `-- --autotest` on the command line for a scripted headless ride that prints diagnostics.

var terrain: Terrain
var scatter: Scatter
var lifts: Lifts
var skier: Skier
var _autotest := false
var _t := 0.0


func _ready() -> void:
	GameState.apply_settings()
	terrain = Terrain.new()
	terrain.name = "Terrain"
	add_child(terrain)
	scatter = Scatter.new()
	scatter.name = "Scatter"
	add_child(scatter)
	lifts = Lifts.new()
	lifts.name = "Lifts"
	add_child(lifts)
	skier = Skier.new()
	skier.name = "Skier"
	add_child(skier)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-20, 120, 0)
	sun.shadow_enabled = true
	add_child(sun)
	var cam := Camera3D.new()
	cam.far = 30000.0
	add_child(cam)
	_autotest = "--autotest" in OS.get_cmdline_user_args()
	GameState.mode = GameState.Mode.RIDING
	skier.start_riding()


func _process(delta: float) -> void:
	var cam := get_viewport().get_camera_3d()
	if cam and skier:
		var p := skier.get_global_transform_interpolated().origin
		cam.global_position = p + skier.forward_dir() * -7.0 + Vector3(0, 3, 0)
		cam.look_at(p + Vector3(0, 1, 0))
	if _autotest:
		_run_autotest(delta)


func _run_autotest(delta: float) -> void:
	_t += delta
	var phase := int(_t / 2.0) % 4
	Input.action_release("carve_left")
	Input.action_release("carve_right")
	if phase == 1:
		Input.action_press("carve_left")
	elif phase == 3:
		Input.action_press("carve_right")
	if fmod(_t, 7.0) < 0.6:
		Input.action_press("jump")
	else:
		Input.action_release("jump")
	if int(_t * 2.0) != int((_t - delta) * 2.0):
		print("t=%.1f state=%d speed=%.1f pos=%s air=%.2f skid=%.2f score=%d" % [_t, skier.state, skier.speed, skier.position.snapped(Vector3.ONE * 0.1), skier.air_time, skier.skid, GameState.score])
