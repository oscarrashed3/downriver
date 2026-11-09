import * as THREE from 'three';
import { paint, softRamp } from '../../render/paint';
import { smoothstep } from '../noise';
import { TAU } from './islandShape';
import { gradeFoliage, toonMat } from './islandMaterials';

// Trees and bushes for the floating islands, after the pictures: broad oaks whose crowns are heaps of many leaf
// clumps, small round trees, slim poplars and the odd blossom tree; bushes of three to five clumps, some in flower.
// Each crown clump is a ball of soft leaf cards around a solid core almost as big as the clump, so the screen-space
// ink only draws the crown's outer silhouette and the big breaks between clumps, never a speckle of card edges.

let leafTex: THREE.CanvasTexture | null = null;
/** Rounded leaves overlapping into a soft-edged mass: the card's middle is solid, only its rim breaks into leaves. */
function softLeafSheet(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.3, 0, TAU); x.fill();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + r() * 0.3, d = S * (0.26 + r() * 0.1);
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const len = S * (0.17 + r() * 0.07), wid = len * (0.55 + r() * 0.15);
    x.save(); x.translate(cx, cy); x.rotate(a + (r() - 0.5) * 0.6);
    x.beginPath(); x.ellipse(0, 0, len / 2, wid / 2, 0, 0, TAU); x.fill();
    x.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.NoColorSpace;
  return leafTex;
}

// one card material and one core material for all foliage (the leaf colour is baked into vertex colours), so a
// whole island's trees and bushes merge into two draws
let cardM: THREE.MeshToonMaterial | null = null, coreM: THREE.MeshToonMaterial | null = null;
function cardMat(): THREE.MeshToonMaterial {
  if (!cardM) {
    cardM = paint(new THREE.MeshToonMaterial({
      color: '#ffffff', gradientMap: softRamp(), alphaMap: softLeafSheet(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true,
    }), { variation: 0.5, rim: 1.1, crown: 1 });
    gradeFoliage(cardM, 'isleLeaf');
  }
  return cardM;
}
function coreMat(): THREE.MeshToonMaterial {
  if (!coreM) {
    coreM = paint(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: softRamp(), vertexColors: true }), { variation: 0.4, rim: 0.5, crown: 1 });
    gradeFoliage(coreM, 'isleLeafCore');
  }
  return coreM;
}

/**
 * One clump of leaves: cards over a squashed ball, normals pointing out from the ball (so it shades like one soft
 * form, light on top and the sun side), lighter at the top, around a solid core of 0.86 of its radius.
 */
export function clump(radius: number, color: string, seed: number, squash = 0.8): THREE.Group {
  const g = new THREE.Group();
  let s = seed * 7919 + 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = Math.round(14 + radius * 12);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  const lc = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 1.5 - 0.45, r() * 2 - 1).normalize();
    const c = dir.clone().multiplyScalar(radius * (0.82 + r() * 0.22)); c.y *= squash;
    const size = radius * (0.5 + r() * 0.22);
    const a = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    const b = new THREE.Vector3().crossVectors(dir, a).normalize();
    const rot = r() * Math.PI;
    const ax = a.clone().multiplyScalar(Math.cos(rot)).addScaledVector(b, Math.sin(rot)).multiplyScalar(size);
    const bx = b.clone().multiplyScalar(Math.cos(rot)).addScaledVector(a, -Math.sin(rot)).multiplyScalar(size);
    const base = pos.length / 3;
    // lighter, yellower toward the top: the lit crowns of the pictures
    const top = smoothstep(-0.2, 0.9, dir.y);
    const shade = 0.86 + 0.24 * top + (r() - 0.5) * 0.08;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.copy(c).addScaledVector(ax, su).addScaledVector(bx, sv);
      pos.push(v.x, v.y, v.z);
      const nn = v.clone(); nn.y /= squash; nn.normalize().lerp(dir, 0.4).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push((su + 1) / 2, (sv + 1) / 2);
      col.push(lc.r * shade * (1 + 0.04 * top), lc.g * shade * (1 + 0.03 * top), lc.b * shade * (0.92 - 0.06 * top));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const cards = new THREE.Mesh(geo, cardMat());
  cards.castShadow = true; cards.receiveShadow = true; cards.userData.noOutline = true;
  g.add(cards);
  const coreG = new THREE.IcosahedronGeometry(radius * 0.86, 1);
  coreG.scale(1, squash, 1);
  coreG.deleteAttribute('uv');
  const cc = lc.clone().multiplyScalar(0.8), ca = new Float32Array(coreG.attributes.position.count * 3);
  for (let i = 0; i < ca.length; i += 3) ca.set([cc.r, cc.g, cc.b], i);
  coreG.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  const core = new THREE.Mesh(coreG, coreMat());
  core.castShadow = true; core.receiveShadow = true; core.userData.noOutline = true;
  g.add(core);
  return g;
}

