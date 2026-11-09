// The kite-wings' sails, painted once into a canvas: each racer's cloth is a hand-cut layout of big
// triangles and diamonds (seams radiating from the nose and cutting across the span), every panel with
// its own slight hue drift and soft painterly blotches, sewn together with darker thread, with a bound
// hem along the trailing edge and a rolled sleeve along the leading edge. Nilo's is folded paper (it
// was Fold, the paper boat): alternating light and dark fold facets, the old letter's handwriting, and
// sailcloth patches stitched on where the paper ran out.
//
// The texture covers the wing's planform: u = 0.5 + x / span (left tip .. right tip), v = 0 at the
// nose .. 1 at the keel's end. The cloth shader samples it at the flat (unbillowed) position.
import * as THREE from 'three';

export type WingPattern = 'nilo' | 'zephy' | 'lark' | 'wren';

/** The wing's outline for a given span: nose, keel end and right tip (x, z), and how far the trailing edge curves forward. */
export function planform(span: number) {
  const f = span / 4;
  return {
    f,
    nose: new THREE.Vector3(0, 0.03, 1.0 * f),
    tail: new THREE.Vector3(0, 0, -0.85 * f),
    tip: new THREE.Vector3(0.5 * span, 0.02 * f, -0.5 * f),
    conc: 0.34 * f,
  };
}
export type Planform = ReturnType<typeof planform>;

/** A point of the flat sail in fan coordinates: a 0 (keel) .. 1 (leading edge), v 0 (nose) .. 1 (trailing edge), side sx. Returns x, z. */
export function fanXZ(P: Planform, a: number, v: number, sx: number): [number, number] {
  const bx = P.tail.x + (P.tip.x - P.tail.x) * a;
  let bz = P.tail.z + (P.tip.z - P.tail.z) * a;
  bz += P.conc * Math.pow(Math.sin(Math.PI * a), 0.8) * (1 - 0.25 * a);
  return [sx * (P.nose.x + v * (bx - P.nose.x)), P.nose.z + v * (bz - P.nose.z)];
}

interface Layout {
  /** Radial seams from the nose, as fractions a of the half-span (0 keel .. 1 leading edge). */
  radials: number[];
  /** Per strip between radials: the cross seams, each [v on the inner radial, v on the outer radial]. */
  cuts: [number, number][][];
  /** Per strip, per cell: split the cell along a diagonal (1 inner-top to outer-bottom, -1 the other way, 0 whole). */
  split: number[][];
  /** Colours of the pieces, right half then left half, read in order (strip by strip, cell by cell, piece by piece). */
  right: string[];
  left: string[];
  thread: string;
  hem: string;
  sleeve: string;
}

// Hand-cut layouts. The strips get wider towards the tip, the cuts are uneven and tilted so the pieces
// come out as big irregular triangles and diamonds (like picture 3), never a regular chequer.
const LAYOUTS: Record<Exclude<WingPattern, 'nilo'>, Layout> = {
  // Zephy: red, orange, salmon and cream, a touch of yellow
  zephy: {
    radials: [0, 0.34, 0.69, 1],
    cuts: [[[0.56, 0.42]], [[0.4, 0.62]], [[0.6, 0.44]]],
    split: [[0, 1], [0, -1], [0, 1]],
    right: ['#c8412f', '#f3e3c3', '#e9833c', '#ec9a7e', '#c8412f', '#f0c252', '#e9833c', '#c8412f', '#ec9a7e'],
    left: ['#e9833c', '#c8412f', '#f3e3c3', '#c8412f', '#ec9a7e', '#f3e3c3', '#f0c252', '#e9833c', '#c8412f'],
    thread: '#6e2a20', hem: '#f3e3c3', sleeve: '#b2392a',
  },
  // Lark: sunflower yellow, spring green, cream, a little marigold
  lark: {
    radials: [0, 0.3, 0.64, 1],
    cuts: [[[0.5, 0.62]], [[0.58, 0.4]], [[0.44, 0.6]]],
    split: [[0, -1], [0, 1], [0, -1]],
    right: ['#efc24a', '#f4ead0', '#98be5e', '#e5a142', '#efc24a', '#f4ead0', '#98be5e', '#efc24a', '#f4ead0'],
    left: ['#98be5e', '#efc24a', '#f4ead0', '#efc24a', '#c8da92', '#e5a142', '#f4ead0', '#98be5e', '#efc24a'],
    thread: '#6a5420', hem: '#f4ead0', sleeve: '#c89a34',
  },
  // Gran Wren: cornflower and cobalt blue with white, an old sail mended many times
  wren: {
    radials: [0, 0.4, 0.74, 1],
    cuts: [[[0.5, 0.38]], [[0.42, 0.58]], [[0.54, 0.42]]],
    split: [[0, 1], [0, -1], [0, 1]],
    right: ['#3c6ab2', '#f4f1e8', '#9dc0e4', '#f4f1e8', '#2c4c88', '#3c6ab2', '#9dc0e4', '#f4f1e8', '#3c6ab2'],
    left: ['#f4f1e8', '#3c6ab2', '#f4f1e8', '#9dc0e4', '#3c6ab2', '#f4f1e8', '#3c6ab2', '#2c4c88', '#f4f1e8'],
    thread: '#1e3260', hem: '#f4f1e8', sleeve: '#2c4c88',
  },
};

