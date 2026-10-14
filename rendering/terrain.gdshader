shader_type spatial;
// Phase 2 placeholder terrain shading; replaced by the full snow shader in phase 6.
uniform sampler2D height_map : filter_nearest, repeat_disable;
uniform sampler2D normal_map_terrain : filter_linear_mipmap, repeat_disable;
uniform sampler2D splat_map : filter_linear_mipmap, repeat_disable;
uniform float terrain_size = 6000.0;
uniform int terrain_res = 2048;
uniform float terrain_spacing = 2.93;

varying vec3 world_pos;

vec2 terrain_uv(vec2 xz) {
	return ((xz + terrain_size * 0.5) / terrain_spacing + 0.5) / float(terrain_res);
}

vec3 terrain_normal(vec2 uv) {
	vec2 n = textureLod(normal_map_terrain, uv, 0.0).rg * 2.0 - 1.0;
	return normalize(vec3(n.x, sqrt(max(0.0, 1.0 - dot(n, n))), n.y));
}

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	ivec2 t = clamp(ivec2(round((wp.xz + terrain_size * 0.5) / terrain_spacing)), ivec2(0), ivec2(terrain_res - 1));
	float h = texelFetch(height_map, t, 0).r;
	float edge = step(terrain_size * 0.5 - 1.0, max(abs(wp.x), abs(wp.z)));
	VERTEX.y = h - UV2.x * mix(6.0 + 4.0 * UV2.y, 150.0, edge);
	NORMAL = terrain_normal(terrain_uv(wp.xz));
	world_pos = vec3(wp.x, VERTEX.y, wp.z);
}

void fragment() {
	vec2 uv = terrain_uv(world_pos.xz);
	vec3 s = texture(splat_map, uv).rgb;
	vec3 col = mix(vec3(0.93, 0.95, 1.0), vec3(0.86, 0.9, 0.98), s.r);
	col = mix(col, vec3(0.32, 0.30, 0.29), s.g);
	col = mix(col, vec3(0.55, 0.6, 0.6), s.b * 0.5);
	ALBEDO = col;
	ROUGHNESS = 0.8;
	NORMAL = normalize((VIEW_MATRIX * vec4(terrain_normal(uv), 0.0)).xyz);
}
