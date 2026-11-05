import * as THREE from 'three';
import { paint, softRamp } from '../render/paint';

const mats = new Map<string, THREE.Material>();
export function toon(color: string, emissive?: string, ei = 0.6): THREE.MeshToonMaterial {
  const key = color + (emissive ?? '') + ei;
  let m = mats.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp() }));
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    mats.set(key, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o;
}

let seed = 99;
export function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// ---- Spring Peaks ----
export function stone(height: number, carved: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = mesh(new THREE.BoxGeometry(0.9, height, 0.45, 1, 3, 1), toon('#a7a199'), 0, height / 2, 0);
  s.rotation.y = (rand() - 0.5) * 0.4; s.rotation.z = (rand() - 0.5) * 0.08;
  g.add(s);
  if (carved) {
    const line = mesh(new THREE.BoxGeometry(0.7, 0.07, 0.48), toon('#cfe9ff', '#9fdcff', 0.8), 0, height * 0.72, 0);
    line.rotation.copy(s.rotation);
    g.add(line);
  }
  return g;
}

export function hut(color = '#b7a59a', roof = '#6f5f8a'): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 2.4, 9), toon(color), 0, 1.2, 0));
  const r = mesh(new THREE.ConeGeometry(3.1, 2.6, 9), toon(roof), 0, 3.6, 0);
  g.add(r);
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.5, 0.3), toon('#3a3048'), 0, 0.75, 2.25));
  const snowcap = mesh(new THREE.ConeGeometry(1.4, 0.9, 9), toon('#ffffff'), 0, 4.55, 0);
  g.add(snowcap);
  return g;
}

export function campfire(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.DodecahedronGeometry(0.35), toon('#6a6478'), Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9));
  }
  const flame = mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: '#ffb35a' }), 0, 0.7, 0);
  const core = mesh(new THREE.ConeGeometry(0.25, 0.8, 6), new THREE.MeshBasicMaterial({ color: '#fff0b0' }), 0, 0.5, 0);
  g.add(flame, core);
  const light = new THREE.PointLight('#ffa860', 30, 16, 1.6);
  light.position.y = 1.2;
  g.add(light);
  g.userData.flame = flame; g.userData.light = light;
  return g;
}

export function chimes(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon('#6b5a5a');
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 5), wood, -1.4, 1.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 5), wood, 1.4, 1.6, 0));
  const bar = mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 5), wood, 0, 3.15, 0); bar.rotation.z = Math.PI / 2; g.add(bar);
  const ice = toon('#d8f1ff', '#9fdcff', 0.7);
  const list: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const len = 0.6 + Math.sin(i * 1.7) * 0.3 + 0.5;
    const c = mesh(new THREE.ConeGeometry(0.09, len, 5), ice, -1.1 + i * 0.37, 3.05 - len / 2, 0);
    c.rotation.x = Math.PI;
    list.push(c); g.add(c);
  }
  g.userData.icicles = list;
  return g;
}

export function fence(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#7a6250');
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), w, -3 + i * 1.5, 1.1, 0));
  for (let j = 0; j < 4; j++) g.add(mesh(new THREE.BoxGeometry(6.4, 0.22, 0.06), w, 0, 0.5 + j * 0.45, 0));
  const drift = mesh(new THREE.SphereGeometry(3.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ffffff'), 0, -0.6, 1.4);
  drift.scale.set(1.1, 0.45, 0.6); g.add(drift);
  return g;
}

export function cairn(glow: string): THREE.Group {
  const g = new THREE.Group();
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const r = 0.55 - i * 0.1;
    g.add(mesh(new THREE.DodecahedronGeometry(r), toon('#9a948c'), (rand() - 0.5) * 0.1, y + r, 0));
    y += r * 1.6;
  }
  const ring = mesh(new THREE.TorusGeometry(1.6, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0 }), 0, 0.1, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

export function stupa(): THREE.Group {
  const g = new THREE.Group();
  const ice = toon('#cfeeff', '#8fd3ff', 0.5);
  g.add(mesh(new THREE.ConeGeometry(2.4, 7.5, 10), ice, 0, 3.75, 0));
  g.add(mesh(new THREE.ConeGeometry(1.2, 3.0, 8), toon('#ffffff'), 0, 6.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 4), toon('#7a6250'), 0, 4.5, 0));
  return g;
}

