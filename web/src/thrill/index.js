// Thrill: the "why games hook" layer (docs/game-feel.md § 9). installThrill() is called once by main.js
// after juice; main.js calls thrill.input() before the world updates (true = a replay is playing: freeze
// the ride), thrill.update(dt) once per frame after the rig and camera, and thrill.replay.update(dt) while
// a replay plays.
//   retry.js       instant restart (R) and retry from the last take-off (Backspace / d-pad ▼)
//   spots.js       named spots and transfer gaps discovered per mountain
//   adrenaline.js  heartbeat + closing edges when exposed (cliff ahead, big air, top speed)
//   replay.js      instant replay of the last big trick from a drone, save as a clip
//   versus.js      "beat my run" challenge links with the friend's ghost
import { settings, setSetting, game, Mode } from '../state.js';
import { installRetry } from './retry.js';
import { installSpots } from './spots.js';
import { installAdrenaline } from './adrenaline.js';
import { installReplay } from './replay.js';
import { installVersus } from './versus.js';

export function installThrill(o) {
  const { player, rider, cam, camera, sound, input, activities, ui, juice, scene, course, features, terrain, canvas, getMap, getName, params } = o;
  const hud = juice?.hud;
  const retry = installRetry({ player, input, activities, ui, cam });
  const spots = installSpots({ player, course, features, terrain, getMapId: () => getMap().mapId, hud });
  const adrenaline = installAdrenaline({ player, terrain, sound });
  const replay = installReplay({ player, rider, camera, terrain, input, activities, cam, canvas });
  const versus = installVersus({ scene, course, player, activities, hud, getMap, getName, params });
  mountThrillSettings();
  // Tab is the replay key while riding: keep the browser from moving focus.
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => { if (e.code === 'Tab' && game.mode === Mode.RIDING) e.preventDefault(); });
  const thrill = {
    retry, spots, adrenaline, replay, versus,
    input: () => replay.input(),
    update(dt) {
      retry.update(dt);
      adrenaline.update(dt);
      versus.update(dt);
      replay.record(dt);
    },
  };
  if (typeof window !== 'undefined') window.__thrill = thrill;
  return thrill;
}

/** Two rows in the shared settings grid (lobby Settings tab and pause menu). */
function mountThrillSettings() {
  const grid = typeof document !== 'undefined' && document.querySelector('#settings .grid');
  if (!grid || grid.querySelector('[data-key=thrillAdrenaline]')) return;
  const rows = document.createElement('template');
  rows.innerHTML = `
    <label for="set-thrillAdrenaline">Adrenaline cues (heartbeat near drops)</label><input id="set-thrillAdrenaline" type="checkbox" data-key="thrillAdrenaline" />
    <label for="set-thrillReplayPrompt">Replay prompt after big tricks</label><input id="set-thrillReplayPrompt" type="checkbox" data-key="thrillReplayPrompt" />`;
  const fs = grid.querySelector('label[for=set-fullscreen]');
  grid.insertBefore(rows.content, fs || null);
  for (const k of ['thrillAdrenaline', 'thrillReplayPrompt']) {
    const el = grid.querySelector(`#set-${k}`);
    el.checked = settings[k] !== false;
    el.addEventListener('change', () => setSetting(k, el.checked));
  }
}
