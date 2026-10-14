class_name UIRoot
extends CanvasLayer
## Minimal, elegant UI: main menu over the flyover, tiny fading HUD (speed + soft score notes),
## gentle hints, pause menu, settings and a credits screen read from CREDITS.md. Also the fade.

signal ride_pressed
signal menu_pressed

const INK := Color(0.98, 0.97, 0.95)
const DIM := Color(0.98, 0.97, 0.95, 0.62)
const ACCENT := Color(1.0, 0.8, 0.58)

var skier: Skier
var theme_ui: Theme

var _fade: ColorRect
var _fade_tween: Tween
var _menu: Control
var _pause: Control
var _settings: Control
var _credits: Control
var _hud: Control
var _speed_label: Label
var _unit_label: Label
var _notes: VBoxContainer
var _hint: Label
var _hint_tween: Tween
var _lift_label: Label
var _hud_alpha := 0.0
var _idle_time := 0.0
var _settings_from_pause := false
var _first_focus: Control


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	theme_ui = _make_theme()
	_build_hud()
	_build_menu()
	_build_pause()
	_build_settings()
	_build_credits()
	_fade = ColorRect.new()
	_fade.color = Color(0.02, 0.02, 0.03, 1.0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_fade)
	fade(false, 2.5)
	EventBus.fade_request.connect(fade)
	EventBus.hint.connect(show_hint)
	EventBus.score_event.connect(_on_score)
	EventBus.lift_boarded.connect(func(n): _lift_label.text = "%s  ·  hold W to hurry" % n)
	EventBus.game_mode_changed.connect(_on_mode)
	_on_mode(GameState.mode)


