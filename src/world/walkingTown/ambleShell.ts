import * as THREE from 'three';
import { Noise, smoothstep, clamp } from '../noise';
import { SHELL } from './ambleRig';

// The shape of Old Amble's shell, as plain functions (creature space, rest pose), shared by the body builder,
// the growth and the village.
//
// The shell is a high, lumpy dome. Its top is stepped by natural rocky ledges into the crown, the middle terrace
// and the shoulder: each ledge's edge wanders in and out round the shell and its height comes and goes, the
// risers are sloping faces of rock, the treads soft mossy ground with low mounds. At the shoulder the dome turns
// down into the flanks, which bulge out in big plates and curl under at a low lip that hides the belly. Over the
// neck the lip rises in an arch, so the neck grows out from under the front of the shell.

const n = new Noise(523);

/** The outline point at angle th (0 = the left side +X, PI/2 = the front +Z), at rho = 1 (z relative to cz). */
export function outlinePoint(th: number, out = new THREE.Vector3()) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / SHELL.pOut;
  const x = SHELL.ax * Math.sign(c) * Math.abs(c) ** e;
  const z = (s >= 0 ? SHELL.azFront : SHELL.azBack) * Math.sign(s) * Math.abs(s) ** e;
  return out.set(x, 0, z);
}

/** Angle and outline fraction of a creature-space point (x, z). */
export function shellPolar(x: number, z: number) {
  const dz = z - SHELL.cz, p = SHELL.pOut;
  const az = dz >= 0 ? SHELL.azFront : SHELL.azBack;
  const u = Math.abs(x) / SHELL.ax, v = Math.abs(dz) / az;
  const rho = (u ** p + v ** p) ** (1 / p);
  if (rho < 1e-6) return { th: Math.PI / 2, rho: 0 };
  const c = Math.sign(x) * (u / rho) ** (p / 2), s = Math.sign(dz) * (v / rho) ** (p / 2);
  return { th: Math.atan2(s, c), rho };
}

export const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Smooth periodic noise round the shell (about -1..1). */
export function ringNoise(th: number, seed: number) {
  return 0.5 * Math.sin(2 * th + seed) + 0.3 * Math.sin(3 * th + seed * 2.3) + 0.2 * Math.sin(5 * th + seed * 0.7);
}
/** How much angle th faces the neck (1 straight ahead) and the tail. */
export const frontness = (th: number) => Math.exp(-((wrapA(th - Math.PI / 2) / 0.36) ** 2));
export const backness = (th: number) => Math.exp(-((wrapA(th + Math.PI / 2) / 0.26) ** 2));

/** The three ledges at angle th (and point x, z): where each edge is (rho), its half-width and its height (which
 * comes and goes over the shell, so a ledge is a tall cliff in one place and a gentle step in another). */
export function ledges(th: number, x = 0, z = 0) {
  const k = (s: number) => n.n3(x * 0.045 + s, s * 1.7, z * 0.045);
  return [
    { e: SHELL.rLedge + 0.025 * ringNoise(th, 0.4) + 0.012 * Math.sin(th * 11 + 2), w: 0.03, h: 1.5 + 0.9 * k(2.9) },
    { e: SHELL.rMid + 0.05 * ringNoise(th, 1.7) + 0.02 * Math.sin(th * 9 + 1), w: 0.04, h: 2.9 + 1.3 * k(5.1) },
    { e: SHELL.rTop + 0.06 * ringNoise(th, 3.3) + 0.025 * Math.sin(th * 7 + 4), w: 0.05, h: 2.3 + 1.1 * k(0.9) },
  ];
}

const step = (rho: number, L: { e: number; w: number }) => 1 - smoothstep(L.e - L.w, L.e + L.w, rho);
/** How much of a riser (0 tread .. 1 the middle of a rocky face) the dome top is at (th, rho). */
export function riserAt(th: number, rho: number) {
  let r = 0;
  for (const L of ledges(th)) r = Math.max(r, Math.exp(-(((rho - L.e) / (L.w * 0.95)) ** 2)));
  return r;
}

/** Low mounds and hollows over the treads (metres), in creature space. */
function mounds(x: number, z: number) {
  return 0.55 * n.fbm(x * 0.07, 3.3, z * 0.07, 3) + 0.22 * n.n3(x * 0.3, 1.1, z * 0.3);
}

/** The top of the dome (rho <= rJoin): the shoulder height plus each ledge, a gentle doming and the mounds. */
export function domeY(th: number, rho: number, x: number, z: number) {
  const r = Math.min(rho, SHELL.rJoin);
  let y = SHELL.yLow + 4.0 * (1 - (r / SHELL.rJoin) ** 2.2) + 0.35 * ringNoise(th, 6.2) * (r / SHELL.rJoin) ** 2;
  for (const L of ledges(th, x, z)) y += L.h * step(r, L);
  // the mounds die away at the very edge, where the dome joins the plates smoothly
  return y + mounds(x, z) * (1 - smoothstep(SHELL.rJoin - 0.06, SHELL.rJoin, r));
}

