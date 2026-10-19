// The rider's look: baggy freeride shell + bib, leather mitts, gaiter, and a low-profile helmet with a
// big frameless goggle, all built procedurally around the Quaternius body and skinned to its bones.
//
//   const look = dressRider(gltf.scene, { bones, fp: () => rider.fp });  // in Rider.load()
//   look.apply(resolveOutfit(slots));                                    // garments + colours
//
// Geometry is built once per page per garment cut (cached, shared by the game and lobby riders);
// colours are uniforms. See docs/character.md.
import * as THREE from 'three';
import { BodyInfo } from './body.js';
import { buildOutfitGeometry } from './garments.js';
import { buildHelmet } from './helmet.js';
import { fabricMaterial, bodyMaterial, helmetMaterial, lensMaterial, applyLook } from './materials.js';
import { resolveOutfit } from './outfits.js';

export { resolveOutfit, colorwaySlots, COLORWAYS, GARMENTS, OUTFIT_SLOTS, DEFAULT_COLORWAY } from './outfits.js';

/** Head scale of the rig (1 = the model's own proportions; the old toon look used 1.12). */
export const HEAD_SCALE = 1.06;

const cache = { body: null, outfit: new Map(), helmet: new Map() };

function bodyInfo(mesh) {
  if (!cache.body) cache.body = new BodyInfo(mesh);
  return cache.body;
}

const cutKey = (g) => JSON.stringify([g.jacket.cut, g.pants.cut, g.gloves.cut, g.jacket.cut.hood === 'up' ? g.helmet.shape : 0]);
const helmKey = (g) => JSON.stringify([g.helmet.shape, g.goggles.shape]);

function outfitGeometry(body, garments) {
  const k = cutKey(garments);
  if (!cache.outfit.has(k)) {
    const t0 = performance.now();
    cache.outfit.set(k, buildOutfitGeometry(body, { ...garments.jacket.cut, ...garments.pants.cut, ...garments.gloves.cut, helmetShape: garments.helmet.shape }));
    if (typeof window !== 'undefined' && window.__senditDebug) console.info(`[character] outfit geometry ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return cache.outfit.get(k);
}

function helmetGeometry(body, garments) {
  const k = helmKey(garments);
  if (!cache.helmet.has(k)) cache.helmet.set(k, buildHelmet(body, garments.helmet.shape, garments.goggles.shape));
  return cache.helmet.get(k);
}

/**
 * Dress a freshly loaded rider model. `scene` is the glTF scene (body mesh still with its original
 * material), `bones` the name → Bone map. Returns the look handle:
 *   { suit (body material), fabric, helmet, lens, apply(outfit), meshes }
 */
export function dressRider(scene, { bones, fp = () => false } = {}) {
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && o.material?.name?.includes('Superhero')) body = o; });
  if (!body) throw new Error('character: body mesh not found');
  const info = bodyInfo(body);
  const suit = bodyMaterial(body.material);
  body.material = suit;
  const fabric = fabricMaterial();
  const helmetMat = helmetMaterial({ top: 1.84, cz: 0, halfW: 0.11, yEq: 1.708 });
  const lens = lensMaterial();

  const garments = new THREE.SkinnedMesh(new THREE.BufferGeometry(), fabric);
  garments.name = 'Outfit';
  garments.castShadow = true; garments.receiveShadow = true; garments.frustumCulled = false;
  body.parent.add(garments);
  garments.bind(body.skeleton, body.bindMatrix);
  // First person: hide the collar, hood and gaiter that sit around the camera (the head bone already
  // collapses the helmet and face).
  garments.onBeforeRender = () => { fabric.userData.uniforms.uHide.value = fp() ? 1 : 0; };

  // Helmet + goggle: rigid on the head bone, placed like vertices skinned 100 % to it.
  const head = bones.Head;
  const hi = body.skeleton.bones.indexOf(head);
  const toHead = body.skeleton.boneInverses[hi].clone().multiply(body.bindMatrix);
  const helmet = new THREE.Mesh(new THREE.BufferGeometry(), helmetMat);
  const lensMesh = new THREE.Mesh(new THREE.BufferGeometry(), lens);
  for (const m of [helmet, lensMesh]) {
    m.matrixAutoUpdate = false; m.matrix.copy(toHead); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    head.add(m);
  }
  helmet.name = 'Helmet'; lensMesh.name = 'GoggleLens';

  let key = null;
  const look = {
    suit, fabric, helmet: helmetMat, lens, meshes: { body, garments, helmet, lens: lensMesh },
    outfit: null,
    /** Show an outfit: resolveOutfit() result, or slot selections for it. */
    apply(outfit) {
      const o = outfit?.garments ? outfit : resolveOutfit(outfit);
      look.outfit = o;
      const k = cutKey(o.garments) + helmKey(o.garments);
      if (k !== key) {
        key = k;
        garments.geometry = outfitGeometry(info, o.garments);
        const h = helmetGeometry(info, o.garments);
        helmet.geometry = h.shell; lensMesh.geometry = h.lens;
        helmetMat.userData.uniforms.uHelm.value.set(h.hs.top, h.hs.cz, h.hs.halfW, h.hs.yEq);
        const c = o.garments.jacket.cut, pc = o.garments.pants.cut;
        fabric.userData.uniforms.uHemY.value.set(c.hemFront, pc.cuffY, c.sleeveEnd);
        suit.userData.uniforms.uJHem.value = Math.min(c.hemFront, c.hemBack) + 0.12;
        fabric.userData.uniforms.uFit.value.set(c.style ?? 0, c.quilt?.pitch ?? 0.1, c.hemBack, c.kangaroo || 0);
      }
      const C = o.colors, F = fabric.userData.uniforms, S = suit.userData.uniforms, H = helmetMat.userData.uniforms, L = lens.userData.uniforms;
      F.uJacket.value.set(C.jacket.base); F.uPanel.value.set(C.jacket.panel); F.uAccent.value.set(C.jacket.accent);
      F.uGaiter.value.set(C.jacket.gaiter); F.uStyle.value = C.jacket.style || 0;
      F.uPants.value.set(C.pants.base); F.uCuff.value.set(C.pants.cuff);
      F.uMitt.value.set(C.gloves.base); F.uGauntlet.value.set(C.gloves.cuff);
      S.uJacket.value.set(C.jacket.base); S.uPants.value.set(C.pants.base); S.uMitt.value.set(C.gloves.base);
      H.uShell.value.set(C.helmet.base); H.uLiner.value.set(C.helmet.liner); H.uHAccent.value.set(C.helmet.accent);
      H.uStrap.value.set(C.goggles.strap); H.uStrapLogo.value.set(C.goggles.strapLogo);
      L.uLens.value.set(C.goggles.lens); L.uLensBase.value.set(C.goggles.lensBase);
      applyLook({ fabric, helmet: helmetMat, lens }, C);   // reward prints, finishes, decals (profile/items.js)
      return o;
    },
  };
  return look;
}
