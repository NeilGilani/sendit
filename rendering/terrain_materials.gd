class_name TerrainMaterials
extends RefCounted
## Assigns the photoscanned texture sets, generated noise and quality parameters to terrain materials.

const TEX := "res://assets/textures/"

static var _macro: NoiseTexture2D
static var _wind: NoiseTexture2D


static func macro_noise() -> NoiseTexture2D:
	if _macro == null:
		var n := FastNoiseLite.new()
		n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		n.frequency = 0.004
		n.fractal_octaves = 5
		n.seed = 11
		_macro = NoiseTexture2D.new()
		_macro.width = 512
		_macro.height = 512
		_macro.seamless = true
		_macro.generate_mipmaps = true
		_macro.noise = n
	return _macro


static func wind_normal() -> NoiseTexture2D:
	if _wind == null:
		var n := FastNoiseLite.new()
		n.noise_type = FastNoiseLite.TYPE_CELLULAR
		n.cellular_distance_function = FastNoiseLite.DISTANCE_EUCLIDEAN
		n.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
		n.frequency = 0.02
		n.fractal_type = FastNoiseLite.FRACTAL_FBM
		n.fractal_octaves = 3
		n.seed = 5
		_wind = NoiseTexture2D.new()
		_wind.width = 512
		_wind.height = 512
		_wind.seamless = true
		_wind.as_normal_map = true
		_wind.bump_strength = 6.0
		_wind.generate_mipmaps = true
		_wind.noise = n
	return _wind


static func setup_terrain(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("snow_albedo", load(TEX + "snow_02_diff_2k.jpg"))
	mat.set_shader_parameter("snow_normal", load(TEX + "snow_02_nor_gl_2k.jpg"))
	mat.set_shader_parameter("snow_rough", load(TEX + "snow_02_rough_2k.jpg"))
	mat.set_shader_parameter("packed_albedo", load(TEX + "snow_01_diff_2k.jpg"))
	mat.set_shader_parameter("packed_normal", load(TEX + "snow_01_nor_gl_2k.jpg"))
	mat.set_shader_parameter("packed_rough", load(TEX + "snow_01_rough_2k.jpg"))
	mat.set_shader_parameter("rock_albedo", load(TEX + "rock_face_03_diff_2k.jpg"))
	mat.set_shader_parameter("rock_normal", load(TEX + "rock_face_03_nor_gl_2k.jpg"))
	mat.set_shader_parameter("macro_noise", macro_noise())
	mat.set_shader_parameter("wind_normal", wind_normal())
	apply_quality(mat)


static func setup_far(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("rock_albedo", load(TEX + "rock_face_03_diff_2k.jpg"))
	mat.set_shader_parameter("macro_noise", macro_noise())


static func apply_quality(mat: ShaderMaterial) -> void:
	var q: int = GameState.settings.quality
	mat.set_shader_parameter("sparkle_strength", [0.0, 1.0, 1.0][q])
	mat.set_shader_parameter("detail_strength", [0.7, 1.0, 1.0][q])
	mat.set_shader_parameter("corduroy_strength", [0.6, 1.0, 1.0][q])
