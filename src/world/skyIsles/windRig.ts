import * as THREE from 'three';
import { paint, softRamp } from '../../render/paint';
import { clamp } from '../noise';

// The windfolk's skin: every static part of a character (body, clothes, hair, face, hat, tools) is merged
// into ONE skinned mesh whose bones are the Person's own joints (hips, torso, thighs, knees, shoulders,
// elbows, head...) plus the pivots the Sway springs move (braids, skirt, bag, ribbons). So:
//   - limbs are continuous tapered tubes that bend at the knee and elbow, with no capsule gaps,
//   - cloth near a joint (a skirt's waist, a sleeve at the elbow) blends smoothly between two bones,
//   - a whole character draws in 3 calls (cloth, skin and their ink), against ~50 for a World 1 villager.
// Colours ride in the vertices. Skin and face use their own softer toon ramp (no hard shade band across the
// face); the ink hull is skinned too, and every part sets its own ink width (0 = no line: eyes, stitches).

export type V3 = [number, number, number];
type Bone = THREE.Object3D;
export type Weights = (p: THREE.Vector3) => [Bone, number][];

export interface PartOpt {
  r?: V3;
  s?: number | V3;
  /** Orientation as a quaternion (overrides r). */
  q?: THREE.Quaternion;
  /** Ink width multiplier (1 = normal, 0 = none). */
  ink?: number;
  /** Draw with the soft skin ramp (skin, faces, eyes). */
  skin?: boolean;
  /** Blend this part between bones, from its position in the parent bone's frame. */
  w?: Weights;
  /** Also draw the inside (open coats, brims, sleeves): a back copy, its colour times this. */
  lining?: number;
}

interface Part { bone: Bone; g: THREE.BufferGeometry; color: THREE.Color; skin: boolean; ink: number; w?: Weights }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color(), _nm = new THREE.Matrix3();

export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Collects a character's parts per bone, then bakes them into one skinned mesh and its ink. */
export class RigKit {
  parts: Part[] = [];
  add(bone: Bone, geo: THREE.BufferGeometry, color: string | THREE.Color, x = 0, y = 0, z = 0, o: PartOpt = {}) {
    if (o.q) _q.copy(o.q); else { _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e); }
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(x, y, z), _q, _s);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.applyMatrix4(_m);
    if (_s.x * _s.y * _s.z < 0) flipWinding(g);
    this.parts.push({ bone, g, color: new THREE.Color(color), skin: !!o.skin, ink: o.ink ?? 1, w: o.w });
    if (o.lining !== undefined) {
      // the inside: the same surface turned inside out, a hair inwards, darker, without ink
      const b = g.clone(); flipWinding(b);
      const pa = b.attributes.position as THREE.BufferAttribute, na = b.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        _n.fromBufferAttribute(na, i);
        pa.setXYZ(i, pa.getX(i) - _n.x * 0.003, pa.getY(i) - _n.y * 0.003, pa.getZ(i) - _n.z * 0.003);
        na.setXYZ(i, -_n.x, -_n.y, -_n.z);
      }
      this.parts.push({ bone, g: b, color: new THREE.Color(color).multiplyScalar(o.lining), skin: !!o.skin, ink: 0, w: o.w });
    }
  }

  /**
   * Bake every part into one SkinnedMesh (two material groups, cloth and skin) and a skinned ink hull,
   * both added to `space` (the person's body). The bones must be in their bind (rest) pose.
   */
  bake(space: THREE.Object3D, root: THREE.Object3D, inkColor = '#3a2a2e', inkW = 0.0105) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const bones: Bone[] = [];
    const bi = (b: Bone) => { let i = bones.indexOf(b); if (i < 0) { bones.push(b); i = bones.length - 1; } return i; };
    const pos: number[] = [], nor: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], ink: number[] = [];
    const counts = [0, 0];
    for (const slot of [false, true]) for (const P of this.parts) {
      if (P.skin !== slot) continue;
      _m.multiplyMatrices(inv, P.bone.matrixWorld);
      _nm.getNormalMatrix(_m);
      const pa = P.g.attributes.position, na = P.g.attributes.normal, ca = P.g.attributes.color;
      const own = bi(P.bone);
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i);
        let ws: [number, number][] = [[own, 1]];
        if (P.w) {
          ws = P.w(_v).filter(([, w]) => w > 1e-3).map(([b, w]) => [bi(b), w] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 4);
          const tot = ws.reduce((a, [, w]) => a + w, 0) || 1;
          ws = ws.map(([b, w]) => [b, w / tot]);
          if (!ws.length) ws = [[own, 1]];
        }
        for (let j = 0; j < 4; j++) { si.push(ws[j]?.[0] ?? 0); sw.push(ws[j]?.[1] ?? 0); }
        _v.applyMatrix4(_m); pos.push(_v.x, _v.y, _v.z);
        _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); nor.push(_n.x, _n.y, _n.z);
        _c.copy(P.color); if (ca) _c.multiply(new THREE.Color(ca.getX(i), ca.getY(i), ca.getZ(i)));
        col.push(_c.r, _c.g, _c.b);
        ink.push(P.ink);
      }
      counts[slot ? 1 : 0] += pa.count;
      P.g.dispose();
    }
    this.parts = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('aInk', new THREE.Float32BufferAttribute(ink, 1));
    g.addGroup(0, counts[0], 0); g.addGroup(counts[0], counts[1], 1);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 3, 2));
    const mesh = new THREE.SkinnedMesh(g, [clothMaterial(), skinMaterial()]);
    mesh.castShadow = true; mesh.userData.noOutline = true;
    const hull = new THREE.SkinnedMesh(g, inkMaterial(inkColor, inkW));
    hull.userData.isOutline = true; hull.userData.noOutline = true;
    space.add(mesh, hull);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones as THREE.Bone[]);
    mesh.bind(skeleton);
    hull.bind(skeleton, mesh.bindMatrix);
    // the skinned bounds are set by hand (computing them walks every vertex through the bones)
    mesh.boundingSphere = g.boundingSphere.clone(); hull.boundingSphere = g.boundingSphere.clone();
    return { mesh, hull, bones: bones.length, triangles: pos.length / 9 };
  }
}

