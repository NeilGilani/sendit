// Cases tab: your unopened cases, the Open button (the CS:GO-style show in lobby/cases/opener.js),
// progress toward the next case, how cases are earned, your collection and each case's contents
// and odds. Everything is earned in game: no purchases, no keys (docs/rewards.md).
import { registerLobbyTab } from '../tabs.js';
import { esc, fmtKm } from './common.js';
import { caseArt } from '../cases/caseArt.js';
import { openCaseShow, cardHtml, openerActive } from '../cases/opener.js';
import { crateShow } from '../cases/crate3d.js';
import { prerasterReel } from '../cases/reelCanvas.js';
import { lastGains } from '../cases/notify.js';
import { caseSfx } from '../cases/sfx.js';
import { RARITIES, rarityOf } from '../../profile/rarity.js';
import { SERIES, SERIES_ORDER } from '../../profile/items.js';
import { CASE_XP, EARN, PITY, COLLECTION_BONUS, casePool, caseOdds, nextMilestone, skin } from '../../profile/rewards.js';

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M9 8V6a3 3 0 0 1 6 0v2M10 12v2h4v-2"/></svg>';
// The XP bar fills from where you last saw it (e.g. back from a ride), wrapping through 100 % for each
// case earned meanwhile.
let shown = null;   // { xp, earned } last rendered
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
    // "Open all": every case back to back with quick timing; it pauses on Classified and up.
    const openAll = () => {
      if (openerActive() || !ctx.profile.unopened.length) return;
      openCaseShow(ctx.profile.unopened[0].id, { chain: { pulls: [] }, onClose: () => render() });
    };
    debugGrant(ctx.profile);
    // Build the 3D crates and compile their shaders while the tab is open, so Open starts at once.
    // The reel card bitmaps of the cases you hold are drawn in idle time after that (~0.3 MB each on HiDPI).
    (globalThis.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => crateShow.prewarm().then(() => prerasterReel([...new Set(ctx.profile.unopened.map((c) => c.series))])), { timeout: 1500 });

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
            ${pick ? `<small>From: ${esc({ run: 'a finished run', distance: 'distance ridden', duplicate: 'duplicates', welcome: 'welcome gift', veteran: 'your riding so far', milestone: 'a milestone', rank: 'a new rank', collection: 'a finished collection' }[pick.source] || pick.source)}</small>` : ''}</div>
        </div>
        <button type="button" class="cs-open${pick ? ' pulse' : ''}" ${pick ? '' : 'disabled'} data-autofocus>
          ${pick ? `Open case <small>${cases.length > 1 ? `· ${cases.length} ready` : ''}</small>` : 'No case ready'}
        </button>
        ${cases.length > 1 ? `<button type="button" class="cs-all">Open all ${cases.length} <small>quick</small></button>` : ''}
        ${bySeries.length > 1 ? `<div class="cs-queue" role="group" aria-label="Case to open">${bySeries.map(([s, l]) => `
          <button type="button" class="cs-q${s === series ? ' on' : ''}" style="--sc:${SERIES[s].color}" data-pick="${esc(l[0].id)}">${esc(SERIES[s].name)} ×${l.length}</button>`).join('')}</div>` : ''}

        <div class="cs-prog">
          <div class="cs-prog-head"><span>Next case</span><b>${Math.floor(r.xp)} / ${CASE_XP} XP</b></div>
          <div class="cs-bar cs-xp"><i style="--v:${(shown && shown.earned === r.earned ? Math.min(shown.xp, r.xp) / CASE_XP : shown ? shown.xp / CASE_XP : r.xp / CASE_XP).toFixed(3)}"></i></div>
          <div class="cs-prog-head" style="margin-top:.3em"><span>${Math.ceil(left)} XP to go · about ${fmtKm((left / EARN.perKm) * 1000 * 0.55)} and ${Math.max(1, Math.round((left * 0.45) / EARN.finish))} runs</span></div>
          ${gains?.length ? `<ul class="cs-gains" aria-label="Last ride">${gains.slice(0, 5).map((g) => `<li><span>${esc(g.label)}</span><b>+${Math.round(g.xp)}</b></li>`).join('')}</ul>` : ''}
        </div>

        <h3 class="lp-h3">How to earn</h3>
        <div class="cs-ways">
          <span>Every km on skis or a board</span><b>+${EARN.perKm} XP</b>
          <span>Finish a run (reach the bottom, ${EARN.minRun} m or more)</span><b>+${EARN.finish} XP</b>
          <span>First finished run of the day</span><b>+${EARN.firstToday} XP</b>
          <span>Challenge medal bronze / silver / gold</span><b>+${EARN.medal.bronze} / ${EARN.medal.silver} / ${EARN.medal.gold}</b>
          <span>First run on each map · new trail</span><b>+${EARN.firstMap} · +${EARN.firstTrail}</b>
          <span>Next milestone: ${esc(ms.label)} (${fmtKm(Math.max(0, ms.m - r.distance))} to go)</span><b>+${ms.xp} XP</b>
          <span>Duplicates turn into progress</span><b>+10 % to a whole case</b>
          <span>Collect every skin of a case (gold not needed)</span><b>${COLLECTION_BONUS} cases</b>
          ${globalThis.__progression ? '<span>Every new rank (level 5, 10, 20, 35, 60)</span><b>a case</b>' : ''}
        </div>

        <h3 class="lp-h3">Collection</h3>
        <div class="cs-col">
          <span class="cs-ring" style="--p:${(col.pct * 100).toFixed(1)}">${Math.round(col.pct * 100)}%</span>
          <div class="cs-tiers">${RARITIES.map((t) => {
            const c = col.byRarity[t.id];
            return `<div class="cs-tier" style="--rc:${t.color}"><span>${esc(t.short)}</span><span class="cs-bar"><i style="--v:${c.total ? (c.owned / c.total).toFixed(3) : 0}"></i></span><b>${c.owned}/${c.total}</b></div>`;
          }).join('')}</div>
        </div>
        ${r.best ? (() => { const b = skin(r.best.key); const g = rarityOf(r.best.rarity); return b ? `<h3 class="lp-h3">Best pull</h3>
          <div class="cs-best" style="--rc:${g.color}">${cardHtml(r.best.key, r.best.rarity, { label: false })}<div><span>${esc(g.name)}</span><b>${esc(b.item.name)} | ${esc(b.variant.name)}</b><small>${r.opened} cases opened</small></div></div>` : ''; })() : ''}
        ${r.history.length ? `<h3 class="lp-h3">Recent pulls</h3><div class="cs-hist">${r.history.slice(-12).reverse().map((h) => cardHtml(h.key, h.rarity, { label: false })).join('')}</div>` : ''}

        <h3 class="lp-h3">Case contents and odds</h3>
        <div class="cs-queue">${SERIES_ORDER.map((s) => `<button type="button" class="cs-q${showSeries === s ? ' on' : ''}" style="--sc:${SERIES[s].color}" data-show="${s}" aria-expanded="${showSeries === s}">${esc(SERIES[s].name)} <small>${col.bySeries[s].owned}/${col.bySeries[s].total}</small></button>`).join('')}</div>
        ${showSeries ? contents(showSeries, P.profile) : ''}
        <p class="lp-hint">Bad-luck protection: if ${PITY - 1} cases in a row give nothing Covert or better, the next one is Covert (${Math.max(0, PITY - 1 - r.sinceRed)} to go).</p>
        <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> open a case</span><span class="g-kb">Odds are fixed and shown before you open. Cases are only earned by riding.</span></p>`;
      root.querySelector('.cs-open').addEventListener('click', () => { caseSfx.click(); open(); });
      root.querySelector('.cs-all')?.addEventListener('click', () => { caseSfx.click(); openAll(); });
      // Animate the bar: up to 100 % per case earned since last time, then to the current XP.
      const bar = root.querySelector('.cs-xp i');
      const wraps = shown ? Math.max(0, r.earned - shown.earned) : 0;
      shown = { xp: r.xp, earned: r.earned };
      if (bar) {
        let step = 0;
        const next = () => {
          if (!bar.isConnected) return;
          if (step < wraps) { bar.style.setProperty('--v', 1); step++; setTimeout(() => { bar.style.transition = 'none'; bar.style.setProperty('--v', 0); void bar.offsetWidth; bar.style.transition = ''; next(); }, 850); }
          else bar.style.setProperty('--v', (r.xp / CASE_XP).toFixed(3));
        };
        requestAnimationFrame(() => requestAnimationFrame(next));
      }
      // Clicking the case shows what is inside (as in CS:GO), like the contents chips below.
      const hero = root.querySelector('.cs-hero .cb');
      hero.style.cursor = 'pointer';
      hero.title = `${S.name}: contents and odds`;
      hero.addEventListener('click', () => { showSeries = series; render(); root.querySelector('.cs-odds')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { pickId = b.dataset.pick; caseSfx.click(); render(); }));
      root.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { showSeries = showSeries === b.dataset.show ? null : b.dataset.show; render(); root.querySelector(`[data-show="${b.dataset.show}"]`)?.focus(); }));
    };

    render();
    ctx.on('rewards', render);
    ctx.on('caseEarned', render);
    ctx.on('caseEarned', (e) => { if (crateShow.ready) prerasterReel([...new Set((e?.cases || []).map((c) => c?.series).filter(Boolean))]); });
    this._open = open;
  },

  onAction(action) {
    if (action !== 'alt2') return false;
    this._open?.();
    return true;
  },
});

/**
 * Debug only (docs/rewards.md): ?casegrant=N adds N test cases (rotating through the series) once per
 * page load; ?caseforce=<grade> adds one if you have none, so the forced opening can be tried at once.
 */
let granted = false;
function debugGrant(P) {
  if (granted) return;
  granted = true;
  let q;
  try { q = new URLSearchParams(location.search); } catch { return; }
  const n = Math.min(50, Number(q.get('casegrant')) || (q.has('caseforce') && !P.unopened.length ? 1 : 0));
  const series = q.get('caseseries');
  for (let i = 0; i < n; i++) P.grantCase('test', series && SERIES[series] ? series : SERIES_ORDER[i % SERIES_ORDER.length]);
}

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

