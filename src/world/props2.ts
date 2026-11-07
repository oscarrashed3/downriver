import * as THREE from 'three';
import { toon, rand } from './props';
import { addOutlines, paint, softRamp } from '../render/paint';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafClump, firTier } from '../render/foliage';
import { texToon, plasterTex, roofTex, woodTex, stoneTex } from '../render/textures';

// Hand-made pieces for the Spring Peaks. Built from simple shapes, inked, and a little crooked on purpose.

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
const ink = (g: THREE.Object3D, w = 0.035) => addOutlines(g, '#3b2a30', w);

/**
 * Merge every plain mesh in a finished prop into one mesh per material, so a detailed house costs a handful of draws
 * instead of hundreds. Leaf cards (noOutline) and anything marked keep stay as they are.
 */
export function bake(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const done: THREE.Mesh[] = [];
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noOutline || m.userData.keep) return;
    for (let p = m.parent; p && p !== g; p = p.parent) if (p.userData.keep) return;
    const mat = m.material as THREE.Material;
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(geo);
    done.push(m);
  });
  for (const m of done) m.removeFromParent();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, mat); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
  }
  // drop groups left empty
  const empty: THREE.Object3D[] = [];
  g.traverse(o => { if (o !== g && !(o as THREE.Mesh).isMesh && o.children.length === 0) empty.push(o); });
  for (const o of empty) o.removeFromParent();
  return g;
}