const W = 1024, H = 512;
const cache = new Map<string, THREE.CanvasTexture>();

/** The painted sail for a racer (cached per pattern and span). */
export function sailTexture(pattern: WingPattern, span: number): THREE.CanvasTexture {
  const key = pattern + span.toFixed(2);
  const hit = cache.get(key); if (hit) return hit;
  const P = planform(span);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const chord = P.nose.z - P.tail.z;
  // planform (x, z) to canvas pixels
  const px = (x: number, z: number): [number, number] => [(0.5 + x / span) * W, ((P.nose.z - z) / chord) * H];
  const fan = (a: number, v: number, sx: number) => { const [x, z] = fanXZ(P, a, v, sx); return px(x, z); };
  let seed = pattern.length * 977 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  if (pattern === 'nilo') paintPaper(g, P, fan, px, rnd);
  else {
    const L = LAYOUTS[pattern];
    g.fillStyle = L.hem; g.fillRect(0, 0, W, H);
    for (const sx of [1, -1]) {
      const cols = sx > 0 ? L.right : L.left;
      let ci = 0;
      const pieces: [number, number][][] = [];
      for (let s = 0; s < L.radials.length - 1; s++) {
        const a0 = L.radials[s], a1 = L.radials[s + 1];
        // the cell boundaries along this strip: the nose, the cuts, then a little past the trailing edge
        const bounds: [number, number][] = [[0, 0], ...L.cuts[s], [1.04, 1.04]];
        for (let c = 0; c < bounds.length - 1; c++) {
          const [i0, o0] = bounds[c], [i1, o1] = bounds[c + 1];
          const A = fan(a0, i0, sx), B = fan(a1, o0, sx), C = fan(a1, o1, sx), D = fan(a0, i1, sx);
          const sp = L.split[s]?.[c] ?? 0;
          if (c === 0) pieces.push([A, C, D]); // the first cell is a triangle from the nose
          else if (sp === 0) pieces.push([A, B, C, D]);
          else if (sp > 0) pieces.push([A, B, C], [A, C, D]);
          else pieces.push([A, B, D], [B, C, D]);
        }
      }
      for (const poly of pieces) panel(g, poly, cols[ci++ % cols.length], rnd);
      for (const poly of pieces) seamLine(g, poly, L.thread);
    }
    // the rolled sleeve along each leading edge, and the bound trailing edge hem
    for (const sx of [1, -1]) {
      const n = fan(1, 0, sx), t = fan(1, 1, sx);
      g.lineCap = 'round';
      g.strokeStyle = L.sleeve; g.lineWidth = 22; line(g, n, t);
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 6; line(g, offset(n, t, -6), offset(t, n, 6));
      g.setLineDash([7, 6]); g.strokeStyle = L.thread; g.lineWidth = 2; line(g, offset(n, t, 13), offset(t, n, -13)); g.setLineDash([]);
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const p = fan(i / 40, 1, sx); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
      g.strokeStyle = L.hem; g.lineWidth = 16; g.stroke();
      g.setLineDash([6, 5]); g.strokeStyle = L.thread; g.lineWidth = 1.6;
      g.beginPath(); for (let i = 0; i <= 40; i++) { const p = fan(i / 40, 0.985, sx); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); g.setLineDash([]);
    }
    // a doubled strip of cloth down the keel
    const k0 = px(0, P.nose.z), k1 = px(0, P.tail.z);
    g.strokeStyle = L.sleeve; g.lineWidth = 9; line(g, k0, k1);
  }
  weave(g, pattern === 'nilo' ? 5 : 9, rnd);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // v = 0 at the nose, the canvas's top row
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, tex);
  return tex;
}

