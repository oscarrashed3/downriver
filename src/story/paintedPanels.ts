// The opening story, painted in code: soft gouache skies, layered clouds lit from above and shadowed below,
// hazy distance, a brush pass that breaks every flat area into strokes, and paper grain on top.
// No ink outlines: shapes are made of value and colour, the way a background painter would.

const W = 1200, H = 750;

function rng(seed: number) { let s = seed * 48271 + 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
type R = () => number;
type C = CanvasRenderingContext2D;

function sky(x: C, stops: [number, string][]) {
  const g = x.createLinearGradient(0, 0, 0, H);
  for (const [k, c] of stops) g.addColorStop(k, c);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

/** A soft round glow (moon, lantern, sun through cloud). */
function glow(x: C, cx: number, cy: number, r: number, col: string, a = 1) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = a; x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.globalAlpha = 1;
}

/**
 * A painted cloud: a heap of puffs. Each is laid down three times: a soft dark belly, the body,
 * then a lit crown offset toward the light, so it reads as a lump of vapour with sun on top.
 */
function cloud(x: C, cx: number, cy: number, w: number, h: number, r: R, cols: { shade: string; body: string; lit: string }, light = -0.6, soft = 6) {
  const puffs: number[][] = [];
  const n = Math.round(w / 26);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), px = cx - w / 2 + t * w + (r() - 0.5) * 30;
    const top = Math.sin(t * Math.PI) * h; // tallest in the middle
    const rad = 22 + r() * 30 + top * 0.35;
    puffs.push([px, cy - top * (0.4 + r() * 0.5), rad]);
  }
  x.save();
  x.filter = `blur(${soft}px)`;
  x.fillStyle = cols.shade;
  for (const [a, b, rad] of puffs) { x.beginPath(); x.ellipse(a, b + rad * 0.35, rad * 1.1, rad * 0.8, 0, 0, 7); x.fill(); }
  x.filter = `blur(${soft * 0.6}px)`;
  x.fillStyle = cols.body;
  for (const [a, b, rad] of puffs) { x.beginPath(); x.ellipse(a, b, rad, rad * 0.85, 0, 0, 7); x.fill(); }
  x.filter = `blur(${soft * 0.5}px)`;
  x.fillStyle = cols.lit;
  for (const [a, b, rad] of puffs) { x.beginPath(); x.ellipse(a + light * rad * 0.25, b - rad * 0.35, rad * 0.62, rad * 0.45, 0, 0, 7); x.fill(); }
  x.restore();
}

/** A long low bank of cloud right across the frame. */
function bank(x: C, y: number, h: number, r: R, cols: { shade: string; body: string; lit: string }, soft = 8) {
  for (let cx = -100; cx < W + 200; cx += 180 + r() * 120) cloud(x, cx, y + (r() - 0.5) * 30, 260 + r() * 160, h * (0.6 + r() * 0.6), r, cols, -0.6, soft);
  x.save(); x.filter = `blur(${soft}px)`; x.fillStyle = cols.shade; x.fillRect(-50, y + 10, W + 100, H); x.restore();
}

/** A mountain ridge with hazy fill, a lit face and a shadowed face, and snow on the peaks if asked. */
function ridge(x: C, base: number, peaks: number[][], col: string, lit: string, r: R, snow?: string) {
  x.save();
  x.beginPath(); x.moveTo(-20, H);
  for (const [px, py] of peaks) x.lineTo(px, py);
  x.lineTo(W + 20, base); x.lineTo(W + 20, H); x.closePath();
  x.fillStyle = col; x.fill();
  x.clip();
  // lit slopes: from each peak, a lighter wedge down the left face
  for (let i = 1; i < peaks.length - 1; i++) {
    const [px, py] = peaks[i], [qx, qy] = peaks[i - 1];
    x.fillStyle = lit; x.globalAlpha = 0.55;
    x.beginPath(); x.moveTo(px, py); x.lineTo(qx, qy); x.lineTo(qx + (px - qx) * 0.3, H); x.lineTo(px + 10, H); x.closePath(); x.fill();
    if (snow && py < base - 60) {
      x.globalAlpha = 0.9; x.fillStyle = snow;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k <= 6; k++) { const t = k / 6; x.lineTo(px + (qx - px) * t * 0.35 + (r() - 0.5) * 8, py + 22 + t * 10 + r() * 14); }
      x.lineTo(px + 18, py + 24 + r() * 12); x.closePath(); x.fill();
    }
  }
  x.globalAlpha = 1; x.restore();
}


