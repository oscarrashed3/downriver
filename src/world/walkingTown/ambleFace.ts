import * as THREE from 'three';
import { Noise, smoothstep, clamp } from '../noise';
import { BONE, REST, HEAD_UP, HEAD_FWD, headPoint, headDir, EYE_LOCAL, EYE_R, ANTLER_LOCAL, HEAD_SCALE } from './ambleRig';
import { HEAD_Z0, HEAD_Z1, headRing, headSurface, mouthY, MOUTH_Z0, EYE_RADIUS, NOSTRIL, DEWLAP_ROOT, EAR_DIR, EAR_FACE, EAR_LEN, EAR_HW } from './ambleHead';
import { PartB, SINK, blob, col, gauss, KIND, type W, type Det } from './ambleParts';

// Old Amble's face: the head sculpted over the ring profile of ambleHead.ts into a real skull (brow ridge, eye
// sockets and their rims, cheekbones and the facial crest, the deep jaw and its edge, the arched nose bridge,
// flared nostrils, an overhanging upper lip and a tucked chin), the eyes (wet eyeballs, heavy upper lids with
// lashes, fleshy lower lids, the pink inner corner), the cupped ears and the dewlap under the throat.
// Everything is in creature space, rest pose, skinned to the head and the face bones.

const noise = new Noise(311);

const FUR = col('#e4d5b2'), FUR_W = col('#d2b88c'), FUR_L = col('#f1e8d2'), FUR_D = col('#b89d74');
const WARM = col('#7f5e3c'), WARM_D = col('#5c412e'), NAPE = col('#a39c84');
const NOSE = col('#3d3430'), NOSE_D = col('#1d1714'), LIP = col('#6d5848'), LIP_IN = col('#4a3530');
const FLESH = col('#a6706a'), LASH = col('#2e2118');

const sm = smoothstep;

/** The lie of the hair on the head: back from the nose, sweeping down over the cheeks (head-local direction). */
function furDirLocal(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  const down = clamp(ax / 1.6) * 0.45 * (y < 0 ? 1.2 : 0.6);
  return headDir(Math.sign(x) * 0.05, -down, -1);
}

