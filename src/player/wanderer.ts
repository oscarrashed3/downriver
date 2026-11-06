import * as THREE from 'three';
import { toon } from '../world/props';
import type { Person, PersonLook } from './person';
import { cap, sph, mk, mkFlat, toonFlat } from './person';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry as RoundedBox } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Nilo, built from Oscar's turnaround sheet: a tall pointed paper-like hood, glowing amber eyes under messy bangs,
 * a thick navy scarf, an oversized tan coat to the top of the thighs with wide cuffs, a strap across the chest
 * with the brass lantern, a satchel at the back of the left hip with the paper boat peeking out,
 * baggy trousers and tall strapped boots. Chunky figurine proportions, about four and a half heads tall.
 *
 * It fills the same skeleton as every other Person (hips, torso, legs, arms, neck, head),
 * so all the walking, sitting, talking and waving animations still work.
 *
 * Facing +z. Nilo's right side is -x.
 */
const C = {
  coat: '#c49a6c', cuff: '#b48a5c', hoodIn: '#2a1c22', scarf: '#2e3456', shirt: '#2a3048',
  trousers: '#3e2a24', boots: '#7a4a2c', bootDark: '#5a3420', brass: '#c8a060', strap: '#6a3a24',
  satchel: '#8a5a34', face: '#7a5038', hand: '#946044', hair: '#2e1e18', glow: '#ffc24a',
};

/** Keep only the triangles for which keep(centroid) is true. Works on non-indexed geometry. */
function cut(g: THREE.BufferGeometry, keep: (c: THREE.Vector3) => boolean) {
  // Lathe triangles come in pairs, one pair per quad: judge the whole quad so the edge of a cut is clean.
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position');
  const out: number[] = [];
  const v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 6) {
    m.set(0, 0, 0);
    const n = Math.min(6, pos.count - i);
    for (let k = 0; k < n; k++) m.add(v.fromBufferAttribute(pos, i + k));
    m.multiplyScalar(1 / n);
    if (keep(m)) for (let k = 0; k < n; k++) { v.fromBufferAttribute(pos, i + k); out.push(v.x, v.y, v.z); }
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.computeVertexNormals();
  return ng;
}

/** Bend every vertex with f(v), in place. */
function warp(g: THREE.BufferGeometry, f: (v: THREE.Vector3) => void) {
  const pos = g.getAttribute('position'); const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); f(v); pos.setXYZ(i, v.x, v.y, v.z); }
  pos.needsUpdate = true; g.computeVertexNormals();
  return g;
}

const ang = (v: THREE.Vector3) => Math.atan2(v.x, v.z); // 0 = straight ahead, ±π = behind

/** Weld the vertices and give soft normals, so cloth reads as soft folds, not hard facets. */
function soften(g: THREE.BufferGeometry) {
  const src = new THREE.BufferGeometry(); src.setAttribute('position', g.getAttribute('position'));
  if (g.index) src.setIndex(g.index);
  const m = mergeVertices(src, 1e-4); m.computeVertexNormals();
  return m;
}
/** A soft, double-sided cloth mesh. */
function mkSoft(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(soften(g), toonFlat(color)); m.position.set(x, y, z); m.castShadow = true; return m;
}
/** Resample a profile into many rows with a smooth curve, so lathes bend instead of kinking. */
function fine(prof: THREE.Vector2[], n: number) {
  const c = new THREE.SplineCurve(prof); return c.getPoints(n);
}

