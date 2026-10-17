// What a loading-screen shot is made of, picked at random per load (seeded: ?loadseed=<n>):
//   TIMES      time of day: sun, sky, haze, light on the rider, exposure (linear HDR, game units:
//              sunlit snow ≈ sun 1.9, sky fill ≈ 0.5 like gfx/atmosphere.js at noon)
//   MOUNTAINS  the backdrop style (height-function knobs in loading/terrain.js) + a place name
//   TRICKS     rotation (spin about up, flip / cork about a horizontal axis), grab, timing
//   CAMERAS    camera moves (loading/shots.js)
//   rider      skis or snowboard, model variant, stance, outfit colourways (the game's own catalog)
// Pure data + a picker; no three.js.
import { COLORWAYS, GARMENTS } from '../character/outfits.js';

const D = Math.PI / 180;

export const TIMES = {
  golden: {
    name: 'Golden hour', weight: 3,
    sunElev: 8, sunAz: [-30, 45],
    sun: [2.7, 1.6, 0.78], sky: [0.24, 0.31, 0.5], ground: [0.75, 0.62, 0.55],
    zenith: [0.05, 0.11, 0.3], horizon: [1.25, 0.82, 0.55], awayHorizon: [0.42, 0.5, 0.72], low: [0.42, 0.36, 0.42],
    sunDisk: 60, glow: [1.6, 0.9, 0.45], haze: [0.95, 0.72, 0.6], hazeDensity: 1.0, exposure: 0.66,
    cloud: { cover: 0.32, lit: [2.2, 1.35, 0.8], shade: [0.42, 0.42, 0.55], height: 2400 }, stars: 0, aurora: 0, snowfall: 0.35,
  },
  alpenglow: {
    name: 'Alpenglow', weight: 2,
    sunElev: 1.6, sunAz: [-60, 60],
    sun: [2.1, 0.92, 0.62], sky: [0.2, 0.22, 0.38], ground: [0.5, 0.42, 0.46],
    zenith: [0.03, 0.05, 0.16], horizon: [1.0, 0.5, 0.42], awayHorizon: [0.32, 0.27, 0.46], low: [0.22, 0.2, 0.3],
    sunDisk: 40, glow: [1.3, 0.55, 0.35], haze: [0.62, 0.46, 0.55], hazeDensity: 1.2, exposure: 0.85,
    cloud: { cover: 0.42, lit: [1.8, 0.75, 0.6], shade: [0.25, 0.22, 0.36], height: 2600 }, stars: 0.25, aurora: 0, snowfall: 0.25,
  },
  bluebird: {
    name: 'Bluebird', weight: 2,
    sunElev: 34, sunAz: [-40, 70],
    sun: [2.0, 1.92, 1.78], sky: [0.38, 0.52, 0.85], ground: [1.0, 1.06, 1.2],
    zenith: [0.03, 0.12, 0.42], horizon: [0.62, 0.8, 1.05], awayHorizon: [0.45, 0.64, 0.95], low: [0.55, 0.62, 0.75],
    sunDisk: 110, glow: [1.4, 1.3, 1.1], haze: [0.62, 0.74, 0.95], hazeDensity: 0.7, exposure: 0.6,
    cloud: { cover: 0.18, lit: [2.0, 1.95, 1.9], shade: [0.6, 0.66, 0.8], height: 2600 }, stars: 0, aurora: 0, snowfall: 0.12,
  },
  dawn: {
    name: 'First light', weight: 2,
    sunElev: 4, sunAz: [-50, 30],
    sun: [2.3, 1.45, 1.0], sky: [0.26, 0.28, 0.46], ground: [0.62, 0.56, 0.6],
    zenith: [0.06, 0.09, 0.24], horizon: [1.15, 0.78, 0.66], awayHorizon: [0.44, 0.42, 0.62], low: [0.5, 0.45, 0.55],
    sunDisk: 55, glow: [1.4, 0.85, 0.6], haze: [0.8, 0.68, 0.72], hazeDensity: 1.25, exposure: 0.72,
    cloud: { cover: 0.25, lit: [2.0, 1.3, 1.0], shade: [0.38, 0.36, 0.5], height: 2300 }, stars: 0.1, aurora: 0, snowfall: 0.2, cloudSea: true,
  },
  storm: {
    name: 'Storm clearing', weight: 1,
    sunElev: 16, sunAz: [-35, 35],
    sun: [2.2, 2.0, 1.75], sky: [0.42, 0.46, 0.56], ground: [0.85, 0.88, 0.95],
    zenith: [0.14, 0.17, 0.24], horizon: [0.72, 0.74, 0.8], awayHorizon: [0.42, 0.46, 0.54], low: [0.4, 0.42, 0.48],
    sunDisk: 70, glow: [1.6, 1.45, 1.15], haze: [0.62, 0.66, 0.74], hazeDensity: 2.2, exposure: 0.64,
    cloud: { cover: 0.7, lit: [1.9, 1.8, 1.6], shade: [0.3, 0.33, 0.4], height: 1900 }, stars: 0, aurora: 0, snowfall: 1.0,
  },
  aurora: {
    name: 'Northern lights', weight: 1,
    sunElev: 26, sunAz: [-70, 70],           // the "sun" is the moon here
    sun: [0.34, 0.42, 0.62], sky: [0.07, 0.11, 0.2], ground: [0.12, 0.16, 0.24],
    zenith: [0.004, 0.008, 0.03], horizon: [0.05, 0.09, 0.15], awayHorizon: [0.03, 0.06, 0.11], low: [0.03, 0.05, 0.08],
    sunDisk: 8, glow: [0.12, 0.16, 0.24], haze: [0.04, 0.08, 0.13], hazeDensity: 0.8, exposure: 2.6, moon: true,
    cloud: { cover: 0.1, lit: [0.2, 0.25, 0.35], shade: [0.04, 0.06, 0.1], height: 2600 }, stars: 1, aurora: 1, snowfall: 0.25,
  },
};