/** The head: rings along z, each sculpted into the skull (see the notes above each feature). */
export function headPart(pb: PartB) {
  const NZ = 120, NA = 84;
  const start = pb.count, p = new THREE.Vector3();
  const R = EYE_RADIUS;
  const eye = EYE_LOCAL;
  for (let i = 0; i < NZ; i++) {
    const z0 = HEAD_Z0 + (HEAD_Z1 - HEAD_Z0) * Math.pow(i / (NZ - 1), 0.92);
    for (let j = 0; j < NA; j++) {
      const phi = (j / NA) * Math.PI * 2;
      const q = headSurface(z0, phi);
      const ring = headRing(z0);
      let x = q.x, y = q.y, z = z0;
      const ax = Math.abs(x), sx = Math.sign(x) || 1;
      const sideK = sm(0.35, 0.75, ax / ring.w);
      const topK = Math.max(0, Math.cos(phi));
      let dx = 0, ao = 0, dark = 0;
      // ---- around the eye (side of the head only)
      const dyE = y - eye.y, dzE = z - eye.z, de = Math.hypot(dyE, dzE), rr = de / R;
      // the brow ridge: a heavy shelf over the eye, running back towards the antler's root
      const brow = gauss((dyE - 0.46 + 0.07 * dzE) / 0.16) * gauss((dzE + 0.1) / 0.9) * sideK;
      dx += brow * 0.42; y += brow * 0.14;
      // the socket: the hide sinks round the lids, then rises into the orbit's bony rim
      const mound = sm(0.7, 1.12, rr) * (1 - sm(1.55, 2.6, rr)) * sideK, rim = gauss((rr - 2.6) / 0.45) * sideK;
      const sink = gauss((rr - 1.95) / 0.3) * sideK;
      dx += 0.34 * mound - 0.04 * sink + 0.05 * rim;
      // the socket's shadow: deep under the brow, softer below and behind the eye
      ao += sink * 0.35 + (1 - sm(0.75, 1.15, rr)) * sideK * 0.55 + gauss(Math.hypot((dyE - 0.3) / 0.2, dzE / 0.55)) * sideK * 0.35;
      dark += gauss((rr - 1.35) / 0.55) * sideK * 0.45;
      // the tear pit in front of the eye (a deer's preorbital gland): a small dark dent
      const pit = gauss(Math.hypot((dyE + 0.22) / 0.1, (dzE - 0.78) / 0.2)) * sideK;
      dx -= pit * 0.07; dark += pit * 0.6;
      // the cheekbone, under the eye and back towards the ear, and the facial crest running on forwards and down
      // along the side of the muzzle
      dx += 0.15 * gauss((dyE + 0.52) / 0.14) * gauss((dzE + 0.35) / 0.85) * sideK;
      const crestY = -0.56 - 0.17 * (dzE - 0.4);
      dx += 0.075 * gauss((dyE - crestY) / 0.09) * sm(0.2, 0.7, dzE) * (1 - sm(1.6, 2.7, dzE)) * sideK;
      // the hollow of the temple behind the eye
      dx -= 0.06 * gauss((dyE - 0.1) / 0.32) * gauss((dzE + 0.9) / 0.32) * sideK;
      // the chewing muscle: a big round cheek over the back of the jaw
      const cheek = gauss(Math.hypot((y + 1.05) / 0.6, (z - 0.25) / 0.8)) * sideK;
      dx += 0.24 * cheek;
      // ---- the jaw: its lower edge stands out, the underside between the jaw bones is narrower and a little hollow
      const yEdge = ring.yc - ring.bot * 0.6;
      const underJaw = sm(yEdge, yEdge - 0.45, y) * sm(-0.8, -0.2, z) * (1 - sm(3.9, 4.6, z));
      x *= 1 - 0.12 * underJaw;
      dx += 0.05 * gauss((y - yEdge) / 0.12) * sm(-0.6, 0.2, z) * (1 - sm(3.6, 4.4, z)) * sideK;
      y += 0.05 * underJaw * gauss(x / 0.35);
      // ---- the nose bridge: a gentle ridge down the top of the muzzle, arching a little before the nose
      y += (0.05 * gauss(x / 0.42) + 0.04 * gauss((z - 3.7) / 0.5)) * sm(1.6, 2.4, z) * (1 - sm(4.2, 4.75, z)) * topK;
      // ---- the antlers' roots (pedicles): the skin rises in a short collar round each
      const ped = gauss(Math.hypot(ax - ANTLER_LOCAL.x, z - ANTLER_LOCAL.z) / 0.5) * topK;
      y += ped * 0.2; dx += ped * 0.04;
      // ---- the lips: the heavy upper lip rolls out and droops over the lower one; under the mouth line the jaw
      // tucks in and back (the chin sits behind the nose)
      const ly = mouthY(Math.min(HEAD_Z1, Math.max(MOUTH_Z0, z)));
      const lipK = sm(MOUTH_Z0, MOUTH_Z0 + 0.7, z);
      const below = sm(ly + 0.04, ly - 0.22, y) * lipK;
      const upLip = gauss((y - ly - 0.14) / 0.13) * lipK;
      // (a moose's: broad, bulbous and hanging well over the lower lip and chin)
      const upBulb = gauss((y - ly - 0.3) / 0.32) * lipK * sm(3.6, 4.6, z);
      dx += upLip * 0.14 + upBulb * 0.1 - below * 0.2 * Math.min(1, ax);
      y -= upLip * 0.1 * sm(3.4, 4.4, z);
      if (z > 3.85) z = z - below * (z - 3.85) * 0.26;
      z += upBulb * 0.05 * (1 - below);
      // the chin: a soft bulge under the front of the lower jaw
      y -= 0.07 * gauss(Math.hypot((z - 4.1) / 0.35, x / 0.5)) * below;
      const mouthLine = Math.exp(-(((y - ly) / 0.06) ** 2)) * lipK;
      // the groove down the middle of the upper lip
      z -= 0.05 * gauss(x / 0.08) * sm(4.6, 4.9, z) * (1 - below) * sm(ly - 0.05, ly + 0.3, y) * (1 - sm(ly + 0.45, ly + 0.7, y));
      // ---- the nostrils: big soft commas on the front corners of the nose, curving back and down, each in a
      // raised rim; the inside dark
      const nX = ax - NOSTRIL.x, nY = y - NOSTRIL.y, nZ = z - NOSTRIL.z;
      const nu = nY * 0.86 + nX * 0.5, nv = nX * 0.86 - nY * 0.5;
      const bendV = nv / 0.12 + 0.9 * (nu / 0.3) ** 2 - 0.5;
      const nost = Math.exp(-((nu / 0.3) ** 2) - bendV * bendV - (nZ / 0.28) ** 2) * (ax > 0.12 ? 1 : 0);
      const nrim = Math.exp(-((nu / 0.42) ** 2) - (nv / 0.24) ** 2 - (nZ / 0.34) ** 2) * (ax > 0.1 ? 1 : 0);
      dx += nrim * 0.05 - nost * 0.12;
      z += nrim * 0.07 - nost * 0.2;
      ao += nost * 0.6;
      const nostW = clamp(Math.exp(-((nu / 0.45) ** 2) - (nv / 0.34) ** 2 - (nZ / 0.55) ** 2) * 1.3);
      x += sx * dx * (ax > 0.05 ? 1 : 0);
      headPoint(x, y, z, p);

      // ---- wrinkles: crow's feet fanning back from the eye's outer corner, soft bags under the eye, fine creases
      // across the top of the muzzle, and folds round the corner of the mouth (the strongest wins)
      let fold = 0, fAmp = 0;
      const crowW = sm(1.25, 1.65, rr) * (1 - sm(2.3, 3.1, rr)) * sm(0.15, -0.35, dzE) * sideK;
      const bagW = sm(1.2, 1.5, rr) * (1 - sm(2.2, 2.8, rr)) * sm(-0.1, -0.35, dyE) * sm(-0.6, -0.1, dzE) * sideK;
      const muzW = sm(2.0, 2.7, z) * (1 - sm(3.9, 4.35, z)) * sm(-0.35, 0.2, Math.cos(phi));
      const mcz = MOUTH_Z0, mcy = mouthY(MOUTH_Z0);
      const mcd = Math.hypot(y - mcy, z - mcz);
      const cornerW = sm(0.65, 0.25, mcd) * sm(0.1, 0.2, mcd) * sideK;
      const cand: [number, number, number][] = [
        [crowW, Math.atan2(dyE, -dzE) * 5.5, 0.03],
        [bagW, rr * 3.2, 0.02],
        [muzW, z * 5.2 + 0.25 * Math.sin(phi * 3) + 0.4 * noise.n3(x, y * 2, z), 0.012],
        [cornerW * 0.0, Math.atan2(y - mcy, z - mcz) * 3.2, 0.0],
      ];
      let best = 0;
      for (const [w, f, a] of cand) if (w > best) { best = w; fold = f; fAmp = a * w; }
      // ---- colour: a cream coat in soft patches; warmer and darker down the muzzle and round the eyes; paler under
      // the jaw and on the throat; the nose dark and moist
      const nosePad = sm(4.5, 4.85, z) * sm(ly + 0.1, ly + 0.35, y) * (1 - sm(1.05, 1.3, ax)) + nost;
      const under = sm(-0.1, -0.7, Math.cos(phi));
      const patch = noise.fbm(x * 0.9 + 3, y * 0.9, z * 0.9, 2);
      // warm brown down the muzzle, darkest along the nose bridge and towards the nose; a dark ring round the
      // eye; the cheeks and the jaw pale; the brow and crown a sandy tan
      const muzzle = sm(1.8, 3.6, z) * (1 - under * 0.55) * (1 - 0.45 * cheek);
      const bridge = gauss(x / (0.55 + 0.1 * z)) * topK * sm(0.8, 2.0, z) * (1 - sm(4.6, 4.9, z));
      const eyeP = Math.exp(-(de * de) / 0.6) * sideK;
      const pale = clamp(cheek * 1.2 + under * 0.8) * (1 - sm(2.6, 3.6, z) * 0.6);
      const c = FUR.clone().lerp(FUR_W, clamp(patch * 1.4 + 0.25) * 0.55).lerp(FUR_L, pale * 0.75 * (1 - nosePad))
        .lerp(FUR_D, sm(1.2, -0.6, z) * 0.35 * topK).lerp(WARM, muzzle * 0.85).lerp(WARM_D, clamp(bridge * 0.85 + muzzle * sm(3.6, 4.6, z) * 0.35))
        .lerp(WARM_D, clamp(eyeP * 0.85 + dark * 0.6)).lerp(NAPE, sm(0.0, -1.0, z) * 0.7 * (1 - topK * 0.3))
        .lerp(LIP, clamp(mouthLine * 0.9 + below * sm(3.4, 4.3, z) * 0.85)).lerp(NOSE, clamp(nosePad) * 0.92).lerp(NOSE_D, Math.min(1, nost * 1.4));
      const moss = clamp(sm(0.45, 0.9, Math.cos(phi)) * sm(2.2, -0.2, z) * 1.4 + noise.fbm(x, y, z, 2) * 0.9 - 0.25);
      const fur = clamp(1 - nosePad * 1.2 - mouthLine * 0.7) * (1 - 0.5 * gauss((rr - 1.1) / 0.3) * sideK);
      const wet = clamp(nosePad * 0.9 + nost * 0.5 + mouthLine * 0.4);
      const det: Det = [fAmp, fur, 0, wet];
      // weights: the lower jaw rides the jaw bone; the nostrils flare on theirs; the skin round the eye follows
      // the lids a little (it squashes when Amble blinks)
      const jawW = sm(ly + 0.08, ly - 0.28, y) * sm(-0.7, 0.9, z) * (z0 > MOUTH_Z0 - 2.5 ? 1 : sm(-0.7, 0.4, z0));
      const lidW = gauss((rr - 1.35) / 0.45) * sideK * 0.14;
      const w: W = [[BONE.head, 1]];
      if (jawW > 0.01) { w[0][1] -= jawW; w.push([BONE.jaw, jawW]); }
      if (nostW > 0.01) { w[0][1] -= nostW * w[0][1]; w.push([sx > 0 ? BONE.nostL : BONE.nostR, nostW * (1 - jawW)]); }
      if (lidW > 0.01) { const up = dyE > 0; w[0][1] -= lidW; w.push([sx > 0 ? (up ? BONE.lidL : BONE.lowLidL) : (up ? BONE.lidR : BONE.lowLidR), lidW]); }
      pb.v(p, c, [0.08, moss, clamp(mouthLine * 0.5 + ao + pit * 0.3), KIND.hide], w, fold, det, furDirLocal(x, y, z));
    }
  }
  pb.rows(start, NZ, NA, true);
  // caps: the nose tip and the back (hidden in the neck)
  // (the tip sits at the centre of the last ring, pushed a little forwards, so the cap never folds back)
  const tipP = new THREE.Vector3();
  for (let j = 0; j < NA; j++) { const k = (start + (NZ - 1) * NA + j) * 3; tipP.x += pb.P[k]; tipP.y += pb.P[k + 1]; tipP.z += pb.P[k + 2]; }
  tipP.multiplyScalar(1 / NA).addScaledVector(HEAD_FWD, 0.03 * HEAD_SCALE);
  const tip = pb.v(tipP, NOSE, [0, 0, 0, KIND.hide], [[BONE.head, 1]], 0, [0, 0, 0, 0.8]);
  for (let j = 0; j < NA; j++) pb.t(tip, start + (NZ - 1) * NA + j, start + (NZ - 1) * NA + ((j + 1) % NA));
  const back = pb.v(headPoint(0, 0.05, HEAD_Z0 - 0.02), FUR, [0, 0, 0, KIND.hide], [[BONE.head, 1]]);
  for (let j = 0; j < NA; j++) pb.t(back, start + ((j + 1) % NA), start + j);
}

