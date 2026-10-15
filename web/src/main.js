// SENDIT (web) — stylized arcade snowboarding on the real Matterhorn.
// Systems: InputController (input.js), PlayerPhysics (player.js), Rider animation (rider.js),
// CameraController (camera.js), FXManager (fx.js), world art (terrain/sky/scatter/features/lifts).
// All tunables live in config.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PostStack } from './gfx/post.js';
import { PERF } from './gfx/perf.js';
import { patchShaderChunks, globals, makeNoiseTexture } from './world.js';
import { HUD } from './config.js';
import { ATMOSPHERE, col, createSnowfall } from './scene.js';
import { Terrain } from './terrain.js';
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
import { resolveMapSelection, loadMap, describeSelection } from './maps/registry.js';
import { profileStore } from './profile/store.js';
import { installRideTracker } from './profile/tracker.js';
import { services } from './services/index.js';
import { Lobby, LobbyStage, applyEquipment } from './lobby/index.js';
import { normalizeType } from './equipment/registry.js';

patchShaderChunks();
profileStore.load();

const params = new URLSearchParams(location.search);
const gearVariant = params.get('variant') || undefined;   // ?variant=<model id> (debug; the lobby will pick models later)
if (params.has('quality')) settings.quality = Number(params.get('quality'));
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(col(ATMOSPHERE.aerialColor), ATMOSPHERE.aerialDensity);
scene.background = col(ATMOSPHERE.skyZenith);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.25, 40000);
camera.position.set(0, 4000, 0);

const input = new Input(canvas);
const ui = new UI({ ride: () => startRide(), resume: () => resume(), top: () => player.resetToTop(), menu: () => toMenu() });

let course, snowfall, terrain, sky, scatter, lifts, features, player, rider, cam, fx, sound, composer, post;
let currentMap = null;          // { map, variant, course } from the map registry
let stage = null, lobby = null, stageReady = null, gearSupported = false;
installRideTracker({ getMapId: () => currentMap?.map.id ?? 'unknown' });