/** A cottage: stone footing, white plaster, timber, a steep red-brown roof with a deep overhang. */
export function cottage(opts: { wall?: string; roof?: string; door?: string; w?: number; d?: number; flowers?: string } = {}): THREE.Group {
  const g = new THREE.Group();
  const W = opts.w ?? 4.2, D = opts.d ?? 3.6, Hh = 2.6;
  g.add(mesh(new THREE.BoxGeometry(W + 0.3, 0.6, D + 0.3), texToon('#a8a2a8', stoneTex), 0, 0.3, 0));
  const wallMat = texToon(opts.wall ?? '#f1e6d2', plasterTex);
  g.add(mesh(new THREE.BoxGeometry(W, Hh, D), wallMat, 0, 0.6 + Hh / 2, 0));
  const timber = texToon('#7a5638', woodTex);
  // half-timbering on the front and sides: a top beam and diagonal braces
  for (const z of [D / 2 + 0.03, -D / 2 - 0.03]) {
    g.add(mesh(new THREE.BoxGeometry(W + 0.1, 0.16, 0.08), timber, 0, 0.6 + Hh - 0.08, z));
    for (const sx of [-1, 1]) { const br = mesh(new THREE.BoxGeometry(0.12, Hh * 0.62, 0.06), timber, sx * W * 0.4, 0.6 + Hh * 0.62, z); br.rotation.z = sx * 0.6; g.add(br); }
  }
  for (const x of [W / 2 + 0.03, -W / 2 - 0.03]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.16, D + 0.1), timber, x, 0.6 + Hh - 0.08, 0));
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(mesh(new THREE.BoxGeometry(0.2, Hh, 0.2), timber, x, 0.6 + Hh / 2, z));
  g.add(mesh(new THREE.BoxGeometry(W + 0.1, 0.18, 0.12), timber, 0, 0.6 + Hh * 0.55, D / 2 + 0.02));
  // roof: a triangular prism with overhang
  const roofLen = D + 1.4, rw = W / 2 + 0.7, rh = 2.3;
  const shape = new THREE.Shape(); shape.moveTo(-rw, 0); shape.lineTo(0, rh); shape.lineTo(rw, 0); shape.lineTo(rw - 0.25, 0); shape.lineTo(0, rh - 0.28); shape.lineTo(-rw + 0.25, 0); shape.closePath();
  const rg = new THREE.ExtrudeGeometry(shape, { depth: roofLen, bevelEnabled: false });
  rg.translate(0, 0, -roofLen / 2);
  const roof = mesh(rg, texToon(opts.roof ?? '#a8533a', roofTex, 0.32), 0, 0.6 + Hh - 0.05, 0);
  roof.rotation.z = (rand() - 0.5) * 0.03;
  g.add(roof);
  const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(0, rh - 0.3); gable.lineTo(W / 2, 0); gable.closePath();
  const gg = new THREE.ShapeGeometry(gable);
  for (const z of [D / 2 + 0.01, -D / 2 - 0.01]) { const m = mesh(gg, wallMat, 0, 0.6 + Hh, z); if (z < 0) m.rotation.y = Math.PI; g.add(m); }
  // chimney
  const ch = mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), texToon('#a8a2a8', stoneTex), W * 0.25, 0.6 + Hh + 1.6, -D * 0.2);
  g.add(ch);
  g.userData.chimney = new THREE.Vector3(W * 0.25, 0.6 + Hh + 2.6, -D * 0.2);
  // roof tiles: overlapping courses down each slope, and a rounded ridge cap
  const roofCol = new THREE.Color(opts.roof ?? '#a8533a');
  const tiles = new THREE.Group(); tiles.position.copy(roof.position); tiles.rotation.copy(roof.rotation); g.add(tiles);
  const L = Math.hypot(rw, rh), ang = Math.atan2(rh, rw), courses = Math.floor(L / 0.3);
  const tileMats = [0.86, 0.95, 1.05].map(k => toon('#' + roofCol.clone().multiplyScalar(k).getHexString()));
  for (const side of [-1, 1]) for (let i = 0; i < courses; i++) {
    const t = (i + 0.5) / courses;
    const x = side * rw * (1 - t), y = rh * t;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, roofLen + 0.04), tileMats[Math.floor(rand() * 3)]);
    tile.position.set(x + side * Math.sin(ang) * 0.035, y + Math.cos(ang) * 0.035, 0);
    tile.rotation.z = side * -(ang) + side * -0.07;
    tile.castShadow = true; tiles.add(tile);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, roofLen + 0.1, 8), tileMats[0]);
  ridge.rotation.x = Math.PI / 2; ridge.position.set(0, rh - 0.02, 0); tiles.add(ridge);
  // gable windows: a small attic window with a cross, front and back
  const glow = toon('#ffe7a8', '#ffcf70', 0.6);
  const windowAt = (x: number, y: number, z: number, w: number, h: number, ry: number, shutters: string | null, box: string | null) => {
    const wg = new THREE.Group(); wg.position.set(x, y, z); wg.rotation.y = ry; g.add(wg);
    wg.add(mesh(new THREE.PlaneGeometry(w, h), glow, 0, 0, 0.02));
    for (const [bx, by, bw, bh] of [[0, h / 2, w + 0.12, 0.08], [0, -h / 2, w + 0.2, 0.1], [-w / 2, 0, 0.08, h], [w / 2, 0, 0.08, h], [0, 0, 0.04, h], [0, 0, w, 0.04]] as const)
      wg.add(mesh(new THREE.BoxGeometry(bw, bh, 0.06), timber, bx, by, 0.05));
    if (shutters) for (const s of [-1, 1]) {
      const sh = mesh(new THREE.BoxGeometry(w * 0.5, h + 0.04, 0.04), toon(shutters), s * (w * 0.75 + 0.06), 0, 0.04); wg.add(sh);
      for (const k of [-0.25, 0, 0.25]) wg.add(mesh(new THREE.BoxGeometry(w * 0.42, 0.025, 0.02), toon('#' + new THREE.Color(shutters).multiplyScalar(0.75).getHexString()), s * (w * 0.75 + 0.06), k * h, 0.07));
    }
    if (box) {
      wg.add(mesh(new THREE.BoxGeometry(w + 0.1, 0.18, 0.24), timber, 0, -h / 2 - 0.13, 0.14));
      for (let i = 0; i < 6; i++) wg.add(mesh(new THREE.SphereGeometry(0.075, 6, 4), toon(i % 2 ? box : i % 3 ? '#ffd24a' : '#6a9a4a'), -w / 2 + 0.05 + i * (w / 5.5), -h / 2 - 0.02, 0.18));
    }
    return wg;
  };
  const fl = opts.flowers ?? '#e8584a';
  const shut = opts.door ?? '#3f6a8a';
  for (const z of [D / 2 + 0.02, -D / 2 - 0.02]) windowAt(0, 0.6 + Hh + 0.75, z, 0.5, 0.55, z > 0 ? 0 : Math.PI, null, null);
  // front: the door with a little hood on brackets, a stone step and a lamp; a mullioned window with shutters and a flower box
  const dx = -W * 0.18;
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), toon(opts.door ?? '#3f6a8a'), dx, 1.4, D / 2 + 0.05));
  for (const [bx, by, bw, bh] of [[dx, 2.24, 1.14, 0.12], [dx - 0.5, 1.4, 0.12, 1.7], [dx + 0.5, 1.4, 0.12, 1.7]] as const) g.add(mesh(new THREE.BoxGeometry(bw, bh, 0.12), timber, bx, by, D / 2 + 0.07));
  for (const k of [-0.2, 0.2]) g.add(mesh(new THREE.BoxGeometry(0.03, 1.4, 0.02), toon('#' + new THREE.Color(opts.door ?? '#3f6a8a').multiplyScalar(0.7).getHexString()), dx + k, 1.38, D / 2 + 0.11));
  g.add(mesh(new THREE.SphereGeometry(0.045, 6, 4), toon('#d8b048'), dx + 0.3, 1.35, D / 2 + 0.13));
  const hood = mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), texToon(opts.roof ?? '#a8533a', roofTex, 0.32), dx, 2.48, D / 2 + 0.36); hood.rotation.x = 0.28; g.add(hood);
  for (const s of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), timber, dx + s * 0.6, 2.3, D / 2 + 0.25); b.rotation.x = -0.6; g.add(b); }
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.16, 0.6), texToon('#a8a2a8', stoneTex), dx, 0.6, D / 2 + 0.45));
  const lamp = new THREE.Group(); lamp.position.set(dx + 0.72, 2.0, D / 2 + 0.2); g.add(lamp);
  lamp.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), toon('#3a3040'), 0, 0.12, -0.08));
  lamp.add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), toon('#ffe7a8', '#ffcf70', 1.0), 0, 0, 0));
  lamp.add(mesh(new THREE.ConeGeometry(0.14, 0.1, 4), toon('#3a3040'), 0, 0.16, 0));
  windowAt(W * 0.24, 1.9, D / 2 + 0.03, 0.8, 0.7, 0, shut, fl);
  // the sides: two windows each, one with a flower box
  for (const sx of [1, -1]) for (const z of [-D * 0.22, D * 0.22]) windowAt(sx * (W / 2 + 0.03), 1.9, z, 0.6, 0.65, sx * Math.PI / 2, rand() > 0.4 ? shut : null, z > 0 ? fl : null);
  // chimney cap and pot
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.12, 0.78), texToon('#a8a2a8', stoneTex), W * 0.25, 0.6 + Hh + 2.55, -D * 0.2));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 8), toon('#b0603e'), W * 0.25, 0.6 + Hh + 2.75, -D * 0.2));
  // ivy climbing a front corner and spilling along the eaves; low flowering bushes along the footing
  const ivyCol = ['#4a7a3a', '#5a8a40', '#3f6a34'];
  const corner = rand() > 0.5 ? 1 : -1;
  for (let i = 0; i < 6; i++) {
    const y = 0.7 + i * 0.42, spread = 0.35 + i * 0.05;
    const c = leafClump({ radius: 0.36 + rand() * 0.14, color: ivyCol[i % 3], squash: 0.7, seed: i * 13 + 5, cards: 14 });
    c.position.set(corner * (W / 2 - spread * 0.4 + 0.08), y, D / 2 - spread * 0.3 + 0.12); c.scale.z = 0.55; g.add(c);
  }
  for (let i = 0; i < 4; i++) {
    const c = leafClump({ radius: 0.3, color: ivyCol[(i + 1) % 3], squash: 0.6, seed: i * 7 + 2, cards: 12 });
    c.position.set(corner * (W / 2 - 0.2 - i * 0.45), 0.6 + Hh + 0.05, D / 2 + 0.25); g.add(c);
  }
  const sideIvy = leafClump({ radius: 0.5, color: ivyCol[0], squash: 0.9, seed: 31, cards: 18 });
  sideIvy.position.set(-corner * (W / 2 + 0.1), 1.2, -D * 0.38); sideIvy.scale.x = 0.5; g.add(sideIvy);
  for (const [bx, bz] of [[W * 0.24 - 0.5, D / 2 + 0.45], [W * 0.24 + 0.55, D / 2 + 0.45], [-W / 2 - 0.35, -D * 0.1], [W / 2 + 0.35, D * 0.3]]) {
    const b = leafClump({ radius: 0.42, color: '#5a8a46', squash: 0.75, seed: Math.floor(bx * 10 + bz * 7) & 255, cards: 14 });
    b.position.set(bx, 0.45, bz); g.add(b);
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), toon(i % 2 ? fl : '#f4e8f0'), bx + (rand() - 0.5) * 0.6, 0.6 + rand() * 0.3, bz + (rand() - 0.5) * 0.5 + 0.1));
  }
  bake(g);
  ink(g);
  return g;
}

