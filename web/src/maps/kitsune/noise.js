// Kitsune Peak: deterministic noise helpers (a copy of Ravenspire's, so the maps evolve independently).
export function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function hash1(i) { return hash2(i, 91711); }

/** Smooth value noise in [0, 1]. */
export function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  let fx = x - i, fy = y - j;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
/** 1D smooth value noise in [0, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  let f = x - i; f = f * f * (3 - 2 * f);
  const a = hash2(i, seed * 7919 + 13), b = hash2(i + 1, seed * 7919 + 13);
  return a + (b - a) * f;
}
export function fbm(x, y, oct) {
  let a = 0, amp = 0.5, tot = 0, f = 1;
  for (let k = 0; k < oct; k++) { a += vnoise(x * f + k * 17.1, y * f - k * 9.3) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
  return a / tot;
}
export function ridged(x, y, oct) {
  let a = 0, amp = 0.5, tot = 0, f = 1;
  for (let k = 0; k < oct; k++) {
    const n = 1 - Math.abs(vnoise(x * f + k * 31.7, y * f + k * 5.9) * 2 - 1);
    a += n * n * amp; tot += amp; amp *= 0.5; f *= 2.1;
  }
  return a / tot;
}
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const sstep = (a, b, x) => smooth((x - a) / (b - a));
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
