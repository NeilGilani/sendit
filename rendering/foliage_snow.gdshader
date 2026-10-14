shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;
// Pine needles with alpha-cut cards, settled snow on upward faces, and a slow breeze.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D normal_tex : hint_normal;
uniform bool use_normal = false;
uniform float snow_amount = 0.75;
uniform vec3 snow_color : source_color = vec3(0.93, 0.95, 1.0);
uniform float sway = 0.06;

varying vec3 w_normal;
varying float h01;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void vertex() {
	vec3 origin = MODEL_MATRIX[3].xyz;
	float ph = hash(origin.xz) * 6.283;
	float bend = max(VERTEX.y - 1.5, 0.0) * 0.02;
	VERTEX.x += sin(TIME * 0.6 + ph) * sway * bend;
	VERTEX.z += cos(TIME * 0.47 + ph) * sway * bend * 0.7;
	w_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	h01 = clamp(VERTEX.y / 8.0, 0.0, 1.0);
}

void fragment() {
	vec4 a = texture(albedo_tex, UV) * albedo_color;
	vec3 n = w_normal * (FRONT_FACING ? 1.0 : -1.0);
	float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
	float snow = smoothstep(0.42, 0.8, up + (hash(floor(UV * 64.0)) - 0.5) * 0.25) * snow_amount;
	vec3 needles = a.rgb * vec3(0.62, 0.78, 0.72) * mix(0.55, 1.0, h01);
	ALBEDO = mix(needles, snow_color, snow);
	ALPHA = a.a;
	ALPHA_SCISSOR_THRESHOLD = 0.45;
	ROUGHNESS = mix(0.85, 0.6, snow);
	SSS_STRENGTH = snow * 0.2;
	BACKLIGHT = vec3(0.12, 0.16, 0.1) * (1.0 - snow);
	if (use_normal) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
	}
}
