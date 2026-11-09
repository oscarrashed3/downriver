import * as THREE from 'three';
import { smoothstep } from '../noise';
import { IslandShape, Stream, TAU } from './islandShape';
import { mistMaterial, rainbowMaterial, waterMaterial } from './islandMaterials';

// The water of a floating island: a stream running across the meadow in its carved channel, pouring off the lip in
// a long foaming fall that arcs out clear of the cliff, thins into spray and is lost in a cloud of mist far below,
// with a faint rainbow standing in the spray. Everything moves in the shaders; nothing here runs per frame.

/** The stream's surface: a ribbon along the channel, a little wider than the water so its edges hide in the banks. */
export function streamGeometry(sh: IslandShape, st: Stream): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], t: number[] = [], lay: number[] = [], idx: number[] = [];
  const P = st.pts, n = P.length;
  const across = 4;
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    // the ribbon stops at the lip; the fall takes over there
    const half = st.w[i] * 0.5 + 0.2;
    for (let j = 0; j <= across; j++) {
      const u = (j / across) * 2 - 1;
      const x = P[i].x + sx * u * half, z = P[i].y + sz * u * half;
      pos.push(x, st.wl[i] + 0.02, z);
      uv.push(u, st.acc[i]); t.push(i / (n - 1)); lay.push(0);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < across; j++) {
    const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface FallOut {
  geo: THREE.BufferGeometry;
  /** where the lip spray sits, and where the fall ends in mist (local) */
  lip: THREE.Vector3; foot: THREE.Vector3;
  /** points along the fall for spray puffs */
  path: THREE.Vector3[];
  width: number;
}

/**
 * The fall: water leaves the lip level and drops on a projectile curve, pushed further out wherever a ledge below
 * sticks out, so it never cuts the rock. Two sheets, a bulging front one and a flatter one behind it with its own
 * flow, give it body; it widens a little as it falls.
 */
export function fallGeometry(sh: IslandShape, st: Stream): FallOut {
  const a = st.spec.angle, L = st.spec.length, W = st.spec.width;
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const Re = sh.outline(a);
  const yTop = st.wl[st.wl.length - 1] + 0.02;
  const start = dir.clone().multiplyScalar(Re + 0.1 * sh.sc).setY(yTop);
  const v0 = 1.7 + W * 0.15;
  const n = 46;
  const C: THREE.Vector3[] = [];
  const ds: number[] = [];
  let outPrev = 0;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const d = L * (0.55 * s * s + 0.45 * s);
    let out = v0 * Math.sqrt((2 * d) / 9.8);
    // clear the wall below, across the whole width of the water
    const y = yTop - d;
    if (y < sh.Y0 + 0.5) for (const k of [-0.55, 0, 0.55]) {
      const ak = a + (k * W) / Re;
      const w = sh.wall(ak, y);
      const wr = new THREE.Vector3(w.cx + Math.cos(ak) * w.r, 0, w.cz + Math.sin(ak) * w.r).dot(dir);
      out = Math.max(out, wr - Re + 0.5 + W * 0.15);
    }
    out = Math.max(out, outPrev);
    outPrev = out;
    C.push(start.clone().addScaledVector(dir, out).setY(y));
    ds.push(d);
  }
  // smooth the clearance pushes so the curve stays a clean arc
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n; i++) {
    const o = (C[i - 1].clone().sub(start).dot(dir) + C[i + 1].clone().sub(start).dot(dir)) * 0.5;
    const cur = C[i].clone().sub(start).dot(dir);
    if (o > cur) C[i].addScaledVector(dir, o - cur);
  }
  const pos: number[] = [], uv: number[] = [], tt: number[] = [], lay: number[] = [], idx: number[] = [];
  const across = 10;
  let vert = 0;
  for (const layer of [0, 1]) {
    let arc = 0;
    const first = vert;
    for (let i = 0; i <= n; i++) {
      if (i > 0) arc += C[i].distanceTo(C[i - 1]);
      const T = C[Math.min(n, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
      const N = new THREE.Vector3().crossVectors(side, T).normalize(); // points away from the cliff
      if (N.dot(dir) < 0) N.negate();
      const s = ds[i] / L;
      const half = W * 0.5 * (1 + 0.9 * s * s + 0.25 * s) * (layer ? 0.82 : 1);
      const bulge = W * (layer ? 0.06 : 0.16) * (1 - 0.5 * s);
      const back = layer ? W * 0.18 + 0.1 : 0;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        const p = C[i].clone().addScaledVector(side, u * half).addScaledVector(N, (1 - u * u) * bulge - back);
        pos.push(p.x, p.y, p.z);
        uv.push(u, arc + layer * 13.7); tt.push(s); lay.push(layer);
        vert++;
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < across; j++) {
      const q = first + i * (across + 1) + j, b = q + 1, c = q + across + 1, d = c + 1;
      idx.push(q, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, lip: start.clone(), foot: C[n].clone(), path: C, width: W };
}

export interface Puff { p: THREE.Vector3; size: number; alpha: number }

/** Spray where the water goes over, a veil of spray along the lower fall, and a heaped mist cloud at the foot. */
export function fallPuffs(f: FallOut, rng: () => number, out: Puff[]) {
  const W = f.width, n = f.path.length;
  for (let i = 0; i < 4; i++) out.push({ p: f.lip.clone().add(new THREE.Vector3((rng() - 0.5) * W, -0.3 - rng() * 0.8, (rng() - 0.5) * W)), size: W * (0.5 + rng() * 0.4), alpha: 0.35 });
  for (let i = Math.floor(n * 0.4); i < n; i++) {
    const s = i / n;
    const p = f.path[i].clone().add(new THREE.Vector3((rng() - 0.5) * W * (1 + 2 * s), 0, (rng() - 0.5) * W * (1 + 2 * s)));
    out.push({ p, size: W * (1.0 + 3.2 * s * s) * (0.7 + rng() * 0.5), alpha: 0.14 + 0.45 * smoothstep(0.5, 1, s) });
  }
  // the mist cloud at the foot: a heap of big soft puffs, highest in the middle
  const foot = f.foot;
  const big = Math.max(6, W * 4.2);
  for (let i = 0; i < 24; i++) {
    const a = rng() * TAU, d = Math.pow(rng(), 0.7) * big * 1.1;
    const p = foot.clone().add(new THREE.Vector3(Math.cos(a) * d, (rng() - 0.6) * big * 0.5 - d * 0.25, Math.sin(a) * d));
    out.push({ p, size: big * (0.55 + rng() * 0.6) * (1 - d / (big * 2.4)), alpha: 0.7 + rng() * 0.25 });
  }
}

/** All the island's puffs in one instanced draw of camera-facing quads. */
export function puffMesh(list: Puff[], seed: number): THREE.Mesh | null {
  if (!list.length) return null;
  const N = list.length;
  const P = new Float32Array(N * 3), D = new Float32Array(N * 3);
  const box = new THREE.Box3();
  let s = seed * 17 + 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  list.forEach((q, i) => { P.set([q.p.x, q.p.y, q.p.z], i * 3); D.set([q.size, rnd(), q.alpha], i * 3); box.expandByPoint(q.p); });
  const src = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = src.index; g.setAttribute('position', src.attributes.position);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(D, 3));
  g.instanceCount = N;
  const maxSize = Math.max(...list.map(q => q.size));
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); g.boundingSphere.radius += maxSize;
  const m = new THREE.Mesh(g, mistMaterial());
  m.renderOrder = 3; m.userData.noOutline = true;
  return m;
}

/** A faint rainbow in the spray at the foot of a fall. */
export function rainbow(f: FallOut): THREE.Mesh {
  const size = Math.max(8, f.width * 6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), rainbowMaterial());
  m.position.copy(f.foot).add(new THREE.Vector3(0, -size * 0.25, 0));
  m.scale.set(size * 2, size, 1);
  m.renderOrder = 4; m.userData.noOutline = true; m.frustumCulled = false;
  return m;
}
