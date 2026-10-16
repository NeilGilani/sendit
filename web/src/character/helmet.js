// Helmet + goggle geometry, fitted to the body's head in bind space (metres, facing +Z).
// A low-profile rounded-square shell (superellipse plan, domed crown) with a brim ridge that sits flush
// on the goggle, a rolled liner edge, a big frameless toric lens with a dark gasket, and a wide strap
// that runs from the lens around the back of the shell through a rubber clip. Rigid on the Head bone.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Piecewise-linear lookup over |θ| in degrees: keys [[deg, value], …]. */
export function keyed(keys, deg) {
  const d = Math.abs(deg);
  for (let i = 1; i < keys.length; i++) {
    if (d <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; const t = (d - a) / (b - a); return lerp(va, vb, t * t * (3 - 2 * t)); }
  }
  return keys[keys.length - 1][1];
}

/** Grid → indexed geometry pieces with finite-difference normals oriented by `outward(i,k)`. */
export function grid(P, rows, cols, wrap, outward) {
  const at = (i, k) => {
    i = Math.min(rows - 1, Math.max(0, i));
    k = wrap ? ((k % (cols - 1)) + (cols - 1)) % (cols - 1) : Math.min(cols - 1, Math.max(0, k));
    return new THREE.Vector3().fromArray(P, (i * cols + k) * 3);
  };
  const N = new Float32Array(P.length);
  const mi = Math.floor(rows / 2), mk = Math.floor(cols / 3);
  const n0 = at(mi + 1, mk).sub(at(mi - 1, mk)).cross(at(mi, mk + 1).sub(at(mi, mk - 1)));
  const orient = n0.dot(outward(mi, mk)) < 0 ? -1 : 1;
  for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
    let n = at(i + 1, k).sub(at(i - 1, k)).cross(at(i, k + 1).sub(at(i, k - 1)));
    if (n.lengthSq() < 1e-14) n = outward(i, k).multiplyScalar(orient);
    n.normalize().multiplyScalar(orient);
    N.set([n.x, n.y, n.z], (i * cols + k) * 3);
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < cols - 1; k++) {
    const a = i * cols + k, b = (i + 1) * cols + k, c = i * cols + k + 1, d = (i + 1) * cols + k + 1;
    if (orient > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
  }
  return { P, N, idx, n: rows * cols };
}

function merge(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.n; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), reg = new Float32Array(nv), uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.P, ov * 3); nrm.set(p.N, ov * 3);
    for (let i = 0; i < p.n; i++) { reg[ov + i] = p.region[i] ?? p.region; if (p.uv) { uv[(ov + i) * 2] = p.uv[i * 2]; uv[(ov + i) * 2 + 1] = p.uv[i * 2 + 1]; } }
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + ov;
    ov += p.n; oi += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(reg, 1));
  g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Fit the helmet shell to the head: its plan (rounded square), crown profile and lower edge, all in
 * bind space. Shared by the helmet and by garments that sit over it (the hood worn up).
 */
export function helmetFit(body, shape = {}) {
  // ---- head measurements (bind space)
  const head = body.bone('Head');
  let top = -1, back = 1, front = -1, halfW = 0;
  for (let i = 0; i < body.n; i++) {
    if (body.dom[i] !== head) continue;
    const x = body.pos[i * 3], y = body.pos[i * 3 + 1], z = body.pos[i * 3 + 2];
    top = Math.max(top, y);
    if (y > 1.66) { back = Math.min(back, z); halfW = Math.max(halfW, Math.abs(x)); }
    if (y > 1.71) front = Math.max(front, z);
  }
  const W = shape.width ?? 0.228;
  const a = Math.max(W / 2, halfW + 0.022);                       // half width
  const cz = (front + back) / 2 - 0.006;
  const cF = Math.max(shape.front ?? 0.13, front - cz + 0.026);    // centre → front surface
  const cB = Math.max(shape.back ?? 0.142, cz - back + 0.03);      // centre → back surface
  const yTop = top + (shape.top ?? 0.026);
  const yEq = 1.708;                                              // widest line of the shell
  const n = 2.35;                                                 // plan squareness
  const brim = shape.brim ?? 0.016;
  // Lower edge of the shell over |θ| (0 = front): brow, temples, ears, nape.
  const yBotKeys = [[0, 1.752], [30, 1.749], [52, 1.728], [70, 1.68], [92, 1.64], [128, 1.632], [160, 1.648], [180, 1.652]];
  const plan = (th) => {
    const s = Math.sin(th), c = Math.cos(th);
    const px = Math.sign(s) * Math.pow(Math.abs(s), 2 / n), pz = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    return [a * px, (c >= 0 ? cF : cB) * pz];
  };
  const domeF = (y) => { const h = (y - yEq) / (yTop - yEq); return h <= 0 ? 1 : Math.pow(Math.max(0, 1 - Math.pow(h, 2.6)), 1 / 2.6); };   // flattish crown

  const shellPt = (th, y, extra = 0) => {
    const [px, pz] = plan(th);
    const deg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th), Math.cos(th)));
    const f = domeF(y) * (1 + Math.max(0, yEq - y) * 0.12 * smooth(60, 140, Math.abs(deg)));
    const pl = Math.hypot(px, pz) || 1;
    return new THREE.Vector3(px * f + (px / pl) * extra, y, cz + pz * f + (pz / pl) * extra);
  };
  return { a, cz, cF, cB, yTop, yEq, brim, yBotKeys, plan, domeF, shellPt };
}

