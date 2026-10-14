shader_type spatial;
// Turns baked clothing zones (COLOR: R jacket, G pants, B gloves/boots, A coverage) into a ski outfit.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D normal_tex : hint_normal;
uniform sampler2D rough_tex : hint_default_white;
uniform vec3 jacket_color : source_color = vec3(0.13, 0.42, 0.45);
uniform vec3 jacket_accent : source_color = vec3(0.93, 0.62, 0.32);
uniform vec3 pants_color : source_color = vec3(0.12, 0.13, 0.16);
uniform vec3 dark_color : source_color = vec3(0.06, 0.06, 0.07);

varying vec4 zone;
varying vec3 obj_pos;

void vertex() {
	zone = COLOR;
	obj_pos = VERTEX;
	VERTEX += NORMAL * zone.a * (0.01 + zone.r * 0.014 + zone.g * 0.006);
}

void fragment() {
	vec3 skin = texture(albedo_tex, UV).rgb;
	float tot = max(zone.r + zone.g + zone.b, 0.001);
	vec3 jacket = jacket_color;
	// A soft amber band across the chest and sleeves (fictional "Northwake" shell).
	float band = smoothstep(0.012, 0.0, abs(obj_pos.y - 1.33)) * step(0.5, zone.r / tot);
	jacket = mix(jacket, jacket_accent, band);
	vec3 cloth = (jacket * zone.r + pants_color * zone.g + dark_color * zone.b) / tot;
	ALBEDO = mix(skin, cloth, zone.a);
	ROUGHNESS = mix(texture(rough_tex, UV).r, 0.72, zone.a);
	NORMAL_MAP = texture(normal_tex, UV).rgb;
	NORMAL_MAP_DEPTH = mix(1.0, 0.18, zone.a);
	RIM = zone.a * 0.25;
	RIM_TINT = 0.6;
	SSS_STRENGTH = (1.0 - zone.a) * 0.3;
}
