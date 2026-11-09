import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, softRamp } from '../../render/paint';
import { SKY_WIND } from './windScarf';
import { mulberry, lathe as rlathe, smooth } from './windRig';
import { headPt } from './windBody';
import { WIND_COLORS } from './windfolk';

// The cheering crowd of the Sky Isles: 40-80 windfolk lining the cliffs and fences at the race.
//
// Every person is a low-poly cousin of the hand-built windfolk: the same long-limbed proportions, a shaped
// torso (shoulders, waist, a waistcoat, a long coat or a dress flaring out), arms with an elbow, a bigger
// face with big eyes, straw hats, a scarf wrapped round the neck with one tail. Three builds (slim, medium,
// broad), earthy muted cloth with the bright festival colours only on scarves and hat bands (picture 3).
// The whole crowd is merged into ONE mesh with vertex colours: one draw call for the people, one for their
// ink, and a shadow pass. Nothing moves on the CPU: each vertex knows its part (body, upper arm, forearm,
// head, scarf, mouth), the joints it turns about (shoulder and elbow: a two-bone arm), and whose it is, and
// the vertex shader raises and waves the arms, bends the elbows, hops, tips the heads up, opens the mouths
// and streams the scarves. update() only sets three uniforms.
// About 700 triangles a person: 60 people are about 42k triangles.

export interface CrowdSpot {
  /** Where the person stands (feet), in the crowd root's frame (y up). */
  pos: THREE.Vector3;
  /** Which way they face: a yaw angle (radians, 0 = +z) or a direction. */
  facing: number | THREE.Vector3;
  /** Optional overall size (1 = adult). Children are made by the seed if not given. */
  scale?: number;
}

// parts, written into aInfo.x
const BODY = 0, ARM_L = 1, ARM_R = 2, HEAD = 3, SCARF = 4, MOUTH = 5, FORE_L = 6, FORE_R = 7;

const DEFORM = /* glsl */ `
  attribute vec3 aPivot;
  attribute vec3 aElbow;
  attribute vec4 aInfo;   // part, seed, yaw, along (scarf) / packed mouth centre
  uniform float uCTime;
  uniform float uCheer;
  uniform vec3 uCWind;
  vec3 cRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
  void crowdDeform(inout vec3 p, inout vec3 n) {
    float part = aInfo.x, seed = aInfo.y, yaw = aInfo.z, w = aInfo.w;
    vec3 fwd = vec3(sin(yaw), 0.0, cos(yaw));
    vec3 rgt = vec3(cos(yaw), 0.0, -sin(yaw));
    float t = uCTime + seed * 17.0;
    // how much this one cheers: everybody joins in, some a beat late, some wilder than others
    float keen = 0.6 + 0.5 * fract(seed * 7.31);
    float ch = clamp(uCheer * keen * 1.25 - fract(seed * 3.7) * 0.25 * (1.0 - uCheer), 0.0, 1.0);
    float idle = sin(t * 0.9);
    bool arm = (part > 0.5 && part < 2.5) || part > 5.5;
    if (arm) {
      float s = (part < 1.5 || (part > 5.5 && part < 6.5)) ? -1.0 : 1.0;
      // one-armed wavers and two-armed cheerers; a few clap with their hands up
      float lift = ch * (s > 0.0 ? 1.0 : step(0.3, fract(seed * 5.13)));
      float wave = sin(t * 7.0 + s * 1.3);
      // the elbow first (forearm only): a soft bend at rest, a waving bend when up
      if (part > 5.5) {
        float bend = 0.3 + lift * (0.25 + 0.35 * (0.5 + 0.5 * wave)) + 0.05 * idle;
        p = aElbow + cRot(p - aElbow, rgt, -bend);
        n = cRot(n, rgt, -bend);
      }
      // then the shoulder: out to the side and up, waving
      float a = 0.08 + idle * 0.03 + lift * (2.45 + wave * 0.18);
      float f = -0.25 * lift - 0.08 * (1.0 - lift);
      vec3 q = cRot(p - aPivot, fwd, -a * s);
      q = cRot(q, rgt, f);
      p = aPivot + q;
      n = cRot(cRot(n, fwd, -a * s), rgt, f);
    } else if ((part > 2.5 && part < 3.5) || (part > 4.5 && part < 5.5)) {
      // the head (and everything on it) tips up to watch the racers, and looks about when idle
      if (part > 4.5) {
        // the mouth: its centre is packed into w as (height above the neck * 1000) + forward; it opens into a shout
        vec3 c = aPivot + vec3(0.0, floor(w) / 1000.0, 0.0) + fwd * fract(w);
        float o = 1.0 + ch * (1.6 + 0.8 * sin(t * 6.0));
        p = c + (p - c) * vec3(1.0, o, 1.0);
      }
      float a = -0.3 * ch + 0.05 * idle;
      float turn = sin(t * 0.37) * 0.25 * (1.0 - ch);
      vec3 q = cRot(p - aPivot, rgt, a);
      q = cRot(q, vec3(0.0, 1.0, 0.0), turn);
      p = aPivot + q;
      n = cRot(cRot(n, rgt, a), vec3(0.0, 1.0, 0.0), turn);
    } else if (part > 3.5 && part < 4.5) {
      // the scarf tail is stored flat as (along, across, through) from its knot; hang it and stream it downwind
      vec3 rel = p - aPivot;
      float g = 1.0 + 0.4 * sin(t * 0.7) + 0.2 * sin(t * 1.9);
      vec3 wd = normalize(uCWind * g * (0.4 + w) + vec3(0.0, -1.0, 0.0) * (1.0 - 0.3 * w) + rgt * 0.3 * sin(t * 1.1));
      vec3 side = normalize(vec3(0.0, 1.0, 0.0) - wd * wd.y + fwd * 0.2);
      float rip = (sin(w * 9.0 - t * 9.0) * 0.05 + sin(w * 17.0 - t * 15.0) * 0.02) * w;
      side = cRot(side, wd, sin(w * 4.0 - t * 2.2) * 0.6 * w);
      vec3 nn = normalize(cross(wd, side));
      p = aPivot + wd * rel.x + side * rel.y + nn * (rel.z + rip + rel.y * rel.y * 3.0);
      n = nn * sign(n.z + 1e-4);
    }
    // the whole body: a little hop for the keenest, a sway from foot to foot for the rest
    float hop = max(0.0, sin(t * 5.4)) * 0.06 * ch * step(0.45, fract(seed * 2.17));
    p.y += hop;
    p += rgt * sin(t * 1.3) * 0.012 * (1.0 + ch);
  }
`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
type P3 = [number, number, number];

