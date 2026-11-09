import * as THREE from 'three';
import { smoothstep } from '../noise';
import { IslandShape, Stream, TAU } from './islandShape';
import { mistMaterial, rainbowMaterial, cloudBankMaterial } from './islandMaterials';

// The water of a floating island: a stream running across the meadow in its carved channel, pouring off the lip
// through a notch in the cliff in a narrow fall of white threads, which spreads into spray and is swallowed by a
// billowing stack of mist far below, with a faint rainbow in the spray. Everything moves in the shaders; nothing
// here runs per frame.

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
  /** distance fallen at each path point */
  drops: number[];
  /** the direction out from the cliff, and across the fall */
  dir: THREE.Vector3; side: THREE.Vector3;
  width: number;
}

/**
 * The fall: a narrow ribbon of white water tucked into its notch in the cliff. It rolls over the lip with a little
 * forward speed, then drops nearly plumb a hand's width clear of the notch's back wall (pushed out only where the
 * rock below sticks out), widening slowly as it falls and spreading fast into spray over its last third.
 * The ribbon's cross-section is a shallow U bowed out from the cliff, so from a steep or side-on angle part of it
 * always faces the eye (the shader thins it to threads where it turns edge-on: it never reads as a plank).
 * Two layers: the body, and a thinner veil just in front of it with its own threads and pace.
 */
