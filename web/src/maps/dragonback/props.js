// Dragonback props (browser only; loaded by index.js).
import * as THREE from 'three';

export function buildDragonbackProps(course, { terrain }) {
  void terrain;
  const group = new THREE.Group();
  group.name = 'DragonbackProps';
  return group;
}