/** Collects one crowd's parts into flat arrays, with the attributes the vertex shader needs. */
class CrowdKit {
  geos: THREE.BufferGeometry[] = [];
  /** The person being built: their placement in the crowd, and their seed and yaw. */
  M = new THREE.Matrix4(); seed = 0; yaw = 0; scale = 1;
  add(geo: THREE.BufferGeometry, color: string | THREE.Color, part: number, pivot: P3, x = 0, y = 0, z = 0, o: { r?: P3; s?: number | P3; w?: number; elbow?: P3 } = {}) {
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(x, y, z), _q, _s).premultiply(this.M);
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose();
    const shade = g.attributes.color as THREE.BufferAttribute | undefined;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    g.applyMatrix4(_m);
    this.tag(g, color, part, _p.set(...pivot).applyMatrix4(this.M).clone(), o.w ?? 0, o.elbow ? new THREE.Vector3(...o.elbow).applyMatrix4(this.M) : undefined, shade);
    this.geos.push(g);
  }
  tag(g: THREE.BufferGeometry, color: string | THREE.Color, part: number, pivot: THREE.Vector3, along: number | ((i: number) => number), elbow?: THREE.Vector3, shade?: THREE.BufferAttribute) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), piv = new Float32Array(n * 3), elb = new Float32Array(n * 3), info = new Float32Array(n * 4);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      if (shade) { col[i * 3] *= shade.getX(i); col[i * 3 + 1] *= shade.getY(i); col[i * 3 + 2] *= shade.getZ(i); }
      pivot.toArray(piv, i * 3); (elbow ?? pivot).toArray(elb, i * 3);
      info.set([part, this.seed, this.yaw, typeof along === 'number' ? along : along(i)], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    g.setAttribute('aElbow', new THREE.BufferAttribute(elb, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  }
  /** A scarf tail, stored flat (along, across, through) relative to its knot; the shader streams it. */
  tail(pivotLocal: P3, len: number, w: number, color: string) {
    const N = 7, pos: number[] = [], nor: number[] = [], al: number[] = [], sh: number[] = [];
    const knot = new THREE.Vector3(...pivotLocal).applyMatrix4(this.M);
    const S = this.scale;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      for (const face of [1, -1]) {
        const z = face * 0.004 * S;
        // narrowing to the tip, with a notched end
        const wd = (u: number) => w * 0.5 * (1 - 0.4 * u) * S;
        const quad: [number, number][] = [[u0, -1], [u1, -1], [u0, 1], [u1, -1], [u1, 1], [u0, 1]];
        if (face < 0) quad.reverse();
        for (const [u, a] of quad) { const notch = u === 1 && a > 0 ? 0.06 : 0; pos.push(knot.x + (u - notch) * len * S, knot.y + a * wd(u), knot.z + z); nor.push(0, 0, face); al.push(u); sh.push(face > 0 ? 1 : 0.75); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.tag(g, color, SCARF, knot, i => al[i]);
    const col = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < sh.length; i++) col.setXYZ(i, col.getX(i) * sh[i], col.getY(i) * sh[i], col.getZ(i) * sh[i]);
    this.geos.push(g);
  }
}

const sph = (r: number, w = 9, h = 7) => new THREE.SphereGeometry(r, w, h);
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];
/** A lathe with fold shading in the vertex colours (cheap cloth). */
function clothL(pts: [number, number][], n: number, folds: number, amt: number, seed: number, sz = 1) {
  const g = rlathe(pts, n);
  const pa = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pa.count * 3);
  const yTop = pts[0][1], yBot = pts[pts.length - 1][1];
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(x, z);
    const k = Math.max(0, Math.min(1, (yTop - y) / ((yTop - yBot) || 1)));
    const f = Math.sin(a * folds + seed);
    pa.setXYZ(i, x * (1 + amt * k * f), y + (y < yBot + 0.02 ? Math.sin(a * 3 + seed) * 0.01 : 0), z * (1 + amt * k * f) * sz);
    const v = 1 + 0.2 * k * Math.min(0, f) + 0.06 * k * Math.max(0, f);
    cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** One person of the crowd, in their own frame (feet at 0, facing +z), in Person units (H = 1). Low-poly. */
function crowdPerson(k: CrowdKit, r: () => number, kid: boolean) {
  const C = WIND_COLORS;
  const build = kid ? 0 : Math.floor(r() * 3); // slim, medium, broad
  const B = [0.95, 1.15, 1.42][build];
  const LL = kid ? 0.8 : 0.9 + r() * 0.1, TL = kid ? 0.47 : 0.55 + r() * 0.05;
  const skin = pick(r, C.skins), hair = pick(r, C.hairs), shirt = pick(r, C.shirts), coat = pick(r, C.coats), sc = pick(r, C.scarves), tr = pick(r, C.trousers);
  const style = Math.floor(r() * 4); // 0 waistcoat, 1 long coat, 2 dress, 3 shirt and braces
  const hat = r() < (kid ? 0.45 : 0.75), rolled = r() < 0.35;
  const O: P3 = [0, 0, 0];
  const hipY = LL;
  // legs: tapered tubes and boots
  for (const s of [-1, 1]) {
    const x = 0.068 * s * B;
    k.add(clothL([[0.058 * B, hipY + 0.03], [0.054 * B, hipY - LL * 0.25], [0.042 * B, hipY - LL * 0.5], [0.044 * B, hipY - LL * 0.65], [0.03 * B, 0.07], [0.0, 0.06]], 6, 0, 0, 0), style === 2 ? '#5a5048' : tr, BODY, O, x, 0, 0);
    k.add(sph(0.05, 6, 4), pick(r, ['#5a3a24', '#4a3020', '#7a5034']), BODY, O, x, 0.035, 0.03, { s: [0.85 * B, 0.65, 1.6] });
  }
  const T = hipY;
  // the torso: hips, waist, chest, sloping shoulders
  const tw = (f: number) => f * B;
  const prof: [number, number][] = [[0.0, T + TL], [0.045 + 0.02 * B, T + TL - 0.01], [tw(0.09), T + TL - 0.04], [tw(0.118), T + TL - 0.085], [tw(0.116), T + TL * 0.7], [tw(0.1), T + TL * 0.4], [tw(0.112), T + 0.06], [tw(0.116), T - 0.02], [0.0, T - 0.09]];
  k.add(clothL(prof, 9, 4, 0.02, 1, 0.76), style === 3 ? shirt : coat, BODY, O, 0, 0, 0);
  // the garment over it
  if (style === 1) k.add(clothL([[tw(0.124), T + 0.08], [tw(0.13), T - 0.05], [tw(0.17), T - 0.25], [tw(0.21), T - 0.45]], 10, 5, 0.12, r() * 6, 0.8), coat, BODY, O, 0, 0, 0);
  if (style === 2) k.add(clothL([[tw(0.12), T + 0.08], [tw(0.13), T - 0.05], [tw(0.19), T - 0.35], [0.25, T - 0.68]], 11, 6, 0.1, r() * 6, 0.84), coat, BODY, O, 0, 0, 0);
  if (style === 0 || style === 3) k.add(clothL([[tw(0.12), T + 0.06], [tw(0.124), T - 0.04], [tw(0.11), T - 0.1]], 9, 3, 0.04, 0, 0.8), tr, BODY, O, 0, 0, 0);
  // a shirt front showing in the waistcoat; braces over a shirt
  const fz = tw(0.112) * 0.76;
  if (style === 0) k.add(new THREE.BoxGeometry(0.05 * B, TL * 0.55, 0.01), shirt, BODY, O, 0, T + TL * 0.6, fz + 0.004);
  if (style === 3) for (const sx of [-1, 1]) for (const zz of [1, -1]) k.add(new THREE.BoxGeometry(0.018, TL * 0.85, 0.008), '#6e4528', BODY, O, sx * 0.05 * B, T + TL * 0.5, zz * (fz + 0.003), { r: [0.08 * zz, 0, 0] });
  k.add(new THREE.CylinderGeometry(tw(0.12), tw(0.12), 0.03, 9, 1, true), '#6e4528', BODY, O, 0, T + 0.07, 0, { s: [1, 1, 0.8] });
  // arms: upper arm and forearm, the shoulder and elbow joints for the shader
  const aR = 0.04 * B, upL = 0.31, foL = 0.29;
  for (const s of [-1, 1]) {
    const sx = tw(0.118) * s, sy = T + TL - 0.075;
    const sh: P3 = [sx, sy, 0], el: P3 = [sx, sy - upL, 0];
    const sleeve = style === 3 || style === 0 ? shirt : coat;
    k.add(clothL([[aR * 0.9, sy + 0.035], [aR * 1.15, sy - 0.02], [aR * 1.0, sy - upL * 0.6], [aR * 0.85, sy - upL - 0.02], [0.0, sy - upL - 0.03]], 6, 0, 0, 0), sleeve, s < 0 ? ARM_L : ARM_R, sh, sx, 0, 0);
    const foreC = rolled ? skin : sleeve;
    k.add(clothL([[aR * 0.85, sy - upL + 0.03], [aR * 0.8, sy - upL - foL * 0.3], [aR * 0.6, sy - upL - foL], [0.0, sy - upL - foL - 0.01]], 6, 0, 0, 0), foreC, s < 0 ? FORE_L : FORE_R, sh, sx, 0, 0, { elbow: el });
    if (rolled) k.add(new THREE.TorusGeometry(aR * 0.95, 0.012, 4, 8), sleeve, s < 0 ? ARM_L : ARM_R, sh, sx, sy - upL + 0.01, 0, { r: [Math.PI / 2, 0, 0] });
    k.add(sph(0.034, 6, 5), skin, s < 0 ? FORE_L : FORE_R, sh, sx, sy - upL - foL - 0.03, 0.004, { s: [0.7, 1.2, 0.9], elbow: el });
  }
  // the scarf wrapped round the neck, and its tail (added at the end)
  const ny = T + TL;
  k.add(new THREE.TorusGeometry(0.06 + 0.012 * B, 0.03, 5, 10), sc, BODY, O, 0, ny - 0.02, 0.005, { r: [Math.PI / 2 + 0.2, 0, 0], s: [1.1, 1, 0.85] });
  k.add(sph(0.028, 6, 5), sc, BODY, O, 0.03, ny - 0.05, 0.07);
  // neck and head: everything on the head turns about the neck
  const R = (kid ? 0.13 : 0.128) * (1 + r() * 0.06);
  const hy = ny + 0.06, hp: P3 = [0, hy, 0];
  k.add(new THREE.CylinderGeometry(0.032, 0.036, 0.09, 6, 1, true), skin, HEAD, hp, 0, ny + 0.02, 0);
  const HC = new THREE.Vector3(0, hy + R * 0.92, R * 0.12);
  const at = (d: THREE.Vector3, lift: number) => headPt(d.normalize(), lift, new THREE.Vector3(), R, HC);
  const skull = new THREE.SphereGeometry(1, 12, 9), spa = skull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < spa.count; i++) { const v = at(new THREE.Vector3().fromBufferAttribute(spa, i), 0); spa.setXYZ(i, v.x, v.y, v.z); }
  skull.computeVertexNormals();
  k.add(skull, skin, HEAD, hp);
  // big eyes with a glint, brows, blush
  for (const s of [-1, 1]) {
    const d = new THREE.Vector3(0.42 * s, -0.16, 0.9), e = at(d, 0.003);
    const rot: P3 = [0.16, 0.42 * s, 0];
    k.add(sph(R * 0.13, 7, 6), '#2e2226', HEAD, hp, e.x, e.y, e.z, { r: rot, s: [0.85, 1.25, 0.32] });
    const gl = at(new THREE.Vector3(0.45 * s, -0.08, 0.9), 0.008);
    k.add(sph(R * 0.04, 4, 3), '#ffffff', HEAD, hp, gl.x, gl.y, gl.z, { s: [1, 1, 0.4] });
    const b = at(new THREE.Vector3(0.42 * s, 0.12, 0.9), 0.004);
    k.add(new THREE.BoxGeometry(R * 0.32, R * 0.06, 0.006), hair, HEAD, hp, b.x, b.y, b.z, { r: [0, 0.42 * s, -0.1 * s] });
    const bl = at(new THREE.Vector3(0.5 * s, -0.42, 0.82), 0.002);
    k.add(sph(R * 0.12, 6, 4), '#e8907e', HEAD, hp, bl.x, bl.y, bl.z, { r: [0, 0.5 * s, 0], s: [1.2, 0.55, 0.15] });
  }
  // the mouth turns with the head, about the neck; its own centre (scaled to the crowd) rides in w
  const mp = at(new THREE.Vector3(0, -0.66, 0.78), 0.003);
  const S = k.scale;
  k.add(sph(R * 0.12, 6, 4), '#5a2228', MOUTH, hp, mp.x, mp.y, mp.z, { s: [1.3, 0.55, 0.3], r: [0.5, 0, 0], w: Math.floor((mp.y - hy) * S * 1000) + Math.min(0.999, mp.z * S) });
  // hair: a cap following the skull, a fringe, a bun or a beard for some
  const cap = new THREE.SphereGeometry(1, 12, 9), cpa = cap.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cpa.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(cpa, i).normalize();
    const line = d.z > 0 ? -0.2 + 0.6 * smooth(0.2, 0.85, d.z) : -0.2 - 0.5 * smooth(0, 0.7, -d.z);
    const v = at(d, d.y < line ? -R * 0.15 : R * 0.07); cpa.setXYZ(i, v.x, v.y, v.z);
  }
  cap.computeVertexNormals();
  k.add(cap, hair, HEAD, hp);
  for (let i = -1; i <= 1; i++) { const f = at(new THREE.Vector3(i * 0.3, 0.42, 0.85), R * 0.08); k.add(sph(R * 0.22, 6, 4), hair, HEAD, hp, f.x, f.y, f.z, { s: [1.2, 0.7, 0.5], r: [0.4, 0, i * 0.5] }); }
  if (style === 2 && !hat) { const b = at(new THREE.Vector3(0, 0.5, -0.85), R * 0.3); k.add(sph(R * 0.42, 7, 5), hair, HEAD, hp, b.x, b.y, b.z); }
  if (!kid && style !== 2 && r() < 0.25) { const b = at(new THREE.Vector3(0, -0.75, 0.6), 0); k.add(sph(R * 0.6, 7, 5), hair, HEAD, hp, b.x, b.y, b.z - R * 0.15, { s: [1.05, 0.8, 0.8] }); }
  // a straw hat with a coloured band
  if (hat) {
    const Rb = R * (2.2 + r() * 0.5), cr = R * 0.95, ch = R * (0.45 + r() * 0.2), tilt = (r() - 0.5) * 0.25;
    const hyy = HC.y + R * 0.42, o = { r: [-0.12, 0, tilt] as P3 };
    k.add(clothL([[0.0, 0.004], [cr * 1.05, 0.0], [Rb * 0.8, -0.025], [Rb, -0.05], [Rb * 0.97, -0.054], [cr, -0.008], [0.0, -0.008]], 14, 4, 0.05, r() * 5), '#e9c877', HEAD, hp, 0, hyy, HC.z - R * 0.05, o);
    k.add(clothL([[0.0, ch + 0.01], [cr * 0.85, ch * 0.8], [cr, 0.0]], 10, 0, 0, 0), '#e2bf6c', HEAD, hp, 0, hyy, HC.z - R * 0.05, o);
    k.add(new THREE.CylinderGeometry(cr * 1.02, cr * 1.03, ch * 0.35, 10, 1, true), pick(r, WIND_COLORS.bands), HEAD, hp, 0, hyy + ch * 0.18, HC.z - R * 0.05, o);
  }
  k.tail([-0.04 * B, ny - 0.03, -0.07], 0.5 + r() * 0.35, 0.1, sc);
}

