import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { dirLatLon, wrapDeg } from '../world/sphere';
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

/** The fog grid: 2 degree cells over latitude 0..180 and longitude offset -180..180. */
export const FOG_W = 180, FOG_H = 90;
/** The painted ground is sampled at this resolution, once per world. */
const BW = 320, BH = 160;
/** The globe's texture (equirectangular, absolute longitude, north pole at the top). */
const TW = 1024, TH = 512;
const D2R = Math.PI / 180;

/** Texture column for an absolute longitude, matching THREE.SphereGeometry's uv layout for dirLatLon. */
const lonToU = (lonDeg: number) => (((180 - lonDeg) % 360) + 360) % 360 / 360;
const uToLon = (u: number) => 180 - u * 360;

export type GlobeIcon = Landmark['icon'] | 'village' | 'bridge' | 'ridge' | 'meadow' | 'cliffs' | 'edge' | 'terraces';
const AREA_ICON: Record<string, GlobeIcon> = { spring: 'spring', village: 'village', terraces: 'terraces', ridge: 'ridge', meadow: 'meadow', cliffs: 'cliffs', bridge: 'bridge', edge: 'edge' };

interface Marker { el: HTMLElement; dir: THREE.Vector3; lift: number; turn?: THREE.Vector3; always?: boolean }

