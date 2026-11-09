import * as THREE from 'three';
import { NOISE_GLSL } from '../../render/paint';
import {
  PuffBuilder, PuffLayer, addCumulus, addTower, sortTriangles, applyPalette, cloudUniforms, cloudBlend, puffMaterial,
  type CloudUniforms,
} from './cloudPuffs';
import { SkyBirds, type FlockSpec } from './skyBirds';
import { farIsleGeometry, farMaterial } from './farIsle';
import { SkyGlow } from './skyGlow';

/**
 * The cloud sea of the Sky Isles: World 2's "ground", a deep rolling sea of white cumulus far below the islands.
 *
 * World 2 is a small planet, so the sea is a shell of cumulus heaps of radius R round a centre C. From island
 * height the shell's true horizon dips steeply (some 40 degrees at R = 80), so a flattened "far sea" continues
 * it outward from that horizon circle to the real horizon. The far sea's frame follows the camera like a sky
 * dome (Y = the camera's local up), and holds:
 *
 *   near sea   : a few big heaped masses (16-25 m) with mid heaps and small ones scattered between, and real open
 *                valleys; only the heaps on the camera's side and in view are drawn
 *   floor      : a sphere under the heaps, so the valleys show deep, darker periwinkle air, not sky
 *   middle     : out to 240 m, a field of heaps tiled with a 160 m period that stays put in the world (it slides
 *                back as the frame follows the camera, and wraps seamlessly), so nearby clouds have true parallax
 *   rings      : beyond, rows of ever-larger, simpler heaps out to ~800 m, fading into the haze
 *   bank       : a grand far bank of tall cumulus ridges rising over the horizon line (850-1400 m), so the seam
 *                between sea and sky is soft and layered, plus a few high cloudlets in the sky
 *   dressing   : towering cumulus round the horizon, flocks of gulls, the far castle-ruins island, the sky glow,
 *                and (lands) the green lands of the next world far below, seen through irregular openings
 *
 * Use: const sea = new CloudSea({ center, radius }); scene.add(sea.group); each frame sea.update(dt, t, camera);
 * sea.setGolden(0..1) and sea.setHaze(fogColour) as the light changes. Keep sea.group at the scene root with an
 * identity transform (its children place themselves in world space). Turn FINISH_CLOUD_MASK (render/finish.ts)
 * on in a world with this sea, so ink does not show through the clouds.
 * All clouds are transparent impostors that never write colour depth, sorted back to front on the CPU each
 * frame; renderOrder 0..4 (pads 5, birds 6, sky glow -9).
 */

/** Uniforms shared by every Sky Isles cloud (sea, far sea, pads), like PAINT is for the toon world. */
export const SKY_CLOUDS: CloudUniforms = cloudUniforms();

export interface CloudSeaOptions {
  center: THREE.Vector3;
  radius: number;
  seed?: number;
  /** Scales the number of heaps on the shell (default 1). */
  density?: number;
  /** Drift of the sea, metres per second along the shell (default 0.6). */
  drift?: number;
  /** The far, flattened sea out to the horizon, with its bank, towers, birds and castle (default true). */
  far?: boolean;
  towers?: number;
  /** Azimuths (radians, frame -Z = 0) for the first towers; the rest spread round the horizon. */
  towerAz?: number[];
  flocks?: number;
  /** The far castle island: false to leave it out, or where it stands (azimuth in radians from the frame's -Z, metres). */
  castle?: boolean | { azimuth: number; distance?: number; height?: number };
  /** Green lands of the next world far below, seen through openings in the sea's floor . */
  lands?: boolean;
  /** Places (world space) where the heaps stay low, e.g. under islands: { at, r } with r in metres along the sea. */
  clear?: { at: THREE.Vector3; r: number }[];
  /** The sky glow dome (default true). */
  skyGlow?: boolean;
}

// ------------------------------------------------------------------ the floors: deep painted air under the heaps

