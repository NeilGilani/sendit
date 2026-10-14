// Real-mountain terrain: 2048² Copernicus heights, chunked CPU geometry with distance LOD and
// skirts, a photoscanned snow/rock shader, baked mountain shadows + sky visibility, and a 30 km
// backdrop. Also answers height/normal/surface queries for gameplay.
import * as THREE from 'three';
import { globals, withWorld, SUN_DIR } from './world.js';

const CHUNK = 128;
const LODS = 5;

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.chunks = [];
    this.cache = new Map();
    this.lodDistances = [450, 1000, 2000, 3800];
  }

  async load(base = '/terrain/', onProgress = () => {}) {
    const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(f); return r; };
    this.meta = await (await get('terrain.json')).json();
    onProgress(0.1);
    const [h, n, s, far] = await Promise.all([
      get('height_f32.bin').then((r) => r.arrayBuffer()),
      get('normal_rg8.bin').then((r) => r.arrayBuffer()),
      get('splat_rgb8.bin').then((r) => r.arrayBuffer()),
      get('far_f32.bin').then((r) => r.arrayBuffer()),
    ]);
    onProgress(0.35);
    const m = this.meta;
    this.res = m.res;
    this.size = m.size_m;
    this.half = this.size / 2;
    this.spacing = m.spacing;
    this.heights = new Float32Array(h);
    this.normals = new Uint8Array(n);
    const splat3 = new Uint8Array(s);
    this.splat = splat3;
    this.far = new Float32Array(far);
    this.perSide = Math.ceil((this.res - 1) / CHUNK);
    this.chunkSize = CHUNK * this.spacing;
    globals.terrainSize.value = this.size;

    // GPU textures
    const N = this.res;
    const splat4 = new Uint8Array(N * N * 4);
    for (let i = 0, j = 0; i < N * N; i++, j += 3) {
      splat4[i * 4] = splat3[j]; splat4[i * 4 + 1] = splat3[j + 1]; splat4[i * 4 + 2] = splat3[j + 2]; splat4[i * 4 + 3] = 255;
    }
    this.splatTex = dataTex(splat4, N, THREE.RGBAFormat, true);
    this.normalTex = dataTex(this.normals, N, THREE.RGFormat, true);
    this.heightTex = new THREE.DataTexture(this.heights, N, N, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
  }

  /** Bake mountain shadows (R) and sky visibility (G) on the GPU. Sun is static at golden hour. */
  bakeSunMask(renderer) {
    const size = 1024;
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        hmap: { value: this.heightTex }, size: { value: this.size }, res: { value: this.res },
        spacing: { value: this.spacing }, sunDir: { value: SUN_DIR },
      },
      vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        precision highp float;
        in vec2 vUv; out vec4 outColor;
        uniform sampler2D hmap; uniform float size; uniform float res; uniform float spacing; uniform vec3 sunDir;
        float H(vec2 xz) {
          vec2 f = (xz + size * 0.5) / spacing;
          ivec2 i = ivec2(clamp(floor(f), vec2(0.0), vec2(res - 2.0)));
          vec2 t = clamp(f - vec2(i), 0.0, 1.0);
          float a = texelFetch(hmap, i, 0).r, b = texelFetch(hmap, i + ivec2(1, 0), 0).r;
          float c = texelFetch(hmap, i + ivec2(0, 1), 0).r, d = texelFetch(hmap, i + ivec2(1, 1), 0).r;
          return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
        }
        bool inside(vec2 p) { return abs(p.x) < size * 0.5 && abs(p.y) < size * 0.5; }
        void main() {
          vec2 xz = vUv * size - size * 0.5;
          float h0 = H(xz) + 1.0;
          vec2 d = normalize(sunDir.xz);
          float tanE = sunDir.y / length(sunDir.xz);
          float vis = 1.0;
          float t = 4.0;
          for (int i = 0; i < 220; i++) {
            vec2 p = xz + d * t;
            if (!inside(p)) break;
            float diff = (h0 + t * tanE - H(p)) / t;
            vis = min(vis, smoothstep(-0.012, 0.012, diff));
            t += 2.0 + t * 0.028;
          }
          float occ = 0.0;
          for (int k = 0; k < 8; k++) {
            float a = float(k) * 0.785398;
            vec2 dd = vec2(cos(a), sin(a));
            float m = 0.0;
            float s = 6.0;
            for (int j = 0; j < 14; j++) {
              vec2 p = xz + dd * s;
              if (inside(p)) m = max(m, (H(p) - h0) / s);
              s *= 1.45;
            }
            occ += sin(atan(m));
          }
          float sky = clamp(1.0 - occ / 8.0 * 1.3, 0.0, 1.0);
          outColor = vec4(vis, sky, 0.0, 1.0);
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    quad.geometry.dispose();
    mat.dispose();
    this.sunMask = rt;
    globals.sunMaskTex.value = rt.texture;
  }

  buildMaterials(tex) {
    const noise = tex.noise;
    const terrainUniforms = {
      normalTex: { value: this.normalTex }, splatTex: { value: this.splatTex },
      snowAlb: { value: tex.snowAlb }, snowNor: { value: tex.snowNor }, snowRgh: { value: tex.snowRgh },
      packAlb: { value: tex.packAlb }, packNor: { value: tex.packNor }, packRgh: { value: tex.packRgh },
      rockAlb: { value: tex.rockAlb }, rockNor: { value: tex.rockNor }, noiseTex: { value: noise },
      sparkle: { value: 1.0 }, terrainRes: { value: this.res }, terrainSpacing: { value: this.spacing },
    };
    this.terrainUniforms = terrainUniforms;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.0 });
    mat.name = 'terrain';
    withWorld(mat, {
      uniforms: terrainUniforms,
      fragPars: TERRAIN_PARS,
      frag: TERRAIN_FRAG,
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    vec3 sv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    vec3 hv = normalize(sv + geometryViewDir);
    reflectedLight.directSpecular += tGlint * uSunColor * sunMaskFactor * pow(max(dot(normal, hv), 0.0), 50.0) * 1.4;
    // Snow translucency: a little light wraps around the terminator.
    float wrapL = max(dot(normal, sv) + 0.35, 0.0) / 1.35 - max(dot(normal, sv), 0.0);
    reflectedLight.directDiffuse += max(wrapL, 0.0) * uSunColor * sunMaskFactor * diffuseColor.rgb * 0.18 * (1.0 - tRock);
  }`);
    };
    this.material = mat;

    const far = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    far.name = 'terrainFar';
    withWorld(far, {
      uniforms: { rockAlb: { value: tex.rockAlb }, noiseTex: { value: noise }, nearHalf: { value: this.half } },
      fragPars: 'uniform sampler2D rockAlb; uniform sampler2D noiseTex;',
      frag: FAR_FRAG,
      skyAO: false,
    });
    this.farMaterial = far;
  }

  build() {
    // Shared index buffers per LOD (grid with a one-vertex skirt ring).
    this.indices = [];
    for (let lod = 0; lod < LODS; lod++) {
      const n = CHUNK >> lod;
      const w = n + 3;
      const idx = new Uint32Array((w - 1) * (w - 1) * 6);
      let k = 0;
      for (let j = 0; j < w - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
          idx[k++] = a; idx[k++] = c; idx[k++] = b;
          idx[k++] = b; idx[k++] = c; idx[k++] = d;
        }
      }
      this.indices.push(new THREE.BufferAttribute(idx, 1));
    }
    for (let cz = 0; cz < this.perSide; cz++) {
      for (let cx = 0; cx < this.perSide; cx++) {
        const mesh = new THREE.Mesh(this.chunkGeometry(cx, cz, LODS - 1), this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        mesh.userData = { cx, cz, lod: LODS - 1 };
        this.group.add(mesh);
        this.chunks.push(mesh);
      }
    }
    this.buildFar();
  }

  chunkGeometry(cx, cz, lod) {
    const key = `${cx}_${cz}_${lod}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const n = CHUNK >> lod;
    const step = 1 << lod;
    const w = n + 3;
    const pos = new Float32Array(w * w * 3);
    const nor = new Float32Array(w * w * 3);
    const N = this.res, sp = this.spacing, half = this.half;
    let k = 0;
    const drop = 6 + 5 * lod;
    for (let j = -1; j <= n + 1; j++) {
      for (let i = -1; i <= n + 1; i++) {
        const ci = Math.min(Math.max(i, 0), n), cj = Math.min(Math.max(j, 0), n);
        const gi = Math.min(cx * CHUNK + ci * step, N - 1);
        const gj = Math.min(cz * CHUNK + cj * step, N - 1);
        const skirt = i !== ci || j !== cj;
        const edge = gi === 0 || gj === 0 || gi === N - 1 || gj === N - 1;
        const x = -half + gi * sp, z = -half + gj * sp;
        let y = this.heights[gj * N + gi];
        if (skirt) y -= edge ? 160 : drop;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        const o = (gj * N + gi) * 2;
        const nx = this.normals[o] / 127.5 - 1, nz = this.normals[o + 1] / 127.5 - 1;
        nor[k] = nx; nor[k + 1] = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)); nor[k + 2] = nz;
        k += 3;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(this.indices[lod]);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.cache.set(key, g);
    return g;
  }

  buildFar() {
    const m = this.meta;
    const fres = m.far_res, fsize = m.far_size_m;
    const n = 256;
    const step = fsize / n;
    const pos = new Float32Array((n + 1) * (n + 1) * 3);
    const H = (x, z) => {
      const fx = ((x + fsize / 2) / fsize) * (fres - 1), fz = ((z + fsize / 2) / fsize) * (fres - 1);
      const i = Math.min(Math.max(Math.floor(fx), 0), fres - 2), j = Math.min(Math.max(Math.floor(fz), 0), fres - 2);
      const tx = fx - i, tz = fz - j;
      const a = this.far[j * fres + i], b = this.far[j * fres + i + 1], c = this.far[(j + 1) * fres + i], d = this.far[(j + 1) * fres + i + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };
    let k = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = -fsize / 2 + i * step, z = -fsize / 2 + j * step;
        const inside = 1 - smooth(this.half - 160, this.half - 30, Math.max(Math.abs(x), Math.abs(z)));
        pos[k++] = x; pos[k++] = H(x, z) - inside * 90 - 2; pos[k++] = z;
      }
    }
    const idx = new Uint32Array(n * n * 6);
    k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx[k++] = a; idx[k++] = a + n + 1; idx[k++] = a + 1;
      idx[k++] = a + 1; idx[k++] = a + n + 1; idx[k++] = a + n + 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.farMaterial);
    mesh.receiveShadow = false;
    mesh.name = 'FarTerrain';
    this.group.add(mesh);
  }

  setQuality(q) {
    const s = [0.6, 1.0, 1.5][q];
    this.lodDistances = [450 * s, 1000 * s, 2000 * s, 3800 * s];
    if (this.terrainUniforms) this.terrainUniforms.sparkle.value = q === 0 ? 0 : 1;
    this._lastFocus = null;
  }

  /** Update chunk LODs around the camera; builds at most a few chunks per frame. */
  update(camPos) {
    let budget = 6;
    for (const mesh of this.chunks) {
      const { cx, cz } = mesh.userData;
      const ccx = -this.half + (cx + 0.5) * this.chunkSize, ccz = -this.half + (cz + 0.5) * this.chunkSize;
      const d = Math.max(0, Math.hypot(ccx - camPos.x, ccz - camPos.z) - this.chunkSize * 0.5);
      let lod = LODS - 1;
      for (let l = 0; l < this.lodDistances.length; l++) if (d < this.lodDistances[l]) { lod = l; break; }
      if (lod !== mesh.userData.lod) {
        const key = `${cx}_${cz}_${lod}`;
        if (!this.cache.has(key)) { if (budget-- <= 0) continue; }
        const old = `${cx}_${cz}_${mesh.userData.lod}`;
        mesh.geometry = this.chunkGeometry(cx, cz, lod);
        if (mesh.userData.lod < 3 && this.cache.has(old)) { this.cache.get(old).dispose(); this.cache.delete(old); }
        mesh.userData.lod = lod;
      }
    }
  }

  // ---------------------------------------------------------------- queries
  getHeight(x, z) {
    const N = this.res;
    const fx = Math.min(Math.max((x + this.half) / this.spacing, 0), N - 1.001);
    const fz = Math.min(Math.max((z + this.half) / this.spacing, 0), N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const r = j * N + i, H = this.heights;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
  }

  getNormal(x, z, radius = 0, out = new THREE.Vector3()) {
    const e = Math.max(radius, this.spacing);
    return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e,
      this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
  }

  /** x groomed, y powder, z rock, w forest */
  getSurface(x, z, out = new THREE.Vector4()) {
    const N = this.res;
    const i = Math.min(Math.max(Math.round((x + this.half) / this.spacing), 0), N - 1);
    const j = Math.min(Math.max(Math.round((z + this.half) / this.spacing), 0), N - 1);
    const o = (j * N + i) * 3;
    const g = this.splat[o] / 255, r = this.splat[o + 1] / 255, f = this.splat[o + 2] / 255;
    return out.set(g, Math.max(0, 1 - Math.max(g, r, f)), r, f);
  }

  isInside(x, z, margin = 0) { return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin; }

  getSpawn() {
    const s = this.meta.spawn;
    const p = new THREE.Vector3(s.position[0], 0, s.position[2]);
    p.y = this.getHeight(p.x, p.z);
    return { position: p, heading: s.heading };
  }

  /** Highest summit (for the menu flyover). */
  summit() {
    let best = 0, bi = 0;
    for (let i = 0; i < this.heights.length; i += 7) if (this.heights[i] > best) { best = this.heights[i]; bi = i; }
    const N = this.res;
    return new THREE.Vector3(-this.half + (bi % N) * this.spacing, best, -this.half + Math.floor(bi / N) * this.spacing);
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function dataTex(data, n, format, mips) {
  const t = new THREE.DataTexture(data, n, n, format, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const TERRAIN_PARS = /* glsl */`
uniform sampler2D normalTex; uniform sampler2D splatTex;
uniform sampler2D snowAlb; uniform sampler2D snowNor; uniform sampler2D snowRgh;
uniform sampler2D packAlb; uniform sampler2D packNor; uniform sampler2D packRgh;
uniform sampler2D rockAlb; uniform sampler2D rockNor; uniform sampler2D noiseTex;
uniform float sparkle; uniform float terrainRes; uniform float terrainSpacing;
vec3 tN; float tRough; float tGlint; float tRock;
vec2 tUV(vec2 xz) { return ((xz + terrainSize * 0.5) / terrainSpacing + 0.5) / terrainRes; }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 unpackN(vec4 t) { return t.xyz * 2.0 - 1.0; }
vec3 applyXZ(vec3 N, vec3 tn, float k) {
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = normalize(vec3(0.0, 0.0, 1.0) - N * N.z);
  return normalize(N + (T * tn.x - B * tn.y) * k);
}
`;

const TERRAIN_FRAG = /* glsl */`
{
  vec2 uv = tUV(vW.xz);
  vec2 nn = texture2D(normalTex, uv).rg * 2.0 - 1.0;
  vec3 N = normalize(vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y));
  vec3 s = texture2D(splatTex, uv).rgb;
  float dist = length(vW - cameraPosition);
  float nearF = 1.0 - smoothstep(120.0, 600.0, dist);
  float midF = 1.0 - smoothstep(600.0, 2200.0, dist);
  float m1 = texture2D(noiseTex, vW.xz * 0.0011).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.0093 + 0.37).r;
  float m3 = texture2D(noiseTex, vW.xz * 0.061 + 0.71).g;

  float groomed = smoothstep(0.25, 0.75, s.r);
  float forest = s.b;
  float rockRaw = s.g + (m2 - 0.5) * 0.5 * s.g + (m3 - 0.5) * 0.25 * s.g;
  float flatness = smoothstep(0.62, 0.86, N.y + (m3 - 0.5) * 0.14);
  float rock = clamp(smoothstep(0.32, 0.6, rockRaw) * (1.0 - flatness * 0.85), 0.0, 1.0);

  // Powder, two scales rotated against each other (anti-tiling)
  vec2 pa = vW.xz * 0.29;
  vec2 pb = rot2(vW.xz, 0.83) * 0.071;
  float ab = smoothstep(0.3, 0.7, m2);
  vec3 sa = texture2D(snowAlb, pa).rgb, sb = texture2D(snowAlb, pb).rgb;
  float lum = dot(mix(sa, sb, ab), vec3(0.3, 0.59, 0.11));
  vec3 powder = vec3(0.90, 0.93, 0.98) * mix(0.93, 1.03, smoothstep(0.35, 0.85, lum));
  powder *= mix(0.95, 1.02, m1) * mix(0.97, 1.01, m3);
  vec3 pn = mix(unpackN(texture2D(snowNor, pa)), unpackN(texture2D(snowNor, pb)), ab);
  float pr = mix(texture2D(snowRgh, pa).r, texture2D(snowRgh, pb).r, ab);

  // Groomed packed snow + corduroy along the fall line in 4.8 m groomer lanes
  vec2 ga = rot2(vW.xz, 0.31) * 0.23;
  float klum = dot(texture2D(packAlb, ga).rgb, vec3(0.3, 0.59, 0.11));
  vec3 packed = vec3(0.86, 0.9, 0.96) * mix(0.95, 1.02, smoothstep(0.35, 0.85, klum));
  vec3 kn = unpackN(texture2D(packNor, ga)) * vec3(0.5, 0.5, 1.0);
  float kr = texture2D(packRgh, ga).r * 0.8;
  vec2 fall = normalize(N.xz + vec2(1e-4));
  vec2 perp = vec2(-fall.y, fall.x);
  float u = dot(vW.xz, perp);
  float laneF = fract(u / 4.8);
  float ridgeW = fwidth(u / 0.045);
  float cord = (1.0 - smoothstep(0.12, 0.45, ridgeW)) * (1.0 - smoothstep(6.0, 22.0, dist));
  float laneTone = (hash13(vec3(floor(u / 4.8), 1.7, 3.1)) - 0.5) * 0.03;
  float laneEdge = smoothstep(0.03, 0.0, laneF) + smoothstep(0.97, 1.0, laneF);
  packed *= 1.0 + laneTone * midF - laneEdge * 0.02 * nearF;

  // Rock: triplanar, near detail fading to big crags far away
  vec3 w = pow(abs(N), vec3(4.0)); w /= (w.x + w.y + w.z);
  float farRock = smoothstep(40.0, 320.0, dist);
  float rs = mix(0.13, 0.017, farRock);
  vec3 rcol = texture2D(rockAlb, vW.zy * rs).rgb * w.x + texture2D(rockAlb, vW.xz * rs * 0.7).rgb * w.y + texture2D(rockAlb, vW.xy * rs).rgb * w.z;
  float rl = dot(rcol, vec3(0.3, 0.59, 0.11));
  rcol = mix(vec3(rl), rcol, 0.4) * vec3(0.62, 0.58, 0.55) * 1.3 * mix(0.8, 1.12, m2);
  vec3 tx = unpackN(texture2D(rockNor, vW.zy * rs)), ty = unpackN(texture2D(rockNor, vW.xz * rs * 0.7)), tz = unpackN(texture2D(rockNor, vW.xy * rs));
  float rk = mix(1.0, 1.8, farRock);
  vec3 nx = vec3(tx.xy * rk + N.zy, abs(tx.z) * N.x);
  vec3 ny = vec3(ty.xy * rk + N.xz, abs(ty.z) * N.y);
  vec3 nz = vec3(tz.xy * rk + N.xy, abs(tz.z) * N.z);
  vec3 rockN = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
  // Snow caught on ledges and in gullies: follows the rock's own detail normal, broken up organically.
  float ln = texture2D(noiseTex, vW.xz * 0.013 + vec2(vW.y * 0.004)).g * 0.6 + texture2D(noiseTex, vW.xz * 0.05 + 0.3).r * 0.4;
  float ledge = smoothstep(0.62, 0.82, rockN.y + (ln - 0.5) * 0.7) * (0.35 + 0.65 * smoothstep(0.35, 0.6, ln));
  rock *= 1.0 - ledge * 0.85;

  vec3 snowCol = mix(powder, packed, groomed);
  snowCol = mix(snowCol, snowCol * vec3(0.8, 0.84, 0.9), forest * 0.6);
  vec3 snowN = mix(pn, kn, groomed);
  float snowR = mix(clamp(pr * 0.9, 0.45, 0.85), clamp(kr, 0.35, 0.7), groomed);
  vec3 Nw = applyXZ(N, snowN, 0.9 * (0.35 + 0.65 * nearF));
  // Wind-sculpted ripples on ungroomed snow (large-scale reuse of the snow normal map)
  vec3 wn = unpackN(texture2D(snowNor, rot2(vW.xz, 0.4) * vec2(0.012, 0.035)));
  Nw = applyXZ(Nw, wn, 0.5 * (1.0 - groomed) * (1.0 - forest) * midF);
  vec3 perp3 = normalize(vec3(perp.x, 0.0, perp.y) - N * dot(vec3(perp.x, 0.0, perp.y), N));
  Nw = normalize(Nw + perp3 * (-sin(u / 0.045 * 6.2832) * 0.12 * cord * groomed));

  vec3 albedo = mix(snowCol, rcol, rock);
  albedo *= 1.0 - (cos(u / 0.045 * 6.2832) * 0.5 + 0.5) * 0.02 * groomed * cord;
  diffuseColor.rgb = albedo;
  tN = normalize(mix(Nw, rockN, rock));
  tRough = mix(snowR, 0.82, rock);
  tRock = rock;
  vec3 cell = floor(vW * 26.0);
  vec3 vq = floor(normalize(vW - cameraPosition) * 9.0);
  tGlint = step(0.993, hash13(cell)) * step(0.45, hash13(cell + vq * 17.0)) * (1.0 - smoothstep(25.0, 90.0, dist)) * (1.0 - rock) * sparkle;
}
`;

const FAR_FRAG = /* glsl */`
{
  vec3 N = normalize(vWN);
  float m = texture2D(noiseTex, vW.xz * 0.0004).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.003 + 0.5).r;
  float slope = 1.0 - N.y;
  float rock = smoothstep(0.26, 0.42, slope + (m2 - 0.5) * 0.18);
  vec3 w = pow(abs(N), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 rc = texture2D(rockAlb, vW.zy * 0.02).rgb * w.x + texture2D(rockAlb, vW.xz * 0.02).rgb * w.y + texture2D(rockAlb, vW.xy * 0.02).rgb * w.z;
  rc = mix(vec3(dot(rc, vec3(0.3, 0.59, 0.11))), rc, 0.45) * vec3(0.62, 0.58, 0.55) * 1.3;
  float forest = (1.0 - smoothstep(1950.0, 2250.0, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * smoothstep(0.03, 0.12, slope);
  vec3 col = vec3(0.90, 0.93, 0.98) * mix(0.94, 1.02, m);
  col = mix(col, vec3(0.16, 0.2, 0.19) * mix(0.8, 1.2, m2) + vec3(0.12) * (1.0 - slope * 2.0), forest * 0.8);
  diffuseColor.rgb = mix(col, rc, rock);
}
`;
