import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LabCtx, LabPiece } from './types';
import { makeWindfolk, Crowd, SKY_WIND, type Windfolk, type WindPose, type CrowdSpot } from '../windfolk';
import { toon } from '../../props';
import { paint, softRamp, addOutlines } from '../../../render/paint';

// Lab: the windfolk on a grassy cliff top above the cloud sea.
// Views: lineup (the five named windfolk), turnaround (Lark from four sides), lark / zephy (faces),
// crowd (60 cheering along a fence), wave (Lark's farewell, scarf streaming), glide (prone on a wing), walk.
// Query: cheer=0..1 for the crowd (default pulses), pose=cheer|wave|glide to put the lineup in one pose.

export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const people: { w: Windfolk; pose: (t: number) => WindPose; path?: (t: number, o: THREE.Object3D) => void }[] = [];
  const add = (w: Windfolk, x: number, z: number, yaw: number, pose: (t: number) => WindPose, y = 0) => {
    w.root.position.set(x, y, z); w.root.rotation.y = yaw; scene.add(w.root); people.push({ w, pose }); return w;
  };
  const linePose = params.get('pose');
  const still: (t: number) => WindPose = () => ({ speed: 0, grounded: true, cheer: linePose === 'cheer' ? 1 : 0, reach: linePose === 'wave' ? 1 : 0, glide: linePose === 'glide' ? 1 : 0 });

  // ---- the ground: a grassy island top with cream cliffs, flowers, and the cloud sea below
  buildGround(scene);

  // ---- the lineup
  const kinds = ['lark', 'zephy', 'wren', 'mender', 'chimer'] as const;
  const xs = [-3.0, -1.55, 0.0, 1.6, 3.2];
  const cast = kinds.map((k, i) => add(makeWindfolk(k), xs[i], 0, 0.28, still));
  void cast;

  // ---- Lark turnaround
  for (let i = 0; i < 4; i++) add(makeWindfolk('lark'), 12 + i * 2.2, 0, (i * Math.PI) / 2, () => ({ speed: 0, grounded: true }));

  // ---- the crowd along a fence on a stepped terrace, and a few full-detail windfolk in front
  const spots: CrowdSpot[] = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 20; i++) {
    const x = -31 + i * 0.85 + (row % 2) * 0.42 + (Math.sin(i * 12.9 + row * 3.1) * 0.12);
    spots.push({ pos: new THREE.Vector3(x, row * 0.4, -3.2 - row * 0.9 + Math.sin(i * 7.7 + row) * 0.1), facing: 0.15 * Math.sin(i * 1.7 + row) });
  }
  const crowd = new Crowd(spots, 7);
  scene.add(crowd.root);
  buildTerrace(scene);
  const cheerQ = params.get('cheer');
  const cheerAt = (t: number) => cheerQ !== null ? Number(cheerQ) : (Math.sin(t * 0.5) > -0.6 ? 1 : 0);
  for (let i = 0; i < 3; i++) add(makeWindfolk('crowd', 3 + i), -25 + i * 2.6, -1.0, 0.1 - i * 0.1, (t) => ({ speed: 0, grounded: true, cheer: cheerAt(t) * (i === 1 ? 0 : 1), reach: i === 1 ? cheerAt(t) : 0, smile: 1 }));

  // ---- Lark's farewell wave at the cliff edge
  const larkW = add(makeWindfolk('lark'), 1.5, 0, -0.55, () => ({ speed: 0, grounded: true, reach: 1, reachSide: -1, smile: 1 }), 0);
  larkW.root.position.set(1.5, 0, 37.2);
  buildFence(scene, [[-6, 38.4], [6, 38.4]]);

  // ---- gliding racers (the wing is a stand-in; the real one is the kites piece)
  const fwd = new THREE.Vector3();
  for (const [kind, x, y, z, b] of [['zephy', 26, 5.5, 14, 0.15], ['lark', 29, 6.6, 11.5, -0.1]] as const) {
    const w = makeWindfolk(kind);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 2 + 0.3; scene.add(g);
    g.add(w.root); g.add(standInWing(kind === 'zephy' ? '#e2643a' : '#f2c040'));
    g.rotation.z = -b * 0.6;
    const air = new THREE.Vector3();
    people.push({ w, pose: (t) => { fwd.set(0, 0, 1).applyQuaternion(g.quaternion); air.copy(SKY_WIND).addScaledVector(fwd, -11); air.y += 3.5; /* riding a thermal lifts the scarf off the back */ g.position.y = y + Math.sin(t * 0.8 + x) * 0.15; return { speed: 0, grounded: true, glide: 1, bank: b, air, smile: 1 }; } });
  }

  // ---- a walker
  const walker = makeWindfolk('zephy');
  scene.add(walker.root);
  people.push({
    w: walker, pose: () => ({ speed: 1.6, grounded: true, smile: 1 }),
    path: (t, o) => { const a = t * 0.42; o.position.set(14 + Math.cos(a) * 2.2, 0, -8 + Math.sin(a) * 2.2); o.rotation.y = -a; },
  });

  // stats for the notes
  let tris = 0, calls = 0;
  cast[0].root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { calls++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  console.log(`[windfolk] lark: ${calls} meshes (incl. ink), ${Math.round(tris)} triangles; crowd: ${spots.length} people, ${crowd.triangles} triangles, 2 draw calls`);
  for (const k of kinds) { let t2 = 0, c2 = 0; people.find(p => p.w.kind === k)!.w.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !o.userData.isOutline) { c2++; const g = m.geometry; t2 += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); console.log(`[windfolk] ${k}: ${c2} meshes, ${Math.round(t2)} tris (x2 with ink)`); }

  return {
    update(dt, t) {
      for (const p of people) {
        if (p.path) p.path(t, p.w.root);
        p.w.animate(dt, p.pose(t));
      }
      crowd.update(dt, t, cheerAt(t));
    },
    views: {
      lineup: { pos: [2.6, 1.3, 5.6], look: [0.1, 0.92, 0], fov: 40 },
      turnaround: { pos: [15.3, 0.95, 5.8], look: [15.3, 0.72, 0], fov: 40 },
      lark: { pos: [-2.55, 1.2, 1.15], look: [-3.0, 1.12, 0], fov: 30 },
      zephy: { pos: [-1.1, 1.24, 1.15], look: [-1.55, 1.16, 0], fov: 30 },
      crowd: { pos: [-17.5, 2.2, 6.5], look: [-24, 1.1, -3], fov: 45 },
      wave: { pos: [3.4, 1.45, 34.3], look: [0.6, 1.2, 38.6], fov: 45 },
      glide: { pos: [24.5, 7.4, 20.5], look: [27.5, 5.8, 12.5], fov: 40 },
      walk: { pos: [14, 1.4, -2.0], look: [14, 0.7, -8], fov: 42 },
    },
  };
}

