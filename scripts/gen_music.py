#!/usr/bin/env python3
"""Energetic modern background loop for tutorial videos — pure numpy synthesis.
Output: assets-video/music/loop.wav (stereo 44.1kHz, ~31.5s, seamless loop).
Style: 4-on-the-floor kick, offbeat hats, light clap, sidechained bass,
       plucky 16th arpeggio, warm pad. Progression: Am - F - C - G.
"""
import numpy as np
import wave

SR = 44100
BPM = 122.0
BEAT = 60.0 / BPM            # 0.4918s
BAR = BEAT * 4               # 1.967s
BARS = 16
DUR = BAR * BARS             # ~31.47s
N = int(SR * DUR)
t_all = np.arange(N) / SR

rng = np.random.default_rng(7)

def env_exp(n, decay):
    return np.exp(-np.arange(n) / (SR * decay))

def place(buf, start_s, sig, gain=1.0):
    i = int(start_s * SR)
    j = min(i + len(sig), len(buf))
    if i < len(buf):
        buf[i:j] += sig[: j - i] * gain

def kick():
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    f = 110 * np.exp(-tt / 0.028) + 42
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(n, 0.055)
    click = rng.normal(0, 0.25, n) * env_exp(n, 0.004)
    return np.tanh(body * 1.6 + click)

def hat(open_=False):
    n = int((0.12 if open_ else 0.045) * SR)
    x = rng.normal(0, 1, n)
    x = np.diff(x, prepend=0)  # crude highpass
    x = np.diff(x, prepend=0)
    return x * env_exp(n, 0.012 if not open_ else 0.05) * 0.5

def clap():
    n = int(0.18 * SR)
    x = rng.normal(0, 1, n)
    x = np.diff(x, prepend=0)
    e = env_exp(n, 0.05)
    for off in (0.008, 0.017, 0.027):
        i = int(off * SR)
        e[i:] += env_exp(n - i, 0.04)[: n - i] * 0.7
    return x * e

def saw(f, n, det=0.0):
    tt = np.arange(n) / SR
    return 2 * ((tt * (f + det)) % 1.0) - 1.0

def onepole_lp(x, cutoff):
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y

# chord roots (Hz): Am(110) F(87.31) C(130.81) G(98.00); chord tones
CHORDS = [
    (110.00, [110.00, 130.81, 164.81, 220.00]),   # Am
    (87.31,  [87.31, 130.81, 174.61, 220.00]),    # F
    (130.81, [130.81, 164.81, 196.00, 261.63]),   # C
    (98.00,  [98.00, 123.47, 146.83, 196.00]),    # G
]

kick_tr = np.zeros(N)
hat_tr = np.zeros(N)
clap_tr = np.zeros(N)
bass_tr = np.zeros(N)
arp_tr = np.zeros(N)
pad_tr = np.zeros(N)

for b in range(BARS):
    bar_t = b * BAR
    root, tones = CHORDS[b % 4]
    # kick: every beat
    for k in range(4):
        place(kick_tr, bar_t + k * BEAT, kick())
    # hats: 8th offbeats (+ open hat at bar end)
    for e in range(8):
        if e % 2 == 1:
            place(hat_tr, bar_t + e * BEAT / 2, hat(open_=(e == 7 and b % 4 == 3)))
    # clap: beats 2 & 4
    place(clap_tr, bar_t + 1 * BEAT, clap())
    place(clap_tr, bar_t + 3 * BEAT, clap())
    # bass: root 8ths with octave pop on 3.5
    for e in range(8):
        n = int(BEAT * 0.45 * SR)
        f = root * (2 if e == 6 else 1)
        g = saw(f, n)
        g = onepole_lp(g, 320)
        place(bass_tr, bar_t + e * BEAT / 2, g * env_exp(n, 0.16), gain=0.9)
    # arp: 16th notes cycling chord tones (up pattern)
    for s in range(16):
        n = int(BEAT * 0.22 * SR)
        f = tones[s % len(tones)] * (2 if s % 8 >= 4 else 1)
        g = saw(f, n, det=0.6) + 0.4 * saw(f * 2, n)
        g = onepole_lp(g, 2600)
        place(arp_tr, bar_t + s * BEAT / 4, g * env_exp(n, 0.05), gain=0.35)
    # pad: sustained chord (detuned saws), light
    n = int(BAR * 1.02 * SR)
    pad = sum(saw(tn, n, det=d) for tn in tones for d in (-1.5, 1.5)) / (4 * 2)
    pad = onepole_lp(pad, 900)
    place(pad_tr, bar_t, pad * np.hanning(min(n, N)), gain=0.055)

def sidechain_duck(x):
    """Duck x right after each kick beat."""
    y = x.copy()
    step = int(BEAT * SR)
    dip_len = int(0.16 * SR)
    dip = np.ones(dip_len)
    dip[: int(0.03 * SR)] = np.linspace(0.35, 1.0, int(0.03 * SR))
    dip[int(0.03 * SR):] = np.linspace(1.0, 1.0, dip_len - int(0.03 * SR))
    for b in range(BARS):
        for k in range(4):
            i = int((b * BAR + k * BEAT) * SR)
            j = min(i + dip_len, len(y))
            y[i:j] *= dip[: j - i]
    return y

bass_tr = sidechain_duck(bass_tr)
pad_tr = sidechain_duck(pad_tr)

mix = kick_tr * 0.95 + hat_tr * 0.5 + clap_tr * 0.4 + bass_tr * 0.75 + arp_tr * 0.6 + pad_tr
# gentle master saturation + normalize
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.88

# stereo widen arp/hats slightly
right = mix + np.roll(arp_tr * 0.12, int(0.011 * SR)) + np.roll(hat_tr * 0.05, int(0.007 * SR))
left = mix
right /= max(1.0, np.max(np.abs(right)) / 0.88)

stereo = np.stack([left, right], axis=1)
pcm = (stereo * 32767).astype(np.int16)

import os
os.makedirs('/home/z/my-project/assets-video/music', exist_ok=True)
with wave.open('/home/z/my-project/assets-video/music/loop.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

print(f'music written: {DUR:.2f}s loop, peak {np.max(np.abs(stereo)):.3f}')
