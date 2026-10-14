shader_type spatial;
render_mode depth_draw_opaque, cull_back;
// Photoscanned alpine snow: powder, groomed corduroy and triplanar rock blended by splat map and
// slope, anti-tiled at two scales, wind-sculpted relief, snow translucency, view-dependent sparkle
// and cool sky-tinted shadows. Vertices are displaced from the height map (chunked LOD).

uniform sampler2D height_map : filter_nearest, repeat_disable;
uniform sampler2D normal_map_terrain : filter_linear_mipmap, repeat_disable;
uniform sampler2D splat_map : filter_linear_mipmap, repeat_disable;
uniform float terrain_size = 6000.0;
uniform int terrain_res = 2048;
uniform float terrain_spacing = 2.93;

uniform sampler2D snow_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D snow_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D snow_rough : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D packed_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D packed_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D packed_rough : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_albedo : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D macro_noise : filter_linear_mipmap, repeat_enable;
uniform sampler2D wind_normal : hint_normal, filter_linear_mipmap, repeat_enable;

uniform vec3 snow_tint : source_color = vec3(0.90, 0.93, 0.98);
uniform vec3 packed_tint : source_color = vec3(0.84, 0.88, 0.95);
uniform vec3 rock_tint : source_color = vec3(0.62, 0.58, 0.55);
uniform vec3 forest_tint : source_color = vec3(0.80, 0.84, 0.90);
uniform vec3 shadow_tint : source_color = vec3(0.30, 0.48, 0.95);
uniform float shadow_fill = 0.035;
uniform float sparkle_strength = 1.0;
uniform float translucency = 0.3;
uniform float detail_strength = 1.0;
uniform float corduroy_strength = 1.0;

varying vec3 world_pos;
varying float glint;
varying float snowiness;

vec2 terrain_uv(vec2 xz) {
	return ((xz + terrain_size * 0.5) / terrain_spacing + 0.5) / float(terrain_res);
}

