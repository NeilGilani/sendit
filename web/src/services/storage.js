// Key/value JSON storage: localStorage when available, an in-memory map otherwise (private mode,
// blocked storage, tests). Everything persistent in the lobby layer goes through here so a cloud
// save can later replace it without touching callers.

const memory = new Map();

function backend() {
  try {
    const k = '__sendit_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}
const ls = backend();

export const storage = {
  /** True when values survive a reload. */
  persistent: !!ls,

  getRaw(key) {
    try { return ls ? ls.getItem(key) : (memory.get(key) ?? null); } catch { return memory.get(key) ?? null; }
  },

  setRaw(key, value) {
    memory.set(key, value);
    try { ls?.setItem(key, value); return true; } catch { return false; }
  },

  /** Parsed JSON or `fallback` when missing/corrupt. */
  get(key, fallback = null) {
    const raw = this.getRaw(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },

  set(key, value) { return this.setRaw(key, JSON.stringify(value)); },

  remove(key) {
    memory.delete(key);
    try { ls?.removeItem(key); } catch { /* ignore */ }
  },
};