function flipWinding(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute, n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = a.array[(i + 1) * n + k]; (a.array as Float32Array)[(i + 1) * n + k] = a.array[(i + 2) * n + k]; (a.array as Float32Array)[(i + 2) * n + k] = t; }
  }
}

// ---------------------------------------------------------------- materials

let clothM: THREE.MeshToonMaterial | null = null, skinM: THREE.MeshToonMaterial | null = null;
/** Cloth, leather, straw, hair: the game's toon ramp and painted look, a little more brush variation. */
export function clothMaterial() {
  return (clothM ??= paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.FrontSide }), { variation: 0.75, rim: 0.55 }));
}
let skinRampT: THREE.DataTexture | null = null;
/** A gentler ramp for skin: the shade side of a face stays warm and light, so it reads as one soft shape. */
export function skinRamp() {
  if (skinRampT) return skinRampT;
  const N = 64, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1), s = (a: number, b: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const v = 0.5 + s(0.3, 0.42) * 0.3 + s(0.56, 0.66) * 0.2;
    data.set([Math.round(v * 255), Math.round(v * 255), Math.round(v * 255), 255], i * 4);
  }
  skinRampT = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  skinRampT.minFilter = THREE.LinearFilter; skinRampT.magFilter = THREE.LinearFilter; skinRampT.needsUpdate = true;
  return skinRampT;
}
export function skinMaterial() {
  return (skinM ??= paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: skinRamp() }), { variation: 0.12, rim: 0.7 }));
}

const inkMats = new Map<string, THREE.ShaderMaterial>();
/** The ink hull for a skinned mesh: pushed out along the skinned normal by the part's own width. */
export function inkMaterial(color: string, width: number) {
  const key = color + width;
  let m = inkMats.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uW: { value: width } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      attribute float aInk;
      uniform float uW;
      void main(){
        if (aInk < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed += normalize(objectNormal) * uW * aInk;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main(){ gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
  });
  inkMats.set(key, m);
  return m;
}

// ---------------------------------------------------------------- shapes

/** Small seeded random numbers, so a seed always makes the same thing. */
export function mulberry(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Cheap smooth 1D noise from a few sines (for hems, lumps and folds). */
export const wob = (x: number, s = 0) => Math.sin(x * 1.0 + s) * 0.5 + Math.sin(x * 2.3 + s * 1.7) * 0.3 + Math.sin(x * 5.1 + s * 2.9) * 0.2;

/** A lathe written top-down as [radius, y] pairs, seam at the back. Optional per-row colour multipliers. */
export function lathe(pts: [number, number][], n = 16, start = Math.PI, len = Math.PI * 2) {
  // top-down profiles wind inwards; reverse them so the faces point out
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)).reverse(), n, start, len);
}

