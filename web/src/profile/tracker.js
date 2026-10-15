// Ride tracker: turns ride events on the bus into lifetime stats (profile) and leaderboard entries.
//
// Listens:  'rideStarted'                 → opens a session (map, equipment, start time)
//           'runComplete'                 → counts a finished lap
//           'rideEnded' { score, … }      → closes the session (main.js emits it when leaving a ride)
//           window 'pagehide'             → closes an open session so closing the tab mid-ride counts
// Emits:    'rideRecorded' { score, distance, airTotal, runs, mapId, rank, isNewBest }
import { on, emit, game, scoreSnapshot, Mode } from '../state.js';
import { profileStore } from './store.js';
import { services } from '../services/index.js';

export function installRideTracker({ getMapId }) {
  let session = null;

  on('rideStarted', () => {
    session = { t0: performance.now(), runs: 0, mapId: getMapId(), equipment: profileStore.equipment };
  });
  on('runComplete', () => { if (session) session.runs += 1; });
  on('rideEnded', (snap) => finish(snap || scoreSnapshot()));
  globalThis.addEventListener?.('pagehide', () => {
    if (session && game.mode !== Mode.MENU) finish(scoreSnapshot());
  });

  async function finish(snap) {
    const s = session;
    session = null;
    if (!s) return null;
    const duration = (performance.now() - s.t0) / 1000;
    profileStore.recordRide({ ...snap, duration, runsCompleted: s.runs });
    const me = services.identity.current();
    let result = { rank: null, isNewBest: false };
    try {
      result = await services.leaderboard.submit({
        mapId: s.mapId, score: snap.score, distance: snap.distance, airTime: snap.airTotal,
        equipment: s.equipment, playerId: me.id, name: profileStore.profile.displayName,
      });
    } catch (e) { console.warn('[tracker] leaderboard submit failed', e); }
    const rec = { ...snap, runs: s.runs, duration, mapId: s.mapId, rank: result.rank, isNewBest: result.isNewBest };
    emit('rideRecorded', rec);
    return rec;
  }
}
