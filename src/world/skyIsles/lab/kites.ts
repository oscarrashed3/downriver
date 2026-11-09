import * as THREE from 'three';
import type { LabCtx, LabPiece, LabView } from './types';
import { KiteWing, type WingState } from '../kiteWing';
import { StandInRider, RACERS, type RacerKind } from '../kiteRider';
import { FestivalKite, KiteParade } from '../kites';
import { Person } from '../../../player/person';
import { toon } from '../../props';
import { PAINT } from '../../../render/paint';

/**
 * Kites lab. Five little sets far apart, each with its own views:
 *  - formation (x 0): Nilo, Zephy, Lark and Gran Wren racing over the cloud sea (views race, threeQ, chase)
 *  - bank (x 2500): Nilo's wing close up, banking hard (views bank, bankTop, top, under)
 *  - dive (z 2500): Zephy in a steep dive, cloth snapping, wind lines (views dive, diveFront)
 *  - land (z -2500): Nilo comes in, flares, runs, and the wing folds (view land; an 8 s loop, shoot several t)
 *  - festival (x -2500): a sky full of festival kites seen from below, two children flying hero kites (views festival, kids)
 * Query: fold=0..1 forces the fold on every wing.
 */
/** The sets sit far enough apart that the fog hides each from the others. */
const BX = 2500, FX = -2500, DX = 0, DZ = 2500, LX = 0, LZ = -2500;

