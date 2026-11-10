import * as THREE from 'three';
import { NOISE_GLSL } from '../../render/paint';
import {
  PuffBuilder, PuffLayer, addMass, addTower, sortTriangles, applyPalette, cloudUniforms, cloudBlend, puffMaterial, setCloudMask,
  gapUniforms, gapAtJS, GAP_GLSL, type CloudUniforms, type GapUniforms, type MassShape,
} from './cloudPuffs';
import { SkyBirds, type FlockSpec } from './skyBirds';
import { farIsleGeometry, farMaterial } from './farIsle';
import { SkyGlow } from './skyGlow';

/**
 * The cloud sea of the Sky Isles: World 2's "ground", a deep rolling sea of white cumulus far below the islands.
 *
 * World 2 is a small planet, so the sea is a shell of cumulus masses of radius R round a centre C. From island
 * height the shell's true horizon dips steeply (some 40 degrees at R = 80), so a flattened "far sea" continues
 * it outward from that horizon circle to the real horizon. The far sea's frame follows the camera like a sky
 * dome (Y = the camera's local up). The sea is composed in a clear hierarchy of masses and depth planes:
 *
 *   near sea   : a few broad hero masses (18-28 m, each one billowing silhouette), mid masses and small ones
 *                sunk lower into the valleys, and low sunken tops half drowned in the valley mist
 *   floor      : a sphere under it all: blue-white mist, so the valleys fall away into misty depth
 *   middle     : out to 240 m, a field of hero masses (22-32 m) and sunken ones, tiled with a 160 m period that
 *                stays put in the world (it slides back as the frame follows the camera and wraps seamlessly)
 *   bands      : beyond, two receding bands of big heaps (300 m, 600 m), each lighter and bluer, with whiter
 *                haze between them
 *   bank       : tall far ridges of cumulus (900-1400 m) that clearly break the horizon line
 *   dressing   : towering cumulus round the horizon (2-3 per quadrant), flocks of gulls, the far castle-ruins
 *                island, the sky glow and sun rays, and (lands) broad openings in the sea onto the green lands of
 *                the next world far below, feathered by wisps
 *
 * Use: const sea = new CloudSea({ center, radius }); scene.add(sea.group); each frame sea.update(dt, t, camera);
 * sea.setGolden(0..1) and sea.setHaze(fogColour) as the light changes. Keep sea.group at the scene root with an
 * identity transform (its children place themselves in world space). Turn FINISH_CLOUD_MASK (render/finish.ts)
 * on in a world with this sea, so ink does not show through the clouds.
 * All clouds are transparent impostors that never write colour depth, sorted back to front on the CPU each
 * frame; renderOrder 0..4 (pads 5, birds 6, sun rays 8, sky glow -9).
 */

/** Uniforms shared by every Sky Isles cloud (sea, far sea, pads), like PAINT is for the toon world. */
export const SKY_CLOUDS: CloudUniforms = cloudUniforms();

export interface CloudSeaOptions {
  center: THREE.Vector3;
  radius: number;
  seed?: number;
  /** Scales the number of masses on the shell (default 1). */
  density?: number;
  /** Drift of the sea, metres per second along the shell (default 0.6). */
  drift?: number;
  /** The far, flattened sea out to the horizon, with its bands, bank, towers, birds and castle (default true). */
  far?: boolean;
  /** Towering cumulus round the horizon (default 10). */
  towers?: number;
  /** Azimuths (radians, frame -Z = 0, toward +X) for the first towers; the rest spread round the horizon. */
  towerAz?: number[];
  flocks?: number;
  /** The far castle island: false to leave it out, or where it stands (azimuth in radians from the frame's -Z, metres). */
  castle?: boolean | { azimuth: number; distance?: number; height?: number };
  /** Broad openings in the sea onto the green lands of the next world far below. */
  lands?: boolean;
  /** Openings on the shell (world points, radius in metres), added to a few seeded ones when lands is on. */
  gaps?: { at: THREE.Vector3; r: number }[];
  /** Openings in the far sea (azimuth from the frame's -Z, distance and radius in metres), likewise. */
  farGaps?: { azimuth: number; distance: number; r: number }[];
  /** Hero masses placed by hand on the shell (world points; radius and height in metres). */
  masses?: { at: THREE.Vector3; r: number; h?: number }[];
  /** Places (world space) where the masses stay low, e.g. under islands: { at, r } with r in metres along the sea. */
  clear?: { at: THREE.Vector3; r: number }[];
  /** The sky glow dome and sun rays (default true). */
  skyGlow?: boolean;
}

// ------------------------------------------------------------------ the floors: misty depth under the masses

