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

/**
 * Link the programs `scene` needs for the post stack's HDR target in parallel (KHR_parallel_shader_compile)
 * before a warm frame draws them: a synchronous link in a draw holds Chrome's GPU thread, which the
 * loading screen's worker shares (its hero shot froze for 2–4 s at the end of a map load).
 */
async function compileForTarget(renderer, scene, camera, post) {
  const rt = post?.composer?.inputBuffer;
  if (!renderer.compileAsync || !rt) return;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  let p;
  try { p = renderer.compileAsync(scene, camera); } finally { renderer.setRenderTarget(prev); }
  try { await p; } catch { /* the warm frames compile whatever is left */ }
}

/**
 * Draw the scene's materials a few at a time, one frame per batch with a yield in between, so the
 * driver-side work of first draws (ANGLE Metal builds pipeline states on the GPU thread at the first
 * draw, even after a parallel link) comes in slices: the loading screen's worker gets the GPU thread
 * between them instead of freezing through one multi-second block.
 */
async function warmInBatches(scene, post, batches = 10) {
  const groups = new Map();
  const visibleChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !visibleChain(o)) return;
    const m = [].concat(o.material || [])[0];
    const key = (m?.uuid || 'none') + (o.isInstancedMesh ? 'i' : '') + (o.isSkinnedMesh ? 's' : '') + (o.isPoints ? 'p' : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  const list = [...groups.values()];
  if (list.length < 2) return;
  const all = list.flat();
  const n = Math.min(batches, list.length);
  for (let b = 0; b < n; b++) {
    for (const o of all) o.visible = false;
    for (let g = b; g < list.length; g += n) for (const o of list[g]) o.visible = true;
    post.composer.render(1 / 60);
    await new Promise((res) => setTimeout(res, 20));
  }
  for (const o of all) o.visible = true;
}

/** Every texture referenced by a material (maps and texture uniforms). */
function materialTextures(m, out) {
  for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap', 'aoMap', 'roughnessMap', 'metalnessMap']) if (m[k]?.isTexture) out.add(m[k]);
  for (const u of Object.values(m.uniforms || m.userData?.uniforms || {})) if (u?.value?.isTexture) out.add(u.value);
}

const mark = (n) => globalThis.__loading?.mark?.(n);   // loading screen timeline (stall hunting)

export async function prewarm({ renderer, scene, camera, post, scatter, terrain, fx, spots = [] }) {
  const t0 = performance.now();
  mark('prewarm:start');
  // 1. Geometry around the places the player first sees: terrain LOD (all chunks, no budget) and tree pools.
  for (const p of spots) terrain.update(p, Infinity);
  if (spots[0]) { scatter.trees.last.set(1e9, 0, 0); scatter.update(spots[0]); }
  // 2. Textures: upload now (initTexture), not on first draw.
  const texs = new Set();
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) materialTextures(m, texs); });
  for (const m of Object.values(scatter.trees.mats)) materialTextures(m, texs);
  for (const m of [terrain.material, terrain.farMaterial]) if (m) materialTextures(m, texs);
  for (const t of texs) if (t.image || t.isRenderTargetTexture || t.isDataTexture) { try { renderer.initTexture(t); } catch { /* not uploadable yet */ } }
  mark('prewarm:textures');
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
  mark('prewarm:compile');
  await compileForTarget(renderer, scene, camera, post);
  mark('prewarm:batches');
  await warmInBatches(scene, post);
  mark('prewarm:frames');
  renderer.compile(scene, camera);
  for (let i = 0; i < 2; i++) { post.composer.render(1 / 60); await new Promise((res) => setTimeout(res, 20)); }
  mark('prewarm:shadowVariants');
  if (wind) wind.enabled = windOn;
  for (const r of restore) r();
  if (sp) { for (let i = 0; i < sp.cap; i++) sp.life[i] = 0; sp.update(0.001); }
  for (const pool of scatter.trees.pools || []) { const a = pool.im.instanceMatrix; a.clearUpdateRanges(); a.needsUpdate = true; }
  scatter.trees.last.set(1e9, 0, 0);
  await warmShadowVariants(renderer, scene, post, camera);
  mark('prewarm:hidden');
  await warmHidden(renderer, scene, post, camera);
  mark('prewarm:readPixels');
  // Let the driver finish (a 1-pixel read waits for the GPU) so the cost lands behind the loading screen.
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  mark('prewarm:done');
  return performance.now() - t0;
}