/**
 * A towering cumulus: rows of puffs stacked narrower toward the top. Each puff is a ball lit from the upper left
 * (bright crown, body colour, cool shade toward the bottom right), with the flat belly melted into the sky below.
 */
function cumulus(x: C, cx: number, base: number, w: number, h: number, r: R, cols: { shade: string; body: string; lit: string }, soft = 1.2) {
  const puffs: number[][] = [];
  const rows = Math.max(2, Math.round(h / 45));
  for (let row = 0; row < rows; row++) {
    const t = row / rows, rw = w * (1 - t * 0.75) * (0.85 + r() * 0.3), y = base - t * h;
    const n = Math.max(2, Math.round(rw / 55));
    for (let i = 0; i < n; i++) {
      const px = cx - rw / 2 + (i + 0.5) / n * rw + (r() - 0.5) * 30 + (row % 2) * 12;
      puffs.push([px, y + (r() - 0.5) * 16, 30 + r() * 26 + (1 - t) * 18]);
    }
  }
  // the belly first, soft, so the bottom dissolves
  x.save(); x.filter = 'blur(10px)'; x.fillStyle = cols.shade;
  x.beginPath(); x.ellipse(cx, base + 18, w * 0.55, 34, 0, 0, 7); x.fill(); x.restore();
  // three flat tones, like a background painter's cel: shade for the whole mass, the body laid over it a little higher,
  // then lit crowns up and to the left. The puffs fuse into one cloud instead of reading as balls.
  x.save(); x.filter = `blur(${soft}px)`;
  const top = Math.min(...puffs.map(p => p[1] - p[2])), mid = base - h * 0.35;
  x.fillStyle = cols.shade;
  for (const [px, py, rad] of puffs) { x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); }
  x.fillStyle = cols.body;
  for (const [px, py, rad] of puffs) { x.beginPath(); x.arc(px - rad * 0.06, py - rad * 0.16, rad * 0.9, 0, 7); x.fill(); }
  x.filter = `blur(${soft * 2 + 2}px)`; x.fillStyle = cols.lit;
  for (const [px, py, rad] of puffs) if (py < mid) { x.beginPath(); x.ellipse(px - rad * 0.2, py - rad * 0.3, rad * 0.85, rad * 0.62, -0.25, 0, 7); x.fill(); }
  x.restore();
  void top;
}

/** A ridge line roughened by midpoint displacement, so mountains have shoulders and gullies instead of straight sides. */
function rough(pts: number[][], r: R, depth = 5, amp = 0.18): number[][] {
  let out = pts;
  for (let d = 0; d < depth; d++) {
    const next: number[][] = [];
    for (let i = 0; i < out.length - 1; i++) {
      const [ax, ay] = out[i], [bx, by] = out[i + 1];
      next.push(out[i], [(ax + bx) / 2, (ay + by) / 2 + (r() - 0.5) * Math.abs(bx - ax) * amp]);
    }
    next.push(out[out.length - 1]); out = next;
  }
  return out;
}