export function buildWanderer(P: Person, look: PersonLook) {
  P.hipY = 0.7;
  P.hips.position.y = P.hipY;
  // sits on the ground with knees up, arms resting on them
  P.sitHip = 0.2; P.sitThigh = -2.0; P.sitKnee = 1.65; P.sitArm = -0.55;

  // ---- Legs: baggy trousers bunching over tall strapped boots ----
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(0.1 * s, -0.02, 0);
    const th = mk(cap(0.105, 0.17), C.trousers, 0, -0.17, 0); th.scale.set(1, 1, 1.05); thigh.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.35;
    knee.add(mk(cap(0.095, 0.08), C.trousers, 0, -0.04, 0));
    // the trousers bunch over the boot tops
    const bunch = mkSoft(new THREE.SphereGeometry(0.11, 14, 8), C.trousers, 0, -0.09, 0); bunch.scale.set(1, 0.55, 1); knee.add(bunch);
    // boot shaft, cuff, foot and sole
    knee.add(mkSoft(new THREE.CylinderGeometry(0.098, 0.104, 0.17, 14), C.boots, 0, -0.2, 0));
    const cuffB = mkSoft(new THREE.TorusGeometry(0.1, 0.018, 6, 16), C.boots, 0, -0.12, 0); cuffB.rotation.x = Math.PI / 2; knee.add(cuffB);
    // the foot hangs from an ankle joint, so it can flex, roll heel to toe and lie flat on a slope
    const ankle = new THREE.Group(); ankle.position.set(0, -0.27, 0); knee.add(ankle); P.ankles.push(ankle);
    const foot = mkSoft(new THREE.SphereGeometry(0.11, 16, 10), C.boots, 0, -0.02, 0.06); foot.scale.set(1.08, 0.66, 1.6); ankle.add(foot);
    const toe = mkSoft(new THREE.SphereGeometry(0.085, 14, 8), C.boots, 0, -0.025, 0.18); toe.scale.set(1.15, 0.72, 0.9); ankle.add(toe);
    const sole = mkSoft(new THREE.CylinderGeometry(0.105, 0.105, 0.035, 16), C.bootDark, 0, -0.065, 0.06); sole.scale.set(1, 1, 1.75); ankle.add(sole);
    for (const y of [-0.17, -0.245]) {
      const strap = mkSoft(new THREE.TorusGeometry(0.103, 0.014, 5, 18), C.bootDark, 0, y, 0); strap.rotation.x = Math.PI / 2; knee.add(strap);
      const buckle = mk(new THREE.BoxGeometry(0.035, 0.035, 0.012), C.brass, 0.07 * s, y, 0.075); buckle.rotation.y = 0.75 * s; buckle.userData.noOutline = true; knee.add(buckle);
    }
    thigh.add(knee);
    P.hips.add(thigh);
    P.legs.push({ thigh, knee });
  }

  // ---- Torso: navy undershirt ----
  P.hips.add(P.torso);
  const chest = mk(cap(0.17, 0.26), C.shirt, 0, 0.36, 0); chest.scale.set(1, 1, 0.72); P.torso.add(chest);
  const pelvis = mk(sph(0.15, 12, 8), C.trousers, 0, 0.04, 0); pelvis.scale.set(1.1, 0.7, 0.72); P.torso.add(pelvis);

  // ---- The coat: upper body, open at the front, faceted like folded paper ----
  const upperProf = [
    new THREE.Vector2(0.13, 0.67), new THREE.Vector2(0.22, 0.64), new THREE.Vector2(0.275, 0.57), new THREE.Vector2(0.27, 0.4),
    new THREE.Vector2(0.26, 0.27),
  ];
  const upper = soften(cut(new THREE.LatheGeometry(fine(upperProf, 10), 28), v => Math.abs(ang(v)) > 0.25));
  const coatUp = new THREE.Mesh(upper, toonFlat(C.coat)); coatUp.scale.set(1, 1, 0.8); coatUp.castShadow = true; P.torso.add(coatUp);
  // the skirt hangs from the waist on its own pivot, so it can swing and fold when Nilo sits
  const skirtPivot = new THREE.Group(); skirtPivot.position.y = 0.28; P.torso.add(skirtPivot);
  const skirtProf = [
    new THREE.Vector2(0.26, 0.0), new THREE.Vector2(0.29, -0.13), new THREE.Vector2(0.345, -0.29), new THREE.Vector2(0.4, -0.45),
  ];
  const skirtG = warp(new THREE.LatheGeometry(fine(skirtProf, 10), 28), v => {
    // the back hangs lower than the front, and the front corners flare a little
    const a = ang(v), k = Math.max(0, -v.y / 0.45);
    v.y -= (1 - Math.cos(a)) * 0.5 * 0.07 * k;
    if (Math.abs(a) < 0.9) v.x *= 1 + 0.08 * k;
  });
  // open at the front, a slit at the back from the hem up; cut into four panels, each hinged at the waist,
  // so the hem can swing, flare and trail on its own
  const ranges: [number, number][] = [[0.25, Math.PI / 2], [Math.PI / 2, Math.PI + 0.01], [-Math.PI - 0.01, -Math.PI / 2], [-Math.PI / 2, -0.25]];
  for (const [a0, a1] of ranges) {
    const am = (a0 + a1) / 2;
    const hinge = new THREE.Vector3(Math.sin(am) * 0.26, 0, Math.cos(am) * 0.26 * 0.82);
    const pivot = new THREE.Group(); pivot.position.copy(hinge); skirtPivot.add(pivot);
    const g = soften(cut(skirtG, v => { const a = ang(v); return Math.abs(a) > 0.25 && a >= a0 && a < a1; }));
    const panel = new THREE.Mesh(g, toonFlat(C.coat)); panel.scale.set(1, 1, 0.82); panel.castShadow = true;
    panel.position.copy(hinge).multiplyScalar(-1); pivot.add(panel);
    P.coatPanels.push({ pivot, tangent: new THREE.Vector3(Math.cos(am), 0, -Math.sin(am)) });
  }
  // the back slit: a dark fold line from the hem up
  const slit = mk(new THREE.BoxGeometry(0.012, 0.18, 0.01), '#7a5a3a', 0, -0.43, -0.345); slit.userData.noOutline = true; skirtPivot.add(slit);
  P.coat = skirtPivot;

  // ---- Arms: big sleeves with wide turned-back cuffs ----
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.235 * s, 0.56, 0);
    const up = mkSoft(new THREE.CylinderGeometry(0.09, 0.1, 0.24, 16), C.coat, 0, -0.12, 0); sh.add(up);
    const shoulder = mkSoft(new THREE.SphereGeometry(0.092, 16, 10), C.coat, 0, -0.01, 0); sh.add(shoulder);
    const el = new THREE.Group(); el.position.y = -0.25;
    el.add(mkSoft(new THREE.CylinderGeometry(0.1, 0.125, 0.2, 16), C.coat, 0, -0.08, 0));
    el.add(mkSoft(new THREE.SphereGeometry(0.1, 14, 8), C.coat, 0, 0.0, 0));
    const cuff = mkSoft(new THREE.TorusGeometry(0.118, 0.032, 8, 20), C.cuff, 0, -0.185, 0); cuff.rotation.x = Math.PI / 2; el.add(cuff);
    el.add(mk(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), C.shirt, 0, -0.22, 0));
    // a soft hand: palm, four fingers curled together, and a thumb
    // the hand hangs from a wrist joint just inside the cuff
    const wrist = new THREE.Group(); wrist.position.set(0, -0.235, 0); el.add(wrist); P.wrists.push(wrist);
    const hand = mk(sph(0.052, 14, 10), C.hand, 0, -0.02, 0.005); hand.scale.set(0.95, 1.05, 0.7); wrist.add(hand);
    const fingers = mk(cap(0.026, 0.05), C.hand, 0, -0.07, 0.012); fingers.rotation.z = Math.PI / 2; fingers.scale.set(1, 1.15, 0.95);
    fingers.rotation.x = 0.25; wrist.add(fingers);
    const thumb = mk(cap(0.017, 0.035), C.hand, 0.043 * -s, -0.02, 0.03); thumb.rotation.set(0.5, 0, 0.5 * s); wrist.add(thumb);
    sh.add(el);
    sh.rotation.z = 0.1 * s;
    P.torso.add(sh);
    P.arms.push({ sh, el, hand });
  }

  // ---- Neck and head ----
  P.neck.position.y = 0.64;
  P.torso.add(P.neck);
  P.neck.add(mk(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), C.face, 0, 0.02, 0));
  P.head.position.y = 0.06;
  P.neck.add(P.head);
  const skull = mk(sph(0.155, 20, 14), C.face, 0, 0.17, 0); skull.scale.set(1, 1.04, 1); P.head.add(skull);
  const jaw = mk(sph(0.115, 12, 8), C.face, 0, 0.1, 0.03); jaw.scale.set(1.08, 0.82, 1); P.head.add(jaw);
  
  // glowing eyes: narrow amber almonds, a little tilted, with a soft halo
  const glowCol = new THREE.Color(look.glowEyes ?? C.glow).multiplyScalar(2.4);
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(0.058 * s, 0.175, 0.142); eye.rotation.set(0, 0.32 * s, -0.12 * s);
    const glow = new THREE.Mesh(sph(0.026, 10, 8), new THREE.MeshBasicMaterial({ color: glowCol })); glow.scale.set(1.15, 0.45, 0.35); glow.userData.noOutline = true;
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), new THREE.MeshBasicMaterial({ color: '#ffb840', transparent: true, opacity: 0.22, depthWrite: false })); halo.position.z = 0.004; halo.userData.noOutline = true;
    void halo;
    eye.add(glow);
    P.head.add(eye); P.eyes.push(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), toon(C.hair)); brow.visible = false; P.head.add(brow); P.brows.push(brow);
  }
  // a small, quiet mouth (only the flat one shows; he never speaks aloud)
  P.mouthFlat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), toon('#3a2224')); P.mouthFlat.position.set(0, 0.098, 0.142); P.mouthFlat.userData.noOutline = true;
  P.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 10, Math.PI), toon('#3a2224')); P.mouthSmile.position.set(0, 0.106, 0.14); P.mouthSmile.rotation.z = Math.PI; P.mouthSmile.userData.noOutline = true;
  P.mouthO = new THREE.Mesh(sph(0.012, 8, 6), toon('#3a2224')); P.mouthO.position.set(0, 0.095, 0.142); P.mouthO.scale.set(1, 1.3, 0.4); P.mouthO.userData.noOutline = true;
  P.head.add(P.mouthFlat, P.mouthSmile, P.mouthO);

  // messy bangs: dark spikes falling over the eyes, a few poking out at the sides of the hood
  P.head.add(P.hair);
  const spike = (x: number, y: number, z: number, len: number, rx: number, rz: number, w = 0.04) => {
    const m = mkSoft(new THREE.ConeGeometry(w, len, 7), C.hair, x, y, z); m.rotation.set(rx, 0, rz); P.hair.add(m); P.hairClumps.push(m); return m;
  };
  const cap1 = mkSoft(new THREE.SphereGeometry(0.162, 18, 12), C.hair, 0, 0.21, -0.01); cap1.scale.set(1.04, 0.86, 1.04); P.hair.add(cap1);
  const fr: [number, number, number][] = [[-0.1, 0.5, 0.12], [-0.055, 0.15, 0.15], [-0.01, -0.2, 0.15], [0.04, 0.25, 0.155], [0.085, -0.15, 0.14], [0.115, 0.45, 0.11]];
  fr.forEach(([x, tilt, len], i) => spike(x, 0.24 - (i % 2) * 0.012, 0.125, len, Math.PI - 0.45, tilt + (x > 0 ? -0.15 : 0.15), 0.045));
  for (const s of [-1, 1]) { spike(0.15 * s, 0.17, 0.06, 0.12, Math.PI - 0.2, -0.5 * s, 0.035); spike(0.145 * s, 0.24, 0.0, 0.1, Math.PI - 0.1, -0.9 * s, 0.03); }

  buildHood(P, look);
  buildScarf(P, look);
  buildStrapAndSatchel(P, look);

  // ---- Split the upper body from the hips at the waist ----
  // Everything above the waist moves to a chest joint (attach keeps each piece exactly where it is),
  // so the shoulders can turn against the hips. The pelvis, coat skirt, satchel and right hip stay with the hips.
  P.root.updateMatrixWorld(true);
  const chestJ = new THREE.Group(); chestJ.position.set(0, 0.3, 0); P.torso.add(chestJ); P.chest = chestJ;
  chestJ.updateMatrixWorld(true);
  const stay = new Set<THREE.Object3D>([pelvis, skirtPivot, P.satchel!, P.hipR, chestJ]);
  for (const o of [...P.torso.children]) if (!stay.has(o)) chestJ.attach(o);
  // the satchel hangs from the end of the strap at the hip
  const sp = new THREE.Group(); sp.position.set(0.25, 0.13, -0.2); P.torso.add(sp); sp.updateMatrixWorld(true);
  sp.attach(P.satchel!); P.satchelPivot = sp;
}

