// Village buildings as rideable solids (a copy of Ravenspire's Structure): each has a snow-loaded roof
// surface (rideable through the terrain's features.heightAt hook) and solid walls (features.blockAt). The
// same roof function shapes the snow mesh in props.js, so what you see is what you ride. Rorbuer stand on
// stilts over the water (their ground function never goes below the deck). Deck: the quay and the pier.
//
// Building frame: a = metres along the long axis (+a = downhill when yaw = 0), b = metres across.

const OVERHANG = 0.9;      // roof past the walls (m)
const SNOW = 0.75;         // snow load on the roof (m)
const EDGE = 1.4;          // snow rounds off over this distance at the eaves (m)

export class Structure {
  /**
   * @param def  layout entry (BUILDINGS in layout.js)
   * @param x, z world centre; @param fall unit fall direction (x, z) the building faces
   * @param ground (x, z) → natural terrain height (without drifts)
   */
  constructor(def, x, z, fall, ground) {
    Object.assign(this, def);
    this.x = x; this.z = z;
    const yaw = def.yaw || 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.ax = fall[0] * c - fall[1] * s; this.az = fall[0] * s + fall[1] * c;   // long axis (downhill)
    this.bx = -this.az; this.bz = this.ax;                                       // across
    this.hl = def.L / 2; this.hw = def.W / 2;
    this.rl = this.hl + OVERHANG; this.rw = this.hw + OVERHANG;                  // roof half extents
    const gAt = (a, b) => ground(x + this.ax * a + this.bx * b, z + this.az * a + this.bz * b);
    this.gUp = Math.max(gAt(-this.hl, -this.hw), gAt(-this.hl, this.hw), gAt(-this.hl, 0));
    this.gDn = Math.min(gAt(this.hl, -this.hw), gAt(this.hl, this.hw), gAt(this.hl, 0));
    this.gMid = gAt(0, 0);
    this.base = Math.min(this.gDn, gAt(-this.hl, -this.hw), gAt(-this.hl, this.hw)) - 3;   // wall foundations
    const tp = Math.tan(def.pitch * Math.PI / 180);
    this.tp = tp;
    if (def.roof === 'mono') {
      // Falls downhill; the high edge sits just above the drift on the uphill side.
      this.high = Math.max(this.gUp + 0.6, this.gDn + def.eave + tp * (def.L + OVERHANG));   // eave height measured at the wall
      this.ridge = this.high;
    } else if (def.roof === 'gable') {
      this.ridge = Math.max(this.gDn + def.eave + tp * this.hl, this.gUp + 2.5);
    } else {   // aframe: the roof slabs reach the snow
      this.ridge = (this.gUp + this.gDn) / 2 + tp * this.hl;
    }
    this.top = this.ridge + SNOW;
    // Bounding circle for quick rejection.
    this.R = Math.hypot(this.rl, this.rw) + 0.5;
    // Chimney (stone): local (a, b) and top height.
    if (def.chimney) {
      this.chim = { a: def.chimney[0] * this.hl, b: def.chimney[1] * this.hw, half: 0.75 };
      this.chim.top = this.roofY(this.chim.a, this.chim.b) + 2.4;
    }
    // Drift on the uphill side: snow piled toward the roof (baked into the terrain by the course).
    this.driftTop = def.roof === 'mono' ? this.high + SNOW + 0.19
      : this.gUp + (this.ridge - this.gUp) * (def.drift ?? 0.6);
  }

  local(x, z) {
    const dx = x - this.x, dz = z - this.z;
    return [dx * this.ax + dz * this.az, dx * this.bx + dz * this.bz];
  }

  world(a, b, out = [0, 0]) {
    out[0] = this.x + this.ax * a + this.bx * b; out[1] = this.z + this.az * a + this.bz * b;
    return out;
  }

  /** Roof (structure) height at local (a, b), without snow. */
  roofY(a, b) {
    void b;
    if (this.roof === 'mono') return this.high - this.tp * (a + this.rl);
    return this.ridge - this.tp * Math.abs(a);
  }

  /** Snow thickness at local (a, b): full load, rounding off over the last EDGE metres to the eaves. */
  snowAt(a, b) {
    // A mono-pitch roof's high edge is buried in the drift: no rounded edge there.
    const ea = this.roof === 'mono' && a < 0 ? this.rl + a + EDGE * 4 : this.rl - Math.abs(a);
    const eb = this.rw - Math.abs(b);
    const e = Math.min(ea, eb);
    if (e <= 0) return 0;
    const t = Math.min(1, e / EDGE);
    // Ridge: wind scours the very top a little.
    const ridgeScour = this.roof === 'mono' ? 0 : Math.exp(-(a * a) / 0.8) * 0.18;
    return SNOW * Math.sqrt(t * (2 - t)) * (1 - ridgeScour) + 0.04;
  }