/** A mountain range: rough ridge, sunlit faces brushed on, snow caps, and a haze rising from its foot. */
function range(x: C, pts: number[][], r: R, col: string, lit: string, haze: string, snow?: string, snowLine = 0) {
  const P = rough(pts, r);
  x.save();
  x.beginPath(); x.moveTo(-20, H); P.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(W + 20, H); x.closePath();
  x.fillStyle = col; x.fill(); x.clip();
  // sunlit faces: strokes running down-left from the ridge wherever the ridge climbs to the right
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i];
    if (by < ay) { x.globalAlpha = 0.5; x.fillStyle = lit; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.lineTo(bx - 40, by + 160); x.lineTo(ax - 40, ay + 160); x.closePath(); x.fill(); }
    if (snow && by < snowLine) { x.globalAlpha = 0.95; x.fillStyle = snow; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.lineTo(bx + (r() - 0.5) * 10, by + 14 + r() * 26); x.lineTo(ax, ay + 10 + r() * 20); x.closePath(); x.fill(); }
  }
  x.globalAlpha = 1;
  const g = x.createLinearGradient(0, Math.min(...P.map(p => p[1])), 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, haze);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.restore();
}

/** A forest as hundreds of little round tree crowns, dark below and catching the light on top. */
function trees(x: C, r: R, x0: number, x1: number, yAt: (px: number) => number, n: number, dark: string, mid: string, lit: string, size = 9) {
  const list: number[][] = [];
  for (let i = 0; i < n; i++) { const px = x0 + r() * (x1 - x0); list.push([px, yAt(px) + r() * size * 6, size * (0.6 + r() * 0.8)]); }
  list.sort((a, b) => a[1] - b[1]);
  for (const [px, py, s] of list) {
    x.fillStyle = dark; x.beginPath(); x.ellipse(px, py, s, s * 1.2, 0, 0, 7); x.fill();
    x.fillStyle = mid; x.beginPath(); x.ellipse(px - s * 0.2, py - s * 0.3, s * 0.75, s * 0.8, 0, 0, 7); x.fill();
    x.fillStyle = lit; x.beginPath(); x.ellipse(px - s * 0.35, py - s * 0.6, s * 0.35, s * 0.3, 0, 0, 7); x.fill();
  }
}

/** A patchwork of fields on the valley floor, rows narrowing into the distance. */
function fields(x: C, r: R, top: number, bottom: number, cols: string[]) {
  for (let y = top; y < bottom;) {
    const h = 6 + (y - top) * 0.09;
    for (let px = -40; px < W + 40;) {
      const w = 40 + r() * 90 + (y - top) * 0.6;
      x.fillStyle = cols[Math.floor(r() * cols.length)];
      x.beginPath(); x.moveTo(px, y); x.lineTo(px + w, y + (r() - 0.5) * 3); x.lineTo(px + w + 4, y + h); x.lineTo(px - 2, y + h); x.closePath(); x.fill();
      px += w + 2;
    }
    y += h + 1.5;
  }
}

/** Rain as long soft streaks blown sideways. */
function rain(x: C, r: R, col: string, n = 500, slant = -0.35) {
  x.save(); x.strokeStyle = col; x.lineWidth = 1.2; x.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = r() * (W + 200), b = r() * H, l = 18 + r() * 34; x.globalAlpha = 0.15 + r() * 0.3; x.beginPath(); x.moveTo(a, b); x.lineTo(a + slant * l, b + l); x.stroke(); }
  x.restore();
}

/** Wind: long pale brush strokes curling across the sky. */
function wind(x: C, r: R, col: string, n = 9) {
  x.save(); x.strokeStyle = col; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = 120 + r() * (H - 300), len = 300 + r() * 500, x0 = r() * W - 200;
    x.globalAlpha = 0.18 + r() * 0.2; x.lineWidth = 2 + r() * 4;
    x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + len * 0.3, y - 40 - r() * 40, x0 + len * 0.6, y + 30, x0 + len, y - 20 + r() * 30);
    if (r() < 0.5) { const ex = x0 + len, ey = y - 10; x.quadraticCurveTo(ex + 40, ey - 30, ex + 10, ey - 50); }
    x.stroke();
  }
  x.restore();
}

