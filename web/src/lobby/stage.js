// LobbyStage — the 3D "skeleton" scene behind the lobby UI: the player's rider on a snowy turntable
// with soft daylight, layered hazy ridges, a few pines and light snowfall. Rendered with the main
// WebGLRenderer but its own scene, camera and a light post stack, only while the lobby is visible.
//
// Public API (used by lobby/Lobby.js and tabs through ctx.stage):
//   init(loader)                 build the scene and load the preview rider (rider.js)
//   setEquipment(type, opts)     'skis' | 'snowboard' (hop animation unless { animate:false })
//   setShot(name)                camera framing preset from config.js SHOTS ('full', 'gear', …)
//   setFocusRect({x,y,w,h})      free screen area (CSS px) the rider should be framed in
//   spin(v)                      −1..1 continuous rotation input (keys / right stick)
//   resetView()                  back to the hero angle and default zoom
//   attachPointer(el)            drag to rotate, wheel / pinch to zoom, double-click to reset
//   update(dt) · render(dt) · resize(w, h)
//   gearMode                     'native' | 'builtin' | 'module' | 'placeholder' (what is shown)
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, VignetteEffect } from 'postprocessing';
import { Rider } from '../rider.js';
import { Player, State } from '../player.js';
import { LIGHTING } from '../scene.js';
import { globals, toonMaterial, outlineMaterial, mulberry32, damp } from '../world.js';
import { STAGE, SHOTS, CAMERA, TURNTABLE } from './config.js';
import { applyEquipment, loadEquipmentFactory } from './equipmentBridge.js';
import { createPlaceholderBoard } from './placeholderBoard.js';

const TAU = Math.PI * 2;
const c = (hex) => new THREE.Color(hex);

// 1×1 white texture: the lobby has no baked mountain shadows (see render()).
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

/** Smooth rolling snow height around the stage (flat under the turntable, a bowl further out). */
function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, 6, 34);
  const n = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09 - 0.4) * 0.9
    + Math.sin(x * 0.043 - z * 0.051 + 2.0) * 1.4
    + Math.sin((x + z) * 0.23) * 0.2;
  return -0.24 + k * (n + 0.8) + Math.pow(r / 120, 2) * 5;
}

