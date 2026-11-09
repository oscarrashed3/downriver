import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LabCtx, LabPiece } from './types';
import { makeWindfolk, Crowd, SKY_WIND, type Windfolk, type WindPose, type CrowdSpot } from '../windfolk';
import { mulberry, wob } from '../windRig';
import { Person } from '../../../player/person';
import { toon } from '../../props';
import { paint, softRamp } from '../../../render/paint';

// Lab: the windfolk on a sky-isle cliff top, a fence along the edge and the cloud sea below.
// Views: lineup (the five named windfolk), turnaround (Lark from four sides), lark / zephy (faces),
// crowd (cheering on stepped terraces behind the fence), wave (Lark's farewell, scarf streaming, picture 4),
// glide (prone under kite-wings), walk.
// Query: cheer=0..1 for the crowd (default pulses), pose=cheer|wave|glide to put the lineup in one pose.

/** The island's edge: a big round cliff top centred far behind the lineup; z of the edge at x. */
const IC = new THREE.Vector3(0, 0, 74), IR = 80;
const edgeZ = (x: number) => IC.z - Math.sqrt(IR * IR - x * x);

export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const people: { w: Windfolk; pose: (t: number) => WindPose; path?: (t: number, o: THREE.Object3D) => void }[] = [];
  const add = (w: Windfolk, x: number, z: number, yaw: number, pose: (t: number) => WindPose, y = 0) => {
    w.root.position.set(x, y, z); w.root.rotation.y = yaw; scene.add(w.root); people.push({ w, pose }); return w;
  };
  const linePose = params.get('pose');
  const still: (t: number) => WindPose = () => ({ speed: 0, grounded: true, cheer: linePose === 'cheer' ? 1 : 0, reach: linePose === 'wave' ? 1 : 0, glide: linePose === 'glide' ? 1 : 0 });

  buildIsland(scene);

  // ---- the lineup, backs to the cliff edge
  const kinds = ['lark', 'zephy', 'wren', 'mender', 'chimer'] as const;
  const xs = [-2.5, -1.25, 0.0, 1.35, 2.75];
  const cast = kinds.map((k, i) => add(makeWindfolk(k), xs[i], 0, 0.3 - i * 0.05, still));

  // ---- Lark turnaround
  for (let i = 0; i < 4; i++) add(makeWindfolk('lark'), 30 + i * 1.6, 2, (i * Math.PI) / 2, () => ({ speed: 0, grounded: true }));

  // ---- the crowd on stepped terraces behind a fence at the edge, facing out over the clouds
  const spots: CrowdSpot[] = [];
  const cx0 = -26;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 17; i++) {
    const x = cx0 - 7.2 + i * 0.86 + (row % 2) * 0.43 + Math.sin(i * 12.9 + row * 3.1) * 0.1;
    const ez = edgeZ(x);
    spots.push({ pos: new THREE.Vector3(x, row * 0.42, ez + 1.6 + row * 0.85 + Math.sin(i * 7.7 + row) * 0.08), facing: Math.PI + 0.12 * Math.sin(i * 1.7 + row) });
  }
  const crowd = new Crowd(spots, 7);
  scene.add(crowd.root);
  buildTerraces(scene, cx0, 15.5);
  const cheerQ = params.get('cheer');
  const cheerAt = (t: number) => cheerQ !== null ? Number(cheerQ) : (Math.sin(t * 0.5) > -0.6 ? 1 : 0);
  // a few full-detail crowd windfolk in the front row, behind the fence
  for (let i = 0; i < 3; i++) { const x = cx0 - 2.6 + i * 2.2; add(makeWindfolk('crowd', 3 + i), x, edgeZ(x) + 0.95, Math.PI + 0.1 - i * 0.1, (t) => ({ speed: 0, grounded: true, cheer: cheerAt(t) * (i === 1 ? 0 : 1), reach: i === 1 ? cheerAt(t) : 0, smile: 1 })); }

  // ---- Lark's farewell wave at the fence on the cliff edge
  const wx = 14;
  add(makeWindfolk('lark'), wx, edgeZ(wx) + 0.75, Math.PI - 0.35, () => ({ speed: 0, grounded: true, reach: 1, reachSide: -1, smile: 1 }));

  // ---- gliding racers under stand-in kite-wings (the kites piece builds the real ones)
  const fwd = new THREE.Vector3();
  for (const [kind, x, y, z, b] of [['zephy', 6, 1.6, -16, 0.12], ['lark', 9.5, 2.5, -19, -0.08]] as const) {
    const w = makeWindfolk(kind);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 2 + 0.15; scene.add(g);
    g.add(w.root);
    const wing = standInWing(kind === 'zephy' ? ['#e2643a', '#f2c040', '#f4ead8'] : ['#f2c040', '#8ac060', '#f4ead8']);
    g.add(wing);
    g.rotation.z = -b * 0.6;
    const air = new THREE.Vector3();
    people.push({ w, pose: (t) => { fwd.set(0, 0, 1).applyQuaternion(g.quaternion); air.copy(SKY_WIND).multiplyScalar(0.4).addScaledVector(fwd, -12); air.y += 1.5; g.position.y = y + Math.sin(t * 0.8 + x) * 0.15; return { speed: 0, grounded: true, glide: 1, bank: b, air, smile: 1 }; } });
  }

  // ---- walkers
  for (const [kind, cx, ph] of [['zephy', -9, 0], ['lark', -9, Math.PI]] as const) {
    const walker = makeWindfolk(kind);
    scene.add(walker.root);
    people.push({
      w: walker, pose: () => ({ speed: 1.6, grounded: true, smile: 1 }),
      path: (t, o) => { const a = t * 0.42 + ph; o.position.set(cx + Math.cos(a) * 2.2, 0, 5 + Math.sin(a) * 2.2); o.rotation.y = -a; },
    });
  }

  // ---- stats for the notes, and a World 1 villager for comparison
  const count = (root: THREE.Object3D) => {
    let calls = 0, tris = 0;
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry.attributes.position) return;
      const g = m.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const groups = Array.isArray(m.material) ? g.groups.length : 1;
      calls += groups; if (!o.userData.isOutline) tris += n;
    });
    return { calls, tris: Math.round(tris) };
  };
  for (const k of kinds) { const p = people.find(q => q.w.kind === k)!.w; const c = count(p.root); console.log(`[windfolk] ${k}: ${c.calls} draw calls (with ink), ${c.tris} triangles, ${p.stats.bones} bones`); }
  const v1 = new Person({ villager: 'tor', skin: '#e8b890', hair: '#4a3020', hairStyle: 'messy', top: '#c8a070', trousers: '#5a4a3a', boots: '#4a3020' });
  const vc = count(v1.root); console.log(`[windfolk] World 1 villager (Tor): ${vc.calls} draw calls (with ink), ${vc.tris} triangles`);
  console.log(`[windfolk] crowd: ${spots.length} people, ${crowd.triangles} triangles, 2 draw calls`);

  return {
    update(dt, t) {
      for (const p of people) {
        if (p.path) p.path(t, p.w.root);
        p.w.animate(dt, p.pose(t));
      }
      crowd.update(dt, t, cheerAt(t));
    },
    views: {
      lineup: { pos: [1.7, 1.15, 5.6], look: [0.15, 0.82, 0], fov: 38 },
      turnaround: { pos: [32.4, 0.9, 7.6], look: [32.4, 0.68, 2], fov: 36 },
      lark: { pos: [-2.33, 1.1, 0.95], look: [-2.5, 1.06, 0], fov: 26 },
      zephy: { pos: [-1.05, 1.13, 0.95], look: [-1.25, 1.09, 0], fov: 26 },
      crowd: { pos: [cx0 + 6.5, 2.4, edgeZ(cx0) - 5.5], look: [cx0 - 2, 1.2, edgeZ(cx0) + 2], fov: 44 },
      wave: { pos: [wx - 2.2, 1.45, edgeZ(wx) + 4.2], look: [wx + 0.3, 0.95, edgeZ(wx) - 0.8], fov: 40 },
      glide: { pos: [8.5, 2.6, -13.2], look: [7.6, 2.0, -17.5], fov: 40 },
      walk: { pos: [-9, 1.3, 10.4], look: [-9, 0.75, 5], fov: 40 },
    },
  };
}

