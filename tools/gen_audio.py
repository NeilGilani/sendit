#!/usr/bin/env python3
"""Synthesize SENDIT's sounds and ambient music (original work, released CC0).

Everything is generated from noise and oscillators with numpy, then encoded to Ogg Vorbis with
ffmpeg. Loops are made seamless by wrapping their tails onto their starts.

Outputs (assets/audio/):
  snow_powder.ogg, snow_groomed.ogg, snow_carve.ogg  — seamless ski-on-snow layers
  wind_ambient.ogg, wind_speed.ogg                   — seamless wind layers
  land_soft.ogg                                      — soft landing thump
  bird_1..4.ogg                                      — distant alpine bird calls
  music_golden_hour.ogg                              — ~2 min seamless ambient piece
Usage: python3 tools/gen_audio.py
"""
import os
import subprocess
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
SR = 44100
rng = np.random.default_rng(1234)


# --------------------------------------------------------------------------- helpers
def write_ogg(name, data, quality=5):
    data = np.atleast_2d(data)
    if data.shape[0] > data.shape[1]:
        data = data.T
    ch = data.shape[0]
    pcm = (np.clip(data.T, -1, 1) * 32767).astype("<i2")
    tmp = os.path.join(OUT, name + ".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", str(quality),
                    os.path.join(OUT, name + ".ogg")], check=True)
    os.remove(tmp)
    print("wrote", name, f"{data.shape[1] / SR:.1f}s")


