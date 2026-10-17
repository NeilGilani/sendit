// Dragonback — respawning on a ridge (headless; course.onPlayer → attachRespawn). After a crash the game puts
// you back at a safe point a few seconds up your line (player.js respawnSafe), standing still. On this map
// that is often a knife-edge crest: standing on a 2 m-wide top above 45° flanks you slide off sideways before
// you can get going. So when a respawn (or a drop zone) lands you on a ridge, you are set on the crest's centre
// line, pointing down it, already rolling at `respawnRoll` m/s (physics.common.respawnRoll, tuning.js).
import * as THREE from 'three';
import { on } from '../../state.js';
import { PHYSICS as P } from '../../config.js';
import { START_X } from './layout.js';

export function attachRespawn(course, pl) {
  if (!pl.flow) return;                              // the real ride / the bots, never the lobby
  const off = on('respawned', () => {
    const u = pl.position.x - START_X;
    const hit = course.ridgeAt(u, pl.position.z, 0.6);
    if (!hit || hit.H < 6) return;
    const r = hit.ridge, v = r.crestAt(u), dvdu = (r.crestAt(u + 3) - r.crestAt(u - 3)) / 6;
    const heading = Math.atan2(-1, -dvdu);           // down the crest (yaw 0 = facing −z)
    pl.place(new THREE.Vector3(START_X + u, 0, v), heading);
    const roll = P.respawnRoll ?? 0;
    if (roll > 0) {
      const n = pl.groundNormal, d = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
      d.addScaledVector(n, -d.dot(n)).normalize();
      pl.velocity.copy(d).multiplyScalar(roll);
      pl.speed = roll;
    }
  });
  const dispose = pl.flow.dispose.bind(pl.flow);
  pl.flow.dispose = () => { dispose(); off(); };
}
