import * as THREE from 'three';
import { toon, rand } from './props';
import { addOutlines } from '../render/paint';

// Hand-made pieces for the Spring Peaks. Built from simple shapes, inked, and a little crooked on purpose.

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
const ink = (g: THREE.Object3D, w = 0.035) => addOutlines(g, '#3b2a30', w);

/** A cottage: stone footing, white plaster, timber, a steep red-brown roof with a deep overhang. */
export function cottage(opts: { wall?: string; roof?: string; door?: string; w?: number; d?: number; flowers?: string } = {}): THREE.Group {
  const g = new THREE.Group();
  const W = opts.w ?? 4.2, D = opts.d ?? 3.6, Hh = 2.6;
  g.add(mesh(new THREE.BoxGeometry(W + 0.3, 0.6, D + 0.3), toon('#8f8a96'), 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(W, Hh, D), toon(opts.wall ?? '#f1e6d2'), 0, 0.6 + Hh / 2, 0));
  const timber = toon('#6a4a34');
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(mesh(new THREE.BoxGeometry(0.2, Hh, 0.2), timber, x, 0.6 + Hh / 2, z));
  g.add(mesh(new THREE.BoxGeometry(W + 0.1, 0.18, 0.12), timber, 0, 0.6 + Hh * 0.55, D / 2 + 0.02));
  // roof: a triangular prism with overhang
  const roofLen = D + 1.4, rw = W / 2 + 0.7, rh = 2.3;
  const shape = new THREE.Shape(); shape.moveTo(-rw, 0); shape.lineTo(0, rh); shape.lineTo(rw, 0); shape.lineTo(rw - 0.25, 0); shape.lineTo(0, rh - 0.28); shape.lineTo(-rw + 0.25, 0); shape.closePath();
  const rg = new THREE.ExtrudeGeometry(shape, { depth: roofLen, bevelEnabled: false });
  rg.translate(0, 0, -roofLen / 2);
  const roof = mesh(rg, toon(opts.roof ?? '#a8533a'), 0, 0.6 + Hh - 0.05, 0);
  g.add(roof);
  const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(0, rh - 0.3); gable.lineTo(W / 2, 0); gable.closePath();
  const gg = new THREE.ShapeGeometry(gable);
  for (const z of [D / 2 + 0.01, -D / 2 - 0.01]) { const m = mesh(gg, toon(opts.wall ?? '#f1e6d2'), 0, 0.6 + Hh, z); if (z < 0) m.rotation.y = Math.PI; g.add(m); }
  // chimney
  const ch = mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), toon('#8f8a96'), W * 0.25, 0.6 + Hh + 1.6, -D * 0.2);
  g.add(ch);
  g.userData.chimney = new THREE.Vector3(W * 0.25, 0.6 + Hh + 2.6, -D * 0.2);
  // door, round window, shutters, flower box
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), toon(opts.door ?? '#3f6a8a'), -W * 0.18, 1.4, D / 2 + 0.05));
  const win = mesh(new THREE.CircleGeometry(0.38, 16), toon('#ffe7a8', '#ffcf70', 0.6), W * 0.22, 1.9, D / 2 + 0.06); g.add(win);
  g.add(mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16), timber, W * 0.22, 1.9, D / 2 + 0.07));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.3), timber, W * 0.22, 1.35, D / 2 + 0.2));
  const fl = opts.flowers ?? '#e8584a';
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), toon(i % 2 ? fl : '#ffd24a'), W * 0.22 - 0.36 + i * 0.18, 1.52, D / 2 + 0.22));
  // side window with warm light
  const sw = mesh(new THREE.BoxGeometry(0.05, 0.7, 0.6), toon('#ffe7a8', '#ffcf70', 0.6), W / 2 + 0.02, 1.9, 0); g.add(sw);
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
export function oldTree(): THREE.Group {
  const g = new THREE.Group();
  const bark = toon('#6a4e3a');
  const trunk = mesh(new THREE.CylinderGeometry(0.45, 0.85, 5.5, 9), bark, 0, 2.6, 0); trunk.rotation.z = 0.12; g.add(trunk);
  const b1 = mesh(new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7), bark, 0.9, 5.4, 0.2); b1.rotation.z = -0.7; g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.2, 0.34, 3, 7), bark, -0.9, 5.6, -0.3); b2.rotation.z = 0.8; g.add(b2);
  const leaves: THREE.Mesh[] = [];
  const cols = ['#4f8a44', '#5f9e4a', '#3f7a40', '#6aa852'];
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2, r = 1 + rand() * 2.4;
    const l = mesh(new THREE.IcosahedronGeometry(1.4 + rand() * 0.9, 1), toon(cols[i % 4]), Math.cos(a) * r, 6.5 + rand() * 2.4, Math.sin(a) * r);
    l.scale.y = 0.8; g.add(l); leaves.push(l);
  }
  // roots
  for (let i = 0; i < 5; i++) { const a = i * 1.3; const rt = mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.8, 5), bark, Math.cos(a) * 0.9, 0.25, Math.sin(a) * 0.9); rt.rotation.z = Math.cos(a) * 1.2; rt.rotation.x = -Math.sin(a) * 1.2; g.add(rt); }
  ink(g, 0.05);
  g.userData.leaves = leaves;
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
  const col = rand() > 0.5 ? '#2f6a48' : '#3a7a50';
  const m = toon(col);
  for (let i = 0; i < 4; i++) {
    const r = (1.3 - i * 0.28) * h / 6;
    const c = mesh(new THREE.ConeGeometry(r, h * 0.3, 8), m, 0, h * (0.32 + i * 0.16), 0);
    c.rotation.y = i * 0.7; g.add(c);
  }
  ink(g, 0.04);
  return g;
}

export function birch(h = 5): THREE.Group {
  const g = new THREE.Group();
  const t = mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 6), toon('#efeae0'), 0, h / 2, 0); t.rotation.z = (rand() - 0.5) * 0.15; g.add(t);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.17, 0.05, 0.17), toon('#3a3430'), 0, 0.6 + i * h * 0.2, 0));
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const l = mesh(new THREE.IcosahedronGeometry(0.8 + rand() * 0.5, 1), toon(i % 2 ? '#8ab84a' : '#a8c850'), (rand() - 0.5) * 1.4, h * 0.75 + rand() * 1.4, (rand() - 0.5) * 1.4);
    g.add(l); leaves.push(l);
  }
  ink(g, 0.04);
  g.userData.leaves = leaves;
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
  for (const x of [-span / 2 - 0.3, span / 2 + 0.3]) g.add(mesh(new THREE.BoxGeometry(1.4, 1.4, width + 0.8), stone, x, 0.4, 0));
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

export function riverRock(s = 1): THREE.Group {
  const g = new THREE.Group();
  const r = mesh(new THREE.DodecahedronGeometry(0.7 * s, 0), toon('#8a8698'), 0, 0.1, 0);
  r.scale.set(1.3, 0.7, 1); r.rotation.y = rand() * 6;
  const top = mesh(new THREE.SphereGeometry(0.5 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6f9a4a'), 0, 0.45 * s, 0);
  top.scale.set(1.2, 0.35, 0.9);
  g.add(r, top);
  ink(g, 0.03);
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