export function pole(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), toon(i % 2 ? '#e8e2d8' : '#c4524a'), 0, 0.25 + i * 0.5, 0));
  }
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 6), toon('#c4524a'), 0, 4.15, 0));
  const drift = mesh(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ffffff'), 0, -0.2, 0);
  drift.scale.set(1, 0.9, 1); g.add(drift);
  g.userData.drift = drift;
  return g;
}

export function goat(): THREE.Group {
  const g = new THREE.Group();
  const fur = toon(rand() > 0.5 ? '#f2ece4' : '#8a6a52');
  g.add(mesh(new THREE.CapsuleGeometry(0.4, 0.7, 3, 8), fur, 0, 0.75, 0).rotateX(Math.PI / 2));
  g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), fur, 0, 1.05, 0.6));
  for (const [x, z] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.35], [0.25, 0.35]]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4), toon('#3a3040'), x, 0.3, z));
  const horn = mesh(new THREE.ConeGeometry(0.06, 0.3, 4), toon('#3a3040'), 0.1, 1.35, 0.55); horn.rotation.x = -0.6; g.add(horn);
  const horn2 = horn.clone(); horn2.position.x = -0.1; g.add(horn2);
  return g;
}

export function spring(): THREE.Group {
  const g = new THREE.Group();
  const pool = mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.4, 20), toon('#9fe3ff', '#7fd0ff', 0.9), 0, 0.2, 0);
  g.add(pool);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(mesh(new THREE.DodecahedronGeometry(0.6 + rand() * 0.4), toon('#8e8aa8'), Math.cos(a) * 3.9, 0.2, Math.sin(a) * 3.9));
  }
  const glow = mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: '#e8fbff' }), 0, 1.2, 0);
  g.add(glow);
  const light = new THREE.PointLight('#bfefff', 25, 18, 1.5); light.position.y = 1.5; g.add(light);
  g.userData.drop = glow;
  return g;
}

export function cloudWisp(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#dfe6ff', emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 6; i++) {
    const s = 1.2 + rand() * 1.4;
    const p = mesh(new THREE.IcosahedronGeometry(s, 2), m, (rand() - 0.5) * 5, (rand() - 0.2) * 1.5, (rand() - 0.5) * 3);
    g.add(p);
  }
  return g;
}

export function edgeArch(color = '#8e8aa8'): THREE.Group {
  const g = new THREE.Group();
  const m = toon(color);
  g.add(mesh(new THREE.BoxGeometry(1.2, 7, 1.2), m, -5.5, 3.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.2, 7, 1.2), m, 5.5, 3.5, 0));
  const top = mesh(new THREE.TorusGeometry(5.5, 0.6, 6, 18, Math.PI), m, 0, 7, 0);
  g.add(top);
  return g;
}

// ---- other worlds (journey sketch) ----
export function pine(h = 8, burnt = false): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, h * 0.4, 5), toon(burnt ? '#2a2420' : '#5a4030'), 0, h * 0.2, 0));
  const col = burnt ? '#3a302a' : (rand() > 0.5 ? '#2f5a3a' : '#3d6a40');
  for (let i = 0; i < 3; i++) {
    const r = (1.6 - i * 0.4) * h / 8;
    g.add(mesh(new THREE.ConeGeometry(r, h * 0.35, 7), toon(col), 0, h * (0.35 + i * 0.2), 0));
  }
  return g;
}

export function sprout(): THREE.Mesh {
  return mesh(new THREE.ConeGeometry(0.25, 0.7, 5), toon('#8ad04a', '#6ab03a', 0.3), 0, 0.35, 0);
}

