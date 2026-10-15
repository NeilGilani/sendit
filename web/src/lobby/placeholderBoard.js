// A clearly labelled PLACEHOLDER snowboard for the lobby preview, used only until the real board
// (rider.setEquipment / createEquipmentModel from src/equipment/) exists. Built in rider space:
// the rider faces −Z with the boots at x = ±0.13 m, so the board runs along X under both feet.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from '../world.js';

const L = 1.5, W = 0.27, T = 0.018;

function boardGeometry() {
  const g = new THREE.BoxGeometry(L, T, W, 48, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const tip = Math.max(0, Math.abs(x) - (L / 2 - 0.17)) / 0.17;      // 0 → 1 over the last 17 cm
    p.setY(i, p.getY(i) + tip * tip * 0.075);                           // twin rocker: both ends up
    const round = Math.sqrt(Math.max(0.06, 1 - tip * tip * 0.94));       // rounded nose and tail
    const sidecut = 1 - 0.07 * Math.cos((x / L) * Math.PI);
    p.setZ(i, p.getZ(i) * round * sidecut);
  }
  g.computeVertexNormals();
  return g;
}

function topTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1446';
  g.fillRect(0, 0, c.width, c.height);
  // Hazard stripes = "work in progress".
  g.save();
  g.globalAlpha = 0.9;
  g.fillStyle = '#ff5fb0';
  for (let x = -200; x < c.width + 200; x += 70) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x - 30, c.height); g.lineTo(x - 62, c.height); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = '#1b1446';
  g.fillRect(150, 42, c.width - 300, c.height - 84);
  g.fillStyle = '#ffffff';
  g.font = 'italic 900 78px "Arial Black", "Segoe UI Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PLACEHOLDER', c.width / 2, c.height / 2 + 4);
  g.strokeStyle = '#2ff5d6'; g.lineWidth = 6;
  g.strokeRect(150, 42, c.width - 300, c.height - 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Group with the board + two strap bindings. `userData.placeholder = true`. */
export function createPlaceholderBoard() {
  const group = new THREE.Group();
  group.name = 'PlaceholderSnowboard';
  group.userData.placeholder = true;

  const side = toonMaterial({ name: 'phBoardSide', color: 0x141a3c, rim: 0.5 });
  const top = toonMaterial({ name: 'phBoardTop', map: topTexture(), rim: 0.5 });
  const base = toonMaterial({ name: 'phBoardBase', color: 0xff5fb0, rim: 0.4 });
  // BoxGeometry groups: +x, −x, +y (top), −y (base), +z, −z.
  const board = new THREE.Mesh(boardGeometry(), [side, side, top, base, side, side]);
  board.castShadow = true;
  board.receiveShadow = true;
  board.add(new THREE.Mesh(board.geometry, outlineMaterial(1.0)));
  board.position.y = 0.03;
  group.add(board);

  const dark = toonMaterial({ name: 'phBinding', color: 0x161a30, rim: 0.6 });
  const strap = toonMaterial({ name: 'phStrap', color: 0x2ff5d6, rim: 0.6 });
  strap.userData.uniforms.uEmissiveBoost.value = 0;
  for (const sx of [-1, 1]) {
    const b = new THREE.Group();
    b.position.set(sx * 0.15, 0.045, 0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.25), dark);
    const high = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.018), dark);
    high.position.set(0, 0.08, 0.12); high.rotation.x = -0.25;
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.05), strap);
    s1.position.set(0, 0.085, -0.02);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.025, 0.04), strap);
    s2.position.set(0, 0.05, -0.1);
    for (const m of [plate, high, s1, s2]) { m.castShadow = true; b.add(m); }
    group.add(b);
  }
  return group;
}
