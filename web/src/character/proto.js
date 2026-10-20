// Jacket prototype round (docs/character.md § Prototype round). DEV ONLY: nothing here changes the
// shipped look unless the page is opened with a URL flag:
//
//   ?proto=N            dress every rider on the page in prototype N (1–10) and use that prototype's body
//   ?protobody=natural  force the more natural male body (narrower shoulders / chest, slimmer arms,
//   ?protobody=current  longer thigh) or the current Quaternius body, whatever the prototype says
//
// The capture script (web/scripts/proto-sheet.mjs) loads one page per body and switches prototypes with
// window.__senditProto.slots(n). Outfit cuts are passed to resolveOutfit() as inline garment definitions
// (`def`), so no catalog item, profile or icon changes.
import * as THREE from 'three';
import { jacketCut, PANT_FITS } from './outfits.js';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** Prototype number from ?proto=N (0 = off). */
export const PROTO = Math.max(0, Math.min(10, parseInt(params.get('proto') || '0', 10) || 0));

// ------------------------------------------------------------------------------------------------
// Body: a more natural adult male under the clothes.
//
// Measured on the Quaternius "superhero" bind pose (1.81 m, web/scripts/proto-measure.mjs) against
// adult male anthropometry for ~1.80 m (ANSUR II means, see docs): the vertical landmarks are close to
// real (shoulder joint 1.455, hip joint 0.97, crotch ~0.84, knee 0.54), but the trunk is ~30 % too big
// across and deep at the chest (0.45 × 0.34 m vs ~0.35 × 0.26), the shoulder joints sit 3 cm too far
// out (biacromial ≈ 0.47 vs 0.40), the upper arms are ~0.18 m thick (real ~0.11) and the thigh is 1.5 cm
// short / the shin 1 cm long. The morph below fixes those, keeping every landmark the outfit code keys on
// (neck, shoulder-joint height, wrist |x| 0.706, hands, head, hips, ankles) where it was.
// ------------------------------------------------------------------------------------------------
export const BODIES = {
  current: null,
  natural: {
    chest: 0.81,      // trunk width × at the chest / shoulders (1.30–1.56)
    waist: 0.94,      // … at the waist (1.12)
    chestDepth: 0.8,  // trunk depth × at the chest (pecs + lats + shoulder blades)
    waistDepth: 0.96,
    arm: 0.78,        // upper-arm girth × (biceps / deltoid), easing to 1 at the wrist
    forearm: 0.88,
    trap: 0.012,      // m the trapezius slope is lowered beside the neck
    knee: -0.02,      // m the knee moves (− = down: longer thigh, shorter shin; hip and ankle stay)
  },
};

/** Body kind for this page: ?protobody overrides the prototype's own choice. */
export function protoBodyKind() {
  const forced = params.get('protobody');
  if (forced && forced in BODIES) return forced;
  if (PROTO) return PROTOTYPES[PROTO - 1].body;
  return 'current';
}

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// ∫ smoothstep: 0 below −h, u above h, C1 in between (a soft hinge).
const hinge = (u, h) => { if (u <= -h) return 0; if (u >= h) return u; const t = (u + h) / (2 * h); return 2 * h * (t * t * t - 0.5 * t * t * t * t); };

