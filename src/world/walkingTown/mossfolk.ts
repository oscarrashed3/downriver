import * as THREE from 'three';
import type { Person, PersonLook } from '../../player/person';
import {
  Kit, Sway, legs, arms, face, neckHead, anchors, pivot, lathe, folds, cap, sph, cyl, box, tor, cone,
} from '../../player/villagers';
import type { NpcLook } from '../../systems/npc';

// The Mossfolk of Mossrest, the village on Old Amble's back: round, earthy, friendly people in knitted jumpers
// and woven skirts and waistcoats, every one under a wide straw hat with moss on its band and little flowers
// tucked in it. Built by hand in exactly the way the World 1 villagers are (src/player/villagers.ts): layered
// clothes with folds, ribbed knit hems and cuffs, hands with fingers, the same soft faces (small dark eyes, brows,
// cheeks; never big anime eyes), and hats, braids and baskets that hang on springs. Small parts of one colour
// on one joint merge into one mesh, so each costs about as many draw calls as a World 1 villager.
//
//   const pip = new Npc('pip', MOSSFOLK.pip, mood);   (MOSSFOLK holds each look, with its builder)

export type MossKind = 'pip' | 'bramwyn' | 'miller' | 'ropewright' | 'folk';

const STRAW = '#e2c27a', STRAW_D = '#c8a45a', MOSS = '#6f8f3c', MOSS_L = '#9ab454';

