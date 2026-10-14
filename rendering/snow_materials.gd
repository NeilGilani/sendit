class_name SnowMaterials
extends RefCounted
## Builds snow-dusted materials for scattered props from their original glTF materials.

static var _cache := {}


static func make_for(src: Material, foliage: bool) -> Material:
	var key := [src, foliage]
	if _cache.has(key):
		return _cache[key]
	var mat := ShaderMaterial.new()
	var is_leaf := foliage and src is BaseMaterial3D and (src as BaseMaterial3D).transparency != BaseMaterial3D.TRANSPARENCY_DISABLED
	if src is BaseMaterial3D and (src as BaseMaterial3D).resource_name.to_lower().contains("lea"):
		is_leaf = foliage
	mat.shader = load("res://rendering/foliage_snow.gdshader" if is_leaf else "res://rendering/prop_snow.gdshader")
	if src is BaseMaterial3D:
		var b := src as BaseMaterial3D
		mat.set_shader_parameter("albedo_tex", b.albedo_texture)
		mat.set_shader_parameter("albedo_color", b.albedo_color)
		if b.normal_enabled and b.normal_texture:
			mat.set_shader_parameter("normal_tex", b.normal_texture)
			mat.set_shader_parameter("use_normal", true)
		if b.roughness_texture:
			mat.set_shader_parameter("rough_tex", b.roughness_texture)
			mat.set_shader_parameter("use_rough", true)
	mat.set_shader_parameter("snow_amount", 0.75 if foliage else 0.85)
	mat.set_shader_parameter("desaturate", 0.2 if foliage else 0.4)
	_cache[key] = mat
	return mat