function floorMaterial(flat: boolean, holes: boolean) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      ...SKY_CLOUDS,
      uCenter: { value: new THREE.Vector3() },
      uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlat: { value: flat ? 1 : 0 },
      uHoles: { value: holes ? 1 : 0 },
      uDrift: { value: new THREE.Vector3(0.3, 0, 0.12) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uMid, uBelly, uDeep, uSkyShade, uHaze, uCenter, uFlatUp, uDrift, uGlow;
      uniform float uHazeD, uFlat, uHoles, uTime, uGlowK;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(vW - uCenter);
        vec3 q = vW * 0.045 + uDrift * uTime * 0.1;
        float n = pNoise(q) * 0.55 + pNoise(q * 2.3 + 3.1) * 0.3 + pNoise(q * 5.7 + 7.0) * 0.15;
        float sunK = clamp(dot(up, uSun) * 0.6 + 0.4, 0.0, 1.0);
        // the depths between heaps: deep, darker periwinkle air, with soft lighter wisps lying in it
        vec3 col = mix(uDeep * vec3(0.84, 0.88, 0.96), uDeep * 1.02, smoothstep(0.3, 0.6, n));
        col = mix(col, mix(uBelly, uSkyShade, 0.4), smoothstep(0.56, 0.8, n) * sunK * 0.7);
        vec3 toCam = cameraPosition - vW;
        float d = length(toCam);
        float fwd = pow(max(dot(-toCam / d, uSun), 0.0), 6.0);
        col += uGlow * uGlowK * fwd * 0.2;
        vec3 haze = mix(uHaze, uGlow * 1.1, clamp(fwd * uGlowK * 0.5, 0.0, 0.7));
        col = mix(col, haze, 1.0 - exp(-pow(d * uHazeD, 1.5)));
        float a = 1.0;
        if (uHoles > 0.5) {
          // irregular openings onto the lands below (about a third of the floor)
          vec3 pc = vW - uCenter;
          float g = pNoise(pc * 0.035 + 11.0) * 0.62 + pNoise(pc * 0.1 + 3.0) * 0.26 + pNoise(pc * 0.3) * 0.12;
          a = 1.0 - smoothstep(0.455, 0.485, g);
          // a soft bright lip of mist round each opening
          col = mix(col, mix(uBelly, uSkyShade, 0.6), smoothstep(0.39, 0.465, g) * 0.6);
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
  return cloudBlend(m);
}

/**
 * The next world's green lands far below (golden-hour bonus): a sphere inside the sea's floor, seen through its
 * openings. Its fields, woods and rivers are drawn small, so they read as very far down; hills shade with the low
 * sun, rivers catch it, and everything sinks into warm gold haze.
 */
function landsMaterial(center: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uSun: SKY_CLOUDS.uSun, uHaze: SKY_CLOUDS.uHaze, uGlow: SKY_CLOUDS.uGlow, uCenter: { value: center } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uHaze, uGlow, uCenter;
      varying vec3 vW;
      ${NOISE_GLSL}
      float hills(vec3 p){ return pNoise(p * 0.06) * 0.6 + pNoise(p * 0.15 + 3.0) * 0.28 + pNoise(p * 0.4 + 1.0) * 0.12; }
      void main(){
        vec3 p = vW - uCenter;
        vec3 up = normalize(p);
        // relief: soft hills shaded by the low sun (slope from the height field)
        vec3 t1 = normalize(cross(up, vec3(0.0, 0.0, 1.0))), t2 = cross(up, t1);
        float h = hills(p), hx = hills(p + t1 * 0.8), hz = hills(p + t2 * 0.8);
        vec3 n = normalize(up - (t1 * (hx - h) + t2 * (hz - h)) * 6.0);
        float lit = clamp(dot(n, uSun) * 1.4 + 0.55, 0.25, 1.25);
        // patchwork: meadows, warm fields, dark woods on the hill tops
        float f = pNoise(p * 0.5), f2 = pNoise(p * 1.3 + 5.0);
        vec3 col = mix(vec3(0.34, 0.55, 0.2), vec3(0.6, 0.66, 0.28), smoothstep(0.42, 0.6, f));
        col = mix(col, vec3(0.78, 0.7, 0.36), smoothstep(0.7, 0.8, f2) * 0.6);
        col = mix(col, vec3(0.16, 0.32, 0.17), smoothstep(0.56, 0.68, h));
        col *= lit;
        // rivers: winding ribbons along a warped noise contour; they shine where they mirror the sun
        vec3 wp = p + vec3(pNoise(p * 0.05), pNoise(p * 0.05 + 7.0), pNoise(p * 0.05 + 9.0)) * 14.0;
        float rv = abs(pNoise(wp * 0.07 + 4.0) - 0.5);
        float river = smoothstep(0.02, 0.008, rv);
        vec3 V = normalize(vW - cameraPosition);
        float glint = pow(max(dot(reflect(V, up), uSun), 0.0), 10.0);
        col = mix(col, vec3(0.6, 0.72, 0.82) * 0.85 + uGlow * (0.5 + 2.0 * glint), river);
        // aerial perspective: deep warm haze, glaring toward the sun
        float d = length(cameraPosition - vW);
        float fwd = pow(max(dot(V, uSun), 0.0), 3.0);
        vec3 haze = mix(uHaze, uGlow * 1.1, 0.3 + 0.5 * fwd);
        col = mix(col, haze, clamp(0.18 + d * 0.0025 + fwd * 0.2, 0.0, 0.92));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ the sea

const _up = new THREE.Vector3(), _cam = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/** A seeded random in [0, 1). */
function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  s = (s * 9301 + 49297) % 2147483647;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class CloudSea {
  group = new THREE.Group();
  readonly center: THREE.Vector3;
  readonly radius: number;
  /** Radius of the heaps' crowns, roughly: what a falling player meets first. */
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
  private seaMat: THREE.ShaderMaterial;
  private farMats: THREE.ShaderMaterial[] = [];
  private floorMat: THREE.ShaderMaterial;
  private discMat?: THREE.ShaderMaterial;
  private landsMat?: THREE.ShaderMaterial;
  private floorR: number;
  private theta: Float32Array;
  private ringRho: Float32Array;
  private driftAxis = new THREE.Vector3(0.3, 0.2, 1).normalize();
  private driftW: number;
  private farQ = new THREE.Quaternion();
  private farUp = new THREE.Vector3(0, 1, 0);
  private limb = 0;
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

    // ---- the near sea: big heaped masses first, then mid heaps and small ones in what room is left,
    // with real open valleys between them (a variable-radius scatter over the shell)
    const area = (R / 80) ** 2 * (opts.density ?? 1);
    const classes = [
      { n: Math.round(26 * area), r0: 15, r1: 25, h0: 0.85, h1: 1.15, sep: 0.82, lift: -5 },
      { n: Math.round(80 * area), r0: 7, r1: 13, h0: 0.8, h1: 1.05, sep: 0.8, lift: -3.5 },
      { n: Math.round(90 * area), r0: 3, r1: 6, h0: 0.7, h1: 0.95, sep: 1.0, lift: -2.6 },
    ];
    const clear = (opts.clear ?? []).map(c => ({ dir: c.at.clone().sub(this.center).normalize(), cos: Math.cos(c.r / R) }));
    const placed: { up: THREE.Vector3; r: number }[] = [];
    const b = new PuffBuilder();
    for (const c of classes) {
      let made = 0;
      for (let tries = 0; made < c.n && tries < c.n * 40; tries++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
        up.set(Math.cos(a) * rr, z, Math.sin(a) * rr);
        const hr = c.r0 + (c.r1 - c.r0) * rnd() ** 1.3;
        let ok = true;
        for (const p of placed) {
          const dd = Math.acos(Math.min(1, up.dot(p.up))) * R;
          if (dd < (hr + p.r) * c.sep * (p.r > 15 && hr > 15 ? 1.0 : 0.85)) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push({ up: up.clone(), r: hr });
        made++;
        let hh = hr * (c.h0 + (c.h1 - c.h0) * rnd());
        // keep the sky clear under islands and the like: heaps there stay low
        if (clear.some(q => up.dot(q.dir) > q.cos)) hh *= 0.45;
        base.copy(up).multiplyScalar(R + c.lift + rnd() * 1.5);
        addCumulus(b, base, up, hr, hh, rnd, { detail: hr > 15 ? 1 : 0.85, skirt: hr > 6 ? 1 : 0.6, flat: 0.92 });
      }
    }
    this.crownRadius = R + 7;
    this.seaMat = puffMaterial(SKY_CLOUDS, { billow: 1, depth: true, flatBottom: 0.6 });
    this.seaMat.uniforms.uCenter.value = this.center;
    this.seaLayer = new PuffLayer(b, this.seaMat);
    this.seaLayer.renderOrder = 4;
    this.sea.add(this.seaLayer.object);
    // per puff: how far round the shell it can still peek over the horizon (radians)
    this.floorR = R - 4.5;
    const L = this.seaLayer;
    this.theta = new Float32Array(L.total);
    for (let i = 0; i < L.total; i++) {
      const r = Math.hypot(L.cx[i], L.cy[i], L.cz[i]);
      this.theta[i] = Math.acos(Math.min(1, this.floorR / (r + L.rad[i])));
    }
    this.sea.position.copy(this.center);
    // the floor of the sea
    this.floorMat = floorMaterial(false, !!opts.lands);
    this.floorMat.uniforms.uCenter.value = this.center;
    const floor = new THREE.Mesh(new THREE.SphereGeometry(this.floorR, 96, 64), this.floorMat);
    floor.renderOrder = 1.5;
    floor.position.copy(this.center);
    floor.userData.noOutline = true;
    this.group.add(this.sea, floor);
    // the lands of the next world, far below the openings in the floor
    if (opts.lands) {
      this.landsMat = landsMaterial(this.center);
      const land = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 96, 64), this.landsMat);
      land.renderOrder = 1.4;
      land.position.copy(this.center);
      land.userData.noOutline = true;
      this.group.add(land);
    }

    // ---- the far sea
    if (opts.far !== false) {
      const up0 = new THREE.Vector3(0, 1, 0);
      const fb = new PuffBuilder();
      // beyond the tiled field: rows of heaps, bigger and simpler with distance, with open gaps between them
      for (let x = MID0 - 10; x < 820;) {
        const hr = 12 + 0.085 * x;
        const n = Math.floor((2 * Math.PI * x) / (hr * 2.3));
        const a0 = rnd() * Math.PI * 2;
        const detail = Math.max(0.16, Math.min(0.5, 70 / x));
        for (let k = 0; k < n; k++) {
          if (rnd() < 0.18) continue;
          const a = a0 + ((k + (rnd() - 0.5) * 0.7) / n) * Math.PI * 2;
          const d = x + (rnd() - 0.5) * hr * 0.9;
          const px = Math.sin(a) * d, pz = -Math.cos(a) * d;
          const big = rnd();
          const r = hr * (0.6 + big * big * 0.9);
          const h = r * (0.6 + rnd() * 0.35);
          base.set(px, -3 + (rnd() - 0.5) * 4, pz);
          addCumulus(fb, base, up0, r, h, rnd, { detail, billows: 0.6, noBake: x > 500 });
        }
        x += hr * 1.7;
      }
      // towering cumulus round the horizon
      const castleAz = typeof opts.castle === 'object' ? opts.castle.azimuth : -0.35;
      const nT = opts.towers ?? 6;
      for (let k = 0; k < nT; k++) {
        let az = opts.towerAz?.[k] ?? (k / nT) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
        if (opts.towerAz?.[k] === undefined && opts.castle !== false && Math.abs(Math.atan2(Math.sin(az - castleAz), Math.cos(az - castleAz))) < 0.35) az += 0.7;
        const d = 480 + rnd() * 260;
        base.set(Math.sin(az) * d, -10, -Math.cos(az) * d);
        addTower(fb, base, up0, 55 + rnd() * 25, 110 + rnd() * 60, rnd, 0.7);
      }
      const ringMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.9, nearFade: 0, flatBottom: 4, erode: 0.12 });
      ringMat.uniforms.uRing.value.set(MID0, MID1, 1e9, 2e9);
      this.farMats.push(ringMat);
      this.ringLayer = new PuffLayer(fb, ringMat, true);
      this.ringLayer.renderOrder = 2;
      const rl = this.ringLayer;
      this.ringRho = new Float32Array(rl.total);
      for (let i = 0; i < rl.total; i++) this.ringRho[i] = Math.hypot(rl.cx[i], rl.cz[i]) + rl.rad[i];
      this.far.add(rl.object);

      // the far bank: layered ridges of tall cumulus rising over the horizon, and a few high cloudlets
      const bb = new PuffBuilder();
      const rows = [{ x: 880, r: 60, h: 0.55, haze: 0.62 }, { x: 1100, r: 80, h: 0.65, haze: 0.5 }, { x: 1380, r: 105, h: 0.7, haze: 0.42 }];
      for (const row of rows) {
        const n = Math.floor((2 * Math.PI * row.x) / (row.r * 1.6));
        const a0 = rnd() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + ((k + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
          const d = row.x + (rnd() - 0.5) * row.r;
          const r = row.r * (0.7 + rnd() * 0.6);
          // ridges swell and dip along the horizon
          const swell = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(a * 5 + row.x)) * (0.6 + 0.4 * rnd());
          base.set(Math.sin(a) * d, -14, -Math.cos(a) * d);
          addCumulus(bb, base, up0, r, r * row.h * swell, rnd, { detail: 0.14, billows: 0.5, noBake: true, skirt: 0.8, haze: row.haze });
        }
      }
      // high cloudlets: small flat puffs of alto-cumulus far up in the sky
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2, d = 500 + rnd() * 900;
        base.set(Math.sin(a) * d, 160 + rnd() * 260, -Math.cos(a) * d);
        addCumulus(bb, base, up0, 12 + rnd() * 22, 5 + rnd() * 5, rnd, { detail: 0.2, billows: 0.3, noBake: true, skirt: 0.5, noCore: true, flat: 0.5, haze: 0.55 });
      }
      const bankMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.6, nearFade: 0, erode: 0.1 });
      this.farMats.push(bankMat);
      this.bankLayer = new PuffLayer(bb, bankMat);
      this.bankLayer.renderOrder = 1.8;
      this.far.add(this.bankLayer.object);

      // the middle distance (out to MID1): a field of heaps tiled with period TILE that stays put in the world as
      // the camera moves (the frame follows the camera, so the field slides back by as much and wraps seamlessly)
      const tb = new PuffBuilder();
      const tmpl: { x: number; z: number; r: number; h: number; y: number; seed: number }[] = [];
      const tcls = [{ n: 6, r0: 15, r1: 23, h: 0.95 }, { n: 18, r0: 7, r1: 12, h: 0.85 }, { n: 16, r0: 3.5, r1: 6, h: 0.75 }];
      for (const c of tcls) {
        let made = 0;
        for (let tries = 0; made < c.n && tries < 400; tries++) {
          const x = rnd() * TILE, z = rnd() * TILE, r = c.r0 + (c.r1 - c.r0) * rnd();
          // (periodic distance, so the tiles join without seams)
          const ok = tmpl.every(o => {
            const dx = Math.abs(o.x - x), dz = Math.abs(o.z - z);
            return Math.hypot(Math.min(dx, TILE - dx), Math.min(dz, TILE - dz)) > (o.r + r) * 0.82;
          });
          if (!ok) continue;
          tmpl.push({ x, z, r, h: r * c.h * (0.8 + rnd() * 0.4), y: -3 - rnd() * 1.5, seed: Math.floor(rnd() * 1e6) + 1 });
          made++;
        }
      }
      const reach = MID1 + 30;
      for (let ti = -3; ti < 3; ti++) for (let tj = -3; tj < 3; tj++) {
        for (const h of tmpl) {
          const px = ti * TILE + h.x, pz = tj * TILE + h.z;
          if (Math.hypot(px, pz) > reach) continue;
          base.set(px, h.y, pz);
          addCumulus(tb, base, up0, h.r, h.h, rng(h.seed), { detail: 0.6, skirt: h.r > 6 ? 1 : 0.6, flat: 0.92 });
        }
      }
      this.tileMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 1, nearFade: 0, flatBottom: 0.6 });
      this.farMats.push(this.tileMat);
      this.tileLayer = new PuffLayer(tb, this.tileMat);
      this.tileLayer.renderOrder = 2.75;
      this.tiles.add(this.tileLayer.object);
      this.far.add(this.tiles);
      // the deep floor under it all
      this.discMat = floorMaterial(true, false);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1800, 96), this.discMat);
      disc.rotation.x = -Math.PI / 2; disc.position.y = -6; disc.renderOrder = 1;
      this.far.add(disc);
      // the far castle island, drawn in among the far sea's puffs (between the ones behind it and the ones in front)
      if (opts.castle !== false) {
        const c = typeof opts.castle === 'object' ? opts.castle : { azimuth: castleAz };
        const dist = c.distance ?? 620, h = c.height ?? 80, sc = 1.15;
        const geo = farIsleGeometry(seed + 2);
        this.castle = new THREE.Mesh(geo, farMaterial());
        this.castle.position.set(Math.sin(c.azimuth) * dist, h, -Math.cos(c.azimuth) * dist);
        // the arcade (the island's +Z side) faces the middle of the frame
        this.castle.rotation.y = Math.atan2(-this.castle.position.x, -this.castle.position.z);
        this.castle.scale.setScalar(sc);
        this.castle.updateMatrix();
        // seen from the middle of the frame, about where the camera's eye is
        sortTriangles(geo, new THREE.Vector3(0, 50, 0).applyMatrix4(this.castle.matrix.clone().invert()));
        (this.castle.material as THREE.ShaderMaterial).uniforms.uFloorY.value = -h / sc - 4;
        this.castle.renderOrder = 2.25;
        this.castle.userData.noOutline = true;
        this.far.add(this.castle);
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
      this.group.add(this.glow.mesh);
    }
  }

  /** Light: 0 midday .. 1 golden hour. */
  setGolden(k: number) {
    applyPalette(SKY_CLOUDS, k);
    this.glow?.setGolden(k);
    if (this.castle) {
      const u = (this.castle.material as THREE.ShaderMaterial).uniforms;
      u.uShade.value.set('#9aa4d6').lerp(new THREE.Color('#9a86b8'), k);
      u.uLight.value.set('#fff6e8').lerp(new THREE.Color('#ffd9a8'), k);
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
      (this.castle.material as THREE.ShaderMaterial).uniforms.uHaze.value.set(color).lerp(new THREE.Color('#a9c0e8'), 0.3);
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
    this.birds?.update(t);
    this.glow?.update(camera, _up);

    // near sea: drop puffs hidden behind the planet's horizon
    const dCam = Math.hypot(cam.x - C.x, cam.y - C.y, cam.z - C.z);
    const inside = dCam < this.floorR;
    const thE = inside ? Math.PI : Math.acos(this.floorR / dCam);
    const L = this.seaLayer, th = this.theta;
    this.seaLayer.refresh(camera, inside ? undefined : (i, cl) => {
      const x = L.cx[i], y = L.cy[i], z = L.cz[i];
      const cosA = (x * cl.x + y * cl.y + z * cl.z) / (Math.hypot(x, y, z) * dCam);
      return cosA > Math.cos(Math.min(Math.PI, thE + th[i]));
    });
    // far sea: drop heaps inside the horizon circle (the near sea covers them)
    if (this.ringLayer) {
      // the castle is drawn between the puffs behind it and those in front
      this.ringLayer.nearDist = this.castle ? _v.setFromMatrixPosition(this.castle.matrixWorld).distanceTo(cam) - 40 : 0;
      const rho = this.ringRho;
      // (the far layers barely change from frame to frame: re-sort them every other / every fourth frame)
      if (this.frame % 2 === 0) this.ringLayer.refresh(camera, i => rho[i] > MID0, 0.25);
    }
    if (this.frame % 4 === 1) this.bankLayer?.refresh(camera, undefined, 0.25);
    this.frame++;
    if (this.tileLayer && this.tileMat) {
      // fade in just inside the sea's horizon circle (the near sea hides what is further in), out into the rings
      const inner = this.limb, T = this.tileLayer, ox = this.slide.x, oz = this.slide.z;
      this.tileMat.uniforms.uRing.value.set(inner * 0.72, inner * 0.98, MID0, MID1);
      this.tileLayer.refresh(camera, i => {
        const r = Math.hypot(T.cx[i] + ox, T.cz[i] + oz);
        return r > inner * 0.7 - T.rad[i] - 25 && r < MID1 + T.rad[i] + 25;
      });
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
   * What was drawn last frame: puffs (two triangles each) of the near sea, middle field, far rings and bank,
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

/** The tiled middle field: tile size, and where it hands over to the rings (metres across the far plane). */
const TILE = 160, MID0 = 200, MID1 = 240;