/** A posy of little flowers: a yellow heart and five petals each. */
function blossom(k: Kit, at: THREE.Object3D, x: number, y: number, z: number, petal: string, s = 1) {
  k.add(at, sph(0.012 * s, 6, 4), '#f2c94a', x, y + 0.006 * s, z, { line: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(at, sph(0.014 * s, 6, 4), petal, x + Math.cos(a) * 0.016 * s, y, z + Math.sin(a) * 0.016 * s, { s: [1, 0.35, 0.7], r: [0, -a, 0], line: false });
  }
}

/**
 * A wide straw hat: a broad woven brim (rings of darker straw), a low round crown, a band of moss round it with
 * a few soft lumps creeping onto the brim, and little flowers tucked into the moss. The brim hangs on a spring.
 */
function strawHat(k: Kit, sway: Sway, head: THREE.Object3D, o: { brim?: number; tilt?: [number, number, number]; flowers: string[]; seed: number; moss?: number; tall?: number }) {
  const B = o.brim ?? 1, hat = pivot(head, 0, 0.3, -0.01);
  hat.rotation.set(...(o.tilt ?? [-0.1, 0, 0.06]));
  const R = 0.34 * B;
  k.add(hat, lathe([[0, 0], [0.16, 0.005], [R * 0.7, -0.012], [R, -0.045], [R * 1.02, -0.06], [R * 0.98, -0.062], [R * 0.7, -0.024], [0.16, -0.008], [0, -0.008]], 26), STRAW, 0, 0, 0, { dbl: true });
  for (let i = 0; i < 3; i++) k.add(hat, tor(0.19 + i * (R - 0.2) / 3, 0.0045, Math.PI * 2, 3, 26), STRAW_D, 0, -0.008 - i * 0.012, 0, { r: [Math.PI / 2, 0, 0], line: false });
  const th = 0.13 * (o.tall ?? 1);
  k.add(hat, cyl(0.135, 0.15, th, 16), STRAW, 0, th / 2, 0);
  k.add(hat, sph(0.135, 14, 6), STRAW, 0, th, 0, { s: [1, 0.35, 1] });
  for (let i = 0; i < 4; i++) k.add(hat, tor(0.142 - i * 0.003, 0.004, Math.PI * 2, 3, 18), STRAW_D, 0, 0.03 + i * 0.028, 0, { r: [Math.PI / 2, 0, 0], line: false });
  // the moss band, lumpy, and a few cushions spilling onto the brim
  let s = o.seed * 9301 + 49297; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mk = o.moss ?? 1;
  k.add(hat, tor(0.152, 0.024, Math.PI * 2, 6, 18), MOSS, 0, 0.022, 0, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < Math.round(9 * mk); i++) {
    const a = rnd() * Math.PI * 2, r = 0.16 + rnd() * 0.08 * mk;
    k.add(hat, sph(0.03 + rnd() * 0.02, 8, 6), rnd() < 0.5 ? MOSS : MOSS_L, Math.cos(a) * r, 0.01 + rnd() * 0.02, Math.sin(a) * r, { s: [1, 0.55, 1] });
  }
  // flowers tucked in the moss, more of them at the front-left
  const n = 4 + Math.round(3 * mk);
  for (let i = 0; i < n; i++) {
    const a = 0.6 + (i / n) * 2.4 + rnd() * 0.3, r = 0.16 + rnd() * 0.03;
    blossom(k, hat, Math.cos(a) * r, 0.045 + rnd() * 0.02, Math.sin(a) * r, o.flowers[i % o.flowers.length], 0.9 + rnd() * 0.5);
  }
  // a sprig of grass standing up from the band
  for (let i = 0; i < 3; i++) k.add(hat, cone(0.006, 0.12 + i * 0.03, 3), MOSS, -0.13 + i * 0.012, 0.09, 0.07, { r: [0.2 - i * 0.15, 0, 0.35 - i * 0.2], line: false });
  sway.add(hat, { freq: 2.2, damp: 0.4, gain: 0.012, wind: 0.06, bob: 0.05, limit: 0.2 });
  return hat;
}

/** A round knitted jumper: ribbed hem and collar, a band of cable stitch, purl lines down the ribs. */
function jumper(k: Kit, T: THREE.Object3D, B: number, c: string, d: string, band: string, len = 0.07, round = 1) {
  k.add(T, folds(lathe([[0.1, 0.53], [0.19 * B, 0.5], [0.255 * B * round, 0.36], [0.28 * B * round, 0.18], [0.27 * B * round, 0.0], [0.245 * B, -len], [0.24 * B, -len - 0.01]], 18), 8, 0.02, 0.5, -len), c, 0, 0, 0, { s: [1, 1, 0.9], dbl: true });
  k.add(T, tor(0.243 * B, 0.026, Math.PI * 2, 5, 22), d, 0, -len + 0.005, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    k.add(T, box(0.007, 0.045, 0.006), band, Math.sin(a) * 0.262 * B, -len + 0.005, Math.cos(a) * 0.238 * B, { r: [0, a, 0], line: false });
  }
  k.add(T, tor(0.1, 0.032, Math.PI * 2, 5, 16), d, 0, 0.52, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] });
  // the cable band across the chest: two stripes and a row of little diamonds between them
  for (const y of [0.25, 0.31]) k.add(T, tor(0.276 * B * round, 0.011, Math.PI * 2, 3, 24), band, 0, y, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], line: false });
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + i * 0.225;
    k.add(T, box(0.03, 0.03, 0.008), band, Math.sin(a) * 0.282 * B * round, 0.28, Math.cos(a) * 0.255 * B * round, { r: [0, a, Math.PI / 4], line: false });
  }
}

/** A long skirt of woven cloth: folds deepening to the hem, two bands of weave. */
function skirt(p: Person, k: Kit, B: number, c: string, bands: string[], len = 0.74) {
  const g = new THREE.Group(); p.torso.add(g); p.coat = g;
  k.add(g, folds(lathe([[0, 0.05], [0.24 * B, 0.05], [0.27 * B, -0.1], [0.32 * B, -len * 0.6], [0.35 * B, -len], [0.34 * B, -len - 0.02]], 20), 10, 0.06, 0.0, -len), c, 0, 0, 0, { s: [1, 1, 0.88], dbl: true });
  bands.forEach((b, i) => k.add(g, tor(0.345 * B - i * 0.012, 0.016, Math.PI * 2, 4, 24), b, 0, -len + 0.06 + i * 0.07, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1], line: false }));
  return g;
}