async function boot() {
  const loader = new GLTFLoader();
  terrain = new Terrain();
  // Which map: URL (?map=<id>, ?resort=<id>&run=<n>) → the profile's saved choice → the default.
  // Every map loads through the registry (maps/registry.js, maps/builtin.js).
  ui.loading(0.02, 'Fetching the mountain…');
  currentMap = await loadMap(resolveMapSelection(params, profileStore.profile));
  course = currentMap.course;
  await terrain.generate(course, (p) => ui.loading(p * 0.45, course.meta ? `Shaping ${course.name}…` : 'Carving the gully…'));
  globals.uWater.value = course.water ?? -1e5;
  if (params.has('at')) {
    const [x, z, h] = params.get('at').split(',').map(Number);
    terrain.meta.spawn = { position: [x, 0, z], heading: h || 0 };
  }
  ui.loading(0.45, 'Shaping jumps and pillows…');
  features = new Features(terrain);
  features.plan(course);
  ui.loading(0.5, 'Painting the snow…');
  terrain.bakeSunMask(renderer);
  terrain.buildMaterials({ noise: makeNoiseTexture(512, 11) });
  terrain.build();
  scene.add(terrain.group);
  sky = new Sky(scene);

  snowfall = createSnowfall();
  scene.add(snowfall.points);

  ui.loading(0.62, 'Planting pines…');
  scatter = new Scatter(terrain);
  await scatter.load(loader, { trees: [], rocks: [] });
  scene.add(scatter.group);
  ui.loading(0.75, 'Building the park…');
  features.build();
  scene.add(features.group);
  for (const o of features.obstaclePoints || []) scatter.addObstacle(o[0], o[1], o[2], o[3]);
  ui.loading(0.8, 'Growing the forest…');
  scatter.addEnvironment(features.path || [], course);
  console.log('[sendit] environment', JSON.stringify(scatter.envStats || {}));
  if (params.has('kicker')) {
    // Debug: start 40 m before a kicker, aimed at it.
    const k = features.kickers[Number(params.get('kicker'))] || features.kickers[0];
    const p0 = k.o.clone().addScaledVector(k.f, -40);
    terrain.meta.spawn = { position: [p0.x, 0, p0.y], heading: Math.atan2(-k.f.x, -k.f.y) };
  }
  lifts = new Lifts(terrain);
  lifts.build(course.lifts || []);   // real mountains have their real lifts; the gully has none
  scene.add(lifts.group);

  ui.loading(0.88, 'Waxing the board…');
  player = new Player(terrain, scatter, lifts, input);
  player.fade = (b, d) => ui.fade(b, d);
  // ?equip=ski|snowboard overrides the saved loadout (and is saved, so the lobby agrees); ?variant picks a model.
  if (params.has('equip')) profileStore.setEquipment(normalizeType(params.get('equip')) === 'snowboard' ? 'snowboard' : 'skis');
  player.setEquipment(profileStore.equipment, gearVariant);
  if (params.has('stance')) player.setStance(params.get('stance'));                       // ?stance=regular|goofy
  rider = new Rider(player);
  await rider.load(loader);
  scene.add(rider.root);
  applyGameEquipment(profileStore.equipment);
  const s = terrain.getSpawn();
  player.place(s.position, s.heading);
  player.state = State.FROZEN;

  // The lobby: built now unless we go straight into a ride (?ride), then on first visit.
  lobby = new Lobby({
    root: document.getElementById('lobby'),
    stage: (stage = new LobbyStage(renderer)),
    input,
    onRide: () => startRide(),
    ui: { showCredits: () => ui.showCredits() },
    sfx,
  });
  lobby.setMapInfo({ ...currentMap, description: describeSelection(currentMap.map, currentMap.variant, course) });
  ui.attach({ lobby, input });
  if (!params.has('ride')) {
    ui.loading(0.92, 'Setting up the lobby…');
    await ensureStage();
  }

  cam = new CameraController(camera, player, terrain, input);
  cam.rider = rider;
  fx = new FXManager(player, renderer, scene);
  fx.setContactSource(() => rider.getContactPoints());   // spray from the real ski / board edges (rider.js)
  sound = new SoundScape(player, terrain);

  setupPost();
  applyQuality();
  on('settings', ({ key }) => { if (key === 'quality') applyQuality(); });
  addEventListener('resize', onResize);
  onResize();
  terrain.update(terrain.getSpawn().position, Infinity);   // full detail around the start before the first frame
  renderer.compile(scene, camera);
  ui.loading(1, '');
  ui.doneLoading();
  ui.fade(false, 2.0);
  if (params.has('ride')) startRide(true);
  else { setMode(Mode.MENU); ui.refresh(); }
  window.__sendit = {
    fx, course, player, rider, terrain, camera, game, scene, renderer, features, scatter,
    lobby, stage, profile: profileStore, services, map: currentMap, ui,
  };
}

/**
 * Build the lobby stage once (scene, preview rider, shaders). Never rejects: if the stage fails,
 * the lobby UI still works over the world's menu flyover (frame() renders the world instead).
 */
function ensureStage() {
  if (!stageReady) {
    stageReady = stage.init(new GLTFLoader()).then(async () => {
      await stage.setEquipment(profileStore.equipment, { animate: false });
      stage.resize(innerWidth, innerHeight);
      stage.compile();
    }).catch((e) => {
      console.error('[lobby] stage failed to build; showing the lobby over the world instead', e);
      stage.ready = false;
    });
  }
  return stageReady;
}

/** Give the in-game rider/player the profile's equipment (optional API, see lobby/equipmentBridge.js). */
function applyGameEquipment(type) {
  gearSupported = applyEquipment({ rider, player }, type, gearVariant) === 'native' || type === 'skis';
}

