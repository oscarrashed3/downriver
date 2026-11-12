import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp } from '../noise';
import { townRng } from './rand';
import { outlinePoint, shellProfile, riserAt, shellTopY, ledges } from './ambleShell';
import {
  BONE, REST, SHELL, LEGS, legBones, FOOT_REST, HEAD_POS, HEAD_FWD, HEAD_SIDE, HEAD_UP, headPoint, headDir,
  ANTLER_LOCAL, HEAD_SCALE, type Leg,
} from './ambleRig';
import { HEAD_Z0, HEAD_Z1, headRing, headSurface, mono, mouthY, MOUTH_Z1 } from './ambleHead';
import { PartB, SINK, blob, awayFrom, curveFrames, chainWeights, col, gauss, wrapAng, KIND, type W, type Det } from './ambleParts';
import { headPart, eyesPart, earsPart, dewlapPart } from './ambleFace';

// Old Amble's body, built in creature space in its rest pose and skinned to the rig: ONE geometry (one draw) for
// the shell and its edge plates, the body, the four legs with their wrinkled hide, the feet and their toenails,
// the neck, the head with its eyes, lids, lashes and ears, the dewlap, the antlers, the tail and every lump of moss.
// The parts and their attributes are described in ambleParts.ts; the face is built in ambleFace.ts.
//
// It also hands back the anchors the growth and the game need: where vines can hang from the shell's edge,
// the antler tips the birds perch on, where the stone wedges in the front left foot, and where the mouth is.

export type { W, Skin } from './ambleParts';
export { KIND } from './ambleParts';

const noise = new Noise(311), noise2 = new Noise(97);
const sm = smoothstep;

// ------------------------------------------------------------------------------------------------ palette

const STONE = [col('#aca88f'), col('#a2a188'), col('#b0a68b'), col('#979a80'), col('#b6b097')];
/** The bare hide: an elephant's, warm grey-brown, a little darker and muddier towards the feet. */
const HIDE_G = col('#a89a82'), HIDE_G2 = col('#9a8d78'), HIDE_GL = col('#b8ab92'), MUD = col('#867560');
const FUR = col('#e3d6b6'), FUR_D = col('#cfc0a0'), FUR_W = col('#d6bf98'), MANE = col('#bfa27a');
const ANTLER = col('#ddd5c2'), ANTLER_B = col('#8f7d66'), ANTLER_G = col('#c4bcaa');
const NAIL = col('#cfc5ad'), NAIL_B = col('#8d8270');
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

// ------------------------------------------------------------------------------------------------ legs and feet

/** A fold's cross profile (f in 0..1 between two creases): a rounded roll with a sharp crease at each end. */
const foldBump = (f: number) => Math.pow(Math.sin(Math.PI * f), 0.6) - 0.62;

/** A leg: an elephant's, massive and alive. The upper leg is thick with muscle (a forearm's mass in front, the
 * point of the elbow behind on the fore legs, the thigh and the hock on the hind ones), a broad knee, a long
 * thick shin narrowing a little to the ankle and flaring again into the foot. The hide hangs in rings of folds,
 * deepest round the knee, the ankle and up under the shell; the shader cracks it finely all over. */
