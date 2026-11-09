import * as THREE from 'three';
import { NOISE_GLSL } from '../../render/paint';
import {
  PuffBuilder, PuffLayer, addHeap, sortTriangles, applyPalette, cloudUniforms, puffGeometry, puffMaterial, tangentFrame,
  type CloudUniforms,
} from './cloudPuffs';
import { SkyBirds, type FlockSpec } from './skyBirds';
import { farIsleGeometry, farMaterial } from './farIsle';

/**
 * The cloud sea of the Sky Isles: World 2's "ground", a deep rolling sea of white cumulus far below the islands.
 *
 * World 2 is a small planet, so the sea is a shell of cumulus heaps of radius R round a centre C. From island
 * height the shell's true horizon dips steeply (some 40 degrees at R = 80), so a flattened "far sea" continues
 * it outward from that horizon circle to the real horizon. The far sea's frame follows the camera like a sky
 * dome (Y = the camera's local up), and holds:
 *
 *   near sea   : ~95 heaps (~2300 puffs) over the whole shell; only those on the camera's side and in view are drawn
 *   floor      : a sphere under the heaps, so the valleys between them show clear blue depth, not sky
 *   middle     : out to 170 m, a field of heaps tiled with a 128 m period that stays put in the world (it slides
 *                back as the frame follows the camera, and wraps seamlessly), so nearby clouds have true parallax
 *   rings      : beyond, rings of ever-larger heaps out to ~1 km, fading into the haze, over a soft floor disc
 *   dressing   : towering cumulus round the horizon, flocks of gulls, the far castle-ruins island, and (lands)
 *                the green lands of the next world far below, seen through gaps in the far sea
 *
 * Use: const sea = new CloudSea({ center, radius }); scene.add(sea.group); each frame sea.update(dt, t, camera);
 * sea.setGolden(0..1) and sea.setHaze(fogColour) as the light changes. Keep sea.group at the scene root with an
 * identity transform (its children place themselves in world space).
 * All clouds are transparent and never write depth (so the finish pass draws no ink on them, nor through them),
 * sorted back to front on the CPU each frame; renderOrder 0..4 (pads 5, birds 6).
 */

/** Uniforms shared by every Sky Isles cloud (sea, far sea, pads), like PAINT is for the toon world. */
export const SKY_CLOUDS: CloudUniforms = cloudUniforms();

export interface CloudSeaOptions {
  center: THREE.Vector3;
  radius: number;
  seed?: number;
  /** Heaps on the shell (default scales with its area: ~95 at R = 80). */
  heaps?: number;
  /** Drift of the sea, metres per second along the shell (default 0.25). */
  drift?: number;
  /** The far, flattened sea out to the horizon, with its towers, birds and castle (default true). */
  far?: boolean;
  towers?: number;
  flocks?: number;
  /** The far castle island: false to leave it out, or where it stands (azimuth in radians from the frame's -Z, metres). */
  castle?: boolean | { azimuth: number; distance?: number; height?: number };
  /** Green lands of the next world far below, seen through gaps in the far sea (golden-hour bonus). */
  lands?: boolean;
  /** Places (world space) where the heaps stay low, e.g. under islands: { at, r } with r in metres along the sea. */
  clear?: { at: THREE.Vector3; r: number }[];
  /** Chance that a big heap builds a second tier (default 0.35). */
  towering?: number;
}

// ------------------------------------------------------------------ the floors: soft painted cloud under the heaps

