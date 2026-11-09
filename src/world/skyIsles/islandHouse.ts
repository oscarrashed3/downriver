import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, softRamp } from '../../render/paint';
import { gradeFoliage } from './islandMaterials';

// A Sailtown cottage for the island tops: limestone-plinth, cream walls, a steep tiled roof with a deep overhang, a
// chimney, a door and two shuttered windows. One shared, baked, vertex-coloured geometry per roof colour and one
// material for all of them, so a house costs one draw (and its ink comes from the screen-space finish pass, like the
// rest of the island). Size: about 4.6 x 4 m on the ground, 6 m to the ridge (Nilo is 1.2 m).

const cache = new Map<string, THREE.BufferGeometry>();
let mat: THREE.MeshToonMaterial | null = null;

/** The painted toon material all cottages share (vertex colours, the island grading, so it takes the light). */
function houseMat(): THREE.MeshToonMaterial {
  if (!mat) {
    mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.5, rim: 0.7 });
    gradeFoliage(mat, 'isleHouse', 0.85);
  }
  return mat;
}

/** A box with every vertex one colour (non-indexed, so it merges with the others). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return colour(g, col);
}
function colour(g: THREE.BufferGeometry, col: string, shadeY = 0): THREE.BufferGeometry {
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    // a soft darkening toward the foot of the walls (dirt and grass splash), so the house sits in the meadow
    const k = shadeY ? 0.86 + 0.14 * Math.min(1, Math.max(0, (p.getY(i) - 0.5) / shadeY)) : 1;
    a.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** The cottage geometry for a roof colour (cached and shared). */
function cottageGeometry(roof: string): THREE.BufferGeometry {
  const have = cache.get(roof);
  if (have) return have;
  const W = 4.2, D = 3.6, H = 2.7;
  const parts: THREE.BufferGeometry[] = [];
  // plinth of the island's own stone, walls, corner posts and a band of timber
  parts.push(box(W + 0.35, 0.6, D + 0.35, 0, 0.3, 0, '#d9c7a2'));
  const walls = new THREE.BoxGeometry(W, H, D).toNonIndexed(); walls.deleteAttribute('uv'); walls.translate(0, 0.6 + H / 2, 0);
  parts.push(colour(walls, '#f4ead6', 1.2));
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) parts.push(box(0.22, H, 0.22, x, 0.6 + H / 2, z, '#8a6446'));
  parts.push(box(W + 0.08, 0.16, D + 0.08, 0, 0.6 + H - 0.08, 0, '#8a6446'));
  // gables: triangular prisms closing the wall under the roof
  const rh = 2.5, rw = W / 2 + 0.75, len = D + 1.2;
  const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(0, rh - 0.2); gable.lineTo(W / 2, 0); gable.closePath();
  const gg = new THREE.ExtrudeGeometry(gable, { depth: D, bevelEnabled: false }).toNonIndexed();
  gg.deleteAttribute('uv'); gg.translate(0, 0.6 + H, -D / 2);
  parts.push(colour(gg, '#f0e4cc'));
  // the roof: two thick tiled slabs with a deep overhang, the ridge a touch darker
  const slope = Math.atan2(rh, rw);
  const slab = Math.hypot(rw, rh) + 0.1;
  for (const sx of [-1, 1]) {
    const s = new THREE.BoxGeometry(slab, 0.26, len).toNonIndexed(); s.deleteAttribute('uv');
    s.rotateZ(-sx * slope);
    s.translate(sx * rw / 2, 0.6 + H + rh / 2 + 0.08, 0);
    parts.push(colour(s, roof));
  }
  parts.push(box(0.3, 0.3, len + 0.05, 0, 0.6 + H + rh + 0.05, 0, new THREE.Color(roof).multiplyScalar(0.78).getStyle()));
  // chimney
  parts.push(box(0.6, 1.9, 0.6, W * 0.24, 0.6 + H + rh * 0.55 + 0.6, -D * 0.18, '#d9c7a2'));
  parts.push(box(0.75, 0.18, 0.75, W * 0.24, 0.6 + H + rh * 0.55 + 1.6, -D * 0.18, '#a8967a'));
  // the front: a door with a step, two windows with shutters, flower boxes
  const fz = D / 2 + 0.04;
  parts.push(box(0.95, 1.75, 0.08, 0, 0.6 + 0.88, fz, '#4f7aa6'));
  parts.push(box(1.3, 0.2, 0.6, 0, 0.5, fz + 0.2, '#cdb994'));
  for (const sx of [-1, 1]) {
    const x = sx * W * 0.3;
    parts.push(box(0.75, 0.8, 0.06, x, 0.6 + 1.55, fz, '#3e5568'));
    parts.push(box(0.3, 0.86, 0.07, x - 0.55, 0.6 + 1.55, fz + 0.01, '#5d86ae'));
    parts.push(box(0.3, 0.86, 0.07, x + 0.55, 0.6 + 1.55, fz + 0.01, '#5d86ae'));
    parts.push(box(0.9, 0.22, 0.24, x, 0.6 + 1.08, fz + 0.1, '#8a6446'));
    parts.push(box(0.8, 0.14, 0.2, x, 0.6 + 1.24, fz + 0.12, sx < 0 ? '#f2a0bc' : '#ffd66a'));
  }
  // a window on each side wall
  for (const sx of [-1, 1]) parts.push(box(0.06, 0.8, 0.75, sx * (W / 2 + 0.03), 0.6 + 1.55, 0, '#3e5568'));
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  cache.set(roof, g);
  return g;
}

/** One cottage: a single mesh (its origin on the ground at the middle of the plinth, the door facing +z). */
export function islandCottage(roof = '#c0563a'): THREE.Mesh {
  const m = new THREE.Mesh(cottageGeometry(roof), houseMat());
  m.castShadow = true; m.receiveShadow = true;
  m.name = 'cottage';
  return m;
}
