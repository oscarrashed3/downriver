import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { SkyWhale } from '../whale';
import { cloudSea, setPuffSun } from '../whaleClouds';

/**
 * Whale lab: one sky whale swimming in place above a cloud sea (for the profile, three-quarter, below and
 * head views), and a second one cruising round a loop half in the cloud tops, leaving a cloud wake
 * (the "clouds" view, from about cliff height).
 * Query: swim=0..1 (default 0.6), birds=N, len=metres.
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  setPuffSun(ctx.sunDir);
  const len = Number(params.get('len') ?? 36);
  const CLOUD = -38;

  const whale = new SkyWhale({ length: len, seed: 3, birds: Number(params.get('birds') ?? 7) });
  whale.swim = Number(params.get('swim') ?? 0.6);
  scene.add(whale.root);
  // rider=1: a marker on the ride anchor (+Y up from the skin, +Z forward), to check it follows the back
  if (params.get('rider')) {
    const mk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), new THREE.MeshBasicMaterial({ color: '#e04040' }));
    mk.position.y = 0.6; whale.rideAnchor.add(mk);
  }

  // the cloud sea below, and a second whale cruising through its tops
  const C2 = new THREE.Vector3(170, CLOUD, -230);
  scene.add(cloudSea({ radius: 520, top: CLOUD, clumps: 110, seed: 2, avoid: { at: C2, r: 120 } }));
  scene.add(cloudSea({ center: C2, radius: 130, top: CLOUD, clumps: 46, seed: 9, flat: 0.5, size: 0.8 }));
  const whale2 = new SkyWhale({ length: len * 0.95, seed: 11, birds: 5, cloudTop: CLOUD });
  whale2.swim = 0.8;
  scene.add(whale2.root, whale2.wake!.mesh);

  // a far third whale for depth
  const whale3 = new SkyWhale({ length: len * 0.8, seed: 21, birds: 0, detail: 'low' });
  whale3.root.position.set(-260, -12, -420); whale3.root.rotation.y = 0.9;
  scene.add(whale3.root);

  // whale 2 cruises straight across in front of the cliff camera (wrapping round every 40 s; centred at t = 15)
  const place2 = (t: number) => {
    const x = C2.x - 45 + ((t * 3) % 120);
    const y = CLOUD + 3.5 + 4 * Math.sin(t * 0.16 + 0.5);
    whale2.root.position.set(x, y, C2.z);
    whale2.root.rotation.set(-Math.atan(4 * 0.16 * Math.cos(t * 0.16 + 0.5) / 3) * 0.8, Math.PI / 2, -0.06, 'YXZ');
  };
  place2(0);

  const e = whale.mesh.scale.x;
  const eye = new THREE.Vector3(0.09, 0, 0.5 - 0.212).multiplyScalar(e);
  let logged = false;
  const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  return {
    update(dt, t) {
      whale.update(dt, t);
      place2(t);
      whale2.update(dt, t);
      whale3.update(dt, t);
      if (!logged && t > 0.5) {
        logged = true;
        console.log(`whale tris ${whale.triangles} (+ gulls ${whale.gullTriangles}), low ${whale3.triangles}`);
        setTimeout(() => console.log('renderer info', JSON.stringify(ctx.renderer.info.render)), 500);
      }
    },
    views: {
      side: { pos: v(50, 3, 1), look: v(0, 0, 0), fov: 45 },
      threeq: { pos: v(27, 19, 31), look: v(0, -3, -2), fov: 45 },
      below: { pos: v(-34, -16, 30), look: v(0, 0, -1), fov: 45 },
      head: { pos: v(eye.x + 9, eye.y + 2.2, eye.z + 6.5), look: v(eye.x - 1, eye.y - 0.8, eye.z - 1), fov: 40 },
      clouds: { pos: v(C2.x - 25, CLOUD + 24, C2.z + 78), look: v(C2.x - 4, CLOUD + 1, C2.z), fov: 45 },
      far: { pos: v(-215, -4, -380), look: v(-260, -12, -420), fov: 45 },
      w2close: { pos: v(C2.x - 18, CLOUD + 10, C2.z + 42), look: v(C2.x - 2, CLOUD, C2.z), fov: 45 },
      top: { pos: v(18, 34, -8), look: v(0, 0, 0), fov: 45 },
    },
  };
}
