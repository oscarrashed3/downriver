import * as THREE from 'three';

/** Gentle falling snow (or drifting motes) around the traveler, falling toward the planet's center. */
export class Motes {
  points: THREE.Points;
  private v: THREE.Vector3[] = [];
  constructor(scene: THREE.Scene, private n = 700, color = '#ffffff', size = 0.18) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity: 0.85, depthWrite: false, alphaTest: 0.01 }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < n; i++) this.v.push(new THREE.Vector3(1e6, 0, 0));
  }
  setStyle(color: string, size: number, opacity: number) {
    const m = this.points.material as THREE.PointsMaterial; m.color.set(color); m.size = size; m.opacity = opacity;
  }
  update(dt: number, center: THREE.Vector3, around: THREE.Vector3, fall: number, rate = 1) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const count = Math.floor(this.n * rate);
    for (let i = 0; i < this.n; i++) {
      const p = this.v[i];
      if (i >= count) { p.set(1e6, 0, 0); pos.setXYZ(i, p.x, p.y, p.z); continue; }
      const toC = center.clone().sub(p).normalize();
      p.addScaledVector(toC, fall * dt);
      p.x += Math.sin(p.y * 0.3 + i) * dt * 0.4;
      if (p.distanceTo(around) > 26 || p.distanceTo(center) < center.distanceTo(around) - 2) {
        p.set((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 44, (Math.random() - 0.5) * 44).add(around);
        const up = around.clone().sub(center).normalize();
        p.addScaledVector(up, 8 + Math.random() * 10);
      }
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
  }
}

let dot: THREE.Texture | null = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(c);
  return dot;
}
