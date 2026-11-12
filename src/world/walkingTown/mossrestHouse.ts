import * as THREE from 'three';
import { Kit } from '../skyIsles/sailtownKit';
import {
  PAL, pk, rnd, type R, type Opening, wallPanel, windowIn, flowerBox, barrel, crate, lantern, posy, slab, vine, shrub,
  WALL_TILE, STONE_TILE, WOOD_TILE, T, boxM, taperTube,
} from './mossrestKit';

// Mossrest's houses and windmills, each built in its own frame (the origin at the floor's centre, the door on the
// +z face, y up) into a shared Kit.
//
// A house: a footing of rough stone down to the shell, a stone ground floor with an arched plank door and round
// windows, timber-framed cream upper floors jettied out over it, a steep gable of wooden shingles (some gone green
// with moss), a stone chimney. Walk-in houses are hollow on the ground floor and lived in: plank floor and beamed
// ceiling, a bed with a patchwork quilt, a stove and a kitchen dresser, a table, shelves, a rug, a lamp, and little
// windows to look out of. The bakery has a domed bread oven and loaves; the big old house is taller and wider.

export interface HouseOpts {
  w: number; d: number; floors: number; walkIn: boolean; seed: number;
  /** How far the stone footing reaches below the floor (to the lowest shell under the house). */
  plinth: number;
  /** The floor's height above the shell at the front door (steps lead down). */
  doorDrop: number;
  kind?: 'cottage' | 'bakery' | 'big';
  /** Door offset along x (from the centre). */
  doorX?: number;
  balcony?: boolean;
  /** The shell's height under a local point (x, z), relative to the floor (negative below it). */
  ground?: (x: number, z: number) => number;
  /** Where a post from local (x, z) lands on the plates (local, y relative to the floor), when it must rake in. */
  foot?: (x: number, z: number) => THREE.Vector3 | null;
}
export interface Box2 { x: number; z: number; hw: number; hd: number; h: number; rot: number; y0?: number }
export interface DeckSpec { x: number; z: number; rot: number; span: number; width: number; y0: number; y1: number }
export interface HouseOut {
  solids: Box2[]; decks: DeckSpec[];
  /** Local points: the top of the chimney (smoke), the door's threshold, the ridge's ends (bird perches). */
  chimney: THREE.Vector3[]; door: THREE.Vector3; ridge: THREE.Vector3[];
  /** The roof's eave height and the whole height (local). */
  eave: number; top: number;
}

const H1 = 2.55, H2 = 2.35, TS = 0.34;

const shadeC = (c: THREE.ColorRepresentation, k: number) => new THREE.Color(c).multiplyScalar(k);

/** A plank door in a frame (local: the doorway's foot at the origin, the wall's outer face at z = 0). */
function door(kit: Kit, o: Opening, r: R, open: number) {
  const c = pk(r, PAL.door);
  const fc = pk(r, PAL.timberDark);
  // the frame round the arch: jambs and a curved head of stones
  for (const sx of [-1, 1]) kit.add(boxM(0.14, o.h - o.w / 2, 0.42, WOOD_TILE, true), 'wood', fc, T(o.x + sx * (o.w / 2 + 0.03), (o.h - o.w / 2) / 2, -0.1));
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI - (k / 6) * Math.PI, rr = o.w / 2 + 0.13;
    kit.add(boxM(0.3, 0.2, 0.42, STONE_TILE), 'rough', pk(r, PAL.stone), T(o.x + Math.cos(a) * rr, o.h - o.w / 2 + Math.sin(a) * rr, -0.1, 0, 0, a - Math.PI / 2));
  }
  // the leaf, swung open on its hinge at the left jamb
  kit.push(T(o.x - o.w / 2 + 0.04, 0, -0.2, 0, open, 0));
  const nb = 4;
  for (let k = 0; k < nb; k++) {
    const bx = (k + 0.5) * (o.w - 0.08) / nb;
    const top = o.h - o.w / 2 + Math.sqrt(Math.max(0, (o.w / 2) ** 2 - (bx - o.w / 2) ** 2)) - 0.05;
    kit.add(boxM((o.w - 0.08) / nb - 0.012, top, 0.07, WOOD_TILE, true), 'wood', shadeC(c, 0.92 + r() * 0.14), T(bx, top / 2, 0));
  }
  for (const y of [0.35, o.h * 0.62]) kit.add(boxM(o.w - 0.12, 0.1, 0.05, WOOD_TILE), 'wood', shadeC(c, 0.8), T(o.w / 2 - 0.04, y, 0.05));
  kit.add(new THREE.TorusGeometry(0.07, 0.015, 4, 10), 'plain', PAL.iron, T(o.w - 0.2, o.h * 0.48, 0.07));
  kit.pop();
}

/** Shingles over one roof slope (local: the eave along x at y = 0, the slope rising up +y' at the given length). */
function shingles(kit: Kit, m: THREE.Matrix4, len: number, slope: number, r: R, mossy: number) {
  kit.push(m);
  const rowStep = 0.25;
  const rows = Math.ceil(slope / rowStep) + 1;
  for (let i = 0; i < rows; i++) {
    const s = i * rowStep;
    let x = -len / 2 + (i % 2 ? 0.15 : 0);
    while (x < len / 2) {
      const w = Math.min(len / 2 - x, 0.26 + r() * 0.12);
      if (w < 0.08) break;
      const base = new THREE.Color(pk(r, PAL.shingle)).multiplyScalar(0.88 + r() * 0.2);
      // moss creeps in near the eaves and in patches
      const mk = r() < mossy * (1.2 - s / slope) ? 0.35 + r() * 0.4 : 0;
      if (mk) base.lerp(new THREE.Color(pk(r, ['#7f9a48', '#6e8c3e', '#93a650'])), mk);
      kit.add(boxM(w - 0.025, 0.42, 0.045, WOOD_TILE, true), 'wood', base, T(x + w / 2, s + 0.21, 0.03 + (i % 2) * 0.012 + 0.02, -0.06, 0, (r() - 0.5) * 0.05));
      x += w;
    }
  }
  kit.pop();
}

