// Leaderboard service interface and the local (this browser only) implementation.
//
// A global leaderboard implements LeaderboardService and is installed with
// provideService('leaderboard', impl). Entries are plain objects:
//   { score, distance, airTime, equipment, mapId, playerId, name, at }

import { storage } from './storage.js';

/** @abstract */
export class LeaderboardService {
  /** 'local' | 'global' — shown in the UI. */
  get scope() { return 'local'; }
  /** Record a finished ride. Resolves { rank (1-based or null), isNewBest, best }. */
  async submit(_entry) { throw new Error('not implemented'); }
  /** Best entries for a map, highest score first. */
  async getTop(_mapId, _opts = { limit: 10 }) { return []; }
  /** The local player's best entry for a map, or null. */
  async getPersonalBest(_mapId) { return null; }
}

const KEY = 'sendit.leaderboard';
const VERSION = 1;
const KEEP = 20;   // entries kept per map

/** Best scores stored in this browser, per map. */
export class LocalLeaderboard extends LeaderboardService {
  constructor(store = storage) {
    super();
    this.store = store;
  }

  get scope() { return 'local'; }

  read() {
    const d = this.store.get(KEY);
    return d && d.version === VERSION && d.maps ? d : { version: VERSION, maps: {} };
  }

  async submit(entry) {
    const score = Math.round(Number(entry.score) || 0);
    if (!entry.mapId || score <= 0) return { rank: null, isNewBest: false, best: await this.getPersonalBest(entry.mapId) };
    const d = this.read();
    const list = d.maps[entry.mapId] || [];
    const prevBest = list[0]?.score ?? 0;
    const row = {
      score, mapId: entry.mapId,
      distance: Math.round(entry.distance || 0), airTime: +(entry.airTime || 0).toFixed(1),
      equipment: entry.equipment || 'skis', playerId: entry.playerId || null, name: entry.name || 'Rider',
      at: entry.at || Date.now(),
    };
    list.push(row);
    list.sort((a, b) => b.score - a.score || a.at - b.at);
    d.maps[entry.mapId] = list.slice(0, KEEP);
    this.store.set(KEY, d);
    const idx = d.maps[entry.mapId].indexOf(row);
    return { rank: idx >= 0 ? idx + 1 : null, isNewBest: score > prevBest, best: d.maps[entry.mapId][0] };
  }

  async getTop(mapId, { limit = 10 } = {}) {
    return (this.read().maps[mapId] || []).slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
  }

  async getPersonalBest(mapId) {
    return this.read().maps[mapId]?.[0] ?? null;
  }
}