/**
 * three's shadow pass shares one depth material between casters and only re-picks its program when
 * some state (e.g. instancing) flips between consecutive draws, so which map / side variants exist
 * depends on draw order (a double-sided textured roof first seen mid-ride compiled then). Render a
 * tiny shadow pass where every distinct caster variant follows a dummy that forces the re-pick.
 */
async function warmShadowVariants(renderer, scene, post, camera) {
  const group = new THREE.Group();
  group.name = 'warmShadowVariants';
  const box = new THREE.BoxGeometry(0.1, 0.1, 0.1), basic = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, fog: false });   // cheap, unlit, invisible
  const seen = new Set(), made = [], proxies = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.customDepthMaterial || o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    const key = [!!m.map, !!m.alphaMap, m.side, m.shadowSide, m.alphaTest > 0, !!o.isInstancedMesh, !!m.displacementMap].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    // A dummy of the opposite instancing kind right before it forces three to pick a program for it.
    const dummy = o.isInstancedMesh ? new THREE.Mesh(box, basic) : new THREE.InstancedMesh(box, basic, 1);
    // The clone carries a stand-in material with exactly the fields three's shadow pass derives the depth
    // program from (maps with alpha test, sides, displacement), invisible in the main pass. With the real
    // material, a bare clone of e.g. the terrain (without the chunk's own setup) compiled a whole new
    // terrain program synchronously in the main pass: a 2 s freeze at the end of every load.
    const proxy = new THREE.MeshBasicMaterial({ map: m.map || null, alphaMap: m.alphaMap || null, alphaTest: m.alphaTest || 0, side: m.side, colorWrite: false, depthWrite: false, fog: false });
    proxy.shadowSide = m.shadowSide;
    if (m.displacementMap) { proxy.displacementMap = m.displacementMap; proxy.displacementScale = m.displacementScale; proxy.displacementBias = m.displacementBias; }
    proxies.push(proxy);
    const clone = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, proxy, 1) : new THREE.Mesh(o.geometry, proxy);
    for (const x of [dummy, clone]) { x.castShadow = true; x.frustumCulled = false; group.add(x); made.push(x); }
  });
  // In the game scene itself (same lights, so the program keys match), a few pairs per frame with a
  // yield in between (each first draw builds pipeline states on the GPU thread the loading worker shares).
  scene.add(group);
  await compileForTarget(renderer, scene, camera, post);   // the stand-ins' main-pass programs, in parallel
  const kids = [...group.children];
  const PER = 8;   // four dummy + clone pairs per frame (their depth programs still link synchronously)
  for (let i = 0; i < kids.length; i += PER) {
    for (let k = 0; k < kids.length; k++) kids[k].visible = k >= i && k < i + PER;
    post.composer.render(1 / 60);
    if (i + PER < kids.length) await new Promise((res) => setTimeout(res, 20));
  }
  scene.remove(group);
  for (const p of proxies) p.dispose();
  box.dispose();
  for (const x of made) if (x.isInstancedMesh) x.dispose();
}

/**
 * Meshes hidden at load (props shown by distance or mode later) get plain proxies (no onBeforeRender
 * hooks of their own) drawn for one frame through the post stack in the game scene, so their real
 * programs exist before they first appear.
 */
async function warmHidden(renderer, scene, post, camera) {
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
    if (camera) await compileForTarget(renderer, scene, camera, post);
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