export function windmill(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.4, 5, 10), toon('#efe3cf'), 0, 2.5, 0));
  g.add(mesh(new THREE.ConeGeometry(1.35, 1.6, 10), toon('#a8533a'), 0, 5.8, 0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.1), toon('#3f6a8a'), 0, 0.6, 1.3));
  const hub = new THREE.Group(); hub.position.set(0, 4.6, 1.25);
  const sail = toon('#f4ecd8'), wood = toon('#6a4a34');
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    arm.add(mesh(new THREE.BoxGeometry(0.12, 3.2, 0.08), wood, 0, 1.6, 0));
    arm.add(mesh(new THREE.BoxGeometry(0.8, 2.4, 0.04), sail, 0.45, 1.9, 0));
    hub.add(arm);
  }
  hub.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), wood));
  g.add(hub);
  g.userData.hub = hub;
  ink(g);
  return g;
}

/** A washing line between two posts. Cloth pieces sway in the wind (see userData.cloth). */
export function laundry(len = 4): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#6a4a34');
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 5), wood, -len / 2, 1.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 5), wood, len / 2, 1.1, 0));
  const rope = mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 4), toon('#d8ccb0'), 0, 2.1, 0); rope.rotation.z = Math.PI / 2; g.add(rope);
  const cols = ['#f4ecdc', '#7fa8d8', '#e8a0a0', '#f2d27a', '#ffffff'];
  const cloth: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const piv = new THREE.Group(); piv.position.set(-len / 2 + 0.5 + i * (len - 1) / 4, 2.08, 0);
    const w = 0.45 + rand() * 0.3, h = 0.5 + rand() * 0.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 2), toon(cols[i]));
    (m.material as THREE.Material).side = THREE.DoubleSide;
    m.position.y = -h / 2; m.castShadow = true;
    piv.add(m); g.add(piv); cloth.push(piv);
  }
  g.userData.cloth = cloth;
  return g;
}

/** Strings of little flags. */
export function bunting(len = 6, sag = 0.5): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#e8584a', '#f2d27a', '#7fa8d8', '#f4ecdc', '#8ac06a'];
  const flags: THREE.Object3D[] = [];
  const n = Math.floor(len / 0.45);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -len / 2 + t * len, y = -Math.sin(t * Math.PI) * sag;
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 3), toon(cols[i % cols.length]));
    tri.rotation.z = Math.PI; tri.position.y = -0.16; tri.scale.z = 0.15;
    piv.add(tri); g.add(piv); flags.push(piv);
  }
  g.userData.flags = flags;
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#8a6444');
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.45), w, 0, 0.48, 0));
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.4, 0.08), w, 0, 0.8, -0.2));
  for (const x of [-0.75, 0.75]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.48, 0.4), w, x, 0.24, 0));
  ink(g);
  return g;
}

export function lanternPost(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#5a4030');
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), w, 0, 1.2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.07, 0.07), w, 0.25, 2.35, 0));
  const lamp = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), toon('#ffe2a0', '#ffc860', 1.4), 0.48, 2.12, 0);
  lamp.userData.noOutline = true;
  g.add(lamp);
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.15, 4), w, 0.48, 2.34, 0).rotateY(Math.PI / 4));
  ink(g);
  g.userData.lamp = lamp;
  return g;
}

export function gardenPatch(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.15, 1.6), toon('#7a5a3e'), 0, 0.05, 0));
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
    const kind = r === 1 ? '#c8d860' : '#5f9a48';
    const s = mesh(new THREE.SphereGeometry(0.16 + rand() * 0.06, 7, 5), toon(kind), -1.0 + i * 0.5, 0.2, -0.5 + r * 0.5);
    s.scale.y = 0.75; g.add(s);
  }
  return g;
}

export function woodpile(): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#9a6a44'), end = toon('#d8b080');
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5 - r; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.0, 7), m, -0.6 + i * 0.3 + r * 0.15, 0.15 + r * 0.26, 0);
    log.rotation.x = Math.PI / 2; g.add(log);
    const cap = mesh(new THREE.CircleGeometry(0.13, 7), end, log.position.x, log.position.y, 0.51); g.add(cap);
  }
  return g;
}

/** The old tree beside the spring: a broad, leaning trunk and big soft clumps of leaves. */
/**
 * The old tree: a huge weeping willow, the landmark of the spring valley. About 17 m tall, with a gnarled trunk
 * three people couldn't reach around, great limbs, a wide pale-green crown, and long strands that hang and sway.
 */
