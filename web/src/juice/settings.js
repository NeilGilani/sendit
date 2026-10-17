// Juice settings rows, added to the game's settings grid (#settings .grid, which the lobby's Settings
// tab and the pause menu share): screen shake amount, hit-stop / slow motion, speed rush effect.
// Stored with the other settings (state.js setSetting): juiceShake (0..1), juiceHitstop, juiceSpeedFx.
import { settings, setSetting } from '../state.js';

export function mountJuiceSettings() {
  const grid = typeof document !== 'undefined' && document.querySelector('#settings .grid');
  if (!grid || grid.querySelector('[data-key=juiceShake]')) return;
  const rows = document.createElement('template');
  rows.innerHTML = `
    <label for="set-juiceShake">Screen shake &amp; punch</label><input id="set-juiceShake" type="range" min="0" max="1" step="0.05" data-key="juiceShake" />
    <label for="set-juiceHitstop">Hit-stop &amp; slow motion</label><input id="set-juiceHitstop" type="checkbox" data-key="juiceHitstop" />
    <label for="set-juiceSpeedFx">Speed rush effect</label><input id="set-juiceSpeedFx" type="checkbox" data-key="juiceSpeedFx" />`;
  // Before the fullscreen row, so the last rows stay the window controls.
  const fs = grid.querySelector('label[for=set-fullscreen]');
  grid.insertBefore(rows.content, fs || null);
  const shake = grid.querySelector('#set-juiceShake');
  shake.value = settings.juiceShake ?? 1;
  shake.addEventListener('input', () => setSetting('juiceShake', Number(shake.value)));
  for (const k of ['juiceHitstop', 'juiceSpeedFx']) {
    const el = grid.querySelector(`#set-${k}`);
    el.checked = settings[k] !== false;
    el.addEventListener('change', () => setSetting(k, el.checked));
  }
}
