// Identity / auth service interface and the local guest implementation.
//
// The profile (profile/store.js) is keyed by the identity id. A real account system implements
// IdentityService (sign-in with a provider, tokens for the network/leaderboard services) and is
// installed with provideService('identity', impl).

import { storage } from './storage.js';

/** @abstract */
export class IdentityService {
  /** { id, displayName, provider: 'local' | …, isGuest } */
  current() { throw new Error('not implemented'); }
  /** Providers the UI may offer, e.g. ['google', 'discord']. Empty → sign-in hidden. */
  get providers() { return []; }
  async signIn(_provider) { throw new Error('not implemented'); }
  async signOut() {}
  /** Auth token for backends, or null when signed out. */
  async getToken() { return null; }
  /** Subscribe to identity changes; returns an unsubscribe function. */
  onChange(_fn) { return () => {}; }
}

const KEY = 'sendit.identity';

/** A persistent anonymous guest id for this browser. No accounts, no network. */
export class LocalIdentityService extends IdentityService {
  constructor(store = storage) {
    super();
    let me = store.get(KEY);
    if (!me?.id) {
      me = { id: `guest-${uuid()}`, createdAt: Date.now() };
      store.set(KEY, me);
    }
    this.me = me;
  }

  current() { return { id: this.me.id, displayName: 'Guest', provider: 'local', isGuest: true }; }
  async signIn() { throw new Error('Accounts are coming soon.'); }
}

function uuid() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}
