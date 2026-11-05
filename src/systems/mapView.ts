import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { dirLatLon } from '../world/sphere';
import { esc } from '../ui/hud';

export interface MapPiece { id: string; world: string; label: string; lat: [number, number]; lon: [number, number] }
export interface Landmark { world: string; name: string; lat: number; lon: number; icon: 'stone' | 'hut' | 'peak' | 'spring' | 'pole' | 'fire' | 'arch' | 'tower' | 'person' | 'cloud' }

export const PIECES: MapPiece[] = [
  { id: 'map:start', world: 'peaks', label: 'The spring and the path down', lat: [0, 62], lon: [-30, 22] },
  { id: 'map:valley', world: 'peaks', label: 'The village, the stones and the high ridges', lat: [0, 70], lon: [-75, 75] },
  { id: 'map:chimes', world: 'peaks', label: 'Cloud Meadow and the tall peak', lat: [28, 70], lon: [40, 110] },
  { id: 'map:poles', world: 'peaks', label: "Grandpa's snow poles", lat: [36, 112], lon: [-60, 65] },
  { id: 'map:pasture', world: 'peaks', label: 'The goat terraces and the west cliffs', lat: [26, 80], lon: [-120, -25] },
  { id: 'map:ridge', world: 'peaks', label: 'Kite Ridge', lat: [30, 70], lon: [20, 75] },
  { id: 'map:bridge', world: 'peaks', label: 'The old bridge and the way down to the edge', lat: [60, 180], lon: [-40, 40] },
  { id: 'map:pines', world: 'pines', label: 'The Ember Pines', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:deep', world: 'deep', label: 'The Green Deep', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:desert', world: 'desert', label: 'The Glass Desert', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:aquila', world: 'aquila', label: 'Aquila', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:sea', world: 'sea', label: 'The Endless Sea', lat: [0, 180], lon: [-70, 70] },
];

const W = 900, H = 520;
/** The fog grid: 2 degree cells over latitude 0..180 and longitude offset -180..180. */
export const FOG_W = 180, FOG_H = 90;
/** The relief is sampled at this resolution, once per world. */
const RW = 540, RH = 270;

/**
 * The map: a precise survey of the world, shaded from the real terrain, that fills in as you travel.
 * Places you have walked near are drawn in full; people's map pieces fill in places you have only heard of.
 */
export class MapView {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  private relief = new Map<string, HTMLCanvasElement>();
  pins: Record<string, { x: number; y: number }[]> = {};
  /** Visited cells per world, FOG_W x FOG_H. */
  seen: Record<string, Uint8Array> = {};
  open = false;

