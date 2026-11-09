import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { paint, softRamp, PAINT } from '../../../render/paint';
import {
  TownAnimator, roundCottage, windmill, laundryLine, bunting, awningStall, footBridge, fence, flowerPlanter,
  raceGate, stoneSteps, stoneWall, pavedPath, addBarrel, addCrate, addPot, addSack, propStats, SAIL, SAILTOWN_LIGHT,
  FloraField, meadow, flowerBed, townTree, hedge, PETALS, GRASS,
} from '../sailtown';
import { Kit, T, rng, pick, chainCompile } from '../sailtownKit';
import { vnoise } from '../sailtownFlora';

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

  // ---------------------------------------------------------------- the ground (lab stand-in)
  const EDGE = (z: number) => 15.5 + Math.sin(z * 0.13) * 2.0 + Math.sin(z * 0.41 + 1) * 0.7;   // cliff edge x
  const stream = [new THREE.Vector3(5, 0, -36), new THREE.Vector3(8.4, 0, -22), new THREE.Vector3(9.0, 0, -12), new THREE.Vector3(9.5, 0, -4.5), new THREE.Vector3(11.6, 0, 2.2), new THREE.Vector3(17, 0, 5.6)];
  const streamCurve = new THREE.CatmullRomCurve3(stream);
  const streamPts = streamCurve.getSpacedPoints(120);
  const distStream = (x: number, z: number) => { let d = 1e9; for (const p of streamPts) { const dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < d) d = dd; } return Math.sqrt(d); };
  const A = new THREE.Vector3(-6.4, 0, 3.4);   // the raised foreground cottage
  const TER = { r0: 3.35, r1: 3.75, h: 0.5 };
  const hills = (x: number, z: number) => Math.max(0, (-z - 17) * 0.13) + Math.max(0, (-x - 12) * 0.09) + Math.sin(x * 0.21) * Math.sin(z * 0.17) * 0.18;
  const ground = (x: number, z: number) => {
    let h = hills(x, z);
    const dA = Math.hypot(x - A.x, z - A.z);
    if (dA < TER.r1) h += TER.h * Math.min(1, (TER.r1 - dA) / (TER.r1 - TER.r0));
    const ds = distStream(x, z);
    if (ds < 1.7) h -= 0.5 * (1 - (ds / 1.7) ** 2);
    return h;
  };
  const groundTex = (() => {
    // painted meadow marks: blade strokes and leaf dots in soft greys, to break up the ground under the tufts
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d')!;
    const rr = rng(3);
    x.fillStyle = '#ececec'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) { const v = 0.78 + rr() * 0.3; x.strokeStyle = `rgba(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0},0.7)`; x.lineWidth = 2 + rr() * 2; const px = rr() * S, py = rr() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rr() - 0.5) * 8, py - 6 - rr() * 10); x.stroke(); }
    for (let i = 0; i < 600; i++) { const v = 0.82 + rr() * 0.25; x.fillStyle = `rgba(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0},0.8)`; x.beginPath(); x.arc(rr() * S, rr() * S, 2 + rr() * 4, 0, 6.3); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  })();
  {
    const N = 150, S = 96;
    const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2).translate(-4, 0, -12);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(p.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = Math.min(p.getX(i), EDGE(p.getZ(i)) + 0.4), z = p.getZ(i);
      p.setX(i, x);
      p.setY(i, ground(x, z) - (x > EDGE(z) ? 0.6 : 0));
      // the ground under the grass: warm in the open, cooler in the hollows, a little earthier by paths and walls
      const t = vnoise(x * 0.09, z * 0.09, 0.37) * 0.75 + vnoise(x * 0.5, z * 0.5, 3.37) * 0.25;
      tmp.copy(GRASS.cool).lerp(GRASS.mid, Math.min(1, t * 1.6)).lerp(GRASS.warm, Math.max(0, t * 1.6 - 0.6)).multiplyScalar(0.97);
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), map: groundTex }), { variation: 0.9 });
    chainCompile(mat, 'labGround', (s) => {
      // the texture in world space, two scales, so it never shows a grid
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `
        vec4 gT = texture2D(map, vPWorld.xz / 1.7) * texture2D(map, vPWorld.xz / 6.3 + 0.37);
        diffuseColor.rgb *= gT.rgb * 1.16;`);
    });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // the cliff below the edge: layered cream and pale-gold rock, mossy at the lip, with bulges and ledges
  {
    const nz = 120, ny = 40, z0 = -48, z1 = 22, depth = 46;
    const pos: number[] = [], cl: number[] = [], idx: number[] = [];
    const cream = new THREE.Color('#efe2c4'), gold = new THREE.Color('#dcc08e'), shadow = new THREE.Color('#b99c76'), moss = new THREE.Color('#8aa05a');
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nz; i++) {
      const z = z0 + (z1 - z0) * (i / nz), t = j / ny, y = -0.4 - Math.pow(t, 1.15) * depth;
      const bulge = (vnoise(z * 0.25, y * 0.18, 5) - 0.5) * 2.2 + (vnoise(z * 0.8, y * 0.5, 9) - 0.5) * 0.8;
      const taper = -t * t * 9;   // the island narrows beneath
      const x = EDGE(z) + 0.3 + bulge + taper + Math.max(0, 0.6 - t * 8) * 0.4;
      pos.push(x, y, z);
      const band = 0.5 + 0.5 * Math.sin(y * 1.6 + vnoise(z * 0.3, y * 0.2, 2) * 3);
      const c = cream.clone().lerp(gold, band * 0.7).lerp(shadow, Math.max(0, vnoise(z * 1.2, y * 0.15, 4) - 0.6) * 1.6);
      if (t < 0.05) c.lerp(moss, 0.6 - t * 10);
      else if (vnoise(z * 0.4, y * 0.9, 8) > 0.72) c.lerp(moss, 0.45);   // green ledges
      cl.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) { const a = j * (nz + 1) + i, b = a + 1, c = a + nz + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.9 }));
    m.receiveShadow = true;
    scene.add(m);
  }
  // the stream down its channel, and the fall over the edge with scrolling streaks
  const fallTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d')!;
    const rr = rng(5);
    x.fillStyle = '#d8ecf6'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.4 + rr() * 0.5})`; const px = rr() * 128, w = 3 + rr() * 9; x.fillRect(px, 0, w, 256); }
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(150,196,222,${0.3 + rr() * 0.3})`; x.fillRect(rr() * 128, 0, 2 + rr() * 3, 256); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const pts = streamCurve.getSpacedPoints(80);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], tg = streamCurve.getTangentAt(i / (pts.length - 1)), sd = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
      const over = p.x - EDGE(p.z);
      if (over > 0.6) break;
      const y = hills(p.x, p.z) - 0.28;
      for (const s of [-1, 1]) { const q = p.clone().addScaledVector(sd, s * 1.05); pos.push(q.x, y, q.z); uv.push(s * 0.5 + 0.5, i * 0.4); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const st = fallTex.clone(); st.repeat.set(1, 0.25); st.needsUpdate = true;
    const wm = new THREE.Mesh(wg, paint(new THREE.MeshToonMaterial({ color: '#a8d6ee', map: st, emissive: '#6aa8cc', emissiveIntensity: 0.3, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.3, rim: 2 }));
    scene.add(wm);
    // the fall: a ribbon arcing out from the lip and down
    const ez = 5.0, ex = EDGE(ez) + 0.2;
    const fp: number[] = [], fu: number[] = [], fi: number[] = [];
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -0.3 - t * 44, x = ex - 0.3 + Math.sqrt(t) * 1.4, w = 0.9 + t * 1.2;
      for (const s of [-1, 1]) { fp.push(x, y, ez + s * w); fu.push(s * 0.5 + 0.5, t * 6); }
      if (i) { const a = (i - 1) * 2; fi.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setIndex(fi); fg.computeVertexNormals();
    const fall = new THREE.Mesh(fg, paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: fallTex, emissive: '#cfe8f4', emissiveIntensity: 0.55, gradientMap: softRamp(), side: THREE.DoubleSide }), { rim: 2, noCloud: true }));
    scene.add(fall);
    fallTex.userData.scroll = true;
  }
  // the cloud sea below and cumulus heaped beyond the edge (lab stand-in for the sky builder's clouds)
  const cloudMat = paint(new THREE.MeshToonMaterial({ color: '#fdf8ee', emissive: '#e8e2da', emissiveIntensity: 0.42, gradientMap: softRamp() }), { variation: 0.15, rim: 1.6, noCloud: true });
  {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mats: THREE.Matrix4[] = [];
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion();
    const cumulus = (cx: number, cy: number, cz: number, s: number, rr: () => number) => {
      // a cauliflower: a flat-bottomed base of big puffs, smaller ones heaped toward the top
      for (let k = 0; k < 16; k++) {
        const lvl = k / 16, a = rr() * Math.PI * 2, d = (1 - lvl * 0.7) * s * 1.3 * Math.sqrt(rr());
        const ps = s * (0.75 - lvl * 0.35) * (0.7 + rr() * 0.5);
        mats.push(mm.compose(new THREE.Vector3(cx + Math.cos(a) * d, cy + lvl * s * 1.3 + ps * 0.25, cz + Math.sin(a) * d * 0.7), q, new THREE.Vector3(ps * 1.25, ps * 0.85, ps)).clone());
      }
    };
    const rc = rng(11);
    for (let i = 0; i < 26; i++) { const a = -1.3 + rc() * 2.6, d = 70 + rc() * 230; cumulus(22 + Math.cos(a) * d, -40 + rc() * 20 - d * 0.04, -12 + Math.sin(a) * d, 9 + rc() * 14, rc); }
    for (let i = 0; i < 46; i++) { const a = -1.4 + rc() * 2.8, d = 30 + rc() * 220; cumulus(18 + Math.cos(a) * d, -52 + rc() * 6, -10 + Math.sin(a) * d, 10 + rc() * 10, rc); }
    // towering cumulus far off beyond the edge, rising above the horizon like the pictures'
    for (let i = 0; i < 9; i++) { const a = -0.9 + rc() * 1.9, d = 230 + rc() * 120; const s = 22 + rc() * 18; cumulus(20 + Math.cos(a) * d, -30 + rc() * 25, -10 + Math.sin(a) * d, s, rc); cumulus(20 + Math.cos(a) * d + s * 0.6, -30 + s * 1.2, -10 + Math.sin(a) * d, s * 0.75, rc); }
    const im = new THREE.InstancedMesh(geo, cloudMat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.userData.noOutline = true;
    scene.add(im);
    // a few far islands for depth: ragged rock under a green crown with a cottage or two, faded by the haze
    const rockM = paint(new THREE.MeshToonMaterial({ color: '#eadcbc', gradientMap: softRamp(), vertexColors: true }), { variation: 0.7 });
    const topM = paint(new THREE.MeshToonMaterial({ color: '#9cba64', gradientMap: softRamp() }), { variation: 0.6 });
    const wallM = paint(new THREE.MeshToonMaterial({ color: '#f4e8d0', gradientMap: softRamp() }), { variation: 0.3 });
    const roofM = paint(new THREE.MeshToonMaterial({ color: '#56739f', gradientMap: softRamp() }), { variation: 0.3 });
    const ri = rng(41);
    for (const [x, y, z, s] of [[150, 6, -160, 20], [120, -10, 120, 12], [70, 18, -240, 26], [230, -2, -40, 15]] as const) {
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(s * (0.08 + 0.92 * Math.pow(t, 0.6)) * (0.9 + ri() * 0.2), -s * 2.0 * (1 - t))); }
      const rg = new THREE.LatheGeometry(prof, 11);
      const rp = rg.attributes.position as THREE.BufferAttribute, rcol = new Float32Array(rp.count * 3);
      for (let i = 0; i < rp.count; i++) { const k = 0.85 + 0.15 * Math.sin(rp.getY(i) * 0.9 / s * 6) + (ri() - 0.5) * 0.08; rcol.set([k, k * 0.97, k * 0.9], i * 3); rp.setX(i, rp.getX(i) * (0.92 + ri() * 0.16)); rp.setZ(i, rp.getZ(i) * (0.92 + ri() * 0.16)); }
      rg.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3)); rg.computeVertexNormals();
      const rock = new THREE.Mesh(rg, rockM); rock.position.set(x, y, z);
      const top = new THREE.Mesh(new THREE.SphereGeometry(s * 1.0, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), topM); top.position.set(x, y - 0.2, z); top.scale.y = 0.16;
      scene.add(rock, top);
      for (let k = 0; k < 3; k++) {
        const hx = x + (ri() - 0.5) * s * 0.9, hz = z + (ri() - 0.5) * s * 0.9, hs = s * 0.06;
        const w = new THREE.Mesh(new THREE.CylinderGeometry(hs, hs, hs * 1.6, 8), wallM); w.position.set(hx, y + s * 0.14 + hs * 0.8, hz);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(hs * 1.4, hs * 1.4, 8), roofM); rf.position.set(hx, y + s * 0.14 + hs * 2.3, hz);
        scene.add(w, rf);
      }
      for (let k = 0; k < 4; k++) { const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.09, 1), topM); tr.position.set(x + (ri() - 0.5) * s * 1.2, y + s * 0.2, z + (ri() - 0.5) * s * 1.2); tr.scale.y = 1.2; scene.add(tr); }
      cumulus(x - s * 0.3, y - s * 2.4, z + s * 0.5, s * 0.55, rc);
    }
  }

  // ---------------------------------------------------------------- the village
  const placeAt = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); town.add(o); return o; };
  const place = (o: THREE.Object3D, x: number, z: number, ry = 0, dy = 0) => placeAt(o, x, ground(x, z) + dy, z, ry);
  const face = (from: THREE.Vector3, tx: number, tz: number) => Math.atan2(tx - from.x, tz - from.z);
  // the lanes
  const laneMain = pavedPath([new THREE.Vector3(-1.6, 0, 12), new THREE.Vector3(-1.2, 0, 5.5), new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.6, 0, -5), new THREE.Vector3(0.6, 0, -10), new THREE.Vector3(-0.2, 0, -16), new THREE.Vector3(0.4, 0, -22)], 1.8, 4, ground);
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
  place(windmill({ seed: 13, height: 7.5, gallery: false, speed: 0.7 }), -19, -40, 0.75);
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
  const fenceA: [number, number][] = [[0.5, 11.5], [1.0, 5.5], [2.4, 1.4], [5.6, 0.4], [8.6, 0.6]];
  fenceRun(fenceA, 2);
  const fenceB: [number, number][] = [[13.4, -5.6], [13.6, -12], [13.0, -19]];
  fenceRun(fenceB, 7);
  fenceRun([[12.6, 3.2], [13.0, 9.5]], 11);
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
    if (x > EDGE(z) - 0.15) return 0;
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
  meadow(field, { bounds: [-24, -42, 16.5, 16], heightAt: ground, density, grass: 9, cover: 2.2, flowers: 0.35, seed: 5 });
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
  flowerBed(field, { line: toV([[9.2, 0.2], [11.6, 3.4], [12.6, 8]]), depth: 1.3, side: -1, height: 0.9, heightAt: ground, keep: keepBed, seed: 12, density: 11, mix: { daisy: 2, lavender: 2, coreopsis: 1.5, cosmos: 1 } });
  const flora = field.build();
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
    },
    views: {
      village: { pos: [-2.3, 1.85, 11.0], look: [2.4, 2.6, -6], fov: 55 },
      door: { pos: doorCam(3.4, 1.55, 1.4), look: [doorPos.x + side.x * 0.2, cA.position.y + 1.5, doorPos.z + side.z * 0.2], fov: 46 },
      windmill: { pos: [wmCam.x, wmCam.y, wmCam.z], look: [wm1.position.x, wm1.position.y + 7.0, wm1.position.z], fov: 55 },
      yard: { pos: [-8.4, 1.55, -5.9], look: [-7.2, 1.35, -1.0], fov: 58 },
      wide: { pos: [27, 12, 20], look: [-1, 1, -9], fov: 50 },
      gate: { pos: [gp.x - 9.5, gp.y + 4.5, gp.z + 9.5], look: [gp.x, gp.y + 7.5, gp.z], fov: 50 },
      stall: { pos: [stall.position.x - 3.0, stall.position.y + 1.7, stall.position.z + 4.0], look: [stall.position.x, stall.position.y + 1.0, stall.position.z], fov: 50 },
    },
  };
}