// each tree takes one family (deep blue-green, mid green or warm yellow-green), so neighbouring trees read apart
const LEAF = {
  oak: [['#4f8a44', '#5a9648', '#4a8040'], ['#5c9a3a', '#68a743', '#5a9440'], ['#6f9e3c', '#7cab44', '#689638']],
  round: [['#76b048', '#82b84c', '#6ca845'], ['#8cb84e', '#98c258', '#84b04a'], ['#5f9e4a', '#6aa850', '#58944a']],
  poplar: [['#4e8c3a', '#5a963c']],
  blossom: [['#f2c4d4', '#f6d8e2', '#fff0f2'], ['#fff2ec', '#fbe4e8', '#ffffff']],
};
export type TreeKind = 'oak' | 'round' | 'poplar' | 'blossom';
const bark = () => toonMat('#7d5c42', 0.6, 0.6);

/** A trunk: a tapering, gently bent cylinder with a flared foot. */
function trunk(h: number, r0: number, rng: () => number): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r0 * 0.55, r0, h, 7, 5);
  const p = g.attributes.position as THREE.BufferAttribute;
  const bend = (rng() - 0.5) * 0.35 * h * 0.2, ph = rng() * 3;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5;
    const flare = 1 + 0.6 * Math.pow(1 - smoothstep(0, 0.2, y), 2);
    p.setXYZ(i, p.getX(i) * flare + Math.sin(y * 2.2 + ph) * bend * y, p.getY(i), p.getZ(i) * flare);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, bark());
  m.position.y = h / 2;
  m.castShadow = true;
  return m;
}
function limb(from: THREE.Vector3, to: THREE.Vector3, r: number): THREE.Mesh {
  const d = to.clone().sub(from), L = d.length();
  const g = new THREE.CylinderGeometry(r * 0.5, r, L, 5);
  g.deleteAttribute('uv');
  const m = new THREE.Mesh(g, bark());
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** A meadow tree of the given kind; scale 1 is a full-grown tree about 5-7 m tall. */
export function islandTree(kind: TreeKind, rng: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const fams = LEAF[kind];
  const cols = fams[Math.floor(rng() * fams.length)];
  const pick = () => cols[Math.floor(rng() * cols.length)];
  const seed = () => Math.floor(rng() * 99999);
  if (kind === 'oak') {
    const h = (2.0 + rng() * 1.0) * scale;
    g.add(trunk(h, 0.36 * scale, rng));
    const top = new THREE.Vector3(0, h, 0);
    // a broad, lopsided crown: its masses of very different sizes, one side heavier
    const cw = (2.8 + rng() * 1.2) * scale;
    const heavy = rng() * TAU;
    const nl = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * TAU + rng() * 0.7;
      const k = 0.75 + 0.35 * Math.cos(a - heavy);
      const tip = new THREE.Vector3(Math.cos(a) * cw * 0.58 * k, h + (0.6 + rng() * 1.0) * scale, Math.sin(a) * cw * 0.58 * k);
      g.add(limb(top.clone().add(new THREE.Vector3(0, -0.4 * scale, 0)), tip, 0.15 * scale));
      const c = clump((0.95 + rng() * 0.75) * k * scale, pick(), seed(), 0.72);
      c.position.copy(tip).add(new THREE.Vector3(0, 0.4 * scale, 0));
      g.add(c);
    }
    // the heaped top of the crown
    const nt = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < nt; i++) {
      const a = rng() * TAU, d = rng() * cw * 0.25;
      const c = clump((1.3 + rng() * 0.4) * scale, pick(), seed(), 0.8);
      c.position.set(Math.cos(a) * d, h + (2.0 + rng() * 0.7) * scale, Math.sin(a) * d);
      g.add(c);
    }
    // a few small clumps low on the limbs
    for (let i = 0; i < 2; i++) {
      const a = rng() * TAU;
      const c = clump((0.7 + rng() * 0.3) * scale, pick(), seed(), 0.75);
      c.position.set(Math.cos(a) * cw * 0.75, h + 0.3 * scale, Math.sin(a) * cw * 0.75);
      g.add(c);
    }
  } else if (kind === 'round' || kind === 'blossom') {
    const h = (1.4 + rng() * 0.8) * scale;
    g.add(trunk(h + 0.6 * scale, 0.22 * scale, rng));
    const cr = (1.25 + rng() * 0.35) * scale;
    const main = clump(cr, pick(), seed(), 0.85);
    main.position.set(0, h + cr * 0.95, 0); g.add(main);
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 0.8;
      const r2 = cr * (0.55 + rng() * 0.2);
      const c = clump(r2, pick(), seed(), 0.8);
      c.position.set(Math.cos(a) * cr * 0.75, h + cr * (0.55 + rng() * 0.6), Math.sin(a) * cr * 0.75);
      g.add(c);
    }
  } else {
    // poplar: a slim, flame-shaped column of overlapping clumps, smaller toward the top
    const h = (1.0 + rng() * 0.5) * scale;
    const tall = (4.0 + rng() * 1.5) * scale;
    g.add(trunk(h + tall * 0.5, 0.2 * scale, rng));
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r2 = (0.95 - 0.5 * t * t) * scale * (0.9 + rng() * 0.2);
      const c = clump(r2, pick(), seed(), 1.3);
      const a = rng() * TAU, d = (0.15 + rng() * 0.2) * scale * (1 - t);
      c.position.set(Math.cos(a) * d, h + 0.9 * scale + t * tall, Math.sin(a) * d);
      g.add(c);
    }
  }
  return g;
}

