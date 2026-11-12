import * as THREE from 'three';
import { smoothstep, clamp } from '../noise';
import { townRng, pickOf } from './rand';
import { BONE, SHELL, LEGS, legBones, headPoint, headDir, HEAD_FWD } from './ambleRig';
import type { AmbleBodyBuild, W } from './ambleBody';
import { chainWeights } from './ambleBody';
import { headSurface } from './ambleHead';
import { CELL, cellUV } from './ambleMaterials';

// What grows on Old Amble, as alpha-tested cards skinned to its bones (one draw): curtains of vines hanging from
// the shell's edge over the plates (some all the way down past the legs), ferns and little flowers along the
// terraces and the rim walk, vines hanging from the mane of moss down the neck, vines winding up the antlers and
// trailing from their tines, leafy sprigs at a few antler tips, and moss sprays on the head and the legs.

const IVY = [new THREE.Color('#5f8a3c'), new THREE.Color('#6d9842'), new THREE.Color('#7aa24a'), new THREE.Color('#58803a'), new THREE.Color('#86ab50')];
const TIP = new THREE.Color('#a9c464');
const FERN = [new THREE.Color('#6f9a3e'), new THREE.Color('#7fa846'), new THREE.Color('#5e8a38')];
const BLOOM = [new THREE.Color('#ffffff'), new THREE.Color('#ffe0ea'), new THREE.Color('#e8dcff'), new THREE.Color('#fff2c8')];

export class CardBuilder {
  P: number[] = []; N: number[] = []; UV: number[] = []; C: number[] = []; SW2: number[] = []; SI: number[] = []; SWt: number[] = []; I: number[] = [];
  /** A quad: centre, half-axes a (u) and b (v), normal, atlas cell, colour, sway (per corner: bottom, top), weights. */
  quad(c: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, cell: number, color: THREE.Color, sway: [number, number], phase: number, w: W) {
    const base = this.P.length / 3;
    const ws = w.slice(0, 4);
    const tot = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.P.push(c.x + a.x * su + b.x * sv, c.y + a.y * su + b.y * sv, c.z + a.z * su + b.z * sv);
      this.N.push(n.x, n.y, n.z);
      const uv = cellUV(cell, (su + 1) / 2, (sv + 1) / 2);
      this.UV.push(uv[0], uv[1]);
      this.C.push(color.r, color.g, color.b);
      this.SW2.push(sv < 0 ? sway[0] : sway[1], phase);
      for (let k = 0; k < 4; k++) { this.SI.push(ws[k]?.[0] ?? 0); this.SWt.push(ws[k] ? ws[k][1] / tot : 0); }
    }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  get quads() { return this.I.length / 6; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.SW2, 2));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SWt, 4));
    g.setIndex(this.I);
    return g;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const perp = (n: THREE.Vector3) => { const t = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : Y.clone(); return t.addScaledVector(n, -t.dot(n)).normalize(); };

/**
 * One hanging strand of vine from `start` down `len` metres. `wall(y)` gives how far out the body stands at
 * height y along `out` (or null where it hangs free); the strand rides over bulges and drops free below them.
 */
function strand(cb: CardBuilder, rng: () => number, start: THREE.Vector3, out: THREE.Vector3, len: number, wall: ((y: number) => number | null) | null, w: W, width = 0.62, flower: THREE.Color | null = null) {
  const color = pickOf(rng, IVY).clone().offsetHSL(0, 0, (rng() - 0.5) * 0.05);
  const dark = color.clone().multiplyScalar(0.75);
  const seg = 0.82;
  const n = Math.max(1, Math.round(len / seg));
  const side = new THREE.Vector3().crossVectors(Y, out).normalize();
  let off = 0, free = 0;
  const ph = rng() * 20;
  const p = start.clone();
  const drift = (rng() - 0.5) * 0.08;
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const y = start.y - (k + 0.5) * seg;
    const wv = wall ? wall(y) : null;
    if (wv !== null && wv + 0.14 > off) { off = wv + 0.14; free = 0; } else free += seg;
    p.copy(start).addScaledVector(out, off).addScaledVector(side, drift * k); p.y = y;
    const sw0 = Math.min(0.5, free * 0.05), sw1 = Math.min(0.5, Math.max(0, free - seg) * 0.05);
    const c = dark.clone().lerp(color, 0.35 + 0.65 * t).lerp(TIP, smoothstep(0.5, 1, t) * 0.5);
    const wd = width * (1 - 0.35 * t) * (0.85 + rng() * 0.3);
    const b = new THREE.Vector3(0, -seg * 0.62, 0);
    // two crossed ribbons, so the strand has body from the side
    cb.quad(p, side.clone().multiplyScalar(wd), b.clone().negate(), out, CELL.vine, c, [sw0, sw1], ph, w);
    const s2 = side.clone().applyAxisAngle(Y, 1.1);
    cb.quad(p.clone().addScaledVector(out, 0.05), s2.multiplyScalar(wd * 0.85), b.clone().negate(), out, CELL.vine, c.clone().multiplyScalar(0.92), [sw0, sw1], ph, w);
    if (t < 0.85 && rng() < 0.6) {
      const lc = p.clone().addScaledVector(out, 0.12).addScaledVector(side, (rng() - 0.5) * wd * 1.2);
      const ls = (0.45 + rng() * 0.25) * (1 - 0.4 * t);
      cb.quad(lc, side.clone().multiplyScalar(ls), new THREE.Vector3(0, ls, 0).addScaledVector(out, 0.15), out, CELL.leaves, color.clone().multiplyScalar(0.9 + rng() * 0.2), [sw0, sw1], ph, w);
    }
    if (flower && rng() < 0.35) {
      const fc = p.clone().addScaledVector(out, 0.16).addScaledVector(side, (rng() - 0.5) * 0.3);
      cb.quad(fc, side.clone().multiplyScalar(0.26), new THREE.Vector3(0, 0.26, 0), out, CELL.flowers, flower, [sw0, sw1], ph, w);
    }
  }
  return p;
}

