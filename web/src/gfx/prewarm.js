// Load-time warm-up, so nothing compiles, uploads or builds for the first time while riding.
//  prewarm(): runs once behind the loading screen. Fills the tree pools and terrain LODs around the
//    spawn and the lobby view, uploads every texture, then renders a few full frames (shadow pass and
//    post stack included) with every variant on screen once: all tree LODs and their shadow-depth
//    shaders, a spray particle and its shadow shader, the speed-wind pass, the track-stamp and
//    track-recentre passes. Then everything is put back.
//  warmQualityVariants(): after loading, compiles the terrain / backdrop shader variants of the other
//    quality levels in the background (KHR_parallel_shader_compile), so switching quality in the
//    settings doesn't stall either. The variant materials are kept alive so their programs stay cached.
import * as THREE from 'three';

/** Every texture referenced by a material (maps and texture uniforms). */
function materialTextures(m, out) {
  for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap', 'aoMap', 'roughnessMap', 'metalnessMap']) if (m[k]?.isTexture) out.add(m[k]);
  for (const u of Object.values(m.uniforms || m.userData?.uniforms || {})) if (u?.value?.isTexture) out.add(u.value);
}

export async function prewarm({ renderer, scene, camera, post, scatter, terrain, fx, spots = [] }) {
  const t0 = performance.now();
  // 1. Geometry around the places the player first sees: terrain LOD (all chunks, no budget) and tree pools.
  for (const p of spots) terrain.update(p, Infinity);
  if (spots[0]) { scatter.trees.last.set(1e9, 0, 0); scatter.update(spots[0]); }
  // 2. Textures: upload now (initTexture), not on first draw.
  const texs = new Set();
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) materialTextures(m, texs); });
  for (const m of Object.values(scatter.trees.mats)) materialTextures(m, texs);
  for (const m of [terrain.material, terrain.farMaterial]) if (m) materialTextures(m, texs);
  for (const t of texs) if (t.image || t.isRenderTargetTexture || t.isDataTexture) { try { renderer.initTexture(t); } catch { /* not uploadable yet */ } }
  // 3. Warm frames with every variant in view.
  const restore = [];
  const target = new THREE.Vector3(0, 0, -12).applyQuaternion(camera.quaternion).add(camera.position);
  target.y = terrain.getHeight(target.x, target.z);
  const m = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z);
  for (const pool of scatter.trees.pools || []) {
    const im = pool.im, n = im.count, sc = im.userData.shadowCount, a = im.instanceMatrix;
    if (n === 0) { im.setMatrixAt(0, m); im.count = 1; a.clearUpdateRanges(); a.needsUpdate = true; }
    im.userData.shadowCount = Math.max(1, sc);   // every pool's shadow-depth shader compiles now
    restore.push(() => { im.count = n; im.userData.shadowCount = sc; });
  }
  for (const im of scatter.cells || []) { const v = im.visible; im.visible = true; restore.push(() => { im.visible = v; }); }
  for (const im of scatter.trees.cells || []) { const v = im.visible; im.visible = true; restore.push(() => { im.visible = v; }); }
  // Everything drawable is drawn in the warm frames, in view or not: renderer.compile() builds the
  // canvas variant of each program, but the game draws into the post stack's render target (another
  // output colour space -> other programs), so only real frames warm the real programs (e.g. lift
  // cables out of view at load). Shadow casters outside the shadow box get their depth programs too.
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.frustumCulled) return;
    o.frustumCulled = false;
    restore.push(() => { o.frustumCulled = true; });
  });
  const sp = fx?.spray;
  if (sp) {
    for (const k of [0, 1, 2, 3]) sp.spawn(k, target.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(), 0.2, 0.05);
    sp.update(0.001);
  }
  const wind = post.windPass, windOn = wind?.enabled;
  if (wind) wind.enabled = true;
  if (fx?.track) {
    // Stamp (strength 0: leaves no mark) + a recentre copy pass, then back to a clean map.
    fx.track.stamp('warm', target, 0, 0.1, 0);
    fx.track.flush(target);
    fx.track.flush(target.clone().add(new THREE.Vector3(fx.track.meters, 0, 0)));
    fx.track.clear();
  }
  renderer.compile(scene, camera);
  for (let i = 0; i < 2; i++) post.composer.render(1 / 60);
  if (wind) wind.enabled = windOn;
  for (const r of restore) r();
  if (sp) { for (let i = 0; i < sp.cap; i++) sp.life[i] = 0; sp.update(0.001); }
  for (const pool of scatter.trees.pools || []) { const a = pool.im.instanceMatrix; a.clearUpdateRanges(); a.needsUpdate = true; }
  scatter.trees.last.set(1e9, 0, 0);
  warmShadowVariants(renderer, scene, post);
  warmHidden(renderer, scene, post);
  // Let the driver finish (a 1-pixel read waits for the GPU) so the cost lands behind the loading screen.
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return performance.now() - t0;
}

