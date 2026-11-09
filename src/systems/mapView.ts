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
  { id: 'map:sea', world: 'sea', label: 'The Endless Sea', lat: [0, 180], lon: [-70, 70] },
  { id: 'map:desert', world: 'desert', label: 'The Glass Desert', lat: [0, 180], lon: [-70, 70] },
];

/** The fog grid: 2 degree cells over latitude 0..180 and longitude offset -180..180. */
export const FOG_W = 180, FOG_H = 90;
/** The cloud veil's texture (equirectangular, absolute longitude from -180 at u = 0, north pole at v = 0). */
const KW = 256, KH = 128;
const D2R = Math.PI / 180;

export type GlobeIcon = Landmark['icon'] | 'village' | 'bridge' | 'ridge' | 'meadow' | 'cliffs' | 'edge' | 'terraces';
const AREA_ICON: Record<string, GlobeIcon> = { spring: 'spring', village: 'village', terraces: 'terraces', ridge: 'ridge', meadow: 'meadow', cliffs: 'cliffs', bridge: 'bridge', edge: 'edge' };

interface Marker { el: HTMLElement; dir: THREE.Vector3; lift: number; turn?: THREE.Vector3; always?: boolean }

/** Where the map finds the world's houses, trees and rocks, and what to leave out (people and animals move). */
export interface MapSource { scene: THREE.Object3D; skip: () => THREE.Object3D[] }

/** One world as a little model: its real ground, its river, its things, and the cloud over what you have not seen. */
interface Diorama {
  id: string;
  root: THREE.Group;
  terrain: THREE.Mesh;
  water: THREE.Group;
  props: THREE.Group;
  /** The parts the props were last built from, by mesh id, with their size (m). */
  parts: Map<number, number> | null;
  clouds: THREE.Mesh[];
  trail: THREE.Line | null;
  /** Relief is lifted a little on the flatter worlds so their hills read from afar. */
  K: number;
  /** Largest radius of the model, in planet radii. */
  maxR: number;
}

/** Props smaller than this (metres) vanish at map scale, so they are left out. */
const MIN_PART = 0.14;
/** Houses, trees and rocks are drawn a little larger than life, the way a model village is. */
const PROP_SCALE = 1.45;

const CLOUD_VERT = /* glsl */ `
  varying vec3 vDir; varying vec3 vN; varying vec3 vView;
  void main() {
    vDir = normalize(position);
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D uKnown; uniform float uTime; uniform vec3 uLight; uniform float uScale; uniform float uLo; uniform float uHi;
  uniform float uSpeed; uniform float uAlpha; uniform vec3 uLit; uniform vec3 uMid; uniform vec3 uShade; uniform float uSeed;
  varying vec3 vDir; varying vec3 vN; varying vec3 vView;
  float h3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++) { a += w * n3(p); p = p * 2.07 + vec3(1.7, 9.2, 4.1); w *= 0.48; } return a; }
  void main() {
    float lat = acos(clamp(vDir.y, -1.0, 1.0));
    float lon = atan(vDir.z, vDir.x);
    float known = texture2D(uKnown, vec2(lon / 6.2831853 + 0.5, lat / 3.1415927)).r;
    // drifting: the noise turns slowly about the poles and churns a little
    float a = uTime * uSpeed; float c = cos(a), s = sin(a);
    vec3 q = vec3(c * vDir.x - s * vDir.z, vDir.y, s * vDir.x + c * vDir.z);
    float n = fbm(q * uScale + vec3(uSeed, uTime * 0.025, uSeed * 0.5));
    float veil = 1.0 - known;
    float cover = smoothstep(uLo, uHi, veil * 1.18 - 0.12 + (n - 0.5) * 0.9);
    if (cover < 0.004) discard;
    // puffy shading: thick parts are the lit tops, thin edges sink into lavender shadow
    float l = clamp(dot(normalize(vN), uLight) * 0.75 + 0.32, 0.0, 1.0);
    float body = clamp((n - 0.32) * 2.2, 0.0, 1.0);
    vec3 col = mix(uShade, uMid, smoothstep(0.0, 0.55, l * 0.6 + body * 0.5));
    col = mix(col, uLit, smoothstep(0.45, 1.0, l * 0.55 + body * 0.6));
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vView)));
    col += vec3(1.0, 0.86, 0.78) * pow(rim, 3.0) * 0.18;
    gl_FragColor = vec4(col, cover * uAlpha);
  }`;

/** The model's colour grade: a little richer and warmer than life, like a painted miniature. */
const GRADE = 'gl_FragColor.rgb = mix(vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114))), gl_FragColor.rgb, 1.22) * vec3(1.05, 1.03, 0.98);';

const GLOW_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vView;
  void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
/** A back-face shell: brightest just outside the ground, fading out into the sky. */
const GLOW_FRAG = /* glsl */ `
  uniform vec3 uCol; uniform float uPow; uniform float uK;
  varying vec3 vN; varying vec3 vView;
  void main() { float f = abs(dot(normalize(vN), normalize(vView))); float a = pow(f, uPow) * uK; gl_FragColor = vec4(uCol * a, a); }`;

