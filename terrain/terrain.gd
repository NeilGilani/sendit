class_name Terrain
extends Node3D
## Real-mountain terrain: loads exported data, renders GPU-displaced chunks with distance LOD,
## keeps HeightMapShape3D collision near the focus, and answers height/surface queries.

enum Surface { GROOMED, POWDER, ROCK, FOREST }

const DATA_DIR := "res://assets/terrain/"
const CHUNK_QUADS := 128
const LOD_COUNT := 5
const COLLISION_RADIUS := 1  # chunks around the focus (3x3)

static var instance: Terrain

var size_m := 6000.0
var res := 2048
var spacing := 1.0
var half := 3000.0
var min_h := 0.0
var max_h := 4500.0
var meta := {}
var heights := PackedFloat32Array()
var splat := PackedByteArray()

var height_texture: ImageTexture
var normal_texture: ImageTexture
var splat_texture: ImageTexture
var far_texture: ImageTexture

var material: ShaderMaterial
var far_material: ShaderMaterial
var lod_meshes: Array[ArrayMesh] = []
var lod_distances := PackedFloat32Array([420.0, 950.0, 1900.0, 3600.0])

var _chunks_per_side := 16
var _chunk_size := 375.0
var _chunk_nodes: Array[MeshInstance3D] = []
var _chunk_lod := PackedInt32Array()
var _collision_body: StaticBody3D
var _collision_shapes := {}  # Vector2i -> CollisionShape3D
var _focus := Vector3.ZERO
var _last_collision_chunk := Vector2i(-999, -999)


func _init() -> void:
	instance = self


func _ready() -> void:
	_load_data()
	_build_textures()
	_build_materials()
	_build_lod_meshes()
	_build_chunks()
	_build_far()
	_collision_body = StaticBody3D.new()
	_collision_body.name = "TerrainCollision"
	_collision_body.collision_layer = 1
	_collision_body.collision_mask = 0
	add_child(_collision_body)
	update_focus(Vector3.ZERO, true)
	EventBus.settings_changed.connect(_apply_quality)
	_apply_quality()


func _exit_tree() -> void:
	if instance == self:
		instance = null


# ------------------------------------------------------------------ loading
func _load_data() -> void:
	var f := FileAccess.open(DATA_DIR + "terrain.json", FileAccess.READ)
	meta = JSON.parse_string(f.get_as_text())
	size_m = meta.size_m
	res = int(meta.res)
	spacing = meta.spacing
	half = size_m * 0.5
	min_h = meta.min_height
	max_h = meta.max_height
	heights = FileAccess.get_file_as_bytes(DATA_DIR + "height_f32.bin").to_float32_array()
	splat = FileAccess.get_file_as_bytes(DATA_DIR + "splat_rgb8.bin")
	_chunks_per_side = ceili(float(res - 1) / CHUNK_QUADS)
	_chunk_size = CHUNK_QUADS * spacing


func _build_textures() -> void:
	var himg := Image.create_from_data(res, res, false, Image.FORMAT_RF, heights.to_byte_array())
	height_texture = ImageTexture.create_from_image(himg)
	var nbytes := FileAccess.get_file_as_bytes(DATA_DIR + "normal_rg8.bin")
	var nimg := Image.create_from_data(res, res, false, Image.FORMAT_RG8, nbytes)
	nimg.generate_mipmaps()
	normal_texture = ImageTexture.create_from_image(nimg)
	var simg := Image.create_from_data(res, res, false, Image.FORMAT_RGB8, splat)
	simg.generate_mipmaps()
	splat_texture = ImageTexture.create_from_image(simg)
	var fres := int(meta.far_res)
	var fimg := Image.create_from_data(fres, fres, false, Image.FORMAT_RF,
		FileAccess.get_file_as_bytes(DATA_DIR + "far_f32.bin"))
	far_texture = ImageTexture.create_from_image(fimg)


func _build_materials() -> void:
	material = ShaderMaterial.new()
	material.shader = load("res://rendering/terrain.gdshader")
	material.set_shader_parameter("height_map", height_texture)
	material.set_shader_parameter("normal_map_terrain", normal_texture)
	material.set_shader_parameter("splat_map", splat_texture)
	material.set_shader_parameter("terrain_size", size_m)
	material.set_shader_parameter("terrain_res", res)
	material.set_shader_parameter("terrain_spacing", spacing)
	TerrainMaterials.setup_terrain(material)
	far_material = ShaderMaterial.new()
	far_material.shader = load("res://rendering/terrain_far.gdshader")
	far_material.set_shader_parameter("far_map", far_texture)
	far_material.set_shader_parameter("far_size", float(meta.far_size_m))
	far_material.set_shader_parameter("far_res", int(meta.far_res))
	far_material.set_shader_parameter("near_half", half)
	TerrainMaterials.setup_far(far_material)