export default function (ctx: LabCtx): LabPiece {
  const { scene, params } = ctx;
  const forceFold = params.has('fold') ? Number(params.get('fold')) : null;
  const updates: ((dt: number, t: number) => void)[] = [];
  // draw calls and triangles per piece, for the notes (window.__kiteStats)
  const stats: Record<string, { draws: number; tris: number } | number> = {};
  (window as unknown as { __kiteStats: typeof stats }).__kiteStats = stats;
  (window as unknown as { __kiteScene: THREE.Scene }).__kiteScene = scene;

  // ------------------------------------------------ dressing: cloud sea and cloud towers (lab only)
  scene.add(cloudSea([[0, 0], [BX, 0], [DX, DZ], [LX, LZ], [FX, 0]]));

  // ------------------------------------------------ riders
  const niloLook = {
    wanderer: true, skin: '#7a5038', hair: '#2e1e18', hairStyle: 'messy' as const, top: '#2a3048', coat: '#c49a6c', facets: true,
    trousers: '#3e2a24', boots: '#7a4a2c', scarf: '#2e3456', satchel: true, hood: '#c49a6c', glowEyes: '#ffc24a', props: ['boatPeek' as const],
  };
  function nilo() { return new Person(niloLook); }
  function racer(kind: RacerKind) {
    const wing = new KiteWing({ pattern: kind, span: kind === 'lark' ? 3.8 : 4.0, windLines: !params.has('nowind') });
    const r = new StandInRider(kind);
    wing.setRider(r, { anchor: r.scarfRoot, color: RACERS[kind].scarf, length: kind === 'wren' ? 1.9 : 2.7, width: 0.2 });
    return { wing, r };
  }
  function niloWing() {
    const wing = new KiteWing({ pattern: 'nilo', span: 3.9 });
    const p = nilo();
    wing.setRider(p, { anchor: p.neck, color: '#3a4a86', length: 2.4, width: 0.19 });
    return { wing, p };
  }
  {
    const p = nilo(); p.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(p.root);
    stats.niloHeight = +b.max.y.toFixed(2);
    const r = new StandInRider('zephy'); r.root.updateMatrixWorld(true);
    stats.zephyHeight = +new THREE.Box3().setFromObject(r.root).max.y.toFixed(2);
  }

  // ------------------------------------------------ formation
  {
    const N = niloWing();
    const Z = racer('zephy'), L = racer('lark'), W = racer('wren');
    const slots: [KiteWing, THREE.Vector3, number, Person | null, number][] = [
      [Z.wing, new THREE.Vector3(2.6, -0.6, 3.5), 1.3, null, 0.42],
      [L.wing, new THREE.Vector3(-1.5, 6.2, 2.5), 2.6, null, 0.36],
      [N.wing, new THREE.Vector3(-3.2, -3.4, 5.5), 0, N.p, 0.3],
      [W.wing, new THREE.Vector3(-7.5, 2.4, -3.0), 3.9, null, 0.38],
    ];
    for (const [w, p] of slots) { w.root.position.copy(p); w.root.rotation.y = -0.35; scene.add(w.root); }
    stats.niloWing = count(N.wing.root); stats.zephyWing = count(Z.wing.root);
    stats.niloWingOnly = count(N.wing.root, N.p.root); stats.zephyWingOnly = count(Z.wing.root, Z.r.root);
    updates.push((dt, t) => {
      for (const [w, p, ph, person, bank] of slots) {
        person?.animate(dt, { speed: 0, grounded: true });
        w.root.position.set(p.x + Math.sin(t * 0.37 + ph) * 0.4, p.y + Math.sin(t * 0.53 + ph) * 0.3, p.z);
        w.fold(forceFold ?? 0);
        w.update(dt, t, { speed: 21, bank: bank + Math.sin(t * 0.45 + ph) * 0.08, pitch: 0.04, dive: 0 });
      }
    });
  }

  // ------------------------------------------------ bank close-up
  {
    const N = niloWing();
    N.wing.root.position.set(BX, 0, 0);
    scene.add(N.wing.root);
    updates.push((dt, t) => {
      N.p.animate(dt, { speed: 0, grounded: true });
      N.wing.fold(forceFold ?? 0);
      N.wing.update(dt, t, { speed: 18, bank: 0.55 + Math.sin(t * 0.8) * 0.05, pitch: 0.05, dive: 0 });
    });
  }

  // ------------------------------------------------ dive
  {
    const Z = racer('zephy');
    Z.wing.root.position.set(DX, 0, DZ);
    scene.add(Z.wing.root);
    updates.push((dt, t) => {
      Z.wing.fold(forceFold ?? 0);
      Z.wing.update(dt, t, { speed: 36, bank: -0.12 + Math.sin(t * 1.3) * 0.05, pitch: -0.2, dive: 1 });
    });
  }

  // ------------------------------------------------ landing: glide in, flare, touch down, run, fold (an 8 s loop)
  {
    scene.add(meadow(LX, 0, LZ, 60));
    const N = niloWing();
    scene.add(N.wing.root);
    const T = 8;
    updates.push((dt, t) => {
      const u = t % T;
      const sm = (a: number, b: number) => { const k = Math.min(1, Math.max(0, (u - a) / (b - a))); return k * k * (3 - 2 * k); };
      // along +Z: glide down (0..2.4 s), flare (2.2..3.1), touch down and run (3.0..5.0), stop, fold (5.0..7.2), hold
      const flare = sm(2.2, 3.1), touch = sm(2.9, 3.2), run = sm(3.0, 3.3) * (1 - sm(4.4, 5.2)), fold = sm(5.0, 7.2);
      const tau = Math.min(2.2, Math.max(0, u - 3.1));
      const z = -4 - 9 * Math.max(0, 3.1 - u) + 4.6 * (tau - tau * tau / 4.4);
      const glideY = N.wing.groundHeight + 0.6 + Math.max(0, 3.0 - u) * 1.3 + (1 - flare) * 0.6;
      N.wing.root.position.set(LX, THREE.MathUtils.lerp(glideY, N.wing.groundHeight, touch), LZ + z);
      N.p.animate(dt, { speed: run * 4.5, grounded: true });
      N.wing.fold(forceFold ?? fold);
      const s: WingState = {
        speed: THREE.MathUtils.lerp(15, 3, flare) * (1 - touch * 0.6), bank: 0.05 * Math.sin(u * 1.3) * (1 - flare),
        // the flare: bar pushed out, nose up; then held level overhead on the run
        pitch: flare * (1 - touch) * 0.55 + touch * 0.12 - (1 - flare) * 0.05, dive: 0, upright: flare, run: run * 4.5,
      };
      N.wing.update(dt, t, s);
    });
  }

  // ------------------------------------------------ festival: a sky of kites over the village green
  {
    const X = FX;
    scene.add(meadow(X, 0, 0, 90));
    const wind = new THREE.Vector3(1, 0, 0.3).normalize();
    // a few dozen far kites (one parade), then a handful of big readable ones nearer the camera
    const parade = new KiteParade({ count: 26, center: new THREE.Vector3(X + 34, 0, 26), radius: 46, height: [16, 32], seed: 4, wind });
    scene.add(parade.root);
    updates.push((dt, t) => parade.update(dt, t));
    stats.parade26 = count(parade.root);
    // two children with hero kites
    const kids: StandInRider[] = [new StandInRider('lark'), new StandInRider('zephy')];
    kids.forEach((k, i) => {
      k.root.position.set(X - 4 + i * 2.6, 0, -6 + i * 1.4); k.root.rotation.y = 1.25 + i * 0.1;
      k.root.scale.setScalar(0.85);
      scene.add(k.root);
    });
    const heroes = [
      new FestivalKite({ colors: ['#e0483a', '#f4c03e', '#f28c38', '#f6ecd4'], anchor: new THREE.Vector3(), height: 7, seed: 1.3, size: 1.25, wind }),
      new FestivalKite({ colors: ['#3f78c8', '#f6ecd4', '#5ab4c8', '#f4c03e'], anchor: new THREE.Vector3(), height: 9.5, seed: 2.9, size: 1.15, wind }),
      new FestivalKite({ colors: ['#e8708a', '#f6ecd4', '#9a7ad0', '#f4c03e'], anchor: new THREE.Vector3(X + 7, 5.6, 6), height: 8, seed: 5.1, size: 1.4, wind }),
      new FestivalKite({ colors: ['#8cc46a', '#f4c03e', '#f6ecd4', '#e0483a'], anchor: new THREE.Vector3(X + 14, 0.8, -8), height: 12, seed: 7.7, size: 1.6, wind }),
    ];
    heroes.forEach(h => scene.add(h.root));
    stats.festivalKite = count(heroes[0].root);
    // a pole the third kite is tied to
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), toon('#8a5e36')); pole.position.set(X + 7, 2.8, 6); pole.castShadow = true; scene.add(pole);
    updates.push((dt, t) => {
      kids.forEach((k, i) => {
        k.update(dt, 0);
        // the string hand up high and forward, the other at the chest holding the spool
        k.arms[1].sh.rotation.set(-2.3 + Math.sin(t * 1.1 + i) * 0.1, 0, 0.25); k.arms[1].el.rotation.x = -0.25;
        k.arms[0].sh.rotation.set(-1.0, 0, -0.35); k.arms[0].el.rotation.x = -1.2;
        k.head.rotation.x = -0.55;
        k.root.updateMatrixWorld(true);
        k.hands[1].getWorldPosition(heroes[i].anchor);
      });
      heroes.forEach(h => h.update(dt, t));
    });
  }

  const views: Record<string, LabView> = {
    // like picture 3: slightly below and beside the racers, wings big in frame, bright cloud behind
    race: { pos: [10, -4.6, 9], look: [-2.6, 0.9, -1.5], fov: 44 },
    threeQ: { pos: [-9, 1.2, 10], look: [0, 0.6, 0], fov: 46 },
    chase: { pos: [3.5, 1.2, -15], look: [-1.5, 0.6, 1], fov: 44 },
    bank: { pos: [BX - 4.2, -1.0, 4.6], look: [BX, -0.4, 0], fov: 42 },
    bankTop: { pos: [BX + 3.5, 4.2, -3.5], look: [BX, -0.3, 0.3], fov: 45 },
    top: { pos: [BX + 0.01, 9, 0], look: [BX, 0, 0], fov: 40 },
    under: { pos: [BX + 1.2, -6, 3], look: [BX, -0.4, 0], fov: 46 },
    dive: { pos: [DX + 5.5, 0.8, DZ + 3], look: [DX, -0.5, DZ - 0.3], fov: 48 },
    diveFront: { pos: [DX + 2.5, -2.5, DZ + 7], look: [DX, -0.4, DZ], fov: 48 },
    land: { pos: [LX - 7, 3.4, LZ + 3], look: [LX, 1.3, LZ - 1.5], fov: 56 },
    festival: { pos: [FX - 6, 1.6, -10], look: [FX + 10, 14, 4], fov: 62 },
    kids: { pos: [FX - 1.5, 1.2, -13.5], look: [FX + 2.5, 4.2, -3], fov: 55 },
  };
  console.log('kiteStats ' + JSON.stringify(stats));
  return {
    views,
    update(dt, t) { PAINT.uTime.value = t; for (const u of updates) u(dt, t); },
  };
}

