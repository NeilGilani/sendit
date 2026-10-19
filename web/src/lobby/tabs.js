// Lobby tab registry. A tab is a panel in the lobby. Tabs are grouped into a few top-level
// destinations (the big buttons in the top bar); a group with several tabs shows them as a sub-tab
// strip above its panel. Utility tabs (Friends, Settings) sit as icon buttons at the top right.
//
// registerLobbyTab({
//   id: 'equipment',            unique
//   label: 'Equipment',
//   order: 10,                  position (inside its group, and of the group when the tab is its own group)
//   icon: '<svg…>',             optional inline SVG (24×24, currentColor)
//   status: 'ready' | 'soon',   'soon' shows a "coming soon" dot
//   shot: 'gear',               camera framing while the tab is open (lobby/config.js SHOTS)
//   group: 'locker',            optional: the destination it belongs to (see registerLobbyGroup / NAV in
//                               lobby/config.js). No group → the tab is a destination of its own.
//   short: 'Gear',              optional: shorter label for the sub-tab strip
//   nav: 'main' | 'utility',    optional: 'utility' = an icon button at the top right instead of a destination
//   bare: false,                optional: no panel chrome (the Home screen)
//   mount(el, ctx) { … },       render into `el`; may return a cleanup function
//   unmount() { … },            optional; called when the tab closes (after the cleanup function)
//   onAction(action, ctx) {…},  optional gamepad hook ('alt', 'alt2', …); return true if handled
// })
//
// ctx (see Lobby.js): { profile, catalog, maps, services, stage, on, toast, ride, select, el }
// ctx.on(event, fn) subscribes to the state.js bus and is unsubscribed automatically on unmount.
//
// Badges: setLobbyBadge(tabId, n) puts a count on the tab (its sub-tab, its destination and any
// Home tile that shows it). 0 clears it.
import { emit } from '../state.js';

const tabs = new Map();
const groups = new Map();
const badges = new Map();

export function registerLobbyTab(def) {
  if (!def?.id || !def.label || typeof def.mount !== 'function') throw new Error('registerLobbyTab: id, label and mount() are required');
  tabs.set(def.id, { order: 100, status: 'ready', shot: 'full', icon: '', ...def });
  emit('lobbyTabs', { id: def.id });
  return tabs.get(def.id);
}

export function unregisterLobbyTab(id) {
  if (tabs.delete(id)) emit('lobbyTabs', { id });
}

export const getLobbyTab = (id) => tabs.get(id) ?? null;
export const listLobbyTabs = () => [...tabs.values()].sort((a, b) => a.order - b.order);

/** A destination in the top bar: { id, label, icon, order }. Tabs join it with `group: id`. */
export function registerLobbyGroup(def) {
  if (!def?.id || !def.label) throw new Error('registerLobbyGroup: id and label are required');
  groups.set(def.id, { order: 100, icon: '', ...def });
  emit('lobbyTabs', { group: def.id });
  return groups.get(def.id);
}
export const getLobbyGroup = (id) => groups.get(id) ?? null;
export const listLobbyGroups = () => [...groups.values()].sort((a, b) => a.order - b.order);

/** Count badge on a tab (unopened cases, new skins, …). */
export function setLobbyBadge(id, n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if ((badges.get(id) || 0) === v) return;
  if (v) badges.set(id, v); else badges.delete(id);
  emit('lobbyBadge', { id, n: v });
}
export const getLobbyBadge = (id) => badges.get(id) || 0;
