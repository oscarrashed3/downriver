import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { dirLatLon } from '../world/sphere';
import { esc } from '../ui/hud';

export interface MapPiece { id: string; world: string; label: string; lat: [number, number]; lon: [number, number] }
export interface Landmark { world: string; name: string; lat: number; lon: number; icon: 'stone' | 'hut' | 'peak' | 'spring' | 'pole' | 'fire' | 'arch' | 'tower' | 'person' | 'cloud' }

export const PIECES: MapPiece[] = [
  { id: 'map:valley', world: 'peaks', label: 'The Valley of Stones and the high ridges', lat: [0, 52], lon: [-75, 75] },
  { id: 'map:chimes', world: 'peaks', label: 'The village and the chimes', lat: [44, 82], lon: [-70, 30] },
  { id: 'map:poles', world: 'peaks', label: 'The old snow poles', lat: [36, 112], lon: [-60, 65] },
  { id: 'map:pasture', world: 'peaks', label: 'The roads to the summer pasture', lat: [26, 70], lon: [-120, -30] },
  { id: 'map:start', world: 'peaks', label: 'The river near you', lat: [50, 72], lon: [-22, 22] },
  { id: 'map:pines', world: 'pines', label: 'The Ember Pines', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:deep', world: 'deep', label: 'The Green Deep', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:desert', world: 'desert', label: 'The Glass Desert', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:aquila', world: 'aquila', label: 'Aquila', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:sea', world: 'sea', label: 'The Endless Sea', lat: [0, 180], lon: [-70, 70] },
];

const W = 900, H = 520;

/** The parchment map. It starts blank; only people fill it in. */
export class MapView {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  private relief = new Map<string, HTMLCanvasElement>();
  pins: Record<string, { x: number; y: number }[]> = {};
  open = false;

