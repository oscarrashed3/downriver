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
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
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
  x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { const cx = r() * S, cy = r() * S, rr = 20 + r() * 60; wrapped(S, cx, cy, rr, (X, Y) => blot(x, X, Y, rr, r() > 0.5 ? '232,220,196' : '255,252,244', 0.45)); }
  // exposed stone patches
  for (let p = 0; p < 4; p++) {
    const px = r() * S, py = r() * S, pr = 30 + r() * 40;
    const stones: [number, number, number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * pr;
      stones.push([px + Math.cos(a) * d, py + Math.sin(a) * d * 0.8, 9 + r() * 12, 6 + r() * 8, 0.88 + r() * 0.12]);
    }
    for (const [sx, sy, rw, rh, v] of stones) wrapped(S, sx, sy, rw + 4, (X, Y) => {
      // a dark mortar halo, then the stone face, then a light top edge
      x.fillStyle = 'rgba(200,182,150,0.3)'; stoneShape(x, r, X, Y + 1, rw + 2, rh + 2); x.fill();
      const c = Math.round(246 * v), c2 = Math.round(236 * v), c3 = Math.round(216 * v);
      x.fillStyle = `rgb(${c},${c2},${c3})`; stoneShape(x, r, X, Y, rw, rh); x.fill();
      x.fillStyle = 'rgba(255,250,236,0.6)'; stoneShape(x, r, X - rw * 0.1, Y - rh * 0.25, rw * 0.6, rh * 0.45); x.fill();
    });
  }
  // speckle and pits
  for (let i = 0; i < 2600; i++) {
    const v = r();
    x.fillStyle = v > 0.5 ? `rgba(160,135,105,${0.12 + r() * 0.2})` : `rgba(255,255,250,${0.2 + r() * 0.3})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  // weather streaks running down
  for (let i = 0; i < 10; i++) {
    const sx = r() * S, w = 6 + r() * 16, h = 80 + r() * 160, sy = r() * S;
    const g = x.createLinearGradient(0, sy, 0, sy + h); g.addColorStop(0, 'rgba(170,150,120,0.16)'); g.addColorStop(1, 'rgba(170,150,120,0)');
    x.fillStyle = g; x.fillRect(sx, sy, w, h);
  }
  // hairline cracks
  x.strokeStyle = 'rgba(120,96,76,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) { let px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 22; py += 6 + r() * 12; x.lineTo(px, py); } x.stroke(); }
}));

/** Dry-laid cream stones: rounded blocks in courses with deep joints (footings, steps, bridge piers). STONE_TILE metres. */
export const STONE_TILE = 1.6;
export const stoneTex = () => onceTex('stone', () => canvasTex(256, 33, (x, r) => {
  const S = 256;
  x.fillStyle = '#8c7a66'; x.fillRect(0, 0, S, S);
  const rows = 6, h = S / rows;
  for (let j = 0; j < rows; j++) {
    let cx = (j % 2) * 20 - 10;
    while (cx < S + 20) {
      const w = 34 + r() * 30, v = 0.78 + r() * 0.24;
      const px = cx + w / 2, py = j * h + h / 2;
      wrapped(S, px, py, w, (X, Y) => {
        x.fillStyle = `rgb(${Math.round(250 * v)},${Math.round(238 * v)},${Math.round(215 * v)})`;
        x.beginPath(); x.roundRect(X - w / 2 + 2, Y - h / 2 + 2, w - 4, h - 4, 9); x.fill();
        x.fillStyle = 'rgba(255,252,240,0.45)'; x.beginPath(); x.roundRect(X - w / 2 + 5, Y - h / 2 + 4, w - 12, h * 0.35, 6); x.fill();
        x.fillStyle = 'rgba(120,100,80,0.18)'; x.fillRect(X - w / 2 + 3, Y + h * 0.18, w - 6, h * 0.2);
      });
      cx += w;
    }
  }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(110,90,70,${0.1 + r() * 0.15})`; x.fillRect(r() * S, r() * S, 1 + r() * 2, 1); }
  for (let i = 0; i < 10; i++) { const cx = r() * S, cy = r() * S; wrapped(S, cx, cy, 20, (X, Y) => blot(x, X, Y, 8 + r() * 12, '120,150,80', 0.35)); }
}));

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