/** The bind-space deformation (metres, Y up, facing +Z, feet at 0) for body parameters B. */
export function bodyWarp(B) {
  const A0 = 0.212, W = 0.706, ARM_Y = 1.455, ARM_Z = -0.068, ZC = -0.02, HIP = 0.971, KNEE = 0.542, ANK = 0.086;
  const sx = (y) => {
    if (y < 0.98) return 1;
    if (y < 1.12) return lerp(1, B.waist, sm(0.98, 1.12, y));
    if (y < 1.3) return lerp(B.waist, B.chest, sm(1.12, 1.3, y));
    return lerp(B.chest, 1, sm(1.56, 1.63, y));
  };
  const sz = (y) => {
    if (y < 0.98) return 1;
    if (y < 1.12) return lerp(1, B.waistDepth, sm(0.98, 1.12, y));
    if (y < 1.32) return lerp(B.waistDepth, B.chestDepth, sm(1.12, 1.32, y));
    return lerp(B.chestDepth, 1, sm(1.5, 1.61, y));
  };
  const kneeTo = KNEE + B.knee;
  const legY = (y) => {
    if (y >= HIP || y <= ANK) return y;
    if (y >= KNEE) return kneeTo + (y - KNEE) * (HIP - kneeTo) / (HIP - KNEE);
    return ANK + (y - ANK) * (kneeTo - ANK) / (KNEE - ANK);
  };
  return (p) => {
    const x = p.x, y = p.y, z = p.z, a = Math.abs(x), sg = x < 0 ? -1 : 1;
    // Lateral: the trunk scales about the mid-line; beyond the shoulder joint the arm is stretched so
    // the wrist (and the hand / mitt) stays where it was (a C1 hinge at the shoulder and at the wrist).
    const s = sx(y), h = 0.035;
    const k = (W - s * A0) / (W - A0);
    const ga = s * a + (k - s) * hinge(a - A0, h) + (1 - k) * hinge(a - W, h);
    // Depth: the trunk only (fades out along the arm).
    const trunk = 1 - sm(0.17, 0.27, a);
    let nz = ZC + (z - ZC) * lerp(1, sz(y), trunk);
    let ny = y;
    // Arm girth about the arm's axis (T-pose), from the deltoid to the wrist.
    const armW = sm(0.17, 0.27, a) * sm(1.3, 1.37, y);   // (the T-pose arm's underside is at ~1.365: lats stay)
    if (armW > 0) {
      const r = a < 0.42 ? B.arm : a < 0.55 ? lerp(B.arm, B.forearm, sm(0.42, 0.55, a)) : lerp(B.forearm, 1, sm(0.55, 0.69, a));
      const f = lerp(1, r, armW);
      ny = ARM_Y + (ny - ARM_Y) * f;
      nz = ARM_Z + (nz - ARM_Z) * f;
    }
    // Trapezius: lower the slope beside the neck.
    ny -= B.trap * sm(1.49, 1.55, y) * (1 - sm(1.58, 1.64, y)) * sm(0.05, 0.1, a) * (1 - sm(0.17, 0.24, a)) * trunk;
    ny = legY(ny);
    return new THREE.Vector3(sg * ga, ny, nz);
  };
}

/**
 * Re-proportion a freshly loaded rider glTF (before it is added to anything, rest pose = bind pose):
 * moves every vertex of the skinned meshes through bodyWarp(), moves the joints the same way (keeping
 * each bone's orientation), re-poses the bones to the new joints and rebinds (boneInverses), so the
 * skinning, the pose code (it reads the rest pose after this) and the outfit (built from the body's
 * bind pose) all see one consistent new body.
 */
