// Saved highlight clips (no browser): the codec (round trip within quantisation, constant channels,
// quaternion hemispheres, size, gzip container, corrupt / old / foreign input), the air span, node keys,
// patch heights, the storage cap and the loading-screen rotation rules (thrill/clipcodec.js, clipstore.js).
// Standalone: node web/scripts/clips-unit.mjs   (also run by unittest.mjs)
export async function run(test, assert) {
  const C = await import('../src/thrill/clipcodec.js');
  const S = await import('../src/thrill/clipstore.js');

  // A fake recording: 93 nodes, 5.5 s at 30 Hz. Root flies a ballistic arc, a few bones spin, most nodes are static.
  const makeClip = (n = 166, nodes = 93) => {
    const st = nodes * C.NODE_STRIDE, frames = new Float32Array(n * st), air = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / 30, o = i * st;
      const inAir = t > 2.4 && t < 3.9;
      air[i] = inAir ? 1 : 0;
      for (let k = 0; k < nodes; k++) {
        const b = o + k * C.NODE_STRIDE;
        frames[b + 6] = 1; frames[b + 7] = frames[b + 8] = frames[b + 9] = 1.06;   // identity quat, scale 1.06
        frames[b] = k * 0.01; frames[b + 1] = 0.1; frames[b + 2] = -k * 0.02;
      }
      // root: world position along -Z with an arc
      const ta = Math.max(0, Math.min(1.5, t - 2.4));
      frames[o] = 1200.5 + t * 0.4; frames[o + 1] = 830 - t * 3 + (inAir ? 7 * ta - 4.9 * ta * ta : 0); frames[o + 2] = -2400 - t * 14;
      // bone 11: spinning 1080 over the air
      const a = inAir ? (t - 2.4) / 1.5 * 6 * Math.PI : 0;
      const b = o + 11 * C.NODE_STRIDE;
      frames[b + 3] = 0; frames[b + 4] = Math.sin(a / 2); frames[b + 5] = 0; frames[b + 6] = Math.cos(a / 2);
    }
    C.hemisphere(frames, n, nodes);
    const keys = Array.from({ length: nodes }, (_, k) => (k ? `Rider/Scene/Armature/b${k}` : 'Rider'));
    const nx = 120, nz = 160, h = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = 830 - (j * 0.75) * 0.3 + Math.sin(i * 0.2) * 0.4;
    return { meta: { trick: 'Cork 1080', points: 1240, mapId: 'ravenspire', mountain: 'Ravenspire', gear: 'ski', outfit: { jacket: { garment: 'tuff-shell', colorway: 'x' } }, land: 3.9 },
      keys, n, fps: 30, frames, air, patch: { x0: 1170, z0: -2500, step: 0.75, nx, nz, h }, trees: [[1201, -2410, 0.5, 'tree'], [1190, -2440, 1.1, 'rock']] };
  };

  await test('clips codec: round trip within quantisation; constant channels stored once', () => {
    const c = makeClip();
    const bytes = C.encodeClip(c);
    const d = C.decodeClip(bytes);
    assert.equal(d.n, c.n); assert.deepEqual(d.keys, c.keys); assert.equal(d.meta.trick, 'Cork 1080');
    let maxPos = 0, maxQ = 0;
    const st = c.keys.length * C.NODE_STRIDE;
    for (let i = 0; i < c.frames.length; i++) {
      const ch = i % C.NODE_STRIDE, err = Math.abs(d.frames[i] - c.frames[i]);
      if (ch >= 3 && ch <= 6) maxQ = Math.max(maxQ, err); else maxPos = Math.max(maxPos, err);
    }
    assert.ok(maxPos < 0.003, `position error ${maxPos}`);   // root moves ~80 m: ≤ 1.3 mm per step, float32 at 2400 m adds a little
    assert.ok(maxQ < 5e-5, `quaternion error ${maxQ}`);
    assert.deepEqual([...d.air], [...c.air]);
    assert.ok(Math.abs(C.patchHeight(d.patch, 1200, -2450) - C.patchHeight(c.patch, 1200, -2450)) < 0.002, 'patch heights');
    assert.equal(d.trees.length, 2); assert.equal(d.trees[1][3], 'rock');
    assert.ok(st > 0);
    assert.ok(bytes.length < 260000, `raw size ${bytes.length}`);
  });

  await test('clips codec: gzip container is small and decodes; old / foreign / corrupt input rejects', async () => {
    const c = makeClip();
    const packed = await C.packClip(c);
    assert.ok(packed.length < 60000, `packed ${packed.length} bytes`);
    const d = await C.unpackClip(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
    assert.equal(d.meta.points, 1240);
    await assert.rejects(C.unpackClip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), /not a clip/);
    await assert.rejects(C.unpackClip(new Uint8Array(0)), /empty/);
    const cut = packed.slice(0, packed.length >> 1);
    await assert.rejects(C.unpackClip(cut));
    // A future version is refused (the loading screen then skips it).
    const raw = C.encodeClip(c), hl = new DataView(raw.buffer).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + hl)));
    header.v = 99;
    const hb = new TextEncoder().encode(JSON.stringify(header));
    const bad = new Uint8Array(4 + hb.length + raw.length - 4 - hl);
    new DataView(bad.buffer).setUint32(0, hb.length, true); bad.set(hb, 4); bad.set(raw.subarray(4 + hl), 4 + hb.length);
    assert.throws(() => C.decodeClip(bad), /unsupported version/);
    // Garbage in the channel flags.
    const g = raw.slice(); g[4 + hl] = 7;
    assert.throws(() => C.decodeClip(g), /bad channel/);
    assert.throws(() => C.encodeClip({ keys: [], n: 0, frames: new Float32Array(0) }), /bad input/);
  });

  await test('clips codec: quaternion hemispheres keep consecutive frames close', () => {
    const f = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, -1, 1, 1, 1]);
    C.hemisphere(f, 2, 1);
    assert.equal(f[16], 1);
  });

  await test('clips air span: the run ending nearest the touchdown, flickers bridged', () => {
    const air = new Uint8Array(100);
    for (let i = 10; i < 20; i++) air[i] = 1;                 // small hop
    for (let i = 40; i < 80; i++) air[i] = 1;                 // the trick
    air[60] = 0;                                              // one-frame flicker
    const s = C.airSpan(air, 30, 80);
    assert.deepEqual([s.i0, s.i1], [40, 80]);
    assert.equal(C.airSpan(air, 30, 20).i1, 20, 'hint picks the hop');
    assert.equal(C.airSpan(new Uint8Array(10), 30), null);
  });

  await test('clips node keys: path names with sibling indices, stable across rebuilds', () => {
    const node = (name, type, children = []) => ({ name, type, children });
    const root = node('Rider', 'Group', [node('', 'Group', [node('Scene', 'Group', [node('pelvis', 'Bone')])]), node('', 'Group'), node('', 'Mesh')]);
    assert.deepEqual(C.nodeKeys(root), ['Rider', 'Rider/Group', 'Rider/Group/Scene', 'Rider/Group/Scene/pelvis', 'Rider/Group#1', 'Rider/Mesh']);
  });

  await test('clips store: cap drops the oldest non-favourites, refuses when all are favourites', () => {
    const list = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, at: 1000 + i, fav: i === 0 }));
    assert.deepEqual(S.capPlan(list, 30), ['c1']);
    assert.deepEqual(S.capPlan(list.slice(0, 10), 30), []);
    assert.equal(S.capPlan(list.map((c) => ({ ...c, fav: true })), 30), null);
  });

  await test('clips loading rotation: 0 → none, 1–2 → mixed, ≥3 → only clips, never twice in a row, fresh first, map preferred', () => {
    const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
    assert.equal(S.pickLoadingClip({ clips: [] }), null);
    const one = { clips: [{ id: 'a', shown: 0, at: 1 }], last: null };
    assert.equal(S.pickLoadingClip(one, { rand: seq([0.99]) }), 'a', 'a fresh clip always shows');
    one.clips[0].shown = 1;
    assert.equal(S.pickLoadingClip({ ...one, last: 'a' }), null, 'never twice in a row');
    assert.equal(S.pickLoadingClip(one, { rand: seq([0.2, 0]) }), 'a');
    assert.equal(S.pickLoadingClip(one, { rand: seq([0.7]) }), null, '1 clip: half the loads are made-up');
    const three = { clips: [{ id: 'a', shown: 3, at: 1 }, { id: 'b', shown: 3, at: 2 }, { id: 'c', shown: 3, at: 3, fav: true, mapId: 'kitsune-peak' }], last: 'b' };
    let counts = { a: 0, b: 0, c: 0, null: 0 };
    let x = 0.1234;
    const rand = () => { x = (x * 9301 + 0.49297) % 1; return x; };
    for (let i = 0; i < 2000; i++) counts[S.pickLoadingClip(three, { rand })]++;
    assert.equal(counts.null, 0, '≥3: only clips');
    assert.equal(counts.b, 0, 'not the last one');
    assert.ok(counts.c > counts.a * 2, `favourites weigh more (${JSON.stringify(counts)})`);
    assert.equal(S.pickLoadingClip(three, { mapId: 'kitsune-peak', rand }), 'c', 'map load prefers that mountain');
    const fresh = { clips: [...three.clips, { id: 'd', shown: 0, at: 9 }], last: 'a' };
    assert.equal(S.pickLoadingClip(fresh, { rand }), 'd', 'a just-saved clip goes first');
    // Junk in the index is ignored.
    assert.equal(S.pickLoadingClip({ clips: [null, { id: 3 }, 'x'] }), null);
  });

  await test('clips resample: fixed rate over [t0, t1]', () => {
    const r = C.resample(0, 1, 30, 2, (t, out) => { out[0] = t; out[1] = 2 * t; });
    assert.equal(r.n, 31);
    assert.ok(Math.abs(r.frames[60] - 1) < 1e-6 && Math.abs(r.frames[61] - 2) < 1e-6);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert/strict')).default;
  let failed = 0;
  await run(async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } }, assert);
  process.exit(failed ? 1 : 0);
}