export function oldTree(): THREE.Group {
  const g = new THREE.Group();
  const bark = texToon('#6a4e3a', woodTex), barkDark = toon('#4f3a2c');
  // trunk: two leaning, twisted stems grown together, with flared roots
  const t1 = mesh(new THREE.CylinderGeometry(1.0, 1.9, 8.5, 11), bark, 0, 4.1, 0); t1.rotation.z = 0.08; t1.rotation.y = 0.4; g.add(t1);
  const t2 = mesh(new THREE.CylinderGeometry(0.75, 1.3, 7.5, 9), bark, 0.7, 3.8, -0.5); t2.rotation.z = -0.14; t2.rotation.x = 0.1; g.add(t2);
  for (let i = 0; i < 9; i++) { // ridges of bark running up the trunk
    const a = i / 9 * Math.PI * 2;
    const r = mesh(new THREE.CylinderGeometry(0.12, 0.28, 7.5, 5), barkDark, Math.cos(a) * 1.35, 3.6, Math.sin(a) * 1.35);
    r.rotation.z = -Math.cos(a) * 0.12; r.rotation.x = Math.sin(a) * 0.12; g.add(r);
  }
  for (let i = 0; i < 8; i++) { // roots spreading over the ground
    const a = i * 0.8 + 0.3, L = 2.6 + (i % 3) * 0.8;
    const rt = mesh(new THREE.CylinderGeometry(0.18, 0.6, L, 6), bark, Math.cos(a) * (1.4 + L * 0.35), 0.3, Math.sin(a) * (1.4 + L * 0.35));
    rt.rotation.z = Math.cos(a) * 1.25; rt.rotation.x = -Math.sin(a) * 1.25; g.add(rt);
  }
  // a knot hole, dark, at eye height
  const hole = mesh(new THREE.SphereGeometry(0.38, 10, 8), toon('#2a1e18'), 0.2, 2.4, 1.62); hole.scale.set(0.8, 1.2, 0.4); g.add(hole);
  // great limbs reaching out
  const limbs: [number, number, number][] = [[0.3, 2.6, 0.9], [2.4, 2.3, 0.8], [4.4, 2.8, 0.85], [-1.9, 2.4, 0.95], [1.3, 2.0, 0.7]];
  const tips: THREE.Vector3[] = [];
  for (const [a, len, lean] of limbs) {
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const L = len * 2.2;
    const base = new THREE.Vector3(Math.cos(a) * 0.6, 7.8, Math.sin(a) * 0.6);
    const limb = mesh(new THREE.CylinderGeometry(0.28, 0.7, L, 7), bark, 0, 0, 0);
    limb.position.copy(base).addScaledVector(dir, L / 2);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(limb);
    tips.push(base.clone().addScaledVector(dir, L));
  }
  // the crown: a wide dome of pale, sunny willow green
  const leaves: THREE.Object3D[] = [];
  const cols = ['#9cc94e', '#b2d65a', '#86bb46', '#c4dd6a'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996, r = i < 6 ? 1.5 + i * 0.4 : 3.2 + (i % 5) * 0.9;
    const l = leafClump({ radius: 2.4 + (i % 4) * 0.35, color: cols[i % 4], seed: i + 3, squash: 0.7 });
    l.position.set(Math.cos(a) * r, 12.2 + Math.sin(i * 1.7) * 1.2 - r * 0.25, Math.sin(a) * r); g.add(l); leaves.push(l);
  }
  for (const tip of tips) { const l = leafClump({ radius: 2.6, color: cols[1], seed: tip.x * 7 | 0, squash: 0.7 }); l.position.copy(tip); g.add(l); leaves.push(l); }
  // weeping strands: long ribbons that hang from the crown's rim and sway
  const strands: THREE.Object3D[] = [];
  const strandMat = toon('#a6cf58');
  const strandMat2 = toon('#8cbf48');
  for (let i = 0; i < 70; i++) {
    const a = i / 70 * Math.PI * 2 + Math.sin(i * 3.1) * 0.08, r = 5.4 + Math.sin(i * 2.3) * 1.1;
    const L = 3.6 + (i % 5) * 0.8;
    const piv = new THREE.Group(); piv.position.set(Math.cos(a) * r, 11.0 - (i % 3) * 0.5, Math.sin(a) * r);
    // a strand is a thin stem with leaves strung along it, tapering to a point
    const st = mesh(new THREE.CylinderGeometry(0.02, 0.05, L, 3), strandMat2, 0, -L / 2, 0); st.userData.noOutline = true; piv.add(st);
    for (let k = 0; k < 6; k++) {
      const lf = mesh(new THREE.SphereGeometry(0.16 - k * 0.015, 5, 3), k % 2 ? strandMat : strandMat2, (k % 2 ? 0.06 : -0.06), -0.4 - k * (L - 0.6) / 6, 0);
      lf.scale.set(0.7, 2.6, 0.5); lf.userData.noOutline = true; piv.add(lf);
    }
    piv.userData.a = a; g.add(piv); strands.push(piv);
  }
  ink(g, 0.05);
  g.userData.leaves = leaves;
  g.userData.strands = strands;
  return g;
}

/** Wind chimes of ice-blue glass, hung from a branch. */
export function treeChimes(): THREE.Group {
  const g = new THREE.Group();
  const ice = toon('#d8f1ff', '#9fdcff', 0.7);
  const list: THREE.Object3D[] = [];
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), toon('#6a4e3a'), 0, 0, 0).rotateZ(Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    const piv = new THREE.Group(); piv.position.x = -0.5 + i * 0.2;
    const len = 0.35 + Math.sin(i * 1.7) * 0.12 + 0.25;
    const c = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), ice, 0, -0.3 - len / 2, 0);
    const str = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 3), toon('#e8e0d0'), 0, -0.15, 0);
    piv.add(c, str); g.add(piv); list.push(piv);
  }
  g.userData.icicles = list;
  return g;
}

/** Mountain pine in soft stacked clumps. */
export function alpinePine(h = 6): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.3, h * 0.45, 6), toon('#5a3e2c'), 0, h * 0.22, 0));
  const col = rand() > 0.5 ? '#2d6e46' : '#3a8050';
  const m = toon(new THREE.Color(col).multiplyScalar(0.7).getStyle());
  ink(g, 0.04);
  for (let i = 0; i < 5; i++) {
    const r = (1.35 - i * 0.24) * h / 6;
    const y = h * (0.26 + i * 0.14);
    const core = mesh(new THREE.ConeGeometry(r * 0.55, h * 0.24, 7), m, 0, y + h * 0.1, 0); core.userData.noOutline = true; g.add(core);
    const t = firTier(r, h * 0.24, col, Math.floor(rand() * 1000)); t.position.y = y; t.rotation.y = i * 0.7; g.add(t);
  }
  return g;
}

