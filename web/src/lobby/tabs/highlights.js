// Highlights tab: the tricks you saved with F / LB while riding (thrill/highlights.js, docs/game-feel.md § 8g).
// A gallery of cards (thumbnail, trick, points, mountain, date) with play, favourite, download video and
// delete. Play opens a full-screen player: the loading scene's worker replaying the trick on its own snow
// with the hero cameras (loading/clipview.js); thumbnails are rendered the same way, once, and kept.
// Self-contained: its CSS is the CSS string below, on the lobby's shared tokens (docs/lobby.md "Design system").
import { registerLobbyTab, setLobbyBadge } from '../tabs.js';
import { removeClip, setFavourite, setThumb, syncIndex, readIndex, getClipMeta, HIGHLIGHTS } from '../../thrill/clipstore.js';
import { ICONS } from '../icons.js';
import { on } from '../../state.js';
import { playClip, renderThumb, canPlayClips } from '../../loading/clipview.js';
import { assetUrl } from '../../base.js';

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor"/></svg>',
  starO: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const fmtPts = (p) => (p ? `${Math.round(p).toLocaleString()} pts` : '');
const mapArt = (id) => (id && /^[a-z0-9-]+$/.test(id) ? assetUrl(`maps/${id}.webp`) : '');

const STYLE = `
#lobby .hl-head { display: flex; align-items: baseline; gap: 0.8em; flex-wrap: wrap; }
#lobby .hl-count { font: 500 0.72em/1 var(--font-mono); letter-spacing: 0.06em; color: var(--c-snow-3); }
#lobby .hl-seg { display: inline-flex; margin: 0.2em 0 0.9em; border: 1px solid var(--c-line-2); border-radius: var(--r1); }
#lobby .hl-seg button { padding: 0.45em 0.9em; background: transparent; border: 0; border-radius: 0; color: var(--c-snow-2); font-size: 0.74em; letter-spacing: 0.12em; cursor: pointer; }
#lobby .hl-seg button.on { background: var(--c-snow); color: var(--c-paper-ink); box-shadow: inset 0 -3px 0 var(--c-signal); }
#lobby .hl-grid { display: flex; flex-direction: column; gap: 0.55em; }
#lobby .hl-grid { padding-bottom: var(--lip, 4px); }
#lobby .hl-card { position: relative; display: grid; grid-template-columns: minmax(8.5em, 44%) 1fr; grid-template-rows: 1fr auto; background: var(--c-ink-2); border: 1px solid var(--c-line);
  border-top-color: var(--c-line-2); border-radius: var(--r2); overflow: hidden; box-shadow: 0 var(--lip, 4px) 0 var(--c-ink-lip, #04080c); }
#lobby .hl-card .hl-thumb { grid-row: 1 / 3; height: 100%; min-height: 5.6em; aspect-ratio: auto; }
#lobby .hl-card:hover { background: var(--c-ink-3); }
#lobby .hl-card.fav { box-shadow: inset 3px 0 0 var(--c-gold); }
#lobby .hl-thumb { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; padding: 0; border: 0; border-radius: 0; cursor: pointer;
  background: var(--c-night) var(--art, none) center / cover no-repeat; overflow: hidden; }
#lobby .hl-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .5s; }
#lobby .hl-thumb img.on { opacity: 1; }
#lobby .hl-thumb::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,18,26,0) 55%, rgba(10,18,26,.75)); }
#lobby .hl-thumb .pl { position: absolute; z-index: 1; left: 0.55em; bottom: 0.6em; display: flex; align-items: center; justify-content: center; width: 2.1em; height: 2.1em;
  color: var(--c-paper-ink); background: var(--c-snow); border-radius: var(--r2); box-shadow: 0 3px 0 var(--c-snow-lip, #9aabbb); transition: transform var(--t1, .11s); }
#lobby .hl-thumb:hover .pl { transform: translateY(-2px); }
#lobby .hl-thumb .pl svg { width: 1.1em; height: 1.1em; }
#lobby .hl-thumb:hover .pl, #lobby .hl-thumb:focus-visible .pl { background: var(--c-signal); box-shadow: 0 3px 0 var(--c-signal-lip, #a8360c); }
#lobby .hl-thumb .len { position: absolute; z-index: 1; right: 0.55em; bottom: 0.65em; font: 600 0.66em/1 var(--font-mono); color: var(--c-snow); letter-spacing: 0.06em; }
#lobby .hl-thumb .gen { position: absolute; z-index: 1; left: 0.6em; top: 0.55em; font: 500 0.6em/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-snow-2); }
#lobby .hl-thumb .new { position: absolute; z-index: 1; right: 0.5em; top: 0.5em; font: 600 0.58em/1 var(--font-mono); letter-spacing: 0.1em; padding: 0.35em 0.5em; color: #fff; background: var(--c-alert); border-radius: var(--r1); }
#lobby .hl-body { padding: 0.6em 0.7em 0.65em; min-width: 0; }
#lobby .hl-trick { font-weight: 800; font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.01em; font-size: 1.15em; line-height: 1.05; color: var(--c-snow);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#lobby .hl-meta { margin-top: 0.35em; font: 500 0.68em/1.35 var(--font-mono); color: var(--c-snow-3); letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#lobby .hl-meta b { color: var(--c-ice); font-weight: 600; }
#lobby .hl-acts { display: flex; gap: 0.3em; padding: 0 0.6em 0.55em 0.7em; }
#lobby .hl-acts button { display: inline-flex; align-items: center; justify-content: center; width: 2.1em; height: 2.1em; padding: 0; background: var(--c-ink-3);
  border: 1px solid var(--c-line-2); border-radius: var(--r2); color: var(--c-snow-2); cursor: pointer; box-shadow: 0 3px 0 var(--c-ink-lip, #04080c);
  transition: transform var(--t1, .11s), box-shadow var(--t1, .11s), color var(--t1, .11s); }
#lobby .hl-acts button:hover { transform: translateY(-2px); box-shadow: 0 5px 0 var(--c-ink-lip, #04080c); }
#lobby .hl-acts button:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-ink-lip, #04080c); transition-duration: 40ms; }
#lobby .hl-acts { padding-bottom: calc(0.55em + 3px) !important; }
#lobby .hl-acts button svg { width: 1.05em; height: 1.05em; }
#lobby .hl-acts button:hover { color: var(--c-snow); border-color: var(--c-line-2); }
#lobby .hl-acts button.fav.on { color: var(--c-gold); border-color: var(--c-gold); }
#lobby .hl-acts .sp { flex: 1; }
#lobby .hl-acts button.del.ask { width: auto; padding: 0 0.6em; color: #fff; background: var(--c-alert); border-color: var(--c-alert); font-size: 0.7em; letter-spacing: 0.1em; }
#lobby .hl-empty { padding: 1.4em 1.2em 1.3em; border: 1px dashed var(--c-line-2); border-radius: var(--r1); color: var(--c-snow-2); }
#lobby .hl-empty h3 { margin: 0 0 0.45em; font-weight: 800; font-stretch: 75%; text-transform: uppercase; font-size: 1.3em; color: var(--c-snow); letter-spacing: 0.01em; }
#lobby .hl-empty p { margin: 0.4em 0; line-height: 1.45; font-size: 0.92em; }
#lobby .hl-demo { display: inline-flex; align-items: center; gap: 0.55em; margin: 0.6em 0 0.3em; padding: 0.5em 0.8em 0.5em 0.9em; background: rgba(10,18,26,.86);
  border: 1px solid var(--c-line-2); border-radius: var(--r1); box-shadow: inset 3px 0 0 var(--c-signal); font-weight: 700; font-size: 0.78em; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-snow); }
#lobby .hl-demo i { width: 0.6em; height: 0.6em; background: var(--c-signal); transform: rotate(45deg); }
#lobby .hl-foot { margin-top: 0.9em; font-size: 0.8em; color: var(--c-snow-3); line-height: 1.45; }
/* Home tile (lobby/tabs/home.js "homeTiles") */
#lobby .hm-hl { grid-template-columns: 5.6em 1fr auto; align-items: center; gap: 0.85em; padding: 0.6em 0.85em 0.65em 0.6em; }
#lobby .hm-hl-pic { position: relative; width: 5.6em; aspect-ratio: 16 / 10; border-radius: var(--r1); overflow: hidden; background: var(--c-night) var(--art, none) center / cover no-repeat; }
#lobby .hm-hl-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .4s; }
#lobby .hm-hl-pic img.on { opacity: 1; }
#lobby .hm-hl-pic i { position: absolute; left: 0.3em; bottom: 0.3em; width: 1.35em; height: 1.35em; display: grid; place-items: center; color: var(--c-paper-ink); background: var(--c-snow); border-radius: var(--r1); }
#lobby .hm-hl-pic i svg { width: 0.8em; height: 0.8em; }
#lobby .hm-hl:hover .hm-hl-pic i { background: var(--c-signal); }
#lobby .hm-hl-t { display: flex; flex-direction: column; min-width: 0; line-height: 1; }
#lobby .hm-hl-t small { font: 600 0.62em/1 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-signal-2); }
#lobby .hm-hl-t b { margin-top: 0.25em; font-size: 1.3em; font-weight: 900; font-stretch: 70%; text-transform: uppercase; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#lobby .hm-hl-t em { margin-top: 0.35em; font: 500 0.64em/1.2 var(--font-mono); font-style: normal; color: var(--c-snow-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hl-player { position: fixed; inset: 0; z-index: 60; background: #05090d; display: flex; flex-direction: column; font-family: var(--font); color: var(--c-snow); }
#hl-player canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#hl-player .bar { position: absolute; left: 0; right: 0; height: 8vh; background: #000; pointer-events: none; }
#hl-player .bar.t { top: 0; } #hl-player .bar.b { bottom: 0; }
#hl-player .top { position: absolute; top: calc(8vh + 16px); left: clamp(16px, 3vw, 44px); right: clamp(16px, 3vw, 44px); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; pointer-events: none; }
#hl-player .cap small { display: flex; align-items: center; gap: 8px; font: 600 11px/1 var(--font); letter-spacing: .18em; text-transform: uppercase; color: var(--c-signal-2); }
#hl-player .cap small i { width: 8px; height: 8px; background: var(--c-signal); transform: rotate(45deg); }
#hl-player .cap b { display: block; margin-top: 6px; font-weight: 900; font-stretch: 72%; font-size: clamp(26px, 3.4vw, 44px); line-height: .95; text-transform: uppercase; letter-spacing: .01em; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
#hl-player .cap span { display: block; margin-top: 8px; font: 500 12px/1.3 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(242,244,241,.78); text-shadow: 0 1px 10px rgba(0,0,0,.6); }
#hl-player .camname { font: 500 11px/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: rgba(242,244,241,.7); text-align: right; }
#hl-player .ctrl { position: absolute; left: 50%; bottom: calc(8vh + 18px); transform: translateX(-50%); display: flex; gap: 8px; }
#hl-player .ctrl button { display: inline-flex; align-items: center; gap: 8px; padding: 9px 13px; background: var(--c-ink-2); border: 1px solid var(--c-line-2); border-radius: var(--r2);
  color: var(--c-snow); font-size: 12px; letter-spacing: .12em; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 0 var(--c-ink-lip, #04080c);
  transition: transform .11s, box-shadow .11s; }
#hl-player .ctrl button:hover { transform: translateY(-2px); box-shadow: 0 6px 0 var(--c-ink-lip, #04080c); }
#hl-player .ctrl button:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--c-ink-lip, #04080c); transition-duration: 40ms; }
#hl-player .ctrl button svg { width: 15px; height: 15px; }
#hl-player .ctrl button:hover, #hl-player .ctrl button:focus-visible { border-color: var(--c-snow); outline: none; }
#hl-player .ctrl button:focus-visible { box-shadow: 0 4px 0 var(--c-ink-lip, #04080c), 0 0 0 5px rgba(255, 90, 31, 0.55); }
#hl-player .ctrl button.on { color: var(--c-gold); }
#hl-player .ctrl button.rec { color: #fff; background: var(--c-alert); border-color: var(--c-alert); }
#hl-player .ctrl kbd { font: 500 10px/1 var(--font-mono); padding: 3px 5px; border: 1px solid var(--c-line-2); border-radius: var(--r1); color: var(--c-snow-2); }
#hl-player .wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #05090d var(--art, none) center / cover no-repeat; transition: opacity .8s; }
#hl-player .wait span { padding: 8px 14px; background: rgba(10,18,26,.85); font: 500 12px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--c-snow-2); border-radius: var(--r1); }
#hl-player .wait.off { opacity: 0; pointer-events: none; }
@media (max-width: 640px) { #hl-player .ctrl { flex-wrap: wrap; justify-content: center; width: calc(100% - 32px); } #hl-player .ctrl kbd { display: none; } }
`;

