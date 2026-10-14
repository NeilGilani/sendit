class_name Lifts
extends Node3D
## Chairlifts and gondolas from OpenStreetMap: towers, sagging cables, stations and moving chairs.
## Also provides the ride path used to carry the skier back to the top.

const RIDEABLE := ["chair_lift", "mixed_lift", "gondola", "cable_car"]
const CABLE_HEIGHT := {"chair_lift": 9.0, "mixed_lift": 10.0, "gondola": 12.0, "cable_car": 22.0,
	"drag_lift": 6.0, "t-bar": 6.0, "j-bar": 6.0, "platter": 6.0}
const LINE_OFFSET := 2.6
const CHAIR_SPACING := 22.0
const BOARD_RADIUS := 22.0
const ANIMATE_RANGE := 1600.0

static var instance: Lifts

var lifts: Array = []  # Array of Dictionary


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func _ready() -> void:
	var raw = JSON.parse_string(FileAccess.get_file_as_string("res://assets/terrain/lifts.json"))
	if raw == null:
		return
	var pole_xf: Array[Transform3D] = []
	var arm_xf: Array[Transform3D] = []
	var station_xf: Array[Transform3D] = []
	var wheel_xf: Array[Transform3D] = []
	var cable_st := SurfaceTool.new()
	cable_st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for L in raw:
		var lift := _build_lift(L)
		if lift.is_empty():
			continue
		lifts.append(lift)
		for t in lift.supports:
			var top: Vector3 = t.top
			var ground: float = t.ground
			var dir: Vector3 = t.dir
			var h := top.y - ground
			var yaw := atan2(dir.x, dir.z)
			if t.station:
				station_xf.append(Transform3D(Basis(Vector3.UP, yaw), Vector3(top.x, ground, top.z)))
				wheel_xf.append(Transform3D(Basis(Vector3.UP, yaw), Vector3(top.x, top.y - 0.6, top.z)))
			else:
				pole_xf.append(Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3(1, h + 1.5, 1)), Vector3(top.x, ground - 1.0, top.z)))
				arm_xf.append(Transform3D(Basis(Vector3.UP, yaw), top + Vector3(0, 0.6, 0)))
		_add_cable(cable_st, lift.up)
		_add_cable(cable_st, lift.down)
		_make_chairs(lift)
	_add_multimesh(_pole_mesh(), pole_xf)
	_add_multimesh(_arm_mesh(), arm_xf)
	_add_multimesh(_station_mesh(), station_xf)
	_add_multimesh(_wheel_mesh(), wheel_xf)
	var cable := MeshInstance3D.new()
	cable.name = "Cables"
	cable.mesh = cable_st.commit()
	cable.material_override = _metal(Color(0.12, 0.12, 0.13), 0.45)
	cable.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(cable)


