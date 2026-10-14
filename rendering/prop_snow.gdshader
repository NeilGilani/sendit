shader_type spatial;
// Bark and rocks with world-space snow caps.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D normal_tex : hint_normal;
uniform bool use_normal = false;
uniform float snow_amount = 0.9;
uniform vec3 snow_color : source_color = vec3(0.93, 0.95, 1.0);

varying vec3 w_normal;
varying vec3 w_pos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	w_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb * albedo_color.rgb;
	float n = vnoise(w_pos.xz * 1.7 + w_pos.y) * 0.35;
	float snow = smoothstep(0.35, 0.65, w_normal.y + n - 0.1) * snow_amount;
	ALBEDO = mix(base * 0.9, snow_color, snow);
	ROUGHNESS = mix(0.9, 0.55, snow);
	if (use_normal) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
		NORMAL_MAP_DEPTH = 1.0 - snow;
	}
}
