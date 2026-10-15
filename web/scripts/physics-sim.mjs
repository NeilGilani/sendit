// Headless physics bench: runs the real Player + Ski/Snowboard physics on synthetic slopes (no WebGL)
// and prints the numbers compared against the targets in docs/equipment-research.md.
// Usage: node web/scripts/physics-sim.mjs [ski|snowboard|both] [variant]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;

const DT = 1 / 60;
const scores = [];
on('score', (s) => scores.push(s.label));

/** Plane falling toward −Z at `deg`, optional flat run-out, surface vector (groomed, powder, rock, forest). */
function terrain({ deg = 0, surface = [1, 0, 0, 0] } = {}) {
  const k = Math.tan(deg * Math.PI / 180);
  const T = {
    half: 1e7, spacing: 1,
    getHeight: (x, z) => z * k,
    getNormal: (x, z, r = 0, out = new THREE.Vector3()) => { const e = Math.max(r, 1); return out.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); },
    getSurface: (x, z, out = new THREE.Vector4()) => out.set(...surface),
    getSpawn: () => ({ position: new THREE.Vector3(0, 0, 0), heading: 0 }),
  };
  return T;
}
const input = { strength: () => 0, justPressed: () => false };

function rider(type, variant, tOpts, stance) {
  const p = new Player(terrain(tOpts), null, null, input);
  p.setEquipment(type, variant);
  if (stance) p.setStance(stance);
  p.place(new THREE.Vector3(0, 0, 0), 0);
  return p;
}
function run(p, seconds, ctrl = {}, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    p.script = (c) => { if (!p.autoTuck) p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, typeof ctrl === 'function' ? ctrl(i * DT, p) : ctrl); };
    p.step(DT);
    each?.(p, i * DT);
  }
}
const f = (x, d = 1) => Number(x).toFixed(d);
const deg = (r) => f(r * 180 / Math.PI, 0);

