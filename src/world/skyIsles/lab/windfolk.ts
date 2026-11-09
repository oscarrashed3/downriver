import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LabCtx, LabPiece } from './types';
import { makeWindfolk, Crowd, SKY_WIND, type Windfolk, type WindPose, type CrowdSpot } from '../windfolk';
import { mulberry, wob } from '../windRig';
import { Person } from '../../../player/person';
import { toon } from '../../props';
import { paint, softRamp } from '../../../render/paint';

// Lab: the windfolk on a sky-isle cliff top, a fence along the edge and the cloud sea below, floating isles about.
// Views: lineup (the five named windfolk), turnaround (Lark from four sides), lark / zephy (faces),
// crowd (packed two and more deep behind the fence on a stepped stone bank), wave (Lark's farewell, picture 4),
// glide (prone on kite-wings), walk, and closeups of wren / mender / chimer.
// Query: cheer=0..1 for the crowd (default pulses), pose=cheer|wave|glide to put the lineup in one pose.
//
// The far isles and the grass tufts and bushes are the shared Sky Isles island asset (src/world/skyIsles/island.ts)
// when it is in the tree (it is loaded through import.meta.glob, so this lab still builds without it).

/** The island's edge: a big round cliff top centred far behind the lineup; z of the edge at x. */
const IC = new THREE.Vector3(0, 0, 74), IR = 80;
const edgeZ = (x: number) => IC.z - Math.sqrt(IR * IR - x * x);

// ---- the shared island asset, if present
type Rng = () => number;
interface IslandMod { buildFloatingIsland(o: Record<string, unknown>): { group: THREE.Group; update(dt: number, t: number): void }; floatingRock(seed: number, size: number): THREE.Group }
interface FloraMod { islandBush(rng: Rng, scale?: number, flowering?: boolean): THREE.Group }
interface SprigMod { sprigMesh(list: { p: THREE.Vector3; up: THREE.Vector3; scale: number; col: THREE.Color }[], kind: 'tuft' | 'daisy' | 'spike', seed: number): THREE.Mesh | null; mergeByMaterial(root: THREE.Object3D, shadows?: boolean): THREE.Group }
const first = <T,>(m: Record<string, unknown>) => (Object.values(m)[0] as T | undefined);
const ISLAND = first<IslandMod>(import.meta.glob('../island.ts', { eager: true }));
const FLORA = first<FloraMod>(import.meta.glob('../islandFlora.ts', { eager: true }));
const SPRIG = first<SprigMod>(import.meta.glob('../islandDressing.ts', { eager: true }));

