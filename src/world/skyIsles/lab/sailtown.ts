import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { paint, softRamp } from '../../../render/paint';
import { leafClump } from '../../../render/foliage';
import {
  TownAnimator, roundCottage, windmill, laundryLine, bunting, awningStall, footBridge, fence, flowerPlanter,
  raceGate, stoneSteps, pavedPath, flowerDrifts, SAIL,
} from '../sailtown';
import { Kit, T, rng, pick } from '../sailtownKit';
import { propStats } from '../sailtown';

/**
 * Sailtown lab: a vignette after picture 2. A lane of round cottages on a green clifftop, two windmills on the rise
 * behind, laundry, bunting across the lane, the market stall, fences, planters and flower drifts, the footbridge over
 * a stream that falls off the cliff edge, and the race gate at the start line. The ground, cliff, stream and clouds
 * here are lab stand-ins (the island builder owns the real ones).
 * Views: village (the picture-2 composition), door (chimes and flower box), windmill, wide, gate, stall, yard.
 * Query: ring=1 rings every chime at t = 0.5 s (to see them swing).
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const town = new TownAnimator();
  const r = rng(7);

  // ---------------------------------------------------------------- ground (lab stand-in)
  const EDGE = (z: number) => 15 + Math.sin(z * 0.13) * 2.2 + Math.sin(z * 0.41 + 1) * 0.8;   // cliff edge x
  const stream = [new THREE.Vector3(4, 0, -24), new THREE.Vector3(6.5, 0, -15), new THREE.Vector3(8.2, 0, -8), new THREE.Vector3(11.5, 0, -3), new THREE.Vector3(18, 0, -1.5)];
  const streamCurve = new THREE.CatmullRomCurve3(stream);
  const streamPts = streamCurve.getSpacedPoints(80);
  const distStream = (x: number, z: number) => { let d = 1e9; for (const p of streamPts) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };
  const hills = (x: number, z: number) => Math.max(0, (-z - 13) * 0.16) + Math.max(0, (-x - 14) * 0.1) + Math.sin(x * 0.21) * Math.sin(z * 0.17) * 0.25;
  const ground = (x: number, z: number) => {
    let h = hills(x, z);
    const ds = distStream(x, z);
    if (ds < 1.6) h -= 0.55 * (1 - (ds / 1.6) ** 2);
    return h;
  };
  {
    const N = 110, S = 90;
    const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2).translate(-5, 0, -10);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(p.count * 3);
    const grassA = new THREE.Color('#6f9e48'), grassB = new THREE.Color('#93b85c'), rock = new THREE.Color('#e6d4b0'), rockD = new THREE.Color('#c9b08a');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const e = EDGE(z);
      let y = ground(x, z);
      const over = x - e;
      if (over > 0) y -= Math.min(60, over * over * 1.2 + over * 6);   // the cliff falls away
      // ragged rock under the lip
      const n = Math.sin(z * 1.7 + y * 0.3) * 0.5 + Math.sin(z * 4.1 + y * 0.9) * 0.25;
      if (over > 0) p.setX(i, x + n * Math.min(1, over) * 0.8);
      p.setY(i, y);
      const c = grassA.clone().lerp(grassB, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.2) * Math.sin(z * 0.15));
      if (over > 0.15) c.copy(rock).lerp(rockD, 0.5 + 0.5 * Math.sin(y * 1.3 + z * 0.8));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.8 }));
    m.receiveShadow = true;
    scene.add(m);
  }
  // the stream: a ribbon of water down its channel, and a fall over the edge
  {
    const pos: number[] = [], idx: number[] = [];
    const pts = streamCurve.getSpacedPoints(60);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], tg = streamCurve.getTangentAt(i / (pts.length - 1)), sd = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
      const over = p.x - EDGE(p.z);
      const y = over > 0 ? -over * 6 : hills(p.x, p.z) - 0.3;
      for (const s of [-1, 1]) { const q = p.clone().addScaledVector(sd, s * 1.0); pos.push(q.x, y, q.z); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setIndex(idx); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, paint(new THREE.MeshToonMaterial({ color: '#9fd4ee', emissive: '#5aa0c8', emissiveIntensity: 0.35, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.4, rim: 2 }));
    scene.add(wm);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 34, 1, 8), paint(new THREE.MeshToonMaterial({ color: '#f4fbff', emissive: '#bfe2f4', emissiveIntensity: 0.5, gradientMap: softRamp(), side: THREE.DoubleSide }), { rim: 2 }));
    const e = EDGE(-1.8);
    fall.position.set(e + 0.6, -17.5, -1.8); fall.rotation.y = Math.PI / 2 - 0.1; fall.rotation.x = 0.06;
    scene.add(fall);
  }
  // clouds far below and heaped beyond the edge, so the edge reads as an edge
  {
    const cm = paint(new THREE.MeshToonMaterial({ color: '#fbf6ee', emissive: '#d8dcea', emissiveIntensity: 0.45, gradientMap: softRamp() }), { variation: 0.1, rim: 1.8, noCloud: true });
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const N = 160;
    const im = new THREE.InstancedMesh(geo, cm, N);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = -1.2 + r() * 2.6, d = 40 + r() * 240;
      const x = 20 + Math.cos(a) * d, z = -10 + Math.sin(a) * d;
      const s = 7 + r() * 16;
      mm.compose(new THREE.Vector3(x, -42 + r() * 8 - d * 0.05, z), q, new THREE.Vector3(s * 1.4, s * 0.55, s));
      im.setMatrixAt(i, mm);
    }
    scene.add(im);
    // cumulus heaped beyond the edge (lab stand-in for the sky builder's clouds)
    const N2 = 220;
    const puffs = new THREE.InstancedMesh(geo, cm, N2);
    for (let i = 0; i < N2; i++) {
      const cl = Math.floor(i / 11), rc = rng(cl * 13 + 5);
      const a = -1.35 + rc() * 2.2, d = 110 + rc() * 170;
      const cx = 15 + Math.cos(a) * d, cz = -10 + Math.sin(a) * d, cy = -34 + rc() * 22;
      const k = i % 11, s = (5 + r() * 9) * (1 - k * 0.04) * (0.6 + d / 300);
      mm.compose(new THREE.Vector3(cx + (r() - 0.5) * 26, cy + k * 1.6 + r() * 4, cz + (r() - 0.5) * 18), q, new THREE.Vector3(s * 1.2, s * 0.9, s));
      puffs.setMatrixAt(i, mm);
    }
    scene.add(puffs);
  }

  // ---------------------------------------------------------------- trees (lab stand-ins in the World 1 style)
  const tree = (x: number, z: number, s: number, seed: number) => {
    const k = new Kit(), rr = rng(seed);
    const y = ground(x, z);
    k.add(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 3.2 * s, 7), 'wood', '#6e5038', T(0, 1.6 * s, 0, (rr() - 0.5) * 0.1, 0, (rr() - 0.5) * 0.1));
    for (let i = 0; i < 7; i++) {
      const a = rr() * 6.28, d = rr() * 1.3 * s;
      const cl = leafClump({ radius: (1.1 + rr() * 0.5) * s, color: '#ffffff', cards: 26, seed: seed * 10 + i, core: false });
      k.addClump(cl, pick(rr, ['#5f9a42', '#6aa648', '#558e3c', '#78b050']), T(Math.cos(a) * d, (3.2 + rr() * 1.6) * s, Math.sin(a) * d));
      k.add(new THREE.IcosahedronGeometry(0.8 * s, 1), 'plain', '#3f6a30', T(Math.cos(a) * d * 0.8, (3.2 + rr() * 1.2) * s, Math.sin(a) * d * 0.8));
    }
    const g = k.build(undefined, { outline: false });
    g.position.set(x, y, z);
    scene.add(g);
  };
  tree(-12, -6, 1.3, 1); tree(-9, -15, 1.5, 2); tree(1.5, -21, 1.4, 3); tree(-14.5, 4, 1.2, 4); tree(-12.5, -21, 1.1, 5); tree(-3.5, -24, 1.3, 6); tree(13, -25, 1.2, 7);

  // ---------------------------------------------------------------- the village
  const place = (o: THREE.Object3D, x: number, z: number, ry = 0, dy = 0) => {
    o.position.set(x, ground(x, z) + dy, z); o.rotation.y = ry; scene.add(o); town.add(o); return o;
  };
  // the lane: flagstones from the foreground up into the cluster of cottages, a branch to the bridge and the gate
  const lane = [new THREE.Vector3(-3.6, 0, 11), new THREE.Vector3(-3.0, 0, 3), new THREE.Vector3(-1.6, 0, -3), new THREE.Vector3(-0.6, 0, -8), new THREE.Vector3(0, 0, -14)];
  scene.add(pavedPath(lane, 1.6, 4, ground));
  const bridgeLane = [new THREE.Vector3(-1.6, 0, -3), new THREE.Vector3(3.5, 0, -5.2), new THREE.Vector3(6.4, 0, -7.4)];
  scene.add(pavedPath(bridgeLane, 1.2, 9, ground));
  const cliffLane = [new THREE.Vector3(10.0, 0, -9.2), new THREE.Vector3(11.4, 0, -13), new THREE.Vector3(12.4, 0, -20)];
  scene.add(pavedPath(cliffLane, 1.2, 12, ground));

  // cottage A: the foreground one, door turned three-quarters to the lane, with chimes and stone steps
  const cA = place(roundCottage({ seed: 3, radius: 2.4, chimes: true, windows: 3 }), -8.2, 4.4, 1.0);
  // the cluster up the lane
  const cB = place(roundCottage({ seed: 11, radius: 2.2, shutter: '#c8794a', vane: true }), -3.6, -10.2, 0.45);
  const cC = place(roundCottage({ seed: 19, radius: 2.0, shutter: '#5d84b4' }), 3.0, -12.8, -0.25);
  place(roundCottage({ seed: 27, radius: 1.8, chimes: false, windows: 2 }), -0.6, -18.5, 0.2);
  place(roundCottage({ seed: 31, radius: 1.7, chimes: false, windows: 2, shutter: '#7fa36a' }), 6.8, -20, -0.5);
  place(roundCottage({ seed: 37, radius: 2.0, chimes: false }), -9.5, -12, 1.2);
  // windmills on the rise behind
  const wm1 = place(windmill({ seed: 5, height: 9.5 }), -6.5, -23, 0.55);
  place(windmill({ seed: 9, height: 8.2, gallery: false, speed: 0.4 }), 4.5, -27, -0.3);
  // stone steps up to cottage A's door, planters each side
  const doorDir = new THREE.Vector3(Math.sin(cA.rotation.y), 0, Math.cos(cA.rotation.y));
  const doorPos = cA.position.clone().addScaledVector(doorDir, 2.4 + 0.75);
  const steps = stoneSteps(2, 1.8, 3, 0.12, 0.45);
  steps.position.copy(doorPos).addScaledVector(doorDir, 1.1); steps.rotation.y = cA.rotation.y + Math.PI; scene.add(steps);
  const side = new THREE.Vector3(doorDir.z, 0, -doorDir.x);
  place(flowerPlanter('hydrangea', 1), doorPos.x + side.x * 1.6 + doorDir.x * 0.9, doorPos.z + side.z * 1.6 + doorDir.z * 0.9, cA.rotation.y);
  place(flowerPlanter('lavender', 2, { width: 0.8 }), doorPos.x - side.x * 1.7 + doorDir.x * 0.6, doorPos.z - side.z * 1.7 + doorDir.z * 0.6, cA.rotation.y + 0.2);
  place(flowerPlanter('hydrangea', 6, { width: 0.7 }), -5.0, 8.4, 0.4);
  place(flowerPlanter('mixed', 4), -2.0, -7.6, 0.4);
  place(flowerPlanter('roses', 5, { width: 0.8 }), 1.2, -10.2, -0.3);
  // laundry in the side yard between cottage A and the cluster
  place(laundryLine(5.2, 3), -7.4, -1.2, 0.5);
  // bunting: cottage A's eave to a pole, across the lane to a pole by the stall, on to cottage C
  const pole = (x: number, z: number, h: number) => { const k = new Kit(); k.add(new THREE.CylinderGeometry(0.05, 0.07, h, 6), 'wood', SAIL.weathered, T(0, h / 2, 0)); const g = k.build(); place(g, x, z); return new THREE.Vector3(x, ground(x, z) + h - 0.1, z); };
  const p1 = pole(-0.9, 0.5, 3.8), p2 = pole(2.6, -6.2, 4.2);
  const eave = (c: THREE.Object3D, ang: number, y: number) => c.position.clone().add(new THREE.Vector3(Math.sin(ang) * (c.userData.radius - 0.2), y, Math.cos(ang) * (c.userData.radius - 0.2)));
  scene.add(bunting([eave(cA, 1.6, 3.0), p1, p2, eave(cC, 0.2, 3.0)], 3));
  scene.add(bunting([eave(cB, 1.2, 3.0), p2], 8));
  // the market stall at the turn of the lane
  const stall = place(awningStall({ seed: 2 }), 1.6, -8.0, -0.4);
  // the bridge over the stream
  const bridgeAt = streamCurve.getPointAt(0.5);
  const btg = streamCurve.getTangentAt(0.5);
  place(footBridge(4.6), bridgeAt.x, bridgeAt.z, Math.atan2(btg.x, btg.z) + Math.PI / 2, -0.2);
  // fences: along the lane edge in the foreground and along the cliff path
  place(fence(8, { seed: 2 }), -1.2, 8.5, 1.45);
  place(fence(9, { seed: 7 }), 11.0, 5, Math.PI / 2 + 0.2);
  place(fence(6, { seed: 9 }), 13.6, -8.5, Math.PI / 2 - 0.3);
  // the race gate at the start line by the cliff edge
  const gate = place(raceGate({ seed: 4 }), 13.0, -22, -0.9);

  // ---------------------------------------------------------------- flowers and grass
  const keep = (x: number, z: number) => {
    if (x > EDGE(z) - 0.3) return false;
    if (distStream(x, z) < 1.1) return false;
    for (const p of lane) if (Math.hypot(p.x - x, p.z - z) < 1.0) return false;
    for (const c of [cA, cB, cC, stall]) if (Math.hypot(c.position.x - x, c.position.z - z) < 2.6) return false;
    return true;
  };
  const area = (x0: number, x1: number, z0: number, z1: number) => (rr: () => number): [number, number] | null => [x0 + rr() * (x1 - x0), z0 + rr() * (z1 - z0)];
  const flowers = new THREE.Group();
  flowers.add(flowerDrifts({ area: area(-6, 14, -2, 12), drifts: 40, perDrift: 30, spread: 1.6, seed: 3, heightAt: ground, keep, scale: 1.25 }));
  flowers.add(flowerDrifts({ area: area(-16, 14, -24, -2), drifts: 50, perDrift: 26, spread: 1.8, seed: 5, heightAt: ground, keep, scale: 1.3 }));
  flowers.add(flowerDrifts({ area: area(-20, 15, -30, 12), drifts: 70, perDrift: 16, spread: 2.0, seed: 9, heightAt: ground, keep, mix: { tuft: 1 }, scale: 1.3 }));
  scene.add(flowers);

  // ---------------------------------------------------------------- stats
  const st = (o: THREE.Object3D) => { const p = propStats(o); return `${p.draws}+${p.inkDraws} ink draws, ${(p.tris / 1000).toFixed(1)}k+${(p.inkTris / 1000).toFixed(1)}k ink tris`; };
  const all = new THREE.Group(); all.children = scene.children.slice();
  console.log(`[sailtown] scene: ${st(all)}`);
  console.log(`[sailtown] cottage A: ${st(cA)} | windmill: ${st(wm1)} | stall: ${st(stall)} | gate: ${st(gate)} | flowers: ${st(flowers)}`);
  for (const f of flowers.children) for (const im of f.children) console.log(`[sailtown]   flowers ${im.name}: ${(im as THREE.InstancedMesh).count} x ${((im as THREE.Mesh).geometry.index!.count / 3)} tris`);

  const ringAt = params.get('ring') ? 0.5 : -1;
  let rung = false;
  const doorCam = (dist: number, up: number, sideK: number): [number, number, number] => {
    const p = doorPos.clone().addScaledVector(doorDir, dist).addScaledVector(side, sideK); return [p.x, p.y + up, p.z];
  };
  const wmDir = new THREE.Vector3(Math.sin(wm1.rotation.y), 0, Math.cos(wm1.rotation.y));
  const wmCam = wm1.position.clone().addScaledVector(wmDir, 12.5).add(new THREE.Vector3(2.5, 7.0, 0));
  return {
    update(dt, t) {
      if (ringAt >= 0 && !rung && t > ringAt) { rung = true; for (const c of town.chimes) c.ring(2); }
      town.update(dt, t);
    },
    views: {
      village: { pos: [-6.0, 2.2, 10.5], look: [3.5, 2.6, -6], fov: 55 },
      door: { pos: doorCam(3.6, 1.6, -1.6), look: [doorPos.x - doorDir.x * 0.3 - side.x * 0.4, doorPos.y + 1.55, doorPos.z - doorDir.z * 0.3 - side.z * 0.4], fov: 45 },
      windmill: { pos: [wmCam.x, wmCam.y, wmCam.z], look: [wm1.position.x, wm1.position.y + 6.0, wm1.position.z], fov: 55 },
      yard: { pos: [-1.5, 2.0, 4.5], look: [-6.5, 1.6, -2.5], fov: 50 },
      wide: { pos: [30, 10, 16], look: [-1, 1, -9], fov: 50 },
      gate: { pos: [gate.position.x - 10, gate.position.y + 4, gate.position.z + 9], look: [gate.position.x, gate.position.y + 7, gate.position.z], fov: 50 },
      stall: { pos: [stall.position.x - 2.8, stall.position.y + 1.8, stall.position.z + 4.2], look: [stall.position.x, stall.position.y + 1.1, stall.position.z], fov: 50 },
    },
  };
}
