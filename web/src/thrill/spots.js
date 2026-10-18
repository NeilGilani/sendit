// Spots and gaps: every named feature on a mountain is a spot to discover (Steep's mountain discovery,
// THPS's gaps list). The first clean send off a spot pays style points and XP with a "NEW SPOT 7 / 31"
// toast; taking off from one named spot and landing on another is a transfer gap ("GAP! The Throne →
// Pillow Stacks"), which pays every time and more the first time. Rails count when ground ≥ 3 m.
//
// Names come from the map: course.featureAt(x, z) (Ravenspire, Voltage Park, Dragonback, Kitsune,
// Fjordline), else the kickers (Valcrest, Blackspruce: "Kicker 2 (L)"). The full list (for found / total)
// is course.named (Voltage) or a background scan of featureAt over the terrain, cached per map in
// localStorage 'sendit.spots' (THRILL_SPOT_CATALOG bumps it). The Progress tab lists them (spotsHtml).
import * as THREE from 'three';
import { on, emit, addScore, game, Mode, settings } from '../state.js';
import { THRILL, SpotBook, judgeLanding } from './core.js';
import { progression } from '../progression/index.js';

/** Up to THRILL.markers.max floating "?" sprites over undiscovered spots, fading in with distance. */
class SpotMarkers {
  constructor(scene, terrain) {
    this.terrain = terrain;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(47,245,214,0.55)'); grad.addColorStop(0.55, 'rgba(47,245,214,0.18)'); grad.addColorStop(1, 'rgba(47,245,214,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    g.font = 'bold 76px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(4,20,28,0.85)'; g.strokeText('?', 64, 68);
    g.fillStyle = '#eafffb'; g.fillText('?', 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.items = [];
    for (let i = 0; i < THRILL.markers.max; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0 }));
      sp.visible = false; sp.renderOrder = 5;
      scene.add(sp);
      this.items.push({ sp, target: null, a: 0 });
    }
    this.t = 0;
  }
  set(list) {
    // Keep a sprite on the same spot when it is still in the list (no jumping between spots).
    const free = this.items.filter((it) => !it.target || !list.some((l) => l.name === it.target.name));
    for (const it of free) it.target = null;
    for (const l of list) {
      const have = this.items.find((it) => it.target?.name === l.name);
      if (have) { have.target = l; continue; }
      const it = this.items.find((x) => !x.target);
      if (it) { it.target = l; it.sp.position.set(l.x, this.terrain.getHeight(l.x, l.z) + THRILL.markers.lift, l.z); }
    }
  }
  update(dt, show, pos) {
    this.t += dt;
    const M = THRILL.markers;
    for (const [i, it] of this.items.entries()) {
      const d = it.target ? Math.hypot(it.sp.position.x - pos.x, it.sp.position.z - pos.z) : Infinity;
      // Fade in from range to range·0.7, out again inside `near`/2 (you are on it).
      const want = show && it.target ? Math.min(1, (M.range - d) / (M.range * 0.3)) * Math.min(1, d / (M.near * 0.5)) : 0;
      it.a += (Math.max(0, want) - it.a) * Math.min(1, dt * 4);
      it.sp.visible = it.a > 0.02;
      if (!it.sp.visible) continue;
      it.sp.material.opacity = it.a * 0.9;
      const s = M.size * (0.8 + Math.min(1.6, d / 60));   // stays readable far away
      it.sp.scale.set(s, s, 1);
      if (it.target) it.sp.position.y = this.terrain.getHeight(it.target.x, it.target.z) + M.lift + Math.sin(this.t * 2 + i) * 0.4;
    }
  }
}

export const THRILL_SPOT_CATALOG = 2;   // bump when map feature names change, to rescan (2: points per spot for the markers)

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

/**
 * All spot names and a few points on each ({ name: [[x, z], …] }, ≥ 50 m apart, ≤ 16), now if cheap
 * (course.named, kickers), else via a chunked background scan. done(names, pts).
 */
function buildCatalog(course, features, terrain, namer, done) {
  const names = new Set(), pts = {};
  const add = (n, x, z) => {
    names.add(n);
    const l = (pts[n] ||= []);
    if (l.length < 16 && l.every((q) => Math.hypot(q[0] - x, q[1] - z) >= 50)) l.push([x, z]);
  };
  for (const r of course?.rails || []) if (r?.name) names.add(r.name);
  if (Array.isArray(course?.named)) { for (const n of course.named) if (n?.name) add(n.name, n.x, n.z); done([...names], pts); return () => {}; }
  if (typeof course?.featureAt !== 'function') {
    (features?.kickers || []).forEach((k) => { const x = k.o.x + k.f.x * k.L * 0.5, z = k.o.y + k.f.y * k.L * 0.5, n = namer(x, z); if (n) add(n, x, z); });
    done([...names], pts); return () => {};
  }
  const half = terrain?.half || 2000, step = 8;
  let i = -half, j = -half, stop = false;
  // Idle time only (between frames), so the scan never stretches a frame; 3 ms slices where there is no
  // requestIdleCallback.
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(() => f(null), 40);
  const slice = (deadline) => {
    if (stop) return;
    const t0 = performance.now();
    const more = () => (deadline && !deadline.didTimeout ? deadline.timeRemaining() > 2 : performance.now() - t0 < 3);
    while (i <= half && more()) {
      for (let k = 0; k < 64 && i <= half; k++) {
        const n = namer(i, j); if (n) add(n, i, j);
        j += step;
        if (j > half) { j = -half; i += step; }
      }
    }
    if (i > half) done([...names], pts); else idle(slice);
  };
  setTimeout(() => idle(slice), 2500);   // after the loading screen and first frames
  return () => { stop = true; };
}