/** The paper boat, folded from cream paper, shaded on the side away from the light. */
function boat(x: C, cx: number, cy: number, s: number, rot: number, lit = '#f6eedc', shade = '#c9bca2') {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.fillStyle = shade; x.beginPath(); x.moveTo(-42, 0); x.lineTo(42, 0); x.lineTo(28, 18); x.lineTo(-28, 18); x.closePath(); x.fill();
  x.fillStyle = lit; x.beginPath(); x.moveTo(-42, 0); x.lineTo(0, 0); x.lineTo(-6, 18); x.lineTo(-28, 18); x.closePath(); x.fill();
  x.fillStyle = lit; x.beginPath(); x.moveTo(-16, 0); x.lineTo(0, -38); x.lineTo(0, 0); x.closePath(); x.fill();
  x.fillStyle = shade; x.beginPath(); x.moveTo(0, -38); x.lineTo(16, 0); x.lineTo(0, 0); x.closePath(); x.fill();
  x.restore();
}

/** Nilo: a small hooded shape in his tan coat, two warm eyes in the shadow of the hood. */
function nilo(x: C, cx: number, cy: number, s: number, rot = 0, coat = '#c79a6a', dark = '#8a6440') {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.fillStyle = dark; x.beginPath(); x.moveTo(-11, 0); x.quadraticCurveTo(-12, -16, -7, -24); x.quadraticCurveTo(0, -36, 7, -24); x.quadraticCurveTo(12, -16, 11, 0); x.closePath(); x.fill();
  x.fillStyle = coat; x.beginPath(); x.moveTo(-11, 0); x.quadraticCurveTo(-12, -16, -7, -24); x.quadraticCurveTo(-2, -32, 0, -31); x.lineTo(-2, 0); x.closePath(); x.fill();
  x.fillStyle = '#2a1c22'; x.beginPath(); x.ellipse(0, -21, 5, 4.4, 0, 0, 7); x.fill();
  x.fillStyle = '#ffd27a'; x.beginPath(); x.arc(-2, -21, 1.3, 0, 7); x.arc(2.2, -21, 1.3, 0, 7); x.fill();
  x.fillStyle = '#3a5a9a'; x.fillRect(-9, -15, 18, 3);
  x.restore();
}

/** The keeper: a tall cloaked silhouette, crisp and flat against the flash, one warm lantern. */
function keeper(x: C, cx: number, cy: number, s: number) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.fillStyle = '#12101c';
  x.beginPath(); x.moveTo(-34, 0); x.quadraticCurveTo(-26, -60, -18, -92); x.quadraticCurveTo(-18, -122, 0, -128); x.quadraticCurveTo(18, -122, 18, -92);
  x.quadraticCurveTo(30, -50, 40, 0); x.closePath(); x.fill();
  // the cloak streaming out in the wind
  x.beginPath(); x.moveTo(16, -86); x.bezierCurveTo(60, -80, 90, -50, 110, -24); x.quadraticCurveTo(80, -26, 40, -6); x.closePath(); x.fill();
  // arm out, lantern on a short pole
  x.lineWidth = 8; x.lineCap = 'round'; x.strokeStyle = '#12101c'; x.beginPath(); x.moveTo(-14, -84); x.lineTo(-46, -66); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.moveTo(-46, -66); x.lineTo(-46, -54); x.stroke();
  x.restore();
  glow(x, cx - 46 * s, cy - 46 * s, 70 * s, 'rgba(255,206,130,0.9)');
  glow(x, cx - 46 * s, cy - 46 * s, 16 * s, 'rgba(255,240,200,1)');
}

/**
 * The brush pass: thousands of short strokes, each the colour of the paint beneath it, nudged a little,
 * laid along a gentle flow. Flat gradients turn into something that looks put down by hand.
 */
