// Terminal speeds on constant slopes with Ravenspire's physics vs the defaults: straight down a plane of
// deep powder for 60 s, tucked and upright, skis and snowboard. Shows what "22–31 m/s" means per slope.
// Usage: node web/scripts/map3-speeds.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player } = await import('../src/player.js');
const { RAVENSPIRE_PHYSICS } = await import('../src/maps/ravenspire/tuning.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

function plane(deg, physics) {
  const g = Math.tan(deg * Math.PI / 180);
  return {
    half: 1e6, spacing: 1, course: { physics },
    getHeight: (x) => -g * x,
    baseHeight: (x) => -g * x,
    getNormal: (x, z, r, out = new THREE.Vector3()) => out.set(g, 1, 0).normalize(),
    getSurface: (x, z, out = new THREE.Vector4()) => out.set(0, 1, 0, 0),
    isInside: () => true,
    getSpawn: () => ({ position: new THREE.Vector3(), heading: -Math.PI / 2 }),
  };
}

const rows = [];
for (const [label, physics] of [['Ravenspire', RAVENSPIRE_PHYSICS], ['defaults', null]]) {
  for (const type of ['ski', 'snowboard']) {
    for (const tuck of [1, 0]) {
      const r = [];
      for (const deg of [20, 27, 34, 41, 45]) {
        const p = new Player(plane(deg, physics), null, null, { strength: () => 0, justPressed: () => false });
        p.setEquipment(type); p.fadeThen = () => {}; p.flow?.dispose(); p.flow = null;
        p.place(new THREE.Vector3(0, 0, 0), -Math.PI / 2);
        p.script = (c) => { c.tuck = tuck; };
        p.dyn._noInputT = tuck ? 999 : -999;
        for (let i = 0; i < 60 * 60; i++) p.step(1 / 60);
        r.push(p.speed);
      }
      rows.push(`${label.padEnd(10)} ${type.padEnd(9)} ${tuck ? 'tucked ' : 'upright'}  ` + r.map((v, i) => `${[20, 27, 34, 41, 45][i]}°: ${v.toFixed(1)} m/s (${(v * 2.237).toFixed(0)} mph)`).join('  '));
    }
  }
}
console.log(rows.join('\n'));
