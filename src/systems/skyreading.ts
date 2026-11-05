import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { dirLatLon } from '../world/sphere';

/** Skyreading: see the wind as faint flowing lines. Prevailing wind blows from the west (toward +lon). */
export class Skyreading {
  lines: THREE.LineSegments;
  private pts: { lat: number; lon: number; alt: number; life: number; speed: number }[] = [];
  active = false;
  amount = 0;
  constructor(scene: THREE.Scene, private count = 900) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    for (let i = 0; i < count; i++) this.pts.push(this.spawn());
  }
  private spawn() { return { lat: 8 + Math.random() * 150, lon: Math.random() * 360 - 180, alt: 2 + Math.random() * 10, life: Math.random() * 4, speed: 10 + Math.random() * 10 }; }

  /** Wind direction in degrees of longitude per second at a spot (with gusts). */
  windAt(p: Planet, lat: number, lon: number, t: number) {
    const n = p.noise.n3(lat * 0.05, lon * 0.05, t * 0.1);
    return { dlon: 1 + n * 0.5, dlat: n * 0.6 };
  }

  update(dt: number, p: Planet, t: number) {
    this.amount += ((this.active ? 1 : 0) - this.amount) * (1 - Math.exp(-4 * dt));
    (this.lines.material as THREE.LineBasicMaterial).opacity = this.amount;
    this.lines.visible = this.amount > 0.01;
    if (!this.lines.visible) return;
    const pos = this.lines.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.lines.geometry.attributes.color as THREE.BufferAttribute;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < this.pts.length; i++) {
      const q = this.pts[i];
      const w = this.windAt(p, q.lat, q.lon, t);
      const sinLat = Math.max(0.2, Math.sin(q.lat * Math.PI / 180));
      const step = q.speed * dt / p.R * 57.3;
      q.lon += w.dlon * step / sinLat; q.lat += w.dlat * step * 0.3;
      q.life -= dt;
      if (q.life < 0 || q.lat < 4 || q.lat > 176) Object.assign(q, this.spawn(), { life: 3 + Math.random() * 3 });
      const d1 = dirLatLon(q.lat, q.lon);
      p.surfacePoint(d1, q.alt, a);
      const d0 = dirLatLon(q.lat, q.lon - (2.2 + Math.min(1, q.life) * 2.5) / sinLat);
      p.surfacePoint(d0, q.alt, b);
      pos.setXYZ(i * 2, a.x, a.y, a.z); pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      const fade = Math.min(1, q.life) * 0.9;
      col.setXYZ(i * 2, 1, 0.72 + 0.2 * fade, 0.3); col.setXYZ(i * 2 + 1, 1, 0.9, 0.7);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}
