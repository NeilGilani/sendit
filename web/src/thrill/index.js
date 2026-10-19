// Thrill: the "why games hook" layer (docs/game-feel.md § 9). installThrill() is called once by main.js
// after juice; main.js calls thrill.input() before the world updates (true = a replay is playing: freeze
// the ride), thrill.update(dt) once per frame after the rig and camera, and thrill.replay.update(dt) while
// a replay plays.
//   retry.js       instant restart (R) and retry from the last take-off (Backspace / d-pad ▼)
//   spots.js       named spots and transfer gaps discovered per mountain
//   adrenaline.js  heartbeat + closing edges when exposed (cliff ahead, big air, top speed)
//   replay.js      instant replay of the last big trick from a drone, save as a clip
//   highlights.js  F / LB after a landed trick saves it to the lobby's Highlights (and the loading screens)
//   versus.js      "beat my run" challenge links with the friend's ghost
//   medals.js      "SO CLOSE · 0.42 s off SILVER" on the Challenge results card
import { settings, setSetting, game, Mode, on, emit } from '../state.js';
import { installRetry } from './retry.js';
import { installSpots } from './spots.js';
import { installAdrenaline } from './adrenaline.js';
import { installReplay } from './replay.js';
import { installHighlights } from './highlights.js';
import '../lobby/tabs/highlights.js';   // the lobby's Highlights tab (registers itself)
import { installVersus } from './versus.js';
import { installMedalLine } from './medals.js';

export function installThrill(o) {
  const { player, rider, cam, camera, sound, input, activities, ui, juice, scene, course, features, terrain, canvas, getMap, getName, params } = o;
  const hud = juice?.hud;
  const retry = installRetry({ player, input, activities, ui, cam });
  const spots = installSpots({ player, course, features, terrain, getMapId: () => getMap().mapId, hud, scene });
  const adrenaline = installAdrenaline({ player, terrain, sound });
  const replay = installReplay({ player, rider, camera, terrain, input, activities, cam, canvas });
  const highlights = installHighlights({ player, rider, terrain, input, activities, replay, getMap, getName });
  const versus = installVersus({ scene, course, player, activities, hud, getMap, getName, params });
  installMedalLine();
  mountThrillSettings();
  // The new keys, explained on the first two rides (after the game's own early hints).
  let hintT = 0;
  on('rideStarted', () => {
    clearTimeout(hintT);
    let n = 0;
    try { n = Number(localStorage.getItem('sendit.thrill.hints') || 0); } catch { /* private mode */ }
    if (n >= 2) return;
    hintT = setTimeout(() => {
      if (game.mode !== Mode.RIDING) return;
      emit('hint', input.usingPad ? 'Y restarts instantly · d-pad ▼ retries your last jump · d-pad ▲ replays it · LB saves it to your highlights' : 'R restarts instantly · Backspace retries your last jump · Tab replays it · F saves it to your highlights');
      try { localStorage.setItem('sendit.thrill.hints', String(n + 1)); } catch { /* private mode */ }
    }, 24000);
  });
  on('rideEnded', () => clearTimeout(hintT));
  // Tab is the replay key while riding: keep the browser from moving focus.
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => { if (e.code === 'Tab' && game.mode === Mode.RIDING) e.preventDefault(); });
  const thrill = {
    retry, spots, adrenaline, replay, versus, highlights,
    input: () => { highlights.input(); return replay.input(); },
    update(dt) {
      retry.update(dt);
      spots.update(dt);
      adrenaline.update(dt, versus.closeness());
      versus.update(dt);
      replay.record(dt);
    },
  };
  if (typeof window !== 'undefined') window.__thrill = thrill;
  return thrill;
}

/** Three rows in the shared settings grid (lobby Settings tab and pause menu). */
function mountThrillSettings() {
  const grid = typeof document !== 'undefined' && document.querySelector('#settings .grid');
  if (!grid || grid.querySelector('[data-key=thrillAdrenaline]')) return;
  const rows = document.createElement('template');
  rows.innerHTML = `
    <label for="set-thrillAdrenaline">Adrenaline cues (heartbeat near drops)</label><input id="set-thrillAdrenaline" type="checkbox" data-key="thrillAdrenaline" />
    <label for="set-thrillReplayPrompt">Replay prompt after big tricks</label><input id="set-thrillReplayPrompt" type="checkbox" data-key="thrillReplayPrompt" />
    <label for="set-thrillSpotMarkers">Mark undiscovered spots (?)</label><input id="set-thrillSpotMarkers" type="checkbox" data-key="thrillSpotMarkers" />`;
  const fs = grid.querySelector('label[for=set-fullscreen]');
  grid.insertBefore(rows.content, fs || null);
  for (const k of ['thrillAdrenaline', 'thrillReplayPrompt', 'thrillSpotMarkers']) {
    const el = grid.querySelector(`#set-${k}`);
    el.checked = settings[k] !== false;
    el.addEventListener('change', () => setSetting(k, el.checked));
  }
}
