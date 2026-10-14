shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled;
// Carved ski grooves: a shallow V pressed into the snow, fading out with age.
// Mesh tangent points across the groove, so NORMAL_MAP.x tilts the walls.
uniform vec3 groove_color : source_color = vec3(0.66, 0.74, 0.88);

varying float across;
varying float age;
varying float strength;

void vertex() {
	across = UV.y * 2.0 - 1.0;
	age = UV.x;
	strength = COLOR.a;
}

void fragment() {
	float edge = 1.0 - smoothstep(0.6, 1.0, abs(across));
	float fade = 1.0 - smoothstep(0.55, 1.0, age);
	ALBEDO = groove_color * mix(0.92, 1.0, abs(across));
	ROUGHNESS = 0.75;
	NORMAL_MAP = vec3(0.5 - across * 0.32, 0.5, 1.0);
	ALPHA = edge * fade * strength * 0.5;
}
