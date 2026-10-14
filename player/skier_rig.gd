class_name SkierRig
extends Node3D
## Procedural posing of the Quaternius humanoid from the skier's state: bent knees, leaning into
## carves, tucking, arms out in the air, seated on lifts and a soft tumble. Adds skis, poles,
## helmet and goggles (fictional "Northwake" gear).

const MODEL := "res://assets/models/skier/skier.gltf"
const MAX_LEAN := deg_to_rad(24.0)

var skier: Skier
var visual: Node3D
var model: Node3D
var skel: Skeleton3D
var bone := {}
var rest_local := {}
var rest_global := {}
var ski_l: MeshInstance3D
var ski_r: MeshInstance3D
var pole_l: MeshInstance3D
var pole_r: MeshInstance3D
var chair: MeshInstance3D

# Smoothed pose drivers.
var _crouch := 0.2
var _lean := 0.0
var _tuck := 0.0
var _air := 0.0
var _sit := 0.0
var _skid_yaw := 0.0
var _crash := 0.0
var _crash_roll := 0.0
var _arm_phase := 0.0
var _g := {}  # bone idx -> current global Transform3D in skeleton space
var _ankle_h := 0.08


func _ready() -> void:
	skier = get_parent() as Skier
	visual = Node3D.new()
	visual.name = "Visual"
	add_child(visual)
	model = (load(MODEL) as PackedScene).instantiate()
	model.rotation.y = PI
	visual.add_child(model)
	skel = _find_skeleton(model)
	for i in skel.get_bone_count():
		bone[skel.get_bone_name(i)] = i
		rest_local[i] = skel.get_bone_rest(i)
		rest_global[i] = skel.get_bone_global_rest(i)
	_ankle_h = rest_global[bone.foot_l].origin.y
	_apply_materials(model)
	_build_gear()


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var r := _find_skeleton(c)
		if r:
			return r
	return null


func _apply_materials(n: Node) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		for s in mi.mesh.get_surface_count():
			var src := mi.mesh.surface_get_material(s)
			if src and src.resource_name.contains("Superhero"):
				var m := ShaderMaterial.new()
				m.shader = load("res://rendering/skier_suit.gdshader")
				var b := src as BaseMaterial3D
				if b:
					m.set_shader_parameter("albedo_tex", b.albedo_texture)
					m.set_shader_parameter("normal_tex", b.normal_texture)
					m.set_shader_parameter("rough_tex", b.roughness_texture)
				mi.set_surface_override_material(s, m)
	for c in n.get_children():
		_apply_materials(c)


# ------------------------------------------------------------------ gear
func _build_gear() -> void:
	var ski_mesh := _ski_mesh()
	ski_l = MeshInstance3D.new()
	ski_l.mesh = ski_mesh
	ski_r = MeshInstance3D.new()
	ski_r.mesh = ski_mesh
	visual.add_child(ski_l)
	visual.add_child(ski_r)
	var pole_mesh := _pole_mesh()
	pole_l = MeshInstance3D.new()
	pole_l.mesh = pole_mesh
	pole_r = MeshInstance3D.new()
	pole_r.mesh = pole_mesh
	visual.add_child(pole_l)
	visual.add_child(pole_r)
	chair = MeshInstance3D.new()
	chair.mesh = Lifts.chair_mesh()
	chair.transform = Transform3D(Basis(Vector3.UP, PI), Vector3(0, 2.35, 0.15))
	chair.visible = false
	add_child(chair)
	# Helmet + goggles follow the head bone.
	var att := BoneAttachment3D.new()
	att.bone_name = "Head"
	skel.add_child(att)
	var head_inv: Transform3D = rest_global[bone.Head].affine_inverse()
	var helmet := MeshInstance3D.new()
	var hs := SphereMesh.new()
	hs.radius = 0.135
	hs.height = 0.135
	hs.is_hemisphere = true
	hs.radial_segments = 24
	hs.rings = 8
	helmet.mesh = hs
	helmet.material_override = _paint(Color(0.92, 0.9, 0.86), 0.35)
	helmet.transform = head_inv * Transform3D(Basis().scaled(Vector3(0.93, 1.02, 1.1)), Vector3(0, 1.692, -0.008))
	att.add_child(helmet)
	var strap := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.105
	tm.outer_radius = 0.122
	strap.mesh = tm
	strap.material_override = _paint(Color(0.08, 0.08, 0.09), 0.6)
	strap.transform = head_inv * Transform3D(Basis().scaled(Vector3(0.92, 1.0, 1.08)), Vector3(0, 1.70, -0.005))
	att.add_child(strap)
	var lens := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.034
	cm.height = 0.19
	lens.mesh = cm
	var lm := StandardMaterial3D.new()
	lm.albedo_color = Color(0.95, 0.6, 0.2)
	lm.metallic = 0.9
	lm.roughness = 0.08
	lm.rim_enabled = true
	lens.material_override = lm
	lens.transform = head_inv * Transform3D(Basis(Vector3.FORWARD, PI * 0.5).scaled(Vector3(1.0, 1.0, 0.55)), Vector3(0, 1.703, 0.098))
	att.add_child(lens)


