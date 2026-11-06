# Contact sheets from a playtest's frames: python3 tools/sheet.py <scenario> [outdir] [crop]
# Groups shots/<scenario>-N-<move>-NN.png by move into one row per move, cropped round the middle of the frame.
import os, re, sys
from PIL import Image, ImageDraw

scen = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'shots'
crop = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
rows = {}
for f in sorted(os.listdir('shots')):
    m = re.match(rf'{scen}-(\d+)-(.+?)(?:-(\d\d))?\.png$', f)
    if m: rows.setdefault(m.group(2), []).append((int(m.group(1)), f))
for move, fs in rows.items():
    fs.sort()
    ims = []
    for _, f in fs:
        im = Image.open(os.path.join('shots', f)); w, h = im.size
        cw, ch = int(w * crop * 0.75), int(h * crop * 1.2)
        ch = min(ch, h)
        ims.append(im.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)))
    tw = 220; th = int(ims[0].size[1] * tw / ims[0].size[0])
    per = 6
    nrow = (len(ims) + per - 1) // per
    sheet = Image.new('RGB', (tw * min(per, len(ims)), th * nrow + 24), '#f6eedd')
    d = ImageDraw.Draw(sheet); d.text((6, 5), f'{move}  (left to right, top to bottom; slow motion)', fill='#2b2540')
    for i, im in enumerate(ims): sheet.paste(im.resize((tw, th)), ((i % per) * tw, 24 + (i // per) * th))
    sheet.save(os.path.join(out, f'{scen}-{move}.png'))
    print('sheet', move, len(ims))