function legPart(pb: PartB, l: Leg, rng: () => number) {
  const [h, k, f] = legBones(l);
  const H = REST[h], K = REST[k], A = REST[f];
  const side = Math.sign(H.x), front = l.startsWith('F');
  const top = H.clone().add(new THREE.Vector3(-side * 1.2, 2.0, 0));
  const end = A.clone().add(new THREE.Vector3(side * 0.1, -1.1, 0.2));
  const NL = 112, NA = 60;
  const fr = curveFrames([top, H, K, A, end], NL, new THREE.Vector3(0, 0, 1));
  const [sTop, sH, sK, sA] = fr.ctlS;
  const sMid = (sH + sK) / 2, sShin = (sK + sA) / 2;
  const rad = mono([sTop, sH, sMid, sK, sShin, sA, fr.len], front ? [4.5, 4.3, 3.82, 3.92, 3.3, 3.1, 3.28] : [4.6, 4.45, 3.95, 3.98, 3.38, 3.14, 3.3]);
  const start = pb.count;
  const seed = rng() * 10;
  const p = new THREE.Vector3();
  // the fold coordinate down the leg: folds every ~0.6 m, crowding to ~0.3 m round the knee, ankle and top
  const acc: number[] = [0];
  const spacing = (s: number) => 0.62 - 0.3 * gauss((s - sK) / 1.2) - 0.26 * gauss((s - sA) / 0.9) - 0.22 * gauss((s - sTop) / 2.2);
  for (let i = 1; i < NL; i++) { const s = (i / (NL - 1)) * fr.len, ds = fr.len / (NL - 1); acc.push(acc[i - 1] + ds / spacing(s - ds / 2)); }
  const sE = sH + (sK - sH) * 0.6, sHock = sA - 1.5;
  for (let i = 0; i < NL; i++) {
    const s = (i / (NL - 1)) * fr.len;
    const kneeK = gauss((s - sK) / 1.15), ankK = gauss((s - sA) / 0.85), topK = gauss((s - sTop) / 2.0);
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      const fwd = Math.cos(ang), outer = -Math.sin(ang) * side;
      const pf = Math.max(0, fwd), pb2 = Math.max(0, -fwd);
      // the muscles and bones under the hide
      let m = 0;
      m += 0.075 * gauss((s - (sH + (sK - sH) * 0.35)) / 1.4) * pf ** 1.5;           // forearm / thigh in front
      m += 0.05 * gauss((s - (sH + 0.6)) / 1.6) * Math.max(0, outer);                 // the outer shoulder or haunch
      m += 0.075 * kneeK * pf ** 2 - 0.05 * kneeK * pb2;                              // the knee: broad in front, creased behind
      if (front) m += 0.1 * gauss((s - sE) / 0.9) * pb2 ** 2;                       // the point of the elbow
      else m += 0.08 * gauss((s - sHock) / 0.8) * pb2 ** 2;                         // the hock
      m += 0.035 * gauss((s - sShin) / 1.5) * Math.max(0, outer) - 0.03 * ankK;      // the shin's outer muscle, a lean ankle
      // the folds: rings, sagging lower at the back, wandering round the leg
      const fold = acc[i] - 0.45 * (1 - fwd) * 0.5 + 0.55 * noise.n3(Math.cos(ang) * 0.9 + seed, s * 0.16, Math.sin(ang) * 0.9) + 0.25 * noise2.n3(Math.cos(ang) * 2.4, s * 0.5 + seed, Math.sin(ang) * 2.4);
      const gA = 0.008 + 0.034 * kneeK + 0.03 * ankK + 0.036 * topK;
      const ff = fold - Math.floor(fold);
      let r = rad(s) * (1 + m + gA * foldBump(ff) * (0.7 + 0.6 * noise2.n3(ang * 1.7 + seed, s * 0.4, 1.3)));
      r *= 1 + 0.025 * noise.n3(Math.cos(ang) * 1.2 + seed, s * 0.25, Math.sin(ang) * 1.2);
      p.copy(fr.C[i]).addScaledVector(fr.N[i], Math.cos(ang) * r * 1.03).addScaledVector(fr.B[i], Math.sin(ang) * r);
      // moss: over the top of the leg and the outer front, in tongues, and caught in the deep folds
      const mossN = noise.fbm(p.x * 0.3, p.y * 0.22, p.z * 0.3, 3);
      const moss = clamp(sm(0.7, 0.0, s / fr.len) * (front ? 0.62 : 0.5) - 0.12 + outer * 0.1 + pf * 0.06 + mossN * 1.3);
      const crease = 1 - sm(0.0, 0.2, Math.min(ff, 1 - ff));
      const ao = clamp(crease * gA * 9 + sm(sH, sTop, s) * 0.55 + kneeK * pb2 * 0.25);
      const wv: W = s < sH + 0.3 ? [[BONE.body, 1 - sm(sTop + 0.4, sH + 0.3, s)], [h, sm(sTop + 0.4, sH + 0.3, s)]] : chainWeights(s, [sK - 0.7, sK + 0.7, sA - 0.45, sA + 0.3], [h, k, k, f]);
      const tone = noise2.fbm(p.x * 0.18, p.y * 0.25, p.z * 0.18, 2);
      const c = HIDE_G.clone().lerp(HIDE_G2, clamp(tone * 1.6 + 0.5)).lerp(HIDE_GL, clamp(-tone * 1.6) * 0.6 + pf * 0.1).lerp(MUD, sm(4.5, 0.4, p.y) * 0.5);
      const det: Det = [0.045 + 0.07 * kneeK + 0.055 * ankK + 0.06 * topK, 0, 0.75 + 0.25 * sm(sK - 1, sA, s), 0];
      pb.v(p, c, [0, moss, ao, KIND.bark], wv, fold, det);
    }
  }
  pb.rows(start, NL, NA, true);
  return { ...fr, R: fr.C.map((_, i) => rad((i / (NL - 1)) * fr.len)) };
}