export interface ClothOpt {
  n?: number;              // segments around
  start?: number; len?: number; // an open arc (coats open at the front)
  folds?: number;          // number of folds around
  amt?: number;            // fold depth, as a fraction of the radius, at the hem
  yTop?: number;           // folds start here and deepen down to the hem
  seed?: number;
  hem?: number;            // uneven hem: up/down jitter in metres
  lines?: number[];        // heights of stitched seams (thin dark lines)
  shade?: number;          // how much the fold valleys darken (vertex colour)
  hemLine?: boolean;       // a stitched hem band (default true)
  sz?: number;             // depth squash (bodies are not round)
  hemArc?: number;         // an open arc's hem curves up at its two ends by this much (aprons)
}
/**
 * Cloth: a lathe with folds that deepen to the hem, the valleys shaded darker in the vertex colours,
 * an uneven hem, and thin dark stitched seams and a hem band, so garments stop reading as plastic.
 */
export function cloth(prof: [number, number][], o: ClothOpt = {}) {
  const pts = prof.slice();
  const yBot = pts[pts.length - 1][1], yTop = o.yTop ?? pts[0][1];
  const lines = [...(o.lines ?? []), ...(o.hemLine === false ? [] : [yBot + 0.028])];
  const rowShade: number[] = pts.map(() => 1);
  // insert the seam rows: normal, dark, dark, normal
  for (const ly of lines) {
    let i = pts.findIndex(([, y], k) => k > 0 && y <= ly && pts[k - 1][1] >= ly);
    if (i < 0) continue;
    const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
    const at = (y: number): [number, number] => [r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1e-6)), y];
    const rows = [ly + 0.007, ly + 0.0045, ly - 0.0045, ly - 0.007].filter(y => y < y0 && y > y1);
    if (rows.length < 4) continue;
    pts.splice(i, 0, ...rows.map(at));
    rowShade.splice(i, 0, 1, 0.62, 0.62, 1);
  }
  const n = o.n ?? 20, start = o.start ?? Math.PI, len = o.len ?? Math.PI * 2;
  const g = lathe(pts, n, start, len);
  const P = pts.length;
  const pa = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pa.count * 3);
  const F = o.folds ?? 7, amt = o.amt ?? 0.06, seed = o.seed ?? 0, sh = o.shade ?? 0.22, hem = o.hem ?? 0.012, sz = o.sz ?? 1;
  // rows were reversed by lathe(): row j of the geometry is pts[P - 1 - j]
  for (let i = 0; i < pa.count; i++) {
    const row = P - 1 - (i % P);
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const a = Math.atan2(x, z);
    const k = clamp((yTop - y) / ((yTop - yBot) || 1));
    const f = Math.sin(a * F + seed) * 0.7 + Math.sin(a * (F * 2 + 1) + seed * 2) * 0.3;
    const sc = 1 + amt * k * f;
    let yy = y;
    // the hem rises and falls a little (the last rows move together, so the hem band follows it)
    if (y < yBot + 0.04) yy = y + wob(a * 3, seed) * hem * k;
    if (o.hemArc) { const mid = start + len / 2; let da = a - Math.atan2(Math.sin(mid), Math.cos(mid)); da = Math.atan2(Math.sin(da), Math.cos(da)); yy += o.hemArc * Math.pow(da / (len / 2), 2) * Math.pow(k, 3); }
    pa.setXYZ(i, x * sc, yy, z * sc * sz);
    const v = (1 + sh * k * Math.min(0, f) + sh * 0.35 * k * Math.max(0, f)) * rowShade[row];
    cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v * (v < 1 ? 0.97 : 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

const _t = new THREE.Vector3(), _sd = new THREE.Vector3(), _bn = new THREE.Vector3(), _up = new THREE.Vector3();
/**
 * A strand: a tapered tube along a smooth curve, flattened like a lock of hair or a ribbon.
 * `up(p)` gives the direction its broad face looks (e.g. away from the skull). Width falls to `tip` at the end.
 */
export function strand(pts: V3[], width: number, thick: number, o: { segs?: number; sides?: number; tip?: number; root?: number; up?: (p: THREE.Vector3) => THREE.Vector3; shade?: [number, number] } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const N = o.segs ?? 10, S = o.sides ?? 6, tip = o.tip ?? 0.0, root = o.root ?? 0.7;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const up = o.up ?? (() => _up.set(0, 0, 1));
  const [c0, c1] = o.shade ?? [1, 1];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const c = curve.getPointAt(u); curve.getTangentAt(u, _t);
    _bn.copy(up(c)).addScaledVector(_t, -_t.dot(up(c))).normalize();
    _sd.crossVectors(_t, _bn).normalize();
    // swell from the root, taper to the tip
    const wk = (u < 0.2 ? root + (1 - root) * (u / 0.2) : 1) * (1 - (1 - tip) * Math.pow(Math.max(0, (u - 0.2) / 0.8), 1.3));
    const v = c0 + (c1 - c0) * u;
    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const px = Math.cos(a) * width * 0.5 * wk, pz = Math.sin(a) * thick * 0.5 * Math.max(wk, 0.25);
      pos.push(c.x + _sd.x * px + _bn.x * pz, c.y + _sd.y * px + _bn.y * pz, c.z + _sd.z * px + _bn.z * pz);
      col.push(v, v, v);
    }
  }
  // caps: the root closed, the tip closed to a point
  const r0 = pos.length / 3; { const c = curve.getPointAt(0); pos.push(c.x, c.y, c.z); col.push(c0, c0, c0); }
  const r1 = pos.length / 3; { const c = curve.getPointAt(1); curve.getTangentAt(1, _t); pos.push(c.x + _t.x * 0.004, c.y + _t.y * 0.004, c.z + _t.z * 0.004); col.push(c1, c1, c1); }
  for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + (j + 1) % S, c = a + S, d = b + S;
    idx.push(a, c, b, b, c, d);
  }
  for (let j = 0; j < S; j++) { idx.push(r0, j, (j + 1) % S); idx.push(r1, N * S + (j + 1) % S, N * S + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A loop of wrapped cloth (a scarf round the neck): a torus whose tube swells and thins in lumps, squashed
 * to a band, with creases across it shaded darker. Lies flat (in the XZ plane), centred at the origin.
 */
export function wrapLoop(R: number, r: number, o: { seed?: number; lumps?: number; creases?: number; flat?: number; sx?: number; sz?: number } = {}) {
  const g = new THREE.TorusGeometry(R, r, 9, 30);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pa.count * 3);
  const seed = o.seed ?? 0, L = o.lumps ?? 3, C = o.creases ?? 9, fl = o.flat ?? 0.7;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const u = Math.atan2(y, x);
    const cx = Math.cos(u) * R, cy = Math.sin(u) * R;
    let dx = x - cx, dy = y - cy, dz = z;
    const lump = 1 + 0.28 * wob(u * L, seed);
    const crease = Math.pow(Math.abs(Math.sin(u * C * 0.5 + seed * 3 + dz / r * 0.8)), 3);
    const k = lump * (1 - 0.16 * crease);
    dx *= k; dy *= k; dz *= k * fl;
    pa.setXYZ(i, (cx + dx) * (o.sx ?? 1), cy + dy, dz);
    const v = 1 - 0.28 * crease;
    cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v;
  }
  g.rotateX(Math.PI / 2);
  if (o.sz) g.scale(1, 1, o.sz);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** A sphere pushed about by noise: a lumpy knot, a bun, a cloud of fleece. */
export function lump(r: number, amt = 0.18, seed = 0, w = 12, h = 9) {
  const g = new THREE.SphereGeometry(r, w, h);
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    _v.fromBufferAttribute(pa, i);
    const k = 1 + amt * wob(_v.x / r * 3 + _v.y / r * 2, seed) * wob(_v.z / r * 2.6 - _v.y / r, seed + 1.3);
    pa.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Weights for a limb tube in its upper bone's frame: upper bone, then the lower one past the joint at `jy`. */
export function limbWeights(upper: Bone, lower: Bone, jy: number, blend = 0.05, top?: Bone, topY = 0, topW = 0.4): Weights {
  return (p) => {
    const wl = smooth(jy + blend, jy - blend, p.y);
    const wt = top ? smooth(topY - 0.07, topY + 0.03, p.y) * topW : 0;
    const out: [Bone, number][] = [[upper, Math.max(0, 1 - wl - wt)], [lower, wl]];
    if (top) out.push([top, wt]);
    return out;
  };
}