function bench(type, variant) {
  const out = [];
  const say = (k, v, target = '') => out.push(`  ${k.padEnd(34)} ${String(v).padEnd(28)} ${target}`);
  console.log(`\n=== ${type} / ${variant || 'default'} ===`);
  // 1. Straight-line terminal speed on 25° groomed, cruise and tuck.
  for (const tuck of [0, 1]) {
    const p = rider(type, variant, { deg: 25 });
    let t95 = 0, last = 0;
    run(p, 40, { tuck }, (pl, t) => { if (Math.abs(pl.speed - last) > 0.002) t95 = t; last = pl.speed; });
    say(`top speed 25° ${tuck ? 'tuck' : 'cruise'}`, `${f(p.speed)} m/s (${f(p.speed * 3.6, 0)} km/h)`, type === 'ski' ? (tuck ? '≈20' : '≈16') : (tuck ? '≈18.5' : '≈15'));
  }
  {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -12);
    run(p, 1.4, {});
    say('straight glide 12 m/s flat 1.4 s', `keeps ${f(p.speed / 12 * 100, 0)}%`, 'baseline for carve speed loss');
  }
  // 2. Carves on a flat plane at fixed entry speeds: radius, edge, lateral g, speed kept.
  for (const v0 of [8, 12, 16]) {
    for (const steer of [0.5, 1]) {
      const p = rider(type, variant, { deg: 0 });
      p.velocity.set(0, 0, -v0); p.speed = v0;
      let maxEdge = 0, sumR = 0, nR = 0, maxBeta = 0, latG = 0;
      run(p, 1.4, { steer }, (pl, t) => {
        if (t > 0.6) {
          const w = Math.abs(pl.dyn.velYawRate);
          if (w > 1e-3) { sumR += pl.speed / w; nR++; }
          maxEdge = Math.max(maxEdge, Math.abs(pl.edgeAngle));
          maxBeta = Math.max(maxBeta, Math.abs(pl.skidAngle));
          latG = Math.max(latG, Math.abs(pl.latAccel) / 9.81);
        }
      });
      say(`carve v0=${v0} steer=${steer}`, `R ${f(sumR / Math.max(nR, 1))} m edge ${deg(maxEdge)}° ${f(latG, 2)} g β ${deg(maxBeta)}°`, `keeps ${f(p.speed / v0 * 100, 0)}% speed q=${f(p.carveQuality, 2)}`);
    }
  }
  // 3. Edge switch time: full right → full left at 12 m/s.
  {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -12);
    run(p, 1.0, { steer: 1 });
    const e0 = p.edgeAngle; const hist = [];
    run(p, 1.5, { steer: -1 }, (pl, t) => hist.push([t, pl.edgeAngle]));
    const eEnd = p.edgeAngle, tSwitch = hist.find(([, e]) => e - e0 <= (eEnd - e0) * 0.9)?.[0];
    say(type === 'snowboard' ? 'edge switch toe→heel (regular, 90%)' : 'edge switch R→L (90%)', `${f(tSwitch ?? -1, 2)} s from ${deg(e0)}° to ${deg(p.edgeAngle)}°`, type === 'ski' ? '≈0.30 s' : '≈0.46 s');
    if (type === 'snowboard') {
      const q = rider(type, variant, { deg: 0 });
      q.velocity.set(0, 0, -12);
      run(q, 1.0, { steer: -1 });
      const e1 = q.edgeAngle; const h2 = [];
      run(q, 1.5, { steer: 1 }, (pl, t) => h2.push([t, pl.edgeAngle]));
      const e2 = q.edgeAngle, t2 = h2.find(([, e]) => e - e1 >= (e2 - e1) * 0.9)?.[0];
      say('edge switch heel→toe (regular)', `${f(t2 ?? -1, 2)} s (${deg(e1)}°→${deg(q.edgeAngle)}°)`, '≈0.38 s');
    }
  }
  // 4. Stops on flat from 12 m/s.
  for (const steer of type === 'snowboard' ? [0, 1] : [0]) {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -12);
    let t = 0, dist = 0, maxRot = 0;
    run(p, 6, { brake: 1, steer }, (pl, tt) => { if (pl.speed > 0.4) { t = tt; dist += pl.speed * DT; } maxRot = Math.max(maxRot, Math.abs(pl.skidAngle)); });
    const name = type === 'ski' ? 'hockey stop 12→0' : steer ? 'toe-side stop 12→0' : 'heel-side stop 12→0';
    say(name, `${f(t, 2)} s, ${f(dist)} m, avg ${f(12 / Math.max(t, 0.01))} m/s², rot ${deg(maxRot)}°`, type === 'ski' ? '≈6.5 m/s²' : steer ? '≈4.5' : '≈5.5');
  }
  if (type === 'ski') {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -5);
    let t = 0;
    run(p, 6, { brake: 1 }, (pl, tt) => { if (pl.speed > 0.3) t = tt; });
    say('snowplough 5→0', `${f(t, 2)} s avg ${f(5 / Math.max(t, 0.01))} m/s², plow ${f(p.plow, 2)}`, '1.5–2.5 m/s²');
  }
  // 5. Pop on flat, full charge and tap.
  for (const [hold, label] of [[0.6, 'full'], [0.05, 'tap']]) {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -6);
    let maxH = 0, air = 0;
    run(p, 3, (t) => ({ jump: t < hold }), (pl) => { if (pl.state === State.AIR) { maxH = Math.max(maxH, pl.position.y); air = pl.airTime; } });
    say(`pop ${label}`, `${f(maxH, 2)} m, air ${f(air, 2)} s, v ${f(p.lastPop, 2)}`, type === 'ski' ? '0.30 m / 0.49 s (arcade ×2)' : '0.45 m / 0.61 s (arcade ×2)');
  }
  // 6. Spins off a launch (vy 7, 10 m/s): steer until the rotation is ~0.15 s short of the target, like a player.
  for (const [steer, target] of [[-1, 180], [1, 180], [-1, 360], [1, 540]]) {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 7, -10);
    p.position.y = 0.5; p.enterAir(false);
    scores.length = 0;
    let maxRate = 0;
    run(p, 3, (t, pl) => ({ steer: Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.14 < target * Math.PI / 180 ? steer : 0 }), (pl) => { maxRate = Math.max(maxRate, Math.abs(pl.spinRate)); });
    const L = p.lastLanding || { result: 'crash' };
    say(`spin ${steer < 0 ? 'left' : 'right'} ${target}`, `${f(maxRate, 2)} rad/s → ${L.result}${L.switch ? ' switch' : ''} dev ${f(L.dev ?? 0, 0)}°`, `"${L.trick ?? ''}" ${scores.join(',')}`);
  }
  // 7. Butter (board): hold Space and steer at 6 m/s.
  if (type === 'snowboard') {
    const p = rider(type, variant, { deg: 0 });
    p.velocity.set(0, 0, -6);
    const h0 = p.heading;
    run(p, 0.8, { jump: true, steer: 1 });
    say('tail butter 0.8 s', `rot ${deg(Math.abs(p.heading - h0))}°, v ${f(p.speed)} m/s, butter ${f(p.butter, 2)}`, 'pivot ≈3 rad/s');
  }
  // 8. Powder: steady speed on 25° deep snow and bog-down speed on 10°.
  {
    const p = rider(type, variant, { deg: 21, surface: [0, 1, 0, 0] });
    run(p, 40, {});
    say('powder 21° (course) steady', `${f(p.speed)} m/s, sink ${f(p.sink, 2)} m`, type === 'ski' ? '11–12 m/s, 0.15 m' : '13–14 m/s, 0.06 m');
    const q = rider(type, variant, { deg: 10, surface: [0, 1, 0, 0] });
    run(q, 40, {});
    say('powder 10° steady (old ≈7.9)', `${f(q.speed)} m/s, sink ${f(q.sink, 2)} m`, '');
  }
  // 9. Slalom: alternate full steer every 1.2 s down 20°; average speed kept, skid.
  {
    const p = rider(type, variant, { deg: 20 });
    p.velocity.set(0, 0, -10);
    let sk = 0, n = 0, maxV = 0;
    run(p, 12, (t) => ({ steer: Math.floor(t / 1.2) % 2 ? -1 : 1 }), (pl) => { sk += pl.skid; n++; maxV = Math.max(maxV, pl.speed); });
    say('slalom 20° full-lock 1.2 s', `v ${f(p.speed)} m/s (max ${f(maxV)}), skid ${f(sk / n, 2)}`, '');
  }
  console.log(out.join('\n'));
}

const which = process.argv[2] || 'both';
const variant = process.argv[3];
if (which === 'ski' || which === 'both') bench('ski', variant);
if (which === 'snowboard' || which === 'both') bench('snowboard', variant);
