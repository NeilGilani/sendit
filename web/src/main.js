// SENDIT (web) — stylized arcade snowboarding on the real Matterhorn.
// Systems: InputController (input.js), PlayerPhysics (player.js), Rider animation (rider.js),
// CameraController (camera.js), FXManager (fx.js), world art (terrain/sky/scatter/features/lifts).
// All tunables live in config.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PostStack } from './gfx/post.js';
import { patchShaderChunks, globals, makeNoiseTexture } from './world.js';
import { HUD } from './config.js';
import { ATMOSPHERE, col, createSnowfall } from './scene.js';
import { Terrain } from './terrain.js';
import { Course } from './course.js';
import { RealCourse } from './realcourse.js';
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
import { game, Mode, setMode, on, settings, resetScore, emit } from './state.js';

patchShaderChunks();

const params = new URLSearchParams(location.search);
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

async function boot() {
  const loader = new GLTFLoader();
  terrain = new Terrain();
  // Which mountain: ?resort=<id>&run=<n> (real Lake Tahoe data) or the hand-built gully.
  const resort = params.get('resort') || settings.resort || '';
  const runIndex = Number(params.get('run') ?? settings.run ?? 0);
  course = null;
  if (resort) {
    ui.loading(0.02, 'Fetching the mountain…');
    course = await RealCourse.load(resort, runIndex).catch((e) => { console.warn('resort load failed', e); return null; });
  }
  if (!course) course = new Course();
  ui.setMountain(course);
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
  rider = new Rider(player);
  await rider.load(loader);
  scene.add(rider.root);
  const s = terrain.getSpawn();
  player.place(s.position, s.heading);
  player.state = State.FROZEN;

  cam = new CameraController(camera, player, terrain, input);
  fx = new FXManager(player, renderer, scene);
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
  window.__sendit = { fx, course, player, terrain, camera, game, scene, renderer, features, scatter };
}

function setupPost() {
  post = new PostStack(renderer, scene, camera);
  composer = post.composer;
}

function applyQuality() {
  const q = settings.quality;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio([Math.min(dpr, 1) * 0.75, Math.min(dpr, 1.5), dpr][q]);
  sky.setShadowBox([40, 60, 85][q], [1024, 2048, 4096][q]);
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
}

// ---------------------------------------------------------------- flow
let busy = false;
async function startRide(instant = false) {
  if (busy) return;
  busy = true;
  await sound.init().catch(() => {});
  sound.resume();
  if (!instant) input.lock();
  resetScore();
  player.startRiding();
  setMode(Mode.RIDING);
  if (!instant) cam.startIntro(); else cam.snap();
  ui.refresh();
  emit('rideStarted');
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

async function toMenu() {
  if (busy) return;
  busy = true;
  await ui.fade(true, 0.6);
  player.state = State.FROZEN;
  setMode(Mode.MENU);
  ui.refresh();
  ui.fade(false, 1.2);
  busy = false;
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (game.mode === Mode.RIDING || game.mode === Mode.LIFT) && !busy) pause();
});
canvas.addEventListener('click', () => { if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) input.lock(); });

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
  input.poll();
  if (input.justPressed('pause')) {
    if (game.mode === Mode.PAUSED) resume();
    else if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) pause();
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
