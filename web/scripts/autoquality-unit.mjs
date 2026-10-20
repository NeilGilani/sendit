// First-launch auto quality (src/gfx/autoquality.js): GPU tiers and "never override the player's choice".
// Run by unittest.mjs (needs its localStorage stub).
export async function run(test, assert) {
  const { tierQuality, initAutoQuality, heavyHighWatch } = await import('../src/gfx/autoquality.js');
  const st = await import('../src/state.js');

  await test('auto quality: GPU tiers', () => {
    const low = [
      'Google SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0)',
      'Intel HD Graphics 6000', 'Mali-G76', 'Adreno (TM) 640', 'Apple GPU', 'PowerVR Rogue GE8320',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)', 'ANGLE (NVIDIA, NVIDIA GeForce MX150 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD, AMD Radeon(TM) R5 Graphics Direct3D11 vs_5_0 ps_5_0)',
    ];
    const mid = [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Arc(TM) 130V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) Iris(TM) Plus Graphics 655',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', '',
    ];
    for (const g of low) assert.equal(tierQuality(g), 0, g);
    for (const g of mid) assert.equal(tierQuality(g), 1, g);
    assert.equal(tierQuality('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', { pixels: 3840 * 2160 }), 0, 'iGPU on a 4K screen at 100 %');
    assert.equal(tierQuality('NVIDIA GeForce RTX 4070', { pixels: 3840 * 2160 }), 1, 'discrete GPU on 4K');
    assert.equal(tierQuality('', { mobile: true }), 0, 'unknown GPU on a phone');
  });

  await test('auto quality: first launch picks, a chosen setting is never touched', () => {
    const fake = (name) => ({ getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => name, RENDERER: 2 }) });
    const g = globalThis;
    const saved = { navigator: g.navigator, innerWidth: g.innerWidth, innerHeight: g.innerHeight };
    Object.defineProperty(g, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', webdriver: false, maxTouchPoints: 0 }, configurable: true, writable: true });
    g.innerWidth = 1600; g.innerHeight = 900;
    const reset = (stored) => {
      for (const k of ['quality', 'qualityAuto', 'qualityAutoDone', 'qualityLowest', 'qualityHeavyHinted']) delete st.settings[k];
      st.settings.quality = 1;
      if (stored) localStorage.setItem(st.SETTINGS_KEY, JSON.stringify(stored)); else localStorage.removeItem(st.SETTINGS_KEY);
      Object.assign(st.settings, stored || {});
    };
    try {
      // First launch on an old iGPU → low, remembered as automatic.
      reset(null);
      let a = initAutoQuality(fake('Intel(R) UHD Graphics 620'), new URLSearchParams(''));
      assert.equal(st.settings.quality, 0);
      assert.equal(JSON.parse(localStorage.getItem(st.SETTINGS_KEY)).qualityAuto, true);
      // First launch on an M1 → medium; slow first ride steps down once, then settles.
      reset(null);
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams(''));
      assert.equal(st.settings.quality, 1);
      for (let i = 0; i < 60 * 13; i++) a.sample(1 / 25, true);   // 40 ms frames
      assert.equal(st.settings.quality, 0, 'slow ride → low');
      assert.equal(st.settings.qualityLowest, true, 'still slow at low → lower render scale');
      for (let i = 0; i < 60 * 13; i++) a.sample(1 / 60, true);
      assert.equal(st.settings.qualityAutoDone, true, 'settles');
      // Fast first ride: stays.
      reset(null);
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams(''));
      for (let i = 0; i < 60 * 13; i++) a.sample(1 / 60, true);
      assert.equal(st.settings.quality, 1);
      assert.equal(st.settings.qualityAutoDone, true);
      // Lobby / pauses don't count.
      reset(null);
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams(''));
      for (let i = 0; i < 60 * 20; i++) a.sample(1 / 20, false);
      assert.equal(st.settings.quality, 1);
      // The player chose High: untouched by the GPU tier and by slow frames.
      reset({ quality: 2 });
      a = initAutoQuality(fake('Intel(R) UHD Graphics 620'), new URLSearchParams(''));
      for (let i = 0; i < 60 * 13; i++) a.sample(1 / 20, true);
      assert.equal(st.settings.quality, 2);
      // …but a slow High gets the one-time "Medium recommended" notice (event, no change).
      let heavy = 0;
      const unsub = st.on('qualityHeavy', () => heavy++);
      reset({ quality: 2 });
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams(''));
      for (let i = 0; i < 60 * 3; i++) a.sample(1 / 20, false);
      assert.equal(heavy, 0, 'not in the lobby');
      for (let i = 0; i < 20 * 3; i++) a.sample(1 / 20, true);
      assert.equal(heavy, 0, 'not during warm-up');
      for (let i = 0; i < 20 * 6; i++) a.sample(1 / 20, true);
      assert.equal(heavy, 1, 'slow High → one notice');
      assert.equal(st.settings.quality, 2, 'High kept');
      assert.equal(st.settings.qualityHeavyHinted, true);
      for (let i = 0; i < 20 * 30; i++) a.sample(1 / 20, true);
      assert.equal(heavy, 1, 'once per device');
      // Fast High, or Medium: no notice.
      reset({ quality: 2 });
      let w = heavyHighWatch();
      for (let i = 0; i < 60 * 30; i++) w.sample(1 / 50, true);
      assert.equal(heavy, 1, 'fast High: quiet');
      reset({ quality: 1 });
      w = heavyHighWatch();
      for (let i = 0; i < 20 * 30; i++) w.sample(1 / 20, true);
      assert.equal(heavy, 1, 'slow Medium: not this notice (auto quality handles first launches)');
      // ?quality= in the URL: off.
      reset({ quality: 2 });
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams('quality=2'));
      for (let i = 0; i < 20 * 30; i++) a.sample(1 / 20, true);
      assert.equal(heavy, 1, '?quality=: quiet');
      unsub();
      // Choosing in the settings clears qualityAuto (ui.js) → the frame check stops.
      reset({ quality: 1, qualityAuto: true });
      a = initAutoQuality(fake('Apple M1'), new URLSearchParams(''));
      st.setSetting('qualityAuto', false); st.setSetting('quality', 1);
      for (let i = 0; i < 60 * 13; i++) a.sample(1 / 20, true);
      assert.equal(st.settings.quality, 1);
      // ?quality= and automated browsers: off.
      reset(null);
      initAutoQuality(fake('Intel(R) UHD Graphics 620'), new URLSearchParams('quality=2'));
      assert.equal(st.settings.qualityAuto, undefined);
      g.navigator.webdriver = true;
      reset(null);
      initAutoQuality(fake('Intel(R) UHD Graphics 620'), new URLSearchParams(''));
      assert.equal(st.settings.quality, 1, 'webdriver: untouched');
    } finally {
      reset(null);
      Object.defineProperty(g, 'navigator', { value: saved.navigator, configurable: true, writable: true });
      g.innerWidth = saved.innerWidth; g.innerHeight = saved.innerHeight;
    }
  });
}
