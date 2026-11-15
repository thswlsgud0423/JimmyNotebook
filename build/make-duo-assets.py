"""Builds theme art for the 고라파덕 & 야돈 (duo) theme from reference_images/reference-search-screenshot.png.
   - duo-diorama.png : cut-out of the Psyduck + Slowpoke pond figure (white background removed, logo/credits dropped)
   - duo-scene.jpg   : the lake scene photo cropped + colour-graded (used as cover / focus backdrop)
   Run: python build/make-duo-assets.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'reference_images', 'reference-search-screenshot.png')
OUT = os.path.join(ROOT, 'renderer', 'assets', 'mascots')
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB')

# ---------- 1. cut-out of the figure (tile on white background) ----------
tile = im.crop((488, 3, 678, 229))
a = np.asarray(tile).astype(np.int16)
h, w, _ = a.shape
near_white = (a.min(axis=2) >= 236)
bg = np.zeros((h, w), bool)
dq = deque()
for x in range(w):
    for y in (0, h - 1):
        if near_white[y, x] and not bg[y, x]:
            bg[y, x] = True; dq.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if near_white[y, x] and not bg[y, x]:
            bg[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and near_white[ny, nx]:
            bg[ny, nx] = True; dq.append((ny, nx))
fg = ~bg
# keep only the largest connected foreground blob (drops the Banpresto logo + copyright text)
lab = np.zeros((h, w), np.int32); sizes = {}; cur = 0
for sy in range(h):
    for sx in range(w):
        if fg[sy, sx] and lab[sy, sx] == 0:
            cur += 1; lab[sy, sx] = cur; q = deque([(sy, sx)]); n = 0
            while q:
                y, x = q.popleft(); n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and lab[ny, nx] == 0:
                        lab[ny, nx] = cur; q.append((ny, nx))
            sizes[cur] = n
big = max(sizes, key=sizes.get)
fg = lab == big
# fill small holes (white eyes etc. are enclosed so they are already foreground; this closes pin-holes)
mask = Image.fromarray((fg * 255).astype(np.uint8))
mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
mask = mask.filter(ImageFilter.MinFilter(3))                       # shave the white halo by ~1px
S = 4
big_img = tile.resize((w * S, h * S), Image.LANCZOS)
big_img = big_img.filter(ImageFilter.UnsharpMask(radius=2.2, percent=90, threshold=2))
big_mask = mask.resize((w * S, h * S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(S * 0.55))
m = np.asarray(big_mask).astype(np.float32) / 255.0
m = np.clip((m - 0.35) / 0.4, 0, 1)                                 # soft but crisp edge
# fade the right-most strip where the screenshot cut the figure off
fade = int(w * S * 0.045)
for i in range(fade):
    m[:, w * S - 1 - i] *= (i / fade)
rgba = np.dstack([np.asarray(big_img), (m * 255).astype(np.uint8)])
cut = Image.fromarray(rgba, 'RGBA')
a_ch = np.asarray(cut.getchannel('A')).copy()
a_ch[int(a_ch.shape[0] * 0.94):, :] = 0                              # drop the credit-text fragment under the base
cut.putalpha(Image.fromarray(a_ch))
bbox = cut.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
cut = cut.crop(bbox)
# gentle grade so it sits in the theme (a touch warmer + slightly richer)
rgb = ImageEnhance.Color(cut.convert('RGB')).enhance(1.08)
rgb = ImageEnhance.Contrast(rgb).enhance(1.03)
cut = Image.merge('RGBA', (*rgb.split(), cut.getchannel('A')))
cut.save(os.path.join(OUT, 'duo-diorama.png'), optimize=True)
print('diorama', cut.size)

# ---------- 2. scene photo (striped tile): crop to the lake scene, grade ----------
st = im.crop((243, 3, 457, 229))
scene = st.crop((6, 30, 208, 200))
scene = scene.resize((scene.width * 4, scene.height * 4), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
scene = ImageEnhance.Color(scene).enhance(1.05)
scene.save(os.path.join(OUT, 'duo-scene.jpg'), quality=88)
print('scene', scene.size)

# ---------- 3. sample the reference palette (for theme colours) ----------
arr = np.asarray(im.resize((120, 105))).reshape(-1, 3).astype(float)
def near(c, d=60):
    sel = arr[(np.abs(arr - np.array(c)).sum(axis=1) < d)]
    return tuple(int(v) for v in sel.mean(axis=0)) if len(sel) else None
print('yellow', near((240, 190, 20), 90), 'pink', near((235, 160, 175), 80), 'water', near((70, 160, 215), 90), 'grass', near((130, 180, 60), 90))
