import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines, paint, softRamp, PAINT } from '../../render/paint';
import { leafClump } from '../../render/foliage';

/**
 * The toolkit behind Sailtown's props: painted canvas textures, a small set of shared toon materials that take
 * their colour from vertex colours (so a whole cottage bakes into a handful of meshes), a Kit that collects
 * transformed parts per material and merges them, and the wind-cloth material whose sheets, flags and pennants
 * move in the vertex shader on the shared PAINT clock (no CPU work per frame).
 */

// ---------------------------------------------------------------- random

/** A small seeded generator (Park-Miller), so every prop is the same each time it is built. */
export function rng(seed: number) {
  let s = (Math.floor(Math.abs(seed)) * 48271 + 11) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
export type Rnd = () => number;
/** Pick from a list. */
export const pick = <T>(r: Rnd, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];

// ---------------------------------------------------------------- textures

function canvasTex(S: number, seed: number, draw: (x: CanvasRenderingContext2D, r: Rnd) => void) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  draw(x, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  return t;
}
/**
 * A tangent-space normal map from a texture's brightness (light = raised): blurred first, so it gives soft stone
 * bumps and plaster relief rather than speckle. Used on the walls and stones so they catch the sun unevenly.
 */
function normalFrom(src: THREE.Texture, strength: number, blur = 2): THREE.Texture {
  const img = src.image as HTMLCanvasElement, S = img.width;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.filter = `blur(${blur}px)`;
  // draw tiled 3x3 so the blur wraps across the seams
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) x.drawImage(img, dx, dy);
  const d = x.getImageData(0, 0, S, S).data;
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const out = x.createImageData(S, S);
  const at = (i: number, j: number) => h[((j + S) % S) * S + ((i + S) % S)];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const nx = (at(i - 1, j) - at(i + 1, j)) * strength, ny = (at(i, j + 1) - at(i, j - 1)) * strength;
    const l = Math.hypot(nx, ny, 1), o = (j * S + i) * 4;
    out.data[o] = (nx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  x.filter = 'none'; x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function blot(x: CanvasRenderingContext2D, cx: number, cy: number, rad: number, rgb: string, a: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
}
/** Draw an irregular rounded stone (a wobbly ellipse). */
function stoneShape(x: CanvasRenderingContext2D, r: Rnd, cx: number, cy: number, rw: number, rh: number) {
  x.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.82 + r() * 0.22;
    const px = cx + Math.cos(a) * rw * k, py = cy + Math.sin(a) * rh * k;
    if (i === 0) x.moveTo(px, py); else x.quadraticCurveTo(cx + Math.cos(a - 0.35) * rw * 1.08, cy + Math.sin(a - 0.35) * rh * 1.08, px, py);
  }
  x.closePath();
}
/** Draw in tile-wrapped copies so the texture repeats without seams. */
function wrapped(S: number, cx: number, cy: number, pad: number, f: (cx: number, cy: number) => void) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    const X = cx + dx, Y = cy + dy;
    if (X + pad < 0 || X - pad > S || Y + pad < 0 || Y - pad > S) continue;
    f(X, Y);
  }
}

const texCache = new Map<string, THREE.Texture>();
const onceTex = (k: string, f: () => THREE.Texture) => { let t = texCache.get(k); if (!t) { t = f(); texCache.set(k, t); } return t; };

/**
 * Windfolk wall: thick lime plaster over rubble stone. Mostly smooth warm cream, with patches where the plaster has
 * fallen and the rounded stones show, fine speckle, and soft weather streaks. Drawn near white so vertex colour tints it.
 * One tile covers WALL_TILE metres.
 */
export const WALL_TILE = 2.4;
export const wallTex = () => onceTex('wall', () => canvasTex(512, 21, (x, r) => {
  const S = 512;
  x.fillStyle = '#fbf3e2'; x.fillRect(0, 0, S, S);
  // trowelled lime: broad soft blots, warm and cool, so the plaster never reads as one flat grey
  for (let i = 0; i < 110; i++) { const cx = r() * S, cy = r() * S, rr = 18 + r() * 64; wrapped(S, cx, cy, rr, (X, Y) => blot(x, X, Y, rr, r() > 0.5 ? '228,206,168' : '255,250,238', 0.5)); }
  // exposed rubble where the plaster has fallen: irregular patches (several overlapping lobes) with flattish stones
  // laid in rough courses inside, warm and close in value to the plaster, each lit on top and shaded at its foot
  for (let p = 0; p < 5; p++) {
    const px = r() * S, py = r() * S, pw = 44 + r() * 70, ph = 24 + r() * 30;
    const lobes: [number, number, number, number][] = [];
    for (let k = 0; k < 5; k++) lobes.push([px + (r() - 0.5) * pw, py + (r() - 0.5) * ph * 0.6, pw * (0.28 + r() * 0.3), ph * (0.38 + r() * 0.3)]);
    const inside = (x0: number, y0: number) => lobes.some(([lx, ly, rx, ry]) => ((x0 - lx) / rx) ** 2 + ((y0 - ly) / ry) ** 2 < 1);
    for (const [lx, ly, rx, ry] of lobes) wrapped(S, lx, ly, rx + 6, (X, Y) => { x.fillStyle = 'rgba(200,164,116,0.5)'; x.beginPath(); x.ellipse(X, Y, rx + 3, ry + 3, 0, 0, Math.PI * 2); x.fill(); });
    for (let y0 = py - ph * 0.7; y0 < py + ph * 0.7; y0 += 9 + r() * 4) {
      for (let x0 = px - pw * 0.8 + r() * 6; x0 < px + pw * 0.8;) {
        const w = 11 + r() * 15, h = 6.5 + r() * 3.5;
        if (inside(x0 + w / 2, y0)) wrapped(S, x0 + w / 2, y0, w, (X, Y) => {
          const v = 0.9 + r() * 0.1;
          x.fillStyle = `rgb(${Math.round(244 * v)},${Math.round(226 * v)},${Math.round(192 * v)})`;
          x.beginPath(); x.roundRect(X - w / 2 + 1.5, Y - h / 2, w - 3, h, 3); x.fill();
          x.fillStyle = 'rgba(255,250,234,0.6)'; x.fillRect(X - w / 2 + 3, Y - h / 2 + 0.5, w - 6, 1.6);
          x.fillStyle = 'rgba(140,106,70,0.35)'; x.fillRect(X - w / 2 + 2.5, Y + h / 2 - 1.6, w - 5, 1.4);
        });
        x0 += w;
      }
    }
  }
  // rough render: grit, pits and tiny lumps
  for (let i = 0; i < 5200; i++) {
    const v = r();
    x.fillStyle = v > 0.55 ? `rgba(170,134,90,${0.08 + r() * 0.16})` : `rgba(255,252,242,${0.25 + r() * 0.35})`;
    const s2 = 1 + r() * 2.5; x.fillRect(r() * S, r() * S, s2, s2);
  }
  // weather streaks running down from the eaves and sills
  for (let i = 0; i < 12; i++) {
    const sx = r() * S, w = 6 + r() * 18, h = 80 + r() * 180, sy = r() * S;
    const g = x.createLinearGradient(0, sy, 0, sy + h); g.addColorStop(0, 'rgba(184,150,104,0.16)'); g.addColorStop(1, 'rgba(184,150,104,0)');
    x.fillStyle = g; x.fillRect(sx, sy, w, h);
  }
  x.strokeStyle = 'rgba(120,92,66,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) { let px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 22; py += 6 + r() * 12; x.lineTo(px, py); } x.stroke(); }
}));
export const wallNormal = () => onceTex('wallN', () => normalFrom(wallTex(), 7, 1.5));

