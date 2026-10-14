class_name Popups
extends CanvasLayer
## Big animated popups: PERFECT, trick names, combo banks, crash titles, medals.

const STYLES := {
	"perfect": [Color(1.0, 0.86, 0.45), 78, 0.42],
	"trick": [Color(1.0, 1.0, 1.0), 40, 0.30],
	"combo": [Color(0.55, 0.95, 1.0), 58, 0.36],
	"bank": [Color(1.0, 0.8, 0.5), 64, 0.38],
	"lost": [Color(1.0, 0.45, 0.4), 46, 0.30],
	"crash": [Color(1.0, 0.62, 0.4), 70, 0.40],
	"medal": [Color(1.0, 0.85, 0.4), 72, 0.42],
	"info": [Color(0.95, 0.95, 1.0), 34, 0.30],
}

var _root: Control
var _stack := 0


func _ready() -> void:
	layer = 9
	process_mode = Node.PROCESS_MODE_ALWAYS
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	EventBus.popup.connect(show_popup)
	EventBus.crash_title.connect(func(t): show_popup(t, "crash"))


func show_popup(text: String, kind := "info") -> void:
	var st: Array = STYLES.get(kind, STYLES.info)
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", st[1])
	l.add_theme_color_override("font_color", st[0])
	l.add_theme_color_override("font_outline_color", Color(0.05, 0.06, 0.1, 0.85))
	l.add_theme_constant_override("outline_size", 10)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.4))
	l.add_theme_constant_override("shadow_offset_y", 3)
	var fv := FontVariation.new()
	fv.base_font = ThemeDB.fallback_font
	fv.variation_embolden = 0.6
	fv.spacing_glyph = 4
	l.add_theme_font_override("font", fv)
	_root.add_child(l)
	var vp := _root.get_viewport_rect().size
	l.size = Vector2(vp.x, st[1] * 1.4)
	var y: float = vp.y * float(st[2]) - _stack * st[1] * 1.1
	l.position = Vector2(0, y)
	l.pivot_offset = Vector2(vp.x * 0.5, st[1] * 0.7)
	l.scale = Vector2(1.7, 1.7)
	l.modulate.a = 0.0
	l.rotation = randf_range(-0.04, 0.04)
	_stack = (_stack + 1) % 3
	var tw := create_tween().set_ignore_time_scale(true)
	tw.set_parallel(true)
	tw.tween_property(l, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 1.0, 0.12)
	tw.chain().tween_interval(0.9 if kind != "crash" else 1.6)
	tw.chain().set_parallel(true)
	tw.tween_property(l, "modulate:a", 0.0, 0.45)
	tw.tween_property(l, "position:y", y - 40.0, 0.45).set_trans(Tween.TRANS_SINE)
	tw.chain().tween_callback(_finish.bind(l))


func _finish(l: Label) -> void:
	l.queue_free()
	_stack = maxi(0, _stack - 1)