export function tower(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#6a4a3a');
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.15, 0.2, 12, 5), w, x * 1.4, 6, z * 1.4);
    leg.rotation.z = -x * 0.06; leg.rotation.x = z * 0.06; g.add(leg);
  }
  g.add(mesh(new THREE.BoxGeometry(4, 2, 4), toon('#8a6a50'), 0, 12.6, 0));
  g.add(mesh(new THREE.ConeGeometry(3.4, 2, 4), toon('#a8503a'), 0, 14.6, 0).rotateY(Math.PI / 4));
  const l = new THREE.PointLight('#ffb070', 20, 20, 1.5); l.position.y = 12.6; g.add(l);
  return g;
}

export function giantTree(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.2, 2.2, 22, 8), toon('#6a5440'), 0, 11, 0));
  for (let i = 0; i < 5; i++) {
    const s = 5 + rand() * 4;
    g.add(mesh(new THREE.IcosahedronGeometry(s, 1), toon(rand() > 0.5 ? '#2f7a4a' : '#3f9a55'), (rand() - 0.5) * 9, 22 + rand() * 6, (rand() - 0.5) * 9));
  }
  return g;
}

export function fungus(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 5), toon('#e8e0c8'), 0, 0.3, 0));
  g.add(mesh(new THREE.SphereGeometry(0.4, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9ff0d8' }), 0, 0.6, 0));
  return g;
}

export function windTown(): THREE.Group {
  const g = new THREE.Group();
  const deck = mesh(new THREE.BoxGeometry(14, 1, 8), toon('#a8784a'), 0, 3, 0); g.add(deck);
  for (const x of [-5, 0, 5]) for (const z of [-4.2, 4.2]) {
    const wheel = mesh(new THREE.TorusGeometry(2.2, 0.3, 6, 16), toon('#6a4a30'), x, 2.2, z); g.add(wheel);
  }
  for (const [x, z] of [[-4, 0], [3, -1.5]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), toon('#efe0c8'), x, 8, z));
    const blades = new THREE.Group(); blades.position.set(x, 12.5, z + 0.9);
    for (let i = 0; i < 4; i++) { const b = mesh(new THREE.BoxGeometry(0.6, 4.5, 0.1), toon('#f4ece0'), 0, 2.2, 0); const p = new THREE.Group(); p.add(b); p.rotation.z = i * Math.PI / 2; blades.add(p); }
    g.add(blades); (g.userData.blades ??= []).push(blades);
  }
  for (let i = 0; i < 4; i++) {
    const mir = mesh(new THREE.BoxGeometry(2, 1.4, 0.1), toon('#d8f0ff', '#bfe8ff', 0.6), -6 + i * 3.6, 4.5, -3.2);
    mir.rotation.x = -0.6; g.add(mir);
  }
  g.add(mesh(new THREE.BoxGeometry(4, 3, 3.5), toon('#e0a070'), 1, 5, 1.8));
  return g;
}

export function arch(): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#d9a87a');
  g.add(mesh(new THREE.BoxGeometry(1.5, 8, 2), m, -4, 4, 0), mesh(new THREE.BoxGeometry(1.5, 8, 2), m, 4, 4, 0));
  g.add(mesh(new THREE.TorusGeometry(4, 0.9, 6, 16, Math.PI), m, 0, 8, 0));
  return g;
}

export function column(h = 7): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#f2ead8');
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, h, 10), m, 0, h / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), m, 0, h + 0.2, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), m, 0, 0.2, 0));
  return g;
}

export function temple(): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#f2ead8');
  g.add(mesh(new THREE.BoxGeometry(18, 1.2, 11), m, 0, 0.6, 0));
  for (let i = 0; i < 6; i++) for (const z of [-4.5, 4.5]) { const c = column(8); c.position.set(-7.5 + i * 3, 1.2, z); g.add(c); }
  g.add(mesh(new THREE.BoxGeometry(19, 1, 12), m, 0, 9.9, 0));
  const roof = mesh(new THREE.CylinderGeometry(0.01, 6.6, 19.5, 3, 1), toon('#c8704a'), 0, 12.2, 0);
  roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.45); g.add(roof);
  return g;
}

