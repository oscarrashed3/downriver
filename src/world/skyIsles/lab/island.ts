// Lab piece: the floating islands. A hero island (radius 16, a 5 m waterfall, a cottage), a tall narrow one, a flat slab,
// a far one, and floating islets, in a band of painted cumulus round the islands' lower halves (as in picture 1).
// Views: hero (across the gap, fall to one side), cliff (close on a face), under (looking up), fall (its foot in
// the clouds), tall (the tall island), far (all of them at scale).
// Open /downriver/skylab.html?piece=island&view=hero
import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { buildFloatingIsland, floatingRock, FloatingIsland } from '../island';
import { paintCloud } from '../../skyIslands';

/** The cloud sea for the lab: heaped painted banks far below, warm on top. */
function cloudSea(scene: THREE.Scene, y: number, top: number) {
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const texs = [0, 1, 2, 3, 4, 5].map(i => { const t = new THREE.CanvasTexture(paintCloud(i * 7 + 3, true)); t.colorSpace = THREE.SRGBColorSpace; return t; });
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, d = 30 + Math.pow(r(), 0.7) * 900;
    const w = 90 + r() * 170;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 6], color: i % 3 ? '#ffffff' : '#f7f6fd', transparent: true, depthWrite: false, fog: true }));
    sp.scale.set(w, w * 0.5, 1);
    // the crowns stay below the top of the band (a heap's crown is about 0.17 of its width above its centre)
    sp.position.set(Math.cos(a) * d, Math.min(y + (r() - 0.3) * 30 + w * 0.12, top - w * 0.17 - r() * 8), Math.sin(a) * d);
    scene.add(sp);
  }
}

export default function (ctx: LabCtx): LabPiece {
  const { scene } = ctx;
  // crisp air, as in the pictures: the game's fog is for the far distance, so keep it thin here unless asked
  if (!ctx.params.has('fog') && scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.0007;
  const islands: FloatingIsland[] = [];
  const add = (isl: FloatingIsland, x: number, y: number, z: number, ry: number) => {
    isl.group.position.set(x, y, z); isl.group.rotation.y = ry;
    scene.add(isl.group); islands.push(isl);
    return isl;
  };
  // the hero: broad, with a top much wider than its cliff is tall
  const FALL = 1.75;
  const hero = add(buildFloatingIsland({
    seed: 3, radius: 16, wobble: 0.9, cliffDepth: 13, underDepth: 22,
    waterfalls: [{ angle: FALL, width: 5, length: 52 }], trees: 9, flowers: 8, cottages: 1, lobes: 3,
  }), 0, 0, 0, 0);
  // a tall narrow one (tapering, with deep bays), a flat slab, and a far one
  add(buildFloatingIsland({ seed: 11, radius: 8.5, wobble: 1.4, cliffDepth: 12, underDepth: 13, taper: 0.28, waterfalls: [{ angle: 2.5, width: 2.8, length: 56 }], trees: 4, flowers: 3 }), 54, 7, -42, 0.3);
  add(buildFloatingIsland({ seed: 23, radius: 6.5, wobble: 1.0, cliffDepth: 3.5, underDepth: 9, trees: 3, flowers: 2 }), -44, -9, -34, 1.1);
  add(buildFloatingIsland({ seed: 41, radius: 11, wobble: 0.8, cliffDepth: 7, underDepth: 17, waterfalls: [{ angle: 2.0, width: 3.4, length: 66 }], trees: 6, flowers: 4, cottages: 1 }), 10, 18, -120, 0.6);
  // debug: ?nowater hides the falls, spray and rainbows (to judge the rock behind them)
  if (ctx.params.has('nowater')) for (const isl of islands) isl.group.traverse(o => { if (o.renderOrder >= 2) o.visible = false; });
  for (const isl of islands) {
    const parts: string[] = [];
    isl.group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry as THREE.InstancedBufferGeometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (g.isInstancedBufferGeometry ? g.instanceCount : 1); parts.push((m.name || (m.material as THREE.Material).type) + ':' + Math.round(t)); });
    console.log('island', isl.shape.R, JSON.stringify(isl.stats), parts.join(' '));
  }

  // islets drifting near the big islands
  const rocks: { g: THREE.Group; base: THREE.Vector3; ph: number }[] = [];
  const spots: [number, number, number, number][] = [
    [26, -3, 14, 3.2], [31, 4, -8, 1.6], [22, -14, 26, 2.2], [-24, 3, 12, 2.6], [-20, -12, 24, 1.3],
    [38, 12, -24, 1.8], [-30, -4, -14, 3.6], [12, -20, 32, 1.1], [-12, 9, -30, 2.0], [44, -6, 4, 1.4],
  ];
  spots.forEach(([x, y, z, s], i) => {
    const g = floatingRock(100 + i * 7, s);
    // islets drift a little tilted, never level like spinning tops
    g.position.set(x, y, z); g.rotation.set((i % 3 - 1) * 0.15, i * 1.7, ((i + 1) % 3 - 1) * 0.12);
    scene.add(g);
    rocks.push({ g, base: g.position.clone(), ph: i * 1.3 });
  });

  cloudSea(scene, -80, -46);

  // the close cliff view looks at the hero's wall a quarter turn round from the fall
  // (on the sun's side, so the light rakes across the strata and the shade side shows at the corners)
  const ca = 1.05, sh = hero.shape;
  const wy = -5, w = sh.wall(ca, wy);
  const wp = new THREE.Vector3(Math.cos(ca) * w.r, wy, Math.sin(ca) * w.r);
  const out = new THREE.Vector3(Math.cos(ca), 0, Math.sin(ca));
  const cliffCam = wp.clone().addScaledVector(out, 17).add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(new THREE.Vector3(-out.z, 0, out.x), 5);

  // the hero view looks across the gap at the cliffs, the fall off to one side (as picture 1 does)
  const hc = FALL - 0.5, hd = 60;
  const heroCam: [number, number, number] = [Math.cos(hc) * hd, 10, Math.sin(hc) * hd];
  return {
    update(dt, t) {
      for (const isl of islands) isl.update(dt, t);
      for (const r of rocks) {
        r.g.position.y = r.base.y + Math.sin(t * 0.5 + r.ph) * 0.35;
        r.g.rotation.y += dt * 0.03;
      }
    },
    views: {
      hero: { pos: heroCam, look: [0, -19, 0], fov: 54 },
      under: { pos: [30, -50, 40], look: [0, -24, 0], fov: 55 },
      cliff: { pos: cliffCam.toArray() as [number, number, number], look: wp.toArray() as [number, number, number], fov: 50 },
      tall: { pos: [54 + 30, 2, -42 + 22], look: [54, -4, -42], fov: 50 },
      far: { pos: [-105, 30, 125], look: [8, -16, -40], fov: 45 },
      fall: { pos: [-40, -18, 62], look: [-3, -36, 14], fov: 50 },
    },
  };
}