/** A tiny deterministic hash noise, for painting. */
function hash(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * The map: the world itself as a small painted globe you can turn. Places you have not been sit under soft
 * painted cloud that clears as you explore. North is the spring, south is the edge where the river falls.
 * One sphere with one baked canvas texture per world; the globe is only drawn again when it turns or changes.
 */
export class MapView {
  el: HTMLElement;
  /** Custom pins per world, as unit directions from the planet's center. Only the first one is used. */
  private custom: Record<string, { x: number; y: number; z: number }[]> = {};
  get pins(): Record<string, { x: number; y: number; z: number }[]> { return this.custom; }
  /** Old saves held flat-map pixel pins; only pins with a direction are kept. */
  set pins(v: Record<string, { x: number; y: number; z?: number }[]>) {
    this.custom = {};
    for (const [k, a] of Object.entries(v ?? {})) {
      const ok = (a ?? []).filter(q => typeof q?.z === 'number').slice(0, 1) as { x: number; y: number; z: number }[];
      if (ok.length) this.custom[k] = ok;
    }
  }
  /** Visited cells per world, FOG_W x FOG_H. */
  seen: Record<string, Uint8Array> = {};
  open = false;

  /** A line of footsteps (playtests record the route here). */
  trail: { lat: number; lonOff: number }[] = [];
  /** People you have met: small portrait dots with names. */
  people: { name: string; lat: number; lonOff: number; invited?: boolean }[] = [];
  /** When set (world 1), the globe names the areas you have walked into instead of landmarks. */
  areas: { id?: string; name: string; at: { lat: number; lonOff: number }; outline: { lat: number; lonOff: number }[] }[] | null = null;
  /** The current task, as the gold pin. */
  task: { dir: THREE.Vector3; label: string } | null = null;

  private stage: HTMLElement;
  private markerLayer: HTMLElement;
  private rose: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private globe = new THREE.Group();
  private sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial> | null = null;
  private tex: THREE.CanvasTexture | null = null;
  private texCanvas = document.createElement('canvas');
  private base = new Map<string, HTMLCanvasElement>();
  private markers: Marker[] = [];
  private planet: Planet | null = null;
  private player: { dir: THREE.Vector3; facing: THREE.Vector3 } | null = null;
  private owned = new Set<string>();
  private yaw = 0; private pitch = 0; private dist = 4.4;
  private turnAnim: { y0: number; p0: number; y1: number; p1: number; t: number } | null = null;
  private dirty = true;
  private raf = 0;
  private keys = new Set<string>();
  private lastT = 0;
  private roseAngle = 0;
  /** Milliseconds the last globe draw took (for the cost check). */
  lastDrawMs = 0;

  constructor(private landmarks: Landmark[]) {
    this.el = document.createElement('div');
    this.el.className = 'overlay globeoverlay hidden';
    this.el.innerHTML = `<div class="globesheet">
      <h2 class="mt"></h2>
      <div class="globestage"><div class="globehalo"></div><div class="globemarks"></div></div>
      <div class="globeside">
        <div class="globerose"><svg viewBox="-60 -60 120 120"><circle r="44" class="rr"/><circle r="30" class="rr2"/>
          <path d="M0 -42 L7 0 L0 6 L-7 0 Z" class="rn"/><path d="M0 42 L7 0 L0 -6 L-7 0 Z" class="rs"/><path d="M42 0 L0 6 L-6 0 L0 -6 Z" class="re"/><path d="M-42 0 L0 6 L6 0 L0 -6 Z" class="re"/>
          <text y="-48" class="rl n">N</text><text x="52" y="5" class="rl">E</text><text y="58" class="rl">S</text><text x="-52" y="5" class="rl">W</text></svg>
          <div class="rosecap">N is the spring · S is the edge</div></div>
        <button class="gbtn" data-g="nilo">Turn to Nilo</button>
        <button class="gbtn gold" data-g="task">Turn to the task</button>
        <div class="globehelp">Drag or arrow keys to turn · scroll to zoom<br/>Click to drop your pin · click it again to lift it</div>
      </div>
      <div class="legend dim"></div>
    </div>`;
    this.stage = this.el.querySelector('.globestage')!;
    this.markerLayer = this.el.querySelector('.globemarks')!;
    this.rose = this.el.querySelector('.globerose svg')!;
    document.getElementById('ui')!.append(this.el);
    this.globe.add(new THREE.Group());
    this.scene.add(this.globe);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.5); sun.position.set(-2.5, 2.2, 3.2); this.scene.add(sun);
    (this.el.querySelector('[data-g="nilo"]') as HTMLElement).onclick = e => { e.stopPropagation(); if (this.player) this.turnTo(this.player.dir); };
    (this.el.querySelector('[data-g="task"]') as HTMLElement).onclick = e => { e.stopPropagation(); if (this.task) this.turnTo(this.localDir(this.task.dir)); };
    this.bindPointer();
    addEventListener('keydown', e => { if (this.open && e.code.startsWith('Arrow')) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  fog(id: string): Uint8Array { return (this.seen[id] ??= new Uint8Array(FOG_W * FOG_H)); }

  /** Mark everything within `radius` world units of the player as surveyed. Returns true if anything new was seen. */
  reveal(p: Planet, lat: number, lonOff: number, radius: number): boolean {
    this.warmLater(p);
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

  // ------------------------------------------------------------------ custom pin
  /** Your pin on this world, as a unit direction from the planet's center, or null. */
  customPin(worldId: string): THREE.Vector3 | null {
    const q = this.custom[worldId]?.[0];
    return q ? new THREE.Vector3(q.x, q.y, q.z).normalize() : null;
  }
  setPin(worldId: string, dir: THREE.Vector3 | null) {
    if (dir) this.custom[worldId] = [{ x: dir.x, y: dir.y, z: dir.z }]; else delete this.custom[worldId];
    this.pinVersion++;
  }
  clearPin(worldId: string) { this.setPin(worldId, null); if (this.open && this.planet?.cfg.id === worldId) this.buildMarkers(); }
  /** Bumped whenever your pin moves, so the compass can tell a new pin from an old one. */
  pinVersion = 0;

  // ------------------------------------------------------------------ painting
  /** Planet-local unit direction of a world position (or of a direction that is already local). */
  private localDir(v: THREE.Vector3) {
    if (!this.planet) return v.clone().normalize();
    return v.lengthSq() > 4 ? v.clone().sub(this.planet.center).normalize() : v.clone().normalize();
  }

  /** The painted ground of one world: elevation colours, soft hillshade, snow, brush strokes. Cached. */
  private heights = new Map<string, { hs: Float32Array; row: number }>();
  private warming = false;
  /** Sample the ground's height a few rows at a time in idle moments, so opening the map never stalls. */
  private warm(p: Planet, budgetMs: number) {
    let job = this.heights.get(p.cfg.id);
    if (!job) { job = { hs: new Float32Array(BW * BH), row: 0 }; this.heights.set(p.cfg.id, job); }
    const d = new THREE.Vector3(), t0 = performance.now();
    // job.row counts samples (not rows), so a slice can stop anywhere and stays within its budget
    const N = BW * BH;
    while (job.row < N && performance.now() - t0 < budgetMs) {
      const end = Math.min(N, job.row + 32);
      for (let k = job.row; k < end; k++) { const i = k % BW, j = (k - i) / BW; dirLatLon((j + 0.5) / BH * 180, uToLon((i + 0.5) / BW), d); job.hs[k] = p.height(d); }
      job.row = end;
    }
    return job.row >= BW * BH ? job.hs : null;
  }
  private warmLater(p: Planet) {
    if (this.warming || this.base.has(p.cfg.id) || (this.heights.get(p.cfg.id)?.row ?? 0) >= BW * BH) return;
    this.warming = true;
    const ric = (globalThis as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const step = (ms: number) => { this.warming = false; if (!this.warm(p, ms)) this.warmLater(p); };
    if (ric) ric(d => step(Math.max(2, Math.min(4, d.timeRemaining() - 1))), { timeout: 250 }); else setTimeout(() => step(3), 30);
  }

  /** The painted ground of one world: elevation colours, soft hillshade, snow, brush strokes. Cached. */
  private baseFor(p: Planet): HTMLCanvasElement {
    let c = this.base.get(p.cfg.id);
    if (c) return c;
    const hs = this.warm(p, 1e9)!;
    const img = new ImageData(BW, BH);
    const P = p.cfg.palette, A = p.cfg.amplitude;
    const low = new THREE.Color(P.low), mid = new THREE.Color(P.mid), high = new THREE.Color(P.high), rock = new THREE.Color(P.rock), snow = new THREE.Color(P.snow ?? '#ffffff');
    const col = new THREE.Color(), warm = new THREE.Color('#f4e2b8');
    const mPerPxLat = p.R * Math.PI / BH;
    for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
      const k = j * BW + i, h = hs[k];
      const s = Math.max(0.2, Math.sin((j + 0.5) / BH * Math.PI));
      const mPerPxLon = p.R * 2 * Math.PI / BW * s;
      const hx = (hs[j * BW + (i + 1) % BW] - hs[j * BW + (i + BW - 1) % BW]) / (2 * mPerPxLon);
      const hy = (hs[Math.min(BH - 1, j + 1) * BW + i] - hs[Math.max(0, j - 1) * BW + i]) / (2 * mPerPxLat);
      const slope = Math.sqrt(hx * hx + hy * hy);
      const shade = Math.max(0.55, Math.min(1.25, 0.92 + (hx * 0.7 + hy * 0.9) * -1.1 / Math.sqrt(1 + slope * slope)));
      // banded like a painting: the height steps softly between a few tones
      const hn0 = Math.max(0, h / A), band = Math.floor(hn0 * 7) / 7, hn = band + (hn0 - band) * 0.35;
      if (hn < 0.5) col.copy(low).lerp(mid, hn * 2); else col.copy(mid).lerp(high, Math.min(1, (hn - 0.5) * 2));
      col.lerp(rock, Math.min(1, Math.max(0, (slope - 0.6) * 1.4)) * 0.7);
      if (p.cfg.shape === 'peaks') col.lerp(snow, Math.min(1, Math.max(0, (hn0 - 0.7) * 5)) * Math.max(0, 1 - slope * 0.8));
      if (h < p.cfg.riverBed + 0.6) col.lerp(new THREE.Color('#5ea8d8'), 0.6);
      col.multiplyScalar(shade).lerp(warm, 0.12);
      img.data[k * 4] = Math.min(255, col.r * 255); img.data[k * 4 + 1] = Math.min(255, col.g * 255); img.data[k * 4 + 2] = Math.min(255, col.b * 255); img.data[k * 4 + 3] = 255;
    }
    // Up-size to the texture in JS (reading a canvas back can stall for a long time on some GPUs), adding
    // brush dabs as it goes: a little lighter or darker, stretched east-west and wider near the poles so they
    // stay round on the globe.
    const src = img.data, big = new ImageData(TW, TH), px = big.data;
    for (let y = 0; y < TH; y++) {
      const sinLat = Math.max(0.12, Math.sin((y + 0.5) / TH * Math.PI));
      const fy = Math.max(0, Math.min(BH - 1.001, (y + 0.5) / TH * BH - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
      for (let x = 0; x < TW; x++) {
        const fx = (x + 0.5) / TW * BW - 0.5 + BW, x0 = Math.floor(fx), tx = fx - x0;
        const a0 = ((y0 * BW) + x0 % BW) * 4, a1 = ((y0 * BW) + (x0 + 1) % BW) * 4, b0 = (((y0 + 1) * BW) + x0 % BW) * 4, b1 = (((y0 + 1) * BW) + (x0 + 1) % BW) * 4;
        const n = vnoise(x * sinLat / 9, y / 2.6) * 0.65 + vnoise(x * sinLat / 3.5 + 50, y / 1.4) * 0.35;
        const lift = (n - 0.5) * 46, k = (y * TW + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const v = (src[a0 + ch] * (1 - tx) + src[a1 + ch] * tx) * (1 - ty) + (src[b0 + ch] * (1 - tx) + src[b1 + ch] * tx) * ty;
          px[k + ch] = v + lift * (ch === 2 ? 0.8 : 1);
        }
        px[k + 3] = 255;
      }
    }
    c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(big, 0, 0);
    // the river: a bright blue line from the spring to the edge
    const sinOf = (lat: number) => Math.max(0.08, Math.sin(lat * D2R));
    const riverPath = (w: number, style: string) => {
      ctx.fillStyle = style; ctx.beginPath();
      for (let lat = p.cfg.riverStartLat; lat <= 179.6; lat += 0.12) {
        const lon = p.lonAtLat(lat), x = lonToU(lon) * TW, y = lat / 180 * TH;
        const ww = w * (0.55 + 0.45 * Math.min(1, (lat - p.cfg.riverStartLat) / 30));
        ctx.moveTo(x + ww / sinOf(lat), y); ctx.ellipse(x, y, ww / sinOf(lat), ww, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    riverPath(4.2, '#2f73b8'); riverPath(2.6, '#5fb0ee'); riverPath(1.0, '#d8f2ff');
    // faint guide lines: meridians meet at the spring (north), parallels every 30 degrees
    ctx.strokeStyle = 'rgba(60,48,90,0.22)'; ctx.lineWidth = 1.4;
    for (let lo = 0; lo < 360; lo += 30) { const x = lo / 360 * TW; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TH); ctx.stroke(); }
    for (let la = 30; la < 180; la += 30) { const y = la / 180 * TH; ctx.setLineDash(la === 90 ? [] : [6, 6]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TW, y); ctx.stroke(); }
    ctx.setLineDash([]);
    this.base.set(p.cfg.id, c);
    return c;
  }

  /** Paint the globe: the ground, soft cloud over what you have not seen, and the outlines of named areas. */
  private paint(p: Planet) {
    const t0 = performance.now();
    const base = this.baseFor(p);
    this.baseMs = performance.now() - t0;
    const c = this.texCanvas; c.width = TW; c.height = TH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    // what is known: walked cells, plus map pieces people gave you
    const fog = this.fog(p.cfg.id);
    const known = new Float32Array(FOG_W * FOG_H);
    for (let k = 0; k < known.length; k++) known[k] = fog[k] ? 1 : 0;
    const mine = this.areas ? [] : PIECES.filter(pc => pc.world === p.cfg.id && this.owned.has(pc.id));
    for (const pc of mine) for (let i = Math.floor(pc.lat[0] / 2); i < Math.ceil(pc.lat[1] / 2) && i < FOG_H; i++) for (let lo = pc.lon[0]; lo < pc.lon[1]; lo += 2) { const k = i * FOG_W + Math.floor(((lo + 540) % 360) / 2); known[k] = Math.max(known[k], 0.7); }
    // soften: two box blurs over the grid
    const blur = (a: Float32Array) => {
      const o = new Float32Array(a.length);
      for (let i = 0; i < FOG_H; i++) for (let j = 0; j < FOG_W; j++) {
        let s = 0, n = 0;
        for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= FOG_H) continue; for (let dj = -1; dj <= 1; dj++) { s += a[ii * FOG_W + (j + dj + FOG_W) % FOG_W]; n++; } }
        o[i * FOG_W + j] = s / n;
      }
      return o;
    };
    const soft = blur(blur(known));
    // cloud, painted at a lower resolution and laid over the ground
    const CW = 512, CH = 256;
    const cl = document.createElement('canvas'); cl.width = CW; cl.height = CH;
    const cc = cl.getContext('2d')!, img = cc.createImageData(CW, CH);
    for (let j = 0; j < CH; j++) {
      const lat = (j + 0.5) / CH * 180, lonR = p.lonAtLat(lat);
      const fi = Math.min(FOG_H - 1.001, Math.max(0, lat / 2 - 0.5));
      const i0 = Math.floor(fi), ti = fi - i0;
      for (let i = 0; i < CW; i++) {
        const lon = uToLon((i + 0.5) / CW);
        const off = wrapDeg(lon - lonR);
        const fj = ((off + 180) / 2 - 0.5 + FOG_W) % FOG_W, j0 = Math.floor(fj), tj = fj - j0, j1 = (j0 + 1) % FOG_W;
        const a = soft[i0 * FOG_W + j0] * (1 - tj) + soft[i0 * FOG_W + j1] * tj;
        const b = soft[(i0 + 1) * FOG_W + j0] * (1 - tj) + soft[(i0 + 1) * FOG_W + j1] * tj;
        const seenK = a * (1 - ti) + b * ti;
        // billowy cloud: noise in direction space so it does not pinch at the poles
        const d = dirLatLon(lat, lon, tmpD);
        const nz = vnoise(d.x * 6 + d.z * 2 + 10, d.y * 6 + 3) * 0.6 + vnoise(d.z * 13 + 4, d.x * 13 - d.y * 5) * 0.4;
        const cover = Math.min(1, Math.max(0, (0.62 - seenK) * 2.6 + (nz - 0.5) * 0.5));
        const k = (j * CW + i) * 4;
        const lit = 236 + nz * 18;
        img.data[k] = lit; img.data[k + 1] = lit - 4; img.data[k + 2] = lit + 6 - nz * 10; img.data[k + 3] = Math.round(cover * 245);
      }
    }
    cc.putImageData(img, 0, 0);
    ctx.drawImage(cl, 0, 0, TW, TH);
    // named areas you have walked into: a soft dashed border
    for (const a of this.areas ?? []) {
      ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(58,46,34,.55)'; ctx.fillStyle = 'rgba(255,248,225,.14)';
      ctx.beginPath();
      let lastX = 0;
      a.outline.forEach((q, i) => {
        const lon = q.lonOff + p.lonAtLat(q.lat); let x = lonToU(lon) * TW; const y = q.lat / 180 * TH;
        if (i && Math.abs(x - lastX) > TW / 2) x += x < lastX ? TW : -TW;
        lastX = x;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (this.trail.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(176,64,48,.85)'; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
      ctx.beginPath(); let lastX = -1e9;
      for (const t of this.trail) { const x = lonToU(t.lonOff + p.lonAtLat(t.lat)) * TW, y = t.lat / 180 * TH; if (Math.abs(x - lastX) > TW / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y); lastX = x; }
      ctx.stroke(); ctx.restore();
    }
    if (!this.tex) { this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4; }
    this.tex.needsUpdate = true;
    this.paintMs = performance.now() - t0;
  }
  /** Milliseconds the last texture paint took (done once when the map opens, not per frame). */
  paintMs = 0;
  /** Of that, milliseconds spent finishing the painted ground (zero once it has been warmed in idle time). */
  baseMs = 0;

  // ------------------------------------------------------------------ markers
  private icon(kind: GlobeIcon): string {
    const S = (body: string) => `<svg viewBox="-12 -12 24 24" class="gi">${body}</svg>`;
    switch (kind) {
      case 'village': case 'hut': return S(`<path d="M-9 2 L-3 -5 L3 2 Z M1 2 L5 -3 L10 2 Z" class="ink fillw"/><rect x="-7" y="2" width="8" height="6" class="ink fillw"/><rect x="2" y="2" width="6" height="6" class="ink fillw"/><path d="M-5 -6 q1 -3 0 -5" class="ink"/>`);
      case 'bridge': return S(`<path d="M-10 4 Q0 -8 10 4" class="ink" stroke-width="2.4"/><path d="M-10 4 H10" class="ink"/><path d="M-11 7 q3 -2 6 0 t6 0 t6 0" class="water"/>`);
      case 'spring': return S(`<circle r="6" class="water fillwater"/><path d="M-3 -1 q3 -3 6 0" class="ink"/><path d="M0 -6 v-4" class="water"/>`);
      case 'ridge': case 'peak': return S(`<path d="M-11 7 L-3 -6 L1 -1 L5 -8 L11 7 Z" class="ink fillr"/><path d="M-5 -3 L-3 -6 L-1 -3 M3 -5 L5 -8 L7 -5" class="snow"/><path d="M7 -10 l3 -2 M8 -7 l3 -1" class="ink"/>`);
      case 'meadow': case 'cloud': return S(`<path d="M-9 3 a4 4 0 0 1 2 -7 a5 5 0 0 1 9 -1 a4 4 0 0 1 6 6 Z" class="ink fillw"/><path d="M-10 8 q2 -3 4 0 M-2 8 q2 -3 4 0 M6 8 q2 -3 4 0" class="grass"/>`);
      case 'cliffs': return S(`<path d="M-10 8 V-2 L-6 -8 H2 L4 -2 L10 0 V8 Z" class="ink fillr"/><path d="M-6 -2 v6 M0 -6 v5" class="ink"/>`);
      case 'terraces': return S(`<path d="M-10 8 H10 M-8 4 H8 M-6 0 H6 M-4 -4 H4" class="ink"/><circle cx="4" cy="-7" r="2" class="ink fillw"/>`);
      case 'edge': case 'arch': return S(`<path d="M-9 8 V-2 a9 9 0 0 1 18 0 V8" class="ink" stroke-width="2.4"/><path d="M0 -2 v10 M-3 1 v7 M3 1 v7" class="water"/>`);
      case 'stone': return S(`<path d="M-7 8 V-4 l2 -2 l2 2 V8 M-1 8 V-7 l2 -2 l2 2 V8 M5 8 V-1 l2 -2 l2 2 V8" class="ink fillr"/>`);
      case 'pole': return S(`<path d="M0 9 V-9" stroke="#c4524a" stroke-width="3"/>`);
      case 'fire': return S(`<path d="M0 -9 C6 -2 6 6 0 8 C-6 6 -6 -2 0 -9 Z" fill="#e88a3a" stroke="#7a3a14"/>`);
      case 'tower': return S(`<rect x="-3" y="-9" width="6" height="17" class="ink fillw"/>`);
      case 'person': return S(`<circle cy="-4" r="3.5" class="ink fillw"/><path d="M-6 8 q6 -12 12 0 Z" class="ink fillw"/>`);
    }
  }

  private add(html: string, cls: string, dir: THREE.Vector3, lift = 0.012, extra: Partial<Marker> = {}) {
    const el = document.createElement('div');
    el.className = 'gm ' + cls; el.innerHTML = html;
    this.markerLayer.append(el);
    this.markers.push({ el, dir: dir.clone().normalize(), lift, ...extra });
    return el;
  }

  private buildMarkers() {
    const p = this.planet!; this.markerLayer.innerHTML = ''; this.markers = [];
    const fog = this.fog(p.cfg.id);
    const isKnown = (lat: number, lonOff: number) => {
      if (fog[Math.floor(lat / 2) * FOG_W + Math.floor(((lonOff + 540) % 360) / 2)]) return true;
      return PIECES.some(pc => pc.world === p.cfg.id && this.owned.has(pc.id) && lat >= pc.lat[0] && lat <= pc.lat[1] && lonOff >= pc.lon[0] && lonOff <= pc.lon[1]);
    };
    // the poles: north is the spring, south is where the river falls
    this.add(`<b>N</b>`, 'pole north', new THREE.Vector3(0, 1, 0), 0.02);
    this.add(`<b>S</b>`, 'pole south', new THREE.Vector3(0, -1, 0), 0.02);
    // east and west beside wherever you are looking (placed each time the globe turns)
    this.add(`<b>E</b>`, 'pole ew east', new THREE.Vector3(1, 0, 0), 0.02, { always: true });
    this.add(`<b>W</b>`, 'pole ew west', new THREE.Vector3(-1, 0, 0), 0.02, { always: true });
    if (this.areas) {
      for (const a of this.areas) this.add(`${this.icon(AREA_ICON[a.id ?? ''] ?? 'hut')}<span class="gl">${esc(a.name)}</span>`, 'place', p.dirRiver(a.at.lat, a.at.lonOff));
    } else {
      for (const lm of this.landmarks.filter(l => l.world === p.cfg.id)) {
        if (!isKnown(lm.lat, lm.lon)) continue;
        this.add(`${this.icon(lm.icon)}<span class="gl">${esc(lm.name)}</span>`, 'place', p.dirRiver(lm.lat, lm.lon));
      }
    }
    for (const pp of this.people) this.add(`<span class="face${pp.invited ? ' invited' : ''}">${esc(pp.name.slice(0, 1))}</span><span class="gl small">${esc(pp.name)}</span>`, 'person', p.dirRiver(pp.lat, pp.lonOff));
    const mine = this.customPin(p.cfg.id);
    if (mine) this.add(`<svg viewBox="-12 -30 24 32" class="pinsvg"><path d="M0 0 C-3 -9 -10 -13 -10 -20 a10 10 0 0 1 20 0 C10 -13 3 -9 0 0 Z" fill="#d8665c" stroke="#5a2420" stroke-width="1.6"/><circle cy="-20" r="4" fill="#fff4ea"/></svg><span class="gl">Your pin</span>`, 'pin custom', mine, 0.01);
    if (this.task) this.add(`<svg viewBox="-12 -30 24 32" class="pinsvg"><path d="M0 0 C-3 -9 -10 -13 -10 -20 a10 10 0 0 1 20 0 C10 -13 3 -9 0 0 Z" fill="#f0bd4f" stroke="#6a4310" stroke-width="1.6"/><path d="M0 -26 l2 4 l4 .6 l-3 3 l.8 4 l-3.8 -2 l-3.8 2 l.8 -4 l-3 -3 l4 -.6 Z" fill="#fff6dc"/></svg><span class="gl task">${esc(this.task.label)}</span>`, 'pin task', this.localDir(this.task.dir), 0.01);
    if (this.player) this.add(`<div class="niloglow"></div><svg viewBox="-14 -16 28 30" class="nilosvg"><path d="M0 -15 L5 -7" class="nose"/><path d="M0 -12 C8 -12 10 -2 9 9 C4 12 -4 12 -9 9 C-10 -2 -8 -12 0 -12 Z" fill="#284a66" stroke="#10202e" stroke-width="1.4"/><path d="M0 -6 C5 -6 6 0 5 4 C2 6 -2 6 -5 4 C-6 0 -5 -6 0 -6 Z" fill="#0d1620"/><circle cx="-2.2" cy="-1" r="1.4" fill="#ffe9a8"/><circle cx="2.2" cy="-1" r="1.4" fill="#ffe9a8"/></svg>`, 'nilo', this.player.dir, 0.015, { turn: this.player.facing });
    this.dirty = true;
  }

  // ------------------------------------------------------------------ drawing
  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'globecanvas';
    this.stage.insertBefore(this.renderer.domElement, this.markerLayer);
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.globe.add(this.sphere);
  }

  private size() { return Math.round(Math.min(620, innerHeight * 0.72, innerWidth * 0.62)); }

  /** Orient the globe so that a planet-local direction faces you, north up. */
  private anglesFor(d: THREE.Vector3) {
    const yaw = -Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    return { yaw, pitch: Math.max(-1.45, Math.min(1.45, pitch)) };
  }
  turnTo(d: THREE.Vector3, instant = false) {
    const a = this.anglesFor(d);
    if (instant) { this.yaw = a.yaw; this.pitch = a.pitch; this.turnAnim = null; this.dirty = true; return; }
    const dy = wrapDeg((a.yaw - this.yaw) / D2R) * D2R;
    this.turnAnim = { y0: this.yaw, p0: this.pitch, y1: this.yaw + dy, p1: a.pitch, t: 0 };
  }

  private applyView() {
    this.globe.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'XYZ'));
    this.camera.position.set(0, 0, this.dist); this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  /** Where a planet-local direction lands on screen (px within the stage), and whether it faces you. */
  private project(dir: THREE.Vector3, lift: number, S: number) {
    const w = dir.clone().multiplyScalar(1 + lift).applyQuaternion(this.globe.quaternion);
    const facing = (w.dot(this.camera.position) - (1 + lift) * (1 + lift)) / this.dist;
    const s = w.clone().project(this.camera);
    return { x: (s.x * 0.5 + 0.5) * S, y: (0.5 - s.y * 0.5) * S, facing, w };
  }

  private render() {
    if (!this.renderer || !this.planet) return;
    const t0 = performance.now();
    const S = this.size();
    if (this.stage.style.width !== S + 'px') { this.stage.style.width = this.stage.style.height = S + 'px'; this.renderer.setSize(S, S, false); this.renderer.domElement.style.width = this.renderer.domElement.style.height = S + 'px'; }
    this.applyView();
    if (this.sphere && this.tex && this.sphere.material.map !== this.tex) { this.sphere.material.map = this.tex; this.sphere.material.needsUpdate = true; }
    this.renderer.render(this.scene, this.camera);
    // the view's centre on the globe, and its east, to place E and W and turn the compass rose
    const inv = this.globe.quaternion.clone().invert();
    const c = new THREE.Vector3(0, 0, 1).applyQuaternion(inv);
    const north = new THREE.Vector3(0, 1, 0).sub(c.clone().multiplyScalar(c.y));
    if (north.lengthSq() > 1e-4) north.normalize();
    const east = new THREE.Vector3().crossVectors(north, c).normalize();
    for (const m of this.markers) {
      if (m.el.classList.contains('east')) m.dir.copy(c).multiplyScalar(Math.cos(1.15)).addScaledVector(east, Math.sin(1.15)).normalize();
      if (m.el.classList.contains('west')) m.dir.copy(c).multiplyScalar(Math.cos(1.15)).addScaledVector(east, -Math.sin(1.15)).normalize();
      const q = this.project(m.dir, m.lift, S);
      const vis = Math.max(0, Math.min(1, q.facing * 9));
      m.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
      m.el.style.opacity = (m.always ? Math.max(0.35, vis) : vis).toFixed(2);
      m.el.style.visibility = vis <= 0 && !m.always ? 'hidden' : 'visible';
      if (m.turn) {
        const ahead = m.dir.clone().addScaledVector(m.turn.clone().projectOnPlane(m.dir).normalize(), 0.03).normalize();
        const q2 = this.project(ahead, m.lift, S);
        const ang = Math.atan2(q2.x - q.x, -(q2.y - q.y));
        (m.el.querySelector('.nilosvg') as HTMLElement).style.transform = `rotate(${ang.toFixed(3)}rad)`;
      }
    }
    // the rose turns so its N points at the spring from the middle of the view
    const q0 = this.project(c, 0, S), q1 = this.project(c.clone().addScaledVector(north, 0.05).normalize(), 0, S);
    if (Math.hypot(q1.x - q0.x, q1.y - q0.y) > 0.5) this.roseAngle = Math.atan2(q1.x - q0.x, -(q1.y - q0.y));
    this.rose.style.transform = `rotate(${this.roseAngle.toFixed(3)}rad)`;
    this.lastDrawMs = performance.now() - t0;
  }

  private tick = (now: number) => {
    if (!this.open) { this.raf = 0; return; }
    const dt = Math.min(0.25, (now - (this.lastT || now)) / 1000); this.lastT = now;
    const kx = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const ky = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
    if (kx || ky) { this.turnAnim = null; this.yaw -= kx * dt * 1.6; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - ky * dt * 1.4)); this.dirty = true; }
    if (this.turnAnim) {
      const a = this.turnAnim; a.t = Math.min(1, a.t + dt / 0.7);
      const e = a.t * a.t * (3 - 2 * a.t);
      this.yaw = a.y0 + (a.y1 - a.y0) * e; this.pitch = a.p0 + (a.p1 - a.p0) * e;
      if (a.t >= 1) this.turnAnim = null;
      this.dirty = true;
    }
    if (this.dirty) { this.dirty = false; this.render(); }
    this.raf = requestAnimationFrame(this.tick);
  };

  private bindPointer() {
    let down: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    this.stage.addEventListener('pointerdown', e => {
      e.stopPropagation();
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
      this.turnAnim = null;
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 4) down.moved = true;
      if (!down.moved) return;
      const k = 2.6 / this.size() * (this.dist / 4.4);
      this.yaw = down.yaw + dx * k;
      this.pitch = Math.max(-1.45, Math.min(1.45, down.pitch + dy * k));
      this.dirty = true;
    });
    this.stage.addEventListener('pointerup', e => {
      if (!down) return;
      const wasClick = !down.moved; down = null;
      if (wasClick) this.clickAt(e.clientX, e.clientY);
    });
    this.stage.addEventListener('click', e => e.stopPropagation());
    this.stage.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); this.dist = Math.max(2.5, Math.min(4.6, this.dist * (1 + Math.sign(e.deltaY) * 0.08))); this.dirty = true; }, { passive: false });
  }

  /** Click on the globe: drop your pin, move it, or lift it if you clicked the pin itself. */
  clickAt(clientX: number, clientY: number) {
    if (!this.planet) return;
    const r = this.stage.getBoundingClientRect(), S = this.size();
    const x = clientX - r.left, y = clientY - r.top;
    const id = this.planet.cfg.id;
    const mine = this.customPin(id);
    if (mine) { const q = this.project(mine, 0.01, S); if (q.facing > 0 && Math.hypot(q.x - x, q.y - y + 14) < 18) { this.setPin(id, null); this.buildMarkers(); return; } }
    const ndc = new THREE.Vector2(x / S * 2 - 1, -(y / S * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (!hit) return;
    this.setPin(id, hit.applyQuaternion(this.globe.quaternion.clone().invert()).normalize());
    this.buildMarkers();
  }

  /**
   * Open the globe for a world. `player` is Nilo's planet-local up and facing; the task is a world position.
   * People and areas use lat / longitude-from-the-river, like the rest of the game.
   */
  draw(p: Planet, owned: Set<string>, player: { dir: THREE.Vector3; facing: THREE.Vector3 } | null) {
    const first = this.planet !== p;
    this.planet = p; this.owned = owned; this.player = player;
    (this.el.querySelector('.mt') as HTMLElement).textContent = p.cfg.name;
    this.ensureRenderer();
    this.paint(p);
    this.buildMarkers();
    if (player) this.turnTo(player.dir, true); else if (first) this.turnTo(dirLatLon(40, p.lonAtLat(40)), true);
    (this.el.querySelector('[data-g="task"]') as HTMLElement).style.display = this.task ? '' : 'none';
    const leg = this.el.querySelector('.legend') as HTMLElement;
    const mine = this.areas ? [] : PIECES.filter(pc => pc.world === p.cfg.id && owned.has(pc.id));
    leg.innerHTML = this.areas
      ? (this.areas.length ? `Places you have been: ${this.areas.map(a => esc(a.name)).join(' &middot; ')}.` : 'Nowhere named yet. Walk, and the clouds clear.')
      : (mine.length ? 'From people: ' + mine.map(m => esc(m.label)).join(' &middot; ') : 'Walk, and the clouds clear.');
    this.dirty = true;
  }

  show(on: boolean) {
    this.open = on; this.el.classList.toggle('hidden', !on);
    if (on && !this.raf) { this.lastT = 0; this.dirty = true; this.raf = requestAnimationFrame(this.tick); }
    if (!on) this.keys.clear();
  }

  /** For playtests: turn the globe to look at a latitude / absolute longitude. */
  look(lat: number, lon: number, zoom?: number) { this.turnTo(dirLatLon(lat, lon), true); if (zoom) this.dist = zoom; this.dirty = true; }
  /** For playtests: screen position (client px) of a planet-local direction on the globe. */
  screenOf(dir: THREE.Vector3) { const r = this.stage.getBoundingClientRect(), q = this.project(dir.clone().normalize(), 0, this.size()); return { x: r.left + q.x, y: r.top + q.y, facing: q.facing }; }
}
const tmpD = new THREE.Vector3();