/** A birch: a pale, slightly leaning trunk with dark bark marks, a few thin limbs that fork upward, and leaf clumps at their tips. */
export function birch(h = 5): THREE.Group {
  const g = new THREE.Group();
  const bark = toon('#efeae0'), mark = toon('#3a3430'), twig = toon('#7a6a5e');
  const lean = (rand() - 0.5) * 0.15;
  const trunk = new THREE.Group(); trunk.rotation.z = lean; g.add(trunk);
  trunk.add(mesh(new THREE.CylinderGeometry(0.09, 0.17, h, 7), bark, 0, h / 2, 0));
  // root flare
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + rand(); const r = mesh(new THREE.ConeGeometry(0.08, 0.5, 4), bark, Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15); r.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); trunk.add(r); }
  // bark: short dark dashes scattered round the trunk, denser near the foot
  for (let i = 0; i < 16; i++) {
    const y = 0.3 + Math.pow(rand(), 1.4) * h * 0.9, a = rand() * Math.PI * 2, r = 0.17 - (y / h) * 0.08;
    const d = mesh(new THREE.BoxGeometry(0.12 + rand() * 0.1, 0.035, 0.03), mark, Math.cos(a) * r, y, Math.sin(a) * r); d.rotation.y = -a + Math.PI / 2; trunk.add(d);
  }
  const leaves: THREE.Object3D[] = [];
  const cols = ['#86bf44', '#a6cc4c', '#78b040'];
  // limbs: thin branches that leave the trunk at different heights and end in a clump
  const limbs = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < limbs; i++) {
    const y = h * (0.5 + i / limbs * 0.42), a = i * 2.3 + rand(), len = 0.9 + rand() * 0.7, tilt = 0.7 + rand() * 0.3;
    const limb = new THREE.Group(); limb.position.y = y; limb.rotation.set(0, a, tilt); trunk.add(limb);
    limb.add(mesh(new THREE.CylinderGeometry(0.025, 0.05, len, 5), twig, 0, len / 2, 0));
    const tip = new THREE.Vector3(0, len, 0); limb.updateMatrix(); tip.applyMatrix4(limb.matrix);
    const l = leafClump({ radius: 0.6 + rand() * 0.35, color: cols[i % 3], seed: Math.floor(rand() * 999), cards: 20 });
    l.position.copy(tip).add(new THREE.Vector3(0, 0.25, 0)); trunk.add(l); leaves.push(l);
  }
  // the crown on top
  for (let i = 0; i < 3; i++) {
    const l = leafClump({ radius: 0.75 + rand() * 0.35, color: cols[(i + 1) % 3], seed: Math.floor(rand() * 999) });
    l.position.set((rand() - 0.5) * 0.8, h * 0.95 + i * 0.35, (rand() - 0.5) * 0.8); trunk.add(l); leaves.push(l);
  }
  ink(g, 0.04);
  g.userData.leaves = leaves;
  return g;
}

/** An orchard tree in blossom: a short twisting trunk that splits into crooked limbs under clouds of pink and white flowers. */
export function blossomTree(h = 4.2): THREE.Group {
  const g = new THREE.Group();
  const wood = texToon('#6a4a3c', woodTex);
  const pinks = ['#f4b8c8', '#f8d0dc', '#fbe6ec', '#e89ab0'];
  const leaves: THREE.Object3D[] = [];
  // trunk in two kinked pieces
  const t1 = mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.45, 7), wood, 0, h * 0.22, 0); t1.rotation.z = 0.12; g.add(t1);
  const t2 = mesh(new THREE.CylinderGeometry(0.13, 0.18, h * 0.3, 7), wood, -0.12, h * 0.55, 0.02); t2.rotation.z = -0.2; g.add(t2);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + rand() * 0.5, len = 1.1 + rand() * 0.8;
    const limb = new THREE.Group(); limb.position.set(-0.1, h * 0.55, 0); limb.rotation.set(0, a, 0.75 + rand() * 0.35); g.add(limb);
    limb.add(mesh(new THREE.CylinderGeometry(0.05, 0.11, len, 6), wood, 0, len / 2, 0));
    const tip = new THREE.Vector3(0, len, 0); limb.updateMatrix(); tip.applyMatrix4(limb.matrix);
    const c = leafClump({ radius: 0.85 + rand() * 0.4, color: pinks[i % 4], seed: Math.floor(rand() * 999), squash: 0.75 });
    c.position.copy(tip).add(new THREE.Vector3(0, 0.3, 0)); g.add(c); leaves.push(c);
  }
  for (let i = 0; i < 3; i++) {
    const c = leafClump({ radius: 1.0 + rand() * 0.3, color: pinks[(i + 2) % 4], seed: Math.floor(rand() * 999), squash: 0.7 });
    c.position.set((rand() - 0.5) * 1.0, h * 0.95 + i * 0.25, (rand() - 0.5) * 1.0); g.add(c); leaves.push(c);
  }
  // fallen petals on the grass below
  const petal = toon('#f8d0dc');
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2, r = 0.4 + Math.sqrt(rand()) * 2.2;
    const pm = mesh(new THREE.CircleGeometry(0.06 + rand() * 0.04, 5), petal, Math.cos(a) * r, 0.04, Math.sin(a) * r); pm.rotation.x = -Math.PI / 2; pm.userData.noOutline = true; g.add(pm);
  }
  ink(g, 0.04);
  g.userData.leaves = leaves; g.userData.trunk = 0.35; g.userData.petals = true;
  return g;
}

/** The old wooden bridge: a gentle arch on stone feet, with a handrail. */
export function bridge(span = 9, width = 2.4): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#8a6444'), dark = toon('#6a4a34'), stone = toon('#8f8a96');
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), x = -span / 2 + t * span, y = 0.9 + Math.sin(t * Math.PI) * 1.1;
    const plank = mesh(new THREE.BoxGeometry(span / N + 0.04, 0.12, width), i % 2 ? wood : dark, x, y, 0);
    plank.rotation.z = Math.cos(t * Math.PI) * 0.35;
    g.add(plank);
    if (i % 3 === 0) for (const z of [-width / 2, width / 2]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 5), dark, x, y + 0.5, z));
  }
  for (const z of [-width / 2, width / 2]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(-span / 2 + t * span, 1.95 + Math.sin(t * Math.PI) * 1.1, z)); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 5), dark));
  }
  // abutments: piles of rounded stones, sunk into the bank
  for (const x of [-span / 2 - 0.3, span / 2 + 0.3]) for (let k = 0; k < 7; k++) {
    const st = mesh(new THREE.DodecahedronGeometry(0.55 + (k % 3) * 0.12, 0), texToon('#b8b0a8', stoneTex), x + ((k * 37) % 5 - 2) * 0.18, 0.05 + (k % 2) * 0.35, -width / 2 - 0.2 + (k / 6) * (width + 0.4));
    st.rotation.set(k, k * 2.1, k * 0.7); st.scale.y = 0.75; g.add(st);
  }
  // stone steps down from each end of the deck to the bank, so you can walk on and off
  const slab = texToon('#a8a098', stoneTex);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const d = 0.35 + i * 0.7, top = 0.96 - d * 0.34;
    g.add(mesh(new THREE.BoxGeometry(0.74, top + 0.6, width - 0.1), slab, sx * (span / 2 + d), (top - 0.6) / 2, 0));
  }
  ink(g, 0.03);
  return g;
}

export function boathouse(): THREE.Group {
  const g = cottage({ wall: '#dfe6e8', roof: '#3f6a8a', door: '#a8533a', w: 3.6, d: 3.2, flowers: '#7fa8d8' });
  // paper boats drying on a line
  const line = laundry(3.2);
  line.position.set(0, 0, 2.6);
  (line.userData.cloth as THREE.Object3D[]).forEach(c => c.scale.setScalar(0.5));
  g.add(line);
  g.userData.cloth = line.userData.cloth;
  return g;
}

