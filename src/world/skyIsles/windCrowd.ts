import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, softRamp } from '../../render/paint';
import { SKY_WIND } from './windScarf';
import { mulberry, WIND_COLORS } from './windfolk';

// The cheering crowd of the Sky Isles: 40-80 windfolk lining the cliffs and fences at the race.
//
// Every person is a small, simpler cousin of the hand-built windfolk (same proportions, colours, straw hats,
// scarves and face), and the whole crowd is merged into ONE mesh with vertex colours: one draw call for the
// people, one for their ink outline, and a shadow pass. Nothing moves on the CPU: each vertex knows which
// part it belongs to (body, left arm, right arm, head, scarf tail, mouth), the joint it turns about, and
// whose it is, and the vertex shader raises the arms, waves them, hops, tips the head up, opens the mouth and
// streams the scarf in the wind. update() only sets three uniforms.
// About 560 triangles a person: 60 people are about 34k triangles.

export interface CrowdSpot {
  /** Where the person stands (feet), in the crowd root's frame (y up). */
  pos: THREE.Vector3;
  /** Which way they face: a yaw angle (radians, 0 = +z) or a direction. */
  facing: number | THREE.Vector3;
  /** Optional overall size (1 = adult). Children are made by the seed if not given. */
  scale?: number;
}

// parts, written into aInfo.x
const BODY = 0, ARM_L = 1, ARM_R = 2, HEAD = 3, SCARF = 4, MOUTH = 5;

const DEFORM = /* glsl */ `
  attribute vec3 aPivot;
  attribute vec4 aInfo;   // part, seed, yaw, along (scarf)
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
    if (part > 0.5 && part < 2.5) {
      float s = part < 1.5 ? -1.0 : 1.0;
      // one-armed wavers and two-armed cheerers
      float lift = ch * (s > 0.0 ? 1.0 : step(0.3, fract(seed * 5.13)));
      float wave = sin(t * 7.0 + s * 1.3) * 0.28 * lift;
      float a = 0.06 + idle * 0.03 + lift * 2.5 + wave;
      vec3 q = cRot(p - aPivot, fwd, -a * s);
      q = cRot(q, rgt, -0.35 * lift - 0.1 * (1.0 - lift));
      p = aPivot + q;
      n = cRot(cRot(n, fwd, -a * s), rgt, -0.35 * lift - 0.1 * (1.0 - lift));
    } else if (part > 2.5 && part < 3.5 || part > 4.5) {
      // the head (and everything on it) tips up to watch the racers, and looks about when idle
      if (part > 4.5) {
        // the mouth: its centre is packed into w as (height above the neck * 1000) + forward; it opens into a shout
        vec3 c = aPivot + vec3(0.0, floor(w) / 1000.0, 0.0) + fwd * fract(w);
        float o = 1.0 + ch * (1.8 + 0.9 * sin(t * 6.0));
        p = c + (p - c) * vec3(1.0, o, 1.0);
      }
      float a = -0.32 * ch + 0.05 * idle;
      float turn = sin(t * 0.37) * 0.25 * (1.0 - ch);
      vec3 q = cRot(p - aPivot, rgt, a);
      q = cRot(q, vec3(0.0, 1.0, 0.0), turn);
      p = aPivot + q;
      n = cRot(cRot(n, rgt, a), vec3(0.0, 1.0, 0.0), turn);
    } else if (part > 3.5 && part < 4.5) {
      // the scarf tail is stored flat as (along, across, through) from its knot; stream it downwind
      vec3 rel = p - aPivot;
      float g = 1.0 + 0.25 * sin(t * 1.7);
      vec3 wd = normalize(uCWind * g + vec3(0.0, -1.0 - 1.6 * w, 0.0) * 0.6 + rgt * 0.4 * sin(t * 1.1));
      vec3 side = normalize(vec3(0.0, 1.0, 0.0) - wd * wd.y);
      float rip = (sin(w * 9.0 - t * 11.0) * 0.06 + sin(w * 15.0 - t * 17.0) * 0.025) * w;
      side = cRot(side, wd, sin(w * 4.0 - t * 2.5) * 0.5 * w);
      vec3 nn = normalize(cross(wd, side));
      p = aPivot + wd * rel.x + side * rel.y + nn * (rel.z + rip);
      n = nn * sign(n.z + 1e-4);
    }
    // the whole body: a little hop for the keenest, a sway from foot to foot for the rest
    float hop = max(0.0, sin(t * 5.4)) * 0.075 * ch * step(0.45, fract(seed * 2.17));
    p.y += hop;
    p += rgt * sin(t * 1.3) * 0.012 * (1.0 + ch);
  }
`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** Collects one crowd's parts into flat arrays, with the attributes the vertex shader needs. */
class CrowdKit {
  geos: THREE.BufferGeometry[] = [];
  /** The person being built: their placement in the crowd, and their seed and yaw. */
  M = new THREE.Matrix4(); seed = 0; yaw = 0; scale = 1;
  add(geo: THREE.BufferGeometry, color: string, part: number, pivot: [number, number, number], x = 0, y = 0, z = 0, o: { r?: [number, number, number]; s?: number | [number, number, number]; w?: number } = {}) {
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(x, y, z), _q, _s).premultiply(this.M);
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(_m);
    this.tag(g, color, part, _p.set(...pivot).applyMatrix4(this.M), o.w ?? 0);
    this.geos.push(g);
  }
  tag(g: THREE.BufferGeometry, color: string, part: number, pivot: THREE.Vector3, along: number | ((i: number) => number)) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), piv = new Float32Array(n * 3), info = new Float32Array(n * 4);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      _c.toArray(col, i * 3); pivot.toArray(piv, i * 3);
      info.set([part, this.seed, this.yaw, typeof along === 'number' ? along : along(i)], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  }
  /** A scarf tail, stored flat (along, across, through) relative to its knot; the shader streams it. */
  tail(pivotLocal: [number, number, number], len: number, w: number, color: string, end: string) {
    const N = 6, pos: number[] = [], nor: number[] = [], al: number[] = [], cols: string[] = [];
    const knot = new THREE.Vector3(...pivotLocal).applyMatrix4(this.M);
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, c = u1 > 0.86 ? end : color;
      for (const face of [1, -1]) {
        const z = face * 0.006;
        const quad = [[u0, -1], [u1, -1], [u0, 1], [u1, -1], [u1, 1], [u0, 1]];
        if (face < 0) quad.reverse();
        for (const [u, a] of quad) { pos.push(knot.x + u * len, knot.y + a * w * 0.5 * (1 - 0.15 * u), knot.z + z); nor.push(0, 0, face); al.push(u); cols.push(c); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.tag(g, color, SCARF, knot, i => al[i]);
    const col = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < cols.length; i++) { _c.set(cols[i]); col.setXYZ(i, _c.r, _c.g, _c.b); }
    this.geos.push(g);
  }
}