/**
 * three's shadow pass shares one depth material between casters and only re-picks its program when
 * some state (e.g. instancing) flips between consecutive draws, so which map / side variants exist
 * depends on draw order (a double-sided textured roof first seen mid-ride compiled then). Render a
 * tiny shadow pass where every distinct caster variant follows a dummy that forces the re-pick.
 */
function warmShadowVariants(renderer, scene, post) {
  const group = new THREE.Group();
  group.name = 'warmShadowVariants';
  const box = new THREE.BoxGeometry(0.1, 0.1, 0.1), basic = new THREE.MeshLambertMaterial();
  const seen = new Set(), made = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.customDepthMaterial || o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    const key = [!!m.map, !!m.alphaMap, m.side, m.shadowSide, m.alphaTest > 0, !!o.isInstancedMesh, !!m.displacementMap].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    // A dummy of the opposite instancing kind right before it forces three to pick a program for it.
    const dummy = o.isInstancedMesh ? new THREE.Mesh(box, basic) : new THREE.InstancedMesh(box, basic, 1);
    const clone = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, m, 1) : new THREE.Mesh(o.geometry, m);
    for (const x of [dummy, clone]) { x.castShadow = true; x.frustumCulled = false; group.add(x); made.push(x); }
  });
  // In the game scene itself (same lights, so the program keys match), for one frame.
  scene.add(group);
  post.composer.render(1 / 60);
  scene.remove(group);
  box.dispose();
  for (const x of made) if (x.isInstancedMesh) x.dispose();
}

/**
 * Meshes hidden at load (props shown by distance or mode later) get plain proxies (no onBeforeRender
 * hooks of their own) drawn for one frame through the post stack in the game scene, so their real
 * programs exist before they first appear.
 */
function warmHidden(renderer, scene, post) {
  const temp = new THREE.Group();
  temp.name = 'warmHidden';
  const seen = new Set();
  const visibleChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || visibleChain(o)) return;
    for (const m of [].concat(o.material || [])) {
      const key = m.uuid + (o.isInstancedMesh ? 'i' : '') + (o.isSkinnedMesh ? 's' : '');
      if (seen.has(key) || o.isSkinnedMesh) continue;
      seen.add(key);
      const proxy = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, m, 1) : o.isPoints ? new THREE.Points(o.geometry, m) : o.isLine ? new THREE.Line(o.geometry, m) : new THREE.Mesh(o.geometry, m);
      proxy.receiveShadow = o.receiveShadow; proxy.castShadow = o.castShadow; proxy.frustumCulled = false;
      temp.add(proxy);
    }
  });
  if (temp.children.length) {
    scene.add(temp);
    post.composer.render(1 / 60);
    scene.remove(temp);
  }
  for (const x of temp.children) if (x.isInstancedMesh) x.dispose();
}

const keep = [];
/**
 * Compile the other quality levels' terrain + backdrop shader variants in the background.
 * `makeVariants(q)` returns materials configured exactly as quality q would set them.
 */
export async function warmQualityVariants({ renderer, camera, scene: game, current, makeVariants }) {
  if (!renderer.compileAsync) return;
  const scene = new THREE.Scene();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('aMorph', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  for (const q of [0, 1, 2]) {
    if (q === current) continue;
    for (const mat of makeVariants(q)) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      keep.push(mat);
    }
  }
  // Compiled against the game scene's lights / fog, so the program keys match the real ones.
  try { await renderer.compileAsync(scene, camera, game); } catch (e) { console.warn('[gfx] quality variant warm-up failed', e); }
}
