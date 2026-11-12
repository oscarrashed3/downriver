import * as THREE from 'three';
import { smoothstep } from '../noise';

// The pieces Old Amble's body is built from (shared by ambleBody.ts and ambleFace.ts): an indexed part with the
// skin attributes the body shader reads, the tube frames along a curve, and the chain weights for skinning.
//
// Attributes: position, normal, color (albedo), aSkin = (rock, moss, ao, kind), aFold, aDet, aDir, skinIndex,
// skinWeight.
//   rock  how strongly the shader cuts the cracked-stone plate pattern into it (the shell)
//   moss  how mossy it is (the shader breaks the edge up with noise, and lets it creep into the creases)
//   ao    baked occlusion
//   kind  0 stone (the shell), 1 fur (head, ears, lids), 2 antler, 3 eye, 4 toenail, 5 moss lump, 6 hide (legs,
//         feet, body, neck, tail: an elephant's wrinkled, cracked hide, furred where aDet says so). One part
//         keeps one kind (the kind is interpolated over each triangle, so it must not change inside a part)
//   aFold the wrinkle coordinate: a crease falls on each whole number (rings round the legs, the neck folds,
//         the crow's feet round the eye, the creases across the muzzle)
//   aDet  (crease depth in metres, fur, cracked-hide amount, wetness)
//   aDir  the lie of the fur, or the grain of the antler (rest space; zero where there is none)

export type W = [number, number][];
export type Skin = [number, number, number, number];
export type Det = [number, number, number, number];

export const KIND = { stone: 0, hide: 1, antler: 2, eye: 3, nail: 4, moss: 5, bark: 6 } as const;

const NO_DET: Det = [0, 0, 0, 0];
const NO_DIR = new THREE.Vector3();

/** One part: an indexed mesh with skin attributes. Normals are computed per part. */
export class PartB {
  P: number[] = []; C: number[] = []; S: number[] = []; F: number[] = []; D: number[] = []; R: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = [];
  /** A vertex; `fold` is the wrinkle coordinate, `det` its detail, `dir` the lie of its fur or grain. */
  v(p: THREE.Vector3, c: THREE.Color, s: Skin, w: W, fold = 0, det: Det = NO_DET, dir: THREE.Vector3 = NO_DIR) {
    this.P.push(p.x, p.y, p.z); this.C.push(c.r, c.g, c.b); this.S.push(s[0], s[1], s[2], s[3]); this.F.push(fold);
    this.D.push(det[0], det[1], det[2], det[3]); this.R.push(dir.x, dir.y, dir.z);
    const ws = w.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((a, e) => a + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { this.SI.push(ws[k]?.[0] ?? 0); this.SW.push(ws[k] ? ws[k][1] / tot : 0); }
    return this.P.length / 3 - 1;
  }
  t(a: number, b: number, c: number) { this.I.push(a, b, c); }
  get count() { return this.P.length / 3; }
  geo(outward?: (p: THREE.Vector3) => THREE.Vector3) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(this.S, 4));
    g.setAttribute('aFold', new THREE.Float32BufferAttribute(this.F, 1));
    g.setAttribute('aDet', new THREE.Float32BufferAttribute(this.D, 4));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(this.R, 3));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(this.I);
    g.computeVertexNormals();
    if (outward) {
      // fix the winding so the normals face out (vote over a sample of vertices)
      const pa = g.attributes.position as THREE.BufferAttribute, na = g.attributes.normal as THREE.BufferAttribute;
      let vote = 0; const p = new THREE.Vector3(), n = new THREE.Vector3();
      const step = Math.max(1, Math.floor(pa.count / 200));
      for (let i = 0; i < pa.count; i += step) { p.fromBufferAttribute(pa, i); n.fromBufferAttribute(na, i); vote += Math.sign(n.dot(outward(p))); }
      if (vote < 0) { const ix = g.index!.array as Uint32Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    }
    return g;
  }
  /** Quads between rows of `cols` vertices starting at `start`; `wrap` closes each row into a ring. */
  rows(start: number, nRows: number, cols: number, wrap: boolean) {
    const cc = wrap ? cols : cols - 1;
    for (let i = 0; i < nRows - 1; i++) for (let j = 0; j < cc; j++) {
      const a = start + i * cols + j, b = start + i * cols + ((j + 1) % cols), c = a + cols, d = b + cols;
      this.t(a, c, b); this.t(b, c, d);
    }
  }
  /** A fan from a centre vertex to a ring. */
  fan(center: number, ring0: number, cols: number) { for (let j = 0; j < cols; j++) this.t(center, ring0 + j, ring0 + ((j + 1) % cols)); }
}

export const col = (h: string) => new THREE.Color(h);

/** Geometries collected during one build (blobs and small parts push themselves here). */
export const SINK: { geos: THREE.BufferGeometry[] } = { geos: [] };

/** A sphere-ish blob (u round, v top to bottom) placed by a function, as its own part (normals face away from c). */
export function blob(c: THREE.Vector3, nu: number, nv: number, f: (sx: number, sy: number, sz: number) => { p: THREE.Vector3; c: THREE.Color; s: Skin; w: W; fold?: number; det?: Det; dir?: THREE.Vector3 }) {
  const pb = new PartB();
  for (let i = 0; i <= nv; i++) {
    const v = (i / nv) * Math.PI;
    for (let j = 0; j < nu; j++) {
      const u = (j / nu) * Math.PI * 2;
      const r = f(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      pb.v(r.p, r.c, r.s, r.w, r.fold ?? 0, r.det, r.dir);
    }
  }
  pb.rows(0, nv + 1, nu, true);
  SINK.geos.push(pb.geo(p => new THREE.Vector3().subVectors(p, c)));
}

/** Normals away from the nearest of a set of centre points. */
export const awayFrom = (C: THREE.Vector3[]) => (p: THREE.Vector3) => { let bi = 0, bd = 1e9; C.forEach((c, i) => { const d = c.distanceToSquared(p); if (d < bd) { bd = d; bi = i; } }); return new THREE.Vector3().subVectors(p, C[bi]); };

/** Rings along a smooth curve through `pts`: centres, tangents, a frame, and the arc length at each ring. */
export function curveFrames(pts: THREE.Vector3[], n: number, ref: THREE.Vector3) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const C = curve.getSpacedPoints(n - 1);
  const len = curve.getLength();
  const T: THREE.Vector3[] = [], N: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = C[Math.min(n - 1, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
    const nn = ref.clone().addScaledVector(t, -ref.dot(t)).normalize();
    T.push(t); N.push(nn); B.push(new THREE.Vector3().crossVectors(t, nn));
  }
  // arc length of each control point (nearest ring)
  const ctlS = pts.map(p => { let bi = 0, bd = 1e9; C.forEach((c, i) => { const d = c.distanceToSquared(p); if (d < bd) { bd = d; bi = i; } }); return (bi / (n - 1)) * len; });
  return { C, T, N, B, len, ctlS };
}

/** Weights that blend linearly between bones placed at arc lengths `at` (one bone per entry). */
export function chainWeights(s: number, at: number[], bones: number[], soft = 1): W {
  if (s <= at[0]) return [[bones[0], 1]];
  for (let k = 0; k < at.length - 1; k++) if (s <= at[k + 1]) {
    const f = (s - at[k]) / (at[k + 1] - at[k]);
    const g = soft === 1 ? f : smoothstep(0.5 - soft / 2, 0.5 + soft / 2, f);
    return [[bones[k], 1 - g], [bones[k + 1], g]];
  }
  return [[bones[bones.length - 1], 1]];
}

export const gauss = (x: number) => Math.exp(-x * x);
export const wrapAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