export function morphBody(scene, kind = protoBodyKind()) {
  const B = BODIES[kind];
  if (!B) return false;
  const f = bodyWarp(B);
  scene.updateMatrixWorld(true);
  let body = null;
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) { skinned.push(o); if (o.material?.name?.includes('Superhero')) body = o; } });
  if (!body || body.geometry.userData.protoMorphed) return false;
  const bind = body.bindMatrix, bindInv = bind.clone().invert();
  // New rest world matrix per bone: the bind frame with its origin moved through f.
  const W = new Map();
  body.skeleton.bones.forEach((bone, j) => {
    const M = body.skeleton.boneInverses[j].clone().invert().premultiply(bindInv);   // body-local frame
    const t = new THREE.Vector3().setFromMatrixPosition(M);
    const t2 = f(t);
    M.setPosition(t2);
    W.set(bone, M.premultiply(bind));
  });
  // Re-pose the bones (parents first) so their rest world matrices are the new ones.
  const order = [];
  const walk = (o) => { if (o.isBone && W.has(o)) order.push(o); for (const c of o.children) walk(c); };
  walk(scene);
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  for (const bone of order) {
    const parentW = bone.parent && W.has(bone.parent) ? W.get(bone.parent) : bone.parent.matrixWorld;
    const local = parentW.clone().invert().multiply(W.get(bone));
    local.decompose(tmpP, tmpQ, tmpS);
    bone.position.copy(tmpP);
    bone.quaternion.copy(tmpQ);
  }
  scene.updateMatrixWorld(true);
  // Vertices (+ normals through the warp's Jacobian) and bind inverses of every skinned mesh.
  for (const m of skinned) {
    const g = m.geometry;
    if (g.userData.protoMorphed) continue;
    const toBody = bindInv.clone().multiply(m.bindMatrix), fromBody = toBody.clone().invert();
    const P = g.attributes.position, N = g.attributes.normal;
    const p = new THREE.Vector3(), n = new THREE.Vector3(), e = 0.002;
    const J = new THREE.Matrix3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i).applyMatrix4(toBody);
      const q = f(p);
      if (N) {
        const dx = f(p.clone().setX(p.x + e)).sub(f(p.clone().setX(p.x - e))).multiplyScalar(0.5 / e);
        const dy = f(p.clone().setY(p.y + e)).sub(f(p.clone().setY(p.y - e))).multiplyScalar(0.5 / e);
        const dz = f(p.clone().setZ(p.z + e)).sub(f(p.clone().setZ(p.z - e))).multiplyScalar(0.5 / e);
        J.set(dx.x, dy.x, dz.x, dx.y, dy.y, dz.y, dx.z, dy.z, dz.z);
        J.invert().transpose();
        n.fromBufferAttribute(N, i).applyMatrix3(J).normalize();
        N.setXYZ(i, n.x, n.y, n.z);
      }
      q.applyMatrix4(fromBody);
      P.setXYZ(i, q.x, q.y, q.z);
    }
    P.needsUpdate = true; if (N) N.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.protoMorphed = kind;
    m.skeleton.bones.forEach((bone, j) => { if (W.has(bone)) m.skeleton.boneInverses[j].copy(W.get(bone)).invert(); });
  }
  return true;
}

// ------------------------------------------------------------------------------------------------
// The ten prototype looks. Heights are bind-pose metres (crotch ≈ 0.84, hip joint 0.97, belt ≈ 1.05,
// centre-back neck seam ≈ 1.56, so a garment's centre-back length CB puts the back hem at ≈ 1.56 − CB).
// Jacket `fab` / pants `fab` = fabric texture, jacket `style` 5+ / pants `style` = prototype layouts in
// materials.js (fabricMaterial). Colours: jacket.layer = the hoodie worn under a layered look.
// ------------------------------------------------------------------------------------------------
export const FAB = { nylon: 0, hardshell: 1, twill: 2, ripstop: 3, jersey: 4, wool: 5, canvas: 6, flannel: 7, satin: 8 };
export const PSTYLE = { plain: 0, shell: 1, cargo: 2, carpenter: 3, retro: 4 };
export const JSTYLE = { varsity: 5, retro: 6, work: 7, shirt: 8, tee: 9 };

const pants = (fit, over = {}) => ({ ...PANT_FITS[fit], ...over, fit: `proto-${fit}`, leg: { ...PANT_FITS[fit].leg, ...over.leg }, stack: { ...PANT_FITS[fit].stack, ...over.stack } });
const mitt = { mittLength: 0.835, gauntlet: [0.618, 0.008] };
const underSleeve = { mittLength: 0.835, gauntlet: [0.655, -0.012] };   // short cuff tucked under a long sleeve

