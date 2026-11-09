import * as THREE from 'three';
import { paint, softRamp, PAINT } from '../../render/paint';
import { Kit, T, rng, pick, chainCompile, type Rnd } from './sailtownKit';
import { vnoise, GRASS } from './sailtownFlora';
import { addIvy, addLeafMass, type WallPoint } from './sailtownGreen';

/**
 * The land and sky around Sailtown, as the lab (and any scene that needs them before the island and sky builders land)
 * shows them: a floating isle with an organic rim, a craggy cliff of cream and pale-gold strata (chunky ledges, a lip
 * that overhangs, moss on every shelf, vines hanging, a rocky underside tapering to a point), a painted meadow ground
 * with flower drifts, an arcing waterfall, far isles with their own little villages, and painted cumulus.
 *
 *   const isle = floatingIsle({ center: [0, 0], rim: [[20, 0], [0, 18], ...], top: (x, z) => 0 });
 *   scene.add(isle.group);   isle.inside(x, z), isle.rimAt(angle)...
 *   const clouds = new CloudField(); clouds.heap(...); clouds.sea(...); scene.add(clouds.build());
 *   each frame: clouds.update(camera);   waterfall uniforms tick on PAINT.uTime.
 *
 * Nothing here is inked by hulls: the finish pass draws the island's silhouettes; clouds and water write no depth, so
 * they carry no ink at all, as in the pictures.
 */

// ---------------------------------------------------------------- rim

/**
 * A closed rim as a radius per angle round a centre, from control points (x, z) given in any order (they are sorted
 * by angle; the shape must be star-shaped from the centre), interpolated smoothly, with a little noise on top so no
 * stretch is ever a ruler line.
 */
export class Rim {
  readonly cx: number; readonly cz: number;
  private ang: number[] = []; private rad: number[] = [];
  private seed: number; private rough: number;
  constructor(center: [number, number], points: [number, number][], seed = 1, rough = 0.6) {
    this.cx = center[0]; this.cz = center[1]; this.seed = seed; this.rough = rough;
    const pr = points.map(([x, z]) => [Math.atan2(z - this.cz, x - this.cx), Math.hypot(x - this.cx, z - this.cz)] as [number, number]);
    pr.sort((p, q) => p[0] - q[0]);
    for (const [a, r] of pr) { this.ang.push(a); this.rad.push(r); }
  }
  /** Radius at angle a (radians, atan2(z, x) convention). */
  r(a: number) {
    const A = this.ang, R = this.rad, n = A.length, TAU = Math.PI * 2;
    a = ((a - A[0]) % TAU + TAU) % TAU + A[0];
    let i = 0; while (i < n - 1 && A[i + 1] <= a) i++;
    const a0 = A[i], a1 = i + 1 < n ? A[i + 1] : A[0] + TAU;
    const t = (a - a0) / (a1 - a0);
    const p0 = R[(i - 1 + n) % n], p1 = R[i], p2 = R[(i + 1) % n], p3 = R[(i + 2) % n];
    // Catmull-Rom, clamped to the neighbours so it never overshoots into a spike
    let v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    v = Math.min(Math.max(v, Math.min(p1, p2) - 1.5), Math.max(p1, p2) + 1.5);
    const s = this.seed, k = this.rough;
    return v + k * (Math.sin(a * 9 + s) * 0.5 + Math.sin(a * 23 + s * 2.3) * 0.3 + Math.sin(a * 51 + s * 4.1) * 0.15) * Math.min(1, v / 12);
  }
  /** Signed distance-ish to the rim along the ray from the centre: negative inside. */
  dist(x: number, z: number) { const a = Math.atan2(z - this.cz, x - this.cx); return Math.hypot(x - this.cx, z - this.cz) - this.r(a); }
  inside(x: number, z: number) { return this.dist(x, z) < 0; }
  /** The rim point at angle a, and its outward normal (horizontal). */
  at(a: number, out = new THREE.Vector3(), normal?: THREE.Vector3) {
    const r = this.r(a);
    out.set(this.cx + Math.cos(a) * r, 0, this.cz + Math.sin(a) * r);
    if (normal) {
      const e = 0.002, r1 = this.r(a + e), r0 = this.r(a - e);
      const tx = Math.cos(a + e) * r1 - Math.cos(a - e) * r0, tz = Math.sin(a + e) * r1 - Math.sin(a - e) * r0;
      normal.set(tz, 0, -tx).normalize();
    }
    return out;
  }
  angleOf(x: number, z: number) { return Math.atan2(z - this.cz, x - this.cx); }
}

// ---------------------------------------------------------------- materials

const PALETTE = {
  cream: new THREE.Color('#f2e4c4'), gold: new THREE.Color('#e2c592'), warm: new THREE.Color('#cfae80'), grey: new THREE.Color('#bdb09a'),
  moss: new THREE.Color('#7f9c4a'), mossDark: new THREE.Color('#5e7c3c'),
};

