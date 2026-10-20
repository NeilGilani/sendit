// Where the site's static files (../assets, copied to the build root) live. Vite's `base`
// (`vite build --base /sendit/`) becomes import.meta.env.BASE_URL, so every fetch of /audio, /models,
// /loading, /maps, /textures, /resorts goes through assetUrl() and the game runs from a sub-path
// (GitHub Pages) as well as from a domain root. Use an absolute base ('/' or '/name/'), not './':
// the loading worker resolves these against its own script URL. Node scripts (unit tests) get '/'.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

/** 'models/skier/skier.gltf' or '/models/skier/skier.gltf' → '<base>models/skier/skier.gltf'. */
export const assetUrl = (path) => BASE + String(path).replace(/^\/+/, '');
