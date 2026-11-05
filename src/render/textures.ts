import * as THREE from 'three';
import { paint, softRamp } from './paint';

/** Small painted textures drawn on canvas at startup: no image files to download. */

function canvas(S: number, draw: (x: CanvasRenderingContext2D, r: () => number) => void, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  let s = seed * 48271 + 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  draw(x, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function blot(x: CanvasRenderingContext2D, cx: number, cy: number, rad: number, col: string, a: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
  const c = new THREE.Color(col); const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.globalAlpha = a; x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); x.globalAlpha = 1;
}

const cache = new Map<string, THREE.Texture>();
const once = (k: string, f: () => THREE.Texture) => { let t = cache.get(k); if (!t) { t = f(); cache.set(k, t); } return t; };

/** Lime plaster: warm white, soft water stains running down from the eaves, a few cracks. */
export const plasterTex = () => once('plaster', () => canvas(256, (x, r) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) blot(x, r() * 256, r() * 256, 10 + r() * 30, r() > 0.5 ? '#e8dcc4' : '#f7f0e2', 0.5);
  for (let i = 0; i < 7; i++) { // stains from the top
    const sx = r() * 256, w = 8 + r() * 20, h = 60 + r() * 120;
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(150,135,110,0.35)'); g.addColorStop(1, 'rgba(150,135,110,0)');
    x.fillStyle = g; x.fillRect(sx, 0, w, h);
  }
  // damp, greenish base
  const gb = x.createLinearGradient(0, 200, 0, 256); gb.addColorStop(0, 'rgba(120,140,100,0)'); gb.addColorStop(1, 'rgba(120,140,100,0.35)');
  x.fillStyle = gb; x.fillRect(0, 200, 256, 56);
  x.strokeStyle = 'rgba(90,70,60,0.4)'; x.lineWidth = 1;
  for (let i = 0; i < 4; i++) { let px = r() * 256, py = r() * 256; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 18; py += 6 + r() * 10; x.lineTo(px, py); } x.stroke(); }
}, 3));

/** Roof tiles in rows, uneven, with moss creeping in from the bottom edge. */
export const roofTex = () => once('roof', () => canvas(256, (x, r) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  const rows = 9, h = 256 / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * 16;
    for (let i = -1; i < 9; i++) {
      const v = 0.82 + r() * 0.22;
      x.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(245 * v)},${Math.round(240 * v)})`;
      x.beginPath(); x.ellipse(off + i * 32 + 16, j * h + h * 0.75, 15, h * 0.62, 0, 0, Math.PI); x.fill();
      x.strokeStyle = 'rgba(60,35,30,0.45)'; x.lineWidth = 1.2; x.stroke();
    }
  }
  for (let i = 0; i < 22; i++) blot(x, r() * 256, 150 + r() * 120, 10 + r() * 26, '#5f8a3a', 0.55);
}, 5));

/** Planks with grain lines. */
export const woodTex = () => once('wood', () => canvas(128, (x, r) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(120,90,60,${0.08 + r() * 0.1})`; x.fillRect(0, i * 32, 128, 32); }
  x.strokeStyle = 'rgba(80,55,35,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const y = r() * 128; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(40, y + (r() - 0.5) * 6, 80, y + (r() - 0.5) * 6, 128, y); x.stroke(); }
  x.strokeStyle = 'rgba(50,30,20,0.6)'; x.lineWidth = 2; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); }
}, 9));

/** Mossy stone: rounded blocks with dark joints and moss in the cracks. */
export const stoneTex = () => once('stone', () => canvas(128, (x, r) => {
  x.fillStyle = '#5a5560'; x.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) {
    const v = 0.78 + r() * 0.25, ox = (j % 2) * 16;
    x.fillStyle = `rgb(${Math.round(240 * v)},${Math.round(236 * v)},${Math.round(230 * v)})`;
    x.beginPath(); x.roundRect(ox + i * 32 + 2, j * 26 + 2, 28, 22, 6); x.fill();
  }
  for (let i = 0; i < 12; i++) blot(x, r() * 128, r() * 128, 6 + r() * 12, '#6f9a44', 0.6);
}, 13));

const matCache = new Map<string, THREE.MeshToonMaterial>();
/** A toon material with a painted texture, cached by color and texture. */
export function texToon(color: string, tex: () => THREE.Texture, repeat = 1): THREE.MeshToonMaterial {
  const k = color + tex.name + repeat;
  let m = matCache.get(k);
  if (!m) {
    let t = tex();
    if (repeat !== 1) { t = t.clone(); t.repeat.set(repeat, repeat); t.needsUpdate = true; }
    m = paint(new THREE.MeshToonMaterial({ color, map: t, gradientMap: softRamp() }), { variation: 0.4 });
    matCache.set(k, m);
  }
  return m;
}