/** The tall, pointed hood: a soft shell, closed above the brow, with an arched face opening, a folded rim and a dark inside. */
function buildHood(P: Person, look: PersonLook) {
  const col = look.hood ?? C.coat;
  const prof = fine([
    new THREE.Vector2(0.255, -0.02), new THREE.Vector2(0.27, 0.06), new THREE.Vector2(0.275, 0.17), new THREE.Vector2(0.26, 0.28),
    new THREE.Vector2(0.21, 0.38), new THREE.Vector2(0.13, 0.47), new THREE.Vector2(0.04, 0.55), new THREE.Vector2(0.0, 0.58),
  ], 36);
  // the brow juts forward into a soft visor, and the point leans back
  const bend = (v: THREE.Vector3) => {
    const front = Math.max(0, Math.cos(ang(v)));
    const over = front * THREE.MathUtils.smoothstep(v.y, -0.05, 0.15) * THREE.MathUtils.smoothstep(0.45 - v.y, 0, 0.15);
    v.z += over * 0.06;
    const k = Math.max(0, (v.y - 0.22) / 0.28);
    v.z -= k * k * 0.13 + 0.02;
  };
  // the opening: a rounded arch, tall in the middle and curving down to the cheeks
  const W = 0.86;
  const archY = (a: number) => 0.28 - 0.13 * Math.pow(Math.min(1, Math.abs(a) / W), 2.2);
  const open = (v: THREE.Vector3) => { const a = Math.abs(ang(v)); return a < W && v.y < archY(a); };
  const lathe = new THREE.LatheGeometry(prof, 36);
  // judge each quad before bending, so the arch is cut on the round shape; the tip above TIP is its own piece,
  // hinged where the hood starts to lean back, so it can bob and trail
  const TIP = 0.36;
  const tipAt = new THREE.Vector3(0, TIP, 0); bend(tipAt);
  const tipPivot = new THREE.Group(); tipPivot.position.copy(tipAt); P.head.add(tipPivot); P.hoodTip = tipPivot;
  for (const top of [false, true]) {
    const keep = cut(lathe, v => !open(v) && (v.y >= TIP) === top);
    const outer = soften(warp(keep, bend));
    const innerG = outer.clone(); innerG.scale(0.94, 0.97, 0.94);
    if (top) { outer.translate(-tipAt.x, -tipAt.y, -tipAt.z); innerG.translate(-tipAt.x, -tipAt.y, -tipAt.z); }
    const hood = new THREE.Mesh(outer, toonFlat(col)); hood.castShadow = true;
    const inner = new THREE.Mesh(innerG, toonFlat(C.hoodIn)); inner.userData.noOutline = true;
    (top ? tipPivot : P.head).add(hood, inner);
  }
  // the folded rim: a soft roll of cloth that follows the arch and runs down both cheeks to the scarf
  const rAt = (y: number) => { for (let i = 1; i < prof.length; i++) if (prof[i].y >= y) { const a = prof[i - 1], b = prof[i]; return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); } return 0; };
  const pts: THREE.Vector3[] = [];
  const edge = (a: number, y: number) => { const r = rAt(y) * 1.0; const v = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r); bend(v); return v; };
  for (let y = -0.02; y < archY(W); y += 0.03) pts.push(edge(-W, y));
  for (let i = 0; i <= 24; i++) { const a = -W + (2 * W * i) / 24; pts.push(edge(a, archY(a))); }
  for (let y = archY(W) - 0.03; y >= -0.02; y -= 0.03) pts.push(edge(W, y));
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.03, 8, false), toonFlat(col));
  rim.castShadow = true;
  P.head.add(rim);
}