  inside(a, b, m = 0) { return Math.abs(a) <= this.rl + m && Math.abs(b) <= this.rw + m; }

  /** Rideable snow surface height at world (x, z) or null. */
  surface(x, z) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > this.R * this.R) return null;
    const [a, b] = this.local(x, z);
    if (!this.inside(a, b)) return null;
    let y = this.roofY(a, b) + this.snowAt(a, b);
    if (this.chim && Math.abs(a - this.chim.a) < this.chim.half && Math.abs(b - this.chim.b) < this.chim.half) y = Math.max(y, this.chim.top);
    return y;
  }

  /**
   * Wall test for a rider moving from (px, py, pz) to (x, y, z). Returns null, or
   * { nx, nz, depth, kind } — the outward wall normal (world) and how far inside the solid the rider is.
   * Riders on (or dropping onto) the roof are not blocked.
   */
  block(x, y, z, px, py, pz) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > (this.R + 1) * (this.R + 1)) return null;
    const [a, b] = this.local(x, z);
    const pad = 0.45;   // rider radius
    if (!this.inside(a, b, pad)) return null;
    // Chimney: a solid stone box above the roof.
    const surf = this.inside(a, b) ? this.roofY(a, b) + this.snowAt(a, b) : this.roofY(Math.sign(a) * Math.min(Math.abs(a), this.rl), b);
    if (y >= surf - 0.35) {
      if (this.chim) {
        const ca = a - this.chim.a, cb = b - this.chim.b, h = this.chim.half + pad;
        if (Math.abs(ca) < h && Math.abs(cb) < h && y < this.chim.top) return this.pushOut(ca, cb, h, h, 'chimney');
      }
      return null;
    }
    // Below the roof surface: coming from above (a landing) is fine, coming from the side is a wall.
    const [pa, pb] = this.local(px, pz);
    if (this.inside(pa, pb, pad)) {
      const psurf = this.roofY(pa, pb) + (this.inside(pa, pb) ? this.snowAt(pa, pb) : 0);
      if (py >= psurf - 0.6) return null;
    }
    return this.pushOut(a, b, this.rl + pad, this.rw + pad, 'wall');
  }

  pushOut(a, b, ha, hb, kind) {
    const da = ha - Math.abs(a), db = hb - Math.abs(b);
    if (da < db) {
      const s = Math.sign(a) || 1;
      return { nx: this.ax * s, nz: this.az * s, depth: da, kind, building: this.id };
    }
    const s = Math.sign(b) || 1;
    return { nx: this.bx * s, nz: this.bz * s, depth: db, kind, building: this.id };
  }

  /** Extra drift snow (m above `ground`) at world (x, z): a ramp up the uphill wall toward the roof. */
  driftAt(x, z, ground) {
    const dx = x - this.x, dz = z - this.z;
    const reach = this.hl + 26;
    if (dx * dx + dz * dz > (reach + this.hw) ** 2) return 0;
    const [a, b] = this.local(x, z);
    const up = -a - this.hl;                       // metres uphill of the uphill wall
    const mono = this.roof === 'mono';
    // Mono roof: the drift is a wedge outside the wall that continues the roof plane uphill until it meets
    // the slope (a smooth ramp onto the roof). Gable / A-frame: snow piled against the uphill slab, flat
    // inside the footprint up to where the slab rises out of it (never past the ridge).
    if (up < (mono ? -0.6 : -this.hl) || up > 26) return 0;
    // Fjordline: a shovelled ramp (def.ramp = its half-width) instead of a drift across the whole wall, so the
    // painted walls show on both sides of it; without `ramp`, Ravenspire's wide flanks.
    const side = this.ramp ? 1 - smooth((Math.abs(b) - this.ramp) / 3.5) : 1 - smooth((Math.abs(b) - this.rw) / 13);
    if (side <= 0) return 0;
    let t = 1 - smooth(Math.max(0, up - 14) / 12);
    // Beside the building (outside its side walls) the drift tapers off toward the downhill wall instead
    // of ending in a vertical cut (which showed as a block of bare rock).
    if (!mono && !this.ramp) t *= 1 - smooth((Math.abs(b) - this.hw + 1) / 2) * (1 - smooth((up + this.hl) / 10));
    const want = this.driftTop - 0.12 + Math.max(0, up) * (mono ? this.tp : (this.driftSlope ?? 0.35));   // gentle village slopes: a lower slope (no snow mounds)
    return Math.max(0, (want - ground) * t * side);
  }
}

function smooth(t) { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); }

/** A flat timber deck (the quay, the pier): rideable at `y` inside its rectangle (world x0..x1, z0..z1), no walls. */
export class Deck {
  constructor(name, x0, x1, z0, z1, y) {
    Object.assign(this, { name, x0, x1, z0, z1, y });
    this.SNOW = 0.06;
  }

  surface(x, z) {
    if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return null;
    return this.y + this.SNOW;
  }
}
