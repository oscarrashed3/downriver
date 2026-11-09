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
 * The fall: a heavy curtain of white water tucked into its notch in the cliff. It rolls over the lip in a foaming
 * lip roll, then drops nearly plumb a hand's width clear of the notch's back wall (pushed out only where the rock
 * below sticks out), widening slowly as it falls and spreading into spray over its last third. Its cross-section is
 * a U bowed out from the cliff, so it has body from any angle. Four layers in one geometry (aLayer):
 * 0 the body (mostly opaque, churned clumps of foam along its sides), 1 a veil of bright streaks in front of it,
 * 2 a wider, soft mist sheet behind it, 3 the foam roll where the water leaves the notch.
 * aBack is 1 where there is rock close behind the water: there the body's opaque core also writes depth (see
 * fallDepthMaterial), so the screen ink of the cliff behind never draws over the water.
 */
export function fallGeometry(sh: IslandShape, st: Stream): FallOut {
  const a = st.spec.angle, L = st.spec.length, W = st.spec.width;
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const Re = sh.outline(a);
  const yTop = st.wl[st.wl.length - 1] + 0.02;
  const start = dir.clone().multiplyScalar(Re + 0.1 * sh.sc).setY(yTop);
  const n = 56;
  const C: THREE.Vector3[] = [], ds: number[] = [], widths: number[] = [], back: number[] = [];
  let outPrev = 0;
  const yRock = -sh.cliffDepth - sh.underDepth;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    // rows bunched toward the lip, where the water curls over
    const d = L * (0.5 * s * s + 0.5 * s);
    // over the lip it curls forward a little, then falls almost plumb
    let out = (0.3 + 0.06 * W) * Math.min(1, Math.sqrt(d / 1.2)) + 0.008 * d;
    const y = yTop - d;
    // clear the rock below across the whole width
    let wallOut = -Infinity;
    if (y < sh.lipBottom(a) + 0.5 && y > yRock) for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const ak = a + (k * W) / Re;
      const w = sh.wall(ak, y);
      const wr = new THREE.Vector3(w.cx + Math.cos(ak) * w.r, 0, w.cz + Math.sin(ak) * w.r).dot(dir);
      wallOut = Math.max(wallOut, wr - Re);
      out = Math.max(out, wr - Re + 0.45 + W * 0.05);
    }
    out = Math.max(out, outPrev);
    outPrev = out;
    C.push(start.clone().addScaledVector(dir, out).setY(y));
    ds.push(d);
    // rock close behind this row (within a few metres), all across
    back.push(y > -sh.cliffDepth + 1.5 && out - wallOut < 2.5 + W * 0.3 ? 1 : 0);
    // slow widening as it falls, then a spread into spray over the last third
    widths.push(W * (0.95 + 0.3 * s) * (1 + 0.9 * smoothstep(0.6, 1, s)));
  }
  // the depth-writing core stops a few rows above where the rock behind runs out (so its lower edge is always
  // in front of stone, never drawn as an ink line against the sky)
  let lastBack = -1;
  for (let i = 0; i <= n; i++) { if (back[i] > 0) lastBack = i; else break; }
  for (let i = 0; i <= n; i++) back[i] = i <= lastBack - 3 ? 1 : 0;
  // smooth the clearance pushes so the curve stays clean
  for (let pass = 0; pass < 4; pass++) for (let i = 1; i < n; i++) {
    const o = (C[i - 1].clone().sub(start).dot(dir) + C[i + 1].clone().sub(start).dot(dir)) * 0.5;
    const cur = C[i].clone().sub(start).dot(dir);
    if (o > cur) C[i].addScaledVector(dir, o - cur);
  }
  const pos: number[] = [], uv: number[] = [], tt: number[] = [], lay: number[] = [], bk: number[] = [], idx: number[] = [];
  const across = 12;
  // layers: [id, share of the width, how far in front (+) or behind (-), bow]
  const layers: [number, number, number, number][] = [[2, 1.4, -0.35 - W * 0.04, 0.35], [0, 1, 0, 0.55], [1, 0.72, 0.16 + W * 0.035, 0.42]];
  let vert = 0;
  for (const [layer, wk, front, bow] of layers) {
    let arc = 0;
    const first = vert;
    for (let i = 0; i <= n; i++) {
      if (i > 0) arc += C[i].distanceTo(C[i - 1]);
      const T = C[Math.min(n, i + 1)].clone().sub(C[Math.max(0, i - 1)]).normalize();
      const N = new THREE.Vector3().crossVectors(side, T).normalize();
      if (N.dot(dir) < 0) N.negate();
      const s = ds[i] / L;
      // the mist sheet starts a little below the lip and spreads as it falls
      const half = widths[i] * 0.5 * (layer === 2 ? lerpN(0.75, wk, smoothstep(0, 0.4, s)) : wk);
      const sway = Math.sin(s * 4 + layer * 2.1) * 0.05 * W * s;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        // the U: the middle bows out from the cliff, the edges curl back toward it
        const p = C[i].clone().addScaledVector(side, sway + u * half).addScaledVector(N, front + (1 - u * u) * half * bow);
        pos.push(p.x, p.y, p.z);
        uv.push(u, arc + layer * 17.3); tt.push(s); lay.push(layer); bk.push(layer === 0 ? back[i] : 0);
        vert++;
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < across; j++) {
      const q = first + i * (across + 1) + j, b = q + 1, c = q + across + 1, d = c + 1;
      idx.push(q, c, b, b, c, d);
    }
  }
  // ---- the lip roll: a foaming half-pipe of water where it leaves the notch, a little wider than the fall, from
  // just behind the lip on the stream, arching out and over and down the first couple of metres
  {
    const Rr = 0.45 + 0.14 * W, first = vert, rows = 9;
    const o = start.clone().addScaledVector(dir, -Rr * 0.35).add(new THREE.Vector3(0, -Rr * 0.55, 0));
    for (let i = 0; i <= rows; i++) {
      const th = -0.35 + (i / rows) * (Math.PI * 0.5 + 0.9);
      // (a little more than a quarter turn, then a straight run down that tucks inside the body)
      const c = o.clone().addScaledVector(dir, Math.sin(Math.min(th, Math.PI / 2)) * Rr + (th > Math.PI / 2 ? 0 : 0))
        .add(new THREE.Vector3(0, Math.cos(Math.min(th, Math.PI / 2)) * Rr - Math.max(0, th - Math.PI / 2) * Rr * 2.2, 0));
      const nrm = dir.clone().multiplyScalar(Math.sin(Math.min(th, Math.PI / 2))).add(new THREE.Vector3(0, Math.cos(Math.min(th, Math.PI / 2)), 0));
      const half = W * 0.5 * 1.12;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        const p = c.clone().addScaledVector(side, u * half).addScaledVector(nrm, 0.12 * (1 - u * u) * W * 0.3);
        pos.push(p.x, p.y, p.z);
        uv.push(u, (i / rows) * Rr * 3); tt.push(i / rows); lay.push(3); bk.push(0);
        vert++;
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < across; j++) {
      const q = first + i * (across + 1) + j, b = q + 1, c = q + across + 1, d = c + 1;
      idx.push(q, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setAttribute('aBack', new THREE.Float32BufferAttribute(bk, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, lip: start.clone(), foot: C[n].clone(), path: C, widths, drops: ds, dir, side, width: W };
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Puff { p: THREE.Vector3; size: number; alpha: number }

/**
 * Spray where the fall goes over the lip; a veil of spray down the lower fall; and a big bright spray volume at its
 * foot: a heap of overlapping billows about three times the fall's width that swallows the end of the water and
 * rolls out into the cloud bank below, so the fall never has an end line. bow: where the rainbow stands.
 */
export function fallPuffs(f: FallOut, rng: () => number, out: Puff[], banks: Puff[]): THREE.Vector3 {
  const W = f.width, n = f.path.length;
  const L = f.drops[n - 1];
  // white water bursting where it goes over
  for (let i = 0; i < 5; i++) {
    const u = (i / 4 - 0.5) * W * 0.9;
    out.push({ p: f.lip.clone().addScaledVector(f.side, u).addScaledVector(f.dir, 0.5 + rng() * 0.3).add(new THREE.Vector3(0, -0.8 - rng() * 0.8, 0)), size: W * (0.5 + rng() * 0.25), alpha: 0.7 });
  }
  const at = (d: number) => {
    // the path point and width at a distance fallen
    let i = 0;
    while (i < n - 2 && f.drops[i + 1] < d) i++;
    const k = Math.min(1, Math.max(0, (d - f.drops[i]) / Math.max(1e-3, f.drops[i + 1] - f.drops[i])));
    return { p: f.path[i].clone().lerp(f.path[i + 1], k), w: f.widths[i] + (f.widths[i + 1] - f.widths[i]) * k };
  };
  // a veil of spray clinging to the lower fall
  for (let d = L * 0.45; d < L * 0.72; d += W * 1.1) {
    const q = at(d);
    out.push({ p: q.p.addScaledVector(f.side, (rng() - 0.5) * q.w).addScaledVector(f.dir, 0.4 + rng() * W * 0.3), size: q.w * (0.6 + rng() * 0.3), alpha: 0.35 });
  }
  // the spray volume: billows over the last stretch, growing and thickening downward into a heap
  const stack = Math.min(L * 0.32, 14 + W * 1.5);
  for (let d = L - stack; d < L; ) {
    const t = (d - (L - stack)) / stack;
    const q = at(d);
    const size = W * (1.1 + 1.9 * t) + 1.5 + 3 * t;
    const m = 2 + Math.round(2 * t);
    for (let k = 0; k < m; k++) {
      const u = k / (m - 1) - 0.5;
      const p = q.p.clone().addScaledVector(f.side, (u + (rng() - 0.5) * 0.4) * (q.w * 0.9 + size * 0.5 * t)).addScaledVector(f.dir, (rng() * 0.6 + 0.3) * size * 0.35);
      out.push({ p, size: size * (0.8 + rng() * 0.4), alpha: 0.55 + 0.4 * t });
    }
    d += size * 0.3;
  }
  // the burst at the foot: four or five big overlapping billows, ~3x the fall's width, heaped round the water's end
  const big = W * 3 + 4;
  const foot = at(L * 0.93).p;
  for (let i = 0; i < 5; i++) {
    const u = (i / 4 - 0.5) * 2;
    const p = foot.clone().addScaledVector(f.side, u * big * 0.42 + (rng() - 0.5) * W).addScaledVector(f.dir, big * (0.12 + rng() * 0.2) * (1 - Math.abs(u) * 0.5));
    p.y += big * (0.05 - 0.18 * Math.abs(u)) + (rng() - 0.5) * W * 0.6;
    out.push({ p, size: big * (i === 2 ? 1.25 : 0.8 + rng() * 0.3), alpha: 0.95 });
  }
  // and the cloud it falls into: painted heaps like the cloud sea's, their crowns at the spray's foot
  const bank = 16 + W * 4;
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU, d = i === 0 ? 0 : bank * (0.3 + rng() * 0.3);
    const w = bank * (i === 0 ? 1 : 0.7 + rng() * 0.4);
    const p = f.foot.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)).addScaledVector(f.dir, W * 0.6 + (i === 0 ? 2 : 0));
    p.y += 4 + W - w * 0.17 - (i === 0 ? 0 : rng() * 4);
    banks.push({ p, size: w, alpha: 1 });
  }
  // the rainbow stands in the front of the burst
  return foot.clone().addScaledVector(f.dir, big * 0.45).add(new THREE.Vector3(0, big * 0.05, 0));
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
 * A rainbow standing in the spray burst at the fall's foot: a short soft arc segment, inside the spray (so it reads
 * as light in the mist), strongest when the sun is behind the viewer.
 */
export function rainbow(f: FallOut, at: THREE.Vector3): THREE.Mesh {
  const size = f.width * 1.1 + 2.5;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), rainbowMaterial());
  m.position.copy(at).add(new THREE.Vector3(0, -size * 0.45, 0));
  m.scale.set(size * 2, size, 1);
  m.renderOrder = 4; m.userData.noOutline = true;
  return m;
}
