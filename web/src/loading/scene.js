// The loading scene (runs in loading/worker.js on an OffscreenCanvas): a random variant (variants.js)
// of a slow-motion hero shot — the real rider rig (rider.js + character/ + equipment/) sending a trick
// off a wind lip over a rock band, framed by procedural ranges (terrain.js) under a time-of-day sky
// (sky.js), falling snow and powder (particles.js), with the game's own grade (gfx/post.js GradeEffect)
// plus bloom, depth of field and MSAA.
//
// Flow: build (≈0.3–0.8 s of worker CPU) → an establishing aerial while the rider's glTF loads →
// trick shots, each a new trick + camera move (choreo.js, shots.js) with a quick dip between them.
// The render scale adapts to hold 60 fps (the game is loading on the same GPU).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, DepthOfFieldEffect, NoiseEffect, BlendFunction, SMAAEffect, SMAAPreset } from 'postprocessing';
import { GradeEffect, POST } from '../gfx/post.js';
import { patchShaderChunks, globals, makeNoiseTexture } from '../world.js';
import { PHYSICS } from '../config.js';
import { Player, State } from '../player.js';
import { Rider } from '../rider.js';
import { pickVariant, rng, tricksFor, CAMERAS, TRICKS, TIMES } from './variants.js';
import { atmoUniforms, SkyDome, ATMO_PARS_GLSL } from './sky.js';
import { makeHeight, buildTerrain, terrainMaterial, snowUniformsLite } from './terrain.js';
import { Powder, Snowfall } from './particles.js';
import { PowderFX } from './powderfx.js';
import { Shot } from './choreo.js';
import { planMove, CameraRig } from './shots.js';
import { TreeSystem } from '../gfx/trees.js';
import { StillOverlay } from './still.js';
import { prepareClip, mapNodes, ClipShot, scoreMove } from './clip.js';
import { nodeKeys } from '../thrill/clipcodec.js';

// Camera moves for a saved highlight (the made-up shots' weights, minus the ones built around a big cliff).
const CLIP_CAMS = { hero: { w: 3 }, close: { w: 3.5 }, filmer: { w: 3 }, dolly: { w: 2.5 }, orbit: { w: 2 }, follow: { w: 1.4 }, low: { w: 0.8 }, reveal: { w: 1 } };   // no long lens: from 100 m up the slope a kicker air is a speck
const CAM_NAMES = { filmer: 'Tripod filmer' };

// Max rendered pixels (CSS px × ratio²). A 1440×900 @2× laptop would ask for 5.2 MP; ~3.2 MP + SMAA is
// crisp on a 13'' panel and still holds 30–60 fps next to the booting game (the scaler trims it if not).
// The scaler may go up to the native size when frames have headroom (scale > 1, capped at the DPR).
const PIXEL_BUDGET = 2400 * 1350;
// Frames longer than this are GPU-process stalls (the game linking shaders on the shared GPU thread):
// resolution doesn't change them, so they don't vote in the scaler (they used to drag it to 0.5).
const STALL_MS = 90;
const lum = (c) => 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;

export class LoadingScene {
  constructor(canvas, { width, height, dpr, opts = {} }, post) {
    this.canvas = canvas;
    this.post = post;                       // (type, payload) → main thread
    this.opts = opts;
    this.size = { width, height, dpr };
    this.visible = true;
    this.frames = 0;
    this.ft = [];
    this.scale = 1;
    this.stageP = 0;
    this.timing = { modules: opts.modulesMs ?? 0 };
    this.simT = 0;
    this.screenT = 0;
  }

  log(m) { this.post('log', { message: m }); }

