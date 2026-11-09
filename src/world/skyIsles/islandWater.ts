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
  // the ribbon stops at the lip; the fall takes over there
  const Re = sh.outline(st.spec.angle);
  let last = n;
  for (let i = 0; i < n; i++) if (P[i].length() > Re + 0.05) { last = i + 1; break; }
  for (let i = 0; i < last; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    const half = st.w[i] * 0.5 + 0.2;
    for (let j = 0; j <= across; j++) {
      const u = (j / across) * 2 - 1;
      const x = P[i].x + sx * u * half, z = P[i].y + sz * u * half;
      pos.push(x, st.wl[i] + 0.02, z);
      uv.push(u, st.acc[i]); t.push(i / (n - 1)); lay.push(0);
    }
  }
  for (let i = 0; i < last - 1; i++) for (let j = 0; j < across; j++) {
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
  /** points along the fall's centre line, for spray puffs */
  path: THREE.Vector3[];
  /** the fall's width at each path point */
  widths: number[];
  /** the direction out from the cliff, and across the fall */
  dir: THREE.Vector3; side: THREE.Vector3;
  width: number;
}

/**
 * The fall: a wide curtain of white water. It rolls over the lip with a little forward speed, then drops nearly
 * straight down (pushed out only where a ledge below sticks out, so it never cuts the rock), widening as it falls.
 * It is made of two or three strands side by side, overlapping, each a ribbon with its own pace and its own slight
 * depth, so the curtain breaks into ropes with gaps of air between them lower down; the curtain curves with the lip.
 * White water and a row of foam puffs (fallPuffs) churn at the lip.
 */
