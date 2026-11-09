// The other worlds seen as far moons: "Look up." after the letter, the title, and faintly in World 1's sky after.
// Each world is painted once into a picture of itself (rendered from the real world, so the moon in the sky is the
// place you will walk on), then hung in the sky with its own air around it: haze by depth, a warm rim on the sun
// side, soft painted cloud banks it rises out of, a few birds, and the home light blinking on the farthest one.
// For the sky view it also builds the cloud sea: big painted banks round the column of worlds.
import * as THREE from 'three';
import type { Planet } from './planet';
import { smoothstep } from './noise';
import { PAINT } from '../render/paint';

// ------------------------------------------------------------------ painted clouds

/**
 * A gouache cumulus bank on a canvas, after the big soft masses of the references: one or two heaped masses whose
 * crowns break into billows of very different sizes (never a row of equal scallops), with a broken inner row of
 * billows below the crown. Lit cream from above and the sun side, a cool lavender shadow side and belly, a soft cool
 * shadow where a billow stands in front of the one behind it, and a thin ink line along some billow tops.
 * sunRight: the light comes from the upper right instead of the upper left.
 */
export function paintCloud(seed: number, sunRight = false, w = 512, h = 256): HTMLCanvasElement {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const base = h * 0.84;
  // the heap: two or three soft masses side by side, of different heights
  const masses: [number, number, number][] = [];
  const nm = 2 + Math.floor(r() * 2);
  for (let i = 0; i < nm; i++) masses.push([w * (0.22 + r() * 0.56), h * (0.2 + r() * 0.42) * (i === 0 ? 1.25 : 1), w * (0.1 + r() * 0.12)]);
  const top = (px: number) => {
    let y = 0;
    for (const [cx, amp, sg] of masses) y += amp * Math.exp(-(((px - cx) / sg) ** 2));
    const end = Math.min(1, (px / w - 0.06) / 0.12, (0.94 - px / w) / 0.12);
    return Math.max(h * 0.16, base - h * 0.08 - Math.min(h * 0.62, y) * Math.max(0, end) - h * 0.04);
  };
  const sx = sunRight ? 1 : -1;
  const body = 'rgb(250,247,243)';
  /** One row of billows following the heap's outline, `drop` below it, over [xa, xb]. */
  const row = (drop: number, xa: number, xb: number, scale: number) => {
    const out: { x: number; y: number; r: number }[] = [];
    let px = xa;
    while (px < xb) {
      const rad = h * (0.05 + Math.pow(r(), 1.8) * 0.12) * scale;
      const cy = top(px) + drop + rad * 0.8;
      if (cy < base - h * 0.04) out.push({ x: px, y: cy, r: Math.min(rad, cy - 3) });
      px += rad * (0.6 + r() * 0.6);
    }
    return out;
  };
  const outer = row(0, w * 0.07, w * 0.93, 1);
  // the body: everything under the crown, then the crown's billows
  x.fillStyle = body;
  x.beginPath(); x.moveTo(w * 0.07, base);
  for (let px = w * 0.07; px <= w * 0.93; px += 4) x.lineTo(px, Math.min(base, top(px) + h * 0.13));
  x.lineTo(w * 0.93, base); x.closePath(); x.fill();
  for (const p of outer) { x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill(); }
  const ink = (p: { x: number; y: number; r: number }, a: number) => {
    x.strokeStyle = `rgba(104,110,160,${a})`;
    x.lineWidth = Math.max(1.1, p.r * 0.02);
    const a0 = Math.PI * (sunRight ? 1.1 : 1.25 + r() * 0.1), a1 = Math.PI * (sunRight ? 1.75 - r() * 0.1 : 1.9);
    x.beginPath(); x.arc(p.x, p.y, p.r * 0.99, a0, a1); x.stroke();
  };
  // a broken inner row: each billow casts a soft cool shadow on what is behind it, then lays its body over it
  x.save();
  x.globalCompositeOperation = 'source-atop';
  const a0 = w * (0.14 + r() * 0.15), a1 = w * (0.86 - r() * 0.15);
  for (const p of row(h * 0.17, a0, a1, 1.35)) {
    if (r() < 0.4 || p.r < h * 0.06) continue;
    x.filter = `blur(${Math.max(2, p.r * 0.16).toFixed(1)}px)`;
    x.fillStyle = 'rgba(150,158,208,0.34)';
    x.beginPath(); x.arc(p.x - sx * p.r * 0.08, p.y - p.r * 0.14, p.r * 1.02, 0, Math.PI * 2); x.fill();
    x.filter = 'blur(0.5px)';
    x.fillStyle = body;
    x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
    if (r() < 0.7) ink(p, 0.16 + r() * 0.16);
  }
  x.filter = 'none';
  // the light over the whole mass: cream on top and the sun side, cool lavender away from it and underneath
  let minTop = base;
  for (let px = 0; px < w; px += 8) minTop = Math.min(minTop, top(px));
  const vg = x.createLinearGradient(0, minTop - h * 0.05, 0, base);
  vg.addColorStop(0, 'rgba(255,250,240,0.4)'); vg.addColorStop(0.4, 'rgba(240,238,246,0)');
  vg.addColorStop(0.75, 'rgba(196,200,232,0.4)'); vg.addColorStop(1, 'rgba(178,184,226,0.85)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  const hg = x.createLinearGradient(sunRight ? w : 0, 0, sunRight ? 0 : w, 0);
  hg.addColorStop(0, 'rgba(255,236,206,0.22)'); hg.addColorStop(0.45, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(146,152,206,0.36)');
  x.fillStyle = hg; x.fillRect(0, 0, w, h);
  x.restore();
  // a thin ink edge along some of the crowns
  for (const p of outer) if (r() < 0.6) ink(p, 0.14 + r() * 0.12);
  // melt the base and the ends into the air
  x.globalCompositeOperation = 'destination-in';
  const fade = x.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.62, 'rgba(0,0,0,1)'); fade.addColorStop(0.85, 'rgba(0,0,0,0)');
  x.fillStyle = fade; x.fillRect(0, 0, w, h);
  const side = x.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.08, 'rgba(0,0,0,1)'); side.addColorStop(0.92, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = side; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** A radial glow: a soft core, or (ring > 0) a halo that peaks at that fraction of the radius. */
function glowTexture(ring = 0, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (ring > 0) {
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(ring * 0.9, 'rgba(255,255,255,0.55)');
    g.addColorStop(ring, 'rgba(255,255,255,0.75)');
    g.addColorStop(ring + (1 - ring) * 0.25, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  }
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** The home light: a warm point with a soft halo and four fine rays, like a star seen through damp air. */
export function beaconTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!;
  const m = size / 2;
  const g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,244,1)'); g.addColorStop(0.1, 'rgba(255,246,206,1)'); g.addColorStop(0.2, 'rgba(255,214,140,0.75)'); g.addColorStop(0.42, 'rgba(255,190,120,0.22)'); g.addColorStop(1, 'rgba(255,170,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'lighter';
  for (const [dx, dy, len] of [[1, 0, 0.95], [0, 1, 0.8], [0.7, 0.7, 0.35], [0.7, -0.7, 0.35]] as const) {
    const lg = x.createLinearGradient(m - dx * m * len, m - dy * m * len, m + dx * m * len, m + dy * m * len);
    lg.addColorStop(0, 'rgba(255,220,160,0)'); lg.addColorStop(0.5, 'rgba(255,240,210,0.8)'); lg.addColorStop(1, 'rgba(255,220,160,0)');
    x.strokeStyle = lg; x.lineWidth = size * 0.03;
    x.beginPath(); x.moveTo(m - dx * m * len, m - dy * m * len); x.lineTo(m + dx * m * len, m + dy * m * len); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/** A gull seen from below, as a single soft brush stroke; frame 0 wings up, 1 level, 2 down. */
function birdTexture(frame: number): THREE.CanvasTexture {
  const w = 128, h = 64;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const tip = [-22, -4, 14][frame], mid = [-14, -6, 4][frame];
  x.strokeStyle = 'rgba(255,255,255,1)'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = 9;
  x.beginPath();
  x.moveTo(10, h / 2 + tip);
  x.quadraticCurveTo(34, h / 2 + mid - 10, w / 2 - 6, h / 2 + 2);
  x.quadraticCurveTo(w / 2, h / 2 + 6, w / 2 + 6, h / 2 + 2);
  x.quadraticCurveTo(w - 34, h / 2 + mid - 10, w - 10, h / 2 + tip);
  x.stroke();
  x.fillStyle = 'white'; x.beginPath(); x.ellipse(w / 2, h / 2 + 3, 5, 4, 0, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}

const cloudTex: Record<string, THREE.CanvasTexture> = {};
function cloudTexture(i: number, sunRight: boolean) {
  const key = (i % 6) + (sunRight ? 'r' : 'l');
  if (!cloudTex[key]) { const t = new THREE.CanvasTexture(paintCloud((i % 6) * 7 + 3, sunRight)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cloudTex[key] = t; }
  return cloudTex[key];
}

/** A painted cloud sprite. Its colour is multiplied in, so the same bank can be warm, cool or dusky. */
function cloudSprite(i: number, w: number, color = '#ffffff', opacity = 1, sunRight = false): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(i, sunRight), color, transparent: true, opacity, depthWrite: false, fog: false }));
  s.scale.set(w, w * 0.5, 1);
  return s;
}

// ------------------------------------------------------------------ the cloud sea, seen from far away

/**
 * Big painted cumulus banks in loose rings round the column of worlds, and a wide floor of them under the last
 * one, for the sky view. The same banks as the "Look up." shot and the title, so the far views speak one language.
 */
export class CloudSea {
  group = new THREE.Group();
  private banks: { s: THREE.Sprite; o: number }[] = [];
  constructor(scene: THREE.Scene, planets: Planet[]) {
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const axis = new THREE.Vector3();
    planets.forEach(p => axis.add(p.center)); axis.divideScalar(planets.length);
    const top = planets[0].center.y, bottom = planets[planets.length - 1].center.y;
    const layers = planets.length + 1;
    let n = 0;
    for (let L = 0; L < layers; L++) {
      const last = L === layers - 1;
      const y = last ? bottom - 170 : top - 150 - L * (top - bottom) / (layers - 2) + (r() - 0.5) * 40;
      const count = last ? 14 : 4;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + r() * 0.6;
        const rad = last ? 120 + r() * 620 : 420 + r() * 320;
        const c = new THREE.Vector3(axis.x + Math.cos(a) * rad, y + (r() - 0.5) * 50, axis.z + Math.sin(a) * rad);
        if (planets.some(p => p.center.distanceTo(c) < p.R + 220)) continue;
        const w = last ? 300 + r() * 200 : 200 + r() * 120;
        const sp = cloudSprite(n++, w, k % 3 ? '#fff9f2' : '#f1f0fb', 1, true);
        sp.position.copy(c);
        this.group.add(sp);
        this.banks.push({ s: sp, o: 0.96 });
      }
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** k: 0 hidden .. 1 shown. */
  update(_t: number, k: number) {
    this.group.visible = k > 0.01;
    for (const b of this.banks) (b.s.material as THREE.SpriteMaterial).opacity = b.o * k;
  }
}

// ------------------------------------------------------------------ the worlds as moons

/** The "Look up." camera: this far behind Nilo, this high, this far to one side (metres), and how far up it looks (degrees). */
export const LOOK_CAM = { back: 2.4, high: 0.85, side: 0.5, pitch: 46 };

interface Moon {
  planet: Planet;
  tex: THREE.WebGLRenderTarget | null;
  disc: THREE.Mesh;
  halo: THREE.Sprite;
  /** the world's radius as a fraction of half the picture */
  frac: number;
  /** where the home light falls on the picture, in -1..1 picture coordinates (last world only) */
  light?: THREE.Vector2;
}

/** Where a world hangs: which world, elevation and azimuth (degrees, azimuth from fwd toward right), angular size, distance, haze. */
export interface Spot { world: number; el: number; az: number; size: number; dist: number; haze: number }

/** "Look up.": the five later worlds as one receding chain, the nearest lowest and largest, the home light's world last. */
export const LOOKUP_LAYOUT: Spot[] = [
  { world: 1, el: 35, az: -17, size: 14.5, dist: 2400, haze: 0.18 },
  { world: 2, el: 45, az: 7, size: 10, dist: 2900, haze: 0.3 },
  { world: 3, el: 53, az: 23, size: 7.5, dist: 3400, haze: 0.42 },
  { world: 4, el: 59, az: 5, size: 5.5, dist: 3900, haze: 0.52 },
  { world: 5, el: 64, az: -9, size: 4.4, dist: 4400, haze: 0.6 },
];
/** The title: all six worlds round the words, the first one near and large, the home light far and low by the clouds. */
export const TITLE_LAYOUT: Spot[] = [
  { world: 0, el: 9, az: -31, size: 17, dist: 2000, haze: 0.06 },
  { world: 1, el: 20, az: 25, size: 9, dist: 2600, haze: 0.2 },
  { world: 2, el: 12.5, az: 35, size: 7, dist: 3000, haze: 0.26 },
  { world: 3, el: 7.5, az: 29, size: 5.8, dist: 3400, haze: 0.26 },
  { world: 4, el: 3, az: 34, size: 4.8, dist: 3800, haze: 0.2 },
  { world: 5, el: 0.8, az: 28.5, size: 4.4, dist: 4200, haze: 0.16 },
];

const islandVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const islandFrag = /* glsl */ `
  uniform sampler2D map; uniform vec3 uHaze, uRimCol, uMistCol; uniform float uHazeK, uOpacity, uMist, uFlip, uFrac, uNight;
  varying vec2 vUv;
  void main(){
    // the picture is lit from the right; mirrored when the sun is on the left of the shot
    vec2 uv = vec2(uFlip > 0.0 ? vUv.x : 1.0 - vUv.x, vUv.y);
    vec2 p = (vUv - 0.5) / (0.5 * uFrac);
    float rr = length(p);
    // trees and towers sticking far out past the rim are trimmed softly, so the world reads as one round shape
    vec4 t = texture2D(map, uv) * smoothstep(1.16, 1.0, rr) * smoothstep(0.5, 0.47, length(vUv - 0.5));
    vec3 c = t.rgb;
    float r1 = min(rr, 1.0);
    float rim = pow(1.0 - sqrt(1.0 - r1 * r1), 1.6);
    float sunward = dot(p / max(rr, 1e-3), normalize(vec2(uFlip, 0.65)));
    // a world that keeps the night (Lantern Town) is a dusky blue disc, its lanterns still glowing warm
    float warmth = smoothstep(0.25, 0.6, c.r - c.b) * smoothstep(0.55, 0.85, c.r);
    vec3 nightC = c * vec3(0.3, 0.36, 0.7) + vec3(1.0, 0.72, 0.38) * warmth * 0.75;
    c = mix(c, nightC, uNight);
    float hk = uHazeK * (1.0 - 0.55 * uNight);
    // aerial perspective: the farther the world, the more it pales and cools into the sky
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = mix(c, vec3(l), hk * 0.45);
    c = mix(c, uHaze * t.a, hk);
    // its own air at the limb, and a warm rim of light on the sun side (a cool moonlit rim at night)
    c = mix(c, uHaze * t.a, rim * 0.5 * (1.0 - 0.5 * uNight));
    c += mix(uRimCol, vec3(0.55, 0.62, 0.95), uNight) * t.a * rim * smoothstep(-0.15, 0.85, sunward) * 0.8 * (1.0 - 0.4 * uNight);
    // lit from far away: a touch lifted
    c = c * 1.05 + vec3(0.025, 0.02, 0.03) * t.a;
    // the lower part sinks into cloud
    c = mix(c, uMistCol * t.a, smoothstep(0.42, 0.1, vUv.y) * uMist);
    gl_FragColor = vec4(c, t.a) * uOpacity;
  }`;

export interface IslandsCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  planets: Planet[];
  sunLight: THREE.DirectionalLight;
  /** Called before each world is painted, to light it as itself (its own palette). */
  light: (i: number) => void;
  /** Called after painting, to put back the current world's light, fog and paint uniforms. */
  restore: () => void;
  /** Things to hide while painting: the sky, its clouds, the streams, the updrafts, the motes. */
  hide: THREE.Object3D[];
  homePos: THREE.Vector3;
}

/** The worlds as far moons, for the "Look up." shot, the title, and faintly in World 1's sky afterwards. */
export class SkyIslands {
  group = new THREE.Group();
  /** one per world, by world index */
  moons: Moon[] = [];
  layout: Spot[] = LOOKUP_LAYOUT;
  kind: 'lookup' | 'title' = 'lookup';
  /** Painted banks: `spot` >= 0 sits just under that world's lower rim (so it rises out of cloud), -1 hangs on its own. */
  clouds: { s: THREE.Sprite; spot: number; el: number; az: number; dist: number; w: number; drift: number; o: number }[] = [];
  birds: { s: THREE.Sprite; frames: THREE.Texture[]; ph: number; off: THREE.Vector3 }[] = [];
  beacon: THREE.Sprite;
  beaconGlow: THREE.Sprite;
  /** a big warm bloom round the sun, so the worlds glow against a luminous sky */
  bloom: THREE.Sprite;
  baked = false;
  /** the frame the moons hang in: local up, the way Nilo faces, and to his right */
  up = new THREE.Vector3(0, 1, 0);
  fwd = new THREE.Vector3(0, 0, 1);
  right = new THREE.Vector3(1, 0, 0);
  origin = new THREE.Vector3();
  /** -1 mirrors the layout left to right (so the nearest world sits on the far side of the frame from Nilo). */
  flip = 1;
  /** +1 if the sun is to the right of the frame, -1 left: the moons are lit (and their pictures mirrored) to match. */
  sunSide = 1;
  sunDir = new THREE.Vector3(0, 1, 0);
  /** the sky behind the moons, overhead and low: their haze sinks toward it */
  skyTop = new THREE.Color('#7aa6e6');
  skyLow = new THREE.Color('#fbe6cf');
  constructor(scene: THREE.Scene, planets: Planet[]) {
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null }, uHaze: { value: new THREE.Color('#9fc3ee') }, uHazeK: { value: 0.1 }, uOpacity: { value: 0 },
          uMist: { value: 0.2 }, uMistCol: { value: new THREE.Color('#f6eef0') }, uRimCol: { value: new THREE.Color('#ffe2b4') },
          uFlip: { value: 1 }, uFrac: { value: 0.8 }, uNight: { value: (p.cfg.hour?.elev ?? 1) < 0 ? 1 : 0 },
        },
        vertexShader: islandVert, fragmentShader: islandFrag,
        transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      disc.renderOrder = 3;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0.72), color: '#fff4e6', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      halo.renderOrder = 2;
      this.group.add(halo, disc);
      this.moons.push({ planet: p, tex: null, disc, halo, frac: 0.8 });
    }
    // a little flock, crossing slowly: painted gull shapes in three wing positions
    let s = 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const frames = [0, 1, 2].map(f => birdTexture(f));
    for (let k = 0; k < 7; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], color: '#5c6584', transparent: true, opacity: 0, depthWrite: false, fog: false }));
      sp.renderOrder = 7;
      this.birds.push({ s: sp, frames, ph: r() * 6.28, off: new THREE.Vector3((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.6 + (r() - 0.5), -Math.ceil(k / 2) * 1.5 + (r() - 0.5) * 0.8, Math.ceil(k / 2) * 1.8) });
      this.group.add(sp);
    }
    const bt = beaconTexture();
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
    this.beacon.renderOrder = 9;
    // a warm halo with ordinary blending, so the light still reads where it sits over bright cloud
    this.beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe2a0', sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.beaconGlow.renderOrder = 8;
    this.bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0, 512), color: '#ffd8a4', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.bloom.renderOrder = 1;
    this.group.add(this.bloom, this.beaconGlow, this.beacon);
    this.group.visible = false;
    this.configure('lookup');
    scene.add(this.group);
  }

  /** Lay out the sky for the "Look up." shot or the title: which worlds, where, and the cloud banks round them. */
  configure(kind: 'lookup' | 'title') {
    this.kind = kind;
    this.layout = kind === 'title' ? TITLE_LAYOUT : LOOKUP_LAYOUT;
    for (const c of this.clouds) { this.group.remove(c.s); (c.s.material as THREE.Material).dispose(); }
    this.clouds = [];
    let s = kind === 'title' ? 311 : 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const add = (spot: number, el: number, az: number, dist: number, w: number, o: number, tint: string) => {
      const sp = cloudSprite(this.clouds.length + (kind === 'title' ? 3 : 0), 1, tint, 1, this.sunSide > 0);
      sp.renderOrder = spot >= 0 ? 4 : 5;
      this.clouds.push({ s: sp, spot, el, az, dist, w, drift: (0.3 + r() * 0.4) * (r() < 0.5 ? -1 : 1), o });
      this.group.add(sp);
    };
    // one or two banks just under each world's lower rim, so it rises out of the clouds
    this.layout.forEach((L, k) => {
      add(k, -0.58, -0.3, 0.5, 1.3, 0.97, '#fffcf8');
      if (L.size > 7) add(k, -0.66, 0.42, 0.45, 1.0, 0.94, '#f7f6ff');
    });
    if (kind === 'lookup') {
      // big low banks across the bottom of the sky, above Nilo's hood
      for (let k = 0; k < 6; k++) add(-1, 22 + r() * 8, -62 + k * 25 + (r() - 0.5) * 8, 700 + r() * 500, 0.75 + r() * 0.3, 0.97, k % 2 ? '#fffcf8' : '#f7f6ff');
    } else {
      // a calm floor of cloud under the title: few, big, overlapping banks, receding
      for (let k = 0; k < 5; k++) add(-1, -17 - (k % 2) * 5 - r() * 2, -62 + k * 31 + (r() - 0.5) * 6, 900 + (k % 2) * 250 + r() * 150, 0.72 + r() * 0.18, 1, k % 2 ? '#f7f6ff' : '#fffcf8');
      for (let k = 0; k < 4; k++) add(-1, -9 - r() * 2, -54 + k * 36 + (r() - 0.5) * 10, 2000 + r() * 300, 0.5 + r() * 0.14, 0.95, '#fdfaf8');
    }
  }

  /** Paint each world once into a picture, lit from the right at about sixty degrees so it reads as a round world. */
  bake(c: IslandsCtx) {
    if (this.baked) return;
    this.baked = true;
    const size = 1024;
    const cam = new THREE.PerspectiveCamera(26, 1, 1, 1000);
    const oldTarget = c.renderer.getRenderTarget();
    const oldClear = c.renderer.getClearColor(new THREE.Color()), oldAlpha = c.renderer.getClearAlpha();
    const fog = c.scene.fog as THREE.FogExp2 | null;
    const vis = c.hide.map(o => o.visible);
    c.hide.forEach(o => (o.visible = false));
    this.group.visible = false;
    const sc = c.sunLight.shadow.camera;
    const oldShadow = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
    this.moons.forEach(m => {
      const p = m.planet, i = p.index;
      const reach = p.R + p.cfg.amplitude * 1.5 + 26;
      // the side worth seeing: the river winding through the middle, or for the last one the lighthouse
      let view = p.pathPoint(0.42).clone().normalize().addScaledVector(new THREE.Vector3(0, 1, 0), 0.55).normalize();
      if (i === c.planets.length - 1) {
        // the lighthouse up on the shoulder of the world, toward the light, not dead in the middle
        const h = c.homePos.clone().sub(p.center).normalize();
        const tilt = new THREE.Vector3().crossVectors(h, new THREE.Vector3(0, 1, 0)).normalize();
        const probe = new THREE.PerspectiveCamera(cam.fov, 1, 1, 2000);
        let bestErr = Infinity;
        for (let a = -0.9; a <= 0.9; a += 0.1) for (let b = -0.6; b <= 0.6; b += 0.2) {
          const v = h.clone().applyAxisAngle(tilt, a).applyAxisAngle(new THREE.Vector3(0, 1, 0), b).normalize();
          probe.position.copy(p.center).addScaledVector(v, 400); probe.up.set(0, 1, 0); probe.lookAt(p.center); probe.updateMatrixWorld();
          const q = c.homePos.clone().project(probe);
          const err = Math.hypot(q.y - 0.42, Math.abs(q.x) - 0.22) + Math.max(0, 0.45 - v.dot(h)) * 3;
          if (err < bestErr) { bestErr = err; view = v; }
        }
      }
      m.frac = (p.R + p.cfg.amplitude * 0.5) / reach / 1.02;
      const dist = reach / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.02;
      cam.position.copy(p.center).addScaledVector(view, dist);
      cam.up.set(0, 1, 0);
      cam.near = Math.max(1, dist - reach * 1.6); cam.far = dist + reach * 1.6;
      cam.lookAt(p.center);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      c.light(i);
      if (fog) fog.density = 0;
      const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const sun = view.clone().multiplyScalar(0.55).addScaledVector(camRight, 0.68).addScaledVector(camUp, 0.48).normalize();
      PAINT.uSun.value.copy(sun);
      c.sunLight.intensity = 2.6;
      PAINT.uSunCol.value.copy(c.sunLight.color);
      c.sunLight.position.copy(p.center).addScaledVector(sun, 200);
      c.sunLight.target.position.copy(p.center);
      c.sunLight.target.updateMatrixWorld();
      sc.left = -reach; sc.right = reach; sc.top = reach; sc.bottom = -reach; sc.far = 420; sc.updateProjectionMatrix();
      m.tex?.dispose();
      const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, type: THREE.HalfFloatType });
      c.renderer.setRenderTarget(rt);
      c.renderer.setClearColor(0x000000, 0);
      c.renderer.clear();
      c.renderer.render(c.scene, cam);
      m.tex = rt;
      const u = (m.disc.material as THREE.ShaderMaterial).uniforms;
      u.map.value = rt.texture;
      u.uFrac.value = m.frac;
      if (i === c.planets.length - 1) {
        const q = c.homePos.clone().project(cam);
        m.light = new THREE.Vector2(q.x, q.y);
      }
    });
    sc.left = oldShadow[0]; sc.right = oldShadow[1]; sc.top = oldShadow[2]; sc.bottom = oldShadow[3]; sc.far = oldShadow[4]; sc.updateProjectionMatrix();
    c.hide.forEach((o, k) => (o.visible = vis[k]));
    c.renderer.setRenderTarget(oldTarget);
    c.renderer.setClearColor(oldClear, oldAlpha);
    c.restore();
  }

  dispose() { for (const m of this.moons) { m.tex?.dispose(); m.tex = null; } this.baked = false; }

  /** Hang the moons in the sky above someone standing at `origin` with this up, looking along `fwd`. */
  setFrame(origin: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, flip: number, sun: THREE.Vector3) {
    this.flip = flip;
    this.origin.copy(origin);
    this.up.copy(up).normalize();
    this.fwd.copy(fwd).projectOnPlane(this.up).normalize();
    this.right.crossVectors(this.fwd, this.up).normalize();
    this.sunDir.copy(sun).normalize();
    const side = Math.sign(this.sunDir.dot(this.right)) || 1;
    if (side !== this.sunSide) { this.sunSide = side; this.configure(this.kind); }
  }

  /** On a narrow screen (4:3, portrait) the moons draw in toward the middle so none falls off the edge. */
  azScale = 1;

  /** A direction in the sky frame from elevation and azimuth in degrees. */
  skyDir(el: number, az: number, out = new THREE.Vector3()) {
    const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az * this.azScale);
    return out.copy(this.fwd).multiplyScalar(Math.cos(e) * Math.cos(a)).addScaledVector(this.right, Math.cos(e) * Math.sin(a)).addScaledVector(this.up, Math.sin(e)).normalize();
  }

  /** Where the farthest moon (the one with the home light) is, for the camera to look at. */
  homeDir(out = new THREE.Vector3()) { const L = this.layout[this.layout.length - 1]; return this.skyDir(L.el, L.az * this.flip, out); }

  /**
   * Show the sky. t: seconds since the shot began; show: 0..1 overall; reveal: 0..1 how far the moons have come
   * out of the haze (nearest first); light: 0..1 the home light; veil: 0..1 clouds closing over; birds: the flock.
   */
  update(camera: THREE.Camera, t: number, show: number, reveal: number, light: number, veil = 0, birds = true, bloom = 1) {
    this.group.visible = show > 0.001 && this.baked;
    if (!this.group.visible) return;
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 16 / 9;
    this.azScale = Math.min(1, aspect / (this.kind === 'title' ? 1.7 : 1.2));
    const camQ = camera.quaternion;
    const dir = new THREE.Vector3();
    const used = new Set(this.layout.map(L => L.world));
    this.moons.forEach((m, i) => { if (!used.has(i)) { m.disc.visible = false; m.halo.visible = false; } });
    (this.beacon.material as THREE.SpriteMaterial).opacity = 0; (this.beaconGlow.material as THREE.SpriteMaterial).opacity = 0;
    // the worlds appear one after another, nearest first; the last one is fully there when reveal reaches 1
    const stagger = Math.min(0.22, 0.5 / Math.max(1, this.layout.length - 1));
    this.layout.forEach((L, k) => {
      const m = this.moons[L.world];
      m.disc.visible = m.halo.visible = true;
      // a slow drift across the sky, as if the worlds turned with it
      this.skyDir(L.el + Math.sin(t * 0.05 + k) * 0.3, (L.az + t * 0.1) * this.flip, dir);
      const pos = this.origin.clone().addScaledVector(dir, L.dist);
      const w = 2 * L.dist * Math.tan(THREE.MathUtils.degToRad(L.size / 2)) / m.frac;
      m.disc.position.copy(pos); m.disc.quaternion.copy(camQ); m.disc.scale.set(w, w, 1);
      m.halo.position.copy(pos).addScaledVector(dir, 5); m.halo.scale.setScalar(w * m.frac * 1.42);
      const rk = smoothstep(k * stagger, k * stagger + 0.5, reveal) * (1 - veil * 0.85);
      const u = (m.disc.material as THREE.ShaderMaterial).uniforms;
      u.uOpacity.value = show * rk;
      u.uHazeK.value = Math.min(0.85, L.haze + (1 - rk) * 0.4);
      u.uFlip.value = this.sunSide;
      // the air round each world is the sky at its height, a little paler
      (u.uHaze.value as THREE.Color).copy(this.skyLow).lerp(this.skyTop, smoothstep(-5, 60, L.el)).lerp(new THREE.Color('#ffffff'), 0.22);
      (m.halo.material as THREE.SpriteMaterial).opacity = show * rk * (0.32 + 0.12 * (1 - L.haze));
      if (m.light) {
        const lp = pos.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(camQ), m.light.x * this.sunSide * w / 2).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camQ), m.light.y * w / 2);
        lp.addScaledVector(dir, -20);
        const blink = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 1.9)), 3);
        this.beacon.position.copy(lp); this.beaconGlow.position.copy(lp);
        const on = show * light * rk;
        (this.beacon.material as THREE.SpriteMaterial).opacity = on * (0.3 + 0.7 * blink);
        (this.beaconGlow.material as THREE.SpriteMaterial).opacity = on * (0.45 + 0.55 * blink);
        this.beacon.scale.setScalar(0.07 + 0.035 * blink * light);
        this.beaconGlow.scale.setScalar(0.05 + 0.03 * blink);
      }
    });
    // clouds drift slowly; at the end they rise and close over the worlds
    this.clouds.forEach(c => {
      let w: number;
      if (c.spot >= 0) {
        const L = this.layout[c.spot];
        // el/az are in the world's own diameters below and beside its centre
        this.skyDir(L.el + c.el * L.size + veil * L.size * 0.5, (L.az + c.az * L.size + t * (0.1 + c.drift * 0.2)) * this.flip, dir);
        const d = L.dist * c.dist;
        c.s.position.copy(this.origin).addScaledVector(dir, d);
        w = 2 * d * Math.tan(THREE.MathUtils.degToRad(L.size / 2)) * c.w * 1.6;
        const rk = smoothstep(c.spot * stagger, c.spot * stagger + 0.5, reveal);
        (c.s.material as THREE.SpriteMaterial).opacity = c.o * show * Math.max(0.35 + 0.65 * rk, veil);
      } else {
        this.skyDir(c.el + veil * 4, (c.az + t * c.drift * 0.6) * this.flip, dir);
        c.s.position.copy(this.origin).addScaledVector(dir, c.dist);
        w = c.dist * c.w;
        (c.s.material as THREE.SpriteMaterial).opacity = c.o * show;
      }
      c.s.scale.set(w, w * 0.5, 1);
    });
    // the sun's bloom, just off the frame on the sun side
    const bd = this.sunDir.clone();
    if (bd.dot(this.up) < 0.12) bd.addScaledVector(this.up, 0.12 - bd.dot(this.up)).normalize();
    this.bloom.position.copy(this.origin).addScaledVector(bd, 1500);
    this.bloom.scale.setScalar(2000);
    (this.bloom.material as THREE.SpriteMaterial).opacity = show * bloom * 0.32;
    // the flock: crosses from right to left between the near clouds and the moons
    const bt = Math.min(1, Math.max(0, (t - 3.5) / 9));
    const bshow = birds ? show * smoothstep(0, 0.08, bt) * (1 - smoothstep(0.85, 1, bt)) : 0;
    const head = this.skyDir(31 + bt * 6, 45 - bt * 80, new THREE.Vector3());
    const centre = this.origin.clone().addScaledVector(head, 120);
    this.birds.forEach(b => {
      const flap = Math.sin(t * 6.5 + b.ph);
      b.s.position.copy(centre).addScaledVector(this.right, b.off.x).addScaledVector(this.up, b.off.y).addScaledVector(this.fwd, b.off.z);
      const m = b.s.material as THREE.SpriteMaterial;
      m.map = b.frames[flap > 0.35 ? 0 : flap > -0.35 ? 1 : 2];
      m.opacity = bshow * 0.85;
      b.s.visible = bshow > 0.001;
      b.s.scale.set(3.4, 1.7, 1);
    });
  }
}