/** A thick navy scarf wound twice round the neck, with one tail hanging down the back on the right. */
function buildScarf(P: Person, look: PersonLook) {
  const col = look.scarf ?? C.scarf;
  const low = mkSoft(new THREE.TorusGeometry(0.2, 0.1, 10, 24), col, 0, 0.65, 0.0); low.rotation.x = Math.PI / 2; low.scale.set(1.0, 0.88, 1); P.torso.add(low);
  const high = mkSoft(new THREE.TorusGeometry(0.135, 0.07, 10, 24), col, 0, 0.73, 0.0); high.rotation.set(Math.PI / 2 + 0.08, 0, 0); P.torso.add(high);
  let parent: THREE.Object3D = P.torso;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    if (i === 0) seg.position.set(-0.1, 0.66, -0.25); else seg.position.y = -0.1;
    const w = 0.13 - i * 0.008;
    const m = mkSoft(new THREE.BoxGeometry(w, 0.11, 0.03, 2, 2, 1), col, 0, -0.05, 0);
    if (i === 3) { m.scale.y = 0.9; const notch = mkSoft(new THREE.ConeGeometry(w * 0.45, 0.06, 3), col, w * 0.25, -0.12, 0); notch.rotation.z = Math.PI; seg.add(notch); }
    seg.add(m); parent.add(seg); parent = seg; P.scarfTail.push(seg);
  }
}