function floorMaterial(flat: boolean, gaps: GapUniforms) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      ...SKY_CLOUDS,
      ...gaps,
      uCenter: { value: new THREE.Vector3() },
      uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlat: { value: flat ? 1 : 0 },
      uDrift: { value: new THREE.Vector3(0.3, 0, 0.12) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uMid, uMist, uSkyShade, uHaze, uCenter, uFlatUp, uDrift, uGlow;
      uniform float uHazeD, uFlat, uTime, uGlowK;
      varying vec3 vW;
      ${NOISE_GLSL}
      ${GAP_GLSL}
      void main(){
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(vW - uCenter);
        vec3 q = vW * 0.03 + uDrift * uTime * 0.1;
        float n = pNoise(q) * 0.55 + pNoise(q * 2.3 + 3.1) * 0.3 + pNoise(q * 5.7 + 7.0) * 0.15;
        float sunK = clamp(dot(up, uSun) * 0.6 + 0.4, 0.0, 1.0);
        // deep in the valleys: blue-white mist with soft, half-drowned heap tops lying in it
        vec3 col = mix(mix(uMist, uSkyShade, 0.35), uMist, smoothstep(0.3, 0.55, n));
        col = mix(col, mix(uMist, uTop, 0.45), smoothstep(0.55, 0.78, n) * sunK);
        vec3 toCam = cameraPosition - vW;
        float d = length(toCam);
        float fwd = max(dot(-toCam / d, uSun), 0.0);
        // under a low sun the mist glows
        col += uGlow * uGlowK * (pow(fwd, 6.0) * 0.25 + pow(fwd, 24.0) * 0.35);
        vec3 haze = mix(uHaze, uGlow * 1.1, clamp(pow(fwd, 5.0) * uGlowK * 0.5, 0.0, 0.7));
        col = mix(col, haze, 1.0 - exp(-pow(d * uHazeD, 1.5)));
        // openings onto the lands below: soft-edged, with a bright lip of mist round each
        float g = gapAt(vW) + (n - 0.5) * 0.16;
        float a = 1.0 - smoothstep(-0.05, 0.08, g);
        col = mix(col, mix(uMist, uTop, 0.6), smoothstep(-0.25, 0.0, g) * 0.5);
        // (under the bloom threshold: the glow under the sun stays a soft haze, not a veil)
        gl_FragColor = vec4(min(col, vec3(0.95)), a);
      }`,
  });
  return cloudBlend(m);
}

/**
 * The next world's green lands far below, seen through the openings: hills shaded by the low sun, a patchwork
 * of meadows, wheat and woods, meandering rivers that glint where they mirror the sun, and warm haze deepening
 * toward the horizon. One material for the sphere under the shell (up = radial) and the far plane (up = uFlatUp);
 * the pattern is laid out in world space, so it stays put as the far frame follows the camera.
 */
function landsMaterial(center: THREE.Vector3, flat: boolean) {
  // (cloud blending: the lands count as cloud for the ink mask, so no ink is drawn round the openings)
  return cloudBlend(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uSun: SKY_CLOUDS.uSun, uHaze: SKY_CLOUDS.uHaze, uGlow: SKY_CLOUDS.uGlow, uGlowK: SKY_CLOUDS.uGlowK, uCenter: { value: center },
      uFlat: { value: flat ? 1 : 0 }, uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uScale: { value: flat ? 1.6 : 7 },
      // (the sphere under the shell is close: it is drawn small and hazed as if it were far below)
      uHaze0: { value: flat ? 0 : 0.3 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uHaze, uGlow, uCenter, uFlatUp; uniform float uFlat, uScale, uGlowK, uHaze0;
      varying vec3 vW;
      ${NOISE_GLSL}
      float hills(vec3 p){ return pNoise(p * 0.006) * 0.55 + pNoise(p * 0.017 + 3.0) * 0.3 + pNoise(p * 0.05 + 1.0) * 0.15; }
      void main(){
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(vW - uCenter);
        vec3 p = vW * uScale;
        vec3 t1 = normalize(cross(up, abs(up.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(up, t1);
        // relief: rolling hills, shaded by the sun
        float h = hills(p), hx = hills(p + t1 * 6.0), hz = hills(p + t2 * 6.0);
        vec3 n = normalize(up - (t1 * (hx - h) + t2 * (hz - h)) * 22.0);
        float lit = clamp(dot(n, uSun) * 1.5 + 0.55, 0.35, 1.35);
        // patchwork: fields in a slightly warped grid, each its own crop; woods on the hill tops
        vec3 wq = p + vec3(pNoise(p * 0.01), pNoise(p * 0.012 + 2.0), pNoise(p * 0.01 + 5.0)) * 60.0;
        vec3 cell = floor(wq * 0.028);
        float id = pNoise(cell * 1.7 + 0.5), id2 = pNoise(cell * 2.9 + 9.0);
        vec3 col = mix(vec3(0.42, 0.62, 0.24), vec3(0.58, 0.7, 0.3), id);
        col = mix(col, vec3(0.86, 0.74, 0.4), step(0.66, id2) * 0.85);       // wheat
        col = mix(col, vec3(0.7, 0.72, 0.36), step(0.5, id2) * step(id2, 0.6)); // hay
        // hedges between fields: darker lines along the cell edges
        vec3 fc = fract(wq * 0.028);
        float hedge = 1.0 - smoothstep(0.0, 0.06, min(min(fc.x, 1.0 - fc.x), min(fc.z, 1.0 - fc.z)));
        col = mix(col, vec3(0.3, 0.44, 0.22), hedge * 0.22);
        float wood = smoothstep(0.58, 0.66, h + pNoise(p * 0.08) * 0.08);
        col = mix(col, mix(vec3(0.2, 0.38, 0.2), vec3(0.28, 0.46, 0.22), pNoise(p * 0.2)), wood);
        col *= lit;
        // rivers: meandering ribbons along a warped contour, shining where they mirror the sun
        vec3 rp = p + vec3(pNoise(p * 0.004), pNoise(p * 0.004 + 7.0), pNoise(p * 0.004 + 9.0)) * 160.0;
        float rv = abs(pNoise(rp * 0.0045 + 4.0) - 0.5);
        float river = 1.0 - smoothstep(0.006, 0.012, rv);
        vec3 V = normalize(vW - cameraPosition);
        float glint = pow(max(dot(reflect(V, up), uSun), 0.0), 6.0);
        col = mix(col, vec3(0.62, 0.74, 0.86) + uGlow * (0.3 + 2.2 * glint), river);
        // aerial perspective: warm haze, deeper with distance and toward the sun
        float d = length(cameraPosition - vW);
        float fwd = pow(max(dot(V, uSun), 0.0), 3.0);
        vec3 haze = mix(uHaze, uGlow * 1.1, 0.25 + 0.55 * fwd);
        col = mix(col, haze, clamp(uHaze0 + (1.0 - exp(-d * 0.0006)) * 0.78 + fwd * 0.08, 0.0, 0.94));
        gl_FragColor = vec4(min(col, vec3(0.95 + river * 0.3)), 1.0);
      }`,
  }));
}

