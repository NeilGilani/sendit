// SENDIT (web) — stylized arcade snowboarding on the real Matterhorn.
// Systems: InputController (input.js), PlayerPhysics (player.js), Rider animation (rider.js),
// CameraController (camera.js), FXManager (fx.js), world art (terrain/sky/scatter/features/lifts).
// All tunables live in config.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PostStack, POST } from './gfx/post.js';
import { urlParams } from './flags.js';
import { autoPickQuality, watchFrameRate } from './gfx/autoquality.js';
const POST_EXPOSURE = POST.exposure;
import { PERF } from './gfx/perf.js';
import { prewarm, warmQualityVariants } from './gfx/prewarm.js';
import { rockTextureReady } from './gfx/snow.js';
import { patchShaderChunks, globals, makeNoiseTexture, applyMapAtmosphere } from './world.js';
import { HUD } from './config.js';
import { ATMOSPHERE, col, createSnowfall } from './scene.js';
import { Terrain } from './terrain.js';
import { Activities, bestFor, courseKey } from './activities.js';
import { Life } from './life.js';
import { Sky } from './sky.js';
import { Scatter } from './scatter.js';
import { Lifts } from './lifts.js';
import { Features } from './features.js';
import { Player, State } from './player.js';
import { Rider } from './rider.js';
import { CameraController } from './camera.js';
import { FXManager } from './fx.js';
import { SoundScape } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { game, Mode, setMode, on, settings, setSetting, resetScore, emit, scoreSnapshot } from './state.js';
import './maps/builtin.js';
import { resolveMapSelection, loadMap, describeSelection, lobbySpot, getTrail, defaultTrail, needsReload, selectionQuery, trailSpawnFor, trailFinishFor, trailBoardId, getMap } from './maps/registry.js';
import { writeLoadHint } from './loading/hint.js';
import { outfitSlotsFromProfile } from './character/profile.js';
import { showTrailToast, hideTrailToast } from './maps/trailhud.js';
import { profileStore } from './profile/store.js';
import { installRideTracker } from './profile/tracker.js';
import { services } from './services/index.js';
import { Lobby, LobbyStage, applyEquipment } from './lobby/index.js';
import { normalizeType } from './equipment/registry.js';
import { installJuice } from './juice/index.js';
import { installThrill } from './thrill/index.js';
import { installRagdoll } from './character/ragdoll/index.js';
import { FP_POLE } from './fpview.js';
import { trackProgression } from './progression/index.js';
import { mountProgressionUi } from './progression/ui.js';
import './progression/lobby.js';

patchShaderChunks();
profileStore.load();

const params = urlParams();   // dev / debug flags only in dev builds (flags.js, docs/launch.md)
const gearVariant = params.get('variant') || undefined;   // ?variant=<model id> (debug: overrides the equipped catalog item's model)
if (params.has('quality')) settings.quality = Math.max(0, Math.min(2, Math.round(Number(params.get('quality'))) || 0));   // ?quality=0|1|2
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
autoPickQuality(renderer, params);   // weak / software GPUs start on Low unless the player chose (gfx/autoquality.js)

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(col(ATMOSPHERE.aerialColor), ATMOSPHERE.aerialDensity);
scene.background = col(ATMOSPHERE.skyZenith);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.25, 40000);
camera.position.set(0, 4000, 0);

const input = new Input(canvas);
const ui = new UI({
  ride: () => startRide(false, 'zen'),
  challenge: () => startRide(false, 'challenge'),
  retry: () => startRide(true, 'challenge'),
  zen: () => startRide(true, 'zen'),
  restart: () => { resume(); startRide(true, activities?.mode || 'zen'); },
  resume: () => resume(), top: () => player.resetToTop(), menu: () => toMenu(),
});