// ---------------------------------------------------------------- scenery for the lab

function buildIsland(scene: THREE.Scene) {
  const rnd = mulberry(3);
  // the grass top: painted patches of spring green and warm yellow-green, darker towards the rim
  const top = new THREE.CircleGeometry(IR, 160, 0, Math.PI * 2); top.rotateX(-Math.PI / 2);
  const tp = top.attributes.position as THREE.BufferAttribute;
  // CircleGeometry has only a centre and a rim: rebuild it as rings so the colours can vary
  const rings = 40, segs = 160, pos: number[] = [], col: number[] = [], idx: number[] = [];
  void tp; top.dispose();
  const gA = new THREE.Color('#8cc466'), gB = new THREE.Color('#b8d878'), gC = new THREE.Color('#6fae58'), cc = new THREE.Color();
  for (let r = 0; r <= rings; r++) for (let s = 0; s < segs; s++) {
    const rr = IR * Math.pow(r / rings, 0.6), a = (s / segs) * Math.PI * 2;
    const x = IC.x + Math.sin(a) * rr, z = IC.z + Math.cos(a) * rr;
    const y = 0.25 * Math.sin(x * 0.13) * Math.cos(z * 0.11) * Math.min(1, (IR - rr) / 8) - 0.02;
    pos.push(x, y, z);
    const n = 0.5 + 0.5 * wob(x * 0.35 + z * 0.12, 1) * wob(z * 0.3 - x * 0.1, 2);
    cc.copy(gA).lerp(gB, Math.max(0, n - 0.25)).lerp(gC, Math.max(0, (rr - IR + 3) / 3) * 0.7);
    col.push(cc.r, cc.g, cc.b);
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * segs + s, b = r * segs + (s + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const grassMat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.9 });
  const grass = new THREE.Mesh(g, grassMat); grass.receiveShadow = true; scene.add(grass);
  // cream and pale-gold cliffs falling to the clouds, ribbed and stepped
  const cliff = new THREE.CylinderGeometry(IR, IR * 0.7, 40, 200, 16, true);
  const cp = cliff.attributes.position as THREE.BufferAttribute;
  const cliffCol: number[] = [];
  const rA = new THREE.Color('#efdcb2'), rB = new THREE.Color('#d8bf8c'), rC = new THREE.Color('#c4a678');
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(x, z);
    const k = 1 + 0.012 * Math.sin(a * 60 + y * 0.2) + 0.008 * Math.sin(a * 151 - y * 0.5) + (y < 19.9 ? 0.006 * Math.sin(y * 1.7 + a * 30) : 0);
    cp.setXYZ(i, IC.x + x * k, y - 20.1, IC.z + z * k);
    const v = 0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(a * 40) * 2);
    cc.copy(rA).lerp(rB, v * 0.6).lerp(rC, Math.max(0, -y / 40) * 0.6 + (Math.sin(a * 90) > 0.6 ? 0.25 : 0));
    cliffCol.push(cc.r, cc.g, cc.b);
  }
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(cliffCol, 3));
  cliff.computeVertexNormals();
  const rock = new THREE.Mesh(cliff, paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.8 }));
  rock.receiveShadow = true; scene.add(rock);
  // a lip of grass and moss hanging over the rim
  const lip = new THREE.TorusGeometry(IR - 0.12, 0.14, 4, 260); lip.scale(1, 1, 0.7); lip.rotateX(Math.PI / 2); lip.translate(IC.x, -0.1, IC.z);
  scene.add(new THREE.Mesh(lip, toon('#78b45a')));
  // flowers: little five-petal heads in pink, lavender, yellow and white, in drifts near the edge
  const petal = new THREE.CircleGeometry(0.06, 5); petal.rotateX(-Math.PI / 2);
  const flowerCols = ['#f4a6c0', '#c3aee8', '#f6d84a', '#fbf6ee', '#f08a9a'];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  // low rounded bushes along the edge carry the flowers
  const bushes: [number, number, number, number][] = [];
  const bushParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const x = -46 + rnd() * 92; if (Math.abs(x - 14) < 2.5 || Math.abs(x + 26) < 14 && rnd() < 0.7) continue;
    const z = edgeZ(x) + 0.25 + Math.pow(rnd(), 1.6) * 9, r = 0.28 + rnd() * 0.35;
    bushes.push([x, z, 0, r]);
    const bg = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); bg.scale(r, r * 0.55, r); bg.translate(x, 0, z);
    bushParts.push(bg);
  }
  const bush = new THREE.Mesh(mergeGeometries(bushParts)!, toon('#5f9a48')); bush.receiveShadow = true; scene.add(bush);
  for (const c of flowerCols) {
    const n = 150, im = new THREE.InstancedMesh(petal, toon(c), n);
    for (let i = 0; i < n; i++) {
      const b = bushes[Math.floor(rnd() * bushes.length)];
      const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * b[3] * 0.95;
      const x = b[0] + Math.cos(a) * rr, z = b[1] + Math.sin(a) * rr;
      const h = b[2] + b[3] * 0.55 * Math.sqrt(Math.max(0, 1 - (rr / b[3]) ** 2));
      e.set((rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6); q.setFromEuler(e);
      const s = 0.6 + rnd() * 0.5;
      m.compose(new THREE.Vector3(x, h + 0.01, z), q, new THREE.Vector3(s, 1, s)); im.setMatrixAt(i, m);
    }
    scene.add(im);
  }
  // the fence along the edge
  buildFence(scene, -44, 44);
  // the cloud sea: heaped cumulus lit warm from above, soft blue-grey underneath
  const cloudMat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), emissive: '#9fb0d0', emissiveIntensity: 0.42 }), { noCloud: true, variation: 0.25, rim: 1.4 });
  const parts: THREE.BufferGeometry[] = [];
  const top2 = new THREE.Color('#fffaf0'), under = new THREE.Color('#c8d2e8');
  for (let i = 0; i < 170; i++) {
    const x = -300 + rnd() * 600, z = -40 - Math.pow(rnd(), 0.8) * 340;
    
    const S = 7 + rnd() * 12, y0 = -46 + rnd() * 6 - Math.max(0, (-z - 40) * 0.03);
    const lobes = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < lobes; j++) {
      const s = S * (0.55 + rnd() * 0.5) * (j === 0 ? 1.2 : 1);
      const b = new THREE.SphereGeometry(1, 18, 12);
      const bp = b.attributes.position as THREE.BufferAttribute, bc: number[] = [];
      for (let v = 0; v < bp.count; v++) {
        let vy = bp.getY(v); if (vy < -0.2) vy = -0.2 + (vy + 0.2) * 0.25; // flat-bottomed
        const k = 1 + 0.08 * Math.sin(bp.getX(v) * 5 + j) * Math.sin(bp.getZ(v) * 4);
        bp.setXYZ(v, bp.getX(v) * k, vy * k, bp.getZ(v) * k);
        cc.copy(under).lerp(top2, Math.min(1, Math.max(0, (vy + 0.3) / 1.1))); bc.push(cc.r, cc.g, cc.b);
      }
      b.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      b.scale(s * 1.25, s * 0.78, s * 1.1);
      b.translate(x + (rnd() - 0.5) * S * 2.2, y0 + s * 0.25 + (j === 0 ? S * 0.2 : 0), z + (rnd() - 0.5) * S * 1.4);
      b.computeVertexNormals();
      parts.push(b);
    }
  }
  const cloudG = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
  scene.add(new THREE.Mesh(cloudG, cloudMat));
  // far isles floating in the haze
  for (const [x, y, z, s] of [[-140, 6, -260, 1.4], [90, 14, -320, 1.0], [210, -2, -200, 0.8], [-40, 22, -420, 1.6]] as [number, number, number, number][]) {
    const isle = new THREE.Group(); isle.position.set(x, y, z); isle.scale.setScalar(s);
    const rk = new THREE.ConeGeometry(22, 34, 14, 4); rk.rotateX(Math.PI); rk.translate(0, -17, 0);
    isle.add(new THREE.Mesh(rk, toon('#e2cfa4')));
    const tp2 = new THREE.SphereGeometry(23, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2); tp2.scale(1, 0.25, 1);
    isle.add(new THREE.Mesh(tp2, toon('#86bd62')));
    scene.add(isle);
  }
}

