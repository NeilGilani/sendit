class_name ScreenFX
extends CanvasLayer
## Drives the full-screen post shader from the skier's speed and the Juice director.
## Also hosts colour filters (photo mode, lighting presets) and cinematic letterbox bars.

static var instance: ScreenFX

var skier: Skier
var material: ShaderMaterial
var filter_saturation := 1.0
var filter_contrast := 1.0
var filter_tint := Color(1, 1, 1)
var filter_mono := 0.0
var filter_grain := 0.0
var letterbox_target := 0.0
var _speed := 0.0
var _letterbox := 0.0
var _rect: ColorRect


func _init() -> void:
	instance = self


func _ready() -> void:
	layer = 1
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rect = ColorRect.new()
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	material = ShaderMaterial.new()
	material.shader = load("res://fx/screen_fx.gdshader")
	_rect.material = material
	add_child(_rect)


func set_filter(filter_name: String) -> void:
	match filter_name:
		"warm":
			filter_saturation = 1.15; filter_contrast = 1.06; filter_tint = Color(1.06, 0.98, 0.9); filter_mono = 0.0; filter_grain = 0.0
		"cool":
			filter_saturation = 0.95; filter_contrast = 1.04; filter_tint = Color(0.92, 0.98, 1.08); filter_mono = 0.0; filter_grain = 0.0
		"mono":
			filter_saturation = 1.0; filter_contrast = 1.15; filter_tint = Color(1, 1, 1); filter_mono = 1.0; filter_grain = 0.03
		"film":
			filter_saturation = 0.85; filter_contrast = 1.1; filter_tint = Color(1.04, 1.0, 0.93); filter_mono = 0.0; filter_grain = 0.05
		_:
			filter_saturation = 1.0; filter_contrast = 1.0; filter_tint = Color(1, 1, 1); filter_mono = 0.0; filter_grain = 0.0


func _process(_dt: float) -> void:
	var rdt := get_process_delta_time() / maxf(Engine.time_scale, 0.03)
	rdt = minf(rdt, 0.1)
	var target := 0.0
	if skier and (GameState.mode == GameState.Mode.RIDING) and skier.state != Skier.State.LIFT:
		target = smoothstep(17.0, 30.0, skier.speed)
		if skier.boosting:
			target = maxf(target, 0.75)
	if GameState.settings.quality == GameState.Quality.LOW:
		target *= 0.5
	_speed = lerpf(_speed, target, 1.0 - exp(-3.0 * rdt))
	_letterbox = lerpf(_letterbox, letterbox_target, 1.0 - exp(-3.0 * rdt))
	var j := Juice.instance
	material.set_shader_parameter("speed_amount", _speed)
	material.set_shader_parameter("chroma", j.chroma if j else 0.0)
	material.set_shader_parameter("flash", j.flash if j else 0.0)
	material.set_shader_parameter("saturation", filter_saturation)
	material.set_shader_parameter("contrast", filter_contrast)
	material.set_shader_parameter("tint", Vector3(filter_tint.r, filter_tint.g, filter_tint.b))
	material.set_shader_parameter("mono", filter_mono)
	material.set_shader_parameter("grain", filter_grain)
	material.set_shader_parameter("letterbox", _letterbox)