export function installSpots({ player, course, features, terrain, getMapId, hud, scene }) {
  const C = THRILL.spots;
  const namer = makeNamer(course, features);
  const B = spotBook();
  const mapId = () => getMapId();
  if (!B.hasCatalog(mapId(), THRILL_SPOT_CATALOG)) buildCatalog(course, features, terrain, namer, (names, pts) => { if (names.length) B.setCatalog(mapId(), names, THRILL_SPOT_CATALOG, pts); });
  const markers = scene ? new SpotMarkers(scene, terrain) : null;

  let from = null;
  const riding = () => game.mode === Mode.RIDING;
  on('takeoff', () => { from = riding() ? namer(player.position.x, player.position.z) : null; });
  on('respawned', () => { from = null; });
  // The near miss: a new spot launched but not landed clean says so, and how to try again (Zen).
  function missed() {
    if (!from || !riding() || (player.airTime || 0) < C.minAir * 0.8) return;
    if (B.map(mapId()).spots[from]) return;
    const zen = !globalThis.__sendit?.activities || globalThis.__sendit.activities.mode !== 'challenge';
    hud?.callout?.(`SO CLOSE · ${from.toUpperCase()} NOT SENT${zen ? ' · BACKSPACE / ▼ RETRY' : ''}`, '#ffb3ea');
    emit('thrillSpotMissed', { mapId: mapId(), name: from });
  }
  on('crashed', () => { missed(); from = null; });

  function discovered(name, kind) {
    const r = B.record(mapId(), name);
    if (!r.isNew) return r;
    addScore(`New spot · ${name}`, C.newScore);
    progression.addXP?.(C.newXp, 'spot');
    progression.core?.recordThrill?.('spot');
    hud?.toast?.({ kind: 'New spot', title: name, sub: `${r.found} / ${r.total} on this mountain · +${C.newXp} XP`, icon: kind === 'rail' ? '⟋' : '⛰', c1: '#7ef9ff', c2: '#2ff5d6', progress: r.total ? r.found / r.total : null });
    emit('thrillSpot', { mapId: mapId(), name, found: r.found, total: r.total });
    return r;
  }

  on('landed', (e) => {
    if (!riding() || e.result === 'crash') { from = null; return; }
    if (!e.clean) { missed(); from = null; return; }
    const to = namer(player.position.x, player.position.z);
    const j = judgeLanding({ clean: e.clean, air: e.air, drop: e.drop, from, to }, C);
    from = null;
    if (j.spot) discovered(j.spot, 'air');
    if (j.gap) {
      const g = B.recordGap(mapId(), j.gap[0], j.gap[1]);
      const pts = g.isNew ? C.gapScore : C.gapRepeat;
      addScore(`Gap · ${g.name}`, pts);
      if (g.isNew) { progression.addXP?.(C.gapXp, 'gap'); progression.core?.recordThrill?.('gap'); }
      hud?.banner?.(`${g.isNew ? 'NEW GAP! ' : 'GAP! '}${g.name.toUpperCase()}  +${pts}`, g.isNew ? '#7ef9ff' : '#2ff5d6');
      emit('thrillGap', { mapId: mapId(), name: g.name, isNew: g.isNew, n: g.n });
    }
  });
  on('grindEnd', ({ reason, name, dist }) => { if (riding() && name && reason !== 'bail' && (dist || 0) >= C.railMin) discovered(name, 'rail'); });
  // Undiscovered spots ahead get a floating "?" (Steep's points of interest), refreshed twice a second.
  let pickT = 0;
  on('thrillSpot', () => { pickT = 0; });
  return {
    namer, book: B, markers,
    update(dt) {
      if (!markers) return;
      const show = riding() && settings.thrillSpotMarkers !== false;
      if (show && (pickT -= dt) <= 0) {
        pickT = 0.5;
        const v = player.velocity, hs = Math.hypot(v.x, v.z);
        const dx = hs > 1 ? v.x / hs : -Math.sin(player.heading), dz = hs > 1 ? v.z / hs : -Math.cos(player.heading);
        markers.set(B.undiscoveredNear(mapId(), player.position.x, player.position.z, dx, dz, THRILL.markers));
      }
      markers.update(dt, show, player.position);
    },
  };
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