export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const people: { w: Windfolk; pose: (t: number) => WindPose; path?: (t: number, o: THREE.Object3D) => void }[] = [];
  const add = (w: Windfolk, x: number, z: number, yaw: number, pose: (t: number) => WindPose, y = 0) => {
    w.root.position.set(x, y, z); w.root.rotation.y = yaw; scene.add(w.root); people.push({ w, pose }); return w;
  };
  const linePose = params.get('pose');
  const still: (t: number) => WindPose = () => ({ speed: 0, grounded: true, cheer: linePose === 'cheer' ? 1 : 0, reach: linePose === 'wave' ? 1 : 0, glide: linePose === 'glide' ? 1 : 0 });

  const updaters: ((dt: number, t: number) => void)[] = [];
  buildIsland(scene, updaters);

  // ---- the lineup, backs to the cliff edge, a little staggered like people standing about
  const kinds = ['lark', 'zephy', 'wren', 'mender', 'chimer'] as const;
  const xs = [-2.3, -1.15, 0.0, 1.3, 2.65], zs = [0.1, -0.15, 0.25, -0.2, 0.05];
  kinds.forEach((k, i) => add(makeWindfolk(k), xs[i], zs[i], 0.32 - i * 0.07, still));

  // ---- Lark turnaround
  for (let i = 0; i < 4; i++) add(makeWindfolk('lark'), 30 + i * 1.5, 2, (i * Math.PI) / 2, () => ({ speed: 0, grounded: true }));

  // ---- the crowd, packed behind the fence on a stepped bank, the front row leaning on the rail
  const spots: CrowdSpot[] = [];
  const cx0 = -26, span = 9.0, rows = 4;
  const fenceOff = 0.45;
  for (let row = 0; row < rows; row++) {
    const n = Math.round(span / 0.47);
    for (let i = 0; i < n; i++) {
      const x = cx0 - span / 2 + (i + 0.5) * (span / n) + (row % 2) * 0.23 + Math.sin(i * 12.9 + row * 3.1) * 0.06;
      const ez = edgeZ(x) + fenceOff;
      const z = ez + 0.36 + row * 0.5 + Math.sin(i * 7.7 + row) * 0.05;
      const facing = Math.atan2(IC.x - x, IC.z - z) + Math.PI + 0.1 * Math.sin(i * 1.7 + row);
      spots.push({ pos: new THREE.Vector3(x, row * 0.3, z), facing, lean: row === 0 });
    }
  }
  const crowd = new Crowd(spots, 7);
  scene.add(crowd.root);
  buildBank(scene, cx0, span + 2, fenceOff, rows);
  const cheerQ = params.get('cheer');
  const cheerAt = (t: number) => cheerQ !== null ? Number(cheerQ) : (Math.sin(t * 0.5) > -0.6 ? 1 : 0);

  // ---- Lark's farewell wave at the fence on the cliff edge
  const wx = 14;
  const waveYaw = Math.PI - 0.55, waveF = new THREE.Vector3(Math.sin(waveYaw), 0, Math.cos(waveYaw));
  // the evening breeze comes up the cliff from the sky she faces, so the scarf and braids stream back past her shoulder
  const waveAir = waveF.clone().multiplyScalar(-9.5).add(new THREE.Vector3(Math.cos(waveYaw), 0, -Math.sin(waveYaw)).multiplyScalar(2.2)).setY(1.2);
  add(makeWindfolk('lark'), wx, edgeZ(wx) + 0.95, waveYaw, (t) => ({ speed: 0, grounded: true, reach: 1, reachSide: -1, smile: 1, air: waveAir.clone().multiplyScalar(1 + 0.25 * Math.sin(t * 1.7)) }));

  // ---- racers prone on stand-in kite-wings (the kites piece builds the real ones), hands on the bar by IK
  const fwd = new THREE.Vector3();
  for (const [kind, x, y, z, b] of [['zephy', 6.2, 1.7, -16, 0.1], ['lark', 9.6, 2.4, -19.5, -0.08]] as const) {
    const w = makeWindfolk(kind);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 2 + 0.15; scene.add(g);
    g.add(w.root);
    const wing = standInWing(kind === 'zephy' ? ['#e2643a', '#f2c040', '#f4ead8'] : ['#f2c040', '#8ac060', '#f4ead8']);
    g.add(wing);
    g.rotation.z = -b * 0.6;
    const air = new THREE.Vector3();
    const gl = new THREE.Vector3(), gr = new THREE.Vector3();
    people.push({ w, pose: (t) => {
      fwd.set(0, 0, 1).applyQuaternion(g.quaternion);
      air.copy(SKY_WIND).multiplyScalar(0.4).addScaledVector(fwd, -15); air.y += 2.0;
      g.position.y = y + Math.sin(t * 0.8 + x) * 0.12; g.rotation.x = Math.sin(t * 0.6 + x) * 0.03;
      g.updateMatrixWorld(true);
      g.localToWorld(gl.copy(BAR).setX(-BAR.x)); g.localToWorld(gr.copy(BAR));
      return { speed: 0, grounded: true, glide: 1, bank: b, air, smile: 1, grip: [gl, gr] };
    } });
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
  console.log(`[windfolk] crowd: ${spots.length} people, ${crowd.triangles} triangles, 2 draw calls (+ shadow)`);
  console.log(`[windfolk] island asset: ${ISLAND ? 'yes' : 'no (fallback scenery)'}`);

  const ez0 = edgeZ(cx0);
  return {
    update(dt, t) {
      for (const p of people) {
        if (p.path) p.path(t, p.w.root);
        p.w.animate(dt, p.pose(t));
      }
      crowd.update(dt, t, cheerAt(t));
      for (const u of updaters) u(dt, t);
    },
    views: {
      lineup: { pos: [1.2, 1.12, 5.4], look: [0.15, 0.78, 0], fov: 38 },
      turnaround: { pos: [32.25, 1.0, 6.9], look: [32.25, 0.6, 2], fov: 36 },
      lark: { pos: [-2.12, 1.04, 1.05], look: [-2.3, 0.98, 0.1], fov: 26 },
      zephy: { pos: [-0.95, 1.05, 1.25], look: [-1.15, 0.98, -0.15], fov: 26 },
      wren: { pos: [0.15, 1.05, 1.3], look: [0.0, 0.85, 0.25], fov: 30 },
      mender: { pos: [1.5, 1.85, 1.6], look: [1.3, 1.62, -0.2], fov: 30 },
      chimer: { pos: [2.8, 1.6, 1.4], look: [2.65, 1.4, 0.05], fov: 30 },
      crowd: { pos: [cx0 + 4.2, 2.1, ez0 - 4.6], look: [cx0 - 0.8, 1.05, ez0 + 1.2], fov: 42 },
            crowdClose: { pos: [cx0 + 1.6, 1.45, ez0 - 1.9], look: [cx0 - 0.4, 1.05, ez0 + 1.0], fov: 40 },
      wave: { pos: [wx + 0.1, 1.25, edgeZ(wx) + 4.3], look: [wx + 1.5, 1.35, edgeZ(wx) - 1.6], fov: 40 },
      waveSide: { pos: [wx + 2.2, 1.2, edgeZ(wx) + 2.4], look: [wx, 1.0, edgeZ(wx) + 0.95], fov: 40 },
      glide: { pos: [9.9, 2.8, -12.9], look: [7.9, 2.05, -17.8], fov: 40 },
      walk: { pos: [-9, 1.3, 10.4], look: [-9, 0.75, 5], fov: 40 },
    },
  };
}