  async init() {
    const t0 = performance.now();
    // The page's painted still, redrawn here until the first rider shot (loading/still.js).
    this.stillOv = this.opts.still?.url ? new StillOverlay(this.opts.still) : null;
    const stillLoad = this.stillOv?.load();
    // A saved highlight (opts.clip, decoded by worker.js): replayed on its own mountain's snow (loading/clip.js).
    // Anything wrong with it → a made-up trick instead (the page drops the clip from the rotation).
    this.clip = null;
    if (this.opts.clip) {
      try { this.clipPrep = prepareClip(this.opts.clip); this.clip = this.opts.clip; } catch (e) { this.post('clipFailed', { id: this.opts.clipId, message: e.message }); }
    }
    const v = this.v = pickVariant({ ...this.opts, clipMeta: this.clip ? this.clip.meta : null });
    if (this.clip) v.clipPrep = this.clipPrep;
    const r = this.r = v.r;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.debug.checkShaderErrors = !!this.opts.debug;
    if (typeof this.opts.debug === 'string' && /(^|;)view(\d)/.test(this.opts.debug)) self.__loadDebugView = Number(/(^|;)view(\d)/.exec(this.opts.debug)[2]);   // 'view1' or 'cam:…;view1'
    PHYSICS.trickStyle = true;              // this worker's own config copy: tweaked grabs on the rig
    patchShaderChunks();

    // Light: the variant's sun (or moon) into the shared toon uniforms the rider's materials read.
    const atmo = this.atmo = atmoUniforms(v);
    const sunDir = this.sunDir = atmo.uSunDirA.value;
    const T = v.time;
    globals.uSunDir.value.copy(sunDir);
    globals.uSunCol.value.setRGB(...T.sun);
    globals.uSkyAmb.value.setRGB(...T.sky);
    globals.uGroundAmb.value.setRGB(...T.ground);
    globals.uSunLum.value = 0.2126 * T.sun[0] + 0.7152 * T.sun[1] + 0.0722 * T.sun[2];
    globals.terrainSize.value = 1e-3;       // no baked game sun mask here (terrain bakes its own)
    globals.uRimColor.value.setRGB(...T.glow).multiplyScalar(0.6);

    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 80000);
    const noise = this.noise = makeNoiseTexture(256, 11);
    const rockTex = new THREE.DataTexture(new Uint8Array([128, 128, 118, 255]), 1, 1);
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.needsUpdate = true;
    this.loadRockTexture(rockTex);

    this.sky = new SkyDome(atmo, noise);
    scene.add(this.sky.mesh);

    // Terrain.
    const height = this.height = makeHeight(v);
    const su = snowUniformsLite(noise, rockTex);
    const nearMat = terrainMaterial(su, atmo);
    const farMat = terrainMaterial(su, atmo, { far: true });
    const terr = this.terrain = buildTerrain(height, sunDir, nearMat, farMat);
    scene.add(terr.near, terr.far);
    if (this.opts.debug === 'noterrshadow') terr.near.castShadow = false;
    this.timing.terrain = terr.stats.total;
    if (T.cloudSea || v.mountain.cloudSea) scene.add(this.cloudSea(v.mountain.seaLevel, terr.coarse));
    if (this.opts.trees !== '0') this.plantTrees();

    // Sun light with a tight shadow box that follows the action (crisp rider shadow on the snow).
    const sun = this.sunLight = new THREE.DirectionalLight(new THREE.Color(...T.sun), 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 400;
    c.updateProjectionMatrix();
    // Grazing low sun on big smooth slopes: generous normal bias, or crests get a black acne line.
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.16;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // Powder + falling snow.
    const pu = { noiseTex: { value: noise }, uSunCol: globals.uSunCol, uSkyAmb: globals.uSkyAmb, uSunDirA: atmo.uSunDirA };
    this.powder = new Powder(5000, pu);
    this.fx = new PowderFX(this.powder, r);
    scene.add(this.powder.mesh);
    this.snow = new Snowfall(Math.round(900 + 4200 * T.snowfall), {});
    if (T.snowfall >= 0.9) this.snow.uniforms.uWind.value.set(3.2, -1.4, 1.2);   // storm: driven snow
    this.snow.uniforms.uAmount.value = 0.35 + 0.65 * Math.min(1, T.snowfall * 1.6);
    this.snow.uniforms.uSnowCol.value.set(T.sun[0] * 0.25 + T.sky[0] * 1.6, T.sun[1] * 0.25 + T.sky[1] * 1.6, T.sun[2] * 0.25 + T.sky[2] * 1.6);
    scene.add(this.snow.mesh);

    this.setupPost();
    this.resize(this.size);
    this.rig = new CameraRig(camera);
    this.establishing();
    // The rider loads in the background; the first trick shot starts once it's dressed.
    this.loadRider().catch((e) => { this.post('log', { message: `rider failed: ${e.message}` }); if (this.clip) this.onClipFail?.(e.message); });
    // Compile every program on the driver's worker threads (KHR_parallel_shader_compile) before the
    // first frame, so this thread never stalls on a link; the painted backdrop covers the wait.
    this.frame(0, true);
    const tc = performance.now();
    const compiling = this.compileHDR(this.scene);
    // Every frame this worker commits must show the still while the page shows it (a black or empty
    // frame would flash over the page's still): wait for it before the first draw of any kind.
    if (stillLoad && !(await Promise.race([stillLoad, new Promise((res) => setTimeout(() => res(false), 2500))]))) this.stillOv = null;
    // Meanwhile build the post passes' programs (sync, small) by running the chain over an empty scene.
    this.renderPass.scene = new THREE.Scene();
    this.composer.render(0);
    this.renderPass.scene = this.scene;
    this.stillOv?.render(this.renderer, this.size.width, this.size.height);
    await compiling;
    this.stats = { build: Math.round(tc - t0), compile: Math.round(performance.now() - tc) };
    this.checkPrograms();
    this.ready = true;

  }