func _ski_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var w := 0.045
	var th := 0.014
	var segs := 24
	var length := 1.72
	var pts: Array[Vector3] = []
	for i in segs + 1:
		var t := float(i) / segs
		var z := -length * 0.55 + length * t  # tip at -Z (forward)
		var tip := clampf((-length * 0.42 - z) / (length * 0.13), 0.0, 1.0)
		var tail := clampf((z - length * 0.42) / 0.05, 0.0, 1.0)
		var y := tip * tip * 0.09 + tail * 0.015
		var width := w * (1.0 - tip * 0.35) * (1.06 - 0.12 * sin(t * PI))
		pts.append(Vector3(width, y, z))
	for i in segs:
		var a := pts[i]
		var b := pts[i + 1]
		var quads := [
			[Vector3(-a.x, a.y + th, a.z), Vector3(a.x, a.y + th, a.z), Vector3(b.x, b.y + th, b.z), Vector3(-b.x, b.y + th, b.z)],
			[Vector3(a.x, a.y, a.z), Vector3(-a.x, a.y, a.z), Vector3(-b.x, b.y, b.z), Vector3(b.x, b.y, b.z)],
			[Vector3(a.x, a.y + th, a.z), Vector3(a.x, a.y, a.z), Vector3(b.x, b.y, b.z), Vector3(b.x, b.y + th, b.z)],
			[Vector3(-a.x, a.y, a.z), Vector3(-a.x, a.y + th, a.z), Vector3(-b.x, b.y + th, b.z), Vector3(-b.x, b.y, b.z)],
		]
		for k in quads.size():
			var q: Array = quads[k]
			var u := float(i) / segs
			st.set_uv(Vector2(0, u)); st.add_vertex(q[0])
			st.set_uv(Vector2(1, u)); st.add_vertex(q[2])
			st.set_uv(Vector2(1, u)); st.add_vertex(q[1])
			st.set_uv(Vector2(0, u)); st.add_vertex(q[0])
			st.set_uv(Vector2(0, u)); st.add_vertex(q[3])
			st.set_uv(Vector2(1, u)); st.add_vertex(q[2])
	st.generate_normals()
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.95, 0.42, 0.22)
	m.roughness = 0.3
	m.metallic = 0.1
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	st.set_material(m)
	return st.commit()


func _pole_mesh() -> ArrayMesh:
	var shaft := CylinderMesh.new()
	shaft.top_radius = 0.009
	shaft.bottom_radius = 0.006
	shaft.height = 1.18
	shaft.radial_segments = 8
	var grip := CylinderMesh.new()
	grip.top_radius = 0.018
	grip.bottom_radius = 0.016
	grip.height = 0.16
	grip.radial_segments = 8
	var basket := CylinderMesh.new()
	basket.top_radius = 0.045
	basket.bottom_radius = 0.045
	basket.height = 0.008
	basket.radial_segments = 12
	return Lifts.merge([
		[shaft, Transform3D(Basis(), Vector3(0, -0.59, 0)), _paint(Color(0.75, 0.76, 0.78), 0.3, 0.8)],
		[grip, Transform3D(Basis(), Vector3(0, -0.02, 0)), _paint(Color(0.05, 0.05, 0.06), 0.7)],
		[basket, Transform3D(Basis(), Vector3(0, -1.08, 0)), _paint(Color(0.1, 0.1, 0.1), 0.6)],
	])


