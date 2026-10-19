// Instant replay (Steep's GoPro / replay view, Riders Republic's drone cam, the "watch that again" moment):
// the last THRILL.replay.seconds of the rider are recorded every frame (every bone and gear node's local
// transform, plus the rider's position). After a big landing a "▶ REPLAY · Tab" pill shows; Tab (d-pad ▲)
// plays the trick back from a drone orbiting the rider, in slow motion while airborne, letterboxed, with
// the HUD hidden. Any other key skips. Enter during a replay saves it as a .webm clip (MediaRecorder on
// the game canvas) and replays it again while recording. Zen only: a Challenge clock never stops.
//
// The world is frozen while it plays (main.js skips the physics, the rider rig, the chase camera, effects
// and the activity timer), then the rig is put back exactly as it was and the chase camera snaps back.
// Setting: "Replay prompt after big tricks" (settings.thrillReplayPrompt; Tab works either way).
import * as THREE from 'three';
import { on, game, Mode, settings, emit } from '../state.js';
import { THRILL, FrameRing, clipRange } from './core.js';
import { HEAD_SCALE } from '../character/index.js';
import { nodeKeys } from './clipcodec.js';

const HUGE = /720|900|1080|1260|1440|flip|cork|misty|rodeo|wildcat|tamedog/i;
const STRIDE_NODE = 11;   // pos 3, quat 4, scale 3, visible 1
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Vector3(), _cam = new THREE.Vector3(), _look = new THREE.Vector3();

