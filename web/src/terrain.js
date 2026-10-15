// Terrain: the hand-built course (course.js) on a 2049² / 1.25 m grid, chunked CPU geometry with
// distance LOD and skirts, the clean clay-snow shader from scene.js (soft scattered light, blue
// shade, subsurface glow, satin sheen, carved trenches), baked sun shadows + sky AO and a 30 km
// backdrop. Answers height/normal/surface queries; park features add to the height field.
import * as THREE from 'three';
import { globals, toonMaterial, SUN_DIR } from './world.js';
import { RING, CLIFFS } from './scene.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_PARS_GLSL, SNOW_FRAG_GLSL, SNOW_BAND_GLSL, FAR_SNOW_FRAG_GLSL } from './gfx/snow.js';

const CHUNK = 128;
const LODS = 5;

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.chunks = [];
    this.cache = new Map();
    this.lodDistances = [280, 600, 1200, 2400];
    this.features = null;     // optional { heightAt(x, z) -> number | null }
  }

  /** Build from the hand-made course (course.js): heights, normals, splat and the far backdrop. */
  async generate(course, onProgress = () => {}) {
    const d = await course.generate(onProgress);
    this.course = course;
    this.ingest(d.meta, d.heights, d.normals, d.splat, d.far);
    if (course.P?.wallHeight) this.sculptCliffs();
  }

  /**
   * The hand-built gully's walls are smooth ramps. Real alpine faces are fluted: ribs and gullies
   * running down the fall line. Add that relief (a few metres, steep cells only, so the riding floor
   * is untouched) to the height field, then refresh normals and the rock mask. The noise is stretched
   * along each cell's own fall line.
   */
  sculptCliffs() {
    const N = this.res, sp = this.spacing, half = this.half, H = this.heights, nrm = this.normals;
    const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const vn = (x, z) => {
      const i = Math.floor(x), j = Math.floor(z);
      let tx = x - i, tz = z - j; tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
      const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
    const ridge = (x, z) => 1 - Math.abs(vn(x, z) * 2 - 1);
    const A = CLIFFS.relief;
    let touched = 0;
    const C = this.course;
    for (let j = 1; j < N - 1; j++) {
      const z = -half + j * sp;
      // Leave the riding floor alone (natural drops are steep too): only beyond the floor edge.
      const t = C.tAt(z), xc = C.at(C.xc, t), floor = C.at(C.w, t) + 6;
      for (let i = 1; i < N - 1; i++) {
        if (Math.abs(-half + i * sp - xc) < floor) continue;
        const k = j * N + i;
        const nx = nrm[k * 2] / 127.5 - 1, nz = nrm[k * 2 + 1] / 127.5 - 1;
        const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
        const st = Math.min(1, Math.max(0, (0.76 - ny) / 0.2));
        if (st <= 0) continue;
        const w = st * st * (3 - 2 * st);
        const x = -half + i * sp;
        // Stretch the flutes down the local fall line (u) and pack them across it (v).
        const hl = Math.hypot(nx, nz) || 1, fx = nx / hl, fz = nz / hl;
        const u = x * fx + z * fz, v = -x * fz + z * fx;
        // (no octave finer than ~30 m: distant LOD chunks point-sample the grid and would alias it)
        const r = ridge(u * 0.0019 + 2.3, v * 0.012 + 5.9) * 0.55 + ridge(u * 0.0045, v * 0.03) * 0.45;
        H[k] += A * w * (r - 0.55) * 2;
        touched++;
      }
    }
    // Refresh normals + rock mask (same conventions as course.js).
    const hAt = (i, j) => H[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = hAt(i - 1, j) - hAt(i + 1, j), ny = 2 * sp, nz = hAt(i, j - 1) - hAt(i, j + 1);
      const l = Math.hypot(nx, ny, nz), k = j * N + i;
      nrm[k * 2] = Math.round((nx / l) * 127.5 + 127.5);
      nrm[k * 2 + 1] = Math.round((nz / l) * 127.5 + 127.5);
      const t = Math.min(1, Math.max(0, (0.68 - ny / l) / 0.16));
      this.splat[k * 3 + 1] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    this.normalTex.needsUpdate = true;
    this.heightTex.needsUpdate = true;
    // splat texture is rebuilt from this.splat in ingest(); refresh its RGBA copy.
    const s4 = this.splatTex.image.data;
    for (let k = 0; k < N * N; k++) s4[k * 4 + 1] = this.splat[k * 3 + 1];
    this.splatTex.needsUpdate = true;
    console.log('[gfx] cliffs sculpted', touched);
  }

  /** Real-world data files (kept for reference builds). */
  async load(base = '/terrain/', onProgress = () => {}) {
    const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(f); return r; };
    const meta = await (await get('terrain.json')).json();
    onProgress(0.1);
    const [h, n, s, far] = await Promise.all([
      get('height_f32.bin').then((r) => r.arrayBuffer()),
      get('normal_rg8.bin').then((r) => r.arrayBuffer()),
      get('splat_rgb8.bin').then((r) => r.arrayBuffer()),
      get('far_f32.bin').then((r) => r.arrayBuffer()),
    ]);
    onProgress(0.35);
    this.ingest(meta, new Float32Array(h), new Uint8Array(n), new Uint8Array(s), new Float32Array(far));
  }

  ingest(meta, heights, normals, splat3, far) {
    this.meta = meta;
    const m = meta;
    this.res = m.res;
    this.size = m.size_m;
    this.half = this.size / 2;
    this.spacing = m.spacing;
    this.heights = heights;
    this.normals = normals;
    this.splat = splat3;
    this.far = far;
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
    this.heightTex.unpackAlignment = 1;
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
      ...snowUniforms(),
      normalTex: { value: this.normalTex }, splatTex: { value: this.splatTex }, noiseTex: { value: tex.noise },
      terrainRes: { value: this.res }, terrainSpacing: { value: this.spacing },
    };
    const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    blank.needsUpdate = true;
    terrainUniforms.uTreeMask.value = blank;
    this.terrainUniforms = terrainUniforms;
    this.material = toonMaterial({
      name: 'terrainSnow', uniforms: terrainUniforms,
      fragPars: SNOW_COMMON_PARS + SNOW_PARS_GLSL, frag: SNOW_FRAG_GLSL, band: SNOW_BAND_GLSL,
    });
    const prev = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
    this.material.defines = { SNOW_TRACKS: 2, SNOW_SPARKLE: 1, SNOW_TREEMASK: 1 };

    // Far forest band: real mountains use their own treeline and keep forest to the horizon.
    const farU = snowUniforms();
    if (this.course?.treeline) farU.uFarForest.value.set(this.course.treeline, 350, 1e6);
    this.farMaterial = toonMaterial({
      name: 'terrainFarSnow', uniforms: { ...farU, noiseTex: { value: tex.noise } },
      fragPars: SNOW_COMMON_PARS + 'vec3 tN;', frag: FAR_SNOW_FRAG_GLSL, band: SNOW_BAND_GLSL,
    });
    const prevFar = this.farMaterial.onBeforeCompile;
    this.farMaterial.onBeforeCompile = (shader, r) => {
      prevFar(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
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
    const n = 320;
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
        // Outer rim sinks away so the backdrop never ends in a hard box edge (the sky's ranges take over).
        const rim = smooth(fsize / 2 - 4000, fsize / 2, Math.max(Math.abs(x), Math.abs(z)));
        const y = H(x, z) - inside * 90 - 2;
        pos[k++] = x; pos[k++] = y + (m.far_min_height - 900 - y) * rim; pos[k++] = z;
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
    this.buildRing();
  }

  /**
   * Distant ranges: a polar ring of procedural ridged peaks beyond the 30 km backdrop, so the
   * horizon is layered mountains dissolving into blue haze (aerial perspective does the layering).
   */
  buildRing() {
    const m = this.meta;
    const fsize = m.far_size_m, fres = m.far_res;
    // Ranges sit around the resort's own altitude (the backdrop rim itself is sunk away).
    const edge = m.spawn ? this.baseHeight(m.spawn.position[0], m.spawn.position[2]) : 2500;
    const R = RING;
    const inner = Math.max(R.inner, fsize / 2 - 3000), outer = Math.min(inner + R.depth, R.maxRadius);
    const NA = R.segments, NR = R.rings;
    const rnd = (i, j, seed) => {
      let h = (i * 374761393 + j * 668265263 + seed * 982451653) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const vn = (x, y, seed) => {
      const i = Math.floor(x), j = Math.floor(y);
      let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = rnd(i, j, seed), b = rnd(i + 1, j, seed), c = rnd(i, j + 1, seed), d = rnd(i + 1, j + 1, seed);
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    };
    const ridged = (x, y) => {
      let a = 0, amp = 0.5, f = 1, tot = 0;
      for (let k = 0; k < 6; k++) { const n = 1 - Math.abs(vn(x * f, y * f, 7 + k) * 2 - 1); a += n * n * amp; tot += amp; amp *= 0.5; f *= 2.05; }
      return a / tot;
    };
    const pos = new Float32Array((NA + 1) * (NR + 1) * 3);
    let k = 0;
    for (let j = 0; j <= NR; j++) {
      const t = Math.pow(j / NR, 1.35);
      const r = inner + (outer - inner) * t;
      for (let i = 0; i <= NA; i++) {
        const az = (i / NA) * Math.PI * 2;
        const x = Math.cos(az) * r, z = Math.sin(az) * r;
        const env = 0.35 + 0.65 * smooth(0, 0.12, t) * (1 - 0.3 * t);
        const big = vn(x / 14000, z / 14000, 3);                // massifs vs. lower ranges
        const rg = ridged(x / R.scale, z / R.scale);
        const h = edge - 600 + env * (R.base + R.height * Math.pow(rg, 1.5) * (0.45 + 0.9 * big));
        pos[k++] = x; pos[k++] = h; pos[k++] = z;
      }
    }
    const idx = new Uint32Array(NA * NR * 6);
    k = 0;
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + NA + 1;
      idx[k++] = a + 1; idx[k++] = a + NA + 2; idx[k++] = a + NA + 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.farMaterial);
    mesh.name = 'DistantRanges';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  setQuality(q) {
    const s = [0.6, 1.0, 1.5][q];
    this.lodDistances = [280 * s, 600 * s, 1200 * s, 2400 * s];
    if (this.material) {
      // Quality tiers: low = no glints / plain normal-mapped tracks / no fine wind detail;
      // medium = everything but parallax tracks; high = parallax trenches.
      const d = { SNOW_TRACKS: q === 2 ? 2 : 1, SNOW_TREEMASK: 1 };
      if (q === 0) d.ROCK_LITE = 1;
      if (q > 0) d.SNOW_SPARKLE = 1;
      this.material.defines = d;
      this.material.needsUpdate = true;
      this.terrainUniforms.uDetail.value = q;
    }
    this._lastFocus = null;
  }

  /** Pick each chunk's LOD; new geometry is built nearest-first within a per-frame budget. */
  update(camPos, budget = 6) {
    const todo = [];
    for (const mesh of this.chunks) {
      const { cx, cz } = mesh.userData;
      const ccx = -this.half + (cx + 0.5) * this.chunkSize, ccz = -this.half + (cz + 0.5) * this.chunkSize;
      const d = Math.max(0, Math.hypot(ccx - camPos.x, ccz - camPos.z) - this.chunkSize * 0.5);
      let lod = LODS - 1;
      for (let l = 0; l < this.lodDistances.length; l++) if (d < this.lodDistances[l]) { lod = l; break; }
      if (lod !== mesh.userData.lod) todo.push([d, mesh, lod]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    for (const [, mesh, lod] of todo) {
      const { cx, cz } = mesh.userData;
      const key = `${cx}_${cz}_${lod}`;
      if (!this.cache.has(key)) { if (budget-- <= 0) continue; }
      const old = `${cx}_${cz}_${mesh.userData.lod}`;
      mesh.geometry = this.chunkGeometry(cx, cz, lod);
      if (mesh.userData.lod < 3 && this.cache.has(old)) { this.cache.get(old).dispose(); this.cache.delete(old); }
      mesh.userData.lod = lod;
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

  /** Menu flyover focus: above the middle of the course (or the highest summit for real data). */
  summit() {
    if (this.course) return this.course.menuFocus();
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
  t.unpackAlignment = 1;   // odd resolutions (2049) are not 4-byte aligned
  t.needsUpdate = true;
  return t;
}
