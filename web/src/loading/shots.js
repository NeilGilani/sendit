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
  const m = { kind, fov: 40, side, sway: r.range(0.15, 0.35), lag: 4.5 };
  // Most moves sit up-slope of the action (+Z) and look down the line: the range, the horn or the sky
  // fills the frame behind the rider instead of the slope.
  switch (kind) {
    case 'dolly': {
      // Side drone at mid-arc height, out over the void beside the arete, tracking down the line a
      // little slower than the rider: the range and sky behind, the rider crossing the frame.
      const d = r.range(14, 19), h = r.range(-1.5, 2);
      const z0 = r.range(-1, 3), z1 = M.z - r.range(4, 9);
      m.pos = (s, com) => V(side * d, A.y + h - s * 5, z0 + (z1 - z0) * ease(s));
      m.fov = r.range(36, 44);
      m.look = (s, com) => com.clone().lerp(M, 0.12);
      break;
    }
    case 'orbit': {
      // Arcs round the apex on the up-slope side while the rider hangs in the air.
      const R = r.range(9, 12.5), h = r.range(0.5, 3.5);
      const a0 = side * r.range(1.25, 1.6), a1 = side * r.range(0.25, 0.55);   // from the side round toward behind
      m.fov = r.range(40, 48);
      m.pos = (s) => { const a = a0 + (a1 - a0) * ease(s); return V(A.x + Math.sin(a) * R, A.y + h - s * 1.5, A.z + Math.cos(a) * R); };
      m.look = (s, com) => com.clone().lerp(A, 0.3);
      m.minPitch = -18;
      m.targets = [A, M];                  // from behind the lip the touchdown is hidden: don't climb to see it
      break;
    }
    case 'low': {
      // Cliff-base up-shot: low beside the foot of the rock band, looking up as the rider flies over
      // against the sky, then panning down to the touchdown.
      const x = side * r.range(9, 13), z = -shot.line.cliffLen - r.range(6, 10);
      m.a = V(x, H(x, z) + 1.2, z);
      m.b = V(x + side * 1.5, H(x + side * 1.5, z - 2.5) + 1.4, z - 2.5);
      m.fov = r.range(46, 54);
      m.pos = (s) => m.a.clone().lerp(m.b, ease(s));
      m.look = (s, com) => com.clone().add(V(0, 0.5, 0));
      m.lag = 3.6;
      m.free = true;                       // may tilt freely (looks up)
      m.t0 = -0.45;                        // join just before the pop (the in-run is behind the band)
      m.targets = [A, M, shot.com(shot.Ta * 0.75, V(0, 0, 0))];
      break;
    }
    case 'tele': {
      // Long lens from far up the shoulder: the range stacked huge behind the rider.
      const d = r.range(35, 60), back = r.range(85, 125);
      m.a = V(side * d, 0, A.z + back);
      m.a.y = Math.max(H(m.a.x, m.a.z) + 3, A.y + r.range(2, 7));
      m.b = m.a.clone().add(V(-side * r.range(4, 10), 0, 0));
      m.fov = r.range(7, 9.5);
      m.pos = (s) => m.a.clone().lerp(m.b, s);
      m.look = (s, com) => com.clone().add(V(0, 0.4, 0));   // at 7–9° any offset loses the rider
      m.lag = 5.5; m.sway = 0.04;
      m.endAfterLanding = 0.7;
      m.maxLift = 40;                      // far up the shoulder the in-run crest can sit in the way
      m.targets = [A, M, shot.com(shot.Ta * 0.25, V(0, 0, 0)), shot.com(shot.Ta * 0.75, V(0, 0, 0)), Lp.clone().add(V(0, 1, 0))];             // from up the shoulder the touchdown is behind the lip: cut on it
      break;
    }
    case 'reveal': {
      m.a = V(side * 4.5, lip.y + 1.8, 7);
      // Pulls back and up over the shoulder, but not so far that the rider becomes a speck.
      m.b = V(side * r.range(15, 22), A.y + r.range(11, 17), r.range(16, 26));
      m.fov = 44;
      m.fov1 = 52;
      m.pos = (s) => m.a.clone().lerp(m.b, ease(smooth(0.05, 1.0, s)));
      m.look = (s, com) => com.clone().lerp(M, 0.1 + 0.15 * s);
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
      return m;
    }
    default: return planMove('dolly', shot, sun, r, H);
  }
  // Clearance + line of sight: lift the whole move until the camera clears the snow and sees the
  // apex, the touchdown and the lip at its key positions (one constant lift keeps the move smooth).
  // Default targets: the arc, the touchdown and the ride-out (convex terrain can hide the slash).
  const ro = (f) => { const o = shot.out[Math.floor((shot.out.length - 1) * f)]; return V(o.x, H(o.x, o.z) + 1, o.z); };
  const targets = m.targets || [A, M, Lp.clone().add(V(0, 0.5, 0)), shot.com(shot.Ta * 0.25, V(0, 0, 0)), ro(0.3), ro(0.55)];
  let lift = 0;
  for (let k = 0; k < (m.maxLift ?? 24) / 0.8; k++) {
    let ok = true;
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const p = m.pos(s, A, 0).add(V(0, lift, 0));
      if (p.y < H(p.x, p.z) + 1.4) { ok = false; break; }
      for (const t of targets) {
        for (let i = 1; i < 12; i++) {
          const q = p.clone().lerp(t, i / 12);
          if (q.y < H(q.x, q.z) + 0.2) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (ok) break;
    lift += 0.8;
  }
  if (lift > 0) { const pos = m.pos; m.pos = (s, com, t) => pos(s, com, t).add(V(0, lift, 0)); }
  m.lift = lift;
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
    // Keep the horizon in frame: never tilt down steeper than the move allows (the rider sits lower).
    const minP = (m.minPitch ?? -13) * Math.PI / 180;
    const dir = this.look.clone().sub(cam.position);
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    if (!m.free && pitch < minP) {
      // …but never so far that the rider drops out of the bottom of the frame.
      const toR = com.clone().sub(cam.position);
      const pr = Math.atan2(toR.y, Math.hypot(toR.x, toR.z));
      const L = Math.min(minP, pr + 0.24 * cam.fov * Math.PI / 180);
      if (L > pitch) cam.lookAt(cam.position.clone().add(V(dir.x, Math.tan(L) * Math.hypot(dir.x, dir.z), dir.z)));
    }
    let fov = m.fov1 ? m.fov + (m.fov1 - m.fov) * ease(s) : m.fov;
    // Portrait screens: widen the vertical FOV so the horizontal framing survives (rider + range).
    if (cam.aspect < 1.2) fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * Math.min(2.2, 1.2 / cam.aspect)) * 180) / Math.PI;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const fd = cam.position.distanceTo(com);
    this.focus += (fd - this.focus) * (1 - Math.exp(-5 * dt));
  }
}
