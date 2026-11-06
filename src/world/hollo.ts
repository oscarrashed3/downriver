import * as THREE from 'three';
import { paint, softRamp, addOutlines } from '../render/paint';
import { toon } from './props';

/**
 * Hollo: a huge, soft snow creature asleep on the spring.
 * Built from a round body under layers of fur shells, a heavy head with drooping ears,
 * stubby paws, and eyes that stay closed until the big moment.
 */

let furTex: THREE.DataTexture | null = null;
function furNoise(): THREE.DataTexture {
  if (furTex) return furTex;
  const N = 128, data = new Uint8Array(N * N * 4);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = new Float32Array(N * N).map(() => r());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let k = -2; k <= 2; k++) a += base[((y + k + N) % N) * N + x] + base[y * N + ((x + k + N) % N)]; const v = Math.floor(Math.min(1, Math.max(0, (a / 10 - 0.5) * 3 + 0.5)) * 255); data.set([v, v, v, 255], (y * N + x) * 4); }
  furTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping; furTex.magFilter = THREE.LinearFilter; furTex.needsUpdate = true;
  return furTex;
}

function furShell(color: string, layer: number, layers: number) {
  const m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp(), alphaMap: furNoise(), alphaTest: 0.25 + (layer / layers) * 0.7 }), { variation: 0.15, rim: 1.6 });
  m.alphaMap!.repeat.set(5, 4);
  return m;
}

export interface Hollo {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Group;
  eyes: THREE.Mesh[];
  lids: THREE.Mesh[];
  ears: THREE.Object3D[];
  paws: THREE.Object3D[];
  breath: THREE.Points;
  /** 0 closed, 1 open. */
  eyeOpen: number;
  /** 0 asleep and curled, 1 standing. */
  rise: number;
  walk: number;
  update(dt: number, t: number): void;
}

