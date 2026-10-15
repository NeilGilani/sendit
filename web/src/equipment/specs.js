// Equipment catalogue — every ski and snowboard model is plain data. Physics (physics/*.js), the rider
// (rider.js) and the 3D model builder (models.js) all read these specs, so a new model is one entry
// here (see docs/equipment.md → "Adding a model"). Units: metres, kilograms, degrees for angles.
//
// Geometry
//   length        running length tip→tail (m)
//   tip/waist/tail widths at the widest points and the waist (m). For snowboards these are the
//                 nose/waist/tail widths; tip − waist sets the sidecut depth with sidecutRadius.
//   sidecutRadius nominal sidecut radius printed on the topsheet (m). Carved turn radius on snow is
//                 R ≈ sidecutRadius · cos(edgeAngle) (Howe / Lind & Sanders).
//   profile       camber layout: { type: 'camber'|'rocker'|'hybrid'|'flat', camber: arch height (m),
//                 noseRocker / tailRocker: share of the length that is early-rise (0..0.35) }
//   kick          { nose, tail } turn-up height of tip / tail (m)
//   flex          0 = noodle, 1 = plank (longitudinal). Stiffer = more pop & stability, harder to butter.
//   torsion       0..1 torsional stiffness — edge hold at high edge angles.
//   mass          kg for the pair (skis) or the board.
//   setback       how far the stance sits behind the board centre (m, boards; skis use mount point).
//   twin          true twin-tip / twin board: rides and lands switch without penalty.
// Snowboard stance (rider-specific defaults; the lobby may override per rider)
//   stance        { width (m), front, back } binding angles in degrees (+ = toes toward the nose).
// Look
//   graphic       { base, top, top2, accent, edge, pattern: 'solid'|'stripe'|'fade'|'chevron'|'split' }
//                 colours are hex numbers; designed so the lobby can expose them as paint options.

export const SKI_VARIANTS = {
  allmountain: {
    id: 'allmountain', name: 'Northwake Ridge 172', blurb: 'Do-everything all-mountain ski.',
    length: 1.72, tip: 0.128, waist: 0.084, tail: 0.112, sidecutRadius: 16,
    profile: { type: 'hybrid', camber: 0.006, noseRocker: 0.15, tailRocker: 0.05 },
    kick: { nose: 0.085, tail: 0.025 }, flex: 0.6, torsion: 0.65, mass: 3.6, setback: 0.0, twin: false,
    graphic: { base: 0x141238, top: 0xf6f4ff, top2: 0x2a2470, accent: 0xff4f8c, edge: 0x1affd9, pattern: 'stripe' },
  },
  slalom: {
    id: 'slalom', name: 'Valcrest SL Race 165', blurb: 'Short-radius race carver: bites hard, hates skidding.',
    length: 1.65, tip: 0.122, waist: 0.066, tail: 0.100, sidecutRadius: 12.5,
    profile: { type: 'camber', camber: 0.008, noseRocker: 0.04, tailRocker: 0.0 },
    kick: { nose: 0.07, tail: 0.02 }, flex: 0.85, torsion: 0.9, mass: 4.0, setback: 0.0, twin: false,
    graphic: { base: 0x101010, top: 0xffd23a, top2: 0x161616, accent: 0xff2a2a, edge: 0xffe066, pattern: 'chevron' },
  },
  powder: {
    id: 'powder', name: 'Driftline Float 186', blurb: 'Wide, rockered powder ski that planes early.',
    length: 1.86, tip: 0.142, waist: 0.112, tail: 0.128, sidecutRadius: 21,
    profile: { type: 'rocker', camber: 0.002, noseRocker: 0.28, tailRocker: 0.16 },
    kick: { nose: 0.11, tail: 0.06 }, flex: 0.45, torsion: 0.5, mass: 4.3, setback: 0.0, twin: false,
    graphic: { base: 0x0e2a2e, top: 0x2ff5d6, top2: 0x0f3f5f, accent: 0xffffff, edge: 0x7ffcff, pattern: 'fade' },
  },
  park: {
    id: 'park', name: 'Jibworks Twin 168', blurb: 'Soft true-twin park ski — lands switch.',
    length: 1.68, tip: 0.122, waist: 0.090, tail: 0.120, sidecutRadius: 17.5,
    profile: { type: 'hybrid', camber: 0.004, noseRocker: 0.16, tailRocker: 0.16 },
    kick: { nose: 0.08, tail: 0.075 }, flex: 0.35, torsion: 0.45, mass: 3.4, setback: 0.0, twin: true,
    graphic: { base: 0x221133, top: 0xff6ad5, top2: 0x7b2cff, accent: 0xfff36a, edge: 0xff9df0, pattern: 'split' },
  },
};

