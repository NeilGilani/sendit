// Kitsune Peak buildings as rideable solids: a curved Japanese gable roof (sori: steep at the ridge,
// flattening toward the eaves, the eave tips turned up) under a deep snow load, rideable through the
// terrain's features.heightAt hook, and solid walls (features.blockAt). The ridge runs across the fall
// line, so a rider comes up the uphill drift, over the ridge, down the curved slab and off the downhill
// eave, which the curve turns into a natural kicker. props.js shapes the snow mesh with the same
// functions, so what you see is what you ride.
//
// Building frame: a = metres along the fall line (+a = downhill when yaw = 0), b = metres across.

const OVERHANG = 1.6;      // deep Japanese eaves (m past the walls)
const SNOW = 1.0;          // snow load on the roof (m): Hokkaido roofs carry a lot
const EDGE = 0.8;          // snow rounds off over this distance at the eaves (m)
const CURVE = 0.32;        // sori: share of the slope the roof loses toward the eave (0 = straight)
const UPTURN = 0.35;       // m the eave tips turn up over the last TIP m
const TIP = 1.1;

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
    this.ax = fall[0] * c - fall[1] * s; this.az = fall[0] * s + fall[1] * c;   // along the fall line
    this.bx = -this.az; this.bz = this.ax;                                       // across
    this.hl = def.L / 2; this.hw = def.W / 2;
    this.rl = this.hl + OVERHANG; this.rw = this.hw + OVERHANG * 0.6;            // roof half extents
    const gAt = (a, b) => ground(x + this.ax * a + this.bx * b, z + this.az * a + this.bz * b);
    this.gUp = Math.max(gAt(-this.hl, -this.hw), gAt(-this.hl, this.hw), gAt(-this.hl, 0));
    this.gDn = Math.min(gAt(this.hl, -this.hw), gAt(this.hl, this.hw), gAt(this.hl, 0));
    this.gMid = gAt(0, 0);
    this.base = Math.min(this.gDn, gAt(-this.hl, -this.hw), gAt(-this.hl, this.hw)) - 3;   // wall foundations
    this.tp = Math.tan(def.pitch * Math.PI / 180);
    // The eave (at the downhill wall) sits `eave` m above the ground there; the ridge above that.
    this.ridge = Math.max(this.gDn + def.eave + this.fall(this.hl), this.gUp + 2.5);
    this.top = this.ridge + SNOW;
    this.R = Math.hypot(this.rl, this.rw) + 0.5;
    // Drift on the uphill side: snow piled toward the ridge (baked into the terrain by the course).
    this.driftTop = this.gUp + (this.ridge - this.gUp) * (def.drift ?? 0.8);
  }

  /** Metres the roof has fallen from the ridge at |a| (concave: steep at the ridge, flatter at the eave). */
  fall(d) {
    const s = Math.min(1, d / this.rl);
    return this.tp * this.rl * (s - CURVE * s * s);
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
    const d = Math.abs(a);
    let y = this.ridge - this.fall(d);
    const t = (d - (this.rl - TIP)) / TIP;
    if (t > 0) y += UPTURN * Math.min(1, t) * Math.min(1, t);
    // The gable-end corners lift a little too (the hip of an irimoya roof).
    const tb = (Math.abs(b) - (this.rw - TIP)) / TIP;
    if (tb > 0) y += UPTURN * 0.6 * Math.min(1, tb) * Math.min(1, tb);
    return y;
  }

  /** Snow thickness at local (a, b): full load, rounding off over the last EDGE metres to the eaves. */
  snowAt(a, b) {
    const e = Math.min(this.rl - Math.abs(a), this.rw - Math.abs(b));
    if (e <= 0) return 0;
    const t = Math.min(1, e / EDGE);
    const ridgeScour = Math.exp(-(a * a) / 0.8) * 0.2;   // wind scours the very top a little
    return SNOW * Math.sqrt(t * (2 - t)) * (1 - ridgeScour) + 0.04;
  }

  inside(a, b, m = 0) { return Math.abs(a) <= this.rl + m && Math.abs(b) <= this.rw + m; }

  /** Rideable snow surface height at world (x, z) or null. */
  surface(x, z) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > this.R * this.R) return null;
    const [a, b] = this.local(x, z);
    if (!this.inside(a, b)) return null;
    return this.roofY(a, b) + this.snowAt(a, b);
  }

  /**
   * Wall test for a rider moving from (px, py, pz) to (x, y, z). Returns null, or
   * { nx, nz, depth, kind } — the outward wall normal (world) and how far inside the solid the rider is.
   * Riders on (or dropping onto) the roof are not blocked; under the deep eaves only the walls are solid.
   */
  block(x, y, z, px, py, pz) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > (this.R + 1) * (this.R + 1)) return null;
    const [a, b] = this.local(x, z);
    const pad = 0.45;   // rider radius
    if (!this.inside(a, b, pad)) return null;
    const surf = this.inside(a, b) ? this.roofY(a, b) + this.snowAt(a, b) : this.roofY(Math.sign(a) * Math.min(Math.abs(a), this.rl), b);
    if (y >= surf - 0.35) return null;
    // Under the eaves (outside the walls) and below the roof: the overhang, which a rider passes under
    // unless they are up at roof height (then it is a wall).
    const inWalls = Math.abs(a) <= this.hl + pad && Math.abs(b) <= this.hw + pad;
    if (!inWalls && y < surf - 2.2) return null;
    const [pa, pb] = this.local(px, pz);
    if (this.inside(pa, pb, pad)) {
      const psurf = this.roofY(pa, pb) + (this.inside(pa, pb) ? this.snowAt(pa, pb) : 0);
      if (py >= psurf - 0.6) return null;
    }
    return inWalls ? this.pushOut(a, b, this.hl + pad, this.hw + pad, 'wall') : this.pushOut(a, b, this.rl + pad, this.rw + pad, 'wall');
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

  /** Extra drift snow (m above `ground`) at world (x, z): a ramp up the uphill wall toward the ridge. */
  driftAt(x, z, ground) {
    const dx = x - this.x, dz = z - this.z;
    const reach = this.hl + 28;
    if (dx * dx + dz * dz > (reach + this.hw) ** 2) return 0;
    const [a, b] = this.local(x, z);
    const up = -a - this.hl;                       // metres uphill of the uphill wall
    if (up < -this.hl || up > 28) return 0;
    const side = 1 - smooth((Math.abs(b) - this.rw) / 13);
    if (side <= 0) return 0;
    let t = 1 - smooth(Math.max(0, up - 15) / 13);
    t *= 1 - smooth((Math.abs(b) - this.hw + 1) / 2) * (1 - smooth((up + this.hl) / 10));
    const want = this.driftTop - 0.12 + Math.max(0, up) * 0.33;
    return Math.max(0, (want - ground) * t * side);
  }
}

function smooth(t) { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); }
