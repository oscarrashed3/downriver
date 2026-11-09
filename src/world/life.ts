// Small lives in world 1: hens in the village, a cat asleep on a step, butterflies over the flowers,
// ducks on the river, fish that leap, birds wheeling over the ridge, marmots on the cliffs,
// bees round a hive, and little things on the ground (mushrooms, flowers, pinwheels).
// Everything is built in code from a handful of shapes, and most of it reacts when Nilo comes close.
import * as THREE from 'three';
import type { Planet } from './planet';
import type { WorldContent } from './content';
import { toon, rand } from './props';
import { addOutlines } from '../render/paint';
import { orientTo } from './sphere';
import { spotProblem } from './spots';

type LL = [number, number];

const ink = (g: THREE.Object3D, w = 0.02) => addOutlines(g, '#3b2a30', w);
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o;
}
const flat = (c: string) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });

/** A walker on the sphere: a direction from the centre, a heading along the ground, and a home it never strays far from. */
interface Walker { obj: THREE.Object3D; dir: THREE.Vector3; head: THREE.Vector3; home: THREE.Vector3; range: number; t: number; state: number; }

export function addLife(p: Planet, scene: THREE.Scene, c: WorldContent) {
  const near = new THREE.Vector3(1e9, 0, 0); c.refs.lifeNear = near;
  const anim = (f: (dt: number, t: number) => void) => c.animate.push(f);
  const dirOf = (ll: LL) => p.dirRiver(ll[0], ll[1]);
  const tangent = (d: THREE.Vector3) => { const t = new THREE.Vector3(0, 1, 0).cross(d); if (t.lengthSq() < 1e-6) t.set(1, 0, 0).cross(d); return t.normalize(); };
  /** A random dry, gentle spot within r metres of ll (or ll itself if none turns up). */
  const spotNear = (ll: LL, r: number, okWater = false) => {
    const d0 = dirOf(ll), t1 = tangent(d0), t2 = new THREE.Vector3().crossVectors(d0, t1);
    for (let k = 0; k < 30; k++) {
      const a = rand() * Math.PI * 2, m = Math.sqrt(rand()) * r;
      const d = d0.clone().addScaledVector(t1, Math.cos(a) * m / p.R).addScaledVector(t2, Math.sin(a) * m / p.R).normalize();
      const bad = spotProblem(p, d, c.avoid);
      if (!bad || (okWater && bad !== 'solid')) return d;
    }
    return d0;
  };
  const place = (obj: THREE.Object3D, d: THREE.Vector3, head: THREE.Vector3, lift = 0) => {
    obj.position.copy(p.surfacePoint(d, lift));
    orientTo(obj, d, head);
  };
  // creatures move, so the map leaves them out (still things like mushrooms and the hive stay on it)
  const add = (obj: THREE.Object3D, still = false) => { if (!still) obj.userData.mapSkip = true; scene.add(obj); return obj; };
  const walker = (obj: THREE.Object3D, d: THREE.Vector3, range: number): Walker => {
    const w = { obj, dir: d.clone(), head: tangent(d).applyAxisAngle(d, rand() * 6.28), home: d.clone(), range, t: rand() * 4, state: 0 };
    place(obj, w.dir, w.head); add(obj); return w;
  };
  /** Step a walker forward; it turns for home when it reaches the edge of its patch. */
  const step = (w: Walker, speed: number, dt: number, turn = 0) => {
    w.head.projectOnPlane(w.dir).normalize();
    if (w.dir.angleTo(w.home) * p.R > w.range) {
      const toHome = w.home.clone().sub(w.dir).projectOnPlane(w.dir).normalize();
      w.head.lerp(toHome, Math.min(1, dt * 2.5)).normalize();
    } else if (turn) w.head.applyAxisAngle(w.dir, turn * dt);
    const nd = w.dir.clone().addScaledVector(w.head, speed * dt / p.R).normalize();
    // never walk into the river or a wall: turn round instead
    if (spotProblem(p, nd) && !spotProblem(p, w.dir)) { w.head.negate(); return; }
    w.dir.copy(nd);
  };
  const distTo = (obj: THREE.Object3D) => obj.position.distanceTo(near);
  const village: LL = [60.5, -17];

  // ---- hens round the village, pecking and pottering in short bursts
  const hen = (coat: string) => {
    const g = new THREE.Group(), f = toon(coat), red = toon('#d8483a'), yel = toon('#f0b040');
    const body = mesh(new THREE.SphereGeometry(0.2, 10, 8), f, 0, 0.26, 0); body.scale.set(0.85, 0.9, 1.15); g.add(body);
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.22, 6), f, 0, 0.38, -0.2); tail.rotation.x = -0.9; g.add(tail);
    const head = new THREE.Group(); head.position.set(0, 0.42, 0.16); g.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), f));
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.07, 0.08), red, 0, 0.09, 0));
    const beak = mesh(new THREE.ConeGeometry(0.03, 0.08, 4), yel, 0, -0.01, 0.1); beak.rotation.x = Math.PI / 2; head.add(beak);
    head.add(mesh(new THREE.SphereGeometry(0.018, 5, 4), toon('#2a2230'), 0.05, 0.02, 0.06), mesh(new THREE.SphereGeometry(0.018, 5, 4), toon('#2a2230'), -0.05, 0.02, 0.06));
    for (const x of [-0.06, 0.06]) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), yel, x, 0.07, 0));
    ink(g); g.userData.head = head; return g;
  };
  const hens = [0, 1, 2, 3, 4, 5].map(i => walker(hen(['#f4efe6', '#c0783a', '#8a5a3a', '#f4efe6', '#e8d2a8', '#c0783a'][i]), spotNear(village, 11), 5));
  anim((dt, t) => hens.forEach(h => {
    h.t -= dt;
    const scared = distTo(h.obj) < 2.2;
    if (h.t < 0) { h.state = scared ? 1 : rand() < 0.45 ? 1 : 0; h.t = 0.6 + rand() * 1.8; if (h.state) h.head.applyAxisAngle(h.dir, (rand() - 0.5) * 2.4); }
    if (scared) { const away = h.obj.position.clone().sub(near).projectOnPlane(h.dir).normalize(); h.head.lerp(away, 0.2).normalize(); h.state = 1; }
    if (h.state) step(h, scared ? 2.6 : 0.7, dt);
    place(h.obj, h.dir, h.head, h.state ? Math.abs(Math.sin(t * 16)) * 0.03 : 0);
    const hd = h.obj.userData.head as THREE.Object3D;
    hd.rotation.x = h.state ? Math.sin(t * 16) * 0.15 : Math.max(0, Math.sin(t * 5 + h.home.x * 9)) * 1.1;
  }));

  // ---- a ginger cat asleep in the sun by a door, who sits up when you come close
  const cat = (coat: string) => {
    const g = new THREE.Group(), f = toon(coat), pink = toon('#e8a0a0');
    const body = mesh(new THREE.SphereGeometry(0.22, 10, 8), f, 0, 0.15, 0); body.scale.set(1.1, 0.7, 1.3); g.add(body);
    const head = new THREE.Group(); head.position.set(0.08, 0.17, 0.24); g.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), f));
    for (const x of [-0.07, 0.07]) { const e = mesh(new THREE.ConeGeometry(0.04, 0.08, 4), f, x, 0.1, 0); head.add(e); }
    head.add(mesh(new THREE.SphereGeometry(0.015, 5, 4), pink, 0, -0.01, 0.12));
    const eyes = new THREE.Group(); head.add(eyes);
    for (const x of [-0.045, 0.045]) eyes.add(mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), toon('#2a2230'), x, 0.02, 0.11));
    const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.26); g.add(tail);
    const tl = mesh(new THREE.CapsuleGeometry(0.03, 0.3, 3, 6), f, 0.12, 0, 0); tl.rotation.z = Math.PI / 2; tail.add(tl);
    ink(g); g.userData.head = head; g.userData.tail = tail; g.userData.body = body; return g;
  };
  const cats = ([['#e0904a', [57.6, -13.6]], ['#8a8a96', [66.2, -21.4]]] as [string, LL][]).map(([coat, ll]) => {
    const o = cat(coat), d = spotNear(ll, 3); place(o, d, tangent(d)); add(o); return { o, d, up: 0 };
  });
  anim((dt, t) => cats.forEach(k => {
    const want = distTo(k.o) < 4 ? 1 : 0; k.up += (want - k.up) * Math.min(1, dt * 3);
    const { head, tail, body } = k.o.userData as Record<string, THREE.Object3D>;
    body.scale.y = 0.7 + k.up * 0.35 + Math.sin(t * 1.6) * 0.02;
    head.position.y = 0.17 + k.up * 0.16; head.rotation.x = (1 - k.up) * 0.35;
    tail.rotation.y = Math.sin(t * (0.8 + k.up * 2)) * (0.3 + k.up * 0.4);
  }));

  // ---- butterflies over the flowers: the garden, the meadow, the terraces, the bridge banks
  const fly = (col: string) => {
    const g = new THREE.Group(), m = flat(col);
    const wing = (s: number) => { const w = new THREE.Group(); const a = new THREE.Mesh(new THREE.CircleGeometry(0.08, 5), m); a.position.set(s * 0.07, 0, 0.02); a.scale.set(1, 1.2, 1); const b = new THREE.Mesh(new THREE.CircleGeometry(0.055, 5), m); b.position.set(s * 0.05, 0, -0.06); w.add(a, b); w.rotation.x = -Math.PI / 2; g.add(w); return w; };
    g.userData.l = wing(-1); g.userData.r = wing(1);
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.1, 2, 4), toon('#3a2a30')).rotateX(Math.PI / 2));
    return g;
  };
  const flowers: [LL, number][] = [[[55.8, -16.8], 6], [[45, 70], 10], [[68.5, -33], 7], [[71, 9], 6], [[62, -6], 6], [[30, 22], 6]];
  const flies = flowers.flatMap(([ll, n]) => Array.from({ length: n }, () => {
    const o = add(fly(['#ffd27a', '#f4f0e8', '#8ac0f0', '#f49a6a', '#c8a0e8'][Math.floor(rand() * 5)])); o.scale.setScalar(1.7);
    return { o, d: spotNear(ll, 7, true), ph: rand() * 50, sp: 0.4 + rand() * 0.4 };
  }));
  anim((_dt, t) => flies.forEach(f => {
    const d = f.d, t1 = tangent(d), t2 = new THREE.Vector3().crossVectors(d, t1), u = t * f.sp + f.ph;
    const x = Math.sin(u) * 2.2 + Math.sin(u * 2.3) * 0.8, y = Math.cos(u * 0.8) * 2.0 + Math.sin(u * 1.7) * 0.6;
    const dd = d.clone().addScaledVector(t1, x / p.R).addScaledVector(t2, y / p.R).normalize();
    const vel = t1.clone().multiplyScalar(Math.cos(u) * 2.2).addScaledVector(t2, -Math.sin(u * 0.8) * 1.6);
    f.o.position.copy(p.surfacePoint(dd, 0.7 + Math.sin(u * 3.1) * 0.35 + 0.3));
    orientTo(f.o, dd, vel);
    const flap = Math.sin(t * 22 + f.ph) * 1.0;
    (f.o.userData.l as THREE.Object3D).rotation.z = flap; (f.o.userData.r as THREE.Object3D).rotation.z = -flap;
  }));

  // ---- ducks on the river below the bridge, paddling slowly against the current
  const duck = (drake: boolean) => {
    const g = new THREE.Group(), f = toon(drake ? '#b8a890' : '#a08060'), yel = toon('#f0a030');
    const body = mesh(new THREE.SphereGeometry(0.2, 10, 8), f, 0, 0.06, 0); body.scale.set(0.85, 0.6, 1.3); g.add(body);
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.14, 5), f, 0, 0.12, -0.26); tail.rotation.x = -1.9; g.add(tail);
    const head = mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(drake ? '#3a7a50' : '#8a6a4a'), 0, 0.26, 0.2); g.add(head);
    const bill = mesh(new THREE.BoxGeometry(0.07, 0.025, 0.1), yel, 0, 0.24, 0.31); g.add(bill);
    if (drake) g.add(mesh(new THREE.TorusGeometry(0.075, 0.012, 4, 10), toon('#f4f0e8'), 0, 0.19, 0.17).rotateX(Math.PI / 2));
    ink(g); return g;
  };
  const ducks = [0, 1, 2].map(i => ({ o: add(duck(i === 0)), la: 79 + i * 1.6, side: (i - 1) * 0.9, ph: rand() * 9 }));
  const waterDir = (la: number, side: number) => { const a = p.dirRiver(la, 0), b = p.dirRiver(la + 0.5, 0); const s = new THREE.Vector3().crossVectors(a, b.clone().sub(a)).normalize(); return { d: a.clone().addScaledVector(s, side / p.R).normalize(), down: b.sub(a).normalize() }; };
  anim((dt, t) => ducks.forEach(k => {
    k.la += Math.sin(t * 0.15 + k.ph) * dt * 0.18;
    const { d, down } = waterDir(k.la, k.side + Math.sin(t * 0.3 + k.ph) * 0.6);
    k.o.position.copy(d).multiplyScalar(p.waterLevelRadius(p.tAtLat(k.la)) - 0.04 + Math.sin(t * 2 + k.ph) * 0.02).add(p.center);
    orientTo(k.o, d, down.clone().negate().applyAxisAngle(d, Math.sin(t * 0.4 + k.ph) * 0.5));
  }));

  // ---- a fish leaps from the river near you every few seconds, with a ring where it lands
  const fish = add(new THREE.Group());
  { const b = mesh(new THREE.SphereGeometry(0.12, 8, 6), toon('#9ab8c8', '#cfe8f0', 0.2)); b.scale.set(0.5, 0.7, 1.6); fish.add(b);
    const tf = mesh(new THREE.ConeGeometry(0.09, 0.14, 4), toon('#7a98a8'), 0, 0, -0.22); tf.rotation.x = -Math.PI / 2; tf.scale.x = 0.3; fish.add(tf); ink(fish, 0.015); }
  const ring = add(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })));
  const leap = { t: 3, a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(), ring: 9 };
  fish.visible = false;
  anim(dt => {
    leap.t -= dt; leap.ring += dt;
    if (leap.t < -0.9) {
      leap.t = 3 + rand() * 4; fish.visible = false;
      // only near Nilo, and only where the river is open water
      const nd = near.clone().sub(p.center).normalize();
      const { dist, t: rt } = p.riverNearest(nd);
      if (dist < 22 && rt > 0.06 && rt < 0.94) {
        const i = Math.round(rt * (p.path.length - 1)), j = Math.min(p.path.length - 1, i + 3);
        const a = p.path[i].clone(), s = new THREE.Vector3().crossVectors(a, p.path[j].clone().sub(a)).normalize();
        const d = a.addScaledVector(s, (rand() - 0.5) * 2 / p.R).normalize(), fw = p.path[j].clone().sub(p.path[i]).normalize().applyAxisAngle(d, (rand() - 0.5) * 1.5);
        leap.up.copy(d); leap.a.copy(d).multiplyScalar(p.waterLevelRadius(rt)).add(p.center); leap.b.copy(leap.a).addScaledVector(fw, 1.6);
        leap.t = 0;
      } else leap.t = 2;
    }
    if (leap.t <= 0 && leap.t > -0.9) {
      const k = -leap.t / 0.9; fish.visible = true;
      fish.position.lerpVectors(leap.a, leap.b, k).addScaledVector(leap.up, Math.sin(k * Math.PI) * 0.9);
      const v = leap.b.clone().sub(leap.a).addScaledVector(leap.up, Math.cos(k * Math.PI) * 1.8);
      fish.up.copy(leap.up); fish.lookAt(fish.position.clone().add(v));
      if (k > 0.97 && leap.ring > 1) { leap.ring = 0; ring.position.copy(leap.b).addScaledVector(leap.up, 0.02); orientTo(ring, leap.up); ring.rotateX(-Math.PI / 2); }
    }
    const rm = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
    rm.opacity = leap.ring < 1.2 ? 0.7 * (1 - leap.ring / 1.2) : 0; ring.scale.setScalar(1 + leap.ring * 2.5);
  });

  // ---- birds wheeling high over Kite Ridge and over the edge of the world
  const bird = () => {
    const g = new THREE.Group(), m = flat('#3a3440');
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), toon('#3a3440')).rotateX(Math.PI / 2));
    const wing = (s: number) => { const w = new THREE.Group(); const a = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), m); a.position.x = s * 0.21; a.rotation.x = -Math.PI / 2; w.add(a); g.add(w); return w; };
    g.userData.l = wing(-1); g.userData.r = wing(1); return g;
  };
  const flocks = ([[[50, 47], 7, 12], [[168, 8], 5, 16], [[30, 0], 4, 14]] as [LL, number, number][]).map(([ll, n, h]) => ({
    d: dirOf(ll), h, birds: Array.from({ length: n }, (_, i) => ({ o: add(bird()), r: 7 + rand() * 6, ph: i * 0.9 + rand(), sp: 0.22 + rand() * 0.1, dh: rand() * 3 })),
  }));
  anim((_dt, t) => flocks.forEach(fl => {
    const t1 = tangent(fl.d), t2 = new THREE.Vector3().crossVectors(fl.d, t1);
    fl.birds.forEach(b => {
      const u = t * b.sp + b.ph;
      const dd = fl.d.clone().addScaledVector(t1, Math.cos(u) * b.r / p.R).addScaledVector(t2, Math.sin(u) * b.r / p.R).normalize();
      b.o.position.copy(p.surfacePoint(dd, fl.h + b.dh + Math.sin(u * 2) * 0.8));
      orientTo(b.o, dd, t1.clone().multiplyScalar(-Math.sin(u)).addScaledVector(t2, Math.cos(u)));
      b.o.rotateZ(-0.35);
      const flap = Math.sin(u * 3) > 0.3 ? Math.sin(t * 11 + b.ph) * 0.6 : 0.12; // flap a little, then glide
      (b.o.userData.l as THREE.Object3D).rotation.z = flap; (b.o.userData.r as THREE.Object3D).rotation.z = -flap;
    });
  }));

  // ---- marmots on the West Cliffs and Kite Ridge: they sit up to look, and pop down their holes when you come near
  const marmot = () => {
    const g = new THREE.Group(), f = toon('#a07a50'), light = toon('#d8b88a');
    const hole = mesh(new THREE.CircleGeometry(0.28, 10), toon('#3a2a20'), 0, 0.02, 0); hole.rotation.x = -Math.PI / 2; hole.castShadow = false; g.add(hole);
    const mound = mesh(new THREE.TorusGeometry(0.3, 0.08, 5, 12), toon('#8a7a5a'), 0, 0.03, 0); mound.rotation.x = Math.PI / 2; g.add(mound);
    const up = new THREE.Group(); g.add(up);
    const b = mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), f, 0, 0.22, 0); up.add(b);
    up.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), light, 0, 0.2, 0.09));
    const h = mesh(new THREE.SphereGeometry(0.1, 8, 6), f, 0, 0.47, 0.02); up.add(h);
    up.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), toon('#2a2230'), 0.045, 0.5, 0.1), mesh(new THREE.SphereGeometry(0.02, 5, 4), toon('#2a2230'), -0.045, 0.5, 0.1));
    for (const x of [-0.06, 0.06]) up.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), f, x, 0.56, 0));
    ink(up); g.userData.up = up; return g;
  };
  const marmots = ([[42, -62], [44, -58], [40, -66], [52, 44], [48, 50]] as LL[]).map(ll => {
    const o = marmot(), d = spotNear(ll, 6); place(o, d, tangent(d)); add(o);
    return { o, d, k: 1, wait: 0, ph: rand() * 9 };
  });
  anim((dt, t) => marmots.forEach(m => {
    const close = distTo(m.o) < 7;
    if (close) m.wait = 4; else m.wait -= dt;
    const want = m.wait > 0 ? 0 : 1;
    m.k += (want - m.k) * Math.min(1, dt * (want ? 1.5 : 9));
    const up = m.o.userData.up as THREE.Object3D;
    up.position.y = (m.k - 1) * 0.65; up.visible = m.k > 0.05;
    up.rotation.y = Math.sin(t * 0.5 + m.ph) * 0.8;
  }));

  // ---- a straw beehive in the garden, bees drifting round it
  const hiveD = spotNear([56.6, -18.4], 3);
  const hive = new THREE.Group();
  for (let i = 0; i < 5; i++) hive.add(mesh(new THREE.TorusGeometry(0.32 - i * 0.05, 0.08, 6, 14), toon('#d8b060'), 0, 0.1 + i * 0.13, 0).rotateX(Math.PI / 2));
  hive.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), toon('#d8b060'), 0, 0.72, 0));
  hive.add(mesh(new THREE.CircleGeometry(0.06, 8), toon('#3a2a20'), 0, 0.14, 0.4));
  hive.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), toon('#8a6a4a'), 0, 0.0, 0));
  ink(hive); place(hive, hiveD, tangent(hiveD)); add(hive, true);
  const beeMat = toon('#f0c030');
  const bees = Array.from({ length: 7 }, () => { const b = mesh(new THREE.SphereGeometry(0.03, 5, 4), beeMat); b.castShadow = false; add(b); return { b, ph: rand() * 20, r: 0.5 + rand() * 1.4 }; });
  anim((_dt, t) => {
    const t1 = tangent(hiveD), t2 = new THREE.Vector3().crossVectors(hiveD, t1);
    bees.forEach(e => { const u = t * 1.8 + e.ph; const dd = hiveD.clone().addScaledVector(t1, Math.cos(u) * e.r / p.R).addScaledVector(t2, Math.sin(u * 1.3) * e.r / p.R).normalize(); e.b.position.copy(p.surfacePoint(dd, 0.5 + Math.sin(u * 2.7) * 0.25)); });
  });

  // ---- little things on the ground: mushrooms under the trees, flower clumps, pinwheels on the ridge
  const mush = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(rand() * 3); i++) {
      const s = 0.6 + rand() * 0.7, x = (rand() - 0.5) * 0.5, z = (rand() - 0.5) * 0.5;
      g.add(mesh(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.14 * s, 6), toon('#f4ecdc'), x, 0.07 * s, z));
      const cap = mesh(new THREE.SphereGeometry(0.08 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon(rand() < 0.6 ? '#d84a3a' : '#c89a5a'), x, 0.13 * s, z); g.add(cap);
      for (let k = 0; k < 3; k++) { const a = rand() * 6.28; g.add(mesh(new THREE.SphereGeometry(0.012 * s, 4, 3), toon('#fff8ee'), x + Math.cos(a) * 0.05 * s, 0.18 * s, z + Math.sin(a) * 0.05 * s)); }
    }
    ink(g, 0.012); return g;
  };
  const clump = () => {
    const g = new THREE.Group(), col = ['#f4d06a', '#f49aa8', '#b8a0f0', '#ffffff', '#f4885a'][Math.floor(rand() * 5)];
    for (let i = 0; i < 7; i++) {
      const x = (rand() - 0.5) * 0.7, z = (rand() - 0.5) * 0.7, h = 0.18 + rand() * 0.2;
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, h, 3), toon('#5a8a3a'), x, h / 2, z));
      const fl = mesh(new THREE.IcosahedronGeometry(0.045, 0), toon(col, col, 0.25), x, h, z); fl.castShadow = false; g.add(fl);
    }
    return g;
  };
  const scatterNear = (ll: LL, r: number, n: number, make: () => THREE.Object3D) => {
    for (let i = 0; i < n; i++) { const d = spotNear(ll, r); const o = make(); place(o, d, tangent(d).applyAxisAngle(d, rand() * 6.28), -0.02); add(o, true); }
  };
  scatterNear([15.6, 15.5], 7, 4, mush);      // under the old tree
  scatterNear([90, -30], 14, 5, mush);         // the woods south of the village
  scatterNear([120, 20], 14, 4, mush);
  scatterNear([55.8, -16.8], 6, 6, clump);     // the garden
  scatterNear([45, 70], 12, 10, clump);        // Cloud Meadow
  scatterNear([68.5, -33], 8, 5, clump);       // the terraces
  scatterNear([71, 9], 6, 4, clump);           // by the bridge
  scatterNear([100, 10], 12, 6, clump);
  const pinwheel = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.1, 5), toon('#8a6a4a'), 0, 0.55, 0));
    const hub = new THREE.Group(); hub.position.set(0, 1.1, 0.04); g.add(hub);
    ['#e8584a', '#f4d06a', '#7fa8d8', '#f4f0e8'].forEach((col, i) => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3), flat(col)); b.position.set(Math.cos(i * Math.PI / 2) * 0.1, Math.sin(i * Math.PI / 2) * 0.1, 0); b.rotation.z = i * Math.PI / 2; hub.add(b); });
    g.userData.hub = hub; return g;
  };
  const wheels: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) { const d = spotNear([50, 47], 9); const o = pinwheel(); place(o, d, tangent(d)); add(o, true); wheels.push(o); }
  c.refs.life = { hen: hens[0].obj, cat: cats[0].o, duck: ducks[0].o, hive, marmot: marmots[3].o, wheel: wheels[0], fly: flies[8].o };
  anim((dt, t) => wheels.forEach((w, i) => { (w.userData.hub as THREE.Object3D).rotation.z -= dt * (4 + Math.sin(t * 0.7 + i) * 3); }));
}
