// Lobby tab registry. A tab is a panel in the lobby with a button in the tab bar.
//
// registerLobbyTab({
//   id: 'equipment',            unique
//   label: 'Equipment',
//   order: 10,                  position in the tab bar
//   icon: '<svg…>',             optional inline SVG (24×24, currentColor)
//   status: 'ready' | 'soon',   'soon' shows a "coming soon" dot in the tab bar
//   shot: 'gear',               camera framing while the tab is open (lobby/config.js SHOTS)
//   mount(el, ctx) { … },       render into `el`; may return a cleanup function
//   unmount() { … },            optional; called when the tab closes (after the cleanup function)
//   onAction(action, ctx) {…},  optional gamepad hook ('alt', 'alt2', …); return true if handled
// })
//
// ctx (see Lobby.js): { profile, catalog, maps, services, stage, on, toast, ride, select, el }
// ctx.on(event, fn) subscribes to the state.js bus and is unsubscribed automatically on unmount.
import { emit } from '../state.js';

const tabs = new Map();

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