func _build_lift(L: Dictionary) -> Dictionary:
	var terrain := Terrain.instance
	var line: Array = L.line
	if line.size() < 2:
		return {}
	var kind: String = L.type
	var hgt: float = CABLE_HEIGHT.get(kind, 8.0)
	# Horizontal polyline bottom -> top
	var pts: Array[Vector2] = []
	for p in line:
		pts.append(Vector2(p[0], p[2]))
	var cum := PackedFloat32Array([0.0])
	for i in range(1, pts.size()):
		cum.append(cum[i - 1] + pts[i].distance_to(pts[i - 1]))
	var total := cum[cum.size() - 1]
	if total < 60.0:
		return {}
	# Support distances: stations + OSM pylons (projected) or generated.
	var dists: Array[float] = [0.0, total]
	for t in L.towers:
		dists.append(_project(pts, cum, Vector2(t[0], t[2])))
	if L.towers.size() == 0:
		var spacing := 140.0 if kind != "cable_car" else 600.0
		var n := int(total / spacing)
		for i in range(1, n + 1):
			dists.append(total * i / (n + 1))
	dists.sort()
	var clean: Array[float] = []
	for d in dists:
		if clean.is_empty() or d - clean[clean.size() - 1] > 25.0 or d >= total:
			if not clean.is_empty() and d >= total and total - clean[clean.size() - 1] < 25.0 and clean.size() > 1:
				clean[clean.size() - 1] = total
			else:
				clean.append(d)
	var supports := []
	for i in clean.size():
		var d: float = clean[i]
		var xz := _at(pts, cum, d)
		var g := terrain.get_height(xz.x, xz.y)
		var station := i == 0 or i == clean.size() - 1
		var dir2 := (_at(pts, cum, minf(d + 5.0, total)) - _at(pts, cum, maxf(d - 5.0, 0.0))).normalized()
		var top_h := g + (4.5 if station else hgt)
		supports.append({"top": Vector3(xz.x, top_h, xz.y), "ground": g, "station": station,
			"dir": Vector3(dir2.x, 0, dir2.y), "d": d})
	# Cable lines with sag, sampled every ~6 m.
	var up := PackedVector3Array()
	var down := PackedVector3Array()
	for s in supports.size() - 1:
		var a: Dictionary = supports[s]
		var b: Dictionary = supports[s + 1]
		var span: float = b.d - a.d
		var steps := maxi(2, int(span / 6.0))
		for k in steps:
			var t := float(k) / steps
			var d: float = a.d + span * t
			var xz := _at(pts, cum, d)
			var y: float = lerpf(a.top.y, b.top.y, t) - 4.0 * span * 0.012 * t * (1.0 - t)
			y = maxf(y, terrain.get_height(xz.x, xz.y) + 3.2)
			var dir2 := (_at(pts, cum, minf(d + 3.0, total)) - _at(pts, cum, maxf(d - 3.0, 0.0))).normalized()
			var right := Vector3(-dir2.y, 0, dir2.x)
			up.append(Vector3(xz.x, y, xz.y) + right * LINE_OFFSET)
			down.append(Vector3(xz.x, y, xz.y) - right * LINE_OFFSET)
	var last: Dictionary = supports[supports.size() - 1]
	var ldir: Vector3 = last.dir
	var lright := Vector3(-ldir.z, 0, ldir.x)
	up.append(last.top + lright * LINE_OFFSET)
	down.append(last.top - lright * LINE_OFFSET)
	down.reverse()
	return {
		"name": L.name, "type": kind, "length": total,
		"bottom": Vector3(pts[0].x, terrain.get_height(pts[0].x, pts[0].y), pts[0].y),
		"top": Vector3(pts[pts.size() - 1].x, terrain.get_height(pts[pts.size() - 1].x, pts[pts.size() - 1].y), pts[pts.size() - 1].y),
		"supports": supports, "up": up, "down": down,
		"up_cum": _cumulative(up), "down_cum": _cumulative(down),
		"rideable": kind in RIDEABLE,
		"speed": 4.0 if kind != "cable_car" else 8.0,
	}


func _cumulative(line: PackedVector3Array) -> PackedFloat32Array:
	var c := PackedFloat32Array([0.0])
	for i in range(1, line.size()):
		c.append(c[i - 1] + line[i].distance_to(line[i - 1]))
	return c


func _project(pts: Array[Vector2], cum: PackedFloat32Array, p: Vector2) -> float:
	var best := INF
	var best_d := 0.0
	for i in pts.size() - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var ab := b - a
		var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
		var q := a + ab * t
		var dd := q.distance_to(p)
		if dd < best:
			best = dd
			best_d = cum[i] + ab.length() * t
	return best_d


func _at(pts: Array[Vector2], cum: PackedFloat32Array, d: float) -> Vector2:
	for i in pts.size() - 1:
		if d <= cum[i + 1] or i == pts.size() - 2:
			var seg := cum[i + 1] - cum[i]
			var t := 0.0 if seg <= 0.0 else clampf((d - cum[i]) / seg, 0.0, 1.0)
			return pts[i].lerp(pts[i + 1], t)
	return pts[pts.size() - 1]


## Point and tangent along a polyline at distance d.
static func sample_line(line: PackedVector3Array, cum: PackedFloat32Array, d: float) -> Array:
	d = clampf(d, 0.0, cum[cum.size() - 1])
	var lo := 0
	var hi := cum.size() - 1
	while hi - lo > 1:
		var mid := (lo + hi) >> 1
		if cum[mid] <= d:
			lo = mid
		else:
			hi = mid
	var seg := cum[hi] - cum[lo]
	var t := 0.0 if seg <= 0.0 else (d - cum[lo]) / seg
	return [line[lo].lerp(line[hi], t), (line[hi] - line[lo]).normalized()]


