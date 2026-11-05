import * as THREE from 'three';
import { toon, rand } from './props';
import { addOutlines } from '../render/paint';
import { leafClump, firTier } from '../render/foliage';
import { texToon, plasterTex, roofTex, woodTex, stoneTex } from '../render/textures';

// Hand-made pieces for the Spring Peaks. Built from simple shapes, inked, and a little crooked on purpose.

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
const ink = (g: THREE.Object3D, w = 0.035) => addOutlines(g, '#3b2a30', w);

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
  const leaves: THREE.Object3D[] = [];
  const cols = ['#4f9a3c', '#62ad44', '#3f8a3a', '#78bb4c'];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, r = 0.8 + rand() * 2.4;
    const l = leafClump({ radius: 1.5 + rand() * 0.8, color: cols[i % 4], seed: i + 3 });
    l.position.set(Math.cos(a) * r, 6.4 + rand() * 2.6, Math.sin(a) * r); g.add(l); leaves.push(l);
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

export function birch(h = 5): THREE.Group {
  const g = new THREE.Group();
  const t = mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 6), toon('#efeae0'), 0, h / 2, 0); t.rotation.z = (rand() - 0.5) * 0.15; g.add(t);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.17, 0.05, 0.17), toon('#3a3430'), 0, 0.6 + i * h * 0.2, 0));
  const leaves: THREE.Object3D[] = [];
  ink(g, 0.04);
  for (let i = 0; i < 5; i++) {
    const l = leafClump({ radius: 0.9 + rand() * 0.5, color: i % 2 ? '#86bf44' : '#a6cc4c', seed: Math.floor(rand() * 999) });
    l.position.set((rand() - 0.5) * 1.4, h * 0.75 + rand() * 1.4, (rand() - 0.5) * 1.4);
    g.add(l); leaves.push(l);
  }
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
