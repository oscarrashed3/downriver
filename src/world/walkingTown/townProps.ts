// World 3, the Walking Town: the things the three steps are made of. The sharp stone in Amble's front foot and
// Tamsin's rope and pulley; the windmill's lost sail; the wooden water channel from the rain pools to Amble's mouth
// (troughs on trestles, strapped down the neck and along the jaw), its water, and the sluice; the curtains of vine
// over Amble's eyes; and the plank walk out along the neck onto the head between the antlers.
// All built in code, in Mossrest's style (the same kit, palette and materials).
import * as THREE from 'three';
import { Kit, T, boxM, WOOD_TILE } from '../skyIsles/sailtownKit';
import { PAL, pk, slab, rope, taperTube, vine, type R } from './mossrestKit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A frame whose z runs from a to b, x across it (level), y up (creature space: +y is up). */
export function along(a: THREE.Vector3, b: THREE.Vector3) {
  const z = b.clone().sub(a).normalize();
  const x = new THREE.Vector3().crossVectors(V(0, 1, 0), z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(a);
}

// ---------------------------------------------------------------------------------------------- the stone

/** The stone: a big, sharp, grey shard (about 0.8 m), flecked with moss where it has sat in the toes. */
export function stoneProp(r: R) {
  const k = new Kit();
  const g = new THREE.IcosahedronGeometry(0.42, 0);
  const pa = g.attributes.position as THREE.BufferAttribute;
  // stretched into a wedge and roughed up (the same jitter for shared corners, so it stays closed)
  const seen = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pa.count; i++) {
    const key = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
    let j = seen.get(key);
    if (!j) { j = V((r() - 0.5) * 0.14, (r() - 0.5) * 0.14, (r() - 0.5) * 0.14); seen.set(key, j); }
    pa.setXYZ(i, pa.getX(i) * 0.85 + j.x, pa.getY(i) * 1.5 + j.y + (pa.getY(i) > 0.3 ? 0.18 : 0), pa.getZ(i) * 0.7 + j.z);
  }
  g.computeVertexNormals();
  k.add(g, 'rough', '#8e8a82');
  for (let q = 0; q < 3; q++) k.add(new THREE.IcosahedronGeometry(0.09 + r() * 0.05, 0), 'plain', pk(r, PAL.leaf), T((r() - 0.5) * 0.5, -0.2 + r() * 0.3, 0.25));
  const grp = k.build(new THREE.Group(), { outline: true });
  grp.name = 'ambleStone';
  return grp;
}

/** Tamsin's pulley: a stout A-frame lashed to the walk, a wheel at the top, a coil of rope at its feet. Local: the
 * base at y = 0, the wheel's groove at `wheel`, the rope running off towards +x. */
export function pulleyProp(r: R) {
  const k = new Kit();
  const H = 2.6;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) k.add(taperTube([V(sx * 0.9, 0, sz * 0.45), V(0, H, sz * 0.12)], 0.09, 0.07, 6, 1), 'wood', pk(r, PAL.timberDark));
  }
  k.add(taperTube([V(0, H, -0.3), V(0, H, 0.3)], 0.08, 0.08, 6, 1), 'wood', pk(r, PAL.timber));
  k.add(taperTube([V(-0.55, 0.9, 0), V(0.55, 0.9, 0)], 0.06, 0.06, 5, 1), 'wood', pk(r, PAL.timber));
  // the wheel (on the axle between the two A's)
  k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14).rotateX(Math.PI / 2), 'wood', pk(r, PAL.timber), T(0, H - 0.36, 0));
  k.add(new THREE.TorusGeometry(0.32, 0.05, 5, 16), 'plain', '#b39668', T(0, H - 0.36, 0));
  for (const sz of [-1, 1]) k.add(boxM(0.08, 0.62, 0.04, WOOD_TILE), 'plain', PAL.iron, T(0, H - 0.2, sz * 0.09));
  // ropes lashing the feet down, and a coil
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(new THREE.TorusGeometry(0.12, 0.03, 4, 10), 'plain', '#b39668', T(sx * 0.9, 0.12, sz * 0.45, Math.PI / 2));
  for (let q = 0; q < 4; q++) k.add(new THREE.TorusGeometry(0.34 - q * 0.02, 0.045, 5, 16), 'plain', '#c2a476', T(0.4, 0.05 + q * 0.07, 0.75, Math.PI / 2));
  const grp = k.build(new THREE.Group(), { outline: true });
  grp.name = 'tamsinPulley';
  return { group: grp, wheel: V(0.0, H - 0.36 + 0.34, 0) };
}

