import * as THREE from 'three';
import type { LabCtx, LabPiece } from './types';
import { CloudSea } from '../cloudSea';
import { FINISH_CLOUD_MASK } from '../../../render/finish';
import { CloudPad } from '../cloudPad';
import { paint, softRamp, addOutlines } from '../../../render/paint';

/**
 * Skyscape lab: the cloud sea of World 2 as it will sit in the game (a shell of radius 80 round (0, -80, 0), so
 * the sea's top is near y = 0 under the lab origin), with its far sea, towers, flocks and castle island, and a
 * few cloud pads. Plain stand-in islands give a sense of scale (props=0 hides them).
 * Query: R=radius, props=0, nosea=1, lands=1 (always on at golden hour), squash=1 (the first pad squashes at t = 1 s),
 * ink=0 (turn the finish pass's cloud ink mask off, to compare).
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params, golden } = ctx;
  const R = Number(params.get('R') ?? 80);
  // (the views look toward +Z at midday, with the sun ahead and to the left as in picture 1; the castle stands there too)
  // (golden: the sun and a tower in front of it lie toward azimuth ~0.86)
  const sunAz = Math.atan2(ctx.sunDir.x, -ctx.sunDir.z);
  const sea = new CloudSea({
    center: new THREE.Vector3(0, -R, 0), radius: R, seed: Number(params.get('seed') ?? 2),
    lands: golden || params.get('lands') === '1',
    castle: { azimuth: 2.78 },
    towerAz: golden ? [sunAz - 0.1, 3.5, 2.1] : [3.5, 2.15, sunAz],
  });
  sea.setGolden(golden ? 1 : 0);
  sea.setHaze((scene.fog as THREE.FogExp2).color, golden ? 0.0009 : 0.0011);
  // no ink through the clouds
  FINISH_CLOUD_MASK.value = params.get('ink') === '0' ? 0 : 1;
  scene.add(sea.group);
  if (params.get('nosea')) sea.group.visible = false;
  // for perf checks: what the sea drew, and the renderer's last frame counts
  (window as any).__seaStats = () => sea.stats;

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
      // a rough lathe of cliff rock tapering to a point
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) { const f = i / 10; prof.push(new THREE.Vector2(r * (1 - Math.pow(f, 1.4)) * (0.95 + 0.05 * Math.sin(f * 11)) + 0.2, -f * r * 1.3)); }
      const lg = new THREE.LatheGeometry(prof.reverse(), 28);
      const lp = lg.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < lp.count; i++) {
        const a = Math.atan2(lp.getZ(i), lp.getX(i)), y = lp.getY(i);
        const k = 1 + 0.08 * Math.sin(a * 7 + y * 0.2) + 0.05 * Math.sin(a * 13 - y * 0.4);
        lp.setXYZ(i, lp.getX(i) * k, y, lp.getZ(i) * k);
      }
      lg.computeVertexNormals();
      const rock = new THREE.Mesh(lg, toon('#e2cfa6'));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 1.2, 28), toon('#8fc06a'));
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
      // (shots: t=1.25 catches the pad at its deepest squash, t=1.6 on its stretched rebound)
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
      // steeper toward the sun: the lands of World 3 through the openings (use light=golden)
      golddown: { pos: [-8, 40, 10], look: [12, 0, -8], fov: 50 },
      // a close cloud pad with the Nilo-sized marker, from above and side-on at standing height
      pad: { pos: [-9, 27.9, 6], look: [-3.8, 25.8, 12.5], fov: 45 },
      padside: { pos: [-4, 26.8, 5], look: [-4, 26.2, 12], fov: 45 },
    },
  };
}
