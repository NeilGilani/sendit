shader_type canvas_item;
// Full-screen post pass on top of the 3D view: radial motion blur and speed lines at high speed,
// chromatic aberration on boosts, impact flash, vignette and colour filters (photo mode / presets).
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float speed_amount : hint_range(0.0, 1.0) = 0.0;
uniform float chroma : hint_range(0.0, 1.0) = 0.0;
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform float vignette : hint_range(0.0, 1.0) = 0.25;
uniform float saturation = 1.0;
uniform float contrast = 1.0;
uniform vec3 tint = vec3(1.0);
uniform float mono = 0.0;
uniform float grain = 0.0;
uniform float letterbox = 0.0;
uniform vec2 focus = vec2(0.5, 0.48);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 d = uv - focus;
	float r = length(d);
	vec3 col = vec3(0.0);
	// Radial blur grows toward the edges with speed.
	float blur = speed_amount * smoothstep(0.12, 0.7, r) * 0.045;
	float ca = chroma * 0.006 + speed_amount * 0.0015;
	const int TAPS = 8;
	for (int i = 0; i < TAPS; i++) {
		float t = float(i) / float(TAPS - 1);
		vec2 o = -d * blur * t;
		col.r += texture(screen_tex, uv + o + d * ca).r;
		col.g += texture(screen_tex, uv + o).g;
		col.b += texture(screen_tex, uv + o - d * ca).b;
	}
	col /= float(TAPS);
	// Speed lines: thin bright streaks rushing outward near the frame edge.
	float ang = atan(d.y, d.x);
	float lane = floor(ang * 70.0);
	float seed = hash(vec2(lane, 3.7));
	float travel = fract(seed * 13.0 - TIME * (1.4 + seed * 2.0));
	float streak = smoothstep(0.012, 0.0, abs(fract(ang * 70.0) - 0.5) * 0.04) ;
	float along = smoothstep(0.0, 0.25, fract(r * 1.6 - travel)) * smoothstep(1.0, 0.6, fract(r * 1.6 - travel));
	float lines = streak * along * step(0.72, seed) * smoothstep(0.28, 0.75, r);
	col += vec3(1.0, 0.98, 0.95) * lines * speed_amount * 0.35;
	// Grading
	float l = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(l), col, saturation);
	col = mix(col, vec3(l), mono);
	col = (col - 0.5) * contrast + 0.5;
	col *= tint;
	col += (hash(uv * 1000.0 + TIME) - 0.5) * grain;
	col *= 1.0 - vignette * smoothstep(0.35, 0.9, r);
	col = mix(col, vec3(1.0), flash);
	float lb = step(uv.y, letterbox) + step(1.0 - letterbox, uv.y);
	col = mix(col, vec3(0.0), lb);
	COLOR = vec4(col, 1.0);
}