/** A foot: an elephant's, a broad round column that bulges a little over its pad, with thick half-moon toenails
 * set into the front of it, each in a fold of hide (its cuticle), the hide creased up between them. */
function footPart(pb: PartB, l: Leg, rng: () => number, toeGap: boolean) {
  const [, , f] = legBones(l);
  const Fc = FOOT_REST[l];
  const side = Math.sign(Fc.x);
  const wF: W = [[f, 1]];
  // the toenails (degrees from straight ahead, turned out a little as the legs splay)
  const splay = side * 9;
  const front = l.startsWith('F');
  const angs = (toeGap ? [-66, -36, -10, 34, 62] : front ? [-62, -31, 0, 31, 62] : [-48, -16, 16, 48]).map(a => (a + splay) * Math.PI / 180);
  const nailHW = 0.2, nailH = (a: number) => 0.95 - 0.12 * (1 - Math.cos(a - splay * Math.PI / 180));
  const prof: [number, number][] = [[0, 0.02], [1.8, 0.0], [2.95, 0.02], [3.33, 0.1], [3.5, 0.3], [3.52, 0.55], [3.46, 0.85], [3.36, 1.15], [3.18, 1.5], [2.9, 1.9], [2.55, 2.3], [2.2, 2.75]];
  // finer rings up the front where the nails are
  const ys: [number, number][] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const n = i >= 2 && i < 8 ? 4 : 1;
    for (let k = 0; k < n; k++) { const t = k / n; ys.push([prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t]); }
  }
  ys.push(prof[prof.length - 1]);
  const NA = 144;
  const start = pb.count;
  const p = new THREE.Vector3();
  const seed = rng() * 10;
  const nearestNail = (a: number) => { let bi = 0, bd = 9; angs.forEach((t, i) => { const d = Math.abs(wrapAng(a - t)); if (d < bd) { bd = d; bi = i; } }); return { i: bi, d: wrapAng(a - angs[bi]) }; };
  for (let i = 0; i < ys.length; i++) {
    const [r0, y] = ys[i];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2 - Math.PI;
      const nn = nearestNail(a);
      const u = nn.d / nailHW;                         // across the nail (-1..1 on it)
      const inU = Math.max(0, 1 - u * u);
      const top = 0.1 + nailH(angs[nn.i]) * Math.pow(inU, 0.45);
      // the nail's bed sinks a little; the cuticle rolls over its top edge; between the nails the hide creases up
      const bed = inU > 0 ? sm(top + 0.05, top - 0.12, y) * sm(0.0, 0.25, inU) : 0;
      const cut = gauss((y - top - 0.1) / 0.09) * sm(0.0, 0.3, inU);
      const between = gauss((Math.abs(u) - 1.45) / 0.3) * sm(1.5, 0.3, y) * (Math.abs(nn.d) < 0.5 ? 1 : 0);
      const bulge = 1 + 0.025 * Math.sin(a * 5 + seed) * sm(0.6, 1.4, y);
      const ankle = gauss((y - 1.4) / 0.14);
      const r = r0 * bulge + 0.09 * cut - 0.05 * bed - 0.07 * between - 0.05 * ankle;
      p.set(Fc.x + Math.sin(a) * r, y, Fc.z + Math.cos(a) * r);
      const ao = clamp((i < 2 ? 0.6 : 0) + between * 0.6 + gauss((y - top - 0.02) / 0.05) * sm(0.0, 0.3, inU) * 0.7 + ankle * 0.4);
      const c = HIDE_G.clone().lerp(HIDE_G2, 0.4).lerp(MUD, sm(4.5, 0.4, y) * 0.5 + sm(0.8, 0.1, y) * 0.3);
      const moss = clamp(noise.fbm(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2) * 1.3 - 0.3 + (y > 2.0 ? 0.15 : 0));
      const fold = y * 2.6 + 0.2 * Math.sin(a * 3 + seed) + 0.15 * noise.n3(Math.cos(a) * 2, y, Math.sin(a) * 2 + seed);
      pb.v(p, c, [0, moss, ao, KIND.bark], wF, fold, [0.04 + 0.03 * sm(1.0, 2.2, y), 0, 1, 0]);
    }
  }
  pb.rows(start, ys.length, NA, true);
  const c0 = pb.v(new THREE.Vector3(Fc.x, 2.75, Fc.z), HIDE_G, [0, 0, 0, KIND.bark], wF);
  for (let j = 0; j < NA; j++) pb.t(c0, start + (ys.length - 1) * NA + ((j + 1) % NA), start + (ys.length - 1) * NA + j);
  // the nails: thick half-moons of horn, broad and blunt, standing proud of the hide at the bottom and sinking
  // into it at their top edge, ridged across with growth lines, worn and chipped along the ground
  const surfR = (y: number) => { for (let i = 0; i < prof.length - 1; i++) if (y <= prof[i + 1][1]) { const t = (y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]); return prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t; } return prof[prof.length - 1][0]; };
  angs.forEach((ta) => {
    const np = new PartB();
    const NU = 16, NV = 12;
    const hgt = nailH(ta);
    const chip = rng() * 10;
    for (let iv = 0; iv < NV; iv++) {
      const v = iv / (NV - 1);
      for (let iu = 0; iu < NU; iu++) {
        const u = -1 + (iu / (NU - 1)) * 2;
        const inU = Math.max(0, 1 - u * u);
        const y = 0.1 + v * hgt * Math.pow(inU, 0.45) + (iv === 0 ? 0.03 * noise.n3(u * 4 + chip, 0, 0) : 0);
        const a = ta + u * nailHW * 1.02;
        // thick at the bottom, sinking into the hide at its rim and top
        const thick = 0.24 * Math.pow(inU, 0.6) * (1 - v * 0.75) * (1 - 0.6 * v * v) - 0.07;
        const r = surfR(y) + thick;
        const q = new THREE.Vector3(Fc.x + Math.sin(a) * r, y, Fc.z + Math.cos(a) * r);
        const c = NAIL.clone().lerp(NAIL_B, sm(0.35, 0.0, v) * 0.7 + sm(0.75, 1.0, Math.abs(u)) * 0.3).multiplyScalar(0.95 + 0.08 * noise2.n3(u * 3 + chip, v * 2, 0));
        np.v(q, c, [0, 0, sm(0.7, 1.0, Math.abs(u)) * 0.3, KIND.nail], wF, v * 3.5 + 0.25 * Math.sin(u * 2 + chip), [0.012, 0, 0, 0.3]);
      }
    }
    np.rows(0, NV, NU, false);
    SINK.geos.push(np.geo(q => new THREE.Vector3(q.x - Fc.x, 0, q.z - Fc.z)));
  });
  // where the stone wedges in (between the third and fourth toes of the front left foot)
  const slotA = (angs[2] + angs[3]) / 2;
  return new THREE.Vector3(Fc.x + Math.sin(slotA) * 3.3, 0.6, Fc.z + Math.cos(slotA) * 3.3);
}

