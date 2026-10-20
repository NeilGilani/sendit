// Challenge mode (activities.js) on a trail that starts part-way down the course: the gates above its start are
// not judged (they used to count as missed, +2 s each, the moment the clock started), the medal distance is the
// part of the course the trail covers, and each trail keeps its own best / ghost (the main trail keeps the
// course's key, so old saves stay with it).   node web/scripts/challenge-unit.mjs
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.addEventListener = () => {};
const ctx2d = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }), getElementById: () => null, querySelector: () => null, body: { classList: { toggle() {}, add() {}, remove() {} } } };
const THREE = await import('three');
const { Activities, trailKey, trailKeyFor, bestFor } = await import('../src/activities.js');
const { State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

// A straight 1000 m course down -z: progress = -z.
const course = { key: 'testcourse', finishAt: 1000, progress: (x, z) => -z, dropsAt: [] };
const features = { kickers: [], at: (s) => ({ p: new THREE.Vector2(0, -s), dir: new THREE.Vector2(0, -1) }) };
const terrain = { getHeight: () => 0 };
const player = { state: State.FROZEN, position: new THREE.Vector3(), renderPos: new THREE.Vector3(), speed: 0, turnInput: 0, heading: 0 };
const scene = new THREE.Scene();
const A = new Activities({ scene, course, features, terrain, player, fx: null });
game.mode = Mode.RIDING;
const map = { trails: [{ id: 'main' }, { id: 'lower' }] };

const run = (startZ) => {
  player.position.set(0, 0, startZ);
  A.start('challenge');
  for (let i = 0; i < 300 && A.state !== 'running'; i++) A.update(1 / 60);
  return A.hud();
};

ok(A.gates.length > 8, `course has gates (${A.gates.length})`);
A.setTrail(map, 'main');
let h = run(0);
ok(A.key === 'testcourse' && trailKeyFor(course, map, 'main') === 'testcourse', 'main trail keeps the course key');
ok(h.penalty === 0 && h.gateTotal === A.gates.length, `main trail: no penalty at the start, all ${h.gateTotal} gates count`);

A.setTrail(map, 'lower');
h = run(-600);
ok(A.key === 'testcourse~lower' && trailKey(course, 'lower', false) === A.key, `other trail has its own key (${A.key})`);
ok(h.penalty === 0, `trail starting at 600 m: no instant missed-gate penalty (penalty ${h.penalty})`);
const below = A.gates.filter((g) => g.s > 605).length;
ok(h.gateTotal === below && h.nextGate === A.gates.length - below, `only the ${below} gates below the start count (${h.gateTotal})`);
// Ride straight down the middle to the finish: gates on the line pass or miss, never the skipped ones.
for (let z = -600; z > -1000; z -= 0.5) { player.position.z = z; A.update(1 / 60); }
const res = A.finish();
ok(res && res.gateTotal === below, `results: ${res?.gates}/${res?.gateTotal} gates`);
ok(bestFor('testcourse~lower') && bestFor('testcourse') === null, 'the lower trail\'s best is its own (the main trail has none yet)');
// Medal over the 400 m the trail covers: 12 m/s average (gold) over 400 m is gold, not 'too slow for 1000 m'.
A.setTrail(map, 'lower');
run(-600);
A.time = 400 / 12;
A.penalty = 0;
const r2 = A.finish();
ok(r2.medal === 'gold' || r2.medal === 'silver', `medal over the trail's own distance (${r2.medal})`);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