export const MOUNTAINS = {
  spires: { places: ['Ravenspire · North Couloir', 'Ravenspire · The Fang', 'Aiguille Noire · Spine Line'], peakScale: 1.0, sharp: 1.0, horn: true, range: 0.8, seaLevel: -1300 },
  ranges: { places: ['Dragonback · Spine 3', 'Dragonback · Big Line', 'Valcrest · Summit Ridge'], peakScale: 0.85, sharp: 0.7, horn: false, range: 1.0, seaLevel: -1450 },
  inversion: { places: ['Valcrest · Above the Clouds', 'Blackspruce · Cloud Sea', 'Ravenspire · Inversion'], peakScale: 0.75, sharp: 0.85, horn: true, range: 0.9, seaLevel: -700, cloudSea: true },
};

// spin: total rotation about up (rad, sign = direction); flip: total rotation about a horizontal axis;
// axis: 'lat' (the rider's left-right: back / front flips), 'travel' (corked: rolled about the way of
// travel), 'diag' (rodeo / misty: between the two). grab: the rig's grab names (rider.js).
export const TRICKS = {
  backflip: { name: 'Backflip', spin: 0, flip: 2 * Math.PI, axis: 'lat', grab: { ski: 'Safety', board: 'Indy' }, grabWin: [0.32, 0.62], tuck: 0.85 },
  '720': { name: '720', spin: 4 * Math.PI, flip: 0, axis: 'lat', grab: { ski: 'Japan', board: 'Indy' }, grabWin: [0.3, 0.72], tuck: 0.4 },
  cork900: { name: 'Cork 900', spin: 5 * Math.PI, flip: 2 * Math.PI, axis: 'travel', grab: { ski: 'Mute', board: 'Melon' }, grabWin: [0.28, 0.7], tuck: 0.6 },
  rodeo: { name: 'Rodeo 540', spin: 3 * Math.PI, flip: 2 * Math.PI, axis: 'diag', grab: { ski: 'Safety', board: 'Indy' }, grabWin: [0.3, 0.66], tuck: 0.7 },
  method: { name: 'Method', spin: 0, flip: 0, axis: 'lat', grab: { ski: 'Truck driver', board: 'Melon' }, grabWin: [0.18, 0.8], tuck: 0.2, tweak: true, board: true },
  japan: { name: 'Japan air', spin: 0, flip: 0, axis: 'lat', grab: { ski: 'Japan', board: 'Indy' }, grabWin: [0.18, 0.8], tuck: 0.2, tweak: true, ski: true },
  indy: { name: 'Indy grab', spin: Math.PI * 2, flip: 0, axis: 'lat', grab: { ski: 'Japan', board: 'Indy' }, grabWin: [0.2, 0.78], tuck: 0.3, tweak: true },
};

