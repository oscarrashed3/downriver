import * as THREE from 'three';
import type { Planet } from './planet';
import * as P from './props';
import * as Q from './props2';
import { glacierEdgeLat } from './planet';
import { orientTo, angleBetween } from './sphere';
import type { WorldContent } from './content';
import type { Landmark } from '../systems/mapView';
import { smoothstep } from './noise';
import { makeHollo } from './hollo';
import { addLife } from './life';
import { leafClump } from '../render/foliage';
import { AREAS } from '../data/areas';
import type { Shape2 } from './collide';

/** Where everything in Chapter One stands: [lat from the north pole, degrees of longitude from the river]. */
export const PK = {
  spring: [13.2, 0], wake: [21.5, -5.2], holloFire: [21.0, -9.6], ysoldeSpring: [21.9, -1.8], tree: [15.6, 15.5], spar: [17.4, 19.0], benchSpring: [17.0, 6.6],
  fire: [60.2, -17.5], ysoldeHouse: [56.6, -26.5], ysoldeBench: [58.4, -22.6], bramHouse: [65.8, -28.8], torHouse: [65.6, -9.4],
  house4: [54.2, -11.4], house5: [67.6, -19.5], windmill: [51.8, -24.5], garden: [55.8, -16.8], laundry: [62.4, -25.6],
  woodpile: [60.4, -11.6], workbench: [59.2, -13.0], tor: [58.6, -14.2], bram: [66.0, -25.2], pen: [69.5, -31.5],
  bridge: [72.5, 0], odo: [72.9, 6.2], boathouse: [75.2, 11.5], dock: [77.0, 3.4],
  ridge: [50, 47], ridgeBench: [49.0, 43.6], nima: [46.5, 66], tallPeak: [40, 80], dryMeadow: [69, -41], runaway: [41, -64],
  edge: [176.5, 0],
  echo: [[24, 31], [90, -62], [104, 36], [132, -14], [152, 26]] as [number, number][],
  benches: [[17.0, 6.6], [49.0, 43.6], [100, 12], [58.4, -22.6]] as [number, number][],
  flowers: [[46.5, 61], [70, -45], [92, 9], [16, 4]] as [number, number][],
  lanterns: [[24, -8.6], [36, -11.8], [48, -14.6], [66.6, -10.2], [70.6, -5.4], [66, 19.5], [57, 33.5]] as [number, number][],
};

const PATHS: [number, number][][] = [
  [[14.5, -2.5], [18, -6], [24, -8.2], [30, -10.4], [38, -12.2], [46, -14.2], [53, -15.8], [58, -16.8]],
  [[61.5, -14.5], [64, -12], [66.5, -9.6], [70, -5.6], [72.5, -3.4]],
  [[72.5, 3.6], [71, 8], [66, 19], [60, 30], [54, 39], [50.5, 45]],
  [[72.5, 3.6], [73.4, 6], [74.4, 9]],
  [[62.8, -21.5], [65.5, -26.5], [67.5, -33], [68.8, -39]],
  [[50, 47], [48, 55], [46.8, 62]],
];

export function preparePeaks(p: Planet) {
  const f = (lat: number, lon: number, radius: number, height: number, blend = 8) =>
    p.flattens.push({ dir: p.dirRiver(lat, lon), radius, height, blend });
  f(13.5, 0, 6, p.cfg.riverBed + 0.5, 6);        // the spring hollow
  f(60, -17.5, 13, 4.2, 10);                     // the village shelf
  f(50, 47, 4, 11.2, 18);                        // Kite Ridge
  f(40, 80, 2.5, p.cfg.amplitude * 1.45, 16);    // the tall peak where clouds sleep
  f(75.2, 11.5, 3.2, 3.0, 5);                    // Odo's boathouse
  f(176, 0, 9, p.cfg.riverBed + 1.2, 8);         // the edge
  for (const a of AREAS.filter(x => x.world === 0)) p.tints.push({ dir: p.dirRiver(a.at[0], a.at[1]), r: a.r, color: new THREE.Color(a.ground), k: 0.32 });
  for (const pts of PATHS) p.paths.push({ pts: pts.map(([la, lo]) => p.dirRiver(la, lo)), width: 1.5 });
  const clear = (ll: number[], r: number) => p.clearings.push({ dir: p.dirRiver(ll[0], ll[1]), r });
  clear(PK.tree, 4.5);
  [PK.ysoldeHouse, PK.bramHouse, PK.torHouse, PK.house4, PK.house5].forEach(h => clear(h, 3.4));
  clear(PK.boathouse, 3); clear(PK.windmill, 2); clear(PK.fire, 2.4); clear(PK.spring, 5.5); clear(PK.holloFire, 2.2); clear(PK.garden, 1.8); clear(PK.workbench, 1.2);
}

