// World 3, The Overgrown Garden (warm afternoon). Nilo is tiny among giants: flowers taller than houses, leaves like
// roofs, mushrooms, dewdrops like glass balls, a fallen watering can, pebbles for stepping stones, and slow friendly
// beasts. The giant scale is the whole trick: it must never read as a forest or as World 1's meadow.
// Sketch: a dock, the watering can (the landmark), giant flowers and leaves, a snail; the builder refines.
import * as THREE from 'three';
import type { Planet } from './planet';
import type { Kit, Flat } from './content';
import * as P from './props';
import * as Q from './props2';
import { addOutlines } from '../render/paint';

/** The fallen watering can, the landmark: lying on its side, its spout dribbling into the river. */
export const CAN = { lat: 70, lon: -16 } as const;

const PETALS = ['#f49ac0', '#ffd25a', '#ff8a7a', '#f6f0f4', '#c89af0', '#ffb05a'];
const ink = (g: THREE.Object3D, w = 0.06) => addOutlines(g, '#3b2a30', w);
const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
};

/** A flower as tall as a house: a curved stem, two leaves, a ring of petals and a fat centre. */
export function giantFlower(h = 9): THREE.Group {
  const g = new THREE.Group();
  const stem = P.toon('#5f9a3a');
  const lean = (P.rand() - 0.5) * 0.25;
  const s = m(new THREE.CylinderGeometry(0.22, 0.32, h, 7), stem, 0, h / 2, 0); s.rotation.z = lean; g.add(s);
  const top = new THREE.Vector3(-Math.sin(lean) * h, Math.cos(lean) * h, 0);
  for (const side of [-1, 1]) {
    const leaf = m(new THREE.SphereGeometry(1, 10, 6), P.toon('#6fae44'), side * 1.1, h * (0.25 + P.rand() * 0.15), 0);
    leaf.scale.set(1.6, 0.12, 0.7); leaf.rotation.z = side * 0.5; g.add(leaf);
  }
  const head = new THREE.Group(); head.position.copy(top); head.rotation.x = -0.5 + P.rand() * 0.3; g.add(head);
  const col = P.toon(PETALS[Math.floor(P.rand() * PETALS.length)]);
  const n = 7 + Math.floor(P.rand() * 4), pr = 1.4 + P.rand() * 0.8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pe = m(new THREE.SphereGeometry(1, 9, 6), col, Math.cos(a) * pr, 0, Math.sin(a) * pr);
    pe.scale.set(pr * 0.75, 0.16, pr * 0.42); pe.rotation.y = -a; head.add(pe);
  }
  const ctr = m(new THREE.SphereGeometry(pr * 0.55, 12, 8), P.toon('#e8a030'), 0, 0.15, 0); ctr.scale.y = 0.5; head.add(ctr);
  ink(g);
  return g;
}

/** A leaf the size of a roof, lying on the lawn or arching off a hidden stalk. */
export function giantLeaf(): THREE.Group {
  const g = new THREE.Group();
  const leaf = m(new THREE.SphereGeometry(1, 14, 8), P.toon(P.rand() < 0.5 ? '#5aa040' : '#78b84a'), 0, 0.6, 0);
  leaf.scale.set(4.5, 0.25, 2.2); leaf.rotation.z = 0.15; g.add(leaf);
  const vein = m(new THREE.BoxGeometry(8.4, 0.08, 0.12), P.toon('#a8d878'), 0, 0.88, 0); vein.rotation.z = 0.15; g.add(vein);
  ink(g);
  return g;
}

/** A spotted mushroom with a cap you could shelter under. */
export function giantMushroom(h = 3.5): THREE.Group {
  const g = new THREE.Group();
  g.add(m(new THREE.CylinderGeometry(0.45, 0.6, h, 9), P.toon('#f4ead8'), 0, h / 2, 0));
  const cap = m(new THREE.SphereGeometry(1.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.toon(P.rand() < 0.6 ? '#e85a4a' : '#e8a050'), 0, h - 0.2, 0);
  cap.scale.y = 0.65; g.add(cap);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1, r = 0.6 + (i % 3) * 0.4;
    g.add(m(new THREE.SphereGeometry(0.22, 7, 5), P.toon('#fff6ea'), Math.cos(a) * r, h + 0.8 - r * 0.35, Math.sin(a) * r));
  }
  ink(g);
  return g;
}

