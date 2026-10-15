// Multiplayer / network service interface and the offline (null) implementation.
//
// Gameplay and UI only talk to `services.network` (services/index.js). A real backend
// (WebSocket, WebRTC, a hosted lobby service…) implements NetworkService and is installed with
// provideService('network', impl) — nothing else changes.
//
// Events (subscribe with on(name, fn) → unsubscribe):
//   'status'     { status }                    'offline' | 'connecting' | 'online'
//   'peerJoined' { peer }   'peerLeft' { peerId }   'peerState' { peerId, state }   'message' { from, data }

/** @abstract */
export class NetworkService {
  /** 'offline' | 'connecting' | 'online' */
  get status() { return 'offline'; }
  /** True when a backend exists at all (false → UI shows "coming soon"). */
  get available() { return false; }
  /** Human readable line for the UI. */
  get statusText() { return this.status; }
  /** Connect as `identity` ({ id, displayName }). Resolves { ok, reason? }. */
  async connect(_identity) { throw new Error('not implemented'); }
  async disconnect() {}
  /** Open sessions for a map: [{ id, mapId, host, players, maxPlayers }]. */
  async listSessions(_filter = {}) { return []; }
  async createSession(_opts) { throw new Error('not implemented'); }
  async joinSession(_id) { throw new Error('not implemented'); }
  async leaveSession() {}
  /** Broadcast the local rider's state (position, heading, pose…) — called per network tick. */
  sendState(_state) {}
  /** Subscribe to an event; returns an unsubscribe function. */
  on(_event, _fn) { return () => {}; }
}

/** No backend: always offline, every request fails politely, nothing is sent. */
export class NullNetworkService extends NetworkService {
  get statusText() { return 'Offline'; }
  async connect() { return { ok: false, reason: 'Multiplayer is not available yet.' }; }
  async createSession() { throw new Error('Multiplayer is not available yet.'); }
  async joinSession() { throw new Error('Multiplayer is not available yet.'); }
}