function brush(x: C, r: R, n = 16000, len = 14, width = 3.2, jitter = 10) {
  const img = x.getImageData(0, 0, W, H).data;
  x.save(); x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = Math.floor(r() * W), py = Math.floor(r() * H), o = (py * W + px) * 4;
    const j = (r() - 0.5) * jitter;
    x.strokeStyle = `rgb(${img[o] + j},${img[o + 1] + j},${img[o + 2] + j})`;
    x.globalAlpha = 0.35 + r() * 0.4; x.lineWidth = width * (0.5 + r());
    const a = -0.25 + Math.sin(py * 0.01 + px * 0.004) * 0.5, l = len * (0.5 + r());
    x.beginPath(); x.moveTo(px - Math.cos(a) * l / 2, py - Math.sin(a) * l / 2); x.lineTo(px + Math.cos(a) * l / 2, py + Math.sin(a) * l / 2); x.stroke();
  }
  x.restore();
}

/** Paper: a fine speckle, a faint warm wash and a soft vignette. */
function paper(x: C, r: R, warm = 'rgba(255,236,200,0.06)', vig = 'rgba(10,14,30,0.45)') {
  for (let i = 0; i < 9000; i++) { x.globalAlpha = 0.03 + r() * 0.05; x.fillStyle = r() > 0.5 ? '#ffffff' : '#000000'; x.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5); }
  x.globalAlpha = 1; x.fillStyle = warm; x.fillRect(0, 0, W, H);
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, vig);
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}