// ------------------------------------------------------------------------------------------------ eyes

/** The eyes: a wet eyeball each (the shader paints the iris, pupil and the white at the corners, and the wet
 * shine that follows the sun), a heavy upper lid with a crease over it and a fringe of lashes, a fleshy lower lid
 * with a wet inner rim, and the pink inner corner. */
export function eyesPart() {
  for (const side of [1, -1] as const) {
    const eb = side > 0 ? BONE.eyeL : BONE.eyeR, lb = side > 0 ? BONE.lidL : BONE.lidR, llb = side > 0 ? BONE.lowLidL : BONE.lowLidR;
    const C = REST[eb];
    // the eye looks out to the side and a little forwards
    const o = headDir(side, 0.05, 0.32);
    const up = HEAD_UP.clone().addScaledVector(o, -HEAD_UP.dot(o)).normalize();
    const fw = new THREE.Vector3().crossVectors(up, o).multiplyScalar(side); // (points back along the head)
    const dirOf = (el: number, az: number) => new THREE.Vector3().addScaledVector(o, Math.cos(el) * Math.cos(az)).addScaledVector(fw, Math.cos(el) * Math.sin(az)).addScaledVector(up, Math.sin(el));
    // ---- the eyeball, the cornea bulging a little over the iris
    blob(C, 36, 24, (sx, sy, sz) => {
      const d = new THREE.Vector3().addScaledVector(fw, sx).addScaledVector(up, sy).addScaledVector(o, sz);
      const a = Math.acos(clamp(d.dot(o), -1, 1));
      const bulge = 1 + 0.07 * sm(0.75, 0.0, a);
      return { p: C.clone().addScaledVector(d, EYE_R * bulge), c: col('#ffffff'), s: [sx, sy, a, KIND.eye], w: [[eb, 1]], det: [0, 0, 0, 1] };
    });
    // ---- the upper lid: a thick fold of hide over the top of the eyeball, a crease above it, a rounded rim with
    // a dark lash line; it turns down about the eye's forward axis to blink
    {
      const pb = new PartB();
      const NU = 26;
      // rows from the rim up over the lid: [elevation offset above the edge, radius / EYE_R, colour, ao, fur]
      const rowsDef: [number, number, THREE.Color, number, number][] = [
        [-0.06, 0.99, LIP_IN, 0.4, 0],          // the wet inner rim, tucked against the eyeball
        [0.0, 1.03, LASH, 0.3, 0],              // the lash line
        [0.06, 1.055, LASH.clone().lerp(WARM_D, 0.5), 0.15, 0.1], // the rounded rim of the lid
        [0.2, 1.065, WARM_D, 0.1, 0.4],
        [0.36, 1.045, WARM_D.clone().multiplyScalar(0.85), 0.35, 0.4], // the crease above the lid
        [0.55, 1.05, WARM_D, 0.2, 0.8],
        [0.85, 1.03, WARM_D, 0.3, 1],
        [1.15, 1.01, WARM_D, 0.4, 1],           // (from here it runs in under the hide of the socket)
        [1.5, 0.97, WARM_D, 0.5, 1],
      ];
      // a heavy, sleepy lid: its edge low over the iris, so the eye looks soft and kind
      const edgeEl = (az: number) => 0.46 - 0.5 * (az / 1.25) ** 2;
      for (let i = 0; i < rowsDef.length; i++) {
        const [de, rad, c, ao, fur] = rowsDef[i];
        for (let j = 0; j < NU; j++) {
          const az = -1.25 + (j / (NU - 1)) * 2.5;
          // the rows above the edge droop at the corners less, so the lid is an almond, thickest in the middle
          const el = edgeEl(az) * (1 - Math.min(1, de / 1.4) * 0.6) + de * (1 - 0.25 * (az / 1.25) ** 2);
          const cornerT = 1 - 0.7 * (az / 1.25) ** 6;
          pb.v(C.clone().addScaledVector(dirOf(el, az), EYE_R * (1 + (rad - 1) * cornerT)), c, [0.05, 0, ao, KIND.hide], [[lb, 1]], 0, [0, fur, 0, i === 0 ? 1 : 0], headDir(0, -0.3, -1));
        }
      }
      pb.rows(0, rowsDef.length, NU, false);
      SINK.geos.push(pb.geo(q => new THREE.Vector3().subVectors(q, C)));
      // the lashes: dark, thick, curving out and up from the lid's rim, longest at the middle and outer corner
      const lp = new PartB();
      const NLash = 22;
      for (let k = 0; k < NLash; k++) {
        const az = -1.12 + (k / (NLash - 1)) * 2.24 + Math.sin(k * 7.1) * 0.02;
        const el = edgeEl(az) + 0.01;
        const root = C.clone().addScaledVector(dirOf(el, az), EYE_R * 1.045);
        const out = dirOf(el, az);
        const len = EYE_R * (0.14 + 0.1 * Math.sin(Math.PI * (k / (NLash - 1)) * 0.9 + 0.25) + 0.03 * Math.sin(k * 3.7));
        const dir1 = out.clone().multiplyScalar(0.92).addScaledVector(up, -0.1).normalize();
        const dir2 = out.clone().multiplyScalar(0.7).addScaledVector(up, 0.45).normalize();
        const mid = root.clone().addScaledVector(dir1, len * 0.55), tipP = mid.clone().addScaledVector(dir2, len * 0.5);
        const tang = new THREE.Vector3().crossVectors(dir1, up).normalize();
        const wd = EYE_R * 0.018;
        const det: Det = [0, 0, 0, 0];
        for (const s2 of [1, -1]) {
          const a0 = lp.v(root.clone().addScaledVector(tang, wd), LASH, [0, 0, 0.2, KIND.hide], [[lb, 1]], 0, det);
          const a1 = lp.v(root.clone().addScaledVector(tang, -wd), LASH, [0, 0, 0.2, KIND.hide], [[lb, 1]], 0, det);
          const b0 = lp.v(mid.clone().addScaledVector(tang, wd * 0.6), LASH, [0, 0, 0, KIND.hide], [[lb, 1]], 0, det);
          const b1 = lp.v(mid.clone().addScaledVector(tang, -wd * 0.6), LASH, [0, 0, 0, KIND.hide], [[lb, 1]], 0, det);
          const tp = lp.v(tipP, LASH, [0, 0, 0, KIND.hide], [[lb, 1]], 0, det);
          if (s2 > 0) { lp.t(a0, a1, b0); lp.t(a1, b1, b0); lp.t(b0, b1, tp); } else { lp.t(a0, b0, a1); lp.t(a1, b0, b1); lp.t(b0, tp, b1); }
        }
      }
      SINK.geos.push(lp.geo());
    }
    // ---- the lower lid: a fleshy roll along the bottom of the eye with a wet pink inner rim
    {
      const pb = new PartB();
      const NU = 26;
      const rowsDef: [number, number, THREE.Color, number, number, number][] = [
        [0.06, 0.99, LASH, 0.3, 0, 1],
        [-0.02, 1.035, LASH.clone().lerp(WARM_D, 0.5), 0.15, 0, 0.7],
        [-0.1, 1.06, WARM_D, 0.05, 0.3, 0],
        [-0.25, 1.065, WARM_D, 0.05, 0.6, 0],
        [-0.42, 1.045, WARM_D.clone().multiplyScalar(0.85), 0.3, 0.5, 0],    // the crease under the lid
        [-0.65, 1.04, WARM_D, 0.15, 0.9, 0],
        [-1.0, 1.01, WARM_D, 0.3, 1, 0],
        [-1.4, 0.97, WARM_D, 0.4, 1, 0],
      ];
      for (let i = 0; i < rowsDef.length; i++) {
        const [de, rad, c, ao, fur, wet] = rowsDef[i];
        for (let j = 0; j < NU; j++) {
          const az = -1.32 + (j / (NU - 1)) * 2.64;
          // the edge rises a little towards the corners of the eye
          const el = -0.44 + 0.4 * (az / 1.32) ** 2 * (1 - Math.min(1, -de / 1.0)) + de;
          pb.v(C.clone().addScaledVector(dirOf(el, az), EYE_R * (1 + (rad - 1) * (1 - 0.7 * (az / 1.32) ** 6))), c, [0.05, 0, ao, KIND.hide], [[llb, 1]], 0, [0, fur, 0, wet], headDir(0, -0.3, -1));
        }
      }
      pb.rows(0, rowsDef.length, NU, false);
      SINK.geos.push(pb.geo(q => new THREE.Vector3().subVectors(q, C)));
    }
    // ---- the inner corner of the eye (towards the nose): a little pink, wet fold
    const inner = C.clone().addScaledVector(fw, -EYE_R * 0.96).addScaledVector(o, EYE_R * 0.22).addScaledVector(up, -EYE_R * 0.06);
    blob(inner, 10, 7, (sx, sy, sz) => ({
      p: inner.clone().addScaledVector(fw, sx * EYE_R * 0.1).addScaledVector(up, sy * EYE_R * 0.08).addScaledVector(o, sz * EYE_R * 0.06),
      c: col('#7d5a50').multiplyScalar(0.9 + 0.15 * sy), s: [0.05, 0, 0.1, KIND.hide], w: [[BONE.head, 1]], det: [0, 0, 0, 1],
    }));
  }
}