// ------------------------------------------------------------------------------------------------ body, neck, tail

/** The body under the shell: a heavy, sagging barrel of hide in long folds; it rides the flank bone, which swells
 * as Amble breathes. */
function torsoPart(pb: PartB) {
  const c = new THREE.Vector3(0, 11.0, -4), r = new THREE.Vector3(14.0, 4.3, 20.2);
  const NU = 64, NVv = 34, start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i <= NVv; i++) {
    const v = (i / NVv) * Math.PI;
    for (let j = 0; j < NU; j++) {
      const u = (j / NU) * Math.PI * 2;
      p.set(Math.sin(v) * Math.cos(u) * r.x, Math.cos(v) * r.y, Math.sin(v) * Math.sin(u) * r.z).add(c);
      // the belly sags between the legs
      const low = Math.max(0, -Math.cos(v));
      p.y -= low * 0.9 * (1 - ((p.x - c.x) / r.x) ** 2) * (1 - ((p.z - c.z) / r.z) ** 4);
      const fold = -p.y * 1.1 + p.z * 0.08 + 0.3 * noise.n3(p.x * 0.1, 0, p.z * 0.1);
      const ff = fold - Math.floor(fold);
      const k = 1 + 0.012 * foldBump(ff);
      p.x = c.x + (p.x - c.x) * k; p.z = c.z + (p.z - c.z) * k;
      const crease = 1 - sm(0.0, 0.2, Math.min(ff, 1 - ff));
      const cc = HIDE_G.clone().lerp(HIDE_GL, low * 0.35).lerp(HIDE_G2, clamp(noise2.n3(p.x * 0.1, p.y * 0.2, p.z * 0.1) + 0.3) * 0.5);
      pb.v(p, cc, [0, clamp(Math.cos(v) * 0.4), 0.25 + crease * 0.25, KIND.bark], [[BONE.flank, 1]], fold, [0.06, 0, 0.7, 0]);
    }
  }
  pb.rows(start, NVv + 1, NU, true);
}

