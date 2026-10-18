// Next-medal line on the Challenge results card (Trackmania's "-0.42 to gold", the near miss that sells the
// retry): "SO CLOSE · 0.42 s off SILVER" pulsing when within THRILL.medal.close, else "NEXT · silver in
// 12.3 s less" as a plain goal. Gold runs (and judged runs) show nothing extra.
import { on, emit } from '../state.js';
import { THRILL, nextMedalGap } from './core.js';

export function installMedalLine() {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = `.res-rows .thrill-close{color:#ffe14d;animation:thrillClose 0.9s ease-in-out infinite alternate}
    @keyframes thrillClose{from{opacity:.65}to{opacity:1;text-shadow:0 0 12px rgba(255,225,77,.6)}}`;
  document.head.appendChild(st);
  on('runFinished', (res) => {
    if (!res || res.judged || !res.targets) return;
    const g = nextMedalGap(res.time, res.targets, THRILL.medal);
    if (!g) return;
    setTimeout(() => {
      const rows = document.getElementById('resRows');
      if (!rows || rows.querySelector('.thrill-next')) return;
      const name = g.medal.toUpperCase();
      rows.insertAdjacentHTML('beforeend', g.close
        ? `<div class="k thrill-next thrill-close">SO CLOSE</div><div class="v thrill-close">${g.gap.toFixed(2)} s off ${name}</div>`
        : `<div class="k thrill-next">Next medal</div><div class="v">${name} · ${g.gap.toFixed(1)} s faster</div>`);
      emit('thrillNextMedal', g);
    }, 960);
  });
}
