import sys, glob
from PIL import Image
pre, skip = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 0
fs = sorted([f for f in glob.glob(f'shots/{pre}-*.png') if f.split('-')[1].isdigit()], key=lambda f: int(f.split('-')[1]))[skip:]
ims = [Image.open(f).resize((640, 360)) for f in fs]
W = Image.new('RGB', (1280, 360 * ((len(ims) + 1) // 2)))
for i, im in enumerate(ims): W.paste(im, ((i % 2) * 640, (i // 2) * 360))
W.save(f'shots/grid-{pre}.png')