export function fallGeometry(sh: IslandShape, st: Stream): FallOut {
  const a = st.spec.angle, L = st.spec.length, W = st.spec.width;
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const Re = sh.outline(a);
  const yTop = st.wl[st.wl.length - 1] + 0.02;
  const start = dir.clone().multiplyScalar(Re + 0.15 * sh.sc).setY(yTop);
  const n = 44;
  const C: THREE.Vector3[] = [], ds: number[] = [], widths: number[] = [];
  let outPrev = 0;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const d = L * (0.6 * s * s + 0.4 * s);
    // over the lip it curls forward for a metre or two, then falls almost plumb
    let out = (0.35 + 0.08 * W) * Math.min(1, Math.sqrt(d / 1.5)) + 0.012 * d;
    const y = yTop - d;
    // clear the wall below across the whole width
    if (y < sh.lipBottom(a) + 0.5 && y > -sh.cliffDepth - sh.underDepth) for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const ak = a + (k * W) / Re;
      const w = sh.wall(ak, y);
      const wr = new THREE.Vector3(w.cx + Math.cos(ak) * w.r, 0, w.cz + Math.sin(ak) * w.r).dot(dir);
      out = Math.max(out, wr - Re + 0.6 + W * 0.06);
    }
    out = Math.max(out, outPrev);
    outPrev = out;
    C.push(start.clone().addScaledVector(dir, out).setY(y));
    ds.push(d);
    widths.push(W * (0.85 + 0.55 * s + 0.3 * s * s));
  }
  // smooth the clearance pushes so the curve stays clean
  for (let pass = 0; pass < 4; pass++) for (let i = 1; i < n; i++) {
    const o = (C[i - 1].clone().sub(start).dot(dir) + C[i + 1].clone().sub(start).dot(dir)) * 0.5;
    const cur = C[i].clone().sub(start).dot(dir);
    if (o > cur) C[i].addScaledVector(dir, o - cur);
  }
  const pos: number[] = [], uv: number[] = [], tt: number[] = [], lay: number[] = [], idx: number[] = [];
  const across = 8;
  // strands: [centre across the fall (-1..1), half-width share, depth offset]
  const rng = makeRngLocal(Math.round(a * 1000) + 7);
  const strands: [number, number, number][] = W > 2.2
    ? [[-0.5 + (rng() - 0.5) * 0.1, 0.36, 0.0], [0.08 + (rng() - 0.5) * 0.1, 0.34, 0.22], [0.55 + (rng() - 0.5) * 0.1, 0.3, 0.08]]
    : [[-0.35, 0.45, 0.0], [0.4, 0.42, 0.15]];
  let vert = 0;
  strands.forEach(([cU, hU, dep], layer) => {
    let arc = 0;
    const first = vert;
    for (let i = 0; i <= n; i++) {
      if (i > 0) arc += C[i].distanceTo(C[i - 1]);
      const T = C[Math.min(n, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
      const N = new THREE.Vector3().crossVectors(side, T).normalize();
      if (N.dot(dir) < 0) N.negate();
      const s = ds[i] / L;
      const Wi = widths[i] * 0.5;
      // strands drift apart a little as they fall
      const cc = cU * Wi * (1 + 0.15 * s), half = hU * Wi * (1.25 + 0.35 * s);
      const sway = Math.sin(s * 5 + layer * 2.1) * 0.08 * W * s;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        // the curtain wraps round the curve of the lip: its edges sit back toward the cliff
        const U = (cc + u * half) / Wi;
        const p = C[i].clone().addScaledVector(side, cc + sway + u * half)
          .addScaledVector(N, (1 - u * u) * W * 0.05 + dep * (0.3 + W * 0.05) - U * U * W * 0.12);
        pos.push(p.x, p.y, p.z);
        uv.push(u, arc + layer * 17.3); tt.push(s); lay.push(layer);
        vert++;
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < across; j++) {
      const q = first + i * (across + 1) + j, b = q + 1, c = q + across + 1, d = c + 1;
      idx.push(q, c, b, b, c, d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, lip: start.clone(), foot: C[n].clone(), path: C, widths, dir, side, width: W };
}

function makeRngLocal(seed: number) {
  let s = (Math.abs(seed) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export interface Puff { p: THREE.Vector3; size: number; alpha: number }

/**
 * Spray where the water goes over; a veil of spray thickening down the lower 40% of the fall, on both sides and in
 * front, so the water visibly dissolves; and a heaped mist cloud at the foot.
 */
export function fallPuffs(f: FallOut, rng: () => number, out: Puff[]) {
  const W = f.width, n = f.path.length;
  // a row of foam puffs along the lip
  for (let i = 0; i < 7; i++) {
    const u = (i / 6 - 0.5) * f.widths[0] * 0.85;
    out.push({ p: f.lip.clone().addScaledVector(f.side, u).addScaledVector(f.dir, 0.5).add(new THREE.Vector3(0, -0.5 - rng() * 0.6, 0)), size: Math.min(2.5, W * 0.3) * (0.8 + rng() * 0.5), alpha: 0.55 });
  }
  for (let i = Math.floor(n * 0.5); i < n; i++) {
    const s = i / (n - 1);
    const k = smoothstep(0.5, 1, s);
    for (let m = 0; m < 2; m++) {
      const across = (rng() - 0.5) * f.widths[i] * (1.1 + 0.6 * k);
      const p = f.path[i].clone().addScaledVector(f.side, across).addScaledVector(f.dir, (rng() - 0.2) * W * (0.3 + 0.8 * k));
      out.push({ p, size: W * (0.55 + 1.6 * k) * (0.7 + rng() * 0.5), alpha: 0.2 + 0.55 * k });
    }
  }
  // the mist cloud at the foot: a heap of big soft puffs
  const foot = f.foot;
  const big = Math.max(6, W * 2.8);
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU, d = Math.pow(rng(), 0.7) * big * 1.0;
    const p = foot.clone().add(new THREE.Vector3(Math.cos(a) * d, (rng() - 0.3) * big * 0.5 - d * 0.2, Math.sin(a) * d));
    out.push({ p, size: big * (0.6 + rng() * 0.6) * (1 - d / (big * 2.4)), alpha: 0.75 + rng() * 0.2 });
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

/** A faint rainbow in the spray of the lower fall. */
export function rainbow(f: FallOut): THREE.Mesh {
  const size = Math.max(8, f.width * 3.2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), rainbowMaterial());
  // standing in the spray of the lower fall, a little in front of it
  m.position.copy(f.path[Math.floor(f.path.length * 0.82)]).addScaledVector(f.dir, f.width * 0.8).add(new THREE.Vector3(0, -size * 0.45, 0));
  m.scale.set(size * 2, size, 1);
  m.renderOrder = 4; m.userData.noOutline = true; m.frustumCulled = false;
  return m;
}