/** Curly hair peeping out under the hat: a ring of small soft tufts round the back and sides. */
function tufts(k: Kit, h: THREE.Object3D, c: string, n = 10, fringe = 3, r = 0.16) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.35 + (i / (n - 1)) * Math.PI * 1.3;
    k.add(h, sph(0.05, 8, 6), c, Math.cos(a) * r, 0.23 - Math.abs(Math.sin(a)) * 0.02, -Math.sin(a) * r * 0.9 - 0.02, { s: [0.9, 0.8, 0.9] });
  }
  for (let i = 0; i < fringe; i++) k.add(h, sph(0.04, 8, 6), c, -0.06 + i * 0.06, 0.29, 0.12, { s: [1.1, 0.6, 0.8], r: [0.4, 0, (i - 1) * 0.3] });
}

// ---------------------------------------------------------------- Pip, the friend

function pip(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 0.95, skin = L.skin;
  legs(p, k, { B, thigh: '#8a6a48', shin: skin, boot: '#6a4428', skin, sock: '#e6dcc0', bootS: 1.3, bootH: 0.15, cuff: '#7a5a3c', cuffY: 0.02, patch: '#a0805a' });
  const T = p.torso;
  k.add(T, cyl(0.21 * B, 0.23 * B, 0.16, 14), '#8a6a48', 0, -0.07, 0, { s: [1, 1, 0.86] });
  jumper(k, T, B, '#7f9a4e', '#5f7a38', '#efe4c8', 0.08, 1.04);
  // a satchel on a strap across the chest, a pine cone and a feather sticking out of it
  k.add(T, tor(0.25 * B, 0.012, Math.PI * 2, 3, 20), '#7a5032', 0, 0.26, 0.0, { r: [Math.PI / 2, 0.75, 0.0], s: [1.05, 1.25, 1] });
  const bag = pivot(T, 0.24 * B, 0.02, 0.05);
  k.add(bag, box(0.13, 0.12, 0.06), '#9a6a3e', 0, -0.05, 0);
  k.add(bag, box(0.135, 0.05, 0.065), '#7a5032', 0, 0.0, 0.002, { r: [0.15, 0, 0] });
  k.add(bag, cone(0.02, 0.05, 6), '#6a4a2a', -0.03, 0.03, 0, {});
  k.add(bag, box(0.01, 0.12, 0.004), '#f2ecdc', 0.03, 0.06, 0, { r: [0, 0, -0.3], line: false });
  sway.add(bag, { freq: 2.0, gain: 0.04, wind: 0.05, bob: 0.25 });
  arms(p, k, { B, sleeve: '#7f9a4e', fore: '#7f9a4e', skin, cuff: '#5f7a38', puff: 1.12, hand: 1.05 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.12);
  face(p, k, L, { skin, brow: '#6a4428', browW: 1.05, browT: 1.2, browTilt: -0.1, nose: 'button', noseC: '#eaa88a', freckles: true, blush: '#f0948a' });
  tufts(k, p.hair, '#8a5530', 11, 3);
  strawHat(k, sway, p.head, { brim: 0.85, tilt: [-0.22, 0, 0.12], flowers: ['#f6f2e4', '#f0b6c8', '#9ab8e8'], seed: 3, moss: 0.7 });
}

// ---------------------------------------------------------------- Old Bramwyn, the gardener

function bramwyn(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 1.0, skin = L.skin;
  legs(p, k, { B: B * 0.9, thigh: '#8a4a32', shin: '#5a4a3a', boot: '#4a3226', skin, bootH: 0.1 });
  const T = p.torso;
  k.add(T, cap(0.17 * B, 0.22), '#d6c49a', 0, 0.27, 0, { s: [1.05, 1, 0.86] });
  skirt(p, k, B, '#a8623f', ['#6f8f3c', '#e6d6a8', '#6f8f3c'], 0.72);
  // a long knitted cardigan, open at the front, deep pockets with a trowel and a ball of twine
  k.add(T, folds(lathe([[0.1, 0.53], [0.2 * B, 0.48], [0.27 * B, 0.3], [0.29 * B, 0.05], [0.31 * B, -0.28], [0.3 * B, -0.3]], 18, 0.35, Math.PI * 2 - 0.7), 9, 0.04, 0.5, -0.3), '#d8c8a0', 0, 0, 0, { s: [1, 1, 0.92], dbl: true });
  for (const s of [-1, 1]) {
    k.add(T, box(0.03, 0.8, 0.02), '#b8a47a', 0.07 * s, 0.12, 0.27 * B, { r: [-0.05, 0, 0.05 * s], line: false });
    k.add(T, box(0.12, 0.1, 0.02), '#c4b088', 0.17 * s, -0.12, 0.27 * B, { r: [-0.1, 0.4 * s, 0] });
  }
  k.add(T, cyl(0.008, 0.008, 0.12, 5), '#6a4a2a', 0.18, -0.05, 0.28 * B, { r: [0.1, 0, 0.2] });
  k.add(T, box(0.03, 0.05, 0.01), '#9aa0a0', 0.19, 0.02, 0.285 * B, { r: [0.1, 0, 0.2] });
  k.add(T, sph(0.032, 8, 6), '#c86a4a', -0.17, -0.07, 0.29 * B);
  // her green gardening apron, tied in a bow behind
  k.add(T, folds(lathe([[0.25 * B, 0.08], [0.3 * B, -0.3], [0.33 * B, -0.55]], 10, -0.7, 1.4), 5, 0.05, 0.08, -0.55), '#6e8a52', 0, 0, 0.02, { s: [1.04, 1, 0.92], dbl: true });
  k.add(T, sph(0.04, 8, 6), '#6e8a52', 0, 0.09, -0.27 * B, { s: [1.6, 0.8, 0.6] });
  arms(p, k, { B, sleeve: '#d8c8a0', fore: '#d8c8a0', skin, cuff: '#b8a47a', hand: 0.95, puff: 1.05 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.1);
  face(p, k, L, { skin, brow: '#e8e2d6', browW: 1.1, browT: 1.1, browTilt: -0.2, nose: 'round', noseC: '#e0a890', wrinkles: true, lids: 0.82, blush: '#eaa090' });
  // white hair in a soft bun under the hat
  k.add(p.hair, sph(0.168, 14, 10), '#eeeae2', 0, 0.2, -0.04, { s: [1.04, 0.92, 1.0] });
  k.add(p.hair, sph(0.075, 10, 8), '#eeeae2', 0, 0.2, -0.19, { s: [1, 0.9, 0.8] });
  strawHat(k, sway, p.head, { brim: 1.15, tilt: [-0.05, 0, -0.08], flowers: ['#f6f2e4', '#e86a5a', '#f2c94a', '#b48ad8'], seed: 11, moss: 1.8, tall: 0.9 });
  // a garden basket on her left arm: greens, a cabbage, flowers, the shears
  const bk = pivot(p.arms[0].el, 0.06, -0.16, 0.1);
  k.add(bk, lathe([[0.0, -0.09], [0.13, -0.085], [0.16, 0.0], [0.17, 0.04], [0.16, 0.045], [0.0, 0.045]], 16), '#b88a4a', 0, 0, 0, { s: [1, 1, 0.75], dbl: true });
  for (let i = 0; i < 3; i++) k.add(bk, tor(0.14 + i * 0.012, 0.006, Math.PI * 2, 3, 18), '#946a32', 0, -0.06 + i * 0.04, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.75, 1], line: false });
  k.add(bk, tor(0.14, 0.012, Math.PI, 4, 14), '#946a32', 0, 0.04, 0, { r: [0, Math.PI / 2, 0] });
  k.add(bk, sph(0.07, 10, 8), '#8ab45a', -0.05, 0.06, 0.0, { s: [1, 0.8, 1] });
  for (let i = 0; i < 5; i++) k.add(bk, cone(0.03, 0.12, 4), i % 2 ? '#5f8a3a' : '#7aa048', 0.04 + i * 0.015, 0.09, -0.03 + i * 0.012, { r: [0.2 * (i - 2), 0, 0.3 - i * 0.1] });
  blossom(k, bk, 0.07, 0.1, 0.04, '#e86a5a', 1.5); blossom(k, bk, 0.1, 0.09, -0.02, '#f6f2e4', 1.4);
  k.add(bk, box(0.012, 0.16, 0.02), '#9aa0a8', -0.1, 0.1, 0.02, { r: [0, 0, 0.5] });
  sway.add(bk, { freq: 1.6, gain: 0.03, wind: 0.04, bob: 0.2, limit: 0.4 });
}

