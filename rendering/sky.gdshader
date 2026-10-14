shader_type sky;
render_mode use_half_res_pass;
// Physically based single-scattering atmosphere (Rayleigh + Mie, ozone tint) seen from alpine
// altitude, with a soft sun disk, a warm horizon glow and a sparse layer of high clouds.

uniform float camera_altitude = 3000.0;
uniform float sun_intensity = 22.0;
uniform float mie_g = 0.76;
uniform float turbidity = 1.4;
uniform vec3 ground_haze : source_color = vec3(0.55, 0.6, 0.72);
uniform sampler2D cloud_noise : filter_linear_mipmap, repeat_enable;
uniform sampler2D cloud_detail : filter_linear_mipmap, repeat_enable;
uniform float cloud_coverage = 0.42;
uniform float cloud_brightness = 1.0;
uniform vec2 cloud_offset = vec2(0.0);
uniform float exposure = 1.0;

const float R_E = 6360e3;
const float R_A = 6420e3;
const vec3 BETA_R = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 BETA_OZONE = vec3(0.65e-6, 1.881e-6, 0.085e-6);
const float BETA_M = 21e-6;
const float H_R = 7994.0;
const float H_M = 1200.0;

vec2 ray_sphere(vec3 ro, vec3 rd, float r) {
	float b = dot(ro, rd);
	float c = dot(ro, ro) - r * r;
	float d = b * b - c;
	if (d < 0.0) return vec2(1e9, -1e9);
	d = sqrt(d);
	return vec2(-b - d, -b + d);
}

vec3 atmosphere(vec3 dir, vec3 sun, int steps, int light_steps) {
	vec3 ro = vec3(0.0, R_E + camera_altitude, 0.0);
	vec2 ta = ray_sphere(ro, dir, R_A);
	float t_max = ta.y;
	vec2 te = ray_sphere(ro, dir, R_E);
	if (te.x > 0.0) t_max = min(t_max, te.x);
	float seg = t_max / float(steps);
	float mu = dot(dir, sun);
	float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
	float g = mie_g;
	float pm = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
	vec3 sum_r = vec3(0.0);
	vec3 sum_m = vec3(0.0);
	float od_r = 0.0;
	float od_m = 0.0;
	float bm = BETA_M * turbidity;
	for (int i = 0; i < steps; i++) {
		vec3 p = ro + dir * (seg * (float(i) + 0.5));
		float h = length(p) - R_E;
		float hr = exp(-h / H_R) * seg;
		float hm = exp(-h / H_M) * seg;
		od_r += hr;
		od_m += hm;
		vec2 tl = ray_sphere(p, sun, R_A);
		float lseg = tl.y / float(light_steps);
		float lr = 0.0;
		float lm = 0.0;
		bool blocked = false;
		for (int j = 0; j < light_steps; j++) {
			vec3 q = p + sun * (lseg * (float(j) + 0.5));
			float lh = length(q) - R_E;
			if (lh < 0.0) { blocked = true; break; }
			lr += exp(-lh / H_R) * lseg;
			lm += exp(-lh / H_M) * lseg;
		}
		if (!blocked) {
			vec3 tau = BETA_R * (od_r + lr) + bm * 1.1 * (od_m + lm) + BETA_OZONE * (od_r + lr) * 0.6;
			vec3 att = exp(-tau);
			sum_r += hr * att;
			sum_m += hm * att;
		}
	}
	return sun_intensity * (sum_r * BETA_R * pr + sum_m * bm * pm);
}

vec3 transmittance(vec3 dir) {
	vec3 ro = vec3(0.0, R_E + camera_altitude, 0.0);
	float t = ray_sphere(ro, dir, R_A).y;
	float seg = t / 8.0;
	float r = 0.0;
	float m = 0.0;
	for (int i = 0; i < 8; i++) {
		float h = length(ro + dir * seg * (float(i) + 0.5)) - R_E;
		r += exp(-h / H_R) * seg;
		m += exp(-h / H_M) * seg;
	}
	return exp(-(BETA_R * r + BETA_M * turbidity * 1.1 * m + BETA_OZONE * r * 0.6));
}

void sky() {
	vec3 sun = LIGHT0_ENABLED ? normalize(LIGHT0_DIRECTION) : normalize(vec3(0.3, 0.15, -0.9));
	vec3 dir = EYEDIR;
	bool below = dir.y < -0.03;
	vec3 sdir = vec3(dir.x, max(dir.y, -0.03), dir.z);
	sdir = normalize(sdir);
	int steps = AT_CUBEMAP_PASS ? 8 : 14;
	int lsteps = AT_CUBEMAP_PASS ? 4 : 6;
	vec3 col = atmosphere(sdir, sun, steps, lsteps);

	// Sun disk with limb darkening (only in the visible background).
	float cos_sun = dot(dir, sun);
	float disk = smoothstep(0.99996, 0.999985, cos_sun);
	if (!AT_CUBEMAP_PASS) {
		vec3 tr = transmittance(sun);
		col += disk * tr * vec3(1.0, 0.93, 0.85) * 900.0;
	}

	// High clouds on a curved layer.
	if (dir.y > 0.0) {
		vec2 uv = dir.xz / (dir.y + 0.12) * 0.22 + cloud_offset;
		float n = texture(cloud_noise, uv).r * 0.7 + texture(cloud_detail, uv * 3.7 + 0.31).r * 0.3;
		float cov = smoothstep(1.0 - cloud_coverage, 1.0 - cloud_coverage + 0.32, n);
		cov *= smoothstep(0.0, 0.18, dir.y);
		float thick = smoothstep(1.0 - cloud_coverage, 1.0, n);
		vec3 sun_t = transmittance(sun);
		float fwd = pow(max(cos_sun, 0.0), 6.0);
		vec3 lit = sun_t * vec3(1.0, 0.85, 0.7) * (0.6 + 2.2 * fwd) * cloud_brightness;
		vec3 shade = col * 0.9 + vec3(0.05, 0.05, 0.07);
		vec3 cloud = mix(lit * 1.4, shade, thick * 0.55);
		col = mix(col, cloud, cov * 0.85);
	}

	if (below) {
		// Below the horizon: distant valleys lost in haze.
		vec3 haze = atmosphere(normalize(vec3(dir.x, 0.0, dir.z)), sun, 8, 4) * 0.8;
		col = mix(haze, ground_haze * haze.g * 1.6, smoothstep(-0.03, -0.25, dir.y));
	}
	COLOR = col * exposure;
}
