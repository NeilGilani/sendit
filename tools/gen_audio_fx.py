#!/usr/bin/env python3
"""Synthesize SENDIT's action sounds and the upbeat music layer (original work, released CC0).

Uses the helpers in gen_audio.py. Outputs Ogg Vorbis files into assets/audio/.
Usage: python3 tools/gen_audio_fx.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_audio as G  # noqa: E402

SR = G.SR
rng = np.random.default_rng(99)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env_ad(n, a, d):
    t = np.arange(n) / SR
    return (1 - np.exp(-t / max(a, 1e-4))) * np.exp(-t / max(d, 1e-4))


def noise(n):
    return rng.standard_normal(n)


def st(x, w=0.0):
    return np.stack([x, x]) if w == 0 else G.stereo_from(x, np.roll(x, int(SR * 0.004)), w)


def bell(f, dur, decay=1.2, partials=((1, 1), (2.01, 0.4), (3.02, 0.2), (4.2, 0.12))):
    t = t_(dur)
    out = np.zeros_like(t)
    for r, a in partials:
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * (decay * (0.6 + r * 0.5)))
    return out * (1 - np.exp(-t * 400))


def sweep(f0, f1, dur, shape=1.0):
    t = t_(dur)
    u = (t / dur) ** shape
    f = f0 + (f1 - f0) * u
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def save(name, x, peak=0.6, q=5):
    x = np.atleast_2d(x)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    G.write_ogg(name, G.normalize(x, peak), q)


def main():
    os.makedirs(G.OUT, exist_ok=True)
    # Slow-motion whoosh: a wide breath of air that sinks in pitch.
    n = int(SR * 1.6)
    w = G.fft_filter(noise(n), 200, 3000, 1.2)
    tt = t_(1.6)
    w *= np.sin(np.pi * np.clip(tt / 1.6, 0, 1)) ** 1.5
    low = sweep(160, 60, 1.6) * np.exp(-tt * 1.2) * 0.4
    save("whoosh_slow", G.stereo_from(w + low, G.fft_filter(noise(n), 200, 3000, 1.2) * np.sin(np.pi * tt / 1.6) ** 1.5 + low, 0.8), 0.55)
    # Jump pop: snow compressing and releasing.
    n = int(SR * 0.4)
    pop = G.fft_filter(noise(n), 250, 4000, 1.5) * env_ad(n, 0.003, 0.05)
    thump = np.sin(2 * np.pi * 95 * t_(0.4)) * env_ad(n, 0.002, 0.06)
    save("jump_pop", pop * 0.8 + thump, 0.6)
    # Hard landing: deep body + crunchy snow.
    n = int(SR * 0.9)
    tt = t_(0.9)
    body = np.sin(2 * np.pi * (70 * np.exp(-tt * 5) + 38) * tt) * np.exp(-tt * 7)
    crunch = G.fft_filter(noise(n), 300, 5000, 1.2) * env_ad(n, 0.002, 0.12) * (0.6 + 0.4 * np.sin(tt * 90))
    save("land_hard", body + crunch * 0.6, 0.75)
    # Perfect: bright major-third chime with shimmer.
    p = bell(1318.5, 1.6, 1.4) + bell(1661.2, 1.6, 1.4) * 0.8 + bell(2637.0, 1.6, 2.4) * 0.3
    sh = G.fft_filter(noise(len(p)), 6000, 12000, 1.0) * np.exp(-t_(1.6) * 4) * 0.08
    save("perfect", G.stereo_from(p + sh, np.roll(p, 120) + sh, 0.6), 0.55)
    # Combo tick (pitched up by the game as the combo grows).
    save("combo_tick", bell(880, 0.35, 6.0), 0.4)
    # Combo bank: rising arpeggio.
    notes = [659.3, 830.6, 987.8, 1318.5]
    out = np.zeros(int(SR * 1.4))
    for i, f in enumerate(notes):
        b = bell(f, 1.0, 2.2)
        s0 = int(i * 0.07 * SR)
        out[s0:s0 + len(b)] += b[: len(out) - s0] * (0.8 + 0.1 * i)
    save("combo_bank", out, 0.55)
    # Combo lost: soft falling tone.
    lost = sweep(520, 260, 0.7, 0.7) * env_ad(int(SR * 0.7), 0.01, 0.3)
    save("combo_lost", G.fft_filter(lost, 100, 3000), 0.45)
    # Boost: rushing air rising in pitch.
    n = int(SR * 1.1)
    tt = t_(1.1)
    b = G.fft_filter(noise(n), 400, 6000, 1.0) * np.sin(np.pi * np.clip(tt / 1.1, 0, 1)) * (0.4 + tt)
    tone = sweep(180, 520, 1.1, 0.6) * np.sin(np.pi * tt / 1.1) * 0.25
    save("boost", G.stereo_from(b + tone, G.fft_filter(noise(n), 400, 6000, 1.0) * np.sin(np.pi * tt / 1.1) + tone, 0.8), 0.55)
    # Grind loop: metal scrape with resonances.
    n = int(SR * 3.5)
    tt = t_(3.5)
    sc = G.fft_filter(noise(n), 1500, 7000, 2.0) * (0.7 + 0.3 * G.smooth_noise(n, 9, 4))
    res = sum(np.sin(2 * np.pi * f * tt + rng.random() * 6) * a for f, a in ((1870, 0.05), (2930, 0.04), (4410, 0.03)))
    g = G.make_loop(np.stack([sc + res, np.roll(sc, 400) + res]), 0.5)
    save("grind_loop", g, 0.45)
    # Ice scrape loop.
    n = int(SR * 5.0)
    ice = G.fft_filter(noise(n), 2500, 10000, 1.5) * (0.6 + 0.4 * G.smooth_noise(n, 14, 5) ** 2)
    save("snow_ice", G.make_loop(np.stack([ice, np.roll(ice, 900)]), 0.6), 0.35)
    # Snowflake token: crystalline sparkle.
    out = np.zeros(int(SR * 1.0))
    for i, f in enumerate([2093, 2637, 3136, 4186]):
        b = bell(f, 0.8, 3.0)
        s0 = int(i * 0.045 * SR)
        out[s0:s0 + len(b)] += b[: len(out) - s0]
    save("token", out, 0.45)
    # Golden goggles: warm fanfare.
    out = np.zeros(int(SR * 2.0))
    for i, f in enumerate([523.3, 659.3, 784.0, 1046.5]):
        b = bell(f, 1.6, 1.2, ((1, 1), (2, 0.5), (3, 0.3), (4, 0.15)))
        s0 = int(i * 0.12 * SR)
        out[s0:s0 + len(b)] += b[: len(out) - s0]
    save("goggles", out, 0.55)
    save("medal", out[::-1] * 0 + out, 0.55)
    # UI tick, countdown beeps, gate ding.
    save("ui_click", bell(1760, 0.12, 30.0), 0.25)
    save("count_beep", bell(880, 0.3, 8.0, ((1, 1), (2, 0.2))), 0.45)
    save("count_go", bell(1760, 0.6, 4.0, ((1, 1), (2, 0.3), (3, 0.1))), 0.5)
    save("gate", bell(1174.7, 0.5, 5.0), 0.4)
    # Near miss: quick whoosh past a tree.
    n = int(SR * 0.45)
    tt = t_(0.45)
    nm = G.fft_filter(noise(n), 600, 5000, 1.0) * np.sin(np.pi * tt / 0.45) ** 2
    save("near_miss", G.stereo_from(nm * np.linspace(1, 0.2, n), nm * np.linspace(0.2, 1, n), 1.0), 0.45)
    # Crash: thud and tumbling crunches.
    n = int(SR * 1.6)
    tt = t_(1.6)
    hit = np.sin(2 * np.pi * (60 * np.exp(-tt * 4) + 35) * tt) * np.exp(-tt * 5)
    tum = G.fft_filter(noise(n), 200, 3500, 1.2) * (np.sin(tt * 22) ** 8) * np.exp(-tt * 1.6)
    clatter = G.fft_filter(noise(n), 2000, 8000) * (np.sin(tt * 37 + 1) ** 16) * np.exp(-tt * 2) * 0.4
    save("crash", hit + tum * 0.6 + clatter, 0.7)
    # Avalanche rumble loop.
    n = int(SR * 8.0)
    rum = G.fft_filter(G.brown(n), 20, 300, 1.0) * (0.7 + 0.3 * G.smooth_noise(n, 1.5, 21))
    hiss = G.fft_filter(G.pink(n), 200, 2500) * 0.15
    save("avalanche_loop", G.make_loop(np.stack([rum + hiss, np.roll(rum, 3000) + hiss]), 1.0), 0.6)
    # Snowmobile engine loop.
    n = int(SR * 2.0)
    tt = t_(2.0)
    f0 = 52.0
    ph = 2 * np.pi * f0 * tt
    saw = sum(np.sin(ph * k) / k for k in range(1, 18))
    eng = saw * (0.8 + 0.2 * np.sin(2 * np.pi * 8 * tt)) + G.fft_filter(noise(n), 300, 2500) * 0.15
    save("snowmobile_loop", G.make_loop(np.stack([eng, eng]), 0.2), 0.4)
    # Flag flap loop.
    n = int(SR * 3.0)
    fl = G.fft_filter(noise(n), 300, 2500) * (np.abs(np.sin(2 * np.pi * 3.1 * t_(3.0) + G.smooth_noise(n, 2, 8) * 3)) ** 6)
    save("flag_flap", G.make_loop(np.stack([fl, fl]), 0.3), 0.3)
    music_upbeat()


def music_upbeat():
    """Upbeat stem in sync with music_golden_hour: 120 bpm, same 8 s chords, 128 s loop."""
    bpm = 120.0
    beat = 60.0 / bpm
    loop = 128.0
    N = int(SR * (loop + 4.0))
    out = np.zeros((2, N))
    chords = [
        [50, 57, 61, 64, 66], [47, 54, 57, 61, 64], [43, 50, 54, 61, 63], [45, 52, 57, 59, 64],
        [52, 55, 59, 62, 66], [43, 50, 54, 57, 62], [42, 50, 54, 57, 61], [45, 52, 57, 59, 64],
    ] * 2

    def add(sig, start, gain=1.0, pan=0.0):
        i = int(start * SR)
        e = min(N, i + len(sig))
        out[0, i:e] += sig[: e - i] * gain * (1 - pan)
        out[1, i:e] += sig[: e - i] * gain * (1 + pan)

    kick_t = t_(0.35)
    kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-kick_t * 30)) * kick_t) * np.exp(-kick_t * 9)
    snare = G.fft_filter(noise(int(SR * 0.25)), 900, 7000) * np.exp(-t_(0.25) * 22) + np.sin(2 * np.pi * 190 * t_(0.25)) * np.exp(-t_(0.25) * 30) * 0.4
    hat = G.fft_filter(noise(int(SR * 0.06)), 7000, 15000) * np.exp(-t_(0.06) * 70)
    nbeats = int(loop / beat)
    for b in range(nbeats):
        t0 = b * beat
        if b % 4 in (0, 2) or (b % 8 == 7):
            add(kick, t0, 0.9)
        if b % 4 in (1, 3):
            add(snare, t0, 0.45)
        add(hat, t0 + beat * 0.5, 0.22, 0.3)
        if b % 2 == 0:
            add(hat, t0, 0.12, -0.3)
    # Bass: root eighths with a little bounce.
    for ci, ch in enumerate(chords):
        root = G.midi(ch[0] - 12)
        for k in range(int(8.0 / (beat / 2))):
            t0 = ci * 8.0 + k * beat / 2
            dur = beat * 0.45
            tt = t_(dur)
            f = root * (2 if k % 4 == 3 else 1)
            s = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 6) * (1 - np.exp(-tt * 300))
            add(s, t0, 0.35)
        # Arpeggio sparkle in sixteenths.
        tones = sorted(ch[1:] + [n + 12 for n in ch[1:3]])
        for k in range(int(8.0 / (beat / 4))):
            t0 = ci * 8.0 + k * beat / 4
            f = G.midi(tones[k % len(tones)] + 12)
            tt = t_(0.18)
            s = np.sign(np.sin(2 * np.pi * f * tt)) * 0.3 + np.sin(2 * np.pi * f * tt)
            s = G.fft_filter(s, 200, 5000) * np.exp(-tt * 18)
            add(s, t0, 0.07, 0.5 if k % 2 else -0.5)
    L = int(SR * loop)
    mix = out[:, :L].copy()
    tail = out[:, L:]
    mix[:, :tail.shape[1]] += tail
    G.write_ogg("music_upbeat", G.normalize(mix, 0.5), 6)


if __name__ == "__main__":
    main()