// ------------------------------------------------------------------------------------------------ ears

/** The ears: long, cupped leaves of hide with a thick rolled rim, furred outside, paler and softer inside. */
export function earsPart() {
  for (const side of [1, -1] as const) {
    const eb = side > 0 ? BONE.earL : BONE.earR;
    const root = REST[eb];
    const L = headDir(EAR_DIR[0] * side, EAR_DIR[1], EAR_DIR[2]); // out to the side, up, and a little back
    const n0 = headDir(EAR_FACE[0] * side, EAR_FACE[1], EAR_FACE[2]); // the ear's open face looks out, forwards and up
    const N = n0.clone().addScaledVector(L, -n0.dot(L)).normalize();
    const Wd = new THREE.Vector3().crossVectors(L, N);
    const pb = new PartB();
    const NL = 22, NC = 24;
    const INNER = col('#cdb7a4'), INNER_D = col('#8e7666'), RIM = col('#9c8262');
    for (let i = 0; i <= NL; i++) {
      const l = i / NL;
      const hw = EAR_HW * Math.pow(Math.sin(Math.PI * Math.pow(l, 0.68)), 0.85) + 0.02;
      for (let j = 0; j < NC; j++) {
        const a = (j / NC) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        // the leaf: thick at the rim (it rolls), cupped deep round the open face, which hollows towards the base
        const rimK = Math.abs(c) ** 6;
        const thick = (0.07 + 0.08 * rimK) * (1 - 0.6 * l) + 0.02;
        const cup = 0.48 * hw * c * c - (s > 0 ? 0.12 * (1 - l) * (1 - c * c) : 0);
        const q = root.clone().addScaledVector(L, (l * EAR_LEN + 0.12 * c * c * l) * HEAD_SCALE).addScaledVector(Wd, c * hw * HEAD_SCALE).addScaledVector(N, (s * thick + cup - 0.05) * HEAD_SCALE);
        const inner = s > 0.2 && Math.abs(c) < 0.8;
        const deep = inner ? (1 - Math.abs(c) / 0.8) * (1 - l) : 0;
        const cc = inner ? INNER.clone().lerp(INNER_D, deep * 0.8).lerp(FUR, sm(0.6, 0.95, l)) : rimK > 0.5 ? RIM : FUR.clone().lerp(FUR_W, 0.4 + 0.3 * l).lerp(WARM_D, sm(0.8, 1.0, l) * 0.6);
        pb.v(q, cc, [0.05, 0, inner ? 0.25 * deep : 0, KIND.hide], [[eb, 1]], 0, [0, inner ? 0.5 : 1, 0, 0], L);
      }
    }
    pb.rows(0, NL + 1, NC, true);
    SINK.geos.push(pb.geo(p => { const d = new THREE.Vector3().subVectors(p, root); return d.addScaledVector(L, -d.dot(L)); }));
  }
}

