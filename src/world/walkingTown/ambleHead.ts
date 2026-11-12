// Old Amble's head shape, in head-local coordinates (x to the left side, y up, z along the muzzle; the head bone
// is at z = 0). An elk's long, gentle head: a broad round cranium, the forehead sloping into a long straight nose,
// the muzzle narrowing and a little boxy, then a soft, slightly bulbous nose; deep cheeks behind the jaw line.
// Shared by the rig (where the eyes sit) and the body builder (the head surface itself).

/** Monotone cubic interpolation through (xs, ys). */
export function mono(xs: number[], ys: number[]) {
  const n = xs.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

/** The head runs from the back of the skull to the nose tip. */
export const HEAD_Z0 = -1.1, HEAD_Z1 = 5.12;
const HZ = [-1.1, -0.6, 0.1, 0.9, 1.6, 2.3, 3.0, 3.7, 4.3, 4.75, 5.0, 5.12];
const HW = [1.1, 1.62, 1.92, 1.95, 1.72, 1.42, 1.22, 1.1, 1.06, 0.96, 0.72, 0.1];
const HT = [1.2, 1.75, 1.98, 1.85, 1.45, 1.1, 0.95, 0.86, 0.8, 0.7, 0.5, 0.1];
const HB = [1.3, 1.75, 1.9, 1.78, 1.5, 1.22, 1.06, 0.96, 0.9, 0.78, 0.55, 0.1];
const HY = [0.05, 0.08, 0.06, -0.02, -0.15, -0.3, -0.4, -0.46, -0.48, -0.5, -0.5, -0.5];
// superellipse exponent: round cranium, boxier muzzle, round nose
const HE = [0.95, 0.95, 0.92, 0.88, 0.82, 0.77, 0.75, 0.75, 0.78, 0.84, 0.92, 1.0];
const fW = mono(HZ, HW), fT = mono(HZ, HT), fB = mono(HZ, HB), fY = mono(HZ, HY), fE = mono(HZ, HE);

export function headRing(z: number) { return { w: fW(z), top: fT(z), bot: fB(z), yc: fY(z), e: fE(z) }; }

/** A point on the bare head surface at z, angle phi (0 = top, PI/2 = the left side, PI = under the jaw). */
export function headSurface(z: number, phi: number) {
  const r = headRing(z);
  const s = Math.sin(phi), c = Math.cos(phi);
  const x = r.w * Math.sign(s) * Math.abs(s) ** r.e;
  const y = r.yc + (c >= 0 ? r.top : r.bot) * Math.sign(c) * Math.abs(c) ** r.e;
  return { x, y };
}

/** The bare surface's x on the left side at height y (local) and z. */
export function headSideX(y: number, z: number) {
  let lo = 0, hi = Math.PI;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (headSurface(z, m).y > y) lo = m; else hi = m; }
  return headSurface(z, (lo + hi) / 2).x;
}

/** The eye (left side): its centre sits a little inside the surface, so about two thirds of the eyeball shows. */
export const EYE_Y = 0.5, EYE_Z = 1.3, EYE_RADIUS = 0.38;
export const EYE_X = headSideX(EYE_Y, EYE_Z) - 0.17;

/** The mouth line (local y) along z, from the nose back to a soft upturn at the corner (a gentle smile). */
export const MOUTH_Z0 = 3.0, MOUTH_Z1 = 4.9;
export function mouthY(z: number) {
  const r = headRing(z);
  const base = r.yc - r.bot * 0.42;
  const k = (z - MOUTH_Z0) / (MOUTH_Z1 - MOUTH_Z0);
  // rises at the corner, so it reads as a smile
  return base + 0.16 * Math.pow(Math.max(0, 1 - k * 3.2), 2);
}
