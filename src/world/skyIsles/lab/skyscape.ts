import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { CloudSea } from '../cloudSea';
import { CloudPad } from '../cloudPad';
import { paint, softRamp, addOutlines } from '../../../render/paint';

/**
 * Skyscape lab: the cloud sea of World 2 as it will sit in the game (a shell of radius 80 round (0, -80, 0), so
 * the sea's top is near y = 0 under the lab origin), with its far sea, towers, flocks and castle island, and a
 * few cloud pads. Plain stand-in islands give a sense of scale (props=0 hides them).
 * Query: R=radius, props=0, nosea=1, lands=1 (always on at golden hour), squash=1 (the first pad squashes at t = 1 s).
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params, golden } = ctx;
  const R = Number(params.get('R') ?? 80);
  // (the views look toward +Z at midday, with the sun ahead and to the left as in picture 1; the castle stands there too)
  const sea = new CloudSea({
    center: new THREE.Vector3(0, -R, 0), radius: R, seed: 2, lands: golden || params.get('lands') === '1',
    castle: { azimuth: 2.62 },
  });
  sea.setGolden(golden ? 1 : 0);
  sea.setHaze((scene.fog as THREE.FogExp2).color, golden ? 0.0012 : 0.0017);
  scene.add(sea.group);
  if (params.get('nosea')) sea.group.visible = false;
  // for perf checks: what the sea drew, and the renderer's last frame counts
  (window as any).__seaStats = () => ({ ...sea.stats, calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles });

  // cloud pads: a little hopping path off the near island
  const pads: CloudPad[] = [];
  const padAt: [number, number, number, number][] = [[-4, 26, 12, 4.2], [3, 24.5, 20, 3.4], [10, 25.5, 27, 3.0], [-8, 23, 26, 3.6]];
  padAt.forEach(([x, y, z, s], i) => {
    const p = new CloudPad({ size: s, seed: i + 3 });
    p.root.position.set(x, y, z);
    scene.add(p.root);
    pads.push(p);
  });
  // a Nilo-sized marker standing on the first pad (1.2 m)
  const toon = (c: string) => paint(new THREE.MeshToonMaterial({ color: c, gradientMap: softRamp() }));
  const nilo = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 12), toon('#c8553d'));
  nilo.castShadow = true;
  nilo.position.set(0, 0.6, 0);
  pads[0].root.add(nilo);

  // stand-in islands (plain cream rock with a green top), only to judge scale and depth
  if (params.get('props') !== '0') {
    const isle = (x: number, y: number, z: number, r: number) => {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.1, 9, 3), toon('#e2cfa6'));
      rock.rotation.x = Math.PI; rock.position.y = -r * 0.55;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 1.2, 9), toon('#8fc06a'));
      top.position.y = 0.4;
      rock.castShadow = top.castShadow = true; rock.receiveShadow = top.receiveShadow = true;
      g.add(rock, top);
      g.position.set(x, y, z);
      addOutlines(g, '#3b2a30', 0.05);
      scene.add(g);
    };
    isle(30, 26, 14, 13);
    isle(-40, 30, 80, 16);
    isle(70, 20, 115, 10);
  }

  let squashed = false, now = 0;
  // the lab can switch views without stepping (still shots), so also cull and sort for the camera at render time
  scene.onBeforeRender = (_r, _s, cam) => sea.update(0, now, cam);
  return {
    update(dt, t) {
      now = t;
      sea.update(dt, t, ctx.camera);
      if (params.get('squash') === '1' && !squashed && t > 1) { pads[0].squash(1); squashed = true; }
      for (const p of pads) p.update(dt, t);
      nilo.position.y = pads[0].topY + 0.6;
    },
    views: {
      // from island height, looking out over the sea (picture 1)
      // (the camera stays near the lab's pole, where the planet's up is the lab's +Y)
      midday: { pos: [0, 30, -8], look: [10, 19, 70], fov: 50 },
      // looking steeply down into the sea
      down: { pos: [0, 44, -8], look: [-3, 0, 22], fov: 50 },
      // toward the low sun at golden hour (picture 4; use light=golden)
      golden: { pos: [-4, 30, 4], look: [52, 21, -44], fov: 50 },
      // a close cloud pad with the Nilo-sized marker, from above and side-on at standing height
      pad: { pos: [-9, 27.9, 6], look: [-3.8, 25.8, 12.5], fov: 45 },
      padside: { pos: [-4, 26.8, 5], look: [-4, 26.2, 12], fov: 45 },
    },
  };
}
