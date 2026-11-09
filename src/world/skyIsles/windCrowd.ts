import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, softRamp } from '../../render/paint';
import { SKY_WIND } from './windScarf';
import { mulberry, lathe as rlathe, smooth, cowl, flatKnot, backLit } from './windRig';
import { headPt } from './windBody';
import { WIND_COLORS } from './windfolk';

// The cheering crowd of the Sky Isles: 40-80 windfolk packed along the cliff fences at the race (picture 3).
//
// Every person is a cheap cousin of the hand-built windfolk, built for silhouette first: about 5 heads tall,
// a short chunky torso under a rounded shoulder yoke, tapered sleeves ending in mitten hands with a thumb,
// a sculpted head (the same skull as the heroes: jaw, chin, sockets, nose, ears) with dark painted eyes like
// the World 1 villagers, and a mix of headwear: straw hats whose crowns really sit on the head, cloth caps,
// knotted kerchiefs, bare heads with buns or tousled hair, a few beards. The scarf is a bunched cowl with a
// knot and two short drooping ends. Earthy cloth, festival colours only on scarves, bands and kerchiefs.
//
// The whole crowd is ONE merged mesh with vertex colours: one draw call for the people, one for their ink, and a
// shadow pass. Nothing moves on the CPU: each vertex knows its part (body, upper arm, forearm, head, scarf,
// mouth), the joints it turns about (shoulder, elbow, neck, knot), whose it is and how they stand (front-row
// leaners rest their forearms on the rail), and the vertex shader poses everyone: soft rest arms, leaning on
// the rail, cheering with both arms up and the elbows bent, palms open to the front, waving, hopping, heads up,
// mouths open in a shout, scarf ends fluttering. update() only sets three uniforms.

export interface CrowdSpot {
  /** Where the person stands (feet), in the crowd root's frame (y up). */
  pos: THREE.Vector3;
  /** Which way they face: a yaw angle (radians, 0 = +z) or a direction. */
  facing: number | THREE.Vector3;
  /** Optional overall size (1 = adult). Children are made by the seed if not given. */
  scale?: number;
  /** Lean on a rail in front (forearms on it) when not cheering. */
  lean?: boolean;
}

// parts, written into aInfo.x
const BODY = 0, ARM_L = 1, ARM_R = 2, HEAD = 3, SCARF = 4, MOUTH = 5, FORE_L = 6, FORE_R = 7;

