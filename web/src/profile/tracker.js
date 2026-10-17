// Ride tracker: turns ride events on the bus into lifetime stats (profile), case progress (rewards)
// and leaderboard entries.
//
// Listens:  'rideStarted'                 → opens a session (map, equipment, start time)
//           'runComplete'                 → counts a finished lap (Zen: the finish line)
//           'runFinished' { medal, … }    → a finished Challenge run (activities.js)
//           'rideEnded' { score, … }      → closes the session (main.js emits it when leaving a ride)
//           window 'pagehide'             → closes an open session so closing the tab mid-ride counts
// Emits:    'rideRecorded' { score, distance, airTotal, runs, mapId, rank, isNewBest, trailBoard, trailRank, trailNewBest }
// getTrailBoard() (optional) names a second board the ride also lands on: the trail's (maps/registry.js trailBoardId).
import { on, emit, game, scoreSnapshot, Mode } from '../state.js';
import { profileStore } from './store.js';
import { services } from '../services/index.js';
// Also listens: 'juiceLevelUp' { rankUp }  → a new rank in the game-feel progression (progression/index.js,
//                                            levels 5, 10, 20, 35, 60): a milestone case
// Also emits:   'runCompleted' { mapId, trailId, distance, time, score, mode, medal, equipment }
//                                          one per finished run, Zen or Challenge (distance and time of
//                                          that run alone; a generic hook for anything run-based)
// Case XP: every finished run credits the distance ridden since the last credit plus the finish
// bonuses (profileStore.creditRun → rewards.js); leaving the ride credits the remaining distance.
const mapNameOf = () => globalThis.__sendit?.map?.map?.name ?? null;

export function installRideTracker({ getMapId, getTrailBoard = () => null }) {
  let session = null;
  // A run's trail: the trail board when the map has trails (docs/maps.md), else the course key.
  const getTrailId = () => session?.trailBoard ?? globalThis.__sendit?.activities?.key ?? null;

  on('rideStarted', () => {
    session = { t0: performance.now(), runs: 0, mapId: getMapId(), trailBoard: getTrailBoard(), equipment: profileStore.equipment };
  });
  on('runComplete', () => { if (session) { session.runs += 1; runDone({ mode: 'zen' }); } });
  on('runFinished', (res) => { if (session) { session.runs += 1; runDone({ mode: 'challenge', medal: res?.medal ?? null, score: res?.score }); } });
  on('rideEnded', (snap) => finish(snap || scoreSnapshot()));
  on('juiceLevelUp', (e) => { if (e?.rankUp) profileStore.grantCase('rank'); });
  globalThis.addEventListener?.('pagehide', () => {
    if (session && game.mode !== Mode.MENU) finish(scoreSnapshot());
  });

  /** Distance ridden since the last credit (game.distance restarts with each ride). */
  function takeDistance(total = game.distance) {
    const d = Math.max(0, (total || 0) - (session.credited || 0));
    session.credited = Math.max(session.credited || 0, total || 0);
    return d;
  }

  function runDone({ mode, medal = null, score }) {
    const s = session;
    const now = performance.now();
    const distance = takeDistance();
    const run = {
      mapId: s.mapId, trailId: getTrailId() ?? s.mapId, distance, time: (now - (s.runT0 ?? s.t0)) / 1000,
      score: score ?? game.score, mode, medal, equipment: s.equipment,
    };
    s.runT0 = now;
    emit('runCompleted', run);
    profileStore.creditRun({ ...run, finished: true, mapName: mapNameOf() });
  }

  async function finish(snap) {
    const s = session;
    if (!s) return null;
    const rest = takeDistance(snap.distance);
    session = null;
    const duration = (performance.now() - s.t0) / 1000;
    profileStore.recordRide({ ...snap, duration, runsCompleted: s.runs });
    if (rest > 0) profileStore.creditRun({ mapId: s.mapId, distance: rest, finished: false, equipment: s.equipment });
    const me = services.identity.current();
    let result = { rank: null, isNewBest: false }, trail = { rank: null, isNewBest: false };
    const entry = (mapId) => ({
      mapId, score: snap.score, distance: snap.distance, airTime: snap.airTotal,
      equipment: s.equipment, playerId: me.id, name: profileStore.profile.displayName,
    });
    try {
      result = await services.leaderboard.submit(entry(s.mapId));
      if (s.trailBoard && s.trailBoard !== s.mapId) trail = await services.leaderboard.submit(entry(s.trailBoard));
    } catch (e) { console.warn('[tracker] leaderboard submit failed', e); }
    const rec = { ...snap, runs: s.runs, duration, mapId: s.mapId, rank: result.rank, isNewBest: result.isNewBest,
      trailBoard: s.trailBoard, trailRank: trail.rank, trailNewBest: trail.isNewBest };
    emit('rideRecorded', rec);
    return rec;
  }
}