/** Dry-laid cream stones: rounded blocks in courses with deep joints (footings, steps, bridge piers). STONE_TILE metres. */
export const STONE_TILE = 1.6;
export const stoneTex = () => onceTex('stone', () => canvasTex(512, 33, (x, r) => {
  const S = 512;
  x.fillStyle = '#8a7660'; x.fillRect(0, 0, S, S);
  // courses of uneven height; blocks of uneven length, a few small fillers
  let y = 0;
  while (y < S - 8) {
    const h = Math.min(S - y, 40 + Math.floor(r() * 4) * 12);
    let cx = r() * 40 - 40;
    while (cx < S) {
      const w = r() < 0.2 ? 26 + r() * 18 : 56 + r() * 70, v = 0.8 + r() * 0.2;
      const X0 = cx, Y0 = y;
      wrapped(S, X0 + w / 2, Y0 + h / 2, w, (X, Y) => {
        const x0 = X - w / 2 + 3, y0 = Y - h / 2 + 3, ww = w - 6, hh = h - 6;
        x.fillStyle = `rgb(${Math.round(244 * v)},${Math.round(230 * v)},${Math.round(204 * v)})`;
        x.beginPath(); x.roundRect(x0, y0, ww, hh, 5); x.fill();
        // a lit top and a shaded foot on every block: crisp, small bevels
        x.fillStyle = 'rgba(255,250,236,0.55)'; x.fillRect(x0 + 2, y0 + 1, ww - 4, 4);
        x.fillStyle = 'rgba(110,86,62,0.28)'; x.fillRect(x0 + 2, y0 + hh - 5, ww - 4, 4);
        // tooling and weather on the face
        for (let k = 0; k < 6; k++) blot(x, x0 + r() * ww, y0 + r() * hh, 6 + r() * 12, r() > 0.5 ? '200,176,140' : '255,248,232', 0.3);
      });
      cx += w;
    }
    y += h;
  }
  for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(110,90,70,${0.08 + r() * 0.14})`; x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 12; i++) { const cx = r() * S, cy = r() * S; wrapped(S, cx, cy, 24, (X, Y) => blot(x, X, Y, 8 + r() * 14, '130,150,84', 0.3)); }
}));
/**
 * Dressed sandstone without coursing, for single blocks (steps, wall stones, the doorstep): a warm granular face with
 * tooling streaks, soft weather stains and pits. Near white, so vertex colours set each block's tone.
 */
export const slabTex = () => onceTex('slab', () => canvasTex(512, 41, (x, r) => {
  const S = 512;
  x.fillStyle = '#f6f0e4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 80; i++) { const cx = r() * S, cy = r() * S, rr = 20 + r() * 70; wrapped(S, cx, cy, rr, (X, Y) => blot(x, X, Y, rr, r() > 0.5 ? '214,196,166' : '255,252,244', 0.4)); }
  // diagonal tooling, very faint
  x.strokeStyle = 'rgba(150,128,96,0.08)'; x.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) { const px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 14, py + 10); x.stroke(); }
  for (let i = 0; i < 4200; i++) { const v = r(); x.fillStyle = v > 0.5 ? `rgba(140,112,80,${0.08 + r() * 0.14})` : `rgba(255,253,246,${0.2 + r() * 0.3})`; const s2 = 1 + r() * 2.2; x.fillRect(r() * S, r() * S, s2, s2); }
  for (let i = 0; i < 14; i++) { const cx = r() * S, cy = r() * S; wrapped(S, cx, cy, 30, (X, Y) => blot(x, X, Y, 10 + r() * 20, '150,140,96', 0.18)); }
}));
export const slabNormal = () => onceTex('slabN', () => normalFrom(slabTex(), 5, 1.2));
export const stoneNormal = () => onceTex('stoneN', () => normalFrom(stoneTex(), 6, 1.2));

/** Wood grain without plank joints (planks are real geometry). Grain runs along U. WOOD_TILE metres. */
export const WOOD_TILE = 1.2;
export const grainTex = () => onceTex('grain', () => canvasTex(256, 45, (x, r) => {
  const S = 256;
  x.fillStyle = '#f6efe4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const y = r() * S, hh = 4 + r() * 16; x.fillStyle = `rgba(150,110,70,${0.05 + r() * 0.08})`; x.fillRect(0, y, S, hh); }
  x.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const y = r() * S; x.strokeStyle = `rgba(95,62,38,${0.15 + r() * 0.25})`;
    x.beginPath(); x.moveTo(0, y);
    const a = (r() - 0.5) * 5, b = (r() - 0.5) * 5;
    x.bezierCurveTo(S * 0.33, y + a, S * 0.66, y + b, S, y); x.stroke();
  }
  // a few knots
  for (let i = 0; i < 4; i++) {
    const cx = r() * S, cy = r() * S;
    wrapped(S, cx, cy, 14, (X, Y) => { x.strokeStyle = 'rgba(90,58,36,0.45)'; for (let k = 1; k < 4; k++) { x.beginPath(); x.ellipse(X, Y, 3 * k + 2, 1.6 * k + 1, 0, 0, Math.PI * 2); x.stroke(); } });
  }
}));

/**
 * Linen weave at 512 px: fine warp and weft threads with slubs, and a few soft tonal clouds. One tile covers
 * LINEN_TILE metres (cloth UVs are in metres), so the weave stays a fine texture and never a pattern of blocks.
 */
export const LINEN_TILE = 0.35;
export const linenTex = () => onceTex('linen', () => canvasTex(512, 57, (x, r) => {
  const S = 512;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) {
    x.fillStyle = `rgba(150,138,118,${0.05 + r() * 0.06})`; x.fillRect(0, i, S, 1);
    x.fillStyle = `rgba(150,138,118,${0.04 + r() * 0.05})`; x.fillRect(i, 0, 1, S);
  }
  // slubs: short thicker threads
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(140,126,104,${0.06 + r() * 0.08})`; if (r() > 0.5) x.fillRect(r() * S, Math.floor(r() * S / 3) * 3, 8 + r() * 26, 1.5); else x.fillRect(Math.floor(r() * S / 3) * 3, r() * S, 1.5, 8 + r() * 26); }
  for (let i = 0; i < 16; i++) { const cx = r() * S, cy = r() * S; wrapped(S, cx, cy, 60, (X, Y) => blot(x, X, Y, 30 + r() * 30, '226,216,196', 0.22)); }
}));