export const PROTOTYPES = [
  {
    id: 1, name: 'Alpine Hardshell', body: 'natural',
    fit: 'Relaxed 3L hardshell, hip length + drop tail (CB 76 cm), articulated; straight shell pant',
    jacket: jacketCut('relaxed', {
      hemFront: 0.86, hemBack: 0.8, hemFlare: 0.002, fab: FAB.hardshell, folds: 0.85,
      torso: { chest: [0.222, 0.15, 0.158], waist: [0.226, 0.152, 0.162], hem: [0.238, 0.16, 0.172], n: 2.4 },
      sleeve: { upper: 0.07, elbow: 0.069, forearm: 0.066, cuff: 0.064 }, sleeveEnd: 0.7,
      hoodRoll: [0.04, 0.062, 0.06],
    }),
    pants: pants('relaxed', { bib: null, rise: 1.07, style: PSTYLE.shell, fab: FAB.hardshell, leg: { thigh: 0.12, knee: 0.112, hem: 0.112 }, cuffY: 0.1, stack: { y0: 0.11, y1: 0.26, n: 2, amp: 0.011 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#2b4f4c', panel: '#23403e', accent: '#c9f25a', gaiter: '#1f2523', style: 0 },
      pants: { base: '#1c1e21', cuff: '#121315' },
      helmet: { base: '#1f2224', liner: '#111213', accent: '#c9f25a' },
      goggles: { lens: '#7fd0ff', lensBase: '#1d4d73', strap: '#151617', strapLogo: '#c9f25a' },
      gloves: { base: '#23262a', cuff: '#151617' },
    },
  },
  {
    id: 2, name: 'Insulated Freedom', body: 'current',
    fit: 'Relaxed insulated 2L twill, hip length, contrast yoke; relaxed insulated pant',
    jacket: jacketCut('relaxed', {
      hemFront: 0.885, hemBack: 0.855, fab: FAB.twill, folds: 0.7, shoulder: 0.009,
      torso: { chest: [0.24, 0.166, 0.17], waist: [0.244, 0.166, 0.172], hem: [0.25, 0.17, 0.178], n: 2.25 },
      sleeve: { upper: 0.08, elbow: 0.079, forearm: 0.076, cuff: 0.068 }, sleeveEnd: 0.698,
      quilt: { pitch: 0.24, depth: 0.004 },   // thin synthetic fill: a soft loft between widely spaced lines
    }),
    pants: pants('relaxed', { bib: null, rise: 1.085, style: PSTYLE.cargo, fab: FAB.twill, cargo: 0.012, leg: { thigh: 0.13, knee: 0.12, hem: 0.118 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#d9982a', panel: '#1b1c1e', accent: '#f1ede4', gaiter: '#1b1c1e', style: 0 },
      pants: { base: '#1b1c1e', cuff: '#111113' },
      helmet: { base: '#e9e6de', liner: '#1b1c1e', accent: '#d9982a' },
      goggles: { lens: '#f2c14a', lensBase: '#8a4a12', strap: '#1b1c1e', strapLogo: '#f1ede4' },
      gloves: { base: '#1d1e20', cuff: '#111113' },
    },
  },
  {
    id: 3, name: 'New-School Anorak', body: 'natural',
    fit: 'Oversized long pullover (CB 82 cm), hood up over the helmet, sleeves stacked over the gloves; baggy pant, big stack',
    jacket: jacketCut('anorak', {
      hemFront: 0.79, hemBack: 0.74, seatClear: 0.036, fab: FAB.twill, folds: 1.35, shoulder: 0.01, shoulderY: 1.41,
      torso: { chest: [0.25, 0.172, 0.176], waist: [0.262, 0.178, 0.184], hem: [0.28, 0.19, 0.2], n: 2.25 },
      sleeve: { upper: 0.088, elbow: 0.087, forearm: 0.085, cuff: 0.08 }, sleeveEnd: 0.735,
      hood: 'up', kangaroo: 0.016,
    }),
    pants: pants('baggy', { crotch: 0.79, fab: FAB.twill, leg: { thigh: 0.146, knee: 0.142, hem: 0.142 }, cuffY: 0.07, stack: { y0: 0.08, y1: 0.36, n: 5, amp: 0.019 } }),
    gloves: underSleeve,
    colors: {
      jacket: { base: '#8e9c82', panel: '#e4dccb', accent: '#2e3328', gaiter: '#2e3328', style: 1 },
      pants: { base: '#2f3329', cuff: '#23261f' },
      helmet: { base: '#e4dccb', liner: '#2e3328', accent: '#8e9c82' },
      goggles: { lens: '#c89bff', lensBase: '#3d2470', strap: '#2e3328', strapLogo: '#e4dccb' },
      gloves: { base: '#2e3328', cuff: '#1d201a' },
    },
  },
  {
    id: 4, name: 'Tall Tee Layer', body: 'natural',
    fit: 'Tall tee (mid-thigh) over a hoodie over a shell; baggy camo cargo with bellows pockets',
    jacket: jacketCut('hoodie', {
      style: JSTYLE.tee, hemFront: 0.72, hemBack: 0.7, hemFlare: 0.004, seatClear: 0.04, fab: FAB.jersey, folds: 1.15,
      torso: { chest: [0.252, 0.168, 0.172], waist: [0.262, 0.172, 0.178], hem: [0.272, 0.178, 0.186], n: 2.2 },
      sleeve: { upper: 0.096, elbow: 0.094, forearm: 0.076, cuff: 0.064 }, sleeveEnd: 0.705,
      sleeveLayer: { at: 0.47, r: 0.074 },   // the tee sleeve ends at the elbow; the hoodie sleeve below
      collarTop: 1.6, collarEase: 0.02, hood: 'hoodie', hoodSpan: 62,
    }),
    pants: pants('baggy', { crotch: 0.8, style: PSTYLE.cargo, fab: FAB.twill, cargo: 0.016, leg: { thigh: 0.14, knee: 0.134, hem: 0.13 }, stack: { n: 4, amp: 0.017 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#ebe7de', panel: '#3b3e43', accent: '#d2462f', gaiter: '#3b3e43', layer: '#3b3e43', style: 0 },
      pants: { base: '#59603f', cuff: '#3f4430', pat: 'camo', patA: '#3a3f2a', patB: '#7d7656', patScale: 1 },
      helmet: { base: '#2d3034', liner: '#151618', accent: '#d2462f' },
      goggles: { lens: '#ff8a3d', lensBase: '#7a2a10', strap: '#ebe7de', strapLogo: '#d2462f' },
      gloves: { base: '#8b6a48', cuff: '#2d3034' },
    },
  },
  {
    id: 5, name: 'Boxy Puffer', body: 'natural',
    fit: 'Cropped oversized puffer (CB 62 cm, ends at the belt), boxy, chunky baffles; wide straight pant',
    jacket: jacketCut('puffer', {
      hemFront: 0.965, hemBack: 0.96, hemFlare: -0.01, fab: FAB.ripstop,
      torso: { chest: [0.262, 0.18, 0.184], waist: [0.266, 0.182, 0.188], hem: [0.262, 0.18, 0.186], n: 2.7 },
      sleeve: { upper: 0.094, elbow: 0.092, forearm: 0.088, cuff: 0.066 }, sleeveEnd: 0.692,
      collarTop: 1.648, collarEase: 0.036, quilt: { pitch: 0.125, depth: 0.019 },
    }),
    pants: pants('baggy', { crotch: 0.815, style: PSTYLE.plain, fab: FAB.twill, leg: { thigh: 0.142, knee: 0.142, hem: 0.144 }, cuffY: 0.08, stack: { n: 3, amp: 0.014 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#4a3226', panel: '#3c281e', accent: '#e8dcc4', gaiter: '#3c281e', style: 0 },
      pants: { base: '#e3d9c4', cuff: '#c9bea6' },
      helmet: { base: '#e8dcc4', liner: '#3c281e', accent: '#4a3226' },
      goggles: { lens: '#e8b04a', lensBase: '#6b3a12', strap: '#4a3226', strapLogo: '#e8dcc4' },
      gloves: { base: '#3c281e', cuff: '#2a1c15' },
    },
  },
  {
    id: 6, name: 'Race Shell', body: 'natural',
    fit: 'Slim technical race / freeride shell, hip bone (CB 66 cm), laminated, close sleeves; tapered shell pant',
    jacket: jacketCut('shell', {
      hemFront: 0.94, hemBack: 0.905, fab: FAB.hardshell, folds: 0.55,
      torso: { chest: [0.214, 0.146, 0.154], waist: [0.206, 0.14, 0.15], hem: [0.214, 0.146, 0.158], n: 2.4 },
      sleeve: { upper: 0.064, elbow: 0.062, forearm: 0.059, cuff: 0.056 }, sleeveEnd: 0.69,
    }),
    pants: pants('tapered', { style: PSTYLE.shell, fab: FAB.hardshell, leg: { thigh: 0.114, knee: 0.1, hem: 0.094 }, cuffY: 0.15, stack: { n: 1, amp: 0.008 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#1f5fd1', panel: '#111317', accent: '#ff3d2e', gaiter: '#111317', style: 0 },
      pants: { base: '#111317', cuff: '#0a0b0d' },
      helmet: { base: '#111317', liner: '#0a0b0d', accent: '#1f5fd1' },
      goggles: { lens: '#ff5a3d', lensBase: '#6b1a10', strap: '#1f5fd1', strapLogo: '#ffffff' },
      gloves: { base: '#111317', cuff: '#0a0b0d' },
    },
  },
  {
    id: 7, name: 'Varsity Coach', body: 'natural',
    fit: 'Coaches / varsity snow jacket: snap front, rib collar, cuffs and hem, contrast sleeves; relaxed bib',
    jacket: jacketCut('relaxed', {
      style: JSTYLE.varsity, hemFront: 0.9, hemBack: 0.885, hemFlare: -0.017, fab: FAB.wool, folds: 0.9,
      torso: { chest: [0.236, 0.162, 0.166], waist: [0.244, 0.164, 0.17], hem: [0.244, 0.164, 0.17], n: 2.35 },
      sleeve: { upper: 0.079, elbow: 0.078, forearm: 0.074, cuff: 0.056 }, sleeveEnd: 0.7,
      collarTop: 1.598, collarEase: 0.016, hood: 'none', hoodRoll: null,
    }),
    pants: pants('relaxed', { style: PSTYLE.plain, fab: FAB.twill }),
    gloves: mitt,
    colors: {
      jacket: { base: '#24452f', panel: '#e8e1cf', accent: '#d8a63a', gaiter: '#1c3324', style: 0 },
      pants: { base: '#2b2c2e', cuff: '#1c1d1f' },
      helmet: { base: '#e8e1cf', liner: '#24452f', accent: '#d8a63a' },
      goggles: { lens: '#4fd18a', lensBase: '#124a2a', strap: '#24452f', strapLogo: '#e8e1cf' },
      gloves: { base: '#8a5a3a', cuff: '#24452f' },
    },
  },
  {
    id: 8, name: '90s Colour Block', body: 'current',
    fit: 'Retro colour-blocked jacket, roomy, hip length, diagonal chest block; matching striped pant',
    jacket: jacketCut('relaxed', {
      style: JSTYLE.retro, hemFront: 0.895, hemBack: 0.875, fab: FAB.satin, folds: 1,
      torso: { chest: [0.244, 0.166, 0.17], waist: [0.248, 0.166, 0.172], hem: [0.252, 0.168, 0.176], n: 2.5 },
      sleeve: { upper: 0.082, elbow: 0.08, forearm: 0.077, cuff: 0.064 }, sleeveEnd: 0.7,
      hoodRoll: [0.046, 0.066, 0.06],
    }),
    pants: pants('relaxed', { bib: null, rise: 1.09, style: PSTYLE.retro, fab: FAB.satin, leg: { thigh: 0.126, knee: 0.118, hem: 0.116 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#ece4cf', panel: '#16827f', accent: '#6b3fa0', gaiter: '#2a2233', style: 0 },
      pants: { base: '#16827f', cuff: '#6b3fa0' },
      helmet: { base: '#ece4cf', liner: '#2a2a2c', accent: '#6b3fa0' },
      goggles: { lens: '#ffd23f', lensBase: '#7a4a10', strap: '#6b3fa0', strapLogo: '#ece4cf' },
      gloves: { base: '#6b3fa0', cuff: '#2a2233' },
    },
  },
  {
    id: 9, name: 'Duck Canvas Work', body: 'natural',
    fit: 'Utility chore jacket in duck canvas, boxy, cord collar, patch pockets; double-knee carpenter pant',
    jacket: jacketCut('relaxed', {
      style: JSTYLE.work, hemFront: 0.875, hemBack: 0.865, hemFlare: 0.0, fab: FAB.canvas, folds: 1.1,
      torso: { chest: [0.244, 0.168, 0.17], waist: [0.252, 0.17, 0.176], hem: [0.262, 0.176, 0.184], n: 2.75 },
      sleeve: { upper: 0.08, elbow: 0.079, forearm: 0.076, cuff: 0.07 }, sleeveEnd: 0.7,
      collarTop: 1.612, collarEase: 0.026, hood: 'none', hoodRoll: null,
    }),
    pants: pants('relaxed', { bib: null, rise: 1.085, style: PSTYLE.carpenter, fab: FAB.canvas, leg: { thigh: 0.132, knee: 0.126, hem: 0.124 }, cuffY: 0.09, stack: { n: 3, amp: 0.013 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#8c6a3f', panel: '#43301f', accent: '#c8ab72', gaiter: '#4a3224', style: 0 },
      pants: { base: '#4a5236', cuff: '#3a4029' },
      helmet: { base: '#2a2826', liner: '#141312', accent: '#a8783f' },
      goggles: { lens: '#f0a43a', lensBase: '#7a3a10', strap: '#4a3224', strapLogo: '#c9a25a' },
      gloves: { base: '#b08a5a', cuff: '#2a2826' },
    },
  },
  {
    id: 10, name: 'Sherpa Flannel', body: 'natural',
    fit: 'Sherpa-lined flannel shirt-jacket over a hoodie, straight shirt hem; baggy pant',
    jacket: jacketCut('relaxed', {
      style: JSTYLE.shirt, hemFront: 0.86, hemBack: 0.85, hemFlare: 0.003, fab: FAB.flannel, folds: 1.15,
      torso: { chest: [0.24, 0.166, 0.17], waist: [0.248, 0.168, 0.174], hem: [0.256, 0.172, 0.18], n: 2.45 },
      sleeve: { upper: 0.08, elbow: 0.079, forearm: 0.076, cuff: 0.068 }, sleeveEnd: 0.7,
      collarTop: 1.605, collarEase: 0.03, hood: 'hoodie', hoodSpan: 62, hoodRoll: null,
    }),
    pants: pants('baggy', { crotch: 0.805, style: PSTYLE.plain, fab: FAB.twill, leg: { thigh: 0.138, knee: 0.134, hem: 0.134 } }),
    gloves: mitt,
    colors: {
      jacket: { base: '#9e3d26', panel: '#1d1b1a', accent: '#e9e0cc', gaiter: '#8f9194', layer: '#8f9194', style: 0 },
      pants: { base: '#2e3034', cuff: '#202226' },
      helmet: { base: '#2e3034', liner: '#151618', accent: '#9e3d26' },
      goggles: { lens: '#ffb04a', lensBase: '#7a3410', strap: '#1d1b1a', strapLogo: '#e9e0cc' },
      gloves: { base: '#7a5236', cuff: '#1d1b1a' },
    },
  },
];

/** Slot selections for resolveOutfit() that dress a rider in prototype n (1–10). */
export function protoSlots(n) {
  const P = PROTOTYPES[n - 1];
  if (!P) return null;
  const def = (slot, cut) => ({ def: { id: `proto-${n}-${slot}`, name: `P${n} ${P.name}`, cut }, colors: P.colors[slot] });
  return {
    jacket: def('jacket', P.jacket), pants: def('pants', P.pants), gloves: def('gloves', P.gloves),
    helmet: { colors: P.colors.helmet }, goggles: { colors: P.colors.goggles },
    face: { colors: { base: P.colors.jacket.gaiter, pat: 'none' } },
  };
}

if (typeof window !== 'undefined') {
  window.__senditProto = { PROTO, body: protoBodyKind(), list: PROTOTYPES.map(({ id, name, fit, body }) => ({ id, name, fit, body })), slots: protoSlots };
}
