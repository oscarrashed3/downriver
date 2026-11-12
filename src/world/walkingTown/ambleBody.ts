import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp } from '../noise';
import { townRng } from './rand';
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
//   kind  0 stone and rock-skin, 1 pale hide, 2 antler, 3 eye, 4 toenail, 5 moss lump
//
// It also hands back the anchors the growth and the game need: where vines can hang from the shell's edge,
// the antler tips the birds perch on, where the stone wedges in the front left foot, and where the mouth is.

export type W = [number, number][];
export type Skin = [number, number, number, number];

export const KIND = { stone: 0, hide: 1, antler: 2, eye: 3, nail: 4, moss: 5 } as const;

/** One part: an indexed mesh with skin attributes. Normals are computed per part. */
class PartB {
  P: number[] = []; C: number[] = []; S: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = [];
  v(p: THREE.Vector3, c: THREE.Color, s: Skin, w: W) {
    this.P.push(p.x, p.y, p.z); this.C.push(c.r, c.g, c.b); this.S.push(s[0], s[1], s[2], s[3]);
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
const LEGSKIN = col('#a19f85'), LEGSKIN2 = col('#aaa68a');
const BELLY = col('#7c7a66');
const HIDE = col('#e3d6b6'), HIDE_D = col('#cfc0a0'), HIDE_L = col('#efe6cf');
const NOSE = col('#4f4640'), MOUTH = col('#5a4a40');
const ANTLER = col('#ece4d0'), ANTLER_B = col('#b8aa8e');
const NAIL = col('#e2d8bc');
const MOSS = [col('#6f913e'), col('#7fa046'), col('#8fae50'), col('#a0b95a'), col('#62853a')];

// ------------------------------------------------------------------------------------------------ shell

/** The shell's outline point at angle th (0 = the left side +X, PI/2 = the front +Z), at rho = 1. */
export function outlinePoint(th: number, out = new THREE.Vector3()) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / SHELL.pOut;
  const x = SHELL.ax * Math.sign(c) * Math.abs(c) ** e;
  const z = (s >= 0 ? SHELL.azFront : SHELL.azBack) * Math.sign(s) * Math.abs(s) ** e;
  return out.set(x, 0, z);
}
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Smooth periodic noise round the shell (-1..1). */
function ringNoise(th: number, seed: number) {
  return 0.5 * Math.sin(2 * th + seed) + 0.3 * Math.sin(3 * th + seed * 2.3) + 0.2 * Math.sin(5 * th + seed * 0.7);
}

/** The shell's profile at angle th: control points (rho, y) from the top centre out, down the edge and under. */
export function shellControl(th: number) {
  const S = SHELL;
  const front = Math.exp(-((wrapA(th - Math.PI / 2) / 0.34) ** 2));
  const back = Math.exp(-((wrapA(th + Math.PI / 2) / 0.26) ** 2));
  const yTop = S.yTop + 0.4 * ringNoise(th, 1.3);
  const yMid = S.yMid + 0.3 * ringNoise(th, 4.1);
  const yLow = S.yLow + 0.12 * ringNoise(th, 2.2);
  const rTop = S.rTop + 0.05 * ringNoise(th, 0.6);
  const rMid = S.rMid + 0.025 * ringNoise(th, 3.3);
  // a notch over the neck (and a smaller one over the tail): the plates' lip rises into an arch
  const yLip = S.yLip + 6.2 * front + 1.6 * back;
  // the edge: a dome curving out from the rim walk to its widest a third of the way up, then tucking under
  const fy = (k: number) => yLip + (yLow - 0.32 - yLip) * k;
  const pts: [number, number][] = [
    [0, yTop + 1.3], [0.22, yTop + 0.9], [rTop - 0.05, yTop + 0.2], [rTop - 0.01, yTop - 0.05],
    [rTop + 0.015, yTop - 0.75], [rTop + 0.035, yMid + 0.5], [rTop + 0.065, yMid + 0.08],
    [rMid - 0.05, yMid - 0.35], [rMid - 0.01, yMid - 0.55], [rMid + 0.015, yMid - 1.05], [rMid + 0.035, yLow + 0.45], [rMid + 0.065, yLow + 0.06],
    [S.rLedge - 0.02, yLow - 0.08], [S.rLedge + 0.012, yLow - 0.32],
    [0.985, fy(0.86)], [0.998, fy(0.62)], [1.0, fy(0.36)], [0.99, fy(0.17)], [0.966, fy(0.05)], [0.93, yLip], [0.88, yLip - 0.05],
    [0.7, S.yUnder + 0.3 + front * 2], [0.4, S.yUnder], [0.0, S.yUnder],
  ];
  // the control indices bounding the outer face (plates) and the two risers
  return { pts, face: [13, 19], riser1: [3, 6], riser2: [8, 11], yLip, yLow, front };
}

interface ShellData {
  /** Per angle column: the profile samples (rho, y) and the profile normal (nr, ny). */
  cols: { th: number; E: THREE.Vector3; out: THREE.Vector3; rho: number[]; y: number[] }[];
  NV: number;
}

function shellPart(pb: PartB, rng: () => number): ShellData {
  const NU = 240, NV = 124;
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
  // plate rows: the marginal row round the lip (the biggest plates), a middle row and a top row, each half a
  // plate offset from the next
  const rowsN = [Math.round(perim / 4.6), Math.round(perim / 4.1), Math.round(perim / 3.6)];
  const ROW_SPLIT = [0.36, 0.7];
  const bounds = rowsN.map((n, r) => { const b: number[] = []; for (let k = 0; k <= n; k++) b.push(((k + (k > 0 && k < n ? (rng() - 0.5) * 0.45 : 0) + r * 0.5) / n) * perim); return b; });
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
  const plateH = rowsN.map(n => Array.from({ length: n }, () => 0.32 + rng() * 0.3));
  const plateTint = rowsN.map(n => Array.from({ length: n }, () => Math.floor(rng() * STONE.length)));
  const plateMoss = rowsN.map(n => Array.from({ length: n }, () => rng()));
  const start = pb.count;
  const p = new THREE.Vector3();
  const wShell: W = [[BONE.shell, 1]];
  for (let j = 0; j < NU; j++) {
    const th = ths[j];
    const E = outlinePoint(th);
    const R = Math.hypot(E.x, E.z);
    const t0 = outlinePoint(th - 0.002), t1 = outlinePoint(th + 0.002);
    const out = new THREE.Vector3(t1.z - t0.z, 0, -(t1.x - t0.x)).normalize();
    const ctl = shellControl(th);
    const curve = new THREE.CatmullRomCurve3(ctl.pts.map(([r, y]) => new THREE.Vector3(r * R, y, 0)), false, 'centripetal');
    const sp = curve.getSpacedPoints(NV - 1);
    const near = (k: number) => { const [r, y] = ctl.pts[k]; let bi = 0, bd = 1e9; sp.forEach((q, i) => { const d = (q.x - r * R) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
    const f0 = near(ctl.face[0]), f1 = near(ctl.face[1]);
    const r10 = near(ctl.riser1[0]), r11 = near(ctl.riser1[1]), r20 = near(ctl.riser2[0]), r21 = near(ctl.riser2[1]);
    const rho: number[] = [], ys: number[] = [];
    for (let i = 0; i < NV; i++) {
      const q = sp[i];
      // 2D profile normal (outwards from the shell)
      const qa = sp[Math.max(0, i - 1)], qb = sp[Math.min(NV - 1, i + 1)];
      let nr = -(qb.y - qa.y), ny = qb.x - qa.x;
      const nl = Math.hypot(nr, ny) || 1; nr /= nl; ny /= nl;
      let disp = 0, ao = 0, rock = 0.55, moss = 0, tint = STONE[0], scallop = 0;
      // ---- the edge plates
      if (i >= f0 && i <= f1) {
        const fv = (i - f0) / Math.max(1, f1 - f0);
        // fv runs down the face: the top row first
        const row = fv < ROW_SPLIT[0] ? 2 : fv < ROW_SPLIT[1] ? 1 : 0;
        const fvc = row === 2 ? fv / ROW_SPLIT[0] : row === 1 ? (fv - ROW_SPLIT[0]) / (ROW_SPLIT[1] - ROW_SPLIT[0]) : (fv - ROW_SPLIT[1]) / (1 - ROW_SPLIT[1]);
        const { k, fu } = cellOf(row, arcs[j]);
        const b = Math.pow(Math.sin(Math.PI * clamp(fu)), 0.42) * Math.pow(Math.sin(Math.PI * clamp(fvc)), 0.42);
        const h = plateH[row][k] * (row === 0 ? 1.25 : 1.05) * (1 - 0.6 * ctl.front);
        // the plates overlap like roof tiles: each one's lower edge stands out further
        disp = h * (b - 0.32) + h * 0.35 * (fvc - 0.5) * b;
        // the bottom row's plates hang in rounded lobes, so the shell's lower edge is scalloped
        if (row === 0) scallop = 0.75 * Math.pow(Math.sin(Math.PI * clamp(fu)), 0.7) * smoothstep(0.35, 1.0, fvc) * (1 - ctl.front);
        disp += 0.06 * noise.n3(q.x * 0.6 + th * 9, q.y * 0.6, j * 0.01);
        ao = 1 - smoothstep(0.0, 0.42, b);
        rock = 1;
        tint = STONE[plateTint[row][k]];
        // moss creeps over the tops of the upper plates and in tongues further down
        const tongue = noise.fbm(arcs[j] * 0.22, q.y * 0.35, 3.1, 3);
        moss = clamp((row === 2 ? 0.8 - fvc * 0.8 : row === 1 ? 0.45 - fvc * 0.7 : 0.2 - fvc * 0.5) + plateMoss[row][k] * 0.35 + tongue * 0.9 - 0.12);
      } else if ((i > r10 && i < r11) || (i > r20 && i < r21)) {
        // ---- the terrace walls: smaller rough blocks, mossy
        const fv = i > r20 ? (i - r20) / Math.max(1, r21 - r20) : (i - r10) / Math.max(1, r11 - r10);
        const rr = q.x / R;
        const cw = 1.7 / rr;
        const row = Math.floor(fv * 2);
        const s = arcs[j] / cw + row * 0.5 + 0.3 * Math.sin(arcs[j] * 0.13);
        const fu = s - Math.floor(s), fvv = fv * 2 - row;
        const b = Math.pow(Math.sin(Math.PI * fu), 0.35) * Math.pow(Math.sin(Math.PI * clamp(fvv)), 0.35);
        disp = 0.13 * (b - 0.4);
        ao = (1 - smoothstep(0, 0.4, b)) * 0.8;
        rock = 0.9; tint = STONE[(Math.floor(s) + row) % STONE.length];
        moss = clamp(0.5 + noise.fbm(arcs[j] * 0.3, q.y * 0.5, 7.7, 3) * 1.3 - fvv * 0.25);
      } else if (i < f0) {
        // ---- the terrace tops: soft moss and turf, gently uneven
        disp = 0.05 * noise.n3(q.x * 0.5 + th * 4, 0, q.y * 0.5);
        moss = 1; rock = 0.3; tint = STONE[1];
      } else {
        // ---- under the lip
        ao = 0.5 + 0.5 * smoothstep(f1, NV - 1, i); rock = 0.7; tint = BELLY;
      }
      const rr = q.x / R;
      p.set(E.x * rr, q.y, S.cz + E.z * rr);
      p.addScaledVector(out, nr * disp); p.y += ny * disp - scallop;
      rho.push(rr); ys.push(p.y);
      pb.v(p, tint, [rock, moss, ao, KIND.stone], wShell);
    }
    cols.push({ th, E, out, rho, y: ys });
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
  const cell = (ang * 2.3 + band * 0.5 + 0.2 * Math.sin(band * 3.1)) / (Math.PI * 2) * 9;
  const fu = cell - Math.floor(cell);
  const pl = Math.pow(Math.sin(Math.PI * fu), 0.4);
  const scale = 1 + amp * (g - 0.55) + 0.025 * (pl - 0.6);
  const crease = (1 - smoothstep(0.0, 0.22, f)) * 0.9 + (1 - smoothstep(0, 0.35, pl)) * 0.25;
  return { scale, crease: clamp(crease) };
}

function legPart(pb: PartB, l: Leg, rng: () => number) {
  const [h, k, f] = legBones(l);
  const H = REST[h], K = REST[k], A = REST[f];
  const side = Math.sign(H.x), front = l.startsWith('F');
  const top = H.clone().add(new THREE.Vector3(-side * 0.8, 1.6, 0));
  const end = A.clone().add(new THREE.Vector3(0, -0.95, 0.2));
  const NL = 64, NA = 40;
  const fr = curveFrames([top, H, K, A, end], NL, new THREE.Vector3(0, 0, 1));
  const [sTop, sH, sK, sA] = fr.ctlS;
  const rad = mono([sTop, sH, sK, sA, fr.len], front ? [3.25, 3.15, 2.7, 2.38, 2.5] : [3.35, 3.25, 2.8, 2.4, 2.5]);
  const start = pb.count;
  const seed = rng() * 10;
  const p = new THREE.Vector3();
  for (let i = 0; i < NL; i++) {
    const s = (i / (NL - 1)) * fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      // folds: deeper round the knee and above the foot
      const kneeK = Math.exp(-(((s - sK) / 1.1) ** 2)), ankK = Math.exp(-(((s - sA) / 0.8) ** 2));
      const amp = 0.07 + 0.1 * kneeK + 0.06 * ankK;
      const bs = bandSkin(s, ang, 0.78 - 0.18 * kneeK, amp, seed);
      // the back of the knee creases, the front of it bulges
      const fwd = Math.cos(ang);
      let r = rad(s) * bs.scale * (1 + 0.06 * kneeK * fwd - 0.05 * kneeK * Math.max(0, -fwd));
      r *= 1 + 0.035 * noise.n3(Math.cos(ang) * 1.5 + seed, s * 0.35, Math.sin(ang) * 1.5);
      p.copy(fr.C[i]).addScaledVector(fr.N[i], Math.cos(ang) * r).addScaledVector(fr.B[i], Math.sin(ang) * r);
      // moss: on the top of the leg and the outer front, in patches
      const outer = (Math.sin(ang) * -side * 0.5 + 0.5);
      const mossN = noise.fbm(p.x * 0.35, p.y * 0.3, p.z * 0.35, 3);
      const moss = clamp((1 - s / fr.len) * 1.1 - 0.25 + outer * 0.25 + mossN * 1.4 + (kneeK > 0.5 ? 0.1 : 0));
      const ao = clamp(bs.crease * 0.85 + smoothstep(sH, sTop, s) * 0.5);
      const wv: W = s < sH + 0.3 ? [[BONE.body, 1 - smoothstep(sTop + 0.4, sH + 0.3, s)], [h, smoothstep(sTop + 0.4, sH + 0.3, s)]] : chainWeights(s, [sK - 0.7, sK + 0.7, sA - 0.45, sA + 0.3], [h, k, k, f]);
      pb.v(p, mossN > 0.1 ? LEGSKIN2 : LEGSKIN, [1, moss, ao, KIND.stone], wv);
    }
  }
  pb.rows(start, NL, NA, true);
  return fr;
}

function footPart(pb: PartB, l: Leg, rng: () => number, toeGap: boolean) {
  const [, , f] = legBones(l);
  const Fc = FOOT_REST[l];
  const wF: W = [[f, 1]];
  // the pad: round, flaring a little at the bottom, the front pushed out where the toes are
  const prof: [number, number][] = [[0, 0.02], [1.5, 0.0], [2.35, 0.02], [2.7, 0.14], [2.86, 0.45], [2.86, 0.92], [2.7, 1.38], [2.42, 1.88], [2.22, 2.35]];
  const NA = 48;
  const start = pb.count;
  const p = new THREE.Vector3();
  const seed = rng() * 10;
  for (let i = 0; i < prof.length; i++) {
    const [r0, y] = prof[i];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const fwd = Math.cos(a);
      const bs = bandSkin(y + 0.2, a, 0.9, 0.06, seed);
      const r = r0 * (1 + 0.07 * Math.max(0, fwd) ** 2) * (i > 2 ? bs.scale : 1);
      p.set(Fc.x + Math.sin(a) * r, y, Fc.z + Math.cos(a) * r);
      const ao = i < 2 ? 0.6 : bs.crease * 0.6;
      pb.v(p, LEGSKIN, [1, clamp(noise.fbm(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2) * 1.5 - 0.1), ao, KIND.stone], wF);
    }
  }
  pb.rows(start, prof.length, NA, true);
  const c0 = pb.v(new THREE.Vector3(Fc.x, 2.4, Fc.z), LEGSKIN, [1, 0, 0, 0], wF);
  for (let j = 0; j < NA; j++) pb.t(c0, start + (prof.length - 1) * NA + ((j + 1) % NA), start + (prof.length - 1) * NA + j);

  // toes: wide, flat lobes round the front, each with a pale nail
  const angs = toeGap ? [-66, -38, -12, 40, 68] : [-62, -31, 0, 31, 62];
  const widths = toeGap ? [0.7, 0.68, 0.6, 0.6, 0.7] : [0.7, 0.72, 0.74, 0.72, 0.7];
  angs.forEach((deg, ti) => {
    const a = (deg * Math.PI) / 180 + (rng() - 0.5) * 0.04;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const sideV = new THREE.Vector3(dir.z, 0, -dir.x);
    const cTo = new THREE.Vector3(Fc.x, 0, Fc.z).addScaledVector(dir, 2.5);
    const hw = widths[ti] * 1.22, hl = 1.05 + rng() * 0.1, hh = 0.44;
    const ts = pb.count, NU = 20, NVv = 14;
    for (let i = 0; i <= NVv; i++) {
      const v = (i / NVv) * Math.PI; // 0 top .. PI bottom
      for (let j = 0; j < NU; j++) {
        const u = (j / NU) * Math.PI * 2;
        const sx = Math.sin(v) * Math.cos(u), sz = Math.sin(v) * Math.sin(u), sy = Math.cos(v);
        // flatter at the front, a fat round knuckle on top
        const q = cTo.clone().addScaledVector(sideV, sx * hw).addScaledVector(dir, sz * hl * (sz > 0 ? 1 : 1.2));
        q.y = Math.max(0.02, 0.42 + sy * hh * (sy > 0 ? 1 : 1.1) - 0.1 * sz);
        pb.v(q, LEGSKIN2, [1, sy > 0.4 ? clamp(noise.n3(q.x, q.y, q.z) + 0.2) : 0, 0, KIND.stone], wF);
      }
    }
    pb.rows(ts, NVv + 1, NU, true);
    // the nail: a pale, flattened cap over the front of the toe
    const ns = pb.count, nc = cTo.clone().addScaledVector(dir, hl * 0.9);
    for (let i = 0; i <= 8; i++) {
      const v = (i / 8) * Math.PI;
      for (let j = 0; j < 14; j++) {
        const u = (j / 14) * Math.PI * 2;
        const sx = Math.sin(v) * Math.cos(u), sz = Math.sin(v) * Math.sin(u), sy = Math.cos(v);
        const q = nc.clone().addScaledVector(sideV, sx * hw * 0.8).addScaledVector(dir, sz * 0.32);
        q.y = Math.max(0.03, 0.34 + sy * 0.3);
        pb.v(q, NAIL, [0.15, 0, sz < -0.3 ? 0.4 : 0, KIND.nail], wF);
      }
    }
    pb.rows(ns, 9, 14, true);
  });
  // where the stone wedges in (between the third and fourth toes of the front left foot)
  const slotA = ((angs[2] + angs[3]) / 2) * Math.PI / 180;
  return new THREE.Vector3(Fc.x + Math.sin(slotA) * 2.95, 0.55, Fc.z + Math.cos(slotA) * 2.95);
}

// ------------------------------------------------------------------------------------------------ body, neck, tail

function torsoPart(pb: PartB) {
  const c = new THREE.Vector3(0, 9.4, -4), r = new THREE.Vector3(13.2, 5.0, 20.5);
  const NU = 48, NVv = 28, start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i <= NVv; i++) {
    const v = (i / NVv) * Math.PI;
    for (let j = 0; j < NU; j++) {
      const u = (j / NU) * Math.PI * 2;
      p.set(Math.sin(v) * Math.cos(u) * r.x, Math.cos(v) * r.y, Math.sin(v) * Math.sin(u) * r.z).add(c);
      const bs = bandSkin(-p.y * 1.3 + p.z * 0.15, u * 3, 1.1, 0.04, 2.0);
      p.x = c.x + (p.x - c.x) * bs.scale; p.z = c.z + (p.z - c.z) * bs.scale;
      pb.v(p, BELLY, [1, 0, 0.35 + bs.crease * 0.3, KIND.stone], [[BONE.body, 1]]);
    }
  }
  pb.rows(start, NVv + 1, NU, true);
}

/** The neck: thick and grey where it leaves the shell, pale hide towards the head, a mane of moss along its top. */
function neckPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 12.0, 9.5), REST[BONE.neck0], REST[BONE.neck1], REST[BONE.neck2], REST[BONE.neck3], REST[BONE.head], HEAD_POS.clone().addScaledVector(HEAD_FWD, 0.9)];
  const NN = 80, NA = 48;
  const fr = curveFrames(pts, NN, new THREE.Vector3(0, 1, 0));
  const S = fr.ctlS;
  const rad = mono(S, [5.8, 5.8, 5.1, 4.1, 3.15, 2.5, 2.0]);
  const bones = [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head, BONE.head];
  const start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i < NN; i++) {
    const s = (i / (NN - 1)) * fr.len, t = s / fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2; // 0 = top
      const up = Math.cos(ang), sd = Math.sin(ang);
      // slightly taller than wide; the throat hangs a little; folds across the throat, fading up the neck
      const under = Math.max(0, -up);
      const bs = bandSkin(s, ang, 0.62, 0.05 * (1 - smoothstep(0.2, 0.75, t)) * (0.4 + under), 4.4);
      const r = rad(s) * bs.scale;
      p.copy(fr.C[i]).addScaledVector(fr.N[i], up * r * (up < 0 ? 1.06 : 1)).addScaledVector(fr.B[i], sd * r * 0.9);
      const pale = smoothstep(0.1, 0.32, t);
      const c = LEGSKIN.clone().lerp(HIDE, pale).lerp(HIDE_D, under * 0.35 * pale);
      // the mane of moss down the top of the neck, in ragged tongues
      const mossN = noise.fbm(s * 0.45, ang * 1.2, 1.7, 3);
      const moss = clamp(smoothstep(-0.05, 0.75, up) * 1.4 - 0.35 + mossN * 1.2 - t * 0.25);
      pb.v(p, c, [1 - pale * 0.85, moss, bs.crease * 0.55 * (1 - pale * 0.5), pale > 0.5 ? KIND.hide : KIND.stone], chainWeights(s, S.slice(0, 6), bones.slice(0, 6), 1));
    }
  }
  pb.rows(start, NN, NA, true);
  return { ...fr, R: fr.C.map((_, i) => rad((i / (NN - 1)) * fr.len)) };
}

function tailPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 9.4, -21.5), REST[BONE.tail0], REST[BONE.tail1], new THREE.Vector3(0, 6.0, -31.8)];
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
      pb.v(p, LEGSKIN, [1, clamp(Math.cos(ang) * 0.6), bs.crease * 0.7, KIND.stone], chainWeights(s, fr.ctlS.slice(0, 3), [BONE.body, BONE.tail0, BONE.tail1], 1));
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
        x -= sx * sink * 0.22;
        const brow = Math.exp(-((dy - 0.52) ** 2) / 0.05 - (dz + 0.05) ** 2 / 0.3);
        x += sx * brow * 0.1; y += brow * 0.06;
        // the cheek below and behind the eye
        x += sx * 0.07 * Math.exp(-((dy + 0.75) ** 2) / 0.25 - ((dz + 0.4) ** 2) / 0.6);
      }
      // the nostrils: two soft dents on the front of the nose
      const nz = z - 4.86, ny = y - (headRing(4.86).yc + 0.2);
      const nost = Math.exp(-((ax - 0.42) ** 2) / 0.02 - (ny * ny) / 0.02 - (nz * nz) / 0.03);
      x -= sx * nost * 0.06; zz -= nost * 0.1;
      // the mouth: a groove along the side
      let mouth = 0;
      if (z > MOUTH_Z0 - 0.2 && z < MOUTH_Z1 + 0.3 && ax > 0.3) {
        const my = mouthY(Math.min(MOUTH_Z1, Math.max(MOUTH_Z0, z)));
        const span = smoothstep(MOUTH_Z0 - 0.15, MOUTH_Z0 + 0.15, z) * (1 - smoothstep(MOUTH_Z1 + 0.05, MOUTH_Z1 + 0.3, z));
        mouth = Math.exp(-(((y - my) / 0.055) ** 2)) * span;
        x -= sx * mouth * 0.07;
      }
      // a crease under the jaw line, and the forehead's soft fur whorl ridge
      headPoint(x, y, zz, p);
      const nose = smoothstep(4.45, 4.85, z) * smoothstep(-0.2, 0.5, y - headRing(z).yc + 0.3);
      const under = smoothstep(-0.1, -0.7, Math.cos(phi));
      const c = HIDE.clone().lerp(HIDE_L, under * 0.6 * (1 - nose)).lerp(HIDE_D, smoothstep(1.1, 0.2, z) * 0.25).lerp(NOSE, nose * 0.85).lerp(MOUTH, mouth * 0.8).lerp(NOSE, nost * 0.9);
      const moss = clamp(smoothstep(0.55, 0.95, Math.cos(phi)) * smoothstep(1.4, -0.4, z) * 1.3 + noise.fbm(x, y, z, 2) * 0.8 - 0.25);
      pb.v(p, c, [0.08, moss, mouth * 0.6, KIND.hide], wH);
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
    const IRIS = col('#3e281a'), PUPIL = col('#120c0a'), RING = col('#24180f'), WHITE = col('#b8a68a');
    // the eyeball: almost all dark iris (a deer's eye), a warm brown ring, a hint of white at the corners
    blob(C, 32, 22, (sx, sy, sz) => {
      const d = new THREE.Vector3().addScaledVector(fw, sx).addScaledVector(up, sy).addScaledVector(o, sz);
      const a = Math.acos(clamp(d.dot(o), -1, 1));
      const c = a < 0.5 ? PUPIL.clone().lerp(IRIS, smoothstep(0.34, 0.5, a)) : a < 1.05 ? IRIS.clone().lerp(RING, smoothstep(0.7, 1.0, a)) : RING.clone().lerp(WHITE, smoothstep(1.05, 1.3, a));
      return { p: C.clone().addScaledVector(d, EYE_R), c, s: [0, 0, 0, KIND.eye], w: [[eb, 1]] };
    });
    // two catchlights, fixed to the head so they stay put while the eye looks about
    const hl = C.clone().addScaledVector(o, EYE_R * 0.93).addScaledVector(up, EYE_R * 0.08).addScaledVector(fw, EYE_R * 0.3);
    blob(hl, 10, 6, (sx, sy, sz) => ({ p: hl.clone().add(new THREE.Vector3(sx, sy, sz).multiplyScalar(0.085)), c: col('#fffdf6'), s: [0, 0, 0, KIND.eye], w: [[BONE.head, 1]] }));
    const hl2 = C.clone().addScaledVector(o, EYE_R * 0.93).addScaledVector(up, -EYE_R * 0.18).addScaledVector(fw, -EYE_R * 0.22);
    blob(hl2, 8, 5, (sx, sy, sz) => ({ p: hl2.clone().add(new THREE.Vector3(sx, sy, sz).multiplyScalar(0.035)), c: col('#f4ecdc'), s: [0, 0, 0, KIND.eye], w: [[BONE.head, 1]] }));
    // the rim of the lids round the eye: a soft roll of hide, darker at the lash line
    {
      const pb = new PartB();
      const NU = 40, NR = 10, start = 0;
      const ringC: THREE.Vector3[] = [];
      for (let i = 0; i < NU; i++) {
        const a = (i / NU) * Math.PI * 2;
        const rc = new THREE.Vector3().addScaledVector(up, Math.cos(a)).addScaledVector(fw, Math.sin(a));
        // the eye's opening is a soft almond: a little longer than tall
        const R0 = EYE_R * (0.9 + 0.12 * Math.sin(a) ** 2);
        const ring = C.clone().addScaledVector(o, EYE_R * 0.42).addScaledVector(rc, R0);
        ringC.push(ring);
        for (let k = 0; k < NR; k++) {
          const b = (k / NR) * Math.PI * 2;
          const tr = 0.11 * (1 + 0.3 * Math.max(0, Math.cos(a)));
          const q = ring.clone().addScaledVector(rc, Math.cos(b) * tr).addScaledVector(o, Math.sin(b) * tr * 0.8);
          const inner = Math.cos(b) < -0.2 && Math.sin(b) > -0.3;
          pb.v(q, inner ? col('#2e241e') : col('#b9a585'), [0, 0, inner ? 0.3 : 0.1, KIND.hide], [[BONE.head, 1]]);
        }
      }
      pb.rows(start, NU, NR, true);
      for (let k = 0; k < NR; k++) { const a = start + (NU - 1) * NR + k, b = start + (NU - 1) * NR + ((k + 1) % NR), c = start + k, d = start + ((k + 1) % NR); pb.t(a, c, b); pb.t(b, c, d); }
      GEOS.push(pb.geo(awayFrom(ringC)));
    }
    // the upper lid: a thin shell over the top of the eyeball, turning down about the eye's forward axis to blink
    {
      const pb = new PartB();
      const NU = 22, NV = 9, start = 0;
      for (let s = 0; s < 2; s++) {
        const rr = EYE_R * (s === 0 ? 1.1 : 1.03);
        for (let i = 0; i < NV; i++) {
          const el = 0.42 + (i / (NV - 1)) * 1.25; // elevation from the eye's axis towards up
          for (let j = 0; j < NU; j++) {
            const az = -1.25 + (j / (NU - 1)) * 2.5;
            const d = new THREE.Vector3().addScaledVector(o, Math.cos(el) * Math.cos(az)).addScaledVector(fw, Math.cos(el) * Math.sin(az)).addScaledVector(up, Math.sin(el));
            const edge = i <= 1;
            pb.v(C.clone().addScaledVector(d, rr * (i === 0 && s === 0 ? 1.03 : 1)), edge ? col(i === 0 ? '#2e241e' : '#7a6650') : HIDE, [0.05, 0, edge ? 0.25 : 0, KIND.hide], [[lb, 1]]);
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
  }
}

function earsPart() {
  for (const side of [1, -1] as const) {
    const eb = side > 0 ? BONE.earL : BONE.earR;
    const root = REST[eb];
    const L = headDir(0.86 * side, 0.42, -0.3); // out, up a little and back
    const n0 = headDir(0, 0.25, 1); // the ear's open face looks forwards
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

/** One antler's branches (main beam and tines), in creature space. Big, pale and spreading like a bare tree. */
function antlerBranches(side: 1 | -1, rng: () => number): Branch[] {
  const base = headPoint(ANTLER_LOCAL.x * side, ANTLER_LOCAL.y, ANTLER_LOCAL.z);
  const K = HEAD_SCALE * 0.98;
  const dirOf = (x: number, y: number, z: number) => new THREE.Vector3().addScaledVector(HEAD_SIDE, x * side).addScaledVector(HEAD_UP, y).addScaledVector(HEAD_FWD, z).normalize();
  const H = (x: number, y: number, z: number) => base.clone().addScaledVector(HEAD_SIDE, x * side * K).addScaledVector(HEAD_UP, y * K).addScaledVector(HEAD_FWD, z * K);
  const out: Branch[] = [];
  // the main beam sweeps up, out and well back, like a bare tree leaning back; the tines reach up and forwards
  const beam = [H(0, -0.2, 0), H(1.1, 0.9, -0.7), H(2.6, 2.0, -1.7), H(4.0, 3.2, -2.6), H(5.2, 4.4, -3.3), H(6.1, 5.6, -3.7), H(6.7, 6.8, -3.8), H(7.0, 7.8, -3.5)];
  out.push({ pts: beam, r0: 0.62 * K, r1: 0.17 * K });
  const bc = new THREE.CatmullRomCurve3(beam, false, 'centripetal');
  const up = new THREE.Vector3(0, 1, 0);
  /** A tine from p0 along dir, sweeping up; it may fork. */
  const tine = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const pts = [p0.clone().addScaledVector(dir, -0.12 * K)];
    let q = p0.clone(); const dd = dir.clone();
    for (let k = 1; k <= 4; k++) { dd.lerp(up, 0.16).normalize(); q = q.clone().addScaledVector(dd, len / 4); pts.push(q); }
    out.push({ pts, r0: r, r1: 0.06 * K });
    if (depth > 0 && len > 2.2 * K) {
      const c = new THREE.CatmullRomCurve3(pts);
      const n = 1 + (rng() < 0.5 ? 1 : 0);
      for (let f = 0; f < n; f++) {
        const at = 0.45 + f * 0.22 + rng() * 0.1;
        const t0 = c.getPoint(at), tg = c.getTangent(at);
        const ax = new THREE.Vector3().crossVectors(tg, up);
        const fd = tg.clone().applyAxisAngle(ax.lengthSq() > 0.01 ? ax.normalize() : HEAD_SIDE, (f % 2 ? -1 : 1) * (0.5 + rng() * 0.3)).lerp(up, 0.2).normalize();
        tine(t0, fd, len * (0.38 + rng() * 0.15), r * 0.6, depth - 1);
      }
    }
  };
  // [where along the beam, direction (head-local: x out, y up, z forward), length, radius]
  const tines: [number, [number, number, number], number, number][] = [
    [0.1, [0.3, 0.8, 0.75], 2.4, 0.32],  // the brow tine, curling up over the eye
    [0.24, [0.5, 0.95, 0.7], 3.4, 0.3],
    [0.4, [0.1, 1.0, 0.65], 3.8, 0.28],
    [0.55, [0.9, 1.0, 0.15], 3.2, 0.25],
    [0.68, [-0.35, 1.0, 0.5], 3.4, 0.23],
    [0.82, [0.8, 1.0, 0.0], 2.6, 0.2],
    [0.92, [-0.3, 1.0, -0.5], 2.0, 0.17],
  ];
  for (const [t, d, len, r] of tines) {
    tine(bc.getPoint(t), dirOf(...d), len * K * (0.9 + rng() * 0.2), r * K, t > 0.15 ? 1 : 0);
  }
  // the top of the beam splits into a fork
  tine(bc.getPoint(0.97), dirOf(0.3, 1, 0.5), 1.8 * K, 0.17 * K, 0);
  return out;
}

function antlerPart(branches: Branch[]) {
  const tips: AntlerTip[] = [];
  const wH: W = [[BONE.head, 1]];
  const base = branches[0].pts[0];
  for (const b of branches) {
    const curve = new THREE.CatmullRomCurve3(b.pts, false, 'centripetal');
    const len = curve.getLength();
    const NL = Math.max(6, Math.round(len * 2.6)), NA = b.r0 > 0.4 ? 12 : 9;
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
  legs: Record<Leg, ReturnType<typeof curveFrames>>;
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
  add(sp, p => new THREE.Vector3(p.x, (p.y - 12) * 1.5, p.z - SHELL.cz));

  const tp = new PartB(); torsoPart(tp); add(tp, p => new THREE.Vector3(p.x, p.y - 9.4, p.z + 4));
  const legs = {} as Record<Leg, ReturnType<typeof curveFrames>>;
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

  // ---- moss lumps: along the terrace edges and the rim walk's outer edge, round the neck where it leaves the
  // shell, down the neck's mane, on the crown between the antlers and on the shoulders of the legs
  const lumps: AmbleBodyBuild['lumps'] = [];
  const wS: W = [[BONE.shell, 1]];
  const shellPt = (j: number, i: number) => {
    const c = shell.cols[j];
    return new THREE.Vector3(c.E.x * c.rho[i], c.y[i], SHELL.cz + c.E.z * c.rho[i]);
  };
  const NU = shell.cols.length;
  const findI = (j: number, test: (rho: number, y: number) => boolean) => { const c = shell.cols[j]; for (let i = 0; i < shell.NV; i++) if (test(c.rho[i], c.y[i])) return i; return -1; };
  for (let j = 0; j < NU; j += 1) {
    const c = shell.cols[j];
    // terrace lips: where the top terrace and the middle ring end
    for (const [r0, sz] of [[SHELL.rTop - 0.02, 0.85], [SHELL.rMid - 0.02, 0.95], [SHELL.rLedge, 1.0]] as const) {
      if (rng() > 0.24) continue;
      const i = findI(j, rho => rho >= r0 + (rng() - 0.5) * 0.02);
      if (i < 0) continue;
      const p = shellPt(j, i);
      const r = sz * (0.7 + rng() * 0.85);
      const n = new THREE.Vector3(c.out.x * 0.35, 1, c.out.z * 0.35).normalize();
      mossLump(p.addScaledVector(n, 0.05), n, r, wS, rng, 0.55);
      lumps.push({ p, n, r });
    }
    // the upper edge plates: fat cushions sitting on the tops of plates
    if (rng() < 0.2) {
      const i = findI(j, (rho, y) => rho > 0.98 && y < SHELL.yLow - 0.9);
      if (i > 0) { const p = shellPt(j, i); const n = new THREE.Vector3(c.out.x, 0.9, c.out.z).normalize(); mossLump(p, n, 0.7 + rng() * 0.7, wS, rng, 0.45); }
    }
  }
  // round the neck root and along the mane
  for (let k = 0; k < 90; k++) {
    const s = 0.06 + Math.pow(rng(), 1.2) * 0.78;
    const i = Math.round(s * (neck.C.length - 1));
    const ang = (rng() - 0.5) * (2.4 - s * 1.2);
    const up = neck.N[i], sd = neck.B[i];
    const n = up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(sd, Math.sin(ang)).normalize();
    // (the neck is a little narrower than tall)
    const rr = neck.R[i] * (1 - 0.1 * Math.sin(ang) ** 2);
    const p = neck.C[i].clone().addScaledVector(n, rr * 0.97);
    const sl = i / (neck.C.length - 1) * neck.len;
    mossLump(p, n, (0.6 + rng() * 0.8) * (1.3 - s * 0.7), chainWeights(sl, neck.ctlS.slice(0, 6), [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head], 1), rng, 0.5);
  }
  for (let k = 0; k < 14; k++) {
    const a = (rng() - 0.5) * 2.6;
    const z = HEAD_Z0 + 0.3 + rng() * 1.6;
    const q = headSurface(z, a);
    const p = headPoint(q.x, q.y, z);
    const n = headDir(Math.sin(a), Math.cos(a), 0);
    mossLump(p, n, (0.22 + rng() * 0.22) * HEAD_SCALE, [[BONE.head, 1]], rng, 0.4, 1.4);
  }
  for (const l of LEGS) {
    const fr = legs[l];
    for (let k = 0; k < 9; k++) {
      const i = Math.floor(rng() * fr.C.length * 0.55);
      const ang = (rng() - 0.5) * 2.4 + (Math.sign(fr.C[0].x) > 0 ? -Math.PI / 2 : Math.PI / 2) * 0.5;
      const n = fr.N[i].clone().multiplyScalar(Math.cos(ang)).addScaledVector(fr.B[i], Math.sin(ang));
      const p = fr.C[i].clone().addScaledVector(n, 2.8);
      const [h, kb] = legBones(l);
      mossLump(p, n, 0.5 + rng() * 0.5, i < fr.C.length * 0.35 ? [[h, 1]] : [[h, 0.5], [kb, 0.5]], rng, 0.4);
    }
  }
  // the mouth's front, between the lips
  const mouth = headPoint(0, mouthY(MOUTH_Z1) - 0.05, HEAD_Z1 - 0.25);

  const geometry = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return { geometry, triangles: geometry.index!.count / 3, shell, antlerBranches: antlerBr, antlerTips: tips, stoneSlot, mouth, neck, legs, lumps };
}

export { chainWeights, curveFrames };
