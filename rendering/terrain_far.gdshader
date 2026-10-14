shader_type spatial;
render_mode depth_draw_opaque, cull_back;
// Backdrop terrain (30 km): snowfields, triplanar rock faces and snowy forest in the low valleys.
// Sinks under the playable square so only the surrounding peaks show.
uniform sampler2D far_map : filter_nearest, repeat_disable;
uniform float far_size = 30000.0;
uniform int far_res = 512;
uniform float near_half = 3000.0;
uniform sampler2D rock_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D macro_noise : filter_linear_mipmap, repeat_enable;
uniform vec3 snow_tint : source_color = vec3(0.90, 0.93, 0.98);
uniform vec3 rock_tint : source_color = vec3(0.62, 0.58, 0.55);
uniform vec3 forest_color : source_color = vec3(0.16, 0.2, 0.19);
uniform vec3 shadow_tint : source_color = vec3(0.30, 0.48, 0.95);

varying vec3 world_pos;
varying vec3 w_normal;

float fh(vec2 xz) {
	vec2 f = (xz + far_size * 0.5) / far_size * float(far_res - 1);
	ivec2 i = ivec2(floor(f));
	vec2 t = fract(f);
	ivec2 m = ivec2(far_res - 1);
	float a = texelFetch(far_map, clamp(i, ivec2(0), m), 0).r;
	float b = texelFetch(far_map, clamp(i + ivec2(1, 0), ivec2(0), m), 0).r;
	float c = texelFetch(far_map, clamp(i + ivec2(0, 1), ivec2(0), m), 0).r;
	float d = texelFetch(far_map, clamp(i + ivec2(1, 1), ivec2(0), m), 0).r;
	return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float e = far_size / float(far_res - 1);
	float h = fh(wp.xz);
	vec3 n = normalize(vec3(fh(wp.xz - vec2(e, 0.0)) - fh(wp.xz + vec2(e, 0.0)), 2.0 * e,
		fh(wp.xz - vec2(0.0, e)) - fh(wp.xz + vec2(0.0, e))));
	float inside = 1.0 - smoothstep(near_half - 160.0, near_half - 30.0, max(abs(wp.x), abs(wp.z)));
	VERTEX.y = h - inside * 90.0 - 2.0;
	NORMAL = n;
	w_normal = n;
	world_pos = vec3(wp.x, h, wp.z);
}

void fragment() {
	vec3 N = normalize(w_normal);
	float m = texture(macro_noise, world_pos.xz * 0.0004).r;
	float m2 = texture(macro_noise, world_pos.xz * 0.003 + 0.5).r;
	float slope = 1.0 - N.y;
	float rock = smoothstep(0.26, 0.42, slope + (m2 - 0.5) * 0.18);
	vec3 w = pow(abs(N), vec3(4.0));
	w /= (w.x + w.y + w.z);
	vec3 rc = texture(rock_albedo, world_pos.zy * 0.02).rgb * w.x + texture(rock_albedo, world_pos.xz * 0.02).rgb * w.y
		+ texture(rock_albedo, world_pos.xy * 0.02).rgb * w.z;
	float rl = dot(rc, vec3(0.3, 0.59, 0.11));
	rc = mix(vec3(rl), rc, 0.45) * rock_tint * 1.3;
	float forest = (1.0 - smoothstep(1950.0, 2250.0, world_pos.y + (m - 0.5) * 300.0)) * (1.0 - rock) * smoothstep(0.03, 0.12, slope);
	vec3 col = snow_tint * mix(0.94, 1.02, m);
	col = mix(col, forest_color * mix(0.8, 1.2, m2) + vec3(0.12) * (1.0 - slope * 2.0), forest * 0.8);
	col = mix(col, rc, rock);
	ALBEDO = col;
	ROUGHNESS = mix(0.7, 0.9, rock);
	SPECULAR = 0.3;
}