/** The dome-top height at a creature-space point (x, z), if it is on the top (else null). */
export function shellTopY(x: number, z: number) {
  const { th, rho } = shellPolar(x, z);
  if (rho > SHELL.rJoin) return null;
  return domeY(th, rho, x, z);
}

/**
 * The shell's profile at angle th from the centre outwards: the dome top in fine samples, then the plated flank
 * (a smooth curve bulging out and curling under) and the hidden underside. Rho is the outline fraction.
 * `face` is the sample range of the plated flank (top to lip).
 */
export function shellProfile(th: number) {
  const E = outlinePoint(th);
  const NT = 96, NF = 50, NUd = 12;
  const rho: number[] = [], y: number[] = [];
  for (let i = 0; i < NT; i++) {
    const r = (i / (NT - 1)) * SHELL.rJoin;
    rho.push(r); y.push(domeY(th, r, E.x * r, SHELL.cz + E.z * r));
  }
  const f = frontness(th), b = backness(th);
  const yJ = y[NT - 1];
  const yLip = SHELL.yLip + 8.0 * f + 1.8 * b + 0.35 * ringNoise(th, 7.7);
  // the flank: rho (out) and how far down from the shoulder to the lip (0..1); widest about a fifth of the
  // way up from the lip, then tucking in under it
  const bulge = 1 - 0.75 * f;
  const ctl: [number, number][] = [
    [SHELL.rJoin, 0], [SHELL.rJoin + 0.055 * bulge + 0.01, 0.17], [SHELL.rJoin + 0.1 * bulge + 0.01, 0.38], [SHELL.rJoin + 0.128 * bulge + 0.012, 0.6],
    [SHELL.rJoin + 0.14 * bulge + 0.012, 0.8], [SHELL.rJoin + 0.13 * bulge + 0.01, 0.93], [SHELL.rJoin + 0.1 * bulge + 0.006, 1.0],
  ];
  const fc = new THREE.CatmullRomCurve3(ctl.map(([r, k]) => new THREE.Vector3(r * 20, yJ + (yLip - yJ) * k, 0)), false, 'centripetal');
  const fs = fc.getSpacedPoints(NF);
  const face0 = NT;
  for (let i = 1; i <= NF; i++) { rho.push(fs[i].x / 20); y.push(fs[i].y); }
  const face1 = rho.length - 1;
  // under the lip: curling in and up, then flat under the body
  const rL = rho[face1];
  const under: [number, number][] = [[rL - 0.03, yLip - 0.25], [rL - 0.07, yLip + 0.15], [rL - 0.12, yLip + 0.8], [0.66, yLip + 1.5 + f * 1.5], [0.5, yLip + 1.9], [0.34, yLip + 2.1], [0.2, yLip + 2.2]];
  const uc = new THREE.CatmullRomCurve3([new THREE.Vector3(rL * 20, yLip, 0), ...under.map(([r, yy]) => new THREE.Vector3(r * 20, yy, 0))], false, 'centripetal');
  const us = uc.getSpacedPoints(NUd);
  for (let i = 1; i <= NUd; i++) { rho.push(us[i].x / 20); y.push(us[i].y); }
  return { E, rho, y, face: [face0, face1] as [number, number], yLip, yJ, front: f };
}

/**
 * The outer radius of the flank (metres from the shell's centre axis along the outline direction) at height y
 * and angle th, if y is between the lip and the shoulder: for posts and ropes meeting the plates.
 */
export function flankRadius(th: number, yq: number) {
  const pr = shellProfile(th);
  const R = Math.hypot(pr.E.x, pr.E.z);
  for (let i = pr.face[0]; i < pr.face[1]; i++) {
    const y0 = pr.y[i], y1 = pr.y[i + 1];
    if (yq <= y0 && yq >= y1) { const t = (y0 - yq) / Math.max(1e-4, y0 - y1); return (pr.rho[i] + (pr.rho[i + 1] - pr.rho[i]) * t) * R; }
  }
  return null;
}

/**
 * Where a post dropped from (x, z) meets the plates: straight down if the flank bulges out as far as the
 * post, otherwise in at the widest point of the flank below it (so the post is raked in to the shell and
 * never hangs past the rim). sink pushes the foot a little into the plates. Creature space.
 */
export function plateFoot(x: number, z: number, sink = 0.3) {
  const { th, rho } = shellPolar(x, z);
  const pr = shellProfile(th);
  let best = pr.face[0];
  for (let q = pr.face[0]; q <= pr.face[1]; q++) {
    if (pr.rho[q] >= rho - 0.004) return { x, z, y: pr.y[q] - sink, raked: false };
    if (pr.rho[q] > pr.rho[best]) best = q;
  }
  // a touch inside the widest point and a little above it, so the pad sits on the plates' upper face
  const rr = pr.rho[best] - 0.004, q = Math.max(pr.face[0], best - 2);
  return { x: pr.E.x * rr, z: SHELL.cz + pr.E.z * rr, y: pr.y[q] - sink, raked: true };
}

export { clamp };