const DEFORM = /* glsl */ `
  attribute vec3 aPivot;   // shoulder (arms), neck (head), knot (scarf)
  attribute vec3 aElbow;   // elbow (forearms), mouth centre (mouth)
  attribute vec4 aInfo;    // part, seed, yaw, along (scarf)
  attribute vec4 aBase;    // feet, and 1 for a rail-leaner
  uniform float uCTime;
  uniform float uCheer;
  uniform vec3 uCWind;
  vec3 cRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
  void crowdDeform(inout vec3 p, inout vec3 n) {
    float part = aInfo.x, seed = aInfo.y, yaw = aInfo.z, w = aInfo.w, lean = aBase.w;
    vec3 fwd = vec3(sin(yaw), 0.0, cos(yaw));
    vec3 rgt = vec3(cos(yaw), 0.0, -sin(yaw));
    vec3 upv = vec3(0.0, 1.0, 0.0);
    float t = uCTime + seed * 17.0;
    // how much this one cheers: everybody joins in, some a beat late, some wilder than others
    float keen = 0.65 + 0.5 * fract(seed * 7.31);
    float ch = clamp(uCheer * keen * 1.3 - fract(seed * 3.7) * 0.3 * (1.0 - uCheer), 0.0, 1.0);
    float idle = sin(t * 0.9);
    bool upper = part > 0.5 && part < 2.5, fore = part > 5.5;
    if (upper || fore) {
      float s = (part < 1.5 || (part > 5.5 && part < 6.5)) ? -1.0 : 1.0;
      // two-armed cheerers and one-armed wavers
      float lift = ch * (s > 0.0 ? 1.0 : step(0.35, fract(seed * 5.13)));
      float wave = sin(t * 6.5 + s * 1.3 + seed * 3.0);
      // the rest pose: arms soft at the sides (a few with hands clasped in front), or forearms on the rail
      float clasp = step(0.62, fract(seed * 3.31)) * (1.0 - lean);
      float raiseR = mix(mix(0.1 + 0.02 * idle, -0.1, clasp), -0.16, lean);
      float pitchR = mix(mix(0.12, 0.42, clasp), 0.62, lean);
      float bendR = mix(mix(0.45, 1.25, clasp), 1.05, lean);
      float twistR = mix(0.0, -1.5708, lean);
      // cheering: up and out above the head, the elbow bent in, the palm open to the front, waving
      float raiseC = 2.3 + 0.12 * wave;
      float pitchC = 0.32;
      float inC = 0.6 + 0.3 * (0.5 + 0.5 * wave);
      float a = mix(raiseR, raiseC, lift), f = mix(pitchR, pitchC, lift), bf = bendR * (1.0 - lift), bi = inC * lift;
      float tw = mix(twistR, 1.5708, lift);
      if (fore) {
        vec3 q = p - aElbow;
        q = cRot(q, upv, tw * s); n = cRot(n, upv, tw * s);
        q = cRot(q, rgt, -bf); n = cRot(n, rgt, -bf);
        float yin = -s * 0.85 * lean * (1.0 - lift); q = cRot(q, upv, yin); n = cRot(n, upv, yin);
        q = cRot(q, fwd, s * bi); n = cRot(n, fwd, s * bi);
        p = aElbow + q;
      }
      vec3 q = p - aPivot;
      q = cRot(q, rgt, -f); n = cRot(n, rgt, -f);
      q = cRot(q, fwd, a * s); n = cRot(n, fwd, a * s);
      p = aPivot + q;
    } else if ((part > 2.5 && part < 3.5) || (part > 4.5 && part < 5.5)) {
      // the head (and everything on it) tips up to watch the racers and looks about when idle;
      // the mouth opens into a shout
      if (part > 4.5) {
        float o = 1.0 + ch * (1.5 + 0.7 * sin(t * 6.0));
        p = aElbow + (p - aElbow) * vec3(1.0, o, 1.0);
      }
      float a = -0.32 * ch + 0.05 * idle + 0.12 * lean * (1.0 - ch);
      float turn = sin(t * 0.37) * 0.3 * (1.0 - ch);
      float tilt = sin(seed * 31.0) * 0.12;
      vec3 q = p - aPivot;
      q = cRot(q, fwd, tilt); n = cRot(n, fwd, tilt);
      q = cRot(q, rgt, a); n = cRot(n, rgt, a);
      q = cRot(q, upv, turn); n = cRot(n, upv, turn);
      p = aPivot + q;
    } else if (part > 3.5 && part < 4.5) {
      // the short scarf ends hang from the knot and flutter a little downwind
      float g = 0.6 + 0.3 * sin(t * 0.7) + 0.15 * sin(t * 2.3);
      vec3 rel = p - aPivot;
      vec3 push = uCWind * g * 0.06 + rgt * sin(t * 3.1 + w * 3.0) * 0.025 + fwd * sin(t * 2.3) * 0.015;
      p += push * w * w * 1.6;
      p += cross(upv, rel) * sin(t * 4.0 - w * 4.0) * 0.15 * w;
    }
    // the whole body: rail-leaners tip forward from the feet; the keenest hop; everyone sways foot to foot
    vec3 b = aBase.xyz;
    float lp = 0.17 * lean * (1.0 - ch * 0.8);
    vec3 r = p - b; r = cRot(r, rgt, lp); n = cRot(n, rgt, lp);
    p = b + r;
    float hop = max(0.0, sin(t * 5.4)) * 0.06 * ch * step(0.45, fract(seed * 2.17)) * (1.0 - lean * 0.7);
    p.y += hop;
    p += rgt * sin(t * 1.3) * 0.012 * (1.0 + ch) * (p.y - b.y);
  }
`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
type P3 = [number, number, number];