# ------------------------------------------------------------------ chairs
func _make_chairs(lift: Dictionary) -> void:
	var up_len: float = lift.up_cum[lift.up_cum.size() - 1]
	var down_len: float = lift.down_cum[lift.down_cum.size() - 1]
	var loop := up_len + down_len
	var spacing := CHAIR_SPACING if lift.type != "cable_car" else loop * 0.5
	var count := maxi(2, int(loop / spacing))
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = _gondola_mesh() if lift.type in ["gondola", "cable_car"] else chair_mesh()
	mm.instance_count = count
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.name = "Chairs_" + str(lift.name)
	mmi.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(mmi)
	lift["chairs"] = mmi
	lift["loop"] = loop
	lift["chair_spacing"] = loop / count
	lift["center"] = (lift.bottom + lift.top) * 0.5
	_update_chairs(lift, 0.0)


func _process(_delta: float) -> void:
	var cam := get_viewport().get_camera_3d()
	var cp := cam.global_position if cam else Vector3.ZERO
	var t := Time.get_ticks_msec() / 1000.0
	for lift in lifts:
		var c: Vector3 = lift.center
		if cp.distance_to(c) - float(lift.length) * 0.5 < ANIMATE_RANGE:
			_update_chairs(lift, t)


func _update_chairs(lift: Dictionary, time: float) -> void:
	var mm: MultiMesh = lift.chairs.multimesh
	var up_len: float = lift.up_cum[lift.up_cum.size() - 1]
	var loop: float = lift.loop
	var offset := fmod(time * float(lift.speed), loop)
	for i in mm.instance_count:
		var d := fmod(offset + i * float(lift.chair_spacing), loop)
		mm.set_instance_transform(i, chair_transform(lift, d, up_len))


func chair_transform(lift: Dictionary, d: float, up_len := -1.0) -> Transform3D:
	if up_len < 0.0:
		up_len = lift.up_cum[lift.up_cum.size() - 1]
	var s: Array
	if d <= up_len:
		s = sample_line(lift.up, lift.up_cum, d)
	else:
		s = sample_line(lift.down, lift.down_cum, d - up_len)
	var p: Vector3 = s[0]
	var dir: Vector3 = s[1]
	var flat := Vector3(dir.x, 0, dir.z).normalized()
	if flat.length_squared() < 0.5:
		flat = Vector3.FORWARD
	var basis := Basis.looking_at(-flat, Vector3.UP)
	return Transform3D(basis, p)


# ------------------------------------------------------------------ riding API
## Rideable lift whose bottom station is within reach of pos, or {}.
func find_boardable(pos: Vector3) -> Dictionary:
	for lift in lifts:
		if lift.rideable and Vector2(pos.x - lift.bottom.x, pos.z - lift.bottom.z).length() < BOARD_RADIUS:
			return lift
	return {}


func nearest_base(pos: Vector3) -> Dictionary:
	var best := {}
	var bd := INF
	for lift in lifts:
		if not lift.rideable:
			continue
		var d := pos.distance_to(lift.bottom)
		if d < bd:
			bd = d
			best = lift
	return best


func ride_length(lift: Dictionary) -> float:
	return lift.up_cum[lift.up_cum.size() - 1]


## Seat transform (skier hips) at distance d along the up line.
func seat_transform(lift: Dictionary, d: float) -> Transform3D:
	var t := chair_transform(lift, d, ride_length(lift))
	# Chairs face +Z along travel; the skier faces -Z, so turn the seat around.
	return Transform3D(t.basis * Basis(Vector3.UP, PI), t.origin + Vector3(0, -2.35, 0) + t.basis.z * 0.15)