const cap = (r: number, l: number, rs = 7, cs = 2) => new THREE.CapsuleGeometry(r, l, cs, rs);
const sph = (r: number, w = 9, h = 7) => new THREE.SphereGeometry(r, w, h);
// profiles are written top-down like the villagers'; reversed so the faces wind outwards (the crowd is single-sided)
const lathe = (pts: [number, number][], n = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), n);
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];

/** One person of the crowd, in their own frame (feet at 0, facing +z), in Person units (H = 1). Low-poly. */
function crowdPerson(k: CrowdKit, r: () => number, kid: boolean) {
  const C = WIND_COLORS;
  const B = kid ? 0.82 : 0.8 + r() * 0.45, HS = (kid ? 1.25 : 1.05) + r() * 0.1, LL = kid ? 0.95 : 0.95 + r() * 0.2;
  const skin = pick(r, C.skins), hair = pick(r, C.hairs), shirt = pick(r, C.shirts), vest = pick(r, C.vests), sc = pick(r, C.scarves), tr = pick(r, C.trousers);
  const dress = r() < 0.4, hat = r() < (kid ? 0.4 : 0.72), rolled = r() < 0.4;
  const hipY = 0.095 + 0.785 * LL;
  const O: [number, number, number] = [0, 0, 0];
  // legs and boots
  for (const s of [-1, 1]) {
    k.add(cap(0.08 * B, hipY - 0.25, 5, 1), dress ? '#4e4a5a' : tr, BODY, O, 0.09 * s * B, hipY / 2 + 0.06, 0);
    k.add(sph(0.08, 6, 4), '#5a3a24', BODY, O, 0.09 * s * B, 0.055, 0.04, { s: [0.95, 0.7, 1.45] });
  }
  const T = hipY; // torso origin
  // a tunic or waistcoat over the shirt (a dress reaches the knees), the shirt showing at the front
  const len = dress ? -0.58 : -0.1;
  k.add(lathe([[0.1, 0.52], [0.18 * B, 0.47], [0.205 * B, 0.3], [0.21 * B, 0.05], [(dress ? 0.3 : 0.21) * B, len], [0.0, len]], 9), vest, BODY, O, 0, T, 0, { s: [1, 1, 0.86] });
  k.add(new THREE.BoxGeometry(0.09 * B, 0.34, 0.02), shirt, BODY, O, 0, T + 0.26, 0.172 * B);
  k.add(new THREE.CylinderGeometry(0.212 * B, 0.212 * B, 0.04, 9, 1, true), '#6e4528', BODY, O, 0, T + 0.07, 0, { s: [1, 1, 0.88] });
  // arms: one rigid piece each, hung from the shoulder; the shader lifts them
  for (const s of [-1, 1]) {
    const sx = 0.2 * s * B, sy = T + 0.42, part = s < 0 ? ARM_L : ARM_R;
    const piv: [number, number, number] = [sx, sy, 0];
    k.add(cap(0.062 * B, rolled ? 0.22 : 0.4, 5, 1), shirt, part, piv, sx, sy - (rolled ? 0.13 : 0.22), 0);
    if (rolled) k.add(cap(0.05 * B, 0.15, 5, 1), skin, part, piv, sx, sy - 0.37, 0.0);
    k.add(sph(0.052, 5, 4), skin, part, piv, sx, sy - 0.52, 0.01, { s: [0.9, 1.1, 0.75] });
  }
  // scarf knot (the tail is added below)
  k.add(new THREE.TorusGeometry(0.1 * B, 0.045, 4, 8), sc, BODY, O, 0, T + 0.49, 0, { r: [Math.PI / 2 + 0.1, 0, 0] });
  // head: everything on it turns about the neck
  const hy = T + 0.57, hp: [number, number, number] = [0, hy, 0];
  const H = (y: number) => hy + y * HS;
  k.add(sph(0.168 * HS, 10, 7), skin, HEAD, hp, 0, H(0.16), 0.01 * HS, { s: [1.02, 1.05, 1] });
  for (const s of [-1, 1]) {
    k.add(sph(0.026 * HS, 4, 3), '#2a2230', HEAD, hp, 0.062 * s * HS, H(0.185), 0.152 * HS, { s: [0.85, 1.35, 0.5] });
    k.add(sph(0.026 * HS, 4, 3), '#ef9e92', HEAD, hp, 0.095 * s * HS, H(0.125), 0.14 * HS, { s: [1.2, 0.75, 0.4] });
    k.add(new THREE.BoxGeometry(0.055 * HS, 0.014 * HS, 0.012), hair, HEAD, hp, 0.062 * s * HS, H(0.238), 0.155 * HS, { r: [0, 0, -0.12 * s] });
  }
  // the mouth turns with the head, about the neck; its own centre (scaled to the crowd) rides in w
  const mH = k.scale;
  k.add(sph(0.022 * HS, 5, 3), '#5a2a30', MOUTH, hp, 0, H(0.1), 0.158 * HS, { s: [1.3, 0.6, 0.4], w: Math.floor(0.1 * HS * mH * 1000) + 0.158 * HS * mH });
  // hair: a cap, and a bun or a beard for some
  k.add(sph(0.176 * HS, 9, 6), hair, HEAD, hp, 0, H(0.215), -0.04 * HS, { s: [1.04, 0.88, 1.05] });
  if (dress && !hat) k.add(sph(0.08 * HS, 6, 4), hair, HEAD, hp, 0, H(0.3), -0.15 * HS);
  if (!dress && !kid && r() < 0.3) k.add(sph(0.12 * HS, 7, 4), hair, HEAD, hp, 0, H(0.07), 0.06 * HS, { s: [1.1, 0.8, 0.9] });
  // a straw hat with a coloured band
  if (hat) {
    const R = (0.28 + r() * 0.1) * HS, cr = (0.1 + r() * 0.05) * HS, hy2 = H(0.29), tilt = (r() - 0.5) * 0.3;
    const o = { r: [-0.1, 0, tilt] as [number, number, number] };
    k.add(lathe([[0.0, 0.0], [R * 0.8, -0.03], [R, -0.065], [0.13 * HS, -0.02], [0.0, -0.02]], 12), '#e8c46e', HEAD, hp, 0, hy2, 0, o);
    k.add(new THREE.CylinderGeometry(0.135 * HS, 0.15 * HS, cr, 9), '#e8c46e', HEAD, hp, 0, hy2 + cr / 2, 0, o);
    k.add(new THREE.CylinderGeometry(0.153 * HS, 0.153 * HS, 0.04, 9, 1, true), pick(r, WIND_COLORS.bands), HEAD, hp, 0, hy2 + 0.025, 0, o);
  }
  k.tail([-0.06 * B, T + 0.47, -0.12 * B], 0.55 + r() * 0.35, 0.09, sc, '#f2ead6');
}

/** Toon + painted look, with the crowd's vertex shader on top. */
function crowdMaterial(U: Record<string, THREE.IUniform>) {
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.5 });
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
  m.customProgramCacheKey = () => key + '_crowd';
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
        vec4 mvPosition = modelViewMatrix * vec4(p + normalize(n) * uW, 1.0);
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
      const kid = sp.scale === undefined ? r() < 0.22 : sp.scale < 0.8;
      const H = sp.scale ?? (kid ? 0.66 + r() * 0.08 : 0.86 + r() * 0.2);
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
    depth.customProgramCacheKey = () => 'crowdDepth';
    this.mesh.customDepthMaterial = depth;
    const ink = new THREE.Mesh(g, crowdInk(this.U, 0.011));
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
    this.U.uCWind.value.copy(air).transformDirection(this.inv).multiplyScalar(air.length() * 0.3);
  }

  dispose() { this.mesh.geometry.dispose(); }
}