function mountCss() {
  if (typeof document === 'undefined' || document.getElementById('hl-css')) return;
  const st = document.createElement('style');
  st.id = 'hl-css';
  st.textContent = STYLE;
  document.head.appendChild(st);
}

// Thumbnails: one worker at a time, newest clip first, only while the tab is open. Object URLs are cached
// per clip id for the session.
const thumbUrls = new Map();
const thumbUrl = (c) => {
  if (!c.thumb) return '';
  if (!thumbUrls.has(c.id)) thumbUrls.set(c.id, URL.createObjectURL(c.thumb));
  return thumbUrls.get(c.id);
};
const SEEN_KEY = 'sendit.highlights.seen';
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY) || 0); } catch { return 0; } };
const writeSeen = (t) => { try { localStorage.setItem(SEEN_KEY, String(t)); } catch { /* */ } };

// New clips since the Highlights screen was last opened: a count on its destination (docs/lobby.md "Badges").
const newCount = () => { const seen = readSeen(); return readIndex().clips.filter((c) => (c.at || 0) > seen).length; };
const updateBadge = () => setLobbyBadge('highlights', newCount());
updateBadge();
on('highlightSaved', updateBadge);

// Home: a tile for the latest highlight (after Level / Daily / Cases), one click into the player.
on('homeTiles', ({ el, ctx, i = 3 }) => {
  if (!el) return;
  mountCss();
  const clips = readIndex().clips.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const c = clips[0];
  if (!c) return;
  const n = clips.length, fresh = newCount();
  const t = document.createElement('button');
  t.type = 'button';
  t.className = 'hm-tile hm-hl';
  t.style.setProperty('--i', i);
  const art = mapArt(c.mapId);
  t.innerHTML = `
    <span class="hm-hl-pic" style="${art ? `--art:url('${art}')` : ''}"><img alt=""><i>${I.play}</i></span>
    <span class="hm-hl-t"><small>${fresh ? `${fresh} new highlight${fresh > 1 ? 's' : ''}` : 'Latest highlight'}</small><b>${esc(c.trick || 'Trick')}</b>
      <em>${n} saved · plays on your loading screens</em></span>
    <span class="hm-go">${ICONS.arrow || ''}</span>`;
  t.setAttribute('aria-label', `Latest highlight: ${c.trick}. Open Highlights`);
  t.addEventListener('click', () => { ctx.sfx?.('ui_click', 0.3, 1); pendingPlay = c.id; ctx.select('highlights'); });
  el.appendChild(t);
  getClipMeta(c.id).then((m) => {
    if (!m?.thumb || !t.isConnected) return;
    const img = t.querySelector('img');
    img.src = thumbUrl(m);
    img.onload = () => img.classList.add('on');
    const meta = t.querySelector('em');
    if (meta && m.meta?.points) meta.textContent = `${fmtPts(m.meta.points)} · ${m.meta.mountain || ''}`;
  }).catch(() => {});
});
let pendingPlay = null;   // the Home tile opens the player on this clip

