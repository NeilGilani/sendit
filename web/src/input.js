// Keyboard, mouse (pointer lock) and gamepad (Xbox / PlayStation / Switch Pro, standard mapping),
// mapped to the game's actions. Also: menu navigation (d-pad / stick + A / B) and rumble.
//
// Controller layout (Xbox names; PlayStation in brackets):
//   Left stick   carve (analog), push up to skate, pull back to brake
//   RT [R2]      skate / push          LT [L2]  brake (snowplow, analog)
//   A [✕]        hold to crouch, release to jump
//   RB [R1] / X [□]  tuck              B [○]    brake
//   Y [△]        back to the top       Start [Options]  pause
//   Right stick  look around
const KEYS = {
  speedUp: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], tuck: ['ShiftLeft', 'ShiftRight'], reset: ['KeyR'], pause: ['Escape', 'KeyP'],
};
// Standard-mapping button indices.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.canvas = canvas;
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [] };
    this.prevButtons = [];
    this.gamepad = null;
    this.usingPad = false;            // last input came from a controller (drives the on-screen hints)
    this._nav = { dir: null, t: 0 };
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.setPadMode(false);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
    addEventListener('gamepadconnected', () => this.setPadMode(true));
    addEventListener('gamepaddisconnected', () => { if (!this.findPad()) this.setPadMode(false); });
  }

  setPadMode(on) {
    if (this.usingPad === on) return;
    this.usingPad = on;
    document.body.classList.toggle('pad', on);
  }

  findPad() {
    if (!navigator.getGamepads) return null;
    const pads = [...navigator.getGamepads()].filter(Boolean);
    return pads.find((g) => g.mapping === 'standard') || pads[0] || null;
  }

  lock() { if (this.usingPad) return; if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  poll(dt = 1 / 60) {
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
      [this.pad.rx, this.pad.ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
      this.pad.lt = gp.buttons[PAD.LT]?.value || 0; this.pad.rt = gp.buttons[PAD.RT]?.value || 0;
      this.pad.buttons = gp.buttons.map((b) => b.pressed);
      if (this.pad.buttons.some(Boolean) || Math.abs(this.pad.lx) + Math.abs(this.pad.ly) + Math.abs(this.pad.rx) + Math.abs(this.pad.ry) > 0.3) this.setPadMode(true);
    } else {
      this.pad.buttons = [];
      this.pad.lx = this.pad.ly = this.pad.rx = this.pad.ry = this.pad.lt = this.pad.rt = 0;
    }
    this.pollNav(dt);
  }

  key(action) { return KEYS[action].some((k) => this.down.has(k)); }
  keyPressed(action) { return KEYS[action].some((k) => this.pressed.has(k)); }
  btn(i) { return !!this.pad.buttons[i]; }
  btnPressed(i) { return !!this.pad.buttons[i] && !this.prevButtons[i]; }

  /** Analog strength 0..1 per action. */
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

  justPressed(action) {
    const map = { reset: PAD.Y, pause: PAD.START, jump: PAD.A };
    return this.keyPressed(action) || (map[action] !== undefined && this.btnPressed(map[action]));
  }

  // ------------------------------------------------------------------ menus
  /** D-pad / left stick with key-repeat → 'up' | 'down' | 'left' | 'right' once per step. */
  pollNav(dt) {
    const p = this.pad;
    let dir = null;
    if (this.btn(PAD.UP) || p.ly < -0.55) dir = 'up';
    else if (this.btn(PAD.DOWN) || p.ly > 0.55) dir = 'down';
    else if (this.btn(PAD.LEFT) || p.lx < -0.55) dir = 'left';
    else if (this.btn(PAD.RIGHT) || p.lx > 0.55) dir = 'right';
    this.navStep = null;
    if (!dir) { this._nav.dir = null; return; }
    if (dir !== this._nav.dir) { this._nav.dir = dir; this._nav.t = 0.38; this.navStep = dir; return; }
    this._nav.t -= dt;
    if (this._nav.t <= 0) { this._nav.t = 0.13; this.navStep = dir; }
  }
  navConfirm() { return this.btnPressed(PAD.A); }
  /** A was used to click a menu button: ignore it for jumping until it is released. */
  swallowA() { this._swallowA = true; }
  navBack() { return this.btnPressed(PAD.B); }

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