/** Flower density over the world. */
export function peaksFlowers(p: Planet, d: THREE.Vector3): number {
  const near = (ll: number[], r: number) => smoothstep(r, r * 0.4, angleBetween(d, p.dirRiver(ll[0], ll[1])) * p.R);
  return Math.min(1, 0.06 + near(PK.nima, 16) * 1.0 + near(PK.spring, 10) * 0.6 + near([62, -18], 16) * 0.35 + near(PK.dryMeadow, 7) * 0.8 + near([100, 10], 12) * 0.5);
}

export function populatePeaks(p: Planet, scene: THREE.Scene, c: WorldContent,
  put: (obj: THREE.Object3D, lat: number, lon: number, offset?: number, face?: 'river' | THREE.Vector3, sink?: number) => THREE.Object3D,
  npc: (id: string, lat: number, lon: number) => void,
  lm: (name: string, lat: number, lon: number, icon: Landmark['icon']) => void) {
  const at = (ll: number[] | [number, number]) => p.surfacePoint(p.dirRiver(ll[0], ll[1]));
  const faceTo = (from: number[], to: number[]) => at(to).sub(at(from));
  const anim = (f: (dt: number, t: number) => void) => c.animate.push(f);
  const R = c.refs;
  const solid = (obj: THREE.Object3D, shape: Shape2, h: number, id?: string) => { p.solids.push({ obj, shape, h, id }); return obj; };
  const box = (hw: number, hd: number): Shape2 => ({ kind: 'box', hw, hd });
  const circle = (r: number): Shape2 => ({ kind: 'circle', r });

  // ---- the spring and the old tree
  const spring = put(Q.springBasin(), PK.spring[0], PK.spring[1], 0); R.spring = spring;
  lm('The spring', 13, 0, 'spring');
  // Hollo, asleep on the spring
  const hollo = makeHollo(); R.hollo = hollo;
  put(hollo.root, PK.spring[0], PK.spring[1], 0, faceTo(PK.spring, PK.wake), 0.2);
  hollo.root.scale.setScalar(1.45);
  // Hollo's body, and his big head resting out in front of it
  p.solids.push({ obj: hollo.root, shape: circle(2.75), h: 5, id: 'hollo', camPad: 1.6 });
  p.solids.push({ obj: hollo.root, shape: circle(1.75), h: 4, off: [0, 3.7], id: 'hollo-head', camPad: 1.0 });
  anim((dt, t) => hollo.update(dt, t));
  // the fire Ysolde will light beside it on the long night
  const hf = put(P.campfire(), PK.holloFire[0], PK.holloFire[1], 0); R.holloFire = hf; hf.visible = false;
  solid(hf, circle(0.9), 0.6, 'hollofire');
  anim((dt, t) => { if (!hf.visible) return; hf.userData.spirit.update(t, dt); hf.userData.light.intensity = 26 + Math.sin(t * 17) * 4 + Math.sin(t * 5.3) * 3; });
  const tree = put(Q.oldTree(), PK.tree[0], PK.tree[1], 0, undefined, 0.4);
  solid(tree, circle(2.0), 9, 'oldtree');
  const chimes = Q.treeChimes(); chimes.position.set(2.6, 7.6, 2.4); chimes.scale.setScalar(1.6); tree.add(chimes); R.chimes = chimes;
  R.tree = tree;
  anim((_dt, t) => (chimes.userData.icicles as THREE.Object3D[]).forEach((ic, i) => (ic.rotation.z = Math.sin(t * 1.4 + i * 0.9) * 0.12)));
  anim((_dt, t) => (tree.userData.leaves as THREE.Object3D[]).forEach((l, i) => (l.rotation.z = Math.sin(t * 0.9 + i) * 0.03)));
  // the willow's strands swing in the valley wind, a ripple running round the crown
  anim((_dt, t) => (tree.userData.strands as THREE.Object3D[]).forEach((st, i) => { const a = st.userData.a as number; const w = Math.sin(t * 1.1 + a * 2) * 0.12 + Math.sin(t * 2.3 + i) * 0.04; st.rotation.x = Math.sin(a) * w + 0.06; st.rotation.z = -Math.cos(a) * w + 0.08; }));
  R.spar = put(Q.willowBranch(), PK.spar[0], PK.spar[1], 0.05);
  lm('The old tree', PK.tree[0], PK.tree[1], 'spring');

  // ---- Ysolde's stones, under the little glacier tongue in the side valley
  c.refs.stones = [] as THREE.Object3D[];
  for (let i = 0; i < 9; i++) put(P.stone(1.6 + P.rand() * 0.6, false), 27 + i * 0.8, 18 + (P.rand() - 0.5) * 5, 0);
  const hist = [0.62, 0.55, 0.49, 0.42, 0.36, 0.3];
  hist.forEach((v, i) => c.refs.stones.push(put(P.stone(2.2, true), glacierEdgeLat(v) + 1, 16 + (i % 2) * 2.5, 0)));
  lm("Ysolde's stones", 24, 17, 'stone');

  // ---- Hearth village
  const houses: THREE.Object3D[] = [];
  const house = (ll: number[], opts: Parameters<typeof Q.cottage>[0]) => { const h = put(Q.cottage(opts), ll[0], ll[1], 0, faceTo(ll, PK.fire), 0.3); houses.push(h); solid(h, box((opts?.w ?? 4.2) / 2 + 0.2, (opts?.d ?? 3.6) / 2 + 0.2), 6, 'house'); h.userData.doorAt = new THREE.Vector3(-(opts?.w ?? 4.2) * 0.18, 0, (opts?.d ?? 3.6) / 2 + 0.75); h.userData.wall = opts?.wall; return h; };
  house(PK.ysoldeHouse, { wall: '#f1e6d2', roof: '#a8533a', door: '#5d5a8a' });
  house(PK.bramHouse, { wall: '#e8dcc4', roof: '#8a5a3a', door: '#6a4a34', w: 4.8 });
  house(PK.torHouse, { wall: '#f4ecdc', roof: '#3f6a8a', door: '#d8483a', flowers: '#7fa8d8' });
  house(PK.house4, { wall: '#efe2d0', roof: '#b0603e', door: '#4f7a5a' });
  house(PK.house5, { wall: '#f2e8d8', roof: '#9a4a3a', door: '#3f6a8a', w: 3.8 });
  R.houses = { ysolde: houses[0], bram: houses[1], tor: houses[2], nima: houses[3], empty: houses[4] };
  R.chimneys = houses.map(h => h.localToWorld((h.userData.chimney as THREE.Vector3).clone()));
  const fire = put(P.campfire(), PK.fire[0], PK.fire[1], 0); R.fire = fire;
  solid(fire, circle(0.9), 0.6, 'fire');
  anim((dt, t) => { fire.userData.spirit.update(t, dt); fire.userData.light.intensity = 26 + Math.sin(t * 17) * 4 + Math.sin(t * 5.3) * 3; });
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const log = put(Q.woodpile(), PK.fire[0] + Math.cos(a) * 2.6, PK.fire[1] + Math.sin(a) * 3.0, 0, faceTo([PK.fire[0] + Math.cos(a) * 2.6, PK.fire[1] + Math.sin(a) * 3.0], PK.fire)); log.scale.set(0.6, 0.45, 0.5); }
  lm('Hearth village', 60, -17, 'hut');
  const mill = put(Q.windmill(), PK.windmill[0], PK.windmill[1], 0, faceTo(PK.windmill, [50, 0]), 0.2);
  solid(mill, circle(1.45), 7, 'windmill');
  anim(dt => (mill.userData.hub.rotation.z += dt * 0.7));
  put(Q.gardenPatch(), PK.garden[0], PK.garden[1], 0, faceTo(PK.garden, PK.fire));
  put(Q.woodpile(), PK.woodpile[0], PK.woodpile[1], 0, faceTo(PK.woodpile, PK.fire));
  put(Q.workbench(), PK.workbench[0], PK.workbench[1], 0, faceTo(PK.workbench, PK.tor));
  // Grandpa's kite lies broken on the bench until the willow branch fixes it
  const bk = Q.torKite(); bk.scale.setScalar(0.55);
  const wb = at(PK.workbench), wup = wb.clone().sub(p.center).normalize();
  bk.position.copy(wb).addScaledVector(wup, 0.98);
  orientTo(bk, wup, faceTo(PK.workbench, PK.tor)); bk.rotateX(-Math.PI / 2 + 0.12); bk.rotateZ(0.5);
  (bk.userData.tail as THREE.Object3D[]).forEach((t, i) => (t.rotation.x = i ? 0.5 : 0.2));
  scene.add(bk); R.benchKite = bk;
  const cloth: THREE.Object3D[] = [];
  const lnd = put(Q.laundry(4.2), PK.laundry[0], PK.laundry[1], 0, faceTo(PK.laundry, PK.fire)); cloth.push(...lnd.userData.cloth);
  const lnd2 = put(Q.laundry(3.4), 64.2, -15.2, 0, faceTo([64.2, -15.2], PK.fire)); cloth.push(...lnd2.userData.cloth);
  R.cloth = cloth;
  const flags: THREE.Object3D[] = [];
  const bunt = (a: number[], b: number[], hgt: number) => {
    const pa = at(a), pb = at(b); const mid = pa.clone().lerp(pb, 0.5); const len = pa.distanceTo(pb);
    const up = mid.clone().sub(p.center).normalize();
    const g = Q.bunting(len, 0.6); g.position.copy(mid).addScaledVector(up, hgt);
    orientTo(g, up, new THREE.Vector3().crossVectors(up, pb.clone().sub(pa)).normalize());
    scene.add(g); flags.push(...g.userData.flags);
  };
  bunt([58.6, -21.8], [61.8, -13.8], 3.6); bunt([62.4, -22.2], [62.6, -14.2], 3.3);
  R.flags = flags;
  // washing on the line lifts and swings too
  anim((_dt, t) => (R.cloth as THREE.Object3D[]).forEach((c, i) => { c.rotation.x = 0.18 + Math.sin(t * 1.9 + i * 0.8) * 0.22 + Math.sin(t * 5.3 + i) * 0.04; c.rotation.y = Math.sin(t * 1.3 + i) * 0.1; }));
  // the little flags swing and flutter in the wind, each a beat behind the one before
  anim((_dt, t) => flags.forEach((f, i) => { const gust = 0.6 + 0.4 * Math.sin(t * 0.37 + i * 0.05); f.rotation.x = (0.25 + Math.sin(t * 2.6 - i * 0.55) * 0.3 + Math.sin(t * 7.1 + i) * 0.06) * gust; f.rotation.z = Math.sin(t * 3.3 - i * 0.7) * 0.12 * gust; }));
  R.lanterns = PK.lanterns.map(ll => put(Q.lanternPost(), ll[0], ll[1], 0, faceTo(ll, [ll[0], 0])));
  for (let i = 0; i < 3; i++) solid(put(Q.stoneWall(5), 68 + i * 2.2, -30 - i * 4, 0, faceTo([68 + i * 2.2, -30 - i * 4], [68 + i * 2.2, -20])), box(2.6, 0.32), 0.62, 'wall');
  solid(put(Q.goatShed(), PK.pen[0] + 1.5, PK.pen[1] - 5, 0, faceTo([PK.pen[0] + 1.5, PK.pen[1] - 5], PK.fire)), circle(1.85), 2.6, 'shed');

  // ---- little stone cairns mark the way from the bridge up to Kite Ridge
  const route = PATHS[2];
  for (let i = 0; i + 1 < route.length; i++) for (let t = 0.35; t < 1; t += 0.5) {
    const la = route[i][0] + (route[i + 1][0] - route[i][0]) * t, lo = route[i][1] + (route[i + 1][1] - route[i][1]) * t;
    const side = (i + (t > 0.5 ? 1 : 0)) % 2 ? 1.6 : -1.6;
    put(Q.cairn(), la, lo + side, 0).scale.setScalar(1.7);
  }

  // ---- benches (places to sit and look)
  R.benches = PK.benches.map((ll, i) => i === 3 ? put(Q.bench(), ll[0], ll[1], 0, faceTo(ll, PK.fire)) : put(Q.bench(), ll[0], ll[1], 0, faceTo(ll, i === 1 ? [70, 40] : [ll[0] + 10, ll[1]])));

  // ---- people: never on the bridge itself (or its steps) or in the spring basin
  c.avoid.push({ pos: at([PK.bridge[0], 0]), r: 7.8 }, { pos: at(PK.spring), r: 3.8 });
  npc('ysolde', PK.ysoldeSpring[0], PK.ysoldeSpring[1]);
  npc('tor', PK.tor[0], PK.tor[1]);
  npc('bram', PK.bram[0], PK.bram[1]);
  npc('nima', PK.nima[0], PK.nima[1]);
  npc('odo', PK.odo[0], PK.odo[1]);

  // ---- goats: a herd by the pen, three by the river, and Pebble the runaway on the west cliffs
  R.goats = [] as { obj: THREE.Object3D; home: THREE.Vector3; dir: THREE.Vector3; t: number; look: number }[];
  const goatAt = (la: number, lo: number) => {
    const g = put(P.goat(), la, lo, 0, undefined, 0.05);
    addOutlinesSoft(g);
    R.goats.push({ obj: g, home: p.dirRiver(la, lo), dir: p.dirRiver(la, lo), t: Math.random() * 5, look: 0 });
    return g;
  };
  for (let i = 0; i < 5; i++) goatAt(PK.pen[0] - 1 + P.rand() * 4, PK.pen[1] - P.rand() * 6);
  for (const [la, lo] of [[94, -9], [96, -12], [99, -8.5]]) goatAt(la, lo);
  const pebble = P.goat(); pebble.scale.setScalar(0.7); addOutlinesSoft(pebble);
  R.pebble = put(pebble, PK.runaway[0], PK.runaway[1], 0, undefined, 0.05);
  lm('West cliffs', PK.runaway[0], PK.runaway[1], 'peak');

  // ---- the old bridge, Odo's boathouse, the dock
  const bdir = p.dirRiver(PK.bridge[0], 0);
  const br = Q.bridge(10, 2.4);
  p.surfacePoint(bdir, 1.0, br.position);
  orientTo(br, bdir, p.surfacePoint(p.dirRiver(PK.bridge[0], 10)).sub(br.position));
  br.rotateY(Math.PI / 2);
  scene.add(br); R.bridge = br;
  // the bridge deck is walkable: planks at 0.96 + an arch, as in Q.bridge(10, 2.4)
  // past each end, the abutment stones make a short ramp down to the bank (the banks sit lower than the deck ends)
  p.solids.push({ obj: br, shape: { kind: 'box', hw: 6.9, hd: 1.6 }, h: 3.6, camOnly: true, id: 'bridge' });
  p.decks.push({ obj: br, span: 14, width: 2.4, top: x => Math.abs(x) <= 5 ? 0.96 + Math.sin((x / 10 + 0.5) * Math.PI) * 1.1 : 0.96 - (Math.abs(x) - 5) * 0.34 });
  const bh = put(Q.boathouse(), PK.boathouse[0], PK.boathouse[1], 0, faceTo(PK.boathouse, PK.bridge), 0.3); R.boathouse = bh; bh.userData.doorAt = new THREE.Vector3(-3.6 * 0.18, 0, 3.2 / 2 + 0.75);
  solid(bh, box(2.0, 1.8), 6, 'boathouse');
  R.cloth.push(...(bh.userData.cloth as THREE.Object3D[]));
  lm('The old bridge', PK.bridge[0], 0, 'arch');

  // ---- Kite Ridge, Cloud Meadow, the tall peak
  lm('Kite Ridge', PK.ridge[0], PK.ridge[1], 'peak');
  const tk = Q.torKite(); tk.visible = false; scene.add(tk); R.torKite = tk;
  const wisp = put(P.cloudWisp(), PK.tallPeak[0], PK.tallPeak[1], 3.5); c.refs.wisp = wisp;
  anim((_dt, t) => { wisp.children.forEach((ch2, i) => (ch2.position.y += Math.sin(t * 0.8 + i) * 0.003)); });
  lm('The tall peak', PK.tallPeak[0], PK.tallPeak[1], 'cloud');
  lm('Cloud Meadow', PK.nima[0], PK.nima[1], 'cloud');
  c.refs.meadow = [] as THREE.Mesh[];
  for (let i = 0; i < 26; i++) { const g = P.sprout(); (g.material as THREE.MeshToonMaterial) = P.toon('#c8b06a'); put(g, 66 + P.rand() * 6, -38 - P.rand() * 8, 0, undefined, 0.05); c.refs.meadow.push(g); }
  lm('Dry meadow', PK.dryMeadow[0], PK.dryMeadow[1], 'hut');

  // ---- Grandpa's snow poles, fence posts and ice tower sites
  c.refs.poles = [[46, -38], [72, 40], [98, -28]].map(([la, lo], i) => { lm(`Pole ${i + 1}`, la, lo, 'pole'); return { obj: put(P.pole(), la, lo, 0), lat: la, lon: lo }; });
  const sites: Record<string, [number, number]> = {
    'fence-north-ridge': [30, -40], 'fence-saddle': [44, 52], 'fence-east-shoulder': [60, 44],
    'fence-lee-hollow': [52, -58], 'fence-south-bowl': [86, -48], 'stupa-west': [17, -14], 'stupa-east': [17.5, 13.5],
  };
  c.refs.siteSpots = sites;
  c.refs.cairns = {} as Record<string, THREE.Object3D>;
  for (const [id, [la, lo]] of Object.entries(sites)) {
    if (id.startsWith('fence')) {
      // Grandpa's old posts, waiting for rails
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6 + P.rand() * 0.4, 0.18), P.toon('#6a5444')); m.position.set(-3 + i * 1.5, 0.8, 0); m.rotation.z = (P.rand() - 0.5) * 0.25; m.castShadow = true; g.add(m); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.07, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring); g.userData.ring = ring;
      const e = at([la, lo + 3]).sub(at([la, lo]));
      c.refs.cairns[id] = put(g, la, lo, 0, e);
    } else c.refs.cairns[id] = put(P.cairn('#9fdcff'), la, lo, 0);
  }
  const cornice = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.toon('#ffffff'));
  cornice.scale.set(1.4, 0.5, 0.8);
  c.refs.cornice = put(cornice, 42, -92, 0.3);
  lm('East road', 44, -90, 'peak'); lm('West road', 50, -112, 'peak');

  // ---- echo stones
  R.echoes = PK.echo.map(ll => solid(put(Q.echoStone(), ll[0], ll[1], 0, faceTo(ll, [ll[0], 0]), 0.2), circle(0.55), 2.3, 'echo')); // stones are solid: you walk round them
  anim((_dt, t) => (R.echoes as THREE.Object3D[]).forEach((e, i) => { const m = e.userData.glow as THREE.MeshBasicMaterial; if (!e.userData.heard) m.opacity = 0.18 + 0.12 * Math.sin(t * 1.5 + i); }));

  // ---- trees and boulders, kept clear of paths, places and the river
  const keep = [PK.spring, PK.fire, PK.bridge, PK.boathouse, PK.ridge, PK.nima, PK.tallPeak, PK.windmill, PK.pen, PK.dryMeadow, PK.runaway, ...PK.echo, ...PK.benches, [24, 17], [30, -40], [44, 52], [60, 44], [52, -58], [86, -48], [17, -14], [17.5, 13.5], [46, -38], [72, 40], [98, -28], [176, 0]];
  const keepDirs = keep.map(ll => p.dirRiver(ll[0], ll[1]));
  const free = (d: THREE.Vector3, r: number) => p.riverNearest(d).dist > 7 && p.pathDist(d).dist > 2.6 && keepDirs.every(k => angleBetween(d, k) * p.R > r) && p.height(d) / p.cfg.amplitude < 0.78;
  // every tree's leaf clumps nod a little in the wind, each tree on its own beat
  const swaying: THREE.Object3D[][] = [];
  anim((_dt, t) => swaying.forEach((ls, k) => ls.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.1 + k * 1.7 + i * 0.6) * 0.05; l.rotation.x = Math.sin(t * 0.8 + k + i) * 0.035; })));
  const grove = (la: number, lo: number, n: number, spread: number, make: () => THREE.Object3D) => {
    let placed = 0;
    for (let tries = 0; tries < n * 12 && placed < n; tries++) {
      const a = P.rand() * Math.PI * 2, r = Math.sqrt(P.rand()) * spread;
      const lat = la + Math.cos(a) * r, lon = lo + Math.sin(a) * r * 1.3;
      const d = p.dirRiver(lat, lon);
      if (!free(d, 6) || p.slope(d) > 0.6) continue;
      const o = make(); o.rotateY(P.rand() * 6); put(o, lat, lon, 0, undefined, 0.3); solid(o, circle(o.userData.trunk ?? 0.3), 8, 'tree'); placed++;
      if (o.userData.leaves) swaying.push(o.userData.leaves as THREE.Object3D[]);
    }
  };
  for (const [la, lo] of [[32, -26], [40, 28], [78, 38], [84, -44], [108, -22], [116, 26], [134, 4], [150, -30], [140, 40], [96, 60], [100, -70], [26, -50]]) grove(la, lo, 9, 10, () => Q.alpinePine(5 + P.rand() * 4));
  for (const [la, lo] of [[20, 14], [47, -27], [70, 16], [56, -4]]) grove(la, lo, 4, 6, () => Q.birch(4 + P.rand() * 2));
  // blossom trees round the village, like an old orchard the houses grew into
  for (const [la, lo] of [[53, -26], [66, -8], [49, -9], [70, -26]]) grove(la, lo, 2, 4.5, () => Q.blossomTree(3.8 + P.rand() * 1.2));
  for (const [la, lo] of [[44, 30], [58, 24], [64, -34], [38, -18], [82, 20], [90, -16], [30, 8]]) grove(la, lo, 3, 7, () => Q.birch(3.5 + P.rand() * 2.5));
  // leafy bushes along the valley sides, so the slopes read lush instead of bare
  const greens = ['#5a9a3a', '#4e8c36', '#6aa844', '#3f7d34'];
  let bu = 0;
  for (let tries = 0; tries < 600 && bu < 46; tries++) {
    const lat = 18 + P.rand() * 95, lon = (P.rand() * 2 - 1) * 75;
    const d = p.dirRiver(lat, lon);
    if (!free(d, 4) || p.slope(d) > 0.55) continue;
    const g = new THREE.Group();
    const n = P.rand() < 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) { const cl = leafClump({ radius: 0.7 + P.rand() * 0.6, color: greens[(bu + k) % 4], cards: 16, seed: bu * 3 + k, squash: 0.7 }); cl.position.set(k * 0.9 - 0.4, 0.45, (P.rand() - 0.5) * 0.6); g.add(cl); }
    put(g, lat, lon, 0, undefined, 0.15); bu++;
  }
  let bo = 0;
  for (let tries = 0; tries < 400 && bo < 34; tries++) {
    const lat = 15 + P.rand() * 160, lon = (P.rand() * 2 - 1) * 170;
    const d = p.dirRiver(lat, lon);
    if (!free(d, 5)) continue;
    const bs = 0.6 + P.rand() * 1.1; solid(put(Q.boulder(bs), lat, lon, 0, undefined, 0.4), circle(0.95 * bs), 1.0 * bs, 'boulder'); bo++;
  }
  // rocks in the river for the raft to steer around
  R.riverRocks = [] as { t: number; side: number }[];
  for (let t = 0.39; t < 0.95; t += 0.045 + P.rand() * 0.03) {
    const side = (P.rand() * 2 - 1) * 0.55;
    const d = p.pathPoint(t);
    const d2 = p.pathPoint(t + 0.004);
    const tan = d2.clone().sub(d).normalize();
    const sideV = new THREE.Vector3().crossVectors(d, tan).normalize();
    const w = p.cfg.riverWidth;
    const dir = d.clone().addScaledVector(sideV, -side * w / p.R).normalize();
    // the stone sits on the river bed, a third of it under the water, its moss facing upstream
    const waterY = Math.max(0.15, Math.min(0.6, p.waterLevelRadius() - p.surfaceRadius(dir)));
    const rock = Q.riverRock(0.6 + P.rand() * 0.3, waterY);
    p.surfacePoint(dir, 0, rock.position); orientTo(rock, dir, tan.clone().negate());
    scene.add(rock);
    R.riverRocks.push({ t, side, obj: rock });
  }
  // a dock where the raft can always be boarded
  put(Q.dock(), PK.dock[0], PK.dock[1], 0, faceTo(PK.dock, [PK.dock[0], 0]));
  // hens, a cat, butterflies, ducks, fish, birds, marmots, hares, bees and little things on the ground
  addLife(p, scene, c);
}

function addOutlinesSoft(o: THREE.Object3D) {
  o.traverse(m => { (m as THREE.Mesh).castShadow = true; });
}