## Shared flat grids, one per LOD, with a skirt ring flagged in UV2.x so the shader drops it.
func _build_lod_meshes() -> void:
	lod_meshes.clear()
	for lod in LOD_COUNT:
		var n := CHUNK_QUADS >> lod
		var step := spacing * float(1 << lod)
		var verts := PackedVector3Array()
		var uv2 := PackedVector2Array()
		var idx := PackedInt32Array()
		var w := n + 3
		for j in range(-1, n + 2):
			for i in range(-1, n + 2):
				var ci := clampi(i, 0, n)
				var cj := clampi(j, 0, n)
				verts.append(Vector3(ci * step, 0.0, cj * step))
				var skirt := 1.0 if (i != ci or j != cj) else 0.0
				uv2.append(Vector2(skirt, float(1 << lod)))
		for j in w - 1:
			for i in w - 1:
				var a := j * w + i
				var b := a + 1
				var c := a + w
				var d := c + 1
				idx.append_array([a, b, c, b, d, c])
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		arrays[Mesh.ARRAY_TEX_UV2] = uv2
		arrays[Mesh.ARRAY_INDEX] = idx
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		mesh.surface_set_material(0, material)
		lod_meshes.append(mesh)


func _build_chunks() -> void:
	_chunk_nodes.clear()
	_chunk_lod.resize(_chunks_per_side * _chunks_per_side)
	_chunk_lod.fill(-1)
	for cz in _chunks_per_side:
		for cx in _chunks_per_side:
			var mi := MeshInstance3D.new()
			mi.name = "Chunk_%d_%d" % [cx, cz]
			mi.position = Vector3(-half + cx * _chunk_size, 0.0, -half + cz * _chunk_size)
			var hr := _chunk_height_range(cx, cz)
			mi.custom_aabb = AABB(Vector3(-2, hr.x - 30.0, -2), Vector3(_chunk_size + 4, hr.y - hr.x + 40.0, _chunk_size + 4))
			mi.mesh = lod_meshes[LOD_COUNT - 1]
			mi.gi_mode = GeometryInstance3D.GI_MODE_STATIC
			add_child(mi)
			_chunk_nodes.append(mi)


func _chunk_height_range(cx: int, cz: int) -> Vector2:
	var lo := INF
	var hi := -INF
	var i0 := cx * CHUNK_QUADS
	var j0 := cz * CHUNK_QUADS
	for j in range(j0, mini(j0 + CHUNK_QUADS + 1, res), 4):
		var row := j * res
		for i in range(i0, mini(i0 + CHUNK_QUADS + 1, res), 4):
			var h := heights[row + i]
			lo = minf(lo, h)
			hi = maxf(hi, h)
	return Vector2(lo, hi)


