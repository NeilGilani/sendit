// SENDIT (web) — boots the renderer, loads the real mountain, and runs the menu → ride → pause flow.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, SMAAPreset, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { patchShaderChunks, globals, makeNoiseTexture } from './world.js';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Scatter } from './scatter.js';
import { Lifts } from './lifts.js';
import { Skier, State } from './skier.js';
import { SkierRig } from './rig.js';
import { ChaseCamera } from './camera.js';
import { SkiTrails, PowderSpray, Snowfall } from './effects.js';
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
scene.fog = new THREE.FogExp2(new THREE.Color(0.72, 0.82, 1.0), 0.00004);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.25, 40000);
camera.position.set(0, 4000, 0);

const input = new Input(canvas);
const ui = new UI({ ride: () => startRide(), resume: () => resume(), top: () => skier.resetToTop(), menu: () => toMenu() });

let terrain, sky, scatter, lifts, skier, rig, chase, trails, spray, snowfall, sound, composer, aoPass, bloom;

async function boot() {
  const loader = new GLTFLoader();
  terrain = new Terrain();
  await terrain.load('/terrain/', (p) => ui.loading(p * 0.5, 'Reading Copernicus elevation…'));
  ui.loading(0.5, 'Loading photoscanned snow and rock…');
  const tl = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (f, srgb) => {
    const t = tl.load(`/textures/${f}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const textures = {
    snowAlb: tex('snow_02_diff_2k.jpg', true), snowNor: tex('snow_02_nor_gl_2k.jpg'), snowRgh: tex('snow_02_rough_2k.jpg'),
    packAlb: tex('snow_01_diff_2k.jpg', true), packNor: tex('snow_01_nor_gl_2k.jpg'), packRgh: tex('snow_01_rough_2k.jpg'),
    rockAlb: tex('rock_face_03_diff_2k.jpg', true), rockNor: tex('rock_face_03_nor_gl_2k.jpg'),
    noise: makeNoiseTexture(512, 11),
  };
  terrain.bakeSunMask(renderer);
  terrain.buildMaterials(textures);
  terrain.build();
  scene.add(terrain.group);

  sky = new Sky(scene);
  scene.environment = sky.bakeEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  ui.loading(0.62, 'Planting larches and placing boulders…');
  const [scatterData, liftData] = await Promise.all([
    fetch('/terrain/scatter.json').then((r) => r.json()),
    fetch('/terrain/lifts.json').then((r) => r.json()),
  ]);
  scatter = new Scatter(terrain);
  await scatter.load(loader, scatterData);
  scene.add(scatter.group);
  ui.loading(0.8, 'Stringing the chairlifts…');
  lifts = new Lifts(terrain);
  lifts.build(liftData);
  scene.add(lifts.group);

  ui.loading(0.88, 'Waxing skis…');
  skier = new Skier(terrain, scatter, lifts, input);
  skier.fade = (b, d) => ui.fade(b, d);
  rig = new SkierRig(skier);
  await rig.load(loader);
  scene.add(rig.root);
  const s = terrain.getSpawn();
  skier.place(s.position, s.heading);
  skier.state = State.FROZEN;

  chase = new ChaseCamera(camera, skier, terrain, input);
  trails = new SkiTrails(skier, terrain);
  scene.add(trails.mesh);
  spray = new PowderSpray(skier, renderer);
  scene.add(spray.points);
  snowfall = new Snowfall();
  scene.add(snowfall.points);
  sound = new SoundScape(skier, terrain);

  setupPost();
  applyQuality();
  on('settings', ({ key }) => { if (key === 'quality') applyQuality(); if (key === 'snowfall') snowfall.points.visible = settings.snowfall; });
  snowfall.points.visible = settings.snowfall;
  addEventListener('resize', onResize);
  onResize();

  // Warm up shaders so the first frames don't hitch.
  renderer.compile(scene, camera);
  ui.loading(1, '');
  ui.doneLoading();
  ui.fade(false, 2.5);
  if (params.has('at')) {
    const [x, z, h] = params.get('at').split(',').map(Number);
    terrain.meta.spawn = { position: [x, 0, z], heading: h || 0 };
  }
  if (params.has('ride')) startRide(true);
  else { setMode(Mode.MENU); ui.refresh(); }
  window.__sendit = { skier, terrain, camera, game, scene, renderer };
}

function setupPost() {
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  aoPass.configuration.aoRadius = 2.5;
  aoPass.configuration.distanceFalloff = 1.2;
  aoPass.configuration.intensity = 2.2;
  aoPass.configuration.color = new THREE.Color(0.08, 0.12, 0.22);
  aoPass.setQualityMode('Medium');
  composer.addPass(aoPass);
  bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.95, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.38 });
  composer.addPass(new EffectPass(camera, bloom, tone, vignette));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
}

function applyQuality() {
  const q = settings.quality;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio([Math.min(dpr, 1) * 0.75, Math.min(dpr, 1.5), dpr][q]);
  sky.setShadowBox([45, 70, 95][q], [1024, 2048, 4096][q]);
  aoPass.enabled = q > 0;
  if (q > 0) aoPass.setQualityMode(q === 2 ? 'High' : 'Medium');
  bloom.intensity = [0.4, 0.55, 0.6][q];
  terrain.setQuality(q);
  scatter.setQuality(q);
  onResize();
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
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
  if (!instant) await ui.fade(true, 0.9);
  resetScore();
  setMode(Mode.RIDING);
  skier.startRiding();
  chase.snap();
  ui.refresh();
  emit('rideStarted');
  await new Promise((r) => setTimeout(r, 200));
  ui.fade(false, 1.6);
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
  await ui.fade(true, 0.9);
  skier.state = State.FROZEN;
  setMode(Mode.MENU);
  ui.refresh();
  ui.fade(false, 1.6);
  busy = false;
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (game.mode === Mode.RIDING || game.mode === Mode.LIFT) && !busy) pause();
});
canvas.addEventListener('click', () => { if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) input.lock(); });

// ---------------------------------------------------------------- loop
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
    while (acc >= STEP && n < 8) { skier.step(STEP); trails.update(); acc -= STEP; n++; }
    if (n === 8) acc = 0;
    skier.interpolate(acc / STEP);
  }
  globals.uTime.value = time;
  rig.update(paused ? 0 : dt);
  chase.update(dt);
  const focus = game.mode === Mode.MENU ? camera.position : skier.renderPos;
  sky.update(camera, game.mode === Mode.MENU ? camera.position.clone().add(new THREE.Vector3(0, -200, 0)) : skier.renderPos);
  terrain.update(camera.position);
  scatter.update(camera.position);
  lifts.update(time, camera.position);
  trails.rebuild();
  if (!paused) spray.update(dt, renderer.domElement.height);
  snowfall.update(dt, camera, renderer.domElement.height);
  sound.update(dt, camera);
  ui.update(dt, skier);
  input.endFrame();
  composer.render(dt);
  void focus;
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.loading(1, `Something went wrong: ${e.message}`);
});
