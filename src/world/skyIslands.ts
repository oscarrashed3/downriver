// The other worlds seen from the first one: "Look up."
// Each later world is painted once into a picture of itself (rendered from the real world, so the moon in the sky is
// the place you will walk on), then hung in the sky like a far moon with a haze of its own air around it,
// soft painted cloud banks drifting across, a few birds, and the home light blinking on the farthest one.
// For the far views (the title, the sky view) it also builds the cloud sea: big cumulus banks round the worlds.
import * as THREE from 'three';
import type { Planet } from './planet';
import { WORLDS } from './worlds';
import { smoothstep } from './noise';
import { PAINT } from '../render/paint';

// ------------------------------------------------------------------ painted clouds

/** A soft gouache cumulus bank on a canvas: warm lit crowns, cool lavender bellies, a hazy melting base. */
export function paintCloud(seed: number, w = 512, h = 256): HTMLCanvasElement {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const base = h * 0.72;
  // a row of billows along a bumpy crown, the big ones in the middle
  const puffs: { x: number; y: number; r: number }[] = [];
  const n = 9 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const mid = Math.sin(t * Math.PI);
    const rad = h * (0.13 + mid * 0.2 + r() * 0.08);
    puffs.push({ x: w * (0.1 + t * 0.8) + (r() - 0.5) * w * 0.05, y: base - rad * (0.35 + r() * 0.35) - mid * h * 0.12, r: rad });
  }
  // second row of smaller crowns on top
  for (let i = 0; i < 5; i++) {
    const t = 0.25 + r() * 0.5;
    const rad = h * (0.09 + r() * 0.1);
    puffs.push({ x: w * t, y: base - h * (0.38 + r() * 0.16), r: rad });
  }
  // keep every billow inside the canvas, so no bank ever shows a straight cut edge
  for (const p of puffs) p.r = Math.max(4, Math.min(p.r, p.y - 6, p.x - 6, w - p.x - 6));
  x.filter = 'blur(1.6px)';
  // shade mass first, then each billow's lit body over it, lit from the upper left
  for (const p of puffs) {
    const g = x.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.45, p.r * 0.1, p.x, p.y, p.r * 1.05);
    g.addColorStop(0, 'rgba(255,251,242,1)');
    g.addColorStop(0.45, 'rgba(250,244,240,1)');
    g.addColorStop(0.8, 'rgba(214,212,234,1)');
    g.addColorStop(1, 'rgba(196,198,226,0.0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
  }
  // a flat cool belly underneath that thins away
  const belly = x.createLinearGradient(0, base - h * 0.12, 0, h);
  belly.addColorStop(0, 'rgba(206,208,232,0.95)');
  belly.addColorStop(0.5, 'rgba(214,216,238,0.55)');
  belly.addColorStop(1, 'rgba(220,224,242,0)');
  x.fillStyle = belly;
  x.beginPath(); x.ellipse(w * 0.5, base, w * 0.42, h * 0.14, 0, 0, Math.PI * 2); x.fill();
  // a few dry-brush strokes of warm light along the crowns
  x.filter = 'blur(0.8px)';
  x.globalCompositeOperation = 'source-atop';
  for (const p of puffs) {
    x.strokeStyle = `rgba(255,236,206,${0.25 + r() * 0.2})`;
    x.lineWidth = p.r * 0.12;
    x.beginPath(); x.arc(p.x + p.r * 0.05, p.y + p.r * 0.1, p.r * 0.85, Math.PI * 1.1, Math.PI * 1.65); x.stroke();
  }
  // melt the base and the far ends into the air
  x.globalCompositeOperation = 'destination-in';
  x.filter = 'none';
  const fade = x.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.62, 'rgba(0,0,0,1)'); fade.addColorStop(0.95, 'rgba(0,0,0,0)');
  x.fillStyle = fade; x.fillRect(0, 0, w, h);
  const side = x.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.1, 'rgba(0,0,0,1)'); side.addColorStop(0.9, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = side; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** A radial glow: a soft core, or (ring > 0) a halo that peaks at that fraction of the radius. */
function glowTexture(ring = 0, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (ring > 0) {
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(ring * 0.9, 'rgba(255,255,255,0.55)');
    g.addColorStop(ring, 'rgba(255,255,255,0.75)');
    g.addColorStop(ring + (1 - ring) * 0.25, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  }
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** The home light: a warm point with a soft halo and four fine rays, like a star seen through damp air. */
export function beaconTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!;
  const m = size / 2;
  const g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,244,1)'); g.addColorStop(0.1, 'rgba(255,246,206,1)'); g.addColorStop(0.2, 'rgba(255,214,140,0.75)'); g.addColorStop(0.42, 'rgba(255,190,120,0.22)'); g.addColorStop(1, 'rgba(255,170,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'lighter';
  for (const [dx, dy, len] of [[1, 0, 0.95], [0, 1, 0.8], [0.7, 0.7, 0.35], [0.7, -0.7, 0.35]] as const) {
    const lg = x.createLinearGradient(m - dx * m * len, m - dy * m * len, m + dx * m * len, m + dy * m * len);
    lg.addColorStop(0, 'rgba(255,220,160,0)'); lg.addColorStop(0.5, 'rgba(255,240,210,0.8)'); lg.addColorStop(1, 'rgba(255,220,160,0)');
    x.strokeStyle = lg; x.lineWidth = size * 0.03;
    x.beginPath(); x.moveTo(m - dx * m * len, m - dy * m * len); x.lineTo(m + dx * m * len, m + dy * m * len); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/** A gull seen from below, as a single soft brush stroke; frame 0 wings up, 1 level, 2 down. */
function birdTexture(frame: number): THREE.CanvasTexture {
  const w = 128, h = 64;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const tip = [-22, -4, 14][frame], mid = [-14, -6, 4][frame];
  x.strokeStyle = 'rgba(255,255,255,1)'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = 9;
  x.beginPath();
  x.moveTo(10, h / 2 + tip);
  x.quadraticCurveTo(34, h / 2 + mid - 10, w / 2 - 6, h / 2 + 2);
  x.quadraticCurveTo(w / 2, h / 2 + 6, w / 2 + 6, h / 2 + 2);
  x.quadraticCurveTo(w - 34, h / 2 + mid - 10, w - 10, h / 2 + tip);
  x.stroke();
  x.fillStyle = 'white'; x.beginPath(); x.ellipse(w / 2, h / 2 + 3, 5, 4, 0, 0, Math.PI * 2); x.fill();
  return new THREE.CanvasTexture(c);
}

const cloudTex: THREE.CanvasTexture[] = [];
function cloudTexture(i: number) {
  if (!cloudTex.length) for (let k = 0; k < 5; k++) { const t = new THREE.CanvasTexture(paintCloud(k + 3)); t.colorSpace = THREE.SRGBColorSpace; cloudTex.push(t); }
  return cloudTex[i % cloudTex.length];
}

/** A painted cloud sprite. Its colour is multiplied in, so the same bank can be warm, cool or dusky. */
function cloudSprite(i: number, w: number, color = '#ffffff', opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(i), color, transparent: true, opacity, depthWrite: false, fog: false }));
  s.scale.set(w, w * 0.5, 1);
  return s;
}

// ------------------------------------------------------------------ the cloud sea, seen from far away

/**
 * Big cumulus banks in loose rings round the column of worlds, and a wide floor of them under the last one, for the
 * far views (the title and the sky view). Painted with the sky's own cloud material, so they match the towers seen
 * from the ground. The world's scattered small cumulus reads as popcorn from far away, so these take over there.
 */
export class CloudSea {
  mesh: THREE.InstancedMesh;
  constructor(scene: THREE.Scene, planets: Planet[], material: THREE.Material) {
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const axis = new THREE.Vector3();
    planets.forEach(p => axis.add(p.center)); axis.divideScalar(planets.length);
    const top = planets[0].center.y, bottom = planets[planets.length - 1].center.y;
    const banks: { c: THREE.Vector3; w: number }[] = [];
    const layers = planets.length + 1;
    for (let L = 0; L < layers; L++) {
      const last = L === layers - 1;
      const y = last ? bottom - 150 : top - 190 - L * (top - bottom) / (layers - 2) + (r() - 0.5) * 40;
      const n = last ? 22 : 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.5;
        const rad = last ? 60 + r() * 760 : 280 + r() * 420;
        const c = new THREE.Vector3(axis.x + Math.cos(a) * rad, y + (r() - 0.5) * 50, axis.z + Math.sin(a) * rad);
        // keep the worlds themselves clear
        if (planets.some(p => p.center.distanceTo(c) < p.R + 110)) continue;
        banks.push({ c, w: last ? 110 + r() * 90 : 70 + r() * 70 });
      }
    }
    const per = 16;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), material, banks.length * per);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let i = 0;
    for (const b of banks) {
      for (let j = 0; j < per; j++) {
        // a flat-bottomed heap: wide low billows round the edge, a few big crowns in the middle
        const ring = j < 10, ang = r() * Math.PI * 2, d = ring ? (0.45 + r() * 0.55) * b.w : r() * 0.35 * b.w;
        const size = ring ? b.w * (0.22 + r() * 0.14) : b.w * (0.3 + r() * 0.18);
        p.set(b.c.x + Math.cos(ang) * d, b.c.y + (ring ? 0 : size * 0.35) + (r() - 0.5) * 6, b.c.z + Math.sin(ang) * d * 0.8);
        sc.set(size, size * 0.62, size);
        m.compose(p, q, sc);
        this.mesh.setMatrixAt(i++, m);
      }
    }
    this.mesh.count = i;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** k: 0 hidden .. 1 shown. (Opaque, so it simply comes in once the far view is far enough out.) */
  update(_t: number, k: number) { this.mesh.visible = k > 0.5; }
  get group() { return this.mesh; }
}

