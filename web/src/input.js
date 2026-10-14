// Keyboard, mouse (pointer lock) and gamepad, mapped to the game's actions.
const KEYS = {
  speedUp: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], tuck: ['ShiftLeft', 'ShiftRight'], reset: ['KeyR'], pause: ['Escape', 'KeyP'],
};

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.canvas = canvas;
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [] };
    this.prevButtons = [];
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
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
    } else {
      this.pad.buttons = [];
    }
  }

  key(action) { return KEYS[action].some((k) => this.down.has(k)); }
  keyPressed(action) { return KEYS[action].some((k) => this.pressed.has(k)); }
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

  takeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }

  endFrame() { this.pressed.clear(); this.prevButtons = [...this.pad.buttons]; }
}