// ---------------------------------------------------------------- the Miller

function miller(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 1.45, skin = L.skin, flour = '#f4efe2';
  legs(p, k, { B: B * 0.86, thigh: '#5a5048', shin: '#5a5048', boot: '#3e2a1c', skin, bootS: 1.2, bootH: 0.14, thighR: 1.25, shinR: 1.15 });
  const T = p.torso;
  // a great round knitted jumper, oatmeal, under a brown waistcoat; a flour-white apron over all
  jumper(k, T, B * 0.86, '#cdbb94', '#a8946c', '#e8dcc0', 0.1, 1.12);
  k.add(T, folds(lathe([[0.12, 0.5], [0.2 * B * 0.86, 0.47], [0.29 * B * 0.86, 0.3], [0.31 * B * 0.86, 0.1], [0.29 * B * 0.86, -0.04]], 18, 0.5, Math.PI * 2 - 1.0), 6, 0.03, 0.47, -0.04), '#7a5232', 0, 0, 0, { s: [1.03, 1, 0.92], dbl: true });
  for (let i = 0; i < 3; i++) k.add(T, sph(0.018, 6, 5), '#c8a050', 0.1, 0.32 - i * 0.12, 0.27 * B * 0.86, { line: false });
  const ap = pivot(T, 0, 0.1, 0); p.coat = ap;
  k.add(ap, folds(new THREE.CylinderGeometry(0.27 * B * 0.86, 0.33 * B * 0.86, 0.6, 12, 1, true, -1.0, 2.0), 4, 0.04, 0.3, -0.3), flour, 0, -0.3, 0, { s: [1, 1, 0.86], dbl: true });
  k.add(T, box(0.26, 0.22, 0.02), flour, 0, 0.28, 0.3 * B * 0.86, { r: [-0.08, 0, 0] });
  for (let i = 0; i < 8; i++) k.add(T, sph(0.012, 5, 4), '#ffffff', -0.15 + i * 0.045, 0.1 + ((i * 7) % 5) * 0.08, 0.3 * B * 0.86, { line: false });
  arms(p, k, { B: B * 0.84, sleeve: '#cdbb94', fore: '#cdbb94', skin, rolled: true, hand: 1.12, puff: 1.15, foreR: 1.15 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.1, 0.07);
  face(p, k, L, { skin, brow: '#7a6a5a', browW: 1.4, browT: 1.9, browTilt: 0.15, nose: 'bulb', noseC: '#e89a80', wrinkles: true, blush: '#ef8f80', skull: [1.08, 1.0, 1.0] });
  // a big soft beard, brown going grey, and a moustache over it, dusted with flour
  const bd = '#8a7462', bl = '#b0a090';
  k.add(p.head, sph(0.13, 12, 10), bd, 0, 0.04, 0.08, { s: [1.15, 1.25, 0.85] });
  k.add(p.head, sph(0.09, 10, 8), bl, 0, -0.06, 0.12, { s: [1.0, 1.1, 0.8] });
  for (const s of [-1, 1]) {
    k.add(p.head, sph(0.07, 10, 8), bd, 0.1 * s, 0.07, 0.09, { s: [0.9, 1.3, 0.8] });
    k.add(p.head, sph(0.045, 8, 6), bl, 0.05 * s, 0.12, 0.155, { s: [1.4, 0.6, 0.7], r: [0, 0, 0.35 * s] });
  }
  for (let i = 0; i < 5; i++) k.add(p.head, sph(0.008, 4, 3), flour, -0.06 + i * 0.03, 0.02 + (i % 2) * 0.05, 0.17, { line: false });
  tufts(k, p.hair, bd, 9, 0);
  strawHat(k, sway, p.head, { brim: 1.2, tilt: [-0.06, 0, 0.04], flowers: ['#f6f2e4', '#f2c94a'], seed: 21, moss: 0.8 });
  // a big mug of tea in his right hand
  const mug = pivot(p.arms[1].hand, 0, -0.04, 0.06);
  k.add(mug, cyl(0.055, 0.05, 0.12, 12), '#5f7f9a', 0, 0, 0);
  k.add(mug, tor(0.035, 0.01, Math.PI * 1.2, 4, 10), '#5f7f9a', 0.065, 0, 0, { r: [0, 0, -Math.PI * 0.6] });
  k.add(mug, cyl(0.048, 0.048, 0.005, 12), '#8a5a32', 0, 0.05, 0, { line: false });
  k.add(mug, tor(0.056, 0.005, Math.PI * 2, 3, 14), '#e8dcc0', 0, 0.03, 0, { r: [Math.PI / 2, 0, 0], line: false });
  sway.stand(mug, 0, 0);
  p.held.push(mug);
}

// ---------------------------------------------------------------- Tamsin the Ropewright

function ropewright(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 1.05, skin = L.skin, rope = '#c8a86a', ropeD = '#a08048';
  legs(p, k, { B, thigh: '#5a4a3a', shin: '#5a4a3a', boot: '#5a3a26', skin, bootS: 1.15, bootH: 0.2, wrap: '#c8b48a' });
  const T = p.torso;
  jumper(k, T, B, '#c4703e', '#9a5230', '#f0dcb0', 0.06, 1.0);
  // a woven waistcoat in stripes of ochre and teal, and a thick leather belt with a marlinspike and a knife
  k.add(T, folds(lathe([[0.12, 0.5], [0.2 * B, 0.47], [0.28 * B, 0.3], [0.295 * B, 0.1], [0.28 * B, -0.03]], 18, 0.45, Math.PI * 2 - 0.9), 5, 0.02, 0.47, -0.03), '#3f7a74', 0, 0, 0, { s: [1.03, 1, 0.92], dbl: true });
  for (let i = 0; i < 4; i++) k.add(T, tor(0.29 * B, 0.012, Math.PI * 2 - 0.9, 3, 20), '#d8a84a', 0, 0.36 - i * 0.1, 0, { r: [Math.PI / 2, 0, 0.45 + Math.PI], s: [1.03, 0.92, 1], line: false });
  k.add(T, tor(0.25 * B, 0.025, Math.PI * 2, 4, 20), '#5a3a22', 0, -0.03, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1] });
  k.add(T, box(0.04, 0.035, 0.015), '#c8a050', 0, -0.03, 0.225 * B, { line: false });
  k.add(T, cone(0.012, 0.16, 6), '#c8c8c8', -0.2 * B, -0.1, 0.1, { r: [Math.PI, 0, 0.1] });
  k.add(T, cyl(0.016, 0.016, 0.06, 6), '#6a4a2a', -0.2 * B, -0.01, 0.1, {});
  // a coil of rope over her shoulder, and a hank of thinner line on her hip
  for (let i = 0; i < 4; i++) k.add(T, tor(0.3 * B + i * 0.012, 0.022, Math.PI * 2, 5, 22), i % 2 ? rope : ropeD, 0.02, 0.28, 0.0, { r: [Math.PI / 2 - 0.1, 0.0, 0.65 + i * 0.04], s: [1, 1.15, 1] });
  const hank = pivot(T, 0.24 * B, -0.06, 0.02);
  for (let i = 0; i < 3; i++) k.add(hank, tor(0.06, 0.01, Math.PI * 2, 4, 12), rope, 0, -0.08 - i * 0.005, 0, { r: [0, Math.PI / 2, 0.1 * i] });
  sway.add(hank, { freq: 1.9, gain: 0.04, wind: 0.05, bob: 0.25 });
  // leather gloves
  arms(p, k, { B, sleeve: '#c4703e', fore: '#c4703e', skin: '#7a5236', cuff: '#9a5230', hand: 1.02, puff: 1.08 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.08);
  face(p, k, L, { skin, brow: '#2a1e18', browW: 1.1, browT: 1.4, browTilt: 0.12, nose: 'long', noseC: '#c88a6a', blush: '#d8806a' });
  // dark hair in one thick braid over her shoulder
  const hc = '#2e2220';
  k.add(p.hair, sph(0.17, 14, 10), hc, 0, 0.21, -0.035, { s: [1.04, 0.9, 1.02] });
  let par: THREE.Object3D = pivot(p.hair, 0.1, 0.12, -0.12);
  par.rotation.set(0.5, 0, -0.5);
  for (let i = 0; i < 6; i++) {
    const seg = pivot(par, 0, i === 0 ? 0 : -0.07, 0); const r = 0.042 - i * 0.003;
    k.add(seg, sph(r, 8, 6), hc, 0.01, -0.035, 0, { s: [0.95, 1.1, 0.85], r: [0, 0, 0.5] });
    k.add(seg, sph(r, 8, 6), hc, -0.01, -0.07, 0, { s: [0.95, 1.1, 0.85], r: [0, 0, -0.5] });
    sway.add(seg, { freq: 1.6 + i * 0.1, damp: 0.4, gain: 0.012, wind: 0.015, bob: 0.02, limit: 0.25 });
    par = seg;
  }
  k.add(par, tor(0.02, 0.009, Math.PI * 2, 4, 10), '#d8a84a', 0, -0.1, 0, { r: [Math.PI / 2, 0, 0], line: false });
  strawHat(k, sway, p.head, { brim: 1.0, tilt: [-0.14, 0, -0.1], flowers: ['#f2c94a', '#f6f2e4'], seed: 31, moss: 0.6 });
}

