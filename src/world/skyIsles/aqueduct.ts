// The stone aqueducts that carry the Sky Isles' river across the gaps between its islands (pictures 1 and 3): a
// walled channel on a deep arcade of round arches, its piers hanging free under the arches and ending in broken
// stone points, mossy along the parapets. Built straight along the river's own path, at the river's level there,
// in planet-local space, with the same across-offsets as the heightfield (terrain.ts aqueductAt), so the stone you
// see is the deck you walk on.
import * as THREE from 'three';
import type { Planet } from '../planet';
import { AQ_CHANNEL, AQ_DECK } from './layout';
import { Kit, STONE_TILE } from './sailtownKit';
import { skyRng } from './rand';

// (bright: the stone texture and the toon ramp darken them a good deal, and picture 1's arches are near white)
const CREAM = new THREE.Color('#fff8e8').multiplyScalar(1.12), WARM = new THREE.Color('#f8e4bc').multiplyScalar(1.1), DEEP = new THREE.Color('#e2caa4').multiplyScalar(1.05);
const SOFFIT = new THREE.Color('#d4bea0'), FLOOR = new THREE.Color('#a89c86'), MOSS = new THREE.Color('#93b462');

/** One aqueduct from path parameter t0 to t1 (a little into each island, so its ends sink into the cliffs). */
export function aqueduct(p: Planet, t0: number, t1: number, seed: number): THREE.Group {
  const rnd = skyRng(seed);
  const R = p.R, depth = p.cfg.waterDepth;
  // along-river samples, with the arch geometry laid out in metres at the deck's height
  const bed = p.bedAt((t0 + t1) / 2);
  const rDeck = R + bed;
  const P = (t: number, out = new THREE.Vector3()) => p.pathPoint(t, out);
  const len = (() => { let L = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(); for (let i = 0; i < 64; i++) L += P(t0 + (t1 - t0) * i / 64, a).distanceTo(P(t0 + (t1 - t0) * (i + 1) / 64, b)); return L * rDeck; })();
  const ends = 1.6;                      // metres of abutment at each end (inside the island's cliff)
  const span = len - ends * 2;
  const nb = Math.max(2, Math.round(span / 5.6));
  const B = span / nb, pierW = 1.2, S = B - pierW, rise = Math.min(S / 2, 2.4);
  const crown = 1.15, spring = crown + rise, pierD = spring + 2.6 + rnd() * 0.8;
  // pier centres (metres along) and the depth of the underside at u
  const piers: number[] = [];
  for (let k = 1; k < nb; k++) piers.push(ends + k * B);
  const bottom = (u: number) => {
    if (u < ends + pierW / 2 || u > len - ends - pierW / 2) return pierD + 1.5;
    for (const c of piers) if (Math.abs(u - c) <= pierW / 2) return pierD;
    const x = ((u - ends - pierW / 2) % B + B) % B;
    const k = Math.min(1, Math.max(-1, (x / S) * 2 - 1));
    return spring - rise * Math.sqrt(Math.max(0, 1 - k * k));
  };
  // samples: even steps, plus both edges of every pier, so the piers stand square
  const us = new Set<number>();
  for (let u = 0; u <= len; u += 0.22) us.add(+u.toFixed(4));
  us.add(len);
  for (const c of [...piers, ends, len - ends]) for (const e of [-pierW / 2, pierW / 2]) { us.add(+(c + e - 0.002).toFixed(4)); us.add(+(c + e + 0.002).toFixed(4)); }
  const U = [...us].filter(u => u >= 0 && u <= len).sort((a, b) => a - b);

  const wall = depth + 0.45;
  // the cross-section, outer loop: [across (metres, at R like the heightfield), height above the bed or 'bottom']
  const C = AQ_CHANNEL, D = AQ_DECK;
  const sec: [number, number | 'b'][] = [[-D, wall], [-C, wall], [-C, 0], [C, 0], [C, wall], [D, wall], [D, 'b'], [-D, 'b']];
  const colOf = (k: number, h: number, u: number): THREE.Color => {
    if (k === 2) return FLOOR;
    if (k === 6) return SOFFIT;
    const c = CREAM.clone().lerp(WARM, Math.min(1, Math.max(0, -h / 3))).lerp(DEEP, Math.min(1, Math.max(0, (-h - 3) / 4)));
    // moss along the parapets and dripping a little down the faces
    if (h > wall - 0.05) c.lerp(MOSS, 0.35 + 0.35 * Math.max(0, Math.sin(u * 1.7 + seed) * Math.sin(u * 0.53)));
    else if (h > -0.6 && (k === 5 || k === 7)) c.lerp(MOSS, 0.25 * Math.max(0, Math.sin(u * 2.3 + seed * 3)));
    return c;
  };
  const kit = new Kit();
  const pt = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const tOf = (u: number) => t0 + (t1 - t0) * (u / len);
  const place = (u: number, s: number, h: number, out: THREE.Vector3) => {
    const t = tOf(u);
    P(t, pt); P(Math.max(0, t - 0.002), a); P(Math.min(1, t + 0.002), b);
    tan.subVectors(b, a).normalize(); side.crossVectors(pt, tan).normalize();
    q.copy(pt).addScaledVector(side, s / R).normalize();
    return out.copy(q).multiplyScalar(R + bed + h);
  };
  // each face of the section is its own strip, so the corners stay crisp
  for (let k = 0; k < sec.length; k++) {
    const s0 = sec[k], s1 = sec[(k + 1) % sec.length];
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const v = new THREE.Vector3();
    let perim = 0;
    for (let i = 0; i < U.length; i++) {
      const u = U[i];
      const bot = -bottom(u);
      const h0 = s0[1] === 'b' ? bot : s0[1], h1 = s1[1] === 'b' ? bot : s1[1];
      place(u, s0[0], h0, v); pos.push(v.x, v.y, v.z);
      place(u, s1[0], h1, v); pos.push(v.x, v.y, v.z);
      perim = Math.hypot(s1[0] - s0[0], h1 - h0);
      uv.push(u / STONE_TILE * 1.6, 0, u / STONE_TILE * 1.6, perim / STONE_TILE * 1.6);
      const c0 = colOf(k, h0, u), c1 = colOf(k, h1, u);
      col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
      if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the faces point outward: the section runs clockwise in (across, up), so the outward normal of an
    // edge running (ds, dh) is (-dh, ds)
    const mi = Math.floor(U.length / 2), um = U[mi];
    const hb = -bottom(um);
    const h0m = s0[1] === 'b' ? hb : s0[1], h1m = s1[1] === 'b' ? hb : s1[1];
    const ds = s1[0] - s0[0], dh = h1m - h0m;
    const c0 = place(um, 0, 0, new THREE.Vector3()), upv = c0.clone().normalize();
    const sidev = place(um, 1, 0, new THREE.Vector3()).sub(c0).normalize();
    const want = sidev.multiplyScalar(-dh).addScaledVector(upv, ds);
    const nn = new THREE.Vector3().fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, mi * 2);
    if (nn.dot(want) < 0) {
      const ix = g.index!;
      for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); }
      g.computeVertexNormals();
    }
    kit.add(g, 'stone', null);
  }
  // broken stone points hanging under every pier, and a few blocks stuck under the arches
  for (const c of piers) {
    for (const s of [-1, 1]) {
      const cone = new THREE.ConeGeometry(0.55 + rnd() * 0.25, 1.6 + rnd() * 1.4, 5).rotateX(Math.PI).translate(0, -(0.8 + rnd() * 0.5), 0);
      const base = place(c, s * (D * 0.45) + (rnd() - 0.5) * 0.6, -pierD + 0.1, new THREE.Vector3());
      const up = base.clone().normalize();
      const m = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), new THREE.Vector3(1, 1, 1));
      kit.add(cone, 'stone', DEEP.clone().multiplyScalar(0.92 + rnd() * 0.1), m);
    }
  }
  const g = new THREE.Group(); g.name = 'aqueduct';
  kit.build(g, { inkWidth: 0.03 });
  g.userData.piers = piers.map(u => place(u, 0, -pierD, new THREE.Vector3()));
  return g;
}