/** The neck: long and strong, growing out of the shell in heavy folds of bare hide that drape lower underneath,
 * thick with muscle at its base (the crest along the top, a long cord of muscle down each side from the jaw to the
 * chest, a groove above it), and furred from halfway up, the cream coat warming into a shaggier mane along the
 * top and the throat. */
function neckPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 12.0, 10.5), REST[BONE.neck0], REST[BONE.neck1], REST[BONE.neck2], REST[BONE.neck3], REST[BONE.head], HEAD_POS.clone().addScaledVector(HEAD_FWD, 0.9)];
  const NN = 120, NA = 64;
  const fr = curveFrames(pts, NN, new THREE.Vector3(0, 1, 0));
  const S = fr.ctlS;
  const rad = mono(S, [6.2, 6.0, 5.5, 4.7, 3.85, 3.0, 2.4]);
  const bones = [BONE.body, BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head, BONE.head];
  const start = pb.count, p = new THREE.Vector3();
  // fold coordinate: heavy folds every ~0.9 m at the base, finer creases up the throat
  const acc: number[] = [0];
  for (let i = 1; i < NN; i++) { const t = i / (NN - 1), ds = fr.len / (NN - 1); acc.push(acc[i - 1] + ds / (0.95 - 0.5 * sm(0.2, 0.6, t))); }
  for (let i = 0; i < NN; i++) {
    const s = (i / (NN - 1)) * fr.len, t = s / fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2; // 0 = top
      const up = Math.cos(ang), sd = Math.sin(ang);
      const under = Math.max(0, -up);
      // where the bare hide gives way to fur: lower on the throat, higher along the mane
      const pale = sm(0.3, 0.55, t + 0.08 * under - 0.05 * Math.max(0, up) + 0.05 * noise.n3(ang * 1.5, s * 0.3, 2.2));
      // muscle: the crest along the top, the long cord down each side (rising from the chest to under the jaw)
      // with the jugular groove above it, and a fuller throat
      const cordAng = 2.15 - 0.55 * t;
      const cord = gauss((Math.abs(ang > Math.PI ? ang - 2 * Math.PI : ang) - cordAng) / 0.32);
      const groove = gauss((Math.abs(ang > Math.PI ? ang - 2 * Math.PI : ang) - cordAng + 0.42) / 0.16);
      let m = 0.05 * cord * sm(0.08, 0.3, t) * (1 - sm(0.8, 0.95, t)) - 0.03 * groove * sm(0.15, 0.35, t) * (1 - sm(0.75, 0.9, t));
      m += 0.025 * gauss(sd / 0.35) * Math.max(0, up) * (1 - sm(0.5, 0.9, t));
      // the heavy folds at the base, draping lower under the neck
      const fold = acc[i] - 1.1 * (1 - up) * 0.5 * (1 - sm(0.2, 0.5, t)) + 0.3 * noise.n3(ang * 1.2, s * 0.2, 4.4);
      const ff = fold - Math.floor(fold);
      const baseK = 1 - sm(0.12, 0.38, t);
      const gA = 0.006 + 0.04 * baseK * (0.6 + 0.4 * under);
      const r = rad(s) * (1 + m + gA * foldBump(ff));
      p.copy(fr.C[i]).addScaledVector(fr.N[i], up * r * (up < 0 ? 1.06 : 1)).addScaledVector(fr.B[i], sd * r * 0.92);
      const mane = sm(0.45, 0.75, t) * (sm(0.2, 0.9, Math.max(0, up)) + sm(0.3, 0.9, under)) * 0.5;
      const c = HIDE_G.clone().lerp(FUR_D, 0.3).lerp(HIDE_GL, under * 0.3).lerp(FUR, pale).lerp(FUR_D, under * 0.25 * pale).lerp(FUR_W, clamp(noise2.n3(s * 0.2, ang, 0.5) + 0.2) * 0.4 * pale).lerp(MANE, mane * 0.6);
      // the mane of moss down the top of the neck and over its shoulders, in ragged tongues
      const mossN = noise.fbm(s * 0.4, ang * 1.3, 1.7, 3);
      const moss = clamp(sm(-0.2, 0.7, up) * 1.5 - 0.35 + mossN * 1.3 - sm(0.55, 0.95, t) * 0.7 + (1 - pale) * 0.1);
      const crease = 1 - sm(0.0, 0.2, Math.min(ff, 1 - ff));
      const det: Det = [(0.025 + 0.07 * baseK) * (1 - pale * 0.6), pale, (1 - pale) * 0.8, 0];
      pb.v(p, c, [0, moss, crease * gA * 12 * (1 - pale * 0.6), KIND.bark], chainWeights(s, S.slice(0, 6), bones.slice(0, 6), 1), fold, det, fr.T[i]);
    }
  }
  pb.rows(start, NN, NA, true);
  return { ...fr, R: fr.C.map((_, i) => rad((i / (NN - 1)) * fr.len)) };
}

