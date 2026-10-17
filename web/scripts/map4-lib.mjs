// Voltage Park (map 4) headless helpers: the course on the game's grid, a terrain stand-in with the real
// features hook, and a Player on it (no browser). Used by map4-unit / map4-bot / map4-fuzz.
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
globalThis.addEventListener ??= () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { VoltageCourse } = await import('../src/maps/voltage/course.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

export { THREE, Player, State, VoltageCourse };

export async function loadPark({ quiet = false } = {}) {
  const t0 = Date.now();
  const course = new VoltageCourse();
  const t1 = Date.now();
  const grid = await course.generate();
  const { res: N, spacing: SP, size_m: SIZE } = grid.meta;
  const HALF = SIZE / 2, H = grid.heights, S = grid.splat;
  if (!quiet) console.log(`course built in ${t1 - t0} ms, grid ${N}² in ${Date.now() - t1} ms · ${course.features.length} features, ${course.rails.length} rails`);
  const base = (x, z) => {
    const fx = Math.min(Math.max((x + HALF) / SP, 0), N - 1.001), fz = Math.min(Math.max((z + HALF) / SP, 0), N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * N + i;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
  };
  const T = {
    half: HALF, spacing: SP, course,
    features: { heightAt: (x, z, b) => course.heightAt(x, z, b) },
    baseHeight: base,
    getHeight(x, z) { const b = base(x, z), f = course.heightAt(x, z, b); return f !== null && f > b ? f : b; },
    getNormal(x, z, r = 0, out = new THREE.Vector3()) {
      const e = Math.max(r, SP);
      return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
    },
    getSurface(x, z, out = new THREE.Vector4()) {
      const i = Math.min(N - 1, Math.max(0, Math.round((x + HALF) / SP))), j = Math.min(N - 1, Math.max(0, Math.round((z + HALF) / SP)));
      const g = S[(j * N + i) * 3] / 255, r = S[(j * N + i) * 3 + 1] / 255;
      return out.set(g, Math.max(0, 1 - Math.max(g, r)), r, 0);
    },
    isInside: (x, z, m = 0) => Math.abs(x) < HALF - m && Math.abs(z) < HALF - m,
    getSpawn() { const s = course.spawnPoint(); return { position: new THREE.Vector3(s.x, base(s.x, s.z), s.z), heading: s.heading }; },
  };
  return { course, T, grid };
}

export function makePlayer(T, type = 'ski', variant) {
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type, variant);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  return p;
}
