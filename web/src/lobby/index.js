// Lobby entry point: registers the built-in tabs and re-exports the public API.
// Add a tab: create lobby/tabs/<name>.js calling registerLobbyTab({...}) and import it below
// (or import it from anywhere before the lobby is shown — the tab bar updates live).
import './tabs/equipment.js';
import './tabs/cases.js';
import './tabs/locker.js';      // replaces the old free colourway picker (a Character tab) now that skins are earned
import './tabs/maps.js';
import './tabs/multiplayer.js';
import './tabs/leaderboards.js';
import './tabs/profile.js';
import './tabs/settings.js';

import { installCaseNotifications } from './cases/notify.js';

installCaseNotifications();

export { Lobby } from './Lobby.js';
export { LobbyStage } from './stage.js';
export { registerLobbyTab, unregisterLobbyTab, listLobbyTabs, getLobbyTab } from './tabs.js';
export { applyEquipment, riderSupportsEquipment } from './equipmentBridge.js';