let groundMatRef: THREE.MeshToonMaterial | null = null;
/**
 * The meadow ground: vertex-coloured grass tones under soft painted mottling and long brush strokes, and flower drifts
 * (pink, white, butter, lavender) dabbed in by a world-space shader, so from mid and far range the meadow reads as
 * painted masses with drifts of colour while the near tufts stand on it. Dabs melt into their mean colour with
 * distance (no shimmer).
 */
export function groundMat(): THREE.MeshToonMaterial {
  if (groundMatRef) return groundMatRef;
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp() }), { variation: 0.5 });
  chainCompile(m, 'sailGround', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 gp = vPWorld.xz;
        float up = clamp(normalize(vPNormal).y, 0.0, 1.0);
        // soft painted masses and long strokes along the wind
        float m1 = pNoise(vec3(gp * 0.31, 1.7)), m2 = pNoise(vec3(gp * 1.4, 7.1));
        float st = pNoise(vec3(gp.x * 2.6 + gp.y * 0.9, gp.y * 0.55 - gp.x * 0.2, 3.3));
        diffuseColor.rgb *= 0.92 + 0.12 * m1 + 0.05 * m2 + (st - 0.5) * 0.07;
        // flower drifts: patches where a dab grid shows flowers of one family
        float drift = smoothstep(0.6, 0.7, pNoise(vec3(gp * 0.095, 4.2))) * up;
        float fam = pNoise(vec3(gp * 0.04, 9.7));
        vec3 fc = fam < 0.38 ? vec3(0.96, 0.56, 0.68) : fam < 0.5 ? vec3(1.0, 0.97, 0.9) : fam < 0.62 ? vec3(0.98, 0.84, 0.32) : vec3(0.66, 0.58, 0.84);
        vec2 cg = gp / 0.21, ci = floor(cg), cf = fract(cg) - 0.5;
        float h1 = fract(sin(dot(ci, vec2(127.1, 311.7))) * 43758.5453), h2 = fract(sin(dot(ci, vec2(269.5, 183.3))) * 43758.5453);
        float d = length(cf - (vec2(h1, h2) - 0.5) * 0.5);
        float dab = (1.0 - smoothstep(0.17, 0.26, d)) * step(0.42, h1);
        // up close the real flora carries the flowers: the dabs melt into a soft tint so they never read as dots
        float nearF = smoothstep(5.0, 11.0, distance(vPWorld, cameraPosition));
        float aa = max(clamp(fwidth(cg.x) * 1.2, 0.0, 1.0), 1.0 - nearF);
        float cover = mix(dab, mix(0.06, 0.2, nearF), aa);
        diffuseColor.rgb = mix(diffuseColor.rgb, fc * (0.9 + 0.2 * h2), drift * cover * 0.85);
        // a few wild dabs everywhere, so the lawn is never a flat green
        float wild = step(0.965, h2) * (1.0 - smoothstep(0.1, 0.15, d)) * (1.0 - aa) * up;
        diffuseColor.rgb = mix(diffuseColor.rgb, h1 > 0.7 ? vec3(1.0, 0.97, 0.9) : vec3(0.99, 0.86, 0.36), wild * 0.8);
      }`);
  });
  groundMatRef = m;
  return m;
}

let rockMatRef: THREE.MeshToonMaterial | null = null;
/**
 * Cliff rock: strata of cream, pale gold and warm grey, each band its own tone with a dark seam between bands, vertical
 * joints and weather streaks, moss on every surface that faces up (ledge tops) and a moss lip under the turf.
 */
export function rockMat(): THREE.MeshToonMaterial {
  if (rockMatRef) return rockMatRef;
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.7, rim: 0.8 });
  chainCompile(m, 'sailRock', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 wp = vPWorld;
        float wob = pNoise(wp * 0.11) * 2.4 + pNoise(wp * 0.5) * 0.5;
        float yy = (wp.y + wob) / 1.85;
        float band = fract(yy), id = floor(yy);
        float hb = fract(sin(id * 78.233) * 43758.5453);
        vec3 tone = hb < 0.35 ? vec3(0.96, 0.9, 0.78) : hb < 0.65 ? vec3(0.9, 0.79, 0.6) : hb < 0.85 ? vec3(0.84, 0.74, 0.6) : vec3(0.78, 0.74, 0.68);
        diffuseColor.rgb *= tone * 1.06;
        // the seam under each band, and a lit lip above it
        diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.07, band)) * 0.34;
        diffuseColor.rgb *= 1.0 + smoothstep(0.9, 1.0, band) * 0.08;
        // vertical joints and dark weather streaks
        float j = pNoise(vec3(wp.x * 1.1, wp.y * 0.09, wp.z * 1.1));
        diffuseColor.rgb *= 1.0 - smoothstep(0.7, 0.76, j) * 0.3;
        float sk = pNoise(vec3(wp.x * 0.6, wp.y * 0.04, wp.z * 0.6));
        diffuseColor.rgb *= 0.92 + 0.1 * sk;
        // moss on what faces up
        float up = normalize(vPNormal).y;
        float mk = smoothstep(0.35, 0.75, up) * (0.55 + 0.45 * pNoise(wp * 0.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.42, 0.56, 0.24), vec3(0.56, 0.66, 0.3), pNoise(wp * 1.9)), mk * 0.85);
      }`);
  });
  rockMatRef = m;
  return m;
}