// ---------------------------------------------------------------- scenery for the lab

function buildGround(scene: THREE.Scene) {
  const R = 42;
  // grass top with a gentle roll
  const top = new THREE.CircleGeometry(R, 96, 0, Math.PI * 2); top.rotateX(-Math.PI / 2);
  const tp = top.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), d = Math.hypot(x, z); tp.setY(i, (Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.25) * Math.min(1, (R - d) / 6) - 0.02); }
  top.computeVertexNormals();
  const grass = new THREE.Mesh(top, toon('#93cc5c')); grass.receiveShadow = true; scene.add(grass);
  // cream and pale-gold cliffs falling to the clouds
  const cliff = new THREE.CylinderGeometry(R, R * 0.55, 34, 72, 10, true);
  const cp = cliff.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(x, z);
    const k = 1 + 0.05 * Math.sin(a * 9 + y * 0.3) + 0.03 * Math.sin(a * 23 - y * 0.6) - (y < 16.9 ? 0.02 * Math.sin(y * 1.3 + a * 5) : 0);
    cp.setXYZ(i, x * k, y - 17.05, z * k);
  }
  cliff.computeVertexNormals();
  const rock = new THREE.Mesh(cliff, toon('#ead7ac')); rock.receiveShadow = true; scene.add(rock);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.35, 5, 96), toon('#7fbf55')); lip.rotation.x = Math.PI / 2; lip.position.y = -0.15; scene.add(lip);
  // flowers and grass tufts, instanced
  const rnd = mulberryL(3);
  const flowerCols = ['#f4a6c0', '#b9a3e3', '#f6d84a', '#ffffff', '#f08a9a'];
  const fg = new THREE.IcosahedronGeometry(0.06, 0);
  for (const c of flowerCols) {
    const n = 220, im = new THREE.InstancedMesh(fg, toon(c), n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = 6 + Math.sqrt(rnd()) * 35;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (x < -12 && x > -33 && z < 0 && z > -7) { i--; continue; }
      m.makeScale(1, 0.7, 1).setPosition(x, 0.1, z); im.setMatrixAt(i, m);
    }
    scene.add(im);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  // the cloud sea: soft white heaps below the island
  const cloudMat = paint(new THREE.MeshToonMaterial({ color: '#fbf6ee', gradientMap: softRamp(), emissive: '#aebbd6', emissiveIntensity: 0.55 }), { noCloud: true, variation: 0.3 });
  const cg = new THREE.IcosahedronGeometry(1, 2);
  const clouds = new THREE.InstancedMesh(cg, cloudMat, 220);
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2, d = 40 + rnd() * 240, s = 8 + rnd() * 18;
    m.compose(new THREE.Vector3(Math.sin(a) * d, -22 - rnd() * 8 + s * 0.3, Math.cos(a) * d), q.identity(), new THREE.Vector3(s * 1.4, s * 0.7, s * 1.4));
    clouds.setMatrixAt(i, m);
  }
  scene.add(clouds);
}