/** Collects one crowd's parts into flat arrays, with the attributes the vertex shader needs. */
class CrowdKit {
  geos: THREE.BufferGeometry[] = [];
  /** The person being built: their placement in the crowd, seed, yaw, size and stance. */
  M = new THREE.Matrix4(); seed = 0; yaw = 0; scale = 1; lean = 0; base = new THREE.Vector3();
  add(geo: THREE.BufferGeometry, color: string | THREE.Color, part: number, pivot: P3, x = 0, y = 0, z = 0, o: { r?: P3; s?: number | P3; w?: number; elbow?: P3; ink?: number } = {}) {
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(x, y, z), _q, _s).premultiply(this.M);
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose();
    const shade = g.attributes.color as THREE.BufferAttribute | undefined;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    g.applyMatrix4(_m);
    if (_s.x * _s.y * _s.z < 0) flip(g);
    this.tag(g, color, part, _p.set(...pivot).applyMatrix4(this.M).clone(), o.w ?? 0, o.elbow ? new THREE.Vector3(...o.elbow).applyMatrix4(this.M) : undefined, shade, o.ink ?? 1);
    this.geos.push(g);
  }
  tag(g: THREE.BufferGeometry, color: string | THREE.Color, part: number, pivot: THREE.Vector3, along: number | ((i: number) => number), elbow?: THREE.Vector3, shade?: THREE.BufferAttribute, ink = 1) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), piv = new Float32Array(n * 3), elb = new Float32Array(n * 3), info = new Float32Array(n * 4), base = new Float32Array(n * 4), inkA = new Float32Array(n);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      if (shade) { col[i * 3] *= shade.getX(i); col[i * 3 + 1] *= shade.getY(i); col[i * 3 + 2] *= shade.getZ(i); }
      pivot.toArray(piv, i * 3); (elbow ?? pivot).toArray(elb, i * 3);
      info.set([part, this.seed, this.yaw, typeof along === 'number' ? along : along(i)], i * 4);
      base.set([this.base.x, this.base.y, this.base.z, this.lean], i * 4);
      inkA[i] = ink;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    g.setAttribute('aElbow', new THREE.BufferAttribute(elb, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 4));
    g.setAttribute('aInk', new THREE.BufferAttribute(inkA, 1));
  }
  /** A short scarf end hanging from the knot (a narrow two-sided strip), `along` = 0 at the knot, 1 at the tip. */
  tail(knotLocal: P3, len: number, w: number, color: string, side: number, seed: number) {
    const N = 4, pos: number[] = [], nor: number[] = [], al: number[] = [], sh: number[] = [];
    const pt = (u: number, a: number, face: number): [number, number, number] => {
      // hanging down and a little out, curling softly
      const x = knotLocal[0] + side * (0.02 * u + 0.012 * Math.sin(u * 3 + seed)) + a * w * 0.5 * (1 - 0.35 * u);
      const y = knotLocal[1] - len * u;
      const z = knotLocal[2] + 0.012 + 0.03 * u * u + face * 0.003 + a * 0.01;
      return [x, y, z];
    };
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      for (const face of [1, -1]) {
        const quad: [number, number][] = [[u0, -1], [u1, -1], [u0, 1], [u1, -1], [u1, 1], [u0, 1]];
        if (face < 0) quad.reverse();
        for (const [u, a] of quad) { const notch = u === 1 && a > 0 ? 0.05 : 0; const v = pt(u - notch, a, face); pos.push(...v); nor.push(0, 0, face); al.push(u); sh.push(face > 0 ? 1 : 0.72); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.applyMatrix4(this.M);
    const knot = new THREE.Vector3(...knotLocal).applyMatrix4(this.M);
    this.tag(g, color, SCARF, knot, i => al[i], undefined, undefined, 0.6);
    const col = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < sh.length; i++) col.setXYZ(i, col.getX(i) * sh[i], col.getY(i) * sh[i], col.getZ(i) * sh[i]);
    this.geos.push(g);
  }
}

function flip(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute, n = a.itemSize, arr = a.array as Float32Array;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
  }
}

const sph = (r: number, w = 9, h = 7) => new THREE.SphereGeometry(r, w, h);
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];
/** A lathe (top-down [r, y] pairs) with fold shading in the vertex colours (cheap cloth); sz squashes the depth. */
function clothL(pts: [number, number][], n: number, folds: number, amt: number, seed: number, sz = 1, start?: number, len?: number) {
  const g = rlathe(pts, n, start, len);
  const pa = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pa.count * 3);
  const yTop = pts[0][1], yBot = pts[pts.length - 1][1];
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(x, z);
    const k = Math.max(0, Math.min(1, (yTop - y) / ((yTop - yBot) || 1)));
    const f = Math.sin(a * folds + seed);
    pa.setXYZ(i, x * (1 + amt * k * f), y + (y < yBot + 0.02 ? Math.sin(a * 3 + seed) * 0.008 : 0), z * (1 + amt * k * f) * sz);
    const v = 1 + 0.2 * k * Math.min(0, f) + 0.06 * k * Math.max(0, f);
    cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
