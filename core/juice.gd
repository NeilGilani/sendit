class_name Juice
extends Node
## Game-feel director: eased slow-motion, hit-stop, camera trauma, FOV kicks and punch-ins.
## Everything runs on real (unscaled) time so effects stay crisp while the world slows down.

static var instance: Juice

var trauma := 0.0          ## 0..1, camera shake = trauma²
var fov_kick := 0.0        ## degrees, decays
var punch := 0.0           ## 0..1 zoom punch-in, decays
var flash := 0.0           ## 0..1 white flash, decays
var chroma := 0.0          ## 0..1 chromatic aberration, decays toward chroma_hold
var chroma_hold := 0.0
var slowmo_active := false

var _scale := 1.0
var _target := 1.0
var _ease_in := 3.0
var _ease_out := 6.0
var _hitstop_until := 0
var _last_us := 0
var _locked := false       ## paused / photo mode: leave time_scale alone


func _init() -> void:
	instance = self


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_last_us = Time.get_ticks_usec()
	EventBus.air_apex.connect(_on_apex)
	EventBus.player_landed.connect(_on_landed)
	EventBus.perfect_landing.connect(_on_perfect)
	EventBus.player_crashed.connect(_on_crash)
	EventBus.boost_started.connect(_on_boost)


func _exit_tree() -> void:
	Engine.time_scale = 1.0
	if instance == self:
		instance = null


# ------------------------------------------------------------------ static API
static func slowmo(scale: float, ease_in := 3.0) -> void:
	if instance:
		instance._target = scale
		instance._ease_in = ease_in
		instance.slowmo_active = scale < 0.99


static func normal_time(ease_out := 6.0) -> void:
	if instance:
		instance._target = 1.0
		instance._ease_out = ease_out
		instance.slowmo_active = false


static func hitstop(seconds := 0.05) -> void:
	if instance:
		instance._hitstop_until = Time.get_ticks_msec() + int(seconds * 1000.0)


static func shake(amount: float) -> void:
	if instance:
		instance.trauma = clampf(instance.trauma + amount, 0.0, 1.0)


static func kick_fov(deg: float) -> void:
	if instance:
		instance.fov_kick = maxf(instance.fov_kick, deg)


static func punch_in(amount: float) -> void:
	if instance:
		instance.punch = maxf(instance.punch, amount)


static func flash_screen(amount: float) -> void:
	if instance:
		instance.flash = maxf(instance.flash, amount)


static func time_scale() -> float:
	return Engine.time_scale


static func lock(locked: bool) -> void:
	if instance:
		instance._locked = locked
		if not locked:
			instance._scale = Engine.time_scale


# ------------------------------------------------------------------ loop
func _process(_dt: float) -> void:
	var now := Time.get_ticks_usec()
	var rdt := clampf((now - _last_us) / 1000000.0, 0.0, 0.1)
	_last_us = now
	trauma = maxf(0.0, trauma - rdt * 1.1)
	fov_kick = move_toward(fov_kick, 0.0, rdt * 18.0)
	punch = move_toward(punch, 0.0, rdt * 2.8)
	flash = move_toward(flash, 0.0, rdt * 3.0)
	chroma = lerpf(chroma, chroma_hold, 1.0 - exp(-4.0 * rdt))
	if _locked or get_tree().paused:
		return
	var rate := _ease_in if _target < _scale else _ease_out
	_scale = lerpf(_scale, _target, 1.0 - exp(-rate * rdt))
	if absf(_scale - _target) < 0.004:
		_scale = _target
	var s := _scale
	if Time.get_ticks_msec() < _hitstop_until:
		s = 0.03
	Engine.time_scale = s
	AudioServer.playback_speed_scale = lerpf(1.0, s, 0.55) if s < 0.99 else 1.0


# ------------------------------------------------------------------ reactions
func _on_apex(height: float) -> void:
	if height > 3.5 and GameState.mode == GameState.Mode.RIDING:
		slowmo(0.4, 2.5)
		EventBus.sfx.emit("whoosh_slow", 0.7, 1.0)


func _on_landed(impact: float, air: float) -> void:
	if slowmo_active:
		normal_time(7.0)
	if impact > 6.0:
		shake(clampf((impact - 5.0) / 12.0, 0.15, 0.6))
		punch_in(clampf(impact / 14.0, 0.2, 0.8))
	elif air > 0.6:
		punch_in(0.25)


func _on_perfect() -> void:
	hitstop(0.05)
	flash_screen(0.35)
	punch_in(0.6)


func _on_crash() -> void:
	shake(0.75)
	normal_time(8.0)


func _on_boost(on: bool) -> void:
	if on:
		kick_fov(9.0)
		chroma = 1.0
		chroma_hold = 0.35
	else:
		chroma_hold = 0.0
