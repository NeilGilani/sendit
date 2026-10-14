extends Node
## Global signal hub. Systems talk through here instead of holding references.

signal game_mode_changed(mode: int)
signal ride_started
signal ride_reset(to_top: bool)
signal settings_changed

signal player_jumped(charge: float)
signal player_landed(impact: float, air_time: float)
signal player_crashed
signal player_respawned
signal turn_completed(quality: float)
signal score_event(label: String, points: int)

signal lift_boarded(lift_name: String)
signal lift_arrived

signal fade_request(to_black: bool, duration: float)
signal fade_finished(to_black: bool)
signal hint(text: String)