// Camera moves (loading/shots.js). w = weight.
export const CAMERAS = {
  dolly: { name: 'Side dolly', w: 3 },          // tracking alongside the air, slow push, sun behind
  orbit: { name: 'Slow orbit', w: 2 },          // orbits the apex while the rider hangs in the air
  low: { name: 'Low hero', w: 2 },              // from the landing, looking up: rider against the sky
  tele: { name: 'Long lens', w: 2 },            // telephoto from across the bowl, peaks stacked behind
  reveal: { name: 'Drone reveal', w: 2 },       // starts tight, pulls back and up over the range
  follow: { name: 'Chase', w: 1 },              // behind and above the rider off the lip, over the void
};

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.weighted = (obj, key = 'weight') => {
    const ks = Object.keys(obj);
    let tot = 0;
    for (const k of ks) tot += obj[k][key] ?? 1;
    let x = r() * tot;
    for (const k of ks) { x -= obj[k][key] ?? 1; if (x <= 0) return k; }
    return ks[ks.length - 1];
  };
  return r;
}

/** Tricks that suit the gear (a few are gear-specific). */
export function tricksFor(gear) {
  return Object.keys(TRICKS).filter((k) => {
    const t = TRICKS[k];
    return !(t.board && gear !== 'snowboard') && !(t.ski && gear === 'snowboard');
  });
}

/**
 * The whole look of this load. `opts` = URL overrides from loading/index.js (seed, tod, mtn, gear,
 * trick, cam). Shots (trick + camera) are re-picked per shot from `r`.
 */
export function pickVariant(opts = {}) {
  const seed = opts.seed != null && opts.seed !== '' ? Number(opts.seed) : Math.floor(Math.random() * 2 ** 31);
  const r = rng(seed);
  const tod = TIMES[opts.tod] ? opts.tod : r.weighted(TIMES);
  const T = TIMES[tod];
  const mtn = MOUNTAINS[opts.mtn] ? opts.mtn : r.pick(Object.keys(MOUNTAINS));
  const M = MOUNTAINS[mtn];
  const gear = opts.gear === 'ski' || opts.gear === 'skis' ? 'ski' : opts.gear === 'snowboard' || opts.gear === 'board' ? 'snowboard' : (r() < 0.5 ? 'ski' : 'snowboard');
  const gearModel = r.pick(gear === 'ski' ? ['allmountain', 'powder', 'park', 'allmountain'] : ['allmountain', 'freeride', 'powder', 'park']);
  // Outfit: usually one colourway head to toe, sometimes mixed like a real kit.
  const ways = Object.keys(COLORWAYS);
  const base = r.pick(ways);
  const mix = r() < 0.35;
  const slot = (s) => ({ colorway: mix && r() < 0.5 ? r.pick(ways) : base });
  const outfit = {
    jacket: { garment: r() < 0.3 ? 'storm-shell' : 'tuff-shell', ...slot('jacket') },
    pants: { garment: Object.keys(GARMENTS.pants)[0], ...slot('pants') },
    helmet: { garment: Object.keys(GARMENTS.helmet)[0], ...slot('helmet') },
    goggles: { garment: Object.keys(GARMENTS.goggles)[0], ...slot('goggles') },
    gloves: { garment: Object.keys(GARMENTS.gloves)[0], ...slot('gloves') },
  };
  const sunAz = r.range(T.sunAz[0], T.sunAz[1]) * D;
  return {
    seed, r, tod, time: T, mtn, mountain: M, place: r.pick(M.places),
    sunAz, sunElev: T.sunElev * D,
    gear, gearModel, stance: r() < 0.3 ? 'goofy' : 'regular', outfit,
    terrainSeed: Math.floor(r() * 1e6),
    trick: TRICKS[opts.trick] ? opts.trick : null, cam: CAMERAS[opts.cam] ? opts.cam : null,
  };
}