vec3 terrain_normal(vec2 uv) {
	vec2 n = textureLod(normal_map_terrain, uv, 0.0).rg * 2.0 - 1.0;
	return normalize(vec3(n.x, sqrt(max(0.0, 1.0 - dot(n, n))), n.y));
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec2 rot2(vec2 p, float a) {
	float c = cos(a), s = sin(a);
	return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec3 unpack_n(vec4 t) {
	vec3 n = t.xyz * 2.0 - 1.0;
	return n;
}

// Perturb world normal N by a tangent-space normal sampled on the XZ plane.
vec3 apply_xz(vec3 N, vec3 tn, float k) {
	vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
	vec3 B = normalize(vec3(0.0, 0.0, 1.0) - N * N.z);
	return normalize(N + (T * tn.x - B * tn.y) * k);
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
	vec3 N = terrain_normal(uv);
	vec3 s = texture(splat_map, uv).rgb;
	float dist = length(world_pos - CAMERA_POSITION_WORLD);
	float near_f = 1.0 - smoothstep(120.0, 600.0, dist);
	float mid_f = 1.0 - smoothstep(600.0, 2200.0, dist);

	float m1 = texture(macro_noise, world_pos.xz * 0.0011).r;
	float m2 = texture(macro_noise, world_pos.xz * 0.0093 + 0.37).r;
	float m3 = texture(macro_noise, world_pos.xz * 0.061 + 0.71).r;

	// --- masks ---------------------------------------------------------------
	float groomed = smoothstep(0.25, 0.75, s.r);
	float forest = s.b;
	float rock_raw = s.g + (m2 - 0.5) * 0.5 * s.g + (m3 - 0.5) * 0.25 * s.g;
	// Snow clings to anything flat enough.
	float flatness = smoothstep(0.62, 0.86, N.y + (m3 - 0.5) * 0.14);
	float rock = smoothstep(0.32, 0.6, rock_raw) * (1.0 - flatness * 0.85);
	rock = clamp(rock, 0.0, 1.0);

	// --- powder (two scales, rotated) ------------------------------------------
	vec2 pa = world_pos.xz * 0.29;
	vec2 pb = rot2(world_pos.xz, 0.83) * 0.071;
	float ab = smoothstep(0.3, 0.7, m2);
	vec3 sa = texture(snow_albedo, pa).rgb;
	vec3 sb = texture(snow_albedo, pb).rgb;
	float lum = dot(mix(sa, sb, ab), vec3(0.3, 0.59, 0.11));
	vec3 powder = snow_tint * mix(0.93, 1.03, smoothstep(0.45, 0.95, lum));
	powder *= mix(0.95, 1.02, m1) * mix(0.97, 1.01, m3);
	vec3 pn = mix(unpack_n(texture(snow_normal, pa)), unpack_n(texture(snow_normal, pb)), ab);
	float pr = mix(texture(snow_rough, pa).r, texture(snow_rough, pb).r, ab);

	// --- groomed / packed --------------------------------------------------------
	vec2 ga = rot2(world_pos.xz, 0.31) * 0.23;
	vec3 ka = texture(packed_albedo, ga).rgb;
	float klum = dot(ka, vec3(0.3, 0.59, 0.11));
	vec3 packed = packed_tint * mix(0.94, 1.02, smoothstep(0.4, 0.9, klum));
	vec3 kn = unpack_n(texture(packed_normal, ga)) * vec3(0.6, 0.6, 1.0);
	float kr = texture(packed_rough, ga).r * 0.8;

	// Corduroy: fine ridges along the fall line, in 4.8 m groomer lanes.
	vec2 fall = normalize(N.xz + vec2(1e-4));
	vec2 perp = vec2(-fall.y, fall.x);
	float u = dot(world_pos.xz, perp);
	float lane = floor(u / 4.8);
	float lane_f = fract(u / 4.8);
	float ridge_w = fwidth(u / 0.045);
	float cord_fade = (1.0 - smoothstep(0.12, 0.45, ridge_w)) * corduroy_strength * (1.0 - smoothstep(6.0, 22.0, dist));
	float ridge = cos(u / 0.045 * 6.2832) * cord_fade;
	float lane_tone = (hash13(vec3(lane, 1.7, 3.1)) - 0.5) * 0.035;
	float lane_edge = smoothstep(0.03, 0.0, lane_f) + smoothstep(0.97, 1.0, lane_f);
	packed *= 1.0 + lane_tone * mid_f - lane_edge * 0.025 * near_f;

	// --- rock (triplanar, near detail + far crags) ------------------------------
	vec3 w = pow(abs(N), vec3(4.0));
	w /= (w.x + w.y + w.z);
	float far_rock = smoothstep(40.0, 320.0, dist);
	float rs = mix(0.13, 0.017, far_rock);
	vec3 rx = texture(rock_albedo, world_pos.zy * rs).rgb;
	vec3 ry = texture(rock_albedo, world_pos.xz * rs * 0.7).rgb;
	vec3 rz = texture(rock_albedo, world_pos.xy * rs).rgb;
	vec3 rcol = rx * w.x + ry * w.y + rz * w.z;
	float rl = dot(rcol, vec3(0.3, 0.59, 0.11));
	rcol = mix(vec3(rl), rcol, 0.4) * rock_tint * 1.3 * mix(0.8, 1.12, m2);
	vec3 tnx = unpack_n(texture(rock_normal, world_pos.zy * rs));
	vec3 tny = unpack_n(texture(rock_normal, world_pos.xz * rs * 0.7));
	vec3 tnz = unpack_n(texture(rock_normal, world_pos.xy * rs));
	float rk = mix(1.0, 1.8, far_rock);
	vec3 nx = vec3(tnx.xy * rk + N.zy, abs(tnx.z) * N.x);
	vec3 ny = vec3(tny.xy * rk + N.xz, abs(tny.z) * N.y);
	vec3 nz = vec3(tnz.xy * rk + N.xy, abs(tnz.z) * N.z);
	vec3 rock_n = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
	// Snow settles on ledges and in gullies of the rock faces, in strata.
	float strata = texture(macro_noise, vec2(world_pos.y * 0.021, m2 * 0.7 + world_pos.x * 0.0007)).r;
	float ledge = smoothstep(0.52, 0.7, strata + rock_n.y * 0.55 - 0.25) * smoothstep(0.35, 0.6, rock_n.y);
	rock *= 1.0 - ledge * 0.85;

	// --- compose ---------------------------------------------------------------
	vec3 snow_col = mix(powder, packed, groomed);
	snow_col = mix(snow_col, snow_col * forest_tint, forest * 0.6);
	vec3 snow_n = mix(pn, kn, groomed);
	float snow_r = mix(clamp(pr * 0.9, 0.45, 0.85), clamp(kr, 0.35, 0.7), groomed);

	vec3 Nw = apply_xz(N, snow_n, 0.9 * detail_strength * (0.35 + 0.65 * near_f));
	// Wind-sculpted sastrugi on ungroomed snow.
	vec3 wn = unpack_n(texture(wind_normal, rot2(world_pos.xz, 0.4) * vec2(0.035, 0.11)));
	Nw = apply_xz(Nw, wn, 0.35 * (1.0 - groomed) * (1.0 - forest) * mid_f);
	// Corduroy ridge slope.
	vec3 perp3 = normalize(vec3(perp.x, 0.0, perp.y) - N * dot(vec3(perp.x, 0.0, perp.y), N));
	Nw = normalize(Nw + perp3 * (-sin(u / 0.045 * 6.2832) * 0.12 * cord_fade * groomed));

	vec3 albedo = mix(snow_col, rcol, rock);
	vec3 n_final = normalize(mix(Nw, rock_n, rock));
	float rough = mix(snow_r, 0.82, rock);

	// Slight darkening in ridge troughs reads as corduroy from afar.
	albedo *= 1.0 - (ridge * 0.5 + 0.5) * 0.02 * groomed * cord_fade;

	ALBEDO = albedo;
	ROUGHNESS = rough;
	SPECULAR = 0.35;
	NORMAL = normalize((VIEW_MATRIX * vec4(n_final, 0.0)).xyz);

	snowiness = 1.0 - rock;
	// Sparkle: sparse ice crystals whose glint twinkles as the view moves.
	vec3 cell = floor(world_pos * 26.0);
	vec3 vq = floor(normalize(world_pos - CAMERA_POSITION_WORLD) * 9.0);
	float h1 = hash13(cell);
	float h2 = hash13(cell + vq * 17.0);
	glint = step(0.993, h1) * step(0.45, h2) * (1.0 - smoothstep(25.0, 90.0, dist)) * snowiness * sparkle_strength;
}

void light() {
	vec3 N = NORMAL;
	vec3 L = LIGHT;
	vec3 V = VIEW;
	vec3 H = normalize(L + V);
	float NdL = dot(N, L);
	float wrap = translucency * snowiness;
	float diff = max((NdL + wrap) / (1.0 + wrap), 0.0);
	float shade = ATTENUATION;
	DIFFUSE_LIGHT += diff * shade * LIGHT_COLOR / 3.14159;
	// Cool sky fill in shadowed snow keeps shadows blue rather than grey.
	DIFFUSE_LIGHT += shadow_tint * (1.0 - shade) * max(NdL, 0.0) * shadow_fill * LIGHT_COLOR / 3.14159 * snowiness;

	float r = max(ROUGHNESS, 0.08);
	float a2 = r * r * r * r;
	float NdH = max(dot(N, H), 0.0);
	float NdV = max(dot(N, V), 1e-3);
	float nl = max(NdL, 0.0);
	float d = NdH * NdH * (a2 - 1.0) + 1.0;
	float D = a2 / (3.14159 * d * d);
	float k = (r + 1.0) * (r + 1.0) / 8.0;
	float G = (NdV / (NdV * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
	float F = 0.03 + 0.97 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
	float spec = D * G * F / max(4.0 * NdV * nl, 1e-3);
	SPECULAR_LIGHT += spec * nl * shade * LIGHT_COLOR / 3.14159 * 0.6;
	SPECULAR_LIGHT += glint * pow(NdH, 60.0) * shade * LIGHT_COLOR * 1.2;
}
