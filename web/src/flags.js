// URL flags (docs/launch.md § Flag policy). Every module reads the page's query through urlParams():
//
//   • Player-facing / shareable links work everywhere: ?map ?trail ?ride ?challenge ?vs (versus links)
//     ?equip ?stance ?quality ?resort ?run.
//   • Everything else is a dev / debug / capture flag (?casegrant ?caseforce ?caseseries ?proto ?protobody
//     ?iconrebake ?noicons ?variant ?kicker ?at ?ragdoll ?cam ?atmo ?sun ?tm ?exposure ?goggles ?shaderdebug
//     ?audiodebug ?load* ?nostill …). Those are honoured only when DEBUG is on: the dev server
//     (`npm run dev`, which every browser test runs against) or a build made with a non-production mode
//     (`vite build --mode staging`). A public build (`npm run build`) drops them, so a shared link can't
//     grant cases, force a rarity or swap in an unowned skin.
//
// The still picker in index.html applies the same rule to ?loadstill / ?nostill ('%MODE%').
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || null;

/** Dev / debug flags allowed (dev server, or a build with --mode other than production). */
export const DEBUG = !!ENV && ENV.MODE !== 'production';

/** Query keys every build honours (player-facing, shareable). */
export const PUBLIC_FLAGS = Object.freeze(['map', 'trail', 'ride', 'challenge', 'vs', 'equip', 'stance', 'quality', 'resort', 'run', 'howto']);

/**
 * The page's query as URLSearchParams, with dev / debug keys removed unless DEBUG. `search` defaults
 * to location.search ('' outside a page, e.g. in Node unit tests or a worker).
 */
export function urlParams(search = (typeof location !== 'undefined' ? location.search : ''), debug = DEBUG) {
  let q;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  if (!debug) for (const k of [...q.keys()]) if (!PUBLIC_FLAGS.includes(k)) q.delete(k);
  return q;
}
