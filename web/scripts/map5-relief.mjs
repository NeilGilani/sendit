// Dragonback (map 5) relief map: a hillshaded top view of the face from the map's own height function (no
// browser), with slope tint (green < 30°, blue 30–45°, red > 45° = rock), ridge crests in yellow and the
// canonical lines in magenta. For laying out ridges quickly. Writes a PNG.
// Usage: node web/scripts/map5-relief.mjs out.png [u0 u1 v0 v1 m-per-px]
import fs from 'node:fs';
import zlib from 'node:zlib';
const { DragonbackCourse } = await import('../src/maps/dragonback/course.js');
const { START_X, RIDE_LINES } = await import('../src/maps/dragonback/layout.js');
const [out = 'relief.png', U0 = '-150', U1 = '2350', V0 = '-560', V1 = '560', MPP = '2'] = process.argv.slice(2);
const c = new DragonbackCourse();
const u0 = +U0, u1 = +U1, v0 = +V0, v1 = +V1, mpp = +MPP;
// Image: x = v (left → right as seen looking downhill), y = u (top = start).
const W = Math.round((v1 - v0) / mpp), H = Math.round((u1 - u0) / mpp);
const px = Buffer.alloc(W * H * 3);
const h = (u, v) => c.height(START_X + u, v);
const L = [-0.35, 0.6, 0.72];   // light from the south-south-east, high
const ln = Math.hypot(...L);
for (let y = 0; y < H; y++) {
  const u = u0 + y * mpp;
  for (let x = 0; x < W; x++) {
    const v = v0 + x * mpp;
    const e = 0.75;
    const dhu = (h(u + e, v) - h(u - e, v)) / (2 * e), dhv = (h(u, v + e) - h(u, v - e)) / (2 * e);
    const n = [-dhu, -dhv, 1], nl = Math.hypot(...n);
    const shade = Math.max(0.12, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ln));
    const slope = Math.atan(Math.hypot(dhu, dhv)) * 180 / Math.PI;
    let col = slope < 30 ? [200, 235, 205] : slope < 45 ? [205, 220, 250] : [240, 170, 160];
    if (slope > 58) col = [150, 120, 115];
    const k = (i) => Math.min(255, Math.round(col[i] * (0.25 + 0.95 * shade)));
    px.set([k(0), k(1), k(2)], (y * W + x) * 3);
  }
}
const dot = (u, v, rgb, r = 1) => {
  const x0 = Math.round((v - v0) / mpp), y0 = Math.round((u - u0) / mpp);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x >= 0 && y >= 0 && x < W && y < H) px.set(rgb, (y * W + x) * 3);
  }
};
for (const r of c.ridges) for (let u = r.u0; u <= r.u1; u += mpp) if (r.heightAt(u) > 3) dot(u, r.crestAt(u), [250, 200, 20], 0);
if (!process.env.NOLINES) for (const L of Object.values(RIDE_LINES)) for (const [u, v] of c.linePoints(L)) dot(u, v, [220, 40, 200], 0);
for (const z of c.dropZones) dot(z.x - START_X, z.z, [20, 20, 20], 3);
for (const f of c.challenge.flakes) dot(f.x - START_X, f.z, [255, 170, 0], 2);
// PNG encode.
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: ${W}×${H} px, ${mpp} m/px`);