export function dock(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#8a6444');
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.38), w, 0, 0.5, i * 0.42));
  for (const x of [-0.7, 0.7]) for (const z of [0, 2.1]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), toon('#6a4a34'), x, 0.2, z));
  ink(g, 0.03);
  return g;
}

let rockMat: THREE.MeshToonMaterial | null = null;
let foamMat: THREE.MeshBasicMaterial | null = null;
/** One water-worn stone: a lumpy, flattened ball, darker and wet below the waterline, dry and pale on top, moss on the upstream side. */
function riverStone(r: number, waterY: number, flat: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const a = rand() * 6, b = rand() * 6, c = rand() * 6;
  const col = new Float32Array(pos.count * 3);
  const dry = new THREE.Color('#d8d0c2'), mid = new THREE.Color('#aaa192'), wet = new THREE.Color('#6a6560'), moss = new THREE.Color('#6d8a46'), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    // smooth lumps, so it reads as worn by water rather than cut
    const n = 1 + 0.13 * Math.sin(v.x * 3.1 + a) * Math.cos(v.z * 2.7 + b) + 0.07 * Math.sin(v.y * 5 + c) + 0.04 * Math.sin((v.x + v.z) * 7 + a);
    let y = v.y * r * n * flat;
    if (y > r * flat * 0.55) y = r * flat * 0.55 + (y - r * flat * 0.55) * 0.35; // flattened top
    if (y < waterY - 0.12 * r) y = waterY - 0.12 * r - (waterY - 0.12 * r - y) * 0.15; // under the water it spreads flat, so it doesn't show as a bowl
    pos.setXYZ(i, v.x * r * n * 1.15, y, v.z * r * n);
    const top = THREE.MathUtils.smoothstep(v.y, 0.2, 0.9);
    tmp.copy(mid).lerp(dry, top);
    const wetK = 1 - THREE.MathUtils.smoothstep(y, waterY - 0.02, waterY + 0.12);
    tmp.lerp(wet, wetK * 0.8);
    // moss on the upstream face (+z), above the water
    const m = THREE.MathUtils.smoothstep(v.z, 0.25, 0.75) * THREE.MathUtils.smoothstep(v.y, -0.1, 0.4) * (1 - wetK);
    tmp.lerp(moss, m * (0.55 + 0.3 * Math.sin(v.x * 9 + b)));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  rockMat ??= paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.25 });
  return new THREE.Mesh(geo, rockMat);
}

/** A river stone or a small cluster, seated a third under the water with foam on the downstream side.
 *  waterY: the water surface height above the group's origin. */
export function riverRock(s = 1, waterY = 0.35): THREE.Group {
  const g = new THREE.Group();
  const main = riverStone(0.75 * s, -0.08 * s, 0.78); // the waterline, in the stone's own space
  main.position.y = waterY + 0.08 * s; main.rotation.y = rand() * 6;
  g.add(main);
  const extra = rand() < 0.6 ? 1 + Math.floor(rand() * 2) : 0;
  for (let k = 0; k < extra; k++) {
    const rr = (0.28 + rand() * 0.22) * s;
    const st = riverStone(rr, -rr * 0.05, 0.6);
    const ang = rand() * 6.28, d = 0.75 * s + rr * 0.7;
    st.position.set(Math.cos(ang) * d, waterY + rr * 0.05, Math.sin(ang) * d); st.rotation.y = rand() * 6;
    g.add(st);
  }
  ink(g, 0.03);
  // foam: a soft ring at the waterline, heavier downstream (-z), and a short wake
  foamMat ??= new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.8, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55 * s, 1.0 * s, 20, 1), foamMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = waterY + 0.03; ring.scale.set(1.15, 1, 1); ring.userData.noOutline = true;
  const wake = new THREE.Mesh(new THREE.CircleGeometry(0.55 * s, 12), foamMat);
  wake.rotation.x = -Math.PI / 2; wake.position.set(0, waterY + 0.025, -1.15 * s); wake.scale.set(0.8, 1.9, 1); wake.userData.noOutline = true;
  g.add(ring, wake);
  return g;
}

export function boulder(s = 1): THREE.Group {
  const g = new THREE.Group();
  const r = mesh(new THREE.DodecahedronGeometry(1.1 * s, 1), toon('#8c8a9c'), 0, 0.4 * s, 0);
  r.scale.set(1.2, 0.8, 1); r.rotation.set(rand(), rand() * 6, rand() * 0.3);
  const moss = mesh(new THREE.SphereGeometry(0.95 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), toon('#6f9a4a'), 0, 0.75 * s, 0);
  moss.scale.set(1.15, 0.4, 0.95);
  g.add(r, moss);
  ink(g, 0.04);
  return g;
}

/** An old standing stone with a faint carved spiral that glows when you listen. */
export function echoStone(): THREE.Group {
  const g = new THREE.Group();
  const s = mesh(new THREE.BoxGeometry(0.8, 2.3, 0.5, 1, 4, 1), toon('#8a8898'), 0, 1.1, 0);
  const pos = s.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 - Math.max(0, y) * 0.25)); pos.setZ(i, pos.getZ(i) * (1 - Math.max(0, y) * 0.2)); }
  s.geometry.computeVertexNormals();
  s.rotation.z = (rand() - 0.5) * 0.12;
  g.add(s);
  const moss = mesh(new THREE.SphereGeometry(0.4, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6f9a4a'), 0, 2.15, 0); moss.scale.set(0.9, 0.35, 0.6); g.add(moss);
  const glowM = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.25 });
  const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 20, Math.PI * 1.7), glowM); spiral.position.set(0, 1.4, 0.26); spiral.userData.noOutline = true;
  const spiral2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 4, 16, Math.PI * 1.5), glowM); spiral2.position.set(0.02, 1.4, 0.26); spiral2.rotation.z = 1.5; spiral2.userData.noOutline = true;
  g.add(spiral, spiral2);
  ink(g, 0.035);
  g.userData.glow = glowM;
  return g;
}

