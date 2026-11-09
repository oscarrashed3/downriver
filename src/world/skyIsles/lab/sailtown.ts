import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { paint, softRamp, PAINT } from '../../../render/paint';
import {
  TownAnimator, roundCottage, windmill, laundryLine, bunting, awningStall, footBridge, fence, flowerPlanter,
  raceGate, stoneSteps, stoneWall, pavedPath, addBarrel, addCrate, addPot, addSack, propStats, SAIL, SAILTOWN_LIGHT,
  FloraField, meadow, flowerBed, townTree, hedge, PETALS, GRASS,
} from '../sailtown';
import { Kit, T, rng, pick, chainCompile } from '../sailtownKit';
import { floatingIsle, farIsle, waterfall, CloudField, CLOUD_LIGHT, Rim, AERIAL } from '../sailtownIsle';

/**
 * Sailtown lab: a vignette after picture 2. A flagstone lane climbs from the foreground past a raised cottage (stone
 * steps up to its door, roses, chimes), through a tight cluster of round cottages with stone walls, hedges, trees and
 * clutter between them, the market stall at the bend, laundry in the yard, bunting swagged between the roofs, two
 * windmills on the rise behind; a fence with deep flower beds runs down to the stream, which passes under the
 * footbridge and falls off the cliff edge into the cloud sea. The race gate stands at the start line on the cliff.
 * Ground, cliff, stream, waterfall and clouds here are lab stand-ins (the island builder owns the real ones).
 * Views: village (the picture-2 composition), door, windmill, wide, gate, stall, yard.
 * Query: ring=1 rings every chime at t = 0.5 s.
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const town = new TownAnimator();
  const r = rng(7);

  // ---------------------------------------------------------------- light: the hazy afternoon of picture 2
  const L = ctx.golden ? SAILTOWN_LIGHT.golden : SAILTOWN_LIGHT.day;
  {
    const sd = new THREE.Vector3(...L.sunDir).normalize();
    ctx.sun.color.set(L.sun); ctx.sun.intensity = L.sunIntensity;
    ctx.sun.position.copy(sd).multiplyScalar(200); ctx.sunDir.copy(sd);
    PAINT.uSun.value.copy(sd);
    PAINT.uSunCol.value.set(L.sun).multiplyScalar(L.sunIntensity / 2.6);
    PAINT.uAmbSky.value.set(L.ambSky).multiplyScalar(L.ambSkyK);
    PAINT.uAmbGround.value.set(L.ambGround).multiplyScalar(L.ambGroundK);
    PAINT.uRimCol.value.set(L.rim);
    const fog = scene.fog as THREE.FogExp2;
    fog.color.set(L.fog); fog.density = L.fogDensity;
    scene.traverse(o => {
      const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
      if (u?.uTop && u?.uHorizon) { u.uTop.value.set(L.skyTop); u.uHorizon.value.set(L.skyHorizon); if (u.uSun) u.uSun.value.copy(sd); }
    });
  }

  // ---------------------------------------------------------------- the isle (lab stand-in for the island builder)
  // The village camera, first: the backdrop is composed for it (far isles and cumulus where picture 2 has them).
  const V = new THREE.Vector3(-1.7, 3.5, 19.6), VL = new THREE.Vector3(5.2, 2.2, -6);
  const yaw = Math.atan2(VL.x - V.x, -(VL.z - V.z));
  /** A point seen from the village camera `deg` degrees right of the view centre, `dist` metres out, at height y. */
  const seen = (deg: number, dist: number, y: number) => { const a = yaw + deg * Math.PI / 180; return new THREE.Vector3(V.x + Math.sin(a) * dist, y, V.z - Math.cos(a) * dist); };
  // the stream, from the hills behind, under the bridge, to the lip of the promontory face, where it falls in view
  const stream = [new THREE.Vector3(5, 0, -36), new THREE.Vector3(8.4, 0, -22), new THREE.Vector3(9.0, 0, -12), new THREE.Vector3(9.45, 0, -6.6), new THREE.Vector3(8.7, 0, -2.0), new THREE.Vector3(9.5, 0, 1.4), new THREE.Vector3(9.8, 0, 4.2), new THREE.Vector3(9.6, 0, 7.4)];
  const streamCurve = new THREE.CatmullRomCurve3(stream);
  const streamPts = streamCurve.getSpacedPoints(160);
  const distStream = (x: number, z: number) => { let d = 1e9; for (const p of streamPts) { const dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (d > dd) d = dd; } return Math.sqrt(d); };
  const A = new THREE.Vector3(-6.4, 0, 3.4);   // the raised foreground cottage
  const TER = { r0: 3.35, r1: 3.75, h: 0.5 };
  const hills = (x: number, z: number) => Math.max(0, (-z - 17) * 0.13) + Math.max(0, (-x - 12) * 0.09) + Math.sin(x * 0.21) * Math.sin(z * 0.17) * 0.18;
  const ground0 = (x: number, z: number) => {
    let h = hills(x, z);
    const dA = Math.hypot(x - A.x, z - A.z);
    if (dA < TER.r1) h += TER.h * Math.min(1, (TER.r1 - dA) / (TER.r1 - TER.r0));
    const ds = distStream(x, z);
    if (ds < 1.7) h -= 0.5 * (1 - (ds / 1.7) ** 2);
    return h;
  };
  // an organic rim: the falls corner by the foreground, the promontory beyond it, the long curve round the back
  const RIM: [number, number][] = [[17, -3], [14.6, 3], [9.6, 6.2], [4.9, 9.4], [3.3, 13], [2.6, 20], [1.0, 26], [-4, 28.5], [-12, 25], [-21, 17], [-27, 6], [-30, -8], [-28, -24], [-20, -38], [-8, -46], [4, -44], [12, -34], [15.6, -22], [17.2, -12]];
  // where the stream meets the rim: the falls has worn a gully back into the face there
  const rim0 = new Rim([-5, -10], RIM, 4, 0.7);
  let aFall = 0;
  for (const p of streamPts) if (rim0.dist(p.x, p.z) > -0.1) { aFall = rim0.angleOf(p.x, p.z); break; }
  const isle = floatingIsle({
    center: [-5, -10], seed: 4, depth: 46, rough: 0.7, segs: 320, rings: 64, rows: 80, vines: 1.6, spill: 3,
    rim: RIM, top: ground0,
    gullies: [[aFall, 0.055, 1.8]],
    clear: [[aFall - 0.07, aFall + 0.07]],
  });
  scene.add(isle.group);
  const ground = isle.height;
  const rimD = (x: number, z: number) => isle.rim.dist(x, z);
  // the stream down its channel to the lip, scrolling
  const fallTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d')!;
    const rr = rng(5);
    x.fillStyle = '#cfe6f2'; x.fillRect(0, 0, 256, 512);
    x.filter = 'blur(2px)';
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.35 + rr() * 0.5})`; x.fillRect(rr() * 256, 0, 4 + rr() * 14, 512); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(140,190,218,${0.25 + rr() * 0.3})`; x.fillRect(rr() * 256, 0, 3 + rr() * 6, 512); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  let lip = new THREE.Vector3(), lipOut = new THREE.Vector3(1, 0, 0);
  {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const pts = streamCurve.getSpacedPoints(120);
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], tg = streamCurve.getTangentAt(i / (pts.length - 1)), sd = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
      const over = rimD(p.x, p.z);
      const y = hills(p.x, p.z) - 0.28 - Math.max(0, over + 0.6) * 0.5;
      if (over > -0.1) { lip.set(p.x, y, p.z); lipOut.copy(tg).setY(0).normalize(); break; }
      for (const s of [-1, 1]) { const q = p.clone().addScaledVector(sd, s * 1.05); pos.push(q.x, y, q.z); uv.push(s * 0.5 + 0.5, i * 0.4); }
      if (n) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      n++;
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const st = fallTex.clone(); st.repeat.set(1, 0.25); st.needsUpdate = true;
    const wm = new THREE.Mesh(wg, paint(new THREE.MeshToonMaterial({ color: '#b4dcf0', map: st, emissive: '#6aa8cc', emissiveIntensity: 0.3, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.3, rim: 2 }));
    wm.userData.noOutline = true;
    scene.add(wm);
    fallTex.userData.scroll = true;
  }
  // the falls: thrown out over the lip and down into the cloud sea
  const fallDrop = 44;
  scene.add(waterfall(lip.clone().addScaledVector(lipOut, -0.4), lipOut, 2.8, fallDrop, { speed: 3.8, seed: 2 }));

  // ---------------------------------------------------------------- sky: cumulus banks, the cloud sea, far isles
  const clouds = new CloudField(ctx.golden ? CLOUD_LIGHT.golden : CLOUD_LIGHT.day);
  AERIAL.uAerCol.value.set(ctx.golden ? '#d8b4b4' : '#9dbde6'); AERIAL.uAerMax.value = ctx.golden ? 0.42 : 0.6;
  const far: THREE.Group[] = [];
  {
    const cr = rng(19);
    clouds.sea(0, -50, 0, 30, 1500, 420, 3, 1.1);
    // towering cumulus behind the far isles on the right, a bank behind the village, a lower one to the left
    const bank = (deg: number, dist: number, base: number, w: number, h: number, seed: number, n = 46) => { const p = seen(deg, dist, base); clouds.heap(p.x, base, p.z, w, h, seed, n); };
    bank(20, 440, -40, 230, 170, 1, 60); bank(40, 360, -36, 200, 190, 2, 60); bank(56, 300, -30, 150, 120, 3, 40);
    bank(-4, 560, -30, 280, 110, 4, 50); bank(-30, 480, -25, 240, 90, 5, 44); bank(8, 650, -20, 300, 80, 6, 40);
    // banks for the wide view's background (it looks south-west)
    clouds.heap(-320, -40, -300, 260, 150, 7, 50); clouds.heap(-120, -40, -420, 240, 120, 8, 44); clouds.heap(-420, -30, -60, 200, 100, 9, 40);
    // mist under the falls, and heaps hugging the isle's underside
    const mb = lip.clone().addScaledVector(lipOut, 5);
    clouds.heap(mb.x, -48, mb.z, 26, 14, 10, 18);
    for (let i = 0; i < 9; i++) { const a = cr() * Math.PI * 2, p = isle.rim.at(a); clouds.heap(p.x * 0.8 - 1, -46 - cr() * 4, p.z * 0.8 - 2, 22 + cr() * 18, 10 + cr() * 8, 20 + i, 12); }
    // far isles: a big one with its village and falls right of centre, a windmill isle at the right edge, small ones
    const isleAt = (deg: number, dist: number, y: number, o: Parameters<typeof farIsle>[0]) => {
      const g = farIsle(o); g.position.copy(seen(deg, dist, y)); g.rotation.y = cr() * 6; scene.add(g); far.push(g); town.add(g);
      const R = o.radius, d = o.depth ?? R * 1.4;
      clouds.heap(g.position.x + R * 0.3, y - d * 1.05, g.position.z, R * 2.2, R * 0.6, 40 + far.length, 16);
      return g;
    };
    isleAt(13, 240, 34, { radius: 21, seed: 3, cottages: 9, windmills: 2, trees: 12 });
    isleAt(39, 170, 22, { radius: 13, seed: 5, cottages: 4, windmills: 1, trees: 6 });
    isleAt(31, 290, 4, { radius: 9, seed: 7, cottages: 2, windmills: 0, trees: 4 });
    isleAt(45, 220, -16, { radius: 8, seed: 9, cottages: 2, windmills: 1, trees: 3, falls: false });
    isleAt(-22, 330, 30, { radius: 18, seed: 11, cottages: 5, windmills: 1, trees: 8 });
    // for the wide view
    const wf = farIsle({ radius: 22, seed: 13, cottages: 6, windmills: 1, trees: 8 }); wf.position.set(-190, 18, -230); scene.add(wf); far.push(wf); town.add(wf);
    const wg = farIsle({ radius: 12, seed: 15, cottages: 3, windmills: 1, trees: 5 }); wg.position.set(-60, -6, -260); scene.add(wg); far.push(wg); town.add(wg);
    scene.add(clouds.build());
  }

  // ---------------------------------------------------------------- the village
  const placeAt = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); town.add(o); return o; };
  const place = (o: THREE.Object3D, x: number, z: number, ry = 0, dy = 0) => placeAt(o, x, ground(x, z) + dy, z, ry);
  const face = (from: THREE.Vector3, tx: number, tz: number) => Math.atan2(tx - from.x, tz - from.z);
  // the lanes
  const laneMain = pavedPath([new THREE.Vector3(-2.0, 0, 24), new THREE.Vector3(-1.6, 0, 12), new THREE.Vector3(-1.2, 0, 5.5), new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.6, 0, -5), new THREE.Vector3(0.6, 0, -10), new THREE.Vector3(-0.2, 0, -16), new THREE.Vector3(0.4, 0, -22)], 1.8, 4, ground);
  const laneBridge = pavedPath([new THREE.Vector3(0.5, 0, -4.2), new THREE.Vector3(4.5, 0, -5.4), new THREE.Vector3(7.4, 0, -6.4)], 1.3, 9, ground);
  const laneCliff = pavedPath([new THREE.Vector3(11.5, 0, -6.8), new THREE.Vector3(12.0, 0, -11), new THREE.Vector3(11.4, 0, -18.5)], 1.3, 12, ground);
  const lanes = [laneMain, laneBridge, laneCliff];
  for (const l of lanes) scene.add(l);
  const pathDist = (x: number, z: number) => Math.min(...lanes.map(l => (l.userData.dist as (x: number, z: number) => number)(x, z)));

  // cottage A on its terrace, door three-quarters to the lane, steps down to the flagstones
  const cA = placeAt(roundCottage({ seed: 3, radius: 2.4, chimes: true, windows: 3, upperWindows: 3, hydrangea: null }), A.x, TER.h, A.z, face(A, -1.0, 7.0));
  const doorDir = new THREE.Vector3(Math.sin(cA.rotation.y), 0, Math.cos(cA.rotation.y));
  const side = new THREE.Vector3(doorDir.z, 0, -doorDir.x);
  const doorPos = cA.position.clone().addScaledVector(doorDir, 2.4 + 0.6);
  {
    const steps = stoneSteps(3, 1.7, 3, 0.17, 0.42);
    const base = A.clone().addScaledVector(doorDir, TER.r1 + 1.15);
    steps.position.set(base.x, ground(base.x, base.z) - 0.02, base.z); steps.rotation.y = cA.rotation.y + Math.PI;
    scene.add(steps);
    // the retaining wall round the terrace, broken for the steps
    const ring = (a0: number, a1: number, seed: number) => {
      const n = Math.max(1, Math.round(Math.abs(a1 - a0) / 0.32));
      for (let i = 0; i < n; i++) {
        const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
        const p0 = new THREE.Vector3(A.x + Math.sin(t0) * TER.r1, 0, A.z + Math.cos(t0) * TER.r1), p1 = new THREE.Vector3(A.x + Math.sin(t1) * TER.r1, 0, A.z + Math.cos(t1) * TER.r1);
        let a = p0, b = p1; const mid = a.clone().add(b).multiplyScalar(0.5);
        const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
        if (Math.sin(ry) * (mid.x - A.x) + Math.cos(ry) * (mid.z - A.z) < 0) { a = p1; b = p0; }
        const ry2 = Math.atan2(-(b.z - a.z), b.x - a.x);
        const w = stoneWall(a.distanceTo(b) + 0.12, { seed: seed + i, height: 0.82, depth: 0.42 });
        w.position.set(a.x, Math.min(ground(a.x, a.z), ground(b.x, b.z)) - 0.05, a.z); w.rotation.y = ry2;
        scene.add(w);
      }
    };
    const da = cA.rotation.y;
    ring(da + 0.27, da + 1.9, 10); ring(da - 0.27, da - 1.5, 30);
    // hydrangea planters on the terrace either side of the steps, a lavender box by the lane
    const tp = (k: number, s: number) => A.clone().addScaledVector(doorDir, TER.r0 - 0.45).addScaledVector(side, s * k);
    const h1 = tp(1.25, 1), h2 = tp(1.3, -1);
    place(flowerPlanter('hydrangea', 1, { width: 1.0 }), h1.x, h1.z, cA.rotation.y, 0);
    place(flowerPlanter('hydrangea', 6, { width: 0.9 }), h2.x, h2.z, cA.rotation.y, 0);
  }
  // the cluster up the lane: doors to the lane
  const cot = (o: Parameters<typeof roundCottage>[0], x: number, z: number, lx: number, lz: number) => { const c = roundCottage(o); const p = new THREE.Vector3(x, 0, z); return place(c, x, z, face(p, lx, lz)); };
  const cB = cot({ seed: 11, radius: 2.2, shutter: '#c8794a', vane: true, chimes: true }, -4.6, -6.6, 0.6, -5.2);
  const cC = cot({ seed: 19, radius: 2.1, shutter: '#5d84b4', chimes: true }, 5.0, -9.6, 0.6, -9.0);
  const cD = cot({ seed: 27, radius: 2.0, windows: 2, upperWindows: 2, chimes: false }, -4.2, -14.6, -0.2, -14);
  const cE = cot({ seed: 31, radius: 1.9, windows: 2, upperWindows: 2, shutter: '#7fa36a', chimes: false }, 4.6, -17.6, 0.0, -17);
  const cF = cot({ seed: 37, radius: 1.8, chimes: false, upperWindows: 2 }, -10.6, -9.2, -4, -4);
  const cH = cot({ seed: 43, radius: 1.8, chimes: false, upperWindows: 2, windows: 2 }, -1.6, -23.2, 0.4, -18);
  const cottages = [cA, cB, cC, cD, cE, cF, cH];
  // windmills on the rise behind
  const wm1 = place(windmill({ seed: 5, height: 10 }), -7.8, -26, 0.5);
  place(windmill({ seed: 9, height: 8.6, gallery: false, speed: 0.4 }), 7.0, -30, -0.35);
  place(windmill({ seed: 13, height: 7.5, gallery: false, speed: 0.7 }), -15, -35, 0.75);
  // laundry in the side yard between A and B
  place(laundryLine(5.4, 3), -10.2, -0.9, 0.22);
  // the market stall at the bend
  const stallP = new THREE.Vector3(3.3, 0, -2.0);
  const stall = place(awningStall({ seed: 2 }), stallP.x, stallP.z, face(stallP, -0.6, 2.2));
  // the bridge over the stream
  const bridgeAt = new THREE.Vector3(9.45, 0, -6.6);
  place(footBridge(4.4), bridgeAt.x, bridgeAt.z, Math.atan2(-0.05, 1) + 0.05, -0.15);
  // fences: down the right of the lane in the foreground, along the cliff path
  const fenceRun = (pts: [number, number][], seed: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      const f = fence(len, { seed: seed + i, heightAt: (x) => ground(x0 + (x1 - x0) * x / len, z0 + (z1 - z0) * x / len) - ground(x0, z0) });
      place(f, x0, z0, ry);
    }
  };
  // the fence from the foreground down to the bridge, between the lane and the stream meadow; along the cliff path;
  // and along the top of the promontory past the falls
  const fenceA: [number, number][] = [[0.4, 13.5], [0.9, 7.5], [2.4, 2.6], [4.9, -1.2], [6.8, -4.6]];
  fenceRun(fenceA, 2);
  const fenceB: [number, number][] = [[13.4, -5.6], [13.6, -12], [13.0, -19]];
  fenceRun(fenceB, 7);
  const fenceC: [number, number][] = [[12.7, 3.6], [12.9, 0.6], [14.4, -1.9]];
  fenceRun(fenceC, 11);
  // low stone walls and hedges between the buildings
  const wall = (x0: number, z0: number, x1: number, z1: number, seed: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), w = stoneWall(len, { seed, heightAt: (x) => ground(x0 + (x1 - x0) * x / len, z0 + (z1 - z0) * x / len) - ground(x0, z0) });
    place(w, x0, z0, Math.atan2(-(z1 - z0), x1 - x0));
  };
  wall(-2.3, -9.2, -2.0, -11.8, 3); wall(2.0, -12.6, 1.6, -15.2, 5); wall(2.2, -4.3, 2.6, -7.6, 8);
  const hedgeAt = (x0: number, z0: number, x1: number, z1: number, seed: number, blossom: string | null = null) => {
    const len = Math.hypot(x1 - x0, z1 - z0); place(hedge(len, { seed, height: 0.95, blossom }), x0, z0, Math.atan2(-(z1 - z0), x1 - x0));
  };
  hedgeAt(-7.4, -11.0, -6.4, -12.4, 1, '#ffffff'); hedgeAt(7.6, -12.8, 7.2, -15.0, 2); hedgeAt(-2.8, -18.2, -2.4, -20.6, 3, '#f6b8cc'); hedgeAt(-14, -3.8, -12.8, -6.2, 4);
  // trees between and behind the buildings
  const trees: [number, number, number, number][] = [[-11.2, 1.0, 8.4, 1], [-9.6, -16.2, 7, 2], [7.0, -13.4, 5.6, 3], [-2.6, -28.5, 7, 4], [12.0, -25, 6, 5], [-14.5, -19.5, 8, 6], [3.8, -25.0, 6.4, 7], [-13.6, -5.5, 6.4, 8], [-17, 6, 7.5, 9], [-20, -6, 7, 10], [-23, 3, 8, 11], [-22, -14, 7.5, 12], [-18.5, -28, 8, 13]];
  for (const [x, z, h, s] of trees) place(townTree({ seed: s, height: h }), x, z, r() * 6, -0.05);
  // the race gate at the start line by the cliff edge, ring across the racers' line (they fly off along +X)
  const gate = place(raceGate({ seed: 4 }), 10.6, -21.5, Math.PI / 2);
  // clutter at the doors and along the lane: barrels, crates, sacks, pots
  {
    const k = new Kit(), kr = rng(21);
    const at = (c: THREE.Object3D, a: number, d: number) => { const ang = c.rotation.y + a, R = (c.userData.wallRadius ?? 2) + d; return new THREE.Vector3(c.position.x + Math.sin(ang) * R, 0, c.position.z + Math.cos(ang) * R); };
    const put = (p: THREE.Vector3, f: (m: THREE.Matrix4) => void) => f(T(p.x, ground(p.x, p.z), p.z, 0, kr() * 6, 0));
    for (const [c, sgn] of [[cB, 1], [cC, -1], [cD, 1], [cE, -1]] as const) {
      put(at(c, sgn * 0.62, 0.45), m => addBarrel(k, m, kr));
      put(at(c, sgn * 0.8, 0.4), m => addBarrel(k, m, kr, 0.7, 0.26));
      put(at(c, -sgn * 0.6, 0.35), m => addPot(k, m, kr, 0.17, [pick(kr, ['#f07aa0', '#ffffff', '#f2d23d', '#e0473b'])]));
      put(at(c, -sgn * 0.72, 0.3), m => addPot(k, m, kr, 0.13, [pick(kr, ['#b48ae0', '#f6a6c0'])]));
      put(at(c, sgn * 0.45, 0.55), m => addCrate(k, m, kr, 0.5, 0.38, 0.3, kr() > 0.5 ? '#d8443a' : undefined));
    }
    put(new THREE.Vector3(-2.6, 0, 1.6), m => addSack(k, m, kr, 0.5));
    put(new THREE.Vector3(-2.3, 0, 1.0), m => addPot(k, m, kr, 0.18, ['#f07aa0']));
    put(new THREE.Vector3(2.0, 0, -12.0), m => addBarrel(k, m, kr));
    const g = new THREE.Group(); g.name = 'clutter'; k.build(g, { inkWidth: 0.016 }); scene.add(g);
  }
  // bunting: small pennants on deep swags between the roofs, across the lane
  const eave = (c: THREE.Object3D, a: number, dy = 0) => { const ang = c.rotation.y + a, R = c.userData.radius - 0.25; return new THREE.Vector3(c.position.x + Math.sin(ang) * R, c.position.y + c.userData.eaveY + dy, c.position.z + Math.cos(ang) * R); };
  const pole = (x: number, z: number, h: number) => { const k = new Kit(); k.add(new THREE.CylinderGeometry(0.05, 0.07, h, 6), 'wood', SAIL.weathered, T(0, h / 2, 0)); k.add(new THREE.SphereGeometry(0.08, 8, 6), 'brass', SAIL.brass, T(0, h + 0.05, 0)); const g = k.build(); place(g, x, z); return new THREE.Vector3(x, ground(x, z) + h - 0.1, z); };
  const p1 = pole(2.3, 2.0, 4.6), p2 = pole(2.6, -6.6, 4.8);
  scene.add(bunting([eave(cA, 0.9, 0.1), p1, eave(cC, 0.5, 0.2)], 3));
  scene.add(bunting([eave(cB, 0.3, 0.2), p2, eave(cC, -0.3, 0.1)], 8));
  scene.add(bunting([eave(cB, -0.4, 0.1), eave(cD, 0.2, 0.1)], 12));
  scene.add(bunting([eave(cD, 0.4, 0.2), eave(cE, -0.3, 0.2)], 14));
  scene.add(bunting([eave(cA, 1.6, 0.0), new THREE.Vector3(-3.8, ground(-3.8, -1) + 2.6, -1), eave(cB, 1.0, 0.0)], 16));

  // ---------------------------------------------------------------- meadow, beds and flowers
  const field = new FloraField();
  const footprints: [THREE.Object3D, number][] = cottages.map(c => [c, c.userData.wallRadius + 0.12]);
  const segDist = (pts: [number, number][], x: number, z: number) => {
    let d = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return d;
  };
  const camFocus = new THREE.Vector3(0, 0, 0);
  // the doorsteps stay clear
  const doors = cottages.map(c => (c.userData.door as THREE.Vector3).clone().setZ((c.userData.door as THREE.Vector3).z - 0.25).applyMatrix4(c.matrixWorld.compose(c.position, c.quaternion, c.scale)));
  const density = (x: number, z: number) => {
    if (rimD(x, z) > -0.25) return 0;
    if (distStream(x, z) < 1.15) return 0;
    const pd = pathDist(x, z);
    if (pd < -0.02) return 0;
    let k = 1;
    for (const [c, rad] of footprints) { const d = Math.hypot(c.position.x - x, c.position.z - z) - rad; if (d < 0) return 0; if (d < 0.7) k = Math.max(k, 2.2); }
    if (Math.hypot(x - stall.position.x, z - stall.position.z) < 1.7) return 0;
    for (const d of doors) if (Math.hypot(d.x - x, d.z - z) < 0.95) return 0;
    if (Math.abs(x - bridgeAt.x) < 2.8 && Math.abs(z - bridgeAt.z) < 1.1) return 0;
    if (pd < 0.5) k = Math.max(k, 2.6);
    if (segDist(fenceA, x, z) < 0.6 || segDist(fenceB, x, z) < 0.6) k = Math.max(k, 2.2);
    if (distStream(x, z) < 1.9) k = Math.max(k, 2.0);
    // spend the budget near the village, thinner far out
    const far = Math.hypot(x - camFocus.x, z - camFocus.z);
    return k * (far < 16 ? 1.35 : far > 26 ? Math.max(0.35, 1 - (far - 26) / 20) : 1);
  };
  meadow(field, { bounds: [-30, -46, 17.5, 28.5], heightAt: ground, density, grass: 6, cover: 1.6, flowers: 0.35, seed: 5 });
  // grass and clover spilling over the lane borders and filling the missing stones
  {
    const fr = rng(17);
    for (const l of lanes) {
      for (const e of l.userData.edges as { p: THREE.Vector3; n: THREE.Vector3 }[]) {
        if (density(e.p.x + e.n.x * 0.4, e.p.z + e.n.z * 0.4) <= 0) continue;
        for (let i = 0; i < 2; i++) {
          const k = -0.12 + fr() * 0.35, x = e.p.x + e.n.x * k + (fr() - 0.5) * 0.15, z = e.p.z + e.n.z * k + (fr() - 0.5) * 0.15;
          field.add(fr() < 0.6 ? 'grass' : 'clover', x, ground(x, z) + 0.04, z, 0.8 + fr() * 0.6, fr() * 6, GRASS.mid.clone().lerp(GRASS.warm, fr() * 0.7));
        }
        if (fr() < 0.12) { const kind = pick(fr, ['daisy', 'buttercup', 'alyssum'] as const); field.add(kind, e.p.x + e.n.x * 0.15, ground(e.p.x, e.p.z), e.p.z + e.n.z * 0.15, 0.7 + fr() * 0.3, fr() * 6, new THREE.Color(pick(fr, PETALS[kind]))); }
      }
      for (const h of l.userData.holes as THREE.Vector3[]) for (let i = 0; i < 4; i++) field.add(i % 2 ? 'clover' : 'grass', h.x + (fr() - 0.5) * 0.3, ground(h.x, h.z) + 0.02, h.z + (fr() - 0.5) * 0.3, 0.7 + fr() * 0.4, fr() * 6, GRASS.mid.clone());
    }
  }
  // deep beds: along the fence (both sides), at the foot of the terrace wall, by the stall and the walls up the lane
  const keepBed = (x: number, z: number) => density(x, z) > 0 && pathDist(x, z) > 0.12;
  const toV = (pts: [number, number][]) => pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  flowerBed(field, { line: toV(fenceA), depth: 2.2, side: -1, height: 1.15, heightAt: ground, keep: keepBed, seed: 3, density: 13, mix: { daisy: 3, coreopsis: 2.5, lavender: 2.5, cosmos: 1.4, buttercup: 1 } });
  flowerBed(field, { line: toV(fenceA.slice(0, 3)), depth: 0.7, side: 1, height: 0.85, heightAt: ground, keep: keepBed, seed: 4, density: 11, mounds: false, mix: { daisy: 2, lavender: 1.5, alyssum: 1, cosmos: 1 } });
  {
    const da = cA.rotation.y, arc: THREE.Vector3[] = [];
    for (let a = da + 0.45; a < da + 1.9; a += 0.15) arc.push(new THREE.Vector3(A.x + Math.sin(a) * (TER.r1 + 0.3), 0, A.z + Math.cos(a) * (TER.r1 + 0.3)));
    flowerBed(field, { line: arc, depth: 1.0, side: 1, height: 0.9, heightAt: ground, keep: keepBed, seed: 6, density: 12, mix: { cosmos: 2, daisy: 2, lavender: 1.5, alyssum: 1 } });
    // flowers on the terrace round the cottage foot
    const ring: THREE.Vector3[] = [];
    for (let a = da + 0.5; a < da + 2.6; a += 0.15) ring.push(new THREE.Vector3(A.x + Math.sin(a) * 2.5, 0, A.z + Math.cos(a) * 2.5));
    flowerBed(field, { line: ring, depth: 0.7, side: -1, height: 0.85, heightAt: ground, keep: (x, z) => Math.hypot(x - A.x, z - A.z) < TER.r0 - 0.15, seed: 7, density: 12, mounds: false, mix: { cosmos: 1.5, daisy: 2, buttercup: 1 } });
  }
  flowerBed(field, { line: toV([[-2.6, 12], [-2.4, 7.8]]), depth: 1.6, side: 1, height: 1.0, heightAt: ground, keep: keepBed, seed: 8, density: 13, mix: { daisy: 3, cosmos: 2, coreopsis: 1, lavender: 1 } });
  flowerBed(field, { line: toV([[-2.4, -9.0], [-2.1, -12.0]]), depth: 0.9, side: -1, height: 0.8, heightAt: ground, keep: keepBed, seed: 9, density: 10 });
  flowerBed(field, { line: toV([[2.4, -4.0], [2.8, -7.8]]), depth: 0.9, side: 1, height: 0.8, heightAt: ground, keep: keepBed, seed: 10, density: 10, mix: { lavender: 2, coreopsis: 1.5 } });
  flowerBed(field, { line: toV([[12.8, -6], [13.0, -18]]), depth: 1.2, side: -1, height: 0.8, heightAt: ground, keep: keepBed, seed: 11, density: 9 });
  flowerBed(field, { line: toV(fenceC), depth: 1.6, side: -1, height: 0.9, heightAt: ground, keep: keepBed, seed: 12, density: 11, mix: { daisy: 2, lavender: 2, coreopsis: 1.5, cosmos: 1 } });
  // flowers crowding the lip in the foreground, as in picture 2 (lavender, daisies, cosmos tumbling to the edge)
  {
    const lipLine: THREE.Vector3[] = [];
    for (let a = isle.rim.angleOf(9.6, 6.2); a < isle.rim.angleOf(1.5, 24); a += 0.012) { const p = isle.rim.at(a), c = new THREE.Vector3(isle.rim.cx, 0, isle.rim.cz); lipLine.push(p.lerp(c, 0.035)); }
    flowerBed(field, { line: lipLine, depth: 2.6, side: 1, height: 1.0, heightAt: ground, keep: keepBed, seed: 13, density: 12, mix: { lavender: 2.5, daisy: 3, cosmos: 1.5, coreopsis: 1.2, alyssum: 1 } });
  }
  const flora = field.build(undefined, { sortFrom: V, fade: [14, 30] });
  scene.add(flora);

  // ---------------------------------------------------------------- stats
  const st = (o: THREE.Object3D) => { const p = propStats(o); return `${p.draws}+${p.inkDraws} ink draws, ${(p.tris / 1000).toFixed(1)}k+${(p.inkTris / 1000).toFixed(1)}k ink tris`; };
  const all = new THREE.Group(); all.children = scene.children.slice();
  console.log(`[sailtown] scene: ${st(all)}`);
  console.log(`[sailtown] cottage A: ${st(cA)} | cottage D: ${st(cD)} | windmill: ${st(wm1)} | stall: ${st(stall)} | gate: ${st(gate)} | lane: ${st(laneMain)} | flora: ${st(flora)}`);
  for (const im of flora.children) if ((im as THREE.InstancedMesh).isInstancedMesh) console.log(`[sailtown]   ${im.name}: ${(im as THREE.InstancedMesh).count} x ${((im as THREE.Mesh).geometry.index!.count / 3)} tris`);

  const ringAt = params.get('ring') ? 0.5 : -1;
  let rung = false;
  const doorCam = (dist: number, up: number, sideK: number): [number, number, number] => {
    const p = doorPos.clone().addScaledVector(doorDir, dist).addScaledVector(side, sideK); return [p.x, cA.position.y + up, p.z];
  };
  const wmDir = new THREE.Vector3(Math.sin(wm1.rotation.y), 0, Math.cos(wm1.rotation.y));
  const wmCam = wm1.position.clone().addScaledVector(wmDir, 13).add(new THREE.Vector3(3.0, 6.0, 0));
  const gp = gate.position;
  return {
    update(dt, t) {
      if (ringAt >= 0 && !rung && t > ringAt) { rung = true; for (const c of town.chimes) c.ring(2); }
      fallTex.offset.y += dt * 1.4;
      town.update(dt, t);
      clouds.update(ctx.camera);
    },
    views: {
      village: { pos: [V.x, V.y, V.z], look: [VL.x, VL.y, VL.z], fov: 55 },
      door: { pos: doorCam(3.4, 1.55, 1.4), look: [doorPos.x + side.x * 0.2, cA.position.y + 1.5, doorPos.z + side.z * 0.2], fov: 46 },
      windmill: { pos: [wmCam.x, wmCam.y, wmCam.z], look: [wm1.position.x, wm1.position.y + 7.0, wm1.position.z], fov: 55 },
      yard: { pos: [-8.4, 1.55, -5.9], look: [-7.2, 1.35, -1.0], fov: 58 },
      wide: { pos: [27, 12, 20], look: [-1, 1, -9], fov: 50 },
      gate: { pos: [gp.x - 6.5, gp.y + 7.0, gp.z + 8.0], look: [gp.x - 0.5, gp.y + 7.2, gp.z], fov: 50 },
      stall: { pos: [stall.position.x - 3.0, stall.position.y + 1.7, stall.position.z + 4.0], look: [stall.position.x, stall.position.y + 1.0, stall.position.z], fov: 50 },
    },
  };
}
