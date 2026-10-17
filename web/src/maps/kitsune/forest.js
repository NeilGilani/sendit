// Kitsune Peak's designed forest, planned as pure data (no scene) so the height function (tree wells),
// the browser (props.js draws the birches, scatter.js the firs) and the headless bots all share it.
//   • Shirakaba glade: Erman's birch (dakekanba), pale crooked trunks 6–12 m apart, no low branches: open,
//     flowing tree skiing. The Shirakaba Weave keeps a tight 5–6 m lane; the other trails a wider avenue.
//   • Fir pockets (todomatsu) inside the glade: dark, 4–6 m apart, each in a tree well (course.wellsAt).
//   • The village: a few birches between the buildings.
//   • Juhyo (snow monsters): rime-plastered firs on the upper bowl's flanks and round the crater.
// Hitboxes are fair: a birch collides with its trunk only; a fir with its trunk and dense inner crown
// (the same rule as Blackspruce), well inside the branch tips; a snow monster with its packed core.
import { START_X, FACE, KAZAN, GULLY, BUILDINGS, PAGODA, ONSEN, TUNNEL, OTORII, WEAVE, CRATER, BANDS, DROP_ZONES } from './layout.js';
import { fbm, noise1, mulberry32 } from './noise.js';

export const FIR_WELL = { radius: 3.0, depth: 0.9 };   // per unit fir scale: a soft dish, 0.9 m deep at the trunk
export const BIRCH = { height: 13, trunk: 0.2 };        // metres at scale 1
export const FIR_HIT = { base: 0.2, perWidth: 0.32 };

