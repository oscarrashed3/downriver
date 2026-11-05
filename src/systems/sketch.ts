// Viewpoint sketches: the view in front of Nilo, redrawn as ink and watercolor that draws itself.
// The game renders one frame, we copy it into a 2D canvas, then build two layers from it:
// pencil-ink lines (edges of the picture) and a soft, paper-toned wash. Both are revealed over a few seconds.

export const SW = 640, SH = 360;

export interface Sketch { draw(k: number): void; canvas: HTMLCanvasElement; jpeg(): string }

function paperTone(r: number, g: number, b: number): [number, number, number] {
  // pull colors toward warm paper, keep hue, flatten into a few watercolor values
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const q = (v: number) => Math.round(v / 42) * 42;
  const sat = 0.62;
  let R = l + (r - l) * sat, G = l + (g - l) * sat, B = l + (b - l) * sat;
  R = q(R) * 0.8 + 244 * 0.2; G = q(G) * 0.8 + 234 * 0.2; B = q(B) * 0.8 + 212 * 0.2;
  return [R, G, B];
}

export function makeSketch(src: CanvasImageSource, srcW: number, srcH: number): Sketch {
  const shot = document.createElement('canvas'); shot.width = SW; shot.height = SH;
  const sx = shot.getContext('2d')!;
  // crop to 16:9 from the middle
  const ar = SW / SH; let cw = srcW, ch = srcW / ar; if (ch > srcH) { ch = srcH; cw = srcH * ar; }
  sx.drawImage(src, (srcW - cw) / 2, (srcH - ch) / 2, cw, ch, 0, 0, SW, SH);
  const px = sx.getImageData(0, 0, SW, SH).data;
  const lum = new Float32Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) lum[i] = (0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]) / 255;
  // ink: Sobel edges, thresholded softly
  const ink = document.createElement('canvas'); ink.width = SW; ink.height = SH;
  const ix = ink.getContext('2d')!, inkImg = ix.createImageData(SW, SH);
  const wash = document.createElement('canvas'); wash.width = SW; wash.height = SH;
  const wx = wash.getContext('2d')!, washImg = wx.createImageData(SW, SH);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    const gx = -lum[i - SW - 1] - 2 * lum[i - 1] - lum[i + SW - 1] + lum[i - SW + 1] + 2 * lum[i + 1] + lum[i + SW + 1];
    const gy = -lum[i - SW - 1] - 2 * lum[i - SW] - lum[i - SW + 1] + lum[i + SW - 1] + 2 * lum[i + SW] + lum[i + SW + 1];
    const e = Math.sqrt(gx * gx + gy * gy);
    const a = Math.min(1, Math.max(0, (e - 0.12) * 3.2)) * (0.75 + rnd() * 0.25);
    inkImg.data[i * 4] = 46; inkImg.data[i * 4 + 1] = 34; inkImg.data[i * 4 + 2] = 48; inkImg.data[i * 4 + 3] = a * 255;
    const [R, G, B] = paperTone(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    washImg.data[i * 4] = R; washImg.data[i * 4 + 1] = G; washImg.data[i * 4 + 2] = B; washImg.data[i * 4 + 3] = 255;
  }
  ix.putImageData(inkImg, 0, 0);
  wx.putImageData(washImg, 0, 0);
  // soften the wash so it reads as watercolor, not a photo
  const soft = document.createElement('canvas'); soft.width = SW; soft.height = SH;
  const so = soft.getContext('2d')!; so.filter = 'blur(2.5px)'; so.drawImage(wash, 0, 0); so.filter = 'none';
  // paper
  const paper = document.createElement('canvas'); paper.width = SW; paper.height = SH;
  const pp = paper.getContext('2d')!; pp.fillStyle = '#f4ead2'; pp.fillRect(0, 0, SW, SH);
  for (let i = 0; i < 3000; i++) { pp.fillStyle = `rgba(120,90,50,${rnd() * 0.05})`; pp.fillRect(rnd() * SW, rnd() * SH, 1 + rnd() * 3, 1 + rnd() * 2); }
  // a per-pixel reveal order: a noisy sweep from left to right, so the lines seem to be drawn by hand
  const order = document.createElement('canvas'); order.width = SW / 8; order.height = SH / 8;
  const out = document.createElement('canvas'); out.width = SW; out.height = SH;
  const ox = out.getContext('2d')!;
  const tmp = document.createElement('canvas'); tmp.width = SW; tmp.height = SH;
  const tx = tmp.getContext('2d')!;
  const sweep = (k: number) => {
    // mask of revealed area: columns of uneven height, like strokes
    tx.clearRect(0, 0, SW, SH);
    tx.fillStyle = '#000';
    const front = k * (SW + 160) - 80;
    for (let y = 0; y < SH; y += 6) { const w = front + Math.sin(y * 0.07) * 50 + Math.sin(y * 0.31 + 2) * 20; if (w > 0) tx.fillRect(0, y, w, 6); }
  };
  void order;
  const draw = (k: number) => {
    ox.globalCompositeOperation = 'source-over'; ox.globalAlpha = 1;
    ox.drawImage(paper, 0, 0);
    // wash fades in after the lines are mostly down
    const wk = Math.min(1, Math.max(0, (k - 0.45) / 0.45));
    if (wk > 0) { ox.globalAlpha = wk * 0.9; ox.drawImage(soft, 0, 0); ox.globalAlpha = 1; }
    // lines sweep in during the first 60%
    sweep(Math.min(1, k / 0.6));
    tx.globalCompositeOperation = 'source-in'; tx.drawImage(ink, 0, 0); tx.globalCompositeOperation = 'source-over';
    ox.drawImage(tmp, 0, 0);
    // a thin border, like a sketchbook page
    ox.strokeStyle = 'rgba(80,60,40,0.5)'; ox.lineWidth = 2; ox.strokeRect(10, 10, SW - 20, SH - 20);
  };
  draw(0);
  return {
    canvas: out, draw,
    jpeg: () => { draw(1); const c = document.createElement('canvas'); c.width = 480; c.height = 270; c.getContext('2d')!.drawImage(out, 0, 0, 480, 270); return c.toDataURL('image/jpeg', 0.72); },
  };
}