// ---------------------------------------------------------------- the floating isle

export interface IsleOpts {
  /** Rim centre and control points (x, z). */
  center: [number, number];
  rim: [number, number][];
  /** Ground height inside the rim (defaults flat). */
  top?: (x: number, z: number) => number;
  /** Ground colour (defaults to the grass palette by noise). */
  groundColor?: (x: number, z: number, out: THREE.Color) => THREE.Color;
  /** Depth from the rim to the tip underneath (m). */
  depth?: number;
  seed?: number;
  /** Mesh resolution: segments round the rim, and rings across the top / rows down the cliff. */
  segs?: number; rings?: number; rows?: number;
  /** Rim noise amplitude (m). */
  rough?: number;
  /** Hanging vines per 10 m of rim (default 1.2); flowers spilling at the lip per 10 m (default 4). */
  vines?: number; spill?: number;
  /** Angles (radians round the centre) where no vines or spill go (a waterfall). */
  clear?: [number, number][];
  /** Gullies cut back into the face: [angle, half-width (radians), depth (m)] (where a waterfall has worn the rock). */
  gullies?: [number, number, number][];
  /** Build the meadow ground (default true). */
  ground?: boolean;
}

export interface Isle {
  group: THREE.Group;
  rim: Rim;
  /** Ground height at a point (with the soft roll at the lip). */
  height: (x: number, z: number) => number;
  /** A point on the cliff face at rim angle a and depth d below the lip, pushed out `out` metres. */
  face: (a: number, d: number, out?: number) => THREE.Vector3;
  tris: number;
}

/**
 * A floating isle: a meadow top inside an organic rim, the lip rolling over into an overhang, then a craggy cliff of
 * strata with two to four chunky ledges (some stepping in, some jutting out as overhangs), big buttresses and gullies,
 * tapering below into a rocky point; vines hang from the lip and flowers spill over it.
 */