// ---------------------------------------------------------------- the other Mossfolk

const KNITS: [string, string, string][] = [
  ['#b86a4a', '#8e4e36', '#efe0c0'], ['#6a8aa8', '#4a6a88', '#efe6d0'], ['#d8b85a', '#b0923a', '#f4ecd8'],
  ['#8a6a9a', '#6a4a7a', '#efe0d8'], ['#7f9a4e', '#5f7a38', '#efe4c8'], ['#c89a6a', '#a07a4a', '#f2e8d0'],
];
const SKIRTS = ['#8a4a3a', '#4a6a5a', '#6a5a8a', '#a87a3a', '#5a6a8a', '#7a5a3a'];
const PETALS = ['#f6f2e4', '#f0b6c8', '#e86a5a', '#9ab8e8', '#b48ad8', '#f2c94a'];

function folk(p: Person, k: Kit, L: PersonLook, sway: Sway, seed: number) {
  let s = seed * 7919 + 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const B = L.build ?? 1, skin = L.skin, kn = KNITS[seed % KNITS.length], woman = seed % 2 === 0;
  if (woman) legs(p, k, { B: B * 0.9, thigh: SKIRTS[seed % SKIRTS.length], shin: '#5a4a3a', boot: '#4a3226', skin, bootH: 0.1 });
  else legs(p, k, { B, thigh: '#5a5048', shin: '#5a5048', boot: '#3e2a1c', skin, bootS: 1.15, bootH: 0.13 });
  const T = p.torso;
  jumper(k, T, B, kn[0], kn[1], kn[2], woman ? 0.0 : 0.08, 1 + r() * 0.12);
  if (woman) skirt(p, k, B, SKIRTS[seed % SKIRTS.length], [kn[2], kn[1]], 0.62 + r() * 0.1);
  else k.add(T, cyl(0.22 * B, 0.23 * B, 0.14, 14), '#5a5048', 0, -0.1, 0, { s: [1, 1, 0.86] });
  if (r() < 0.5) k.add(T, folds(lathe([[0.25 * B, 0.08], [0.3 * B, -0.3], [0.32 * B, -0.5]], 10, -0.7, 1.4), 5, 0.05, 0.08, -0.5), '#e8dcc0', 0, 0, 0.02, { s: [1.04, 1, 0.92], dbl: true });
  arms(p, k, { B, sleeve: kn[0], fore: kn[0], skin, cuff: kn[1], rolled: r() < 0.3, hand: 1, puff: 1.08 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.1);
  const old = r() < 0.4;
  face(p, k, L, { skin, brow: old ? '#d8d2c6' : '#5a4030', browW: 1 + r() * 0.3, browT: 1 + r() * 0.6, browTilt: (r() - 0.5) * 0.4, nose: (['button', 'round', 'bulb', 'long'] as const)[Math.floor(r() * 4)], noseC: '#e0a088', wrinkles: old, freckles: !old && r() < 0.5, blush: '#ec9a8a' });
  if (!woman && r() < 0.6) {
    const bc = old ? '#d8d2c6' : '#6a4a32';
    k.add(p.head, sph(0.1, 10, 8), bc, 0, 0.05, 0.1, { s: [1.1, 1.0, 0.8] });
  }
  tufts(k, p.hair, old ? '#e2ded4' : ['#6a4428', '#3a2a20', '#a8683a'][seed % 3], 10, woman ? 3 : 2);
  strawHat(k, sway, p.head, { brim: 0.9 + r() * 0.35, tilt: [-0.1 + (r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.2], flowers: [PETALS[seed % 6], PETALS[(seed + 2) % 6], '#f6f2e4'], seed: 40 + seed, moss: 0.5 + r() });
}

const BUILD: Record<Exclude<MossKind, 'folk'>, (p: Person, k: Kit, L: PersonLook, s: Sway) => void> = { pip, bramwyn, miller, ropewright };

/** The builder for one of the Mossfolk, for PersonLook.custom. */
export function mossBuilder(kind: MossKind, seed = 0) {
  return (p: Person, look: PersonLook) => {
    const k = new Kit(), sway = new Sway();
    p.hips.add(p.torso);
    if (kind === 'folk') folk(p, k, look, sway, seed); else BUILD[kind](p, k, look, sway);
    anchors(p);
    k.bake();
    sway.ref = p.root;
    p.sway = sway;
  };
}

const base = (o: Partial<NpcLook> & { skin: string }): NpcLook => ({ hair: '#5a3a26', hairStyle: 'short', top: '#d8c8a0', trousers: '#5a5048', boots: '#3e2a1c', ...o });

/** Each named Mossfolk's look (with their builder); folkLook(n) for the others. */
export const MOSSFOLK: Record<Exclude<MossKind, 'folk'>, NpcLook> = {
  pip: base({ custom: mossBuilder('pip'), skin: '#f0c8a4', height: 0.66, head: 1.25, build: 0.95, idle: 'wind', voice: 1.5, gait: { rate: 1.25, stride: 0.95, bounce: 2.2, arm: 1.2 } }),
  bramwyn: base({ custom: mossBuilder('bramwyn'), skin: '#e6c0a0', height: 0.8, build: 1.0, hunch: 0.45, idle: 'warm', voice: 0.8, gait: { rate: 0.7, stride: 0.55, bounce: 0.45, arm: 0.4, waddle: 0.03 } }),
  miller: base({ custom: mossBuilder('miller'), skin: '#e0a888', height: 1.1, build: 1.45, idle: 'heels', voice: 0.65, gait: { rate: 0.8, stride: 0.75, bounce: 0.6, arm: 0.7, waddle: 0.08 } }),
  ropewright: base({ custom: mossBuilder('ropewright'), skin: '#c89070', height: 0.97, build: 1.05, idle: 'lean', voice: 1.05, gait: { rate: 0.95, stride: 1.1, bounce: 0.9, arm: 1.0 } }),
};
const FOLK_SKIN = ['#f0c8a4', '#d8a880', '#c08860', '#e8b898', '#a87050', '#f2d0b0'];
export function folkLook(n: number): NpcLook {
  return base({ custom: mossBuilder('folk', n), skin: FOLK_SKIN[n % FOLK_SKIN.length], height: 0.85 + ((n * 37) % 20) / 100, build: 1 + ((n * 53) % 30) / 100, hunch: n % 3 === 0 ? 0.3 : 0, idle: (['warm', 'heels', 'lean', 'none'] as const)[n % 4], voice: 0.8 + ((n * 29) % 8) / 10 });
}