# ------------------------------------------------------------------ meshes
func _add_multimesh(mesh: Mesh, xf: Array[Transform3D]) -> void:
	if xf.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xf.size()
	for i in xf.size():
		mm.set_instance_transform(i, xf[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	add_child(mmi)


func _add_cable(st: SurfaceTool, line: PackedVector3Array) -> void:
	var r := 0.05
	for i in line.size() - 1:
		var a := line[i]
		var b := line[i + 1]
		var dir := (b - a).normalized()
		var side := dir.cross(Vector3.UP).normalized() * r
		var upv := side.cross(dir).normalized() * r
		for off in [side, upv]:
			st.add_vertex(a - off)
			st.add_vertex(a + off)
			st.add_vertex(b + off)
			st.add_vertex(a - off)
			st.add_vertex(b + off)
			st.add_vertex(b - off)


static func _metal(c: Color, rough := 0.4) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = 0.6
	m.roughness = rough
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


static func _paint(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.7
	return m


## Merge simple primitive meshes with transforms and materials into one ArrayMesh.
static func merge(parts: Array) -> ArrayMesh:
	var out := ArrayMesh.new()
	for p in parts:
		var st := SurfaceTool.new()
		st.append_from(p[0], 0, p[1])
		st.set_material(p[2])
		out = st.commit(out)
	return out


func _pole_mesh() -> Mesh:
	var c := CylinderMesh.new()
	c.top_radius = 0.28
	c.bottom_radius = 0.42
	c.height = 1.0
	c.radial_segments = 10
	return merge([[c, Transform3D(Basis(), Vector3(0, 0.5, 0)), _metal(Color(0.55, 0.57, 0.6))]])


func _arm_mesh() -> Mesh:
	var bar := BoxMesh.new()
	bar.size = Vector3(LINE_OFFSET * 2.0 + 1.2, 0.35, 0.45)
	var wheel := CylinderMesh.new()
	wheel.top_radius = 0.35
	wheel.bottom_radius = 0.35
	wheel.height = 0.2
	var wb := Basis(Vector3.FORWARD, PI * 0.5)
	return merge([
		[bar, Transform3D(), _metal(Color(0.55, 0.57, 0.6))],
		[wheel, Transform3D(wb, Vector3(LINE_OFFSET, -0.45, 0)), _metal(Color(0.2, 0.2, 0.22))],
		[wheel, Transform3D(wb, Vector3(-LINE_OFFSET, -0.45, 0)), _metal(Color(0.2, 0.2, 0.22))],
	])


func _station_mesh() -> Mesh:
	var body := BoxMesh.new()
	body.size = Vector3(9.0, 4.0, 12.0)
	var roof := PrismMesh.new()
	roof.size = Vector3(10.4, 2.2, 13.0)
	var snow := PrismMesh.new()
	snow.size = Vector3(10.6, 0.35, 13.2)
	return merge([
		[body, Transform3D(Basis(), Vector3(0, 2.0, 0)), _paint(Color(0.55, 0.36, 0.24))],
		[roof, Transform3D(Basis(), Vector3(0, 5.1, 0)), _paint(Color(0.3, 0.3, 0.33))],
		[snow, Transform3D(Basis().scaled(Vector3(1, 1, 1)), Vector3(0, 6.05, 0)), _paint(Color(0.95, 0.96, 1.0))],
	])


func _wheel_mesh() -> Mesh:
	var w := CylinderMesh.new()
	w.top_radius = LINE_OFFSET
	w.bottom_radius = LINE_OFFSET
	w.height = 0.25
	w.radial_segments = 24
	return merge([[w, Transform3D(), _metal(Color(0.35, 0.36, 0.38))]])


static func chair_mesh() -> Mesh:
	var hanger := BoxMesh.new()
	hanger.size = Vector3(0.08, 2.1, 0.08)
	var seat := BoxMesh.new()
	seat.size = Vector3(1.9, 0.12, 0.55)
	var back := BoxMesh.new()
	back.size = Vector3(1.9, 0.6, 0.08)
	var bar := BoxMesh.new()
	bar.size = Vector3(1.9, 0.05, 0.05)
	var frame := _metal(Color(0.25, 0.26, 0.28))
	var cushion := _paint(Color(0.18, 0.32, 0.5))
	return merge([
		[hanger, Transform3D(Basis(), Vector3(0, -1.05, 0)), frame],
		[seat, Transform3D(Basis(), Vector3(0, -2.4, 0.05)), cushion],
		[back, Transform3D(Basis(Vector3.RIGHT, -0.15), Vector3(0, -2.05, -0.22)), cushion],
		[bar, Transform3D(Basis(), Vector3(0, -1.75, 0.55)), frame],
	])


func _gondola_mesh() -> Mesh:
	var hanger := BoxMesh.new()
	hanger.size = Vector3(0.08, 1.4, 0.08)
	var cabin := BoxMesh.new()
	cabin.size = Vector3(1.9, 2.1, 1.9)
	var glass := BoxMesh.new()
	glass.size = Vector3(1.95, 0.8, 1.95)
	var g := StandardMaterial3D.new()
	g.albedo_color = Color(0.2, 0.25, 0.3)
	g.metallic = 0.3
	g.roughness = 0.1
	return merge([
		[hanger, Transform3D(Basis(), Vector3(0, -0.7, 0)), _metal(Color(0.25, 0.26, 0.28))],
		[cabin, Transform3D(Basis(), Vector3(0, -2.5, 0)), _paint(Color(0.82, 0.32, 0.22))],
		[glass, Transform3D(Basis(), Vector3(0, -2.1, 0)), g],
	])
