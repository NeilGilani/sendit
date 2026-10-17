// Kitsune Peak: per-rider logic (headless; course.onPlayer → attachKitsune). Everything here is opt-in
// through this map's course object, so no shared file changes:
//   • Trails: main.js spawns the rider at the selected trail (course.trailSpawn); the course follows the
//     selection ('trailSelected') and recognises the trail actually ridden at the finish (drop zones, or a
//     run that wandered onto another trail).
//   • runCompleted { mapId, trailId, distance, time, score } on the state.js bus when a run reaches the
//     finish (zen: 'runComplete'; challenge: 'runFinished'). In the game profile/tracker.js emits it for
//     every map, so the map emits it only headless (bots, tools) — never twice.
//   • Senbon Torii: ride all 33 gates of the tunnel in one go (no crash) → a bonus scaled by your speed.
//   • Kazan whoops: consecutive clean airs off the rim's whoops build a chain ("Whoop ×n").
//   • Tree wells: grounded inside a fir's well the powder grabs you (sharp drag); the trunk is a crash.
import { emit, on, addScore, game } from '../../state.js';
import { START_X, FINISH_U, TUNNEL } from './layout.js';
import { FIR_WELL } from './forest.js';

export const TORII_BONUS = { base: 600, perKmh: 6 };      // points: base + per km/h of average speed through the tunnel
export const WELL_DRAG = 2.4;                             // 1/s of speed lost at the heart of a well (fades to 0 at its rim)

