// Lab piece: the floating islands. A hero island (radius 16, a waterfall), two smaller ones, a far one, and
// floating islets, over a sea of painted cumulus far below.
// Open /downriver/skylab.html?piece=island&view=hero
import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { buildFloatingIsland, floatingRock, FloatingIsland } from '../island';
import { paintCloud } from '../../skyIslands';

/** The cloud sea for the lab: heaped painted banks far below, warm on top. */
function cloudSea(scene: THREE.Scene, y: number) {
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const texs = [0, 1, 2, 3, 4, 5].map(i => { const t = new THREE.CanvasTexture(paintCloud(i * 7 + 3, true)); t.colorSpace = THREE.SRGBColorSpace; return t; });
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, d = 30 + Math.pow(r(), 0.7) * 900;
    const w = 90 + r() * 170;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 6], color: i % 3 ? '#fffaf2' : '#f2f0fa', transparent: true, depthWrite: false, fog: true }));
    sp.scale.set(w, w * 0.5, 1);
    sp.position.set(Math.cos(a) * d, y + (r() - 0.3) * 30 + w * 0.12, Math.sin(a) * d);
    scene.add(sp);
  }
}

export default function (ctx: LabCtx): LabPiece {
  const { scene } = ctx;
  const islands: FloatingIsland[] = [];
  const add = (isl: FloatingIsland, x: number, y: number, z: number, ry: number) => {
    isl.group.position.set(x, y, z); isl.group.rotation.y = ry;
    scene.add(isl.group); islands.push(isl);
    return isl;
  };
  const hero = add(buildFloatingIsland({
    seed: 3, radius: 16, wobble: 0.75, cliffDepth: 17, underDepth: 24,
    waterfalls: [{ angle: 1.75, width: 3.2, length: 72 }], trees: 6, flowers: 30,
  }), 0, 0, 0, 0);
  add(buildFloatingIsland({ seed: 11, radius: 8.5, wobble: 0.8, cliffDepth: 9, underDepth: 15, waterfalls: [{ angle: 2.5, width: 1.7, length: 42 }], trees: 2, flowers: 10 }), 54, 7, -42, 0.3);
  add(buildFloatingIsland({ seed: 23, radius: 6.5, wobble: 0.9, cliffDepth: 6.5, underDepth: 11, trees: 1, flowers: 6 }), -44, -9, -34, 1.1);
  add(buildFloatingIsland({ seed: 41, radius: 11, wobble: 0.7, cliffDepth: 12, underDepth: 18, waterfalls: [{ angle: 2.0, width: 2.2, length: 50 }], trees: 3, flowers: 12 }), 10, 18, -120, 0.6);
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
    g.position.set(x, y, z); g.rotation.y = i * 1.7;
    scene.add(g);
    rocks.push({ g, base: g.position.clone(), ph: i * 1.3 });
  });

  cloudSea(scene, -125);

  // the close cliff view looks at the hero's wall a quarter turn round from the fall
  const ca = 2.75, sh = hero.shape;
  const wy = -5, w = sh.wall(ca, wy);
  const wp = new THREE.Vector3(Math.cos(ca) * w.r, wy, Math.sin(ca) * w.r);
  const out = new THREE.Vector3(Math.cos(ca), 0, Math.sin(ca));
  const cliffCam = wp.clone().addScaledVector(out, 17).add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(new THREE.Vector3(-out.z, 0, out.x), 5);

  return {
    update(dt, t) {
      for (const isl of islands) isl.update(dt, t);
      for (const r of rocks) {
        r.g.position.y = r.base.y + Math.sin(t * 0.5 + r.ph) * 0.35;
        r.g.rotation.y += dt * 0.03;
      }
    },
    views: {
      hero: { pos: [-34, 12, 54], look: [4, -10, -4], fov: 50 },
      under: { pos: [26, -66, 34], look: [0, -28, 0], fov: 55 },
      cliff: { pos: cliffCam.toArray() as [number, number, number], look: wp.toArray() as [number, number, number], fov: 50 },
      far: { pos: [-105, 30, 125], look: [8, -16, -40], fov: 45 },
      fall: { pos: [-46, -30, 66], look: [-3, -42, 14], fov: 50 },
    },
  };
}