// ------------------------------------------------------------------------------------------------ dewlap

/** The dewlap (a moose's bell): a heavy, furred fold of skin hanging under the throat, swinging on its own bone.
 * Returns its bottom (creature space) for the beard of long hair the growth hangs from it. */
export function dewlapPart(pb: PartB) {
  const root = headPoint(DEWLAP_ROOT.x, DEWLAP_ROOT.y + 0.25, DEWLAP_ROOT.z);
  const K = HEAD_SCALE;
  const down = headDir(0, -1, 0.18);
  const NL = 26, NA = 28;
  const start = pb.count;
  const len = 1.85 * K;
  const fwd = HEAD_FWD.clone().addScaledVector(down, -HEAD_FWD.dot(down)).normalize();
  const sideV = new THREE.Vector3().crossVectors(down, fwd).normalize();
  for (let i = 0; i < NL; i++) {
    const t = i / (NL - 1);
    // a bell: narrow where it leaves the throat, fullest two thirds down, rounded at the bottom
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38)), 0.7) * (t > 0.88 ? Math.sqrt(Math.max(0.02, 1 - ((t - 0.88) / 0.12) ** 2)) : 1);
    const rz = (0.62 - 0.12 * t) * K * prof, rx = (0.36 - 0.06 * t) * K * prof;
    const cen = root.clone().addScaledVector(down, t * len).addScaledVector(fwd, 0.25 * K * Math.sin(t * 2.2));
    const wD = sm(0.0, 0.35, t);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const wob = 1 + 0.06 * noise.n3(Math.cos(a) * 2, t * 4, Math.sin(a) * 2);
      const p = cen.clone().addScaledVector(fwd, Math.cos(a) * rz * wob).addScaledVector(sideV, Math.sin(a) * rx * wob);
      const c = FUR.clone().lerp(FUR_W, 0.35).lerp(WARM, sm(0.45, 1.0, t) * 0.65).lerp(WARM_D, sm(0.85, 1.0, t) * 0.4);
      const moss = clamp(noise.fbm(Math.cos(a) * 1.5 + 4, t * 3, Math.sin(a) * 1.5, 2) * 1.5 + 0.05 + sm(0.3, 0.0, t) * 0.4) * (1 - 0.5 * sm(0.6, 1.0, t));
      pb.v(p, c, [0.05, moss, sm(0.15, 0.0, t) * 0.4, KIND.hide], [[BONE.head, 1 - wD], [BONE.dewlap, wD]], t * 7 + 0.3 * Math.sin(a * 2), [0.03 * (1 - t), 1, 0, 0], down);
    }
  }
  pb.rows(start, NL, NA, true);
  const bottom = root.clone().addScaledVector(down, len * 0.97).addScaledVector(fwd, 0.25 * K * Math.sin(2.2 * 0.97));
  const capI = pb.v(bottom.clone().addScaledVector(down, 0.05), WARM_D, [0, 0, 0, KIND.hide], [[BONE.dewlap, 1]]);
  for (let j = 0; j < NA; j++) pb.t(capI, start + (NL - 1) * NA + ((j + 1) % NA), start + (NL - 1) * NA + j);
  return { root, bottom, down, fwd, side: sideV, len };
}

export { gauss };
