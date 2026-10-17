// Camera moves for the loading scene. A move is planned once per shot (from the trick's geometry:
// lip, apex, touchdown, sun side) and evaluated every frame from the shot's progress s (0..1 of screen
// time) and the rider's centre of mass. Every move is slow and continuous — dolly, orbit, crane, long
// lens — with a damped look-at (the operator lags the rider a little), a whisper of drone sway and a
// focus pull onto the rider (drives the depth of field and the snowflake bokeh).
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (x) => x * x * (3 - 2 * x);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * @param {string} kind  CAMERAS key
 * @param {Shot} shot    choreo.js Shot (apex, pLand, mid, v0, Ta)
 * @param {THREE.Vector3} sun  direction toward the sun
 * @param {function} r   seeded random
 * @param {(x:number,z:number)=>number} H
 */
export function planMove(kind, shot, sun, r, H) {
  const A = shot.apex.clone(), M = shot.mid.clone(), Lp = shot.pLand.clone();
  const lip = V(0, H(0, 0) + 1, 0);
  // Put the camera on the side away from the sun, so the rider and the powder are backlit.
  const sunSide = Math.sign(sun.x) || 1;
  const side = r() < 0.78 ? -sunSide : sunSide;
  const keepAbove = (p) => { const g = H(p.x, p.z) + 1.2; if (p.y < g) p.y = g; return p; };
  const m = { kind, fov: 40, side, sway: r.range(0.15, 0.35), lag: 4.5 };
  switch (kind) {
    case 'dolly': {
      const d = r.range(13, 18), h = r.range(0.5, 4.5);   // a touch above the arc: the range sits behind the rider
      m.a = V(side * d, M.y + h, M.z + r.range(4, 8));
      m.b = V(side * d * 0.9, M.y + h - 1.5, M.z - r.range(6, 10));
      m.fov = r.range(30, 38);
      m.look = (s, com) => com.clone().lerp(M, 0.2);
      m.pos = (s) => m.a.clone().lerp(m.b, ease(s));
      break;
    }
    case 'orbit': {
      const R = r.range(8.5, 12), a0 = side > 0 ? r.range(0.15, 0.6) : Math.PI - r.range(0.15, 0.6), sweep = side * r.range(0.9, 1.3) * (r() < 0.5 ? 1 : -1);
      const h = r.range(-1.5, 2.5);
      m.fov = r.range(42, 50);
      m.pos = (s) => V(A.x + Math.cos(a0 + sweep * (s - 0.5)) * R, A.y + h - s * 1.5, A.z + Math.sin(a0 + sweep * (s - 0.5)) * R * 0.8 - 2);
      m.look = (s, com) => com.clone().lerp(A, 0.3);
      break;
    }
    case 'low': {
      const p = V(Lp.x + side * r.range(5, 8), Lp.y + 0.2, Lp.z - r.range(5, 9));
      m.a = keepAbove(p.clone());
      m.b = keepAbove(p.clone().add(V(side * 1.5, 0.6, 2.5)));
      m.fov = r.range(52, 62);
      m.pos = (s) => m.a.clone().lerp(m.b, ease(s));
      m.look = (s, com) => com.clone().lerp(A, 0.25).add(V(0, 1.5, 0));
      m.lag = 3.2;
      break;
    }
    case 'tele': {
      const d = r.range(85, 130);
      m.a = keepAbove(V(side * d, A.y + r.range(-6, 12), A.z - r.range(25, 55)));
      m.b = m.a.clone().add(V(0, 0, -r.range(4, 10)));
      m.fov = r.range(8.5, 12);
      m.pos = (s) => m.a.clone().lerp(m.b, s);
      m.look = (s, com) => com.clone().lerp(M, 0.35);
      m.lag = 2.6; m.sway = 0.04;
      break;
    }
    case 'reveal': {
      m.a = keepAbove(V(side * 4.5, lip.y + 1.5, 7));
      m.b = V(side * r.range(30, 45), A.y + r.range(28, 42), r.range(35, 55));
      m.fov = 46;
      m.fov1 = 58;
      m.pos = (s) => m.a.clone().lerp(m.b, ease(smooth(0.05, 1.0, s)));
      m.look = (s, com) => com.clone().lerp(M, 0.25 + 0.4 * s);
      break;
    }
    case 'follow': {
      // Behind the rider on the in-run, then drifts out over the cliff (like a drone that keeps flying).
      m.fov = 56;
      m.pos = (s, com, t) => {
        const behind = V(side * 1.2, 2.6, 7.5);
        if (t < 0) return com.clone().add(behind);
        const p = V(behind.x + side * t * 1.2, com.y + 2.6 + t * 1.2, 7.5 + com.z * 0.55 - t * 0.6);
        p.y = Math.max(p.y, H(p.x, p.z) + 2);
        return p;
      };
      m.look = (s, com) => com.clone().add(V(0, -0.3, -2));
      m.lag = 6;
      break;
    }
    default: return planMove('dolly', shot, sun, r, H);
  }
  return m;
}

/** Drives a camera with a planned move. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.look = new THREE.Vector3();
    this.focus = 10;
    this.t = 0;
  }

  start(move, com) {
    this.m = move;
    this.look.copy(move.look(0, com));
    this.snap = true;
  }

  update(s, com, tReal, dt) {
    const m = this.m, cam = this.camera;
    this.t += dt;
    const p = m.pos(s, com, tReal);
    // Drone / steadicam sway: two slow sines per axis (centimetres).
    const w = m.sway;
    p.x += (Math.sin(this.t * 0.31) + 0.5 * Math.sin(this.t * 0.73 + 1.3)) * w * 0.25;
    p.y += (Math.sin(this.t * 0.27 + 2.1) + 0.5 * Math.sin(this.t * 0.61)) * w * 0.18;
    cam.position.copy(p);
    const want = m.look(s, com, tReal);
    if (this.snap) { this.look.copy(want); this.snap = false; }
    else this.look.lerp(want, 1 - Math.exp(-m.lag * dt));
    cam.lookAt(this.look);
    const fov = m.fov1 ? m.fov + (m.fov1 - m.fov) * ease(s) : m.fov;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const fd = cam.position.distanceTo(com);
    this.focus += (fd - this.focus) * (1 - Math.exp(-5 * dt));
  }
}