  /**
   * The game's own spruce and fir (gfx/trees.js, same LODs and snow load) on the slopes below the rock
   * band: lone, stunted trees high up, thickening into forest groups down the face, never on the
   * landing line. They give the drop its scale (a 14 m cliff over plain snow reads as any size).
   */
  plantTrees() {
    const t0 = performance.now();
    const H = this.height.H, r = rng((this.v.terrainSeed ^ 0x5eed) >>> 0);
    const ts = this.trees = new TreeSystem(new THREE.Group());
    ts.group.name = 'loadingTrees';
    let n = 0;
    const cap = this.clip ? 800 : 1400;   // a highlight: its own trees by the line, fewer made-up ones around
    for (let i = 0; i < 9000 && n < cap; i++) {
      const z = -55 - Math.pow(r(), 0.8) * 620, x = (r() * 2 - 1) * (40 + 520 * Math.min(1, -z / 500));
      // Clear of the landing and ride-out (a corridor that widens downhill) and the arete above. A clip:
      // clear of its ridden line, and none on its patch (its own trees stand there, below).
      if (this.clip) { if (this.height.inPatch(x, z) || this.height.clear(x, z) < 16) continue; }
      else if (Math.abs(x) < 16 + 0.08 * -z) continue;
      const e = 1.5, y = H(x, z);
      const slope = Math.hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e);
      if (slope > 0.95) continue;                                   // nothing grows on the steep rock
      // Groups: a low-frequency density (clumps) that rises downhill; lone trees near the top.
      const clump = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2.1) * Math.cos(z * 0.052 + x * 0.01);
      const dens = Math.min(1, (-z - 50) / 380) * (0.25 + 0.75 * clump);
      if (r() > dens * dens * 1.4) continue;
      const sc = (0.55 + r() * 0.45) * (0.6 + 0.5 * Math.min(1, (-z - 40) / 300));   // stunted higher up
      const kind = r() < 0.3 ? 1 : 0;
      const w = kind ? 1.05 + r() * 0.2 : 0.85 + r() * 0.25;
      const sy = sc * (0.85 + r() * 0.3);
      ts.add(x, y - 0.3, z, r() * Math.PI * 2, sc * w, sy, sc * w, kind);
      (this.treePts || (this.treePts = [])).push([x, y, z, sy]);
      n++;
    }
    // The real trees beside a highlight's line (recorded with the clip), where they stood on the mountain.
    if (this.clip) for (const [x, z, rad] of this.clipPrep.trees) {
      const sc = Math.min(1.8, Math.max(0.4, rad / 0.4)), sy = sc * (0.9 + r() * 0.2);
      ts.add(x, H(x, z) - 0.3, z, r() * Math.PI * 2, sc, sy, sc, r() < 0.3 ? 1 : 0);
      (this.treePts || (this.treePts = [])).push([x, H(x, z), z, sy]);
      n++;
    }
    ts.build();
    ts.bakeImpostors(this.renderer);   // trees beyond the fronds are baked pictures (gfx/trees.js)
    ts.setQuality(this.opts.q === 'low' ? 0 : 2);
    this.scene.add(ts.group);
    this.timing.trees = Math.round(performance.now() - t0);
    this.timing.treeCount = n;
  }

  /**
   * compileAsync for the programs the frames really use: the scene renders into the composer's HDR
   * target (linear output), a different program variant from the canvas one — compiling for the canvas
   * left the first live frame linking everything synchronously (a 1.8 s stall measured). compile() runs
   * synchronously at the call, so the target only needs binding around it.
   */
  compileHDR(obj, target = null) {
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.composer.inputBuffer);
    let p;
    try { p = r.compileAsync(obj, this.camera, target); } finally { r.setRenderTarget(prev); }
    return p;
  }

  /**
   * A program that fails to link draws nothing, silently (shader error checks are off for speed). After
   * the async compile the link status is free to read: report failures loudly (tests watch for them).
   */
  checkPrograms() {
    const gl = this.renderer.getContext();
    for (const p of this.renderer.info.programs || []) {
      if (p.program && !gl.getProgramParameter(p.program, gl.LINK_STATUS)) this.post('shaderError', { message: `${p.name}: ${gl.getProgramInfoLog(p.program) || 'link failed'}` });
    }
  }

  loadRockTexture(tex) {
    if (typeof createImageBitmap === 'undefined') return;
    fetch('/textures/web/rock_face_03_packed_1k.jpg').then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
      .then((b) => createImageBitmap(b, { imageOrientation: 'flipY' }))
      .then((img) => {
        tex.image = img;
        tex.colorSpace = THREE.NoColorSpace;
        tex.anisotropy = 4;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
      }).catch(() => { /* keep the flat placeholder */ });
  }

  /** Inversion layer: a lit cloud sea in the valleys; thins out where the ground rises through it. */
  cloudSea(level, grid) {
    const n = grid.n;
    const data = new Float32Array(n * n);
    data.set(grid.g);
    const ht = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter;
    ht.needsUpdate = true;
    const u = { ...this.atmo, noiseTex: { value: this.noise }, uHeight: { value: ht }, uHalf: { value: grid.half }, uLevel: { value: level }, uSunCol: globals.uSunCol, uSkyAmb: globals.uSkyAmb, uTime: this.atmo.uSkyTime };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: ATMO_PARS_GLSL + /* glsl */`
        uniform sampler2D noiseTex; uniform sampler2D uHeight; uniform float uHalf; uniform float uLevel; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform float uTime;
        varying vec3 vW;
        float cs(vec2 p) { return texture2D(noiseTex, p).r * 0.55 + texture2D(noiseTex, p * 3.1 + 0.3).g * 0.3 + texture2D(noiseTex, p * 9.0 + 0.7).r * 0.15; }
        void main() {
          vec2 uv = (vW.xz + uHalf) / (2.0 * uHalf);
          float ground = texture2D(uHeight, uv).r;
          vec2 p = vW.xz * 0.00022 + vec2(uTime * 0.0015, 0.0);
          float n = cs(p);
          float thick = (uLevel - ground) + (n - 0.5) * 260.0;
          float a = smoothstep(-40.0, 160.0, thick);
          // Billows: a height field from the noise, lit by the sun (wrapped), cool sky-lit troughs.
          // Soft, broad billows (a steep gradient here mottled the sea into a dalmatian pattern).
          float e = 0.02;
          float hx = cs(p + vec2(e, 0.0)), hz = cs(p + vec2(0.0, e));
          vec3 N = normalize(vec3(-(hx - n) * 7.0, 1.0, -(hz - n) * 7.0));
          float ndl = clamp(dot(N, uSunDirA) * 0.6 + 0.4, 0.0, 1.0);
          float cav = smoothstep(0.15, 0.9, n);
          vec3 col = uSunCol * ndl * (0.3 + 0.22 * cav) + uSkyAmb * (0.5 + 0.3 * cav);
          col = aerial(col, vW);
          gl_FragColor = vec4(col * a, a);
        }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    m.name = 'loadingCloudSea';
    const g = new THREE.PlaneGeometry(52000, 52000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = level;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return mesh;
  }

  setupPost() {
    const renderer = this.renderer, camera = this.camera;
    this.low = this.opts.q === 'low';
    this.still = this.opts.q === 'still';  // ?loadq=still: full size, real DOF, freeze mid-air (scripts/loadingstills.mjs)
    this.high = this.opts.q === 'high' || this.still;   // ?loadq=high: + real depth of field (costs boot time on laptops)
    // No MSAA: on a laptop GPU that is also compiling and warming the game, 4× MSAA on an HDR target
    // (plus DOF) cost ~3 s of boot time; SMAA keeps the edges crisp for a fraction of it.
    const composer = this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, camera);
    composer.addPass(this.renderPass);
    this.dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 10, worldFocusRange: 6, bokehScale: 1.6, resolutionScale: 0.5 });
    this.dofPass = new EffectPass(camera, this.dof);
    composer.addPass(this.dofPass);
    this.bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 2.4, luminanceSmoothing: 0.9, mipmapBlur: true, radius: 0.78 });
    this.grade = new GradeEffect();
    this.grade.uniforms.get('exposure').value = this.v.time.exposure;
    this.grade.uniforms.get('vignette').value = 0.34;
    this.grade.uniforms.get('glare').value = POST.glare * 1.6;
    this.grade.uniforms.get('flare').value = POST.flare;
    this.grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
    this.grain.blendMode.opacity.value = 0.12;
    composer.addPass(new EffectPass(camera, this.bloom, this.grade, this.grain));
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: this.low ? SMAAPreset.LOW : SMAAPreset.HIGH })));
  }

  resize({ width, height, dpr }) {
    this.size = { width, height, dpr };
    const base = Math.min(dpr, 2);
    const fit = Math.sqrt((this.low ? 1280 * 720 : PIXEL_BUDGET) / Math.max(1, width * height));
    this.ratio = Math.min(Math.max(1, dpr), Math.max(0.5, Math.min(base, fit) * this.scale));
    if (this.opts.q === 'still') this.ratio = Math.max(1, dpr);   // stills: the full requested size
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ rider
  async loadRider() {
    const v = this.v;
    const flat = {
      getHeight: (x, z) => this.height.H(x, z),
      getNormal: (_x, _z, _r, out = new THREE.Vector3()) => out.set(0, 1, 0),
      getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }),
    };
    const noInput = { strength: () => 0, justPressed: () => false, key: () => false };
    const pl = this.pl = new Player(flat, { findObstacle: () => null, nearest: () => null }, null, noInput);
    pl.setEquipment(v.gear, v.gearModel);
    if (v.gear === 'snowboard' && pl.setStance) pl.setStance(v.stance);
    pl.place(new THREE.Vector3(0, 0, 10), 0);
    pl.state = State.GROUNDED;
    const rider = this.rider = new Rider(pl);
    await rider.load(new GLTFLoader());
    rider.setOutfit(v.outfit);
    rider.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Compile off-thread (behind the establishing shot) rather than as a hitch on the first trick frame.
    rider.update(0, this.camera);
    await this.compileHDR(rider.root, this.scene);
    this.checkPrograms();
    rider.root.visible = false;
    if (this.clip) {
      // The recording is in map coordinates: a group carries the map → scene transform (clip.js prepareClip).
      const xf = this.clipPrep.xf, g = this.clipGroup = new THREE.Group();
      g.name = 'clipSpace';
      g.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), xf.theta);
      g.position.copy(xf.origin).negate().applyQuaternion(g.quaternion);
      g.position.y = -xf.origin.y;
      g.add(rider.root);
      this.scene.add(g);
      const m = mapNodes(this.clip.keys, rider.root, nodeKeys);
      this.log(`clip: ${m.matched}/${m.total} rig nodes matched · ${this.clip.n} frames · air ${(this.clipPrep.span.land - this.clipPrep.span.takeoff).toFixed(2)} s`);
      if (m.matched < m.total * 0.6) throw new Error(`clip rig mismatch (${m.matched}/${m.total})`);
      this.clipShot = new ClipShot({ clip: this.clip, prep: this.clipPrep, nodes: m.map, rider, group: g, H: this.height.H });
    } else this.scene.add(rider.root);
    this.riderReady = true;
    // One line per load: what was picked and what the startup cost (the rest is in __loading.stats()).
    const T = this.timing;
    this.log(`seed ${v.seed} · ${v.tod} · ${v.mtn} · ${v.gear}/${v.gearModel} — modules ${T.modules} ms, terrain ${T.terrain} ms, trees ${T.trees ?? 0} ms (${T.treeCount ?? 0}), build ${this.stats?.build} ms, compile ${this.stats?.compile} ms, rider ready ${Math.round(performance.now())} ms`);
  }

  // ------------------------------------------------------------------ shots
  /** Before the rider is ready: a slow drone pass along the ridge toward the take-off and the range. */
  establishing() {
    const H = this.height.H, side = -(Math.sign(this.sunDir.x) || 1);
    // Drone glide down the spine toward the lip, looking out over the void to the range.
    const a = new THREE.Vector3(side * 26, Math.max(H(side * 26, 75) + 30, 48), 75), b = new THREE.Vector3(side * 7, H(side * 7, 16) + 9, 16);
    this.est = { a, b, look: new THREE.Vector3(side * -120, -420, -2600), look1: new THREE.Vector3(0, -90, -900) };
    this.mode = 'establishing';
    this.estT = 0;
  }

  nextShot() {
    if (this.clipShot) return this.nextClipShot();
    const v = this.v, r = this.r;
    const pool = tricksFor(v.gear);
    let trick = v.trick || r.pick(pool);
    if (!v.trick && trick === this.lastTrick) trick = r.pick(pool);
    // Night skies are the show: those loads favour the moves that look up or across (sky in frame).
    const cams = v.time.aurora ? { hero: CAMERAS.hero, close: CAMERAS.close, dolly: CAMERAS.dolly, low: CAMERAS.low, follow: CAMERAS.follow, orbit: { w: 0.5 } } : CAMERAS;
    // Most boots end during the first trick: open with a hero move and get to the lip quickly.
    const first = !this.shotCount;
    this.shotCount = (this.shotCount || 0) + 1;
    let cam = v.cam || (first ? r.pick(v.time.aurora ? ['hero', 'close', 'dolly', 'low'] : ['hero', 'hero', 'close', 'close', 'dolly', 'follow']) : r.weighted(cams, 'w'));
    if (!v.cam && cam === this.lastCam) cam = r.weighted(cams, 'w');
    this.lastTrick = trick; this.lastCam = cam;
    const shot = this.shot = new Shot({ H: this.height.H, line: this.height.line, trick, gear: v.gear, r });
    this.move = planMove(cam, shot, this.sunDir, r, this.height.H);
    if (this.move.t0 != null) shot.tStart = Math.max(shot.tStart, this.move.t0);
    if (first) shot.tStart = Math.max(shot.tStart, -1.2);
    if (this.move.endAfterLanding != null) shot.tEnd = Math.min(shot.tEnd, shot.Ta + this.move.endAfterLanding);
    this.simT = shot.tStart;
    this.shotScreen = 0;
    this.shotLen = shot.screenLength();
    this.powder.clear();
    this.rider.root.visible = true;
    if (this.stillOv && !this.stillFadeT) this.stillFadeT = 1e-4;   // dissolve the still into the first shot
    const com = shot.pose(this.pl, this.simT, 0, this.fx, this.simT).com;
    this.rider.update(0, this.camera);
    this.rig.start(this.move, com);
    this.mode = 'shot';
    this.dip = this.stillFadeT && this.stillFadeT < 0.1 ? 0 : 0.6;   // fade up from the cut (not under the still)
    const T = TRICKS[trick];
    this.lastInfo = { trick: T.name, trickId: trick, cam, camera: CAMERAS[cam].name, place: v.place, time: TIMES[v.tod].name, tod: v.tod, mtn: v.mtn, gear: v.gear, seed: v.seed, own: !!v.own, rider: v.riderName };
    this.post('shot', { info: this.lastInfo });
  }

  /** A saved highlight: the same recorded trick, a new camera move each time round. */
  nextClipShot() {
    const v = this.v, r = this.r, shot = this.shot = this.clipShot;
    shot.reset();
    const first = !this.shotCount;
    this.shotCount = (this.shotCount || 0) + 1;
    let cam = v.cam || (first ? r.pick(['hero', 'hero', 'close', 'filmer']) : r.weighted(CLIP_CAMS, 'w'));
    for (let k = 0; k < 4 && !v.cam && cam === this.lastCam; k++) cam = r.weighted(CLIP_CAMS, 'w');
    // The real trees stand close to a real line: plan a few moves and keep the one with the fewest
    // crowns in the lens (the first pick wins ties).
    let best = null;
    for (let k = 0; k < (v.cam ? 3 : 8); k++) {
      const kind = k === 0 || v.cam ? cam : r.weighted(CLIP_CAMS, 'w');
      if (k > 0 && !v.cam && kind === this.lastCam) continue;
      const m = planMove(kind, shot, this.sunDir, r, this.height.H);
      const sc = scoreMove(m, shot, this.treePts || []);
      if (!best || sc < best.sc) best = { m, sc, kind };
      if (sc === 0) break;
    }
    cam = best.kind;
    this.lastCam = cam;
    this.move = best.m;
    this.moveScore = best.sc;
    if (this.move.t0 != null) shot.tStart = Math.max(shot.tStart, this.move.t0 - 0.6);
    shot.tStart = Math.max(shot.tStart, first ? -1.4 : -2.2);
    if (this.move.endAfterLanding != null) shot.tEnd = Math.min(shot.tEnd, shot.Ta + this.move.endAfterLanding + 0.4);
    this.simT = shot.tStart;
    this.shotScreen = 0;
    this.shotLen = shot.screenLength();
    this.powder.clear();
    this.rider.root.visible = true;
    if (this.stillOv && !this.stillFadeT) this.stillFadeT = 1e-4;
    const com = shot.pose(this.pl, this.simT, 0, null, this.simT).com;
    this.rig.start(this.move, com);
    this.mode = 'shot';
    this.dip = this.stillFadeT && this.stillFadeT < 0.1 ? 0 : 0.6;
    const M = this.clip.meta || {};
    this.lastInfo = { trick: M.trick || 'Highlight', trickId: 'clip', cam, camera: CAMERAS[cam]?.name || CAM_NAMES[cam] || cam, treeScore: this.moveScore, place: v.place, time: TIMES[v.tod].name, tod: v.tod, mtn: v.mtn, gear: v.gear, seed: v.seed, own: true, highlight: true, clipId: this.opts.clipId || null, points: M.points || 0, mountain: M.mountain || '', rider: 'Your highlight' };
    this.post('shot', { info: this.lastInfo });
  }

  /** After a frame error: drop the current shot and start a new one (or keep establishing). */
  recover() {
    this.cutting = 0;
    if (this.riderReady) this.nextShot();
  }

  // ------------------------------------------------------------------ frame
  frame(dt, setupOnly = false) {
    dt = Math.min(dt, 1 / 20);
    if (this.frozen) {
      // Still capture: hold the moment; report once a few frames have settled at it.
      dt = 0;
      if (++this.frozen === 6) this.post('frozen', { info: this.lastInfo });
    }
    this.screenT += dt;
    this.atmo.uSkyTime.value = this.screenT;
    const cam = this.camera;
    let com = null;
    if (this.mode === 'establishing') {
      this.estT += dt;
      const s = Math.min(1, this.estT / 9);
      const e = s * s * (3 - 2 * s);
      cam.position.copy(this.est.a).lerp(this.est.b, e);
      cam.lookAt(this.est.look.clone().lerp(this.est.look1, e));
      if (cam.fov !== 54) { cam.fov = 54; cam.updateProjectionMatrix(); }
      this.simT += dt;
      if (this.riderReady && this.estT > (this.opts.cover || this.still ? 0 : 1.8)) this.nextShot();   // cover: a still is showing, go straight to the rider
    }
    if (this.mode === 'shot') {
      const sh = this.shot;
      const rate = sh.rate(this.simT);
      const dtr = dt * rate;
      this.simT += dtr;
      this.shotScreen += dt;
      const res = sh.pose(this.pl, this.simT, dtr, this.fx, this.simT);
      com = res.com;
      if (!sh.isClip) this.rider.update(dtr, cam);   // a clip poses the rig itself (the recording)
      const s = Math.min(1, this.shotScreen / this.shotLen);
      this.rig.update(s, com, this.simT, dt);
      if (this.opts.freeze != null && !this.frozen && this.simT >= sh.Ta * Number(this.opts.freeze)) this.frozen = 1;
      if (this.simT >= sh.tEnd - 0.35 && !this.cutting && !this.frozen) this.cutting = 0.35;
      if (this.cutting) {
        this.cutting -= dt;
        if (this.cutting <= 0) { this.cutting = 0; this.nextShot(); }
      }
    }
    // Debug: ?loaddebug=cam:px,py,pz,tx,ty,tz,fov pins the camera (frame captures of the set).
    if (typeof this.opts.debug === 'string' && this.opts.debug.startsWith('cam:')) {
      const c = this.opts.debug.slice(4).split(';')[0].split(',').map(Number);
      cam.position.set(c[0], c[1], c[2]);
      cam.lookAt(c[3], c[4], c[5]);
      if (c[6] && cam.fov !== c[6]) { cam.fov = c[6]; cam.updateProjectionMatrix(); }
    }
    // Exposure dip around cuts.
    if (this.dip > 0) this.dip = Math.max(0, this.dip - dt);
    const fadeOut = this.cutting ? 1 - this.cutting / 0.35 : 0;
    const fadeIn = this.dip > 0 ? this.dip / 0.6 : 0;
    const expo = this.v.time.exposure * (1 - Math.max(fadeOut, fadeIn * fadeIn));
    this.grade.uniforms.get('exposure').value = expo;

    // Shadow box follows the action (snapped to texels so it never shimmers).
    const focus = com || this.est.b;
    const sl = this.sunLight;
    const tgt = new THREE.Vector3(Math.round(focus.x), Math.round(focus.y), Math.round(focus.z));
    sl.target.position.copy(tgt);
    sl.position.copy(tgt).addScaledVector(this.sunDir, 200);
    sl.target.updateMatrixWorld();
    // Particles + snow on the shot's (slowed) clock.
    this.powder.uniforms.uTime.value = this.simT;
    this.powder.flush();
    const su = this.snow.uniforms;
    su.uTime.value = this.simT;
    su.uFocus.value = this.rig.focus || 12;
    su.uPx.value = (this.size.height * this.ratio * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    su.uCoc.value = 5.0 * su.uPx.value / 400;
    su.uMinPx.value = 1.6 * Math.max(1, this.ratio);   // flakes keep their CSS size at high DPI
    // Depth of field: focus on the rider; long lenses get a shallower range.
    if (com) {
      this.dof.target = com;
      const dist = this.rig.focus;
      this.dof.cocMaterial.worldFocusRange = Math.max(3, dist * (cam.fov < 20 ? 0.25 : 0.9));
      this.dofPass.enabled = true;
    } else this.dofPass.enabled = false;
    // Depth of field only while the game isn't in its GPU-heavy last stretch (lobby, compile, prewarm).
    // Real DOF only on request: it measurably slowed the boot on a laptop GPU; the snowflake bokeh and
    // the long-lens framing carry the shallow-focus look by default.
    if (!this.high || (this.stageP >= 0.88 && !this.still)) this.dofPass.enabled = false;
    // Sun glare position for the grade.
    const sp = this.sunDir.clone().multiplyScalar(1000).add(cam.position).project(cam);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const facing = Math.max(0, fwd.dot(this.sunDir));
    this.grade.uniforms.get('sunScreen').value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, sp.z < 1 ? facing * facing : 0);
    globals.uTime.value = this.screenT;
    this.trees?.update(cam.position);
    globals.uResolution.value.set(this.size.width, this.size.height);
    if (setupOnly || this.opts.q === 'idle') return;   // ?loadq=idle: measure the scene's startup cost alone
    // Under a fully opaque still the live scene only renders now and then (keeps its targets and
    // programs warm without taking GPU time from the booting game).
    const ov = this.stillOv;
    if (ov && this.stillFadeT) { this.stillFadeT += dt; const x = Math.min(1, this.stillFadeT / 1.6); ov.alpha = 1 - x * x * (3 - 2 * x); }
    const hidden = ov && ov.ready && ov.alpha >= 1;
    if (!hidden || this.frames % 8 === 0) this.composer.render(dt);
    if (ov) { ov.render(this.renderer, this.size.width, this.size.height); if (ov.alpha <= 0) this.stillOv = null; }
    this.frames++;
  }

  /** Free the GPU side before a rebuild on the same canvas (a highlight that failed: worker.js fallback). */
  dispose() {
    this.ready = false;
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
    this.composer?.dispose?.();
    this.renderer?.dispose?.();
  }

  /** Adaptive resolution: hold ~60 fps while the game loads on the same GPU. */
  adapt(frameMs) {
    // Pacing since the first frame (reported to the page: loadtime.mjs prints it).
    const P = this.pace || (this.pace = { n: 0, over25: 0, over50: 0, max: 0, sum: 0 });
    P.n++; P.sum += frameMs; P.max = Math.max(P.max, frameMs);
    if (frameMs > 25) P.over25++;
    if (frameMs > 50) P.over50++;
    // Stalls (the GPU thread held by someone else), as [epoch start ms, ms] for lining up with the boot stages.
    if (frameMs > 250 && (P.stalls || (P.stalls = [])).length < 40) P.stalls.push([Math.round(performance.timeOrigin + performance.now() - frameMs), Math.round(frameMs)]);
    if (this.opts.q === 'still') return;
    if (frameMs < STALL_MS) this.ft.push(frameMs);
    if (this.ft.length < 20) return;
    const s = [...this.ft].sort((a, b) => a - b);
    const med = s[Math.floor(s.length * 0.5)], p90 = s[Math.floor(s.length * 0.9)];
    this.ft.length = 0;
    let next = this.scale;
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    // Budget per frame: 60 fps, or a locked 30 once holding 60 would cost too much resolution (the GPU is
    // shared with the booting game; steady 30 fps slow motion at a crisp size beats a soft, jittery 40).
    const T = this.fps30 ? 1000 / 30 : 1000 / 60;
    if (med > T + 2.5 || p90 > T * 1.8 || mean > T * 1.3) next = Math.max(0.7, this.scale * 0.88);
    else if (med < T + 1.2 && this.scale < 1) next = Math.min(1, this.scale * 1.06);   // at budget: creep back up
    else if (p90 < T * 0.7 && this.scale < 1.3) next = this.scale * 1.05;             // headroom: toward native
    if (!this.fps30 && next < 0.8) { this.fps30 = true; next = Math.min(1, next * 1.4); }
    if (Math.abs(next - this.scale) > 0.01) { this.scale = next; this.resize(this.size); }
    this.post('stats', { stats: { medMs: +med.toFixed(1), scale: +this.scale.toFixed(2), ratio: +this.ratio.toFixed(2), frames: this.frames, build: this.stats.build, compile: this.stats.compile, fps: +(1000 * P.n / P.sum).toFixed(1), fps30: !!this.fps30, over25: P.over25, over50: P.over50, maxMs: Math.round(P.max), px: `${Math.round(this.size.width * this.ratio)}x${Math.round(this.size.height * this.ratio)}`, stalls: P.stalls || [] } });
  }
}

export { rng };