/**
 * The map: the world itself as a small model on a turntable. Its real ground with its real colours, the river,
 * the houses, trees and rocks where they stand, lit softly and floating over a painted sky. Places you have not
 * been sit under drifting cloud that clears as you explore. North is the spring, south is the edge.
 * Each world's model is built once (the ground's colours are shared with the real ground, so snow and thaw show).
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
  /** Where the houses and trees are found; set by the game. Without it the map shows the ground and river only. */
  source: MapSource | null = null;

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
  private backdrop: HTMLCanvasElement;
  private backdropKey = '';
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  private globe = new THREE.Group();
  private glow: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private models = new Map<string, Diorama>();
  private model: Diorama | null = null;
  private knownTex = new THREE.DataTexture(new Uint8Array(KW * KH * 4), KW, KH);
  private cloudUniforms = { uTime: { value: 0 }, uLight: { value: new THREE.Vector3(-0.45, 0.55, 0.7).normalize() }, uKnown: { value: this.knownTex } };
  private markers: Marker[] = [];
  private planet: Planet | null = null;
  private player: { dir: THREE.Vector3; facing: THREE.Vector3 } | null = null;
  private owned = new Set<string>();
  private yaw = 0; private pitch = 0; private dist = 4.4;
  private distMin = 2; private distMax = 5;
  private spin = { yaw: 0, pitch: 0 };
  private turnAnim: { y0: number; p0: number; y1: number; p1: number; t: number } | null = null;
  private dirty = true;
  private raf = 0;
  private keys = new Set<string>();
  private lastT = 0;
  private lastDraw = 0;
  private roseAngle = 0;
  private terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private propMat: THREE.MeshLambertMaterial;
  private cardMats = new Map<THREE.Texture, THREE.MeshLambertMaterial>();
  /** How often (ms) the drifting cloud is redrawn while nothing else moves. Playtests in a slow browser raise it. */
  driftMs = 66;
  /** Milliseconds the last globe draw took (for the cost check). */
  lastDrawMs = 0;
  /** Milliseconds the last opening took (building or refreshing the model, the veil and the markers). */
  openMs = 0;
  /** Of that, milliseconds spent finishing the world's model (zero once it was built in idle moments). */
  modelMs = 0;
  /** Of that, milliseconds spent gathering the houses, trees and rocks (zero when nothing changed). */
  propsMs = 0;

  constructor(private landmarks: Landmark[]) {
    this.el = document.createElement('div');
    this.el.className = 'overlay globeoverlay hidden';
    this.el.innerHTML = `<canvas class="globebackdrop"></canvas><div class="globesheet">
      <h2 class="mt"></h2>
      <div class="globestage"><div class="globeshadow"></div><div class="globehalo"></div><div class="globemarks"></div></div>
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
    this.backdrop = this.el.querySelector('.globebackdrop')!;
    this.stage = this.el.querySelector('.globestage')!;
    this.markerLayer = this.el.querySelector('.globemarks')!;
    this.rose = this.el.querySelector('.globerose svg')!;
    document.getElementById('ui')!.append(this.el);
    this.scene.add(this.globe);
    // soft light: a cool sky above, warm bounce below, a low warm sun from the upper left
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x9a7f8c, 1.55));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.1); sun.position.copy(this.cloudUniforms.uLight.value).multiplyScalar(5); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.45); fill.position.set(3, -1, 2); this.scene.add(fill);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uCol: { value: new THREE.Color('#ffe2c8') }, uPow: { value: 2.2 }, uK: { value: 0.55 } },
    }));
    this.glow.renderOrder = -1;
    this.scene.add(this.glow);
    this.knownTex.wrapS = THREE.RepeatWrapping; this.knownTex.magFilter = this.knownTex.minFilter = THREE.LinearFilter; this.knownTex.generateMipmaps = false;
    this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.veiled(this.propMat, true);
    this.terrainMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + GRADE); };
    this.terrainMat.customProgramCacheKey = () => 'mapground';
    (this.el.querySelector('[data-g="nilo"]') as HTMLElement).onclick = e => { e.stopPropagation(); if (this.player) this.turnTo(this.player.dir); };
    (this.el.querySelector('[data-g="task"]') as HTMLElement).onclick = e => { e.stopPropagation(); if (this.task) this.turnTo(this.localDir(this.task.dir)); };
    this.bindPointer();
    addEventListener('keydown', e => { if (this.open && e.code.startsWith('Arrow')) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('resize', () => { if (this.open) { this.paintBackdrop(); this.dirty = true; } });
  }

  /**
   * Things standing where you have not been stay hidden under the cloud (they would poke through it otherwise).
   * `glow` adds the per-vertex glow of lamps and windows.
   */
  private veiled(mat: THREE.MeshLambertMaterial, glow: boolean) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uKnown = this.cloudUniforms.uKnown;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLocal;${glow ? '\nattribute float glow; varying float vGlow;' : ''}`)
        .replace('#include <color_vertex>', `#include <color_vertex>\nvLocal = position;${glow ? '\nvGlow = glow;' : ''}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform sampler2D uKnown; varying vec3 vLocal;${glow ? '\nvarying float vGlow;' : ''}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec3 kd = normalize(vLocal);
          float kn = texture2D(uKnown, vec2(atan(kd.z, kd.x) / 6.2831853 + 0.5, acos(clamp(kd.y, -1.0, 1.0)) / 3.1415927)).r;
          if (kn < 0.5) discard;`)
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + GRADE)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${glow ? '\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.9;' : ''}`);
    };
    mat.customProgramCacheKey = () => 'mapveil' + (glow ? 'g' : '');
    return mat;
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

  // ------------------------------------------------------------------ the model
  /** Planet-local unit direction of a world position (or of a direction that is already local). */
  private localDir(v: THREE.Vector3) {
    if (!this.planet) return v.clone().normalize();
    return v.lengthSq() > 4 ? v.clone().sub(this.planet.center).normalize() : v.clone().normalize();
  }

  /** Relief lift for a world: the tall peaks stay as they are, flat worlds get their hills raised a little. */
  private reliefOf(p: Planet) { return Math.max(1.1, Math.min(1.7, 14 / p.cfg.amplitude)); }
  /** Model radius (in planet radii) for a real distance from the planet's center. */
  private lifted(p: Planet, K: number, r: number) { return (p.R + (r - p.R) * K) / p.R; }
  /** Model radius of the ground under a direction. */
  private groundAt(dir: THREE.Vector3) {
    const p = this.planet!, m = this.model;
    const r = p.surfaceRadius(dir);
    const water = p.cfg.ocean ? p.R + p.cfg.ocean : -Infinity;
    return this.lifted(p, m?.K ?? 1, Math.max(r, water));
  }

  private warming = new Set<string>();
  /**
   * Build a world's model in idle moments while you walk, one piece per moment (the map's own drawing surface,
   * the ground, then each cloud blanket), so opening the map never stalls and walking never hitches.
   */
  private warmLater(p: Planet) {
    const m = this.models.get(p.cfg.id);
    if ((m && m.clouds.length >= 2) || this.warming.has(p.cfg.id)) return;
    this.warming.add(p.cfg.id);
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const go = () => {
      if (!this.warming.has(p.cfg.id)) return;
      this.warming.delete(p.cfg.id);
      if (!this.renderer) this.ensureRenderer();
      else { const mm = this.models.get(p.cfg.id); if (!mm) this.modelFor(p, false); else if (mm.clouds.length < 2) this.addCloud(p, mm); }
      this.warmLater(p);
    };
    if (ric) ric(go, { timeout: 2000 }); else setTimeout(go, 300);
  }

  /** The ground, river and cloud blankets of one world. The houses and trees are gathered when the map opens. */
  private modelFor(p: Planet, whole = true): Diorama {
    let m = this.models.get(p.cfg.id);
    if (!m) {
      const K = this.reliefOf(p), R = p.R;
      const root = new THREE.Group(); root.scale.setScalar(1 / R);
      // the ground: the real terrain's shape (relief lifted by K) and its very colour buffer, shared, so snow shows
      const src = p.terrain.geometry as THREE.BufferGeometry;
      const sp = src.attributes.position as THREE.BufferAttribute;
      const pos = new Float32Array(sp.count * 3), v = new THREE.Vector3();
      let maxR = 0;
      for (let i = 0; i < sp.count; i++) {
        v.fromBufferAttribute(sp, i); const r = v.length(), r2 = R + (r - R) * K;
        v.multiplyScalar(r2 / r); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        if (r2 > maxR) maxR = r2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', src.attributes.color);
      geo.setIndex(src.index);
      geo.computeVertexNormals();
      const terrain = new THREE.Mesh(geo, this.terrainMat);
      root.add(terrain);
      const water = new THREE.Group(); root.add(water);
      const props = new THREE.Group(); root.add(props);
      if (p.cfg.ocean) maxR = Math.max(maxR, R + p.cfg.ocean * K);
      m = { id: p.cfg.id, root, terrain, water, props, parts: null, clouds: [], trail: null, K, maxR: maxR / R + 4.4 / R };
      this.models.set(p.cfg.id, m);
    }
    while (whole && m.clouds.length < 2) this.addCloud(p, m);
    return m;
  }
  /** The cloud: two blankets laid over the ground, following its shape smoothed out, puffs drawn in the shader. */
  private addCloud(p: Planet, m: Diorama) {
    const layer = m.clouds.length;
    const c = this.cloudShell(p, m.terrain.geometry as THREE.BufferGeometry, m.K, layer ? 4.4 : 2.6, layer);
    m.clouds.push(c); m.root.add(c);
  }

  /** A cloud blanket: the ground smoothed a few times and lifted by `above` metres. */
  private cloudShell(p: Planet, ground: THREE.BufferGeometry, K: number, above: number, layer: number) {
    const gp = ground.attributes.position as THREE.BufferAttribute, idx = ground.index!.array, n = gp.count;
    let rad = new Float32Array(n);
    const floor = p.R + Math.max(p.cfg.ocean ?? -99, p.cfg.riverBed + 1.5) * K;
    for (let i = 0; i < n; i++) rad[i] = Math.max(floor, Math.hypot(gp.getX(i), gp.getY(i), gp.getZ(i)));
    // smooth over the triangle neighbours, keeping some of each peak so tall ridges stay under
    const sum = new Float32Array(n), cnt = new Float32Array(n);
    for (let it = 0; it < 7; it++) {
      sum.fill(0); cnt.fill(0);
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        sum[a] += rad[b] + rad[c]; cnt[a] += 2; sum[b] += rad[a] + rad[c]; cnt[b] += 2; sum[c] += rad[a] + rad[b]; cnt[c] += 2;
      }
      const nx = new Float32Array(n);
      for (let i = 0; i < n; i++) nx[i] = Math.max(sum[i] / Math.max(1, cnt[i]), rad[i] * 0.55 + (sum[i] / Math.max(1, cnt[i])) * 0.45);
      rad = nx;
    }
    const pos = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(gp, i).normalize().multiplyScalar(rad[i] + above); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(ground.index);
    geo.computeVertexNormals();
    const look = layer === 0
      ? { uScale: 3.2, uLo: 0.18, uHi: 0.7, uSpeed: 0.012, uAlpha: 0.9, uSeed: 3.1 }
      : { uScale: 5.5, uLo: 0.42, uHi: 0.82, uSpeed: 0.02, uAlpha: 0.93, uSeed: 11.7 };
    const mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        ...this.cloudUniforms,
        uScale: { value: look.uScale }, uLo: { value: look.uLo }, uHi: { value: look.uHi }, uSpeed: { value: look.uSpeed }, uAlpha: { value: look.uAlpha }, uSeed: { value: look.uSeed },
        uLit: { value: new THREE.Color('#fff7ec') }, uMid: { value: new THREE.Color('#f3dce6') }, uShade: { value: new THREE.Color('#a4a8d8') },
      },
    });
    // ShaderMaterial colours are written as they are: keep them in sRGB
    for (const k of ['uLit', 'uMid', 'uShade']) (mat.uniforms[k].value as THREE.Color).convertLinearToSRGB();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3 + layer;
    return mesh;
  }

  /** The river (and the sea, on the sea world) as they are now, lifted like the ground. */
  private buildWater(p: Planet, m: Diorama) {
    for (const c of m.water.children) (c as THREE.Mesh).geometry.dispose();
    m.water.clear();
    const lift = (src: THREE.BufferGeometry, color: THREE.ColorRepresentation, order: number) => {
      const sp = src.attributes.position as THREE.BufferAttribute, pos = new Float32Array(sp.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < sp.count; i++) { v.fromBufferAttribute(sp, i); const r = v.length(), r2 = p.R + (r - p.R) * m.K + 0.08; v.multiplyScalar(r2 / r); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (src.index) g.setIndex(src.index);
      g.computeVertexNormals();
      const mat = new THREE.MeshPhongMaterial({ color, specular: 0x6a5a48, shininess: 40, emissive: new THREE.Color(color).multiplyScalar(0.28), transparent: true, opacity: 0.94, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = order; m.water.add(mesh);
    };
    const water = new THREE.Color(p.cfg.palette.water).lerp(new THREE.Color('#7fd0f2'), 0.25);
    if (p.ocean) lift(p.ocean.geometry as THREE.BufferGeometry, new THREE.Color(p.cfg.palette.waterDeep ?? p.cfg.palette.water).lerp(water, 0.5), 1);
    lift(p.water.geometry as THREE.BufferGeometry, water, 2);
  }

  /**
   * The houses, trees, rocks, bridges and fences of the world, copied as they stand into a few merged meshes.
   * People, animals and anything that floats are left out. Only rebuilt when what is there has changed.
   */
  private buildProps(p: Planet, m: Diorama) {
    if (!this.source) return;
    const t0 = performance.now();
    const skip = new Set(this.source.skip());
    const C = p.center, R = p.R;
    type Part = { mesh: THREE.Mesh; M: THREE.Matrix4; batch: THREE.Texture | null };
    const parts: Part[] = [];
    const seen = new Map<number, number>();
    const v = new THREE.Vector3(), b = new THREE.Vector3(), sph = new THREE.Sphere();
    const okMat = (mat: THREE.Material) => {
      if (!mat.visible || (mat as THREE.ShaderMaterial).isShaderMaterial) return false;
      const am = (mat as THREE.MeshLambertMaterial).alphaMap;
      if (mat.transparent && !am) return false;
      return true;
    };
    for (const root of this.source.scene.children) {
      if (!root.visible || skip.has(root)) continue;
      b.copy(root.position).sub(C);
      const rb = b.length();
      if (rb < R * 0.6 || rb > R * 1.7) continue;
      // things that float (birds, kites, cloud) are not part of the ground
      if (rb - p.surfaceRadius(v.copy(b).normalize()) > 6) continue;
      const mine: THREE.Mesh[] = [];
      const walk = (o: THREE.Object3D) => {
        if (!o.visible || skip.has(o)) return;
        const me = o as THREE.Mesh;
        if (me.isMesh && !(me as THREE.InstancedMesh).isInstancedMesh && !(me as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(me.material) && okMat(me.material)) mine.push(me);
        for (const c of o.children) walk(c);
      };
      walk(root);
      if (!mine.length) continue;
      // one group is scaled up about its foot, unless it is spread wide (a whole village, a fence line)
      let spread = 0;
      for (const me of mine) {
        if (!me.geometry.boundingSphere) me.geometry.computeBoundingSphere();
        sph.copy(me.geometry.boundingSphere!).applyMatrix4(me.matrixWorld);
        spread = Math.max(spread, sph.center.distanceTo(root.position) + sph.radius);
      }
      const whole = spread < 9;
      for (const me of mine) {
        sph.copy(me.geometry.boundingSphere!).applyMatrix4(me.matrixWorld);
        if (sph.radius < MIN_PART) continue;
        const foot = whole ? b : v.setFromMatrixPosition(me.matrixWorld).sub(C);
        const rf = foot.length();
        const lifted = foot.clone().multiplyScalar((R + (rf - R) * m.K) / rf);
        const s = whole ? 1 + (PROP_SCALE - 1) * Math.min(1, Math.max(0, (9 - spread) / 6)) : 1;
        // planet-local, then about the foot: scale up and lift with the ground
        const M = new THREE.Matrix4().makeTranslation(lifted.x, lifted.y, lifted.z)
          .multiply(new THREE.Matrix4().makeScale(s, s, s))
          .multiply(new THREE.Matrix4().makeTranslation(-foot.x - C.x, -foot.y - C.y, -foot.z - C.z))
          .multiply(me.matrixWorld);
        const am = (me.material as THREE.MeshLambertMaterial).alphaMap ?? null;
        parts.push({ mesh: me, M, batch: am });
        seen.set(me.id, sph.radius);
      }
    }
    // Rebuild only when something that shows has come or gone (a leaping fish or a blinking lamp does not count).
    const old = m.parts;
    let changed = !old;
    if (old) {
      for (const [id, r] of seen) if (!old.has(id) && r > 0.6) { changed = true; break; }
      if (!changed) for (const [id, r] of old) if (!seen.has(id) && r > 0.6) { changed = true; break; }
    }
    if (!changed) { this.propsMs = performance.now() - t0; return; }
    m.parts = seen;
    for (const c of m.props.children) (c as THREE.Mesh).geometry.dispose();
    m.props.clear();
    // merge into one mesh per kind: solid, and one for each leaf-card sheet
    const batches = new Map<THREE.Texture | null, Part[]>();
    for (const pt of parts) { const a = batches.get(pt.batch); if (a) a.push(pt); else batches.set(pt.batch, [pt]); }
    const col = new THREE.Color(), vc = new THREE.Color(), nm = new THREE.Matrix3(), n = new THREE.Vector3();
    for (const [tex, list] of batches) {
      let nv = 0, ni = 0;
      for (const pt of list) { const g = pt.mesh.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      if (nv === 0) continue;
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), G = new Float32Array(nv), UV = tex ? new Float32Array(nv * 2) : null;
      const I = new Uint32Array(ni);
      let ov = 0, oi = 0;
      for (const pt of list) {
        const g = pt.mesh.geometry, mat = pt.mesh.material as THREE.MeshLambertMaterial;
        const pa = g.attributes.position, na = g.attributes.normal, ca = mat.vertexColors ? g.attributes.color : undefined, ua = g.attributes.uv;
        nm.getNormalMatrix(pt.M);
        col.copy(mat.color ?? vc.set(1, 1, 1));
        const glow = (mat as THREE.Material).type === 'MeshBasicMaterial' ? 1 : 0;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(pt.M);
          P[(ov + i) * 3] = v.x; P[(ov + i) * 3 + 1] = v.y; P[(ov + i) * 3 + 2] = v.z;
          if (na) n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); else n.copy(v).normalize();
          N[(ov + i) * 3] = n.x; N[(ov + i) * 3 + 1] = n.y; N[(ov + i) * 3 + 2] = n.z;
          let r = col.r, gg = col.g, bb = col.b;
          if (ca) { r *= ca.getX(i); gg *= ca.getY(i); bb *= ca.getZ(i); }
          Cc[(ov + i) * 3] = r; Cc[(ov + i) * 3 + 1] = gg; Cc[(ov + i) * 3 + 2] = bb;
          G[ov + i] = glow;
          if (UV) { UV[(ov + i) * 2] = ua ? ua.getX(i) : 0.5; UV[(ov + i) * 2 + 1] = ua ? ua.getY(i) : 0.5; }
        }
        if (g.index) { const ia = g.index.array; for (let k = 0; k < ia.length; k++) I[oi + k] = ia[k] + ov; oi += ia.length; }
        else { for (let k = 0; k < pa.count; k++) I[oi + k] = ov + k; oi += pa.count; }
        ov += pa.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
      geo.setAttribute('glow', new THREE.BufferAttribute(G, 1));
      if (UV) geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      let mat: THREE.Material = this.propMat;
      if (tex) {
        let cm = this.cardMats.get(tex);
        if (!cm) { cm = this.veiled(new THREE.MeshLambertMaterial({ vertexColors: true, alphaMap: tex, alphaTest: 0.42, side: THREE.DoubleSide }), false); this.cardMats.set(tex, cm); }
        mat = cm;
      }
      m.props.add(new THREE.Mesh(geo, mat));
    }
    this.propsMs = performance.now() - t0;
  }

  /** The cloud veil: what you have walked, softened, plus map pieces people gave you, as a texture on the globe. */
  private paintKnown(p: Planet) {
    const fog = this.fog(p.cfg.id);
    const known = new Float32Array(FOG_W * FOG_H);
    for (let k = 0; k < known.length; k++) known[k] = fog[k] ? 1 : 0;
    const mine = this.areas ? [] : PIECES.filter(pc => pc.world === p.cfg.id && this.owned.has(pc.id));
    for (const pc of mine) for (let i = Math.floor(pc.lat[0] / 2); i < Math.ceil(pc.lat[1] / 2) && i < FOG_H; i++) for (let lo = pc.lon[0]; lo < pc.lon[1]; lo += 2) { const k = i * FOG_W + Math.floor(((lo + 540) % 360) / 2); known[k] = Math.max(known[k], 0.8); }
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
    const data = this.knownTex.image.data as Uint8Array;
    for (let y = 0; y < KH; y++) {
      const lat = (y + 0.5) / KH * 180, lonR = p.lonAtLat(lat);
      const fi = Math.min(FOG_H - 1.001, Math.max(0, lat / 2 - 0.5)), i0 = Math.floor(fi), ti = fi - i0;
      for (let x = 0; x < KW; x++) {
        const lon = (x + 0.5) / KW * 360 - 180;
        const off = wrapDeg(lon - lonR);
        const fj = ((off + 180) / 2 - 0.5 + FOG_W) % FOG_W, j0 = Math.floor(fj), tj = fj - j0, j1 = (j0 + 1) % FOG_W;
        const a = soft[i0 * FOG_W + j0] * (1 - tj) + soft[i0 * FOG_W + j1] * tj;
        const c = soft[(i0 + 1) * FOG_W + j0] * (1 - tj) + soft[(i0 + 1) * FOG_W + j1] * tj;
        const k = (y * KW + x) * 4;
        data[k] = Math.round(Math.min(1, (a * (1 - ti) + c * ti) * 1.6) * 255); data[k + 1] = data[k + 2] = 0; data[k + 3] = 255;
      }
    }
    this.knownTex.needsUpdate = true;
  }

  /** Footsteps walked (playtests record them), as a dotted line on the ground. */
  private buildTrail(p: Planet, m: Diorama) {
    if (m.trail) { m.root.remove(m.trail); m.trail.geometry.dispose(); m.trail = null; }
    if (this.trail.length < 2) return;
    const pts: THREE.Vector3[] = [];
    for (const t of this.trail) { const d = p.dirRiver(t.lat, t.lonOff); pts.push(d.multiplyScalar(this.groundAt(d) * p.R + 0.35)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xb04030, dashSize: 0.9, gapSize: 1.1, transparent: true, opacity: 0.85 }));
    line.computeLineDistances(); line.renderOrder = 5;
    m.trail = line; m.root.add(line);
  }

  // ------------------------------------------------------------------ the painted sky behind
  /** A painted evening sky in the world's colours: a soft gradient, a few stars, banks of gouache cloud below. */
  private paintBackdrop() {
    const p = this.planet; if (!p) return;
    const W = Math.max(320, Math.round(innerWidth / 2)), H = Math.max(200, Math.round(innerHeight / 2));
    const key = p.cfg.id + W + 'x' + H;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    const c = this.backdrop; c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const hex = (k: THREE.Color) => '#' + k.getHexString();
    const P = p.cfg.palette;
    const top = new THREE.Color(P.skyTop).lerp(new THREE.Color('#283070'), 0.55);
    const mid = new THREE.Color(P.skyTop).lerp(new THREE.Color('#9aa6e6'), 0.6);
    const rose = new THREE.Color(P.skyHorizon).lerp(new THREE.Color('#f4bcc6'), 0.5);
    const low = new THREE.Color(P.skyHorizon).lerp(new THREE.Color('#ffe4cc'), 0.55);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(top)); g.addColorStop(0.45, hex(mid)); g.addColorStop(0.72, hex(rose)); g.addColorStop(0.88, hex(low));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // a soft glow where the globe floats
    const gl = x.createRadialGradient(W * 0.42, H * 0.53, 0, W * 0.42, H * 0.53, H * 0.62);
    gl.addColorStop(0, 'rgba(255,238,222,.42)'); gl.addColorStop(0.55, 'rgba(255,226,220,.14)'); gl.addColorStop(1, 'rgba(255,220,214,0)');
    x.fillStyle = gl; x.fillRect(0, 0, W, H);
    // stars, fading into the light lower down
    for (let i = 0; i < 110; i++) {
      const sx = r() * W, sy = Math.pow(r(), 1.5) * H * 0.42, a = (0.3 + r() * 0.6) * (1 - sy / (H * 0.45)), rr = 0.35 + r() * 0.8;
      x.fillStyle = `rgba(255,250,236,${a.toFixed(3)})`; x.beginPath(); x.arc(sx, sy, rr, 0, Math.PI * 2); x.fill();
      if (r() < 0.06) { x.fillStyle = `rgba(255,248,230,${(a * 0.18).toFixed(3)})`; x.beginPath(); x.arc(sx, sy, rr * 4, 0, Math.PI * 2); x.fill(); }
    }
    // clouds are painted on their own layer and softened, like gouache laid wet
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const y = layer.getContext('2d')!;
    // high thin streaks
    for (let i = 0; i < 7; i++) {
      const wx = r() * W, wy = H * (0.1 + r() * 0.32), ww = W * (0.1 + r() * 0.16);
      y.fillStyle = `rgba(255,236,232,${(0.08 + r() * 0.1).toFixed(3)})`;
      y.beginPath(); y.ellipse(wx, wy, ww, ww * 0.035, 0, 0, Math.PI * 2); y.fill();
    }
    /** One cumulus: a dome of round puffs, a lavender shadow under a warm lit body, a flat soft base. */
    const cumulus = (cx: number, base: number, w: number, h: number, lit: THREE.Color, shade: THREE.Color, alpha: number) => {
      const puffs: [number, number, number][] = [];
      const n = Math.round(10 + w / 14);
      for (let i = 0; i < n; i++) {
        const t = r() * 2 - 1, px = cx + t * w * 0.5;
        const dome = Math.sqrt(Math.max(0, 1 - t * t));
        const pr = (0.22 + 0.35 * dome) * h * (0.7 + r() * 0.5);
        const py = base - dome * h * (0.35 + r() * 0.3) - pr * 0.2;
        puffs.push([px, py, pr]);
      }
      puffs.sort((a, b) => a[1] - b[1]);
      y.save(); y.globalAlpha = alpha;
      y.beginPath(); y.rect(0, 0, W, base + h * 0.08); y.clip();
      for (const [px, py, pr] of puffs) { y.fillStyle = hex(shade); y.beginPath(); y.arc(px + pr * 0.1, py + pr * 0.14, pr, 0, Math.PI * 2); y.fill(); }
      for (const [px, py, pr] of puffs) {
        const gr = y.createLinearGradient(0, py - pr, 0, py + pr);
        gr.addColorStop(0, hex(lit.clone().lerp(new THREE.Color('#ffffff'), 0.35))); gr.addColorStop(0.55, hex(lit)); gr.addColorStop(1, hex(lit.clone().lerp(shade, 0.7)));
        y.fillStyle = gr; y.beginPath(); y.arc(px - pr * 0.06, py - pr * 0.08, pr * 0.86, 0, Math.PI * 2); y.fill();
      }
      y.restore();
    };
    // the sea of cloud the globe floats over: far rows small and pink, near rows big and bright
    const rows = [
      { yb: 0.85, h: 0.08, n: 10, lit: rose.clone().lerp(new THREE.Color('#ffe8e4'), 0.5), shade: mid.clone().lerp(rose, 0.5), a: 0.8 },
      { yb: 0.91, h: 0.1, n: 8, lit: low.clone().lerp(new THREE.Color('#fff4ea'), 0.55), shade: mid.clone().lerp(new THREE.Color('#d6bfe0'), 0.6), a: 0.92 },
      { yb: 0.99, h: 0.12, n: 6, lit: low.clone().lerp(new THREE.Color('#fff6ee'), 0.7), shade: new THREE.Color('#d4c2e2'), a: 1 },
    ];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const cx = (i + 0.5 + (r() - 0.5) * 0.6) / row.n * W, w = W / row.n * (1.5 + r() * 0.6);
        cumulus(cx, H * row.yb, w, H * row.h * (0.8 + r() * 0.5), row.lit, row.shade, row.a);
      }
      y.fillStyle = hex(row.lit.clone().lerp(row.shade, 0.55)); y.globalAlpha = row.a; y.fillRect(0, H * row.yb, W, H); y.globalAlpha = 1;
    }
    // two tall clouds at the sides, catching the light
    cumulus(W * 0.04, H * 0.86, W * 0.2, H * 0.3, low.clone().lerp(new THREE.Color('#fff2e6'), 0.6), mid.clone().lerp(new THREE.Color('#c8bce4'), 0.6), 0.9);
    cumulus(W * 0.97, H * 0.85, W * 0.16, H * 0.24, low.clone().lerp(new THREE.Color('#fff2e6'), 0.6), mid.clone().lerp(new THREE.Color('#c8bce4'), 0.6), 0.9);
    x.save(); x.filter = 'blur(0.6px)'; x.drawImage(layer, 0, 0); x.restore();
    // paper grain
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = (r() - 0.5) * 8; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    x.putImageData(img, 0, 0);
    this.glow.material.uniforms.uCol.value.copy(low).lerp(new THREE.Color('#fff0e0'), 0.4).convertLinearToSRGB();
  }

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
    this.add(`<b>N</b>`, 'pole north', new THREE.Vector3(0, 1, 0), 0.03);
    this.add(`<b>S</b>`, 'pole south', new THREE.Vector3(0, -1, 0), 0.03);
    // east and west beside wherever you are looking (placed each time the globe turns)
    this.add(`<b>E</b>`, 'pole ew east', new THREE.Vector3(1, 0, 0), 0.03, { always: true });
    this.add(`<b>W</b>`, 'pole ew west', new THREE.Vector3(-1, 0, 0), 0.03, { always: true });
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
    if (mine) this.add(`<svg viewBox="-12 -30 24 32" class="pinsvg"><path d="M0 0 C-3 -9 -10 -13 -10 -20 a10 10 0 0 1 20 0 C10 -13 3 -9 0 0 Z" fill="#d8665c" stroke="#5a2420" stroke-width="1.6"/><circle cy="-20" r="4" fill="#fff4ea"/></svg><span class="gl">Your pin</span>`, 'pin custom', mine, 0.004);
    if (this.task) this.add(`<svg viewBox="-12 -30 24 32" class="pinsvg"><path d="M0 0 C-3 -9 -10 -13 -10 -20 a10 10 0 0 1 20 0 C10 -13 3 -9 0 0 Z" fill="#f0bd4f" stroke="#6a4310" stroke-width="1.6"/><path d="M0 -26 l2 4 l4 .6 l-3 3 l.8 4 l-3.8 -2 l-3.8 2 l.8 -4 l-3 -3 l4 -.6 Z" fill="#fff6dc"/></svg><span class="gl task">${esc(this.task.label)}</span>`, 'pin task', this.localDir(this.task.dir), 0.004);
    if (this.player) this.add(`<div class="niloglow"></div><svg viewBox="-14 -16 28 30" class="nilosvg"><path d="M0 -15 L5 -7" class="nose"/><path d="M0 -12 C8 -12 10 -2 9 9 C4 12 -4 12 -9 9 C-10 -2 -8 -12 0 -12 Z" fill="#284a66" stroke="#10202e" stroke-width="1.4"/><path d="M0 -6 C5 -6 6 0 5 4 C2 6 -2 6 -5 4 C-6 0 -5 -6 0 -6 Z" fill="#0d1620"/><circle cx="-2.2" cy="-1" r="1.4" fill="#ffe9a8"/><circle cx="2.2" cy="-1" r="1.4" fill="#ffe9a8"/></svg>`, 'nilo', this.player.dir, 0.006, { turn: this.player.facing });
    // each marker sits on the ground under it (poles and E / W ride just outside the model)
    for (const mk of this.markers) mk.lift += mk.el.classList.contains('ew') ? (this.model?.maxR ?? 1.1) - 1 : this.groundAt(mk.dir) - 1;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ drawing
  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'globecanvas';
    this.stage.insertBefore(this.renderer.domElement, this.markerLayer);
  }

  private size() { return Math.round(Math.min(640, innerHeight * 0.74, innerWidth * 0.62)); }

  /** Orient the globe so that a planet-local direction faces you, north up. */
  private anglesFor(d: THREE.Vector3) {
    const yaw = -Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    return { yaw, pitch: Math.max(-1.45, Math.min(1.45, pitch)) };
  }
  turnTo(d: THREE.Vector3, instant = false) {
    const a = this.anglesFor(d);
    this.spin.yaw = this.spin.pitch = 0;
    if (instant) { this.yaw = a.yaw; this.pitch = a.pitch; this.turnAnim = null; this.dirty = true; return; }
    const dy = wrapDeg((a.yaw - this.yaw) / D2R) * D2R;
    this.turnAnim = { y0: this.yaw, p0: this.pitch, y1: this.yaw + dy, p1: a.pitch, t: 0 };
  }

  private applyView() {
    this.globe.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'XYZ'));
    this.globe.updateMatrixWorld(true);
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
    if (!this.renderer || !this.planet || !this.model) return;
    const t0 = performance.now();
    const S = this.size();
    if (this.stage.style.width !== S + 'px') { this.stage.style.width = this.stage.style.height = S + 'px'; this.renderer.setSize(S, S, false); this.renderer.domElement.style.width = this.renderer.domElement.style.height = S + 'px'; }
    this.applyView();
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
      // markers fade out toward the lens's edge when zoomed in
      const rr = Math.hypot(q.x - S / 2, q.y - S / 2) / (S / 2);
      const vis = Math.max(0, Math.min(1, q.facing * 9 / (1 + m.lift), (1.0 - rr) / 0.12));
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
    if (kx || ky) { this.turnAnim = null; this.spin.yaw = this.spin.pitch = 0; this.yaw -= kx * dt * 1.6; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - ky * dt * 1.4)); this.dirty = true; }
    if (this.turnAnim) {
      const a = this.turnAnim; a.t = Math.min(1, a.t + dt / 0.8);
      const e = a.t * a.t * (3 - 2 * a.t);
      this.yaw = a.y0 + (a.y1 - a.y0) * e; this.pitch = a.p0 + (a.p1 - a.p0) * e;
      if (a.t >= 1) this.turnAnim = null;
      this.dirty = true;
    } else if (!this.dragging && (Math.abs(this.spin.yaw) > 1e-3 || Math.abs(this.spin.pitch) > 1e-3)) {
      // a flung globe keeps turning a little, like a real one on its stand
      this.yaw += this.spin.yaw * dt; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + this.spin.pitch * dt));
      const k = Math.exp(-dt * 3.2); this.spin.yaw *= k; this.spin.pitch *= k;
      this.dirty = true;
    }
    // the cloud drifts: redraw a few times a second when nothing else moves
    const t = now / 1000;
    this.cloudUniforms.uTime.value = t;
    // (on a slow machine it drifts in fewer, calmer steps so turning the globe stays smooth)
    if (!this.dirty && now - this.lastDraw > Math.max(this.driftMs, this.lastDrawMs * 6)) this.dirty = true;
    if (this.dirty) { this.dirty = false; this.lastDraw = now; this.render(); }
    this.raf = requestAnimationFrame(this.tick);
  };

  private dragging = false;
  private bindPointer() {
    let down: { x: number; y: number; yaw: number; pitch: number; moved: boolean; lx: number; ly: number; lt: number } | null = null;
    this.stage.addEventListener('pointerdown', e => {
      e.stopPropagation();
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() };
      this.turnAnim = null; this.spin.yaw = this.spin.pitch = 0; this.dragging = true;
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
      const now = performance.now(), dtm = Math.max(8, now - down.lt) / 1000;
      this.spin.yaw = this.spin.yaw * 0.5 + 0.5 * (e.clientX - down.lx) * k / dtm;
      this.spin.pitch = this.spin.pitch * 0.5 + 0.5 * (e.clientY - down.ly) * k / dtm;
      down.lx = e.clientX; down.ly = e.clientY; down.lt = now;
      this.dirty = true;
    });
    this.stage.addEventListener('pointerup', e => {
      if (!down) return;
      const wasClick = !down.moved;
      if (performance.now() - down.lt > 120) this.spin.yaw = this.spin.pitch = 0;
      down = null; this.dragging = false;
      if (wasClick) { this.spin.yaw = this.spin.pitch = 0; this.clickAt(e.clientX, e.clientY); }
    });
    this.stage.addEventListener('click', e => e.stopPropagation());
    this.stage.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); this.dist = Math.max(this.distMin, Math.min(this.distMax, this.dist * (1 + Math.sign(e.deltaY) * 0.08))); this.dirty = true; }, { passive: false });
  }

  /** Click on the globe: drop your pin, move it, or lift it if you clicked the pin itself. */
  clickAt(clientX: number, clientY: number) {
    if (!this.planet || !this.model) return;
    const r = this.stage.getBoundingClientRect(), S = this.size();
    const x = clientX - r.left, y = clientY - r.top;
    const id = this.planet.cfg.id;
    const mine = this.customPin(id);
    if (mine) { const q = this.project(mine, this.groundAt(mine) - 1 + 0.004, S); if (q.facing > 0 && Math.hypot(q.x - x, q.y - y + 14) < 18) { this.setPin(id, null); this.buildMarkers(); return; } }
    const ndc = new THREE.Vector2(x / S * 2 - 1, -(y / S * 2 - 1));
    this.applyView();
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObject(this.model.terrain, false);
    let hit: THREE.Vector3 | null = hits.length ? hits[0].point.clone() : null;
    if (!hit) hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (!hit) return;
    this.setPin(id, hit.applyQuaternion(this.globe.quaternion.clone().invert()).normalize());
    this.buildMarkers();
  }

  /**
   * Open the globe for a world. `player` is Nilo's planet-local up and facing; the task is a world position.
   * People and areas use lat / longitude-from-the-river, like the rest of the game.
   */
  draw(p: Planet, owned: Set<string>, player: { dir: THREE.Vector3; facing: THREE.Vector3 } | null) {
    const t0 = performance.now();
    const first = this.planet !== p;
    this.warming.delete(p.cfg.id);
    this.planet = p; this.owned = owned; this.player = player;
    (this.el.querySelector('.mt') as HTMLElement).textContent = p.cfg.name;
    this.ensureRenderer();
    const tm = performance.now();
    const m = this.modelFor(p);
    this.modelMs = performance.now() - tm;
    if (this.model !== m) { if (this.model) this.globe.remove(this.model.root); this.globe.add(m.root); this.model = m; }
    this.buildWater(p, m);
    this.buildProps(p, m);
    this.paintKnown(p);
    this.buildTrail(p, m);
    this.glow.scale.setScalar(m.maxR * 1.07);
    this.distMax = m.maxR / Math.sin(15 * D2R) * 1.16;
    this.distMin = m.maxR + 0.75;
    if (first) this.dist = this.distMax;
    this.dist = Math.max(this.distMin, Math.min(this.distMax, this.dist));
    this.buildMarkers();
    if (player) this.turnTo(player.dir, true); else if (first) this.turnTo(dirLatLon(40, p.lonAtLat(40)), true);
    (this.el.querySelector('[data-g="task"]') as HTMLElement).style.display = this.task ? '' : 'none';
    const leg = this.el.querySelector('.legend') as HTMLElement;
    const mine = this.areas ? [] : PIECES.filter(pc => pc.world === p.cfg.id && owned.has(pc.id));
    leg.innerHTML = this.areas
      ? (this.areas.length ? `Places you have been: ${this.areas.map(a => esc(a.name)).join(' &middot; ')}.` : 'Nowhere named yet. Walk, and the clouds clear.')
      : (mine.length ? 'From people: ' + mine.map(m => esc(m.label)).join(' &middot; ') : 'Walk, and the clouds clear.');
    this.dirty = true;
    this.openMs = performance.now() - t0;
  }

  show(on: boolean) {
    this.open = on; this.el.classList.toggle('hidden', !on);
    if (on) this.paintBackdrop();
    if (on && !this.raf) { this.lastT = 0; this.dirty = true; this.raf = requestAnimationFrame(this.tick); }
    if (!on) { this.keys.clear(); this.spin.yaw = this.spin.pitch = 0; }
  }

  /** For playtests: turn the globe to look at a latitude / absolute longitude. */
  look(lat: number, lon: number, zoom?: number) { this.turnTo(dirLatLon(lat, lon), true); if (zoom) this.dist = Math.max(this.distMin, Math.min(this.distMax, zoom)); this.dirty = true; }
  /** For playtests: screen position (client px) of a planet-local direction on the globe. */
  screenOf(dir: THREE.Vector3) { const r = this.stage.getBoundingClientRect(), d = dir.clone().normalize(), q = this.project(d, this.groundAt(d) - 1, this.size()); return { x: r.left + q.x, y: r.top + q.y, facing: q.facing }; }
}