type Pt = [number, number];
function line(g: CanvasRenderingContext2D, a: Pt, b: Pt) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
/** Move point a sideways by d pixels, perpendicular to the line a-b. */
function offset(a: Pt, b: Pt, d: number): Pt { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [a[0] - dy / l * d, a[1] + dx / l * d]; }
function path(g: CanvasRenderingContext2D, poly: Pt[]) { g.beginPath(); poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }

/** One cloth panel: its colour drifted a little in hue and value, a gentle gradient across it and a few soft blotches. */
function panel(g: CanvasRenderingContext2D, poly: Pt[], color: string, rnd: () => number) {
  const c = new THREE.Color(color), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const base = new THREE.Color().setHSL(hsl.h + (rnd() - 0.5) * 0.02, hsl.s * (0.92 + rnd() * 0.1), hsl.l * (0.96 + rnd() * 0.06));
  g.save();
  path(g, poly); g.clip();
  g.fillStyle = '#' + base.getHexString(); g.fill();
  // light falls across each panel a little differently (the cloth was dyed by hand)
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const gr = g.createLinearGradient(minX, minY, maxX, maxY);
  const lift = '#' + base.clone().offsetHSL(0.008, -0.04, 0.07).getHexString(), deep = '#' + base.clone().offsetHSL(-0.01, 0.04, -0.07).getHexString();
  gr.addColorStop(0, rnd() > 0.5 ? lift : deep); gr.addColorStop(1, rnd() > 0.5 ? lift : deep);
  g.globalAlpha = 0.55; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const x = minX + rnd() * (maxX - minX), y = minY + rnd() * (maxY - minY), r = 20 + rnd() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const tint = rnd() > 0.5 ? 'rgba(255,248,230,' : 'rgba(90,40,30,';
    rg.addColorStop(0, tint + (0.05 + rnd() * 0.07) + ')'); rg.addColorStop(1, tint + '0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
}

/** A sewn seam round a panel: a soft dark fold line, the thread over it, and a row of stitches just inside. */
function seamLine(g: CanvasRenderingContext2D, poly: Pt[], thread: string) {
  g.save();
  g.lineJoin = 'round';
  path(g, poly);
  g.filter = 'blur(1.5px)';
  g.strokeStyle = 'rgba(60,30,30,0.3)'; g.lineWidth = 6; g.stroke();
  g.filter = 'none';
  g.strokeStyle = thread; g.globalAlpha = 0.75; g.lineWidth = 1.8; g.stroke();
  // stitches a few pixels inside each edge
  path(g, poly); g.clip();
  g.setLineDash([5, 4]); g.globalAlpha = 0.6; g.lineWidth = 1.3;
  for (let i = 0; i < poly.length; i++) for (const d of [4.5, -4.5]) { const a = poly[i], b = poly[(i + 1) % poly.length]; line(g, offset(a, b, d), offset(b, a, -d)); }
  g.restore();
}

/** Fine weave (or paper fibre): a little per-pixel grain and faint threads. */
function weave(g: CanvasRenderingContext2D, amt: number, rnd: () => number) {
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const thread = ((x & 3) === 0 ? -0.5 : 0) + ((y & 3) === 0 ? -0.5 : 0);
    const n = (rnd() - 0.5) * amt + thread * amt * 0.5;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

/** Nilo's folded paper: six facets per side alternating light and dark, the old letter, sailcloth patches outboard. */
function paintPaper(g: CanvasRenderingContext2D, P: Planform, fan: (a: number, v: number, sx: number) => Pt, px: (x: number, z: number) => Pt, rnd: () => number) {
  g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, W, H);
  const folds = PAPER_FOLDS;
  const tones = ['#fcf9f0', '#e2d7bf', '#f8f3e7', '#ddd1b6', '#f5efe1'];
  for (const sx of [1, -1]) for (let i = 0; i < folds.length - 1; i++) {
    const poly = [fan(folds[i], 0, sx), fan(folds[i + 1], 1.04, sx), fan(folds[i], 1.04, sx)];
    poly.splice(1, 0, fan(folds[i + 1], 0, sx));
    g.fillStyle = tones[i]; path(g, poly); g.fill();
    // a soft shade into each valley fold
    const a = fan(folds[i + 1], 0.5, sx), b = fan(folds[i], 0.5, sx);
    const gr = g.createLinearGradient(b[0], b[1], a[0], a[1]);
    gr.addColorStop(0, 'rgba(120,100,70,0)'); gr.addColorStop(1, i % 2 ? 'rgba(255,255,250,0.25)' : 'rgba(120,100,70,0.12)');
    g.fillStyle = gr; g.fill();
  }
  // the letter: lines of faded handwriting across the middle facets
  g.save();
  g.beginPath(); { const p = [fan(0.6, 0.25, 1), fan(0.6, 0.92, 1), fan(0.6, 0.92, -1), fan(0.6, 0.25, -1)]; p.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }
  g.clip();
  g.strokeStyle = 'rgba(70,84,140,0.3)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2;
  for (let y = 150; y < 400; y += 26) {
    let x = 250 + rnd() * 30;
    while (x < 780) {
      // a word: small cursive loops along the line
      const w = 24 + rnd() * 56;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k <= w; k += 2) { const ph = k * 0.55; g.lineTo(x + k - Math.sin(ph) * 2.5, y - (1 - Math.cos(ph)) * 3.2 - (rnd() > 0.93 ? 5 : 0)); }
      g.stroke();
      x += w + 12 + rnd() * 12;
    }
  }
  g.restore();
  // the little ink drawing from the letter: the river, and a paper boat on it
  g.strokeStyle = 'rgba(40,70,120,0.55)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(420, 455); g.bezierCurveTo(470, 405, 540, 470, 610, 420); g.stroke();
  g.fillStyle = 'rgba(40,40,60,0.6)';
  g.beginPath(); g.moveTo(500, 432); g.lineTo(540, 432); g.lineTo(530, 445); g.lineTo(510, 445); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(520, 431); g.lineTo(520, 410); g.lineTo(534, 428); g.closePath(); g.fill();
  // sailcloth patches stitched on at the tips and the trailing edge, where the boat's paper ran out
  const patches: [number, number, number, number, string][] = [
    [0.78, 0.55, 1.0, 1.04, '#e8d8b4'], [0.56, 0.82, 0.78, 1.04, '#dcc8a0'], [0.82, 0.25, 1.0, 0.55, '#efe2c4'], [0.2, 0.86, 0.38, 1.04, '#e8d8b4'],
  ];
  for (const sx of [1, -1]) for (const [a0, v0, a1, v1, col] of patches) {
    const poly = [fan(a0, v0, sx), fan(a1, v0, sx), fan(a1, v1, sx), fan(a0, v1, sx)];
    panel(g, poly, col, rnd);
    g.save(); path(g, poly); g.clip();
    g.strokeStyle = 'rgba(120,90,50,0.18)'; g.lineWidth = 1;
    for (let k = -600; k < 600; k += 6) line(g, [poly[0][0] + k, 0], [poly[0][0] + k + 300, H]);
    g.restore();
    seamLine(g, poly, '#7a5a34');
  }
  // the crisp crease lines themselves
  for (const sx of [1, -1]) for (let i = 1; i < folds.length; i++) {
    g.strokeStyle = i % 2 ? 'rgba(150,130,100,0.55)' : 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    line(g, fan(folds[i], 0, sx), fan(folds[i], 1, sx));
  }
  g.strokeStyle = 'rgba(150,130,100,0.6)'; g.lineWidth = 2.5; line(g, px(0, P.nose.z), px(0, P.tail.z));
  // a paper hem: the edge folded over once
  for (const sx of [1, -1]) {
    g.beginPath(); for (let i = 0; i <= 40; i++) { const p = fan(i / 40, 1, sx); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.strokeStyle = '#e6dcc4'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#d8ccb0'; g.lineWidth = 16; line(g, fan(1, 0, sx), fan(1, 1, sx));
  }
}

/** The fold facets of Nilo's paper wing, as fractions of the half-span (the geometry creases here too). */
export const PAPER_FOLDS = [0, 4 / 24, 9 / 24, 13 / 24, 18 / 24, 1];