export function planForest(course) {
  const birches = [], firs = [], juhyo = [], obstacles = [];
  // Occupancy hash: [u, v, r].
  const C = 8, occ = new Map();
  const put = (u, v, r) => { const k = Math.floor(u / C) * 4096 + Math.floor(v / C); let a = occ.get(k); if (!a) occ.set(k, (a = [])); a.push([u, v, r]); };
  const near = (u, v, R) => {
    const cu = Math.floor(u / C), cv = Math.floor(v / C), n = Math.ceil(R / C);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const a = occ.get((cu + i) * 4096 + cv + j);
      if (a) for (const o of a) if (Math.hypot(u - o[0], v - o[1]) < Math.max(R, o[2])) return true;
    }
    return false;
  };
  const weaveV = (u) => WEAVE.v + WEAVE.amp * Math.sin((u - WEAVE.u0) / WEAVE.wave * Math.PI);
  /** Clear of every man-made thing and every trail (`lane`: the clear half-width on the trails). */
  const free = (u, v, lane) => {
    const ld = course.lineDist(u, v);
    // The weave is tight (its own lane), every other line is an avenue.
    const onWeave = u > WEAVE.u0 - 20 && u < WEAVE.u1 + 20 && Math.abs(v - weaveV(Math.min(WEAVE.u1, Math.max(WEAVE.u0, u)))) < 12;
    if (ld < (onWeave ? lane : lane + 5)) return false;
    for (const b of BUILDINGS) if (Math.hypot(u - b.u, v - b.v) < Math.hypot(b.L, b.W) / 2 + 14) return false;
    if (Math.hypot(u - PAGODA.u, v - PAGODA.v) < 16) return false;
    for (const [, du, dv] of DROP_ZONES) if (Math.hypot(u - du, v - dv) < 10) return false;
    for (const B of BANDS) if (u > B.uc - 30 && u < B.uc + 22 && v > B.v0 - 10 && v < B.v1 + 10) return false;   // cliff lips and landings stay clean
    if (Math.hypot(u - ONSEN.u, v - ONSEN.v) < ONSEN.r + 12) return false;
    for (const t of OTORII) if (Math.hypot(u - t.u, v - t.v) < 18) return false;
    if (u > TUNNEL.u0 - 25 && u < TUNNEL.u1 + 45 && Math.abs(v - TUNNEL.centre(Math.min(TUNNEL.u1, Math.max(TUNNEL.u0, u)))) < 12) return false;
    if (u > KAZAN.u0 - 20 && u < KAZAN.u1 + 20 && Math.abs(v - course.kazanCrest(Math.min(KAZAN.u1, Math.max(KAZAN.u0, u)))) < KAZAN.top + 30) return false;
    if (u > GULLY.u0 - 20 && u < GULLY.u1 + 20 && Math.abs(v - course.gullyCentre(Math.min(GULLY.u1, Math.max(GULLY.u0, u)))) < 34) return false;
    return true;
  };

  // ---- Fir pockets inside the glade first (they own their wells; birches keep clear of them).
  let rnd = mulberry32(6061);
  for (let i = 0; i < 9000 && firs.length < 320; i++) {
    const u = 700 + rnd() * 780, v = -300 + rnd() * 460;
    const pocket = fbm(u / 70 + 11, v / 70 - 3, 2);
    if (pocket < 0.6) continue;
    if (!free(u, v, 7.5)) continue;
    const sc = 0.75 + rnd() * 0.5, w = 0.9 + rnd() * 0.25;
    const R = 4.2 + 1.6 * sc;
    if (near(u, v, R)) continue;
    put(u, v, R);
    firs.push([START_X + u, v, sc, w, rnd() * Math.PI * 2]);
    obstacles.push([START_X + u, v, FIR_HIT.base + FIR_HIT.perWidth * sc * w, 'tree']);
  }

  // ---- The birch glade (variable-radius dart throwing: tighter in the heart of the glade, thinner at its edges).
  rnd = mulberry32(7177);
  const glade = (u, v) => {
    const core = Math.min(1, Math.max(0, (u - 660) / 80)) * Math.min(1, Math.max(0, (1500 - u) / 80));
    const lat = Math.min(1, Math.max(0, (v + 330) / 60)) * Math.min(1, Math.max(0, (190 - v) / 60));
    return core * lat * (0.55 + 0.45 * fbm(u / 140, v / 140, 2));
  };
  for (let i = 0; i < 60000 && birches.length < 3600; i++) {
    const u = 650 + rnd() * 860, v = -340 + rnd() * 540;
    const g = glade(u, v);
    if (g < 0.25 || rnd() > g) continue;
    if (!free(u, v, 7)) continue;
    const R = 5.5 + 5 * (1 - g) + rnd() * 1.5;
    if (near(u, v, R)) continue;
    put(u, v, R * 0.8);
    addBirch(u, v, rnd);
  }
  // ---- Birches round the village and along the gully banks (sparse).
  for (let i = 0; i < 20000 && birches.length < 4400; i++) {
    const u = 1480 + rnd() * 560, v = -260 + rnd() * 740;
    const n = fbm(u / 90 + 5, v / 90, 2);
    if (n < 0.5) continue;
    if (!free(u, v, 9)) continue;
    const R = 10 + rnd() * 6;
    if (near(u, v, R)) continue;
    put(u, v, R * 0.7);
    addBirch(u, v, rnd);
  }
  // Gully banks (outside the walls and lanterns).
  for (let i = 0; i < 12000 && birches.length < 5000; i++) {
    const u = GULLY.u0 + 120 + rnd() * (GULLY.u1 - GULLY.u0 - 160);
    const c = course.gullyCentre(u), side = rnd() < 0.5 ? -1 : 1;
    const v = c + side * (40 + rnd() * 70);
    if (!free(u, v, 9)) continue;
    if (Math.abs(v) > FACE.halfWidth(u) * 0.95) continue;
    const R = 7 + rnd() * 5;
    if (near(u, v, R)) continue;
    put(u, v, R * 0.7);
    addBirch(u, v, rnd);
  }

  // ---- Juhyo: snow monsters on the upper bowl's flanks and round the crater rim.
  rnd = mulberry32(8191);
  for (let i = 0; i < 20000 && juhyo.length < 110; i++) {
    let u, v;
    if (rnd() < 0.3) {   // round the rim, outside the crater
      const a = rnd() * Math.PI * 2, r = CRATER.R + 20 + rnd() * 120;
      u = CRATER.u + Math.cos(a) * r; v = CRATER.v + Math.sin(a) * r;
      if (u > -10 && Math.abs(v) < 140) continue;   // not on the saddle you drop from
    } else {
      u = 60 + rnd() * 560; v = (rnd() < 0.5 ? -1 : 1) * FACE.halfWidth(u) * (0.5 + rnd() * 0.45);
    }
    if (!free(u, v, 12)) continue;
    const sc = 0.7 + rnd() * 0.7;
    const R = 6 + rnd() * 10;
    if (near(u, v, R)) continue;
    put(u, v, 4);
    juhyo.push([START_X + u, v, sc, rnd() * Math.PI * 2, rnd()]);
    obstacles.push([START_X + u, v, 0.9 * sc, 'tree']);
  }

  function addBirch(u, v, r) {
    const sc = 0.75 + r() * 0.5;
    const stems = r() < 0.3 ? 2 : 1;                    // dakekanba often grows in clumps of two
    const yaw = r() * Math.PI * 2, lean = (r() - 0.5) * 0.16;
    birches.push([START_X + u, v, sc, yaw, lean, stems, r()]);
    obstacles.push([START_X + u, v, BIRCH.trunk * sc * (stems > 1 ? 1.6 : 1) + 0.08, 'tree']);
  }

  void noise1;
  return { birches, firs, juhyo, obstacles };
}