/** Fine engraving for the race gate's brass: a running scroll of vines and curls along the band (v 0.3..0.7). */
export const engraveTex = () => onceTex('engrave', () => {
  const W = 1024, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  // the band between two fine borders
  x.fillStyle = 'rgba(196,160,96,0.5)'; x.fillRect(0, 36, W, 3); x.fillRect(0, 89, W, 3);
  x.strokeStyle = 'rgba(150,112,52,0.75)'; x.lineWidth = 2.2; x.lineCap = 'round';
  const per = 128;
  x.beginPath();
  for (let i = 0; i <= W; i += 4) { const y = 64 + Math.sin((i / per) * Math.PI * 2) * 14; if (i) x.lineTo(i, y); else x.moveTo(i, y); }
  x.stroke();
  for (let k = 0; k < W / per * 2; k++) {
    const cx = k * per / 2 + per / 4, up = k % 2 ? 1 : -1, cy = 64 + up * 6;
    x.beginPath();
    for (let t = 0; t < 1; t += 0.04) { const a = t * Math.PI * 3.2, rr = 15 * (1 - t); const px = cx + Math.cos(a) * rr, py = cy + up * (Math.sin(a) * rr * 0.8 + 6); if (t) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
    // a small leaf on the stalk
    x.beginPath(); x.ellipse(cx - 20, 64 - up * 10, 7, 3, up * 0.6, 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  return t;
});

/**
 * Sailtown's own leaf sheet: a cluster of soft, rounded leaves with painted light and a midrib, cut out by an alpha
 * that is blurred before the cut-off, so card edges come out clean (no ragged pixel fringe for the ink to trace).
 */
export const leafSheetTex = () => onceTex('leafSheet', () => {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  const r = rng(77);
  x.filter = 'blur(1.6px)';
  const leaves: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.8) * S * 0.3;
    leaves.push([S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 52 + r() * 34, a + (r() - 0.5) * 1.0, 0.72 + r() * 0.28, d]);
  }
  leaves.sort((p, q) => q[5] - p[5]);
  // a dense inner body so the cluster reads as a mass, leaves round its edge
  x.fillStyle = grey(0.7); x.beginPath(); x.arc(S / 2, S / 2, S * 0.24, 0, Math.PI * 2); x.fill();
  for (const [cx, cy, len, rot, v] of leaves) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    const wid = len * 0.46;
    const g = x.createLinearGradient(0, -wid, 0, wid); g.addColorStop(0, grey(v)); g.addColorStop(1, grey(v * 0.8));
    x.fillStyle = g; x.beginPath(); x.moveTo(-len * 0.5, 0);
    x.bezierCurveTo(-len * 0.2, -wid, len * 0.35, -wid * 0.9, len * 0.55, 0);
    x.bezierCurveTo(len * 0.35, wid * 0.9, -len * 0.2, wid, -len * 0.5, 0); x.fill();
    x.restore();
  }
  x.filter = 'none';
  for (const [cx, cy, len, rot, v] of leaves) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.strokeStyle = grey(Math.min(1, v + 0.15), 0.6); x.lineWidth = 2; x.beginPath(); x.moveTo(-len * 0.4, 0); x.quadraticCurveTo(0, -2, len * 0.45, 0); x.stroke();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
});

// ---------------------------------------------------------------- flora atlas

/**
 * One 1024 px atlas of painted plant cards, 4 by 4 cells: florets, leaves, petals, grass, clover, ivy. Petals and
 * leaves are drawn in greys so a vertex or instance colour tints them; parts drawn in real colour (green stems, yellow
 * and maroon flower eyes) keep it, because the card shader only tints the unsaturated texels.
 */