let activities, life;
let course, snowfall, terrain, sky, scatter, lifts, features, player, rider, cam, fx, sound, composer, post;
let ragdoll = null;             // crash ragdoll controller (character/ragdoll/)
let currentMap = null;          // { map, variant, trail, course } from the map registry
let defaultSpawn = null;        // the course's own spawn (terrain.meta.spawn before any trail moved it)
let pinnedSpawn = false;        // ?at / ?kicker debug starts win over trails
let stage = null, lobby = null, stageReady = null;
installRideTracker({
  getMapId: () => currentMap?.map.id ?? 'unknown',
  getTrailBoard: () => (currentMap ? trailBoardId(currentMap.map.id, currentMap.trail) : null),   // per-trail board (docs/maps.md)
});

async function boot() {
  const loader = new GLTFLoader();
  terrain = new Terrain();
  // Which map: URL (?map=<id>, ?resort=<id>&run=<n>) → the profile's saved choice → the default.
  // Every map loads through the registry (maps/registry.js, maps/builtin.js).
  ui.loading(0.02, 'Fetching the mountain…');
  currentMap = await loadMap(resolveMapSelection(params, profileStore.profile));
  course = currentMap.course;
  // Per-map sky / sun / haze / exposure (course.atmosphere, docs/graphics.md); defaults otherwise.
  // ?atmo={"sunElevation":8,...} (JSON) previews / overrides fields while building a map's look.
  let atmo = course.atmosphere;
  try { if (params.has('atmo')) atmo = { ...atmo, ...JSON.parse(params.get('atmo')) }; } catch (e) { console.warn('[gfx] bad ?atmo JSON', e); }
  POST.exposure = applyMapAtmosphere(atmo, { defaultExposure: POST_EXPOSURE }).exposure;
  scene.fog.color.set(ATMOSPHERE.aerialColor);
  scene.fog.density = ATMOSPHERE.aerialDensity;
  await terrain.generate(course, (p) => ui.loading(p * 0.45, course.meta ? `Shaping ${course.name}…` : 'Carving the gully…'));
  globals.uWater.value = course.water ?? -1e5;
  defaultSpawn = { position: [...terrain.meta.spawn.position], heading: terrain.meta.spawn.heading };
  pinnedSpawn = params.has('at') || params.has('kicker');
  if (params.has('at')) {
    const [x, z, h] = params.get('at').split(',').map(Number);
    terrain.meta.spawn = { position: [x, 0, z], heading: h || 0 };
  }
  ui.loading(0.45, 'Shaping jumps and pillows…');
  features = new Features(terrain);
  features.plan(course);
  ui.loading(0.5, 'Painting the snow…');
  await terrain.bakeSunMaskSliced(renderer);   // in strips: the loading worker shares the GPU
  const noise = makeNoiseTexture(512, 11);
  terrain.buildMaterials({ noise });
  terrain.build();
  scene.add(terrain.group);
  sky = new Sky(scene);

  snowfall = createSnowfall();
  scene.add(snowfall.points);

  ui.loading(0.62, 'Planting pines…');
  scatter = new Scatter(terrain);
  await scatter.load(loader, { trees: [], rocks: [] });
  // Far trees are baked pictures of the near trees (gfx/trees.js): bake them now, before any frame.
  // (yields every ~12 ms and reports progress, so the live loading scene stays smooth).
  const impMs = await scatter.trees.bakeImpostorsAsync(renderer, (p) => ui.loading(0.62 + 0.1 * p, 'Planting pines…'));
  console.log('[gfx] tree impostors', impMs.toFixed(0), 'ms');
  scene.add(scatter.group);
  ui.loading(0.75, 'Building the park…');
  features.build();
  scene.add(features.group);
  for (const o of features.obstaclePoints || []) scatter.addObstacle(o[0], o[1], o[2], o[3]);
  if (params.has('kicker')) {
    // Debug: start 40 m before a kicker, aimed at it.
    const k = features.kickers[Number(params.get('kicker'))] || features.kickers[0];
    const p0 = k.o.clone().addScaledVector(k.f, -40);
    terrain.meta.spawn = { position: [p0.x, 0, p0.y], heading: Math.atan2(-k.f.x, -k.f.y) };
  }
  applyTrailSpawn(currentMap.trail);   // the selected trail's top becomes the spawn (docs/maps.md)
  lifts = new Lifts(terrain);
  lifts.build(course.lifts || []);   // real mountains have their real lifts; the gully has none
  scene.add(lifts.group);
  // Living mountain (skiers, chair passengers, lodge, birds) — before the forest so the lodge's clearing stays clear.
  life = new Life({ scene, terrain, features, lifts, course, fx: null });
  for (const o of life.terrainObstacles || []) scatter.addObstacle(o[0], o[1], o[2], o[3]);
  scatter.clearings = life.clearings || [];
  ui.loading(0.8, 'Growing the forest…');
  scatter.addEnvironment(features.path || [], course);
  console.log('[sendit] environment', JSON.stringify(scatter.envStats || {}));

  ui.loading(0.88, 'Waxing the board…');
  player = new Player(terrain, scatter, lifts, input);
  player.fade = (b, d) => ui.fade(b, d);
  // ?equip=ski|snowboard overrides the saved loadout (and is saved, so the lobby agrees); ?variant picks a model.
  if (params.has('equip')) profileStore.setEquipment(normalizeType(params.get('equip')) === 'snowboard' ? 'snowboard' : 'skis');
  player.setEquipment(profileStore.equipment, gearVariant ?? profileStore.gearModel());
  if (params.has('stance')) player.setStance(params.get('stance'));                       // ?stance=regular|goofy
  rider = new Rider(player);
  // Crash ragdoll (docs/body.md): only ever active in State.CRASH; ?ragdoll=0 keeps the old slide-and-roll crash.
  if (params.get('ragdoll') !== '0') ragdoll = installRagdoll({ player, rider, scatter, course, fpPoleLength: FP_POLE.length });
  await rider.load(loader);
  scene.add(rider.root);
  applyGameEquipment(profileStore.equipment);
  const s = terrain.getSpawn();
  player.place(s.position, s.heading);
  player.state = State.FROZEN;

  // The lobby: the rider on a plinth at the map's lobby spot (the start, looking down the run), in
  // the world itself. Built now unless we go straight into a ride (?ride), then on first visit.
  stage = new LobbyStage({ scene, camera, terrain, noise });
  stage.setSpot(lobbySpot(currentMap.map, course, terrain));
  lobby = new Lobby({
    root: document.getElementById('lobby'),
    stage,
    input,
    onRide: (mode) => startRide(false, mode),
    onTrail: (mapId, trailId, opts) => selectTrail(mapId, trailId, opts),
    ui: { showCredits: () => ui.showCredits() },
    sfx,
  });
  updateLobbyMapInfo();
  ui.attach({ lobby, input });
  if (!params.has('ride')) {
    ui.loading(0.92, 'Setting up the lobby…');
    await ensureStage();
  }

  cam = new CameraController(camera, player, terrain, input);
  cam.rider = rider;
  fx = new FXManager(player, renderer, scene);
  life.fx = fx;
  activities = new Activities({ scene, course, features, terrain, player, fx });
  fx.setContactSource(() => rider.getContactPoints());   // spray from the real ski / board edges (rider.js)
  sound = new SoundScape(player, terrain);

  setupPost();
  juice = installJuice({ player, cam, sound, input, post, camera, fx, activities, scene });
  progressUpdate = trackProgression({ player, getMapId: () => currentMap?.map.id ?? 'unknown' });
  mountProgressionUi({ juice });
  // Thrill (thrill/index.js): instant restart / retry, spots & gaps, adrenaline cues, instant replay, versus links.
  thrill = installThrill({
    player, rider, cam, camera, sound, input, activities, ui, juice, scene, course, features, terrain, canvas, params,
    getMap: () => ({ mapId: currentMap?.map.id ?? 'unknown', trailId: currentMap?.trail ?? null }),
    getName: () => profileStore.profile?.displayName || 'Rider',
  });
  applyQuality();
  on('settings', ({ key }) => { if (key === 'quality') applyQuality(); });
  addEventListener('resize', onResize);
  onResize();
  terrain.update(terrain.getSpawn().position, Infinity);   // full detail around the start before the first frame
  globalThis.__loading?.mark?.('compileForPost');
  await compileForPost();
  // Warm-up behind the loading screen (gfx/prewarm.js): textures, every shader variant, LOD around start + lobby.
  await rockTextureReady();
  const ls = lobbySpot(currentMap.map, course, terrain);
  console.log('[gfx] prewarm', (await prewarm({ renderer, scene, camera, post, scatter, terrain, fx, spots: [terrain.getSpawn().position, new THREE.Vector3(ls.x, 0, ls.z)] })).toFixed(0), 'ms');
  warming = false;
  setTimeout(() => warmQualityVariants({ renderer, camera, scene, current: settings.quality, makeVariants: (q) => terrain.qualityMaterials(q) }), 1500);
  ui.loading(1, '');
  await ui.holdLoading();   // a slow device's live loading trick gets its moment before the hand-off
  ui.doneLoading();
  saveLoadHint();
  ui.fade(false, 2.0);
  if (params.has('ride') || params.has('challenge')) startRide(true, params.has('challenge') ? 'challenge' : 'zen');
  else { setMode(Mode.MENU); ui.refresh(); }
  watchFrameRate(params);   // still too slow in the lobby → one step lower (gfx/autoquality.js)
  window.__sendit = {
    activities, life,
    fx, course, player, rider, terrain, camera, game, scene, renderer, features, scatter,
    lobby, stage, profile: profileStore, services, map: currentMap, ui, selectTrail, ragdoll,
  };
}