// Loadout changes (lobby toggle, other tabs, profile sync) reach the preview and the game rider.
on('loadout', ({ equipment }) => {
  if (stage?.ready) {
    stage.setEquipment(equipment);
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
/** Lobby → ride. `instant` (the ?ride URL param) skips the fade and the camera intro. */
async function startRide(instant = false) {
  if (busy || game.mode !== Mode.MENU) return;
  busy = true;
  sound.init().then(() => sound.resume()).catch(() => {});
  if (!instant) {
    input.lock();                // needs the click's user gesture, so before any await
    sfx('whoosh_slow', 0.5, 1);
    await ui.fade(true, 0.35);
    cam.update(0);               // put the world camera on its menu flyover: the intro sweeps from there
  }
  applyGameEquipment(profileStore.equipment);
  resetScore();
  player.startRiding();
  setMode(Mode.RIDING);
  if (!instant) cam.startIntro(); else cam.snap();
  ui.refresh();
  emit('rideStarted', { mapId: currentMap.map.id, equipment: profileStore.equipment });
  if (!instant) ui.fade(false, 0.9);
  if (!gearSupported) setTimeout(() => emit('hint', 'Snowboards are coming soon · riding skis for now'), 1600);
  busy = false;
}

function pause() {
  if (game.mode !== Mode.RIDING && game.mode !== Mode.LIFT) return;
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
  if (course.progress(player.position.x, player.position.z) < course.finishAt) return;
  finishing = true;
  ui.pop('RUN COMPLETE!', 'gold');
  emit('runComplete');
  setTimeout(() => { player.resetToTop(); setTimeout(() => { finishing = false; }, 1500); }, 1400);
}

// ---------------------------------------------------------------- loop (fixed 60 Hz physics, interpolated render)
const STEP = 1 / 60;
let acc = 0, last = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!composer) return;
  input.poll(dt);
  if (game.mode === Mode.RIDING && input.pressed.has('KeyE') && rider) profileStore.setEquipment(profileStore.equipment === 'snowboard' ? 'skis' : 'snowboard');   // debug: swap gear while riding (via the profile, so the lobby stays in sync)
  if (input.justPressed('view') && (game.mode === Mode.RIDING || game.mode === Mode.LIFT)) {
    setSetting('view', settings.view === 'fp' ? 'tp' : 'fp');
    ui.pop(settings.view === 'fp' ? 'FIRST PERSON' : 'CHASE CAM', 'cyan', true);
  }
  rider.fp = settings.view === 'fp' && game.mode !== Mode.MENU && player.state !== State.CRASH;
  document.body.classList.toggle('fp', rider.fp && (game.mode === Mode.RIDING || game.mode === Mode.LIFT));
  if (input.justPressed('pause')) {
    if (ui.back()) { /* closed an overlay (settings / credits) */ }
    else if (game.mode === Mode.PAUSED) resume();
    else if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) pause();
  }
  // Lobby: only the stage is simulated and rendered; the world waits, frozen.
  if (game.mode === Mode.MENU && lobby?.visible && stage?.ready) {
    lobby.update(dt);
    stage.update(dt);
    sound.update(dt, camera);
    ui.update(dt, player);
    input.endFrame();
    stage.render(dt);
    return;
  }
  const paused = game.mode === Mode.PAUSED;
  if (!paused) {
    time += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) { player.step(STEP); acc -= STEP; n++; }
    if (n === 8) acc = 0;
    player.interpolate(acc / STEP);
  }
  globals.uTime.value = time;
  rider.update(paused ? 0 : dt, camera);
  cam.update(paused ? 0 : dt);
  sky.update(camera, game.mode === Mode.MENU ? camera.position.clone().add(new THREE.Vector3(0, -200, 0)) : player.renderPos, time);
  terrain.update(camera.position);
  scatter.update(camera.position);
  lifts.update(time, camera.position);
  snowfall.update(camera, time, innerHeight);
  if (!paused) fx.update(dt, camera);
  sound.update(dt, camera);
  ui.update(dt, player);
  checkFinish();
  rumbleCarve(dt);
  // Wind streaks fade in near top speed.
  const riding = game.mode === Mode.RIDING;
  const wantWind = riding ? THREE.MathUtils.smoothstep(player.speedRatio, HUD.windStreakFrom, HUD.windStreakFull) : 0;
  post.update(dt, time, wantWind);
  input.endFrame();
  composer.render(dt);
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.loading(1, `Something went wrong: ${e.message}`);
});