export function floatingIsle(o: IsleOpts): Isle {
  const seed = o.seed ?? 1, r = rng(seed);
  const rim = new Rim(o.center, o.rim, seed, o.rough ?? 0.6);
  const top = o.top ?? (() => 0);
  const D = o.depth ?? 40, SEG = o.segs ?? 256, RINGS = o.rings ?? 48, ROWS = o.rows ?? 72;
  const g = new THREE.Group(); g.name = 'floatingIsle';
  const cx = rim.cx, cz = rim.cz;
  const LIP = 0.35;
  const height = (x: number, z: number) => {
    const a = rim.angleOf(x, z), R = rim.r(a), f = Math.hypot(x - cx, z - cz) / R;
    const roll = f > 0.985 ? ((f - 0.985) / 0.015) ** 2 * LIP : 0;
    return top(x, z) - roll;
  };
  let tris = 0;
  const tmpC = new THREE.Color();
  const grassCol = o.groundColor ?? ((x: number, z: number, out: THREE.Color) => {
    const t = vnoise(x * 0.09, z * 0.09, 0.37) * 0.75 + vnoise(x * 0.5, z * 0.5, 3.37) * 0.25;
    return out.copy(GRASS.cool).lerp(GRASS.mid, Math.min(1, t * 1.6)).lerp(GRASS.warm, Math.max(0, t * 1.6 - 0.6));
  });
  // -- the meadow top: rings from the centre to the rim, dense at the rim
  if (o.ground !== false) {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const W = SEG;
    pos.push(cx, top(cx, cz), cz); grassCol(cx, cz, tmpC); col.push(tmpC.r, tmpC.g, tmpC.b);
    for (let k = 1; k <= RINGS; k++) {
      const u = k / RINGS, f = 1 - (1 - u) ** 1.6;
      for (let i = 0; i < W; i++) {
        const a = (i / W) * Math.PI * 2, R = rim.r(a) * f;
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        pos.push(x, height(x, z), z);
        grassCol(x, z, tmpC);
        if (f > 0.97) tmpC.lerp(PALETTE.mossDark, (f - 0.97) / 0.03 * 0.35);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
    for (let i = 0; i < W; i++) idx.push(0, 1 + (i + 1) % W, 1 + i);
    for (let k = 1; k < RINGS; k++) for (let i = 0; i < W; i++) {
      const a = 1 + (k - 1) * W + i, b = 1 + (k - 1) * W + (i + 1) % W, c = a + W, d = b + W;
      idx.push(a, b, d, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, groundMat());
    mesh.receiveShadow = true; mesh.name = 'isleGround';
    g.add(mesh);
    tris += idx.length / 3;
  }
  // -- the cliff
  // ledges: [depth, step (m; + steps in below it, - juts out as an overhang), angular phase]
  const ledges: [number, number, number][] = [];
  const nL = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nL; i++) ledges.push([D * (0.07 + 0.2 * (i + r() * 0.6) / nL * 1.6), (r() < 0.25 ? -1 : 1) * (0.6 + r() * 1.0), r() * 10]);
  const dTaper = D * 0.26;
  const lipY = (a: number) => { const p = rim.at(a); return top(p.x, p.z) - LIP; };
  // radial offset of the face from the rim at angle a, depth d (before the taper)
  const off = (a: number, d: number) => {
    const R = rim.r(a), s = a * R;   // s: metres round the rim
    let v = 0;
    // the lip: turf rolls over a little overhang, then the rock cuts back
    v += 0.45 * Math.min(1, d / 0.5) * (1 - THREE.MathUtils.smoothstep(d, 0.6, 2.2));
    v -= 0.35 * THREE.MathUtils.smoothstep(d, 0.6, 2.2);
    for (const [ld, st, ph] of ledges) {
      const ldd = ld + (vnoise(s * 0.05, ph, seed) - 0.5) * 5;
      const k = THREE.MathUtils.smoothstep(d, ldd, ldd + 0.55);
      const where = vnoise(s * 0.07 + ph, ph * 2, seed + 3);   // ledges run for a while, then fade out
      v -= st * k * THREE.MathUtils.smoothstep(where, 0.3, 0.55);
    }
    // strata relief: each band stands proud by its own amount
    const band = (d + vnoise(s * 0.06, 0, seed) * 2.5) / 1.85;
    const bi = Math.floor(band), bf = band - bi;
    const pa = vnoise(s * 0.12, bi * 1.7, seed + 5), pb = vnoise(s * 0.12, (bi + 1) * 1.7, seed + 5);
    v += (pa + (pb - pa) * THREE.MathUtils.smoothstep(bf, 0.82, 1.0) - 0.5) * 0.55;
    // buttresses and gullies, columns split by vertical joints, and small knobs
    v += (vnoise(s * 0.045, d * 0.035, seed + 7) - 0.5) * 3.6 + (vnoise(s * 0.2, d * 0.15, seed + 9) - 0.5) * 1.1;
    const col = vnoise(s * 0.55, d * 0.06, seed + 13);
    v += (Math.abs(col - 0.5) * 2 - 0.5) * 0.7 * (1 - THREE.MathUtils.smoothstep(d, D * 0.3, D * 0.6));
    for (const [ga, gw, gd] of o.gullies ?? []) {
      const da = Math.atan2(Math.sin(a - ga), Math.cos(a - ga));
      v -= gd * Math.exp(-((da / gw) ** 2)) * THREE.MathUtils.smoothstep(d, 0.1, 1.2);
    }
    return v;
  };
  const face = (a: number, d: number, outK = 0) => {
    const R = rim.r(a);
    let rr = R + off(a, d) + outK;
    if (d > dTaper) {
      const t = (d - dTaper) / (D - dTaper);
      rr *= 1 - Math.pow(t, 1.45) * 0.97;
      // the underside breaks into a few hanging lobes
      rr *= 1 + (vnoise(a * 3, t * 3, seed + 11) - 0.5) * 0.6 * t + (vnoise(a * 9, t * 6, seed + 12) - 0.5) * 0.25 * t;
    }
    return new THREE.Vector3(cx + Math.cos(a) * Math.max(0.3, rr), lipY(a) - d, cz + Math.sin(a) * Math.max(0.3, rr));
  };
  {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const W = SEG;
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS, d = D * Math.pow(t, 1.55);
      for (let i = 0; i < W; i++) {
        const a = (i / W) * Math.PI * 2;
        const p = face(a, d);
        // the tip: drawn together to one point
        if (j === ROWS) p.set(cx + (vnoise(seed, 1, 2) - 0.5) * 2, lipY(0) - D - 2, cz);
        pos.push(p.x, p.y, p.z);
        tmpC.copy(PALETTE.cream).lerp(PALETTE.gold, vnoise(a * 4, d * 0.1, seed) * 0.8).lerp(PALETTE.grey, Math.max(0, t - 0.4) * 0.6);
        if (d < 0.9) tmpC.lerp(PALETTE.moss, (1 - d / 0.9) * 0.9);   // the moss lip under the turf
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < W; i++) {
      const a = j * W + i, b = j * W + (i + 1) % W, c = a + W, d = b + W;
      idx.push(a, b, d, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, rockMat());
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'isleCliff';
    g.add(mesh);
    tris += idx.length / 3;
  }
  // -- vines hanging from the lip, and flowers and leaves spilling over it
  {
    const kit = new Kit();
    const L = Math.PI * 2 * rim.r(0);
    const clear = (a: number) => (o.clear ?? []).some(([a0, a1]) => { const t = ((a - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); return t < ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); });
    const nV = Math.round(L / 10 * (o.vines ?? 1.2));
    for (let v = 0; v < nV; v++) {
      const a = r() * Math.PI * 2;
      if (clear(a)) continue;
      const len = 1.5 + r() * r() * 7, pts: WallPoint[] = [];
      for (let d = 0.2; d < len; d += 0.22) {
        const aa = a + Math.sin(d * 0.8 + v) * 0.004;
        const p = face(aa, d, 0.12), q = face(aa + 0.01, d, 0.12);
        const n = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize();
        void q;
        pts.push({ p, n, s: 0.75 - (d / len) * 0.3 });
      }
      addIvy(kit, pts, r, { perPoint: 3, colors: ['#4f7f38', '#5c8c3e', '#456f34', '#6b9a46'], spread: 0.45 });
    }
    const nS = Math.round(L / 10 * (o.spill ?? 4));
    for (let k = 0; k < nS; k++) {
      const a = r() * Math.PI * 2;
      if (clear(a)) continue;
      // draped clumps hanging over the lip: flat, wider than tall, half below the turf
      const p = face(a, 0.45, 0.12), n = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize();
      addLeafMass(kit, T(p.x, p.y, p.z, 0, Math.atan2(n.x, n.z), 0).multiply(T(0, 0, 0, 0, 0, 0, 1.6, 1, 1)), r, { radius: 0.22 + r() * 0.2, squash: 0.9, flat: 0.45, color: pick(r, ['#5f8c42', '#6a9648', '#58843e', '#4f7f38']), ao: 0.5, size: 0.18 });
    }
    const vg = new THREE.Group(); vg.name = 'isleGreen';
    kit.build(vg, { outline: false, shadows: false });
    g.add(vg);
    tris += kit.tris;
  }
  return { group: g, rim, height, face, tris };
}

// ---------------------------------------------------------------- painted cumulus

export interface CloudLight { lit: THREE.ColorRepresentation; shade: THREE.ColorRepresentation; base: THREE.ColorRepresentation; haze: THREE.ColorRepresentation; hazeK: number }
/** The cloud colours of midday (white tops, soft blue-grey shade, a warm bounce in the bellies) and of golden hour. */
export const CLOUD_LIGHT: Record<'day' | 'golden', CloudLight> = {
  day: { lit: '#fffdf6', shade: '#b8c6de', base: '#e6dccc', haze: '#d2e4f4', hazeK: 0.0011 },
  golden: { lit: '#fff0d6', shade: '#c4a8b4', base: '#f0c8a0', haze: '#f6d8b8', hazeK: 0.0012 },
};

/**
 * Cumulus as soft painted billboards: each heap is many round puffs, each puff a camera-facing card shaded like a
 * lumpy sphere (lit from the sun, deeper toward the heap's flat base, a silver edge toward the sun), its outline
 * broken by noise and its bottom cut flat at the heap's base. No depth written (no ink), sorted back to front.
 */
export class CloudField {
  private puffs: { p: THREE.Vector3; r: number; h: number; base: number; sx: number; seed: number; op: number }[] = [];
  private mesh: THREE.Mesh | null = null;
  private geo: THREE.InstancedBufferGeometry | null = null;
  private last = new THREE.Vector3(1e9, 0, 0);
  readonly uniforms = {
    uSun: PAINT.uSun,
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uBase: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() }, uHazeK: { value: 0.001 },
  };
  constructor(light: CloudLight = CLOUD_LIGHT.day) { this.setLight(light); }
  setLight(l: CloudLight) {
    this.uniforms.uLit.value.set(l.lit).multiplyScalar(1.12); this.uniforms.uShade.value.set(l.shade);
    this.uniforms.uBase.value.set(l.base); this.uniforms.uHaze.value.set(l.haze); this.uniforms.uHazeK.value = l.hazeK;
  }
  /** One puff. h is its height in its heap (0 base .. 1 top); base the heap's flat bottom (world y). */
  puff(p: THREE.Vector3, radius: number, h: number, base: number, stretch = 1, opacity = 1, seed = Math.random()) {
    this.puffs.push({ p: p.clone(), r: radius, h, base, sx: stretch, seed, op: opacity });
  }
  /**
   * A cumulus heap standing on (x, base, z): `width` across, `height` tall, puffs piled on a dome that narrows toward
   * the top in a few cauliflower towers. `facing` (radians) turns the heap's depth axis.
   */
  heap(x: number, base: number, z: number, width: number, height: number, seed = 1, n = 40, opacity = 1) {
    const r = rng(seed);
    const towers: [number, number, number][] = [];
    for (let i = 0; i < 2 + Math.floor(r() * 3); i++) towers.push([(r() - 0.5) * width * 0.6, (r() - 0.5) * width * 0.25, 0.55 + r() * 0.45]);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(r(), 0.85);
      const tw = towers[Math.floor(r() * towers.length)];
      const spread = width * 0.5 * (1 - Math.pow(t, 1.3) * 0.75);
      const towerK = t * t;   // high puffs gather on their towers
      const px = (r() - 0.5) * 2 * spread * (1 - towerK) + tw[0] * towerK;
      const pz = (r() - 0.5) * spread * 0.7 * (1 - towerK) + tw[1] * towerK;
      const py = base + t * height * tw[2];
      const rad = width * (0.12 + r() * 0.1) * (1 - t * 0.45);
      this.puff(new THREE.Vector3(x + px, py + rad * 0.3, z + pz), rad, t * tw[2], base, 1.15, opacity, r());
    }
  }
  /** A sea of low, flattened puffs on y = level, in a ring from rMin to rMax round (x, z). */
  sea(x: number, level: number, z: number, rMin: number, rMax: number, n: number, seed = 3, size = 1) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = rMin + (rMax - rMin) * Math.sqrt(r());
      const rad = (14 + r() * 22) * size * (0.6 + d / rMax);
      this.puff(new THREE.Vector3(x + Math.cos(a) * d, level + r() * rad * 0.4, z + Math.sin(a) * d), rad, 0.3 + r() * 0.5, level - rad * 0.2, 1.7, 1, r());
    }
  }
  get count() { return this.puffs.length; }
  build(): THREE.Mesh {
    const n = this.puffs.length;
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(2, 2);
    geo.index = q.index; geo.setAttribute('position', q.attributes.position);
    geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
    geo.setAttribute('aOp', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `
        attribute vec4 aPuff; attribute vec4 aInfo; attribute float aOp;
        uniform vec3 uSun;
        varying vec2 vP; varying vec4 vInfo; varying float vDist, vWY, vR, vOp; varying vec3 vSunV;
        void main(){
          vec4 mv = viewMatrix * vec4(aPuff.xyz, 1.0);
          vec2 q = position.xy;
          mv.xy += q * aPuff.w * vec2(aInfo.z, 1.0);
          vP = q; vInfo = aInfo; vDist = -mv.z; vR = aPuff.w; vOp = aOp;
          vWY = aPuff.y + q.y * aPuff.w;
          vSunV = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLit, uShade, uBase, uHaze; uniform float uHazeK;
        varying vec2 vP; varying vec4 vInfo; varying float vDist, vWY, vR, vOp; varying vec3 vSunV;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vP;
          float r2 = dot(p, p);
          vec2 o = vec2(vInfo.w * 17.0, vInfo.w * 9.0);
          float nz = vn(p * 2.3 + o) * 0.55 + vn(p * 5.1 + o * 1.7) * 0.3 + vn(p * 11.0 + o) * 0.15;
          float edge = r2 + (nz - 0.5) * 0.55;
          float a = 1.0 - smoothstep(0.55, 0.95, edge);
          // the heap's flat base: cut, softly
          a *= smoothstep(vInfo.y - vR * 0.05, vInfo.y + vR * 0.4, vWY);
          a *= vOp;
          if (a < 0.01) discard;
          vec3 n = normalize(vec3(p + (nz - 0.5) * 0.5, sqrt(max(0.0, 1.0 - min(r2, 1.0))) * 1.2));
          float l = dot(n, vSunV) * 0.5 + 0.5;
          float h = clamp(vInfo.x * 0.75 + (p.y * 0.5 + 0.5) * 0.35, 0.0, 1.0);
          float lit = smoothstep(0.3, 0.85, l * 0.62 + h * 0.5 + (nz - 0.5) * 0.3);
          vec3 col = mix(uShade, uLit, lit);
          col = mix(col, uBase, (1.0 - h) * (1.0 - lit) * 0.45);
          // the silver edge toward the sun
          float rim = smoothstep(0.35, 0.85, edge) * max(dot(normalize(p + 1e-4), normalize(vSunV.xy + 1e-4)), 0.0);
          col += uLit * rim * 0.22;
          col = mix(col, uHaze, (1.0 - exp(-vDist * uHazeK)) * 0.75);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'clouds';
    mesh.userData.noOutline = true;
    this.mesh = mesh; this.geo = geo;
    this.sortFrom(new THREE.Vector3(0, 0, 0));
    return mesh;
  }
  private sortFrom(cam: THREE.Vector3) {
    if (!this.geo) return;
    const P = this.puffs.slice().sort((p, q) => q.p.distanceToSquared(cam) - p.p.distanceToSquared(cam));
    const ap = this.geo.attributes.aPuff as THREE.InstancedBufferAttribute, ai = this.geo.attributes.aInfo as THREE.InstancedBufferAttribute, ao = this.geo.attributes.aOp as THREE.InstancedBufferAttribute;
    P.forEach((p, i) => { ap.setXYZW(i, p.p.x, p.p.y, p.p.z, p.r); ai.setXYZW(i, p.h, p.base, p.sx, p.seed); ao.setX(i, p.op); });
    ap.needsUpdate = ai.needsUpdate = ao.needsUpdate = true;
    this.last.copy(cam);
  }
  /** Re-sort when the camera has moved (call each frame; cheap when it has not). */
  update(camera: THREE.Camera) { if (camera.position.distanceToSquared(this.last) > 4) this.sortFrom(camera.position); }
}

// ---------------------------------------------------------------- waterfall

const fallUniforms = { uTime: PAINT.uTime, uSun: PAINT.uSun };

/**
 * An arcing waterfall from `lip`, thrown out along `out` (horizontal) and falling `drop` metres: a curved curtain
 * (bowed back at its middle, so it reads from any side) of streaming white and pale blue, foaming at the lip, ragged at
 * its edges and dissolving into mist below. A second, narrower sheet in front gives it body. No depth written.
 */
export function waterfall(lip: THREE.Vector3, out: THREE.Vector3, width: number, drop: number, opts: { speed?: number; seed?: number } = {}): THREE.Group {
  const g = new THREE.Group(); g.name = 'waterfall';
  const o = out.clone().setY(0).normalize(), side = new THREE.Vector3(-o.z, 0, o.x);
  const v0 = opts.speed ?? 2.6;
  const sheet = (w: number, front: number, ph: number, alphaK: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const rows = 40, cols = 8;
    const Tm = Math.sqrt(2 * drop / 9.8);
    for (let j = 0; j <= rows; j++) {
      const t = Math.pow(j / rows, 1.6) * Tm, fy = 0.5 * 9.8 * t * t, fx = v0 * t;
      const wj = w * (1 + fy * 0.035);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols, sx = (u - 0.5) * wj;
        const bow = -(1 - (2 * u - 1) ** 2) * wj * 0.18 + front;
        const p = lip.clone().addScaledVector(side, sx).addScaledVector(o, fx + bow).add(new THREE.Vector3(0, -fy, 0));
        pos.push(p.x, p.y, p.z); uv.push(u, fy + fx * 0.3);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i; idx.push(a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uW: { value: w }, uLen: { value: drop }, uPh: { value: ph }, uA: { value: alphaK } }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv; varying vec3 vN;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uW, uLen, uPh, uA; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vN;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          float x = vUv.x, y = vUv.y;
          float s1 = vn(vec2(x * uW * 2.2 + uPh, y * 0.18 - uTime * 1.5));
          float s2 = vn(vec2(x * uW * 5.5 + uPh * 3.0, y * 0.45 - uTime * 3.1));
          float st = s1 * 0.6 + s2 * 0.4;
          vec3 deep = vec3(0.46, 0.7, 0.9), foam = vec3(1.0, 1.0, 1.0);
          vec3 col = mix(deep, foam, smoothstep(0.4, 0.62, st));
          col = mix(col, foam, 1.0 - smoothstep(0.0, 2.5, y));
          float lt = abs(dot(normalize(vN), uSun));
          col *= 0.86 + 0.24 * lt;
          float ew = 0.16 + 0.08 * vn(vec2(y * 0.3 - uTime, uPh));
          float edge = smoothstep(0.0, ew, x) * smoothstep(1.0, 1.0 - ew, x);
          float a = edge * (0.82 + 0.18 * st) * (1.0 - smoothstep(uLen * 0.55, uLen * 0.95, y)) * uA;
          gl_FragColor = vec4(col * 1.05, a);
          #include <fog_fragment>
        }`,
    });
    Object.assign(mat.uniforms, fallUniforms);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3; m.frustumCulled = false; m.userData.noOutline = true;
    g.add(m);
  };
  sheet(width, 0, opts.seed ?? 0, 0.95);
  sheet(width * 0.6, 0.12, (opts.seed ?? 0) + 3.1, 0.7);
  return g;
}