/** The spring: a ring of mossy stones around a basin. Its water rises as the valley heals. */
export function springBasin(): THREE.Group {
  const g = new THREE.Group();
  const water = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 24), toon('#7fd0e8', '#5fb8d8', 0.12), 0, 0.12, 0);
  water.userData.noOutline = true;
  g.add(water);
  g.add(mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.2, 24), toon('#7a7488'), 0, -0.02, 0));
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const st = mesh(new THREE.DodecahedronGeometry(0.55 + rand() * 0.3), toon('#a8a296'), Math.cos(a) * 3.1, 0.25, Math.sin(a) * 3.1);
    st.scale.y = 0.75; g.add(st);
    if (i % 2 === 0) { const m = mesh(new THREE.SphereGeometry(0.4, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6f9a4a'), st.position.x, 0.6, st.position.z); m.scale.set(1, 0.4, 1); g.add(m); }
  }
  // the lip stone where the drop gathers
  const lip = mesh(new THREE.BoxGeometry(1.0, 1.3, 0.6), toon('#a8a296'), 0, 0.65, -3.0); g.add(lip);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#e8fbff' }));
  drop.position.set(0, 1.25, -2.65); drop.userData.noOutline = true;
  g.add(drop);
  const light = new THREE.PointLight('#bfefff', 2.2, 8, 1.6); light.position.y = 1.5; g.add(light);
  ink(g, 0.035);
  g.userData.drop = drop; g.userData.water = water; g.userData.light = light;
  return g;
}

/** Tor's workbench, cluttered with string, paper and sticks. */
export function workbench(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#8a6444');
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.8), w, 0, 0.85, 0));
  for (const x of [-0.8, 0.8]) for (const z of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), w, x, 0.42, z));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.02, 0.3), toon('#f4ecd8'), -0.4, 0.91, 0));
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 5, 10), toon('#d8ccb0'), 0.3, 0.93, 0.1).rotateX(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), toon('#6a4a34'), 0.2, 0.92, -0.2).rotateZ(Math.PI / 2));
  ink(g, 0.03);
  return g;
}

/** A small stack of flat stones that marks a path. */
export function cairn(): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#a8a29a', '#8a847c');
  [[0.36, 0.16], [0.28, 0.14], [0.2, 0.12], [0.12, 0.1]].reduce((y, [r, h], i) => {
    const s = mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 7), m, (i % 2 ? 0.03 : -0.02), y + h / 2, (i % 2 ? -0.02 : 0.03));
    s.rotation.y = i * 1.3; g.add(s); return y + h;
  }, 0);
  ink(g, 0.02);
  return g;
}

/** Tor's kite (the real one): a red diamond with a long tail. */
export function torKite(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(0, 0.9); shape.lineTo(0.6, 0.2); shape.lineTo(0, -0.8); shape.lineTo(-0.6, 0.2); shape.closePath();
  const k = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon('#d8483a')); (k.material as THREE.Material).side = THREE.DoubleSide;
  const k2 = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon('#f2d27a')); k2.scale.setScalar(0.45); k2.position.z = 0.01; (k2.material as THREE.Material).side = THREE.DoubleSide;
  g.add(k, k2);
  const tail: THREE.Object3D[] = [];
  let parent: THREE.Object3D = g;
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), toon(i % 2 ? '#f2d27a' : '#3f86b8')); (r.material as THREE.Material).side = THREE.DoubleSide;
    r.position.y = i === 0 ? -0.95 : -0.34; parent.add(r); parent = r; tail.push(r);
  }
  g.userData.tail = tail;
  return g;
}

export function willowBranch(): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 5), toon('#8a6a44'), 0, 0.08, 0); b.rotation.z = Math.PI / 2; g.add(b);
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.SphereGeometry(0.07, 5, 4), toon('#8ab84a'), -0.5 + i * 0.4, 0.1, 0.05); l.scale.set(1.8, 0.4, 0.8); g.add(l); }
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 5, 24), new THREE.MeshBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: 0.5 }));
  glow.rotation.x = Math.PI / 2; glow.position.y = 0.05; glow.userData.noOutline = true; g.add(glow);
  ink(g, 0.02);
  return g;
}

/** Dry stone wall segment for the terraces. */
export function stoneWall(len = 5): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#8f8a96', '#9a96a2', '#837e8c'];
  const n = Math.floor(len / 0.5);
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
    const s = mesh(new THREE.BoxGeometry(0.5, 0.32, 0.5), toon(cols[(i + r) % 3]), -len / 2 + i * 0.5 + (r ? 0.25 : 0), 0.16 + r * 0.3, 0);
    s.rotation.y = (rand() - 0.5) * 0.2; g.add(s);
  }
  return g;
}