/** A gabled roof over a box of w x dd, its eaves at height y (local), ridge along x. Returns the ridge height. */
function roof(kit: Kit, w: number, dd: number, y: number, r: R, pitch: number, mossy: number) {
  const ov = 0.45, ovG = 0.4;
  const half = dd / 2 + ov;
  const rise = half * Math.tan(pitch);
  const slope = half / Math.cos(pitch);
  const len = w + ovG * 2;
  const drop = ov * Math.tan(pitch);
  const ridge = y - drop + rise;
  const boardC = pk(r, PAL.timberDark);
  for (const sd of [1, -1]) {
    // the boards, then the shingles over them; eave at z = sd * half, rising to the ridge at z = 0
    const m = new THREE.Matrix4().makeRotationX(-sd * (Math.PI / 2 - pitch));
    if (sd < 0) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
    m.setPosition(0, y - drop - 0.05, sd * half);
    kit.push(m);
    kit.add(boxM(len, slope + 0.12, 0.1, WOOD_TILE), 'wood', boardC, T(0, slope / 2, 0));
    kit.pop();
    shingles(kit, m, len, slope + 0.05, r, mossy);
    // barge boards along the gable edges
    for (const gx of [-1, 1]) {
      kit.push(m);
      kit.add(boxM(0.12, slope + 0.25, 0.26, WOOD_TILE, true), 'wood', boardC, T(gx * (len / 2 + 0.02), slope / 2, 0.06));
      kit.pop();
    }
  }
  // the ridge: a row of capping boards
  kit.add(boxM(len + 0.1, 0.16, 0.34, WOOD_TILE), 'wood', shadeC(boardC, 0.9), T(0, ridge + 0.06, 0, Math.PI / 4));
  // the gable ends: cream plaster triangles under the roof with a timber king post and a round vent
  for (const gx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(-dd / 2, 0); s.lineTo(dd / 2, 0); s.lineTo(0, (dd / 2) * Math.tan(pitch));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WALL_TILE, uv.getY(i) / WALL_TILE);
    kit.add(g, 'wall', pk(r, PAL.plaster), T(gx * (w / 2 - 0.08), y, 0, 0, gx * Math.PI / 2, 0));
    const kp = (dd / 2) * Math.tan(pitch);
    kit.add(boxM(0.14, kp, 0.12, WOOD_TILE, true), 'wood', boardC, T(gx * (w / 2 + 0.02), y + kp / 2, 0));
    kit.add(boxM(0.12, 0.14, dd, WOOD_TILE), 'wood', boardC, T(gx * (w / 2 + 0.02), y + 0.07, 0));
    for (const sz of [-1, 1]) kit.add(boxM(0.12, 0.12, dd * 0.62, WOOD_TILE), 'wood', boardC, T(gx * (w / 2 + 0.02), y + kp * 0.42, sz * dd * 0.2, sz * pitch * 0.9, 0, 0));
    kit.add(new THREE.TorusGeometry(0.26, 0.06, 5, 14), 'wood', boardC, T(gx * (w / 2 + 0.03), y + kp * 0.55, 0, 0, Math.PI / 2, 0));
    kit.add(new THREE.CircleGeometry(0.26, 14), 'plain', '#3a2e26', T(gx * (w / 2 + 0.01), y + kp * 0.55, 0, 0, gx * Math.PI / 2, 0));
  }
  return ridge;
}

/** Timber framing over a plaster wall face (local: the face at z = 0, x along it, y up from its foot). */
function framing(kit: Kit, L: number, H: number, open: Opening[], r: R) {
  const c = pk(r, PAL.timberDark);
  kit.add(boxM(L + 0.1, 0.18, 0.12, WOOD_TILE), 'wood', c, T(0, 0.09, 0.04));
  kit.add(boxM(L + 0.1, 0.16, 0.12, WOOD_TILE), 'wood', c, T(0, H - 0.08, 0.04));
  const free = (x: number) => !open.some(o => Math.abs(x - o.x) < o.w / 2 + 0.16);
  const n = Math.max(2, Math.round(L / 1.05));
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + (k / n) * L;
    if (k > 0 && k < n && !free(x)) continue;
    kit.add(boxM(k === 0 || k === n ? 0.2 : 0.13, H - 0.3, 0.11, WOOD_TILE, true), 'wood', c, T(x, H / 2, 0.035));
  }
  // braces in the end bays, leaning in
  const bay = L / n;
  for (const sx of [-1, 1]) {
    const x0 = sx * (L / 2 - bay / 2);
    if (!free(x0)) continue;
    const len = Math.hypot(bay, H - 0.34);
    kit.add(boxM(0.11, len, 0.1, WOOD_TILE, true), 'wood', c, T(x0, H / 2, 0.035, 0, 0, sx * Math.atan2(bay, H - 0.34)));
  }
  // a rail under the windows
  if (open.length) kit.add(boxM(L, 0.11, 0.1, WOOD_TILE), 'wood', c, T(0, Math.min(...open.map(o => o.kind === 'round' ? o.y - o.w / 2 : o.y)) - 0.1, 0.035));
}

