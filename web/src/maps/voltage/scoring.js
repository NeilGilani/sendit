// Voltage Park — the slopestyle judge (headless; research §7: FIS judges one overall impression out of 100 from
// amplitude, difficulty, execution, variety and progression/flow; winning runs score 82–93).
//
// A run is judged section by section on the slopestyle course: three rail sections (the best grind on each:
// its points carry the rail's difficulty, length, slide / switch / press / switch-ups / spins on and off) and
// the five jumps (rotation, flips, grab, switch; amplitude from where you landed on the knuckle-to-sweet-spot
// landing; execution from the landing grade). Then:
//   Sections  0–60   eight sections × 0–10, scaled to 60 (a crash on a section zeroes it)
//   Variety   0–20   different spin directions / axes, different grinds (THPS-style decay for repeats)
//   Amplitude 0–10   sweet spots and deep landings on the jumps
//   Flow      0–10   no crashes, no stalls, carrying speed (average speed over the run: 19 m/s for full marks)
// Medals (Challenge): gold ≥ 80, silver ≥ 65, bronze ≥ 50.
import { on, emit } from '../../state.js';
import { START_X } from './layout.js';

export const MEDALS = { gold: 80, silver: 65, bronze: 50 };
const SECTIONS = ['Section 1', 'Section 2', 'Section 3', 'Lightning', 'Thunder', 'Voltage', 'Megawatt', 'The Gap'];
// Where each section ends along the course (u, m): a crash before it zeroes that section.
const SECTION_END = [140, 245, 400, 560, 680, 800, 990, 1e9];

export class SlopeJudge {
  constructor(course) {
    this.course = course;
    this.reset();
    on('rideStarted', () => this.reset());
    on('resetTop', () => this.reset());
    on('grindScore', (g) => this.onGrind(g));
    on('landed', (e) => this.onLanded(e));
    on('parkLanding', (e) => this.onZone(e));
    on('crashed', () => this.onCrash());
    on('grindEnd', (e) => { if (e.reason === 'stall') this.run.stalls++; });
  }

  reset() {
    this.run = { t0: performance?.now?.() ?? 0, sec: {}, moves: new Map(), crashes: 0, stalls: 0, sweet: 0, deep: 0, jumps: 0, speedSum: 0, speedT: 0 };
    this.lastJump = null;
  }

  /** Per physics frame from the HUD (average speed for flow). */
  tick(dt, pl) { if (pl && (pl.state === 1 || pl.state === 5)) { this.run.speedSum += pl.speed * dt; this.run.speedT += dt; } }

  move(key) {
    const n = this.run.moves.get(key) || 0;
    this.run.moves.set(key, n + 1);
    return [1, 0.75, 0.5, 0.25, 0.1][Math.min(4, n)];
  }

  sectionScore(name, s) {
    const cur = this.run.sec[name];
    if (cur === undefined || s > cur) this.run.sec[name] = s;
  }

  onGrind(g) {
    const r = this.course.rails.find((q) => q.name === g.rail);
    const decay = this.move(`grind:${(g.tricks || []).join('>')}:${r?.kind}`);
    if (!r?.section) return;
    // A clean 50-50 down a 10 m rail ≈ 350 pts → ~4.5; a long boardslide with a switch-up and a spin out ≈ 9–10.
    const s = Math.min(10, (1.2 + g.points / 95) * (0.6 + 0.4 * decay));
    this.sectionScore(r.section, s);
  }