/** A taut rope between two world points (one stretched cylinder; `set` each frame). */
export class RopeSpan {
  mesh: THREE.Mesh;
  private static mat = new THREE.MeshToonMaterial({ color: '#c2a476' });
  constructor(r = 0.045) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6, 1, true).translate(0, 0.5, 0), RopeSpan.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.castShadow = true;
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const d = b.clone().sub(a), L = d.length();
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.divideScalar(Math.max(L, 1e-4)));
    this.mesh.scale.set(1, Math.max(L, 1e-3), 1);
    this.mesh.visible = true;
  }
}

// ---------------------------------------------------------------------------------------------- the sail

/** One windmill arm, as the old mill's three are built (stock, lattice, linen): its root at the hub, out along +y.
 * Scale it with the mill. */
export function sailArm(r: R) {
  const k = new Kit();
  const L = 6.2, wSail = 1.45;
  k.push(T(0, 0, 0.15));
  k.add(slab(0.2, L, 0.18), 'wood', pk(r, PAL.timberPale), T(0, 0.3, 0));
  k.add(slab(0.08, L - 1.0, 0.08), 'wood', pk(r, PAL.timber), T(wSail, 1.2, 0.05));
  k.add(slab(0.08, L - 1.0, 0.08), 'wood', pk(r, PAL.timber), T(-0.3, 1.2, 0.05));
  for (let b = 0; b <= 10; b++) k.add(boxM(wSail + 0.35, 0.06, 0.06, WOOD_TILE), 'wood', pk(r, PAL.timber), T(wSail / 2 - 0.15, 1.2 + b * (L - 1.0) / 10, 0.07));
  const sh = new THREE.Shape();
  sh.moveTo(-0.25, 0); sh.lineTo(wSail - 0.05, 0); sh.lineTo(wSail - 0.05, L - 1.0); sh.lineTo(-0.25, L - 1.0);
  k.add(new THREE.ShapeGeometry(sh), 'canvas', '#f3ead6', T(0, 1.2, 0.1));
  // a scrap of bean-row string still caught round it from the garden
  k.add(new THREE.TorusGeometry(0.22, 0.02, 4, 10), 'plain', '#9c8a5e', T(0.5, 3.1, 0.12, 0.3, 0.2, 0));
  k.pop();
  const grp = k.build(new THREE.Group(), { outline: true });
  grp.name = 'lostSail';
  return grp;
}

// ---------------------------------------------------------------------------------------------- the channel

/** One length of the water channel from a to b (kit space): a planked U-trough with rope straps round it. */
export function trough(k: Kit, a: THREE.Vector3, b: THREE.Vector3, r: R, opts: { straps?: boolean } = {}) {
  const L = a.distanceTo(b);
  if (L < 0.05) return;
  const M = along(a, b);
  k.push(M);
  const c = pk(r, PAL.timber), d = pk(r, PAL.timberDark);
  const ext = 0.04; // a little overlap at each end so joints look closed
  k.add(boxM(0.62, 0.07, L + ext, WOOD_TILE), 'wood', c, T(0, 0, L / 2));
  for (const sx of [-1, 1]) k.add(boxM(0.07, 0.3, L + ext, WOOD_TILE), 'wood', new THREE.Color(c).multiplyScalar(0.93), T(sx * 0.31, 0.15, L / 2));
  // battens across the top every metre or so, and straps when it rides the neck
  const n = Math.max(1, Math.round(L / 1.2));
  for (let q = 0; q <= n; q++) {
    const z = (q / n) * L;
    k.add(boxM(0.78, 0.06, 0.09, WOOD_TILE), 'wood', d, T(0, 0.31, z));
    if (opts.straps) k.add(boxM(0.7, 0.04, 0.1, WOOD_TILE), 'plain', '#b39668', T(0, -0.06, z));
  }
  k.pop();
}

