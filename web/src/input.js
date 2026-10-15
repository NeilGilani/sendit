// Keyboard, mouse (pointer lock) and gamepad, mapped to the game's actions, plus menu navigation
// (gamepad d-pad / stick with key-repeat) and last-used-device tracking for button glyphs.
import { emit } from './state.js';

const KEYS = {
  speedUp: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], tuck: ['ShiftLeft', 'ShiftRight'], reset: ['KeyR'], pause: ['Escape', 'KeyP'],
};

// Standard gamepad mapping.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const MENU_REPEAT_DELAY = 0.38, MENU_REPEAT_RATE = 0.11;   // seconds

/** True when a key event belongs to a focused form control / button (menus), not to gameplay. */
const isUiTarget = (t) => t instanceof Element && !!t.closest('button, input, select, textarea, [role=tab], [role=radio], [contenteditable]');

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.canvas = canvas;
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [] };
    this.prevButtons = [];
    this.device = 'keyboard';                 // 'keyboard' | 'mouse' | 'gamepad' | 'touch'
    this.menuDir = { dir: null, t: 0 };       // stick / d-pad repeat state
    addEventListener('keydown', (e) => {
      // Gameplay keys must not scroll the page — but menus keep native Space/arrow behaviour.
      if ((e.code === 'Space' || e.code.startsWith('Arrow')) && !isUiTarget(e.target)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.setDevice('keyboard');
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX; this.look.y += e.movementY; }
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.setDevice('mouse');
    });
    addEventListener('pointerdown', (e) => this.setDevice(e.pointerType === 'touch' ? 'touch' : 'mouse'));
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    emit('inputDevice', d);
  }

  lock() { if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  poll() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g) : null;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      this.pad.lx = dz(gp.axes[0] || 0); this.pad.ly = dz(gp.axes[1] || 0);
      this.pad.rx = dz(gp.axes[2] || 0); this.pad.ry = dz(gp.axes[3] || 0);
      this.pad.lt = gp.buttons[6]?.value || 0; this.pad.rt = gp.buttons[7]?.value || 0;
      this.pad.buttons = gp.buttons.map((b) => b.pressed);
      if (this.pad.buttons.some(Boolean) || Math.abs(this.pad.lx) + Math.abs(this.pad.ly) + Math.abs(this.pad.rx) > 0.5) this.setDevice('gamepad');
    } else {
      this.pad.buttons = [];
      this.pad.lx = this.pad.ly = this.pad.rx = this.pad.ry = 0;
    }
  }

  key(action) { return KEYS[action].some((k) => this.down.has(k)); }
  keyPressed(action) { return KEYS[action].some((k) => this.pressed.has(k)); }
  codePressed(code) { return this.pressed.has(code); }
  btn(i) { return !!this.pad.buttons[i]; }
  btnPressed(i) { return !!this.pad.buttons[i] && !this.prevButtons[i]; }

  /** Analog strength 0..1 per action. */
  strength(action) {
    const p = this.pad;
    switch (action) {
      case 'speedUp': return Math.max(this.key('speedUp') ? 1 : 0, Math.max(0, -p.ly), p.rt);
      case 'brake': return Math.max(this.key('brake') ? 1 : 0, Math.max(0, p.ly), p.lt);
      case 'left': return Math.max(this.key('left') ? 1 : 0, Math.max(0, -p.lx));
      case 'right': return Math.max(this.key('right') ? 1 : 0, Math.max(0, p.lx));
      case 'jump': return this.key('jump') || this.btn(0) ? 1 : 0;
      case 'tuck': return this.key('tuck') || this.btn(5) || this.btn(1) ? 1 : 0;
      default: return 0;
    }
  }

  justPressed(action) {
    const map = { reset: 3, pause: 9, jump: 0 };
    return this.keyPressed(action) || (map[action] !== undefined && this.btnPressed(map[action]));
  }

  /**
   * Gamepad menu actions this frame: 'up' | 'down' | 'left' | 'right' (d-pad or left stick, with
   * key-repeat), 'accept' (A), 'back' (B), 'alt' (X), 'alt2' (Y), 'prevTab' (LB), 'nextTab' (RB),
   * 'start' (Start), 'select' (Select). Keyboard menus use DOM focus instead (see lobby/nav.js).
   */
  menuActions(dt) {
    const out = [];
    if (!this.pad.buttons.length) { this.menuDir.dir = null; return out; }
    const p = this.pad;
    let dir = null;
    if (this.btn(PAD.UP) || p.ly < -0.55) dir = 'up';
    else if (this.btn(PAD.DOWN) || p.ly > 0.55) dir = 'down';
    else if (this.btn(PAD.LEFT) || p.lx < -0.55) dir = 'left';
    else if (this.btn(PAD.RIGHT) || p.lx > 0.55) dir = 'right';
    const m = this.menuDir;
    if (dir !== m.dir) { m.dir = dir; m.t = MENU_REPEAT_DELAY; if (dir) out.push(dir); }
    else if (dir) { m.t -= dt; if (m.t <= 0) { m.t += MENU_REPEAT_RATE; out.push(dir); } }
    const map = { accept: PAD.A, back: PAD.B, alt: PAD.X, alt2: PAD.Y, prevTab: PAD.LB, nextTab: PAD.RB, start: PAD.START, select: PAD.SELECT };
    for (const [name, i] of Object.entries(map)) if (this.btnPressed(i)) out.push(name);
    return out;
  }

  takeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }

  endFrame() { this.pressed.clear(); this.prevButtons = [...this.pad.buttons]; }
}