export function fallGeometry(sh: IslandShape, st: Stream): FallOut {
  const a = st.spec.angle, L = st.spec.length, W = st.spec.width;
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const Re = sh.outline(a);
  const yTop = st.wl[st.wl.length - 1] + 0.02;
  const start = dir.clone().multiplyScalar(Re + 0.1 * sh.sc).setY(yTop);
  const n = 48;
  const C: THREE.Vector3[] = [], ds: number[] = [], widths: number[] = [];
  let outPrev = 0;
  const yRock = -sh.cliffDepth - sh.underDepth;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const d = L * (0.45 * s * s + 0.55 * s);
    // over the lip it curls forward a little, then falls almost plumb
    let out = (0.3 + 0.06 * W) * Math.min(1, Math.sqrt(d / 1.2)) + 0.008 * d;
    const y = yTop - d;
    // clear the rock below across the whole width
    if (y < sh.lipBottom(a) + 0.5 && y > yRock) for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const ak = a + (k * W) / Re;
      const w = sh.wall(ak, y);
      const wr = new THREE.Vector3(w.cx + Math.cos(ak) * w.r, 0, w.cz + Math.sin(ak) * w.r).dot(dir);
      out = Math.max(out, wr - Re + 0.45 + W * 0.05);
    }
    out = Math.max(out, outPrev);
    outPrev = out;
    C.push(start.clone().addScaledVector(dir, out).setY(y));
    ds.push(d);
    // slow widening as it falls, then a quick spread into spray over the last third
    widths.push(W * (0.9 + 0.35 * s) * (1 + 1.5 * smoothstep(0.6, 1, s)));
  }
  // smooth the clearance pushes so the curve stays clean
  for (let pass = 0; pass < 4; pass++) for (let i = 1; i < n; i++) {
    const o = (C[i - 1].clone().sub(start).dot(dir) + C[i + 1].clone().sub(start).dot(dir)) * 0.5;
    const cur = C[i].clone().sub(start).dot(dir);
    if (o > cur) C[i].addScaledVector(dir, o - cur);
  }
  const pos: number[] = [], uv: number[] = [], tt: number[] = [], lay: number[] = [], idx: number[] = [];
  const across = 10;
  // layers: [share of the width, how far in front, bow]
  const layers: [number, number, number][] = [[1, 0, 0.7], [0.62, 0.22 + W * 0.04, 0.45]];
  let vert = 0;
  layers.forEach(([wk, front, bow], layer) => {
    let arc = 0;
    const first = vert;
    for (let i = 0; i <= n; i++) {
      if (i > 0) arc += C[i].distanceTo(C[i - 1]);
      const T = C[Math.min(n, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
      const N = new THREE.Vector3().crossVectors(side, T).normalize();
      if (N.dot(dir) < 0) N.negate();
      const s = ds[i] / L;
      const half = widths[i] * 0.5 * wk;
      const sway = Math.sin(s * 4 + layer * 2.1) * 0.05 * W * s;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        // the U: the middle bows out from the cliff, the edges curl back toward it
        const p = C[i].clone().addScaledVector(side, sway + u * half).addScaledVector(N, front + (1 - u * u) * half * bow);
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
  return { geo: g, lip: start.clone(), foot: C[n].clone(), path: C, widths, drops: ds, dir, side, width: W };
}

export interface Puff { p: THREE.Vector3; size: number; alpha: number }

/**
 * A little white water where the fall goes over the lip; a thin veil of spray down the lower fall; and a billowing
 * stack of mist over the fall's last 15-20 m that swallows the end of the water and spreads out below it into a
 * cloud bank, so the fall never has an end line.
 */
export function fallPuffs(f: FallOut, rng: () => number, out: Puff[], banks: Puff[]) {
  const W = f.width, n = f.path.length;
  const L = f.drops[n - 1];
  // foam where it goes over
  for (let i = 0; i < 4; i++) {
    const u = (i / 3 - 0.5) * W * 0.7;
    out.push({ p: f.lip.clone().addScaledVector(f.side, u).addScaledVector(f.dir, 0.45).add(new THREE.Vector3(0, -0.4 - rng() * 0.5, 0)), size: W * (0.45 + rng() * 0.25), alpha: 0.5 });
  }
  const at = (d: number) => {
    // the path point and width at a distance fallen
    let i = 0;
    while (i < n - 2 && f.drops[i + 1] < d) i++;
    const k = Math.min(1, Math.max(0, (d - f.drops[i]) / Math.max(1e-3, f.drops[i + 1] - f.drops[i])));
    return { p: f.path[i].clone().lerp(f.path[i + 1], k), w: f.widths[i] + (f.widths[i + 1] - f.widths[i]) * k };
  };
  // a sparse veil of spray from half way down
  for (let d = L * 0.5; d < L * 0.75; d += W * 1.4) {
    const q = at(d);
    out.push({ p: q.p.addScaledVector(f.side, (rng() - 0.5) * q.w).addScaledVector(f.dir, 0.3 + rng() * W * 0.3), size: q.w * (0.5 + rng() * 0.3), alpha: 0.25 });
  }
  // the billow stack: over the last 15-20 m, growing and thickening down, overlapping the water
  const stack = Math.min(L * 0.3, 15 + W);
  for (let d = L - stack; d < L; ) {
    const t = (d - (L - stack)) / stack;
    const q = at(d);
    // small billows in the spray up top, heaping into big ones that swallow the water's end
    const size = W * (1.0 + 2.2 * t * t) + 1.5 + 4 * t;
    const n = 2 + Math.round(2 * t);
    for (let m = 0; m < n; m++) {
      const u = n === 1 ? 0 : m / (n - 1) - 0.5;
      const p = q.p.clone().addScaledVector(f.side, (u + (rng() - 0.5) * 0.4) * (q.w * 0.8 + size * 0.6 * t)).addScaledVector(f.dir, (rng() * 0.6 + 0.2) * size * 0.4);
      out.push({ p, size: size * (0.75 + rng() * 0.4), alpha: 0.45 + 0.5 * t });
    }
    d += size * 0.3;
  }
  // and the cloud it falls into: painted heaps like the cloud sea's, their crowns well above the water's end
  const big = 16 + W * 4;
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU, d = i === 0 ? 0 : big * (0.3 + rng() * 0.3);
    const w = big * (i === 0 ? 1 : 0.7 + rng() * 0.4);
    // a heap's crown sits about 0.17 of its width above its centre
    const p = f.foot.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)).addScaledVector(f.dir, W * 0.6 + (i === 0 ? 2 : 0));
    p.y += 9 + W - w * 0.17 - (i === 0 ? 0 : rng() * 4);
    banks.push({ p, size: w, alpha: 1 });
  }
}

/** All the island's puffs (or, with bank, its cloud heaps) in one instanced draw of camera-facing quads. */
export function puffMesh(list: Puff[], seed: number, bank = false): THREE.Mesh | null {
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
  const m = new THREE.Mesh(g, bank ? cloudBankMaterial() : mistMaterial());
  m.renderOrder = bank ? 2 : 3; m.userData.noOutline = true;
  return m;
}

/**
 * A faint rainbow in the spray where the fall meets the mist: a small arc segment, low and soft, only there when
 * the sun is behind the viewer (as a real one is).
 */
export function rainbow(f: FallOut): THREE.Mesh {
  const size = 3 + f.width * 1.6;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), rainbowMaterial());
  // in the mist, just in front of the lower fall
  const i = Math.floor(f.path.length * 0.9);
  m.position.copy(f.path[i]).addScaledVector(f.dir, f.width * 0.9).add(new THREE.Vector3(0, -size * 0.55, 0));
  m.scale.set(size * 2, size, 1);
  m.renderOrder = 4; m.userData.noOutline = true;
  return m;
}
