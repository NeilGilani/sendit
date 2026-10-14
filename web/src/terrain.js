// Real-mountain terrain: 2048² Copernicus heights, chunked CPU geometry with distance LOD and
// skirts, a cel-shaded "vibey anime" snow shader (cream / periwinkle / indigo bands, vector
// sparkle, corduroy, persistent carved tracks), baked mountain shadows + sky visibility and a
// 30 km backdrop. Answers height/normal/surface queries; park features add to the height field.
import * as THREE from 'three';
import { globals, toonMaterial, SUN_DIR } from './world.js';
import { ART } from './config.js';

const CHUNK = 128;
const LODS = 5;

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.chunks = [];
    this.cache = new Map();
    this.lodDistances = [450, 1000, 2000, 3800];
    this.features = null;     // optional { heightAt(x, z) -> number | null }
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
    const terrainUniforms = {
      normalTex: { value: this.normalTex }, splatTex: { value: this.splatTex }, noiseTex: { value: tex.noise },
      sparkle: { value: ART.snowSparkleIntensity }, terrainRes: { value: this.res }, terrainSpacing: { value: this.spacing },
    };
    this.terrainUniforms = terrainUniforms;
    this.material = toonMaterial({ name: 'terrainToon', uniforms: terrainUniforms, fragPars: TERRAIN_PARS, frag: TERRAIN_FRAG });
    const prev = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
    this.farMaterial = toonMaterial({ name: 'terrainFar', uniforms: { noiseTex: { value: tex.noise } }, fragPars: 'uniform sampler2D noiseTex;', frag: FAR_FRAG });
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
    if (this.terrainUniforms) this.terrainUniforms.sparkle.value = q === 0 ? 0 : ART.snowSparkleIntensity;
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
    const base = this.baseHeight(x, z);
    if (this.features) {
      const f = this.features.heightAt(x, z, base);
      if (f !== null && f > base) return f;
    }
    return base;
  }

  baseHeight(x, z) {
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
uniform sampler2D normalTex; uniform sampler2D splatTex; uniform sampler2D noiseTex;
uniform float sparkle; uniform float terrainRes; uniform float terrainSpacing;
uniform sampler2D uTrackMap; uniform vec3 uTrackRegion;
vec3 tN;
vec2 tUV(vec2 xz) { return ((xz + terrainSize * 0.5) / terrainSpacing + 0.5) / terrainRes; }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float trackAt(vec2 xz) {
  vec2 uv = (xz - uTrackRegion.xy) / uTrackRegion.z + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uTrackMap, uv).r;
}
`;

const TERRAIN_FRAG = /* glsl */`
{
  vec2 uv = tUV(vW.xz);
  vec2 nn = texture2D(normalTex, uv).rg * 2.0 - 1.0;
  vec3 N = normalize(vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y));
  vec3 s = texture2D(splatTex, uv).rgb;
  float dist = length(vW - cameraPosition);
  float near = 1.0 - smoothstep(60.0, 400.0, dist);
  float m1 = texture2D(noiseTex, vW.xz * 0.0011).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.0093 + 0.37).r;
  float m3 = texture2D(noiseTex, vW.xz * 0.06 + 0.71).g;

  // Sculpted drifts: big soft dunes plus fine wind ripples give the cel bands organic shapes.
  vec2 q1 = vW.xz * 0.011 + vec2(0.13, 0.7);
  float d0 = texture2D(noiseTex, q1).r;
  vec2 dg = vec2(texture2D(noiseTex, q1 + vec2(0.003, 0.0)).r - d0, texture2D(noiseTex, q1 + vec2(0.0, 0.003)).r - d0);
  vec2 q2 = vW.xz * 0.05 + vec2(0.4, 0.2);
  float r0 = texture2D(noiseTex, q2).g;
  vec2 rg = vec2(texture2D(noiseTex, q2 + vec2(0.004, 0.0)).g - r0, texture2D(noiseTex, q2 + vec2(0.0, 0.004)).g - r0);
  float sculpt = (1.0 - smoothstep(0.25, 0.75, s.r) * 0.7);
  N = normalize(N - vec3(dg.x, 0.0, dg.y) * 55.0 * sculpt - vec3(rg.x, 0.0, rg.y) * 10.0 * near * sculpt);

  float groomed = smoothstep(0.25, 0.75, s.r);
  float forest = s.b;
  float flatness = smoothstep(0.6, 0.85, N.y + (m3 - 0.5) * 0.12);
  float rock = clamp(smoothstep(0.3, 0.58, s.g + (m2 - 0.5) * 0.45 * s.g) * (1.0 - flatness * 0.9), 0.0, 1.0);

  // Rock: cool slate with stratified ledges catching snow (cel look).
  float strata = texture2D(noiseTex, vec2(vW.y * 0.03 + m2, vW.x * 0.002 + vW.z * 0.002)).b;
  vec3 rockCol = mix(vec3(0.42, 0.44, 0.55), vec3(0.58, 0.58, 0.66), step(0.55, strata));
  rockCol *= mix(0.85, 1.05, m3);
  float ledgeSnow = step(0.72, N.y + (m3 - 0.5) * 0.35) * step(0.4, strata);
  rock *= 1.0 - ledgeSnow;

  vec3 snow = vec3(1.0);
  snow = mix(snow, vec3(0.95, 0.97, 1.0), forest * 0.5);
  // Groomed corduroy: crisp thin periwinkle lines along the fall line, fading with distance.
  vec2 fall = normalize(N.xz + vec2(1e-4));
  float u = dot(vW.xz, vec2(-fall.y, fall.x));
  float lines = smoothstep(0.42, 0.5, abs(fract(u / 0.6) - 0.5)) * groomed * (1.0 - smoothstep(8.0, 40.0, dist));
  float lane = step(0.5, fract(u / 4.8)) * groomed * 0.03 * (1.0 - smoothstep(200.0, 900.0, dist));
  snow *= 1.0 - lines * 0.05 - lane;

  // Persistent carved tracks: deep groove pushes the snow into the shadow bands.
  float tr = trackAt(vW.xz);
  float trx = trackAt(vW.xz + vec2(0.06, 0.0)) - trackAt(vW.xz - vec2(0.06, 0.0));
  float trz = trackAt(vW.xz + vec2(0.0, 0.06)) - trackAt(vW.xz - vec2(0.0, 0.06));
  N = normalize(N + vec3(trx, 0.0, trz) * 2.2);
  toonDeepBias = tr * 0.32;
  snow = mix(snow, vec3(0.88, 0.92, 1.0), tr * 0.6);

  diffuseColor.rgb = mix(snow, rockCol, rock);
  tN = N;

  // Vector-art sparkle: tiny crisp glints that twinkle as the camera moves (lit snow only).
  vec3 cell = floor(vW * 9.0);
  vec3 vq = floor(normalize(vW - cameraPosition) * 14.0);
  float h1 = hash13(cell);
  float h2 = hash13(cell + vq * 7.13);
  vec3 fr = fract(vW * 9.0) - 0.5;
  float star = max(1.0 - length(fr.xz) * 9.0, 0.0) + max(1.0 - abs(fr.x) * 30.0, 0.0) * max(1.0 - abs(fr.z) * 4.0, 0.0) * 0.6
             + max(1.0 - abs(fr.z) * 30.0, 0.0) * max(1.0 - abs(fr.x) * 4.0, 0.0) * 0.6;
  float glint = step(0.975, h1) * step(0.55, h2) * clamp(star, 0.0, 1.0) * (1.0 - smoothstep(18.0, 70.0, dist)) * (1.0 - rock) * (1.0 - tr);
  toonSparkle = glint * sparkle * sunMaskAt(vW).r * max(dot(N, uSunDir) + 0.2, 0.0);
}
`;

const FAR_FRAG = /* glsl */`
{
  vec3 N = normalize(vWN);
  float m = texture2D(noiseTex, vW.xz * 0.0004).r;
  float m2 = texture2D(noiseTex, vW.xz * 0.003 + 0.5).r;
  float slope = 1.0 - N.y;
  float rock = smoothstep(0.28, 0.42, slope + (m2 - 0.5) * 0.18);
  float forest = (1.0 - smoothstep(1950.0, 2250.0, vW.y + (m - 0.5) * 300.0)) * (1.0 - rock) * smoothstep(0.03, 0.12, slope);
  vec3 col = vec3(1.0);
  col = mix(col, vec3(0.2, 0.36, 0.4), forest * 0.75);
  diffuseColor.rgb = mix(col, vec3(0.45, 0.47, 0.58), rock);
}
`;
