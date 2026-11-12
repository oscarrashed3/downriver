import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp } from '../noise';
import { townRng } from './rand';
import { outlinePoint, shellProfile, riserAt, shellTopY, ledges } from './ambleShell';
import {
  BONE, REST, SHELL, LEGS, legBones, FOOT_REST, HEAD_POS, HEAD_FWD, HEAD_SIDE, HEAD_UP, headPoint, headDir,
  EYE_LOCAL, EYE_R, ANTLER_LOCAL, HEAD_SCALE, type Leg,
} from './ambleRig';
import { HEAD_Z0, HEAD_Z1, headRing, headSurface, mono, mouthY, MOUTH_Z0, MOUTH_Z1, EYE_RADIUS } from './ambleHead';

// Old Amble's body, built in creature space in its rest pose and skinned to the rig: ONE geometry (one draw) for
// the shell and its edge plates, the body, the four pillar legs with their layered skin, the feet and toes, the
// neck, the head with its eyes, lids and ears, the antlers, the tail and every lump of moss.
//
// Attributes: position, normal, color (albedo), aSkin = (rock, moss, ao, kind), skinIndex, skinWeight.
//   rock  how strongly the shader cuts the cracked-stone plate pattern into it (0 smooth hide .. 1 stone)
//   moss  how mossy it is (the shader breaks the edge up with noise)
//   ao    baked occlusion: grooves between plates, the creases of the leg folds, under the shell
//   kind  0 stone (the shell), 1 pale hide, 2 antler, 3 eye, 4 toenail, 5 moss lump, 6 the legs' and neck's
//         rock-and-bark hide, in horizontal folds (aFold: the fold coordinate, creases on its whole numbers)
//
// It also hands back the anchors the growth and the game need: where vines can hang from the shell's edge,
// the antler tips the birds perch on, where the stone wedges in the front left foot, and where the mouth is.

export type W = [number, number][];
export type Skin = [number, number, number, number];

export const KIND = { stone: 0, hide: 1, antler: 2, eye: 3, nail: 4, moss: 5, bark: 6 } as const;

