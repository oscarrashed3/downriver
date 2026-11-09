import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { WORLDS } from '../world/worlds';
import { CHAPTERS } from '../data/story';
import { smoothstep } from '../world/noise';
import { PAINT } from '../render/paint';

export interface CamPose { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 }

/** Pull the camera up past the clouds to see every world at once, the river threading them, and home below. */
export class SkyView {
  /** 0 = at the traveler, 1 = fully up in the sky. */
  k = 0;
  dir = 0;
  marker: THREE.Sprite;
  silhouettes: THREE.Mesh[] = [];
  labelEls: HTMLElement[] = [];
  hintEl: HTMLElement;
  private from: CamPose | null = null;
  private orbit = 0;
  center = new THREE.Vector3();
  constructor(scene: THREE.Scene, private planets: Planet[], private labels: HTMLElement) {
    planets.forEach(p => this.center.add(p.center));
    this.center.divideScalar(planets.length);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,220,140,0.9)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
    this.marker.scale.setScalar(0.05);
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    scene.add(this.marker);
    for (const p of planets) {
      // a world not yet visited is wrapped in its own cloud: lit on the sun side, lavender in shade, soft at the rim
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.R + p.cfg.amplitude + 14, 40, 24), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        uniforms: { opacity: { value: 0 }, uSun: PAINT.uSun },
        vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float opacity; uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          float h(vec3 p){ return fract(sin(dot(floor(p), vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main(){
            vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
            // billows: the normal nudged by a coarse lumpy pattern so it reads as a ball of cloud, not a plastic sphere
            vec3 q = vW * 0.06;
            N = normalize(N + (vec3(h(q), h(q + 3.1), h(q + 7.7)) - 0.5) * 0.35);
            float lit = dot(N, uSun) * 0.5 + 0.5;
            vec3 col = mix(vec3(0.70, 0.72, 0.90), vec3(1.0, 0.97, 0.93), smoothstep(0.25, 0.85, lit));
            float rim = smoothstep(0.0, 0.55, dot(normalize(vN), V));
            gl_FragColor = vec4(col, opacity * rim);
          }`,
      }));
      m.position.copy(p.center); m.visible = false;
      scene.add(m); this.silhouettes.push(m);
      const el = document.createElement('div'); el.className = 'wl'; el.style.display = 'none';
      labels.append(el); this.labelEls.push(el);
    }
    this.hintEl = document.createElement('div'); this.hintEl.className = 'hint'; this.hintEl.style.display = 'none';
    labels.append(this.hintEl);
  }

  get open() { return this.dir > 0 || this.k > 0; }

  skyPose(): CamPose {
    const a = 0.75 + this.orbit;
    const off = new THREE.Vector3(Math.cos(a), 0.32, Math.sin(a)).normalize().multiplyScalar(1450); // frames the four worlds (y 0 to -1020)
    return { pos: this.center.clone().add(off), look: this.center.clone().add(new THREE.Vector3(0, -60, 0)), up: new THREE.Vector3(0, 1, 0) };
  }

  enter(from: CamPose) { this.from = { pos: from.pos.clone(), look: from.look.clone(), up: from.up.clone() }; this.dir = 1; }
  exit(to?: CamPose) { if (to) this.from = { pos: to.pos.clone(), look: to.look.clone(), up: to.up.clone() }; this.dir = -1; }

  /** Returns the camera pose to use, or null when the sky view is closed. */
  update(dt: number, rigPose: CamPose, playerPos: THREE.Vector3, cur: number, visited: Set<number>, canTravel: boolean, camera: THREE.Camera): CamPose | null {
    this.k = Math.min(1, Math.max(0, this.k + this.dir * dt / 1.3));
    if (this.dir < 0) { this.from = rigPose; if (this.k <= 0) this.dir = 0; }
    this.orbit += dt * 0.02 * this.k;
    const show = this.k > 0.05;
    this.marker.visible = show;
    this.marker.position.copy(playerPos);
    this.silhouettes.forEach((m, i) => { m.visible = show && !visited.has(i); (m.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.95 * smoothstep(0.3, 0.9, this.k); });
    this.hintEl.style.display = this.k > 0.9 ? 'block' : 'none';
    this.hintEl.innerHTML = canTravel ? 'Click a world you have been to and fly back. Everything there is as you left it. <b>Tab</b> or scroll in to return.' : '<b>Tab</b> or scroll in to return to Nilo.';
    const v = new THREE.Vector3();
    this.planets.forEach((p, i) => {
      const el = this.labelEls[i];
      if (this.k < 0.85) { el.style.display = 'none'; return; }
      v.copy(p.center).add(new THREE.Vector3(0, p.R + 22, 0)).project(camera);
      el.style.display = v.z < 1 ? 'block' : 'none';
      el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      const known = visited.has(i);
      el.className = 'wl' + (known ? '' : ' unknown') + (i === cur ? ' here' : '');
      el.innerHTML = known ? `<div class="wc">${CHAPTERS[i].n}</div><div class="wn">${WORLDS[i].name}</div><div class="wg">${i === cur ? 'You are here' : 'Click to go back'}</div>` : `<div class="wn">Not yet</div>`;
    });
    if (this.k <= 0 && this.dir === 0) { this.labelEls.forEach(e => (e.style.display = 'none')); return null; }
    const s = this.skyPose();
    const f = this.from ?? rigPose;
    const e = this.k * this.k * (3 - 2 * this.k);
    const pos = f.pos.clone().lerp(s.pos, e);
    // rise first, then swing out
    pos.addScaledVector(f.up, Math.sin(e * Math.PI) * 120);
    return { pos, look: f.look.clone().lerp(s.look, smoothstep(0, 0.7, e)), up: f.up.clone().lerp(s.up, smoothstep(0.1, 0.8, e)).normalize() };
  }

  /** Which world is under the mouse (normalized device coords), if any. */
  pick(ndc: { x: number; y: number }, camera: THREE.Camera): number | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    let best: number | null = null, bd = Infinity;
    this.planets.forEach((p, i) => {
      const hit = ray.ray.intersectSphere(new THREE.Sphere(p.center, p.R + 30), new THREE.Vector3());
      if (hit) { const d = hit.distanceTo(camera.position); if (d < bd) { bd = d; best = i; } }
    });
    return best;
  }
}
