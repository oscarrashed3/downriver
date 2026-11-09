# A labelled contact sheet of every png in a folder, in shot order: python3 tools/grid-dir.py <dir> <out.jpg> [cols] [width]
import os, re, sys
from PIL import Image, ImageDraw

d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 480
key = lambda f: int(re.search(r'-(\d+)-', f).group(1)) if re.search(r'-(\d+)-', f) else 0
fs = sorted([f for f in os.listdir(d) if f.endswith('.png')], key=key)
ims = []
for f in fs:
    im = Image.open(os.path.join(d, f)).convert('RGB')
    im = im.resize((tw, int(im.height * tw / im.width)))
    ImageDraw.Draw(im).text((6, 4), f.rsplit('.', 1)[0], fill=(255, 255, 255))
    ims.append(im)
th = ims[0].height
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=85)
print(out, len(ims))