/**
 * Build helmet + goggle geometry.
 * Returns { shell: BufferGeometry (aR, aUV), lens: BufferGeometry, hs: shape summary for the shader }.
 */
export function buildHelmet(body, shape = {}, goggle = {}) {
  const { a, cz, cF, yTop, yEq, brim, yBotKeys, shellPt } = helmetFit(body, shape);
  const parts = [];
  // ---- shell: rows from the crown down to the lower edge, then the rolled liner edge
  const cols = 73, rowsS = 30;
  const rows = rowsS + 3;
  const P = new Float32Array(rows * cols * 3), reg = new Float32Array(rows * cols);
  for (let k = 0; k < cols; k++) {
    const th = (k / (cols - 1)) * TAU;
    const deg = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th), Math.cos(th)));
    const yb = keyed(yBotKeys, deg);
    const brimW = 1 - smooth(34, 72, Math.abs(deg));
    for (let i = 0; i < rowsS; i++) {
      const s = i / (rowsS - 1);
      const yy = lerp(yTop, yb, Math.pow(s, 1.15));
      const ext = brim * brimW * smooth(0.78, 0.98, s) + 0.002 * smooth(0.9, 1, s);
      const p = shellPt(th, yy, ext);
      P.set([p.x, p.y, p.z], (i * cols + k) * 3);
      reg[i * cols + k] = 0;
    }
    // Rolled edge: under the brim / lip, then up inside the shell (liner).
    const last = shellPt(th, yb, brim * brimW + 0.002);
    const in1 = shellPt(th, yb - 0.002, brim * brimW - 0.012);
    const in2 = shellPt(th, yb + 0.012, -0.018);
    const in3 = shellPt(th, yb + 0.05, -0.02);
    [in1, in2, in3].forEach((p, j) => { P.set([p.x, p.y, p.z], ((rowsS + j) * cols + k) * 3); reg[(rowsS + j) * cols + k] = 1; });
    void last;
  }
  const shell = grid(P, rows, cols, true, (i, k) => { const p = new THREE.Vector3().fromArray(P, (i * cols + k) * 3); return p.sub(new THREE.Vector3(0, yEq - 0.04, cz)); });
  shell.region = reg;
  parts.push(shell);

  // ---- goggle lens (toric) + gasket rim
  const gw = goggle.width ?? 0.19, gh = goggle.height ?? 0.098, Rh = goggle.radius ?? 0.112, Rv = 0.3;
  const yc = 1.701;
  const zFront = cz + cF + brim + 0.002;                          // lens front at the brim line
  const z0 = zFront - Rh;
  const thMax = Math.asin(Math.min(0.95, gw / 2 / Rh));
  const lensPt = (th, y, off = 0) => {
    const zz = z0 + (Rh + off) * Math.cos(th) - ((y - yc) * (y - yc)) / (2 * Rv);
    return new THREE.Vector3((Rh + off) * Math.sin(th), y, zz);
  };
  // Outline: a rounded rectangle in (arc, y) with a nose notch at the bottom centre.
  const NO = 96;
  const outline = [];
  const hw = thMax * Rh, hh = gh / 2, rc = 0.024;
  for (let j = 0; j < NO; j++) {
    const ang = (j / NO) * TAU;
    // Superellipse-ish rounded rectangle via a squircle.
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const e = 6;
    let x = hw * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
    let y = hh * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
    // Lower edge sweeps up toward the outer corners (wrap-around look) and has a nose notch.
    if (y < 0) { y += 0.012 * Math.pow(Math.abs(x) / hw, 2); y += 0.026 * Math.exp(-Math.pow(x / 0.022, 2)); }
    else y -= 0.004 * Math.pow(Math.abs(x) / hw, 4);
    outline.push([x, y]);
    void rc;
  }
  const LR = 10;
  const lcols = NO + 1;
  const LP = new Float32Array((LR + 1) * lcols * 3);
  for (let i = 0; i <= LR; i++) {
    const s = Math.max(0.02, i / LR);
    for (let j = 0; j <= NO; j++) {
      const [ox, oy] = outline[j % NO];
      const p = lensPt((ox * s) / Rh, yc + 0.006 + oy * s);
      LP.set([p.x, p.y, p.z], (i * lcols + j) * 3);
    }
  }
  const lens = grid(LP, LR + 1, lcols, true, (i, k) => { const p = new THREE.Vector3().fromArray(LP, (i * lcols + k) * 3); return p.sub(new THREE.Vector3(0, yc, z0)); });
  // Exact toric normals (the concentric grid pinches at the centre).
  for (let q = 0; q < lens.n; q++) {
    const x = LP[q * 3], y = LP[q * 3 + 1];
    const th = Math.asin(Math.max(-1, Math.min(1, x / Rh)));
    const nn = new THREE.Vector3(Math.sin(th), Math.cos(th) * (y - yc) / Rv, Math.cos(th)).normalize();
    lens.N.set([nn.x, nn.y, nn.z], q * 3);
  }
  // Gasket: from the lens edge back toward the face.
  const GR = 4;
  const GP = new Float32Array(GR * lcols * 3);
  const gOff = [[0.0, -0.0015], [0.001, -0.006], [-0.002, -0.016], [-0.008, -0.022]];
  for (let i = 0; i < GR; i++) {
    for (let j = 0; j <= NO; j++) {
      const [ox, oy] = outline[j % NO];
      const l = Math.hypot(ox, oy) || 1;
      const grow = gOff[i][0];
      const p = lensPt((ox + (ox / l) * grow) / Rh, yc + 0.006 + oy + (oy / l) * grow, gOff[i][1]);
      GP.set([p.x, p.y, p.z], (i * lcols + j) * 3);
    }
  }
  const gasket = grid(GP, GR, lcols, true, (i, k) => {
    const [ox, oy] = outline[k % NO]; return new THREE.Vector3(ox, oy, 0.004);
  });
  gasket.region = 4;
  parts.push(gasket);

  // ---- strap: lens side → around the back of the shell through the clip → other side
  const ys = yc + 0.004, sh = 0.025;
  const path = [];
  const sideL = lensPt(thMax * 0.985, ys, -0.008), sideR = lensPt(-thMax * 0.985, ys, -0.008);
  const thS = THREE.MathUtils.degToRad(82);
  const shellAt = (th, y) => shellPt(th, y, 0.0035);
  const startL = shellAt(thS, ys);
  for (let j = 0; j <= 6; j++) path.push(sideL.clone().lerp(startL, j / 6));
  const M = 40;
  for (let j = 1; j < M; j++) path.push(shellAt(thS + (j / M) * (TAU - 2 * thS), ys));
  const startR = shellAt(TAU - thS, ys);
  for (let j = 0; j <= 6; j++) path.push(startR.clone().lerp(sideR, j / 6));
  const SC = path.length;
  const sec = [[0.0005, 1], [0.0005, -1], [-0.0025, -1], [-0.0025, 1]];   // [radial offset, across]
  const SP = new Float32Array(5 * SC * 3), SUV = new Float32Array(5 * SC * 2), SR = new Float32Array(5 * SC);
  let along = 0;
  for (let j = 0; j < SC; j++) {
    if (j) along += path[j].distanceTo(path[j - 1]);
    const T = path[Math.min(SC - 1, j + 1)].clone().sub(path[Math.max(0, j - 1)]).normalize();
    const out = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), T).normalize();
    // make sure "out" points away from the head centre
    if (out.dot(new THREE.Vector3(path[j].x, 0, path[j].z - cz)) < 0) out.negate();
    const clip = Math.exp(-Math.pow(Math.atan2(path[j].x, -(path[j].z - cz)) / 0.12, 2));
    for (let q = 0; q < 5; q++) {
      const [ro, ac] = sec[q % 4];
      const p = path[j].clone().addScaledVector(out, ro + (ro > 0 ? clip * 0.005 : 0)).add(new THREE.Vector3(0, ac * (sh + clip * 0.004), 0));
      SP.set([p.x, p.y, p.z], (q * SC + j) * 3);
      SUV.set([along, ac], (q * SC + j) * 2);
      SR[q * SC + j] = clip > 0.5 ? 3 : 2;
    }
  }
  const strap = grid(SP, 5, SC, false, (i, k) => new THREE.Vector3().fromArray(SP, (i * SC + k) * 3).sub(path[k]));
  strap.region = SR; strap.uv = SUV;
  parts.push(strap);

  const shellGeo = merge(parts);
  const lensGeo = new THREE.BufferGeometry();
  lensGeo.setAttribute('position', new THREE.BufferAttribute(lens.P, 3));
  lensGeo.setAttribute('normal', new THREE.BufferAttribute(lens.N, 3));
  lensGeo.setIndex(lens.idx);
  lensGeo.computeBoundingSphere();
  return { shell: shellGeo, lens: lensGeo, hs: { top: yTop, cz, halfW: a, yEq } };
}
