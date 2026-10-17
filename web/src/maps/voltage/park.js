// Voltage Park — per-rider park logic (headless; course.onPlayer → attachPark):
//   • Pipe / quarterpipe vert: the top of a real wall is vertical, so a take-off from a wall steeper than
//     55° turns the speed across the wall into height (you go straight up and come down on the same wall).
//     The height field tops out at 80–82°, which on its own would throw you onto the deck.
//   • Timing feedback: pop timing at a lip ('parkPop'), where you landed on a jump ('parkLanding': cased /
//     knuckle / short / SWEET SPOT / deep / overshot — the sweet spot scores), stalls and clean rides away.
//   • Line goals for rails: a banked grind steps the goals by rail name and section.
//   • Run tracking for the slopestyle judge (scoring.js): every scored move with where it happened.
import { emit, on, addScore } from '../../state.js';

export function attachPark(course, pl) {
  course.player = pl;
  const mine = () => course.player === pl;
  const offs = [];
  // ---- pipe vert
  offs.push(on('takeoff', () => {
    if (!mine()) return;
    pl.pipeAir = null;
    const n = course.wallNormal(pl.takeoffPos?.x ?? pl.position.x, pl.takeoffPos?.z ?? pl.position.z) || course.wallNormal(pl.prevPos.x, pl.prevPos.z);
    if (!n) return;
    const v = pl.velocity;
    const into = v.x * n[0] + v.z * n[1];             // + = moving back into the pipe
    if (into >= 0 || v.y < 1) return;
    v.x -= into * n[0]; v.z -= into * n[1];
    v.y = Math.sqrt(v.y * v.y + into * into);
    // Hang just inside the coping so the way down is the wall, not the deck.
    pl.position.x += n[0] * 0.45; pl.position.z += n[1] * 0.45;
    pl.pipeAir = { n, t: 0 };
    if (pl.dyn) pl.dyn.airPred = pl.dyn.timeToLand();
    emit('pipeAir', { height: v.y * v.y / 19.62 });
  }));
  // ---- pop timing
  offs.push(on('jumped', () => {
    if (!mine() || pl.state === 5) return;
    const ahead = pl.lipAhead ? pl.lipAhead(0.75) : null;
    const lipNear = (pl.lastLip || 0) > 0.2 || ahead !== null;
    if (!lipNear) return;
    const q = pl.lastPopQ ?? 0;
    emit('parkPop', { q, label: q >= 0.95 ? 'PERFECT POP' : q >= 0.8 ? 'GOOD POP' : 'EARLY POP' });
  }));
  // ---- landing zone on the jump you took off from
  offs.push(on('landed', (e) => {
    if (!mine() || !pl.takeoffPos || e.air < 0.5) return;
    const L = course.landingAt(pl.position.x, pl.position.z);
    const from = course.featureAt(pl.takeoffPos.x, pl.takeoffPos.z);
    if (!L || !L.f.jump?.land || (from && from !== L.f.name)) return;
    const J = L.f.jump, k = J.knuckle?.a ?? J.lipA + J.table, sweet = J.land.sweet?.a ?? k + 6, end = L.f.marks.landingEnd?.a ?? sweet + 15;
    const a = L.a;
    let zone;
    if (a < k - 1.2) zone = 'cased';
    else if (a < k + 1.5) zone = 'knuckle';
    else if (a < sweet - 7) zone = 'short';
    else if (a <= sweet + 7) zone = 'sweet';
    else if (a <= end + 2) zone = 'deep';
    else zone = 'overshot';
    const dist = a - J.lipA;
    emit('parkLanding', { zone, jump: L.f.name, dist, clean: e.clean, impact: e.impact });
    if (zone === 'sweet' && e.clean) addScore(`Sweet spot · ${Math.round(dist)} m`, Math.round(60 * (pl.flow ? pl.flow.scoreMul() : 1)));
  }));
  // ---- rails feed the line goals
  offs.push(on('grindScore', (g) => {
    if (!mine() || !pl.flow) return;
    const r = course.rails.find((q) => q.name === g.rail);
    pl.flow.goalStep([g.rail, r?.section]);
  }));
  pl.parkOffs = offs;
  // Run tracking for the judge (average speed on the snow and the rails).
  const step0 = pl.step.bind(pl);
  pl.step = (dt) => { step0(dt); if (mine() && pl.state !== 0) course.judgeRun?.tick(dt, pl); };
}