/** One part: an indexed mesh with skin attributes. Normals are computed per part. */
class PartB {
  P: number[] = []; C: number[] = []; S: number[] = []; F: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = [];
  /** A vertex; `fold` is the hide's fold coordinate (the folds' creases fall on its whole numbers). */
  v(p: THREE.Vector3, c: THREE.Color, s: Skin, w: W, fold = 0) {
    this.P.push(p.x, p.y, p.z); this.C.push(c.r, c.g, c.b); this.S.push(s[0], s[1], s[2], s[3]); this.F.push(fold);
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

const col = (h: string) => new THREE.Color(h);
const noise = new Noise(311), noise2 = new Noise(97);

// ------------------------------------------------------------------------------------------------ palette

const STONE = [col('#aca88f'), col('#a2a188'), col('#b0a68b'), col('#979a80'), col('#b6b097')];
const LEGSKIN = col('#ad9f80'), LEGSKIN2 = col('#b4a888');
const HIDE = col('#e3d6b6'), HIDE_D = col('#cfc0a0'), HIDE_L = col('#efe6cf');
const HIDE_W = col('#d8c29c'), WARM = col('#a98860'), WARM_D = col('#8a6646');
const NOSE = col('#5a4e47'), NOSE_D = col('#2c2420'), MOUTH = col('#a8977c');
const ANTLER = col('#ddd3bd'), ANTLER_B = col('#a49680');
const NAIL = col('#d9cba6');
const MOSS = [col('#6f913e'), col('#7fa046'), col('#8fae50'), col('#a0b95a'), col('#62853a')];

// ------------------------------------------------------------------------------------------------ shell

export { outlinePoint };

interface ShellData {
  /** Per angle column: the profile samples (rho, y) and the profile normal (nr, ny). */
  cols: { th: number; E: THREE.Vector3; out: THREE.Vector3; rho: number[]; y: number[]; face: [number, number] }[];
  NV: number;
}

function shellPart(pb: PartB, rng: () => number): ShellData {
  const NU = 240;
  const S = SHELL;
  const cols: ShellData['cols'] = [];
  // perimeter arc length (at rho = 1) for each column, for the plate cells
  const ths: number[] = [], arcs: number[] = [];
  let arc = 0; const prev = new THREE.Vector3(), cur = new THREE.Vector3();
  for (let j = 0; j <= NU; j++) {
    const th = (j / NU) * Math.PI * 2 - Math.PI / 2; // start at the back, so the seam is under the tail
    outlinePoint(th, cur);
    if (j > 0) arc += cur.distanceTo(prev);
    prev.copy(cur); ths.push(th); arcs.push(arc);
  }
  const perim = arc;
  // plate rows down the flank: the top row (smaller, mossy), the middle and the marginal row round the lip (the
  // biggest plates, hanging in rounded lobes), each half a plate offset from the next
  const rowsN = [Math.round(perim / 5.2), Math.round(perim / 4.5), Math.round(perim / 3.7)];
  const ROW_SPLIT = [0.3, 0.62];
  const bounds = rowsN.map((n, r) => { const b: number[] = []; for (let k = 0; k <= n; k++) b.push(((k + (k > 0 && k < n ? (rng() - 0.5) * 0.5 : 0) + r * 0.5) / n) * perim); return b; });
  const cellOf = (r: number, s: number) => {
    const b = bounds[r], n = rowsN[r];
    let x = s - b[0]; if (x < 0) x += perim;
    let k = Math.min(n - 1, Math.floor((x / perim) * n));
    const at = (i: number) => b[i] - b[0];
    while (k > 0 && x < at(k)) k--;
    while (k < n - 1 && x >= at(k + 1)) k++;
    const a0 = at(k), a1 = k + 1 <= n ? at(k + 1) : perim;
    return { k, fu: (x - a0) / Math.max(1e-3, a1 - a0) };
  };
  const plateH = rowsN.map(n => Array.from({ length: n }, () => 0.45 + rng() * 0.45));
  const plateTint = rowsN.map(n => Array.from({ length: n }, () => Math.floor(rng() * STONE.length)));
  const plateMoss = rowsN.map(n => Array.from({ length: n }, () => rng()));
  const p = new THREE.Vector3();
  const wShell: W = [[BONE.shell, 1]];
  let NV = 0;
  for (let j = 0; j < NU; j++) {
    const th = ths[j];
    const pr = shellProfile(th);
    const E = pr.E;
    const R = Math.hypot(E.x, E.z);
    const t0 = outlinePoint(th - 0.002), t1 = outlinePoint(th + 0.002);
    const out = new THREE.Vector3(t1.z - t0.z, 0, -(t1.x - t0.x)).normalize();
    const [f0, f1] = pr.face;
    NV = pr.rho.length;
    const rho: number[] = [], ys: number[] = [];
    for (let i = 0; i < NV; i++) {
      const rr0 = pr.rho[i], y0 = pr.y[i];
      // 2D profile normal (outwards from the shell), in metres
      const ia = Math.max(0, i - 1), ib = Math.min(NV - 1, i + 1);
      let nr = -(pr.y[ib] - pr.y[ia]), ny = (pr.rho[ib] - pr.rho[ia]) * R;
      const nl = Math.hypot(nr, ny) || 1; nr /= nl; ny /= nl;
      let disp = 0, ao = 0, rock = 0.55, moss = 0, tint = STONE[0], scallop = 0;
      const x0 = E.x * rr0, z0 = S.cz + E.z * rr0;
      if (i >= f0 && i <= f1) {
        // ---- the plated flank
        const fv = (i - f0) / Math.max(1, f1 - f0);
        const row = fv < ROW_SPLIT[0] ? 2 : fv < ROW_SPLIT[1] ? 1 : 0;
        const fvc = row === 2 ? fv / ROW_SPLIT[0] : row === 1 ? (fv - ROW_SPLIT[0]) / (ROW_SPLIT[1] - ROW_SPLIT[0]) : (fv - ROW_SPLIT[1]) / (1 - ROW_SPLIT[1]);
        const { k, fu } = cellOf(row, arcs[j]);
        const b = Math.pow(Math.sin(Math.PI * clamp(fu)), 0.45) * Math.pow(Math.sin(Math.PI * clamp(fvc)), 0.45);
        const h = plateH[row][k] * (row === 0 ? 1.3 : row === 1 ? 1.1 : 0.8) * (1 - 0.55 * pr.front);
        // the plates overlap like roof tiles: each one's lower edge stands out further; lumpy, weathered
        disp = h * (b - 0.3) + h * 0.4 * (fvc - 0.5) * b;
        disp += 0.18 * noise.fbm(x0 * 0.35, y0 * 0.35, z0 * 0.35, 2) * b;
        if (row === 0) scallop = 0.9 * Math.pow(Math.sin(Math.PI * clamp(fu)), 0.7) * smoothstep(0.4, 1.0, fvc) * (1 - pr.front);
        ao = (1 - smoothstep(0.0, 0.42, b)) * 0.85;
        rock = 1;
        tint = STONE[plateTint[row][k]];
        // moss: thick over the top row, in long tongues down the middle row, patches on the lip
        const tongue = noise.fbm(arcs[j] * 0.2, y0 * 0.3, 3.1, 3);
        moss = clamp((row === 2 ? 1.05 - fvc * 0.5 : row === 1 ? 0.55 - fvc * 0.6 : 0.18 - fvc * 0.4) + plateMoss[row][k] * 0.35 + tongue * 1.0 - 0.1);
      } else if (i < f0) {
        // ---- the dome top: treads of soft moss and turf, rocky ledge faces between them
        const rs = riserAt(th, rr0);
        const rough = noise.fbm(x0 * 0.45, y0 * 0.6, z0 * 0.45, 3);
        disp = (0.18 * rough + 0.3 * rs * noise.n3(x0 * 0.9, y0 * 0.9, z0 * 0.9)) * (1 - smoothstep(S.rJoin - 0.05, S.rJoin, rr0));
        rock = 0.4 + 0.6 * rs;
        moss = clamp(1.15 - rs * 1.25 + rough * 0.9);
        ao = rs * 0.25 * clamp(0.5 - rough);
        tint = STONE[(j + Math.floor(rr0 * 30)) % STONE.length];
      } else {
        // ---- under the lip: in deep shade, but stone, not a dark disc
        ao = 0.15 + 0.25 * smoothstep(f1, NV - 1, i); rock = 0.9; tint = STONE[3];
        moss = clamp(0.3 - (i - f1) * 0.2 + noise.n3(x0 * 0.4, 0, z0 * 0.4) * 0.5);
      }
      p.set(x0, y0, z0);
      p.addScaledVector(out, nr * disp); p.y += ny * disp - scallop;
      rho.push(rr0); ys.push(p.y);
      pb.v(p, tint, [rock, moss, ao, KIND.stone], wShell);
    }
    cols.push({ th, E, out, rho, y: ys, face: pr.face });
  }
  return { cols, NV };
}

/** Quads for the shell: columns are angles, rows are profile samples. */
function shellIndices(pb: PartB, start: number, NU: number, NV: number) {
  pb.I.length = 0;
  for (let j = 0; j < NU; j++) for (let i = 0; i < NV - 1; i++) {
    const j1 = (j + 1) % NU;
    const a = start + j * NV + i, b = start + j1 * NV + i, c = a + 1, d = b + 1;
    pb.t(a, b, c); pb.t(c, b, d);
  }
}

// ------------------------------------------------------------------------------------------------ tubes

/** Rings along a smooth curve through `pts`: centres, tangents, a frame, and the arc length at each ring. */
function curveFrames(pts: THREE.Vector3[], n: number, ref: THREE.Vector3) {
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
function chainWeights(s: number, at: number[], bones: number[], soft = 1): W {
  if (s <= at[0]) return [[bones[0], 1]];
  for (let k = 0; k < at.length - 1; k++) if (s <= at[k + 1]) {
    const f = (s - at[k]) / (at[k + 1] - at[k]);
    const g = soft === 1 ? f : smoothstep(0.5 - soft / 2, 0.5 + soft / 2, f);
    return [[bones[k], 1 - g], [bones[k + 1], g]];
  }
  return [[bones[bones.length - 1], 1]];
}

// ------------------------------------------------------------------------------------------------ legs and feet

/** The layered skin: overlapping bands like roof tiles (each band tucked in at its top, standing out at its
 * bottom over the crease of the next), broken round the leg into rough plates. Returns (scale, crease). */
function bandSkin(s: number, ang: number, bandLen: number, amp: number, seed: number) {
  const wob = 0.22 * Math.sin(ang * 3 + seed) + 0.12 * Math.sin(ang * 7 + seed * 1.7) + 0.1 * noise.n3(ang * 2, s * 0.5, seed);
  const x = s / bandLen + wob;
  const band = Math.floor(x), f = x - band;
  const g = Math.pow(smoothstep(0, 0.82, f), 0.7) * (1 - smoothstep(0.84, 1.0, f));
  // plates round the band
  const cell = (ang * 2.3 + band * 0.5 + 0.2 * Math.sin(band * 3.1)) / (Math.PI * 2) * 5;
  const fu = cell - Math.floor(cell);
  const pl = Math.pow(Math.sin(Math.PI * fu), 0.3);
  const scale = 1 + amp * (g - 0.55) + 0.012 * (pl - 0.6);
  const crease = (1 - smoothstep(0.0, 0.22, f)) * 0.9 + (1 - smoothstep(0, 0.35, pl)) * 0.12;
  return { scale, crease: clamp(crease), fold: x };
}

function legPart(pb: PartB, l: Leg, rng: () => number) {
  const [h, k, f] = legBones(l);
  const H = REST[h], K = REST[k], A = REST[f];
  const side = Math.sign(H.x), front = l.startsWith('F');
  const top = H.clone().add(new THREE.Vector3(-side * 1.2, 2.0, 0));
  const end = A.clone().add(new THREE.Vector3(side * 0.1, -1.1, 0.2));
  const NL = 72, NA = 44;
  const fr = curveFrames([top, H, K, A, end], NL, new THREE.Vector3(0, 0, 1));
  const [sTop, sH, sK, sA] = fr.ctlS;
  // massive pillars: thickest at the shoulder, a heavy knee, the ankle flaring into the foot
  const rad = mono([sTop, sH, sK, sA, fr.len], front ? [4.1, 3.95, 3.45, 3.1, 3.25] : [4.2, 4.05, 3.55, 3.15, 3.3]);
  const start = pb.count;
  const seed = rng() * 10;
  const p = new THREE.Vector3();
  for (let i = 0; i < NL; i++) {
    const s = (i / (NL - 1)) * fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      // the hide hangs in heavy horizontal folds, deeper round the knee and above the foot
      const kneeK = Math.exp(-(((s - sK) / 1.2) ** 2)), ankK = Math.exp(-(((s - sA) / 0.9) ** 2));
      const amp = 0.06 + 0.08 * kneeK + 0.03 * ankK;
      const bs = bandSkin(s, ang, 0.95 - 0.2 * kneeK, amp, seed);
      // the back of the knee creases, the front of it bulges
      const fwd = Math.cos(ang);
      let r = rad(s) * bs.scale * (1 + 0.06 * kneeK * fwd - 0.05 * kneeK * Math.max(0, -fwd));
      r *= 1 + 0.04 * noise.n3(Math.cos(ang) * 1.2 + seed, s * 0.25, Math.sin(ang) * 1.2);
      p.copy(fr.C[i]).addScaledVector(fr.N[i], Math.cos(ang) * r).addScaledVector(fr.B[i], Math.sin(ang) * r);
      // moss: heavy over the top of the leg and the outer front, running down in tongues (the front legs most)
      const outer = (Math.sin(ang) * -side * 0.5 + 0.5);
      const mossN = noise.fbm(p.x * 0.3, p.y * 0.22, p.z * 0.3, 3);
      const moss = clamp(smoothstep(0.75, 0.0, s / fr.len) * (front ? 0.75 : 0.6) - 0.05 + outer * 0.12 + Math.max(0, fwd) * 0.08 + mossN * 1.4);
      const ao = clamp(bs.crease * 0.75 + smoothstep(sH, sTop, s) * 0.5);
      const wv: W = s < sH + 0.3 ? [[BONE.body, 1 - smoothstep(sTop + 0.4, sH + 0.3, s)], [h, smoothstep(sTop + 0.4, sH + 0.3, s)]] : chainWeights(s, [sK - 0.7, sK + 0.7, sA - 0.45, sA + 0.3], [h, k, k, f]);
      const c = LEGSKIN.clone().lerp(LEGSKIN2, clamp(mossN * 2 + 0.5)).multiplyScalar(0.94 + 0.08 * noise2.n3(p.x * 0.5, p.y * 1.6, p.z * 0.5));
      pb.v(p, c, [1, moss, ao, KIND.bark], wv, bs.fold);
    }
  }
  pb.rows(start, NL, NA, true);
  return { ...fr, R: fr.C.map((_, i) => rad((i / (NL - 1)) * fr.len)) };
}

/** A foot: a broad round pad whose front is lobed into wide, flat toes, each with a blunt nail set into it. */
function footPart(pb: PartB, l: Leg, rng: () => number, toeGap: boolean) {
  const [, , f] = legBones(l);
  const Fc = FOOT_REST[l];
  const side = Math.sign(Fc.x);
  const wF: W = [[f, 1]];
  // the toes (degrees from straight ahead, turned out a little as the legs splay)
  const splay = side * 9;
  const angs = (toeGap ? [-64, -36, -10, 34, 62] : [-60, -30, 0, 30, 60]).map(a => (a + splay) * Math.PI / 180);
  const toeW = 0.24;
  const lobe = (a: number) => { let m = 0; for (const t of angs) m = Math.max(m, Math.exp(-((wrapAng(a - t) / toeW) ** 2))); return m; };
  const prof: [number, number][] = [[0, 0.02], [1.8, 0.0], [2.85, 0.02], [3.25, 0.12], [3.42, 0.36], [3.45, 0.66], [3.38, 1.0], [3.25, 1.4], [3.1, 1.85], [3.0, 2.3], [2.95, 2.7]];
  const NA = 96;
  const start = pb.count;
  const p = new THREE.Vector3();
  const seed = rng() * 10;
  for (let i = 0; i < prof.length; i++) {
    const [r0, y] = prof[i];
    const toeK = 1 - smoothstep(0.5, 1.6, y);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2 - Math.PI;
      const fwd = Math.cos(a);
      const lb = lobe(a) * smoothstep(-0.2, 0.3, fwd);
      // the toes push the front of the pad out into lobes; creases run up between them
      const r = r0 * (1 + 0.08 * Math.max(0, fwd) ** 2 + (lb * 0.17 - (1 - lb) * 0.1 * smoothstep(0, 0.4, fwd)) * toeK) * (i > 3 ? 1 + 0.03 * Math.sin(y * 7 + a * 3 + seed) : 1);
      p.set(Fc.x + Math.sin(a) * r, y, Fc.z + Math.cos(a) * r);
      const crease = smoothstep(0.4, 0.0, lb) * smoothstep(0.1, 0.5, fwd) * toeK;
      const ao = i < 2 ? 0.6 : crease * 0.9;
      pb.v(p, LEGSKIN, [1, clamp(noise.fbm(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2) * 1.5 - 0.15 + (y > 1.8 ? 0.2 : 0)), ao, KIND.bark], wF, y * 1.6 + 0.1 * Math.sin(a * 3 + seed));
    }
  }
  pb.rows(start, prof.length, NA, true);
  const c0 = pb.v(new THREE.Vector3(Fc.x, 2.75, Fc.z), LEGSKIN, [1, 0, 0, KIND.bark], wF);
  for (let j = 0; j < NA; j++) pb.t(c0, start + (prof.length - 1) * NA + ((j + 1) % NA), start + (prof.length - 1) * NA + j);
  // the nails: broad, blunt, a little domed, set into the front of each toe
  angs.forEach((a) => {
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const sideV = new THREE.Vector3(dir.z, 0, -dir.x);
    const rr = 3.4 * (1 + 0.08 * Math.max(0, Math.cos(a)) ** 2 + 0.17);
    const nc = new THREE.Vector3(Fc.x, 0, Fc.z).addScaledVector(dir, rr - 0.3);
    const hw = 0.5 + rng() * 0.06;
    blob(nc, 16, 8, (sx, sy, sz) => {
      const q = nc.clone().addScaledVector(sideV, sx * hw).addScaledVector(dir, sz * (sz > 0 ? 0.3 : 0.25));
      q.y = Math.max(0.03, 0.34 + sy * 0.28 - 0.05 * sz);
      return { p: q, c: NAIL.clone().multiplyScalar(0.94 + 0.08 * sy), s: [0.15, 0, sz < -0.2 ? 0.35 : 0, KIND.nail], w: wF };
    });
  });
  // where the stone wedges in (between the third and fourth toes of the front left foot)
  const slotA = (angs[2] + angs[3]) / 2;
  return new THREE.Vector3(Fc.x + Math.sin(slotA) * 3.3, 0.6, Fc.z + Math.cos(slotA) * 3.3);
}
const wrapAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------------------------------------ body, neck, tail

function torsoPart(pb: PartB) {
  const c = new THREE.Vector3(0, 12.0, -4), r = new THREE.Vector3(13.0, 3.7, 20.0);
  const NU = 48, NVv = 28, start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i <= NVv; i++) {
    const v = (i / NVv) * Math.PI;
    for (let j = 0; j < NU; j++) {
      const u = (j / NU) * Math.PI * 2;
      p.set(Math.sin(v) * Math.cos(u) * r.x, Math.cos(v) * r.y, Math.sin(v) * Math.sin(u) * r.z).add(c);
      const bs = bandSkin(-p.y * 1.3 + p.z * 0.15, u * 3, 1.1, 0.04, 2.0);
      p.x = c.x + (p.x - c.x) * bs.scale; p.z = c.z + (p.z - c.z) * bs.scale;
      pb.v(p, LEGSKIN, [1, 0, 0.3 + bs.crease * 0.3, KIND.bark], [[BONE.body, 1]], bs.fold);
    }
  }
  pb.rows(start, NVv + 1, NU, true);
}

