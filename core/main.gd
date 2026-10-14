extends Node3D
## Root of the game. Later phases add terrain, player, camera, rendering, audio and UI.

func _ready() -> void:
	GameState.apply_settings()
	print("SENDIT booted")