  constructor(private landmarks: Landmark[]) {
    this.el = document.createElement('div');
    this.el.className = 'overlay hidden';
    this.el.innerHTML = `<div class="sheet mapsheet"><h2 class="mt"></h2><div class="sub">Everywhere you walk is surveyed. People's map pieces fill in the rest. Click to pin a note.</div><canvas width="${W}" height="${H}"></canvas><div class="legend dim"></div></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.canvas.style.width = 'min(980px, 88vw)';
    document.getElementById('ui')!.append(this.el);
  }

  fog(id: string): Uint8Array { return (this.seen[id] ??= new Uint8Array(FOG_W * FOG_H)); }

  /** Mark everything within `radius` world units of the player as surveyed. Returns true if anything new was seen. */
  reveal(p: Planet, lat: number, lonOff: number, radius: number): boolean {
    const f = this.fog(p.cfg.id);
    const degLat = radius / (p.R * Math.PI / 180);
    let changed = false;
    for (let la = Math.max(0, lat - degLat); la <= Math.min(179.9, lat + degLat); la += 2) {
      const s = Math.max(0.15, Math.sin(la * Math.PI / 180));
      const dl = Math.sqrt(Math.max(0, degLat * degLat - (la - lat) * (la - lat))) / s;
      for (let lo = lonOff - dl; lo <= lonOff + dl; lo += 2) {
        const i = Math.floor(la / 2), j = Math.floor(((lo + 540) % 360) / 2);
        const k = i * FOG_W + j;
        if (!f[k]) { f[k] = 1; changed = true; }
      }
    }
    return changed;
  }

  exportSeen(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.seen)) { let s = ''; for (let i = 0; i < v.length; i++) s += v[i] ? '1' : '0'; out[k] = s; }
    return out;
  }
  importSeen(d: Record<string, string>) {
    this.seen = {};
    for (const [k, s] of Object.entries(d ?? {})) { const a = new Uint8Array(FOG_W * FOG_H); for (let i = 0; i < Math.min(s.length, a.length); i++) a[i] = s.charCodeAt(i) === 49 ? 1 : 0; this.seen[k] = a; }
  }

  /** A survey-style relief: elevation tints, hillshade from the north-west, contour lines, rock, snow and water. */
  private reliefFor(p: Planet): HTMLCanvasElement {
    let c = this.relief.get(p.cfg.id);
    if (c) return c;
    c = document.createElement('canvas'); c.width = RW; c.height = RH;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(RW, RH);
    const A = p.cfg.amplitude;
    const hs = new Float32Array(RW * RH), rd = new Float32Array(RW * RH);
    const d = new THREE.Vector3();
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
      const lat = (j + 0.5) / RH * 180, lonOff = (i + 0.5) / RW * 360 - 180;
      p.dirRiver(lat, lonOff, d);
      hs[j * RW + i] = p.height(d);
      rd[j * RW + i] = Math.abs(lonOff) < 40 ? p.riverNearest(d).dist : 99;
    }
    const P = p.cfg.palette;
    const low = new THREE.Color(P.low), mid = new THREE.Color(P.mid), high = new THREE.Color(P.high), rock = new THREE.Color(P.rock), snow = new THREE.Color(P.snow ?? '#ffffff');
    const water = new THREE.Color('#3f86c4'), col = new THREE.Color();
    const mPerPxLat = p.R * Math.PI / RH;
    for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
      const k = j * RW + i, h = hs[k];
      const s = Math.max(0.2, Math.sin((j + 0.5) / RH * Math.PI));
      const mPerPxLon = p.R * 2 * Math.PI / RW * s;
      const hx = (hs[j * RW + Math.min(RW - 1, i + 1)] - hs[j * RW + Math.max(0, i - 1)]) / (2 * mPerPxLon);
      const hy = (hs[Math.min(RH - 1, j + 1) * RW + i] - hs[Math.max(0, j - 1) * RW + i]) / (2 * mPerPxLat);
      const slope = Math.sqrt(hx * hx + hy * hy);
      // light from the north-west (top-left of the map)
      const shade = Math.max(0, Math.min(1.4, 0.82 + (hx * 0.9 + hy * 0.9) * -1.6 / Math.sqrt(1 + slope * slope)));
      const hn = h / A;
      if (hn < 0.5) col.copy(low).lerp(mid, Math.max(0, hn) * 2); else col.copy(mid).lerp(high, Math.min(1, (hn - 0.5) * 2));
      col.lerp(rock, Math.min(1, Math.max(0, (slope - 0.55) * 1.6)) * 0.85);
      if (p.cfg.shape === 'peaks') col.lerp(snow, Math.min(1, Math.max(0, (hn - 0.72) * 6)) * Math.max(0, 1 - slope));
      col.multiplyScalar(shade);
      if (rd[k] < p.cfg.riverWidth * p.flowWidth + 0.3) col.copy(water);
      // contour every 2 m, a heavier one every 10 m
      const c0 = Math.floor(h / 2), c1 = Math.floor(hs[j * RW + Math.min(RW - 1, i + 1)] / 2), c2 = Math.floor(hs[Math.min(RH - 1, j + 1) * RW + i] / 2);
      if (c0 !== c1 || c0 !== c2) col.lerp(new THREE.Color('#5a4630'), Math.max(c0, c1, c2) % 5 === 0 ? 0.45 : 0.18);
      img.data[k * 4] = Math.min(255, col.r * 255); img.data[k * 4 + 1] = Math.min(255, col.g * 255); img.data[k * 4 + 2] = Math.min(255, col.b * 255); img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.relief.set(p.cfg.id, c);
    return c;
  }

  /** A line of footsteps to draw over the map (playtests record the route here). */
  trail: { lat: number; lonOff: number }[] = [];
  /** People to mark on the map, such as everyone invited to the long night. */
  people: { name: string; lat: number; lonOff: number }[] = [];

  draw(p: Planet, owned: Set<string>, playerLatLon: { lat: number; lonOff: number; heading?: number } | null) {
    const ctx = this.canvas.getContext('2d')!;
    (this.el.querySelector('.mt') as HTMLElement).textContent = p.cfg.name;
    const fog = this.fog(p.cfg.id);
    const mine = PIECES.filter(pc => pc.world === p.cfg.id && owned.has(pc.id));
    // what is known: walked cells, plus pieces people gave you
    const known = new Uint8Array(fog);
    for (const pc of mine) for (let i = Math.floor(pc.lat[0] / 2); i < Math.ceil(pc.lat[1] / 2) && i < FOG_H; i++) for (let lo = pc.lon[0]; lo < pc.lon[1]; lo += 2) { const k = i * FOG_W + Math.floor(((lo + 540) % 360) / 2); if (!known[k]) known[k] = 2; }
    // view: the bounding box of what is known, with a margin, at the map's aspect ratio
    let la0 = 180, la1 = 0, lo0 = 180, lo1 = -180;
    for (let i = 0; i < FOG_H; i++) for (let j = 0; j < FOG_W; j++) if (known[i * FOG_W + j]) { la0 = Math.min(la0, i * 2); la1 = Math.max(la1, i * 2 + 2); const lo = j * 2 - 180; lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo + 2); }
    if (playerLatLon) { la0 = Math.min(la0, playerLatLon.lat); la1 = Math.max(la1, playerLatLon.lat); lo0 = Math.min(lo0, playerLatLon.lonOff); lo1 = Math.max(lo1, playerLatLon.lonOff); }
    if (la0 > la1) { la0 = 0; la1 = 60; lo0 = -60; lo1 = 60; }
    let cy = (la0 + la1) / 2, cx = (lo0 + lo1) / 2;
    let spanLon = Math.max(60, (lo1 - lo0) + 16), spanLat = Math.max(36, (la1 - la0) + 12);
    if (spanLon / spanLat > W / H) spanLat = spanLon * H / W; else spanLon = spanLat * W / H;
    spanLon = Math.min(360, spanLon); spanLat = Math.min(180, spanLat);
    cy = Math.min(180 - spanLat / 2, Math.max(spanLat / 2, cy));
    cx = Math.min(180 - spanLon / 2, Math.max(-180 + spanLon / 2, cx));
    const vLat0 = cy - spanLat / 2, vLon0 = cx - spanLon / 2;
    const toXY = (lat: number, lonOff: number) => ({ x: (lonOff - vLon0) / spanLon * W, y: (lat - vLat0) / spanLat * H });
    // paper
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(120,90,50,${Math.random() * 0.035})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3); }
    // the relief, masked by what is known (soft edges)
    const relief = this.reliefFor(p);
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const lc = layer.getContext('2d')!;
    lc.imageSmoothingEnabled = true;
    lc.drawImage(relief, (vLon0 + 180) / 360 * RW, vLat0 / 180 * RH, spanLon / 360 * RW, spanLat / 180 * RH, 0, 0, W, H);
    const mask = document.createElement('canvas'); mask.width = FOG_W; mask.height = FOG_H;
    const mc = mask.getContext('2d')!, md = mc.createImageData(FOG_W, FOG_H);
    for (let k = 0; k < known.length; k++) { md.data[k * 4 + 3] = known[k] === 1 ? 255 : known[k] === 2 ? 150 : 0; }
    mc.putImageData(md, 0, 0);
    lc.globalCompositeOperation = 'destination-in';
    lc.filter = 'blur(7px)';
    lc.drawImage(mask, (vLon0 + 180) / 360 * FOG_W, vLat0 / 180 * FOG_H, spanLon / 360 * FOG_W, spanLat / 180 * FOG_H, 0, 0, W, H);
    lc.filter = 'none'; lc.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);
    // graticule, every 10 degrees
    ctx.strokeStyle = 'rgba(70,60,90,0.18)'; ctx.lineWidth = 1; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(70,60,90,0.55)';
    for (let la = Math.ceil(vLat0 / 10) * 10; la < vLat0 + spanLat; la += 10) { const y = toXY(la, 0).y; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillText(`${90 - la}°`, 6, y - 3); }
    for (let lo = Math.ceil(vLon0 / 10) * 10; lo < vLon0 + spanLon; lo += 10) { const x = toXY(0, lo).x; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    // landmarks you know
    for (const lm of this.landmarks.filter(l => l.world === p.cfg.id)) {
      const k = Math.floor(lm.lat / 2) * FOG_W + Math.floor(((lm.lon + 540) % 360) / 2);
      if (!known[k]) continue;
      const q = toXY(lm.lat, lm.lon);
      if (q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
      drawIcon(ctx, lm.icon, q.x, q.y);
      ctx.font = 'italic 15px Georgia, serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,220,0.85)'; ctx.strokeText(lm.name, q.x + 10, q.y + 4);
      ctx.fillStyle = '#3a2e22'; ctx.fillText(lm.name, q.x + 10, q.y + 4);
    }
    if (this.trail.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(176,64,48,.85)'; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
      ctx.beginPath(); this.trail.forEach((t, i) => { const q = toXY(t.lat, t.lonOff); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke(); ctx.restore();
    }
    for (const pp of this.people) {
      const q = toXY(pp.lat, pp.lonOff);
      ctx.fillStyle = '#e8b04a'; ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q.x, q.y - 6, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q.x - 6, q.y + 6); ctx.quadraticCurveTo(q.x, q.y - 4, q.x + 6, q.y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '13px system-ui, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,220,0.9)'; ctx.strokeText(pp.name, q.x + 9, q.y + 4);
      ctx.fillStyle = '#5a3a14'; ctx.fillText(pp.name, q.x + 9, q.y + 4);
    }
    for (const pin of this.pins[p.cfg.id] ?? []) { ctx.fillStyle = '#c4524a'; ctx.beginPath(); ctx.arc(pin.x, pin.y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pin.x - 2, pin.y - 2, 2, 0, 7); ctx.fill(); }
    if (playerLatLon) {
      const q = toXY(playerLatLon.lat, playerLatLon.lonOff);
      ctx.fillStyle = 'rgba(255,220,140,.55)'; ctx.beginPath(); ctx.arc(q.x, q.y, 13, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(playerLatLon.heading ?? 0);
      ctx.fillStyle = '#1f4f6a'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // scale bar and compass
    const mPerPx = (p.R * Math.PI / 180) * spanLat / H;
    const bar = [10, 20, 50, 100][[10, 20, 50, 100].findIndex(m => m / mPerPx > 70)] ?? 100;
    const bw = bar / mPerPx;
    ctx.fillStyle = '#3a2e22'; ctx.fillRect(W - 30 - bw, H - 28, bw, 4); ctx.fillRect(W - 30 - bw, H - 34, 2, 10); ctx.fillRect(W - 32, H - 34, 2, 10);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillText(`${bar} m`, W - 30 - bw, H - 38);
    ctx.save(); ctx.translate(W - 46, 52); ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
    ctx.fillStyle = '#3a2e22'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -26); ctx.textAlign = 'left';
    ctx.restore();
    ctx.strokeStyle = 'rgba(80,60,40,.5)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, W - 8, H - 8);
    const walked = fog.reduce((a, v) => a + v, 0);
    const leg = this.el.querySelector('.legend') as HTMLElement;
    leg.innerHTML = `${walked ? `Surveyed on foot: ${walked} squares.` : 'Nothing surveyed yet.'}${mine.length ? ' From people: ' + mine.map(m => esc(m.label)).join(' &middot; ') : ''}`;
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