export const CELL = {
  floret: 0, leafBig: 1, lavender: 2, coreopsis: 3, daisy: 4, cosmos: 5, grass: 6, clover: 7,
  sprig: 8, leafy: 9, buttercup: 10, rose: 11, ivy: 12, alyssum: 13, narrow: 14, solid: 15,
} as const;
export type CellName = keyof typeof CELL;
const AT = 1024, CS = 256, PAD = 6;
/** The UV rectangle of an atlas cell: [u0, v0, u1, v1] (v up, as the texture is flipped). */
export function cellUV(cell: number): [number, number, number, number] {
  const ox = (cell % 4) * CS, oy = Math.floor(cell / 4) * CS;
  return [(ox + PAD) / AT, 1 - (oy + CS - PAD) / AT, (ox + CS - PAD) / AT, 1 - (oy + PAD) / AT];
}
const grey = (v: number, a = 1) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgba(${c},${c},${c},${a})`; };
function petal(x: CanvasRenderingContext2D, cx: number, cy: number, a: number, len: number, wid: number, r0 = 0) {
  x.save(); x.translate(cx, cy); x.rotate(a);
  x.beginPath(); x.moveTo(r0, 0);
  x.bezierCurveTo(r0 + len * 0.3, -wid, r0 + len * 0.9, -wid * 0.9, r0 + len, 0);
  x.bezierCurveTo(r0 + len * 0.9, wid * 0.9, r0 + len * 0.3, wid, r0, 0);
  x.restore();
}
export const floraAtlas = () => onceTex('flora', () => {
  const c = document.createElement('canvas'); c.width = c.height = AT;
  const x = c.getContext('2d')!;
  const r = rng(91);
  const cell = (i: number, f: () => void) => {
    x.save(); x.translate((i % 4) * CS, Math.floor(i / 4) * CS);
    x.beginPath(); x.rect(PAD, PAD, CS - PAD * 2, CS - PAD * 2); x.clip();
    f(); x.restore();
  };
  // florets: four rounded petals, pale toward the tips, a darker eye
  cell(CELL.floret, () => {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.25;
      const gr = x.createRadialGradient(128, 128, 6, 128, 128, 120);
      gr.addColorStop(0, grey(0.72)); gr.addColorStop(0.45, grey(0.97)); gr.addColorStop(1, grey(0.9));
      x.fillStyle = gr; petal(x, 128, 128, a, 116, 52, 4); x.fill();
      x.strokeStyle = grey(0.6, 0.8); x.lineWidth = 4; x.stroke();
    }
    x.fillStyle = grey(0.55); x.beginPath(); x.arc(128, 128, 12, 0, Math.PI * 2); x.fill();
  });
  // a big serrated leaf (hydrangea), tip up, with a midrib and veins
  cell(CELL.leafBig, () => {
    const pts: [number, number][] = [];
    const n = 30;
    for (let i = 0; i <= n; i++) { const t = i / n, w = 96 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * (i % 2 ? 0.93 : 1); pts.push([128 + w, 244 - t * 230]); }
    x.beginPath(); x.moveTo(128, 244);
    for (const [px, py] of pts) x.lineTo(px, py);
    for (let i = pts.length - 1; i >= 0; i--) x.lineTo(256 - pts[i][0], pts[i][1]);
    x.closePath();
    const gr = x.createLinearGradient(0, 244, 0, 14); gr.addColorStop(0, grey(0.78)); gr.addColorStop(1, grey(1));
    x.fillStyle = gr; x.fill();
    x.fillStyle = grey(0, 0.1); x.beginPath(); x.moveTo(128, 244); for (const [px, py] of pts) x.lineTo(px, py); x.closePath(); x.fill();
    x.strokeStyle = grey(0.62); x.lineWidth = 6; x.beginPath(); x.moveTo(128, 250); x.lineTo(128, 24); x.stroke();
    x.lineWidth = 3;
    for (let i = 1; i < 8; i++) { const y = 230 - i * 26; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 + s * 40, y - 20, 128 + s * 70 * Math.sin(Math.PI * (1 - i / 9)), y - 44); x.stroke(); } }
  });
  // lavender spike: a thin grey-green stem; on its top 45% a tapering column of tiny florets in whorls, the gaps between
  // whorls opening toward the base, pale at the tip and deeper below (the instance colour sets the violet)
  cell(CELL.lavender, () => {
    x.strokeStyle = '#7f9468'; x.lineWidth = 3.2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(128, 256); x.quadraticCurveTo(126, 170, 129, 22); x.stroke();
    x.filter = 'blur(0.7px)';
    for (let k = 13; k >= 0; k--) {
      const y = 16 + k * 8 + Math.max(0, k - 7) * 3.2, w = 3 + k * 1.15;
      const n = 3 + Math.round(k * 0.5);
      for (let i = 0; i < n; i++) {
        const fx = 129 + (r() - 0.5) * 2 * w, fy = y + (r() - 0.5) * 5;
        x.fillStyle = grey(Math.min(1, 1.02 - k * 0.022 + (r() - 0.5) * 0.12));
        x.beginPath(); x.ellipse(fx, fy, 3 + r() * 2.2, 3.6 + r() * 2.4, (r() - 0.5) * 0.8, 0, Math.PI * 2); x.fill();
      }
    }
    x.filter = 'none';
  });
  // coreopsis: eight broad petals with toothed tips round a maroon eye
  cell(CELL.coreopsis, () => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      x.save(); x.translate(128, 128); x.rotate(a);
      x.beginPath(); x.moveTo(16, -10); x.lineTo(108, -34); x.lineTo(116, -16); x.lineTo(108, -6); x.lineTo(118, 6); x.lineTo(110, 18); x.lineTo(118, 30); x.lineTo(100, 38); x.lineTo(16, 10); x.closePath();
      const gr = x.createLinearGradient(16, 0, 118, 0); gr.addColorStop(0, grey(0.8)); gr.addColorStop(0.4, grey(1)); gr.addColorStop(1, grey(0.94));
      x.fillStyle = gr; x.fill(); x.strokeStyle = grey(0.7, 0.7); x.lineWidth = 3; x.stroke();
      x.restore();
    }
    x.fillStyle = '#7a2c1a'; x.beginPath(); x.arc(128, 128, 36, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#b07a22'; x.beginPath(); x.arc(128, 128, 19, 0, Math.PI * 2); x.fill();
  });
  // daisy: many narrow white petals round a yellow eye
  cell(CELL.daisy, () => {
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2 + r() * 0.1;
      x.fillStyle = grey(0.9 + r() * 0.1); petal(x, 128, 128, a, 104 + r() * 12, 13, 14); x.fill();
      x.strokeStyle = grey(0.66, 0.8); x.lineWidth = 2.5; x.stroke();
    }
    x.fillStyle = '#e2a414'; x.beginPath(); x.arc(128, 128, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffd23c'; x.beginPath(); x.arc(122, 122, 18, 0, Math.PI * 2); x.fill();
  });
  // cosmos: eight broad notched petals with streaks
  cell(CELL.cosmos, () => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      x.save(); x.translate(128, 128); x.rotate(a);
      x.beginPath(); x.moveTo(12, -8); x.quadraticCurveTo(70, -52, 116, -30); x.lineTo(104, -12); x.lineTo(118, 0); x.lineTo(104, 12); x.lineTo(116, 30); x.quadraticCurveTo(70, 52, 12, 8); x.closePath();
      x.fillStyle = grey(0.95); x.fill(); x.strokeStyle = grey(0.7, 0.8); x.lineWidth = 3; x.stroke();
      x.strokeStyle = grey(0.78, 0.7); x.lineWidth = 2;
      for (const s of [-16, 0, 16]) { x.beginPath(); x.moveTo(24, s * 0.3); x.lineTo(96, s); x.stroke(); }
      x.restore();
    }
    x.fillStyle = '#e8b030'; x.beginPath(); x.arc(128, 128, 20, 0, Math.PI * 2); x.fill();
  });
  // grass tuft: blades from the root, darker ones behind
  cell(CELL.grass, () => {
    const bl: [number, number, number, number][] = [];
    for (let i = 0; i < 24; i++) bl.push([128 + (r() - 0.5) * 70, 128 + (r() - 0.5) * 210, 14 + r() * 110, 0.87 + r() * 0.13]);
    bl.sort((a, b) => a[3] - b[3]);
    for (const [bx, tx, ty, v] of bl) {
      const w = 7 + r() * 6;
      x.fillStyle = grey(v); x.beginPath(); x.moveTo(bx - w, 256); x.quadraticCurveTo(bx + (tx - bx) * 0.3, ty + 90, tx, ty); x.quadraticCurveTo(bx + (tx - bx) * 0.3 + w, ty + 100, bx + w, 256); x.closePath(); x.fill();
    }
  });
  // clover: trefoils of heart-shaped leaflets with a pale chevron
  cell(CELL.clover, () => {
    for (let k = 0; k < 7; k++) {
      const cx = 40 + r() * 176, cy = 40 + r() * 176, s = 20 + r() * 10, rot = r() * 6.28, v = 0.62 + r() * 0.36;
      for (let l = 0; l < 3; l++) {
        const a = rot + l * 2.094;
        x.save(); x.translate(cx, cy); x.rotate(a);
        x.fillStyle = grey(v); x.beginPath(); x.moveTo(0, 0);
        x.bezierCurveTo(-s * 1.2, -s * 0.5, -s * 0.9, -s * 1.9, 0, -s * 1.35); x.bezierCurveTo(s * 0.9, -s * 1.9, s * 1.2, -s * 0.5, 0, 0); x.fill();
        x.strokeStyle = grey(Math.min(1, v + 0.25), 0.9); x.lineWidth = 2.5; x.beginPath(); x.moveTo(-s * 0.4, -s * 0.9); x.lineTo(0, -s * 0.6); x.lineTo(s * 0.4, -s * 0.9); x.stroke();
        x.restore();
      }
    }
  });
  // ground-cover sprigs: small round leaves along curving stems
  cell(CELL.sprig, () => {
    for (let k = 0; k < 5; k++) {
      let px = 40 + r() * 176, py = 40 + r() * 176; const a0 = r() * 6.28;
      for (let i = 0; i < 7; i++) {
        const a = a0 + i * 0.25; px += Math.cos(a) * 16; py += Math.sin(a) * 16;
        for (const s of [-1, 1]) { x.fillStyle = grey(0.6 + r() * 0.4); x.beginPath(); x.ellipse(px + Math.cos(a + s * 1.4) * 10, py + Math.sin(a + s * 1.4) * 10, 10, 7, a + s, 0, Math.PI * 2); x.fill(); }
      }
    }
  });
  // a leafy plant seen from the side (the leaves under flowers)
  cell(CELL.leafy, () => {
    for (let k = 0; k < 30; k++) {
      const t = Math.pow(r(), 0.7), y = 250 - t * 200, xx = 128 + (r() - 0.5) * (60 + t * 150);
      const a = -Math.PI / 2 + (xx - 128) / 140 + (r() - 0.5) * 0.9;
      x.fillStyle = grey(0.55 + (1 - t) * 0.1 + r() * 0.35); petal(x, xx, y, a, 40 + r() * 34, 11 + r() * 6); x.fill();
    }
  });
  // buttercup: five round glossy petals and a green-gold eye
  cell(CELL.buttercup, () => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2, px = 128 + Math.cos(a) * 52, py = 128 + Math.sin(a) * 52;
      const gr = x.createRadialGradient(px - 10, py - 12, 4, px, py, 56); gr.addColorStop(0, grey(1)); gr.addColorStop(1, grey(0.82));
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, 54, 0, Math.PI * 2); x.fill();
      x.strokeStyle = grey(0.68, 0.8); x.lineWidth = 3; x.stroke();
    }
    x.fillStyle = '#a8a832'; x.beginPath(); x.arc(128, 128, 22, 0, Math.PI * 2); x.fill();
  });
  // rose: rings of cupped petals with a spiral heart
  cell(CELL.rose, () => {
    const ring = (n: number, d: number, rr: number, v: number, a0: number) => {
      for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2; x.fillStyle = grey(v); x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rr, 0, Math.PI * 2); x.fill(); x.strokeStyle = grey(v - 0.25, 0.9); x.lineWidth = 3.5; x.stroke(); }
    };
    ring(6, 66, 50, 0.95, 0); ring(5, 40, 40, 0.86, 0.5); ring(4, 20, 30, 0.76, 1.1);
    x.strokeStyle = grey(0.5); x.lineWidth = 5; x.beginPath();
    for (let i = 0; i < 40; i++) { const a = i * 0.45, rr = 3 + i * 0.75; const px = 128 + Math.cos(a) * rr, py = 128 + Math.sin(a) * rr; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
  });
  // ivy: lobed leaves with pale veins
  cell(CELL.ivy, () => {
    for (let k = 0; k < 7; k++) {
      const cx = 50 + r() * 156, cy = 50 + r() * 156, s = 34 + r() * 18, rot = r() * 6.28, v = 0.55 + r() * 0.4;
      x.save(); x.translate(cx, cy); x.rotate(rot);
      x.fillStyle = grey(v); x.beginPath();
      for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = (i % 2 ? 0.55 : 1) * s * (i === 0 || i === 10 ? 1.1 : 1); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.closePath(); x.fill();
      x.strokeStyle = grey(Math.min(1, v + 0.3), 0.9); x.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8); x.stroke(); }
      x.restore();
    }
  });
  // sweet alyssum: a mound of tiny four-petal flowers
  cell(CELL.alyssum, () => {
    for (let i = 0; i < 260; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 112, px = 128 + Math.cos(a) * d, py = 150 + Math.sin(a) * d * 0.7;
      x.fillStyle = grey(0.72 + r() * 0.28); x.beginPath(); x.arc(px, py, 6 + r() * 4, 0, Math.PI * 2); x.fill();
      x.fillStyle = grey(0.5); x.beginPath(); x.arc(px, py, 1.6, 0, Math.PI * 2); x.fill();
    }
  });
  // narrow grey leaves fanning up from the root (the bushy base of lavender)
  cell(CELL.narrow, () => {
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6, len = 90 + r() * 130;
      x.strokeStyle = grey(0.55 + r() * 0.45); x.lineWidth = 6 + r() * 4; x.lineCap = 'round';
      x.beginPath(); x.moveTo(128 + (r() - 0.5) * 30, 254); x.quadraticCurveTo(128 + Math.cos(a) * len * 0.5, 254 + Math.sin(a) * len * 0.7, 128 + Math.cos(a) * len * 0.9, 254 + Math.sin(a) * len); x.stroke();
    }
  });
  cell(CELL.solid, () => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, CS, CS); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
});

const floraMats = new Map<string, THREE.MeshToonMaterial>();
/**
 * The card material for the flora atlas. Unsaturated texels take the vertex colour (and, where aTint is 1, the
 * instance colour); coloured texels keep their own. `sway` bends instanced plants from the root up in the wind;
 * `noDepth` draws without writing depth, late, so dense grass and ground cover never catch the finish pass's ink.
 */
export function floraCardMat(sway = 0, noDepth = false, fade?: [number, number]): THREE.MeshToonMaterial {
  const key = sway + (noDepth ? 'n' : '') + (fade ? 'f' + fade.join('_') : '');
  let m = floraMats.get(key);
  if (m) return m;
  m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: floraAtlas(), alphaTest: 0.42, gradientMap: softRamp(), vertexColors: true, side: THREE.DoubleSide }), { variation: 0.45, rim: 0.9 });
  if (noDepth) m.depthWrite = false;
  chainCompile(m, 'fcard' + key, (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint; uniform float uTime;')
      .replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        vColor.rgb *= color;
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);
        #endif`);
    // fade: ground cards shrink into the ground with distance, so the mid and far meadow is the painted ground (no
    // carpet of cards), and the near tufts melt into it
    if (fade) s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 fp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 fp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #endif
          float fk = 1.0 - smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, distance(fp, cameraPosition));
          transformed *= fk;
        }`);
    if (sway > 0) s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float ph = ip.x * 0.7 + ip.z * 0.53;
          float hk = max(transformed.y, 0.0); hk *= hk * ${(1.4 * sway).toFixed(2)};
          transformed.x += (sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.25 + 0.3) * hk * 0.5;
          transformed.z += sin(uTime * 1.4 + ph * 1.3) * hk * 0.3;
        }`);
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `
      #if defined( USE_COLOR ) && defined( USE_MAP )
      {
        float tMax = max(max(sampledDiffuseColor.r, sampledDiffuseColor.g), sampledDiffuseColor.b);
        float tMin = min(min(sampledDiffuseColor.r, sampledDiffuseColor.g), sampledDiffuseColor.b);
        float tMask = 1.0 - smoothstep(0.1, 0.26, (tMax - tMin) / max(tMax, 0.05));
        diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, tMask);
      }
      #endif`);
  });
  floraMats.set(key, m);
  return m;
}

