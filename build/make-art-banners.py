"""Crops the user's reference paintings into wide banners (hero + covers).
   Run: python build/make-art-banners.py  ->  renderer/assets/banners/art-*.jpg  and bg-{psyduck,yadon,duo}.jpg"""
import os
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference_images'); OUT = os.path.join(ROOT, 'renderer', 'assets', 'banners')
W, H = 2400, 520
def load(n): return Image.open(os.path.join(REF, n)).convert('RGB')
def crop(im, cy, cx=0.5, ratio=W / H):
    w, h = im.size
    cw, ch = (w, w / ratio) if w / h < ratio else (h * ratio, h)
    if ch > h: cw, ch = h * ratio, h
    x0 = min(max(cx * w - cw / 2, 0), w - cw); y0 = min(max(cy * h - ch / 2, 0), h - ch)
    out = im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch)))
    if out.width < W: out = out.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
    else: out = out.resize((W, H), Image.LANCZOS)
    return out
def fill(im, side='r'):
    """whole artwork kept visible: sits at the right, blurred copy of itself fills the rest"""
    bg = im.resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(60))
    r = H / im.height; fg = im.resize((max(1, int(im.width * r)), H), Image.LANCZOS)
    x = (W - fg.width) // 2
    m = Image.new('L', fg.size, 255); d = ImageDraw.Draw(m); f = 90
    for i in range(f): d.line((i, 0, i, fg.height), fill=int(255 * i / f))
    bg.paste(fg, (x, 0), m); return bg
def save(im, name): im.save(os.path.join(OUT, name), quality=88)
falls = load('psyducks-in-waterfalls-6stwq6myyaxyjmxc.jpg')
lake = load('Gy-Two0XgAA7HkL.jpg')
meadow = load('uXamxk.png')
save(crop(falls, 0.56), 'art-falls.jpg')
save(crop(lake, 0.42, 0.55), 'art-lake.jpg')
save(crop(meadow, 0.55), 'art-meadow.jpg')
save(crop(load('images (4).jpg'), 0.62), 'art-pond.jpg')
save(fill(load('images (1).jpg')), 'art-sea.jpg')
save(fill(load('images (3).jpg')), 'art-swing.jpg')
save(fill(load('images.jpg').crop((64, 0, 534, 335))), 'art-bath.jpg')
save(fill(load('images (2).jpg')), 'art-snow.jpg')
save(fill(load('images (6).jpg')), 'art-boat.jpg')
save(fill(load('images (7).jpg')), 'art-30th.jpg')
save(fill(load('images (9).jpg')), 'art-well.jpg')
save(crop(load('1a13b5887a5f78a42044e367f4450f8a.jpg'), 0.55), 'art-onsen.jpg')
save(fill(load('images (8).jpg')), 'art-ring.jpg')
save(fill(load('images (5).jpg')), 'art-field.jpg')
# theme heroes
save(crop(falls, 0.56), 'bg-psyduck.jpg')
_y = crop(lake, 0.42, 0.0); _r = H / lake.height; _f = lake.resize((int(lake.width * _r), H), Image.LANCZOS)
_m = Image.new('L', _f.size, 255); _d = ImageDraw.Draw(_m)
for _i in range(300): _d.line((_i, 0, _i, H), fill=int(255 * (_i / 300) ** 1.4))
_y.paste(_f, (W - _f.width, 0), _m); save(_y, 'bg-yadon.jpg')
# duo: waterfall + Psyduck on the left melting into the whole floating Slowpoke on the right
a = crop(falls, 0.56, 0.40)
r = H / lake.height; fg = lake.resize((int(lake.width * r), H), Image.LANCZOS)
m = Image.new('L', fg.size, 255); d = ImageDraw.Draw(m); f = 300
for i in range(f): d.line((i, 0, i, H), fill=int(255 * (i / f) ** 1.6))
a.paste(fg, (W - fg.width, 0), m)
save(a, 'bg-duo.jpg')
print('ok')