const BUSH = ['#6aa844', '#78b24a', '#5e9c40', '#86bc52'];
const BLOOM = ['#f4a6c4', '#fff3ea', '#ffd768', '#c9a6ee', '#ff9a8a'];
/** A bush of three to five clumps, sometimes in flower (small pale or pink clumps on top). */
export function islandBush(rng: () => number, scale = 1, flowering = rng() < 0.4): THREE.Group {
  const g = new THREE.Group();
  const leaf = BUSH[Math.floor(rng() * BUSH.length)];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.38 + rng() * 0.32) * scale * (i === 0 ? 1.25 : 1);
    const a = rng() * TAU, d = i === 0 ? 0 : (0.45 + rng() * 0.4) * scale;
    const c = clump(r, leaf, Math.floor(rng() * 99999), 0.75);
    c.position.set(Math.cos(a) * d, r * 0.55, Math.sin(a) * d);
    g.add(c);
  }
  if (flowering) {
    const bc = BLOOM[Math.floor(rng() * BLOOM.length)];
    for (let i = 0; i < 4; i++) {
      const a = rng() * TAU, d = rng() * 0.6 * scale;
      const c = clump(0.2 * scale, bc, Math.floor(rng() * 99999), 0.8);
      c.position.set(Math.cos(a) * d, (0.75 + rng() * 0.25) * scale, Math.sin(a) * d);
      g.add(c);
    }
  }
  return g;
}
