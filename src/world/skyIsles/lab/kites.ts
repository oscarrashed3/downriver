import * as THREE from 'three';
import type { LabCtx, LabPiece, LabView } from './types';
import { KiteWing, type WingState } from '../kiteWing';
import { StandInRider, RACERS, type RacerKind } from '../kiteRider';
import { FestivalKite, KiteParade } from '../kites';
import { sailTexture } from '../kitePanels';
import { Person } from '../../../player/person';
import { toon } from '../../props';
import { ribbonMesh, ribbonUniforms } from '../kiteCloth';
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
/** Nilo's Person scaled to a child of about 1.5 m (with the hood), the racers' size. */
const NILO_K = 0.76;
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
  function racer(kind: RacerKind) {
    const wing = new KiteWing({ pattern: kind, span: kind === 'lark' ? 3.8 : kind === 'wren' ? 3.7 : 4.1, windLines: !params.has('nowind') });
    const r = new StandInRider(kind);
    wing.setRider(r, { anchor: r.scarfRoot, color: RACERS[kind].scarf, length: kind === 'wren' ? 2.2 : 2.8, width: kind === 'wren' ? 0.34 : 0.42 });
    return { wing, r };
  }
  function niloWing() {
    const wing = new KiteWing({ pattern: 'nilo', span: 4.0 });
    const p = new Person(niloLook);
    p.root.scale.setScalar(NILO_K);
    // where the scarf ends and the hood's cape leave Nilo's back
    const scarfAt = new THREE.Group(); scarfAt.position.set(0.05, 0.62, -0.13); p.torso.add(scarfAt);
    const capeAt = new THREE.Group(); capeAt.position.set(0, 0.6, -0.17); p.torso.add(capeAt);
    wing.setRider(p, { anchor: scarfAt, color: '#2e3456', length: 2.7, width: 0.42 }, { anchor: capeAt, color: '#c49a6c', length: 0.85, width: 0.46 });
    return { wing, p };
  }
  {
    const p = new Person(niloLook); p.root.scale.setScalar(NILO_K); p.root.updateMatrixWorld(true);
    stats.niloHeight = +new THREE.Box3().setFromObject(p.root).max.y.toFixed(2);
    const r = new StandInRider('zephy'); r.root.updateMatrixWorld(true);
    stats.zephyHeight = +new THREE.Box3().setFromObject(r.root).max.y.toFixed(2);
  }

  // ------------------------------------------------ formation (picture 3): Zephy big in front, Lark and Wren behind, Nilo low over a cliff
  {
    scene.add(cliff(9, -4.5, -12, 6.5, 70, 3));
    scene.add(cliff(30, -8, 10, 10, 70, 5));
    const N = niloWing();
    const Z = racer('zephy'), L = racer('lark'), W = racer('wren');
    const slots: [KiteWing, THREE.Vector3, number, Person | null, number][] = [
      [Z.wing, new THREE.Vector3(0, 0, 2), 1.3, null, 0.42],
      [L.wing, new THREE.Vector3(5, 0.6, 0.6), 2.6, null, 0.38],
      [W.wing, new THREE.Vector3(10, 1.2, -1.6), 3.9, null, 0.34],
      [N.wing, new THREE.Vector3(2.6, -2.3, -3.6), 0, N.p, 0.34],
    ];
    for (const [w, p] of slots) { w.root.position.copy(p); w.root.rotation.y = -0.28; scene.add(w.root); }
    stats.niloWing = count(N.wing.root); stats.zephyWing = count(Z.wing.root);
    stats.niloWingOnly = count(N.wing.root, N.p.root); stats.zephyWingOnly = count(Z.wing.root, Z.r.root);
    updates.push((dt, t) => {
      for (const [w, p, ph, person, bank] of slots) {
        person?.animate(dt, { speed: 0, grounded: true });
        w.root.position.set(p.x + Math.sin(t * 0.37 + ph) * 0.3, p.y + Math.sin(t * 0.53 + ph) * 0.25, p.z);
        w.fold(forceFold ?? 0);
        w.update(dt, t, { speed: 21, bank: bank + Math.sin(t * 0.45 + ph) * 0.06, pitch: 0.02, dive: 0 });
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
      N.wing.update(dt, t, { speed: 18, bank: 0.5 + Math.sin(t * 0.8) * 0.05, pitch: 0.05, dive: 0 });
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

  // ------------------------------------------------ landing: glide in, flare, swing down, touch down, run, fold (an 8 s loop)
  {
    scene.add(meadow(LX, 0, LZ, 60));
    const N = niloWing();
    scene.add(N.wing.root);
    const T = 8;
    updates.push((dt, t) => {
      const u = t % T;
      const sm = (a: number, b: number) => { const k = Math.min(1, Math.max(0, (u - a) / (b - a))); return k * k * (3 - 2 * k); };
      // along +Z: glide down (0..2.4 s), flare and swing down under the wing (2.2..3.1), touch down and run (3.0..5.0), stop, fold (5.0..7.4), hold
      const flare = sm(2.2, 3.1), upright = sm(2.4, 3.1), touch = sm(2.9, 3.2), run = sm(3.0, 3.3) * (1 - sm(4.4, 5.2)), fold = sm(5.0, 7.4);
      const tau = Math.min(2.2, Math.max(0, u - 3.1));
      const z = -4 - 9 * Math.max(0, 3.1 - u) + 4.6 * (tau - tau * tau / 4.4);
      const glideY = N.wing.groundHeight + 0.6 + Math.max(0, 3.0 - u) * 1.3 + (1 - flare) * 0.6;
      N.wing.root.position.set(LX, THREE.MathUtils.lerp(glideY, N.wing.groundHeight, touch), LZ + z);
      N.p.animate(dt, { speed: run * 4.5, grounded: true });
      N.wing.fold(forceFold ?? fold);
      const s: WingState = {
        speed: THREE.MathUtils.lerp(15, 3, flare) * (1 - touch * 0.6), bank: 0.05 * Math.sin(u * 1.3) * (1 - flare),
        // the flare: nose up; then held level overhead on the run
        pitch: flare * (1 - touch) * 0.5 + touch * 0.1 - (1 - flare) * 0.05, dive: 0, upright, run: run * 4.5,
      };
      N.wing.update(dt, t, s);
    });
  }

  // ------------------------------------------------ fold stills: Nilo standing, the wing folded by ?fk= (default animated over 8 s)
  {
    const X = BX, Z0 = DZ;
    scene.add(meadow(X, 0, Z0, 40));
    for (const [i, pat] of (['nilo', 'zephy'] as const).entries()) {
      const w = pat === 'nilo' ? niloWing() : null;
      const r = pat === 'zephy' ? racer('zephy') : null;
      const wing = (w ?? r)!.wing;
      wing.root.position.set(X + i * 4.5, wing.groundHeight, Z0);
      scene.add(wing.root);
      const fk = params.has('fk') ? Number(params.get('fk')) : null;
      updates.push((dt, t) => {
        w?.p.animate(dt, { speed: 0, grounded: true });
        wing.fold(fk ?? Math.min(1, Math.max(0, (t % 8 - 1) / 6)));
        wing.update(dt, t, { speed: 3, bank: 0, pitch: 0.08, dive: 0, upright: 1, run: 0 });
      });
    }
  }

  // ------------------------------------------------ festival: a sky of kites over the village green
  {
    const X = FX;
    scene.add(meadow(X, 0, 0, 90));
    const wind = new THREE.Vector3(1, 0, 0.3).normalize();
    // a few cottages, a festival pole with a flag: things to tie kite strings to
    const ridges: THREE.Vector3[] = [];
    for (const [cx, cz, ry] of [[X + 6, 8, 0.3], [X + 14, -3, -0.2], [X + 24, 14, 0.5], [X + 34, 2, 0.1], [X + 44, 20, -0.3], [X + 30, 30, 0.2]] as [number, number, number][]) {
      const c = cottage(cx, cz, ry, ridges.length / 2); scene.add(c.root); ridges.push(...c.ridge);
    }
    const pole = festivalPole(X + 3.5, -1.5);
    scene.add(pole.root);
    updates.push((dt) => pole.update(dt));
    // a few dozen far kites (one parade) tied to the roofs, the pole and far-off hands, then big readable ones nearer
    const far: THREE.Vector3[] = [...ridges, pole.top];
    for (let i = 0; i < 22; i++) far.push(new THREE.Vector3(X + 8 + (i % 6) * 11 + Math.sin(i * 3.1) * 4, 1.1, -18 + Math.floor(i / 6) * 16 + Math.cos(i * 1.7) * 5));
    const parade = new KiteParade({ count: 30, anchors: far, height: [14, 32], size: [1.3, 3.4], seed: 4, wind });
    scene.add(parade.root);
    updates.push((dt, t) => parade.update(dt, t));
    stats.parade30 = count(parade.root);
    // three children with hero kites, in festival hats and scarves (the game's own people, child-sized)
    const kidLooks = [
      { height: 0.62, head: 1.35, skin: '#e8b898', hair: '#5a3624', hairStyle: 'pigtails' as const, top: '#f1e6d0', coat: '#e8a0a8', coatLen: 0.55, dress: true, trousers: '#6a5a48', boots: '#7a4a2c', scarf: '#5aa0e6', hat: 'wide' as const, hatColor: '#e8d090' },
      { height: 0.66, head: 1.3, skin: '#a8724e', hair: '#2e1e18', hairStyle: 'messy' as const, top: '#f1ead8', coat: '#efe2c4', coatLen: 0.6, trousers: '#5d4a3c', boots: '#5a3824', scarf: '#d8402f', satchel: true },
      { height: 0.58, head: 1.38, skin: '#f0c8a8', hair: '#c88a44', hairStyle: 'curly' as const, top: '#f6ecd4', coat: '#f6ecd4', coatLen: 0.5, dress: true, trousers: '#6a5a48', boots: '#6a4430', scarf: '#f2c43a', hat: 'wide' as const, hatColor: '#f0dca0' },
    ];
    const kids = kidLooks.map((L, i) => {
      const k = new Person(L);
      k.root.position.set(X - 4 + i * 2.2, 0, -6 + i * 1.1); k.root.rotation.y = 1.2 + i * 0.12;
      scene.add(k.root);
      return k;
    });
    const heroes = [
      new FestivalKite({ colors: ['#e0483a', '#f4c03e', '#f28c38', '#f6ecd4'], anchor: new THREE.Vector3(), height: 7, seed: 1.3, size: 1.25, shape: 0, pattern: 0, wind }),
      new FestivalKite({ colors: ['#3f78c8', '#f6ecd4', '#f4c03e', '#e0483a'], anchor: new THREE.Vector3(), height: 9.5, seed: 2.9, size: 1.1, shape: 1, pattern: 3, streamers: 3, wind }),
      new FestivalKite({ colors: ['#8cc46a', '#f6ecd4', '#e8709a', '#f4c03e'], anchor: new THREE.Vector3(), height: 6, seed: 4.4, size: 0.95, shape: 2, pattern: 1, wind }),
      new FestivalKite({ colors: ['#e8709a', '#f6ecd4', '#9a7ad0', '#f4c03e'], anchor: ridges[0].clone(), height: 10, seed: 5.1, size: 1.6, shape: 1, pattern: 2, streamers: 3, wind }),
      new FestivalKite({ colors: ['#f28c38', '#4a7cc8', '#f6ecd4', '#e0483a'], anchor: pole.top.clone(), height: 12, seed: 7.7, size: 1.9, shape: 2, pattern: 0, tassels: true, wind }),
    ];
    heroes.forEach(h => scene.add(h.root));
    stats.festivalKite = count(heroes[0].root);
    updates.push((dt, t) => {
      kids.forEach((k, i) => {
        k.animate(dt, { speed: 0, grounded: true, smile: 1 });
        // the string hand up high and forward, the other at the chest holding the spool
        k.arms[1].sh.rotation.set(-2.4 + Math.sin(t * 1.1 + i) * 0.1, 0, 0.25); k.arms[1].el.rotation.set(-0.25, 0, 0);
        k.arms[0].sh.rotation.set(-1.0, 0, -0.35); k.arms[0].el.rotation.set(-1.2, 0, 0);
        k.head.rotation.x = -0.45;
        k.root.updateMatrixWorld(true);
        k.arms[1].hand.getWorldPosition(heroes[i].anchor);
      });
      heroes.forEach(h => h.update(dt, t));
    });
  }

  const views: Record<string, LabView> = {
    // like picture 3: three-quarter from above, the sails facing the camera
    race: { pos: [-4.6, 3.6, 3.2], look: [3.4, -0.7, -0.6], fov: 54 },
    zTop: { pos: [0.01, 6, 2.5], look: [0, 0, 2.5], fov: 50 },
    threeQ: { pos: [3.0, 4.4, 8.6], look: [1.2, -0.6, 0.4], fov: 50 },
    chase: { pos: [-3.5, 4.2, -11], look: [3, -0.2, 2], fov: 48 },
    bank: { pos: [BX - 4.6, 2.6, 3.4], look: [BX, -0.1, -0.2], fov: 42 },
    bankTop: { pos: [BX + 3.5, 4.2, -3.5], look: [BX, -0.3, 0.3], fov: 45 },
    top: { pos: [BX + 0.01, 9, 0], look: [BX, 0, 0], fov: 40 },
    under: { pos: [BX + 1.2, -6, 3], look: [BX, -0.4, 0], fov: 46 },
    dive: { pos: [DX + 5.5, 1.6, DZ + 3], look: [DX, -0.5, DZ - 0.3], fov: 48 },
    diveFront: { pos: [DX + 2.5, -2.0, DZ + 7], look: [DX, -0.4, DZ], fov: 48 },
    land: { pos: [LX - 4.8, 3.4, LZ + 6.0], look: [LX, 1.0, LZ - 0.6], fov: 56 },
    fold: { pos: [BX + 2.2, 4.2, DZ + 6.5], look: [BX + 2.2, 1.0, DZ], fov: 50 },
    foldN: { pos: [BX - 2.6, 3.5, DZ + 3.4], look: [BX + 0.2, 1.1, DZ + 0.2], fov: 50 },
    foldZ: { pos: [BX + 4.5 + 2.6, 3.5, DZ + 3.4], look: [BX + 4.3, 1.1, DZ + 0.2], fov: 50 },
    festival: { pos: [FX - 5, 1.4, -11], look: [FX + 12, 13, 6], fov: 64 },
    kids: { pos: [FX - 5.5, 1.5, -13], look: [FX + 1.5, 3.6, -3], fov: 55 },
  };
  (window as unknown as { __sail: (p: string) => string }).__sail = (p: string) => (sailTexture(p as 'zephy', 4).image as HTMLCanvasElement).toDataURL();
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
    if (!(m.isMesh || (c as THREE.Line).isLine) || !m.geometry.attributes.position) return;
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

/** A cream and pale-gold cliff column with a green top and a few flower dots (lab dressing). */
function cliff(x: number, top: number, z: number, r: number, h: number, seed: number) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r * 0.7, h, 18, 10);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
    const k = 1 + 0.12 * Math.sin(a * 5 + seed) + 0.07 * Math.sin(a * 11 + vy * 0.3 + seed * 2) + 0.05 * Math.sin(vy * 0.5 + seed);
    p.setXYZ(i, vx * k, vy, vz * k);
  }
  const rock = new THREE.Mesh(geo.toNonIndexed(), toon('#f2e4c0', '#8a7250', 0.45));
  rock.geometry.computeVertexNormals();
  rock.position.set(x, top - h / 2, z);
  const turf = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#8cc46a'));
  turf.scale.set(1, 0.18, 1); turf.position.set(x, top - 0.4, z);
  g.add(rock, turf);
  return g;
}

/** A Sailtown cottage: cream walls, a blue slate roof; returns the two ends of the roof ridge (to tie kites to). */
function cottage(x: number, z: number, ry: number, k = 0) {
  const ROOFS = [['#c8583a', '#7a2c1e'], ['#3f8a86', '#1e4a4a'], ['#d89a3a', '#8a5a1c'], ['#a24a5a', '#5a2232'], ['#5a76a8', '#26385a'], ['#7a9a4a', '#3a5222']];
  const WALLS = [['#f8e2bc', '#c4895a'], ['#f4d4c4', '#b87a6a'], ['#fbeccc', '#c09a62']];
  const rc = ROOFS[k % ROOFS.length], wc = WALLS[k % WALLS.length];
  const root = new THREE.Group();
  root.position.set(x, 0, z); root.rotation.y = ry;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 3.4), toon(wc[0], wc[1], 0.4)); walls.position.y = 1.4;
  // a triangular prism along x, apex up
  const roofG = new THREE.CylinderGeometry(2.3, 2.3, 4.8, 3, 1); roofG.rotateZ(Math.PI / 2); roofG.rotateX(-Math.PI / 2); roofG.scale(1, 0.7, 1);
  const roof = new THREE.Mesh(roofG, toon(rc[0], rc[1], 0.3)); roof.position.y = 2.8 + 2.3 * 0.7 * 0.5;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.08), toon('#8a5a34')); door.position.set(0.6, 0.85, 1.72);
  // timber corner posts and a sill beam, shuttered windows, a chimney
  const wood = toon('#9a6a3e', '#5a3a1e', 0.3), parts: THREE.Mesh[] = [walls, roof, door];
  for (const [px, pz] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.84, 0.22), wood); m.position.set(px, 1.42, pz); parts.push(m); }
  for (const pz of [-1.72, 1.72]) { const m = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.2, 0.12), wood); m.position.set(0, 2.72, pz); parts.push(m); }
  const glass = toon('#ffd88a', '#c8904a', 0.3), shut = toon(rc[0], rc[1], 0.3);
  for (const [wx, wz, face] of [[-1.0, 1.72, 1], [1.0, -1.72, -1], [-1.0, -1.72, -1]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.06), glass); w.position.set(wx, 1.7, wz); parts.push(w);
    for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.06), shut); sh.position.set(wx + sx * 0.6, 1.7, wz + face * 0.03); parts.push(sh); }
  }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), toon('#c8b49a', '#7a6650', 0.4)); chim.position.set(1.3, 3.7, -0.5); parts.push(chim);
  for (const m of parts) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  root.updateMatrixWorld(true);
  const ridgeY = roof.position.y + 2.3 * 0.7 * 0.98;
  const ridge = [new THREE.Vector3(-2.2, ridgeY, 0), new THREE.Vector3(2.2, ridgeY, 0)].map(v => v.applyMatrix4(root.matrixWorld));
  return { root, ridge };
}