/** The neck: long and strong, growing out from under the front of the shell in the same rocky, folded hide as
 * the legs, under a heavy mane of moss; it pales up its length into the elk's creamy hide. */
function neckPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 12.0, 10.5), REST[BONE.neck0], REST[BONE.neck1], REST[BONE.neck2], REST[BONE.neck3], REST[BONE.head], HEAD_POS.clone().addScaledVector(HEAD_FWD, 0.9)];
  const NN = 96, NA = 52;
  const fr = curveFrames(pts, NN, new THREE.Vector3(0, 1, 0));
  const S = fr.ctlS;
  const rad = mono(S, [6.2, 6.0, 5.5, 4.7, 3.85, 3.0, 2.4]);
  const bones = [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head, BONE.head];
  const start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i < NN; i++) {
    const s = (i / (NN - 1)) * fr.len, t = s / fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2; // 0 = top
      const up = Math.cos(ang), sd = Math.sin(ang);
      const under = Math.max(0, -up);
      // where the rock hide gives way to the pale hide: lower on the throat, higher along the mane
      const pale = smoothstep(0.42, 0.66, t + 0.08 * under - 0.06 * Math.max(0, up) + 0.05 * noise.n3(ang * 1.5, s * 0.3, 2.2));
      // heavy folds across the rocky part, finer wrinkles across the throat higher up
      const bs = bandSkin(s, ang, 0.95 - 0.3 * pale, 0.018 * (1 - pale), 4.4);
      const r = rad(s) * bs.scale;
      p.copy(fr.C[i]).addScaledVector(fr.N[i], up * r * (up < 0 ? 1.06 : 1)).addScaledVector(fr.B[i], sd * r * 0.92);
      const c = LEGSKIN.clone().lerp(HIDE, pale).lerp(HIDE_D, under * 0.3 * pale);
      // the mane of moss down the top of the neck and over its shoulders, in ragged tongues
      const mossN = noise.fbm(s * 0.4, ang * 1.3, 1.7, 3);
      const moss = clamp(smoothstep(-0.2, 0.7, up) * 1.5 - 0.35 + mossN * 1.3 - smoothstep(0.55, 0.95, t) * 0.7 + (1 - pale) * 0.15);
      pb.v(p, c, [1 - pale * 0.92, moss, bs.crease * 0.6 * (1 - pale * 0.6), pale > 0.5 ? KIND.hide : KIND.bark], chainWeights(s, S.slice(0, 6), bones.slice(0, 6), 1), bs.fold);
    }
  }
  pb.rows(start, NN, NA, true);
  return { ...fr, R: fr.C.map((_, i) => rad((i / (NN - 1)) * fr.len)) };
}

function tailPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 11.0, -21.5), REST[BONE.tail0], REST[BONE.tail1], new THREE.Vector3(0, 7.0, -31.8)];
  const NN = 26, NA = 24;
  const fr = curveFrames(pts, NN, new THREE.Vector3(0, 1, 0));
  const rad = mono(fr.ctlS, [2.6, 2.0, 1.15, 0.2]);
  const start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i < NN; i++) {
    const s = (i / (NN - 1)) * fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      const bs = bandSkin(s, ang, 0.55, 0.08, 6.1);
      const r = rad(s) * bs.scale;
      p.copy(fr.C[i]).addScaledVector(fr.N[i], Math.cos(ang) * r).addScaledVector(fr.B[i], Math.sin(ang) * r);
      pb.v(p, LEGSKIN, [1, clamp(Math.cos(ang) * 0.6), bs.crease * 0.7, KIND.bark], chainWeights(s, fr.ctlS.slice(0, 3), [BONE.body, BONE.tail0, BONE.tail1], 1), bs.fold);
    }
  }
  pb.rows(start, NN, NA, true);
  return fr.C;
}

// ------------------------------------------------------------------------------------------------ head

function headPart(pb: PartB) {
  const NZ = 84, NA = 60;
  const wH: W = [[BONE.head, 1]];
  const start = pb.count, p = new THREE.Vector3();
  const eyeL = EYE_LOCAL;
  for (let i = 0; i < NZ; i++) {
    const z = HEAD_Z0 + (HEAD_Z1 - HEAD_Z0) * Math.pow(i / (NZ - 1), 0.92);
    for (let j = 0; j < NA; j++) {
      const phi = (j / NA) * Math.PI * 2;
      const q = headSurface(z, phi);
      let x = q.x, y = q.y, zz = z;
      const ax = Math.abs(x), sx = Math.sign(x) || 1;
      // the eye sockets: the surface sinks under the eyeball, and a soft brow rises over it
      const dy = y - eyeL.y, dz = z - eyeL.z;
      const de = Math.hypot(dy, dz);
      if (ax > 0.6) {
        const sink = 1 - smoothstep(EYE_RADIUS * 0.86, EYE_RADIUS * 1.2, de);
        void sink; // (no socket: the eyeball sits flush, a little proud of the hide)
        // a heavy brow ridge, so the eye sits deep under it and looks sleepy and kind
        const brow = Math.exp(-((dy - 0.45 + 0.08 * dz) ** 2) / 0.035 - (dz + 0.05) ** 2 / 0.45);
        x += sx * brow * 0.26; y += brow * 0.12;
        // the cheekbone: a soft ridge from under the eye running forward and down towards the muzzle
        x += sx * 0.15 * Math.exp(-((dy + 0.62 + 0.16 * dz) ** 2) / 0.05 - ((dz - 0.3) ** 2) / 1.3);
        // the hollow of the temple behind the eye
        x -= sx * 0.06 * Math.exp(-((dy - 0.1) ** 2) / 0.12 - ((dz + 0.85) ** 2) / 0.12);
      }
      // the nostrils: two big soft comma-shaped dents on the front corners of the nose
      const nzc = 4.68, nyc = headRing(nzc).yc + 0.15;
      const nz = z - nzc, ny = y - nyc;
      const nost = Math.exp(-((ax - 0.5 + ny * 0.25) ** 2) / 0.025 - (ny * ny) / 0.04 - (nz * nz) / 0.05) * (ax > 0.2 ? 1 : 0);
      // a soft rim round each nostril, the dent deep inside it
      const rimN = Math.exp(-((ax - 0.52 + ny * 0.25) ** 2) / 0.07 - (ny * ny) / 0.1 - (nz * nz) / 0.12) * (ax > 0.15 ? 1 : 0);
      x += sx * (rimN * 0.07 - nost * 0.2);
      // the lips: closed, the upper lip soft and heavy, overhanging the chin a little (no drawn line)
      const ly = mouthY(Math.min(MOUTH_Z1, Math.max(MOUTH_Z0, z)));
      const lipK = smoothstep(MOUTH_Z0, MOUTH_Z0 + 0.8, z) * (1 - smoothstep(MOUTH_Z1 - 0.1, MOUTH_Z1 + 0.25, z));
      const below = smoothstep(ly + 0.05, ly - 0.25, y);
      x -= sx * below * lipK * 0.06 * Math.min(1, ax);
      const mouth = Math.exp(-(((y - ly) / 0.08) ** 2)) * lipK * 0.35;
      headPoint(x, y, zz, p);
      // the nose: soft, dark and velvety over the front of the muzzle, fading back
      const nose = smoothstep(4.15, 4.7, z) * smoothstep(-0.45, 0.2, y - headRing(z).yc + 0.35);
      const under = smoothstep(-0.1, -0.7, Math.cos(phi));
      // the coat: cream, in soft patches of warmer and paler hair; warmer brown down the muzzle and round the eye
      const patch = noise.fbm(x * 0.9 + 3, y * 0.9, z * 0.9, 2);
      const muzzle = smoothstep(2.4, 4.0, z) * (1 - under * 0.7);
      const eyeP = ax > 0.4 ? Math.exp(-(de * de) / 0.7) : 0;
      const c = HIDE.clone().lerp(HIDE_W, clamp(patch * 1.4 + 0.1) * 0.45).lerp(HIDE_L, under * 0.6 * (1 - nose))
        .lerp(WARM, muzzle * 0.8).lerp(WARM_D, eyeP * 0.85).lerp(HIDE_D, smoothstep(1.1, 0.2, z) * 0.2)
        .lerp(NOSE, nose * 0.9).lerp(MOUTH, mouth).lerp(NOSE_D, Math.min(1, nost * 1.3)).lerp(WARM_D, rimN * (1 - nost) * 0.4);
      const moss = clamp(smoothstep(0.45, 0.9, Math.cos(phi)) * smoothstep(2.2, -0.2, z) * 1.4 + noise.fbm(x, y, z, 2) * 0.9 - 0.25);
      pb.v(p, c, [0.08, moss, mouth * 0.4 + nost * 0.5, KIND.hide], wH);
    }
  }
  pb.rows(start, NZ, NA, true);
  // caps: the nose tip and the back (hidden in the neck)
  const tip = pb.v(headPoint(0, headRing(HEAD_Z1).yc, HEAD_Z1 + 0.02), NOSE, [0, 0, 0, KIND.hide], wH);
  for (let j = 0; j < NA; j++) pb.t(tip, start + (NZ - 1) * NA + j, start + (NZ - 1) * NA + ((j + 1) % NA));
  const back = pb.v(headPoint(0, 0.05, HEAD_Z0 - 0.02), HIDE, [0, 0, 0, KIND.hide], wH);
  for (let j = 0; j < NA; j++) pb.t(back, start + ((j + 1) % NA), start + j);
}

