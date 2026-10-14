class_name PowderSpray
extends Node3D
## Gentle powder spray from the skis when turning or braking, and a soft puff on landing.

var skier: Skier
var spray: GPUParticles3D
var puff: GPUParticles3D


func _ready() -> void:
	spray = _make(220, 1.4, false)
	var pm: ParticleProcessMaterial = spray.process_material
	pm.direction = Vector3(0, 0.55, 1)
	pm.spread = 28.0
	pm.initial_velocity_min = 1.0
	pm.initial_velocity_max = 3.2
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.25, 0.05, 0.6)
	spray.emitting = true
	spray.amount_ratio = 0.0
	add_child(spray)
	puff = _make(70, 1.8, true)
	var pp: ParticleProcessMaterial = puff.process_material
	pp.direction = Vector3(0, 1, 0)
	pp.spread = 80.0
	pp.initial_velocity_min = 0.8
	pp.initial_velocity_max = 2.4
	pp.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pp.emission_sphere_radius = 0.6
	add_child(puff)
	EventBus.player_landed.connect(_on_landed)


func _make(amount: int, life: float, one_shot: bool) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.one_shot = one_shot
	p.explosiveness = 0.9 if one_shot else 0.0
	p.local_coords = false
	p.emitting = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-8, -3, -8), Vector3(16, 8, 16))
	var pm := ParticleProcessMaterial.new()
	pm.gravity = Vector3(0, -2.2, 0)
	pm.damping_min = 1.5
	pm.damping_max = 3.0
	pm.scale_min = 0.6
	pm.scale_max = 1.4
	var sc := Curve.new()
	sc.add_point(Vector2(0, 0.35))
	sc.add_point(Vector2(1, 1.0))
	var sct := CurveTexture.new()
	sct.curve = sc
	pm.scale_curve = sct
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0.55))
	g.set_color(1, Color(1, 1, 1, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.4
	p.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(0.45, 0.45)
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = SoftSprite.texture()
	m.albedo_color = Color(0.97, 0.98, 1.0)
	m.roughness = 1.0
	m.backlight_enabled = true
	m.backlight = Color(0.6, 0.55, 0.5)
	m.proximity_fade_enabled = true
	m.proximity_fade_distance = 0.4
	quad.material = m
	p.draw_pass_1 = quad
	return p


func _process(dt: float) -> void:
	if skier == null:
		return
	global_position = skier.global_position + Vector3(0, 0.05, 0)
	# Spray leaves behind and to the outside of the turn.
	var fwd := skier.forward_dir()
	var back := -fwd
	var side := Vector3(-fwd.z, 0, fwd.x) * signf(skier.carve + 0.0001)
	var dir := (back + side * 0.8 * absf(skier.carve) + Vector3(0, 0.3, 0)).normalized()
	if dir.length_squared() > 0.1:
		global_basis = Basis.looking_at(-dir, Vector3.UP)
	var on := skier.state == Skier.State.GROUNDED
	var powder := skier.surface.y + skier.surface.x * 0.35
	var intensity := (skier.skid * 1.1 + absf(skier.carve) * 0.35) * clampf(skier.speed / 12.0, 0.0, 1.0) * powder
	if skier.state == Skier.State.CRASH:
		intensity = 0.8
		on = true
	var target := clampf(intensity, 0.0, 1.0) if on else 0.0
	spray.amount_ratio = lerpf(spray.amount_ratio, target, 1.0 - exp(-8.0 * dt))


func _on_landed(impact: float, _air: float) -> void:
	if impact < 1.5:
		return
	puff.global_position = skier.global_position + Vector3(0, 0.2, 0)
	puff.amount_ratio = clampf(impact / 8.0, 0.3, 1.0)
	puff.restart()
	puff.emitting = true
