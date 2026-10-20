// Terrain: the hand-built course (course.js) on a 2049² / 1.25 m grid, chunked CPU geometry with
// distance LOD and skirts, the clean clay-snow shader from scene.js (soft scattered light, blue
// shade, subsurface glow, satin sheen, carved trenches), baked sun shadows + sky AO and a 30 km
// backdrop. Answers height/normal/surface queries; park features add to the height field.
import * as THREE from 'three';
import { globals, toonMaterial, SUN_DIR } from './world.js';
import { RING, CLIFFS, MIDTERRAIN } from './scene.js';
import { PERF, perfQ } from './gfx/perf.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_PARS_GLSL, SNOW_FRAG_GLSL, SNOW_BAND_GLSL, FAR_SNOW_FRAG_GLSL } from './gfx/snow.js';
import { assetUrl } from './base.js';

const CHUNK = 128;

// Geomorph (vertex): slide toward the next-coarser LOD's surface over the last stretch before a swap.
const TERRAIN_MORPH_PARS = /* glsl */`
attribute vec2 aMorph;
uniform vec4 uMorphEnd; uniform vec4 uMorphLen; uniform vec3 uMorphEye;
`;
const TERRAIN_MORPH_GLSL = /* glsl */`
  {
    float ml = aMorph.y;
    float mEnd = ml < 0.5 ? uMorphEnd.x : ml < 1.5 ? uMorphEnd.y : ml < 2.5 ? uMorphEnd.z : uMorphEnd.w;
    float mLen = ml < 0.5 ? uMorphLen.x : ml < 1.5 ? uMorphLen.y : ml < 2.5 ? uMorphLen.z : uMorphLen.w;
    float mk = clamp((distance(transformed.xz, uMorphEye.xz) - mEnd + mLen) / mLen, 0.0, 1.0);
    transformed.y += aMorph.x * mk;
  }
`;
const LODS = 5;

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.chunks = [];
    this.cache = new Map();
    this.lodDistances = [280, 600, 1200, 2400];
    // Geomorphing (no LOD pops): every vertex of a chunk at LOD l slides to the surface LOD l+1 would
    // draw while it is still [uMorphEnd - uMorphLen, uMorphEnd] from the camera, so by the time the
    // chunk swaps to the coarser grid it already looks exactly like it.
    this.morph = { uMorphEnd: { value: new THREE.Vector4() }, uMorphLen: { value: new THREE.Vector4() }, uMorphEye: { value: new THREE.Vector3() } };
    this.geomorph = true;
    // Same for the 10 m mid ring (its own LOD distances; the backdrop / ranges carry aMorph = 0).
    this.midMorph = { uMorphEnd: { value: new THREE.Vector4(1e9, 1e9, 1e9, 1e9) }, uMorphLen: { value: new THREE.Vector4(1, 1, 1, 1) }, uMorphEye: this.morph.uMorphEye };
    this.vel = new THREE.Vector2();
    this._lastCam = null;
    this.features = null;     // optional { heightAt(x, z) -> number | null }
  }

  /** Build from the hand-made course (course.js): heights, normals, splat and the far backdrop. */
  async generate(course, onProgress = () => {}) {
    const d = await course.generate(onProgress);
    this.course = course;
    this.ingest(d.meta, d.heights, d.normals, d.splat, d.far);
    if (course.P?.wallHeight) this.sculptCliffs();
    await this.buildMidHeights(course);
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
  async load(base = assetUrl('terrain/'), onProgress = () => {}) {
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

  /**
   * Mid-detail heights (MIDTERRAIN): a 10 m grid from the course's height function over ±6 km.
   * Inside the playable tile it copies the tile's own heights so both shadow bakes agree.
   */
  async buildMidHeights(course) {
    const M = MIDTERRAIN;
    const fn = course.natural ? (x, z) => course.natural(x, z) : (x, z) => course.height(x, z);
    const n = Math.round((2 * M.half) / M.spacing) + 1;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = -M.half + j * M.spacing;
      for (let i = 0; i < n; i++) {
        const x = -M.half + i * M.spacing;
        h[j * n + i] = this.isInside(x, z) ? this.baseHeight(x, z) : fn(x, z);
      }
      if ((j & 127) === 0) await new Promise((r) => setTimeout(r, 0));
    }
    this.mid = { half: M.half, sp: M.spacing, n, h };
    this.midTex = new THREE.DataTexture(h, n, n, THREE.RedFormat, THREE.FloatType);
    this.midTex.minFilter = this.midTex.magFilter = THREE.NearestFilter;
    this.midTex.unpackAlignment = 1;
    this.midTex.needsUpdate = true;
  }

  midHeight(x, z) {
    const m = this.mid;
    const fx = Math.min(Math.max((x + m.half) / m.sp, 0), m.n - 1.001), fz = Math.min(Math.max((z + m.half) / m.sp, 0), m.n - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * m.n + i, H = m.h;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + m.n] * (1 - tx) + H[r + m.n + 1] * tx) * tz;
  }

  /** Bake mountain shadows (R) and sky visibility (G) on the GPU, for the tile and the mid ring. */
  bakeSunMask(renderer) {
    this.sunMask = this.bakeMask(renderer, 1024, this.size, 4.0, 6.0);
    globals.sunMaskTex.value = this.sunMask.texture;
    if (this.mid) {
      const size = this.mid.half * 2;
      this.sunMaskMid = this.bakeMask(renderer, MIDTERRAIN.maskRes, size, 12.0, 15.0);
      globals.sunMaskMidTex.value = this.sunMaskMid.texture;
      globals.midSize.value = size;
    }
  }

  /**
   * bakeSunMask() in horizontal strips with a yield between them (same result). The bake is one heavy
   * full-screen pass (240 sun steps + 8×14 sky steps per texel); as a single draw it held the GPU for
   * 1–3 s, freezing the loading screen's hero shot (a worker drawing on the same GPU) mid-map-load.
   */
  async bakeSunMaskSliced(renderer, strips = 8) {
    this.sunMask = await this.bakeMask(renderer, 1024, this.size, 4.0, 6.0, strips);
    globals.sunMaskTex.value = this.sunMask.texture;
    if (this.mid) {
      const size = this.mid.half * 2;
      this.sunMaskMid = await this.bakeMask(renderer, MIDTERRAIN.maskRes, size, 12.0, 15.0, strips);
      globals.sunMaskMidTex.value = this.sunMaskMid.texture;
      globals.midSize.value = size;
    }
  }

  /** strips > 1: renders in strips and returns a Promise of the target (yields between strips). */
  bakeMask(renderer, res, outSize, t0, s0, strips = 1) {
    const rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.UnsignedByteType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    const mid = this.mid;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        hmap: { value: this.heightTex }, size: { value: this.size }, res: { value: this.res },
        spacing: { value: this.spacing }, sunDir: { value: SUN_DIR },
        mmap: { value: this.midTex ?? this.heightTex }, msize: { value: mid ? mid.half * 2 : 0 },
        mres: { value: mid ? mid.n : 2 }, mspacing: { value: mid ? mid.sp : 1 },
        outSize: { value: outSize }, t0: { value: t0 }, s0: { value: s0 },
      },
      vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        precision highp float;
        in vec2 vUv; out vec4 outColor;
        uniform sampler2D hmap; uniform float size; uniform float res; uniform float spacing; uniform vec3 sunDir;
        uniform sampler2D mmap; uniform float msize; uniform float mres; uniform float mspacing;
        uniform float outSize; uniform float t0; uniform float s0;
        float grid(sampler2D tx, vec2 xz, float sz, float rs, float sp) {
          vec2 f = (xz + sz * 0.5) / sp;
          ivec2 i = ivec2(clamp(floor(f), vec2(0.0), vec2(rs - 2.0)));
          vec2 t = clamp(f - vec2(i), 0.0, 1.0);
          float a = texelFetch(tx, i, 0).r, b = texelFetch(tx, i + ivec2(1, 0), 0).r;
          float c = texelFetch(tx, i + ivec2(0, 1), 0).r, d = texelFetch(tx, i + ivec2(1, 1), 0).r;
          return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
        }
        bool inTile(vec2 p) { return abs(p.x) < size * 0.5 && abs(p.y) < size * 0.5; }
        bool inside(vec2 p) { return inTile(p) || (abs(p.x) < msize * 0.5 && abs(p.y) < msize * 0.5); }
        float H(vec2 p) { return inTile(p) ? grid(hmap, p, size, res, spacing) : grid(mmap, p, msize, mres, mspacing); }
        void main() {
          vec2 xz = vUv * outSize - outSize * 0.5;
          float h0 = H(xz) + 1.0;
          vec2 d = normalize(sunDir.xz);
          float tanE = sunDir.y / length(sunDir.xz);
          float vis = 1.0;
          float t = t0;
          for (int i = 0; i < 240; i++) {
            vec2 p = xz + d * t;
            if (!inside(p)) break;
            float diff = (h0 + t * tanE - H(p)) / t;
            vis = min(vis, smoothstep(-0.012, 0.012, diff));
            t += t0 * 0.5 + t * 0.028;
          }
          float occ = 0.0;
          for (int k = 0; k < 8; k++) {
            float a = float(k) * 0.785398;
            vec2 dd = vec2(cos(a), sin(a));
            float m = 0.0;
            float s = s0;
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
    const done = () => { quad.geometry.dispose(); mat.dispose(); return rt; };
    const draw = () => {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
    };
    if (strips <= 1) { draw(); return done(); }
    return (async () => {
      const h = Math.ceil(res / strips), ac = renderer.autoClear;
      renderer.autoClear = false;
      rt.scissorTest = true;
      try {
        for (let y = 0; y < res; y += h) {
          rt.scissor.set(0, y, res, Math.min(h, res - y));
          draw();
          await new Promise((r) => setTimeout(r, 16));
        }
      } finally {
        rt.scissorTest = false;
        renderer.autoClear = ac;
      }
      return done();
    })();
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
    // Far forest band: real mountains use their own treeline and keep forest to the horizon.
    const farU = snowUniforms();
    if (this.course?.treeline) farU.uFarForest.value.set(this.course.treeline, 350, 1e6);
    // uFarNear: x = distance (m) out to which low / medium draw real rock structure on the mid ring
    // and backdrop, y = strength of the near ribs / gullies relief (MIDTERRAIN in scene.js).
    this.farUniforms = { ...farU, noiseTex: { value: tex.noise }, uFarNear: { value: new THREE.Vector2(MIDTERRAIN.rockDetailDist, MIDTERRAIN.nearRelief) } };
    this.material = this.makeMaterial();
    this.material.defines = { SNOW_TRACKS: 2, SNOW_SPARKLE: 1, SNOW_TREEMASK: 1, SNOW_FLUTES: 1 };
    this.farMaterial = this.makeFarMaterial();
    this.farMaterial.defines = { ROCK_FAR: 1 };
  }

  makeMaterial() {
    const m = toonMaterial({
      name: 'terrainSnow', uniforms: { ...this.terrainUniforms, ...this.morph },
      fragPars: SNOW_COMMON_PARS + SNOW_PARS_GLSL, frag: SNOW_FRAG_GLSL, band: SNOW_BAND_GLSL,
      vertPars: TERRAIN_MORPH_PARS, vertPre: TERRAIN_MORPH_GLSL,
    });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
    return m;
  }

  makeFarMaterial() {
    const m = toonMaterial({
      name: 'terrainFarSnow', uniforms: { ...this.farUniforms, ...this.midMorph },
      fragPars: SNOW_COMMON_PARS + 'vec3 tN; uniform vec2 uFarNear;', frag: FAR_SNOW_FRAG_GLSL, band: SNOW_BAND_GLSL,
      vertPars: TERRAIN_MORPH_PARS, vertPre: TERRAIN_MORPH_GLSL,
    });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
    return m;
  }

  /** Shader defines of the terrain / backdrop materials for a quality level. */
  qualityDefines(q) {
    const T = PERF.terrain[perfQ(q)];
    // Quality tiers: low = no glints / plain normal-mapped tracks / no fine wind detail;
    // medium = glints, cheaper rock; high = parallax trenches, full rock, fall-line flutes.
    const d = { SNOW_TRACKS: T.tracks, SNOW_TREEMASK: 1 };
    if (T.rockLite) d.ROCK_LITE = 1;
    if (T.sparkle) d.SNOW_SPARKLE = 1;
    if (q === 2) d.SNOW_FLUTES = 1;          // fall-line flutes on steep snow: high only
    if (q >= 1 && PERF.rockMacro) d.ROCK_MACRO = 1;   // buttress facets (+ near joint columns on medium) on tile rock
    // Backdrop + mid ring cover much of the screen: full faceted rock / flutes on high only.
    const far = q === 2 ? { ROCK_FAR: 1 } : { FAR_LITE: 1, ROCK_LITE: 1 };
    return { terrain: d, far };
  }

  /** Fresh terrain + backdrop materials set up as quality q would (for background shader warm-up). */
  qualityMaterials(q) {
    const { terrain, far } = this.qualityDefines(q);
    const a = this.makeMaterial(), b = this.makeFarMaterial();
    a.defines = terrain; b.defines = far;
    return [a, b];
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
    this.buildMid();
    this.buildFar();
  }

  /** Mid-detail ring: chunks of the 10 m grid with 3 LODs and skirts; sinks inside the tile. */
  buildMid() {
    this.midChunks = [];
    if (!this.mid) return;
    const m = this.mid, C = MIDTERRAIN.chunkCells;
    const per = Math.ceil((m.n - 1) / C);
    this.midIndices = [];
    for (let lod = 0; lod < 3; lod++) {
      const n = C >> lod, w = n + 3;
      const idx = new Uint32Array((w - 1) * (w - 1) * 6);
      let k = 0;
      for (let j = 0; j < w - 1; j++) for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      this.midIndices.push(new THREE.BufferAttribute(idx, 1));
    }
    this.midCache = new Map();
    this.midLodDistances ??= MIDTERRAIN.lodDist.slice();
    for (let cz = 0; cz < per; cz++) for (let cx = 0; cx < per; cx++) {
      const x0 = -m.half + cx * C * m.sp, z0 = -m.half + cz * C * m.sp, x1 = x0 + C * m.sp, z1 = z0 + C * m.sp;
      // Entirely inside the tile (with a margin): never visible.
      if (x0 > -this.half + 80 && x1 < this.half - 80 && z0 > -this.half + 80 && z1 < this.half - 80) continue;
      const mesh = new THREE.Mesh(this.midGeometry(cx, cz, 2), this.farMaterial);
      mesh.userData = { cx, cz, lod: 2, cxw: (x0 + x1) / 2, czw: (z0 + z1) / 2 };
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = 'MidTerrain';
      this.group.add(mesh);
      this.midChunks.push(mesh);
    }
  }

  midGeometry(cx, cz, lod) {
    const key = `${cx}_${cz}_${lod}`;
    if (this.midCache.has(key)) return this.midCache.get(key);
    const m = this.mid, C = MIDTERRAIN.chunkCells;
    const n = C >> lod, step = 1 << lod, w = n + 3;
    const pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3);
    const H = (i, j) => m.h[Math.min(m.n - 1, Math.max(0, j)) * m.n + Math.min(m.n - 1, Math.max(0, i))];
    const th = this.half;
    const morph = new Float32Array(w * w * 2);
    let k = 0;
    for (let j = -1; j <= n + 1; j++) for (let i = -1; i <= n + 1; i++) {
      const ci = Math.min(Math.max(i, 0), n), cj = Math.min(Math.max(j, 0), n);
      const gi = Math.min(cx * C + ci * step, m.n - 1), gj = Math.min(cz * C + cj * step, m.n - 1);
      const x = -m.half + gi * m.sp, z = -m.half + gj * m.sp;
      let y = H(gi, gj);
      // Geomorph target: the next-coarser grid's surface here (lod 2 is the coarsest).
      let yc = y;
      if (lod < 2) {
        const oi = ci & 1, oj = cj & 1;
        if (oi && !oj) yc = (H(gi - step, gj) + H(gi + step, gj)) / 2;
        else if (!oi && oj) yc = (H(gi, gj - step) + H(gi, gj + step)) / 2;
        else if (oi && oj) yc = (H(gi + step, gj - step) + H(gi - step, gj + step)) / 2;
      }
      morph[(k / 3) * 2] = yc - y; morph[(k / 3) * 2 + 1] = lod;
      // Sink under the playable tile (its own skirts close the seam).
      const inside = 1 - smooth(th - 60, th - 4, Math.max(Math.abs(x), Math.abs(z)));
      y -= inside * 40;
      if (i !== ci || j !== cj) y -= 8 + 10 * lod;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const nx = H(gi - 1, gj) - H(gi + 1, gj), ny = 2 * m.sp, nz = H(gi, gj - 1) - H(gi, gj + 1);
      const l = Math.hypot(nx, ny, nz);
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      k += 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aMorph', new THREE.BufferAttribute(morph, 2));
    g.setIndex(this.midIndices[lod]);
    g.computeBoundingSphere();
    this.midCache.set(key, g);
    return g;
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
    const morph = new Float32Array(w * w * 2);
    const Hc = (a, b) => this.heights[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))];
    for (let j = -1; j <= n + 1; j++) {
      for (let i = -1; i <= n + 1; i++) {
        const ci = Math.min(Math.max(i, 0), n), cj = Math.min(Math.max(j, 0), n);
        const gi = Math.min(cx * CHUNK + ci * step, N - 1);
        const gj = Math.min(cz * CHUNK + cj * step, N - 1);
        const skirt = i !== ci || j !== cj;
        const edge = gi === 0 || gj === 0 || gi === N - 1 || gj === N - 1;
        const x = -half + gi * sp, z = -half + gj * sp;
        let y = this.heights[gj * N + gi];
        // Height of the next-coarser grid here (its triangles split along the (i+1, j)-(i, j+1) diagonal).
        let yc = y;
        if (lod < LODS - 1) {
          const oi = ci & 1, oj = cj & 1;
          if (oi && !oj) yc = (Hc(gi - step, gj) + Hc(gi + step, gj)) / 2;
          else if (!oi && oj) yc = (Hc(gi, gj - step) + Hc(gi, gj + step)) / 2;
          else if (oi && oj) yc = (Hc(gi + step, gj - step) + Hc(gi - step, gj + step)) / 2;
        }
        morph[(k / 3) * 2] = yc - y; morph[(k / 3) * 2 + 1] = lod;
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
    g.setAttribute('aMorph', new THREE.BufferAttribute(morph, 2));
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
    // The rim goes to just under the distant ranges' base (they rise in front of it). It used to sink
    // ~900 m under the lowest backdrop point: that left a flat, haze-filled "lake" between the last
    // backdrop ridges and the ranges on most maps.
    const edge = m.spawn ? this.baseHeight(m.spawn.position[0], m.spawn.position[2]) : 2500;
    const rimY = Math.max(m.far_min_height - 900, edge - RING.rimBelow);
    let k = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = -fsize / 2 + i * step, z = -fsize / 2 + j * step;
        const inner = this.mid ? this.mid.half - 150 : this.half;     // sink under the mid ring / tile
        const inside = 1 - smooth(inner - 160, inner - 30, Math.max(Math.abs(x), Math.abs(z)));
        // Outer rim sinks away so the backdrop never ends in a hard box edge (the sky's ranges take over).
        const rim = smooth(fsize / 2 - 4000, fsize / 2, Math.max(Math.abs(x), Math.abs(z)));
        const y = H(x, z) - inside * (this.mid ? 160 : 90) - 2;
        pos[k++] = x; pos[k++] = y + (rimY - y) * rim; pos[k++] = z;
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
    g.setAttribute('aMorph', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));   // no geomorph
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
    // Starts under the backdrop's sinking rim (which goes down from fsize/2 - 4000), so no flat
    // sunken plain shows between the backdrop and the first ridges.
    const inner = Math.max(R.inner, fsize / 2 - R.overlap), outer = Math.min(inner + R.depth, R.maxRadius);
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
        const env = R.envStart + (1 - R.envStart) * smooth(0, R.envRise, t) * (1 - 0.3 * t);
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
    g.setAttribute('aMorph', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));   // no geomorph
    const mesh = new THREE.Mesh(g, this.farMaterial);
    mesh.name = 'DistantRanges';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  setQuality(q) {
    const T = PERF.terrain[perfQ(q)];   // perf tiers: gfx/perf.js
    const s = T.lod;
    this.lodDistances = [280 * s, 600 * s, 1200 * s, 2400 * s];
    this.midLodDistances = MIDTERRAIN.lodDist.map((d) => d * s);
    // A chunk switches when its centre distance minus half its size passes the LOD distance; a vertex
    // can be up to ~0.42 x half a chunk closer than that, so the morph completes that much earlier.
    const slack = this.chunkSize ? this.chunkSize * 0.5 * 0.42 + 2 : 36;
    const ends = this.lodDistances.map((d) => d - slack);
    this.morph.uMorphEnd.value.fromArray(ends);
    this.morph.uMorphLen.value.fromArray(ends.map((e) => Math.max(10, e * PERF.terrainMorph)));
    const midSlack = MIDTERRAIN.chunkCells * (this.mid?.sp ?? 10) * 0.5 * 0.42 + 5;
    const mEnds = this.midLodDistances.map((d) => d - midSlack);
    this.midMorph.uMorphEnd.value.set(mEnds[0], mEnds[1], 1e9, 1e9);
    this.midMorph.uMorphLen.value.set(mEnds[0] * PERF.terrainMorph, mEnds[1] * PERF.terrainMorph, 1, 1);
    if (this.material) {
      const { terrain, far } = this.qualityDefines(q);
      this.material.defines = terrain;
      this.material.needsUpdate = true;
      this.terrainUniforms.uDetail.value = q;
      this.farMaterial.defines = far;
      this.farMaterial.needsUpdate = true;
      this.farUniforms.uFarNear.value.x = MIDTERRAIN.rockDetailDist * (q === 0 ? 0.4 : 1);
    }
    this._lastFocus = null;
  }

  /** LOD a chunk wants for a camera at (x, z). */
  chunkLod(mesh, x, z) {
    const { cx, cz } = mesh.userData;
    const ccx = -this.half + (cx + 0.5) * this.chunkSize, ccz = -this.half + (cz + 0.5) * this.chunkSize;
    const d = Math.max(0, Math.hypot(ccx - x, ccz - z) - this.chunkSize * 0.5);
    for (let l = 0; l < this.lodDistances.length; l++) if (d < this.lodDistances[l]) return [l, d];
    return [LODS - 1, d];
  }

  /**
   * Pick each chunk's LOD (geomorphed, so a swap is invisible). Geometry the camera will need within
   * PERF.terrainLookahead seconds (along its velocity) is built ahead of time within a per-frame budget,
   * and recently used LODs stay cached, so a swap never waits for a build.
   */
  update(camPos, budget = 6) {
    this.morph.uMorphEye.value.copy(camPos);
    const now = performance.now();
    if (this._lastCam) {
      const dt = Math.max(1e-3, (now - this._lastT) / 1000);
      const vx = (camPos.x - this._lastCam.x) / dt, vz = (camPos.z - this._lastCam.z) / dt;
      if (Math.hypot(vx, vz) < 120) this.vel.lerp(new THREE.Vector2(vx, vz), Math.min(1, dt * 4));   // ignore teleports
    } else this._lastCam = new THREE.Vector3();
    this._lastCam.copy(camPos); this._lastT = now;
    const todo = [], ahead = [];
    const look = PERF.terrainLookahead;
    const px = camPos.x + this.vel.x * look, pz = camPos.z + this.vel.y * look;
    for (const mesh of this.chunks) {
      const [lod, d] = this.chunkLod(mesh, camPos.x, camPos.z);
      if (lod !== mesh.userData.lod) todo.push([d, mesh, lod]);
      if (look > 0) {
        const [la, da] = this.chunkLod(mesh, px, pz);
        if (la !== lod && la !== mesh.userData.lod) ahead.push([da, mesh, la]);
      }
    }
    todo.sort((a, b) => a[0] - b[0]);
    for (const [, mesh, lod] of todo) {
      const { cx, cz } = mesh.userData;
      const key = `${cx}_${cz}_${lod}`;
      if (!this.cache.has(key)) { if (budget-- <= 0) continue; }
      mesh.geometry = this.chunkGeometry(cx, cz, lod);
      this.touch(key);
      mesh.userData.lod = lod;
    }
    // Build ahead: the LOD each chunk will want at the predicted camera position.
    ahead.sort((a, b) => a[0] - b[0]);
    for (const [, mesh, lod] of ahead) {
      const { cx, cz } = mesh.userData;
      const key = `${cx}_${cz}_${lod}`;
      if (this.cache.has(key)) { this.touch(key); continue; }
      if (budget-- <= 0) break;
      this.chunkGeometry(cx, cz, lod);
      this.touch(key);
    }
    this.trimCache();
    // Mid ring LOD (cheap to build: ~4k vertices a chunk).
    if (this.midChunks) {
      let mb = Math.max(2, budget + 2);
      for (const mesh of this.midChunks) {
        const u = mesh.userData;
        const d = Math.max(0, Math.hypot(u.cxw - camPos.x, u.czw - camPos.z) - MIDTERRAIN.chunkCells * this.mid.sp * 0.5);
        const lod = d < this.midLodDistances[0] ? 0 : d < this.midLodDistances[1] ? 1 : 2;
        if (lod === u.lod) continue;
        if (!this.midCache.has(`${u.cx}_${u.cz}_${lod}`) && mb-- <= 0) continue;
        mesh.geometry = this.midGeometry(u.cx, u.cz, lod);
        u.lod = lod;
      }
    }
  }

  /** LRU bookkeeping for detailed chunk geometry (LOD 0-2); coarse LODs are small and always kept. */
  touch(key) {
    this._lru ??= new Map();
    this._lru.delete(key);
    this._lru.set(key, true);
  }

  trimCache() {
    if (!this._lru || this._lru.size <= PERF.terrainCache) return;
    // Keep every geometry in use plus the PERF.terrainCache most recently used spare ones (built-ahead
    // or just left behind); dispose older spare ones.
    const inUse = new Set(this.chunks.map((m) => m.geometry));
    let spare = 0;
    for (const key of this._lru.keys()) { const g = this.cache.get(key); if (g && !inUse.has(g)) spare++; }
    for (const key of this._lru.keys()) {
      if (spare <= PERF.terrainCache) break;
      const g = this.cache.get(key);
      if (!g) { this._lru.delete(key); continue; }
      if (inUse.has(g) || Number(key.split('_')[2]) >= 3) continue;
      g.dispose(); this.cache.delete(key); this._lru.delete(key); spare--;
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
