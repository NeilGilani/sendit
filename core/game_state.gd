extends Node
## Global game state: mode, settings (persisted), and the relaxed score.

enum Mode { MENU, RIDING, PAUSED, LIFT, CREDITS }
enum Quality { LOW, MEDIUM, HIGH }

const SETTINGS_PATH := "user://settings.cfg"

var mode: int = Mode.MENU:
	set(v):
		if mode == v:
			return
		mode = v
		EventBus.game_mode_changed.emit(v)

var settings := {
	"quality": Quality.MEDIUM,
	"master_volume": 0.8,
	"music_volume": 0.6,
	"sfx_volume": 0.8,
	"mouse_sensitivity": 1.0,
	"camera_sensitivity": 1.0,
	"snowfall": false,
	"fullscreen": false,
}

# Relaxed scoring — accumulates quietly.
var score := 0
var distance_m := 0.0
var air_time_total := 0.0
var smooth_turns := 0
var best_score := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_settings()
	EventBus.score_event.connect(_on_score_event)


func _on_score_event(_label: String, points: int) -> void:
	score += points
	best_score = maxi(best_score, score)


func reset_score() -> void:
	score = 0
	distance_m = 0.0
	air_time_total = 0.0
	smooth_turns = 0


func set_setting(key: String, value) -> void:
	settings[key] = value
	apply_settings()
	save_settings()
	EventBus.settings_changed.emit()


func apply_settings() -> void:
	_set_bus_volume("Master", settings.master_volume)
	_set_bus_volume("Music", settings.music_volume)
	_set_bus_volume("SFX", settings.sfx_volume)
	var win_mode := DisplayServer.WINDOW_MODE_FULLSCREEN if settings.fullscreen else DisplayServer.WINDOW_MODE_WINDOWED
	if DisplayServer.get_name() != "headless" and DisplayServer.window_get_mode() != win_mode:
		DisplayServer.window_set_mode(win_mode)


func _set_bus_volume(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx >= 0:
		AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(linear, 0.0001)))
		AudioServer.set_bus_mute(idx, linear <= 0.001)


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		for k in settings.keys():
			settings[k] = cfg.get_value("settings", k, settings[k])
		best_score = cfg.get_value("stats", "best_score", 0)


func save_settings() -> void:
	var cfg := ConfigFile.new()
	for k in settings.keys():
		cfg.set_value("settings", k, settings[k])
	cfg.set_value("stats", "best_score", best_score)
	cfg.save(SETTINGS_PATH)


func is_riding() -> bool:
	return mode == Mode.RIDING or mode == Mode.LIFT