// ------------------------------------------------------------------ the sea

const _up = new THREE.Vector3(), _cam = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** A seeded random in [0, 1). */
function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  s = (s * 9301 + 49297) % 2147483647;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** The tiled middle field: tile size, and where it hands over to the bands (metres across the far plane). */
const TILE = 160, MID0 = 200, MID1 = 240;

export class CloudSea {
  group = new THREE.Group();
  readonly center: THREE.Vector3;
  readonly radius: number;
  /** Radius of the masses' crowns, roughly: what a falling player meets first. */
  readonly crownRadius: number;
  /** The shell (rotates slowly about the centre to drift). */
  readonly sea = new THREE.Group();
  /** The far sea's frame: follows the camera, Y = local up. */
  readonly far = new THREE.Group();
  readonly birds?: SkyBirds;
  readonly castle?: THREE.Mesh;
  readonly glow?: SkyGlow;
  private seaLayer: PuffLayer;
  private ringLayer?: PuffLayer;
  private bankLayer?: PuffLayer;
  private mistLayer?: PuffLayer;
  private seaMat: THREE.ShaderMaterial;
  private farMats: THREE.ShaderMaterial[] = [];
  private discMat?: THREE.ShaderMaterial;
  private farLandMat?: THREE.ShaderMaterial;
  private floorR: number;
  private theta: Float32Array;
  private ringRho: Float32Array;
  private driftAxis = new THREE.Vector3(0.3, 0.2, 1).normalize();
  private driftW: number;
  private farQ = new THREE.Quaternion();
  private farUp = new THREE.Vector3(0, 1, 0);
  private limb = 0;
  private shellGaps: GapUniforms;
  private farGaps: GapUniforms;
  /** The tiled middle field, its material, and how far it has slid (frame space). */
  private tiles = new THREE.Group();
  private tileLayer?: PuffLayer;
  private tileMat?: THREE.ShaderMaterial;
  private slide = new THREE.Vector3();
  private lastFar?: THREE.Vector3;
  private lastT = 0;
  private frame = 0;