/** Linen weave: very faint threads, for sheets, sails and awnings. */
export const linenTex = () => onceTex('linen', () => canvasTex(128, 57, (x, r) => {
  const S = 128;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) { x.fillStyle = `rgba(150,140,120,${0.04 + r() * 0.05})`; x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
  for (let i = 0; i < 12; i++) { const cx = r() * S, cy = r() * S; wrapped(S, cx, cy, 30, (X, Y) => blot(x, X, Y, 14 + r() * 16, '220,210,190', 0.25)); }
}));

// ---------------------------------------------------------------- materials

export type MatKind = 'wall' | 'stone' | 'wood' | 'plain' | 'bloom' | 'slate' | 'brass' | 'silver' | 'glass' | 'canvas' | 'cloth' | 'leaf';

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
function metalSheen(mat: THREE.MeshToonMaterial, glint: number, sheen: string) {
  return chainCompile(mat, 'metal' + glint, (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunCol;').replace('#include <opaque_fragment>', `
      {
        vec3 mR = reflect(-pV, pN);
        float mG = smoothstep(0.86, 0.97, dot(mR, uSun));
        float mS = smoothstep(-0.2, 0.9, mR.y) * pow(1.0 - clamp(dot(pN, pV), 0.0, 1.0), 1.5);
        outgoingLight += uSunCol * mG * ${glint.toFixed(2)} + vec3(${new THREE.Color(sheen).toArray().map(v => v.toFixed(3)).join(',')}) * mS * 0.45;
      }
      #include <opaque_fragment>`);
  });
}

let leafMatRef: THREE.Material | null = null;
/** The leaf-card material from the shared foliage code, white so vertex colours set each clump's green. */
export function leafMat(): THREE.Material {
  if (!leafMatRef) leafMatRef = (leafClump({ radius: 1, color: '#ffffff', cards: 1, core: false }).children[0] as THREE.Mesh).material as THREE.Material;
  return leafMatRef;
}

