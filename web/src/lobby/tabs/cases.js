// Cases tab: your unopened cases, the Open button (the CS:GO-style show in lobby/cases/opener.js),
// progress toward the next case, how cases are earned, your collection and each case's contents
// and odds. Everything is earned in game: no purchases, no keys (docs/rewards.md).
import { registerLobbyTab } from '../tabs.js';
import { esc, fmtKm } from './common.js';
import { caseArt } from '../cases/caseArt.js';
import { openCaseShow, cardHtml, openerActive } from '../cases/opener.js';
import { lastGains } from '../cases/notify.js';
import { caseSfx } from '../cases/sfx.js';
import { RARITIES } from '../../profile/rarity.js';
import { SERIES, SERIES_ORDER } from '../../profile/items.js';
import { CASE_XP, EARN, PITY, casePool, caseOdds, nextMilestone } from '../../profile/rewards.js';

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M9 8V6a3 3 0 0 1 6 0v2M10 12v2h4v-2"/></svg>';
const pct = (v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

registerLobbyTab({
  id: 'cases',
  label: 'Cases',
  order: 15,
  icon: ICON,
  status: 'ready',
  shot: 'full',

  mount(el, ctx) {
    let showSeries = null;     // contents panel open for this series
    let pickId = null;         // the case the Open button opens
    el.innerHTML = '<div class="cs-root"></div>';
    const root = el.firstChild;

    const open = () => {
      if (openerActive()) return;
      const id = pickId && ctx.profile.unopened.some((c) => c.id === pickId) ? pickId : ctx.profile.unopened[0]?.id;
      if (!id) return;
      openCaseShow(id, { onClose: () => render() });
    };

    const render = () => {
      const P = ctx.profile;
      const cases = P.unopened;
      const r = P.rewards;
      if (!cases.some((c) => c.id === pickId)) pickId = cases[0]?.id ?? null;
      const pick = cases.find((c) => c.id === pickId);
      const series = pick?.series ?? SERIES_ORDER[r.earned % SERIES_ORDER.length];
      const S = SERIES[series];
      const left = CASE_XP - r.xp;
      const ms = nextMilestone(r);
      const col = P.collection();
      const gains = lastGains();
      const bySeries = SERIES_ORDER.map((s) => [s, cases.filter((c) => c.series === s)]).filter(([, l]) => l.length);
      root.innerHTML = `
        <h2 class="lp-title">Cases ${cases.length ? `<span class="lp-pill" style="background:#ffe36a">${cases.length} ready</span>` : ''}</h2>
        <p class="lp-sub">Earn cases by riding. Open them for clothing and gear. ${cases.length ? '' : 'No cases yet: finish a run or ride a few km.'}</p>
        <div class="cs-hero${pick ? '' : ' empty'}">
          ${caseArt(series, { count: pick ? cases.filter((c) => c.series === series).length : 0 })}
          <div class="cs-hero-text"><b>${esc(S.name)}</b><small>${esc(S.blurb)}</small>
            ${pick ? `<small>From: ${esc({ run: 'a finished run', distance: 'distance ridden', duplicate: 'duplicates', welcome: 'welcome gift', veteran: 'your riding so far', milestone: 'a milestone' }[pick.source] || pick.source)}</small>` : ''}</div>
        </div>
        <button type="button" class="cs-open${pick ? ' pulse' : ''}" ${pick ? '' : 'disabled'} data-autofocus>
          ${pick ? `Open case <small>${cases.length > 1 ? `· ${cases.length} ready` : ''}</small>` : 'No case ready'}
        </button>
        ${bySeries.length > 1 ? `<div class="cs-queue" role="group" aria-label="Case to open">${bySeries.map(([s, l]) => `
          <button type="button" class="cs-q${s === series ? ' on' : ''}" style="--sc:${SERIES[s].color}" data-pick="${esc(l[0].id)}">${esc(SERIES[s].name)} ×${l.length}</button>`).join('')}</div>` : ''}

        <div class="cs-prog">
          <div class="cs-prog-head"><span>Next case</span><b>${Math.floor(r.xp)} / ${CASE_XP} XP</b></div>
          <div class="cs-bar"><i style="--v:${(r.xp / CASE_XP).toFixed(3)}"></i></div>
          <div class="cs-prog-head" style="margin-top:.3em"><span>${Math.ceil(left)} XP to go · about ${fmtKm((left / EARN.perKm) * 1000 * 0.55)} and ${Math.max(1, Math.round((left * 0.45) / EARN.finish))} runs</span></div>
          ${gains?.length ? `<ul class="cs-gains" aria-label="Last ride">${gains.slice(0, 5).map((g) => `<li><span>${esc(g.label)}</span><b>+${Math.round(g.xp)}</b></li>`).join('')}</ul>` : ''}
        </div>

        <h3 class="lp-h3">How to earn</h3>
        <div class="cs-ways">
          <span>Every km on skis or a board</span><b>+${EARN.perKm} XP</b>
          <span>Finish a run (reach the bottom)</span><b>+${EARN.finish} XP</b>
          <span>Challenge medal bronze / silver / gold</span><b>+${EARN.medal.bronze} / ${EARN.medal.silver} / ${EARN.medal.gold}</b>
          <span>First run on each map · new trail</span><b>+${EARN.firstMap} · +${EARN.firstTrail}</b>
          <span>Next milestone: ${esc(ms.label)} (${fmtKm(Math.max(0, ms.m - r.distance))} to go)</span><b>+${ms.xp} XP</b>
          <span>Duplicates turn into progress</span><b>+10 % to a whole case</b>
        </div>

        <h3 class="lp-h3">Collection</h3>
        <div class="cs-col">
          <span class="cs-ring" style="--p:${(col.pct * 100).toFixed(1)}">${Math.round(col.pct * 100)}%</span>
          <div class="cs-tiers">${RARITIES.map((t) => {
            const c = col.byRarity[t.id];
            return `<div class="cs-tier" style="--rc:${t.color}"><span>${esc(t.short)}</span><span class="cs-bar"><i style="--v:${c.total ? (c.owned / c.total).toFixed(3) : 0}"></i></span><b>${c.owned}/${c.total}</b></div>`;
          }).join('')}</div>
        </div>
        ${r.history.length ? `<h3 class="lp-h3">Recent pulls</h3><div class="cs-hist">${r.history.slice(-12).reverse().map((h) => cardHtml(h.key, h.rarity, { label: false })).join('')}</div>` : ''}

        <h3 class="lp-h3">Case contents and odds</h3>
        <div class="cs-queue">${SERIES_ORDER.map((s) => `<button type="button" class="cs-q${showSeries === s ? ' on' : ''}" style="--sc:${SERIES[s].color}" data-show="${s}" aria-expanded="${showSeries === s}">${esc(SERIES[s].name)}</button>`).join('')}</div>
        ${showSeries ? contents(showSeries, P.profile) : ''}
        <p class="lp-hint">Bad-luck protection: if ${PITY - 1} cases in a row give nothing Covert or better, the next one is Covert (${Math.max(0, PITY - 1 - r.sinceRed)} to go).</p>
        <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> open a case</span><span class="g-kb">Odds are fixed and shown before you open. Cases are only earned by riding.</span></p>`;
      root.querySelector('.cs-open').addEventListener('click', () => { caseSfx.click(); open(); });
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { pickId = b.dataset.pick; caseSfx.click(); render(); }));
      root.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { showSeries = showSeries === b.dataset.show ? null : b.dataset.show; render(); root.querySelector(`[data-show="${b.dataset.show}"]`)?.focus(); }));
    };

    render();
    ctx.on('rewards', render);
    ctx.on('caseEarned', render);
    this._open = open;
  },

  onAction(action) {
    if (action !== 'alt2') return false;
    this._open?.();
    return true;
  },
});