/** The trestle under a channel joint at p, down to the ground at y0 (kit space). */
export function trestle(k: Kit, p: THREE.Vector3, dir: THREE.Vector3, y0: number, r: R) {
  const h = p.y - y0;
  if (h < 0.12) return;
  const x = new THREE.Vector3().crossVectors(V(0, 1, 0), dir).normalize();
  for (const s of [-1, 1]) {
    const top = p.clone().addScaledVector(x, s * 0.36).add(V(0, -0.02, 0));
    k.add(taperTube([top, top.clone().addScaledVector(x, s * 0.12).setY(y0 - 0.05)], 0.06, 0.07, 5, 1), 'wood', pk(r, PAL.timberDark));
  }
  if (h > 0.5) k.add(taperTube([p.clone().addScaledVector(x, -0.42).setY(y0 + h * 0.45), p.clone().addScaledVector(x, 0.42).setY(y0 + h * 0.45)], 0.04, 0.04, 4, 1), 'wood', pk(r, PAL.timber));
}

/** A loose channel piece (one gap's length), local: from z = 0 to z = L. */
export function pieceProp(L: number, r: R) {
  const k = new Kit();
  trough(k, V(0, 0, 0), V(0, 0, L), r);
  return k.build(new THREE.Group(), { outline: true });
}