// ---------------------------------------------------------------- materials

export type MatKind = 'wall' | 'stone' | 'wood' | 'plain' | 'bloom' | 'slate' | 'brass' | 'silver' | 'glass' | 'canvas' | 'cloth' | 'leaf' | 'flora' | 'core' | 'satin' | 'chrome' | 'rough' | 'floraSoft';

/**
 * Chain a shader patch after paint()'s own onBeforeCompile (paint must be applied first).
 * `fn` edits the shader source; `key` keeps the program cache honest.
 */
export function chainCompile(mat: THREE.Material, key: string, fn: (s: THREE.WebGLProgramParametersWithUniforms) => void) {
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (s, r) => { prev(s, r); fn(s); };
  mat.customProgramCacheKey = () => prevKey() + key;
  return mat;
}

/** A sharp sun glint and a sky sheen on top of the painted toon look, for brass, pewter and glass. */
function metalSheen(mat: THREE.MeshToonMaterial, glint: number, sheen: string, sheenK = 0.45, glintW = 0.86) {
  return chainCompile(mat, 'metal' + glint + '_' + sheenK + '_' + glintW, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunCol;').replace('#include <opaque_fragment>', `
      {
        vec3 mR = reflect(-pV, pN);
        float mG = smoothstep(${glintW.toFixed(3)}, 0.97, dot(mR, uSun));
        float mS = smoothstep(-0.2, 0.9, mR.y) * pow(1.0 - clamp(dot(pN, pV), 0.0, 1.0), 1.5);
        outgoingLight += uSunCol * mG * ${glint.toFixed(2)} + vec3(${new THREE.Color(sheen).toArray().map(v => v.toFixed(3)).join(',')}) * mS * ${sheenK.toFixed(2)};
      }
      #include <opaque_fragment>`);
  });
}

/**
 * Polished pewter for chime tubes: a bright vertical specular strip that follows the camera (the sky reflected down a
 * cylinder), a dark band beside it, and the sun glint. Reads as metal tubes from any side, never as white sticks.
 */
function chromeSheen(mat: THREE.MeshToonMaterial) {
  return chainCompile(mat, 'chrome', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunCol;').replace('#include <opaque_fragment>', `
      {
        // the tube's normal across the view: a strip a little left of the centre line, a dark band right of it
        vec3 cRight = normalize(cross(pV, vec3(0.0, 1.0, 0.0)));
        float cx = dot(pN, cRight);
        float strip = smoothstep(0.42, 0.22, abs(cx + 0.32));
        float dark = smoothstep(0.25, 0.05, abs(cx - 0.35));
        vec3 mR = reflect(-pV, pN);
        float mG = smoothstep(0.9, 0.98, dot(mR, uSun));
        outgoingLight = outgoingLight * (1.0 - dark * 0.42) + vec3(1.0, 0.99, 0.96) * strip * 0.55 + uSunCol * mG * 1.3;
      }
      #include <opaque_fragment>`);
  });
}