def fft_filter(x, lo, hi, slope=2.0):
    """Smooth band-pass in the frequency domain (works great for long noise beds)."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo > 0:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 * slope))
    if hi > 0:
        g *= 1 / (1 + (f / hi) ** (2 * slope))
    return np.fft.irfft(X * g, n)


def pink(n):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X /= np.sqrt(np.maximum(f, 20.0))
    return np.fft.irfft(X, n)


def brown(n):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X /= np.maximum(f, 8.0)
    return np.fft.irfft(X, n)


def smooth_noise(n, rate_hz, seed=None):
    """Slow random control signal 0..1, periodic over n samples."""
    r = np.random.default_rng(seed)
    k = max(4, int(n / SR * rate_hz))
    pts = r.random(k)
    pts = np.append(pts, pts[0])
    x = np.linspace(0, k, n, endpoint=False)
    i = x.astype(int)
    t = x - i
    t = t * t * (3 - 2 * t)
    return pts[i] * (1 - t) + pts[i + 1] * t


def make_loop(x, fade_s=1.0):
    """Crossfade the last fade_s into the first fade_s so the loop is seamless."""
    f = int(fade_s * SR)
    out = x[..., :-f].copy()
    ramp = np.linspace(0, 1, f)
    out[..., :f] = x[..., :f] * ramp + x[..., -f:] * (1 - ramp)
    return out


def normalize(x, peak=0.5):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def stereo_from(mono_a, mono_b, width=0.6):
    mid = (mono_a + mono_b) * 0.5
    side = (mono_a - mono_b) * 0.5 * width
    return np.stack([mid + side, mid - side])


# --------------------------------------------------------------------------- snow
def snow_layers():
    dur = 9.0
    n = int(SR * (dur + 1.0))
    # Powder: soft, breathy hiss with a gentle crunchy grain.
    a = fft_filter(pink(n), 500, 5200, 1.5)
    grain = smooth_noise(n, 22, 3) ** 2 * 0.5 + 0.5
    a *= grain * (0.8 + 0.2 * smooth_noise(n, 1.2, 4))
    b = fft_filter(pink(n), 500, 5200, 1.5) * grain
    powder = make_loop(stereo_from(a, b, 0.5))
    write_ogg("snow_powder", normalize(powder, 0.45))
    # Groomed: brighter swish of skis on corduroy.
    c = fft_filter(rng.standard_normal(n), 1400, 9000, 1.2)
    rib = 0.75 + 0.25 * np.sin(np.arange(n) / SR * 2 * np.pi * 7.0 + 2 * np.pi * smooth_noise(n, 1.0, 5))
    c *= rib * (0.85 + 0.15 * smooth_noise(n, 2.0, 6))
    d = fft_filter(rng.standard_normal(n), 1400, 9000, 1.2) * rib
    groomed = make_loop(stereo_from(c, d, 0.4))
    write_ogg("snow_groomed", normalize(groomed, 0.4))
    # Carve: edge hiss with a faint resonant sing.
    e = fft_filter(rng.standard_normal(n), 2200, 5200, 2.5)
    t = np.arange(n) / SR
    sing = np.sin(2 * np.pi * (1850 + 60 * smooth_noise(n, 0.7, 7)) * t) * 0.05
    e = e / (np.std(e) + 1e-9) * 0.25 + sing
    e *= 0.8 + 0.2 * smooth_noise(n, 3.0, 8)
    f = fft_filter(rng.standard_normal(n), 2200, 5200, 2.5)
    f = f / (np.std(f) + 1e-9) * 0.25 + sing
    carve = make_loop(stereo_from(e, f, 0.5))
    write_ogg("snow_carve", normalize(carve, 0.35))


# --------------------------------------------------------------------------- wind
def wind_layers():
    dur = 24.0
    n = int(SR * (dur + 2.0))
    gust_l = smooth_noise(n, 0.18, 10)
    gust_r = smooth_noise(n, 0.18, 11)
    l = fft_filter(brown(n) + pink(n) * 0.15, 60, 900, 1.2)
    r = fft_filter(brown(n) + pink(n) * 0.15, 60, 900, 1.2)
    l = l / np.std(l) * (0.35 + 0.65 * gust_l ** 1.5)
    r = r / np.std(r) * (0.35 + 0.65 * gust_r ** 1.5)
    # A breathy whistle that rides the gusts.
    w1 = fft_filter(rng.standard_normal(n), 700, 1300, 3.0)
    w1 = w1 / np.std(w1) * 0.12 * gust_l ** 3
    amb = make_loop(np.stack([l + w1, r + w1 * 0.7]), 2.0)
    write_ogg("wind_ambient", normalize(amb, 0.45))
    # Speed wind: rushing air past the helmet.
    dur = 10.0
    n = int(SR * (dur + 1.0))
    s1 = fft_filter(pink(n), 150, 2600, 1.3)
    s2 = fft_filter(pink(n), 150, 2600, 1.3)
    mod = 0.8 + 0.2 * smooth_noise(n, 1.5, 12)
    sp = make_loop(stereo_from(s1 * mod, s2 * mod, 0.7))
    write_ogg("wind_speed", normalize(sp, 0.45))


# --------------------------------------------------------------------------- one-shots
def land():
    n = int(SR * 0.7)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (85 * np.exp(-t * 6) + 45) * t) * np.exp(-t * 11)
    snow = fft_filter(pink(n), 120, 2400, 1.5)
    snow = snow / np.std(snow) * 0.25 * np.exp(-t * 9) * (1 - np.exp(-t * 300))
    x = body * 0.8 + snow
    x *= 1 - np.exp(-t * 400)
    write_ogg("land_soft", np.stack([normalize(x, 0.6)] * 2))


def birds():
    def chirp(f0, f1, dur, vib=0.0):
        n = int(SR * dur)
        t = np.arange(n) / SR
        u = t / dur
        f = f0 + (f1 - f0) * (u ** 0.7) + vib * np.sin(2 * np.pi * 28 * t)
        ph = 2 * np.pi * np.cumsum(f) / SR
        env = np.sin(np.pi * u) ** 1.5
        return (np.sin(ph) + 0.18 * np.sin(2 * ph)) * env

    def place(parts, total):
        out = np.zeros(int(SR * total))
        for start, sig in parts:
            i = int(start * SR)
            out[i:i + len(sig)] += sig[: len(out) - i]
        return out

    calls = [
        # Alpine chough-like clear whistles
        place([(0.05, chirp(2600, 3300, 0.16)), (0.32, chirp(2700, 3400, 0.14))], 0.8),
        # Small songbird trill
        place([(0.05 + k * 0.075, chirp(4200 + 300 * (k % 2), 3600, 0.05)) for k in range(7)], 0.8),
        # Falling sweet note pair
        place([(0.05, chirp(3800, 2900, 0.22, 40)), (0.45, chirp(3500, 2700, 0.25, 40))], 0.9),
        # Distant soft "tsee"
        place([(0.05, chirp(6200, 6600, 0.3, 30))], 0.5),
    ]
    for i, c in enumerate(calls):
        c = fft_filter(c, 1500, 9000, 1.0)  # distance: rolled-off lows and highs
        tail = np.convolve(c, np.exp(-np.arange(int(SR * 0.25)) / (SR * 0.06)) * 0.002, mode="full")[: len(c) + int(SR * 0.3)]
        c = np.pad(c, (0, len(tail) - len(c))) + tail
        write_ogg(f"bird_{i + 1}", np.stack([normalize(c, 0.5)] * 2))


# --------------------------------------------------------------------------- music
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def pad_voice(freq, n, attack, release, bright=0.4, seed=0):
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    for det in (-0.07, 0.0, 0.065):
        f = freq * 2 ** (det / 12)
        ph = r.random() * 2 * np.pi
        for h, amp in ((1, 1.0), (2, 0.35 * bright), (3, 0.16 * bright), (4, 0.06 * bright)):
            out += amp * np.sin(2 * np.pi * f * h * t + ph * h)
    env = np.minimum(1, t / attack) * np.minimum(1, (n / SR - t) / release)
    env = np.clip(env, 0, 1) ** 1.6
    return out * env / 3


def piano(freq, dur, vel=0.5):
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, 7):
        fh = freq * h * (1 + 0.0004 * h * h)
        dec = 1.6 + h * 0.9
        out += (0.9 / h ** 1.3) * np.sin(2 * np.pi * fh * t) * np.exp(-t * dec)
    hammer = fft_filter(rng.standard_normal(n), 300, 3000) * np.exp(-t * 80) * 0.02
    env = (1 - np.exp(-t * 250))
    return (out * env + hammer) * vel


def reverb_ir(seconds=4.5, seed=99):
    n = int(SR * seconds)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    ir = []
    for ch in range(2):
        noise = r.standard_normal(n)
        noise = fft_filter(noise, 150, 7000, 1.0)
        env = np.exp(-t * 1.6) * (1 - np.exp(-t * 60))
        # High frequencies die faster: blend in a darker copy over time.
        dark = fft_filter(noise, 0, 1800, 1.0)
        mix = np.exp(-t * 1.2)
        ir.append((noise * mix + dark * (1 - mix)) * env)
    ir = np.array(ir)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def convolve(x, ir):
    n = len(x) + ir.shape[1]
    size = 1 << int(np.ceil(np.log2(n)))
    X = np.fft.rfft(x, size)
    return np.array([np.fft.irfft(X * np.fft.rfft(ir[c], size), size)[:n] for c in range(2)])


def music():
    bpm_bar = 8.0  # seconds per chord
    # D Lydian/major colours: Dmaj9, Bm11, Gmaj7#11, Aadd9 / Em9, Gmaj9, Dmaj9/F#, Asus2
    chords = [
        [50, 57, 61, 64, 66], [47, 54, 57, 61, 64], [43, 50, 54, 61, 63], [45, 52, 57, 59, 64],
        [52, 55, 59, 62, 66], [43, 50, 54, 57, 62], [42, 50, 54, 57, 61], [45, 52, 57, 59, 64],
    ]
    scale = [62, 64, 66, 69, 71, 73, 74, 76, 78, 81]
    loop_len = bpm_bar * len(chords) * 2  # 128 s
    total = loop_len + 6.0
    N = int(SR * total)
    dry = np.zeros((2, N))
    mel = np.zeros((2, N))
    r = np.random.default_rng(2024)
    for rep in range(2):
        for ci, ch in enumerate(chords):
            start = (rep * len(chords) + ci) * bpm_bar
            i0 = int(start * SR)
            n = int((bpm_bar + 3.5) * SR)
            for k, note in enumerate(ch):
                v = pad_voice(midi(note), n, 2.8, 3.5, 0.35 if k else 0.5, seed=ci * 10 + k)
                pan = (k / (len(ch) - 1) - 0.5) * 0.6
                g = 0.11 if k else 0.15
                end = min(N, i0 + n)
                dry[0, i0:end] += v[: end - i0] * g * (1 - pan)
                dry[1, i0:end] += v[: end - i0] * g * (1 + pan)
            # Sparse felt-piano melody, gentler in the first pass.
            beats = [0.0, 1.5, 3.0, 4.5, 6.0] if rep else [0.5, 3.0, 5.5]
            for b in beats:
                if r.random() < (0.75 if rep else 0.6):
                    pcs = [nn % 12 for nn in ch]
                    choices = [s for s in scale if s % 12 in pcs] or scale
                    note = choices[r.integers(len(choices))]
                    tone = piano(midi(note), 5.0, 0.16 + 0.08 * r.random())
                    j0 = int((start + b + r.random() * 0.12) * SR)
                    end = min(N, j0 + len(tone))
                    pan = r.random() * 0.8 - 0.4
                    mel[0, j0:end] += tone[: end - j0] * (1 - pan)
                    mel[1, j0:end] += tone[: end - j0] * (1 + pan)
    # Soft sub drone for warmth
    t = np.arange(N) / SR
    drone = np.sin(2 * np.pi * midi(38) * t) * 0.05 * (0.7 + 0.3 * np.sin(2 * np.pi * t / 32))
    dry += drone
    ir = reverb_ir()
    dry_m = dry[0] + dry[1]
    wet = convolve(dry_m * 0.5, ir) * 0.55 + convolve((mel[0] + mel[1]) * 0.5, ir) * 0.8
    wet = wet[:, :N]
    mix = dry * 0.75 + mel * 0.55 + wet * 0.6
    # Gentle low-pass for warmth.
    mix = np.array([fft_filter(c, 35, 9000, 1.0) for c in mix])
    # Seamless: wrap everything past the loop point onto the start.
    L = int(loop_len * SR)
    out = mix[:, :L].copy()
    tail = mix[:, L:]
    out[:, :tail.shape[1]] += tail
    write_ogg("music_golden_hour", normalize(out, 0.5), quality=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    snow_layers()
    wind_layers()
    land()
    birds()
    music()


if __name__ == "__main__":
    main()
