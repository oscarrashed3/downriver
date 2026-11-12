import * as THREE from 'three';
import type { Planet } from '../planet';
import type { Kit as WorldKit, Flat } from '../content';
import * as Q from '../props2';
import { orientTo } from '../sphere';
import { Kit, T } from '../skyIsles/sailtownKit';
import { Amble } from './amble';
import { Mossrest } from './mossrest';
import { CardBuilder } from './ambleGrowth';
import { CELL, ambleCardMaterial } from './ambleMaterials';
import { townRng } from './rand';
import { house, windmill } from './mossrestHouse';
import { tree, shrub } from './mossrestKit';
import { AMBLE_AT, PLACES, townDir, townFrame } from './meadow';

// World 3, the Walking Town (early afternoon). Old Amble stands in a golden meadow of daisies and lupins with
// Mossrest on its back; the land rolls away in green hills to a lake, a little town on a far hill, a river with
// a ford of stepping stones, a range of snowy blue mountains, and (behind, over the curve) the coast of the Sea.

const latLon = (p: Planet, d: THREE.Vector3) => {
  const lat = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI;
  const lon = Math.atan2(d.z, d.x) * 180 / Math.PI;
  return { lat, lon: ((lon - p.lonAtLat(lat) + 540) % 360) - 180 };
};

export function prepareTown(p: Planet, f: Flat) {
  // the edge pad where the river leaves, as every world has
  f(176, 0, 9, p.cfg.riverBed + 1.6, 6);
  // Amble's meadow: a broad, level pad
  const { A } = townFrame(p);
  p.flattens.push({ dir: A.clone(), radius: 36, height: 2.2, blend: 18 });
  // the far town's hill: its top levelled for the houses
  const hd = townDir(p, ...PLACES.hill);
  p.flattens.push({ dir: hd, radius: 8.5, height: p.baseHeight(hd), blend: 5 });
  // a worn cart track from the ford up to Amble's meadow
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 8; k++) pts.push(townDir(p, PLACES.ford[0] * (1 - k / 8) + 8 * (k / 8), PLACES.ford[1] * (1 - k / 8) - 14 * (k / 8)));
  p.paths.push({ pts, width: 1.3 });
}

/** Stand obj on the ground at direction d, facing fwd. */
function putAt(k: WorldKit, obj: THREE.Object3D, d: THREE.Vector3, fwd: THREE.Vector3, sink = 0.15) {
  k.p.surfacePoint(d, -sink, obj.position);
  orientTo(obj, d, fwd);
  obj.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  k.scene.add(obj);
  return obj;
}