export class LobbyStage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.name = 'LobbyStage';
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.1, 900);
    this.turntable = new THREE.Group();
    this.turntable.name = 'Turntable';
    this.scene.add(this.turntable);
    this.keyDir = new THREE.Vector3(...STAGE.keyDir).normalize();
    this.size = { w: innerWidth, h: innerHeight };
    this.focus = { x: 0, y: 0, w: innerWidth, h: innerHeight };
    this.shotName = 'full';
    this.shot = { ...SHOTS.full };
    this.yaw = TURNTABLE.heroYaw;
    this.yawVel = 0;
    this.spinInput = 0;
    this.idle = 0;
    this.zoom = 1;
    this.t = 0;
    this.pulse = 0;
    this.hopT = null;
    this.equipment = 'skis';
    this.gearMode = 'builtin';
    this.onGearMode = null;          // callback(mode) — the lobby shows a "placeholder" badge
    this._gearToken = 0;
    this.ready = false;
  }

  async init(loader) {
    this.buildSky();
    this.buildGround();
    this.buildRidges();
    this.buildPlatform();
    this.buildPines();
    this.buildSnowfall();
    this.buildLights();
    await this.buildRider(loader);
    this.setupPost();
    this.ready = true;
  }

  // ------------------------------------------------------------------ scene building
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uZen: { value: c(STAGE.skyZenith) }, uMid: { value: c(STAGE.skyMid) }, uHor: { value: c(STAGE.skyHorizon) },
        uGlow: { value: c(STAGE.sunGlow) }, uSun: { value: this.keyDir },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZen, uMid, uHor, uGlow, uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uMid, smoothstep(-0.02, 0.22, h));
          col = mix(col, uZen, smoothstep(0.22, 0.85, h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += uGlow * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  buildGround() {
    // Radial grid with rings packed near the centre (detail where the camera looks).
    const R = 120, rings = 56, segs = 120;
    const pos = [], idx = [];
    pos.push(0, groundHeight(0, 0), 0);
    for (let i = 1; i <= rings; i++) {
      const r = R * Math.pow(i / rings, 2.1);
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * TAU;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, groundHeight(x, z), z);
      }
    }
    const v = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * segs + (j % segs));
    for (let j = 0; j < segs; j++) idx.push(0, v(1, j + 1), v(1, j));
    for (let i = 1; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = v(i, j), b = v(i, j + 1), cc = v(i + 1, j), d = v(i + 1, j + 1);
        idx.push(a, b, d, a, d, cc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = toonMaterial({
      name: 'lobbySnow', color: 0xfbfdff, rim: 0,
      fragPars: 'uniform vec3 uHaze; uniform vec2 uFade;',
      frag: /* glsl */`
        {
          float f = smoothstep(uFade.x, uFade.y, length(vW.xz));
          diffuseColor.rgb *= 1.0 - f;
          toonAdd = uHaze * f;
        }`,
      uniforms: { uHaze: { value: c(STAGE.skyHorizon) }, uFade: { value: new THREE.Vector2(STAGE.groundFadeNear, STAGE.groundFadeFar) } },
    });
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    ground.name = 'LobbyGround';
    this.scene.add(ground);
  }

  buildRidges() {
    // Layered hazy ranges on the horizon, far → near (flat colours, like the game's backdrop).
    const rnd = mulberry32(17);
    const radii = [330, 250, 190, 140];
    const heights = [70, 52, 36, 22];
    STAGE.ridgeColors.forEach((hex, k) => {
      const segs = 160, R = radii[k];
      const phase = rnd() * TAU;
      const peak = (a) => {
        const s = Math.abs(Math.sin(a * 3 + phase)) * 0.55 + Math.abs(Math.sin(a * 7.3 + phase * 2)) * 0.3 + Math.sin(a * 17 + phase) * 0.08;
        return heights[k] * (0.35 + s);
      };
      const pos = [], col = [], idx = [];
      const base = c(hex), lit = base.clone().lerp(c('#ffffff'), 0.35);
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * TAU;
        const h = peak(a);
        const slope = peak(a + 0.01) - h;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        pos.push(x, -12, z, x, h, z);
        const top = slope > 0 ? lit : base.clone().lerp(lit, 0.25);
        col.push(base.r, base.g, base.b, top.r, top.g, top.b);
        if (j < segs) { const i = j * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = -900 + k;
      m.name = `Ridge${k}`;
      this.scene.add(m);
    });
  }

  buildPlatform() {
    const R = STAGE.platformRadius;
    const profile = [[0, 0], [R - 0.12, 0], [R - 0.04, -0.015], [R, -0.06], [R + 0.03, -0.15], [R + 0.12, -0.23], [R + 0.4, -0.3]]
      .reverse().map(([x, y]) => new THREE.Vector2(x, y));   // outside → in, so faces point up/out
    const g = new THREE.LatheGeometry(profile, 96);
    const snow = toonMaterial({ name: 'lobbyPlatform', color: 0xf4f8ff, rim: 0.25 });
    const disc = new THREE.Mesh(g, snow);
    disc.receiveShadow = true;
    disc.castShadow = true;
    disc.add(new THREE.Mesh(g, outlineMaterial(1.1)));
    this.turntable.add(disc);

    // Neon ring + inner guide rings (rotate with the turntable so spinning reads clearly).
    this.ringMat = new THREE.MeshBasicMaterial({ color: c(STAGE.neon).multiplyScalar(2.2), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.018, 8, 160), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.006;
    this.turntable.add(ring);
    const guide = toonMaterial({ name: 'lobbyGuide', color: 0xc9dbff, rim: 0 });
    guide.polygonOffset = true; guide.polygonOffsetFactor = -2;
    for (const r of [0.75, 1.3]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.012, r + 0.012, 96), guide);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.002;
      m.receiveShadow = true;
      this.turntable.add(m);
    }
    // Tick marks around the rim (pink every 45°).
    const tickG = new THREE.BoxGeometry(0.035, 0.012, 0.16);
    const tickA = toonMaterial({ name: 'lobbyTick', color: 0xb9ccf2, rim: 0 });
    this.tickMat = new THREE.MeshBasicMaterial({ color: c(STAGE.neon2).multiplyScalar(1.6), toneMapped: false });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      const major = i % 4 === 0;
      const t = new THREE.Mesh(tickG, major ? this.tickMat : tickA);
      t.position.set(Math.cos(a) * (R - 0.42), 0.004, Math.sin(a) * (R - 0.42));
      t.rotation.y = -a + Math.PI / 2;
      t.scale.z = major ? 1.3 : 0.7;
      this.turntable.add(t);
    }
  }

  buildPines() {
    const rnd = mulberry32(5);
    const geo = pineGeometry();
    const mat = toonMaterial({ name: 'lobbyPine', vertexColors: true, rim: 0.2 });
    const outline = outlineMaterial(1.0);
    // Framing the shot: clusters left and right behind the rider, sparser far away.
    const spots = [
      [-8.5, -12, 1.0], [-11, -16, 1.25], [-6.5, -19, 0.9], [-14, -10, 1.1], [-16, -21, 1.4], [-9, -26, 1.2],
      [8.5, -13, 1.15], [12, -10, 0.95], [12.5, -19, 1.35], [6.5, -22, 1.0], [17, -14, 1.2], [19, -27, 1.5],
      [-26, -34, 1.6], [-20, -42, 1.5], [24, -38, 1.7], [30, -30, 1.4], [-34, -22, 1.5], [36, -46, 1.8],
      [-4, -30, 1.3], [3, -38, 1.5], [-12, 6, 1.1], [13, 7, 1.2],
    ];
    for (const [x, z, s] of spots) {
      const scale = s * (0.85 + rnd() * 0.3) * 1.15;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, groundHeight(x, z) - 0.15, z);
      m.scale.set(scale, scale * (0.9 + rnd() * 0.3), scale);
      m.rotation.y = rnd() * TAU;
      m.castShadow = Math.hypot(x, z) < 14;
      m.receiveShadow = true;
      m.add(new THREE.Mesh(geo, outline));
      this.scene.add(m);
    }
  }

  buildSnowfall() {
    const n = STAGE.flakes, B = STAGE.flakeBox;
    const rnd = mulberry32(9);
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (rnd() - 0.5) * B * 1.6; p[i * 3 + 1] = rnd() * B * 0.6; p[i * 3 + 2] = (rnd() - 0.5) * B - 2; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const x = cv.getContext('2d');
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.PointsMaterial({ size: 0.055, map: tex, transparent: true, depthWrite: false, opacity: 0.85, color: 0xffffff });
    this.flakes = new THREE.Points(g, m);
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(c(LIGHTING.skyAmbient), c(LIGHTING.groundAmbient), LIGHTING.hemiIntensity));
    // Same colour/intensity as the game's sun so the toon shader's shadow ratio stays calibrated.
    const key = new THREE.DirectionalLight(c(LIGHTING.sunColor), LIGHTING.sunIntensity);
    key.position.copy(this.keyDir).multiplyScalar(20);
    key.castShadow = true;
    const s = key.shadow;
    const h = STAGE.shadowHalf;
    Object.assign(s.camera, { left: -h, right: h, top: h, bottom: -h, near: 2, far: 45 });
    s.camera.updateProjectionMatrix();
    s.mapSize.set(STAGE.shadowMap, STAGE.shadowMap);
    s.bias = -0.0003;
    s.normalBias = 0.015;
    this.scene.add(key, key.target);
    this.key = key;
  }

  async buildRider(loader) {
    // A real Player instance (no terrain, no input) drives the shared Rider rig, so any field the
    // rig reads exists — including ones added later (e.g. for the snowboard stance).
    const flat = {
      getHeight: () => 0,
      getNormal: (_x, _z, _r, out = new THREE.Vector3()) => out.set(0, 1, 0),
      getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }),
    };
    const noInput = { strength: () => 0, justPressed: () => false, key: () => false };
    this.pl = new Player(flat, { findObstacle: () => null, nearest: () => null }, null, noInput);
    this.pl.place(new THREE.Vector3(0, 0, 0), 0);
    this.pl.state = State.GROUNDED;
    this.rider = new Rider(this.pl);
    await this.rider.load(loader);
    this.rider.root.name = 'PreviewRider';
    this.turntable.add(this.rider.root);
  }

  setupPost() {
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.9, luminanceSmoothing: 0.15, mipmapBlur: true, radius: 0.7 });
    composer.addPass(new EffectPass(this.camera, this.bloom, new VignetteEffect({ offset: 0.28, darkness: 0.42 })));
    composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = composer;
    this.resize(this.size.w, this.size.h);
  }

  // ------------------------------------------------------------------ equipment
  /** Show skis or a snowboard. Hops the rider and swaps at the top of the hop. */
  setEquipment(type, { animate = true } = {}) {
    this.equipment = type;
    const token = ++this._gearToken;
    const swap = () => this.applyGear(type, token);
    if (animate && this.ready) this.hop(swap); else return swap();
    return Promise.resolve();
  }

  async applyGear(type, token) {
    if (!this.rider?.model) return;
    if (applyEquipment({ rider: this.rider, player: this.pl }, type) === 'native') {
      this.clearBoard();
      return this.setGearMode('native');
    }
    if (type !== 'snowboard') {
      this.clearBoard();
      this.setSkis(true);
      return this.setGearMode('builtin');
    }
    // No native snowboard yet: try src/equipment/createEquipmentModel, else the placeholder.
    let model = null;
    const factory = await loadEquipmentFactory();
    if (factory) {
      try { model = await factory('snowboard', null); } catch (e) { console.warn('[lobby] createEquipmentModel failed', e); }
    }
    if (token !== this._gearToken) return;   // a newer toggle won
    this.clearBoard();
    this.board = model || createPlaceholderBoard();
    this.rider.visual.add(this.board);
    this.setSkis(false);
    this.setGearMode(model ? 'module' : 'placeholder');
  }

  clearBoard() {
    if (!this.board) return;
    this.board.removeFromParent();
    this.board = null;
  }

  setSkis(v) {
    for (const s of this.rider.skis || []) s.visible = v;
    for (const p of this.rider.poles || []) p.visible = v;
  }

  setGearMode(mode) {
    this.gearMode = mode;
    this.pulse = 1;
    this.onGearMode?.(mode);
  }

  /** Squat → hop → land with squash; `mid` runs at the top of the hop. */
  hop(mid) {
    this.hopT = 0;
    this.hopMid = mid;
  }

  // ------------------------------------------------------------------ camera + controls
  setShot(name) {
    if (SHOTS[name]) this.shotName = name;
  }

  setFocusRect(r) { this.focus = { ...r }; }

  spin(v) { this.spinInput = v; }

  resetView() {
    this.zoom = 1;
    this.idle = TURNTABLE.returnDelay;
    this.yawVel = 0;
  }

  addZoom(f) { this.zoom = THREE.MathUtils.clamp(this.zoom * f, CAMERA.minZoom, CAMERA.maxZoom); }

  attachPointer(el) {
    const pts = new Map();
    let lastX = 0, lastT = 0, pinch0 = 0, zoom0 = 1;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; lastT = performance.now();
      this.dragging = true;
      this.yawVel = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.zoom; }
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.zoom = THREE.MathUtils.clamp(zoom0 * (pinch0 / d), CAMERA.minZoom, CAMERA.maxZoom);
        return;
      }
      const now = performance.now();
      const dx = e.clientX - lastX;
      const dts = Math.max(1, now - lastT) / 1000;
      this.yaw += dx * TURNTABLE.dragSpeed;
      this.yawVel = THREE.MathUtils.lerp(this.yawVel, (dx * TURNTABLE.dragSpeed) / dts, 0.5);
      lastX = e.clientX; lastT = now;
      this.idle = 0;
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        this.dragging = false;
        el.classList.remove('dragging');
        if (performance.now() - lastT > 80) this.yawVel = 0;   // released after holding still
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.addZoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    const T = TURNTABLE;
    // Turntable: drag / keys / stick with inertia, then a slow return to the hero angle.
    if (!this.dragging) {
      if (Math.abs(this.spinInput) > 0.05) { this.yawVel = this.spinInput * T.keySpeed; this.idle = 0; }
      else this.yawVel *= Math.exp(-T.friction * dt);
      this.yaw += this.yawVel * dt;
      this.idle += dt;
      if (this.idle > T.returnDelay && Math.abs(this.yawVel) < 0.05) {
        let d = (T.heroYaw - this.yaw) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        this.yaw += d * (1 - Math.exp(-T.returnRate * dt));
      }
    }
    this.turntable.rotation.y = this.yaw;

    this.animateRider(dt);
    this.updateCamera(dt);

    // Neon ring breathes; flashes when the gear changes.
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    const glow = 1.6 + Math.sin(this.t * 2.2) * 0.25 + this.pulse * 3.0;
    this.ringMat.color.set(STAGE.neon).multiplyScalar(glow);

    // Snowfall drift.
    const p = this.flakes.geometry.attributes.position;
    const B = STAGE.flakeBox;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - dt * (0.45 + (i % 7) * 0.05);
      let x = p.getX(i) + dt * (0.25 + Math.sin(this.t * 0.7 + i) * 0.15);
      if (y < -0.3) y += B * 0.6;
      if (x > B * 0.8) x -= B * 1.6;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  }

  animateRider(dt) {
    const pl = this.pl;
    // Idle: a slow weight shift and a hint of speed so the neon trims glow softly.
    pl.speed = 1.4;
    pl.turnInput = Math.sin(this.t * 0.55) * 0.25 + Math.sin(this.t * 1.3) * 0.08;
    pl.tuck = 0; pl.brake = 0;
    if (this.hopT !== null) {
      this.hopT += dt;
      const squat = 0.16, air = 0.5;
      if (this.hopT < squat) {
        pl.squat = (this.hopT / squat) * 0.9;
      } else if (this.hopT < squat + air) {
        const u = (this.hopT - squat) / air;
        pl.squat = 0;
        pl.state = State.AIR;
        pl.renderPos.y = 4 * 0.34 * u * (1 - u);
        if (this.hopMid && u >= 0.45) { const f = this.hopMid; this.hopMid = null; f(); }
      } else {
        pl.state = State.GROUNDED;
        pl.renderPos.y = 0;
        pl.landingVy = 4.5;
        pl.landingEvent += 1;
        this.hopT = null;
        this.pulse = 1;
      }
    } else {
      pl.squat = Math.max(0, pl.squat - dt * 6);
    }
    this.rider.update(dt, this.camera);
    if (this.board) this.setSkis(false);   // rider.update re-shows the poles every frame
  }

  updateCamera(dt) {
    const want = SHOTS[this.shotName];
    const k = 1 - Math.exp(-CAMERA.shotEase * dt);
    for (const key of ['target', 'pitch', 'frame']) this.shot[key] += (want[key] - this.shot[key]) * k;
    const { w: W, h: H } = this.size;
    const f = this.focus;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2);
    const fh = Math.max(0.2, f.h / H), fw = Math.max(0.2, f.w / W);
    // Fit the subject height into ~80 % of the free area, and its width (≈2 m of gear) into 85 %.
    let d = this.shot.frame / 0.8 / fh / (2 * tanHalf);
    d = Math.max(d, 2.0 / 0.85 / fw / (2 * tanHalf * (W / H)));
    d *= this.zoom;
    this.dist = this.dist === undefined ? d : damp(this.dist, d, 6, dt);
    const pitch = THREE.MathUtils.degToRad(this.shot.pitch);
    const cam = this.camera;
    cam.position.set(0, this.shot.target + Math.sin(pitch) * this.dist, Math.cos(pitch) * this.dist);
    cam.lookAt(0, this.shot.target, 0);
    // Lens shift: centre the rider in the free area instead of the whole window.
    const ox = f.x + f.w / 2 - W / 2, oy = f.y + f.h / 2 - H / 2;
    cam.setViewOffset(W, H, -ox, -oy, W, H);
  }

  resize(w, h) {
    this.size = { w, h };
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  /** Render the stage. The toon shader reads a few world globals; swap in stage values meanwhile. */
  render(dt) {
    if (!this.ready) return;
    const G = globals;
    const saved = { dir: G.uSunDir.value.clone(), mask: G.sunMaskTex.value, water: G.uWater.value };
    G.uSunDir.value.copy(this.keyDir);
    G.sunMaskTex.value = WHITE;
    G.uWater.value = -1e5;
    this.composer.render(dt);
    G.uSunDir.value.copy(saved.dir);
    G.sunMaskTex.value = saved.mask;
    G.uWater.value = saved.water;
  }

  /** Pre-compile shaders so the first lobby frame does not hitch. */
  compile() { if (this.ready) this.renderer.compile(this.scene, this.camera); }
}

/** Stylized pine: stacked faceted cones, dark green with snow on the upper faces, a short trunk. */
function pineGeometry() {
  const parts = [];
  const paint = (g, fn) => {
    g = g.index ? g.toNonIndexed() : g;
    g.computeVertexNormals();
    const n = g.attributes.normal, cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { const cc = fn(n.getY(i), g.attributes.position.getY(i)); col.set([cc.r, cc.g, cc.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const green = c('#22413a'), snow = c('#f3f7ff'), bark = c('#4a3428');
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6);
  trunk.translate(0, 0.45, 0);
  parts.push(paint(trunk, () => bark));
  const tiers = [[1.5, 1.6, 0.6], [1.15, 1.4, 1.5], [0.8, 1.2, 2.3], [0.45, 1.0, 3.0]];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 7, 1);
    cone.translate(0, y + h / 2, 0);
    parts.push(paint(cone, () => green));
    // Snow cap: a slightly wider cone over the top of the tier.
    const ch = h * 0.46;
    const cap = new THREE.ConeGeometry(r * 0.53, ch, 7, 1);
    cap.translate(0, y + h - ch / 2 + 0.03, 0);
    parts.push(paint(cap, () => snow));
  }
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    C.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return merged;
}
