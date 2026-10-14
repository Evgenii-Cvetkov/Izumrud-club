"""Фото-заглушки для демо-альбомов: мягкие абстрактные снимки в палитре клуба.
Использование: python3 scripts/make-photos.py <папка> <количество>
Печатает имена созданных файлов."""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

out = Path(sys.argv[1])
n = int(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
palettes = [
    [(18, 48, 42), (11, 110, 79), (213, 230, 219), (176, 141, 87)],
    [(13, 61, 54), (28, 122, 106), (233, 238, 234), (90, 70, 50)],
    [(31, 74, 43), (63, 135, 82), (246, 248, 245), (140, 110, 80)],
]
for i in range(n):
    rnd = random.Random(i)
    pal = palettes[i % len(palettes)]
    w, h = (1600, 1067) if i % 3 else (1067, 1600)
    im = Image.new("RGB", (w, h), pal[0])
    d = ImageDraw.Draw(im)
    for _ in range(14):
        c = rnd.choice(pal[1:])
        r = rnd.randint(min(w, h) // 8, min(w, h) // 2)
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    im = im.filter(ImageFilter.GaussianBlur(min(w, h) // 14))
    name = f"photo-{i + 1:02d}.webp"
    im.save(out / name, "WEBP", quality=72)
    print(name)