/** The brown strap over the right shoulder, the brass buckle, the satchel at the back of the left hip, and the boat. */
function buildStrapAndSatchel(P: Person, look: PersonLook) {
  const pts = [
    new THREE.Vector3(0.24, 0.12, -0.04), new THREE.Vector3(0.19, 0.2, 0.17), new THREE.Vector3(0.02, 0.4, 0.215),
    new THREE.Vector3(-0.15, 0.58, 0.14), new THREE.Vector3(-0.19, 0.64, 0.0), new THREE.Vector3(-0.14, 0.58, -0.16),
    new THREE.Vector3(0.04, 0.38, -0.215), new THREE.Vector3(0.2, 0.18, -0.2), new THREE.Vector3(0.24, 0.12, -0.04),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.022, 6, true), toon(C.strap));  strap.castShadow = true;
  P.torso.add(strap);
  const buckle = mk(new THREE.BoxGeometry(0.06, 0.05, 0.012), C.brass, -0.075, 0.47, 0.205); buckle.rotation.z = 0.8; buckle.userData.noOutline = true; P.torso.add(buckle);
  const hole = mk(new THREE.BoxGeometry(0.035, 0.028, 0.014), C.strap, -0.075, 0.47, 0.207); hole.rotation.z = 0.8; hole.userData.noOutline = true; P.torso.add(hole);

  const bag = new THREE.Group(); bag.position.set(0.25, 0.02, -0.2); bag.rotation.y = 0.8; bag.scale.setScalar(1.25);
  const body = mk(new RoundedBox(0.22, 0.18, 0.09, 0.02), C.satchel); bag.add(body);
  const flap = mk(new RoundedBox(0.226, 0.09, 0.097, 0.02), '#7a4a2a', 0, 0.06, 0.004); bag.add(flap);
  const bk = mk(new THREE.BoxGeometry(0.03, 0.035, 0.01), C.brass, 0, 0.02, 0.052); bk.userData.noOutline = true; bag.add(bk);
  P.torso.add(bag); P.satchel = bag;
  if (look.props?.includes('boatPeek')) {
    const boat = new THREE.Group(); boat.position.set(-0.03, 0.14, 0); boat.rotation.set(0, 0, 0.2); boat.scale.setScalar(1.5);
    const paper = '#f6f0e2';
    const hull = mkFlat(new THREE.CylinderGeometry(0.075, 0.035, 0.05, 4, 1), paper); hull.rotation.y = Math.PI / 4; hull.scale.set(1.6, 1, 0.5); boat.add(hull);
    const sail = mkFlat(new THREE.ConeGeometry(0.045, 0.1, 4), paper, 0, 0.065, 0); sail.scale.z = 0.3; boat.add(sail);
    bag.add(boat);
  }
  P.hipR.position.set(-0.22, 0.04, 0.05);
  P.torso.add(P.hipR);
  // the lantern hangs from the strap on the right of the chest
  P.strapPoint.position.set(-0.095, 0.44, 0.25);
  P.torso.add(P.strapPoint);
}