// ---------------------------------------------------------------- scenery for the lab

let grassTex: THREE.CanvasTexture | null = null;
/** A painted grass texture: a warm spring-green ground covered in short brush strokes of lighter and darker blades. */
function grassTexture() {
  if (grassTex) return grassTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  const rnd = mulberry(17);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
  // soft blotches, then thousands of short blades leaning one way (the wind), tiled seamlessly
  for (let i = 0; i < 60; i++) {
    const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 70, v = 0.86 + rnd() * 0.18;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      gr.addColorStop(0, `rgba(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(235 * v)},0.5)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 9000; i++) {
    const px = rnd() * S, py = rnd() * S, L = 5 + rnd() * 9, a = -1.2 + rnd() * 0.5;
    const tone = rnd();
    const col = tone < 0.45 ? `rgba(150,175,110,${0.35 + rnd() * 0.3})` : tone < 0.8 ? `rgba(255,255,215,${0.3 + rnd() * 0.35})` : `rgba(120,150,95,${0.3 + rnd() * 0.3})`;
    x.strokeStyle = col; x.lineWidth = 1 + rnd() * 1.6; x.lineCap = 'round';
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (px + ox < -20 || px + ox > S + 20 || py + oy < -20 || py + oy > S + 20) continue;
      x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(a) * L * 0.4, py + oy + Math.sin(a) * L * 0.6, px + ox + Math.cos(a) * L, py + oy + Math.sin(a) * L); x.stroke();
    }
  }
  grassTex = new THREE.CanvasTexture(c);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = 4;
  return grassTex;
}

let stoneTex: THREE.CanvasTexture | null = null;
/** Dry-stone courses: pale limestone blocks of different sizes with dark mortar joints and a few moss spots. */
function stoneTexture() {
  if (stoneTex) return stoneTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  const rnd = mulberry(23);
  x.fillStyle = '#6e5e50'; x.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let px = -rnd() * 60;
    while (px < S) {
      const w = 50 + rnd() * 70, v = 0.82 + rnd() * 0.18;
      const cc = [[236, 222, 192], [228, 208, 168], [242, 230, 204], [220, 200, 160]][Math.floor(rnd() * 4)];
      x.fillStyle = `rgb(${Math.round(cc[0] * v)},${Math.round(cc[1] * v)},${Math.round(cc[2] * v)})`;
      const y0 = r * rh + 3 + rnd() * 3, h = rh - 6 - rnd() * 4;
      x.beginPath(); x.roundRect(px + 3, y0, w - 6, h, 8 + rnd() * 6); x.fill();
      // a light top edge and a shaded bottom on each stone
      x.fillStyle = 'rgba(255,250,235,0.35)'; x.fillRect(px + 8, y0 + 2, w - 18, 4);
      x.fillStyle = 'rgba(90,70,50,0.25)'; x.fillRect(px + 6, y0 + h - 6, w - 14, 5);
      if (rnd() < 0.2) { x.fillStyle = 'rgba(110,150,70,0.6)'; x.beginPath(); x.ellipse(px + w * rnd(), y0 + 4, 12 + rnd() * 14, 5 + rnd() * 4, 0, 0, Math.PI * 2); x.fill(); }
      px += w;
    }
  }
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  return stoneTex;
}

/** A painted toon material with a texture (world-planar UVs are baked into the geometry). */
function texToon(tex: THREE.Texture, variation = 0.6) {
  return paint(new THREE.MeshToonMaterial({ color: '#ffffff', map: tex, vertexColors: true, gradientMap: softRamp() }), { variation });
}

const FLOWERS = ['#f4a6c0', '#c3aee8', '#f6d84a', '#fbf6ee', '#f08a9a'];

function buildIsland(scene: THREE.Scene, updaters: ((dt: number, t: number) => void)[]) {
  const rnd = mulberry(3);
  // the grass top: painted grass texture over spring-green and warm yellow-green patches, darker towards the rim
  const rings = 40, segs = 160, pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const gA = new THREE.Color('#9ccc6a'), gB = new THREE.Color('#c4dc7c'), gC = new THREE.Color('#7cb45c'), cc = new THREE.Color();
  for (let r = 0; r <= rings; r++) for (let s = 0; s < segs; s++) {
    const rr = IR * Math.pow(r / rings, 0.6), a = (s / segs) * Math.PI * 2;
    const x = IC.x + Math.sin(a) * rr, z = IC.z + Math.cos(a) * rr;
    const y = 0.25 * Math.sin(x * 0.13) * Math.cos(z * 0.11) * Math.min(1, (IR - rr) / 8) - 0.02;
    pos.push(x, y, z); uv.push(x / 3.2, z / 3.2);
    const n = 0.5 + 0.5 * wob(x * 0.35 + z * 0.12, 1) * wob(z * 0.3 - x * 0.1, 2);
    cc.copy(gA).lerp(gB, Math.max(0, n - 0.25)).lerp(gC, Math.max(0, (rr - IR + 3) / 3) * 0.7);
    col.push(cc.r, cc.g, cc.b);
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * segs + s, b = r * segs + (s + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const grass = new THREE.Mesh(g, texToon(grassTexture(), 0.7)); grass.receiveShadow = true; scene.add(grass);
  // cream and pale-gold cliffs falling to the clouds, in stepped columns with strata
  const cliff = new THREE.CylinderGeometry(IR, IR * 0.72, 40, 220, 24, true);
  const cp = cliff.attributes.position as THREE.BufferAttribute;
  const cliffCol: number[] = [];
  const rA = new THREE.Color('#f0dfb8'), rB = new THREE.Color('#dcc492'), rC = new THREE.Color('#c4a678'), moss = new THREE.Color('#7aa84e');
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(x, z);
    const col = Math.floor(a * 40) + Math.floor(y * 0.15) * 7;
    const k = 1 + 0.014 * Math.sin(a * 60 + y * 0.2) + 0.01 * Math.sin(a * 151 - y * 0.5) + 0.006 * ((col * 7919) % 13 / 13);
    cp.setXYZ(i, IC.x + x * k, y - 20.1, IC.z + z * k);
    const v = 0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(a * 40) * 2);
    cc.copy(rA).lerp(rB, v * 0.6).lerp(rC, Math.max(0, -y / 40) * 0.6 + (Math.sin(a * 90) > 0.6 ? 0.25 : 0));
    if (y > 17.5) cc.lerp(moss, Math.min(1, (y - 17.5) / 2.5) * (0.6 + 0.4 * Math.sin(a * 70)));
    cliffCol.push(cc.r, cc.g, cc.b);
  }
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(cliffCol, 3));
  cliff.computeVertexNormals();
  const rock = new THREE.Mesh(cliff, paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.8 }));
  rock.receiveShadow = true; scene.add(rock);
  // a lip of grass and moss hanging over the rim
  const lip = new THREE.TorusGeometry(IR - 0.12, 0.16, 4, 260); lip.scale(1, 1, 0.7); lip.rotateX(Math.PI / 2); lip.translate(IC.x, -0.1, IC.z);
  scene.add(new THREE.Mesh(lip, toon('#7ab45a')));
  // bushes and drifts of grass tufts and flowers near the edge (the island asset's own, if present)
  const avoid = (x: number) => Math.abs(x - 14) < 2.2 || Math.abs(x + 26) < 6.5 || Math.abs(x) < 4 || (x > 28 && x < 37);
  const tufts: { p: THREE.Vector3; up: THREE.Vector3; scale: number; col: THREE.Color }[] = [], daisies: typeof tufts = [], spikes: typeof tufts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 1600; i++) {
    const x = -44 + rnd() * 88, z = edgeZ(x) + 0.15 + Math.pow(rnd(), 1.4) * 14;
    const p = new THREE.Vector3(x, 0, z);
    if (Math.abs(x) < 4 && z < 6.5 && z > -1.5) continue; // keep the lineup's feet and the camera's way clear
    if (x > 28.5 && x < 36 && z > 0.5 && z < 8) continue; // and the turnaround's
    tufts.push({ p, up, scale: 0.7 + rnd() * 0.6, col: new THREE.Color('#8cbc52').offsetHSL(0, 0, (rnd() - 0.5) * 0.08) });
    if (rnd() < 0.3) (rnd() < 0.75 ? daisies : spikes).push({ p: p.clone().add(new THREE.Vector3(rnd() * 0.2, 0, rnd() * 0.2)), up, scale: 0.8 + rnd() * 0.5, col: new THREE.Color(FLOWERS[Math.floor(rnd() * FLOWERS.length)]) });
  }
  if (SPRIG) {
    for (const [list, kind, s] of [[tufts, 'tuft', 1], [daisies, 'daisy', 2], [spikes, 'spike', 3]] as const) { const m = SPRIG.sprigMesh(list, kind, s); if (m) scene.add(m); }
  } else {
    // fallback: little five-petal heads
    const petal = new THREE.CircleGeometry(0.05, 5); petal.rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4();
    for (const c of FLOWERS) {
      const list = daisies.filter(d => d.col.getHexString() === new THREE.Color(c).getHexString());
      const im = new THREE.InstancedMesh(petal, toon(c), Math.max(1, list.length));
      list.forEach((d, i) => { m.makeTranslation(d.p.x, 0.03, d.p.z); im.setMatrixAt(i, m); });
      scene.add(im);
    }
  }
  const bushes = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const x = -46 + rnd() * 92; if (avoid(x)) continue;
    const z = edgeZ(x) + 0.3 + Math.pow(rnd(), 1.6) * 9, s = 0.45 + rnd() * 0.45;
    if (FLORA) { const b = FLORA.islandBush(rnd, s, rnd() < 0.55); b.position.set(x, 0, z); b.rotation.y = rnd() * 6; bushes.add(b); }
    else { const b = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#5f9a48')); b.position.set(x, 0, z); b.scale.y = 0.6; bushes.add(b); }
  }
  scene.add(SPRIG ? SPRIG.mergeByMaterial(bushes) : bushes);
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
  // far isles floating in the haze: the shared island asset (limestone cliffs, meadows, trees, falls) and islets
  if (ISLAND) {
    const isles: [number, number, number, number, number, Record<string, unknown>][] = [
      [-95, -2, -150, 0.3, 1, { seed: 11, radius: 12, wobble: 1.1, cliffDepth: 11, underDepth: 14, taper: 0.2, waterfalls: [{ angle: 1.2, width: 2.2, length: 46 }], trees: 6, flowers: 8 }],
      [70, 8, -190, 1.9, 1, { seed: 23, radius: 14, wobble: 0.9, cliffDepth: 9, underDepth: 18, waterfalls: [{ angle: 1.7, width: 2.8, length: 60 }], trees: 7, flowers: 9, cottages: 1 }],
      [-20, 22, -300, 0.8, 1.2, { seed: 41, radius: 12, wobble: 0.8, cliffDepth: 8, underDepth: 15, trees: 6, flowers: 6 }],
      [150, -10, -120, 2.4, 0.8, { seed: 5, radius: 9, wobble: 1.0, cliffDepth: 6, underDepth: 10, trees: 3, flowers: 4 }],
    ];
    for (const [x, y, z, ry, s, o] of isles) {
      const isl = ISLAND.buildFloatingIsland(o);
      isl.group.position.set(x, y, z); isl.group.rotation.y = ry; isl.group.scale.setScalar(s);
      scene.add(isl.group); updaters.push((dt, t) => isl.update(dt, t));
    }
    const rocks: { g: THREE.Group; y: number; ph: number }[] = [];
    for (const [i, [x, y, z, s]] of ([[-30, 6, -40, 3], [24, 9, -55, 2.4], [48, -4, -70, 4], [-60, 12, -80, 3.5], [5, 14, -90, 2]] as [number, number, number, number][]).entries()) {
      const g = ISLAND.floatingRock(100 + i * 7, s); g.position.set(x, y, z); g.rotation.set((i % 3 - 1) * 0.12, i * 1.7, ((i + 1) % 3 - 1) * 0.1);
      scene.add(g); rocks.push({ g, y, ph: i * 1.3 });
    }
    updaters.push((_dt, t) => { for (const r of rocks) r.g.position.y = r.y + Math.sin(t * 0.3 + r.ph) * 0.4; });
  }
}

/**
 * The bank the crowd stands on: grassy steps rising from the fence, each held by a dry-stone wall (painted
 * limestone courses), with tufts and flowers spilling along the step edges. Follows the curve of the edge.
 */
function buildBank(scene: THREE.Scene, cx: number, len: number, fenceOff: number, rows: number) {
  const wall: THREE.BufferGeometry[] = [], tops: THREE.BufferGeometry[] = [];
  const N = 28;
  for (let row = 1; row <= rows; row++) {
    const h = row * 0.3, back = row === rows ? 3.5 : 0.5;
    for (let i = 0; i < N; i++) {
      const x0 = cx - len / 2 + (i / N) * len, x1 = cx - len / 2 + ((i + 1) / N) * len;
      const z0a = edgeZ(x0) + fenceOff + 0.36 + (row - 0.5) * 0.5, z0b = edgeZ(x1) + fenceOff + 0.36 + (row - 0.5) * 0.5;
      // the wall face (u along, v up, in metres so the stone courses keep their size), and the grass top
      const face = new THREE.BufferGeometry();
      const pf = [x0, 0, z0a, x1, 0, z0b, x1, h, z0b, x0, h, z0a];
      face.setAttribute('position', new THREE.Float32BufferAttribute(pf, 3));
      face.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / 1.6, 0, x1 / 1.6, 0, x1 / 1.6, h / 1.6 * 1.0, x0 / 1.6, h / 1.6], 2));
      face.setAttribute('color', new THREE.Float32BufferAttribute([0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 1, 1, 1, 1, 1, 1], 3));
      face.setIndex([0, 2, 1, 0, 3, 2]);
      face.computeVertexNormals();
      wall.push(face);
      const top = new THREE.BufferGeometry();
      const pt = [x0, h, z0a, x1, h, z0b, x1, h, z0b + 0.5 + back, x0, h, z0a + 0.5 + back];
      top.setAttribute('position', new THREE.Float32BufferAttribute(pt, 3));
      top.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / 3.2, z0a / 3.2, x1 / 3.2, z0b / 3.2, x1 / 3.2, (z0b + 0.5 + back) / 3.2, x0 / 3.2, (z0a + 0.5 + back) / 3.2], 2));
      top.setAttribute('color', new THREE.Float32BufferAttribute([0.92, 0.96, 0.82, 0.92, 0.96, 0.82, 1, 1, 1, 1, 1, 1], 3));
      top.setIndex([0, 1, 2, 0, 2, 3]);
      top.computeVertexNormals();
      tops.push(top);
    }
  }
  const wm = new THREE.Mesh(mergeGeometries(wall)!, texToon(stoneTexture(), 0.5)); wm.receiveShadow = true; wm.castShadow = true;
  const tm = new THREE.Mesh(mergeGeometries(tops)!, texToon(grassTexture(), 0.7)); tm.receiveShadow = true;
  wm.material.side = THREE.DoubleSide;
  scene.add(wm, tm);
  // tufts and flowers spilling over the step edges
  if (SPRIG) {
    const rnd = mulberry(41), up = new THREE.Vector3(0, 1, 0);
    const tufts: { p: THREE.Vector3; up: THREE.Vector3; scale: number; col: THREE.Color }[] = [], flowers: typeof tufts = [];
    for (let row = 0; row <= rows; row++) for (let i = 0; i < 70; i++) {
      const x = cx - len / 2 + rnd() * len, z = edgeZ(x) + fenceOff + (row === 0 ? 0.05 + rnd() * 0.3 : 0.36 + (row - 0.5) * 0.5 + 0.02 + rnd() * 0.06);
      const p = new THREE.Vector3(x, row * 0.3, z);
      tufts.push({ p, up, scale: 0.6 + rnd() * 0.5, col: new THREE.Color('#86b850').offsetHSL(0, 0, (rnd() - 0.5) * 0.08) });
      if (rnd() < 0.45) flowers.push({ p: p.clone(), up, scale: 0.7 + rnd() * 0.4, col: new THREE.Color(FLOWERS[Math.floor(rnd() * FLOWERS.length)]) });
    }
    for (const [list, kind, s] of [[tufts, 'tuft', 5], [flowers, 'daisy', 6]] as const) { const m = SPRIG.sprigMesh(list, kind, s); if (m) scene.add(m); }
  }
}

/** A rustic wooden fence just inside the edge: split posts and two rails, the top rail at elbow height. */
function buildFence(scene: THREE.Scene, x0: number, x1: number) {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry(9);
  for (let x = x0; x <= x1; x += 2.0) {
    const z = edgeZ(x) + 0.45;
    const p = new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6); p.rotateZ((rnd() - 0.5) * 0.06); p.translate(x, 0.48, z); parts.push(p.toNonIndexed());
    const xn = x + 2.0, zn = edgeZ(xn) + 0.45;
    if (xn <= x1 + 0.01) for (const y of [0.46, 0.9]) {
      const L = Math.hypot(2.0, zn - z);
      const r = new THREE.CylinderGeometry(0.034, 0.034, L, 6); r.rotateZ(Math.PI / 2); r.rotateY(-Math.atan2(zn - z, 2.0)); r.translate(x + 1.0, y + (rnd() - 0.5) * 0.03, (z + zn) / 2); parts.push(r.toNonIndexed());
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, toon('#9a7048')); m.castShadow = true;
  scene.add(m);
}

/** Where the right hand holds the stand-in wing's bar (the left is mirrored), in the wing's frame. */
const BAR = new THREE.Vector3(0.2, -0.05, 0.66);

/**
 * A simple kite-wing so the glide pose reads (the kites piece builds the real one): a broad diamond sail in
 * coloured panels lying under the rider, a keel and a spar, and a short bar at the nose for the hands.
 */
function standInWing(cols: [string, string, string]) {
  const g = new THREE.Group();
  const pos: number[] = [], col: number[] = [];
  const nose: number[] = [0, -0.16, 1.55], tail: number[] = [0, -0.2, -1.3], L: number[] = [-2.3, -0.05, -0.55], R: number[] = [2.3, -0.05, -0.55];
  // eight panels: each half split into an inner and outer triangle, front and back, alternating colours, a slight billow
  const mid = (a: number[], b: number[], t: number, sag = 0) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t];
  const c0: number[] = [0, -0.24, 0.1];
  const tri = (a: number[], b: number[], c: number[], ci: number) => { const C = new THREE.Color(cols[ci]); for (const v of [a, b, c]) { pos.push(v[0], v[1], v[2]); col.push(C.r, C.g, C.b); } };
  for (const W of [L, R]) {
    const m1 = mid(nose, W, 0.5, 0.06), m2 = mid(W, tail, 0.5, 0.06), mc = mid(c0, W, 0.5, 0.08);
    tri(nose, m1, mc, 0); tri(nose, mc, c0, 1); tri(m1, W, mc, 1); tri(mc, W, m2, 0); tri(c0, mc, m2, 2); tri(c0, m2, tail, 0);
  }
  const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sail.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sail.computeVertexNormals();
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.3 });
  const wing = new THREE.Mesh(sail, mat); wing.castShadow = true; g.add(wing);
  const wood = toon('#8a6440');
  const spar = (a: number[], b: number[], r = 0.016) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 6), wood); c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); g.add(c); };
  spar(nose, tail); spar(L, R);
  // the bar at the nose, on two short posts from the keel
  spar([-BAR.x - 0.06, BAR.y, BAR.z], [BAR.x + 0.06, BAR.y, BAR.z], 0.014);
  spar([-BAR.x, BAR.y, BAR.z], [0, -0.18, BAR.z + 0.12], 0.01); spar([BAR.x, BAR.y, BAR.z], [0, -0.18, BAR.z + 0.12], 0.01);
  return g;
}