/** Three panels: the boat caught in a night storm, the keeper in the lightning, the fall into a morning valley. */
export function stormPanel(i: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const r = rng(i * 7 + 5);
  if (i === 0) {
    // night storm over the cloud sea: deep teal sky, a half moon in a gap, the paper boat thrown along the wind
    sky(x, [[0, '#08141e'], [0.5, '#12303c'], [1, '#1d4652']]);
    for (let k = 0; k < 140; k++) { x.fillStyle = `rgba(230,240,230,${0.2 + r() * 0.5})`; x.fillRect(r() * W, r() * H * 0.6, 1.5, 1.5); }
    glow(x, 840, 300, 220, 'rgba(150,210,200,0.35)');
    x.fillStyle = '#f4f2e2'; x.beginPath(); x.arc(840, 300, 24, 0, 7); x.fill(); x.fillStyle = '#163642'; x.beginPath(); x.arc(828, 294, 22, 0, 7); x.fill();
    const storm = { shade: '#0a1a22', body: '#1e3e48', lit: '#4e7c80' };
    for (const [cx, cy, w, h] of [[150, 170, 520, 70], [620, 120, 560, 60], [1080, 180, 420, 70], [380, 300, 300, 40]]) cumulus(x, cx, cy, w, h, r, storm, 2.5);
    wind(x, r, '#cfeae4', 7);
    // the sea of cloud below, lit by the moon on its crowns
    const sea = { shade: '#102a30', body: '#2c5a5e', lit: '#8cbcb4' };
    for (let cx = -60; cx < W + 120; cx += 150 + r() * 80) cumulus(x, cx, 700 + r() * 30, 260 + r() * 120, 90 + r() * 60, r, sea, 2);
    boat(x, 520, 440, 2.6, -0.3, '#efe8d2', '#9ea296');
    nilo(x, 510, 424, 2.3, -0.3, '#b88a5c', '#6a4c34');
    glow(x, 504, 375, 20, 'rgba(255,214,120,0.7)');
    rain(x, r, '#a8c8d0', 420, -0.3);
    brush(x, r, 22000, 12, 3, 9);
    paper(x, r, 'rgba(120,200,200,0.03)', 'rgba(2,8,14,0.55)');
  } else if (i === 1) {
    // the flash: a towering storm cloud lit from inside, a black crag, the keeper on it with a lantern
    sky(x, [[0, '#dfe6fa'], [0.35, '#a2b2dc'], [0.75, '#4a5684'], [1, '#22283f']]);
    glow(x, 800, 170, 460, 'rgba(255,255,255,0.8)');
    cumulus(x, 760, 420, 900, 330, r, { shade: '#58649a', body: '#a9b6e2', lit: '#f6f8ff' }, 1.5);
    cumulus(x, 160, 360, 420, 150, r, { shade: '#4a5488', body: '#8a98cc', lit: '#d8e0fa' }, 2);
    x.save(); x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.shadowColor = '#e8eeff'; x.shadowBlur = 34; x.beginPath();
    let px = 880, py = 160; x.moveTo(px, py);
    for (let k = 0; k < 10; k++) { px += (r() - 0.5) * 70; py += 28 + r() * 24; x.lineTo(px, py); if (k === 4) { x.moveTo(px, py); } }
    x.stroke(); x.restore();
    range(x, [[-20, 560], [200, 530], [420, 560], [700, 520], [1000, 580], [1220, 540]], r, '#3a4068', '#5a6494', 'rgba(30,34,60,0.6)');
    x.fillStyle = '#100e18';
    x.beginPath(); x.moveTo(0, H); x.lineTo(0, 640);
    rough([[0, 640], [180, 600], [330, 520], [400, 488], [470, 498], [560, 580], [800, 650], [W, 680]], r, 4, 0.12).forEach(([a, b]) => x.lineTo(a, b));
    x.lineTo(W, H); x.closePath(); x.fill();
    keeper(x, 420, 494, 1.45);
    rain(x, r, '#e2e8ff', 520, -0.5);
    brush(x, r, 16000, 12, 3, 8);
    paper(x, r, 'rgba(200,210,255,0.03)', 'rgba(8,10,30,0.5)');
  } else {
    // morning: out of the cloud sea and down toward a green valley, fields and a river far below, the boat fluttering away
    sky(x, [[0, '#2f7fb8'], [0.45, '#6eaed6'], [0.7, '#bcdbe6'], [1, '#e2ecdc']]);
    cumulus(x, 960, 420, 520, 300, r, { shade: '#9cb4c8', body: '#e8f0f4', lit: '#ffffff' }, 1.2);
    cumulus(x, 180, 380, 380, 160, r, { shade: '#a2b8cc', body: '#eaf2f6', lit: '#ffffff' }, 1.2);
    range(x, [[-20, 470], [140, 400], [300, 440], [470, 360], [620, 430], [800, 390], [980, 450], [1220, 410]], r, '#7ea2c4', '#a8c6dc', 'rgba(210,226,236,0.7)', '#f6faff', 410);
    range(x, [[-20, 520], [160, 470], [330, 520], [520, 480], [700, 540], [900, 490], [1220, 540]], r, '#4f8a62', '#7cb47a', 'rgba(190,220,200,0.45)');
    trees(x, r, -20, W + 20, px => 500 + Math.sin(px * 0.01) * 20, 420, '#2f5e3e', '#467a4a', '#7aa864', 7);
    fields(x, r, 560, 640, ['#86bc6a', '#9cc874', '#74aa5e', '#b0d080', '#8ec46c']);
    // the river, catching the sky
    x.save(); x.strokeStyle = '#cfe6ee'; x.lineCap = 'round'; x.lineWidth = 7; x.beginPath(); x.moveTo(600, 560);
    x.bezierCurveTo(660, 590, 520, 610, 600, 640); x.stroke(); x.restore();
    trees(x, r, -40, W + 40, px => 640 + Math.sin(px * 0.02) * 8, 260, '#244a30', '#3a6a40', '#6c9a54', 16);
    x.fillStyle = '#3a6a40'; x.fillRect(0, 700, W, 60);
    cumulus(x, 380, 300, 620, 70, r, { shade: '#c8d6e2', body: '#f2f6f8', lit: '#ffffff' }, 3);
    boat(x, 820, 150, 1.5, 0.9, '#fbf4e2', '#c8bea6');
    nilo(x, 600, 250, 2.2, 2.5);
    wind(x, r, '#ffffff', 5);
    brush(x, r, 20000, 12, 3, 8);
    paper(x, r, 'rgba(255,240,210,0.05)', 'rgba(60,70,90,0.3)');
  }
  return c;
}
