class_name Atmosphere
extends Node3D
## Golden-hour light and air: physically based sky, low warm sun, aerial perspective, valley fog,
## AgX tonemapping, soft bloom and the Low/Medium/High quality presets. Also owns light snowfall.

const SUN_ELEVATION := 14.0
const SUN_YAW := -105.0  # light travels toward ESE: the sun sits low in the WNW

var env: Environment
var world_env: WorldEnvironment
var sun: DirectionalLight3D
var sky_mat: ShaderMaterial
var snowfall: GPUParticles3D


func _ready() -> void:
	_build_sky()
	_build_sun()
	_build_snowfall()
	EventBus.settings_changed.connect(apply_quality)
	apply_quality()


func _build_sky() -> void:
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = load("res://rendering/sky.gdshader")
	sky_mat.set_shader_parameter("cloud_noise", _cloud_tex(0.006, 21, 6))
	sky_mat.set_shader_parameter("cloud_detail", _cloud_tex(0.03, 77, 4))
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.process_mode = Sky.PROCESS_MODE_QUALITY
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.55
	env.ambient_light_sky_contribution = 1.0
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 0.95
	env.tonemap_white = 6.0
	# Soft bloom on the sun-lit snow and the sun itself.
	env.glow_enabled = true
	env.glow_normalized = true
	env.glow_intensity = 0.55
	env.glow_strength = 0.9
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.1
	env.glow_hdr_scale = 1.6
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	for i in 7:
		env.set_glow_level(i, [0.0, 0.0, 1.0, 0.9, 0.7, 0.5, 0.3][i])
	# Aerial perspective + valley fog.
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = Color(0.68, 0.74, 0.88)
	env.fog_light_energy = 1.0
	env.fog_sun_scatter = 0.35
	env.fog_density = 0.00009
	env.fog_aerial_perspective = 0.85
	env.fog_sky_affect = 0.0
	env.fog_height = 2350.0
	env.fog_height_density = 0.0028
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.05
	env.adjustment_contrast = 1.03
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)


func _cloud_tex(freq: float, seed_: int, octaves: int) -> NoiseTexture2D:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = freq
	n.fractal_octaves = octaves
	n.fractal_gain = 0.55
	n.seed = seed_
	var t := NoiseTexture2D.new()
	t.width = 1024
	t.height = 1024
	t.seamless = true
	t.generate_mipmaps = true
	t.normalize = true
	t.noise = n
	return t


func _build_sun() -> void:
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-SUN_ELEVATION, SUN_YAW, 0)
	# Low sun through a lot of air: warm, a touch of rose.
	sun.light_color = Color(1.0, 0.7, 0.46)
	sun.light_energy = 4.6
	sun.light_indirect_energy = 1.2
	sun.light_volumetric_fog_energy = 1.5
	sun.shadow_enabled = true
	sun.shadow_blur = 1.2
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.6
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_blend_splits = true
	sun.directional_shadow_fade_start = 0.85
	add_child(sun)


func _build_snowfall() -> void:
	snowfall = GPUParticles3D.new()
	snowfall.name = "Snowfall"
	snowfall.amount = 5000
	snowfall.lifetime = 9.0
	snowfall.preprocess = 9.0
	snowfall.visibility_aabb = AABB(Vector3(-45, -30, -45), Vector3(90, 60, 90))
	snowfall.local_coords = false
	snowfall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(40, 2, 40)
	pm.direction = Vector3(0.15, -1, 0.05)
	pm.spread = 12.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 1.3
	pm.gravity = Vector3(0, -0.25, 0)
	pm.damping_min = 0.1
	pm.damping_max = 0.3
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.6
	pm.turbulence_noise_scale = 6.0
	pm.turbulence_influence_min = 0.05
	pm.turbulence_influence_max = 0.15
	pm.scale_min = 0.5
	pm.scale_max = 1.2
	snowfall.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(0.035, 0.035)
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.albedo_texture = SoftSprite.texture()
	m.albedo_color = Color(1.0, 0.97, 0.95, 0.85)
	m.proximity_fade_enabled = true
	m.proximity_fade_distance = 0.5
	quad.material = m
	snowfall.draw_pass_1 = quad
	snowfall.emitting = false
	add_child(snowfall)


func _process(_dt: float) -> void:
	if snowfall.emitting:
		var cam := get_viewport().get_camera_3d()
		if cam:
			snowfall.global_position = cam.global_position + Vector3(0, 14, 0) - cam.global_basis.z * 12.0


func apply_quality() -> void:
	var q: int = GameState.settings.quality
	var vp := get_viewport()
	# Shadows
	sun.directional_shadow_max_distance = [220.0, 520.0, 1100.0][q]
	sun.directional_shadow_split_1 = [0.06, 0.05, 0.04][q]
	sun.directional_shadow_split_2 = [0.18, 0.14, 0.12][q]
	sun.directional_shadow_split_3 = [0.45, 0.4, 0.35][q]
	sun.light_angular_distance = [0.0, 0.0, 0.6][q]
	RenderingServer.directional_shadow_atlas_set_size([2048, 4096, 8192][q], true)
	RenderingServer.directional_soft_shadow_filter_set_quality([1, 3, 4][q])
	# Screen-space effects
	env.ssao_enabled = q >= 1
	env.ssao_radius = 1.6
	env.ssao_intensity = 1.6
	env.ssao_power = 1.4
	env.ssao_detail = 0.6
	env.ssil_enabled = q >= 2
	env.ssil_radius = 4.0
	env.ssil_intensity = 0.8
	env.ssr_enabled = false
	# Global illumination only on High.
	env.sdfgi_enabled = q >= 2
	env.sdfgi_use_occlusion = true
	env.sdfgi_cascades = 6
	env.sdfgi_min_cell_size = 0.4
	env.sdfgi_energy = 0.8
	env.sdfgi_bounce_feedback = 0.4
	env.sdfgi_read_sky_light = true
	# Volumetric light shafts on High.
	env.volumetric_fog_enabled = q >= 2
	env.volumetric_fog_density = 0.0012
	env.volumetric_fog_albedo = Color(0.92, 0.94, 1.0)
	env.volumetric_fog_anisotropy = 0.65
	env.volumetric_fog_length = 260.0
	env.volumetric_fog_ambient_inject = 0.25
	env.volumetric_fog_sky_affect = 0.0
	env.glow_enabled = true
	if vp:
		vp.msaa_3d = Viewport.MSAA_DISABLED
		vp.use_taa = q >= 1
		vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if q == 0 else Viewport.SCREEN_SPACE_AA_DISABLED
		vp.mesh_lod_threshold = [2.5, 1.2, 0.6][q]
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if q == 0 else Viewport.SCALING_3D_MODE_BILINEAR
		vp.scaling_3d_scale = 0.77 if q == 0 else 1.0
		vp.anisotropic_filtering_level = [Viewport.ANISOTROPY_4X, Viewport.ANISOTROPY_8X, Viewport.ANISOTROPY_16X][q]
	RenderingServer.environment_set_ssao_quality([RenderingServer.ENV_SSAO_QUALITY_LOW, RenderingServer.ENV_SSAO_QUALITY_MEDIUM, RenderingServer.ENV_SSAO_QUALITY_HIGH][q], true, 0.5, 2, 50, 300)
	RenderingServer.environment_set_volumetric_fog_volume_size(96, 64)
	if Terrain.instance and Terrain.instance.material:
		TerrainMaterials.apply_quality(Terrain.instance.material)
	snowfall.emitting = GameState.settings.snowfall
	snowfall.amount = [2000, 4000, 7000][q]