/** Toon + painted look, with the crowd's vertex shader on top. */
function crowdMaterial(U: Record<string, THREE.IUniform>) {
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.55 });
  const painted = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    painted.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DEFORM)
      .replace('#include <beginnormal_vertex>', 'vec3 cP = position; vec3 cN = normal; crowdDeform(cP, cN);\nvec3 objectNormal = cN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = cP;');
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + '_crowd2';
  return m;
}

/** The ink edge for the crowd: the same deformation, pushed out along the normal, back faces only. */
function crowdInk(U: Record<string, THREE.IUniform>, width: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#3a2a2e') }, uW: { value: width } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uW;
      ${DEFORM}
      void main(){
        vec3 p = position; vec3 n = normal; crowdDeform(p, n);
        float w = (aInfo.x > 4.5 && aInfo.x < 5.5) ? 0.0 : uW;
        vec4 mvPosition = modelViewMatrix * vec4(p + normalize(n) * w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main(){ gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
  });
}

export class Crowd {
  root = new THREE.Group();
  mesh: THREE.Mesh;
  /** Triangles in the crowd (without the ink pass). */
  triangles: number;
  private U = { uCTime: { value: 0 }, uCheer: { value: 0 }, uCWind: { value: new THREE.Vector3(1, 0, 0) } };
  private cheer = 0;
  private inv = new THREE.Matrix4();

  constructor(spots: CrowdSpot[], seed = 1) {
    const k = new CrowdKit();
    const r = mulberry(seed * 31 + 5);
    spots.forEach((sp, i) => {
      const yaw = typeof sp.facing === 'number' ? sp.facing : Math.atan2(sp.facing.x, sp.facing.z);
      const kid = sp.scale === undefined ? r() < 0.2 : sp.scale < 0.8;
      const H = sp.scale ?? (kid ? 0.78 + r() * 0.06 : 0.88 + r() * 0.12);
      k.M.compose(sp.pos, _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), _s.setScalar(H));
      k.seed = (i * 0.618 + r()) % 1; k.yaw = yaw; k.scale = H;
      crowdPerson(k, r, kid);
    });
    const g = mergeGeometries(k.geos, false)!;
    k.geos.forEach(x => x.dispose());
    g.computeBoundingSphere(); g.boundingSphere!.radius += 1.5; // arms and scarves reach out of the rest pose
    this.triangles = g.attributes.position.count / 3;
    this.mesh = new THREE.Mesh(g, crowdMaterial(this.U));
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    // shadows follow the cheering arms too
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DEFORM)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 cN = normal; crowdDeform(transformed, cN);');
    };
    depth.customProgramCacheKey = () => 'crowdDepth2';
    this.mesh.customDepthMaterial = depth;
    const ink = new THREE.Mesh(g, crowdInk(this.U, 0.009));
    Object.assign((ink.material as THREE.ShaderMaterial).uniforms, this.U);
    ink.userData.isOutline = true; ink.userData.noOutline = true;
    this.mesh.userData.noOutline = true;
    this.mesh.add(ink);
    this.root.add(this.mesh);
  }

  /**
   * @param cheer 0 = watching, 1 = everyone cheering (eased, so it can be switched on and off)
   * @param air   the wind in world space; defaults to SKY_WIND
   */
  update(dt: number, t: number, cheer: number, air: THREE.Vector3 = SKY_WIND) {
    this.cheer += (cheer - this.cheer) * (1 - Math.exp(-4 * dt));
    this.U.uCTime.value = t;
    this.U.uCheer.value = this.cheer;
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    this.U.uCWind.value.copy(air).transformDirection(this.inv).multiplyScalar(air.length() * 0.18);
  }

  dispose() { this.mesh.geometry.dispose(); }
}