# ------------------------------------------------------------------ theme
func _make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = 19
	t.set_color("font_color", "Label", INK)
	t.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0.35))
	t.set_constant("shadow_offset_x", "Label", 0)
	t.set_constant("shadow_offset_y", "Label", 1)
	t.set_constant("shadow_outline_size", "Label", 6)
	var empty := StyleBoxEmpty.new()
	var hover := StyleBoxFlat.new()
	hover.bg_color = Color(1, 1, 1, 0.08)
	hover.set_corner_radius_all(6)
	hover.content_margin_left = 14
	hover.content_margin_right = 14
	hover.content_margin_top = 6
	hover.content_margin_bottom = 6
	var normal := hover.duplicate()
	normal.bg_color = Color(1, 1, 1, 0.0)
	var focus := hover.duplicate()
	focus.bg_color = Color(1, 1, 1, 0.0)
	focus.border_width_left = 2
	focus.border_color = ACCENT
	for k in ["normal", "disabled"]:
		t.set_stylebox(k, "Button", normal)
	t.set_stylebox("hover", "Button", hover)
	t.set_stylebox("pressed", "Button", hover)
	t.set_stylebox("focus", "Button", focus)
	t.set_color("font_color", "Button", DIM)
	t.set_color("font_hover_color", "Button", INK)
	t.set_color("font_focus_color", "Button", INK)
	t.set_color("font_pressed_color", "Button", ACCENT)
	t.set_font_size("font_size", "Button", 24)
	t.set_constant("h_separation", "Button", 10)
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(0.06, 0.07, 0.1, 0.55)
	panel.set_corner_radius_all(14)
	panel.content_margin_left = 34
	panel.content_margin_right = 34
	panel.content_margin_top = 28
	panel.content_margin_bottom = 28
	t.set_stylebox("panel", "PanelContainer", panel)
	var track := StyleBoxFlat.new()
	track.bg_color = Color(1, 1, 1, 0.18)
	track.set_corner_radius_all(2)
	track.content_margin_top = 2
	track.content_margin_bottom = 2
	t.set_stylebox("slider", "HSlider", track)
	var fill := track.duplicate()
	fill.bg_color = ACCENT
	t.set_stylebox("grabber_area", "HSlider", fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", fill)
	t.set_color("font_color", "CheckBox", DIM)
	t.set_color("font_hover_color", "CheckBox", INK)
	t.set_stylebox("normal", "CheckBox", empty)
	t.set_stylebox("hover", "CheckBox", empty)
	t.set_stylebox("pressed", "CheckBox", empty)
	t.set_stylebox("focus", "CheckBox", focus)
	t.set_color("font_color", "OptionButton", INK)
	t.set_stylebox("normal", "OptionButton", hover)
	t.set_stylebox("hover", "OptionButton", hover)
	t.set_stylebox("focus", "OptionButton", focus)
	t.set_font_size("font_size", "OptionButton", 19)
	t.set_color("default_color", "RichTextLabel", INK)
	t.set_font_size("normal_font_size", "RichTextLabel", 17)
	t.set_font_size("bold_font_size", "RichTextLabel", 22)
	return t


func _root_control() -> Control:
	var c := Control.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.theme = theme_ui
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(c)
	return c


func _label(text: String, size: int, color := INK, spacing := 0) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if spacing != 0:
		var f := SystemFont.new()
		var fv := FontVariation.new()
		fv.base_font = ThemeDB.fallback_font
		fv.spacing_glyph = spacing
		l.add_theme_font_override("font", fv)
	return l


func _button(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.pressed.connect(cb)
	b.focus_mode = Control.FOCUS_ALL
	return b


func _vignette(parent: Control, left := true) -> void:
	var g := Gradient.new()
	g.set_color(0, Color(0.02, 0.03, 0.06, 0.6))
	g.set_color(1, Color(0.02, 0.03, 0.06, 0.0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0.5) if left else Vector2(0.5, 1)
	gt.fill_to = Vector2(0.62, 0.5) if left else Vector2(0.5, 0.5)
	var tr := TextureRect.new()
	tr.texture = gt
	tr.set_anchors_preset(Control.PRESET_FULL_RECT)
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(tr)


# ------------------------------------------------------------------ main menu
func _build_menu() -> void:
	_menu = _root_control()
	_vignette(_menu)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	box.position = Vector2(110, -190)
	box.add_theme_constant_override("separation", 6)
	_menu.add_child(box)
	box.add_child(_label("SENDIT", 86, INK, 14))
	box.add_child(_label("Valcrest Alpine Resort  ·  golden hour", 18, DIM, 2))
	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 46)
	box.add_child(sp)
	var ride := _button("Ride", func(): ride_pressed.emit())
	box.add_child(ride)
	box.add_child(_button("Settings", func(): _open_settings(false)))
	box.add_child(_button("Credits", _open_credits))
	box.add_child(_button("Quit", func(): get_tree().quit()))
	var foot := _label("W glide · A/D carve · S brake · Shift tuck · hold Space to jump · R back to top", 14, Color(1, 1, 1, 0.45))
	foot.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	foot.position = Vector2(112, -54)
	_menu.add_child(foot)
	_menu.set_meta("focus", ride)


# ------------------------------------------------------------------ pause
func _build_pause() -> void:
	_pause = _root_control()
	_pause.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.06, 0.35)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_pause.add_child(dim)
	_vignette(_pause)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	box.position = Vector2(110, -150)
	box.add_theme_constant_override("separation", 6)
	_pause.add_child(box)
	box.add_child(_label("Paused", 46, INK, 6))
	var stats := _label("", 16, DIM)
	stats.name = "Stats"
	box.add_child(stats)
	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 28)
	box.add_child(sp)
	var resume := _button("Resume", resume_game)
	box.add_child(resume)
	box.add_child(_button("Back to the top", func():
		resume_game()
		EventBus.ride_reset.emit(true)))
	box.add_child(_button("Settings", func(): _open_settings(true)))
	box.add_child(_button("Main menu", func(): menu_pressed.emit()))
	box.add_child(_button("Quit", func(): get_tree().quit()))
	_pause.set_meta("focus", resume)
	_pause.set_meta("stats", stats)
	_pause.visible = false


func pause_game() -> void:
	if GameState.mode != GameState.Mode.RIDING and GameState.mode != GameState.Mode.LIFT:
		return
	_pause.set_meta("resume_mode", GameState.mode)
	GameState.mode = GameState.Mode.PAUSED
	get_tree().paused = true
	var stats: Label = _pause.get_meta("stats")
	stats.text = "%.1f km skied  ·  %d smooth turns  ·  %.0f s of air  ·  score %d" % [
		GameState.distance_m / 1000.0, GameState.smooth_turns, GameState.air_time_total, GameState.score]
	_show_only(_pause)


func resume_game() -> void:
	get_tree().paused = false
	GameState.mode = _pause.get_meta("resume_mode", GameState.Mode.RIDING)
	_show_only(null)