/** A fern: five to eight fronds arching out from a centre, on a surface with normal n. */
function fern(cb: CardBuilder, rng: () => number, c: THREE.Vector3, n: THREE.Vector3, size: number, w: W) {
  const t1 = perp(n), t2 = new THREE.Vector3().crossVectors(n, t1);
  const k = 5 + Math.floor(rng() * 4);
  const col = pickOf(rng, FERN);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rng() * 0.5;
    const dir = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
    const L = size * (0.8 + rng() * 0.4);
    // each frond in two segments: rising from the centre, then arching over
    const up = 0.75 + rng() * 0.3;
    const d1 = dir.clone().multiplyScalar(0.55).addScaledVector(n, up).normalize();
    const d2 = dir.clone().addScaledVector(n, 0.05).normalize();
    const sd = new THREE.Vector3().crossVectors(d1, n).normalize();
    const m1 = c.clone().addScaledVector(d1, L * 0.27);
    const e1 = c.clone().addScaledVector(d1, L * 0.54);
    const m2 = e1.clone().addScaledVector(d2, L * 0.23);
    const shade = col.clone().multiplyScalar(0.85 + rng() * 0.3);
    // the cell is drawn tip-up: the lower half of the frond, then the upper half
    pushHalf(cb, m1, sd.clone().multiplyScalar(L * 0.24), d1.clone().multiplyScalar(L * 0.27), n, shade.clone().multiplyScalar(0.85), w, 0);
    pushHalf(cb, m2, sd.clone().multiplyScalar(L * 0.2), d2.clone().multiplyScalar(L * 0.23), n, shade, w, 1);
  }
}
function pushHalf(cb: CardBuilder, c: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, color: THREE.Color, w: W, half: 0 | 1) {
  const base = cb.P.length / 3;
  cb.quad(c, a, b, n, CELL.fern, color, [0, 0], 0, w);
  // remap the v range of the quad to its half of the frond cell
  for (let q = 0; q < 4; q++) {
    const iv = (base + q) * 2 + 1;
    const [, v0] = cellUV(CELL.fern, 0, half * 0.5), [, v1] = cellUV(CELL.fern, 0, half * 0.5 + 0.5);
    cb.UV[iv] = q < 2 ? v0 : v1;
  }
}

/** A cushion of small flowers (and leaves) sitting on a surface. */
function flowers(cb: CardBuilder, rng: () => number, c: THREE.Vector3, n: THREE.Vector3, size: number, w: W) {
  const t1 = perp(n);
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI;
    const ax = t1.clone().applyAxisAngle(n, a);
    const up = n.clone().multiplyScalar(size * 0.5);
    cb.quad(c.clone().addScaledVector(n, size * 0.35).addScaledVector(ax, (rng() - 0.5) * size * 0.4), ax.clone().multiplyScalar(size * 0.55), up, n, i === 0 ? CELL.leaves : CELL.flowers, i === 0 ? pickOf(rng, IVY) : pickOf(rng, BLOOM), [0, 0], 0, w);
  }
}