// ------------------------------------------------------------------ the worlds as moons

interface Moon {
  planet: Planet;
  tex: THREE.WebGLRenderTarget | null;
  disc: THREE.Mesh;
  halo: THREE.Sprite;
  /** the world's radius as a fraction of half the picture */
  frac: number;
  /** where the home light falls on the picture, in -1..1 picture coordinates (last world only) */
  light?: THREE.Vector2;
}

const islandVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const islandFrag = /* glsl */ `
  uniform sampler2D map; uniform vec3 uHaze; uniform float uHazeK, uOpacity, uMist; uniform vec3 uMistCol;
  varying vec2 vUv;
  void main(){
    vec4 t = texture2D(map, vUv) * smoothstep(0.5, 0.47, length(vUv - 0.5));
    vec3 c = t.rgb;
    // the far worlds sit in the blue of the sky, a little lifted and softened
    c = mix(c, uHaze * t.a, uHazeK);
    c = mix(c, c * 1.12 + vec3(0.02, 0.015, 0.03) * t.a, 0.5);
    // their lower parts sink into cloud
    float mist = smoothstep(0.42, 0.08, vUv.y) * uMist;
    c = mix(c, uMistCol * t.a, mist);
    gl_FragColor = vec4(c, t.a) * uOpacity;
  }`;

