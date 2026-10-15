// LobbyStage — the rider on a snow plinth at the top of the selected map, inside the real game
// world: same terrain, trees, sky, sun, shadows and post stack as a ride, so the lobby looks exactly
// like the game. The stage owns a turntable group (plinth + preview rider) that it adds to the world
// scene, and drives the world camera while the lobby is visible. main.js renders the world as usual.
//
// Public API (used by main.js, lobby/Lobby.js and tabs through ctx.stage):
//   init(loader)                 build the plinth and load the preview rider (rider.js)
//   setSpot({ x, z, heading })   where the plinth stands; heading = the way the camera looks (downhill)
//   activate() / deactivate()    show the turntable and take the camera / hide it and hand the camera back
//   setEquipment(type, opts)     'skis' | 'snowboard' (hop animation unless { animate:false })
//   setShot(name)                camera framing preset from config.js SHOTS ('full', 'gear', …)
//   setFocusRect({x,y,w,h})      free screen area (CSS px) the rider should be framed in
//   spin(v)                      −1..1 continuous rotation input (keys / right stick)
//   resetView()                  back to the hero angle and default zoom
//   attachPointer(el)            drag to rotate, wheel / pinch to zoom, double-click to reset
//   update(dt) · resize(w, h)    per frame (camera + animation) · window size
//   focusPoint                   world position the sun's shadow box should centre on
//   gearMode                     'native' (rider.setEquipment did it) | 'builtin' | 'unsupported'
import * as THREE from 'three';
import { Rider } from '../rider.js';
import { Player, State } from '../player.js';
import { toonMaterial, damp, makeNoiseTexture } from '../world.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../gfx/snow.js';
import { STAGE, SHOTS, CAMERA, TURNTABLE } from './config.js';
import { applyEquipment } from './equipmentBridge.js';