/** A little round rock-and-turf hut for the high pasture. */
export function goatShed(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.6, 10), toon('#9a96a2'), 0, 0.8, 0));
  const roof = mesh(new THREE.SphereGeometry(1.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6f9a4a'), 0, 1.6, 0); roof.scale.y = 0.6; g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.7, 1.0, 0.1), toon('#4a3a30'), 0, 0.5, 1.72));
  ink(g, 0.04);
  return g;
}

export type RoomKind = 'tor' | 'ysolde' | 'nima' | 'bram';

/**
 * Inside a cottage: one room, a table, a window, and the owner's things.
 * Closed on all sides; the camera stands by the door (+z) and looks at the back wall (-z).
 */
export function interior(kind: RoomKind, wall = '#f1e6d2'): THREE.Group {
  const g = new THREE.Group();
  const W = 5.2, D = 4.4, H = 2.9;
  const plaster = texToon(wall, plasterTex), floor = texToon('#9a6c48', woodTex), timber = toon('#5a3e2c'), wood = toon('#8a6444');
  g.add(mesh(new THREE.BoxGeometry(W, 0.1, D), floor, 0, -0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(W, 0.1, D), plaster, 0, H + 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(W, H, 0.1), plaster, 0, H / 2, -D / 2));
  g.add(mesh(new THREE.BoxGeometry(W, H, 0.1), plaster, 0, H / 2, D / 2));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, H, D), plaster, s * W / 2, H / 2, 0));
  // beams across the ceiling, a skirting of timber
  for (const z of [-1.2, 0.2, 1.6]) g.add(mesh(new THREE.BoxGeometry(W, 0.18, 0.2), timber, 0, H - 0.1, z));
  g.add(mesh(new THREE.BoxGeometry(W, 0.14, 0.06), timber, 0, 0.07, -D / 2 + 0.06));
  // the window on the back wall, full of daylight, with a cross of timber and a sill
  const win = mesh(new THREE.PlaneGeometry(1.3, 1.0), toon('#cfe6f5', '#bfe0ff', 0.9), 0.9, 1.75, -D / 2 + 0.06); g.add(win);
  g.add(mesh(new THREE.BoxGeometry(1.45, 0.08, 0.08), timber, 0.9, 1.75, -D / 2 + 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), timber, 0.9, 1.75, -D / 2 + 0.08));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.3), wood, 0.9, 1.22, -D / 2 + 0.15));
  g.userData.window = win;
  // rug, table, two stools
  const rug = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 20), toon(kind === 'tor' ? '#c4583e' : kind === 'nima' ? '#6f8fc8' : kind === 'bram' ? '#a8763e' : '#8a7aa8'), 0.2, 0.01, -0.2);
  rug.scale.z = 0.7; g.add(rug);
  const tx = 0.3, tz = -0.6;
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), wood, tx, 0.78, tz));
  for (const [x, z] of [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.38], [0.7, 0.38]]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.76, 0.08), timber, tx + x, 0.38, tz + z));
  for (const x of [-0.6, 1.2]) { g.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 10), wood, tx + x, 0.48, tz + 0.75)); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 5), timber, tx + x, 0.23, tz + 0.75)); }
  // a candle on the table, and the warm light it gives
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), toon('#f4ecdc'), tx - 0.5, 0.92, tz));
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), toon('#ffd27a', '#ffb347', 1.4), tx - 0.5, 1.06, tz));
  const lamp = new THREE.PointLight('#ffc98a', 2.2, 8, 1.4); lamp.position.set(tx - 0.5, 1.6, tz + 0.4); g.add(lamp);
  const fill = new THREE.PointLight('#fff1da', 0.8, 9, 1.2); fill.position.set(0, 2.4, 1.6); g.add(fill);
  // a shelf on the left wall
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 2.2), wood, -W / 2 + 0.2, 1.7, -0.6));

  const on = (o: THREE.Object3D) => { g.add(o); return o; };
  if (kind === 'tor') {
    // kite frames hung on the back wall, paper rolls and a spool of string on the table
    const frame = (x: number, y: number, s: number, paper: string) => {
      const k = new THREE.Group();
      const sail = mesh(new THREE.CircleGeometry(0.5, 4), toon(paper), 0, 0, 0); sail.scale.set(0.8, 1.15, 1); k.add(sail);
      k.add(mesh(new THREE.BoxGeometry(0.03, 1.2, 0.03), timber, 0, 0, 0.02));
      k.add(mesh(new THREE.BoxGeometry(0.85, 0.03, 0.03), timber, 0, 0.1, 0.02));
      k.position.set(x, y, -D / 2 + 0.1); k.scale.setScalar(s); return on(k);
    };
    frame(-1.4, 1.8, 1, '#e8584a'); frame(-0.5, 2.1, 0.7, '#f4d06a');
    for (let i = 0; i < 3; i++) { const r = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), toon(['#f4ecdc', '#e8584a', '#7fa8d8'][i]), tx + 0.1 + i * 0.16, 0.88, tz - 0.1); r.rotation.z = Math.PI / 2; g.add(r); }
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10), toon('#d8b88a'), tx + 0.6, 0.89, tz + 0.2));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 1.0), wood, -W / 2 + 0.2, 1.75 + i * 0.03, -0.6 + (i - 1.5) * 0.12));
  } else if (kind === 'ysolde') {
    // a row of small stones on the shelf, a painted chart of the glacier, a kettle
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.09 + (i % 3) * 0.03, 0), texToon('#b8b0a8', stoneTex), -W / 2 + 0.2, 1.8, -1.5 + i * 0.35));
    const chart = mesh(new THREE.PlaneGeometry(1.2, 0.85), toon('#efe0c0'), -1.1, 1.75, -D / 2 + 0.07); g.add(chart);
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.9 - i * 0.12, 0.03, 0.01), toon('#7fa8d8'), -1.1, 1.45 + i * 0.13, -D / 2 + 0.08));
    g.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), toon('#5d5a8a'), tx + 0.4, 0.95, tz + 0.1));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 8), toon('#5d5a8a'), tx + 0.4, 1.12, tz + 0.1));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 8), toon('#f4ecdc'), tx, 0.87, tz + 0.2));
  } else if (kind === 'nima') {
    // Nima: a bed under a blue blanket, cloud drawings pinned up, paper birds on the shelf
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.4, 2.0), wood, W / 2 - 0.6, 0.2, 0.6));
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.12, 1.9), toon('#6f8fc8'), W / 2 - 0.6, 0.46, 0.6));
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.35), toon('#f4ecdc'), W / 2 - 0.6, 0.54, -0.2));
    for (let i = 0; i < 4; i++) {
      const x = -1.9 + i * 0.6, y = 1.6 + (i % 2) * 0.45;
      g.add(mesh(new THREE.PlaneGeometry(0.5, 0.38), toon('#fbf6ea'), x, y, -D / 2 + 0.07));
      for (let k = 0; k < 3; k++) { const c = mesh(new THREE.CircleGeometry(0.07 + k * 0.02, 10), toon('#9fc3e8'), x - 0.1 + k * 0.1, y - 0.02 + (k === 1 ? 0.04 : 0), -D / 2 + 0.08); g.add(c); }
    }
    for (let i = 0; i < 3; i++) { const b = mesh(new THREE.ConeGeometry(0.08, 0.22, 3), toon('#fbf6ea'), -W / 2 + 0.2, 1.82, -1.3 + i * 0.5); b.rotation.z = Math.PI / 2; g.add(b); }
  } else {
    // Bram: goat bells on hooks along the back wall, a heap of hay, a crook by the door
    for (let i = 0; i < 5; i++) {
      const x = -2.0 + i * 0.45;
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4), timber, x, 2.25, -D / 2 + 0.12));
      g.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 8, 1, true), toon('#c9a24a'), x, 2.08, -D / 2 + 0.14));
    }
    for (let i = 0; i < 6; i++) { const hay = mesh(new THREE.SphereGeometry(0.4, 8, 6), toon('#d8c07a'), W / 2 - 0.7 + (i % 3) * 0.2, 0.25 + Math.floor(i / 3) * 0.25, 1.0 + (i % 2) * 0.4); hay.scale.y = 0.6; g.add(hay); }
    const crook = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), timber, -W / 2 + 0.4, 0.9, 1.6); crook.rotation.z = 0.15; g.add(crook);
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.18, 10), toon('#f4ecdc'), tx + 0.3, 0.91, tz));
  }
  ink(g, 0.02);
  return g;
}