export interface IslandsCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  planets: Planet[];
  /** +1 if the real sun is to the right of the shot, -1 if to the left: the worlds are lit from that side. */
  sunSide: number;
  sunLight: THREE.DirectionalLight;
  /** Called before each world is painted, to light it as itself (its own palette). */
  light: (i: number) => void;
  /** Things to hide while painting: the sky, its clouds, the streams, the updrafts, the motes. */
  hide: THREE.Object3D[];
  homePos: THREE.Vector3;
}

/** Sky moons for the "Look up." shot. */
export class SkyIslands {
  group = new THREE.Group();
  moons: Moon[] = [];
  /** Painted banks: `moon` >= 0 sits just under that world's lower rim (so it rises out of cloud), -1 hangs low in the sky. */
  clouds: { s: THREE.Sprite; moon: number; el: number; az: number; dist: number; w: number; drift: number; o: number }[] = [];
  birds: { s: THREE.Sprite; frames: THREE.Texture[]; ph: number; off: THREE.Vector3 }[] = [];
  beacon: THREE.Sprite;
  beaconGlow: THREE.Sprite;
  baked = false;
  /** the frame the moons hang in: local up, the way Nilo faces, and to his right */
  up = new THREE.Vector3(0, 1, 0);
  fwd = new THREE.Vector3(0, 0, 1);
  right = new THREE.Vector3(1, 0, 0);
  origin = new THREE.Vector3();
  /** -1 mirrors the layout left to right (so the nearest world sits on the far side of the frame from Nilo). */
  flip = 1;
  /** Where each moon hangs: elevation and azimuth (degrees, from fwd toward right), angular size, distance. */
  layout = [
    { el: 39, az: -19, size: 21, dist: 2400, haze: 0.05 },
    { el: 51, az: 16, size: 13, dist: 3000, haze: 0.13 },
    { el: 60, az: -3, size: 8.5, dist: 3700, haze: 0.22 },
  ];
  constructor(scene: THREE.Scene, planets: Planet[]) {
    for (let i = 1; i < planets.length; i++) {
      const p = planets[i];
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null }, uHaze: { value: new THREE.Color('#9fc3ee') }, uHazeK: { value: 0.1 }, uOpacity: { value: 0 },
          uMist: { value: 0.25 }, uMistCol: { value: new THREE.Color('#f4eef4') },
        },
        vertexShader: islandVert, fragmentShader: islandFrag,
        transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      disc.renderOrder = 3;
      const sky = new THREE.Color(WORLDS[i].palette.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.35);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0.72), color: sky, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      halo.renderOrder = 2;
      this.group.add(halo, disc);
      this.moons.push({ planet: p, tex: null, disc, halo, frac: 0.8 });
    }
    // banks of painted cloud: one or two under each world, and a few low across the sky
    let s = 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const add = (moon: number, el: number, az: number, dist: number, w: number, o: number, tint: string) => {
      const sp = cloudSprite(this.clouds.length, 1, tint, 1);
      sp.renderOrder = moon >= 0 ? 4 : 5;
      this.clouds.push({ s: sp, moon, el, az, dist, w, drift: (0.3 + r() * 0.4) * (r() < 0.5 ? -1 : 1), o });
      this.group.add(sp);
    };
    this.layout.forEach((_, k) => {
      add(k, -0.52, -0.35, 0.45, 1.5, 0.95, '#fff6ee');
      add(k, -0.62, 0.45, 0.4, 1.2, 0.9, '#f3f1fb');
    });
    for (let k = 0; k < 6; k++) add(-1, 14 + r() * 12, -60 + k * 24 + (r() - 0.5) * 10, 700 + r() * 600, 0.5 + r() * 0.2, 0.9, k % 2 ? '#fff4ec' : '#f2f0fb');
    // a little flock, crossing slowly: painted gull shapes in three wing positions
    const frames = [0, 1, 2].map(f => birdTexture(f));
    for (let k = 0; k < 7; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], color: '#66708f', transparent: true, opacity: 0, depthWrite: false, fog: false }));
      sp.renderOrder = 7;
      this.birds.push({ s: sp, frames, ph: r() * 6.28, off: new THREE.Vector3((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.6 + (r() - 0.5), -Math.ceil(k / 2) * 1.5 + (r() - 0.5) * 0.8, Math.ceil(k / 2) * 1.8) });
      this.group.add(sp);
    }
    const bt = beaconTexture();
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
    this.beacon.renderOrder = 9;
    // a warm halo with ordinary blending, so the light still reads where it sits over bright cloud
    this.beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe2a0', sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.beaconGlow.renderOrder = 8;
    this.group.add(this.beaconGlow, this.beacon);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Paint each later world once into a picture, lit from the side so it reads as a round world. */
  bake(c: IslandsCtx) {
    if (this.baked) return;
    this.baked = true;
    const size = 512;
    const cam = new THREE.PerspectiveCamera(26, 1, 1, 1000);
    const oldTarget = c.renderer.getRenderTarget();
    const oldClear = c.renderer.getClearColor(new THREE.Color()), oldAlpha = c.renderer.getClearAlpha();
    const fog = c.scene.fog as THREE.FogExp2 | null, oldDensity = fog?.density ?? 0;
    const vis = c.hide.map(o => o.visible);
    c.hide.forEach(o => (o.visible = false));
    this.group.visible = false;
    const sc = c.sunLight.shadow.camera;
    const oldShadow = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
    const oldSun = c.sunLight.position.clone(), oldSunT = c.sunLight.target.position.clone();
    this.moons.forEach((m, k) => {
      const p = m.planet, i = p.index;
      const reach = p.R + p.cfg.amplitude * 1.5 + 26;
      // the side worth seeing: the river winding through the middle, or for the last one the lighthouse
      let view = p.pathPoint(0.42).clone().normalize().addScaledVector(new THREE.Vector3(0, 1, 0), 0.55).normalize();
      if (i === c.planets.length - 1) {
        // the lighthouse up on the shoulder of the world, toward the light, not dead in the middle
        // (search the turn that puts it up and a little to the side of the picture, above the cloud the world sits in)
        const h = c.homePos.clone().sub(p.center).normalize();
        const tilt = new THREE.Vector3().crossVectors(h, new THREE.Vector3(0, 1, 0)).normalize();
        const probe = new THREE.PerspectiveCamera(cam.fov, 1, 1, 2000);
        let bestErr = Infinity;
        for (let a = -0.9; a <= 0.9; a += 0.1) for (let b = -0.6; b <= 0.6; b += 0.2) {
          const v = h.clone().applyAxisAngle(tilt, a).applyAxisAngle(new THREE.Vector3(0, 1, 0), b).normalize();
          probe.position.copy(p.center).addScaledVector(v, 400); probe.up.set(0, 1, 0); probe.lookAt(p.center); probe.updateMatrixWorld();
          const q = c.homePos.clone().project(probe);
          const err = Math.hypot(q.y - 0.42, Math.abs(q.x) - 0.22) + Math.max(0, 0.45 - v.dot(h)) * 3;
          if (err < bestErr) { bestErr = err; view = v; }
        }
      }
      m.frac = (p.R + p.cfg.amplitude * 0.5) / reach / 1.02;
      const dist = reach / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.02;
      cam.position.copy(p.center).addScaledVector(view, dist);
      cam.up.set(0, 1, 0);
      cam.near = Math.max(1, dist - reach * 1.6); cam.far = dist + reach * 1.6;
      cam.lookAt(p.center);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      c.light(i);
      if (fog) fog.density = 0;
      // lit from the side the real sun is on in the shot, at about sixty degrees, so each world has a soft terminator
      const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const sun = view.clone().multiplyScalar(0.55).addScaledVector(camRight, 0.68 * c.sunSide).addScaledVector(camUp, 0.48).normalize();
      PAINT.uSun.value.copy(sun);
      c.sunLight.intensity = 2.6;
      PAINT.uSunCol.value.copy(c.sunLight.color);
      c.sunLight.position.copy(p.center).addScaledVector(sun, 200);
      c.sunLight.target.position.copy(p.center);
      c.sunLight.target.updateMatrixWorld();
      sc.left = -reach; sc.right = reach; sc.top = reach; sc.bottom = -reach; sc.far = 420; sc.updateProjectionMatrix();
      const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, type: THREE.HalfFloatType });
      c.renderer.setRenderTarget(rt);
      c.renderer.setClearColor(0x000000, 0);
      c.renderer.clear();
      c.renderer.render(c.scene, cam);
      m.tex = rt;
      const u = (m.disc.material as THREE.ShaderMaterial).uniforms;
      u.map.value = rt.texture;
      u.uHaze.value.set(WORLDS[i].palette.skyTop).lerp(new THREE.Color('#bcd4f2'), 0.6);
      if (i === c.planets.length - 1) {
        const q = c.homePos.clone().project(cam);
        m.light = new THREE.Vector2(q.x, q.y);
      }
      void k;
    });
    sc.left = oldShadow[0]; sc.right = oldShadow[1]; sc.top = oldShadow[2]; sc.bottom = oldShadow[3]; sc.far = oldShadow[4]; sc.updateProjectionMatrix();
    c.sunLight.position.copy(oldSun); c.sunLight.target.position.copy(oldSunT);
    if (fog) fog.density = oldDensity;
    c.hide.forEach((o, k) => (o.visible = vis[k]));
    c.renderer.setRenderTarget(oldTarget);
    c.renderer.setClearColor(oldClear, oldAlpha);
  }

  /** Hang the moons in the sky above someone standing at `origin` with this up, looking along `fwd`. */
  setFrame(origin: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, flip = 1) {
    this.flip = flip;
    this.nudge = this.layout.map(() => [0, 0]);
    this.origin.copy(origin);
    this.up.copy(up).normalize();
    this.fwd.copy(fwd).projectOnPlane(this.up).normalize();
    this.right.crossVectors(this.fwd, this.up).normalize();
  }

  private hidden: { i: number; m: THREE.Matrix4 }[] = [];
  /** Per world: elevation and azimuth nudges (degrees) to a clear patch of sky, found by clearSky. */
  nudge: number[][] = [[0, 0], [0, 0], [0, 0]];
  /**
   * Small near puffs of the world's own cumulus that would sit right across a moon's face: tucked away for the shot
   * (it starts and ends looking level, so they go and come back out of frame). Big towers that only reach the
   * lower edge of a moon stay, so the worlds still rise out of the clouds.
   */
  clearSky(clouds: THREE.InstancedMesh) {
    this.restoreSky(clouds);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    // the near cumulus as angular discs: direction, angular radius
    const puffs: { i: number; v: THREE.Vector3; ar: number }[] = [];
    for (let i = 0; i < clouds.count; i++) {
      clouds.getMatrixAt(i, m); m.decompose(p, q, sc);
      if (sc.x < 1e-3) continue;
      const v = p.clone().sub(this.origin); const d = v.length(); v.normalize();
      if (v.dot(this.up) < 0.1 || d > 1200) continue;
      puffs.push({ i, v, ar: Math.atan(sc.x / d) });
    }
    // nudge each world a little, to the clearest patch of sky near where it was meant to hang
    this.layout.forEach((L, k) => {
      const r = THREE.MathUtils.degToRad(L.size / 2);
      let best = [0, 0], bestS = Infinity;
      for (const de of [-4, 0, 4, 8]) for (const da of [-16, -8, 0, 8, 16]) {
        const c = this.skyDir(L.el + de, (L.az + da + 1) * this.flip);
        let sc2 = (Math.abs(de) + Math.abs(da)) * 0.01;
        for (const pf of puffs) { const ov = r + pf.ar - Math.acos(Math.min(1, pf.v.dot(c))); if (ov > 0) sc2 += ov; }
        // and not on top of the other worlds
        this.layout.forEach((L2, j) => {
          if (j === k) return;
          const o = this.skyDir(L2.el + this.nudge[j][0], (L2.az + this.nudge[j][1]) * this.flip);
          if (Math.acos(Math.min(1, o.dot(c))) < THREE.MathUtils.degToRad((L.size + L2.size) / 2 + 3)) sc2 += 50;
        });
        if (sc2 < bestS) { bestS = sc2; best = [de, da]; }
      }
      this.nudge[k] = best;
    });
    // then tuck away the puffs still across a world's face; a puff low at the rim stays, so it rises out of the cloud
    const hide = new Set<number>();
    this.layout.forEach((L, k) => {
      const r = THREE.MathUtils.degToRad(L.size / 2);
      const c = this.skyDir(L.el + this.nudge[k][0], (L.az + this.nudge[k][1] + 1) * this.flip);
      const elC = Math.asin(c.dot(this.up));
      for (const pf of puffs) {
        if (Math.acos(Math.min(1, pf.v.dot(c))) > r * 0.92 + pf.ar * 0.7) continue;
        const top = Math.asin(Math.min(1, pf.v.dot(this.up))) + pf.ar * 0.7;
        if (top > elC - r * 0.35) hide.add(pf.i);
      }
    });
    for (const i of hide) {
      clouds.getMatrixAt(i, m);
      this.hidden.push({ i, m: m.clone() });
      clouds.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  restoreSky(clouds: THREE.InstancedMesh) {
    if (!this.hidden.length) return;
    for (const h of this.hidden) clouds.setMatrixAt(h.i, h.m);
    this.hidden = [];
    clouds.instanceMatrix.needsUpdate = true;
  }

  /** A direction in the sky frame from elevation and azimuth in degrees. */
  skyDir(el: number, az: number, out = new THREE.Vector3()) {
    const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
    return out.copy(this.fwd).multiplyScalar(Math.cos(e) * Math.cos(a)).addScaledVector(this.right, Math.cos(e) * Math.sin(a)).addScaledVector(this.up, Math.sin(e)).normalize();
  }

  /** Where the farthest moon (the one with the home light) is, for the camera to look at. */
  homeDir(out = new THREE.Vector3()) { const k = this.layout.length - 1, L = this.layout[k]; return this.skyDir(L.el + this.nudge[k][0], (L.az + this.nudge[k][1]) * this.flip, out); }

  /**
   * Show the sky. t: seconds since the shot began; show: 0..1 overall; reveal: 0..1 how far the moons have come
   * out of the haze (nearest first); light: 0..1 the home light; veil: 0..1 clouds closing over at the end.
   */
  update(camera: THREE.Camera, t: number, show: number, reveal: number, light: number, veil = 0) {
    this.group.visible = show > 0.001 && this.baked;
    if (!this.group.visible) return;
    const camQ = camera.quaternion;
    const dir = new THREE.Vector3();
    this.moons.forEach((m, k) => {
      const L = this.layout[k];
      // a slow drift across the sky, as if the worlds turned with it
      this.skyDir(L.el + this.nudge[k][0] + Math.sin(t * 0.05 + k) * 0.3, (L.az + this.nudge[k][1] + t * 0.12) * this.flip, dir);
      const pos = this.origin.clone().addScaledVector(dir, L.dist);
      const w = 2 * L.dist * Math.tan(THREE.MathUtils.degToRad(L.size / 2)) / m.frac;
      m.disc.position.copy(pos); m.disc.quaternion.copy(camQ); m.disc.scale.set(w, w, 1);
      m.halo.position.copy(pos).addScaledVector(dir, 5); m.halo.scale.setScalar(w * m.frac * 1.38);
      const rk = smoothstep(k * 0.22, k * 0.22 + 0.5, reveal) * (1 - veil * 0.85);
      const u = (m.disc.material as THREE.ShaderMaterial).uniforms;
      u.uOpacity.value = show * rk;
      u.uHazeK.value = L.haze + (1 - rk) * 0.5;
      (m.halo.material as THREE.SpriteMaterial).opacity = show * rk * 0.55;
      if (m.light) {
        const lp = pos.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(camQ), m.light.x * w / 2).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camQ), m.light.y * w / 2);
        lp.addScaledVector(dir, -20);
        const blink = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 1.9)), 3);
        this.beacon.position.copy(lp); this.beaconGlow.position.copy(lp);
        const on = show * light * rk;
        (this.beacon.material as THREE.SpriteMaterial).opacity = on * (0.3 + 0.7 * blink);
        (this.beaconGlow.material as THREE.SpriteMaterial).opacity = on * (0.45 + 0.55 * blink);
        this.beacon.scale.setScalar(0.075 + 0.035 * blink * light);
        this.beaconGlow.scale.setScalar(0.05 + 0.03 * blink);
      }
    });
    // clouds drift slowly; at the end they rise and close over the worlds
    this.clouds.forEach(c => {
      let w: number;
      if (c.moon >= 0) {
        const L = this.layout[c.moon], n = this.nudge[c.moon];
        // el/az are in the world's own diameters below and beside its centre
        this.skyDir(L.el + n[0] + c.el * L.size + veil * L.size * 0.5, (L.az + n[1] + c.az * L.size + t * (0.12 + c.drift * 0.25)) * this.flip, dir);
        const d = L.dist * c.dist;
        c.s.position.copy(this.origin).addScaledVector(dir, d);
        w = 2 * d * Math.tan(THREE.MathUtils.degToRad(L.size / 2)) * c.w * 1.6;
        const rk = smoothstep(c.moon * 0.22, c.moon * 0.22 + 0.5, reveal);
        (c.s.material as THREE.SpriteMaterial).opacity = c.o * show * Math.max(0.35 + 0.65 * rk, veil);
      } else {
        this.skyDir(c.el + veil * 4, (c.az + t * c.drift) * this.flip, dir);
        c.s.position.copy(this.origin).addScaledVector(dir, c.dist);
        w = c.dist * c.w;
        (c.s.material as THREE.SpriteMaterial).opacity = c.o * show;
      }
      c.s.scale.set(w, w * 0.5, 1);
    });
    // the flock: crosses from right to left between the near clouds and the moons
    const bt = Math.min(1, Math.max(0, (t - 3.5) / 9));
    const bshow = show * smoothstep(0, 0.08, bt) * (1 - smoothstep(0.85, 1, bt));
    const head = this.skyDir(36 + bt * 9, 40 - bt * 70, new THREE.Vector3());
    const centre = this.origin.clone().addScaledVector(head, 120);
    this.birds.forEach(b => {
      const flap = Math.sin(t * 6.5 + b.ph);
      b.s.position.copy(centre).addScaledVector(this.right, b.off.x).addScaledVector(this.up, b.off.y).addScaledVector(this.fwd, b.off.z);
      const m = b.s.material as THREE.SpriteMaterial;
      m.map = b.frames[flap > 0.35 ? 0 : flap > -0.35 ? 1 : 2];
      m.opacity = bshow * 0.9;
      b.s.scale.set(3.4, 1.7, 1);
    });
  }
}
