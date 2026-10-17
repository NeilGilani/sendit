// Powder events for the hero shot (emitted into particles.js Powder on the shot's real-time clock, so
// they play in the same slow motion as the rider):
//   takeoff  snow kicked off the lip, a curtain pouring over the rock band
//   landing  the explosion on touchdown: a rolling mist cloud, thrown clumps and ice glints
//   slash    the wall of spray off the edge in the ride-out turn
//   spray    a light sprinkle (pre-pop compression)
import * as THREE from 'three';

const _v = new THREE.Vector3(), _o = new THREE.Vector3();

export class PowderFX {
  constructor(powder, r) {
    this.p = powder;
    this.r = r;
    this.acc = 0;
  }

  rnd(a, b) { return a + (b - a) * Math.random(); }

  /** Random unit vector in the upper hemisphere biased by `up` (0 = flat disc, 1 = straight up). */
  dir(up) {
    const a = Math.random() * Math.PI * 2;
    const y = up * (0.3 + 0.7 * Math.random());
    const h = Math.sqrt(Math.max(0, 1 - y * y));
    return _v.set(Math.cos(a) * h, y, Math.sin(a) * h);
  }

  takeoff(t, lip, v0) {
    const P = this.p;
    for (let i = 0; i < 70; i++) {
      _o.set(lip.x + this.rnd(-0.8, 0.8), lip.y + this.rnd(0, 0.3), lip.z + this.rnd(-0.6, 0.4));
      const v = this.dir(0.5).multiplyScalar(this.rnd(0.5, 2.5)).addScaledVector(v0, this.rnd(0.25, 0.6));
      P.emit(t + this.rnd(0, 0.08), _o, v, this.rnd(1.0, 2.2), this.rnd(0.03, 0.07), this.rnd(0.02, 0.05), 1);
    }
    for (let i = 0; i < 46; i++) {
      _o.set(lip.x + this.rnd(-1.2, 1.2), lip.y + this.rnd(0, 0.4), lip.z + this.rnd(-1, 0.6));
      const v = this.dir(0.4).multiplyScalar(this.rnd(0.3, 1.4)).addScaledVector(v0, this.rnd(0.15, 0.4));
      P.emit(t + this.rnd(0, 0.15), _o, v, this.rnd(2.2, 4.0), this.rnd(0.18, 0.35), this.rnd(0.7, 1.6), 0);
    }
    for (let i = 0; i < 30; i++) {
      _o.set(lip.x + this.rnd(-0.6, 0.6), lip.y + 0.2, lip.z);
      const v = this.dir(0.6).multiplyScalar(this.rnd(1, 3)).addScaledVector(v0, 0.5);
      P.emit(t, _o, v, this.rnd(0.5, 1.2), 0.012, 0.012, 2);
    }
  }

  landing(t, p, vLand) {
    const P = this.p;
    const vh = _o.set(vLand.x, 0, vLand.z);
    const fwd = vh.clone().normalize();
    const speed = vh.length();
    // Big rolling mist: radial burst + carried downhill with the rider.
    for (let i = 0; i < 300; i++) {
      const o = new THREE.Vector3(p.x + this.rnd(-0.8, 0.8), p.y + this.rnd(0, 0.5), p.z + this.rnd(-0.8, 0.8));
      const v = this.dir(0.55).multiplyScalar(this.rnd(1.5, 6.5)).addScaledVector(fwd, speed * this.rnd(0.25, 0.75));
      v.y += this.rnd(1.0, 4.5);
      P.emit(t + this.rnd(0, 0.12), o, v, this.rnd(4.0, 7.0), this.rnd(0.4, 0.8), this.rnd(2.0, 4.6), 0);
    }
    // Clumps thrown high (they read as the "explosion" in slow motion).
    for (let i = 0; i < 240; i++) {
      const o = new THREE.Vector3(p.x + this.rnd(-0.5, 0.5), p.y + 0.1, p.z + this.rnd(-0.5, 0.5));
      const v = this.dir(0.75).multiplyScalar(this.rnd(2.5, 8.5)).addScaledVector(fwd, speed * this.rnd(0.2, 0.8));
      P.emit(t + this.rnd(0, 0.06), o, v, this.rnd(0.9, 2.2), this.rnd(0.05, 0.14), this.rnd(0.03, 0.08), 1);
    }
    for (let i = 0; i < 90; i++) {
      const o = new THREE.Vector3(p.x + this.rnd(-1, 1), p.y + 0.3, p.z + this.rnd(-1, 1));
      const v = this.dir(0.7).multiplyScalar(this.rnd(1.5, 6)).addScaledVector(fwd, speed * 0.5);
      P.emit(t + this.rnd(0, 0.3), o, v, this.rnd(0.8, 2.0), 0.014, 0.014, 2);
    }
  }

  /** Continuous: call every frame while the edge is biting. */
  slash(t, dt, p, fwd, n, side, speed) {
    const P = this.p;
    this.acc += dt * 520;
    const lat = new THREE.Vector3().crossVectors(fwd, n).normalize().multiplyScalar(-side);   // to the outside of the turn
    while (this.acc > 1) {
      this.acc -= 1;
      const o = new THREE.Vector3(p.x + this.rnd(-0.4, 0.4), p.y + 0.05, p.z + this.rnd(-0.4, 0.4));
      const v = lat.clone().multiplyScalar(this.rnd(3, 8) * Math.min(1.3, speed / 10)).addScaledVector(fwd, speed * this.rnd(0.1, 0.5));
      v.y += this.rnd(2.5, 6);
      const mist = Math.random() < 0.38;
      if (mist) P.emit(t, o, v.multiplyScalar(0.7), this.rnd(2.2, 4.2), this.rnd(0.3, 0.5), this.rnd(1.6, 3.2), 0);
      else P.emit(t, o, v, this.rnd(0.7, 1.6), this.rnd(0.03, 0.08), 0.03, Math.random() < 0.1 ? 2 : 1);
    }
  }

  spray(t, p, fwd, amt) {
    const P = this.p;
    for (let i = 0; i < 30 * amt; i++) {
      const o = new THREE.Vector3(p.x + this.rnd(-0.4, 0.4), p.y + 0.05, p.z + this.rnd(-0.3, 0.3));
      const v = this.dir(0.5).multiplyScalar(this.rnd(0.5, 2)).addScaledVector(fwd, 4);
      P.emit(t, o, v, this.rnd(0.6, 1.4), this.rnd(0.12, 0.25), this.rnd(0.5, 1.0), i % 3 ? 1 : 0);
    }
  }
}
