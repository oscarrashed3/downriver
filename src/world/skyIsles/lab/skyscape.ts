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
 * ink=0 (turn the finish pass's cloud ink mask off, and the clouds' alpha mask with it, to compare).
 * The sea is composed for the views: hand-placed hero masses before the midday camera and under the steep view,
 * towers at both edges of the midday view, and at golden hour broad openings onto the lands to the right of the
 * sun (window.__sea and window.__seaStats() are there for debugging and perf checks).
 */
export default function (ctx: LabCtx): LabPiece {
  const { scene, params, golden } = ctx;
  const R = Number(params.get('R') ?? 80);
  // (the views look toward +Z at midday, with the sun ahead and to the left as in picture 1; the castle stands there too)
  // (golden: the sun and a tower in front of it lie toward azimuth ~0.86)
  const sunAz = Math.atan2(ctx.sunDir.x, -ctx.sunDir.z);
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const sea = new CloudSea({
    center: new THREE.Vector3(0, -R, 0), radius: R, seed: Number(params.get('seed') ?? 2),
    lands: golden || params.get('lands') === '1',
    castle: { azimuth: 2.95 },
    // walls of towering cumulus at both edges of the midday view; at golden hour one beside the sun
    towerAz: golden ? [sunAz + 0.3, sunAz - 0.55, 3.6, 2.5] : [3.72, 2.5, sunAz, 4.4],
    // hero masses: before the midday camera, under the steep view, and framing the golden view's openings
    masses: [
      { at: V(-15, 34), r: 23, h: 25 }, { at: V(22, 44), r: 20, h: 21 }, { at: V(-2, 60), r: 26, h: 26 },
      { at: V(31, -2), r: 20, h: 22 }, { at: V(10, -48), r: 22, h: 24 }, { at: V(-32, -18), r: 22, h: 22 },
    ],
    gaps: [{ at: V(18, -16), r: 26 }, { at: V(46, -44), r: 20 }],
    farGaps: [
      // (mostly to the right of the sun, as in picture 4, so the lands are not lost in its glare)
      { azimuth: sunAz + 0.42, distance: 250, r: 95 }, { azimuth: sunAz + 0.5, distance: 520, r: 190 },
      { azimuth: sunAz + 0.3, distance: 800, r: 240 }, { azimuth: sunAz + 0.05, distance: 1100, r: 300 },
    ],
  });
  sea.setGolden(golden ? 1 : 0);
  sea.setHaze((scene.fog as THREE.FogExp2).color, golden ? 0.0009 : 0.0011);
  // no ink through the clouds
  const inkMask = params.get('ink') !== '0';
  FINISH_CLOUD_MASK.value = inkMask ? 1 : 0;
  sea.setInkMask(inkMask);
  scene.add(sea.group);
  if (params.get('nosea')) sea.group.visible = false;
  // for perf checks: what the sea drew, and the renderer's last frame counts
  (window as any).__seaStats = () => sea.stats;
  (window as any).__sea = sea;

  // cloud pads: a little hopping path off the near island
  const pads: CloudPad[] = [];
  const padAt: [number, number, number, number][] = [[-4, 26, 12, 4.2], [3, 24.5, 20, 3.4], [10, 25.5, 27, 3.0], [-8, 23, 26, 3.6]];
  padAt.forEach(([x, y, z, s], i) => {
    const p = new CloudPad({ size: s, seed: i + 3 });
    p.root.position.set(x, y, z);
    scene.add(p.root);
    p.setInkMask(inkMask);
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
      const rm = toon('#e8d3a8'); rm.emissive.set('#3a3026');
      const rock = new THREE.Mesh(lg, rm);
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