/** A festival pole of honey wood, a brass finial, a long flag streaming from the top and a ring of little pennants. */
function festivalPole(x: number, z: number) {
  const root = new THREE.Group(); root.position.set(x, 0, z);
  const H = 7;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, H, 10), toon('#d8aa66')); pole.position.y = H / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), toon('#e8c050', '#a07020', 0.3)); ball.position.y = H + 0.1;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 10), toon('#d8402f')); wrap.position.y = H - 1.2;
  for (const m of [pole, ball, wrap]) { m.castShadow = true; root.add(m); }
  // pennants on a little hoop under the top
  const pen = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.42, 3), toon('#ffffff'), 10);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), cols = ['#d94a3a', '#f2c24a', '#4a7cc8', '#f08a44', '#8cc46a'];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, -a, Math.PI));
    M.compose(new THREE.Vector3(Math.cos(a) * 0.45, H - 0.75, Math.sin(a) * 0.45), q, new THREE.Vector3(1, 1, 0.25));
    pen.setMatrixAt(i, M); pen.setColorAt(i, new THREE.Color(cols[i % 5]));
  }
  root.add(pen);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 4, 24), toon('#c89a50')); hoop.rotation.x = Math.PI / 2; hoop.position.y = H - 0.55; root.add(hoop);
  // the flag: one broad banded ribbon streaming downwind from the top
  const { mesh, uniforms } = ribbonMesh([{ root: [0, 0, 0], length: 2.6, width: 0.42, color: '#d94a3a', color2: '#f2c24a', stripes: 2, seed: 0.4, amp: 0.9, taper: 0.5, notch: 1.2 }], ribbonUniforms(), { seg: 24, key: 'flag' });
  mesh.position.y = H - 0.15; root.add(mesh);
  uniforms.uFlow.value.set(1, 0, 0.3).normalize(); uniforms.uDroop.value.set(0, -0.15, 0); uniforms.uWaveK.value = 2.2;
  let ph = 0;
  const top = new THREE.Vector3(x, H - 1.2, z);
  return { root, top, update(dt: number) { ph += dt * 7; uniforms.uPhase.value = ph; } };
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
