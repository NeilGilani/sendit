// Spots and gaps: every named feature on a mountain is a spot to discover (Steep's mountain discovery,
// THPS's gaps list). The first clean send off a spot pays style points and XP with a "NEW SPOT 7 / 31"
// toast; taking off from one named spot and landing on another is a transfer gap ("GAP! The Throne →
// Pillow Stacks"), which pays every time and more the first time. Rails count when ground ≥ 3 m.
//
// Names come from the map: course.featureAt(x, z) (Ravenspire, Voltage Park, Dragonback, Kitsune,
// Fjordline), else the kickers (Valcrest, Blackspruce: "Kicker 2 (L)"). The full list (for found / total)
// is course.named (Voltage) or a background scan of featureAt over the terrain, cached per map in
// localStorage 'sendit.spots' (THRILL_SPOT_CATALOG bumps it). The Progress tab lists them (spotsHtml).
import { on, emit, addScore, game, Mode } from '../state.js';
import { THRILL, SpotBook, judgeLanding } from './core.js';
import { progression } from '../progression/index.js';

export const THRILL_SPOT_CATALOG = 1;   // bump when map feature names change, to rescan

const localStore = {
  get(k) { try { const s = globalThis.localStorage?.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota */ } },
};
let book = null;
export const spotBook = () => (book ||= new SpotBook(localStore));

/** The name of the spot at (x, z) on this course, or null. */
export function makeNamer(course, features) {
  if (typeof course?.featureAt === 'function') return (x, z) => course.featureAt(x, z) || null;
  const K = features?.kickers || [];
  if (!K.length) return () => null;
  return (x, z) => {
    for (let i = 0; i < K.length; i++) {
      const k = K[i], dx = x - k.o.x, dz = z - k.o.y;
      const a = dx * k.f.x + dz * k.f.y, b = dx * k.r.x + dz * k.r.y;
      if (a > -6 && a < k.L + 3 && Math.abs(b) < k.W / 2 + 1.5) return `Kicker ${i + 1}${k.name ? ` (${k.name})` : ''}`;
    }
    return null;
  };
}

/** All spot names, now if cheap (course.named, kickers), else via a chunked background scan (cb). */
function buildCatalog(course, features, terrain, namer, done) {
  const names = new Set();
  for (const r of course?.rails || []) if (r?.name) names.add(r.name);
  if (Array.isArray(course?.named)) { for (const n of course.named) if (n?.name) names.add(n.name); done([...names]); return () => {}; }
  if (typeof course?.featureAt !== 'function') {
    (features?.kickers || []).forEach((k) => { const n = namer(k.o.x + k.f.x * k.L * 0.5, k.o.y + k.f.y * k.L * 0.5); if (n) names.add(n); });
    done([...names]); return () => {};
  }
  const half = terrain?.half || 2000, step = 8;
  let i = -half, stop = false;
  const slice = () => {
    if (stop) return;
    const t0 = performance.now();
    while (i <= half && performance.now() - t0 < 6) {
      for (let z = -half; z <= half; z += step) { const n = namer(i, z); if (n) names.add(n); }
      i += step;
    }
    if (i > half) done([...names]); else setTimeout(slice, 30);
  };
  setTimeout(slice, 2500);   // after the loading screen and first frames
  return () => { stop = true; };
}

export function installSpots({ player, course, features, terrain, getMapId, hud }) {
  const C = THRILL.spots;
  const namer = makeNamer(course, features);
  const B = spotBook();
  const mapId = () => getMapId();
  if (!B.hasCatalog(mapId(), THRILL_SPOT_CATALOG)) buildCatalog(course, features, terrain, namer, (names) => { if (names.length) B.setCatalog(mapId(), names, THRILL_SPOT_CATALOG); });

  let from = null;
  const riding = () => game.mode === Mode.RIDING;
  on('takeoff', () => { from = riding() ? namer(player.position.x, player.position.z) : null; });
  on('respawned', () => { from = null; });

  function discovered(name, kind) {
    const r = B.record(mapId(), name);
    if (!r.isNew) return r;
    addScore(`New spot · ${name}`, C.newScore);
    progression.addXP?.(C.newXp, 'spot');
    hud?.toast?.({ kind: 'New spot', title: name, sub: `${r.found} / ${r.total} on this mountain · +${C.newXp} XP`, icon: kind === 'rail' ? '⟋' : '⛰', c1: '#7ef9ff', c2: '#2ff5d6', progress: r.total ? r.found / r.total : null });
    emit('thrillSpot', { mapId: mapId(), name, found: r.found, total: r.total });
    return r;
  }

  on('landed', (e) => {
    if (!riding() || e.result === 'crash') { from = null; return; }
    const to = namer(player.position.x, player.position.z);
    const j = judgeLanding({ clean: e.clean, air: e.air, drop: e.drop, from, to }, C);
    from = null;
    if (j.spot) discovered(j.spot, 'air');
    if (j.gap) {
      const g = B.recordGap(mapId(), j.gap[0], j.gap[1]);
      const pts = g.isNew ? C.gapScore : C.gapRepeat;
      addScore(`Gap · ${g.name}`, pts);
      if (g.isNew) progression.addXP?.(C.gapXp, 'gap');
      hud?.banner?.(`${g.isNew ? 'NEW GAP! ' : 'GAP! '}${g.name.toUpperCase()}  +${pts}`, g.isNew ? '#7ef9ff' : '#2ff5d6');
      emit('thrillGap', { mapId: mapId(), name: g.name, isNew: g.isNew, n: g.n });
    }
  });
  on('grindEnd', ({ reason, name, dist }) => { if (riding() && name && reason !== 'bail' && (dist || 0) >= C.railMin) discovered(name, 'rail'); });
  return { namer, book: B };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The Progress tab's "Spots & gaps" section for a map (found ones lit, the rest as ???). */
export function spotsHtml(mapId, mapName = 'this mountain') {
  if (!mapId) return '';
  const s = spotBook().summary(mapId);
  if (!s.total && !s.gaps.length) return `<div class="pg-h">Spots &amp; gaps <small>${esc(mapName)}</small></div><div class="pg-book"><small>Send named cliffs, lips, kickers and rails to discover them. Land from one onto another for a gap.</small></div>`;
  const spots = s.spots.slice(0, 60).map((x) => (x.n ? `<span title="sent ${x.n}×">${esc(x.name)}</span>` : '<span class="pg-unk" title="not found yet">???</span>')).join('');
  const gaps = s.gaps.slice(0, 12).map((g) => `<span title="landed ${g.n}×">${esc(g.name)}</span>`).join('');
  return `<div class="pg-h">Spots &amp; gaps <small>${esc(mapName)} · ${s.found} / ${s.total} spots · ${s.gaps.length} gaps</small></div>
    <div class="pg-book pg-spots">${spots}</div>${gaps ? `<div class="pg-book pg-gaps">${gaps}</div>` : ''}`;
}