let dewMat: THREE.MeshPhysicalMaterial | null = null;
/** A dewdrop like a glass ball, sitting on the lawn and catching the sun. */
export function dewdrop(r = 1): THREE.Mesh {
  dewMat ??= new THREE.MeshPhysicalMaterial({ color: '#e8fbff', roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55, clearcoat: 1 });
  const d = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), dewMat);
  d.position.y = r * 0.85; d.scale.y = 0.88;
  d.userData.noOutline = true;
  return d;
}

/** The fallen watering can: a tin barrel on its side, a long spout, a handle like a bridge. */
export function wateringCan(): THREE.Group {
  const outer = new THREE.Group();
  // built along x, then turned so the spout points forward (toward the river when placed facing it)
  const g = new THREE.Group(); g.rotation.y = -Math.PI / 2; outer.add(g);
  const tin = P.toon('#6aa8b8'), rim = P.toon('#4a8090');
  const body = m(new THREE.CylinderGeometry(3, 3, 6, 18), tin, 0, 3, 0); body.rotation.z = Math.PI / 2; g.add(body);
  for (const x of [-3, 3]) { const r = m(new THREE.TorusGeometry(3, 0.18, 6, 24), rim, x, 3, 0); r.rotation.y = Math.PI / 2; g.add(r); }
  const spout = m(new THREE.CylinderGeometry(0.4, 0.7, 7, 10), tin, 5.5, 2.2, 0); spout.rotation.z = Math.PI / 2 + 0.35; g.add(spout);
  const rose = m(new THREE.CylinderGeometry(0.9, 0.5, 0.6, 12), rim, 8.9, 1.0, 0); rose.rotation.z = Math.PI / 2 + 0.35; g.add(rose);
  const handle = m(new THREE.TorusGeometry(2.2, 0.25, 6, 16, Math.PI), rim, -0.5, 5.6, 0); g.add(handle);
  ink(g, 0.08);
  return outer;
}

/** A friendly giant snail, slow as the afternoon. */
export function giantSnail(): THREE.Group {
  const g = new THREE.Group();
  const body = m(new THREE.CapsuleGeometry(0.8, 4, 4, 10), P.toon('#c8b89a'), 0, 0.7, 0); body.rotation.z = Math.PI / 2; g.add(body);
  const shell = m(new THREE.TorusGeometry(1.4, 0.9, 10, 18), P.toon('#d88a5a'), -0.6, 2.2, 0); g.add(shell);
  g.add(m(new THREE.SphereGeometry(0.9, 10, 8), P.toon('#e8a06a'), -0.6, 2.2, 0));
  for (const z of [-0.3, 0.3]) {
    const st = m(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 5), P.toon('#c8b89a'), 2.6, 1.6, z); st.rotation.z = -0.4; g.add(st);
    g.add(m(new THREE.SphereGeometry(0.15, 6, 5), P.toon('#3a3040'), 2.85, 2.2, z));
  }
  ink(g);
  return g;
}

export function prepareGarden(p: Planet, f: Flat) {
  f(176, 0, 9, p.cfg.riverBed + 1.6, 6);
  f(CAN.lat, CAN.lon, 9, p.cfg.riverBed + 1.4, 6);
}

export function populateGarden(k: Kit) {
  const { p, c, put, npc, lm, scatter } = k;
  const can = put(wateringCan(), CAN.lat, CAN.lon, 0, 'river');
  lm('The fallen watering can', CAN.lat, CAN.lon, 'spring');
  c.refs.can = can;

  // A ring of flowers taller than houses round the dock, so the very first look says: you are small here.
  for (const [lat, lon] of [[14, -14], [24, -18], [26, 22], [32, 14], [12, 20]] as const) put(giantFlower(8 + P.rand() * 4), lat, lon, 0);
  scatter(60, () => giantFlower(7 + P.rand() * 6), [8, 172], 7);
  scatter(24, () => giantLeaf(), [10, 170], 7);
  scatter(16, () => giantMushroom(2.5 + P.rand() * 2.5), [20, 170], 7);
  scatter(30, () => dewdrop(0.6 + P.rand() * 0.9), [8, 172], 5);
  // pebbles big as boulders lie about, a few right at the water to hop across on
  scatter(14, () => Q.boulder(1.2 + P.rand()), [10, 170], 6);
  for (const lat of [48, 110, 150]) for (const s of [-1.6, 0, 1.6]) put(Q.riverRock(0.9, 0.35), lat + s * 0.5, s, -0.2);

  const snail = put(giantSnail(), 52, 24, 0);
  c.animate.push((dt, t) => { snail.scale.y = 1 + Math.sin(t * 0.8) * 0.03; });
  lm('Shell, the snail', 52, 24, 'person');

  npc('oro', CAN.lat - 4, CAN.lon + 6);
}