// ---------------------------------------------------------------- trails (docs/maps.md)
/** Make trail `trailId`'s top the spawn (start, reset-to-top, respawn fallback). */
function applyTrailSpawn(trailId) {
  if (pinnedSpawn || !defaultSpawn) return;
  const fb = { position: { x: defaultSpawn.position[0], z: defaultSpawn.position[2] }, heading: defaultSpawn.heading };
  const s = trailSpawnFor(course, trailId, fb, getTrail(currentMap.map, trailId));
  terrain.meta.spawn = s.fallback ? { position: [...defaultSpawn.position], heading: defaultSpawn.heading } : { position: [s.x, 0, s.z], heading: s.heading };
}

function updateLobbyMapInfo() {
  const { map, variant, trail } = currentMap;
  lobby?.setMapInfo({
    ...currentMap, trail: getTrail(map, trail) ?? defaultTrail(map), description: describeSelection(map, variant, course),
    // The Maps tab's piste map: the course's own height function (valid beyond the terrain tile) if it has one.
    starts: trailStarts(), heightAt: typeof course.height === 'function' ? (x, z) => course.height(x, z) : (x, z) => terrain.getHeight(x, z),
  });
}

/** Where each of the loaded map's trails starts (trails on another variant are skipped): [{ id, x, z, difficulty }]. */
function trailStarts() {
  if (!defaultSpawn) return [];
  const fb = { position: { x: defaultSpawn.position[0], z: defaultSpawn.position[2] }, heading: defaultSpawn.heading };
  return currentMap.map.trails
    .filter((t) => !needsReload(currentMap, currentMap.map.id, t.id))
    .map((t) => ({ id: t.id, difficulty: t.difficulty, ...trailSpawnFor(course, t.id, fb, t) }));
}