# ------------------------------------------------------------------ settings
func _build_settings() -> void:
	_settings = _root_control()
	_settings.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.06, 0.35)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_settings.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(560, 0)
	panel.position = Vector2(-280, -280)
	_settings.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	panel.add_child(box)
	box.add_child(_label("Settings", 34, INK, 4))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 28)
	grid.add_theme_constant_override("v_separation", 12)
	box.add_child(grid)
	var q := OptionButton.new()
	for n in ["Low", "Medium", "High"]:
		q.add_item(n)
	q.selected = GameState.settings.quality
	q.item_selected.connect(func(i): GameState.set_setting("quality", i))
	_row(grid, "Quality", q)
	_row(grid, "Master volume", _slider("master_volume", 0.0, 1.0))
	_row(grid, "Music volume", _slider("music_volume", 0.0, 1.0))
	_row(grid, "Effects volume", _slider("sfx_volume", 0.0, 1.0))
	_row(grid, "Mouse sensitivity", _slider("mouse_sensitivity", 0.2, 3.0))
	_row(grid, "Camera sensitivity", _slider("camera_sensitivity", 0.2, 3.0))
	_row(grid, "Light snowfall", _check("snowfall"))
	_row(grid, "Fullscreen", _check("fullscreen"))
	var back := _button("Back", _close_settings)
	box.add_child(back)
	_settings.set_meta("focus", q)
	_settings.visible = false


func _row(grid: GridContainer, text: String, ctl: Control) -> void:
	var l := _label(text, 18, DIM)
	grid.add_child(l)
	ctl.custom_minimum_size = Vector2(240, 28)
	ctl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	grid.add_child(ctl)


func _slider(key: String, lo: float, hi: float) -> HSlider:
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = 0.01
	s.value = GameState.settings[key]
	s.value_changed.connect(func(v): GameState.set_setting(key, v))
	s.focus_mode = Control.FOCUS_ALL
	return s


func _check(key: String) -> CheckBox:
	var c := CheckBox.new()
	c.button_pressed = GameState.settings[key]
	c.toggled.connect(func(v): GameState.set_setting(key, v))
	return c


func _open_settings(from_pause: bool) -> void:
	_settings_from_pause = from_pause
	_show_only(_settings)


func _close_settings() -> void:
	if _settings_from_pause:
		_show_only(_pause)
	else:
		_show_only(_menu)


# ------------------------------------------------------------------ credits
func _build_credits() -> void:
	_credits = _root_control()
	_credits.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.06, 0.45)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_credits.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 140
	panel.offset_right = -140
	panel.offset_top = 70
	panel.offset_bottom = -70
	_credits.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	panel.add_child(box)
	var rt := RichTextLabel.new()
	rt.bbcode_enabled = true
	rt.fit_content = false
	rt.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rt.scroll_following = false
	rt.text = _markdown_to_bbcode(FileAccess.get_file_as_string("res://CREDITS.md"))
	box.add_child(rt)
	var back := _button("Back", func(): _show_only(_menu))
	box.add_child(back)
	_credits.set_meta("focus", back)
	_credits.visible = false


func _markdown_to_bbcode(md: String) -> String:
	var out := PackedStringArray()
	var link := RegEx.create_from_string("\\[([^\\]]+)\\]\\(([^)]+)\\)")
	var bold := RegEx.create_from_string("\\*\\*([^*]+)\\*\\*")
	var code := RegEx.create_from_string("`([^`]+)`")
	for line in md.split("\n"):
		var l := line.strip_edges()
		l = link.sub(l, "$1 ($2)", true)
		l = bold.sub(l, "[b]$1[/b]", true)
		l = code.sub(l, "$1", true)
		if l.begins_with("# "):
			out.append("[font_size=40]%s[/font_size]" % l.substr(2))
		elif l.begins_with("## "):
			out.append("\n[color=#ffcc94][font_size=22]%s[/font_size][/color]" % l.substr(3))
		elif l.begins_with("- "):
			out.append("  •  " + l.substr(2))
		else:
			out.append(l)
	return "\n".join(out)


func _open_credits() -> void:
	_show_only(_credits)


# ------------------------------------------------------------------ HUD
func _build_hud() -> void:
	_hud = _root_control()
	var speed_box := VBoxContainer.new()
	speed_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	speed_box.position = Vector2(-60, -104)
	speed_box.custom_minimum_size = Vector2(120, 0)
	speed_box.alignment = BoxContainer.ALIGNMENT_CENTER
	speed_box.add_theme_constant_override("separation", -6)
	_hud.add_child(speed_box)
	_speed_label = _label("0", 40, INK, 1)
	_speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	speed_box.add_child(_speed_label)
	_unit_label = _label("km/h", 13, DIM, 3)
	_unit_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	speed_box.add_child(_unit_label)
	_notes = VBoxContainer.new()
	_notes.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_notes.position = Vector2(-380, -210)
	_notes.custom_minimum_size = Vector2(330, 160)
	_notes.alignment = BoxContainer.ALIGNMENT_END
	_notes.add_theme_constant_override("separation", 2)
	_hud.add_child(_notes)
	_hint = _label("", 17, DIM, 1)
	_hint.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint.position = Vector2(-400, 54)
	_hint.custom_minimum_size = Vector2(800, 0)
	_hint.modulate.a = 0.0
	_hud.add_child(_hint)
	_lift_label = _label("", 17, DIM, 1)
	_lift_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_lift_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_lift_label.position = Vector2(-400, -150)
	_lift_label.custom_minimum_size = Vector2(800, 0)
	_lift_label.modulate.a = 0.0
	_hud.add_child(_lift_label)
	_hud.modulate.a = 0.0