static func _paint(c: Color, rough := 0.5, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m


# ------------------------------------------------------------------ posing
func _process(dt: float) -> void:
	if skier == null or skel == null:
		return
	var st := skier.state
	var k := 1.0 - exp(-8.0 * dt)
	var on_ground := st == Skier.State.GROUNDED
	var in_air := st == Skier.State.AIR
	var sitting := st == Skier.State.LIFT
	var crashed := st == Skier.State.CRASH

	var speed_c := clampf(skier.speed / 18.0, 0.0, 1.0)
	var crouch_t := 0.46 + speed_c * 0.14 + skier.tuck * 0.45 + skier.charge * 0.5 + skier.landing_squash * 0.45 + skier.brake * 0.12
	if in_air:
		crouch_t = 0.3
	_crouch = lerpf(_crouch, clampf(crouch_t, 0.0, 1.0), 1.0 - exp(-(14.0 if skier.landing_squash > 0.5 else 7.0) * dt))
	_lean = lerpf(_lean, skier.carve if on_ground else 0.0, 1.0 - exp(-5.0 * dt))
	_tuck = lerpf(_tuck, skier.tuck if on_ground else 0.0, k)
	_air = lerpf(_air, 1.0 if in_air else 0.0, 1.0 - exp(-4.0 * dt))
	_sit = lerpf(_sit, 1.0 if sitting else 0.0, 1.0 - exp(-6.0 * dt))
	_crash = lerpf(_crash, 1.0 if crashed else 0.0, 1.0 - exp(-5.0 * dt))
	if sitting:
		_sit = 1.0 if skier.lift_t < 0.02 else _sit
	var skid_side := 1.0 if _lean >= 0.0 else -1.0
	_skid_yaw = lerpf(_skid_yaw, skier.brake * skier.tuning.brake_skid_angle * skid_side * clampf(skier.speed / 3.0, 0.0, 1.0), 1.0 - exp(-5.0 * dt))
	_arm_phase += dt * (0.8 + skier.speed * 0.05)
	if crashed:
		_crash_roll = lerpf(_crash_roll, PI * 0.45, 1.0 - exp(-3.5 * dt))
	else:
		_crash_roll = lerpf(_crash_roll, 0.0, 1.0 - exp(-6.0 * dt))

	# Whole-body lean into the carve, skid sideways when braking, tumble when crashing.
	var basis := Basis(Vector3.UP, -_skid_yaw)
	basis = basis * Basis(Vector3.FORWARD, _lean * MAX_LEAN * clampf(skier.speed / 6.0, 0.0, 1.0))
	basis = basis * Basis(Vector3.FORWARD, _crash_roll)
	visual.basis = basis
	visual.position = Vector3(0, -_sit * (rest_global[bone.pelvis].origin.y - 0.14), 0)
	chair.visible = sitting

	_pose_skeleton()
	_place_gear()


func _pose_skeleton() -> void:
	skel.reset_bone_poses()
	_g.clear()
	var root: int = bone.root
	_g[root] = rest_global[root]
	var pelvis: int = bone.pelvis
	var drop := _crouch * 0.36 + _tuck * 0.06
	var hip_pitch := deg_to_rad(8.0 + _crouch * 26.0 + _tuck * 18.0) * (1.0 - _sit)
	var rp: Transform3D = rest_global[pelvis]
	var ppos := rp.origin + Vector3(0, -drop * (1.0 - _sit), -_crouch * 0.07 * (1.0 - _sit))
	ppos += Vector3(0, -_crash * 0.55, 0)
	var pbasis := Basis(Vector3.RIGHT, hip_pitch * 0.55) * Basis(Vector3.FORWARD, -_lean * 0.12) * rp.basis
	_set_global(pelvis, Transform3D(pbasis, ppos))

	# Spine curls forward in a tuck; counter-angulation keeps the head level.
	var bend := deg_to_rad(8.0 + _crouch * 14.0 + _tuck * 22.0) * (1.0 - _air * 0.4)
	bend -= deg_to_rad(12.0) * _sit
	var spine_chain := ["spine_01", "spine_02", "spine_03"]
	for s in spine_chain:
		var b: int = bone[s]
		_inherit(b)
		_rotate_global(b, Basis(Vector3.RIGHT, bend * 0.33) * Basis(Vector3.FORWARD, _lean * 0.1))
	var neck: int = bone.neck_01
	_inherit(neck)
	_rotate_global(neck, Basis(Vector3.RIGHT, -(hip_pitch * 0.55 + bend) * 0.55))
	var head: int = bone.Head
	_inherit(head)
	_rotate_global(head, Basis(Vector3.RIGHT, -(hip_pitch * 0.55 + bend) * 0.35) * Basis(Vector3.FORWARD, _lean * 0.2))

	for side in [1.0, -1.0]:
		_pose_leg(side)
		_pose_arm(side)


func _pose_leg(side: float) -> void:
	var s := "_l" if side > 0.0 else "_r"
	var thigh: int = bone["thigh" + s]
	var calf: int = bone["calf" + s]
	var foot: int = bone["foot" + s]
	_inherit(thigh)
	var hip: Vector3 = _g[thigh].origin
	var rest_ankle: Vector3 = rest_global[foot].origin
	var ankle := Vector3(rest_ankle.x * 0.9 + side * 0.02, rest_ankle.y, rest_ankle.z)
	# Tuck the legs a bit in the air, sit on the lift.
	ankle.y += _air * 0.18
	ankle.z += _air * 0.05
	var seat_ankle := hip + Vector3(side * 0.03, -0.5, 0.42)
	ankle = ankle.lerp(seat_ankle, _sit)
	var crash_ankle := hip + Vector3(side * 0.25, -0.75, 0.25)
	ankle = ankle.lerp(crash_ankle, _crash)
	var l1: float = rest_local[calf].origin.length()
	var l2: float = rest_local[foot].origin.length()
	var to := ankle - hip
	var d := clampf(to.length(), 0.05, l1 + l2 - 0.002)
	var dir := to.normalized()
	var pole := Vector3(side * 0.12, 0.0, 1.0)
	pole = (pole - dir * pole.dot(dir)).normalized()
	var cos_a := clampf((l1 * l1 + d * d - l2 * l2) / (2.0 * l1 * d), -1.0, 1.0)
	var axis := dir.cross(pole).normalized()
	var knee := hip + dir.rotated(axis, acos(cos_a)) * l1
	_aim(thigh, calf, knee - hip)
	_inherit(calf)
	_aim(calf, foot, ankle - _g[calf].origin)
	_inherit(foot)
	var flat: Basis = rest_global[foot].basis
	flat = Basis(Vector3.RIGHT, -_sit * 0.35) * flat
	_set_global(foot, Transform3D(flat, _g[foot].origin))


func _pose_arm(side: float) -> void:
	var s := "_l" if side > 0.0 else "_r"
	var clav: int = bone["clavicle" + s]
	var upper: int = bone["upperarm" + s]
	var lower: int = bone["lowerarm" + s]
	var hand: int = bone["hand" + s]
	_inherit(clav)
	_inherit(upper)
	var sway := sin(_arm_phase + side) * 0.04
	var up_stance := Vector3(side * 0.42, -0.85, 0.32 + sway)
	var lo_stance := Vector3(side * 0.2, -0.35, 1.0)
	var up_tuck := Vector3(side * 0.18, -0.55, 0.85)
	var lo_tuck := Vector3(-side * 0.35, 0.15, 0.95)
	var up_air := Vector3(side * 1.0, -0.25 + sin(_arm_phase * 1.7) * 0.06, 0.15)
	var lo_air := Vector3(side * 1.0, 0.05, 0.3)
	var up_sit := Vector3(side * 0.2, -0.8, 0.45)
	var lo_sit := Vector3(side * 0.05, -0.15, 1.0)
	var up_crash := Vector3(side * 1.0, 0.4, 0.2)
	var lo_crash := Vector3(side * 1.0, 0.6, 0.0)
	# Lean: inside arm drops, outside arm reaches.
	up_stance.y -= _lean * side * 0.15
	var u := up_stance.lerp(up_tuck, _tuck).lerp(up_air, _air).lerp(up_sit, _sit).lerp(up_crash, _crash)
	var l := lo_stance.lerp(lo_tuck, _tuck).lerp(lo_air, _air).lerp(lo_sit, _sit).lerp(lo_crash, _crash)
	_aim(upper, lower, u.normalized())
	_inherit(lower)
	_aim(lower, hand, l.normalized())
	_inherit(hand)


## Current global of bone b assuming its rest local transform under the (possibly posed) parent.
func _inherit(b: int) -> void:
	var p := skel.get_bone_parent(b)
	var pg: Transform3D = _g[p] if _g.has(p) else _global_of(p)
	_g[b] = pg * rest_local[b]


func _global_of(b: int) -> Transform3D:
	if b < 0:
		return Transform3D()
	if _g.has(b):
		return _g[b]
	var t: Transform3D = _global_of(skel.get_bone_parent(b)) * rest_local[b]
	_g[b] = t
	return t


func _set_global(b: int, t: Transform3D) -> void:
	var p := skel.get_bone_parent(b)
	var pg := _global_of(p)
	var local := pg.affine_inverse() * t
	skel.set_bone_pose_position(b, local.origin)
	skel.set_bone_pose_rotation(b, local.basis.get_rotation_quaternion())
	_g[b] = t


func _rotate_global(b: int, r: Basis) -> void:
	var t: Transform3D = _g[b]
	_set_global(b, Transform3D(r * t.basis, t.origin))


## Rotate bone b (shortest arc) so its child points along dir (skeleton space).
func _aim(b: int, child: int, dir: Vector3) -> void:
	if not _g.has(b):
		_inherit(b)
	var t: Transform3D = _g[b]
	var cur: Vector3 = (t.basis * rest_local[child].origin).normalized()
	var want := dir.normalized()
	if cur.dot(want) > 0.99999:
		return
	var q := Quaternion(cur, want)
	_set_global(b, Transform3D(Basis(q) * t.basis, t.origin))


func _place_gear() -> void:
	var to_visual := model.transform * skel.transform  # skeleton space -> visual space (model is direct child)
	for side in [1.0, -1.0]:
		var s := "_l" if side > 0.0 else "_r"
		var ski := ski_l if side > 0.0 else ski_r
		var foot_p: Vector3 = to_visual * _g[bone["foot" + s]].origin
		var tilt := Basis(Vector3.RIGHT, _sit * 0.5 - _air * 0.12)
		ski.transform = Transform3D(tilt, foot_p - tilt * Vector3(0, _ankle_h * 0.95, -0.05))
		var pole := pole_l if side > 0.0 else pole_r
		var hand_t: Transform3D = _g[bone["hand" + s]]
		var hand_p: Vector3 = to_visual * (hand_t.origin + hand_t.basis.y.normalized() * 0.0)
		# Poles trail behind and outside; swing back in the air; hang loose on the lift.
		var model_side: float = -side  # model is rotated 180°, so its left (+X) is our -X
		var target := Vector3(model_side * 0.28, -1.0, 0.55)
		target = target.lerp(Vector3(model_side * 0.35, -0.55, 1.0), maxf(_air, _tuck * 0.8))
		target = target.lerp(Vector3(model_side * 0.05, -1.0, -0.1), _sit)
		var y := -target.normalized()
		var x := Vector3.FORWARD.cross(y).normalized()
		if x.length_squared() < 0.01:
			x = Vector3.RIGHT
		var z := x.cross(y).normalized()
		pole.transform = Transform3D(Basis(x, y, z), hand_p)
