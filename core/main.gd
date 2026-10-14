extends Node3D
## Root of the game: builds the world (terrain, scatter, lifts) and later the player, camera, audio and UI.

var terrain: Terrain
var scatter: Scatter
var lifts: Lifts


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
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-20, 120, 0)
	sun.shadow_enabled = true
	add_child(sun)
	var cam := Camera3D.new()
	var s := terrain.get_spawn()
	cam.position = s.position + Vector3(0, 30, 60)
	cam.far = 30000.0
	add_child(cam)
	cam.look_at(s.position)
	print("SENDIT world: %d lifts, spawn %s" % [lifts.lifts.size(), s.position])