registerLobbyTab({
  id: 'highlights',
  label: 'Highlights',
  short: 'Highlights',
  // In Career (Progress · Highlights · Rankings · Profile): a sixth destination pushed Career off the top
  // bar at 1280 px. Home's "Latest highlight" tile and the Career badge keep it one click away.
  group: 'career',
  order: 47,
  icon: ICON,
  shot: 'full',

  mount(el, ctx) {
    mountCss();
    let alive = true, list = [], filter = 'all', thumbing = null, player = null;
    const seenBefore = readSeen();
    const playable = canPlayClips();

    const card = (c) => {
      const m = c.meta || {};
      const url = thumbUrl(c);
      const art = mapArt(m.mapId);
      const isNew = c.at > seenBefore;
      return `
      <article class="hl-card${c.fav ? ' fav' : ''}" data-id="${esc(c.id)}">
        <button class="hl-thumb" data-act="play" style="${art ? `--art:url('${art}')` : ''}" aria-label="Play ${esc(m.trick)}" ${playable ? '' : 'disabled'}>
          <img alt="" ${url ? `src="${url}" class="on"` : ''}>
          ${url ? '' : `<span class="gen">${playable ? 'Rendering…' : ''}</span>`}
          ${isNew ? '<span class="new">NEW</span>' : ''}
          <span class="pl">${I.play}</span>
          <span class="len">${m.air ? `${Number(m.air).toFixed(1)} s air` : ''}</span>
        </button>
        <div class="hl-body">
          <div class="hl-trick" title="${esc(m.trick)}">${esc(m.trick || 'Trick')}</div>
          <div class="hl-meta">${m.points ? `<b>${esc(fmtPts(m.points))}</b> · ` : ''}${esc(m.mountain || '')}${m.trail ? ` · ${esc(m.trail)}` : ''}</div>
          <div class="hl-meta">${esc(fmtDate(c.at))} · ${esc(m.gear === 'snowboard' ? 'Snowboard' : 'Skis')}</div>
        </div>
        <div class="hl-acts">
          <button class="fav${c.fav ? ' on' : ''}" data-act="fav" aria-pressed="${c.fav}" title="${c.fav ? 'Unfavourite' : 'Favourite (kept forever, shown more on loading screens)'}" aria-label="Favourite">${c.fav ? I.star : I.starO}</button>
          <button data-act="video" title="Download as video (.webm)" aria-label="Download video" ${playable ? '' : 'disabled'}>${I.down}</button>
          <span class="sp"></span>
          <button class="del" data-act="del" title="Delete" aria-label="Delete">${I.bin}</button>
        </div>
      </article>`;
    };

    const render = () => {
      const shown = filter === 'fav' ? list.filter((c) => c.fav) : list;
      const nFav = list.filter((c) => c.fav).length;
      el.innerHTML = `
        <div class="hl-head"><h2 class="lp-title">Highlights</h2><span class="hl-count">${list.length} / ${HIGHLIGHTS.cap}</span></div>
        <p class="lp-sub">Your saved tricks. They also play on your loading screens.</p>
        ${list.length ? `<div class="hl-seg" role="group" aria-label="Filter"><button data-f="all" class="${filter === 'all' ? 'on' : ''}">All</button><button data-f="fav" class="${filter === 'fav' ? 'on' : ''}">Favourites · ${nFav}</button></div>` : ''}
        ${list.length ? (shown.length ? `<div class="hl-grid">${shown.map(card).join('')}</div>` : '<div class="lp-empty">No favourites yet. Star a clip to keep it forever.</div>') : emptyState()}
        ${list.length ? `<p class="hl-foot">The oldest clip that isn't a favourite makes room when you pass ${HIGHLIGHTS.cap}. With three or more saved, your loading screens show only your highlights.</p>` : ''}`;
    };

    const emptyState = () => `
      <div class="hl-empty">
        <h3>No highlights yet</h3>
        <p>Land a trick, then save it while this shows:</p>
        <div class="hl-demo"><i></i>Save clip <kbd>F</kbd></div>
        <p>On a controller press <kbd>LB</kbd>. The key works for your last trick until you land the next one.</p>
        <p>Saved tricks replay here from drone and tripod cameras, and on your loading screens.</p>
      </div>`;

    const load = async () => {
      try { list = await syncIndex(); } catch { list = null; }
      if (!alive) return;
      if (list === null) {
        list = [];
        el.innerHTML = '<h2 class="lp-title">Highlights</h2><div class="lp-empty">This browser can\'t store highlights (private browsing or storage turned off).</div>';
        return;
      }
      render();
      if (list.length) writeSeen(Math.max(...list.map((c) => c.at || 0)));
      setLobbyBadge('highlights', 0);
      if (pendingPlay) { const c = list.find((x) => x.id === pendingPlay); pendingPlay = null; if (c) openPlayer(c); }
      pumpThumbs();
    };

    /** Render missing thumbnails one by one (a worker each, ~2–4 s), newest first. */
    const pumpThumbs = async () => {
      if (thumbing || !playable || player) return;
      const next = list.find((c) => !c.thumb && !c._thumbFailed);
      if (!next) return;
      thumbing = next.id;
      try {
        const blob = await renderThumb(next.id);
        next.thumb = blob;
        await setThumb(next.id, blob).catch(() => {});
        if (!alive) return;
        const img = el.querySelector(`.hl-card[data-id="${CSS_ESC(next.id)}"] .hl-thumb img`);
        if (img) { img.src = thumbUrl(next); img.onload = () => img.classList.add('on'); img.parentElement.querySelector('.gen')?.remove(); }
      } catch (e) {
        next._thumbFailed = true;
        console.warn('[highlights] thumbnail failed', e.message);
        const g = el.querySelector(`.hl-card[data-id="${CSS_ESC(next.id)}"] .gen`);
        if (g) g.textContent = '';
      } finally {
        thumbing = null;
      }
      if (alive) setTimeout(pumpThumbs, 150);
    };

    const byId = (id) => list.find((c) => c.id === id);

    el.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-f]');
      if (f) { filter = f.dataset.f; render(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = b.closest('.hl-card')?.dataset.id, c = byId(id);
      if (!c) return;
      const act = b.dataset.act;
      if (act === 'play') openPlayer(c);
      else if (act === 'video') openPlayer(c, { record: true });
      else if (act === 'fav') {
        c.fav = !c.fav;
        await setFavourite(c.id, c.fav).catch(() => {});
        render();
        ctx.toast?.(c.fav ? 'Favourite · kept forever, shown more on loading screens' : 'Removed from favourites');
      } else if (act === 'del') {
        if (!b.classList.contains('ask')) {
          b.classList.add('ask'); b.textContent = 'Delete?';
          setTimeout(() => { if (b.isConnected && b.classList.contains('ask')) { b.classList.remove('ask'); b.innerHTML = I.bin; } }, 3000);
          return;
        }
        await removeClip(c.id).catch(() => {});
        if (thumbUrls.has(c.id)) { URL.revokeObjectURL(thumbUrls.get(c.id)); thumbUrls.delete(c.id); }
        list = list.filter((x) => x.id !== c.id);
        render();
        ctx.toast?.('Highlight deleted');
      }
    });

    // ------------------------------------------------------------ the player
    const openPlayer = (c, { record = false } = {}) => {
      if (player || !playable) return;
      const m = c.meta || {};
      const root = document.createElement('div');
      root.id = 'hl-player';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', `Highlight: ${m.trick}`);
      const art = thumbUrl(c) || mapArt(m.mapId);
      root.innerHTML = `
        <canvas></canvas>
        <div class="wait" style="${art ? `--art:url('${art}')` : ''}"><span>Loading the clip…</span></div>
        <div class="bar t"></div><div class="bar b"></div>
        <div class="top">
          <div class="cap"><small><i></i>Your highlight</small><b>${esc(m.trick || 'Trick')}</b><span>${[fmtPts(m.points), m.mountain, m.trail, fmtDate(c.at)].filter(Boolean).map(esc).join(' · ')}</span></div>
          <div class="camname"></div>
        </div>
        <div class="ctrl">
          <button data-p="next">${I.cam}Next camera <kbd>→</kbd></button>
          <button data-p="fav" class="${c.fav ? 'on' : ''}">${c.fav ? I.star : I.starO}Favourite <kbd>X</kbd></button>
          <button data-p="video">${I.down}Download video <kbd>V</kbd></button>
          <button data-p="close">${I.close}Close <kbd>Esc</kbd></button>
        </div>`;
      document.body.appendChild(root);
      const canvas = root.querySelector('canvas'), wait = root.querySelector('.wait'), camName = root.querySelector('.camname');
      let rec = null, pendingRec = record, shots = 0;
      const vidBtn = root.querySelector('[data-p=video]');
      const ctl = playClip(canvas, c.id, {
        onReady: () => wait.classList.add('off'),
        onShot: (info) => {
          shots++;
          camName.textContent = info?.camera || '';
          if (rec) stopRec();                    // a recording covers exactly one shot
          else if (pendingRec && shots > 0) { pendingRec = false; startRec(); }
        },
        onError: (msg) => { wait.classList.remove('off'); wait.querySelector('span').textContent = `Can't play this clip (${String(msg).slice(0, 60)})`; },
      });
      const startRec = () => {
        let stream = null;
        try { stream = canvas.captureStream?.(30); } catch { stream = null; }
        if (!stream || typeof MediaRecorder === 'undefined') { ctx.toast?.('Video download is not supported in this browser'); return; }
        const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
        const mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
        const chunks = [];
        mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (!blob.size) { ctx.toast?.('The video came out empty'); return; }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `sendit-${String(m.trick || 'highlight').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date(c.at || Date.now()).toISOString().slice(0, 10)}.webm`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          ctx.toast?.('Video saved to your downloads');
        };
        mr.start(250);
        rec = mr;
        vidBtn.classList.add('rec');
        vidBtn.lastChild.previousSibling.textContent = 'Recording…';
      };
      const stopRec = () => {
        try { rec?.stop(); } catch { /* */ }
        rec = null;
        vidBtn.classList.remove('rec');
        vidBtn.lastChild.previousSibling.textContent = 'Download video';
      };
      const close = () => {
        if (rec) stopRec();
        ctl.stop();
        root.remove();
        removeEventListener('keydown', onKey, true);
        const lb = globalThis.__sendit?.lobby;
        if (lb && lb.overlay === player?.overlay) lb.overlay = null;
        player = null;
        setTimeout(pumpThumbs, 300);
        el.querySelector(`.hl-card[data-id="${CSS_ESC(c.id)}"] .hl-thumb`)?.focus({ preventScroll: true });
      };
      const fav = async () => {
        c.fav = !c.fav;
        await setFavourite(c.id, c.fav).catch(() => {});
        const b = root.querySelector('[data-p=fav]');
        b.classList.toggle('on', c.fav); b.innerHTML = `${c.fav ? I.star : I.starO}Favourite <kbd>X</kbd>`;
        render();
      };
      const video = () => { if (rec) return; pendingRec = true; ctl.next(); };   // records the next whole shot
      const act = (p) => { if (p === 'next') ctl.next(); else if (p === 'fav') fav(); else if (p === 'video') video(); else if (p === 'close') close(); };
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) act(b.dataset.p); });
      const onKey = (e) => {
        const k = e.code;
        const map = { Escape: 'close', Backspace: 'close', ArrowRight: 'next', KeyN: 'next', KeyX: 'fav', KeyV: 'video' };
        if (map[k]) { e.preventDefault(); e.stopPropagation(); act(map[k]); }
        else if (k === 'Space' || k === 'Enter') { if (!e.target.closest?.('#hl-player button')) { e.preventDefault(); e.stopPropagation(); act('next'); } }
        else if (!e.metaKey && !e.ctrlKey) e.stopPropagation();   // the lobby behind doesn't react (Q / E tabs, R view)
      };
      addEventListener('keydown', onKey, true);
      player = { act, close };
      // The pad: a full-screen lobby overlay takes every action first (like the case opener), so Start,
      // LB / RB don't ride or switch tabs behind the player. B closes, X favourites, Y next camera, A clicks.
      const lobby = globalThis.__sendit?.lobby;
      const overlay = {
        onAction: (a) => {
          if (a === 'back') close(); else if (a === 'alt') act('fav'); else if (a === 'alt2') act('next');
          else if (['accept', 'up', 'down', 'left', 'right'].includes(a)) return false;   // A / d-pad: focus + click the player's buttons
          return true;
        },
      };
      if (lobby) lobby.overlay = overlay;
      player.overlay = overlay;
      root.querySelector('[data-p=next]').focus({ preventScroll: true });
    };

    ctx.on?.('highlightSaved', () => load());
    load();
    return () => {
      alive = false;
      player?.close();
    };
  }
});

const CSS_ESC = (s) => (globalThis.CSS?.escape ? globalThis.CSS.escape(s) : String(s).replace(/"/g, '\\"'));
