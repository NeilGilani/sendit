// Shared helpers for the jump benches (jumps-bench.mjs, jumps-valcrest.mjs): the real Valcrest /
// Blackspruce height field on the game's grid with the real features.js kickers baked in, and a
// recorder that measures every air (take-off speed and angle, air time, height, distance, rotations).
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.addEventListener ??= () => {};
const THREE = await import('three');
const { Features } = await import('../src/features.js');

/**
 * A terrain object compatible with terrain.js for a Course-like object with generate() (Valcrest's
 * course.js) or with only height() (map 2): heights on the tile grid, features planned and baked.
 */
export async function gridTerrain(course) {
  const P = course.P, N = P.tileRes, size = P.tileSize, SP = size / (N - 1), HALF = size / 2;
  let heights, normals, splat, spawn;
  if (course.generate) {
    const d = await course.generate();
    ({ heights, normals, splat } = d); spawn = d.meta.spawn;
  } else {
    heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = course.height(-HALF + i * SP, -HALF + j * SP);
    normals = new Uint8Array(N * N * 2); splat = new Uint8Array(N * N * 3);
    const s = course.centre(12); spawn = { position: [s.x, s.y, s.z], heading: s.heading };
  }
  const T = {
    course, res: N, spacing: SP, half: HALF, size, heights, normals, splat, features: null,
    normalTex: {}, heightTex: {}, meta: { spawn },
    baseHeight(x, z) {
      const fx = Math.min(Math.max((x + HALF) / SP, 0), N - 1.001), fz = Math.min(Math.max((z + HALF) / SP, 0), N - 1.001);
      const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * N + i, H = heights;
      return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
    },
    getHeight(x, z) { const b = this.baseHeight(x, z); const f = this.features?.heightAt(x, z, b); return f != null && f > b ? f : b; },
    getNormal(x, z, r = 0, out = new THREE.Vector3()) {
      const e = Math.max(r, SP);
      return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
    },
    getSurface(x, z, out = new THREE.Vector4()) {
      const i = Math.min(Math.max(Math.round((x + HALF) / SP), 0), N - 1), j = Math.min(Math.max(Math.round((z + HALF) / SP), 0), N - 1);
      const o = (j * N + i) * 3, g = splat[o] / 255, r = splat[o + 1] / 255, f = splat[o + 2] / 255;
      return out.set(g, Math.max(0, 1 - Math.max(g, r, f)), r, f);
    },
    isInside(x, z, m = 0) { return Math.abs(x) < HALF - m && Math.abs(z) < HALF - m; },
    getSpawn() { const s = this.meta.spawn; const p = new THREE.Vector3(s.position[0], 0, s.position[2]); p.y = this.getHeight(p.x, p.z); return { position: p, heading: s.heading }; },
  };
  const features = new Features(T);
  features.plan(course);
  T.featuresObj = features;
  return T;
}

/**
 * Air recorder: call rec.step(player) after every player.step(). Each finished air is pushed to
 * rec.airs: { t0 (s), v0 (take-off speed m/s), ang (deg, + = up), vy0, air (s), h (max height above
 * the snow), apex (max height above the take-off), dist (horizontal m), flips, spins (deg), result }.
 */
export function airRecorder() {
  const rec = { airs: [], cur: null, t: 0 };
  rec.step = (p, dt = 1 / 60) => {
    rec.t += dt * (p.timeScale ?? 1);
    if (p.state === 2) {
      if (!rec.cur) {
        const v = p.velocity, hs = Math.hypot(v.x, v.z);
        rec.cur = { t0: rec.t, x0: p.position.x, y0: p.position.y, z0: p.position.z, v0: v.length(), vy0: v.y, ang: Math.atan2(v.y, hs) * 180 / Math.PI, h: 0, apex: 0, flipMax: 0, real: 0 };
      }
      const c = rec.cur;
      c.h = Math.max(c.h, p.position.y - p.terrain.getHeight(p.position.x, p.position.z));
      c.apex = Math.max(c.apex, p.position.y - c.y0);
      c.flipMax = Math.max(c.flipMax, Math.abs(p.flip));
      c.real += dt;   // wall-clock seconds (slow-mo included)
      c.x1 = p.position.x; c.z1 = p.position.z; c.air = p.airTime; c.spins = Math.abs(p._spinTotal) * 180 / Math.PI;
    } else if (rec.cur) {
      const c = rec.cur;
      c.dist = Math.hypot(c.x1 - c.x0, c.z1 - c.z0);
      c.flips = c.flipMax / (Math.PI * 2);
      c.result = p.state === 3 ? `CRASH:${p.lastCrash?.reason}` : p.lastLanding?.result ?? '?';
      c.impact = p.lastLanding?.impact ?? p.lastCrash?.impact ?? 0;
      c.trick = p.lastLanding?.trick ?? '';
      rec.airs.push(c);
      rec.cur = null;
    }
  };
  return rec;
}

export const fmtAir = (a) => `v0 ${a.v0.toFixed(1)} m/s ${a.ang >= 0 ? '+' : ''}${a.ang.toFixed(0)}°  air ${a.air.toFixed(2)} s (${a.real.toFixed(2)} real)  h ${a.h.toFixed(1)} m  apex ${a.apex.toFixed(1)} m  dist ${a.dist.toFixed(1)} m  flips ${a.flips.toFixed(2)}  spin ${a.spins.toFixed(0)}°  impact ${a.impact.toFixed(1)}  ${a.result} ${a.trick}`;