/** Geometries collected during one build. */
let GEOS: THREE.BufferGeometry[] = [];

/** A sphere-ish blob (u round, v top to bottom) placed by a function, as its own part (normals face away from c). */
function blob(c: THREE.Vector3, nu: number, nv: number, f: (sx: number, sy: number, sz: number) => { p: THREE.Vector3; c: THREE.Color; s: Skin; w: W }) {
  const pb = new PartB();
  for (let i = 0; i <= nv; i++) {
    const v = (i / nv) * Math.PI;
    for (let j = 0; j < nu; j++) {
      const u = (j / nu) * Math.PI * 2;
      const r = f(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      pb.v(r.p, r.c, r.s, r.w);
    }
  }
  pb.rows(0, nv + 1, nu, true);
  GEOS.push(pb.geo(p => new THREE.Vector3().subVectors(p, c)));
}

/** Normals away from the nearest of a set of centre points. */
const awayFrom = (C: THREE.Vector3[]) => (p: THREE.Vector3) => { let bi = 0, bd = 1e9; C.forEach((c, i) => { const d = c.distanceToSquared(p); if (d < bd) { bd = d; bi = i; } }); return new THREE.Vector3().subVectors(p, C[bi]); };

function eyesPart() {
  for (const side of [1, -1] as const) {
    const eb = side > 0 ? BONE.eyeL : BONE.eyeR, lb = side > 0 ? BONE.lidL : BONE.lidR;
    const C = REST[eb];
    // the eye looks out to the side and a little forwards
    const o = headDir(side, 0.05, 0.32);
    const up = HEAD_UP.clone().addScaledVector(o, -HEAD_UP.dot(o)).normalize();
    const fw = new THREE.Vector3().crossVectors(up, o).multiplyScalar(side);
    const IRIS = col('#6a4428'), PUPIL = col('#160d08'), RING = col('#3a2416'), WHITE = col('#4a3424');
    // the eyeball: almost all dark iris (a deer's eye), a warm brown ring, a hint of white at the corners
    blob(C, 32, 22, (sx, sy, sz) => {
      const d = new THREE.Vector3().addScaledVector(fw, sx).addScaledVector(up, sy).addScaledVector(o, sz);
      const a = Math.acos(clamp(d.dot(o), -1, 1));
      const c = a < 0.5 ? PUPIL.clone().lerp(IRIS, smoothstep(0.34, 0.5, a)) : a < 1.05 ? IRIS.clone().lerp(RING, smoothstep(0.7, 1.0, a)) : RING.clone().lerp(WHITE, smoothstep(1.05, 1.3, a));
      // (the shader paints the eye from its place on the eyeball: across, up, and the angle off its axis)
      return { p: C.clone().addScaledVector(d, EYE_R), c, s: [sx, sy, a, KIND.eye], w: [[eb, 1]] };
    });
    // catchlights, fixed to the head so they stay put while the eye looks about: a soft window of sky up and
    // forward, and a small bright one under it
    for (const [ux, uy, rr] of [[0.22, 0.3, 0.06], [0.38, -0.1, 0.03]] as const) {
      const hl = C.clone().addScaledVector(o, EYE_R * 0.985).addScaledVector(up, EYE_R * uy).addScaledVector(fw, EYE_R * ux);
      blob(hl, 8, 5, (sx, sy, sz) => ({ p: hl.clone().addScaledVector(fw, sx * rr).addScaledVector(up, sy * rr * 0.8).addScaledVector(o, sz * rr * 0.12), c: col('#fffaf0'), s: [0, 0, 9, KIND.eye], w: [[BONE.head, 1]] }));
    }
    // the upper lid: a thin shell over the top of the eyeball, turning down about the eye's forward axis to blink
    {
      const pb = new PartB();
      const NU = 22, NV = 9, start = 0;
      for (let s = 0; s < 2; s++) {
        const rr = EYE_R * (s === 0 ? 1.08 : 1.03);
        for (let i = 0; i < NV; i++) {
          for (let j = 0; j < NU; j++) {
            const az = -1.25 + (j / (NU - 1)) * 2.5;
            // elevation from the eye's axis towards up; the edge droops at the corners to meet the lower lid,
            // so the open eye is an almond, not a round hole
            const el = 0.42 - (i === 0 ? 0.42 : 0.42 * (1 - i / (NV - 1))) * (az / 1.25) ** 2 + (i / (NV - 1)) * 1.25;
            const d = new THREE.Vector3().addScaledVector(o, Math.cos(el) * Math.cos(az)).addScaledVector(fw, Math.cos(el) * Math.sin(az)).addScaledVector(up, Math.sin(el));
            const edge = i <= 1;
            // a soft heavy lid of warm hide, with a dark lash line along its edge
            pb.v(C.clone().addScaledVector(d, rr * (i === 0 && s === 0 ? 1.04 : 1)), edge ? col(i === 0 ? '#1e1610' : '#6e5038') : WARM_D.clone().lerp(HIDE, 0.25 + 0.2 * smoothstep(2, NV - 1, i)), [0.05, 0, edge ? 0.25 : 0, KIND.hide], [[lb, 1]]);
          }
        }
      }
      // outer and inner surfaces, stitched along the lash edge
      for (let s = 0; s < 2; s++) for (let i = 0; i < NV - 1; i++) for (let j = 0; j < NU - 1; j++) {
        const base = start + s * NV * NU, a = base + i * NU + j, b = a + 1, c = a + NU, d = c + 1;
        if (s === 0) { pb.t(a, b, c); pb.t(b, d, c); } else { pb.t(a, c, b); pb.t(b, c, d); }
      }
      for (let j = 0; j < NU - 1; j++) { const a = start + j, b = a + 1, c = start + NV * NU + j, d = c + 1; pb.t(a, c, b); pb.t(b, c, d); }
      // (the outer shell must face away from the eye; the inner one faces it, and the vote follows the outer)
      GEOS.push(pb.geo(q => new THREE.Vector3().subVectors(q, C)));
    }
    // the lower lid: a soft fixed fold of hide over the bottom of the eyeball, so the open eye is an almond
    {
      const pb = new PartB();
      const NU = 22, NV = 7;
      for (let i = 0; i < NV; i++) {
        const el = -0.42 - (i / (NV - 1)) * 1.1;
        for (let j = 0; j < NU; j++) {
          const az = -1.3 + (j / (NU - 1)) * 2.6;
          // the edge rises a little towards the corners of the eye
          const e2 = el + (i === 0 ? 0.36 * (az / 1.3) ** 2 : 0.36 * (1 - i / (NV - 1)) * (az / 1.3) ** 2);
          const d = new THREE.Vector3().addScaledVector(o, Math.cos(e2) * Math.cos(az)).addScaledVector(fw, Math.cos(e2) * Math.sin(az)).addScaledVector(up, Math.sin(e2));
          const c = i === 0 ? col('#2a1e16') : i === 1 ? WARM_D.clone().lerp(HIDE, 0.15) : WARM_D.clone().lerp(HIDE, 0.25 + smoothstep(1, NV - 1, i) * 0.25);
          pb.v(C.clone().addScaledVector(d, EYE_R * (i === 0 ? 1.06 : 1.1)), c, [0.05, 0, i === 0 ? 0.25 : 0.05, KIND.hide], [[BONE.head, 1]]);
        }
      }
      for (let i = 0; i < NV - 1; i++) for (let j = 0; j < NU - 1; j++) { const a = i * NU + j, b = a + 1, c = a + NU, d = c + 1; pb.t(a, c, b); pb.t(b, c, d); }
      GEOS.push(pb.geo(q => new THREE.Vector3().subVectors(q, C)));
    }
  }
}

function earsPart() {
  for (const side of [1, -1] as const) {
    const eb = side > 0 ? BONE.earL : BONE.earR;
    const root = REST[eb];
    const L = headDir(0.96 * side, 0.16, -0.32); // out to the side, barely up, and back
    const n0 = headDir(0.1 * side, 0.55, 1); // the ear's open face looks forwards and a little up
    const N = n0.clone().addScaledVector(L, -n0.dot(L)).normalize();
    const Wd = new THREE.Vector3().crossVectors(L, N);
    const pb = new PartB();
    const NL = 18, NC = 16, start = 0;
    const INNER = col('#e7c4ae'), RIM = col('#bfae8e');
    for (let i = 0; i <= NL; i++) {
      const l = i / NL;
      const hw = 0.62 * Math.pow(Math.sin(Math.PI * Math.pow(l, 0.75)), 0.8) + 0.02;
      const thick = 0.1 * (1 - l) + 0.02;
      for (let j = 0; j < NC; j++) {
        const a = (j / NC) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        // cupped: the edges curl forwards round the open face
        const cup = 0.32 * hw * c * c;
        const q = root.clone().addScaledVector(L, (l * 2.05 + 0.1 * c * c * l) * HEAD_SCALE).addScaledVector(Wd, c * hw * HEAD_SCALE).addScaledVector(N, (s * thick + cup - 0.05) * HEAD_SCALE);
        const inner = s > 0.25 && Math.abs(c) < 0.85;
        pb.v(q, inner ? INNER.clone().lerp(HIDE, smoothstep(0.6, 0.95, l)) : Math.abs(c) > 0.9 ? RIM : HIDE, [0.05, 0, inner ? 0.35 * (1 - Math.abs(c)) : 0, KIND.hide], [[eb, 1]]);
      }
    }
    pb.rows(start, NL + 1, NC, true);
    GEOS.push(pb.geo(p => { const d = new THREE.Vector3().subVectors(p, root); return d.addScaledVector(L, -d.dot(L)); }));
  }
}

// ------------------------------------------------------------------------------------------------ antlers

export interface AntlerTip { p: THREE.Vector3; up: boolean }
export interface Branch { pts: THREE.Vector3[]; r0: number; r1: number }

/** One antler's branches (main beam, tines and their forks), in creature space: huge, thick at the base,
 * spreading out sideways and back and rising in many forked tines, like a crown of bare driftwood. */
function antlerBranches(side: 1 | -1, rng: () => number): Branch[] {
  const base = headPoint(ANTLER_LOCAL.x * side, ANTLER_LOCAL.y, ANTLER_LOCAL.z);
  const K = HEAD_SCALE;
  const dirOf = (x: number, y: number, z: number) => new THREE.Vector3().addScaledVector(HEAD_SIDE, x * side).addScaledVector(HEAD_UP, y).addScaledVector(HEAD_FWD, z).normalize();
  const H = (x: number, y: number, z: number) => base.clone().addScaledVector(HEAD_SIDE, x * side * K).addScaledVector(HEAD_UP, y * K).addScaledVector(HEAD_FWD, z * K);
  const out: Branch[] = [];
  // the main beam: out sideways and up, then sweeping back, with a gentle twist of its own
  const beam = [H(0, -0.25, 0), H(1.1, 0.6, -0.5), H(2.5, 1.2, -1.3), H(3.9, 1.7, -2.3), H(5.2, 2.3, -3.3), H(6.3, 3.1, -4.2), H(7.1, 4.0, -4.9), H(7.6, 5.0, -5.3)];
  for (let i = 2; i < beam.length; i++) beam[i].add(new THREE.Vector3((rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4));
  out.push({ pts: beam, r0: 0.78 * K, r1: 0.22 * K });
  const bc = new THREE.CatmullRomCurve3(beam, false, 'centripetal');
  const up = new THREE.Vector3(0, 1, 0);
  /** A tine from p0 along dir, curving up as it goes, crooked like driftwood; it forks. */
  const tine = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const pts = [p0.clone().addScaledVector(dir, -0.15 * K)];
    let q = p0.clone(); const dd = dir.clone();
    for (let k = 1; k <= 4; k++) {
      dd.lerp(up, 0.14).add(new THREE.Vector3((rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25)).normalize();
      q = q.clone().addScaledVector(dd, len / 4); pts.push(q);
    }
    out.push({ pts, r0: r, r1: Math.max(0.07 * K, r * 0.28) });
    if (depth > 0 && len > 1.6 * K) {
      const c = new THREE.CatmullRomCurve3(pts);
      const nf = 1 + (rng() < 0.6 ? 1 : 0);
      for (let f = 0; f < nf; f++) {
        const at = 0.42 + f * 0.25 + rng() * 0.1;
        const t0 = c.getPoint(at), tg = c.getTangent(at);
        let ax = new THREE.Vector3().crossVectors(tg, up);
        if (ax.lengthSq() < 0.01) ax = HEAD_SIDE.clone(); else ax.normalize();
        // forks lean alternately out and back from their branch, so the crown fills out
        const fd = tg.clone().applyAxisAngle(ax, (f % 2 ? -1 : 1) * (0.55 + rng() * 0.3)).applyAxisAngle(up, (rng() - 0.5) * 1.2).normalize();
        tine(t0, fd, len * (0.45 + rng() * 0.15), r * 0.62, depth - 1);
      }
    }
  };
  // [where along the beam, direction (head-local: x out, y up, z forward), length, radius]
  const tines: [number, [number, number, number], number, number][] = [
    [0.08, [0.25, 0.7, 0.85], 2.6, 0.34],  // the brow tine, reaching forwards over the eye
    [0.2, [0.3, 1.0, 0.45], 3.6, 0.34],
    [0.33, [0.15, 1.0, 0.1], 4.4, 0.32],
    [0.46, [0.5, 1.0, -0.2], 4.0, 0.3],
    [0.58, [-0.1, 1.0, 0.3], 3.8, 0.28],
    [0.7, [0.7, 0.9, -0.3], 3.2, 0.25],
    [0.8, [0.0, 1.0, -0.6], 3.0, 0.23],
    [0.9, [0.8, 0.7, -0.5], 2.4, 0.2],
  ];
  for (const [t, d, len, r] of tines) {
    tine(bc.getPoint(t), dirOf(...d), len * K * (0.9 + rng() * 0.2), r * K, t > 0.1 ? 2 : 1);
  }
  // the end of the beam splits into a fork
  tine(bc.getPoint(0.97), dirOf(0.6, 1, -0.3), 2.0 * K, 0.2 * K, 1);
  return out;
}

function antlerPart(branches: Branch[]) {
  const tips: AntlerTip[] = [];
  const wH: W = [[BONE.head, 1]];
  const base = branches[0].pts[0];
  for (const b of branches) {
    const curve = new THREE.CatmullRomCurve3(b.pts, false, 'centripetal');
    const len = curve.getLength();
    const NL = Math.max(6, Math.round(len * 1.9)), NA = b.r0 > 0.6 ? 14 : b.r0 > 0.3 ? 10 : 7;
    const ref = Math.abs(curve.getTangent(0).y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const fr = curveFrames(b.pts, NL, ref);
    const pb = new PartB();
    const start = 0;
    for (let i = 0; i < NL; i++) {
      const t = i / (NL - 1);
      // tapering to a rounded tip; the beam has a knobbly burr ring at its root
      let r = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.8);
      if (t > 0.92) r *= Math.sqrt(Math.max(0.05, 1 - ((t - 0.92) / 0.08) ** 2));
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * Math.PI * 2;
        const knob = 1 + 0.12 * noise.n3(fr.C[i].x * 2.5 + a, fr.C[i].y * 2.5, fr.C[i].z * 2.5);
        const q = fr.C[i].clone().addScaledVector(fr.N[i], Math.cos(a) * r * knob).addScaledVector(fr.B[i], Math.sin(a) * r * knob);
        const dBase = q.distanceTo(base);
        const c = ANTLER_B.clone().lerp(ANTLER, smoothstep(0.4, 2.2, dBase));
        const moss = clamp(noise.fbm(q.x * 0.9, q.y * 0.9, q.z * 0.9, 3) * 1.6 + 0.05 - smoothstep(3, 9, dBase) * 0.3);
        pb.v(q, c, [0.12, moss, 0, KIND.antler], wH);
      }
    }
    pb.rows(start, NL, NA, true);
    const end = pb.v(fr.C[NL - 1].clone().addScaledVector(fr.T[NL - 1], 0.02), ANTLER, [0, 0, 0, KIND.antler], wH);
    for (let j = 0; j < NA; j++) pb.t(end, start + (NL - 1) * NA + j, start + (NL - 1) * NA + ((j + 1) % NA));
    GEOS.push(pb.geo(awayFrom(fr.C)));
    tips.push({ p: fr.C[NL - 1].clone(), up: fr.T[NL - 1].y > 0.6 });
  }
  // the burr: a knobbly ring where the antler leaves the skull
  const t0 = branches[0];
  const fr = curveFrames(t0.pts, 40, new THREE.Vector3(0, 0, 1));
  const c0 = fr.C[2], n = fr.T[2];
  const a1 = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize(), a2 = new THREE.Vector3().crossVectors(n, a1);
  const pb = new PartB();
  const start = 0, NU = 24, NR = 8;
  const ringC: THREE.Vector3[] = [];
  for (let i = 0; i < NU; i++) {
    const a = (i / NU) * Math.PI * 2;
    const rc = a1.clone().multiplyScalar(Math.cos(a)).addScaledVector(a2, Math.sin(a));
    const ring = c0.clone().addScaledVector(rc, t0.r0 * 0.98);
    ringC.push(ring);
    for (let k = 0; k < NR; k++) {
      const b = (k / NR) * Math.PI * 2;
      const tr = 0.24 * (1 + 0.4 * Math.max(0, Math.sin(a * 5 + 1)));
      pb.v(ring.clone().addScaledVector(rc, Math.cos(b) * tr).addScaledVector(n, Math.sin(b) * tr), ANTLER_B, [0.3, 0.3, 0, KIND.antler], wH);
    }
  }
  pb.rows(start, NU, NR, true);
  for (let k = 0; k < NR; k++) { const a = start + (NU - 1) * NR + k, b = start + (NU - 1) * NR + ((k + 1) % NR), c = start + k, d = start + ((k + 1) % NR); pb.t(a, c, b); pb.t(b, c, d); }
  GEOS.push(pb.geo(awayFrom(ringC)));
  return tips;
}

// ------------------------------------------------------------------------------------------------ moss lumps

/** A soft, lumpy cushion of moss sitting on a surface (centre, surface normal, radius), one part. */
function mossLump(c: THREE.Vector3, n: THREE.Vector3, r: number, w: W, rng: () => number, flat = 0.5, res = 1) {
  const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(n.x) > 0.9) t1.set(0, 0, 1);
  const a = t1.addScaledVector(n, -t1.dot(n)).normalize(), b = new THREE.Vector3().crossVectors(n, a);
  const seed = rng() * 100;
  const shade = MOSS[Math.floor(rng() * MOSS.length)];
  blob(c, Math.round(9 * res), Math.round(6 * res), (sx, sy, sz) => {
    const k = 1 + 0.28 * noise2.n3(sx * 1.8 + seed, sy * 1.8, sz * 1.8) + 0.12 * noise2.n3(sx * 4 + seed, sy * 4, sz * 4);
    const yy = sy < 0 ? sy * 0.35 : sy;
    const q = c.clone().addScaledVector(a, sx * r * k).addScaledVector(b, sz * r * k).addScaledVector(n, (yy * r * flat - r * 0.12) * k);
    const cc = shade.clone().multiplyScalar(0.82 + 0.3 * Math.max(0, sy));
    return { p: q, c: cc, s: [0, 1, sy < 0 ? 0.5 : 0, KIND.moss], w };
  });
}

