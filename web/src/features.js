// Liveliness and things to hit: snow kickers (small/medium/large) along the opening run, wind-
// rippling branded flags and a start banner, cheering billboard spectators that bob out of sync,
// and soft animated teal/indigo mist pockets in the valleys. Kickers add to the terrain height field so the
// rider's physics launches off them naturally.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial, globals, mulberry32 } from './world.js';
import { ATMOSPHERE, col } from './scene.js';

const KICKERS = [
  { at: 110, L: 6, H: 1.4, W: 5, name: 'S' },
  { at: 210, L: 9, H: 2.4, W: 6, name: 'M' },
  { at: 330, L: 12, H: 3.6, W: 7, name: 'L' },
];

export class Features {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Features';
    this.kickers = [];
    this.flagPoles = [];
  }

  build(pistes) {
    const T = this.terrain;
    const spawn = T.getSpawn();
    // The run the rider starts on: the piste passing closest to the spawn.
    let best = null, bd = Infinity;
    for (const p of pistes) {
      for (const q of p.line) {
        const d = Math.hypot(q[0] - spawn.position.x, q[2] - spawn.position.z);
        if (d < bd) { bd = d; best = p; }
      }
    }
    const line = best ? best.line.map((q) => new THREE.Vector2(q[0], q[2])) : [];
    let start = 0;
    for (let i = 0; i < line.length; i++) if (line[i].distanceTo(new THREE.Vector2(spawn.position.x, spawn.position.z)) < line[start].distanceTo(new THREE.Vector2(spawn.position.x, spawn.position.z))) start = i;
    const path = line.slice(start);
    if (path.length < 2) {
      const f = new THREE.Vector2(-Math.sin(spawn.heading), -Math.cos(spawn.heading));
      path.splice(0, path.length, new THREE.Vector2(spawn.position.x, spawn.position.z), new THREE.Vector2(spawn.position.x, spawn.position.z).addScaledVector(f, 600));
    }
    this.path = path;
    const at = (d) => {
      let acc = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i].distanceTo(path[i + 1]);
        if (acc + seg >= d || i === path.length - 2) {
          const t = Math.min(1, (d - acc) / seg);
          const p = path[i].clone().lerp(path[i + 1], t);
          const dir = path[i + 1].clone().sub(path[i]).normalize();
          return { p, dir };
        }
        acc += seg;
      }
      return { p: path[0], dir: new THREE.Vector2(0, -1) };
    };

    const snowMat = toonMaterial({ name: 'kicker', vertexColors: true });
    for (const k of KICKERS) {
      const { p, dir } = at(k.at);
      const kick = { o: p, f: dir, r: new THREE.Vector2(-dir.y, dir.x), L: k.L, H: k.H, W: k.W, name: k.name };
      this.kickers.push(kick);
      const mesh = new THREE.Mesh(this.kickerGeometry(kick), snowMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      // Flags at both lip corners + a crowd along the landing.
      for (const side of [-1, 1]) {
        const c = p.clone().addScaledVector(dir, k.L).addScaledVector(kick.r, side * (k.W / 2 + 1.2));
        this.addFlag(c.x, c.y, side > 0 ? 0 : 1);
        if (k.name !== 'S') this.addCrowd(p.clone().addScaledVector(dir, k.L + 10), dir, kick.r, side, k.name === 'L' ? 14 : 8);
      }
    }
    T.features = { heightAt: (x, z, base) => this.heightAt(x, z, base) };

    // Start banner across the run.
    const s0 = at(18);
    this.addBanner(s0.p, s0.dir);
    this.addFogPockets();
    this.buildSpectators();
    this.buildFlags();
  }

  /** Height of park features at x/z (null if none). */
  heightAt(x, z, base) {
    for (const k of this.kickers) {
      const dx = x - k.o.x, dz = z - k.o.y;
      const a = dx * k.f.x + dz * k.f.y;
      if (a < 0 || a > k.L) continue;
      const b = Math.abs(dx * k.r.x + dz * k.r.y);
      const hw = k.W / 2;
      if (b > hw + 0.8) continue;
      const side = b <= hw ? 1 : 1 - (b - hw) / 0.8;
      const shape = k.H * Math.pow(a / k.L, 1.7) * side;
      const g = this.terrain.baseHeight(k.o.x + k.f.x * a, k.o.y + k.f.y * a);
      return Math.max(base, g + shape);
    }
    return null;
  }

  kickerGeometry(k) {
    const T = this.terrain;
    const nA = 16, nB = 8;
    const pos = [], col = [], idx = [];
    const vert = (a, b, lift) => {
      const x = k.o.x + k.f.x * a + k.r.x * b, z = k.o.y + k.f.y * a + k.r.y * b;
      const hw = k.W / 2;
      const ab = Math.abs(b);
      const side = ab <= hw ? 1 : Math.max(0, 1 - (ab - hw) / 0.8);
      const g = T.baseHeight(k.o.x + k.f.x * a, k.o.y + k.f.y * a);
      const y = (lift ? g + k.H * Math.pow(a / k.L, 1.7) * side : T.baseHeight(x, z) - 0.3) + 0.03;
      pos.push(x, y, z);
      const lip = a > k.L - 0.35 && lift ? 1 : 0;
      col.push(lip ? 0.25 : 1, lip ? 0.45 : 1, 1);
    };
    for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) vert((i / nA) * k.L, (j / nB - 0.5) * (k.W + 1.6), true);
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
      const a = i * (nB + 1) + j;
      idx.push(a, a + 1, a + nB + 1, a + 1, a + nB + 2, a + nB + 1);
    }
    // Front wall under the lip.
    const base = pos.length / 3;
    for (let j = 0; j <= nB; j++) {
      const b = (j / nB - 0.5) * (k.W + 1.6);
      vert(k.L, b, true);
      vert(k.L, b, false);
    }
    for (let j = 0; j < nB; j++) {
      const a = base + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- flags & banners
  addFlag(x, z, variant) {
    this.flagPoles.push({ x, z, variant });
  }

  buildFlags() {
    const T = this.terrain;
    const poleG = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6);
    poleG.translate(0, 2.1, 0);
    const poleMat = toonMaterial({ name: 'pole', color: 0x2a2f45 });
    const poles = new THREE.InstancedMesh(poleG, poleMat, this.flagPoles.length);
    const flagG = new THREE.PlaneGeometry(1.4, 0.95, 12, 6);
    flagG.translate(0.7, 3.6, 0);
    const tex = brandTexture();
    const flagMat = toonMaterial({
      name: 'flag', map: tex, side: THREE.DoubleSide,
      vertPre: /* glsl */`
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float along = max(position.x, 0.0);
        transformed.z += sin(position.x * 3.2 - uTime * 7.0 + ip.x) * 0.16 * along;
        transformed.y += sin(position.x * 2.1 - uTime * 5.0 + ip.z) * 0.04 * along;`,
    });
    const flags = new THREE.InstancedMesh(flagG, flagMat, this.flagPoles.length);
    const m = new THREE.Matrix4();
    this.flagPoles.forEach((f, i) => {
      const y = T.getHeight(f.x, f.z);
      m.makeRotationY(0.9 + i);
      m.setPosition(f.x, y - 0.1, f.z);
      poles.setMatrixAt(i, m);
      flags.setMatrixAt(i, m);
    });
    for (const im of [poles, flags]) { im.castShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    this.obstaclePoints = this.flagPoles.map((f) => [f.x, f.z, 0.15, 'flag']);
  }

  addBanner(p, dir) {
    const T = this.terrain;
    const r = new THREE.Vector2(-dir.y, dir.x);
    const width = 16;
    const yaw = Math.atan2(-r.y, r.x);
    const poleG = new THREE.CylinderGeometry(0.12, 0.14, 7, 8);
    poleG.translate(0, 3.5, 0);
    const poleMat = toonMaterial({ name: 'bannerPole', color: 0x2a2f45 });
    for (const s of [-1, 1]) {
      const c = p.clone().addScaledVector(r, s * width / 2);
      const pole = new THREE.Mesh(poleG, poleMat);
      pole.position.set(c.x, T.getHeight(c.x, c.y) - 0.2, c.y);
      pole.castShadow = true;
      this.group.add(pole);
      this.flagPoles.push({ x: c.x, z: c.y, variant: 0, skip: true });
    }
    const g = new THREE.PlaneGeometry(width, 1.6, 24, 4);
    const mat = toonMaterial({
      name: 'banner', map: bannerTexture(), side: THREE.DoubleSide,
      vertPre: 'float edge = 1.0 - pow(abs(position.x) / 8.0, 2.0);\ntransformed.z += sin(position.x * 0.9 - uTime * 3.0) * 0.18 * edge;',
    });
    const banner = new THREE.Mesh(g, mat);
    banner.position.set(p.x, T.getHeight(p.x, p.y) + 6.0, p.y);
    banner.rotation.y = yaw;
    banner.castShadow = true;
    this.group.add(banner);
    this.flagPoles = this.flagPoles.filter((f) => !f.skip);
  }

  // ---------------------------------------------------------------- spectators
  addCrowd(center, dir, r, side, count) {
    this.crowd = this.crowd || [];
    const rnd = mulberry32(this.crowd.length + 17);
    for (let i = 0; i < count; i++) {
      const along = (i / count - 0.5) * 22 + (rnd() - 0.5) * 2;
      const out = 7 + rnd() * 4;
      const c = center.clone().addScaledVector(dir, along).addScaledVector(r, side * out);
      this.crowd.push({ x: c.x, z: c.y, v: Math.floor(rnd() * 4), phase: rnd() * 6.28, speed: 3 + rnd() * 3 });
    }
  }

  buildSpectators() {
    const list = this.crowd || [];
    if (!list.length) return;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(list.length * 3), data = new Float32Array(list.length * 3);
    list.forEach((s, i) => {
      off.set([s.x, this.terrain.getHeight(s.x, s.z) - 0.05, s.z], i * 3);
      data.set([s.v, s.phase, s.speed], i * 3);
    });
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 3));
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: crowdAtlas() }, uTime: globals.uTime },
      vertexShader: /* glsl */`
        attribute vec3 aOffset; attribute vec3 aData;
        uniform float uTime;
        varying vec2 vUv; varying float vVar;
        void main() {
          float bob = abs(sin(uTime * aData.z + aData.y)) * 0.22;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 p = aOffset + right * position.x * 1.15 + vec3(0.0, position.y * 1.9 + bob, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vUv = uv; vVar = aData.x;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D atlas; varying vec2 vUv; varying float vVar;
        void main() {
          vec4 c = texture2D(atlas, vec2((vVar + vUv.x) / 4.0, vUv.y));
          if (c.a < 0.5) discard;
          gl_FragColor = c;
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- valley fog
  addFogPockets() {
    const T = this.terrain;
    const rnd = mulberry32(77);
    const pts = [];
    for (let k = 0; k < 400 && pts.length < 26; k++) {
      const x = (rnd() - 0.5) * T.size * 0.9, z = (rnd() - 0.5) * T.size * 0.9;
      const h = T.baseHeight(x, z);
      if (h < ATMOSPHERE.mistTop - 150) pts.push([x, h + 25 + rnd() * 30, z, 140 + rnd() * 160]);
    }
    if (!pts.length) return;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aFog', new THREE.InstancedBufferAttribute(new Float32Array(pts.flat()), 4));
    geo.instanceCount = pts.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { noise: { value: null }, uTime: globals.uTime, uMistTeal: { value: col(ATMOSPHERE.mistColor) }, uMistDeep: { value: col(ATMOSPHERE.mistDeepColor) } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 aFog; uniform float uTime; varying vec2 vP; varying float vFade; varying float vSeed;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 p = aFog.xyz + right * position.x * aFog.w + up * position.y * aFog.w * 0.32;
          vP = position.xy; vSeed = aFog.x * 0.01;
          float d = length(cameraPosition - aFog.xyz);
          vFade = smoothstep(aFog.w * 0.4, aFog.w * 1.4, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uMistTeal; uniform vec3 uMistDeep; varying vec2 vP; varying float vFade; varying float vSeed;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float r = length(vP * vec2(1.0, 1.6));
          float n = n2(vP * 2.5 + vec2(uTime * 0.03 + vSeed, vSeed)) * 0.6 + n2(vP * 5.0 - uTime * 0.05) * 0.4;
          float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.5) * 0.5 * vFade;
          vec3 c = mix(uMistDeep, uMistTeal, smoothstep(-0.6, 0.7, vP.y + (n - 0.5) * 0.4));
          gl_FragColor = vec4(c, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
  }
}

// ---------------------------------------------------------------- canvas art (fictional brands)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function brandTexture() {
  return canvasTex(256, 176, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ff2fa8'); grad.addColorStop(1, '#ff8a3d');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1446'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = '#fff'; g.font = 'bold italic 54px sans-serif'; g.textAlign = 'center';
    g.fillText('NORTH', w / 2, h * 0.5);
    g.fillStyle = '#2ff5d6'; g.font = 'bold 40px sans-serif';
    g.fillText('WAKE', w / 2, h * 0.92);
  });
}

function bannerTexture() {
  return canvasTex(1024, 104, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#1b1550'); grad.addColorStop(0.5, '#3b2a8c'); grad.addColorStop(1, '#1b1550');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2ff5d6'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.fillStyle = '#ffffff'; g.font = 'bold italic 62px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VALCREST  ·  NORTHWAKE OPEN  ·  SEND IT', w / 2, h / 2 + 3);
  });
}

function crowdAtlas() {
  return canvasTex(512, 256, (g) => {
    const jackets = ['#ff3d7f', '#2ff5d6', '#ffb02e', '#7a5cff'];
    for (let i = 0; i < 4; i++) {
      const x0 = i * 128;
      const cx = x0 + 64;
      g.lineCap = 'round';
      g.strokeStyle = '#151a33'; g.lineWidth = 22;
      // arms up, cheering
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 70 + i * 6); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 66 + i * 5); g.stroke();
      g.strokeStyle = jackets[i]; g.lineWidth = 14;
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 70 + i * 6); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 66 + i * 5); g.stroke();
      // legs
      g.fillStyle = '#151a33';
      g.fillRect(cx - 24, 190, 20, 60); g.fillRect(cx + 4, 190, 20, 60);
      g.fillStyle = '#2b3150';
      g.fillRect(cx - 21, 192, 14, 56); g.fillRect(cx + 7, 192, 14, 56);
      // body
      g.fillStyle = '#151a33'; roundRect(g, cx - 32, 112, 64, 88, 18); g.fill();
      g.fillStyle = jackets[i]; roundRect(g, cx - 27, 117, 54, 78, 14); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(cx - 27, 150, 54, 6);
      // head + beanie
      g.fillStyle = '#151a33'; g.beginPath(); g.arc(cx, 90, 27, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2c7a5'; g.beginPath(); g.arc(cx, 92, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = jackets[(i + 2) % 4]; g.beginPath(); g.arc(cx, 84, 23, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 58, 8, 0, Math.PI * 2); g.fill();
    }
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export { outlineMaterial };