function tailPart(pb: PartB) {
  const pts = [new THREE.Vector3(0, 11.0, -21.5), REST[BONE.tail0], REST[BONE.tail1], new THREE.Vector3(0, 7.0, -31.8)];
  const NN = 30, NA = 28;
  const fr = curveFrames(pts, NN, new THREE.Vector3(0, 1, 0));
  const rad = mono(fr.ctlS, [2.6, 2.0, 1.15, 0.2]);
  const start = pb.count, p = new THREE.Vector3();
  for (let i = 0; i < NN; i++) {
    const s = (i / (NN - 1)) * fr.len;
    for (let j = 0; j < NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      const fold = s / 0.45 + 0.2 * Math.sin(ang * 2);
      const r = rad(s) * (1 + 0.03 * foldBump(fold - Math.floor(fold)));
      p.copy(fr.C[i]).addScaledVector(fr.N[i], Math.cos(ang) * r).addScaledVector(fr.B[i], Math.sin(ang) * r);
      pb.v(p, HIDE_G, [0, clamp(Math.cos(ang) * 0.6), 0.1, KIND.bark], chainWeights(s, fr.ctlS.slice(0, 3), [BONE.body, BONE.tail0, BONE.tail1], 1), fold, [0.05, 0, 0.8, 0]);
    }
  }
  pb.rows(start, NN, NA, true);
  return fr.C;
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
  out.push({ pts: beam, r0: 0.98 * K, r1: 0.2 * K });
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
    out.push({ pts, r0: r, r1: Math.max(0.05 * K, r * 0.2) });
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
    tine(bc.getPoint(t), dirOf(...d), len * K * (0.9 + rng() * 0.2), r * K * 1.2, t > 0.1 ? 2 : 1);
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
    const NL = Math.max(8, Math.round(len * 2.6)), NA = b.r0 > 0.9 ? 20 : b.r0 > 0.4 ? 13 : 9;
    const ref = Math.abs(curve.getTangent(0).y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const fr = curveFrames(b.pts, NL, ref);
    const pb = new PartB();
    const start = 0;
    const seedB = Math.abs(b.pts[0].x * 3.1 + b.pts[0].z * 1.7);
    for (let i = 0; i < NL; i++) {
      const t = i / (NL - 1);
      // tapering to a blunt point; thick and knobbly at the root, the bone crooked and twisted like old driftwood
      let r = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.7);
      if (t > 0.8) r *= Math.sqrt(Math.max(0.04, 1 - ((t - 0.8) / 0.2) ** 2));
      const Ci = fr.C[i];
      const gx = noise.n3(Ci.x * 0.35 + seedB, Ci.y * 0.35, Ci.z * 0.35), gy = noise.n3(Ci.x * 0.35, Ci.y * 0.35 + seedB, Ci.z * 0.35 + 5);
      const cen = Ci.clone().addScaledVector(fr.N[i], gx * b.r0 * 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3))).addScaledVector(fr.B[i], gy * b.r0 * 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * Math.PI * 2;
        const q0 = Ci.clone().addScaledVector(fr.N[i], Math.cos(a) * r).addScaledVector(fr.B[i], Math.sin(a) * r);
        const dBase = q0.distanceTo(base);
        // lumps along the beam, and pearls (the knobbly bumps of an old antler) crowding towards its root
        const lump = 0.16 * noise.n3(Ci.x * 1.1 + Math.cos(a) * 0.8, Ci.y * 1.1, Ci.z * 1.1 + Math.sin(a) * 0.8);
        const pearl = Math.max(0, noise2.n3(q0.x * 1.4, q0.y * 1.4, q0.z * 1.4) - 0.05) * 0.45 * (1 - sm(0.6, 3.2, dBase));
        const groove = 0.06 * Math.abs(Math.sin(a * 3 + t * 4 + seedB));
        const knob = 1 + lump + pearl - groove;
        const q = cen.clone().addScaledVector(fr.N[i], Math.cos(a) * r * knob).addScaledVector(fr.B[i], Math.sin(a) * r * knob);
        const c = ANTLER_B.clone().lerp(ANTLER_G, sm(0.4, 3.5, dBase)).lerp(ANTLER, sm(3, 9, dBase) * 0.7 + t * 0.3).multiplyScalar(1 - groove * 1.4);
        const moss = clamp(noise.fbm(q.x * 0.9, q.y * 0.9, q.z * 0.9, 3) * 1.6 + 0.12 - smoothstep(3, 9, dBase) * 0.35 + pearl * 0.6);
        pb.v(q, c, [0.12, moss, groove * 2.5, KIND.antler], wH, t * 6, [0, 0, 0, 0], fr.T[i]);
      }
    }
    pb.rows(start, NL, NA, true);
    const end = pb.v(fr.C[NL - 1].clone().addScaledVector(fr.T[NL - 1], 0.02), ANTLER, [0, 0, 0, KIND.antler], wH);
    for (let j = 0; j < NA; j++) pb.t(end, start + (NL - 1) * NA + j, start + (NL - 1) * NA + ((j + 1) % NA));
    SINK.geos.push(pb.geo(awayFrom(fr.C)));
    tips.push({ p: fr.C[NL - 1].clone(), up: fr.T[NL - 1].y > 0.6 });
  }
  // the burr: a knobbly ring where the antler leaves the skull
  const t0 = branches[0];
  const fr = curveFrames(t0.pts, 40, new THREE.Vector3(0, 0, 1));
  const c0 = fr.C[2], n = fr.T[2];
  const a1 = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize(), a2 = new THREE.Vector3().crossVectors(n, a1);
  const pb = new PartB();
  const start = 0, NU = 40, NR = 10;
  const ringC: THREE.Vector3[] = [];
  for (let i = 0; i < NU; i++) {
    const a = (i / NU) * Math.PI * 2;
    const rc = a1.clone().multiplyScalar(Math.cos(a)).addScaledVector(a2, Math.sin(a));
    const ring = c0.clone().addScaledVector(rc, t0.r0 * 0.98);
    ringC.push(ring);
    for (let k = 0; k < NR; k++) {
      const b = (k / NR) * Math.PI * 2;
      const tr = 0.3 * (1 + 0.5 * Math.max(0, Math.sin(a * 7 + 1)) + 0.35 * noise2.n3(Math.cos(a) * 3, Math.sin(a) * 3, k * 0.3));
      pb.v(ring.clone().addScaledVector(rc, Math.cos(b) * tr).addScaledVector(n, Math.sin(b) * tr), ANTLER_B, [0.3, 0.45, 0.15, KIND.antler], wH, 0, [0, 0, 0, 0], n);
    }
  }
  pb.rows(start, NU, NR, true);
  for (let k = 0; k < NR; k++) { const a = start + (NU - 1) * NR + k, b = start + (NU - 1) * NR + ((k + 1) % NR), c = start + k, d = start + ((k + 1) % NR); pb.t(a, c, b); pb.t(b, c, d); }
  SINK.geos.push(pb.geo(awayFrom(ringC)));
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
  /** The dewlap under the throat (its root, bottom and frame), for the beard of hair hanging from it. */
  dewlap: ReturnType<typeof dewlapPart>;
}

export function buildAmbleBody(seed = 3): AmbleBodyBuild {
  const rng = townRng(seed);
  const geos: THREE.BufferGeometry[] = [];
  SINK.geos = geos;
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
  const dp = new PartB(); const dewlap = dewlapPart(dp);
  add(dp, awayFrom(Array.from({ length: 12 }, (_, i) => dewlap.root.clone().addScaledVector(dewlap.down, (i / 11) * dewlap.len * 0.9))));
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
  return { geometry, triangles: geometry.index!.count / 3, shell, antlerBranches: antlerBr, antlerTips: tips, stoneSlot, mouth, neck, legs, lumps, dewlap };
}

export { chainWeights, curveFrames };
