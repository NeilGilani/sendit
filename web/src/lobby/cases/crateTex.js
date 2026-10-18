// Canvas textures for the 3D cases (crate3d.js): plastic grain, wood planks, carbon weave, printed
// logos and the Night Park graffiti side print. Generated once at prewarm (a few ms each).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Deterministic little RNG so every build looks the same (captures compare frame to frame). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fine moulded-plastic grain: a grey roughness / bump map (tiling). */
export function grainTexture(seed = 3) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + (r() - 0.5) * 60;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Soft blotches (mould flow marks).
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.035)`;
    g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 40, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { srgb: false, repeat: true });
}

/** Weathered wood planks (colour + a matching bump map) for the Backcountry crate. */
export function woodTextures(seed = 7) {
  const W = 1024, H = 512, planks = 4;
  const [c, g] = canvas(W, H);
  const [cb, gb] = canvas(W, H);
  const r = rng(seed);
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tone = 0.85 + r() * 0.3;
    const base = [154 * tone, 104 * tone, 60 * tone];
    g.fillStyle = `rgb(${base.map((v) => v | 0)})`;
    g.fillRect(0, y0, W, ph);
    gb.fillStyle = '#9a9a9a';
    gb.fillRect(0, y0, W, ph);
    // Grain: long wavy lines with knots.
    const knots = Array.from({ length: 2 }, () => ({ x: r() * W, y: y0 + ph * (0.25 + r() * 0.5), s: 8 + r() * 14 }));
    for (let l = 0; l < 46; l++) {
      const yy = y0 + (l / 46) * ph;
      const dark = r() * 0.35;
      g.strokeStyle = `rgba(60,34,14,${0.12 + dark * 0.4})`;
      gb.strokeStyle = `rgba(40,40,40,${0.18 + dark * 0.3})`;
      g.lineWidth = gb.lineWidth = 0.6 + r() * 1.6;
      g.beginPath(); gb.beginPath();
      const ph1 = r() * 10, amp = 1.5 + r() * 3;
      for (let x = 0; x <= W; x += 16) {
        let y = yy + Math.sin(x * 0.006 + ph1) * amp;
        for (const k of knots) { const d = Math.hypot(x - k.x, yy - k.y); if (d < k.s * 4) y += (yy - k.y) * (k.s * 4 - d) / (k.s * 4) * 0.8; }
        if (x === 0) { g.moveTo(x, y); gb.moveTo(x, y); } else { g.lineTo(x, y); gb.lineTo(x, y); }
      }
      g.stroke(); gb.stroke();
    }
    for (const k of knots) {
      const grd = g.createRadialGradient(k.x, k.y, 1, k.x, k.y, k.s);
      grd.addColorStop(0, 'rgba(50,26,10,0.85)'); grd.addColorStop(1, 'rgba(50,26,10,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(k.x, k.y, k.s * 1.6, k.s, 0, 0, Math.PI * 2); g.fill();
    }
    // Plank gaps (dark grooves) and nail heads near the ends.
    g.fillStyle = 'rgba(25,14,6,0.95)'; g.fillRect(0, y0, W, 5);
    gb.fillStyle = '#202020'; gb.fillRect(0, y0, W, 6);
    for (const x of [26, W - 26]) for (const dy of [0.3, 0.7]) {
      g.fillStyle = '#3b3d42'; g.beginPath(); g.arc(x, y0 + ph * dy, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x - 1.5, y0 + ph * dy - 1.5, 2.5, 0, Math.PI * 2); g.fill();
      gb.fillStyle = '#e0e0e0'; gb.beginPath(); gb.arc(x, y0 + ph * dy, 6, 0, Math.PI * 2); gb.fill();
    }
  }
  // Scuffs and weathering.
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '235,220,200' : '40,24,10'},${0.04 + r() * 0.06})`;
    g.fillRect(r() * W, r() * H, 6 + r() * 60, 1 + r() * 2);
  }
  return { map: tex(c), bump: tex(cb, { srgb: false }) };
}

