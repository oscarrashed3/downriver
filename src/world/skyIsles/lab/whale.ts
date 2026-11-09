import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { SkyWhale } from '../whale';
import { SoftCloudLayer, cloudDepthFloor, setPuffSun } from '../whaleClouds';

/**
 * Whale lab: one sky whale swimming in place above a cloud sea (for the profile, three-quarter, below, head,
 * head-on and top views), and a second, bigger one riding the cloud tops like picture 4: its pale belly at the
 * cloud line, cumulus heaped round its lower flanks, a stream of gulls lifting off behind (the "clouds" view
 * from about cliff height, and "w2close"; shoot them at t = 8, when it is centred). A far third whale (low
 * detail) is in the "far" view. The cloud sea here is a STAND-IN (heaps of the game's solid cumulus puffs) so
 * the whale is judged in context; the world brings its own clouds.
 * An invisible depth floor at the cloud tops keeps the finish pass from inking the cut where whale 2 dips in.
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
  // (a lane is kept clear along whale 2's path: it gathers its own cloud round it as it swims)
  const layer = new SoftCloudLayer({ radius: 620, top: CLOUD, count: 2400, seed: 2, corridor: { a: C2.clone().setX(C2.x - 90), b: C2.clone().setX(C2.x + 34), r: 7 } });
  scene.add(layer.mesh, cloudDepthFloor(CLOUD - 0.6));
  if (params.get('dbg') === 'nolayer') layer.mesh.visible = false;
  const whale2 = new SkyWhale({ length: len * 1.15, seed: 11, birds: Number(params.get('birds2') ?? 5), flock: 7, cloudTop: CLOUD });
  whale2.swim = 0.8;
  scene.add(whale2.root, whale2.wake!.mesh);
  if (params.get('dbg') === 'nowake') whale2.wake!.mesh.visible = false;
  if (params.get('dbg') === 'nocloud') whale2.cloudTop = null;

  // a far third whale for depth
  const whale3 = new SkyWhale({ length: len * 0.8, seed: 21, birds: 0, detail: 'low' });
  whale3.root.position.set(-200, -8, -330); whale3.root.rotation.y = 0.9;
  scene.add(whale3.root);

  // whale 2 cruises slowly across in front of the cliff camera (centred on C2 at t = 8), riding ON the cloud
  // sea like picture 4: the cloud tops at or just under its belly line, so the whole pale, pleated belly
  // shows and the clouds billow up round its lower third; it lifts and settles a little as it goes
  const L2 = whale2.length, V2 = 2.2;
  const place2 = (t: number) => {
    const x = C2.x + V2 * (t - 8);
    const y = CLOUD + L2 * 0.118 + L2 * 0.012 * Math.sin(t * 0.25 + 0.3);
    whale2.root.position.set(x, y, C2.z);
    whale2.root.rotation.set(-0.025 - Math.atan(L2 * 0.012 * 0.25 * Math.cos(t * 0.25 + 0.3) / V2) * 0.5, Math.PI / 2, -0.04, 'YXZ');
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
        setTimeout(() => console.log('renderer info', JSON.stringify(ctx.renderer.info.render), 'wake puffs', whale2.wake!.mesh.count), 500);
      }
    },
    views: {
      side: { pos: v(52, 2, 1), look: v(0, -1, -1), fov: 45 },
      threeq: { pos: v(22, 21, 36), look: v(0, -3, -3), fov: 45 },
      below: { pos: v(-20, -40, 28), look: v(0, -2, -4), fov: 45 },
      head: { pos: v(eye.x + 8.5, eye.y + 2.0, eye.z + 6), look: v(eye.x - 1, eye.y - 0.8, eye.z - 1.2), fov: 40 },
      headon: { pos: v(3, 6, 44), look: v(0, -1.5, 0), fov: 40 },
      top: { pos: v(16, 36, -6), look: v(0, 0, -2), fov: 45 },
      // from cliff height, above and behind like picture 4 (shoot at t = 8, when whale 2 is centred)
      clouds: { pos: v(C2.x - 44, CLOUD + 26, C2.z + 52), look: v(C2.x + 3, CLOUD + 3, C2.z), fov: 45 },
      w2close: { pos: v(C2.x + 10, CLOUD + 8, C2.z + 32), look: v(C2.x + 4, CLOUD + 3.5, C2.z), fov: 45 },
      far: { pos: v(-140, 0, -270), look: v(-200, -8, -330), fov: 45 },
    },
  };
}