/**
 * The lobby picked a trail. Same map (and variant): switch in place, no reload. Otherwise save the
 * choice and reload into ?map=&trail=. Resolves true when switched in place. `ride: true` rides it.
 */
async function selectTrail(mapId, trailId, { ride = false, mode } = {}) {
  const t = getTrail(mapId, trailId);
  if (!t) return false;
  if (needsReload(currentMap, mapId, trailId)) {
    profileStore.setMap(mapId, t.variant ?? null, t.id);
    saveLoadHint(mapId, t, true);   // the next load's loading screen: the player's rider on this mountain
    const q = selectionQuery(mapId, t.id, location.search);
    if (ride) q.set('ride', '');
    location.search = q.toString();
    return false;
  }
  currentMap.trail = t.id;
  profileStore.setMap(mapId, currentMap.variant ?? null, t.id);
  history.replaceState(null, '', `${location.pathname}?${selectionQuery(mapId, t.id, location.search)}${location.hash}`);
  applyTrailSpawn(t.id);
  const s = terrain.getSpawn();
  if (game.mode === Mode.MENU) player.place(s.position, s.heading);
  updateLobbyMapInfo();
  emit('trailSelected', { mapId, trailId: t.id });
  if (ride) startRide(false, mode ?? lobby?.mode ?? 'zen');
  return true;
}