/** Night Park body print: near-black carbon weave with diagonal paint drips and hazard stripes. */
export function parkTextures(seed = 11) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const [cb, gb] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = '#17121f'; g.fillRect(0, 0, W, H);
  // Carbon weave (also the bump map, tiled).
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
    const odd = ((x + y) / 16) % 2;
    const grd = gb.createLinearGradient(x, y, odd ? x + 16 : x, odd ? y : y + 16);
    grd.addColorStop(0, '#606060'); grd.addColorStop(0.5, '#b0b0b0'); grd.addColorStop(1, '#606060');
    gb.fillStyle = grd; gb.fillRect(x, y, 16, 16);
  }
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    g.fillStyle = ((x + y) / 8) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
    g.fillRect(x, y, 8, 8);
  }
  // Diagonal neon paint slashes with drips.
  const cols = ['#ff3bd4', '#2bf0ff', '#c6ff3b'];
  for (let i = 0; i < 7; i++) {
    const col = cols[i % 3];
    const x = r() * W, y = r() * H * 0.7, len = 120 + r() * 260, wdt = 8 + r() * 22;
    g.save(); g.translate(x, y); g.rotate(-0.5 + r() * 0.25);
    g.globalAlpha = 0.55 + r() * 0.3;
    g.fillStyle = col; g.fillRect(0, 0, len, wdt);
    for (let d = 0; d < 4; d++) { const dx = r() * len; g.fillRect(dx, wdt, 3 + r() * 4, 10 + r() * 50); g.beginPath(); g.arc(dx + 3, wdt + 40 * r() + 10, 4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  // Hazard band at the bottom.
  g.save(); g.beginPath(); g.rect(0, H - 54, W, 40); g.clip();
  for (let x = -60; x < W + 60; x += 48) { g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(x, H - 14); g.lineTo(x + 24, H - 14); g.lineTo(x + 64, H - 54); g.lineTo(x + 40, H - 54); g.fill(); }
  g.restore();
  g.globalAlpha = 1;
  return { map: tex(c), bump: tex(cb, { srgb: false, repeat: true }) };
}

/** Egg-crate foam lining (the inside of the lid). */
export function foamTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a2b31'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = x * 32 + 16 + (y % 2) * 16, cy = y * 32 + 16;
    const grd = g.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 17);
    grd.addColorStop(0, '#8a8c96'); grd.addColorStop(0.6, '#45464e'); grd.addColorStop(1, 'rgba(30,31,36,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 17, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { repeat: true });
}

const FONT ='"Helvetica Neue", "Arial Black", Arial, system-ui, sans-serif';

/** The printed / stencilled / neon logo plate on the case's front (transparent PNG-like). */
export function logoTexture(series) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (series === 'night-park') {
    // Neon tube lettering: a coloured glow under a white-hot core.
    const tube = (fn, col) => {
      g.save(); g.shadowColor = col; g.shadowBlur = 28; g.strokeStyle = col; g.lineWidth = 16; g.lineJoin = g.lineCap = 'round'; fn(); g.restore();
      g.save(); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineJoin = g.lineCap = 'round'; fn(); g.restore();
    };
    tube(() => { g.beginPath(); g.arc(250, 190, 92, Math.PI * 0.35, Math.PI * 1.65); g.arc(290, 175, 72, Math.PI * 1.55, Math.PI * 0.45, true); g.stroke(); }, '#ff3bd4');
    tube(() => { g.beginPath(); g.moveTo(330, 300); g.lineTo(560, 230); g.moveTo(370, 288); g.lineTo(370, 330); g.moveTo(520, 242); g.lineTo(520, 290); g.stroke(); }, '#2bf0ff');
    g.font = `italic 900 104px ${FONT}`;
    tube(() => g.strokeText('NIGHT', 690, 150), '#2bf0ff');
    tube(() => g.strokeText('PARK', 700, 280), '#ff3bd4');
    g.font = `800 34px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('SENDIT  ·  AFTER DARK', 512, 430);
  } else if (series === 'backcountry') {
    // Spray stencil in beacon orange with topo rings.
    g.strokeStyle = 'rgba(255,106,26,0.95)';
    g.lineWidth = 7;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(170, 230, 40 + i * 26, 30 + i * 20 + Math.sin(i) * 6, -0.3 + i * 0.05, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,106,26,0.95)';
    g.beginPath(); g.moveTo(120, 280); g.lineTo(170, 170); g.lineTo(200, 230); g.lineTo(220, 200); g.lineTo(260, 280); g.closePath(); g.fill();
    g.font = `900 92px ${FONT}`;
    g.textAlign = 'left';
    const stencil = (text, x, y) => {
      g.fillText(text, x, y);
      // Stencil bridges: thin vertical gaps through the letters.
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let gx = x + 30; gx < x + g.measureText(text).width; gx += 58) g.fillRect(gx, y - 50, 5, 100);
      g.restore();
    };
    stencil('BACK', 330, 180);
    stencil('COUNTRY', 330, 280);
    g.font = `800 30px ${FONT}`;
    g.fillStyle = 'rgba(242,239,230,0.85)';
    g.fillText('EXPEDITION GEAR  ·  HANDLE WITH CARE  ↑', 120, 400);
    // Spray overspray speckle.
    const r = rng(5);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,106,26,${r() * 0.25})`; g.fillRect(100 + r() * 820, 100 + r() * 340, 2, 2); }
  } else {
    // First Chair: a clean white pad print with a chairlift glyph and a yellow underline.
    g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(80, 120); g.lineTo(330, 70); g.stroke();             // cable
    g.beginPath(); g.moveTo(205, 95); g.lineTo(205, 170); g.stroke();             // hanger
    g.beginPath(); g.moveTo(140, 170); g.lineTo(270, 170); g.lineTo(270, 250); g.moveTo(140, 170); g.lineTo(140, 250); g.stroke();
    g.beginPath(); g.moveTo(130, 250); g.lineTo(280, 250); g.stroke();            // seat
    g.font = `italic 900 112px ${FONT}`;
    g.textAlign = 'left';
    g.fillText('FIRST', 370, 140);
    g.fillText('CHAIR', 370, 255);
    g.fillStyle = '#ffd23f';
    g.fillRect(372, 312, 560, 18);
    g.font = `800 32px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('SENDIT GEAR CO.  ·  EST. VALCREST', 372, 380);
  }
  return tex(c);
}