/** A stepped stone terrace with a fence in front, where the crowd stands. */
function buildTerrace(scene: THREE.Scene) {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++) {
    if (row === 0) continue;
    const g = new THREE.BoxGeometry(18.4, row * 0.4, 0.9); g.translate(-22.4, row * 0.2, -3.2 - row * 0.9); parts.push(g);
  }
  const back = new THREE.BoxGeometry(18.4, 0.8, 1.2); back.translate(-22.4, 0.4, -6.4); parts.push(back);
  const m = new THREE.Mesh(mergeGeometries(parts)!, toon('#e6d3a8')); m.castShadow = true; m.receiveShadow = true;
  addOutlines(m, '#3a2a2e', 0.02);
  scene.add(m);
  buildFence(scene, [[-31.8, -2.2], [-13, -2.2]]);
}

/** A rustic wooden fence along a line. */
function buildFence(scene: THREE.Scene, pts: [number, number][]) {
  const parts: THREE.BufferGeometry[] = [];
  const [a, b] = pts; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.ceil(L / 2.2);
  const yaw = Math.atan2(dx, dz);
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = a[0] + dx * k, z = a[1] + dz * k;
    const p = new THREE.BoxGeometry(0.13, 1.15, 0.13); p.rotateY(Math.sin(i * 3.3) * 0.2); p.rotateZ(Math.sin(i * 5.1) * 0.04); p.translate(x, 0.55, z); parts.push(p);
    const cap = new THREE.ConeGeometry(0.1, 0.1, 4); cap.translate(x, 1.17, z); parts.push(cap);
  }
  for (const y of [0.45, 0.9]) {
    const r = new THREE.BoxGeometry(0.08, 0.1, L); r.rotateX(Math.sin(y * 9) * 0.01); r.rotateY(yaw); r.translate(a[0] + dx / 2, y, a[1] + dz / 2); parts.push(r);
  }
  const m = new THREE.Mesh(mergeGeometries(parts.map(g => g.toNonIndexed()))!, toon('#9a7048')); m.castShadow = true;
  addOutlines(m, '#3a2a2e', 0.015);
  scene.add(m);
}

/** A simple kite-wing so the glide pose reads (the kites piece builds the real one). */
function standInWing(color: string) {
  const g = new THREE.Group();
  const shape = new THREE.BufferGeometry();
  // a broad diamond, flat under the rider: nose ahead (+z), wide span, tail behind
  const v = [0, 0, 1.3, -2.6, 0.12, -0.3, 0, 0, -1.5, 0, 0, 1.3, 0, 0, -1.5, 2.6, 0.12, -0.3];
  shape.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); shape.computeVertexNormals();
  const mat = toon(color).clone(); mat.side = THREE.DoubleSide; mat.onBeforeCompile = toon(color).onBeforeCompile; mat.customProgramCacheKey = toon(color).customProgramCacheKey;
  const wing = new THREE.Mesh(shape, mat); wing.position.y = -0.2; wing.castShadow = true; g.add(wing);
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.8, 6), toon('#8a6440')); spar.rotation.x = Math.PI / 2; spar.position.set(0, -0.15, -0.1); g.add(spar);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), toon('#8a6440')); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.0, 0.85); g.add(bar);
  addOutlines(g, '#3a2a2e', 0.015);
  return g;
}

function mulberryL(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
