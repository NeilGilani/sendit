class_name Sfx
extends Node
## One-shot sound effects on the SFX bus, triggered by EventBus.sfx(name, volume, pitch).
## A small voice pool keeps overlapping hits from cutting each other off.

const VOICES := 12

var _players: Array[AudioStreamPlayer] = []
var _cache := {}
var _next := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_players.append(p)
	EventBus.sfx.connect(play)


func _exit_tree() -> void:
	for p in _players:
		p.stop()
		p.stream = null
	_cache.clear()


func play(sound_name: String, volume := 1.0, pitch := 1.0) -> void:
	var stream: AudioStream = _cache.get(sound_name)
	if stream == null:
		var path := "res://assets/audio/%s.ogg" % sound_name
		if not ResourceLoader.exists(path):
			return
		stream = load(path)
		_cache[sound_name] = stream
	var p := _players[_next]
	_next = (_next + 1) % VOICES
	p.stream = stream
	p.volume_db = linear_to_db(clampf(volume, 0.0001, 2.0))
	p.pitch_scale = pitch
	p.play()
