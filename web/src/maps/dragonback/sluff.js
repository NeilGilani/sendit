// Dragonback — sluff in the gullies (headless; course.onPlayer → attachSluff). The ridges shed their snow into
// the gullies between them: deep, heavy, sluffed powder that drags at a rider (Alaska spine lines: the crest is
// firm and fast, the channels are where the snow piles up). On the snow in a gully floor the rider loses
// `sluffDrag` × speed × gully-ness per second (physics.common.sluffDrag, tuning.js), so the low line is a real
// recovery line — always rideable, never a dead end, but slower than staying high on the crests.
import { PHYSICS as P } from '../../config.js';

export function attachSluff(course, pl) {
  if (!P.sluffDrag) return;
  const step = pl.step.bind(pl);
  pl.step = (dt) => {
    step(dt);
    if (pl.state !== 1 || pl.speed < 6) return;                  // State.GROUNDED, at speed
    const g = course.gullyAt(pl.position.x, pl.position.z);
    if (g <= 0) return;
    const k = Math.max(0, 1 - P.sluffDrag * g * dt);
    pl.velocity.multiplyScalar(k);
    pl.speed *= k;
  };
}