/** A sphere pushed about by noise (hair clumps, buns, beards). */
function lumpy(r: number, seed: number, w = 7, h = 5) {
  const g = new THREE.SphereGeometry(r, w, h), pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 1 + 0.16 * Math.sin(x / r * 3 + seed) * Math.sin(z / r * 2.6 + y / r * 2 + seed * 1.3);
    pa.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** One person of the crowd, in their own frame (feet at 0, facing +z), in metres (scaled by the spot). */
function crowdPerson(k: CrowdKit, r: () => number, kid: boolean) {
  const C = WIND_COLORS;
  const build = kid ? 0 : Math.floor(r() * 3); // slim, medium, broad
  const B = [1.0, 1.15, 1.35][build];
  const LL = kid ? 0.56 : 0.68 + r() * 0.06, TL = kid ? 0.4 : 0.48 + r() * 0.04;
  const skin = pick(r, C.skins), hair = pick(r, C.hairs), shirt = pick(r, C.shirts), coat = pick(r, C.coats), sc = pick(r, C.scarves), tr = pick(r, C.trousers);
  const style = Math.floor(r() * 4); // 0 waistcoat, 1 long coat, 2 dress, 3 smock and braces
  const rolled = r() < 0.35;
  const O: P3 = [0, 0, 0];
  const be = build === 2 && r() < 0.6 ? 0.025 : 0;
  // ---- legs: tapered tubes and round boots (mostly hidden behind the fence and the row in front)
  const boot = pick(r, ['#5a3a24', '#4a3020', '#7a5034']);
  for (const s of [-1, 1]) {
    const x = 0.07 * s * B;
    k.add(clothL([[0.064 * B, LL + 0.03], [0.06 * B, LL - LL * 0.25], [0.048 * B, LL - LL * 0.5], [0.05 * B, LL - LL * 0.65], [0.036 * B, 0.08], [0.0, 0.07]], 7, 0, 0, 0), style === 2 ? '#5a5048' : tr, BODY, O, x, 0, 0, { ink: 0.8 });
    k.add(sph(0.055, 8, 5), boot, BODY, O, x, 0.04, 0.03, { s: [0.9 * B, 0.7, 1.6], ink: 0.8 });
  }
  const T = LL, top = T + TL;
  // ---- the torso: hips, a soft waist, a full chest and a round yoke over the shoulders
  const tw = (f: number) => f * B;
  const prof: [number, number][] = [[0.0, top + 0.004], [0.05 + 0.012 * B, top], [tw(0.098), top - 0.025], [tw(0.13), top - 0.065], [tw(0.136), top - 0.12], [tw(0.128), T + TL * 0.55], [tw(0.118) + be, T + TL * 0.3], [tw(0.126) + be * 0.5, T + 0.04], [tw(0.124), T - 0.03], [tw(0.08), T - 0.08], [0.0, T - 0.09]];
  const body = style === 3 ? shirt : style === 0 ? shirt : coat;
  k.add(clothL(prof, 12, 4, 0.02, 1, 0.78), body, BODY, O, 0, 0, 0);
  // ---- the garment over it
  const fz = tw(0.128) * 0.78;
  if (style === 0) {
    // a waistcoat, open over the shirt
    k.add(clothL([[tw(0.1), top - 0.02], [tw(0.138), top - 0.08], [tw(0.132), T + TL * 0.5], [tw(0.13) + be, T + 0.02], [tw(0.13), T - 0.04]], 12, 3, 0.03, r() * 6, 0.8, Math.PI + 0.35, Math.PI * 2 - 0.7), coat, BODY, O, 0, 0, 0, { s: [1.04, 1, 1.04] });
  }
  if (style === 1) k.add(clothL([[tw(0.13), T + 0.06], [tw(0.136), T - 0.05], [tw(0.17), T - 0.24], [tw(0.2), T - 0.4]], 12, 5, 0.12, r() * 6, 0.82, Math.PI + 0.3, Math.PI * 2 - 0.6), coat, BODY, O, 0, 0, 0);
  if (style === 2) k.add(clothL([[tw(0.126), T + 0.06], [tw(0.136), T - 0.05], [tw(0.18), T - 0.3], [0.24 * B, T - LL + 0.08]], 13, 6, 0.1, r() * 6, 0.84), coat, BODY, O, 0, 0, 0);
  if (style === 3) {
    k.add(clothL([[tw(0.13), T + 0.05], [tw(0.134), T - 0.04], [tw(0.13), T - 0.1]], 10, 3, 0.04, 0, 0.8), tr, BODY, O, 0, 0, 0);
    for (const sx of [-1, 1]) for (const zz of [1, -1]) k.add(new THREE.BoxGeometry(0.022, TL * 0.82, 0.01), '#6e4528', BODY, O, sx * 0.055 * B, T + TL * 0.5, zz * (fz + 0.004), { r: [0.06 * zz, 0, 0], ink: 0.5 });
  }
  if (style !== 2 && style !== 3) k.add(new THREE.CylinderGeometry(tw(0.13), tw(0.13), 0.035, 12, 1, true), '#6e4528', BODY, O, 0, T + 0.06, 0, { s: [1.02, 1, 0.82], ink: 0.6 });
  if (r() < 0.3 && style !== 1) {
    // an apron for some
    k.add(clothL([[tw(0.13), T + 0.08], [tw(0.15), T - 0.1], [tw(0.18), T - 0.36]], 9, 3, 0.05, 2, 0.86, -0.9, 1.8), pick(r, ['#e8dcc0', '#d8ccb0', '#c8b898']), BODY, O, 0, 0, 0, { s: [1.03, 1, 1.03] });
  }
  // ---- arms: the round of the shoulder, a tapered sleeve, a forearm (sleeve or rolled up), a cuff, a mitten
  const aR = 0.046 * B, upL = 0.25 * (kid ? 0.85 : 1), foL = 0.23 * (kid ? 0.85 : 1);
  const sleeve = style === 3 || style === 0 ? shirt : coat;
  for (const s of [-1, 1]) {
    const sx = tw(0.126) * s, sy = top - 0.07;
    const sh: P3 = [sx, sy, 0], el: P3 = [sx, sy - upL, 0];
    const UP = s < 0 ? ARM_L : ARM_R, FO = s < 0 ? FORE_L : FORE_R;
    k.add(sph(aR * 1.32, 9, 7), sleeve, UP, sh, sx + s * 0.006, sy - 0.01, 0, { s: [1, 1.05, 0.95] });
    k.add(clothL([[aR * 1.05, sy + 0.02], [aR * 1.15, sy - 0.03], [aR * 1.02, sy - upL * 0.6], [aR * 0.92, sy - upL - 0.015], [0.0, sy - upL - 0.03]], 8, 3, 0.06, s, 1), sleeve, UP, sh, sx, 0, 0);
    const foreC = rolled ? skin : sleeve;
    k.add(clothL([[aR * 0.92, sy - upL + 0.025], [aR * 0.9, sy - upL - foL * 0.3], [aR * 0.74, sy - upL - foL], [0.0, sy - upL - foL - 0.01]], 8, 0, 0, 0), foreC, FO, sh, sx, 0, 0, { elbow: el });
    if (rolled) k.add(new THREE.TorusGeometry(aR * 0.98, 0.014, 4, 9), sleeve, UP, sh, sx, sy - upL + 0.01, 0, { r: [Math.PI / 2, 0, 0] });
    else k.add(new THREE.TorusGeometry(aR * 0.8, 0.01, 4, 9), new THREE.Color(sleeve).multiplyScalar(0.85), FO, sh, sx, sy - upL - foL + 0.012, 0, { r: [Math.PI / 2, 0, 0], elbow: el, ink: 0.5 });
    // the mitten: a flat palm with the fingers as one rounded block, and a thumb on the front edge
    const hy = sy - upL - foL - 0.045;
    k.add(sph(0.04, 9, 7), skin, FO, sh, sx, hy, 0.0, { s: [0.55, 1.2, 0.95], elbow: el });
    k.add(new THREE.CapsuleGeometry(0.012, 0.022, 2, 6), skin, FO, sh, sx - s * 0.006, hy + 0.012, 0.03, { r: [0.7, 0, -0.4 * s], elbow: el, ink: 0.8 });
  }
  // ---- the scarf: a bunched cowl with a knot and two short ends hanging from it
  const nr = 0.045 + 0.01 * B;
  const side = r() < 0.5 ? 1 : -1;
  const cw = cowl({ rx: Math.max(nr + 0.035, tw(0.1) * 0.62), rz: Math.max(nr + 0.03, tw(0.1) * 0.6), drop: 0.04, hh: 0.028, th: 0.022, seed: r() * 5, rolls: 2.2, side, N: 18, M: 8 });
  k.add(cw, sc, BODY, O, 0, top + 0.006, 0.004);
  const ka = 0.42 * side, kx = Math.sin(ka) * (tw(0.1) * 0.62 + 0.02), kz = Math.cos(ka) * (tw(0.1) * 0.6 + 0.03), ky = top - 0.035;
  k.add(flatKnot(0.026, r() * 4), sc, BODY, O, kx, ky, kz, { r: [-0.5, ka * 0.8, 0.3 * side], ink: 0.7 });
  k.tail([kx, ky - 0.01, kz], 0.16 + r() * 0.08, 0.05, sc, side, r() * 6);
  k.tail([kx + 0.012 * side, ky - 0.012, kz - 0.004], 0.11 + r() * 0.06, 0.045, sc, -side * 0.5, r() * 6);
  // ---- neck and head: everything on the head turns about the neck
  const R = (kid ? 0.15 : 0.145) * (1 + r() * 0.06);
  const hy = top + 0.045, hp: P3 = [0, hy, 0];
  k.add(new THREE.CylinderGeometry(nr * 0.85, nr, 0.08, 7, 1, true), skin, HEAD, hp, 0, top + 0.02, 0, { ink: 0 });
  const HC = new THREE.Vector3(0, hy + R * 0.92, R * 0.12);
  const at = (d: THREE.Vector3, lift: number) => headPt(d.normalize(), lift, new THREE.Vector3(), R, HC);
  const skull = new THREE.SphereGeometry(1, 14, 11), spa = skull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < spa.count; i++) { const v = at(new THREE.Vector3().fromBufferAttribute(spa, i), 0); spa.setXYZ(i, v.x, v.y, v.z); }
  skull.computeVertexNormals();
  k.add(skull, skin, HEAD, hp);
  for (const s of [-1, 1]) {
    // ears
    k.add(sph(R * 0.22, 6, 5), skin, HEAD, hp, s * R * 0.86, HC.y - R * 0.14, HC.z - R * 0.1, { s: [0.42, 1.05, 0.72], r: [0, -0.35 * s, -0.12 * s], ink: 0.6 });
    // dark painted eyes like the World 1 villagers (a tall oval and a glint), brows, a soft cheek tint
    const e = at(new THREE.Vector3(0.44 * s, -0.15, 0.88), 0.002);
    k.add(sph(R * 0.11, 7, 6), '#2e2226', HEAD, hp, e.x, e.y, e.z, { r: [0.12, 0.42 * s, 0], s: [0.8, 1.3, 0.3], ink: 0 });
    const gl = at(new THREE.Vector3(0.47 * s, -0.08, 0.88), 0.006);
    k.add(sph(R * 0.035, 4, 3), '#ffffff', HEAD, hp, gl.x, gl.y, gl.z, { s: [1, 1, 0.4], ink: 0 });
    const b = at(new THREE.Vector3(0.44 * s, 0.13, 0.9), 0.006);
    k.add(new THREE.BoxGeometry(R * 0.3, R * 0.07, 0.008), hair, HEAD, hp, b.x, b.y, b.z, { r: [0, 0.42 * s, -0.12 * s], ink: 0 });
    const bl = at(new THREE.Vector3(0.52 * s, -0.42, 0.8), 0.002);
    k.add(sph(R * 0.11, 6, 4), new THREE.Color(skin).lerp(new THREE.Color('#e8807a'), 0.4), HEAD, hp, bl.x, bl.y, bl.z, { r: [0, 0.5 * s, 0], s: [1.1, 0.6, 0.15], ink: 0 });
  }
  // the nose: a round button on the bridge
  const np = at(new THREE.Vector3(0, -0.4, 0.95), 0);
  k.add(sph(R * 0.09, 7, 5), new THREE.Color(skin).multiplyScalar(0.97), HEAD, hp, np.x, np.y, np.z - R * 0.03, { s: [1, 0.85, 0.9], ink: 0 });
  // the mouth (it opens into a shout about its own centre): dark, with a tongue
  const mp = at(new THREE.Vector3(0, -0.7, 0.75), 0.002);
  const mc: P3 = [mp.x, mp.y, mp.z];
  k.add(sph(R * 0.12, 7, 5), '#5a2228', MOUTH, hp, mp.x, mp.y, mp.z, { s: [1.3, 0.5, 0.3], r: [0.45, 0, 0], elbow: mc, ink: 0 });
  k.add(sph(R * 0.07, 6, 4), '#d8707a', MOUTH, hp, mp.x, mp.y - R * 0.03, mp.z + 0.003, { s: [1.3, 0.5, 0.3], r: [0.45, 0, 0], elbow: mc, ink: 0 });
  // ---- hair: a cap that follows the skull, a fringe of clumps, buns, beards
  const cap = new THREE.SphereGeometry(1, 14, 10), cpa = cap.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cpa.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(cpa, i).normalize();
    const line = d.z > 0 ? -0.2 + 0.62 * smooth(0.2, 0.85, d.z) : -0.2 - 0.5 * smooth(0, 0.7, -d.z);
    const v = at(d, d.y < line ? -R * 0.15 : R * 0.08); cpa.setXYZ(i, v.x, v.y, v.z);
  }
  cap.computeVertexNormals();
  k.add(cap, hair, HEAD, hp);
  for (let i = -2; i <= 2; i++) { const f = at(new THREE.Vector3(i * 0.24, 0.45 - Math.abs(i) * 0.06, 0.85), R * 0.06); k.add(lumpy(R * 0.2, i + r() * 5), hair, HEAD, hp, f.x, f.y, f.z, { s: [1.15, 0.7, 0.55], r: [0.4, 0, i * 0.4], ink: 0.6 }); }
  // headwear: straw hats on about half, then caps, knotted kerchiefs and bare heads
  const hw = r();
  const hat = hw < 0.45 ? 'straw' : hw < 0.6 ? 'cap' : hw < 0.76 ? 'kerchief' : 'bare';
  if (hat === 'bare' || hat === 'kerchief') {
    if (style === 2 || r() < 0.3) { const b = at(new THREE.Vector3(0, 0.45, -0.85), R * 0.25); k.add(lumpy(R * 0.4, 3), hair, HEAD, hp, b.x, b.y, b.z, { ink: 0.7 }); }
    else for (let i = 0; i < 4; i++) { const f = at(new THREE.Vector3(Math.sin(i * 1.7) * 0.6, 0.85, Math.cos(i * 1.7) * 0.5 - 0.2), R * 0.05); k.add(lumpy(R * 0.26, i * 2.3), hair, HEAD, hp, f.x, f.y, f.z, { s: [1.1, 0.7, 1], ink: 0.6 }); }
  }
  if (!kid && style !== 2 && r() < 0.28) {
    // a short beard of clumps along the jaw, and a moustache
    for (let i = 0; i < 7; i++) { const a = -1.3 + (i / 6) * 2.6; const bp = at(new THREE.Vector3(Math.sin(a) * 0.9, -0.55 - 0.25 * Math.cos(a), Math.cos(a) * 0.8), -R * 0.04); k.add(lumpy(R * 0.27, i), hair, HEAD, hp, bp.x, bp.y, bp.z, { s: [1, 0.9, 0.8], ink: 0.7 }); }
    for (const s of [-1, 1]) { const mm = at(new THREE.Vector3(0.14 * s, -0.56, 0.96), 0.004); k.add(sph(R * 0.12, 6, 4), hair, HEAD, hp, mm.x, mm.y, mm.z, { s: [1.5, 0.55, 0.6], r: [0, 0, 0.35 * s], ink: 0.5 }); }
  }
  const hz = HC.z - R * 0.06;
  if (hat === 'straw') {
    // the brim rests just above the brow, the crown fits over the skull
    const Rb = R * (1.6 + r() * 0.35), cr = R * 1.02, ch = R * (0.78 + r() * 0.2), tilt = (r() - 0.5) * 0.22;
    const hyy = HC.y + R * 0.34, o = { r: [-0.14 + r() * 0.08, 0, tilt] as P3 };
    k.add(clothL([[cr * 0.96, 0.006], [cr * 1.06, 0.0], [Rb * 0.75, -0.022], [Rb, -0.046], [Rb * 0.97, -0.052], [cr * 0.98, -0.008], [cr * 0.96, 0.0]], 16, 5, 0.05, r() * 5), '#e9c877', HEAD, hp, 0, hyy, hz, o);
    k.add(clothL([[0.0, ch + 0.008], [cr * 0.7, ch], [cr * 0.94, ch * 0.7], [cr, 0.0]], 12, 0, 0, 0), '#e2bf6c', HEAD, hp, 0, hyy, hz, o);
    k.add(new THREE.CylinderGeometry(cr * 1.02, cr * 1.035, ch * 0.32, 12, 1, true), pick(r, WIND_COLORS.bands), HEAD, hp, 0, hyy + ch * 0.16, hz, { ...o, ink: 0.5 });
  } else if (hat === 'cap') {
    // a soft cloth cap with a short peak
    const cc = pick(r, ['#6b6f7a', '#7a5a44', '#5f6e5c', '#8a6a4a', '#4e566a']);
    const cg = new THREE.SphereGeometry(R * 1.12, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
    k.add(cg, cc, HEAD, hp, 0, HC.y + R * 0.18, hz, { s: [1.02, 0.72, 1.05], r: [-0.12, 0, 0] });
    const pk = new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.012, 12, 1, false, -0.9, 1.8);
    k.add(pk, new THREE.Color(cc).multiplyScalar(0.85), HEAD, hp, 0, HC.y + R * 0.2, hz + R * 0.35, { s: [1, 1, 0.9], r: [0.15, 0, 0] });
  } else if (hat === 'kerchief') {
    // a knotted kerchief in a festival colour over the crown, its knot and ends at the back
    const kc = pick(r, ['#d8452e', '#2f9a9a', '#e8b030', '#3f72b8', '#e2783a']);
    const kg = new THREE.SphereGeometry(R * 1.1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52);
    k.add(kg, kc, HEAD, hp, 0, HC.y + R * 0.12, hz - R * 0.02, { s: [1.0, 0.85, 1.05], r: [-0.3, 0, 0] });
    const kb = at(new THREE.Vector3(0, 0.1, -1), R * 0.08);
    k.add(lumpy(R * 0.2, 2), kc, HEAD, hp, kb.x, kb.y, kb.z, { s: [1.3, 0.8, 0.8] });
    for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(R * 0.12, R * 0.6, 4), kc, HEAD, hp, kb.x + s * R * 0.12, kb.y - R * 0.3, kb.z - R * 0.05, { r: [Math.PI - 0.3, 0, 0.3 * s], s: [1, 1, 0.3] });
  }
}