export function installReplay({ player, rider, camera, terrain, input, activities, cam, canvas }) {
  const C = THRILL.replay;
  let nodes = [], keys = [], ring = null, recClock = 0, countT = 0;
  let active = null;          // { t, t0, t1, ang, fov, rec? }
  let moment = null;          // the last replayable moment { t, before, after, kind: 'trick' | 'wipeout' }
  let cuts = [];              // rec-clock times of teleports (respawn, retry, drop zone): a replay never spans one
  let crash = null;           // the crash waiting for its respawn (wipeout replays)
  let lastShot = 'filmer';    // alternates 'drone' / 'filmer'
  const ui = typeof document !== 'undefined' ? mountUi() : null;

  function rebuild() {
    nodes = [];
    rider.root.traverse((o) => nodes.push(o));
    keys = nodeKeys(rider.root);
    const stride = nodes.length * STRIDE_NODE + 4;
    ring = new FrameRing(Math.ceil(C.seconds * 62), stride);   // frames are kept at ≤ 60 Hz (fast displays skip some)
    moment = null; cuts = [];
  }
  on('equipmentChanged', () => { ring = null; });
  on('rideStarted', () => { ring?.clear(); moment = null; cuts = []; crash = null; });
  // A teleport: frames after it are elsewhere, so a replay stops at it. Old cuts fall out with the ring.
  on('respawned', () => { cuts = cuts.filter((c) => ring && c >= ring.t0); cuts.push(recClock + 1e-6); if (moment?.kind !== 'wipeout' || recClock - moment.t > 8) ui?.prompt(false); });   // juice reports the wipeout from its own respawned listener, before this one
  on('crashed', () => { if (game.mode === Mode.RIDING && activities?.mode !== 'challenge') crash = { t: recClock, before: C.wipeBefore, after: C.wipeAfter, kind: 'wipeout' }; });
  // Juice reports the tumble on the respawn: a big one offers its replay ("relive your wipeouts", STEEP).
  on('juiceWipeout', ({ tumble, speed }) => {
    if (!crash) return;
    const c = crash; crash = null;
    if ((tumble || 0) < C.wipeTumble && (speed || 0) < C.wipeSpeed) return;
    moment = c;
    if (settings.thrillReplayPrompt !== false) ui?.prompt(true, 'WIPEOUT');
  });

  function record(dt) {
    if (!rider.root || !rider.model) return;
    if (!ring || (countT -= 1) <= 0) {
      countT = 30;
      let n = 0;
      rider.root.traverse(() => { n++; });
      if (!ring || n !== nodes.length) rebuild();
    }
    recClock += dt;
    if (ring.count && recClock - ring.t1 < 1 / 60 - 1e-4) return;
    const o0 = ring.push(recClock), D = ring.data;
    let o = o0;
    for (const nd of nodes) {
      let p = nd.position, q = nd.quaternion, s = nd.scale;
      if (!nd.matrixAutoUpdate) { nd.matrix.decompose(_p, _q, _s); p = _p; q = _q; s = _s; }
      D[o] = p.x; D[o + 1] = p.y; D[o + 2] = p.z;
      D[o + 3] = q.x; D[o + 4] = q.y; D[o + 5] = q.z; D[o + 6] = q.w;
      D[o + 7] = s.x; D[o + 8] = s.y; D[o + 9] = s.z;
      D[o + 10] = nd.visible ? 1 : 0;
      o += STRIDE_NODE;
    }
    const rp = player.renderPos;
    D[o] = rp.x; D[o + 1] = rp.y; D[o + 2] = rp.z; D[o + 3] = player.state === 2 ? 1 : 0;
  }

  /** Pose the rig at replay time t; returns the rider position in _c and whether it was airborne. */
  function apply(t) {
    const f = ring.at(t);
    if (!f) return false;
    const D = ring.data, A = ring.offset(f.a), Bo = ring.offset(f.b), k = f.k;
    let a = A, b = Bo;
    for (const nd of nodes) {
      nd.position.set(D[a] + (D[b] - D[a]) * k, D[a + 1] + (D[b + 1] - D[a + 1]) * k, D[a + 2] + (D[b + 2] - D[a + 2]) * k);
      _q.set(D[a + 3], D[a + 4], D[a + 5], D[a + 6]); _q2.set(D[b + 3], D[b + 4], D[b + 5], D[b + 6]);
      nd.quaternion.slerpQuaternions(_q, _q2, k);
      nd.scale.set(D[a + 7] + (D[b + 7] - D[a + 7]) * k, D[a + 8] + (D[b + 8] - D[a + 8]) * k, D[a + 9] + (D[b + 9] - D[a + 9]) * k);
      nd.visible = (k < 0.5 ? D[a + 10] : D[b + 10]) > 0.5;
      if (!nd.matrixAutoUpdate) nd.matrix.compose(nd.position, nd.quaternion, nd.scale);
      a += STRIDE_NODE; b += STRIDE_NODE;
    }
    _c.set(D[a] + (D[b] - D[a]) * k, D[a + 1] + (D[b + 1] - D[a + 1]) * k, D[a + 2] + (D[b + 2] - D[a + 2]) * k);
    return (k < 0.5 ? D[a + 3] : D[b + 3]) > 0.5;
  }

  /** Rider position at replay time t (no posing). */
  function posAt(t, out) {
    const f = ring.at(t), D = ring.data, n = nodes.length * STRIDE_NODE;
    const a = ring.offset(f.a) + n, b = ring.offset(f.b) + n;
    return out.set(D[a] + (D[b] - D[a]) * f.k, D[a + 1] + (D[b + 1] - D[a + 1]) * f.k, D[a + 2] + (D[b + 2] - D[a + 2]) * f.k);
  }

  /** Which side of the line the drone flies (+1 / -1): the one with fewer trees between it and the rider. */
  function clearSide(t0, t1, travel) {
    const sc = player.scatter;
    if (!sc?.nearest) return 1;
    const c = new THREE.Vector3(), q = { x: 0, z: 0 };
    const hits = (side) => {
      let n = 0;
      for (let i = 0; i <= 6; i++) {
        posAt(t0 + (t1 - t0) * i / 6, c);
        const th = travel + side * Math.PI / 2 + (C.orbitDeg * Math.PI / 180) * (i / 6 - 0.5);
        for (let k = 1; k <= 4; k++) { q.x = c.x + Math.cos(th) * C.dist * k / 4; q.z = c.z + Math.sin(th) * C.dist * k / 4; if (sc.nearest(q, 0.8)) n++; }
      }
      return n;
    };
    return hits(1) <= hits(-1) ? 1 : -1;
  }

  function canReplay() {
    return game.mode === Mode.RIDING && !!ring && ring.count > 10 && activities?.mode !== 'challenge' && !player._busy && player.state !== 3;
  }

  function start(rec = false) {
    if (active || !canReplay()) return false;
    const r = clipRange({ t0: ring.t0, t1: ring.t1 }, cuts, moment, recClock, C);
    if (!r) { emit('hint', 'Nothing to replay yet'); return false; }
    const t0 = r.a, t1 = r.b, m = moment && moment.t >= t0 && moment.t <= t1 ? moment : null;
    // Drone side: perpendicular to the travel over the clip.
    const pa = posAt(t0, new THREE.Vector3()), pb = posAt(t1, new THREE.Vector3());
    const travel = Math.atan2(pb.z - pa.z, pb.x - pa.x);
    const side = clearSide(t0, t1, travel);
    active = { t: t0, t0, t1, ang: travel + side * Math.PI / 2, fov: camera.fov, rec: null, center: posAt(t0, new THREE.Vector3()), camPos: null, wipe: m?.kind === 'wipeout' ? m.t : null };
    // Every other replay is the filmer's shot: a tripod beside the take-off, a long lens panning with you.
    active.shot = rec ? lastShot : (lastShot = lastShot === 'drone' ? 'filmer' : 'drone');
    if (active.shot === 'filmer') {
      const at = posAt(Math.max(t0, Math.min(t1, m ? m.t - (m.kind === 'wipeout' ? 0.2 : 0.7) : (t0 + t1) / 2)), new THREE.Vector3());
      const px = Math.cos(active.ang), pz = Math.sin(active.ang), fx = Math.cos(travel), fz = Math.sin(travel);
      const x = at.x + px * C.filmerDist + fx * C.filmerAhead, z = at.z + pz * C.filmerDist + fz * C.filmerAhead;
      active.tripod = new THREE.Vector3(x, Math.max(terrain.getHeight(x, z), at.y - 6) + C.filmerHeight, z);
    }
    if (rec) active.rec = startClip();
    ui?.show(true, !!active.rec);
    ui?.prompt(false);
    document.body.classList.add('thrill-replay');
    emit('thrillReplay', { on: true, length: t1 - t0, clip: !!active.rec });
    return true;
  }

  function stop() {
    if (!active) return;
    const rec = active.rec;
    camera.fov = active.fov; camera.updateProjectionMatrix();
    active = null;
    if (ring?.count) apply(ring.t1 + 1);   // the rig exactly as it was (rider.update takes over next frame)
    cam?.snap?.();
    ui?.show(false);
    document.body.classList.remove('thrill-replay');
    if (rec) rec.finish();
    emit('thrillReplay', { on: false });
  }

  function startClip() {
    if (typeof MediaRecorder === 'undefined' || !canvas?.captureStream) return null;
    try {
      const stream = canvas.captureStream(30);
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6e6 } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sendit-replay-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        emit('hint', 'Replay clip saved to your downloads');
      };
      mr.start(250);
      return { finish: () => { try { mr.stop(); } catch { /* already stopped */ } stream.getTracks().forEach((t) => t.stop()); } };
    } catch (e) { console.warn('[thrill] clip recording unavailable', e); return null; }
  }

  // Big landings in Zen offer the replay.
  on('landed', (e) => {
    if (game.mode !== Mode.RIDING || active || !e.clean || e.result === 'crash' || activities?.mode === 'challenge') return;
    if (!(e.air >= C.bigAir || (HUGE.test(e.trick || '') && e.air > 0.8))) return;
    moment = { t: recClock, before: C.before, after: C.after, kind: 'trick' };
    if (settings.thrillReplayPrompt !== false) ui?.prompt(true);
  });

  const skipPressed = () => input.keyPressed('jump') || input.keyPressed('pause') || input.codePressed('Tab') || input.btnPressed(0) || input.btnPressed(1) || input.btnPressed(9) || input.btnPressed(12);

  return {
    get active() { return !!active; },
    /** The recorder itself (thrill/highlights.js saves clips from it): ring, node keys, clock, cuts, stride. */
    recorder: () => ({ ring, keys, nodes, recClock, cuts, stride: STRIDE_NODE }),
    /** For tests: the recorder's state. */
    debug: () => ({ t0: ring?.t0, t1: ring?.t1, count: ring?.count, cuts: [...cuts], moment, recClock, busy: !!player._busy, state: player.state }),
    start, stop,
    /** Per frame, after the rider rig and camera have updated (main.js). */
    record(dt) { if (!active && game.mode === Mode.RIDING) record(dt); },
    /** Before the world updates: Tab / d-pad ▲ starts a replay. Returns true while one plays (main.js freezes the ride). */
    input() {
      if (active) return true;
      if (game.mode === Mode.RIDING && (input.codePressed('Tab') || input.btnPressed(12))) return start();
      return false;
    },
    /** Drives the rig and the drone camera while a replay plays. */
    update(dt) {
      if (!active) return;
      if (game.mode !== Mode.RIDING) { stop(); return; }
      if (input.codePressed('Enter') && !active.rec) { const keep = active.fov; active = null; start(true); if (active) active.fov = keep; return; }
      active.age = (active.age || 0) + 1;
      if (active.age > 1 && skipPressed()) { stop(); return; }   // not the key press that started it
      const airborne = apply(active.t);
      // Recorded in the helmet cam: show the rider whole (first person shrinks the head, hides the garments).
      rider.fp = false;
      const H = rider.bones?.Head;
      if (H && H.scale.x < HEAD_SCALE * 0.95) H.scale.setScalar(HEAD_SCALE);
      const rate = active.wipe !== null ? (active.t > active.wipe - 0.6 && active.t < active.wipe + 1.6 ? C.wipeSlow : 1) : airborne ? C.slow : 1;
      active.rate = (active.rate ?? rate) + (rate - (active.rate ?? rate)) * Math.min(1, dt * 6);
      active.t += dt * active.rate;
      active.center.lerp(_c, Math.min(1, dt * 10));
      const u = (active.t - active.t0) / (active.t1 - active.t0);
      if (active.tripod) {
        // Filmer: fixed tripod, long lens that keeps the rider about the same size in frame.
        camera.position.copy(active.tripod);
        camera.lookAt(_look.copy(active.center).add({ x: 0, y: 0.9, z: 0 }));
        const d = camera.position.distanceTo(_look);
        const fov = Math.max(14, Math.min(55, (2 * Math.atan(C.filmerFrame / Math.max(d, 1)) * 180) / Math.PI));
        active.lens = active.lens === undefined ? fov : active.lens + (fov - active.lens) * Math.min(1, dt * 3);
        if (Math.abs(camera.fov - active.lens) > 0.01) { camera.fov = active.lens; camera.updateProjectionMatrix(); }
        ui?.tick(active.rate, u);
        if (active.t >= active.t1) stop();
        return;
      }
      // Drone: orbit the (smoothed) rider, above the snow.
      const th = active.ang + (C.orbitDeg * Math.PI / 180) * (u - 0.5);
      _cam.set(active.center.x + Math.cos(th) * C.dist, active.center.y + C.rise, active.center.z + Math.sin(th) * C.dist);
      _cam.y = Math.max(_cam.y, terrain.getHeight(_cam.x, _cam.z) + 1.2);
      if (!active.camPos) active.camPos = _cam.clone(); else active.camPos.lerp(_cam, Math.min(1, dt * 8));
      camera.position.copy(active.camPos);
      camera.lookAt(_look.copy(active.center).add({ x: 0, y: 0.9, z: 0 }));
      if (Math.abs(camera.fov - 50) > 0.01) { camera.fov = 50; camera.updateProjectionMatrix(); }
      ui?.tick(active.rate, u);
      if (active.t >= active.t1) stop();
    },
  };
}