/** Meshes (one draw call each, before shadows) and triangles under `o`, leaving out `skip`. */
function count(o: THREE.Object3D, skip?: THREE.Object3D) {
  let draws = 0, tris = 0;
  o.traverse(c => {
    if (skip && (c === skip || isUnder(c, skip))) return;
    const m = c as THREE.Mesh;
    if (!(m.isMesh || (c as THREE.Line).isLine)) return;
    draws++;
    const g = m.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    tris += (m.isMesh ? n / 3 : 0) * ((m as THREE.InstancedMesh).count ?? 1);
  });
  return { draws, tris: Math.round(tris) };
}
function isUnder(c: THREE.Object3D, p: THREE.Object3D) { for (let q = c.parent; q; q = q.parent) if (q === p) return true; return false; }

// ---------------------------------------------------------------- lab dressing

/** A sea of white cumulus heaps below each set, and tall towers rising from it all round (instanced spheres, warm-lit toon). */
function cloudSea(centers: [number, number][]) {
  const heaps = 60, per = 9, towers = 12, tper = 40, n = centers.length * (heaps * per + towers * tper);
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), toon('#fdf8f0'), n);
  let s = 77;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  let i = 0;
  for (const [cx, cz] of centers) {
    for (let h = 0; h < heaps; h++) {
      const a = rnd() * Math.PI * 2, r = 40 + Math.sqrt(rnd()) * 380, R = 14 + rnd() * 20;
      const hx = cx + Math.cos(a) * r, hz = cz + Math.sin(a) * r, hy = -70 - rnd() * 12;
      for (let k = 0; k < per; k++) {
        // a flat wide base, then rounder puffs stacked on top towards the middle
        const top = k > 2, b = rnd() * Math.PI * 2, d = top ? rnd() * R * 0.6 : R * (0.4 + rnd() * 0.5);
        const rr = top ? R * (0.45 + rnd() * 0.35) : R * (0.6 + rnd() * 0.3);
        p.set(hx + Math.cos(b) * d, hy + (top ? R * 0.25 + rnd() * R * 0.35 : 0), hz + Math.sin(b) * d);
        sc.set(rr, rr * (top ? 0.85 : 0.5), rr);
        M.compose(p, q, sc); m.setMatrixAt(i++, M);
      }
    }
    // towering cumulus far off, so a camera looking level or a little up still sees bright cloud behind:
    // puffs scattered through a dome, big and low at the base, smaller towards the top
    for (let h = 0; h < towers; h++) {
      const a = (h / towers) * Math.PI * 2 + rnd() * 0.3, r = 190 + rnd() * 110, R = 30 + rnd() * 26;
      const hx = cx + Math.cos(a) * r, hz = cz + Math.sin(a) * r, H = 40 + rnd() * 60;
      for (let k = 0; k < tper; k++) {
        const yk = Math.pow(rnd(), 1.4), w = R * Math.sqrt(1 - yk * yk) * 0.9 + 4, b = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * w;
        const rr = (R * 0.45) * (1 - yk * 0.45) * (0.6 + rnd() * 0.5);
        p.set(hx + Math.cos(b) * d, -78 + yk * H, hz + Math.sin(b) * d);
        sc.set(rr, rr * 0.82, rr);
        M.compose(p, q, sc); m.setMatrixAt(i++, M);
      }
    }
  }
  m.count = i;
  m.userData.noOutline = true;
  return m;
}

/** A grassy island top to land on: green turf over a cream cliff. */
function meadow(x: number, y: number, z: number, r: number) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 1.2, 48), toon('#8cc46a'));
  top.position.set(x, y - 0.6, z); top.receiveShadow = true;
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.55, 30, 32), toon('#e8d8b4'));
  cliff.position.set(x, y - 16, z); cliff.receiveShadow = true;
  g.add(top, cliff);
  // a few flower dots
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), toon('#ffffff'), 400);
  const M = new THREE.Matrix4(); let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cols = ['#f4a6c0', '#b8a2e8', '#f6d65a', '#ffffff'];
  for (let i = 0; i < 400; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.95;
    M.makeTranslation(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr); fl.setMatrixAt(i, M);
    fl.setColorAt(i, new THREE.Color(cols[i % 4]));
  }
  g.add(fl);
  g.traverse(o => (o.userData.noOutline = true));
  return g;
}