/**
 * Tell the next page load's loading screen (loading/hint.js) who rides and where: the player's outfit
 * and gear, and (on a lobby → mountain reload) the mountain and trail being loaded.
 */
function saveLoadHint(mapId = currentMap?.map.id, trail = null, transition = false) {
  try {
    const map = getMap(mapId);
    const m = map?.mountain || {};
    trail = trail || (currentMap ? getTrail(currentMap.map, currentMap.trail) : null);
    writeLoadHint({
      transition, mapId, mountain: m.name || map?.name, region: m.region, accent: m.accent,
      trail: trail?.name, difficulty: trail?.difficulty,
      gear: profileStore.equipment, gearModel: profileStore.gearModel(), outfit: outfitSlotsFromProfile(),
      rider: profileStore.profile.displayName || null,
    });
  } catch (e) { console.warn('[loading] hint not saved', e); }
}

/**
 * Compile the programs the game will actually draw with: it renders into the post stack's HDR target
 * (linear output, another program variant than the canvas), so compile with that target bound. The
 * frame loop holds off meanwhile (`warming`): a frame would link the same programs synchronously.
 */
async function compileForPost() {
  warming = true;
  const rt = composer?.inputBuffer;
  if (!rt || !renderer.compileAsync) { renderer.compile(scene, camera); return; }
  // One top-level group at a time with a yield between: ANGLE translates each shader on the GPU thread
  // before the parallel part, and ~100 programs in one go held it ~0.9 s (a hitch in the loading shot).
  for (const child of [...scene.children]) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    let p;
    try { p = renderer.compileAsync(child, camera, scene); } catch (e) { console.warn('[gfx] compileAsync failed', e); } finally { renderer.setRenderTarget(prev); }
    try { await p; } catch { /* the first frames compile what's left */ }
    await new Promise((res) => setTimeout(res, 0));
  }
}

/**
 * Build the lobby stage once (plinth, preview rider, shaders). Never rejects: if the stage fails,
 * the lobby UI still works over the world's menu flyover (the camera controller drives the view).
 */
function ensureStage() {
  if (!stageReady) {
    stageReady = stage.init(new GLTFLoader()).then(async () => {
      await stage.setEquipment(profileStore.equipment, { animate: false, variant: profileStore.gearModel() });
      stage.resize(innerWidth, innerHeight);
      // During the boot the post stack doesn't exist yet and compileForPost() covers the stage with the
      // rest of the scene (a canvas-variant compile here was wasted work: 0.9 s of GPU-thread time).
      // A later first lobby visit (after ?ride) compiles the stage's real variants here.
      if (composer) { const was = warming; await compileForPost(); warming = was; }
    }).catch((e) => {
      console.error('[lobby] stage failed to build; showing the lobby over the world instead', e);
      stage.ready = false;
    });
  }
  return stageReady;
}

/**
 * Give the in-game rider/player the profile's equipment (optional API, see lobby/equipmentBridge.js):
 * the equipped catalog item's model (profileStore.gearModel), unless ?variant= overrides it.
 */
function applyGameEquipment(type) {
  applyEquipment({ rider, player }, type, gearVariant ?? profileStore.gearModel(type));
}

// Loadout changes (lobby toggle, other tabs, profile sync) reach the preview and the game rider.
on('loadout', ({ equipment }) => {
  if (currentMap) saveLoadHint();
  if (stage?.ready) {
    stage.setEquipment(equipment, { variant: profileStore.gearModel(equipment) });
    sfx('jump_pop', 0.3, 1.15);
    setTimeout(() => sfx('land_soft', 0.4, 1.1), 650);
  }
  if (rider) applyGameEquipment(equipment);
});

