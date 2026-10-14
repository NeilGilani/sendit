shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;
// Spruce needles: alpha-cut cards re-coloured to a deep alpine green, snow loaded on upward-facing
// branches in clumps, warm translucency against a low sun and a slow breeze.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D normal_tex : hint_normal;
uniform bool use_normal = false;
uniform sampler2D rough_tex : hint_default_white;
uniform bool use_rough = false;
uniform float snow_amount = 0.75;
uniform vec3 needle_color : source_color = vec3(0.075, 0.12, 0.09);
uniform vec3 snow_color : source_color = vec3(0.90, 0.93, 0.98);
uniform float sway = 0.05;

varying vec3 w_normal;
varying vec3 w_pos;
varying float h01;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
	vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void vertex() {
	vec3 origin = MODEL_MATRIX[3].xyz;
	float ph = hash(origin) * 6.283;
	float bend = max(VERTEX.y - 1.5, 0.0) * 0.02;
	VERTEX.x += sin(TIME * 0.6 + ph) * sway * bend;
	VERTEX.z += cos(TIME * 0.47 + ph) * sway * bend * 0.7;
	w_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	h01 = clamp(VERTEX.y / 8.0, 0.0, 1.0);
}

void fragment() {
	vec4 a = texture(albedo_tex, UV) * albedo_color;
	float lum = dot(a.rgb, vec3(0.3, 0.59, 0.11));
	vec3 n = w_normal * (FRONT_FACING ? 1.0 : -1.0);
	float clump = vnoise(w_pos * 2.2) * 0.6 + vnoise(w_pos * 7.0) * 0.4;
	float snow = smoothstep(0.55, 0.85, n.y * 0.5 + 0.5 + (clump - 0.5) * 0.55) * snow_amount;
	vec3 needles = needle_color * (0.55 + lum * 1.1) * mix(0.6, 1.05, h01);
	ALBEDO = mix(needles, snow_color, snow);
	ALPHA = a.a;
	ALPHA_SCISSOR_THRESHOLD = 0.45;
	ROUGHNESS = mix(0.8, 0.62, snow);
	BACKLIGHT = mix(vec3(0.25, 0.3, 0.12), vec3(0.35, 0.32, 0.3), snow);
	if (use_normal) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
	}
}
