// A living hearth fire: a little flame spirit sitting on its logs, with big round eyes that follow you,
// blinking, a mouth that opens when it crackles, and tongues of flame that lick and flicker upward.
// Our own character: a round, soft-bottomed flame with a tall flickering crest, sitting in a ring of stones.
import * as THREE from 'three';
import { toon } from './props';

const FLAME_COLS = ['#d8402a', '#f06a2c', '#ff9a3a', '#ffc65a', '#fff0a8'];

/** One tongue of flame: a teardrop lathe, wide at the bottom and drawn to a point. */
function tongue(h: number, w: number, color: string, opacity = 1) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // round bottom, swelling belly, long tapering tip
    const r = w * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) ** 0.55 + (t < 0.05 ? w * 0.25 : 0);
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * h));
  }
  const geo = new THREE.LatheGeometry(pts, 10);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  m.userData.noOutline = true;
  return m;
}

/** The camera the fire spirits turn their faces to (set once by the game). */
export const fireView: { cam: THREE.Camera | null } = { cam: null };

export interface FireSpirit {
  root: THREE.Group;
  update(t: number, dt: number): void;
}

export function fireSpirit(): FireSpirit {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // everything with a front (the layered colours and the face) turns to whoever is looking
  const front = new THREE.Group(); body.add(front);
  // the body: layered flames, dark red outside to pale yellow inside
  const layers: { m: THREE.Mesh; ph: number; base: THREE.Vector3; amp: number }[] = [];
  const add = (m: THREE.Mesh, x: number, z: number, ph: number, amp: number) => { m.position.set(x, 0, z); front.add(m); layers.push({ m, ph, base: m.position.clone(), amp }); };
  // each lighter layer sits a little further forward, so the front shows red, orange, gold and a pale heart
  add(tongue(1.7, 0.62, FLAME_COLS[0]), 0, -0.05, 0, 0.1);
  add(tongue(1.45, 0.54, FLAME_COLS[1]), 0, 0.14, 1.3, 0.12);
  add(tongue(1.15, 0.44, FLAME_COLS[2]), 0, 0.3, 2.1, 0.14);
  add(tongue(0.82, 0.32, FLAME_COLS[3]), 0, 0.44, 3.7, 0.16);
  add(tongue(0.5, 0.2, FLAME_COLS[4]), 0, 0.55, 4.4, 0.18);
  // side tongues that flick out and up
  const flicks: { m: THREE.Mesh; ph: number; side: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const m = tongue(0.6 + (i % 3) * 0.2, 0.16, FLAME_COLS[(i % 3) + 1]);
    m.position.set(side * (0.32 + (i >> 1) * 0.08), 0.35 + (i >> 1) * 0.12, 0.05 * side);
    m.rotation.z = -side * 0.5;
    body.add(m); flicks.push({ m, ph: i * 1.7, side });
  }
  // the face, low on the belly, always turned toward whoever is looking
  const face = new THREE.Group(); face.position.set(0, 0.5, 0.5); front.add(face);
  const white = new THREE.MeshBasicMaterial({ color: '#fffaf0' }), dark = new THREE.MeshBasicMaterial({ color: '#2a1410' });
  const eyes: { e: THREE.Mesh; p: THREE.Mesh }[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), white);
    e.position.set(s * 0.15, 0.06, 0.2); e.scale.set(0.85, 1.15, 0.45); e.userData.noOutline = true;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), dark);
    p.position.set(0, -0.01, 0.15); p.scale.set(1, 1.15, 0.5); p.userData.noOutline = true;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), white); glint.position.set(0.02, 0.03, 0.05); glint.userData.noOutline = true; p.add(glint);
    e.add(p); face.add(e); eyes.push({ e, p });
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#7a2010' }));
  mouth.position.set(0, -0.13, 0.19); mouth.scale.set(1.2, 0.35, 0.4); mouth.userData.noOutline = true; face.add(mouth);
  const camLocal = new THREE.Vector3();
  // logs it sits on
  const log = toon('#6a4a34'), logEnd = toon('#c8a070');
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.4;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.1, 7), log);
    l.position.set(Math.cos(a) * 0.25, 0.09, Math.sin(a) * 0.25); l.rotation.z = Math.PI / 2; l.rotation.y = a; root.add(l);
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.11, 7), logEnd); end.position.set(0, 0.555, 0); end.rotation.x = -Math.PI / 2; l.add(end);
  }
  // embers drifting up
  const embers: THREE.Mesh[] = [];
  const emberMat = new THREE.MeshBasicMaterial({ color: '#ffb84a', transparent: true });
  for (let i = 0; i < 10; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), emberMat.clone()); e.userData.noOutline = true; e.userData.ph = i / 10; root.add(e); embers.push(e); }

  let blink = 2, blinkT = 0, crackle = 0;
  return {
    root,
    update(t: number, dt: number) {
      // turn the front (colours and face) toward whoever is looking
      if (fireView.cam) {
        camLocal.copy(fireView.cam.position); body.worldToLocal(camLocal);
        let d = Math.atan2(camLocal.x, camLocal.z) - front.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        front.rotation.y += d * Math.min(1, Math.max(dt * 6, 0.2));
      }
      // the whole body breathes and sways like a flame in a draught
      body.scale.set(1 + Math.sin(t * 5.1) * 0.04, 1 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13) * 0.04, 1);
      body.rotation.z = Math.sin(t * 2.1) * 0.06;
      for (const L of layers) {
        L.m.scale.set(1 + Math.sin(t * 9 + L.ph) * L.amp * 0.6, 1 + Math.sin(t * 11 + L.ph * 2) * L.amp + Math.sin(t * 23 + L.ph) * L.amp * 0.4, 1);
        L.m.rotation.z = Math.sin(t * 6 + L.ph) * L.amp * 0.8;
      }
      for (const f of flicks) {
        const k = (t * 1.8 + f.ph) % 1;
        f.m.scale.setScalar(Math.sin(k * Math.PI) * 1.1 + 0.05);
        f.m.rotation.z = -f.side * (0.5 - k * 0.35) + Math.sin(t * 12 + f.ph) * 0.1;
      }
      // blink every few seconds; widen the eyes and open the mouth on a crackle
      blink -= dt;
      if (blink < 0) { blinkT = 0.14; blink = 2 + Math.random() * 3; }
      blinkT = Math.max(0, blinkT - dt);
      if (Math.random() < dt * 0.25) crackle = 0.6;
      crackle = Math.max(0, crackle - dt);
      const open = blinkT > 0 ? 0.1 : 1.15 + crackle * 0.25;
      for (const { e, p } of eyes) { e.scale.y += (open - e.scale.y) * 0.5; p.position.x = Math.sin(t * 0.7) * 0.025; }
      mouth.scale.y = 0.35 + crackle * 0.9 + Math.max(0, Math.sin(t * 3)) * 0.1;
      for (const e of embers) {
        const k = (t * 0.35 + (e.userData.ph as number)) % 1;
        const a = (e.userData.ph as number) * 20;
        e.position.set(Math.sin(a + t) * 0.35 * k, 0.6 + k * 2.6, Math.cos(a) * 0.3 * k);
        (e.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      }
    },
  };
}