const matCache = new Map<MatKind, THREE.Material>();
/** The shared Sailtown materials. All take their base colour from vertex colours. */
export function townMat(kind: MatKind): THREE.Material {
  let m = matCache.get(kind);
  if (m) return m;
  const base = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: softRamp(), vertexColors: true, ...o });
  switch (kind) {
    case 'wall': m = paint(base({ map: wallTex() }), { variation: 0.5 }); break;
    case 'stone': m = paint(base({ map: stoneTex() }), { variation: 0.6 }); break;
    case 'wood': m = paint(base({ map: grainTex() }), { variation: 0.5 }); break;
    case 'plain': m = paint(base(), { variation: 0.5 }); break;
    // small flora and trinkets: never inked (a hull would swallow a 5 cm bloom), lit from both sides
    case 'bloom': m = paint(base({ side: THREE.DoubleSide }), { variation: 0.3, rim: 1.4 }); break;
    case 'slate': m = paint(base(), { variation: 0.9, rim: 1.2 }); break;
    case 'brass': m = metalSheen(paint(base(), { variation: 0.2, rim: 1.6 }), 1.6, '#fff1c8'); break;
    case 'silver': m = metalSheen(paint(base(), { variation: 0.15, rim: 1.4 }), 1.5, '#e8f2ff'); break;
    case 'glass': m = metalSheen(paint(base(), { variation: 0.1, rim: 0.6 }), 1.2, '#cfe6ff'); break;
    case 'canvas': m = paint(base({ map: linenTex(), side: THREE.DoubleSide }), { variation: 0.3, rim: 1.2 }); break;
    case 'cloth': m = windCloth(); break;
    case 'leaf': m = leafMat(); break;
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
  attribute vec3 aWave; attribute vec3 aDir;
  uniform float uTime; uniform vec3 uWind; uniform float uClothAmp;
  float clothWave(vec3 wp, out float shade){
    float ph = aWave.y;
    float k = mix(1.0, 2.2, aWave.z);
    float s1 = sin(uTime * 2.3 * k + ph + dot(wp, vec3(0.9, 0.5, 0.7)) - aWave.x * 2.6);
    float s2 = sin(uTime * 4.1 * k + ph * 1.7 + dot(wp, vec3(-0.6, 1.3, 0.4)) * 1.6 - aWave.x * 4.0);
    float gust = 0.7 + 0.3 * sin(uTime * 0.55 + ph * 0.3 + wp.x * 0.05);
    shade = 0.5 + 0.5 * (s1 * 0.6 + s2 * 0.4);
    return aWave.x * uClothAmp * gust * (0.55 + 0.35 * s1 + 0.18 * s2);
  }
`;
function clothDisplace(normalsToo: boolean) {
  return /* glsl */ `
    #include <begin_vertex>
    {
      vec4 cwp = modelMatrix * vec4(position, 1.0);
      float cShade;
      float cd = clothWave(cwp.xyz, cShade);
      // billow along aDir, and flutter sideways and lift a little, so the motion reads from any side
      vec3 cSide = cross(vec3(0.0, 1.0, 0.0), aDir);
      float cSL = length(cSide);
      cSide = cSL > 1e-4 ? cSide / cSL : vec3(1.0, 0.0, 0.0);
      float cFl = sin(uTime * 3.3 + aWave.y * 2.1 + cwp.y * 3.0 + cwp.x * 0.8) * aWave.x * uClothAmp;
      transformed += aDir * cd + cSide * cFl * 0.45 + vec3(0.0, abs(cd) * 0.35, 0.0);
      ${normalsToo ? `
      #ifdef USE_COLOR
        vColor.rgb *= mix(1.0, 0.8 + 0.3 * cShade, clamp(aWave.x * 3.0, 0.0, 1.0));
      #endif` : ''}
    }`;
}

/** Double-sided toon cloth, coloured by vertex colours, waving in the shader. */
export function windCloth(): THREE.MeshToonMaterial {
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: linenTex(), gradientMap: softRamp(), vertexColors: true, side: THREE.DoubleSide }), { variation: 0.3, rim: 1.3 });
  chainCompile(mat, 'cloth', (s) => {
    Object.assign(s.uniforms, CLOTH);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + CLOTH_GLSL)
      .replace('#include <begin_vertex>', clothDisplace(true));
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
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aWave', 'aDir'].includes(k)) g.deleteAttribute(k);
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
      // aDir is a direction in object space: rotate it with the part
      const full = m ? this.top().clone().multiply(m) : this.top();
      const nm = new THREE.Matrix3().setFromMatrix4(full);
      const d = g.attributes.aDir as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(d, i).applyMatrix3(nm); d.setXYZ(i, v.x, v.y, v.z); }
    } else {
      if (g.attributes.aWave) g.deleteAttribute('aWave');
      if (g.attributes.aDir) g.deleteAttribute('aDir');
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
      if (kind === 'leaf' || kind === 'cloth' || kind === 'glass' || kind === 'canvas' || kind === 'bloom') mesh.userData.noOutline = true;
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
export function clothGrid(w: number, h: number, nx: number, ny: number, col: (u: number, v: number) => THREE.Color, opts: { mask?: (u: number, v: number) => boolean; phase?: number; stiff?: number; weight?: (u: number, v: number) => number; dir?: THREE.Vector3 } = {}) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], cl: number[] = [], wav: number[] = [], dir: number[] = [], idx: number[] = [];
  const d = opts.dir ?? new THREE.Vector3(0, 0, 1);
  const W = opts.weight ?? ((_u: number, v: number) => Math.pow(v, 1.3));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
    if (opts.mask && !opts.mask((u0 + u1) / 2, (v0 + v1) / 2)) continue;
    const c = col((u0 + u1) / 2, (v0 + v1) / 2);
    const base = pos.length / 3;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
      pos.push((u - 0.5) * w, -v * h, 0); nor.push(0, 0, 1); uv.push(u * w / 0.6, v * h / 0.6);
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
  g.setIndex(idx);
  return g;
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
