// Service locator. Gameplay and UI code use `services.<name>` and never construct backends.
//
//   services.network      NetworkService      (default NullNetworkService — offline)
//   services.leaderboard  LeaderboardService  (default LocalLeaderboard — this browser)
//   services.identity     IdentityService     (default LocalIdentityService — guest)
//
// Swap one in at startup (before the lobby mounts) or at runtime:
//   import { provideService } from './services/index.js';
//   provideService('leaderboard', new MyCloudLeaderboard(apiUrl));
// Listeners get a 'service' event { name, impl } on the state.js bus.
import { emit } from '../state.js';
import { NullNetworkService } from './network.js';
import { LocalLeaderboard } from './leaderboard.js';
import { LocalIdentityService } from './identity.js';

export const services = {
  network: new NullNetworkService(),
  leaderboard: new LocalLeaderboard(),
  identity: new LocalIdentityService(),
};

export function provideService(name, impl) {
  if (!(name in services)) console.warn(`[services] registering new service "${name}"`);
  services[name] = impl;
  emit('service', { name, impl });
  return impl;
}

export const getService = (name) => services[name];
