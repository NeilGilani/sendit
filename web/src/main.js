// SENDIT (web) — stylized arcade snowboarding on the real Matterhorn.
// Systems: InputController (input.js), PlayerPhysics (player.js), Rider animation (rider.js),
// CameraController (camera.js), FXManager (fx.js), world art (terrain/sky/scatter/features/lifts).
// All tunables live in config.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, Effect, BlendFunction, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { patchShaderChunks, globals, makeNoiseTexture } from './world.js';
import { HUD } from './config.js';
import { ATMOSPHERE, col, createSnowfall } from './scene.js';
import { Terrain } from './terrain.js';
import { Course } from './course.js';
import { RealCourse } from './realcourse.js';
import { Activities } from './activities.js';
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
import { Input, PAD } from './input.js';
import { game, Mode, setMode, on, settings, setSetting, resetScore, emit } from './state.js';

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
const ui = new UI({
  ride: () => startRide(false, 'zen'),
  challenge: () => startRide(false, 'challenge'),
  retry: () => startRide(true, 'challenge'),
  zen: () => startRide(true, 'zen'),
  restart: () => { resume(); startRide(true, activities?.mode || 'zen'); },
  resume: () => resume(), top: () => player.resetToTop(), menu: () => toMenu(),
});

let activities, life, course, snowfall, terrain, sky, scatter, lifts, features, player, rider, cam, fx, sound, composer, aoPass, bloom, wind;

/**
 * Speed wind: smooth, organic, tapered alpha streaks that live only in the four screen corners and
 * only at extreme speed (no fullscreen radial lines), plus a soft corner-only motion smear.
 */
