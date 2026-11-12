import * as THREE from 'three';
import type { LabCtx, LabPiece, LabView } from './types';
import { ambleLab } from './amble';
import { Mossrest } from '../mossrest';
import { Player } from '../../../player/player';
import { REST, BONE, SHELL, FOOT_REST } from '../ambleRig';

/**
 * Town lab: Old Amble with Mossrest on its back, in the stand-in meadow. Nilo stands on the walkway on the
 * right side (riding the shell). Query as the Amble lab, plus nilo=0 (no Nilos), dbg=cols (show the colliders).
 * Views: threeq (picture 1), side, walk (on the walkway, like picture 3), inside (in a walk-in house), legs (the
 * ropes and ladders down the legs), head (the head and antlers), top.
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const { piece, amble } = ambleLab(ctx);
  const town = new Mossrest(11);
  town.attach(amble.shellTop, amble.neckRide);
  const cols = town.colliders();
  if (params.get('dbg') === 'cols') {
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3060', wireframe: true });
    const dmat = new THREE.MeshBasicMaterial({ color: '#30a0ff', wireframe: true });
    for (const s of cols.solids) { if (s.shape.kind !== 'box') continue; const m = new THREE.Mesh(new THREE.BoxGeometry(s.shape.hw * 2, s.h, s.shape.hd * 2).translate(0, s.h / 2, 0), mat); s.obj.add(m); scene.add(s.obj); }
    for (const d of cols.decks) { const m = new THREE.Mesh(new THREE.BoxGeometry(d.span, 0.05, d.width), dmat); m.position.y = d.top(0); d.obj.add(m); scene.add(d.obj); }
  }
  // Nilo on the walkway (riding the shell), looking along it towards the front
  const ring = town.ring;
  const iw = ring.ths.findIndex(t => t > 3.35);
  let nilo2: Player | null = null;
  if (params.get('nilo') !== '0') {
    nilo2 = new Player(); nilo2.grounded = true;
    const p = ring.P(iw, 0.45), q = ring.P(iw - 2, 0.45);
    nilo2.root.position.set(p.x, p.y, p.z).sub(new THREE.Vector3(0, SHELL.yTop, SHELL.cz));
    nilo2.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    nilo2.root.traverse(o => { o.castShadow = true; });
    amble.shellTop.add(nilo2.root);
  }
  const v = (p: THREE.Vector3): [number, number, number] => [p.x, p.y, p.z];
  // the walkway view: behind and above Nilo, looking along the walk to the front, houses uphill on the left
  const at = (th: number) => ring.ths.findIndex(t => t > th);
  const wc = ring.P(at(Number(params.get('wth') ?? 3.3)), 0.72).add(new THREE.Vector3(0, 1.9, 0));
  const wl = ring.P(at(Number(params.get('wth2') ?? 2.55)), 0.2).add(new THREE.Vector3(0, 1.4, 0));
  // inside a walk-in house: from a back corner towards the door and the window
  const h = town.houses.find(x => x.walkIn && x.name === 'Bramble Cottage') ?? town.houses.find(x => x.walkIn)!;
  const loc = (lx: number, ly: number, lz: number) => { const c = Math.cos(h.rot), s = Math.sin(h.rot); return new THREE.Vector3(h.at.x + lx * c + lz * s, h.at.y + ly, h.at.z - lx * s + lz * c); };
  const inPos = loc(h.w / 2 - 0.55, 1.65, h.d / 2 - 0.55), inLook = loc(-h.w / 2 + 1.1, 0.75, -h.d / 2 + 0.7);
  const F = FOOT_REST.FR, Hd = REST[BONE.head];
  const views: Record<string, LabView> = {
    threeq: { pos: [-74, 11, 58], look: [-1, 19, 3], fov: 46 },
    side: { pos: [-104, 15, 0], look: [0, 19, 0], fov: 42 },
    walk: { pos: v(wc), look: v(wl), fov: 62 },
    inside: { pos: v(inPos), look: v(inLook), fov: 72 },
    legs: { pos: [F.x - 20, 3.5, F.z + 20], look: [F.x + 2, 7, F.z - 4], fov: 55 },
    headclose: { pos: [Hd.x - 9.5, Hd.y + 1.2, Hd.z + 5.5], look: [Hd.x, Hd.y + 0.5, Hd.z + 1.2], fov: 40 },
    head: { pos: [Hd.x - 26, Hd.y + 3, Hd.z + 20], look: [Hd.x, Hd.y + 6, Hd.z - 1], fov: 50 },
    top: { pos: [-40, 66, 38], look: [0, 22, SHELL.cz], fov: 45 },
    back: { pos: [60, 30, -70], look: [0, 22, -4], fov: 45 },
  };
  let logged = false;
  return {
    update(dt, t) {
      piece.update(dt, t);
      town.update(dt, t, ctx.camera);
      amble.root.updateMatrixWorld(true);
      cols.sync(amble.shellTop.matrixWorld, amble.neckRide.matrixWorld);
      if (nilo2) { nilo2.pose = {}; nilo2.animate(dt, 0, false); }
      if (!logged && t > 0.5) { logged = true; console.log(`town: ${town.stats.meshes} meshes, ${Math.round(town.stats.triangles)} tris, ${cols.solids.length} solids, ${cols.decks.length} decks, ${town.houses.length} houses (${town.houses.filter(x => x.walkIn).length} walk-in)`); }
    },
    views,
  };
}