/** The furniture of a lived-in ground floor (local: the room's floor at y = 0, inner size iw x id, door at +z). */
function interior(kit: Kit, iw: number, id: number, r: R, kind: HouseOpts['kind'], doorX: number) {
  const wd = pk(r, PAL.timber), dk = pk(r, PAL.timberDark), pale = pk(r, PAL.timberPale);
  // honey floorboards, and a beamed ceiling of pale boards
  for (let k = 0; k < Math.floor(iw / 0.3); k++) kit.add(boxM(0.29, 0.06, id, WOOD_TILE), 'wood', shadeC(pale, 0.9 + r() * 0.16), T(-iw / 2 + 0.15 + k * 0.3, 0.03, 0));
  kit.add(boxM(iw, 0.08, id, WOOD_TILE), 'wood', shadeC(pale, 1.0), T(0, H1 - 0.04, 0));
  // sunlight through the front window, lying on the floor
  kit.add(new THREE.PlaneGeometry(0.9, 1.3).rotateX(-Math.PI / 2), 'bloom', '#fff1c4', T(doorX > 0 ? -iw * 0.22 : iw * 0.22, 0.075, id / 2 - 0.9, 0, 0.25, 0));
  // the hearth: a chimney breast of small stones behind the stove, the fire glowing in its mouth
  kit.push(T(iw / 2 - 0.65, 0, -id / 2 + 0.12));
  kit.add(slab(1.35, H1, 0.26, SMALL_STONE), 'stone', pk(r, PAL.stone), T());
  kit.add(boxM(1.5, 0.16, 0.42, WOOD_TILE), 'wood', dk, T(0, 1.55, 0.12));
  kit.add(slab(0.5, 0.32, 0.06), 'bloom', '#ffb35c', T(0, 0.14, 0.85));
  kit.add(new THREE.ConeGeometry(0.12, 0.3, 5), 'bloom', '#ffd27a', T(-0.05, 0.3, 0.86));
  for (let k = 0; k < 3; k++) kit.add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), 'wood', '#6a4a30', T(0, 1.68, 0.1 + k * 0.1 - 0.1, 0, 0, Math.PI / 2));
  kit.add(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 10), 'plain', '#c9a26a', T(0.45, 1.74, 0.15));
  kit.pop();
  for (let k = 1; k < Math.floor(iw / 1.1) + 1; k++) kit.add(boxM(0.18, 0.2, id, WOOD_TILE), 'wood', dk, T(-iw / 2 + k * (iw / (Math.floor(iw / 1.1) + 1)), H1 - 0.18, 0));
  // a rug in the middle of the room
  kit.add(new THREE.CircleGeometry(1.0, 24).scale(iw * 0.26, id * 0.24, 1).rotateX(-Math.PI / 2), 'plain', pk(r, ['#b0503c', '#6e7fa4', '#8f9a5a', '#c07a3e']), T(0.2, 0.07, 0.1));
  kit.add(new THREE.CircleGeometry(1.0, 24).scale(iw * 0.2, id * 0.18, 1).rotateX(-Math.PI / 2), 'plain', pk(r, ['#ecd9a8', '#e0bd7a', '#f1e4c6']), T(0.2, 0.075, 0.1));
  kit.add(new THREE.CircleGeometry(1.0, 24).scale(iw * 0.12, id * 0.1, 1).rotateX(-Math.PI / 2), 'plain', pk(r, ['#b0503c', '#7d9a5a']), T(0.2, 0.08, 0.1));
  // the bed in the back left corner: frame, mattress, patchwork quilt and pillows
  kit.push(T(-iw / 2 + 0.75, 0, -id / 2 + 1.05));
  kit.add(slab(1.3, 0.35, 2.0), 'wood', wd, T());
  kit.add(slab(1.3, 0.9, 0.1), 'wood', dk, T(0, 0, -1.0));
  kit.add(slab(1.3, 0.55, 0.08), 'wood', dk, T(0, 0, 1.0));
  kit.add(slab(1.2, 0.16, 1.9), 'canvas', '#f4ecd8', T(0, 0.35, 0));
  const pc = ['#c9705a', '#e6c06a', '#8fae6a', '#7d9cc4', '#f2e6cc', '#b58fb0'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) kit.add(slab(0.31, 0.05, 0.33), 'plain', pk(r, pc), T(-0.45 + i * 0.3, 0.5, 0.0 + j * 0.24 - 0.1));
  kit.add(slab(1.26, 0.05, 1.05), 'plain', pk(r, pc), T(0, 0.47, 0.28));
  kit.add(new THREE.CapsuleGeometry(0.15, 0.5, 3, 8).rotateZ(Math.PI / 2), 'canvas', '#fbf6ea', T(0, 0.64, -0.72));
  kit.pop();
  // the kitchen along the back wall: a stone stove with an iron top and flue, a dresser of plates and jars
  kit.push(T(iw / 2 - 0.65, 0, -id / 2 + 0.55));
  kit.add(slab(1.0, 0.85, 0.8, STONE_TILE), 'rough', pk(r, PAL.stone), T());
  kit.add(slab(1.04, 0.06, 0.84), 'plain', PAL.iron, T(0, 0.85, 0));
  kit.add(new THREE.CylinderGeometry(0.1, 0.1, H1 - 0.9, 8), 'plain', PAL.iron, T(0.25, 0.91 + (H1 - 0.9) / 2, -0.2));
  kit.add(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 10), 'plain', '#4a4642', T(-0.2, 0.98, 0.05));
  kit.add(new THREE.CylinderGeometry(0.15, 0.12, 0.15, 10), 'brass', '#b88a4a', T(0.12, 0.96, 0.15));
  kit.pop();
  kit.push(T(iw / 2 - 0.32, 0, 0.1, 0, -Math.PI / 2, 0));
  kit.add(slab(1.4, 0.9, 0.5), 'wood', wd, T());
  kit.add(slab(1.44, 0.05, 0.56), 'wood', dk, T(0, 0.9, 0.02));
  for (const y of [1.3, 1.7, 2.1]) {
    kit.add(slab(1.4, 0.04, 0.3), 'wood', dk, T(0, y, -0.1));
    for (let k = 0; k < 5; k++) {
      const x = -0.55 + k * 0.27;
      if (r() < 0.5) kit.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12).rotateX(Math.PI / 2 - 0.25), 'plain', pk(r, ['#f2ead8', '#d9e2e6', '#e8cfa8']), T(x, y + 0.16, -0.16));
      else kit.add(new THREE.CylinderGeometry(0.06, 0.07, 0.18 + r() * 0.08, 8), r() < 0.4 ? 'glass' : 'plain', pk(r, ['#c98d5a', '#7d9f70', '#e0c070', '#a66a5a', '#d8d0b8']), T(x, y + 0.12, -0.12));
    }
  }
  kit.add(slab(1.4, 1.3, 0.04), 'wood', shadeC(wd, 0.85), T(0, 0.92, -0.25));
  kit.pop();
  // the table and stools near the window, a bowl of apples and a jug
  kit.push(T(0.3, 0, 0.35 + (doorX > 0 ? -0.2 : 0)));
  kit.add(slab(1.3, 0.06, 0.8), 'wood', wd, T(0, 0.74, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.add(slab(0.08, 0.74, 0.08), 'wood', dk, T(sx * 0.55, 0, sz * 0.32));
  for (const [x, z] of [[-0.9, 0], [0.9, 0.05], [0, -0.7]]) { kit.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), 'wood', wd, T(x, 0.46, z)); for (let k = 0; k < 3; k++) { const a = k * 2.1; kit.add(slab(0.05, 0.44, 0.05), 'wood', dk, T(x + Math.cos(a) * 0.13, 0, z + Math.sin(a) * 0.13)); } }
  kit.add(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'wood', dk, T(-0.25, 0.92, 0));
  for (let k = 0; k < 4; k++) kit.add(new THREE.IcosahedronGeometry(0.06, 1), 'plain', pk(r, ['#c84a36', '#d9a03a', '#9aa83c']), T(-0.25 + (r() - 0.5) * 0.14, 0.86, (r() - 0.5) * 0.14));
  kit.add(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 10), 'plain', '#d8c6a0', T(0.3, 0.89, 0.1));
  kit.pop();
  // a lamp hanging from a beam, a shelf of books by the bed
  lantern(kit, T(0, H1 - 0.25, 0));
  kit.push(T(-iw / 2 + 0.2, 1.5, 0.4, 0, Math.PI / 2, 0));
  kit.add(slab(1.0, 0.04, 0.24), 'wood', dk, T());
  for (let k = 0; k < 7; k++) kit.add(slab(0.08 + r() * 0.04, 0.22 + r() * 0.08, 0.18), 'plain', pk(r, ['#8a3a2e', '#3e5a7a', '#5a6e3a', '#b0883a', '#6a4a6a']), T(-0.4 + k * 0.12, 0.04, 0, 0, 0, (r() - 0.5) * 0.15));
  kit.pop();
  if (kind === 'bakery') {
    // the bread oven: a stone dome with a dark mouth, loaves cooling on a rack
    kit.push(T(-iw / 2 + 0.9, 0, id / 2 - 1.1));
    kit.add(slab(1.5, 0.7, 1.4, STONE_TILE), 'rough', pk(r, PAL.stone), T());
    kit.add(new THREE.SphereGeometry(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'rough', pk(r, PAL.stone), T(0, 0.7, 0));
    kit.add(new THREE.CircleGeometry(0.28, 12, 0, Math.PI), 'plain', '#2a201a', T(0.73, 0.72, 0, 0, Math.PI / 2, 0));
    kit.pop();
    kit.push(T(iw / 2 - 0.4, 0, id / 2 - 1.0, 0, -Math.PI / 2, 0));
    kit.add(slab(1.2, 0.04, 0.4), 'wood', dk, T(0, 0.9, 0));
    kit.add(slab(1.2, 0.04, 0.4), 'wood', dk, T(0, 1.35, 0));
    for (const y of [0.94, 1.39]) for (let k = 0; k < 5; k++) kit.add(new THREE.SphereGeometry(0.11, 10, 6).scale(1.5, 0.75, 1), 'plain', pk(r, ['#c98a42', '#b8763a', '#d9a05a']), T(-0.45 + k * 0.22, y + 0.07, 0));
    kit.pop();
  }
}