export function makeHollo(shells = 0): Hollo {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const white = '#e9edf8';
  const bodyGeo = new THREE.SphereGeometry(1, 28, 20);
  const core = new THREE.Mesh(bodyGeo, toon(white)); core.castShadow = true; core.receiveShadow = true;
  core.scale.set(2.7, 1.75, 3.3); core.position.y = 1.5;
  body.add(core);
  for (let i = 1; i <= shells; i++) {
    const sh = new THREE.Mesh(bodyGeo, furShell(white, i, shells));
    const k = 1 + i * 0.012;
    sh.scale.set(2.7 * k, 1.75 * k, 3.3 * k); sh.position.y = 1.5; sh.userData.noOutline = true;
    body.add(sh);
  }
  // Fur as big soft lumps over the back, like a cumulus cloud: the ink pass outlines each one.
  let sd = 17; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const lumpGeo = new THREE.IcosahedronGeometry(1, 2);
  const shades = ['#eef1fb', '#e6eaf6', '#dde3f2', '#f6f8ff'];
  const fur = new THREE.Group(); body.add(fur);
  // a second, smaller layer of puffs over the first, so the coat reads as deep, soft and cloud-like
  for (let i = 0; i < 150; i++) {
    const th = rr() * Math.PI * 2, ph = Math.acos(1 - rr() * 1.35);
    const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
    if (nz > 0.5 && ny < 0.75) continue;
    const lump = new THREE.Mesh(lumpGeo, toon(shades[(i + 1) % 4]));
    const rad = 0.42 + rr() * 0.35;
    lump.position.set(nx * 2.95, 1.5 + ny * 1.95, nz * 3.45);
    lump.scale.set(rad * 1.15, rad * 0.8, rad * 1.15);
    lump.castShadow = true;
    fur.add(lump);
  }
  // tufts: little pointed flicks of fur standing up along the spine and shoulders
  const tuftMat = toon('#f4f6ff');
  for (let i = 0; i < 26; i++) {
    const z = -3 + i * 0.24, x = Math.sin(i * 2.7) * 0.9;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 6), tuftMat);
    const ny = Math.sqrt(Math.max(0, 1 - (x / 2.9) ** 2 - (z / 3.4) ** 2));
    tuft.position.set(x, 1.5 + ny * 1.95 + 0.25, z); tuft.rotation.set(-0.4 + Math.sin(i) * 0.3, 0, Math.sin(i * 1.9) * 0.4);
    fur.add(tuft);
  }
  // he has slept so long that the valley has started to grow on him: a little snowy fir, stones and two flowers
  const garden = new THREE.Group(); garden.position.set(0.7, 3.55, -0.9); garden.rotation.z = -0.15; fur.add(garden);
  const fir = new THREE.Group(); fir.position.set(0, 0, 0); garden.add(fir);
  fir.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 5), toon('#5a3e2c')).translateY(0.25));
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.55 - k * 0.14, 0.6, 7), toon('#3f6a4a')); c.position.y = 0.55 + k * 0.32; fir.add(c); const sn = new THREE.Mesh(new THREE.ConeGeometry(0.4 - k * 0.1, 0.25, 7), toon('#f6f8ff')); sn.position.y = 0.75 + k * 0.32; fir.add(sn); }
  for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + k * 0.05, 0), toon('#8f8a96')); st.position.set(-0.5 + k * 0.35, 0.05, 0.5 - k * 0.2); garden.add(st); }
  for (const [x, z, c] of [[-0.7, -0.3, '#7fa8d8'], [0.5, 0.6, '#ffd24a']] as [number, number, string][]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 3), toon('#4f7a3a')); stem.position.set(x, 0.17, z); garden.add(stem);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), toon(c)); fl.position.set(x, 0.36, z); garden.add(fl);
  }
  // icicles along the lower edge of his coat
  const ice = toon('#d8f1ff', '#9fdcff', 0.5);
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2; if (Math.sin(a) > 0.6) continue;
    const L = 0.3 + (i % 3) * 0.18;
    const ic = new THREE.Mesh(new THREE.ConeGeometry(0.07, L, 5), ice); ic.rotation.x = Math.PI;
    ic.position.set(Math.cos(a) * 2.55, 0.35 - L / 2, Math.sin(a) * 3.05); fur.add(ic);
  }
  for (let i = 0; i < 78; i++) {
    const th = rr() * Math.PI * 2, ph = Math.acos(1 - rr() * 1.45);
    const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
    if (nz > 0.45 && ny < 0.8) continue; // keep the face and chest clear
    const lump = new THREE.Mesh(lumpGeo, toon(shades[i % 3]));
    const rad = 0.8 + rr() * 0.55;
    lump.position.set(nx * 2.45, 1.5 + ny * 1.55, nz * 2.95);
    lump.scale.set(rad * 1.2, rad * 0.85, rad * 1.2);
    lump.castShadow = true;
    fur.add(lump);
  }
  // paws
  const paws: THREE.Object3D[] = [];
  for (const [x, z] of [[-1.7, 1.9], [1.7, 1.9], [-1.8, -1.9], [1.8, -1.9]]) {
    const pw = new THREE.Group(); pw.position.set(x, 0.55, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.6, 4, 10), toon(white)); leg.position.y = 0; leg.castShadow = true;
    pw.add(leg);
    for (let k = -1; k <= 1; k++) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toon('#e6eaf8')); toe.position.set(k * 0.26, -0.45, 0.5); pw.add(toe);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), toon('#5a6a9a')); claw.position.set(k * 0.26, -0.5, 0.7); claw.rotation.x = Math.PI / 2 + 0.4; pw.add(claw);
    }
    // a fluffy cuff of fur round each ankle
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), toon('#f2f5ff')); c.position.set(Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6); pw.add(c); }
    body.add(pw); paws.push(pw);
  }
  // head
  const head = new THREE.Group(); head.position.set(0, 1.7, 3.35); head.scale.setScalar(1.35); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), toon(white)); skull.scale.set(1.1, 0.95, 1.0); skull.castShadow = true;
  head.add(skull);
  for (let i = 1; i <= Math.ceil(shells / 2); i++) { const sh = new THREE.Mesh(skull.geometry, furShell(white, i * 2, shells)); const k = 1 + i * 0.03; sh.scale.set(1.1 * k, 0.95 * k, 1.0 * k); sh.userData.noOutline = true; head.add(sh); }
  // a big soft ruff of fur round the face, and cheek puffs, so the head sits in his coat like a moon in cloud
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), toon(i % 2 ? '#eef1fb' : '#e4e9f6'));
    const r = 1.35 + (i % 3) * 0.08;
    puff.position.set(Math.cos(a) * r * 1.1, Math.sin(a) * r * 0.95, 0.15 - (i % 2) * 0.25);
    puff.scale.setScalar(0.38 + (i % 4) * 0.06); puff.castShadow = true; head.add(puff);
  }
  for (let i = 0; i < 7; i++) { // a fluffy fringe on the brow
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 6), toon('#f6f8ff'));
    f.position.set(-0.6 + i * 0.2, 1.05 + Math.sin(i * 1.3) * 0.08, 0.75); f.rotation.x = 0.9; f.rotation.z = (i - 3) * 0.12; head.add(f);
  }
  for (const s of [-1, 1]) { // heavy, sleepy brows
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 3, 8), toon('#dfe4f2')); b.position.set(0.55 * s, 0.5, 1.2); b.rotation.z = Math.PI / 2 + 0.25 * s; head.add(b);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), toon('#eef0fa')); muzzle.position.set(0, -0.35, 1.0); muzzle.scale.set(1.15, 0.75, 0.8); head.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon('#5a6a9a')); nose.position.set(0, -0.15, 1.6); nose.scale.set(1.3, 0.8, 0.8); head.add(nose);
  const blush = toon('#f4c0c8');
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), blush); b.position.set(0.75 * s, -0.25, 1.12); b.rotation.y = 0.55 * s; b.userData.noOutline = true; head.add(b); }
  const eyes: THREE.Mesh[] = [], lids: THREE.Mesh[] = [], ears: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon('#232a48')); eye.position.set(0.55 * s, 0.22, 1.18); eye.scale.set(0.9, 1.15, 0.5);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' })); glint.position.set(0.05, 0.08, 0.15); eye.add(glint);
    eye.userData.noOutline = true; head.add(eye); eyes.push(eye);
    // closed eye: a soft curved line
    const lid = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 4, 12, Math.PI), toon('#3a4268')); lid.position.set(0.55 * s, 0.2, 1.22); lid.rotation.z = Math.PI; lid.userData.noOutline = true;
    head.add(lid); lids.push(lid);
    const ear = new THREE.Group(); ear.position.set(1.0 * s, 0.75, -0.1);
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 10), toon(white)); e.position.y = -0.6; e.castShadow = true; ear.add(e);
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.8, 4, 8), toon('#dfe4f6')); inner.position.set(0, -0.6, 0.2); inner.userData.noOutline = true; ear.add(inner);
    ear.rotation.z = 0.55 * s; ear.rotation.x = -0.25; head.add(ear); ears.push(ear);
  }
  // a short round tail
  const tail = new THREE.Group(); tail.position.set(0, 1.6, -3.4); body.add(tail);
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), toon(k % 2 ? white : '#f6f8ff')); p.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.2); tail.add(p); }
  tail.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), toon(white)));
  // whiskers of frost on the muzzle
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 3), toon('#cfe6ff', '#bfe0ff', 0.4));
    w.position.set(0.75 * s, -0.4 + k * 0.1, 1.35); w.rotation.z = Math.PI / 2 + (k - 1) * 0.15 * s; w.rotation.y = -0.4 * s; w.userData.noOutline = true; head.add(w);
  }
  addOutlines(root, '#3a4268', 0.03);

  // frost breath: a little cloud of points puffing from the nose
  const N = 40, pos = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const breath = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0.55, depthWrite: false }));
  breath.frustumCulled = false; head.add(breath);
  for (let i = 0; i < N; i++) life[i] = Math.random();

  const h: Hollo = {
    root, head, body, eyes, lids, ears, paws, breath, eyeOpen: 0, rise: 0, walk: 0,
    update(dt, t) {
      const asleep = 1 - h.rise;
      // breathing: slow, deep, a little slower when asleep
      const br = Math.sin(t * (asleep > 0.5 ? 0.9 : 1.4));
      core.scale.y = 1.75 * (1 + br * 0.035);
      fur.scale.set(1 + br * 0.012, 1 + br * 0.03, 1 + br * 0.012);
      tail.rotation.y = Math.sin(t * 0.6) * 0.25 * (0.3 + h.rise); tail.rotation.x = Math.sin(t * 0.43) * 0.1;
      fir.rotation.z = Math.sin(t * 1.3) * 0.05; fir.rotation.x = Math.sin(t * 0.9) * 0.04;
      body.position.y = -0.45 * asleep + h.rise * 0.6 + Math.abs(Math.sin(h.walk * 3)) * 0.12 * h.rise;
      body.rotation.z = 0.12 * asleep;
      head.rotation.x = 0.35 * asleep - 0.1 * h.rise + Math.sin(t * 0.5) * 0.03;
      head.position.y = 1.7 - 0.7 * asleep;
      for (const [i, pw] of paws.entries()) {
        pw.position.y = 0.55 - 0.3 * asleep;
        pw.rotation.x = Math.sin(h.walk * 3 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.45 * h.rise;
      }
      ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 0.7 + i) * 0.05 + (Math.sin(t * 0.31 + i * 2) > 0.97 ? 0.25 : 0); });
      eyes.forEach(e => (e.visible = h.eyeOpen > 0.5));
      lids.forEach(l => (l.visible = h.eyeOpen <= 0.5));
      // breath
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.35;
        if (life[i] > 1) life[i] -= 1;
        const k = life[i];
        const puff = Math.max(0, br) ;
        p.setXYZ(i, Math.sin(i * 12.9) * 0.4 * k, -0.2 + k * 0.6 + Math.cos(i * 7.1) * 0.2 * k, 1.7 + k * 2.2 * (0.4 + puff));
      }
      p.needsUpdate = true;
      (breath.material as THREE.PointsMaterial).opacity = 0.45 * (0.3 + Math.max(0, br) * 0.7);
    },
  };
  return h;
}