/** One-shot UI sound once audio is unlocked (silently ignored before). */
function sfx(name, gain = 0.4, rate = 1) { if (sound?.ctx) sound.oneShot(name, gain, rate).catch(() => {}); }

// Lobby music/ambience: audio may only start after a user gesture.
const unlockAudio = () => {
  if (!sound) return;
  sound.init().then(() => sound.resume()).catch(() => {});
  removeEventListener('pointerdown', unlockAudio);
  removeEventListener('keydown', unlockAudio);
};
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

function setupPost() {
  post = new PostStack(renderer, scene, camera);
  composer = post.composer;
}

function applyQuality() {
  const q = settings.quality;
  const pr = PERF.pixelRatio[q], sh = PERF.shadow[q];   // perf tiers: gfx/perf.js
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pr.cap) * pr.scale);
  sky.setShadowBox(sh.box, sh.map);
  post.setQuality(q);
  terrain.setQuality(q);
  scatter.setQuality(q);
  onResize();
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  globals.uResolution.value.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer?.setSize(w, h);
  stage?.resize(w, h);
  lobby?.layout();
}

// ---------------------------------------------------------------- flow
let busy = false;
/** Lobby → ride (or a restart from the pause / results screen). `instant` skips the fade and the camera intro. */
async function startRide(instant = false, mode = 'zen') {
  if (busy) return;
  if (game.mode !== Mode.MENU) emit('rideEnded', scoreSnapshot());   // restarting mid-ride still records the ride
  busy = true;
  sound.init().then(() => sound.resume()).catch(() => {});
  if (!instant) {
    input.lock();                // needs the click's user gesture, so before any await
    sfx('whoosh_slow', 0.5, 1);
    await ui.fade(true, 0.35);
    if (!stage?.active) cam.update(0);   // no lobby stage: start from the menu flyover. Else the intro sweeps on from the lobby camera.
  }
  applyGameEquipment(profileStore.equipment);
  resetScore();
  applyTrailSpawn(currentMap.trail);
  if (!instant) terrain.update(terrain.getSpawn().position, 24);   // a head start on the trail top's detail
  player.startRiding();
  setMode(Mode.RIDING);
  if (!instant) { aerialAboveTrail(); cam.startIntro(); } else cam.snap();
  ui.refresh();
  activities.start(mode);
  finishing = false;
  emit('rideStarted', { mapId: currentMap.map.id, trailId: currentMap.trail, equipment: profileStore.equipment });
  if (!instant) ui.fade(false, 0.9);
  const trail = getTrail(currentMap.map, currentMap.trail);
  if (trail) setTimeout(() => { if (game.mode === Mode.RIDING) showTrailToast(currentMap.map, trail, { best: bestFor(courseKey(course)) }); }, instant ? 150 : 650);
  busy = false;
}

/**
 * Drop-in for a trail far from where the camera is (the lobby): cut, under the fade, to a high shot
 * behind and above the trail's top, so the intro sweeps down onto it instead of flying through the
 * mountain. Near the camera the usual sweep from the lobby stays.
 */
const AERIAL = { far: 160, back: 70, up: 42 };
function aerialAboveTrail() {
  const s = terrain.getSpawn();
  if (Math.hypot(camera.position.x - s.position.x, camera.position.z - s.position.z) < AERIAL.far) return;
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  const x = s.position.x - fx * AERIAL.back, z = s.position.z - fz * AERIAL.back;
  camera.position.set(x, Math.max(terrain.getHeight(x, z), s.position.y) + AERIAL.up, z);
  camera.lookAt(s.position.x + fx * 30, s.position.y, s.position.z + fz * 30);
  camera.updateMatrixWorld();
}

function pause() {
  if (game.mode !== Mode.RIDING && game.mode !== Mode.LIFT) return;
  if (activities?.state === 'finished') return;   // results screen is up
  pause.resumeMode = game.mode;
  setMode(Mode.PAUSED);
  input.unlock();
  ui.refresh();
}

function resume() {
  if (game.mode !== Mode.PAUSED) return;
  setMode(pause.resumeMode ?? Mode.RIDING);
  input.lock();
  ui.refresh();
}

