// Keyboard, mouse (pointer lock) and gamepad (Xbox / PlayStation / Switch Pro, standard mapping),
// mapped to the game's actions. Also: menu navigation (d-pad / stick with key-repeat, used by the
// lobby / pause / settings screens via menuActions), last-used-device tracking for button glyphs,
// and rumble.
//
// Controller layout (Xbox names; PlayStation in brackets):
//   Left stick   carve (analog), push up to skate, pull back to brake
//   RT [R2]      skate / push          LT [L2]  brake (snowplow, analog)
//   A [✕]        hold to crouch, release to jump
//   RB [R1] / X [□]  tuck              B [○]    brake
//   Y [△]        back to the top       Start [Options]  pause
//   View/Back [Share] or click right stick: switch first person / chase camera
//   Right stick  look around
import { emit } from './state.js';

const KEYS = {
  speedUp: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], tuck: ['ShiftLeft', 'ShiftRight'], reset: ['KeyR'], pause: ['Escape', 'KeyP'], view: ['KeyC', 'KeyV'],
};
// Standard-mapping button indices (BACK and SELECT are the same View / Share button).
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, SELECT: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
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
    this.gamepad = null;
    this.device = matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard';   // 'keyboard' | 'mouse' | 'gamepad' | 'touch'
    this.usingPad = false;            // last input came from a controller (drives the in-game hints)
    this.menuDir = { dir: null, t: 0 };       // stick / d-pad repeat state
    addEventListener('keydown', (e) => {
      // Gameplay keys must not scroll the page, but menus keep native Space/arrow behaviour.
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
    addEventListener('gamepadconnected', () => this.setDevice('gamepad'));
    addEventListener('gamepaddisconnected', () => { if (!this.findPad() && this.device === 'gamepad') this.setDevice('keyboard'); });
  }

  /** Last-used device: announced on the bus (lobby glyphs) and as body.pad (in-game hints, hidden cursor). */
  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.usingPad = d === 'gamepad';
    document.body.classList.toggle('pad', this.usingPad);
    emit('inputDevice', d);
  }

  /** Compatibility shim for the controller code: true = gamepad, false = keyboard. */
  setPadMode(on) { this.setDevice(on ? 'gamepad' : 'keyboard'); }

  findPad() {
    if (!navigator.getGamepads) return null;
    const pads = [...navigator.getGamepads()].filter(Boolean);
    return pads.find((g) => g.mapping === 'standard') || pads[0] || null;
  }

  // Pointer lock needs a mouse / keyboard gesture; with a controller we play without it.
  lock() { if (this.usingPad) return; if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  poll() {
    const gp = this.findPad();
    this.gamepad = gp;
    if (gp) {
      // Radial dead zone + a gentle response curve for precise carving.
      const stick = (x, y) => {
        const m = Math.hypot(x, y);
        if (m < 0.16) return [0, 0];
        const k = Math.pow(Math.min(1, (m - 0.16) / 0.84), 1.35) / m;
        return [x * k, y * k];
      };
      [this.pad.lx, this.pad.ly] = stick(gp.axes[0] || 0, gp.axes[1] || 0);
      // The same stick mapped from its round gate onto a square for in-air rotation (airStrength): a full
      // diagonal (a cork: spin + flip) is full on both axes, not 0.71 each.
      const m = Math.max(Math.abs(this.pad.lx), Math.abs(this.pad.ly)), r = Math.hypot(this.pad.lx, this.pad.ly);
      const k = m > 1e-6 ? r / m : 0;
      this.pad.sx = Math.max(-1, Math.min(1, this.pad.lx * k)); this.pad.sy = Math.max(-1, Math.min(1, this.pad.ly * k));
      [this.pad.rx, this.pad.ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
      this.pad.lt = gp.buttons[PAD.LT]?.value || 0; this.pad.rt = gp.buttons[PAD.RT]?.value || 0;
      this.pad.buttons = gp.buttons.map((b) => b.pressed);
      if (this.pad.buttons.some(Boolean) || Math.abs(this.pad.lx) + Math.abs(this.pad.ly) + Math.abs(this.pad.rx) + Math.abs(this.pad.ry) > 0.3) this.setDevice('gamepad');
    } else {
      this.pad.buttons = [];
      this.pad.lx = this.pad.ly = this.pad.rx = this.pad.ry = this.pad.lt = this.pad.rt = this.pad.sx = this.pad.sy = 0;
    }
  }

  key(action) { return KEYS[action].some((k) => this.down.has(k)); }
  keyPressed(action) { return KEYS[action].some((k) => this.pressed.has(k)); }
  codePressed(code) { return this.pressed.has(code); }
  btn(i) { return !!this.pad.buttons[i]; }
  btnPressed(i) { return !!this.pad.buttons[i] && !this.prevButtons[i]; }

  /** 0..1 analog strength of a gameplay action (keyboard = 0 or 1). */
  strength(action) {
    const p = this.pad;
    switch (action) {
      case 'speedUp': return Math.max(this.key('speedUp') ? 1 : 0, Math.max(0, -p.ly) * 0.8, p.rt);
      case 'brake': return Math.max(this.key('brake') ? 1 : 0, Math.max(0, p.ly - 0.25) / 0.75, p.lt, this.btn(PAD.B) ? 1 : 0);
      case 'left': return Math.max(this.key('left') ? 1 : 0, Math.max(0, -p.lx));
      case 'right': return Math.max(this.key('right') ? 1 : 0, Math.max(0, p.lx));
      case 'jump': return this.key('jump') || (this.btn(PAD.A) && !this._swallowA) ? 1 : 0;
      case 'tuck': return this.key('tuck') || this.btn(PAD.RB) || this.btn(PAD.X) ? 1 : 0;
      default: return 0;
    }
  }

  /**
   * Rotation inputs in the air, 0..1 (steer −1..1): keys as strength(), the left stick square-mapped and
   * straight (no ground tuck scale on up, no extra brake dead zone on down), so a full stick push — straight
   * or diagonal — throws as hard as the keys. The ground controls keep strength().
   */
  airStrength() {
    const p = this.pad, sx = p.sx || 0, sy = p.sy || 0;
    const kx = (this.key('right') ? 1 : 0) - (this.key('left') ? 1 : 0);
    return {
      steer: Math.abs(sx) > Math.abs(kx) ? sx : kx,
      up: Math.max(this.key('speedUp') ? 1 : 0, Math.max(0, -sy), p.rt),
      brake: Math.max(this.key('brake') ? 1 : 0, Math.max(0, sy), p.lt, this.btn(PAD.B) ? 1 : 0),
    };
  }

  justPressed(action) {
    const map = { reset: PAD.Y, pause: PAD.START, jump: PAD.A, view: PAD.BACK };
    if (action === 'view' && this.btnPressed(PAD.RS)) return true;
    return this.keyPressed(action) || (map[action] !== undefined && this.btnPressed(map[action]));
  }

  // ------------------------------------------------------------------ menus
  /**
   * Gamepad menu actions this frame: 'up' | 'down' | 'left' | 'right' (d-pad or left stick, with
   * key-repeat), 'accept' (A), 'back' (B), 'alt' (X), 'alt2' (Y), 'prevTab' (LB), 'nextTab' (RB),
   * 'start' (Start), 'select' (Select). Keyboard menus use DOM focus instead (see lobby/nav.js).
   * An A press used by a menu is swallowed so it doesn't also crouch / jump when a ride starts.
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
    if (out.includes('accept')) this.swallowA();
    return out;
  }

  /** A was used to click a menu button: ignore it for jumping until it is released. */
  swallowA() { this._swallowA = true; }

  // ------------------------------------------------------------------ rumble
  /** Dual-motor rumble (strong / weak 0..1) for ms milliseconds, if the controller supports it. */
  rumble(strong, weak, ms) {
    const act = this.gamepad?.vibrationActuator;
    if (!act || !this.usingPad) return;
    try {
      act.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {});
    } catch { /* unsupported */ }
  }

  takeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }

  endFrame() {
    if (this._swallowA && !this.btn(PAD.A)) this._swallowA = false;
    this.pressed.clear(); this.prevButtons = [...this.pad.buttons];
  }
}