/** Toon + painted look (and the warm back-light of the windfolk), with the crowd's vertex shader on top. */
function crowdMaterial(U: Record<string, THREE.IUniform>) {
  const m = backLit(paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.55, rim: 0.6 }), 0.5, 0.36);
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
  m.customProgramCacheKey = () => key + '_crowd3';
  return m;
}

/** The ink edge for the crowd: the same deformation, pushed out along the normal by the part's ink, back faces. */
function crowdInk(U: Record<string, THREE.IUniform>, width: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#3a2a2e') }, uW: { value: width } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uW;
      attribute float aInk;
      ${DEFORM}
      void main(){
        if (aInk < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 p = position; vec3 n = normal; crowdDeform(p, n);
        vec4 mvPosition = modelViewMatrix * vec4(p + normalize(n) * uW * aInk, 1.0);
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
      const H = sp.scale ?? (kid ? 0.92 + r() * 0.08 : 0.97 + r() * 0.1);
      k.M.compose(sp.pos, _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), _s.setScalar(H));
      k.seed = (i * 0.618 + r()) % 1; k.yaw = yaw; k.scale = H; k.lean = sp.lean ? 1 : 0; k.base.copy(sp.pos);
      crowdPerson(k, r, kid);
    });
    let g = mergeGeometries(k.geos, false)!;
    k.geos.forEach(x => x.dispose());
    g = mergeVertices(g, 1e-5);
    g.computeBoundingSphere(); g.boundingSphere!.radius += 1.5; // arms and scarves reach out of the rest pose
    this.triangles = (g.index ? g.index.count : g.attributes.position.count) / 3;
    this.mesh = new THREE.Mesh(g, crowdMaterial(this.U));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // shadows follow the cheering arms too
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DEFORM)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 cN = normal; crowdDeform(transformed, cN);');
    };
    depth.customProgramCacheKey = () => 'crowdDepth3';
    this.mesh.customDepthMaterial = depth;
    const ink = new THREE.Mesh(g, crowdInk(this.U, 0.008));
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