/** Ride (paused) → lobby. Records the ride (profile stats + leaderboard via profile/tracker.js). */
async function toMenu() {
  if (busy || game.mode === Mode.MENU) return;
  busy = true;
  input.unlock();
  emit('rideEnded', scoreSnapshot());
  hideTrailToast();
  await Promise.all([ui.fade(true, 0.5), ensureStage()]);
  player.state = State.FROZEN;
  setMode(Mode.MENU);
  ui.refresh();
  ui.fade(false, 0.8);
  busy = false;
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (game.mode === Mode.RIDING || game.mode === Mode.LIFT) && !busy) pause();
});
canvas.addEventListener('click', () => { if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) input.lock(); });

/** Controller rumble: landings, crashes, close shaves, pops, hard stops and a light buzz while carving. */
on('landed', ({ impact }) => input.rumble(Math.min(1, impact / 14), 0.45, 90 + impact * 8));
on('crashed', () => input.rumble(1, 0.8, 380));
on('nearMiss', () => input.rumble(0, 0.55, 70));
on('jumped', () => input.rumble(0.15, 0.3, 60));
on('hardBrake', () => input.rumble(0.3, 0.6, 200));
let rumbleT = 0;

// Game feel (juice/index.js: hit-stop, announcer, punches…) and progression (progression/index.js), set up in boot().
let juice = null, progressUpdate = null, thrill = null;
function rumbleCarve(dt) {
  rumbleT -= dt;
  if (rumbleT > 0 || game.mode !== Mode.RIDING || player.state !== State.GROUNDED) return;
  const carve = Math.abs(player.turnInput) * player.speedRatio;
  if (carve > 0.35) { input.rumble(0, 0.12 + carve * 0.18, 120); rumbleT = 0.11; }
}

/** Crossing the finish: celebrate, then fade back to the top for another lap. */
let finishing = false;
function checkFinish() {
  if (finishing || game.mode !== Mode.RIDING || player.state === State.FROZEN) return;
  const tf = trailFinishFor(course, currentMap.trail);
  if (tf?.radius) { if (Math.hypot(player.position.x - tf.x, player.position.z - tf.z) > tf.radius) return; }
  else if (course.progress(player.position.x, player.position.z) < (tf?.progress ?? course.finishAt)) return;
  finishing = true;
  if (activities.mode === 'challenge') {
    const res = activities.finish();
    player.state = State.FROZEN;
    input.unlock();
    ui.pop('FINISH!', 'gold');
    setTimeout(() => ui.showResults(res), 900);
    return;
  }
  ui.pop('RUN COMPLETE!', 'gold');
  emit('runComplete');
  setTimeout(() => { player.resetToTop(); setTimeout(() => { finishing = false; }, 1500); }, 1400);
}