let leafMatRef: THREE.Material | null = null;
/**
 * The leaf-card material: Sailtown's own soft leaf sheet, white so vertex colours set each mass's green, cut out at a
 * high threshold from a blurred alpha so edges are clean.
 */
export function leafMat(): THREE.Material {
  if (!leafMatRef) leafMatRef = paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: leafSheetTex(), alphaTest: 0.55, gradientMap: softRamp(), vertexColors: true, side: THREE.DoubleSide }), { variation: 0.6, rim: 1.2 });
  return leafMatRef;
}

const matCache = new Map<MatKind, THREE.Material>();
/** The shared Sailtown materials. All take their base colour from vertex colours. */
export function townMat(kind: MatKind): THREE.Material {
  let m = matCache.get(kind);
  if (m) return m;
  const base = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: softRamp(), vertexColors: true, ...o });
  switch (kind) {
    case 'wall': m = paint(base({ map: wallTex(), normalMap: wallNormal(), normalScale: new THREE.Vector2(0.9, 0.9) }), { variation: 0.5 }); break;
    case 'stone': m = paint(base({ map: stoneTex(), normalMap: stoneNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }), { variation: 0.6 }); break;
    // untextured rough stone (steps, rubble): the stone relief without its coursing
    case 'rough': m = paint(base({ map: slabTex(), normalMap: slabNormal(), normalScale: new THREE.Vector2(0.7, 0.7) }), { variation: 0.8 }); break;
    case 'wood': m = paint(base({ map: grainTex() }), { variation: 0.5 }); break;
    case 'plain': m = paint(base(), { variation: 0.5 }); break;
    // small flora and trinkets: never inked (a hull would swallow a 5 cm bloom), lit from both sides
    case 'bloom': m = paint(base({ side: THREE.DoubleSide }), { variation: 0.3, rim: 1.4 }); break;
    case 'slate': m = paint(base(), { variation: 0.9, rim: 1.2 }); break;
    case 'brass': m = metalSheen(paint(base(), { variation: 0.2, rim: 1.6 }), 1.6, '#fff1c8'); break;
    case 'silver': m = metalSheen(paint(base(), { variation: 0.15, rim: 1.4 }), 1.5, '#e8f2ff'); break;
    case 'glass': m = metalSheen(paint(base(), { variation: 0.1, rim: 0.6 }), 1.2, '#cfe6ff'); break;
    // satin brass with fine engraving (the race gate): a broad soft glint, a faint sheen, no plastic shine
    case 'satin': m = metalSheen(paint(base({ map: engraveTex() }), { variation: 0.25, rim: 0.9 }), 0.5, '#f4dca0', 0.22, 0.6); break;
    case 'chrome': m = chromeSheen(paint(base(), { variation: 0.1, rim: 0.8 })); break;
    case 'canvas': m = paint(base({ map: linenTex(), side: THREE.DoubleSide }), { variation: 0.3, rim: 1.2 }); break;
    case 'cloth': m = windCloth(); break;
    case 'leaf': m = leafMat(); break;
    // painted cards from the flora atlas (petals, florets, ivy, leaves): never inked, cut out by alpha
    case 'flora': m = floraCardMat(0); break;
    // flora cards drawn without depth, after the rest (lavender spikes): the finish pass never inks them
    case 'floraSoft': m = floraCardMat(0, true); break;
    // the dark inner ball of a leaf mass: fills the gaps between cards with shade, so only the outer edge reads
    case 'core': m = paint(base(), { variation: 0.7, rim: 0.25 }); break;
  }
  matCache.set(kind, m!);
  return m!;
}

// ---------------------------------------------------------------- wind cloth

/** Global strength of the cloth wind (sheets, flags, pennants). The world can raise it in a gust. */
export const CLOTH = { uClothAmp: { value: 1 } };

/**
 * Shared GLSL for the cloth wave. Each vertex carries aWave = (weight, phase, stiffness) and aDir, the direction
 * it is pushed (in object space). Weight 0 is pinned (the line, the pole); 1 is the free edge.
 */
const CLOTH_GLSL = /* glsl */ `
  attribute vec3 aWave; attribute vec3 aDir; attribute vec4 aPat;
  varying vec4 vPat; varying vec2 vCUv;
  uniform float uTime; uniform vec3 uWind; uniform float uClothAmp;
  float clothWave(vec3 wp, out float shade){
    float ph = aWave.y;
    float k = mix(1.0, 2.0, aWave.z);
    // waves that travel across the cloth (space term) and down it (weight term), a slower gust envelope,
    // and a quick flutter that only the free corners feel
    float sp = dot(wp, vec3(1.7, 1.1, 1.4));
    float s1 = sin(uTime * 2.1 * k + ph + sp - aWave.x * 7.0);
    float s2 = sin(uTime * 3.9 * k + ph * 1.7 + sp * 2.3 - aWave.x * 11.0);
    float s3 = sin(uTime * 7.7 * k + ph * 2.9 + sp * 4.1);
    float gust = 0.6 + 0.4 * sin(uTime * 0.6 + ph * 0.3 + wp.x * 0.07 + wp.z * 0.05);
    shade = 0.5 + 0.5 * (s1 * 0.6 + s2 * 0.4);
    float corner = clamp(aWave.x * 3.0, 0.0, 1.0);
    return aWave.x * uClothAmp * gust * (0.5 + 0.42 * s1 + 0.22 * s2 + 0.16 * s3 * corner);
  }
`;
function clothDisplace(normalsToo: boolean) {
  return /* glsl */ `
    #include <begin_vertex>
    ${normalsToo ? 'vPat = aPat; vCUv = uv;' : ''}
    {
      vec4 cwp = modelMatrix * vec4(position, 1.0);
      float cShade;
      float cd = clothWave(cwp.xyz, cShade);
      // billow along aDir, and flutter sideways and lift a little, so the motion reads from any side
      vec3 cSide = cross(vec3(0.0, 1.0, 0.0), aDir);
      float cSL = length(cSide);
      cSide = cSL > 1e-4 ? cSide / cSL : vec3(1.0, 0.0, 0.0);
      float cFl = (sin(uTime * 3.1 + aWave.y * 2.1 + cwp.y * 3.0 + cwp.x * 1.3) + 0.5 * sin(uTime * 6.3 + aWave.y * 3.7 + cwp.y * 5.0)) * aWave.x * uClothAmp;
      transformed += aDir * cd + cSide * cFl * 0.4 + vec3(0.0, abs(cd) * 0.3, 0.0);
      ${normalsToo ? `
      #ifdef USE_COLOR
        vColor.rgb *= mix(1.0, 0.74 + 0.36 * cShade, clamp(aWave.x * 3.0, 0.0, 1.0));
      #endif` : ''}
    }`;
}

/**
 * Woven patterns drawn in the cloth shader from the UVs (in LINEN_TILE units, so metres / LINEN_TILE), anti-aliased,
 * so stripes and checks stay crisp and painted at any distance instead of being built from coloured quads.
 * aPat = (accent r, g, b, code): code's whole part is the pattern, its fraction the period in metres.
 *   0 plain, 1 gingham, 2 stripes across (vertical), 3 bands (horizontal), 4 plaid, 5 sail-cloth panels.
 */
export const CLOTH_PAT = { plain: 0, gingham: 1, stripes: 2, bands: 3, plaid: 4, panels: 5 } as const;
const CLOTH_FRAG = /* glsl */ `
  varying vec4 vPat; varying vec2 vCUv;
  float cStripe(float t, float duty){ float w = max(fwidth(t) * 1.5, 0.04); float tri = 1.0 - abs(fract(t) - 0.5) * 2.0; return smoothstep(1.0 - duty - w, 1.0 - duty + w, tri); }
  float cHash(float n){ return fract(sin(n * 91.7) * 43758.5453); }