export function populateTown(k: WorldKit) {
  const { p, c, scene, lm } = k;
  const { A, F } = townFrame(p);
  const r = townRng(31);

  // ---- Old Amble and Mossrest
  const amble = new Amble({ birds: 5 });
  p.surfacePoint(A, -0.05, amble.root.position);
  orientTo(amble.root, A, F);
  scene.add(amble.root);
  const town = new Mossrest(11);
  town.attach(amble.shellTop, amble.neckRide);
  amble.root.updateMatrixWorld(true);
  c.animate.push((dt, t) => amble.update(dt, t));
  c.refs.amble = amble; c.refs.town = town;
  lm('Old Amble and Mossrest', AMBLE_AT.lat, AMBLE_AT.lon, 'tower');

  // ---- the meadow round Amble's feet: long golden grass, daisies and lupins (one mesh)
  {
    const g = new THREE.Group();
    g.position.copy(amble.root.position); g.quaternion.copy(amble.root.quaternion);
    scene.add(g); g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const cb = new CardBuilder();
    const gold = [new THREE.Color('#e0c868'), new THREE.Color('#cdbb58'), new THREE.Color('#b8c05a'), new THREE.Color('#d8d07a')];
    const d = new THREE.Vector3(), wp = new THREE.Vector3(), up = new THREE.Vector3();
    const nInv = new THREE.Matrix3().setFromMatrix4(inv);
    for (let i = 0; i < 14000; i++) {
      const a = r() * Math.PI * 2, dist = 3 + Math.pow(r(), 0.75) * 85;
      townDir(p, Math.cos(a) * dist, Math.sin(a) * dist, d);
      if (p.riverNearest(d).dist < p.cfg.riverWidth + 2.5) continue;
      if (p.height(d) < (p.cfg.ocean ?? 0) + 0.2) continue;
      // keep the cards off the track and out from under Amble's feet
      p.surfacePoint(d, 0, wp).applyMatrix4(inv);
      up.copy(d).applyMatrix3(nInv).normalize();
      const r0 = r();
      const cell = r0 < 0.7 ? CELL.grass : r0 < 0.88 ? CELL.flowers : CELL.lupin;
      const sz = cell === CELL.grass ? 0.55 + r() * 0.4 : cell === CELL.lupin ? 0.55 + r() * 0.35 : 0.3 + r() * 0.15;
      const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, r() * Math.PI).projectOnPlane(up).normalize().multiplyScalar(sz);
      const col = cell === CELL.grass ? gold[Math.floor(r() * gold.length)] : new THREE.Color('#ffffff');
      const cc = wp.clone().addScaledVector(up, sz * (cell === CELL.flowers ? 0.6 : 0.95) - 0.05);
      cb.quad(cc, side, up.clone().multiplyScalar(sz), up, cell, col, [0, 0.03], r() * 10, [[0, 1]]);
      if (cell !== CELL.flowers) cb.quad(cc, side.clone().applyAxisAngle(up, Math.PI / 2), up.clone().multiplyScalar(sz), up, cell, col.clone().multiplyScalar(0.92), [0, 0.03], r() * 10, [[0, 1]]);
    }
    const mg = cb.geometry(); mg.deleteAttribute('skinIndex'); mg.deleteAttribute('skinWeight');
    const meadow = new THREE.Mesh(mg, ambleCardMaterial());
    meadow.renderOrder = 1; meadow.receiveShadow = true; meadow.name = 'meadowCards';
    meadow.userData.noOutline = true;
    g.add(meadow);
    c.refs.meadow = meadow;
  }

  // ---- rocks lying in the meadow, a few big ones on the hills
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, dist = 22 + r() * (i < 36 ? 60 : 170);
    const d = townDir(p, Math.cos(a) * dist, Math.sin(a) * dist);
    if (p.riverNearest(d).dist < p.cfg.riverWidth + 4) continue;
    if (p.height(d) < (p.cfg.ocean ?? 0) + 0.4) continue;
    const s = i < 36 ? 0.5 + r() * 1.1 : 1.2 + r() * 2;
    const b = Q.boulder(s);
    putAt(k, b, d, F.clone().applyAxisAngle(A, r() * 6), 0.25 * s);
    p.solids.push({ obj: b, shape: { kind: 'circle', r: s * 0.9 }, h: s * 1.2 });
  }

  // ---- trees on the rolling hills (never in the meadow round Amble)
  {
    const tk = new Kit();
    const holder = new THREE.Group(); holder.position.copy(p.center); scene.add(holder);
    let n = 0;
    for (let q = 0; q < 900 && n < 70; q++) {
      const a = r() * Math.PI * 2, dist = 55 + r() * 230;
      const d = townDir(p, Math.cos(a) * dist, Math.sin(a) * dist);
      if (p.riverNearest(d).dist < p.cfg.riverWidth + 6) continue;
      const h = p.height(d);
      if (h < (p.cfg.ocean ?? 0) + 0.8 || h > 20) continue;
      if (p.slope(d) > 0.35) continue;
      const at = d.clone().multiplyScalar(p.R + h - 0.2);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(d, F).normalize(), d, new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(d, F).normalize(), d)).setPosition(at);
      tk.push(m);
      if (r() < 0.25) shrub(tk, T(), r, 1.4 + r());
      else tree(tk, T(0, 0, 0, 0, r() * 6, 0), r, 5 + r() * 4, 1 + r() * 0.2);
      tk.pop();
      { const o = new THREE.Object3D(); o.position.copy(at).add(p.center); orientTo(o, d); p.solids.push({ obj: o, shape: { kind: 'circle', r: 0.6 }, h: 6 }); }
      n++;
    }
    tk.build(holder, { outline: false });
  }

  // ---- the ford: a line of flat stepping stones across the river by the cart track
  {
    const d0 = townDir(p, ...PLACES.ford);
    const t = p.riverNearest(d0).t;
    const cdir = p.pathPoint(t), tan = p.pathPoint(t + 0.004).sub(cdir).normalize();
    const sideV = new THREE.Vector3().crossVectors(cdir, tan).normalize();
    for (let s = -2; s <= 2; s++) {
      const dir = cdir.clone().addScaledVector(sideV, (s * p.cfg.riverWidth * 0.42) / p.R).normalize();
      const rock = Q.riverRock(0.75 + r() * 0.2, 0.35);
      p.surfacePoint(dir, -0.25, rock.position); orientTo(rock, dir, tan.clone().negate());
      scene.add(rock);
    }
    const ll = latLon(p, cdir);
    lm('The ford', ll.lat, ll.lon, 'stone');
  }

  // ---- the lake
  { const ll = latLon(p, townDir(p, ...PLACES.lake)); lm('The lake', ll.lat, ll.lon, 'spring'); }

  // ---- the little town on the far hill: a cluster of cottages and a windmill round the top
  {
    const hd = townDir(p, ...PLACES.hill);
    const hk = new Kit();
    const g = new THREE.Group();
    putAt(k, g, hd, F, 0.1);
    const hr = townRng(77);
    const top = p.R + p.height(hd);
    // the ground's local height at (x, z) on the levelled hilltop, over the curve
    const local = (x: number, z: number) => -(x * x + z * z) / (2 * top);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + hr() * 0.3, rr = i < 4 ? 3.2 + hr() : 6.2 + hr() * 1.2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      hk.push(T(x, local(x, z) + 0.15, z, 0, Math.atan2(x, z) + (hr() - 0.5) * 0.6, 0));
      house(hk, { w: 3.6 + hr(), d: 3.2 + hr() * 0.6, floors: 1 + Math.floor(hr() * 2), walkIn: false, seed: 900 + i * 7, plinth: 0.6, doorDrop: 0.2, ground: () => -0.6 });
      hk.pop();
    }
    hk.push(T(0, 0, 0, 0, 0.7, 0));
    const mill = windmill(hk, 21, false, 0.5, 1.1);
    hk.pop();
    mill.sails.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
    mill.sails.rotation.set(-0.12, 0.7, 0, 'YXZ');
    g.add(mill.sails);
    hk.build(g, { outline: false });
    c.animate.push((_dt, t) => { mill.sails.rotation.z = -t * 0.4; });
    const ll = latLon(p, hd);
    lm('The hill town', ll.lat, ll.lon, 'hut');
  }

  // ---- the mountains and the coast, for the map
  { const ll = latLon(p, townDir(p, ...PLACES.mts)); lm('The snowy mountains', ll.lat, ll.lon, 'peak'); }
  { const ll = latLon(p, townDir(p, ...PLACES.sea)); lm('The Sea', ll.lat, ll.lon, 'cloud'); }
}
