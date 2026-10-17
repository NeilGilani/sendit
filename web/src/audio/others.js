// Other skiers on the run (life.js) carving past: the nearest few each get a snow voice — a band of pink
// noise whose level and brightness follow their speed and edge (their roll), placed in 3D with an HRTF panner
// so they swish by left and right and fade with distance. Read-only on life.js.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class OtherRiders {
  constructor(ctx, out, fx, T) {
    this.ctx = ctx; this.T = T;
    this.voices = Array.from({ length: T.voices }, () => {
      const c = ctx, src = c.createBufferSource(); src.buffer = fx.pink; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
      const g = c.createGain(); g.gain.value = 0;
      const pan = c.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = T.refDistance; pan.maxDistance = T.maxDistance; pan.rolloffFactor = T.rolloff;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(pan); pan.connect(out);
      src.start(0, Math.random() * 1.5);
      return { src, lp, g, pan, who: null, on: false };
    });
  }

  /** Per frame. skiers: life.skiers ([{ mesh, speed, roll }]); at: listener position. */
  update(when, skiers, at, active) {
    const T = this.T;
    const near = [];
    if (active && skiers) {
      for (const k of skiers) {
        if (!k.mesh?.visible) continue;
        const p = k.mesh.position, d2 = (p.x - at.x) ** 2 + (p.y - at.y) ** 2 + (p.z - at.z) ** 2;
        if (d2 < T.range * T.range) near.push([d2, k]);
      }
      near.sort((a, b) => a[0] - b[0]);
    }
    const want = near.slice(0, this.voices.length).map((n) => n[1]);
    // keep voices on the skiers they already follow; hand free voices to new ones
    for (const v of this.voices) if (v.who && !want.includes(v.who)) v.who = null;
    for (const k of want) if (!this.voices.some((v) => v.who === k)) { const v = this.voices.find((x) => !x.who); if (v) { v.who = k; v.fresh = true; } }
    for (const v of this.voices) {
      const k = v.who;
      if (!k) { if (v.on) { v.g.gain.setTargetAtTime(0, when, 0.15); v.on = false; } continue; }
      const p = k.mesh.position, edge = clamp(Math.abs(k.roll || 0) / 0.35, 0, 1);
      setPos(v.pan, p, when, v.fresh);
      // Doppler: the panner only places the sound, so shift the noise by the radial speed (c = 343 m/s)
      const d = Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
      if (!v.fresh && v.t !== undefined && when > v.t) {
        const vr = clamp((d - v.d) / (when - v.t), -60, 60);
        v.src.playbackRate.setTargetAtTime(343 / (343 + vr), when, 0.05);
      }
      v.d = d; v.t = when;
      v.fresh = false;
      const lvl = T.gain * Math.pow(clamp(k.speed / 12, 0, 1.5), 1.15) * (0.45 + 0.55 * edge);
      v.g.gain.setTargetAtTime(lvl, when, v.on ? 0.08 : 0.3);
      v.lp.frequency.setTargetAtTime(3500 * Math.pow(Math.max(k.speed, 1) / 5, 0.45) * (0.7 + 0.3 * edge), when, 0.1);
      v.on = true;
    }
  }
}

function setPos(pan, p, when, jump) {
  if (pan.positionX) {
    if (jump) { pan.positionX.setValueAtTime(p.x, when); pan.positionY.setValueAtTime(p.y + 0.3, when); pan.positionZ.setValueAtTime(p.z, when); }
    else { pan.positionX.setTargetAtTime(p.x, when, 0.03); pan.positionY.setTargetAtTime(p.y + 0.3, when, 0.03); pan.positionZ.setTargetAtTime(p.z, when, 0.03); }
  } else pan.setPosition(p.x, p.y + 0.3, p.z);
}
