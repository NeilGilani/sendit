// The rider's breathing (Steep uses breath to carry effort and risk): an exertion meter fills with hard
// riding — speed, load in the turns, big landings — and drains at rest. When the rider slows down after a
// hard run you hear them catch their breath: exhales and inhales as formant-filtered noise, slowing and
// fading as the meter drains. Inside the helmet (first person) it is close; from the chase cam faint.

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class BreathVoice {
  constructor(ctx, out, fx, T) {
    this.ctx = ctx; this.out = out; this.fx = fx; this.T = T;
    this.e = 0;          // exertion 0..1
    this.next = 0;       // seconds to the next breath
    this.inhale = false;
  }

  /** Exertion jolt (hard landing, crash). */
  jolt(k) { this.e = clamp(this.e + k, 0, 1); }

  update(when, dt, r, persp) {
    const T = this.T;
    const work = r.st === 1 ? (r.speed / 20) * 0.5 + Math.max(0, r.load - 1) * 0.8 + r.stop * 0.4 : r.st === 2 ? 0.15 : 0;
    this.e = clamp(this.e + (work * T.fill - T.drain) * dt, 0, 1);
    if ((this.next -= dt) > 0) return;
    const slow = r.speed < T.slowBelow && r.st !== 2 && r.st !== 5;
    if (!slow || this.e < T.from) { this.next = 0.3; this.inhale = false; return; }
    const k = (this.e - T.from) / (1 - T.from), G = T.gain * persp * (0.35 + 0.65 * k);
    if (!this.inhale) this.exhale(when, G, k); else this.inhaleSound(when, G * 0.55, k);
    this.next = this.inhale ? rnd(0.15, 0.3) + (1 - k) * 0.6 : rnd(0.55, 0.75) - k * 0.15;
    this.inhale = !this.inhale;
  }

  exhale(when, G, k) {
    this.n = (this.n || 0) + 1;
    const d = rnd(0.45, 0.65) - 0.1 * k, f = rnd(0.9, 1.1);
    this.fx.noise(when, { buf: 'pink', f: 850 * f, q: 0.9, gain: G, attack: 0.06, hold: d * 0.3, decay: d, type2: 'lowpass', ff2: 3200 });
    this.fx.noise(when, { buf: 'pink', f: 1750 * f, q: 2, gain: G * 0.4, attack: 0.06, hold: d * 0.25, decay: d * 0.8 });
    this.fx.noise(when + 0.02, { buf: 'brown', type: 'lowpass', f: 380, q: 0.7, gain: G * 0.5, attack: 0.05, decay: d * 0.7 });
  }

  inhaleSound(when, G, k) {
    const d = rnd(0.35, 0.5) - 0.08 * k;
    this.fx.noise(when, { f: rnd(1900, 2400), q: 1.4, gain: G, attack: d * 0.6, decay: d * 0.4, type2: 'highpass', ff2: 700 });
  }

  /** A sharp grunt-like huff (crash, very hard landing). */
  huff(when, G) {
    this.fx.noise(when, { buf: 'pink', f: 700, q: 1, gain: G, attack: 0.01, decay: 0.18, type2: 'lowpass', ff2: 2500 });
  }
}