`;
function clothPattern(s: THREE.WebGLProgramParametersWithUniforms) {
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CLOTH_FRAG)
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float pid = floor(vPat.w + 0.002), per = max(fract(vPat.w + 0.002), 0.02);
        vec2 cm = vCUv * ${LINEN_TILE.toFixed(3)} / per;
        vec3 acc = vPat.rgb * diffuseColor.rgb / max(vColor.rgb, vec3(0.05));
        float k = 0.0;
        if (pid == 1.0) k = (cStripe(cm.x, 0.5) + cStripe(cm.y, 0.5)) * 0.5;
        else if (pid == 2.0) k = cStripe(cm.x, 0.5);
        else if (pid == 3.0) k = cStripe(cm.y, 0.45);
        else if (pid == 4.0) { float a = cStripe(cm.x, 0.34), b = cStripe(cm.y, 0.34); float th = max(cStripe(cm.x + 0.5, 0.07), cStripe(cm.y + 0.5, 0.07)); k = max(a, b) * 0.5 + a * b * 0.4 + th * 0.45; }
        if (pid > 0.5 && pid < 4.5) diffuseColor.rgb = mix(diffuseColor.rgb, acc, clamp(k, 0.0, 1.0) * 0.92);
        if (pid == 5.0) {
          // sail-cloth: a darker stitched seam between panels, each panel its own faint tone
          float seam = cStripe(cm.x, 0.05);
          diffuseColor.rgb *= (1.0 - seam * 0.2) * (0.97 + 0.06 * cHash(floor(cm.x + 0.5)));
        }
      }`);
}

/** Double-sided toon cloth, coloured by vertex colours, waving in the shader, with woven patterns (CLOTH_PAT). */
export function windCloth(): THREE.MeshToonMaterial {
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: linenTex(), gradientMap: softRamp(), vertexColors: true, side: THREE.DoubleSide }), { variation: 0.3, rim: 1.3 });
  chainCompile(mat, 'cloth2', (s) => {
    Object.assign(s.uniforms, CLOTH);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + CLOTH_GLSL)
      .replace('#include <begin_vertex>', clothDisplace(true));
    clothPattern(s);
  });
  return mat;
}

let clothDepth: THREE.MeshDepthMaterial | null = null;
/** Shadow-pass twin of the cloth material, so shadows wave with the cloth. */
export function windClothDepth(): THREE.MeshDepthMaterial {
  if (clothDepth) return clothDepth;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, CLOTH, { uTime: PAINT.uTime, uWind: PAINT.uWind });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + CLOTH_GLSL)
      .replace('#include <begin_vertex>', clothDisplace(false));
  };
  m.customProgramCacheKey = () => 'clothDepth';
  clothDepth = m;
  return m;
}

// ---------------------------------------------------------------- kit

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
/** A transform from position, Euler rotation (XYZ) and scale. */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
/** A transform that places local +Z facing outward at angle `a` on a circle of radius `r` (a = 0 is +Z). */
export function onRing(a: number, r: number, y: number, outward = 0): THREE.Matrix4 {
  return T(Math.sin(a) * (r + outward), y, Math.cos(a) * (r + outward), 0, a, 0);
}

/** Scale a geometry's UVs so a texture tile covers `tile` metres given the part's real size in metres. */
export function uvMetres(g: THREE.BufferGeometry, uMetres: number, vMetres: number, tile: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  const su = uMetres / tile, sv = vMetres / tile;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
/** Box with UVs in metres on every face (for textured planks and stones). */
export function boxM(w: number, h: number, d: number, tile: number, grainAlongY = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry faces: +x, -x (u=d, v=h), +y, -y (u=w, v=d), +z, -z (u=w, v=h); 4 vertices each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; let u = uv.getX(i) * dims[f][0] / tile, v = uv.getY(i) * dims[f][1] / tile;
    if (grainAlongY && f !== 2 && f !== 3) [u, v] = [v, u];
    uv.setXY(i, u, v);
  }
  return g;
}

interface Part { geo: THREE.BufferGeometry; kind: MatKind }
/** Kinds that never take the ink hull: cut-out cards, cloth, glass, small trinkets, and the slates (their lips and the
 * finish pass's silhouettes draw the roof; a hull would double a roof's triangles). */
const NO_INK = new Set<MatKind>(['leaf', 'cloth', 'glass', 'canvas', 'bloom', 'flora', 'floraSoft', 'core', 'slate', 'chrome']);

/**
 * Collects the parts of one prop, each transformed and painted with a vertex colour, then merges them into one
 * mesh per material. `push`/`pop` nest transforms so a window can be built in its own frame then set on a wall.
 */
