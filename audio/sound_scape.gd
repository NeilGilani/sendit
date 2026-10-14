class_name SoundScape
extends Node
## Layered, soft soundscape: powder hiss / groomed swish / edge carve blended by surface, speed and
## turning; ambient and speed wind; soft landing thumps; distant birds; and calm music that loops
## seamlessly and breathes in and out. Everything eases — nothing pops or blares.

const A := "res://assets/audio/"

var skier: Skier
var _powder: AudioStreamPlayer
var _groomed: AudioStreamPlayer
var _carve: AudioStreamPlayer
var _wind_speed: AudioStreamPlayer
var _wind: AudioStreamPlayer
var _music: AudioStreamPlayer
var _land: AudioStreamPlayer
var _bird: AudioStreamPlayer3D
var _birds: Array[AudioStream] = []
var _gains := {}
var _bird_timer := 6.0
var _music_gain := 0.0
var _music_target := 1.0
var _music_rest := 0.0
var _music_pos_last := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_powder = _loop("snow_powder.ogg", "SFX")
	_groomed = _loop("snow_groomed.ogg", "SFX")
	_carve = _loop("snow_carve.ogg", "SFX")
	_wind_speed = _loop("wind_speed.ogg", "SFX")
	_wind = _loop("wind_ambient.ogg", "SFX")
	_music = _loop("music_golden_hour.ogg", "Music")
	_land = AudioStreamPlayer.new()
	_land.stream = load(A + "land_soft.ogg")
	_land.bus = "SFX"
	add_child(_land)
	for i in 4:
		_birds.append(load(A + "bird_%d.ogg" % (i + 1)))
	_bird = AudioStreamPlayer3D.new()
	_bird.bus = "SFX"
	_bird.unit_size = 25.0
	_bird.max_distance = 400.0
	_bird.attenuation_filter_cutoff_hz = 6000.0
	_bird.volume_db = -10.0
	add_child(_bird)
	for p in [_powder, _groomed, _carve, _wind_speed, _wind, _music]:
		_gains[p] = 0.0
		p.volume_db = -80.0
		p.play(randf() * 4.0 if p != _music else 0.0)
	EventBus.player_landed.connect(_on_landed)
	EventBus.player_crashed.connect(func(): _thump(0.55, 0.8))


func _exit_tree() -> void:
	for p in [_powder, _groomed, _carve, _wind_speed, _wind, _music, _land, _bird]:
		if p:
			p.stop()
			p.stream = null


func _loop(file: String, bus: String) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	var s: AudioStream = load(A + file)
	if s is AudioStreamOggVorbis:
		(s as AudioStreamOggVorbis).loop = true
	p.stream = s
	p.bus = bus
	add_child(p)
	return p


func _process(dt: float) -> void:
	var mode := GameState.mode
	var paused := mode == GameState.Mode.PAUSED
	var menu := mode == GameState.Mode.MENU or mode == GameState.Mode.CREDITS
	var speed := 0.0
	var grounded := false
	var surf := Vector4(0, 1, 0, 0)
	var turn := 0.0
	var air := false
	if skier and not menu:
		speed = skier.speed
		grounded = skier.state == Skier.State.GROUNDED or skier.state == Skier.State.CRASH
		surf = skier.surface
		turn = clampf(absf(skier.carve) * 0.7 + skier.skid * 0.6, 0.0, 1.0)
		air = skier.state == Skier.State.AIR
		if skier.state == Skier.State.LIFT:
			speed = 0.0
	var s01 := clampf(speed / 20.0, 0.0, 1.0)
	var moving := smoothstep(0.4, 5.0, speed)
	var on_snow := 1.0 if grounded and not paused else 0.0
	var snow_level := moving * (0.3 + 0.7 * s01) * on_snow
	var soft := surf.y + surf.w * 0.8
	var hard := surf.x + surf.z * 0.5
	var norm := maxf(soft + hard, 0.001)
	_blend(_powder, snow_level * soft / norm * 0.85, dt, 5.0)
	_blend(_groomed, snow_level * hard / norm * 0.75, dt, 5.0)
	_blend(_carve, on_snow * moving * turn * (0.25 + 0.75 * s01) * 0.7, dt, 4.0)
	var wind_spd := pow(s01, 1.4) * (0.75 if not air else 0.95)
	_blend(_wind_speed, 0.0 if paused else wind_spd, dt, 2.5)
	_blend(_wind, 0.32 if not paused else 0.18, dt, 0.8)
	_powder.pitch_scale = lerpf(_powder.pitch_scale, 0.92 + 0.2 * s01, 1.0 - exp(-3.0 * dt))
	_groomed.pitch_scale = lerpf(_groomed.pitch_scale, 0.9 + 0.25 * s01, 1.0 - exp(-3.0 * dt))
	_wind_speed.pitch_scale = lerpf(_wind_speed.pitch_scale, 0.85 + 0.35 * s01, 1.0 - exp(-2.0 * dt))
	_update_music(dt, paused)
	if not menu and not paused:
		_update_birds(dt)


func _blend(p: AudioStreamPlayer, target: float, dt: float, rate: float) -> void:
	var g: float = _gains[p]
	g = lerpf(g, target, 1.0 - exp(-rate * dt))
	_gains[p] = g
	p.volume_db = linear_to_db(maxf(g, 0.0001))


## Music fades in, plays its seamless loop, and now and then breathes out into a quiet rest.
func _update_music(dt: float, paused: bool) -> void:
	var pos := _music.get_playback_position()
	if pos < _music_pos_last - 1.0:
		# Loop wrapped: sometimes take a pause.
		if randf() < 0.35:
			_music_rest = randf_range(25.0, 50.0)
	_music_pos_last = pos
	if _music_rest > 0.0:
		_music_rest -= dt
		_music_target = 0.0
	else:
		_music_target = 0.5 if paused else 0.85
	var rate := 0.25 if _music_target > _music_gain else 0.18
	_music_gain = move_toward(_music_gain, _music_target, rate * dt)
	_gains[_music] = _music_gain
	_music.volume_db = linear_to_db(maxf(ease(_music_gain, 0.6), 0.0001))


func _update_birds(dt: float) -> void:
	_bird_timer -= dt
	if _bird_timer > 0.0 or skier == null:
		return
	var alt := skier.global_position.y
	# Birds stay near the trees and lower slopes.
	var chance := 1.0 if alt < 2600.0 else 0.45
	_bird_timer = randf_range(7.0, 22.0) / chance
	var ang := randf() * TAU
	var off := Vector3(cos(ang), 0, sin(ang)) * randf_range(40.0, 140.0)
	var p := skier.global_position + off
	p.y = Terrain.instance.get_height(p.x, p.z) + randf_range(4.0, 25.0)
	_bird.global_position = p
	_bird.stream = _birds[randi() % _birds.size()]
	_bird.pitch_scale = randf_range(0.92, 1.08)
	_bird.play()


func _on_landed(impact: float, _air: float) -> void:
	if impact > 0.8:
		_thump(clampf(impact / 10.0, 0.15, 0.7), randf_range(0.9, 1.1))


func _thump(gain: float, pitch: float) -> void:
	_land.volume_db = linear_to_db(gain)
	_land.pitch_scale = pitch
	_land.play()