/** The row of prompt pills above the HUD (▶ REPLAY · TAB, ◆ SAVE CLIP · F), shared with highlights.js. */
export function pillRow() {
  let row = document.getElementById('thrill-pills');
  if (!row) { row = document.createElement('div'); row.id = 'thrill-pills'; document.body.appendChild(row); }
  return row;
}

function mountUi() {
  const st = document.createElement('style');
  st.textContent = `
  #thrill-replay{position:fixed;inset:0;pointer-events:none;z-index:6;display:none;font-family:inherit;color:#fff}
  #thrill-replay.on{display:block}
  #thrill-replay .bar{position:absolute;left:0;right:0;height:9vh;background:#000}
  #thrill-replay .bar.t{top:0}#thrill-replay .bar.b{bottom:0}
  #thrill-replay .tag{position:absolute;top:calc(9vh + 14px);left:22px;font-weight:800;letter-spacing:.24em;font-size:15px;display:flex;align-items:center;gap:9px;text-shadow:0 1px 8px rgba(0,0,0,.5)}
  #thrill-replay .tag i{width:10px;height:10px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 10px #ff3b5c;animation:thrillRec 1s steps(2) infinite}
  #thrill-replay .rate{position:absolute;top:calc(9vh + 14px);right:22px;font-weight:700;letter-spacing:.12em;font-size:14px;opacity:.85}
  #thrill-replay .hint{position:absolute;bottom:calc(9vh + 14px);left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.14em;opacity:.75;white-space:nowrap}
  #thrill-replay .prog{position:absolute;bottom:9vh;left:0;height:3px;background:#2ff5d6;width:0}
  #thrill-pills{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;pointer-events:none;z-index:6}
  #thrill-rp{transform:translateY(10px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;
    background:rgba(8,14,28,.72);border:1px solid rgba(47,245,214,.55);border-radius:999px;padding:7px 16px;font-size:13px;font-weight:700;letter-spacing:.16em;color:#dffcf7}
  #thrill-rp:not(.on){position:absolute;visibility:hidden}
  #thrill-rp.on{opacity:1;transform:none}
  #thrill-rp kbd{font:inherit;background:#2ff5d6;color:#06121a;border-radius:5px;padding:1px 7px;margin-left:8px}
  body.thrill-replay #hud,body.thrill-replay #thrill-vignette,body.thrill-replay #lvlUp,body.thrill-replay .cn-stack{visibility:hidden}
  body.pad #thrill-rp .k{display:none}body:not(.pad) #thrill-rp .p{display:none}
  @keyframes thrillRec{50%{opacity:.2}}`;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'thrill-replay';
  el.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="prog"></div><div class="tag"><i></i>REPLAY</div><div class="rate"></div><div class="hint">SPACE / ESC SKIP · F SAVE TO HIGHLIGHTS · ENTER DOWNLOAD VIDEO</div>';
  document.body.appendChild(el);
  const pr = document.createElement('div');
  pr.id = 'thrill-rp';
  pr.innerHTML = '▶ REPLAY<kbd class="k">TAB</kbd><kbd class="p">▲</kbd>';
  pillRow().appendChild(pr);
  const rate = el.querySelector('.rate'), prog = el.querySelector('.prog'), hint = el.querySelector('.hint'), tag = el.querySelector('.tag');
  let prT = 0;
  return {
    show(v, rec = false) {
      el.classList.toggle('on', v);
      tag.lastChild.textContent = rec ? 'RECORDING CLIP' : 'REPLAY';
      hint.textContent = rec ? 'SAVING WHEN IT ENDS · ESC STOP' : 'SPACE / ESC SKIP · F SAVE TO HIGHLIGHTS · ENTER DOWNLOAD VIDEO';
    },
    tick(r, u) { const t = r < 0.97 ? `${r.toFixed(1)}×` : ''; if (rate.textContent !== t) rate.textContent = t; prog.style.width = `${(Math.min(1, u) * 100).toFixed(1)}%`; },
    prompt(v, what = '') {
      clearTimeout(prT);
      if (v) pr.firstChild.textContent = what ? `▶ REPLAY ${what}` : '▶ REPLAY';
      pr.classList.toggle('on', v);
      if (v) prT = setTimeout(() => pr.classList.remove('on'), THRILL.replay.prompt * 1000);
    },
  };
}
