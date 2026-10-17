// Progression + juice combo checks (no browser), run from unittest.mjs: XP curve, levels, level-up
// events, dailies (deterministic, distinct, completion, reroll, midnight rollover), achievements,
// personal bests, persistence, and the every-map combo chain (juice/combo.js).
export async function run(test, assert) {
  const core = await import('../src/progression/core.js');
  const { Progression, levelFor, xpToNext, xpForLevel, dailiesFor, sanitizeState, PROGRESSION_KEY } = core;
  const { emit, on } = await import('../src/state.js');
  const { ComboTracker, moveKey } = await import('../src/juice/combo.js');
  const { TimeWarp } = await import('../src/juice/impact.js');

  const memStore = () => { const m = new Map(); return { m, get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)) }; };
  const make = (day = '2026-10-16T10:00:00', storage = memStore()) => {
    const events = [];
    let now = new Date(day);
    const p = new Progression({ storage, emit: (n, d) => events.push([n, d]), now: () => now });
    return { p, events, storage, setNow: (d) => { now = new Date(d); }, of: (n) => events.filter((e) => e[0] === n).map((e) => e[1]) };
  };

  await test('progression: XP curve grows and levelFor inverts xpForLevel', () => {
    for (let l = 1; l < 60; l++) assert.ok(xpToNext(l + 1) > xpToNext(l), `curve at ${l}`);
    for (const l of [1, 2, 5, 10, 33, 98]) {
      assert.equal(levelFor(xpForLevel(l)).level, l);
      assert.equal(levelFor(xpForLevel(l) - 1).level, Math.max(1, l - 1));
    }
    assert.equal(levelFor(0).level, 1);
    assert.equal(levelFor(1e12).level, core.XP_CURVE.max);
    assert.ok(xpToNext(1) >= 150 && xpToNext(1) <= 400, 'level 2 comes within the first ride or two');
  });

  await test('progression: addXP fires one levelUp per level crossed, with rank-ups', () => {
    const { p, of } = make();
    p.addXP(xpForLevel(6) + 10, 'test');
    const ups = of('levelUp');
    assert.deepEqual(ups.map((u) => u.level), [2, 3, 4, 5, 6]);
    assert.equal(ups.find((u) => u.level === 5).rankUp, true);
    assert.equal(ups.find((u) => u.level === 5).rank.name, 'Shredder');
    assert.equal(p.level, 6);
    assert.equal(of('xp').length, 1);
  });

  await test('progression: dailies are stable per day, three different categories, change by day', () => {
    const a = dailiesFor('2026-10-16'), b = dailiesFor('2026-10-16'), c = dailiesFor('2026-10-17');
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
    assert.equal(new Set(a.map((x) => x.cat)).size, 3);
    assert.notDeepEqual(a.map((x) => x.title), c.map((x) => x.title));
    for (let d = 1; d <= 28; d++) {
      const l = dailiesFor(`2026-11-${String(d).padStart(2, '0')}`);
      assert.equal(new Set(l.map((x) => x.cat)).size, 3, `day ${d}`);
      for (const x of l) assert.ok(x.goal > 0 && x.xp > 0 && x.title && x.stat, JSON.stringify(x));
    }
  });

  await test('progression: daily completes once, pays XP, sweep bonus when all three are done', () => {
    const { p, of } = make();
    p.startRide('blackspruce');
    const list = p.challenges();
    // Drive every challenge's stat to its goal directly.
    for (const c of list) {
      if (c.scope === 'ride') p.ride[c.stat] = c.goal;
      p.bump(c.stat, c.goal, { max: true });
    }
    const done = of('challengeDone');
    assert.equal(done.length, 3);
    assert.equal(new Set(done.map((d) => d.challenge.id)).size, 3);
    assert.equal(of('dailySweep').length, 1);
    const xp = p.state.xp;
    p.bump(list[0].stat, 99);
    assert.equal(of('challengeDone').length, 3, 'no double completion');
    assert.equal(p.state.xp, xp);
    assert.ok(p.challenges().every((c) => c.done));
  });

  await test('progression: reroll swaps one unfinished daily, once a day; midnight brings new ones', () => {
    const { p, setNow } = make('2026-10-16T23:50:00');
    const before = p.challenges();
    const c = p.reroll(1);
    assert.ok(c);
    assert.equal(p.ensureDay().rerollsLeft, 0);
    assert.equal(p.reroll(0), null, 'only one free reroll');
    assert.equal(p.challenges()[0].id, before[0].id);
    p.bump('meters', 500);
    setNow('2026-10-17T00:05:00');
    assert.equal(p.ensureDay().day, '2026-10-17');
    assert.equal(p.ensureDay().rerollsLeft, 1);
    assert.equal(p.ensureDay().progress.meters, undefined, 'progress resets at midnight');
  });

  await test('progression: landings feed stats, achievements unlock once with XP', () => {
    const { p, of } = make();
    p.startRide('valcrest-gully');
    p.recordLanding({ clean: true, trick: 'Left 720 Mute', air: 1.6, grade: 'stomped', spin: 720, flips: 0 });
    p.recordLanding({ clean: true, trick: 'Left 720 Mute', air: 1.5, grade: 'clean', spin: 720, flips: 0 });
    const ids = of('achievement').map((a) => a.id);
    for (const id of ['first-trick', 'spin-360', 'spin-540', 'spin-720', 'stomp-1']) assert.ok(ids.includes(id), id);
    assert.equal(ids.filter((i) => i === 'spin-720').length, 1);
    assert.equal(p.state.life.tricks, 2);
    assert.equal(p.state.life.maxSpin, 720);
    assert.ok(p.state.xp > 0);
    p.recordLanding({ clean: false, trick: 'Left 1080', air: 2, spin: 1080 });
    assert.equal(p.state.life.maxSpin, 720, 'sketchy / crashed landings do not count');
  });

  await test('progression: personal bests call out only when an existing PB is beaten', () => {
    const { p, of } = make();
    p.startRide('ravenspire');
    p.recordLanding({ clean: true, trick: '', air: 2.0, spin: 0 });
    assert.equal(of('personalBest').length, 0, 'first ever value is not a callout');
    p.endRide();
    p.startRide('ravenspire');
    p.recordLanding({ clean: true, trick: '', air: 1.5, spin: 0 });
    assert.equal(of('personalBest').length, 0);
    p.recordLanding({ clean: true, trick: '', air: 2.4, spin: 0 });
    p.recordLanding({ clean: true, trick: '', air: 2.9, spin: 0 });
    const pbs = of('personalBest');
    assert.equal(pbs.length, 1, 'once per ride per stat');
    assert.equal(pbs[0].stat, 'air');
    assert.equal(pbs[0].prev, 2);
    assert.equal(p.pbs('ravenspire').air, 2.9);
    assert.deepEqual(p.pbs('valcrest-gully'), {});
  });

  await test('progression: state persists and survives garbage', () => {
    const storage = memStore();
    const { p } = make(undefined, storage);
    p.startRide('voltage-park');
    p.recordScore(5000);
    p.recordDistance(1200);
    p.recordNearMiss();
    const sum = p.endRide();
    assert.ok(sum.bonus > 0, 'a ride over rideMinM pays the ride bonus');
    const q = new Progression({ storage, now: () => new Date('2026-10-16T12:00:00') });
    assert.equal(q.state.xp, p.state.xp);
    assert.equal(q.state.life.near, 1);
    assert.equal(q.state.life.rides, 1);
    assert.ok(q.state.achievements['first-ride']);
    for (const junk of ['x', 42, [], { xp: -5, life: { tricks: 'many' } }, null]) {
      const s = sanitizeState(junk);
      assert.equal(s.xp, 0);
      assert.equal(s.life.tricks, 0);
    }
    storage.m.set(PROGRESSION_KEY, '{not json');
    assert.throws(() => storage.get(PROGRESSION_KEY));   // the real adapter (progression/index.js) catches this
  });

  await test('progression: near misses count per map for map-specific dailies', () => {
    const { p } = make();
    p.startRide('blackspruce');
    for (let i = 0; i < 4; i++) p.recordNearMiss();
    assert.equal(p.ensureDay().progress['near@blackspruce'], 4);
    assert.equal(p.ensureDay().progress.near, 4);
    p.endRide();
    p.startRide('valcrest-gully');
    p.recordNearMiss();
    assert.equal(p.ensureDay().progress['near@blackspruce'], 4);
    assert.equal(p.ensureDay().progress.near, 5);
  });

  await test('progression: trick book pays XP once per new trick, normalised names', () => {
    const { p, of } = make();
    p.startRide('voltage-park');
    const xp0 = p.state.xp;
    assert.equal(p.recordTrickName('Perfect Left 540 Mute'), true);
    assert.equal(p.recordTrickName('Left 540 Mute'), false, 'Perfect is the same trick');
    assert.equal(p.recordTrickName('Boardslide to 50-50 · 6.2 m'), true);
    assert.equal(p.recordTrickName('Boardslide to 50-50 · 9 m'), false, 'rail length is not a new trick');
    assert.equal(of('newTrick').length, 2);
    assert.ok(p.state.xp >= xp0 + 2 * core.XP_SOURCES.newTrick);
    assert.deepEqual(p.trickBook().map((t) => t.n), [2, 2]);
    assert.equal(core.trickKey('Locked-in Nose press 50-50 grab · 4.0 m'), 'Nose press 50-50 grab');
    assert.deepEqual(sanitizeState({ life: { trickBook: ['x'] } }).life.trickBook, {});
  });

  await test('progression: weekly challenge accumulates all week, pays once, resets on Monday', () => {
    const { p, of, setNow } = make('2026-10-14T12:00:00');   // a Wednesday
    assert.equal(core.weekKey(new Date('2026-10-14T12:00:00')), '2026-10-12');
    assert.equal(core.weekKey(new Date('2026-10-18T23:00:00')), '2026-10-12', 'Sunday is the same week');
    assert.equal(core.weekKey(new Date('2026-10-19T00:30:00')), '2026-10-19', 'Monday starts a new one');
    const wk = p.weekly();
    assert.ok(wk.goal > 0 && wk.xp >= 1500 && wk.title);
    p.startRide('valcrest-gully');
    const feed = (n) => {
      if (wk.stat === 'scoreSum') p.recordScore(n);
      else if (wk.stat === 'combo3n') { for (let i = 0; i < n; i++) p.recordCombo(3, 100); }
      else p.bump(wk.stat, n);
    };
    feed(Math.ceil(wk.goal / 2));
    setNow('2026-10-17T12:00:00');   // Saturday: a new day, same week
    feed(Math.ceil(wk.goal / 2));
    assert.equal(of('weeklyDone').length, 1);
    assert.equal(p.weekly().done, true);
    feed(5);
    assert.equal(of('weeklyDone').length, 1, 'pays once');
    setNow('2026-10-19T09:00:00');
    assert.equal(p.weekly().done, false);
    assert.equal(p.weekly().value, 0);
  });

  await test('progression API: the public surface works over localStorage', async () => {
    const { progression } = await import('../src/progression/index.js');
    for (const k of ['getLevel', 'getXP', 'getProgress', 'getChallenges', 'rerollChallenge', 'rerollsLeft', 'getWeekly', 'getAchievements', 'getPersonalBests', 'getTrickBook', 'addXP', 'onLevelUp', 'onAchievement', 'onChallengeDone', 'onXP']) assert.equal(typeof progression[k], 'function', k);
    const ups = [];
    const off = progression.onLevelUp((e) => ups.push(e.level));
    const l0 = progression.getLevel();
    progression.addXP(core.xpToNext(l0) + 1, 'test');
    assert.equal(progression.getLevel(), l0 + 1);
    assert.deepEqual(ups, [l0 + 1]);
    off();
    progression.addXP(core.xpToNext(l0 + 1) + 1, 'test');
    assert.deepEqual(ups, [l0 + 1], 'unsubscribed');
    assert.equal(progression.getChallenges().length, 3);
    assert.ok(JSON.parse(globalThis.localStorage.getItem(core.PROGRESSION_KEY)).xp > 0, 'persisted under its own key');
  });

  // ---------------------------------------------------------------- juice: combo chain + time warp
  await test('juice combo: own chain grows per different move, banks a bonus, loses on crash', () => {
    const pl = { state: 1, flow: null };
    const cb = new ComboTracker(pl);
    const banked = [], lost = [], scores = [];
    const offs = [on('juiceComboBanked', (e) => banked.push(e)), on('juiceComboLost', (e) => lost.push(e)), on('score', (e) => scores.push(e))];
    emit('activity', { type: 'zen' });
    emit('score', { label: 'Left 360', points: 120 });
    emit('score', { label: 'Perfect Left 360', points: 170 });   // same move: repeat credit
    emit('score', { label: 'Close shave', points: 15 });
    emit('score', { label: '250 m', points: 25 });                // distance markers are not moves
    const s = cb.state();
    assert.equal(s.pts, 305);
    assert.equal(s.mult, 1 + (1 + 0.35 + 1 - 1) * 0.5);
    cb.update(1); assert.ok(cb.state(), 'still alive inside the window');
    cb.update(3); assert.equal(cb.state(), null);
    assert.equal(banked.length, 1);
    assert.equal(banked[0].bonus, Math.round(305 * (s.mult - 1)));
    assert.ok(scores.some((e) => /^Combo ×/.test(e.label)), 'the bonus is scored');
    emit('score', { label: 'Left 540', points: 200 });
    emit('score', { label: 'Mute', points: 60 });
    emit('crashed', 'landing');
    assert.equal(cb.state(), null);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].pts, 260);
    pl.state = 2;   // in the air the chain never times out
    emit('score', { label: 'Left 540', points: 200 });
    cb.update(30);
    assert.ok(cb.state());
    assert.equal(cb.state().left, 1);
    assert.equal(moveKey('Perfect Left 540 Mute'), 'left 540 mute');
    assert.equal(moveKey('Boardslide · 6.2 m'), 'boardslide');
    offs.forEach((o) => o()); cb.dispose();
  });

  await test('juice splits: deltas against the best run, saved only on a new best', async () => {
    const { SplitTracker, fmtDelta } = await import('../src/juice/splits.js');
    const mem = new Map();
    const storage = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) };
    const act = { key: 'test-course', time: 0, penalty: 0 };
    const sp = new SplitTracker(act, storage);
    const got = [];
    const offs = [on('juiceSplit', (e) => got.push(e)), on('juiceSplitFinal', (e) => got.push({ final: true, ...e }))];
    emit('activity', { type: 'challenge' });
    act.time = 10; emit('gate', { pass: true });
    act.time = 20; act.penalty = 2; emit('gate', { pass: false });
    emit('runFinished', { time: 30, isBestTime: true, best: { time: 30 } });
    assert.equal(got[0].delta, null, 'first run: nothing to compare');
    assert.deepEqual(mem.get('sendit.splits.test-course'), { s: [10, 22], t: 30 });
    got.length = 0;
    emit('activity', { type: 'challenge' });
    act.time = 9.5; act.penalty = 0; emit('gate', { pass: true });
    act.time = 23; emit('gate', { pass: true });
    emit('runFinished', { time: 31, isBestTime: false, best: { time: 30 } });
    assert.equal(got[0].delta.toFixed(2), '-0.50');
    assert.equal(got[1].delta.toFixed(2), '1.00');
    assert.equal(got[2].final, true);
    assert.equal(got[2].delta, 1);
    assert.deepEqual(mem.get('sendit.splits.test-course').s, [10, 22], 'a slower run keeps the old splits');
    emit('activity', { type: 'zen' });
    emit('gate', { pass: true });
    assert.equal(got.length, 3, 'no splits outside challenge runs');
    assert.equal(fmtDelta(-0.4219), '−0.42');
    offs.forEach((o) => o()); sp.dispose();
  });

  await test('juice music: energy lifts the upbeat track with hysteresis, hooks win, drops play stingers', async () => {
    const { MusicEnergy, JUICE_MUSIC } = await import('../src/juice/music.js');
    const { game, Mode } = await import('../src/state.js');
    const shots = [];
    const sound = { ctx: {}, flowOn: false, oneShot: (n) => { shots.push(n); return Promise.resolve(); } };
    const pl = { speedRatio: 1, state: 1 };
    let chain = { mult: 4 };
    const m = new MusicEnergy({ sound, player: pl, combo: { state: () => chain } });
    const mode0 = game.mode;
    game.mode = Mode.RIDING;
    for (let i = 0; i < 120; i++) m.update(1 / 30);
    assert.ok(m.level > JUICE_MUSIC.liftOn, `energy ${m.level}`);
    assert.equal(sound.flowOn, true, 'high energy lifts the upbeat track');
    pl.speedRatio = 0; chain = null;
    for (let i = 0; i < 30; i++) m.update(1 / 30);
    assert.equal(sound.flowOn, true, 'held for the minimum time');
    for (let i = 0; i < 900; i++) m.update(1 / 30);
    assert.equal(sound.flowOn, false, 'released once energy falls');
    emit('juiceComboBanked', { mult: 5, bonus: 900 });
    assert.deepEqual(shots, ['whoosh_slow'], 'drop stinger (boost follows 90 ms later)');
    const hooked = { ctx: {}, setMusicEnergy: (x) => { hooked.e = x; }, musicDrop: (k) => { hooked.k = k; } };
    const m2 = new MusicEnergy({ sound: hooked, player: pl, combo: null });
    m2.update(0.1);
    assert.equal(typeof hooked.e, 'number', 'setMusicEnergy hook is used when present');
    emit('juiceLevelUp', { level: 3 });
    assert.equal(hooked.k, 'levelUp');
    m.dispose(); m2.dispose();
    game.mode = mode0;
  });

  await test('juice time warp: hit-stop freezes, eases back to real time, respects cooldown', () => {
    const w = new TimeWarp();
    assert.equal(w.scale(0.016), 1);
    assert.ok(w.hit({ freeze: 0.05, slow: 0.4, recover: 0.2 }));
    assert.equal(w.scale(0.03), 0);
    const k1 = w.scale(0.03);
    assert.ok(k1 >= 0.4 && k1 < 1, String(k1));
    let k = k1;
    for (let i = 0; i < 20; i++) k = w.scale(0.016);
    assert.equal(k, 1);
    assert.equal(w.hit({ freeze: 0.05, slow: 0.4, recover: 0.2 }), false, 'cooldown');
    assert.ok(w.hit({ freeze: 0.1, slow: 0.3, recover: 0.3 }), 'a stronger hit still lands');
  });
}