/** Dry stone that reads at a cottage's scale: small courses. */
const SMALL_STONE = 0.8;

/**
 * The footing under a house (local: floor at y = 0, ground(x, z) the shell's height there). A low stone course
 * runs under the walls; where the shell drops away below it, each stretch of the edge gets a dry-stone retaining
 * wall if it is shallow, or a stout timber post on a flat stone with knee braces up to a sill beam if it is deep.
 */
function footing(kit: Kit, w: number, d: number, ground: (x: number, z: number) => number, r: R, stoneC: THREE.ColorRepresentation, foot?: (x: number, z: number) => THREE.Vector3 | null) {
  const base = 0.45;
  kit.add(slab(w + 0.3, base, d + 0.3, SMALL_STONE), 'stone', shadeC(stoneC, 0.9), T(0, -base, 0));
  const dk = pk(r, PAL.timberDark);
  const edges: [number, number, number, number][] = [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  const posts: THREE.Vector3[] = [];
  for (const [x0, z0, x1, z1] of edges) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / 1.5));
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      const x = x0 + (x1 - x0) * tm, z = z0 + (z1 - z0) * tm;
      const g = Math.min(ground(x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0), ground(x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1), ground(x, z));
      const depth = -base - g;
      if (depth < 0.05) continue;
      if (depth < 1.5) {
        // a retaining wall of dry stone, battered a little, its top course of bigger flat stones
        kit.add(slab(L / n + 0.12, depth + 0.35, 0.55, SMALL_STONE), 'stone', shadeC(stoneC, 0.82 + r() * 0.12), T(x, g - 0.3, z, 0, yaw, 0));
        kit.add(boxM(L / n + 0.2, 0.14, 0.66, SMALL_STONE), 'rough', shadeC(stoneC, 0.95), T(x, -base + 0.02, z, 0, yaw, 0));
      } else {
        // a timber post down to a flat stone, braced to the sill beam both ways along the edge
        posts.push(new THREE.Vector3(x0 + (x1 - x0) * t0, g, z0 + (z1 - z0) * t0));
        if (k === n - 1) posts.push(new THREE.Vector3(x1, ground(x1, z1), z1));
        kit.add(boxM(L / n + 0.3, 0.3, 0.3, WOOD_TILE), 'wood', dk, T(x, -base - 0.15, z, 0, yaw, 0));
      }
    }
  }
  for (const p of posts) {
    const top = -base - 0.3, len = top - p.y + 0.2;
    if (len < 0.2) continue;
    const f = foot?.(p.x, p.z);
    if (f && Math.hypot(f.x - p.x, f.z - p.z) > 0.25) {
      // past the rim: a raking post from the sill in to the plates, on its flat stone, with a brace back up
      const head = new THREE.Vector3(p.x, top + 0.15, p.z), fo = f.clone();
      kit.add(taperTube([fo, head], 0.18, 0.16, 5, 1), 'wood', dk);
      kit.add(new THREE.DodecahedronGeometry(0.42, 0).scale(1, 0.4, 1), 'rough', pk(r, PAL.stone), T(fo.x, fo.y + 0.25, fo.z));
      const mid = fo.clone().lerp(head, 0.5), inn = new THREE.Vector3(p.x - Math.sign(p.x) * 1.1, top + 0.05, p.z - Math.sign(p.z) * 0.6);
      kit.add(taperTube([mid, inn], 0.08, 0.08, 4, 1), 'wood', dk);
      continue;
    }
    kit.add(slab(0.3, len, 0.3, WOOD_TILE, true), 'wood', dk, T(p.x, p.y - 0.2, p.z));
    kit.add(new THREE.DodecahedronGeometry(0.42, 0).scale(1, 0.4, 1), 'rough', pk(r, PAL.stone), T(p.x, p.y + 0.05, p.z));
    // knee braces in towards the house
    const inX = -Math.sign(p.x) * 0.9, inZ = -Math.sign(p.z) * 0.9;
    for (const [bx, bz] of [[inX, 0], [0, inZ]]) {
      const a = new THREE.Vector3(p.x, top - Math.min(1.1, len * 0.45), p.z), b = new THREE.Vector3(p.x + bx, top + 0.05, p.z + bz);
      kit.add(taperTube([a, b], 0.08, 0.08, 4, 1), 'wood', dk);
    }
  }
}

