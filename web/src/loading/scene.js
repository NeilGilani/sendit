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

const PIXEL_BUDGET = 2560 * 1440;          // max rendered pixels (CSS px × ratio²) before MSAA
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
    this.simT = 0;
    this.screenT = 0;
  }

  log(m) { this.post('log', { message: m }); }

  async init() {
    const t0 = performance.now();
    const v = this.v = pickVariant(this.opts);
    const r = this.r = v.r;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.debug.checkShaderErrors = !!this.opts.debug;
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
    this.log(`pre-terrain ${Math.round(performance.now() - t0)} ms`);
    const terr = this.terrain = buildTerrain(height, sunDir, nearMat, farMat);
    scene.add(terr.near, terr.far);
    this.log(`terrain ${terr.stats.total} ms, ${terr.stats.verts} verts (${v.mtn}, ${v.tod})`);
    if (T.cloudSea || v.mountain.cloudSea) scene.add(this.cloudSea(v.mountain.seaLevel, terr.coarse));

    // Sun light with a tight shadow box that follows the action (crisp rider shadow on the snow).
    const sun = this.sunLight = new THREE.DirectionalLight(new THREE.Color(...T.sun), 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 400;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // Powder + falling snow.
    const pu = { noiseTex: { value: noise }, uSunCol: globals.uSunCol, uSkyAmb: globals.uSkyAmb, uSunDirA: atmo.uSunDirA };
    this.powder = new Powder(5000, pu);
    this.fx = new PowderFX(this.powder, r);
    scene.add(this.powder.mesh);
    this.snow = new Snowfall(Math.round(900 + 2600 * T.snowfall), {});
    this.snow.uniforms.uAmount.value = 0.35 + 0.65 * Math.min(1, T.snowfall * 1.6);
    this.snow.uniforms.uSnowCol.value.set(T.sun[0] * 0.25 + T.sky[0] * 1.6, T.sun[1] * 0.25 + T.sky[1] * 1.6, T.sun[2] * 0.25 + T.sky[2] * 1.6);
    scene.add(this.snow.mesh);

    this.setupPost();
    this.resize(this.size);
    this.rig = new CameraRig(camera);
    this.establishing();
    // The rider loads in the background; the first trick shot starts once it's dressed.
    this.loadRider().catch((e) => this.post('log', { message: `rider failed: ${e.message}` }));
    // Compile every program on the driver's worker threads (KHR_parallel_shader_compile) before the
    // first frame, so this thread never stalls on a link; the painted backdrop covers the wait.
    this.frame(0, true);
    const tc = performance.now();
    const compiling = this.renderer.compileAsync(this.scene, this.camera);
    // Meanwhile build the post passes' programs (sync, small) by running the chain over an empty scene.
    this.renderPass.scene = new THREE.Scene();
    this.composer.render(0);
    this.renderPass.scene = this.scene;
    await compiling;
    this.stats = { build: Math.round(tc - t0), compile: Math.round(performance.now() - tc) };
    this.log(`build ${this.stats.build} ms, compile ${this.stats.compile} ms`);
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
        void main() {
          vec2 uv = (vW.xz + uHalf) / (2.0 * uHalf);
          float ground = texture2D(uHeight, uv).r;
          vec2 p = vW.xz * 0.00022 + vec2(uTime * 0.0015, 0.0);
          float n = texture2D(noiseTex, p).r * 0.55 + texture2D(noiseTex, p * 3.1 + 0.3).g * 0.3 + texture2D(noiseTex, p * 9.0 + 0.7).r * 0.15;
          float thick = (uLevel - ground) + (n - 0.5) * 260.0;
          float a = smoothstep(-40.0, 160.0, thick);
          // Lit billows: brighter on the sun side of each lump, cool blue in the troughs.
          float nx = texture2D(noiseTex, p + vec2(0.004, 0.0)).r - texture2D(noiseTex, p).r;
          float nz = texture2D(noiseTex, p + vec2(0.0, 0.004)).r - texture2D(noiseTex, p).r;
          float lit = clamp(0.62 + (nx * uSunDirA.x + nz * uSunDirA.z) * -18.0 + uSunDirA.y * 0.6, 0.0, 1.3);
          vec3 col = uSunCol * lit * 0.55 + uSkyAmb * (0.7 + 0.5 * n);
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
    this.ratio = Math.max(0.5, Math.min(base, fit) * this.scale);
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
    await this.renderer.compileAsync(rider.root, this.camera, this.scene);
    rider.root.visible = false;
    this.scene.add(rider.root);
    this.riderReady = true;
    this.log(`rider ready (${v.gear}/${v.gearModel}) at ${Math.round(performance.now())} ms worker time`);
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
    const v = this.v, r = this.r;
    const pool = tricksFor(v.gear);
    let trick = v.trick || r.pick(pool);
    if (!v.trick && trick === this.lastTrick) trick = r.pick(pool);
    let cam = v.cam || r.weighted(CAMERAS, 'w');
    if (!v.cam && cam === this.lastCam) cam = r.weighted(CAMERAS, 'w');
    this.lastTrick = trick; this.lastCam = cam;
    const shot = this.shot = new Shot({ H: this.height.H, line: this.height.line, trick, gear: v.gear, r });
    this.move = planMove(cam, shot, this.sunDir, r, this.height.H);
    if (this.move.t0 != null) shot.tStart = Math.max(shot.tStart, this.move.t0);
    this.simT = shot.tStart;
    this.shotScreen = 0;
    this.shotLen = shot.screenLength();
    this.powder.clear();
    this.rider.root.visible = true;
    const com = shot.pose(this.pl, this.simT, 0, this.fx, this.simT).com;
    this.rider.update(0, this.camera);
    this.rig.start(this.move, com);
    this.mode = 'shot';
    this.dip = 0.6;                         // fade up from the cut
    const T = TRICKS[trick];
    this.post('shot', { info: { trick: T.name, camera: CAMERAS[cam].name, place: v.place, time: TIMES[v.tod].name, gear: v.gear, seed: v.seed } });
  }

  // ------------------------------------------------------------------ frame
  frame(dt, setupOnly = false) {
    dt = Math.min(dt, 1 / 20);
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
      if (this.riderReady && this.estT > 2.6) this.nextShot();
    }
    if (this.mode === 'shot') {
      const sh = this.shot;
      const rate = sh.rate(this.simT);
      const dtr = dt * rate;
      this.simT += dtr;
      this.shotScreen += dt;
      const res = sh.pose(this.pl, this.simT, dtr, this.fx, this.simT);
      com = res.com;
      this.rider.update(dtr, cam);
      const s = Math.min(1, this.shotScreen / this.shotLen);
      this.rig.update(s, com, this.simT, dt);
      if (this.simT >= sh.tEnd - 0.35 && !this.cutting) this.cutting = 0.35;
      if (this.cutting) {
        this.cutting -= dt;
        if (this.cutting <= 0) { this.cutting = 0; this.nextShot(); }
      }
    }
    // Debug: ?loaddebug=cam:px,py,pz,tx,ty,tz,fov pins the camera (frame captures of the set).
    if (typeof this.opts.debug === 'string' && this.opts.debug.startsWith('cam:')) {
      const c = this.opts.debug.slice(4).split(',').map(Number);
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
    // Depth of field: focus on the rider; long lenses get a shallower range.
    if (com) {
      this.dof.target = com;
      const dist = this.rig.focus;
      this.dof.cocMaterial.worldFocusRange = Math.max(3, dist * (cam.fov < 20 ? 0.25 : 0.9));
      this.dofPass.enabled = true;
    } else this.dofPass.enabled = false;
    // Depth of field only while the game isn't in its GPU-heavy last stretch (lobby, compile, prewarm).
    if (this.low || this.stageP >= 0.88) this.dofPass.enabled = false;
    // Sun glare position for the grade.
    const sp = this.sunDir.clone().multiplyScalar(1000).add(cam.position).project(cam);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const facing = Math.max(0, fwd.dot(this.sunDir));
    this.grade.uniforms.get('sunScreen').value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, sp.z < 1 ? facing * facing : 0);
    globals.uTime.value = this.screenT;
    globals.uResolution.value.set(this.size.width, this.size.height);
    if (setupOnly) return;
    this.composer.render(dt);
    this.frames++;
  }

  /** Adaptive resolution: hold ~60 fps while the game loads on the same GPU. */
  adapt(frameMs) {
    // Pacing since the first frame (reported to the page: loadtime.mjs prints it).
    const P = this.pace || (this.pace = { n: 0, over25: 0, over50: 0, max: 0, sum: 0 });
    P.n++; P.sum += frameMs; P.max = Math.max(P.max, frameMs);
    if (frameMs > 25) P.over25++;
    if (frameMs > 50) P.over50++;
    this.ft.push(frameMs);
    if (this.ft.length < 30) return;
    const s = [...this.ft].sort((a, b) => a - b);
    const med = s[Math.floor(s.length * 0.5)], p90 = s[Math.floor(s.length * 0.9)];
    this.ft.length = 0;
    let next = this.scale;
    if (med > 19 || p90 > 30) next = Math.max(0.5, this.scale * 0.88);
    else if (med < 17.8 && this.scale < 1) next = Math.min(1, this.scale * 1.06);   // at vsync: creep back up
    if (Math.abs(next - this.scale) > 0.01) { this.scale = next; this.resize(this.size); }
    this.post('stats', { stats: { medMs: +med.toFixed(1), scale: +this.scale.toFixed(2), ratio: +this.ratio.toFixed(2), frames: this.frames, build: this.stats.build, compile: this.stats.compile, fps: +(1000 * P.n / P.sum).toFixed(1), over25: P.over25, over50: P.over50, maxMs: Math.round(P.max), px: `${Math.round(this.size.width * this.ratio)}x${Math.round(this.size.height * this.ratio)}` } });
  }
}

export { rng };