  constructor(opts: CloudSeaOptions) {
    this.center = opts.center.clone();
    const R = this.radius = opts.radius;
    const seed = opts.seed ?? 1;
    const rnd = rng(seed * 7919);
    this.driftW = (opts.drift ?? 0.6) / R;
    const base = new THREE.Vector3(), up = new THREE.Vector3();
    this.floorR = R - 4.5;

    // ---- openings onto the lands (shell: sea-local points on the sphere; far: frame-local xz)
    this.shellGaps = gapUniforms('sphere', R, 1);
    this.farGaps = gapUniforms('flat', 1, 0.3);
    if (opts.lands) {
      const sg = (opts.gaps ?? []).map(g => ({ p: g.at.clone().sub(this.center).setLength(R), r: g.r }));
      for (let k = 0; sg.length < 7 && k < 4; k++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
        sg.push({ p: new THREE.Vector3(Math.cos(a) * rr, z, Math.sin(a) * rr).multiplyScalar(R), r: 16 + rnd() * 14 });
      }
      sg.forEach((g, i) => this.shellGaps.uGaps.value[i].set(g.p.x, g.p.y, g.p.z, g.r));
      this.shellGaps.uNGaps.value = sg.length;
      const fg = (opts.farGaps ?? []).map(g => ({ x: Math.sin(g.azimuth) * g.distance, z: -Math.cos(g.azimuth) * g.distance, r: g.r }));
      for (let k = 0; fg.length < 8 && k < 6; k++) {
        const a = rnd() * Math.PI * 2, d = 200 + rnd() * 700;
        fg.push({ x: Math.sin(a) * d, z: -Math.cos(a) * d, r: 70 + rnd() * 140 });
      }
      fg.forEach((g, i) => this.farGaps.uGaps.value[i].set(g.x, 0, g.z, g.r));
      this.farGaps.uNGaps.value = fg.length;
    }
    const shellGap = (p: THREE.Vector3) => gapAtJS(this.shellGaps, p);

    // ---- the near sea: hand-placed and big hero masses first, then mid masses and small ones sunk lower in
    // what room is left, then low sunken tops in the valleys (a variable-radius scatter over the shell)
    const area = (R / 80) ** 2 * (opts.density ?? 1);
    type Cls = { n: number; r0: number; r1: number; h0: number; h1: number; sep: number; lift: number; shape: MassShape };
    const classes: Cls[] = [
      { n: Math.round(18 * area), r0: 18, r1: 28, h0: 0.85, h1: 1.1, sep: 0.8, lift: -6, shape: { detail: 1 } },
      { n: Math.round(22 * area), r0: 9, r1: 14, h0: 0.65, h1: 0.9, sep: 0.75, lift: -8.5, shape: { detail: 0.6, rim: 0.6 } },
      { n: Math.round(12 * area), r0: 4.5, r1: 7, h0: 0.55, h1: 0.75, sep: 0.9, lift: -8, shape: { detail: 0.4, rim: 0.4, skirt: 0.7 } },
      { n: Math.round(70 * area), r0: 7, r1: 13, h0: 0.32, h1: 0.45, sep: 0.55, lift: -9.5, shape: { detail: 0.3, rim: 0, skirt: 0, noBake: true } },
    ];
    const clear = (opts.clear ?? []).map(c => ({ dir: c.at.clone().sub(this.center).normalize(), cos: Math.cos(c.r / R) }));
    const placed: { up: THREE.Vector3; r: number }[] = [];
    const b = new PuffBuilder();
    const place = (upv: THREE.Vector3, hr: number, hh: number, lift: number, shape: MassShape) => {
      base.copy(upv).multiplyScalar(R + lift);
      addMass(b, base, upv, hr, hh, rnd, { flat: 0.9, ...shape });
    };
    for (const m of opts.masses ?? []) {
      up.copy(m.at).sub(this.center).normalize();
      if (shellGap(_v.copy(up).multiplyScalar(R)) > -0.25) continue;
      placed.push({ up: up.clone(), r: m.r });
      place(up, m.r, m.h ?? m.r * 1.0, -6, { detail: 1 });
    }
    for (const c of classes) {
      let made = 0;
      for (let tries = 0; made < c.n && tries < c.n * 40; tries++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
        up.set(Math.cos(a) * rr, z, Math.sin(a) * rr);
        const hr = c.r0 + (c.r1 - c.r0) * rnd() ** 1.3;
        // (broad openings stay open)
        if (shellGap(_v.copy(up).multiplyScalar(R)) > -0.2) continue;
        let ok = true;
        for (const p of placed) {
          const dd = Math.acos(Math.min(1, up.dot(p.up))) * R;
          if (dd < (hr + p.r) * c.sep) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push({ up: up.clone(), r: hr });
        made++;
        let hh = hr * (c.h0 + (c.h1 - c.h0) * rnd());
        // keep the sky clear under islands and the like: masses there stay low
        if (clear.some(q => up.dot(q.dir) > q.cos)) hh *= 0.45;
        place(up, hr, hh, c.lift + rnd() * 1.5, c.shape);
      }
    }
    // feathering: wispy flat cloud cards strung round the rim of every opening, so the lands never show a hard edge
    if (this.shellGaps.uNGaps.value > 0) this.featherGaps(b, this.shellGaps, rnd, (p, u) => { u.copy(p).normalize(); p.copy(u).multiplyScalar(R - 3); }, 3, 6);
    this.crownRadius = R + 7;
    this.seaMat = puffMaterial(SKY_CLOUDS, { billow: 1, depth: true, flatBottom: 0.6, mist: { top: -1.5, depth: 8 }, gaps: this.shellGaps });
    this.seaMat.uniforms.uCenter.value = this.center;
    this.seaMat.uniforms.uMistR.value = R;
    // (the shell's masses are kept out of its openings when they are placed, and drift with them)
    this.seaMat.uniforms.uGapFade.value = 0;
    this.seaLayer = new PuffLayer(b, this.seaMat);
    this.seaLayer.renderOrder = 4;
    this.sea.add(this.seaLayer.object);
    // per puff: how far round the shell it can still peek over the horizon (radians)
    const L = this.seaLayer;
    this.theta = new Float32Array(L.total);
    for (let i = 0; i < L.total; i++) {
      const r = Math.hypot(L.cx[i], L.cy[i], L.cz[i]);
      this.theta[i] = Math.acos(Math.min(1, this.floorR / (r + L.rad[i])));
    }
    this.sea.position.copy(this.center);
    // the floor of the sea (it drifts with the shell, so its openings do too)
    const floorMat = floorMaterial(false, this.shellGaps);
    floorMat.uniforms.uCenter.value = this.center;
    const floor = new THREE.Mesh(new THREE.SphereGeometry(this.floorR, 96, 64), floorMat);
    floor.renderOrder = 1.5;
    floor.userData.noOutline = true;
    this.sea.add(floor);
    this.group.add(this.sea);
    // the lands of the next world, far below the openings
    if (opts.lands) {
      const land = new THREE.Mesh(new THREE.SphereGeometry(R * 0.86, 96, 64), landsMaterial(this.center, false));
      land.renderOrder = 1.4;
      land.position.copy(this.center);
      land.userData.noOutline = true;
      this.group.add(land);
    }

    // ---- the far sea
    if (opts.far !== false) {
      const up0 = new THREE.Vector3(0, 1, 0);
      const fb = new PuffBuilder();
      const farGap = (x: number, z: number) => gapAtJS(this.farGaps, _v.set(x, 0, z));
      // two receding bands of big heaps beyond the middle field, each lighter and bluer, with open haze between
      const bands = [
        { x0: MID0 - 10, x1: 430, r0: 30, r1: 48, h0: 0.75, h1: 1.05, detail: 0.45, haze: 1, gap: 1.9 },
        { x0: 520, x1: 760, r0: 55, r1: 85, h0: 0.6, h1: 0.9, detail: 0.28, haze: 0.9, gap: 2.0 },
      ];
      for (const band of bands) {
        for (let x = band.x0; x < band.x1;) {
          const hr = band.r0 + (band.r1 - band.r0) * (x - band.x0) / (band.x1 - band.x0);
          const n = Math.floor((2 * Math.PI * x) / (hr * band.gap));
          const a0 = rnd() * Math.PI * 2;
          for (let k = 0; k < n; k++) {
            if (rnd() < 0.15) continue;
            const a = a0 + ((k + (rnd() - 0.5) * 0.7) / n) * Math.PI * 2;
            const d = x + (rnd() - 0.5) * hr * 0.8;
            const px = Math.sin(a) * d, pz = -Math.cos(a) * d;
            if (farGap(px, pz) > -0.1) continue;
            const big = rnd();
            const r = hr * (0.65 + big * big * 0.7);
            const h = r * (band.h0 + (band.h1 - band.h0) * rnd());
            base.set(px, -6 + (rnd() - 0.5) * 4, pz);
            addMass(fb, base, up0, r, h, rnd, { detail: band.detail, noBake: x > 400, haze: band.haze, rim: 0.6 });
          }
          x += hr * 1.6;
        }
      }
      // feather the far openings too
      if (this.farGaps.uNGaps.value > 0) this.featherGaps(fb, this.farGaps, rnd, p => { p.y = -4; }, 14, 30);
      // towering cumulus round the horizon: two or three per quadrant, rising well above the islands
      const castleAz = typeof opts.castle === 'object' ? opts.castle.azimuth : -0.35;
      const nT = opts.towers ?? 10;
      const towerAz: number[] = [];
      for (let k = 0; k < nT; k++) {
        let az = opts.towerAz?.[k] ?? (k / nT) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
        if (opts.towerAz?.[k] === undefined && opts.castle !== false && Math.abs(Math.atan2(Math.sin(az - castleAz), Math.cos(az - castleAz))) < 0.3) az += 0.6;
        towerAz.push(az);
        const d = 420 + rnd() * 320;
        base.set(Math.sin(az) * d, -12, -Math.cos(az) * d);
        // nearer towers are brighter (less hazed): walls of light at the edges of the view
        addTower(fb, base, up0, 70 + rnd() * 30, 170 + rnd() * 90, rnd, 0.45 + 0.25 * (d - 420) / 320);
      }
      const ringMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.9, nearFade: 0, flatBottom: 5, erode: 0.12, mist: { top: 0, depth: 14 }, gaps: this.farGaps });
      ringMat.uniforms.uRing.value.set(MID0, MID1, 1e9, 2e9);
      // (far masses and towers read as broad, bright walls: more of each in light, lit more as one mass)
      ringMat.uniforms.uLift.value = 0.1; ringMat.uniforms.uOwn.value = 0.28;
      this.farMats.push(ringMat);
      this.ringLayer = new PuffLayer(fb, ringMat, true);
      this.ringLayer.renderOrder = 2;
      const rl = this.ringLayer;
      this.ringRho = new Float32Array(rl.total);
      for (let i = 0; i < rl.total; i++) this.ringRho[i] = Math.hypot(rl.cx[i], rl.cz[i]) + rl.rad[i];
      this.far.add(rl.object);

      // the far bank: tall layered ridges of cumulus breaking the horizon line, and a few high wisps in the sky
      const bb = new PuffBuilder();
      const rows = [{ x: 900, r: 75, h: 0.9, haze: 0.6 }, { x: 1150, r: 95, h: 1.0, haze: 0.5 }, { x: 1420, r: 120, h: 1.05, haze: 0.42 }];
      for (const row of rows) {
        const n = Math.floor((2 * Math.PI * row.x) / (row.r * 1.5));
        const a0 = rnd() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + ((k + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
          const d = row.x + (rnd() - 0.5) * row.r;
          const r = row.r * (0.7 + rnd() * 0.6);
          // ridges swell and dip along the horizon
          const swell = 0.45 + 0.9 * (0.5 + 0.5 * Math.sin(a * 4 + row.x)) * (0.6 + 0.4 * rnd());
          base.set(Math.sin(a) * d, -20, -Math.cos(a) * d);
          addMass(bb, base, up0, r, r * row.h * swell, rnd, { detail: 0.15, rim: 0.4, noBake: true, skirt: 0.8, haze: row.haze });
        }
      }
      // high wisps: thin flat cloudlets far up, kept well away from the towers
      for (let k = 0, made = 0; made < 12 && k < 60; k++) {
        const a = rnd() * Math.PI * 2;
        if (towerAz.some(t => Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))) < 0.35)) continue;
        const d = 700 + rnd() * 700;
        base.set(Math.sin(a) * d, 300 + rnd() * 250, -Math.cos(a) * d);
        addMass(bb, base, up0, 18 + rnd() * 26, 5 + rnd() * 4, rnd, { detail: 0.15, rim: 0, noBake: true, skirt: 0.6, flat: 0.45, wisp: 1, haze: 0.5 });
        made++;
      }
      const bankMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.6, nearFade: 0, erode: 0.1, flatBottom: 8, mist: { top: -6, depth: 16 } });
      bankMat.uniforms.uLift.value = 0.12; bankMat.uniforms.uOwn.value = 0.25;
      this.farMats.push(bankMat);
      this.bankLayer = new PuffLayer(bb, bankMat);
      this.bankLayer.renderOrder = 1.8;
      this.far.add(this.bankLayer.object);

      // the middle distance (out to MID1): a field of hero masses, mid masses and sunken tops tiled with period
      // TILE that stays put in the world as the camera moves (the frame follows the camera, so the field slides
      // back by as much and wraps seamlessly)
      const tb = new PuffBuilder();
      const tmpl: { x: number; z: number; r: number; h: number; y: number; seed: number; shape: MassShape }[] = [];
      const tcls = [
        { n: 5, r0: 22, r1: 32, h: 1.0, y: -4, shape: { detail: 0.8 } as MassShape },
        { n: 5, r0: 9, r1: 14, h: 0.75, y: -8, shape: { detail: 0.45, rim: 0.5 } as MassShape },
        { n: 14, r0: 8, r1: 14, h: 0.4, y: -9, shape: { detail: 0.25, rim: 0, skirt: 0, noBake: true } as MassShape },
      ];
      for (const c of tcls) {
        let made = 0;
        for (let tries = 0; made < c.n && tries < 400; tries++) {
          const x = rnd() * TILE, z = rnd() * TILE, r = c.r0 + (c.r1 - c.r0) * rnd();
          // (periodic distance, so the tiles join without seams)
          const ok = tmpl.every(o => {
            const dx = Math.abs(o.x - x), dz = Math.abs(o.z - z);
            return Math.hypot(Math.min(dx, TILE - dx), Math.min(dz, TILE - dz)) > (o.r + r) * 0.72;
          });
          if (!ok) continue;
          tmpl.push({ x, z, r, h: r * c.h * (0.85 + rnd() * 0.3), y: c.y - rnd() * 1.5, seed: Math.floor(rnd() * 1e6) + 1, shape: c.shape });
          made++;
        }
      }
      const reach = MID1 + 30;
      for (let ti = -3; ti < 3; ti++) for (let tj = -3; tj < 3; tj++) {
        for (const h of tmpl) {
          const px = ti * TILE + h.x, pz = tj * TILE + h.z;
          if (Math.hypot(px, pz) > reach) continue;
          base.set(px, h.y, pz);
          addMass(tb, base, up0, h.r, h.h, rng(h.seed), { flat: 0.9, ...h.shape });
        }
      }
      this.tileMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 1, nearFade: 0, flatBottom: 0.6, mist: { top: -5, depth: 9 }, gaps: this.farGaps });
      this.farMats.push(this.tileMat);
      this.tileLayer = new PuffLayer(tb, this.tileMat);
      this.tileLayer.renderOrder = 2.75;
      this.tiles.add(this.tileLayer.object);
      this.far.add(this.tiles);
      // the deep misty floor under it all, open onto the lands through the far openings
      this.discMat = floorMaterial(true, this.farGaps);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2200, 128), this.discMat);
      disc.rotation.x = -Math.PI / 2; disc.position.y = -9; disc.renderOrder = 1;
      disc.userData.noOutline = true;
      this.far.add(disc);
      if (opts.lands) {
        this.farLandMat = landsMaterial(this.center, true);
        const land = new THREE.Mesh(new THREE.CircleGeometry(2600, 96), this.farLandMat);
        land.rotation.x = -Math.PI / 2; land.position.y = -70; land.renderOrder = 0.9;
        land.userData.noOutline = true;
        this.far.add(land);
      }
      // the far castle island, drawn in among the far sea's puffs (between the ones behind it and the ones in front)
      if (opts.castle !== false) {
        const c = typeof opts.castle === 'object' ? opts.castle : { azimuth: castleAz };
        const dist = c.distance ?? 900, h = c.height ?? 72, sc = 1.7;
        const geo = farIsleGeometry(seed + 2);
        this.castle = new THREE.Mesh(geo, farMaterial());
        this.castle.position.set(Math.sin(c.azimuth) * dist, h, -Math.cos(c.azimuth) * dist);
        // the viaduct side (the island's +Z side) faces the middle of the frame
        this.castle.rotation.y = Math.atan2(-this.castle.position.x, -this.castle.position.z);
        this.castle.scale.setScalar(sc);
        this.castle.updateMatrix();
        // seen from the middle of the frame, about where the camera's eye is
        sortTriangles(geo, new THREE.Vector3(0, 50, 0).applyMatrix4(this.castle.matrix.clone().invert()));
        (this.castle.material as THREE.ShaderMaterial).uniforms.uFloorY.value = -h / sc - 6;
        this.castle.renderOrder = 2.25;
        this.castle.userData.noOutline = true;
        this.far.add(this.castle);
        // mist where its waterfalls end, and a soft cloud collar round the foot of its rock
        const mb = new PuffBuilder();
        const feet = (geo.userData.falls as THREE.Vector3[]) ?? [];
        const qm = new THREE.Quaternion(), sm = new THREE.Vector3();
        for (const f of feet) {
          const w = f.clone().applyMatrix4(this.castle.matrix);
          for (let k = 0; k < 3; k++) {
            const s = (9 + rnd() * 7) * sc;
            const pm = w.clone().add(new THREE.Vector3((rnd() - 0.5) * s, -k * s * 0.4, (rnd() - 0.5) * s));
            sm.set(s * 1.3, s * 0.55, s);
            mb.add(pm, qm, sm, pm.clone().addScaledVector(up0, -s), s * 1.3, s * 1.1, rnd() * 100, 0.75, 0.9, 0.9);
          }
        }
        if (mb.count > 0) {
          const mm = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.5, nearFade: 0, erode: 0.2 });
          this.farMats.push(mm);
          this.mistLayer = new PuffLayer(mb, mm);
          this.mistLayer.mesh.renderOrder = 2.3;
          this.far.add(this.mistLayer.object);
        }
      }
      // distant flocks wheeling round the view, kept well away from the camera
      const nF = opts.flocks ?? 5;
      if (nF > 0) {
        const flocks: FlockSpec[] = [];
        for (let k = 0; k < nF; k++) {
          const az = rnd() * Math.PI * 2, d = 110 + rnd() * 160;
          flocks.push({
            center: new THREE.Vector3(Math.sin(az) * d, 55 + rnd() * 40, -Math.cos(az) * d),
            radius: 25 + rnd() * 40, speed: (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.05),
            birds: 5 + Math.floor(rnd() * 7), span: 1.5 + rnd() * 0.5,
          });
        }
        this.birds = new SkyBirds(flocks, seed + 4);
        this.far.add(this.birds.mesh);
      }
      this.group.add(this.far);
    } else this.ringRho = new Float32Array(0);
    if (opts.skyGlow !== false) {
      this.glow = new SkyGlow(SKY_CLOUDS.uSun);
      this.group.add(this.glow.mesh, this.glow.rays);
    }
  }

  /**
   * Wispy cloud cards round the rim of every opening of a gap space: flat, torn puffs straddling the edge, so the
   * lands below fade in behind veils of cloud. `toSurface` moves a gap-space point onto the sea (and gives up).
   */
  private featherGaps(b: PuffBuilder, gu: GapUniforms, rnd: () => number, toSurface: (p: THREE.Vector3, up: THREE.Vector3) => void, s0: number, s1: number) {
    const p = new THREE.Vector3(), u = new THREE.Vector3(0, 1, 0), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const sphere = gu.uGapMode.value > 1.5;
    for (let gi = 0; gi < gu.uNGaps.value; gi++) {
      const G = gu.uGaps.value[gi];
      const c = new THREE.Vector3(G.x, G.y, G.z);
      const n = Math.round((2 * Math.PI * G.w) / ((s0 + s1) * 1.2));
      if (sphere) u.copy(c).normalize(); else u.set(0, 1, 0);
      t1.set(1, 0, 0); if (Math.abs(u.x) > 0.9) t1.set(0, 0, 1);
      t1.addScaledVector(u, -t1.dot(u)).normalize(); t2.crossVectors(u, t1);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
        // march outward to the wobbly edge
        let d = 0;
        for (; d < G.w * 2.2; d += G.w * 0.04) {
          p.copy(c).addScaledVector(t1, Math.cos(a) * d).addScaledVector(t2, Math.sin(a) * d);
          if (gapAtJS(gu, p) < 0) break;
        }
        d += (rnd() - 0.3) * s1 * 0.5;
        p.copy(c).addScaledVector(t1, Math.cos(a) * d).addScaledVector(t2, Math.sin(a) * d);
        const up = new THREE.Vector3(0, 1, 0);
        toSurface(p, up);
        const s = s0 + (s1 - s0) * rnd();
        q.setFromUnitVectors(Y, up).multiply(new THREE.Quaternion().setFromAxisAngle(Y, rnd() * 6.28));
        sc.set(s * 1.7, s * 0.2, s * 1.1);
        // (lit as a low, flat mass of its own; fully wispy)
        b.add(p, q, sc, p.clone().addScaledVector(up, -s * 0.3), s * 1.6, s * 0.6, rnd() * 100, 1, 0.9, 0.85);
      }
    }
  }

  /**
   * Whether the sea writes the finish pass's cloud ink mask into alpha (default on). Turn it off together with
   * FINISH_CLOUD_MASK, so nothing leaves the alpha channel see-through.
   */
  setInkMask(on: boolean) {
    this.group.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && m.userData.cloudBlend) setCloudMask(m, on);
    });
    this.glow?.setInkMask(on);
  }

  /** Light: 0 midday .. 1 golden hour. */
  setGolden(k: number) {
    applyPalette(SKY_CLOUDS, k);
    this.glow?.setGolden(k);
    if (this.castle) {
      const u = (this.castle.material as THREE.ShaderMaterial).uniforms;
      u.uShade.value.set('#8f9fd2').lerp(new THREE.Color('#a596bc'), k);
      u.uLight.value.set('#fff4e2').lerp(new THREE.Color('#ffdcb0'), k);
    }
    this.birds?.setGolden(k);
  }

  /** The haze colour things fade into with distance (usually the fog / horizon colour) and how thick it is. */
  setHaze(color: THREE.ColorRepresentation, density = SKY_CLOUDS.uHazeD.value) {
    SKY_CLOUDS.uHaze.value.set(color);
    SKY_CLOUDS.uHazeD.value = density;
    if (this.birds) this.birds.mat.uniforms.uHaze.value.set(color);
    if (this.castle) {
      // the far island sinks into a deeper, bluer haze than the clouds
      (this.castle.material as THREE.ShaderMaterial).uniforms.uHaze.value.set(color).lerp(new THREE.Color('#a8bfe6'), 0.45);
    }
  }

  update(_dt: number, t: number, camera: THREE.Camera) {
    SKY_CLOUDS.uTime.value = t;
    const C = this.center;
    // drift: the shell turns slowly round its centre
    this.sea.quaternion.setFromAxisAngle(this.driftAxis, t * this.driftW);
    // the far frame: at the height of the sea's horizon circle under the camera, carried along with the camera's up
    camera.updateMatrixWorld();
    const cam = _cam.setFromMatrixPosition(camera.matrixWorld);
    _up.copy(cam).sub(C);
    const dE = Math.max(_up.length(), this.crownRadius * 1.01);
    _up.normalize();
    _q.setFromUnitVectors(this.farUp, _up);
    this.farQ.premultiply(_q);
    this.farUp.copy(_up);
    const Rt = this.crownRadius;
    const hp = (Rt * Rt) / dE;
    this.limb = Math.sqrt(Math.max(0, Rt * Rt - hp * hp));
    this.far.position.copy(C).addScaledVector(_up, hp);
    this.far.quaternion.copy(this.farQ);
    // the middle field stays put in the world (and drifts with the wind): undo the frame's slide across the plane
    if (this.lastFar) {
      _v.copy(this.far.position).sub(this.lastFar).applyQuaternion(_q.copy(this.farQ).invert());
      this.slide.x -= _v.x; this.slide.z -= _v.z;
    }
    const dt = Math.min(0.25, Math.max(0, t - this.lastT));
    this.slide.x += 0.6 * dt; this.slide.z += 0.2 * dt;
    this.lastT = t;
    (this.lastFar ??= new THREE.Vector3()).copy(this.far.position);
    const wrap = (v: number) => v - TILE * Math.floor(v / TILE + 0.5);
    this.slide.x = wrap(this.slide.x); this.slide.z = wrap(this.slide.z);
    this.tiles.position.set(this.slide.x, 0, this.slide.z);
    this.group.updateMatrixWorld(true);
    for (const m of this.farMats) { m.uniforms.uFlatUp.value.copy(_up); m.uniforms.uRingO.value.copy(this.far.position); }
    if (this.discMat) this.discMat.uniforms.uFlatUp.value.copy(_up);
    if (this.farLandMat) this.farLandMat.uniforms.uFlatUp.value.copy(_up);
    // gap spaces: the shell's drifts with the shell, the far one sits in the far frame
    this.shellGaps.uGapM.value.copy(_m.copy(this.sea.matrixWorld).invert());
    this.farGaps.uGapM.value.copy(_m.copy(this.far.matrixWorld).invert());
    this.birds?.update(t);
    this.glow?.update(camera, _up, t);

    // near sea: drop puffs hidden behind the planet's horizon
    const dCam = Math.hypot(cam.x - C.x, cam.y - C.y, cam.z - C.z);
    const inside = dCam < this.floorR;
    const thE = inside ? Math.PI : Math.acos(this.floorR / dCam);
    const L = this.seaLayer, th = this.theta;
    // (re-sorted every other frame, with a little margin round the view so a quick turn shows no gap)
    if (this.frame % 2 === 0) this.seaLayer.refresh(camera, inside ? undefined : (i, cl) => {
      const x = L.cx[i], y = L.cy[i], z = L.cz[i];
      const cosA = (x * cl.x + y * cl.y + z * cl.z) / (Math.hypot(x, y, z) * dCam);
      return cosA > Math.cos(Math.min(Math.PI, thE + th[i]));
    }, 0.08);
    // far sea: drop heaps inside the horizon circle (the near sea covers them)
    if (this.ringLayer) {
      // the castle is drawn between the puffs behind it and those in front
      this.ringLayer.nearDist = this.castle ? _v.setFromMatrixPosition(this.castle.matrixWorld).distanceTo(cam) - 60 : 0;
      const rho = this.ringRho;
      // (the far layers barely change from frame to frame: re-sort them every other / every fourth frame)
      if (this.frame % 2 === 0) this.ringLayer.refresh(camera, i => rho[i] > MID0, 0.25);
    }
    if (this.frame % 4 === 1) this.bankLayer?.refresh(camera, undefined, 0.25);
    if (this.frame % 4 === 3) this.mistLayer?.refresh(camera, undefined, 0.25);
    this.frame++;
    if (this.tileLayer && this.tileMat) {
      // fade in just inside the sea's horizon circle (the near sea hides what is further in), out into the bands
      const inner = this.limb, T = this.tileLayer, ox = this.slide.x, oz = this.slide.z;
      this.tileMat.uniforms.uRing.value.set(inner * 0.72, inner * 0.98, MID0, MID1);
      if (this.frame % 2 === 0) this.tileLayer.refresh(camera, i => {
        const r = Math.hypot(T.cx[i] + ox, T.cz[i] + oz);
        return r > inner * 0.7 - T.rad[i] - 25 && r < MID1 + T.rad[i] + 25;
      }, 0.08);
    }
  }

  /** Free the GPU resources. */
  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }

  /**
   * What was drawn last frame: puffs (two triangles each) of the near sea, middle field, far bands and bank,
   * plus the triangles of everything else (floors, lands, castle, birds, sky glow) and the draw calls.
   */
  get stats() {
    let solidTris = 0, calls = 0;
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      calls++;
      if ((m as THREE.InstancedMesh).isInstancedMesh) return;
      const g = m.geometry as THREE.InstancedBufferGeometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      solidTris += n * (g.isInstancedBufferGeometry ? g.instanceCount : 1);
    });
    const puffs = this.seaLayer.drawn + (this.tileLayer?.drawn ?? 0) + (this.ringLayer?.drawn ?? 0) + (this.bankLayer?.drawn ?? 0);
    return {
      calls, puffs, triangles: puffs * 2 + solidTris,
      seaPuffs: this.seaLayer.drawn, seaTotal: this.seaLayer.total,
      midPuffs: this.tileLayer?.drawn ?? 0, midTotal: this.tileLayer?.total ?? 0,
      farPuffs: this.ringLayer?.drawn ?? 0, farTotal: this.ringLayer?.total ?? 0,
      bankPuffs: this.bankLayer?.drawn ?? 0, bankTotal: this.bankLayer?.total ?? 0,
    };
  }
}