/** The way up to a front door: one big stone step if it is low, else a little timber stair with a handrail. */
function doorSteps(kit: Kit, doorX: number, dz: number, drop: number, n: number, r: R, stoneC: THREE.ColorRepresentation) {
  if (drop < 0.4) {
    kit.add(slab(1.5, drop + 0.15, 0.6, SMALL_STONE), 'rough', shadeC(stoneC, 0.95), T(doorX, -drop - 0.15, dz + 0.3));
    return;
  }
  const run = 0.36, rise = drop / n, wd = pk(r, PAL.timber), dk = pk(r, PAL.timberDark);
  const len = run * n;
  for (let k = 0; k < n; k++) {
    // treads with a little nosing, open between them
    const y = -rise * (k + 1) + rise, z = dz + 0.18 + k * run;
    kit.add(boxM(1.3, 0.07, run + 0.06, WOOD_TILE), 'wood', shadeC(wd, 0.88 + r() * 0.2), T(doorX, y - 0.035, z));
  }
  // the stringers either side, notched to the treads, and a post and handrail on the open side
  const ang = Math.atan2(drop, len);
  for (const sx of [-1, 1]) {
    kit.add(boxM(Math.hypot(len, drop) + 0.2, 0.26, 0.09, WOOD_TILE), 'wood', dk, T(doorX + sx * 0.69, -drop / 2 - 0.12, dz + len / 2, 0, Math.PI / 2, ang));
    kit.add(slab(0.12, 1.05 + drop, 0.12, WOOD_TILE, true), 'wood', dk, T(doorX + sx * 0.69, -drop - 0.1, dz + len + 0.05));
    kit.add(boxM(Math.hypot(len, drop) + 0.1, 0.09, 0.09, WOOD_TILE), 'wood', wd, T(doorX + sx * 0.69, -drop / 2 + 0.95, dz + len / 2, 0, Math.PI / 2, ang));
  }
  kit.add(new THREE.DodecahedronGeometry(0.5, 0).scale(1.6, 0.35, 1), 'rough', pk(r, PAL.stone), T(doorX, -drop - 0.05, dz + len + 0.25));
}