  onLanded(e) {
    const pl = this.course.player;
    if (!pl?.takeoffPos || e.air < 0.6) return;
    const name = this.course.featureAt(pl.takeoffPos.x, pl.takeoffPos.z);
    if (!SECTIONS.includes(name) && name !== 'The Tower') return;
    const L = pl.lastLanding || {};
    const spins = L.spins || 0, flips = L.flips || 0;
    const t = pl.dyn?.takeoff || {};
    const dir = spins ? (t.spin > 0 ? 'L' : 'R') : '';
    const decay = this.move(`air:${spins}${dir}:${flips}`);
    let diff = 1.5 + spins * 1.15 + flips * 2.3 + (t.grab && t.grabT > 0.3 ? 1 : 0) + (t.switch ? 0.7 : 0);
    diff = Math.min(8.5, diff);
    const exec = !e.clean ? 0.5 : e.grade === 'stomped' || e.perfect ? 1.08 : 1;
    this.lastJump = { name, zone: null, score: diff * exec * (0.6 + 0.4 * decay), clean: e.clean };
    this.run.jumps++;
    this.sectionScore(name, Math.max(0, Math.min(10, this.lastJump.score)));
  }

  /** Where the jump landed (park.js 'parkLanding', right after 'landed'): amplitude for the section. */
  onZone(e) {
    const J = this.lastJump;
    if (!J || J.name !== e.jump || J.zone) return;
    J.zone = e.zone;
    const amp = { sweet: 1.5, deep: 1.0, short: 0, knuckle: -1, cased: -2, overshot: -1.5 }[e.zone] ?? 0;
    if (e.zone === 'sweet') this.run.sweet++;
    if (e.zone === 'deep') this.run.deep++;
    // The section keeps its best attempt; a worse landing on the same jump replaces the provisional score.
    const s = Math.max(0, Math.min(10, J.score + amp));
    const cur = this.run.sec[J.name];
    if (cur === undefined || s > cur || cur === Math.max(0, Math.min(10, J.score))) this.run.sec[J.name] = s;
  }

  onCrash() {
    this.run.crashes++;
    const pl = this.course.player;
    if (!pl) return;
    // The section you crashed in is lost.
    const u = pl.position.x - START_X;
    const sec = SECTIONS[SECTION_END.findIndex((e) => u < e)];
    if (Math.abs(pl.position.z) < 40) this.run.sec[sec] = 0;
  }

  /** The judged run: { total, sections, variety, amplitude, flow, medal, rows }. */
  judge() {
    const r = this.run;
    const sections = SECTIONS.map((n) => ({ name: n, score: r.sec[n] ?? 0 }));
    const secPts = sections.reduce((s, x) => s + x.score, 0) * 60 / (10 * SECTIONS.length);
    let distinct = 0, total = 0;
    for (const [, n] of r.moves) { distinct++; total += n; }
    const variety = Math.min(20, distinct * 2.6 - Math.max(0, total - distinct) * 0.4);
    const amplitude = Math.min(10, r.sweet * 3 + r.deep * 1.5);
    const avg = r.speedT > 0 ? r.speedSum / r.speedT : 0;
    const flow = Math.max(0, Math.min(10, avg / 1.9 - r.crashes * 4 - r.stalls * 1.5));   // full marks from 19 m/s (68 km/h) average
    const totalScore = Math.round(Math.max(0, Math.min(100, secPts + Math.max(0, variety) + amplitude + flow - r.crashes * 6)) * 100) / 100;
    const medal = totalScore >= MEDALS.gold ? 'gold' : totalScore >= MEDALS.silver ? 'silver' : totalScore >= MEDALS.bronze ? 'bronze' : null;
    const f1 = (x) => x.toFixed(1);
    const rows = [
      ...sections.map((s) => [s.name, f1(s.score)]),
      ['Variety · Amplitude · Flow', `${f1(Math.max(0, variety))} · ${f1(amplitude)} · ${f1(flow)}`],
      ['Gold · Silver · Bronze', `${MEDALS.gold} · ${MEDALS.silver} · ${MEDALS.bronze}`],
    ];
    return { total: totalScore, sections, variety: Math.max(0, variety), amplitude, flow, crashes: r.crashes, medal, avg, rows };
  }

  /** Called at the finish (zen runs: the HUD shows the card). */
  finish() {
    const j = this.judge();
    emit('slopeJudged', j);
    return j;
  }
}
