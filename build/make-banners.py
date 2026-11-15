"""Procedurally paints the wide header backdrops (hero + page covers) for each theme.
   Scene recipe taken from the reference photo: sky -> hills -> lake with ripples -> grassy shore.
   Run: python build/make-banners.py   ->  renderer/assets/banners/bg-*.jpg
"""
import os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'renderer', 'assets', 'banners')
os.makedirs(OUT, exist_ok=True)
W, H = 2400, 520


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def vgrad(h, top, bot):
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    return (hexc(top)[None, :] * (1 - t) + hexc(bot)[None, :] * t)[:, None, :]


def smooth_noise(w, amp, scales, seed):
    rng = np.random.default_rng(seed)
    x = np.arange(w, dtype=np.float32)
    y = np.zeros(w, np.float32)
    for s in scales:
        ph = rng.uniform(0, 6.28); y += np.sin(x / s * 6.28318 + ph) * (amp / len(scales)) * (1 + 0.4 * rng.random())
    return y


def paint(sky_top, sky_bot, hill1, hill2, water_top, water_bot, shore, grass_top, grass_bot, horizon=0.50, shore_y=0.74, seed=1, clouds=True, lake=True, ripple='#ffffff'):
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), np.float32)
    hy = int(H * horizon)
    img[:] = vgrad(H, sky_top, sky_bot)                              # sky
    base = Image.fromarray(img.astype(np.uint8))
    if clouds:                                                       # soft clouds
        cl = Image.new('L', (W, H), 0); d = ImageDraw.Draw(cl)
        for _ in range(16):
            cx, cy = rng.integers(0, W), rng.integers(20, int(H * 0.40)); rw, rh = rng.integers(160, 420), rng.integers(22, 52)
            for k in range(4):
                d.ellipse((cx - rw + k * 60, cy - rh, cx + rw - k * 40, cy + rh), fill=int(70 + 25 * k))
        cl = cl.filter(ImageFilter.GaussianBlur(26))
        white = Image.new('RGB', (W, H), (255, 255, 255)); base = Image.composite(white, base, cl.point(lambda v: int(v * 0.55)))
    img = np.asarray(base).astype(np.float32)
    # far hills (two soft layers)
    for col, amp, sc, off, sd in ((hill1, 40, (1700, 800, 420), 0.0, seed + 3), (hill2, 26, (1200, 600, 340), 0.05, seed + 7)):
        prof = hy - 20 - smooth_noise(W, amp, sc, sd) - H * off
        yy = np.arange(H, dtype=np.float32)[:, None]
        mask = np.clip((yy - prof[None, :]) / 3.0, 0, 1)[:, :, None]
        img = img * (1 - mask) + hexc(col)[None, None, :] * mask
    if lake:
        # lake band with a wavy shore line
        shore_prof = int(H * shore_y) + smooth_noise(W, 26, (1900, 900, 520), seed + 11)
        yy = np.arange(H, dtype=np.float32)[:, None]
        lake_mask = np.clip((yy - hy) / 3.0, 0, 1) * np.clip((shore_prof[None, :] - yy) / 3.0, 0, 1)
        t = np.clip((yy - hy) / max(1.0, (H * shore_y - hy)), 0, 1)
        water = hexc(water_top)[None, None, :] * (1 - t[:, :, None]) + hexc(water_bot)[None, None, :] * t[:, :, None]
        img = img * (1 - lake_mask[:, :, None]) + water * lake_mask[:, :, None]
        # ripples: thin light dashes, denser toward the shore
        rp = Image.new('L', (W, H), 0); d = ImageDraw.Draw(rp)
        for _ in range(520):
            y = rng.integers(hy + 6, int(H * shore_y) - 6); x = rng.integers(-60, W); L = rng.integers(40, 190)
            d.line((x, y, x + L, y + rng.integers(-2, 3)), fill=int(rng.integers(40, 120)), width=int(rng.integers(1, 3)))
        rp = rp.filter(ImageFilter.GaussianBlur(1.1))
        rm = np.asarray(rp).astype(np.float32)[:, :, None] / 255.0 * lake_mask[:, :, None]
        img = img * (1 - rm) + hexc(ripple)[None, None, :] * rm
        # shore: light rim then grass
        rim = np.clip(1 - np.abs(yy - shore_prof[None, :]) / 7.0, 0, 1)[:, :, None] * 0.55
        img = img * (1 - rim) + hexc(shore)[None, None, :] * rim
        gy = shore_prof
    else:
        gy = np.full(W, int(H * shore_y), np.float32) + smooth_noise(W, 30, (1700, 800, 460), seed + 13)
    # grass / foreground
    yy = np.arange(H, dtype=np.float32)[:, None]
    gm = np.clip((yy - gy[None, :]) / 3.0, 0, 1)[:, :, None]
    t = np.clip((yy - gy[None, :].min()) / (H - gy.min()), 0, 1)[:, :, None]
    grass = hexc(grass_top)[None, None, :] * (1 - t) + hexc(grass_bot)[None, None, :] * t
    img = img * (1 - gm) + grass * gm
    # grass speckle + overall grain
    sp = rng.normal(0, 5.5, (H, W, 1)).astype(np.float32) * gm
    img += sp
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    arr = np.asarray(out).astype(np.float32) + rng.normal(0, 1.6, (H, W, 1))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# pond (reference): blue sky, sage hills, aqua lake, spring-green grass
paint('#9fd3ee', '#e6f4f1', '#a9d3a0', '#86bf86', '#58b0cf', '#9fdbe8', '#e9f6e4', '#b6d96a', '#8fbf4a', seed=11).save(os.path.join(OUT, 'bg-duo.jpg'), quality=90)
# psyduck: warm morning light, pale lake, sandy-olive grass
paint('#f6dfa3', '#fdf1d3', '#d9c98a', '#c6c27d', '#7fc0d4', '#c4e4e8', '#f7efd2', '#d6cc7c', '#b8ae5c', seed=23).save(os.path.join(OUT, 'bg-psyduck.jpg'), quality=90)
# yadon: rosy dusk, lilac water, soft peach-green shore
paint('#f2c3d2', '#fcebe3', '#e3a9bd', '#d58fa8', '#9db0dc', '#cfd6ee', '#fbe9ea', '#cddba3', '#a9c283', seed=37).save(os.path.join(OUT, 'bg-yadon.jpg'), quality=90)
# default: calm indigo dunes (no lake)
paint('#c9cffa', '#eef0fe', '#aab4f1', '#8d98e6', '#aab4f1', '#aab4f1', '#aab4f1', '#7e8adf', '#5e6bd0', lake=False, horizon=0.55, shore_y=0.66, seed=5, clouds=True).save(os.path.join(OUT, 'bg-basic.jpg'), quality=90)
print('banners written to', OUT)