const TAU = Math.PI * 2;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class LobbyStage {
  /**
   * @param {object} o
   * @param {THREE.Scene}             o.scene    the world scene
   * @param {THREE.PerspectiveCamera} o.camera   the world camera (driven only while active)
   * @param {{ getHeight(x, z): number }} o.terrain
   * @param {THREE.Texture} [o.noise]  shared noise texture for the plinth snow
   */
  constructor({ scene, camera, terrain, noise = null }) {
    Object.assign(this, { scene, camera, terrain, noise });
    this.turntable = new THREE.Group();          // rotates: plinth + rider
    this.turntable.name = 'LobbyTurntable';
    this.root = new THREE.Group();               // placed at the spot, faces the camera
    this.root.name = 'LobbyStage';
    this.root.add(this.turntable);
    this.root.visible = false;
    this.focusPoint = new THREE.Vector3();
    this.size = { w: innerWidth, h: innerHeight };
    this.focus = { x: 0, y: 0, w: innerWidth, h: innerHeight };
    this.shotName = 'full';
    this.shot = { ...SHOTS.full };
    this.yaw = TURNTABLE.heroYaw.skis;
    this.yawVel = 0;
    this.spinInput = 0;
    this.idle = 0;
    this.zoom = 1;
    this.t = 0;
    this.pulse = 0;
    this.hopT = null;
    this.equipment = 'skis';
    this.gearMode = 'builtin';
    this.onGearMode = null;          // callback(mode) — the Equipment tab notes an unsupported board
    this.active = false;
    this.ready = false;
    this._target = new THREE.Vector3();
    this.setSpot({ x: 0, z: 0, heading: 0 });
  }

  async init(loader) {
    await this.buildRider(loader);
    this.buildPlinth();
    this.scene.add(this.root);
    this.ready = true;
  }

  /**
   * Stand the plinth at (x, z). `heading` is the camera's view direction (yaw, 0 = looking −Z), so
   * the world behind the rider is what lies that way: downhill, the run and the valley.
   */
  setSpot({ x, z, heading = 0 }) {
    this.spot = { x, z, heading };
    // Plinth top: just above the highest snow under it, so it never sinks into the slope.
    const R = STAGE.platformRadius + 0.4;
    let top = -Infinity, low = Infinity;
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      for (const r of [0, R * 0.5, R]) {
        const h = this.terrain.getHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
        top = Math.max(top, h); low = Math.min(low, h);
      }
    }
    this.top = top + STAGE.plinthLift;
    this.depth = this.top - low + STAGE.plinthBury;     // how far the skirt reaches down
    this.root.position.set(x, this.top, z);
    // Camera direction (from the camera towards the rider) and the side the camera sits on.
    this.viewDir = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    this.root.rotation.y = Math.atan2(-this.viewDir.x, -this.viewDir.z);   // local +Z points at the camera
    this.focusPoint.set(x, this.top, z);
    this.plinthU?.uPlinth.value.set(x, this.top, z, STAGE.platformRadius);
    if (this.plinth) this.buildPlinth();
  }

  // ------------------------------------------------------------------ scene building
  buildPlinth() {
    if (this.plinth) { this.plinth.removeFromParent(); this.plinth.traverse((o) => o.geometry?.dispose()); }
    const g = new THREE.Group();
    g.name = 'LobbyPlinth';
    const R = STAGE.platformRadius, D = this.depth ?? 1;
    // Lathe profile (outside → in so faces point up / out): a packed-snow drum with a rounded lip and
    // a flared skirt that disappears into the slope.
    const pts = [[0, 0], [R - 0.14, 0], [R - 0.05, -0.02], [R, -0.07], [R + 0.03, -0.18], [R + 0.08, -0.45],
      [R + 0.22, -Math.max(0.8, D * 0.6)], [R + 0.7, -D]].reverse().map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(pts, 96);
    const disc = new THREE.Mesh(geo, this.snowMaterial());
    this.plinthU.uPlinth.value.set(this.spot.x, this.top, this.spot.z, R);
    disc.receiveShadow = true;
    disc.castShadow = true;
    g.add(disc);

    // Neon rim + tick marks: rotate with the turntable so spinning reads clearly.
    this.neonBase = new THREE.Color(STAGE.neon);
    this.ringMat = new THREE.MeshBasicMaterial({ color: this.neonBase.clone().multiplyScalar(STAGE.neonGlow), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.16, 0.014, 8, 160), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.004;
    g.add(ring);
    const tickG = new THREE.BoxGeometry(0.03, 0.008, 0.14);
    this.tickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(STAGE.neon2).multiplyScalar(STAGE.neonGlow * 0.75), toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const t = new THREE.Mesh(tickG, this.tickMat);
      t.position.set(Math.cos(a) * (R - 0.36), 0.003, Math.sin(a) * (R - 0.36));
      t.rotation.y = -a + Math.PI / 2;
      g.add(t);
    }
    this.plinth = g;
    this.turntable.add(g);
  }

  /**
   * Packed, hand-shaped snow with the game's snow optics (gfx/snow.js: wrapped sun, blue shade,
   * sheen, glints): fine groomer lines on the top, shovel-smoothed sides with soft lumps, and
   * occlusion where the plinth meets the slope.
   */
  snowMaterial() {
    if (this._snowMat) return this._snowMat;
    const noise = this.noise || (this.noise = makeNoiseTexture(256, 5));
    // Top centre + radius, and the turntable's x axis (the groomer lines spin with it).
    this.plinthU = { uPlinth: { value: new THREE.Vector4() }, uPlinthAxis: { value: new THREE.Vector3(1, 0, 0) } };
    const m = toonMaterial({
      name: 'lobbyPlinthSnow',
      uniforms: { ...snowUniforms(), noiseTex: { value: noise }, ...this.plinthU },
      fragPars: SNOW_COMMON_PARS + 'vec3 tN;\nuniform vec4 uPlinth; uniform vec3 uPlinthAxis;',
      frag: /* glsl */`
        {
          vec3 N = normalize(vWN);
          vec3 rel = vW - uPlinth.xyz;
          float top = smoothstep(0.75, 0.95, N.y);
          // Sides: soft lumps from noise gradients (world space), stronger lower down.
          vec2 q = vec2(atan(rel.z, rel.x) * uPlinth.w, rel.y) * 0.9;
          float a0 = texture2D(noiseTex, q * 0.31).r, ax = texture2D(noiseTex, q * 0.31 + vec2(0.01, 0.0)).r, ay = texture2D(noiseTex, q * 0.31 + vec2(0.0, 0.01)).r;
          vec3 side = normalize(vec3(rel.x, 0.0, rel.z) + 1e-4);
          vec3 tang = vec3(-side.z, 0.0, side.x);
          N = normalize(N + (tang * (ax - a0) + vec3(0.0, 1.0, 0.0) * (ay - a0)) * 5.0 * (1.0 - top));
          // Top: fine groomer lines across the turntable (they spin with it).
          float u = dot(rel, uPlinthAxis) * 9.0;
          float cord = sin(u * 6.2832) * (0.55 + 0.45 * texture2D(noiseTex, vW.xz * 0.6).g);
          N = normalize(N + uPlinthAxis * cord * 0.05 * top);
          tN = N;
          tFP = max(length(dFdx(vW)), length(dFdy(vW)));
          float m1 = texture2D(noiseTex, vW.xz * 0.21).g, m2 = texture2D(noiseTex, vW.xz * 1.7 + 0.3).r;
          diffuseColor.rgb = mix(uSnowAlbedo, uSnowOld, 0.2 + 0.35 * m1 + 0.25 * (1.0 - top)) * (0.97 + 0.06 * m2);
          // Occlusion: the lip shades the wall under it a touch, the slope shades the foot.
          tCavity = mix(0.72, 1.0, smoothstep(-1.4, -0.15, rel.y)) * mix(0.9, 1.0, smoothstep(-0.25, -0.05, rel.y) + top);
          tGlaze = 0.45 * top;
        }`,
      band: SNOW_BAND_GLSL,
    });
    m.defines = { SNOW_SPARKLE: 1 };
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
    };
    return (this._snowMat = m);
  }

  async buildRider(loader) {
    // A real Player instance (no terrain, no input) drives the shared Rider rig, so any field the
    // rig reads exists — including ones added later.
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

  // ------------------------------------------------------------------ visibility + camera ownership
  /** Show the turntable and drive the world camera. */
  activate() {
    this.active = true;
    this.root.visible = true;
    this.dist = undefined;               // jump straight to the framing (no ease from the ride camera)
    this.camera.fov = CAMERA.fov;
    this.camera.near = CAMERA.near;
    this.camera.updateProjectionMatrix();
  }

  /** Hide the turntable and give the camera back (the ride camera sweeps on from where it is). */
  deactivate() {
    this.active = false;
    this.root.visible = false;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ equipment
  /**
   * Show skis or a snowboard. Hops the rider and swaps at the top of the hop. `variant` is the
   * equipment model id (src/equipment) from the equipped catalog item; omitted = the type's default.
   */
  setEquipment(type, { animate = true, variant } = {}) {
    const changed = type !== this.equipment;
    this.equipment = type;
    if (!animate) this.yaw = this.heroYaw();
    else if (changed && !this.dragging && Math.abs(this.yawVel) < 0.05) this.idle = TURNTABLE.returnDelay;   // ease to the new hero angle
    const swap = () => this.applyGear(type, variant);
    if (animate && this.ready) this.hop(swap); else swap();
  }

  /** Swap the preview rider's gear (rider.js builds the model from src/equipment). */
  applyGear(type, variant) {
    if (!this.rider?.model) return;
    const ok = applyEquipment({ rider: this.rider, player: this.pl }, type, variant) === 'native';
    // Without rider.setEquipment the rig keeps its built-in skis: fine for skis, not for a board.
    this.setGearMode(ok ? 'native' : type === 'skis' ? 'builtin' : 'unsupported');
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

  /** The angle the turntable rests at for the current gear (a 3/4 view of the rider's front). */
  heroYaw() { return TURNTABLE.heroYaw[this.equipment] ?? TURNTABLE.heroYaw.skis; }

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
    if (!this.ready || !this.active) return;
    this.t += dt;
    const T = TURNTABLE;
    // Turntable: drag / keys / stick with inertia, then a slow return to the hero angle.
    if (!this.dragging) {
      if (Math.abs(this.spinInput) > 0.05) { this.yawVel = this.spinInput * T.keySpeed; this.idle = 0; }
      else this.yawVel *= Math.exp(-T.friction * dt);
      this.yaw += this.yawVel * dt;
      this.idle += dt;
      if (this.idle > T.returnDelay && Math.abs(this.yawVel) < 0.05) {
        this.yaw += wrapAngle(this.heroYaw() - this.yaw) * (1 - Math.exp(-T.returnRate * dt));
      }
    }
    this.yaw = wrapAngle(this.yaw);
    this.turntable.rotation.y = this.yaw;
    this.turntable.updateMatrixWorld();
    this.plinthU?.uPlinthAxis.value.setFromMatrixColumn(this.turntable.matrixWorld, 0).normalize();

    this.animateRider(dt);
    this.updateCamera(dt);

    // Neon rim breathes; flashes when the gear changes.
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    const glow = STAGE.neonGlow * (1 + Math.sin(this.t * 2.2) * 0.12 + this.pulse * 1.4);
    this.ringMat.color.copy(this.neonBase).multiplyScalar(glow);
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
    const tgt = this._target.set(0, this.shot.target, 0);
    this.root.localToWorld(tgt);
    // Behind the camera is uphill: keep it above the snow there.
    const back = this.viewDir;
    let x = tgt.x - back.x * Math.cos(pitch) * this.dist, z = tgt.z - back.z * Math.cos(pitch) * this.dist;
    let y = tgt.y + Math.sin(pitch) * this.dist;
    y = Math.max(y, this.terrain.getHeight(x, z) + CAMERA.groundClear);
    cam.position.set(x, y, z);
    cam.up.set(0, 1, 0);
    cam.lookAt(tgt);
    // Lens shift: centre the rider in the free area instead of the whole window.
    const ox = f.x + f.w / 2 - W / 2, oy = f.y + f.h / 2 - H / 2;
    cam.setViewOffset(W, H, -ox, -oy, W, H);
    cam.updateMatrixWorld();
  }

  resize(w, h) {
    this.size = { w, h };
  }
}
