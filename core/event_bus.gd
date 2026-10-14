extends Node
## Global signal hub. Systems talk through here instead of holding references.

signal game_mode_changed(mode: int)
signal ride_started
signal ride_reset(to_top: bool)
signal settings_changed

# Skier
signal player_jumped(charge: float)
signal player_landed(impact: float, air_time: float)
signal player_crashed
signal player_respawned
signal turn_completed(quality: float)
signal air_apex(height: float)
signal perfect_landing
signal boost_started(on: bool)

# Tricks & combos
signal trick_performed(trick_name: String, points: int)
signal combo_changed(trick_count: int, multiplier: float, points: int)
signal combo_banked(points: int, multiplier: float)
signal combo_lost(points: int)
signal grind_started(kind: String)
signal grind_ended
signal near_miss(distance: float)
signal celebrate

# Scoring / UI
signal score_event(label: String, points: int)
signal popup(text: String, kind: String)
signal hint(text: String)
signal fade_request(to_black: bool, duration: float)
signal fade_finished(to_black: bool)

# World
signal lift_boarded(lift_name: String)
signal lift_arrived
signal collectible_found(kind: String, id: int)
signal challenge_started(challenge_name: String)
signal challenge_finished(challenge_name: String, medal: int)
signal lighting_changed(preset: int)

# Presentation
signal sfx(sound_name: String, volume: float, pitch: float)
signal crash_title(text: String)
signal replay_toggled(on: bool)
signal photo_mode_toggled(on: bool)
signal map_toggled(on: bool)
