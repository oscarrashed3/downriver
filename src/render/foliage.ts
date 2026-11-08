import * as THREE from 'three';
import { paint, softRamp } from './paint';

/**
 * Painted foliage: clumps of leaf cards around a darker core, the way background painters draw trees.
 * Card normals point out from the clump's center, so each clump shades like a soft ball:
 * bright on top, dark underneath, with ragged leafy edges that the ink pass outlines.
 */

let leafTex: THREE.CanvasTexture | null = null;
let needleTex: THREE.CanvasTexture | null = null;

function leafSheet(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#fff';
  // A spray of pointed leaves, denser at the center, so the card's edge reads as individual leaves.
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.36;
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const len = 26 + r() * 22, wid = len * (0.34 + r() * 0.12), rot = a + (r() - 0.5) * 1.2;
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.beginPath(); x.moveTo(-len / 2, 0);
    x.quadraticCurveTo(0, -wid, len / 2, 0); x.quadraticCurveTo(0, wid, -len / 2, 0); x.fill();
    x.restore();
  }
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.22, 0, Math.PI * 2); x.fill();
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.NoColorSpace;
  return leafTex;
}

function needleSheet(): THREE.CanvasTexture {
  if (needleTex) return needleTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#fff';
  // A drooping fir bough: a central stem with needle tufts that hang down at the tips.
  x.beginPath(); x.moveTo(S * 0.5, S * 0.1); x.lineTo(S * 0.1, S * 0.72); x.lineTo(S * 0.9, S * 0.72); x.closePath(); x.fill();
  for (let i = 0; i < 40; i++) {
    const t = r(), side = r() > 0.5 ? 1 : -1;
    const y = S * (0.15 + t * 0.6), w = S * 0.4 * t;
    const px = S / 2 + side * w * (0.6 + r() * 0.4);
    x.beginPath(); x.moveTo(px, y); x.lineTo(px + side * 10, y + 22 + r() * 18); x.lineTo(px - side * 8, y + 12); x.closePath(); x.fill();
  }
  needleTex = new THREE.CanvasTexture(c);
  needleTex.colorSpace = THREE.NoColorSpace;
  return needleTex;
}

const mats = new Map<string, THREE.MeshToonMaterial>();
function cardMat(color: string, kind: 'leaf' | 'needle'): THREE.MeshToonMaterial {
  const key = color + kind;
  let m = mats.get(key);
  if (!m) {
    m = paint(new THREE.MeshToonMaterial({
      color, gradientMap: softRamp(), alphaMap: kind === 'leaf' ? leafSheet() : needleSheet(), alphaTest: 0.5,
      side: THREE.DoubleSide, vertexColors: true,
    }), { variation: 0.6, rim: 1.4, crown: 1 });
    mats.set(key, m);
  }
  return m;
}

export interface ClumpOpts { radius: number; color: string; cards?: number; squash?: number; seed?: number; core?: boolean }

/** One clump of leaves: about 30 cards on a soft ball, plus a darker core so no holes show. */
export function leafClump(o: ClumpOpts): THREE.Group {
  const g = new THREE.Group();
  const n = o.cards ?? Math.round(18 + o.radius * 10);
  const squash = o.squash ?? 0.82;
  let s = (o.seed ?? 7) * 7919 + 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    // points spread over the ball, more on top and the sunny sides
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 1.6 - 0.6, r() * 2 - 1).normalize();
    const d = o.radius * (0.7 + r() * 0.35);
    const c = dir.clone().multiplyScalar(d); c.y *= squash;
    const size = o.radius * (0.55 + r() * 0.3);
    // card faces roughly outward, tilted randomly
    a.crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    b.crossVectors(dir, a).normalize();
    const rot = r() * Math.PI;
    const ax = a.clone().multiplyScalar(Math.cos(rot)).addScaledVector(b, Math.sin(rot)).multiplyScalar(size);
    const bx = b.clone().multiplyScalar(Math.cos(rot)).addScaledVector(a, -Math.sin(rot)).multiplyScalar(size);
    const base = pos.length / 3;
    const shade = 0.82 + 0.3 * (dir.y * 0.5 + 0.5) + (r() - 0.5) * 0.12;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.copy(c).addScaledVector(ax, su).addScaledVector(bx, sv);
      pos.push(v.x, v.y, v.z);
      const nn = v.clone(); nn.y /= squash; nn.normalize().lerp(dir, 0.3).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push((su + 1) / 2, (sv + 1) / 2);
      col.push(shade, shade, shade * 0.96);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const cards = new THREE.Mesh(geo, cardMat(o.color, 'leaf'));
  cards.castShadow = true; cards.receiveShadow = true;
  cards.userData.noOutline = true;
  g.add(cards);
  if (o.core !== false) {
    const coreCol = new THREE.Color(o.color).multiplyScalar(0.62).getStyle();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(o.radius * 0.72, 1), cardCore(coreCol));
    core.scale.y = squash; core.castShadow = true; core.receiveShadow = true;
    core.userData.noOutline = true;
    g.add(core);
  }
  return g;
}

const coreMats = new Map<string, THREE.MeshToonMaterial>();
function cardCore(color: string) {
  let m = coreMats.get(color);
  if (!m) { m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp() }), { variation: 0.5, rim: 0.3 }); coreMats.set(color, m); }
  return m;
}

/** A fir tier: a ring of drooping bough cards around the trunk. */
export function firTier(radius: number, height: number, color: string, seed = 1): THREE.Mesh {
  let s = seed * 104729 + 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 9;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + r() * 0.4;
    const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const top = new THREE.Vector3(0, height, 0);
    const tip = out.clone().multiplyScalar(radius).add(new THREE.Vector3(0, -height * 0.05, 0));
    const w = radius * 0.75;
    const base = pos.length / 3;
    // a card from the trunk top out to the tip, wide at the tip
    const quad = [top.clone().addScaledVector(side, -w * 0.15), top.clone().addScaledVector(side, w * 0.15), tip.clone().addScaledVector(side, w), tip.clone().addScaledVector(side, -w)];
    const uvs = [[0.5, 0.1], [0.5, 0.1], [0.92, 0.75], [0.08, 0.75]];
    quad.forEach((p, k) => {
      pos.push(p.x, p.y, p.z);
      const nn = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.6, 0)).normalize();
      nor.push(nn.x, nn.y, nn.z); uv.push(uvs[k][0], 1 - uvs[k][1]);
      const sh = 0.85 + r() * 0.2; col.push(sh, sh, sh);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, cardMat(color, 'needle'));
  m.castShadow = true; m.receiveShadow = true; m.userData.noOutline = true;
  return m;
}