  constructor(private landmarks: Landmark[]) {
    this.el = document.createElement('div');
    this.el.className = 'overlay hidden';
    this.el.innerHTML = `<div class="sheet"><h2 class="mt"></h2><div class="sub">Pieces of this map come only from the people you meet. Click to pin a note. M to close.</div><canvas width="${W}" height="${H}"></canvas><div class="legend dim"></div></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.canvas.style.width = 'min(900px, 86vw)';
    document.getElementById('ui')!.append(this.el);
  }

  private reliefFor(p: Planet): HTMLCanvasElement {
    let c = this.relief.get(p.cfg.id);
    if (c) return c;
    c = document.createElement('canvas'); c.width = 225; c.height = 130;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    const d = new THREE.Vector3();
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      const lat = (j + 0.5) / c.height * 180, lonOff = (i + 0.5) / c.width * 360 - 180;
      const v = p.dirRiver(lat, lonOff, d);
      const h = p.height(v) / p.cfg.amplitude;
      const h1 = p.height(v);
      const v2 = p.dirRiver(lat - 1, lonOff - 1);
      const shade = (h1 - p.height(v2)) / p.cfg.amplitude * 8;
      const k = (j * c.width + i) * 4;
      const base = 236 - h * 50 + shade * 40;
      img.data[k] = base; img.data[k + 1] = base - 10; img.data[k + 2] = base - 34; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.relief.set(p.cfg.id, c);
    return c;
  }

  draw(p: Planet, owned: Set<string>, playerLatLon: { lat: number; lonOff: number } | null) {
    const ctx = this.canvas.getContext('2d')!;
    (this.el.querySelector('.mt') as HTMLElement).textContent = p.cfg.name;
    // parchment
    ctx.fillStyle = '#f1e4c6'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(120,90,50,${Math.random() * 0.04})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3); }
    const toXY = (lat: number, lonOff: number) => ({ x: (lonOff + 180) / 360 * W, y: lat / 180 * H });
    const relief = this.reliefFor(p);
    const mine = PIECES.filter(pc => pc.world === p.cfg.id && owned.has(pc.id));
    for (const pc of mine) {
      const a = toXY(pc.lat[0], pc.lon[0]), b = toXY(pc.lat[1], pc.lon[1]);
      ctx.save();
      ctx.beginPath();
      // torn-paper edge
      const pts: [number, number][] = [];
      const seg = 14;
      for (let i = 0; i <= seg; i++) pts.push([a.x + (b.x - a.x) * i / seg, a.y + jit(pc.id, i)]);
      for (let i = 0; i <= seg; i++) pts.push([b.x + jit(pc.id, i + 50), a.y + (b.y - a.y) * i / seg]);
      for (let i = 0; i <= seg; i++) pts.push([b.x - (b.x - a.x) * i / seg, b.y + jit(pc.id, i + 100)]);
      for (let i = 0; i <= seg; i++) pts.push([a.x + jit(pc.id, i + 150), b.y - (b.y - a.y) * i / seg]);
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(relief, 0, 0, W, H);
      ctx.globalAlpha = 1;
      // river ink
      ctx.beginPath();
      for (let lat = p.cfg.riverStartLat; lat <= 180; lat += 2) { const q = toXY(lat, 0); lat === p.cfg.riverStartLat ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
      ctx.strokeStyle = '#3d7fb8'; ctx.lineWidth = 4; ctx.stroke();
      for (const lm of this.landmarks.filter(l => l.world === p.cfg.id)) {
        const q = toXY(lm.lat, lm.lon);
        if (q.x < Math.min(a.x, b.x) || q.x > Math.max(a.x, b.x) || q.y < Math.min(a.y, b.y) || q.y > Math.max(a.y, b.y)) continue;
        drawIcon(ctx, lm.icon, q.x, q.y);
        ctx.fillStyle = '#4a3a2a'; ctx.font = 'italic 15px Georgia, serif'; ctx.fillText(lm.name, q.x + 10, q.y + 4);
      }
      ctx.restore();
    }
    for (const pin of this.pins[p.cfg.id] ?? []) { ctx.fillStyle = '#c4524a'; ctx.beginPath(); ctx.arc(pin.x, pin.y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pin.x - 2, pin.y - 2, 2, 0, 7); ctx.fill(); }
    if (playerLatLon) {
      const q = toXY(playerLatLon.lat, playerLatLon.lonOff);
      ctx.fillStyle = 'rgba(255,220,140,.5)'; ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f6f7a'; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80,60,40,.5)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, W - 8, H - 8);
    const leg = this.el.querySelector('.legend') as HTMLElement;
    leg.innerHTML = mine.length ? mine.map(m => esc(m.label)).join(' &middot; ') : 'Still blank. Someone here must know this land.';
    this.canvas.onclick = e => {
      const r = this.canvas.getBoundingClientRect();
      (this.pins[p.cfg.id] ??= []).push({ x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H });
      this.draw(p, owned, playerLatLon);
    };
    void dirLatLon;
  }

  show(on: boolean) { this.open = on; this.el.classList.toggle('hidden', !on); }
}

function jit(id: string, i: number) {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const x = Math.sin(h + i * 12.9898) * 43758.5453; return (x - Math.floor(x) - 0.5) * 14;
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: Landmark['icon'], x: number, y: number) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#4a3a2a'; ctx.fillStyle = '#4a3a2a'; ctx.lineWidth = 2;
  switch (icon) {
    case 'stone': for (let i = 0; i < 3; i++) ctx.fillRect(-7 + i * 5, -8 + i, 3, 10 - i); break;
    case 'hut': ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(0, -8); ctx.lineTo(8, 2); ctx.closePath(); ctx.stroke(); ctx.strokeRect(-5, 2, 10, 6); break;
    case 'peak': ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(0, -9); ctx.lineTo(9, 6); ctx.stroke(); break;
    case 'spring': ctx.fillStyle = '#3d7fb8'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); break;
    case 'pole': ctx.fillStyle = '#c4524a'; ctx.fillRect(-1.5, -10, 3, 14); break;
    case 'fire': ctx.fillStyle = '#e88a3a'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.fill(); break;
    case 'arch': ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI, 0); ctx.stroke(); break;
    case 'tower': ctx.strokeRect(-3, -10, 6, 16); break;
    case 'person': ctx.beginPath(); ctx.arc(0, -5, 3, 0, 7); ctx.fill(); ctx.fillRect(-3, -2, 6, 8); break;
    case 'cloud': ctx.beginPath(); ctx.arc(-4, 0, 4, 0, 7); ctx.arc(2, -2, 5, 0, 7); ctx.arc(7, 1, 3, 0, 7); ctx.stroke(); break;
  }
  ctx.restore();
}