export const SNOWBOARD_VARIANTS = {
  allmountain: {
    id: 'allmountain', name: 'Northwake Atlas 156', blurb: 'Directional-twin camber board for the whole mountain.',
    length: 1.56, tip: 0.292, waist: 0.250, tail: 0.290, sidecutRadius: 7.8,
    profile: { type: 'camber', camber: 0.006, noseRocker: 0.1, tailRocker: 0.08 },
    kick: { nose: 0.065, tail: 0.055 }, flex: 0.6, torsion: 0.6, mass: 3.2, setback: 0.02, twin: false,
    stance: { width: 0.54, front: 15, back: -9 },
    graphic: { base: 0x161238, top: 0x2a2470, top2: 0xff4f8c, accent: 0x1affd9, edge: 0x1affd9, pattern: 'fade' },
  },
  freeride: {
    id: 'freeride', name: 'Valcrest Steeple 161', blurb: 'Stiff directional freeride carver with a long effective edge.',
    length: 1.61, tip: 0.300, waist: 0.254, tail: 0.292, sidecutRadius: 9.2,
    profile: { type: 'camber', camber: 0.008, noseRocker: 0.08, tailRocker: 0.04 },
    kick: { nose: 0.07, tail: 0.04 }, flex: 0.82, torsion: 0.85, mass: 3.5, setback: 0.03, twin: false,
    stance: { width: 0.55, front: 21, back: 6 },
    graphic: { base: 0x0d0d0d, top: 0xf2efe6, top2: 0x111111, accent: 0xff7a1a, edge: 0xffb36a, pattern: 'chevron' },
  },
  powder: {
    id: 'powder', name: 'Driftline Fish 158', blurb: 'Tapered swallow-tail-ish floater with a big setback.',
    length: 1.58, tip: 0.310, waist: 0.262, tail: 0.280, sidecutRadius: 8.4,
    profile: { type: 'hybrid', camber: 0.004, noseRocker: 0.26, tailRocker: 0.05 },
    kick: { nose: 0.1, tail: 0.03 }, flex: 0.5, torsion: 0.55, mass: 3.3, setback: 0.07, twin: false,
    stance: { width: 0.53, front: 18, back: 3 },
    graphic: { base: 0x0e2a2e, top: 0xe8fffb, top2: 0x2ff5d6, accent: 0x0f3f5f, edge: 0x7ffcff, pattern: 'stripe' },
  },
  park: {
    id: 'park', name: 'Jibworks Butter 152', blurb: 'Soft true-twin rocker board: butters, presses, spins.',
    length: 1.52, tip: 0.290, waist: 0.250, tail: 0.290, sidecutRadius: 7.4,
    profile: { type: 'rocker', camber: 0.0, noseRocker: 0.22, tailRocker: 0.22 },
    kick: { nose: 0.06, tail: 0.06 }, flex: 0.32, torsion: 0.4, mass: 2.9, setback: 0.0, twin: true,
    stance: { width: 0.55, front: 15, back: -15 },
    graphic: { base: 0x221133, top: 0xfff36a, top2: 0xff6ad5, accent: 0x7b2cff, edge: 0xff9df0, pattern: 'split' },
  },
};
