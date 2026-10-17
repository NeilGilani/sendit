// Piste map for the loaded mountain (Maps tab): a small top-down relief of the course with the run
// line, the finish and every trail's start marked by its difficulty. Top-down with the fall line
// pointing down the map, so the rider's left is on the map's right, as on a trail map seen from the base.
//
// pisteMap({ path, finishAt, heightAt, starts, accent }) → { el, highlight(id), select(id) }
//   path      [{ x, y }] (y = world z) — the course line from its start
//   finishAt  path length of the finish (m)
//   heightAt  (x, z) → m
//   starts    [{ id, x, z, difficulty }] — trail tops (registry trailSpawnFor)
// The relief is drawn once per mountain and cached (it samples the height ~30k times).
const W = 200, H = 210;          // canvas pixels (CSS scales it)
const cache = new Map();          // key → { url, proj }

export function pisteMap({ key, path, finishAt, heightAt, starts, accent = '#5fa8ff' }) {
  const el = document.createElement('div');
  el.className = 'pm';
  el.setAttribute('aria-hidden', 'true');
  if (!path?.length || typeof heightAt !== 'function') return { el, highlight() {}, select() {} };
  let entry = cache.get(key);
  if (!entry) { entry = draw(path, finishAt, heightAt, starts); cache.set(key, entry); }
  const { url, proj } = entry;
  const fin = proj(pointAt(path, finishAt));
  const mk = starts.map((s) => {
    const [u, v] = proj(s);
    return `<g class="pm-mk d-${s.difficulty}" data-trail="${s.id}" transform="translate(${u.toFixed(1)} ${v.toFixed(1)})">
      <circle class="pm-pulse" r="7"/><circle class="pm-dot" r="3.6"/></g>`;
  }).join('');
  el.style.setProperty('--acc', accent);
  el.innerHTML = `<img class="pm-relief" alt="" src="${url}">
    <svg class="pm-over" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
      <g class="pm-fin" transform="translate(${fin[0].toFixed(1)} ${fin[1].toFixed(1)})"><path d="M0 0 V-11" /><path class="pm-flag" d="M0 -11 h7 l-2 2.6 l2 2.6 h-7 z"/></g>
      ${mk}
    </svg>`;
  const marks = [...el.querySelectorAll('.pm-mk')];
  const set = (cls, id) => marks.forEach((m) => m.classList.toggle(cls, m.dataset.trail === id));
  return { el, highlight: (id) => set('hot', id), select: (id) => set('on', id) };
}

/** Relief + run line as a data URL, and the world → canvas projection. */
function draw(path, finishAt, heightAt, starts) {
  // Fall direction: start → finish of the path; map "down" = downhill, map "right" = the rider's left.
  const a = path[0], b = pointAt(path, finishAt);
  let fx = b.x - a.x, fz = b.z - a.y;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const rx = fz, rz = -fx;          // the rider's left (= the right of a map with downhill pointing down)
  const pts = [...path.map((p) => ({ x: p.x, z: p.y })), ...starts];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) {
    const u = p.x * rx + p.z * rz, v = p.x * fx + p.z * fz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  // Fit with a margin, keeping the canvas aspect.
  const pad = 0.14;
  let du = (u1 - u0) * (1 + pad * 2) + 60, dv = (v1 - v0) * (1 + pad * 2) + 60;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  if (du / dv > W / H) dv = du * H / W; else du = dv * W / H;
  const s = W / du;                                   // px per m
  const proj = (p) => {
    const x = p.x, z = p.z ?? p.y;
    return [W / 2 + ((x * rx + z * rz) - cu) * s, H / 2 + ((x * fx + z * fz) - cv) * s];
  };
  const world = (px, py) => {
    const u = cu + (px - W / 2) / s, v = cv + (py - H / 2) / s;
    return [u * rx + v * fx, u * rz + v * fz];
  };
  const cv2 = document.createElement('canvas');
  cv2.width = W; cv2.height = H;
  const g = cv2.getContext('2d');
  const img = g.createImageData(W, H);
  const hs = new Float32Array((W + 1) * (H + 1));
  let hmin = Infinity, hmax = -Infinity;
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const [x, z] = world(i, j);
      const h = heightAt(x, z);
      hs[j * (W + 1) + i] = h;
      if (h < hmin) hmin = h; if (h > hmax) hmax = h;
    }
  }
  const cell = 1 / s;                                 // m per px
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const h = hs[j * (W + 1) + i], hx = hs[j * (W + 1) + i + 1], hy = hs[(j + 1) * (W + 1) + i];
      // Screen-space gradient → normal; light from the upper left (classic hillshade).
      const gx = (hx - h) / cell, gy = (hy - h) / cell;
      const nl = Math.hypot(gx, gy, 1);
      const nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
      const lit = Math.max(0, nx * -0.55 + ny * -0.55 + nz * 0.63);
      const slope = 1 - nz;                           // 0 flat … 1 vertical
      const e = (h - hmin) / Math.max(1, hmax - hmin);
      // Snow: blue-grey in shade, white in sun; steep faces turn to rock.
      const rock = Math.min(1, Math.max(0, (slope - 0.42) * 3.2));
      let r = 120 + 135 * lit, gg = 138 + 120 * lit, bb = 172 + 86 * lit;
      r = r * (1 - rock) + (86 + 60 * lit) * rock; gg = gg * (1 - rock) + (88 + 58 * lit) * rock; bb = bb * (1 - rock) + (98 + 56 * lit) * rock;
      const k = 0.88 + 0.12 * e;                      // a touch darker low down
      const o = (j * W + i) * 4;
      img.data[o] = r * k; img.data[o + 1] = gg * k; img.data[o + 2] = Math.min(255, bb * k + 6); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // The run line (to the finish): a soft dark casing under a bright line.
  const line = [];
  let acc = 0;
  for (let k = 0; k < path.length; k++) {
    if (k) acc += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
    line.push(proj(path[k]));
    if (acc > finishAt) break;
  }
  g.lineJoin = 'round'; g.lineCap = 'round';
  const stroke = (w, c) => { g.beginPath(); line.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineWidth = w; g.strokeStyle = c; g.stroke(); };
  stroke(4.5, 'rgba(20, 26, 60, 0.35)');
  stroke(1.8, 'rgba(255, 255, 255, 0.95)');
  return { url: cv2.toDataURL('image/png'), proj };
}

/** Point `d` m along a path of { x, y } (y = world z): { x, z }. */
function pointAt(path, d) {
  let acc = 0;
  for (let k = 1; k < path.length; k++) {
    const p = path[k - 1], q = path[k], seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (acc + seg >= d) { const t = seg ? (d - acc) / seg : 0; return { x: p.x + (q.x - p.x) * t, z: p.y + (q.y - p.y) * t }; }
    acc += seg;
  }
  const e = path[path.length - 1];
  return { x: e.x, z: e.y };
}
