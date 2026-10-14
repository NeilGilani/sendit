shader_type spatial;
// Backdrop terrain (30 km). Sinks under the playable area.
uniform sampler2D far_map : filter_nearest, repeat_disable;
uniform float far_size = 30000.0;
uniform int far_res = 512;
uniform float near_half = 3000.0;

varying vec3 world_pos;
varying float slope;

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
	float inside = 1.0 - smoothstep(near_half - 140.0, near_half - 20.0, max(abs(wp.x), abs(wp.z)));
	VERTEX.y = h - inside * 80.0 - 1.5;
	NORMAL = n;
	slope = 1.0 - n.y;
	world_pos = vec3(wp.x, h, wp.z);
}

void fragment() {
	float rock = smoothstep(0.22, 0.4, slope);
	float low = 1.0 - smoothstep(1700.0, 2300.0, world_pos.y);
	vec3 col = mix(vec3(0.92, 0.94, 0.99), vec3(0.33, 0.31, 0.3), rock);
	col = mix(col, vec3(0.42, 0.47, 0.45), low * 0.55 * (1.0 - rock));
	ALBEDO = col;
	ROUGHNESS = 0.85;
}