export function attachKitsune(course, pl) {
  course._riderOffs?.();          // a new rider replaces the old one's listeners
  course.player = pl;
  const mine = () => course.player === pl;
  const run = { t: 0, dist: 0, samples: [], startU: 0, startV: 0, trail: course.activeTrail, done: false };
  const tunnel = { next: 0, ok: true, t0: 0, speed: 0, n: 0 };
  let whoops = 0, wellHint = 0, lastEmit = -1e9;

  const newRun = () => {
    run.t = 0; run.dist = 0; run.samples = []; run.done = false;
    run.startU = (pl.position?.x ?? START_X) - START_X; run.startV = pl.position?.z ?? 0;
    run.trail = course.activeTrail;
    tunnel.next = 0; tunnel.ok = true; whoops = 0;
  };

  // The game picks the trail (main.js: trail spawn / reset-to-top); keep the course's idea of it in step.
  const offTrail = on('trailSelected', (e) => { if (e?.mapId === course.id) course.selectTrail(e.trailId); });

  // The per-step layer: run clock and distance, the tunnel, the wells.
  const step = pl.step.bind(pl);
  pl.step = (dt) => {
    const x0 = pl.position.x, z0 = pl.position.z;
    step(dt);
    if (!mine() || pl.state === 0) return;   // State.FROZEN
    run.t += dt;
    run.dist += Math.hypot(pl.position.x - x0, pl.position.z - z0);
    const u = pl.position.x - START_X, v = pl.position.z;
    if (!run.samples.length || u - run.samples[run.samples.length - 1][0] > 40) run.samples.push([u, v]);
    toriiStep(u, v, dt);
    wellStep(u, v, dt);
  };

  function toriiStep(u, v, dt) {
    const G = course.gates;
    if (tunnel.next < G.length && u >= G[tunnel.next].u) {
      const g = G[tunnel.next];
      const inside = Math.abs((pl.position.x - g.x) * g.rx + (pl.position.z - g.z) * g.rz) < g.span / 2 - 0.2;
      if (tunnel.next === 0) { tunnel.ok = inside; tunnel.t0 = run.t; tunnel.speed = 0; tunnel.n = 0; }
      else tunnel.ok = tunnel.ok && inside;
      tunnel.next++;
      if (tunnel.ok && tunnel.next === G.length) {
        const kmh = (TUNNEL.u1 - TUNNEL.u0) / Math.max(0.5, run.t - tunnel.t0) * 3.6;
        const pts = Math.round(TORII_BONUS.base + TORII_BONUS.perKmh * kmh);
        addScore(`Senbon Torii · ${Math.round(kmh)} km/h`, pts);
        emit('toriiTunnel', { kmh, points: pts });
      }
    }
    if (tunnel.ok && tunnel.next > 0 && tunnel.next < G.length) { tunnel.speed += pl.speed * dt; tunnel.n += dt; }
    // Leaving the tunnel sideways or riding back up resets it.
    if (u < TUNNEL.u0 - 5 && tunnel.next) tunnel.next = 0;
  }

  function wellStep(u, v, dt) {
    if (pl.state !== 1 || !course.wellHash) return;   // State.GROUNDED
    const a = course.wellHash.get(Math.floor(u / 16) * 4096 + Math.floor(v / 16));
    if (!a) return;
    for (const w of a) {
      const q = ((u - w.u) ** 2 + (v - w.v) ** 2) / (w.r * w.r * 0.6);
      if (q >= 1) continue;
      const k = Math.min(0.5, WELL_DRAG * (1 - q) * dt);
      pl.velocity.multiplyScalar(1 - k);
      pl.speed *= 1 - k;
      if (run.t - wellHint > 8) { wellHint = run.t; emit('hint', 'Tree well! Give the firs room — the snow under them is bottomless'); }
      return;
    }
  }

  const offs = [
    on('respawned', () => { if (mine()) newRun(); }),
    on('rideStarted', () => { if (mine()) newRun(); }),
    on('crashed', () => { if (mine()) { tunnel.ok = false; whoops = 0; } }),
    on('landingGrade', (e) => {
      if (!mine()) return;
      if (e.feature === 'Kazan Rim' && e.grade !== 'sketchy') {
        whoops++;
        if (whoops >= 2) addScore(`Whoop ×${whoops}`, 40 * whoops);
      } else if (e.feature && e.feature !== 'Kazan Rim') whoops = 0;
    }),
    on('runCompleted', (e) => { if (e?.mapId === course.id) lastEmit = performanceNow(); }),
    on('runComplete', () => complete(null)),
    on('runFinished', (res) => complete(res)),
    offTrail,
  ];
  course._riderOffs = () => { for (const o of offs) o(); course._riderOffs = null; };
  void FIR_WELL;

  function complete(res) {
    if (!mine() || run.done) return;
    if (pl.position.x - START_X < FINISH_U - 5) return;
    run.done = true;
    const now = performanceNow();
    if (now - lastEmit < 2000) return;    // someone else already announced this finish
    // In the game the ride tracker (profile/tracker.js) announces every finished run; the map only
    // announces it where no tracker runs (headless bots, tools).
    if (globalThis.__sendit?.activities) return;
    const trailId = recogniseTrail();
    lastEmit = now;
    emit('runCompleted', {
      mapId: course.id, trailId,
      distance: Math.round(run.dist),
      time: +(res?.time ?? run.t).toFixed(2),
      score: Math.max(game.score, res?.score ?? 0),
    });
  }

  /** The trail this run was: the selected one if it was ridden, else the trail whose line the run followed. */
  function recogniseTrail() {
    let best = run.trail, bestD = Infinity;
    for (const t of course.trails) {
      const pts = course.linePoints(t.id);
      let d = 0, n = 0;
      for (const [u, v] of run.samples) {
        if (u < Math.max(t.start[0], pts[0][0])) continue;
        d += Math.min(150, Math.abs(sampleV(pts, u) - v)); n++;
      }
      if (n < 3) continue;
      const mean = d / n + (t.id === run.trail ? -12 : 0);   // a small preference for the selected trail
      if (mean < bestD) { bestD = mean; best = t.id; }
    }
    return best;
  }

  newRun();
}

function sampleV(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
  }
  return pts[pts.length - 1][1];
}

function performanceNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
