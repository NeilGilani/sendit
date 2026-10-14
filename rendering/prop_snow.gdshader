shader_type spatial;
// Photoscanned bark and rocks with world-space snow caps that fill hollows and sit on top faces.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D normal_tex : hint_normal;
uniform bool use_normal = false;
uniform sampler2D rough_tex : hint_default_white;
uniform bool use_rough = false;
uniform float snow_amount = 0.9;
uniform float desaturate = 0.35;
uniform vec3 snow_color : source_color = vec3(0.90, 0.93, 0.98);

varying vec3 w_normal;
varying vec3 w_pos;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
	vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void vertex() {
	w_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb * albedo_color.rgb;
	float l = dot(base, vec3(0.3, 0.59, 0.11));
	base = mix(base, vec3(l), desaturate);
	float n = vnoise(w_pos * 1.3) * 0.5 + vnoise(w_pos * 5.0) * 0.25;
	float snow = smoothstep(0.42, 0.62, w_normal.y + n * 0.6 - 0.25) * snow_amount;
	ALBEDO = mix(base, snow_color, snow);
	float r = use_rough ? texture(rough_tex, UV).g : 0.85;
	ROUGHNESS = mix(r, 0.6, snow);
	if (use_normal) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
		NORMAL_MAP_DEPTH = 1.0 - snow * 0.8;
	}
}