export function aqueduct(len = 9): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#e8d4b0');
  for (let i = 0; i < len; i++) {
    const a = arch(); a.scale.setScalar(0.9); a.position.x = i * 7.2; g.add(a);
    (a.children as THREE.Mesh[]).forEach(c => (c.material = m));
  }
  g.add(mesh(new THREE.BoxGeometry(len * 7.2, 1.2, 2.2), m, (len - 1) * 3.6, 11.2, 0));
  return g;
}

export function amphitheater(): THREE.Group {
  const g = new THREE.Group();
  const m = toon('#ece0c8');
  for (let i = 0; i < 5; i++) {
    const r = 6 + i * 2.2;
    const ring = mesh(new THREE.CylinderGeometry(r, r, 1, 28, 1, true, 0, Math.PI), m, 0, i * 1 + 0.5, 0);
    g.add(ring);
    const step = mesh(new THREE.RingGeometry(r - 2.2, r, 28, 1, 0, Math.PI), m, 0, i * 1 + 1, 0);
    step.rotation.x = -Math.PI / 2; g.add(step);
  }
  return g;
}

export function cityHouse(): THREE.Group {
  const g = new THREE.Group();
  const w = 3 + rand() * 3, d = 3 + rand() * 3, h = 2.5 + rand() * 3;
  g.add(mesh(new THREE.BoxGeometry(w, h, d), toon(rand() > 0.5 ? '#f4e8d0' : '#ead2a8'), 0, h / 2, 0));
  const roof = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.6, 4), toon('#c8704a'), 0, h + 0.8, 0);
  roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); g.add(roof);
  return g;
}

export function olive(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.35, 2, 5), toon('#6a5a4a'), 0, 1, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(1.5, 0), toon('#8a9a6a'), 0, 2.6, 0));
  return g;
}

export function stiltHouse(): THREE.Group {
  const g = new THREE.Group();
  const w = toon('#8a6a50');
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 5), w, x, 2.5, z));
  g.add(mesh(new THREE.BoxGeometry(4.2, 0.3, 4.2), w, 0, 4.6, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.4, 3.4), toon(rand() > 0.5 ? '#f4e0c8' : '#d8e8f0'), 0, 6, 0));
  g.add(mesh(new THREE.ConeGeometry(3.2, 1.8, 4), toon('#4a8aa0'), 0, 8.1, 0).rotateY(Math.PI / 4));
  return g;
}

export function lighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(2.2 - i * 0.25, 2.4 - i * 0.25, 3, 12), toon(i % 2 ? '#c4524a' : '#f4ece0'), 0, 1.5 + i * 3, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.8, 10), new THREE.MeshBasicMaterial({ color: '#fff4c8' }), 0, 16, 0));
  g.add(mesh(new THREE.ConeGeometry(1.8, 1.6, 10), toon('#3a3048'), 0, 17.7, 0));
  const l = new THREE.PointLight('#fff0c0', 60, 40, 1.4); l.position.y = 16; g.add(l);
  return g;
}

export function mangrove(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.2, 4), toon('#6a5040'), Math.cos(i) * 0.6, 0.8, Math.sin(i) * 0.6);
    r.rotation.z = Math.cos(i) * 0.4; r.rotation.x = Math.sin(i) * 0.4; g.add(r);
  }
  g.add(mesh(new THREE.IcosahedronGeometry(1.6, 0), toon('#4a8a50'), 0, 2.8, 0));
  return g;
}

export function coral(): THREE.Group {
  const g = new THREE.Group();
  const c = ['#ff9a8a', '#ffb06a', '#e88ac8', '#ffd08a'][Math.floor(rand() * 4)];
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.25, 1 + rand(), 5), toon(c, c, 0.3), (rand() - 0.5), 0.5, (rand() - 0.5)));
  return g;
}
