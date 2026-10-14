class_name SkiTrails
extends MeshInstance3D
## Twin grooves left by the skis, laid on the snow and fading with distance travelled.

const MAX_POINTS := 700
const SPACING := 0.4
const HALF_WIDTH := 0.04
const STANCE := 0.12

var skier: Skier
var _imesh := ImmediateMesh.new()
var _left: Array = []   # [pos, across(Vector3), normal, strength, break]
var _right: Array = []
var _last := Vector3(INF, INF, INF)
var _dirty := false
var _was_ground := false


func _ready() -> void:
	top_level = true
	mesh = _imesh
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var m := ShaderMaterial.new()
	m.shader = load("res://rendering/ski_trail.gdshader")
	material_override = m
	EventBus.player_respawned.connect(clear)
	EventBus.lift_arrived.connect(clear)


func clear() -> void:
	_left.clear()
	_right.clear()
	_last = Vector3(INF, INF, INF)
	_dirty = true


func _physics_process(_dt: float) -> void:
	if skier == null:
		return
	var grounded := skier.state == Skier.State.GROUNDED
	if not grounded:
		_was_ground = false
		return
	var p := skier.global_position
	if p.distance_to(_last) < SPACING:
		return
	var brk := not _was_ground
	_was_ground = true
	_last = p
	var n := skier.ground_normal
	var fwd := skier.forward_dir()
	var side := fwd.cross(n).normalized()
	# Skidding widens and softens the marks; carving cuts clean lines.
	var skid := skier.skid
	var strength := clampf(0.35 + skier.speed * 0.05, 0.0, 1.0) * lerpf(1.0, 0.55, skid)
	var vel := skier.velocity
	var across := vel.cross(n).normalized() if vel.length() > 0.5 else side
	var widen := 1.0 + skid * 2.0
	var t := Terrain.instance
	for k in 2:
		var s := -1.0 if k == 0 else 1.0
		var q := p + side * STANCE * s
		q.y = t.get_height(q.x, q.z) + 0.035
		var arr: Array = _left if k == 0 else _right
		arr.append([q, across * HALF_WIDTH * widen, n, strength, brk])
		if arr.size() > MAX_POINTS:
			arr.pop_front()
	_dirty = true


func _process(_dt: float) -> void:
	if not _dirty:
		return
	_dirty = false
	_imesh.clear_surfaces()
	if _left.size() < 2 or not _has_segment(_left):
		return
	_imesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for arr in [_left, _right]:
		_emit(arr)
	_imesh.surface_end()


func _has_segment(arr: Array) -> bool:
	for i in range(1, arr.size()):
		if not arr[i][4]:
			return true
	return false


func _emit(arr: Array) -> void:
	var count := arr.size()
	for i in range(1, count):
		var a: Array = arr[i - 1]
		var b: Array = arr[i]
		if b[4]:
			continue
		var age_a := 1.0 - float(i - 1) / count
		var age_b := 1.0 - float(i) / count
		var pa: Vector3 = a[0]
		var pb: Vector3 = b[0]
		var xa: Vector3 = a[1]
		var xb: Vector3 = b[1]
		var verts := [pa - xa, pa + xa, pb + xb, pa - xa, pb + xb, pb - xb]
		var uvs := [Vector2(age_a, 0), Vector2(age_a, 1), Vector2(age_b, 1), Vector2(age_a, 0), Vector2(age_b, 1), Vector2(age_b, 0)]
		var ns := [a[2], a[2], b[2], a[2], b[2], b[2]]
		var st := [a[3], a[3], b[3], a[3], b[3], b[3]]
		var tg := [xa, xa, xb, xa, xb, xb]
		for v in 6:
			_imesh.surface_set_normal(ns[v])
			_imesh.surface_set_tangent(Plane((tg[v] as Vector3).normalized(), 1.0))
			_imesh.surface_set_color(Color(1, 1, 1, st[v]))
			_imesh.surface_set_uv(uvs[v])
			_imesh.surface_add_vertex(verts[v])