/** A house, built into `kit` under its current transform. */
export function house(kit: Kit, o: HouseOpts): HouseOut {
  const r = rnd(o.seed);
  const { w, d } = o;
  const floors = Math.max(1, o.floors);
  const jet = 0.25;
  const doorX = o.doorX ?? (r() - 0.5) * w * 0.3;
  const stoneC = pk(r, PAL.stone);
  const solids: Box2[] = [], decks: DeckSpec[] = [];
  // ---- the footing: a low course of stone under the walls; below it, where the shell falls away, dry-stone
  // retaining walls where it is shallow and stout timber posts with knee braces on flat stones where it is deep
  footing(kit, w, d, o.ground ?? (() => -o.plinth), r, stoneC, o.foot);
  // ---- the ground floor: stone walls with the door, round and square windows
  const dOpen: Opening = { kind: 'door', x: doorX, y: 0, w: 1.05, h: 2.05 };
  const frontWin: Opening[] = [];
  const wx = doorX > 0 ? -w * 0.27 : w * 0.27;
  frontWin.push(r() < 0.5 ? { kind: 'round', x: wx, y: 1.45, w: 0.8, h: 0.8 } : { kind: 'rect', x: wx, y: 0.95, w: 0.8, h: 0.95 });
  if (w > 5.5) frontWin.push({ kind: 'round', x: doorX > 0 ? w * 0.42 - 0.4 : -w * 0.42 + 0.4, y: 1.5, w: 0.6, h: 0.6 });
  const backWin: Opening[] = [{ kind: 'rect', x: w * 0.12, y: 1.1, w: 0.7, h: 0.75 }];
  const sideWin: Opening[] = [{ kind: 'round', x: 0, y: 1.5, w: 0.75, h: 0.75 }];
  const walls: [number, number, number, number, Opening[]][] = [
    // [x, z, rotY, length, openings]
    [0, d / 2 - TS / 2, 0, w, [dOpen, ...frontWin]],
    [0, -d / 2 + TS / 2, Math.PI, w, backWin.map(q => ({ ...q, x: -q.x }))],
    [w / 2 - TS / 2, 0, Math.PI / 2, d - TS * 2, sideWin],
    [-w / 2 + TS / 2, 0, -Math.PI / 2, d - TS * 2, sideWin],
  ];
  const glass = !o.walkIn;
  for (const [x, z, ry, L, op] of walls) {
    kit.push(T(x, 0, z, 0, ry, 0));
    kit.add(wallPanel(L, H1, TS, op, STONE_TILE), 'stone', stoneC);
    if (o.walkIn) {
      // inside: warm limewashed plaster over a low dado of small stones, timber posts and a wall plate
      const Li = ry === 0 || ry === Math.PI ? w - TS * 2 : L;
      kit.push(T(0, 0, -TS / 2 - 0.025, 0, Math.PI, 0));
      kit.add(wallPanel(Li, H1, 0.05, op.map(q => ({ ...q, x: -q.x })), WALL_TILE * 0.8), 'wall', pk(r, ['#f3e6c8', '#f6ead0', '#f0e0bd']));
      kit.add(wallPanel(Li, 0.62, 0.05, op.filter(q => q.kind === 'door').map(q => ({ ...q, x: -q.x })), 0.55), 'stone', shadeC(stoneC, 1.05), T(0, 0, 0.04));
      kit.add(boxM(Li, 0.07, 0.1, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(0, 0.65, 0.07));
      kit.add(boxM(Li, 0.2, 0.16, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(0, H1 - 0.3, 0.1));
      for (const px of [-Li / 2 + 0.1, Li / 2 - 0.1]) kit.add(boxM(0.18, H1 - 0.3, 0.14, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(px, (H1 - 0.3) / 2, 0.09));
      kit.pop();
    }
    kit.push(T(0, 0, TS / 2));
    for (const q of op) if (q.kind !== 'door') windowIn(kit, q, r, { glass, shutters: q.kind === 'rect' && r() < 0.7, box: r() < 0.75, depth: TS });
    if (op.includes(dOpen)) door(kit, dOpen, r, o.walkIn ? 1.75 : 0);
    kit.pop();
    // big quoin stones at the corners
    if (ry === 0 || ry === Math.PI) for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) kit.add(boxM(k % 2 ? 0.5 : 0.36, 0.42, TS + 0.06, STONE_TILE), 'rough', shadeC(stoneC, 1.06), T(sx * (L / 2 - 0.2), 0.25 + k * 0.5, 0));
    kit.pop();
  }
  // ---- the upper floors: timber-framed cream plaster, jettied out front and back
  let y = H1;
  const upW = w, upD = d + jet * 2;
  for (let f = 1; f < floors; f++) {
    // joist ends under the jetty
    for (const sz of [-1, 1]) for (let k = 0; k < Math.floor(w / 0.5); k++) kit.add(boxM(0.14, 0.16, 0.4, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(-w / 2 + 0.25 + k * 0.5, y + 0.02, sz * (d / 2 + 0.1)));
    kit.add(slab(upW + 0.1, 0.14, upD + 0.1), 'wood', pk(r, PAL.timberDark), T(0, y, 0));
    const yy = y + 0.14;
    const wf: Opening[] = [{ kind: 'rect', x: -upW * 0.25, y: 0.75, w: 0.75, h: 0.9 }, { kind: 'rect', x: upW * 0.25, y: 0.75, w: 0.75, h: 0.9 }];
    if (upW > 6) wf.push({ kind: 'round', x: 0, y: 1.25, w: 0.6, h: 0.6 });
    const ws: Opening[] = [{ kind: r() < 0.5 ? 'round' : 'rect', x: 0, y: 0.8, w: 0.65, h: 0.75 }].map(q => q.kind === 'round' ? { ...q, y: 1.25 } : q) as Opening[];
    const up: [number, number, number, number, Opening[]][] = [
      [0, upD / 2 - 0.09, 0, upW, wf], [0, -upD / 2 + 0.09, Math.PI, upW, wf.slice(0, 1)],
      [upW / 2 - 0.09, 0, Math.PI / 2, upD - 0.18, ws], [-upW / 2 + 0.09, 0, -Math.PI / 2, upD - 0.18, ws],
    ];
    const plC = pk(r, PAL.plaster);
    for (const [x, z, ry, L, op] of up) {
      kit.push(T(x, yy, z, 0, ry, 0));
      kit.add(wallPanel(L, H2, 0.18, op, WALL_TILE), 'wall', plC);
      kit.push(T(0, 0, 0.09));
      framing(kit, L, H2, op, r);
      for (const q of op) windowIn(kit, q, r, { glass: true, shutters: q.kind === 'rect', box: q.kind === 'rect' && r() < 0.8, depth: 0.18 });
      kit.pop();
      kit.pop();
    }
    if (o.balcony && f === 1) {
      kit.push(T(0, yy, upD / 2));
      kit.add(slab(upW * 0.6, 0.12, 1.1), 'wood', pk(r, PAL.timber), T(0, 0, 0.55));
      for (let k = 0; k <= 6; k++) kit.add(slab(0.08, 0.95, 0.08), 'wood', pk(r, PAL.timberDark), T(-upW * 0.3 + k * upW * 0.1, 0.1, 1.05));
      kit.add(boxM(upW * 0.6 + 0.1, 0.1, 0.12, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(0, 1.05, 1.05));
      for (const sx of [-1, 1]) kit.add(taperTube([new THREE.Vector3(sx * upW * 0.28, -0.05, 1.0), new THREE.Vector3(sx * upW * 0.28, -0.9, 0.1)], 0.07, 0.07, 5), 'wood', pk(r, PAL.timberDark));
      flowerBox(kit, T(-upW * 0.15, 1.1, 1.12), 0.9, r);
      kit.pop();
    }
    y += H2 + 0.14;
  }
  // ---- the roof
  const pitch = o.kind === 'big' ? 0.86 : 0.78 + r() * 0.1;
  const eave = y;
  const ridge = roof(kit, upW, floors > 1 ? upD : d, y, r, pitch, 0.62);
  // ---- the chimney (a stack from the footing up through the roof); the bakery's is big
  const chim: THREE.Vector3[] = [];
  const cw = o.kind === 'bakery' ? 1.1 : 0.75;
  const chimX = [w / 2 - cw / 2 - 0.15];
  if (o.kind === 'big') chimX.push(-w / 2 + cw / 2 + 0.15);
  for (const cx of chimX) {
    const top = ridge + 0.9;
    kit.add(slab(cw, top + 0.1, cw, STONE_TILE), 'stone', shadeC(stoneC, 0.95), T(cx, -0.1, -d * 0.18));
    kit.add(slab(cw + 0.16, 0.14, cw + 0.16, STONE_TILE), 'rough', shadeC(stoneC, 0.85), T(cx, top, -d * 0.18));
    kit.add(new THREE.CylinderGeometry(0.14, 0.17, 0.4, 8), 'plain', '#b5694a', T(cx, top + 0.34, -d * 0.18));
    chim.push(new THREE.Vector3(cx, top + 0.56, -d * 0.18));
  }
  // ---- the step(s) down from the door, a lantern by it, a doorstep
  const dz = d / 2;
  const nSteps = Math.max(1, Math.round(o.doorDrop / 0.22));
  doorSteps(kit, doorX, dz, o.doorDrop, nSteps, r, stoneC);
  lantern(kit, T(doorX + 0.95, 2.2, dz + 0.3));
  kit.add(boxM(0.06, 0.06, 0.32, 1), 'plain', PAL.iron, T(doorX + 0.95, 2.22, dz + 0.16));
  // ivy climbing the front corners, flowers at the foot of the walls
  for (const sx of [-1, 1]) if (r() < 0.75) {
    // up the front corner from the ground to the eaves, and spreading along under them
    const x0 = sx * (w / 2 - 0.15), top = Math.min(eave, H1 + 1.8) - 0.2;
    vine(kit, [new THREE.Vector3(x0, -0.3, dz + 0.02), new THREE.Vector3(x0 - sx * 0.2, top * 0.5, dz + 0.04), new THREE.Vector3(x0 - sx * 0.1, top, dz + 0.3), new THREE.Vector3(x0 - sx * (0.8 + r()), top + 0.2, dz + 0.4)], new THREE.Vector3(0, 0, 1), r, 0.4);
    if (r() < 0.6) vine(kit, [new THREE.Vector3(sx * (w / 2 + 0.02), top, dz - 0.2), new THREE.Vector3(sx * (w / 2 + 0.05), top * 0.55, -0.3 + r()), new THREE.Vector3(sx * (w / 2 + 0.04), 0.2, -d * 0.3)], new THREE.Vector3(sx, 0, 0), r, 0.36);
  }
  // a bush by the wall, flowers at the foot of it
  if (r() < 0.7) shrub(kit, T(doorX > 0 ? -w / 2 + 0.3 : w / 2 - 0.3, -0.2, dz + 0.5), r, 0.7 + r() * 0.3);
  for (let k = 0; k < 3; k++) posy(kit, T((r() - 0.5) * w * 0.9, -0.05, dz + 0.3 + r() * 0.2, 0, r() * 3, 0), 0.5, r);
  if (r() < 0.7) barrel(kit, T(doorX > 0 ? -w / 2 - 0.1 : w / 2 + 0.1, 0, dz + 0.35), r);
  if (r() < 0.4) crate(kit, T(doorX > 0 ? -w / 2 + 0.6 : w / 2 - 0.6, 0, dz + 0.5, 0, r(), 0), r);
  // ---- inside
  if (o.walkIn) interior(kit, w - TS * 2, d - TS * 2, r, o.kind, doorX);
  // ---- collision: the walls (the front one either side of the door), the floor inside, the steps
  const hh = H1 + 0.6;
  if (o.walkIn) {
    const dl = doorX - 0.55 - (-w / 2), dr = w / 2 - (doorX + 0.55);
    solids.push({ x: -w / 2 + dl / 2, z: d / 2 - TS / 2, hw: dl / 2, hd: TS / 2, h: hh, rot: 0 });
    solids.push({ x: w / 2 - dr / 2, z: d / 2 - TS / 2, hw: dr / 2, hd: TS / 2, h: hh, rot: 0 });
    solids.push({ x: 0, z: -d / 2 + TS / 2, hw: w / 2, hd: TS / 2, h: hh, rot: 0 });
    for (const sx of [-1, 1]) solids.push({ x: sx * (w / 2 - TS / 2), z: 0, hw: TS / 2, hd: d / 2, h: hh, rot: 0 });
    // the furniture you bump into: bed, stove, dresser, table
    solids.push({ x: -w / 2 + TS + 0.75, z: -d / 2 + TS + 1.05, hw: 0.65, hd: 1.0, h: 0.6, rot: 0 });
    solids.push({ x: w / 2 - TS - 0.65, z: -d / 2 + TS + 0.55, hw: 0.5, hd: 0.4, h: 0.9, rot: 0 });
    decks.push({ x: 0, z: 0, rot: 0, span: w - TS * 2, width: d - TS * 2, y0: 0, y1: 0 });
  } else {
    solids.push({ x: 0, z: 0, hw: w / 2 + 0.15, hd: d / 2 + 0.15, h: eave + 1, rot: 0 });
  }
  decks.push({ x: doorX, z: dz + (o.doorDrop < 0.4 ? 0.3 : 0.18 * nSteps + 0.1), rot: Math.PI / 2, span: (o.doorDrop < 0.4 ? 0.6 : 0.36 * nSteps) + 0.3, width: 1.4, y0: -o.doorDrop, y1: 0 });
  return { solids, decks, chimney: chim, door: new THREE.Vector3(doorX, 0, dz), ridge: [new THREE.Vector3(-upW / 2, ridge + 0.15, 0), new THREE.Vector3(upW / 2, ridge + 0.15, 0)], eave, top: ridge };
}

// ------------------------------------------------------------------------------------------------ windmills

export interface MillOut { sails: THREE.Group; hub: THREE.Vector3; top: THREE.Vector3; solid: Box2; broken: boolean; /** The lost sail's arm (broken mill), or -1. */ lost: number }

/**
 * A windmill (origin at the ground centre, its sails facing +z): a tapering cream tower on a stone footing with
 * timber bands, a door and small windows, a gallery round it, a shingled cap, and four lattice sails with linen.
 * The broken one has lost a sail (a splintered stub is left) and another's linen is torn and furled: the sails
 * are their own group, so the working mill can turn them.
 */
export function windmill(kit: Kit, seed: number, broken: boolean, plinth0: number, S = 1): MillOut {
  const r = rnd(seed);
  const plinth = plinth0 / S;
  kit.push(T(0, 0, 0, 0, 0, 0, S));
  const H = 7.6, rb = 2.3, rt = 1.55;
  kit.add(new THREE.CylinderGeometry(rb + 0.35, rb + 0.5, plinth + 1.0, 12), 'rough', pk(r, PAL.stone), T(0, (1.0 - plinth) / 2, 0));
  const tower = new THREE.CylinderGeometry(rt, rb, H, 12, 6);
  const uv = tower.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 * rb) / WALL_TILE, uv.getY(i) * H / WALL_TILE);
  kit.add(tower, 'wall', pk(r, PAL.plaster), T(0, 1.0 + H / 2, 0));
  const rAt = (y: number) => rb + (rt - rb) * ((y - 1.0) / H);
  for (const y of [1.05, 3.4, 5.9, 1.0 + H - 0.1]) kit.add(new THREE.TorusGeometry(rAt(y) + 0.03, 0.09, 5, 24), 'wood', pk(r, PAL.timberDark), T(0, y, 0, Math.PI / 2));
  // timber studs up the tower
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue;
    const p0 = new THREE.Vector3(Math.sin(a) * (rb + 0.03), 1.0, Math.cos(a) * (rb + 0.03)), p1 = new THREE.Vector3(Math.sin(a) * (rt + 0.03), 1.0 + H, Math.cos(a) * (rt + 0.03));
    kit.add(taperTube([p0, p1], 0.07, 0.06, 4, 2), 'wood', pk(r, PAL.timberDark));
  }
  // the door at the foot, small windows up the front and side
  kit.push(T(0, 1.0, rb - 0.02));
  kit.add(slab(1.0, 1.95, 0.12), 'wood', pk(r, PAL.door), T(0, 0, 0.02));
  kit.add(slab(1.3, 0.15, 0.3), 'wood', pk(r, PAL.timberDark), T(0, 1.95, 0.05));
  kit.pop();
  for (const [a, y] of [[0, 4.6], [Math.PI / 2, 3.0], [-Math.PI / 2, 5.6], [Math.PI, 4.2]] as const) {
    const rr = rAt(y);
    kit.push(T(Math.sin(a) * rr, y, Math.cos(a) * rr, 0, a, 0));
    kit.add(slab(0.5, 0.65, 0.08), 'glass', '#5d7480', T(0, 0, 0));
    kit.add(slab(0.66, 0.08, 0.2), 'wood', pk(r, PAL.timberDark), T(0, -0.06, 0.05));
    kit.add(slab(0.66, 0.08, 0.14), 'wood', pk(r, PAL.timberDark), T(0, 0.65, 0.05));
    kit.pop();
  }
  // the gallery: a plank ring on brackets with a rail
  const gy = 3.4;
  const ring = new THREE.RingGeometry(rAt(gy), rAt(gy) + 1.2, 28, 1).rotateX(-Math.PI / 2);
  kit.add(ring, 'wood', pk(r, PAL.timber), T(0, gy + 0.06, 0));
  kit.add(new THREE.RingGeometry(rAt(gy), rAt(gy) + 1.2, 28, 1).rotateX(Math.PI / 2), 'wood', pk(r, PAL.timberDark), T(0, gy, 0));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, rr = rAt(gy) + 1.15;
    kit.add(slab(0.09, 1.0, 0.09), 'wood', pk(r, PAL.timberDark), T(Math.sin(a) * rr, gy, Math.cos(a) * rr));
    kit.add(taperTube([new THREE.Vector3(Math.sin(a) * rAt(gy - 1), gy - 1, Math.cos(a) * rAt(gy - 1)), new THREE.Vector3(Math.sin(a) * rr, gy, Math.cos(a) * rr)], 0.06, 0.06, 4, 2), 'wood', pk(r, PAL.timberDark));
  }
  kit.add(new THREE.TorusGeometry(rAt(gy) + 1.15, 0.06, 4, 32), 'wood', pk(r, PAL.timber), T(0, gy + 1.0, 0, Math.PI / 2));
  // the cap: a shingled dome, a little tilted on the broken mill
  const capY = 1.0 + H;
  kit.push(T(0, capY, 0, broken ? 0.06 : 0, 0, broken ? -0.05 : 0));
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2((rt + 0.45) * Math.cos(t * Math.PI / 2) ** 0.8, 2.3 * Math.sin(t * Math.PI / 2))); }
  kit.add(new THREE.LatheGeometry(prof.reverse(), 16), 'wood', pk(r, PAL.shingle), T());
  kit.add(new THREE.TorusGeometry(rt + 0.45, 0.12, 5, 24), 'wood', pk(r, PAL.timberDark), T(0, 0.02, 0, Math.PI / 2));
  kit.add(new THREE.SphereGeometry(0.22, 8, 6), 'wood', pk(r, PAL.timberDark), T(0, 2.35, 0));
  // the windshaft out to the front
  kit.add(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 10), 'wood', pk(r, PAL.timberDark), T(0, 0.9, rt + 0.4, Math.PI / 2 - 0.12));
  // the tail pole down the back
  kit.add(taperTube([new THREE.Vector3(0, 0.5, -rt), new THREE.Vector3(0, -H * 0.55, -rb - 2.4)], 0.12, 0.1, 5, 3), 'wood', pk(r, PAL.timberDark));
  kit.pop();
  kit.pop();
  // ---- the sails, in their own kit (they turn about local z)
  const sk = new Kit();
  const hub = new THREE.Vector3(0, capY + 0.9 + 0.18, rt + 1.25);
  const lost = broken ? Math.floor(r() * 4) : -1;
  sk.add(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10), 'wood', pk(r, PAL.timberDark), T(0, 0, 0, Math.PI / 2));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.35;
    sk.push(T(0, 0, 0.15, 0, 0, a));
    if (k === lost) {
      // a splintered stub
      sk.add(slab(0.22, 1.3, 0.18), 'wood', pk(r, PAL.timberPale), T(0, 0.3, 0));
      for (let s = 0; s < 3; s++) sk.add(new THREE.ConeGeometry(0.06, 0.35 + r() * 0.3, 4), 'wood', pk(r, PAL.timberPale), T((s - 1) * 0.07, 1.65 + r() * 0.1, 0, 0, 0, (r() - 0.5) * 0.4));
      sk.pop(); continue;
    }
    const L = 6.2;
    sk.add(slab(0.2, L, 0.18), 'wood', pk(r, PAL.timberPale), T(0, 0.3, 0));
    // the lattice: a frame on the trailing side, bars across
    const wSail = 1.45;
    sk.add(slab(0.08, L - 1.0, 0.08), 'wood', pk(r, PAL.timber), T(wSail, 1.2, 0.05));
    sk.add(slab(0.08, L - 1.0, 0.08), 'wood', pk(r, PAL.timber), T(-0.3, 1.2, 0.05));
    for (let b = 0; b <= 10; b++) sk.add(boxM(wSail + 0.35, 0.06, 0.06, WOOD_TILE), 'wood', pk(r, PAL.timber), T(wSail / 2 - 0.15, 1.2 + b * (L - 1.0) / 10, 0.07));
    // the linen: spread on the working mill, torn on one of the broken mill's sails, furled on another
    const torn = broken && k === (lost + 1) % 4;
    const furled = broken && k === (lost + 2) % 4;
    if (furled) {
      sk.add(new THREE.CylinderGeometry(0.1, 0.1, L - 1.1, 6), 'canvas', '#efe6d2', T(-0.15, 1.2 + (L - 1.0) / 2, 0.12));
    } else {
      const sh = new THREE.Shape();
      const top = torn ? (L - 1.0) * 0.55 : L - 1.0;
      sh.moveTo(-0.25, 0); sh.lineTo(wSail - 0.05, 0); sh.lineTo(wSail - 0.05, top * (torn ? 0.8 : 1));
      if (torn) { sh.lineTo(wSail * 0.6, top * 0.9); sh.lineTo(wSail * 0.35, top * 1.1); sh.lineTo(0.1, top * 0.85); }
      sh.lineTo(-0.25, top);
      const g = new THREE.ShapeGeometry(sh);
      sk.add(g, 'canvas', '#f3ead6', T(0, 1.2, 0.1));
    }
    sk.pop();
  }
  const sails = sk.build(new THREE.Group(), { outline: false });
  hub.multiplyScalar(S);
  sails.position.copy(hub);
  sails.scale.setScalar(S);
  sails.rotation.x = -0.12;
  return { sails, hub, top: new THREE.Vector3(0, (capY + 2.5) * S, 0), solid: { x: 0, z: 0, hw: (rb + 0.3) * S, hd: (rb + 0.3) * S, h: capY * S, rot: 0 }, broken, lost };
}
