import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { Amble } from '../amble';
import { REST, BONE, SHELL, FOOT_REST } from '../ambleRig';
import { paint, softRamp } from '../../../render/paint';
import { Player } from '../../../player/player';
import { CardBuilder } from '../ambleGrowth';
import { CELL } from '../ambleMaterials';
import { ambleCardMaterial } from '../ambleMaterials';
import { townRng } from '../rand';
import { Noise } from '../../noise';

/**
 * Amble lab: Old Amble standing in a stand-in golden meadow (daisies, lupins, rocks, far blue hills, a lake and
 * snowy peaks), with Nilo for scale. The meadow is only a backdrop to judge Amble in; the world builds its own.
 * Query: pose=lift (front left foot held up) | head=-1..1 | walk=0..1 (on a treadmill) | nilo=0 | birds=N |
 * dbg=bones (bone markers) | dbg=top (hide the growth).
 * Views: threeq (like picture 1), side, front, head, eye, foot, scale (Nilo at the front foot), top, under.
 */
export default function (ctx: LabCtx): LabPiece { return ambleLab(ctx).piece; }

/** The Amble lab, handing back Amble and Nilo too (the town lab builds on it). */
export function ambleLab(ctx: LabCtx): { piece: LabPiece; amble: Amble; nilo: Player | null } {
  const { scene, params } = ctx;
  const amble = new Amble({ birds: Number(params.get('birds') ?? 5) });
  scene.add(amble.root);
  if (params.get('pose') === 'lift') amble.pose.footLift.FL = 1;
  if (params.get('head')) amble.pose.headLift = Number(params.get('head'));
  if (params.get('walk')) amble.pose.walk = Number(params.get('walk'));
  if (params.get('dbg') === 'top') amble.growth.visible = false;
  if (params.get('lid')) amble.rig.idle.lid = Number(params.get('lid'));
  if (params.get('dbg') === 'bones') {
    for (const b of amble.rig.bones) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2050', depthTest: false })); m.renderOrder = 10; b.add(m); }
  }

  // ---- the stand-in meadow
  const toon = (c: string, v = 0.4) => paint(new THREE.MeshToonMaterial({ color: c, gradientMap: softRamp(), vertexColors: true }), { variation: v, rim: 0.3 });
  const nz = new Noise(5);
  const gg = new THREE.PlaneGeometry(3600, 3600, 180, 180);
  gg.rotateX(-Math.PI / 2);
  {
    const pa = gg.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pa.count * 3);
    const gold = new THREE.Color('#d6c062'), green = new THREE.Color('#9db454'), deep = new THREE.Color('#6f9a4a'), far = new THREE.Color('#8fb07a');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), d = Math.hypot(x, z);
      // gentle meadow swells near, rolling hills further out
      const h = d < 120 ? nz.fbm(x * 0.012, 0, z * 0.012, 3) * 1.2 * Math.max(0, (d - 40) / 80) : nz.fbm(x * 0.004, 1, z * 0.004, 4) * 60 * Math.min(1, (d - 120) / 400) + nz.fbm(x * 0.012, 0, z * 0.012, 3) * 1.2;
      pa.setY(i, h - (d > 300 ? 0 : 0));
      const k = nz.fbm(x * 0.03, 2, z * 0.03, 3) * 0.5 + 0.5;
      const c = gold.clone().lerp(green, k * 0.8).lerp(deep, Math.min(1, Math.max(0, (d - 200) / 500)) * 0.6).lerp(far, Math.min(1, Math.max(0, (d - 500) / 700)));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gg.computeVertexNormals();
  }
  const ground = new THREE.Mesh(gg, toon('#ffffff', 0.5));
  ground.receiveShadow = true;
  scene.add(ground);
  // a lake to the right of the head, and far snowy peaks
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), paint(new THREE.MeshToonMaterial({ color: '#8cc4e0', gradientMap: softRamp() }), { variation: 0.2 }));
  lake.rotation.x = -Math.PI / 2; lake.scale.set(150, 60, 1); lake.position.set(-160, 0.4, 420); scene.add(lake);
  // far blue mountains: one ridged band all round, snow on the high peaks (a backdrop only)
  {
    const NA = 360, NR = 6;
    const pos: number[] = [], cols: number[] = [], idx: number[] = [];
    const blue = new THREE.Color('#8fa2c4'), dark = new THREE.Color('#7a8db4'), snow = new THREE.Color('#f2f5fb');
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ridge = Math.max(0, nz.ridged(ca * 2.2 + 9, 0, sa * 2.2, 4) - 0.25) * 520 + nz.fbm(ca * 6, 3, sa * 6, 3) * 60 + 90;
      for (let k = 0; k <= NR; k++) {
        const f = k / NR, d = 1900 - f * 260;
        const h = f < 1 ? ridge * Math.sin(f * Math.PI * 0.5) ** 0.7 : ridge;
        pos.push(ca * d, h - 30, sa * d);
        const c = dark.clone().lerp(blue, f).lerp(snow, Math.max(0, Math.min(1, (h - 330) / 80)));
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NA; i++) for (let k = 0; k < NR; k++) { const A = i * (NR + 1) + k, B = A + NR + 1; idx.push(A, B, A + 1, A + 1, B, B + 1); }
    const mg2 = new THREE.BufferGeometry();
    mg2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg2.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    mg2.setIndex(idx); mg2.computeVertexNormals();
    const mtn = new THREE.Mesh(mg2, paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.2, rim: 0.2 }));
    scene.add(mtn);
  }
  // rocks, daisies, lupins and long golden grass round Amble's feet
  const rocks = new THREE.Group();
  const rockG = new THREE.IcosahedronGeometry(1, 1);
  const rm = paint(new THREE.MeshToonMaterial({ color: '#b2ad9a', gradientMap: softRamp() }), { variation: 0.5, rim: 0.3 });
  const rr = townRng(2);
  for (let i = 0; i < 26; i++) {
    const a = rr() * Math.PI * 2, d = 26 + rr() * 50;
    const m = new THREE.Mesh(rockG, rm);
    const s = 0.5 + rr() * 1.6;
    m.scale.set(s * (1 + rr()), s * 0.6, s); m.position.set(Math.cos(a) * d, s * 0.15, Math.sin(a) * d); m.rotation.y = rr() * 3;
    m.castShadow = m.receiveShadow = true; rocks.add(m);
  }
  scene.add(rocks);
  const cb = new CardBuilder();
  const gold = [new THREE.Color('#e0c868'), new THREE.Color('#cdbb58'), new THREE.Color('#b8c05a'), new THREE.Color('#d8d07a')];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 9000; i++) {
    const a = rr() * Math.PI * 2, d = 4 + Math.pow(rr(), 0.8) * 110;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = d < 40 ? 0 : nz.fbm(x * 0.012, 0, z * 0.012, 3) * 1.2 * Math.max(0, (d - 40) / 80);
    const r0 = rr();
    const cell = r0 < 0.72 ? CELL.grass : r0 < 0.9 ? CELL.flowers : CELL.lupin;
    const sz = cell === CELL.grass ? 0.55 + rr() * 0.4 : cell === CELL.lupin ? 0.55 + rr() * 0.35 : 0.3 + rr() * 0.15;
    const rot = rr() * Math.PI;
    const ax = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot)).multiplyScalar(sz);
    const col = cell === CELL.grass ? gold[Math.floor(rr() * gold.length)] : new THREE.Color('#ffffff');
    const c = new THREE.Vector3(x, y + sz * (cell === CELL.flowers ? 0.6 : 0.95), z);
    cb.quad(c, ax, up.clone().multiplyScalar(sz), up, cell, col, [0, 0.03], rr() * 10, [[0, 1]]);
    if (cell !== CELL.flowers) cb.quad(c, ax.clone().applyAxisAngle(up, Math.PI / 2), up.clone().multiplyScalar(sz), up, cell, col.clone().multiplyScalar(0.92), [0, 0.03], rr() * 10, [[0, 1]]);
  }
  const mg = cb.geometry(); mg.deleteAttribute('skinIndex'); mg.deleteAttribute('skinWeight');
  const meadow = new THREE.Mesh(mg, ambleCardMaterial());
  meadow.renderOrder = 1; meadow.receiveShadow = true;
  scene.add(meadow);

  // ---- Nilo for scale, standing by the front left foot
  let nilo: Player | null = null;
  if (params.get('nilo') !== '0') {
    nilo = new Player(); nilo.grounded = true;
    const F = FOOT_REST.FL;
    nilo.root.position.set(F.x + 4.2, 0, F.z + 2.6); nilo.root.rotation.y = -2.2;
    nilo.root.traverse(o => { o.castShadow = true; });
    scene.add(nilo.root);
  }

  // solo=1: Amble alone (for counting its draws and triangles)
  if (params.get('solo')) for (const o of [ground, lake, rocks, meadow, ...scene.children.filter(c => c.type === 'Mesh' && c !== ground && c !== lake && c !== meadow)]) o.visible = false;
  if (params.get('solo') && nilo) nilo.root.visible = false;
  let logged = false;
  const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const F = FOOT_REST.FL, Hd = REST[BONE.head];
  const ER = REST[BONE.eyeR];
  const piece: LabPiece = {
    update(dt, t) {
      amble.update(dt, t);
      if (nilo) { nilo.pose = {}; nilo.animate(dt, 0, false); }
      if (!logged && t > 0.5) {
        logged = true;
        console.log(`amble: body ${amble.build.triangles} tris, growth ${amble.stats.cards} cards, bones ${amble.stats.bones}`);
      }
    },
    views: {
      // three-quarter from the front right, low in the meadow, head to the right (picture 1)
      threeq: { pos: v(-62, 9, 48), look: v(-1, 17, 4), fov: 48 },
      left: { pos: v(48, 4, 46), look: v(2, 13, 6), fov: 48 },
      side: { pos: v(-92, 12, 2), look: v(0, 15, 2), fov: 42 },
      front: { pos: v(-14, 16, 92), look: v(0, 19, 10), fov: 44 },
      head: { pos: v(Hd.x - 25, Hd.y + 3, Hd.z + 17), look: v(Hd.x, Hd.y + 6.5, Hd.z + 0.5), fov: 52 },
      profile: { pos: v(Hd.x - 22, Hd.y + 1, Hd.z + 3), look: v(Hd.x, Hd.y + 1.5, Hd.z + 3), fov: 40 },
      eye: { pos: v(Hd.x - 8, Hd.y + 1.0, Hd.z + 7), look: v(Hd.x - 1.8, Hd.y + 0.6, Hd.z + 1.6), fov: 38 },
      eyeclose: { pos: v(ER.x - 3.2, ER.y + 0.5, ER.z + 1.6), look: v(ER.x, ER.y, ER.z), fov: 34 },
      neck: { pos: v(-26, 16, 34), look: v(0, 16, 22), fov: 45 },
      foot: { pos: v(F.x + 9, 3.2, F.z + 11), look: v(F.x, 2.4, F.z), fov: 42 },
      toes: { pos: v(F.x + 5.5, 1.5, F.z + 8), look: v(F.x + 0.6, 0.9, F.z + 2.2), fov: 50 },
      scale: { pos: v(F.x + 13, 2.2, F.z + 13), look: v(F.x + 1.5, 4.5, F.z - 1), fov: 50 },
      top: { pos: v(-36, 58, 32), look: v(0, 18, SHELL.cz), fov: 45 },
      under: { pos: v(-6, 1.6, 30), look: v(0, 3.5, -10), fov: 60 },
    },
  };
  return { piece, amble, nilo };
}
