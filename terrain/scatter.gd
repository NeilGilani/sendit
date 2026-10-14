class_name Scatter
extends Node3D
## Snowy pines and rocks placed with MultiMesh in spatial cells, plus a light obstacle hash
## so the skier can (gently) bump into trunks and boulders.

const TREE_SCENES := [
	"res://assets/models/nature/Pine_1.gltf", "res://assets/models/nature/Pine_2.gltf",
	"res://assets/models/nature/Pine_3.gltf", "res://assets/models/nature/Pine_4.gltf",
	"res://assets/models/nature/Pine_5.gltf",
]
const ROCK_SCENES := [
	"res://assets/models/rocks/rock_07/rock_07_1k.gltf", "res://assets/models/rocks/rock_09/rock_09_1k.gltf",
]
const ROCK_SCALE := [0.55, 1.1]
const CELL := 750.0
const HASH_CELL := 16.0

static var instance: Scatter

var _instances: Array[MultiMeshInstance3D] = []
var _obstacles := {}  # Vector2i -> Array of Vector3(x, z, radius)


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func _ready() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/terrain/scatter.json"))
	var tree_meshes := _load_meshes(TREE_SCENES, true)
	var rock_meshes := _load_meshes(ROCK_SCENES, false)
	_place(data.trees, tree_meshes, 0.35, true)
	_place(data.rocks, rock_meshes, 0.95, false)
	EventBus.settings_changed.connect(_apply_quality)
	_apply_quality()


func _load_meshes(paths: Array, foliage: bool) -> Array[Mesh]:
	var out: Array[Mesh] = []
	for p in paths:
		var scene: PackedScene = load(p)
		var root := scene.instantiate()
		var mi := _find_mesh(root)
		var mesh: Mesh = mi.mesh.duplicate() if mi else BoxMesh.new()
		for s in mesh.get_surface_count():
			var src := mesh.surface_get_material(s)
			mesh.surface_set_material(s, SnowMaterials.make_for(src, foliage))
		out.append(mesh)
		root.free()
	return out


func _find_mesh(n: Node) -> MeshInstance3D:
	if n is MeshInstance3D:
		return n
	for c in n.get_children():
		var r := _find_mesh(c)
		if r:
			return r
	return null


func _place(items: Array, meshes: Array[Mesh], radius_factor: float, is_tree: bool) -> void:
	var buckets := {}  # key "cx,cz,variant" -> Array[Transform3D]
	var half := Terrain.instance.half
	for it in items:
		var x: float = it[0]
		var z: float = it[2]
		var y: float = Terrain.instance.get_height(x, z) - (0.25 if is_tree else 0.35 * float(it[4]))
		var v := int(it[5]) % meshes.size()
		var s: float = it[4] * (1.0 if is_tree else ROCK_SCALE[v])
		var basis := Basis(Vector3.UP, it[3]).scaled(Vector3.ONE * s)
		if not is_tree:
			# Rocks settle into the slope.
			var n := Terrain.instance.get_normal(x, z, 2.0)
			basis = Basis(Quaternion(Vector3.UP, n)) * basis
		var key := Vector3i(int((x + half) / CELL), int((z + half) / CELL), v)
		if not buckets.has(key):
			buckets[key] = []
		buckets[key].append(Transform3D(basis, Vector3(x, y, z)))
		var hk := Vector2i(floori(x / HASH_CELL), floori(z / HASH_CELL))
		if not _obstacles.has(hk):
			_obstacles[hk] = []
		_obstacles[hk].append(Vector3(x, z, radius_factor * s))
	for key in buckets:
		var xforms: Array = buckets[key]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = meshes[key.z]
		mm.instance_count = xforms.size()
		for i in xforms.size():
			mm.set_instance_transform(i, xforms[i])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.set_meta("is_tree", is_tree)
		mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		add_child(mmi)
		_instances.append(mmi)


func _apply_quality() -> void:
	var q: int = GameState.settings.quality
	for mmi in _instances:
		var tree: bool = mmi.get_meta("is_tree")
		var end: float = ([1100.0, 1900.0, 3200.0] if tree else [450.0, 800.0, 1400.0])[q]
		mmi.visibility_range_end = end
		mmi.visibility_range_end_margin = end * 0.15
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if q > 0 or tree else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## Returns the nearest obstacle overlapping a circle at pos as Vector3(x, z, radius), or null.
func find_obstacle(pos: Vector3, radius: float):
	var c := Vector2i(floori(pos.x / HASH_CELL), floori(pos.z / HASH_CELL))
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			var arr = _obstacles.get(Vector2i(c.x + dx, c.y + dz))
			if arr == null:
				continue
			for o in arr:
				var d := Vector2(pos.x - o.x, pos.z - o.y).length()
				if d < o.z + radius:
					return o
	return null