// ---------------------------------------------------------------- loop (fixed 60 Hz physics, interpolated render)
const STEP = 1 / 60;
let acc = 0, last = performance.now(), time = 0;
let warming = false;   // compileForPost(): no frames while the programs compile in parallel
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!composer || warming) return;
  input.poll(dt);
  const replaying = !!thrill?.input();   // instant replay (thrill/replay.js): the ride is frozen while it plays
  if (!replaying && game.mode === Mode.RIDING && input.pressed.has('KeyE') && rider) profileStore.setEquipment(profileStore.equipment === 'snowboard' ? 'skis' : 'snowboard');   // debug: swap gear while riding (via the profile, so the lobby stays in sync)
  if (!replaying && input.justPressed('view') && (game.mode === Mode.RIDING || game.mode === Mode.LIFT)) {
    setSetting('view', settings.view === 'fp' ? 'tp' : 'fp');
    ui.pop(settings.view === 'fp' ? 'FIRST PERSON' : 'CHASE CAM', 'cyan', true);
  }
  rider.fp = settings.view === 'fp' && game.mode !== Mode.MENU && player.state !== State.CRASH;
  document.body.classList.toggle('fp', rider.fp && (game.mode === Mode.RIDING || game.mode === Mode.LIFT));
  if (!replaying && input.justPressed('pause')) {
    if (ui.back()) { /* closed an overlay (settings / credits) */ }
    else if (game.mode === Mode.PAUSED) resume();
    else if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) pause();
  }
  // Lobby: the stage (plinth + preview rider) stands in the world and drives the camera; the game
  // rider is hidden and frozen at the start.
  const inLobby = game.mode === Mode.MENU && !!lobby?.visible && !!stage?.ready;
  if (stage?.ready && inLobby !== stage.active) { if (inLobby) stage.activate(); else stage.deactivate(); }
  rider.root.visible = !inLobby;
  if (inLobby) { lobby.update(dt); stage.update(dt); }
  const paused = game.mode === Mode.PAUSED;
  if (!paused && !replaying) {
    time += dt;
    acc += dt * (juice ? juice.timeScale(dt) : 1);   // hit-stop / micro slow-mo on big moments (juice/impact.js)
    let n = 0;
    while (acc >= STEP && n < 8) { player.step(STEP); acc -= STEP; n++; }
    if (n === 8) acc = 0;
    player.interpolate(acc / STEP);
  }
  globals.uTime.value = time;
  if (replaying) thrill.replay.update(dt);   // poses the rig from the recording and flies the drone camera
  else {
    rider.update(paused ? 0 : dt, camera);
    if (!paused && !inLobby) ragdoll?.track();   // (reads the posed rig: the crash's momentum)
    if (!inLobby) cam.update(paused ? 0 : dt);
  }
  sky.update(camera, inLobby ? stage.focusPoint : game.mode === Mode.MENU ? camera.position.clone().add(new THREE.Vector3(0, -200, 0)) : player.renderPos, time);
  terrain.update(camera.position);
  scatter.update(camera.position);
  lifts.update(time, camera.position);
  life.setStage(inLobby ? stage.spot : null);   // background skiers swing wide of the lobby plinth
  life.update(paused ? 0 : dt, time, player, camera.position);
  snowfall.update(camera, time, innerHeight);
  if (!paused && !replaying) { fx.update(dt, camera); activities.update(dt * (juice?.warp.k ?? 1)); }
  ui.updateActivity(activities.hud());
  if (!replaying) {
    sound.update(dt, camera);
    ui.update(dt, player);
    checkFinish();
  }
  rumbleCarve(dt);
  // Wind streaks fade in near top speed.
  const riding = game.mode === Mode.RIDING;
  // In the helmet cam the corner streaks start a little earlier and stay fainter (wind past the goggles).
  const fpWind = rider.fp ? HUD.fpWindEarly : 0;
  const wantWind = riding && !replaying ? THREE.MathUtils.smoothstep(player.speedRatio, HUD.windStreakFrom - fpWind, HUD.windStreakFull) * (rider.fp ? 0.8 : 1) : 0;
  post.update(dt, time, wantWind);
  post.setLens(!replaying && rider.fp && cam.fpView?.active && (game.mode === Mode.RIDING || game.mode === Mode.LIFT || game.mode === Mode.PAUSED) ? cam.fpView.lens : null);   // goggle lens (fpview.js)
  juice?.update(paused || replaying ? 0 : dt, time);
  if (!replaying) progressUpdate?.(dt);
  if (!paused && !replaying) thrill?.update(dt);
  input.endFrame();
  composer.render(dt);
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.loading(1, `Something went wrong: ${e.message}`);
  window.__senditBootFail?.('error', e);   // index.html: friendly screen with Reload / low graphics
});

// GPU context lost (driver reset, out of GPU memory, laptop wake): three.js tries to restore it; if it
// hasn't come back after a few seconds, offer a reload instead of a frozen black canvas.
let lostTimer = 0;
canvas.addEventListener('webglcontextlost', () => {
  console.warn('[gfx] WebGL context lost');
  clearTimeout(lostTimer);
  lostTimer = setTimeout(() => window.__senditBootFail?.('lost'), 4000);
});
canvas.addEventListener('webglcontextrestored', () => { clearTimeout(lostTimer); console.info('[gfx] WebGL context restored'); });