/** The water's own material: clear running blue with pale streaks travelling along the channel (uT scrolls). */
export function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; varying vec2 vUv; uniform float uT;
      void main(){
        float s = sin(dot(vW, vec3(1.7, 0.9, 1.3)) * 2.2 - uT * 6.0) * 0.5 + 0.5;
        float s2 = sin(dot(vW, vec3(-1.1, 1.3, 2.1)) * 3.1 - uT * 8.0) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.36, 0.66, 0.82), vec3(0.86, 0.95, 1.0), smoothstep(0.75, 1.0, s * s2 + 0.25 * s));
        gl_FragColor = vec4(c, 0.86);
      }`,
  });
}

/** The sluice: a board gate between two posts with a little wheel to wind it up (local: across x, the water
 * running towards +z). `gate` lifts. */
export function sluiceProp(r: R) {
  const k = new Kit();
  for (const sx of [-1, 1]) k.add(slab(0.16, 1.3, 0.16, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(sx * 0.48, -0.1, 0));
  k.add(boxM(1.16, 0.12, 0.18, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(0, 1.22, 0));
  k.add(new THREE.TorusGeometry(0.2, 0.035, 5, 14), 'plain', PAL.iron, T(0, 1.5, 0.1));
  for (let q = 0; q < 4; q++) k.add(boxM(0.38, 0.03, 0.03, WOOD_TILE), 'plain', PAL.iron, T(0, 1.5, 0.1, 0, 0, q * Math.PI / 4));
  const grp = k.build(new THREE.Group(), { outline: true });
  const gk = new Kit();
  gk.add(boxM(0.82, 0.5, 0.07, WOOD_TILE), 'wood', pk(r, PAL.timber), T(0, 0.22, 0));
  gk.add(boxM(0.05, 0.75, 0.05, WOOD_TILE), 'plain', PAL.iron, T(0, 0.75, 0));
  const gate = gk.build(new THREE.Group(), { outline: true });
  grp.add(gate);
  return { group: grp, gate };
}

// ---------------------------------------------------------------------------------------------- the vines

/**
 * A clump of vines (kit space): strands from `anchors` hanging down along `path(anchor, t)` (t 0 at the anchor, 1 at
 * the bottom), each a dark stem thick with leaves.
 */
export function vineClump(r: R, anchors: THREE.Vector3[], path: (a: THREE.Vector3, t: number, i: number) => THREE.Vector3, out: THREE.Vector3, size = 0.42) {
  const k = new Kit();
  anchors.forEach((a, i) => {
    const pts: THREE.Vector3[] = [];
    for (let q = 0; q <= 6; q++) pts.push(path(a, q / 6, i));
    k.add(taperTube(pts, 0.07, 0.035, 5, 18), 'plain', '#46602f');
    vine(k, pts, out, r, size);
  });
  return k.build(new THREE.Group(), { outline: false });
}

// ---------------------------------------------------------------------------------------------- the walk to the head

/** A run of plank walk from a to b (kit space), `w` wide, with posts and a rope rail along both sides. */
export function plankRun(k: Kit, a: THREE.Vector3, b: THREE.Vector3, w: number, r: R, opts: { startPost?: boolean; endPost?: boolean } = {}) {
  const L = a.distanceTo(b);
  if (L < 0.05) return;
  k.push(along(a, b));
  const n = Math.max(1, Math.ceil(L / 0.3));
  for (let q = 0; q < n; q++) k.add(boxM(w, 0.07, 0.27, WOOD_TILE), 'wood', new THREE.Color(pk(r, PAL.timber)).multiplyScalar(0.88 + r() * 0.22), T(0, 0, (q + 0.5) * L / n));
  for (const sx of [-1, 1]) {
    k.add(boxM(0.13, 0.16, L + 0.1, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(sx * (w / 2 - 0.08), -0.11, L / 2));
    const m = Math.max(1, Math.round(L / 1.3));
    for (let q = opts.startPost === false ? 1 : 0; q <= m - (opts.endPost === false ? 1 : 0); q++) k.add(slab(0.1, 1.0, 0.1, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(sx * (w / 2 - 0.05), 0, (q / m) * L));
    rope(k, [V(sx * (w / 2 - 0.05), 0.95, 0), V(sx * (w / 2 - 0.05), 0.86, L / 2), V(sx * (w / 2 - 0.05), 0.95, L)], 0.035);
    rope(k, [V(sx * (w / 2 - 0.05), 0.5, 0), V(sx * (w / 2 - 0.05), 0.44, L / 2), V(sx * (w / 2 - 0.05), 0.5, L)], 0.03);
  }
  k.pop();
}

/** A short, steep stair from a up to b (level treads on two raking stringers, rope rails): where the walk climbs
 * from the lookout onto the base of the neck. */
export function stairRun(k: Kit, a: THREE.Vector3, b: THREE.Vector3, w: number, r: R) {
  const L = a.distanceTo(b);
  if (L < 0.05) return;
  const d = b.clone().sub(a), run = Math.hypot(d.x, d.z), yaw = Math.atan2(d.x, d.z);
  const n = Math.max(2, Math.round(Math.abs(d.y) / 0.21));
  for (let q = 0; q < n; q++) {
    const c = a.clone().lerp(b, (q + 0.5) / n);
    k.add(boxM(w, 0.07, run / n + 0.1, WOOD_TILE), 'wood', new THREE.Color(pk(r, PAL.timber)).multiplyScalar(0.88 + r() * 0.22), new THREE.Matrix4().makeRotationY(yaw).setPosition(c.x, c.y - 0.03, c.z));
  }
  k.push(along(a, b));
  for (const sx of [-1, 1]) k.add(boxM(0.13, 0.3, L + 0.15, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(sx * (w / 2 - 0.08), -0.12, L / 2));
  k.pop();
  // upright posts at both ends, and the rope rails between them
  const x = new THREE.Vector3(d.z, 0, -d.x).normalize().multiplyScalar(-1);
  for (const sx of [-1, 1]) {
    const pa = a.clone().addScaledVector(x, sx * (w / 2 - 0.05)), pb = b.clone().addScaledVector(x, sx * (w / 2 - 0.05));
    for (const p of [pa, pb]) k.add(slab(0.1, 1.0, 0.1, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(p.x, p.y, p.z));
    rope(k, [pa.clone().add(V(0, 0.95, 0)), pa.clone().lerp(pb, 0.5).add(V(0, 0.88, 0)), pb.clone().add(V(0, 0.95, 0))], 0.035);
  }
}