// ---------------------------------------------------------------- far isles

/** Matching low-detail toon materials for the far isles' little buildings. */
const farMats = new Map<string, THREE.Material>();
function farMat(c: string) {
  let m = farMats.get(c);
  if (!m) { m = paint(new THREE.MeshToonMaterial({ color: c, gradientMap: softRamp() }), { variation: 0.4 }); farMats.set(c, m); }
  return m;
}

export interface FarIsleOpts { radius: number; seed?: number; cottages?: number; windmills?: number; trees?: number; falls?: boolean; depth?: number }

/**
 * A far floating isle, to be seen across the sky: an organic rim and craggy tapering underside (low resolution), a green
 * top with a cluster of round cream cottages under blue cones, windmills with turning sails, round trees, and a
 * waterfall off its edge. Its materials melt into the AERIAL sky tint with distance. userData.update turns the sails.
 */
export function farIsle(o: FarIsleOpts): THREE.Group {
  const seed = o.seed ?? 1, r = rng(seed * 13 + 7), R = o.radius;
  const pts: [number, number][] = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r() * 0.3; const rr = R * (0.75 + r() * 0.4); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  const hill = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x, z) / R) * R * 0.12 + (vnoise(x * 0.2, z * 0.2, seed) - 0.5) * R * 0.04;
  const isle = floatingIsle({ center: [0, 0], rim: pts, top: hill, depth: o.depth ?? R * 1.4, seed, segs: 96, rings: 14, rows: 34, rough: R * 0.03, vines: 2.5, spill: 0, ground: true });
  const g = isle.group; g.name = 'farIsle';
  const kit = new Kit();
  const at = (k: number) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * k; return [Math.cos(a) * d, Math.sin(a) * d] as [number, number]; };
  const rotors: THREE.Object3D[] = [];
  const nC = o.cottages ?? Math.round(R / 3);
  for (let i = 0; i < nC; i++) {
    const [x, z] = at(0.6), y = isle.height(x, z), s = R * (0.06 + r() * 0.035);
    kit.add(new THREE.CylinderGeometry(s * 0.93, s, s * 1.6, 10), 'plain', '#f4e4c4', T(x, y + s * 0.8, z));
    kit.add(new THREE.ConeGeometry(s * 1.35, s * 1.1, 10), 'plain', pick(r, ['#4f6a96', '#47618c', '#5a74a0']), T(x, y + s * 1.6 + s * 0.55, z));
    kit.add(new THREE.BoxGeometry(s * 0.25, s * 0.6, s * 0.25), 'plain', '#e8d8b8', T(x + s * 0.5, y + s * 2.1, z));
  }
  for (let i = 0; i < (o.trees ?? Math.round(R / 2.5)); i++) {
    const [x, z] = at(0.85), y = isle.height(x, z), s = R * (0.05 + r() * 0.04);
    kit.add(new THREE.IcosahedronGeometry(s, 1), 'plain', pick(r, ['#5f8f44', '#6a9a48', '#58863e']), T(x, y + s * 1.1, z, 0, 0, 0, 1, 1.15, 1));
  }
  for (let i = 0; i < (o.windmills ?? 1); i++) {
    const [x, z] = at(0.5), y = isle.height(x, z), H = R * (0.22 + r() * 0.08), w = H * 0.18;
    kit.add(new THREE.CylinderGeometry(w * 0.7, w, H, 10), 'plain', '#f2e2c0', T(x, y + H / 2, z));
    kit.add(new THREE.ConeGeometry(w * 0.95, w * 1.4, 10), 'plain', '#4f6a96', T(x, y + H + w * 0.6, z));
    const rot = new THREE.Group(); rot.position.set(x, y + H * 0.92, z + w * 0.95);
    const rk = new Kit();
    for (let k = 0; k < 4; k++) rk.add(new THREE.BoxGeometry(w * 0.5, H * 0.55, w * 0.05), 'plain', '#efe4cc', T(0, 0, 0, 0, 0, k * Math.PI / 2).multiply(T(w * 0.18, H * 0.3, 0)));
    rk.build(rot, { outline: false, shadows: false });
    g.add(rot); rotors.push(rot);
  }
  const vg = new THREE.Group(); kit.build(vg, { outline: false, shadows: false }); g.add(vg);
  if (o.falls !== false) {
    const a = r() * Math.PI * 2, n = new THREE.Vector3();
    const p = isle.rim.at(a, new THREE.Vector3(), n);
    p.y = isle.height(p.x * 0.99, p.z * 0.99) - 0.2;
    g.add(waterfall(p.addScaledVector(n, -0.3), n, R * 0.1, (o.depth ?? R * 1.4) * 0.8, { speed: R * 0.12, seed }));
  }
  let ang = r() * 6;
  g.userData.update = (dt: number) => { ang -= dt * 0.5; for (const rt of rotors) rt.rotation.z = ang; };
  g.userData.isle = isle;
  g.traverse((ob) => { const me = ob as THREE.Mesh; if (me.isMesh && !Array.isArray(me.material)) me.material = hazeMat(me.material); });
  return g;
}

/**
 * Aerial perspective for distant things: a shared sky tint the far isles' materials melt into with distance, so the far
 * villages sit blue and soft behind the near one (the lab sets the colour per light preset).
 */
export const AERIAL = { uAerCol: { value: new THREE.Color('#9dbde6') }, uAerK: { value: 0.005 }, uAerMax: { value: 0.6 } };
const hazed = new Map<string, THREE.Material>();
function hazeMat(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshToonMaterial)) return m;
  const got = hazed.get(m.uuid); if (got) return got;
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
  chainCompile(c, 'aerial', (sh) => {
    sh.uniforms.uAerCol = AERIAL.uAerCol; sh.uniforms.uAerK = AERIAL.uAerK; sh.uniforms.uAerMax = AERIAL.uAerMax;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAerCol; uniform float uAerK, uAerMax;')
      .replace('#include <fog_fragment>', `{
        float hd = distance(vPWorld, cameraPosition);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uAerCol, (1.0 - exp(-hd * uAerK)) * uAerMax);
      }
      #include <fog_fragment>`);
  });
  hazed.set(m.uuid, c);
  return c;
}

/** Random helper re-export for scenes composing isles. */
export type { Rnd };