/** The contents panel: odds by grade, then every skin in the case (owned ones ticked). */
function contents(series, profile) {
  const pool = casePool(series);
  const odds = caseOdds(series);
  const own = (k) => !!profile.inventory.items[k];
  return `<div class="cs-odds">
    ${RARITIES.map((t) => `<div class="cs-odds-row" style="--rc:${t.color}"><b>${esc(t.name)}${t.id === 'gold' ? ' ★' : ''}</b><span>${pct(odds[t.id])} % · ${pool[t.id].length} item${pool[t.id].length === 1 ? '' : 's'}</span></div>`).join('')}
  </div>
  ${RARITIES.slice().reverse().map((t) => {
    if (t.id === 'gold') return `<h3 class="lp-h3" style="color:${t.color}">★ Exceedingly rare special item</h3><div class="cs-grid">${cardHtml(null, 'gold')}</div>
      <p class="lp-hint">One of ${pool.gold.length} legendary skis and snowboards: ${pool.gold.map((e) => esc(`${e.item.name} | ${e.variant.name}`)).join(', ')}.</p>`;
    return `<h3 class="lp-h3" style="color:${t.color}">${esc(t.name)} · ${pct(odds[t.id] / Math.max(1, pool[t.id].length))} % each</h3>
      <div class="cs-grid">${pool[t.id].map((e) => cardHtml(e.key, t.id).replace('class="cr-card', `class="cr-card${own(e.key) ? ' owned' : ''}`)).join('')}</div>`;
  }).join('')}`;
}

