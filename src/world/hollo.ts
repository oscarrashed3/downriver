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
  const white = '#f4f6ff';
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
  const shades = ['#f6f8ff', '#eef1fc', '#e6eaf8'];
  for (let i = 0; i < 46; i++) {
    const th = rr() * Math.PI * 2, ph = Math.acos(1 - rr() * 1.15);
    const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
    if (nz > 0.45 && ny < 0.8) continue; // keep the face and chest clear
    const lump = new THREE.Mesh(lumpGeo, toon(shades[i % 3]));
    const rad = 0.55 + rr() * 0.5;
    lump.position.set(nx * 2.55, 1.5 + ny * 1.6, nz * 3.1);
    lump.scale.set(rad * 1.2, rad * 0.85, rad * 1.2);
    lump.castShadow = true;
    body.add(lump);
  }
  // paws
  const paws: THREE.Object3D[] = [];
  for (const [x, z] of [[-1.7, 1.9], [1.7, 1.9], [-1.8, -1.9], [1.8, -1.9]]) {
    const pw = new THREE.Group(); pw.position.set(x, 0.55, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.6, 4, 10), toon(white)); leg.position.y = 0; leg.castShadow = true;
    pw.add(leg);
    for (let k = -1; k <= 1; k++) { const toe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon('#e6eaf8')); toe.position.set(k * 0.24, -0.45, 0.5); pw.add(toe); }
    body.add(pw); paws.push(pw);
  }
  // head
  const head = new THREE.Group(); head.position.set(0, 1.7, 3.35); head.scale.setScalar(1.35); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), toon(white)); skull.scale.set(1.1, 0.95, 1.0); skull.castShadow = true;
  head.add(skull);
  for (let i = 1; i <= Math.ceil(shells / 2); i++) { const sh = new THREE.Mesh(skull.geometry, furShell(white, i * 2, shells)); const k = 1 + i * 0.03; sh.scale.set(1.1 * k, 0.95 * k, 1.0 * k); sh.userData.noOutline = true; head.add(sh); }
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
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), toon(white)); tail.position.set(0, 1.6, -3.4); body.add(tail);
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