// ------------------------------------------------------------------------------------------------ build

export interface AmbleBodyBuild {
  geometry: THREE.BufferGeometry;
  triangles: number;
  /** Shell columns: angle, outline point, outward normal and the profile (rho, y), for growth and the village. */
  shell: ShellData;
  antlerBranches: Branch[];
  antlerTips: AntlerTip[];
  /** Where the stone wedges between two toes of the front left foot (creature space, rest). */
  stoneSlot: THREE.Vector3;
  /** The mouth (creature space, rest): the front of the lips. */
  mouth: THREE.Vector3;
  neck: ReturnType<typeof curveFrames> & { R: number[] };
  legs: Record<Leg, ReturnType<typeof legPart>>;
  /** Points on the shell's top terraces where moss lumps sit, for the growth to avoid or use. */
  lumps: { p: THREE.Vector3; n: THREE.Vector3; r: number }[];
}

export function buildAmbleBody(seed = 3): AmbleBodyBuild {
  const rng = townRng(seed);
  const geos: THREE.BufferGeometry[] = [];
  GEOS = geos;
  const add = (pb: PartB, outward?: (p: THREE.Vector3) => THREE.Vector3) => { if (pb.count) geos.push(pb.geo(outward)); };

  // shell (its own index layout: columns round the shell)
  const sp = new PartB();
  const shell = shellPart(sp, rng);
  shellIndices(sp, 0, shell.cols.length, shell.NV);
  add(sp, p => new THREE.Vector3(p.x, (p.y - 14) * 1.5, p.z - SHELL.cz));

  const tp = new PartB(); torsoPart(tp); add(tp, p => new THREE.Vector3(p.x, p.y - 12.0, p.z + 4));
  const legs = {} as Record<Leg, ReturnType<typeof legPart>>;
  let stoneSlot = new THREE.Vector3();
  for (const l of LEGS) {
    const lp = new PartB();
    const fr = legPart(lp, l, rng); legs[l] = fr;
    add(lp, awayFrom(fr.C));
    const fp = new PartB();
    const slot = footPart(fp, l, rng, l === 'FL');
    if (l === 'FL') stoneSlot = slot;
    const F = FOOT_REST[l];
    add(fp, p => new THREE.Vector3(p.x - F.x, p.y - 0.8, p.z - F.z));
  }
  const np = new PartB(); const neck = neckPart(np);
  add(np, awayFrom(neck.C));
  const tl = new PartB(); const tailC = tailPart(tl); add(tl, awayFrom(tailC));
  const hp = new PartB(); headPart(hp);
  const headC: THREE.Vector3[] = []; for (let z = HEAD_Z0; z <= HEAD_Z1; z += 0.2) headC.push(headPoint(0, headRing(z).yc, z));
  add(hp, awayFrom(headC));
  eyesPart();
  earsPart();
  const antlerBr = [...antlerBranches(1, rng), ...antlerBranches(-1, rng)];
  const tips = antlerPart(antlerBr);

  // ---- moss: mounds over the dome's treads and along the lips of its ledges, cushions on the upper plates,
  // round the neck where it leaves the shell, down the neck's mane, on the crown and on the legs
  const lumps: AmbleBodyBuild['lumps'] = [];
  const wS: W = [[BONE.shell, 1]];
  const NU = shell.cols.length;
  const topAt = (th: number, rho: number) => {
    const E = outlinePoint(th);
    const x = E.x * rho, z = SHELL.cz + E.z * rho;
    const y = shellTopY(x, z)!;
    const e = 0.4;
    const nx = -(shellTopY(x + e, z)! - shellTopY(x - e, z)!) / (2 * e), nz = -(shellTopY(x, z + e)! - shellTopY(x, z - e)!) / (2 * e);
    return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, 1, nz).normalize() };
  };
  // along each ledge's lip: a ragged line of cushions spilling over the edge
  for (let j = 0; j < NU; j++) {
    const c = shell.cols[j];
    const L = ledges(c.th);
    for (let k = 0; k < 3; k++) {
      if (rng() > 0.3) continue;
      const rho = Math.min(SHELL.rJoin - 0.01, L[k].e - L[k].w * (0.6 + rng() * 0.8));
      const { p, n } = topAt(c.th, rho);
      const nn = n.clone().lerp(new THREE.Vector3(c.out.x, 1, c.out.z).normalize(), 0.4).normalize();
      const r = 0.7 + rng() * 1.0;
      mossLump(p.addScaledVector(nn, 0.05), nn, r, wS, rng, 0.5);
      lumps.push({ p, n: nn, r });
    }
    // the shoulder: fat cushions where the dome rolls over into the plates
    if (rng() < 0.35) {
      const i = c.face[0] + Math.floor(rng() * 6);
      const p = new THREE.Vector3(c.E.x * c.rho[i], c.y[i], SHELL.cz + c.E.z * c.rho[i]);
      const n = new THREE.Vector3(c.out.x, 1.1, c.out.z).normalize();
      const r = 0.9 + rng() * 0.9;
      mossLump(p, n, r, wS, rng, 0.5);
      lumps.push({ p, n, r });
    }
  }
  // mounds scattered over the treads (bigger, flatter)
  for (let k = 0; k < 120; k++) {
    const th = rng() * Math.PI * 2, rho = Math.sqrt(rng()) * (SHELL.rJoin - 0.03);
    if (riserAt(th, rho) > 0.3) continue;
    const { p, n } = topAt(th, rho);
    const r = 0.8 + rng() * 1.4;
    mossLump(p.addScaledVector(n, -0.1), n, r, wS, rng, 0.32);
    lumps.push({ p, n, r });
  }
  // round the neck root and along the mane
  for (let k = 0; k < 150; k++) {
    const s = 0.04 + Math.pow(rng(), 1.5) * 0.66;
    const i = Math.round(s * (neck.C.length - 1));
    // a collar all round the top and sides where the neck leaves the shell, the mane narrowing up the neck
    const ang = (rng() - 0.5) * (s < 0.2 ? 3.6 : 2.6 - s * 1.6);
    const up = neck.N[i], sd = neck.B[i];
    const n = up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(sd, Math.sin(ang)).normalize();
    // (the neck is a little narrower than tall)
    const rr = neck.R[i] * (1 - 0.1 * Math.sin(ang) ** 2);
    const p = neck.C[i].clone().addScaledVector(n, rr * 0.97);
    const sl = i / (neck.C.length - 1) * neck.len;
    mossLump(p, n, (0.7 + rng() * 0.9) * (1.45 - s * 0.9), chainWeights(sl, neck.ctlS.slice(0, 6), [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head], 1), rng, 0.5);
  }
  for (let k = 0; k < 16; k++) {
    const a = (rng() - 0.5) * 1.5;
    const z = HEAD_Z0 + 0.2 + rng() * 2.6;
    const q = headSurface(z, a);
    const p = headPoint(q.x, q.y, z);
    const n = headDir(Math.sin(a), Math.cos(a), 0);
    mossLump(p, n, (0.22 + rng() * 0.22) * HEAD_SCALE, [[BONE.head, 1]], rng, 0.4, 1.4);
  }
  for (const l of LEGS) {
    const fr = legs[l];
    const nk = l.startsWith('F') ? 16 : 10;
    for (let k = 0; k < nk; k++) {
      const i = Math.floor(Math.pow(rng(), 1.3) * fr.C.length * 0.6);
      const ang = (rng() - 0.5) * 3.0 + (Math.sign(fr.C[0].x) > 0 ? -Math.PI / 2 : Math.PI / 2) * 0.4;
      const n = fr.N[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(fr.B[i], Math.sin(ang));
      const p = fr.C[i].clone().addScaledVector(n, fr.R[i] * 0.97);
      const [h, kb] = legBones(l);
      mossLump(p, n, 0.6 + rng() * 0.7, i < fr.C.length * 0.35 ? [[h, 1]] : [[h, 0.5], [kb, 0.5]], rng, 0.4);
    }
  }
  // the mouth's front, between the lips
  const mouth = headPoint(0, mouthY(MOUTH_Z1) - 0.05, HEAD_Z1 - 0.25);

  const geometry = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return { geometry, triangles: geometry.index!.count / 3, shell, antlerBranches: antlerBr, antlerTips: tips, stoneSlot, mouth, neck, legs, lumps };
}

export { chainWeights, curveFrames };