/** Stepped stone terraces behind the fence where the crowd stands, along the edge around x = cx. */
function buildTerraces(scene: THREE.Scene, cx: number, len: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 1; row < 4; row++) {
    for (let i = 0; i < 8; i++) {
      const x = cx - len / 2 + (i + 0.5) * (len / 8), ez = edgeZ(x);
      const b = new THREE.BoxGeometry(len / 8 + 0.02, row * 0.42, 0.86 + (row === 3 ? 1.5 : 0));
      b.translate(x, row * 0.21, ez + 1.6 + row * 0.85 + (row === 3 ? 0.75 : 0) - 0.1);
      parts.push(b.toNonIndexed());
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, toon('#e6d3a8')); m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}

/** A rustic wooden fence just inside the edge. */
function buildFence(scene: THREE.Scene, x0: number, x1: number) {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry(9);
  for (let x = x0; x <= x1; x += 2.0) {
    const z = edgeZ(x) + 0.45;
    const p = new THREE.CylinderGeometry(0.05, 0.06, 0.88, 6); p.rotateZ((rnd() - 0.5) * 0.06); p.translate(x, 0.43, z); parts.push(p.toNonIndexed());
    const xn = x + 2.0, zn = edgeZ(xn) + 0.45;
    if (xn <= x1 + 0.01) for (const y of [0.4, 0.74]) {
      const L = Math.hypot(2.0, zn - z);
      const r = new THREE.CylinderGeometry(0.03, 0.03, L, 5); r.rotateZ(Math.PI / 2); r.rotateY(-Math.atan2(zn - z, 2.0)); r.translate(x + 1.0, y + (rnd() - 0.5) * 0.04, (z + zn) / 2); parts.push(r.toNonIndexed());
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, toon('#9a7048')); m.castShadow = true;
  scene.add(m);
}

/** A simple kite-wing so the glide pose reads (the kites piece builds the real one): sail above, keel, bar below. */
function standInWing(cols: [string, string, string]) {
  const g = new THREE.Group();
  // a broad swept sail in coloured panels, nose ahead (+z), above the rider's back
  const pos: number[] = [], col: number[] = [];
  const nose = [0, 0.55, 1.5], tail = [0, 0.5, -0.9], L = [-2.4, 0.62, -0.5], R = [2.4, 0.62, -0.5];
  const tris = [[nose, L, [0, 0.62, 0.2]], [nose, [0, 0.62, 0.2], R], [[0, 0.62, 0.2], L, tail], [[0, 0.62, 0.2], tail, R]];
  tris.forEach((t, i) => { for (const v of t) { pos.push(...v); const c = new THREE.Color(cols[i % 2 === 0 ? (i < 2 ? 0 : 1) : (i < 2 ? 1 : 0)]); col.push(c.r, c.g, c.b); } });
  const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sail.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sail.computeVertexNormals();
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.3 });
  const wing = new THREE.Mesh(sail, mat); wing.castShadow = true; g.add(wing);
  const wood = toon('#8a6440');
  const spar = (a: number[], b: number[]) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, A.distanceTo(B), 5), wood); c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); g.add(c); };
  spar(nose, tail); spar(L, R);
  // the control frame hanging from the keel: two struts down to a bar in front of the rider's hands
  spar([0, 0.56, 0.9], [-0.32, -0.02, 0.85]); spar([0, 0.56, 0.9], [0.32, -0.02, 0.85]); spar([-0.34, -0.02, 0.85], [0.34, -0.02, 0.85]);
  spar([0, 0.53, -0.2], [0, 0.12, -0.2]); // the hang strap to the harness
  return g;
}