func _build_far() -> void:
	var n := 256
	var fsize: float = meta.far_size_m
	var step := fsize / n
	var verts := PackedVector3Array()
	var idx := PackedInt32Array()
	for j in n + 1:
		for i in n + 1:
			verts.append(Vector3(-fsize * 0.5 + i * step, 0.0, -fsize * 0.5 + j * step))
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			idx.append_array([a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, far_material)
	var mi := MeshInstance3D.new()
	mi.name = "FarTerrain"
	mi.mesh = mesh
	mi.custom_aabb = AABB(Vector3(-fsize * 0.5, meta.far_min_height - 50.0, -fsize * 0.5),
		Vector3(fsize, meta.far_max_height - meta.far_min_height + 100.0, fsize))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _apply_quality() -> void:
	var q: int = GameState.settings.quality
	var scale: float = [0.6, 1.0, 1.4][q]
	lod_distances = PackedFloat32Array([420.0 * scale, 950.0 * scale, 1900.0 * scale, 3600.0 * scale])
	_chunk_lod.fill(-1)
	update_focus(_focus, true)
	TerrainMaterials.apply_quality(material)


# ------------------------------------------------------------------ LOD + collision
func update_focus(pos: Vector3, force := false) -> void:
	_focus = pos
	for cz in _chunks_per_side:
		for cx in _chunks_per_side:
			var k := cz * _chunks_per_side + cx
			var center := Vector2(-half + (cx + 0.5) * _chunk_size, -half + (cz + 0.5) * _chunk_size)
			var d := maxf(0.0, center.distance_to(Vector2(pos.x, pos.z)) - _chunk_size * 0.5)
			var lod := LOD_COUNT - 1
			for l in lod_distances.size():
				if d < lod_distances[l]:
					lod = l
					break
			if lod != _chunk_lod[k] or force:
				_chunk_lod[k] = lod
				_chunk_nodes[k].mesh = lod_meshes[lod]
	_update_collision(pos)


func _process(_delta: float) -> void:
	var cam := get_viewport().get_camera_3d()
	if cam:
		var p := cam.global_position
		if p.distance_squared_to(_focus) > 400.0:
			update_focus(p)
		else:
			_update_collision(p)


func _update_collision(pos: Vector3) -> void:
	var c := Vector2i(floori((pos.x + half) / _chunk_size), floori((pos.z + half) / _chunk_size))
	if c == _last_collision_chunk:
		return
	_last_collision_chunk = c
	var wanted := {}
	for dz in range(-COLLISION_RADIUS, COLLISION_RADIUS + 1):
		for dx in range(-COLLISION_RADIUS, COLLISION_RADIUS + 1):
			var k := Vector2i(c.x + dx, c.y + dz)
			if k.x < 0 or k.y < 0 or k.x >= _chunks_per_side or k.y >= _chunks_per_side:
				continue
			wanted[k] = true
			if not _collision_shapes.has(k):
				_collision_shapes[k] = _make_collision(k)
	for k in _collision_shapes.keys():
		if not wanted.has(k):
			_collision_shapes[k].queue_free()
			_collision_shapes.erase(k)


func _make_collision(k: Vector2i) -> CollisionShape3D:
	var n := CHUNK_QUADS + 1
	var data := PackedFloat32Array()
	data.resize(n * n)
	var inv := 1.0 / spacing
	for j in n:
		var sj := mini(k.y * CHUNK_QUADS + j, res - 1)
		for i in n:
			var si := mini(k.x * CHUNK_QUADS + i, res - 1)
			data[j * n + i] = heights[sj * res + si] * inv
	var shape := HeightMapShape3D.new()
	shape.map_width = n
	shape.map_depth = n
	shape.map_data = data
	var cs := CollisionShape3D.new()
	cs.shape = shape
	var center := Vector3(-half + (k.x * CHUNK_QUADS + CHUNK_QUADS * 0.5) * spacing, 0.0,
		-half + (k.y * CHUNK_QUADS + CHUNK_QUADS * 0.5) * spacing)
	cs.transform = Transform3D(Basis.from_scale(Vector3.ONE * spacing), center)
	_collision_body.add_child(cs)
	return cs


# ------------------------------------------------------------------ queries
func _h(i: int, j: int) -> float:
	return heights[clampi(j, 0, res - 1) * res + clampi(i, 0, res - 1)]


## Smooth (bilinear) terrain height in metres at world x/z.
func get_height(x: float, z: float) -> float:
	var fx := clampf((x + half) / spacing, 0.0, res - 1.001)
	var fz := clampf((z + half) / spacing, 0.0, res - 1.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var row := j * res + i
	var h00 := heights[row]
	var h10 := heights[row + 1]
	var h01 := heights[row + res]
	var h11 := heights[row + res + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)


## Surface normal from central differences over `radius` metres (bigger = smoother).
func get_normal(x: float, z: float, radius := 0.0) -> Vector3:
	var e := maxf(radius, spacing)
	var hl := get_height(x - e, z)
	var hr := get_height(x + e, z)
	var hd := get_height(x, z - e)
	var hu := get_height(x, z + e)
	return Vector3(hl - hr, 2.0 * e, hd - hu).normalized()


## Splat weights at world x/z: x groomed, y powder, z rock, w forest.
func get_surface_weights(x: float, z: float) -> Vector4:
	var i := clampi(int(round((x + half) / spacing)), 0, res - 1)
	var j := clampi(int(round((z + half) / spacing)), 0, res - 1)
	var o := (j * res + i) * 3
	var g := splat[o] / 255.0
	var r := splat[o + 1] / 255.0
	var f := splat[o + 2] / 255.0
	var p := clampf(1.0 - maxf(g, maxf(r, f)), 0.0, 1.0)
	return Vector4(g, p, r, f)


func get_surface_type(x: float, z: float) -> int:
	var w := get_surface_weights(x, z)
	var best := Surface.POWDER
	var v := w.y
	if w.x > v:
		best = Surface.GROOMED
		v = w.x
	if w.z > v:
		best = Surface.ROCK
		v = w.z
	if w.w > v:
		best = Surface.FOREST
	return best


func is_inside(x: float, z: float, margin := 0.0) -> bool:
	return absf(x) < half - margin and absf(z) < half - margin


func get_spawn() -> Dictionary:
	var s: Dictionary = meta.get("spawn", {})
	var p: Array = s.get("position", [0, 0, 0])
	var pos := Vector3(p[0], 0.0, p[2])
	pos.y = get_height(pos.x, pos.z)
	return {"position": pos, "heading": float(s.get("heading", 0.0))}