class WindEffect extends Effect {
  constructor() {
    super('WindEffect', /* glsl */`
      uniform float intensity;
      uniform float windTime;
      float h1(float n) { return fract(sin(n * 91.345) * 47453.21); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 col = inputColor.rgb;
        if (intensity > 0.001) {
          vec2 d = uv - vec2(0.5);
          vec2 ds = d * vec2(aspect, 1.0);
          float r = length(ds);
          vec2 ad = abs(d) * 2.0;                                  // 0 centre -> 1 frame edge
          float corner = smoothstep(0.42, 0.9, ad.x) * smoothstep(0.36, 0.86, ad.y);
          if (corner > 0.001) {
            vec3 acc = vec3(0.0);
            for (int i = 1; i <= 5; i++) acc += texture2D(inputBuffer, uv - d * float(i) * 0.007 * intensity).rgb;
            col = mix(col, acc / 5.0, corner * 0.6 * intensity);
            float ang = atan(ds.y, ds.x);
            float alpha = 0.0;
            for (int k = 0; k < 2; k++) {
              float fk = float(k);
              float lanes = 64.0 + fk * 41.0;
              float a = ang + 0.045 * sin(r * 8.0 + fk * 2.3 + windTime * 0.8);   // gentle organic curve
              float x = a * lanes / 6.2831853;
              float lane = floor(x);
              float seed = h1(lane + fk * 113.0);
              if (seed < 0.55) continue;
              float head = fract(seed * 13.7 + windTime * (0.7 + seed * 1.3));
              float rr = 0.45 + head * 0.7;                          // streak head radius
              float len = 0.14 + seed * 0.22;
              float t = (rr - r) / len;                              // 0 head -> 1 tail
              float body = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.3, 1.0, t));
              float w = (0.06 + 0.1 * (seed - 0.55)) * (1.0 - clamp(t, 0.0, 1.0) * 0.8);   // tapers to the tail
              float across = abs(fract(x) - 0.5) * 2.0;
              float thin = exp(-(across * across) / max(w * w, 1e-4));
              alpha = max(alpha, thin * body * smoothstep(0.0, 0.25, head) * (1.0 - smoothstep(0.75, 1.0, head)));
            }
            col = mix(col, vec3(0.94, 0.95, 1.0), clamp(alpha * corner * intensity * 0.6, 0.0, 1.0));
            col *= 1.0 - corner * intensity * 0.1;
          }
        }
        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([['intensity', new THREE.Uniform(0)], ['windTime', new THREE.Uniform(0)]]),
    });
  }
}

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
  if (params.has('kicker')) {
    // Debug: start 40 m before a kicker, aimed at it.
    const k = features.kickers[Number(params.get('kicker'))] || features.kickers[0];
    const p0 = k.o.clone().addScaledVector(k.f, -40);
    terrain.meta.spawn = { position: [p0.x, 0, p0.y], heading: Math.atan2(-k.f.x, -k.f.y) };
  }
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
  rider = new Rider(player);
  await rider.load(loader);
  scene.add(rider.root);
  const s = terrain.getSpawn();
  player.place(s.position, s.heading);
  player.state = State.FROZEN;

  cam = new CameraController(camera, player, terrain, input);
  cam.rider = rider;
  fx = new FXManager(player, renderer, scene);
  life.fx = fx;
  activities = new Activities({ scene, course, features, terrain, player, fx });
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
  if (params.has('ride') || params.has('challenge')) startRide(true, params.has('challenge') ? 'challenge' : 'zen');
  else { setMode(Mode.MENU); ui.refresh(); }
  window.__sendit = { activities, life, fx, course, player, terrain, camera, game, scene, renderer, features, scatter };
}

function setupPost() {
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  aoPass.configuration.aoRadius = 2.5;
  aoPass.configuration.distanceFalloff = 1.0;
  aoPass.configuration.intensity = 1.6;
  aoPass.configuration.color = col('#6f7fa3');   // soft cool contact shadows
  aoPass.setQualityMode('Medium');
  composer.addPass(aoPass);
  bloom = new BloomEffect({ intensity: 0.45, luminanceThreshold: 0.86, luminanceSmoothing: 0.12, mipmapBlur: true, radius: 0.75 });
  wind = new WindEffect();
  composer.addPass(new EffectPass(camera, bloom, wind, new VignetteEffect({ offset: 0.32, darkness: 0.38 })));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
}

function applyQuality() {
  const q = settings.quality;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio([Math.min(dpr, 1) * 0.75, Math.min(dpr, 1.5), dpr][q]);
  sky.setShadowBox([40, 60, 85][q], [1024, 2048, 4096][q]);
  aoPass.enabled = q > 0;
  if (q > 0) aoPass.setQualityMode(q === 2 ? 'High' : 'Medium');
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
async function startRide(instant = false, mode = 'zen') {
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
  activities.start(mode);
  finishing = false;
  emit('rideStarted');
  busy = false;
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
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!composer) return;
  input.poll(dt);
  ui.navigate(input);
  if (game.mode === Mode.MENU && (input.btnPressed(PAD.START))) startRide();
  if (input.justPressed('view') && (game.mode === Mode.RIDING || game.mode === Mode.LIFT)) {
    setSetting('view', settings.view === 'fp' ? 'tp' : 'fp');
    ui.pop(settings.view === 'fp' ? 'FIRST PERSON' : 'CHASE CAM', 'cyan', true);
  }
  rider.fp = settings.view === 'fp' && game.mode !== Mode.MENU && player.state !== State.CRASH;
  document.body.classList.toggle('fp', rider.fp && (game.mode === Mode.RIDING || game.mode === Mode.LIFT));
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
  life.update(paused ? 0 : dt, time, player, camera.position);
  snowfall.update(camera, time, innerHeight);
  if (!paused) { fx.update(dt, camera); activities.update(dt); }
  ui.updateActivity(activities.hud());
  sound.update(dt, camera);
  ui.update(dt, player);
  checkFinish();
  rumbleCarve(dt);
  // Wind streaks fade in near top speed.
  const riding = game.mode === Mode.RIDING;
  const wantWind = riding ? THREE.MathUtils.smoothstep(player.speedRatio, HUD.windStreakFrom, HUD.windStreakFull) : 0;
  const wu = wind.uniforms.get('intensity');
  wu.value += (wantWind - wu.value) * (1 - Math.exp(-3 * dt));
  wind.uniforms.get('windTime').value = time;
  input.endFrame();
  composer.render(dt);
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.loading(1, `Something went wrong: ${e.message}`);
});