export class Kit {
  private parts: Part[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  tris = 0;

  push(m: THREE.Matrix4) { this.stack.push(this.top().clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** Run `f` inside the transform `m`. */
  with(m: THREE.Matrix4, f: () => void) { this.push(m); f(); this.pop(); }
  top() { return this.stack[this.stack.length - 1]; }

  /**
   * Add a geometry (consumed). Colour may be a single colour, or the geometry may already carry a `color`
   * attribute (then `color` multiplies it). Cloth parts carry aWave/aDir, filled with zeros when missing.
   */
  add(geo: THREE.BufferGeometry, kind: MatKind, color: THREE.ColorRepresentation | null, m?: THREE.Matrix4) {
    let g = geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aWave', 'aDir', 'aPat'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.index) { const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(idx); }
    const c = color != null ? new THREE.Color(color) : new THREE.Color(1, 1, 1);
    if (g.attributes.color) {
      const ca = g.attributes.color as THREE.BufferAttribute;
      if (ca.itemSize !== 3) { const out = new Float32Array(n * 3); for (let i = 0; i < n; i++) out.set([ca.getX(i), ca.getY(i), ca.getZ(i)], i * 3); g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3)); }
      const cb = g.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) cb.setXYZ(i, cb.getX(i) * c.r, cb.getY(i) * c.g, cb.getZ(i) * c.b);
    } else {
      const out = new Float32Array(n * 3); for (let i = 0; i < n; i++) out.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
    }
    if (kind === 'cloth') {
      if (!g.attributes.aWave) g.setAttribute('aWave', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      if (!g.attributes.aDir) g.setAttribute('aDir', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      if (!g.attributes.aPat) g.setAttribute('aPat', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
      // aDir is a direction in object space: rotate it with the part
      const full = m ? this.top().clone().multiply(m) : this.top();
      const nm = new THREE.Matrix3().setFromMatrix4(full);
      const d = g.attributes.aDir as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(d, i).applyMatrix3(nm); d.setXYZ(i, v.x, v.y, v.z); }
    } else {
      if (g.attributes.aWave) g.deleteAttribute('aWave');
      if (g.attributes.aDir) g.deleteAttribute('aDir');
      if (g.attributes.aPat) g.deleteAttribute('aPat');
    }
    g.applyMatrix4(m ? this.top().clone().multiply(m) : this.top());
    if (import.meta.env.DEV) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { console.warn('sailtown: NaN in part', kind, new Error().stack?.split('\n').slice(2, 5).join(' | ')); break; } }
    this.parts.push({ geo: g, kind });
    this.tris += (g.index ? g.index.count : n) / 3;
    return this;
  }

  /** Add every leaf-card mesh from a foliage clump, tinted, under transform m. */
  addClump(clump: THREE.Group, tint: THREE.ColorRepresentation, m: THREE.Matrix4) {
    for (const ch of clump.children) {
      const mesh = ch as THREE.Mesh;
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      this.add(mesh.geometry.clone().applyMatrix4(mesh.matrix), 'leaf', tint, m);
    }
  }

  /**
   * Merge into a group with one mesh per material. Opaque solid parts get the ink hull unless `outline` is false
   * or the kind never takes one (leaves, cloth, glass).
   */
  build(target = new THREE.Group(), opts: { outline?: boolean; inkWidth?: number; shadows?: boolean } = {}) {
    const by = new Map<MatKind, THREE.BufferGeometry[]>();
    for (const p of this.parts) (by.get(p.kind) ?? by.set(p.kind, []).get(p.kind)!).push(p.geo);
    for (const [kind, geos] of by) {
      const merged = mergeGeometries(geos, false);
      if (!merged) { console.warn('sailtown: merge failed for', kind); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, townMat(kind));
      mesh.castShadow = opts.shadows !== false; mesh.receiveShadow = true;
      mesh.name = kind;
      if (kind === 'cloth') mesh.customDepthMaterial = windClothDepth();
      if (NO_INK.has(kind)) mesh.userData.noOutline = true;
      if (kind === 'flora' || kind === 'leaf' || kind === 'floraSoft') mesh.castShadow = opts.shadows === true || (opts.shadows !== false && kind === 'leaf');
      if (kind === 'floraSoft') mesh.renderOrder = 6;
      target.add(mesh);
    }
    if (opts.outline !== false) addOutlines(target, '#3b2a30', opts.inkWidth ?? 0.022);
    this.parts = [];
    return target;
  }
}

// ---------------------------------------------------------------- geometry helpers

/** Set a constant colour attribute on a geometry (so per-part colours survive merging). */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color), n = g.attributes.position.count, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) out.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
  return g;
}
/** Merge geometries that each carry their own colour into one (all must share attribute sets). */
export function mergeColored(list: THREE.BufferGeometry[]) {
  const norm = list.map(g => {
    const n = g.attributes.position.count;
    if (!g.index) { const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(idx); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) tint(g, '#ffffff');
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(norm, false)!;
}

/** An arch outline (a rectangle with a round top) of width w and total height h, base at y = 0. */
export function archShape(w: number, h: number, segs = 10): THREE.Shape {
  const s = new THREE.Shape(), r = w / 2, hr = h - r;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, hr);
  // the arc ends at (-r, hr); the shape closes itself back to (-r, 0) (a repeated first point breaks triangulation)
  for (let i = 1; i <= segs; i++) { const a = (i / segs) * Math.PI; s.lineTo(Math.cos(a) * r, hr + Math.sin(a) * r); }
  return s;
}
/**
 * The band between an outer and an inner arch, both standing on y = 0, as one simple outline (no hole: earcut
 * mis-fills a hole that touches its outer edge). Open at the bottom, like a door surround.
 */
export function archRing(wOut: number, hOut: number, wIn: number, hIn: number, segs = 12): THREE.Shape {
  const s = new THREE.Shape(), ro = wOut / 2, ri = wIn / 2;
  s.moveTo(ro, 0); s.lineTo(ro, hOut - ro);
  for (let i = 1; i <= segs; i++) { const a = (i / segs) * Math.PI; s.lineTo(Math.cos(a) * ro, hOut - ro + Math.sin(a) * ro); }
  s.lineTo(-ro, 0); s.lineTo(-ri, 0); s.lineTo(-ri, hIn - ri);
  for (let i = segs - 1; i >= 0; i--) { const a = (i / segs) * Math.PI; s.lineTo(Math.cos(a) * ri, hIn - ri + Math.sin(a) * ri); }
  s.lineTo(ri, 0);
  return s;
}
/** Top height of an arch of width w and height h at x. */
export function archTop(w: number, h: number, x: number) {
  const r = w / 2; return h - r + Math.sqrt(Math.max(0, r * r - x * x));
}

/** A tube along a list of points (rope, rails), with a constant colour. */
export function ropeGeo(points: THREE.Vector3[], radius: number, radial = 4) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, Math.max(4, points.length * 3), radius, radial, false);
}
/** Points of a hanging line between a and b with a sag (a catenary, close enough as a parabola). */
export function sagLine(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 12) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0))); }
  return out;
}

/**
 * A cloth grid of w by h (top edge at y = 0, hanging down), with per-cell colours from `col(u, v)` and an optional
 * `mask(u, v)` that cuts the outline (shirts). Weight grows from the pinned top; aDir pushes along +Z.
 */
export function clothGrid(w: number, h: number, nx: number, ny: number, col: (u: number, v: number) => THREE.Color, opts: { mask?: (u: number, v: number) => boolean; phase?: number; stiff?: number; weight?: (u: number, v: number) => number; dir?: THREE.Vector3; pattern?: ClothPattern } = {}) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], cl: number[] = [], wav: number[] = [], dir: number[] = [], pat: number[] = [], idx: number[] = [];
  const d = opts.dir ?? new THREE.Vector3(0, 0, 1);
  const P = patAttr(opts.pattern);
  const W = opts.weight ?? ((_u: number, v: number) => Math.pow(v, 1.3));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
    if (opts.mask && !opts.mask((u0 + u1) / 2, (v0 + v1) / 2)) continue;
    const c = col((u0 + u1) / 2, (v0 + v1) / 2);
    const base = pos.length / 3;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
      pos.push((u - 0.5) * w, -v * h, 0); nor.push(0, 0, 1); uv.push(u * w / LINEN_TILE, v * h / LINEN_TILE); pat.push(...P);
      cl.push(c.r, c.g, c.b);
      wav.push(W(u, v), opts.phase ?? 0, opts.stiff ?? 0); dir.push(d.x, d.y, d.z);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setAttribute('aWave', new THREE.Float32BufferAttribute(wav, 3));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
  g.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 4));
  g.setIndex(idx);
  return g;
}

/** A woven pattern for a cloth: kind, accent colour and period (m, < 1). */
export interface ClothPattern { kind: keyof typeof CLOTH_PAT; accent?: THREE.ColorRepresentation; period?: number }
/** The aPat attribute value for a pattern. */
export function patAttr(p?: ClothPattern): [number, number, number, number] {
  if (!p || p.kind === 'plain') return [1, 1, 1, 0];
  const c = new THREE.Color(p.accent ?? '#ffffff');
  return [c.r, c.g, c.b, CLOTH_PAT[p.kind] + Math.min(0.98, Math.max(0.02, p.period ?? 0.1))];
}

/** Displace a geometry's vertices radially/along normals by a little smooth noise, for a hand-made wobble. */
export function wobble(g: THREE.BufferGeometry, amp: number, freq: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    const k = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2.1) * Math.sin(v.z * freq * 0.9 + seed * 0.7)
      + 0.5 * Math.sin(v.x * freq * 2.7 + v.z * freq * 2.1 + seed * 3.3);
    v.addScaledVector(nn, k * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Small colour helpers. */
export const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);
export function shade(c: THREE.ColorRepresentation, k: number, r?: Rnd, jitter = 0) {
  const o = new THREE.Color(c).multiplyScalar(k * (r ? 1 + (r() - 0.5) * jitter : 1));
  return o;
}
