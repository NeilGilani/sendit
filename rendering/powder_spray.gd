class_name PowderSpray
extends Node3D
## Snow particles for every action: carve spray from the edges, a pop at take-off, a soft puff on
## landing, a ring burst on perfect landings, and hot sparks while grinding metal.

var skier: Skier
var spray: GPUParticles3D
var puff: GPUParticles3D
var pop: GPUParticles3D
var ring: GPUParticles3D
var sparks: GPUParticles3D


func _ready() -> void:
	spray = _make(260, 1.4, false, 0.45)
	var pm: ParticleProcessMaterial = spray.process_material
	pm.direction = Vector3(0, 0.55, 1)
	pm.spread = 28.0
	pm.initial_velocity_min = 1.0
	pm.initial_velocity_max = 3.6
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.25, 0.05, 0.6)
	spray.emitting = true
	spray.amount_ratio = 0.0
	add_child(spray)
	puff = _burst(90, 1.8, Vector3.UP, 80.0, 0.8, 2.6, ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, 0.6)
	pop = _burst(40, 1.0, Vector3.UP, 55.0, 1.2, 3.0, ParticleProcessMaterial.EMISSION_SHAPE_SPHERE, 0.3)
	ring = _burst(160, 1.3, Vector3(0, 0.15, 0), 5.0, 6.0, 9.0, ParticleProcessMaterial.EMISSION_SHAPE_RING, 0.4)
	var rp: ParticleProcessMaterial = ring.process_material
	rp.emission_ring_axis = Vector3.UP
	rp.emission_ring_radius = 0.6
	rp.emission_ring_inner_radius = 0.4
	rp.emission_ring_height = 0.1
	rp.radial_velocity_min = 6.0
	rp.radial_velocity_max = 9.0
	rp.initial_velocity_min = 0.5
	rp.initial_velocity_max = 1.5
	rp.damping_min = 4.0
	rp.damping_max = 6.0
	sparks = _make(120, 0.5, false, 0.08)
	var sp: ParticleProcessMaterial = sparks.process_material
	sp.direction = Vector3(0, 0.6, 1)
	sp.spread = 35.0
	sp.initial_velocity_min = 2.5
	sp.initial_velocity_max = 6.0
	sp.gravity = Vector3(0, -9.0, 0)
	sp.damping_min = 0.5
	sp.damping_max = 1.0
	var sm: StandardMaterial3D = (sparks.draw_pass_1 as QuadMesh).material
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.albedo_color = Color(1.0, 0.75, 0.35)
	sm.emission_enabled = true
	sm.emission = Color(1.0, 0.6, 0.25)
	sm.emission_energy_multiplier = 6.0
	var g := Gradient.new()
	g.set_color(0, Color(1, 0.9, 0.6, 1))
	g.set_color(1, Color(1, 0.4, 0.1, 0))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	sp.color_ramp = gt
	sparks.emitting = true
	sparks.amount_ratio = 0.0
	add_child(sparks)
	EventBus.player_landed.connect(_on_landed)
	EventBus.player_jumped.connect(_on_jumped)
	EventBus.perfect_landing.connect(_on_perfect)


func _make(amount: int, life: float, one_shot: bool, size: float) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.one_shot = one_shot
	p.explosiveness = 0.95 if one_shot else 0.0
	p.local_coords = false
	p.emitting = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-12, -4, -12), Vector3(24, 10, 24))
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
	g.set_color(0, Color(1, 1, 1, 0.6))
	g.set_color(1, Color(1, 1, 1, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.4
	p.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(size, size)
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


func _burst(amount: int, life: float, dir: Vector3, spread: float, vmin: float, vmax: float, shape: int, radius: float) -> GPUParticles3D:
	var p := _make(amount, life, true, 0.55)
	var pm: ParticleProcessMaterial = p.process_material
	pm.direction = dir
	pm.spread = spread
	pm.initial_velocity_min = vmin
	pm.initial_velocity_max = vmax
	pm.emission_shape = shape
	pm.emission_sphere_radius = radius
	add_child(p)
	return p


func _process(dt: float) -> void:
	if skier == null:
		return
	global_position = skier.global_position + Vector3(0, 0.05, 0)
	var fwd := skier.forward_dir()
	var back := -fwd
	var side := Vector3(-fwd.z, 0, fwd.x) * signf(skier.carve + 0.0001)
	var dir := (back + side * 0.8 * absf(skier.carve) + Vector3(0, 0.3, 0)).normalized()
	spray.global_basis = Basis.looking_at(-dir, Vector3.UP)
	sparks.global_basis = Basis.looking_at(fwd if fwd.length_squared() > 0.1 else Vector3.FORWARD, Vector3.UP)
	var on := skier.state == Skier.State.GROUNDED
	var powder := skier.surface.y + skier.surface.x * 0.35
	var intensity := (skier.skid * 1.2 + absf(skier.carve) * 0.5) * clampf(skier.speed / 12.0, 0.0, 1.0) * powder
	if skier.boosting and on:
		intensity = maxf(intensity, 0.5)
	if skier.state == Skier.State.CRASH:
		intensity = 0.8
		on = true
	spray.amount_ratio = lerpf(spray.amount_ratio, clampf(intensity, 0.0, 1.0) if on else 0.0, 1.0 - exp(-8.0 * dt))
	var grinding := skier.state == Skier.State.GRIND and skier.grind_metal
	sparks.amount_ratio = lerpf(sparks.amount_ratio, clampf(skier.speed / 10.0, 0.3, 1.0) if grinding else 0.0, 1.0 - exp(-12.0 * dt))


func _fire(p: GPUParticles3D, ratio: float) -> void:
	p.global_position = skier.global_position + Vector3(0, 0.2, 0)
	p.amount_ratio = clampf(ratio, 0.2, 1.0)
	p.restart()
	p.emitting = true


func _on_landed(impact: float, _air: float) -> void:
	if impact > 1.5:
		_fire(puff, impact / 8.0)


func _on_jumped(charge: float) -> void:
	_fire(pop, 0.4 + charge * 0.6)


func _on_perfect() -> void:
	_fire(ring, 1.0)