function floorMaterial(flat: boolean, holes: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      ...SKY_CLOUDS,
      uCenter: { value: new THREE.Vector3() },
      uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlat: { value: flat ? 1 : 0 },
      uHoles: { value: holes ? 1 : 0 },
      uDrift: { value: new THREE.Vector3(0.12, 0, 0.05) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec2 vL;
      // (the far disc lies in its frame's XZ plane, rotated from the circle's XY)
      void main(){ vL = vec2(position.x, -position.y); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uMid, uBelly, uDeep, uHaze, uCenter, uFlatUp, uDrift, uGlow;
      uniform float uHazeD, uFlat, uHoles, uTime, uGlowK;
      varying vec3 vW; varying vec2 vL;
      ${NOISE_GLSL}
      ${GAP_GLSL}
      void main(){
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(vW - uCenter);
        vec3 q = vW * 0.05 + uDrift * uTime;
        float n = pNoise(q) * 0.55 + pNoise(q * 2.3 + 3.1) * 0.3 + pNoise(q * 5.7 + 7.0) * 0.15;
        float sunK = clamp(dot(up, uSun) * 0.6 + 0.55, 0.0, 1.0);
        // the depths between heaps: the clear blue air under the sea, with soft lighter wisps
        vec3 col = mix(uDeep * vec3(0.96, 1.0, 1.04), uBelly, smoothstep(0.32, 0.62, n));
        col = mix(col, mix(uMid, uTop, 0.5), smoothstep(0.55, 0.78, n) * sunK * 0.85);
        vec3 toCam = cameraPosition - vW;
        float d = length(toCam);
        float fwd = pow(max(dot(-toCam / d, uSun), 0.0), 6.0);
        col += uGlow * uGlowK * fwd * 0.25;
        vec3 haze = mix(uHaze, uGlow * 1.15, clamp(fwd * uGlowK * 0.6, 0.0, 0.7));
        col = mix(col, haze, 1.0 - exp(-pow(d * uHazeD, 1.5)));
        float a = 1.0;
        if (uHoles > 0.5) {
          float g = gapField(vL) + (pNoise(vW * 0.03) - 0.5) * 0.05;
          a = smoothstep(${GAP.toFixed(3)} - 0.03, ${GAP.toFixed(3)} + 0.03, g);
        }
        gl_FragColor = vec4(col, a);
      }`,
  });
}

/** The next world's green lands far below: fields, woods and shining rivers, mostly haze. */
function landsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uSun: SKY_CLOUDS.uSun, uHaze: SKY_CLOUDS.uHaze, uGlow: SKY_CLOUDS.uGlow },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec2 vL;
      void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uHaze, uGlow;
      varying vec3 vW; varying vec2 vL;
      ${NOISE_GLSL}
      void main(){
        vec3 p = vec3(vL * 0.01, 0.0);
        float n = pNoise(p) * 0.6 + pNoise(p * 2.7) * 0.4;
        float f = pNoise(p * 9.0 + 4.0);
        vec3 col = mix(vec3(0.20, 0.38, 0.15), vec3(0.48, 0.56, 0.24), smoothstep(0.35, 0.65, f));
        col = mix(col, vec3(0.20, 0.36, 0.20), smoothstep(0.58, 0.7, n));
        // rivers: thin bands along a noise contour, shining with the sky
        float rv = abs(pNoise(p * 1.3 + 9.0) - 0.5);
        col = mix(col, uGlow * 1.2 + 0.2, smoothstep(0.012, 0.004, rv));
        float d = length(cameraPosition - vW);
        col = mix(col, uHaze, clamp(0.22 + d * 0.0004, 0.0, 0.88));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ the sea

const _up = new THREE.Vector3(), _cam = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();

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
  private seaLayer: PuffLayer;
  private ringLayer?: PuffLayer;
  private seaMat: THREE.ShaderMaterial;
  private ringMat?: THREE.ShaderMaterial;
  private floorMat: THREE.ShaderMaterial;
  private discMat?: THREE.ShaderMaterial;
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

  constructor(opts: CloudSeaOptions) {
    this.center = opts.center.clone();
    const R = this.radius = opts.radius;
    let s = (opts.seed ?? 1) * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.driftW = (opts.drift ?? 0.25) / R;

    // ---- the near sea: heaps scattered over the shell (a jittered Fibonacci sphere)
    const nHeaps = opts.heaps ?? Math.round(95 * (R / 80) ** 2);
    const b = new PuffBuilder();
    const base = new THREE.Vector3(), up = new THREE.Vector3(), top = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));
    const clear = (opts.clear ?? []).map(c => ({ dir: c.at.clone().sub(this.center).normalize(), cos: Math.cos(c.r / R) }));
    for (let i = 0; i < nHeaps; i++) {
      const y = 1 - (2 * (i + 0.5)) / nHeaps;
      const rr = Math.sqrt(1 - y * y), a = i * golden;
      up.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      tangentFrame(up, _t1, _t2);
      up.addScaledVector(_t1, (rnd() - 0.5) * 0.14).addScaledVector(_t2, (rnd() - 0.5) * 0.14).normalize();
      // a rolling sea: big heaped masses and small ones, with deep valleys between them
      const big = rnd();
      const hr = 11 + big * big * 17 + rnd() * 3;
      let hh = Math.min(17, hr * (0.4 + rnd() * 0.5));
      // keep the sky clear under islands and the like: heaps there stay low
      const low = clear.some(c => up.dot(c.dir) > c.cos);
      if (low) hh *= 0.45;
      const lift = -3.5 + rnd() * 3;
      base.copy(up).multiplyScalar(R + lift);
      addHeap(b, base, up, hr, hh, rnd, { n: 11 + Math.round(big * 11), billows: 0.4, puff: Math.min(1, 15 / hr) });
      // now and then a second tier: a cumulus building up toward the islands
      if (!low && big > 0.6 && rnd() < (opts.towering ?? 0.35)) {
        top.copy(base).addScaledVector(up, hh * 0.5).addScaledVector(_t1, (rnd() - 0.5) * hr * 0.3);
        addHeap(b, top, up, hr * 0.62, hh * (0.8 + rnd() * 0.3), rnd, { n: 10, billows: 0.6, tall: 0.4 });
      }
    }
    this.crownRadius = R + 6;
    this.seaMat = puffMaterial(SKY_CLOUDS, { billow: 1 });
    this.seaMat.uniforms.uCenter.value = this.center;
    this.seaLayer = new PuffLayer(b, puffGeometry(2), this.seaMat, { geo: puffGeometry(3), dist: 75 });
    this.seaLayer.renderOrder = 4;
    this.sea.add(this.seaLayer.object);
    // per puff: how far round the shell it can still peek over the horizon (radians)
    this.floorR = R - 5;
    const L = this.seaLayer;
    this.theta = new Float32Array(L.total);
    for (let i = 0; i < L.total; i++) {
      const r = Math.hypot(L.cx[i], L.cy[i], L.cz[i]);
      this.theta[i] = Math.acos(Math.min(1, this.floorR / (r + L.rad[i])));
    }
    this.sea.position.copy(this.center);
    // the floor of the sea
    this.floorMat = floorMaterial(false, false);
    this.floorMat.uniforms.uCenter.value = this.center;
    const floor = new THREE.Mesh(new THREE.SphereGeometry(this.floorR, 96, 64), this.floorMat);
    floor.renderOrder = 1.5;
    floor.position.copy(this.center);
    this.group.add(this.sea, floor);

    // ---- the far sea
    if (opts.far !== false) {
      const fb = new PuffBuilder();
      const up0 = new THREE.Vector3(0, 1, 0);
      const lands = !!opts.lands;
      // beyond the tiled field: rings of heaps, growing with distance so each ring holds about the same number
      for (let x = MID0 - 5; x < 1000;) {
        const hr = 6 + 0.085 * x;
        const n = Math.floor((2 * Math.PI * x) / (hr * 1.9));
        const a0 = rnd() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + ((k + (rnd() - 0.5) * 0.7) / n) * Math.PI * 2;
          const d = x + (rnd() - 0.5) * hr * 0.9;
          const px = Math.sin(a) * d, pz = -Math.cos(a) * d;
          // gaps over the lands below: the heaps thin out and shrink at their edges
          const g = lands ? gapField(px, pz) : 1;
          if (g < GAP && rnd() < 0.9) continue;
          const shrink = lands ? 0.55 + 0.45 * Math.min(1, Math.max(0, (g - GAP) / 0.12)) : 1;
          const r = hr * (0.75 + rnd() * 0.5) * shrink;
          // far heaps grow wide to keep their detail on screen, but stay low so the horizon stays clear
          const h = Math.min(r * (0.4 + rnd() * 0.3), 5 + 0.022 * x);
          base.set(px, (rnd() - 0.55) * r * 0.35, pz);
          addHeap(fb, base, up0, r, h, rnd, { n: x < 300 ? 8 : x < 600 ? 6 : 5, billows: x < 300 ? 0.3 : 0 }, 1);
        }
        x += hr * 1.3;
      }
      // towering cumulus round the horizon: a broad base, then heaps stacked up, leaning a little
      const castleAz = typeof opts.castle === 'object' ? opts.castle.azimuth : -0.35;
      const nT = opts.towers ?? 7;
      for (let k = 0; k < nT; k++) {
        let az = (k / nT) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        if (opts.castle !== false && Math.abs(Math.atan2(Math.sin(az - castleAz), Math.cos(az - castleAz))) < 0.3) az += 0.6;
        const d = 420 + rnd() * 280;
        const cx = Math.sin(az) * d, cz = -Math.cos(az) * d;
        const tall = 80 + rnd() * 110;
        let r0 = 70 + rnd() * 30, y = -12;
        const leanX = (rnd() - 0.5) * 0.3, leanZ = (rnd() - 0.5) * 0.3;
        // the whole tower is lit as one mass: a tall dome over its foot
        const mass = { base: new THREE.Vector3(cx, -12, cz), R: r0 * 0.9, H: tall + 30 };
        for (let j = 0; j < 6; j++) {
          const h = r0 * (0.75 + rnd() * 0.25);
          base.set(cx + leanX * y + (rnd() - 0.5) * r0 * 0.35, y, cz + leanZ * y + (rnd() - 0.5) * r0 * 0.35);
          addHeap(fb, base, up0, r0, h, rnd, { n: j === 0 ? 14 : 12, tall: 0.5, flat: 0.95, billows: 0.9, mass }, 0.75);
          y += h * 0.5;
          r0 *= 0.8 + rnd() * 0.08;
          if (y > tall) break;
        }
      }
      this.ringMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.8, nearFade: 0 });
      this.ringMat.uniforms.uRing.value.set(MID0, MID1, 1e9, 2e9);
      this.ringLayer = new PuffLayer(fb, puffGeometry(2), this.ringMat, { geo: puffGeometry(2), dist: 0 });
      this.ringLayer.renderOrder = 2;
      const rl = this.ringLayer;
      this.ringRho = new Float32Array(rl.total);
      for (let i = 0; i < rl.total; i++) this.ringRho[i] = Math.hypot(rl.cx[i], rl.cz[i]) + rl.rad[i];
      this.far.add(rl.object);

      // the middle distance (out to MID1): a field of heaps tiled with period TILE that stays put in the world as
      // the camera moves (the frame follows the camera, so the field slides back by as much and wraps seamlessly)
      const tb = new PuffBuilder();
      const tmpl: { x: number; z: number; r: number; h: number; y: number; seed: number }[] = [];
      const G = 7, cell = TILE / G;
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
        // mostly middling heaps, and now and then a big mound that rises over its neighbours
        const big = rnd() < 0.14;
        const r = big ? 20 + rnd() * 8 : 10 + rnd() * rnd() * 10;
        const hh = r * (big ? 0.65 + rnd() * 0.25 : 0.42 + rnd() * 0.35);
        tmpl.push({ x: (i + 0.15 + rnd() * 0.7) * cell, z: (j + 0.15 + rnd() * 0.7) * cell, r, h: hh, y: (rnd() - 0.6) * 3, seed: Math.floor(rnd() * 1e6) + 1 });
      }
      const reach = MID1 + TILE * 0.75;
      for (let ti = -3; ti < 3; ti++) for (let tj = -3; tj < 3; tj++) {
        for (const h of tmpl) {
          const px = ti * TILE + h.x, pz = tj * TILE + h.z;
          if (Math.hypot(px, pz) > reach) continue;
          let hs = h.seed * 9301 + 49297;
          const hr = () => ((hs = (hs * 16807) % 2147483647) / 2147483647);
          base.set(px, h.y, pz);
          addHeap(tb, base, up0, h.r, h.h, hr, { n: h.r > 19 ? 14 : 8, billows: 0.3 }, 1);
        }
      }
      this.tileMat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.9, nearFade: 0 });
      this.tileLayer = new PuffLayer(tb, puffGeometry(2), this.tileMat);
      this.tileLayer.renderOrder = 2.75;
      this.tiles.add(this.tileLayer.object);
      this.far.add(this.tiles);
      // the soft floor under it all
      this.discMat = floorMaterial(true, lands);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1700, 72), this.discMat);
      disc.rotation.x = -Math.PI / 2; disc.position.y = -4; disc.renderOrder = 1;
      this.far.add(disc);
      if (lands) {
        const land = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), landsMaterial());
        land.rotation.x = -Math.PI / 2; land.position.y = -80; land.renderOrder = 0;
        this.far.add(land);
      }
      // the far castle island, drawn in among the far sea's puffs (between the ones behind it and the ones in front)
      if (opts.castle !== false) {
        const c = typeof opts.castle === 'object' ? opts.castle : { azimuth: castleAz };
        const dist = c.distance ?? 650, h = c.height ?? 48, sc = 1.2;
        const geo = farIsleGeometry(opts.seed ?? 3);
        this.castle = new THREE.Mesh(geo, farMaterial());
        this.castle.position.set(Math.sin(c.azimuth) * dist, h, -Math.cos(c.azimuth) * dist);
        this.castle.rotation.y = -c.azimuth + 0.4;
        this.castle.scale.setScalar(sc);
        this.castle.updateMatrix();
        // seen from the middle of the frame, about where the camera's eye is
        sortTriangles(geo, new THREE.Vector3(0, 50, 0).applyMatrix4(this.castle.matrix.clone().invert()));
        (this.castle.material as THREE.ShaderMaterial).uniforms.uFloorY.value = -h / sc;
        this.castle.renderOrder = 2.25;
        this.castle.userData.noOutline = true;
        this.far.add(this.castle);
      }
      // distant flocks wheeling round the view
      const nF = opts.flocks ?? 5;
      if (nF > 0) {
        const flocks: FlockSpec[] = [];
        for (let k = 0; k < nF; k++) {
          const az = rnd() * Math.PI * 2, d = 50 + rnd() * 110;
          flocks.push({
            center: new THREE.Vector3(Math.sin(az) * d, 40 + rnd() * 30, -Math.cos(az) * d),
            radius: 20 + rnd() * 40, speed: (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.06),
            birds: 4 + Math.floor(rnd() * 7), span: 1.6 + rnd() * 0.6,
          });
        }
        this.birds = new SkyBirds(flocks, (opts.seed ?? 1) + 4);
        this.far.add(this.birds.mesh);
      }
      this.group.add(this.far);
    } else this.ringRho = new Float32Array(0);
  }

  /** Light: 0 midday .. 1 golden hour. */
  setGolden(k: number) {
    applyPalette(SKY_CLOUDS, k);
    if (this.castle) {
      const m = this.castle.material as THREE.ShaderMaterial;
      m.uniforms.uShade.value.set('#7f8fc4').lerp(new THREE.Color('#9a86b8'), k);
      m.uniforms.uHazeK.value = 0.58 + k * 0.05;
    }
  }

  /** The haze colour things fade into with distance (usually the fog / horizon colour) and how thick it is. */
  setHaze(color: THREE.ColorRepresentation, density = SKY_CLOUDS.uHazeD.value) {
    SKY_CLOUDS.uHaze.value.set(color);
    SKY_CLOUDS.uHazeD.value = density;
    if (this.birds) this.birds.mat.uniforms.uHaze.value.set(color);
    if (this.castle) {
      // the far island sinks into a deeper, bluer haze than the clouds
      (this.castle.material as THREE.ShaderMaterial).uniforms.uHaze.value.set(color).lerp(new THREE.Color('#a4bde6'), 0.35);
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
    this.slide.x += 0.25 * dt; this.slide.z += 0.08 * dt;
    this.lastT = t;
    (this.lastFar ??= new THREE.Vector3()).copy(this.far.position);
    const wrap = (v: number) => v - TILE * Math.floor(v / TILE + 0.5);
    this.slide.x = wrap(this.slide.x); this.slide.z = wrap(this.slide.z);
    this.tiles.position.set(this.slide.x, 0, this.slide.z);
    this.group.updateMatrixWorld(true);
    for (const m of [this.ringMat, this.tileMat]) if (m) { m.uniforms.uFlatUp.value.copy(_up); m.uniforms.uRingO.value.copy(this.far.position); }
    if (this.discMat) this.discMat.uniforms.uFlatUp.value.copy(_up);
    if (this.birds) this.birds.update(t);

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
      this.ringLayer.nearDist = this.castle ? _v.setFromMatrixPosition(this.castle.matrixWorld).distanceTo(cam) : 0;
      const rho = this.ringRho;
      this.ringLayer.refresh(camera, i => rho[i] > MID0);
    }
    if (this.tileLayer && this.tileMat) {
      // fade in just inside the sea's horizon circle (the near sea hides what is further in), out into the rings
      const inner = this.limb, T = this.tileLayer, ox = this.slide.x, oz = this.slide.z;
      this.tileMat.uniforms.uRing.value.set(inner * 0.72, inner * 0.98, MID0, MID1);
      this.tileLayer.refresh(camera, i => {
        const r = Math.hypot(T.cx[i] + ox, T.cz[i] + oz);
        return r > inner * 0.7 - T.rad[i] && r < MID1 + T.rad[i];
      });
    }
  }

  /** Free the GPU resources (shared puff spheres stay cached for other users). */
  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }

  /** What was drawn last frame: puffs and triangles of the near and far seas. */
  get stats() {
    return {
      seaPuffs: this.seaLayer.drawn, seaTris: this.seaLayer.triangles,
      midPuffs: this.tileLayer?.drawn ?? 0, midTris: this.tileLayer?.triangles ?? 0,
      farPuffs: this.ringLayer?.drawn ?? 0, farTris: this.ringLayer?.triangles ?? 0,
    };
  }
}

/** The tiled middle field: tile size, and where it hands over to the rings (metres across the far plane). */
const TILE = 128, MID0 = 135, MID1 = 170;

/** Where the far sea opens over the lands below (far-frame x, z): the same smooth field on the CPU and GPU. */
const GAP = 0.36;
function gapField(x0: number, z0: number) {
  // (turned and scaled so the widest openings lie a few hundred metres out, toward the frame's +X / -Z)
  const x = (x0 * 0.6216 - z0 * 0.7833) * 2.0, z = (z0 * 0.6216 + x0 * 0.7833) * 2.0;
  return 0.5 + 0.3 * Math.sin(x * 0.0045 + 1.3) * Math.sin(z * 0.0052 + 0.4) + 0.2 * Math.sin((x * 0.8 + z) * 0.0031 + 2.1);
}
const GAP_GLSL = /* glsl */ `
  float gapField(vec2 q){
    vec2 p = vec2(q.x * 0.6216 - q.y * 0.7833, q.y * 0.6216 + q.x * 0.7833) * 2.0;
    return 0.5 + 0.3 * sin(p.x * 0.0045 + 1.3) * sin(p.y * 0.0052 + 0.4) + 0.2 * sin((p.x * 0.8 + p.y) * 0.0031 + 2.1);
  }
`;
