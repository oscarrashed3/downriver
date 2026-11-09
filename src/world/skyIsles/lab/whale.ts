import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { SkyWhale } from '../whale';
import { SoftCloudLayer, cloudDepthFloor, setPuffSun } from '../whaleClouds';

/**
 * Whale lab: one sky whale swimming in place above a cloud sea (for the profile, three-quarter, below, head
 * and head-on views), and a second, bigger one cruising half sunk in the cloud tops, melting into them and
 * leaving a cloud wake (the "clouds" view from about cliff height, and "w2close").
 * The cloud layer here is a STAND-IN (soft billboard puffs, no ink) so the whale is judged in context;
 * the world brings its own clouds.
 * An invisible depth floor at the cloud tops keeps the finish pass from inking the cut where whale 2 sinks.
 * Query: swim=0..1 (default 0.6), birds=N, birds2=N (whale 2), len=metres, rider=1 (marker on the ride
 * anchor); dbg=ns (whale 1 casts no shadow) | nowake | nocloud (whale 2 ignores the clouds) | nolayer.
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  setPuffSun(ctx.sunDir);
  const len = Number(params.get('len') ?? 36);
  const CLOUD = -38;

  const whale = new SkyWhale({ length: len, seed: 3, birds: Number(params.get('birds') ?? 7) });
  whale.swim = Number(params.get('swim') ?? 0.6);
  scene.add(whale.root);
  if (params.get('dbg') === 'ns') whale.root.traverse(o => { o.castShadow = false; });
  // rider=1: a marker on the ride anchor (+Y up from the skin, +Z forward), to check it follows the back
  if (params.get('rider')) {
    const mk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), new THREE.MeshBasicMaterial({ color: '#e04040' }));
    mk.position.y = 0.6; whale.rideAnchor.add(mk);
  }

  // the stand-in cloud sea below, and a second whale cruising through its tops
  const C2 = new THREE.Vector3(170, CLOUD, -230);
  const layer = new SoftCloudLayer({ radius: 620, top: CLOUD, count: 1400, seed: 2 });
  scene.add(layer.mesh, cloudDepthFloor(CLOUD - 0.6));
  if (params.get('dbg') === 'nolayer') layer.mesh.visible = false;
  const whale2 = new SkyWhale({ length: len * 1.15, seed: 11, birds: Number(params.get('birds2') ?? 5), cloudTop: CLOUD });
  whale2.swim = 0.8;
  scene.add(whale2.root, whale2.wake!.mesh);
  if (params.get('dbg') === 'nowake') whale2.wake!.mesh.visible = false;
  if (params.get('dbg') === 'nocloud') whale2.cloudTop = null;

  // a far third whale for depth
  const whale3 = new SkyWhale({ length: len * 0.8, seed: 21, birds: 0, detail: 'low' });
  whale3.root.position.set(-260, -12, -420); whale3.root.rotation.y = 0.9;
  scene.add(whale3.root);

  // whale 2 cruises straight across in front of the cliff camera (wrapping round every 40 s; centred at t = 15),
  // rising and sinking slowly so the cloud tops cover its belly and flippers, then only its flanks
  const place2 = (t: number) => {
    const x = C2.x - 45 + ((t * 3) % 120);
    const y = CLOUD + 1.2 + 3.2 * Math.sin(t * 0.16 + 0.5);
    whale2.root.position.set(x, y, C2.z);
    whale2.root.rotation.set(-Math.atan(3.2 * 0.16 * Math.cos(t * 0.16 + 0.5) / 3) * 0.8, Math.PI / 2, -0.05, 'YXZ');
  };
  place2(0);

  const e = whale.mesh.scale.x;
  const eye = new THREE.Vector3(0.085, -0.004, 0.5 - 0.214).multiplyScalar(e);
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
      side: { pos: v(52, 2, 1), look: v(0, -1, -1), fov: 45 },
      threeq: { pos: v(22, 21, 36), look: v(0, -3, -3), fov: 45 },
      below: { pos: v(-32, -17, 26), look: v(0, -1, -2), fov: 45 },
      head: { pos: v(eye.x + 8.5, eye.y + 2.0, eye.z + 6), look: v(eye.x - 1, eye.y - 0.8, eye.z - 1.2), fov: 40 },
      headon: { pos: v(6, 3, 40), look: v(0, -0.5, 0), fov: 40 },
      top: { pos: v(16, 36, -6), look: v(0, 0, -2), fov: 45 },
      clouds: { pos: v(C2.x - 6, CLOUD + 19, C2.z + 50), look: v(C2.x - 2, CLOUD + 0.5, C2.z), fov: 45 },
      w2close: { pos: v(C2.x - 14, CLOUD + 10, C2.z + 32), look: v(C2.x - 4, CLOUD + 0.5, C2.z), fov: 45 },
      far: { pos: v(-215, -4, -380), look: v(-260, -12, -420), fov: 45 },
    },
  };
}