export function buildAmbleGrowth(body: AmbleBodyBuild, seed = 5) {
  const rng = townRng(seed);
  const cb = new CardBuilder();
  const wS: W = [[BONE.shell, 1]];
  const { shell } = body;
  const NU = shell.cols.length;

  // ---- curtains of vines down the shell's edge, over the plates (the outer face's radius at each height lets
  // a strand ride over the bulging plates and hang free under the lip)
  for (let j = 0; j < NU; j++) {
    const col = shell.cols[j];
    // where the rim walk's outer edge is, and the outer face's samples (y falling)
    let i0 = -1;
    for (let i = 0; i < shell.NV; i++) if (col.rho[i] >= SHELL.rLedge + 0.012) { i0 = i; break; }
    if (i0 < 0) continue;
    const front = Math.abs(Math.atan2(Math.sin(col.th - Math.PI / 2), Math.cos(col.th - Math.PI / 2))) < 0.4;
    // curtains: denser in clumps round the shell (like the picture), thin in between
    const clump = 0.5 + 0.5 * Math.sin(col.th * 7 + 1.3) * Math.sin(col.th * 3 + 0.4);
    if (rng() > 0.18 + 0.55 * clump) continue;
    const faceY: number[] = [], faceR: number[] = [];
    for (let i = i0; i < shell.NV; i++) {
      if (faceY.length && col.y[i] > faceY[faceY.length - 1]) break;
      faceY.push(col.y[i]); faceR.push(col.rho[i]);
    }
    const R = Math.hypot(col.E.x, col.E.z);
    const rhoTop = faceR[0];
    const wall = (y: number) => {
      if (y > faceY[0] || y < faceY[faceY.length - 1]) return null;
      for (let k = 0; k < faceY.length - 1; k++) if (y <= faceY[k] && y >= faceY[k + 1]) {
        const f = (faceY[k] - y) / Math.max(1e-4, faceY[k] - faceY[k + 1]);
        return ((faceR[k] + (faceR[k + 1] - faceR[k]) * f) - rhoTop) * R + 0.45;
      }
      return null;
    };
    const start = new THREE.Vector3(col.E.x * rhoTop, faceY[0] + 0.25, SHELL.cz + col.E.z * rhoTop);
    // mostly short drapes; long curtains in the clumps, some reaching right down past the knees
    const long = rng() < 0.3 * clump + 0.05;
    let len = long ? 6 + rng() * 6 : 1.4 + rng() * 3.4;
    if (front) len = Math.min(len, 4.5);
    len = Math.min(len, start.y - 1.2);
    strand(cb, rng, start, col.out, len, wall, wS, 0.85 + clump * 0.35, rng() < 0.12 ? pickOf(rng, BLOOM) : null);
  }

  // ---- the tops: ferns along the terrace lips and the rim walk, flower cushions on the moss lumps
  for (const L of body.lumps) {
    const r = rng();
    if (r < 0.32) fern(cb, rng, L.p.clone().addScaledVector(L.n, L.r * 0.3), L.n, 1.1 + rng() * 0.9, wS);
    else if (r < 0.62) flowers(cb, rng, L.p.clone().addScaledVector(L.n, L.r * 0.25), L.n, 0.7 + rng() * 0.5, wS);
  }
  // ferns tucked against the foot of each terrace wall (out of the way of the village's paths)
  for (let j = 0; j < NU; j += 2) {
    if (rng() > 0.3) continue;
    const col = shell.cols[j];
    for (const r0 of [SHELL.rTop + 0.075, SHELL.rMid + 0.075]) {
      if (rng() > 0.55) continue;
      let i = -1; for (let k = 0; k < shell.NV; k++) if (col.rho[k] >= r0) { i = k; break; }
      if (i < 0) continue;
      const p = new THREE.Vector3(col.E.x * col.rho[i], col.y[i], SHELL.cz + col.E.z * col.rho[i]);
      fern(cb, rng, p, Y, 0.9 + rng() * 0.8, wS);
    }
  }

  // ---- the neck: vines hanging from the mane down both sides
  const neck = body.neck;
  const neckBones = [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head];
  for (let k = 0; k < 120; k++) {
    const t = 0.06 + rng() * 0.8;
    const i = Math.round(t * (neck.C.length - 1));
    const sd = rng() < 0.5 ? 1 : -1;
    const ang = sd * (0.6 + rng() * 0.9);
    const n = neck.N[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(neck.B[i], Math.sin(ang)).normalize();
    const rr = neck.R[i] * (1 - 0.1 * Math.sin(ang) ** 2) * 0.98;
    const p = neck.C[i].clone().addScaledVector(n, rr);
    const out = new THREE.Vector3(n.x, 0, n.z).normalize();
    if (out.lengthSq() < 0.5) continue;
    const w = chainWeights(t * neck.len, neck.ctlS.slice(0, 6), neckBones, 1);
    // hug the neck while its side is still under the strand, then hang free
    const C = neck.C[i].clone(), Rn = rr;
    const wall = (y: number) => { const dy = y - C.y; if (Math.abs(dy) >= Rn) return null; const half = Math.sqrt(Rn * Rn - dy * dy); return half - (p.clone().sub(C).dot(out)); };
    strand(cb, rng, p, out, 1.2 + rng() * (5.5 - t * 3.5), wall, w, 0.7, rng() < 0.15 ? pickOf(rng, BLOOM) : null);
  }

  // ---- antlers: vines winding along the beams and tines, strands trailing from them, leaves at some tips
  const wH: W = [[BONE.head, 1]];
  for (const br of body.antlerBranches) {
    const curve = new THREE.CatmullRomCurve3(br.pts, false, 'centripetal');
    const len = curve.getLength();
    const steps = Math.round(len / 0.32);
    let a = rng() * Math.PI * 2;
    // vines climb about two thirds of the way up most branches
    const reach = 0.35 + rng() * 0.5;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      if (t > reach) break;
      a += 0.9;
      const p = curve.getPoint(t), T = curve.getTangent(t);
      const nrm = perp(T).applyAxisAngle(T, a);
      const r = br.r0 + (br.r1 - br.r0) * t;
      const c = p.clone().addScaledVector(nrm, r + 0.06);
      const sz = 0.38 * (1 - t * 0.5);
      cb.quad(c, new THREE.Vector3().crossVectors(T, nrm).multiplyScalar(sz), T.clone().multiplyScalar(sz).addScaledVector(nrm, 0.1), nrm, CELL.leaves, pickOf(rng, IVY), [0, 0], 0, wH);
      // strands trail down from the lower branches
      if (rng() < 0.11 && p.y > 23) {
        const out = new THREE.Vector3(nrm.x, 0, nrm.z);
        if (out.lengthSq() < 0.1) out.set(1, 0, 0);
        out.normalize();
        strand(cb, rng, c, out, 1.0 + rng() * 2.6, null, wH, 0.45, rng() < 0.25 ? pickOf(rng, BLOOM) : null);
      }
    }
  }
  for (const tip of body.antlerTips) {
    if (rng() < 0.55) continue;
    for (let k = 0; k < 3; k++) {
      const ax = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize();
      cb.quad(tip.p.clone().add(new THREE.Vector3(0, 0.15, 0)), ax.multiplyScalar(0.45), new THREE.Vector3(0, 0.45, 0), Y, CELL.leaves, pickOf(rng, IVY).clone().lerp(TIP, 0.4), [0, 0], 0, wH);
    }
  }
  // the brow tines: a heavier curtain over the forehead (the vines that will grow down over the eyes)
  for (const side of [1, -1]) {
    for (let k = 0; k < 5; k++) {
      const z = 1.0 + k * 0.32;
      const q = headSurface(z, side * (0.32 + k * 0.05));
      const p = headPoint(q.x, q.y + 0.6 + rng() * 0.4, z);
      const out = headDir(side, 0.2, 0.3); out.y = 0; out.normalize();
      strand(cb, rng, p, out, 0.6 + rng() * 0.7, null, wH, 0.4, null);
    }
  }
  // moss sprays on the crown of the head
  for (let k = 0; k < 8; k++) {
    const a = (rng() - 0.5) * 1.6, z = -1.0 + rng() * 1.4;
    const q = headSurface(z, a);
    const n = headDir(Math.sin(a), Math.cos(a), 0);
    flowers(cb, rng, headPoint(q.x, q.y, z), n, 0.32, wH);
  }

  // ---- legs: leafy sprays and short vines over the moss on the upper legs
  for (const l of LEGS) {
    const fr = body.legs[l];
    const [h] = legBones(l);
    for (let k = 0; k < 12; k++) {
      const i = Math.floor(rng() * fr.C.length * 0.6);
      const ang = rng() * Math.PI * 2;
      const n = fr.N[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(fr.B[i], Math.sin(ang));
      const p = fr.C[i].clone().addScaledVector(n, 3.05);
      const out = new THREE.Vector3(n.x, 0, n.z).normalize();
      if (rng() < 0.5) strand(cb, rng, p, out, 0.8 + rng() * 1.8, (y) => (y > p.y - 4 ? 0.05 : null), [[h, 1]], 0.5, null);
      else cb.quad(p.addScaledVector(n, 0.1), new THREE.Vector3().crossVectors(n, Y).normalize().multiplyScalar(0.5), new THREE.Vector3(0, 0.5, 0), n, CELL.leaves, pickOf(rng, IVY), [0, 0], 0, [[h, 1]]);
    }
  }

  const geometry = cb.geometry();
  return { geometry, quads: cb.quads };
}

export { clamp, HEAD_FWD };