func _process(dt: float) -> void:
	if skier == null:
		return
	var riding := GameState.mode == GameState.Mode.RIDING or GameState.mode == GameState.Mode.LIFT
	var kmh := skier.speed * 3.6
	if skier.speed > 1.0 and skier.state != Skier.State.LIFT:
		_idle_time = 0.0
	else:
		_idle_time += dt
	var want := 1.0 if riding and _idle_time < 3.0 else 0.0
	_hud_alpha = lerpf(_hud_alpha, want, 1.0 - exp(-(2.5 if want > _hud_alpha else 1.2) * dt))
	_speed_label.modulate.a = _hud_alpha
	_unit_label.modulate.a = _hud_alpha
	_hud.modulate.a = 1.0 if riding else lerpf(_hud.modulate.a, 0.0, 1.0 - exp(-4.0 * dt))
	_speed_label.text = str(int(round(kmh)))
	var on_lift := GameState.mode == GameState.Mode.LIFT
	_lift_label.modulate.a = lerpf(_lift_label.modulate.a, 0.85 if on_lift else 0.0, 1.0 - exp(-2.0 * dt))


func _on_score(label: String, points: int) -> void:
	if not (GameState.mode == GameState.Mode.RIDING or GameState.mode == GameState.Mode.LIFT):
		return
	var l := _label("%s   +%d" % [label, points], 18, Color(1, 0.93, 0.84), 1)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	l.modulate.a = 0.0
	_notes.add_child(l)
	while _notes.get_child_count() > 4:
		_notes.get_child(0).queue_free()
		_notes.remove_child(_notes.get_child(0))
	var tw := create_tween()
	tw.tween_property(l, "modulate:a", 0.85, 0.5).set_trans(Tween.TRANS_SINE)
	tw.tween_interval(2.4)
	tw.tween_property(l, "modulate:a", 0.0, 1.4).set_trans(Tween.TRANS_SINE)
	tw.tween_callback(l.queue_free)


func show_hint(text: String) -> void:
	_hint.text = text
	if _hint_tween:
		_hint_tween.kill()
	_hint_tween = create_tween()
	_hint_tween.tween_property(_hint, "modulate:a", 0.9, 0.8).set_trans(Tween.TRANS_SINE)
	_hint_tween.tween_interval(3.5)
	_hint_tween.tween_property(_hint, "modulate:a", 0.0, 1.5).set_trans(Tween.TRANS_SINE)


# ------------------------------------------------------------------ flow helpers
func fade(to_black: bool, duration: float) -> void:
	if _fade == null:
		return
	if _fade_tween:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(_fade, "color:a", 1.0 if to_black else 0.0, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_fade_tween.tween_callback(func(): EventBus.fade_finished.emit(to_black))


func _on_mode(mode: int) -> void:
	match mode:
		GameState.Mode.MENU:
			_show_only(_menu)
		GameState.Mode.RIDING, GameState.Mode.LIFT:
			if not _pause.visible and not _settings.visible:
				_show_only(null)


func _show_only(c: Control) -> void:
	for x in [_menu, _pause, _settings, _credits]:
		x.visible = x == c
	var riding := c == null and (GameState.mode == GameState.Mode.RIDING or GameState.mode == GameState.Mode.LIFT)
	if DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if riding else Input.MOUSE_MODE_VISIBLE
	if c and c.has_meta("focus"):
		(c.get_meta("focus") as Control).call_deferred("grab_focus")


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if _pause.visible:
			resume_game()
		elif _settings.visible:
			_close_settings()
		elif _credits.visible:
			_show_only(_menu)
		elif GameState.mode == GameState.Mode.RIDING or GameState.mode == GameState.Mode.LIFT:
			pause_game()
		get_viewport().set_input_as_handled()
